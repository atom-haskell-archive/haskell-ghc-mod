GhcModiProcess = require './ghc-modi-process'
IdeBackend = require './ide-backend'
CompletionBackend = require './completion-backend'

module.exports = HaskellGhcMod =
  process: null

  config:
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
    suppressStartupWarning:
      type: 'boolean'
      default: false

  activate: (state) ->
    @process=new GhcModiProcess

    unless atom.config.get('haskell-gch-mod.suppressStartupWarning')
      setTimeout (->
        unless atom.packages.isPackageActive('ide-haskell')
          atom.notifications.addWarning "Haskell-ghc-mod package is intended to
          be used as a backend for ide-haskell, please consider installing
          or activating it.
          You can suppress this warning in haskell-ghc-mod settings.",
          dismissable:true
        ), 5000

  deactivate: ->
    @process?.destroy()
    @process = null

  provideIdeBackend_0_1_0: ->
    new IdeBackend @process, version: '0.1.0'

  provideIdeBackend_0_1_1: ->
    new IdeBackend @process, version: '0.1.1'

  provideIdeBackend_0_1_2: ->
    new IdeBackend @process

  provideCompletionBackend_0_1_0: ->
    new CompletionBackend @process
