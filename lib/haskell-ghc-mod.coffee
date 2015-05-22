GhcModiProcess = require './ghc-modi-process'
{HaskellGhcModMessage,HaskellGhcModMessageElement} =
  require('./haskell-ghc-mod-message')
{CompositeDisposable} = require 'atom'
Grim = require 'grim'
EditorController = require './editor-controller'
IdeBackend = require './ide-backend'

module.exports = HaskellGhcMod =
  process: null
  subscriptions: null
  editorMap: null

  config:
    checkOnSave:
      type: 'boolean'
      default: true
      description: 'Run ghc-mod check on file save'
    ghcModPath:
      type: 'string'
      default: 'ghc-mod'
      description: 'Path to ghc-mod'
    enableGhcModi:
      type: 'boolean'
      default: true
      description:
        'Disable if experiencing problems. It is noticeably slower,'+
        ' but can help with ghc-modi bugs'
    ghcModiPath:
      type: 'string'
      default: 'ghc-modi'
      description: 'Path to ghc-modi'

  registerEditorCommands: ->
    if atom.packages.isPackageActive('ide-haskell')
      return

    @subscriptions_editor = new CompositeDisposable
    @editorMap = new WeakMap

    @subscriptions_editor.add atom.commands.add 'atom-text-editor',
      'haskell-ghc-mod:type': ({target}) =>
        @editorMap.get(target.getModel())?.getType()
      'haskell-ghc-mod:info': ({target}) =>
        @editorMap.get(target.getModel())?.getInfo()
      'haskell-ghc-mod:insert-type': ({target}) =>
        @editorMap.get(target.getModel())?.insertType()
      'haskell-ghc-mod:check': ({target}) =>
        @editorMap.get(target.getModel())?.doCheck()

    @subscriptions_editor.add atom.workspace.observeTextEditors (editor) =>
      return unless editor.getGrammar().scopeName=="source.haskell"
      @editorMap.set(editor,new EditorController(@process,editor))

  unregisterEdtiorCommands: ->
    for editor in atom.workspace.getTextEditors()
      @editorMap?.get(editor)?.desrtoy?()
    @subscriptions_editor?.dispose()

  activate: (state) ->
    @process=new GhcModiProcess
    @subscriptions = new CompositeDisposable

    atom.views.addViewProvider HaskellGhcModMessage, (message)->
      el=new HaskellGhcModMessageElement
      el.setModel(message)
      el

    atom.packages.onDidActivatePackage (p) =>
      @unregisterEditorCommands() if p.name=='ide-haskell'

    atom.packages.onDidDeactivatePackage (p) =>
      @registerEditorCommands() if p.name=='ide-haskell'

    @registerEditorCommands()

  deactivate: ->
    @unregisterEdtiorCommands()
    @process?.destroy()

  provideGhcMod_0_1_0: ->
    if @process?
      type: (text,range,callback) =>
        Grim.deprecate("haskell-ghc-mod: haskell-ghc-mod service is deprecated")
        @process.getType text,range,callback
      info: (text,symbol,callback) =>
        Grim.deprecate("haskell-ghc-mod: haskell-ghc-mod service is deprecated")
        @process.getInfo text,symbol,callback
      check: (text,callback) =>
        Grim.deprecate("haskell-ghc-mod: haskell-ghc-mod service is deprecated")
        @process.doCheck text,callback
      list: (callback) =>
        Grim.deprecate("haskell-ghc-mod: haskell-ghc-mod service is deprecated")
        @process.runList atom.project.getDirectories()[0], callback
      lang: (callback) =>
        Grim.deprecate("haskell-ghc-mod: haskell-ghc-mod service is deprecated")
        @process.runLang callback
      flag: (callback) =>
        Grim.deprecate("haskell-ghc-mod: haskell-ghc-mod service is deprecated")
        @process.runFlag callback
      browse: (modules,callback) =>
        Grim.deprecate("haskell-ghc-mod: haskell-ghc-mod service is deprecated")
        @process.runBrowse atom.project.getDirectories()[0], modules, callback

  provideIdeBackend_0_1_0: ->
    new IdeBackend @process

  provideCompletionBackend_0_1_0: ->
    if @process?
      getType: (buffer, range) =>
        new Promise (resolve) =>
          @process.getTypeInBuffer buffer,range,({type}) ->
            resolve type
      listModules: (rootDir) =>
        new Promise (resolve) =>
          @process.runList rootDir, resolve
      listLanguagePragmas: () =>
        new Promise (resolve) =>
          @process.runLang resolve
      listCompilerOptions: () =>
        new Promise (resolve) =>
          @process.runFlag resolve
      getImportedModules: (buffer) ->
        modules = [{
          qualified: false
          name: 'Prelude'
          }]
        regex= ///
          ^import
          \s+(qualified\s+)? #qualified
          ([\w.]+) #name
          (?:\s+(hiding))?
          (?:\s+\(([^)]+)\))? #import list
          (?:\s+as\s+([\w.]+))? #alias
          ///gm
        buffer.scan regex, ({match}) ->
          modules.push
            qualified: match[1]?
            name: match[2]
            hiding: match[3]?
            importList: match[4]?.split(',')?.map (s) -> s.trim()
            alias: match[5]
        return modules
      listImportedSymbols: (buffer, modules) =>
        modules ?= @provideCompletionBackend_0_1_0().getImportedModules(buffer)
        Promise.all modules.map (m) =>
          new Promise (resolve) =>
            rd = @process.getRootDir(buffer)
            @process.runBrowse rd, [m.name], (symbols) ->
              s = symbols.map (s) ->
                [name, typeSignature] = s.split('::').map (s) -> s.trim()
                if /^(?:type|data|newtype)/.test(typeSignature)
                  symbolType='type'
                else if /^(?:class)/.test(typeSignature)
                  symbolType='class'
                else
                  symbolType='function'
                {name, typeSignature, symbolType}
              if m.importList?
                s = s.filter (s) ->
                  m.hiding != m.importList.some (i) -> i == s.name
              resolve
                module: m
                symbols: s
        .then (modules) ->
          [].concat (modules.map ({module,symbols})->
            symbols.map (s) ->
              s.module=module
              if s.module.qualified
                s.qname=(s.module.alias ? s.module.name)+"."+s.name
              return s
            )...
