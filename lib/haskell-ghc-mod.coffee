GhcModiProcess = require './ghc-modi-process'
{HaskellGhcModMessage,HaskellGhcModMessageElement} =
  require('./haskell-ghc-mod-message')
{CompositeDisposable} = require 'atom'
EditorController = require './editor-controller'

module.exports = HaskellGhcMod =
  process: null
  subscriptions: null
  numInstances: 0

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
      'haskell-ghc-mod:check': ->
        @getModel().haskellGhcModController?.doCheck()

    @subscriptions.add atom.workspace.observeTextEditors (editor) =>
      return unless editor.getGrammar().scopeName=="source.haskell"
      @numInstances += 1
      console.log(@numInstances)
      @process = new GhcModiProcess unless @process
      editor.haskellGhcModController = new EditorController(@process,editor)
      editor.onDidDestroy =>
        editor.haskellGhcModController?.destroy()
        @numInstances -= 1
        if @numInstances==0 then (
          @process?.destroy()
          @process=null
        )

  deactivate: ->
    for editor in atom.workspace.getEditors()
      editor.haskellGhcModController?.destroy()
    @subscriptions.dispose()
    @process?.destroy()
