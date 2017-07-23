/*
 * decaffeinate suggestions:
 * DS102: Remove unnecessary code created because of implicit returns
 * DS206: Consider reworking classes to avoid initClass
 * DS207: Consider shorter variations of null checks
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/master/docs/suggestions.md
 */
import { CompositeDisposable, Emitter, Disposable } from 'atom'
import { parseHsModuleImports, IModuleImports, IImport } from 'atom-haskell-utils'

export {IImport}

export class BufferInfo {
  private emitter: Emitter
  private disposables: CompositeDisposable
  private oldText: string = ''
  private oldImports: IModuleImports = { name: 'Main', imports: [] }

  constructor (public buffer: AtomTypes.TextBuffer) {
    this.disposables = new CompositeDisposable()
    this.emitter = new Emitter()
    this.disposables.add(this.emitter)

    this.disposables.add(this.buffer.onDidDestroy(this.destroy.bind(this)))
  }

  public destroy () {
    this.disposables.dispose()
    this.emitter.emit('did-destroy')
  }

  public onDidDestroy (callback: () => void): Disposable {
    return this.emitter.on('did-destroy', callback)
  }

  public onDidSave (callback: () => void): Disposable {
    return this.buffer.onDidSave(callback)
  }

  public async getImports (): Promise<IImport[]> {
    const parsed = await this.parse()
    const imports = parsed ? parsed.imports : []
    // tslint:disable: no-null-keyword
    if (!imports.some(({name}) => name === 'Prelude')) {
      imports.push({
        qualified: false,
        hiding: false,
        name: 'Prelude',
        importList: null,
        alias: null
      })
    }
    // tslint:enable: no-null-keyword
    return imports
  }

  public async getModuleName (): Promise<string> {
    const parsed = await this.parse()
    return parsed.name
  }

  private async parse (): Promise<IModuleImports> {
    const newText = this.buffer.getText()
    if (this.oldText === newText) {
      return this.oldImports
    } else {
      this.oldText = newText
      this.oldImports = await parseHsModuleImports(this.buffer.getText())
      return this.oldImports
    }
  }
}