GhcModiProcess = require './ghc-modi-process'
{HaskellGhcModMessage,HaskellGhcModMessageElement} =
  require('./haskell-ghc-mod-message')
{CompositeDisposable} = require 'atom'
EditorController = require './editor-controller'

module.exports = HaskellGhcMod =
  haskellGhcModView: null
  modalPanel: null
  subscriptions: null

  activate: (state) ->
    @process = new GhcModiProcess
    @subscriptions = new CompositeDisposable

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

    @subscriptions.add atom.workspace.eachEditor (editor) =>
      return unless editor.getGrammar().scopeName=="source.haskell"
      editor.haskellGhcModController = new EditorController(@process,editor)

  deactivate: ->
    for editor in atom.workspace.getEditors()
      editor.haskellGhcModController?.destroy()
    @subscriptions.dispose()
    @process.destroy()
