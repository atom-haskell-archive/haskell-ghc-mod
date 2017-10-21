"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : new P(function (resolve) { resolve(result.value); }).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
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
        if ((ts - v.timestamp) >= logKeep) {
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
    debuglog = debuglog.filter(({ timestamp }) => (ts - timestamp) < logKeep);
    return debuglog.map(({ timestamp, messages }) => `${(timestamp - ts) / 1000}s: ${messages.join(',')}`).join(os_1.EOL);
}
exports.getDebugLog = getDebugLog;
function execPromise(cmd, args, opts, stdin) {
    return __awaiter(this, void 0, void 0, function* () {
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
                    error.stack = (new Error()).stack;
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
    });
}
exports.execPromise = execPromise;
function getCabalSandbox(rootPath) {
    return __awaiter(this, void 0, void 0, function* () {
        debug('Looking for cabal sandbox...');
        const sbc = yield parseSandboxConfig(`${rootPath}${path_1.sep}cabal.sandbox.config`);
        if (sbc && sbc['install-dirs'] && sbc['install-dirs']['bindir']) {
            const sandbox = sbc['install-dirs']['bindir'];
            debug('Found cabal sandbox: ', sandbox);
            if (atom_haskell_utils_1.isDirectory(sandbox)) {
                return sandbox;
            }
            else {
                warn('Cabal sandbox ', sandbox, ' is not a directory');
            }
        }
        else {
            warn('No cabal sandbox found');
        }
    });
}
exports.getCabalSandbox = getCabalSandbox;
function getStackSandbox(rootPath, apd, env) {
    return __awaiter(this, void 0, void 0, function* () {
        debug('Looking for stack sandbox...');
        env.PATH = joinPath(apd);
        debug('Running stack with PATH ', env.PATH);
        try {
            const out = yield execPromise('stack', ['path', '--snapshot-install-root', '--local-install-root', '--bin-path'], {
                encoding: 'utf8',
                cwd: rootPath,
                env,
                timeout: atom.config.get('haskell-ghc-mod.initTimeout') * 1000,
            });
            const lines = out.stdout.split(os_1.EOL);
            const sir = lines.filter((l) => l.startsWith('snapshot-install-root: '))[0].slice(23) + `${path_1.sep}bin`;
            const lir = lines.filter((l) => l.startsWith('local-install-root: '))[0].slice(20) + `${path_1.sep}bin`;
            const bp = lines.filter((l) => l.startsWith('bin-path: '))[0].slice(10).split(path_1.delimiter).filter((p) => !((p === sir) || (p === lir) || (apd.includes(p))));
            debug('Found stack sandbox ', lir, sir, ...bp);
            return [lir, sir, ...bp];
        }
        catch (err) {
            warn('No stack sandbox found because ', err);
        }
    });
}
exports.getStackSandbox = getStackSandbox;
const processOptionsCache = new Map();
function getProcessOptions(rootPath) {
    return __awaiter(this, void 0, void 0, function* () {
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
        const apd = atom.config.get('haskell-ghc-mod.additionalPathDirectories').concat(PATH.split(path_1.delimiter));
        const cabalSandbox = atom.config.get('haskell-ghc-mod.cabalSandbox')
            ? getCabalSandbox(rootPath) : Promise.resolve(undefined);
        const stackSandbox = atom.config.get('haskell-ghc-mod.stackSandbox')
            ? getStackSandbox(rootPath, apd, Object.assign({}, env)) : Promise.resolve(undefined);
        const [cabalSandboxDir, stackSandboxDirs] = yield Promise.all([cabalSandbox, stackSandbox]);
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
    });
}
exports.getProcessOptions = getProcessOptions;
function getSymbolAtPoint(editor, point) {
    const [scope] = editor.scopeDescriptorForBufferPosition(point).getScopesArray().slice(-1);
    if (scope) {
        const range = editor.bufferRangeForScopeAtPosition(scope, point);
        if (range && !range.isEmpty()) {
            const symbol = editor.getTextInBufferRange(range);
            return { scope, range, symbol };
        }
    }
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
function withTempFile(contents, uri, gen) {
    return __awaiter(this, void 0, void 0, function* () {
        const info = yield new Promise((resolve, reject) => Temp.open({ prefix: 'haskell-ghc-mod', suffix: path_1.extname(uri || '.hs') }, (err, info2) => {
            if (err) {
                reject(err);
            }
            else {
                resolve(info2);
            }
        }));
        return new Promise((resolve, reject) => FS.write(info.fd, contents, (err) => __awaiter(this, void 0, void 0, function* () {
            if (err) {
                reject(err);
            }
            else {
                resolve(yield gen(info.path));
                FS.close(info.fd, () => FS.unlink(info.path, () => { }));
            }
        })));
    });
}
exports.withTempFile = withTempFile;
function mkError(name, message) {
    const err = new Error(message);
    err.name = name;
    return err;
}
exports.mkError = mkError;
function parseSandboxConfig(file) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const sbc = yield new Promise((resolve, reject) => FS.readFile(file, { encoding: 'utf-8' }, (err, sbc2) => {
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
                        const [_, name, val] = m;
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
        }
    });
}
exports.parseSandboxConfig = parseSandboxConfig;
function tabShiftForPoint(buffer, point) {
    const line = buffer.lineForRow(point.row);
    const match = line ? (line.slice(0, point.column).match(/\t/g) || []) : [];
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
        if ((line === undefined) || (line[columnl] === undefined)) {
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
function formatError({ err, runArgs, caps }) {
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
        if (evarU === 'PATH'
            || evarU.startsWith('GHC_')
            || evarU.startsWith('STACK_')
            || evarU.startsWith('CABAL_')) {
            fenv[evar] = env[evar];
        }
    }
    return fenv;
}
function notifySpawnFail(args) {
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
function handleException(target, key, desc) {
    return Object.assign({}, desc, { value(...args) {
            return __awaiter(this, void 0, void 0, function* () {
                try {
                    return yield desc.value.call(this, ...args);
                }
                catch (e) {
                    debug(e);
                    const upi = yield this.upi;
                    upi.setStatus({
                        status: 'warning',
                        detail: e.toString(),
                    });
                    return new Promise(() => { });
                }
            });
        } });
}
exports.handleException = handleException;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidXRpbC5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uL3NyYy91dGlsLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7Ozs7Ozs7Ozs7QUFBQSwrQkFBbUM7QUFDbkMsK0JBQThDO0FBQzlDLDZCQUE0QjtBQUM1Qix5QkFBd0I7QUFDeEIsb0NBQW1DO0FBQ25DLDJCQUF3QjtBQUN4QiwyREFBZ0Y7QUFNdkUsNkJBTkEsdUNBQWtCLENBTUE7QUFBRSxxQkFOQSwrQkFBVSxDQU1BO0FBQUUsc0JBTkEsZ0NBQVcsQ0FNQTtBQUVwRCxJQUFJLFFBQVEsR0FBcUQsRUFBRSxDQUFBO0FBQ25FLE1BQU0sT0FBTyxHQUFHLEtBQUssQ0FBQTtBQUVyQixpQkFBaUIsR0FBRyxRQUFrQjtJQUNwQyxNQUFNLEVBQUUsR0FBRyxJQUFJLENBQUMsR0FBRyxFQUFFLENBQUE7SUFDckIsUUFBUSxDQUFDLElBQUksQ0FBQztRQUNaLFNBQVMsRUFBRSxFQUFFO1FBQ2IsUUFBUTtLQUNULENBQUMsQ0FBQTtJQUNGLElBQUksRUFBRSxHQUFHLENBQUMsQ0FBQTtJQUNWLEdBQUcsQ0FBQyxDQUFDLE1BQU0sQ0FBQyxJQUFJLFFBQVEsQ0FBQyxDQUFDLENBQUM7UUFDekIsRUFBRSxDQUFDLENBQUMsQ0FBQyxFQUFFLEdBQUcsQ0FBQyxDQUFDLFNBQVMsQ0FBQyxJQUFJLE9BQU8sQ0FBQyxDQUFDLENBQUM7WUFDbEMsS0FBSyxDQUFBO1FBQ1AsQ0FBQztRQUNELEVBQUUsRUFBRSxDQUFBO0lBQ04sQ0FBQztJQUNELFFBQVEsQ0FBQyxNQUFNLENBQUMsQ0FBQyxFQUFFLEVBQUUsQ0FBQyxDQUFBO0FBQ3hCLENBQUM7QUFFRCxrQkFBa0IsRUFBWTtJQUM1QixNQUFNLEdBQUcsR0FBRyxJQUFJLEdBQUcsQ0FBQyxFQUFFLENBQUMsQ0FBQTtJQUN2QixNQUFNLENBQUMsS0FBSyxDQUFDLElBQUksQ0FBQyxHQUFHLENBQUMsQ0FBQyxJQUFJLENBQUMsZ0JBQVMsQ0FBQyxDQUFBO0FB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QUNsQixDQUNGLENBQUE7QUFDSCxDQUFDO0FBekJELDBDQXlCQztBQUVELHlCQUNFLE1BQTZELEVBQUUsR0FBVyxFQUMxRSxJQUE2RDtJQUU3RCxNQUFNLG1CQUNELElBQUksSUFDRCxLQUFLLENBQUMsR0FBRyxJQUFXOztnQkFDeEIsSUFBSSxDQUFDO29CQUVILE1BQU0sQ0FBQyxNQUFNLElBQUksQ0FBQyxLQUFNLENBQUMsSUFBSSxDQUFDLElBQUksRUFBRSxHQUFHLElBQUksQ0FBQyxDQUFBO2dCQUM5QyxDQUFDO2dCQUFDLEtBQUssQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUM7b0JBQ1gsS0FBSyxDQUFDLENBQUMsQ0FBQyxDQUFBO29CQUVSLE1BQU0sR0FBRyxHQUFxQixNQUFPLElBQVksQ0FBQyxHQUFHLENBQUE7b0JBQ3JELEdBQUcsQ0FBQyxTQUFTLENBQUM7d0JBQ1osTUFBTSxFQUFFLFNBQVM7d0JBRWpCLE1BQU0sRUFBRSxDQUFDLENBQUMsUUFBUSxFQUFFO3FCQUNyQixDQUFDLENBQUE7b0JBRUYsTUFBTSxDQUFDLElBQUksT0FBTyxDQUFDLEdBQUcsRUFBRSxHQUFjLENBQUMsQ0FBQyxDQUFBO2dCQUMxQyxDQUFDO1lBQ0gsQ0FBQztTQUFBLElBQ0Y7QUFDSCxDQUFDO0FBeEJELDBDQXdCQyIsInNvdXJjZXNDb250ZW50IjpbImltcG9ydCB7IFJhbmdlLCBQb2ludCB9IGZyb20gJ2F0b20nXG5pbXBvcnQgeyBkZWxpbWl0ZXIsIHNlcCwgZXh0bmFtZSB9IGZyb20gJ3BhdGgnXG5pbXBvcnQgKiBhcyBUZW1wIGZyb20gJ3RlbXAnXG5pbXBvcnQgKiBhcyBGUyBmcm9tICdmcydcbmltcG9ydCAqIGFzIENQIGZyb20gJ2NoaWxkX3Byb2Nlc3MnXG5pbXBvcnQgeyBFT0wgfSBmcm9tICdvcydcbmltcG9ydCB7IGdldFJvb3REaXJGYWxsYmFjaywgZ2V0Um9vdERpciwgaXNEaXJlY3RvcnkgfSBmcm9tICdhdG9tLWhhc2tlbGwtdXRpbHMnXG5pbXBvcnQgeyBSdW5PcHRpb25zLCBJRXJyb3JDYWxsYmFja0FyZ3MgfSBmcm9tICcuL2doYy1tb2QvZ2hjLW1vZGktcHJvY2Vzcy1yZWFsJ1xuaW1wb3J0IHsgR0hDTW9kVmVycyB9IGZyb20gJy4vZ2hjLW1vZC9naGMtbW9kaS1wcm9jZXNzLXJlYWwtZmFjdG9yeSdcbmltcG9ydCB7IEdIQ01vZENhcHMgfSBmcm9tICcuL2doYy1tb2QvaW50ZXJhY3RpdmUtcHJvY2VzcydcblxudHlwZSBFeGVjT3B0cyA9IENQLkV4ZWNGaWxlT3B0aW9uc1dpdGhTdHJpbmdFbmNvZGluZ1xuZXhwb3J0IHsgZ2V0Um9vdERpckZhbGxiYWNrLCBnZXRSb290RGlyLCBpc0RpcmVjdG9yeSwgRXhlY09wdHMgfVxuXG5sZXQgZGVidWdsb2c6IEFycmF5PHsgdGltZXN0YW1wOiBudW1iZXIsIG1lc3NhZ2VzOiBzdHJpbmdbXSB9PiA9IFtdXG5jb25zdCBsb2dLZWVwID0gMzAwMDAgLy8gbXNcblxuZnVuY3Rpb24gc2F2ZWxvZyguLi5tZXNzYWdlczogc3RyaW5nW10pIHtcbiAgY29uc3QgdHMgPSBEYXRlLm5vdygpXG4gIGRlYnVnbG9nLnB1c2goe1xuICAgIHRpbWVzdGFtcDogdHMsXG4gICAgbWVzc2FnZXMsXG4gIH0pXG4gIGxldCBrcyA9IDBcbiAgZm9yIChjb25zdCB2IG9mIGRlYnVnbG9nKSB7XG4gICAgaWYgKCh0cyAtIHYudGltZXN0YW1wKSA+PSBsb2dLZWVwKSB7XG4gICAgICBicmVha1xuICAgIH1cbiAgICBrcysrXG4gIH1cbiAgZGVidWdsb2cuc3BsaWNlKDAsIGtzKVxufVxuXG5mdW5jdGlvbiBqb2luUGF0aChkczogc3RyaW5nW10pIHtcbiAgY29uc3Qgc2V0ID0gbmV3IFNldChkcylcbiAgcmV0dXJuIEFycmF5LmZyb20oc2V0KS5qb2luKGRlbGltaXRlcilcbn1cblxuZXhwb3J0IGNvbnN0IEVPVCA9IGAke0VPTH1cXHgwNCR7RU9MfWBcblxuZXhwb3J0IGZ1bmN0aW9uIGRlYnVnKC4uLm1lc3NhZ2VzOiBhbnlbXSkge1xuICBpZiAoYXRvbS5jb25maWcuZ2V0KCdoYXNrZWxsLWdoYy1tb2QuZGVidWcnKSkge1xuICAgIC8vIHRzbGludDpkaXNhYmxlLW5leHQtbGluZTogbm8tY29uc29sZVxuICAgIGNvbnNvbGUubG9nKCdoYXNrZWxsLWdoYy1tb2QgZGVidWc6JywgLi4ubWVzc2FnZXMpXG4gIH1cbiAgc2F2ZWxvZyguLi5tZXNzYWdlcy5tYXAoKHYpID0+IEpTT04uc3RyaW5naWZ5KHYpKSlcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIHdhcm4oLi4ubWVzc2FnZXM6IGFueVtdKSB7XG4gIC8vIHRzbGludDpkaXNhYmxlLW5leHQtbGluZTogbm8tY29uc29sZVxuICBjb25zb2xlLndhcm4oJ2hhc2tlbGwtZ2hjLW1vZCB3YXJuaW5nOicsIC4uLm1lc3NhZ2VzKVxuICBzYXZlbG9nKC4uLm1lc3NhZ2VzLm1hcCgodikgPT4gSlNPTi5zdHJpbmdpZnkodikpKVxufVxuXG5leHBvcnQgZnVuY3Rpb24gZXJyb3IoLi4ubWVzc2FnZXM6IGFueVtdKSB7XG4gIC8vIHRzbGludDpkaXNhYmxlLW5leHQtbGluZTogbm8tY29uc29sZVxuICBjb25zb2xlLmVycm9yKCdoYXNrZWxsLWdoYy1tb2QgZXJyb3I6JywgLi4ubWVzc2FnZXMpXG4gIHNhdmVsb2coLi4ubWVzc2FnZXMubWFwKCh2KSA9PiBKU09OLnN0cmluZ2lmeSh2KSkpXG59XG5cbmV4cG9ydCBmdW5jdGlvbiBnZXREZWJ1Z0xvZygpIHtcbiAgY29uc3QgdHMgPSBEYXRlLm5vdygpXG4gIGRlYnVnbG9nID0gZGVidWdsb2cuZmlsdGVyKCh7IHRpbWVzdGFtcCB9KSA9PiAodHMgLSB0aW1lc3RhbXApIDwgbG9nS2VlcClcbiAgcmV0dXJuIGRlYnVnbG9nLm1hcCgoeyB0aW1lc3RhbXAsIG1lc3NhZ2VzIH0pID0+IGAkeyh0aW1lc3RhbXAgLSB0cykgLyAxMDAwfXM6ICR7bWVzc2FnZXMuam9pbignLCcpfWApLmpvaW4oRU9MKVxufVxuXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gZXhlY1Byb21pc2UoY21kOiBzdHJpbmcsIGFyZ3M6IHN0cmluZ1tdLCBvcHRzOiBFeGVjT3B0cywgc3RkaW4/OiBzdHJpbmcpIHtcbiAgcmV0dXJuIG5ldyBQcm9taXNlPHsgc3Rkb3V0OiBzdHJpbmcsIHN0ZGVycjogc3RyaW5nIH0+KChyZXNvbHZlLCByZWplY3QpID0+IHtcbiAgICBkZWJ1ZyhgUnVubmluZyAke2NtZH0gJHthcmdzfSB3aXRoIG9wdHMgPSBgLCBvcHRzKVxuICAgIGNvbnN0IGNoaWxkID0gQ1AuZXhlY0ZpbGUoY21kLCBhcmdzLCBvcHRzLCAoZXJyb3IsIHN0ZG91dDogc3RyaW5nLCBzdGRlcnI6IHN0cmluZykgPT4ge1xuICAgICAgaWYgKHN0ZGVyci50cmltKCkubGVuZ3RoID4gMCkgeyB3YXJuKHN0ZGVycikgfVxuICAgICAgaWYgKGVycm9yKSB7XG4gICAgICAgIHdhcm4oYFJ1bm5pbmcgJHtjbWR9ICR7YXJnc30gZmFpbGVkIHdpdGggYCwgZXJyb3IpXG4gICAgICAgIGlmIChzdGRvdXQpIHsgd2FybihzdGRvdXQpIH1cbiAgICAgICAgZXJyb3Iuc3RhY2sgPSAobmV3IEVycm9yKCkpLnN0YWNrXG4gICAgICAgIHJlamVjdChlcnJvcilcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIGRlYnVnKGBHb3QgcmVzcG9uc2UgZnJvbSAke2NtZH0gJHthcmdzfWAsIHsgc3Rkb3V0LCBzdGRlcnIgfSlcbiAgICAgICAgcmVzb2x2ZSh7IHN0ZG91dCwgc3RkZXJyIH0pXG4gICAgICB9XG4gICAgfSlcbiAgICBpZiAoc3RkaW4pIHtcbiAgICAgIGRlYnVnKGBzZW5kaW5nIHN0ZGluIHRleHQgdG8gJHtjbWR9ICR7YXJnc31gKVxuICAgICAgY2hpbGQuc3RkaW4ud3JpdGUoc3RkaW4pXG4gICAgfVxuICB9KVxufVxuXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gZ2V0Q2FiYWxTYW5kYm94KHJvb3RQYXRoOiBzdHJpbmcpOiBQcm9taXNlPHN0cmluZyB8IHVuZGVmaW5lZD4ge1xuICBkZWJ1ZygnTG9va2luZyBmb3IgY2FiYWwgc2FuZGJveC4uLicpXG4gIGNvbnN0IHNiYyA9IGF3YWl0IHBhcnNlU2FuZGJveENvbmZpZyhgJHtyb290UGF0aH0ke3NlcH1jYWJhbC5zYW5kYm94LmNvbmZpZ2ApXG4gIC8vIHRzbGludDpkaXNhYmxlOiBuby1zdHJpbmctbGl0ZXJhbFxuICBpZiAoc2JjICYmIHNiY1snaW5zdGFsbC1kaXJzJ10gJiYgc2JjWydpbnN0YWxsLWRpcnMnXVsnYmluZGlyJ10pIHtcbiAgICAvLyB0c2xpbnQ6ZGlzYWJsZS1uZXh0LWxpbmU6IG5vLXVuc2FmZS1hbnlcbiAgICBjb25zdCBzYW5kYm94OiBzdHJpbmcgPSBzYmNbJ2luc3RhbGwtZGlycyddWydiaW5kaXInXVxuICAgIGRlYnVnKCdGb3VuZCBjYWJhbCBzYW5kYm94OiAnLCBzYW5kYm94KVxuICAgIGlmIChpc0RpcmVjdG9yeShzYW5kYm94KSkge1xuICAgICAgcmV0dXJuIHNhbmRib3hcbiAgICB9IGVsc2Uge1xuICAgICAgd2FybignQ2FiYWwgc2FuZGJveCAnLCBzYW5kYm94LCAnIGlzIG5vdCBhIGRpcmVjdG9yeScpXG4gICAgfVxuICB9IGVsc2Uge1xuICAgIHdhcm4oJ05vIGNhYmFsIHNhbmRib3ggZm91bmQnKVxuICB9XG4gIC8vIHRzbGludDplbmFibGU6IG5vLXN0cmluZy1saXRlcmFsXG59XG5cbmV4cG9ydCBhc3luYyBmdW5jdGlvbiBnZXRTdGFja1NhbmRib3gocm9vdFBhdGg6IHN0cmluZywgYXBkOiBzdHJpbmdbXSwgZW52OiB7IFtrZXk6IHN0cmluZ106IHN0cmluZyB8IHVuZGVmaW5lZCB9KSB7XG4gIGRlYnVnKCdMb29raW5nIGZvciBzdGFjayBzYW5kYm94Li4uJylcbiAgZW52LlBBVEggPSBqb2luUGF0aChhcGQpXG4gIGRlYnVnKCdSdW5uaW5nIHN0YWNrIHdpdGggUEFUSCAnLCBlbnYuUEFUSClcbiAgdHJ5IHtcbiAgICBjb25zdCBvdXQgPSBhd2FpdCBleGVjUHJvbWlzZSgnc3RhY2snLCBbJ3BhdGgnLCAnLS1zbmFwc2hvdC1pbnN0YWxsLXJvb3QnLCAnLS1sb2NhbC1pbnN0YWxsLXJvb3QnLCAnLS1iaW4tcGF0aCddLCB7XG4gICAgICBlbmNvZGluZzogJ3V0ZjgnLFxuICAgICAgY3dkOiByb290UGF0aCxcbiAgICAgIGVudixcbiAgICAgIHRpbWVvdXQ6IGF0b20uY29uZmlnLmdldCgnaGFza2VsbC1naGMtbW9kLmluaXRUaW1lb3V0JykgKiAxMDAwLFxuICAgIH0pXG5cbiAgICBjb25zdCBsaW5lcyA9IG91dC5zdGRvdXQuc3BsaXQoRU9MKVxuICAgIGNvbnN0IHNpciA9IGxpbmVzLmZpbHRlcigobCkgPT4gbC5zdGFydHNXaXRoKCdzbmFwc2hvdC1pbnN0YWxsLXJvb3Q6ICcpKVswXS5zbGljZSgyMykgKyBgJHtzZXB9YmluYFxuICAgIGNvbnN0IGxpciA9IGxpbmVzLmZpbHRlcigobCkgPT4gbC5zdGFydHNXaXRoKCdsb2NhbC1pbnN0YWxsLXJvb3Q6ICcpKVswXS5zbGljZSgyMCkgKyBgJHtzZXB9YmluYFxuICAgIGNvbnN0IGJwID1cbiAgICAgIGxpbmVzLmZpbHRlcigobCkgPT5cbiAgICAgICAgbC5zdGFydHNXaXRoKCdiaW4tcGF0aDogJykpWzBdLnNsaWNlKDEwKS5zcGxpdChkZWxpbWl0ZXIpLmZpbHRlcigocCkgPT5cbiAgICAgICAgICAhKChwID09PSBzaXIpIHx8IChwID09PSBsaXIpIHx8IChhcGQuaW5jbHVkZXMocCkpKSlcbiAgICBkZWJ1ZygnRm91bmQgc3RhY2sgc2FuZGJveCAnLCBsaXIsIHNpciwgLi4uYnApXG4gICAgcmV0dXJuIFtsaXIsIHNpciwgLi4uYnBdXG4gIH0gY2F0Y2ggKGVycikge1xuICAgIHdhcm4oJ05vIHN0YWNrIHNhbmRib3ggZm91bmQgYmVjYXVzZSAnLCBlcnIpXG4gIH1cbn1cblxuY29uc3QgcHJvY2Vzc09wdGlvbnNDYWNoZSA9IG5ldyBNYXA8c3RyaW5nLCBSdW5PcHRpb25zPigpXG5cbmV4cG9ydCBhc3luYyBmdW5jdGlvbiBnZXRQcm9jZXNzT3B0aW9ucyhyb290UGF0aD86IHN0cmluZyk6IFByb21pc2U8UnVuT3B0aW9ucz4ge1xuICBpZiAoIXJvb3RQYXRoKSB7XG4gICAgLy8gdHNsaW50OmRpc2FibGUtbmV4dC1saW5lOiBuby1udWxsLWtleXdvcmQgbm8tdW5zYWZlLWFueVxuICAgIHJvb3RQYXRoID0gZ2V0Um9vdERpckZhbGxiYWNrKG51bGwpLmdldFBhdGgoKVxuICB9XG4gIC8vIGNhY2hlXG4gIGNvbnN0IGNhY2hlZCA9IHByb2Nlc3NPcHRpb25zQ2FjaGUuZ2V0KHJvb3RQYXRoKVxuICBpZiAoY2FjaGVkKSB7XG4gICAgcmV0dXJuIGNhY2hlZFxuICB9XG5cbiAgZGVidWcoYGdldFByb2Nlc3NPcHRpb25zKCR7cm9vdFBhdGh9KWApXG4gIGNvbnN0IGVudiA9IHsgLi4ucHJvY2Vzcy5lbnYgfVxuXG4gIC8vIHRzbGludDpkaXNhYmxlLW5leHQtbGluZTogdG90YWxpdHktY2hlY2tcbiAgaWYgKHByb2Nlc3MucGxhdGZvcm0gPT09ICd3aW4zMicpIHtcbiAgICBjb25zdCBQQVRIID0gW11cbiAgICBjb25zdCBjYXBNYXNrID0gKHN0cjogc3RyaW5nLCBtYXNrOiBudW1iZXIpID0+IHtcbiAgICAgIGNvbnN0IGEgPSBzdHIuc3BsaXQoJycpXG4gICAgICBmb3IgKGxldCBpID0gMDsgaSA8IGEubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgaWYgKG1hc2sgJiBNYXRoLnBvdygyLCBpKSkge1xuICAgICAgICAgIGFbaV0gPSBhW2ldLnRvVXBwZXJDYXNlKClcbiAgICAgICAgfVxuICAgICAgfVxuICAgICAgcmV0dXJuIGEuam9pbignJylcbiAgICB9XG4gICAgZm9yIChsZXQgbSA9IDBiMTExMTsgbSA+PSAwOyBtLS0pIHtcbiAgICAgIGNvbnN0IHZuID0gY2FwTWFzaygncGF0aCcsIG0pXG4gICAgICBpZiAoZW52W3ZuXSkge1xuICAgICAgICBQQVRILnB1c2goZW52W3ZuXSlcbiAgICAgIH1cbiAgICB9XG4gICAgZW52LlBBVEggPSBQQVRILmpvaW4oZGVsaW1pdGVyKVxuICB9XG5cbiAgY29uc3QgUEFUSCA9IGVudi5QQVRIIHx8ICcnXG5cbiAgY29uc3QgYXBkID0gYXRvbS5jb25maWcuZ2V0KCdoYXNrZWxsLWdoYy1tb2QuYWRkaXRpb25hbFBhdGhEaXJlY3RvcmllcycpLmNvbmNhdChQQVRILnNwbGl0KGRlbGltaXRlcikpXG4gIGNvbnN0IGNhYmFsU2FuZGJveCA9IGF0b20uY29uZmlnLmdldCgnaGFza2VsbC1naGMtbW9kLmNhYmFsU2FuZGJveCcpXG4gICAgPyBnZXRDYWJhbFNhbmRib3gocm9vdFBhdGgpIDogUHJvbWlzZS5yZXNvbHZlKHVuZGVmaW5lZClcbiAgY29uc3Qgc3RhY2tTYW5kYm94ID0gYXRvbS5jb25maWcuZ2V0KCdoYXNrZWxsLWdoYy1tb2Quc3RhY2tTYW5kYm94JylcbiAgICA/IGdldFN0YWNrU2FuZGJveChyb290UGF0aCwgYXBkLCB7IC4uLmVudiB9KSA6IFByb21pc2UucmVzb2x2ZSh1bmRlZmluZWQpXG4gIGNvbnN0IFtjYWJhbFNhbmRib3hEaXIsIHN0YWNrU2FuZGJveERpcnNdID0gYXdhaXQgUHJvbWlzZS5hbGwoW2NhYmFsU2FuZGJveCwgc3RhY2tTYW5kYm94XSlcbiAgY29uc3QgbmV3cCA9IFtdXG4gIGlmIChjYWJhbFNhbmRib3hEaXIpIHtcbiAgICBuZXdwLnB1c2goY2FiYWxTYW5kYm94RGlyKVxuICB9XG4gIGlmIChzdGFja1NhbmRib3hEaXJzKSB7XG4gICAgbmV3cC5wdXNoKC4uLnN0YWNrU2FuZGJveERpcnMpXG4gIH1cbiAgbmV3cC5wdXNoKC4uLmFwZClcbiAgZW52LlBBVEggPSBqb2luUGF0aChuZXdwKVxuICBkZWJ1ZyhgUEFUSCA9ICR7ZW52LlBBVEh9YClcbiAgY29uc3QgcmVzOiBSdW5PcHRpb25zID0ge1xuICAgIGN3ZDogcm9vdFBhdGgsXG4gICAgZW52LFxuICAgIGVuY29kaW5nOiAndXRmOCcsXG4gICAgbWF4QnVmZmVyOiBJbmZpbml0eSxcbiAgfVxuICBwcm9jZXNzT3B0aW9uc0NhY2hlLnNldChyb290UGF0aCwgcmVzKVxuICByZXR1cm4gcmVzXG59XG5cbmV4cG9ydCBmdW5jdGlvbiBnZXRTeW1ib2xBdFBvaW50KFxuICBlZGl0b3I6IEF0b21UeXBlcy5UZXh0RWRpdG9yLCBwb2ludDogQXRvbVR5cGVzLlBvaW50LFxuKSB7XG4gIGNvbnN0IFtzY29wZV0gPSBlZGl0b3Iuc2NvcGVEZXNjcmlwdG9yRm9yQnVmZmVyUG9zaXRpb24ocG9pbnQpLmdldFNjb3Blc0FycmF5KCkuc2xpY2UoLTEpXG4gIGlmIChzY29wZSkge1xuICAgIGNvbnN0IHJhbmdlID0gZWRpdG9yLmJ1ZmZlclJhbmdlRm9yU2NvcGVBdFBvc2l0aW9uKHNjb3BlLCBwb2ludClcbiAgICBpZiAocmFuZ2UgJiYgIXJhbmdlLmlzRW1wdHkoKSkge1xuICAgICAgY29uc3Qgc3ltYm9sID0gZWRpdG9yLmdldFRleHRJbkJ1ZmZlclJhbmdlKHJhbmdlKVxuICAgICAgcmV0dXJuIHsgc2NvcGUsIHJhbmdlLCBzeW1ib2wgfVxuICAgIH1cbiAgfVxufVxuXG5leHBvcnQgZnVuY3Rpb24gZ2V0U3ltYm9sSW5SYW5nZShlZGl0b3I6IEF0b21UeXBlcy5UZXh0RWRpdG9yLCBjcmFuZ2U6IEF0b21UeXBlcy5SYW5nZSkge1xuICBjb25zdCBidWZmZXIgPSBlZGl0b3IuZ2V0QnVmZmVyKClcbiAgaWYgKGNyYW5nZS5pc0VtcHR5KCkpIHtcbiAgICByZXR1cm4gZ2V0U3ltYm9sQXRQb2ludChlZGl0b3IsIGNyYW5nZS5zdGFydClcbiAgfSBlbHNlIHtcbiAgICByZXR1cm4ge1xuICAgICAgc3ltYm9sOiBidWZmZXIuZ2V0VGV4dEluUmFuZ2UoY3JhbmdlKSxcbiAgICAgIHJhbmdlOiBjcmFuZ2UsXG4gICAgfVxuICB9XG59XG5cbmV4cG9ydCBhc3luYyBmdW5jdGlvbiB3aXRoVGVtcEZpbGU8VD4oY29udGVudHM6IHN0cmluZywgdXJpOiBzdHJpbmcsIGdlbjogKHBhdGg6IHN0cmluZykgPT4gUHJvbWlzZTxUPik6IFByb21pc2U8VD4ge1xuICBjb25zdCBpbmZvID0gYXdhaXQgbmV3IFByb21pc2U8VGVtcC5PcGVuRmlsZT4oXG4gICAgKHJlc29sdmUsIHJlamVjdCkgPT5cbiAgICAgIFRlbXAub3BlbihcbiAgICAgICAgeyBwcmVmaXg6ICdoYXNrZWxsLWdoYy1tb2QnLCBzdWZmaXg6IGV4dG5hbWUodXJpIHx8ICcuaHMnKSB9LFxuICAgICAgICAoZXJyLCBpbmZvMikgPT4ge1xuICAgICAgICAgIGlmIChlcnIpIHtcbiAgICAgICAgICAgIHJlamVjdChlcnIpXG4gICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHJlc29sdmUoaW5mbzIpXG4gICAgICAgICAgfVxuICAgICAgICB9KSlcbiAgcmV0dXJuIG5ldyBQcm9taXNlPFQ+KChyZXNvbHZlLCByZWplY3QpID0+XG4gICAgRlMud3JpdGUoaW5mby5mZCwgY29udGVudHMsIGFzeW5jIChlcnIpID0+IHtcbiAgICAgIGlmIChlcnIpIHtcbiAgICAgICAgcmVqZWN0KGVycilcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHJlc29sdmUoYXdhaXQgZ2VuKGluZm8ucGF0aCkpXG4gICAgICAgIEZTLmNsb3NlKGluZm8uZmQsICgpID0+IEZTLnVubGluayhpbmZvLnBhdGgsICgpID0+IHsgLypub29wKi8gfSkpXG4gICAgICB9XG4gICAgfSkpXG59XG5cbmV4cG9ydCB0eXBlIEtub3duRXJyb3JOYW1lID1cbiAgJ0dIQ01vZFN0ZG91dEVycm9yJ1xuICB8ICdJbnRlcmFjdGl2ZUFjdGlvblRpbWVvdXQnXG4gIHwgJ0dIQ01vZEludGVyYWN0aXZlQ3Jhc2gnXG5cbmV4cG9ydCBmdW5jdGlvbiBta0Vycm9yKG5hbWU6IEtub3duRXJyb3JOYW1lLCBtZXNzYWdlOiBzdHJpbmcpIHtcbiAgY29uc3QgZXJyID0gbmV3IEVycm9yKG1lc3NhZ2UpXG4gIGVyci5uYW1lID0gbmFtZVxuICByZXR1cm4gZXJyXG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgU2FuZGJveENvbmZpZ1RyZWUgeyBbazogc3RyaW5nXTogU2FuZGJveENvbmZpZ1RyZWUgfCBzdHJpbmcgfVxuXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gcGFyc2VTYW5kYm94Q29uZmlnKGZpbGU6IHN0cmluZykge1xuICB0cnkge1xuICAgIGNvbnN0IHNiYyA9IGF3YWl0IG5ldyBQcm9taXNlPHN0cmluZz4oKHJlc29sdmUsIHJlamVjdCkgPT5cbiAgICAgIEZTLnJlYWRGaWxlKGZpbGUsIHsgZW5jb2Rpbmc6ICd1dGYtOCcgfSwgKGVyciwgc2JjMikgPT4ge1xuICAgICAgICBpZiAoZXJyKSB7XG4gICAgICAgICAgcmVqZWN0KGVycilcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICByZXNvbHZlKHNiYzIpXG4gICAgICAgIH1cbiAgICAgIH0pKVxuICAgIGNvbnN0IHZhcnM6IFNhbmRib3hDb25maWdUcmVlID0ge31cbiAgICBsZXQgc2NvcGUgPSB2YXJzXG4gICAgY29uc3QgcnYgPSAodjogc3RyaW5nKSA9PiB7XG4gICAgICBmb3IgKGNvbnN0IGsxIG9mIE9iamVjdC5rZXlzKHNjb3BlKSkge1xuICAgICAgICBjb25zdCB2MSA9IHNjb3BlW2sxXVxuICAgICAgICBpZiAodHlwZW9mIHYxID09PSAnc3RyaW5nJykge1xuICAgICAgICAgIHYgPSB2LnNwbGl0KGAkJHtrMX1gKS5qb2luKHYxKVxuICAgICAgICB9XG4gICAgICB9XG4gICAgICByZXR1cm4gdlxuICAgIH1cbiAgICBmb3IgKGNvbnN0IGxpbmUgb2Ygc2JjLnNwbGl0KC9cXHI/XFxufFxcci8pKSB7XG4gICAgICBpZiAoIWxpbmUubWF0Y2goL15cXHMqLS0vKSAmJiAhbGluZS5tYXRjaCgvXlxccyokLykpIHtcbiAgICAgICAgY29uc3QgW2xdID0gbGluZS5zcGxpdCgvLS0vKVxuICAgICAgICBjb25zdCBtID0gbC5tYXRjaCgvXlxccyooW1xcdy1dKyk6XFxzKiguKilcXHMqJC8pXG4gICAgICAgIGlmIChtKSB7XG4gICAgICAgICAgY29uc3QgW18sIG5hbWUsIHZhbF0gPSBtXG4gICAgICAgICAgc2NvcGVbbmFtZV0gPSBydih2YWwpXG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgY29uc3QgbmV3c2NvcGUgPSB7fVxuICAgICAgICAgIHNjb3BlW2xpbmVdID0gbmV3c2NvcGVcbiAgICAgICAgICBzY29wZSA9IG5ld3Njb3BlXG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9XG4gICAgcmV0dXJuIHZhcnNcbiAgfSBjYXRjaCAoZXJyKSB7XG4gICAgd2FybignUmVhZGluZyBjYWJhbCBzYW5kYm94IGNvbmZpZyBmYWlsZWQgd2l0aCAnLCBlcnIpXG4gIH1cbn1cblxuLy8gQSBkaXJ0eSBoYWNrIHRvIHdvcmsgd2l0aCB0YWJzXG5leHBvcnQgZnVuY3Rpb24gdGFiU2hpZnRGb3JQb2ludChidWZmZXI6IEF0b21UeXBlcy5UZXh0QnVmZmVyLCBwb2ludDogQXRvbVR5cGVzLlBvaW50KSB7XG4gIGNvbnN0IGxpbmUgPSBidWZmZXIubGluZUZvclJvdyhwb2ludC5yb3cpXG4gIGNvbnN0IG1hdGNoID0gbGluZSA/IChsaW5lLnNsaWNlKDAsIHBvaW50LmNvbHVtbikubWF0Y2goL1xcdC9nKSB8fCBbXSkgOiBbXVxuICBjb25zdCBjb2x1bW5TaGlmdCA9IDcgKiBtYXRjaC5sZW5ndGhcbiAgcmV0dXJuIG5ldyBQb2ludChwb2ludC5yb3csIHBvaW50LmNvbHVtbiArIGNvbHVtblNoaWZ0KVxufVxuXG5leHBvcnQgZnVuY3Rpb24gdGFiU2hpZnRGb3JSYW5nZShidWZmZXI6IEF0b21UeXBlcy5UZXh0QnVmZmVyLCByYW5nZTogQXRvbVR5cGVzLlJhbmdlKSB7XG4gIGNvbnN0IHN0YXJ0ID0gdGFiU2hpZnRGb3JQb2ludChidWZmZXIsIHJhbmdlLnN0YXJ0KVxuICBjb25zdCBlbmQgPSB0YWJTaGlmdEZvclBvaW50KGJ1ZmZlciwgcmFuZ2UuZW5kKVxuICByZXR1cm4gbmV3IFJhbmdlKHN0YXJ0LCBlbmQpXG59XG5cbmV4cG9ydCBmdW5jdGlvbiB0YWJVbnNoaWZ0Rm9yUG9pbnQoYnVmZmVyOiBBdG9tVHlwZXMuVGV4dEJ1ZmZlciwgcG9pbnQ6IEF0b21UeXBlcy5Qb2ludCkge1xuICBjb25zdCBsaW5lID0gYnVmZmVyLmxpbmVGb3JSb3cocG9pbnQucm93KVxuICBsZXQgY29sdW1ubCA9IDBcbiAgbGV0IGNvbHVtbnIgPSBwb2ludC5jb2x1bW5cbiAgd2hpbGUgKGNvbHVtbmwgPCBjb2x1bW5yKSB7XG4gICAgLy8gdHNsaW50OmRpc2FibGUtbmV4dC1saW5lOiBzdHJpY3QtdHlwZS1wcmVkaWNhdGVzXG4gICAgaWYgKChsaW5lID09PSB1bmRlZmluZWQpIHx8IChsaW5lW2NvbHVtbmxdID09PSB1bmRlZmluZWQpKSB7IGJyZWFrIH1cbiAgICBpZiAobGluZVtjb2x1bW5sXSA9PT0gJ1xcdCcpIHtcbiAgICAgIGNvbHVtbnIgLT0gN1xuICAgIH1cbiAgICBjb2x1bW5sICs9IDFcbiAgfVxuICByZXR1cm4gbmV3IFBvaW50KHBvaW50LnJvdywgY29sdW1ucilcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIHRhYlVuc2hpZnRGb3JSYW5nZShidWZmZXI6IEF0b21UeXBlcy5UZXh0QnVmZmVyLCByYW5nZTogQXRvbVR5cGVzLlJhbmdlKSB7XG4gIGNvbnN0IHN0YXJ0ID0gdGFiVW5zaGlmdEZvclBvaW50KGJ1ZmZlciwgcmFuZ2Uuc3RhcnQpXG4gIGNvbnN0IGVuZCA9IHRhYlVuc2hpZnRGb3JQb2ludChidWZmZXIsIHJhbmdlLmVuZClcbiAgcmV0dXJuIG5ldyBSYW5nZShzdGFydCwgZW5kKVxufVxuXG5leHBvcnQgZnVuY3Rpb24gaXNVcHBlckNhc2UoY2g6IHN0cmluZyk6IGJvb2xlYW4ge1xuICByZXR1cm4gY2gudG9VcHBlckNhc2UoKSA9PT0gY2hcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGdldEVycm9yRGV0YWlsKHsgZXJyLCBydW5BcmdzLCBjYXBzIH06IElFcnJvckNhbGxiYWNrQXJncykge1xuICByZXR1cm4gYGNhcHM6XG4ke0pTT04uc3RyaW5naWZ5KGNhcHMsIHVuZGVmaW5lZCwgMil9XG5BcmdzOlxuJHtKU09OLnN0cmluZ2lmeShydW5BcmdzLCB1bmRlZmluZWQsIDIpfVxubWVzc2FnZTpcbiR7ZXJyLm1lc3NhZ2V9XG5sb2c6XG4ke2dldERlYnVnTG9nKCl9YFxufVxuXG5leHBvcnQgZnVuY3Rpb24gZm9ybWF0RXJyb3IoeyBlcnIsIHJ1bkFyZ3MsIGNhcHMgfTogSUVycm9yQ2FsbGJhY2tBcmdzKSB7XG4gIGlmIChlcnIubmFtZSA9PT0gJ0ludGVyYWN0aXZlQWN0aW9uVGltZW91dCcgJiYgcnVuQXJncykge1xuICAgIHJldHVybiBgXFxcbkhhc2tlbGwtZ2hjLW1vZDogZ2hjLW1vZCBcXFxuJHtydW5BcmdzLmludGVyYWN0aXZlID8gJ2ludGVyYWN0aXZlICcgOiAnJ31jb21tYW5kICR7cnVuQXJncy5jb21tYW5kfSBcXFxudGltZWQgb3V0LiBZb3UgY2FuIHRyeSB0byBmaXggaXQgYnkgcmFpc2luZyAnSW50ZXJhY3RpdmUgQWN0aW9uIFxcXG5UaW1lb3V0JyBzZXR0aW5nIGluIGhhc2tlbGwtZ2hjLW1vZCBzZXR0aW5ncy5gXG4gIH0gZWxzZSBpZiAocnVuQXJncykge1xuICAgIHJldHVybiBgXFxcbkhhc2tlbGwtZ2hjLW1vZDogZ2hjLW1vZCBcXFxuJHtydW5BcmdzLmludGVyYWN0aXZlID8gJ2ludGVyYWN0aXZlICcgOiAnJ31jb21tYW5kICR7cnVuQXJncy5jb21tYW5kfSBcXFxuZmFpbGVkIHdpdGggZXJyb3IgJHtlcnIubmFtZX1gXG4gIH0gZWxzZSB7XG4gICAgcmV0dXJuIGBUaGVyZSB3YXMgYW4gdW5leHBlY3RlZCBlcnJvciAke2Vyci5uYW1lfWBcbiAgfVxufVxuXG5leHBvcnQgZnVuY3Rpb24gZGVmYXVsdEVycm9ySGFuZGxlcihhcmdzOiBJRXJyb3JDYWxsYmFja0FyZ3MpIHtcbiAgY29uc3QgeyBlcnIsIHJ1bkFyZ3MsIGNhcHMgfSA9IGFyZ3NcbiAgY29uc3Qgc3VwcHJlc3NFcnJvcnMgPSBydW5BcmdzICYmIHJ1bkFyZ3Muc3VwcHJlc3NFcnJvcnNcblxuICBpZiAoIXN1cHByZXNzRXJyb3JzKSB7XG4gICAgYXRvbS5ub3RpZmljYXRpb25zLmFkZEVycm9yKFxuICAgICAgZm9ybWF0RXJyb3IoYXJncyksXG4gICAgICB7XG4gICAgICAgIGRldGFpbDogZ2V0RXJyb3JEZXRhaWwoYXJncyksXG4gICAgICAgIHN0YWNrOiBlcnIuc3RhY2ssXG4gICAgICAgIGRpc21pc3NhYmxlOiB0cnVlLFxuICAgICAgfSxcbiAgICApXG4gIH0gZWxzZSB7XG4gICAgZXJyb3IoY2FwcywgcnVuQXJncywgZXJyKVxuICB9XG59XG5cbmV4cG9ydCBmdW5jdGlvbiB3YXJuR0hDUGFja2FnZVBhdGgoKSB7XG4gIGF0b20ubm90aWZpY2F0aW9ucy5hZGRXYXJuaW5nKFxuICAgICdoYXNrZWxsLWdoYy1tb2Q6IFlvdSBoYXZlIEdIQ19QQUNLQUdFX1BBVEggZW52aXJvbm1lbnQgdmFyaWFibGUgc2V0IScsXG4gICAge1xuICAgICAgZGlzbWlzc2FibGU6IHRydWUsXG4gICAgICBkZXRhaWw6IGBcXFxuVGhpcyBjb25maWd1cmF0aW9uIGlzIG5vdCBzdXBwb3J0ZWQsIGFuZCBjYW4gYnJlYWsgYXJiaXRyYXJpbHkuIFlvdSBjYW4gdHJ5IHRvIGJhbmQtYWlkIGl0IGJ5IGFkZGluZ1xuXG5kZWxldGUgcHJvY2Vzcy5lbnYuR0hDX1BBQ0tBR0VfUEFUSFxuXG50byB5b3VyIEF0b20gaW5pdCBzY3JpcHQgKEVkaXQg4oaSIEluaXQgU2NyaXB0Li4uKVxuXG5Zb3UgY2FuIHN1cHByZXNzIHRoaXMgd2FybmluZyBpbiBoYXNrZWxsLWdoYy1tb2Qgc2V0dGluZ3MuYCxcbiAgICB9LFxuICApXG59XG5cbmZ1bmN0aW9uIGZpbHRlckVudihlbnY6IHsgW25hbWU6IHN0cmluZ106IHN0cmluZyB8IHVuZGVmaW5lZCB9KSB7XG4gIGNvbnN0IGZlbnYgPSB7fVxuICAvLyB0c2xpbnQ6ZGlzYWJsZS1uZXh0LWxpbmU6IGZvcmluXG4gIGZvciAoY29uc3QgZXZhciBpbiBlbnYpIHtcbiAgICBjb25zdCBldmFyVSA9IGV2YXIudG9VcHBlckNhc2UoKVxuICAgIGlmIChcbiAgICAgIGV2YXJVID09PSAnUEFUSCdcbiAgICAgIHx8IGV2YXJVLnN0YXJ0c1dpdGgoJ0dIQ18nKVxuICAgICAgfHwgZXZhclUuc3RhcnRzV2l0aCgnU1RBQ0tfJylcbiAgICAgIHx8IGV2YXJVLnN0YXJ0c1dpdGgoJ0NBQkFMXycpXG4gICAgKSB7XG4gICAgICBmZW52W2V2YXJdID0gZW52W2V2YXJdXG4gICAgfVxuICB9XG4gIHJldHVybiBmZW52XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgU3Bhd25GYWlsQXJncyB7XG4gIGRpcjogc3RyaW5nXG4gIGVycjogRXJyb3IgJiB7Y29kZT86IGFueX1cbiAgb3B0cz86IFJ1bk9wdGlvbnNcbiAgdmVycz86IEdIQ01vZFZlcnNcbiAgY2Fwcz86IEdIQ01vZENhcHNcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIG5vdGlmeVNwYXduRmFpbChhcmdzOiBSZWFkb25seTxTcGF3bkZhaWxBcmdzPikge1xuICBjb25zdCBkZWJ1Z0luZm86IFNwYXduRmFpbEFyZ3MgPSBPYmplY3QuYXNzaWduKHt9LCBhcmdzKVxuICBpZiAoYXJncy5vcHRzKSB7XG4gICAgY29uc3Qgb3B0c2Nsb25lOiBSdW5PcHRpb25zID0gT2JqZWN0LmFzc2lnbih7fSwgYXJncy5vcHRzKVxuICAgIG9wdHNjbG9uZS5lbnYgPSBmaWx0ZXJFbnYob3B0c2Nsb25lLmVudilcbiAgICBkZWJ1Z0luZm8ub3B0cyA9IG9wdHNjbG9uZVxuICB9XG4gIGF0b20ubm90aWZpY2F0aW9ucy5hZGRGYXRhbEVycm9yKFxuICAgIGBIYXNrZWxsLWdoYy1tb2Q6IGdoYy1tb2QgZmFpbGVkIHRvIGxhdW5jaC5cbkl0IGlzIHByb2JhYmx5IG1pc3Npbmcgb3IgbWlzY29uZmlndXJlZC4gJHthcmdzLmVyci5jb2RlfWAsXG4gICAge1xuICAgICAgZGV0YWlsOiBgXFxcbkVycm9yIHdhczogJHtkZWJ1Z0luZm8uZXJyLm5hbWV9XG4ke2RlYnVnSW5mby5lcnIubWVzc2FnZX1cbkRlYnVnIGluZm9ybWF0aW9uOlxuJHtKU09OLnN0cmluZ2lmeShkZWJ1Z0luZm8sIHVuZGVmaW5lZCwgMil9XG5Db25maWc6XG4ke0pTT04uc3RyaW5naWZ5KGF0b20uY29uZmlnLmdldCgnaGFza2VsbC1naGMtbW9kJyksdW5kZWZpbmVkLDIpfVxuRW52aXJvbm1lbnQgKGZpbHRlcmVkKTpcbiR7SlNPTi5zdHJpbmdpZnkoZmlsdGVyRW52KHByb2Nlc3MuZW52KSwgdW5kZWZpbmVkLCAyKX1cbmAsXG4gICAgICBzdGFjazogZGVidWdJbmZvLmVyci5zdGFjayxcbiAgICAgIGRpc21pc3NhYmxlOiB0cnVlLFxuICAgIH0sXG4gIClcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGhhbmRsZUV4Y2VwdGlvbjxUPihcbiAgdGFyZ2V0OiB7IHVwaTogVVBJLklVUElJbnN0YW5jZSB8IFByb21pc2U8VVBJLklVUElJbnN0YW5jZT4gfSwga2V5OiBzdHJpbmcsXG4gIGRlc2M6IFR5cGVkUHJvcGVydHlEZXNjcmlwdG9yPCguLi5hcmdzOiBhbnlbXSkgPT4gUHJvbWlzZTxUPj4sXG4pOiBUeXBlZFByb3BlcnR5RGVzY3JpcHRvcjwoLi4uYXJnczogYW55W10pID0+IFByb21pc2U8VD4+IHtcbiAgcmV0dXJuIHtcbiAgICAuLi5kZXNjLFxuICAgIGFzeW5jIHZhbHVlKC4uLmFyZ3M6IGFueVtdKSB7XG4gICAgICB0cnkge1xuICAgICAgICAvLyB0c2xpbnQ6ZGlzYWJsZS1uZXh0LWxpbmU6IG5vLW5vbi1udWxsLWFzc2VydGlvbiBuby11bnNhZmUtYW55XG4gICAgICAgIHJldHVybiBhd2FpdCBkZXNjLnZhbHVlIS5jYWxsKHRoaXMsIC4uLmFyZ3MpXG4gICAgICB9IGNhdGNoIChlKSB7XG4gICAgICAgIGRlYnVnKGUpXG4gICAgICAgIC8vIHRzbGludDpkaXNhYmxlLW5leHQtbGluZTogbm8tdW5zYWZlLWFueVxuICAgICAgICBjb25zdCB1cGk6IFVQSS5JVVBJSW5zdGFuY2UgPSBhd2FpdCAodGhpcyBhcyBhbnkpLnVwaVxuICAgICAgICB1cGkuc2V0U3RhdHVzKHtcbiAgICAgICAgICBzdGF0dXM6ICd3YXJuaW5nJyxcbiAgICAgICAgICAvLyB0c2xpbnQ6ZGlzYWJsZS1uZXh0LWxpbmU6IG5vLXVuc2FmZS1hbnlcbiAgICAgICAgICBkZXRhaWw6IGUudG9TdHJpbmcoKSxcbiAgICAgICAgfSlcbiAgICAgICAgLy8gVE9ETzogcmV0dXJuaW5nIGEgcHJvbWlzZSB0aGF0IG5ldmVyIHJlc29sdmVzLi4uIHVnbHksIGJ1dCB3b3Jrcz9cbiAgICAgICAgcmV0dXJuIG5ldyBQcm9taXNlKCgpID0+IHsgLyogbm9vcCAqLyB9KVxuICAgICAgfVxuICAgIH0sXG4gIH1cbn1cbiJdfQ==