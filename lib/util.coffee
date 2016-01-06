{Range, Point, Directory} = require 'atom'
{delimiter, sep, extname} = require 'path'
Temp = require('temp')
FS = require('fs')
{EOL} = require('os')
HsUtil = require 'atom-haskell-utils'

debuglog = []
logKeep = 30000 #ms

savelog = (messages...) ->
  ts = Date.now()
  debuglog.push
    timestamp: ts
    messages: messages
  debuglog = debuglog.filter ({timestamp}) -> (ts - timestamp) < logKeep

module.exports = Util =
  EOT: "#{EOL}\x04#{EOL}"

  debug: (messages...) ->
    if atom.config.get('haskell-ghc-mod.debug')
      console.log "haskell-ghc-mod debug:", messages...
    savelog messages...

  warn: (messages...) ->
    console.warn "haskell-ghc-mod warning:", messages...
    savelog messages...

  getDebugLog: ->
    ts = Date.now()
    debuglog = debuglog.filter ({timestamp}) -> (ts - timestamp) < logKeep
    debuglog.map ({timestamp, messages}) ->
      "#{(timestamp - ts) / 1000}s: #{messages.join ','}"
    .join EOL

  getRootDirFallback: HsUtil.getRootDirFallback

  getRootDir: HsUtil.getRootDir

  isDirectory: HsUtil.isDirectory

  getProcessOptions: (rootPath) ->
    Util.debug "getProcessOptions(#{rootPath})"
    env = {}
    for k, v of process.env
      env[k] = v
    apd = atom.config.get('haskell-ghc-mod.additionalPathDirectories')
          .concat process.env.PATH.split delimiter
    if rootPath
      sandbox = "#{rootPath}#{sep}.cabal-sandbox#{sep}bin"
      try if FS.statSync(sandbox).isDirectory()
        apd.unshift sandbox
    env.PATH = "#{apd.join(delimiter)}"
    Util.debug "PATH = #{env.PATH}"
    options =
      cwd: rootPath
      env: env
      encoding: 'utf-8'

  getSymbolInRange: (regex, buffer, crange) ->
    if crange.isEmpty()
      {start, end} = buffer.rangeForRow crange.start.row
      crange2 = new Range(crange.start, crange.end)
      buffer.backwardsScanInRange regex, new Range(start, crange.start),
        ({range, stop}) ->
          crange2.start = range.start
      buffer.scanInRange regex, new Range(crange.end, end),
        ({range, stop}) ->
          crange2.end = range.end
    else
      crange2 = crange

    symbol: buffer.getTextInRange crange2
    range: crange2

  withTempFile: (contents, uri, gen) ->
    new Promise (resolve, reject) ->
      Temp.open {prefix: 'haskell-ghc-mod', suffix: extname uri or ".hs"},
        (err, info) ->
          if err
            reject err
          else
            resolve info
    .then (info) ->
      new Promise (resolve, reject) ->
        FS.write info.fd, contents, (err) ->
          if err
            reject err
          else
            gen(info.path).then (res) ->
              FS.close info.fd, -> FS.unlink info.path
              resolve res.map (line) ->
                line.split(info.path).join(uri)

  mkError: (name, message) ->
    err = new Error message
    err.name = name
    return err
