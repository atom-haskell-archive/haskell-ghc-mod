{BufferedProcess, Emitter, CompositeDisposable, Directory} = require('atom')
CP = require('child_process')
InteractiveProcess = require './interactive-process'
{debug, warn, mkError, withTempFile, EOT} = Util = require '../util'
{EOL} = require('os')

module.exports =
class GhcModiProcessReal
  constructor: (@caps) ->
    @processMap = new Map #FilePath -> InteractiveProcess
    @bufferDirMap = new WeakMap #TextBuffer -> FilePath
    @disposables = new CompositeDisposable
    @disposables.add @emitter = new Emitter

  getRootDir: (buffer) ->
    dir = @bufferDirMap.get buffer
    if dir?
      return dir
    dir =
      if @caps.rootExec
        modPath = atom.config.get('haskell-ghc-mod.ghcModPath')
        bufferDir = buffer.file?.getParent?() ? Util.getRootDirFallback buffer
        options = Util.getProcessOptions(bufferDir.getPath())
        options.timeout = atom.config.get('haskell-ghc-mod.syncTimeout')
        res = CP.spawnSync modPath, ['root'], options
        if res.error? or not res.stdout?
          warn "Encountered error #{res.error} while getting project root dir"
          Util.getRootDir buffer
        else
          [path] = res.stdout.split(EOL)
          unless path and Util.isDirectory(path)
            warn "ghc-mod returned non-directory while getting project root dir"
            Util.getRootDir buffer
          else
            new Directory path
      else
        Util.getRootDir buffer
    @bufferDirMap.set buffer, dir
    dir

  run: ({interactive, dir, options, command, text, uri, dashArgs, args}) =>
    args ?= []
    dashArgs ?= []
    if @caps.optparse
      args = dashArgs.concat(['--']).concat(args)
    else
      args = dashArgs.concat(args)
    fun = if interactive then @runModiCmd else @runModCmd
    P =
      if text? and not @caps.fileMap
        withTempFile text, uri, (tempuri) ->
          fun {dir, options, command, uri: tempuri, args}
      else
        fun {dir, options, command, text, uri, args}
    P.catch (err) =>
      debug "#{err}"
      atom.notifications.addFatalError "
        Haskell-ghc-mod: ghc-mod
        #{if interactive? then 'interactive ' else ''}command #{command}
        failed with error #{err.name}",
        detail: """
          caps: #{JSON.stringify(@caps)}
          URI: #{uri}
          Args: #{args}
          message: #{err.message}
          log:
          #{Util.getDebugLog()}
          """
        stack: err.stack
        dismissable: true
      return []

  spawnProcess: (rootDir, options) =>
    return unless @processMap?
    return unless atom.config.get('haskell-ghc-mod.enableGhcModi')
    proc = @processMap.get(rootDir.getPath())
    debug "Checking for ghc-modi in #{rootDir.getPath()}"
    if proc?
      debug "Found running ghc-modi instance for #{rootDir.getPath()}"
      return proc
    debug "Spawning new ghc-modi instance for #{rootDir.getPath()} with
          #{"options.#{k} = #{v}" for k, v of options}"
    proc =
      if @caps.legacyInteractive
        modPath = atom.config.get('haskell-ghc-mod.ghcModPath')
        new InteractiveProcess(modPath, ['legacy-interactive'], options, @caps)
      else
        modiPath = atom.config.get('haskell-ghc-mod.ghcModiPath')
        new InteractiveProcess(modiPath, [], options, @caps)
    proc.onExit (code) =>
      debug "ghc-modi for #{rootDir.getPath()} ended with #{code}"
      @processMap?.delete(rootDir.getPath())
    @processMap.set rootDir.getPath(), proc
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
          data.split(EOL).slice(0, -1).forEach (line) ->
            warn "ghc-mod said: #{line}"
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
        warn "Using fallback child_process because of #{error.message}"
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
    uri = dir.relativize(uri) if uri? and dir? and not @caps.quoteArgs
    proc.do (interact) ->
      Promise.resolve()
      .then ->
        if text?
          interact "map-file", [uri], text
      .then ->
        interact command,
          if uri?
            [uri].concat(args)
          else
            args
      .then (res) ->
        if text?
          interact "unmap-file", [uri]
          .then -> res
        else
          res
      .catch (err) ->
        try interact "unmap-file", [uri]
        throw err

  killProcess: =>
    return unless @processMap?
    debug "Killing all ghc-modi processes"
    @processMap.forEach (proc) ->
      proc.kill()

  killProcessForDir: (dir) =>
    return unless @processMap?
    debug "Killing ghc-modi process for #{dir.getPath()}"
    @processMap.get(dir.getPath())?.kill?()
    @processMap.delete(dir.getPath())

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
