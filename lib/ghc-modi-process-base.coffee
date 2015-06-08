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
