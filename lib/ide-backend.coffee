module.exports=
class IdeBackend
  process: null

  constructor: (@process,opts) ->
    @version = opts?.version
    @process?.onDidDestroy =>
      @process = null

  isActive: =>
    unless @process?
      atom.notifications.addWarning "Haskell IDE Backend #{@name()} is inactive"
    @process?

  ### Public interface below ###

  ###
  name()
  Get backend name

  Returns String, unique string describing a given backend
  ###
  name: () -> "haskell-ghc-mod"

  ###
  onDidDestroy(callback)
  Destruction event subscription. Usually should be called only on
  package deactivation.
  callback: () ->
  ###
  onDidDestroy: (callback) =>
    @process.onDidDestroy callback if @isActive

  ###
  getType (buffer, range, callback)
  Get type of expression in range
  buffer: TextBuffer with source
  range: Range or Point, signifying extent of expression
  callback: ({range, type}) ->
    range: Range, actual extent of expression
    type: String, type signature; undefined if no type signature
  ###
  getType: (buffer, range, callback) =>
    switch @version
      when '0.1.0'
        if @isActive()
          @process.getTypeInBuffer buffer,range, (o) ->
            o.type ?= '???'
            callback o
      else @process.getTypeInBuffer buffer,range,callback if @isActive()

  ###
  getInfo(buffer, range, callback)
  Get information on expression in range
  buffer: TextBuffer with source
  range: Range or Point, signifying extent of expression
  callback: ({range,info}) ->
    range: Range, actual extent of expression
    info: String, information; undefined if no information
  ###
  getInfo: (buffer, range, callback) =>
    switch @version
      when '0.1.0'
        if @isActive()
          @process.getInfoInBuffer buffer,range, (o) ->
            o.info ?= 'Cannot show info'
            callback o
      else @process.getInfoInBuffer buffer,range,callback if @isActive()

  ###
  checkBuffer(buffer, callback)
  Run check on buffer
  buffer: TextBuffer with source
  callback: ([{uri, position, message, severity}]) ->
    uri: String, File URI message relates to
         (not necessarily same as buffer.getURI())
    position: Point, position to which message relates
    message: String, message
    severity: String, one of ['error','warning']
  ###
  checkBuffer: (buffer, callback) =>
    @process.doCheckBuffer buffer,callback if @isActive()

  ###
  lintBuffer(buffer, callback)
  Run lint on buffer
  buffer: TextBuffer with source
  callback: ([{uri, position, message, severity}]) ->
    uri: String, File URI message relates to
         (not necessarily same as buffer.getURI())
    position: Point, position to which message relates
    message: String, message
    severity: String, always 'lint'
  ###
  lintBuffer: (buffer, callback) =>
    @process.doLintBuffer buffer, callback if @isActive()

  ###
  onBackendActive(callback)
  Subscription to backend-active message. Will be called on every new task
  backend runs.
  callback: ({queue, cmd}) ->
    queue: String, active task queue name (category)
    cmd: String, command identifier (freeform)

  Returns Disposable
  ###
  onBackendActive: (callback) =>
    @process.onBackendActive callback if @isActive()

  ###
  onQueueIdle(callback)
  Subscription to queue-idle message. Will be called whenever any queue is
  emtpy
  callback: ({queue})
    queue: String, idle queue name (category)

  Returns Disposable
  ###
  onQueueIdle: (callback) =>
    @process.onQueueIdle callback if @isActive()

  ###
  onBackendIdle(callback)
  Subscription to backend-idle message. Will be called whenever all queues are
  empty.
  callback: () ->

  Returns disposable
  ###
  onBackendIdle: (callback) =>
    @process.onBackendIdle callback if @isActive()

  ###
  shutdownBackend()
  Cleans up and shutdowns all external background processes, related to
  IdeBackend.
  Ought to be possible to restart those on-demand.
  ###
  shutdownBackend: =>
    @process.killProcess() if @isActive()
