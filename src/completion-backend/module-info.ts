import { CompositeDisposable, Emitter, TextBuffer, Directory } from 'atom'
import * as Util from '../util'
import { GhcModiProcess, SymbolDesc } from '../ghc-mod'
import { BufferInfo, IImport } from './buffer-info'
import * as CompletionBackend from 'atom-haskell-upi/completion-backend'

import SymbolType = CompletionBackend.SymbolType

export class ModuleInfo {
  private readonly disposables: CompositeDisposable
  private readonly emitter: Emitter<{
    'did-destroy': undefined
  }>
  private readonly invalidateInterval = 30 * 60 * 1000 // if module unused for 30 minutes, remove it
  private readonly bufferSet: WeakSet<TextBuffer>
  private timeout: NodeJS.Timer
  private updatePromise: Promise<void>
  private symbols: SymbolDesc[] // module symbols

  constructor(
    private readonly name: string,
    private readonly process: GhcModiProcess,
    private readonly rootDir: Directory,
  ) {
    Util.debug(`${this.name} created`)
    this.symbols = []
    this.disposables = new CompositeDisposable()
    this.bufferSet = new WeakSet()
    this.emitter = new Emitter()
    this.disposables.add(this.emitter)
    this.updatePromise = this.update(rootDir)
    this.timeout = setTimeout(this.destroy, this.invalidateInterval)
    this.disposables.add(this.process.onDidDestroy(this.destroy))
  }

  public destroy = () => {
    Util.debug(`${this.name} destroyed`)
    clearTimeout(this.timeout)
    this.emitter.emit('did-destroy')
    this.disposables.dispose()
  }

  public onDidDestroy(callback: () => void) {
    return this.emitter.on('did-destroy', callback)
  }

  public async setBuffer(bufferInfo: BufferInfo) {
    const name = await bufferInfo.getModuleName()
    if (name !== this.name) {
      return
    }
    if (this.bufferSet.has(bufferInfo.buffer)) {
      return
    }
    this.bufferSet.add(bufferInfo.buffer)
    Util.debug(`${this.name} buffer is set`)
    const disposables = new CompositeDisposable()
    disposables.add(
      bufferInfo.buffer.onDidSave(() => {
        Util.debug(`${this.name} did-save triggered`)
        this.updatePromise = this.update(this.rootDir)
      }),
    )
    disposables.add(
      bufferInfo.buffer.onDidDestroy(() => {
        disposables.dispose()
        this.bufferSet.delete(bufferInfo.buffer)
        this.disposables.remove(disposables)
      }),
    )
    this.disposables.add(disposables)
  }

  public async select(
    importDesc: IImport,
    symbolTypes?: SymbolType[],
    skipQualified: boolean = false,
  ) {
    await this.updatePromise
    clearTimeout(this.timeout)
    this.timeout = setTimeout(this.destroy, this.invalidateInterval)
    let symbols = this.symbols
    if (importDesc.importList) {
      const il = importDesc.importList
      symbols = symbols.filter((s) => {
        const inImportList = il.includes(s.name)
        const parentInImportList = il.some(
          (i) => typeof i !== 'string' && s.parent === i.parent,
        )
        const shouldShow = inImportList || parentInImportList
        return importDesc.hiding !== shouldShow // XOR
      })
    }
    const res = []
    for (const symbol of symbols) {
      if (symbolTypes && !symbolTypes.includes(symbol.symbolType)) {
        continue
      }
      const specific = {
        name: symbol.name,
        typeSignature: symbol.typeSignature,
        symbolType: symbol.symbolType,
        module: importDesc,
      }
      const qn = (n: string) => `${importDesc.alias || importDesc.name}.${n}`
      if (!skipQualified) {
        res.push({
          ...specific,
          qparent: symbol.parent ? qn(symbol.parent) : undefined,
          qname: qn(symbol.name),
        })
      }
      if (!importDesc.qualified) {
        res.push({
          ...specific,
          qparent: symbol.parent,
          qname: symbol.name,
        })
      }
    }
    return res
  }

  private async update(rootDir: Directory) {
    Util.debug(`${this.name} updating`)
    this.symbols = await this.process.runBrowse(rootDir, [this.name])
    Util.debug(`${this.name} updated`)
  }
}
