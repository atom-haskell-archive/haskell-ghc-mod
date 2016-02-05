{Range, Point, Emitter, CompositeDisposable} = require 'atom'
Util = require '../util'
{extname} = require('path')
Queue = require 'promise-queue'
{unlitSync} = require 'atom-haskell-utils'

GhcModiProcessReal = require './ghc-modi-process-real.coffee'
CP = require 'child_process'

{EOL} = require('os')

module.exports =
class GhcModiProcess
  backend: null
  commandQueues: null

  constructor: ->
    @disposables = new CompositeDisposable
    @disposables.add @emitter = new Emitter

    @createQueues()

    @backendPromise =
      @getVersion()
      .then @getCaps
      .then (caps) =>
        @backend = new GhcModiProcessReal caps
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

  createQueues: =>
    @commandQueues =
      checklint: new Queue(2)
      browse: null
      typeinfo: new Queue(1)
      find: new Queue(1)
      init: new Queue(4)
      list: new Queue(1)
    @disposables.add atom.config.observe 'haskell-ghc-mod.maxBrowseProcesses', (value) =>
      @commandQueues.browse = new Queue(value)

  getVersion: ->
    opts = Util.getProcessOptions()
    opts.timeout = atom.config.get('haskell-ghc-mod.syncTimeout')
    new Promise (resolve, reject) ->
      CP.execFile atom.config.get('haskell-ghc-mod.ghcModPath'),
        ['version'], opts,
        (error, stdout, stderr) ->
          if error?
            error.stack = (new Error).stack
            return reject error
          resolve (
            /^ghc-mod version (\d+)\.(\d+)\.(\d+)\.(\d+)/.exec(stdout)
            .slice(1, 5).map (i) -> parseInt i
            )

  getCaps: (vers) ->
    caps =
      version: vers
      legacyInteractive: false
      fileMap: false
      rootExec: false
      quoteArgs: false
      optparse: false

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

    if not atLeast [4, 1]
      atom.notifications.addError "
        Haskell-ghc-mod: ghc-mod < 4.1 is not supported.
        Use at your own risk or update your ghc-mod installation",
        dismissable: true
    else if not atLeast [5]
      atom.notifications.addWarning "
        Haskell-ghc-mod: ghc-mod 4.* is deprecated.
        Please update your ghc-mod installation",
        dismissable: true
    if exact [5, 3]
      atom.notifications.addError "
        Haskell-ghc-mod: ghc-mod 5.3.* is not supported.
        Use at your own risk or update your ghc-mod installation",
        dismissable: true
    if atLeast [5, 3]
      caps.legacyInteractive = true
    if atLeast [5, 4]
      caps.fileMap = true
      caps.rootExec = true
    if atLeast [5, 5]
      caps.rootExec = false
      caps.quoteArgs = true
      caps.optparse = true
    Util.debug JSON.stringify(caps)
    return caps

  killProcess: =>
    @backend?.killProcess?()

  # Tear down any state and detach
  destroy: =>
    @backend?.destroy?()
    @emitter.emit 'did-destroy'
    @disposables.dispose()
    @commandQueues = null

  onDidDestroy: (callback) =>
    @emitter.on 'did-destroy', callback

  onBackendActive: (callback) =>
    @emitter.on 'backend-active', callback

  onBackendIdle: (callback) =>
    @emitter.on 'backend-idle', callback

  onQueueIdle: (callback) =>
    @emitter.on 'queue-idle', callback

  queueCmd: (queueName, runArgs) =>
    unless @backend?
      return @backendPromise.then =>
        if @backend?
          @queueCmd(queueName, runArgs)
        else
          []
    runArgs.dir ?= @getRootDir(runArgs.buffer) if runArgs.buffer?
    runArgs.options ?= Util.getProcessOptions(runArgs.dir?.getPath?())
    qe = (qn) =>
      q = @commandQueues[qn]
      q.getQueueLength() + q.getPendingLength() is 0
    promise = @commandQueues[queueName].add =>
      @emitter.emit 'backend-active'
      @backend.run runArgs
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

  runLang: =>
    @queueCmd 'init',
      command: 'lang'

  runFlag: =>
    @queueCmd 'init',
      command: 'flag'

  runBrowse: (rootPath, modules) =>
    @queueCmd 'browse',
      options: Util.getProcessOptions(rootPath)
      command: 'browse'
      dashArgs: ['-d']
      args: modules
    .then (lines) ->
      lines.map (s) ->
        [name, typeSignature...] = s.split(' :: ')
        typeSignature = typeSignature.join(' :: ').trim()
        name = name.trim()
        if /^(?:type|data|newtype)/.test(typeSignature)
          symbolType = 'type'
        else if /^(?:class)/.test(typeSignature)
          symbolType = 'class'
        else
          symbolType = 'function'
        {name, typeSignature, symbolType}

  getTypeInBuffer: (buffer, crange) =>
    @queueCmd 'typeinfo',
      interactive: true
      buffer: buffer
      command: 'type',
      uri: buffer.getUri()
      text: buffer.getText() if buffer.isModified()
      args: [crange.start.row + 1, crange.start.column + 1]
    .then (lines) ->
      [range, type] = lines.reduce ((acc, line) ->
        return acc if acc != ''
        tokens = line.split '"'
        pos = tokens[0].trim().split(' ').map (i) -> i - 1
        type = tokens[1]
        myrange = new Range [pos[0], pos[1]], [pos[2], pos[3]]
        return acc unless myrange.containsRange(crange)
        return [myrange, type]),
        ''
      range = crange unless range
      if type
        return {range, type}
      else
        throw new Error "No type"

  getInfoInBuffer: (editor, crange) =>
    buffer = editor.getBuffer()
    {symbol, range} = Util.getSymbolInRange(editor, crange)

    @queueCmd 'typeinfo',
      interactive: true
      buffer: buffer
      command: 'info'
      uri: buffer.getUri()
      text: buffer.getText() if buffer.isModified()
      args: [symbol]
    .then (lines) ->
      info = lines.join(EOL)
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

    @queueCmd 'checklint',
      interactive: fast
      buffer: buffer
      command: cmd
      uri: uri
      text: text
    .then (lines) =>
      rootDir = @getRootDir buffer
      lines.map (line) ->
        match =
          line.match(/^(.*?):([0-9]+):([0-9]+): *(?:(Warning|Error): *)?/)
        unless match?
          #TODO: reject (i.e. throw)
          console.log("ghc-mod says: #{line}")
          line = "#{olduri}:0:0:Error: #{line}"
          match=
            line.match(/^(.*?):([0-9]+):([0-9]+): *(?:(Warning|Error): *)?/)
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

  getRootDir: (buffer) ->
    @backend?.getRootDir?(buffer) ? Util.getRootDir(buffer)
