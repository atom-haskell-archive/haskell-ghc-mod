import { Directory, Emitter, CompositeDisposable } from 'atom'
import { InteractiveProcess, GHCModCaps } from './interactive-process'
import * as Util from '../util'
const { debug, withTempFile, EOT } = Util
import { EOL } from 'os'
import * as _ from 'underscore'

export { GHCModCaps }

export interface RunArgs {
  interactive?: boolean
  command: string
  text?: string
  uri?: string
  dashArgs?: string[]
  args?: string[]
  suppressErrors?: boolean
  ghcOptions?: string[]
  ghcModOptions?: string[]
  builder: string | undefined
}

export interface RunOptions {
  cwd: string
  encoding: 'utf8'
  env: { [key: string]: string | undefined }
  maxBuffer: number
}

export interface IErrorCallbackArgs {
  runArgs?: RunArgs
  err: Error
  caps: GHCModCaps
}

export class GhcModiProcessReal {
  private disposables: CompositeDisposable
  private emitter: Emitter<
    {
      'did-destroy': void
    },
    {
      warning: string
      error: IErrorCallbackArgs
    }
  >
  private ghcModOptions: string[] | undefined
  private proc: InteractiveProcess | undefined

  constructor(
    private caps: GHCModCaps,
    private rootDir: Directory,
    private options: RunOptions,
  ) {
    this.disposables = new CompositeDisposable()
    this.emitter = new Emitter()
    this.disposables.add(this.emitter)
  }

  public getCaps(): GHCModCaps {
    return this.caps
  }

  public async run(runArgs: RunArgs) {
    let {
      interactive,
      dashArgs,
      args,
      suppressErrors,
      ghcOptions,
      ghcModOptions,
    } = runArgs
    const { command, text, uri, builder } = runArgs
    if (!args) {
      args = []
    }
    if (!dashArgs) {
      dashArgs = []
    }
    if (!suppressErrors) {
      suppressErrors = false
    }
    if (!ghcOptions) {
      ghcOptions = []
    }
    if (!ghcModOptions) {
      ghcModOptions = []
    }
    ghcModOptions = ghcModOptions.concat(
      ...ghcOptions.map((opt) => ['--ghc-option', opt]),
    )
    if (atom.config.get('haskell-ghc-mod.lowMemorySystem')) {
      interactive = atom.config.get('haskell-ghc-mod.enableGhcModi')
    }
    if (builder) {
      switch (builder) {
        case 'cabal':
          // in case this looks wrong, remember, we want to disable stack
          // and use cabal, so we're setting stack path to emptystring
          ghcModOptions.push('--with-stack', '')
          break
        case 'stack':
          // same, if this looks strange, it's not
          ghcModOptions.push('--with-cabal', '')
          break
        case 'none':
          // here we want to use neither?
          ghcModOptions.push('--with-stack', '')
          ghcModOptions.push('--with-cabal', '')
          break
        default:
          atom.notifications.addWarning(
            `Haskell-ghc-mod: unknown builder ${builder}, falling back to autodetection`,
          )
      }
    }
    if (this.caps.optparse) {
      args = dashArgs.concat(['--']).concat(args)
    } else {
      args = dashArgs.concat(args)
    }
    const fun = interactive ? this.runModiCmd : this.runModCmd
    try {
      let res
      if (uri && text && !this.caps.fileMap) {
        const myOpts = { ghcModOptions, command, args }
        res = withTempFile(text, uri, async (tempuri) => {
          const { stdout, stderr } = await fun({ ...myOpts, uri: tempuri })
          return {
            stdout: stdout.map((line) => line.split(tempuri).join(uri)),
            stderr: stderr.map((line) => line.split(tempuri).join(uri)),
          }
        })
      } else {
        res = fun({ ghcModOptions, command, text, uri, args })
      }
      const { stdout, stderr } = await res
      if (stderr.join('').length) {
        this.emitter.emit('warning', stderr.join('\n'))
      }
      return stdout.map((line) => line.replace(/\0/g, '\n'))
    } catch (err) {
      debug(err)
      this.emitter.emit('error', { runArgs, err, caps: this.caps })
      return []
    }
  }

  public killProcess() {
    debug(`Killing ghc-modi process for ${this.rootDir.getPath()}`)
    this.proc && this.proc.kill()
  }

  public destroy() {
    debug('GhcModiProcessBase destroying')
    this.killProcess()
    this.emitter.emit('did-destroy')
    this.disposables.dispose()
  }

  public onDidDestroy(callback: () => void) {
    return this.emitter.on('did-destroy', callback)
  }

  public onWarning(callback: (warning: string) => void) {
    return this.emitter.on('warning', callback)
  }

  public onError(callback: (error: IErrorCallbackArgs) => void) {
    return this.emitter.on('error', callback)
  }

  private async spawnProcess(
    ghcModOptions: string[],
  ): Promise<InteractiveProcess | undefined> {
    if (!atom.config.get('haskell-ghc-mod.enableGhcModi')) {
      return undefined
    }
    debug(`Checking for ghc-modi in ${this.rootDir.getPath()}`)
    if (this.proc) {
      if (!_.isEqual(this.ghcModOptions, ghcModOptions)) {
        debug(
          `Found running ghc-modi instance for ${this.rootDir.getPath()}, but ghcModOptions don't match. Old: `,
          this.ghcModOptions,
          ' new: ',
          ghcModOptions,
        )
        await this.proc.kill()
        return this.spawnProcess(ghcModOptions)
      }
      debug(`Found running ghc-modi instance for ${this.rootDir.getPath()}`)
      return this.proc
    }
    debug(
      `Spawning new ghc-modi instance for ${this.rootDir.getPath()} with`,
      this.options,
    )
    const modPath = atom.config.get('haskell-ghc-mod.ghcModPath')
    this.ghcModOptions = ghcModOptions
    this.proc = new InteractiveProcess(
      modPath,
      ghcModOptions.concat(['legacy-interactive']),
      this.options,
      this.caps,
    )
    this.proc.onceExit((code) => {
      debug(`ghc-modi for ${this.rootDir.getPath()} ended with ${code}`)
      this.proc = undefined
    })
    return this.proc
  }

  private runModCmd = async ({
    ghcModOptions,
    command,
    text,
    uri,
    args,
  }: {
    ghcModOptions: string[]
    command: string
    text?: string
    uri?: string
    args: string[]
  }) => {
    const modPath = atom.config.get('haskell-ghc-mod.ghcModPath')
    let stdin
    const cmd = [...ghcModOptions]
    if (text && uri) {
      cmd.push('--map-file', uri)
      stdin = `${text}${EOT}`
    }
    cmd.push(command)
    if (uri) {
      cmd.push(uri)
    }
    cmd.push(...args)
    const { stdout, stderr } = await Util.execPromise(
      modPath,
      cmd,
      this.options,
      stdin,
    )
    return {
      stdout: stdout.split(EOL).slice(0, -1),
      stderr: stderr.split(EOL),
    }
  }

  private runModiCmd = async (o: {
    ghcModOptions: string[]
    command: string
    text?: string
    uri?: string
    args: string[]
  }) => {
    const { ghcModOptions, command, text, args } = o
    let { uri } = o
    debug(`Trying to run ghc-modi in ${this.rootDir.getPath()}`)
    const proc = await this.spawnProcess(ghcModOptions)
    if (!proc) {
      debug('Failed. Falling back to ghc-mod')
      return this.runModCmd(o)
    }
    debug('Success. Resuming...')
    if (uri && !this.caps.quoteArgs) {
      uri = this.rootDir.relativize(uri)
    }
    try {
      if (uri && text) {
        await proc.interact('map-file', [uri], text)
      }
      const res = await proc.interact(command, uri ? [uri].concat(args) : args)
      if (uri && text) {
        await proc.interact('unmap-file', [uri])
      }
      return res
    } finally {
      if (uri && text) {
        await proc.interact('unmap-file', [uri])
      }
    }
  }
}
