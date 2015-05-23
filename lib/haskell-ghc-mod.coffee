GhcModiProcess = require './ghc-modi-process'
{HaskellGhcModMessage,HaskellGhcModMessageElement} =
  require('./haskell-ghc-mod-message')
{CompositeDisposable} = require 'atom'
Grim = require 'grim'
EditorController = require './editor-controller'
IdeBackend = require './ide-backend'
CompletionBackend = require './completion-backend'

module.exports = HaskellGhcMod =
  process: null
  subscriptions: null
  editorMap: null

  config:
    checkOnSave:
      type: 'boolean'
      default: true
      description: 'Run ghc-mod check on file save'
    ghcModPath:
      type: 'string'
      default: 'ghc-mod'
      description: 'Path to ghc-mod'
    enableGhcModi:
      type: 'boolean'
      default: true
      description:
        'Disable if experiencing problems. It is noticeably slower,
         but can help with ghc-modi bugs'
    ghcModiPath:
      type: 'string'
      default: 'ghc-modi'
      description: 'Path to ghc-modi'

  registerEditorCommands: ->
    if atom.packages.isPackageActive('ide-haskell')
      return

    @subscriptions_editor = new CompositeDisposable
    @editorMap = new WeakMap

    @subscriptions_editor.add atom.commands.add 'atom-text-editor',
      'haskell-ghc-mod:type': ({target}) =>
        @editorMap.get(target.getModel())?.getType()
      'haskell-ghc-mod:info': ({target}) =>
        @editorMap.get(target.getModel())?.getInfo()
      'haskell-ghc-mod:insert-type': ({target}) =>
        @editorMap.get(target.getModel())?.insertType()
      'haskell-ghc-mod:check': ({target}) =>
        @editorMap.get(target.getModel())?.doCheck()

    @subscriptions_editor.add atom.workspace.observeTextEditors (editor) =>
      return unless editor.getGrammar().scopeName=="source.haskell"
      @editorMap.set(editor,new EditorController(@process,editor))

  unregisterEdtiorCommands: ->
    for editor in atom.workspace.getTextEditors()
      @editorMap?.get(editor)?.desrtoy?()
    @subscriptions_editor?.dispose()

  activate: (state) ->
    @process=new GhcModiProcess
    @subscriptions = new CompositeDisposable

    atom.views.addViewProvider HaskellGhcModMessage, (message)->
      el=new HaskellGhcModMessageElement
      el.setModel(message)
      el

    atom.packages.onDidActivatePackage (p) =>
      @unregisterEditorCommands() if p.name=='ide-haskell'

    atom.packages.onDidDeactivatePackage (p) =>
      @registerEditorCommands() if p.name=='ide-haskell'

    setTimeout @registerEditorCommands, 5000

  deactivate: ->
    @unregisterEdtiorCommands()
    @process?.destroy()

  provideIdeBackend_0_1_0: ->
    new IdeBackend @process

  provideCompletionBackend_0_1_0: ->
    new CompletionBackend @process
