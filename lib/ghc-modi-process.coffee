{Range} = require('atom')
Temp = require('temp')
FS = require('fs')

module.exports =
class GhcModiProcess
  constructor: ->
    @path = atom.config.get('haskell-ghc-mod.ghcModiPath')
    @process = require('child_process').spawn(@path,['-b\r'])

  # Tear down any state and detach
  destroy: ->
    @process.stdin.end()

  runCmd: (command, callback) ->
    @process.stdout.once 'data', callback
    @process.stdin.write(command)

  getType: (text, crange, callback) ->
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
          callback range,type.replace(/\r/g,'\n'),crange if type

  getInfo: (text,symbol,callback) ->
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

  doCheck: (text, callback) ->
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
          lines = "#{data}".split("\n").filter (line) =>
            return true unless line=="OK" || line==""
          lines.forEach (line) ->
            get = (line) ->
              idx=line.indexOf(':')
              [line.substring(0,idx), line.substring(idx+1)]
            [file,line]=get line
            [row,line]=get line
            [col,line]=get line
            callback row-1, col-1, line.replace(/\r/g,'\n')
