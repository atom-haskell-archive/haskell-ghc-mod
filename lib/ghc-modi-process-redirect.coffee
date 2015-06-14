{BufferedProcess,Emitter,CompositeDisposable} = require('atom')
GhcModiProcessBase = require './ghc-modi-process-base'

module.exports =
class GhcModiProcessRedirect extends GhcModiProcessBase

  run: ({interactive, dir, options, command, text, uri, args, callback}) =>
    args ?= []
    unless interactive
      @runModCmd {options, command, text, uri, args, callback}
    else
      @runModiCmd {dir, options, command, text, uri, args, callback}
