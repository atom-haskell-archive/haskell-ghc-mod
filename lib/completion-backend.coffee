FZ = require 'fuzzaldrin'
_ = require 'underscore-plus'
{Disposable, CompositeDisposable} = require 'atom'

class BufferInfo
  buffer: null
  disposables: null
  modules: []
  symbols: null
  canUpdate: true
  process: null

  constructor: (@buffer,@process) ->
    @symbols = new Map
    @disposables = new CompositeDisposable

    @disposables.add @buffer.onDidDestroy =>
      @destroy()

    @disposables.add @process.onDidDestroy =>
      @destroy()

    @disposables.add @buffer.onDidSave =>
      @update()

    @update()


  destroy: () =>
    @disposables.dispose()
    @buffer=null
    @process=null
    @modules=[]
    @symbols.clear()
    @canUpdate=false

  getSymbols: () =>
    @update().then =>
      res = []
      @symbols.forEach (s,m) ->
        res = res.concat s.map (sy) ->
          s_ = _.clone(sy)
          s_.module = m
          if m.qualified
            s_.qname = (m.alias ? m.name) + '.' + s_.name
          else
            s_.qname = s_.name
          return s_
      res

  update: () =>
    return Promise.reject("No buffer") unless @buffer?
    return Promise.reject("No process") unless @process?

    modules = []
    regex= ///
      ^import
      \s+(qualified\s+)? #qualified
      ([\w.]+) #name
      (?:\s+as\s+([\w.]+))? #alias
      (?:\s+(hiding))?
      (?:\s+\(([^)]+)\))? #import list
      ///gm
    @buffer.scan regex, ({match}) ->
      modules.push
        qualified: match[1]?
        name: match[2]
        alias: match[3]
        hiding: match[4]?
        importList: match[5]?.split(',')?.map (s) -> s.trim()
    unless (modules.some ({name}) -> name == 'Prelude')
      modules.push
        qualified: false
        hiding: false
        name: 'Prelude'

    if _.isEqual(modules,@modules)
      Promise.resolve()
    else
      unchanged = @modules.filter (m) ->
        modules.some (m2) -> _.isEqual m,m2
      changed = modules.filter (m) ->
        not (unchanged.some (m2) -> _.isEqual m,m2)
      deleted = @modules.filter (m) ->
        not (unchanged.some (m2) -> _.isEqual m,m2)

      @modules = modules

      deleted.forEach (m) => @symbols.delete m

      Promise.all(changed.map @getModuleSymbols)

  getModuleSymbols: (m) =>
    new Promise (resolve) =>
      rd = @process.getRootDir(@buffer)
      @process.runBrowse rd, [m.name], (symbols) =>
        if m.importList?
          s = symbols.filter (s) ->
            m.hiding != (m.importList.some (i) -> i == s.name)
        else s=symbols
        @symbols.set m, s
        resolve true



module.exports =
class CompletionBackend
  process: null
  bufferMap: new WeakMap
  dirMap: new WeakMap
  languagePragmas: []
  compilerOptions: []

  constructor: (@process) ->
    @process?.onDidDestroy =>
      @process = null

    @process?.runLang (@languagePragmas) =>
    @process?.runFlag (@compilerOptions) =>

  isActive: =>
    unless @process?
      atom.notifications.addWarning "Haskell Completion Backend #{@name()}
        is inactive"
    @process?

  updateSymbolsForBuffer: (buffer) =>
    if @bufferMap.has(buffer)
      @updateBufferInfo buffer
    else
      @getBufferInfo buffer

  getSymbolsForBuffer: (buffer, callback) =>
    bi = @bufferMap.get(buffer)
    if bi?
      bi.getSymbols()
    else
      Promise.resolve([])


  ### Public interface below ###

  ###
  name()
  Get backend name

  Returns String, unique string describing a given backend
  ###
  name: () -> "haskell-ghc-mod"

  ###
  onDidDestroy(callback)
  Destruction event subscription. Usually should be called only on
  package deactivation.
  callback: () ->
  ###
  onDidDestroy: (callback) =>
    @process.onDidDestroy callback if @isActive

  registerCompletionBuffer: (buffer) =>
    @bufferMap.set(buffer, new BufferInfo(buffer, @process))
    new Disposable =>
      @unregisterCompletionBuffer buffer

  unregisterCompletionBuffer: (buffer) =>
    @bufferMap.get(buffer)?.destroy()
    @bufferMap.delete buffer

  getCompletionsForSymbol: (buffer, prefix, position) =>
    return Promise.reject("Backend inactive") unless @isActive()

    @getSymbolsForBuffer(buffer).then (symbols) ->
      FZ.filter symbols, prefix, key: 'qname'

  getCompletionsForType: (buffer, prefix, position) =>
    return Promise.reject("Backend inactive") unless @isActive()

    @getSymbolsForBuffer(buffer).then (symbols) ->
      FZ.filter (symbols.filter ({symbolType}) ->
        symbolType=='type' or symbolType=='class'),
        prefix, key: 'qname'

  getCompletionsForClass: (buffer, prefix, position) =>
    return Promise.reject("Backend inactive") unless @isActive()

    @getSymbolsForBuffer(buffer).then (symbols) ->
      FZ.filter (symbols.filter ({symbolType}) -> symbolType=='class'),
        prefix, key: 'qname'

  getCompletionsForModule: (buffer, prefix, position) =>
    return Promise.reject("Backend inactive") unless @isActive()
    rootDir = @process.getRootDir buffer
    m = @dirMap.get(rootDir)
    if m?
      Promise.resolve (FZ.filter m, prefix)
    else
      new Promise (resolve) =>
        @process.runList rootDir, (modules) =>
          @dirMap.set rootDir, modules
          #refresh every 10 minutes
          setTimeout (=> @dirMap.delete rootDir), 10*60*1000
          resolve (FZ.filter modules, prefix)

  getCompletionsForSymbolInModule: (buffer, prefix, position, {module}) =>
    unless module?
      @editor.backwardsScanInBufferRange /^import\s+([\w.]+)/,
        @lineRange, ({match,stop}) ->
          module=match[1]
          stop()
    new Promise (resolve) =>
      @process.runBrowse rd, [module], resolve

  getCompletionsForLanguagePragmas: (buffer, prefix, position) =>
    return Promise.reject("Backend inactive") unless @isActive()

    Promise.resolve(FZ.filter @languagePragmas, prefix)

  getCompletionsForCompilerOptions: (buffer, prefix, position) =>
    return Promise.reject("Backend inactive") unless @isActive()

    Promise.resolve(FZ.filter @compilerOptions, prefix)

  getCompletionsForHole: (buffer, prefix, position) =>
    return Promise.reject("Backend inactive") unless @isActive()
    new Promise (resolve) =>
      @process.getTypeInBuffer buffer,position,({type}) =>
        @getSymbolsForBuffer(buffer).then (symbols) ->
          resolve (
            symbols
              .filter (s) ->
                return false unless s.typeSignature?
                tl = s.typeSignature.split(' -> ').slice(-1)[0]
                return false if tl.match(/^[a-z]$/)
                ts = tl.replace(/[.?*+^$[\]\\(){}|-]/g, "\\$&")
                rx=RegExp ts.replace(/\b[a-z]\b/g,'.+'),''
                rx.test(type)
              .sort (a,b) ->
                FZ.score(b.typeSignature,type)-FZ.score(a.typeSignature,type)
            )
