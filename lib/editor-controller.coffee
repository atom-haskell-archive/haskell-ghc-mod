{Range,CompositeDisposable} = require('atom')
{HaskellGhcModMessage} = require('./haskell-ghc-mod-message')

module.exports =
class EditorController
  constructor: (@process,@editor) ->
    @errorMarkers = []
    @errorTooltips = new CompositeDisposable
    @subscriptions = new CompositeDisposable
    @errorTooltipsMap = new WeakMap

    @subscriptions.add @editor.onDidSave =>
      @doCheck() if atom.config.get('haskell-ghc-mod.checkOnSave')

    @subscriptions.add @editor.onDidDestroy =>
      @destroy()

    @removeMessageOnChange=@editor.onDidChangeCursorPosition =>
      @messageMarker?.destroy()
      @messageMarker=null

    @subscriptions.add @removeMessageOnChange


  clearError: ->
    @errorMarkers.forEach (marker) ->
      marker.destroy()
    @errorMarkers = []
    @errorTooltips.dispose()
    @errorTooltips = new CompositeDisposable
    @errorTooltipsMap = new WeakMap

  destroy: ->
    @clearError()
    @subscriptions.dispose()
    @messageMarker?.destroy()

  showMessage: (range, message, crange) =>
    return unless @editor.isAlive()
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

  addTooltip: (message, cls, row) =>
    return unless @editor.isAlive()
    vi = atom.views.getView(@editor)
    line=vi.rootElement.querySelector(
      '.'+cls+'.line-number-'+row)
    if line && !@errorTooltipsMap.has(line)
      d=atom.tooltips.add line,
        template: '<div class="tooltip" role="tooltip">'+
          '<div class="tooltip-arrow"></div>'+
          '<pre class="tooltip-inner"></pre></div>'
        title: message
        placement: 'right'
      @errorTooltipsMap.set line,d if d
      @errorTooltips.add d if d

  showError: (point, message, severity) =>
    return unless @editor.isAlive()
    range=[point,point.traverse([0,1])]
    @errorMarkers.push marker = @editor.markBufferRange(range)
    if severity == 'warning'
      cls = 'haskell-ghc-mod-warning'
    else
      cls = 'haskell-ghc-mod-error'
    @editor.decorateMarker marker,
      type: 'line-number'
      class: cls
    @editor.decorateMarker marker,
      type: 'highlight'
      class: cls
    setTimeout (=>@addTooltip(message,cls,point.row)), 100
    @errorTooltips.add @editor.onDidChangeScrollTop =>
      @addTooltip(message,cls,point.row)
    @errorTooltips.add @editor.onDidChangeCursorPosition (event) =>
      return unless event.newBufferPosition.isEqual(point)
      @showMessage range,message

  getTypeCallback: (callback) ->
    crange=@getRange()
    @process.getTypeInBuffer @editor.getBuffer(), crange, ({range,type}) ->
      callback(range,type,crange)

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
    crange=@getRange()
    @process.getInfoInBuffer @editor.getBuffer(), crange, ({range,info}) =>
      @showMessage range,info

  doCheck: ->
    @clearError()
    @process.doCheckBuffer @editor.getBuffer(), (res) =>
      res.forEach ({position,message,uri,severity}) =>
        if uri==@editor.getBuffer().getUri()
          @showError position,message,severity

  getRange: ->
    @editor.getSelectedBufferRange()

  getSymbolRange: ->
    range = @getRange()
    if range.isEmpty()
      range = @editor.getLastCursor().getCurrentWordBufferRange()
    return range

  getSymbol: (range) ->
    range=@getSymbolRange() unless range
    @editor.getTextInBufferRange range

  getPath: ->
    @editor.getPath()
