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
  return

joinPath = (ds) ->
  set = new Set(ds)
  res = []
  set.forEach (d) -> res.push d
  return res.join(delimiter)

module.exports = Util =
  EOT: "#{EOL}\x04#{EOL}"

  debug: (messages...) ->
    if atom.config.get('haskell-ghc-mod.debug')
      console.log "haskell-ghc-mod debug:", messages...
    savelog messages.map(JSON.stringify)...

  warn: (messages...) ->
    console.warn "haskell-ghc-mod warning:", messages...
    savelog messages.map(JSON.stringify)...

  getDebugLog: ->
    ts = Date.now()
    debuglog = debuglog.filter ({timestamp}) -> (ts - timestamp) < logKeep
    debuglog.map ({timestamp, messages}) ->
      "#{(timestamp - ts) / 1000}s: #{messages.join ','}"
    .join EOL

  getRootDirFallback: HsUtil.getRootDirFallback

  getRootDir: HsUtil.getRootDir

  isDirectory: HsUtil.isDirectory

  execPromise: (cmd, args, opts, stdin) ->
    new Promise (resolve, reject) ->
      Util.debug "Running #{cmd} #{args} with opts = ", opts
      child = CP.execFile cmd, args, opts, (error, stdout, stderr) ->
        Util.warn stderr if stderr
        if error?
          Util.warn("Running #{cmd} #{args} failed with ", error)
          Util.warn stdout if stdout
          error.stack = (new Error).stack
          reject error
        else
          Util.debug "Got response from #{cmd} #{args}", stdout: stdout, stderr: stderr
          resolve stdout
      if stdin?
        Util.debug "sending stdin text to #{cmd} #{args}"
        child.stdin.write stdin

  getCabalSandbox: (rootPath) ->
    Util.debug("Looking for cabal sandbox...")
    Util.parseSandboxConfig("#{rootPath}#{sep}cabal.sandbox.config")
    .then (sbc) ->
      if sbc?['install-dirs']?['bindir']?
        sandbox = sbc['install-dirs']['bindir']
        Util.debug("Found cabal sandbox: ", sandbox)
        if Util.isDirectory(sandbox)
          sandbox
        else
          Util.warn("Cabal sandbox ", sandbox, " is not a directory")
      else
        Util.warn("No cabal sandbox found")

  getStackSandbox: (rootPath, apd, env) ->
    Util.debug("Looking for stack sandbox...")
    env.PATH = joinPath(apd)
    Util.debug("Running stack with PATH ", env.PATH)
    Util.execPromise 'stack', ['path', '--snapshot-install-root', '--local-install-root', '--bin-path'],
      encoding: 'utf-8'
      stdio: 'pipe'
      cwd: rootPath
      env: env
      timeout: atom.config.get('haskell-ghc-mod.initTimeout') * 1000
    .then (out) ->
      lines = out.split(EOL)
      sir = lines.filter((l) -> l.startsWith('snapshot-install-root: '))[0].slice(23) + "#{sep}bin"
      lir = lines.filter((l) -> l.startsWith('local-install-root: '))[0].slice(20) + "#{sep}bin"
      bp =
         lines.filter((l) -> l.startsWith('bin-path: '))[0].slice(10).split(delimiter).filter (p) ->
           not ((p is sir) or (p is lir) or (p in apd))
      Util.debug("Found stack sandbox ", lir, sir, bp...)
      return [lir, sir, bp...]
    .catch (err) ->
      Util.warn("No stack sandbox found because ", err)

  getProcessOptions: (rootPath) =>
    rootPath ?= Util.getRootDirFallback().getPath()
    #cache
    @processOptionsCache ?= new Map()
    if @processOptionsCache.has(rootPath)
      return @processOptionsCache.get(rootPath)

    Util.debug "getProcessOptions(#{rootPath})"
    env = objclone(process.env)

    if process.platform is 'win32'
      PATH = []
      capMask = (str, mask) ->
        a = str.split ''
        for c, i in a
          if mask & Math.pow(2, i)
            a[i] = a[i].toUpperCase()
        return a.join ''
      for m in [0b1111..0]
        vn = capMask("path", m)
        if env[vn]?
          PATH.push env[vn]
      env.PATH = PATH.join delimiter

    env.PATH ?= ""

    apd = atom.config.get('haskell-ghc-mod.additionalPathDirectories')
          .concat env.PATH.split delimiter
    sbd = false
    cabalSandbox =
      if atom.config.get('haskell-ghc-mod.cabalSandbox')
        Util.getCabalSandbox(rootPath)
      else
        Promise.resolve() # undefined
    stackSandbox =
      if atom.config.get('haskell-ghc-mod.stackSandbox')
        Util.getStackSandbox(rootPath, apd, objclone(env))
      else
        Promise.resolve() # undefined
    res =
      Promise.all([cabalSandbox, stackSandbox])
      .then ([cabalSandboxDir, stackSandboxDirs]) ->
        newp = []
        if cabalSandboxDir?
          newp.push cabalSandboxDir
        if stackSandboxDirs?
          newp.push stackSandboxDirs...
        newp.push apd...
        env.PATH = joinPath(newp)
        Util.debug "PATH = #{env.PATH}"
        return {
          cwd: rootPath
          env: env
          encoding: 'utf-8'
          maxBuffer: Infinity
        }
    @processOptionsCache.set(rootPath, res)
    return res

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
    new Promise (resolve, reject) ->
      FS.readFile file, encoding: 'utf-8', (err, sbc) ->
        if err?
          reject err
        else
          resolve sbc
    .then (sbc) ->
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
    .catch (err) ->
      Util.warn "Reading cabal sandbox config failed with ", err

  # A dirty hack to work with tabs
  tabShiftForPoint: (buffer, point) ->
    columnShift = 7 * (buffer.lineForRow(point.row).slice(0, point.column).match(/\t/g)?.length or 0)
    new Point(point.row, point.column + columnShift)

  tabShiftForRange: (buffer, range) ->
    start = Util.tabShiftForPoint(buffer, range.start)
    end = Util.tabShiftForPoint(buffer, range.end)
    new Range(start, end)

  tabUnshiftForPoint: (buffer, point) ->
    line = buffer.lineForRow(point.row)
    columnl = 0
    columnr = point.column
    while(columnl < columnr)
      break unless line? and line[columnl]?
      if line[columnl] is '\t'
        columnr -= 7
      columnl += 1
    new Point(point.row, columnr)

  tabUnshiftForRange: (buffer, range) ->
    start = Util.tabUnshiftForPoint(buffer, range.start)
    end = Util.tabUnshiftForPoint(buffer, range.end)
    new Range(start, end)
