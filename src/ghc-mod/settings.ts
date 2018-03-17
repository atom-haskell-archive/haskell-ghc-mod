import { File, Directory } from 'atom'
import * as Util from '../util'

export interface GHCModSettings {
  disable?: boolean
  suppressErrors?: boolean
  ghcOptions?: string[]
  ghcModOptions?: string[]
}

export async function getSettings(runDir: Directory): Promise<GHCModSettings> {
  const localSettings = readSettings(runDir.getFile('.haskell-ghc-mod.json'))

  const [projectDir] = atom.project
    .getDirectories()
    .filter((d) => d.contains(runDir.getPath()))
  const projectSettings = projectDir
    ? readSettings(projectDir.getFile('.haskell-ghc-mod.json'))
    : Promise.resolve({})

  const configDir = new Directory(atom.getConfigDirPath())
  const globalSettings = readSettings(configDir.getFile('haskell-ghc-mod.json'))

  const [glob, prj, loc] = await Promise.all([
    globalSettings,
    projectSettings,
    localSettings,
  ])
  return { ...glob, ...prj, ...loc }
}

async function readSettings(file: File): Promise<GHCModSettings> {
  try {
    const contents = await file.read()
    if (contents !== null) {
      try {
        return JSON.parse(contents)
      } catch (err) {
        atom.notifications.addError(`Failed to parse ${file.getPath()}`, {
          detail: err,
          dismissable: true,
        })
        throw err
      }
    } else {
      return {}
    }
  } catch (error) {
    if (error) {
      Util.warn(error)
    }
    return {}
  }
}
