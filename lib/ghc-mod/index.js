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
            Util.warnGHCPackagePath();
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
        this.emitter.emit('did-destroy', undefined);
        this.disposables.dispose();
    }
    onDidDestroy(callback) {
        return this.emitter.on('did-destroy', callback);
    }
    onWarning(callback) {
        return this.emitter.on('warning', callback);
    }
    onError(callback) {
        return this.emitter.on('error', callback);
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
                dashArgs: caps.browseParents ? ['-d', '-o', '-p'] : ['-d', '-o'],
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
                else if (/^\(.*\)$/.test(name)) {
                    symbolType = 'operator';
                }
                else if (Util.isUpperCase(name[0])) {
                    symbolType = 'tag';
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
            const symInfo = Util.getSymbolInRange(editor, crange);
            if (!symInfo) {
                throw new Error('Couldn\'t get symbol for info');
            }
            const { symbol, range } = symInfo;
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
            const symInfo = Util.getSymbolInRange(editor, crange);
            if (!symInfo) {
                throw new Error('Couldn\'t get symbol for import');
            }
            const { symbol } = symInfo;
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
            let opts, vers, caps;
            try {
                opts = yield Util.getProcessOptions(rootDir.getPath());
                const versP = this.getVersion(opts);
                const bopts = opts;
                versP.then((v) => { this.checkComp(bopts, v); });
                vers = yield versP;
                caps = yield this.getCaps(vers);
                this.resolveCapsPromise(caps);
                const backend = new ghc_modi_process_real_1.GhcModiProcessReal(yield this.resolveCaps(rootDir), rootDir, opts);
                this.disposables.add(backend.onError((arg) => this.emitter.emit('error', arg)), backend.onWarning((arg) => this.emitter.emit('warning', arg)));
                return backend;
            }
            catch (err) {
                Util.notifySpawnFail({ dir: rootDir.getPath(), err, opts, vers, caps });
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
            const [projectDir] = atom.project.getDirectories().filter((d) => d.contains(runDir.getPath()));
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
                this.emitter.emit('backend-active', undefined);
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
                        this.emitter.emit('backend-idle', undefined);
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
                        this.emitter.emit('error', { err: Util.mkError('GHCModStdoutError', message), caps: yield this.caps });
                        continue;
                    }
                    else if (warning === 'Warning') {
                        this.emitter.emit('warning', message);
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaW5kZXguanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi9zcmMvZ2hjLW1vZC9pbmRleC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOzs7Ozs7Ozs7O0FBQUEsK0JBQTRFO0FBQzVFLGdDQUErQjtBQUMvQiwrQkFBOEI7QUFDOUIsdUNBQXVDO0FBQ3ZDLDJEQUEwQztBQUUxQyxtRUFBaUg7QUFhakg7SUFnQkU7UUFDRSxJQUFJLENBQUMsV0FBVyxHQUFHLElBQUksMEJBQW1CLEVBQUUsQ0FBQTtRQUM1QyxJQUFJLENBQUMsT0FBTyxHQUFHLElBQUksY0FBTyxFQUFFLENBQUE7UUFDNUIsSUFBSSxDQUFDLFdBQVcsQ0FBQyxHQUFHLENBQUMsSUFBSSxDQUFDLE9BQU8sQ0FBQyxDQUFBO1FBQ2xDLElBQUksQ0FBQyxZQUFZLEdBQUcsSUFBSSxPQUFPLEVBQUUsQ0FBQTtRQUNqQyxJQUFJLENBQUMsT0FBTyxHQUFHLElBQUksR0FBRyxFQUFFLENBQUE7UUFDeEIsSUFBSSxDQUFDLElBQUksR0FBRyxJQUFJLE9BQU8sQ0FBQyxDQUFDLE9BQU8sS0FBSyxJQUFJLENBQUMsa0JBQWtCLEdBQUcsT0FBTyxDQUFDLENBQUE7UUFFdkUsRUFBRSxDQUFDLENBQUMsT0FBTyxDQUFDLEdBQUcsQ0FBQyxnQkFBZ0IsSUFBSSxDQUFDLElBQUksQ0FBQyxNQUFNLENBQUMsR0FBRyxDQUFDLCtDQUErQyxDQUFDLENBQUMsQ0FBQyxDQUFDO1lBQ3RHLElBQUksQ0FBQyxrQkFBa0IsRUFBRSxDQUFBO1FBQzNCLENBQUM7UUFFRCxJQUFJLENBQUMsWUFBWSxFQUFFLENBQUE7SUFDckIsQ0FBQztJQUVZLFVBQVUsQ0FBRSxNQUE0Qjs7WUFDbkQsSUFBSSxHQUFHLENBQUE7WUFDUCxHQUFHLEdBQUcsSUFBSSxDQUFDLFlBQVksQ0FBQyxHQUFHLENBQUMsTUFBTSxDQUFDLENBQUE7WUFDbkMsRUFBRSxDQUFDLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQztnQkFDUixN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UUFBUSxDQUFDLEdBQUcsRUFBRSxFQUFFLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQTtnQkFDdkUsTUFBTSxRQUFRLEdBQUcsSUFBSSxDQUFDLGtCQUFrQixDQUFDLE1BQU0sRUFBRSxPQUFPLENBQUMsQ0FBQTtnQkFDekQsSUFBSSxLQUFLLENBQUE7Z0JBQ1QsSUFBSSxDQUFDO29CQUNILEtBQUssR0FBRyxPQUFPLENBQUMsT0FBTyxDQUFDLE9BQU8sQ0FBQyxVQUFVLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxPQUFPLEVBQUUsQ0FBQTtnQkFDN0QsQ0FBQztnQkFBQyxLQUFLLENBQUMsQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDO29CQUNmLEtBQUssR0FBRyxJQUFJLENBQUE7Z0JBQ2QsQ0FBQztnQkFDRCxHQUFHLENBQUMsSUFBSSxDQUFDO29CQUNQLEdBQUcsRUFBRSxLQUFLO29CQUNWLFFBQVE7b0JBQ1IsT0FBTztvQkFDUCxRQUFRO2lCQUNULENBQUMsQ0FBQTtZQUNKLENBQUM7WUFDRCxNQUFNLENBQUMsR0FBRyxDQUFBO1FBQ1osQ0FBQztLQUFBO0NBQ0Y7QUE1bUJELHdDQTRtQkMiLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgeyBSYW5nZSwgUG9pbnQsIEVtaXR0ZXIsIENvbXBvc2l0ZURpc3Bvc2FibGUsIERpcmVjdG9yeSB9IGZyb20gJ2F0b20nXG5pbXBvcnQgKiBhcyBVdGlsIGZyb20gJy4uL3V0aWwnXG5pbXBvcnQgeyBleHRuYW1lIH0gZnJvbSAncGF0aCdcbmltcG9ydCBRdWV1ZSA9IHJlcXVpcmUoJ3Byb21pc2UtcXVldWUnKVxuaW1wb3J0IHsgdW5saXQgfSBmcm9tICdhdG9tLWhhc2tlbGwtdXRpbHMnXG5cbmltcG9ydCB7IEdoY01vZGlQcm9jZXNzUmVhbCwgR0hDTW9kQ2FwcywgUnVuQXJncywgUnVuT3B0aW9ucywgSUVycm9yQ2FsbGJhY2tBcmdzIH0gZnJvbSAnLi9naGMtbW9kaS1wcm9jZXNzLXJlYWwnXG5cbmV4cG9ydCB7SUVycm9yQ2FsbGJhY2tBcmdzLCBSdW5BcmdzLCBHSENNb2RDYXBzfVxuXG50eXBlIENvbW1hbmRzID0gJ2NoZWNrbGludCcgfCAnYnJvd3NlJyB8ICd0eXBlaW5mbycgfCAnZmluZCcgfCAnaW5pdCcgfCAnbGlzdCcgfCAnbG93bWVtJ1xuXG5leHBvcnQgaW50ZXJmYWNlIFN5bWJvbERlc2Mge1xuICBuYW1lOiBzdHJpbmcsXG4gIHN5bWJvbFR5cGU6IFVQSS5Db21wbGV0aW9uQmFja2VuZC5TeW1ib2xUeXBlLFxuICB0eXBlU2lnbmF0dXJlPzogc3RyaW5nLFxuICBwYXJlbnQ/OiBzdHJpbmdcbn1cblxuZXhwb3J0IGNsYXNzIEdoY01vZGlQcm9jZXNzIHtcbiAgcHJpdmF0ZSBiYWNrZW5kOiBNYXA8c3RyaW5nLCBQcm9taXNlPEdoY01vZGlQcm9jZXNzUmVhbD4+XG4gIHByaXZhdGUgZGlzcG9zYWJsZXM6IENvbXBvc2l0ZURpc3Bvc2FibGVcbiAgcHJpdmF0ZSBlbWl0dGVyOiBNeUVtaXR0ZXI8e1xuICAgICdkaWQtZGVzdHJveSc6IHVuZGVmaW5lZFxuICAgICd3YXJuaW5nJzogc3RyaW5nXG4gICAgJ2Vycm9yJzogSUVycm9yQ2FsbGJhY2tBcmdzXG4gICAgJ2JhY2tlbmQtYWN0aXZlJzogdm9pZFxuICAgICdiYWNrZW5kLWlkbGUnOiB2b2lkXG4gICAgJ3F1ZXVlLWlkbGUnOiB7IHF1ZXVlOiBDb21tYW5kcyB9XG4gIH0+XG4gIHByaXZhdGUgYnVmZmVyRGlyTWFwOiBXZWFrTWFwPEF0b21UeXBlcy5UZXh0QnVmZmVyLCBBdG9tVHlwZXMuRGlyZWN0b3J5PlxuICBwcml2YXRlIGNvbW1hbmRRdWV1ZXM6IHtbSyBpbiBDb21tYW5kc106IFF1ZXVlfVxuICBwcml2YXRlIGNhcHM6IFByb21pc2U8R0hDTW9kQ2Fwcz5cbiAgcHJpdmF0ZSByZXNvbHZlQ2Fwc1Byb21pc2U6ICh2YWw6IEdIQ01vZENhcHMpID0+IHZvaWRcblxuICBjb25zdHJ1Y3RvciAoKSB7XG4gICAgdGhpcy5kaXNwb3NhYmxlcyA9IG5ldyBDb21wb3NpdGVEaXNwb3NhYmxlKClcbiAgICB0aGlzLmVtaXR0ZXIgPSBuZXcgRW1pdHRlcigpXG4gICAgdGhpcy5kaXNwb3NhYmxlcy5hZGQodGhpcy5lbWl0dGVyKVxuICAgIHRoaXMuYnVmZmVyRGlyTWFwID0gbmV3IFdlYWtNYXAoKVxuICAgIHRoaXMuYmFja2VuZCA9IG5ldyBNYXAoKVxuICAgIHRoaXMuY2FwcyA9IG5ldyBQcm9taXNlKChyZXNvbHZlKSA9PiB0aGlzLnJlc29sdmVDYXBzUHJvbWlzZSA9IHJlc29sdmUpXG5cbiAgICBpZiAocHJvY2Vzcy5lbnYuR0hDX1BBQ0tBR0VfUEFUSCAmJiAhYXRvbS5jb25maWcuZ2V0KCdoYXNrZWxsLWdoYy1tb2Quc3VwcHJlc3NHaGNQYWNrYWdlUGF0aFdhcm5pbmcnKSkge1xuICAgICAgVXRpbC53YXJuR0hDUGFja2FnZVBhdGgoKVxuICAgIH1cblxuICAgIHRoaXMuY3JlYXRlUXVldWVzKClcbiAgfVxuXG4gIHB1YmxpYyBhc3luYyBnZXRSb290RGlyIChidWZmZXI6IEF0b21UeXBlcy5UZXh0QnVmZmVyKTogUHJvbWlzZTxBdG9tVHlwZXMuRGlyZWN0b3J5PiB7XG4gICAgbGV0IGRpclxuICAgIGRpciA9IHRoaXMuYnVmZmVyRGlyTWFwLmdldChidWZmZXIpXG4gICAgaWYgKGRpcikge1xuICAgICAgcmV0dXJuIGRpclxuICAgIH1cbiAgICBkaXIgPSBhd2FpdCBVdGlsLmdldFJvb3REaXIoYnVmZmVyKVxuICAgIHRoaXMuYnVmZmVyRGlyTWFwLnNldChidWZmZXIsIGRpcilcbiAgICByZXR1cm4gZGlyXG4gIH1cblxuICBwdWJsaWMga2lsbFByb2Nlc3MgKCkge1xuICAgIGZvciAoY29uc3QgYnAgb2YgdGhpcy5iYWNrZW5kLnZhbHVlcygpKSB7XG4gICAgICBicC50aGVuKChiKSA9PiBiLmtpbGxQcm9jZXNzKCkpXG4gICAgfVxuICAgIHRoaXMuYmFja2VuZC5jbGVhcigpXG4gIH1cblxuICBwdWJsaWMgZGVzdHJveSAoKSB7XG4gICAgZm9yIChjb25zdCBicCBvZiB0aGlzLmJhY2tlbmQudmFsdWVzKCkpIHtcbiAgICAgIGJwLnRoZW4oKGIpID0+IGIuZGVzdHJveSgpKVxuICAgIH1cbiAgICB0aGlzLmJhY2tlbmQuY2xlYXIoKVxuICAgIHRoaXMuZW1pdHRlci5lbWl0KCdkaWQtZGVzdHJveScsIHVuZGVmaW5lZClcbiAgICB0aGlzLmRpc3Bvc2FibGVzLmRpc3Bvc2UoKVxuICB9XG5cbiAgcHVibGljIG9uRGlkRGVzdHJveSAoY2FsbGJhY2s6ICgpID0+IHZvaWQpIHtcbiAgICByZXR1cm4gdGhpcy5lbWl0dGVyLm9uKCdkaWQtZGVzdHJveScsIGNhbGxiYWNrKVxuICB9XG5cbiAgcHVibGljIG9uV2FybmluZyAoY2FsbGJhY2s6ICh3YXJuaW5nOiBzdHJpbmcpID0+IHZvaWQpIHtcbiAgICByZXR1cm4gdGhpcy5lbWl0dGVyLm9uKCd3YXJuaW5nJywgY2FsbGJhY2spXG4gIH1cblxuICBwdWJsaWMgb25FcnJvciAoY2FsbGJhY2s6IChlcnJvcjogSUVycm9yQ2FsbGJhY2tBcmdzKSA9PiB2b2lkKSB7XG4gICAgcmV0dXJuIHRoaXMuZW1pdHRlci5vbignZXJyb3InLCBjYWxsYmFjaylcbiAgfVxuXG4gIHB1YmxpYyBvbkJhY2tlbmRBY3RpdmUgKGNhbGxiYWNrOiAoKSA9PiB2b2lkKSB7XG4gICAgcmV0dXJuIHRoaXMuZW1pdHRlci5vbignYmFja2VuZC1hY3RpdmUnLCBjYWxsYmFjaylcbiAgfVxuXG4gIHB1YmxpYyBvbkJhY2tlbmRJZGxlIChjYWxsYmFjazogKCkgPT4gdm9pZCkge1xuICAgIHJldHVybiB0aGlzLmVtaXR0ZXIub24oJ2JhY2tlbmQtaWRsZScsIGNhbGxiYWNrKVxuICB9XG5cbiAgcHVibGljIG9uUXVldWVJZGxlIChjYWxsYmFjazogKCkgPT4gdm9pZCkge1xuICAgIHJldHVybiB0aGlzLmVtaXR0ZXIub24oJ3F1ZXVlLWlkbGUnLCBjYWxsYmFjaylcbiAgfVxuXG4gIHB1YmxpYyBhc3luYyBydW5MaXN0IChidWZmZXI6IEF0b21UeXBlcy5UZXh0QnVmZmVyKSB7XG4gICAgcmV0dXJuIHRoaXMucXVldWVDbWQoJ2xpc3QnLCBhd2FpdCB0aGlzLmdldFJvb3REaXIoYnVmZmVyKSwgeyBjb21tYW5kOiAnbGlzdCcgfSlcbiAgfVxuXG4gIHB1YmxpYyBhc3luYyBydW5MYW5nIChkaXI6IEF0b21UeXBlcy5EaXJlY3RvcnkpIHtcbiAgICByZXR1cm4gdGhpcy5xdWV1ZUNtZCgnaW5pdCcsIGRpciwgeyBjb21tYW5kOiAnbGFuZycgfSlcbiAgfVxuXG4gIHB1YmxpYyBhc3luYyBydW5GbGFnIChkaXI6IEF0b21UeXBlcy5EaXJlY3RvcnkpIHtcbiAgICByZXR1cm4gdGhpcy5xdWV1ZUNtZCgnaW5pdCcsIGRpciwgeyBjb21tYW5kOiAnZmxhZycgfSlcbiAgfVxuXG4gIHB1YmxpYyBhc3luYyBydW5Ccm93c2UgKHJvb3REaXI6IEF0b21UeXBlcy5EaXJlY3RvcnksIG1vZHVsZXM6IHN0cmluZ1tdKTogUHJvbWlzZTxTeW1ib2xEZXNjW10+IHtcbiAgICBjb25zdCBjYXBzID0gYXdhaXQgdGhpcy5yZXNvbHZlQ2Fwcyhyb290RGlyKVxuICAgIGlmIChjYXBzLmJyb3dzZU1haW4gPT09IGZhbHNlKSB7XG4gICAgICBtb2R1bGVzID0gbW9kdWxlcy5maWx0ZXIoKHYpID0+IHYgIT09ICdNYWluJylcbiAgICB9XG4gICAgaWYgKG1vZHVsZXMubGVuZ3RoID09PSAwKSB7IHJldHVybiBbXSB9XG4gICAgY29uc3QgbGluZXMgPSBhd2FpdCB0aGlzLnF1ZXVlQ21kKCdicm93c2UnLCByb290RGlyLCB7XG4gICAgICBjb21tYW5kOiAnYnJvd3NlJyxcbiAgICAgIGRhc2hBcmdzOiBjYXBzLmJyb3dzZVBhcmVudHMgPyBbJy1kJywgJy1vJywgJy1wJ10gOiBbJy1kJywgJy1vJ10sXG4gICAgICBhcmdzOiBtb2R1bGVzXG4gICAgfSlcbiAgICByZXR1cm4gbGluZXMubWFwKChzKSA9PiB7XG4gICAgICAvLyBlbnVtRnJvbSA6OiBFbnVtIGEgPT4gYSAtPiBbYV0gLS0gZnJvbTpFbnVtXG4gICAgICBjb25zdCBwYXR0ZXJuID0gY2Fwcy5icm93c2VQYXJlbnRzID8gL14oLio/KSA6OiAoLio/KSg/OiAtLSBmcm9tOiguKikpPyQvIDogL14oLio/KSA6OiAoLiopJC9cbiAgICAgIGNvbnN0IG1hdGNoID0gcy5tYXRjaChwYXR0ZXJuKVxuICAgICAgbGV0IG5hbWUsIHR5cGVTaWduYXR1cmUsIHBhcmVudFxuICAgICAgaWYgKG1hdGNoKSB7XG4gICAgICAgIG5hbWUgPSBtYXRjaFsxXVxuICAgICAgICB0eXBlU2lnbmF0dXJlID0gbWF0Y2hbMl1cbiAgICAgICAgcGFyZW50ID0gbWF0Y2hbM11cbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIG5hbWUgPSBzXG4gICAgICB9XG4gICAgICBsZXQgc3ltYm9sVHlwZTogVVBJLkNvbXBsZXRpb25CYWNrZW5kLlN5bWJvbFR5cGVcbiAgICAgIGlmICh0eXBlU2lnbmF0dXJlICYmIC9eKD86dHlwZXxkYXRhfG5ld3R5cGUpLy50ZXN0KHR5cGVTaWduYXR1cmUpKSB7XG4gICAgICAgIHN5bWJvbFR5cGUgPSAndHlwZSdcbiAgICAgIH0gZWxzZSBpZiAodHlwZVNpZ25hdHVyZSAmJiAvXig/OmNsYXNzKS8udGVzdCh0eXBlU2lnbmF0dXJlKSkge1xuICAgICAgICBzeW1ib2xUeXBlID0gJ2NsYXNzJ1xuICAgICAgfSBlbHNlIGlmICgvXlxcKC4qXFwpJC8udGVzdChuYW1lKSkge1xuICAgICAgICBzeW1ib2xUeXBlID0gJ29wZXJhdG9yJ1xuICAgICAgfSBlbHNlIGlmIChVdGlsLmlzVXBwZXJDYXNlKG5hbWVbMF0pKSB7XG4gICAgICAgIHN5bWJvbFR5cGUgPSAndGFnJ1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgc3ltYm9sVHlwZSA9ICdmdW5jdGlvbidcbiAgICAgIH1cbiAgICAgIHJldHVybiB7IG5hbWUsIHR5cGVTaWduYXR1cmUsIHN5bWJvbFR5cGUsIHBhcmVudCB9XG4gICAgfSlcbiAgfVxuXG4gIHB1YmxpYyBhc3luYyBnZXRUeXBlSW5CdWZmZXIgKFxuICAgIGJ1ZmZlcjogQXRvbVR5cGVzLlRleHRCdWZmZXIsIGNyYW5nZTogQXRvbVR5cGVzLlJhbmdlXG4gICkgIHtcbiAgICBpZiAoISBidWZmZXIuZ2V0VXJpKCkpIHsgdGhyb3cgbmV3IEVycm9yKCdObyBVUkkgZm9yIGJ1ZmZlcicpIH1cbiAgICBjcmFuZ2UgPSBVdGlsLnRhYlNoaWZ0Rm9yUmFuZ2UoYnVmZmVyLCBjcmFuZ2UpXG4gICAgY29uc3Qgcm9vdERpciA9IGF3YWl0IHRoaXMuZ2V0Um9vdERpcihidWZmZXIpXG4gICAgY29uc3QgY2FwcyA9IGF3YWl0IHRoaXMucmVzb2x2ZUNhcHMocm9vdERpcilcbiAgICBjb25zdCBsaW5lcyA9IGF3YWl0IHRoaXMucXVldWVDbWQoJ3R5cGVpbmZvJywgcm9vdERpciwge1xuICAgICAgaW50ZXJhY3RpdmU6IHRydWUsXG4gICAgICBjb21tYW5kOiAndHlwZScsXG4gICAgICB1cmk6IGJ1ZmZlci5nZXRVcmkoKSxcbiAgICAgIHRleHQ6IGJ1ZmZlci5pc01vZGlmaWVkKCkgPyBidWZmZXIuZ2V0VGV4dCgpIDogdW5kZWZpbmVkLFxuICAgICAgZGFzaEFyZ3M6IGNhcHMudHlwZUNvbnN0cmFpbnRzID8gWyctYyddIDogW10sXG4gICAgICBhcmdzOiBbY3JhbmdlLnN0YXJ0LnJvdyArIDEsIGNyYW5nZS5zdGFydC5jb2x1bW4gKyAxXS5tYXAoKHYpID0+IHYudG9TdHJpbmcoKSlcbiAgICB9KVxuXG4gICAgY29uc3QgcnggPSAvXihcXGQrKVxccysoXFxkKylcXHMrKFxcZCspXFxzKyhcXGQrKVxccytcIihbXl0qKVwiJC8gLy8gW15dIGJhc2ljYWxseSBtZWFucyBcImFueXRoaW5nXCIsIGluY2wuIG5ld2xpbmVzXG4gICAgZm9yIChjb25zdCBsaW5lIG9mIGxpbmVzKSB7XG4gICAgICBjb25zdCBtYXRjaCA9IGxpbmUubWF0Y2gocngpXG4gICAgICBpZiAoIW1hdGNoKSB7IGNvbnRpbnVlIH1cbiAgICAgIGNvbnN0IFtyb3dzdGFydCwgY29sc3RhcnQsIHJvd2VuZCwgY29sZW5kLCB0eXBlXSA9IG1hdGNoLnNsaWNlKDEpXG4gICAgICBjb25zdCByYW5nZSA9XG4gICAgICAgIFJhbmdlLmZyb21PYmplY3QoW1xuICAgICAgICAgIFtwYXJzZUludChyb3dzdGFydCwgMTApIC0gMSwgcGFyc2VJbnQoY29sc3RhcnQsIDEwKSAtIDFdLFxuICAgICAgICAgIFtwYXJzZUludChyb3dlbmQsIDEwKSAtIDEsIHBhcnNlSW50KGNvbGVuZCwgMTApIC0gMV1cbiAgICAgICAgXSlcbiAgICAgIGlmIChyYW5nZS5pc0VtcHR5KCkpIHsgY29udGludWUgfVxuICAgICAgaWYgKCFyYW5nZS5jb250YWluc1JhbmdlKGNyYW5nZSkpIHsgY29udGludWUgfVxuICAgICAgcmV0dXJuIHtcbiAgICAgICAgcmFuZ2U6IFV0aWwudGFiVW5zaGlmdEZvclJhbmdlKGJ1ZmZlciwgcmFuZ2UpLFxuICAgICAgICB0eXBlOiB0eXBlLnJlcGxhY2UoL1xcXFxcIi9nLCAnXCInKVxuICAgICAgfVxuICAgIH1cbiAgICB0aHJvdyBuZXcgRXJyb3IoJ05vIHR5cGUnKVxuICB9XG5cbiAgcHVibGljIGFzeW5jIGRvQ2FzZVNwbGl0IChidWZmZXI6IEF0b21UeXBlcy5UZXh0QnVmZmVyLCBjcmFuZ2U6IEF0b21UeXBlcy5SYW5nZSkge1xuICAgIGlmICghIGJ1ZmZlci5nZXRVcmkoKSkgeyB0aHJvdyBuZXcgRXJyb3IoJ05vIFVSSSBmb3IgYnVmZmVyJykgfVxuICAgIGNyYW5nZSA9IFV0aWwudGFiU2hpZnRGb3JSYW5nZShidWZmZXIsIGNyYW5nZSlcbiAgICBjb25zdCByb290RGlyID0gYXdhaXQgdGhpcy5nZXRSb290RGlyKGJ1ZmZlcilcbiAgICBjb25zdCBjYXBzID0gYXdhaXQgdGhpcy5yZXNvbHZlQ2Fwcyhyb290RGlyKVxuICAgIGNvbnN0IGxpbmVzID0gYXdhaXQgdGhpcy5xdWV1ZUNtZCgndHlwZWluZm8nLCByb290RGlyLCB7XG4gICAgICBpbnRlcmFjdGl2ZTogY2Fwcy5pbnRlcmFjdGl2ZUNhc2VTcGxpdCxcbiAgICAgIGNvbW1hbmQ6ICdzcGxpdCcsXG4gICAgICB1cmk6IGJ1ZmZlci5nZXRVcmkoKSxcbiAgICAgIHRleHQ6IGJ1ZmZlci5pc01vZGlmaWVkKCkgPyBidWZmZXIuZ2V0VGV4dCgpIDogdW5kZWZpbmVkLFxuICAgICAgYXJnczogW2NyYW5nZS5zdGFydC5yb3cgKyAxLCBjcmFuZ2Uuc3RhcnQuY29sdW1uICsgMV0ubWFwKCh2KSA9PiB2LnRvU3RyaW5nKCkpXG4gICAgfSlcblxuICAgIGNvbnN0IHJ4ID0gL14oXFxkKylcXHMrKFxcZCspXFxzKyhcXGQrKVxccysoXFxkKylcXHMrXCIoW15dKilcIiQvIC8vIFteXSBiYXNpY2FsbHkgbWVhbnMgXCJhbnl0aGluZ1wiLCBpbmNsLiBuZXdsaW5lc1xuICAgIGNvbnN0IHJlcyA9IFtdXG4gICAgZm9yIChjb25zdCBsaW5lIG9mIGxpbmVzKSB7XG4gICAgICBjb25zdCBtYXRjaCA9IGxpbmUubWF0Y2gocngpXG4gICAgICBpZiAoISBtYXRjaCkge1xuICAgICAgICBVdGlsLndhcm4oYGdoYy1tb2Qgc2F5czogJHtsaW5lfWApXG4gICAgICAgIGNvbnRpbnVlXG4gICAgICB9XG4gICAgICBjb25zdCBbcm93c3RhcnQsIGNvbHN0YXJ0LCByb3dlbmQsIGNvbGVuZCwgdGV4dF0gPSBtYXRjaC5zbGljZSgxKVxuICAgICAgcmVzLnB1c2goe1xuICAgICAgICByYW5nZTpcbiAgICAgICAgUmFuZ2UuZnJvbU9iamVjdChbXG4gICAgICAgICAgW3BhcnNlSW50KHJvd3N0YXJ0LCAxMCkgLSAxLCBwYXJzZUludChjb2xzdGFydCwgMTApIC0gMV0sXG4gICAgICAgICAgW3BhcnNlSW50KHJvd2VuZCwgMTApIC0gMSwgcGFyc2VJbnQoY29sZW5kLCAxMCkgLSAxXVxuICAgICAgICBdKSxcbiAgICAgICAgcmVwbGFjZW1lbnQ6IHRleHRcbiAgICAgIH0pXG4gICAgfVxuICAgIHJldHVybiByZXNcbiAgfVxuXG4gIHB1YmxpYyBhc3luYyBkb1NpZ0ZpbGwgKGJ1ZmZlcjogQXRvbVR5cGVzLlRleHRCdWZmZXIsIGNyYW5nZTogQXRvbVR5cGVzLlJhbmdlKSB7XG4gICAgaWYgKCEgYnVmZmVyLmdldFVyaSgpKSB7IHRocm93IG5ldyBFcnJvcignTm8gVVJJIGZvciBidWZmZXInKSB9XG4gICAgY3JhbmdlID0gVXRpbC50YWJTaGlmdEZvclJhbmdlKGJ1ZmZlciwgY3JhbmdlKVxuICAgIGNvbnN0IHJvb3REaXIgPSBhd2FpdCB0aGlzLmdldFJvb3REaXIoYnVmZmVyKVxuICAgIGNvbnN0IGNhcHMgPSBhd2FpdCB0aGlzLnJlc29sdmVDYXBzKHJvb3REaXIpXG4gICAgY29uc3QgbGluZXMgPSBhd2FpdCB0aGlzLnF1ZXVlQ21kKCd0eXBlaW5mbycsIHJvb3REaXIsIHtcbiAgICAgIGludGVyYWN0aXZlOiBjYXBzLmludGVyYWN0aXZlQ2FzZVNwbGl0LFxuICAgICAgY29tbWFuZDogJ3NpZycsXG4gICAgICB1cmk6IGJ1ZmZlci5nZXRVcmkoKSxcbiAgICAgIHRleHQ6IGJ1ZmZlci5pc01vZGlmaWVkKCkgPyBidWZmZXIuZ2V0VGV4dCgpIDogdW5kZWZpbmVkLFxuICAgICAgYXJnczogW2NyYW5nZS5zdGFydC5yb3cgKyAxLCBjcmFuZ2Uuc3RhcnQuY29sdW1uICsgMV0ubWFwKCh2KSA9PiB2LnRvU3RyaW5nKCkpXG4gICAgfSlcbiAgICBpZiAobGluZXMubGVuZ3RoIDwgMikgeyB0aHJvdyBuZXcgRXJyb3IoYENvdWxkIG5vdCB1bmRlcnN0YW5kIHJlc3BvbnNlOiAke2xpbmVzLmpvaW4oJ1xcbicpfWApIH1cbiAgICBjb25zdCByeCA9IC9eKFxcZCspXFxzKyhcXGQrKVxccysoXFxkKylcXHMrKFxcZCspJC8gLy8gcG9zaXRpb24gcnhcbiAgICBjb25zdCBtYXRjaCA9IGxpbmVzWzFdLm1hdGNoKHJ4KVxuICAgIGlmICghIG1hdGNoKSB7IHRocm93IG5ldyBFcnJvcihgQ291bGQgbm90IHVuZGVyc3RhbmQgcmVzcG9uc2U6ICR7bGluZXMuam9pbignXFxuJyl9YCkgfVxuICAgIGNvbnN0IFtyb3dzdGFydCwgY29sc3RhcnQsIHJvd2VuZCwgY29sZW5kXSA9IG1hdGNoLnNsaWNlKDEpXG4gICAgY29uc3QgcmFuZ2UgPVxuICAgICAgUmFuZ2UuZnJvbU9iamVjdChbXG4gICAgICAgIFtwYXJzZUludChyb3dzdGFydCwgMTApIC0gMSwgcGFyc2VJbnQoY29sc3RhcnQsIDEwKSAtIDFdLFxuICAgICAgICBbcGFyc2VJbnQocm93ZW5kLCAxMCkgLSAxLCBwYXJzZUludChjb2xlbmQsIDEwKSAtIDFdXG4gICAgICBdKVxuICAgIHJldHVybiB7XG4gICAgICB0eXBlOiBsaW5lc1swXSxcbiAgICAgIHJhbmdlLFxuICAgICAgYm9keTogbGluZXMuc2xpY2UoMikuam9pbignXFxuJylcbiAgICB9XG4gIH1cblxuICBwdWJsaWMgYXN5bmMgZ2V0SW5mb0luQnVmZmVyIChlZGl0b3I6IEF0b21UeXBlcy5UZXh0RWRpdG9yLCBjcmFuZ2U6IEF0b21UeXBlcy5SYW5nZSkge1xuICAgIGNvbnN0IGJ1ZmZlciA9IGVkaXRvci5nZXRCdWZmZXIoKVxuICAgIGlmICghYnVmZmVyLmdldFVyaSgpKSB7IHRocm93IG5ldyBFcnJvcignTm8gVVJJIGZvciBidWZmZXInKSB9XG4gICAgY29uc3Qgc3ltSW5mbyA9IFV0aWwuZ2V0U3ltYm9sSW5SYW5nZShlZGl0b3IsIGNyYW5nZSlcbiAgICBpZiAoIXN5bUluZm8pIHsgdGhyb3cgbmV3IEVycm9yKCdDb3VsZG5cXCd0IGdldCBzeW1ib2wgZm9yIGluZm8nKSB9XG4gICAgY29uc3QgeyBzeW1ib2wsIHJhbmdlIH0gPSBzeW1JbmZvXG5cbiAgICBjb25zdCBsaW5lcyA9IGF3YWl0IHRoaXMucXVldWVDbWQoJ3R5cGVpbmZvJywgYXdhaXQgdGhpcy5nZXRSb290RGlyKGJ1ZmZlciksIHtcbiAgICAgIGludGVyYWN0aXZlOiB0cnVlLFxuICAgICAgY29tbWFuZDogJ2luZm8nLFxuICAgICAgdXJpOiBidWZmZXIuZ2V0VXJpKCksXG4gICAgICB0ZXh0OiBidWZmZXIuaXNNb2RpZmllZCgpID8gYnVmZmVyLmdldFRleHQoKSA6IHVuZGVmaW5lZCxcbiAgICAgIGFyZ3M6IFtzeW1ib2xdXG4gICAgfSlcblxuICAgIGNvbnN0IGluZm8gPSBsaW5lcy5qb2luKCdcXG4nKVxuICAgIGlmICgoaW5mbyA9PT0gJ0Nhbm5vdCBzaG93IGluZm8nKSB8fCAhaW5mbykge1xuICAgICAgdGhyb3cgbmV3IEVycm9yKCdObyBpbmZvJylcbiAgICB9IGVsc2Uge1xuICAgICAgcmV0dXJuIHsgcmFuZ2UsIGluZm8gfVxuICAgIH1cbiAgfVxuXG4gIHB1YmxpYyBhc3luYyBmaW5kU3ltYm9sUHJvdmlkZXJzSW5CdWZmZXIgKGVkaXRvcjogQXRvbVR5cGVzLlRleHRFZGl0b3IsIGNyYW5nZTogQXRvbVR5cGVzLlJhbmdlKSB7XG4gICAgY29uc3QgYnVmZmVyID0gZWRpdG9yLmdldEJ1ZmZlcigpXG4gICAgY29uc3Qgc3ltSW5mbyA9IFV0aWwuZ2V0U3ltYm9sSW5SYW5nZShlZGl0b3IsIGNyYW5nZSlcbiAgICBpZiAoIXN5bUluZm8pIHsgdGhyb3cgbmV3IEVycm9yKCdDb3VsZG5cXCd0IGdldCBzeW1ib2wgZm9yIGltcG9ydCcpIH1cbiAgICBjb25zdCB7IHN5bWJvbCB9ID0gc3ltSW5mb1xuXG4gICAgcmV0dXJuIHRoaXMucXVldWVDbWQoJ2ZpbmQnLCBhd2FpdCB0aGlzLmdldFJvb3REaXIoYnVmZmVyKSwge1xuICAgICAgaW50ZXJhY3RpdmU6IHRydWUsXG4gICAgICBjb21tYW5kOiAnZmluZCcsXG4gICAgICBhcmdzOiBbc3ltYm9sXVxuICAgIH0pXG4gIH1cblxuICBwdWJsaWMgYXN5bmMgZG9DaGVja0J1ZmZlciAoYnVmZmVyOiBBdG9tVHlwZXMuVGV4dEJ1ZmZlciwgZmFzdDogYm9vbGVhbiA9IGZhbHNlKSB7XG4gICAgcmV0dXJuIHRoaXMuZG9DaGVja09yTGludEJ1ZmZlcignY2hlY2snLCBidWZmZXIsIGZhc3QpXG4gIH1cblxuICBwdWJsaWMgYXN5bmMgZG9MaW50QnVmZmVyIChidWZmZXI6IEF0b21UeXBlcy5UZXh0QnVmZmVyLCBmYXN0OiBib29sZWFuID0gZmFsc2UpIHtcbiAgICByZXR1cm4gdGhpcy5kb0NoZWNrT3JMaW50QnVmZmVyKCdsaW50JywgYnVmZmVyLCBmYXN0KVxuICB9XG5cbiAgcHVibGljIGFzeW5jIGRvQ2hlY2tBbmRMaW50IChidWZmZXI6IEF0b21UeXBlcy5UZXh0QnVmZmVyLCBmYXN0OiBib29sZWFuKSB7XG4gICAgY29uc3QgW2NyLCBscl0gPSBhd2FpdCBQcm9taXNlLmFsbChbdGhpcy5kb0NoZWNrQnVmZmVyKGJ1ZmZlciwgZmFzdCksIHRoaXMuZG9MaW50QnVmZmVyKGJ1ZmZlciwgZmFzdCldKVxuICAgIHJldHVybiBjci5jb25jYXQobHIpXG4gIH1cblxuICBwcml2YXRlIGFzeW5jIGluaXRCYWNrZW5kIChyb290RGlyOiBBdG9tVHlwZXMuRGlyZWN0b3J5KTogUHJvbWlzZTxHaGNNb2RpUHJvY2Vzc1JlYWw+IHtcbiAgICBjb25zdCByb290UGF0aCA9IHJvb3REaXIuZ2V0UGF0aCgpXG4gICAgY29uc3QgY2FjaGVkID0gdGhpcy5iYWNrZW5kLmdldChyb290UGF0aClcbiAgICBpZiAoY2FjaGVkKSB7IHJldHVybiBhd2FpdCBjYWNoZWQgfVxuICAgIGNvbnN0IG5ld0JhY2tlbmQgPSB0aGlzLmluaXRCYWNrZW5kUmVhbChyb290RGlyKVxuICAgIHRoaXMuYmFja2VuZC5zZXQocm9vdFBhdGgsIG5ld0JhY2tlbmQpXG4gICAgcmV0dXJuIGF3YWl0IG5ld0JhY2tlbmRcbiAgfVxuXG4gIHByaXZhdGUgYXN5bmMgaW5pdEJhY2tlbmRSZWFsIChyb290RGlyOiBBdG9tVHlwZXMuRGlyZWN0b3J5KTogUHJvbWlzZTxHaGNNb2RpUHJvY2Vzc1JlYWw+IHtcbiAgICBsZXQgb3B0cywgdmVycywgY2Fwc1xuICAgIHRyeSB7XG4gICAgICBvcHRzID0gYXdhaXQgVXRpbC5nZXRQcm9jZXNzT3B0aW9ucyhyb290RGlyLmdldFBhdGgoKSlcbiAgICAgIGNvbnN0IHZlcnNQID0gdGhpcy5nZXRWZXJzaW9uKG9wdHMpXG4gICAgICBjb25zdCBib3B0cyA9IG9wdHNcbiAgICAgIHZlcnNQLnRoZW4oKHYpID0+IHsgdGhpcy5jaGVja0NvbXAoYm9wdHMsIHYpIH0pXG4gICAgICB2ZXJzID0gYXdhaXQgdmVyc1BcbiAgICAgIGNhcHMgPSBhd2FpdCB0aGlzLmdldENhcHModmVycylcbiAgICAgIHRoaXMucmVzb2x2ZUNhcHNQcm9taXNlKGNhcHMpXG4gICAgICBjb25zdCBiYWNrZW5kID0gbmV3IEdoY01vZGlQcm9jZXNzUmVhbChhd2FpdCB0aGlzLnJlc29sdmVDYXBzKHJvb3REaXIpLCByb290RGlyLCBvcHRzKVxuICAgICAgdGhpcy5kaXNwb3NhYmxlcy5hZGQoXG4gICAgICAgIGJhY2tlbmQub25FcnJvcigoYXJnKSA9PiB0aGlzLmVtaXR0ZXIuZW1pdCgnZXJyb3InLCBhcmcpKSxcbiAgICAgICAgYmFja2VuZC5vbldhcm5pbmcoKGFyZykgPT4gdGhpcy5lbWl0dGVyLmVtaXQoJ3dhcm5pbmcnLCBhcmcpKVxuICAgICAgKVxuICAgICAgcmV0dXJuIGJhY2tlbmRcbiAgICB9IGNhdGNoIChlcnIpIHtcbiAgICAgIFV0aWwubm90aWZ5U3Bhd25GYWlsKHtkaXI6IHJvb3REaXIuZ2V0UGF0aCgpLCBlcnIsIG9wdHMsIHZlcnMsIGNhcHN9KVxuICAgICAgdGhyb3cgZXJyXG4gICAgfVxuICB9XG5cbiAgcHJpdmF0ZSBjcmVhdGVRdWV1ZXMgKCkge1xuICAgIHRoaXMuY29tbWFuZFF1ZXVlcyA9IHtcbiAgICAgIGNoZWNrbGludDogbmV3IFF1ZXVlKDIpLFxuICAgICAgYnJvd3NlOiBuZXcgUXVldWUoYXRvbS5jb25maWcuZ2V0KCdoYXNrZWxsLWdoYy1tb2QubWF4QnJvd3NlUHJvY2Vzc2VzJykpLFxuICAgICAgdHlwZWluZm86IG5ldyBRdWV1ZSgxKSxcbiAgICAgIGZpbmQ6IG5ldyBRdWV1ZSgxKSxcbiAgICAgIGluaXQ6IG5ldyBRdWV1ZSg0KSxcbiAgICAgIGxpc3Q6IG5ldyBRdWV1ZSgxKSxcbiAgICAgIGxvd21lbTogbmV3IFF1ZXVlKDEpXG4gICAgfVxuICAgIHRoaXMuZGlzcG9zYWJsZXMuYWRkKGF0b20uY29uZmlnLm9uRGlkQ2hhbmdlKCdoYXNrZWxsLWdoYy1tb2QubWF4QnJvd3NlUHJvY2Vzc2VzJywgKHtuZXdWYWx1ZX0pID0+XG4gICAgICB0aGlzLmNvbW1hbmRRdWV1ZXMuYnJvd3NlID0gbmV3IFF1ZXVlKG5ld1ZhbHVlIGFzIG51bWJlcikpXG4gICAgKVxuICB9XG5cbiAgcHJpdmF0ZSBhc3luYyBnZXRWZXJzaW9uIChvcHRzOiBVdGlsLkV4ZWNPcHRzKSB7XG4gICAgY29uc3QgdGltZW91dCA9IGF0b20uY29uZmlnLmdldCgnaGFza2VsbC1naGMtbW9kLmluaXRUaW1lb3V0JykgKiAxMDAwXG4gICAgY29uc3QgY21kID0gYXRvbS5jb25maWcuZ2V0KCdoYXNrZWxsLWdoYy1tb2QuZ2hjTW9kUGF0aCcpXG4gICAgY29uc3Qge3N0ZG91dH0gPSBhd2FpdCBVdGlsLmV4ZWNQcm9taXNlKGNtZCwgWyd2ZXJzaW9uJ10sIHsgdGltZW91dCwgLi4ub3B0cyB9KVxuICAgIGNvbnN0IHZlcnNSYXcgPSAvXmdoYy1tb2QgdmVyc2lvbiAoXFxkKylcXC4oXFxkKylcXC4oXFxkKykoPzpcXC4oXFxkKykpPy8uZXhlYyhzdGRvdXQpXG4gICAgaWYgKCF2ZXJzUmF3KSB7IHRocm93IG5ldyBFcnJvcihcIkNvdWxkbid0IGdldCBnaGMtbW9kIHZlcnNpb25cIikgfVxuICAgIGNvbnN0IHZlcnMgPSB2ZXJzUmF3LnNsaWNlKDEsIDUpLm1hcCgoaSkgPT4gcGFyc2VJbnQoaSwgMTApKVxuICAgIGNvbnN0IGNvbXBSYXcgPSAvR0hDICguKykkLy5leGVjKHN0ZG91dC50cmltKCkpXG4gICAgaWYgKCFjb21wUmF3KSB7IHRocm93IG5ldyBFcnJvcihcIkNvdWxkbid0IGdldCBnaGMgdmVyc2lvblwiKSB9XG4gICAgY29uc3QgY29tcCA9IGNvbXBSYXdbMV1cbiAgICBVdGlsLmRlYnVnKGBHaGMtbW9kICR7dmVyc30gYnVpbHQgd2l0aCAke2NvbXB9YClcbiAgICByZXR1cm4geyB2ZXJzLCBjb21wIH1cbiAgfVxuXG4gIHByaXZhdGUgYXN5bmMgY2hlY2tDb21wIChvcHRzOiBVdGlsLkV4ZWNPcHRzLCB7IGNvbXAgfToge2NvbXA6IHN0cmluZ30pIHtcbiAgICBjb25zdCB0aW1lb3V0ID0gYXRvbS5jb25maWcuZ2V0KCdoYXNrZWxsLWdoYy1tb2QuaW5pdFRpbWVvdXQnKSAqIDEwMDBcbiAgICBjb25zdCB0cnlXYXJuID0gYXN5bmMgKGNtZDogc3RyaW5nLCBhcmdzOiBzdHJpbmdbXSkgPT4ge1xuICAgICAgdHJ5IHtcbiAgICAgICAgcmV0dXJuIChhd2FpdCBVdGlsLmV4ZWNQcm9taXNlKGNtZCwgYXJncywgeyB0aW1lb3V0LCAuLi5vcHRzIH0pKS5zdGRvdXQudHJpbSgpXG4gICAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgICBVdGlsLndhcm4oZXJyb3IpXG4gICAgICB9XG4gICAgfVxuICAgIGNvbnN0IFtzdGFja2doYywgcGF0aGdoY10gPSBhd2FpdCBQcm9taXNlLmFsbChbXG4gICAgICB0cnlXYXJuKCdzdGFjaycsIFsnZ2hjJywgJy0tJywgJy0tbnVtZXJpYy12ZXJzaW9uJ10pLFxuICAgICAgdHJ5V2FybignZ2hjJywgWyctLW51bWVyaWMtdmVyc2lvbiddKSxcbiAgICBdKVxuICAgIFV0aWwuZGVidWcoYFN0YWNrIEdIQyB2ZXJzaW9uICR7c3RhY2tnaGN9YClcbiAgICBVdGlsLmRlYnVnKGBQYXRoIEdIQyB2ZXJzaW9uICR7cGF0aGdoY31gKVxuICAgIGlmIChzdGFja2doYyAmJiAoc3RhY2tnaGMgIT09IGNvbXApKSB7XG4gICAgICBjb25zdCB3YXJuID0gYFxcXG5HSEMgdmVyc2lvbiBpbiB5b3VyIFN0YWNrICcke3N0YWNrZ2hjfScgZG9lc24ndCBtYXRjaCB3aXRoIFxcXG5HSEMgdmVyc2lvbiB1c2VkIHRvIGJ1aWxkIGdoYy1tb2QgJyR7Y29tcH0nLiBUaGlzIGNhbiBsZWFkIHRvIFxcXG5wcm9ibGVtcyB3aGVuIHVzaW5nIFN0YWNrIHByb2plY3RzYFxuICAgICAgYXRvbS5ub3RpZmljYXRpb25zLmFkZFdhcm5pbmcod2FybilcbiAgICAgIFV0aWwud2Fybih3YXJuKVxuICAgIH1cbiAgICBpZiAocGF0aGdoYyAmJiAocGF0aGdoYyAhPT0gY29tcCkpIHtcbiAgICAgIGNvbnN0IHdhcm4gPSBgXFxcbkdIQyB2ZXJzaW9uIGluIHlvdXIgUEFUSCAnJHtwYXRoZ2hjfScgZG9lc24ndCBtYXRjaCB3aXRoIFxcXG5HSEMgdmVyc2lvbiB1c2VkIHRvIGJ1aWxkIGdoYy1tb2QgJyR7Y29tcH0nLiBUaGlzIGNhbiBsZWFkIHRvIFxcXG5wcm9ibGVtcyB3aGVuIHVzaW5nIENhYmFsIG9yIFBsYWluIHByb2plY3RzYFxuICAgICAgYXRvbS5ub3RpZmljYXRpb25zLmFkZFdhcm5pbmcod2FybilcbiAgICAgIFV0aWwud2Fybih3YXJuKVxuICAgIH1cbiAgfVxuXG4gIHByaXZhdGUgYXN5bmMgcmVzb2x2ZUNhcHMgKHJvb3REaXI6IEF0b21UeXBlcy5EaXJlY3RvcnkpOiBQcm9taXNlPEdIQ01vZENhcHM+IHtcbiAgICB0aGlzLmluaXRCYWNrZW5kKHJvb3REaXIpXG4gICAgcmV0dXJuIHRoaXMuY2Fwc1xuICB9XG5cbiAgcHJpdmF0ZSBnZXRDYXBzICh7IHZlcnMgfToge3ZlcnM6IG51bWJlcltdfSk6IEdIQ01vZENhcHMge1xuICAgIGNvbnN0IGNhcHM6IEdIQ01vZENhcHMgPSB7XG4gICAgICB2ZXJzaW9uOiB2ZXJzLFxuICAgICAgZmlsZU1hcDogZmFsc2UsXG4gICAgICBxdW90ZUFyZ3M6IGZhbHNlLFxuICAgICAgb3B0cGFyc2U6IGZhbHNlLFxuICAgICAgdHlwZUNvbnN0cmFpbnRzOiBmYWxzZSxcbiAgICAgIGJyb3dzZVBhcmVudHM6IGZhbHNlLFxuICAgICAgaW50ZXJhY3RpdmVDYXNlU3BsaXQ6IGZhbHNlLFxuICAgICAgaW1wb3J0ZWRGcm9tOiBmYWxzZSxcbiAgICAgIGJyb3dzZU1haW46IGZhbHNlXG4gICAgfVxuXG4gICAgY29uc3QgYXRMZWFzdCA9IChiOiBudW1iZXJbXSkgPT4ge1xuICAgICAgZm9yIChsZXQgaSA9IDA7IGkgPCBiLmxlbmd0aDsgaSsrKSB7XG4gICAgICAgIGNvbnN0IHYgPSBiW2ldXG4gICAgICAgIGlmICh2ZXJzW2ldID4gdikge1xuICAgICAgICAgIHJldHVybiB0cnVlXG4gICAgICAgIH0gZWxzZSBpZiAodmVyc1tpXSA8IHYpIHtcbiAgICAgICAgICByZXR1cm4gZmFsc2VcbiAgICAgICAgfVxuICAgICAgfVxuICAgICAgcmV0dXJuIHRydWVcbiAgICB9XG5cbiAgICBjb25zdCBleGFjdCA9IChiOiBudW1iZXJbXSkgPT4ge1xuICAgICAgZm9yIChsZXQgaSA9IDA7IGkgPCBiLmxlbmd0aDsgaSsrKSB7XG4gICAgICAgIGNvbnN0IHYgPSBiW2ldXG4gICAgICAgIGlmICh2ZXJzW2ldICE9PSB2KSB7XG4gICAgICAgICAgcmV0dXJuIGZhbHNlXG4gICAgICAgIH1cbiAgICAgIH1cbiAgICAgIHJldHVybiB0cnVlXG4gICAgfVxuXG4gICAgaWYgKCFhdExlYXN0KFs1LCA0XSkpIHtcbiAgICAgIGF0b20ubm90aWZpY2F0aW9ucy5hZGRFcnJvcihgXFxcbkhhc2tlbGwtZ2hjLW1vZDogZ2hjLW1vZCA8IDUuNCBpcyBub3Qgc3VwcG9ydGVkLiBcXFxuVXNlIGF0IHlvdXIgb3duIHJpc2sgb3IgdXBkYXRlIHlvdXIgZ2hjLW1vZCBpbnN0YWxsYXRpb25gLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHsgZGlzbWlzc2FibGU6IHRydWUgfSlcbiAgICB9XG4gICAgaWYgKGV4YWN0KFs1LCA0XSkpIHtcbiAgICAgIGF0b20ubm90aWZpY2F0aW9ucy5hZGRXYXJuaW5nKGBcXFxuSGFza2VsbC1naGMtbW9kOiBnaGMtbW9kIDUuNC4qIGlzIGRlcHJlY2F0ZWQuIFxcXG5Vc2UgYXQgeW91ciBvd24gcmlzayBvciB1cGRhdGUgeW91ciBnaGMtbW9kIGluc3RhbGxhdGlvbmAsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICB7IGRpc21pc3NhYmxlOiB0cnVlIH0pXG4gICAgfVxuICAgIGlmIChhdExlYXN0KFs1LCA0XSkpIHtcbiAgICAgIGNhcHMuZmlsZU1hcCA9IHRydWVcbiAgICB9XG4gICAgaWYgKGF0TGVhc3QoWzUsIDVdKSkge1xuICAgICAgY2Fwcy5xdW90ZUFyZ3MgPSB0cnVlXG4gICAgICBjYXBzLm9wdHBhcnNlID0gdHJ1ZVxuICAgIH1cbiAgICBpZiAoYXRMZWFzdChbNSwgNl0pKSB7XG4gICAgICBjYXBzLnR5cGVDb25zdHJhaW50cyA9IHRydWVcbiAgICAgIGNhcHMuYnJvd3NlUGFyZW50cyA9IHRydWVcbiAgICAgIGNhcHMuaW50ZXJhY3RpdmVDYXNlU3BsaXQgPSB0cnVlXG4gICAgfVxuICAgIGlmIChhdG9tLmNvbmZpZy5nZXQoJ2hhc2tlbGwtZ2hjLW1vZC5leHBlcmltZW50YWwnKSkge1xuICAgICAgY2Fwcy5pbXBvcnRlZEZyb20gPSB0cnVlXG4gICAgfVxuICAgIFV0aWwuZGVidWcoSlNPTi5zdHJpbmdpZnkoY2FwcykpXG4gICAgcmV0dXJuIGNhcHNcbiAgfVxuXG4gIHByaXZhdGUgYXN5bmMgZ2V0U2V0dGluZ3MgKHJ1bkRpcjogQXRvbVR5cGVzLkRpcmVjdG9yeSkge1xuICAgIGNvbnN0IHJlYWRTZXR0aW5ncyA9IGFzeW5jIChmaWxlOiBBdG9tVHlwZXMuRmlsZSkgPT4ge1xuICAgICAgdHJ5IHtcbiAgICAgICAgY29uc3QgZXggPSBhd2FpdCBmaWxlLmV4aXN0cygpXG4gICAgICAgIGlmIChleCkge1xuICAgICAgICAgIGNvbnN0IGNvbnRlbnRzID0gYXdhaXQgZmlsZS5yZWFkKClcbiAgICAgICAgICB0cnkge1xuICAgICAgICAgICAgcmV0dXJuIEpTT04ucGFyc2UoY29udGVudHMpXG4gICAgICAgICAgfSBjYXRjaCAoZXJyKSB7XG4gICAgICAgICAgICBhdG9tLm5vdGlmaWNhdGlvbnMuYWRkRXJyb3IoYEZhaWxlZCB0byBwYXJzZSAke2ZpbGUuZ2V0UGF0aCgpfWAsIHtcbiAgICAgICAgICAgICAgZGV0YWlsOiBlcnIsXG4gICAgICAgICAgICAgIGRpc21pc3NhYmxlOiB0cnVlXG4gICAgICAgICAgICB9KVxuICAgICAgICAgICAgdGhyb3cgZXJyXG4gICAgICAgICAgfVxuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIHJldHVybiB7fVxuICAgICAgICB9XG4gICAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgICBpZiAoZXJyb3IpIHsgVXRpbC53YXJuKGVycm9yKSB9XG4gICAgICAgIHJldHVybiB7fVxuICAgICAgfVxuICAgIH1cblxuICAgIGNvbnN0IGxvY2FsU2V0dGluZ3MgPSByZWFkU2V0dGluZ3MocnVuRGlyLmdldEZpbGUoJy5oYXNrZWxsLWdoYy1tb2QuanNvbicpKVxuXG4gICAgY29uc3QgW3Byb2plY3REaXJdID0gYXRvbS5wcm9qZWN0LmdldERpcmVjdG9yaWVzKCkuZmlsdGVyKChkKSA9PiBkLmNvbnRhaW5zKHJ1bkRpci5nZXRQYXRoKCkpKVxuICAgIGNvbnN0IHByb2plY3RTZXR0aW5ncyA9XG4gICAgICBwcm9qZWN0RGlyID9cbiAgICAgICAgcmVhZFNldHRpbmdzKHByb2plY3REaXIuZ2V0RmlsZSgnLmhhc2tlbGwtZ2hjLW1vZC5qc29uJykpXG4gICAgICAgIDpcbiAgICAgICAgUHJvbWlzZS5yZXNvbHZlKHt9KVxuXG4gICAgY29uc3QgY29uZmlnRGlyID0gbmV3IERpcmVjdG9yeShhdG9tLmdldENvbmZpZ0RpclBhdGgoKSlcbiAgICBjb25zdCBnbG9iYWxTZXR0aW5ncyA9IHJlYWRTZXR0aW5ncyhjb25maWdEaXIuZ2V0RmlsZSgnaGFza2VsbC1naGMtbW9kLmpzb24nKSlcblxuICAgIGNvbnN0IFtnbG9iLCBwcmosIGxvY10gPSBhd2FpdCBQcm9taXNlLmFsbChbZ2xvYmFsU2V0dGluZ3MsIHByb2plY3RTZXR0aW5ncywgbG9jYWxTZXR0aW5nc10pXG4gICAgcmV0dXJuIHsgLi4uZ2xvYiwgLi4ucHJqLCAuLi5sb2MgfVxuICB9XG5cbiAgcHJpdmF0ZSBhc3luYyBxdWV1ZUNtZCAoXG4gICAgcXVldWVOYW1lOiBDb21tYW5kcyxcbiAgICBkaXI6IEF0b21UeXBlcy5EaXJlY3RvcnksXG4gICAgcnVuQXJnczoge1xuICAgICAgY29tbWFuZDogc3RyaW5nLCB0ZXh0Pzogc3RyaW5nLCB1cmk/OiBzdHJpbmcsIGludGVyYWN0aXZlPzogYm9vbGVhbixcbiAgICAgIGRhc2hBcmdzPzogc3RyaW5nW10sIGFyZ3M/OiBzdHJpbmdbXVxuICAgIH1cbiAgKTogUHJvbWlzZTxzdHJpbmdbXT4ge1xuICAgIGlmIChhdG9tLmNvbmZpZy5nZXQoJ2hhc2tlbGwtZ2hjLW1vZC5sb3dNZW1vcnlTeXN0ZW0nKSkge1xuICAgICAgcXVldWVOYW1lID0gJ2xvd21lbSdcbiAgICB9XG4gICAgY29uc3QgYmFja2VuZCA9IGF3YWl0IHRoaXMuaW5pdEJhY2tlbmQoZGlyKVxuICAgIGNvbnN0IHByb21pc2UgPSB0aGlzLmNvbW1hbmRRdWV1ZXNbcXVldWVOYW1lXS5hZGQoYXN5bmMgKCkgPT4ge1xuICAgICAgdGhpcy5lbWl0dGVyLmVtaXQoJ2JhY2tlbmQtYWN0aXZlJywgdW5kZWZpbmVkKVxuICAgICAgdHJ5IHtcbiAgICAgICAgY29uc3Qgc2V0dGluZ3MgPSBhd2FpdCB0aGlzLmdldFNldHRpbmdzKGRpcilcbiAgICAgICAgaWYgKHNldHRpbmdzLmRpc2FibGUpIHsgdGhyb3cgbmV3IEVycm9yKCdHaGMtbW9kIGRpc2FibGVkIGluIHNldHRpbmdzJykgfVxuICAgICAgICByZXR1cm4gYmFja2VuZC5ydW4oe1xuICAgICAgICAgIC4uLnJ1bkFyZ3MsXG4gICAgICAgICAgc3VwcHJlc3NFcnJvcnM6IHNldHRpbmdzLnN1cHByZXNzRXJyb3JzLFxuICAgICAgICAgIGdoY09wdGlvbnM6IHNldHRpbmdzLmdoY09wdGlvbnMsXG4gICAgICAgICAgZ2hjTW9kT3B0aW9uczogc2V0dGluZ3MuZ2hjTW9kT3B0aW9ucyxcbiAgICAgICAgfSlcbiAgICAgIH0gY2F0Y2ggKGVycikge1xuICAgICAgICAgIFV0aWwud2FybihlcnIpXG4gICAgICAgICAgdGhyb3cgZXJyXG4gICAgICB9XG4gICAgfSlcbiAgICBwcm9taXNlLnRoZW4oKHJlcykgPT4ge1xuICAgICAgY29uc3QgcWUgPSAocW46IENvbW1hbmRzKSA9PiB7XG4gICAgICAgIGNvbnN0IHEgPSB0aGlzLmNvbW1hbmRRdWV1ZXNbcW5dXG4gICAgICAgIHJldHVybiAocS5nZXRRdWV1ZUxlbmd0aCgpICsgcS5nZXRQZW5kaW5nTGVuZ3RoKCkpID09PSAwXG4gICAgICB9XG4gICAgICBpZiAocWUocXVldWVOYW1lKSkge1xuICAgICAgICB0aGlzLmVtaXR0ZXIuZW1pdCgncXVldWUtaWRsZScsIHsgcXVldWU6IHF1ZXVlTmFtZSB9KVxuICAgICAgICBpZiAoT2JqZWN0LmtleXModGhpcy5jb21tYW5kUXVldWVzKS5ldmVyeShxZSkpIHtcbiAgICAgICAgICB0aGlzLmVtaXR0ZXIuZW1pdCgnYmFja2VuZC1pZGxlJywgdW5kZWZpbmVkKVxuICAgICAgICB9XG4gICAgICB9XG4gICAgfSlcbiAgICByZXR1cm4gcHJvbWlzZVxuICB9XG5cbiAgcHJpdmF0ZSBhc3luYyBkb0NoZWNrT3JMaW50QnVmZmVyIChjbWQ6ICdjaGVjaycgfCAnbGludCcsIGJ1ZmZlcjogQXRvbVR5cGVzLlRleHRCdWZmZXIsIGZhc3Q6IGJvb2xlYW4pIHtcbiAgICBsZXQgZGFzaEFyZ3NcbiAgICBpZiAoYnVmZmVyLmlzRW1wdHkoKSkgeyByZXR1cm4gW10gfVxuICAgIGlmICghIGJ1ZmZlci5nZXRVcmkoKSkgeyByZXR1cm4gW10gfVxuXG4gICAgLy8gQSBkaXJ0eSBoYWNrIHRvIG1ha2UgbGludCB3b3JrIHdpdGggbGhzXG4gICAgbGV0IHVyaSA9IGJ1ZmZlci5nZXRVcmkoKVxuICAgIGNvbnN0IG9sZHVyaSA9IGJ1ZmZlci5nZXRVcmkoKVxuICAgIGxldCB0ZXh0XG4gICAgdHJ5IHtcbiAgICAgIGlmICgoY21kID09PSAnbGludCcpICYmIChleHRuYW1lKHVyaSkgPT09ICcubGhzJykpIHtcbiAgICAgICAgdXJpID0gdXJpLnNsaWNlKDAsIC0xKVxuICAgICAgICB0ZXh0ID0gYXdhaXQgdW5saXQob2xkdXJpLCBidWZmZXIuZ2V0VGV4dCgpKVxuICAgICAgfSBlbHNlIGlmIChidWZmZXIuaXNNb2RpZmllZCgpKSB7XG4gICAgICAgIHRleHQgPSBidWZmZXIuZ2V0VGV4dCgpXG4gICAgICB9XG4gICAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICAgIC8vIFRPRE86IFJlamVjdFxuICAgICAgY29uc3QgbSA9IChlcnJvciBhcyBFcnJvcikubWVzc2FnZS5tYXRjaCgvXiguKj8pOihbMC05XSspOiAqKC4qKSAqJC8pXG4gICAgICBpZiAoIW0pIHsgdGhyb3cgZXJyb3IgfVxuICAgICAgY29uc3QgW3VyaTIsIGxpbmUsIG1lc3NdID0gbS5zbGljZSgxKVxuICAgICAgcmV0dXJuIFt7XG4gICAgICAgIHVyaTogdXJpMixcbiAgICAgICAgcG9zaXRpb246IG5ldyBQb2ludChwYXJzZUludChsaW5lLCAxMCkgLSAxLCAwKSxcbiAgICAgICAgbWVzc2FnZTogbWVzcyxcbiAgICAgICAgc2V2ZXJpdHk6ICdsaW50J1xuICAgICAgfV1cbiAgICB9XG4gICAgLy8gZW5kIG9mIGRpcnR5IGhhY2tcblxuICAgIGlmIChjbWQgPT09ICdsaW50Jykge1xuICAgICAgY29uc3Qgb3B0czogc3RyaW5nW10gPSBhdG9tLmNvbmZpZy5nZXQoJ2hhc2tlbGwtZ2hjLW1vZC5obGludE9wdGlvbnMnKVxuICAgICAgZGFzaEFyZ3MgPSBbXVxuICAgICAgZm9yIChjb25zdCBvcHQgb2Ygb3B0cykge1xuICAgICAgICBkYXNoQXJncy5wdXNoKCctLWhsaW50T3B0Jywgb3B0KVxuICAgICAgfVxuICAgIH1cblxuICAgIGNvbnN0IHJvb3REaXIgPSBhd2FpdCB0aGlzLmdldFJvb3REaXIoYnVmZmVyKVxuXG4gICAgY29uc3QgbGluZXMgPSBhd2FpdCB0aGlzLnF1ZXVlQ21kKCdjaGVja2xpbnQnLCByb290RGlyLCB7XG4gICAgICBpbnRlcmFjdGl2ZTogZmFzdCxcbiAgICAgIGNvbW1hbmQ6IGNtZCxcbiAgICAgIHVyaSxcbiAgICAgIHRleHQsXG4gICAgICBkYXNoQXJnc1xuICAgIH0pXG5cbiAgICBjb25zdCByeCA9IC9eKC4qPyk6KFswLTlcXHNdKyk6KFswLTlcXHNdKyk6ICooPzooV2FybmluZ3xFcnJvcik6ICopPyhbXl0qKS9cbiAgICBjb25zdCByZXMgPSBbXVxuICAgIGZvciAoY29uc3QgbGluZSBvZiBsaW5lcykge1xuICAgICAgY29uc3QgbWF0Y2ggPSBsaW5lLm1hdGNoKHJ4KVxuICAgICAgaWYgKCFtYXRjaCkge1xuICAgICAgICBpZiAobGluZS50cmltKCkubGVuZ3RoKSB7IFV0aWwud2FybihgZ2hjLW1vZCBzYXlzOiAke2xpbmV9YCkgfVxuICAgICAgICBjb250aW51ZVxuICAgICAgfVxuICAgICAgY29uc3QgW2ZpbGUyLCByb3csIGNvbCwgd2FybmluZywgbWVzc2FnZV0gPSBtYXRjaC5zbGljZSgxKVxuICAgICAgaWYgKGZpbGUyID09PSAnRHVtbXknICYmIHJvdyA9PT0gJzAnICYmIGNvbCA9PT0gJzAnKSB7XG4gICAgICAgIGlmICh3YXJuaW5nID09PSAnRXJyb3InKSB7XG4gICAgICAgICAgdGhpcy5lbWl0dGVyLmVtaXQoJ2Vycm9yJywge2VycjogVXRpbC5ta0Vycm9yKCdHSENNb2RTdGRvdXRFcnJvcicsIG1lc3NhZ2UpLCBjYXBzOiBhd2FpdCB0aGlzLmNhcHN9KVxuICAgICAgICAgIGNvbnRpbnVlXG4gICAgICAgIH0gZWxzZSBpZiAod2FybmluZyA9PT0gJ1dhcm5pbmcnKSB7XG4gICAgICAgICAgdGhpcy5lbWl0dGVyLmVtaXQoJ3dhcm5pbmcnLCBtZXNzYWdlKVxuICAgICAgICAgIGNvbnRpbnVlXG4gICAgICAgIH1cbiAgICAgIH1cblxuICAgICAgY29uc3QgZmlsZSA9IHVyaS5lbmRzV2l0aChmaWxlMikgPyBvbGR1cmkgOiBmaWxlMlxuICAgICAgY29uc3Qgc2V2ZXJpdHkgPVxuICAgICAgICBjbWQgPT09ICdsaW50JyA/XG4gICAgICAgICAgJ2xpbnQnXG4gICAgICAgICAgOiB3YXJuaW5nID09PSAnV2FybmluZycgP1xuICAgICAgICAgICAgJ3dhcm5pbmcnXG4gICAgICAgICAgICA6XG4gICAgICAgICAgICAnZXJyb3InXG4gICAgICBjb25zdCBtZXNzUG9zID0gbmV3IFBvaW50KHBhcnNlSW50KHJvdywgMTApIC0gMSwgcGFyc2VJbnQoY29sLCAxMCkgLSAxKVxuICAgICAgY29uc3QgcG9zaXRpb24gPSBVdGlsLnRhYlVuc2hpZnRGb3JQb2ludChidWZmZXIsIG1lc3NQb3MpXG4gICAgICBsZXQgbXl1cmlcbiAgICAgIHRyeSB7XG4gICAgICAgIG15dXJpID0gcm9vdERpci5nZXRGaWxlKHJvb3REaXIucmVsYXRpdml6ZShmaWxlKSkuZ2V0UGF0aCgpXG4gICAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgICBteXVyaSA9IGZpbGVcbiAgICAgIH1cbiAgICAgIHJlcy5wdXNoKHtcbiAgICAgICAgdXJpOiBteXVyaSxcbiAgICAgICAgcG9zaXRpb24sXG4gICAgICAgIG1lc3NhZ2UsXG4gICAgICAgIHNldmVyaXR5XG4gICAgICB9KVxuICAgIH1cbiAgICByZXR1cm4gcmVzXG4gIH1cbn1cbiJdfQ==