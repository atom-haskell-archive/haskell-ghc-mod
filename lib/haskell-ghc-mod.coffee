tooltipActions =
  [
    {value: '', description: 'Nothing'}
    {value: 'type', description: 'Type'}
    {value: 'info', description: 'Info'}
    {value: 'infoType', description: 'Info, fallback to Type'}
    {value: 'typeInfo', description: 'Type, fallback to Info'}
    {value: 'typeAndInfo', description: 'Type and Info'}
  ]

module.exports = HaskellGhcMod =
  process: null

  config:
    ghcModPath:
      type: 'string'
      default: 'ghc-mod'
      description: 'Path to ghc-mod'
      order: 0
    enableGhcModi:
      type: 'boolean'
      default: true
      description:
        'Using GHC Modi is suggested and noticeably faster,
         but if experiencing problems, disabling it can sometimes help.'
      order: 70
    lowMemorySystem:
      type: 'boolean'
      default: false
      description:
        'Avoid spawning more than one ghc-mod process; also disables parallel
        features, which can help with weird stack errors'
      order: 70
    debug:
      type: 'boolean'
      default: false
      order: 999
    additionalPathDirectories:
      type: 'array'
      default: []
      description: 'Add this directories to PATH when invoking ghc-mod.
                    You might want to add path to a directory with
                    ghc, cabal, etc binaries here.
                    Separate with comma.'
      items:
        type: 'string'
      order: 0
    cabalSandbox:
      type: 'boolean'
      default: true
      description: 'Add cabal sandbox bin-path to PATH'
      order: 100
    stackSandbox:
      type: 'boolean'
      default: true
      description: 'Add stack bin-path to PATH'
      order: 100
    initTimeout:
      type: 'integer'
      description: 'How long to wait for initialization commands (checking
                    GHC and ghc-mod versions, getting stack sandbox) until
                    assuming those hanged and bailing. In seconds.'
      default: 60
      minimum: 1
      order: 50
    interactiveInactivityTimeout:
      type: 'integer'
      description: 'Kill ghc-mod interactive process (ghc-modi) after this
                    number of minutes of inactivity to conserve memory. 0
                    means never.'
      default: 60
      minimum: 0
      order: 50
    interactiveActionTimeout:
      type: 'integer'
      description: 'Timeout for interactive ghc-mod commands (in seconds). 0
                    means wait forever.'
      default: 300
      minimum: 0
      order: 50
    onSaveCheck:
      type: "boolean"
      default: true
      description: "Check file on save"
      order: 25
    onSaveLint:
      type: "boolean"
      default: true
      description: "Lint file on save"
      order: 25
    onChangeCheck:
      type: "boolean"
      default: false
      description: "Check file on change"
      order: 25
    onChangeLint:
      type: "boolean"
      default: false
      description: "Lint file on change"
      order: 25
    onMouseHoverShow:
      type: 'string'
      description: 'Contents of tooltip on mouse hover'
      default: 'typeAndInfo'
      enum: tooltipActions
      order: 30
    onSelectionShow:
      type: 'string'
      description: 'Contents of tooltip on selection'
      default: ''
      enum: tooltipActions
      order: 30
    useLinter:
      type: 'boolean'
      default: false
      description: 'Use \'linter\' package instead of \'ide-haskell\'
                    to display check and lint results
                    (requires restart)'
      order: 75
    maxBrowseProcesses:
      type: 'integer'
      default: 2
      description: 'Maximum number of parallel ghc-mod browse processes, which
                    are used in autocompletion backend initialization.
                    Note that on larger projects it may require a considerable
                    amount of memory.'
      order: 60
    highlightTooltips:
      type: 'boolean'
      default: true
      description: 'Show highlighting for type/info tooltips'
      order: 40
    highlightMessages:
      type: 'boolean'
      default: true
      description: 'Show highlighting for output panel messages'
      order: 40
    hlintOptions:
      type: 'array'
      default: []
      description: 'Command line options to pass to hlint (comma-separated)'
      order: 45
    experimental:
      type: 'boolean'
      default: false
      description: 'Enable experimentai features, which are expected to land in
                    next release of ghc-mod. ENABLE ONLY IF YOU KNOW WHAT YOU
                    ARE DOING'
      order: 999
    suppressGhcPackagePathWarning:
      type: 'boolean'
      default: false
      description: 'Suppress warning about GHC_PACKAGE_PATH environment variable.
                    ENABLE ONLY IF YOU KNOW WHAT YOU ARE DOING.'
      order: 999

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

      # TODO: Rewrite this horribleness
      atom.config.observe "haskell-ghc-mod.#{lintOnFly}", (value) ->
        linter.lintOnFly = value

      return linter
