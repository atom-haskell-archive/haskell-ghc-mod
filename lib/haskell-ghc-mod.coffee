GhcModiProcess = require './ghc-modi-process'
{HaskellGhcModMessage,HaskellGhcModMessageElement} =
  require('./haskell-ghc-mod-message')
{CompositeDisposable} = require 'atom'
EditorController = require './editor-controller'

module.exports = HaskellGhcMod =
  process: null
  subscriptions: null
  numInstances: 0

  config:
    checkOnSave:
      type: 'boolean'
      default: true
      description: 'Run ghc-mod check on file save'
    checkOnEdit:
      type: 'boolean'
      default: false
      description: 'Run ghc-mod check when you change buffer contents'
    ghcModiPath:
      type: 'string'
      default: 'ghc-modi'
      description: 'Path to ghc-modi'

  activate: (state) ->
    @subscriptions = new CompositeDisposable
    @process=null
    @numInstances=0

    atom.views.addViewProvider
      modelConstructor: HaskellGhcModMessage
      viewConstructor: HaskellGhcModMessageElement

    @subscriptions.add atom.commands.add 'atom-text-editor',
      'haskell-ghc-mod:type': ->
        @getModel().haskellGhcModController?.getType()
      'haskell-ghc-mod:info': ->
        @getModel().haskellGhcModController?.getInfo()
      'haskell-ghc-mod:insert-type': ->
        @getModel().haskellGhcModController?.insertType()
      'haskell-ghc-mod:check': ->
        @getModel().haskellGhcModController?.doCheck()

    @subscriptions.add atom.workspace.observeTextEditors (editor) =>
      return unless editor.getGrammar().scopeName=="source.haskell"
      @numInstances += 1
      @process = new GhcModiProcess unless @process
      editor.haskellGhcModController = new EditorController(@process,editor)
      editor.onDidDestroy =>
        editor.haskellGhcModController?.destroy()
        @numInstances -= 1
        if @numInstances==0
          @process?.destroy()
          @process=null

  deactivate: ->
    for editor in atom.workspace.getEditors()
      editor.haskellGhcModController?.destroy()
    @subscriptions.dispose()
    @process?.destroy()
