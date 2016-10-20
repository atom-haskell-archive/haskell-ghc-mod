{Emitter, CompositeDisposable, Directory} = require('atom')
CP = require('child_process')
InteractiveProcess = require './interactive-process'
{debug, warn, mkError, withTempFile, EOT} = Util = require '../util'
{EOL} = require('os')
_ = require 'underscore-plus'

module.exports =
class GhcModiProcessReal
  constructor: (@caps, @rootDir, @options) ->
    @disposables = new CompositeDisposable
    @disposables.add @emitter = new Emitter

  run: ({interactive, command, text, uri, dashArgs, args, suppressErrors, ghcOptions, ghcModOptions}) ->
    args ?= []
    dashArgs ?= []
    suppressErrors ?= false
    ghcOptions ?= []
    ghcModOptions ?= []
    ghcModOptions = ghcModOptions.concat (ghcOptions.map (opt) -> ['--ghc-option', opt])...
    if atom.config.get('haskell-ghc-mod.lowMemorySystem')
      interactive = atom.config.get('haskell-ghc-mod.enableGhcModi')
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
          fun {ghcModOptions, command, uri: tempuri, args}
      else
        fun {ghcModOptions, command, text, uri, args}
    P.catch (err) =>
      debug err
      if err.name is 'InteractiveActionTimeout'
        atom.notifications.addError "
          Haskell-ghc-mod: ghc-mod
          #{if interactive? then 'interactive ' else ''}command #{command}
          timed out. You can try to fix it by raising 'Interactive Action
          Timeout' setting in haskell-ghc-mod settings.",
          detail: """
            caps: #{JSON.stringify(@caps)}
            URI: #{uri}
            Args: #{args}
            message: #{err.message}
            """
          stack: err.stack
          dismissable: true
      else if not suppressErrors
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
      else
        console.error err
      return []

  spawnProcess: (ghcModOptions) ->
    return Promise.resolve(null) unless atom.config.get('haskell-ghc-mod.enableGhcModi')
    debug "Checking for ghc-modi in #{@rootDir.getPath()}"
    if @proc?
      unless _.isEqual(@ghcModOptions, ghcModOptions)
        debug "Found running ghc-modi instance for #{@rootDir.getPath()}, but ghcModOptions don't match. Old: ",
          @ghcModOptions, ' new: ', ghcModOptions
        @proc.kill()
        return new Promise (resolve) =>
          @proc.onExit =>
            resolve @spawnProcess(ghcModOptions)
      debug "Found running ghc-modi instance for #{@rootDir.getPath()}"
      return Promise.resolve(@proc)
    debug "Spawning new ghc-modi instance for #{@rootDir.getPath()} with", @options
    modPath = atom.config.get('haskell-ghc-mod.ghcModPath')
    @ghcModOptions = ghcModOptions
    @proc = new InteractiveProcess(modPath, ghcModOptions.concat(['legacy-interactive']), @options, @caps)
    @proc.disposables.add @proc.onExit (code) =>
      debug "ghc-modi for #{@rootDir.getPath()} ended with #{code}"
      @proc = null
    return Promise.resolve(@proc)

  runModCmd: ({ghcModOptions, command, text, uri, args}) =>
    modPath = atom.config.get('haskell-ghc-mod.ghcModPath')
    result = []
    err = []
    if uri?
      cmd = ghcModOptions.concat([command, uri], args)
    else
      cmd = ghcModOptions.concat([command], args)
    if text?
      cmd = ['--map-file', uri].concat cmd
    stdin = "#{text}#{EOT}" if text?
    Util.execPromise modPath, cmd, @options, stdin
    .then (stdout) ->
      stdout.split(EOL).slice(0, -1).map (line) -> line.replace /\0/g, '\n'

  runModiCmd: (o) =>
    {ghcModOptions, command, text, uri, args} = o
    debug "Trying to run ghc-modi in #{@rootDir.getPath()}"
    @spawnProcess(ghcModOptions)
    .then (proc) =>
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

  killProcess: ->
    return unless @proc?
    debug "Killing ghc-modi process for #{@rootDir.getPath()}"
    @proc.kill()
    @proc = null

  destroy: ->
    return unless @emitter?
    debug "GhcModiProcessBase destroying"
    @killProcess()
    @emitter.emit 'did-destroy'
    @emitter = null
    @disposables.dispose()

  onDidDestroy: (callback) ->
    return unless @emitter?
    @emitter.on 'did-destroy', callback
