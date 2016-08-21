{CompositeDisposable, Emitter} = require 'atom'
{parseHsModuleImports} = require 'atom-haskell-utils'

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

    parse: ->
      new Promise (resolve) =>
        newText = @buffer.getText()
        if @oldText is newText
          resolve @oldImports
        else
          parseHsModuleImports @buffer.getText(), (imports) =>
            @oldText = newText
            if imports.error?
              console.error "Parse error: #{imports.error}"
              resolve @oldImports =
                name: undefined
                imports: []
            else
              resolve @oldImports = imports

    getImports: =>
      return Promise.resolve([]) unless @buffer?
      @parse()
      .then ({imports}) ->
        unless (imports.some ({name}) -> name == 'Prelude')
          imports.push
            qualified: false
            hiding: false
            name: 'Prelude'
        return imports

    getModuleName: =>
      return Promise.resolve() unless @buffer?
      @parse().then (res) -> res.name
