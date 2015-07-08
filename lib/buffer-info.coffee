{CompositeDisposable, Emitter} = require 'atom'

module.exports=
  class BufferInfo
    buffer: null
    emitter: null
    disposables: null

    constructor: (@buffer) ->
      @disposables = new CompositeDisposable
      @disposables.add @emitter = new Emitter

      @disposables.add @buffer.onDidDestroy =>
        @destroy()

    destroy: =>
      return unless @buffer?
      @buffer = null
      @disposables.dispose()
      @disposables = null
      @emitter.emit 'did-destroy'
      @emitter = null

    onDidDestroy: (callback) =>
      unless @emitter?
        return new Disposable ->
      @emitter.on 'did-destroy', callback

    onDidSave: (callback) =>
      unless @buffer?
        return new Disposable ->
      @buffer.onDidSave callback

    getImports: =>
      return [] unless @buffer?
      modules = []
      regex = ///
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
      return unless @buffer?
      moduleName = undefined
      @buffer.scan /^\s*module\s+([\w.']+)/, ({match}) ->
        moduleName = match[1]
      moduleName
