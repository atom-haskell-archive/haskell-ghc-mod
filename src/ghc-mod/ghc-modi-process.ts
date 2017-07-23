/*
 * decaffeinate suggestions:
 * DS101: Remove unnecessary use of Array.from
 * DS102: Remove unnecessary code created because of implicit returns
 * DS103: Rewrite code to no longer use __guard__
 * DS104: Avoid inline assignments
 * DS201: Simplify complex destructure assignments
 * DS205: Consider reworking code to avoid use of IIFEs
 * DS206: Consider reworking classes to avoid initClass
 * DS207: Consider shorter variations of null checks
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/master/docs/suggestions.md
 */
import { Range, Point, Emitter, CompositeDisposable, Directory } from 'atom'
import * as Util from '../util'
import { extname } from 'path'
import Queue = require('promise-queue')
import { unlit } from 'atom-haskell-utils'

import { GhcModiProcessReal, GHCModCaps } from './ghc-modi-process-real'

type Commands = 'checklint' | 'browse' | 'typeinfo' | 'find' | 'init' | 'list' | 'lowmem'

export type SymbolType = 'type' | 'class' | 'function'

export interface SymbolDesc {
  name: string,
  symbolType: SymbolType,
  typeSignature?: string,
  parent?: string
}

export class GhcModiProcess {
  private backend: Map<string, Promise<GhcModiProcessReal>>
  private disposables: CompositeDisposable
  private emitter: Emitter
  private bufferDirMap: WeakMap<AtomTypes.TextBuffer, AtomTypes.Directory>
  private commandQueues: {[K in Commands]: Queue}
  private caps: GHCModCaps

  constructor () {
    this.disposables = new CompositeDisposable()
    this.emitter = new Emitter()
    this.disposables.add(this.emitter)
    this.bufferDirMap = new WeakMap()
    this.backend = new Map()

    if (process.env.GHC_PACKAGE_PATH && !atom.config.get('haskell-ghc-mod.suppressGhcPackagePathWarning')) {
      atom.notifications.addWarning(`\
haskell-ghc-mod: You have GHC_PACKAGE_PATH environment variable set!\
`,                                  {
          dismissable: true,
          detail: `\
This configuration is not supported, and can break arbitrarily. You can try to band-aid it by adding

delete process.env.GHC_PACKAGE_PATH

to your Atom init script (Edit → Init Script...)

You can suppress this warning in haskell-ghc-mod settings.\
`
        }
      )
    }

    this.createQueues()
  }

  public async getRootDir (buffer: AtomTypes.TextBuffer): Promise<AtomTypes.Directory> {
    let dir
    dir = this.bufferDirMap.get(buffer)
    if (dir) {
      return dir
    }
    dir = await Util.getRootDir(buffer)
    this.bufferDirMap.set(buffer, dir)
    return dir
  }

  public killProcess () {
    for (const bp of this.backend.values()) {
      bp.then((b) => b.killProcess())
    }
    this.backend.clear()
  }

  public destroy () {
    for (const bp of this.backend.values()) {
      bp.then((b) => b.destroy())
    }
    this.backend.clear()
    this.emitter.emit('did-destroy')
    this.disposables.dispose()
  }

  public onDidDestroy (callback: () => void) {
    return this.emitter.on('did-destroy', callback)
  }

  public onBackendActive (callback: () => void) {
    return this.emitter.on('backend-active', callback)
  }

  public onBackendIdle (callback: () => void) {
    return this.emitter.on('backend-idle', callback)
  }

  public onQueueIdle (callback: () => void) {
    return this.emitter.on('queue-idle', callback)
  }

  public async runList (buffer: AtomTypes.TextBuffer) {
    return this.queueCmd('list', await this.getRootDir(buffer), { command: 'list' })
  }

  public async runLang (dir: AtomTypes.Directory) {
    return this.queueCmd('init', dir, { command: 'lang' })
  }

  public async runFlag (dir: AtomTypes.Directory) {
    return this.queueCmd('init', dir, { command: 'flag' })
  }

  public async runBrowse (rootDir: AtomTypes.Directory, modules: string[]): Promise<SymbolDesc[]> {
    const lines = await this.queueCmd('browse', rootDir, {
      command: 'browse',
      dashArgs (caps) {
        const args = ['-d']
        if (caps.browseParents) { args.push('-p') }
        return args
      },
      args: modules
    })
    return lines.map((s) => {
      // enumFrom :: Enum a => a -> [a] -- from:Enum
      const pattern = this.caps.browseParents ? /^(.*?) :: (.*?)(?: -- from:(.*))?$/ : /^(.*?) :: (.*)$/
      const match = s.match(pattern)
      let name, typeSignature, parent
      if (match) {
        name = match[1]
        typeSignature = match[2]
        parent = match[3]
      } else {
        name = s
      }
      let symbolType: SymbolType
      if (typeSignature && /^(?:type|data|newtype)/.test(typeSignature)) {
        symbolType = 'type'
      } else if (typeSignature && /^(?:class)/.test(typeSignature)) {
        symbolType = 'class'
      } else {
        symbolType = 'function'
      }
      return { name, typeSignature, symbolType, parent }
    })
  }

  public async getTypeInBuffer (
    buffer: AtomTypes.TextBuffer, crange: AtomTypes.Range
  )  {
    if (! buffer.getUri()) { throw new Error('No URI for buffer') }
    crange = Util.tabShiftForRange(buffer, crange)
    const lines = await this.queueCmd('typeinfo', await this.getRootDir(buffer), {
      interactive: true,
      command: 'type',
      uri: buffer.getUri(),
      text: buffer.isModified() ? buffer.getText() : undefined,
      dashArgs (caps) {
        return caps.typeConstraints ? ['-c'] : []
      },
      args: [crange.start.row + 1, crange.start.column + 1].map((v) => v.toString())
    })

    const rx = /^(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+"([^]*)"$/ // [^] basically means "anything", incl. newlines
    for (const line of lines) {
      const match = line.match(rx)
      if (!match) { continue }
      const [rowstart, colstart, rowend, colend, type] = match.slice(1)
      const range =
        Range.fromObject([
          [parseInt(rowstart, 10) - 1, parseInt(colstart, 10) - 1],
          [parseInt(rowend, 10) - 1, parseInt(colend, 10) - 1]
        ])
      if (range.isEmpty()) { continue }
      if (!range.containsRange(crange)) { continue }
      return {
        range: Util.tabUnshiftForRange(buffer, range),
        type: type.replace(/\\"/g, '"')
      }
    }
    throw new Error('No type')
  }

  public async doCaseSplit (buffer: AtomTypes.TextBuffer, crange: AtomTypes.Range) {
    if (! buffer.getUri()) { throw new Error('No URI for buffer') }
    crange = Util.tabShiftForRange(buffer, crange)
    const lines = await this.queueCmd('typeinfo', await this.getRootDir(buffer), {
      interactive: this.caps.interactiveCaseSplit,
      command: 'split',
      uri: buffer.getUri(),
      text: buffer.isModified() ? buffer.getText() : undefined,
      args: [crange.start.row + 1, crange.start.column + 1].map((v) => v.toString())
    })

    const rx = /^(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+"([^]*)"$/ // [^] basically means "anything", incl. newlines
    const res = []
    for (const line of lines) {
      const match = line.match(rx)
      if (! match) {
        Util.warn(`ghc-mod says: ${line}`)
        continue
      }
      const [rowstart, colstart, rowend, colend, text] = match.slice(1)
      res.push({
        range:
        Range.fromObject([
          [parseInt(rowstart, 10) - 1, parseInt(colstart, 10) - 1],
          [parseInt(rowend, 10) - 1, parseInt(colend, 10) - 1]
        ]),
        replacement: text
      })
    }
    return res
  }

  public async doSigFill (buffer: AtomTypes.TextBuffer, crange: AtomTypes.Range) {
    if (! buffer.getUri()) { throw new Error('No URI for buffer') }
    crange = Util.tabShiftForRange(buffer, crange)
    const lines = await this.queueCmd('typeinfo', await this.getRootDir(buffer), {
      interactive: this.caps.interactiveCaseSplit,
      command: 'sig',
      uri: buffer.getUri(),
      text: buffer.isModified() ? buffer.getText() : undefined,
      args: [crange.start.row + 1, crange.start.column + 1].map((v) => v.toString())
    })
    if (lines.length < 2) { throw new Error(`Could not understand response: ${lines.join('\n')}`) }
    const rx = /^(\d+)\s+(\d+)\s+(\d+)\s+(\d+)$/ // position rx
    const match = lines[1].match(rx)
    if (! match) { throw new Error(`Could not understand response: ${lines.join('\n')}`) }
    const [rowstart, colstart, rowend, colend] = match.slice(1)
    const range =
      Range.fromObject([
        [parseInt(rowstart, 10) - 1, parseInt(colstart, 10) - 1],
        [parseInt(rowend, 10) - 1, parseInt(colend, 10) - 1]
      ])
    return {
      type: lines[0],
      range,
      body: lines.slice(2).join('\n')
    }
  }

  public async getInfoInBuffer (editor: AtomTypes.TextEditor, crange: AtomTypes.Range) {
    const buffer = editor.getBuffer()
    if (!buffer.getUri()) { throw new Error('No URI for buffer') }
    const { symbol, range } = Util.getSymbolInRange(editor, crange)

    const lines = await this.queueCmd('typeinfo', await this.getRootDir(buffer), {
      interactive: true,
      command: 'info',
      uri: buffer.getUri(),
      text: buffer.isModified() ? buffer.getText() : undefined,
      args: [symbol]
    })

    const info = lines.join('\n')
    if ((info === 'Cannot show info') || !info) {
      throw new Error('No info')
    } else {
      return { range, info }
    }
  }

  public async findSymbolProvidersInBuffer (editor: AtomTypes.TextEditor, crange: AtomTypes.Range) {
    const buffer = editor.getBuffer()
    const { symbol } = Util.getSymbolInRange(editor, crange)

    return this.queueCmd('find', await this.getRootDir(buffer), {
      interactive: true,
      command: 'find',
      args: [symbol]
    })
  }

  public async doCheckBuffer (buffer: AtomTypes.TextBuffer, fast: boolean = false) {
    return this.doCheckOrLintBuffer('check', buffer, fast)
  }

  public async doLintBuffer (buffer: AtomTypes.TextBuffer, fast: boolean = false) {
    return this.doCheckOrLintBuffer('lint', buffer, fast)
  }

  public async doCheckAndLint (buffer: AtomTypes.TextBuffer, fast: boolean) {
    const [cr, lr] = await Promise.all([this.doCheckBuffer(buffer, fast), this.doLintBuffer(buffer, fast)])
    return cr.concat(lr)
  }

  private async initBackend (rootDir: AtomTypes.Directory): Promise<GhcModiProcessReal> {
    const rootPath = rootDir.getPath()
    const cached = this.backend.get(rootPath)
    if (cached) { return await cached }
    const newBackend = this.initBackendReal(rootDir)
    this.backend.set(rootPath, newBackend)
    return await newBackend
  }

  private async initBackendReal (rootDir: AtomTypes.Directory): Promise<GhcModiProcessReal> {
    try {
      const opts = await Util.getProcessOptions(rootDir.getPath())
      const versP = this.getVersion(opts)
      versP.then((v) => { this.checkComp(opts, v) })
      const vers = await versP

      this.caps = await this.getCaps(vers)
      const backend = new GhcModiProcessReal(this.caps, rootDir, opts)
      return backend
    } catch (err) {
      atom.notifications.addFatalError(
        `\
Haskell-ghc-mod: ghc-mod failed to launch.
It is probably missing or misconfigured. ${err.code}`,
        {
          detail: `\
${err}
PATH: ${process.env.PATH}
path: ${process.env.path}
Path: ${process.env.Path}\
`,
          stack: err.stack,
          dismissable: true
        }
      )
      throw err
    }
  }

  private createQueues () {
    this.commandQueues = {
      checklint: new Queue(2),
      browse: new Queue(atom.config.get('haskell-ghc-mod.maxBrowseProcesses')),
      typeinfo: new Queue(1),
      find: new Queue(1),
      init: new Queue(4),
      list: new Queue(1),
      lowmem: new Queue(1)
    }
    this.disposables.add(atom.config.onDidChange('haskell-ghc-mod.maxBrowseProcesses', ({newValue}) =>
      this.commandQueues.browse = new Queue(newValue as number))
    )
  }

  private async getVersion (opts: Util.ExecOpts) {
    const timeout = atom.config.get('haskell-ghc-mod.initTimeout') * 1000
    const cmd = atom.config.get('haskell-ghc-mod.ghcModPath')
    const {stdout} = await Util.execPromise(cmd, ['version'], { timeout, ...opts })
    const versRaw = /^ghc-mod version (\d+)\.(\d+)\.(\d+)(?:\.(\d+))?/.exec(stdout)
    if (!versRaw) { throw new Error("Couldn't get ghc-mod version") }
    const vers = versRaw.slice(1, 5).map((i) => parseInt(i, 10))
    const compRaw = /GHC (.+)$/.exec(stdout.trim())
    if (!compRaw) { throw new Error("Couldn't get ghc version") }
    const comp = compRaw[1]
    Util.debug(`Ghc-mod ${vers} built with ${comp}`)
    return { vers, comp }
  }

  private async checkComp (opts: Util.ExecOpts, { comp }: {comp: string}) {
    const timeout = atom.config.get('haskell-ghc-mod.initTimeout') * 1000
    const tryWarn = async (cmd: string, args: string[]) => {
      try {
        return (await Util.execPromise(cmd, args, { timeout, ...opts })).stdout.trim()
      } catch (error) {
        Util.warn(error)
      }
    }
    const [stackghc, pathghc] = await Promise.all([
      tryWarn('stack', ['ghc', '--', '--numeric-version']),
      tryWarn('ghc', ['--numeric-version']),
    ])
    Util.debug(`Stack GHC version ${stackghc}`)
    Util.debug(`Path GHC version ${pathghc}`)
    if (stackghc && (stackghc !== comp)) {
      const warn = `\
GHC version in your Stack '${stackghc}' doesn't match with \
GHC version used to build ghc-mod '${comp}'. This can lead to \
problems when using Stack projects`
      atom.notifications.addWarning(warn)
      Util.warn(warn)
    }
    if (pathghc && (pathghc !== comp)) {
      const warn = `\
GHC version in your PATH '${pathghc}' doesn't match with \
GHC version used to build ghc-mod '${comp}'. This can lead to \
problems when using Cabal or Plain projects`
      atom.notifications.addWarning(warn)
      Util.warn(warn)
    }
  }

  private getCaps ({ vers }: {vers: number[]}) {
    const caps = {
      version: vers,
      fileMap: false,
      quoteArgs: false,
      optparse: false,
      typeConstraints: false,
      browseParents: false,
      interactiveCaseSplit: false,
      importedFrom: false
    }

    const atLeast = (b: number[]) => {
      for (let i = 0; i < b.length; i++) {
        const v = b[i]
        if (vers[i] > v) {
          return true
        } else if (vers[i] < v) {
          return false
        }
      }
      return true
    }

    const exact = (b: number[]) => {
      for (let i = 0; i < b.length; i++) {
        const v = b[i]
        if (vers[i] !== v) {
          return false
        }
      }
      return true
    }

    if (!atLeast([5, 4])) {
      atom.notifications.addError(`\
Haskell-ghc-mod: ghc-mod < 5.4 is not supported. \
Use at your own risk or update your ghc-mod installation`,
                                  { dismissable: true })
    }
    if (exact([5, 4])) {
      atom.notifications.addWarning(`\
Haskell-ghc-mod: ghc-mod 5.4.* is deprecated. \
Use at your own risk or update your ghc-mod installation`,
                                    { dismissable: true })
    }
    if (atLeast([5, 4])) {
      caps.fileMap = true
    }
    if (atLeast([5, 5])) {
      caps.quoteArgs = true
      caps.optparse = true
    }
    if (atLeast([5, 6])) {
      caps.typeConstraints = true
      caps.browseParents = true
      caps.interactiveCaseSplit = true
    }
    if (atom.config.get('haskell-ghc-mod.experimental')) {
      caps.importedFrom = true
    }
    Util.debug(JSON.stringify(caps))
    return caps
  }

  private async getSettings (runDir: AtomTypes.Directory) {
    const readSettings = async (file: AtomTypes.File) => {
      try {
        const ex = await file.exists()
        if (ex) {
          const contents = await file.read()
          try {
            return JSON.parse(contents)
          } catch (err) {
            atom.notifications.addError(`Failed to parse ${file.getPath()}`, {
              detail: err,
              dismissable: true
            })
            throw err
          }
        } else {
          return {}
        }
      } catch (error) {
        if (error) { Util.warn(error) }
        return {}
      }
    }

    const localSettings = readSettings(runDir.getFile('.haskell-ghc-mod.json'))

    const [projectDir] = Array.from(atom.project.getDirectories().filter((d) => d.contains(runDir.getPath())))
    const projectSettings =
      projectDir ?
        readSettings(projectDir.getFile('.haskell-ghc-mod.json'))
        :
        Promise.resolve({})

    const configDir = new Directory(atom.getConfigDirPath())
    const globalSettings = readSettings(configDir.getFile('haskell-ghc-mod.json'))

    const [glob, prj, loc] = await Promise.all([globalSettings, projectSettings, localSettings])
    return { ...glob, ...prj, ...loc }
  }

  private async queueCmd (
    queueName: Commands,
    dir: AtomTypes.Directory,
    runArgs: {
      command: string, text?: string, uri?: string, interactive?: boolean,
      dashArgs?: string[] | ((caps: GHCModCaps) => string[]), args?: string[]
    }
  ): Promise<string[]> {
    if (atom.config.get('haskell-ghc-mod.lowMemorySystem')) {
      queueName = 'lowmem'
    }
    const backend = await this.initBackend(dir)
    const promise = this.commandQueues[queueName].add(async () => {
      this.emitter.emit('backend-active')
      try {
        const settings = await this.getSettings(dir)
        if (settings.disable) { throw new Error('Ghc-mod disabled in settings') }
        return backend.run({
          ...runArgs,
          suppressErrors: settings.suppressErrors,
          ghcOptions: settings.ghcOptions,
          ghcModOptions: settings.ghcModOptions,
        })
      } catch (err) {
          Util.warn(err)
          throw err
      }
    })
    promise.then((res) => {
      const qe = (qn: Commands) => {
        const q = this.commandQueues[qn]
        return (q.getQueueLength() + q.getPendingLength()) === 0
      }
      if (qe(queueName)) {
        this.emitter.emit('queue-idle', { queue: queueName })
        if (Object.keys(this.commandQueues).every(qe)) {
          this.emitter.emit('backend-idle')
        }
      }
    })
    return promise
  }

  private async doCheckOrLintBuffer (cmd: 'check' | 'lint', buffer: AtomTypes.TextBuffer, fast: boolean) {
    let dashArgs
    if (buffer.isEmpty()) { return [] }
    if (! buffer.getUri()) { return [] }

    // A dirty hack to make lint work with lhs
    let uri = buffer.getUri()
    const olduri = buffer.getUri()
    let text
    try {
      if ((cmd === 'lint') && (extname(uri) === '.lhs')) {
        uri = uri.slice(0, -1)
        text = await unlit(olduri, buffer.getText())
      } else if (buffer.isModified()) {
        text = buffer.getText()
      }
    } catch (error) {
      // TODO: Reject
      const m = (error as Error).message.match(/^(.*?):([0-9]+): *(.*) *$/)
      if (!m) { throw error }
      const [uri2, line, mess] = m.slice(1)
      return [{
        uri: uri2,
        position: new Point(parseInt(line, 10) - 1, 0),
        message: mess,
        severity: 'lint'
      }]
    }
    // end of dirty hack

    if (cmd === 'lint') {
      const opts: string[] = atom.config.get('haskell-ghc-mod.hlintOptions')
      dashArgs = []
      for (const opt of opts) {
        dashArgs.push('--hlintOpt', opt)
      }
    }

    const rootDir = await this.getRootDir(buffer)

    const lines = await this.queueCmd('checklint', rootDir, {
      interactive: fast,
      command: cmd,
      uri,
      text,
      dashArgs
    })

    const rx = /^(.*?):([0-9\s]+):([0-9\s]+): *(?:(Warning|Error): *)?([^]*)/
    const res = []
    for (const line of lines) {
      const match = line.match(rx)
      if (!match) {
        if (line.trim().length) { Util.warn(`ghc-mod says: ${line}`) }
        continue
      }
      const [file2, row, col, warning, message] = match.slice(1)
      if (file2 === 'Dummy' && row === '0' && col === '0') {
        if (warning === 'Error') {
          atom.notifications.addError(message)
          continue
        } else if (warning === 'Warning') {
          atom.notifications.addWarning(message)
          continue
        }
      }

      const file = uri.endsWith(file2) ? olduri : file2
      const severity =
        cmd === 'lint' ?
          'lint'
          : warning === 'Warning' ?
            'warning'
            :
            'error'
      const messPos = new Point(parseInt(row, 10) - 1, parseInt(col, 10) - 1)
      const position = Util.tabUnshiftForPoint(buffer, messPos)
      let myuri
      try {
        myuri = rootDir.getFile(rootDir.relativize(file)).getPath()
      } catch (error) {
        myuri = file
      }
      res.push({
        uri: myuri,
        position,
        message,
        severity
      })
    }
    return res
  }
}
