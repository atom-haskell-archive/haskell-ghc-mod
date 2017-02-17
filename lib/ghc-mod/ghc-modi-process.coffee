{Range, Point, Emitter, CompositeDisposable, Directory} = require 'atom'
Util = require '../util'
{extname} = require('path')
Queue = require 'promise-queue'
{unlitSync} = require 'atom-haskell-utils'
_ = require 'underscore-plus'

GhcModiProcessReal = require './ghc-modi-process-real.coffee'
_ = require 'underscore-plus'

module.exports =
class GhcModiProcess
  backend: null
  commandQueues: null

  constructor: ->
    @disposables = new CompositeDisposable
    @disposables.add @emitter = new Emitter
    @bufferDirMap = new WeakMap #TextBuffer -> Directory
    @backend = new Map # FilePath -> Backend

    if process.env.GHC_PACKAGE_PATH? and not atom.config.get('haskell-ghc-mod.suppressGhcPackagePathWarning')
      atom.notifications.addWarning """
        haskell-ghc-mod: You have GHC_PACKAGE_PATH environment variable set!
        """,
        dismissable: true
        detail: """
          This configuration is not supported, and can break arbitrarily. You can try to band-aid it by adding
           
          delete process.env.GHC_PACKAGE_PATH
           
          to your Atom init script (Edit → Init Script...)
           
          You can suppress this warning in haskell-ghc-mod settings.
          """

    @createQueues()

  getRootDir: (buffer) ->
    dir = @bufferDirMap.get buffer
    if dir?
      return dir
    dir = Util.getRootDir buffer
    @bufferDirMap.set buffer, dir
    dir

  initBackend: (rootDir) ->
    rootPath = rootDir.getPath()
    return @backend.get(rootPath) if @backend.has(rootPath)
    procopts = Util.getProcessOptions(rootPath)
    vers = procopts.then (opts) => @getVersion(opts)
    vers.then (v) => procopts.then (opts) => @checkComp(opts, v)

    backend =
      vers
      .then @getCaps
      .then (@caps) =>
        procopts.then (opts) =>
          new GhcModiProcessReal @caps, rootDir, opts
      .catch (err) ->
        atom.notifications.addFatalError "
          Haskell-ghc-mod: ghc-mod failed to launch.
          It is probably missing or misconfigured. #{err.code}",
          detail: """
            #{err}
            PATH: #{process.env.PATH}
            path: #{process.env.path}
            Path: #{process.env.Path}
            """
          stack: err.stack
          dismissable: true
        null
    @backend.set(rootPath, backend)
    return backend

  createQueues: =>
    @commandQueues =
      checklint: new Queue(2)
      browse: null
      typeinfo: new Queue(1)
      find: new Queue(1)
      init: new Queue(4)
      list: new Queue(1)
      lowmem: new Queue(1)
    @disposables.add atom.config.observe 'haskell-ghc-mod.maxBrowseProcesses', (value) =>
      @commandQueues.browse = new Queue(value)

  getVersion: (opts) ->
    timeout = atom.config.get('haskell-ghc-mod.initTimeout') * 1000
    cmd = atom.config.get('haskell-ghc-mod.ghcModPath')
    Util.execPromise cmd, ['version'], _.extend({timeout}, opts)
    .then (stdout) ->
      vers = /^ghc-mod version (\d+)\.(\d+)\.(\d+)(?:\.(\d+))?/.exec(stdout).slice(1, 5).map (i) -> parseInt i
      comp = /GHC (.+)$/.exec(stdout.trim())[1]
      Util.debug "Ghc-mod #{vers} built with #{comp}"
      return {vers, comp}

  checkComp: (opts, {comp}) ->
    timeout = atom.config.get('haskell-ghc-mod.initTimeout') * 1000
    stackghc =
      Util.execPromise 'stack', ['ghc', '--', '--numeric-version'], _.extend({timeout}, opts)
      .then (stdout) -> stdout.trim()
      .catch (error) ->
        Util.warn error
        return null
    pathghc =
      Util.execPromise 'ghc', ['--numeric-version'], _.extend({timeout}, opts)
      .then (stdout) -> stdout.trim()
      .catch (error) ->
        Util.warn error
        return null
    Promise.all [stackghc, pathghc]
    .then ([stackghc, pathghc]) ->
      Util.debug "Stack GHC version #{stackghc}"
      Util.debug "Path GHC version #{pathghc}"
      if stackghc? and stackghc isnt comp
        warn = "
          GHC version in your Stack '#{stackghc}' doesn't match with
          GHC version used to build ghc-mod '#{comp}'. This can lead to
          problems when using Stack projects"
        atom.notifications.addWarning warn
        Util.warn warn
      if pathghc? and pathghc isnt comp
        warn = "
          GHC version in your PATH '#{pathghc}' doesn't match with
          GHC version used to build ghc-mod '#{comp}'. This can lead to
          problems when using Cabal or Plain projects"
        atom.notifications.addWarning warn
        Util.warn warn

  getCaps: ({vers}) ->
    caps =
      version: vers
      fileMap: false
      quoteArgs: false
      optparse: false
      typeConstraints: false
      browseParents: false
      interactiveCaseSplit: false
      importedFrom: false

    atLeast = (b) ->
      for v, i in b
        if vers[i] > v
          return true
        else if vers[i] < v
          return false
      return true

    exact = (b) ->
      for v, i in b
        if vers[i] isnt v
          return false
      return true

    if not atLeast [5, 4]
      atom.notifications.addError "
        Haskell-ghc-mod: ghc-mod < 5.4 is not supported.
        Use at your own risk or update your ghc-mod installation",
        dismissable: true
    if exact [5, 4]
      atom.notifications.addWarning "
        Haskell-ghc-mod: ghc-mod 5.4.* is deprecated.
        Use at your own risk or update your ghc-mod installation",
        dismissable: true
    if atLeast [5, 4]
      caps.fileMap = true
    if atLeast [5, 5]
      caps.quoteArgs = true
      caps.optparse = true
    if atLeast([5, 6])
      caps.typeConstraints = true
      caps.browseParents = true
      caps.interactiveCaseSplit = true
    if atom.config.get('haskell-ghc-mod.experimental')
      caps.importedFrom = true
    Util.debug JSON.stringify(caps)
    return caps

  killProcess: =>
    @backend.forEach (v) ->
      v.then (backend) -> backend?.killProcess?()
    @backend.clear()

  # Tear down any state and detach
  destroy: =>
    @backend.forEach (v) ->
      v.then (backend) -> backend?.destroy?()
    @backend.clear()
    @emitter.emit 'did-destroy'
    @disposables.dispose()
    @commandQueues = null
    @backend = null

  onDidDestroy: (callback) =>
    @emitter.on 'did-destroy', callback

  onBackendActive: (callback) =>
    @emitter.on 'backend-active', callback

  onBackendIdle: (callback) =>
    @emitter.on 'backend-idle', callback

  onQueueIdle: (callback) =>
    @emitter.on 'queue-idle', callback

  queueCmd: (queueName, runArgs, backend) =>
    unless runArgs.buffer? or runArgs.dir?
      throw new Error ("Neither dir nor buffer is set in queueCmd invocation")
    if atom.config.get('haskell-ghc-mod.lowMemorySystem')
      queueName = 'lowmem'
    runArgs.dir ?= @getRootDir(runArgs.buffer) if runArgs.buffer?
    unless backend?
      return @initBackend(runArgs.dir).then (backend) =>
        if backend?
          @queueCmd(queueName, runArgs, backend)
        else
          []
    qe = (qn) =>
      q = @commandQueues[qn]
      q.getQueueLength() + q.getPendingLength() is 0
    promise = @commandQueues[queueName].add =>
      @emitter.emit 'backend-active'
      rd = runArgs.dir or Util.getRootDir(runArgs.options.cwd)
      localSettings = new Promise (resolve, reject) ->
        file = rd.getFile('.haskell-ghc-mod.json')
        file.exists()
        .then (ex) ->
          if ex
            file.read().then (contents) ->
              try
                resolve JSON.parse(contents)
              catch err
                atom.notifications.addError 'Failed to parse .haskell-ghc-mod.json',
                  detail: err
                  dismissable: true
                reject err
          else
            reject()
      .catch (error) ->
        Util.warn error if error?
        return {}
      globalSettings = new Promise (resolve, reject) ->
        configDir = new Directory(atom.getConfigDirPath())
        file = configDir.getFile('haskell-ghc-mod.json')
        file.exists()
        .then (ex) ->
          if ex
            file.read().then (contents) ->
              try
                resolve JSON.parse(contents)
              catch err
                atom.notifications.addError 'Failed to parse haskell-ghc-mod.json',
                  detail: err
                  dismissable: true
                reject err
          else
            reject()
      .catch (error) ->
        Util.warn error if error?
        return {}
      Promise.all [globalSettings, localSettings]
      .then ([glob, loc]) ->
        _.extend(glob, loc)
      .then (settings) ->
        throw new Error("Ghc-mod disabled in settings") if settings.disable
        runArgs.suppressErrors = settings.suppressErrors
        runArgs.ghcOptions = settings.ghcOptions
        runArgs.ghcModOptions = settings.ghcModOptions
      .then ->
        backend.run runArgs
      .catch (err) ->
        Util.warn err
        return []
    promise.then (res) =>
      if qe(queueName)
        @emitter.emit 'queue-idle', {queue: queueName}
        if (k for k of @commandQueues).every(qe)
          @emitter.emit 'backend-idle'
    return promise

  runList: (buffer) =>
    @queueCmd 'list',
      buffer: buffer
      command: 'list'

  runLang: (dir) =>
    @queueCmd 'init',
      command: 'lang'
      dir: dir

  runFlag: (dir) =>
    @queueCmd 'init',
      command: 'flag'
      dir: dir

  runBrowse: (rootDir, modules) =>
    @queueCmd 'browse',
      dir: rootDir
      command: 'browse'
      dashArgs: (caps) ->
        args = ['-d']
        args.push '-p' if caps.browseParents
        args
      args: modules
    .then (lines) =>
      lines.map (s) =>
        [name, typeSignature...] = s.split(' :: ')
        typeSignature = typeSignature.join(' :: ').trim()
        if @caps.browseParents
          [typeSignature, parent] = typeSignature.split(' -- from:').map (v) -> v.trim()
        name = name.trim()
        if /^(?:type|data|newtype)/.test(typeSignature)
          symbolType = 'type'
        else if /^(?:class)/.test(typeSignature)
          symbolType = 'class'
        else
          symbolType = 'function'
        {name, typeSignature, symbolType, parent}

  getTypeInBuffer: (buffer, crange) =>
    return Promise.resolve null unless buffer.getUri()?
    crange = Util.tabShiftForRange(buffer, crange)
    @queueCmd 'typeinfo',
      interactive: true
      buffer: buffer
      command: 'type',
      uri: buffer.getUri()
      text: buffer.getText() if buffer.isModified()
      dashArgs: (caps) ->
        args = []
        args.push '-c' if caps.typeConstraints
        args
      args: [crange.start.row + 1, crange.start.column + 1]
    .then (lines) ->
      [range, type] = lines.reduce ((acc, line) ->
        return acc if acc != ''
        rx = /^(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+"([^]*)"$/ # [^] basically means "anything", incl. newlines
        [line_, rowstart, colstart, rowend, colend, text] = line.match(rx)
        type = text.replace(/\\"/g, '"')
        myrange =
          Range.fromObject [
            [parseInt(rowstart) - 1, parseInt(colstart) - 1],
            [parseInt(rowend) - 1, parseInt(colend) - 1]
          ]
        return acc if myrange.isEmpty()
        return acc unless myrange.containsRange(crange)
        myrange = Util.tabUnshiftForRange(buffer, myrange)
        return [myrange, type]),
        ''
      range = crange unless range
      if type
        return {range, type}
      else
        throw new Error "No type"

  doCaseSplit: (buffer, crange) =>
    return Promise.resolve [] unless buffer.getUri()?
    crange = Util.tabShiftForRange(buffer, crange)
    @queueCmd 'typeinfo',
      interactive: @caps?.interactiveCaseSplit ? false
      buffer: buffer
      command: 'split',
      uri: buffer.getUri()
      text: buffer.getText() if buffer.isModified()
      args: [crange.start.row + 1, crange.start.column + 1]
    .then (lines) ->
      rx = /^(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+"([^]*)"$/ # [^] basically means "anything", incl. newlines
      lines
      .filter (line) ->
        unless line.match(rx)?
          Util.warn "ghc-mod says: #{line}"
          return false
        return true
      .map (line) ->
        [line_, rowstart, colstart, rowend, colend, text] = line.match(rx)
        range:
          Range.fromObject [
            [parseInt(rowstart) - 1, parseInt(colstart) - 1],
            [parseInt(rowend) - 1, parseInt(colend) - 1]
          ]
        replacement: text

  doSigFill: (buffer, crange) =>
    return Promise.resolve [] unless buffer.getUri()?
    crange = Util.tabShiftForRange(buffer, crange)
    @queueCmd 'typeinfo',
      interactive: @caps?.interactiveCaseSplit ? false
      buffer: buffer
      command: 'sig',
      uri: buffer.getUri()
      text: buffer.getText() if buffer.isModified()
      args: [crange.start.row + 1, crange.start.column + 1]
    .then (lines) ->
      return [] unless lines[0]?
      rx = /^(\d+)\s+(\d+)\s+(\d+)\s+(\d+)$/ # position rx
      [line_, rowstart, colstart, rowend, colend] = lines[1].match(rx)
      range =
        Range.fromObject [
          [parseInt(rowstart) - 1, parseInt(colstart) - 1],
          [parseInt(rowend) - 1, parseInt(colend) - 1]
        ]
      return [
        type: lines[0]
        range: range
        body: lines.slice(2).join('\n')
      ]

  getInfoInBuffer: (editor, crange) =>
    buffer = editor.getBuffer()
    return Promise.resolve null unless buffer.getUri()?
    {symbol, range} = Util.getSymbolInRange(editor, crange)

    @queueCmd 'typeinfo',
      interactive: true
      buffer: buffer
      command: 'info'
      uri: buffer.getUri()
      text: buffer.getText() if buffer.isModified()
      args: [symbol]
    .then (lines) ->
      info = lines.join('\n')
      if info is 'Cannot show info' or not info
        throw new Error "No info"
      else
        return {range, info}

  findSymbolProvidersInBuffer: (editor, crange) =>
    buffer = editor.getBuffer()
    {symbol} = Util.getSymbolInRange(editor, crange)

    @queueCmd 'find',
      interactive: true
      buffer: buffer
      command: 'find'
      args: [symbol]

  doCheckOrLintBuffer: (cmd, buffer, fast) =>
    return Promise.resolve [] if buffer.isEmpty()
    return Promise.resolve [] unless buffer.getUri()?

    # A dirty hack to make lint work with lhs
    olduri = uri = buffer.getUri()
    text =
      if cmd is 'lint' and extname(uri) is '.lhs'
        uri = uri.slice 0, -1
        unlitSync olduri, buffer.getText()
      else if buffer.isModified()
        buffer.getText()
    if text?.error?
      # TODO: Reject
      [m, uri, line, mess] = text.error.match(/^(.*?):([0-9]+): *(.*) *$/)
      return Promise.resolve [
        uri: uri
        position: new Point(line - 1, 0)
        message: mess
        severity: 'lint'
      ]
    # end of dirty hack

    if cmd is 'lint'
      dashArgs = [].concat atom.config.get('haskell-ghc-mod.hlintOptions').map((v) -> ['--hlintOpt', v])...

    @queueCmd 'checklint',
      interactive: fast
      buffer: buffer
      command: cmd
      uri: uri
      text: text
      dashArgs: dashArgs
    .then (lines) =>
      rootDir = @getRootDir buffer
      rx = /^(.*?):([0-9\s]+):([0-9\s]+): *(?:(Warning|Error): *)?/
      lines
      .filter (line) ->
        switch
          when line.startsWith 'Dummy:0:0:Error:'
            atom.notifications.addError line.slice(16)
          when line.startsWith 'Dummy:0:0:Warning:'
            atom.notifications.addWarning line.slice(18)
          when line.match(rx)?
            return true
          when line.trim().length > 0
            Util.warn "ghc-mod says: #{line}"
        return false
      .map (line) ->
        match = line.match(rx)
        [m, file, row, col, warning] = match
        file = olduri if uri.endsWith(file)
        severity =
          if cmd == 'lint'
            'lint'
          else if warning == 'Warning'
            'warning'
          else
            'error'
        messPos = new Point(row - 1, col - 1)
        messPos = Util.tabUnshiftForPoint(buffer, messPos)

        return {
          uri: (try rootDir.getFile(rootDir.relativize(file)).getPath()) ? file
          position: messPos
          message: line.replace m, ''
          severity: severity
        }

  doCheckBuffer: (buffer, fast) =>
    @doCheckOrLintBuffer "check", buffer, fast

  doLintBuffer: (buffer, fast) =>
    @doCheckOrLintBuffer "lint", buffer, fast

  doCheckAndLint: (buffer, fast) =>
    Promise.all [ @doCheckBuffer(buffer, fast), @doLintBuffer(buffer, fast) ]
    .then (resArr) -> [].concat resArr...
