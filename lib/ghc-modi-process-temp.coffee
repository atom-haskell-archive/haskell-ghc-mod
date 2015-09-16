{BufferedProcess, Emitter, CompositeDisposable} = require('atom')
GhcModiProcessBase = require './ghc-modi-process-base'
{withTempFile} = require './util'
{extname} = require('path')
Util = require './util'

module.exports =
class GhcModiProcessTemp extends GhcModiProcessBase

  run: ({interactive, dir, options, command, text, uri, args, callback}) =>
    args ?= []
    suffix = extname uri or ".hs"
    unless interactive
      if text?
        withTempFile text, @runModCmd, suffix,
          {options, command, uri, args, callback}
      else
        @runModCmd {options, command, uri, args, callback}
    else
      if text?
        withTempFile text, @runModiCmd, suffix,
          {dir, options, command, uri, args, callback}
      else
        @runModiCmd {dir, options, command, uri, args, callback}

  getRootDir: (buffer) ->
    Util.getRootDir buffer
