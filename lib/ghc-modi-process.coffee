{BufferedProcess,Range,Point,Emitter,CompositeDisposable,
Directory} = require 'atom'

GhcModiProcessTemp = require './ghc-modi-process-temp.coffee'
GhcModiProcessRedirect = require './ghc-modi-process-redirect.coffee'

module.exports =
class GhcModiProcess
  backend: null
  commandQueues:
    checklint:
      running: false
      queue: []
    completion:
      running: false
      queue: []
    typeinfo:
      running: false
      queue: []
    find:
      running: false
      queue: []

  constructor: ->
    new BufferedProcess
      command: atom.config.get('haskell-ghc-mod.ghcModPath')
      args: ['--file-map', 'test', 'version']
      exit: (code) =>
        if code!=0
          # no redirect support
          @backend=new GhcModiProcessTemp
        else
          @backend=new GhcModiProcessRedirect
          m="Haskell-ghc-mod:
             Copy of this message can be found in dev. console.
             Found master ghc-mod.
             Thank you for testing! Bear in mind that this is highly
             experimental option. Please report any bugs."
          atom.notifications.addInfo m
          console.log m
        for k,v of @commandQueues
          @runQueuedCommands k
    .onWillThrowError (error, handle) ->
      atom.notifications.addError "Haskell-ghc-mod: ghc-mod failed to launch
        it is probably missing or misconfigured",
        details: error
        dismissable: true
    @disposables = new CompositeDisposable
    @disposables.add @emitter=new Emitter

  getRootDir: (buffer) ->
    [dir]=atom.project.getDirectories().filter (dir) ->
      dir.contains(buffer.getUri())
    dir ? atom.project.getDirectories()[0] ? new Directory

  processOptions: (rootPath) ->
    sep = if process.platform=='win32' then ';' else ':'
    env = process.env
    env.PATH = rootPath+"/.cabal-sandbox/bin"+sep+env.PATH if rootPath
    options =
      cwd: rootPath
      env: env

  killProcess: =>
    @backend.killProcess()

  # Tear down any state and detach
  destroy: ->
    @backend.destroy()
    @emitter.emit 'did-destroy'
    @disposables.dispose()
    for k,v of @commandQueues
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
    cmdDesc=@commandQueues[qn].queue.shift()
    @emitter.emit 'backend-active', {queue: qn, command: cmdDesc}
    cb = cmdDesc.callback
    cmdDesc.callback = (lines) =>
      cb lines
      @commandQueues[qn].running=false
      @runQueuedCommands qn
    @backend.run cmdDesc

  runList: (rootPath, callback) =>
    @queueCmd 'completion',
      options: @processOptions(rootPath)
      command: 'list'
      callback: callback

  runLang: (callback) =>
    @queueCmd 'completion',
      command: 'lang'
      callback: callback

  runFlag: (callback) =>
    @queueCmd 'completion',
      command: 'flag'
      callback: callback

  runBrowse: (rootPath, modules,callback) =>
    @queueCmd 'completion',
      options: @processOptions(rootPath)
      command: 'browse'
      args: ['-d'].concat(modules)
      callback: (lines) ->
        callback lines.map (s) ->
          [name, typeSignature] = s.split('::').map (s) -> s.trim()
          if /^(?:type|data|newtype)/.test(typeSignature)
            symbolType='type'
          else if /^(?:class)/.test(typeSignature)
            symbolType='class'
          else
            symbolType='function'
          {name, typeSignature, symbolType}

  getTypeInBuffer: (buffer, crange, callback) =>
    if crange instanceof Point
      crange = new Range crange, crange

    @queueCmd 'typeinfo',
      interactive: true
      dir: @getRootDir(buffer)
      options: @processOptions(@getRootDir(buffer).getPath())
      command: 'type',
      uri: buffer.getUri()
      text: buffer.getText() if buffer.isModified()
      args: ["",crange.start.row+1,crange.start.column+1]
      callback: (lines) ->
        [range,type]=lines.reduce ((acc,line) ->
          return acc if acc!=''
          tokens=line.split '"'
          pos=tokens[0].trim().split(' ').map (i)->i-1
          type=tokens[1]
          myrange = new Range [pos[0],pos[1]],[pos[2],pos[3]]
          return acc unless myrange.containsRange(crange)
          return [myrange,type]),
          ''
        type=undefined unless type
        range=crange unless range
        callback {range,type}

  getSymbolInRange: (regex, buffer, crange) ->
    if crange.isEmpty()
      {start,end}=buffer.rangeForRow crange.start.row
      crange2=new Range(crange.start,crange.end)
      buffer.backwardsScanInRange regex,new Range(start,crange.start),
        ({range,stop}) ->
          crange2.start=range.start
      buffer.scanInRange regex,new Range(crange.end,end),
        ({range,stop}) ->
          crange2.end=range.end
    else
      crange2=crange

    symbol: buffer.getTextInRange crange2
    range: crange2

  getInfoInBuffer: (buffer, crange, callback) =>
    if crange instanceof Point
      crange = new Range crange, crange
    {symbol,range} = @getSymbolInRange(/[\w.']*/,buffer,crange)

    @queueCmd 'typeinfo',
      interactive: true
      dir: @getRootDir(buffer)
      options: @processOptions(@getRootDir(buffer).getPath())
      command: 'info'
      uri: buffer.getUri()
      text: buffer.getText() if buffer.isModified()
      args: ["", symbol]
      callback: (lines) ->
        text = lines.join('\n')
        text = undefined if text is 'Cannot show info' or not text
        callback {range, info: text}

  findSymbolProvidersInBuffer: (buffer, crange, callback) =>
    if crange instanceof Point
      crange = new Range crange, crange
    {symbol} = @getSymbolInRange(/[\w']*/,buffer,crange)

    @queueCmd 'find',
      options: @processOptions(@getRootDir(buffer).getPath())
      command: 'find'
      args: [symbol]
      callback: callback

  doCheckOrLintBuffer: (cmd, buffer, callback) =>
    dir = @getRootDir(buffer)
    @queueCmd 'checklint',
      dir: dir
      options: @processOptions(dir.getPath())
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
          [m,file,row,col,warning] = match
          severity =
            if cmd=='lint'
              'lint'
            else if warning=='Warning'
              'warning'
            else
              'error'
          results.push
            uri: dir.getFile(file).getPath()
            position: new Point(row-1, col-1),
            message: line.replace(m,'')
            severity: severity
        callback results

  doCheckBuffer: (buffer,callback) =>
    @doCheckOrLintBuffer "check", buffer, callback

  doLintBuffer: (buffer,callback) =>
    @doCheckOrLintBuffer "lint", buffer, callback
