{BufferedProcess,Emitter,CompositeDisposable} = require('atom')
Temp = require('temp')
FS = require('fs')
GhcModiProcessBase = require './ghc-modi-process-base'

module.exports =
class GhcModiProcessTemp extends GhcModiProcessBase

  run: ({interactive,dir,options,command,text,uri,args,callback}) =>
    args ?= []
    unless interactive
      if text?
        @withTempFile text, @runModCmd, {options, command, uri, args, callback}
      else
        @runModCmd {options, command, uri, args, callback}
    else
      if text?
        @withTempFile text, @runModiCmd,
          {dir,options,command,text,uri,args,callback}
      else
        @runModiCmd {dir,options,command,text,uri,args,callback}

  runModCmd: ({options,command,uri,args,callback}) ->
    modPath = atom.config.get('haskell-ghc-mod.ghcModPath')
    result = []
    err = []
    if uri?
      cmd = [command, uri].concat args
    else
      cmd = [command].concat args
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

  runModiCmd: ({dir,options,command,text,uri,args,callback}) =>
    process=@spawnProcess(dir,options)
    unless process
      return @run {options,command,text,uri,args,callback}
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

  withTempFile: (contents,func,opts) ->
    Temp.open
      prefix:'haskell-ghc-mod',
      suffix:'.hs',
      (err,info) ->
        if err
          atom.notifications.addError "Haskell-ghc-mod: Error when writing
            temp. file",
            detail: "#{err}"
            dismissable: true
          opts.callback []
          return
        FS.writeSync info.fd,contents
        {uri,callback} = opts
        opts.uri = info.path
        opts.callback = (res) ->
          FS.close info.fd, -> FS.unlink info.path
          callback res.map (line) ->
            line.split(info.path).join(uri)
        func opts
