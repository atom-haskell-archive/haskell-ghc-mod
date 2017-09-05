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
            ? getCabalSandbox(rootPath) : Promise.resolve();
        const stackSandbox = atom.config.get('haskell-ghc-mod.stackSandbox')
            ? getStackSandbox(rootPath, apd, Object.assign({}, env)) : Promise.resolve();
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
    const optsclone = JSON.parse(JSON.stringify(args.opts));
    optsclone.env = filterEnv(optsclone.env);
    args.opts = optsclone;
    atom.notifications.addFatalError(`Haskell-ghc-mod: ghc-mod failed to launch.
It is probably missing or misconfigured. ${args.err.code}`, {
        detail: `\
Error was: ${args.err.name}
${args.err.message}
Debug information:
${JSON.stringify(args, undefined, 2)}
Environment (filtered):
${JSON.stringify(filterEnv(process.env), undefined, 2)}
`,
        stack: args.err.stack,
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidXRpbC5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uL3NyYy91dGlsLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7Ozs7Ozs7Ozs7QUFBQSwrQkFBbUM7QUFDbkMsK0JBQThDO0FBQzlDLDZCQUE0QjtBQUM1Qix5QkFBd0I7QUFDeEIsb0NBQW1DO0FBQ25DLDJCQUF3QjtBQUN4QiwyREFBZ0Y7QUFJdkUsNkJBSkEsdUNBQWtCLENBSUE7QUFBRSxxQkFKQSwrQkFBVSxDQUlBO0FBQUUsc0JBSkEsZ0NBQVcsQ0FJQTtBQUVwRCxJQUFJLFFBQVEsR0FBcUQsRUFBRSxDQUFBO0FBQ25FLE1BQU0sT0FBTyxHQUFHLEtBQUssQ0FBQTtBQUVyQixpQkFBaUIsR0FBRyxRQUFrQjtJQUNwQyxNQUFNLEVBQUUsR0FBRyxJQUFJLENBQUMsR0FBRyxFQUFFLENBQUE7SUFDckIsUUFBUSxDQUFDLElBQUksQ0FBQztRQUNaLFNBQVMsRUFBRSxFQUFFO1FBQ2IsUUFBUTtLQUNULENBQUMsQ0FBQTtJQUNGLElBQUksRUFBRSxHQUFHLENBQUMsQ0FBQTtJQUNWLEdBQUcsQ0FBQyxDQUFDLE1BQU0sQ0FBQyxJQUFJLFFBQVEsQ0FBQyxDQUFDLENBQUM7UUFDekIsRUFBRSxDQUFDLENBQUMsQ0FBQyxFQUFFLEdBQUcsQ0FBQyxDQUFDLFNBQVMsQ0FBQyxJQUFJLE9BQU8sQ0FBQyxDQUFDLENBQUM7WUFDbEMsS0FBSyxDQUFBO1FBQ1AsQ0FBQztRQUNELEVBQUUsRUFBRSxDQUFBO0lBQ04sQ0FBQztJQUNELFFBQVEsQ0FBQyxNQUFNLENBQUMsQ0FBQyxFQUFFLEVBQUUsQ0FBQyxDQUFBO0FBQ3hCLENBQUM7QUFFRCxrQkFBa0IsRUFBWTtJQUM1QixNQUFNLEdBQUcsR0FBRyxJQUFJLEdBQUcsQ0FBQyxFQUFFLENBQUMsQ0FBQTtJQUN2QixNQUFNLENBQUMsS0FBSyxDQUFDLElBQUksQ0FBQyxHQUFHLENBQUMsQ0FBQyxJQUFJLENBQUMsZ0JBQVMsQ0FBQyxDQUFBO0FB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Q0Y7QUFDSCxDQUFDO0FBdkJELDBDQXVCQyIsInNvdXJjZXNDb250ZW50IjpbImltcG9ydCB7IFJhbmdlLCBQb2ludCB9IGZyb20gJ2F0b20nXG5pbXBvcnQgeyBkZWxpbWl0ZXIsIHNlcCwgZXh0bmFtZSB9IGZyb20gJ3BhdGgnXG5pbXBvcnQgKiBhcyBUZW1wIGZyb20gJ3RlbXAnXG5pbXBvcnQgKiBhcyBGUyBmcm9tICdmcydcbmltcG9ydCAqIGFzIENQIGZyb20gJ2NoaWxkX3Byb2Nlc3MnXG5pbXBvcnQgeyBFT0wgfSBmcm9tICdvcydcbmltcG9ydCB7IGdldFJvb3REaXJGYWxsYmFjaywgZ2V0Um9vdERpciwgaXNEaXJlY3RvcnkgfSBmcm9tICdhdG9tLWhhc2tlbGwtdXRpbHMnXG5pbXBvcnQgeyBSdW5PcHRpb25zLCBJRXJyb3JDYWxsYmFja0FyZ3MgfSBmcm9tICcuL2doYy1tb2QvZ2hjLW1vZGktcHJvY2Vzcy1yZWFsJ1xuXG50eXBlIEV4ZWNPcHRzID0gQ1AuRXhlY0ZpbGVPcHRpb25zV2l0aFN0cmluZ0VuY29kaW5nXG5leHBvcnQgeyBnZXRSb290RGlyRmFsbGJhY2ssIGdldFJvb3REaXIsIGlzRGlyZWN0b3J5LCBFeGVjT3B0cyB9XG5cbmxldCBkZWJ1Z2xvZzogQXJyYXk8eyB0aW1lc3RhbXA6IG51bWJlciwgbWVzc2FnZXM6IHN0cmluZ1tdIH0+ID0gW11cbmNvbnN0IGxvZ0tlZXAgPSAzMDAwMCAvLyBtc1xuXG5mdW5jdGlvbiBzYXZlbG9nKC4uLm1lc3NhZ2VzOiBzdHJpbmdbXSkge1xuICBjb25zdCB0cyA9IERhdGUubm93KClcbiAgZGVidWdsb2cucHVzaCh7XG4gICAgdGltZXN0YW1wOiB0cyxcbiAgICBtZXNzYWdlcyxcbiAgfSlcbiAgbGV0IGtzID0gMFxuICBmb3IgKGNvbnN0IHYgb2YgZGVidWdsb2cpIHtcbiAgICBpZiAoKHRzIC0gdi50aW1lc3RhbXApID49IGxvZ0tlZXApIHtcbiAgICAgIGJyZWFrXG4gICAgfVxuICAgIGtzKytcbiAgfVxuICBkZWJ1Z2xvZy5zcGxpY2UoMCwga3MpXG59XG5cbmZ1bmN0aW9uIGpvaW5QYXRoKGRzOiBzdHJpbmdbXSkge1xuICBjb25zdCBzZXQgPSBuZXcgU2V0KGRzKVxuICByZXR1cm4gQXJyYXkuZnJvbShzZXQpLmpvaW4oZGVsaW1pdGVyKVxufVxuXG5leHBvcnQgY29uc3QgRU9UID0gYCR7RU9MfVxceDA0JHtFT0x9YFxuXG5leHBvcnQgZnVuY3Rpb24gZGVidWcoLi4ubWVzc2FnZXM6IGFueVtdKSB7XG4gIGlmIChhdG9tLmNvbmZpZy5nZXQoJ2hhc2tlbGwtZ2hjLW1vZC5kZWJ1ZycpKSB7XG4gICAgLy8gdHNsaW50OmRpc2FibGUtbmV4dC1saW5lOiBuby1jb25zb2xlXG4gICAgY29uc29sZS5sb2coJ2hhc2tlbGwtZ2hjLW1vZCBkZWJ1ZzonLCAuLi5tZXNzYWdlcylcbiAgfVxuICBzYXZlbG9nKC4uLm1lc3NhZ2VzLm1hcCgodikgPT4gSlNPTi5zdHJpbmdpZnkodikpKVxufVxuXG5leHBvcnQgZnVuY3Rpb24gd2FybiguLi5tZXNzYWdlczogYW55W10pIHtcbiAgLy8gdHNsaW50OmRpc2FibGUtbmV4dC1saW5lOiBuby1jb25zb2xlXG4gIGNvbnNvbGUud2FybignaGFza2VsbC1naGMtbW9kIHdhcm5pbmc6JywgLi4ubWVzc2FnZXMpXG4gIHNhdmVsb2coLi4ubWVzc2FnZXMubWFwKCh2KSA9PiBKU09OLnN0cmluZ2lmeSh2KSkpXG59XG5cbmV4cG9ydCBmdW5jdGlvbiBlcnJvciguLi5tZXNzYWdlczogYW55W10pIHtcbiAgLy8gdHNsaW50OmRpc2FibGUtbmV4dC1saW5lOiBuby1jb25zb2xlXG4gIGNvbnNvbGUuZXJyb3IoJ2hhc2tlbGwtZ2hjLW1vZCBlcnJvcjonLCAuLi5tZXNzYWdlcylcbiAgc2F2ZWxvZyguLi5tZXNzYWdlcy5tYXAoKHYpID0+IEpTT04uc3RyaW5naWZ5KHYpKSlcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGdldERlYnVnTG9nKCkge1xuICBjb25zdCB0cyA9IERhdGUubm93KClcbiAgZGVidWdsb2cgPSBkZWJ1Z2xvZy5maWx0ZXIoKHsgdGltZXN0YW1wIH0pID0+ICh0cyAtIHRpbWVzdGFtcCkgPCBsb2dLZWVwKVxuICByZXR1cm4gZGVidWdsb2cubWFwKCh7IHRpbWVzdGFtcCwgbWVzc2FnZXMgfSkgPT4gYCR7KHRpbWVzdGFtcCAtIHRzKSAvIDEwMDB9czogJHttZXNzYWdlcy5qb2luKCcsJyl9YCkuam9pbihFT0wpXG59XG5cbmV4cG9ydCBhc3luYyBmdW5jdGlvbiBleGVjUHJvbWlzZShjbWQ6IHN0cmluZywgYXJnczogc3RyaW5nW10sIG9wdHM6IEV4ZWNPcHRzLCBzdGRpbj86IHN0cmluZykge1xuICByZXR1cm4gbmV3IFByb21pc2U8eyBzdGRvdXQ6IHN0cmluZywgc3RkZXJyOiBzdHJpbmcgfT4oKHJlc29sdmUsIHJlamVjdCkgPT4ge1xuICAgIGRlYnVnKGBSdW5uaW5nICR7Y21kfSAke2FyZ3N9IHdpdGggb3B0cyA9IGAsIG9wdHMpXG4gICAgY29uc3QgY2hpbGQgPSBDUC5leGVjRmlsZShjbWQsIGFyZ3MsIG9wdHMsIChlcnJvciwgc3Rkb3V0OiBzdHJpbmcsIHN0ZGVycjogc3RyaW5nKSA9PiB7XG4gICAgICBpZiAoc3RkZXJyLnRyaW0oKS5sZW5ndGggPiAwKSB7IHdhcm4oc3RkZXJyKSB9XG4gICAgICBpZiAoZXJyb3IpIHtcbiAgICAgICAgd2FybihgUnVubmluZyAke2NtZH0gJHthcmdzfSBmYWlsZWQgd2l0aCBgLCBlcnJvcilcbiAgICAgICAgaWYgKHN0ZG91dCkgeyB3YXJuKHN0ZG91dCkgfVxuICAgICAgICBlcnJvci5zdGFjayA9IChuZXcgRXJyb3IoKSkuc3RhY2tcbiAgICAgICAgcmVqZWN0KGVycm9yKVxuICAgICAgfSBlbHNlIHtcbiAgICAgICAgZGVidWcoYEdvdCByZXNwb25zZSBmcm9tICR7Y21kfSAke2FyZ3N9YCwgeyBzdGRvdXQsIHN0ZGVyciB9KVxuICAgICAgICByZXNvbHZlKHsgc3Rkb3V0LCBzdGRlcnIgfSlcbiAgICAgIH1cbiAgICB9KVxuICAgIGlmIChzdGRpbikge1xuICAgICAgZGVidWcoYHNlbmRpbmcgc3RkaW4gdGV4dCB0byAke2NtZH0gJHthcmdzfWApXG4gICAgICBjaGlsZC5zdGRpbi53cml0ZShzdGRpbilcbiAgICB9XG4gIH0pXG59XG5cbmV4cG9ydCBhc3luYyBmdW5jdGlvbiBnZXRDYWJhbFNhbmRib3gocm9vdFBhdGg6IHN0cmluZykge1xuICBkZWJ1ZygnTG9va2luZyBmb3IgY2FiYWwgc2FuZGJveC4uLicpXG4gIGNvbnN0IHNiYyA9IGF3YWl0IHBhcnNlU2FuZGJveENvbmZpZyhgJHtyb290UGF0aH0ke3NlcH1jYWJhbC5zYW5kYm94LmNvbmZpZ2ApXG4gIC8vIHRzbGludDpkaXNhYmxlOiBuby1zdHJpbmctbGl0ZXJhbFxuICBpZiAoc2JjICYmIHNiY1snaW5zdGFsbC1kaXJzJ10gJiYgc2JjWydpbnN0YWxsLWRpcnMnXVsnYmluZGlyJ10pIHtcbiAgICBjb25zdCBzYW5kYm94ID0gc2JjWydpbnN0YWxsLWRpcnMnXVsnYmluZGlyJ11cbiAgICBkZWJ1ZygnRm91bmQgY2FiYWwgc2FuZGJveDogJywgc2FuZGJveClcbiAgICBpZiAoaXNEaXJlY3Rvcnkoc2FuZGJveCkpIHtcbiAgICAgIHJldHVybiBzYW5kYm94XG4gICAgfSBlbHNlIHtcbiAgICAgIHdhcm4oJ0NhYmFsIHNhbmRib3ggJywgc2FuZGJveCwgJyBpcyBub3QgYSBkaXJlY3RvcnknKVxuICAgIH1cbiAgfSBlbHNlIHtcbiAgICB3YXJuKCdObyBjYWJhbCBzYW5kYm94IGZvdW5kJylcbiAgfVxuICAvLyB0c2xpbnQ6ZW5hYmxlOiBuby1zdHJpbmctbGl0ZXJhbFxufVxuXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gZ2V0U3RhY2tTYW5kYm94KHJvb3RQYXRoOiBzdHJpbmcsIGFwZDogc3RyaW5nW10sIGVudjogeyBba2V5OiBzdHJpbmddOiBzdHJpbmcgfCB1bmRlZmluZWQgfSkge1xuICBkZWJ1ZygnTG9va2luZyBmb3Igc3RhY2sgc2FuZGJveC4uLicpXG4gIGVudi5QQVRIID0gam9pblBhdGgoYXBkKVxuICBkZWJ1ZygnUnVubmluZyBzdGFjayB3aXRoIFBBVEggJywgZW52LlBBVEgpXG4gIHRyeSB7XG4gICAgY29uc3Qgb3V0ID0gYXdhaXQgZXhlY1Byb21pc2UoJ3N0YWNrJywgWydwYXRoJywgJy0tc25hcHNob3QtaW5zdGFsbC1yb290JywgJy0tbG9jYWwtaW5zdGFsbC1yb290JywgJy0tYmluLXBhdGgnXSwge1xuICAgICAgZW5jb2Rpbmc6ICd1dGY4JyxcbiAgICAgIGN3ZDogcm9vdFBhdGgsXG4gICAgICBlbnYsXG4gICAgICB0aW1lb3V0OiBhdG9tLmNvbmZpZy5nZXQoJ2hhc2tlbGwtZ2hjLW1vZC5pbml0VGltZW91dCcpICogMTAwMCxcbiAgICB9KVxuXG4gICAgY29uc3QgbGluZXMgPSBvdXQuc3Rkb3V0LnNwbGl0KEVPTClcbiAgICBjb25zdCBzaXIgPSBsaW5lcy5maWx0ZXIoKGwpID0+IGwuc3RhcnRzV2l0aCgnc25hcHNob3QtaW5zdGFsbC1yb290OiAnKSlbMF0uc2xpY2UoMjMpICsgYCR7c2VwfWJpbmBcbiAgICBjb25zdCBsaXIgPSBsaW5lcy5maWx0ZXIoKGwpID0+IGwuc3RhcnRzV2l0aCgnbG9jYWwtaW5zdGFsbC1yb290OiAnKSlbMF0uc2xpY2UoMjApICsgYCR7c2VwfWJpbmBcbiAgICBjb25zdCBicCA9XG4gICAgICBsaW5lcy5maWx0ZXIoKGwpID0+XG4gICAgICAgIGwuc3RhcnRzV2l0aCgnYmluLXBhdGg6ICcpKVswXS5zbGljZSgxMCkuc3BsaXQoZGVsaW1pdGVyKS5maWx0ZXIoKHApID0+XG4gICAgICAgICAgISgocCA9PT0gc2lyKSB8fCAocCA9PT0gbGlyKSB8fCAoYXBkLmluY2x1ZGVzKHApKSkpXG4gICAgZGVidWcoJ0ZvdW5kIHN0YWNrIHNhbmRib3ggJywgbGlyLCBzaXIsIC4uLmJwKVxuICAgIHJldHVybiBbbGlyLCBzaXIsIC4uLmJwXVxuICB9IGNhdGNoIChlcnIpIHtcbiAgICB3YXJuKCdObyBzdGFjayBzYW5kYm94IGZvdW5kIGJlY2F1c2UgJywgZXJyKVxuICB9XG59XG5cbmNvbnN0IHByb2Nlc3NPcHRpb25zQ2FjaGUgPSBuZXcgTWFwPHN0cmluZywgUnVuT3B0aW9ucz4oKVxuXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gZ2V0UHJvY2Vzc09wdGlvbnMocm9vdFBhdGg/OiBzdHJpbmcpOiBQcm9taXNlPFJ1bk9wdGlvbnM+IHtcbiAgaWYgKCFyb290UGF0aCkge1xuICAgIC8vIHRzbGludDpkaXNhYmxlLW5leHQtbGluZTogbm8tbnVsbC1rZXl3b3JkXG4gICAgcm9vdFBhdGggPSBnZXRSb290RGlyRmFsbGJhY2sobnVsbCkuZ2V0UGF0aCgpXG4gIH1cbiAgLy8gY2FjaGVcbiAgY29uc3QgY2FjaGVkID0gcHJvY2Vzc09wdGlvbnNDYWNoZS5nZXQocm9vdFBhdGgpXG4gIGlmIChjYWNoZWQpIHtcbiAgICByZXR1cm4gY2FjaGVkXG4gIH1cblxuICBkZWJ1ZyhgZ2V0UHJvY2Vzc09wdGlvbnMoJHtyb290UGF0aH0pYClcbiAgY29uc3QgZW52ID0geyAuLi5wcm9jZXNzLmVudiB9XG5cbiAgLy8gdHNsaW50OmRpc2FibGUtbmV4dC1saW5lOiB0b3RhbGl0eS1jaGVja1xuICBpZiAocHJvY2Vzcy5wbGF0Zm9ybSA9PT0gJ3dpbjMyJykge1xuICAgIGNvbnN0IFBBVEggPSBbXVxuICAgIGNvbnN0IGNhcE1hc2sgPSAoc3RyOiBzdHJpbmcsIG1hc2s6IG51bWJlcikgPT4ge1xuICAgICAgY29uc3QgYSA9IHN0ci5zcGxpdCgnJylcbiAgICAgIGZvciAobGV0IGkgPSAwOyBpIDwgYS5sZW5ndGg7IGkrKykge1xuICAgICAgICBpZiAobWFzayAmIE1hdGgucG93KDIsIGkpKSB7XG4gICAgICAgICAgYVtpXSA9IGFbaV0udG9VcHBlckNhc2UoKVxuICAgICAgICB9XG4gICAgICB9XG4gICAgICByZXR1cm4gYS5qb2luKCcnKVxuICAgIH1cbiAgICBmb3IgKGxldCBtID0gMGIxMTExOyBtID49IDA7IG0tLSkge1xuICAgICAgY29uc3Qgdm4gPSBjYXBNYXNrKCdwYXRoJywgbSlcbiAgICAgIGlmIChlbnZbdm5dKSB7XG4gICAgICAgIFBBVEgucHVzaChlbnZbdm5dKVxuICAgICAgfVxuICAgIH1cbiAgICBlbnYuUEFUSCA9IFBBVEguam9pbihkZWxpbWl0ZXIpXG4gIH1cblxuICBjb25zdCBQQVRIID0gZW52LlBBVEggfHwgJydcblxuICBjb25zdCBhcGQgPSBhdG9tLmNvbmZpZy5nZXQoJ2hhc2tlbGwtZ2hjLW1vZC5hZGRpdGlvbmFsUGF0aERpcmVjdG9yaWVzJykuY29uY2F0KFBBVEguc3BsaXQoZGVsaW1pdGVyKSlcbiAgY29uc3QgY2FiYWxTYW5kYm94ID0gYXRvbS5jb25maWcuZ2V0KCdoYXNrZWxsLWdoYy1tb2QuY2FiYWxTYW5kYm94JylcbiAgICA/IGdldENhYmFsU2FuZGJveChyb290UGF0aCkgOiBQcm9taXNlLnJlc29sdmUoKVxuICBjb25zdCBzdGFja1NhbmRib3ggPSBhdG9tLmNvbmZpZy5nZXQoJ2hhc2tlbGwtZ2hjLW1vZC5zdGFja1NhbmRib3gnKVxuICAgID8gZ2V0U3RhY2tTYW5kYm94KHJvb3RQYXRoLCBhcGQsIHsgLi4uZW52IH0pIDogUHJvbWlzZS5yZXNvbHZlKClcbiAgY29uc3QgW2NhYmFsU2FuZGJveERpciwgc3RhY2tTYW5kYm94RGlyc10gPSBhd2FpdCBQcm9taXNlLmFsbChbY2FiYWxTYW5kYm94LCBzdGFja1NhbmRib3hdKVxuICBjb25zdCBuZXdwID0gW11cbiAgaWYgKGNhYmFsU2FuZGJveERpcikge1xuICAgIG5ld3AucHVzaChjYWJhbFNhbmRib3hEaXIpXG4gIH1cbiAgaWYgKHN0YWNrU2FuZGJveERpcnMpIHtcbiAgICBuZXdwLnB1c2goLi4uc3RhY2tTYW5kYm94RGlycylcbiAgfVxuICBuZXdwLnB1c2goLi4uYXBkKVxuICBlbnYuUEFUSCA9IGpvaW5QYXRoKG5ld3ApXG4gIGRlYnVnKGBQQVRIID0gJHtlbnYuUEFUSH1gKVxuICBjb25zdCByZXM6IFJ1bk9wdGlvbnMgPSB7XG4gICAgY3dkOiByb290UGF0aCxcbiAgICBlbnYsXG4gICAgZW5jb2Rpbmc6ICd1dGY4JyxcbiAgICBtYXhCdWZmZXI6IEluZmluaXR5LFxuICB9XG4gIHByb2Nlc3NPcHRpb25zQ2FjaGUuc2V0KHJvb3RQYXRoLCByZXMpXG4gIHJldHVybiByZXNcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGdldFN5bWJvbEF0UG9pbnQoXG4gIGVkaXRvcjogQXRvbVR5cGVzLlRleHRFZGl0b3IsIHBvaW50OiBBdG9tVHlwZXMuUG9pbnQsXG4pIHtcbiAgY29uc3QgW3Njb3BlXSA9IGVkaXRvci5zY29wZURlc2NyaXB0b3JGb3JCdWZmZXJQb3NpdGlvbihwb2ludCkuZ2V0U2NvcGVzQXJyYXkoKS5zbGljZSgtMSlcbiAgaWYgKHNjb3BlKSB7XG4gICAgY29uc3QgcmFuZ2UgPSBlZGl0b3IuYnVmZmVyUmFuZ2VGb3JTY29wZUF0UG9zaXRpb24oc2NvcGUsIHBvaW50KVxuICAgIGlmIChyYW5nZSAmJiAhcmFuZ2UuaXNFbXB0eSgpKSB7XG4gICAgICBjb25zdCBzeW1ib2wgPSBlZGl0b3IuZ2V0VGV4dEluQnVmZmVyUmFuZ2UocmFuZ2UpXG4gICAgICByZXR1cm4geyBzY29wZSwgcmFuZ2UsIHN5bWJvbCB9XG4gICAgfVxuICB9XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBnZXRTeW1ib2xJblJhbmdlKGVkaXRvcjogQXRvbVR5cGVzLlRleHRFZGl0b3IsIGNyYW5nZTogQXRvbVR5cGVzLlJhbmdlKSB7XG4gIGNvbnN0IGJ1ZmZlciA9IGVkaXRvci5nZXRCdWZmZXIoKVxuICBpZiAoY3JhbmdlLmlzRW1wdHkoKSkge1xuICAgIHJldHVybiBnZXRTeW1ib2xBdFBvaW50KGVkaXRvciwgY3JhbmdlLnN0YXJ0KVxuICB9IGVsc2Uge1xuICAgIHJldHVybiB7XG4gICAgICBzeW1ib2w6IGJ1ZmZlci5nZXRUZXh0SW5SYW5nZShjcmFuZ2UpLFxuICAgICAgcmFuZ2U6IGNyYW5nZSxcbiAgICB9XG4gIH1cbn1cblxuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIHdpdGhUZW1wRmlsZTxUPihjb250ZW50czogc3RyaW5nLCB1cmk6IHN0cmluZywgZ2VuOiAocGF0aDogc3RyaW5nKSA9PiBQcm9taXNlPFQ+KTogUHJvbWlzZTxUPiB7XG4gIGNvbnN0IGluZm8gPSBhd2FpdCBuZXcgUHJvbWlzZTxUZW1wLk9wZW5GaWxlPihcbiAgICAocmVzb2x2ZSwgcmVqZWN0KSA9PlxuICAgICAgVGVtcC5vcGVuKFxuICAgICAgICB7IHByZWZpeDogJ2hhc2tlbGwtZ2hjLW1vZCcsIHN1ZmZpeDogZXh0bmFtZSh1cmkgfHwgJy5ocycpIH0sXG4gICAgICAgIChlcnIsIGluZm8yKSA9PiB7XG4gICAgICAgICAgaWYgKGVycikge1xuICAgICAgICAgICAgcmVqZWN0KGVycilcbiAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgcmVzb2x2ZShpbmZvMilcbiAgICAgICAgICB9XG4gICAgICAgIH0pKVxuICByZXR1cm4gbmV3IFByb21pc2U8VD4oKHJlc29sdmUsIHJlamVjdCkgPT5cbiAgICBGUy53cml0ZShpbmZvLmZkLCBjb250ZW50cywgYXN5bmMgKGVycikgPT4ge1xuICAgICAgaWYgKGVycikge1xuICAgICAgICByZWplY3QoZXJyKVxuICAgICAgfSBlbHNlIHtcbiAgICAgICAgcmVzb2x2ZShhd2FpdCBnZW4oaW5mby5wYXRoKSlcbiAgICAgICAgRlMuY2xvc2UoaW5mby5mZCwgKCkgPT4gRlMudW5saW5rKGluZm8ucGF0aCwgKCkgPT4geyAvKm5vb3AqLyB9KSlcbiAgICAgIH1cbiAgICB9KSlcbn1cblxuZXhwb3J0IHR5cGUgS25vd25FcnJvck5hbWUgPVxuICAnR0hDTW9kU3Rkb3V0RXJyb3InXG4gIHwgJ0ludGVyYWN0aXZlQWN0aW9uVGltZW91dCdcbiAgfCAnR0hDTW9kSW50ZXJhY3RpdmVDcmFzaCdcblxuZXhwb3J0IGZ1bmN0aW9uIG1rRXJyb3IobmFtZTogS25vd25FcnJvck5hbWUsIG1lc3NhZ2U6IHN0cmluZykge1xuICBjb25zdCBlcnIgPSBuZXcgRXJyb3IobWVzc2FnZSlcbiAgZXJyLm5hbWUgPSBuYW1lXG4gIHJldHVybiBlcnJcbn1cblxuZXhwb3J0IGludGVyZmFjZSBTYW5kYm94Q29uZmlnVHJlZSB7IFtrOiBzdHJpbmddOiBTYW5kYm94Q29uZmlnVHJlZSB8IHN0cmluZyB9XG5cbmV4cG9ydCBhc3luYyBmdW5jdGlvbiBwYXJzZVNhbmRib3hDb25maWcoZmlsZTogc3RyaW5nKSB7XG4gIHRyeSB7XG4gICAgY29uc3Qgc2JjID0gYXdhaXQgbmV3IFByb21pc2U8c3RyaW5nPigocmVzb2x2ZSwgcmVqZWN0KSA9PlxuICAgICAgRlMucmVhZEZpbGUoZmlsZSwgeyBlbmNvZGluZzogJ3V0Zi04JyB9LCAoZXJyLCBzYmMyKSA9PiB7XG4gICAgICAgIGlmIChlcnIpIHtcbiAgICAgICAgICByZWplY3QoZXJyKVxuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIHJlc29sdmUoc2JjMilcbiAgICAgICAgfVxuICAgICAgfSkpXG4gICAgY29uc3QgdmFyczogU2FuZGJveENvbmZpZ1RyZWUgPSB7fVxuICAgIGxldCBzY29wZSA9IHZhcnNcbiAgICBjb25zdCBydiA9ICh2OiBzdHJpbmcpID0+IHtcbiAgICAgIGZvciAoY29uc3QgazEgb2YgT2JqZWN0LmtleXMoc2NvcGUpKSB7XG4gICAgICAgIGNvbnN0IHYxID0gc2NvcGVbazFdXG4gICAgICAgIGlmICh0eXBlb2YgdjEgPT09ICdzdHJpbmcnKSB7XG4gICAgICAgICAgdiA9IHYuc3BsaXQoYCQke2sxfWApLmpvaW4odjEpXG4gICAgICAgIH1cbiAgICAgIH1cbiAgICAgIHJldHVybiB2XG4gICAgfVxuICAgIGZvciAoY29uc3QgbGluZSBvZiBzYmMuc3BsaXQoL1xccj9cXG58XFxyLykpIHtcbiAgICAgIGlmICghbGluZS5tYXRjaCgvXlxccyotLS8pICYmICFsaW5lLm1hdGNoKC9eXFxzKiQvKSkge1xuICAgICAgICBjb25zdCBbbF0gPSBsaW5lLnNwbGl0KC8tLS8pXG4gICAgICAgIGNvbnN0IG0gPSBsLm1hdGNoKC9eXFxzKihbXFx3LV0rKTpcXHMqKC4qKVxccyokLylcbiAgICAgICAgaWYgKG0pIHtcbiAgICAgICAgICBjb25zdCBbXywgbmFtZSwgdmFsXSA9IG1cbiAgICAgICAgICBzY29wZVtuYW1lXSA9IHJ2KHZhbClcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICBjb25zdCBuZXdzY29wZSA9IHt9XG4gICAgICAgICAgc2NvcGVbbGluZV0gPSBuZXdzY29wZVxuICAgICAgICAgIHNjb3BlID0gbmV3c2NvcGVcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH1cbiAgICByZXR1cm4gdmFyc1xuICB9IGNhdGNoIChlcnIpIHtcbiAgICB3YXJuKCdSZWFkaW5nIGNhYmFsIHNhbmRib3ggY29uZmlnIGZhaWxlZCB3aXRoICcsIGVycilcbiAgfVxufVxuXG4vLyBBIGRpcnR5IGhhY2sgdG8gd29yayB3aXRoIHRhYnNcbmV4cG9ydCBmdW5jdGlvbiB0YWJTaGlmdEZvclBvaW50KGJ1ZmZlcjogQXRvbVR5cGVzLlRleHRCdWZmZXIsIHBvaW50OiBBdG9tVHlwZXMuUG9pbnQpIHtcbiAgY29uc3QgbGluZSA9IGJ1ZmZlci5saW5lRm9yUm93KHBvaW50LnJvdylcbiAgY29uc3QgbWF0Y2ggPSBsaW5lID8gKGxpbmUuc2xpY2UoMCwgcG9pbnQuY29sdW1uKS5tYXRjaCgvXFx0L2cpIHx8IFtdKSA6IFtdXG4gIGNvbnN0IGNvbHVtblNoaWZ0ID0gNyAqIG1hdGNoLmxlbmd0aFxuICByZXR1cm4gbmV3IFBvaW50KHBvaW50LnJvdywgcG9pbnQuY29sdW1uICsgY29sdW1uU2hpZnQpXG59XG5cbmV4cG9ydCBmdW5jdGlvbiB0YWJTaGlmdEZvclJhbmdlKGJ1ZmZlcjogQXRvbVR5cGVzLlRleHRCdWZmZXIsIHJhbmdlOiBBdG9tVHlwZXMuUmFuZ2UpIHtcbiAgY29uc3Qgc3RhcnQgPSB0YWJTaGlmdEZvclBvaW50KGJ1ZmZlciwgcmFuZ2Uuc3RhcnQpXG4gIGNvbnN0IGVuZCA9IHRhYlNoaWZ0Rm9yUG9pbnQoYnVmZmVyLCByYW5nZS5lbmQpXG4gIHJldHVybiBuZXcgUmFuZ2Uoc3RhcnQsIGVuZClcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIHRhYlVuc2hpZnRGb3JQb2ludChidWZmZXI6IEF0b21UeXBlcy5UZXh0QnVmZmVyLCBwb2ludDogQXRvbVR5cGVzLlBvaW50KSB7XG4gIGNvbnN0IGxpbmUgPSBidWZmZXIubGluZUZvclJvdyhwb2ludC5yb3cpXG4gIGxldCBjb2x1bW5sID0gMFxuICBsZXQgY29sdW1uciA9IHBvaW50LmNvbHVtblxuICB3aGlsZSAoY29sdW1ubCA8IGNvbHVtbnIpIHtcbiAgICAvLyB0c2xpbnQ6ZGlzYWJsZS1uZXh0LWxpbmU6IHN0cmljdC10eXBlLXByZWRpY2F0ZXNcbiAgICBpZiAoKGxpbmUgPT09IHVuZGVmaW5lZCkgfHwgKGxpbmVbY29sdW1ubF0gPT09IHVuZGVmaW5lZCkpIHsgYnJlYWsgfVxuICAgIGlmIChsaW5lW2NvbHVtbmxdID09PSAnXFx0Jykge1xuICAgICAgY29sdW1uciAtPSA3XG4gICAgfVxuICAgIGNvbHVtbmwgKz0gMVxuICB9XG4gIHJldHVybiBuZXcgUG9pbnQocG9pbnQucm93LCBjb2x1bW5yKVxufVxuXG5leHBvcnQgZnVuY3Rpb24gdGFiVW5zaGlmdEZvclJhbmdlKGJ1ZmZlcjogQXRvbVR5cGVzLlRleHRCdWZmZXIsIHJhbmdlOiBBdG9tVHlwZXMuUmFuZ2UpIHtcbiAgY29uc3Qgc3RhcnQgPSB0YWJVbnNoaWZ0Rm9yUG9pbnQoYnVmZmVyLCByYW5nZS5zdGFydClcbiAgY29uc3QgZW5kID0gdGFiVW5zaGlmdEZvclBvaW50KGJ1ZmZlciwgcmFuZ2UuZW5kKVxuICByZXR1cm4gbmV3IFJhbmdlKHN0YXJ0LCBlbmQpXG59XG5cbmV4cG9ydCBmdW5jdGlvbiBpc1VwcGVyQ2FzZShjaDogc3RyaW5nKTogYm9vbGVhbiB7XG4gIHJldHVybiBjaC50b1VwcGVyQ2FzZSgpID09PSBjaFxufVxuXG5leHBvcnQgZnVuY3Rpb24gZ2V0RXJyb3JEZXRhaWwoeyBlcnIsIHJ1bkFyZ3MsIGNhcHMgfTogSUVycm9yQ2FsbGJhY2tBcmdzKSB7XG4gIHJldHVybiBgY2FwczpcbiR7SlNPTi5zdHJpbmdpZnkoY2FwcywgdW5kZWZpbmVkLCAyKX1cbkFyZ3M6XG4ke0pTT04uc3RyaW5naWZ5KHJ1bkFyZ3MsIHVuZGVmaW5lZCwgMil9XG5tZXNzYWdlOlxuJHtlcnIubWVzc2FnZX1cbmxvZzpcbiR7Z2V0RGVidWdMb2coKX1gXG59XG5cbmV4cG9ydCBmdW5jdGlvbiBmb3JtYXRFcnJvcih7IGVyciwgcnVuQXJncywgY2FwcyB9OiBJRXJyb3JDYWxsYmFja0FyZ3MpIHtcbiAgaWYgKGVyci5uYW1lID09PSAnSW50ZXJhY3RpdmVBY3Rpb25UaW1lb3V0JyAmJiBydW5BcmdzKSB7XG4gICAgcmV0dXJuIGBcXFxuSGFza2VsbC1naGMtbW9kOiBnaGMtbW9kIFxcXG4ke3J1bkFyZ3MuaW50ZXJhY3RpdmUgPyAnaW50ZXJhY3RpdmUgJyA6ICcnfWNvbW1hbmQgJHtydW5BcmdzLmNvbW1hbmR9IFxcXG50aW1lZCBvdXQuIFlvdSBjYW4gdHJ5IHRvIGZpeCBpdCBieSByYWlzaW5nICdJbnRlcmFjdGl2ZSBBY3Rpb24gXFxcblRpbWVvdXQnIHNldHRpbmcgaW4gaGFza2VsbC1naGMtbW9kIHNldHRpbmdzLmBcbiAgfSBlbHNlIGlmIChydW5BcmdzKSB7XG4gICAgcmV0dXJuIGBcXFxuSGFza2VsbC1naGMtbW9kOiBnaGMtbW9kIFxcXG4ke3J1bkFyZ3MuaW50ZXJhY3RpdmUgPyAnaW50ZXJhY3RpdmUgJyA6ICcnfWNvbW1hbmQgJHtydW5BcmdzLmNvbW1hbmR9IFxcXG5mYWlsZWQgd2l0aCBlcnJvciAke2Vyci5uYW1lfWBcbiAgfSBlbHNlIHtcbiAgICByZXR1cm4gYFRoZXJlIHdhcyBhbiB1bmV4cGVjdGVkIGVycm9yICR7ZXJyLm5hbWV9YFxuICB9XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBkZWZhdWx0RXJyb3JIYW5kbGVyKGFyZ3M6IElFcnJvckNhbGxiYWNrQXJncykge1xuICBjb25zdCB7IGVyciwgcnVuQXJncywgY2FwcyB9ID0gYXJnc1xuICBjb25zdCBzdXBwcmVzc0Vycm9ycyA9IHJ1bkFyZ3MgJiYgcnVuQXJncy5zdXBwcmVzc0Vycm9yc1xuXG4gIGlmICghc3VwcHJlc3NFcnJvcnMpIHtcbiAgICBhdG9tLm5vdGlmaWNhdGlvbnMuYWRkRXJyb3IoXG4gICAgICBmb3JtYXRFcnJvcihhcmdzKSxcbiAgICAgIHtcbiAgICAgICAgZGV0YWlsOiBnZXRFcnJvckRldGFpbChhcmdzKSxcbiAgICAgICAgc3RhY2s6IGVyci5zdGFjayxcbiAgICAgICAgZGlzbWlzc2FibGU6IHRydWUsXG4gICAgICB9LFxuICAgIClcbiAgfSBlbHNlIHtcbiAgICBlcnJvcihjYXBzLCBydW5BcmdzLCBlcnIpXG4gIH1cbn1cblxuZXhwb3J0IGZ1bmN0aW9uIHdhcm5HSENQYWNrYWdlUGF0aCgpIHtcbiAgYXRvbS5ub3RpZmljYXRpb25zLmFkZFdhcm5pbmcoXG4gICAgJ2hhc2tlbGwtZ2hjLW1vZDogWW91IGhhdmUgR0hDX1BBQ0tBR0VfUEFUSCBlbnZpcm9ubWVudCB2YXJpYWJsZSBzZXQhJyxcbiAgICB7XG4gICAgICBkaXNtaXNzYWJsZTogdHJ1ZSxcbiAgICAgIGRldGFpbDogYFxcXG5UaGlzIGNvbmZpZ3VyYXRpb24gaXMgbm90IHN1cHBvcnRlZCwgYW5kIGNhbiBicmVhayBhcmJpdHJhcmlseS4gWW91IGNhbiB0cnkgdG8gYmFuZC1haWQgaXQgYnkgYWRkaW5nXG5cbmRlbGV0ZSBwcm9jZXNzLmVudi5HSENfUEFDS0FHRV9QQVRIXG5cbnRvIHlvdXIgQXRvbSBpbml0IHNjcmlwdCAoRWRpdCDihpIgSW5pdCBTY3JpcHQuLi4pXG5cbllvdSBjYW4gc3VwcHJlc3MgdGhpcyB3YXJuaW5nIGluIGhhc2tlbGwtZ2hjLW1vZCBzZXR0aW5ncy5gLFxuICAgIH0sXG4gIClcbn1cblxuZnVuY3Rpb24gZmlsdGVyRW52KGVudjogeyBbbmFtZTogc3RyaW5nXTogc3RyaW5nIHwgdW5kZWZpbmVkIH0pIHtcbiAgY29uc3QgZmVudiA9IHt9XG4gIC8vIHRzbGludDpkaXNhYmxlLW5leHQtbGluZTogZm9yaW5cbiAgZm9yIChjb25zdCBldmFyIGluIGVudikge1xuICAgIGNvbnN0IGV2YXJVID0gZXZhci50b1VwcGVyQ2FzZSgpXG4gICAgaWYgKFxuICAgICAgZXZhclUgPT09ICdQQVRIJ1xuICAgICAgfHwgZXZhclUuc3RhcnRzV2l0aCgnR0hDXycpXG4gICAgICB8fCBldmFyVS5zdGFydHNXaXRoKCdTVEFDS18nKVxuICAgICAgfHwgZXZhclUuc3RhcnRzV2l0aCgnQ0FCQUxfJylcbiAgICApIHtcbiAgICAgIGZlbnZbZXZhcl0gPSBlbnZbZXZhcl1cbiAgICB9XG4gIH1cbiAgcmV0dXJuIGZlbnZcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIG5vdGlmeVNwYXduRmFpbChhcmdzOiB7IGRpcjogc3RyaW5nLCBlcnI6IGFueSwgb3B0czogYW55LCB2ZXJzOiBhbnksIGNhcHM6IGFueSB9KSB7XG4gIGNvbnN0IG9wdHNjbG9uZSA9IEpTT04ucGFyc2UoSlNPTi5zdHJpbmdpZnkoYXJncy5vcHRzKSlcbiAgb3B0c2Nsb25lLmVudiA9IGZpbHRlckVudihvcHRzY2xvbmUuZW52KVxuICBhcmdzLm9wdHMgPSBvcHRzY2xvbmVcbiAgYXRvbS5ub3RpZmljYXRpb25zLmFkZEZhdGFsRXJyb3IoXG4gICAgYEhhc2tlbGwtZ2hjLW1vZDogZ2hjLW1vZCBmYWlsZWQgdG8gbGF1bmNoLlxuSXQgaXMgcHJvYmFibHkgbWlzc2luZyBvciBtaXNjb25maWd1cmVkLiAke2FyZ3MuZXJyLmNvZGV9YCxcbiAgICB7XG4gICAgICBkZXRhaWw6IGBcXFxuRXJyb3Igd2FzOiAke2FyZ3MuZXJyLm5hbWV9XG4ke2FyZ3MuZXJyLm1lc3NhZ2V9XG5EZWJ1ZyBpbmZvcm1hdGlvbjpcbiR7SlNPTi5zdHJpbmdpZnkoYXJncywgdW5kZWZpbmVkLCAyKX1cbkVudmlyb25tZW50IChmaWx0ZXJlZCk6XG4ke0pTT04uc3RyaW5naWZ5KGZpbHRlckVudihwcm9jZXNzLmVudiksIHVuZGVmaW5lZCwgMil9XG5gLFxuICAgICAgc3RhY2s6IGFyZ3MuZXJyLnN0YWNrLFxuICAgICAgZGlzbWlzc2FibGU6IHRydWUsXG4gICAgfSxcbiAgKVxufVxuXG5leHBvcnQgZnVuY3Rpb24gaGFuZGxlRXhjZXB0aW9uPFQ+KFxuICB0YXJnZXQ6IHsgdXBpOiBVUEkuSVVQSUluc3RhbmNlIHwgUHJvbWlzZTxVUEkuSVVQSUluc3RhbmNlPiB9LCBrZXk6IHN0cmluZyxcbiAgZGVzYzogVHlwZWRQcm9wZXJ0eURlc2NyaXB0b3I8KC4uLmFyZ3M6IGFueVtdKSA9PiBQcm9taXNlPFQ+Pixcbik6IFR5cGVkUHJvcGVydHlEZXNjcmlwdG9yPCguLi5hcmdzOiBhbnlbXSkgPT4gUHJvbWlzZTxUPj4ge1xuICByZXR1cm4ge1xuICAgIC4uLmRlc2MsXG4gICAgYXN5bmMgdmFsdWUoLi4uYXJnczogYW55W10pIHtcbiAgICAgIHRyeSB7XG4gICAgICAgIC8vIHRzbGludDpkaXNhYmxlLW5leHQtbGluZTogbm8tbm9uLW51bGwtYXNzZXJ0aW9uXG4gICAgICAgIHJldHVybiBhd2FpdCBkZXNjLnZhbHVlIS5jYWxsKHRoaXMsIC4uLmFyZ3MpXG4gICAgICB9IGNhdGNoIChlKSB7XG4gICAgICAgIC8vIHRzbGludDpkaXNhYmxlLW5leHQtbGluZTogbm8tY29uc29sZVxuICAgICAgICBkZWJ1ZyhlKVxuICAgICAgICBjb25zdCB1cGk6IFVQSS5JVVBJSW5zdGFuY2UgPSBhd2FpdCAodGhpcyBhcyBhbnkpLnVwaVxuICAgICAgICB1cGkuc2V0U3RhdHVzKHtcbiAgICAgICAgICBzdGF0dXM6ICd3YXJuaW5nJyxcbiAgICAgICAgICBkZXRhaWw6IGUudG9TdHJpbmcoKSxcbiAgICAgICAgfSlcbiAgICAgICAgLy8gVE9ETzogcmV0dXJuaW5nIGEgcHJvbWlzZSB0aGF0IG5ldmVyIHJlc29sdmVzLi4uIHVnbHksIGJ1dCB3b3Jrcz9cbiAgICAgICAgcmV0dXJuIG5ldyBQcm9taXNlKCgpID0+IHsgLyogbm9vcCAqLyB9KVxuICAgICAgfVxuICAgIH0sXG4gIH1cbn1cbiJdfQ==