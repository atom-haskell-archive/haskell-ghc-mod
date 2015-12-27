{BufferedProcess, Emitter, CompositeDisposable, Directory} = require('atom')
GhcModiProcessBase = require './ghc-modi-process-base'
Util = require './util'
CP = require 'child_process'
{EOL} = require('os')

module.exports =
class GhcModiProcessRedirect extends GhcModiProcessBase
  legacyInteractive: true

  constructor: ->
    super
    @bufferDirMap = new WeakMap #TextBuffer -> Directory

  getRootDir: (buffer) ->
    dir = @bufferDirMap.get buffer
    if dir?
      return dir
    dir = buffer.file?.getParent?() ? Util.getRootDirFallback buffer
    modPath = atom.config.get('haskell-ghc-mod.ghcModPath')
    options = Util.getProcessOptions(dir.getPath())
    options.timeout = atom.config.get('haskell-ghc-mod.syncTimeout')
    res = CP.spawnSync modPath, ['root'], options
    dir = if res.error? or not res.stdout?
      console.warn "Encountered error #{res.error} while getting project root dir"
      Util.getRootDir buffer
    else
      [path] = res.stdout.split(EOL)
      d = new Directory path
      unless d?.isDirectory?()
        console.warn "ghc-mod returned non-directory while getting project root dir"
        Util.getRootDir buffer
      else
        d
    @bufferDirMap.set buffer, dir
    dir
