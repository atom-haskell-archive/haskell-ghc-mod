"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const atom_1 = require("atom");
const path_1 = require("path");
const Temp = require("temp");
const FS = require("fs");
const CP = require("child_process");
const os_1 = require("os");
const atom_haskell_utils_1 = require("atom-haskell-utils");
exports.getRootDirFallback = atom_haskell_utils_1.getRootDirFallback;
exports.getRootDir = atom_haskell_utils_1.getRootDir;
exports.isDirectory = atom_haskell_utils_1.isDirectory;
let debuglog = [];
const logKeep = 30000;
function savelog(...messages) {
    const ts = Date.now();
    debuglog.push({
        timestamp: ts,
        messages,
    });
    let ks = 0;
    for (const v of debuglog) {
        if (ts - v.timestamp >= logKeep) {
            break;
        }
        ks++;
    }
    debuglog.splice(0, ks);
}
function joinPath(ds) {
    const set = new Set(ds);
    return Array.from(set).join(path_1.delimiter);
}
exports.EOT = `${os_1.EOL}\x04${os_1.EOL}`;
function debug(...messages) {
    if (atom.config.get('haskell-ghc-mod.debug')) {
        console.log('haskell-ghc-mod debug:', ...messages);
    }
    savelog(...messages.map((v) => JSON.stringify(v)));
}
exports.debug = debug;
function warn(...messages) {
    console.warn('haskell-ghc-mod warning:', ...messages);
    savelog(...messages.map((v) => JSON.stringify(v)));
}
exports.warn = warn;
function error(...messages) {
    console.error('haskell-ghc-mod error:', ...messages);
    savelog(...messages.map((v) => JSON.stringify(v)));
}
exports.error = error;
function getDebugLog() {
    const ts = Date.now();
    debuglog = debuglog.filter(({ timestamp }) => ts - timestamp < logKeep);
    return debuglog
        .map(({ timestamp, messages }) => `${(timestamp - ts) / 1000}s: ${messages.join(',')}`)
        .join(os_1.EOL);
}
exports.getDebugLog = getDebugLog;
async function execPromise(cmd, args, opts, stdin) {
    return new Promise((resolve, reject) => {
        debug(`Running ${cmd} ${args} with opts = `, opts);
        const child = CP.execFile(cmd, args, opts, (error, stdout, stderr) => {
            if (stderr.trim().length > 0) {
                warn(stderr);
            }
            if (error) {
                warn(`Running ${cmd} ${args} failed with `, error);
                if (stdout) {
                    warn(stdout);
                }
                error.stack = new Error().stack;
                reject(error);
            }
            else {
                debug(`Got response from ${cmd} ${args}`, { stdout, stderr });
                resolve({ stdout, stderr });
            }
        });
        if (stdin) {
            debug(`sending stdin text to ${cmd} ${args}`);
            child.stdin.write(stdin);
        }
    });
}
exports.execPromise = execPromise;
async function getCabalSandbox(rootPath) {
    debug('Looking for cabal sandbox...');
    const sbc = await parseSandboxConfig(`${rootPath}${path_1.sep}cabal.sandbox.config`);
    if (sbc && sbc['install-dirs'] && sbc['install-dirs']['bindir']) {
        const sandbox = sbc['install-dirs']['bindir'];
        debug('Found cabal sandbox: ', sandbox);
        if (atom_haskell_utils_1.isDirectory(sandbox)) {
            return sandbox;
        }
        else {
            warn('Cabal sandbox ', sandbox, ' is not a directory');
            return undefined;
        }
    }
    else {
        warn('No cabal sandbox found');
        return undefined;
    }
}
exports.getCabalSandbox = getCabalSandbox;
async function getStackSandbox(rootPath, apd, env) {
    debug('Looking for stack sandbox...');
    env.PATH = joinPath(apd);
    debug('Running stack with PATH ', env.PATH);
    try {
        const out = await execPromise('stack', [
            '--no-install-ghc',
            'path',
            '--snapshot-install-root',
            '--local-install-root',
            '--bin-path',
        ], {
            encoding: 'utf8',
            cwd: rootPath,
            env,
            timeout: atom.config.get('haskell-ghc-mod.initTimeout') * 1000,
        });
        const lines = out.stdout.split(os_1.EOL);
        const sir = lines
            .filter((l) => l.startsWith('snapshot-install-root: '))[0]
            .slice(23) + `${path_1.sep}bin`;
        const lir = lines.filter((l) => l.startsWith('local-install-root: '))[0].slice(20) +
            `${path_1.sep}bin`;
        const bp = lines
            .filter((l) => l.startsWith('bin-path: '))[0]
            .slice(10)
            .split(path_1.delimiter)
            .filter((p) => !(p === sir || p === lir || apd.includes(p)));
        debug('Found stack sandbox ', lir, sir, ...bp);
        return [lir, sir, ...bp];
    }
    catch (err) {
        warn('No stack sandbox found because ', err);
        return undefined;
    }
}
exports.getStackSandbox = getStackSandbox;
const processOptionsCache = new Map();
async function getProcessOptions(rootPath) {
    if (!rootPath) {
        rootPath = atom_haskell_utils_1.getRootDirFallback(null).getPath();
    }
    const cached = processOptionsCache.get(rootPath);
    if (cached) {
        return cached;
    }
    debug(`getProcessOptions(${rootPath})`);
    const env = Object.assign({}, process.env);
    if (process.platform === 'win32') {
        const PATH = [];
        const capMask = (str, mask) => {
            const a = str.split('');
            for (let i = 0; i < a.length; i++) {
                if (mask & Math.pow(2, i)) {
                    a[i] = a[i].toUpperCase();
                }
            }
            return a.join('');
        };
        for (let m = 0b1111; m >= 0; m--) {
            const vn = capMask('path', m);
            if (env[vn]) {
                PATH.push(env[vn]);
            }
        }
        env.PATH = PATH.join(path_1.delimiter);
    }
    const PATH = env.PATH || '';
    const apd = atom.config
        .get('haskell-ghc-mod.additionalPathDirectories')
        .concat(PATH.split(path_1.delimiter));
    const cabalSandbox = atom.config.get('haskell-ghc-mod.cabalSandbox')
        ? getCabalSandbox(rootPath)
        : Promise.resolve(undefined);
    const stackSandbox = atom.config.get('haskell-ghc-mod.stackSandbox')
        ? getStackSandbox(rootPath, apd, Object.assign({}, env))
        : Promise.resolve(undefined);
    const [cabalSandboxDir, stackSandboxDirs] = await Promise.all([
        cabalSandbox,
        stackSandbox,
    ]);
    const newp = [];
    if (cabalSandboxDir) {
        newp.push(cabalSandboxDir);
    }
    if (stackSandboxDirs) {
        newp.push(...stackSandboxDirs);
    }
    newp.push(...apd);
    env.PATH = joinPath(newp);
    debug(`PATH = ${env.PATH}`);
    const res = {
        cwd: rootPath,
        env,
        encoding: 'utf8',
        maxBuffer: Infinity,
    };
    processOptionsCache.set(rootPath, res);
    return res;
}
exports.getProcessOptions = getProcessOptions;
function getSymbolAtPoint(editor, point) {
    const [scope] = editor
        .scopeDescriptorForBufferPosition(point)
        .getScopesArray()
        .slice(-1);
    if (scope) {
        const range = editor.bufferRangeForScopeAtPosition(scope, point);
        if (range && !range.isEmpty()) {
            const symbol = editor.getTextInBufferRange(range);
            return { scope, range, symbol };
        }
    }
    return undefined;
}
exports.getSymbolAtPoint = getSymbolAtPoint;
function getSymbolInRange(editor, crange) {
    const buffer = editor.getBuffer();
    if (crange.isEmpty()) {
        return getSymbolAtPoint(editor, crange.start);
    }
    else {
        return {
            symbol: buffer.getTextInRange(crange),
            range: crange,
        };
    }
}
exports.getSymbolInRange = getSymbolInRange;
async function withTempFile(contents, uri, gen) {
    const info = await new Promise((resolve, reject) => Temp.open({ prefix: 'haskell-ghc-mod', suffix: path_1.extname(uri || '.hs') }, (err, info2) => {
        if (err) {
            reject(err);
        }
        else {
            resolve(info2);
        }
    }));
    return new Promise((resolve, reject) => FS.write(info.fd, contents, async (err) => {
        if (err) {
            reject(err);
        }
        else {
            resolve(await gen(info.path));
            FS.close(info.fd, () => FS.unlink(info.path, () => {
            }));
        }
    }));
}
exports.withTempFile = withTempFile;
function mkError(name, message) {
    const err = new Error(message);
    err.name = name;
    return err;
}
exports.mkError = mkError;
async function parseSandboxConfig(file) {
    try {
        const sbc = await new Promise((resolve, reject) => FS.readFile(file, { encoding: 'utf-8' }, (err, sbc2) => {
            if (err) {
                reject(err);
            }
            else {
                resolve(sbc2);
            }
        }));
        const vars = {};
        let scope = vars;
        const rv = (v) => {
            for (const k1 of Object.keys(scope)) {
                const v1 = scope[k1];
                if (typeof v1 === 'string') {
                    v = v.split(`$${k1}`).join(v1);
                }
            }
            return v;
        };
        for (const line of sbc.split(/\r?\n|\r/)) {
            if (!line.match(/^\s*--/) && !line.match(/^\s*$/)) {
                const [l] = line.split(/--/);
                const m = l.match(/^\s*([\w-]+):\s*(.*)\s*$/);
                if (m) {
                    const [, name, val] = m;
                    scope[name] = rv(val);
                }
                else {
                    const newscope = {};
                    scope[line] = newscope;
                    scope = newscope;
                }
            }
        }
        return vars;
    }
    catch (err) {
        warn('Reading cabal sandbox config failed with ', err);
        return undefined;
    }
}
exports.parseSandboxConfig = parseSandboxConfig;
function tabShiftForPoint(buffer, point) {
    const line = buffer.lineForRow(point.row);
    const match = line ? line.slice(0, point.column).match(/\t/g) || [] : [];
    const columnShift = 7 * match.length;
    return new atom_1.Point(point.row, point.column + columnShift);
}
exports.tabShiftForPoint = tabShiftForPoint;
function tabShiftForRange(buffer, range) {
    const start = tabShiftForPoint(buffer, range.start);
    const end = tabShiftForPoint(buffer, range.end);
    return new atom_1.Range(start, end);
}
exports.tabShiftForRange = tabShiftForRange;
function tabUnshiftForPoint(buffer, point) {
    const line = buffer.lineForRow(point.row);
    let columnl = 0;
    let columnr = point.column;
    while (columnl < columnr) {
        if (line === undefined || line[columnl] === undefined) {
            break;
        }
        if (line[columnl] === '\t') {
            columnr -= 7;
        }
        columnl += 1;
    }
    return new atom_1.Point(point.row, columnr);
}
exports.tabUnshiftForPoint = tabUnshiftForPoint;
function tabUnshiftForRange(buffer, range) {
    const start = tabUnshiftForPoint(buffer, range.start);
    const end = tabUnshiftForPoint(buffer, range.end);
    return new atom_1.Range(start, end);
}
exports.tabUnshiftForRange = tabUnshiftForRange;
function isUpperCase(ch) {
    return ch.toUpperCase() === ch;
}
exports.isUpperCase = isUpperCase;
function getErrorDetail({ err, runArgs, caps }) {
    return `caps:
${JSON.stringify(caps, undefined, 2)}
Args:
${JSON.stringify(runArgs, undefined, 2)}
message:
${err.message}
log:
${getDebugLog()}`;
}
exports.getErrorDetail = getErrorDetail;
function formatError({ err, runArgs }) {
    if (err.name === 'InteractiveActionTimeout' && runArgs) {
        return `\
Haskell-ghc-mod: ghc-mod \
${runArgs.interactive ? 'interactive ' : ''}command ${runArgs.command} \
timed out. You can try to fix it by raising 'Interactive Action \
Timeout' setting in haskell-ghc-mod settings.`;
    }
    else if (runArgs) {
        return `\
Haskell-ghc-mod: ghc-mod \
${runArgs.interactive ? 'interactive ' : ''}command ${runArgs.command} \
failed with error ${err.name}`;
    }
    else {
        return `There was an unexpected error ${err.name}`;
    }
}
exports.formatError = formatError;
function defaultErrorHandler(args) {
    const { err, runArgs, caps } = args;
    const suppressErrors = runArgs && runArgs.suppressErrors;
    if (!suppressErrors) {
        atom.notifications.addError(formatError(args), {
            detail: getErrorDetail(args),
            stack: err.stack,
            dismissable: true,
        });
    }
    else {
        error(caps, runArgs, err);
    }
}
exports.defaultErrorHandler = defaultErrorHandler;
function warnGHCPackagePath() {
    atom.notifications.addWarning('haskell-ghc-mod: You have GHC_PACKAGE_PATH environment variable set!', {
        dismissable: true,
        detail: `\
This configuration is not supported, and can break arbitrarily. You can try to band-aid it by adding

delete process.env.GHC_PACKAGE_PATH

to your Atom init script (Edit → Init Script...)

You can suppress this warning in haskell-ghc-mod settings.`,
    });
}
exports.warnGHCPackagePath = warnGHCPackagePath;
function filterEnv(env) {
    const fenv = {};
    for (const evar in env) {
        const evarU = evar.toUpperCase();
        if (evarU === 'PATH' ||
            evarU.startsWith('GHC_') ||
            evarU.startsWith('STACK_') ||
            evarU.startsWith('CABAL_')) {
            fenv[evar] = env[evar];
        }
    }
    return fenv;
}
function notifySpawnFail(args) {
    if (spawnFailENOENT(args) || spawnFailEACCESS(args))
        return;
    const debugInfo = Object.assign({}, args);
    if (args.opts) {
        const optsclone = Object.assign({}, args.opts);
        optsclone.env = filterEnv(optsclone.env);
        debugInfo.opts = optsclone;
    }
    atom.notifications.addFatalError(`Haskell-ghc-mod: ghc-mod failed to launch.
It is probably missing or misconfigured. ${args.err.code}`, {
        detail: `\
Error was: ${debugInfo.err.name}
${debugInfo.err.message}
Debug information:
${JSON.stringify(debugInfo, undefined, 2)}
Config:
${JSON.stringify(atom.config.get('haskell-ghc-mod'), undefined, 2)}
Environment (filtered):
${JSON.stringify(filterEnv(process.env), undefined, 2)}
`,
        stack: debugInfo.err.stack,
        dismissable: true,
    });
}
exports.notifySpawnFail = notifySpawnFail;
function spawnFailENOENT(args) {
    if (args.err.code === 'ENOENT') {
        const exePath = atom.config.get('haskell-ghc-mod.ghcModPath');
        const not = atom.notifications.addError(`Atom couldn't find ghc-mod executable`, {
            detail: `Atom tried to find ${exePath} in "${args.opts &&
                args.opts.env.PATH}" but failed.`,
            dismissable: true,
            buttons: [
                {
                    className: 'icon-globe',
                    text: 'Open installation guide',
                    async onDidClick() {
                        const opener = await Promise.resolve().then(() => require('opener'));
                        not.dismiss();
                        opener('https://atom-haskell.github.io/installation/installing-binary-dependencies/');
                    },
                },
            ],
        });
        return true;
    }
    return false;
}
function spawnFailEACCESS(args) {
    if (args.err.code === 'EACCES') {
        const exePath = atom.config.get('haskell-ghc-mod.ghcModPath');
        const isDir = FS.existsSync(exePath) && FS.statSync(exePath).isDirectory();
        if (isDir) {
            atom.notifications.addError(`Atom couldn't run ghc-mod executable`, {
                detail: `Atom tried to run ${exePath} but it was a directory. Check haskell-ghc-mod package settings.`,
                dismissable: true,
            });
        }
        else {
            atom.notifications.addError(`Atom couldn't run ghc-mod executable`, {
                detail: `Atom tried to run ${exePath} but it wasn't executable. Check access rights.`,
                dismissable: true,
            });
        }
        return true;
    }
    return false;
}
function handleException(_target, _key, desc) {
    return Object.assign({}, desc, { async value(...args) {
            try {
                return await desc.value.call(this, ...args);
            }
            catch (e) {
                debug(e);
                const upi = await this.upi;
                upi.setStatus({
                    status: 'warning',
                    detail: e.toString(),
                });
                return new Promise(() => {
                });
            }
        } });
}
exports.handleException = handleException;
function versAtLeast(vers, b) {
    for (let i = 0; i < b.length; i++) {
        const v = b[i];
        const t = vers[i];
        const vv = t !== undefined ? t : 0;
        if (vv > v) {
            return true;
        }
        else if (vv < v) {
            return false;
        }
    }
    return true;
}
exports.versAtLeast = versAtLeast;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidXRpbC5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uL3NyYy91dGlsLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7O0FBQUEsK0JBQTJEO0FBQzNELCtCQUE4QztBQUM5Qyw2QkFBNEI7QUFDNUIseUJBQXdCO0FBQ3hCLG9DQUFtQztBQUNuQywyQkFBd0I7QUFDeEIsMkRBQWdGO0FBT3ZFLDZCQVBBLHVDQUFrQixDQU9BO0FBQUUscUJBUEEsK0JBQVUsQ0FPQTtBQUFFLHNCQVBBLGdDQUFXLENBT0E7QUFFcEQsSUFBSSxRQUFRLEdBQXFELEVBQUUsQ0FBQTtBQUNuRSxNQUFNLE9BQU8sR0FBRyxLQUFLLENBQUE7QUFFckIsU0FBUyxPQUFPLENBQUMsR0FBRyxRQUFrQjtJQUNwQyxNQUFNLEVBQUUsR0FBRyxJQUFJLENBQUMsR0FBRyxFQUFFLENBQUE7SUFDckIsUUFBUSxDQUFDLElBQUksQ0FBQztRQUNaLFNBQVMsRUFBRSxFQUFFO1FBQ2IsUUFBUTtLQUNULENBQUMsQ0FBQTtJQUNGLElBQUksRUFBRSxHQUFHLENBQUMsQ0FBQTtJQUNWLEtBQUssTUFBTSxDQUFDLElBQUksUUFBUSxFQUFFO1FBQ3hCLElBQUksRUFBRSxHQUFHLENBQUMsQ0FBQyxTQUFTLElBQUksT0FBTyxFQUFFO1lBQy9CLE1BQUs7U0FDTjtRQUNELEVBQUUsRUFBRSxDQUFBO0tBQ0w7SUFDRCxRQUFRLENBQUMsTUFBTSxDQUFDLENBQUMsRUFBRSxFQUFFLENBQUMsQ0FBQTtBQUN4QixDQUFDO0FBRUQsU0FBUyxRQUFRLENBQUMsRUFBWTtJQUM1QixNQUFNLEdBQUcsR0FBRyxJQUFJLEdBQUcsQ0FBQyxFQUFFLENBQUMsQ0FBQTtJQUN2QixPQUFPLEtBQUssQ0FBQyxJQUFJLENBQUMsR0FBRyxDQUFDLENBQUMsSUFBSSxDQUFDLGdCQUFTLENBQUMsQ0FBQTtBQUN4QyxDQUFDO0FBRVksUUFBQSxHQUFHLEdBQUcsR0FBRyxRQUFHLE9BQU8sUUFBRyxFQUFFLENBQUE7QUFF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UUFDakIsTUFBTSxFQUFFLEdBQUcsQ0FBQyxLQUFLLFNBQVMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUE7UUFDbEMsSUFBSSxFQUFFLEdBQUcsQ0FBQyxFQUFFO1lBQ1YsT0FBTyxJQUFJLENBQUE7U0FDWjthQUFNLElBQUksRUFBRSxHQUFHLENBQUMsRUFBRTtZQUNqQixPQUFPLEtBQUssQ0FBQTtTQUNiO0tBQ0Y7SUFDRCxPQUFPLElBQUksQ0FBQTtBQUNiLENBQUM7QUFmRCxrQ0FlQyIsInNvdXJjZXNDb250ZW50IjpbImltcG9ydCB7IFJhbmdlLCBQb2ludCwgVGV4dEJ1ZmZlciwgVGV4dEVkaXRvciB9IGZyb20gJ2F0b20nXG5pbXBvcnQgeyBkZWxpbWl0ZXIsIHNlcCwgZXh0bmFtZSB9IGZyb20gJ3BhdGgnXG5pbXBvcnQgKiBhcyBUZW1wIGZyb20gJ3RlbXAnXG5pbXBvcnQgKiBhcyBGUyBmcm9tICdmcydcbmltcG9ydCAqIGFzIENQIGZyb20gJ2NoaWxkX3Byb2Nlc3MnXG5pbXBvcnQgeyBFT0wgfSBmcm9tICdvcydcbmltcG9ydCB7IGdldFJvb3REaXJGYWxsYmFjaywgZ2V0Um9vdERpciwgaXNEaXJlY3RvcnkgfSBmcm9tICdhdG9tLWhhc2tlbGwtdXRpbHMnXG5pbXBvcnQgeyBSdW5PcHRpb25zLCBJRXJyb3JDYWxsYmFja0FyZ3MgfSBmcm9tICcuL2doYy1tb2QvZ2hjLW1vZGktcHJvY2Vzcy1yZWFsJ1xuaW1wb3J0IHsgR0hDTW9kVmVycyB9IGZyb20gJy4vZ2hjLW1vZC9naGMtbW9kaS1wcm9jZXNzLXJlYWwtZmFjdG9yeSdcbmltcG9ydCB7IEdIQ01vZENhcHMgfSBmcm9tICcuL2doYy1tb2QvaW50ZXJhY3RpdmUtcHJvY2VzcydcbmltcG9ydCAqIGFzIFVQSSBmcm9tICdhdG9tLWhhc2tlbGwtdXBpJ1xuXG50eXBlIEV4ZWNPcHRzID0gQ1AuRXhlY0ZpbGVPcHRpb25zV2l0aFN0cmluZ0VuY29kaW5nXG5leHBvcnQgeyBnZXRSb290RGlyRmFsbGJhY2ssIGdldFJvb3REaXIsIGlzRGlyZWN0b3J5LCBFeGVjT3B0cyB9XG5cbmxldCBkZWJ1Z2xvZzogQXJyYXk8eyB0aW1lc3RhbXA6IG51bWJlcjsgbWVzc2FnZXM6IHN0cmluZ1tdIH0+ID0gW11cbmNvbnN0IGxvZ0tlZXAgPSAzMDAwMCAvLyBtc1xuXG5mdW5jdGlvbiBzYXZlbG9nKC4uLm1lc3NhZ2VzOiBzdHJpbmdbXSkge1xuICBjb25zdCB0cyA9IERhdGUubm93KClcbiAgZGVidWdsb2cucHVzaCh7XG4gICAgdGltZXN0YW1wOiB0cyxcbiAgICBtZXNzYWdlcyxcbiAgfSlcbiAgbGV0IGtzID0gMFxuICBmb3IgKGNvbnN0IHYgb2YgZGVidWdsb2cpIHtcbiAgICBpZiAodHMgLSB2LnRpbWVzdGFtcCA+PSBsb2dLZWVwKSB7XG4gICAgICBicmVha1xuICAgIH1cbiAgICBrcysrXG4gIH1cbiAgZGVidWdsb2cuc3BsaWNlKDAsIGtzKVxufVxuXG5mdW5jdGlvbiBqb2luUGF0aChkczogc3RyaW5nW10pIHtcbiAgY29uc3Qgc2V0ID0gbmV3IFNldChkcylcbiAgcmV0dXJuIEFycmF5LmZyb20oc2V0KS5qb2luKGRlbGltaXRlcilcbn1cblxuZXhwb3J0IGNvbnN0IEVPVCA9IGAke0VPTH1cXHgwNCR7RU9MfWBcblxuZXhwb3J0IGZ1bmN0aW9uIGRlYnVnKC4uLm1lc3NhZ2VzOiBhbnlbXSkge1xuICBpZiAoYXRvbS5jb25maWcuZ2V0KCdoYXNrZWxsLWdoYy1tb2QuZGVidWcnKSkge1xuICAgIC8vIHRzbGludDpkaXNhYmxlLW5leHQtbGluZTogbm8tY29uc29sZVxuICAgIGNvbnNvbGUubG9nKCdoYXNrZWxsLWdoYy1tb2QgZGVidWc6JywgLi4ubWVzc2FnZXMpXG4gIH1cbiAgc2F2ZWxvZyguLi5tZXNzYWdlcy5tYXAoKHYpID0+IEpTT04uc3RyaW5naWZ5KHYpKSlcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIHdhcm4oLi4ubWVzc2FnZXM6IGFueVtdKSB7XG4gIC8vIHRzbGludDpkaXNhYmxlLW5leHQtbGluZTogbm8tY29uc29sZVxuICBjb25zb2xlLndhcm4oJ2hhc2tlbGwtZ2hjLW1vZCB3YXJuaW5nOicsIC4uLm1lc3NhZ2VzKVxuICBzYXZlbG9nKC4uLm1lc3NhZ2VzLm1hcCgodikgPT4gSlNPTi5zdHJpbmdpZnkodikpKVxufVxuXG5leHBvcnQgZnVuY3Rpb24gZXJyb3IoLi4ubWVzc2FnZXM6IGFueVtdKSB7XG4gIC8vIHRzbGludDpkaXNhYmxlLW5leHQtbGluZTogbm8tY29uc29sZVxuICBjb25zb2xlLmVycm9yKCdoYXNrZWxsLWdoYy1tb2QgZXJyb3I6JywgLi4ubWVzc2FnZXMpXG4gIHNhdmVsb2coLi4ubWVzc2FnZXMubWFwKCh2KSA9PiBKU09OLnN0cmluZ2lmeSh2KSkpXG59XG5cbmV4cG9ydCBmdW5jdGlvbiBnZXREZWJ1Z0xvZygpIHtcbiAgY29uc3QgdHMgPSBEYXRlLm5vdygpXG4gIGRlYnVnbG9nID0gZGVidWdsb2cuZmlsdGVyKCh7IHRpbWVzdGFtcCB9KSA9PiB0cyAtIHRpbWVzdGFtcCA8IGxvZ0tlZXApXG4gIHJldHVybiBkZWJ1Z2xvZ1xuICAgIC5tYXAoXG4gICAgICAoeyB0aW1lc3RhbXAsIG1lc3NhZ2VzIH0pID0+XG4gICAgICAgIGAkeyh0aW1lc3RhbXAgLSB0cykgLyAxMDAwfXM6ICR7bWVzc2FnZXMuam9pbignLCcpfWAsXG4gICAgKVxuICAgIC5qb2luKEVPTClcbn1cblxuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIGV4ZWNQcm9taXNlKFxuICBjbWQ6IHN0cmluZyxcbiAgYXJnczogc3RyaW5nW10sXG4gIG9wdHM6IEV4ZWNPcHRzLFxuICBzdGRpbj86IHN0cmluZyxcbikge1xuICByZXR1cm4gbmV3IFByb21pc2U8eyBzdGRvdXQ6IHN0cmluZzsgc3RkZXJyOiBzdHJpbmcgfT4oKHJlc29sdmUsIHJlamVjdCkgPT4ge1xuICAgIGRlYnVnKGBSdW5uaW5nICR7Y21kfSAke2FyZ3N9IHdpdGggb3B0cyA9IGAsIG9wdHMpXG4gICAgY29uc3QgY2hpbGQgPSBDUC5leGVjRmlsZShcbiAgICAgIGNtZCxcbiAgICAgIGFyZ3MsXG4gICAgICBvcHRzLFxuICAgICAgKGVycm9yLCBzdGRvdXQ6IHN0cmluZywgc3RkZXJyOiBzdHJpbmcpID0+IHtcbiAgICAgICAgaWYgKHN0ZGVyci50cmltKCkubGVuZ3RoID4gMCkge1xuICAgICAgICAgIHdhcm4oc3RkZXJyKVxuICAgICAgICB9XG4gICAgICAgIGlmIChlcnJvcikge1xuICAgICAgICAgIHdhcm4oYFJ1bm5pbmcgJHtjbWR9ICR7YXJnc30gZmFpbGVkIHdpdGggYCwgZXJyb3IpXG4gICAgICAgICAgaWYgKHN0ZG91dCkge1xuICAgICAgICAgICAgd2FybihzdGRvdXQpXG4gICAgICAgICAgfVxuICAgICAgICAgIGVycm9yLnN0YWNrID0gbmV3IEVycm9yKCkuc3RhY2tcbiAgICAgICAgICByZWplY3QoZXJyb3IpXG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgZGVidWcoYEdvdCByZXNwb25zZSBmcm9tICR7Y21kfSAke2FyZ3N9YCwgeyBzdGRvdXQsIHN0ZGVyciB9KVxuICAgICAgICAgIHJlc29sdmUoeyBzdGRvdXQsIHN0ZGVyciB9KVxuICAgICAgICB9XG4gICAgICB9LFxuICAgIClcbiAgICBpZiAoc3RkaW4pIHtcbiAgICAgIGRlYnVnKGBzZW5kaW5nIHN0ZGluIHRleHQgdG8gJHtjbWR9ICR7YXJnc31gKVxuICAgICAgY2hpbGQuc3RkaW4ud3JpdGUoc3RkaW4pXG4gICAgfVxuICB9KVxufVxuXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gZ2V0Q2FiYWxTYW5kYm94KFxuICByb290UGF0aDogc3RyaW5nLFxuKTogUHJvbWlzZTxzdHJpbmcgfCB1bmRlZmluZWQ+IHtcbiAgZGVidWcoJ0xvb2tpbmcgZm9yIGNhYmFsIHNhbmRib3guLi4nKVxuICBjb25zdCBzYmMgPSBhd2FpdCBwYXJzZVNhbmRib3hDb25maWcoYCR7cm9vdFBhdGh9JHtzZXB9Y2FiYWwuc2FuZGJveC5jb25maWdgKVxuICAvLyB0c2xpbnQ6ZGlzYWJsZTogbm8tc3RyaW5nLWxpdGVyYWxcbiAgaWYgKHNiYyAmJiBzYmNbJ2luc3RhbGwtZGlycyddICYmIHNiY1snaW5zdGFsbC1kaXJzJ11bJ2JpbmRpciddKSB7XG4gICAgY29uc3Qgc2FuZGJveDogc3RyaW5nID0gc2JjWydpbnN0YWxsLWRpcnMnXVsnYmluZGlyJ11cbiAgICBkZWJ1ZygnRm91bmQgY2FiYWwgc2FuZGJveDogJywgc2FuZGJveClcbiAgICBpZiAoaXNEaXJlY3Rvcnkoc2FuZGJveCkpIHtcbiAgICAgIHJldHVybiBzYW5kYm94XG4gICAgfSBlbHNlIHtcbiAgICAgIHdhcm4oJ0NhYmFsIHNhbmRib3ggJywgc2FuZGJveCwgJyBpcyBub3QgYSBkaXJlY3RvcnknKVxuICAgICAgcmV0dXJuIHVuZGVmaW5lZFxuICAgIH1cbiAgfSBlbHNlIHtcbiAgICB3YXJuKCdObyBjYWJhbCBzYW5kYm94IGZvdW5kJylcbiAgICByZXR1cm4gdW5kZWZpbmVkXG4gIH1cbiAgLy8gdHNsaW50OmVuYWJsZTogbm8tc3RyaW5nLWxpdGVyYWxcbn1cblxuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIGdldFN0YWNrU2FuZGJveChcbiAgcm9vdFBhdGg6IHN0cmluZyxcbiAgYXBkOiBzdHJpbmdbXSxcbiAgZW52OiB7IFtrZXk6IHN0cmluZ106IHN0cmluZyB8IHVuZGVmaW5lZCB9LFxuKSB7XG4gIGRlYnVnKCdMb29raW5nIGZvciBzdGFjayBzYW5kYm94Li4uJylcbiAgZW52LlBBVEggPSBqb2luUGF0aChhcGQpXG4gIGRlYnVnKCdSdW5uaW5nIHN0YWNrIHdpdGggUEFUSCAnLCBlbnYuUEFUSClcbiAgdHJ5IHtcbiAgICBjb25zdCBvdXQgPSBhd2FpdCBleGVjUHJvbWlzZShcbiAgICAgICdzdGFjaycsXG4gICAgICBbXG4gICAgICAgICctLW5vLWluc3RhbGwtZ2hjJyxcbiAgICAgICAgJ3BhdGgnLFxuICAgICAgICAnLS1zbmFwc2hvdC1pbnN0YWxsLXJvb3QnLFxuICAgICAgICAnLS1sb2NhbC1pbnN0YWxsLXJvb3QnLFxuICAgICAgICAnLS1iaW4tcGF0aCcsXG4gICAgICBdLFxuICAgICAge1xuICAgICAgICBlbmNvZGluZzogJ3V0ZjgnLFxuICAgICAgICBjd2Q6IHJvb3RQYXRoLFxuICAgICAgICBlbnYsXG4gICAgICAgIHRpbWVvdXQ6IGF0b20uY29uZmlnLmdldCgnaGFza2VsbC1naGMtbW9kLmluaXRUaW1lb3V0JykgKiAxMDAwLFxuICAgICAgfSxcbiAgICApXG5cbiAgICBjb25zdCBsaW5lcyA9IG91dC5zdGRvdXQuc3BsaXQoRU9MKVxuICAgIGNvbnN0IHNpciA9XG4gICAgICBsaW5lc1xuICAgICAgICAuZmlsdGVyKChsKSA9PiBsLnN0YXJ0c1dpdGgoJ3NuYXBzaG90LWluc3RhbGwtcm9vdDogJykpWzBdXG4gICAgICAgIC5zbGljZSgyMykgKyBgJHtzZXB9YmluYFxuICAgIGNvbnN0IGxpciA9XG4gICAgICBsaW5lcy5maWx0ZXIoKGwpID0+IGwuc3RhcnRzV2l0aCgnbG9jYWwtaW5zdGFsbC1yb290OiAnKSlbMF0uc2xpY2UoMjApICtcbiAgICAgIGAke3NlcH1iaW5gXG4gICAgY29uc3QgYnAgPSBsaW5lc1xuICAgICAgLmZpbHRlcigobCkgPT4gbC5zdGFydHNXaXRoKCdiaW4tcGF0aDogJykpWzBdXG4gICAgICAuc2xpY2UoMTApXG4gICAgICAuc3BsaXQoZGVsaW1pdGVyKVxuICAgICAgLmZpbHRlcigocCkgPT4gIShwID09PSBzaXIgfHwgcCA9PT0gbGlyIHx8IGFwZC5pbmNsdWRlcyhwKSkpXG4gICAgZGVidWcoJ0ZvdW5kIHN0YWNrIHNhbmRib3ggJywgbGlyLCBzaXIsIC4uLmJwKVxuICAgIHJldHVybiBbbGlyLCBzaXIsIC4uLmJwXVxuICB9IGNhdGNoIChlcnIpIHtcbiAgICB3YXJuKCdObyBzdGFjayBzYW5kYm94IGZvdW5kIGJlY2F1c2UgJywgZXJyKVxuICAgIHJldHVybiB1bmRlZmluZWRcbiAgfVxufVxuXG5jb25zdCBwcm9jZXNzT3B0aW9uc0NhY2hlID0gbmV3IE1hcDxzdHJpbmcsIFJ1bk9wdGlvbnM+KClcblxuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIGdldFByb2Nlc3NPcHRpb25zKFxuICByb290UGF0aD86IHN0cmluZyxcbik6IFByb21pc2U8UnVuT3B0aW9ucz4ge1xuICBpZiAoIXJvb3RQYXRoKSB7XG4gICAgLy8gdHNsaW50OmRpc2FibGUtbmV4dC1saW5lOiBuby1udWxsLWtleXdvcmRcbiAgICByb290UGF0aCA9IGdldFJvb3REaXJGYWxsYmFjayhudWxsKS5nZXRQYXRoKClcbiAgfVxuICAvLyBjYWNoZVxuICBjb25zdCBjYWNoZWQgPSBwcm9jZXNzT3B0aW9uc0NhY2hlLmdldChyb290UGF0aClcbiAgaWYgKGNhY2hlZCkge1xuICAgIHJldHVybiBjYWNoZWRcbiAgfVxuXG4gIGRlYnVnKGBnZXRQcm9jZXNzT3B0aW9ucygke3Jvb3RQYXRofSlgKVxuICBjb25zdCBlbnYgPSB7IC4uLnByb2Nlc3MuZW52IH1cblxuICAvLyB0c2xpbnQ6ZGlzYWJsZS1uZXh0LWxpbmU6IHRvdGFsaXR5LWNoZWNrXG4gIGlmIChwcm9jZXNzLnBsYXRmb3JtID09PSAnd2luMzInKSB7XG4gICAgY29uc3QgUEFUSCA9IFtdXG4gICAgY29uc3QgY2FwTWFzayA9IChzdHI6IHN0cmluZywgbWFzazogbnVtYmVyKSA9PiB7XG4gICAgICBjb25zdCBhID0gc3RyLnNwbGl0KCcnKVxuICAgICAgZm9yIChsZXQgaSA9IDA7IGkgPCBhLmxlbmd0aDsgaSsrKSB7XG4gICAgICAgIGlmIChtYXNrICYgTWF0aC5wb3coMiwgaSkpIHtcbiAgICAgICAgICBhW2ldID0gYVtpXS50b1VwcGVyQ2FzZSgpXG4gICAgICAgIH1cbiAgICAgIH1cbiAgICAgIHJldHVybiBhLmpvaW4oJycpXG4gICAgfVxuICAgIGZvciAobGV0IG0gPSAwYjExMTE7IG0gPj0gMDsgbS0tKSB7XG4gICAgICBjb25zdCB2biA9IGNhcE1hc2soJ3BhdGgnLCBtKVxuICAgICAgaWYgKGVudlt2bl0pIHtcbiAgICAgICAgUEFUSC5wdXNoKGVudlt2bl0pXG4gICAgICB9XG4gICAgfVxuICAgIGVudi5QQVRIID0gUEFUSC5qb2luKGRlbGltaXRlcilcbiAgfVxuXG4gIGNvbnN0IFBBVEggPSBlbnYuUEFUSCB8fCAnJ1xuXG4gIGNvbnN0IGFwZCA9IGF0b20uY29uZmlnXG4gICAgLmdldCgnaGFza2VsbC1naGMtbW9kLmFkZGl0aW9uYWxQYXRoRGlyZWN0b3JpZXMnKVxuICAgIC5jb25jYXQoUEFUSC5zcGxpdChkZWxpbWl0ZXIpKVxuICBjb25zdCBjYWJhbFNhbmRib3ggPSBhdG9tLmNvbmZpZy5nZXQoJ2hhc2tlbGwtZ2hjLW1vZC5jYWJhbFNhbmRib3gnKVxuICAgID8gZ2V0Q2FiYWxTYW5kYm94KHJvb3RQYXRoKVxuICAgIDogUHJvbWlzZS5yZXNvbHZlKHVuZGVmaW5lZClcbiAgY29uc3Qgc3RhY2tTYW5kYm94ID0gYXRvbS5jb25maWcuZ2V0KCdoYXNrZWxsLWdoYy1tb2Quc3RhY2tTYW5kYm94JylcbiAgICA/IGdldFN0YWNrU2FuZGJveChyb290UGF0aCwgYXBkLCB7IC4uLmVudiB9KVxuICAgIDogUHJvbWlzZS5yZXNvbHZlKHVuZGVmaW5lZClcbiAgY29uc3QgW2NhYmFsU2FuZGJveERpciwgc3RhY2tTYW5kYm94RGlyc10gPSBhd2FpdCBQcm9taXNlLmFsbChbXG4gICAgY2FiYWxTYW5kYm94LFxuICAgIHN0YWNrU2FuZGJveCxcbiAgXSlcbiAgY29uc3QgbmV3cCA9IFtdXG4gIGlmIChjYWJhbFNhbmRib3hEaXIpIHtcbiAgICBuZXdwLnB1c2goY2FiYWxTYW5kYm94RGlyKVxuICB9XG4gIGlmIChzdGFja1NhbmRib3hEaXJzKSB7XG4gICAgbmV3cC5wdXNoKC4uLnN0YWNrU2FuZGJveERpcnMpXG4gIH1cbiAgbmV3cC5wdXNoKC4uLmFwZClcbiAgZW52LlBBVEggPSBqb2luUGF0aChuZXdwKVxuICBkZWJ1ZyhgUEFUSCA9ICR7ZW52LlBBVEh9YClcbiAgY29uc3QgcmVzOiBSdW5PcHRpb25zID0ge1xuICAgIGN3ZDogcm9vdFBhdGgsXG4gICAgZW52LFxuICAgIGVuY29kaW5nOiAndXRmOCcsXG4gICAgbWF4QnVmZmVyOiBJbmZpbml0eSxcbiAgfVxuICBwcm9jZXNzT3B0aW9uc0NhY2hlLnNldChyb290UGF0aCwgcmVzKVxuICByZXR1cm4gcmVzXG59XG5cbmV4cG9ydCBmdW5jdGlvbiBnZXRTeW1ib2xBdFBvaW50KGVkaXRvcjogVGV4dEVkaXRvciwgcG9pbnQ6IFBvaW50KSB7XG4gIGNvbnN0IFtzY29wZV0gPSBlZGl0b3JcbiAgICAuc2NvcGVEZXNjcmlwdG9yRm9yQnVmZmVyUG9zaXRpb24ocG9pbnQpXG4gICAgLmdldFNjb3Blc0FycmF5KClcbiAgICAuc2xpY2UoLTEpXG4gIGlmIChzY29wZSkge1xuICAgIGNvbnN0IHJhbmdlID0gZWRpdG9yLmJ1ZmZlclJhbmdlRm9yU2NvcGVBdFBvc2l0aW9uKHNjb3BlLCBwb2ludClcbiAgICBpZiAocmFuZ2UgJiYgIXJhbmdlLmlzRW1wdHkoKSkge1xuICAgICAgY29uc3Qgc3ltYm9sID0gZWRpdG9yLmdldFRleHRJbkJ1ZmZlclJhbmdlKHJhbmdlKVxuICAgICAgcmV0dXJuIHsgc2NvcGUsIHJhbmdlLCBzeW1ib2wgfVxuICAgIH1cbiAgfVxuICByZXR1cm4gdW5kZWZpbmVkXG59XG5cbmV4cG9ydCBmdW5jdGlvbiBnZXRTeW1ib2xJblJhbmdlKGVkaXRvcjogVGV4dEVkaXRvciwgY3JhbmdlOiBSYW5nZSkge1xuICBjb25zdCBidWZmZXIgPSBlZGl0b3IuZ2V0QnVmZmVyKClcbiAgaWYgKGNyYW5nZS5pc0VtcHR5KCkpIHtcbiAgICByZXR1cm4gZ2V0U3ltYm9sQXRQb2ludChlZGl0b3IsIGNyYW5nZS5zdGFydClcbiAgfSBlbHNlIHtcbiAgICByZXR1cm4ge1xuICAgICAgc3ltYm9sOiBidWZmZXIuZ2V0VGV4dEluUmFuZ2UoY3JhbmdlKSxcbiAgICAgIHJhbmdlOiBjcmFuZ2UsXG4gICAgfVxuICB9XG59XG5cbmV4cG9ydCBhc3luYyBmdW5jdGlvbiB3aXRoVGVtcEZpbGU8VD4oXG4gIGNvbnRlbnRzOiBzdHJpbmcsXG4gIHVyaTogc3RyaW5nLFxuICBnZW46IChwYXRoOiBzdHJpbmcpID0+IFByb21pc2U8VD4sXG4pOiBQcm9taXNlPFQ+IHtcbiAgY29uc3QgaW5mbyA9IGF3YWl0IG5ldyBQcm9taXNlPFRlbXAuT3BlbkZpbGU+KChyZXNvbHZlLCByZWplY3QpID0+XG4gICAgVGVtcC5vcGVuKFxuICAgICAgeyBwcmVmaXg6ICdoYXNrZWxsLWdoYy1tb2QnLCBzdWZmaXg6IGV4dG5hbWUodXJpIHx8ICcuaHMnKSB9LFxuICAgICAgKGVyciwgaW5mbzIpID0+IHtcbiAgICAgICAgaWYgKGVycikge1xuICAgICAgICAgIHJlamVjdChlcnIpXG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgcmVzb2x2ZShpbmZvMilcbiAgICAgICAgfVxuICAgICAgfSxcbiAgICApLFxuICApXG4gIHJldHVybiBuZXcgUHJvbWlzZTxUPigocmVzb2x2ZSwgcmVqZWN0KSA9PlxuICAgIEZTLndyaXRlKGluZm8uZmQsIGNvbnRlbnRzLCBhc3luYyAoZXJyKSA9PiB7XG4gICAgICBpZiAoZXJyKSB7XG4gICAgICAgIHJlamVjdChlcnIpXG4gICAgICB9IGVsc2Uge1xuICAgICAgICByZXNvbHZlKGF3YWl0IGdlbihpbmZvLnBhdGgpKVxuICAgICAgICBGUy5jbG9zZShpbmZvLmZkLCAoKSA9PlxuICAgICAgICAgIEZTLnVubGluayhpbmZvLnBhdGgsICgpID0+IHtcbiAgICAgICAgICAgIC8qbm9vcCovXG4gICAgICAgICAgfSksXG4gICAgICAgIClcbiAgICAgIH1cbiAgICB9KSxcbiAgKVxufVxuXG5leHBvcnQgdHlwZSBLbm93bkVycm9yTmFtZSA9XG4gIHwgJ0dIQ01vZFN0ZG91dEVycm9yJ1xuICB8ICdJbnRlcmFjdGl2ZUFjdGlvblRpbWVvdXQnXG4gIHwgJ0dIQ01vZEludGVyYWN0aXZlQ3Jhc2gnXG5cbmV4cG9ydCBmdW5jdGlvbiBta0Vycm9yKG5hbWU6IEtub3duRXJyb3JOYW1lLCBtZXNzYWdlOiBzdHJpbmcpIHtcbiAgY29uc3QgZXJyID0gbmV3IEVycm9yKG1lc3NhZ2UpXG4gIGVyci5uYW1lID0gbmFtZVxuICByZXR1cm4gZXJyXG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgU2FuZGJveENvbmZpZ1RyZWUge1xuICBbazogc3RyaW5nXTogU2FuZGJveENvbmZpZ1RyZWUgfCBzdHJpbmdcbn1cblxuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIHBhcnNlU2FuZGJveENvbmZpZyhmaWxlOiBzdHJpbmcpIHtcbiAgdHJ5IHtcbiAgICBjb25zdCBzYmMgPSBhd2FpdCBuZXcgUHJvbWlzZTxzdHJpbmc+KChyZXNvbHZlLCByZWplY3QpID0+XG4gICAgICBGUy5yZWFkRmlsZShmaWxlLCB7IGVuY29kaW5nOiAndXRmLTgnIH0sIChlcnIsIHNiYzIpID0+IHtcbiAgICAgICAgaWYgKGVycikge1xuICAgICAgICAgIHJlamVjdChlcnIpXG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgcmVzb2x2ZShzYmMyKVxuICAgICAgICB9XG4gICAgICB9KSxcbiAgICApXG4gICAgY29uc3QgdmFyczogU2FuZGJveENvbmZpZ1RyZWUgPSB7fVxuICAgIGxldCBzY29wZSA9IHZhcnNcbiAgICBjb25zdCBydiA9ICh2OiBzdHJpbmcpID0+IHtcbiAgICAgIGZvciAoY29uc3QgazEgb2YgT2JqZWN0LmtleXMoc2NvcGUpKSB7XG4gICAgICAgIGNvbnN0IHYxID0gc2NvcGVbazFdXG4gICAgICAgIGlmICh0eXBlb2YgdjEgPT09ICdzdHJpbmcnKSB7XG4gICAgICAgICAgdiA9IHYuc3BsaXQoYCQke2sxfWApLmpvaW4odjEpXG4gICAgICAgIH1cbiAgICAgIH1cbiAgICAgIHJldHVybiB2XG4gICAgfVxuICAgIGZvciAoY29uc3QgbGluZSBvZiBzYmMuc3BsaXQoL1xccj9cXG58XFxyLykpIHtcbiAgICAgIGlmICghbGluZS5tYXRjaCgvXlxccyotLS8pICYmICFsaW5lLm1hdGNoKC9eXFxzKiQvKSkge1xuICAgICAgICBjb25zdCBbbF0gPSBsaW5lLnNwbGl0KC8tLS8pXG4gICAgICAgIGNvbnN0IG0gPSBsLm1hdGNoKC9eXFxzKihbXFx3LV0rKTpcXHMqKC4qKVxccyokLylcbiAgICAgICAgaWYgKG0pIHtcbiAgICAgICAgICBjb25zdCBbLCBuYW1lLCB2YWxdID0gbVxuICAgICAgICAgIHNjb3BlW25hbWVdID0gcnYodmFsKVxuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIGNvbnN0IG5ld3Njb3BlID0ge31cbiAgICAgICAgICBzY29wZVtsaW5lXSA9IG5ld3Njb3BlXG4gICAgICAgICAgc2NvcGUgPSBuZXdzY29wZVxuICAgICAgICB9XG4gICAgICB9XG4gICAgfVxuICAgIHJldHVybiB2YXJzXG4gIH0gY2F0Y2ggKGVycikge1xuICAgIHdhcm4oJ1JlYWRpbmcgY2FiYWwgc2FuZGJveCBjb25maWcgZmFpbGVkIHdpdGggJywgZXJyKVxuICAgIHJldHVybiB1bmRlZmluZWRcbiAgfVxufVxuXG4vLyBBIGRpcnR5IGhhY2sgdG8gd29yayB3aXRoIHRhYnNcbmV4cG9ydCBmdW5jdGlvbiB0YWJTaGlmdEZvclBvaW50KGJ1ZmZlcjogVGV4dEJ1ZmZlciwgcG9pbnQ6IFBvaW50KSB7XG4gIGNvbnN0IGxpbmUgPSBidWZmZXIubGluZUZvclJvdyhwb2ludC5yb3cpXG4gIGNvbnN0IG1hdGNoID0gbGluZSA/IGxpbmUuc2xpY2UoMCwgcG9pbnQuY29sdW1uKS5tYXRjaCgvXFx0L2cpIHx8IFtdIDogW11cbiAgY29uc3QgY29sdW1uU2hpZnQgPSA3ICogbWF0Y2gubGVuZ3RoXG4gIHJldHVybiBuZXcgUG9pbnQocG9pbnQucm93LCBwb2ludC5jb2x1bW4gKyBjb2x1bW5TaGlmdClcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIHRhYlNoaWZ0Rm9yUmFuZ2UoYnVmZmVyOiBUZXh0QnVmZmVyLCByYW5nZTogUmFuZ2UpIHtcbiAgY29uc3Qgc3RhcnQgPSB0YWJTaGlmdEZvclBvaW50KGJ1ZmZlciwgcmFuZ2Uuc3RhcnQpXG4gIGNvbnN0IGVuZCA9IHRhYlNoaWZ0Rm9yUG9pbnQoYnVmZmVyLCByYW5nZS5lbmQpXG4gIHJldHVybiBuZXcgUmFuZ2Uoc3RhcnQsIGVuZClcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIHRhYlVuc2hpZnRGb3JQb2ludChidWZmZXI6IFRleHRCdWZmZXIsIHBvaW50OiBQb2ludCkge1xuICBjb25zdCBsaW5lID0gYnVmZmVyLmxpbmVGb3JSb3cocG9pbnQucm93KVxuICBsZXQgY29sdW1ubCA9IDBcbiAgbGV0IGNvbHVtbnIgPSBwb2ludC5jb2x1bW5cbiAgd2hpbGUgKGNvbHVtbmwgPCBjb2x1bW5yKSB7XG4gICAgLy8gdHNsaW50OmRpc2FibGUtbmV4dC1saW5lOiBzdHJpY3QtdHlwZS1wcmVkaWNhdGVzXG4gICAgaWYgKGxpbmUgPT09IHVuZGVmaW5lZCB8fCBsaW5lW2NvbHVtbmxdID09PSB1bmRlZmluZWQpIHtcbiAgICAgIGJyZWFrXG4gICAgfVxuICAgIGlmIChsaW5lW2NvbHVtbmxdID09PSAnXFx0Jykge1xuICAgICAgY29sdW1uciAtPSA3XG4gICAgfVxuICAgIGNvbHVtbmwgKz0gMVxuICB9XG4gIHJldHVybiBuZXcgUG9pbnQocG9pbnQucm93LCBjb2x1bW5yKVxufVxuXG5leHBvcnQgZnVuY3Rpb24gdGFiVW5zaGlmdEZvclJhbmdlKGJ1ZmZlcjogVGV4dEJ1ZmZlciwgcmFuZ2U6IFJhbmdlKSB7XG4gIGNvbnN0IHN0YXJ0ID0gdGFiVW5zaGlmdEZvclBvaW50KGJ1ZmZlciwgcmFuZ2Uuc3RhcnQpXG4gIGNvbnN0IGVuZCA9IHRhYlVuc2hpZnRGb3JQb2ludChidWZmZXIsIHJhbmdlLmVuZClcbiAgcmV0dXJuIG5ldyBSYW5nZShzdGFydCwgZW5kKVxufVxuXG5leHBvcnQgZnVuY3Rpb24gaXNVcHBlckNhc2UoY2g6IHN0cmluZyk6IGJvb2xlYW4ge1xuICByZXR1cm4gY2gudG9VcHBlckNhc2UoKSA9PT0gY2hcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGdldEVycm9yRGV0YWlsKHsgZXJyLCBydW5BcmdzLCBjYXBzIH06IElFcnJvckNhbGxiYWNrQXJncykge1xuICByZXR1cm4gYGNhcHM6XG4ke0pTT04uc3RyaW5naWZ5KGNhcHMsIHVuZGVmaW5lZCwgMil9XG5BcmdzOlxuJHtKU09OLnN0cmluZ2lmeShydW5BcmdzLCB1bmRlZmluZWQsIDIpfVxubWVzc2FnZTpcbiR7ZXJyLm1lc3NhZ2V9XG5sb2c6XG4ke2dldERlYnVnTG9nKCl9YFxufVxuXG5leHBvcnQgZnVuY3Rpb24gZm9ybWF0RXJyb3IoeyBlcnIsIHJ1bkFyZ3MgfTogSUVycm9yQ2FsbGJhY2tBcmdzKSB7XG4gIGlmIChlcnIubmFtZSA9PT0gJ0ludGVyYWN0aXZlQWN0aW9uVGltZW91dCcgJiYgcnVuQXJncykge1xuICAgIHJldHVybiBgXFxcbkhhc2tlbGwtZ2hjLW1vZDogZ2hjLW1vZCBcXFxuJHtydW5BcmdzLmludGVyYWN0aXZlID8gJ2ludGVyYWN0aXZlICcgOiAnJ31jb21tYW5kICR7cnVuQXJncy5jb21tYW5kfSBcXFxudGltZWQgb3V0LiBZb3UgY2FuIHRyeSB0byBmaXggaXQgYnkgcmFpc2luZyAnSW50ZXJhY3RpdmUgQWN0aW9uIFxcXG5UaW1lb3V0JyBzZXR0aW5nIGluIGhhc2tlbGwtZ2hjLW1vZCBzZXR0aW5ncy5gXG4gIH0gZWxzZSBpZiAocnVuQXJncykge1xuICAgIHJldHVybiBgXFxcbkhhc2tlbGwtZ2hjLW1vZDogZ2hjLW1vZCBcXFxuJHtydW5BcmdzLmludGVyYWN0aXZlID8gJ2ludGVyYWN0aXZlICcgOiAnJ31jb21tYW5kICR7cnVuQXJncy5jb21tYW5kfSBcXFxuZmFpbGVkIHdpdGggZXJyb3IgJHtlcnIubmFtZX1gXG4gIH0gZWxzZSB7XG4gICAgcmV0dXJuIGBUaGVyZSB3YXMgYW4gdW5leHBlY3RlZCBlcnJvciAke2Vyci5uYW1lfWBcbiAgfVxufVxuXG5leHBvcnQgZnVuY3Rpb24gZGVmYXVsdEVycm9ySGFuZGxlcihhcmdzOiBJRXJyb3JDYWxsYmFja0FyZ3MpIHtcbiAgY29uc3QgeyBlcnIsIHJ1bkFyZ3MsIGNhcHMgfSA9IGFyZ3NcbiAgY29uc3Qgc3VwcHJlc3NFcnJvcnMgPSBydW5BcmdzICYmIHJ1bkFyZ3Muc3VwcHJlc3NFcnJvcnNcblxuICBpZiAoIXN1cHByZXNzRXJyb3JzKSB7XG4gICAgYXRvbS5ub3RpZmljYXRpb25zLmFkZEVycm9yKGZvcm1hdEVycm9yKGFyZ3MpLCB7XG4gICAgICBkZXRhaWw6IGdldEVycm9yRGV0YWlsKGFyZ3MpLFxuICAgICAgc3RhY2s6IGVyci5zdGFjayxcbiAgICAgIGRpc21pc3NhYmxlOiB0cnVlLFxuICAgIH0pXG4gIH0gZWxzZSB7XG4gICAgZXJyb3IoY2FwcywgcnVuQXJncywgZXJyKVxuICB9XG59XG5cbmV4cG9ydCBmdW5jdGlvbiB3YXJuR0hDUGFja2FnZVBhdGgoKSB7XG4gIGF0b20ubm90aWZpY2F0aW9ucy5hZGRXYXJuaW5nKFxuICAgICdoYXNrZWxsLWdoYy1tb2Q6IFlvdSBoYXZlIEdIQ19QQUNLQUdFX1BBVEggZW52aXJvbm1lbnQgdmFyaWFibGUgc2V0IScsXG4gICAge1xuICAgICAgZGlzbWlzc2FibGU6IHRydWUsXG4gICAgICBkZXRhaWw6IGBcXFxuVGhpcyBjb25maWd1cmF0aW9uIGlzIG5vdCBzdXBwb3J0ZWQsIGFuZCBjYW4gYnJlYWsgYXJiaXRyYXJpbHkuIFlvdSBjYW4gdHJ5IHRvIGJhbmQtYWlkIGl0IGJ5IGFkZGluZ1xuXG5kZWxldGUgcHJvY2Vzcy5lbnYuR0hDX1BBQ0tBR0VfUEFUSFxuXG50byB5b3VyIEF0b20gaW5pdCBzY3JpcHQgKEVkaXQg4oaSIEluaXQgU2NyaXB0Li4uKVxuXG5Zb3UgY2FuIHN1cHByZXNzIHRoaXMgd2FybmluZyBpbiBoYXNrZWxsLWdoYy1tb2Qgc2V0dGluZ3MuYCxcbiAgICB9LFxuICApXG59XG5cbmZ1bmN0aW9uIGZpbHRlckVudihlbnY6IHsgW25hbWU6IHN0cmluZ106IHN0cmluZyB8IHVuZGVmaW5lZCB9KSB7XG4gIGNvbnN0IGZlbnYgPSB7fVxuICAvLyB0c2xpbnQ6ZGlzYWJsZS1uZXh0LWxpbmU6IGZvcmluXG4gIGZvciAoY29uc3QgZXZhciBpbiBlbnYpIHtcbiAgICBjb25zdCBldmFyVSA9IGV2YXIudG9VcHBlckNhc2UoKVxuICAgIGlmIChcbiAgICAgIGV2YXJVID09PSAnUEFUSCcgfHxcbiAgICAgIGV2YXJVLnN0YXJ0c1dpdGgoJ0dIQ18nKSB8fFxuICAgICAgZXZhclUuc3RhcnRzV2l0aCgnU1RBQ0tfJykgfHxcbiAgICAgIGV2YXJVLnN0YXJ0c1dpdGgoJ0NBQkFMXycpXG4gICAgKSB7XG4gICAgICBmZW52W2V2YXJdID0gZW52W2V2YXJdXG4gICAgfVxuICB9XG4gIHJldHVybiBmZW52XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgU3Bhd25GYWlsQXJncyB7XG4gIGRpcjogc3RyaW5nXG4gIGVycjogRXJyb3IgJiB7IGNvZGU/OiBhbnkgfVxuICBvcHRzPzogUnVuT3B0aW9uc1xuICB2ZXJzPzogR0hDTW9kVmVyc1xuICBjYXBzPzogR0hDTW9kQ2Fwc1xufVxuXG5leHBvcnQgZnVuY3Rpb24gbm90aWZ5U3Bhd25GYWlsKGFyZ3M6IFJlYWRvbmx5PFNwYXduRmFpbEFyZ3M+KSB7XG4gIGlmIChzcGF3bkZhaWxFTk9FTlQoYXJncykgfHwgc3Bhd25GYWlsRUFDQ0VTUyhhcmdzKSkgcmV0dXJuXG4gIGNvbnN0IGRlYnVnSW5mbzogU3Bhd25GYWlsQXJncyA9IE9iamVjdC5hc3NpZ24oe30sIGFyZ3MpXG4gIGlmIChhcmdzLm9wdHMpIHtcbiAgICBjb25zdCBvcHRzY2xvbmU6IFJ1bk9wdGlvbnMgPSBPYmplY3QuYXNzaWduKHt9LCBhcmdzLm9wdHMpXG4gICAgb3B0c2Nsb25lLmVudiA9IGZpbHRlckVudihvcHRzY2xvbmUuZW52KVxuICAgIGRlYnVnSW5mby5vcHRzID0gb3B0c2Nsb25lXG4gIH1cbiAgYXRvbS5ub3RpZmljYXRpb25zLmFkZEZhdGFsRXJyb3IoXG4gICAgYEhhc2tlbGwtZ2hjLW1vZDogZ2hjLW1vZCBmYWlsZWQgdG8gbGF1bmNoLlxuSXQgaXMgcHJvYmFibHkgbWlzc2luZyBvciBtaXNjb25maWd1cmVkLiAke2FyZ3MuZXJyLmNvZGV9YCxcbiAgICB7XG4gICAgICBkZXRhaWw6IGBcXFxuRXJyb3Igd2FzOiAke2RlYnVnSW5mby5lcnIubmFtZX1cbiR7ZGVidWdJbmZvLmVyci5tZXNzYWdlfVxuRGVidWcgaW5mb3JtYXRpb246XG4ke0pTT04uc3RyaW5naWZ5KGRlYnVnSW5mbywgdW5kZWZpbmVkLCAyKX1cbkNvbmZpZzpcbiR7SlNPTi5zdHJpbmdpZnkoYXRvbS5jb25maWcuZ2V0KCdoYXNrZWxsLWdoYy1tb2QnKSwgdW5kZWZpbmVkLCAyKX1cbkVudmlyb25tZW50IChmaWx0ZXJlZCk6XG4ke0pTT04uc3RyaW5naWZ5KGZpbHRlckVudihwcm9jZXNzLmVudiksIHVuZGVmaW5lZCwgMil9XG5gLFxuICAgICAgc3RhY2s6IGRlYnVnSW5mby5lcnIuc3RhY2ssXG4gICAgICBkaXNtaXNzYWJsZTogdHJ1ZSxcbiAgICB9LFxuICApXG59XG5cbmZ1bmN0aW9uIHNwYXduRmFpbEVOT0VOVChhcmdzOiBSZWFkb25seTxTcGF3bkZhaWxBcmdzPik6IGJvb2xlYW4ge1xuICBpZiAoYXJncy5lcnIuY29kZSA9PT0gJ0VOT0VOVCcpIHtcbiAgICBjb25zdCBleGVQYXRoID0gYXRvbS5jb25maWcuZ2V0KCdoYXNrZWxsLWdoYy1tb2QuZ2hjTW9kUGF0aCcpXG4gICAgY29uc3Qgbm90ID0gYXRvbS5ub3RpZmljYXRpb25zLmFkZEVycm9yKFxuICAgICAgYEF0b20gY291bGRuJ3QgZmluZCBnaGMtbW9kIGV4ZWN1dGFibGVgLFxuICAgICAge1xuICAgICAgICBkZXRhaWw6IGBBdG9tIHRyaWVkIHRvIGZpbmQgJHtleGVQYXRofSBpbiBcIiR7YXJncy5vcHRzICYmXG4gICAgICAgICAgYXJncy5vcHRzLmVudi5QQVRIfVwiIGJ1dCBmYWlsZWQuYCxcbiAgICAgICAgZGlzbWlzc2FibGU6IHRydWUsXG4gICAgICAgIGJ1dHRvbnM6IFtcbiAgICAgICAgICB7XG4gICAgICAgICAgICBjbGFzc05hbWU6ICdpY29uLWdsb2JlJyxcbiAgICAgICAgICAgIHRleHQ6ICdPcGVuIGluc3RhbGxhdGlvbiBndWlkZScsXG4gICAgICAgICAgICBhc3luYyBvbkRpZENsaWNrKCkge1xuICAgICAgICAgICAgICBjb25zdCBvcGVuZXIgPSBhd2FpdCBpbXBvcnQoJ29wZW5lcicpXG4gICAgICAgICAgICAgIG5vdC5kaXNtaXNzKClcbiAgICAgICAgICAgICAgb3BlbmVyKFxuICAgICAgICAgICAgICAgICdodHRwczovL2F0b20taGFza2VsbC5naXRodWIuaW8vaW5zdGFsbGF0aW9uL2luc3RhbGxpbmctYmluYXJ5LWRlcGVuZGVuY2llcy8nLFxuICAgICAgICAgICAgICApXG4gICAgICAgICAgICB9LFxuICAgICAgICAgIH0sXG4gICAgICAgIF0sXG4gICAgICB9LFxuICAgIClcbiAgICByZXR1cm4gdHJ1ZVxuICB9XG4gIHJldHVybiBmYWxzZVxufVxuXG5mdW5jdGlvbiBzcGF3bkZhaWxFQUNDRVNTKGFyZ3M6IFJlYWRvbmx5PFNwYXduRmFpbEFyZ3M+KTogYm9vbGVhbiB7XG4gIGlmIChhcmdzLmVyci5jb2RlID09PSAnRUFDQ0VTJykge1xuICAgIGNvbnN0IGV4ZVBhdGggPSBhdG9tLmNvbmZpZy5nZXQoJ2hhc2tlbGwtZ2hjLW1vZC5naGNNb2RQYXRoJylcbiAgICBjb25zdCBpc0RpciA9IEZTLmV4aXN0c1N5bmMoZXhlUGF0aCkgJiYgRlMuc3RhdFN5bmMoZXhlUGF0aCkuaXNEaXJlY3RvcnkoKVxuICAgIGlmIChpc0Rpcikge1xuICAgICAgYXRvbS5ub3RpZmljYXRpb25zLmFkZEVycm9yKGBBdG9tIGNvdWxkbid0IHJ1biBnaGMtbW9kIGV4ZWN1dGFibGVgLCB7XG4gICAgICAgIGRldGFpbDogYEF0b20gdHJpZWQgdG8gcnVuICR7ZXhlUGF0aH0gYnV0IGl0IHdhcyBhIGRpcmVjdG9yeS4gQ2hlY2sgaGFza2VsbC1naGMtbW9kIHBhY2thZ2Ugc2V0dGluZ3MuYCxcbiAgICAgICAgZGlzbWlzc2FibGU6IHRydWUsXG4gICAgICB9KVxuICAgIH0gZWxzZSB7XG4gICAgICBhdG9tLm5vdGlmaWNhdGlvbnMuYWRkRXJyb3IoYEF0b20gY291bGRuJ3QgcnVuIGdoYy1tb2QgZXhlY3V0YWJsZWAsIHtcbiAgICAgICAgZGV0YWlsOiBgQXRvbSB0cmllZCB0byBydW4gJHtleGVQYXRofSBidXQgaXQgd2Fzbid0IGV4ZWN1dGFibGUuIENoZWNrIGFjY2VzcyByaWdodHMuYCxcbiAgICAgICAgZGlzbWlzc2FibGU6IHRydWUsXG4gICAgICB9KVxuICAgIH1cbiAgICByZXR1cm4gdHJ1ZVxuICB9XG4gIHJldHVybiBmYWxzZVxufVxuXG5leHBvcnQgZnVuY3Rpb24gaGFuZGxlRXhjZXB0aW9uPFQ+KFxuICBfdGFyZ2V0OiB7IHVwaTogVVBJLklVUElJbnN0YW5jZSB8IFByb21pc2U8VVBJLklVUElJbnN0YW5jZT4gfSxcbiAgX2tleTogc3RyaW5nLFxuICBkZXNjOiBUeXBlZFByb3BlcnR5RGVzY3JpcHRvcjwoLi4uYXJnczogYW55W10pID0+IFByb21pc2U8VD4+LFxuKTogVHlwZWRQcm9wZXJ0eURlc2NyaXB0b3I8KC4uLmFyZ3M6IGFueVtdKSA9PiBQcm9taXNlPFQ+PiB7XG4gIHJldHVybiB7XG4gICAgLi4uZGVzYyxcbiAgICBhc3luYyB2YWx1ZSguLi5hcmdzOiBhbnlbXSkge1xuICAgICAgdHJ5IHtcbiAgICAgICAgLy8gdHNsaW50OmRpc2FibGUtbmV4dC1saW5lOiBuby1ub24tbnVsbC1hc3NlcnRpb25cbiAgICAgICAgcmV0dXJuIGF3YWl0IGRlc2MudmFsdWUhLmNhbGwodGhpcywgLi4uYXJncylcbiAgICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgICAgZGVidWcoZSlcbiAgICAgICAgY29uc3QgdXBpOiBVUEkuSVVQSUluc3RhbmNlID0gYXdhaXQgKHRoaXMgYXMgYW55KS51cGlcbiAgICAgICAgdXBpLnNldFN0YXR1cyh7XG4gICAgICAgICAgc3RhdHVzOiAnd2FybmluZycsXG4gICAgICAgICAgZGV0YWlsOiBlLnRvU3RyaW5nKCksXG4gICAgICAgIH0pXG4gICAgICAgIC8vIFRPRE86IHJldHVybmluZyBhIHByb21pc2UgdGhhdCBuZXZlciByZXNvbHZlcy4uLiB1Z2x5LCBidXQgd29ya3M/XG4gICAgICAgIHJldHVybiBuZXcgUHJvbWlzZSgoKSA9PiB7XG4gICAgICAgICAgLyogbm9vcCAqL1xuICAgICAgICB9KVxuICAgICAgfVxuICAgIH0sXG4gIH1cbn1cblxuZXhwb3J0IGZ1bmN0aW9uIHZlcnNBdExlYXN0KFxuICB2ZXJzOiB7IFtrZXk6IG51bWJlcl06IG51bWJlciB8IHVuZGVmaW5lZCB9LFxuICBiOiBudW1iZXJbXSxcbikge1xuICBmb3IgKGxldCBpID0gMDsgaSA8IGIubGVuZ3RoOyBpKyspIHtcbiAgICBjb25zdCB2ID0gYltpXVxuICAgIGNvbnN0IHQgPSB2ZXJzW2ldXG4gICAgY29uc3QgdnYgPSB0ICE9PSB1bmRlZmluZWQgPyB0IDogMFxuICAgIGlmICh2diA+IHYpIHtcbiAgICAgIHJldHVybiB0cnVlXG4gICAgfSBlbHNlIGlmICh2diA8IHYpIHtcbiAgICAgIHJldHVybiBmYWxzZVxuICAgIH1cbiAgfVxuICByZXR1cm4gdHJ1ZVxufVxuIl19