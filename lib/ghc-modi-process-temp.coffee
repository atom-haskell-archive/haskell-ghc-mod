{BufferedProcess, Emitter, CompositeDisposable} = require('atom')
GhcModiProcessBase = require './ghc-modi-process-base'
{withTempFile} = require './util'
Util = require './util'

module.exports =
class GhcModiProcessTemp extends GhcModiProcessBase
  constructor: ->
    super
    @bufferDirMap = new WeakMap #TextBuffer -> Directory

  run: (opts) =>
    {text, uri} = opts
    if text?
      withTempFile text, uri, (tempuri) =>
        opts.uri = tempuri
        opts.text = null
        super opts
    else
      super opts

  getRootDir: (buffer) ->
    dir = @bufferDirMap.get buffer
    if dir?
      return dir
    dir = Util.getRootDir buffer
    @bufferDirMap.set buffer, dir
    dir
