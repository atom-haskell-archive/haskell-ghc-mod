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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaW5kZXguanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi9zcmMvZ2hjLW1vZC9pbmRleC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOzs7Ozs7Ozs7O0FBQUEsK0JBQTRFO0FBQzVFLGdDQUErQjtBQUMvQiwrQkFBOEI7QUFDOUIsdUNBQXVDO0FBQ3ZDLDJEQUEwQztBQUUxQyxtRUFBaUg7QUFhakg7SUFnQkU7UUFDRSxJQUFJLENBQUMsV0FBVyxHQUFHLElBQUksMEJBQW1CLEVBQUUsQ0FBQTtRQUM1QyxJQUFJLENBQUMsT0FBTyxHQUFHLElBQUksY0FBTyxFQUFFLENBQUE7UUFDNUIsSUFBSSxDQUFDLFdBQVcsQ0FBQyxHQUFHLENBQUMsSUFBSSxDQUFDLE9BQU8sQ0FBQyxDQUFBO1FBQ2xDLElBQUksQ0FBQyxZQUFZLEdBQUcsSUFBSSxPQUFPLEVBQUUsQ0FBQTtRQUNqQyxJQUFJLENBQUMsT0FBTyxHQUFHLElBQUksR0FBRyxFQUFFLENBQUE7UUFDeEIsSUFBSSxDQUFDLElBQUksR0FBRyxJQUFJLE9BQU8sQ0FBQyxDQUFDLE9BQU8sS0FBSyxJQUFJLENBQUMsa0JBQWtCLEdBQUcsT0FBTyxDQUFDLENBQUE7UUFFdkUsRUFBRSxDQUFDLENBQUMsT0FBTyxDQUFDLEdBQUcsQ0FBQyxnQkFBZ0IsSUFBSSxDQUFDLElBQUksQ0FBQyxNQUFNLENBQUMsR0FBRyxDQUFDLCtDQUErQyxDQUFDLENBQUMsQ0FBQyxDQUFDO1lBQ3RHLElBQUksQ0FBQyxrQkFBa0IsRUFBRSxDQUFBO1FBQzNCLENBQUM7UUFFRCxJQUFJLENBQUMsWUFBWSxFQUFFLENBQUE7SUFDckIsQ0FBQztJQUVZLFVBQVUsQ0FBRSxNQUE0Qjs7WUFDbkQsSUFBSSxHQUFHLENBQUE7WUFDUCxHQUFHLEdBQUcsSUFBSSxDQUFDLFlBQVksQ0FBQyxHQUFHLENBQUMsTUFBTSxDQUFDLENBQUE7WUFDbkMsRUFBRSxDQUFDLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQztnQkFDUixN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Z0JBQUMsS0FBSyxDQUFDLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQztvQkFDZixLQUFLLEdBQUcsSUFBSSxDQUFBO2dCQUNkLENBQUM7Z0JBQ0QsR0FBRyxDQUFDLElBQUksQ0FBQztvQkFDUCxHQUFHLEVBQUUsS0FBSztvQkFDVixRQUFRO29CQUNSLE9BQU87b0JBQ1AsUUFBUTtpQkFDVCxDQUFDLENBQUE7WUFDSixDQUFDO1lBQ0QsTUFBTSxDQUFDLEdBQUcsQ0FBQTtRQUNaLENBQUM7S0FBQTtDQUNGO0FBeG1CRCx3Q0F3bUJDIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IHsgUmFuZ2UsIFBvaW50LCBFbWl0dGVyLCBDb21wb3NpdGVEaXNwb3NhYmxlLCBEaXJlY3RvcnkgfSBmcm9tICdhdG9tJ1xuaW1wb3J0ICogYXMgVXRpbCBmcm9tICcuLi91dGlsJ1xuaW1wb3J0IHsgZXh0bmFtZSB9IGZyb20gJ3BhdGgnXG5pbXBvcnQgUXVldWUgPSByZXF1aXJlKCdwcm9taXNlLXF1ZXVlJylcbmltcG9ydCB7IHVubGl0IH0gZnJvbSAnYXRvbS1oYXNrZWxsLXV0aWxzJ1xuXG5pbXBvcnQgeyBHaGNNb2RpUHJvY2Vzc1JlYWwsIEdIQ01vZENhcHMsIFJ1bkFyZ3MsIFJ1bk9wdGlvbnMsIElFcnJvckNhbGxiYWNrQXJncyB9IGZyb20gJy4vZ2hjLW1vZGktcHJvY2Vzcy1yZWFsJ1xuXG5leHBvcnQge0lFcnJvckNhbGxiYWNrQXJncywgUnVuQXJncywgR0hDTW9kQ2Fwc31cblxudHlwZSBDb21tYW5kcyA9ICdjaGVja2xpbnQnIHwgJ2Jyb3dzZScgfCAndHlwZWluZm8nIHwgJ2ZpbmQnIHwgJ2luaXQnIHwgJ2xpc3QnIHwgJ2xvd21lbSdcblxuZXhwb3J0IGludGVyZmFjZSBTeW1ib2xEZXNjIHtcbiAgbmFtZTogc3RyaW5nLFxuICBzeW1ib2xUeXBlOiBVUEkuQ29tcGxldGlvbkJhY2tlbmQuU3ltYm9sVHlwZSxcbiAgdHlwZVNpZ25hdHVyZT86IHN0cmluZyxcbiAgcGFyZW50Pzogc3RyaW5nXG59XG5cbmV4cG9ydCBjbGFzcyBHaGNNb2RpUHJvY2VzcyB7XG4gIHByaXZhdGUgYmFja2VuZDogTWFwPHN0cmluZywgUHJvbWlzZTxHaGNNb2RpUHJvY2Vzc1JlYWw+PlxuICBwcml2YXRlIGRpc3Bvc2FibGVzOiBDb21wb3NpdGVEaXNwb3NhYmxlXG4gIHByaXZhdGUgZW1pdHRlcjogTXlFbWl0dGVyPHtcbiAgICAnZGlkLWRlc3Ryb3knOiB1bmRlZmluZWRcbiAgICAnd2FybmluZyc6IHN0cmluZ1xuICAgICdlcnJvcic6IElFcnJvckNhbGxiYWNrQXJnc1xuICAgICdiYWNrZW5kLWFjdGl2ZSc6IHZvaWRcbiAgICAnYmFja2VuZC1pZGxlJzogdm9pZFxuICAgICdxdWV1ZS1pZGxlJzogeyBxdWV1ZTogQ29tbWFuZHMgfVxuICB9PlxuICBwcml2YXRlIGJ1ZmZlckRpck1hcDogV2Vha01hcDxBdG9tVHlwZXMuVGV4dEJ1ZmZlciwgQXRvbVR5cGVzLkRpcmVjdG9yeT5cbiAgcHJpdmF0ZSBjb21tYW5kUXVldWVzOiB7W0sgaW4gQ29tbWFuZHNdOiBRdWV1ZX1cbiAgcHJpdmF0ZSBjYXBzOiBQcm9taXNlPEdIQ01vZENhcHM+XG4gIHByaXZhdGUgcmVzb2x2ZUNhcHNQcm9taXNlOiAodmFsOiBHSENNb2RDYXBzKSA9PiB2b2lkXG5cbiAgY29uc3RydWN0b3IgKCkge1xuICAgIHRoaXMuZGlzcG9zYWJsZXMgPSBuZXcgQ29tcG9zaXRlRGlzcG9zYWJsZSgpXG4gICAgdGhpcy5lbWl0dGVyID0gbmV3IEVtaXR0ZXIoKVxuICAgIHRoaXMuZGlzcG9zYWJsZXMuYWRkKHRoaXMuZW1pdHRlcilcbiAgICB0aGlzLmJ1ZmZlckRpck1hcCA9IG5ldyBXZWFrTWFwKClcbiAgICB0aGlzLmJhY2tlbmQgPSBuZXcgTWFwKClcbiAgICB0aGlzLmNhcHMgPSBuZXcgUHJvbWlzZSgocmVzb2x2ZSkgPT4gdGhpcy5yZXNvbHZlQ2Fwc1Byb21pc2UgPSByZXNvbHZlKVxuXG4gICAgaWYgKHByb2Nlc3MuZW52LkdIQ19QQUNLQUdFX1BBVEggJiYgIWF0b20uY29uZmlnLmdldCgnaGFza2VsbC1naGMtbW9kLnN1cHByZXNzR2hjUGFja2FnZVBhdGhXYXJuaW5nJykpIHtcbiAgICAgIFV0aWwud2FybkdIQ1BhY2thZ2VQYXRoKClcbiAgICB9XG5cbiAgICB0aGlzLmNyZWF0ZVF1ZXVlcygpXG4gIH1cblxuICBwdWJsaWMgYXN5bmMgZ2V0Um9vdERpciAoYnVmZmVyOiBBdG9tVHlwZXMuVGV4dEJ1ZmZlcik6IFByb21pc2U8QXRvbVR5cGVzLkRpcmVjdG9yeT4ge1xuICAgIGxldCBkaXJcbiAgICBkaXIgPSB0aGlzLmJ1ZmZlckRpck1hcC5nZXQoYnVmZmVyKVxuICAgIGlmIChkaXIpIHtcbiAgICAgIHJldHVybiBkaXJcbiAgICB9XG4gICAgZGlyID0gYXdhaXQgVXRpbC5nZXRSb290RGlyKGJ1ZmZlcilcbiAgICB0aGlzLmJ1ZmZlckRpck1hcC5zZXQoYnVmZmVyLCBkaXIpXG4gICAgcmV0dXJuIGRpclxuICB9XG5cbiAgcHVibGljIGtpbGxQcm9jZXNzICgpIHtcbiAgICBmb3IgKGNvbnN0IGJwIG9mIHRoaXMuYmFja2VuZC52YWx1ZXMoKSkge1xuICAgICAgYnAudGhlbigoYikgPT4gYi5raWxsUHJvY2VzcygpKVxuICAgIH1cbiAgICB0aGlzLmJhY2tlbmQuY2xlYXIoKVxuICB9XG5cbiAgcHVibGljIGRlc3Ryb3kgKCkge1xuICAgIGZvciAoY29uc3QgYnAgb2YgdGhpcy5iYWNrZW5kLnZhbHVlcygpKSB7XG4gICAgICBicC50aGVuKChiKSA9PiBiLmRlc3Ryb3koKSlcbiAgICB9XG4gICAgdGhpcy5iYWNrZW5kLmNsZWFyKClcbiAgICB0aGlzLmVtaXR0ZXIuZW1pdCgnZGlkLWRlc3Ryb3knLCB1bmRlZmluZWQpXG4gICAgdGhpcy5kaXNwb3NhYmxlcy5kaXNwb3NlKClcbiAgfVxuXG4gIHB1YmxpYyBvbkRpZERlc3Ryb3kgKGNhbGxiYWNrOiAoKSA9PiB2b2lkKSB7XG4gICAgcmV0dXJuIHRoaXMuZW1pdHRlci5vbignZGlkLWRlc3Ryb3knLCBjYWxsYmFjaylcbiAgfVxuXG4gIHB1YmxpYyBvbldhcm5pbmcgKGNhbGxiYWNrOiAod2FybmluZzogc3RyaW5nKSA9PiB2b2lkKSB7XG4gICAgcmV0dXJuIHRoaXMuZW1pdHRlci5vbignd2FybmluZycsIGNhbGxiYWNrKVxuICB9XG5cbiAgcHVibGljIG9uRXJyb3IgKGNhbGxiYWNrOiAoZXJyb3I6IElFcnJvckNhbGxiYWNrQXJncykgPT4gdm9pZCkge1xuICAgIHJldHVybiB0aGlzLmVtaXR0ZXIub24oJ2Vycm9yJywgY2FsbGJhY2spXG4gIH1cblxuICBwdWJsaWMgb25CYWNrZW5kQWN0aXZlIChjYWxsYmFjazogKCkgPT4gdm9pZCkge1xuICAgIHJldHVybiB0aGlzLmVtaXR0ZXIub24oJ2JhY2tlbmQtYWN0aXZlJywgY2FsbGJhY2spXG4gIH1cblxuICBwdWJsaWMgb25CYWNrZW5kSWRsZSAoY2FsbGJhY2s6ICgpID0+IHZvaWQpIHtcbiAgICByZXR1cm4gdGhpcy5lbWl0dGVyLm9uKCdiYWNrZW5kLWlkbGUnLCBjYWxsYmFjaylcbiAgfVxuXG4gIHB1YmxpYyBvblF1ZXVlSWRsZSAoY2FsbGJhY2s6ICgpID0+IHZvaWQpIHtcbiAgICByZXR1cm4gdGhpcy5lbWl0dGVyLm9uKCdxdWV1ZS1pZGxlJywgY2FsbGJhY2spXG4gIH1cblxuICBwdWJsaWMgYXN5bmMgcnVuTGlzdCAoYnVmZmVyOiBBdG9tVHlwZXMuVGV4dEJ1ZmZlcikge1xuICAgIHJldHVybiB0aGlzLnF1ZXVlQ21kKCdsaXN0JywgYXdhaXQgdGhpcy5nZXRSb290RGlyKGJ1ZmZlciksIHsgY29tbWFuZDogJ2xpc3QnIH0pXG4gIH1cblxuICBwdWJsaWMgYXN5bmMgcnVuTGFuZyAoZGlyOiBBdG9tVHlwZXMuRGlyZWN0b3J5KSB7XG4gICAgcmV0dXJuIHRoaXMucXVldWVDbWQoJ2luaXQnLCBkaXIsIHsgY29tbWFuZDogJ2xhbmcnIH0pXG4gIH1cblxuICBwdWJsaWMgYXN5bmMgcnVuRmxhZyAoZGlyOiBBdG9tVHlwZXMuRGlyZWN0b3J5KSB7XG4gICAgcmV0dXJuIHRoaXMucXVldWVDbWQoJ2luaXQnLCBkaXIsIHsgY29tbWFuZDogJ2ZsYWcnIH0pXG4gIH1cblxuICBwdWJsaWMgYXN5bmMgcnVuQnJvd3NlIChyb290RGlyOiBBdG9tVHlwZXMuRGlyZWN0b3J5LCBtb2R1bGVzOiBzdHJpbmdbXSk6IFByb21pc2U8U3ltYm9sRGVzY1tdPiB7XG4gICAgY29uc3QgY2FwcyA9IGF3YWl0IHRoaXMucmVzb2x2ZUNhcHMocm9vdERpcilcbiAgICBpZiAoY2Fwcy5icm93c2VNYWluID09PSBmYWxzZSkge1xuICAgICAgbW9kdWxlcyA9IG1vZHVsZXMuZmlsdGVyKCh2KSA9PiB2ICE9PSAnTWFpbicpXG4gICAgfVxuICAgIGlmIChtb2R1bGVzLmxlbmd0aCA9PT0gMCkgeyByZXR1cm4gW10gfVxuICAgIGNvbnN0IGxpbmVzID0gYXdhaXQgdGhpcy5xdWV1ZUNtZCgnYnJvd3NlJywgcm9vdERpciwge1xuICAgICAgY29tbWFuZDogJ2Jyb3dzZScsXG4gICAgICBkYXNoQXJnczogY2Fwcy5icm93c2VQYXJlbnRzID8gWyctZCcsICctbycsICctcCddIDogWyctZCcsICctbyddLFxuICAgICAgYXJnczogbW9kdWxlc1xuICAgIH0pXG4gICAgcmV0dXJuIGxpbmVzLm1hcCgocykgPT4ge1xuICAgICAgLy8gZW51bUZyb20gOjogRW51bSBhID0+IGEgLT4gW2FdIC0tIGZyb206RW51bVxuICAgICAgY29uc3QgcGF0dGVybiA9IGNhcHMuYnJvd3NlUGFyZW50cyA/IC9eKC4qPykgOjogKC4qPykoPzogLS0gZnJvbTooLiopKT8kLyA6IC9eKC4qPykgOjogKC4qKSQvXG4gICAgICBjb25zdCBtYXRjaCA9IHMubWF0Y2gocGF0dGVybilcbiAgICAgIGxldCBuYW1lLCB0eXBlU2lnbmF0dXJlLCBwYXJlbnRcbiAgICAgIGlmIChtYXRjaCkge1xuICAgICAgICBuYW1lID0gbWF0Y2hbMV1cbiAgICAgICAgdHlwZVNpZ25hdHVyZSA9IG1hdGNoWzJdXG4gICAgICAgIHBhcmVudCA9IG1hdGNoWzNdXG4gICAgICB9IGVsc2Uge1xuICAgICAgICBuYW1lID0gc1xuICAgICAgfVxuICAgICAgbGV0IHN5bWJvbFR5cGU6IFVQSS5Db21wbGV0aW9uQmFja2VuZC5TeW1ib2xUeXBlXG4gICAgICBpZiAodHlwZVNpZ25hdHVyZSAmJiAvXig/OnR5cGV8ZGF0YXxuZXd0eXBlKS8udGVzdCh0eXBlU2lnbmF0dXJlKSkge1xuICAgICAgICBzeW1ib2xUeXBlID0gJ3R5cGUnXG4gICAgICB9IGVsc2UgaWYgKHR5cGVTaWduYXR1cmUgJiYgL14oPzpjbGFzcykvLnRlc3QodHlwZVNpZ25hdHVyZSkpIHtcbiAgICAgICAgc3ltYm9sVHlwZSA9ICdjbGFzcydcbiAgICAgIH0gZWxzZSBpZiAoL15cXCguKlxcKSQvLnRlc3QobmFtZSkpIHtcbiAgICAgICAgc3ltYm9sVHlwZSA9ICdvcGVyYXRvcidcbiAgICAgIH0gZWxzZSBpZiAoVXRpbC5pc1VwcGVyQ2FzZShuYW1lWzBdKSkge1xuICAgICAgICBzeW1ib2xUeXBlID0gJ3RhZydcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHN5bWJvbFR5cGUgPSAnZnVuY3Rpb24nXG4gICAgICB9XG4gICAgICByZXR1cm4geyBuYW1lLCB0eXBlU2lnbmF0dXJlLCBzeW1ib2xUeXBlLCBwYXJlbnQgfVxuICAgIH0pXG4gIH1cblxuICBwdWJsaWMgYXN5bmMgZ2V0VHlwZUluQnVmZmVyIChcbiAgICBidWZmZXI6IEF0b21UeXBlcy5UZXh0QnVmZmVyLCBjcmFuZ2U6IEF0b21UeXBlcy5SYW5nZVxuICApICB7XG4gICAgaWYgKCEgYnVmZmVyLmdldFVyaSgpKSB7IHRocm93IG5ldyBFcnJvcignTm8gVVJJIGZvciBidWZmZXInKSB9XG4gICAgY3JhbmdlID0gVXRpbC50YWJTaGlmdEZvclJhbmdlKGJ1ZmZlciwgY3JhbmdlKVxuICAgIGNvbnN0IHJvb3REaXIgPSBhd2FpdCB0aGlzLmdldFJvb3REaXIoYnVmZmVyKVxuICAgIGNvbnN0IGNhcHMgPSBhd2FpdCB0aGlzLnJlc29sdmVDYXBzKHJvb3REaXIpXG4gICAgY29uc3QgbGluZXMgPSBhd2FpdCB0aGlzLnF1ZXVlQ21kKCd0eXBlaW5mbycsIHJvb3REaXIsIHtcbiAgICAgIGludGVyYWN0aXZlOiB0cnVlLFxuICAgICAgY29tbWFuZDogJ3R5cGUnLFxuICAgICAgdXJpOiBidWZmZXIuZ2V0VXJpKCksXG4gICAgICB0ZXh0OiBidWZmZXIuaXNNb2RpZmllZCgpID8gYnVmZmVyLmdldFRleHQoKSA6IHVuZGVmaW5lZCxcbiAgICAgIGRhc2hBcmdzOiBjYXBzLnR5cGVDb25zdHJhaW50cyA/IFsnLWMnXSA6IFtdLFxuICAgICAgYXJnczogW2NyYW5nZS5zdGFydC5yb3cgKyAxLCBjcmFuZ2Uuc3RhcnQuY29sdW1uICsgMV0ubWFwKCh2KSA9PiB2LnRvU3RyaW5nKCkpXG4gICAgfSlcblxuICAgIGNvbnN0IHJ4ID0gL14oXFxkKylcXHMrKFxcZCspXFxzKyhcXGQrKVxccysoXFxkKylcXHMrXCIoW15dKilcIiQvIC8vIFteXSBiYXNpY2FsbHkgbWVhbnMgXCJhbnl0aGluZ1wiLCBpbmNsLiBuZXdsaW5lc1xuICAgIGZvciAoY29uc3QgbGluZSBvZiBsaW5lcykge1xuICAgICAgY29uc3QgbWF0Y2ggPSBsaW5lLm1hdGNoKHJ4KVxuICAgICAgaWYgKCFtYXRjaCkgeyBjb250aW51ZSB9XG4gICAgICBjb25zdCBbcm93c3RhcnQsIGNvbHN0YXJ0LCByb3dlbmQsIGNvbGVuZCwgdHlwZV0gPSBtYXRjaC5zbGljZSgxKVxuICAgICAgY29uc3QgcmFuZ2UgPVxuICAgICAgICBSYW5nZS5mcm9tT2JqZWN0KFtcbiAgICAgICAgICBbcGFyc2VJbnQocm93c3RhcnQsIDEwKSAtIDEsIHBhcnNlSW50KGNvbHN0YXJ0LCAxMCkgLSAxXSxcbiAgICAgICAgICBbcGFyc2VJbnQocm93ZW5kLCAxMCkgLSAxLCBwYXJzZUludChjb2xlbmQsIDEwKSAtIDFdXG4gICAgICAgIF0pXG4gICAgICBpZiAocmFuZ2UuaXNFbXB0eSgpKSB7IGNvbnRpbnVlIH1cbiAgICAgIGlmICghcmFuZ2UuY29udGFpbnNSYW5nZShjcmFuZ2UpKSB7IGNvbnRpbnVlIH1cbiAgICAgIHJldHVybiB7XG4gICAgICAgIHJhbmdlOiBVdGlsLnRhYlVuc2hpZnRGb3JSYW5nZShidWZmZXIsIHJhbmdlKSxcbiAgICAgICAgdHlwZTogdHlwZS5yZXBsYWNlKC9cXFxcXCIvZywgJ1wiJylcbiAgICAgIH1cbiAgICB9XG4gICAgdGhyb3cgbmV3IEVycm9yKCdObyB0eXBlJylcbiAgfVxuXG4gIHB1YmxpYyBhc3luYyBkb0Nhc2VTcGxpdCAoYnVmZmVyOiBBdG9tVHlwZXMuVGV4dEJ1ZmZlciwgY3JhbmdlOiBBdG9tVHlwZXMuUmFuZ2UpIHtcbiAgICBpZiAoISBidWZmZXIuZ2V0VXJpKCkpIHsgdGhyb3cgbmV3IEVycm9yKCdObyBVUkkgZm9yIGJ1ZmZlcicpIH1cbiAgICBjcmFuZ2UgPSBVdGlsLnRhYlNoaWZ0Rm9yUmFuZ2UoYnVmZmVyLCBjcmFuZ2UpXG4gICAgY29uc3Qgcm9vdERpciA9IGF3YWl0IHRoaXMuZ2V0Um9vdERpcihidWZmZXIpXG4gICAgY29uc3QgY2FwcyA9IGF3YWl0IHRoaXMucmVzb2x2ZUNhcHMocm9vdERpcilcbiAgICBjb25zdCBsaW5lcyA9IGF3YWl0IHRoaXMucXVldWVDbWQoJ3R5cGVpbmZvJywgcm9vdERpciwge1xuICAgICAgaW50ZXJhY3RpdmU6IGNhcHMuaW50ZXJhY3RpdmVDYXNlU3BsaXQsXG4gICAgICBjb21tYW5kOiAnc3BsaXQnLFxuICAgICAgdXJpOiBidWZmZXIuZ2V0VXJpKCksXG4gICAgICB0ZXh0OiBidWZmZXIuaXNNb2RpZmllZCgpID8gYnVmZmVyLmdldFRleHQoKSA6IHVuZGVmaW5lZCxcbiAgICAgIGFyZ3M6IFtjcmFuZ2Uuc3RhcnQucm93ICsgMSwgY3JhbmdlLnN0YXJ0LmNvbHVtbiArIDFdLm1hcCgodikgPT4gdi50b1N0cmluZygpKVxuICAgIH0pXG5cbiAgICBjb25zdCByeCA9IC9eKFxcZCspXFxzKyhcXGQrKVxccysoXFxkKylcXHMrKFxcZCspXFxzK1wiKFteXSopXCIkLyAvLyBbXl0gYmFzaWNhbGx5IG1lYW5zIFwiYW55dGhpbmdcIiwgaW5jbC4gbmV3bGluZXNcbiAgICBjb25zdCByZXMgPSBbXVxuICAgIGZvciAoY29uc3QgbGluZSBvZiBsaW5lcykge1xuICAgICAgY29uc3QgbWF0Y2ggPSBsaW5lLm1hdGNoKHJ4KVxuICAgICAgaWYgKCEgbWF0Y2gpIHtcbiAgICAgICAgVXRpbC53YXJuKGBnaGMtbW9kIHNheXM6ICR7bGluZX1gKVxuICAgICAgICBjb250aW51ZVxuICAgICAgfVxuICAgICAgY29uc3QgW3Jvd3N0YXJ0LCBjb2xzdGFydCwgcm93ZW5kLCBjb2xlbmQsIHRleHRdID0gbWF0Y2guc2xpY2UoMSlcbiAgICAgIHJlcy5wdXNoKHtcbiAgICAgICAgcmFuZ2U6XG4gICAgICAgIFJhbmdlLmZyb21PYmplY3QoW1xuICAgICAgICAgIFtwYXJzZUludChyb3dzdGFydCwgMTApIC0gMSwgcGFyc2VJbnQoY29sc3RhcnQsIDEwKSAtIDFdLFxuICAgICAgICAgIFtwYXJzZUludChyb3dlbmQsIDEwKSAtIDEsIHBhcnNlSW50KGNvbGVuZCwgMTApIC0gMV1cbiAgICAgICAgXSksXG4gICAgICAgIHJlcGxhY2VtZW50OiB0ZXh0XG4gICAgICB9KVxuICAgIH1cbiAgICByZXR1cm4gcmVzXG4gIH1cblxuICBwdWJsaWMgYXN5bmMgZG9TaWdGaWxsIChidWZmZXI6IEF0b21UeXBlcy5UZXh0QnVmZmVyLCBjcmFuZ2U6IEF0b21UeXBlcy5SYW5nZSkge1xuICAgIGlmICghIGJ1ZmZlci5nZXRVcmkoKSkgeyB0aHJvdyBuZXcgRXJyb3IoJ05vIFVSSSBmb3IgYnVmZmVyJykgfVxuICAgIGNyYW5nZSA9IFV0aWwudGFiU2hpZnRGb3JSYW5nZShidWZmZXIsIGNyYW5nZSlcbiAgICBjb25zdCByb290RGlyID0gYXdhaXQgdGhpcy5nZXRSb290RGlyKGJ1ZmZlcilcbiAgICBjb25zdCBjYXBzID0gYXdhaXQgdGhpcy5yZXNvbHZlQ2Fwcyhyb290RGlyKVxuICAgIGNvbnN0IGxpbmVzID0gYXdhaXQgdGhpcy5xdWV1ZUNtZCgndHlwZWluZm8nLCByb290RGlyLCB7XG4gICAgICBpbnRlcmFjdGl2ZTogY2Fwcy5pbnRlcmFjdGl2ZUNhc2VTcGxpdCxcbiAgICAgIGNvbW1hbmQ6ICdzaWcnLFxuICAgICAgdXJpOiBidWZmZXIuZ2V0VXJpKCksXG4gICAgICB0ZXh0OiBidWZmZXIuaXNNb2RpZmllZCgpID8gYnVmZmVyLmdldFRleHQoKSA6IHVuZGVmaW5lZCxcbiAgICAgIGFyZ3M6IFtjcmFuZ2Uuc3RhcnQucm93ICsgMSwgY3JhbmdlLnN0YXJ0LmNvbHVtbiArIDFdLm1hcCgodikgPT4gdi50b1N0cmluZygpKVxuICAgIH0pXG4gICAgaWYgKGxpbmVzLmxlbmd0aCA8IDIpIHsgdGhyb3cgbmV3IEVycm9yKGBDb3VsZCBub3QgdW5kZXJzdGFuZCByZXNwb25zZTogJHtsaW5lcy5qb2luKCdcXG4nKX1gKSB9XG4gICAgY29uc3QgcnggPSAvXihcXGQrKVxccysoXFxkKylcXHMrKFxcZCspXFxzKyhcXGQrKSQvIC8vIHBvc2l0aW9uIHJ4XG4gICAgY29uc3QgbWF0Y2ggPSBsaW5lc1sxXS5tYXRjaChyeClcbiAgICBpZiAoISBtYXRjaCkgeyB0aHJvdyBuZXcgRXJyb3IoYENvdWxkIG5vdCB1bmRlcnN0YW5kIHJlc3BvbnNlOiAke2xpbmVzLmpvaW4oJ1xcbicpfWApIH1cbiAgICBjb25zdCBbcm93c3RhcnQsIGNvbHN0YXJ0LCByb3dlbmQsIGNvbGVuZF0gPSBtYXRjaC5zbGljZSgxKVxuICAgIGNvbnN0IHJhbmdlID1cbiAgICAgIFJhbmdlLmZyb21PYmplY3QoW1xuICAgICAgICBbcGFyc2VJbnQocm93c3RhcnQsIDEwKSAtIDEsIHBhcnNlSW50KGNvbHN0YXJ0LCAxMCkgLSAxXSxcbiAgICAgICAgW3BhcnNlSW50KHJvd2VuZCwgMTApIC0gMSwgcGFyc2VJbnQoY29sZW5kLCAxMCkgLSAxXVxuICAgICAgXSlcbiAgICByZXR1cm4ge1xuICAgICAgdHlwZTogbGluZXNbMF0sXG4gICAgICByYW5nZSxcbiAgICAgIGJvZHk6IGxpbmVzLnNsaWNlKDIpLmpvaW4oJ1xcbicpXG4gICAgfVxuICB9XG5cbiAgcHVibGljIGFzeW5jIGdldEluZm9JbkJ1ZmZlciAoZWRpdG9yOiBBdG9tVHlwZXMuVGV4dEVkaXRvciwgY3JhbmdlOiBBdG9tVHlwZXMuUmFuZ2UpIHtcbiAgICBjb25zdCBidWZmZXIgPSBlZGl0b3IuZ2V0QnVmZmVyKClcbiAgICBpZiAoIWJ1ZmZlci5nZXRVcmkoKSkgeyB0aHJvdyBuZXcgRXJyb3IoJ05vIFVSSSBmb3IgYnVmZmVyJykgfVxuICAgIGNvbnN0IHsgc3ltYm9sLCByYW5nZSB9ID0gVXRpbC5nZXRTeW1ib2xJblJhbmdlKGVkaXRvciwgY3JhbmdlKVxuXG4gICAgY29uc3QgbGluZXMgPSBhd2FpdCB0aGlzLnF1ZXVlQ21kKCd0eXBlaW5mbycsIGF3YWl0IHRoaXMuZ2V0Um9vdERpcihidWZmZXIpLCB7XG4gICAgICBpbnRlcmFjdGl2ZTogdHJ1ZSxcbiAgICAgIGNvbW1hbmQ6ICdpbmZvJyxcbiAgICAgIHVyaTogYnVmZmVyLmdldFVyaSgpLFxuICAgICAgdGV4dDogYnVmZmVyLmlzTW9kaWZpZWQoKSA/IGJ1ZmZlci5nZXRUZXh0KCkgOiB1bmRlZmluZWQsXG4gICAgICBhcmdzOiBbc3ltYm9sXVxuICAgIH0pXG5cbiAgICBjb25zdCBpbmZvID0gbGluZXMuam9pbignXFxuJylcbiAgICBpZiAoKGluZm8gPT09ICdDYW5ub3Qgc2hvdyBpbmZvJykgfHwgIWluZm8pIHtcbiAgICAgIHRocm93IG5ldyBFcnJvcignTm8gaW5mbycpXG4gICAgfSBlbHNlIHtcbiAgICAgIHJldHVybiB7IHJhbmdlLCBpbmZvIH1cbiAgICB9XG4gIH1cblxuICBwdWJsaWMgYXN5bmMgZmluZFN5bWJvbFByb3ZpZGVyc0luQnVmZmVyIChlZGl0b3I6IEF0b21UeXBlcy5UZXh0RWRpdG9yLCBjcmFuZ2U6IEF0b21UeXBlcy5SYW5nZSkge1xuICAgIGNvbnN0IGJ1ZmZlciA9IGVkaXRvci5nZXRCdWZmZXIoKVxuICAgIGNvbnN0IHsgc3ltYm9sIH0gPSBVdGlsLmdldFN5bWJvbEluUmFuZ2UoZWRpdG9yLCBjcmFuZ2UpXG5cbiAgICByZXR1cm4gdGhpcy5xdWV1ZUNtZCgnZmluZCcsIGF3YWl0IHRoaXMuZ2V0Um9vdERpcihidWZmZXIpLCB7XG4gICAgICBpbnRlcmFjdGl2ZTogdHJ1ZSxcbiAgICAgIGNvbW1hbmQ6ICdmaW5kJyxcbiAgICAgIGFyZ3M6IFtzeW1ib2xdXG4gICAgfSlcbiAgfVxuXG4gIHB1YmxpYyBhc3luYyBkb0NoZWNrQnVmZmVyIChidWZmZXI6IEF0b21UeXBlcy5UZXh0QnVmZmVyLCBmYXN0OiBib29sZWFuID0gZmFsc2UpIHtcbiAgICByZXR1cm4gdGhpcy5kb0NoZWNrT3JMaW50QnVmZmVyKCdjaGVjaycsIGJ1ZmZlciwgZmFzdClcbiAgfVxuXG4gIHB1YmxpYyBhc3luYyBkb0xpbnRCdWZmZXIgKGJ1ZmZlcjogQXRvbVR5cGVzLlRleHRCdWZmZXIsIGZhc3Q6IGJvb2xlYW4gPSBmYWxzZSkge1xuICAgIHJldHVybiB0aGlzLmRvQ2hlY2tPckxpbnRCdWZmZXIoJ2xpbnQnLCBidWZmZXIsIGZhc3QpXG4gIH1cblxuICBwdWJsaWMgYXN5bmMgZG9DaGVja0FuZExpbnQgKGJ1ZmZlcjogQXRvbVR5cGVzLlRleHRCdWZmZXIsIGZhc3Q6IGJvb2xlYW4pIHtcbiAgICBjb25zdCBbY3IsIGxyXSA9IGF3YWl0IFByb21pc2UuYWxsKFt0aGlzLmRvQ2hlY2tCdWZmZXIoYnVmZmVyLCBmYXN0KSwgdGhpcy5kb0xpbnRCdWZmZXIoYnVmZmVyLCBmYXN0KV0pXG4gICAgcmV0dXJuIGNyLmNvbmNhdChscilcbiAgfVxuXG4gIHByaXZhdGUgYXN5bmMgaW5pdEJhY2tlbmQgKHJvb3REaXI6IEF0b21UeXBlcy5EaXJlY3RvcnkpOiBQcm9taXNlPEdoY01vZGlQcm9jZXNzUmVhbD4ge1xuICAgIGNvbnN0IHJvb3RQYXRoID0gcm9vdERpci5nZXRQYXRoKClcbiAgICBjb25zdCBjYWNoZWQgPSB0aGlzLmJhY2tlbmQuZ2V0KHJvb3RQYXRoKVxuICAgIGlmIChjYWNoZWQpIHsgcmV0dXJuIGF3YWl0IGNhY2hlZCB9XG4gICAgY29uc3QgbmV3QmFja2VuZCA9IHRoaXMuaW5pdEJhY2tlbmRSZWFsKHJvb3REaXIpXG4gICAgdGhpcy5iYWNrZW5kLnNldChyb290UGF0aCwgbmV3QmFja2VuZClcbiAgICByZXR1cm4gYXdhaXQgbmV3QmFja2VuZFxuICB9XG5cbiAgcHJpdmF0ZSBhc3luYyBpbml0QmFja2VuZFJlYWwgKHJvb3REaXI6IEF0b21UeXBlcy5EaXJlY3RvcnkpOiBQcm9taXNlPEdoY01vZGlQcm9jZXNzUmVhbD4ge1xuICAgIGxldCBvcHRzLCB2ZXJzLCBjYXBzXG4gICAgdHJ5IHtcbiAgICAgIG9wdHMgPSBhd2FpdCBVdGlsLmdldFByb2Nlc3NPcHRpb25zKHJvb3REaXIuZ2V0UGF0aCgpKVxuICAgICAgY29uc3QgdmVyc1AgPSB0aGlzLmdldFZlcnNpb24ob3B0cylcbiAgICAgIGNvbnN0IGJvcHRzID0gb3B0c1xuICAgICAgdmVyc1AudGhlbigodikgPT4geyB0aGlzLmNoZWNrQ29tcChib3B0cywgdikgfSlcbiAgICAgIHZlcnMgPSBhd2FpdCB2ZXJzUFxuICAgICAgY2FwcyA9IGF3YWl0IHRoaXMuZ2V0Q2Fwcyh2ZXJzKVxuICAgICAgdGhpcy5yZXNvbHZlQ2Fwc1Byb21pc2UoY2FwcylcbiAgICAgIGNvbnN0IGJhY2tlbmQgPSBuZXcgR2hjTW9kaVByb2Nlc3NSZWFsKGF3YWl0IHRoaXMucmVzb2x2ZUNhcHMocm9vdERpciksIHJvb3REaXIsIG9wdHMpXG4gICAgICB0aGlzLmRpc3Bvc2FibGVzLmFkZChcbiAgICAgICAgYmFja2VuZC5vbkVycm9yKChhcmcpID0+IHRoaXMuZW1pdHRlci5lbWl0KCdlcnJvcicsIGFyZykpLFxuICAgICAgICBiYWNrZW5kLm9uV2FybmluZygoYXJnKSA9PiB0aGlzLmVtaXR0ZXIuZW1pdCgnd2FybmluZycsIGFyZykpXG4gICAgICApXG4gICAgICByZXR1cm4gYmFja2VuZFxuICAgIH0gY2F0Y2ggKGVycikge1xuICAgICAgVXRpbC5ub3RpZnlTcGF3bkZhaWwoe2Rpcjogcm9vdERpci5nZXRQYXRoKCksIGVyciwgb3B0cywgdmVycywgY2Fwc30pXG4gICAgICB0aHJvdyBlcnJcbiAgICB9XG4gIH1cblxuICBwcml2YXRlIGNyZWF0ZVF1ZXVlcyAoKSB7XG4gICAgdGhpcy5jb21tYW5kUXVldWVzID0ge1xuICAgICAgY2hlY2tsaW50OiBuZXcgUXVldWUoMiksXG4gICAgICBicm93c2U6IG5ldyBRdWV1ZShhdG9tLmNvbmZpZy5nZXQoJ2hhc2tlbGwtZ2hjLW1vZC5tYXhCcm93c2VQcm9jZXNzZXMnKSksXG4gICAgICB0eXBlaW5mbzogbmV3IFF1ZXVlKDEpLFxuICAgICAgZmluZDogbmV3IFF1ZXVlKDEpLFxuICAgICAgaW5pdDogbmV3IFF1ZXVlKDQpLFxuICAgICAgbGlzdDogbmV3IFF1ZXVlKDEpLFxuICAgICAgbG93bWVtOiBuZXcgUXVldWUoMSlcbiAgICB9XG4gICAgdGhpcy5kaXNwb3NhYmxlcy5hZGQoYXRvbS5jb25maWcub25EaWRDaGFuZ2UoJ2hhc2tlbGwtZ2hjLW1vZC5tYXhCcm93c2VQcm9jZXNzZXMnLCAoe25ld1ZhbHVlfSkgPT5cbiAgICAgIHRoaXMuY29tbWFuZFF1ZXVlcy5icm93c2UgPSBuZXcgUXVldWUobmV3VmFsdWUgYXMgbnVtYmVyKSlcbiAgICApXG4gIH1cblxuICBwcml2YXRlIGFzeW5jIGdldFZlcnNpb24gKG9wdHM6IFV0aWwuRXhlY09wdHMpIHtcbiAgICBjb25zdCB0aW1lb3V0ID0gYXRvbS5jb25maWcuZ2V0KCdoYXNrZWxsLWdoYy1tb2QuaW5pdFRpbWVvdXQnKSAqIDEwMDBcbiAgICBjb25zdCBjbWQgPSBhdG9tLmNvbmZpZy5nZXQoJ2hhc2tlbGwtZ2hjLW1vZC5naGNNb2RQYXRoJylcbiAgICBjb25zdCB7c3Rkb3V0fSA9IGF3YWl0IFV0aWwuZXhlY1Byb21pc2UoY21kLCBbJ3ZlcnNpb24nXSwgeyB0aW1lb3V0LCAuLi5vcHRzIH0pXG4gICAgY29uc3QgdmVyc1JhdyA9IC9eZ2hjLW1vZCB2ZXJzaW9uIChcXGQrKVxcLihcXGQrKVxcLihcXGQrKSg/OlxcLihcXGQrKSk/Ly5leGVjKHN0ZG91dClcbiAgICBpZiAoIXZlcnNSYXcpIHsgdGhyb3cgbmV3IEVycm9yKFwiQ291bGRuJ3QgZ2V0IGdoYy1tb2QgdmVyc2lvblwiKSB9XG4gICAgY29uc3QgdmVycyA9IHZlcnNSYXcuc2xpY2UoMSwgNSkubWFwKChpKSA9PiBwYXJzZUludChpLCAxMCkpXG4gICAgY29uc3QgY29tcFJhdyA9IC9HSEMgKC4rKSQvLmV4ZWMoc3Rkb3V0LnRyaW0oKSlcbiAgICBpZiAoIWNvbXBSYXcpIHsgdGhyb3cgbmV3IEVycm9yKFwiQ291bGRuJ3QgZ2V0IGdoYyB2ZXJzaW9uXCIpIH1cbiAgICBjb25zdCBjb21wID0gY29tcFJhd1sxXVxuICAgIFV0aWwuZGVidWcoYEdoYy1tb2QgJHt2ZXJzfSBidWlsdCB3aXRoICR7Y29tcH1gKVxuICAgIHJldHVybiB7IHZlcnMsIGNvbXAgfVxuICB9XG5cbiAgcHJpdmF0ZSBhc3luYyBjaGVja0NvbXAgKG9wdHM6IFV0aWwuRXhlY09wdHMsIHsgY29tcCB9OiB7Y29tcDogc3RyaW5nfSkge1xuICAgIGNvbnN0IHRpbWVvdXQgPSBhdG9tLmNvbmZpZy5nZXQoJ2hhc2tlbGwtZ2hjLW1vZC5pbml0VGltZW91dCcpICogMTAwMFxuICAgIGNvbnN0IHRyeVdhcm4gPSBhc3luYyAoY21kOiBzdHJpbmcsIGFyZ3M6IHN0cmluZ1tdKSA9PiB7XG4gICAgICB0cnkge1xuICAgICAgICByZXR1cm4gKGF3YWl0IFV0aWwuZXhlY1Byb21pc2UoY21kLCBhcmdzLCB7IHRpbWVvdXQsIC4uLm9wdHMgfSkpLnN0ZG91dC50cmltKClcbiAgICAgIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgICAgIFV0aWwud2FybihlcnJvcilcbiAgICAgIH1cbiAgICB9XG4gICAgY29uc3QgW3N0YWNrZ2hjLCBwYXRoZ2hjXSA9IGF3YWl0IFByb21pc2UuYWxsKFtcbiAgICAgIHRyeVdhcm4oJ3N0YWNrJywgWydnaGMnLCAnLS0nLCAnLS1udW1lcmljLXZlcnNpb24nXSksXG4gICAgICB0cnlXYXJuKCdnaGMnLCBbJy0tbnVtZXJpYy12ZXJzaW9uJ10pLFxuICAgIF0pXG4gICAgVXRpbC5kZWJ1ZyhgU3RhY2sgR0hDIHZlcnNpb24gJHtzdGFja2doY31gKVxuICAgIFV0aWwuZGVidWcoYFBhdGggR0hDIHZlcnNpb24gJHtwYXRoZ2hjfWApXG4gICAgaWYgKHN0YWNrZ2hjICYmIChzdGFja2doYyAhPT0gY29tcCkpIHtcbiAgICAgIGNvbnN0IHdhcm4gPSBgXFxcbkdIQyB2ZXJzaW9uIGluIHlvdXIgU3RhY2sgJyR7c3RhY2tnaGN9JyBkb2Vzbid0IG1hdGNoIHdpdGggXFxcbkdIQyB2ZXJzaW9uIHVzZWQgdG8gYnVpbGQgZ2hjLW1vZCAnJHtjb21wfScuIFRoaXMgY2FuIGxlYWQgdG8gXFxcbnByb2JsZW1zIHdoZW4gdXNpbmcgU3RhY2sgcHJvamVjdHNgXG4gICAgICBhdG9tLm5vdGlmaWNhdGlvbnMuYWRkV2FybmluZyh3YXJuKVxuICAgICAgVXRpbC53YXJuKHdhcm4pXG4gICAgfVxuICAgIGlmIChwYXRoZ2hjICYmIChwYXRoZ2hjICE9PSBjb21wKSkge1xuICAgICAgY29uc3Qgd2FybiA9IGBcXFxuR0hDIHZlcnNpb24gaW4geW91ciBQQVRIICcke3BhdGhnaGN9JyBkb2Vzbid0IG1hdGNoIHdpdGggXFxcbkdIQyB2ZXJzaW9uIHVzZWQgdG8gYnVpbGQgZ2hjLW1vZCAnJHtjb21wfScuIFRoaXMgY2FuIGxlYWQgdG8gXFxcbnByb2JsZW1zIHdoZW4gdXNpbmcgQ2FiYWwgb3IgUGxhaW4gcHJvamVjdHNgXG4gICAgICBhdG9tLm5vdGlmaWNhdGlvbnMuYWRkV2FybmluZyh3YXJuKVxuICAgICAgVXRpbC53YXJuKHdhcm4pXG4gICAgfVxuICB9XG5cbiAgcHJpdmF0ZSBhc3luYyByZXNvbHZlQ2FwcyAocm9vdERpcjogQXRvbVR5cGVzLkRpcmVjdG9yeSk6IFByb21pc2U8R0hDTW9kQ2Fwcz4ge1xuICAgIHRoaXMuaW5pdEJhY2tlbmQocm9vdERpcilcbiAgICByZXR1cm4gdGhpcy5jYXBzXG4gIH1cblxuICBwcml2YXRlIGdldENhcHMgKHsgdmVycyB9OiB7dmVyczogbnVtYmVyW119KTogR0hDTW9kQ2FwcyB7XG4gICAgY29uc3QgY2FwczogR0hDTW9kQ2FwcyA9IHtcbiAgICAgIHZlcnNpb246IHZlcnMsXG4gICAgICBmaWxlTWFwOiBmYWxzZSxcbiAgICAgIHF1b3RlQXJnczogZmFsc2UsXG4gICAgICBvcHRwYXJzZTogZmFsc2UsXG4gICAgICB0eXBlQ29uc3RyYWludHM6IGZhbHNlLFxuICAgICAgYnJvd3NlUGFyZW50czogZmFsc2UsXG4gICAgICBpbnRlcmFjdGl2ZUNhc2VTcGxpdDogZmFsc2UsXG4gICAgICBpbXBvcnRlZEZyb206IGZhbHNlLFxuICAgICAgYnJvd3NlTWFpbjogZmFsc2VcbiAgICB9XG5cbiAgICBjb25zdCBhdExlYXN0ID0gKGI6IG51bWJlcltdKSA9PiB7XG4gICAgICBmb3IgKGxldCBpID0gMDsgaSA8IGIubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgY29uc3QgdiA9IGJbaV1cbiAgICAgICAgaWYgKHZlcnNbaV0gPiB2KSB7XG4gICAgICAgICAgcmV0dXJuIHRydWVcbiAgICAgICAgfSBlbHNlIGlmICh2ZXJzW2ldIDwgdikge1xuICAgICAgICAgIHJldHVybiBmYWxzZVxuICAgICAgICB9XG4gICAgICB9XG4gICAgICByZXR1cm4gdHJ1ZVxuICAgIH1cblxuICAgIGNvbnN0IGV4YWN0ID0gKGI6IG51bWJlcltdKSA9PiB7XG4gICAgICBmb3IgKGxldCBpID0gMDsgaSA8IGIubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgY29uc3QgdiA9IGJbaV1cbiAgICAgICAgaWYgKHZlcnNbaV0gIT09IHYpIHtcbiAgICAgICAgICByZXR1cm4gZmFsc2VcbiAgICAgICAgfVxuICAgICAgfVxuICAgICAgcmV0dXJuIHRydWVcbiAgICB9XG5cbiAgICBpZiAoIWF0TGVhc3QoWzUsIDRdKSkge1xuICAgICAgYXRvbS5ub3RpZmljYXRpb25zLmFkZEVycm9yKGBcXFxuSGFza2VsbC1naGMtbW9kOiBnaGMtbW9kIDwgNS40IGlzIG5vdCBzdXBwb3J0ZWQuIFxcXG5Vc2UgYXQgeW91ciBvd24gcmlzayBvciB1cGRhdGUgeW91ciBnaGMtbW9kIGluc3RhbGxhdGlvbmAsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgeyBkaXNtaXNzYWJsZTogdHJ1ZSB9KVxuICAgIH1cbiAgICBpZiAoZXhhY3QoWzUsIDRdKSkge1xuICAgICAgYXRvbS5ub3RpZmljYXRpb25zLmFkZFdhcm5pbmcoYFxcXG5IYXNrZWxsLWdoYy1tb2Q6IGdoYy1tb2QgNS40LiogaXMgZGVwcmVjYXRlZC4gXFxcblVzZSBhdCB5b3VyIG93biByaXNrIG9yIHVwZGF0ZSB5b3VyIGdoYy1tb2QgaW5zdGFsbGF0aW9uYCxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHsgZGlzbWlzc2FibGU6IHRydWUgfSlcbiAgICB9XG4gICAgaWYgKGF0TGVhc3QoWzUsIDRdKSkge1xuICAgICAgY2Fwcy5maWxlTWFwID0gdHJ1ZVxuICAgIH1cbiAgICBpZiAoYXRMZWFzdChbNSwgNV0pKSB7XG4gICAgICBjYXBzLnF1b3RlQXJncyA9IHRydWVcbiAgICAgIGNhcHMub3B0cGFyc2UgPSB0cnVlXG4gICAgfVxuICAgIGlmIChhdExlYXN0KFs1LCA2XSkpIHtcbiAgICAgIGNhcHMudHlwZUNvbnN0cmFpbnRzID0gdHJ1ZVxuICAgICAgY2Fwcy5icm93c2VQYXJlbnRzID0gdHJ1ZVxuICAgICAgY2Fwcy5pbnRlcmFjdGl2ZUNhc2VTcGxpdCA9IHRydWVcbiAgICB9XG4gICAgaWYgKGF0b20uY29uZmlnLmdldCgnaGFza2VsbC1naGMtbW9kLmV4cGVyaW1lbnRhbCcpKSB7XG4gICAgICBjYXBzLmltcG9ydGVkRnJvbSA9IHRydWVcbiAgICB9XG4gICAgVXRpbC5kZWJ1ZyhKU09OLnN0cmluZ2lmeShjYXBzKSlcbiAgICByZXR1cm4gY2Fwc1xuICB9XG5cbiAgcHJpdmF0ZSBhc3luYyBnZXRTZXR0aW5ncyAocnVuRGlyOiBBdG9tVHlwZXMuRGlyZWN0b3J5KSB7XG4gICAgY29uc3QgcmVhZFNldHRpbmdzID0gYXN5bmMgKGZpbGU6IEF0b21UeXBlcy5GaWxlKSA9PiB7XG4gICAgICB0cnkge1xuICAgICAgICBjb25zdCBleCA9IGF3YWl0IGZpbGUuZXhpc3RzKClcbiAgICAgICAgaWYgKGV4KSB7XG4gICAgICAgICAgY29uc3QgY29udGVudHMgPSBhd2FpdCBmaWxlLnJlYWQoKVxuICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICByZXR1cm4gSlNPTi5wYXJzZShjb250ZW50cylcbiAgICAgICAgICB9IGNhdGNoIChlcnIpIHtcbiAgICAgICAgICAgIGF0b20ubm90aWZpY2F0aW9ucy5hZGRFcnJvcihgRmFpbGVkIHRvIHBhcnNlICR7ZmlsZS5nZXRQYXRoKCl9YCwge1xuICAgICAgICAgICAgICBkZXRhaWw6IGVycixcbiAgICAgICAgICAgICAgZGlzbWlzc2FibGU6IHRydWVcbiAgICAgICAgICAgIH0pXG4gICAgICAgICAgICB0aHJvdyBlcnJcbiAgICAgICAgICB9XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgcmV0dXJuIHt9XG4gICAgICAgIH1cbiAgICAgIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgICAgIGlmIChlcnJvcikgeyBVdGlsLndhcm4oZXJyb3IpIH1cbiAgICAgICAgcmV0dXJuIHt9XG4gICAgICB9XG4gICAgfVxuXG4gICAgY29uc3QgbG9jYWxTZXR0aW5ncyA9IHJlYWRTZXR0aW5ncyhydW5EaXIuZ2V0RmlsZSgnLmhhc2tlbGwtZ2hjLW1vZC5qc29uJykpXG5cbiAgICBjb25zdCBbcHJvamVjdERpcl0gPSBhdG9tLnByb2plY3QuZ2V0RGlyZWN0b3JpZXMoKS5maWx0ZXIoKGQpID0+IGQuY29udGFpbnMocnVuRGlyLmdldFBhdGgoKSkpXG4gICAgY29uc3QgcHJvamVjdFNldHRpbmdzID1cbiAgICAgIHByb2plY3REaXIgP1xuICAgICAgICByZWFkU2V0dGluZ3MocHJvamVjdERpci5nZXRGaWxlKCcuaGFza2VsbC1naGMtbW9kLmpzb24nKSlcbiAgICAgICAgOlxuICAgICAgICBQcm9taXNlLnJlc29sdmUoe30pXG5cbiAgICBjb25zdCBjb25maWdEaXIgPSBuZXcgRGlyZWN0b3J5KGF0b20uZ2V0Q29uZmlnRGlyUGF0aCgpKVxuICAgIGNvbnN0IGdsb2JhbFNldHRpbmdzID0gcmVhZFNldHRpbmdzKGNvbmZpZ0Rpci5nZXRGaWxlKCdoYXNrZWxsLWdoYy1tb2QuanNvbicpKVxuXG4gICAgY29uc3QgW2dsb2IsIHByaiwgbG9jXSA9IGF3YWl0IFByb21pc2UuYWxsKFtnbG9iYWxTZXR0aW5ncywgcHJvamVjdFNldHRpbmdzLCBsb2NhbFNldHRpbmdzXSlcbiAgICByZXR1cm4geyAuLi5nbG9iLCAuLi5wcmosIC4uLmxvYyB9XG4gIH1cblxuICBwcml2YXRlIGFzeW5jIHF1ZXVlQ21kIChcbiAgICBxdWV1ZU5hbWU6IENvbW1hbmRzLFxuICAgIGRpcjogQXRvbVR5cGVzLkRpcmVjdG9yeSxcbiAgICBydW5BcmdzOiB7XG4gICAgICBjb21tYW5kOiBzdHJpbmcsIHRleHQ/OiBzdHJpbmcsIHVyaT86IHN0cmluZywgaW50ZXJhY3RpdmU/OiBib29sZWFuLFxuICAgICAgZGFzaEFyZ3M/OiBzdHJpbmdbXSwgYXJncz86IHN0cmluZ1tdXG4gICAgfVxuICApOiBQcm9taXNlPHN0cmluZ1tdPiB7XG4gICAgaWYgKGF0b20uY29uZmlnLmdldCgnaGFza2VsbC1naGMtbW9kLmxvd01lbW9yeVN5c3RlbScpKSB7XG4gICAgICBxdWV1ZU5hbWUgPSAnbG93bWVtJ1xuICAgIH1cbiAgICBjb25zdCBiYWNrZW5kID0gYXdhaXQgdGhpcy5pbml0QmFja2VuZChkaXIpXG4gICAgY29uc3QgcHJvbWlzZSA9IHRoaXMuY29tbWFuZFF1ZXVlc1txdWV1ZU5hbWVdLmFkZChhc3luYyAoKSA9PiB7XG4gICAgICB0aGlzLmVtaXR0ZXIuZW1pdCgnYmFja2VuZC1hY3RpdmUnLCB1bmRlZmluZWQpXG4gICAgICB0cnkge1xuICAgICAgICBjb25zdCBzZXR0aW5ncyA9IGF3YWl0IHRoaXMuZ2V0U2V0dGluZ3MoZGlyKVxuICAgICAgICBpZiAoc2V0dGluZ3MuZGlzYWJsZSkgeyB0aHJvdyBuZXcgRXJyb3IoJ0doYy1tb2QgZGlzYWJsZWQgaW4gc2V0dGluZ3MnKSB9XG4gICAgICAgIHJldHVybiBiYWNrZW5kLnJ1bih7XG4gICAgICAgICAgLi4ucnVuQXJncyxcbiAgICAgICAgICBzdXBwcmVzc0Vycm9yczogc2V0dGluZ3Muc3VwcHJlc3NFcnJvcnMsXG4gICAgICAgICAgZ2hjT3B0aW9uczogc2V0dGluZ3MuZ2hjT3B0aW9ucyxcbiAgICAgICAgICBnaGNNb2RPcHRpb25zOiBzZXR0aW5ncy5naGNNb2RPcHRpb25zLFxuICAgICAgICB9KVxuICAgICAgfSBjYXRjaCAoZXJyKSB7XG4gICAgICAgICAgVXRpbC53YXJuKGVycilcbiAgICAgICAgICB0aHJvdyBlcnJcbiAgICAgIH1cbiAgICB9KVxuICAgIHByb21pc2UudGhlbigocmVzKSA9PiB7XG4gICAgICBjb25zdCBxZSA9IChxbjogQ29tbWFuZHMpID0+IHtcbiAgICAgICAgY29uc3QgcSA9IHRoaXMuY29tbWFuZFF1ZXVlc1txbl1cbiAgICAgICAgcmV0dXJuIChxLmdldFF1ZXVlTGVuZ3RoKCkgKyBxLmdldFBlbmRpbmdMZW5ndGgoKSkgPT09IDBcbiAgICAgIH1cbiAgICAgIGlmIChxZShxdWV1ZU5hbWUpKSB7XG4gICAgICAgIHRoaXMuZW1pdHRlci5lbWl0KCdxdWV1ZS1pZGxlJywgeyBxdWV1ZTogcXVldWVOYW1lIH0pXG4gICAgICAgIGlmIChPYmplY3Qua2V5cyh0aGlzLmNvbW1hbmRRdWV1ZXMpLmV2ZXJ5KHFlKSkge1xuICAgICAgICAgIHRoaXMuZW1pdHRlci5lbWl0KCdiYWNrZW5kLWlkbGUnLCB1bmRlZmluZWQpXG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9KVxuICAgIHJldHVybiBwcm9taXNlXG4gIH1cblxuICBwcml2YXRlIGFzeW5jIGRvQ2hlY2tPckxpbnRCdWZmZXIgKGNtZDogJ2NoZWNrJyB8ICdsaW50JywgYnVmZmVyOiBBdG9tVHlwZXMuVGV4dEJ1ZmZlciwgZmFzdDogYm9vbGVhbikge1xuICAgIGxldCBkYXNoQXJnc1xuICAgIGlmIChidWZmZXIuaXNFbXB0eSgpKSB7IHJldHVybiBbXSB9XG4gICAgaWYgKCEgYnVmZmVyLmdldFVyaSgpKSB7IHJldHVybiBbXSB9XG5cbiAgICAvLyBBIGRpcnR5IGhhY2sgdG8gbWFrZSBsaW50IHdvcmsgd2l0aCBsaHNcbiAgICBsZXQgdXJpID0gYnVmZmVyLmdldFVyaSgpXG4gICAgY29uc3Qgb2xkdXJpID0gYnVmZmVyLmdldFVyaSgpXG4gICAgbGV0IHRleHRcbiAgICB0cnkge1xuICAgICAgaWYgKChjbWQgPT09ICdsaW50JykgJiYgKGV4dG5hbWUodXJpKSA9PT0gJy5saHMnKSkge1xuICAgICAgICB1cmkgPSB1cmkuc2xpY2UoMCwgLTEpXG4gICAgICAgIHRleHQgPSBhd2FpdCB1bmxpdChvbGR1cmksIGJ1ZmZlci5nZXRUZXh0KCkpXG4gICAgICB9IGVsc2UgaWYgKGJ1ZmZlci5pc01vZGlmaWVkKCkpIHtcbiAgICAgICAgdGV4dCA9IGJ1ZmZlci5nZXRUZXh0KClcbiAgICAgIH1cbiAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgLy8gVE9ETzogUmVqZWN0XG4gICAgICBjb25zdCBtID0gKGVycm9yIGFzIEVycm9yKS5tZXNzYWdlLm1hdGNoKC9eKC4qPyk6KFswLTldKyk6ICooLiopICokLylcbiAgICAgIGlmICghbSkgeyB0aHJvdyBlcnJvciB9XG4gICAgICBjb25zdCBbdXJpMiwgbGluZSwgbWVzc10gPSBtLnNsaWNlKDEpXG4gICAgICByZXR1cm4gW3tcbiAgICAgICAgdXJpOiB1cmkyLFxuICAgICAgICBwb3NpdGlvbjogbmV3IFBvaW50KHBhcnNlSW50KGxpbmUsIDEwKSAtIDEsIDApLFxuICAgICAgICBtZXNzYWdlOiBtZXNzLFxuICAgICAgICBzZXZlcml0eTogJ2xpbnQnXG4gICAgICB9XVxuICAgIH1cbiAgICAvLyBlbmQgb2YgZGlydHkgaGFja1xuXG4gICAgaWYgKGNtZCA9PT0gJ2xpbnQnKSB7XG4gICAgICBjb25zdCBvcHRzOiBzdHJpbmdbXSA9IGF0b20uY29uZmlnLmdldCgnaGFza2VsbC1naGMtbW9kLmhsaW50T3B0aW9ucycpXG4gICAgICBkYXNoQXJncyA9IFtdXG4gICAgICBmb3IgKGNvbnN0IG9wdCBvZiBvcHRzKSB7XG4gICAgICAgIGRhc2hBcmdzLnB1c2goJy0taGxpbnRPcHQnLCBvcHQpXG4gICAgICB9XG4gICAgfVxuXG4gICAgY29uc3Qgcm9vdERpciA9IGF3YWl0IHRoaXMuZ2V0Um9vdERpcihidWZmZXIpXG5cbiAgICBjb25zdCBsaW5lcyA9IGF3YWl0IHRoaXMucXVldWVDbWQoJ2NoZWNrbGludCcsIHJvb3REaXIsIHtcbiAgICAgIGludGVyYWN0aXZlOiBmYXN0LFxuICAgICAgY29tbWFuZDogY21kLFxuICAgICAgdXJpLFxuICAgICAgdGV4dCxcbiAgICAgIGRhc2hBcmdzXG4gICAgfSlcblxuICAgIGNvbnN0IHJ4ID0gL14oLio/KTooWzAtOVxcc10rKTooWzAtOVxcc10rKTogKig/OihXYXJuaW5nfEVycm9yKTogKik/KFteXSopL1xuICAgIGNvbnN0IHJlcyA9IFtdXG4gICAgZm9yIChjb25zdCBsaW5lIG9mIGxpbmVzKSB7XG4gICAgICBjb25zdCBtYXRjaCA9IGxpbmUubWF0Y2gocngpXG4gICAgICBpZiAoIW1hdGNoKSB7XG4gICAgICAgIGlmIChsaW5lLnRyaW0oKS5sZW5ndGgpIHsgVXRpbC53YXJuKGBnaGMtbW9kIHNheXM6ICR7bGluZX1gKSB9XG4gICAgICAgIGNvbnRpbnVlXG4gICAgICB9XG4gICAgICBjb25zdCBbZmlsZTIsIHJvdywgY29sLCB3YXJuaW5nLCBtZXNzYWdlXSA9IG1hdGNoLnNsaWNlKDEpXG4gICAgICBpZiAoZmlsZTIgPT09ICdEdW1teScgJiYgcm93ID09PSAnMCcgJiYgY29sID09PSAnMCcpIHtcbiAgICAgICAgaWYgKHdhcm5pbmcgPT09ICdFcnJvcicpIHtcbiAgICAgICAgICB0aGlzLmVtaXR0ZXIuZW1pdCgnZXJyb3InLCB7ZXJyOiBVdGlsLm1rRXJyb3IoJ0dIQ01vZFN0ZG91dEVycm9yJywgbWVzc2FnZSksIGNhcHM6IGF3YWl0IHRoaXMuY2Fwc30pXG4gICAgICAgICAgY29udGludWVcbiAgICAgICAgfSBlbHNlIGlmICh3YXJuaW5nID09PSAnV2FybmluZycpIHtcbiAgICAgICAgICB0aGlzLmVtaXR0ZXIuZW1pdCgnd2FybmluZycsIG1lc3NhZ2UpXG4gICAgICAgICAgY29udGludWVcbiAgICAgICAgfVxuICAgICAgfVxuXG4gICAgICBjb25zdCBmaWxlID0gdXJpLmVuZHNXaXRoKGZpbGUyKSA/IG9sZHVyaSA6IGZpbGUyXG4gICAgICBjb25zdCBzZXZlcml0eSA9XG4gICAgICAgIGNtZCA9PT0gJ2xpbnQnID9cbiAgICAgICAgICAnbGludCdcbiAgICAgICAgICA6IHdhcm5pbmcgPT09ICdXYXJuaW5nJyA/XG4gICAgICAgICAgICAnd2FybmluZydcbiAgICAgICAgICAgIDpcbiAgICAgICAgICAgICdlcnJvcidcbiAgICAgIGNvbnN0IG1lc3NQb3MgPSBuZXcgUG9pbnQocGFyc2VJbnQocm93LCAxMCkgLSAxLCBwYXJzZUludChjb2wsIDEwKSAtIDEpXG4gICAgICBjb25zdCBwb3NpdGlvbiA9IFV0aWwudGFiVW5zaGlmdEZvclBvaW50KGJ1ZmZlciwgbWVzc1BvcylcbiAgICAgIGxldCBteXVyaVxuICAgICAgdHJ5IHtcbiAgICAgICAgbXl1cmkgPSByb290RGlyLmdldEZpbGUocm9vdERpci5yZWxhdGl2aXplKGZpbGUpKS5nZXRQYXRoKClcbiAgICAgIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgICAgIG15dXJpID0gZmlsZVxuICAgICAgfVxuICAgICAgcmVzLnB1c2goe1xuICAgICAgICB1cmk6IG15dXJpLFxuICAgICAgICBwb3NpdGlvbixcbiAgICAgICAgbWVzc2FnZSxcbiAgICAgICAgc2V2ZXJpdHlcbiAgICAgIH0pXG4gICAgfVxuICAgIHJldHVybiByZXNcbiAgfVxufVxuIl19