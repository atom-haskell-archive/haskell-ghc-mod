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
Config:
${JSON.stringify(atom.config.get('haskell-ghc-mod'), undefined, 2)}
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidXRpbC5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uL3NyYy91dGlsLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7Ozs7Ozs7Ozs7QUFBQSwrQkFBbUM7QUFDbkMsK0JBQThDO0FBQzlDLDZCQUE0QjtBQUM1Qix5QkFBd0I7QUFDeEIsb0NBQW1DO0FBQ25DLDJCQUF3QjtBQUN4QiwyREFBZ0Y7QUFJdkUsNkJBSkEsdUNBQWtCLENBSUE7QUFBRSxxQkFKQSwrQkFBVSxDQUlBO0FBQUUsc0JBSkEsZ0NBQVcsQ0FJQTtBQUVwRCxJQUFJLFFBQVEsR0FBcUQsRUFBRSxDQUFBO0FBQ25FLE1BQU0sT0FBTyxHQUFHLEtBQUssQ0FBQTtBQUVyQixpQkFBaUIsR0FBRyxRQUFrQjtJQUNwQyxNQUFNLEVBQUUsR0FBRyxJQUFJLENBQUMsR0FBRyxFQUFFLENBQUE7SUFDckIsUUFBUSxDQUFDLElBQUksQ0FBQztRQUNaLFNBQVMsRUFBRSxFQUFFO1FBQ2IsUUFBUTtLQUNULENBQUMsQ0FBQTtJQUNGLElBQUksRUFBRSxHQUFHLENBQUMsQ0FBQTtJQUNWLEdBQUcsQ0FBQyxDQUFDLE1BQU0sQ0FBQyxJQUFJLFFBQVEsQ0FBQyxDQUFDLENBQUM7UUFDekIsRUFBRSxDQUFDLENBQUMsQ0FBQyxFQUFFLEdBQUcsQ0FBQyxDQUFDLFNBQVMsQ0FBQyxJQUFJLE9BQU8sQ0FBQyxDQUFDLENBQUM7WUFDbEMsS0FBSyxDQUFBO1FBQ1AsQ0FBQztRQUNELEVBQUUsRUFBRSxDQUFBO0lBQ04sQ0FBQztJQUNELFFBQVEsQ0FBQyxNQUFNLENBQUMsQ0FBQyxFQUFFLEVBQUUsQ0FBQyxDQUFBO0FBQ3hCLENBQUM7QUFFRCxrQkFBa0IsRUFBWTtJQUM1QixNQUFNLEdBQUcsR0FBRyxJQUFJLEdBQUcsQ0FBQyxFQUFFLENBQUMsQ0FBQTtJQUN2QixNQUFNLENBQUMsS0FBSyxDQUFDLElBQUksQ0FBQyxHQUFHLENBQUMsQ0FBQyxJQUFJLENBQUMsZ0JBQVMsQ0FBQyxDQUFBO0FBQ3hDLENBQUM7QUFFWSxRQUFBLEdBQUcsR0FBRyxHQUFHLFFBQUcsT0FBTyxRQUFHLEVBQUUsQ0FBQTtBQUVyQyxlQUFzQixHQUFHLFFBQWU7SUFDdEMsRUFBRSxDQUFDLENBQUMsSUFBSSxDQUFDLE1BQU0sQ0FBQyxHQUFHLENBQUMsdUJBQXVCLENBQUMsQ0FBQyxDQUFDLENBQUM7UUFFN0MsT0FBTyxDQUFDLEdBQUcsQ0FBQyx3QkFBd0IsRUFBRSxHQUFHLFFBQVEsQ0FBQyxDQUFBO0lBQ3BELENBQUM7SUFDRCxPQUFPLENBQUMsR0FBRyxRQUFRLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQyxLQUFLLElBQUksQ0FBQyxTQUFTLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFBO0FBQ3BELENBQUM7QUFORCxzQkFNQztBQUVELGNBQXFCLEdBQUcsUUFBZTtJQUVyQyxPQUFPLENBQUMsSUFBSSxDQUFDLDBCQUEwQixFQUFFLEdBQUcsUUFBUSxDQUFDLENBQUE7SUFDckQsT0FBTyxDQUFDLEdBQUcsUUFBUSxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUMsS0FBSyxJQUFJLENBQUMsU0FBUyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQTtBQUNwRCxDQUFDO0FBSkQsb0JBSUM7QUFFRCxlQUFzQixHQUFHLFFBQWU7SUFFdEMsT0FBTyxDQUFDLEtBQUssQ0FBQyx3QkFBd0IsRUFBRSxHQUFHLFFBQVEsQ0FBQyxDQUFBO0lBQ3BELE9BQU8sQ0FBQyxHQUFHLFFBQVEsQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDLEtBQUssSUFBSSxDQUFDLFNBQVMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUE7QUFDcEQsQ0FBQztBQUpELHNCQUlDO0FBRUQ7SUFDRSxNQUFNLEVBQUUsR0FBRyxJQUFJLENBQUMsR0FBRyxFQUFFLENBQUE7SUFDckIsUUFBUSxHQUFHLFFBQVEsQ0FBQyxNQUFNLENBQUMsQ0FBQyxFQUFFLFNBQVMsRUFBRSxLQUFLLENBQUMsRUFBRSxHQUFHLFNBQVMsQ0FBQyxHQUFHLE9BQU8sQ0FBQyxDQUFBO0lBQ3pFLE1BQU0sQ0FBQyxRQUFRLENBQUMsR0FBRyxDQUFDLENBQUMsRUFBRSxTQUFTLEVBQUUsUUFBUSxFQUFFLEtBQUssR0FBRyxDQUFDLFNBQVMsR0FBRyxFQUFFLENBQUMsR0FBRyxJQUFJLE1BQU0sUUFBUSxDQUFDLElBQUksQ0FBQyxHQUFHLENBQUMsRUFBRSxDQUFDLENBQUMsSUFBSSxDQUFDLFFBQUcsQ0FBQyxDQUFBO0FBQ2xILENBQUM7QUFKRCxrQ0FJQztBQUVELHFCQUFrQyxHQUFXLEVBQUUsSUFBYyxFQUFFLElBQWMsRUFBRSxLQUFjOztRQUMzRixNQUFNLENBQUMsSUFBSSxPQUFPLENBQXFDLENBQUMsT0FBTyxFQUFFLE1BQU07WUFDckUsS0FBSyxDQUFDLFdBQVcsR0FBRyxJQUFJLElBQUksZUFBZSxFQUFFLElBQUksQ0FBQyxDQUFBO1lBQ2xELE1BQU0sS0FBSyxHQUFHLEVBQUUsQ0FBQyxRQUFRLENBQUMsR0FBRyxFQUFFLElBQUksRUFBRSxJQUFJLEVBQUUsQ0FBQyxLQUFLLEVBQUUsTUFBYyxFQUFFLE1BQWM7Z0JBQy9FLEVBQUUsQ0FBQyxDQUFDLE1BQU0sQ0FBQyxJQUFJLEVBQUUsQ0FBQyxNQUFNLEdBQUcsQ0FBQyxDQUFDLENBQUMsQ0FBQztvQkFBQyxJQUFJLENBQUMsTUFBTSxDQUFDLENBQUE7Z0JBQUMsQ0FBQztnQkFDOUMsRUFBRSxDQUFDLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQztvQkFDVixJQUFJLENBQUMsV0FBVyxHQUFHLElBQUksSUFBSSxlQUFlLEVBQUUsS0FBSyxDQUFDLENBQUE7b0JBQ2xELEVBQUUsQ0FBQyxDQUFDLE1BQU0sQ0FBQyxDQUFDLENBQUM7d0JBQUMsSUFBSSxDQUFDLE1BQU0sQ0FBQyxDQUFBO29CQUFDLENBQUM7b0JBQzVCLEtBQUssQ0FBQyxLQUFLLEdBQUcsQ0FBQyxJQUFJLEtBQUssRUFBRSxDQUFDLENBQUMsS0FBSyxDQUFBO29CQUNqQyxNQUFNLENBQUMsS0FBSyxDQUFDLENBQUE7Z0JBQ2YsQ0FBQztnQkFBQyxJQUFJLENBQUMsQ0FBQztvQkFDTixLQUFLLENBQUMscUJBQXFCLEdBQUcsSUFBSSxJQUFJLEVBQUUsRUFBRSxFQUFFLE1BQU0sRUFBRSxNQUFNLEVBQUUsQ0FBQyxDQUFBO29CQUM3RCxPQUFPLENBQUMsRUFBRSxNQUFNLEVBQUUsTUFBTSxFQUFFLENBQUMsQ0FBQTtnQkFDN0IsQ0FBQztZQUNILENBQUMsQ0FBQyxDQUFBO1lBQ0YsRUFBRSxDQUFDLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQztnQkFDVixLQUFLLENBQUMseUJBQXlCLEdBQUcsSUFBSSxJQUFJLEVBQUUsQ0FBQyxDQUFBO2dCQUM3QyxLQUFLLENBQUMsS0FBSyxDQUFDLEtBQUssQ0FBQyxLQUFLLENBQUMsQ0FBQTtZQUMxQixDQUFDO1FBQ0gsQ0FBQyxDQUFDLENBQUE7SUFDSixDQUFDO0NBQUE7QUFwQkQsa0NBb0JDO0FBRUQseUJBQXNDLFFBQWdCOztRQUNwRCxLQUFLLENBQUMsOEJBQThCLENBQUMsQ0FBQTtRQUNyQyxNQUFNLEdBQUcsR0FBRyxNQUFNLGtCQUFrQixDQUFDLEdBQUcsUUFBUSxHQUFHLFVBQUcsc0JBQXNCLENBQUMsQ0FBQTtRQUU3RSxFQUFFLENBQUMsQ0FBQyxHQUFHLElBQUksR0FBRyxDQUFDLGNBQWMsQ0FBQyxJQUFJLEdBQUcsQ0FBQyxjQUFjLENBQUMsQ0FBQyxRQUFRLENBQUMsQ0FBQyxDQUFDLENBQUM7WUFDaEUsTUFBTSxPQUFPLEdBQUcsR0FBRyxDQUFDLGNBQWMsQ0FBQyxDQUFDLFFBQVEsQ0FBQyxDQUFBO1lBQzdDLEtBQUssQ0FBQyx1QkFBdUIsRUFBRSxPQUFPLENBQUMsQ0FBQTtZQUN2QyxFQUFFLENBQUMsQ0FBQyxnQ0FBVyxDQUFDLE9BQU8sQ0FBQyxDQUFDLENBQUMsQ0FBQztnQkFDekIsTUFBTSxDQUFDLE9BQU8sQ0FBQTtZQUNoQixDQUFDO1lBQUMsSUFBSSxDQUFDLENBQUM7Z0JBQ04sSUFBSSxDQUFDLGdCQUFnQixFQUFFLE9BQU8sRUFBRSxxQkFBcUIsQ0FBQyxDQUFBO1lBQ3hELENBQUM7UUFDSCxDQUFDO1FBQUMsSUFBSSxDQUFDLENBQUM7WUFDTixJQUFJLENBQUMsd0JBQXdCLENBQUMsQ0FBQTtRQUNoQyxDQUFDO0lBRUgsQ0FBQztDQUFBO0FBaEJELDBDQWdCQztBQUVELHlCQUFzQyxRQUFnQixFQUFFLEdBQWEsRUFBRSxHQUEwQzs7UUFDL0csS0FBSyxDQUFDLDhCQUE4QixDQUFDLENBQUE7UUFDckMsR0FBRyxDQUFDLElBQUksR0FBRyxRQUFRLENBQUMsR0FBRyxDQUFDLENBQUE7UUFDeEIsS0FBSyxDQUFDLDBCQUEwQixFQUFFLEdBQUcsQ0FBQyxJQUFJLENBQUMsQ0FBQTtRQUMzQyxJQUFJLENBQUM7WUFDSCxNQUFNLEdBQUcsR0FBRyxNQUFNLFdBQVcsQ0FBQyxPQUFPLEVBQUUsQ0FBQyxNQUFNLEVBQUUseUJBQXlCLEVBQUUsc0JBQXNCLEVBQUUsWUFBWSxDQUFDLEVBQUU7Z0JBQ2hILFFBQVEsRUFBRSxNQUFNO2dCQUNoQixHQUFHLEVBQUUsUUFBUTtnQkFDYixHQUFHO2dCQUNILE9BQU8sRUFBRSxJQUFJLENBQUMsTUFBTSxDQUFDLEdBQUcsQ0FBQyw2QkFBNkIsQ0FBQyxHQUFHLElBQUk7YUFDL0QsQ0FBQyxDQUFBO1lBRUYsTUFBTSxLQUFLLEdBQUcsR0FBRyxDQUFDLE1BQU0sQ0FBQyxLQUFLLENBQUMsUUFBRyxDQUFDLENBQUE7WUFDbkMsTUFBTSxHQUFHLEdBQUcsS0FBSyxDQUFDLE1BQU0sQ0FBQyxDQUFDLENBQUMsS0FBSyxDQUFDLENBQUMsVUFBVSxDQUFDLHlCQUF5QixDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxLQUFLLENBQUMsRUFBRSxDQUFDLEdBQUcsR0FBRyxVQUFHLEtBQUssQ0FBQTtZQUNuRyxNQUFNLEdBQUcsR0FBRyxLQUFLLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQyxLQUFLLENBQUMsQ0FBQyxVQUFVLENBQUMsc0JBQXNCLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLEtBQUssQ0FBQyxFQUFFLENBQUMsR0FBRyxHQUFHLFVBQUcsS0FBSyxDQUFBO1lBQ2hHLE1BQU0sRUFBRSxHQUNOLEtBQUssQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDLEtBQ2IsQ0FBQyxDQUFDLFVBQVUsQ0FBQyxZQUFZLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLEtBQUssQ0FBQyxFQUFFLENBQUMsQ0FBQyxLQUFLLENBQUMsZ0JBQVMsQ0FBQyxDQUFDLE1BQU0sQ0FBQyxDQUFDLENBQUMsS0FDakUsQ0FBQyxDQUFDLENBQUMsQ0FBQyxLQUFLLEdBQUcsQ0FBQyxJQUFJLENBQUMsQ0FBQyxLQUFLLEdBQUcsQ0FBQyxJQUFJLENBQUMsR0FBRyxDQUFDLFFBQVEsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQTtZQUN6RCxLQUFLLENBQUMsc0JBQXNCLEVBQUUsR0FBRyxFQUFFLEdBQUcsRUFBRSxHQUFHLEVBQUUsQ0FBQyxDQUFBO1lBQzlDLE1BQU0sQ0FBQyxDQUFDLEdBQUcsRUFBRSxHQUFHLEVBQUUsR0FBRyxFQUFFLENBQUMsQ0FBQTtRQUMxQixDQUFDO1FBQUMsS0FBSyxDQUFDLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQztZQUNiLElBQUksQ0FBQyxpQ0FBaUMsRUFBRSxHQUFHLENBQUMsQ0FBQTtRQUM5QyxDQUFDO0lBQ0gsQ0FBQztDQUFBO0FBeEJELDBDQXdCQztBQUVELE1BQU0sbUJBQW1CLEdBQUcsSUFBSSxHQUFHLEVBQXNCLENBQUE7QUFFekQsMkJBQXdDLFFBQWlCOztRQUN2RCxFQUFFLENBQUMsQ0FBQyxDQUFDLFFBQVEsQ0FBQyxDQUFDLENBQUM7WUFFZCxRQUFRLEdBQUcsdUNBQWtCLENBQUMsSUFBSSxDQUFDLENBQUMsT0FBTyxFQUFFLENBQUE7UUFDL0MsQ0FBQztRQUVELE1BQU0sTUFBTSxHQUFHLG1CQUFtQixDQUFDLEdBQUcsQ0FBQyxRQUFRLENBQUMsQ0FBQTtRQUNoRCxFQUFFLENBQUMsQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDO1lBQ1gsTUFBTSxDQUFDLE1BQU0sQ0FBQTtRQUNmLENBQUM7UUFFRCxLQUFLLENBQUMscUJBQXFCLFFBQVEsR0FBRyxDQUFDLENBQUE7UUFDdkMsTUFBTSxHQUFHLHFCQUFRLE9BQU8sQ0FBQyxHQUFHLENBQUUsQ0FBQTtRQUc5QixFQUFFLENBQUMsQ0FBQyxPQUFPLENBQUMsUUFBUSxLQUFLLE9BQU8sQ0FBQyxDQUFDLENBQUM7WUFDakMsTUFBTSxJQUFJLEdBQUcsRUFBRSxDQUFBO1lBQ2YsTUFBTSxPQUFPLEdBQUcsQ0FBQyxHQUFXLEVBQUUsSUFBWTtnQkFDeEMsTUFBTSxDQUFDLEdBQUcsR0FBRyxDQUFDLEtBQUssQ0FBQyxFQUFFLENBQUMsQ0FBQTtnQkFDdkIsR0FBRyxDQUFDLENBQUMsSUFBSSxDQUFDLEdBQUcsQ0FBQyxFQUFFLENBQUMsR0FBRyxDQUFDLENBQUMsTUFBTSxFQUFFLENBQUMsRUFBRSxFQUFFLENBQUM7b0JBQ2xDLEVBQUUsQ0FBQyxDQUFDLElBQUksR0FBRyxJQUFJLENBQUMsR0FBRyxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUM7d0JBQzFCLENBQUMsQ0FBQyxDQUFDLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsV0FBVyxFQUFFLENBQUE7b0JBQzNCLENBQUM7Z0JBQ0gsQ0FBQztnQkFDRCxNQUFNLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQyxFQUFFLENBQUMsQ0FBQTtZQUNuQixDQUFDLENBQUE7WUFDRCxHQUFHLENBQUMsQ0FBQyxJQUFJLENBQUMsR0FBRyxNQUFNLEVBQUUsQ0FBQyxJQUFJLENBQUMsRUFBRSxDQUFDLEVBQUUsRUFBRSxDQUFDO2dCQUNqQyxNQUFNLEVBQUUsR0FBRyxPQUFPLENBQUMsTUFBTSxFQUFFLENBQUMsQ0FBQyxDQUFBO2dCQUM3QixFQUFFLENBQUMsQ0FBQyxHQUFHLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQyxDQUFDO29CQUNaLElBQUksQ0FBQyxJQUFJLENBQUMsR0FBRyxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUE7Z0JBQ3BCLENBQUM7WUFDSCxDQUFDO1lBQ0QsR0FBRyxDQUFDLElBQUksR0FBRyxJQUFJLENBQUMsSUFBSSxDQUFDLGdCQUFTLENBQUMsQ0FBQTtRQUNqQyxDQUFDO1FBRUQsTUFBTSxJQUFJLEdBQUcsR0FBRyxDQUFDLElBQUksSUFBSSxFQUFFLENBQUE7UUFFM0IsTUFBTSxHQUFHLEdBQUcsSUFBSSxDQUFDLE1BQU0sQ0FBQyxHQUFHLENBQUMsMkNBQTJDLENBQUMsQ0FBQyxNQUFNLENBQUMsSUFBSSxDQUFDLEtBQUssQ0FBQyxnQkFBUyxDQUFDLENBQUMsQ0FBQTtRQUN0RyxNQUFNLFlBQVksR0FBRyxJQUFJLENBQUMsTUFBTSxDQUFDLEdBQUcsQ0FBQyw4QkFBOEIsQ0FBQztjQUNoRSxlQUFlLENBQUMsUUFBUSxDQUFDLEdBQUcsT0FBTyxDQUFDLE9BQU8sRUFBRSxDQUFBO1FBQ2pELE1BQU0sWUFBWSxHQUFHLElBQUksQ0FBQyxNQUFNLENBQUMsR0FBRyxDQUFDLDhCQUE4QixDQUFDO2NBQ2hFLGVBQWUsQ0FBQyxRQUFRLEVBQUUsR0FBRyxvQkFBTyxHQUFHLEVBQUcsR0FBRyxPQUFPLENBQUMsT0FBTyxFQUFFLENBQUE7UUFDbEUsTUFBTSxDQUFDLGVBQWUsRUFBRSxnQkFBZ0IsQ0FBQyxHQUFHLE1BQU0sT0FBTyxDQUFDLEdBQUcsQ0FBQyxDQUFDLFlBQVksRUFBRSxZQUFZLENBQUMsQ0FBQyxDQUFBO1FBQzNGLE1BQU0sSUFBSSxHQUFHLEVBQUUsQ0FBQTtRQUNmLEVBQUUsQ0FBQyxDQUFDLGVBQWUsQ0FBQyxDQUFDLENBQUM7WUFDcEIsSUFBSSxDQUFDLElBQUksQ0FBQyxlQUFlLENBQUMsQ0FBQTtRQUM1QixDQUFDO1FBQ0QsRUFBRSxDQUFDLENBQUMsZ0JBQWdCLENBQUMsQ0FBQyxDQUFDO1lBQ3JCLElBQUksQ0FBQyxJQUFJLENBQUMsR0FBRyxnQkFBZ0IsQ0FBQyxDQUFBO1FBQ2hDLENBQUM7UUFDRCxJQUFJLENBQUMsSUFBSSxDQUFDLEdBQUcsR0FBRyxDQUFDLENBQUE7UUFDakIsR0FBRyxDQUFDLElBQUksR0FBRyxRQUFRLENBQUMsSUFBSSxDQUFDLENBQUE7UUFDekIsS0FBSyxDQUFDLFVBQVUsR0FBRyxDQUFDLElBQUksRUFBRSxDQUFDLENBQUE7UUFDM0IsTUFBTSxHQUFHLEdBQWU7WUFDdEIsR0FBRyxFQUFFLFFBQVE7WUFDYixHQUFHO1lBQ0gsUUFBUSxFQUFFLE1BQU07WUFDaEIsU0FBUyxFQUFFLFFBQVE7U0FDcEIsQ0FBQTtRQUNELG1CQUFtQixDQUFDLEdBQUcsQ0FBQyxRQUFRLEVBQUUsR0FBRyxDQUFDLENBQUE7UUFDdEMsTUFBTSxDQUFDLEdBQUcsQ0FBQTtJQUNaLENBQUM7Q0FBQTtBQTdERCw4Q0E2REM7QUFFRCwwQkFDRSxNQUE0QixFQUFFLEtBQXNCO0lBRXBELE1BQU0sQ0FBQyxLQUFLLENBQUMsR0FBRyxNQUFNLENBQUMsZ0NBQWdDLENBQUMsS0FBSyxDQUFDLENBQUMsY0FBYyxFQUFFLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUE7SUFDekYsRUFBRSxDQUFDLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQztRQUNWLE1BQU0sS0FBSyxHQUFHLE1BQU0sQ0FBQyw2QkFBNkIsQ0FBQyxLQUFLLEVBQUUsS0FBSyxDQUFDLENBQUE7UUFDaEUsRUFBRSxDQUFDLENBQUMsS0FBSyxJQUFJLENBQUMsS0FBSyxDQUFDLE9BQU8sRUFBRSxDQUFDLENBQUMsQ0FBQztZQUM5QixNQUFNLE1BQU0sR0FBRyxNQUFNLENBQUMsb0JBQW9CLENBQUMsS0FBSyxDQUFDLENBQUE7WUFDakQsTUFBTSxDQUFDLEVBQUUsS0FBSyxFQUFFLEtBQUssRUFBRSxNQUFNLEVBQUUsQ0FBQTtRQUNqQyxDQUFDO0lBQ0gsQ0FBQztBQUNILENBQUM7QUFYRCw0Q0FXQztBQUVELDBCQUFpQyxNQUE0QixFQUFFLE1BQXVCO0lBQ3BGLE1BQU0sTUFBTSxHQUFHLE1BQU0sQ0FBQyxTQUFTLEVBQUUsQ0FBQTtJQUNqQyxFQUFFLENBQUMsQ0FBQyxNQUFNLENBQUMsT0FBTyxFQUFFLENBQUMsQ0FBQyxDQUFDO1FBQ3JCLE1BQU0sQ0FBQyxnQkFBZ0IsQ0FBQyxNQUFNLEVBQUUsTUFBTSxDQUFDLEtBQUssQ0FBQyxDQUFBO0lBQy9DLENBQUM7SUFBQyxJQUFJLENBQUMsQ0FBQztRQUNOLE1BQU0sQ0FBQztZQUNMLE1BQU0sRUFBRSxNQUFNLENBQUMsY0FBYyxDQUFDLE1BQU0sQ0FBQztZQUNyQyxLQUFLLEVBQUUsTUFBTTtTQUNkLENBQUE7SUFDSCxDQUFDO0FBQ0gsQ0FBQztBQVZELDRDQVVDO0FBRUQsc0JBQXNDLFFBQWdCLEVBQUUsR0FBVyxFQUFFLEdBQWlDOztRQUNwRyxNQUFNLElBQUksR0FBRyxNQUFNLElBQUksT0FBTyxDQUM1QixDQUFDLE9BQU8sRUFBRSxNQUFNLEtBQ2QsSUFBSSxDQUFDLElBQUksQ0FDUCxFQUFFLE1BQU0sRUFBRSxpQkFBaUIsRUFBRSxNQUFNLEVBQUUsY0FBTyxDQUFDLEdBQUcsSUFBSSxLQUFLLENBQUMsRUFBRSxFQUM1RCxDQUFDLEdBQUcsRUFBRSxLQUFLO1lBQ1QsRUFBRSxDQUFDLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQztnQkFDUixNQUFNLENBQUMsR0FBRyxDQUFDLENBQUE7WUFDYixDQUFDO1lBQUMsSUFBSSxDQUFDLENBQUM7Z0JBQ04sT0FBTyxDQUFDLEtBQUssQ0FBQyxDQUFBO1lBQ2hCLENBQUM7UUFDSCxDQUFDLENBQUMsQ0FBQyxDQUFBO1FBQ1QsTUFBTSxDQUFDLElBQUksT0FBTyxDQUFJLENBQUMsT0FBTyxFQUFFLE1BQU0sS0FDcEMsRUFBRSxDQUFDLEtBQUssQ0FBQyxJQUFJLENBQUMsRUFBRSxFQUFFLFFBQVEsRUFBRSxDQUFPLEdBQUc7WUFDcEMsRUFBRSxDQUFDLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQztnQkFDUixNQUFNLENBQUMsR0FBRyxDQUFDLENBQUE7WUFDYixDQUFDO1lBQUMsSUFBSSxDQUFDLENBQUM7Z0JBQ04sT0FBTyxDQUFDLE1BQU0sR0FBRyxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFBO2dCQUM3QixFQUFFLENBQUMsS0FBSyxDQUFDLElBQUksQ0FBQyxFQUFFLEVBQUUsTUFBTSxFQUFFLENBQUMsTUFBTSxDQUFDLElBQUksQ0FBQyxJQUFJLEVBQUUsUUFBaUIsQ0FBQyxDQUFDLENBQUMsQ0FBQTtZQUNuRSxDQUFDO1FBQ0gsQ0FBQyxDQUFBLENBQUMsQ0FBQyxDQUFBO0lBQ1AsQ0FBQztDQUFBO0FBckJELG9DQXFCQztBQU9ELGlCQUF3QixJQUFvQixFQUFFLE9BQWU7SUFDM0QsTUFBTSxHQUFHLEdBQUcsSUFBSSxLQUFLLENBQUMsT0FBTyxDQUFDLENBQUE7SUFDOUIsR0FBRyxDQUFDLElBQUksR0FBRyxJQUFJLENBQUE7SUFDZixNQUFNLENBQUMsR0FBRyxDQUFBO0FBQ1osQ0FBQztBQUpELDBCQUlDO0FBSUQsNEJBQXlDLElBQVk7O1FBQ25ELElBQUksQ0FBQztZQUNILE1BQU0sR0FBRyxHQUFHLE1BQU0sSUFBSSxPQUFPLENBQVMsQ0FBQyxPQUFPLEVBQUUsTUFBTSxLQUNwRCxFQUFFLENBQUMsUUFBUSxDQUFDLElBQUksRUFBRSxFQUFFLFFBQVEsRUFBRSxPQUFPLEVBQUUsRUFBRSxDQUFDLEdBQUcsRUFBRSxJQUFJO2dCQUNqRCxFQUFFLENBQUMsQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDO29CQUNSLE1BQU0sQ0FBQyxHQUFHLENBQUMsQ0FBQTtnQkFDYixDQUFDO2dCQUFDLElBQUksQ0FBQyxDQUFDO29CQUNOLE9BQU8sQ0FBQyxJQUFJLENBQUMsQ0FBQTtnQkFDZixDQUFDO1lBQ0gsQ0FBQyxDQUFDLENBQUMsQ0FBQTtZQUNMLE1BQU0sSUFBSSxHQUFzQixFQUFFLENBQUE7WUFDbEMsSUFBSSxLQUFLLEdBQUcsSUFBSSxDQUFBO1lBQ2hCLE1BQU0sRUFBRSxHQUFHLENBQUMsQ0FBUztnQkFDbkIsR0FBRyxDQUFDLENBQUMsTUFBTSxFQUFFLElBQUksTUFBTSxDQUFDLElBQUksQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDLENBQUM7b0JBQ3BDLE1BQU0sRUFBRSxHQUFHLEtBQUssQ0FBQyxFQUFFLENBQUMsQ0FBQTtvQkFDcEIsRUFBRSxDQUFDLENBQUMsT0FBTyxFQUFFLEtBQUssUUFBUSxDQUFDLENBQUMsQ0FBQzt3QkFDM0IsQ0FBQyxHQUFHLENBQUMsQ0FBQyxLQUFLLENBQUMsSUFBSSxFQUFFLEVBQUUsQ0FBQyxDQUFDLElBQUksQ0FBQyxFQUFFLENBQUMsQ0FBQTtvQkFDaEMsQ0FBQztnQkFDSCxDQUFDO2dCQUNELE1BQU0sQ0FBQyxDQUFDLENBQUE7WUFDVixDQUFDLENBQUE7WUFDRCxHQUFHLENBQUMsQ0FBQyxNQUFNLElBQUksSUFBSSxHQUFHLENBQUMsS0FBSyxDQUFDLFVBQVUsQ0FBQyxDQUFDLENBQUMsQ0FBQztnQkFDekMsRUFBRSxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsS0FBSyxDQUFDLFFBQVEsQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLEtBQUssQ0FBQyxPQUFPLENBQUMsQ0FBQyxDQUFDLENBQUM7b0JBQ2xELE1BQU0sQ0FBQyxDQUFDLENBQUMsR0FBRyxJQUFJLENBQUMsS0FBSyxDQUFDLElBQUksQ0FBQyxDQUFBO29CQUM1QixNQUFNLENBQUMsR0FBRyxDQUFDLENBQUMsS0FBSyxDQUFDLDBCQUEwQixDQUFDLENBQUE7b0JBQzdDLEVBQUUsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUM7d0JBQ04sTUFBTSxDQUFDLENBQUMsRUFBRSxJQUFJLEVBQUUsR0FBRyxDQUFDLEdBQUcsQ0FBQyxDQUFBO3dCQUN4QixLQUFLLENBQUMsSUFBSSxDQUFDLEdBQUcsRUFBRSxDQUFDLEdBQUcsQ0FBQyxDQUFBO29CQUN2QixDQUFDO29CQUFDLElBQUksQ0FBQyxDQUFDO3dCQUNOLE1BQU0sUUFBUSxHQUFHLEVBQUUsQ0FBQTt3QkFDbkIsS0FBSyxDQUFDLElBQUksQ0FBQyxHQUFHLFFBQVEsQ0FBQTt3QkFDdEIsS0FBSyxHQUFHLFFBQVEsQ0FBQTtvQkFDbEIsQ0FBQztnQkFDSCxDQUFDO1lBQ0gsQ0FBQztZQUNELE1BQU0sQ0FBQyxJQUFJLENBQUE7UUFDYixDQUFDO1FBQUMsS0FBSyxDQUFDLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQztZQUNiLElBQUksQ0FBQywyQ0FBMkMsRUFBRSxHQUFHLENBQUMsQ0FBQTtRQUN4RCxDQUFDO0lBQ0gsQ0FBQztDQUFBO0FBdkNELGdEQXVDQztBQUdELDBCQUFpQyxNQUE0QixFQUFFLEtBQXNCO0lBQ25GLE1BQU0sSUFBSSxHQUFHLE1BQU0sQ0FBQyxVQUFVLENBQUMsS0FBSyxDQUFDLEdBQUcsQ0FBQyxDQUFBO0lBQ3pDLE1BQU0sS0FBSyxHQUFHLElBQUksR0FBRyxDQUFDLElBQUksQ0FBQyxLQUFLLENBQUMsQ0FBQyxFQUFFLEtBQUssQ0FBQyxNQUFNLENBQUMsQ0FBQyxLQUFLLENBQUMsS0FBSyxDQUFDLElBQUksRUFBRSxDQUFDLEdBQUcsRUFBRSxDQUFBO0lBQzFFLE1BQU0sV0FBVyxHQUFHLENBQUMsR0FBRyxLQUFLLENBQUMsTUFBTSxDQUFBO0lBQ3BDLE1BQU0sQ0FBQyxJQUFJLFlBQUssQ0FBQyxLQUFLLENBQUMsR0FBRyxFQUFFLEtBQUssQ0FBQyxNQUFNLEdBQUcsV0FBVyxDQUFDLENBQUE7QUFDekQsQ0FBQztBQUxELDRDQUtDO0FBRUQsMEJBQWlDLE1BQTRCLEVBQUUsS0FBc0I7SUFDbkYsTUFBTSxLQUFLLEdBQUcsZ0JBQWdCLENBQUMsTUFBTSxFQUFFLEtBQUssQ0FBQyxLQUFLLENBQUMsQ0FBQTtJQUNuRCxNQUFNLEdBQUcsR0FBRyxnQkFBZ0IsQ0FBQyxNQUFNLEVBQUUsS0FBSyxDQUFDLEdBQUcsQ0FBQyxDQUFBO0lBQy9DLE1BQU0sQ0FBQyxJQUFJLFlBQUssQ0FBQyxLQUFLLEVBQUUsR0FBRyxDQUFDLENBQUE7QUFDOUIsQ0FBQztBQUpELDRDQUlDO0FBRUQsNEJBQW1DLE1BQTRCLEVBQUUsS0FBc0I7SUFDckYsTUFBTSxJQUFJLEdBQUcsTUFBTSxDQUFDLFVBQVUsQ0FBQyxLQUFLLENBQUMsR0FBRyxDQUFDLENBQUE7SUFDekMsSUFBSSxPQUFPLEdBQUcsQ0FBQyxDQUFBO0lBQ2YsSUFBSSxPQUFPLEdBQUcsS0FBSyxDQUFDLE1BQU0sQ0FBQTtJQUMxQixPQUFPLE9BQU8sR0FBRyxPQUFPLEVBQUUsQ0FBQztRQUV6QixFQUFFLENBQUMsQ0FBQyxDQUFDLElBQUksS0FBSyxTQUFTLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxPQUFPLENBQUMsS0FBSyxTQUFTLENBQUMsQ0FBQyxDQUFDLENBQUM7WUFBQyxLQUFLLENBQUE7UUFBQyxDQUFDO1FBQ3BFLEVBQUUsQ0FBQyxDQUFDLElBQUksQ0FBQyxPQUFPLENBQUMsS0FBSyxJQUFJLENBQUMsQ0FBQyxDQUFDO1lBQzNCLE9BQU8sSUFBSSxDQUFDLENBQUE7UUFDZCxDQUFDO1FBQ0QsT0FBTyxJQUFJLENBQUMsQ0FBQTtJQUNkLENBQUM7SUFDRCxNQUFNLENBQUMsSUFBSSxZQUFLLENBQUMsS0FBSyxDQUFDLEdBQUcsRUFBRSxPQUFPLENBQUMsQ0FBQTtBQUN0QyxDQUFDO0FBYkQsZ0RBYUM7QUFFRCw0QkFBbUMsTUFBNEIsRUFBRSxLQUFzQjtJQUNyRixNQUFNLEtBQUssR0FBRyxrQkFBa0IsQ0FBQyxNQUFNLEVBQUUsS0FBSyxDQUFDLEtBQUssQ0FBQyxDQUFBO0lBQ3JELE1BQU0sR0FBRyxHQUFHLGtCQUFrQixDQUFDLE1BQU0sRUFBRSxLQUFLLENBQUMsR0FBRyxDQUFDLENBQUE7SUFDakQsTUFBTSxDQUFDLElBQUksWUFBSyxDQUFDLEtBQUssRUFBRSxHQUFHLENBQUMsQ0FBQTtBQUM5QixDQUFDO0FBSkQsZ0RBSUM7QUFFRCxxQkFBNEIsRUFBVTtJQUNwQyxNQUFNLENBQUMsRUFBRSxDQUFDLFdBQVcsRUFBRSxLQUFLLEVBQUUsQ0FBQTtBQUNoQyxDQUFDO0FBRkQsa0NBRUM7QUFFRCx3QkFBK0IsRUFBRSxHQUFHLEVBQUUsT0FBTyxFQUFFLElBQUksRUFBc0I7SUFDdkUsTUFBTSxDQUFDO0VBQ1AsSUFBSSxDQUFDLFNBQVMsQ0FBQyxJQUFJLEVBQUUsU0FBUyxFQUFFLENBQUMsQ0FBQzs7RUFFbEMsSUFBSSxDQUFDLFNBQVMsQ0FBQyxPQUFPLEVBQUUsU0FBUyxFQUFFLENBQUMsQ0FBQzs7RUFFckMsR0FBRyxDQUFDLE9BQU87O0VBRVgsV0FBVyxFQUFFLEVBQUUsQ0FBQTtBQUNqQixDQUFDO0FBVEQsd0NBU0M7QUFFRCxxQkFBNEIsRUFBRSxHQUFHLEVBQUUsT0FBTyxFQUFFLElBQUksRUFBc0I7SUFDcEUsRUFBRSxDQUFDLENBQUMsR0FBRyxDQUFDLElBQUksS0FBSywwQkFBMEIsSUFBSSxPQUFPLENBQUMsQ0FBQyxDQUFDO1FBQ3ZELE1BQU0sQ0FBQzs7RUFFVCxPQUFPLENBQUMsV0FBVyxHQUFHLGNBQWMsR0FBRyxFQUFFLFdBQVcsT0FBTyxDQUFDLE9BQU87OzhDQUV2QixDQUFBO0lBQzVDLENBQUM7SUFBQyxJQUFJLENBQUMsRUFBRSxDQUFDLENBQUMsT0FBTyxDQUFDLENBQUMsQ0FBQztRQUNuQixNQUFNLENBQUM7O0VBRVQsT0FBTyxDQUFDLFdBQVcsR0FBRyxjQUFjLEdBQUcsRUFBRSxXQUFXLE9BQU8sQ0FBQyxPQUFPO29CQUNqRCxHQUFHLENBQUMsSUFBSSxFQUFFLENBQUE7SUFDNUIsQ0FBQztJQUFDLElBQUksQ0FBQyxDQUFDO1FBQ04sTUFBTSxDQUFDLGlDQUFpQyxHQUFHLENBQUMsSUFBSSxFQUFFLENBQUE7SUFDcEQsQ0FBQztBQUNILENBQUM7QUFmRCxrQ0FlQztBQUVELDZCQUFvQyxJQUF3QjtJQUMxRCxNQUFNLEVBQUUsR0FBRyxFQUFFLE9BQU8sRUFBRSxJQUFJLEVBQUUsR0FBRyxJQUFJLENBQUE7SUFDbkMsTUFBTSxjQUFjLEdBQUcsT0FBTyxJQUFJLE9BQU8sQ0FBQyxjQUFjLENBQUE7SUFFeEQsRUFBRSxDQUFDLENBQUMsQ0FBQyxjQUFjLENBQUMsQ0FBQyxDQUFDO1FBQ3BCLElBQUksQ0FBQyxhQUFhLENBQUMsUUFBUSxDQUN6QixXQUFXLENBQUMsSUFBSSxDQUFDLEVBQ2pCO1lBQ0UsTUFBTSxFQUFFLGNBQWMsQ0FBQyxJQUFJLENBQUM7WUFDNUIsS0FBSyxFQUFFLEdBQUcsQ0FBQyxLQUFLO1lBQ2hCLFdBQVcsRUFBRSxJQUFJO1NBQ2xCLENBQ0YsQ0FBQTtJQUNILENBQUM7SUFBQyxJQUFJLENBQUMsQ0FBQztRQUNOLEtBQUssQ0FBQyxJQUFJLEVBQUUsT0FBTyxFQUFFLEdBQUcsQ0FBQyxDQUFBO0lBQzNCLENBQUM7QUFDSCxDQUFDO0FBaEJELGtEQWdCQztBQUVEO0lBQ0UsSUFBSSxDQUFDLGFBQWEsQ0FBQyxVQUFVLENBQzNCLHNFQUFzRSxFQUN0RTtRQUNFLFdBQVcsRUFBRSxJQUFJO1FBQ2pCLE1BQU0sRUFBRTs7Ozs7OzsyREFPNkM7S0FDdEQsQ0FDRixDQUFBO0FBQ0gsQ0FBQztBQWZELGdEQWVDO0FBRUQsbUJBQW1CLEdBQTJDO0lBQzVELE1BQU0sSUFBSSxHQUFHLEVBQUUsQ0FBQTtJQUVmLEdBQUcsQ0FBQyxDQUFDLE1BQU0sSUFBSSxJQUFJLEdBQUcsQ0FBQyxDQUFDLENBQUM7UUFDdkIsTUFBTSxLQUFLLEdBQUcsSUFBSSxDQUFDLFdBQVcsRUFBRSxDQUFBO1FBQ2hDLEVBQUUsQ0FBQyxDQUNELEtBQUssS0FBSyxNQUFNO2VBQ2IsS0FBSyxDQUFDLFVBQVUsQ0FBQyxNQUFNLENBQUM7ZUFDeEIsS0FBSyxDQUFDLFVBQVUsQ0FBQyxRQUFRLENBQUM7ZUFDMUIsS0FBSyxDQUFDLFVBQVUsQ0FBQyxRQUFRLENBQzlCLENBQUMsQ0FBQyxDQUFDO1lBQ0QsSUFBSSxDQUFDLElBQUksQ0FBQyxHQUFHLEdBQUcsQ0FBQyxJQUFJLENBQUMsQ0FBQTtRQUN4QixDQUFDO0lBQ0gsQ0FBQztJQUNELE1BQU0sQ0FBQyxJQUFJLENBQUE7QUFDYixDQUFDO0FBRUQseUJBQWdDLElBQWdFO0lBQzlGLE1BQU0sU0FBUyxHQUFHLElBQUksQ0FBQyxLQUFLLENBQUMsSUFBSSxDQUFDLFNBQVMsQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQTtJQUN2RCxTQUFTLENBQUMsR0FBRyxHQUFHLFNBQVMsQ0FBQyxTQUFTLENBQUMsR0FBRyxDQUFDLENBQUE7SUFDeEMsSUFBSSxDQUFDLElBQUksR0FBRyxTQUFTLENBQUE7SUFDckIsSUFBSSxDQUFDLGFBQWEsQ0FBQyxhQUFhLENBQzlCOzJDQUN1QyxJQUFJLENBQUMsR0FBRyxDQUFDLElBQUksRUFBRSxFQUN0RDtRQUNFLE1BQU0sRUFBRTthQUNELElBQUksQ0FBQyxHQUFHLENBQUMsSUFBSTtFQUN4QixJQUFJLENBQUMsR0FBRyxDQUFDLE9BQU87O0VBRWhCLElBQUksQ0FBQyxTQUFTLENBQUMsSUFBSSxFQUFFLFNBQVMsRUFBRSxDQUFDLENBQUM7O0VBRWxDLElBQUksQ0FBQyxTQUFTLENBQUMsSUFBSSxDQUFDLE1BQU0sQ0FBQyxHQUFHLENBQUMsaUJBQWlCLENBQUMsRUFBQyxTQUFTLEVBQUMsQ0FBQyxDQUFDOztFQUU5RCxJQUFJLENBQUMsU0FBUyxDQUFDLFNBQVMsQ0FBQyxPQUFPLENBQUMsR0FBRyxDQUFDLEVBQUUsU0FBUyxFQUFFLENBQUMsQ0FBQztDQUNyRDtRQUNLLEtBQUssRUFBRSxJQUFJLENBQUMsR0FBRyxDQUFDLEtBQUs7UUFDckIsV0FBVyxFQUFFLElBQUk7S0FDbEIsQ0FDRixDQUFBO0FBQ0gsQ0FBQztBQXRCRCwwQ0FzQkM7QUFFRCx5QkFDRSxNQUE2RCxFQUFFLEdBQVcsRUFDMUUsSUFBNkQ7SUFFN0QsTUFBTSxtQkFDRCxJQUFJLElBQ0QsS0FBSyxDQUFDLEdBQUcsSUFBVzs7Z0JBQ3hCLElBQUksQ0FBQztvQkFFSCxNQUFNLENBQUMsTUFBTSxJQUFJLENBQUMsS0FBTSxDQUFDLElBQUksQ0FBQyxJQUFJLEVBQUUsR0FBRyxJQUFJLENBQUMsQ0FBQTtnQkFDOUMsQ0FBQztnQkFBQyxLQUFLLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDO29CQUVYLEtBQUssQ0FBQyxDQUFDLENBQUMsQ0FBQTtvQkFDUixNQUFNLEdBQUcsR0FBcUIsTUFBTyxJQUFZLENBQUMsR0FBRyxDQUFBO29CQUNyRCxHQUFHLENBQUMsU0FBUyxDQUFDO3dCQUNaLE1BQU0sRUFBRSxTQUFTO3dCQUNqQixNQUFNLEVBQUUsQ0FBQyxDQUFDLFFBQVEsRUFBRTtxQkFDckIsQ0FBQyxDQUFBO29CQUVGLE1BQU0sQ0FBQyxJQUFJLE9BQU8sQ0FBQyxRQUFtQixDQUFDLENBQUMsQ0FBQTtnQkFDMUMsQ0FBQztZQUNILENBQUM7U0FBQSxJQUNGO0FBQ0gsQ0FBQztBQXZCRCwwQ0F1QkMiLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgeyBSYW5nZSwgUG9pbnQgfSBmcm9tICdhdG9tJ1xuaW1wb3J0IHsgZGVsaW1pdGVyLCBzZXAsIGV4dG5hbWUgfSBmcm9tICdwYXRoJ1xuaW1wb3J0ICogYXMgVGVtcCBmcm9tICd0ZW1wJ1xuaW1wb3J0ICogYXMgRlMgZnJvbSAnZnMnXG5pbXBvcnQgKiBhcyBDUCBmcm9tICdjaGlsZF9wcm9jZXNzJ1xuaW1wb3J0IHsgRU9MIH0gZnJvbSAnb3MnXG5pbXBvcnQgeyBnZXRSb290RGlyRmFsbGJhY2ssIGdldFJvb3REaXIsIGlzRGlyZWN0b3J5IH0gZnJvbSAnYXRvbS1oYXNrZWxsLXV0aWxzJ1xuaW1wb3J0IHsgUnVuT3B0aW9ucywgSUVycm9yQ2FsbGJhY2tBcmdzIH0gZnJvbSAnLi9naGMtbW9kL2doYy1tb2RpLXByb2Nlc3MtcmVhbCdcblxudHlwZSBFeGVjT3B0cyA9IENQLkV4ZWNGaWxlT3B0aW9uc1dpdGhTdHJpbmdFbmNvZGluZ1xuZXhwb3J0IHsgZ2V0Um9vdERpckZhbGxiYWNrLCBnZXRSb290RGlyLCBpc0RpcmVjdG9yeSwgRXhlY09wdHMgfVxuXG5sZXQgZGVidWdsb2c6IEFycmF5PHsgdGltZXN0YW1wOiBudW1iZXIsIG1lc3NhZ2VzOiBzdHJpbmdbXSB9PiA9IFtdXG5jb25zdCBsb2dLZWVwID0gMzAwMDAgLy8gbXNcblxuZnVuY3Rpb24gc2F2ZWxvZyguLi5tZXNzYWdlczogc3RyaW5nW10pIHtcbiAgY29uc3QgdHMgPSBEYXRlLm5vdygpXG4gIGRlYnVnbG9nLnB1c2goe1xuICAgIHRpbWVzdGFtcDogdHMsXG4gICAgbWVzc2FnZXMsXG4gIH0pXG4gIGxldCBrcyA9IDBcbiAgZm9yIChjb25zdCB2IG9mIGRlYnVnbG9nKSB7XG4gICAgaWYgKCh0cyAtIHYudGltZXN0YW1wKSA+PSBsb2dLZWVwKSB7XG4gICAgICBicmVha1xuICAgIH1cbiAgICBrcysrXG4gIH1cbiAgZGVidWdsb2cuc3BsaWNlKDAsIGtzKVxufVxuXG5mdW5jdGlvbiBqb2luUGF0aChkczogc3RyaW5nW10pIHtcbiAgY29uc3Qgc2V0ID0gbmV3IFNldChkcylcbiAgcmV0dXJuIEFycmF5LmZyb20oc2V0KS5qb2luKGRlbGltaXRlcilcbn1cblxuZXhwb3J0IGNvbnN0IEVPVCA9IGAke0VPTH1cXHgwNCR7RU9MfWBcblxuZXhwb3J0IGZ1bmN0aW9uIGRlYnVnKC4uLm1lc3NhZ2VzOiBhbnlbXSkge1xuICBpZiAoYXRvbS5jb25maWcuZ2V0KCdoYXNrZWxsLWdoYy1tb2QuZGVidWcnKSkge1xuICAgIC8vIHRzbGludDpkaXNhYmxlLW5leHQtbGluZTogbm8tY29uc29sZVxuICAgIGNvbnNvbGUubG9nKCdoYXNrZWxsLWdoYy1tb2QgZGVidWc6JywgLi4ubWVzc2FnZXMpXG4gIH1cbiAgc2F2ZWxvZyguLi5tZXNzYWdlcy5tYXAoKHYpID0+IEpTT04uc3RyaW5naWZ5KHYpKSlcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIHdhcm4oLi4ubWVzc2FnZXM6IGFueVtdKSB7XG4gIC8vIHRzbGludDpkaXNhYmxlLW5leHQtbGluZTogbm8tY29uc29sZVxuICBjb25zb2xlLndhcm4oJ2hhc2tlbGwtZ2hjLW1vZCB3YXJuaW5nOicsIC4uLm1lc3NhZ2VzKVxuICBzYXZlbG9nKC4uLm1lc3NhZ2VzLm1hcCgodikgPT4gSlNPTi5zdHJpbmdpZnkodikpKVxufVxuXG5leHBvcnQgZnVuY3Rpb24gZXJyb3IoLi4ubWVzc2FnZXM6IGFueVtdKSB7XG4gIC8vIHRzbGludDpkaXNhYmxlLW5leHQtbGluZTogbm8tY29uc29sZVxuICBjb25zb2xlLmVycm9yKCdoYXNrZWxsLWdoYy1tb2QgZXJyb3I6JywgLi4ubWVzc2FnZXMpXG4gIHNhdmVsb2coLi4ubWVzc2FnZXMubWFwKCh2KSA9PiBKU09OLnN0cmluZ2lmeSh2KSkpXG59XG5cbmV4cG9ydCBmdW5jdGlvbiBnZXREZWJ1Z0xvZygpIHtcbiAgY29uc3QgdHMgPSBEYXRlLm5vdygpXG4gIGRlYnVnbG9nID0gZGVidWdsb2cuZmlsdGVyKCh7IHRpbWVzdGFtcCB9KSA9PiAodHMgLSB0aW1lc3RhbXApIDwgbG9nS2VlcClcbiAgcmV0dXJuIGRlYnVnbG9nLm1hcCgoeyB0aW1lc3RhbXAsIG1lc3NhZ2VzIH0pID0+IGAkeyh0aW1lc3RhbXAgLSB0cykgLyAxMDAwfXM6ICR7bWVzc2FnZXMuam9pbignLCcpfWApLmpvaW4oRU9MKVxufVxuXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gZXhlY1Byb21pc2UoY21kOiBzdHJpbmcsIGFyZ3M6IHN0cmluZ1tdLCBvcHRzOiBFeGVjT3B0cywgc3RkaW4/OiBzdHJpbmcpIHtcbiAgcmV0dXJuIG5ldyBQcm9taXNlPHsgc3Rkb3V0OiBzdHJpbmcsIHN0ZGVycjogc3RyaW5nIH0+KChyZXNvbHZlLCByZWplY3QpID0+IHtcbiAgICBkZWJ1ZyhgUnVubmluZyAke2NtZH0gJHthcmdzfSB3aXRoIG9wdHMgPSBgLCBvcHRzKVxuICAgIGNvbnN0IGNoaWxkID0gQ1AuZXhlY0ZpbGUoY21kLCBhcmdzLCBvcHRzLCAoZXJyb3IsIHN0ZG91dDogc3RyaW5nLCBzdGRlcnI6IHN0cmluZykgPT4ge1xuICAgICAgaWYgKHN0ZGVyci50cmltKCkubGVuZ3RoID4gMCkgeyB3YXJuKHN0ZGVycikgfVxuICAgICAgaWYgKGVycm9yKSB7XG4gICAgICAgIHdhcm4oYFJ1bm5pbmcgJHtjbWR9ICR7YXJnc30gZmFpbGVkIHdpdGggYCwgZXJyb3IpXG4gICAgICAgIGlmIChzdGRvdXQpIHsgd2FybihzdGRvdXQpIH1cbiAgICAgICAgZXJyb3Iuc3RhY2sgPSAobmV3IEVycm9yKCkpLnN0YWNrXG4gICAgICAgIHJlamVjdChlcnJvcilcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIGRlYnVnKGBHb3QgcmVzcG9uc2UgZnJvbSAke2NtZH0gJHthcmdzfWAsIHsgc3Rkb3V0LCBzdGRlcnIgfSlcbiAgICAgICAgcmVzb2x2ZSh7IHN0ZG91dCwgc3RkZXJyIH0pXG4gICAgICB9XG4gICAgfSlcbiAgICBpZiAoc3RkaW4pIHtcbiAgICAgIGRlYnVnKGBzZW5kaW5nIHN0ZGluIHRleHQgdG8gJHtjbWR9ICR7YXJnc31gKVxuICAgICAgY2hpbGQuc3RkaW4ud3JpdGUoc3RkaW4pXG4gICAgfVxuICB9KVxufVxuXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gZ2V0Q2FiYWxTYW5kYm94KHJvb3RQYXRoOiBzdHJpbmcpIHtcbiAgZGVidWcoJ0xvb2tpbmcgZm9yIGNhYmFsIHNhbmRib3guLi4nKVxuICBjb25zdCBzYmMgPSBhd2FpdCBwYXJzZVNhbmRib3hDb25maWcoYCR7cm9vdFBhdGh9JHtzZXB9Y2FiYWwuc2FuZGJveC5jb25maWdgKVxuICAvLyB0c2xpbnQ6ZGlzYWJsZTogbm8tc3RyaW5nLWxpdGVyYWxcbiAgaWYgKHNiYyAmJiBzYmNbJ2luc3RhbGwtZGlycyddICYmIHNiY1snaW5zdGFsbC1kaXJzJ11bJ2JpbmRpciddKSB7XG4gICAgY29uc3Qgc2FuZGJveCA9IHNiY1snaW5zdGFsbC1kaXJzJ11bJ2JpbmRpciddXG4gICAgZGVidWcoJ0ZvdW5kIGNhYmFsIHNhbmRib3g6ICcsIHNhbmRib3gpXG4gICAgaWYgKGlzRGlyZWN0b3J5KHNhbmRib3gpKSB7XG4gICAgICByZXR1cm4gc2FuZGJveFxuICAgIH0gZWxzZSB7XG4gICAgICB3YXJuKCdDYWJhbCBzYW5kYm94ICcsIHNhbmRib3gsICcgaXMgbm90IGEgZGlyZWN0b3J5JylcbiAgICB9XG4gIH0gZWxzZSB7XG4gICAgd2FybignTm8gY2FiYWwgc2FuZGJveCBmb3VuZCcpXG4gIH1cbiAgLy8gdHNsaW50OmVuYWJsZTogbm8tc3RyaW5nLWxpdGVyYWxcbn1cblxuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIGdldFN0YWNrU2FuZGJveChyb290UGF0aDogc3RyaW5nLCBhcGQ6IHN0cmluZ1tdLCBlbnY6IHsgW2tleTogc3RyaW5nXTogc3RyaW5nIHwgdW5kZWZpbmVkIH0pIHtcbiAgZGVidWcoJ0xvb2tpbmcgZm9yIHN0YWNrIHNhbmRib3guLi4nKVxuICBlbnYuUEFUSCA9IGpvaW5QYXRoKGFwZClcbiAgZGVidWcoJ1J1bm5pbmcgc3RhY2sgd2l0aCBQQVRIICcsIGVudi5QQVRIKVxuICB0cnkge1xuICAgIGNvbnN0IG91dCA9IGF3YWl0IGV4ZWNQcm9taXNlKCdzdGFjaycsIFsncGF0aCcsICctLXNuYXBzaG90LWluc3RhbGwtcm9vdCcsICctLWxvY2FsLWluc3RhbGwtcm9vdCcsICctLWJpbi1wYXRoJ10sIHtcbiAgICAgIGVuY29kaW5nOiAndXRmOCcsXG4gICAgICBjd2Q6IHJvb3RQYXRoLFxuICAgICAgZW52LFxuICAgICAgdGltZW91dDogYXRvbS5jb25maWcuZ2V0KCdoYXNrZWxsLWdoYy1tb2QuaW5pdFRpbWVvdXQnKSAqIDEwMDAsXG4gICAgfSlcblxuICAgIGNvbnN0IGxpbmVzID0gb3V0LnN0ZG91dC5zcGxpdChFT0wpXG4gICAgY29uc3Qgc2lyID0gbGluZXMuZmlsdGVyKChsKSA9PiBsLnN0YXJ0c1dpdGgoJ3NuYXBzaG90LWluc3RhbGwtcm9vdDogJykpWzBdLnNsaWNlKDIzKSArIGAke3NlcH1iaW5gXG4gICAgY29uc3QgbGlyID0gbGluZXMuZmlsdGVyKChsKSA9PiBsLnN0YXJ0c1dpdGgoJ2xvY2FsLWluc3RhbGwtcm9vdDogJykpWzBdLnNsaWNlKDIwKSArIGAke3NlcH1iaW5gXG4gICAgY29uc3QgYnAgPVxuICAgICAgbGluZXMuZmlsdGVyKChsKSA9PlxuICAgICAgICBsLnN0YXJ0c1dpdGgoJ2Jpbi1wYXRoOiAnKSlbMF0uc2xpY2UoMTApLnNwbGl0KGRlbGltaXRlcikuZmlsdGVyKChwKSA9PlxuICAgICAgICAgICEoKHAgPT09IHNpcikgfHwgKHAgPT09IGxpcikgfHwgKGFwZC5pbmNsdWRlcyhwKSkpKVxuICAgIGRlYnVnKCdGb3VuZCBzdGFjayBzYW5kYm94ICcsIGxpciwgc2lyLCAuLi5icClcbiAgICByZXR1cm4gW2xpciwgc2lyLCAuLi5icF1cbiAgfSBjYXRjaCAoZXJyKSB7XG4gICAgd2FybignTm8gc3RhY2sgc2FuZGJveCBmb3VuZCBiZWNhdXNlICcsIGVycilcbiAgfVxufVxuXG5jb25zdCBwcm9jZXNzT3B0aW9uc0NhY2hlID0gbmV3IE1hcDxzdHJpbmcsIFJ1bk9wdGlvbnM+KClcblxuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIGdldFByb2Nlc3NPcHRpb25zKHJvb3RQYXRoPzogc3RyaW5nKTogUHJvbWlzZTxSdW5PcHRpb25zPiB7XG4gIGlmICghcm9vdFBhdGgpIHtcbiAgICAvLyB0c2xpbnQ6ZGlzYWJsZS1uZXh0LWxpbmU6IG5vLW51bGwta2V5d29yZFxuICAgIHJvb3RQYXRoID0gZ2V0Um9vdERpckZhbGxiYWNrKG51bGwpLmdldFBhdGgoKVxuICB9XG4gIC8vIGNhY2hlXG4gIGNvbnN0IGNhY2hlZCA9IHByb2Nlc3NPcHRpb25zQ2FjaGUuZ2V0KHJvb3RQYXRoKVxuICBpZiAoY2FjaGVkKSB7XG4gICAgcmV0dXJuIGNhY2hlZFxuICB9XG5cbiAgZGVidWcoYGdldFByb2Nlc3NPcHRpb25zKCR7cm9vdFBhdGh9KWApXG4gIGNvbnN0IGVudiA9IHsgLi4ucHJvY2Vzcy5lbnYgfVxuXG4gIC8vIHRzbGludDpkaXNhYmxlLW5leHQtbGluZTogdG90YWxpdHktY2hlY2tcbiAgaWYgKHByb2Nlc3MucGxhdGZvcm0gPT09ICd3aW4zMicpIHtcbiAgICBjb25zdCBQQVRIID0gW11cbiAgICBjb25zdCBjYXBNYXNrID0gKHN0cjogc3RyaW5nLCBtYXNrOiBudW1iZXIpID0+IHtcbiAgICAgIGNvbnN0IGEgPSBzdHIuc3BsaXQoJycpXG4gICAgICBmb3IgKGxldCBpID0gMDsgaSA8IGEubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgaWYgKG1hc2sgJiBNYXRoLnBvdygyLCBpKSkge1xuICAgICAgICAgIGFbaV0gPSBhW2ldLnRvVXBwZXJDYXNlKClcbiAgICAgICAgfVxuICAgICAgfVxuICAgICAgcmV0dXJuIGEuam9pbignJylcbiAgICB9XG4gICAgZm9yIChsZXQgbSA9IDBiMTExMTsgbSA+PSAwOyBtLS0pIHtcbiAgICAgIGNvbnN0IHZuID0gY2FwTWFzaygncGF0aCcsIG0pXG4gICAgICBpZiAoZW52W3ZuXSkge1xuICAgICAgICBQQVRILnB1c2goZW52W3ZuXSlcbiAgICAgIH1cbiAgICB9XG4gICAgZW52LlBBVEggPSBQQVRILmpvaW4oZGVsaW1pdGVyKVxuICB9XG5cbiAgY29uc3QgUEFUSCA9IGVudi5QQVRIIHx8ICcnXG5cbiAgY29uc3QgYXBkID0gYXRvbS5jb25maWcuZ2V0KCdoYXNrZWxsLWdoYy1tb2QuYWRkaXRpb25hbFBhdGhEaXJlY3RvcmllcycpLmNvbmNhdChQQVRILnNwbGl0KGRlbGltaXRlcikpXG4gIGNvbnN0IGNhYmFsU2FuZGJveCA9IGF0b20uY29uZmlnLmdldCgnaGFza2VsbC1naGMtbW9kLmNhYmFsU2FuZGJveCcpXG4gICAgPyBnZXRDYWJhbFNhbmRib3gocm9vdFBhdGgpIDogUHJvbWlzZS5yZXNvbHZlKClcbiAgY29uc3Qgc3RhY2tTYW5kYm94ID0gYXRvbS5jb25maWcuZ2V0KCdoYXNrZWxsLWdoYy1tb2Quc3RhY2tTYW5kYm94JylcbiAgICA/IGdldFN0YWNrU2FuZGJveChyb290UGF0aCwgYXBkLCB7IC4uLmVudiB9KSA6IFByb21pc2UucmVzb2x2ZSgpXG4gIGNvbnN0IFtjYWJhbFNhbmRib3hEaXIsIHN0YWNrU2FuZGJveERpcnNdID0gYXdhaXQgUHJvbWlzZS5hbGwoW2NhYmFsU2FuZGJveCwgc3RhY2tTYW5kYm94XSlcbiAgY29uc3QgbmV3cCA9IFtdXG4gIGlmIChjYWJhbFNhbmRib3hEaXIpIHtcbiAgICBuZXdwLnB1c2goY2FiYWxTYW5kYm94RGlyKVxuICB9XG4gIGlmIChzdGFja1NhbmRib3hEaXJzKSB7XG4gICAgbmV3cC5wdXNoKC4uLnN0YWNrU2FuZGJveERpcnMpXG4gIH1cbiAgbmV3cC5wdXNoKC4uLmFwZClcbiAgZW52LlBBVEggPSBqb2luUGF0aChuZXdwKVxuICBkZWJ1ZyhgUEFUSCA9ICR7ZW52LlBBVEh9YClcbiAgY29uc3QgcmVzOiBSdW5PcHRpb25zID0ge1xuICAgIGN3ZDogcm9vdFBhdGgsXG4gICAgZW52LFxuICAgIGVuY29kaW5nOiAndXRmOCcsXG4gICAgbWF4QnVmZmVyOiBJbmZpbml0eSxcbiAgfVxuICBwcm9jZXNzT3B0aW9uc0NhY2hlLnNldChyb290UGF0aCwgcmVzKVxuICByZXR1cm4gcmVzXG59XG5cbmV4cG9ydCBmdW5jdGlvbiBnZXRTeW1ib2xBdFBvaW50KFxuICBlZGl0b3I6IEF0b21UeXBlcy5UZXh0RWRpdG9yLCBwb2ludDogQXRvbVR5cGVzLlBvaW50LFxuKSB7XG4gIGNvbnN0IFtzY29wZV0gPSBlZGl0b3Iuc2NvcGVEZXNjcmlwdG9yRm9yQnVmZmVyUG9zaXRpb24ocG9pbnQpLmdldFNjb3Blc0FycmF5KCkuc2xpY2UoLTEpXG4gIGlmIChzY29wZSkge1xuICAgIGNvbnN0IHJhbmdlID0gZWRpdG9yLmJ1ZmZlclJhbmdlRm9yU2NvcGVBdFBvc2l0aW9uKHNjb3BlLCBwb2ludClcbiAgICBpZiAocmFuZ2UgJiYgIXJhbmdlLmlzRW1wdHkoKSkge1xuICAgICAgY29uc3Qgc3ltYm9sID0gZWRpdG9yLmdldFRleHRJbkJ1ZmZlclJhbmdlKHJhbmdlKVxuICAgICAgcmV0dXJuIHsgc2NvcGUsIHJhbmdlLCBzeW1ib2wgfVxuICAgIH1cbiAgfVxufVxuXG5leHBvcnQgZnVuY3Rpb24gZ2V0U3ltYm9sSW5SYW5nZShlZGl0b3I6IEF0b21UeXBlcy5UZXh0RWRpdG9yLCBjcmFuZ2U6IEF0b21UeXBlcy5SYW5nZSkge1xuICBjb25zdCBidWZmZXIgPSBlZGl0b3IuZ2V0QnVmZmVyKClcbiAgaWYgKGNyYW5nZS5pc0VtcHR5KCkpIHtcbiAgICByZXR1cm4gZ2V0U3ltYm9sQXRQb2ludChlZGl0b3IsIGNyYW5nZS5zdGFydClcbiAgfSBlbHNlIHtcbiAgICByZXR1cm4ge1xuICAgICAgc3ltYm9sOiBidWZmZXIuZ2V0VGV4dEluUmFuZ2UoY3JhbmdlKSxcbiAgICAgIHJhbmdlOiBjcmFuZ2UsXG4gICAgfVxuICB9XG59XG5cbmV4cG9ydCBhc3luYyBmdW5jdGlvbiB3aXRoVGVtcEZpbGU8VD4oY29udGVudHM6IHN0cmluZywgdXJpOiBzdHJpbmcsIGdlbjogKHBhdGg6IHN0cmluZykgPT4gUHJvbWlzZTxUPik6IFByb21pc2U8VD4ge1xuICBjb25zdCBpbmZvID0gYXdhaXQgbmV3IFByb21pc2U8VGVtcC5PcGVuRmlsZT4oXG4gICAgKHJlc29sdmUsIHJlamVjdCkgPT5cbiAgICAgIFRlbXAub3BlbihcbiAgICAgICAgeyBwcmVmaXg6ICdoYXNrZWxsLWdoYy1tb2QnLCBzdWZmaXg6IGV4dG5hbWUodXJpIHx8ICcuaHMnKSB9LFxuICAgICAgICAoZXJyLCBpbmZvMikgPT4ge1xuICAgICAgICAgIGlmIChlcnIpIHtcbiAgICAgICAgICAgIHJlamVjdChlcnIpXG4gICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHJlc29sdmUoaW5mbzIpXG4gICAgICAgICAgfVxuICAgICAgICB9KSlcbiAgcmV0dXJuIG5ldyBQcm9taXNlPFQ+KChyZXNvbHZlLCByZWplY3QpID0+XG4gICAgRlMud3JpdGUoaW5mby5mZCwgY29udGVudHMsIGFzeW5jIChlcnIpID0+IHtcbiAgICAgIGlmIChlcnIpIHtcbiAgICAgICAgcmVqZWN0KGVycilcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHJlc29sdmUoYXdhaXQgZ2VuKGluZm8ucGF0aCkpXG4gICAgICAgIEZTLmNsb3NlKGluZm8uZmQsICgpID0+IEZTLnVubGluayhpbmZvLnBhdGgsICgpID0+IHsgLypub29wKi8gfSkpXG4gICAgICB9XG4gICAgfSkpXG59XG5cbmV4cG9ydCB0eXBlIEtub3duRXJyb3JOYW1lID1cbiAgJ0dIQ01vZFN0ZG91dEVycm9yJ1xuICB8ICdJbnRlcmFjdGl2ZUFjdGlvblRpbWVvdXQnXG4gIHwgJ0dIQ01vZEludGVyYWN0aXZlQ3Jhc2gnXG5cbmV4cG9ydCBmdW5jdGlvbiBta0Vycm9yKG5hbWU6IEtub3duRXJyb3JOYW1lLCBtZXNzYWdlOiBzdHJpbmcpIHtcbiAgY29uc3QgZXJyID0gbmV3IEVycm9yKG1lc3NhZ2UpXG4gIGVyci5uYW1lID0gbmFtZVxuICByZXR1cm4gZXJyXG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgU2FuZGJveENvbmZpZ1RyZWUgeyBbazogc3RyaW5nXTogU2FuZGJveENvbmZpZ1RyZWUgfCBzdHJpbmcgfVxuXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gcGFyc2VTYW5kYm94Q29uZmlnKGZpbGU6IHN0cmluZykge1xuICB0cnkge1xuICAgIGNvbnN0IHNiYyA9IGF3YWl0IG5ldyBQcm9taXNlPHN0cmluZz4oKHJlc29sdmUsIHJlamVjdCkgPT5cbiAgICAgIEZTLnJlYWRGaWxlKGZpbGUsIHsgZW5jb2Rpbmc6ICd1dGYtOCcgfSwgKGVyciwgc2JjMikgPT4ge1xuICAgICAgICBpZiAoZXJyKSB7XG4gICAgICAgICAgcmVqZWN0KGVycilcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICByZXNvbHZlKHNiYzIpXG4gICAgICAgIH1cbiAgICAgIH0pKVxuICAgIGNvbnN0IHZhcnM6IFNhbmRib3hDb25maWdUcmVlID0ge31cbiAgICBsZXQgc2NvcGUgPSB2YXJzXG4gICAgY29uc3QgcnYgPSAodjogc3RyaW5nKSA9PiB7XG4gICAgICBmb3IgKGNvbnN0IGsxIG9mIE9iamVjdC5rZXlzKHNjb3BlKSkge1xuICAgICAgICBjb25zdCB2MSA9IHNjb3BlW2sxXVxuICAgICAgICBpZiAodHlwZW9mIHYxID09PSAnc3RyaW5nJykge1xuICAgICAgICAgIHYgPSB2LnNwbGl0KGAkJHtrMX1gKS5qb2luKHYxKVxuICAgICAgICB9XG4gICAgICB9XG4gICAgICByZXR1cm4gdlxuICAgIH1cbiAgICBmb3IgKGNvbnN0IGxpbmUgb2Ygc2JjLnNwbGl0KC9cXHI/XFxufFxcci8pKSB7XG4gICAgICBpZiAoIWxpbmUubWF0Y2goL15cXHMqLS0vKSAmJiAhbGluZS5tYXRjaCgvXlxccyokLykpIHtcbiAgICAgICAgY29uc3QgW2xdID0gbGluZS5zcGxpdCgvLS0vKVxuICAgICAgICBjb25zdCBtID0gbC5tYXRjaCgvXlxccyooW1xcdy1dKyk6XFxzKiguKilcXHMqJC8pXG4gICAgICAgIGlmIChtKSB7XG4gICAgICAgICAgY29uc3QgW18sIG5hbWUsIHZhbF0gPSBtXG4gICAgICAgICAgc2NvcGVbbmFtZV0gPSBydih2YWwpXG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgY29uc3QgbmV3c2NvcGUgPSB7fVxuICAgICAgICAgIHNjb3BlW2xpbmVdID0gbmV3c2NvcGVcbiAgICAgICAgICBzY29wZSA9IG5ld3Njb3BlXG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9XG4gICAgcmV0dXJuIHZhcnNcbiAgfSBjYXRjaCAoZXJyKSB7XG4gICAgd2FybignUmVhZGluZyBjYWJhbCBzYW5kYm94IGNvbmZpZyBmYWlsZWQgd2l0aCAnLCBlcnIpXG4gIH1cbn1cblxuLy8gQSBkaXJ0eSBoYWNrIHRvIHdvcmsgd2l0aCB0YWJzXG5leHBvcnQgZnVuY3Rpb24gdGFiU2hpZnRGb3JQb2ludChidWZmZXI6IEF0b21UeXBlcy5UZXh0QnVmZmVyLCBwb2ludDogQXRvbVR5cGVzLlBvaW50KSB7XG4gIGNvbnN0IGxpbmUgPSBidWZmZXIubGluZUZvclJvdyhwb2ludC5yb3cpXG4gIGNvbnN0IG1hdGNoID0gbGluZSA/IChsaW5lLnNsaWNlKDAsIHBvaW50LmNvbHVtbikubWF0Y2goL1xcdC9nKSB8fCBbXSkgOiBbXVxuICBjb25zdCBjb2x1bW5TaGlmdCA9IDcgKiBtYXRjaC5sZW5ndGhcbiAgcmV0dXJuIG5ldyBQb2ludChwb2ludC5yb3csIHBvaW50LmNvbHVtbiArIGNvbHVtblNoaWZ0KVxufVxuXG5leHBvcnQgZnVuY3Rpb24gdGFiU2hpZnRGb3JSYW5nZShidWZmZXI6IEF0b21UeXBlcy5UZXh0QnVmZmVyLCByYW5nZTogQXRvbVR5cGVzLlJhbmdlKSB7XG4gIGNvbnN0IHN0YXJ0ID0gdGFiU2hpZnRGb3JQb2ludChidWZmZXIsIHJhbmdlLnN0YXJ0KVxuICBjb25zdCBlbmQgPSB0YWJTaGlmdEZvclBvaW50KGJ1ZmZlciwgcmFuZ2UuZW5kKVxuICByZXR1cm4gbmV3IFJhbmdlKHN0YXJ0LCBlbmQpXG59XG5cbmV4cG9ydCBmdW5jdGlvbiB0YWJVbnNoaWZ0Rm9yUG9pbnQoYnVmZmVyOiBBdG9tVHlwZXMuVGV4dEJ1ZmZlciwgcG9pbnQ6IEF0b21UeXBlcy5Qb2ludCkge1xuICBjb25zdCBsaW5lID0gYnVmZmVyLmxpbmVGb3JSb3cocG9pbnQucm93KVxuICBsZXQgY29sdW1ubCA9IDBcbiAgbGV0IGNvbHVtbnIgPSBwb2ludC5jb2x1bW5cbiAgd2hpbGUgKGNvbHVtbmwgPCBjb2x1bW5yKSB7XG4gICAgLy8gdHNsaW50OmRpc2FibGUtbmV4dC1saW5lOiBzdHJpY3QtdHlwZS1wcmVkaWNhdGVzXG4gICAgaWYgKChsaW5lID09PSB1bmRlZmluZWQpIHx8IChsaW5lW2NvbHVtbmxdID09PSB1bmRlZmluZWQpKSB7IGJyZWFrIH1cbiAgICBpZiAobGluZVtjb2x1bW5sXSA9PT0gJ1xcdCcpIHtcbiAgICAgIGNvbHVtbnIgLT0gN1xuICAgIH1cbiAgICBjb2x1bW5sICs9IDFcbiAgfVxuICByZXR1cm4gbmV3IFBvaW50KHBvaW50LnJvdywgY29sdW1ucilcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIHRhYlVuc2hpZnRGb3JSYW5nZShidWZmZXI6IEF0b21UeXBlcy5UZXh0QnVmZmVyLCByYW5nZTogQXRvbVR5cGVzLlJhbmdlKSB7XG4gIGNvbnN0IHN0YXJ0ID0gdGFiVW5zaGlmdEZvclBvaW50KGJ1ZmZlciwgcmFuZ2Uuc3RhcnQpXG4gIGNvbnN0IGVuZCA9IHRhYlVuc2hpZnRGb3JQb2ludChidWZmZXIsIHJhbmdlLmVuZClcbiAgcmV0dXJuIG5ldyBSYW5nZShzdGFydCwgZW5kKVxufVxuXG5leHBvcnQgZnVuY3Rpb24gaXNVcHBlckNhc2UoY2g6IHN0cmluZyk6IGJvb2xlYW4ge1xuICByZXR1cm4gY2gudG9VcHBlckNhc2UoKSA9PT0gY2hcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGdldEVycm9yRGV0YWlsKHsgZXJyLCBydW5BcmdzLCBjYXBzIH06IElFcnJvckNhbGxiYWNrQXJncykge1xuICByZXR1cm4gYGNhcHM6XG4ke0pTT04uc3RyaW5naWZ5KGNhcHMsIHVuZGVmaW5lZCwgMil9XG5BcmdzOlxuJHtKU09OLnN0cmluZ2lmeShydW5BcmdzLCB1bmRlZmluZWQsIDIpfVxubWVzc2FnZTpcbiR7ZXJyLm1lc3NhZ2V9XG5sb2c6XG4ke2dldERlYnVnTG9nKCl9YFxufVxuXG5leHBvcnQgZnVuY3Rpb24gZm9ybWF0RXJyb3IoeyBlcnIsIHJ1bkFyZ3MsIGNhcHMgfTogSUVycm9yQ2FsbGJhY2tBcmdzKSB7XG4gIGlmIChlcnIubmFtZSA9PT0gJ0ludGVyYWN0aXZlQWN0aW9uVGltZW91dCcgJiYgcnVuQXJncykge1xuICAgIHJldHVybiBgXFxcbkhhc2tlbGwtZ2hjLW1vZDogZ2hjLW1vZCBcXFxuJHtydW5BcmdzLmludGVyYWN0aXZlID8gJ2ludGVyYWN0aXZlICcgOiAnJ31jb21tYW5kICR7cnVuQXJncy5jb21tYW5kfSBcXFxudGltZWQgb3V0LiBZb3UgY2FuIHRyeSB0byBmaXggaXQgYnkgcmFpc2luZyAnSW50ZXJhY3RpdmUgQWN0aW9uIFxcXG5UaW1lb3V0JyBzZXR0aW5nIGluIGhhc2tlbGwtZ2hjLW1vZCBzZXR0aW5ncy5gXG4gIH0gZWxzZSBpZiAocnVuQXJncykge1xuICAgIHJldHVybiBgXFxcbkhhc2tlbGwtZ2hjLW1vZDogZ2hjLW1vZCBcXFxuJHtydW5BcmdzLmludGVyYWN0aXZlID8gJ2ludGVyYWN0aXZlICcgOiAnJ31jb21tYW5kICR7cnVuQXJncy5jb21tYW5kfSBcXFxuZmFpbGVkIHdpdGggZXJyb3IgJHtlcnIubmFtZX1gXG4gIH0gZWxzZSB7XG4gICAgcmV0dXJuIGBUaGVyZSB3YXMgYW4gdW5leHBlY3RlZCBlcnJvciAke2Vyci5uYW1lfWBcbiAgfVxufVxuXG5leHBvcnQgZnVuY3Rpb24gZGVmYXVsdEVycm9ySGFuZGxlcihhcmdzOiBJRXJyb3JDYWxsYmFja0FyZ3MpIHtcbiAgY29uc3QgeyBlcnIsIHJ1bkFyZ3MsIGNhcHMgfSA9IGFyZ3NcbiAgY29uc3Qgc3VwcHJlc3NFcnJvcnMgPSBydW5BcmdzICYmIHJ1bkFyZ3Muc3VwcHJlc3NFcnJvcnNcblxuICBpZiAoIXN1cHByZXNzRXJyb3JzKSB7XG4gICAgYXRvbS5ub3RpZmljYXRpb25zLmFkZEVycm9yKFxuICAgICAgZm9ybWF0RXJyb3IoYXJncyksXG4gICAgICB7XG4gICAgICAgIGRldGFpbDogZ2V0RXJyb3JEZXRhaWwoYXJncyksXG4gICAgICAgIHN0YWNrOiBlcnIuc3RhY2ssXG4gICAgICAgIGRpc21pc3NhYmxlOiB0cnVlLFxuICAgICAgfSxcbiAgICApXG4gIH0gZWxzZSB7XG4gICAgZXJyb3IoY2FwcywgcnVuQXJncywgZXJyKVxuICB9XG59XG5cbmV4cG9ydCBmdW5jdGlvbiB3YXJuR0hDUGFja2FnZVBhdGgoKSB7XG4gIGF0b20ubm90aWZpY2F0aW9ucy5hZGRXYXJuaW5nKFxuICAgICdoYXNrZWxsLWdoYy1tb2Q6IFlvdSBoYXZlIEdIQ19QQUNLQUdFX1BBVEggZW52aXJvbm1lbnQgdmFyaWFibGUgc2V0IScsXG4gICAge1xuICAgICAgZGlzbWlzc2FibGU6IHRydWUsXG4gICAgICBkZXRhaWw6IGBcXFxuVGhpcyBjb25maWd1cmF0aW9uIGlzIG5vdCBzdXBwb3J0ZWQsIGFuZCBjYW4gYnJlYWsgYXJiaXRyYXJpbHkuIFlvdSBjYW4gdHJ5IHRvIGJhbmQtYWlkIGl0IGJ5IGFkZGluZ1xuXG5kZWxldGUgcHJvY2Vzcy5lbnYuR0hDX1BBQ0tBR0VfUEFUSFxuXG50byB5b3VyIEF0b20gaW5pdCBzY3JpcHQgKEVkaXQg4oaSIEluaXQgU2NyaXB0Li4uKVxuXG5Zb3UgY2FuIHN1cHByZXNzIHRoaXMgd2FybmluZyBpbiBoYXNrZWxsLWdoYy1tb2Qgc2V0dGluZ3MuYCxcbiAgICB9LFxuICApXG59XG5cbmZ1bmN0aW9uIGZpbHRlckVudihlbnY6IHsgW25hbWU6IHN0cmluZ106IHN0cmluZyB8IHVuZGVmaW5lZCB9KSB7XG4gIGNvbnN0IGZlbnYgPSB7fVxuICAvLyB0c2xpbnQ6ZGlzYWJsZS1uZXh0LWxpbmU6IGZvcmluXG4gIGZvciAoY29uc3QgZXZhciBpbiBlbnYpIHtcbiAgICBjb25zdCBldmFyVSA9IGV2YXIudG9VcHBlckNhc2UoKVxuICAgIGlmIChcbiAgICAgIGV2YXJVID09PSAnUEFUSCdcbiAgICAgIHx8IGV2YXJVLnN0YXJ0c1dpdGgoJ0dIQ18nKVxuICAgICAgfHwgZXZhclUuc3RhcnRzV2l0aCgnU1RBQ0tfJylcbiAgICAgIHx8IGV2YXJVLnN0YXJ0c1dpdGgoJ0NBQkFMXycpXG4gICAgKSB7XG4gICAgICBmZW52W2V2YXJdID0gZW52W2V2YXJdXG4gICAgfVxuICB9XG4gIHJldHVybiBmZW52XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBub3RpZnlTcGF3bkZhaWwoYXJnczogeyBkaXI6IHN0cmluZywgZXJyOiBhbnksIG9wdHM6IGFueSwgdmVyczogYW55LCBjYXBzOiBhbnkgfSkge1xuICBjb25zdCBvcHRzY2xvbmUgPSBKU09OLnBhcnNlKEpTT04uc3RyaW5naWZ5KGFyZ3Mub3B0cykpXG4gIG9wdHNjbG9uZS5lbnYgPSBmaWx0ZXJFbnYob3B0c2Nsb25lLmVudilcbiAgYXJncy5vcHRzID0gb3B0c2Nsb25lXG4gIGF0b20ubm90aWZpY2F0aW9ucy5hZGRGYXRhbEVycm9yKFxuICAgIGBIYXNrZWxsLWdoYy1tb2Q6IGdoYy1tb2QgZmFpbGVkIHRvIGxhdW5jaC5cbkl0IGlzIHByb2JhYmx5IG1pc3Npbmcgb3IgbWlzY29uZmlndXJlZC4gJHthcmdzLmVyci5jb2RlfWAsXG4gICAge1xuICAgICAgZGV0YWlsOiBgXFxcbkVycm9yIHdhczogJHthcmdzLmVyci5uYW1lfVxuJHthcmdzLmVyci5tZXNzYWdlfVxuRGVidWcgaW5mb3JtYXRpb246XG4ke0pTT04uc3RyaW5naWZ5KGFyZ3MsIHVuZGVmaW5lZCwgMil9XG5Db25maWc6XG4ke0pTT04uc3RyaW5naWZ5KGF0b20uY29uZmlnLmdldCgnaGFza2VsbC1naGMtbW9kJyksdW5kZWZpbmVkLDIpfVxuRW52aXJvbm1lbnQgKGZpbHRlcmVkKTpcbiR7SlNPTi5zdHJpbmdpZnkoZmlsdGVyRW52KHByb2Nlc3MuZW52KSwgdW5kZWZpbmVkLCAyKX1cbmAsXG4gICAgICBzdGFjazogYXJncy5lcnIuc3RhY2ssXG4gICAgICBkaXNtaXNzYWJsZTogdHJ1ZSxcbiAgICB9LFxuICApXG59XG5cbmV4cG9ydCBmdW5jdGlvbiBoYW5kbGVFeGNlcHRpb248VD4oXG4gIHRhcmdldDogeyB1cGk6IFVQSS5JVVBJSW5zdGFuY2UgfCBQcm9taXNlPFVQSS5JVVBJSW5zdGFuY2U+IH0sIGtleTogc3RyaW5nLFxuICBkZXNjOiBUeXBlZFByb3BlcnR5RGVzY3JpcHRvcjwoLi4uYXJnczogYW55W10pID0+IFByb21pc2U8VD4+LFxuKTogVHlwZWRQcm9wZXJ0eURlc2NyaXB0b3I8KC4uLmFyZ3M6IGFueVtdKSA9PiBQcm9taXNlPFQ+PiB7XG4gIHJldHVybiB7XG4gICAgLi4uZGVzYyxcbiAgICBhc3luYyB2YWx1ZSguLi5hcmdzOiBhbnlbXSkge1xuICAgICAgdHJ5IHtcbiAgICAgICAgLy8gdHNsaW50OmRpc2FibGUtbmV4dC1saW5lOiBuby1ub24tbnVsbC1hc3NlcnRpb25cbiAgICAgICAgcmV0dXJuIGF3YWl0IGRlc2MudmFsdWUhLmNhbGwodGhpcywgLi4uYXJncylcbiAgICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgICAgLy8gdHNsaW50OmRpc2FibGUtbmV4dC1saW5lOiBuby1jb25zb2xlXG4gICAgICAgIGRlYnVnKGUpXG4gICAgICAgIGNvbnN0IHVwaTogVVBJLklVUElJbnN0YW5jZSA9IGF3YWl0ICh0aGlzIGFzIGFueSkudXBpXG4gICAgICAgIHVwaS5zZXRTdGF0dXMoe1xuICAgICAgICAgIHN0YXR1czogJ3dhcm5pbmcnLFxuICAgICAgICAgIGRldGFpbDogZS50b1N0cmluZygpLFxuICAgICAgICB9KVxuICAgICAgICAvLyBUT0RPOiByZXR1cm5pbmcgYSBwcm9taXNlIHRoYXQgbmV2ZXIgcmVzb2x2ZXMuLi4gdWdseSwgYnV0IHdvcmtzP1xuICAgICAgICByZXR1cm4gbmV3IFByb21pc2UoKCkgPT4geyAvKiBub29wICovIH0pXG4gICAgICB9XG4gICAgfSxcbiAgfVxufVxuIl19