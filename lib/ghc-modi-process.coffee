{Range} = require('atom')
Temp = require('temp')
FS = require('fs')
CP = require('child_process')

module.exports =
class GhcModiProcess
  constructor: ->
    @modiPath = atom.config.get('haskell-ghc-mod.ghcModiPath')
    @modPath = atom.config.get('haskell-ghc-mod.ghcModPath')
    @process = CP.spawn(@modiPath,['-b\r'])
    @services=atom.services.provide "haskell-ghc-mod", "0.1.0",
      type: @getType
      info: @getInfo
      check: @doCheck
      list: @runList
      lang: @runLang
      flag: @runFlag
      browse: @runBrowse


  # Tear down any state and detach
  destroy: ->
    @services.dispose()
    @process.stdin.end()

  runCmd: (command, callback) ->
    @process.stdout.once 'data', callback
    @process.stdin.write(command)

  runModCmd: (args,callback) =>
    CP.execFile @modPath, args, {}, (error,result) ->
      callback result.split('\n') if not error

  runList: (callback) =>
    @runModCmd ['list'], callback

  runLang: (callback) =>
    @runModCmd ['lang'], callback

  runFlag: (callback) =>
    @runModCmd ['flag'], callback

  runBrowse: (modules,callback) =>
    @runModCmd ['browse','-d'].concat(modules), callback

  getType: (text, crange, callback) =>
    Temp.open
      prefix:'haskell-ghc-mod',
      suffix:'.hs',
      (err,info) =>
        if err
          console.log(err)
          return
        FS.writeSync info.fd,text
        cpos = crange.start
        command = "type "+info.path+" "+(cpos.row+1)+
          " "+(cpos.column+1)+"\n"
        @runCmd command, (data) ->
          FS.close info.fd, -> FS.unlink info.path
          lines = "#{data}".split("\n").filter (line) ->
            return true unless line=="OK" || line==""
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
          callback range,type.replace(/\r/g,'\n'),crange

  getInfo: (text,symbol,callback) =>
    Temp.open
      prefix:'haskell-ghc-mod',
      suffix:'.hs',
      (err,info) =>
        if err
          console.log(err)
          return
        FS.writeSync info.fd,text
        command = "info "+info.path+" "+symbol+"\n"
        @runCmd command, (data) ->
          FS.close info.fd, -> FS.unlink info.path
          lines = "#{data}".split("\n").filter (line) ->
            return true unless line=="OK" || line==""
          callback lines.join('\n').replace(/\r/g,'\n')

  doCheck: (text, callback) =>
    Temp.open
      prefix:'haskell-ghc-mod',
      suffix:'.hs',
      (err,info) =>
        if err
          console.log(err)
          return
        FS.writeSync info.fd,text
        command = "check "+info.path+"\n"
        @runCmd command, (data) ->
          FS.close info.fd, -> FS.unlink info.path
          lines = "#{data}".split("\n").filter (line) ->
            return true unless line=="OK" || line==""
          lines.forEach (line) ->
            get = (line) ->
              idx=line.indexOf(':')
              [line.substring(0,idx), line.substring(idx+1)]
            [file,line]=get line
            [row,line]=get line
            [col,line]=get line
            callback row-1, col-1, line.replace(/\r/g,'\n')
