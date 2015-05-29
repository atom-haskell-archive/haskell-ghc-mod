FZ = require 'fuzzaldrin'
_ = require 'underscore-plus'
{Disposable, CompositeDisposable, Range, Emitter} = require 'atom'

# DEBUG = true

class BufferInfo
  buffer: null
  emitter: null
  disposables: null

  constructor: (@buffer) ->
    @disposables = new CompositeDisposable
    @disposables.add @emitter=new Emitter

    @disposables.add @buffer.onDidDestroy =>
      @destroy()

  destroy: () =>
    @emitter.emit 'did-destroy'
    @disposables.dispose()
    @buffer=null

  onDidDestroy: (callback) ->
    return unless @emitter?
    @emitter.on 'did-destroy', callback

  onDidSave: (callback) ->
    return unless @buffer
    @buffer.onDidSave callback

  getImports: () =>
    return [] unless @buffer?
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
    modules

  getModuleName: =>
    moduleName = undefined
    @buffer.scan /^\s*module\s+([\w.']+)/, ({match}) ->
      moduleName=match[1]
    moduleName

class ModuleInfo
  symbols: null #module symbols
  process: null
  name: ""
  disposables: null
  emitter: null
  timeout: null
  invalidateInterval: 30*60*1000 #if module is unused for 30 minutes, remove it

  constructor: (@name, @process, rootPath, done) ->
    unless @name?
      throw new Error("No name set")
    console.log @name+' created' if DEBUG?
    @symbols = []
    @disposables = new CompositeDisposable
    @disposables.add @emitter = new Emitter
    @update rootPath,done
    @timeout = setTimeout @destroy, @invalidateInterval

  destroy: =>
    console.log @name+' destroyed' if DEBUG?
    clearTimeout @timeout
    @timeout = null
    @emitter.emit 'did-destroy'
    @disposables.dispose()
    @disposables = null
    @symbols = null
    @process = null

  onDidDestroy: (callback) ->
    @emitter.on 'did-destroy', callback

  update: (rootPath,done) ->
    return unless @process?
    console.log @name+' updating' if DEBUG?
    @process.runBrowse rootPath, [@name], (@symbols) =>
      console.log @name+' updated' if DEBUG?
      done?()

  setBuffer: (bufferInfo,rootPath) ->
    unless @process.getRootDir(bufferInfo.buffer).getPath() == rootPath
      console.log "#{@name} rootPath mismatch:
        #{@process.getRootDir(bufferInfo.buffer).getPath()}
        != #{rootPath}" if DEBUG?
      return
    unless bufferInfo.getModuleName() == @name
      console.log "#{@name} moduleName mismatch:
        #{bufferInfo.getModuleName()}
        != #{@name}" if DEBUG?
      return
    console.log "#{@name} buffer is set" if DEBUG?
    @disposables.add bufferInfo.onDidSave =>
      console.log @name+' did-save triggered' if DEBUG?
      @update(rootPath)
    @disposables.add bufferInfo.onDidDestroy =>
      @unsetBuffer()

  unsetBuffer: ->
    @disposables.dispose()
    @disposables = new CompositeDisposable

  select: (importDesc, symbolTypes) ->
    clearTimeout @timeout
    @timeout = setTimeout @destroy, @invalidateInterval
    symbols =
      (if importDesc.importList?
        @symbols.filter (s) ->
          importDesc.hiding != (importDesc.importList.some (i) -> i == s.name)
      else
        @symbols)
    si=symbols.map (s) ->
      name: s.name
      typeSignature: s.typeSignature
      symbolType: s.symbolType
      module: importDesc
      qname:
        if importDesc.qualified
          (importDesc.alias ? importDesc.name) + '.' + s.name
        else
          s.name
    if symbolTypes?
      si=si.filter ({symbolType}) ->
        symbolTypes.some (st) ->
          st == symbolType
    si

module.exports =
class CompletionBackend
  process: null
  languagePragmas: []
  bufferMap: null
  dirMap: null
  modListMap: null
  compilerOptions: []

  constructor: (@process) ->
    @bufferMap = new WeakMap # buffer => BufferInfo
    @dirMap = new WeakMap # dir => Map ModuleName ModuleInfo
    @modListMap = new WeakMap # dir => [ModuleName]

    @process?.onDidDestroy =>
      @process = null

    @process?.runLang (@languagePragmas) =>
    @process?.runFlag (@compilerOptions) =>

  isActive: =>
    unless @process?
      atom.notifications.addWarning "Haskell Completion Backend #{@name()}
        is inactive"
    @process?

  getSymbolsForBuffer: (buffer, symbolTypes) =>
    {bufferInfo} = @getBufferInfo {buffer}
    {rootDir, moduleMap} = @getModuleMap {bufferInfo}
    if bufferInfo? and moduleMap?
      Promise.all bufferInfo.getImports().map (imp) =>
        new Promise (resolve) =>
          {moduleInfo} = @getModuleInfo
            moduleName: imp.name
            rootDir: rootDir
            moduleMap: moduleMap
            done: -> resolve moduleInfo.select(imp,symbolTypes)
      .then (promises) ->
        [].concat promises...
    else
      Promsie.resolve []

  getBufferInfo: ({buffer}) ->
    if @bufferMap.has buffer
      bufferInfo: @bufferMap.get buffer
    else
      @bufferMap.set buffer, bi=new BufferInfo(buffer)
      bufferInfo: bi

  getModuleMap: ({bufferInfo,rootDir}) ->
    unless bufferInfo? or rootDir?
      throw new Error("Neither bufferInfo nor rootDir specified")
    rootDir ?= @process.getRootDir bufferInfo.buffer
    unless @dirMap.has(rootDir)
      @dirMap.set rootDir, mm=new Map
    else
      mm = @dirMap.get rootDir

    rootDir: rootDir
    moduleMap: mm

  getModuleInfo: ({moduleName,bufferInfo,rootDir,moduleMap,done}) ->
    unless moduleName? or bufferInfo?
      throw new Error("No moduleName or bufferInfo specified")
    moduleName ?= bufferInfo.getModuleName()
    unless moduleName
      console.log "warn: nameless module in
        #{bufferInfo.buffer.getUri()}" if DEBUG?
      return
    unless moduleMap? and rootDir?
      unless bufferInfo?
        throw new Error("No bufferInfo specified and no moduleMap+rootDir")
      {rootDir, moduleMap} = @getModuleMap({bufferInfo,rootDir})
    unless moduleMap.has moduleName
      moduleMap.set moduleName,
        moduleInfo=new ModuleInfo(moduleName,@process,rootDir.getPath(),done)
      if bufferInfo?
        moduleInfo.setBuffer bufferInfo, rootDir.getPath()
      else
        atom.workspace.getTextEditors().forEach (editor) =>
          {bufferInfo} = @getBufferInfo {buffer: editor.getBuffer()}
          moduleInfo.setBuffer bufferInfo, rootDir.getPath()

      moduleInfo.onDidDestroy ->
        moduleMap.delete moduleName
        console.log moduleName+' removed from map' if DEBUG?
    else
      moduleInfo = moduleMap.get moduleName
      if done?
        setTimeout done, 0
    {bufferInfo,rootDir,moduleMap,moduleInfo}

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

  ###
  registerCompletionBuffer(buffer)
  Every buffer that would be used with autocompletion functions has to
  be registered with this function.

  buffer: TextBuffer, buffer to be used in autocompletion

  Returns: Disposable, which will remove buffer from autocompletion
  ###
  registerCompletionBuffer: (buffer) =>
    if @bufferMap.has buffer
      return new Disposable ->

    {bufferInfo} = @getBufferInfo {buffer}

    {rootDir, moduleMap} = @getModuleMap {bufferInfo}

    @getModuleInfo {bufferInfo,rootDir,moduleMap}

    bufferInfo.getImports().forEach ({name}) =>
      @getModuleInfo {moduleName: name,rootDir,moduleMap}

    new Disposable =>
      @unregisterCompletionBuffer buffer

  ###
  unregisterCompletionBuffer(buffer)
  buffer: TextBuffer, buffer to be removed from autocompletion
  ###
  unregisterCompletionBuffer: (buffer) =>
    @bufferMap.get(buffer)?.destroy()
    @bufferMap.delete buffer

  ###
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
  ###
  getCompletionsForSymbol: (buffer, prefix, position) =>
    return Promise.reject("Backend inactive") unless @isActive()

    @getSymbolsForBuffer(buffer).then (symbols) ->
      FZ.filter symbols, prefix, key: 'qname'

  ###
  getCompletionsForType(buffer,prefix,position)
  buffer: TextBuffer, current buffer
  prefix: String, completion prefix
  position: Point, current cursor position

  Returns: Promise([symbol])
  symbol: Same as getCompletionsForSymbol, except
          symbolType is one of ['type', 'class']
  ###
  getCompletionsForType: (buffer, prefix, position) =>
    return Promise.reject("Backend inactive") unless @isActive()

    @getSymbolsForBuffer(buffer,['type','class']).then (symbols) ->
      FZ.filter symbols, prefix, key: 'qname'

  ###
  getCompletionsForClass(buffer,prefix,position)
  buffer: TextBuffer, current buffer
  prefix: String, completion prefix
  position: Point, current cursor position

  Returns: Promise([symbol])
  symbol: Same as getCompletionsForSymbol, except
          symbolType is one of ['class']
  ###
  getCompletionsForClass: (buffer, prefix, position) =>
    return Promise.reject("Backend inactive") unless @isActive()

    @getSymbolsForBuffer(buffer,['class']).then (symbols) ->
      FZ.filter symbols, prefix, key: 'qname'

  ###
  getCompletionsForModule(buffer,prefix,position)
  buffer: TextBuffer, current buffer
  prefix: String, completion prefix
  position: Point, current cursor position

  Returns: Promise([module])
  module: String, module name
  ###
  getCompletionsForModule: (buffer, prefix, position) =>
    return Promise.reject("Backend inactive") unless @isActive()
    rootDir = @process.getRootDir buffer
    m = @modListMap.get(rootDir)
    if m?
      Promise.resolve (FZ.filter m, prefix)
    else
      new Promise (resolve) =>
        @process.runList rootDi.getPath(), (modules) =>
          @modListMap.set rootDir, modules
          #refresh every minute
          setTimeout (=> @modListMap.delete rootDir), 60*1000
          resolve (FZ.filter modules, prefix)

  ###
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
  ###
  getCompletionsForSymbolInModule: (buffer, prefix, position, opts) =>
    return Promise.reject("Backend inactive") unless @isActive()
    moduleName = opts?.module
    unless moduleName?
      lineRange = new Range [0, position.row], position
      buffer.backwardsScanInRange /^import\s+([\w.]+)/,
        lineRange, ({match}) ->
          moduleName=match[1]

    new Promise (resolve) =>
      {moduleInfo} = @getModuleInfo
        moduleName: moduleName
        bufferInfo: @getBufferInfo {buffer}
        done: ->
          symbols = moduleInfo.select
            qualified: false
            hiding: false
            name: moduleName
          resolve (FZ.filter symbols, prefix, key: 'name')

  ###
  getCompletionsForLanguagePragmas(buffer,prefix,position)
  buffer: TextBuffer, current buffer
  prefix: String, completion prefix
  position: Point, current cursor position

  Returns: Promise([pragma])
  pragma: String, language option
  ###
  getCompletionsForLanguagePragmas: (buffer, prefix, position) =>
    return Promise.reject("Backend inactive") unless @isActive()

    Promise.resolve(FZ.filter @languagePragmas, prefix)

  ###
  getCompletionsForCompilerOptions(buffer,prefix,position)
  buffer: TextBuffer, current buffer
  prefix: String, completion prefix
  position: Point, current cursor position

  Returns: Promise([ghcopt])
  ghcopt: String, compiler option (starts with '-f')
  ###
  getCompletionsForCompilerOptions: (buffer, prefix, position) =>
    return Promise.reject("Backend inactive") unless @isActive()

    Promise.resolve(FZ.filter @compilerOptions, prefix)

  ###
  getCompletionsForHole(buffer,prefix,position)
  Get completions based on expression type. Currently prefix is ignored.

  buffer: TextBuffer, current buffer
  prefix: String, completion prefix
  position: Point, current cursor position

  Returns: Promise([symbol])
  symbol: Same as getCompletionsForSymbol
  ###
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
