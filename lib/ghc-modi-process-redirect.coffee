{BufferedProcess, Emitter, CompositeDisposable, Directory} = require('atom')
GhcModiProcessBase = require './ghc-modi-process-base'
Util = require './util'
CP = require 'child_process'

module.exports =
class GhcModiProcessRedirect extends GhcModiProcessBase

  run: ({interactive, dir, options, command, text, uri, args, callback}) =>
    args ?= []
    unless interactive
      @runModCmd {options, command, text, uri, args, callback}
    else
      @runModiCmd {dir, options, command, text, uri, args, callback}

  getRootDir: (buffer) ->
    dir = buffer.file?.getParent?() ? Util.getRootDirFallback buffer
    modPath = atom.config.get('haskell-ghc-mod.ghcModPath')
    options = Util.getProcessOptions(dir.getPath())
    options.timeout = 1000
    res = CP.spawnSync modPath, ['root'], options
    if res.error?
      console.warn "Encountered #{res.error} while getting project root dir"
      Util.getRootDir buffer
    else
      dir = new Directory res.stdout.toString().slice(0, -1)
      unless dir?.isDirectory?()
        console.warn "Ghc-mod returned non-directory while getting project root dir"
        Util.getRootDir buffer
      else
        dir
