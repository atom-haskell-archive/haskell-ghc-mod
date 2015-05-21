{BufferedProcess,Range,Point,Emitter} = require('atom')
Temp = require('temp')
FS = require('fs')
CP = require('child_process')
replaceAll = require './replace-all'

module.exports =
class GhcModiProcess
  editorCount: 0
  processMap: null
  commandQueue: []
  commandRunning: false

  constructor: ->
    @processMap = new WeakMap
    @emitter = new Emitter

  addEditor: () ->
    @editorCount+=1
    # @spawnProcess()

  removeEditor: () ->
    @editorCount-=1
    if @editorCount==0
      @killProcess()

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

  onBackendActive: (callback) =>
    @emitter.on 'backend-active', callback

  onBackendIdle: (callback) =>
    @emitter.on 'backend-idle', callback

  queueCmd: (runFunc, rootDir, command, callback) =>
    @commandQueue.push({f:runFunc,rd:rootDir,cmd:command,cb:callback})
    @runQueuedCommands()

  runQueuedCommands: =>
    if @commandQueue.length == 0
      @emitter.emit 'backend-idle'
      return
    else if @commandRunning
      return

    @commandRunning = true
    {f,rd,cmd,cb}=@commandQueue.shift()
    @emitter.emit 'backend-active', cmd.join(' ')
    f rd, cmd, (lines) =>
      cb lines
      @commandRunning=false
      @runQueuedCommands()

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
    @queueCmd @runModCmd, rootDir, ['list'], callback

  runLang: (callback) =>
    @queueCmd @runModCmd, null, ['lang'], callback

  runFlag: (callback) =>
    @queueCmd @runModCmd, null, ['flag'], callback

  runBrowse: (rootDir, modules,callback) =>
    @queueCmd @runModCmd, rootDir, ['browse','-d'].concat(modules), callback

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

  # leagacy commands
  getType: (text, crange, callback) =>
    @withTempFile text, (path,close) =>
      cpos = crange.start
      command = ["type",path,"",cpos.row+1,cpos.column+1]

      @queueCmd @runCmd, atom.project.getDirectories()[0], command, (lines) ->
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
        callback range,type

  getInfo: (text,symbol,callback) =>
    @withTempFile text, (path,close) =>
      command = ["info",path,"",symbol]
      @queueCmd @runCmd, atom.project.getDirectories()[0], command, (lines) ->
        close()
        callback lines.join('\n'), path

  doCheck: (text, callback) =>
    @withTempFile text, (path,close) =>
      command = ["check",path]
      @queueCmd @runModCmd,atom.project.getDirectories()[0], command, (lines) ->
        close()
        lines.forEach (line) ->
          [m,file,row,col] = line.match(/^(.*?):([0-9]+):([0-9]+):/)
          callback new Point(row-1, col-1), line.replace(m,''), file, path

  #buffer commands
  getTypeInBuffer: (buffer, crange, callback) =>
    @withTempFile buffer.getText(), (path,close) =>
      cpos = crange.start
      command = ["type",path,"",cpos.row+1,cpos.column+1]

      @queueCmd @runCmd, @getRootDir(buffer), command, (lines) ->
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
        callback range,type

  getInfoInBuffer: (buffer, crange, callback) =>
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
      @queueCmd @runCmd, @getRootDir(buffer), command, (lines) ->
        close()
        text = lines
          .map (line) ->
            line.replace(path,buffer.getUri())
          .join('\n')
        callback crange,text

  doCheckOrLintBuffer: (cmd, buffer, callback) =>
    @withTempFile buffer.getText(), (path,close) =>
      command = [cmd,path]
      @queueCmd @runModCmd, @getRootDir(buffer), command, (lines) ->
        close()
        lines.forEach (line) ->
          [m,file,row,col] = line.match(/^(.*?):([0-9]+):([0-9]+):/)
          file=buffer.getUri() if file==path
          callback new Point(row-1, col-1), line.replace(m,''), file

  doCheckBuffer: (buffer,callback) =>
    @doCheckOrLintBuffer "check", buffer, callback

  doLintBuffer: (buffer,callback) =>
    @doCheckOrLintBuffer "lint", buffer, callback
