{BufferedProcess,Emitter,CompositeDisposable} = require('atom')
CP = require('child_process')

module.exports =
class GhcModiProcessBase
  processMap: null

  constructor: ->
    @processMap = new WeakMap
    @disposables = new CompositeDisposable
    @disposables.add @emitter=new Emitter

  spawnProcess: (rootDir,options)=>
    return unless @processMap?
    return unless atom.config.get('haskell-ghc-mod.enableGhcModi')
    timer = setTimeout (=> @killProcessForDir rootDir), 60*60*1000
    proc = @processMap.get(rootDir)
    if proc?
      clearTimeout proc.timer
      proc.timer = timer
      return proc.process
    modiPath = atom.config.get('haskell-ghc-mod.ghcModiPath')
    proc = CP.spawn(modiPath,[],options)
    proc.on 'stderr', (data) ->
      console.error 'Ghc-modi says:',data
    proc.on 'exit', (code) =>
      @processMap.delete(rootDir)
      @spawnProcess(rootDir,options) if code!=0
    @processMap.set rootDir,
      process: proc
      timer: timer
    return proc

  runModCmd: ({options,command,text,uri,args,callback}) ->
    modPath = atom.config.get('haskell-ghc-mod.ghcModPath')
    result = []
    err = []
    if uri?
      cmd = [command, uri].concat args
    else
      cmd = [command].concat args
    if text?
      cmd = ['--file-map',uri].concat cmd
    process=new BufferedProcess
      command: modPath
      args: cmd
      options: options
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
    if text?
      process.process.stdin.write "#{text}\x04\n"

  runModiCmd: ({dir,options,command,text,uri,args,callback}) =>
    process=@spawnProcess(dir,options)
    unless process
      return @runModCmd {options,command,text,uri,args,callback}
    parseData = (data)->
      lines = "#{data}".split("\n")
      result = lines[lines.length-2]
      unless result.match(/^OK/)
        atom.notifications.addError "Haskell-ghc-mod: ghc-modi crashed
            on #{command} with message #{result}",
          detail: dir.getPath()
          dismissable: true
        console.error lines
        callback []
        return
      lines = lines.slice(0,-2)
      callback lines.map (line)->
        line.replace /\0/g,'\n'
    if text?
      process.stdin.write "load #{uri}\n#{text}\x04\n"
      process.stdout.once 'data', (data)->
        if "#{data}" isnt 'OK\n'
          callback []
          return
        process.stdout.once 'data', parseData
    else
      process.stdout.once 'data', parseData

    if uri?
      cmd = [command, uri].concat args
    else
      cmd = [command].concat args
    process.stdin.write cmd.join(' ').replace(/\r|\r?\n/g,' ') + '\n'

    if text?
      process.stdin.write "unload #{uri}\n"

  killProcess: =>
    return unless @processMap?
    atom.project.getDirectories().forEach (dir) =>
      @killProcessForDir dir

  killProcessForDir: (dir) =>
    return unless @processMap?
    clearTimeout @processMap.get(dir)?.timer
    @processMap.get(dir)?.process.stdin?.end?()
    @processMap.get(dir)?.process.kill?()
    @processMap.delete(dir)

  destroy: =>
    return unless @processMap?
    @killProcess()
    @emitter.emit 'did-destroy'
    @emitter = null
    @disposables.dispose()
    @processMap = null

  onDidDestroy: (callback) =>
    return unless @processMap?
    @emitter.on 'did-destroy', callback
