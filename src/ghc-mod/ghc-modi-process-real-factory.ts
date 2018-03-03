import { GHCModCaps } from './interactive-process'
import * as Util from '../util'
import { GhcModiProcessReal, RunOptions } from './ghc-modi-process-real'
import { Directory, Notification } from 'atom'
import { IUPIInstance } from 'atom-haskell-upi'
import { buildStack } from './build-stack'

export type GHCModVers = { vers: number[]; comp: string }

export async function createGhcModiProcessReal(
  rootDir: Directory,
  upi: IUPIInstance | undefined,
): Promise<GhcModiProcessReal> {
  let opts: RunOptions | undefined
  let vers: GHCModVers | undefined
  let caps: GHCModCaps | undefined
  let builder: { name: string } | undefined
  try {
    if (upi && atom.config.get('haskell-ghc-mod.builderManagement')) {
      // TODO: this is used twice, the second time in ghc-mod/index.ts, should probably fix that
      builder = await upi.getOthersConfigParam<{ name: string }>(
        'ide-haskell-cabal',
        'builder',
      )
    }
    const bn = builder && builder.name
    Util.debug(`Using builder ${bn}`)
    // TODO: Should prefer stack sandbox when using stack and cabal sanbdox when using cabal!
    opts = await Util.getProcessOptions(rootDir.getPath())
    const versP = getVersion(opts)
    const bopts = opts
    // TODO: this gets checked only once, should check on ghc-mod restart?
    const shouldBuild = await checkComp(bopts, versP, bn).catch(
      async (e: any) => {
        if (e.code === 'ENOENT') {
          return askBuild(bn, `Atom couldn't find ghc-mod.`)
        } else {
          atom.notifications.addError('Failed to check compiler versions', {
            detail: e.toString(),
            stack: e.stack,
            dismissable: true,
          })
          return false
        }
      },
    )
    if (shouldBuild) {
      const success = await buildStack(bopts, upi)
      if (success) {
        return createGhcModiProcessReal(rootDir, upi)
      } else {
        atom.notifications.addWarning(
          'Building ghc-mod failed, continuing as-is',
        )
      }
    }
    vers = await versP
    caps = getCaps(vers)
    return new GhcModiProcessReal(caps, rootDir, opts)
  } catch (e) {
    const err: Error & { code: any } = e
    Util.notifySpawnFail({ dir: rootDir.getPath(), err, opts, vers, caps })
    throw e
  }
}

function getCaps({ vers }: { vers: number[] }): GHCModCaps {
  const caps: GHCModCaps = {
    version: vers,
    fileMap: false,
    quoteArgs: false,
    optparse: false,
    typeConstraints: false,
    browseParents: false,
    interactiveCaseSplit: false,
    importedFrom: false,
    browseMain: false,
  }

  const atLeast = (x: number[]) => Util.versAtLeast(vers, x)

  const exact = (b: number[]) => {
    for (let i = 0; i < b.length; i++) {
      const v = b[i]
      if (vers[i] !== v) {
        return false
      }
    }
    return true
  }

  if (!atLeast([5, 4])) {
    atom.notifications.addError(
      `\
Haskell-ghc-mod: ghc-mod < 5.4 is not supported. \
Use at your own risk or update your ghc-mod installation`,
      { dismissable: true },
    )
  }
  if (exact([5, 4])) {
    atom.notifications.addWarning(
      `\
Haskell-ghc-mod: ghc-mod 5.4.* is deprecated. \
Use at your own risk or update your ghc-mod installation`,
      { dismissable: true },
    )
  }
  if (atLeast([5, 4])) {
    caps.fileMap = true
  }
  if (atLeast([5, 5])) {
    caps.quoteArgs = true
    caps.optparse = true
  }
  if (atLeast([5, 6])) {
    caps.typeConstraints = true
    caps.browseParents = true
    caps.interactiveCaseSplit = true
  }
  if (atom.config.get('haskell-ghc-mod.experimental')) {
    caps.importedFrom = true
  }
  Util.debug(JSON.stringify(caps))
  return caps
}

async function getVersion(opts: Util.ExecOpts): Promise<GHCModVers> {
  const timeout = atom.config.get('haskell-ghc-mod.initTimeout') * 1000
  const cmd = atom.config.get('haskell-ghc-mod.ghcModPath')
  const { stdout } = await Util.execPromise(cmd, ['version'], {
    timeout,
    ...opts,
  })
  const versRaw = /^ghc-mod version (\d+)\.(\d+)\.(\d+)(?:\.(\d+))?/.exec(
    stdout,
  )
  if (!versRaw) {
    throw new Error("Couldn't get ghc-mod version")
  }
  const vers = versRaw.slice(1, 5).map((i) => parseInt(i, 10))
  const compRaw = /GHC (.+)$/.exec(stdout.trim())
  if (!compRaw) {
    throw new Error("Couldn't get ghc version")
  }
  const comp = compRaw[1]
  Util.debug(`Ghc-mod ${vers} built with ${comp}`)
  return { vers, comp }
}

async function checkComp(
  opts: Util.ExecOpts,
  versP: Promise<GHCModVers>,
  builder: string | undefined,
) {
  const { comp } = await versP
  const timeout = atom.config.get('haskell-ghc-mod.initTimeout') * 1000
  const tryWarn = async (cmd: string, args: string[]) => {
    try {
      return (await Util.execPromise(cmd, args, {
        timeout,
        ...opts,
      })).stdout.trim()
    } catch (error) {
      Util.warn(error)
      return undefined
    }
  }
  const [stackghc, pathghc] = await Promise.all([
    tryWarn('stack', ['--no-install-ghc', 'ghc', '--', '--numeric-version']),
    tryWarn('ghc', ['--numeric-version']),
  ])
  Util.debug(`Stack GHC version ${stackghc}`)
  Util.debug(`Path GHC version ${pathghc}`)
  const warnStack = ['stack', undefined].includes(builder)
  const warnCabal = ['cabal', 'none', undefined].includes(builder)
  let shouldBuild = false
  if (pathghc && pathghc !== comp && warnCabal) {
    shouldBuild =
      shouldBuild ||
      (await askBuild(
        builder,
        `\
GHC version in your PATH '${pathghc}' doesn't match with \
GHC version used to build ghc-mod '${comp}'. This can lead to \
problems when using Cabal or Plain projects`,
      ))
  }
  ///////////////////////////// stack //////////////////////////////////////////
  if (stackghc && stackghc !== comp && warnStack) {
    shouldBuild =
      shouldBuild ||
      (await askBuild(
        builder,
        `\
GHC version in your Stack '${stackghc}' doesn't match with \
GHC version used to build ghc-mod '${comp}'. This can lead to \
problems when using Stack projects.`,
      ))
  }
  return shouldBuild
}

async function askBuild(builder: string | undefined, msg: string) {
  let buttons:
    | Array<{
        className?: string
        text?: string
        onDidClick?(event: MouseEvent): void
      }>
    | undefined

  return new Promise<boolean>((resolve) => {
    let notif: Notification
    if (builder === 'stack') {
      // offer to build ghc-mod
      buttons = [
        {
          className: 'icon icon-zap',
          text: 'Build ghc-mod',
          onDidClick() {
            resolve(true)
            notif && notif.dismiss()
          },
        },
        {
          className: 'icon icon-x',
          text: 'No thanks',
          onDidClick() {
            resolve(false)
            notif && notif.dismiss()
          },
        },
      ]
    }
    const warn = `${msg} ${
      buttons ? 'Would you like to attempt building ghc-mod?' : ''
    }`
    notif = atom.notifications.addWarning(warn, {
      dismissable: builder !== undefined,
      buttons,
    })
    Util.warn(msg)
    if (buttons) {
      const disp = notif.onDidDismiss(() => {
        disp.dispose()
        resolve(false)
      })
    } else {
      resolve(false)
    }
  })
}
