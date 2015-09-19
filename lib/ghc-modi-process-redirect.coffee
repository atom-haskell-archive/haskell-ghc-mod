{BufferedProcess, Emitter, CompositeDisposable, Directory} = require('atom')
GhcModiProcessBase = require './ghc-modi-process-base'
Util = require './util'
CP = require 'child_process'

module.exports =
class GhcModiProcessRedirect extends GhcModiProcessBase
  constructor: ->
    super
    @bufferDirMap = new WeakMap #TextBuffer -> Directory

  run: ({interactive, dir, options, command, text, uri, args, callback}) =>
    args ?= []
    unless interactive
      @runModCmd {options, command, text, uri, args, callback}
    else
      @runModiCmd {dir, options, command, text, uri, args, callback}

  getRootDir: (buffer) ->
    dir = @bufferDirMap.get buffer
    if dir?
      return dir
    dir = buffer.file?.getParent?() ? Util.getRootDirFallback buffer
    modPath = atom.config.get('haskell-ghc-mod.ghcModPath')
    options = Util.getProcessOptions(dir.getPath())
    options.timeout = atom.config.get('haskell-ghc-mod.syncTimeout')
    res = CP.spawnSync modPath, ['root'], options
    dir = if res.error?
      console.warn "Encountered #{res.error} while getting project root dir"
      Util.getRootDir buffer
    else
      d = new Directory res.stdout.toString().slice(0, -1)
      unless d?.isDirectory?()
        console.warn "Ghc-mod returned non-directory while getting project root dir"
        Util.getRootDir buffer
      else
        d
    @bufferDirMap.set buffer, dir
    dir
