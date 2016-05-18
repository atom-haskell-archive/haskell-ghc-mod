{Emitter, CompositeDisposable, Directory} = require('atom')
CP = require('child_process')
InteractiveProcess = require './interactive-process'
{debug, warn, mkError, withTempFile, EOT} = Util = require '../util'
{EOL} = require('os')

module.exports =
class GhcModiProcessReal
  constructor: (@caps, @rootDir) ->
    @disposables = new CompositeDisposable
    @disposables.add @emitter = new Emitter

  run: ({interactive, options, command, text, uri, dashArgs, args}) =>
    args ?= []
    dashArgs ?= []
    if typeof(dashArgs) is 'function'
      dashArgs = dashArgs(@caps)
    if @caps.optparse
      args = dashArgs.concat(['--']).concat(args)
    else
      args = dashArgs.concat(args)
    fun = if interactive then @runModiCmd else @runModCmd
    P =
      if text? and not @caps.fileMap
        withTempFile text, uri, (tempuri) ->
          fun {options, command, uri: tempuri, args}
      else
        fun {options, command, text, uri, args}
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

  spawnProcess: (options) =>
    return unless atom.config.get('haskell-ghc-mod.enableGhcModi')
    debug "Checking for ghc-modi in #{@rootDir.getPath()}"
    if @proc?
      debug "Found running ghc-modi instance for #{@rootDir.getPath()}"
      return @proc
    debug "Spawning new ghc-modi instance for #{@rootDir.getPath()} with", options
    modPath = atom.config.get('haskell-ghc-mod.ghcModPath')
    @proc = new InteractiveProcess(modPath, ['legacy-interactive'], options, @caps)
    @proc.onExit (code) =>
      debug "ghc-modi for #{@rootDir.getPath()} ended with #{code}"
      @proc = null
    return @proc

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
    stdin = "#{text}#{EOT}" if text?
    Util.execPromise modPath, cmd, options, stdin
    .then (stdout) ->
      stdout.split(EOL).slice(0, -1).map (line) -> line.replace /\0/g, '\n'

  runModiCmd: (o) =>
    {options, command, text, uri, args} = o
    debug "Trying to run ghc-modi in #{@rootDir.getPath()}"
    proc = @spawnProcess(options)
    unless proc
      debug "Failed. Falling back to ghc-mod"
      return @runModCmd o
    uri = @rootDir.relativize(uri) if uri? and not @caps.quoteArgs
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
    return unless @proc?
    debug "Killing ghc-modi process for #{@rootDir.getPath()}"
    @proc.kill()
    @proc = null

  destroy: =>
    return unless @emitter?
    debug "GhcModiProcessBase destroying"
    @killProcess()
    @emitter.emit 'did-destroy'
    @emitter = null
    @disposables.dispose()

  onDidDestroy: (callback) =>
    return unless @emitter?
    @emitter.on 'did-destroy', callback
