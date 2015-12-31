GhcModiProcess = require './ghc-modi-process'
CompletionBackend = require './completion-backend'
{CompositeDisposable} = require 'atom'
ImportListView = require './views/import-list-view'

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
                    You might want to add path to a directory with
                    ghc, cabal, etc binaries here.
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

    onChangeCheck:
      type: "boolean"
      default: false
      description: "Check file on change"

    onChangeLint:
      type: "boolean"
      default: false
      description: "Lint file on change"

    onMouseHoverShow:
      type: 'string'
      default: 'Info, fallback to Type'
      enum: ['Nothing', 'Type', 'Info', 'Info, fallback to Type']

    useLinter:
      type: 'boolean'
      default: false
      description: 'Use Atom Linter service for check and lint
                    (requires restart)'
    maxBrowseProcesses:
      type: 'integer'
      default: 2
      description: 'Maximum number of parallel ghc-mod browse processes, which
                    are used in autocompletion backend initialization.
                    Note that on larger projects it may require a considerable
                    amount of memory.'

  activate: (state) ->
    try
      @process = new GhcModiProcess
    catch err
      atom.notifications.addFatalError """
        Haskell-ghc-mod: ghc-mod failed to launch.
        It is probably missing or misconfigured.

        Restart Atom after configuring.
        """,
        detail: err
        stack: err.stack
        dismissable: true
    @disposables = null

  deactivate: ->
    @process?.destroy?()
    @process = null
    @completionBackend = null
    @disposables?.dispose?()
    @disposables = null

  provideCompletionBackend: ->
    return unless @process?
    @completionBackend ?= new CompletionBackend @process
    @completionBackend

  consumeUPI: (service) ->
    return unless @process?
    upi = service.registerPlugin @disposables = new CompositeDisposable

    upi.setMessageTypes
      error: {}
      warning: {}
      lint: {}

    @disposables.add atom.commands.add 'atom-workspace',
      'haskell-ghc-mod:shutdown-backend': =>
        @process?.killProcess?()

    typeTooltip = =>
      @process.getTypeInBuffer(arguments...)
      .then ({range, type}) -> {range, text: type}
    infoTooltip = =>
      @process.getInfoInBuffer(arguments...)
      .then ({range, info}) -> {range, text: info}
    infoTypeTooltip = ->
      args = arguments
      infoTooltip(args...)
      .catch ->
        typeTooltip(args...)

    @disposables.add atom.commands.add 'atom-text-editor[data-grammar~="haskell"]',
      'haskell-ghc-mod:check-file': ({target}) =>
        editor = target.getModel()
        @process.doCheckBuffer(editor.getBuffer()).then (res) ->
          upi.setMessages res, ['error', 'warning']
      'haskell-ghc-mod:lint-file': ({target}) =>
        editor = target.getModel()
        @process.doLintBuffer(editor.getBuffer()).then (res) ->
          upi.setMessages res, ['lint']
      'haskell-ghc-mod:show-type': ({target, detail}) ->
        upi.showTooltip
          editor: target.getModel()
          detail: detail
          tooltip: (crange) ->
            typeTooltip target.getModel().getBuffer(), crange
      'haskell-ghc-mod:show-info': ({target, detail}) ->
        upi.showTooltip
          editor: target.getModel()
          detail: detail
          tooltip: (crange) ->
            infoTooltip target.getModel().getBuffer(), crange
      'haskell-ghc-mod:go-to-declaration': ({target, detail}) =>
        editor = target.getModel()
        upi.withEventRange {editor, detail}, ({crange}) =>
          @process.getInfoInBuffer(editor.getBuffer(), crange)
          .then ({range, info}) ->
            res = /.*-- Defined at (.+):(\d+):(\d+)$/.exec info
            return unless res?
            [_, fn, line, col] = res
            console.log fn, line, col
            atom.workspace.open fn,
              initialLine: parseInt(line) - 1
              initialColumn: parseInt(col) - 1
      'haskell-ghc-mod:show-info-fallback-to-type': ({target, detail}) ->
        upi.showTooltip
          editor: target.getModel()
          detail: detail
          tooltip: (crange) ->
            infoTypeTooltip target.getModel().getBuffer(), crange
      'haskell-ghc-mod:insert-type': ({target, detail}) =>
        editor = target.getModel()
        upi.withEventRange {editor, detail}, ({crange}) =>
          @process.getTypeInBuffer(editor.getBuffer(), crange)
          .then ({range, type}) ->
            n = editor.indentationForBufferRow(range.start.row)
            indent = ' '.repeat n * editor.getTabLength()
            inScope = (scope) ->
              editor
              .scopeDescriptorForBufferPosition(crange.start)
              .getScopesArray()
              .some (v) -> v is scope
            symbolP = switch
              when inScope "keyword.operator.haskell"
                "(#{editor.getTextInBufferRange editor.bufferRangeForScopeAtCursor "keyword.operator.haskell"})"
              when inScope "entity.name.function.infix.haskell"
                editor.getTextInBufferRange editor.bufferRangeForScopeAtCursor "entity.name.function.infix.haskell"
              else
                new Promise (resolve) ->
                  editor.scanInBufferRange /[\w'.]+/, range, ({matchText, stop}) ->
                    resolve(matchText)
                    stop()
                  resolve("unknown")
            pos = [range.start.row, 0]
            Promise.resolve(symbolP).then (symbol) ->
              editor.setTextInBufferRange [pos, pos],
                indent + symbol + " :: " + type + "\n"
      'haskell-ghc-mod:insert-import': ({target, detail}) =>
        editor = target.getModel()
        buffer = editor.getBuffer()
        upi.withEventRange {editor, detail}, ({crange}) =>
          @process.findSymbolProvidersInBuffer buffer, crange
          .then (lines) ->
            new ImportListView
              items: lines
              onConfirmed: (mod) ->
                piP = new Promise (resolve) ->
                  buffer.backwardsScan /^(\s*)(import|module)/, ({match, range, stop}) ->
                    resolve
                      pos: buffer.rangeForRow(range.start.row).end
                      indent:
                        switch match[2]
                          when "import"
                            "\n" + match[1]
                          when "module"
                            "\n\n" + match[1]
                  resolve
                    pos: buffer.getFirstPosition()
                    indent: ""
                    end: "\n"
                piP.then (pi) ->
                  editor.setTextInBufferRange [pi.pos, pi.pos], "#{pi.indent}import #{mod}#{pi.end ? ''}"

    upi.onShouldShowTooltip (editor, crange) ->
      switch atom.config.get('haskell-ghc-mod.onMouseHoverShow')
        when 'Type'
          typeTooltip editor.getBuffer(), crange
        when 'Info'
          infoTooltip editor.getBuffer(), crange
        when 'Info, fallback to Type'
          infoTypeTooltip editor.getBuffer(), crange
        else
          Promise.reject ignore: true #this won't set backend status

    checkLint = (buffer, opt, fast) =>
      if atom.config.get("haskell-ghc-mod.on#{opt}Check") and
         atom.config.get("haskell-ghc-mod.on#{opt}Lint")
        @process.doCheckAndLint(buffer, fast).then (res) ->
          upi.setMessages res, ['error', 'warning', 'lint']
      else if atom.config.get("haskell-ghc-mod.on#{opt}Check")
        @process.doCheckBuffer(buffer, fast).then (res) ->
          upi.setMessages res, ['error', 'warning']
      else if atom.config.get("haskell-ghc-mod.on#{opt}Lint")
        @process.doLintBuffer(buffer, fast).then (res) ->
          upi.setMessages res, ['lint']

    @disposables.add upi.onDidSaveBuffer (buffer) ->
      checkLint buffer, 'Save'

    @disposables.add upi.onDidStopChanging (buffer) ->
      checkLint buffer, 'Change', true


    @disposables.add @process.onBackendActive ->
      upi.setStatus status: 'progress'

    @disposables.add @process.onBackendIdle ->
      upi.setStatus status: 'ready'

    upi.setMenu 'ghc-mod', [
      {label: 'Check', command: 'haskell-ghc-mod:check-file'}
      {label: 'Lint', command: 'haskell-ghc-mod:lint-file'}
      {label: 'Stop Backend', command: 'haskell-ghc-mod:shutdown-backend'}
    ]

    @disposables.add atom.contextMenu.add
      'atom-text-editor[data-grammar~="haskell"]': [
        'label': 'ghc-mod'
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
          ,
            'label': 'Go To Declaration'
            'command': 'haskell-ghc-mod:go-to-declaration'
        ]
      ]

    @disposables

  provideLinter: ->
    return unless atom.config.get 'haskell-ghc-mod.useLinter'
    [
      func: 'doCheckBuffer'
      lintOnFly: false
      scopes: ['source.haskell', 'text.tex.latex.haskell']
    ,
      func: 'doLintBuffer'
      lintOnFly: true
      scopes: ['source.haskell']
    ].map ({func, scopes, lintOnFly}) =>
      grammarScopes: scopes
      scope: 'file'
      lintOnFly: lintOnFly
      lint: (textEditor) =>
        return unless @process?
        return if textEditor.isEmpty()
        @process[func](textEditor.getBuffer(), lintOnFly).then (res) ->
          res.map ({uri, position, message, severity}) ->
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
