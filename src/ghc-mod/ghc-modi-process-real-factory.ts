import { GHCModCaps } from './interactive-process'
import * as Util from '../util'
import { GhcModiProcessReal, RunOptions } from './ghc-modi-process-real'

export type GHCModVers = { vers: number[], comp: string }

export async function createGhcModiProcessReal(rootDir: AtomTypes.Directory): Promise<GhcModiProcessReal> {
  let opts: RunOptions | undefined
  let vers: GHCModVers | undefined
  let caps: GHCModCaps | undefined
  try {
    opts = await Util.getProcessOptions(rootDir.getPath())
    const versP = getVersion(opts)
    const bopts = opts
    checkComp(bopts, versP).catch((e: Error) => {
      atom.notifications.addError('Failed to check compiler versions', {
        detail: e,
        stack: e.stack,
        dismissable: true,
      })
    })
    vers = await versP
    caps = getCaps(vers)
    return new GhcModiProcessReal(caps, rootDir, opts)
  } catch (e) {
    // tslint:disable-next-line:no-unsafe-any
    const err: Error & {code: any} = e
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

  const atLeast = (b: number[]) => {
    for (let i = 0; i < b.length; i++) {
      const v = b[i]
      if (vers[i] > v) {
        return true
      } else if (vers[i] < v) {
        return false
      }
    }
    return true
  }

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
  const { stdout } = await Util.execPromise(cmd, ['version'], { timeout, ...opts })
  const versRaw = /^ghc-mod version (\d+)\.(\d+)\.(\d+)(?:\.(\d+))?/.exec(stdout)
  if (!versRaw) { throw new Error("Couldn't get ghc-mod version") }
  const vers = versRaw.slice(1, 5).map((i) => parseInt(i, 10))
  const compRaw = /GHC (.+)$/.exec(stdout.trim())
  if (!compRaw) { throw new Error("Couldn't get ghc version") }
  const comp = compRaw[1]
  Util.debug(`Ghc-mod ${vers} built with ${comp}`)
  return { vers, comp }
}

async function checkComp(opts: Util.ExecOpts, versP: Promise<GHCModVers>) {
  const {comp} = await versP
  const timeout = atom.config.get('haskell-ghc-mod.initTimeout') * 1000
  const tryWarn = async (cmd: string, args: string[]) => {
    try {
      return (await Util.execPromise(cmd, args, { timeout, ...opts })).stdout.trim()
    } catch (error) {
      Util.warn(error)
    }
  }
  const [stackghc, pathghc] = await Promise.all([
    tryWarn('stack', ['ghc', '--', '--numeric-version']),
    tryWarn('ghc', ['--numeric-version']),
  ])
  Util.debug(`Stack GHC version ${stackghc}`)
  Util.debug(`Path GHC version ${pathghc}`)
  if (stackghc && (stackghc !== comp)) {
    const warn = `\
GHC version in your Stack '${stackghc}' doesn't match with \
GHC version used to build ghc-mod '${comp}'. This can lead to \
problems when using Stack projects`
    atom.notifications.addWarning(warn)
    Util.warn(warn)
  }
  if (pathghc && (pathghc !== comp)) {
    const warn = `\
GHC version in your PATH '${pathghc}' doesn't match with \
GHC version used to build ghc-mod '${comp}'. This can lead to \
problems when using Cabal or Plain projects`
    atom.notifications.addWarning(warn)
    Util.warn(warn)
  }
}
