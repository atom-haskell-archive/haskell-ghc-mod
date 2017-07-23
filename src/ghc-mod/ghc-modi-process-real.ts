/*
 * decaffeinate suggestions:
 * DS101: Remove unnecessary use of Array.from
 * DS102: Remove unnecessary code created because of implicit returns
 * DS207: Consider shorter variations of null checks
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/master/docs/suggestions.md
 */
import { Emitter, CompositeDisposable, Directory } from 'atom'
import * as CP from 'child_process'
import {InteractiveProcess, GHCModCaps} from './interactive-process'
import * as Util from '../util'
const {debug, warn, mkError, withTempFile, EOT} = Util
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
}

export interface RunOptions {
  cwd: string
  encoding: 'utf8'
  env: { [key: string]: string | undefined }
  maxBuffer: number
}

export class GhcModiProcessReal {
  private disposables: CompositeDisposable
  private emitter: Emitter
  private ghcModOptions: string[]
  private proc: InteractiveProcess | undefined

  constructor (private caps: GHCModCaps, private rootDir: AtomTypes.Directory, private options: RunOptions) {
    this.disposables = new CompositeDisposable()
    this.emitter = new Emitter()
    this.disposables.add(this.emitter)
  }

  public async run (
    {interactive, command, text, uri, dashArgs, args, suppressErrors, ghcOptions, ghcModOptions}: RunArgs
  ) {
    if (! args) { args = [] }
    if (! dashArgs) { dashArgs = [] }
    if (! suppressErrors) { suppressErrors = false }
    if (! ghcOptions) { ghcOptions = [] }
    if (! ghcModOptions) { ghcModOptions = [] }
    ghcModOptions = ghcModOptions.concat(...ghcOptions.map((opt) => ['--ghc-option', opt]))
    if (atom.config.get('haskell-ghc-mod.lowMemorySystem')) {
      interactive = atom.config.get('haskell-ghc-mod.enableGhcModi')
    }
    if (this.caps.optparse) {
      args = dashArgs.concat(['--']).concat(args)
    } else {
      args = dashArgs.concat(args)
    }
    const fun = interactive ? this.runModiCmd.bind(this) : this.runModCmd.bind(this)
    try {
      let res
      if (uri && text && !this.caps.fileMap) {
        const myOpts = {ghcModOptions, command, args}
        res = withTempFile(text, uri, async (tempuri) => {
          const {stdout, stderr} = await fun({...myOpts,  uri: tempuri})
          return {
            stdout: stdout.map((line) => line.split(tempuri).join(uri)),
            stderr: stderr.map((line) => line.split(tempuri).join(uri))
          }
        })
      } else {
        res = fun({ghcModOptions, command, text, uri, args})
      }
      const {stdout, stderr} = await res
      if (stderr.join('').length) {
        atom.notifications.addWarning('ghc-mod warning', {
          detail: stderr.join('\n')
        })
      }
      return stdout.map((line) => line.replace(/\0/g, '\n'))
    } catch (err) {
      debug(err)
      if (err.name === 'InteractiveActionTimeout') {
        atom.notifications.addError(
          `\
Haskell-ghc-mod: ghc-mod \
${interactive ? 'interactive ' : ''}command ${command} \
timed out. You can try to fix it by raising 'Interactive Action \
Timeout' setting in haskell-ghc-mod settings.`,
          {
            detail: `\
caps: ${JSON.stringify(this.caps)}
URI: ${uri}
Args: ${command} ${dashArgs} -- ${args}
message: ${err.message}\
`,
            stack: err.stack,
            dismissable: true
          }
        )
      } else if (!suppressErrors) {
        atom.notifications.addFatalError(
          `\
Haskell-ghc-mod: ghc-mod \
${interactive ? 'interactive ' : ''}command ${command} \
failed with error ${err.name}`,
          {
            detail: `\
caps: ${JSON.stringify(this.caps)}
URI: ${uri}
Args: ${args}
message: ${err.message}
log:
${Util.getDebugLog()}\
`,
            stack: err.stack,
            dismissable: true
          }
        )
      } else {
        // tslint:disable-next-line: no-console
        console.error(err)
      }
      return []
    }
  }

  public killProcess () {
    debug(`Killing ghc-modi process for ${this.rootDir.getPath()}`)
    this.proc && this.proc.kill()
  }

  public destroy () {
    debug('GhcModiProcessBase destroying')
    this.killProcess()
    this.emitter.emit('did-destroy')
    this.disposables.dispose()
  }

  public onDidDestroy (callback: () => void) {
    this.emitter.on('did-destroy', callback)
  }

  private async spawnProcess (ghcModOptions: string[]): Promise<InteractiveProcess | undefined> {
    if (!atom.config.get('haskell-ghc-mod.enableGhcModi')) { return }
    debug(`Checking for ghc-modi in ${this.rootDir.getPath()}`)
    if (this.proc) {
      if (!_.isEqual(this.ghcModOptions, ghcModOptions)) {
        debug(`Found running ghc-modi instance for ${this.rootDir.getPath()}, but ghcModOptions don't match. Old: `,
              this.ghcModOptions, ' new: ', ghcModOptions)
        await this.proc.kill()
        return this.spawnProcess(ghcModOptions)
      }
      debug(`Found running ghc-modi instance for ${this.rootDir.getPath()}`)
      return this.proc
    }
    debug(`Spawning new ghc-modi instance for ${this.rootDir.getPath()} with`, this.options)
    const modPath = atom.config.get('haskell-ghc-mod.ghcModPath')
    this.ghcModOptions = ghcModOptions
    this.proc = new InteractiveProcess(modPath, ghcModOptions.concat(['legacy-interactive']), this.options, this.caps)
    this.proc.onceExit((code) => {
      debug(`ghc-modi for ${this.rootDir.getPath()} ended with ${code}`)
      return this.proc = undefined
    })
    return this.proc
  }

  private async runModCmd (
    {
      ghcModOptions, command, text, uri, args
    }: {ghcModOptions: string[], command: string, text?: string, uri?: string, args: string[]}
  ) {
    const modPath = atom.config.get('haskell-ghc-mod.ghcModPath')
    const result = []
    const err = []
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
    const {stdout, stderr} = await Util.execPromise(modPath, cmd, this.options, stdin)
    return  {
      stdout: stdout.split('\n').slice(0, -1),
      stderr: stderr.split('\n')
    }
  }

  private async runModiCmd (
    o: {ghcModOptions: string[], command: string, text?: string, uri?: string, args: string[]}
  ) {
    const {ghcModOptions, command, text, args} = o
    let {uri} = o
    debug(`Trying to run ghc-modi in ${this.rootDir.getPath()}`)
    const proc = await this.spawnProcess(ghcModOptions)
    if (!proc) {
      debug('Failed. Falling back to ghc-mod')
      return this.runModCmd(o)
    }
    debug('Success. Resuming...')
    if (uri && !this.caps.quoteArgs) { uri = this.rootDir.relativize(uri) }
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
