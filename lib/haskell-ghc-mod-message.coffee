{Emitter,CompositeDisposable} = require 'atom'

class HaskellGhcModMessage
  constructor: (@message) ->
    @emitter = new Emitter

  onDidChangeMessage: (callback) ->
    @emitter.on 'did-change-message', callback

  setMessage: (@message) ->
    @emitter.emit 'did-change-message', name

  destroy: ->
    @emitter.destroy()

class HaskellGhcModMessageElement extends HTMLElement
  setModel: (@model) ->
    @pre.textContent=@model.message
    @subs.add @model.onDidChangeMessage =>
      @pre.textContent=@model.message

  createdCallback: ->
    @subs = new CompositeDisposable
    @rootElement=this
    @classList.add 'haskell-ghc-mod'
    @pre=document.createElement('pre')
    @appendChild @pre

  destroy: ->
    @rootElement.destroy()
    @subs.dispose()

HaskellGhcModMessageElement =
  document.registerElement 'haskell-ghc-mod-message',
    prototype: HaskellGhcModMessageElement.prototype

module.exports = {
  HaskellGhcModMessage,
  HaskellGhcModMessageElement
  }
