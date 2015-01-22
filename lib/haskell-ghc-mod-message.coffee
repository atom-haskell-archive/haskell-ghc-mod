{Emitter} = require 'atom'

class HaskellGhcModMessage
  constructor: (@message) ->
    @emitter = new Emitter

  onDidChangeMessage: (callback) ->
    @emitter.on 'did-change-message', callback

  setMessage: (@message) ->
    @emitter.emit 'did-change-message', name

class HaskellGhcModMessageElement extends HTMLElement
  setModel: (@model) ->
    @pre.textContent=@model.message
    @model.onDidChangeMessage =>
      @pre.textContent=@model.message

  createdCallback: ->
    @rootElement=this
    @classList.add 'haskell-ghc-mod'
    @pre=document.createElement('pre')
    @appendChild @pre

  destroy: ->
    @rootElement.destroy()

HaskellGhcModMessageElement =
  document.registerElement 'haskell-ghc-mod-message',
    prototype: HaskellGhcModMessageElement.prototype

module.exports = {
  HaskellGhcModMessage,
  HaskellGhcModMessageElement
  }
