{Range,CompositeDisposable} = require('atom')
{HaskellGhcModMessage} = require('./haskell-ghc-mod-message')

module.exports =
class EditorController
  constructor: (@process,@editor) ->
    @errorMarkers = []
    @errorTooltips = new CompositeDisposable
    @subscriptions = new CompositeDisposable

    @subscriptions.add @editor.onDidSave =>
      @doCheck() if atom.config.get('haskell-ghc-mod.checkOnSave')

    @subscriptions.add @editor.onDidStopChanging =>
      @doCheck() if atom.config.get('haskell-ghc-mod.checkOnEdit')

    @removeMessageOnChange=@editor.onDidChangeCursorPosition =>
      @messageMarker?.destroy()
      @messageMarker=null

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
    @messageMarker?.destroy()

  showMessage: (range, message, crange) =>
    if @messageMarker?.getBufferRange()==range
      @messageMarker.item.setMessage(message)
    else
      @messageMarker?.destroy()
      @messageMarker=@editor.markBufferRange(range)
      @messageMarker.item = new HaskellGhcModMessage message
      @messageMarker.tooltip=@editor.markBufferRange(crange) if crange
      @editor.decorateMarker @messageMarker,
        type: 'highlight'
        class: 'haskell-ghc-mod-tooltip'
      tooltipMarker = @messageMarker.tooltip
      tooltipMarker = @messageMarker unless tooltipMarker
      disp=@messageMarker.onDidDestroy =>
        @messageMarker.tooltip?.destroy()
        disp.dispose()
      @editor.decorateMarker tooltipMarker,
        type: 'overlay'
        position: 'tail'
        item: @messageMarker.item

  showError: (row, column, message) =>
    range=[[row,column],[row,column+1]]
    @errorMarkers.push marker = @editor.markBufferRange(range)
    if message.startsWith('Warning:')
      klass = 'haskell-ghc-mod-warning'
    else
      klass = 'haskell-ghc-mod-error'
    @editor.decorateMarker marker,
      type: 'gutter'
      class: klass
    @editor.decorateMarker marker,
      type: 'highlight'
      class: klass
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
      @showMessage range,message

  getTypeCallback: (callback) ->
    @process.getType @getText(), @getRange(), callback

  getType: ->
    @getTypeCallback @showMessage

  insertType: ->
    symbol = @getSymbol()
    @getTypeCallback (range, type, crange) =>
      indent = @editor.indentationForBufferRow(crange.start.row)
      pos=[range.start.row,0]
      @editor.setTextInBufferRange [pos,pos],symbol+" :: "+type+"\n"
      @editor.setIndentationForBufferRow pos[0],indent
      @editor.setIndentationForBufferRow pos[0]+1,indent

  getInfo: ->
    range=@getSymbolRange()
    @process.getInfo @getText(), @getSymbol(range), (data) =>
      @showMessage range,data

  doCheck: ->
    @clearError()
    @process.doCheck @getText(), @showError

  getText: ->
    @editor.getText()

  getRange: ->
    @editor.getSelectedBufferRange()

  getSymbolRange: ->
    range = @getRange()
    range = @editor.getCursor().getCurrentWordBufferRange() if range.isEmpty()
    return range

  getSymbol: (range) ->
    range=@getSymbolRange() unless range
    @editor.getTextInBufferRange range
