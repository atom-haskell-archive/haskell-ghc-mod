{BufferedProcess,Emitter,CompositeDisposable} = require('atom')
GhcModiProcessBase = require './ghc-modi-process-base'

module.exports =
class GhcModiProcessRedirect extends GhcModiProcessBase

  run: ({interactive,dir,options,command,text,uri,args,callback}) =>
    args ?= []
    unless interactive
      @runModCmd {options, command, text, uri, args, callback}
    else
      @runModiCmd {dir,options,command,text,uri,args,callback}

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
      return @run {options,command,text,uri,args,callback}
    if text?
      process.stdin.write "load #{uri}\n#{text}\x04\n"
    process.stdout.once 'data', (data)->
      if "#{data}" isnt 'OK\n'
        callback []
        return
      process.stdout.once 'data', (data)->
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
    if uri?
      cmd = [command, uri].concat args
    else
      cmd = [command].concat args
    process.stdin.write cmd.join(' ').replace(/\r|\r?\n/g,' ') + '\n'
    if text?
      process.stdin.write "unload #{uri}\n"
