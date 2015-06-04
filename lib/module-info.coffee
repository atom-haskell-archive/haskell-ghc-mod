{CompositeDisposable, Emitter} = require 'atom'

module.exports=
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
      @timeout = setTimeout (=> @destroy), @invalidateInterval

    destroy: =>
      return unless @symbols?
      console.log @name+' destroyed' if DEBUG?
      clearTimeout @timeout
      @timeout = null
      @emitter.emit 'did-destroy'
      @disposables.dispose()
      @disposables = null
      @symbols = null
      @process = null

    onDidDestroy: (callback) =>
      unless @emitter?
        return new Disposable ->
      @emitter.on 'did-destroy', callback

    update: (rootPath,done) =>
      return unless @process?
      console.log @name+' updating' if DEBUG?
      @process.runBrowse rootPath, [@name], (@symbols) =>
        console.log @name+' updated' if DEBUG?
        done?()

    setBuffer: (bufferInfo,rootPath) =>
      return unless @process?
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

    unsetBuffer: =>
      return unless @disposables?
      @disposables.dispose()
      @disposables = new CompositeDisposable

    select: (importDesc, symbolTypes) =>
      return [] unless @symbols?
      clearTimeout @timeout
      @timeout = setTimeout @destroy, @invalidateInterval
      symbols =
        if importDesc.importList?
          @symbols.filter (s) ->
            importDesc.hiding != (importDesc.importList.some (i) -> i == s.name)
        else
          @symbols
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
