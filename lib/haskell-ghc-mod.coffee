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
    lowMemorySystem:
      type: 'boolean'
      default: false
      description:
        'Avoid spawning more than one ghc-mod process; also disables parallel
        features, which can help with weird stack errors'
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
    hlintOptions:
      type: 'array'
      default: []
      description: 'Command line options to pass to hlint (comma-separated)'
    experimental:
      type: 'boolean'
      default: false
      description: 'Enable experimentai features, which are expected to land in
                    next release of ghc-mod. ENABLE ONLY IF YOU KNOW WHAT YOU
                    ARE DOING'

  activate: (state) ->
    GhcModiProcess = require './ghc-mod/ghc-modi-process'
    @process = new GhcModiProcess
    {CompositeDisposable} = require 'atom'
    @disposables = new CompositeDisposable

    @disposables.add atom.commands.add 'atom-workspace',
      'haskell-ghc-mod:shutdown-backend': =>
        @process?.killProcess?()

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
    UPIConsumer = require './upi-consumer'
    {Disposable} = require 'atom'
    upiConsumer = new UPIConsumer(service, @process)
    upiConsumerDisp =
      new Disposable ->
        upiConsumer.destroy()
    @disposables.add upiConsumerDisp
    return upiConsumerDisp

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
