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
                    return reject(error);
                }
                else {
                    debug(`Got response from ${cmd} ${args}`, { stdout, stderr });
                    return resolve({ stdout, stderr });
                }
            });
            if (stdin) {
                debug(`sending stdin text to ${cmd} ${args}`);
                return child.stdin.write(stdin);
            }
        });
    });
}
exports.execPromise = execPromise;
function getCabalSandbox(rootPath) {
    return __awaiter(this, void 0, void 0, function* () {
        debug('Looking for cabal sandbox...');
        const sbc = yield parseSandboxConfig(`${rootPath}${path_1.sep}cabal.sandbox.config`);
        if (sbc && sbc['install-dirs'] && sbc['install-dirs'].bindir) {
            const sandbox = sbc['install-dirs'].bindir;
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
    let range, symbol;
    const inScope = (scope, point2) => editor.scopeDescriptorForBufferPosition(point2).getScopesArray().some((v) => v === scope);
    const tb = editor.getBuffer();
    const line = tb.rangeForRow(point.row);
    const find = (test) => {
        let end = point;
        let start = point;
        let start2 = start.translate([0, -1]);
        while (test(start2) && start2.isGreaterThanOrEqual(line.start)) {
            start = start2;
            start2 = start.translate([0, -1]);
        }
        while (test(end) && end.isLessThan(line.end)) {
            end = end.translate([0, 1]);
        }
        return new atom_1.Range(start, end);
    };
    const regex = /[\w'.]/;
    const scopes = [
        'keyword.operator.haskell',
        'entity.name.function.infix.haskell'
    ];
    for (const scope of scopes) {
        range = find((p) => inScope(scope, p));
        if (!range.isEmpty()) {
            symbol = tb.getTextInRange(range);
            return { scope, range, symbol };
        }
    }
    range = find((p) => tb.getTextInRange([p, p.translate([0, 1])]).match(regex) !== null);
    symbol = tb.getTextInRange(range);
    return { scope: undefined, range, symbol };
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
                const res = yield gen(info.path);
                FS.close(info.fd, () => FS.unlink(info.path, () => { }));
                return res;
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
                        return scope[name] = rv(val);
                    }
                    else {
                        const newscope = {};
                        scope[line] = newscope;
                        return scope = newscope;
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
        console.error(caps, runArgs, err);
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidXRpbC5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uL3NyYy91dGlsLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7Ozs7Ozs7Ozs7QUFRQSwrQkFBOEM7QUFDOUMsK0JBQThDO0FBQzlDLDZCQUE0QjtBQUM1Qix5QkFBd0I7QUFDeEIsb0NBQW1DO0FBQ25DLDJCQUF3QjtBQUN4QiwyREFBOEU7QUFJdEUsNkJBSkEsdUNBQWtCLENBSUE7QUFBRSxxQkFKQSwrQkFBVSxDQUlBO0FBQUUsc0JBSkEsZ0NBQVcsQ0FJQTtBQUVuRCxJQUFJLFFBQVEsR0FBbUQsRUFBRSxDQUFBO0FBQ2pFLE1BQU0sT0FBTyxHQUFHLEtBQUssQ0FBQTtBQUVyQixpQkFBa0IsR0FBRyxRQUFrQjtJQUNyQyxNQUFNLEVBQUUsR0FBRyxJQUFJLENBQUMsR0FBRyxFQUFFLENBQUE7SUFDckIsUUFBUSxDQUFDLElBQUksQ0FBQztRQUNaLFNBQVMsRUFBRSxFQUFFO1FBQ2IsUUFBUTtLQUNULENBQUMsQ0FBQTtJQUNGLFFBQVEsR0FBRyxRQUFRLENBQUMsTUFBTSxDQUFDLENBQUMsRUFBQyxTQUFTLEVBQUMsS0FBSyxDQUFDLEVBQUUsR0FBRyxTQUFTLENBQUMsR0FBRyxPQUFPLENBQUMsQ0FBQTtBQUN6RSxDQUFDO0FBRUQsa0JBQW1CLEVBQVk7SUFDN0IsTUFBTSxHQUFHLEdBQUcsSUFBSSxHQUFHLENBQUMsRUFBRSxDQUFDLENBQUE7SUFDdkIsTUFBTSxDQUFDLEtBQUssQ0FBQyxJQUFJLENBQUMsR0FBRyxDQUFDLENBQUMsSUFBSSxDQUFDLGdCQUFTLENBQUMsQ0FBQTtBQUN4QyxDQUFDO0FBRVksUUFBQSxHQUFHLEdBQUcsR0FBRyxRQUFHLE9BQU8sUUFBRyxFQUFFLENBQUE7QUFFckMsZUFBdUIsR0FBRyxRQUFlO0lBQ3ZDLEVBQUUsQ0FBQyxDQUFDLElBQUksQ0FBQyxNQUFNLENBQUMsR0FBRyxDQUFDLHVCQUF1QixDQUFDLENBQUMsQ0FBQyxDQUFDO1FBRTdDLE9B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R0FBRyxTQUFTLENBQUMsU0FBUyxDQUFDLEdBQUcsQ0FBQyxDQUFBO0lBQ3hDLElBQUksQ0FBQyxJQUFJLEdBQUcsU0FBUyxDQUFBO0lBQ3JCLElBQUksQ0FBQyxhQUFhLENBQUMsYUFBYSxDQUM5QjsyQ0FDdUMsSUFBSSxDQUFDLEdBQUcsQ0FBQyxJQUFJLEVBQUUsRUFDdEQ7UUFDRSxNQUFNLEVBQUU7YUFDRCxJQUFJLENBQUMsR0FBRyxDQUFDLElBQUk7RUFDeEIsSUFBSSxDQUFDLEdBQUcsQ0FBQyxPQUFPOztFQUVoQixJQUFJLENBQUMsU0FBUyxDQUFDLElBQUksRUFBRSxTQUFTLEVBQUUsQ0FBQyxDQUFDOztFQUVsQyxJQUFJLENBQUMsU0FBUyxDQUFDLFNBQVMsQ0FBQyxPQUFPLENBQUMsR0FBRyxDQUFDLEVBQUUsU0FBUyxFQUFFLENBQUMsQ0FBQztDQUNyRDtRQUNLLEtBQUssRUFBRSxJQUFJLENBQUMsR0FBRyxDQUFDLEtBQUs7UUFDckIsV0FBVyxFQUFFLElBQUk7S0FDbEIsQ0FDRixDQUFBO0FBQ0gsQ0FBQztBQXBCRCwwQ0FvQkMiLCJzb3VyY2VzQ29udGVudCI6WyIvKlxuICogZGVjYWZmZWluYXRlIHN1Z2dlc3Rpb25zOlxuICogRFMxMDI6IFJlbW92ZSB1bm5lY2Vzc2FyeSBjb2RlIGNyZWF0ZWQgYmVjYXVzZSBvZiBpbXBsaWNpdCByZXR1cm5zXG4gKiBEUzIwMTogU2ltcGxpZnkgY29tcGxleCBkZXN0cnVjdHVyZSBhc3NpZ25tZW50c1xuICogRFMyMDc6IENvbnNpZGVyIHNob3J0ZXIgdmFyaWF0aW9ucyBvZiBudWxsIGNoZWNrc1xuICogRFMyMDg6IEF2b2lkIHRvcC1sZXZlbCB0aGlzXG4gKiBGdWxsIGRvY3M6IGh0dHBzOi8vZ2l0aHViLmNvbS9kZWNhZmZlaW5hdGUvZGVjYWZmZWluYXRlL2Jsb2IvbWFzdGVyL2RvY3Mvc3VnZ2VzdGlvbnMubWRcbiAqL1xuaW1wb3J0IHsgUmFuZ2UsIFBvaW50LCBEaXJlY3RvcnkgfSBmcm9tICdhdG9tJ1xuaW1wb3J0IHsgZGVsaW1pdGVyLCBzZXAsIGV4dG5hbWUgfSBmcm9tICdwYXRoJ1xuaW1wb3J0ICogYXMgVGVtcCBmcm9tICd0ZW1wJ1xuaW1wb3J0ICogYXMgRlMgZnJvbSAnZnMnXG5pbXBvcnQgKiBhcyBDUCBmcm9tICdjaGlsZF9wcm9jZXNzJ1xuaW1wb3J0IHsgRU9MIH0gZnJvbSAnb3MnXG5pbXBvcnQge2dldFJvb3REaXJGYWxsYmFjaywgZ2V0Um9vdERpciwgaXNEaXJlY3Rvcnl9IGZyb20gJ2F0b20taGFza2VsbC11dGlscydcbmltcG9ydCB7IFJ1bk9wdGlvbnMsIElFcnJvckNhbGxiYWNrQXJncyB9IGZyb20gJy4vZ2hjLW1vZC9naGMtbW9kaS1wcm9jZXNzLXJlYWwnXG5cbnR5cGUgRXhlY09wdHMgPSBDUC5FeGVjRmlsZU9wdGlvbnNXaXRoU3RyaW5nRW5jb2RpbmdcbmV4cG9ydCB7Z2V0Um9vdERpckZhbGxiYWNrLCBnZXRSb290RGlyLCBpc0RpcmVjdG9yeSwgRXhlY09wdHN9XG5cbmxldCBkZWJ1Z2xvZzogQXJyYXk8e3RpbWVzdGFtcDogbnVtYmVyLCBtZXNzYWdlczogc3RyaW5nW119PiA9IFtdXG5jb25zdCBsb2dLZWVwID0gMzAwMDAgLy8gbXNcblxuZnVuY3Rpb24gc2F2ZWxvZyAoLi4ubWVzc2FnZXM6IHN0cmluZ1tdKSB7XG4gIGNvbnN0IHRzID0gRGF0ZS5ub3coKVxuICBkZWJ1Z2xvZy5wdXNoKHtcbiAgICB0aW1lc3RhbXA6IHRzLFxuICAgIG1lc3NhZ2VzXG4gIH0pXG4gIGRlYnVnbG9nID0gZGVidWdsb2cuZmlsdGVyKCh7dGltZXN0YW1wfSkgPT4gKHRzIC0gdGltZXN0YW1wKSA8IGxvZ0tlZXApXG59XG5cbmZ1bmN0aW9uIGpvaW5QYXRoIChkczogc3RyaW5nW10pIHtcbiAgY29uc3Qgc2V0ID0gbmV3IFNldChkcylcbiAgcmV0dXJuIEFycmF5LmZyb20oc2V0KS5qb2luKGRlbGltaXRlcilcbn1cblxuZXhwb3J0IGNvbnN0IEVPVCA9IGAke0VPTH1cXHgwNCR7RU9MfWBcblxuZXhwb3J0IGZ1bmN0aW9uIGRlYnVnICguLi5tZXNzYWdlczogYW55W10pIHtcbiAgaWYgKGF0b20uY29uZmlnLmdldCgnaGFza2VsbC1naGMtbW9kLmRlYnVnJykpIHtcbiAgICAvLyB0c2xpbnQ6ZGlzYWJsZS1uZXh0LWxpbmU6IG5vLWNvbnNvbGVcbiAgICBjb25zb2xlLmxvZygnaGFza2VsbC1naGMtbW9kIGRlYnVnOicsIC4uLm1lc3NhZ2VzKVxuICB9XG4gIHNhdmVsb2coLi4ubWVzc2FnZXMubWFwKCh2KSA9PiBKU09OLnN0cmluZ2lmeSh2KSkpXG59XG5cbmV4cG9ydCBmdW5jdGlvbiB3YXJuICguLi5tZXNzYWdlczogYW55W10pIHtcbiAgLy8gdHNsaW50OmRpc2FibGUtbmV4dC1saW5lOiBuby1jb25zb2xlXG4gIGNvbnNvbGUud2FybignaGFza2VsbC1naGMtbW9kIHdhcm5pbmc6JywgLi4ubWVzc2FnZXMpXG4gIHNhdmVsb2coLi4ubWVzc2FnZXMubWFwKCh2KSA9PiBKU09OLnN0cmluZ2lmeSh2KSkpXG59XG5cbmV4cG9ydCBmdW5jdGlvbiBnZXREZWJ1Z0xvZyAoKSB7XG4gIGNvbnN0IHRzID0gRGF0ZS5ub3coKVxuICBkZWJ1Z2xvZyA9IGRlYnVnbG9nLmZpbHRlcigoe3RpbWVzdGFtcH0pID0+ICh0cyAtIHRpbWVzdGFtcCkgPCBsb2dLZWVwKVxuICByZXR1cm4gZGVidWdsb2cubWFwKCh7dGltZXN0YW1wLCBtZXNzYWdlc30pID0+IGAkeyh0aW1lc3RhbXAgLSB0cykgLyAxMDAwfXM6ICR7bWVzc2FnZXMuam9pbignLCcpfWApLmpvaW4oRU9MKVxufVxuXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gZXhlY1Byb21pc2UgKGNtZDogc3RyaW5nLCBhcmdzOiBzdHJpbmdbXSwgb3B0czogRXhlY09wdHMsIHN0ZGluPzogc3RyaW5nKSB7XG4gIHJldHVybiBuZXcgUHJvbWlzZTx7c3Rkb3V0OiBzdHJpbmcsIHN0ZGVycjogc3RyaW5nfT4oKHJlc29sdmUsIHJlamVjdCkgPT4ge1xuICAgIGRlYnVnKGBSdW5uaW5nICR7Y21kfSAke2FyZ3N9IHdpdGggb3B0cyA9IGAsIG9wdHMpXG4gICAgY29uc3QgY2hpbGQgPSBDUC5leGVjRmlsZShjbWQsIGFyZ3MsIG9wdHMsIChlcnJvciwgc3Rkb3V0OiBzdHJpbmcsIHN0ZGVycjogc3RyaW5nKSA9PiB7XG4gICAgICBpZiAoc3RkZXJyLnRyaW0oKS5sZW5ndGggPiAwKSB7IHdhcm4oc3RkZXJyKSB9XG4gICAgICBpZiAoZXJyb3IpIHtcbiAgICAgICAgd2FybihgUnVubmluZyAke2NtZH0gJHthcmdzfSBmYWlsZWQgd2l0aCBgLCBlcnJvcilcbiAgICAgICAgaWYgKHN0ZG91dCkgeyB3YXJuKHN0ZG91dCkgfVxuICAgICAgICBlcnJvci5zdGFjayA9IChuZXcgRXJyb3IoKSkuc3RhY2tcbiAgICAgICAgcmV0dXJuIHJlamVjdChlcnJvcilcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIGRlYnVnKGBHb3QgcmVzcG9uc2UgZnJvbSAke2NtZH0gJHthcmdzfWAsIHtzdGRvdXQsIHN0ZGVycn0pXG4gICAgICAgIHJldHVybiByZXNvbHZlKHtzdGRvdXQsIHN0ZGVycn0pXG4gICAgICB9XG4gICAgfSlcbiAgICBpZiAoc3RkaW4pIHtcbiAgICAgIGRlYnVnKGBzZW5kaW5nIHN0ZGluIHRleHQgdG8gJHtjbWR9ICR7YXJnc31gKVxuICAgICAgcmV0dXJuIGNoaWxkLnN0ZGluLndyaXRlKHN0ZGluKVxuICAgIH1cbiAgfSlcbn1cblxuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIGdldENhYmFsU2FuZGJveCAocm9vdFBhdGg6IHN0cmluZykge1xuICBkZWJ1ZygnTG9va2luZyBmb3IgY2FiYWwgc2FuZGJveC4uLicpXG4gIGNvbnN0IHNiYyA9IGF3YWl0IHBhcnNlU2FuZGJveENvbmZpZyhgJHtyb290UGF0aH0ke3NlcH1jYWJhbC5zYW5kYm94LmNvbmZpZ2ApXG4gIGlmIChzYmMgJiYgc2JjWydpbnN0YWxsLWRpcnMnXSAmJiBzYmNbJ2luc3RhbGwtZGlycyddLmJpbmRpcikge1xuICAgIGNvbnN0IHNhbmRib3ggPSBzYmNbJ2luc3RhbGwtZGlycyddLmJpbmRpclxuICAgIGRlYnVnKCdGb3VuZCBjYWJhbCBzYW5kYm94OiAnLCBzYW5kYm94KVxuICAgIGlmIChpc0RpcmVjdG9yeShzYW5kYm94KSkge1xuICAgICAgcmV0dXJuIHNhbmRib3hcbiAgICB9IGVsc2Uge1xuICAgICAgd2FybignQ2FiYWwgc2FuZGJveCAnLCBzYW5kYm94LCAnIGlzIG5vdCBhIGRpcmVjdG9yeScpXG4gICAgfVxuICB9IGVsc2Uge1xuICAgIHdhcm4oJ05vIGNhYmFsIHNhbmRib3ggZm91bmQnKVxuICB9XG59XG5cbmV4cG9ydCBhc3luYyBmdW5jdGlvbiBnZXRTdGFja1NhbmRib3ggKHJvb3RQYXRoOiBzdHJpbmcgLCBhcGQ6IHN0cmluZ1tdLCBlbnY6IHtba2V5OiBzdHJpbmddOiBzdHJpbmcgfCB1bmRlZmluZWR9KSB7XG4gIGRlYnVnKCdMb29raW5nIGZvciBzdGFjayBzYW5kYm94Li4uJylcbiAgZW52LlBBVEggPSBqb2luUGF0aChhcGQpXG4gIGRlYnVnKCdSdW5uaW5nIHN0YWNrIHdpdGggUEFUSCAnLCBlbnYuUEFUSClcbiAgdHJ5IHtcbiAgICBjb25zdCBvdXQgPSBhd2FpdCBleGVjUHJvbWlzZSgnc3RhY2snLCBbJ3BhdGgnLCAnLS1zbmFwc2hvdC1pbnN0YWxsLXJvb3QnLCAnLS1sb2NhbC1pbnN0YWxsLXJvb3QnLCAnLS1iaW4tcGF0aCddLCB7XG4gICAgICBlbmNvZGluZzogJ3V0ZjgnLFxuICAgICAgY3dkOiByb290UGF0aCxcbiAgICAgIGVudixcbiAgICAgIHRpbWVvdXQ6IGF0b20uY29uZmlnLmdldCgnaGFza2VsbC1naGMtbW9kLmluaXRUaW1lb3V0JykgKiAxMDAwXG4gICAgfSlcblxuICAgIGNvbnN0IGxpbmVzID0gb3V0LnN0ZG91dC5zcGxpdChFT0wpXG4gICAgY29uc3Qgc2lyID0gbGluZXMuZmlsdGVyKChsKSA9PiBsLnN0YXJ0c1dpdGgoJ3NuYXBzaG90LWluc3RhbGwtcm9vdDogJykpWzBdLnNsaWNlKDIzKSArIGAke3NlcH1iaW5gXG4gICAgY29uc3QgbGlyID0gbGluZXMuZmlsdGVyKChsKSA9PiBsLnN0YXJ0c1dpdGgoJ2xvY2FsLWluc3RhbGwtcm9vdDogJykpWzBdLnNsaWNlKDIwKSArIGAke3NlcH1iaW5gXG4gICAgY29uc3QgYnAgPVxuICAgICAgbGluZXMuZmlsdGVyKChsKSA9PlxuICAgICAgICBsLnN0YXJ0c1dpdGgoJ2Jpbi1wYXRoOiAnKSlbMF0uc2xpY2UoMTApLnNwbGl0KGRlbGltaXRlcikuZmlsdGVyKChwKSA9PlxuICAgICAgICAgICEoKHAgPT09IHNpcikgfHwgKHAgPT09IGxpcikgfHwgKGFwZC5pbmNsdWRlcyhwKSkpKVxuICAgIGRlYnVnKCdGb3VuZCBzdGFjayBzYW5kYm94ICcsIGxpciwgc2lyLCAuLi5icClcbiAgICByZXR1cm4gW2xpciwgc2lyLCAuLi5icF1cbiAgfSBjYXRjaCAoZXJyKSB7XG4gICAgd2FybignTm8gc3RhY2sgc2FuZGJveCBmb3VuZCBiZWNhdXNlICcsIGVycilcbiAgfVxufVxuXG5jb25zdCBwcm9jZXNzT3B0aW9uc0NhY2hlID0gbmV3IE1hcDxzdHJpbmcsIFJ1bk9wdGlvbnM+KClcblxuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIGdldFByb2Nlc3NPcHRpb25zIChyb290UGF0aD86IHN0cmluZyk6IFByb21pc2U8UnVuT3B0aW9ucz4ge1xuICBpZiAoISByb290UGF0aCkge1xuICAgIC8vIHRzbGludDpkaXNhYmxlLW5leHQtbGluZTogbm8tbnVsbC1rZXl3b3JkXG4gICAgcm9vdFBhdGggPSBnZXRSb290RGlyRmFsbGJhY2sobnVsbCkuZ2V0UGF0aCgpXG4gIH1cbiAgLy8gY2FjaGVcbiAgY29uc3QgY2FjaGVkID0gcHJvY2Vzc09wdGlvbnNDYWNoZS5nZXQocm9vdFBhdGgpXG4gIGlmIChjYWNoZWQpIHtcbiAgICByZXR1cm4gY2FjaGVkXG4gIH1cblxuICBkZWJ1ZyhgZ2V0UHJvY2Vzc09wdGlvbnMoJHtyb290UGF0aH0pYClcbiAgY29uc3QgZW52ID0gey4uLnByb2Nlc3MuZW52fVxuXG4gIGlmIChwcm9jZXNzLnBsYXRmb3JtID09PSAnd2luMzInKSB7XG4gICAgY29uc3QgUEFUSCA9IFtdXG4gICAgY29uc3QgY2FwTWFzayA9IChzdHI6IHN0cmluZywgbWFzazogbnVtYmVyKSA9PiB7XG4gICAgICBjb25zdCBhID0gc3RyLnNwbGl0KCcnKVxuICAgICAgZm9yIChsZXQgaSA9IDA7IGkgPCBhLmxlbmd0aDsgaSsrKSB7XG4gICAgICAgIGNvbnN0IGMgPSBhW2ldXG4gICAgICAgIC8vIHRzbGludDpkaXNhYmxlLW5leHQtbGluZTogbm8tYml0d2lzZVxuICAgICAgICBpZiAobWFzayAmIE1hdGgucG93KDIsIGkpKSB7XG4gICAgICAgICAgYVtpXSA9IGFbaV0udG9VcHBlckNhc2UoKVxuICAgICAgICB9XG4gICAgICB9XG4gICAgICByZXR1cm4gYS5qb2luKCcnKVxuICAgIH1cbiAgICBmb3IgKGxldCBtID0gMGIxMTExOyBtID49IDA7IG0tLSkge1xuICAgICAgY29uc3Qgdm4gPSBjYXBNYXNrKCdwYXRoJywgbSlcbiAgICAgIGlmIChlbnZbdm5dKSB7XG4gICAgICAgIFBBVEgucHVzaChlbnZbdm5dKVxuICAgICAgfVxuICAgIH1cbiAgICBlbnYuUEFUSCA9IFBBVEguam9pbihkZWxpbWl0ZXIpXG4gIH1cblxuICBjb25zdCBQQVRIID0gZW52LlBBVEggfHwgJydcblxuICBjb25zdCBhcGQgPSBhdG9tLmNvbmZpZy5nZXQoJ2hhc2tlbGwtZ2hjLW1vZC5hZGRpdGlvbmFsUGF0aERpcmVjdG9yaWVzJykuY29uY2F0KFBBVEguc3BsaXQoZGVsaW1pdGVyKSlcbiAgY29uc3Qgc2JkID0gZmFsc2VcbiAgY29uc3QgY2FiYWxTYW5kYm94ID1cbiAgICBhdG9tLmNvbmZpZy5nZXQoJ2hhc2tlbGwtZ2hjLW1vZC5jYWJhbFNhbmRib3gnKSA/IGdldENhYmFsU2FuZGJveChyb290UGF0aCkgOiBQcm9taXNlLnJlc29sdmUoKSAvLyB1bmRlZmluZWRcbiAgY29uc3Qgc3RhY2tTYW5kYm94ID1cbiAgICBhdG9tLmNvbmZpZy5nZXQoJ2hhc2tlbGwtZ2hjLW1vZC5zdGFja1NhbmRib3gnKSA/IGdldFN0YWNrU2FuZGJveChyb290UGF0aCwgYXBkLCB7Li4uZW52fSkgOiBQcm9taXNlLnJlc29sdmUoKVxuICBjb25zdCBbY2FiYWxTYW5kYm94RGlyLCBzdGFja1NhbmRib3hEaXJzXSA9IGF3YWl0IFByb21pc2UuYWxsKFtjYWJhbFNhbmRib3gsIHN0YWNrU2FuZGJveF0pXG4gIGNvbnN0IG5ld3AgPSBbXVxuICBpZiAoY2FiYWxTYW5kYm94RGlyKSB7XG4gICAgbmV3cC5wdXNoKGNhYmFsU2FuZGJveERpcilcbiAgfVxuICBpZiAoc3RhY2tTYW5kYm94RGlycykge1xuICAgIG5ld3AucHVzaCguLi5zdGFja1NhbmRib3hEaXJzKVxuICB9XG4gIG5ld3AucHVzaCguLi5hcGQpXG4gIGVudi5QQVRIID0gam9pblBhdGgobmV3cClcbiAgZGVidWcoYFBBVEggPSAke2Vudi5QQVRIfWApXG4gIGNvbnN0IHJlczogUnVuT3B0aW9ucyA9IHtcbiAgICBjd2Q6IHJvb3RQYXRoLFxuICAgIGVudixcbiAgICBlbmNvZGluZzogJ3V0ZjgnLFxuICAgIG1heEJ1ZmZlcjogSW5maW5pdHlcbiAgfVxuICBwcm9jZXNzT3B0aW9uc0NhY2hlLnNldChyb290UGF0aCwgcmVzKVxuICByZXR1cm4gcmVzXG59XG5cbmV4cG9ydCBmdW5jdGlvbiBnZXRTeW1ib2xBdFBvaW50IChlZGl0b3I6IEF0b21UeXBlcy5UZXh0RWRpdG9yLCBwb2ludDogQXRvbVR5cGVzLlBvaW50KSB7XG4gIGxldCByYW5nZSwgc3ltYm9sXG4gIGNvbnN0IGluU2NvcGUgPSAoc2NvcGU6IHN0cmluZywgcG9pbnQyOiBBdG9tVHlwZXMuSVBvaW50KSA9PlxuICAgIGVkaXRvci5zY29wZURlc2NyaXB0b3JGb3JCdWZmZXJQb3NpdGlvbihwb2ludDIpLmdldFNjb3Blc0FycmF5KCkuc29tZSgodikgPT4gdiA9PT0gc2NvcGUpXG5cbiAgY29uc3QgdGIgPSBlZGl0b3IuZ2V0QnVmZmVyKClcbiAgY29uc3QgbGluZSA9IHRiLnJhbmdlRm9yUm93KHBvaW50LnJvdylcbiAgY29uc3QgZmluZCA9ICh0ZXN0OiAocG9pbnQ6IEF0b21UeXBlcy5Qb2ludCkgPT4gYm9vbGVhbikgPT4ge1xuICAgIGxldCBlbmQgPSBwb2ludFxuICAgIGxldCBzdGFydCA9IHBvaW50XG4gICAgbGV0IHN0YXJ0MiA9IHN0YXJ0LnRyYW5zbGF0ZShbMCwgLTFdKVxuICAgIHdoaWxlICh0ZXN0KHN0YXJ0MikgJiYgc3RhcnQyLmlzR3JlYXRlclRoYW5PckVxdWFsKGxpbmUuc3RhcnQpKSB7XG4gICAgICBzdGFydCA9IHN0YXJ0MlxuICAgICAgc3RhcnQyID0gc3RhcnQudHJhbnNsYXRlKFswLCAtMV0pXG4gICAgfVxuICAgIHdoaWxlICh0ZXN0KGVuZCkgJiYgZW5kLmlzTGVzc1RoYW4obGluZS5lbmQpKSB7XG4gICAgICBlbmQgPSBlbmQudHJhbnNsYXRlKFswLCAxXSlcbiAgICB9XG4gICAgcmV0dXJuIG5ldyBSYW5nZShzdGFydCwgZW5kKVxuICB9XG5cbiAgY29uc3QgcmVnZXggPSAvW1xcdycuXS9cbiAgY29uc3Qgc2NvcGVzID0gW1xuICAgICdrZXl3b3JkLm9wZXJhdG9yLmhhc2tlbGwnLFxuICAgICdlbnRpdHkubmFtZS5mdW5jdGlvbi5pbmZpeC5oYXNrZWxsJ1xuICBdXG4gIGZvciAoY29uc3Qgc2NvcGUgb2Ygc2NvcGVzKSB7XG4gICAgcmFuZ2UgPSBmaW5kKChwKSA9PiBpblNjb3BlKHNjb3BlLCBwKSlcbiAgICBpZiAoIXJhbmdlLmlzRW1wdHkoKSkge1xuICAgICAgc3ltYm9sID0gdGIuZ2V0VGV4dEluUmFuZ2UocmFuZ2UpXG4gICAgICByZXR1cm4ge3Njb3BlLCByYW5nZSwgc3ltYm9sfVxuICAgIH1cbiAgfVxuXG4gIC8vIGVsc2VcbiAgLy8gdHNsaW50OmRpc2FibGUtbmV4dC1saW5lOiBuby1udWxsLWtleXdvcmRcbiAgcmFuZ2UgPSBmaW5kKChwKSA9PiB0Yi5nZXRUZXh0SW5SYW5nZShbcCwgcC50cmFuc2xhdGUoWzAsIDFdKV0pLm1hdGNoKHJlZ2V4KSAhPT0gbnVsbClcbiAgc3ltYm9sID0gdGIuZ2V0VGV4dEluUmFuZ2UocmFuZ2UpXG4gIHJldHVybiB7c2NvcGU6IHVuZGVmaW5lZCwgcmFuZ2UsIHN5bWJvbH1cbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGdldFN5bWJvbEluUmFuZ2UgKGVkaXRvcjogQXRvbVR5cGVzLlRleHRFZGl0b3IsIGNyYW5nZTogQXRvbVR5cGVzLlJhbmdlKSB7XG4gIGNvbnN0IGJ1ZmZlciA9IGVkaXRvci5nZXRCdWZmZXIoKVxuICBpZiAoY3JhbmdlLmlzRW1wdHkoKSkge1xuICAgIHJldHVybiBnZXRTeW1ib2xBdFBvaW50KGVkaXRvciwgY3JhbmdlLnN0YXJ0KVxuICB9IGVsc2Uge1xuICAgIHJldHVybiB7XG4gICAgICBzeW1ib2w6IGJ1ZmZlci5nZXRUZXh0SW5SYW5nZShjcmFuZ2UpLFxuICAgICAgcmFuZ2U6IGNyYW5nZVxuICAgIH1cbiAgfVxufVxuXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gd2l0aFRlbXBGaWxlPFQ+IChjb250ZW50czogc3RyaW5nLCB1cmk6IHN0cmluZywgZ2VuOiAocGF0aDogc3RyaW5nKSA9PiBQcm9taXNlPFQ+KTogUHJvbWlzZTxUPiB7XG4gIGNvbnN0IGluZm8gPSBhd2FpdCBuZXcgUHJvbWlzZTxUZW1wLk9wZW5GaWxlPihcbiAgICAocmVzb2x2ZSwgcmVqZWN0KSA9PlxuICAgIFRlbXAub3BlbihcbiAgICAgIHtwcmVmaXg6ICdoYXNrZWxsLWdoYy1tb2QnLCBzdWZmaXg6IGV4dG5hbWUodXJpIHx8ICcuaHMnKX0sXG4gICAgICAoZXJyLCBpbmZvMikgPT4ge1xuICAgICAgICBpZiAoZXJyKSB7XG4gICAgICAgICAgcmVqZWN0KGVycilcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICByZXNvbHZlKGluZm8yKVxuICAgICAgICB9XG4gICAgfSkpXG4gIHJldHVybiBuZXcgUHJvbWlzZTxUPigocmVzb2x2ZSwgcmVqZWN0KSA9PlxuICAgIEZTLndyaXRlKGluZm8uZmQsIGNvbnRlbnRzLCBhc3luYyAoZXJyKSA9PiB7XG4gICAgICBpZiAoZXJyKSB7XG4gICAgICAgIHJlamVjdChlcnIpXG4gICAgICB9IGVsc2Uge1xuICAgICAgICBjb25zdCByZXMgPSBhd2FpdCBnZW4oaW5mby5wYXRoKVxuICAgICAgICBGUy5jbG9zZShpbmZvLmZkLCAoKSA9PiBGUy51bmxpbmsoaW5mby5wYXRoLCAoKSA9PiB7IC8qbm9vcCovIH0pKVxuICAgICAgICByZXR1cm4gcmVzXG4gICAgICB9XG4gICAgfSkpXG59XG5cbmV4cG9ydCB0eXBlIEtub3duRXJyb3JOYW1lID1cbiAgICAnR0hDTW9kU3Rkb3V0RXJyb3InXG4gIHwgJ0ludGVyYWN0aXZlQWN0aW9uVGltZW91dCdcbiAgfCAnR0hDTW9kSW50ZXJhY3RpdmVDcmFzaCdcblxuZXhwb3J0IGZ1bmN0aW9uIG1rRXJyb3IgKG5hbWU6IEtub3duRXJyb3JOYW1lLCBtZXNzYWdlOiBzdHJpbmcpIHtcbiAgY29uc3QgZXJyID0gbmV3IEVycm9yKG1lc3NhZ2UpXG4gIGVyci5uYW1lID0gbmFtZVxuICByZXR1cm4gZXJyXG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgU2FuZGJveENvbmZpZ1RyZWUge1trOiBzdHJpbmddOiBTYW5kYm94Q29uZmlnVHJlZSB8IHN0cmluZ31cblxuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIHBhcnNlU2FuZGJveENvbmZpZyAoZmlsZTogc3RyaW5nKSB7XG4gIHRyeSB7XG4gICAgY29uc3Qgc2JjID0gYXdhaXQgbmV3IFByb21pc2U8c3RyaW5nPigocmVzb2x2ZSwgcmVqZWN0KSA9PlxuICAgICAgRlMucmVhZEZpbGUoZmlsZSwge2VuY29kaW5nOiAndXRmLTgnfSwgKGVyciwgc2JjMikgPT4ge1xuICAgICAgICBpZiAoZXJyKSB7XG4gICAgICAgICAgcmVqZWN0KGVycilcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICByZXNvbHZlKHNiYzIpXG4gICAgICAgIH1cbiAgICAgIH0pKVxuICAgIGNvbnN0IHZhcnM6IFNhbmRib3hDb25maWdUcmVlID0ge31cbiAgICBsZXQgc2NvcGUgPSB2YXJzXG4gICAgY29uc3QgcnYgPSAodjogc3RyaW5nKSA9PiB7XG4gICAgICBmb3IgKGNvbnN0IGsxIG9mIE9iamVjdC5rZXlzKHNjb3BlKSkge1xuICAgICAgICBjb25zdCB2MSA9IHNjb3BlW2sxXVxuICAgICAgICBpZiAodHlwZW9mIHYxID09PSAnc3RyaW5nJykge1xuICAgICAgICAgIHYgPSB2LnNwbGl0KGAkJHtrMX1gKS5qb2luKHYxKVxuICAgICAgICB9XG4gICAgICB9XG4gICAgICByZXR1cm4gdlxuICAgIH1cbiAgICBmb3IgKGNvbnN0IGxpbmUgb2Ygc2JjLnNwbGl0KC9cXHI/XFxufFxcci8pKSB7XG4gICAgICBpZiAoIWxpbmUubWF0Y2goL15cXHMqLS0vKSAmJiAhbGluZS5tYXRjaCgvXlxccyokLykpIHtcbiAgICAgICAgY29uc3QgW2xdID0gbGluZS5zcGxpdCgvLS0vKVxuICAgICAgICBjb25zdCBtID0gbGluZS5tYXRjaCgvXlxccyooW1xcdy1dKyk6XFxzKiguKilcXHMqJC8pXG4gICAgICAgIGlmIChtKSB7XG4gICAgICAgICAgY29uc3QgW18sIG5hbWUsIHZhbF0gPSBtXG4gICAgICAgICAgcmV0dXJuIHNjb3BlW25hbWVdID0gcnYodmFsKVxuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIGNvbnN0IG5ld3Njb3BlID0ge31cbiAgICAgICAgICBzY29wZVtsaW5lXSA9IG5ld3Njb3BlXG4gICAgICAgICAgcmV0dXJuIHNjb3BlID0gbmV3c2NvcGVcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH1cbiAgICByZXR1cm4gdmFyc1xuICB9IGNhdGNoIChlcnIpIHtcbiAgICB3YXJuKCdSZWFkaW5nIGNhYmFsIHNhbmRib3ggY29uZmlnIGZhaWxlZCB3aXRoICcsIGVycilcbiAgfVxufVxuXG4vLyBBIGRpcnR5IGhhY2sgdG8gd29yayB3aXRoIHRhYnNcbmV4cG9ydCBmdW5jdGlvbiB0YWJTaGlmdEZvclBvaW50IChidWZmZXI6IEF0b21UeXBlcy5UZXh0QnVmZmVyLCBwb2ludDogQXRvbVR5cGVzLlBvaW50KSB7XG4gIGNvbnN0IGxpbmUgPSBidWZmZXIubGluZUZvclJvdyhwb2ludC5yb3cpXG4gIGNvbnN0IG1hdGNoID0gbGluZSA/IChsaW5lLnNsaWNlKDAsIHBvaW50LmNvbHVtbikubWF0Y2goL1xcdC9nKSB8fCBbXSkgOiBbXVxuICBjb25zdCBjb2x1bW5TaGlmdCA9IDcgKiBtYXRjaC5sZW5ndGhcbiAgcmV0dXJuIG5ldyBQb2ludChwb2ludC5yb3csIHBvaW50LmNvbHVtbiArIGNvbHVtblNoaWZ0KVxufVxuXG5leHBvcnQgZnVuY3Rpb24gdGFiU2hpZnRGb3JSYW5nZSAoYnVmZmVyOiBBdG9tVHlwZXMuVGV4dEJ1ZmZlciwgcmFuZ2U6IEF0b21UeXBlcy5SYW5nZSkge1xuICBjb25zdCBzdGFydCA9IHRhYlNoaWZ0Rm9yUG9pbnQoYnVmZmVyLCByYW5nZS5zdGFydClcbiAgY29uc3QgZW5kID0gdGFiU2hpZnRGb3JQb2ludChidWZmZXIsIHJhbmdlLmVuZClcbiAgcmV0dXJuIG5ldyBSYW5nZShzdGFydCwgZW5kKVxufVxuXG5leHBvcnQgZnVuY3Rpb24gdGFiVW5zaGlmdEZvclBvaW50IChidWZmZXI6IEF0b21UeXBlcy5UZXh0QnVmZmVyLCBwb2ludDogQXRvbVR5cGVzLlBvaW50KSB7XG4gIGNvbnN0IGxpbmUgPSBidWZmZXIubGluZUZvclJvdyhwb2ludC5yb3cpXG4gIGxldCBjb2x1bW5sID0gMFxuICBsZXQgY29sdW1uciA9IHBvaW50LmNvbHVtblxuICB3aGlsZSAoY29sdW1ubCA8IGNvbHVtbnIpIHtcbiAgICAvLyB0c2xpbnQ6ZGlzYWJsZS1uZXh0LWxpbmU6IHN0cmljdC10eXBlLXByZWRpY2F0ZXNcbiAgICBpZiAoKGxpbmUgPT09IHVuZGVmaW5lZCkgfHwgKGxpbmVbY29sdW1ubF0gPT09IHVuZGVmaW5lZCkpIHsgYnJlYWsgfVxuICAgIGlmIChsaW5lW2NvbHVtbmxdID09PSAnXFx0Jykge1xuICAgICAgY29sdW1uciAtPSA3XG4gICAgfVxuICAgIGNvbHVtbmwgKz0gMVxuICB9XG4gIHJldHVybiBuZXcgUG9pbnQocG9pbnQucm93LCBjb2x1bW5yKVxufVxuXG5leHBvcnQgZnVuY3Rpb24gdGFiVW5zaGlmdEZvclJhbmdlIChidWZmZXI6IEF0b21UeXBlcy5UZXh0QnVmZmVyLCByYW5nZTogQXRvbVR5cGVzLlJhbmdlKSB7XG4gIGNvbnN0IHN0YXJ0ID0gdGFiVW5zaGlmdEZvclBvaW50KGJ1ZmZlciwgcmFuZ2Uuc3RhcnQpXG4gIGNvbnN0IGVuZCA9IHRhYlVuc2hpZnRGb3JQb2ludChidWZmZXIsIHJhbmdlLmVuZClcbiAgcmV0dXJuIG5ldyBSYW5nZShzdGFydCwgZW5kKVxufVxuXG5leHBvcnQgZnVuY3Rpb24gaXNVcHBlckNhc2UgKGNoOiBzdHJpbmcpOiBib29sZWFuIHtcbiAgcmV0dXJuIGNoLnRvVXBwZXJDYXNlKCkgPT09IGNoXG59XG5cbmV4cG9ydCBmdW5jdGlvbiBnZXRFcnJvckRldGFpbCAoe2VyciwgcnVuQXJncywgY2Fwc306IElFcnJvckNhbGxiYWNrQXJncykge1xuICByZXR1cm4gYGNhcHM6XG4ke0pTT04uc3RyaW5naWZ5KGNhcHMsIHVuZGVmaW5lZCwgMil9XG5BcmdzOlxuJHtKU09OLnN0cmluZ2lmeShydW5BcmdzLCB1bmRlZmluZWQsIDIpfVxubWVzc2FnZTpcbiR7ZXJyLm1lc3NhZ2V9XG5sb2c6XG4ke2dldERlYnVnTG9nKCl9YFxufVxuXG5leHBvcnQgZnVuY3Rpb24gZm9ybWF0RXJyb3IgKHtlcnIsIHJ1bkFyZ3MsIGNhcHN9OiBJRXJyb3JDYWxsYmFja0FyZ3MpIHtcbiAgaWYgKGVyci5uYW1lID09PSAnSW50ZXJhY3RpdmVBY3Rpb25UaW1lb3V0JyAmJiBydW5BcmdzKSB7XG4gICAgICByZXR1cm4gYFxcXG5IYXNrZWxsLWdoYy1tb2Q6IGdoYy1tb2QgXFxcbiR7cnVuQXJncy5pbnRlcmFjdGl2ZSA/ICdpbnRlcmFjdGl2ZSAnIDogJyd9Y29tbWFuZCAke3J1bkFyZ3MuY29tbWFuZH0gXFxcbnRpbWVkIG91dC4gWW91IGNhbiB0cnkgdG8gZml4IGl0IGJ5IHJhaXNpbmcgJ0ludGVyYWN0aXZlIEFjdGlvbiBcXFxuVGltZW91dCcgc2V0dGluZyBpbiBoYXNrZWxsLWdoYy1tb2Qgc2V0dGluZ3MuYFxuICB9IGVsc2UgaWYgKHJ1bkFyZ3MpIHtcbiAgICByZXR1cm4gYFxcXG5IYXNrZWxsLWdoYy1tb2Q6IGdoYy1tb2QgXFxcbiR7cnVuQXJncy5pbnRlcmFjdGl2ZSA/ICdpbnRlcmFjdGl2ZSAnIDogJyd9Y29tbWFuZCAke3J1bkFyZ3MuY29tbWFuZH0gXFxcbmZhaWxlZCB3aXRoIGVycm9yICR7ZXJyLm5hbWV9YFxuICB9IGVsc2Uge1xuICAgIHJldHVybiBgVGhlcmUgd2FzIGFuIHVuZXhwZWN0ZWQgZXJyb3IgJHtlcnIubmFtZX1gXG4gIH1cbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGRlZmF1bHRFcnJvckhhbmRsZXIgKGFyZ3M6IElFcnJvckNhbGxiYWNrQXJncykge1xuICBjb25zdCB7ZXJyLCBydW5BcmdzLCBjYXBzfSA9IGFyZ3NcbiAgY29uc3Qgc3VwcHJlc3NFcnJvcnMgPSBydW5BcmdzICYmIHJ1bkFyZ3Muc3VwcHJlc3NFcnJvcnNcblxuICBpZiAoIXN1cHByZXNzRXJyb3JzKSB7XG4gICAgYXRvbS5ub3RpZmljYXRpb25zLmFkZEVycm9yKFxuICAgICAgZm9ybWF0RXJyb3IoYXJncyksXG4gICAgICB7XG4gICAgICAgIGRldGFpbDogZ2V0RXJyb3JEZXRhaWwoYXJncyksXG4gICAgICAgIHN0YWNrOiBlcnIuc3RhY2ssXG4gICAgICAgIGRpc21pc3NhYmxlOiB0cnVlXG4gICAgICB9XG4gICAgKVxuICB9IGVsc2Uge1xuICAgIC8vIHRzbGludDpkaXNhYmxlLW5leHQtbGluZTogbm8tY29uc29sZVxuICAgIGNvbnNvbGUuZXJyb3IoY2FwcywgcnVuQXJncywgZXJyKVxuICB9XG59XG5cbmV4cG9ydCBmdW5jdGlvbiB3YXJuR0hDUGFja2FnZVBhdGggKCkge1xuICBhdG9tLm5vdGlmaWNhdGlvbnMuYWRkV2FybmluZyhcbiAgICAnaGFza2VsbC1naGMtbW9kOiBZb3UgaGF2ZSBHSENfUEFDS0FHRV9QQVRIIGVudmlyb25tZW50IHZhcmlhYmxlIHNldCEnLFxuICAgIHtcbiAgICAgIGRpc21pc3NhYmxlOiB0cnVlLFxuICAgICAgZGV0YWlsOiBgXFxcblRoaXMgY29uZmlndXJhdGlvbiBpcyBub3Qgc3VwcG9ydGVkLCBhbmQgY2FuIGJyZWFrIGFyYml0cmFyaWx5LiBZb3UgY2FuIHRyeSB0byBiYW5kLWFpZCBpdCBieSBhZGRpbmdcblxuZGVsZXRlIHByb2Nlc3MuZW52LkdIQ19QQUNLQUdFX1BBVEhcblxudG8geW91ciBBdG9tIGluaXQgc2NyaXB0IChFZGl0IOKGkiBJbml0IFNjcmlwdC4uLilcblxuWW91IGNhbiBzdXBwcmVzcyB0aGlzIHdhcm5pbmcgaW4gaGFza2VsbC1naGMtbW9kIHNldHRpbmdzLmBcbiAgICB9XG4gIClcbn1cblxuZnVuY3Rpb24gZmlsdGVyRW52IChlbnY6IHtbbmFtZTogc3RyaW5nXTogc3RyaW5nIHwgdW5kZWZpbmVkfSkge1xuICBjb25zdCBmZW52ID0ge31cbiAgLy8gdHNsaW50OmRpc2FibGUtbmV4dC1saW5lOiBmb3JpblxuICBmb3IgKGNvbnN0IGV2YXIgaW4gZW52KSB7XG4gICAgY29uc3QgZXZhclUgPSBldmFyLnRvVXBwZXJDYXNlKClcbiAgICBpZiAoXG4gICAgICAgICBldmFyVSA9PT0gJ1BBVEgnXG4gICAgICB8fCBldmFyVS5zdGFydHNXaXRoKCdHSENfJylcbiAgICAgIHx8IGV2YXJVLnN0YXJ0c1dpdGgoJ1NUQUNLXycpXG4gICAgICB8fCBldmFyVS5zdGFydHNXaXRoKCdDQUJBTF8nKVxuICAgICkge1xuICAgICAgZmVudltldmFyXSA9IGVudltldmFyXVxuICAgIH1cbiAgfVxuICByZXR1cm4gZmVudlxufVxuXG5leHBvcnQgZnVuY3Rpb24gbm90aWZ5U3Bhd25GYWlsIChhcmdzOiB7ZGlyOiBzdHJpbmcsIGVycjogYW55LCBvcHRzOiBhbnksIHZlcnM6IGFueSwgY2FwczogYW55fSkge1xuICBjb25zdCBvcHRzY2xvbmUgPSBKU09OLnBhcnNlKEpTT04uc3RyaW5naWZ5KGFyZ3Mub3B0cykpXG4gIG9wdHNjbG9uZS5lbnYgPSBmaWx0ZXJFbnYob3B0c2Nsb25lLmVudilcbiAgYXJncy5vcHRzID0gb3B0c2Nsb25lXG4gIGF0b20ubm90aWZpY2F0aW9ucy5hZGRGYXRhbEVycm9yKFxuICAgIGBIYXNrZWxsLWdoYy1tb2Q6IGdoYy1tb2QgZmFpbGVkIHRvIGxhdW5jaC5cbkl0IGlzIHByb2JhYmx5IG1pc3Npbmcgb3IgbWlzY29uZmlndXJlZC4gJHthcmdzLmVyci5jb2RlfWAsXG4gICAge1xuICAgICAgZGV0YWlsOiBgXFxcbkVycm9yIHdhczogJHthcmdzLmVyci5uYW1lfVxuJHthcmdzLmVyci5tZXNzYWdlfVxuRGVidWcgaW5mb3JtYXRpb246XG4ke0pTT04uc3RyaW5naWZ5KGFyZ3MsIHVuZGVmaW5lZCwgMil9XG5FbnZpcm9ubWVudCAoZmlsdGVyZWQpOlxuJHtKU09OLnN0cmluZ2lmeShmaWx0ZXJFbnYocHJvY2Vzcy5lbnYpLCB1bmRlZmluZWQsIDIpfVxuYCxcbiAgICAgIHN0YWNrOiBhcmdzLmVyci5zdGFjayxcbiAgICAgIGRpc21pc3NhYmxlOiB0cnVlXG4gICAgfVxuICApXG59XG4iXX0=