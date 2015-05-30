{BufferedProcess,Range,Point,Emitter,CompositeDisposable,
Directory} = require('atom')
Temp = require('temp')
FS = require('fs')
CP = require('child_process')

module.exports =
class GhcModiProcess
  processMap: null
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
    @processMap = new WeakMap
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

  spawnProcess: (rootDir)=>
    return unless atom.config.get('haskell-ghc-mod.enableGhcModi')
    timer = setTimeout (=> @killProcessForDir rootDir), 60*60*1000
    proc = @processMap.get(rootDir)
    if proc?
      clearTimeout proc.timer
      proc.timer = timer
      return proc.process
    modiPath = atom.config.get('haskell-ghc-mod.ghcModiPath')
    proc = CP.spawn(modiPath,[],@processOptions(rootDir.getPath()))
    proc.on 'stderr', (data) ->
      console.error 'Ghc-modi says:',data
    proc.on 'exit', (code) =>
      @processMap.delete(rootDir)
      @spawnProcess(rootDir) if code!=0
    @processMap.set rootDir,
      process: proc
      timer: timer
    return proc

  killProcess: =>
    atom.project.getDirectories().forEach (dir) =>
      @killProcessForDir dir

  killProcessForDir: (dir) =>
    clearTimeout @processMap.get(dir)?.timer
    @processMap.get(dir)?.process.stdin?.end?()
    @processMap.get(dir)?.process.kill?()
    @processMap.delete(dir)

  # Tear down any state and detach
  destroy: ->
    @killProcess()
    @emitter.emit 'did-destroy'
    @disposables.dispose()
    @processMap = null
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

  queueCmd: (qn, runFunc, rootDir, command, callback) =>
    @commandQueues[qn].queue.push
      f:runFunc
      rd:rootDir
      cmd:command
      cb:callback
    @runQueuedCommands qn

  runQueuedCommands: (qn) =>
    if @commandQueues[qn].queue.length == 0
      @emitter.emit 'queue-idle', {queue: qn}
      if (Object.keys(@commandQueues).every (k) =>
        @commandQueues[k].queue.length == 0)
        @emitter.emit 'backend-idle'
      return
    else if @commandQueues[qn].running
      return

    @commandQueues[qn].running = true
    {f,rd,cmd,cb}=@commandQueues[qn].queue.shift()
    @emitter.emit 'backend-active', {queue: qn, command: cmd.join(' ')}
    f rd, cmd, (lines) =>
      cb lines
      @commandQueues[qn].running=false
      @runQueuedCommands qn

  runCmd: (rootDir, command, callback) =>
    unless atom.config.get('haskell-ghc-mod.enableGhcModi')
      @runModCmd rootDir.getPath(), command, (lines) ->
        callback lines.map (line) ->
          line.replace /\0/g,'\n'
    else
      process=@spawnProcess(rootDir)
      process.stdout.once 'data', (data)->
        lines = "#{data}".split("\n")
        result = lines[lines.length-2]
        unless result.match(/^OK/)
          atom.notifications.addError "Haskell-ghc-mod: ghc-modi crashed
              on #{command.join ' '} with message #{result}",
            detail: rootDir.getPath()
            dismissable: true
          console.error lines
          callback []
          return
        lines = lines.slice(0,-2)
        callback lines.map (line)->
          line.replace /\0/g,'\n'
      process.stdin.write command.join(' ').replace(/\r|\r?\n/g,' ') + '\n'

  runModCmd: (rootPath,args,callback) =>
    modPath = atom.config.get('haskell-ghc-mod.ghcModPath')
    result = []
    err = []
    process=new BufferedProcess
      command: modPath
      args: args
      options: @processOptions(rootPath)
      stdout: (data) ->
        result=result.concat(data.split('\n'))
      stderr: (data) ->
        err=err.concat(data.split('\n'))
      exit: (code) ->
        if code!=0
          atom.notifications.addError "Haskell-ghc-mod: #{modPath}
              #{args.join ' '} failed with error code #{code}",
            detail: "#{err.join('\n')}"
            dismissable: true
          console.error err
          callback []
        else
          callback result.slice(0,-1).map (line)->
            line.replace /\0/g,'\n'

    process.onWillThrowError ({error, handle}) ->
      atom.notifications.addError "Haskell-ghc-mod could not spawn #{modPath}",
        detail: "#{error}"
        dismissable: true
      console.error error
      callback []
      handle()

  runList: (rootPath, callback) =>
    @queueCmd 'completion', @runModCmd, rootPath, ['list'], callback

  runLang: (callback) =>
    @queueCmd 'completion', @runModCmd, null, ['lang'], callback

  runFlag: (callback) =>
    @queueCmd 'completion', @runModCmd, null, ['flag'], callback

  runFind: (rootPath, symbol, callback) =>
    @queueCmd 'find', @runModCmd, rootPath, ['find', symbol], callback

  runBrowse: (rootPath, modules,callback) =>
    @queueCmd 'completion', @runModCmd,
      rootPath, ['browse','-d'].concat(modules), (lines) ->
        callback lines.map (s) ->
          [name, typeSignature] = s.split('::').map (s) -> s.trim()
          if /^(?:type|data|newtype)/.test(typeSignature)
            symbolType='type'
          else if /^(?:class)/.test(typeSignature)
            symbolType='class'
          else
            symbolType='function'
          {name, typeSignature, symbolType}

  withTempFile: (contents,callback) ->
    Temp.open
      prefix:'haskell-ghc-mod',
      suffix:'.hs',
      (err,info) ->
        if err
          console.log(err)
          return
        FS.writeSync info.fd,contents
        callback info.path, ->
          FS.close info.fd, -> FS.unlink info.path

  getTypeInBuffer: (buffer, crange, callback) =>
    if crange instanceof Point
      crange = new Range crange, crange

    @withTempFile buffer.getText(), (path,close) =>
      cpos = crange.start
      command = ["type",path,"",cpos.row+1,cpos.column+1]

      @queueCmd 'typeinfo', @runCmd, @getRootDir(buffer), command, (lines) ->
        close()
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

    @withTempFile buffer.getText(), (path,close) =>
      command = ["info",path,"",symbol]
      @queueCmd 'typeinfo', @runCmd, @getRootDir(buffer), command, (lines) ->
        close()
        text = lines
          .map (line) ->
            line.replace(path,buffer.getUri())
          .join('\n')
        text = undefined if text is 'Cannot show info' or not text
        callback {range, info: text}

  findSymbolProvidersInBuffer: (buffer, crange, callback) =>
    if crange instanceof Point
      crange = new Range crange, crange
    {symbol} = @getSymbolInRange(/[\w']*/,buffer,crange)

    @runFind @getRootDir(buffer).getPath(), symbol, callback

  doCheckOrLintBuffer: (cmd, buffer, callback) =>
    @withTempFile buffer.getText(), (path,close) =>
      command = [cmd,path]
      @queueCmd 'checklint',@runModCmd,@getRootDir(buffer).getPath(),
        command,(lines) ->
          close()
          results = []
          lines.forEach (line) ->
            match =
              line.match(/^(.*?):([0-9]+):([0-9]+): *(?:(Warning|Error): *)?/)
            unless match?
              console.log("Ghc-Mod says: #{line}")
              return
            [m,file,row,col,warning] = match
            file=buffer.getUri() if file==path
            severity =
              if cmd=='lint'
                'lint'
              else if warning=='Warning'
                'warning'
              else
                'error'
            results.push
              uri: file
              position: new Point(row-1, col-1),
              message: line.replace(m,'')
              severity: severity
          callback results

  doCheckBuffer: (buffer,callback) =>
    @doCheckOrLintBuffer "check", buffer, callback

  doLintBuffer: (buffer,callback) =>
    @doCheckOrLintBuffer "lint", buffer, callback
