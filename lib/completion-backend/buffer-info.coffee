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
              console.error "#{imports.error} in #{imports.file} on #{imports.line},#{imports.col}"
              resolve @oldImports =
                name: undefined
                imports: []
            else
              resolve @oldImports = imports

    getImports: =>
      return Promise.resolve([]) unless @buffer?
      @parse()
      .then (res) ->
        res.imports.map (imp) ->
          getName = (thing) ->
            switch
              when thing.Ident?
                thing.Ident
              when thing.Symbol?
                thing.Symbol
          getCName = (thing) ->
            switch
              when thing.VarName?
                getName(thing.VarName)
              when thing.ConName?
                getName(thing.ConName)
          qualified: imp.importQualified
          name: imp.importModule
          alias: imp.importAs
          hiding: imp.importSpecs?[0] ? false
          importList:
            if imp.importSpecs?
              Array.prototype.concat.apply [], imp.importSpecs[1].map (spec) ->
                switch
                  when spec.IVar
                    [getName(spec.IVar)]
                  when spec.IAbs
                    [getName(spec.IAbs[1])]
                  when spec.IThingAll
                    #TODO: This is rather ugly
                    [getName(spec.IThingAll), parent: getName(spec.IThingAll)]
                  when spec.IThingWith
                    Array.prototype.concat.apply [getName(spec.IThingWith[0])],
                      spec.IThingWith[1].map (v) -> getCName(v)
      .then (modules) ->
        unless (modules.some ({name}) -> name == 'Prelude')
          modules.push
            qualified: false
            hiding: false
            name: 'Prelude'
        return modules

    getModuleName: =>
      return Promise.resolve() unless @buffer?
      @parse().then (res) -> res.name
