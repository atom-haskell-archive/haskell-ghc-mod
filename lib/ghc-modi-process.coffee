{Range} = require('atom')

module.exports =
class GhcModiProcess
  constructor: ->
    @process = require('child_process').spawn('ghc-modi',['-b\r'])

  # Tear down any state and detach
  destroy: ->
    @process.stdin.end()

  runCmd: (command, callback) ->
    @process.stdout.once 'data', callback
    @process.stdin.write(command)

  getType: (path, range, callback) ->
    cpos = range.start
    command = "type "+path+" "+(cpos.row+1)+
      " "+(cpos.column+1)+"\n"
    @runCmd command, (data) ->
      lines = "#{data}".split("\n").filter (line) ->
        return true unless line=="OK" || line==""
      [range,type]=lines.reduce ((acc,line) ->
        return acc if acc!=''
        tokens=line.split '"'
        pos=tokens[0].trim().split(' ').map (i)->i-1
        type=tokens[1]
        myrange = new Range [pos[0],pos[1]],[pos[2],pos[3]]
        return acc unless myrange.containsRange(range)
        return [myrange,type]),
        ''
      callback range,type.replace(/\r/g,'\n') if type

  getInfo: (path,symbol,callback) ->
    command = "info "+path+" "+symbol+"\n"
    @runCmd command, (data) ->
      lines = "#{data}".split("\n").filter (line) ->
        return true unless line=="OK" || line==""
      callback lines.join('\n').replace(/\r/g,'\n')

  doCheck: (path, callback) ->
    command = "check "+path+"\n"
    @runCmd command, (data) ->
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
