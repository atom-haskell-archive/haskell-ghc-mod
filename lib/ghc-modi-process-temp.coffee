{BufferedProcess, Emitter, CompositeDisposable} = require('atom')
GhcModiProcessBase = require './ghc-modi-process-base'
{withTempFile} = require './util'
Util = require './util'

module.exports =
class GhcModiProcessTemp extends GhcModiProcessBase
  constructor: ->
    super
    @bufferDirMap = new WeakMap #TextBuffer -> Directory

  run: ({interactive, dir, options, command, text, uri, args}) =>
    args ?= []
    unless interactive
      if text?
        withTempFile text, uri, (tempuri) =>
          @runModCmd {options, command, uri: tempuri, args}
      else
        @runModCmd {options, command, uri, args}
    else
      if text?
        withTempFile text, uri, (tempuri) =>
          @runModiCmd {dir, options, command, uri: tempuri, args}
      else
        @runModiCmd {dir, options, command, uri, args}

  getRootDir: (buffer) ->
    dir = @bufferDirMap.get buffer
    if dir?
      return dir
    dir = Util.getRootDir buffer
    @bufferDirMap.set buffer, dir
    dir
