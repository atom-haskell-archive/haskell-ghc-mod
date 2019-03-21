import { Emitter, CompositeDisposable } from 'atom'
import { debug, warn, mkError, EOT } from '../util'
import { EOL } from 'os'
import * as CP from 'child_process'
import Queue = require('promise-queue')
import pidusage = require('pidusage')
if (!Symbol.asyncIterator) {
  Object.defineProperty(Symbol, 'asyncIterator', {
    value: Symbol.for('Symbol.asyncIterator'),
  })
}

export interface GHCModCaps {
  version: number[]
  fileMap: boolean
  quoteArgs: boolean
  optparse: boolean
  typeConstraints: boolean
  browseParents: boolean
  interactiveCaseSplit: boolean
  importedFrom: boolean
  browseMain: boolean
}

export class InteractiveProcess {
  private disposables: CompositeDisposable
  private emitter: Emitter<
    {},
    {
      'did-exit': number
    }
  >
  private proc: CP.ChildProcess
  private cwd: string
  private timer: number | undefined
  private requestQueue: Queue

  constructor(
    path: string,
    cmd: string[],
    options: { cwd: string },
    private caps: GHCModCaps,
  ) {
    this.caps = caps
    this.disposables = new CompositeDisposable()
    this.emitter = new Emitter()
    this.disposables.add(this.emitter)
    this.cwd = options.cwd
    this.requestQueue = new Queue(1, 100)

    debug(
      `Spawning new ghc-modi instance for ${options.cwd} with options = `,
      options,
    )
    this.proc = CP.spawn(path, cmd, options)
    this.proc.stdout.setEncoding('utf-8')
    this.proc.stderr.setEncoding('utf-8')
    this.proc.setMaxListeners(100)
    this.proc.stdout.setMaxListeners(100)
    this.proc.stderr.setMaxListeners(100)
    this.resetTimer()
    this.proc.once('exit', (code) => {
      this.timer && window.clearTimeout(this.timer)
      debug(`ghc-modi for ${options.cwd} ended with ${code}`)
      this.emitter.emit('did-exit', code)
      this.disposables.dispose()
    })
  }

  public onceExit(action: (code: number) => void) {
    return this.emitter.once('did-exit', action)
  }

  public async kill(): Promise<number> {
    this.proc.stdin.end()
    this.proc.kill()
    return new Promise<number>((resolve) => {
      this.proc.once('exit', (code) => resolve(code))
    })
  }

  public async interact(
    command: string,
    args: string[],
    data?: string,
  ): Promise<{ stdout: string[]; stderr: string[] }> {
    return this.requestQueue.add(async () => {
      this.proc.stdout.pause()
      this.proc.stderr.pause()

      pidusage(this.proc.pid, (err, stat) => {
        if (err) {
          warn(err)
          return
        }
        if (
          stat.memory >
          atom.config.get('haskell-ghc-mod.maxMemMegs') * 1024 * 1024
        ) {
          this.proc.kill()
        }
      })

      debug(`Started interactive action block in ${this.cwd}`)
      debug(
        `Running interactive command ${command} ${args} ${
          data ? 'with' : 'without'
        } additional data`,
      )
      let ended = false
      try {
        const isEnded = () => ended
        const stderr: string[] = []
        const stdout: string[] = []
        setImmediate(async () => {
          for await (const line of this.readgen(this.proc.stderr, isEnded)) {
            stderr.push(line)
          }
        })
        const readOutput = async () => {
          for await (const line of this.readgen(this.proc.stdout, isEnded)) {
            debug(`Got response from ghc-modi: ${line}`)
            if (line === 'OK') {
              ended = true
            } else {
              stdout.push(line)
            }
          }
          return { stdout, stderr }
        }
        const exitEvent = async () =>
          new Promise<never>((_resolve, reject) => {
            this.proc.once('exit', () => {
              warn(stdout.join('\n'))
              reject(
                mkError('GHCModInteractiveCrash', `${stdout}\n\n${stderr}`),
              )
            })
          })
        const timeoutEvent = async () =>
          new Promise<never>((_resolve, reject) => {
            const tml: number = atom.config.get(
              'haskell-ghc-mod.interactiveActionTimeout',
            )
            if (tml) {
              setTimeout(() => {
                reject(
                  mkError('InteractiveActionTimeout', `${stdout}\n\n${stderr}`),
                )
              }, tml * 1000)
            }
          })

        const args2 = this.caps.quoteArgs
          ? ['ascii-escape', command].concat(args.map((x) => `\x02${x}\x03`))
          : [command, ...args]
        debug(`Running ghc-modi command ${command}`, ...args)
        this.proc.stdin.write(
          `${args2.join(' ').replace(/(?:\r?\n|\r)/g, ' ')}${EOL}`,
        )
        if (data) {
          debug('Writing data to stdin...')
          this.proc.stdin.write(`${data}${EOT}`)
        }
        return await Promise.race([readOutput(), exitEvent(), timeoutEvent()])
      } catch (error) {
        if (error.name === 'InteractiveActionTimeout') {
          this.proc.kill()
        }
        throw error
      } finally {
        debug(`Ended interactive action block in ${this.cwd}`)
        ended = true
        this.proc.stdout.resume()
        this.proc.stderr.resume()
      }
    })
  }

  private resetTimer() {
    if (this.timer) {
      clearTimeout(this.timer)
    }
    const tml = atom.config.get('haskell-ghc-mod.interactiveInactivityTimeout')
    if (tml) {
      this.timer = window.setTimeout(() => {
        // tslint:disable-next-line: no-floating-promises
        this.kill()
      }, tml * 60 * 1000)
    }
  }

  private async waitReadable(stream: NodeJS.ReadableStream) {
    return new Promise((resolve) =>
      stream.once('readable', () => {
        resolve()
      }),
    )
  }

  private async *readgen(out: NodeJS.ReadableStream, isEnded: () => boolean) {
    let buffer = ''
    while (!isEnded()) {
      const read = out.read() as string | null
      // tslint:disable-next-line: no-null-keyword
      if (read !== null) {
        buffer += read
        if (buffer.includes(EOL)) {
          const arr = buffer.split(EOL)
          buffer = arr.pop() || ''
          yield* arr
        }
      } else {
        await this.waitReadable(out)
      }
    }
    if (buffer) {
      out.unshift(buffer)
    }
  }
}
