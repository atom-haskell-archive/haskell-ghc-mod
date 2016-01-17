{Range, Point, Directory} = require 'atom'
{delimiter, sep, extname} = require 'path'
Temp = require('temp')
FS = require('fs')
CP = require('child_process')
{EOL} = require('os')
HsUtil = require 'atom-haskell-utils'
objclone = require 'clone'

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

  getProcessOptions: (rootPath) =>
    rootPath ?= Util.getRootDirFallback().getPath()
    @processOptionsCache ?= new Map()
    if @processOptionsCache.has(rootPath)
      return @processOptionsCache.get(rootPath)
    joinPath = (ds) ->
      set = new Set(ds)
      res = []
      set.forEach (d) -> res.push d
      return res.join(delimiter)
    Util.debug "getProcessOptions(#{rootPath})"
    env = {}
    for k, v of process.env
      env[k] = v
    apd = atom.config.get('haskell-ghc-mod.additionalPathDirectories')
          .concat process.env.PATH.split delimiter
    if rootPath
      sbd = false
      if atom.config.get('haskell-ghc-mod.cabalSandbox')
        sbc = Util.parseSandboxConfig("#{rootPath}#{sep}cabal.sandbox.config")
        if sbc?['install-dirs']?['bindir']?
          sandbox = sbc['install-dirs']['bindir']
          if Util.isDirectory(sandbox)
            sbd = true
            apd.unshift sandbox
      if atom.config.get('haskell-ghc-mod.stackSandbox')
        env.PATH = joinPath(apd)
        stackpath =
          try CP.execSync "stack path --bin-path",
            encoding: 'utf-8'
            cwd: rootPath
            env: env
        if stackpath
          apd = stackpath.split(delimiter).concat apd
        if sbd
          apd.unshift sandbox
    env.PATH = joinPath(apd)
    Util.debug "PATH = #{env.PATH}"
    options =
      cwd: rootPath
      env: env
      encoding: 'utf-8'
    @processOptionsCache.set(rootPath, options)
    return objclone(options)

  getSymbolAtPoint: (editor, point) ->
    inScope = (scope, point) ->
      editor
      .scopeDescriptorForBufferPosition(point)
      .getScopesArray()
      .some (v) -> v is scope

    tb = editor.getBuffer()
    line = tb.rangeForRow point.row
    find = (test) ->
      start = end = point
      start_ = start.translate [0, -1]
      while test(start_) and start_.isGreaterThanOrEqual(line.start)
        start = start_
        start_ = start.translate [0, -1]
      while test(end) and end.isLessThan(line.end)
        end = end.translate [0, 1]
      return new Range start, end

    regex = /[\w'.]/
    scopes = [
      'keyword.operator.haskell'
      'entity.name.function.infix.haskell'
    ]
    for scope in scopes
      range = find (p) -> inScope(scope, p)
      if not range.isEmpty()
        symbol = tb.getTextInRange range
        return {scope, range, symbol}

    # else
    range = find ((p) -> tb.getTextInRange([p, p.translate([0, 1])]).match(regex)?)
    symbol = tb.getTextInRange range
    return {range, symbol}

  getSymbolInRange: (editor, crange) ->
    buffer = editor.getBuffer()
    if crange.isEmpty()
      Util.getSymbolAtPoint editor, crange.start
    else
      symbol: buffer.getTextInRange crange
      range: crange


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

  parseSandboxConfig: (file) ->
    sbc = try FS.readFileSync file, encoding: 'utf-8'
    return unless sbc?
    vars = {}

    scope = vars

    rv = (v) ->
      for k1, v1 of scope
        v = v.split("$#{k1}").join(v1)
      return v

    sbc.split(/\r?\n|\r/).forEach (line) ->
      unless line.match(/^\s*--/) or line.match(/^\s*$/)
        [l] = line.split /--/
        if m = line.match /^\s*([\w-]+):\s*(.*)\s*$/
          [_, name, val] = m
          scope[name] = rv(val)
        else
          newscope = {}
          scope[line] = newscope
          scope = newscope


    return vars
