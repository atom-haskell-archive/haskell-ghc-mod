{CompositeDisposable, Emitter} = require 'atom'
Util = require '../util'

module.exports=
  class ModuleInfo
    symbols: null #module symbols
    process: null
    name: ""
    disposables: null
    emitter: null
    timeout: null
    invalidateInterval: 30 * 60 * 1000 #if module unused for 30 minutes, remove it

    constructor: (@name, @process, rootDir, done) ->
      unless @name?
        throw new Error("No name set")
      Util.debug "#{@name} created"
      @symbols = []
      @disposables = new CompositeDisposable
      @disposables.add @emitter = new Emitter
      @update rootDir, done
      @timeout = setTimeout (=> @destroy()), @invalidateInterval
      @disposables.add @process.onDidDestroy => @destroy()

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

    update: (rootDir, done) =>
      return unless @process?
      Util.debug "#{@name} updating"
      @process.runBrowse rootDir, [@name]
      .then (@symbols) =>
        Util.debug "#{@name} updated"
        done?()

    setBuffer: (bufferInfo, rootDir) =>
      return unless @disposables?
      bufferRootDir = @process?.getRootDir?(bufferInfo.buffer) ? Util.getRootDir(bufferInfo.buffer)
      unless rootDir.getPath() == bufferRootDir.getPath()
        return
      bufferInfo.getModuleName()
      .then (name) =>
        unless name == @name
          Util.debug "#{@name} moduleName mismatch:
            #{name} != #{@name}"
          return
        Util.debug "#{@name} buffer is set"
        @disposables.add bufferInfo.onDidSave =>
          Util.debug "#{@name} did-save triggered"
          @update(rootDir)
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
            importDesc.hiding != (
              (s.name in importDesc.importList) or
              (importDesc.importList.some ({parent}) -> parent? and s.parent is parent)
              )
        else
          @symbols
      si = Array.prototype.concat.apply [], symbols.map (s) ->
        qns =
          [
            (n) ->
              if importDesc.qualified
                (importDesc.alias ? importDesc.name) + '.' + n
              else
                n
          ]
        unless importDesc.skipQualified
          qns.push((n) -> importDesc.name + '.' + n)
          if importDesc.alias
            qns.push((n) -> importDesc.alias + '.' + n)
        qns.map (qn) ->
          name: s.name
          typeSignature: s.typeSignature
          symbolType:
            if s.symbolType == 'function' and s.name[0].toUpperCase() == s.name[0]
              'tag'
            else
              s.symbolType
          qparent: qn s.parent if s.parent
          module: importDesc
          qname: qn s.name
      if symbolTypes?
        si = si.filter ({symbolType}) -> symbolType in symbolTypes
      si
