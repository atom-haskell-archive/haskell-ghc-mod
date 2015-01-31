{Range,Point} = require('atom')
Temp = require('temp')
FS = require('fs')
CP = require('child_process')

module.exports =
class GhcModiProcess
  constructor: ->
    @spawnProcess()
    @services=atom.services.provide "haskell-ghc-mod", "0.1.0",
      type: @getType
      info: @getInfo
      check: @doCheck
      list: @runList
      lang: @runLang
      flag: @runFlag
      browse: @runBrowse

  processOptions: ->
    rootPath = atom.project.getRootDirectory().path
    sep = if process.platform=='win32' then ';' else ':'
    env = process.env
    env.PATH = rootPath+"/.cabal-sandbox/bin"+sep+env.PATH
    options =
      cwd: rootPath
      env: env

  spawnProcess: =>
    return unless atom.config.get('haskell-ghc-mod.enableGhcModi')
    @modiPath = atom.config.get('haskell-ghc-mod.ghcModiPath')
    @process = CP.spawn(@modiPath,[],@processOptions())
    @process.once 'exit', =>
      @spawnProcess()

  # Tear down any state and detach
  destroy: ->
    @process?.removeAllListeners? 'exit'
    @services.dispose()
    @process?.stdin?.end?()

  runCmd: (command, callback) ->
    unless atom.config.get('haskell-ghc-mod.enableGhcModi')
      @runModCmd command, (lines) ->
        callback lines.map (line)->
          line.split('\0').join('\n')
    else
      @spawnProcess() unless @process
      @process.stdout.once 'data', (data)->
        lines = "#{data}".split("\n")
        result = lines[lines.length-2]
        throw new Error("Ghc-modi terminated:\n"+"#{result}")\
          unless result.match(/^OK/)
        lines = lines.slice(0,-2)
        callback lines.map (line)->
          line.split('\0').join('\n')
      @process.stdin.write(command.join(' ')+'\n')

  runModCmd: (args,callback) =>
    modPath = atom.config.get('haskell-ghc-mod.ghcModPath')
    CP.execFile modPath, args, @processOptions(), (error,result) ->
      throw new Error(error) if error
      callback result.split('\n').slice(0,-1)

  runList: (callback) =>
    @runModCmd ['list'], callback

  runLang: (callback) =>
    @runModCmd ['lang'], callback

  runFlag: (callback) =>
    @runModCmd ['flag'], callback

  runBrowse: (modules,callback) =>
    @runModCmd ['browse','-d'].concat(modules), callback

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

  getType: (text, crange, callback) =>
    @withTempFile text, (path,close) =>
      cpos = crange.start
      command = ["type",path,"",cpos.row+1,cpos.column+1]

      @runCmd command, (lines) ->
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
      @runCmd command, (lines) ->
        close()
        callback lines.join('\n')

  doCheck: (text, callback) =>
    @withTempFile text, (path,close) =>
      command = ["check",path]
      @runCmd command, (lines) ->
        close()
        lines.forEach (line) ->
          [m,row,col] = line.match(/^.*?:([0-9]+):([0-9]+):/)
          callback new Point(row-1, col-1), line.replace(m,'')
