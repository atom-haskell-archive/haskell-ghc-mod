import { GhcModiProcess } from './ghc-mod'
import { CompositeDisposable } from 'atom'
import { CompletionBackend } from './completion-backend'
import { UPIConsumer } from './upi-consumer'
import { defaultErrorHandler } from './util'
import * as UPI from 'atom-haskell-upi'

let process: GhcModiProcess | undefined
let disposables: CompositeDisposable | undefined
let tempDisposables: CompositeDisposable | undefined
let completionBackend: CompletionBackend | undefined
let resolveUpiPromise: (v: UPI.IUPIInstance) => void
let upiPromise: Promise<UPI.IUPIInstance>

export { config } from './config'

export function activate(_state: never) {
  upiPromise = new Promise<UPI.IUPIInstance>(
    (resolve) => (resolveUpiPromise = resolve),
  )
  process = new GhcModiProcess(upiPromise)
  disposables = new CompositeDisposable()
  tempDisposables = new CompositeDisposable()
  disposables.add(tempDisposables)

  tempDisposables.add(
    process.onError(defaultErrorHandler),
    process.onWarning((detail: string) => {
      atom.notifications.addWarning('ghc-mod warning', { detail })
    }),
  )

  disposables.add(
    atom.commands.add('atom-workspace', {
      'haskell-ghc-mod:shutdown-backend': () =>
        process && process.killProcess(),
    }),
  )
}

export function deactivate() {
  process && process.destroy()
  process = undefined
  completionBackend = undefined
  disposables && disposables.dispose()
  disposables = undefined
  tempDisposables = undefined
}

export function provideCompletionBackend() {
  if (!process) {
    return undefined
  }
  if (!completionBackend) {
    completionBackend = new CompletionBackend(process, upiPromise)
  }
  return completionBackend
}

export function consumeUPI(service: UPI.IUPIRegistration) {
  if (!process || !disposables) {
    return undefined
  }
  tempDisposables && tempDisposables.dispose()
  tempDisposables = undefined
  const upiConsumer = new UPIConsumer(service, process)
  resolveUpiPromise(upiConsumer.upi)
  disposables.add(upiConsumer)
  return upiConsumer
}
