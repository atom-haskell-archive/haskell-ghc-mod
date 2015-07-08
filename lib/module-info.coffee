{CompositeDisposable, Emitter} = require 'atom'
Util = require './util'

module.exports=
  class ModuleInfo
    symbols: null #module symbols
    process: null
    name: ""
    disposables: null
    emitter: null
    timeout: null
    invalidateInterval: 30 * 60 * 1000 #if module unused for 30 minutes, remove it

    constructor: (@name, @process, rootPath, done) ->
      unless @name?
        throw new Error("No name set")
      Util.debug "#{@name} created"
      @symbols = []
      @disposables = new CompositeDisposable
      @disposables.add @emitter = new Emitter
      @update rootPath, done
      @timeout = setTimeout (=> @destroy), @invalidateInterval

    destroy: =>
      return unless @symbols?
      Util.debug "#{@name} destroyed"
      clearTimeout @timeout
      @timeout = null
      @emitter.emit 'did-destroy'
      @disposables.dispose()
      @disposables = null
      @symbols = null
      @process = null
      @name = ""
      @emitter = null

    onDidDestroy: (callback) =>
      unless @emitter?
        return new Disposable ->
      @emitter.on 'did-destroy', callback

    update: (rootPath, done) =>
      return unless @process?
      Util.debug "#{@name} updating"
      @process.runBrowse rootPath, [@name], (@symbols) =>
        Util.debug "#{@name} updated"
        done?()

    setBuffer: (bufferInfo, rootPath) =>
      return unless @disposables?
      unless Util.getRootDir(bufferInfo.buffer).getPath() == rootPath
        Util.debug "#{@name} rootPath mismatch:
          #{Util.getRootDir(bufferInfo.buffer).getPath()}
          != #{rootPath}"
        return
      unless bufferInfo.getModuleName() == @name
        Util.debug "#{@name} moduleName mismatch:
          #{bufferInfo.getModuleName()}
          != #{@name}"
        return
      Util.debug "#{@name} buffer is set"
      @disposables.add bufferInfo.onDidSave =>
        Util.debug "#{@name} did-save triggered"
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
            importDesc.hiding != (s.name in importDesc.importList)
        else
          @symbols
      si = symbols.map (s) ->
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
        si = si.filter ({symbolType}) -> symbolType in symbolTypes
      si
