{CompositeDisposable} = require 'atom'
ImportListView = require './views/import-list-view'

module.exports =
class UPIConsumer
  messageTypes:
    error: {}
    warning: {}
    lint: {}

  contextScope: 'atom-text-editor[data-grammar~="haskell"]'

  globalCommands: ->
    'haskell-ghc-mod:check-file': @checkCommand
    'haskell-ghc-mod:lint-file': @lintCommand

  mainMenu:
    [
      {label: 'Check', command: 'haskell-ghc-mod:check-file'}
      {label: 'Lint', command: 'haskell-ghc-mod:lint-file'}
    ]

  contextCommands: ->
    'haskell-ghc-mod:show-type': @typeCommand
    'haskell-ghc-mod:show-info': @infoCommand
    'haskell-ghc-mod:case-split': @caseSplitCommand
    'haskell-ghc-mod:go-to-declaration': @goToDeclCommand
    'haskell-ghc-mod:show-info-fallback-to-type': @infoTypeCommand
    'haskell-ghc-mod:insert-type': @insertTypeCommand
    'haskell-ghc-mod:insert-import': @insertImportCommand

  contextMenu:
    label: 'ghc-mod'
    submenu:
      [
        {label: 'Show Type', command: 'haskell-ghc-mod:show-type'}
        {label: 'Show Info', command: 'haskell-ghc-mod:show-info'}
        {label: 'Case Split', command: 'haskell-ghc-mod:case-split'}
        {label: 'Insert Type', command: 'haskell-ghc-mod:insert-type'}
        {label: 'Insert Import', command: 'haskell-ghc-mod:insert-import'}
        {label: 'Go To Declaration', command: 'haskell-ghc-mod:go-to-declaration'}
      ]

  upi: null
  process: null

  constructor: (service, @process) ->
    @upi = service.registerPlugin @disposables = new CompositeDisposable
    @upi.setMessageTypes @messageTypes

    @disposables.add atom.commands.add @contextScope, @contextCommands()

    @upi.onShouldShowTooltip @shouldShowTooltip

    @disposables.add @process.onBackendActive =>
      @upi.setStatus status: 'progress'

    @disposables.add @process.onBackendIdle =>
      @upi.setStatus status: 'ready'

    cm = {}
    cm[@contextScope] = [@contextMenu]
    @disposables.add atom.contextMenu.add cm

    unless atom.config.get 'haskell-ghc-mod.useLinter'
      @disposables.add atom.commands.add @contextScope, @globalCommands()
      @upi.setMenu 'ghc-mod', @mainMenu
      @disposables.add @upi.onDidSaveBuffer (buffer) =>
        @checkLint buffer, 'Save'
      @disposables.add @upi.onDidStopChanging (buffer) =>
        @checkLint buffer, 'Change', true
    else
      @upi.setMenu 'ghc-mod', [
        {label: 'Check', command: 'linter:lint'}
      ]

    @upi.setMenu 'ghc-mod', [
      {label: 'Stop Backend', command: 'haskell-ghc-mod:shutdown-backend'}
    ]

  destroy: ->
    @disposables.dispose()
    @upi = null
    @process = null

  shouldShowTooltip: (editor, crange, type) =>
    switch type
      when 'mouse', undefined
        switch atom.config.get('haskell-ghc-mod.onMouseHoverShow')
          when 'Type'
            @typeTooltip editor.getBuffer(), crange
          when 'Info'
            @infoTooltip editor, crange
          when 'Info, fallback to Type'
            @infoTypeTooltip editor, crange
      when 'selection'
        if atom.config.get('haskell-ghc-mod.showTypeOnSelection')
          @typeTooltip editor.getBuffer(), crange

  checkCommand: ({target}) =>
    editor = target.getModel()
    @process.doCheckBuffer(editor.getBuffer()).then (res) =>
      @setMessages res, ['error', 'warning']

  lintCommand: ({target}) =>
    editor = target.getModel()
    @process.doLintBuffer(editor.getBuffer()).then (res) =>
      @setMessages res, ['lint']

  typeCommand: ({target, detail}) =>
    @upi.showTooltip
      editor: target.getModel()
      detail: detail
      tooltip: (crange) =>
        @typeTooltip target.getModel().getBuffer(), crange

  infoCommand: ({target, detail}) =>
    @upi.showTooltip
      editor: target.getModel()
      detail: detail
      tooltip: (crange) =>
        @infoTooltip target.getModel(), crange

  infoTypeCommand: ({target, detail}) =>
    @upi.showTooltip
      editor: target.getModel()
      detail: detail
      tooltip: (crange) =>
        @infoTypeTooltip target.getModel(), crange

  insertTypeCommand: ({target, detail}) =>
    Util = require './util'
    editor = target.getModel()
    @upi.withEventRange {editor, detail}, ({crange, pos}) =>
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

  caseSplitCommand: ({target, detail}) =>
    editor = target.getModel()
    @upi.withEventRange {editor, detail}, ({crange}) =>
      @process.doCaseSplit(editor.getBuffer(), crange)
      .then (res) ->
        res.forEach ({range, replacement}) ->
          editor.setTextInBufferRange(range, replacement)

  goToDeclCommand: ({target, detail}) =>
    editor = target.getModel()
    @upi.withEventRange {editor, detail}, ({crange}) =>
      @process.getInfoInBuffer(editor, crange)
      .then ({range, info}) ->
        res = /.*-- Defined at (.+):(\d+):(\d+)$/.exec info
        return unless res?
        [_, fn, line, col] = res
        atom.workspace.open fn,
          initialLine: parseInt(line) - 1
          initialColumn: parseInt(col) - 1

  insertImportCommand: ({target, detail}) =>
    editor = target.getModel()
    buffer = editor.getBuffer()
    @upi.withEventRange {editor, detail}, ({crange}) =>
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

  typeTooltip: (b, p) ->
    @process.getTypeInBuffer(b, p)
    .then ({range, type}) ->
      range: range
      text:
        text: type
        highlighter:
          if atom.config.get('haskell-ghc-mod.highlightTooltips')
            'hint.type.haskell'

  infoTooltip: (e, p) ->
    @process.getInfoInBuffer(e, p)
    .then ({range, info}) ->
      range: range
      text:
        text: info
        highlighter:
          if atom.config.get('haskell-ghc-mod.highlightTooltips')
            'source.haskell'

  infoTypeTooltip: (e, p) ->
    args = arguments
    @infoTooltip(e, p)
    .catch =>
      @typeTooltip(e.getBuffer(), p)

  setHighlighter: ->
    if atom.config.get('haskell-ghc-mod.highlightMessages')
      (m) ->
        m.message=
          text: m.message
          highlighter: 'hint.message.haskell'
        m
    else
      (m) -> m

  setMessages: (messages, types) ->
    @upi.setMessages messages.map(@setHighlighter()), types

  checkLint: (buffer, opt, fast) ->
    if atom.config.get("haskell-ghc-mod.on#{opt}Check") and
       atom.config.get("haskell-ghc-mod.on#{opt}Lint")
      @process.doCheckAndLint(buffer, fast).then (res) =>
        @setMessages res, ['error', 'warning', 'lint']
    else if atom.config.get("haskell-ghc-mod.on#{opt}Check")
      @process.doCheckBuffer(buffer, fast).then (res) =>
        @setMessages res, ['error', 'warning']
    else if atom.config.get("haskell-ghc-mod.on#{opt}Lint")
      @process.doLintBuffer(buffer, fast).then (res) =>
        @setMessages res, ['lint']
