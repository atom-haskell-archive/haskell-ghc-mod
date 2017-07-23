/*
 * decaffeinate suggestions:
 * DS102: Remove unnecessary code created because of implicit returns
 * DS201: Simplify complex destructure assignments
 * DS207: Consider shorter variations of null checks
 * DS208: Avoid top-level this
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/master/docs/suggestions.md
 */
import { Range, Point, Directory } from 'atom'
import { delimiter, sep, extname } from 'path'
import * as Temp from 'temp'
import * as FS from 'fs'
import * as CP from 'child_process'
import { EOL } from 'os'
import {getRootDirFallback, getRootDir, isDirectory} from 'atom-haskell-utils'
import { RunOptions } from './ghc-mod/ghc-modi-process-real'

type ExecOpts = CP.ExecFileOptionsWithStringEncoding
export {getRootDirFallback, getRootDir, isDirectory, ExecOpts}

let debuglog: Array<{timestamp: number, messages: string[]}> = []
const logKeep = 30000 // ms

function savelog (...messages: string[]) {
  const ts = Date.now()
  debuglog.push({
    timestamp: ts,
    messages
  })
  debuglog = debuglog.filter(({timestamp}) => (ts - timestamp) < logKeep)
}

function joinPath (ds: string[]) {
  const set = new Set(ds)
  return Array.from(set).join(delimiter)
}

export const EOT = `${EOL}\x04${EOL}`

export function debug (...messages: any[]) {
  if (atom.config.get('haskell-ghc-mod.debug')) {
    // tslint:disable-next-line: no-console
    console.log('haskell-ghc-mod debug:', ...messages)
  }
  savelog(...messages.map((v) => JSON.stringify(v)))
}

export function warn (...messages: any[]) {
  // tslint:disable-next-line: no-console
  console.warn('haskell-ghc-mod warning:', ...messages)
  savelog(...messages.map((v) => JSON.stringify(v)))
}

export function getDebugLog () {
  const ts = Date.now()
  debuglog = debuglog.filter(({timestamp}) => (ts - timestamp) < logKeep)
  return debuglog.map(({timestamp, messages}) => `${(timestamp - ts) / 1000}s: ${messages.join(',')}`).join(EOL)
}

export async function execPromise (cmd: string, args: string[], opts: ExecOpts, stdin?: string) {
  return new Promise<{stdout: string, stderr: string}>((resolve, reject) => {
    debug(`Running ${cmd} ${args} with opts = `, opts)
    const child = CP.execFile(cmd, args, opts, (error, stdout: string, stderr: string) => {
      if (stderr.trim().length > 0) { warn(stderr) }
      if (error) {
        warn(`Running ${cmd} ${args} failed with `, error)
        if (stdout) { warn(stdout) }
        error.stack = (new Error()).stack
        return reject(error)
      } else {
        debug(`Got response from ${cmd} ${args}`, {stdout, stderr})
        return resolve({stdout, stderr})
      }
    })
    if (stdin) {
      debug(`sending stdin text to ${cmd} ${args}`)
      return child.stdin.write(stdin)
    }
  })
}

export async function getCabalSandbox (rootPath: string) {
  debug('Looking for cabal sandbox...')
  const sbc = await parseSandboxConfig(`${rootPath}${sep}cabal.sandbox.config`)
  if (sbc && sbc['install-dirs'] && sbc['install-dirs'].bindir) {
    const sandbox = sbc['install-dirs'].bindir
    debug('Found cabal sandbox: ', sandbox)
    if (isDirectory(sandbox)) {
      return sandbox
    } else {
      warn('Cabal sandbox ', sandbox, ' is not a directory')
    }
  } else {
    warn('No cabal sandbox found')
  }
}

export async function getStackSandbox (rootPath: string , apd: string[], env: {[key: string]: string | undefined}) {
  debug('Looking for stack sandbox...')
  env.PATH = joinPath(apd)
  debug('Running stack with PATH ', env.PATH)
  try {
    const out = await execPromise('stack', ['path', '--snapshot-install-root', '--local-install-root', '--bin-path'], {
      encoding: 'utf8',
      cwd: rootPath,
      env,
      timeout: atom.config.get('haskell-ghc-mod.initTimeout') * 1000
    })

    const lines = out.stdout.split(EOL)
    const sir = lines.filter((l) => l.startsWith('snapshot-install-root: '))[0].slice(23) + `${sep}bin`
    const lir = lines.filter((l) => l.startsWith('local-install-root: '))[0].slice(20) + `${sep}bin`
    const bp =
      lines.filter((l) =>
        l.startsWith('bin-path: '))[0].slice(10).split(delimiter).filter((p) =>
          !((p === sir) || (p === lir) || (apd.includes(p))))
    debug('Found stack sandbox ', lir, sir, ...bp)
    return [lir, sir, ...bp]
  } catch (err) {
    warn('No stack sandbox found because ', err)
  }
}

const processOptionsCache = new Map<string, RunOptions>()

export async function getProcessOptions (rootPath?: string): Promise<RunOptions> {
  if (! rootPath) {
    // tslint:disable-next-line: no-null-keyword
    rootPath = getRootDirFallback(null).getPath()
  }
  // cache
  const cached = processOptionsCache.get(rootPath)
  if (cached) {
    return cached
  }

  debug(`getProcessOptions(${rootPath})`)
  const env = {...process.env}

  if (process.platform === 'win32') {
    const PATH = []
    const capMask = (str: string, mask: number) => {
      const a = str.split('')
      for (let i = 0; i < a.length; i++) {
        const c = a[i]
        // tslint:disable-next-line: no-bitwise
        if (mask & Math.pow(2, i)) {
          a[i] = a[i].toUpperCase()
        }
      }
      return a.join('')
    }
    for (let m = 0b1111; m >= 0; m--) {
      const vn = capMask('path', m)
      if (env[vn]) {
        PATH.push(env[vn])
      }
    }
    env.PATH = PATH.join(delimiter)
  }

  const PATH = env.PATH || ''

  const apd = atom.config.get('haskell-ghc-mod.additionalPathDirectories').concat(PATH.split(delimiter))
  const sbd = false
  const cabalSandbox =
    atom.config.get('haskell-ghc-mod.cabalSandbox') ? getCabalSandbox(rootPath) : Promise.resolve() // undefined
  const stackSandbox =
    atom.config.get('haskell-ghc-mod.stackSandbox') ? getStackSandbox(rootPath, apd, {...env}) : Promise.resolve()
  const [cabalSandboxDir, stackSandboxDirs] = await Promise.all([cabalSandbox, stackSandbox])
  const newp = []
  if (cabalSandboxDir) {
    newp.push(cabalSandboxDir)
  }
  if (stackSandboxDirs) {
    newp.push(...stackSandboxDirs)
  }
  newp.push(...apd)
  env.PATH = joinPath(newp)
  debug(`PATH = ${env.PATH}`)
  const res: RunOptions = {
    cwd: rootPath,
    env,
    encoding: 'utf8',
    maxBuffer: Infinity
  }
  processOptionsCache.set(rootPath, res)
  return res
}

export function getSymbolAtPoint (editor: AtomTypes.TextEditor, point: AtomTypes.Point) {
  let range, symbol
  const inScope = (scope: string, point2: AtomTypes.IPoint) =>
    editor.scopeDescriptorForBufferPosition(point2).getScopesArray().some((v) => v === scope)

  const tb = editor.getBuffer()
  const line = tb.rangeForRow(point.row)
  const find = (test: (point: AtomTypes.Point) => boolean) => {
    let end = point
    let start = point
    let start2 = start.translate([0, -1])
    while (test(start2) && start2.isGreaterThanOrEqual(line.start)) {
      start = start2
      start2 = start.translate([0, -1])
    }
    while (test(end) && end.isLessThan(line.end)) {
      end = end.translate([0, 1])
    }
    return new Range(start, end)
  }

  const regex = /[\w'.]/
  const scopes = [
    'keyword.operator.haskell',
    'entity.name.function.infix.haskell'
  ]
  for (const scope of scopes) {
    range = find((p) => inScope(scope, p))
    if (!range.isEmpty()) {
      symbol = tb.getTextInRange(range)
      return {scope, range, symbol}
    }
  }

  // else
  // tslint:disable-next-line: no-null-keyword
  range = find((p) => tb.getTextInRange([p, p.translate([0, 1])]).match(regex) !== null)
  symbol = tb.getTextInRange(range)
  return {scope: undefined, range, symbol}
}

export function getSymbolInRange (editor: AtomTypes.TextEditor, crange: AtomTypes.Range) {
  const buffer = editor.getBuffer()
  if (crange.isEmpty()) {
    return getSymbolAtPoint(editor, crange.start)
  } else {
    return {
      symbol: buffer.getTextInRange(crange),
      range: crange
    }
  }
}

export async function withTempFile<T> (contents: string, uri: string, gen: (path: string) => Promise<T>): Promise<T> {
  const info = await new Promise<Temp.OpenFile>(
    (resolve, reject) =>
    Temp.open(
      {prefix: 'haskell-ghc-mod', suffix: extname(uri || '.hs')},
      (err, info2) => {
        if (err) {
          reject(err)
        } else {
          resolve(info2)
        }
    }))
  return new Promise<T>((resolve, reject) =>
    FS.write(info.fd, contents, async (err) => {
      if (err) {
        reject(err)
      } else {
        const res = await gen(info.path)
        FS.close(info.fd, () => FS.unlink(info.path, () => { /*noop*/ }))
        return res
      }
    }))
}

export function mkError (name: string, message: string) {
  const err = new Error(message)
  err.name = name
  return err
}

export async function parseSandboxConfig (file: string) {
  try {
    const sbc = await new Promise<string>((resolve, reject) =>
      FS.readFile(file, {encoding: 'utf-8'}, (err, sbc2) => {
        if (err) {
          reject(err)
        } else {
          resolve(sbc2)
        }
      }))

    interface T {[k: string]: T | string}
    const vars: T = {}
    let scope = vars
    const rv = (v: string) => {
      for (const k1 of Object.keys(scope)) {
        const v1 = scope[k1]
        if (typeof v1 === 'string') {
          v = v.split(`$${k1}`).join(v1)
        }
      }
      return v
    }
    for (const line of sbc.split(/\r?\n|\r/)) {
      if (!line.match(/^\s*--/) && !line.match(/^\s*$/)) {
        const [l] = line.split(/--/)
        const m = line.match(/^\s*([\w-]+):\s*(.*)\s*$/)
        if (m) {
          const [_, name, val] = m
          return scope[name] = rv(val)
        } else {
          const newscope = {}
          scope[line] = newscope
          return scope = newscope
        }
      }
    }
    return vars
  } catch (err) {
    warn('Reading cabal sandbox config failed with ', err)
  }
}

// A dirty hack to work with tabs
export function tabShiftForPoint (buffer: AtomTypes.TextBuffer, point: AtomTypes.Point) {
  const line = buffer.lineForRow(point.row)
  const match = line ? (line.slice(0, point.column).match(/\t/g) || []) : []
  const columnShift = 7 * match.length
  return new Point(point.row, point.column + columnShift)
}

export function tabShiftForRange (buffer: AtomTypes.TextBuffer, range: AtomTypes.Range) {
  const start = tabShiftForPoint(buffer, range.start)
  const end = tabShiftForPoint(buffer, range.end)
  return new Range(start, end)
}

export function tabUnshiftForPoint (buffer: AtomTypes.TextBuffer, point: AtomTypes.Point) {
  const line = buffer.lineForRow(point.row)
  let columnl = 0
  let columnr = point.column
  while (columnl < columnr) {
    // tslint:disable-next-line: strict-type-predicates
    if ((line === undefined) || (line[columnl] === undefined)) { break }
    if (line[columnl] === '\t') {
      columnr -= 7
    }
    columnl += 1
  }
  return new Point(point.row, columnr)
}

export function tabUnshiftForRange (buffer: AtomTypes.TextBuffer, range: AtomTypes.Range) {
  const start = tabUnshiftForPoint(buffer, range.start)
  const end = tabUnshiftForPoint(buffer, range.end)
  return new Range(start, end)
}

export function isUpperCase (ch: string | undefined): boolean {
  return !!ch && (ch.toUpperCase() === ch)
}