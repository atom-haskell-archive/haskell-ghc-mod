{BufferedProcess, Emitter, CompositeDisposable, Directory} = require('atom')
GhcModiProcessBase = require './ghc-modi-process-base'
Util = require './util'
CP = require 'child_process'
{EOL} = require('os')

module.exports =
class GhcModiProcessRedirect extends GhcModiProcessBase
  constructor: ->
    super
    @bufferDirMap = new WeakMap #TextBuffer -> Directory

  run: ({interactive, dir, options, command, text, uri, args}) =>
    args ?= []
    unless interactive
      @runModCmd {options, command, text, uri, args}
    else
      @runModiCmd {dir, options, command, text, uri, args, legacyInteractive: true}

  getRootDir: (buffer) ->
    dir = @bufferDirMap.get buffer
    if dir?
      return dir
    dir = buffer.file?.getParent?() ? Util.getRootDirFallback buffer
    modPath = atom.config.get('haskell-ghc-mod.ghcModPath')
    options = Util.getProcessOptions(dir.getPath())
    options.timeout = atom.config.get('haskell-ghc-mod.syncTimeout')
    res = CP.spawnSync modPath, ['root'], options
    [path] = res.stdout.toString().split(EOL)
    dir = if res.error? or not path
      console.warn "Encountered error #{res.error} while getting project root dir"
      Util.getRootDir buffer
    else
      d = new Directory path
      unless d?.isDirectory?()
        console.warn "ghc-mod returned non-directory while getting project root dir"
        Util.getRootDir buffer
      else
        d
    @bufferDirMap.set buffer, dir
    dir
