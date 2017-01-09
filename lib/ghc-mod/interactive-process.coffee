{Emitter, CompositeDisposable} = require('atom')
CP = require('child_process')
{debug, warn, mkError, EOT} = require '../util'
{EOL} = require('os')

module.exports =
class InteractiveProcess
  constructor: (path, cmd, options, @caps) ->
    @disposables = new CompositeDisposable
    @disposables.add @emitter = new Emitter
    @interactiveAction = Promise.resolve()
    @cwd = options.cwd

    debug "Spawning new ghc-modi instance for #{options.cwd} with
          options = ", options
    @proc = CP.spawn(path, cmd, options)
    @proc.stdout.setEncoding 'utf-8'
    @proc.stderr.setEncoding 'utf-8'
    lastLine = ""
    @proc.stderr.on 'data', (data) ->
      [first, rest..., last] = data.split(EOL)
      if last?
        warn "ghc-modi said: #{lastLine + first}"
        lastLine = last
      else
        lastLine = lastLine + first
      rest.forEach (line) ->
        warn "ghc-modi said: #{line}"
    @resetTimer()
    @proc.on 'exit', (code) =>
      clearTimeout @timer
      debug "ghc-modi for #{options.cwd} ended with #{code}"
      @emitter.emit 'did-exit', code
      @disposables.dispose()

  onExit: (action) ->
    @emitter.on 'did-exit', action

  resetTimer: ->
    if @timer?
      clearTimeout @timer
    if tml = atom.config.get('haskell-ghc-mod.interactiveInactivityTimeout')
      @timer = setTimeout (=> @kill()), tml * 60 * 1000

  kill: ->
    if @timer?
      clearTimeout @timer
    @proc.stdin?.end?()
    @proc.kill?()

  do: (action) ->
    @resetTimer()
    interact = (command, args, data) =>
      resultP =
        new Promise (resolve, reject) =>
          savedLines = []
          chunks = []
          exitCallback = null
          parseData = null
          timer = null
          cleanup = =>
            @proc.stdout.removeListener 'data', parseData
            @proc.removeListener 'exit', exitCallback
            clearTimeout timer if timer?
          parseData = (data) ->
            debug "Got response from ghc-modi:#{EOL}#{data}"
            chunks.push data
            savedLines = chunks.join('').split(EOL)
            result = savedLines[savedLines.length - 2]
            if result is 'OK'
              cleanup()
              lines = savedLines.slice(0, -2)
              resolve lines.map (line) ->
                line.replace /\0/g, '\n'
          exitCallback = ->
            cleanup()
            console.error "#{savedLines}"
            reject mkError "ghc-modi crashed", "#{savedLines}"
          @proc.stdout.on 'data', parseData
          @proc.on 'exit', exitCallback
          if tml = atom.config.get('haskell-ghc-mod.interactiveActionTimeout')
            timer = setTimeout (=>
              cleanup()
              console.error "#{savedLines}"
              @kill()
              reject mkError "InteractiveActionTimeout", "#{savedLines}"
              ), tml * 1000
      args_ =
        if @caps.quoteArgs
          ['ascii-escape', command].concat args.map (x) -> "\x02#{x}\x03"
        else
          [command, args...]
      debug "Running ghc-modi command #{command}", args...
      @proc.stdin.write "#{args_.join(' ').replace(/(?:\r?\n|\r)/g, ' ')}#{EOL}"
      if data?
        debug "Writing data to stdin..."
        @proc.stdin.write "#{data}#{EOT}"
      return resultP
    @interactiveAction = @interactiveAction.then =>
      debug "Started interactive action block in #{@cwd}"
      action(interact).then (res) =>
        debug "Ended interactive action block in #{@cwd}"
        return res
