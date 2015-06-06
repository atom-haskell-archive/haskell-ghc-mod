{Range, Point, Directory} = require 'atom'
{delimiter} = require 'path'

module.exports = Util =
  debug: (message) ->
    if atom.config.get('haskell-ghc-mod.debug')
      console.log "haskell-ghc-mod debug: #{message}"

  getRootDir: (buffer) ->
    [dir]=atom.project.getDirectories().filter (dir) ->
      dir.contains(buffer.getUri())
    dir ? atom.project.getDirectories()[0] ? new Directory

  getProcessOptions: (rootPath) ->
    env = {}
    for k,v of process.env
      env[k] = v
    apd = atom.config.get('haskell-ghc-mod.additionalPathDirectories')
          .concat process.env.PATH.split delimiter
    if rootPath
      apd.unshift "#{rootPath}/.cabal-sandbox/bin"
    env.PATH = "#{apd.join(delimiter)}"
    Util.debug "PATH = #{env.PATH}"
    options =
      cwd: rootPath
      env: env

  getSymbolInRange: (regex, buffer, crange) ->
    if crange.isEmpty()
      {start,end}=buffer.rangeForRow crange.start.row
      crange2=new Range(crange.start,crange.end)
      buffer.backwardsScanInRange regex,new Range(start,crange.start),
        ({range,stop}) ->
          crange2.start=range.start
      buffer.scanInRange regex,new Range(crange.end,end),
        ({range,stop}) ->
          crange2.end=range.end
    else
      crange2=crange

    symbol: buffer.getTextInRange crange2
    range: crange2

  toRange: (pointOrRange) ->
    if pointOrRange instanceof Point
      new Range pointOrRange, pointOrRange
    else if pointOrRange instanceof Range
      pointOrRange
    else
      throw new Error("Unknown point or range class #{pointOrRange}")
