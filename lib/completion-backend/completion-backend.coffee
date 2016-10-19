FZ = require 'fuzzaldrin'
{Disposable, Range} = require 'atom'
BufferInfo = require './buffer-info'
ModuleInfo = require './module-info'
Util = require '../util'
_ = require 'underscore-plus'

module.exports =
class CompletionBackend
  process: null
  bufferMap: null
  dirMap: null
  modListMap: null
  languagePragmas: null
  compilerOptions: null

  constructor: (proc) ->
    @bufferMap = new WeakMap # buffer => BufferInfo
    @dirMap = new WeakMap # dir => Map ModuleName ModuleInfo
    @modListMap = new WeakMap # dir => [ModuleName]
    @languagePragmas = new WeakMap # dir => pragmas
    @compilerOptions = new WeakMap # dir => options

    @setProcess proc

  setProcess: (@process) ->
    @process?.onDidDestroy =>
      @process = null

  isActive: =>
    unless @process?
      atom.notifications.addWarning "Haskell Completion Backend #{@name()}
        is inactive"
    @process?

  getSymbolsForBuffer: (buffer, symbolTypes) =>
    {bufferInfo} = @getBufferInfo {buffer}
    {rootDir, moduleMap} = @getModuleMap {bufferInfo}
    if bufferInfo? and moduleMap?
      bufferInfo.getImports()
      .then (imports) =>
        Promise.all imports.map (imp) =>
          @getModuleInfo
            moduleName: imp.name
            rootDir: rootDir
            moduleMap: moduleMap
          .then ({moduleInfo}) ->
            moduleInfo.select(imp, symbolTypes)
      .then (promises) ->
        [].concat promises...
    else
      Promise.resolve []

  getBufferInfo: ({buffer}) =>
    unless buffer?
      throw new Error("Null buffer in getBufferInfo!")
    if @bufferMap.has buffer
      bi = @bufferMap.get buffer
    unless bi?.buffer?
      @bufferMap.set buffer, bi = new BufferInfo(buffer)
      # bi.onDidDestroy =>
      #   @bufferMap.delete buffer
    bufferInfo: bi

  getModuleMap: ({bufferInfo, rootDir}) =>
    unless bufferInfo? or rootDir?
      throw new Error("Neither bufferInfo nor rootDir specified")
    rootDir ?= @process?.getRootDir?(bufferInfo.buffer) ? Util.getRootDir(bufferInfo.buffer)
    unless @dirMap.has(rootDir)
      @dirMap.set rootDir, mm = new Map
    else
      mm = @dirMap.get rootDir

    rootDir: rootDir
    moduleMap: mm

  getModuleInfo: ({moduleName, bufferInfo, rootDir, moduleMap}) =>
    unless moduleName? or bufferInfo?
      throw new Error("No moduleName or bufferInfo specified")
    # moduleName ?= bufferInfo.getModuleName()
    Promise.resolve (moduleName or bufferInfo.getModuleName())
    .then (moduleName) =>
      unless moduleName
        Util.debug "warn: nameless module in
          #{bufferInfo.buffer.getUri()}"
        return
      unless moduleMap? and rootDir?
        unless bufferInfo?
          throw new Error("No bufferInfo specified and no moduleMap+rootDir")
        {rootDir, moduleMap} = @getModuleMap({bufferInfo, rootDir})

      moduleInfo = moduleMap.get moduleName
      unless moduleInfo?.symbols? #hack to help with #20, #21
        new Promise (resolve) =>
          moduleMap.set moduleName,
            moduleInfo = new ModuleInfo moduleName, @process, rootDir, ->
              resolve {bufferInfo, rootDir, moduleMap, moduleInfo}

          if bufferInfo?
            moduleInfo.setBuffer bufferInfo, rootDir
          else
            atom.workspace.getTextEditors().forEach (editor) =>
              {bufferInfo} = @getBufferInfo {buffer: editor.getBuffer()}
              moduleInfo.setBuffer bufferInfo, rootDir

          moduleInfo.onDidDestroy ->
            moduleMap.delete moduleName
            Util.debug "#{moduleName} removed from map"
      else
        Promise.resolve {bufferInfo, rootDir, moduleMap, moduleInfo}

  filter: (candidates, prefix, keys) ->
    unless prefix
      return candidates
    candidates
    .map (c) ->
      c1 = _.clone(c)
      scores = keys.map (key) -> FZ.score(c1[key], prefix)
      c1.score = Math.max(scores...)
      c1.scoreN = scores.indexOf(c1.score)
      return c1
    .filter (c) -> c.score > 0
    .sort (a, b) ->
      s = b.score - a.score
      if s == 0
        s = a.scoreN - b.scoreN
      return s

  ### Public interface below ###

  ###
  name()
  Get backend name

  Returns String, unique string describing a given backend
  ###
  name: -> "haskell-ghc-mod"

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

    setImmediate =>
      {bufferInfo} = @getBufferInfo {buffer}

      {rootDir, moduleMap} = @getModuleMap {bufferInfo}

      @getModuleInfo {bufferInfo, rootDir, moduleMap}

      bufferInfo.getImports()
      .then (imports) =>
        imports.forEach ({name}) =>
          @getModuleInfo {moduleName: name, rootDir, moduleMap}

    new Disposable =>
      @unregisterCompletionBuffer buffer

  ###
  unregisterCompletionBuffer(buffer)
  buffer: TextBuffer, buffer to be removed from autocompletion
  ###
  unregisterCompletionBuffer: (buffer) =>
    @bufferMap.get(buffer)?.destroy()

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

    @getSymbolsForBuffer(buffer).then (symbols) =>
      @filter symbols, prefix, ['qname', 'qparent']
      # .concat FZ.filter symbols, prefix, key: 'parent'

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

    @getSymbolsForBuffer(buffer, ['type', 'class']).then (symbols) ->
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

    @getSymbolsForBuffer(buffer, ['class']).then (symbols) ->
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
    rootDir = @process?.getRootDir?(buffer) ? Util.getRootDir(buffer)
    m = @modListMap.get(rootDir)
    if m?
      Promise.resolve (FZ.filter m, prefix)
    else
      @process.runList(buffer).then (modules) =>
        @modListMap.set rootDir, modules
        #refresh every minute
        setTimeout (=> @modListMap.delete rootDir), 60 * 1000
        FZ.filter modules, prefix

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
          moduleName = match[1]

    {bufferInfo} = @getBufferInfo {buffer}
    @getModuleInfo
      bufferInfo: bufferInfo
      moduleName: moduleName
    .then ({moduleInfo}) ->
      symbols = moduleInfo.select
        qualified: false
        skipQualified: true
        hiding: false
        name: moduleName
      FZ.filter symbols, prefix, key: 'name'

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

    dir = @process?.getRootDir?(buffer) ? Util.getRootDir(buffer)

    p =
      if @languagePragmas.has(dir)
        @languagePragmas.get(dir)
      else
        promise = @process.runLang(dir)
        @languagePragmas.set(dir, promise)
        promise
    p.then (pragmas) ->
      FZ.filter pragmas, prefix

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

    dir = @process?.getRootDir?(buffer) ? Util.getRootDir(buffer)

    p =
      if @compilerOptions.has(dir)
        @compilerOptions.get(dir)
      else
        promise = @process.runFlag(dir)
        @compilerOptions.set(dir, promise)
        promise
    p.then (options) ->
      FZ.filter options, prefix

  ###
  getCompletionsForHole(buffer,prefix,position)
  Get completions based on expression type.
  It is assumed that `prefix` starts with '_'

  buffer: TextBuffer, current buffer
  prefix: String, completion prefix
  position: Point, current cursor position

  Returns: Promise([symbol])
  symbol: Same as getCompletionsForSymbol
  ###
  getCompletionsForHole: (buffer, prefix, position) =>
    return Promise.reject("Backend inactive") unless @isActive()
    position = Range.fromPointWithDelta(position, 0, 0) if position?
    prefix = prefix.slice 1 if prefix.startsWith '_'
    @process.getTypeInBuffer(buffer, position).then ({type}) =>
      @getSymbolsForBuffer(buffer).then (symbols) ->
        ts = symbols.filter (s) ->
          return false unless s.typeSignature?
          tl = s.typeSignature.split(' -> ').slice(-1)[0]
          return false if tl.match(/^[a-z]$/)
          ts = tl.replace(/[.?*+^$[\]\\(){}|-]/g, "\\$&")
          rx = RegExp ts.replace(/\b[a-z]\b/g, '.+'), ''
          rx.test(type)
        if prefix.length is 0
          ts.sort (a, b) ->
            FZ.score(b.typeSignature, type) - FZ.score(a.typeSignature, type)
        else
          FZ.filter ts, prefix, key: 'qname'
