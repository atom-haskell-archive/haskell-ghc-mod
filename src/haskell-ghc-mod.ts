/*
 * decaffeinate suggestions:
 * DS102: Remove unnecessary code created because of implicit returns
 * DS103: Rewrite code to no longer use __guard__
 * DS207: Consider shorter variations of null checks
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/master/docs/suggestions.md
 */
import {GhcModiProcess} from './ghc-mod'
import {CompositeDisposable, Disposable} from 'atom'
import {CompletionBackend} from './completion-backend'
import {UPIConsumer} from './upi-consumer'
import {defaultErrorHandler} from './util'

let process: GhcModiProcess | undefined
let disposables: CompositeDisposable | undefined
let tempDisposables: CompositeDisposable | undefined
let completionBackend: CompletionBackend | undefined

export {config} from './config'

export function activate (state: never) {
  process = new GhcModiProcess()
  disposables = new CompositeDisposable()
  tempDisposables = new CompositeDisposable()
  disposables.add(tempDisposables)

  tempDisposables.add(
    process.onError(defaultErrorHandler),
    process.onWarning((detail: string) => {
      atom.notifications.addWarning('ghc-mod warning', {detail})
    }),
  )

  disposables.add(
    atom.commands.add('atom-workspace', {
      'haskell-ghc-mod:shutdown-backend': () => process && process.killProcess()
    })
  )
}

export function deactivate () {
  process && process.destroy()
  process = undefined
  completionBackend = undefined
  disposables && disposables.dispose()
  disposables = undefined
}

export function provideCompletionBackend () {
  if (! process) { return }
  if (! completionBackend) { completionBackend = new CompletionBackend(process) }
  return completionBackend
}

export function consumeUPI (service: UPI.IUPIRegistration) {
  if (!process || !disposables) { return }
  tempDisposables && tempDisposables.dispose()
  const upiConsumer = new UPIConsumer(service, process)
  const upiConsumerDisp =
    new Disposable(() => upiConsumer.destroy())
  disposables.add(upiConsumerDisp)
  return upiConsumerDisp
}
