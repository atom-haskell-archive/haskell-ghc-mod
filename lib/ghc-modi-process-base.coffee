{BufferedProcess, Emitter, CompositeDisposable} = require('atom')
CP = require('child_process')
{debug} = require './util'
{EOL} = require('os')
EOT = "#{EOL}\x04#{EOL}"

module.exports =
class GhcModiProcessBase
  processMap: null

  constructor: ->
    @processMap = new WeakMap
    @disposables = new CompositeDisposable
    @disposables.add @emitter = new Emitter
    @interactiveAction = Promise.resolve()

  run: ({interactive, dir, options, command, text, uri, args}) =>
    args ?= []
    unless interactive
      @runModCmd {options, command, text, uri, args}
    else
      @runModiCmd {dir, options, command, text, uri, args}

  spawnProcess: (rootDir, options) =>
    return unless @processMap?
    return unless atom.config.get('haskell-ghc-mod.enableGhcModi')
    timer = setTimeout (=>
      debug "Killing ghc-modi for #{rootDir.getPath()} due to inactivity"
      @killProcessForDir rootDir), 60 * 60 * 1000
    proc = @processMap.get(rootDir)
    debug "Checking for ghc-modi in #{rootDir.getPath()}"
    if proc?
      debug "Found running ghc-modi instance for #{rootDir.getPath()}"
      clearTimeout proc.timer
      proc.timer = timer
      return proc.process
    debug "Spawning new ghc-modi instance for #{rootDir.getPath()} with
          #{"options.#{k} = #{v}" for k, v of options}"
    proc =
      if @legacyInteractive
        modPath = atom.config.get('haskell-ghc-mod.ghcModPath')
        CP.spawn(modPath, ['legacy-interactive'], options)
      else
        modiPath = atom.config.get('haskell-ghc-mod.ghcModiPath')
        CP.spawn(modiPath, [], options)
    proc.stdout.setEncoding 'utf-8'
    proc.stderr.on 'data', (data) ->
      console.error "ghc-modi said: #{data}"
    proc.on 'exit', (code) =>
      debug "ghc-modi for #{rootDir.getPath()} ended with #{code}"
      @processMap?.delete(rootDir)
      @spawnProcess(rootDir, options) if code != 0
    @processMap.set rootDir,
      process: proc
      timer: timer
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
            reject message: "code #{code}", detail: "#{err.join(EOL)}"
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
            reject message: "message #{cperror}", detail: "#{stdout}#{EOL}#{stderr}"
          else
            resolve stdout.split(EOL).slice(0, -1).map (line) ->
              line.replace /\0/g, EOL
        child.error = (error) ->
          reject message: "#{error}"
        if text?
          debug "sending stdin text to #{modPath}"
          child.stdin.write "#{text}#{EOT}"
        handle()
    .catch (err) ->
      atom.notifications.addError "Haskell-ghc-mod: #{modPath}
          #{cmd.join ' '} failed with error #{err.message}",
        detail: "#{err.detail}"
        dismissable: true
      return []

  waitForAnswer: (proc, cmd) ->
    new Promise (resolve, reject) ->
      savedLines = []
      exitCallback = null
      parseData = null
      timer = null
      cleanup = ->
        proc.stdout.removeListener 'data', parseData
        proc.removeListener 'exit', exitCallback
        clearTimeout timer
      parseData = (data) ->
        debug "Got response from ghc-modi:#{EOL}#{data}"
        lines = data.split(EOL)
        savedLines = savedLines.concat lines
        result = savedLines[savedLines.length - 2]
        if result is 'OK'
          cleanup()
          lines = savedLines.slice(0, -2)
          resolve lines.map (line) ->
            line.replace /\0/g, EOL
      exitCallback = ->
        cleanup()
        console.error "#{savedLines}"
        reject "ghc-modi crashed on command #{cmd} with message #{savedLines}"
      proc.stdout.on 'data', parseData
      proc.on 'exit', exitCallback
      timer = setTimeout (->
        cleanup()
        console.error "#{savedLines}"
        reject "Timeout on ghc-modi command #{cmd}; message so far: #{savedLines}"
        ), 60000

  interact: (proc, command) ->
    resultP = @waitForAnswer proc, command
    debug "Running ghc-modi command #{command.split(EOL)[0]}"
    proc.stdin.write command
    return resultP

  runModiCmd: (o) =>
    {dir, options, command, text, uri, args} = o
    debug "Trying to run ghc-modi in #{dir.getPath()}"
    proc = @spawnProcess(dir, options)
    unless proc
      debug "Failed. Falling back to ghc-mod"
      return @runModCmd o
    @interactiveAction =
    @interactiveAction.then =>
      if text?
        @interact proc, "map-file #{uri}#{EOL}#{text}#{EOT}"
    .then =>
      if uri?
        cmd = [command, uri].concat args
      else
        cmd = [command].concat args

      @interact proc, cmd.join(' ').replace(EOL, ' ') + EOL
    .then (res) =>
      if text?
        @interact proc, "unmap-file #{uri}#{EOL}"
        .then -> res
      else
        res
    .catch (err) ->
      debug "#{err}"
      atom.notifications.addError 'Looks like something went wrong',
        detail: "#{err}"
        dismissable: true
      try proc.stdin.write "unmap-file #{uri}#{EOL}"
      return []

  killProcess: =>
    return unless @processMap?
    debug "Killing all ghc-modi processes"
    atom.workspace.getTextEditors().forEach (editor) =>
      @killProcessForDir @getRootDir(editor.getBuffer())

  killProcessForDir: (dir) =>
    return unless @processMap?
    debug "Killing ghc-modi process for #{dir.getPath()}"
    clearTimeout @processMap.get(dir)?.timer
    @processMap.get(dir)?.process.stdin?.end?()
    @processMap.get(dir)?.process.kill?()
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
