{BufferedProcess, Emitter, CompositeDisposable} = require('atom')
CP = require('child_process')
InteractiveProcess = require './interactive-process'
{debug, mkError} = require './util'
{EOL} = require('os')
EOT = "#{EOL}\x04#{EOL}"

module.exports =
class GhcModiProcessBase
  processMap: null

  constructor: ->
    @processMap = new WeakMap
    @disposables = new CompositeDisposable
    @disposables.add @emitter = new Emitter

  run: ({interactive, dir, options, command, text, uri, args}) =>
    args ?= []
    P = unless interactive
      @runModCmd {options, command, text, uri, args}
    else
      @runModiCmd {dir, options, command, text, uri, args}
    P.catch (err) ->
      debug "#{err}"
      atom.notifications.addError "
        Haskell-ghc-mod: ghc-mod
        #{if interactive? then 'interactive ' else ''}command
        #{command?.join? ' ' ? command} failed with error #{err.name}",
        detail: """
          URI: #{uri}
          message: #{err.message}
          """
        dismissable: true
      return []

  spawnProcess: (rootDir, options) =>
    return unless @processMap?
    return unless atom.config.get('haskell-ghc-mod.enableGhcModi')
    proc = @processMap.get(rootDir)
    debug "Checking for ghc-modi in #{rootDir.getPath()}"
    if proc?
      debug "Found running ghc-modi instance for #{rootDir.getPath()}"
      return proc
    debug "Spawning new ghc-modi instance for #{rootDir.getPath()} with
          #{"options.#{k} = #{v}" for k, v of options}"
    proc =
      if @legacyInteractive
        modPath = atom.config.get('haskell-ghc-mod.ghcModPath')
        new InteractiveProcess(modPath, ['legacy-interactive'], options)
      else
        modiPath = atom.config.get('haskell-ghc-mod.ghcModiPath')
        new InteractiveProcess(modiPath, [], options)
    proc.onExit (code) =>
      debug "ghc-modi for #{rootDir.getPath()} ended with #{code}"
      @processMap?.delete(rootDir)
    @processMap.set rootDir, proc
    return proc

  runModCmd: ({options, command, text, uri, args}) ->
    modPath = atom.config.get('haskell-ghc-mod.ghcModPath')
    result = []
    err = []
    if uri?
      cmd = [command, uri].concat args
    else
      cmd = [command].concat args
    if text?
      cmd = ['--map-file', uri].concat cmd
    debug "running #{modPath} #{cmd} with
          #{"options.#{k} = #{v}" for k, v of options}"
    new Promise (resolve, reject) ->
      process = new BufferedProcess
        command: modPath
        args: cmd
        options: options
        stdout: (data) ->
          result = result.concat(data.split(EOL))
        stderr: (data) ->
          err = err.concat(data.split(EOL))
        exit: (code) ->
          debug "#{modPath} ended with code #{code}"
          if code != 0
            reject mkError "code #{code}", "#{err.join(EOL)}"
          else
            resolve result.slice(0, -1).map (line) ->
              line.replace /\0/g, EOL
      if text?
        debug "sending stdin text to #{modPath}"
        process.process.stdin.write "#{text}#{EOT}"
      process.onWillThrowError ({error, handle}) ->
        console.warn "Using fallback child_process because of #{error.message}"
        child = CP.execFile modPath, cmd, options, (cperror, stdout, stderr) ->
          if cperror?
            reject cperror
          else
            resolve stdout.split(EOL).slice(0, -1).map (line) ->
              line.replace /\0/g, EOL
        child.error = (error) ->
          reject error
        if text?
          debug "sending stdin text to #{modPath}"
          child.stdin.write "#{text}#{EOT}"
        handle()

  runModiCmd: (o) =>
    {dir, options, command, text, uri, args} = o
    debug "Trying to run ghc-modi in #{dir.getPath()}"
    proc = @spawnProcess(dir, options)
    unless proc
      debug "Failed. Falling back to ghc-mod"
      return @runModCmd o
    proc.do (interact) ->
      Promise.resolve()
      .then ->
        if text?
          interact "map-file #{uri}#{EOL}#{text}#{EOT}"
      .then ->
        if uri?
          cmd = [command, uri].concat args
        else
          cmd = [command].concat args

        interact cmd.join(' ').replace(EOL, ' ') + EOL
      .then (res) ->
        if text?
          interact "unmap-file #{uri}#{EOL}"
          .then -> res
        else
          res
      .catch (err) ->
        try interact "unmap-file #{uri}#{EOL}"
        throw err

  killProcess: =>
    return unless @processMap?
    debug "Killing all ghc-modi processes"
    atom.workspace.getTextEditors().forEach (editor) =>
      @killProcessForDir @getRootDir(editor.getBuffer())

  killProcessForDir: (dir) =>
    return unless @processMap?
    debug "Killing ghc-modi process for #{dir.getPath()}"
    @processMap.get(dir)?.kill?()
    @processMap.delete(dir)

  destroy: =>
    return unless @processMap?
    debug "GhcModiProcessBase destroying"
    @killProcess()
    @emitter.emit 'did-destroy'
    @emitter = null
    @disposables.dispose()
    @processMap = null

  onDidDestroy: (callback) =>
    return unless @processMap?
    @emitter.on 'did-destroy', callback
