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
        messages
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
                timeout: atom.config.get('haskell-ghc-mod.initTimeout') * 1000
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
                    const c = a[i];
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
        const sbd = false;
        const cabalSandbox = atom.config.get('haskell-ghc-mod.cabalSandbox') ? getCabalSandbox(rootPath) : Promise.resolve();
        const stackSandbox = atom.config.get('haskell-ghc-mod.stackSandbox') ? getStackSandbox(rootPath, apd, Object.assign({}, env)) : Promise.resolve();
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
            maxBuffer: Infinity
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
            range: crange
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
                    const m = line.match(/^\s*([\w-]+):\s*(.*)\s*$/);
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
            dismissable: true
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

You can suppress this warning in haskell-ghc-mod settings.`
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
        dismissable: true
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
                        detail: e.toString()
                    });
                    return new Promise(() => { });
                }
            });
        } });
}
exports.handleException = handleException;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidXRpbC5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uL3NyYy91dGlsLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7Ozs7Ozs7Ozs7QUFBQSwrQkFBOEM7QUFDOUMsK0JBQThDO0FBQzlDLDZCQUE0QjtBQUM1Qix5QkFBd0I7QUFDeEIsb0NBQW1DO0FBQ25DLDJCQUF3QjtBQUN4QiwyREFBOEU7QUFJdEUsNkJBSkEsdUNBQWtCLENBSUE7QUFBRSxxQkFKQSwrQkFBVSxDQUlBO0FBQUUsc0JBSkEsZ0NBQVcsQ0FJQTtBQUVuRCxJQUFJLFFBQVEsR0FBbUQsRUFBRSxDQUFBO0FBQ2pFLE1BQU0sT0FBTyxHQUFHLEtBQUssQ0FBQTtBQUVyQixpQkFBa0IsR0FBRyxRQUFrQjtJQUNyQyxNQUFNLEVBQUUsR0FBRyxJQUFJLENBQUMsR0FBRyxFQUFFLENBQUE7SUFDckIsUUFBUSxDQUFDLElBQUksQ0FBQztRQUNaLFNBQVMsRUFBRSxFQUFFO1FBQ2IsUUFBUTtLQUNULENBQUMsQ0FBQTtJQUNGLFFBQVEsR0FBRyxRQUFRLENBQUMsTUFBTSxDQUFDLENBQUMsRUFBQyxTQUFTLEVBQUMsS0FBSyxDQUFDLEVBQUUsR0FBRyxTQUFTLENBQUMsR0FBRyxPQUFPLENBQUMsQ0FBQTtBQUN6RSxDQUFDO0FBRUQsa0JBQW1CLEVBQVk7SUFDN0IsTUFBTSxHQUFHLEdBQUcsSUFBSSxHQUFHLENBQUMsRUFBRSxDQUFDLENBQUE7SUFDdkIsTUFBTSxDQUFDLEtBQUssQ0FBQyxJQUFJLENBQUMsR0FBRyxDQUFDLENBQUMsSUFBSSxDQUFDLGdCQUFTLENBQUMsQ0FBQTtBQUN4QyxDQUFDO0FBRVksUUFBQSxHQUFHLEdBQUcsR0FBRyxRQUFHLE9BQU8sUUFBRyxFQUFFLENBQUE7QUFFckMsZUFBdUIsR0FBRyxRQUFlO0lBQ3ZDLEVBQUUsQ0FBQyxDQUFDLElBQUksQ0FBQyxNQUFNLENBQUMsR0FBRyxDQUFDLHVCQUF1QixDQUFDLENBQUMsQ0FBQyxDQUFDO1FBRTdDLE9BQU8sQ0FBQyxHQUFHLENBQUMsd0JBQXdCLEVBQUUsR0FBRyxRQUFRLENBQUMsQ0FBQTtJQUNwRCxDQUFDO0lBQ0QsT0FBTyxDQUFDLEdBQUcsUUFBUSxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUMsS0FBSyxJQUFJLENBQUMsU0FBUyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQTtBQUNwRCxDQUFDO0FBTkQsc0JBTUM7QUFFRCxjQUFzQixHQUFHLFFBQWU7SUFFdEMsT0FBTyxDQUFDLElBQUksQ0FBQywwQkFBMEIsRUFBRSxHQUFHLFFBQVEsQ0FBQyxDQUFBO0lBQ3JELE9BQU8sQ0FBQyxHQUFHLFFBQVEsQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDLEtBQUssSUFBSSxDQUFDLFNBQVMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUE7QUFDcEQsQ0FBQztBQUpELG9CQUlDO0FBRUQsZUFBdUIsR0FBRyxRQUFlO0lBRXZDLE9BQU8sQ0FBQyxLQUFLLENBQUMsd0JBQXdCLEVBQUUsR0FBRyxRQUFRLENBQUMsQ0FBQTtJQUNwRCxPQUFPLENBQUMsR0FBRyxRQUFRLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQyxLQUFLLElBQUksQ0FBQyxTQUFTLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFBO0FBQ3BELENBQUM7QUFKRCxzQkFJQztBQUVEO0lBQ0UsTUFBTSxFQUFFLEdBQUcsSUFBSSxDQUFDLEdBQUcsRUFBRSxDQUFBO0lBQ3JCLFFBQVEsR0FBRyxRQUFRLENBQUMsTUFBTSxDQUFDLENBQUMsRUFBQyxTQUFTLEVBQUMsS0FBSyxDQUFDLEVBQUUsR0FBRyxTQUFTLENBQUMsR0FBRyxPQUFPLENBQUMsQ0FBQTtJQUN2RSxNQUFNLENBQUMsUUFBUSxDQUFDLEdBQUcsQ0FBQyxDQUFDLEVBQUMsU0FBUyxFQUFFLFFBQVEsRUFBQyxLQUFLLEdBQUcsQ0FBQyxTQUFTLEdBQUcsRUFBRSxDQUFDLEdBQUcsSUFBSSxNQUFNLFFBQVEsQ0FBQyxJQUFJLENBQUMsR0FBRyxDQUFDLEVBQUUsQ0FBQyxDQUFDLElBQUksQ0FBQyxRQUFHLENBQUMsQ0FBQTtBQUNoSCxDQUFDO0FBSkQsa0NBSUM7QUFFRCxxQkFBbUMsR0FBVyxFQUFFLElBQWMsRUFBRSxJQUFjLEVBQUUsS0FBYzs7UUFDNUYsTUFBTSxDQUFDLElBQUksT0FBTyxDQUFtQyxDQUFDLE9BQU8sRUFBRSxNQUFNO1lBQ25FLEtBQUssQ0FBQyxXQUFXLEdBQUcsSUFBSSxJQUFJLGVBQWUsRUFBRSxJQUFJLENBQUMsQ0FBQTtZQUNsRCxNQUFNLEtBQUssR0FBRyxFQUFFLENBQUMsUUFBUSxDQUFDLEdBQUcsRUFBRSxJQUFJLEVBQUUsSUFBSSxFQUFFLENBQUMsS0FBSyxFQUFFLE1BQWMsRUFBRSxNQUFjO2dCQUMvRSxFQUFFLENBQUMsQ0FBQyxNQUFNLENBQUMsSUFBSSxFQUFFLENBQUMsTUFBTSxHQUFHLENBQUMsQ0FBQyxDQUFDLENBQUM7b0JBQUMsSUFBSSxDQUFDLE1BQU0sQ0FBQyxDQUFBO2dCQUFDLENBQUM7Z0JBQzlDLEVBQUUsQ0FBQyxDQUFDLEtBQUssQ0FBQyxDQUFDLENBQUM7b0JBQ1YsSUFBSSxDQUFDLFdBQVcsR0FBRyxJQUFJLElBQUksZUFBZSxFQUFFLEtBQUssQ0FBQyxDQUFBO29CQUNsRCxFQUFFLENBQUMsQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDO3dCQUFDLElBQUksQ0FBQyxNQUFNLENBQUMsQ0FBQTtvQkFBQyxDQUFDO29CQUM1QixLQUFLLENBQUMsS0FBSyxHQUFHLENBQUMsSUFBSSxLQUFLLEVBQUUsQ0FBQyxDQUFDLEtBQUssQ0FBQTtvQkFDakMsTUFBTSxDQUFDLEtBQUssQ0FBQyxDQUFBO2dCQUNmLENBQUM7Z0JBQUMsSUFBSSxDQUFDLENBQUM7b0JBQ04sS0FBSyxDQUFDLHFCQUFxQixHQUFHLElBQUksSUFBSSxFQUFFLEVBQUUsRUFBQyxNQUFNLEVBQUUsTUFBTSxFQUFDLENBQUMsQ0FBQTtvQkFDM0QsT0FBTyxDQUFDLEVBQUMsTUFBTSxFQUFFLE1BQU0sRUFBQyxDQUFDLENBQUE7Z0JBQzNCLENBQUM7WUFDSCxDQUFDLENBQUMsQ0FBQTtZQUNGLEVBQUUsQ0FBQyxDQUFDLEtBQUssQ0FBQyxDQUFDLENBQUM7Z0JBQ1YsS0FBSyxDQUFDLHlCQUF5QixHQUFHLElBQUksSUFBSSxFQUFFLENBQUMsQ0FBQTtnQkFDN0MsS0FBSyxDQUFDLEtBQUssQ0FBQyxLQUFLLENBQUMsS0FBSyxDQUFDLENBQUE7WUFDMUIsQ0FBQztRQUNILENBQUMsQ0FBQyxDQUFBO0lBQ0osQ0FBQztDQUFBO0FBcEJELGtDQW9CQztBQUVELHlCQUF1QyxRQUFnQjs7UUFDckQsS0FBSyxDQUFDLDhCQUE4QixDQUFDLENBQUE7UUFDckMsTUFBTSxHQUFHLEdBQUcsTUFBTSxrQkFBa0IsQ0FBQyxHQUFHLFFBQVEsR0FBRyxVQUFHLHNCQUFzQixDQUFDLENBQUE7UUFFN0UsRUFBRSxDQUFDLENBQUMsR0FBRyxJQUFJLEdBQUcsQ0FBQyxjQUFjLENBQUMsSUFBSSxHQUFHLENBQUMsY0FBYyxDQUFDLENBQUMsUUFBUSxDQUFDLENBQUMsQ0FBQyxDQUFDO1lBQ2hFLE1BQU0sT0FBTyxHQUFHLEdBQUcsQ0FBQyxjQUFjLENBQUMsQ0FBQyxRQUFRLENBQUMsQ0FBQTtZQUM3QyxLQUFLLENBQUMsdUJBQXVCLEVBQUUsT0FBTyxDQUFDLENBQUE7WUFDdkMsRUFBRSxDQUFDLENBQUMsZ0NBQVcsQ0FBQyxPQUFPLENBQUMsQ0FBQyxDQUFDLENBQUM7Z0JBQ3pCLE1BQU0sQ0FBQyxPQUFPLENBQUE7WUFDaEIsQ0FBQztZQUFDLElBQUksQ0FBQyxDQUFDO2dCQUNOLElBQUksQ0FBQyxnQkFBZ0IsRUFBRSxPQUFPLEVBQUUscUJBQXFCLENBQUMsQ0FBQTtZQUN4RCxDQUFDO1FBQ0gsQ0FBQztRQUFDLElBQUksQ0FBQyxDQUFDO1lBQ04sSUFBSSxDQUFDLHdCQUF3QixDQUFDLENBQUE7UUFDaEMsQ0FBQztJQUVILENBQUM7Q0FBQTtBQWhCRCwwQ0FnQkM7QUFFRCx5QkFBdUMsUUFBZ0IsRUFBRyxHQUFhLEVBQUUsR0FBd0M7O1FBQy9HLEtBQUssQ0FBQyw4QkFBOEIsQ0FBQyxDQUFBO1FBQ3JDLEdBQUcsQ0FBQyxJQUFJLEdBQUcsUUFBUSxDQUFDLEdBQUcsQ0FBQyxDQUFBO1FBQ3hCLEtBQUssQ0FBQywwQkFBMEIsRUFBRSxHQUFHLENBQUMsSUFBSSxDQUFDLENBQUE7UUFDM0MsSUFBSSxDQUFDO1lBQ0gsTUFBTSxHQUFHLEdBQUcsTUFBTSxXQUFXLENBQUMsT0FBTyxFQUFFLENBQUMsTUFBTSxFQUFFLHlCQUF5QixFQUFFLHNCQUFzQixFQUFFLFlBQVksQ0FBQyxFQUFFO2dCQUNoSCxRQUFRLEVBQUUsTUFBTTtnQkFDaEIsR0FBRyxFQUFFLFFBQVE7Z0JBQ2IsR0FBRztnQkFDSCxPQUFPLEVBQUUsSUFBSSxDQUFDLE1BQU0sQ0FBQyxHQUFHLENBQUMsNkJBQTZCLENBQUMsR0FBRyxJQUFJO2FBQy9ELENBQUMsQ0FBQTtZQUVGLE1BQU0sS0FBSyxHQUFHLEdBQUcsQ0FBQyxNQUFNLENBQUMsS0FBSyxDQUFDLFFBQUcsQ0FBQyxDQUFBO1lBQ25DLE1BQU0sR0FBRyxHQUFHLEtBQUssQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDLEtBQUssQ0FBQyxDQUFDLFVBQVUsQ0FBQyx5QkFBeUIsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsS0FBSyxDQUFDLEVBQUUsQ0FBQyxHQUFHLEdBQUcsVUFBRyxLQUFLLENBQUE7WUFDbkcsTUFBTSxHQUFHLEdBQUcsS0FBSyxDQUFDLE1BQU0sQ0FBQyxDQUFDLENBQUMsS0FBSyxDQUFDLENBQUMsVUFBVSxDQUFDLHNCQUFzQixDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxLQUFLLENBQUMsRUFBRSxDQUFDLEdBQUcsR0FBRyxVQUFHLEtBQUssQ0FBQTtZQUNoRyxNQUFNLEVBQUUsR0FDTixLQUFLLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQyxLQUNiLENBQUMsQ0FBQyxVQUFVLENBQUMsWUFBWSxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxLQUFLLENBQUMsRUFBRSxDQUFDLENBQUMsS0FBSyxDQUFDLGdCQUFTLENBQUMsQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDLEtBQ2pFLENBQUMsQ0FBQyxDQUFDLENBQUMsS0FBSyxHQUFHLENBQUMsSUFBSSxDQUFDLENBQUMsS0FBSyxHQUFHLENBQUMsSUFBSSxDQUFDLEdBQUcsQ0FBQyxRQUFRLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUE7WUFDekQsS0FBSyxDQUFDLHNCQUFzQixFQUFFLEdBQUcsRUFBRSxHQUFHLEVBQUUsR0FBRyxFQUFFLENBQUMsQ0FBQTtZQUM5QyxNQUFNLENBQUMsQ0FBQyxHQUFHLEVBQUUsR0FBRyxFQUFFLEdBQUcsRUFBRSxDQUFDLENBQUE7UUFDMUIsQ0FBQztRQUFDLEtBQUssQ0FBQyxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUM7WUFDYixJQUFJLENBQUMsaUNBQWlDLEVBQUUsR0FBRyxDQUFDLENBQUE7UUFDOUMsQ0FBQztJQUNILENBQUM7Q0FBQTtBQXhCRCwwQ0F3QkM7QUFFRCxNQUFNLG1CQUFtQixHQUFHLElBQUksR0FBRyxFQUFzQixDQUFBO0FBRXpELDJCQUF5QyxRQUFpQjs7UUFDeEQsRUFBRSxDQUFDLENBQUMsQ0FBRSxRQUFRLENBQUMsQ0FBQyxDQUFDO1lBRWYsUUFBUSxHQUFHLHVDQUFrQixDQUFDLElBQUksQ0FBQyxDQUFDLE9BQU8sRUFBRSxDQUFBO1FBQy9DLENBQUM7UUFFRCxNQUFNLE1BQU0sR0FBRyxtQkFBbUIsQ0FBQyxHQUFHLENBQUMsUUFBUSxDQUFDLENBQUE7UUFDaEQsRUFBRSxDQUFDLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQztZQUNYLE1BQU0sQ0FBQyxNQUFNLENBQUE7UUFDZixDQUFDO1FBRUQsS0FBSyxDQUFDLHFCQUFxQixRQUFRLEdBQUcsQ0FBQyxDQUFBO1FBQ3ZDLE1BQU0sR0FBRyxxQkFBTyxPQUFPLENBQUMsR0FBRyxDQUFDLENBQUE7UUFFNUIsRUFBRSxDQUFDLENBQUMsT0FBTyxDQUFDLFFBQVEsS0FBSyxPQUFPLENBQUMsQ0FBQyxDQUFDO1lBQ2pDLE1BQU0sSUFBSSxHQUFHLEVBQUUsQ0FBQTtZQUNmLE1BQU0sT0FBTyxHQUFHLENBQUMsR0FBVyxFQUFFLElBQVk7Z0JBQ3hDLE1BQU0sQ0FBQyxHQUFHLEdBQUcsQ0FBQyxLQUFLLENBQUMsRUFBRSxDQUFDLENBQUE7Z0JBQ3ZCLEdBQUcsQ0FBQyxDQUFDLElBQUksQ0FBQyxHQUFHLENBQUMsRUFBRSxDQUFDLEdBQUcsQ0FBQyxDQUFDLE1BQU0sRUFBRSxDQUFDLEVBQUUsRUFBRSxDQUFDO29CQUNsQyxNQUFNLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUE7b0JBRWQsRUFBRSxDQUFDLENBQUMsSUFBSSxHQUFHLElBQUksQ0FBQyxHQUFHLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQzt3QkFDMUIsQ0FBQyxDQUFDLENBQUMsQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxXQUFXLEVBQUUsQ0FBQTtvQkFDM0IsQ0FBQztnQkFDSCxDQUFDO2dCQUNELE1BQU0sQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDLEVBQUUsQ0FBQyxDQUFBO1lBQ25CLENBQUMsQ0FBQTtZQUNELEdBQUcsQ0FBQyxDQUFDLElBQUksQ0FBQyxHQUFHLE1BQU0sRUFBRSxDQUFDLElBQUksQ0FBQyxFQUFFLENBQUMsRUFBRSxFQUFFLENBQUM7Z0JBQ2pDLE1BQU0sRUFBRSxHQUFHLE9BQU8sQ0FBQyxNQUFNLEVBQUUsQ0FBQyxDQUFDLENBQUE7Z0JBQzdCLEVBQUUsQ0FBQyxDQUFDLEdBQUcsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDLENBQUM7b0JBQ1osSUFBSSxDQUFDLElBQUksQ0FBQyxHQUFHLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQTtnQkFDcEIsQ0FBQztZQUNILENBQUM7WUFDRCxHQUFHLENBQUMsSUFBSSxHQUFHLElBQUksQ0FBQyxJQUFJLENBQUMsZ0JBQVMsQ0FBQyxDQUFBO1FBQ2pDLENBQUM7UUFFRCxNQUFNLElBQUksR0FBRyxHQUFHLENBQUMsSUFBSSxJQUFJLEVBQUUsQ0FBQTtRQUUzQixNQUFNLEdBQUcsR0FBRyxJQUFJLENBQUMsTUFBTSxDQUFDLEdBQUcsQ0FBQywyQ0FBMkMsQ0FBQyxDQUFDLE1BQU0sQ0FBQyxJQUFJLENBQUMsS0FBSyxDQUFDLGdCQUFTLENBQUMsQ0FBQyxDQUFBO1FBQ3RHLE1BQU0sR0FBRyxHQUFHLEtBQUssQ0FBQTtRQUNqQixNQUFNLFlBQVksR0FDaEIsSUFBSSxDQUFDLE1BQU0sQ0FBQyxHQUFHLENBQUMsOEJBQThCLENBQUMsR0FBRyxlQUFlLENBQUMsUUFBUSxDQUFDLEdBQUcsT0FBTyxDQUFDLE9BQU8sRUFBRSxDQUFBO1FBQ2pHLE1BQU0sWUFBWSxHQUNoQixJQUFJLENBQUMsTUFBTSxDQUFDLEdBQUcsQ0FBQyw4QkFBOEIsQ0FBQyxHQUFHLGVBQWUsQ0FBQyxRQUFRLEVBQUUsR0FBRyxvQkFBTSxHQUFHLEVBQUUsR0FBRyxPQUFPLENBQUMsT0FBTyxFQUFFLENBQUE7UUFDaEgsTUFBTSxDQUFDLGVBQWUsRUFBRSxnQkFBZ0IsQ0FBQyxHQUFHLE1BQU0sT0FBTyxDQUFDLEdBQUcsQ0FBQyxDQUFDLFlBQVksRUFBRSxZQUFZLENBQUMsQ0FBQyxDQUFBO1FBQzNGLE1BQU0sSUFBSSxHQUFHLEVBQUUsQ0FBQTtRQUNmLEVBQUUsQ0FBQyxDQUFDLGVBQWUsQ0FBQyxDQUFDLENBQUM7WUFDcEIsSUFBSSxDQUFDLElBQUksQ0FBQyxlQUFlLENBQUMsQ0FBQTtRQUM1QixDQUFDO1FBQ0QsRUFBRSxDQUFDLENBQUMsZ0JBQWdCLENBQUMsQ0FBQyxDQUFDO1lBQ3JCLElBQUksQ0FBQyxJQUFJLENBQUMsR0FBRyxnQkFBZ0IsQ0FBQyxDQUFBO1FBQ2hDLENBQUM7UUFDRCxJQUFJLENBQUMsSUFBSSxDQUFDLEdBQUcsR0FBRyxDQUFDLENBQUE7UUFDakIsR0FBRyxDQUFDLElBQUksR0FBRyxRQUFRLENBQUMsSUFBSSxDQUFDLENBQUE7UUFDekIsS0FBSyxDQUFDLFVBQVUsR0FBRyxDQUFDLElBQUksRUFBRSxDQUFDLENBQUE7UUFDM0IsTUFBTSxHQUFHLEdBQWU7WUFDdEIsR0FBRyxFQUFFLFFBQVE7WUFDYixHQUFHO1lBQ0gsUUFBUSxFQUFFLE1BQU07WUFDaEIsU0FBUyxFQUFFLFFBQVE7U0FDcEIsQ0FBQTtRQUNELG1CQUFtQixDQUFDLEdBQUcsQ0FBQyxRQUFRLEVBQUUsR0FBRyxDQUFDLENBQUE7UUFDdEMsTUFBTSxDQUFDLEdBQUcsQ0FBQTtJQUNaLENBQUM7Q0FBQTtBQS9ERCw4Q0ErREM7QUFFRCwwQkFDRSxNQUE0QixFQUFFLEtBQXNCO0lBRXBELE1BQU0sQ0FBQyxLQUFLLENBQUMsR0FBRyxNQUFNLENBQUMsZ0NBQWdDLENBQUMsS0FBSyxDQUFDLENBQUMsY0FBYyxFQUFFLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUE7SUFDekYsRUFBRSxDQUFDLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQztRQUNWLE1BQU0sS0FBSyxHQUFHLE1BQU0sQ0FBQyw2QkFBNkIsQ0FBQyxLQUFLLEVBQUUsS0FBSyxDQUFDLENBQUE7UUFDaEUsRUFBRSxDQUFDLENBQUMsS0FBSyxJQUFJLENBQUMsS0FBSyxDQUFDLE9BQU8sRUFBRSxDQUFDLENBQUMsQ0FBQztZQUM5QixNQUFNLE1BQU0sR0FBRyxNQUFNLENBQUMsb0JBQW9CLENBQUMsS0FBSyxDQUFDLENBQUE7WUFDakQsTUFBTSxDQUFDLEVBQUMsS0FBSyxFQUFFLEtBQUssRUFBRSxNQUFNLEVBQUMsQ0FBQTtRQUMvQixDQUFDO0lBQ0gsQ0FBQztBQUNILENBQUM7QUFYRCw0Q0FXQztBQUVELDBCQUFrQyxNQUE0QixFQUFFLE1BQXVCO0lBQ3JGLE1BQU0sTUFBTSxHQUFHLE1BQU0sQ0FBQyxTQUFTLEVBQUUsQ0FBQTtJQUNqQyxFQUFFLENBQUMsQ0FBQyxNQUFNLENBQUMsT0FBTyxFQUFFLENBQUMsQ0FBQyxDQUFDO1FBQ3JCLE1BQU0sQ0FBQyxnQkFBZ0IsQ0FBQyxNQUFNLEVBQUUsTUFBTSxDQUFDLEtBQUssQ0FBQyxDQUFBO0lBQy9DLENBQUM7SUFBQyxJQUFJLENBQUMsQ0FBQztRQUNOLE1BQU0sQ0FBQztZQUNMLE1BQU0sRUFBRSxNQUFNLENBQUMsY0FBYyxDQUFDLE1BQU0sQ0FBQztZQUNyQyxLQUFLLEVBQUUsTUFBTTtTQUNkLENBQUE7SUFDSCxDQUFDO0FBQ0gsQ0FBQztBQVZELDRDQVVDO0FBRUQsc0JBQXVDLFFBQWdCLEVBQUUsR0FBVyxFQUFFLEdBQWlDOztRQUNyRyxNQUFNLElBQUksR0FBRyxNQUFNLElBQUksT0FBTyxDQUM1QixDQUFDLE9BQU8sRUFBRSxNQUFNLEtBQ2hCLElBQUksQ0FBQyxJQUFJLENBQ1AsRUFBQyxNQUFNLEVBQUUsaUJBQWlCLEVBQUUsTUFBTSxFQUFFLGNBQU8sQ0FBQyxHQUFHLElBQUksS0FBSyxDQUFDLEVBQUMsRUFDMUQsQ0FBQyxHQUFHLEVBQUUsS0FBSztZQUNULEVBQUUsQ0FBQyxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUM7Z0JBQ1IsTUFBTSxDQUFDLEdBQUcsQ0FBQyxDQUFBO1lBQ2IsQ0FBQztZQUFDLElBQUksQ0FBQyxDQUFDO2dCQUNOLE9BQU8sQ0FBQyxLQUFLLENBQUMsQ0FBQTtZQUNoQixDQUFDO1FBQ0wsQ0FBQyxDQUFDLENBQUMsQ0FBQTtRQUNMLE1BQU0sQ0FBQyxJQUFJLE9BQU8sQ0FBSSxDQUFDLE9BQU8sRUFBRSxNQUFNLEtBQ3BDLEVBQUUsQ0FBQyxLQUFLLENBQUMsSUFBSSxDQUFDLEVBQUUsRUFBRSxRQUFRLEVBQUUsQ0FBTyxHQUFHO1lBQ3BDLEVBQUUsQ0FBQyxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUM7Z0JBQ1IsTUFBTSxDQUFDLEdBQUcsQ0FBQyxDQUFBO1lBQ2IsQ0FBQztZQUFDLElBQUksQ0FBQyxDQUFDO2dCQUNOLE9BQU8sQ0FBQyxNQUFNLEdBQUcsQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQTtnQkFDN0IsRUFBRSxDQUFDLEtBQUssQ0FBQyxJQUFJLENBQUMsRUFBRSxFQUFFLE1BQU0sRUFBRSxDQUFDLE1BQU0sQ0FBQyxJQUFJLENBQUMsSUFBSSxFQUFFLFFBQWlCLENBQUMsQ0FBQyxDQUFDLENBQUE7WUFDbkUsQ0FBQztRQUNILENBQUMsQ0FBQSxDQUFDLENBQUMsQ0FBQTtJQUNQLENBQUM7Q0FBQTtBQXJCRCxvQ0FxQkM7QUFPRCxpQkFBeUIsSUFBb0IsRUFBRSxPQUFlO0lBQzVELE1BQU0sR0FBRyxHQUFHLElBQUksS0FBSyxDQUFDLE9BQU8sQ0FBQyxDQUFBO0lBQzlCLEdBQUcsQ0FBQyxJQUFJLEdBQUcsSUFBSSxDQUFBO0lBQ2YsTUFBTSxDQUFDLEdBQUcsQ0FBQTtBQUNaLENBQUM7QUFKRCwwQkFJQztBQUlELDRCQUEwQyxJQUFZOztRQUNwRCxJQUFJLENBQUM7WUFDSCxNQUFNLEdBQUcsR0FBRyxNQUFNLElBQUksT0FBTyxDQUFTLENBQUMsT0FBTyxFQUFFLE1BQU0sS0FDcEQsRUFBRSxDQUFDLFFBQVEsQ0FBQyxJQUFJLEVBQUUsRUFBQyxRQUFRLEVBQUUsT0FBTyxFQUFDLEVBQUUsQ0FBQyxHQUFHLEVBQUUsSUFBSTtnQkFDL0MsRUFBRSxDQUFDLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQztvQkFDUixNQUFNLENBQUMsR0FBRyxDQUFDLENBQUE7Z0JBQ2IsQ0FBQztnQkFBQyxJQUFJLENBQUMsQ0FBQztvQkFDTixPQUFPLENBQUMsSUFBSSxDQUFDLENBQUE7Z0JBQ2YsQ0FBQztZQUNILENBQUMsQ0FBQyxDQUFDLENBQUE7WUFDTCxNQUFNLElBQUksR0FBc0IsRUFBRSxDQUFBO1lBQ2xDLElBQUksS0FBSyxHQUFHLElBQUksQ0FBQTtZQUNoQixNQUFNLEVBQUUsR0FBRyxDQUFDLENBQVM7Z0JBQ25CLEdBQUcsQ0FBQyxDQUFDLE1BQU0sRUFBRSxJQUFJLE1BQU0sQ0FBQyxJQUFJLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQyxDQUFDO29CQUNwQyxNQUFNLEVBQUUsR0FBRyxLQUFLLENBQUMsRUFBRSxDQUFDLENBQUE7b0JBQ3BCLEVBQUUsQ0FBQyxDQUFDLE9BQU8sRUFBRSxLQUFLLFFBQVEsQ0FBQyxDQUFDLENBQUM7d0JBQzNCLENBQUMsR0FBRyxDQUFDLENBQUMsS0FBSyxDQUFDLElBQUksRUFBRSxFQUFFLENBQUMsQ0FBQyxJQUFJLENBQUMsRUFBRSxDQUFDLENBQUE7b0JBQ2hDLENBQUM7Z0JBQ0gsQ0FBQztnQkFDRCxNQUFNLENBQUMsQ0FBQyxDQUFBO1lBQ1YsQ0FBQyxDQUFBO1lBQ0QsR0FBRyxDQUFDLENBQUMsTUFBTSxJQUFJLElBQUksR0FBRyxDQUFDLEtBQUssQ0FBQyxVQUFVLENBQUMsQ0FBQyxDQUFDLENBQUM7Z0JBQ3pDLEVBQUUsQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDLEtBQUssQ0FBQyxRQUFRLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxLQUFLLENBQUMsT0FBTyxDQUFDLENBQUMsQ0FBQyxDQUFDO29CQUNsRCxNQUFNLENBQUMsQ0FBQyxDQUFDLEdBQUcsSUFBSSxDQUFDLEtBQUssQ0FBQyxJQUFJLENBQUMsQ0FBQTtvQkFDNUIsTUFBTSxDQUFDLEdBQUcsSUFBSSxDQUFDLEtBQUssQ0FBQywwQkFBMEIsQ0FBQyxDQUFBO29CQUNoRCxFQUFFLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDO3dCQUNOLE1BQU0sQ0FBQyxDQUFDLEVBQUUsSUFBSSxFQUFFLEdBQUcsQ0FBQyxHQUFHLENBQUMsQ0FBQTt3QkFDeEIsS0FBSyxDQUFDLElBQUksQ0FBQyxHQUFHLEVBQUUsQ0FBQyxHQUFHLENBQUMsQ0FBQTtvQkFDdkIsQ0FBQztvQkFBQyxJQUFJLENBQUMsQ0FBQzt3QkFDTixNQUFNLFFBQVEsR0FBRyxFQUFFLENBQUE7d0JBQ25CLEtBQUssQ0FBQyxJQUFJLENBQUMsR0FBRyxRQUFRLENBQUE7d0JBQ3RCLEtBQUssR0FBRyxRQUFRLENBQUE7b0JBQ2xCLENBQUM7Z0JBQ0gsQ0FBQztZQUNILENBQUM7WUFDRCxNQUFNLENBQUMsSUFBSSxDQUFBO1FBQ2IsQ0FBQztRQUFDLEtBQUssQ0FBQyxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUM7WUFDYixJQUFJLENBQUMsMkNBQTJDLEVBQUUsR0FBRyxDQUFDLENBQUE7UUFDeEQsQ0FBQztJQUNILENBQUM7Q0FBQTtBQXZDRCxnREF1Q0M7QUFHRCwwQkFBa0MsTUFBNEIsRUFBRSxLQUFzQjtJQUNwRixNQUFNLElBQUksR0FBRyxNQUFNLENBQUMsVUFBVSxDQUFDLEtBQUssQ0FBQyxHQUFHLENBQUMsQ0FBQTtJQUN6QyxNQUFNLEtBQUssR0FBRyxJQUFJLEdBQUcsQ0FBQyxJQUFJLENBQUMsS0FBSyxDQUFDLENBQUMsRUFBRSxLQUFLLENBQUMsTUFBTSxDQUFDLENBQUMsS0FBSyxDQUFDLEtBQUssQ0FBQyxJQUFJLEVBQUUsQ0FBQyxHQUFHLEVBQUUsQ0FBQTtJQUMxRSxNQUFNLFdBQVcsR0FBRyxDQUFDLEdBQUcsS0FBSyxDQUFDLE1BQU0sQ0FBQTtJQUNwQyxNQUFNLENBQUMsSUFBSSxZQUFLLENBQUMsS0FBSyxDQUFDLEdBQUcsRUFBRSxLQUFLLENBQUMsTUFBTSxHQUFHLFdBQVcsQ0FBQyxDQUFBO0FBQ3pELENBQUM7QUFMRCw0Q0FLQztBQUVELDBCQUFrQyxNQUE0QixFQUFFLEtBQXNCO0lBQ3BGLE1BQU0sS0FBSyxHQUFHLGdCQUFnQixDQUFDLE1BQU0sRUFBRSxLQUFLLENBQUMsS0FBSyxDQUFDLENBQUE7SUFDbkQsTUFBTSxHQUFHLEdBQUcsZ0JBQWdCLENBQUMsTUFBTSxFQUFFLEtBQUssQ0FBQyxHQUFHLENBQUMsQ0FBQTtJQUMvQyxNQUFNLENBQUMsSUFBSSxZQUFLLENBQUMsS0FBSyxFQUFFLEdBQUcsQ0FBQyxDQUFBO0FBQzlCLENBQUM7QUFKRCw0Q0FJQztBQUVELDRCQUFvQyxNQUE0QixFQUFFLEtBQXNCO0lBQ3RGLE1BQU0sSUFBSSxHQUFHLE1BQU0sQ0FBQyxVQUFVLENBQUMsS0FBSyxDQUFDLEdBQUcsQ0FBQyxDQUFBO0lBQ3pDLElBQUksT0FBTyxHQUFHLENBQUMsQ0FBQTtJQUNmLElBQUksT0FBTyxHQUFHLEtBQUssQ0FBQyxNQUFNLENBQUE7SUFDMUIsT0FBTyxPQUFPLEdBQUcsT0FBTyxFQUFFLENBQUM7UUFFekIsRUFBRSxDQUFDLENBQUMsQ0FBQyxJQUFJLEtBQUssU0FBUyxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsT0FBTyxDQUFDLEtBQUssU0FBUyxDQUFDLENBQUMsQ0FBQyxDQUFDO1lBQUMsS0FBSyxDQUFBO1FBQUMsQ0FBQztRQUNwRSxFQUFFLENBQUMsQ0FBQyxJQUFJLENBQUMsT0FBTyxDQUFDLEtBQUssSUFBSSxDQUFDLENBQUMsQ0FBQztZQUMzQixPQUFPLElBQUksQ0FBQyxDQUFBO1FBQ2QsQ0FBQztRQUNELE9BQU8sSUFBSSxDQUFDLENBQUE7SUFDZCxDQUFDO0lBQ0QsTUFBTSxDQUFDLElBQUksWUFBSyxDQUFDLEtBQUssQ0FBQyxHQUFHLEVBQUUsT0FBTyxDQUFDLENBQUE7QUFDdEMsQ0FBQztBQWJELGdEQWFDO0FBRUQsNEJBQW9DLE1BQTRCLEVBQUUsS0FBc0I7SUFDdEYsTUFBTSxLQUFLLEdBQUcsa0JBQWtCLENBQUMsTUFBTSxFQUFFLEtBQUssQ0FBQyxLQUFLLENBQUMsQ0FBQTtJQUNyRCxNQUFNLEdBQUcsR0FBRyxrQkFBa0IsQ0FBQyxNQUFNLEVBQUUsS0FBSyxDQUFDLEdBQUcsQ0FBQyxDQUFBO0lBQ2pELE1BQU0sQ0FBQyxJQUFJLFlBQUssQ0FBQyxLQUFLLEVBQUUsR0FBRyxDQUFDLENBQUE7QUFDOUIsQ0FBQztBQUpELGdEQUlDO0FBRUQscUJBQTZCLEVBQVU7SUFDckMsTUFBTSxDQUFDLEVBQUUsQ0FBQyxXQUFXLEVBQUUsS0FBSyxFQUFFLENBQUE7QUFDaEMsQ0FBQztBQUZELGtDQUVDO0FBRUQsd0JBQWdDLEVBQUMsR0FBRyxFQUFFLE9BQU8sRUFBRSxJQUFJLEVBQXFCO0lBQ3RFLE1BQU0sQ0FBQztFQUNQLElBQUksQ0FBQyxTQUFTLENBQUMsSUFBSSxFQUFFLFNBQVMsRUFBRSxDQUFDLENBQUM7O0VBRWxDLElBQUksQ0FBQyxTQUFTLENBQUMsT0FBTyxFQUFFLFNBQVMsRUFBRSxDQUFDLENBQUM7O0VBRXJDLEdBQUcsQ0FBQyxPQUFPOztFQUVYLFdBQVcsRUFBRSxFQUFFLENBQUE7QUFDakIsQ0FBQztBQVRELHdDQVNDO0FBRUQscUJBQTZCLEVBQUMsR0FBRyxFQUFFLE9BQU8sRUFBRSxJQUFJLEVBQXFCO0lBQ25FLEVBQUUsQ0FBQyxDQUFDLEdBQUcsQ0FBQyxJQUFJLEtBQUssMEJBQTBCLElBQUksT0FBTyxDQUFDLENBQUMsQ0FBQztRQUNyRCxNQUFNLENBQUM7O0VBRVgsT0FBTyxDQUFDLFdBQVcsR0FBRyxjQUFjLEdBQUcsRUFBRSxXQUFXLE9BQU8sQ0FBQyxPQUFPOzs4Q0FFdkIsQ0FBQTtJQUM1QyxDQUFDO0lBQUMsSUFBSSxDQUFDLEVBQUUsQ0FBQyxDQUFDLE9BQU8sQ0FBQyxDQUFDLENBQUM7UUFDbkIsTUFBTSxDQUFDOztFQUVULE9BQU8sQ0FBQyxXQUFXLEdBQUcsY0FBYyxHQUFHLEVBQUUsV0FBVyxPQUFPLENBQUMsT0FBTztvQkFDakQsR0FBRyxDQUFDLElBQUksRUFBRSxDQUFBO0lBQzVCLENBQUM7SUFBQyxJQUFJLENBQUMsQ0FBQztRQUNOLE1BQU0sQ0FBQyxpQ0FBaUMsR0FBRyxDQUFDLElBQUksRUFBRSxDQUFBO0lBQ3BELENBQUM7QUFDSCxDQUFDO0FBZkQsa0NBZUM7QUFFRCw2QkFBcUMsSUFBd0I7SUFDM0QsTUFBTSxFQUFDLEdBQUcsRUFBRSxPQUFPLEVBQUUsSUFBSSxFQUFDLEdBQUcsSUFBSSxDQUFBO0lBQ2pDLE1BQU0sY0FBYyxHQUFHLE9BQU8sSUFBSSxPQUFPLENBQUMsY0FBYyxDQUFBO0lBRXhELEVBQUUsQ0FBQyxDQUFDLENBQUMsY0FBYyxDQUFDLENBQUMsQ0FBQztRQUNwQixJQUFJLENBQUMsYUFBYSxDQUFDLFFBQVEsQ0FDekIsV0FBVyxDQUFDLElBQUksQ0FBQyxFQUNqQjtZQUNFLE1BQU0sRUFBRSxjQUFjLENBQUMsSUFBSSxDQUFDO1lBQzVCLEtBQUssRUFBRSxHQUFHLENBQUMsS0FBSztZQUNoQixXQUFXLEVBQUUsSUFBSTtTQUNsQixDQUNGLENBQUE7SUFDSCxDQUFDO0lBQUMsSUFBSSxDQUFDLENBQUM7UUFDTixLQUFLLENBQUMsSUFBSSxFQUFFLE9BQU8sRUFBRSxHQUFHLENBQUMsQ0FBQTtJQUMzQixDQUFDO0FBQ0gsQ0FBQztBQWhCRCxrREFnQkM7QUFFRDtJQUNFLElBQUksQ0FBQyxhQUFhLENBQUMsVUFBVSxDQUMzQixzRUFBc0UsRUFDdEU7UUFDRSxXQUFXLEVBQUUsSUFBSTtRQUNqQixNQUFNLEVBQUU7Ozs7Ozs7MkRBTzZDO0tBQ3RELENBQ0YsQ0FBQTtBQUNILENBQUM7QUFmRCxnREFlQztBQUVELG1CQUFvQixHQUF5QztJQUMzRCxNQUFNLElBQUksR0FBRyxFQUFFLENBQUE7SUFFZixHQUFHLENBQUMsQ0FBQyxNQUFNLElBQUksSUFBSSxHQUFHLENBQUMsQ0FBQyxDQUFDO1FBQ3ZCLE1BQU0sS0FBSyxHQUFHLElBQUksQ0FBQyxXQUFXLEVBQUUsQ0FBQTtRQUNoQyxFQUFFLENBQUMsQ0FDRSxLQUFLLEtBQUssTUFBTTtlQUNoQixLQUFLLENBQUMsVUFBVSxDQUFDLE1BQU0sQ0FBQztlQUN4QixLQUFLLENBQUMsVUFBVSxDQUFDLFFBQVEsQ0FBQztlQUMxQixLQUFLLENBQUMsVUFBVSxDQUFDLFFBQVEsQ0FDOUIsQ0FBQyxDQUFDLENBQUM7WUFDRCxJQUFJLENBQUMsSUFBSSxDQUFDLEdBQUcsR0FBRyxDQUFDLElBQUksQ0FBQyxDQUFBO1FBQ3hCLENBQUM7SUFDSCxDQUFDO0lBQ0QsTUFBTSxDQUFDLElBQUksQ0FBQTtBQUNiLENBQUM7QUFFRCx5QkFBaUMsSUFBOEQ7SUFDN0YsTUFBTSxTQUFTLEdBQUcsSUFBSSxDQUFDLEtBQUssQ0FBQyxJQUFJLENBQUMsU0FBUyxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFBO0lBQ3ZELFNBQVMsQ0FBQyxHQUFHLEdBQUcsU0FBUyxDQUFDLFNBQVMsQ0FBQyxHQUFHLENBQUMsQ0FBQTtJQUN4QyxJQUFJLENBQUMsSUFBSSxHQUFHLFNBQVMsQ0FBQTtJQUNyQixJQUFJLENBQUMsYUFBYSxDQUFDLGFBQWEsQ0FDOUI7MkNBQ3VDLElBQUksQ0FBQyxHQUFHLENBQUMsSUFBSSxFQUFFLEVBQ3REO1FBQ0UsTUFBTSxFQUFFO2FBQ0QsSUFBSSxDQUFDLEdBQUcsQ0FBQyxJQUFJO0VBQ3hCLElBQUksQ0FBQyxHQUFHLENBQUMsT0FBTzs7RUFFaEIsSUFBSSxDQUFDLFNBQVMsQ0FBQyxJQUFJLEVBQUUsU0FBUyxFQUFFLENBQUMsQ0FBQzs7RUFFbEMsSUFBSSxDQUFDLFNBQVMsQ0FBQyxTQUFTLENBQUMsT0FBTyxDQUFDLEdBQUcsQ0FBQyxFQUFFLFNBQVMsRUFBRSxDQUFDLENBQUM7Q0FDckQ7UUFDSyxLQUFLLEVBQUUsSUFBSSxDQUFDLEdBQUcsQ0FBQyxLQUFLO1FBQ3JCLFdBQVcsRUFBRSxJQUFJO0tBQ2xCLENBQ0YsQ0FBQTtBQUNILENBQUM7QUFwQkQsMENBb0JDO0FBRUQseUJBQ0UsTUFBMkQsRUFBRSxHQUFXLEVBQ3hFLElBQTZEO0lBRTdELE1BQU0sbUJBQ0QsSUFBSSxJQUNELEtBQUssQ0FBRSxHQUFHLElBQVc7O2dCQUN6QixJQUFJLENBQUM7b0JBRUgsTUFBTSxDQUFDLE1BQU0sSUFBSSxDQUFDLEtBQU0sQ0FBQyxJQUFJLENBQUMsSUFBSSxFQUFFLEdBQUcsSUFBSSxDQUFDLENBQUE7Z0JBQzlDLENBQUM7Z0JBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQztvQkFFWCxLQUFLLENBQUMsQ0FBQyxDQUFDLENBQUE7b0JBQ1IsTUFBTSxHQUFHLEdBQXFCLE1BQU8sSUFBWSxDQUFDLEdBQUcsQ0FBQTtvQkFDckQsR0FBRyxDQUFDLFNBQVMsQ0FBQzt3QkFDWixNQUFNLEVBQUUsU0FBUzt3QkFDakIsTUFBTSxFQUFFLENBQUMsQ0FBQyxRQUFRLEVBQUU7cUJBQ3JCLENBQUMsQ0FBQTtvQkFFRixNQUFNLENBQUMsSUFBSSxPQUFPLENBQUMsUUFBa0IsQ0FBQyxDQUFDLENBQUE7Z0JBQ3pDLENBQUM7WUFDSCxDQUFDO1NBQUEsSUFDRjtBQUNILENBQUM7QUF2QkQsMENBdUJDIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IHsgUmFuZ2UsIFBvaW50LCBEaXJlY3RvcnkgfSBmcm9tICdhdG9tJ1xuaW1wb3J0IHsgZGVsaW1pdGVyLCBzZXAsIGV4dG5hbWUgfSBmcm9tICdwYXRoJ1xuaW1wb3J0ICogYXMgVGVtcCBmcm9tICd0ZW1wJ1xuaW1wb3J0ICogYXMgRlMgZnJvbSAnZnMnXG5pbXBvcnQgKiBhcyBDUCBmcm9tICdjaGlsZF9wcm9jZXNzJ1xuaW1wb3J0IHsgRU9MIH0gZnJvbSAnb3MnXG5pbXBvcnQge2dldFJvb3REaXJGYWxsYmFjaywgZ2V0Um9vdERpciwgaXNEaXJlY3Rvcnl9IGZyb20gJ2F0b20taGFza2VsbC11dGlscydcbmltcG9ydCB7IFJ1bk9wdGlvbnMsIElFcnJvckNhbGxiYWNrQXJncyB9IGZyb20gJy4vZ2hjLW1vZC9naGMtbW9kaS1wcm9jZXNzLXJlYWwnXG5cbnR5cGUgRXhlY09wdHMgPSBDUC5FeGVjRmlsZU9wdGlvbnNXaXRoU3RyaW5nRW5jb2RpbmdcbmV4cG9ydCB7Z2V0Um9vdERpckZhbGxiYWNrLCBnZXRSb290RGlyLCBpc0RpcmVjdG9yeSwgRXhlY09wdHN9XG5cbmxldCBkZWJ1Z2xvZzogQXJyYXk8e3RpbWVzdGFtcDogbnVtYmVyLCBtZXNzYWdlczogc3RyaW5nW119PiA9IFtdXG5jb25zdCBsb2dLZWVwID0gMzAwMDAgLy8gbXNcblxuZnVuY3Rpb24gc2F2ZWxvZyAoLi4ubWVzc2FnZXM6IHN0cmluZ1tdKSB7XG4gIGNvbnN0IHRzID0gRGF0ZS5ub3coKVxuICBkZWJ1Z2xvZy5wdXNoKHtcbiAgICB0aW1lc3RhbXA6IHRzLFxuICAgIG1lc3NhZ2VzXG4gIH0pXG4gIGRlYnVnbG9nID0gZGVidWdsb2cuZmlsdGVyKCh7dGltZXN0YW1wfSkgPT4gKHRzIC0gdGltZXN0YW1wKSA8IGxvZ0tlZXApXG59XG5cbmZ1bmN0aW9uIGpvaW5QYXRoIChkczogc3RyaW5nW10pIHtcbiAgY29uc3Qgc2V0ID0gbmV3IFNldChkcylcbiAgcmV0dXJuIEFycmF5LmZyb20oc2V0KS5qb2luKGRlbGltaXRlcilcbn1cblxuZXhwb3J0IGNvbnN0IEVPVCA9IGAke0VPTH1cXHgwNCR7RU9MfWBcblxuZXhwb3J0IGZ1bmN0aW9uIGRlYnVnICguLi5tZXNzYWdlczogYW55W10pIHtcbiAgaWYgKGF0b20uY29uZmlnLmdldCgnaGFza2VsbC1naGMtbW9kLmRlYnVnJykpIHtcbiAgICAvLyB0c2xpbnQ6ZGlzYWJsZS1uZXh0LWxpbmU6IG5vLWNvbnNvbGVcbiAgICBjb25zb2xlLmxvZygnaGFza2VsbC1naGMtbW9kIGRlYnVnOicsIC4uLm1lc3NhZ2VzKVxuICB9XG4gIHNhdmVsb2coLi4ubWVzc2FnZXMubWFwKCh2KSA9PiBKU09OLnN0cmluZ2lmeSh2KSkpXG59XG5cbmV4cG9ydCBmdW5jdGlvbiB3YXJuICguLi5tZXNzYWdlczogYW55W10pIHtcbiAgLy8gdHNsaW50OmRpc2FibGUtbmV4dC1saW5lOiBuby1jb25zb2xlXG4gIGNvbnNvbGUud2FybignaGFza2VsbC1naGMtbW9kIHdhcm5pbmc6JywgLi4ubWVzc2FnZXMpXG4gIHNhdmVsb2coLi4ubWVzc2FnZXMubWFwKCh2KSA9PiBKU09OLnN0cmluZ2lmeSh2KSkpXG59XG5cbmV4cG9ydCBmdW5jdGlvbiBlcnJvciAoLi4ubWVzc2FnZXM6IGFueVtdKSB7XG4gIC8vIHRzbGludDpkaXNhYmxlLW5leHQtbGluZTogbm8tY29uc29sZVxuICBjb25zb2xlLmVycm9yKCdoYXNrZWxsLWdoYy1tb2QgZXJyb3I6JywgLi4ubWVzc2FnZXMpXG4gIHNhdmVsb2coLi4ubWVzc2FnZXMubWFwKCh2KSA9PiBKU09OLnN0cmluZ2lmeSh2KSkpXG59XG5cbmV4cG9ydCBmdW5jdGlvbiBnZXREZWJ1Z0xvZyAoKSB7XG4gIGNvbnN0IHRzID0gRGF0ZS5ub3coKVxuICBkZWJ1Z2xvZyA9IGRlYnVnbG9nLmZpbHRlcigoe3RpbWVzdGFtcH0pID0+ICh0cyAtIHRpbWVzdGFtcCkgPCBsb2dLZWVwKVxuICByZXR1cm4gZGVidWdsb2cubWFwKCh7dGltZXN0YW1wLCBtZXNzYWdlc30pID0+IGAkeyh0aW1lc3RhbXAgLSB0cykgLyAxMDAwfXM6ICR7bWVzc2FnZXMuam9pbignLCcpfWApLmpvaW4oRU9MKVxufVxuXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gZXhlY1Byb21pc2UgKGNtZDogc3RyaW5nLCBhcmdzOiBzdHJpbmdbXSwgb3B0czogRXhlY09wdHMsIHN0ZGluPzogc3RyaW5nKSB7XG4gIHJldHVybiBuZXcgUHJvbWlzZTx7c3Rkb3V0OiBzdHJpbmcsIHN0ZGVycjogc3RyaW5nfT4oKHJlc29sdmUsIHJlamVjdCkgPT4ge1xuICAgIGRlYnVnKGBSdW5uaW5nICR7Y21kfSAke2FyZ3N9IHdpdGggb3B0cyA9IGAsIG9wdHMpXG4gICAgY29uc3QgY2hpbGQgPSBDUC5leGVjRmlsZShjbWQsIGFyZ3MsIG9wdHMsIChlcnJvciwgc3Rkb3V0OiBzdHJpbmcsIHN0ZGVycjogc3RyaW5nKSA9PiB7XG4gICAgICBpZiAoc3RkZXJyLnRyaW0oKS5sZW5ndGggPiAwKSB7IHdhcm4oc3RkZXJyKSB9XG4gICAgICBpZiAoZXJyb3IpIHtcbiAgICAgICAgd2FybihgUnVubmluZyAke2NtZH0gJHthcmdzfSBmYWlsZWQgd2l0aCBgLCBlcnJvcilcbiAgICAgICAgaWYgKHN0ZG91dCkgeyB3YXJuKHN0ZG91dCkgfVxuICAgICAgICBlcnJvci5zdGFjayA9IChuZXcgRXJyb3IoKSkuc3RhY2tcbiAgICAgICAgcmVqZWN0KGVycm9yKVxuICAgICAgfSBlbHNlIHtcbiAgICAgICAgZGVidWcoYEdvdCByZXNwb25zZSBmcm9tICR7Y21kfSAke2FyZ3N9YCwge3N0ZG91dCwgc3RkZXJyfSlcbiAgICAgICAgcmVzb2x2ZSh7c3Rkb3V0LCBzdGRlcnJ9KVxuICAgICAgfVxuICAgIH0pXG4gICAgaWYgKHN0ZGluKSB7XG4gICAgICBkZWJ1Zyhgc2VuZGluZyBzdGRpbiB0ZXh0IHRvICR7Y21kfSAke2FyZ3N9YClcbiAgICAgIGNoaWxkLnN0ZGluLndyaXRlKHN0ZGluKVxuICAgIH1cbiAgfSlcbn1cblxuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIGdldENhYmFsU2FuZGJveCAocm9vdFBhdGg6IHN0cmluZykge1xuICBkZWJ1ZygnTG9va2luZyBmb3IgY2FiYWwgc2FuZGJveC4uLicpXG4gIGNvbnN0IHNiYyA9IGF3YWl0IHBhcnNlU2FuZGJveENvbmZpZyhgJHtyb290UGF0aH0ke3NlcH1jYWJhbC5zYW5kYm94LmNvbmZpZ2ApXG4gIC8vIHRzbGludDpkaXNhYmxlOiBuby1zdHJpbmctbGl0ZXJhbFxuICBpZiAoc2JjICYmIHNiY1snaW5zdGFsbC1kaXJzJ10gJiYgc2JjWydpbnN0YWxsLWRpcnMnXVsnYmluZGlyJ10pIHtcbiAgICBjb25zdCBzYW5kYm94ID0gc2JjWydpbnN0YWxsLWRpcnMnXVsnYmluZGlyJ11cbiAgICBkZWJ1ZygnRm91bmQgY2FiYWwgc2FuZGJveDogJywgc2FuZGJveClcbiAgICBpZiAoaXNEaXJlY3Rvcnkoc2FuZGJveCkpIHtcbiAgICAgIHJldHVybiBzYW5kYm94XG4gICAgfSBlbHNlIHtcbiAgICAgIHdhcm4oJ0NhYmFsIHNhbmRib3ggJywgc2FuZGJveCwgJyBpcyBub3QgYSBkaXJlY3RvcnknKVxuICAgIH1cbiAgfSBlbHNlIHtcbiAgICB3YXJuKCdObyBjYWJhbCBzYW5kYm94IGZvdW5kJylcbiAgfVxuICAvLyB0c2xpbnQ6ZW5hYmxlOiBuby1zdHJpbmctbGl0ZXJhbFxufVxuXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gZ2V0U3RhY2tTYW5kYm94IChyb290UGF0aDogc3RyaW5nICwgYXBkOiBzdHJpbmdbXSwgZW52OiB7W2tleTogc3RyaW5nXTogc3RyaW5nIHwgdW5kZWZpbmVkfSkge1xuICBkZWJ1ZygnTG9va2luZyBmb3Igc3RhY2sgc2FuZGJveC4uLicpXG4gIGVudi5QQVRIID0gam9pblBhdGgoYXBkKVxuICBkZWJ1ZygnUnVubmluZyBzdGFjayB3aXRoIFBBVEggJywgZW52LlBBVEgpXG4gIHRyeSB7XG4gICAgY29uc3Qgb3V0ID0gYXdhaXQgZXhlY1Byb21pc2UoJ3N0YWNrJywgWydwYXRoJywgJy0tc25hcHNob3QtaW5zdGFsbC1yb290JywgJy0tbG9jYWwtaW5zdGFsbC1yb290JywgJy0tYmluLXBhdGgnXSwge1xuICAgICAgZW5jb2Rpbmc6ICd1dGY4JyxcbiAgICAgIGN3ZDogcm9vdFBhdGgsXG4gICAgICBlbnYsXG4gICAgICB0aW1lb3V0OiBhdG9tLmNvbmZpZy5nZXQoJ2hhc2tlbGwtZ2hjLW1vZC5pbml0VGltZW91dCcpICogMTAwMFxuICAgIH0pXG5cbiAgICBjb25zdCBsaW5lcyA9IG91dC5zdGRvdXQuc3BsaXQoRU9MKVxuICAgIGNvbnN0IHNpciA9IGxpbmVzLmZpbHRlcigobCkgPT4gbC5zdGFydHNXaXRoKCdzbmFwc2hvdC1pbnN0YWxsLXJvb3Q6ICcpKVswXS5zbGljZSgyMykgKyBgJHtzZXB9YmluYFxuICAgIGNvbnN0IGxpciA9IGxpbmVzLmZpbHRlcigobCkgPT4gbC5zdGFydHNXaXRoKCdsb2NhbC1pbnN0YWxsLXJvb3Q6ICcpKVswXS5zbGljZSgyMCkgKyBgJHtzZXB9YmluYFxuICAgIGNvbnN0IGJwID1cbiAgICAgIGxpbmVzLmZpbHRlcigobCkgPT5cbiAgICAgICAgbC5zdGFydHNXaXRoKCdiaW4tcGF0aDogJykpWzBdLnNsaWNlKDEwKS5zcGxpdChkZWxpbWl0ZXIpLmZpbHRlcigocCkgPT5cbiAgICAgICAgICAhKChwID09PSBzaXIpIHx8IChwID09PSBsaXIpIHx8IChhcGQuaW5jbHVkZXMocCkpKSlcbiAgICBkZWJ1ZygnRm91bmQgc3RhY2sgc2FuZGJveCAnLCBsaXIsIHNpciwgLi4uYnApXG4gICAgcmV0dXJuIFtsaXIsIHNpciwgLi4uYnBdXG4gIH0gY2F0Y2ggKGVycikge1xuICAgIHdhcm4oJ05vIHN0YWNrIHNhbmRib3ggZm91bmQgYmVjYXVzZSAnLCBlcnIpXG4gIH1cbn1cblxuY29uc3QgcHJvY2Vzc09wdGlvbnNDYWNoZSA9IG5ldyBNYXA8c3RyaW5nLCBSdW5PcHRpb25zPigpXG5cbmV4cG9ydCBhc3luYyBmdW5jdGlvbiBnZXRQcm9jZXNzT3B0aW9ucyAocm9vdFBhdGg/OiBzdHJpbmcpOiBQcm9taXNlPFJ1bk9wdGlvbnM+IHtcbiAgaWYgKCEgcm9vdFBhdGgpIHtcbiAgICAvLyB0c2xpbnQ6ZGlzYWJsZS1uZXh0LWxpbmU6IG5vLW51bGwta2V5d29yZFxuICAgIHJvb3RQYXRoID0gZ2V0Um9vdERpckZhbGxiYWNrKG51bGwpLmdldFBhdGgoKVxuICB9XG4gIC8vIGNhY2hlXG4gIGNvbnN0IGNhY2hlZCA9IHByb2Nlc3NPcHRpb25zQ2FjaGUuZ2V0KHJvb3RQYXRoKVxuICBpZiAoY2FjaGVkKSB7XG4gICAgcmV0dXJuIGNhY2hlZFxuICB9XG5cbiAgZGVidWcoYGdldFByb2Nlc3NPcHRpb25zKCR7cm9vdFBhdGh9KWApXG4gIGNvbnN0IGVudiA9IHsuLi5wcm9jZXNzLmVudn1cblxuICBpZiAocHJvY2Vzcy5wbGF0Zm9ybSA9PT0gJ3dpbjMyJykge1xuICAgIGNvbnN0IFBBVEggPSBbXVxuICAgIGNvbnN0IGNhcE1hc2sgPSAoc3RyOiBzdHJpbmcsIG1hc2s6IG51bWJlcikgPT4ge1xuICAgICAgY29uc3QgYSA9IHN0ci5zcGxpdCgnJylcbiAgICAgIGZvciAobGV0IGkgPSAwOyBpIDwgYS5sZW5ndGg7IGkrKykge1xuICAgICAgICBjb25zdCBjID0gYVtpXVxuICAgICAgICAvLyB0c2xpbnQ6ZGlzYWJsZS1uZXh0LWxpbmU6IG5vLWJpdHdpc2VcbiAgICAgICAgaWYgKG1hc2sgJiBNYXRoLnBvdygyLCBpKSkge1xuICAgICAgICAgIGFbaV0gPSBhW2ldLnRvVXBwZXJDYXNlKClcbiAgICAgICAgfVxuICAgICAgfVxuICAgICAgcmV0dXJuIGEuam9pbignJylcbiAgICB9XG4gICAgZm9yIChsZXQgbSA9IDBiMTExMTsgbSA+PSAwOyBtLS0pIHtcbiAgICAgIGNvbnN0IHZuID0gY2FwTWFzaygncGF0aCcsIG0pXG4gICAgICBpZiAoZW52W3ZuXSkge1xuICAgICAgICBQQVRILnB1c2goZW52W3ZuXSlcbiAgICAgIH1cbiAgICB9XG4gICAgZW52LlBBVEggPSBQQVRILmpvaW4oZGVsaW1pdGVyKVxuICB9XG5cbiAgY29uc3QgUEFUSCA9IGVudi5QQVRIIHx8ICcnXG5cbiAgY29uc3QgYXBkID0gYXRvbS5jb25maWcuZ2V0KCdoYXNrZWxsLWdoYy1tb2QuYWRkaXRpb25hbFBhdGhEaXJlY3RvcmllcycpLmNvbmNhdChQQVRILnNwbGl0KGRlbGltaXRlcikpXG4gIGNvbnN0IHNiZCA9IGZhbHNlXG4gIGNvbnN0IGNhYmFsU2FuZGJveCA9XG4gICAgYXRvbS5jb25maWcuZ2V0KCdoYXNrZWxsLWdoYy1tb2QuY2FiYWxTYW5kYm94JykgPyBnZXRDYWJhbFNhbmRib3gocm9vdFBhdGgpIDogUHJvbWlzZS5yZXNvbHZlKCkgLy8gdW5kZWZpbmVkXG4gIGNvbnN0IHN0YWNrU2FuZGJveCA9XG4gICAgYXRvbS5jb25maWcuZ2V0KCdoYXNrZWxsLWdoYy1tb2Quc3RhY2tTYW5kYm94JykgPyBnZXRTdGFja1NhbmRib3gocm9vdFBhdGgsIGFwZCwgey4uLmVudn0pIDogUHJvbWlzZS5yZXNvbHZlKClcbiAgY29uc3QgW2NhYmFsU2FuZGJveERpciwgc3RhY2tTYW5kYm94RGlyc10gPSBhd2FpdCBQcm9taXNlLmFsbChbY2FiYWxTYW5kYm94LCBzdGFja1NhbmRib3hdKVxuICBjb25zdCBuZXdwID0gW11cbiAgaWYgKGNhYmFsU2FuZGJveERpcikge1xuICAgIG5ld3AucHVzaChjYWJhbFNhbmRib3hEaXIpXG4gIH1cbiAgaWYgKHN0YWNrU2FuZGJveERpcnMpIHtcbiAgICBuZXdwLnB1c2goLi4uc3RhY2tTYW5kYm94RGlycylcbiAgfVxuICBuZXdwLnB1c2goLi4uYXBkKVxuICBlbnYuUEFUSCA9IGpvaW5QYXRoKG5ld3ApXG4gIGRlYnVnKGBQQVRIID0gJHtlbnYuUEFUSH1gKVxuICBjb25zdCByZXM6IFJ1bk9wdGlvbnMgPSB7XG4gICAgY3dkOiByb290UGF0aCxcbiAgICBlbnYsXG4gICAgZW5jb2Rpbmc6ICd1dGY4JyxcbiAgICBtYXhCdWZmZXI6IEluZmluaXR5XG4gIH1cbiAgcHJvY2Vzc09wdGlvbnNDYWNoZS5zZXQocm9vdFBhdGgsIHJlcylcbiAgcmV0dXJuIHJlc1xufVxuXG5leHBvcnQgZnVuY3Rpb24gZ2V0U3ltYm9sQXRQb2ludCAoXG4gIGVkaXRvcjogQXRvbVR5cGVzLlRleHRFZGl0b3IsIHBvaW50OiBBdG9tVHlwZXMuUG9pbnRcbikge1xuICBjb25zdCBbc2NvcGVdID0gZWRpdG9yLnNjb3BlRGVzY3JpcHRvckZvckJ1ZmZlclBvc2l0aW9uKHBvaW50KS5nZXRTY29wZXNBcnJheSgpLnNsaWNlKC0xKVxuICBpZiAoc2NvcGUpIHtcbiAgICBjb25zdCByYW5nZSA9IGVkaXRvci5idWZmZXJSYW5nZUZvclNjb3BlQXRQb3NpdGlvbihzY29wZSwgcG9pbnQpXG4gICAgaWYgKHJhbmdlICYmICFyYW5nZS5pc0VtcHR5KCkpIHtcbiAgICAgIGNvbnN0IHN5bWJvbCA9IGVkaXRvci5nZXRUZXh0SW5CdWZmZXJSYW5nZShyYW5nZSlcbiAgICAgIHJldHVybiB7c2NvcGUsIHJhbmdlLCBzeW1ib2x9XG4gICAgfVxuICB9XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBnZXRTeW1ib2xJblJhbmdlIChlZGl0b3I6IEF0b21UeXBlcy5UZXh0RWRpdG9yLCBjcmFuZ2U6IEF0b21UeXBlcy5SYW5nZSkge1xuICBjb25zdCBidWZmZXIgPSBlZGl0b3IuZ2V0QnVmZmVyKClcbiAgaWYgKGNyYW5nZS5pc0VtcHR5KCkpIHtcbiAgICByZXR1cm4gZ2V0U3ltYm9sQXRQb2ludChlZGl0b3IsIGNyYW5nZS5zdGFydClcbiAgfSBlbHNlIHtcbiAgICByZXR1cm4ge1xuICAgICAgc3ltYm9sOiBidWZmZXIuZ2V0VGV4dEluUmFuZ2UoY3JhbmdlKSxcbiAgICAgIHJhbmdlOiBjcmFuZ2VcbiAgICB9XG4gIH1cbn1cblxuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIHdpdGhUZW1wRmlsZTxUPiAoY29udGVudHM6IHN0cmluZywgdXJpOiBzdHJpbmcsIGdlbjogKHBhdGg6IHN0cmluZykgPT4gUHJvbWlzZTxUPik6IFByb21pc2U8VD4ge1xuICBjb25zdCBpbmZvID0gYXdhaXQgbmV3IFByb21pc2U8VGVtcC5PcGVuRmlsZT4oXG4gICAgKHJlc29sdmUsIHJlamVjdCkgPT5cbiAgICBUZW1wLm9wZW4oXG4gICAgICB7cHJlZml4OiAnaGFza2VsbC1naGMtbW9kJywgc3VmZml4OiBleHRuYW1lKHVyaSB8fCAnLmhzJyl9LFxuICAgICAgKGVyciwgaW5mbzIpID0+IHtcbiAgICAgICAgaWYgKGVycikge1xuICAgICAgICAgIHJlamVjdChlcnIpXG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgcmVzb2x2ZShpbmZvMilcbiAgICAgICAgfVxuICAgIH0pKVxuICByZXR1cm4gbmV3IFByb21pc2U8VD4oKHJlc29sdmUsIHJlamVjdCkgPT5cbiAgICBGUy53cml0ZShpbmZvLmZkLCBjb250ZW50cywgYXN5bmMgKGVycikgPT4ge1xuICAgICAgaWYgKGVycikge1xuICAgICAgICByZWplY3QoZXJyKVxuICAgICAgfSBlbHNlIHtcbiAgICAgICAgcmVzb2x2ZShhd2FpdCBnZW4oaW5mby5wYXRoKSlcbiAgICAgICAgRlMuY2xvc2UoaW5mby5mZCwgKCkgPT4gRlMudW5saW5rKGluZm8ucGF0aCwgKCkgPT4geyAvKm5vb3AqLyB9KSlcbiAgICAgIH1cbiAgICB9KSlcbn1cblxuZXhwb3J0IHR5cGUgS25vd25FcnJvck5hbWUgPVxuICAgICdHSENNb2RTdGRvdXRFcnJvcidcbiAgfCAnSW50ZXJhY3RpdmVBY3Rpb25UaW1lb3V0J1xuICB8ICdHSENNb2RJbnRlcmFjdGl2ZUNyYXNoJ1xuXG5leHBvcnQgZnVuY3Rpb24gbWtFcnJvciAobmFtZTogS25vd25FcnJvck5hbWUsIG1lc3NhZ2U6IHN0cmluZykge1xuICBjb25zdCBlcnIgPSBuZXcgRXJyb3IobWVzc2FnZSlcbiAgZXJyLm5hbWUgPSBuYW1lXG4gIHJldHVybiBlcnJcbn1cblxuZXhwb3J0IGludGVyZmFjZSBTYW5kYm94Q29uZmlnVHJlZSB7W2s6IHN0cmluZ106IFNhbmRib3hDb25maWdUcmVlIHwgc3RyaW5nfVxuXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gcGFyc2VTYW5kYm94Q29uZmlnIChmaWxlOiBzdHJpbmcpIHtcbiAgdHJ5IHtcbiAgICBjb25zdCBzYmMgPSBhd2FpdCBuZXcgUHJvbWlzZTxzdHJpbmc+KChyZXNvbHZlLCByZWplY3QpID0+XG4gICAgICBGUy5yZWFkRmlsZShmaWxlLCB7ZW5jb2Rpbmc6ICd1dGYtOCd9LCAoZXJyLCBzYmMyKSA9PiB7XG4gICAgICAgIGlmIChlcnIpIHtcbiAgICAgICAgICByZWplY3QoZXJyKVxuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIHJlc29sdmUoc2JjMilcbiAgICAgICAgfVxuICAgICAgfSkpXG4gICAgY29uc3QgdmFyczogU2FuZGJveENvbmZpZ1RyZWUgPSB7fVxuICAgIGxldCBzY29wZSA9IHZhcnNcbiAgICBjb25zdCBydiA9ICh2OiBzdHJpbmcpID0+IHtcbiAgICAgIGZvciAoY29uc3QgazEgb2YgT2JqZWN0LmtleXMoc2NvcGUpKSB7XG4gICAgICAgIGNvbnN0IHYxID0gc2NvcGVbazFdXG4gICAgICAgIGlmICh0eXBlb2YgdjEgPT09ICdzdHJpbmcnKSB7XG4gICAgICAgICAgdiA9IHYuc3BsaXQoYCQke2sxfWApLmpvaW4odjEpXG4gICAgICAgIH1cbiAgICAgIH1cbiAgICAgIHJldHVybiB2XG4gICAgfVxuICAgIGZvciAoY29uc3QgbGluZSBvZiBzYmMuc3BsaXQoL1xccj9cXG58XFxyLykpIHtcbiAgICAgIGlmICghbGluZS5tYXRjaCgvXlxccyotLS8pICYmICFsaW5lLm1hdGNoKC9eXFxzKiQvKSkge1xuICAgICAgICBjb25zdCBbbF0gPSBsaW5lLnNwbGl0KC8tLS8pXG4gICAgICAgIGNvbnN0IG0gPSBsaW5lLm1hdGNoKC9eXFxzKihbXFx3LV0rKTpcXHMqKC4qKVxccyokLylcbiAgICAgICAgaWYgKG0pIHtcbiAgICAgICAgICBjb25zdCBbXywgbmFtZSwgdmFsXSA9IG1cbiAgICAgICAgICBzY29wZVtuYW1lXSA9IHJ2KHZhbClcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICBjb25zdCBuZXdzY29wZSA9IHt9XG4gICAgICAgICAgc2NvcGVbbGluZV0gPSBuZXdzY29wZVxuICAgICAgICAgIHNjb3BlID0gbmV3c2NvcGVcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH1cbiAgICByZXR1cm4gdmFyc1xuICB9IGNhdGNoIChlcnIpIHtcbiAgICB3YXJuKCdSZWFkaW5nIGNhYmFsIHNhbmRib3ggY29uZmlnIGZhaWxlZCB3aXRoICcsIGVycilcbiAgfVxufVxuXG4vLyBBIGRpcnR5IGhhY2sgdG8gd29yayB3aXRoIHRhYnNcbmV4cG9ydCBmdW5jdGlvbiB0YWJTaGlmdEZvclBvaW50IChidWZmZXI6IEF0b21UeXBlcy5UZXh0QnVmZmVyLCBwb2ludDogQXRvbVR5cGVzLlBvaW50KSB7XG4gIGNvbnN0IGxpbmUgPSBidWZmZXIubGluZUZvclJvdyhwb2ludC5yb3cpXG4gIGNvbnN0IG1hdGNoID0gbGluZSA/IChsaW5lLnNsaWNlKDAsIHBvaW50LmNvbHVtbikubWF0Y2goL1xcdC9nKSB8fCBbXSkgOiBbXVxuICBjb25zdCBjb2x1bW5TaGlmdCA9IDcgKiBtYXRjaC5sZW5ndGhcbiAgcmV0dXJuIG5ldyBQb2ludChwb2ludC5yb3csIHBvaW50LmNvbHVtbiArIGNvbHVtblNoaWZ0KVxufVxuXG5leHBvcnQgZnVuY3Rpb24gdGFiU2hpZnRGb3JSYW5nZSAoYnVmZmVyOiBBdG9tVHlwZXMuVGV4dEJ1ZmZlciwgcmFuZ2U6IEF0b21UeXBlcy5SYW5nZSkge1xuICBjb25zdCBzdGFydCA9IHRhYlNoaWZ0Rm9yUG9pbnQoYnVmZmVyLCByYW5nZS5zdGFydClcbiAgY29uc3QgZW5kID0gdGFiU2hpZnRGb3JQb2ludChidWZmZXIsIHJhbmdlLmVuZClcbiAgcmV0dXJuIG5ldyBSYW5nZShzdGFydCwgZW5kKVxufVxuXG5leHBvcnQgZnVuY3Rpb24gdGFiVW5zaGlmdEZvclBvaW50IChidWZmZXI6IEF0b21UeXBlcy5UZXh0QnVmZmVyLCBwb2ludDogQXRvbVR5cGVzLlBvaW50KSB7XG4gIGNvbnN0IGxpbmUgPSBidWZmZXIubGluZUZvclJvdyhwb2ludC5yb3cpXG4gIGxldCBjb2x1bW5sID0gMFxuICBsZXQgY29sdW1uciA9IHBvaW50LmNvbHVtblxuICB3aGlsZSAoY29sdW1ubCA8IGNvbHVtbnIpIHtcbiAgICAvLyB0c2xpbnQ6ZGlzYWJsZS1uZXh0LWxpbmU6IHN0cmljdC10eXBlLXByZWRpY2F0ZXNcbiAgICBpZiAoKGxpbmUgPT09IHVuZGVmaW5lZCkgfHwgKGxpbmVbY29sdW1ubF0gPT09IHVuZGVmaW5lZCkpIHsgYnJlYWsgfVxuICAgIGlmIChsaW5lW2NvbHVtbmxdID09PSAnXFx0Jykge1xuICAgICAgY29sdW1uciAtPSA3XG4gICAgfVxuICAgIGNvbHVtbmwgKz0gMVxuICB9XG4gIHJldHVybiBuZXcgUG9pbnQocG9pbnQucm93LCBjb2x1bW5yKVxufVxuXG5leHBvcnQgZnVuY3Rpb24gdGFiVW5zaGlmdEZvclJhbmdlIChidWZmZXI6IEF0b21UeXBlcy5UZXh0QnVmZmVyLCByYW5nZTogQXRvbVR5cGVzLlJhbmdlKSB7XG4gIGNvbnN0IHN0YXJ0ID0gdGFiVW5zaGlmdEZvclBvaW50KGJ1ZmZlciwgcmFuZ2Uuc3RhcnQpXG4gIGNvbnN0IGVuZCA9IHRhYlVuc2hpZnRGb3JQb2ludChidWZmZXIsIHJhbmdlLmVuZClcbiAgcmV0dXJuIG5ldyBSYW5nZShzdGFydCwgZW5kKVxufVxuXG5leHBvcnQgZnVuY3Rpb24gaXNVcHBlckNhc2UgKGNoOiBzdHJpbmcpOiBib29sZWFuIHtcbiAgcmV0dXJuIGNoLnRvVXBwZXJDYXNlKCkgPT09IGNoXG59XG5cbmV4cG9ydCBmdW5jdGlvbiBnZXRFcnJvckRldGFpbCAoe2VyciwgcnVuQXJncywgY2Fwc306IElFcnJvckNhbGxiYWNrQXJncykge1xuICByZXR1cm4gYGNhcHM6XG4ke0pTT04uc3RyaW5naWZ5KGNhcHMsIHVuZGVmaW5lZCwgMil9XG5BcmdzOlxuJHtKU09OLnN0cmluZ2lmeShydW5BcmdzLCB1bmRlZmluZWQsIDIpfVxubWVzc2FnZTpcbiR7ZXJyLm1lc3NhZ2V9XG5sb2c6XG4ke2dldERlYnVnTG9nKCl9YFxufVxuXG5leHBvcnQgZnVuY3Rpb24gZm9ybWF0RXJyb3IgKHtlcnIsIHJ1bkFyZ3MsIGNhcHN9OiBJRXJyb3JDYWxsYmFja0FyZ3MpIHtcbiAgaWYgKGVyci5uYW1lID09PSAnSW50ZXJhY3RpdmVBY3Rpb25UaW1lb3V0JyAmJiBydW5BcmdzKSB7XG4gICAgICByZXR1cm4gYFxcXG5IYXNrZWxsLWdoYy1tb2Q6IGdoYy1tb2QgXFxcbiR7cnVuQXJncy5pbnRlcmFjdGl2ZSA/ICdpbnRlcmFjdGl2ZSAnIDogJyd9Y29tbWFuZCAke3J1bkFyZ3MuY29tbWFuZH0gXFxcbnRpbWVkIG91dC4gWW91IGNhbiB0cnkgdG8gZml4IGl0IGJ5IHJhaXNpbmcgJ0ludGVyYWN0aXZlIEFjdGlvbiBcXFxuVGltZW91dCcgc2V0dGluZyBpbiBoYXNrZWxsLWdoYy1tb2Qgc2V0dGluZ3MuYFxuICB9IGVsc2UgaWYgKHJ1bkFyZ3MpIHtcbiAgICByZXR1cm4gYFxcXG5IYXNrZWxsLWdoYy1tb2Q6IGdoYy1tb2QgXFxcbiR7cnVuQXJncy5pbnRlcmFjdGl2ZSA/ICdpbnRlcmFjdGl2ZSAnIDogJyd9Y29tbWFuZCAke3J1bkFyZ3MuY29tbWFuZH0gXFxcbmZhaWxlZCB3aXRoIGVycm9yICR7ZXJyLm5hbWV9YFxuICB9IGVsc2Uge1xuICAgIHJldHVybiBgVGhlcmUgd2FzIGFuIHVuZXhwZWN0ZWQgZXJyb3IgJHtlcnIubmFtZX1gXG4gIH1cbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGRlZmF1bHRFcnJvckhhbmRsZXIgKGFyZ3M6IElFcnJvckNhbGxiYWNrQXJncykge1xuICBjb25zdCB7ZXJyLCBydW5BcmdzLCBjYXBzfSA9IGFyZ3NcbiAgY29uc3Qgc3VwcHJlc3NFcnJvcnMgPSBydW5BcmdzICYmIHJ1bkFyZ3Muc3VwcHJlc3NFcnJvcnNcblxuICBpZiAoIXN1cHByZXNzRXJyb3JzKSB7XG4gICAgYXRvbS5ub3RpZmljYXRpb25zLmFkZEVycm9yKFxuICAgICAgZm9ybWF0RXJyb3IoYXJncyksXG4gICAgICB7XG4gICAgICAgIGRldGFpbDogZ2V0RXJyb3JEZXRhaWwoYXJncyksXG4gICAgICAgIHN0YWNrOiBlcnIuc3RhY2ssXG4gICAgICAgIGRpc21pc3NhYmxlOiB0cnVlXG4gICAgICB9XG4gICAgKVxuICB9IGVsc2Uge1xuICAgIGVycm9yKGNhcHMsIHJ1bkFyZ3MsIGVycilcbiAgfVxufVxuXG5leHBvcnQgZnVuY3Rpb24gd2FybkdIQ1BhY2thZ2VQYXRoICgpIHtcbiAgYXRvbS5ub3RpZmljYXRpb25zLmFkZFdhcm5pbmcoXG4gICAgJ2hhc2tlbGwtZ2hjLW1vZDogWW91IGhhdmUgR0hDX1BBQ0tBR0VfUEFUSCBlbnZpcm9ubWVudCB2YXJpYWJsZSBzZXQhJyxcbiAgICB7XG4gICAgICBkaXNtaXNzYWJsZTogdHJ1ZSxcbiAgICAgIGRldGFpbDogYFxcXG5UaGlzIGNvbmZpZ3VyYXRpb24gaXMgbm90IHN1cHBvcnRlZCwgYW5kIGNhbiBicmVhayBhcmJpdHJhcmlseS4gWW91IGNhbiB0cnkgdG8gYmFuZC1haWQgaXQgYnkgYWRkaW5nXG5cbmRlbGV0ZSBwcm9jZXNzLmVudi5HSENfUEFDS0FHRV9QQVRIXG5cbnRvIHlvdXIgQXRvbSBpbml0IHNjcmlwdCAoRWRpdCDihpIgSW5pdCBTY3JpcHQuLi4pXG5cbllvdSBjYW4gc3VwcHJlc3MgdGhpcyB3YXJuaW5nIGluIGhhc2tlbGwtZ2hjLW1vZCBzZXR0aW5ncy5gXG4gICAgfVxuICApXG59XG5cbmZ1bmN0aW9uIGZpbHRlckVudiAoZW52OiB7W25hbWU6IHN0cmluZ106IHN0cmluZyB8IHVuZGVmaW5lZH0pIHtcbiAgY29uc3QgZmVudiA9IHt9XG4gIC8vIHRzbGludDpkaXNhYmxlLW5leHQtbGluZTogZm9yaW5cbiAgZm9yIChjb25zdCBldmFyIGluIGVudikge1xuICAgIGNvbnN0IGV2YXJVID0gZXZhci50b1VwcGVyQ2FzZSgpXG4gICAgaWYgKFxuICAgICAgICAgZXZhclUgPT09ICdQQVRIJ1xuICAgICAgfHwgZXZhclUuc3RhcnRzV2l0aCgnR0hDXycpXG4gICAgICB8fCBldmFyVS5zdGFydHNXaXRoKCdTVEFDS18nKVxuICAgICAgfHwgZXZhclUuc3RhcnRzV2l0aCgnQ0FCQUxfJylcbiAgICApIHtcbiAgICAgIGZlbnZbZXZhcl0gPSBlbnZbZXZhcl1cbiAgICB9XG4gIH1cbiAgcmV0dXJuIGZlbnZcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIG5vdGlmeVNwYXduRmFpbCAoYXJnczoge2Rpcjogc3RyaW5nLCBlcnI6IGFueSwgb3B0czogYW55LCB2ZXJzOiBhbnksIGNhcHM6IGFueX0pIHtcbiAgY29uc3Qgb3B0c2Nsb25lID0gSlNPTi5wYXJzZShKU09OLnN0cmluZ2lmeShhcmdzLm9wdHMpKVxuICBvcHRzY2xvbmUuZW52ID0gZmlsdGVyRW52KG9wdHNjbG9uZS5lbnYpXG4gIGFyZ3Mub3B0cyA9IG9wdHNjbG9uZVxuICBhdG9tLm5vdGlmaWNhdGlvbnMuYWRkRmF0YWxFcnJvcihcbiAgICBgSGFza2VsbC1naGMtbW9kOiBnaGMtbW9kIGZhaWxlZCB0byBsYXVuY2guXG5JdCBpcyBwcm9iYWJseSBtaXNzaW5nIG9yIG1pc2NvbmZpZ3VyZWQuICR7YXJncy5lcnIuY29kZX1gLFxuICAgIHtcbiAgICAgIGRldGFpbDogYFxcXG5FcnJvciB3YXM6ICR7YXJncy5lcnIubmFtZX1cbiR7YXJncy5lcnIubWVzc2FnZX1cbkRlYnVnIGluZm9ybWF0aW9uOlxuJHtKU09OLnN0cmluZ2lmeShhcmdzLCB1bmRlZmluZWQsIDIpfVxuRW52aXJvbm1lbnQgKGZpbHRlcmVkKTpcbiR7SlNPTi5zdHJpbmdpZnkoZmlsdGVyRW52KHByb2Nlc3MuZW52KSwgdW5kZWZpbmVkLCAyKX1cbmAsXG4gICAgICBzdGFjazogYXJncy5lcnIuc3RhY2ssXG4gICAgICBkaXNtaXNzYWJsZTogdHJ1ZVxuICAgIH1cbiAgKVxufVxuXG5leHBvcnQgZnVuY3Rpb24gaGFuZGxlRXhjZXB0aW9uPFQ+IChcbiAgdGFyZ2V0OiB7dXBpOiBVUEkuSVVQSUluc3RhbmNlIHwgUHJvbWlzZTxVUEkuSVVQSUluc3RhbmNlPn0sIGtleTogc3RyaW5nLFxuICBkZXNjOiBUeXBlZFByb3BlcnR5RGVzY3JpcHRvcjwoLi4uYXJnczogYW55W10pID0+IFByb21pc2U8VD4+XG4pOiBUeXBlZFByb3BlcnR5RGVzY3JpcHRvcjwoLi4uYXJnczogYW55W10pID0+IFByb21pc2U8VD4+IHtcbiAgcmV0dXJuIHtcbiAgICAuLi5kZXNjLFxuICAgIGFzeW5jIHZhbHVlICguLi5hcmdzOiBhbnlbXSkge1xuICAgICAgdHJ5IHtcbiAgICAgICAgLy8gdHNsaW50OmRpc2FibGUtbmV4dC1saW5lOiBuby1ub24tbnVsbC1hc3NlcnRpb25cbiAgICAgICAgcmV0dXJuIGF3YWl0IGRlc2MudmFsdWUhLmNhbGwodGhpcywgLi4uYXJncylcbiAgICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgICAgLy8gdHNsaW50OmRpc2FibGUtbmV4dC1saW5lOiBuby1jb25zb2xlXG4gICAgICAgIGRlYnVnKGUpXG4gICAgICAgIGNvbnN0IHVwaTogVVBJLklVUElJbnN0YW5jZSA9IGF3YWl0ICh0aGlzIGFzIGFueSkudXBpXG4gICAgICAgIHVwaS5zZXRTdGF0dXMoe1xuICAgICAgICAgIHN0YXR1czogJ3dhcm5pbmcnLFxuICAgICAgICAgIGRldGFpbDogZS50b1N0cmluZygpXG4gICAgICAgIH0pXG4gICAgICAgIC8vIFRPRE86IHJldHVybmluZyBhIHByb21pc2UgdGhhdCBuZXZlciByZXNvbHZlcy4uLiB1Z2x5LCBidXQgd29ya3M/XG4gICAgICAgIHJldHVybiBuZXcgUHJvbWlzZSgoKSA9PiB7IC8qIG5vb3AgKi99KVxuICAgICAgfVxuICAgIH1cbiAgfVxufVxuIl19