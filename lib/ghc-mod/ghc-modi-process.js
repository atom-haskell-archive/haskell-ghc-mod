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
const Util = require("../util");
const path_1 = require("path");
const Queue = require("promise-queue");
const atom_haskell_utils_1 = require("atom-haskell-utils");
const ghc_modi_process_real_1 = require("./ghc-modi-process-real");
class GhcModiProcess {
    constructor() {
        this.disposables = new atom_1.CompositeDisposable();
        this.emitter = new atom_1.Emitter();
        this.disposables.add(this.emitter);
        this.bufferDirMap = new WeakMap();
        this.backend = new Map();
        if (process.env.GHC_PACKAGE_PATH && !atom.config.get('haskell-ghc-mod.suppressGhcPackagePathWarning')) {
            atom.notifications.addWarning(`\
haskell-ghc-mod: You have GHC_PACKAGE_PATH environment variable set!\
`, {
                dismissable: true,
                detail: `\
This configuration is not supported, and can break arbitrarily. You can try to band-aid it by adding

delete process.env.GHC_PACKAGE_PATH

to your Atom init script (Edit → Init Script...)

You can suppress this warning in haskell-ghc-mod settings.\
`
            });
        }
        this.createQueues();
    }
    getRootDir(buffer) {
        return __awaiter(this, void 0, void 0, function* () {
            let dir;
            dir = this.bufferDirMap.get(buffer);
            if (dir) {
                return dir;
            }
            dir = yield Util.getRootDir(buffer);
            this.bufferDirMap.set(buffer, dir);
            return dir;
        });
    }
    killProcess() {
        for (const bp of this.backend.values()) {
            bp.then((b) => b.killProcess());
        }
        this.backend.clear();
    }
    destroy() {
        for (const bp of this.backend.values()) {
            bp.then((b) => b.destroy());
        }
        this.backend.clear();
        this.emitter.emit('did-destroy');
        this.disposables.dispose();
    }
    onDidDestroy(callback) {
        return this.emitter.on('did-destroy', callback);
    }
    onBackendActive(callback) {
        return this.emitter.on('backend-active', callback);
    }
    onBackendIdle(callback) {
        return this.emitter.on('backend-idle', callback);
    }
    onQueueIdle(callback) {
        return this.emitter.on('queue-idle', callback);
    }
    runList(buffer) {
        return __awaiter(this, void 0, void 0, function* () {
            return this.queueCmd('list', yield this.getRootDir(buffer), { command: 'list' });
        });
    }
    runLang(dir) {
        return __awaiter(this, void 0, void 0, function* () {
            return this.queueCmd('init', dir, { command: 'lang' });
        });
    }
    runFlag(dir) {
        return __awaiter(this, void 0, void 0, function* () {
            return this.queueCmd('init', dir, { command: 'flag' });
        });
    }
    runBrowse(rootDir, modules) {
        return __awaiter(this, void 0, void 0, function* () {
            const lines = yield this.queueCmd('browse', rootDir, {
                command: 'browse',
                dashArgs(caps) {
                    const args = ['-d'];
                    if (caps.browseParents) {
                        args.push('-p');
                    }
                    return args;
                },
                args: modules
            });
            return lines.map((s) => {
                const pattern = this.caps.browseParents ? /^(.*?) :: (.*?)(?: -- from:(.*))?$/ : /^(.*?) :: (.*)$/;
                const match = s.match(pattern);
                let name, typeSignature, parent;
                if (match) {
                    name = match[1];
                    typeSignature = match[2];
                    parent = match[3];
                }
                else {
                    name = s;
                }
                let symbolType;
                if (typeSignature && /^(?:type|data|newtype)/.test(typeSignature)) {
                    symbolType = 'type';
                }
                else if (typeSignature && /^(?:class)/.test(typeSignature)) {
                    symbolType = 'class';
                }
                else {
                    symbolType = 'function';
                }
                return { name, typeSignature, symbolType, parent };
            });
        });
    }
    getTypeInBuffer(buffer, crange) {
        return __awaiter(this, void 0, void 0, function* () {
            if (!buffer.getUri()) {
                throw new Error('No URI for buffer');
            }
            crange = Util.tabShiftForRange(buffer, crange);
            const lines = yield this.queueCmd('typeinfo', yield this.getRootDir(buffer), {
                interactive: true,
                command: 'type',
                uri: buffer.getUri(),
                text: buffer.isModified() ? buffer.getText() : undefined,
                dashArgs(caps) {
                    return caps.typeConstraints ? ['-c'] : [];
                },
                args: [crange.start.row + 1, crange.start.column + 1].map((v) => v.toString())
            });
            const rx = /^(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+"([^]*)"$/;
            for (const line of lines) {
                const match = line.match(rx);
                if (!match) {
                    continue;
                }
                const [rowstart, colstart, rowend, colend, type] = match.slice(1);
                const range = atom_1.Range.fromObject([
                    [parseInt(rowstart, 10) - 1, parseInt(colstart, 10) - 1],
                    [parseInt(rowend, 10) - 1, parseInt(colend, 10) - 1]
                ]);
                if (range.isEmpty()) {
                    continue;
                }
                if (!range.containsRange(crange)) {
                    continue;
                }
                return {
                    range: Util.tabUnshiftForRange(buffer, range),
                    type: type.replace(/\\"/g, '"')
                };
            }
            throw new Error('No type');
        });
    }
    doCaseSplit(buffer, crange) {
        return __awaiter(this, void 0, void 0, function* () {
            if (!buffer.getUri()) {
                throw new Error('No URI for buffer');
            }
            crange = Util.tabShiftForRange(buffer, crange);
            const lines = yield this.queueCmd('typeinfo', yield this.getRootDir(buffer), {
                interactive: this.caps.interactiveCaseSplit,
                command: 'split',
                uri: buffer.getUri(),
                text: buffer.isModified() ? buffer.getText() : undefined,
                args: [crange.start.row + 1, crange.start.column + 1].map((v) => v.toString())
            });
            const rx = /^(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+"([^]*)"$/;
            const res = [];
            for (const line of lines) {
                const match = line.match(rx);
                if (!match) {
                    Util.warn(`ghc-mod says: ${line}`);
                    continue;
                }
                const [rowstart, colstart, rowend, colend, text] = match.slice(1);
                res.push({
                    range: atom_1.Range.fromObject([
                        [parseInt(rowstart, 10) - 1, parseInt(colstart, 10) - 1],
                        [parseInt(rowend, 10) - 1, parseInt(colend, 10) - 1]
                    ]),
                    replacement: text
                });
            }
            return res;
        });
    }
    doSigFill(buffer, crange) {
        return __awaiter(this, void 0, void 0, function* () {
            if (!buffer.getUri()) {
                throw new Error('No URI for buffer');
            }
            crange = Util.tabShiftForRange(buffer, crange);
            const lines = yield this.queueCmd('typeinfo', yield this.getRootDir(buffer), {
                interactive: this.caps.interactiveCaseSplit,
                command: 'sig',
                uri: buffer.getUri(),
                text: buffer.isModified() ? buffer.getText() : undefined,
                args: [crange.start.row + 1, crange.start.column + 1].map((v) => v.toString())
            });
            if (lines.length < 2) {
                throw new Error(`Could not understand response: ${lines.join('\n')}`);
            }
            const rx = /^(\d+)\s+(\d+)\s+(\d+)\s+(\d+)$/;
            const match = lines[1].match(rx);
            if (!match) {
                throw new Error(`Could not understand response: ${lines.join('\n')}`);
            }
            const [rowstart, colstart, rowend, colend] = match.slice(1);
            const range = atom_1.Range.fromObject([
                [parseInt(rowstart, 10) - 1, parseInt(colstart, 10) - 1],
                [parseInt(rowend, 10) - 1, parseInt(colend, 10) - 1]
            ]);
            return {
                type: lines[0],
                range,
                body: lines.slice(2).join('\n')
            };
        });
    }
    getInfoInBuffer(editor, crange) {
        return __awaiter(this, void 0, void 0, function* () {
            const buffer = editor.getBuffer();
            if (!buffer.getUri()) {
                throw new Error('No URI for buffer');
            }
            const { symbol, range } = Util.getSymbolInRange(editor, crange);
            const lines = yield this.queueCmd('typeinfo', yield this.getRootDir(buffer), {
                interactive: true,
                command: 'info',
                uri: buffer.getUri(),
                text: buffer.isModified() ? buffer.getText() : undefined,
                args: [symbol]
            });
            const info = lines.join('\n');
            if ((info === 'Cannot show info') || !info) {
                throw new Error('No info');
            }
            else {
                return { range, info };
            }
        });
    }
    findSymbolProvidersInBuffer(editor, crange) {
        return __awaiter(this, void 0, void 0, function* () {
            const buffer = editor.getBuffer();
            const { symbol } = Util.getSymbolInRange(editor, crange);
            return this.queueCmd('find', yield this.getRootDir(buffer), {
                interactive: true,
                command: 'find',
                args: [symbol]
            });
        });
    }
    doCheckBuffer(buffer, fast = false) {
        return __awaiter(this, void 0, void 0, function* () {
            return this.doCheckOrLintBuffer('check', buffer, fast);
        });
    }
    doLintBuffer(buffer, fast = false) {
        return __awaiter(this, void 0, void 0, function* () {
            return this.doCheckOrLintBuffer('lint', buffer, fast);
        });
    }
    doCheckAndLint(buffer, fast) {
        return __awaiter(this, void 0, void 0, function* () {
            const [cr, lr] = yield Promise.all([this.doCheckBuffer(buffer, fast), this.doLintBuffer(buffer, fast)]);
            return cr.concat(lr);
        });
    }
    initBackend(rootDir) {
        return __awaiter(this, void 0, void 0, function* () {
            const rootPath = rootDir.getPath();
            const cached = this.backend.get(rootPath);
            if (cached) {
                return yield cached;
            }
            const newBackend = this.initBackendReal(rootDir);
            this.backend.set(rootPath, newBackend);
            return yield newBackend;
        });
    }
    initBackendReal(rootDir) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const opts = yield Util.getProcessOptions(rootDir.getPath());
                const versP = this.getVersion(opts);
                versP.then((v) => { this.checkComp(opts, v); });
                const vers = yield versP;
                this.caps = yield this.getCaps(vers);
                const backend = new ghc_modi_process_real_1.GhcModiProcessReal(this.caps, rootDir, opts);
                return backend;
            }
            catch (err) {
                atom.notifications.addFatalError(`\
Haskell-ghc-mod: ghc-mod failed to launch.
It is probably missing or misconfigured. ${err.code}`, {
                    detail: `\
${err}
PATH: ${process.env.PATH}
path: ${process.env.path}
Path: ${process.env.Path}\
`,
                    stack: err.stack,
                    dismissable: true
                });
                throw err;
            }
        });
    }
    createQueues() {
        this.commandQueues = {
            checklint: new Queue(2),
            browse: new Queue(atom.config.get('haskell-ghc-mod.maxBrowseProcesses')),
            typeinfo: new Queue(1),
            find: new Queue(1),
            init: new Queue(4),
            list: new Queue(1),
            lowmem: new Queue(1)
        };
        this.disposables.add(atom.config.onDidChange('haskell-ghc-mod.maxBrowseProcesses', ({ newValue }) => this.commandQueues.browse = new Queue(newValue)));
    }
    getVersion(opts) {
        return __awaiter(this, void 0, void 0, function* () {
            const timeout = atom.config.get('haskell-ghc-mod.initTimeout') * 1000;
            const cmd = atom.config.get('haskell-ghc-mod.ghcModPath');
            const { stdout } = yield Util.execPromise(cmd, ['version'], Object.assign({ timeout }, opts));
            const versRaw = /^ghc-mod version (\d+)\.(\d+)\.(\d+)(?:\.(\d+))?/.exec(stdout);
            if (!versRaw) {
                throw new Error("Couldn't get ghc-mod version");
            }
            const vers = versRaw.slice(1, 5).map((i) => parseInt(i, 10));
            const compRaw = /GHC (.+)$/.exec(stdout.trim());
            if (!compRaw) {
                throw new Error("Couldn't get ghc version");
            }
            const comp = compRaw[1];
            Util.debug(`Ghc-mod ${vers} built with ${comp}`);
            return { vers, comp };
        });
    }
    checkComp(opts, { comp }) {
        return __awaiter(this, void 0, void 0, function* () {
            const timeout = atom.config.get('haskell-ghc-mod.initTimeout') * 1000;
            const tryWarn = (cmd, args) => __awaiter(this, void 0, void 0, function* () {
                try {
                    return (yield Util.execPromise(cmd, args, Object.assign({ timeout }, opts))).stdout.trim();
                }
                catch (error) {
                    Util.warn(error);
                }
            });
            const [stackghc, pathghc] = yield Promise.all([
                tryWarn('stack', ['ghc', '--', '--numeric-version']),
                tryWarn('ghc', ['--numeric-version']),
            ]);
            Util.debug(`Stack GHC version ${stackghc}`);
            Util.debug(`Path GHC version ${pathghc}`);
            if (stackghc && (stackghc !== comp)) {
                const warn = `\
GHC version in your Stack '${stackghc}' doesn't match with \
GHC version used to build ghc-mod '${comp}'. This can lead to \
problems when using Stack projects`;
                atom.notifications.addWarning(warn);
                Util.warn(warn);
            }
            if (pathghc && (pathghc !== comp)) {
                const warn = `\
GHC version in your PATH '${pathghc}' doesn't match with \
GHC version used to build ghc-mod '${comp}'. This can lead to \
problems when using Cabal or Plain projects`;
                atom.notifications.addWarning(warn);
                Util.warn(warn);
            }
        });
    }
    getCaps({ vers }) {
        const caps = {
            version: vers,
            fileMap: false,
            quoteArgs: false,
            optparse: false,
            typeConstraints: false,
            browseParents: false,
            interactiveCaseSplit: false,
            importedFrom: false
        };
        const atLeast = (b) => {
            for (let i = 0; i < b.length; i++) {
                const v = b[i];
                if (vers[i] > v) {
                    return true;
                }
                else if (vers[i] < v) {
                    return false;
                }
            }
            return true;
        };
        const exact = (b) => {
            for (let i = 0; i < b.length; i++) {
                const v = b[i];
                if (vers[i] !== v) {
                    return false;
                }
            }
            return true;
        };
        if (!atLeast([5, 4])) {
            atom.notifications.addError(`\
Haskell-ghc-mod: ghc-mod < 5.4 is not supported. \
Use at your own risk or update your ghc-mod installation`, { dismissable: true });
        }
        if (exact([5, 4])) {
            atom.notifications.addWarning(`\
Haskell-ghc-mod: ghc-mod 5.4.* is deprecated. \
Use at your own risk or update your ghc-mod installation`, { dismissable: true });
        }
        if (atLeast([5, 4])) {
            caps.fileMap = true;
        }
        if (atLeast([5, 5])) {
            caps.quoteArgs = true;
            caps.optparse = true;
        }
        if (atLeast([5, 6])) {
            caps.typeConstraints = true;
            caps.browseParents = true;
            caps.interactiveCaseSplit = true;
        }
        if (atom.config.get('haskell-ghc-mod.experimental')) {
            caps.importedFrom = true;
        }
        Util.debug(JSON.stringify(caps));
        return caps;
    }
    getSettings(runDir) {
        return __awaiter(this, void 0, void 0, function* () {
            const readSettings = (file) => __awaiter(this, void 0, void 0, function* () {
                try {
                    const ex = yield file.exists();
                    if (ex) {
                        const contents = yield file.read();
                        try {
                            return JSON.parse(contents);
                        }
                        catch (err) {
                            atom.notifications.addError(`Failed to parse ${file.getPath()}`, {
                                detail: err,
                                dismissable: true
                            });
                            throw err;
                        }
                    }
                    else {
                        return {};
                    }
                }
                catch (error) {
                    if (error) {
                        Util.warn(error);
                    }
                    return {};
                }
            });
            const localSettings = readSettings(runDir.getFile('.haskell-ghc-mod.json'));
            const [projectDir] = Array.from(atom.project.getDirectories().filter((d) => d.contains(runDir.getPath())));
            const projectSettings = projectDir ?
                readSettings(projectDir.getFile('.haskell-ghc-mod.json'))
                :
                    Promise.resolve({});
            const configDir = new atom_1.Directory(atom.getConfigDirPath());
            const globalSettings = readSettings(configDir.getFile('haskell-ghc-mod.json'));
            const [glob, prj, loc] = yield Promise.all([globalSettings, projectSettings, localSettings]);
            return Object.assign({}, glob, prj, loc);
        });
    }
    queueCmd(queueName, dir, runArgs) {
        return __awaiter(this, void 0, void 0, function* () {
            if (atom.config.get('haskell-ghc-mod.lowMemorySystem')) {
                queueName = 'lowmem';
            }
            const backend = yield this.initBackend(dir);
            const promise = this.commandQueues[queueName].add(() => __awaiter(this, void 0, void 0, function* () {
                this.emitter.emit('backend-active');
                try {
                    const settings = yield this.getSettings(dir);
                    if (settings.disable) {
                        throw new Error('Ghc-mod disabled in settings');
                    }
                    return backend.run(Object.assign({}, runArgs, { suppressErrors: settings.suppressErrors, ghcOptions: settings.ghcOptions, ghcModOptions: settings.ghcModOptions }));
                }
                catch (err) {
                    Util.warn(err);
                    throw err;
                }
            }));
            promise.then((res) => {
                const qe = (qn) => {
                    const q = this.commandQueues[qn];
                    return (q.getQueueLength() + q.getPendingLength()) === 0;
                };
                if (qe(queueName)) {
                    this.emitter.emit('queue-idle', { queue: queueName });
                    if (Object.keys(this.commandQueues).every(qe)) {
                        this.emitter.emit('backend-idle');
                    }
                }
            });
            return promise;
        });
    }
    doCheckOrLintBuffer(cmd, buffer, fast) {
        return __awaiter(this, void 0, void 0, function* () {
            let dashArgs;
            if (buffer.isEmpty()) {
                return [];
            }
            if (!buffer.getUri()) {
                return [];
            }
            let uri = buffer.getUri();
            const olduri = buffer.getUri();
            let text;
            try {
                if ((cmd === 'lint') && (path_1.extname(uri) === '.lhs')) {
                    uri = uri.slice(0, -1);
                    text = yield atom_haskell_utils_1.unlit(olduri, buffer.getText());
                }
                else if (buffer.isModified()) {
                    text = buffer.getText();
                }
            }
            catch (error) {
                const m = error.message.match(/^(.*?):([0-9]+): *(.*) *$/);
                if (!m) {
                    throw error;
                }
                const [uri2, line, mess] = m.slice(1);
                return [{
                        uri: uri2,
                        position: new atom_1.Point(parseInt(line, 10) - 1, 0),
                        message: mess,
                        severity: 'lint'
                    }];
            }
            if (cmd === 'lint') {
                const opts = atom.config.get('haskell-ghc-mod.hlintOptions');
                dashArgs = [];
                for (const opt of opts) {
                    dashArgs.push('--hlintOpt', opt);
                }
            }
            const rootDir = yield this.getRootDir(buffer);
            const lines = yield this.queueCmd('checklint', rootDir, {
                interactive: fast,
                command: cmd,
                uri,
                text,
                dashArgs
            });
            const rx = /^(.*?):([0-9\s]+):([0-9\s]+): *(?:(Warning|Error): *)?([^]*)/;
            const res = [];
            for (const line of lines) {
                const match = line.match(rx);
                if (!match) {
                    if (line.trim().length) {
                        Util.warn(`ghc-mod says: ${line}`);
                    }
                    continue;
                }
                const [file2, row, col, warning, message] = match.slice(1);
                if (file2 === 'Dummy' && row === '0' && col === '0') {
                    if (warning === 'Error') {
                        atom.notifications.addError(message);
                        continue;
                    }
                    else if (warning === 'Warning') {
                        atom.notifications.addWarning(message);
                        continue;
                    }
                }
                const file = uri.endsWith(file2) ? olduri : file2;
                const severity = cmd === 'lint' ?
                    'lint'
                    : warning === 'Warning' ?
                        'warning'
                        :
                            'error';
                const messPos = new atom_1.Point(parseInt(row, 10) - 1, parseInt(col, 10) - 1);
                const position = Util.tabUnshiftForPoint(buffer, messPos);
                let myuri;
                try {
                    myuri = rootDir.getFile(rootDir.relativize(file)).getPath();
                }
                catch (error) {
                    myuri = file;
                }
                res.push({
                    uri: myuri,
                    position,
                    message,
                    severity
                });
            }
            return res;
        });
    }
}
exports.GhcModiProcess = GhcModiProcess;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZ2hjLW1vZGktcHJvY2Vzcy5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uLy4uL3NyYy9naGMtbW9kL2doYy1tb2RpLXByb2Nlc3MudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7Ozs7Ozs7OztBQVlBLCtCQUE0RTtBQUM1RSxnQ0FBK0I7QUFDL0IsK0JBQThCO0FBQzlCLHVDQUF1QztBQUN2QywyREFBMEM7QUFFMUMsbUVBQXdFO0FBYXhFO0lBUUU7UUFDRSxJQUFJLENBQUMsV0FBVyxHQUFHLElBQUksMEJBQW1CLEVBQUUsQ0FBQTtRQUM1QyxJQUFJLENBQUMsT0FBTyxHQUFHLElBQUksY0FBTyxFQUFFLENBQUE7UUFDNUIsSUFBSSxDQUFDLFdBQVcsQ0FBQyxHQUFHLENBQUMsSUFBSSxDQUFDLE9BQU8sQ0FBQyxDQUFBO1FBQ2xDLElBQUksQ0FBQyxZQUFZLEdBQUcsSUFBSSxPQUFPLEVBQUUsQ0FBQTtRQUNqQyxJQUFJLENBQUMsT0FBTyxHQUFHLElBQUksR0FBRyxFQUFFLENBQUE7UUFFeEIsRUFBRSxDQUFDLENBQUMsT0FBTyxDQUFDLEdBQUcsQ0FBQyxnQkFBZ0IsSUFBSSxDQUFDLElBQUksQ0FBQyxNQUFNLENBQUMsR0FBRyxDQUFDLCtDQUErQyxDQUFDLENBQUMsQ0FBQyxDQUFDO1lBQ3RHLElBQUksQ0FBQyxhQUFhLENBQUMsVUFBVSxDQUFDOztDQUVuQyxFQUFtQztnQkFDMUIsV0FBVyxFQUFFLElBQUk7Z0JBQ2pCLE1BQU0sRUFBRTs7Ozs7Ozs7Q0FRakI7YUFDUSxDQUNGLENBQUE7UUFDSCxDQUFDO1FBRUQsSUFBSSxDQUFDLFlBQVksRUFBRSxDQUFBO0lBQ3JCLENBQUM7SUFFWSxVQUFVLENBQUUsTUFBNEI7O1lBQ25ELElBQUksR0FBRyxDQUFBO1lBQ1AsR0FBRyxHQUFHLElBQUksQ0FBQyxZQUFZLENBQUMsR0FBRyxDQUFDLE1BQU0sQ0FBQyxDQUFBO1lBQ25DLEVBQUUsQ0FBQyxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUM7Z0JBQ1IsTUFBTSxDQUFDLEdBQUcsQ0FBQTtZQUNaLENBQUM7WUFDRCxHQUFHLEdBQUcsTUFBTSxJQUFJLENBQUMsVUFBVSxDQUFDLE1BQU0sQ0FBQyxDQUFBO1lBQ25DLElBQUksQ0FBQyxZQUFZLENBQUMsR0FBRyxDQUFDLE1BQU0sRUFBRSxHQUFHLENBQUMsQ0FBQTtZQUNsQyxNQUFNLENBQUMsR0FBRyxDQUFBO1FBQ1osQ0FBQztLQUFBO0lBRU0sV0FBVztRQUNoQixHQUFHLENBQUMsQ0FBQyxNQUFNLEVBQUUsSUFBSSxJQUFJLENBQUMsT0FBTyxDQUFDLE1BQU0sRUFBRSxDQUFDLENBQUMsQ0FBQztZQUN2QyxFQUFFLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxLQUFLLENBQUMsQ0FBQyxXQUFXLEVBQUUsQ0FBQyxDQUFBO1FBQ2pDLENBQUM7UUFDRCxJQUFJLENBQUMsT0FBTyxDQUFDLEtBQUssRUFBRSxDQUFBO0lBQ3RCLENBQUM7SUFFTSxPQUFPO1FBQ1osR0FBRyxDQUFDLENBQUMsTUFBTSxFQUFFLElBQUksSUFBSSxDQUFDLE9BQU8sQ0FBQyxNQUFNLEVBQUUsQ0FBQyxDQUFDLENBQUM7WUFDdkMsRUFBRSxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsS0FBSyxDQUFDLENBQUMsT0FBTyxFQUFFLENBQUMsQ0FBQTtRQUM3QixDQUFDO1FBQ0QsSUFBSSxDQUFDLE9BQU8sQ0FBQyxLQUFLLEVBQUUsQ0FBQTtRQUNwQixJQUFJLENBQUMsT0FBTyxDQUFDLElBQUksQ0FBQyxhQUFhLENBQUMsQ0FBQTtRQUNoQyxJQUFJLENBQUMsV0FBVyxDQUFDLE9BQU8sRUFBRSxDQUFBO0lBQzVCLENBQUM7SUFFTSxZQUFZLENBQUUsUUFBb0I7UUFDdkMsTUFBTSxDQUFDLElBQUksQ0FBQyxPQUFPLENBQUMsRUFBRSxDQUFDLGFBQWEsRUFBRSxRQUFRLENBQUMsQ0FBQTtJQUNqRCxDQUFDO0lBRU0sZUFBZSxDQUFFLFFBQW9CO1FBQzFDLE1BQU0sQ0FBQyxJQUFJLENBQUMsT0FBTyxDQUFDLEVBQUUsQ0FBQyxnQkFBZ0IsRUFBRSxRQUFRLENBQUMsQ0FBQTtJQUNwRCxDQUFDO0lBRU0sYUFBYSxDQUFFLFFBQW9CO1FBQ3hDLE1BQU0sQ0FBQyxJQUFJLENBQUMsT0FBTyxDQUFDLEVBQUUsQ0FBQyxjQUFjLEVBQUUsUUFBUSxDQUFDLENBQUE7SUFDbEQsQ0FBQztJQUVNLFdBQVcsQ0FBRSxRQUFvQjtRQUN0QyxNQUFNLENBQUMsSUFBSSxDQUFDLE9BQU8sQ0FBQyxFQUFFLENBQUMsWUFBWSxFQUFFLFFBQVEsQ0FBQyxDQUFBO0lBQ2hELENBQUM7SUFFWSxPQUFPLENBQUUsTUFBNEI7O1lBQ2hELE1BQU0sQ0FBQyxJQUFJLENBQUMsUUFBUSxDQUFDLE1BQU0sRUFBRSxNQUFNLElBQUksQ0FBQyxVQUFVLENBQUMsTUFBTSxDQUFDLEVBQUUsRUFBRSxPQUFPLEVBQUUsTUFBTSxFQUFFLENBQUMsQ0FBQTtRQUNsRixDQUFDO0tBQUE7SUFFWSxPQUFPLENBQUUsR0FBd0I7O1lBQzVDLE1BQU0sQ0FBQyxJQUFJLENBQUMsUUFBUSxDQUFDLE1BQU0sRUFBRSxHQUFHLEVBQUUsRUFBRSxPQUFPLEVBQUUsTUFBTSxFQUFFLENBQUMsQ0FBQTtRQUN4RCxDQUFDO0tBQUE7SUFFWSxPQUFPLENBQUUsR0FBd0I7O1lBQzVDLE1BQU0sQ0FBQyxJQUFJLENBQUMsUUFBUSxDQUFDLE1BQU0sRUFBRSxHQUFHLEVBQUUsRUFBRSxPQUFPLEVBQUUsTUFBTSxFQUFFLENBQUMsQ0FBQTtRQUN4RCxDQUFDO0tBQUE7SUFFWSxTQUFTLENBQUUsT0FBNEIsRUFBRSxPQUFpQjs7WUFDckUsTUFBTSxLQUFLLEdBQUcsTUFBTSxJQUFJLENBQUMsUUFBUSxDQUFDLFFBQVEsRUFBRSxPQUFPLEVBQUU7Z0JBQ25ELE9BQU8sRUFBRSxRQUFRO2dCQUNqQixRQUFRLENBQUUsSUFBSTtvQkFDWixNQUFNLElBQUksR0FBRyxDQUFDLElBQUksQ0FBQyxDQUFBO29CQUNuQixFQUFFLENBQUMsQ0FBQyxJQUFJLENBQUMsYUFBYSxDQUFDLENBQUMsQ0FBQzt3QkFBQyxJQUFJLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxDQUFBO29CQUFDLENBQUM7b0JBQzNDLE1BQU0sQ0FBQyxJQUFJLENBQUE7Z0JBQ2IsQ0FBQztnQkFDRCxJQUFJLEVBQUUsT0FBTzthQUNkLENBQUMsQ0FBQTtZQUNGLE1BQU0sQ0FBQyxLQUFLLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQztnQkFFakIsTUFBTSxPQUFPLEdBQUcsSUFBSSxDQUFDLElBQUksQ0FBQyxhQUFhLEdBQUcsb0NBQW9DLEdBQUcsaUJBQWlCLENBQUE7Z0JBQ2xHLE1BQU0sS0FBSyxHQUFHLENBQUMsQ0FBQyxLQUFLLENBQUMsT0FBTyxDQUFDLENBQUE7Z0JBQzlCLElBQUksSUFBSSxFQUFFLGFBQWEsRUFBRSxNQUFNLENBQUE7Z0JBQy9CLEVBQUUsQ0FBQyxDQUFDLEtBQUssQ0FBQyxDQUFDLENBQUM7b0JBQ1YsSUFBSSxHQUFHLEtBQUssQ0FBQyxDQUFDLENBQUMsQ0FBQTtvQkFDZixhQUFhLEdBQUcsS0FBSyxDQUFDLENBQUMsQ0FBQyxDQUFBO29CQUN4QixNQUFNLEdBQUcsS0FBSyxDQUFDLENBQUMsQ0FBQyxDQUFBO2dCQUNuQixDQUFDO2dCQUFDLElBQUksQ0FBQyxDQUFDO29CQUNOLElBQUksR0FBRyxDQUFDLENBQUE7Z0JBQ1YsQ0FBQztnQkFDRCxJQUFJLFVBQXNCLENBQUE7Z0JBQzFCLEVBQUUsQ0FBQyxDQUFDLGFBQWEsSUFBSSx3QkFBd0IsQ0FBQyxJQUFJLENBQUMsYUFBYSxDQUFDLENBQUMsQ0FBQyxDQUFDO29CQUNsRSxVQUFVLEdBQUcsTUFBTSxDQUFBO2dCQUNyQixDQUFDO2dCQUFDLElBQUksQ0FBQyxFQUFFLENBQUMsQ0FBQyxhQUFhLElBQUksWUFBWSxDQUFDLElBQUksQ0FBQyxhQUFhLENBQUMsQ0FBQyxDQUFDLENBQUM7b0JBQzdELFVBQVUsR0FBRyxPQUFPLENBQUE7Z0JBQ3RCLENBQUM7Z0JBQUMsSUFBSSxDQUFDLENBQUM7b0JBQ04sVUFBVSxHQUFHLFVBQVUsQ0FBQTtnQkFDekIsQ0FBQztnQkFDRCxNQUFNLENBQUMsRUFBRSxJQUFJLEVBQUUsYUFBYSxFQUFFLFVBQVUsRUFBRSxNQUFNLEVBQUUsQ0FBQTtZQUNwRCxDQUFDLENBQUMsQ0FBQTtRQUNKLENBQUM7S0FBQTtJQUVZLGVBQWUsQ0FDMUIsTUFBNEIsRUFBRSxNQUF1Qjs7WUFFckQsRUFBRSxDQUFDLENBQUMsQ0FBRSxNQUFNLENBQUMsTUFBTSxFQUFFLENBQUMsQ0FBQyxDQUFDO2dCQUFDLE1BQU0sSUFBSSxLQUFLLENBQUMsbUJBQW1CLENBQUMsQ0FBQTtZQUFDLENBQUM7WUFDL0QsTUFBTSxHQUFHLElBQUksQ0FBQyxnQkFBZ0IsQ0FBQyxNQUFNLEVBQUUsTUFBTSxDQUFDLENBQUE7WUFDOUMsTUFBTSxLQUFLLEdBQUcsTUFBTSxJQUFJLENBQUMsUUFBUSxDQUFDLFVBQVUsRUFBRSxNQUFNLElBQUksQ0FBQyxVQUFVLENBQUMsTUFBTSxDQUFDLEVBQUU7Z0JBQzNFLFdBQVcsRUFBRSxJQUFJO2dCQUNqQixPQUFPLEVBQUUsTUFBTTtnQkFDZixHQUFHLEVBQUUsTUFBTSxDQUFDLE1BQU0sRUFBRTtnQkFDcEIsSUFBSSxFQUFFLE1BQU0sQ0FBQyxVQUFVLEVBQUUsR0FBRyxNQUFNLENBQUMsT0FBTyxFQUFFLEdBQUcsU0FBUztnQkFDeEQsUUFBUSxDQUFFLElBQUk7b0JBQ1osTUFBTSxDQUFDLElBQUksQ0FBQyxlQUFlLEdBQUcsQ0FBQyxJQUFJLENBQUMsR0FBRyxFQUFFLENBQUE7Z0JBQzNDLENBQUM7Z0JBQ0QsSUFBSSxFQUFFLENBQUMsTUFBTSxDQUFDLEtBQUssQ0FBQyxHQUFHLEdBQUcsQ0FBQyxFQUFFLE1BQU0sQ0FBQyxLQUFLLENBQUMsTUFBTSxHQUFHLENBQUMsQ0FBQyxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUMsS0FBSyxDQUFDLENBQUMsUUFBUSxFQUFFLENBQUM7YUFDL0UsQ0FBQyxDQUFBO1lBRUYsTUFBTSxFQUFFLEdBQUcsNENBQTRDLENBQUE7WUFDdkQsR0FBRyxDQUFDLENBQUMsTUFBTSxJQUFJLElBQUksS0FBSyxDQUFDLENBQUMsQ0FBQztnQkFDekIsTUFBTSxLQUFLLEdBQUcsSUFBSSxDQUFDLEtBQUssQ0FBQyxFQUFFLENBQUMsQ0FBQTtnQkFDNUIsRUFBRSxDQUFDLENBQUMsQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDO29CQUFDLFFBQVEsQ0FBQTtnQkFBQyxDQUFDO2dCQUN4QixNQUFNLENBQUMsUUFBUSxFQUFFLFFBQVEsRUFBRSxNQUFNLEVBQUUsTUFBTSxFQUFFLElBQUksQ0FBQyxHQUFHLEtBQUssQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDLENBQUE7Z0JBQ2pFLE1BQU0sS0FBSyxHQUNULFlBQUssQ0FBQyxVQUFVLENBQUM7b0JBQ2YsQ0FBQyxRQUFRLENBQUMsUUFBUSxFQUFFLEVBQUUsQ0FBQyxHQUFHLENBQUMsRUFBRSxRQUFRLENBQUMsUUFBUSxFQUFFLEVBQUUsQ0FBQyxHQUFHLENBQUMsQ0FBQztvQkFDeEQsQ0FBQyxRQUFRLENBQUMsTUFBTSxFQUFFLEVBQUUsQ0FBQyxHQUFHLENBQUMsRUFBRSxRQUFRLENBQUMsTUFBTSxFQUFFLEVBQUUsQ0FBQyxHQUFHLENBQUMsQ0FBQztpQkFDckQsQ0FBQyxDQUFBO2dCQUNKLEVBQUUsQ0FBQyxDQUFDLEtBQUssQ0FBQyxPQUFPLEVBQUUsQ0FBQyxDQUFDLENBQUM7b0JBQUMsUUFBUSxDQUFBO2dCQUFDLENBQUM7Z0JBQ2pDLEVBQUUsQ0FBQyxDQUFDLENBQUMsS0FBSyxDQUFDLGFBQWEsQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDLENBQUM7b0JBQUMsUUFBUSxDQUFBO2dCQUFDLENBQUM7Z0JBQzlDLE1BQU0sQ0FBQztvQkFDTCxLQUFLLEVBQUUsSUFBSSxDQUFDLGtCQUFrQixDQUFDLE1BQU0sRUFBRSxLQUFLLENBQUM7b0JBQzdDLElBQUksRUFBRSxJQUFJLENBQUMsT0FBTyxDQUFDLE1BQU0sRUFBRSxHQUFHLENBQUM7aUJBQ2hDLENBQUE7WUFDSCxDQUFDO1lBQ0QsTUFBTSxJQUFJLEtBQUssQ0FBQyxTQUFTLENBQUMsQ0FBQTtRQUM1QixDQUFDO0tBQUE7SUFFWSxXQUFXLENBQUUsTUFBNEIsRUFBRSxNQUF1Qjs7WUFDN0UsRUFBRSxDQUFDLENBQUMsQ0FBRSxNQUFNLENBQUMsTUFBTSxFQUFFLENBQUMsQ0FBQyxDQUFDO2dCQUFDLE1BQU0sSUFBSSxLQUFLLENBQUMsbUJBQW1CLENBQUMsQ0FBQTtZQUFDLENBQUM7WUFDL0QsTUFBTSxHQUFHLElBQUksQ0FBQyxnQkFBZ0IsQ0FBQyxNQUFNLEVBQUUsTUFBTSxDQUFDLENBQUE7WUFDOUMsTUFBTSxLQUFLLEdBQUcsTUFBTSxJQUFJLENBQUMsUUFBUSxDQUFDLFVBQVUsRUFBRSxNQUFNLElBQUksQ0FBQyxVQUFVLENBQUMsTUFBTSxDQUFDLEVBQUU7Z0JBQzNFLFdBQVcsRUFBRSxJQUFJLENBQUMsSUFBSSxDQUFDLG9CQUFvQjtnQkFDM0MsT0FBTyxFQUFFLE9BQU87Z0JBQ2hCLEdBQUcsRUFBRSxNQUFNLENBQUMsTUFBTSxFQUFFO2dCQUNwQixJQUFJLEVBQUUsTUFBTSxDQUFDLFVBQVUsRUFBRSxHQUFHLE1BQU0sQ0FBQyxPQUFPLEVBQUUsR0FBRyxTQUFTO2dCQUN4RCxJQUFJLEVBQUUsQ0FBQyxNQUFNLENBQUMsS0FBSyxDQUFDLEdBQUcsR0FBRyxDQUFDLEVBQUUsTUFBTSxDQUFDLEtBQUssQ0FBQyxNQUFNLEdBQUcsQ0FBQyxDQUFDLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQyxLQUFLLENBQUMsQ0FBQyxRQUFRLEVBQUUsQ0FBQzthQUMvRSxDQUFDLENBQUE7WUFFRixNQUFNLEVBQUUsR0FBRyw0Q0FBNEMsQ0FBQTtZQUN2RCxNQUFNLEdBQUcsR0FBRyxFQUFFLENBQUE7WUFDZCxHQUFHLENBQUMsQ0FBQyxNQUFNLElBQUksSUFBSSxLQUFLLENBQUMsQ0FBQyxDQUFDO2dCQUN6QixNQUFNLEtBQUssR0FBRyxJQUFJLENBQUMsS0FBSyxDQUFDLEVBQUUsQ0FBQyxDQUFBO2dCQUM1QixFQUFFLENBQUMsQ0FBQyxDQUFFLEtBQUssQ0FBQyxDQUFDLENBQUM7b0JBQ1osSUFBSSxDQUFDLElBQUksQ0FBQyxpQkFBaUIsSUFBSSxFQUFFLENBQUMsQ0FBQTtvQkFDbEMsUUFBUSxDQUFBO2dCQUNWLENBQUM7Z0JBQ0QsTUFBTSxDQUFDLFFBQVEsRUFBRSxRQUFRLEVBQUUsTUFBTSxFQUFFLE1BQU0sRUFBRSxJQUFJLENBQUMsR0FBRyxLQUFLLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQyxDQUFBO2dCQUNqRSxHQUFHLENBQUMsSUFBSSxDQUFDO29CQUNQLEtBQUssRUFDTCxZQUFLLENBQUMsVUFBVSxDQUFDO3dCQUNmLENBQUMsUUFBUSxDQUFDLFFBQVEsRUFBRSxFQUFFLENBQUMsR0FBRyxDQUFDLEVBQUUsUUFBUSxDQUFDLFFBQVEsRUFBRSxFQUFFLENBQUMsR0FBRyxDQUFDLENBQUM7d0JBQ3hELENBQUMsUUFBUSxDQUFDLE1BQU0sRUFBRSxFQUFFLENBQUMsR0FBRyxDQUFDLEVBQUUsUUFBUSxDQUFDLE1BQU0sRUFBRSxFQUFFLENBQUMsR0FBRyxDQUFDLENBQUM7cUJBQ3JELENBQUM7b0JBQ0YsV0FBVyxFQUFFLElBQUk7aUJBQ2xCLENBQUMsQ0FBQTtZQUNKLENBQUM7WUFDRCxNQUFNLENBQUMsR0FBRyxDQUFBO1FBQ1osQ0FBQztLQUFBO0lBRVksU0FBUyxDQUFFLE1BQTRCLEVBQUUsTUFBdUI7O1lBQzNFLEVBQUUsQ0FBQyxDQUFDLENBQUUsTUFBTSxDQUFDLE1BQU0sRUFBRSxDQUFDLENBQUMsQ0FBQztnQkFBQyxNQUFNLElBQUksS0FBSyxDQUFDLG1CQUFtQixDQUFDLENBQUE7WUFBQyxDQUFDO1lBQy9ELE1BQU0sR0FBRyxJQUFJLENBQUMsZ0JBQWdCLENBQUMsTUFBTSxFQUFFLE1BQU0sQ0FBQyxDQUFBO1lBQzlDLE1BQU0sS0FBSyxHQUFHLE1BQU0sSUFBSSxDQUFDLFFBQVEsQ0FBQyxVQUFVLEVBQUUsTUFBTSxJQUFJLENBQUMsVUFBVSxDQUFDLE1BQU0sQ0FBQyxFQUFFO2dCQUMzRSxXQUFXLEVBQUUsSUFBSSxDQUFDLElBQUksQ0FBQyxvQkFBb0I7Z0JBQzNDLE9BQU8sRUFBRSxLQUFLO2dCQUNkLEdBQUcsRUFBRSxNQUFNLENBQUMsTUFBTSxFQUFFO2dCQUNwQixJQUFJLEVBQUUsTUFBTSxDQUFDLFVBQVUsRUFBRSxHQUFHLE1BQU0sQ0FBQyxPQUFPLEVBQUUsR0FBRyxTQUFTO2dCQUN4RCxJQUFJLEVBQUUsQ0FBQyxNQUFNLENBQUMsS0FBSyxDQUFDLEdBQUcsR0FBRyxDQUFDLEVBQUUsTUFBTSxDQUFDLEtBQUssQ0FBQyxNQUFNLEdBQUcsQ0FBQyxDQUFDLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQyxLQUFLLENBQUMsQ0FBQyxRQUFRLEVBQUUsQ0FBQzthQUMvRSxDQUFDLENBQUE7WUFDRixFQUFFLENBQUMsQ0FBQyxLQUFLLENBQUMsTUFBTSxHQUFHLENBQUMsQ0FBQyxDQUFDLENBQUM7Z0JBQUMsTUFBTSxJQUFJLEtBQUssQ0FBQyxrQ0FBa0MsS0FBSyxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsRUFBRSxDQUFDLENBQUE7WUFBQyxDQUFDO1lBQy9GLE1BQU0sRUFBRSxHQUFHLGlDQUFpQyxDQUFBO1lBQzVDLE1BQU0sS0FBSyxHQUFHLEtBQUssQ0FBQyxDQUFDLENBQUMsQ0FBQyxLQUFLLENBQUMsRUFBRSxDQUFDLENBQUE7WUFDaEMsRUFBRSxDQUFDLENBQUMsQ0FBRSxLQUFLLENBQUMsQ0FBQyxDQUFDO2dCQUFDLE1BQU0sSUFBSSxLQUFLLENBQUMsa0NBQWtDLEtBQUssQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLEVBQUUsQ0FBQyxDQUFBO1lBQUMsQ0FBQztZQUN0RixNQUFNLENBQUMsUUFBUSxFQUFFLFFBQVEsRUFBRSxNQUFNLEVBQUUsTUFBTSxDQUFDLEdBQUcsS0FBSyxDQUFDLEtBQUssQ0FBQyxDQUFDLENBQUMsQ0FBQTtZQUMzRCxNQUFNLEtBQUssR0FDVCxZQUFLLENBQUMsVUFBVSxDQUFDO2dCQUNmLENBQUMsUUFBUSxDQUFDLFFBQVEsRUFBRSxFQUFFLENBQUMsR0FBRyxDQUFDLEVBQUUsUUFBUSxDQUFDLFFBQVEsRUFBRSxFQUFFLENBQUMsR0FBRyxDQUFDLENBQUM7Z0JBQ3hELENBQUMsUUFBUSxDQUFDLE1BQU0sRUFBRSxFQUFFLENBQUMsR0FBRyxDQUFDLEVBQUUsUUFBUSxDQUFDLE1BQU0sRUFBRSxFQUFFLENBQUMsR0FBRyxDQUFDLENBQUM7YUFDckQsQ0FBQyxDQUFBO1lBQ0osTUFBTSxDQUFDO2dCQUNMLElBQUksRUFBRSxLQUFLLENBQUMsQ0FBQyxDQUFDO2dCQUNkLEtBQUs7Z0JBQ0wsSUFBSSxFQUFFLEtBQUssQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQzthQUNoQyxDQUFBO1FBQ0gsQ0FBQztLQUFBO0lBRVksZUFBZSxDQUFFLE1BQTRCLEVBQUUsTUFBdUI7O1lBQ2pGLE1BQU0sTUFBTSxHQUFHLE1BQU0sQ0FBQyxTQUFTLEVBQUUsQ0FBQTtZQUNqQyxFQUFFLENBQUMsQ0FBQyxDQUFDLE1BQU0sQ0FBQyxNQUFNLEVBQUUsQ0FBQyxDQUFDLENBQUM7Z0JBQUMsTUFBTSxJQUFJLEtBQUssQ0FBQyxtQkFBbUIsQ0FBQyxDQUFBO1lBQUMsQ0FBQztZQUM5RCxNQUFNLEVBQUUsTUFBTSxFQUFFLEtBQUssRUFBRSxHQUFHLElBQUksQ0FBQyxnQkFBZ0IsQ0FBQyxNQUFNLEVBQUUsTUFBTSxDQUFDLENBQUE7WUFFL0QsTUFBTSxLQUFLLEdBQUcsTUFBTSxJQUFJLENBQUMsUUFBUSxDQUFDLFVBQVUsRUFBRSxNQUFNLElBQUksQ0FBQyxVQUFVLENBQUMsTUFBTSxDQUFDLEVBQUU7Z0JBQzNFLFdBQVcsRUFBRSxJQUFJO2dCQUNqQixPQUFPLEVBQUUsTUFBTTtnQkFDZixHQUFHLEVBQUUsTUFBTSxDQUFDLE1BQU0sRUFBRTtnQkFDcEIsSUFBSSxFQUFFLE1BQU0sQ0FBQyxVQUFVLEVBQUUsR0FBRyxNQUFNLENBQUMsT0FBTyxFQUFFLEdBQUcsU0FBUztnQkFDeEQsSUFBSSxFQUFFLENBQUMsTUFBTSxDQUFDO2FBQ2YsQ0FBQyxDQUFBO1lBRUYsTUFBTSxJQUFJLEdBQUcsS0FBSyxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsQ0FBQTtZQUM3QixFQUFFLENBQUMsQ0FBQyxDQUFDLElBQUksS0FBSyxrQkFBa0IsQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQztnQkFDM0MsTUFBTSxJQUFJLEtBQUssQ0FBQyxTQUFTLENBQUMsQ0FBQTtZQUM1QixDQUFDO1lBQUMsSUFBSSxDQUFDLENBQUM7Z0JBQ04sTUFBTSxDQUFDLEVBQUUsS0FBSyxFQUFFLElBQUksRUFBRSxDQUFBO1lBQ3hCLENBQUM7UUFDSCxDQUFDO0tBQUE7SUFFWSwyQkFBMkIsQ0FBRSxNQUE0QixFQUFFLE1BQXVCOztZQUM3RixNQUFNLE1BQU0sR0FBRyxNQUFNLENBQUMsU0FBUyxFQUFFLENBQUE7WUFDakMsTUFBTSxFQUFFLE1BQU0sRUFBRSxHQUFHLElBQUksQ0FBQyxnQkFBZ0IsQ0FBQyxNQUFNLEVBQUUsTUFBTSxDQUFDLENBQUE7WUFFeEQsTUFBTSxDQUFDLElBQUksQ0FBQyxRQUFRLENBQUMsTUFBTSxFQUFFLE1BQU0sSUFBSSxDQUFDLFVBQVUsQ0FBQyxNQUFNLENBQUMsRUFBRTtnQkFDMUQsV0FBVyxFQUFFLElBQUk7Z0JBQ2pCLE9BQU8sRUFBRSxNQUFNO2dCQUNmLElBQUksRUFBRSxDQUFDLE1BQU0sQ0FBQzthQUNmLENBQUMsQ0FBQTtRQUNKLENBQUM7S0FBQTtJQUVZLGFBQWEsQ0FBRSxNQUE0QixFQUFFLE9BQWdCLEtBQUs7O1lBQzdFLE1BQU0sQ0FBQyxJQUFJLENBQUMsbUJBQW1CLENBQUMsT0FBTyxFQUFFLE1BQU0sRUFBRSxJQUFJLENBQUMsQ0FBQTtRQUN4RCxDQUFDO0tBQUE7SUFFWSxZQUFZLENBQUUsTUFBNEIsRUFBRSxPQUFnQixLQUFLOztZQUM1RSxNQUFNLENBQUMsSUFBSSxDQUFDLG1CQUFtQixDQUFDLE1BQU0sRUFBRSxNQUFNLEVBQUUsSUFBSSxDQUFDLENBQUE7UUFDdkQsQ0FBQztLQUFBO0lBRVksY0FBYyxDQUFFLE1BQTRCLEVBQUUsSUFBYTs7WUFDdEUsTUFBTSxDQUFDLEVBQUUsRUFBRSxFQUFFLENBQUMsR0FBRyxNQUFNLE9BQU8sQ0FBQyxHQUFHLENBQUMsQ0FBQyxJQUFJLENBQUMsYUFBYSxDQUFDLE1BQU0sRUFBRSxJQUFJLENBQUMsRUFBRSxJQUFJLENBQUMsWUFBWSxDQUFDLE1BQU0sRUFBRSxJQUFJLENBQUMsQ0FBQyxDQUFDLENBQUE7WUFDdkcsTUFBTSxDQUFDLEVBQUUsQ0FBQyxNQUFNLENBQUMsRUFBRSxDQUFDLENBQUE7UUFDdEIsQ0FBQztLQUFBO0lBRWEsV0FBVyxDQUFFLE9BQTRCOztZQUNyRCxNQUFNLFFBQVEsR0FBRyxPQUFPLENBQUMsT0FBTyxFQUFFLENBQUE7WUFDbEMsTUFBTSxNQUFNLEdBQUcsSUFBSSxDQUFDLE9BQU8sQ0FBQyxHQUFHLENBQUMsUUFBUSxDQUFDLENBQUE7WUFDekMsRUFBRSxDQUFDLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQztnQkFBQyxNQUFNLENBQUMsTUFBTSxNQUFNLENBQUE7WUFBQyxDQUFDO1lBQ25DLE1BQU0sVUFBVSxHQUFHLElBQUksQ0FBQyxlQUFlLENBQUMsT0FBTyxDQUFDLENBQUE7WUFDaEQsSUFBSSxDQUFDLE9BQU8sQ0FBQyxHQUFHLENBQUMsUUFBUSxFQUFFLFVBQVUsQ0FBQyxDQUFBO1lBQ3RDLE1BQU0sQ0FBQyxNQUFNLFVBQVUsQ0FBQTtRQUN6QixDQUFDO0tBQUE7SUFFYSxlQUFlLENBQUUsT0FBNEI7O1lBQ3pELElBQUksQ0FBQztnQkFDSCxNQUFNLElBQUksR0FBRyxNQUFNLElBQUksQ0FBQyxpQkFBaUIsQ0FBQyxPQUFPLENBQUMsT0FBTyxFQUFFLENBQUMsQ0FBQTtnQkFDNUQsTUFBTSxLQUFLLEdBQUcsSUFBSSxDQUFDLFVBQVUsQ0FBQyxJQUFJLENBQUMsQ0FBQTtnQkFDbkMsS0FBSyxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsT0FBTyxJQUFJLENBQUMsU0FBUyxDQUFDLElBQUksRUFBRSxDQUFDLENBQUMsQ0FBQSxDQUFDLENBQUMsQ0FBQyxDQUFBO2dCQUM5QyxNQUFNLElBQUksR0FBRyxNQUFNLEtBQUssQ0FBQTtnQkFFeEIsSUFBSSxDQUFDLElBQUksR0FBRyxNQUFNLElBQUksQ0FBQyxPQUFPLENBQUMsSUFBSSxDQUFDLENBQUE7Z0JBQ3BDLE1BQU0sT0FBTyxHQUFHLElBQUksMENBQWtCLENBQUMsSUFBSSxDQUFDLElBQUksRUFBRSxPQUFPLEVBQUUsSUFBSSxDQUFDLENBQUE7Z0JBQ2hFLE1BQU0sQ0FBQyxPQUFPLENBQUE7WUFDaEIsQ0FBQztZQUFDLEtBQUssQ0FBQyxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUM7Z0JBQ2IsSUFBSSxDQUFDLGFBQWEsQ0FBQyxhQUFhLENBQzlCOzsyQ0FFbUMsR0FBRyxDQUFDLElBQUksRUFBRSxFQUM3QztvQkFDRSxNQUFNLEVBQUU7RUFDaEIsR0FBRztRQUNHLE9BQU8sQ0FBQyxHQUFHLENBQUMsSUFBSTtRQUNoQixPQUFPLENBQUMsR0FBRyxDQUFDLElBQUk7UUFDaEIsT0FBTyxDQUFDLEdBQUcsQ0FBQyxJQUFJO0NBQ3ZCO29CQUNTLEtBQUssRUFBRSxHQUFHLENBQUMsS0FBSztvQkFDaEIsV0FBVyxFQUFFLElBQUk7aUJBQ2xCLENBQ0YsQ0FBQTtnQkFDRCxNQUFNLEdBQUcsQ0FBQTtZQUNYLENBQUM7UUFDSCxDQUFDO0tBQUE7SUFFTyxZQUFZO1FBQ2xCLElBQUksQ0FBQyxhQUFhLEdBQUc7WUFDbkIsU0FBUyxFQUFFLElBQUksS0FBSyxDQUFDLENBQUMsQ0FBQztZQUN2QixNQUFNLEVBQUUsSUFBSSxLQUFLLENBQUMsSUFBSSxDQUFDLE1BQU0sQ0FBQyxHQUFHLENBQUMsb0NBQW9DLENBQUMsQ0FBQztZQUN4RSxRQUFRLEVBQUUsSUFBSSxLQUFLLENBQUMsQ0FBQyxDQUFDO1lBQ3RCLElBQUksRUFBRSxJQUFJLEtBQUssQ0FBQyxDQUFDLENBQUM7WUFDbEIsSUFBSSxFQUFFLElBQUksS0FBSyxDQUFDLENBQUMsQ0FBQztZQUNsQixJQUFJLEVBQUUsSUFBSSxLQUFLLENBQUMsQ0FBQyxDQUFDO1lBQ2xCLE1BQU0sRUFBRSxJQUFJLEtBQUssQ0FBQyxDQUFDLENBQUM7U0FDckIsQ0FBQTtRQUNELElBQUksQ0FBQyxXQUFXLENBQUMsR0FBRyxDQUFDLElBQUksQ0FBQyxNQUFNLENBQUMsV0FBVyxDQUFDLG9DQUFvQyxFQUFFLENBQUMsRUFBQyxRQUFRLEVBQUMsS0FDNUYsSUFBSSxDQUFDLGFBQWEsQ0FBQyxNQUFNLEdBQUcsSUFBSSxLQUFLLENBQUMsUUFBa0IsQ0FBQyxDQUFDLENBQzNELENBQUE7SUFDSCxDQUFDO0lBRWEsVUFBVSxDQUFFLElBQW1COztZQUMzQyxNQUFNLE9BQU8sR0FBRyxJQUFJLENBQUMsTUFBTSxDQUFDLEdBQUcsQ0FBQyw2QkFBNkIsQ0FBQyxHQUFHLElBQUksQ0FBQTtZQUNyRSxNQUFNLEdBQUcsR0FBRyxJQUFJLENBQUMsTUFBTSxDQUFDLEdBQUcsQ0FBQyw0QkFBNEIsQ0FBQyxDQUFBO1lBQ3pELE1BQU0sRUFBQyxNQUFNLEVBQUMsR0FBRyxNQUFNLElBQUksQ0FBQyxXQUFXLENBQUMsR0FBRyxFQUFFLENBQUMsU0FBUyxDQUFDLGtCQUFJLE9BQU8sSUFBSyxJQUFJLEVBQUcsQ0FBQTtZQUMvRSxNQUFNLE9BQU8sR0FBRyxrREFBa0QsQ0FBQyxJQUFJLENBQUMsTUFBTSxDQUFDLENBQUE7WUFDL0UsRUFBRSxDQUFDLENBQUMsQ0FBQyxPQUFPLENBQUMsQ0FBQyxDQUFDO2dCQUFDLE1BQU0sSUFBSSxLQUFLLENBQUMsOEJBQThCLENBQUMsQ0FBQTtZQUFDLENBQUM7WUFDakUsTUFBTSxJQUFJLEdBQUcsT0FBTyxDQUFDLEtBQUssQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQyxLQUFLLFFBQVEsQ0FBQyxDQUFDLEVBQUUsRUFBRSxDQUFDLENBQUMsQ0FBQTtZQUM1RCxNQUFNLE9BQU8sR0FBRyxXQUFXLENBQUMsSUFBSSxDQUFDLE1BQU0sQ0FBQyxJQUFJLEVBQUUsQ0FBQyxDQUFBO1lBQy9DLEVBQUUsQ0FBQyxDQUFDLENBQUMsT0FBTyxDQUFDLENBQUMsQ0FBQztnQkFBQyxNQUFNLElBQUksS0FBSyxDQUFDLDBCQUEwQixDQUFDLENBQUE7WUFBQyxDQUFDO1lBQzdELE1BQU0sSUFBSSxHQUFHLE9BQU8sQ0FBQyxDQUFDLENBQUMsQ0FBQTtZQUN2QixJQUFJLENBQUMsS0FBSyxDQUFDLFdBQVcsSUFBSSxlQUFlLElBQUksRUFBRSxDQUFDLENBQUE7WUFDaEQsTUFBTSxDQUFDLEVBQUUsSUFBSSxFQUFFLElBQUksRUFBRSxDQUFBO1FBQ3ZCLENBQUM7S0FBQTtJQUVhLFNBQVMsQ0FBRSxJQUFtQixFQUFFLEVBQUUsSUFBSSxFQUFrQjs7WUFDcEUsTUFBTSxPQUFPLEdBQUcsSUFBSSxDQUFDLE1BQU0sQ0FBQyxHQUFHLENBQUMsNkJBQTZCLENBQUMsR0FBRyxJQUFJLENBQUE7WUFDckUsTUFBTSxPQUFPLEdBQUcsQ0FBTyxHQUFXLEVBQUUsSUFBYztnQkFDaEQsSUFBSSxDQUFDO29CQUNILE1BQU0sQ0FBQyxDQUFDLE1BQU0sSUFBSSxDQUFDLFdBQVcsQ0FBQyxHQUFHLEVBQUUsSUFBSSxrQkFBSSxPQUFPLElBQUssSUFBSSxFQUFHLENBQUMsQ0FBQyxNQUFNLENBQUMsSUFBSSxFQUFFLENBQUE7Z0JBQ2hGLENBQUM7Z0JBQUMsS0FBSyxDQUFDLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQztvQkFDZixJQUFJLENBQUMsSUFBSSxDQUFDLEtBQUssQ0FBQyxDQUFBO2dCQUNsQixDQUFDO1lBQ0gsQ0FBQyxDQUFBLENBQUE7WUFDRCxNQUFNLENBQUMsUUFBUSxFQUFFLE9BQU8sQ0FBQyxHQUFHLE1BQU0sT0FBTyxDQUFDLEdBQUcsQ0FBQztnQkFDNUMsT0FBTyxDQUFDLE9BQU8sRUFBRSxDQUFDLEtBQUssRUFBRSxJQUFJLEVBQUUsbUJBQW1CLENBQUMsQ0FBQztnQkFDcEQsT0FBTyxDQUFDLEtBQUssRUFBRSxDQUFDLG1CQUFtQixDQUFDLENBQUM7YUFDdEMsQ0FBQyxDQUFBO1lBQ0YsSUFBSSxDQUFDLEtBQUssQ0FBQyxxQkFBcUIsUUFBUSxFQUFFLENBQUMsQ0FBQTtZQUMzQyxJQUFJLENBQUMsS0FBSyxDQUFDLG9CQUFvQixPQUFPLEVBQUUsQ0FBQyxDQUFBO1lBQ3pDLEVBQUUsQ0FBQyxDQUFDLFFBQVEsSUFBSSxDQUFDLFFBQVEsS0FBSyxJQUFJLENBQUMsQ0FBQyxDQUFDLENBQUM7Z0JBQ3BDLE1BQU0sSUFBSSxHQUFHOzZCQUNVLFFBQVE7cUNBQ0EsSUFBSTttQ0FDTixDQUFBO2dCQUM3QixJQUFJLENBQUMsYUFBYSxDQUFDLFVBQVUsQ0FBQyxJQUFJLENBQUMsQ0FBQTtnQkFDbkMsSUFBSSxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsQ0FBQTtZQUNqQixDQUFDO1lBQ0QsRUFBRSxDQUFDLENBQUMsT0FBTyxJQUFJLENBQUMsT0FBTyxLQUFLLElBQUksQ0FBQyxDQUFDLENBQUMsQ0FBQztnQkFDbEMsTUFBTSxJQUFJLEdBQUc7NEJBQ1MsT0FBTztxQ0FDRSxJQUFJOzRDQUNHLENBQUE7Z0JBQ3RDLElBQUksQ0FBQyxhQUFhLENBQUMsVUFBVSxDQUFDLElBQUksQ0FBQyxDQUFBO2dCQUNuQyxJQUFJLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxDQUFBO1lBQ2pCLENBQUM7UUFDSCxDQUFDO0tBQUE7SUFFTyxPQUFPLENBQUUsRUFBRSxJQUFJLEVBQW9CO1FBQ3pDLE1BQU0sSUFBSSxHQUFHO1lBQ1gsT0FBTyxFQUFFLElBQUk7WUFDYixPQUFPLEVBQUUsS0FBSztZQUNkLFNBQVMsRUFBRSxLQUFLO1lBQ2hCLFFBQVEsRUFBRSxLQUFLO1lBQ2YsZUFBZSxFQUFFLEtBQUs7WUFDdEIsYUFBYSxFQUFFLEtBQUs7WUFDcEIsb0JBQW9CLEVBQUUsS0FBSztZQUMzQixZQUFZLEVBQUUsS0FBSztTQUNwQixDQUFBO1FBRUQsTUFBTSxPQUFPLEdBQUcsQ0FBQyxDQUFXO1lBQzFCLEdBQUcsQ0FBQyxDQUFDLElBQUksQ0FBQyxHQUFHLENBQUMsRUFBRSxDQUFDLEdBQUcsQ0FBQyxDQUFDLE1BQU0sRUFBRSxDQUFDLEVBQUUsRUFBRSxDQUFDO2dCQUNsQyxNQUFNLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUE7Z0JBQ2QsRUFBRSxDQUFDLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDLENBQUM7b0JBQ2hCLE1BQU0sQ0FBQyxJQUFJLENBQUE7Z0JBQ2IsQ0FBQztnQkFBQyxJQUFJLENBQUMsRUFBRSxDQUFDLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDLENBQUM7b0JBQ3ZCLE1BQU0sQ0FBQyxLQUFLLENBQUE7Z0JBQ2QsQ0FBQztZQUNILENBQUM7WUFDRCxNQUFNLENBQUMsSUFBSSxDQUFBO1FBQ2IsQ0FBQyxDQUFBO1FBRUQsTUFBTSxLQUFLLEdBQUcsQ0FBQyxDQUFXO1lBQ3hCLEdBQUcsQ0FBQyxDQUFDLElBQUksQ0FBQyxHQUFHLENBQUMsRUFBRSxDQUFDLEdBQUcsQ0FBQyxDQUFDLE1BQU0sRUFBRSxDQUFDLEVBQUUsRUFBRSxDQUFDO2dCQUNsQyxNQUFNLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUE7Z0JBQ2QsRUFBRSxDQUFDLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDLENBQUM7b0JBQ2xCLE1BQU0sQ0FBQyxLQUFLLENBQUE7Z0JBQ2QsQ0FBQztZQUNILENBQUM7WUFDRCxNQUFNLENBQUMsSUFBSSxDQUFBO1FBQ2IsQ0FBQyxDQUFBO1FBRUQsRUFBRSxDQUFDLENBQUMsQ0FBQyxPQUFPLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUM7WUFDckIsSUFBSSxDQUFDLGFBQWEsQ0FBQyxRQUFRLENBQUM7O3lEQUV1QixFQUN2QixFQUFFLFdBQVcsRUFBRSxJQUFJLEVBQUUsQ0FBQyxDQUFBO1FBQ3BELENBQUM7UUFDRCxFQUFFLENBQUMsQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUM7WUFDbEIsSUFBSSxDQUFDLGFBQWEsQ0FBQyxVQUFVLENBQUM7O3lEQUVxQixFQUNyQixFQUFFLFdBQVcsRUFBRSxJQUFJLEVBQUUsQ0FBQyxDQUFBO1FBQ3RELENBQUM7UUFDRCxFQUFFLENBQUMsQ0FBQyxPQUFPLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUM7WUFDcEIsSUFBSSxDQUFDLE9BQU8sR0FBRyxJQUFJLENBQUE7UUFDckIsQ0FBQztRQUNELEVBQUUsQ0FBQyxDQUFDLE9BQU8sQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQztZQUNwQixJQUFJLENBQUMsU0FBUyxHQUFHLElBQUksQ0FBQTtZQUNyQixJQUFJLENBQUMsUUFBUSxHQUFHLElBQUksQ0FBQTtRQUN0QixDQUFDO1FBQ0QsRUFBRSxDQUFDLENBQUMsT0FBTyxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDO1lBQ3BCLElBQUksQ0FBQyxlQUFlLEdBQUcsSUFBSSxDQUFBO1lBQzNCLElBQUksQ0FBQyxhQUFhLEdBQUcsSUFBSSxDQUFBO1lBQ3pCLElBQUksQ0FBQyxvQkFBb0IsR0FBRyxJQUFJLENBQUE7UUFDbEMsQ0FBQztRQUNELEVBQUUsQ0FBQyxDQUFDLElBQUksQ0FBQyxNQUFNLENBQUMsR0FBRyxDQUFDLDhCQUE4QixDQUFDLENBQUMsQ0FBQyxDQUFDO1lBQ3BELElBQUksQ0FBQyxZQUFZLEdBQUcsSUFBSSxDQUFBO1FBQzFCLENBQUM7UUFDRCxJQUFJLENBQUMsS0FBSyxDQUFDLElBQUksQ0FBQyxTQUFTLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQTtRQUNoQyxNQUFNLENBQUMsSUFBSSxDQUFBO0lBQ2IsQ0FBQztJQUVhLFdBQVcsQ0FBRSxNQUEyQjs7WUFDcEQsTUFBTSxZQUFZLEdBQUcsQ0FBTyxJQUFvQjtnQkFDOUMsSUFBSSxDQUFDO29CQUNILE1BQU0sRUFBRSxHQUFHLE1BQU0sSUFBSSxDQUFDLE1BQU0sRUFBRSxDQUFBO29CQUM5QixFQUFFLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDO3dCQUNQLE1BQU0sUUFBUSxHQUFHLE1BQU0sSUFBSSxDQUFDLElBQUksRUFBRSxDQUFBO3dCQUNsQyxJQUFJLENBQUM7NEJBQ0gsTUFBTSxDQUFDLElBQUksQ0FBQyxLQUFLLENBQUMsUUFBUSxDQUFDLENBQUE7d0JBQzdCLENBQUM7d0JBQUMsS0FBSyxDQUFDLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQzs0QkFDYixJQUFJLENBQUMsYUFBYSxDQUFDLFFBQVEsQ0FBQyxtQkFBbUIsSUFBSSxDQUFDLE9BQU8sRUFBRSxFQUFFLEVBQUU7Z0NBQy9ELE1BQU0sRUFBRSxHQUFHO2dDQUNYLFdBQVcsRUFBRSxJQUFJOzZCQUNsQixDQUFDLENBQUE7NEJBQ0YsTUFBTSxHQUFHLENBQUE7d0JBQ1gsQ0FBQztvQkFDSCxDQUFDO29CQUFDLElBQUksQ0FBQyxDQUFDO3dCQUNOLE1BQU0sQ0FBQyxFQUFFLENBQUE7b0JBQ1gsQ0FBQztnQkFDSCxDQUFDO2dCQUFDLEtBQUssQ0FBQyxDQUFDLEtBQUssQ0FBQyxDQUFDLENBQUM7b0JBQ2YsRUFBRSxDQUFDLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQzt3QkFBQyxJQUFJLENBQUMsSUFBSSxDQUFDLEtBQUssQ0FBQyxDQUFBO29CQUFDLENBQUM7b0JBQy9CLE1BQU0sQ0FBQyxFQUFFLENBQUE7Z0JBQ1gsQ0FBQztZQUNILENBQUMsQ0FBQSxDQUFBO1lBRUQsTUFBTSxhQUFhLEdBQUcsWUFBWSxDQUFDLE1BQU0sQ0FBQyxPQUFPLENBQUMsdUJBQXVCLENBQUMsQ0FBQyxDQUFBO1lBRTNFLE1BQU0sQ0FBQyxVQUFVLENBQUMsR0FBRyxLQUFLLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxPQUFPLENBQUMsY0FBYyxFQUFFLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQyxLQUFLLENBQUMsQ0FBQyxRQUFRLENBQUMsTUFBTSxDQUFDLE9BQU8sRUFBRSxDQUFDLENBQUMsQ0FBQyxDQUFBO1lBQzFHLE1BQU0sZUFBZSxHQUNuQixVQUFVO2dCQUNSLFlBQVksQ0FBQyxVQUFVLENBQUMsT0FBTyxDQUFDLHVCQUF1QixDQUFDLENBQUM7O29CQUV6RCxPQUFPLENBQUMsT0FBTyxDQUFDLEVBQUUsQ0FBQyxDQUFBO1lBRXZCLE1BQU0sU0FBUyxHQUFHLElBQUksZ0JBQVMsQ0FBQyxJQUFJLENBQUMsZ0JBQWdCLEVBQUUsQ0FBQyxDQUFBO1lBQ3hELE1BQU0sY0FBYyxHQUFHLFlBQVksQ0FBQyxTQUFTLENBQUMsT0FBTyxDQUFDLHNCQUFzQixDQUFDLENBQUMsQ0FBQTtZQUU5RSxNQUFNLENBQUMsSUFBSSxFQUFFLEdBQUcsRUFBRSxHQUFHLENBQUMsR0FBRyxNQUFNLE9BQU8sQ0FBQyxHQUFHLENBQUMsQ0FBQyxjQUFjLEVBQUUsZUFBZSxFQUFFLGFBQWEsQ0FBQyxDQUFDLENBQUE7WUFDNUYsTUFBTSxtQkFBTSxJQUFJLEVBQUssR0FBRyxFQUFLLEdBQUcsRUFBRTtRQUNwQyxDQUFDO0tBQUE7SUFFYSxRQUFRLENBQ3BCLFNBQW1CLEVBQ25CLEdBQXdCLEVBQ3hCLE9BR0M7O1lBRUQsRUFBRSxDQUFDLENBQUMsSUFBSSxDQUFDLE1BQU0sQ0FBQyxHQUFHLENBQUMsaUNBQWlDLENBQUMsQ0FBQyxDQUFDLENBQUM7Z0JBQ3ZELFNBQVMsR0FBRyxRQUFRLENBQUE7WUFDdEIsQ0FBQztZQUNELE1BQU0sT0FBTyxHQUFHLE1BQU0sSUFBSSxDQUFDLFdBQVcsQ0FBQyxHQUFHLENBQUMsQ0FBQTtZQUMzQyxNQUFNLE9BQU8sR0FBRyxJQUFJLENBQUMsYUFBYSxDQUFDLFNBQVMsQ0FBQyxDQUFDLEdBQUcsQ0FBQztnQkFDaEQsSUFBSSxDQUFDLE9BQU8sQ0FBQyxJQUFJLENBQUMsZ0JBQWdCLENBQUMsQ0FBQTtnQkFDbkMsSUFBSSxDQUFDO29CQUNILE1BQU0sUUFBUSxHQUFHLE1BQU0sSUFBSSxDQUFDLFdBQVcsQ0FBQyxHQUFHLENBQUMsQ0FBQTtvQkFDNUMsRUFBRSxDQUFDLENBQUMsUUFBUSxDQUFDLE9BQU8sQ0FBQyxDQUFDLENBQUM7d0JBQUMsTUFBTSxJQUFJLEtBQUssQ0FBQyw4QkFBOEIsQ0FBQyxDQUFBO29CQUFDLENBQUM7b0JBQ3pFLE1BQU0sQ0FBQyxPQUFPLENBQUMsR0FBRyxtQkFDYixPQUFPLElBQ1YsY0FBYyxFQUFFLFFBQVEsQ0FBQyxjQUFjLEVBQ3ZDLFVBQVUsRUFBRSxRQUFRLENBQUMsVUFBVSxFQUMvQixhQUFhLEVBQUUsUUFBUSxDQUFDLGFBQWEsSUFDckMsQ0FBQTtnQkFDSixDQUFDO2dCQUFDLEtBQUssQ0FBQyxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUM7b0JBQ1gsSUFBSSxDQUFDLElBQUksQ0FBQyxHQUFHLENBQUMsQ0FBQTtvQkFDZCxNQUFNLEdBQUcsQ0FBQTtnQkFDYixDQUFDO1lBQ0gsQ0FBQyxDQUFBLENBQUMsQ0FBQTtZQUNGLE9BQU8sQ0FBQyxJQUFJLENBQUMsQ0FBQyxHQUFHO2dCQUNmLE1BQU0sRUFBRSxHQUFHLENBQUMsRUFBWTtvQkFDdEIsTUFBTSxDQUFDLEdBQUcsSUFBSSxDQUFDLGFBQWEsQ0FBQyxFQUFFLENBQUMsQ0FBQTtvQkFDaEMsTUFBTSxDQUFDLENBQUMsQ0FBQyxDQUFDLGNBQWMsRUFBRSxHQUFHLENBQUMsQ0FBQyxnQkFBZ0IsRUFBRSxDQUFDLEtBQUssQ0FBQyxDQUFBO2dCQUMxRCxDQUFDLENBQUE7Z0JBQ0QsRUFBRSxDQUFDLENBQUMsRUFBRSxDQUFDLFNBQVMsQ0FBQyxDQUFDLENBQUMsQ0FBQztvQkFDbEIsSUFBSSxDQUFDLE9BQU8sQ0FBQyxJQUFJLENBQUMsWUFBWSxFQUFFLEVBQUUsS0FBSyxFQUFFLFNBQVMsRUFBRSxDQUFDLENBQUE7b0JBQ3JELEVBQUUsQ0FBQyxDQUFDLE1BQU0sQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLGFBQWEsQ0FBQyxDQUFDLEtBQUssQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDLENBQUM7d0JBQzlDLElBQUksQ0FBQyxPQUFPLENBQUMsSUFBSSxDQUFDLGNBQWMsQ0FBQyxDQUFBO29CQUNuQyxDQUFDO2dCQUNILENBQUM7WUFDSCxDQUFDLENBQUMsQ0FBQTtZQUNGLE1BQU0sQ0FBQyxPQUFPLENBQUE7UUFDaEIsQ0FBQztLQUFBO0lBRWEsbUJBQW1CLENBQUUsR0FBcUIsRUFBRSxNQUE0QixFQUFFLElBQWE7O1lBQ25HLElBQUksUUFBUSxDQUFBO1lBQ1osRUFBRSxDQUFDLENBQUMsTUFBTSxDQUFDLE9BQU8sRUFBRSxDQUFDLENBQUMsQ0FBQztnQkFBQyxNQUFNLENBQUMsRUFBRSxDQUFBO1lBQUMsQ0FBQztZQUNuQyxFQUFFLENBQUMsQ0FBQyxDQUFFLE1BQU0sQ0FBQyxNQUFNLEVBQUUsQ0FBQyxDQUFDLENBQUM7Z0JBQUMsTUFBTSxDQUFDLEVBQUUsQ0FBQTtZQUFDLENBQUM7WUFHcEMsSUFBSSxHQUFHLEdBQUcsTUFBTSxDQUFDLE1BQU0sRUFBRSxDQUFBO1lBQ3pCLE1BQU0sTUFBTSxHQUFHLE1BQU0sQ0FBQyxNQUFNLEVBQUUsQ0FBQTtZQUM5QixJQUFJLElBQUksQ0FBQTtZQUNSLElBQUksQ0FBQztnQkFDSCxFQUFFLENBQUMsQ0FBQyxDQUFDLEdBQUcsS0FBSyxNQUFNLENBQUMsSUFBSSxDQUFDLGNBQU8sQ0FBQyxHQUFHLENBQUMsS0FBSyxNQUFNLENBQUMsQ0FBQyxDQUFDLENBQUM7b0JBQ2xELEdBQUcsR0FBRyxHQUFHLENBQUMsS0FBSyxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQyxDQUFBO29CQUN0QixJQUFJLEdBQUcsTUFBTSwwQkFBSyxDQUFDLE1BQU0sRUFBRSxNQUFNLENBQUMsT0FBTyxFQUFFLENBQUMsQ0FBQTtnQkFDOUMsQ0FBQztnQkFBQyxJQUFJLENBQUMsRUFBRSxDQUFDLENBQUMsTUFBTSxDQUFDLFVBQVUsRUFBRSxDQUFDLENBQUMsQ0FBQztvQkFDL0IsSUFBSSxHQUFHLE1BQU0sQ0FBQyxPQUFPLEVBQUUsQ0FBQTtnQkFDekIsQ0FBQztZQUNILENBQUM7WUFBQyxLQUFLLENBQUMsQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDO2dCQUVmLE1BQU0sQ0FBQyxHQUFJLEtBQWUsQ0FBQyxPQUFPLENBQUMsS0FBSyxDQUFDLDJCQUEyQixDQUFDLENBQUE7Z0JBQ3JFLEVBQUUsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQztvQkFBQyxNQUFNLEtBQUssQ0FBQTtnQkFBQyxDQUFDO2dCQUN2QixNQUFNLENBQUMsSUFBSSxFQUFFLElBQUksRUFBRSxJQUFJLENBQUMsR0FBRyxDQUFDLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQyxDQUFBO2dCQUNyQyxNQUFNLENBQUMsQ0FBQzt3QkFDTixHQUFHLEVBQUUsSUFBSTt3QkFDVCxRQUFRLEVBQUUsSUFBSSxZQUFLLENBQUMsUUFBUSxDQUFDLElBQUksRUFBRSxFQUFFLENBQUMsR0FBRyxDQUFDLEVBQUUsQ0FBQyxDQUFDO3dCQUM5QyxPQUFPLEVBQUUsSUFBSTt3QkFDYixRQUFRLEVBQUUsTUFBTTtxQkFDakIsQ0FBQyxDQUFBO1lBQ0osQ0FBQztZQUdELEVBQUUsQ0FBQyxDQUFDLEdBQUcsS0FBSyxNQUFNLENBQUMsQ0FBQyxDQUFDO2dCQUNuQixNQUFNLElBQUksR0FBYSxJQUFJLENBQUMsTUFBTSxDQUFDLEdBQUcsQ0FBQyw4QkFBOEIsQ0FBQyxDQUFBO2dCQUN0RSxRQUFRLEdBQUcsRUFBRSxDQUFBO2dCQUNiLEdBQUcsQ0FBQyxDQUFDLE1BQU0sR0FBRyxJQUFJLElBQUksQ0FBQyxDQUFDLENBQUM7b0JBQ3ZCLFFBQVEsQ0FBQyxJQUFJLENBQUMsWUFBWSxFQUFFLEdBQUcsQ0FBQyxDQUFBO2dCQUNsQyxDQUFDO1lBQ0gsQ0FBQztZQUVELE1BQU0sT0FBTyxHQUFHLE1BQU0sSUFBSSxDQUFDLFVBQVUsQ0FBQyxNQUFNLENBQUMsQ0FBQTtZQUU3QyxNQUFNLEtBQUssR0FBRyxNQUFNLElBQUksQ0FBQyxRQUFRLENBQUMsV0FBVyxFQUFFLE9BQU8sRUFBRTtnQkFDdEQsV0FBVyxFQUFFLElBQUk7Z0JBQ2pCLE9BQU8sRUFBRSxHQUFHO2dCQUNaLEdBQUc7Z0JBQ0gsSUFBSTtnQkFDSixRQUFRO2FBQ1QsQ0FBQyxDQUFBO1lBRUYsTUFBTSxFQUFFLEdBQUcsOERBQThELENBQUE7WUFDekUsTUFBTSxHQUFHLEdBQUcsRUFBRSxDQUFBO1lBQ2QsR0FBRyxDQUFDLENBQUMsTUFBTSxJQUFJLElBQUksS0FBSyxDQUFDLENBQUMsQ0FBQztnQkFDekIsTUFBTSxLQUFLLEdBQUcsSUFBSSxDQUFDLEtBQUssQ0FBQyxFQUFFLENBQUMsQ0FBQTtnQkFDNUIsRUFBRSxDQUFDLENBQUMsQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDO29CQUNYLEVBQUUsQ0FBQyxDQUFDLElBQUksQ0FBQyxJQUFJLEVBQUUsQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDO3dCQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsaUJBQWlCLElBQUksRUFBRSxDQUFDLENBQUE7b0JBQUMsQ0FBQztvQkFDOUQsUUFBUSxDQUFBO2dCQUNWLENBQUM7Z0JBQ0QsTUFBTSxDQUFDLEtBQUssRUFBRSxHQUFHLEVBQUUsR0FBRyxFQUFFLE9BQU8sRUFBRSxPQUFPLENBQUMsR0FBRyxLQUFLLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQyxDQUFBO2dCQUMxRCxFQUFFLENBQUMsQ0FBQyxLQUFLLEtBQUssT0FBTyxJQUFJLEdBQUcsS0FBSyxHQUFHLElBQUksR0FBRyxLQUFLLEdBQUcsQ0FBQyxDQUFDLENBQUM7b0JBQ3BELEVBQUUsQ0FBQyxDQUFDLE9BQU8sS0FBSyxPQUFPLENBQUMsQ0FBQyxDQUFDO3dCQUN4QixJQUFJLENBQUMsYUFBYSxDQUFDLFFBQVEsQ0FBQyxPQUFPLENBQUMsQ0FBQTt3QkFDcEMsUUFBUSxDQUFBO29CQUNWLENBQUM7b0JBQUMsSUFBSSxDQUFDLEVBQUUsQ0FBQyxDQUFDLE9BQU8sS0FBSyxTQUFTLENBQUMsQ0FBQyxDQUFDO3dCQUNqQyxJQUFJLENBQUMsYUFBYSxDQUFDLFVBQVUsQ0FBQyxPQUFPLENBQUMsQ0FBQTt3QkFDdEMsUUFBUSxDQUFBO29CQUNWLENBQUM7Z0JBQ0gsQ0FBQztnQkFFRCxNQUFNLElBQUksR0FBRyxHQUFHLENBQUMsUUFBUSxDQUFDLEtBQUssQ0FBQyxHQUFHLE1BQU0sR0FBRyxLQUFLLENBQUE7Z0JBQ2pELE1BQU0sUUFBUSxHQUNaLEdBQUcsS0FBSyxNQUFNO29CQUNaLE1BQU07c0JBQ0osT0FBTyxLQUFLLFNBQVM7d0JBQ3JCLFNBQVM7OzRCQUVULE9BQU8sQ0FBQTtnQkFDYixNQUFNLE9BQU8sR0FBRyxJQUFJLFlBQUssQ0FBQyxRQUFRLENBQUMsR0FBRyxFQUFFLEVBQUUsQ0FBQyxHQUFHLENBQUMsRUFBRSxRQUFRLENBQUMsR0FBRyxFQUFFLEVBQUUsQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFBO2dCQUN2RSxNQUFNLFFBQVEsR0FBRyxJQUFJLENBQUMsa0JBQWtCLENBQUMsTUFBTSxFQUFFLE9BQU8sQ0FBQyxDQUFBO2dCQUN6RCxJQUFJLEtBQUssQ0FBQTtnQkFDVCxJQUFJLENBQUM7b0JBQ0gsS0FBSyxHQUFHLE9BQU8sQ0FBQyxPQUFPLENBQUMsT0FBTyxDQUFDLFVBQVUsQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLE9BQU8sRUFBRSxDQUFBO2dCQUM3RCxDQUFDO2dCQUFDLEtBQUssQ0FBQyxDQUFDLEtBQUssQ0FBQyxDQUFDLENBQUM7b0JBQ2YsS0FBSyxHQUFHLElBQUksQ0FBQTtnQkFDZCxDQUFDO2dCQUNELEdBQUcsQ0FBQyxJQUFJLENBQUM7b0JBQ1AsR0FBRyxFQUFFLEtBQUs7b0JBQ1YsUUFBUTtvQkFDUixPQUFPO29CQUNQLFFBQVE7aUJBQ1QsQ0FBQyxDQUFBO1lBQ0osQ0FBQztZQUNELE1BQU0sQ0FBQyxHQUFHLENBQUE7UUFDWixDQUFDO0tBQUE7Q0FDRjtBQTlsQkQsd0NBOGxCQyIsInNvdXJjZXNDb250ZW50IjpbIi8qXG4gKiBkZWNhZmZlaW5hdGUgc3VnZ2VzdGlvbnM6XG4gKiBEUzEwMTogUmVtb3ZlIHVubmVjZXNzYXJ5IHVzZSBvZiBBcnJheS5mcm9tXG4gKiBEUzEwMjogUmVtb3ZlIHVubmVjZXNzYXJ5IGNvZGUgY3JlYXRlZCBiZWNhdXNlIG9mIGltcGxpY2l0IHJldHVybnNcbiAqIERTMTAzOiBSZXdyaXRlIGNvZGUgdG8gbm8gbG9uZ2VyIHVzZSBfX2d1YXJkX19cbiAqIERTMTA0OiBBdm9pZCBpbmxpbmUgYXNzaWdubWVudHNcbiAqIERTMjAxOiBTaW1wbGlmeSBjb21wbGV4IGRlc3RydWN0dXJlIGFzc2lnbm1lbnRzXG4gKiBEUzIwNTogQ29uc2lkZXIgcmV3b3JraW5nIGNvZGUgdG8gYXZvaWQgdXNlIG9mIElJRkVzXG4gKiBEUzIwNjogQ29uc2lkZXIgcmV3b3JraW5nIGNsYXNzZXMgdG8gYXZvaWQgaW5pdENsYXNzXG4gKiBEUzIwNzogQ29uc2lkZXIgc2hvcnRlciB2YXJpYXRpb25zIG9mIG51bGwgY2hlY2tzXG4gKiBGdWxsIGRvY3M6IGh0dHBzOi8vZ2l0aHViLmNvbS9kZWNhZmZlaW5hdGUvZGVjYWZmZWluYXRlL2Jsb2IvbWFzdGVyL2RvY3Mvc3VnZ2VzdGlvbnMubWRcbiAqL1xuaW1wb3J0IHsgUmFuZ2UsIFBvaW50LCBFbWl0dGVyLCBDb21wb3NpdGVEaXNwb3NhYmxlLCBEaXJlY3RvcnkgfSBmcm9tICdhdG9tJ1xuaW1wb3J0ICogYXMgVXRpbCBmcm9tICcuLi91dGlsJ1xuaW1wb3J0IHsgZXh0bmFtZSB9IGZyb20gJ3BhdGgnXG5pbXBvcnQgUXVldWUgPSByZXF1aXJlKCdwcm9taXNlLXF1ZXVlJylcbmltcG9ydCB7IHVubGl0IH0gZnJvbSAnYXRvbS1oYXNrZWxsLXV0aWxzJ1xuXG5pbXBvcnQgeyBHaGNNb2RpUHJvY2Vzc1JlYWwsIEdIQ01vZENhcHMgfSBmcm9tICcuL2doYy1tb2RpLXByb2Nlc3MtcmVhbCdcblxudHlwZSBDb21tYW5kcyA9ICdjaGVja2xpbnQnIHwgJ2Jyb3dzZScgfCAndHlwZWluZm8nIHwgJ2ZpbmQnIHwgJ2luaXQnIHwgJ2xpc3QnIHwgJ2xvd21lbSdcblxuZXhwb3J0IHR5cGUgU3ltYm9sVHlwZSA9ICd0eXBlJyB8ICdjbGFzcycgfCAnZnVuY3Rpb24nXG5cbmV4cG9ydCBpbnRlcmZhY2UgU3ltYm9sRGVzYyB7XG4gIG5hbWU6IHN0cmluZyxcbiAgc3ltYm9sVHlwZTogU3ltYm9sVHlwZSxcbiAgdHlwZVNpZ25hdHVyZT86IHN0cmluZyxcbiAgcGFyZW50Pzogc3RyaW5nXG59XG5cbmV4cG9ydCBjbGFzcyBHaGNNb2RpUHJvY2VzcyB7XG4gIHByaXZhdGUgYmFja2VuZDogTWFwPHN0cmluZywgUHJvbWlzZTxHaGNNb2RpUHJvY2Vzc1JlYWw+PlxuICBwcml2YXRlIGRpc3Bvc2FibGVzOiBDb21wb3NpdGVEaXNwb3NhYmxlXG4gIHByaXZhdGUgZW1pdHRlcjogRW1pdHRlclxuICBwcml2YXRlIGJ1ZmZlckRpck1hcDogV2Vha01hcDxBdG9tVHlwZXMuVGV4dEJ1ZmZlciwgQXRvbVR5cGVzLkRpcmVjdG9yeT5cbiAgcHJpdmF0ZSBjb21tYW5kUXVldWVzOiB7W0sgaW4gQ29tbWFuZHNdOiBRdWV1ZX1cbiAgcHJpdmF0ZSBjYXBzOiBHSENNb2RDYXBzXG5cbiAgY29uc3RydWN0b3IgKCkge1xuICAgIHRoaXMuZGlzcG9zYWJsZXMgPSBuZXcgQ29tcG9zaXRlRGlzcG9zYWJsZSgpXG4gICAgdGhpcy5lbWl0dGVyID0gbmV3IEVtaXR0ZXIoKVxuICAgIHRoaXMuZGlzcG9zYWJsZXMuYWRkKHRoaXMuZW1pdHRlcilcbiAgICB0aGlzLmJ1ZmZlckRpck1hcCA9IG5ldyBXZWFrTWFwKClcbiAgICB0aGlzLmJhY2tlbmQgPSBuZXcgTWFwKClcblxuICAgIGlmIChwcm9jZXNzLmVudi5HSENfUEFDS0FHRV9QQVRIICYmICFhdG9tLmNvbmZpZy5nZXQoJ2hhc2tlbGwtZ2hjLW1vZC5zdXBwcmVzc0doY1BhY2thZ2VQYXRoV2FybmluZycpKSB7XG4gICAgICBhdG9tLm5vdGlmaWNhdGlvbnMuYWRkV2FybmluZyhgXFxcbmhhc2tlbGwtZ2hjLW1vZDogWW91IGhhdmUgR0hDX1BBQ0tBR0VfUEFUSCBlbnZpcm9ubWVudCB2YXJpYWJsZSBzZXQhXFxcbmAsICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHtcbiAgICAgICAgICBkaXNtaXNzYWJsZTogdHJ1ZSxcbiAgICAgICAgICBkZXRhaWw6IGBcXFxuVGhpcyBjb25maWd1cmF0aW9uIGlzIG5vdCBzdXBwb3J0ZWQsIGFuZCBjYW4gYnJlYWsgYXJiaXRyYXJpbHkuIFlvdSBjYW4gdHJ5IHRvIGJhbmQtYWlkIGl0IGJ5IGFkZGluZ1xuXG5kZWxldGUgcHJvY2Vzcy5lbnYuR0hDX1BBQ0tBR0VfUEFUSFxuXG50byB5b3VyIEF0b20gaW5pdCBzY3JpcHQgKEVkaXQg4oaSIEluaXQgU2NyaXB0Li4uKVxuXG5Zb3UgY2FuIHN1cHByZXNzIHRoaXMgd2FybmluZyBpbiBoYXNrZWxsLWdoYy1tb2Qgc2V0dGluZ3MuXFxcbmBcbiAgICAgICAgfVxuICAgICAgKVxuICAgIH1cblxuICAgIHRoaXMuY3JlYXRlUXVldWVzKClcbiAgfVxuXG4gIHB1YmxpYyBhc3luYyBnZXRSb290RGlyIChidWZmZXI6IEF0b21UeXBlcy5UZXh0QnVmZmVyKTogUHJvbWlzZTxBdG9tVHlwZXMuRGlyZWN0b3J5PiB7XG4gICAgbGV0IGRpclxuICAgIGRpciA9IHRoaXMuYnVmZmVyRGlyTWFwLmdldChidWZmZXIpXG4gICAgaWYgKGRpcikge1xuICAgICAgcmV0dXJuIGRpclxuICAgIH1cbiAgICBkaXIgPSBhd2FpdCBVdGlsLmdldFJvb3REaXIoYnVmZmVyKVxuICAgIHRoaXMuYnVmZmVyRGlyTWFwLnNldChidWZmZXIsIGRpcilcbiAgICByZXR1cm4gZGlyXG4gIH1cblxuICBwdWJsaWMga2lsbFByb2Nlc3MgKCkge1xuICAgIGZvciAoY29uc3QgYnAgb2YgdGhpcy5iYWNrZW5kLnZhbHVlcygpKSB7XG4gICAgICBicC50aGVuKChiKSA9PiBiLmtpbGxQcm9jZXNzKCkpXG4gICAgfVxuICAgIHRoaXMuYmFja2VuZC5jbGVhcigpXG4gIH1cblxuICBwdWJsaWMgZGVzdHJveSAoKSB7XG4gICAgZm9yIChjb25zdCBicCBvZiB0aGlzLmJhY2tlbmQudmFsdWVzKCkpIHtcbiAgICAgIGJwLnRoZW4oKGIpID0+IGIuZGVzdHJveSgpKVxuICAgIH1cbiAgICB0aGlzLmJhY2tlbmQuY2xlYXIoKVxuICAgIHRoaXMuZW1pdHRlci5lbWl0KCdkaWQtZGVzdHJveScpXG4gICAgdGhpcy5kaXNwb3NhYmxlcy5kaXNwb3NlKClcbiAgfVxuXG4gIHB1YmxpYyBvbkRpZERlc3Ryb3kgKGNhbGxiYWNrOiAoKSA9PiB2b2lkKSB7XG4gICAgcmV0dXJuIHRoaXMuZW1pdHRlci5vbignZGlkLWRlc3Ryb3knLCBjYWxsYmFjaylcbiAgfVxuXG4gIHB1YmxpYyBvbkJhY2tlbmRBY3RpdmUgKGNhbGxiYWNrOiAoKSA9PiB2b2lkKSB7XG4gICAgcmV0dXJuIHRoaXMuZW1pdHRlci5vbignYmFja2VuZC1hY3RpdmUnLCBjYWxsYmFjaylcbiAgfVxuXG4gIHB1YmxpYyBvbkJhY2tlbmRJZGxlIChjYWxsYmFjazogKCkgPT4gdm9pZCkge1xuICAgIHJldHVybiB0aGlzLmVtaXR0ZXIub24oJ2JhY2tlbmQtaWRsZScsIGNhbGxiYWNrKVxuICB9XG5cbiAgcHVibGljIG9uUXVldWVJZGxlIChjYWxsYmFjazogKCkgPT4gdm9pZCkge1xuICAgIHJldHVybiB0aGlzLmVtaXR0ZXIub24oJ3F1ZXVlLWlkbGUnLCBjYWxsYmFjaylcbiAgfVxuXG4gIHB1YmxpYyBhc3luYyBydW5MaXN0IChidWZmZXI6IEF0b21UeXBlcy5UZXh0QnVmZmVyKSB7XG4gICAgcmV0dXJuIHRoaXMucXVldWVDbWQoJ2xpc3QnLCBhd2FpdCB0aGlzLmdldFJvb3REaXIoYnVmZmVyKSwgeyBjb21tYW5kOiAnbGlzdCcgfSlcbiAgfVxuXG4gIHB1YmxpYyBhc3luYyBydW5MYW5nIChkaXI6IEF0b21UeXBlcy5EaXJlY3RvcnkpIHtcbiAgICByZXR1cm4gdGhpcy5xdWV1ZUNtZCgnaW5pdCcsIGRpciwgeyBjb21tYW5kOiAnbGFuZycgfSlcbiAgfVxuXG4gIHB1YmxpYyBhc3luYyBydW5GbGFnIChkaXI6IEF0b21UeXBlcy5EaXJlY3RvcnkpIHtcbiAgICByZXR1cm4gdGhpcy5xdWV1ZUNtZCgnaW5pdCcsIGRpciwgeyBjb21tYW5kOiAnZmxhZycgfSlcbiAgfVxuXG4gIHB1YmxpYyBhc3luYyBydW5Ccm93c2UgKHJvb3REaXI6IEF0b21UeXBlcy5EaXJlY3RvcnksIG1vZHVsZXM6IHN0cmluZ1tdKTogUHJvbWlzZTxTeW1ib2xEZXNjW10+IHtcbiAgICBjb25zdCBsaW5lcyA9IGF3YWl0IHRoaXMucXVldWVDbWQoJ2Jyb3dzZScsIHJvb3REaXIsIHtcbiAgICAgIGNvbW1hbmQ6ICdicm93c2UnLFxuICAgICAgZGFzaEFyZ3MgKGNhcHMpIHtcbiAgICAgICAgY29uc3QgYXJncyA9IFsnLWQnXVxuICAgICAgICBpZiAoY2Fwcy5icm93c2VQYXJlbnRzKSB7IGFyZ3MucHVzaCgnLXAnKSB9XG4gICAgICAgIHJldHVybiBhcmdzXG4gICAgICB9LFxuICAgICAgYXJnczogbW9kdWxlc1xuICAgIH0pXG4gICAgcmV0dXJuIGxpbmVzLm1hcCgocykgPT4ge1xuICAgICAgLy8gZW51bUZyb20gOjogRW51bSBhID0+IGEgLT4gW2FdIC0tIGZyb206RW51bVxuICAgICAgY29uc3QgcGF0dGVybiA9IHRoaXMuY2Fwcy5icm93c2VQYXJlbnRzID8gL14oLio/KSA6OiAoLio/KSg/OiAtLSBmcm9tOiguKikpPyQvIDogL14oLio/KSA6OiAoLiopJC9cbiAgICAgIGNvbnN0IG1hdGNoID0gcy5tYXRjaChwYXR0ZXJuKVxuICAgICAgbGV0IG5hbWUsIHR5cGVTaWduYXR1cmUsIHBhcmVudFxuICAgICAgaWYgKG1hdGNoKSB7XG4gICAgICAgIG5hbWUgPSBtYXRjaFsxXVxuICAgICAgICB0eXBlU2lnbmF0dXJlID0gbWF0Y2hbMl1cbiAgICAgICAgcGFyZW50ID0gbWF0Y2hbM11cbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIG5hbWUgPSBzXG4gICAgICB9XG4gICAgICBsZXQgc3ltYm9sVHlwZTogU3ltYm9sVHlwZVxuICAgICAgaWYgKHR5cGVTaWduYXR1cmUgJiYgL14oPzp0eXBlfGRhdGF8bmV3dHlwZSkvLnRlc3QodHlwZVNpZ25hdHVyZSkpIHtcbiAgICAgICAgc3ltYm9sVHlwZSA9ICd0eXBlJ1xuICAgICAgfSBlbHNlIGlmICh0eXBlU2lnbmF0dXJlICYmIC9eKD86Y2xhc3MpLy50ZXN0KHR5cGVTaWduYXR1cmUpKSB7XG4gICAgICAgIHN5bWJvbFR5cGUgPSAnY2xhc3MnXG4gICAgICB9IGVsc2Uge1xuICAgICAgICBzeW1ib2xUeXBlID0gJ2Z1bmN0aW9uJ1xuICAgICAgfVxuICAgICAgcmV0dXJuIHsgbmFtZSwgdHlwZVNpZ25hdHVyZSwgc3ltYm9sVHlwZSwgcGFyZW50IH1cbiAgICB9KVxuICB9XG5cbiAgcHVibGljIGFzeW5jIGdldFR5cGVJbkJ1ZmZlciAoXG4gICAgYnVmZmVyOiBBdG9tVHlwZXMuVGV4dEJ1ZmZlciwgY3JhbmdlOiBBdG9tVHlwZXMuUmFuZ2VcbiAgKSAge1xuICAgIGlmICghIGJ1ZmZlci5nZXRVcmkoKSkgeyB0aHJvdyBuZXcgRXJyb3IoJ05vIFVSSSBmb3IgYnVmZmVyJykgfVxuICAgIGNyYW5nZSA9IFV0aWwudGFiU2hpZnRGb3JSYW5nZShidWZmZXIsIGNyYW5nZSlcbiAgICBjb25zdCBsaW5lcyA9IGF3YWl0IHRoaXMucXVldWVDbWQoJ3R5cGVpbmZvJywgYXdhaXQgdGhpcy5nZXRSb290RGlyKGJ1ZmZlciksIHtcbiAgICAgIGludGVyYWN0aXZlOiB0cnVlLFxuICAgICAgY29tbWFuZDogJ3R5cGUnLFxuICAgICAgdXJpOiBidWZmZXIuZ2V0VXJpKCksXG4gICAgICB0ZXh0OiBidWZmZXIuaXNNb2RpZmllZCgpID8gYnVmZmVyLmdldFRleHQoKSA6IHVuZGVmaW5lZCxcbiAgICAgIGRhc2hBcmdzIChjYXBzKSB7XG4gICAgICAgIHJldHVybiBjYXBzLnR5cGVDb25zdHJhaW50cyA/IFsnLWMnXSA6IFtdXG4gICAgICB9LFxuICAgICAgYXJnczogW2NyYW5nZS5zdGFydC5yb3cgKyAxLCBjcmFuZ2Uuc3RhcnQuY29sdW1uICsgMV0ubWFwKCh2KSA9PiB2LnRvU3RyaW5nKCkpXG4gICAgfSlcblxuICAgIGNvbnN0IHJ4ID0gL14oXFxkKylcXHMrKFxcZCspXFxzKyhcXGQrKVxccysoXFxkKylcXHMrXCIoW15dKilcIiQvIC8vIFteXSBiYXNpY2FsbHkgbWVhbnMgXCJhbnl0aGluZ1wiLCBpbmNsLiBuZXdsaW5lc1xuICAgIGZvciAoY29uc3QgbGluZSBvZiBsaW5lcykge1xuICAgICAgY29uc3QgbWF0Y2ggPSBsaW5lLm1hdGNoKHJ4KVxuICAgICAgaWYgKCFtYXRjaCkgeyBjb250aW51ZSB9XG4gICAgICBjb25zdCBbcm93c3RhcnQsIGNvbHN0YXJ0LCByb3dlbmQsIGNvbGVuZCwgdHlwZV0gPSBtYXRjaC5zbGljZSgxKVxuICAgICAgY29uc3QgcmFuZ2UgPVxuICAgICAgICBSYW5nZS5mcm9tT2JqZWN0KFtcbiAgICAgICAgICBbcGFyc2VJbnQocm93c3RhcnQsIDEwKSAtIDEsIHBhcnNlSW50KGNvbHN0YXJ0LCAxMCkgLSAxXSxcbiAgICAgICAgICBbcGFyc2VJbnQocm93ZW5kLCAxMCkgLSAxLCBwYXJzZUludChjb2xlbmQsIDEwKSAtIDFdXG4gICAgICAgIF0pXG4gICAgICBpZiAocmFuZ2UuaXNFbXB0eSgpKSB7IGNvbnRpbnVlIH1cbiAgICAgIGlmICghcmFuZ2UuY29udGFpbnNSYW5nZShjcmFuZ2UpKSB7IGNvbnRpbnVlIH1cbiAgICAgIHJldHVybiB7XG4gICAgICAgIHJhbmdlOiBVdGlsLnRhYlVuc2hpZnRGb3JSYW5nZShidWZmZXIsIHJhbmdlKSxcbiAgICAgICAgdHlwZTogdHlwZS5yZXBsYWNlKC9cXFxcXCIvZywgJ1wiJylcbiAgICAgIH1cbiAgICB9XG4gICAgdGhyb3cgbmV3IEVycm9yKCdObyB0eXBlJylcbiAgfVxuXG4gIHB1YmxpYyBhc3luYyBkb0Nhc2VTcGxpdCAoYnVmZmVyOiBBdG9tVHlwZXMuVGV4dEJ1ZmZlciwgY3JhbmdlOiBBdG9tVHlwZXMuUmFuZ2UpIHtcbiAgICBpZiAoISBidWZmZXIuZ2V0VXJpKCkpIHsgdGhyb3cgbmV3IEVycm9yKCdObyBVUkkgZm9yIGJ1ZmZlcicpIH1cbiAgICBjcmFuZ2UgPSBVdGlsLnRhYlNoaWZ0Rm9yUmFuZ2UoYnVmZmVyLCBjcmFuZ2UpXG4gICAgY29uc3QgbGluZXMgPSBhd2FpdCB0aGlzLnF1ZXVlQ21kKCd0eXBlaW5mbycsIGF3YWl0IHRoaXMuZ2V0Um9vdERpcihidWZmZXIpLCB7XG4gICAgICBpbnRlcmFjdGl2ZTogdGhpcy5jYXBzLmludGVyYWN0aXZlQ2FzZVNwbGl0LFxuICAgICAgY29tbWFuZDogJ3NwbGl0JyxcbiAgICAgIHVyaTogYnVmZmVyLmdldFVyaSgpLFxuICAgICAgdGV4dDogYnVmZmVyLmlzTW9kaWZpZWQoKSA/IGJ1ZmZlci5nZXRUZXh0KCkgOiB1bmRlZmluZWQsXG4gICAgICBhcmdzOiBbY3JhbmdlLnN0YXJ0LnJvdyArIDEsIGNyYW5nZS5zdGFydC5jb2x1bW4gKyAxXS5tYXAoKHYpID0+IHYudG9TdHJpbmcoKSlcbiAgICB9KVxuXG4gICAgY29uc3QgcnggPSAvXihcXGQrKVxccysoXFxkKylcXHMrKFxcZCspXFxzKyhcXGQrKVxccytcIihbXl0qKVwiJC8gLy8gW15dIGJhc2ljYWxseSBtZWFucyBcImFueXRoaW5nXCIsIGluY2wuIG5ld2xpbmVzXG4gICAgY29uc3QgcmVzID0gW11cbiAgICBmb3IgKGNvbnN0IGxpbmUgb2YgbGluZXMpIHtcbiAgICAgIGNvbnN0IG1hdGNoID0gbGluZS5tYXRjaChyeClcbiAgICAgIGlmICghIG1hdGNoKSB7XG4gICAgICAgIFV0aWwud2FybihgZ2hjLW1vZCBzYXlzOiAke2xpbmV9YClcbiAgICAgICAgY29udGludWVcbiAgICAgIH1cbiAgICAgIGNvbnN0IFtyb3dzdGFydCwgY29sc3RhcnQsIHJvd2VuZCwgY29sZW5kLCB0ZXh0XSA9IG1hdGNoLnNsaWNlKDEpXG4gICAgICByZXMucHVzaCh7XG4gICAgICAgIHJhbmdlOlxuICAgICAgICBSYW5nZS5mcm9tT2JqZWN0KFtcbiAgICAgICAgICBbcGFyc2VJbnQocm93c3RhcnQsIDEwKSAtIDEsIHBhcnNlSW50KGNvbHN0YXJ0LCAxMCkgLSAxXSxcbiAgICAgICAgICBbcGFyc2VJbnQocm93ZW5kLCAxMCkgLSAxLCBwYXJzZUludChjb2xlbmQsIDEwKSAtIDFdXG4gICAgICAgIF0pLFxuICAgICAgICByZXBsYWNlbWVudDogdGV4dFxuICAgICAgfSlcbiAgICB9XG4gICAgcmV0dXJuIHJlc1xuICB9XG5cbiAgcHVibGljIGFzeW5jIGRvU2lnRmlsbCAoYnVmZmVyOiBBdG9tVHlwZXMuVGV4dEJ1ZmZlciwgY3JhbmdlOiBBdG9tVHlwZXMuUmFuZ2UpIHtcbiAgICBpZiAoISBidWZmZXIuZ2V0VXJpKCkpIHsgdGhyb3cgbmV3IEVycm9yKCdObyBVUkkgZm9yIGJ1ZmZlcicpIH1cbiAgICBjcmFuZ2UgPSBVdGlsLnRhYlNoaWZ0Rm9yUmFuZ2UoYnVmZmVyLCBjcmFuZ2UpXG4gICAgY29uc3QgbGluZXMgPSBhd2FpdCB0aGlzLnF1ZXVlQ21kKCd0eXBlaW5mbycsIGF3YWl0IHRoaXMuZ2V0Um9vdERpcihidWZmZXIpLCB7XG4gICAgICBpbnRlcmFjdGl2ZTogdGhpcy5jYXBzLmludGVyYWN0aXZlQ2FzZVNwbGl0LFxuICAgICAgY29tbWFuZDogJ3NpZycsXG4gICAgICB1cmk6IGJ1ZmZlci5nZXRVcmkoKSxcbiAgICAgIHRleHQ6IGJ1ZmZlci5pc01vZGlmaWVkKCkgPyBidWZmZXIuZ2V0VGV4dCgpIDogdW5kZWZpbmVkLFxuICAgICAgYXJnczogW2NyYW5nZS5zdGFydC5yb3cgKyAxLCBjcmFuZ2Uuc3RhcnQuY29sdW1uICsgMV0ubWFwKCh2KSA9PiB2LnRvU3RyaW5nKCkpXG4gICAgfSlcbiAgICBpZiAobGluZXMubGVuZ3RoIDwgMikgeyB0aHJvdyBuZXcgRXJyb3IoYENvdWxkIG5vdCB1bmRlcnN0YW5kIHJlc3BvbnNlOiAke2xpbmVzLmpvaW4oJ1xcbicpfWApIH1cbiAgICBjb25zdCByeCA9IC9eKFxcZCspXFxzKyhcXGQrKVxccysoXFxkKylcXHMrKFxcZCspJC8gLy8gcG9zaXRpb24gcnhcbiAgICBjb25zdCBtYXRjaCA9IGxpbmVzWzFdLm1hdGNoKHJ4KVxuICAgIGlmICghIG1hdGNoKSB7IHRocm93IG5ldyBFcnJvcihgQ291bGQgbm90IHVuZGVyc3RhbmQgcmVzcG9uc2U6ICR7bGluZXMuam9pbignXFxuJyl9YCkgfVxuICAgIGNvbnN0IFtyb3dzdGFydCwgY29sc3RhcnQsIHJvd2VuZCwgY29sZW5kXSA9IG1hdGNoLnNsaWNlKDEpXG4gICAgY29uc3QgcmFuZ2UgPVxuICAgICAgUmFuZ2UuZnJvbU9iamVjdChbXG4gICAgICAgIFtwYXJzZUludChyb3dzdGFydCwgMTApIC0gMSwgcGFyc2VJbnQoY29sc3RhcnQsIDEwKSAtIDFdLFxuICAgICAgICBbcGFyc2VJbnQocm93ZW5kLCAxMCkgLSAxLCBwYXJzZUludChjb2xlbmQsIDEwKSAtIDFdXG4gICAgICBdKVxuICAgIHJldHVybiB7XG4gICAgICB0eXBlOiBsaW5lc1swXSxcbiAgICAgIHJhbmdlLFxuICAgICAgYm9keTogbGluZXMuc2xpY2UoMikuam9pbignXFxuJylcbiAgICB9XG4gIH1cblxuICBwdWJsaWMgYXN5bmMgZ2V0SW5mb0luQnVmZmVyIChlZGl0b3I6IEF0b21UeXBlcy5UZXh0RWRpdG9yLCBjcmFuZ2U6IEF0b21UeXBlcy5SYW5nZSkge1xuICAgIGNvbnN0IGJ1ZmZlciA9IGVkaXRvci5nZXRCdWZmZXIoKVxuICAgIGlmICghYnVmZmVyLmdldFVyaSgpKSB7IHRocm93IG5ldyBFcnJvcignTm8gVVJJIGZvciBidWZmZXInKSB9XG4gICAgY29uc3QgeyBzeW1ib2wsIHJhbmdlIH0gPSBVdGlsLmdldFN5bWJvbEluUmFuZ2UoZWRpdG9yLCBjcmFuZ2UpXG5cbiAgICBjb25zdCBsaW5lcyA9IGF3YWl0IHRoaXMucXVldWVDbWQoJ3R5cGVpbmZvJywgYXdhaXQgdGhpcy5nZXRSb290RGlyKGJ1ZmZlciksIHtcbiAgICAgIGludGVyYWN0aXZlOiB0cnVlLFxuICAgICAgY29tbWFuZDogJ2luZm8nLFxuICAgICAgdXJpOiBidWZmZXIuZ2V0VXJpKCksXG4gICAgICB0ZXh0OiBidWZmZXIuaXNNb2RpZmllZCgpID8gYnVmZmVyLmdldFRleHQoKSA6IHVuZGVmaW5lZCxcbiAgICAgIGFyZ3M6IFtzeW1ib2xdXG4gICAgfSlcblxuICAgIGNvbnN0IGluZm8gPSBsaW5lcy5qb2luKCdcXG4nKVxuICAgIGlmICgoaW5mbyA9PT0gJ0Nhbm5vdCBzaG93IGluZm8nKSB8fCAhaW5mbykge1xuICAgICAgdGhyb3cgbmV3IEVycm9yKCdObyBpbmZvJylcbiAgICB9IGVsc2Uge1xuICAgICAgcmV0dXJuIHsgcmFuZ2UsIGluZm8gfVxuICAgIH1cbiAgfVxuXG4gIHB1YmxpYyBhc3luYyBmaW5kU3ltYm9sUHJvdmlkZXJzSW5CdWZmZXIgKGVkaXRvcjogQXRvbVR5cGVzLlRleHRFZGl0b3IsIGNyYW5nZTogQXRvbVR5cGVzLlJhbmdlKSB7XG4gICAgY29uc3QgYnVmZmVyID0gZWRpdG9yLmdldEJ1ZmZlcigpXG4gICAgY29uc3QgeyBzeW1ib2wgfSA9IFV0aWwuZ2V0U3ltYm9sSW5SYW5nZShlZGl0b3IsIGNyYW5nZSlcblxuICAgIHJldHVybiB0aGlzLnF1ZXVlQ21kKCdmaW5kJywgYXdhaXQgdGhpcy5nZXRSb290RGlyKGJ1ZmZlciksIHtcbiAgICAgIGludGVyYWN0aXZlOiB0cnVlLFxuICAgICAgY29tbWFuZDogJ2ZpbmQnLFxuICAgICAgYXJnczogW3N5bWJvbF1cbiAgICB9KVxuICB9XG5cbiAgcHVibGljIGFzeW5jIGRvQ2hlY2tCdWZmZXIgKGJ1ZmZlcjogQXRvbVR5cGVzLlRleHRCdWZmZXIsIGZhc3Q6IGJvb2xlYW4gPSBmYWxzZSkge1xuICAgIHJldHVybiB0aGlzLmRvQ2hlY2tPckxpbnRCdWZmZXIoJ2NoZWNrJywgYnVmZmVyLCBmYXN0KVxuICB9XG5cbiAgcHVibGljIGFzeW5jIGRvTGludEJ1ZmZlciAoYnVmZmVyOiBBdG9tVHlwZXMuVGV4dEJ1ZmZlciwgZmFzdDogYm9vbGVhbiA9IGZhbHNlKSB7XG4gICAgcmV0dXJuIHRoaXMuZG9DaGVja09yTGludEJ1ZmZlcignbGludCcsIGJ1ZmZlciwgZmFzdClcbiAgfVxuXG4gIHB1YmxpYyBhc3luYyBkb0NoZWNrQW5kTGludCAoYnVmZmVyOiBBdG9tVHlwZXMuVGV4dEJ1ZmZlciwgZmFzdDogYm9vbGVhbikge1xuICAgIGNvbnN0IFtjciwgbHJdID0gYXdhaXQgUHJvbWlzZS5hbGwoW3RoaXMuZG9DaGVja0J1ZmZlcihidWZmZXIsIGZhc3QpLCB0aGlzLmRvTGludEJ1ZmZlcihidWZmZXIsIGZhc3QpXSlcbiAgICByZXR1cm4gY3IuY29uY2F0KGxyKVxuICB9XG5cbiAgcHJpdmF0ZSBhc3luYyBpbml0QmFja2VuZCAocm9vdERpcjogQXRvbVR5cGVzLkRpcmVjdG9yeSk6IFByb21pc2U8R2hjTW9kaVByb2Nlc3NSZWFsPiB7XG4gICAgY29uc3Qgcm9vdFBhdGggPSByb290RGlyLmdldFBhdGgoKVxuICAgIGNvbnN0IGNhY2hlZCA9IHRoaXMuYmFja2VuZC5nZXQocm9vdFBhdGgpXG4gICAgaWYgKGNhY2hlZCkgeyByZXR1cm4gYXdhaXQgY2FjaGVkIH1cbiAgICBjb25zdCBuZXdCYWNrZW5kID0gdGhpcy5pbml0QmFja2VuZFJlYWwocm9vdERpcilcbiAgICB0aGlzLmJhY2tlbmQuc2V0KHJvb3RQYXRoLCBuZXdCYWNrZW5kKVxuICAgIHJldHVybiBhd2FpdCBuZXdCYWNrZW5kXG4gIH1cblxuICBwcml2YXRlIGFzeW5jIGluaXRCYWNrZW5kUmVhbCAocm9vdERpcjogQXRvbVR5cGVzLkRpcmVjdG9yeSk6IFByb21pc2U8R2hjTW9kaVByb2Nlc3NSZWFsPiB7XG4gICAgdHJ5IHtcbiAgICAgIGNvbnN0IG9wdHMgPSBhd2FpdCBVdGlsLmdldFByb2Nlc3NPcHRpb25zKHJvb3REaXIuZ2V0UGF0aCgpKVxuICAgICAgY29uc3QgdmVyc1AgPSB0aGlzLmdldFZlcnNpb24ob3B0cylcbiAgICAgIHZlcnNQLnRoZW4oKHYpID0+IHsgdGhpcy5jaGVja0NvbXAob3B0cywgdikgfSlcbiAgICAgIGNvbnN0IHZlcnMgPSBhd2FpdCB2ZXJzUFxuXG4gICAgICB0aGlzLmNhcHMgPSBhd2FpdCB0aGlzLmdldENhcHModmVycylcbiAgICAgIGNvbnN0IGJhY2tlbmQgPSBuZXcgR2hjTW9kaVByb2Nlc3NSZWFsKHRoaXMuY2Fwcywgcm9vdERpciwgb3B0cylcbiAgICAgIHJldHVybiBiYWNrZW5kXG4gICAgfSBjYXRjaCAoZXJyKSB7XG4gICAgICBhdG9tLm5vdGlmaWNhdGlvbnMuYWRkRmF0YWxFcnJvcihcbiAgICAgICAgYFxcXG5IYXNrZWxsLWdoYy1tb2Q6IGdoYy1tb2QgZmFpbGVkIHRvIGxhdW5jaC5cbkl0IGlzIHByb2JhYmx5IG1pc3Npbmcgb3IgbWlzY29uZmlndXJlZC4gJHtlcnIuY29kZX1gLFxuICAgICAgICB7XG4gICAgICAgICAgZGV0YWlsOiBgXFxcbiR7ZXJyfVxuUEFUSDogJHtwcm9jZXNzLmVudi5QQVRIfVxucGF0aDogJHtwcm9jZXNzLmVudi5wYXRofVxuUGF0aDogJHtwcm9jZXNzLmVudi5QYXRofVxcXG5gLFxuICAgICAgICAgIHN0YWNrOiBlcnIuc3RhY2ssXG4gICAgICAgICAgZGlzbWlzc2FibGU6IHRydWVcbiAgICAgICAgfVxuICAgICAgKVxuICAgICAgdGhyb3cgZXJyXG4gICAgfVxuICB9XG5cbiAgcHJpdmF0ZSBjcmVhdGVRdWV1ZXMgKCkge1xuICAgIHRoaXMuY29tbWFuZFF1ZXVlcyA9IHtcbiAgICAgIGNoZWNrbGludDogbmV3IFF1ZXVlKDIpLFxuICAgICAgYnJvd3NlOiBuZXcgUXVldWUoYXRvbS5jb25maWcuZ2V0KCdoYXNrZWxsLWdoYy1tb2QubWF4QnJvd3NlUHJvY2Vzc2VzJykpLFxuICAgICAgdHlwZWluZm86IG5ldyBRdWV1ZSgxKSxcbiAgICAgIGZpbmQ6IG5ldyBRdWV1ZSgxKSxcbiAgICAgIGluaXQ6IG5ldyBRdWV1ZSg0KSxcbiAgICAgIGxpc3Q6IG5ldyBRdWV1ZSgxKSxcbiAgICAgIGxvd21lbTogbmV3IFF1ZXVlKDEpXG4gICAgfVxuICAgIHRoaXMuZGlzcG9zYWJsZXMuYWRkKGF0b20uY29uZmlnLm9uRGlkQ2hhbmdlKCdoYXNrZWxsLWdoYy1tb2QubWF4QnJvd3NlUHJvY2Vzc2VzJywgKHtuZXdWYWx1ZX0pID0+XG4gICAgICB0aGlzLmNvbW1hbmRRdWV1ZXMuYnJvd3NlID0gbmV3IFF1ZXVlKG5ld1ZhbHVlIGFzIG51bWJlcikpXG4gICAgKVxuICB9XG5cbiAgcHJpdmF0ZSBhc3luYyBnZXRWZXJzaW9uIChvcHRzOiBVdGlsLkV4ZWNPcHRzKSB7XG4gICAgY29uc3QgdGltZW91dCA9IGF0b20uY29uZmlnLmdldCgnaGFza2VsbC1naGMtbW9kLmluaXRUaW1lb3V0JykgKiAxMDAwXG4gICAgY29uc3QgY21kID0gYXRvbS5jb25maWcuZ2V0KCdoYXNrZWxsLWdoYy1tb2QuZ2hjTW9kUGF0aCcpXG4gICAgY29uc3Qge3N0ZG91dH0gPSBhd2FpdCBVdGlsLmV4ZWNQcm9taXNlKGNtZCwgWyd2ZXJzaW9uJ10sIHsgdGltZW91dCwgLi4ub3B0cyB9KVxuICAgIGNvbnN0IHZlcnNSYXcgPSAvXmdoYy1tb2QgdmVyc2lvbiAoXFxkKylcXC4oXFxkKylcXC4oXFxkKykoPzpcXC4oXFxkKykpPy8uZXhlYyhzdGRvdXQpXG4gICAgaWYgKCF2ZXJzUmF3KSB7IHRocm93IG5ldyBFcnJvcihcIkNvdWxkbid0IGdldCBnaGMtbW9kIHZlcnNpb25cIikgfVxuICAgIGNvbnN0IHZlcnMgPSB2ZXJzUmF3LnNsaWNlKDEsIDUpLm1hcCgoaSkgPT4gcGFyc2VJbnQoaSwgMTApKVxuICAgIGNvbnN0IGNvbXBSYXcgPSAvR0hDICguKykkLy5leGVjKHN0ZG91dC50cmltKCkpXG4gICAgaWYgKCFjb21wUmF3KSB7IHRocm93IG5ldyBFcnJvcihcIkNvdWxkbid0IGdldCBnaGMgdmVyc2lvblwiKSB9XG4gICAgY29uc3QgY29tcCA9IGNvbXBSYXdbMV1cbiAgICBVdGlsLmRlYnVnKGBHaGMtbW9kICR7dmVyc30gYnVpbHQgd2l0aCAke2NvbXB9YClcbiAgICByZXR1cm4geyB2ZXJzLCBjb21wIH1cbiAgfVxuXG4gIHByaXZhdGUgYXN5bmMgY2hlY2tDb21wIChvcHRzOiBVdGlsLkV4ZWNPcHRzLCB7IGNvbXAgfToge2NvbXA6IHN0cmluZ30pIHtcbiAgICBjb25zdCB0aW1lb3V0ID0gYXRvbS5jb25maWcuZ2V0KCdoYXNrZWxsLWdoYy1tb2QuaW5pdFRpbWVvdXQnKSAqIDEwMDBcbiAgICBjb25zdCB0cnlXYXJuID0gYXN5bmMgKGNtZDogc3RyaW5nLCBhcmdzOiBzdHJpbmdbXSkgPT4ge1xuICAgICAgdHJ5IHtcbiAgICAgICAgcmV0dXJuIChhd2FpdCBVdGlsLmV4ZWNQcm9taXNlKGNtZCwgYXJncywgeyB0aW1lb3V0LCAuLi5vcHRzIH0pKS5zdGRvdXQudHJpbSgpXG4gICAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgICBVdGlsLndhcm4oZXJyb3IpXG4gICAgICB9XG4gICAgfVxuICAgIGNvbnN0IFtzdGFja2doYywgcGF0aGdoY10gPSBhd2FpdCBQcm9taXNlLmFsbChbXG4gICAgICB0cnlXYXJuKCdzdGFjaycsIFsnZ2hjJywgJy0tJywgJy0tbnVtZXJpYy12ZXJzaW9uJ10pLFxuICAgICAgdHJ5V2FybignZ2hjJywgWyctLW51bWVyaWMtdmVyc2lvbiddKSxcbiAgICBdKVxuICAgIFV0aWwuZGVidWcoYFN0YWNrIEdIQyB2ZXJzaW9uICR7c3RhY2tnaGN9YClcbiAgICBVdGlsLmRlYnVnKGBQYXRoIEdIQyB2ZXJzaW9uICR7cGF0aGdoY31gKVxuICAgIGlmIChzdGFja2doYyAmJiAoc3RhY2tnaGMgIT09IGNvbXApKSB7XG4gICAgICBjb25zdCB3YXJuID0gYFxcXG5HSEMgdmVyc2lvbiBpbiB5b3VyIFN0YWNrICcke3N0YWNrZ2hjfScgZG9lc24ndCBtYXRjaCB3aXRoIFxcXG5HSEMgdmVyc2lvbiB1c2VkIHRvIGJ1aWxkIGdoYy1tb2QgJyR7Y29tcH0nLiBUaGlzIGNhbiBsZWFkIHRvIFxcXG5wcm9ibGVtcyB3aGVuIHVzaW5nIFN0YWNrIHByb2plY3RzYFxuICAgICAgYXRvbS5ub3RpZmljYXRpb25zLmFkZFdhcm5pbmcod2FybilcbiAgICAgIFV0aWwud2Fybih3YXJuKVxuICAgIH1cbiAgICBpZiAocGF0aGdoYyAmJiAocGF0aGdoYyAhPT0gY29tcCkpIHtcbiAgICAgIGNvbnN0IHdhcm4gPSBgXFxcbkdIQyB2ZXJzaW9uIGluIHlvdXIgUEFUSCAnJHtwYXRoZ2hjfScgZG9lc24ndCBtYXRjaCB3aXRoIFxcXG5HSEMgdmVyc2lvbiB1c2VkIHRvIGJ1aWxkIGdoYy1tb2QgJyR7Y29tcH0nLiBUaGlzIGNhbiBsZWFkIHRvIFxcXG5wcm9ibGVtcyB3aGVuIHVzaW5nIENhYmFsIG9yIFBsYWluIHByb2plY3RzYFxuICAgICAgYXRvbS5ub3RpZmljYXRpb25zLmFkZFdhcm5pbmcod2FybilcbiAgICAgIFV0aWwud2Fybih3YXJuKVxuICAgIH1cbiAgfVxuXG4gIHByaXZhdGUgZ2V0Q2FwcyAoeyB2ZXJzIH06IHt2ZXJzOiBudW1iZXJbXX0pIHtcbiAgICBjb25zdCBjYXBzID0ge1xuICAgICAgdmVyc2lvbjogdmVycyxcbiAgICAgIGZpbGVNYXA6IGZhbHNlLFxuICAgICAgcXVvdGVBcmdzOiBmYWxzZSxcbiAgICAgIG9wdHBhcnNlOiBmYWxzZSxcbiAgICAgIHR5cGVDb25zdHJhaW50czogZmFsc2UsXG4gICAgICBicm93c2VQYXJlbnRzOiBmYWxzZSxcbiAgICAgIGludGVyYWN0aXZlQ2FzZVNwbGl0OiBmYWxzZSxcbiAgICAgIGltcG9ydGVkRnJvbTogZmFsc2VcbiAgICB9XG5cbiAgICBjb25zdCBhdExlYXN0ID0gKGI6IG51bWJlcltdKSA9PiB7XG4gICAgICBmb3IgKGxldCBpID0gMDsgaSA8IGIubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgY29uc3QgdiA9IGJbaV1cbiAgICAgICAgaWYgKHZlcnNbaV0gPiB2KSB7XG4gICAgICAgICAgcmV0dXJuIHRydWVcbiAgICAgICAgfSBlbHNlIGlmICh2ZXJzW2ldIDwgdikge1xuICAgICAgICAgIHJldHVybiBmYWxzZVxuICAgICAgICB9XG4gICAgICB9XG4gICAgICByZXR1cm4gdHJ1ZVxuICAgIH1cblxuICAgIGNvbnN0IGV4YWN0ID0gKGI6IG51bWJlcltdKSA9PiB7XG4gICAgICBmb3IgKGxldCBpID0gMDsgaSA8IGIubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgY29uc3QgdiA9IGJbaV1cbiAgICAgICAgaWYgKHZlcnNbaV0gIT09IHYpIHtcbiAgICAgICAgICByZXR1cm4gZmFsc2VcbiAgICAgICAgfVxuICAgICAgfVxuICAgICAgcmV0dXJuIHRydWVcbiAgICB9XG5cbiAgICBpZiAoIWF0TGVhc3QoWzUsIDRdKSkge1xuICAgICAgYXRvbS5ub3RpZmljYXRpb25zLmFkZEVycm9yKGBcXFxuSGFza2VsbC1naGMtbW9kOiBnaGMtbW9kIDwgNS40IGlzIG5vdCBzdXBwb3J0ZWQuIFxcXG5Vc2UgYXQgeW91ciBvd24gcmlzayBvciB1cGRhdGUgeW91ciBnaGMtbW9kIGluc3RhbGxhdGlvbmAsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgeyBkaXNtaXNzYWJsZTogdHJ1ZSB9KVxuICAgIH1cbiAgICBpZiAoZXhhY3QoWzUsIDRdKSkge1xuICAgICAgYXRvbS5ub3RpZmljYXRpb25zLmFkZFdhcm5pbmcoYFxcXG5IYXNrZWxsLWdoYy1tb2Q6IGdoYy1tb2QgNS40LiogaXMgZGVwcmVjYXRlZC4gXFxcblVzZSBhdCB5b3VyIG93biByaXNrIG9yIHVwZGF0ZSB5b3VyIGdoYy1tb2QgaW5zdGFsbGF0aW9uYCxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHsgZGlzbWlzc2FibGU6IHRydWUgfSlcbiAgICB9XG4gICAgaWYgKGF0TGVhc3QoWzUsIDRdKSkge1xuICAgICAgY2Fwcy5maWxlTWFwID0gdHJ1ZVxuICAgIH1cbiAgICBpZiAoYXRMZWFzdChbNSwgNV0pKSB7XG4gICAgICBjYXBzLnF1b3RlQXJncyA9IHRydWVcbiAgICAgIGNhcHMub3B0cGFyc2UgPSB0cnVlXG4gICAgfVxuICAgIGlmIChhdExlYXN0KFs1LCA2XSkpIHtcbiAgICAgIGNhcHMudHlwZUNvbnN0cmFpbnRzID0gdHJ1ZVxuICAgICAgY2Fwcy5icm93c2VQYXJlbnRzID0gdHJ1ZVxuICAgICAgY2Fwcy5pbnRlcmFjdGl2ZUNhc2VTcGxpdCA9IHRydWVcbiAgICB9XG4gICAgaWYgKGF0b20uY29uZmlnLmdldCgnaGFza2VsbC1naGMtbW9kLmV4cGVyaW1lbnRhbCcpKSB7XG4gICAgICBjYXBzLmltcG9ydGVkRnJvbSA9IHRydWVcbiAgICB9XG4gICAgVXRpbC5kZWJ1ZyhKU09OLnN0cmluZ2lmeShjYXBzKSlcbiAgICByZXR1cm4gY2Fwc1xuICB9XG5cbiAgcHJpdmF0ZSBhc3luYyBnZXRTZXR0aW5ncyAocnVuRGlyOiBBdG9tVHlwZXMuRGlyZWN0b3J5KSB7XG4gICAgY29uc3QgcmVhZFNldHRpbmdzID0gYXN5bmMgKGZpbGU6IEF0b21UeXBlcy5GaWxlKSA9PiB7XG4gICAgICB0cnkge1xuICAgICAgICBjb25zdCBleCA9IGF3YWl0IGZpbGUuZXhpc3RzKClcbiAgICAgICAgaWYgKGV4KSB7XG4gICAgICAgICAgY29uc3QgY29udGVudHMgPSBhd2FpdCBmaWxlLnJlYWQoKVxuICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICByZXR1cm4gSlNPTi5wYXJzZShjb250ZW50cylcbiAgICAgICAgICB9IGNhdGNoIChlcnIpIHtcbiAgICAgICAgICAgIGF0b20ubm90aWZpY2F0aW9ucy5hZGRFcnJvcihgRmFpbGVkIHRvIHBhcnNlICR7ZmlsZS5nZXRQYXRoKCl9YCwge1xuICAgICAgICAgICAgICBkZXRhaWw6IGVycixcbiAgICAgICAgICAgICAgZGlzbWlzc2FibGU6IHRydWVcbiAgICAgICAgICAgIH0pXG4gICAgICAgICAgICB0aHJvdyBlcnJcbiAgICAgICAgICB9XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgcmV0dXJuIHt9XG4gICAgICAgIH1cbiAgICAgIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgICAgIGlmIChlcnJvcikgeyBVdGlsLndhcm4oZXJyb3IpIH1cbiAgICAgICAgcmV0dXJuIHt9XG4gICAgICB9XG4gICAgfVxuXG4gICAgY29uc3QgbG9jYWxTZXR0aW5ncyA9IHJlYWRTZXR0aW5ncyhydW5EaXIuZ2V0RmlsZSgnLmhhc2tlbGwtZ2hjLW1vZC5qc29uJykpXG5cbiAgICBjb25zdCBbcHJvamVjdERpcl0gPSBBcnJheS5mcm9tKGF0b20ucHJvamVjdC5nZXREaXJlY3RvcmllcygpLmZpbHRlcigoZCkgPT4gZC5jb250YWlucyhydW5EaXIuZ2V0UGF0aCgpKSkpXG4gICAgY29uc3QgcHJvamVjdFNldHRpbmdzID1cbiAgICAgIHByb2plY3REaXIgP1xuICAgICAgICByZWFkU2V0dGluZ3MocHJvamVjdERpci5nZXRGaWxlKCcuaGFza2VsbC1naGMtbW9kLmpzb24nKSlcbiAgICAgICAgOlxuICAgICAgICBQcm9taXNlLnJlc29sdmUoe30pXG5cbiAgICBjb25zdCBjb25maWdEaXIgPSBuZXcgRGlyZWN0b3J5KGF0b20uZ2V0Q29uZmlnRGlyUGF0aCgpKVxuICAgIGNvbnN0IGdsb2JhbFNldHRpbmdzID0gcmVhZFNldHRpbmdzKGNvbmZpZ0Rpci5nZXRGaWxlKCdoYXNrZWxsLWdoYy1tb2QuanNvbicpKVxuXG4gICAgY29uc3QgW2dsb2IsIHByaiwgbG9jXSA9IGF3YWl0IFByb21pc2UuYWxsKFtnbG9iYWxTZXR0aW5ncywgcHJvamVjdFNldHRpbmdzLCBsb2NhbFNldHRpbmdzXSlcbiAgICByZXR1cm4geyAuLi5nbG9iLCAuLi5wcmosIC4uLmxvYyB9XG4gIH1cblxuICBwcml2YXRlIGFzeW5jIHF1ZXVlQ21kIChcbiAgICBxdWV1ZU5hbWU6IENvbW1hbmRzLFxuICAgIGRpcjogQXRvbVR5cGVzLkRpcmVjdG9yeSxcbiAgICBydW5BcmdzOiB7XG4gICAgICBjb21tYW5kOiBzdHJpbmcsIHRleHQ/OiBzdHJpbmcsIHVyaT86IHN0cmluZywgaW50ZXJhY3RpdmU/OiBib29sZWFuLFxuICAgICAgZGFzaEFyZ3M/OiBzdHJpbmdbXSB8ICgoY2FwczogR0hDTW9kQ2FwcykgPT4gc3RyaW5nW10pLCBhcmdzPzogc3RyaW5nW11cbiAgICB9XG4gICk6IFByb21pc2U8c3RyaW5nW10+IHtcbiAgICBpZiAoYXRvbS5jb25maWcuZ2V0KCdoYXNrZWxsLWdoYy1tb2QubG93TWVtb3J5U3lzdGVtJykpIHtcbiAgICAgIHF1ZXVlTmFtZSA9ICdsb3dtZW0nXG4gICAgfVxuICAgIGNvbnN0IGJhY2tlbmQgPSBhd2FpdCB0aGlzLmluaXRCYWNrZW5kKGRpcilcbiAgICBjb25zdCBwcm9taXNlID0gdGhpcy5jb21tYW5kUXVldWVzW3F1ZXVlTmFtZV0uYWRkKGFzeW5jICgpID0+IHtcbiAgICAgIHRoaXMuZW1pdHRlci5lbWl0KCdiYWNrZW5kLWFjdGl2ZScpXG4gICAgICB0cnkge1xuICAgICAgICBjb25zdCBzZXR0aW5ncyA9IGF3YWl0IHRoaXMuZ2V0U2V0dGluZ3MoZGlyKVxuICAgICAgICBpZiAoc2V0dGluZ3MuZGlzYWJsZSkgeyB0aHJvdyBuZXcgRXJyb3IoJ0doYy1tb2QgZGlzYWJsZWQgaW4gc2V0dGluZ3MnKSB9XG4gICAgICAgIHJldHVybiBiYWNrZW5kLnJ1bih7XG4gICAgICAgICAgLi4ucnVuQXJncyxcbiAgICAgICAgICBzdXBwcmVzc0Vycm9yczogc2V0dGluZ3Muc3VwcHJlc3NFcnJvcnMsXG4gICAgICAgICAgZ2hjT3B0aW9uczogc2V0dGluZ3MuZ2hjT3B0aW9ucyxcbiAgICAgICAgICBnaGNNb2RPcHRpb25zOiBzZXR0aW5ncy5naGNNb2RPcHRpb25zLFxuICAgICAgICB9KVxuICAgICAgfSBjYXRjaCAoZXJyKSB7XG4gICAgICAgICAgVXRpbC53YXJuKGVycilcbiAgICAgICAgICB0aHJvdyBlcnJcbiAgICAgIH1cbiAgICB9KVxuICAgIHByb21pc2UudGhlbigocmVzKSA9PiB7XG4gICAgICBjb25zdCBxZSA9IChxbjogQ29tbWFuZHMpID0+IHtcbiAgICAgICAgY29uc3QgcSA9IHRoaXMuY29tbWFuZFF1ZXVlc1txbl1cbiAgICAgICAgcmV0dXJuIChxLmdldFF1ZXVlTGVuZ3RoKCkgKyBxLmdldFBlbmRpbmdMZW5ndGgoKSkgPT09IDBcbiAgICAgIH1cbiAgICAgIGlmIChxZShxdWV1ZU5hbWUpKSB7XG4gICAgICAgIHRoaXMuZW1pdHRlci5lbWl0KCdxdWV1ZS1pZGxlJywgeyBxdWV1ZTogcXVldWVOYW1lIH0pXG4gICAgICAgIGlmIChPYmplY3Qua2V5cyh0aGlzLmNvbW1hbmRRdWV1ZXMpLmV2ZXJ5KHFlKSkge1xuICAgICAgICAgIHRoaXMuZW1pdHRlci5lbWl0KCdiYWNrZW5kLWlkbGUnKVxuICAgICAgICB9XG4gICAgICB9XG4gICAgfSlcbiAgICByZXR1cm4gcHJvbWlzZVxuICB9XG5cbiAgcHJpdmF0ZSBhc3luYyBkb0NoZWNrT3JMaW50QnVmZmVyIChjbWQ6ICdjaGVjaycgfCAnbGludCcsIGJ1ZmZlcjogQXRvbVR5cGVzLlRleHRCdWZmZXIsIGZhc3Q6IGJvb2xlYW4pIHtcbiAgICBsZXQgZGFzaEFyZ3NcbiAgICBpZiAoYnVmZmVyLmlzRW1wdHkoKSkgeyByZXR1cm4gW10gfVxuICAgIGlmICghIGJ1ZmZlci5nZXRVcmkoKSkgeyByZXR1cm4gW10gfVxuXG4gICAgLy8gQSBkaXJ0eSBoYWNrIHRvIG1ha2UgbGludCB3b3JrIHdpdGggbGhzXG4gICAgbGV0IHVyaSA9IGJ1ZmZlci5nZXRVcmkoKVxuICAgIGNvbnN0IG9sZHVyaSA9IGJ1ZmZlci5nZXRVcmkoKVxuICAgIGxldCB0ZXh0XG4gICAgdHJ5IHtcbiAgICAgIGlmICgoY21kID09PSAnbGludCcpICYmIChleHRuYW1lKHVyaSkgPT09ICcubGhzJykpIHtcbiAgICAgICAgdXJpID0gdXJpLnNsaWNlKDAsIC0xKVxuICAgICAgICB0ZXh0ID0gYXdhaXQgdW5saXQob2xkdXJpLCBidWZmZXIuZ2V0VGV4dCgpKVxuICAgICAgfSBlbHNlIGlmIChidWZmZXIuaXNNb2RpZmllZCgpKSB7XG4gICAgICAgIHRleHQgPSBidWZmZXIuZ2V0VGV4dCgpXG4gICAgICB9XG4gICAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICAgIC8vIFRPRE86IFJlamVjdFxuICAgICAgY29uc3QgbSA9IChlcnJvciBhcyBFcnJvcikubWVzc2FnZS5tYXRjaCgvXiguKj8pOihbMC05XSspOiAqKC4qKSAqJC8pXG4gICAgICBpZiAoIW0pIHsgdGhyb3cgZXJyb3IgfVxuICAgICAgY29uc3QgW3VyaTIsIGxpbmUsIG1lc3NdID0gbS5zbGljZSgxKVxuICAgICAgcmV0dXJuIFt7XG4gICAgICAgIHVyaTogdXJpMixcbiAgICAgICAgcG9zaXRpb246IG5ldyBQb2ludChwYXJzZUludChsaW5lLCAxMCkgLSAxLCAwKSxcbiAgICAgICAgbWVzc2FnZTogbWVzcyxcbiAgICAgICAgc2V2ZXJpdHk6ICdsaW50J1xuICAgICAgfV1cbiAgICB9XG4gICAgLy8gZW5kIG9mIGRpcnR5IGhhY2tcblxuICAgIGlmIChjbWQgPT09ICdsaW50Jykge1xuICAgICAgY29uc3Qgb3B0czogc3RyaW5nW10gPSBhdG9tLmNvbmZpZy5nZXQoJ2hhc2tlbGwtZ2hjLW1vZC5obGludE9wdGlvbnMnKVxuICAgICAgZGFzaEFyZ3MgPSBbXVxuICAgICAgZm9yIChjb25zdCBvcHQgb2Ygb3B0cykge1xuICAgICAgICBkYXNoQXJncy5wdXNoKCctLWhsaW50T3B0Jywgb3B0KVxuICAgICAgfVxuICAgIH1cblxuICAgIGNvbnN0IHJvb3REaXIgPSBhd2FpdCB0aGlzLmdldFJvb3REaXIoYnVmZmVyKVxuXG4gICAgY29uc3QgbGluZXMgPSBhd2FpdCB0aGlzLnF1ZXVlQ21kKCdjaGVja2xpbnQnLCByb290RGlyLCB7XG4gICAgICBpbnRlcmFjdGl2ZTogZmFzdCxcbiAgICAgIGNvbW1hbmQ6IGNtZCxcbiAgICAgIHVyaSxcbiAgICAgIHRleHQsXG4gICAgICBkYXNoQXJnc1xuICAgIH0pXG5cbiAgICBjb25zdCByeCA9IC9eKC4qPyk6KFswLTlcXHNdKyk6KFswLTlcXHNdKyk6ICooPzooV2FybmluZ3xFcnJvcik6ICopPyhbXl0qKS9cbiAgICBjb25zdCByZXMgPSBbXVxuICAgIGZvciAoY29uc3QgbGluZSBvZiBsaW5lcykge1xuICAgICAgY29uc3QgbWF0Y2ggPSBsaW5lLm1hdGNoKHJ4KVxuICAgICAgaWYgKCFtYXRjaCkge1xuICAgICAgICBpZiAobGluZS50cmltKCkubGVuZ3RoKSB7IFV0aWwud2FybihgZ2hjLW1vZCBzYXlzOiAke2xpbmV9YCkgfVxuICAgICAgICBjb250aW51ZVxuICAgICAgfVxuICAgICAgY29uc3QgW2ZpbGUyLCByb3csIGNvbCwgd2FybmluZywgbWVzc2FnZV0gPSBtYXRjaC5zbGljZSgxKVxuICAgICAgaWYgKGZpbGUyID09PSAnRHVtbXknICYmIHJvdyA9PT0gJzAnICYmIGNvbCA9PT0gJzAnKSB7XG4gICAgICAgIGlmICh3YXJuaW5nID09PSAnRXJyb3InKSB7XG4gICAgICAgICAgYXRvbS5ub3RpZmljYXRpb25zLmFkZEVycm9yKG1lc3NhZ2UpXG4gICAgICAgICAgY29udGludWVcbiAgICAgICAgfSBlbHNlIGlmICh3YXJuaW5nID09PSAnV2FybmluZycpIHtcbiAgICAgICAgICBhdG9tLm5vdGlmaWNhdGlvbnMuYWRkV2FybmluZyhtZXNzYWdlKVxuICAgICAgICAgIGNvbnRpbnVlXG4gICAgICAgIH1cbiAgICAgIH1cblxuICAgICAgY29uc3QgZmlsZSA9IHVyaS5lbmRzV2l0aChmaWxlMikgPyBvbGR1cmkgOiBmaWxlMlxuICAgICAgY29uc3Qgc2V2ZXJpdHkgPVxuICAgICAgICBjbWQgPT09ICdsaW50JyA/XG4gICAgICAgICAgJ2xpbnQnXG4gICAgICAgICAgOiB3YXJuaW5nID09PSAnV2FybmluZycgP1xuICAgICAgICAgICAgJ3dhcm5pbmcnXG4gICAgICAgICAgICA6XG4gICAgICAgICAgICAnZXJyb3InXG4gICAgICBjb25zdCBtZXNzUG9zID0gbmV3IFBvaW50KHBhcnNlSW50KHJvdywgMTApIC0gMSwgcGFyc2VJbnQoY29sLCAxMCkgLSAxKVxuICAgICAgY29uc3QgcG9zaXRpb24gPSBVdGlsLnRhYlVuc2hpZnRGb3JQb2ludChidWZmZXIsIG1lc3NQb3MpXG4gICAgICBsZXQgbXl1cmlcbiAgICAgIHRyeSB7XG4gICAgICAgIG15dXJpID0gcm9vdERpci5nZXRGaWxlKHJvb3REaXIucmVsYXRpdml6ZShmaWxlKSkuZ2V0UGF0aCgpXG4gICAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgICBteXVyaSA9IGZpbGVcbiAgICAgIH1cbiAgICAgIHJlcy5wdXNoKHtcbiAgICAgICAgdXJpOiBteXVyaSxcbiAgICAgICAgcG9zaXRpb24sXG4gICAgICAgIG1lc3NhZ2UsXG4gICAgICAgIHNldmVyaXR5XG4gICAgICB9KVxuICAgIH1cbiAgICByZXR1cm4gcmVzXG4gIH1cbn1cbiJdfQ==