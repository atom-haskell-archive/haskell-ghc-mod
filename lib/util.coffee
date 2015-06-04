module.exports = Util =
  debug: (message) ->
    if atom.config.get('haskell-ghc-mod.debug')
      console.log "haskell-ghc-mod debug: #{message}"
