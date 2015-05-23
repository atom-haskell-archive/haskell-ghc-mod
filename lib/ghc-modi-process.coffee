{BufferedProcess,Range,Point,Emitter} = require('atom')
Temp = require('temp')
FS = require('fs')
CP = require('child_process')
replaceAll = require './replace-all'

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

  constructor: ->
    @processMap = new WeakMap
    @emitter = new Emitter

  getRootDir: (buffer) ->
    dirs=atom.project.getDirectories().filter (dir) ->
      dir.contains(buffer.getUri())
    dirs[0]

  processOptions: (rootDir) ->
    rootPath = rootDir?.getPath()
    sep = if process.platform=='win32' then ';' else ':'
    env = process.env
    env.PATH = rootPath+"/.cabal-sandbox/bin"+sep+env.PATH if rootPath
    options =
      cwd: rootPath
      env: env

  spawnProcess: (rootDir)=>
    return unless atom.config.get('haskell-ghc-mod.enableGhcModi')
    proc = @processMap.get(rootDir)
    if proc?
      return proc
    modiPath = atom.config.get('haskell-ghc-mod.ghcModiPath')
    proc = CP.spawn(modiPath,[],@processOptions(rootDir))
    proc.on 'stderr', (data) ->
      console.error(data)
    proc.on 'exit', (code) ->
      @spawnProcess(rootDir) if code!=0
    @processMap.set(rootDir,proc)
    return proc

  killProcess: =>
    atom.project.getDirectories().forEach (dir) =>
      @processMap.get(dir)?.stdin?.end?()
      @processMap.get(dir)?.kill?()
      @processMap.set(dir,null)

  # Tear down any state and detach
  destroy: ->
    @killProcess()
    @emitter.emit 'did-destroy'

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
      @runModCmd rootDir, command, (lines) ->
        callback lines.map (line) ->
          replaceAll(line,'\0','\n')
    else
      process=@spawnProcess(rootDir)
      process.stdout.once 'data', (data)->
        lines = "#{data}".split("\n")
        result = lines[lines.length-2]
        console.error ("Ghc-modi terminated:\n"+"#{result}")\
          unless result.match(/^OK/)
        lines = lines.slice(0,-2)
        callback lines.map (line)->
          replaceAll(line,'\0','\n')
      process.stdin.write(command.join(' ')+'\n')

  runModCmd: (rootDir,args,callback) =>
    modPath = atom.config.get('haskell-ghc-mod.ghcModPath')
    result = []
    err = []
    process=new BufferedProcess
      command: modPath
      args: args
      options: @processOptions(rootDir)
      stdout: (data) ->
        result=result.concat(data.split('\n'))
      stderr: (data) ->
        err=err.concat(data.split('\n'))
      exit: (code) ->
        if code!=0
          console.error err.join('\n')
        else
          callback result.slice(0,-1).map (line)->
            replaceAll(line,'\0','\n')

  runList: (rootDir, callback) =>
    @queueCmd 'completion', @runModCmd, rootDir, ['list'], callback

  runLang: (callback) =>
    @queueCmd 'completion', @runModCmd, null, ['lang'], callback

  runFlag: (callback) =>
    @queueCmd 'completion', @runModCmd, null, ['flag'], callback

  runBrowse: (rootDir, modules,callback) =>
    @queueCmd 'completion', @runModCmd,
      rootDir, ['browse','-d'].concat(modules), (lines) ->
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
        type='???' unless type
        range=crange unless range
        callback {range,type}

  getInfoInBuffer: (buffer, crange, callback) =>
    if crange instanceof Point
      crange = new Range crange, crange

    @withTempFile buffer.getText(), (path,close) =>
      if crange.isEmpty()
        {start,end}=buffer.getRange()
        crange2=new Range(crange.start,crange.end)
        buffer.backwardsScanInRange /[\w.]*/,new Range(start,crange.start),
          ({range,stop}) ->
            crange2.start=range.start
            stop()
        buffer.scanInRange /[\w.]*/,new Range(crange.end,end),
          ({range,stop}) ->
            crange2.end=range.end
            stop()
      else
        crange2=crange
      symbol = buffer.getTextInRange(crange2)
      command = ["info",path,"",symbol]
      @queueCmd 'typeinfo', @runCmd, @getRootDir(buffer), command, (lines) ->
        close()
        text = lines
          .map (line) ->
            line.replace(path,buffer.getUri())
          .join('\n')
        callback {range: crange, info: text}

  doCheckOrLintBuffer: (cmd, buffer, callback) =>
    @withTempFile buffer.getText(), (path,close) =>
      command = [cmd,path]
      @queueCmd 'checklint',@runModCmd,@getRootDir(buffer),command,(lines) ->
        close()
        results = []
        lines.forEach (line) ->
          [m,file,row,col,warning] =
            line.match(/^(.*?):([0-9]+):([0-9]+): *(?:(Warning|Error): *)?/)
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
