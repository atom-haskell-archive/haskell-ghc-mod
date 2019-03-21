import {
  Range,
  Point,
  Emitter,
  CompositeDisposable,
  TextBuffer,
  Directory,
  TextEditor,
} from 'atom'
import * as Util from '../util'
import { extname, isAbsolute } from 'path'
import Queue = require('promise-queue')
import { unlit } from 'atom-haskell-utils'
import * as CompletionBackend from 'atom-haskell-upi/completion-backend'
import * as UPI from 'atom-haskell-upi'

import {
  GhcModiProcessReal,
  GHCModCaps,
  RunArgs,
  IErrorCallbackArgs,
} from './ghc-modi-process-real'
import { createGhcModiProcessReal } from './ghc-modi-process-real-factory'
import { getSettings } from './settings'

export { IErrorCallbackArgs, RunArgs, GHCModCaps }

type Commands =
  | 'checklint'
  | 'browse'
  | 'typeinfo'
  | 'find'
  | 'init'
  | 'list'
  | 'lowmem'

export interface SymbolDesc {
  name: string
  symbolType: CompletionBackend.SymbolType
  typeSignature?: string
  parent?: string
}

export class GhcModiProcess {
  private backend: Map<string, Promise<GhcModiProcessReal>>
  private disposables: CompositeDisposable
  private emitter: Emitter<
    {
      'did-destroy': undefined
      'backend-active': undefined
      'backend-idle': undefined
    },
    {
      warning: string
      error: IErrorCallbackArgs
      'queue-idle': { queue: Commands }
    }
  >
  private bufferDirMap: WeakMap<TextBuffer, Directory>
  private commandQueues: { [K in Commands]: Queue }

  constructor(private upiPromise: Promise<UPI.IUPIInstance>) {
    this.disposables = new CompositeDisposable()
    this.emitter = new Emitter()
    this.disposables.add(this.emitter)
    this.bufferDirMap = new WeakMap()
    this.backend = new Map()

    if (
      process.env.GHC_PACKAGE_PATH &&
      !atom.config.get('haskell-ghc-mod.suppressGhcPackagePathWarning')
    ) {
      Util.warnGHCPackagePath()
    }

    this.commandQueues = {
      checklint: new Queue(2),
      browse: new Queue(atom.config.get('haskell-ghc-mod.maxBrowseProcesses')),
      typeinfo: new Queue(1),
      find: new Queue(1),
      init: new Queue(4),
      list: new Queue(1),
      lowmem: new Queue(1),
    }
    this.disposables.add(
      atom.config.onDidChange(
        'haskell-ghc-mod.maxBrowseProcesses',
        ({ newValue }) =>
          (this.commandQueues.browse = new Queue(newValue as number)),
      ),
    )
  }

  public async getRootDir(buffer: TextBuffer): Promise<Directory> {
    let dir
    dir = this.bufferDirMap.get(buffer)
    if (dir) {
      return dir
    }
    dir = await Util.getRootDir(buffer)
    this.bufferDirMap.set(buffer, dir)
    return dir
  }

  public killProcess() {
    for (const bp of this.backend.values()) {
      bp.then((b) => b.killProcess()).catch((e: Error) => {
        atom.notifications.addError('Error killing ghc-mod process', {
          detail: e.toString(),
          stack: e.stack,
          dismissable: true,
        })
      })
    }
    this.backend.clear()
  }

  public destroy() {
    for (const bp of this.backend.values()) {
      bp.then((b) => b.destroy()).catch((e: Error) => {
        atom.notifications.addError('Error killing ghc-mod process', {
          detail: e.toString(),
          stack: e.stack,
          dismissable: true,
        })
      })
    }
    this.backend.clear()
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

  public onBackendActive(callback: () => void) {
    return this.emitter.on('backend-active', callback)
  }

  public onBackendIdle(callback: () => void) {
    return this.emitter.on('backend-idle', callback)
  }

  public onQueueIdle(callback: () => void) {
    return this.emitter.on('queue-idle', callback)
  }

  public async runList(buffer: TextBuffer) {
    return this.queueCmd('list', await this.getRootDir(buffer), () => ({
      command: 'list',
    }))
  }

  public async runLang(dir: Directory) {
    return this.queueCmd('init', dir, () => ({ command: 'lang' }))
  }

  public async runFlag(dir: Directory) {
    return this.queueCmd('init', dir, () => ({ command: 'flag' }))
  }

  public async runBrowse(
    rootDir: Directory,
    modules: string[],
  ): Promise<SymbolDesc[]> {
    const lines = await this.queueCmd('browse', rootDir, (caps) => {
      const args = caps.browseMain
        ? modules
        : modules.filter((v) => v !== 'Main')
      if (args.length === 0) return undefined
      return {
        command: 'browse',
        dashArgs: caps.browseParents ? ['-d', '-o', '-p'] : ['-d', '-o'],
        args,
      }
    })
    return lines.map((s) => {
      // enumFrom :: Enum a => a -> [a] -- from:Enum
      const pattern = /^(.*?) :: (.*?)(?: -- from:(.*))?$/
      const match = s.match(pattern)
      let name: string
      let typeSignature: string | undefined
      let parent: string | undefined
      if (match) {
        name = match[1]
        typeSignature = match[2]
        parent = match[3]
      } else {
        name = s
      }
      let symbolType: CompletionBackend.SymbolType
      if (typeSignature && /^(?:type|data|newtype)/.test(typeSignature)) {
        symbolType = 'type'
      } else if (typeSignature && /^(?:class)/.test(typeSignature)) {
        symbolType = 'class'
      } else if (/^\(.*\)$/.test(name)) {
        symbolType = 'operator'
        name = name.slice(1, -1)
      } else if (Util.isUpperCase(name[0])) {
        symbolType = 'tag'
      } else {
        symbolType = 'function'
      }
      return { name, typeSignature, symbolType, parent }
    })
  }

  public async getTypeInBuffer(buffer: TextBuffer, crange: Range) {
    if (!buffer.getUri()) {
      throw new Error('No URI for buffer')
    }
    crange = Util.tabShiftForRange(buffer, crange)
    const rootDir = await this.getRootDir(buffer)
    const lines = await this.queueCmd('typeinfo', rootDir, (caps) => ({
      interactive: true,
      command: 'type',
      uri: buffer.getUri(),
      text: buffer.isModified() ? buffer.getText() : undefined,
      dashArgs: caps.typeConstraints ? ['-c'] : [],
      args: [crange.start.row + 1, crange.start.column + 1].map((v) =>
        v.toString(),
      ),
    }))

    const rx = /^(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+"([^]*)"$/ // [^] basically means "anything", incl. newlines
    for (const line of lines) {
      const match = line.match(rx)
      if (!match) {
        continue
      }
      const [rowstart, colstart, rowend, colend, type] = match.slice(1)
      const range = Range.fromObject([
        [parseInt(rowstart, 10) - 1, parseInt(colstart, 10) - 1],
        [parseInt(rowend, 10) - 1, parseInt(colend, 10) - 1],
      ])
      if (range.isEmpty()) {
        continue
      }
      if (!range.containsRange(crange)) {
        continue
      }
      return {
        range: Util.tabUnshiftForRange(buffer, range),
        type: type.replace(/\\"/g, '"'),
      }
    }
    throw new Error('No type')
  }

  public async doCaseSplit(buffer: TextBuffer, crange: Range) {
    if (!buffer.getUri()) {
      throw new Error('No URI for buffer')
    }
    crange = Util.tabShiftForRange(buffer, crange)
    const rootDir = await this.getRootDir(buffer)
    const lines = await this.queueCmd('typeinfo', rootDir, (caps) => ({
      interactive: caps.interactiveCaseSplit,
      command: 'split',
      uri: buffer.getUri(),
      text: buffer.isModified() ? buffer.getText() : undefined,
      args: [crange.start.row + 1, crange.start.column + 1].map((v) =>
        v.toString(),
      ),
    }))

    const rx = /^(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+"([^]*)"$/ // [^] basically means "anything", incl. newlines
    const res = []
    for (const line of lines) {
      const match = line.match(rx)
      if (!match) {
        Util.warn(`ghc-mod says: ${line}`)
        continue
      }
      const [rowstart, colstart, rowend, colend, text] = match.slice(1)
      res.push({
        range: Range.fromObject([
          [parseInt(rowstart, 10) - 1, parseInt(colstart, 10) - 1],
          [parseInt(rowend, 10) - 1, parseInt(colend, 10) - 1],
        ]),
        replacement: text,
      })
    }
    return res
  }

  public async doSigFill(buffer: TextBuffer, crange: Range) {
    if (!buffer.getUri()) {
      throw new Error('No URI for buffer')
    }
    crange = Util.tabShiftForRange(buffer, crange)
    const rootDir = await this.getRootDir(buffer)
    const lines = await this.queueCmd('typeinfo', rootDir, (caps) => ({
      interactive: caps.interactiveCaseSplit,
      command: 'sig',
      uri: buffer.getUri(),
      text: buffer.isModified() ? buffer.getText() : undefined,
      args: [crange.start.row + 1, crange.start.column + 1].map((v) =>
        v.toString(),
      ),
    }))
    if (lines.length < 2) {
      throw new Error(`Could not understand response: ${lines.join('\n')}`)
    }
    const rx = /^(\d+)\s+(\d+)\s+(\d+)\s+(\d+)$/ // position rx
    const match = lines[1].match(rx)
    if (!match) {
      throw new Error(`Could not understand response: ${lines.join('\n')}`)
    }
    const [rowstart, colstart, rowend, colend] = match.slice(1)
    const range = Range.fromObject([
      [parseInt(rowstart, 10) - 1, parseInt(colstart, 10) - 1],
      [parseInt(rowend, 10) - 1, parseInt(colend, 10) - 1],
    ])
    return {
      type: lines[0],
      range,
      body: lines.slice(2).join('\n'),
    }
  }

  public async getInfoInBuffer(editor: TextEditor, crange: Range) {
    const buffer = editor.getBuffer()
    if (!buffer.getUri()) {
      throw new Error('No URI for buffer')
    }
    const symInfo = Util.getSymbolInRange(editor, crange)
    if (!symInfo) {
      throw new Error("Couldn't get symbol for info")
    }
    const { symbol, range } = symInfo

    const lines = await this.queueCmd(
      'typeinfo',
      await this.getRootDir(buffer),
      () => ({
        interactive: true,
        command: 'info',
        uri: buffer.getUri(),
        text: buffer.isModified() ? buffer.getText() : undefined,
        args: [symbol],
      }),
    )

    const info = lines.join('\n')
    if (info === 'Cannot show info' || !info) {
      throw new Error('No info')
    } else {
      return { range, info }
    }
  }

  public async findSymbolProvidersInBuffer(editor: TextEditor, crange: Range) {
    const buffer = editor.getBuffer()
    const symInfo = Util.getSymbolInRange(editor, crange)
    if (!symInfo) {
      throw new Error("Couldn't get symbol for import")
    }
    const { symbol } = symInfo

    return this.queueCmd('find', await this.getRootDir(buffer), () => ({
      interactive: true,
      command: 'find',
      args: [symbol],
    }))
  }

  public async doCheckBuffer(buffer: TextBuffer, fast: boolean) {
    return this.doCheckOrLintBuffer('check', buffer, fast)
  }

  public async doLintBuffer(buffer: TextBuffer) {
    return this.doCheckOrLintBuffer('lint', buffer, false)
  }

  private async getUPI() {
    return Promise.race([this.upiPromise, Promise.resolve(undefined)])
  }

  private async initBackend(rootDir: Directory): Promise<GhcModiProcessReal> {
    const rootPath = rootDir.getPath()
    const cached = this.backend.get(rootPath)
    if (cached) {
      return cached
    }
    const backend = this.createBackend(rootDir)
    this.backend.set(rootPath, backend)
    return backend
  }

  private async createBackend(rootDir: Directory): Promise<GhcModiProcessReal> {
    const newBackend = createGhcModiProcessReal(rootDir, await this.getUPI())
    const backend = await newBackend
    this.disposables.add(
      backend.onError((arg) => this.emitter.emit('error', arg)),
      backend.onWarning((arg) => this.emitter.emit('warning', arg)),
    )
    return backend
  }

  private async queueCmd(
    queueName: Commands,
    dir: Directory,
    runArgsFunc: (
      caps: GHCModCaps,
    ) =>
      | {
          command: string
          text?: string
          uri?: string
          interactive?: boolean
          dashArgs?: string[]
          args?: string[]
        }
      | undefined,
  ): Promise<string[]> {
    if (atom.config.get('haskell-ghc-mod.lowMemorySystem')) {
      queueName = 'lowmem'
    }
    const backend = await this.initBackend(dir)
    const promise = this.commandQueues[queueName].add(async () => {
      this.emitter.emit('backend-active')
      try {
        const settings = await getSettings(dir)
        if (settings.disable) {
          throw new Error('Ghc-mod disabled in settings')
        }
        const runArgs = runArgsFunc(backend.getCaps())
        if (runArgs === undefined) return []
        const upi = await this.getUPI()
        let builder: string | undefined
        if (upi && atom.config.get('haskell-ghc-mod.builderManagement')) {
          // TODO: this is used twice, the second time in ghc-mod-process-real-factory.ts, should probably fix that
          const b = await upi.getOthersConfigParam<{ name: string }>(
            'ide-haskell-cabal',
            'builder',
          )
          if (b) builder = b.name
        }
        return backend.run({
          ...runArgs,
          builder,
          suppressErrors: settings.suppressErrors,
          ghcOptions: settings.ghcOptions,
          ghcModOptions: settings.ghcModOptions,
        })
      } catch (err) {
        Util.warn(err)
        throw err
      }
    })
    promise
      .then(() => {
        const qe = (qn: Commands) => {
          const q = this.commandQueues[qn]
          return q.getQueueLength() + q.getPendingLength() === 0
        }
        if (qe(queueName)) {
          this.emitter.emit('queue-idle', { queue: queueName })
          if (Object.keys(this.commandQueues).every(qe)) {
            this.emitter.emit('backend-idle')
          }
        }
      })
      .catch((e: Error) => {
        atom.notifications.addError('Error in GHCMod command queue', {
          detail: e.toString(),
          stack: e.stack,
          dismissable: true,
        })
      })
    return promise
  }

  private async doCheckOrLintBuffer(
    cmd: 'check' | 'lint',
    buffer: TextBuffer,
    fast: boolean,
  ) {
    let dashArgs
    if (buffer.isEmpty()) {
      return []
    }
    if (!buffer.getUri()) {
      return []
    }

    // A dirty hack to make lint work with lhs
    let uri = buffer.getUri()
    const olduri = buffer.getUri()
    let text: string | undefined
    try {
      if (cmd === 'lint' && extname(uri) === '.lhs') {
        uri = uri.slice(0, -1)
        text = await unlit(olduri, buffer.getText())
      } else if (buffer.isModified()) {
        text = buffer.getText()
      }
    } catch (error) {
      // TODO: Reject
      const m = (error as Error).message.match(/^(.*?):([0-9]+): *(.*) *$/)
      if (!m) {
        throw error
      }
      const [uri2, line, mess] = m.slice(1)
      return [
        {
          uri: uri2,
          position: new Point(parseInt(line, 10) - 1, 0),
          message: mess,
          severity: 'lint',
        },
      ]
    }
    // end of dirty hack

    // tslint:disable-next-line: totality-check
    if (cmd === 'lint') {
      const opts: string[] = atom.config.get('haskell-ghc-mod.hlintOptions')
      dashArgs = []
      for (const opt of opts) {
        dashArgs.push('--hlintOpt', opt)
      }
    }

    const rootDir = await this.getRootDir(buffer)

    const textB = text
    const dashArgsB = dashArgs
    const lines = await this.queueCmd('checklint', rootDir, () => ({
      interactive: fast,
      command: cmd,
      uri,
      text: textB,
      dashArgs: dashArgsB,
    }))

    const rx = /^(.*?):([0-9\s]+):([0-9\s]+): *(?:(Warning|Error): *)?([^]*)/
    const res = []
    for (const line of lines) {
      const match = line.match(rx)
      if (!match) {
        if (line.trim().length) {
          Util.warn(`ghc-mod says: ${line}`)
        }
        continue
      }
      const [file2, row, col, warning, message] = match.slice(1)
      if (file2 === 'Dummy' && row === '0' && col === '0') {
        if (warning === 'Error') {
          this.emitter.emit('error', {
            err: Util.mkError('GHCModStdoutError', message),
            caps: (await this.initBackend(rootDir)).getCaps(), // TODO: This is not pretty
          })
          continue
        } else if (warning === 'Warning') {
          this.emitter.emit('warning', message)
          continue
        }
      }

      const file = uri.endsWith(file2) ? olduri : file2
      const severity =
        cmd === 'lint' ? 'lint' : warning === 'Warning' ? 'warning' : 'error'
      const messPos = new Point(parseInt(row, 10) - 1, parseInt(col, 10) - 1)
      const position = Util.tabUnshiftForPoint(buffer, messPos)
      const myuri = isAbsolute(file) ? file : rootDir.getFile(file).getPath()
      res.push({
        uri: myuri,
        position,
        message,
        severity,
      })
    }
    return res
  }
}
