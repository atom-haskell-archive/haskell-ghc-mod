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
        this.caps = new Promise((resolve) => this.resolveCapsPromise = resolve);
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
            const caps = yield this.resolveCaps(rootDir);
            if (caps.browseMain === false) {
                modules = modules.filter((v) => v !== 'Main');
            }
            if (modules.length === 0) {
                return [];
            }
            const lines = yield this.queueCmd('browse', rootDir, {
                command: 'browse',
                dashArgs: caps.browseParents ? ['-d', '-p'] : ['-d'],
                args: modules
            });
            return lines.map((s) => {
                const pattern = caps.browseParents ? /^(.*?) :: (.*?)(?: -- from:(.*))?$/ : /^(.*?) :: (.*)$/;
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
            const rootDir = yield this.getRootDir(buffer);
            const caps = yield this.resolveCaps(rootDir);
            const lines = yield this.queueCmd('typeinfo', rootDir, {
                interactive: true,
                command: 'type',
                uri: buffer.getUri(),
                text: buffer.isModified() ? buffer.getText() : undefined,
                dashArgs: caps.typeConstraints ? ['-c'] : [],
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
            const rootDir = yield this.getRootDir(buffer);
            const caps = yield this.resolveCaps(rootDir);
            const lines = yield this.queueCmd('typeinfo', rootDir, {
                interactive: caps.interactiveCaseSplit,
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
            const rootDir = yield this.getRootDir(buffer);
            const caps = yield this.resolveCaps(rootDir);
            const lines = yield this.queueCmd('typeinfo', rootDir, {
                interactive: caps.interactiveCaseSplit,
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
                this.resolveCapsPromise(yield this.getCaps(vers));
                const backend = new ghc_modi_process_real_1.GhcModiProcessReal(yield this.resolveCaps(rootDir), rootDir, opts);
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
    resolveCaps(rootDir) {
        return __awaiter(this, void 0, void 0, function* () {
            this.initBackend(rootDir);
            return this.caps;
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
            importedFrom: false,
            browseMain: false
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaW5kZXguanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi9zcmMvZ2hjLW1vZC9pbmRleC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOzs7Ozs7Ozs7O0FBWUEsK0JBQTRFO0FBQzVFLGdDQUErQjtBQUMvQiwrQkFBOEI7QUFDOUIsdUNBQXVDO0FBQ3ZDLDJEQUEwQztBQUUxQyxtRUFBd0U7QUFheEU7SUFTRTtRQUNFLElBQUksQ0FBQyxXQUFXLEdBQUcsSUFBSSwwQkFBbUIsRUFBRSxDQUFBO1FBQzVDLElBQUksQ0FBQyxPQUFPLEdBQUcsSUFBSSxjQUFPLEVBQUUsQ0FBQTtRQUM1QixJQUFJLENBQUMsV0FBVyxDQUFDLEdBQUcsQ0FBQyxJQUFJLENBQUMsT0FBTyxDQUFDLENBQUE7UUFDbEMsSUFBSSxDQUFDLFlBQVksR0FBRyxJQUFJLE9BQU8sRUFBRSxDQUFBO1FBQ2pDLElBQUksQ0FBQyxPQUFPLEdBQUcsSUFBSSxHQUFHLEVBQUUsQ0FBQTtRQUN4QixJQUFJLENBQUMsSUFBSSxHQUFHLElBQUksT0FBTyxDQUFDLENBQUMsT0FBTyxLQUFLLElBQUksQ0FBQyxrQkFBa0IsR0FBRyxPQUFPLENBQUMsQ0FBQTtRQUV2RSxFQUFFLENBQUMsQ0FBQyxPQUFPLENBQUMsR0FBRyxDQUFDLGdCQUFnQixJQUFJLENBQUMsSUFBSSxDQUFDLE1BQU0sQ0FBQyxHQUFHLENBQUMsK0NBQStDLENBQUMsQ0FBQyxDQUFDLENBQUM7WUFDdEcsSUFBSSxDQUFDLGFBQWEsQ0FBQyxVQUFVLENBQUM7O0NBRW5DLEVBQW1DO2dCQUMxQixXQUFXLEVBQUUsSUFBSTtnQkFDakIsTUFBTSxFQUFFOzs7Ozs7OztDQVFqQjthQUNRLENBQ0YsQ0FBQTtRQUNILENBQUM7UUFFRCxJQUFJLENBQUMsWUFBWSxFQUFFLENBQUE7SUFDckIsQ0FBQztJQUVZLFVBQVUsQ0FBRSxNQUE0Qjs7WUFDbkQsSUFBSSxHQUFHLENBQUE7WUFDUCxHQUFHLEdBQUcsSUFBSSxDQUFDLFlB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QUMsQ0FBQTtnQkFDdkUsTUFBTSxRQUFRLEdBQUcsSUFBSSxDQUFDLGtCQUFrQixDQUFDLE1BQU0sRUFBRSxPQUFPLENBQUMsQ0FBQTtnQkFDekQsSUFBSSxLQUFLLENBQUE7Z0JBQ1QsSUFBSSxDQUFDO29CQUNILEtBQUssR0FBRyxPQUFPLENBQUMsT0FBTyxDQUFDLE9BQU8sQ0FBQyxVQUFVLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxPQUFPLEVBQUUsQ0FBQTtnQkFDN0QsQ0FBQztnQkFBQyxLQUFLLENBQUMsQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDO29CQUNmLEtBQUssR0FBRyxJQUFJLENBQUE7Z0JBQ2QsQ0FBQztnQkFDRCxHQUFHLENBQUMsSUFBSSxDQUFDO29CQUNQLEdBQUcsRUFBRSxLQUFLO29CQUNWLFFBQVE7b0JBQ1IsT0FBTztvQkFDUCxRQUFRO2lCQUNULENBQUMsQ0FBQTtZQUNKLENBQUM7WUFDRCxNQUFNLENBQUMsR0FBRyxDQUFBO1FBQ1osQ0FBQztLQUFBO0NBQ0Y7QUEzbUJELHdDQTJtQkMiLCJzb3VyY2VzQ29udGVudCI6WyIvKlxuICogZGVjYWZmZWluYXRlIHN1Z2dlc3Rpb25zOlxuICogRFMxMDE6IFJlbW92ZSB1bm5lY2Vzc2FyeSB1c2Ugb2YgQXJyYXkuZnJvbVxuICogRFMxMDI6IFJlbW92ZSB1bm5lY2Vzc2FyeSBjb2RlIGNyZWF0ZWQgYmVjYXVzZSBvZiBpbXBsaWNpdCByZXR1cm5zXG4gKiBEUzEwMzogUmV3cml0ZSBjb2RlIHRvIG5vIGxvbmdlciB1c2UgX19ndWFyZF9fXG4gKiBEUzEwNDogQXZvaWQgaW5saW5lIGFzc2lnbm1lbnRzXG4gKiBEUzIwMTogU2ltcGxpZnkgY29tcGxleCBkZXN0cnVjdHVyZSBhc3NpZ25tZW50c1xuICogRFMyMDU6IENvbnNpZGVyIHJld29ya2luZyBjb2RlIHRvIGF2b2lkIHVzZSBvZiBJSUZFc1xuICogRFMyMDY6IENvbnNpZGVyIHJld29ya2luZyBjbGFzc2VzIHRvIGF2b2lkIGluaXRDbGFzc1xuICogRFMyMDc6IENvbnNpZGVyIHNob3J0ZXIgdmFyaWF0aW9ucyBvZiBudWxsIGNoZWNrc1xuICogRnVsbCBkb2NzOiBodHRwczovL2dpdGh1Yi5jb20vZGVjYWZmZWluYXRlL2RlY2FmZmVpbmF0ZS9ibG9iL21hc3Rlci9kb2NzL3N1Z2dlc3Rpb25zLm1kXG4gKi9cbmltcG9ydCB7IFJhbmdlLCBQb2ludCwgRW1pdHRlciwgQ29tcG9zaXRlRGlzcG9zYWJsZSwgRGlyZWN0b3J5IH0gZnJvbSAnYXRvbSdcbmltcG9ydCAqIGFzIFV0aWwgZnJvbSAnLi4vdXRpbCdcbmltcG9ydCB7IGV4dG5hbWUgfSBmcm9tICdwYXRoJ1xuaW1wb3J0IFF1ZXVlID0gcmVxdWlyZSgncHJvbWlzZS1xdWV1ZScpXG5pbXBvcnQgeyB1bmxpdCB9IGZyb20gJ2F0b20taGFza2VsbC11dGlscydcblxuaW1wb3J0IHsgR2hjTW9kaVByb2Nlc3NSZWFsLCBHSENNb2RDYXBzIH0gZnJvbSAnLi9naGMtbW9kaS1wcm9jZXNzLXJlYWwnXG5cbnR5cGUgQ29tbWFuZHMgPSAnY2hlY2tsaW50JyB8ICdicm93c2UnIHwgJ3R5cGVpbmZvJyB8ICdmaW5kJyB8ICdpbml0JyB8ICdsaXN0JyB8ICdsb3dtZW0nXG5cbmV4cG9ydCB0eXBlIFN5bWJvbFR5cGUgPSAndHlwZScgfCAnY2xhc3MnIHwgJ2Z1bmN0aW9uJ1xuXG5leHBvcnQgaW50ZXJmYWNlIFN5bWJvbERlc2Mge1xuICBuYW1lOiBzdHJpbmcsXG4gIHN5bWJvbFR5cGU6IFN5bWJvbFR5cGUsXG4gIHR5cGVTaWduYXR1cmU/OiBzdHJpbmcsXG4gIHBhcmVudD86IHN0cmluZ1xufVxuXG5leHBvcnQgY2xhc3MgR2hjTW9kaVByb2Nlc3Mge1xuICBwcml2YXRlIGJhY2tlbmQ6IE1hcDxzdHJpbmcsIFByb21pc2U8R2hjTW9kaVByb2Nlc3NSZWFsPj5cbiAgcHJpdmF0ZSBkaXNwb3NhYmxlczogQ29tcG9zaXRlRGlzcG9zYWJsZVxuICBwcml2YXRlIGVtaXR0ZXI6IEVtaXR0ZXJcbiAgcHJpdmF0ZSBidWZmZXJEaXJNYXA6IFdlYWtNYXA8QXRvbVR5cGVzLlRleHRCdWZmZXIsIEF0b21UeXBlcy5EaXJlY3Rvcnk+XG4gIHByaXZhdGUgY29tbWFuZFF1ZXVlczoge1tLIGluIENvbW1hbmRzXTogUXVldWV9XG4gIHByaXZhdGUgY2FwczogUHJvbWlzZTxHSENNb2RDYXBzPlxuICBwcml2YXRlIHJlc29sdmVDYXBzUHJvbWlzZTogKHZhbDogR0hDTW9kQ2FwcykgPT4gdm9pZFxuXG4gIGNvbnN0cnVjdG9yICgpIHtcbiAgICB0aGlzLmRpc3Bvc2FibGVzID0gbmV3IENvbXBvc2l0ZURpc3Bvc2FibGUoKVxuICAgIHRoaXMuZW1pdHRlciA9IG5ldyBFbWl0dGVyKClcbiAgICB0aGlzLmRpc3Bvc2FibGVzLmFkZCh0aGlzLmVtaXR0ZXIpXG4gICAgdGhpcy5idWZmZXJEaXJNYXAgPSBuZXcgV2Vha01hcCgpXG4gICAgdGhpcy5iYWNrZW5kID0gbmV3IE1hcCgpXG4gICAgdGhpcy5jYXBzID0gbmV3IFByb21pc2UoKHJlc29sdmUpID0+IHRoaXMucmVzb2x2ZUNhcHNQcm9taXNlID0gcmVzb2x2ZSlcblxuICAgIGlmIChwcm9jZXNzLmVudi5HSENfUEFDS0FHRV9QQVRIICYmICFhdG9tLmNvbmZpZy5nZXQoJ2hhc2tlbGwtZ2hjLW1vZC5zdXBwcmVzc0doY1BhY2thZ2VQYXRoV2FybmluZycpKSB7XG4gICAgICBhdG9tLm5vdGlmaWNhdGlvbnMuYWRkV2FybmluZyhgXFxcbmhhc2tlbGwtZ2hjLW1vZDogWW91IGhhdmUgR0hDX1BBQ0tBR0VfUEFUSCBlbnZpcm9ubWVudCB2YXJpYWJsZSBzZXQhXFxcbmAsICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHtcbiAgICAgICAgICBkaXNtaXNzYWJsZTogdHJ1ZSxcbiAgICAgICAgICBkZXRhaWw6IGBcXFxuVGhpcyBjb25maWd1cmF0aW9uIGlzIG5vdCBzdXBwb3J0ZWQsIGFuZCBjYW4gYnJlYWsgYXJiaXRyYXJpbHkuIFlvdSBjYW4gdHJ5IHRvIGJhbmQtYWlkIGl0IGJ5IGFkZGluZ1xuXG5kZWxldGUgcHJvY2Vzcy5lbnYuR0hDX1BBQ0tBR0VfUEFUSFxuXG50byB5b3VyIEF0b20gaW5pdCBzY3JpcHQgKEVkaXQg4oaSIEluaXQgU2NyaXB0Li4uKVxuXG5Zb3UgY2FuIHN1cHByZXNzIHRoaXMgd2FybmluZyBpbiBoYXNrZWxsLWdoYy1tb2Qgc2V0dGluZ3MuXFxcbmBcbiAgICAgICAgfVxuICAgICAgKVxuICAgIH1cblxuICAgIHRoaXMuY3JlYXRlUXVldWVzKClcbiAgfVxuXG4gIHB1YmxpYyBhc3luYyBnZXRSb290RGlyIChidWZmZXI6IEF0b21UeXBlcy5UZXh0QnVmZmVyKTogUHJvbWlzZTxBdG9tVHlwZXMuRGlyZWN0b3J5PiB7XG4gICAgbGV0IGRpclxuICAgIGRpciA9IHRoaXMuYnVmZmVyRGlyTWFwLmdldChidWZmZXIpXG4gICAgaWYgKGRpcikge1xuICAgICAgcmV0dXJuIGRpclxuICAgIH1cbiAgICBkaXIgPSBhd2FpdCBVdGlsLmdldFJvb3REaXIoYnVmZmVyKVxuICAgIHRoaXMuYnVmZmVyRGlyTWFwLnNldChidWZmZXIsIGRpcilcbiAgICByZXR1cm4gZGlyXG4gIH1cblxuICBwdWJsaWMga2lsbFByb2Nlc3MgKCkge1xuICAgIGZvciAoY29uc3QgYnAgb2YgdGhpcy5iYWNrZW5kLnZhbHVlcygpKSB7XG4gICAgICBicC50aGVuKChiKSA9PiBiLmtpbGxQcm9jZXNzKCkpXG4gICAgfVxuICAgIHRoaXMuYmFja2VuZC5jbGVhcigpXG4gIH1cblxuICBwdWJsaWMgZGVzdHJveSAoKSB7XG4gICAgZm9yIChjb25zdCBicCBvZiB0aGlzLmJhY2tlbmQudmFsdWVzKCkpIHtcbiAgICAgIGJwLnRoZW4oKGIpID0+IGIuZGVzdHJveSgpKVxuICAgIH1cbiAgICB0aGlzLmJhY2tlbmQuY2xlYXIoKVxuICAgIHRoaXMuZW1pdHRlci5lbWl0KCdkaWQtZGVzdHJveScpXG4gICAgdGhpcy5kaXNwb3NhYmxlcy5kaXNwb3NlKClcbiAgfVxuXG4gIHB1YmxpYyBvbkRpZERlc3Ryb3kgKGNhbGxiYWNrOiAoKSA9PiB2b2lkKSB7XG4gICAgcmV0dXJuIHRoaXMuZW1pdHRlci5vbignZGlkLWRlc3Ryb3knLCBjYWxsYmFjaylcbiAgfVxuXG4gIHB1YmxpYyBvbkJhY2tlbmRBY3RpdmUgKGNhbGxiYWNrOiAoKSA9PiB2b2lkKSB7XG4gICAgcmV0dXJuIHRoaXMuZW1pdHRlci5vbignYmFja2VuZC1hY3RpdmUnLCBjYWxsYmFjaylcbiAgfVxuXG4gIHB1YmxpYyBvbkJhY2tlbmRJZGxlIChjYWxsYmFjazogKCkgPT4gdm9pZCkge1xuICAgIHJldHVybiB0aGlzLmVtaXR0ZXIub24oJ2JhY2tlbmQtaWRsZScsIGNhbGxiYWNrKVxuICB9XG5cbiAgcHVibGljIG9uUXVldWVJZGxlIChjYWxsYmFjazogKCkgPT4gdm9pZCkge1xuICAgIHJldHVybiB0aGlzLmVtaXR0ZXIub24oJ3F1ZXVlLWlkbGUnLCBjYWxsYmFjaylcbiAgfVxuXG4gIHB1YmxpYyBhc3luYyBydW5MaXN0IChidWZmZXI6IEF0b21UeXBlcy5UZXh0QnVmZmVyKSB7XG4gICAgcmV0dXJuIHRoaXMucXVldWVDbWQoJ2xpc3QnLCBhd2FpdCB0aGlzLmdldFJvb3REaXIoYnVmZmVyKSwgeyBjb21tYW5kOiAnbGlzdCcgfSlcbiAgfVxuXG4gIHB1YmxpYyBhc3luYyBydW5MYW5nIChkaXI6IEF0b21UeXBlcy5EaXJlY3RvcnkpIHtcbiAgICByZXR1cm4gdGhpcy5xdWV1ZUNtZCgnaW5pdCcsIGRpciwgeyBjb21tYW5kOiAnbGFuZycgfSlcbiAgfVxuXG4gIHB1YmxpYyBhc3luYyBydW5GbGFnIChkaXI6IEF0b21UeXBlcy5EaXJlY3RvcnkpIHtcbiAgICByZXR1cm4gdGhpcy5xdWV1ZUNtZCgnaW5pdCcsIGRpciwgeyBjb21tYW5kOiAnZmxhZycgfSlcbiAgfVxuXG4gIHB1YmxpYyBhc3luYyBydW5Ccm93c2UgKHJvb3REaXI6IEF0b21UeXBlcy5EaXJlY3RvcnksIG1vZHVsZXM6IHN0cmluZ1tdKTogUHJvbWlzZTxTeW1ib2xEZXNjW10+IHtcbiAgICBjb25zdCBjYXBzID0gYXdhaXQgdGhpcy5yZXNvbHZlQ2Fwcyhyb290RGlyKVxuICAgIGlmIChjYXBzLmJyb3dzZU1haW4gPT09IGZhbHNlKSB7XG4gICAgICBtb2R1bGVzID0gbW9kdWxlcy5maWx0ZXIoKHYpID0+IHYgIT09ICdNYWluJylcbiAgICB9XG4gICAgaWYgKG1vZHVsZXMubGVuZ3RoID09PSAwKSB7IHJldHVybiBbXSB9XG4gICAgY29uc3QgbGluZXMgPSBhd2FpdCB0aGlzLnF1ZXVlQ21kKCdicm93c2UnLCByb290RGlyLCB7XG4gICAgICBjb21tYW5kOiAnYnJvd3NlJyxcbiAgICAgIGRhc2hBcmdzOiBjYXBzLmJyb3dzZVBhcmVudHMgPyBbJy1kJywgJy1wJ10gOiBbJy1kJ10sXG4gICAgICBhcmdzOiBtb2R1bGVzXG4gICAgfSlcbiAgICByZXR1cm4gbGluZXMubWFwKChzKSA9PiB7XG4gICAgICAvLyBlbnVtRnJvbSA6OiBFbnVtIGEgPT4gYSAtPiBbYV0gLS0gZnJvbTpFbnVtXG4gICAgICBjb25zdCBwYXR0ZXJuID0gY2Fwcy5icm93c2VQYXJlbnRzID8gL14oLio/KSA6OiAoLio/KSg/OiAtLSBmcm9tOiguKikpPyQvIDogL14oLio/KSA6OiAoLiopJC9cbiAgICAgIGNvbnN0IG1hdGNoID0gcy5tYXRjaChwYXR0ZXJuKVxuICAgICAgbGV0IG5hbWUsIHR5cGVTaWduYXR1cmUsIHBhcmVudFxuICAgICAgaWYgKG1hdGNoKSB7XG4gICAgICAgIG5hbWUgPSBtYXRjaFsxXVxuICAgICAgICB0eXBlU2lnbmF0dXJlID0gbWF0Y2hbMl1cbiAgICAgICAgcGFyZW50ID0gbWF0Y2hbM11cbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIG5hbWUgPSBzXG4gICAgICB9XG4gICAgICBsZXQgc3ltYm9sVHlwZTogU3ltYm9sVHlwZVxuICAgICAgaWYgKHR5cGVTaWduYXR1cmUgJiYgL14oPzp0eXBlfGRhdGF8bmV3dHlwZSkvLnRlc3QodHlwZVNpZ25hdHVyZSkpIHtcbiAgICAgICAgc3ltYm9sVHlwZSA9ICd0eXBlJ1xuICAgICAgfSBlbHNlIGlmICh0eXBlU2lnbmF0dXJlICYmIC9eKD86Y2xhc3MpLy50ZXN0KHR5cGVTaWduYXR1cmUpKSB7XG4gICAgICAgIHN5bWJvbFR5cGUgPSAnY2xhc3MnXG4gICAgICB9IGVsc2Uge1xuICAgICAgICBzeW1ib2xUeXBlID0gJ2Z1bmN0aW9uJ1xuICAgICAgfVxuICAgICAgcmV0dXJuIHsgbmFtZSwgdHlwZVNpZ25hdHVyZSwgc3ltYm9sVHlwZSwgcGFyZW50IH1cbiAgICB9KVxuICB9XG5cbiAgcHVibGljIGFzeW5jIGdldFR5cGVJbkJ1ZmZlciAoXG4gICAgYnVmZmVyOiBBdG9tVHlwZXMuVGV4dEJ1ZmZlciwgY3JhbmdlOiBBdG9tVHlwZXMuUmFuZ2VcbiAgKSAge1xuICAgIGlmICghIGJ1ZmZlci5nZXRVcmkoKSkgeyB0aHJvdyBuZXcgRXJyb3IoJ05vIFVSSSBmb3IgYnVmZmVyJykgfVxuICAgIGNyYW5nZSA9IFV0aWwudGFiU2hpZnRGb3JSYW5nZShidWZmZXIsIGNyYW5nZSlcbiAgICBjb25zdCByb290RGlyID0gYXdhaXQgdGhpcy5nZXRSb290RGlyKGJ1ZmZlcilcbiAgICBjb25zdCBjYXBzID0gYXdhaXQgdGhpcy5yZXNvbHZlQ2Fwcyhyb290RGlyKVxuICAgIGNvbnN0IGxpbmVzID0gYXdhaXQgdGhpcy5xdWV1ZUNtZCgndHlwZWluZm8nLCByb290RGlyLCB7XG4gICAgICBpbnRlcmFjdGl2ZTogdHJ1ZSxcbiAgICAgIGNvbW1hbmQ6ICd0eXBlJyxcbiAgICAgIHVyaTogYnVmZmVyLmdldFVyaSgpLFxuICAgICAgdGV4dDogYnVmZmVyLmlzTW9kaWZpZWQoKSA/IGJ1ZmZlci5nZXRUZXh0KCkgOiB1bmRlZmluZWQsXG4gICAgICBkYXNoQXJnczogY2Fwcy50eXBlQ29uc3RyYWludHMgPyBbJy1jJ10gOiBbXSxcbiAgICAgIGFyZ3M6IFtjcmFuZ2Uuc3RhcnQucm93ICsgMSwgY3JhbmdlLnN0YXJ0LmNvbHVtbiArIDFdLm1hcCgodikgPT4gdi50b1N0cmluZygpKVxuICAgIH0pXG5cbiAgICBjb25zdCByeCA9IC9eKFxcZCspXFxzKyhcXGQrKVxccysoXFxkKylcXHMrKFxcZCspXFxzK1wiKFteXSopXCIkLyAvLyBbXl0gYmFzaWNhbGx5IG1lYW5zIFwiYW55dGhpbmdcIiwgaW5jbC4gbmV3bGluZXNcbiAgICBmb3IgKGNvbnN0IGxpbmUgb2YgbGluZXMpIHtcbiAgICAgIGNvbnN0IG1hdGNoID0gbGluZS5tYXRjaChyeClcbiAgICAgIGlmICghbWF0Y2gpIHsgY29udGludWUgfVxuICAgICAgY29uc3QgW3Jvd3N0YXJ0LCBjb2xzdGFydCwgcm93ZW5kLCBjb2xlbmQsIHR5cGVdID0gbWF0Y2guc2xpY2UoMSlcbiAgICAgIGNvbnN0IHJhbmdlID1cbiAgICAgICAgUmFuZ2UuZnJvbU9iamVjdChbXG4gICAgICAgICAgW3BhcnNlSW50KHJvd3N0YXJ0LCAxMCkgLSAxLCBwYXJzZUludChjb2xzdGFydCwgMTApIC0gMV0sXG4gICAgICAgICAgW3BhcnNlSW50KHJvd2VuZCwgMTApIC0gMSwgcGFyc2VJbnQoY29sZW5kLCAxMCkgLSAxXVxuICAgICAgICBdKVxuICAgICAgaWYgKHJhbmdlLmlzRW1wdHkoKSkgeyBjb250aW51ZSB9XG4gICAgICBpZiAoIXJhbmdlLmNvbnRhaW5zUmFuZ2UoY3JhbmdlKSkgeyBjb250aW51ZSB9XG4gICAgICByZXR1cm4ge1xuICAgICAgICByYW5nZTogVXRpbC50YWJVbnNoaWZ0Rm9yUmFuZ2UoYnVmZmVyLCByYW5nZSksXG4gICAgICAgIHR5cGU6IHR5cGUucmVwbGFjZSgvXFxcXFwiL2csICdcIicpXG4gICAgICB9XG4gICAgfVxuICAgIHRocm93IG5ldyBFcnJvcignTm8gdHlwZScpXG4gIH1cblxuICBwdWJsaWMgYXN5bmMgZG9DYXNlU3BsaXQgKGJ1ZmZlcjogQXRvbVR5cGVzLlRleHRCdWZmZXIsIGNyYW5nZTogQXRvbVR5cGVzLlJhbmdlKSB7XG4gICAgaWYgKCEgYnVmZmVyLmdldFVyaSgpKSB7IHRocm93IG5ldyBFcnJvcignTm8gVVJJIGZvciBidWZmZXInKSB9XG4gICAgY3JhbmdlID0gVXRpbC50YWJTaGlmdEZvclJhbmdlKGJ1ZmZlciwgY3JhbmdlKVxuICAgIGNvbnN0IHJvb3REaXIgPSBhd2FpdCB0aGlzLmdldFJvb3REaXIoYnVmZmVyKVxuICAgIGNvbnN0IGNhcHMgPSBhd2FpdCB0aGlzLnJlc29sdmVDYXBzKHJvb3REaXIpXG4gICAgY29uc3QgbGluZXMgPSBhd2FpdCB0aGlzLnF1ZXVlQ21kKCd0eXBlaW5mbycsIHJvb3REaXIsIHtcbiAgICAgIGludGVyYWN0aXZlOiBjYXBzLmludGVyYWN0aXZlQ2FzZVNwbGl0LFxuICAgICAgY29tbWFuZDogJ3NwbGl0JyxcbiAgICAgIHVyaTogYnVmZmVyLmdldFVyaSgpLFxuICAgICAgdGV4dDogYnVmZmVyLmlzTW9kaWZpZWQoKSA/IGJ1ZmZlci5nZXRUZXh0KCkgOiB1bmRlZmluZWQsXG4gICAgICBhcmdzOiBbY3JhbmdlLnN0YXJ0LnJvdyArIDEsIGNyYW5nZS5zdGFydC5jb2x1bW4gKyAxXS5tYXAoKHYpID0+IHYudG9TdHJpbmcoKSlcbiAgICB9KVxuXG4gICAgY29uc3QgcnggPSAvXihcXGQrKVxccysoXFxkKylcXHMrKFxcZCspXFxzKyhcXGQrKVxccytcIihbXl0qKVwiJC8gLy8gW15dIGJhc2ljYWxseSBtZWFucyBcImFueXRoaW5nXCIsIGluY2wuIG5ld2xpbmVzXG4gICAgY29uc3QgcmVzID0gW11cbiAgICBmb3IgKGNvbnN0IGxpbmUgb2YgbGluZXMpIHtcbiAgICAgIGNvbnN0IG1hdGNoID0gbGluZS5tYXRjaChyeClcbiAgICAgIGlmICghIG1hdGNoKSB7XG4gICAgICAgIFV0aWwud2FybihgZ2hjLW1vZCBzYXlzOiAke2xpbmV9YClcbiAgICAgICAgY29udGludWVcbiAgICAgIH1cbiAgICAgIGNvbnN0IFtyb3dzdGFydCwgY29sc3RhcnQsIHJvd2VuZCwgY29sZW5kLCB0ZXh0XSA9IG1hdGNoLnNsaWNlKDEpXG4gICAgICByZXMucHVzaCh7XG4gICAgICAgIHJhbmdlOlxuICAgICAgICBSYW5nZS5mcm9tT2JqZWN0KFtcbiAgICAgICAgICBbcGFyc2VJbnQocm93c3RhcnQsIDEwKSAtIDEsIHBhcnNlSW50KGNvbHN0YXJ0LCAxMCkgLSAxXSxcbiAgICAgICAgICBbcGFyc2VJbnQocm93ZW5kLCAxMCkgLSAxLCBwYXJzZUludChjb2xlbmQsIDEwKSAtIDFdXG4gICAgICAgIF0pLFxuICAgICAgICByZXBsYWNlbWVudDogdGV4dFxuICAgICAgfSlcbiAgICB9XG4gICAgcmV0dXJuIHJlc1xuICB9XG5cbiAgcHVibGljIGFzeW5jIGRvU2lnRmlsbCAoYnVmZmVyOiBBdG9tVHlwZXMuVGV4dEJ1ZmZlciwgY3JhbmdlOiBBdG9tVHlwZXMuUmFuZ2UpIHtcbiAgICBpZiAoISBidWZmZXIuZ2V0VXJpKCkpIHsgdGhyb3cgbmV3IEVycm9yKCdObyBVUkkgZm9yIGJ1ZmZlcicpIH1cbiAgICBjcmFuZ2UgPSBVdGlsLnRhYlNoaWZ0Rm9yUmFuZ2UoYnVmZmVyLCBjcmFuZ2UpXG4gICAgY29uc3Qgcm9vdERpciA9IGF3YWl0IHRoaXMuZ2V0Um9vdERpcihidWZmZXIpXG4gICAgY29uc3QgY2FwcyA9IGF3YWl0IHRoaXMucmVzb2x2ZUNhcHMocm9vdERpcilcbiAgICBjb25zdCBsaW5lcyA9IGF3YWl0IHRoaXMucXVldWVDbWQoJ3R5cGVpbmZvJywgcm9vdERpciwge1xuICAgICAgaW50ZXJhY3RpdmU6IGNhcHMuaW50ZXJhY3RpdmVDYXNlU3BsaXQsXG4gICAgICBjb21tYW5kOiAnc2lnJyxcbiAgICAgIHVyaTogYnVmZmVyLmdldFVyaSgpLFxuICAgICAgdGV4dDogYnVmZmVyLmlzTW9kaWZpZWQoKSA/IGJ1ZmZlci5nZXRUZXh0KCkgOiB1bmRlZmluZWQsXG4gICAgICBhcmdzOiBbY3JhbmdlLnN0YXJ0LnJvdyArIDEsIGNyYW5nZS5zdGFydC5jb2x1bW4gKyAxXS5tYXAoKHYpID0+IHYudG9TdHJpbmcoKSlcbiAgICB9KVxuICAgIGlmIChsaW5lcy5sZW5ndGggPCAyKSB7IHRocm93IG5ldyBFcnJvcihgQ291bGQgbm90IHVuZGVyc3RhbmQgcmVzcG9uc2U6ICR7bGluZXMuam9pbignXFxuJyl9YCkgfVxuICAgIGNvbnN0IHJ4ID0gL14oXFxkKylcXHMrKFxcZCspXFxzKyhcXGQrKVxccysoXFxkKykkLyAvLyBwb3NpdGlvbiByeFxuICAgIGNvbnN0IG1hdGNoID0gbGluZXNbMV0ubWF0Y2gocngpXG4gICAgaWYgKCEgbWF0Y2gpIHsgdGhyb3cgbmV3IEVycm9yKGBDb3VsZCBub3QgdW5kZXJzdGFuZCByZXNwb25zZTogJHtsaW5lcy5qb2luKCdcXG4nKX1gKSB9XG4gICAgY29uc3QgW3Jvd3N0YXJ0LCBjb2xzdGFydCwgcm93ZW5kLCBjb2xlbmRdID0gbWF0Y2guc2xpY2UoMSlcbiAgICBjb25zdCByYW5nZSA9XG4gICAgICBSYW5nZS5mcm9tT2JqZWN0KFtcbiAgICAgICAgW3BhcnNlSW50KHJvd3N0YXJ0LCAxMCkgLSAxLCBwYXJzZUludChjb2xzdGFydCwgMTApIC0gMV0sXG4gICAgICAgIFtwYXJzZUludChyb3dlbmQsIDEwKSAtIDEsIHBhcnNlSW50KGNvbGVuZCwgMTApIC0gMV1cbiAgICAgIF0pXG4gICAgcmV0dXJuIHtcbiAgICAgIHR5cGU6IGxpbmVzWzBdLFxuICAgICAgcmFuZ2UsXG4gICAgICBib2R5OiBsaW5lcy5zbGljZSgyKS5qb2luKCdcXG4nKVxuICAgIH1cbiAgfVxuXG4gIHB1YmxpYyBhc3luYyBnZXRJbmZvSW5CdWZmZXIgKGVkaXRvcjogQXRvbVR5cGVzLlRleHRFZGl0b3IsIGNyYW5nZTogQXRvbVR5cGVzLlJhbmdlKSB7XG4gICAgY29uc3QgYnVmZmVyID0gZWRpdG9yLmdldEJ1ZmZlcigpXG4gICAgaWYgKCFidWZmZXIuZ2V0VXJpKCkpIHsgdGhyb3cgbmV3IEVycm9yKCdObyBVUkkgZm9yIGJ1ZmZlcicpIH1cbiAgICBjb25zdCB7IHN5bWJvbCwgcmFuZ2UgfSA9IFV0aWwuZ2V0U3ltYm9sSW5SYW5nZShlZGl0b3IsIGNyYW5nZSlcblxuICAgIGNvbnN0IGxpbmVzID0gYXdhaXQgdGhpcy5xdWV1ZUNtZCgndHlwZWluZm8nLCBhd2FpdCB0aGlzLmdldFJvb3REaXIoYnVmZmVyKSwge1xuICAgICAgaW50ZXJhY3RpdmU6IHRydWUsXG4gICAgICBjb21tYW5kOiAnaW5mbycsXG4gICAgICB1cmk6IGJ1ZmZlci5nZXRVcmkoKSxcbiAgICAgIHRleHQ6IGJ1ZmZlci5pc01vZGlmaWVkKCkgPyBidWZmZXIuZ2V0VGV4dCgpIDogdW5kZWZpbmVkLFxuICAgICAgYXJnczogW3N5bWJvbF1cbiAgICB9KVxuXG4gICAgY29uc3QgaW5mbyA9IGxpbmVzLmpvaW4oJ1xcbicpXG4gICAgaWYgKChpbmZvID09PSAnQ2Fubm90IHNob3cgaW5mbycpIHx8ICFpbmZvKSB7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoJ05vIGluZm8nKVxuICAgIH0gZWxzZSB7XG4gICAgICByZXR1cm4geyByYW5nZSwgaW5mbyB9XG4gICAgfVxuICB9XG5cbiAgcHVibGljIGFzeW5jIGZpbmRTeW1ib2xQcm92aWRlcnNJbkJ1ZmZlciAoZWRpdG9yOiBBdG9tVHlwZXMuVGV4dEVkaXRvciwgY3JhbmdlOiBBdG9tVHlwZXMuUmFuZ2UpIHtcbiAgICBjb25zdCBidWZmZXIgPSBlZGl0b3IuZ2V0QnVmZmVyKClcbiAgICBjb25zdCB7IHN5bWJvbCB9ID0gVXRpbC5nZXRTeW1ib2xJblJhbmdlKGVkaXRvciwgY3JhbmdlKVxuXG4gICAgcmV0dXJuIHRoaXMucXVldWVDbWQoJ2ZpbmQnLCBhd2FpdCB0aGlzLmdldFJvb3REaXIoYnVmZmVyKSwge1xuICAgICAgaW50ZXJhY3RpdmU6IHRydWUsXG4gICAgICBjb21tYW5kOiAnZmluZCcsXG4gICAgICBhcmdzOiBbc3ltYm9sXVxuICAgIH0pXG4gIH1cblxuICBwdWJsaWMgYXN5bmMgZG9DaGVja0J1ZmZlciAoYnVmZmVyOiBBdG9tVHlwZXMuVGV4dEJ1ZmZlciwgZmFzdDogYm9vbGVhbiA9IGZhbHNlKSB7XG4gICAgcmV0dXJuIHRoaXMuZG9DaGVja09yTGludEJ1ZmZlcignY2hlY2snLCBidWZmZXIsIGZhc3QpXG4gIH1cblxuICBwdWJsaWMgYXN5bmMgZG9MaW50QnVmZmVyIChidWZmZXI6IEF0b21UeXBlcy5UZXh0QnVmZmVyLCBmYXN0OiBib29sZWFuID0gZmFsc2UpIHtcbiAgICByZXR1cm4gdGhpcy5kb0NoZWNrT3JMaW50QnVmZmVyKCdsaW50JywgYnVmZmVyLCBmYXN0KVxuICB9XG5cbiAgcHVibGljIGFzeW5jIGRvQ2hlY2tBbmRMaW50IChidWZmZXI6IEF0b21UeXBlcy5UZXh0QnVmZmVyLCBmYXN0OiBib29sZWFuKSB7XG4gICAgY29uc3QgW2NyLCBscl0gPSBhd2FpdCBQcm9taXNlLmFsbChbdGhpcy5kb0NoZWNrQnVmZmVyKGJ1ZmZlciwgZmFzdCksIHRoaXMuZG9MaW50QnVmZmVyKGJ1ZmZlciwgZmFzdCldKVxuICAgIHJldHVybiBjci5jb25jYXQobHIpXG4gIH1cblxuICBwcml2YXRlIGFzeW5jIGluaXRCYWNrZW5kIChyb290RGlyOiBBdG9tVHlwZXMuRGlyZWN0b3J5KTogUHJvbWlzZTxHaGNNb2RpUHJvY2Vzc1JlYWw+IHtcbiAgICBjb25zdCByb290UGF0aCA9IHJvb3REaXIuZ2V0UGF0aCgpXG4gICAgY29uc3QgY2FjaGVkID0gdGhpcy5iYWNrZW5kLmdldChyb290UGF0aClcbiAgICBpZiAoY2FjaGVkKSB7IHJldHVybiBhd2FpdCBjYWNoZWQgfVxuICAgIGNvbnN0IG5ld0JhY2tlbmQgPSB0aGlzLmluaXRCYWNrZW5kUmVhbChyb290RGlyKVxuICAgIHRoaXMuYmFja2VuZC5zZXQocm9vdFBhdGgsIG5ld0JhY2tlbmQpXG4gICAgcmV0dXJuIGF3YWl0IG5ld0JhY2tlbmRcbiAgfVxuXG4gIHByaXZhdGUgYXN5bmMgaW5pdEJhY2tlbmRSZWFsIChyb290RGlyOiBBdG9tVHlwZXMuRGlyZWN0b3J5KTogUHJvbWlzZTxHaGNNb2RpUHJvY2Vzc1JlYWw+IHtcbiAgICB0cnkge1xuICAgICAgY29uc3Qgb3B0cyA9IGF3YWl0IFV0aWwuZ2V0UHJvY2Vzc09wdGlvbnMocm9vdERpci5nZXRQYXRoKCkpXG4gICAgICBjb25zdCB2ZXJzUCA9IHRoaXMuZ2V0VmVyc2lvbihvcHRzKVxuICAgICAgdmVyc1AudGhlbigodikgPT4geyB0aGlzLmNoZWNrQ29tcChvcHRzLCB2KSB9KVxuICAgICAgY29uc3QgdmVycyA9IGF3YWl0IHZlcnNQXG5cbiAgICAgIHRoaXMucmVzb2x2ZUNhcHNQcm9taXNlKGF3YWl0IHRoaXMuZ2V0Q2Fwcyh2ZXJzKSlcbiAgICAgIGNvbnN0IGJhY2tlbmQgPSBuZXcgR2hjTW9kaVByb2Nlc3NSZWFsKGF3YWl0IHRoaXMucmVzb2x2ZUNhcHMocm9vdERpciksIHJvb3REaXIsIG9wdHMpXG4gICAgICByZXR1cm4gYmFja2VuZFxuICAgIH0gY2F0Y2ggKGVycikge1xuICAgICAgYXRvbS5ub3RpZmljYXRpb25zLmFkZEZhdGFsRXJyb3IoXG4gICAgICAgIGBcXFxuSGFza2VsbC1naGMtbW9kOiBnaGMtbW9kIGZhaWxlZCB0byBsYXVuY2guXG5JdCBpcyBwcm9iYWJseSBtaXNzaW5nIG9yIG1pc2NvbmZpZ3VyZWQuICR7ZXJyLmNvZGV9YCxcbiAgICAgICAge1xuICAgICAgICAgIGRldGFpbDogYFxcXG4ke2Vycn1cblBBVEg6ICR7cHJvY2Vzcy5lbnYuUEFUSH1cbnBhdGg6ICR7cHJvY2Vzcy5lbnYucGF0aH1cblBhdGg6ICR7cHJvY2Vzcy5lbnYuUGF0aH1cXFxuYCxcbiAgICAgICAgICBzdGFjazogZXJyLnN0YWNrLFxuICAgICAgICAgIGRpc21pc3NhYmxlOiB0cnVlXG4gICAgICAgIH1cbiAgICAgIClcbiAgICAgIHRocm93IGVyclxuICAgIH1cbiAgfVxuXG4gIHByaXZhdGUgY3JlYXRlUXVldWVzICgpIHtcbiAgICB0aGlzLmNvbW1hbmRRdWV1ZXMgPSB7XG4gICAgICBjaGVja2xpbnQ6IG5ldyBRdWV1ZSgyKSxcbiAgICAgIGJyb3dzZTogbmV3IFF1ZXVlKGF0b20uY29uZmlnLmdldCgnaGFza2VsbC1naGMtbW9kLm1heEJyb3dzZVByb2Nlc3NlcycpKSxcbiAgICAgIHR5cGVpbmZvOiBuZXcgUXVldWUoMSksXG4gICAgICBmaW5kOiBuZXcgUXVldWUoMSksXG4gICAgICBpbml0OiBuZXcgUXVldWUoNCksXG4gICAgICBsaXN0OiBuZXcgUXVldWUoMSksXG4gICAgICBsb3dtZW06IG5ldyBRdWV1ZSgxKVxuICAgIH1cbiAgICB0aGlzLmRpc3Bvc2FibGVzLmFkZChhdG9tLmNvbmZpZy5vbkRpZENoYW5nZSgnaGFza2VsbC1naGMtbW9kLm1heEJyb3dzZVByb2Nlc3NlcycsICh7bmV3VmFsdWV9KSA9PlxuICAgICAgdGhpcy5jb21tYW5kUXVldWVzLmJyb3dzZSA9IG5ldyBRdWV1ZShuZXdWYWx1ZSBhcyBudW1iZXIpKVxuICAgIClcbiAgfVxuXG4gIHByaXZhdGUgYXN5bmMgZ2V0VmVyc2lvbiAob3B0czogVXRpbC5FeGVjT3B0cykge1xuICAgIGNvbnN0IHRpbWVvdXQgPSBhdG9tLmNvbmZpZy5nZXQoJ2hhc2tlbGwtZ2hjLW1vZC5pbml0VGltZW91dCcpICogMTAwMFxuICAgIGNvbnN0IGNtZCA9IGF0b20uY29uZmlnLmdldCgnaGFza2VsbC1naGMtbW9kLmdoY01vZFBhdGgnKVxuICAgIGNvbnN0IHtzdGRvdXR9ID0gYXdhaXQgVXRpbC5leGVjUHJvbWlzZShjbWQsIFsndmVyc2lvbiddLCB7IHRpbWVvdXQsIC4uLm9wdHMgfSlcbiAgICBjb25zdCB2ZXJzUmF3ID0gL15naGMtbW9kIHZlcnNpb24gKFxcZCspXFwuKFxcZCspXFwuKFxcZCspKD86XFwuKFxcZCspKT8vLmV4ZWMoc3Rkb3V0KVxuICAgIGlmICghdmVyc1JhdykgeyB0aHJvdyBuZXcgRXJyb3IoXCJDb3VsZG4ndCBnZXQgZ2hjLW1vZCB2ZXJzaW9uXCIpIH1cbiAgICBjb25zdCB2ZXJzID0gdmVyc1Jhdy5zbGljZSgxLCA1KS5tYXAoKGkpID0+IHBhcnNlSW50KGksIDEwKSlcbiAgICBjb25zdCBjb21wUmF3ID0gL0dIQyAoLispJC8uZXhlYyhzdGRvdXQudHJpbSgpKVxuICAgIGlmICghY29tcFJhdykgeyB0aHJvdyBuZXcgRXJyb3IoXCJDb3VsZG4ndCBnZXQgZ2hjIHZlcnNpb25cIikgfVxuICAgIGNvbnN0IGNvbXAgPSBjb21wUmF3WzFdXG4gICAgVXRpbC5kZWJ1ZyhgR2hjLW1vZCAke3ZlcnN9IGJ1aWx0IHdpdGggJHtjb21wfWApXG4gICAgcmV0dXJuIHsgdmVycywgY29tcCB9XG4gIH1cblxuICBwcml2YXRlIGFzeW5jIGNoZWNrQ29tcCAob3B0czogVXRpbC5FeGVjT3B0cywgeyBjb21wIH06IHtjb21wOiBzdHJpbmd9KSB7XG4gICAgY29uc3QgdGltZW91dCA9IGF0b20uY29uZmlnLmdldCgnaGFza2VsbC1naGMtbW9kLmluaXRUaW1lb3V0JykgKiAxMDAwXG4gICAgY29uc3QgdHJ5V2FybiA9IGFzeW5jIChjbWQ6IHN0cmluZywgYXJnczogc3RyaW5nW10pID0+IHtcbiAgICAgIHRyeSB7XG4gICAgICAgIHJldHVybiAoYXdhaXQgVXRpbC5leGVjUHJvbWlzZShjbWQsIGFyZ3MsIHsgdGltZW91dCwgLi4ub3B0cyB9KSkuc3Rkb3V0LnRyaW0oKVxuICAgICAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICAgICAgVXRpbC53YXJuKGVycm9yKVxuICAgICAgfVxuICAgIH1cbiAgICBjb25zdCBbc3RhY2tnaGMsIHBhdGhnaGNdID0gYXdhaXQgUHJvbWlzZS5hbGwoW1xuICAgICAgdHJ5V2Fybignc3RhY2snLCBbJ2doYycsICctLScsICctLW51bWVyaWMtdmVyc2lvbiddKSxcbiAgICAgIHRyeVdhcm4oJ2doYycsIFsnLS1udW1lcmljLXZlcnNpb24nXSksXG4gICAgXSlcbiAgICBVdGlsLmRlYnVnKGBTdGFjayBHSEMgdmVyc2lvbiAke3N0YWNrZ2hjfWApXG4gICAgVXRpbC5kZWJ1ZyhgUGF0aCBHSEMgdmVyc2lvbiAke3BhdGhnaGN9YClcbiAgICBpZiAoc3RhY2tnaGMgJiYgKHN0YWNrZ2hjICE9PSBjb21wKSkge1xuICAgICAgY29uc3Qgd2FybiA9IGBcXFxuR0hDIHZlcnNpb24gaW4geW91ciBTdGFjayAnJHtzdGFja2doY30nIGRvZXNuJ3QgbWF0Y2ggd2l0aCBcXFxuR0hDIHZlcnNpb24gdXNlZCB0byBidWlsZCBnaGMtbW9kICcke2NvbXB9Jy4gVGhpcyBjYW4gbGVhZCB0byBcXFxucHJvYmxlbXMgd2hlbiB1c2luZyBTdGFjayBwcm9qZWN0c2BcbiAgICAgIGF0b20ubm90aWZpY2F0aW9ucy5hZGRXYXJuaW5nKHdhcm4pXG4gICAgICBVdGlsLndhcm4od2FybilcbiAgICB9XG4gICAgaWYgKHBhdGhnaGMgJiYgKHBhdGhnaGMgIT09IGNvbXApKSB7XG4gICAgICBjb25zdCB3YXJuID0gYFxcXG5HSEMgdmVyc2lvbiBpbiB5b3VyIFBBVEggJyR7cGF0aGdoY30nIGRvZXNuJ3QgbWF0Y2ggd2l0aCBcXFxuR0hDIHZlcnNpb24gdXNlZCB0byBidWlsZCBnaGMtbW9kICcke2NvbXB9Jy4gVGhpcyBjYW4gbGVhZCB0byBcXFxucHJvYmxlbXMgd2hlbiB1c2luZyBDYWJhbCBvciBQbGFpbiBwcm9qZWN0c2BcbiAgICAgIGF0b20ubm90aWZpY2F0aW9ucy5hZGRXYXJuaW5nKHdhcm4pXG4gICAgICBVdGlsLndhcm4od2FybilcbiAgICB9XG4gIH1cblxuICBwcml2YXRlIGFzeW5jIHJlc29sdmVDYXBzIChyb290RGlyOiBBdG9tVHlwZXMuRGlyZWN0b3J5KTogUHJvbWlzZTxHSENNb2RDYXBzPiB7XG4gICAgdGhpcy5pbml0QmFja2VuZChyb290RGlyKVxuICAgIHJldHVybiB0aGlzLmNhcHNcbiAgfVxuXG4gIHByaXZhdGUgZ2V0Q2FwcyAoeyB2ZXJzIH06IHt2ZXJzOiBudW1iZXJbXX0pOiBHSENNb2RDYXBzIHtcbiAgICBjb25zdCBjYXBzOiBHSENNb2RDYXBzID0ge1xuICAgICAgdmVyc2lvbjogdmVycyxcbiAgICAgIGZpbGVNYXA6IGZhbHNlLFxuICAgICAgcXVvdGVBcmdzOiBmYWxzZSxcbiAgICAgIG9wdHBhcnNlOiBmYWxzZSxcbiAgICAgIHR5cGVDb25zdHJhaW50czogZmFsc2UsXG4gICAgICBicm93c2VQYXJlbnRzOiBmYWxzZSxcbiAgICAgIGludGVyYWN0aXZlQ2FzZVNwbGl0OiBmYWxzZSxcbiAgICAgIGltcG9ydGVkRnJvbTogZmFsc2UsXG4gICAgICBicm93c2VNYWluOiBmYWxzZVxuICAgIH1cblxuICAgIGNvbnN0IGF0TGVhc3QgPSAoYjogbnVtYmVyW10pID0+IHtcbiAgICAgIGZvciAobGV0IGkgPSAwOyBpIDwgYi5sZW5ndGg7IGkrKykge1xuICAgICAgICBjb25zdCB2ID0gYltpXVxuICAgICAgICBpZiAodmVyc1tpXSA+IHYpIHtcbiAgICAgICAgICByZXR1cm4gdHJ1ZVxuICAgICAgICB9IGVsc2UgaWYgKHZlcnNbaV0gPCB2KSB7XG4gICAgICAgICAgcmV0dXJuIGZhbHNlXG4gICAgICAgIH1cbiAgICAgIH1cbiAgICAgIHJldHVybiB0cnVlXG4gICAgfVxuXG4gICAgY29uc3QgZXhhY3QgPSAoYjogbnVtYmVyW10pID0+IHtcbiAgICAgIGZvciAobGV0IGkgPSAwOyBpIDwgYi5sZW5ndGg7IGkrKykge1xuICAgICAgICBjb25zdCB2ID0gYltpXVxuICAgICAgICBpZiAodmVyc1tpXSAhPT0gdikge1xuICAgICAgICAgIHJldHVybiBmYWxzZVxuICAgICAgICB9XG4gICAgICB9XG4gICAgICByZXR1cm4gdHJ1ZVxuICAgIH1cblxuICAgIGlmICghYXRMZWFzdChbNSwgNF0pKSB7XG4gICAgICBhdG9tLm5vdGlmaWNhdGlvbnMuYWRkRXJyb3IoYFxcXG5IYXNrZWxsLWdoYy1tb2Q6IGdoYy1tb2QgPCA1LjQgaXMgbm90IHN1cHBvcnRlZC4gXFxcblVzZSBhdCB5b3VyIG93biByaXNrIG9yIHVwZGF0ZSB5b3VyIGdoYy1tb2QgaW5zdGFsbGF0aW9uYCxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICB7IGRpc21pc3NhYmxlOiB0cnVlIH0pXG4gICAgfVxuICAgIGlmIChleGFjdChbNSwgNF0pKSB7XG4gICAgICBhdG9tLm5vdGlmaWNhdGlvbnMuYWRkV2FybmluZyhgXFxcbkhhc2tlbGwtZ2hjLW1vZDogZ2hjLW1vZCA1LjQuKiBpcyBkZXByZWNhdGVkLiBcXFxuVXNlIGF0IHlvdXIgb3duIHJpc2sgb3IgdXBkYXRlIHlvdXIgZ2hjLW1vZCBpbnN0YWxsYXRpb25gLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgeyBkaXNtaXNzYWJsZTogdHJ1ZSB9KVxuICAgIH1cbiAgICBpZiAoYXRMZWFzdChbNSwgNF0pKSB7XG4gICAgICBjYXBzLmZpbGVNYXAgPSB0cnVlXG4gICAgfVxuICAgIGlmIChhdExlYXN0KFs1LCA1XSkpIHtcbiAgICAgIGNhcHMucXVvdGVBcmdzID0gdHJ1ZVxuICAgICAgY2Fwcy5vcHRwYXJzZSA9IHRydWVcbiAgICB9XG4gICAgaWYgKGF0TGVhc3QoWzUsIDZdKSkge1xuICAgICAgY2Fwcy50eXBlQ29uc3RyYWludHMgPSB0cnVlXG4gICAgICBjYXBzLmJyb3dzZVBhcmVudHMgPSB0cnVlXG4gICAgICBjYXBzLmludGVyYWN0aXZlQ2FzZVNwbGl0ID0gdHJ1ZVxuICAgIH1cbiAgICBpZiAoYXRvbS5jb25maWcuZ2V0KCdoYXNrZWxsLWdoYy1tb2QuZXhwZXJpbWVudGFsJykpIHtcbiAgICAgIGNhcHMuaW1wb3J0ZWRGcm9tID0gdHJ1ZVxuICAgIH1cbiAgICBVdGlsLmRlYnVnKEpTT04uc3RyaW5naWZ5KGNhcHMpKVxuICAgIHJldHVybiBjYXBzXG4gIH1cblxuICBwcml2YXRlIGFzeW5jIGdldFNldHRpbmdzIChydW5EaXI6IEF0b21UeXBlcy5EaXJlY3RvcnkpIHtcbiAgICBjb25zdCByZWFkU2V0dGluZ3MgPSBhc3luYyAoZmlsZTogQXRvbVR5cGVzLkZpbGUpID0+IHtcbiAgICAgIHRyeSB7XG4gICAgICAgIGNvbnN0IGV4ID0gYXdhaXQgZmlsZS5leGlzdHMoKVxuICAgICAgICBpZiAoZXgpIHtcbiAgICAgICAgICBjb25zdCBjb250ZW50cyA9IGF3YWl0IGZpbGUucmVhZCgpXG4gICAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgIHJldHVybiBKU09OLnBhcnNlKGNvbnRlbnRzKVxuICAgICAgICAgIH0gY2F0Y2ggKGVycikge1xuICAgICAgICAgICAgYXRvbS5ub3RpZmljYXRpb25zLmFkZEVycm9yKGBGYWlsZWQgdG8gcGFyc2UgJHtmaWxlLmdldFBhdGgoKX1gLCB7XG4gICAgICAgICAgICAgIGRldGFpbDogZXJyLFxuICAgICAgICAgICAgICBkaXNtaXNzYWJsZTogdHJ1ZVxuICAgICAgICAgICAgfSlcbiAgICAgICAgICAgIHRocm93IGVyclxuICAgICAgICAgIH1cbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICByZXR1cm4ge31cbiAgICAgICAgfVxuICAgICAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICAgICAgaWYgKGVycm9yKSB7IFV0aWwud2FybihlcnJvcikgfVxuICAgICAgICByZXR1cm4ge31cbiAgICAgIH1cbiAgICB9XG5cbiAgICBjb25zdCBsb2NhbFNldHRpbmdzID0gcmVhZFNldHRpbmdzKHJ1bkRpci5nZXRGaWxlKCcuaGFza2VsbC1naGMtbW9kLmpzb24nKSlcblxuICAgIGNvbnN0IFtwcm9qZWN0RGlyXSA9IEFycmF5LmZyb20oYXRvbS5wcm9qZWN0LmdldERpcmVjdG9yaWVzKCkuZmlsdGVyKChkKSA9PiBkLmNvbnRhaW5zKHJ1bkRpci5nZXRQYXRoKCkpKSlcbiAgICBjb25zdCBwcm9qZWN0U2V0dGluZ3MgPVxuICAgICAgcHJvamVjdERpciA/XG4gICAgICAgIHJlYWRTZXR0aW5ncyhwcm9qZWN0RGlyLmdldEZpbGUoJy5oYXNrZWxsLWdoYy1tb2QuanNvbicpKVxuICAgICAgICA6XG4gICAgICAgIFByb21pc2UucmVzb2x2ZSh7fSlcblxuICAgIGNvbnN0IGNvbmZpZ0RpciA9IG5ldyBEaXJlY3RvcnkoYXRvbS5nZXRDb25maWdEaXJQYXRoKCkpXG4gICAgY29uc3QgZ2xvYmFsU2V0dGluZ3MgPSByZWFkU2V0dGluZ3MoY29uZmlnRGlyLmdldEZpbGUoJ2hhc2tlbGwtZ2hjLW1vZC5qc29uJykpXG5cbiAgICBjb25zdCBbZ2xvYiwgcHJqLCBsb2NdID0gYXdhaXQgUHJvbWlzZS5hbGwoW2dsb2JhbFNldHRpbmdzLCBwcm9qZWN0U2V0dGluZ3MsIGxvY2FsU2V0dGluZ3NdKVxuICAgIHJldHVybiB7IC4uLmdsb2IsIC4uLnByaiwgLi4ubG9jIH1cbiAgfVxuXG4gIHByaXZhdGUgYXN5bmMgcXVldWVDbWQgKFxuICAgIHF1ZXVlTmFtZTogQ29tbWFuZHMsXG4gICAgZGlyOiBBdG9tVHlwZXMuRGlyZWN0b3J5LFxuICAgIHJ1bkFyZ3M6IHtcbiAgICAgIGNvbW1hbmQ6IHN0cmluZywgdGV4dD86IHN0cmluZywgdXJpPzogc3RyaW5nLCBpbnRlcmFjdGl2ZT86IGJvb2xlYW4sXG4gICAgICBkYXNoQXJncz86IHN0cmluZ1tdLCBhcmdzPzogc3RyaW5nW11cbiAgICB9XG4gICk6IFByb21pc2U8c3RyaW5nW10+IHtcbiAgICBpZiAoYXRvbS5jb25maWcuZ2V0KCdoYXNrZWxsLWdoYy1tb2QubG93TWVtb3J5U3lzdGVtJykpIHtcbiAgICAgIHF1ZXVlTmFtZSA9ICdsb3dtZW0nXG4gICAgfVxuICAgIGNvbnN0IGJhY2tlbmQgPSBhd2FpdCB0aGlzLmluaXRCYWNrZW5kKGRpcilcbiAgICBjb25zdCBwcm9taXNlID0gdGhpcy5jb21tYW5kUXVldWVzW3F1ZXVlTmFtZV0uYWRkKGFzeW5jICgpID0+IHtcbiAgICAgIHRoaXMuZW1pdHRlci5lbWl0KCdiYWNrZW5kLWFjdGl2ZScpXG4gICAgICB0cnkge1xuICAgICAgICBjb25zdCBzZXR0aW5ncyA9IGF3YWl0IHRoaXMuZ2V0U2V0dGluZ3MoZGlyKVxuICAgICAgICBpZiAoc2V0dGluZ3MuZGlzYWJsZSkgeyB0aHJvdyBuZXcgRXJyb3IoJ0doYy1tb2QgZGlzYWJsZWQgaW4gc2V0dGluZ3MnKSB9XG4gICAgICAgIHJldHVybiBiYWNrZW5kLnJ1bih7XG4gICAgICAgICAgLi4ucnVuQXJncyxcbiAgICAgICAgICBzdXBwcmVzc0Vycm9yczogc2V0dGluZ3Muc3VwcHJlc3NFcnJvcnMsXG4gICAgICAgICAgZ2hjT3B0aW9uczogc2V0dGluZ3MuZ2hjT3B0aW9ucyxcbiAgICAgICAgICBnaGNNb2RPcHRpb25zOiBzZXR0aW5ncy5naGNNb2RPcHRpb25zLFxuICAgICAgICB9KVxuICAgICAgfSBjYXRjaCAoZXJyKSB7XG4gICAgICAgICAgVXRpbC53YXJuKGVycilcbiAgICAgICAgICB0aHJvdyBlcnJcbiAgICAgIH1cbiAgICB9KVxuICAgIHByb21pc2UudGhlbigocmVzKSA9PiB7XG4gICAgICBjb25zdCBxZSA9IChxbjogQ29tbWFuZHMpID0+IHtcbiAgICAgICAgY29uc3QgcSA9IHRoaXMuY29tbWFuZFF1ZXVlc1txbl1cbiAgICAgICAgcmV0dXJuIChxLmdldFF1ZXVlTGVuZ3RoKCkgKyBxLmdldFBlbmRpbmdMZW5ndGgoKSkgPT09IDBcbiAgICAgIH1cbiAgICAgIGlmIChxZShxdWV1ZU5hbWUpKSB7XG4gICAgICAgIHRoaXMuZW1pdHRlci5lbWl0KCdxdWV1ZS1pZGxlJywgeyBxdWV1ZTogcXVldWVOYW1lIH0pXG4gICAgICAgIGlmIChPYmplY3Qua2V5cyh0aGlzLmNvbW1hbmRRdWV1ZXMpLmV2ZXJ5KHFlKSkge1xuICAgICAgICAgIHRoaXMuZW1pdHRlci5lbWl0KCdiYWNrZW5kLWlkbGUnKVxuICAgICAgICB9XG4gICAgICB9XG4gICAgfSlcbiAgICByZXR1cm4gcHJvbWlzZVxuICB9XG5cbiAgcHJpdmF0ZSBhc3luYyBkb0NoZWNrT3JMaW50QnVmZmVyIChjbWQ6ICdjaGVjaycgfCAnbGludCcsIGJ1ZmZlcjogQXRvbVR5cGVzLlRleHRCdWZmZXIsIGZhc3Q6IGJvb2xlYW4pIHtcbiAgICBsZXQgZGFzaEFyZ3NcbiAgICBpZiAoYnVmZmVyLmlzRW1wdHkoKSkgeyByZXR1cm4gW10gfVxuICAgIGlmICghIGJ1ZmZlci5nZXRVcmkoKSkgeyByZXR1cm4gW10gfVxuXG4gICAgLy8gQSBkaXJ0eSBoYWNrIHRvIG1ha2UgbGludCB3b3JrIHdpdGggbGhzXG4gICAgbGV0IHVyaSA9IGJ1ZmZlci5nZXRVcmkoKVxuICAgIGNvbnN0IG9sZHVyaSA9IGJ1ZmZlci5nZXRVcmkoKVxuICAgIGxldCB0ZXh0XG4gICAgdHJ5IHtcbiAgICAgIGlmICgoY21kID09PSAnbGludCcpICYmIChleHRuYW1lKHVyaSkgPT09ICcubGhzJykpIHtcbiAgICAgICAgdXJpID0gdXJpLnNsaWNlKDAsIC0xKVxuICAgICAgICB0ZXh0ID0gYXdhaXQgdW5saXQob2xkdXJpLCBidWZmZXIuZ2V0VGV4dCgpKVxuICAgICAgfSBlbHNlIGlmIChidWZmZXIuaXNNb2RpZmllZCgpKSB7XG4gICAgICAgIHRleHQgPSBidWZmZXIuZ2V0VGV4dCgpXG4gICAgICB9XG4gICAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICAgIC8vIFRPRE86IFJlamVjdFxuICAgICAgY29uc3QgbSA9IChlcnJvciBhcyBFcnJvcikubWVzc2FnZS5tYXRjaCgvXiguKj8pOihbMC05XSspOiAqKC4qKSAqJC8pXG4gICAgICBpZiAoIW0pIHsgdGhyb3cgZXJyb3IgfVxuICAgICAgY29uc3QgW3VyaTIsIGxpbmUsIG1lc3NdID0gbS5zbGljZSgxKVxuICAgICAgcmV0dXJuIFt7XG4gICAgICAgIHVyaTogdXJpMixcbiAgICAgICAgcG9zaXRpb246IG5ldyBQb2ludChwYXJzZUludChsaW5lLCAxMCkgLSAxLCAwKSxcbiAgICAgICAgbWVzc2FnZTogbWVzcyxcbiAgICAgICAgc2V2ZXJpdHk6ICdsaW50J1xuICAgICAgfV1cbiAgICB9XG4gICAgLy8gZW5kIG9mIGRpcnR5IGhhY2tcblxuICAgIGlmIChjbWQgPT09ICdsaW50Jykge1xuICAgICAgY29uc3Qgb3B0czogc3RyaW5nW10gPSBhdG9tLmNvbmZpZy5nZXQoJ2hhc2tlbGwtZ2hjLW1vZC5obGludE9wdGlvbnMnKVxuICAgICAgZGFzaEFyZ3MgPSBbXVxuICAgICAgZm9yIChjb25zdCBvcHQgb2Ygb3B0cykge1xuICAgICAgICBkYXNoQXJncy5wdXNoKCctLWhsaW50T3B0Jywgb3B0KVxuICAgICAgfVxuICAgIH1cblxuICAgIGNvbnN0IHJvb3REaXIgPSBhd2FpdCB0aGlzLmdldFJvb3REaXIoYnVmZmVyKVxuXG4gICAgY29uc3QgbGluZXMgPSBhd2FpdCB0aGlzLnF1ZXVlQ21kKCdjaGVja2xpbnQnLCByb290RGlyLCB7XG4gICAgICBpbnRlcmFjdGl2ZTogZmFzdCxcbiAgICAgIGNvbW1hbmQ6IGNtZCxcbiAgICAgIHVyaSxcbiAgICAgIHRleHQsXG4gICAgICBkYXNoQXJnc1xuICAgIH0pXG5cbiAgICBjb25zdCByeCA9IC9eKC4qPyk6KFswLTlcXHNdKyk6KFswLTlcXHNdKyk6ICooPzooV2FybmluZ3xFcnJvcik6ICopPyhbXl0qKS9cbiAgICBjb25zdCByZXMgPSBbXVxuICAgIGZvciAoY29uc3QgbGluZSBvZiBsaW5lcykge1xuICAgICAgY29uc3QgbWF0Y2ggPSBsaW5lLm1hdGNoKHJ4KVxuICAgICAgaWYgKCFtYXRjaCkge1xuICAgICAgICBpZiAobGluZS50cmltKCkubGVuZ3RoKSB7IFV0aWwud2FybihgZ2hjLW1vZCBzYXlzOiAke2xpbmV9YCkgfVxuICAgICAgICBjb250aW51ZVxuICAgICAgfVxuICAgICAgY29uc3QgW2ZpbGUyLCByb3csIGNvbCwgd2FybmluZywgbWVzc2FnZV0gPSBtYXRjaC5zbGljZSgxKVxuICAgICAgaWYgKGZpbGUyID09PSAnRHVtbXknICYmIHJvdyA9PT0gJzAnICYmIGNvbCA9PT0gJzAnKSB7XG4gICAgICAgIGlmICh3YXJuaW5nID09PSAnRXJyb3InKSB7XG4gICAgICAgICAgYXRvbS5ub3RpZmljYXRpb25zLmFkZEVycm9yKG1lc3NhZ2UpXG4gICAgICAgICAgY29udGludWVcbiAgICAgICAgfSBlbHNlIGlmICh3YXJuaW5nID09PSAnV2FybmluZycpIHtcbiAgICAgICAgICBhdG9tLm5vdGlmaWNhdGlvbnMuYWRkV2FybmluZyhtZXNzYWdlKVxuICAgICAgICAgIGNvbnRpbnVlXG4gICAgICAgIH1cbiAgICAgIH1cblxuICAgICAgY29uc3QgZmlsZSA9IHVyaS5lbmRzV2l0aChmaWxlMikgPyBvbGR1cmkgOiBmaWxlMlxuICAgICAgY29uc3Qgc2V2ZXJpdHkgPVxuICAgICAgICBjbWQgPT09ICdsaW50JyA/XG4gICAgICAgICAgJ2xpbnQnXG4gICAgICAgICAgOiB3YXJuaW5nID09PSAnV2FybmluZycgP1xuICAgICAgICAgICAgJ3dhcm5pbmcnXG4gICAgICAgICAgICA6XG4gICAgICAgICAgICAnZXJyb3InXG4gICAgICBjb25zdCBtZXNzUG9zID0gbmV3IFBvaW50KHBhcnNlSW50KHJvdywgMTApIC0gMSwgcGFyc2VJbnQoY29sLCAxMCkgLSAxKVxuICAgICAgY29uc3QgcG9zaXRpb24gPSBVdGlsLnRhYlVuc2hpZnRGb3JQb2ludChidWZmZXIsIG1lc3NQb3MpXG4gICAgICBsZXQgbXl1cmlcbiAgICAgIHRyeSB7XG4gICAgICAgIG15dXJpID0gcm9vdERpci5nZXRGaWxlKHJvb3REaXIucmVsYXRpdml6ZShmaWxlKSkuZ2V0UGF0aCgpXG4gICAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgICBteXVyaSA9IGZpbGVcbiAgICAgIH1cbiAgICAgIHJlcy5wdXNoKHtcbiAgICAgICAgdXJpOiBteXVyaSxcbiAgICAgICAgcG9zaXRpb24sXG4gICAgICAgIG1lc3NhZ2UsXG4gICAgICAgIHNldmVyaXR5XG4gICAgICB9KVxuICAgIH1cbiAgICByZXR1cm4gcmVzXG4gIH1cbn1cbiJdfQ==