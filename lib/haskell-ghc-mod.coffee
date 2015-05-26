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
    disableFrontend:
      type: 'boolean'
      default: false
      description: 'Disable frontend completely. Frontent will be removed
                    in 0.7.0'
    suppressStartupWarning:
      type: 'boolean'
      default: false

  registerEditorCommands: ->
    if atom.packages.isPackageActive('ide-haskell')
      return

    unless atom.config.get('haskell-gch-mod.suppressStartupWarning')
      atom.notifications.addWarning "Haskell-ghc-mod package is intended to
      be used as a backend for ide-haskell. Frontend will
      be removed in 0.7.0, at which point ide-haskell will be preferred option.
      All features supported by haskell-ghc-mod are now in ide-haskell.
      Consider migrating early. You can suppress this warning in haskell-ghc-mod
      settings.", dismissable:true

    @subscriptions_editor = new CompositeDisposable
    @editorMap = new WeakMap

    @subscriptions_editor.add \
      atom.commands.add 'atom-text-editor[data-grammar~="haskell"]',
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

    @atom_menu = atom.contextMenu.add
      'atom-text-editor[data-grammar~="haskell"]': [
        'label': 'Haskell Ghc-mod'
        'submenu': [
            'label': 'Type'
            'command': 'haskell-ghc-mod:type'
          ,
            'label': 'Info'
            'command': 'haskell-ghc-mod:info'
          ,
            'label': 'Check'
            'command': 'haskell-ghc-mod:check'
        ]
      ]

  unregisterEdtiorCommands: ->
    for editor in atom.workspace.getTextEditors()
      @editorMap?.get(editor)?.desrtoy?()
    @subscriptions_editor?.dispose()
    @atom_menu?.dispose()

  activate: (state) ->
    @process=new GhcModiProcess

    unless atom.config.get('haskell-gch-mod.disableFrontend')
      @subscriptions = new CompositeDisposable

      @subscriptions.add atom.views.addViewProvider HaskellGhcModMessage,
        (message)->
          el=new HaskellGhcModMessageElement
          el.setModel(message)
          el

      @subscriptions.add atom.packages.onDidActivatePackage (p) =>
        @unregisterEdtiorCommands() if p.name=='ide-haskell'

      @subscriptions.add atom.packages.onDidDeactivatePackage (p) =>
        @registerEditorCommands() if p.name=='ide-haskell'

      setTimeout @registerEditorCommands, 5000

  deactivate: ->
    @unregisterEdtiorCommands()
    @subscriptions?.dispose()
    @process?.destroy()

  provideIdeBackend_0_1_0: ->
    new IdeBackend @process, version: '0.1.0'

  provideIdeBackend_0_1_1: ->
    new IdeBackend @process

  provideCompletionBackend_0_1_0: ->
    new CompletionBackend @process
