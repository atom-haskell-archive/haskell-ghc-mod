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
    'haskell-ghc-mod:show-type': @tooltipCommand @typeTooltip
    'haskell-ghc-mod:show-info': @tooltipCommand @infoTooltip
    'haskell-ghc-mod:case-split': @caseSplitCommand
    'haskell-ghc-mod:sig-fill': @sigFillCommand
    'haskell-ghc-mod:go-to-declaration': @goToDeclCommand
    'haskell-ghc-mod:show-info-fallback-to-type': @tooltipCommand @infoTypeTooltip
    'haskell-ghc-mod:show-type-fallback-to-info': @tooltipCommand @typeInfoTooltip
    'haskell-ghc-mod:show-type-and-info': @tooltipCommand @typeAndInfoTooltip
    'haskell-ghc-mod:insert-type': @insertTypeCommand
    'haskell-ghc-mod:insert-import': @insertImportCommand

  contextMenu:
    label: 'ghc-mod'
    submenu:
      [
        {label: 'Show Type', command: 'haskell-ghc-mod:show-type'}
        {label: 'Show Info', command: 'haskell-ghc-mod:show-info'}
        {label: 'Show Type And Info', command: 'haskell-ghc-mod:show-type-and-info'}
        {label: 'Case Split', command: 'haskell-ghc-mod:case-split'}
        {label: 'Sig Fill', command: 'haskell-ghc-mod:sig-fill'}
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
        if t = atom.config.get('haskell-ghc-mod.onMouseHoverShow')
          @["#{t}Tooltip"] editor, crange
      when 'selection'
        if t = atom.config.get('haskell-ghc-mod.onSelectionShow')
          @["#{t}Tooltip"] editor, crange

  checkCommand: ({currentTarget}) =>
    editor = currentTarget.getModel()
    @process.doCheckBuffer(editor.getBuffer()).then (res) =>
      @setMessages res, ['error', 'warning']

  lintCommand: ({currentTarget}) =>
    editor = currentTarget.getModel()
    @process.doLintBuffer(editor.getBuffer()).then (res) =>
      @setMessages res, ['lint']

  tooltipCommand: (tooltipfun) =>
    ({currentTarget, detail}) =>
      @upi.showTooltip
        editor: currentTarget.getModel()
        detail: detail
        tooltip: (crange) ->
          tooltipfun currentTarget.getModel(), crange

  insertTypeCommand: ({currentTarget, detail}) =>
    Util = require './util'
    editor = currentTarget.getModel()
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

  caseSplitCommand: ({currentTarget, detail}) =>
    editor = currentTarget.getModel()
    @upi.withEventRange {editor, detail}, ({crange}) =>
      @process.doCaseSplit(editor.getBuffer(), crange)
      .then (res) ->
        res.forEach ({range, replacement}) ->
          editor.setTextInBufferRange(range, replacement)

  sigFillCommand: ({currentTarget, detail}) =>
    editor = currentTarget.getModel()
    @upi.withEventRange {editor, detail}, ({crange}) =>
      @process.doSigFill(editor.getBuffer(), crange)
      .then (res) ->
        res.forEach ({type, range, body}) ->
          sig = editor.getTextInBufferRange(range)
          indent = editor.indentLevelForLine(sig)
          pos = range.end
          text = "\n#{body}"
          editor.transact ->
            if type is 'instance'
              indent += 1
              unless sig.endsWith ' where'
                editor.setTextInBufferRange([range.end, range.end], ' where')
            newrange = editor.setTextInBufferRange([pos, pos], text)
            for row in newrange.getRows().slice(1)
              editor.setIndentationForBufferRow row, indent

  goToDeclCommand: ({currentTarget, detail}) =>
    editor = currentTarget.getModel()
    @upi.withEventRange {editor, detail}, ({crange}) =>
      @process.getInfoInBuffer(editor, crange)
      .then ({range, info}) =>
        res = /.*-- Defined at (.+):(\d+):(\d+)/.exec info
        return unless res?
        [_, fn, line, col] = res
        rootDir = @process.getRootDir(editor.getBuffer())
        atom.workspace.open (try rootDir.getFile(fn).getPath() ? fn),
          initialLine: parseInt(line) - 1
          initialColumn: parseInt(col) - 1

  insertImportCommand: ({currentTarget, detail}) =>
    editor = currentTarget.getModel()
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

  typeTooltip: (e, p) =>
    @process.getTypeInBuffer(e.getBuffer(), p)
    .then ({range, type}) ->
      range: range
      text:
        text: type
        highlighter:
          if atom.config.get('haskell-ghc-mod.highlightTooltips')
            'hint.type.haskell'

  infoTooltip: (e, p) =>
    @process.getInfoInBuffer(e, p)
    .then ({range, info}) ->
      range: range
      text:
        text: info
        highlighter:
          if atom.config.get('haskell-ghc-mod.highlightTooltips')
            'source.haskell'

  infoTypeTooltip: (e, p) =>
    args = arguments
    @infoTooltip(e, p)
    .catch =>
      @typeTooltip(e, p)

  typeInfoTooltip: (e, p) =>
    args = arguments
    @typeTooltip(e, p)
    .catch =>
      @infoTooltip(e, p)

  typeAndInfoTooltip: (e, p) =>
    args = arguments
    typeP =
      @typeTooltip(e, p).catch -> return null
    infoP =
      @infoTooltip(e, p).catch -> return null
    Promise.all [typeP, infoP]
    .then ([type, info]) ->
      range:
        if type? and info?
          type.range.union(info.range)
        else if type?
          type.range
        else if info?
          info.range
        else
          throw new Error('Got neither type nor info')
      text:
        text: "#{if type?.text?.text then ':: '+type.text.text+'\n' else ''}#{info?.text?.text ? ''}"
        highlighter:
          if atom.config.get('haskell-ghc-mod.highlightTooltips')
            'source.haskell'

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
