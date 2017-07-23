/*
 * decaffeinate suggestions:
 * DS101: Remove unnecessary use of Array.from
 * DS102: Remove unnecessary code created because of implicit returns
 * DS103: Rewrite code to no longer use __guard__
 * DS104: Avoid inline assignments
 * DS205: Consider reworking code to avoid use of IIFEs
 * DS206: Consider reworking classes to avoid initClass
 * DS207: Consider shorter variations of null checks
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/master/docs/suggestions.md
 */
import * as FZ from 'fuzzaldrin'
import { Disposable, Range } from 'atom'
import {BufferInfo} from './buffer-info'
import {ModuleInfo} from './module-info'
import {GhcModiProcess, SymbolType} from '../ghc-mod/ghc-modi-process'
import * as Util from '../util'

export class CompletionBackend {
  private bufferMap: WeakMap<AtomTypes.TextBuffer, BufferInfo>
  private dirMap: WeakMap<AtomTypes.Directory, Map<string, ModuleInfo>>
  private modListMap: WeakMap<AtomTypes.Directory, string[]>
  private languagePragmas: WeakMap<AtomTypes.Directory, string[]>
  private compilerOptions: WeakMap<AtomTypes.Directory, string[]>
  private isActive: boolean

  constructor (private process: GhcModiProcess) {
    this.bufferMap = new WeakMap() // buffer => BufferInfo
    this.dirMap = new WeakMap() // dir => Map ModuleName ModuleInfo
    this.modListMap = new WeakMap() // dir => [ModuleName]
    this.languagePragmas = new WeakMap() // dir => pragmas
    this.compilerOptions = new WeakMap() // dir => options

    // compatibility with old clients
    this.name = this.name.bind(this)
    this.onDidDestroy = this.onDidDestroy.bind(this)
    this.registerCompletionBuffer = this.registerCompletionBuffer.bind(this)
    this.unregisterCompletionBuffer = this.unregisterCompletionBuffer.bind(this)
    this.getCompletionsForSymbol = this.getCompletionsForSymbol.bind(this)
    this.getCompletionsForType = this.getCompletionsForType.bind(this)
    this.getCompletionsForClass = this.getCompletionsForClass.bind(this)
    this.getCompletionsForModule = this.getCompletionsForModule.bind(this)
    this.getCompletionsForSymbolInModule = this.getCompletionsForSymbolInModule.bind(this)
    this.getCompletionsForLanguagePragmas = this.getCompletionsForLanguagePragmas.bind(this)
    this.getCompletionsForCompilerOptions = this.getCompletionsForCompilerOptions.bind(this)
    this.getCompletionsForHole = this.getCompletionsForHole.bind(this)

    this.process = process
    this.isActive = true
    this.process.onDidDestroy(() => { this.isActive = false })
  }

  /* Public interface below */

  /*
  name()
  Get backend name

  Returns String, unique string describing a given backend
  */
  public name () { return 'haskell-ghc-mod' }

  /*
  onDidDestroy(callback)
  Destruction event subscription. Usually should be called only on
  package deactivation.
  callback: () ->
  */
  public onDidDestroy (callback: () => void) {
    if (this.isActive) { return this.process.onDidDestroy(callback) }
  }

  /*
  registerCompletionBuffer(buffer)
  Every buffer that would be used with autocompletion functions has to
  be registered with this function.

  buffer: TextBuffer, buffer to be used in autocompletion

  Returns: Disposable, which will remove buffer from autocompletion
  */
  public registerCompletionBuffer (buffer: AtomTypes.TextBuffer) {
    if (this.bufferMap.has(buffer)) {
      return new Disposable(() => { /* void */ })
    }

    const { bufferInfo } = this.getBufferInfo({ buffer })
    setImmediate(async () => {
      const { rootDir, moduleMap } = await this.getModuleMap({ bufferInfo })

      this.getModuleInfo({ bufferInfo, rootDir, moduleMap })

      return bufferInfo.getImports()
        .then((imports) =>
          imports.forEach(async ({ name }) =>
            this.getModuleInfo({ moduleName: name, bufferInfo, rootDir, moduleMap })))
    })

    return new Disposable(() =>
      this.unregisterCompletionBuffer(buffer))
  }

  /*
  unregisterCompletionBuffer(buffer)
  buffer: TextBuffer, buffer to be removed from autocompletion
  */
  public unregisterCompletionBuffer (buffer: AtomTypes.TextBuffer) {
    const x = this.bufferMap.get(buffer)
    if (x) {
      x.destroy()
    }
  }

  /*
  getCompletionsForSymbol(buffer,prefix,position)
  buffer: TextBuffer, current buffer
  prefix: String, completion prefix
  position: Point, current cursor position

  Returns: Promise([symbol])
  symbol: Object, a completion symbol
    name: String, symbol name
    qname: String, qualified name, if module is qualified.
           Otherwise, same as name
    typeSignature: String, type signature
    symbolType: String, one of ['type', 'class', 'function']
    module: Object, symbol module information
      qualified: Boolean, true if module is imported as qualified
      name: String, module name
      alias: String, module alias
      hiding: Boolean, true if module is imported with hiding clause
      importList: [String], array of explicit imports/hidden imports
  */
  public async getCompletionsForSymbol (buffer: AtomTypes.TextBuffer, prefix: string, position: AtomTypes.Point) {
    if (!this.isActive) { throw new Error('Backend inactive') }

    const symbols = await this.getSymbolsForBuffer(buffer)
    return this.filter(symbols, prefix, ['qname', 'qparent'])
  }

  /*
  getCompletionsForType(buffer,prefix,position)
  buffer: TextBuffer, current buffer
  prefix: String, completion prefix
  position: Point, current cursor position

  Returns: Promise([symbol])
  symbol: Same as getCompletionsForSymbol, except
          symbolType is one of ['type', 'class']
  */
  public async getCompletionsForType (buffer: AtomTypes.TextBuffer, prefix: string, position: AtomTypes.Point) {
    if (!this.isActive) { throw new Error('Backend inactive') }

    const symbols = await this.getSymbolsForBuffer(buffer, ['type', 'class'])
    return FZ.filter(symbols, prefix, {key: 'qname'})
  }

  /*
  getCompletionsForClass(buffer,prefix,position)
  buffer: TextBuffer, current buffer
  prefix: String, completion prefix
  position: Point, current cursor position

  Returns: Promise([symbol])
  symbol: Same as getCompletionsForSymbol, except
          symbolType is one of ['class']
  */
  public async getCompletionsForClass (buffer: AtomTypes.TextBuffer, prefix: string, position: AtomTypes.Point) {
    if (!this.isActive) { throw new Error('Backend inactive') }

    const symbols = await this.getSymbolsForBuffer(buffer, ['class'])
    return FZ.filter(symbols, prefix, {key: 'qname'})
  }

  /*
  getCompletionsForModule(buffer,prefix,position)
  buffer: TextBuffer, current buffer
  prefix: String, completion prefix
  position: Point, current cursor position

  Returns: Promise([module])
  module: String, module name
  */
  public async getCompletionsForModule (buffer: AtomTypes.TextBuffer, prefix: string, position: AtomTypes.Point) {
    if (!this.isActive) { throw new Error('Backend inactive') }
    const rootDir = await this.process.getRootDir(buffer)
    let modules = this.modListMap.get(rootDir)
    if (! modules) {
      modules = await this.process.runList(buffer)
      this.modListMap.set(rootDir, modules)
      // refresh every minute
      setTimeout((() => this.modListMap.delete(rootDir)), 60 * 1000)
    }
    return FZ.filter(modules, prefix)
  }

  /*
  getCompletionsForSymbolInModule(buffer,prefix,position,{module})
  Used in import hiding/list completions

  buffer: TextBuffer, current buffer
  prefix: String, completion prefix
  position: Point, current cursor position
  module: String, module name (optional). If undefined, function
          will attempt to infer module name from position and buffer.

  Returns: Promise([symbol])
  symbol: Object, symbol in given module
    name: String, symbol name
    typeSignature: String, type signature
    symbolType: String, one of ['type', 'class', 'function']
  */
  public async getCompletionsForSymbolInModule (
    buffer: AtomTypes.TextBuffer, prefix: string, position: AtomTypes.Point,
    opts?: {module: string}
  ) {
    if (!this.isActive) { throw new Error('Backend inactive') }
    let moduleName = opts ? opts.module : undefined
    if (!moduleName) {
      const lineRange = new Range([0, position.row], position)
      buffer.backwardsScanInRange(/^import\s+([\w.]+)/,
                                  lineRange, ({match}) => moduleName = match[1])
    }

    const {bufferInfo} = this.getBufferInfo({buffer})
    const mis = await this.getModuleInfo({bufferInfo, moduleName})

    // tslint:disable: no-null-keyword
    const symbols = mis.moduleInfo.select(
      {
        qualified: false,
        hiding: false,
        name: moduleName || mis.moduleName,
        importList: null,
        alias: null
      },
      undefined,
      true
    )
    // tslint:enable: no-null-keyword
    return FZ.filter(symbols, prefix, {key: 'name'})
  }

  /*
  getCompletionsForLanguagePragmas(buffer,prefix,position)
  buffer: TextBuffer, current buffer
  prefix: String, completion prefix
  position: Point, current cursor position

  Returns: Promise([pragma])
  pragma: String, language option
  */
  public async getCompletionsForLanguagePragmas (
    buffer: AtomTypes.TextBuffer, prefix: string, position: AtomTypes.Point
  ) {
    if (!this.isActive) { throw new Error('Backend inactive') }

    const dir = await this.process.getRootDir(buffer)

    let ps = this.languagePragmas.get(dir)
    if (! ps) {
      ps = await this.process.runLang(dir)
      ps && this.languagePragmas.set(dir, ps)
    }
    return FZ.filter(ps, prefix)
  }

  /*
  getCompletionsForCompilerOptions(buffer,prefix,position)
  buffer: TextBuffer, current buffer
  prefix: String, completion prefix
  position: Point, current cursor position

  Returns: Promise([ghcopt])
  ghcopt: String, compiler option (starts with '-f')
  */
  public async getCompletionsForCompilerOptions (
    buffer: AtomTypes.TextBuffer, prefix: string, position: AtomTypes.Point
  ) {
    if (!this.isActive) { throw new Error('Backend inactive') }

    const dir = await this.process.getRootDir(buffer)

    let co = this.compilerOptions.get(dir)
    if (! co) {
      co = await this.process.runFlag(dir)
      this.compilerOptions.set(dir, co)
    }
    return FZ.filter(co, prefix)
  }

  /*
  getCompletionsForHole(buffer,prefix,position)
  Get completions based on expression type.
  It is assumed that `prefix` starts with '_'

  buffer: TextBuffer, current buffer
  prefix: String, completion prefix
  position: Point, current cursor position

  Returns: Promise([symbol])
  symbol: Same as getCompletionsForSymbol
  */
  public async getCompletionsForHole (buffer: AtomTypes.TextBuffer, prefix: string, position: AtomTypes.Point) {
    if (!this.isActive) { throw new Error('Backend inactive') }
    const range = new Range(position, position)
    if (prefix.startsWith('_')) { prefix = prefix.slice(1) }
    const {type} = await this.process.getTypeInBuffer(buffer, range)
    const symbols = await this.getSymbolsForBuffer(buffer)
    const ts = symbols.filter((s) => {
      if (! s.typeSignature) { return false }
      const tl = s.typeSignature.split(' -> ').slice(-1)[0]
      if (tl.match(/^[a-z]$/)) { return false }
      const ts2 = tl.replace(/[.?*+^$[\]\\(){}|-]/g, '\\$&')
      const rx = RegExp(ts2.replace(/\b[a-z]\b/g, '.+'), '')
      return rx.test(type)
    })
    if (prefix.length === 0) {
      // tslint:disable-next-line: no-non-null-assertion
      return ts.sort((a, b) => FZ.score(b.typeSignature!, type) - FZ.score(a.typeSignature!, type))
    } else {
      return FZ.filter(ts, prefix, {key: 'qname'})
    }
  }

  private async getSymbolsForBuffer (buffer: AtomTypes.TextBuffer, symbolTypes?: SymbolType[]) {
    const {bufferInfo} = this.getBufferInfo({buffer})
    const {rootDir, moduleMap} = await this.getModuleMap({bufferInfo})
    if (bufferInfo && moduleMap) {
      const imports = await bufferInfo.getImports()
      const promises = await Promise.all(
        imports.map(async (imp) => {
          const res = await this.getModuleInfo({
            bufferInfo,
            moduleName: imp.name,
            rootDir,
            moduleMap
          })
          if (!res) { return [] }
          return res.moduleInfo.select(imp, symbolTypes)
        })
      )
      return ([] as typeof promises[0]).concat(...promises)
    } else {
      return []
    }
  }

  private getBufferInfo ({buffer}: {buffer: AtomTypes.TextBuffer}): {bufferInfo: BufferInfo} {
    let bi = this.bufferMap.get(buffer)
    if (! bi) {
      bi = new BufferInfo(buffer)
      this.bufferMap.set(buffer, bi)
    }
    return {bufferInfo: bi}
  }

  private async getModuleMap (
    {bufferInfo, rootDir}: {bufferInfo: BufferInfo, rootDir?: AtomTypes.Directory}
  ): Promise<{rootDir: AtomTypes.Directory, moduleMap: Map<string, ModuleInfo>}> {
    if (! rootDir) {
      rootDir = await this.process.getRootDir(bufferInfo.buffer)
    }
    let mm = this.dirMap.get(rootDir)
    if (!mm) {
      mm = new Map()
      this.dirMap.set(rootDir, mm)
    }

    return {
      rootDir,
      moduleMap: mm
    }
  }

  private async getModuleInfo (
    arg: {
      bufferInfo: BufferInfo, moduleName?: string,
      rootDir?: AtomTypes.Directory, moduleMap?: Map<string, ModuleInfo>
    }
  ) {
    const {bufferInfo} = arg
    let dat
    if (arg.rootDir && arg.moduleMap) {
      dat = {rootDir: arg.rootDir, moduleMap: arg.moduleMap}
    } else {
      dat = await this.getModuleMap({bufferInfo})
    }
    const {moduleMap, rootDir} = dat
    let moduleName = arg.moduleName
    if (!moduleName) {
      moduleName = await bufferInfo.getModuleName()
    }
    if (!moduleName) {
      throw new Error(`Nameless module in ${bufferInfo.buffer.getUri()}`)
    }

    let moduleInfo = moduleMap.get(moduleName)
    if (!moduleInfo) {
      moduleInfo = new ModuleInfo(moduleName, this.process, rootDir)
      moduleMap.set(moduleName, moduleInfo)

      if (bufferInfo) {
        moduleInfo.setBuffer(bufferInfo, rootDir)
      } else {
        for (const editor of atom.workspace.getTextEditors()) {
          const bis = this.getBufferInfo({buffer: editor.getBuffer()})
          moduleInfo.setBuffer(bis.bufferInfo, rootDir)
        }
      }

      const mn = moduleName
      moduleInfo.onDidDestroy(() => {
        moduleMap.delete(mn)
        return Util.debug(`${moduleName} removed from map`)
      })
      await moduleInfo.initialUpdatePromise
    }
    return {bufferInfo, rootDir, moduleMap, moduleInfo, moduleName}
  }

  private filter<T, K extends keyof T> (candidates: T[], prefix: string, keys: K[]): T[] {
    if (!prefix) {
      return candidates
    }
    const list = []
    for (const candidate of candidates) {
      const scores = keys.map((key) => {
        const ck = candidate[key]
        if (ck) {
          return FZ.score(ck.toString(), prefix)
        } else {
          return 0
        }
      })
      const score = Math.max(...scores)
      if (score > 0) {
        list.push({
          score,
          scoreN: scores.indexOf(score),
          data: candidate
        })
      }
    }
    return list.sort((a, b) => {
        const s = b.score - a.score
        if (s === 0) {
          return a.scoreN - b.scoreN
        }
        return s
      }).map(({data}) => data)
  }
}
