{Range, Point, Emitter, CompositeDisposable} = require 'atom'
Util = require './util'
{extname} = require('path')

GhcModiProcessTemp = require './ghc-modi-process-temp.coffee'
GhcModiProcessRedirect = require './ghc-modi-process-redirect.coffee'
CP = require 'child_process'

{EOL} = require('os')

module.exports =
class GhcModiProcess
  backend: null
  commandQueues:
    checklint:
      running: false
      queue: []
    browse:
      running: false
      queue: []
    typeinfo:
      running: false
      queue: []
    find:
      running: false
      queue: []
    init:
      running: false
      queue: []
    list:
      running: false
      queue: []

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

    for k, v of @commandQueues
      @runQueuedCommands k

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

  queueCmd: (qn, o) =>
    @commandQueues[qn].queue.push o
    @runQueuedCommands qn

  runQueuedCommands: (qn) =>
    return unless @backend?
    if @commandQueues[qn].queue.length == 0
      @emitter.emit 'queue-idle', {queue: qn}
      if (Object.keys(@commandQueues).every (k) =>
        @commandQueues[k].queue.length == 0)
        @emitter.emit 'backend-idle'
      return
    else if @commandQueues[qn].running
      return

    @commandQueues[qn].running = true
    cmdDesc = @commandQueues[qn].queue.shift()
    @emitter.emit 'backend-active', {queue: qn, command: cmdDesc}
    @backend.run(cmdDesc).then (lines) =>
      cmdDesc.callback lines
      @commandQueues[qn].running = false
      @runQueuedCommands qn

  runList: (buffer, callback) =>
    rootDir = @getRootDir(buffer)
    @queueCmd 'list',
      options: Util.getProcessOptions(rootDir.getPath())
      command: 'list'
      callback: callback

  runLang: (callback) =>
    @queueCmd 'init',
      options: Util.getProcessOptions()
      command: 'lang'
      callback: callback

  runFlag: (callback) =>
    @queueCmd 'init',
      options: Util.getProcessOptions()
      command: 'flag'
      callback: callback

  runBrowse: (rootPath, modules, callback) =>
    @queueCmd 'browse',
      options: Util.getProcessOptions(rootPath)
      command: 'browse'
      args: ['-d'].concat(modules)
      callback: (lines) ->
        callback lines.map (s) ->
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

    new Promise (resolve, reject) =>
      @queueCmd 'typeinfo',
        interactive: true
        dir: rootDir
        options: Util.getProcessOptions(rootDir.getPath())
        command: 'type',
        uri: buffer.getUri()
        text: buffer.getText() if buffer.isModified()
        args: ["", crange.start.row + 1, crange.start.column + 1]
        callback: (lines) ->
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
            resolve {range, type}
          else
            reject()

  getInfoInBuffer: (buffer, crange) =>
    {symbol, range} = Util.getSymbolInRange(/[\w.']*/, buffer, crange)

    rootDir = @getRootDir(buffer)

    new Promise (resolve, reject) =>
      @queueCmd 'typeinfo',
        interactive: true
        dir: rootDir
        options: Util.getProcessOptions(rootDir.getPath())
        command: 'info'
        uri: buffer.getUri()
        text: buffer.getText() if buffer.isModified()
        args: ["", symbol]
        callback: (lines) ->
          info = lines.join(EOL)
          if info is 'Cannot show info' or not info
            reject()
          else
            resolve {range, info}

  findSymbolProvidersInBuffer: (buffer, crange, callback) =>
    {symbol} = Util.getSymbolInRange(/[\w']*/, buffer, crange)

    rootDir = @getRootDir(buffer)

    @queueCmd 'find',
      options: Util.getProcessOptions(rootDir.getPath())
      command: 'find'
      args: [symbol]
      callback: callback

  doCheckOrLintBuffer: (cmd, buffer, fast) =>
    return Promise.resolve [] if buffer.isEmpty()
    rootDir = @getRootDir(buffer)
    new Promise (resolve, reject) =>
      @queueCmd 'checklint',
        interactive: fast
        dir: rootDir
        options: Util.getProcessOptions(rootDir.getPath())
        command: cmd
        uri: buffer.getUri()
        text: buffer.getText() if buffer.isModified()
        callback: (lines) ->
          results = []
          lines.forEach (line) ->
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
            results.push
              uri: (try rootDir.getFile(rootDir.relativize(file)).getPath()) ? file
              position: messPos
              message: line.replace m, ''
              severity: severity
          resolve results

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
