GhcModiProcess = require './ghc-modi-process'
IdeBackend = require './ide-backend'
CompletionBackend = require './completion-backend'
{CompositeDisposable} = require 'atom'

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
        'Using GHC Modi is suggested and noticeably faster,
         but if experiencing problems, disabling it can sometimes help.'
    ghcModiPath:
      type: 'string'
      default: 'ghc-modi'
      description: 'Path to ghc-modi. Only relevant for ghc-mod<5.4.0.0'
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
    syncTimeout:
      type: 'integer'
      description: 'Some ghc-mod operations need to be run in sync. This option
                    sets timeout for such operations. Increase if getting
                    ETIMEDOUT errors.'
      default: 5000
      minimum: 100

    onSaveCheck:
      type: "boolean"
      default: true
      description: "Check file on save"

    onSaveLint:
      type: "boolean"
      default: true
      description: "Lint file on save"

    onMouseHoverShow:
      type: 'string'
      default: 'Info, fallback to Type'
      enum: ['Nothing', 'Type', 'Info', 'Info, fallback to Type']

    useLinter:
      type: 'boolean'
      default: false
      description: 'Use Atom Linter service for check and lint
                    (requires restart)'

  activate: (state) ->
    @process = new GhcModiProcess

  deactivate: ->
    @process?.destroy()
    @process = null
    @ideBackend = null
    @completionBackend = null

  provideCompletionBackend: ->
    @completionBackend ?= new CompletionBackend @process
    @completionBackend

  consumeUPI: (upi) ->
    console.log "consumeUPI"
    disposables = new CompositeDisposable
    disposables.add upi.disposables

    upi.setMessageTypes
      error: {}
      warning: {}
      lint: {}

    disposables.add atom.commands.add 'atom-workspace',
      'ide-haskell:shutdown-backend': =>
        @process?.killProcess?()

    disposables.add atom.commands.add 'atom-text-editor[data-grammar~="haskell"]',
      'haskell-ghc-mod:check-file': ({target}) =>
        editor = target.getModel()
        @process.doCheckBuffer editor.getBuffer(), (res) ->
          upi.setMessages res, ['error', 'warning']
      'haskell-ghc-mod:lint-file': ({target}) =>
        editor = target.getModel()
        @process.doLintBuffer editor.getBuffer(), (res) ->
          upi.setMessages res, ['lint']
      'haskell-ghc-mod:show-type': ({target, detail}) =>
        upi.showTooltip
          editor: target.getModel()
          detail: detail
          tooltip: (crange) =>
            new Promise (resolve, reject) =>
              @process.getTypeInBuffer target.getModel().getBuffer(), crange, ({range, type}) ->
                if type?
                  resolve {range, text: type}
                else
                  reject()
      'haskell-ghc-mod:show-info': ({target, detail}) =>
        upi.showTooltip
          editor: target.getModel()
          detail: detail
          tooltip: (crange) =>
            new Promise (resolve, reject) =>
              @process.getInfoInBuffer target.getModel().getBuffer(), crange, ({range, info}) ->
                if info?
                  resolve {range, text: info}
                else
                  reject()
      'haskell-ghc-mod:show-info-fallback-to-type': ({target, detail}) =>
        upi.showTooltip
          editor: target.getModel()
          detail: detail
          tooltip: (crange) =>
            new Promise (resolve, reject) =>
              @process.getInfoInBuffer target.getModel().getBuffer(), crange, ({range, info}) =>
                if info?
                  resolve {range, text: info}
                else
                  @process.getTypeInBuffer target.getModel().getBuffer(), crange, ({range, type}) ->
                    if type?
                      resolve {range, text: type}
                    else
                      reject()
      'haskell-ghc-mod:insert-type': ({target, detail}) =>
        editor = target.getModel()
        upi.withEventRange {editor, detail}, ({crange}) =>
          @process.getTypeInBuffer editor.getBuffer(), crange, ({range, type}) ->
            n = editor.indentationForBufferRow(range.start.row)
            indent = ' '.repeat n * editor.getTabLength()
            editor.scanInBufferRange /[\w'.]+/, range, ({matchText, stop}) ->
              symbol = matchText
              pos = [range.start.row, 0]
              editor.setTextInBufferRange [pos, pos],
                indent + symbol + " :: " + type + "\n"
              stop()
      # 'haskell-ghc-mod:insert-import': ({target, detail}) =>
      #   @pluginManager.insertImport target.getModel(), getEventType(detail)

    upi.onShouldShowTooltip (editor, crange) =>
      new Promise (resolve, reject) =>
        switch atom.config.get('haskell-ghc-mod.onMouseHoverShow')
          when 'Type'
            @process.getTypeInBuffer editor.getBuffer(), crange, ({range, type}) ->
              if type?
                resolve {range, text: type}
              else
                reject()
          when 'Info'
            @process.getInfoInBuffer editor.getBuffer(), crange, ({range, info}) ->
              if info?
                resolve {range, text: info}
              else
                reject()
          when 'Info, fallback to Type'
            @process.getInfoInBuffer editor.getBuffer(), crange, ({range, info}) =>
              if info?
                resolve {range, text: info}
              else
                @process.getTypeInBuffer editor.getBuffer(), crange, ({range, type}) ->
                  if type?
                    resolve {range, text: type}
                  else
                    reject()
          else
            reject {}

    disposables.add upi.onDidSaveBuffer (buffer) =>
      if atom.config.get('haskell-ghc-mod.onSaveCheck') and
         atom.config.get('haskell-ghc-mod.onSaveLint')
        upi.clearMessages ['error', 'warning', 'lint']
        @process.doCheckBuffer buffer, (res) ->
          upi.addMessages res, ['error', 'warning', 'lint']
        @process.doLintBuffer buffer, (res) ->
          upi.addMessages res, ['error', 'warning', 'lint']
      else if atom.config.get('haskell-ghc-mod.onSaveCheck')
        @process.doCheckBuffer buffer, (res) ->
          upi.setMessages res, ['error', 'warning']
      else if atom.config.get('haskell-ghc-mod.onSaveLint')
        @process.doLintBuffer buffer, (res) ->
          upi.setMessages res, ['lint']

    disposables.add @process.onBackendActive ->
      upi.setStatus status: 'progress'

    disposables.add @process.onBackendIdle ->
      upi.setStatus status: 'ready'

    @process.onBackendActive

    upi.setMenu 'Ghc-Mod', [
      {label: 'Check', command: 'haskell-ghc-mod:check-file'}
      {label: 'Lint', command: 'haskell-ghc-mod:lint-file'}
      {label: 'Stop Backend', command: 'haskell-ghc-mod:shutdown-backend'}
    ]

    disposables.add atom.contextMenu.add
      'atom-text-editor[data-grammar~="haskell"]': [
        'label': 'Ghc-Mod'
        'submenu': [
            'label': 'Show Type'
            'command': 'haskell-ghc-mod:show-type'
          ,
            'label': 'Show Info'
            'command': 'haskell-ghc-mod:show-info'
          ,
            'label': 'Insert Type'
            'command': 'haskell-ghc-mod:insert-type'
          ,
            'label': 'Insert Import'
            'command': 'haskell-ghc-mod:insert-import'
        ]
      ]

    disposables

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
