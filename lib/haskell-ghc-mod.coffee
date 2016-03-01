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
    cabalSandbox:
      type: 'boolean'
      default: true
      description: 'Add cabal sandbox bin-path to PATH'
    stackSandbox:
      type: 'boolean'
      default: true
      description: 'Add stack bin-path to PATH'
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

    showTypeOnSelection:
      type: 'boolean'
      default: false
      description:
        'Show type of selected expression if editor selection changed'

    useLinter:
      type: 'boolean'
      default: false
      description: 'Use \'linter\' package instead of \'ide-haskell\'
                    to display check and lint results
                    (requires restart)'
    maxBrowseProcesses:
      type: 'integer'
      default: 2
      description: 'Maximum number of parallel ghc-mod browse processes, which
                    are used in autocompletion backend initialization.
                    Note that on larger projects it may require a considerable
                    amount of memory.'
    highlightTooltips:
      type: 'boolean'
      default: true
      description: 'Show highlighting for type/info tooltips'
    highlightMessages:
      type: 'boolean'
      default: true
      description: 'Show highlighting for output panel messages'

  activate: (state) ->
    GhcModiProcess = require './ghc-mod/ghc-modi-process'
    @process = new GhcModiProcess
    @disposables = null

  deactivate: ->
    @process?.destroy?()
    @process = null
    @completionBackend = null
    @disposables?.dispose?()
    @disposables = null

  provideCompletionBackend: ->
    return unless @process?
    CompletionBackend = require './completion-backend/completion-backend'
    @completionBackend ?= new CompletionBackend @process
    @completionBackend

  consumeUPI: (service) ->
    return unless @process?
    {CompositeDisposable} = require 'atom'
    ImportListView = require './views/import-list-view'
    upi = service.registerPlugin @disposables = new CompositeDisposable

    upi.setMessageTypes
      error: {}
      warning: {}
      lint: {}

    @disposables.add atom.commands.add 'atom-workspace',
      'haskell-ghc-mod:shutdown-backend': =>
        @process?.killProcess?()

    typeTooltip = (b, p) =>
      @process.getTypeInBuffer(b, p)
      .then ({range, type}) ->
        range: range
        text:
          text: type
          highlighter:
            if atom.config.get('haskell-ghc-mod.highlightTooltips')
              'hint.type.haskell'
    infoTooltip = (e, p) =>
      @process.getInfoInBuffer(e, p)
      .then ({range, info}) ->
        range: range
        text:
          text: info
          highlighter:
            if atom.config.get('haskell-ghc-mod.highlightTooltips')
              'source.haskell'
    infoTypeTooltip = (e, p) ->
      args = arguments
      infoTooltip(e, p)
      .catch ->
        typeTooltip(e.getBuffer(), p)

    setMessages = (messages, types) ->
      setHighlighter =
        if atom.config.get('haskell-ghc-mod.highlightMessages')
          (m) ->
            m.message=
              text: m.message
              highlighter: 'hint.message.haskell'
            m
        else
          (m) -> m
      upi.setMessages messages.map(setHighlighter), types

    unless atom.config.get 'haskell-ghc-mod.useLinter'
      @disposables.add atom.commands.add 'atom-text-editor[data-grammar~="haskell"]',
        'haskell-ghc-mod:check-file': ({target}) =>
          editor = target.getModel()
          @process.doCheckBuffer(editor.getBuffer()).then (res) ->
            setMessages res, ['error', 'warning']
        'haskell-ghc-mod:lint-file': ({target}) =>
          editor = target.getModel()
          @process.doLintBuffer(editor.getBuffer()).then (res) ->
            setMessages res, ['lint']

    @disposables.add atom.commands.add 'atom-text-editor[data-grammar~="haskell"]',
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
            infoTooltip target.getModel(), crange
      'haskell-ghc-mod:go-to-declaration': ({target, detail}) =>
        editor = target.getModel()
        upi.withEventRange {editor, detail}, ({crange}) =>
          @process.getInfoInBuffer(editor, crange)
          .then ({range, info}) ->
            res = /.*-- Defined at (.+):(\d+):(\d+)$/.exec info
            return unless res?
            [_, fn, line, col] = res
            atom.workspace.open fn,
              initialLine: parseInt(line) - 1
              initialColumn: parseInt(col) - 1
      'haskell-ghc-mod:show-info-fallback-to-type': ({target, detail}) ->
        upi.showTooltip
          editor: target.getModel()
          detail: detail
          tooltip: (crange) ->
            infoTypeTooltip target.getModel(), crange
      'haskell-ghc-mod:insert-type': ({target, detail}) =>
        Util = require './util'
        editor = target.getModel()
        upi.withEventRange {editor, detail}, ({crange, pos}) =>
          @process.getTypeInBuffer(editor.getBuffer(), crange)
          .then (o) ->
            {type} = o
            {scope, range, symbol} = Util.getSymbolAtPoint editor, pos
            if editor.getTextInBufferRange(o.range).match(/[=]/)?
              indent = editor.getTextInBufferRange([[o.range.start.row, 0], o.range.start])
              symbol = "(#{symbol})" if scope is 'keyword.operator.haskell'
              birdTrack = ''
              if 'meta.embedded.haskell' in editor.scopeDescriptorForBufferPosition(pos).getScopesArray()
                birdTrack = indent.slice 0, 2
                indent = indent.slice(2)
              if indent.match(/\S/)?
                indent = indent.replace /\S/g, ' '
              editor.setTextInBufferRange [o.range.start, o.range.start],
                "#{symbol} :: #{type}\n#{birdTrack}#{indent}"
            else if not scope? #neither operator nor infix
              editor.setTextInBufferRange o.range,
                "(#{editor.getTextInBufferRange(o.range)} :: #{type})"
      'haskell-ghc-mod:insert-import': ({target, detail}) =>
        editor = target.getModel()
        buffer = editor.getBuffer()
        upi.withEventRange {editor, detail}, ({crange}) =>
          @process.findSymbolProvidersInBuffer editor, crange
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

    upi.onShouldShowTooltip (editor, crange, type) ->
      switch type
        when 'mouse', undefined
          switch atom.config.get('haskell-ghc-mod.onMouseHoverShow')
            when 'Type'
              typeTooltip editor.getBuffer(), crange
            when 'Info'
              infoTooltip editor, crange
            when 'Info, fallback to Type'
              infoTypeTooltip editor, crange
        when 'selection'
          if atom.config.get('haskell-ghc-mod.showTypeOnSelection')
            typeTooltip editor.getBuffer(), crange

    checkLint = (buffer, opt, fast) =>
      if atom.config.get("haskell-ghc-mod.on#{opt}Check") and
         atom.config.get("haskell-ghc-mod.on#{opt}Lint")
        @process.doCheckAndLint(buffer, fast).then (res) ->
          setMessages res, ['error', 'warning', 'lint']
      else if atom.config.get("haskell-ghc-mod.on#{opt}Check")
        @process.doCheckBuffer(buffer, fast).then (res) ->
          setMessages res, ['error', 'warning']
      else if atom.config.get("haskell-ghc-mod.on#{opt}Lint")
        @process.doLintBuffer(buffer, fast).then (res) ->
          setMessages res, ['lint']

    unless atom.config.get 'haskell-ghc-mod.useLinter'
      @disposables.add upi.onDidSaveBuffer (buffer) ->
        checkLint buffer, 'Save'

      @disposables.add upi.onDidStopChanging (buffer) ->
        checkLint buffer, 'Change', true


    @disposables.add @process.onBackendActive ->
      upi.setStatus status: 'progress'

    @disposables.add @process.onBackendIdle ->
      upi.setStatus status: 'ready'

    unless atom.config.get 'haskell-ghc-mod.useLinter'
      upi.setMenu 'ghc-mod', [
        {label: 'Check', command: 'haskell-ghc-mod:check-file'}
        {label: 'Lint', command: 'haskell-ghc-mod:lint-file'}
      ]
    else
      upi.setMenu 'ghc-mod', [
        {label: 'Check', command: 'linter:lint'}
      ]

    upi.setMenu 'ghc-mod', [
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
      lintOnFly: 'onChangeCheck'
      enabledConf: 'onSaveCheck'
    ,
      func: 'doLintBuffer'
      lintOnFly: 'onChangeLint'
      enabledConf: 'onSaveLint'
    ].map ({func, lintOnFly, enabledConf}) =>
      linter =
      grammarScopes: ['source.haskell', 'text.tex.latex.haskell']
      scope: 'file'
      lintOnFly: false
      lint: (textEditor) =>
        return unless @process?
        return unless atom.config.get("haskell-ghc-mod.#{enabledConf}") or
          atom.config.get("haskell-ghc-mod.#{lintOnFly}")
        return if textEditor.isEmpty()
        @process[func](textEditor.getBuffer(), lintOnFly).then (res) ->
          res.map ({uri, position, message, severity}) ->
            [message, messages...] = message.split /^(?!\s)/gm
            {
              type: severity
              text: message.replace(/\n+$/, '')
              filePath: uri
              range: [position, position.translate [0, 1]]
              trace: messages.map (text) ->
                type: 'trace'
                text: text.replace(/\n+$/, '')
            }

      # NOTE: some pretty gnarly hacks here...
      disp = atom.config.observe "haskell-ghc-mod.#{lintOnFly}", (value) ->
        linter.lintOnFly = value

      Object.observe linter, ->
        if linter.deactivated
          disp.dispose()

      return linter
