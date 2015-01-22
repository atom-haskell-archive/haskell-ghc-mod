{Range,CompositeDisposable} = require('atom')
{HaskellGhcModMessage} = require('./haskell-ghc-mod-message')

module.exports =
class EditorController
  constructor: (@process,@editor) ->
    @errorMarkers = []
    @errorTooltips = new CompositeDisposable
    @subscriptions = new CompositeDisposable

    @subscriptions.add @editor.onDidSave =>
      @doCheck()

    @removeMessageOnChange=@editor.onDidChangeCursorPosition =>
      @messageDecoration?.destroy()
      @messageDecoration=null
      @messageItem=null

    @subscriptions.add @removeMessageOnChange

    @doCheck()


  clearError: ->
    @errorMarkers.forEach (marker) ->
      marker.destroy()
    @errorMarkers = []
    @errorTooltips.dispose()
    @errorTooltips = new CompositeDisposable

  destroy: ->
    @clearError()
    @subscriptions.dispose()
    @messageDecoration.destroy()

  showMessage: (cursor, message) ->
    message="undefined" if message==""
    if @messageDecoration then (
      @messageItem.setMessage(message)
    ) else (
      @messageItem=new HaskellGhcModMessage message
      marker=cursor.getMarker()
      @messageDecoration = @editor.decorateMarker marker,
        type: 'overlay'
        item: @messageItem
    )

  showError: (row, column, message) =>
    range=[[row,column],[row,column+1]]
    @errorMarkers.push marker = @editor.markBufferRange(range)
    @editor.decorateMarker marker,
      type: 'gutter'
      class: 'haskell-ghc-mod-error'
    @editor.decorateMarker marker,
      type: 'highlight'
      class: 'haskell-ghc-mod-error'
    setTimeout (=>
      vi = atom.views.getView(@editor)
      line=vi.rootElement.querySelector(
        '.gutter .haskell-ghc-mod-error.line-number-'+row)
      atom.tooltips.add line,
        template: '<div class="tooltip" role="tooltip">'+
          '<div class="tooltip-arrow"></div>'+
          '<pre class="tooltip-inner"></pre></div>'
        title: message
        placement: 'right'
      ), 100
    @errorTooltips.add @editor.onDidChangeCursorPosition (event) =>
      return unless event.newBufferPosition.isEqual([row,column])
      @showMessage event.cursor,message

  getType: ->
    range = @editor.getSelectedBufferRange()
    cursor = @editor.getCursor()
    cpos = cursor.getBufferPosition()
    @process.getType @getPath(), range, (data) =>
      @showMessage cursor, data

  getInfo: ->
    range = @getRange()
    cursor = @editor.getCursor()
    unless range.isEmpty() then (
      symbol = @editor.getSelectedText()
    ) else (
      symbol = @editor.getTextInBufferRange cursor.getCurrentWordBufferRange()
    )
    @process.getInfo @getPath(), symbol, (data) => @showMessage cursor, data

  doCheck: ->
    @clearError()
    @process.doCheck @getPath(), @showError

  getPath: ->
    @editor.getBuffer().getPath()

  getRange: ->
    @editor.getSelectedBufferRange()
