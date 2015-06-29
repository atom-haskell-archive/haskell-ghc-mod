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

  activate: (state) ->
    @process = new GhcModiProcess

  deactivate: ->
    @process?.destroy()
    @process = null
    @ideBackend = null
    @completionBackend = null

  provideIdeBackend: ->
    @ideBackend ?= new IdeBackend @process
    @ideBackend

  provideCompletionBackend: ->
    @completionBackend ?= new CompletionBackend @process
    @completionBackend

  provideLinter: ->
    if atom.packages.getLoadedPackage('ide-haskell')
      return unless atom.config.get 'ide-haskell.useLinter'
    backend = HaskellGhcMod.provideIdeBackend()
    [
      func: 'checkBuffer'
      lintOnFly: false
      scopes: ['source.haskell', 'text.tex.latex.haskell']
    ,
      func: 'lintBuffer'
      lintOnFly: true
      scopes: ['source.haskell']
    ].map ({func, scopes, lintOnFly}) ->
      grammarScopes: scopes
      scope: 'file'
      lintOnFly: lintOnFly
      lint: (textEditor) ->
        return new Promise (resolve, reject) ->
          backend[func] textEditor.getBuffer(), (res) ->
            resolve res.map ({uri, position, message, severity}) ->
              [message, messages...] = message.split /^(?!\s)/gm
              {
                type: severity
                text: message
                multiline: true
                filePath: uri
                range: [position, position.translate [0, 1]]
                trace: messages.map (text) ->
                  type: 'trace'
                  text: text
                  multiline: true
              }
