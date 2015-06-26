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
    debug:
      type: 'boolean'
      default: false
    additionalPathDirectories:
      type: 'array'
      default: []
      description: 'Add this directories to PATH when invoking ghc-mod.
                    You might want to add path to ghc here.
                    Separate with comma.'
      items:
        type: 'string'
    useLinter:
      type: 'boolean'
      default: false
      description: 'Use Atom Linter service for check and lint
                    (requires restart)'

  activate: (state) ->
    @process = new GhcModiProcess

    unless atom.config.get('haskell-ghc-mod.suppressStartupWarning')
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

  provideLinter: ->
    return unless atom.config.get 'haskell-ghc-mod.useLinter'
    backend = new IdeBackend @process
    multiline = (message) ->
      elem = document.createElement 'linter-multiline-message'
      elem.tabIndex = 0
      console.log message.split(/\n/).map((l) -> "<line>#{l}</line>").join("")
      elem.innerHTML = message.split(/\n/).filter((l) -> l)
        .map((l) -> "<line>#{l}</line>")
        .join("")
      elem
    [
      grammarScopes: ['source.haskell', 'text.tex.latex.haskell']
      scope: 'file' # or 'project'
      lintOnFly: false # must be false for scope: 'project'
      lint: (textEditor) ->
        return new Promise (resolve, reject) ->
          backend.checkBuffer textEditor.getBuffer(), (res) ->
            resolve res.map ({uri, position, message, severity}) ->
              [message, messages...] = message.split /^(?!\s)/gm
              {
                type: severity
                html: multiline message
                filePath: uri
                range: [position, position.translate [0, 1]]
                trace: messages.map (text) ->
                  type: 'trace'
                  html: multiline text
              }
    ,
      grammarScopes: ['source.haskell']
      scope: 'file' # or 'project'
      lintOnFly: true # must be false for scope: 'project'
      lint: (textEditor) ->
        return new Promise (resolve, reject) ->
          backend?.lintBuffer textEditor.getBuffer(), (res) ->
            resolve res.map ({uri, position, message, severity}) ->
              [message, messages...] = message.split /^(?!\s)/gm
              type: severity
              html: multiline message
              filePath: uri
              range: [position, position.translate [0, 1]]
              trace: messages.map (text) ->
                type: 'trace'
                html: multiline text
    ]
