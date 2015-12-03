{Range, Point, Emitter, CompositeDisposable} = require 'atom'
Util = require './util'
{extname} = require('path')
Queue = require 'promise-queue'

GhcModiProcessTemp = require './ghc-modi-process-temp.coffee'
GhcModiProcessRedirect = require './ghc-modi-process-redirect.coffee'
CP = require 'child_process'

{EOL} = require('os')

module.exports =
class GhcModiProcess
  backend: null
  commandQueues:
    checklint: new Queue(1)
    browse: new Queue(4)
    typeinfo: new Queue(1)
    find: new Queue(1)
    init: new Queue(4)
    list: new Queue(1)

  constructor: ->
    @disposables = new CompositeDisposable
    @disposables.add @emitter = new Emitter

    opts = Util.getProcessOptions()
    opts.timeout = atom.config.get('haskell-ghc-mod.syncTimeout')
    res = CP.spawnSync atom.config.get('haskell-ghc-mod.ghcModPath'),
      ['--map-file', 'test', 'version'],
      opts
    if res.error?
      atom.notifications.addError "Haskell-ghc-mod: ghc-mod failed to launch
        it is probably missing or misconfigured",
        detail: res.error
        dismissable: true
    if res.status != 0
      # no redirect support
      @backend = new GhcModiProcessTemp
    else
      @backend = new GhcModiProcessRedirect

  killProcess: =>
    @backend.killProcess()

  # Tear down any state and detach
  destroy: =>
    @backend.destroy()
    @emitter.emit 'did-destroy'
    @disposables.dispose()
    for k, v of @commandQueues
      v =
        running: false
        queue: []

  onDidDestroy: (callback) =>
    @emitter.on 'did-destroy', callback

  onBackendActive: (callback) =>
    @emitter.on 'backend-active', callback

  onBackendIdle: (callback) =>
    @emitter.on 'backend-idle', callback

  onQueueIdle: (callback) =>
    @emitter.on 'queue-idle', callback

  queueCmd: (queueName, runArgs) =>
    qe = (qn) =>
      q = @commandQueues[qn]
      q.getQueueLength() + q.getPendingLength() is 0
    @commandQueues[queueName].add =>
      @emitter.emit 'backend-active'
      @backend.run runArgs
    .then (res) =>
      if qe(queueName)
        @emitter.emit 'queue-idle', {queue: queueName}
        if (1 for k of @commandQueues when qe(k)).length
          @emitter.emit 'backend-idle'
      res

  runList: (buffer) =>
    rootDir = @getRootDir(buffer)
    @queueCmd 'list',
      options: Util.getProcessOptions(rootDir.getPath())
      command: 'list'

  runLang: =>
    @queueCmd 'init',
      options: Util.getProcessOptions()
      command: 'lang'

  runFlag: =>
    @queueCmd 'init',
      options: Util.getProcessOptions()
      command: 'flag'

  runBrowse: (rootPath, modules) =>
    @queueCmd 'browse',
      options: Util.getProcessOptions(rootPath)
      command: 'browse'
      args: ['-d'].concat(modules)
    .then (lines) ->
      lines.map (s) ->
        [name, typeSignature] = s.split('::').map (s) -> s.trim()
        if /^(?:type|data|newtype)/.test(typeSignature)
          symbolType = 'type'
        else if /^(?:class)/.test(typeSignature)
          symbolType = 'class'
        else
          symbolType = 'function'
        {name, typeSignature, symbolType}

  getTypeInBuffer: (buffer, crange) =>
    rootDir = @getRootDir(buffer)

    @queueCmd 'typeinfo',
      interactive: true
      dir: rootDir
      options: Util.getProcessOptions(rootDir.getPath())
      command: 'type',
      uri: buffer.getUri()
      text: buffer.getText() if buffer.isModified()
      args: ["", crange.start.row + 1, crange.start.column + 1]
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

  getInfoInBuffer: (buffer, crange) =>
    {symbol, range} = Util.getSymbolInRange(/[\w.']*/, buffer, crange)

    rootDir = @getRootDir(buffer)

    @queueCmd 'typeinfo',
      interactive: true
      dir: rootDir
      options: Util.getProcessOptions(rootDir.getPath())
      command: 'info'
      uri: buffer.getUri()
      text: buffer.getText() if buffer.isModified()
      args: ["", symbol]
    .then (lines) ->
      info = lines.join(EOL)
      if info is 'Cannot show info' or not info
        throw new Error "No info"
      else
        return {range, info}

  findSymbolProvidersInBuffer: (buffer, crange) =>
    {symbol} = Util.getSymbolInRange(/[\w']*/, buffer, crange)

    rootDir = @getRootDir(buffer)

    @queueCmd 'find',
      options: Util.getProcessOptions(rootDir.getPath())
      command: 'find'
      args: [symbol]

  doCheckOrLintBuffer: (cmd, buffer, fast) =>
    return Promise.resolve [] if buffer.isEmpty()
    rootDir = @getRootDir(buffer)

    @queueCmd 'checklint',
      interactive: fast
      dir: rootDir
      options: Util.getProcessOptions(rootDir.getPath())
      command: cmd
      uri: buffer.getUri()
      text: buffer.getText() if buffer.isModified()
    .then (lines) ->
      lines.map (line) ->
        match =
          line.match(/^(.*?):([0-9]+):([0-9]+): *(?:(Warning|Error): *)?/)
        unless match?
          console.log("Ghc-Mod says: #{line}")
          line = "#{buffer.getUri()}:0:0:Error: #{line}"
          match=
            line.match(/^(.*?):([0-9]+):([0-9]+): *(?:(Warning|Error): *)?/)
        [m, file, row, col, warning] = match
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
    return Promise.resolve [] if extname(buffer.getUri()) is '.lhs'
    @doCheckOrLintBuffer "lint", buffer, fast

  doCheckAndLint: (buffer, fast) =>
    @doCheckBuffer(buffer, fast).then (resCheck) =>
      @doLintBuffer(buffer, fast).then (resLint) ->
        return resCheck.concat resLint

  getRootDir: (buffer) ->
    @backend?.getRootDir?(buffer) ? Util.getRootDir(buffer)
