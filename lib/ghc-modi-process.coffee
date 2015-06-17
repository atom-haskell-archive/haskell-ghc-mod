{BufferedProcess, Range, Point, Emitter, CompositeDisposable} = require 'atom'
Util = require './util'

GhcModiProcessTemp = require './ghc-modi-process-temp.coffee'
GhcModiProcessRedirect = require './ghc-modi-process-redirect.coffee'

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
    new BufferedProcess
      command: atom.config.get('haskell-ghc-mod.ghcModPath')
      args: ['--file-map', 'test', 'version']
      options: Util.getProcessOptions()
      exit: (code) =>
        if code != 0
          # no redirect support
          @backend = new GhcModiProcessTemp
        else
          @backend = new GhcModiProcessRedirect
          m = "Haskell-ghc-mod:
               Copy of this message can be found in dev. console.
               Found master ghc-mod.
               Thank you for testing! Bear in mind that this is highly
               experimental option. Please report any bugs."
          atom.notifications.addInfo m
          console.log m
        for k, v of @commandQueues
          @runQueuedCommands k
    .onWillThrowError (error, handle) ->
      atom.notifications.addError "Haskell-ghc-mod: ghc-mod failed to launch
        it is probably missing or misconfigured",
        details: error
        dismissable: true
    @disposables = new CompositeDisposable
    @disposables.add @emitter = new Emitter

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
    cb = cmdDesc.callback
    cmdDesc.callback = (lines) =>
      cb lines
      @commandQueues[qn].running = false
      @runQueuedCommands qn
    @backend.run cmdDesc

  runList: (rootPath, callback) =>
    @queueCmd 'list',
      options: Util.getProcessOptions(rootPath)
      command: 'list'
      callback: callback

  runLang: (callback) =>
    @queueCmd 'init',
      command: 'lang'
      callback: callback

  runFlag: (callback) =>
    @queueCmd 'init',
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

  getTypeInBuffer: (buffer, crange, callback) =>
    crange = Util.toRange crange

    @queueCmd 'typeinfo',
      interactive: true
      dir: Util.getRootDir(buffer)
      options: Util.getProcessOptions(Util.getRootDir(buffer).getPath())
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
        type = undefined unless type
        range = crange unless range
        callback {range, type}

  getInfoInBuffer: (buffer, crange, callback) =>
    crange = Util.toRange crange
    {symbol, range} = Util.getSymbolInRange(/[\w.']*/, buffer, crange)

    @queueCmd 'typeinfo',
      interactive: true
      dir: Util.getRootDir(buffer)
      options: Util.getProcessOptions(Util.getRootDir(buffer).getPath())
      command: 'info'
      uri: buffer.getUri()
      text: buffer.getText() if buffer.isModified()
      args: ["", symbol]
      callback: (lines) ->
        text = lines.join('\n')
        text = undefined if text is 'Cannot show info' or not text
        callback {range, info: text}

  findSymbolProvidersInBuffer: (buffer, crange, callback) =>
    crange = Util.toRange crange
    {symbol} = Util.getSymbolInRange(/[\w']*/, buffer, crange)

    @queueCmd 'find',
      options: Util.getProcessOptions(Util.getRootDir(buffer).getPath())
      command: 'find'
      args: [symbol]
      callback: callback

  doCheckOrLintBuffer: (cmd, buffer, callback) =>
    dir = Util.getRootDir(buffer)
    @queueCmd 'checklint',
      dir: dir
      options: Util.getProcessOptions(dir.getPath())
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
          results.push
            uri: dir.getFile(dir.relativize(file)).getPath()
            position: new Point row - 1, col - 1
            message: line.replace m, ''
            severity: severity
        callback results

  doCheckBuffer: (buffer, callback) =>
    @doCheckOrLintBuffer "check", buffer, callback

  doLintBuffer: (buffer, callback) =>
    @doCheckOrLintBuffer "lint", buffer, callback
