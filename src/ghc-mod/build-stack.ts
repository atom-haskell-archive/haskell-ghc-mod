import { CompositeDisposable } from 'atom'
import { IUPIInstance, IResultItem } from 'atom-haskell-upi'
import * as CP from 'child_process'
import { EOL } from 'os'
import * as Util from '../util'
import { RunOptions } from './ghc-modi-process-real'

export async function buildStack(
  opts: RunOptions,
  upi: IUPIInstance | undefined,
): Promise<boolean> {
  const messages: IResultItem[] = []
  const disp = new CompositeDisposable()
  try {
    const vers = await Util.execPromise(
      'stack',
      ['--no-install-ghc', '--numeric-version'],
      opts,
    )
      .then(({ stdout }) => stdout.split('.').map((n) => parseInt(n, 10)))
      .catch(() => undefined)
    const hasCopyCompiler = vers ? Util.versAtLeast(vers, [1, 6, 1]) : false
    return await new Promise<boolean>((resolve, reject) => {
      const args = ['--no-install-ghc', 'build']
      if (hasCopyCompiler) args.push('--copy-compiler-tool')
      args.push('ghc-mod')
      Util.warn(`Running stack ${args.join(' ')}`)
      const proc = CP.spawn('stack', args, opts)
      const buffered = () => {
        let buffer = ''
        return (data: Buffer) => {
          const output = data.toString('utf8')
          const [first, ...tail] = output.split(EOL)
          buffer += first
          if (tail.length > 0) {
            // it means there's at least one newline
            const lines = [buffer, ...tail.slice(0, -1)]
            buffer = tail.slice(-1)[0]
            messages.push(
              ...lines.map((message) => ({ message, severity: 'build' })),
            )
            if (upi) {
              upi.setMessages(messages)
            } else {
              atom.notifications.addInfo(lines.join('\n'))
            }
            console.log(lines.join('\n'))
          }
        }
      }
      proc.stdout.on('data', buffered())
      proc.stderr.on('data', buffered())
      if (upi) {
        disp.add(
          upi.addPanelControl({
            element: 'ide-haskell-button',
            opts: {
              classes: ['cancel'],
              events: {
                click: () => {
                  proc.kill('SIGTERM')
                  proc.kill('SIGKILL')
                },
              },
            },
          }),
        )
      }
      proc.once('exit', (code, signal) => {
        if (code === 0) {
          resolve(true)
        } else {
          reject(
            new Error(
              `Stack build exited with nonzero exit status ${code} due to ${signal}`,
            ),
          )
          Util.warn(messages.map((m) => m.message).join('\n'))
        }
      })
    })
  } catch (e) {
    Util.warn(e)
    atom.notifications.addError(e.toString(), {
      dismissable: true,
      detail: messages.map((m) => m.message).join('\n'),
    })
    return false
  } finally {
    upi && upi.setMessages([])
    disp.dispose()
  }
}
