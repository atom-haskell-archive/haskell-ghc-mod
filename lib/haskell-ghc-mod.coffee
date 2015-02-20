GhcModiProcess = require './ghc-modi-process'
{HaskellGhcModMessage,HaskellGhcModMessageElement} =
  require('./haskell-ghc-mod-message')
{CompositeDisposable} = require 'atom'
EditorController = require './editor-controller'

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
        'Disable if experiencing problems. It is noticeably slower,'+
        ' but can help with ghc-modi bugs'
    ghcModiPath:
      type: 'string'
      default: 'ghc-modi'
      description: 'Path to ghc-modi'

  activate: (state) ->
    @subscriptions = new CompositeDisposable
    @process=new GhcModiProcess
    @editorMap = new WeakMap

    atom.views.addViewProvider HaskellGhcModMessage, (message)->
      el=new HaskellGhcModMessageElement
      el.setModel(message)
      el

    @subscriptions.add atom.commands.add 'atom-text-editor',
      'haskell-ghc-mod:type': ({target}) =>
        @editorMap.get(target.getModel())?.getType()
      'haskell-ghc-mod:info': ({target}) =>
        @editorMap.get(target.getModel())?.getInfo()
      'haskell-ghc-mod:insert-type': ({target}) =>
        @editorMap.get(target.getModel())?.insertType()
      'haskell-ghc-mod:check': ({target}) =>
        @editorMap.get(target.getModel())?.doCheck()

    @subscriptions.add atom.workspace.observeTextEditors (editor) =>
      return unless editor.getGrammar().scopeName=="source.haskell"
      @editorMap.set(editor,new EditorController(@process,editor))

  deactivate: ->
    for editor in atom.workspace.getEditors()
      @editorMap.get(editor)?.desrtoy?()
    @subscriptions.dispose()
    @process?.destroy()

  provideGhcMod_0_1_0: ->
    if @process?
      type: @process.getType
      info: @process.getInfo
      check: @process.doCheck
      list: @process.runList
      lang: @process.runLang
      flag: @process.runFlag
      browse: @process.runBrowse
