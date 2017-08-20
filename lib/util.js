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
    debuglog = debuglog.filter(({ timestamp }) => (ts - timestamp) < logKeep);
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidXRpbC5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uL3NyYy91dGlsLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7Ozs7Ozs7Ozs7QUFBQSwrQkFBbUM7QUFDbkMsK0JBQThDO0FBQzlDLDZCQUE0QjtBQUM1Qix5QkFBd0I7QUFDeEIsb0NBQW1DO0FBQ25DLDJCQUF3QjtBQUN4QiwyREFBZ0Y7QUFJdkUsNkJBSkEsdUNBQWtCLENBSUE7QUFBRSxxQkFKQSwrQkFBVSxDQUlBO0FBQUUsc0JBSkEsZ0NBQVcsQ0FJQTtBQUVwRCxJQUFJLFFBQVEsR0FBcUQsRUFBRSxDQUFBO0FBQ25FLE1BQU0sT0FBTyxHQUFHLEtBQUssQ0FBQTtBQUVyQixpQkFBaUIsR0FBRyxRQUFrQjtJQUNwQyxNQUFNLEVBQUUsR0FBRyxJQUFJLENBQUMsR0FBRyxFQUFFLENBQUE7SUFDckIsUUFBUSxDQUFDLElBQUksQ0FBQztRQUNaLFNBQVMsRUFBRSxFQUFFO1FBQ2IsUUFBUTtLQUNULENBQUMsQ0FBQTtJQUNGLFFBQVEsR0FBRyxRQUFRLENBQUMsTUFBTSxDQUFDLENBQUMsRUFBRSxTQUFTLEVBQUUsS0FBSyxDQUFDLEVBQUUsR0FBRyxTQUFTLENBQUMsR0FBRyxPQUFPLENBQUMsQ0FBQTtBQUMzRSxDQUFDO0FBRUQsa0JBQWtCLEVBQVk7SUFDNUIsTUFBTSxHQUFHLEdBQUcsSUFBSSxHQUFHLENBQUMsRUFBRSxDQUFDLENBQUE7SUFDdkIsTUFBTSxDQUFDLEtBQUssQ0FBQyxJQUFJLENBQUMsR0FBRyxDQUFDLENBQUMsSUFBSSxDQUFDLGdCQUFTLENBQUMsQ0FBQTtBQUN4QyxDQUFDO0FBRVksUUFBQSxHQUFHLEdBQUcsR0FBRyxRQUFHLE9BQU8sUUFBRyxFQUFFLENBQUE7QUFFckMsZUFBc0IsR0FBRyxRQUFlO0lBQ3RDLEVBQUUsQ0FBQyxDQUFDLElBQUksQ0FBQyxNQUFNLENBQUMsR0FBRyxDQUFDLHVCQUF1QixDQUFDLENBQUMsQ0FBQyxDQUFDO1FBRTdDLE9B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LENBQUMsU0FBUyxDQUFDLElBQUksRUFBRSxTQUFTLEVBQUUsQ0FBQyxDQUFDOztFQUVsQyxJQUFJLENBQUMsU0FBUyxDQUFDLFNBQVMsQ0FBQyxPQUFPLENBQUMsR0FBRyxDQUFDLEVBQUUsU0FBUyxFQUFFLENBQUMsQ0FBQztDQUNyRDtRQUNLLEtBQUssRUFBRSxJQUFJLENBQUMsR0FBRyxDQUFDLEtBQUs7UUFDckIsV0FBVyxFQUFFLElBQUk7S0FDbEIsQ0FDRixDQUFBO0FBQ0gsQ0FBQztBQXBCRCwwQ0FvQkM7QUFFRCx5QkFDRSxNQUE2RCxFQUFFLEdBQVcsRUFDMUUsSUFBNkQ7SUFFN0QsTUFBTSxtQkFDRCxJQUFJLElBQ0QsS0FBSyxDQUFDLEdBQUcsSUFBVzs7Z0JBQ3hCLElBQUksQ0FBQztvQkFFSCxNQUFNLENBQUMsTUFBTSxJQUFJLENBQUMsS0FBTSxDQUFDLElBQUksQ0FBQyxJQUFJLEVBQUUsR0FBRyxJQUFJLENBQUMsQ0FBQTtnQkFDOUMsQ0FBQztnQkFBQyxLQUFLLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDO29CQUVYLEtBQUssQ0FBQyxDQUFDLENBQUMsQ0FBQTtvQkFDUixNQUFNLEdBQUcsR0FBcUIsTUFBTyxJQUFZLENBQUMsR0FBRyxDQUFBO29CQUNyRCxHQUFHLENBQUMsU0FBUyxDQUFDO3dCQUNaLE1BQU0sRUFBRSxTQUFTO3dCQUNqQixNQUFNLEVBQUUsQ0FBQyxDQUFDLFFBQVEsRUFBRTtxQkFDckIsQ0FBQyxDQUFBO29CQUVGLE1BQU0sQ0FBQyxJQUFJLE9BQU8sQ0FBQyxRQUFtQixDQUFDLENBQUMsQ0FBQTtnQkFDMUMsQ0FBQztZQUNILENBQUM7U0FBQSxJQUNGO0FBQ0gsQ0FBQztBQXZCRCwwQ0F1QkMiLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgeyBSYW5nZSwgUG9pbnQgfSBmcm9tICdhdG9tJ1xuaW1wb3J0IHsgZGVsaW1pdGVyLCBzZXAsIGV4dG5hbWUgfSBmcm9tICdwYXRoJ1xuaW1wb3J0ICogYXMgVGVtcCBmcm9tICd0ZW1wJ1xuaW1wb3J0ICogYXMgRlMgZnJvbSAnZnMnXG5pbXBvcnQgKiBhcyBDUCBmcm9tICdjaGlsZF9wcm9jZXNzJ1xuaW1wb3J0IHsgRU9MIH0gZnJvbSAnb3MnXG5pbXBvcnQgeyBnZXRSb290RGlyRmFsbGJhY2ssIGdldFJvb3REaXIsIGlzRGlyZWN0b3J5IH0gZnJvbSAnYXRvbS1oYXNrZWxsLXV0aWxzJ1xuaW1wb3J0IHsgUnVuT3B0aW9ucywgSUVycm9yQ2FsbGJhY2tBcmdzIH0gZnJvbSAnLi9naGMtbW9kL2doYy1tb2RpLXByb2Nlc3MtcmVhbCdcblxudHlwZSBFeGVjT3B0cyA9IENQLkV4ZWNGaWxlT3B0aW9uc1dpdGhTdHJpbmdFbmNvZGluZ1xuZXhwb3J0IHsgZ2V0Um9vdERpckZhbGxiYWNrLCBnZXRSb290RGlyLCBpc0RpcmVjdG9yeSwgRXhlY09wdHMgfVxuXG5sZXQgZGVidWdsb2c6IEFycmF5PHsgdGltZXN0YW1wOiBudW1iZXIsIG1lc3NhZ2VzOiBzdHJpbmdbXSB9PiA9IFtdXG5jb25zdCBsb2dLZWVwID0gMzAwMDAgLy8gbXNcblxuZnVuY3Rpb24gc2F2ZWxvZyguLi5tZXNzYWdlczogc3RyaW5nW10pIHtcbiAgY29uc3QgdHMgPSBEYXRlLm5vdygpXG4gIGRlYnVnbG9nLnB1c2goe1xuICAgIHRpbWVzdGFtcDogdHMsXG4gICAgbWVzc2FnZXMsXG4gIH0pXG4gIGRlYnVnbG9nID0gZGVidWdsb2cuZmlsdGVyKCh7IHRpbWVzdGFtcCB9KSA9PiAodHMgLSB0aW1lc3RhbXApIDwgbG9nS2VlcClcbn1cblxuZnVuY3Rpb24gam9pblBhdGgoZHM6IHN0cmluZ1tdKSB7XG4gIGNvbnN0IHNldCA9IG5ldyBTZXQoZHMpXG4gIHJldHVybiBBcnJheS5mcm9tKHNldCkuam9pbihkZWxpbWl0ZXIpXG59XG5cbmV4cG9ydCBjb25zdCBFT1QgPSBgJHtFT0x9XFx4MDQke0VPTH1gXG5cbmV4cG9ydCBmdW5jdGlvbiBkZWJ1ZyguLi5tZXNzYWdlczogYW55W10pIHtcbiAgaWYgKGF0b20uY29uZmlnLmdldCgnaGFza2VsbC1naGMtbW9kLmRlYnVnJykpIHtcbiAgICAvLyB0c2xpbnQ6ZGlzYWJsZS1uZXh0LWxpbmU6IG5vLWNvbnNvbGVcbiAgICBjb25zb2xlLmxvZygnaGFza2VsbC1naGMtbW9kIGRlYnVnOicsIC4uLm1lc3NhZ2VzKVxuICB9XG4gIHNhdmVsb2coLi4ubWVzc2FnZXMubWFwKCh2KSA9PiBKU09OLnN0cmluZ2lmeSh2KSkpXG59XG5cbmV4cG9ydCBmdW5jdGlvbiB3YXJuKC4uLm1lc3NhZ2VzOiBhbnlbXSkge1xuICAvLyB0c2xpbnQ6ZGlzYWJsZS1uZXh0LWxpbmU6IG5vLWNvbnNvbGVcbiAgY29uc29sZS53YXJuKCdoYXNrZWxsLWdoYy1tb2Qgd2FybmluZzonLCAuLi5tZXNzYWdlcylcbiAgc2F2ZWxvZyguLi5tZXNzYWdlcy5tYXAoKHYpID0+IEpTT04uc3RyaW5naWZ5KHYpKSlcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGVycm9yKC4uLm1lc3NhZ2VzOiBhbnlbXSkge1xuICAvLyB0c2xpbnQ6ZGlzYWJsZS1uZXh0LWxpbmU6IG5vLWNvbnNvbGVcbiAgY29uc29sZS5lcnJvcignaGFza2VsbC1naGMtbW9kIGVycm9yOicsIC4uLm1lc3NhZ2VzKVxuICBzYXZlbG9nKC4uLm1lc3NhZ2VzLm1hcCgodikgPT4gSlNPTi5zdHJpbmdpZnkodikpKVxufVxuXG5leHBvcnQgZnVuY3Rpb24gZ2V0RGVidWdMb2coKSB7XG4gIGNvbnN0IHRzID0gRGF0ZS5ub3coKVxuICBkZWJ1Z2xvZyA9IGRlYnVnbG9nLmZpbHRlcigoeyB0aW1lc3RhbXAgfSkgPT4gKHRzIC0gdGltZXN0YW1wKSA8IGxvZ0tlZXApXG4gIHJldHVybiBkZWJ1Z2xvZy5tYXAoKHsgdGltZXN0YW1wLCBtZXNzYWdlcyB9KSA9PiBgJHsodGltZXN0YW1wIC0gdHMpIC8gMTAwMH1zOiAke21lc3NhZ2VzLmpvaW4oJywnKX1gKS5qb2luKEVPTClcbn1cblxuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIGV4ZWNQcm9taXNlKGNtZDogc3RyaW5nLCBhcmdzOiBzdHJpbmdbXSwgb3B0czogRXhlY09wdHMsIHN0ZGluPzogc3RyaW5nKSB7XG4gIHJldHVybiBuZXcgUHJvbWlzZTx7IHN0ZG91dDogc3RyaW5nLCBzdGRlcnI6IHN0cmluZyB9PigocmVzb2x2ZSwgcmVqZWN0KSA9PiB7XG4gICAgZGVidWcoYFJ1bm5pbmcgJHtjbWR9ICR7YXJnc30gd2l0aCBvcHRzID0gYCwgb3B0cylcbiAgICBjb25zdCBjaGlsZCA9IENQLmV4ZWNGaWxlKGNtZCwgYXJncywgb3B0cywgKGVycm9yLCBzdGRvdXQ6IHN0cmluZywgc3RkZXJyOiBzdHJpbmcpID0+IHtcbiAgICAgIGlmIChzdGRlcnIudHJpbSgpLmxlbmd0aCA+IDApIHsgd2FybihzdGRlcnIpIH1cbiAgICAgIGlmIChlcnJvcikge1xuICAgICAgICB3YXJuKGBSdW5uaW5nICR7Y21kfSAke2FyZ3N9IGZhaWxlZCB3aXRoIGAsIGVycm9yKVxuICAgICAgICBpZiAoc3Rkb3V0KSB7IHdhcm4oc3Rkb3V0KSB9XG4gICAgICAgIGVycm9yLnN0YWNrID0gKG5ldyBFcnJvcigpKS5zdGFja1xuICAgICAgICByZWplY3QoZXJyb3IpXG4gICAgICB9IGVsc2Uge1xuICAgICAgICBkZWJ1ZyhgR290IHJlc3BvbnNlIGZyb20gJHtjbWR9ICR7YXJnc31gLCB7IHN0ZG91dCwgc3RkZXJyIH0pXG4gICAgICAgIHJlc29sdmUoeyBzdGRvdXQsIHN0ZGVyciB9KVxuICAgICAgfVxuICAgIH0pXG4gICAgaWYgKHN0ZGluKSB7XG4gICAgICBkZWJ1Zyhgc2VuZGluZyBzdGRpbiB0ZXh0IHRvICR7Y21kfSAke2FyZ3N9YClcbiAgICAgIGNoaWxkLnN0ZGluLndyaXRlKHN0ZGluKVxuICAgIH1cbiAgfSlcbn1cblxuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIGdldENhYmFsU2FuZGJveChyb290UGF0aDogc3RyaW5nKSB7XG4gIGRlYnVnKCdMb29raW5nIGZvciBjYWJhbCBzYW5kYm94Li4uJylcbiAgY29uc3Qgc2JjID0gYXdhaXQgcGFyc2VTYW5kYm94Q29uZmlnKGAke3Jvb3RQYXRofSR7c2VwfWNhYmFsLnNhbmRib3guY29uZmlnYClcbiAgLy8gdHNsaW50OmRpc2FibGU6IG5vLXN0cmluZy1saXRlcmFsXG4gIGlmIChzYmMgJiYgc2JjWydpbnN0YWxsLWRpcnMnXSAmJiBzYmNbJ2luc3RhbGwtZGlycyddWydiaW5kaXInXSkge1xuICAgIGNvbnN0IHNhbmRib3ggPSBzYmNbJ2luc3RhbGwtZGlycyddWydiaW5kaXInXVxuICAgIGRlYnVnKCdGb3VuZCBjYWJhbCBzYW5kYm94OiAnLCBzYW5kYm94KVxuICAgIGlmIChpc0RpcmVjdG9yeShzYW5kYm94KSkge1xuICAgICAgcmV0dXJuIHNhbmRib3hcbiAgICB9IGVsc2Uge1xuICAgICAgd2FybignQ2FiYWwgc2FuZGJveCAnLCBzYW5kYm94LCAnIGlzIG5vdCBhIGRpcmVjdG9yeScpXG4gICAgfVxuICB9IGVsc2Uge1xuICAgIHdhcm4oJ05vIGNhYmFsIHNhbmRib3ggZm91bmQnKVxuICB9XG4gIC8vIHRzbGludDplbmFibGU6IG5vLXN0cmluZy1saXRlcmFsXG59XG5cbmV4cG9ydCBhc3luYyBmdW5jdGlvbiBnZXRTdGFja1NhbmRib3gocm9vdFBhdGg6IHN0cmluZywgYXBkOiBzdHJpbmdbXSwgZW52OiB7IFtrZXk6IHN0cmluZ106IHN0cmluZyB8IHVuZGVmaW5lZCB9KSB7XG4gIGRlYnVnKCdMb29raW5nIGZvciBzdGFjayBzYW5kYm94Li4uJylcbiAgZW52LlBBVEggPSBqb2luUGF0aChhcGQpXG4gIGRlYnVnKCdSdW5uaW5nIHN0YWNrIHdpdGggUEFUSCAnLCBlbnYuUEFUSClcbiAgdHJ5IHtcbiAgICBjb25zdCBvdXQgPSBhd2FpdCBleGVjUHJvbWlzZSgnc3RhY2snLCBbJ3BhdGgnLCAnLS1zbmFwc2hvdC1pbnN0YWxsLXJvb3QnLCAnLS1sb2NhbC1pbnN0YWxsLXJvb3QnLCAnLS1iaW4tcGF0aCddLCB7XG4gICAgICBlbmNvZGluZzogJ3V0ZjgnLFxuICAgICAgY3dkOiByb290UGF0aCxcbiAgICAgIGVudixcbiAgICAgIHRpbWVvdXQ6IGF0b20uY29uZmlnLmdldCgnaGFza2VsbC1naGMtbW9kLmluaXRUaW1lb3V0JykgKiAxMDAwLFxuICAgIH0pXG5cbiAgICBjb25zdCBsaW5lcyA9IG91dC5zdGRvdXQuc3BsaXQoRU9MKVxuICAgIGNvbnN0IHNpciA9IGxpbmVzLmZpbHRlcigobCkgPT4gbC5zdGFydHNXaXRoKCdzbmFwc2hvdC1pbnN0YWxsLXJvb3Q6ICcpKVswXS5zbGljZSgyMykgKyBgJHtzZXB9YmluYFxuICAgIGNvbnN0IGxpciA9IGxpbmVzLmZpbHRlcigobCkgPT4gbC5zdGFydHNXaXRoKCdsb2NhbC1pbnN0YWxsLXJvb3Q6ICcpKVswXS5zbGljZSgyMCkgKyBgJHtzZXB9YmluYFxuICAgIGNvbnN0IGJwID1cbiAgICAgIGxpbmVzLmZpbHRlcigobCkgPT5cbiAgICAgICAgbC5zdGFydHNXaXRoKCdiaW4tcGF0aDogJykpWzBdLnNsaWNlKDEwKS5zcGxpdChkZWxpbWl0ZXIpLmZpbHRlcigocCkgPT5cbiAgICAgICAgICAhKChwID09PSBzaXIpIHx8IChwID09PSBsaXIpIHx8IChhcGQuaW5jbHVkZXMocCkpKSlcbiAgICBkZWJ1ZygnRm91bmQgc3RhY2sgc2FuZGJveCAnLCBsaXIsIHNpciwgLi4uYnApXG4gICAgcmV0dXJuIFtsaXIsIHNpciwgLi4uYnBdXG4gIH0gY2F0Y2ggKGVycikge1xuICAgIHdhcm4oJ05vIHN0YWNrIHNhbmRib3ggZm91bmQgYmVjYXVzZSAnLCBlcnIpXG4gIH1cbn1cblxuY29uc3QgcHJvY2Vzc09wdGlvbnNDYWNoZSA9IG5ldyBNYXA8c3RyaW5nLCBSdW5PcHRpb25zPigpXG5cbmV4cG9ydCBhc3luYyBmdW5jdGlvbiBnZXRQcm9jZXNzT3B0aW9ucyhyb290UGF0aD86IHN0cmluZyk6IFByb21pc2U8UnVuT3B0aW9ucz4ge1xuICBpZiAoIXJvb3RQYXRoKSB7XG4gICAgLy8gdHNsaW50OmRpc2FibGUtbmV4dC1saW5lOiBuby1udWxsLWtleXdvcmRcbiAgICByb290UGF0aCA9IGdldFJvb3REaXJGYWxsYmFjayhudWxsKS5nZXRQYXRoKClcbiAgfVxuICAvLyBjYWNoZVxuICBjb25zdCBjYWNoZWQgPSBwcm9jZXNzT3B0aW9uc0NhY2hlLmdldChyb290UGF0aClcbiAgaWYgKGNhY2hlZCkge1xuICAgIHJldHVybiBjYWNoZWRcbiAgfVxuXG4gIGRlYnVnKGBnZXRQcm9jZXNzT3B0aW9ucygke3Jvb3RQYXRofSlgKVxuICBjb25zdCBlbnYgPSB7IC4uLnByb2Nlc3MuZW52IH1cblxuICAvLyB0c2xpbnQ6ZGlzYWJsZS1uZXh0LWxpbmU6IHRvdGFsaXR5LWNoZWNrXG4gIGlmIChwcm9jZXNzLnBsYXRmb3JtID09PSAnd2luMzInKSB7XG4gICAgY29uc3QgUEFUSCA9IFtdXG4gICAgY29uc3QgY2FwTWFzayA9IChzdHI6IHN0cmluZywgbWFzazogbnVtYmVyKSA9PiB7XG4gICAgICBjb25zdCBhID0gc3RyLnNwbGl0KCcnKVxuICAgICAgZm9yIChsZXQgaSA9IDA7IGkgPCBhLmxlbmd0aDsgaSsrKSB7XG4gICAgICAgIGlmIChtYXNrICYgTWF0aC5wb3coMiwgaSkpIHtcbiAgICAgICAgICBhW2ldID0gYVtpXS50b1VwcGVyQ2FzZSgpXG4gICAgICAgIH1cbiAgICAgIH1cbiAgICAgIHJldHVybiBhLmpvaW4oJycpXG4gICAgfVxuICAgIGZvciAobGV0IG0gPSAwYjExMTE7IG0gPj0gMDsgbS0tKSB7XG4gICAgICBjb25zdCB2biA9IGNhcE1hc2soJ3BhdGgnLCBtKVxuICAgICAgaWYgKGVudlt2bl0pIHtcbiAgICAgICAgUEFUSC5wdXNoKGVudlt2bl0pXG4gICAgICB9XG4gICAgfVxuICAgIGVudi5QQVRIID0gUEFUSC5qb2luKGRlbGltaXRlcilcbiAgfVxuXG4gIGNvbnN0IFBBVEggPSBlbnYuUEFUSCB8fCAnJ1xuXG4gIGNvbnN0IGFwZCA9IGF0b20uY29uZmlnLmdldCgnaGFza2VsbC1naGMtbW9kLmFkZGl0aW9uYWxQYXRoRGlyZWN0b3JpZXMnKS5jb25jYXQoUEFUSC5zcGxpdChkZWxpbWl0ZXIpKVxuICBjb25zdCBjYWJhbFNhbmRib3ggPSBhdG9tLmNvbmZpZy5nZXQoJ2hhc2tlbGwtZ2hjLW1vZC5jYWJhbFNhbmRib3gnKVxuICAgID8gZ2V0Q2FiYWxTYW5kYm94KHJvb3RQYXRoKSA6IFByb21pc2UucmVzb2x2ZSgpXG4gIGNvbnN0IHN0YWNrU2FuZGJveCA9IGF0b20uY29uZmlnLmdldCgnaGFza2VsbC1naGMtbW9kLnN0YWNrU2FuZGJveCcpXG4gICAgPyBnZXRTdGFja1NhbmRib3gocm9vdFBhdGgsIGFwZCwgeyAuLi5lbnYgfSkgOiBQcm9taXNlLnJlc29sdmUoKVxuICBjb25zdCBbY2FiYWxTYW5kYm94RGlyLCBzdGFja1NhbmRib3hEaXJzXSA9IGF3YWl0IFByb21pc2UuYWxsKFtjYWJhbFNhbmRib3gsIHN0YWNrU2FuZGJveF0pXG4gIGNvbnN0IG5ld3AgPSBbXVxuICBpZiAoY2FiYWxTYW5kYm94RGlyKSB7XG4gICAgbmV3cC5wdXNoKGNhYmFsU2FuZGJveERpcilcbiAgfVxuICBpZiAoc3RhY2tTYW5kYm94RGlycykge1xuICAgIG5ld3AucHVzaCguLi5zdGFja1NhbmRib3hEaXJzKVxuICB9XG4gIG5ld3AucHVzaCguLi5hcGQpXG4gIGVudi5QQVRIID0gam9pblBhdGgobmV3cClcbiAgZGVidWcoYFBBVEggPSAke2Vudi5QQVRIfWApXG4gIGNvbnN0IHJlczogUnVuT3B0aW9ucyA9IHtcbiAgICBjd2Q6IHJvb3RQYXRoLFxuICAgIGVudixcbiAgICBlbmNvZGluZzogJ3V0ZjgnLFxuICAgIG1heEJ1ZmZlcjogSW5maW5pdHksXG4gIH1cbiAgcHJvY2Vzc09wdGlvbnNDYWNoZS5zZXQocm9vdFBhdGgsIHJlcylcbiAgcmV0dXJuIHJlc1xufVxuXG5leHBvcnQgZnVuY3Rpb24gZ2V0U3ltYm9sQXRQb2ludChcbiAgZWRpdG9yOiBBdG9tVHlwZXMuVGV4dEVkaXRvciwgcG9pbnQ6IEF0b21UeXBlcy5Qb2ludCxcbikge1xuICBjb25zdCBbc2NvcGVdID0gZWRpdG9yLnNjb3BlRGVzY3JpcHRvckZvckJ1ZmZlclBvc2l0aW9uKHBvaW50KS5nZXRTY29wZXNBcnJheSgpLnNsaWNlKC0xKVxuICBpZiAoc2NvcGUpIHtcbiAgICBjb25zdCByYW5nZSA9IGVkaXRvci5idWZmZXJSYW5nZUZvclNjb3BlQXRQb3NpdGlvbihzY29wZSwgcG9pbnQpXG4gICAgaWYgKHJhbmdlICYmICFyYW5nZS5pc0VtcHR5KCkpIHtcbiAgICAgIGNvbnN0IHN5bWJvbCA9IGVkaXRvci5nZXRUZXh0SW5CdWZmZXJSYW5nZShyYW5nZSlcbiAgICAgIHJldHVybiB7IHNjb3BlLCByYW5nZSwgc3ltYm9sIH1cbiAgICB9XG4gIH1cbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGdldFN5bWJvbEluUmFuZ2UoZWRpdG9yOiBBdG9tVHlwZXMuVGV4dEVkaXRvciwgY3JhbmdlOiBBdG9tVHlwZXMuUmFuZ2UpIHtcbiAgY29uc3QgYnVmZmVyID0gZWRpdG9yLmdldEJ1ZmZlcigpXG4gIGlmIChjcmFuZ2UuaXNFbXB0eSgpKSB7XG4gICAgcmV0dXJuIGdldFN5bWJvbEF0UG9pbnQoZWRpdG9yLCBjcmFuZ2Uuc3RhcnQpXG4gIH0gZWxzZSB7XG4gICAgcmV0dXJuIHtcbiAgICAgIHN5bWJvbDogYnVmZmVyLmdldFRleHRJblJhbmdlKGNyYW5nZSksXG4gICAgICByYW5nZTogY3JhbmdlLFxuICAgIH1cbiAgfVxufVxuXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gd2l0aFRlbXBGaWxlPFQ+KGNvbnRlbnRzOiBzdHJpbmcsIHVyaTogc3RyaW5nLCBnZW46IChwYXRoOiBzdHJpbmcpID0+IFByb21pc2U8VD4pOiBQcm9taXNlPFQ+IHtcbiAgY29uc3QgaW5mbyA9IGF3YWl0IG5ldyBQcm9taXNlPFRlbXAuT3BlbkZpbGU+KFxuICAgIChyZXNvbHZlLCByZWplY3QpID0+XG4gICAgICBUZW1wLm9wZW4oXG4gICAgICAgIHsgcHJlZml4OiAnaGFza2VsbC1naGMtbW9kJywgc3VmZml4OiBleHRuYW1lKHVyaSB8fCAnLmhzJykgfSxcbiAgICAgICAgKGVyciwgaW5mbzIpID0+IHtcbiAgICAgICAgICBpZiAoZXJyKSB7XG4gICAgICAgICAgICByZWplY3QoZXJyKVxuICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICByZXNvbHZlKGluZm8yKVxuICAgICAgICAgIH1cbiAgICAgICAgfSkpXG4gIHJldHVybiBuZXcgUHJvbWlzZTxUPigocmVzb2x2ZSwgcmVqZWN0KSA9PlxuICAgIEZTLndyaXRlKGluZm8uZmQsIGNvbnRlbnRzLCBhc3luYyAoZXJyKSA9PiB7XG4gICAgICBpZiAoZXJyKSB7XG4gICAgICAgIHJlamVjdChlcnIpXG4gICAgICB9IGVsc2Uge1xuICAgICAgICByZXNvbHZlKGF3YWl0IGdlbihpbmZvLnBhdGgpKVxuICAgICAgICBGUy5jbG9zZShpbmZvLmZkLCAoKSA9PiBGUy51bmxpbmsoaW5mby5wYXRoLCAoKSA9PiB7IC8qbm9vcCovIH0pKVxuICAgICAgfVxuICAgIH0pKVxufVxuXG5leHBvcnQgdHlwZSBLbm93bkVycm9yTmFtZSA9XG4gICdHSENNb2RTdGRvdXRFcnJvcidcbiAgfCAnSW50ZXJhY3RpdmVBY3Rpb25UaW1lb3V0J1xuICB8ICdHSENNb2RJbnRlcmFjdGl2ZUNyYXNoJ1xuXG5leHBvcnQgZnVuY3Rpb24gbWtFcnJvcihuYW1lOiBLbm93bkVycm9yTmFtZSwgbWVzc2FnZTogc3RyaW5nKSB7XG4gIGNvbnN0IGVyciA9IG5ldyBFcnJvcihtZXNzYWdlKVxuICBlcnIubmFtZSA9IG5hbWVcbiAgcmV0dXJuIGVyclxufVxuXG5leHBvcnQgaW50ZXJmYWNlIFNhbmRib3hDb25maWdUcmVlIHsgW2s6IHN0cmluZ106IFNhbmRib3hDb25maWdUcmVlIHwgc3RyaW5nIH1cblxuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIHBhcnNlU2FuZGJveENvbmZpZyhmaWxlOiBzdHJpbmcpIHtcbiAgdHJ5IHtcbiAgICBjb25zdCBzYmMgPSBhd2FpdCBuZXcgUHJvbWlzZTxzdHJpbmc+KChyZXNvbHZlLCByZWplY3QpID0+XG4gICAgICBGUy5yZWFkRmlsZShmaWxlLCB7IGVuY29kaW5nOiAndXRmLTgnIH0sIChlcnIsIHNiYzIpID0+IHtcbiAgICAgICAgaWYgKGVycikge1xuICAgICAgICAgIHJlamVjdChlcnIpXG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgcmVzb2x2ZShzYmMyKVxuICAgICAgICB9XG4gICAgICB9KSlcbiAgICBjb25zdCB2YXJzOiBTYW5kYm94Q29uZmlnVHJlZSA9IHt9XG4gICAgbGV0IHNjb3BlID0gdmFyc1xuICAgIGNvbnN0IHJ2ID0gKHY6IHN0cmluZykgPT4ge1xuICAgICAgZm9yIChjb25zdCBrMSBvZiBPYmplY3Qua2V5cyhzY29wZSkpIHtcbiAgICAgICAgY29uc3QgdjEgPSBzY29wZVtrMV1cbiAgICAgICAgaWYgKHR5cGVvZiB2MSA9PT0gJ3N0cmluZycpIHtcbiAgICAgICAgICB2ID0gdi5zcGxpdChgJCR7azF9YCkuam9pbih2MSlcbiAgICAgICAgfVxuICAgICAgfVxuICAgICAgcmV0dXJuIHZcbiAgICB9XG4gICAgZm9yIChjb25zdCBsaW5lIG9mIHNiYy5zcGxpdCgvXFxyP1xcbnxcXHIvKSkge1xuICAgICAgaWYgKCFsaW5lLm1hdGNoKC9eXFxzKi0tLykgJiYgIWxpbmUubWF0Y2goL15cXHMqJC8pKSB7XG4gICAgICAgIGNvbnN0IFtsXSA9IGxpbmUuc3BsaXQoLy0tLylcbiAgICAgICAgY29uc3QgbSA9IGwubWF0Y2goL15cXHMqKFtcXHctXSspOlxccyooLiopXFxzKiQvKVxuICAgICAgICBpZiAobSkge1xuICAgICAgICAgIGNvbnN0IFtfLCBuYW1lLCB2YWxdID0gbVxuICAgICAgICAgIHNjb3BlW25hbWVdID0gcnYodmFsKVxuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIGNvbnN0IG5ld3Njb3BlID0ge31cbiAgICAgICAgICBzY29wZVtsaW5lXSA9IG5ld3Njb3BlXG4gICAgICAgICAgc2NvcGUgPSBuZXdzY29wZVxuICAgICAgICB9XG4gICAgICB9XG4gICAgfVxuICAgIHJldHVybiB2YXJzXG4gIH0gY2F0Y2ggKGVycikge1xuICAgIHdhcm4oJ1JlYWRpbmcgY2FiYWwgc2FuZGJveCBjb25maWcgZmFpbGVkIHdpdGggJywgZXJyKVxuICB9XG59XG5cbi8vIEEgZGlydHkgaGFjayB0byB3b3JrIHdpdGggdGFic1xuZXhwb3J0IGZ1bmN0aW9uIHRhYlNoaWZ0Rm9yUG9pbnQoYnVmZmVyOiBBdG9tVHlwZXMuVGV4dEJ1ZmZlciwgcG9pbnQ6IEF0b21UeXBlcy5Qb2ludCkge1xuICBjb25zdCBsaW5lID0gYnVmZmVyLmxpbmVGb3JSb3cocG9pbnQucm93KVxuICBjb25zdCBtYXRjaCA9IGxpbmUgPyAobGluZS5zbGljZSgwLCBwb2ludC5jb2x1bW4pLm1hdGNoKC9cXHQvZykgfHwgW10pIDogW11cbiAgY29uc3QgY29sdW1uU2hpZnQgPSA3ICogbWF0Y2gubGVuZ3RoXG4gIHJldHVybiBuZXcgUG9pbnQocG9pbnQucm93LCBwb2ludC5jb2x1bW4gKyBjb2x1bW5TaGlmdClcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIHRhYlNoaWZ0Rm9yUmFuZ2UoYnVmZmVyOiBBdG9tVHlwZXMuVGV4dEJ1ZmZlciwgcmFuZ2U6IEF0b21UeXBlcy5SYW5nZSkge1xuICBjb25zdCBzdGFydCA9IHRhYlNoaWZ0Rm9yUG9pbnQoYnVmZmVyLCByYW5nZS5zdGFydClcbiAgY29uc3QgZW5kID0gdGFiU2hpZnRGb3JQb2ludChidWZmZXIsIHJhbmdlLmVuZClcbiAgcmV0dXJuIG5ldyBSYW5nZShzdGFydCwgZW5kKVxufVxuXG5leHBvcnQgZnVuY3Rpb24gdGFiVW5zaGlmdEZvclBvaW50KGJ1ZmZlcjogQXRvbVR5cGVzLlRleHRCdWZmZXIsIHBvaW50OiBBdG9tVHlwZXMuUG9pbnQpIHtcbiAgY29uc3QgbGluZSA9IGJ1ZmZlci5saW5lRm9yUm93KHBvaW50LnJvdylcbiAgbGV0IGNvbHVtbmwgPSAwXG4gIGxldCBjb2x1bW5yID0gcG9pbnQuY29sdW1uXG4gIHdoaWxlIChjb2x1bW5sIDwgY29sdW1ucikge1xuICAgIC8vIHRzbGludDpkaXNhYmxlLW5leHQtbGluZTogc3RyaWN0LXR5cGUtcHJlZGljYXRlc1xuICAgIGlmICgobGluZSA9PT0gdW5kZWZpbmVkKSB8fCAobGluZVtjb2x1bW5sXSA9PT0gdW5kZWZpbmVkKSkgeyBicmVhayB9XG4gICAgaWYgKGxpbmVbY29sdW1ubF0gPT09ICdcXHQnKSB7XG4gICAgICBjb2x1bW5yIC09IDdcbiAgICB9XG4gICAgY29sdW1ubCArPSAxXG4gIH1cbiAgcmV0dXJuIG5ldyBQb2ludChwb2ludC5yb3csIGNvbHVtbnIpXG59XG5cbmV4cG9ydCBmdW5jdGlvbiB0YWJVbnNoaWZ0Rm9yUmFuZ2UoYnVmZmVyOiBBdG9tVHlwZXMuVGV4dEJ1ZmZlciwgcmFuZ2U6IEF0b21UeXBlcy5SYW5nZSkge1xuICBjb25zdCBzdGFydCA9IHRhYlVuc2hpZnRGb3JQb2ludChidWZmZXIsIHJhbmdlLnN0YXJ0KVxuICBjb25zdCBlbmQgPSB0YWJVbnNoaWZ0Rm9yUG9pbnQoYnVmZmVyLCByYW5nZS5lbmQpXG4gIHJldHVybiBuZXcgUmFuZ2Uoc3RhcnQsIGVuZClcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGlzVXBwZXJDYXNlKGNoOiBzdHJpbmcpOiBib29sZWFuIHtcbiAgcmV0dXJuIGNoLnRvVXBwZXJDYXNlKCkgPT09IGNoXG59XG5cbmV4cG9ydCBmdW5jdGlvbiBnZXRFcnJvckRldGFpbCh7IGVyciwgcnVuQXJncywgY2FwcyB9OiBJRXJyb3JDYWxsYmFja0FyZ3MpIHtcbiAgcmV0dXJuIGBjYXBzOlxuJHtKU09OLnN0cmluZ2lmeShjYXBzLCB1bmRlZmluZWQsIDIpfVxuQXJnczpcbiR7SlNPTi5zdHJpbmdpZnkocnVuQXJncywgdW5kZWZpbmVkLCAyKX1cbm1lc3NhZ2U6XG4ke2Vyci5tZXNzYWdlfVxubG9nOlxuJHtnZXREZWJ1Z0xvZygpfWBcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGZvcm1hdEVycm9yKHsgZXJyLCBydW5BcmdzLCBjYXBzIH06IElFcnJvckNhbGxiYWNrQXJncykge1xuICBpZiAoZXJyLm5hbWUgPT09ICdJbnRlcmFjdGl2ZUFjdGlvblRpbWVvdXQnICYmIHJ1bkFyZ3MpIHtcbiAgICByZXR1cm4gYFxcXG5IYXNrZWxsLWdoYy1tb2Q6IGdoYy1tb2QgXFxcbiR7cnVuQXJncy5pbnRlcmFjdGl2ZSA/ICdpbnRlcmFjdGl2ZSAnIDogJyd9Y29tbWFuZCAke3J1bkFyZ3MuY29tbWFuZH0gXFxcbnRpbWVkIG91dC4gWW91IGNhbiB0cnkgdG8gZml4IGl0IGJ5IHJhaXNpbmcgJ0ludGVyYWN0aXZlIEFjdGlvbiBcXFxuVGltZW91dCcgc2V0dGluZyBpbiBoYXNrZWxsLWdoYy1tb2Qgc2V0dGluZ3MuYFxuICB9IGVsc2UgaWYgKHJ1bkFyZ3MpIHtcbiAgICByZXR1cm4gYFxcXG5IYXNrZWxsLWdoYy1tb2Q6IGdoYy1tb2QgXFxcbiR7cnVuQXJncy5pbnRlcmFjdGl2ZSA/ICdpbnRlcmFjdGl2ZSAnIDogJyd9Y29tbWFuZCAke3J1bkFyZ3MuY29tbWFuZH0gXFxcbmZhaWxlZCB3aXRoIGVycm9yICR7ZXJyLm5hbWV9YFxuICB9IGVsc2Uge1xuICAgIHJldHVybiBgVGhlcmUgd2FzIGFuIHVuZXhwZWN0ZWQgZXJyb3IgJHtlcnIubmFtZX1gXG4gIH1cbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGRlZmF1bHRFcnJvckhhbmRsZXIoYXJnczogSUVycm9yQ2FsbGJhY2tBcmdzKSB7XG4gIGNvbnN0IHsgZXJyLCBydW5BcmdzLCBjYXBzIH0gPSBhcmdzXG4gIGNvbnN0IHN1cHByZXNzRXJyb3JzID0gcnVuQXJncyAmJiBydW5BcmdzLnN1cHByZXNzRXJyb3JzXG5cbiAgaWYgKCFzdXBwcmVzc0Vycm9ycykge1xuICAgIGF0b20ubm90aWZpY2F0aW9ucy5hZGRFcnJvcihcbiAgICAgIGZvcm1hdEVycm9yKGFyZ3MpLFxuICAgICAge1xuICAgICAgICBkZXRhaWw6IGdldEVycm9yRGV0YWlsKGFyZ3MpLFxuICAgICAgICBzdGFjazogZXJyLnN0YWNrLFxuICAgICAgICBkaXNtaXNzYWJsZTogdHJ1ZSxcbiAgICAgIH0sXG4gICAgKVxuICB9IGVsc2Uge1xuICAgIGVycm9yKGNhcHMsIHJ1bkFyZ3MsIGVycilcbiAgfVxufVxuXG5leHBvcnQgZnVuY3Rpb24gd2FybkdIQ1BhY2thZ2VQYXRoKCkge1xuICBhdG9tLm5vdGlmaWNhdGlvbnMuYWRkV2FybmluZyhcbiAgICAnaGFza2VsbC1naGMtbW9kOiBZb3UgaGF2ZSBHSENfUEFDS0FHRV9QQVRIIGVudmlyb25tZW50IHZhcmlhYmxlIHNldCEnLFxuICAgIHtcbiAgICAgIGRpc21pc3NhYmxlOiB0cnVlLFxuICAgICAgZGV0YWlsOiBgXFxcblRoaXMgY29uZmlndXJhdGlvbiBpcyBub3Qgc3VwcG9ydGVkLCBhbmQgY2FuIGJyZWFrIGFyYml0cmFyaWx5LiBZb3UgY2FuIHRyeSB0byBiYW5kLWFpZCBpdCBieSBhZGRpbmdcblxuZGVsZXRlIHByb2Nlc3MuZW52LkdIQ19QQUNLQUdFX1BBVEhcblxudG8geW91ciBBdG9tIGluaXQgc2NyaXB0IChFZGl0IOKGkiBJbml0IFNjcmlwdC4uLilcblxuWW91IGNhbiBzdXBwcmVzcyB0aGlzIHdhcm5pbmcgaW4gaGFza2VsbC1naGMtbW9kIHNldHRpbmdzLmAsXG4gICAgfSxcbiAgKVxufVxuXG5mdW5jdGlvbiBmaWx0ZXJFbnYoZW52OiB7IFtuYW1lOiBzdHJpbmddOiBzdHJpbmcgfCB1bmRlZmluZWQgfSkge1xuICBjb25zdCBmZW52ID0ge31cbiAgLy8gdHNsaW50OmRpc2FibGUtbmV4dC1saW5lOiBmb3JpblxuICBmb3IgKGNvbnN0IGV2YXIgaW4gZW52KSB7XG4gICAgY29uc3QgZXZhclUgPSBldmFyLnRvVXBwZXJDYXNlKClcbiAgICBpZiAoXG4gICAgICBldmFyVSA9PT0gJ1BBVEgnXG4gICAgICB8fCBldmFyVS5zdGFydHNXaXRoKCdHSENfJylcbiAgICAgIHx8IGV2YXJVLnN0YXJ0c1dpdGgoJ1NUQUNLXycpXG4gICAgICB8fCBldmFyVS5zdGFydHNXaXRoKCdDQUJBTF8nKVxuICAgICkge1xuICAgICAgZmVudltldmFyXSA9IGVudltldmFyXVxuICAgIH1cbiAgfVxuICByZXR1cm4gZmVudlxufVxuXG5leHBvcnQgZnVuY3Rpb24gbm90aWZ5U3Bhd25GYWlsKGFyZ3M6IHsgZGlyOiBzdHJpbmcsIGVycjogYW55LCBvcHRzOiBhbnksIHZlcnM6IGFueSwgY2FwczogYW55IH0pIHtcbiAgY29uc3Qgb3B0c2Nsb25lID0gSlNPTi5wYXJzZShKU09OLnN0cmluZ2lmeShhcmdzLm9wdHMpKVxuICBvcHRzY2xvbmUuZW52ID0gZmlsdGVyRW52KG9wdHNjbG9uZS5lbnYpXG4gIGFyZ3Mub3B0cyA9IG9wdHNjbG9uZVxuICBhdG9tLm5vdGlmaWNhdGlvbnMuYWRkRmF0YWxFcnJvcihcbiAgICBgSGFza2VsbC1naGMtbW9kOiBnaGMtbW9kIGZhaWxlZCB0byBsYXVuY2guXG5JdCBpcyBwcm9iYWJseSBtaXNzaW5nIG9yIG1pc2NvbmZpZ3VyZWQuICR7YXJncy5lcnIuY29kZX1gLFxuICAgIHtcbiAgICAgIGRldGFpbDogYFxcXG5FcnJvciB3YXM6ICR7YXJncy5lcnIubmFtZX1cbiR7YXJncy5lcnIubWVzc2FnZX1cbkRlYnVnIGluZm9ybWF0aW9uOlxuJHtKU09OLnN0cmluZ2lmeShhcmdzLCB1bmRlZmluZWQsIDIpfVxuRW52aXJvbm1lbnQgKGZpbHRlcmVkKTpcbiR7SlNPTi5zdHJpbmdpZnkoZmlsdGVyRW52KHByb2Nlc3MuZW52KSwgdW5kZWZpbmVkLCAyKX1cbmAsXG4gICAgICBzdGFjazogYXJncy5lcnIuc3RhY2ssXG4gICAgICBkaXNtaXNzYWJsZTogdHJ1ZSxcbiAgICB9LFxuICApXG59XG5cbmV4cG9ydCBmdW5jdGlvbiBoYW5kbGVFeGNlcHRpb248VD4oXG4gIHRhcmdldDogeyB1cGk6IFVQSS5JVVBJSW5zdGFuY2UgfCBQcm9taXNlPFVQSS5JVVBJSW5zdGFuY2U+IH0sIGtleTogc3RyaW5nLFxuICBkZXNjOiBUeXBlZFByb3BlcnR5RGVzY3JpcHRvcjwoLi4uYXJnczogYW55W10pID0+IFByb21pc2U8VD4+LFxuKTogVHlwZWRQcm9wZXJ0eURlc2NyaXB0b3I8KC4uLmFyZ3M6IGFueVtdKSA9PiBQcm9taXNlPFQ+PiB7XG4gIHJldHVybiB7XG4gICAgLi4uZGVzYyxcbiAgICBhc3luYyB2YWx1ZSguLi5hcmdzOiBhbnlbXSkge1xuICAgICAgdHJ5IHtcbiAgICAgICAgLy8gdHNsaW50OmRpc2FibGUtbmV4dC1saW5lOiBuby1ub24tbnVsbC1hc3NlcnRpb25cbiAgICAgICAgcmV0dXJuIGF3YWl0IGRlc2MudmFsdWUhLmNhbGwodGhpcywgLi4uYXJncylcbiAgICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgICAgLy8gdHNsaW50OmRpc2FibGUtbmV4dC1saW5lOiBuby1jb25zb2xlXG4gICAgICAgIGRlYnVnKGUpXG4gICAgICAgIGNvbnN0IHVwaTogVVBJLklVUElJbnN0YW5jZSA9IGF3YWl0ICh0aGlzIGFzIGFueSkudXBpXG4gICAgICAgIHVwaS5zZXRTdGF0dXMoe1xuICAgICAgICAgIHN0YXR1czogJ3dhcm5pbmcnLFxuICAgICAgICAgIGRldGFpbDogZS50b1N0cmluZygpLFxuICAgICAgICB9KVxuICAgICAgICAvLyBUT0RPOiByZXR1cm5pbmcgYSBwcm9taXNlIHRoYXQgbmV2ZXIgcmVzb2x2ZXMuLi4gdWdseSwgYnV0IHdvcmtzP1xuICAgICAgICByZXR1cm4gbmV3IFByb21pc2UoKCkgPT4geyAvKiBub29wICovIH0pXG4gICAgICB9XG4gICAgfSxcbiAgfVxufVxuIl19