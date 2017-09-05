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
                args: modules,
            });
            return lines.map((s) => {
                const pattern = caps.browseParents ? /^(.*?) :: (.*?)(?: -- from:(.*))?$/ : /^(.*?) :: (.*)$/;
                const match = s.match(pattern);
                let name;
                let typeSignature;
                let parent;
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
                    name = name.slice(1, -1);
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
                args: [crange.start.row + 1, crange.start.column + 1].map((v) => v.toString()),
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
                    [parseInt(rowend, 10) - 1, parseInt(colend, 10) - 1],
                ]);
                if (range.isEmpty()) {
                    continue;
                }
                if (!range.containsRange(crange)) {
                    continue;
                }
                return {
                    range: Util.tabUnshiftForRange(buffer, range),
                    type: type.replace(/\\"/g, '"'),
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
                args: [crange.start.row + 1, crange.start.column + 1].map((v) => v.toString()),
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
                        [parseInt(rowend, 10) - 1, parseInt(colend, 10) - 1],
                    ]),
                    replacement: text,
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
                args: [crange.start.row + 1, crange.start.column + 1].map((v) => v.toString()),
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
                [parseInt(rowend, 10) - 1, parseInt(colend, 10) - 1],
            ]);
            return {
                type: lines[0],
                range,
                body: lines.slice(2).join('\n'),
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
                args: [symbol],
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
                args: [symbol],
            });
        });
    }
    doCheckBuffer(buffer, fast) {
        return __awaiter(this, void 0, void 0, function* () {
            return this.doCheckOrLintBuffer('check', buffer, fast);
        });
    }
    doLintBuffer(buffer) {
        return __awaiter(this, void 0, void 0, function* () {
            return this.doCheckOrLintBuffer('lint', buffer, false);
        });
    }
    doCheckAndLint(buffer, fast) {
        return __awaiter(this, void 0, void 0, function* () {
            const [cr, lr] = yield Promise.all([this.doCheckBuffer(buffer, fast), this.doLintBuffer(buffer)]);
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
            let opts;
            let vers;
            let caps;
            try {
                opts = yield Util.getProcessOptions(rootDir.getPath());
                const versP = this.getVersion(opts);
                const bopts = opts;
                versP.then((v) => { this.checkComp(bopts, v); });
                vers = yield versP;
                caps = this.getCaps(vers);
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
            lowmem: new Queue(1),
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
            browseMain: false,
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
                                dismissable: true,
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
                        severity: 'lint',
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
                dashArgs,
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
                    severity,
                });
            }
            return res;
        });
    }
}
exports.GhcModiProcess = GhcModiProcess;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaW5kZXguanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi9zcmMvZ2hjLW1vZC9pbmRleC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOzs7Ozs7Ozs7O0FBQUEsK0JBQXNGO0FBQ3RGLGdDQUErQjtBQUMvQiwrQkFBOEI7QUFDOUIsdUNBQXVDO0FBQ3ZDLDJEQUEwQztBQUUxQyxtRUFBcUc7QUFhckc7SUFpQkU7UUFDRSxJQUFJLENBQUMsV0FBVyxHQUFHLElBQUksMEJBQW1CLEVBQUUsQ0FBQTtRQUM1QyxJQUFJLENBQUMsT0FBTyxHQUFHLElBQUksY0FBTyxFQUFFLENBQUE7UUFDNUIsSUFBSSxDQUFDLFdBQVcsQ0FBQyxHQUFHLENBQUMsSUFBSSxDQUFDLE9BQU8sQ0FBQyxDQUFBO1FBQ2xDLElBQUksQ0FBQyxZQUFZLEdBQUcsSUFBSSxPQUFPLEVBQUUsQ0FBQTtRQUNqQyxJQUFJLENBQUMsT0FBTyxHQUFHLElBQUksR0FBRyxFQUFFLENBQUE7UUFDeEIsSUFBSSxDQUFDLElBQUksR0FBRyxJQUFJLE9BQU8sQ0FBQyxDQUFDLE9BQU8sS0FBSyxJQUFJLENBQUMsa0JBQWtCLEdBQUcsT0FBTyxDQUFDLENBQUE7UUFFdkUsRUFBRSxDQUFDLENBQUMsT0FBTyxDQUFDLEdBQUcsQ0FBQyxnQkFBZ0IsSUFBSSxDQUFDLElBQUksQ0FBQyxNQUFNLENBQUMsR0FBRyxDQUFDLCtDQUErQyxDQUFDLENBQUMsQ0FBQyxDQUFDO1lBQ3RHLElBQUksQ0FBQyxrQkFBa0IsRUFBRSxDQUFBO1FBQzNCLENBQUM7UUFFRCxJQUFJLENBQUMsWUFBWSxFQUFFLENBQUE7SUFDckIsQ0FBQztJQUVZLFVBQVUsQ0FBQyxNQUE0Qjs7WUFDbEQsSUFBSSxHQUFHLENBQUE7WUFDUCxHQUFHLEdBQUcsSUFBSSxDQUFDLFlBQVksQ0FBQyxHQUFHLENBQUMsTUFBTSxDQUFDLENBQUE7WUFDbkMsRUFBRSxDQUFDLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQztnQkFDUixN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YixNQUFNLE9BQU8sR0FBRyxJQUFJLFlBQUssQ0FBQyxRQUFRLENBQUMsR0FBRyxFQUFFLEVBQUUsQ0FBQyxHQUFHLENBQUMsRUFBRSxRQUFRLENBQUMsR0FBRyxFQUFFLEVBQUUsQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFBO2dCQUN2RSxNQUFNLFFBQVEsR0FBRyxJQUFJLENBQUMsa0JBQWtCLENBQUMsTUFBTSxFQUFFLE9BQU8sQ0FBQyxDQUFBO2dCQUN6RCxJQUFJLEtBQUssQ0FBQTtnQkFDVCxJQUFJLENBQUM7b0JBQ0gsS0FBSyxHQUFHLE9BQU8sQ0FBQyxPQUFPLENBQUMsT0FBTyxDQUFDLFVBQVUsQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLE9BQU8sRUFBRSxDQUFBO2dCQUM3RCxDQUFDO2dCQUFDLEtBQUssQ0FBQyxDQUFDLEtBQUssQ0FBQyxDQUFDLENBQUM7b0JBQ2YsS0FBSyxHQUFHLElBQUksQ0FBQTtnQkFDZCxDQUFDO2dCQUNELEdBQUcsQ0FBQyxJQUFJLENBQUM7b0JBQ1AsR0FBRyxFQUFFLEtBQUs7b0JBQ1YsUUFBUTtvQkFDUixPQUFPO29CQUNQLFFBQVE7aUJBQ1QsQ0FBQyxDQUFBO1lBQ0osQ0FBQztZQUNELE1BQU0sQ0FBQyxHQUFHLENBQUE7UUFDWixDQUFDO0tBQUE7Q0FDRjtBQXZuQkQsd0NBdW5CQyIsInNvdXJjZXNDb250ZW50IjpbImltcG9ydCB7IFJhbmdlLCBQb2ludCwgVEVtaXR0ZXIsIEVtaXR0ZXIsIENvbXBvc2l0ZURpc3Bvc2FibGUsIERpcmVjdG9yeSB9IGZyb20gJ2F0b20nXG5pbXBvcnQgKiBhcyBVdGlsIGZyb20gJy4uL3V0aWwnXG5pbXBvcnQgeyBleHRuYW1lIH0gZnJvbSAncGF0aCdcbmltcG9ydCBRdWV1ZSA9IHJlcXVpcmUoJ3Byb21pc2UtcXVldWUnKVxuaW1wb3J0IHsgdW5saXQgfSBmcm9tICdhdG9tLWhhc2tlbGwtdXRpbHMnXG5cbmltcG9ydCB7IEdoY01vZGlQcm9jZXNzUmVhbCwgR0hDTW9kQ2FwcywgUnVuQXJncywgSUVycm9yQ2FsbGJhY2tBcmdzIH0gZnJvbSAnLi9naGMtbW9kaS1wcm9jZXNzLXJlYWwnXG5cbmV4cG9ydCB7IElFcnJvckNhbGxiYWNrQXJncywgUnVuQXJncywgR0hDTW9kQ2FwcyB9XG5cbnR5cGUgQ29tbWFuZHMgPSAnY2hlY2tsaW50JyB8ICdicm93c2UnIHwgJ3R5cGVpbmZvJyB8ICdmaW5kJyB8ICdpbml0JyB8ICdsaXN0JyB8ICdsb3dtZW0nXG5cbmV4cG9ydCBpbnRlcmZhY2UgU3ltYm9sRGVzYyB7XG4gIG5hbWU6IHN0cmluZyxcbiAgc3ltYm9sVHlwZTogVVBJLkNvbXBsZXRpb25CYWNrZW5kLlN5bWJvbFR5cGUsXG4gIHR5cGVTaWduYXR1cmU/OiBzdHJpbmcsXG4gIHBhcmVudD86IHN0cmluZ1xufVxuXG5leHBvcnQgY2xhc3MgR2hjTW9kaVByb2Nlc3Mge1xuICBwcml2YXRlIGJhY2tlbmQ6IE1hcDxzdHJpbmcsIFByb21pc2U8R2hjTW9kaVByb2Nlc3NSZWFsPj5cbiAgcHJpdmF0ZSBkaXNwb3NhYmxlczogQ29tcG9zaXRlRGlzcG9zYWJsZVxuICBwcml2YXRlIGVtaXR0ZXI6IFRFbWl0dGVyPHtcbiAgICAnZGlkLWRlc3Ryb3knOiB1bmRlZmluZWRcbiAgICAnd2FybmluZyc6IHN0cmluZ1xuICAgICdlcnJvcic6IElFcnJvckNhbGxiYWNrQXJnc1xuICAgICdiYWNrZW5kLWFjdGl2ZSc6IHZvaWRcbiAgICAnYmFja2VuZC1pZGxlJzogdm9pZFxuICAgICdxdWV1ZS1pZGxlJzogeyBxdWV1ZTogQ29tbWFuZHMgfVxuICB9PlxuICBwcml2YXRlIGJ1ZmZlckRpck1hcDogV2Vha01hcDxBdG9tVHlwZXMuVGV4dEJ1ZmZlciwgQXRvbVR5cGVzLkRpcmVjdG9yeT5cbiAgcHJpdmF0ZSBjb21tYW5kUXVldWVzOiB7W0sgaW4gQ29tbWFuZHNdOiBRdWV1ZX1cbiAgcHJpdmF0ZSBjYXBzOiBQcm9taXNlPEdIQ01vZENhcHM+XG4gIC8vIHRzbGludDpkaXNhYmxlLW5leHQtbGluZTogbm8tdW5pbml0aWFsaXplZFxuICBwcml2YXRlIHJlc29sdmVDYXBzUHJvbWlzZTogKHZhbDogR0hDTW9kQ2FwcykgPT4gdm9pZFxuXG4gIGNvbnN0cnVjdG9yKCkge1xuICAgIHRoaXMuZGlzcG9zYWJsZXMgPSBuZXcgQ29tcG9zaXRlRGlzcG9zYWJsZSgpXG4gICAgdGhpcy5lbWl0dGVyID0gbmV3IEVtaXR0ZXIoKVxuICAgIHRoaXMuZGlzcG9zYWJsZXMuYWRkKHRoaXMuZW1pdHRlcilcbiAgICB0aGlzLmJ1ZmZlckRpck1hcCA9IG5ldyBXZWFrTWFwKClcbiAgICB0aGlzLmJhY2tlbmQgPSBuZXcgTWFwKClcbiAgICB0aGlzLmNhcHMgPSBuZXcgUHJvbWlzZSgocmVzb2x2ZSkgPT4gdGhpcy5yZXNvbHZlQ2Fwc1Byb21pc2UgPSByZXNvbHZlKVxuXG4gICAgaWYgKHByb2Nlc3MuZW52LkdIQ19QQUNLQUdFX1BBVEggJiYgIWF0b20uY29uZmlnLmdldCgnaGFza2VsbC1naGMtbW9kLnN1cHByZXNzR2hjUGFja2FnZVBhdGhXYXJuaW5nJykpIHtcbiAgICAgIFV0aWwud2FybkdIQ1BhY2thZ2VQYXRoKClcbiAgICB9XG5cbiAgICB0aGlzLmNyZWF0ZVF1ZXVlcygpXG4gIH1cblxuICBwdWJsaWMgYXN5bmMgZ2V0Um9vdERpcihidWZmZXI6IEF0b21UeXBlcy5UZXh0QnVmZmVyKTogUHJvbWlzZTxBdG9tVHlwZXMuRGlyZWN0b3J5PiB7XG4gICAgbGV0IGRpclxuICAgIGRpciA9IHRoaXMuYnVmZmVyRGlyTWFwLmdldChidWZmZXIpXG4gICAgaWYgKGRpcikge1xuICAgICAgcmV0dXJuIGRpclxuICAgIH1cbiAgICBkaXIgPSBhd2FpdCBVdGlsLmdldFJvb3REaXIoYnVmZmVyKVxuICAgIHRoaXMuYnVmZmVyRGlyTWFwLnNldChidWZmZXIsIGRpcilcbiAgICByZXR1cm4gZGlyXG4gIH1cblxuICBwdWJsaWMga2lsbFByb2Nlc3MoKSB7XG4gICAgZm9yIChjb25zdCBicCBvZiB0aGlzLmJhY2tlbmQudmFsdWVzKCkpIHtcbiAgICAgIGJwLnRoZW4oKGIpID0+IGIua2lsbFByb2Nlc3MoKSlcbiAgICB9XG4gICAgdGhpcy5iYWNrZW5kLmNsZWFyKClcbiAgfVxuXG4gIHB1YmxpYyBkZXN0cm95KCkge1xuICAgIGZvciAoY29uc3QgYnAgb2YgdGhpcy5iYWNrZW5kLnZhbHVlcygpKSB7XG4gICAgICBicC50aGVuKChiKSA9PiBiLmRlc3Ryb3koKSlcbiAgICB9XG4gICAgdGhpcy5iYWNrZW5kLmNsZWFyKClcbiAgICB0aGlzLmVtaXR0ZXIuZW1pdCgnZGlkLWRlc3Ryb3knLCB1bmRlZmluZWQpXG4gICAgdGhpcy5kaXNwb3NhYmxlcy5kaXNwb3NlKClcbiAgfVxuXG4gIHB1YmxpYyBvbkRpZERlc3Ryb3koY2FsbGJhY2s6ICgpID0+IHZvaWQpIHtcbiAgICByZXR1cm4gdGhpcy5lbWl0dGVyLm9uKCdkaWQtZGVzdHJveScsIGNhbGxiYWNrKVxuICB9XG5cbiAgcHVibGljIG9uV2FybmluZyhjYWxsYmFjazogKHdhcm5pbmc6IHN0cmluZykgPT4gdm9pZCkge1xuICAgIHJldHVybiB0aGlzLmVtaXR0ZXIub24oJ3dhcm5pbmcnLCBjYWxsYmFjaylcbiAgfVxuXG4gIHB1YmxpYyBvbkVycm9yKGNhbGxiYWNrOiAoZXJyb3I6IElFcnJvckNhbGxiYWNrQXJncykgPT4gdm9pZCkge1xuICAgIHJldHVybiB0aGlzLmVtaXR0ZXIub24oJ2Vycm9yJywgY2FsbGJhY2spXG4gIH1cblxuICBwdWJsaWMgb25CYWNrZW5kQWN0aXZlKGNhbGxiYWNrOiAoKSA9PiB2b2lkKSB7XG4gICAgcmV0dXJuIHRoaXMuZW1pdHRlci5vbignYmFja2VuZC1hY3RpdmUnLCBjYWxsYmFjaylcbiAgfVxuXG4gIHB1YmxpYyBvbkJhY2tlbmRJZGxlKGNhbGxiYWNrOiAoKSA9PiB2b2lkKSB7XG4gICAgcmV0dXJuIHRoaXMuZW1pdHRlci5vbignYmFja2VuZC1pZGxlJywgY2FsbGJhY2spXG4gIH1cblxuICBwdWJsaWMgb25RdWV1ZUlkbGUoY2FsbGJhY2s6ICgpID0+IHZvaWQpIHtcbiAgICByZXR1cm4gdGhpcy5lbWl0dGVyLm9uKCdxdWV1ZS1pZGxlJywgY2FsbGJhY2spXG4gIH1cblxuICBwdWJsaWMgYXN5bmMgcnVuTGlzdChidWZmZXI6IEF0b21UeXBlcy5UZXh0QnVmZmVyKSB7XG4gICAgcmV0dXJuIHRoaXMucXVldWVDbWQoJ2xpc3QnLCBhd2FpdCB0aGlzLmdldFJvb3REaXIoYnVmZmVyKSwgeyBjb21tYW5kOiAnbGlzdCcgfSlcbiAgfVxuXG4gIHB1YmxpYyBhc3luYyBydW5MYW5nKGRpcjogQXRvbVR5cGVzLkRpcmVjdG9yeSkge1xuICAgIHJldHVybiB0aGlzLnF1ZXVlQ21kKCdpbml0JywgZGlyLCB7IGNvbW1hbmQ6ICdsYW5nJyB9KVxuICB9XG5cbiAgcHVibGljIGFzeW5jIHJ1bkZsYWcoZGlyOiBBdG9tVHlwZXMuRGlyZWN0b3J5KSB7XG4gICAgcmV0dXJuIHRoaXMucXVldWVDbWQoJ2luaXQnLCBkaXIsIHsgY29tbWFuZDogJ2ZsYWcnIH0pXG4gIH1cblxuICBwdWJsaWMgYXN5bmMgcnVuQnJvd3NlKHJvb3REaXI6IEF0b21UeXBlcy5EaXJlY3RvcnksIG1vZHVsZXM6IHN0cmluZ1tdKTogUHJvbWlzZTxTeW1ib2xEZXNjW10+IHtcbiAgICBjb25zdCBjYXBzID0gYXdhaXQgdGhpcy5yZXNvbHZlQ2Fwcyhyb290RGlyKVxuICAgIGlmIChjYXBzLmJyb3dzZU1haW4gPT09IGZhbHNlKSB7XG4gICAgICBtb2R1bGVzID0gbW9kdWxlcy5maWx0ZXIoKHYpID0+IHYgIT09ICdNYWluJylcbiAgICB9XG4gICAgaWYgKG1vZHVsZXMubGVuZ3RoID09PSAwKSB7IHJldHVybiBbXSB9XG4gICAgY29uc3QgbGluZXMgPSBhd2FpdCB0aGlzLnF1ZXVlQ21kKCdicm93c2UnLCByb290RGlyLCB7XG4gICAgICBjb21tYW5kOiAnYnJvd3NlJyxcbiAgICAgIGRhc2hBcmdzOiBjYXBzLmJyb3dzZVBhcmVudHMgPyBbJy1kJywgJy1vJywgJy1wJ10gOiBbJy1kJywgJy1vJ10sXG4gICAgICBhcmdzOiBtb2R1bGVzLFxuICAgIH0pXG4gICAgcmV0dXJuIGxpbmVzLm1hcCgocykgPT4ge1xuICAgICAgLy8gZW51bUZyb20gOjogRW51bSBhID0+IGEgLT4gW2FdIC0tIGZyb206RW51bVxuICAgICAgY29uc3QgcGF0dGVybiA9IGNhcHMuYnJvd3NlUGFyZW50cyA/IC9eKC4qPykgOjogKC4qPykoPzogLS0gZnJvbTooLiopKT8kLyA6IC9eKC4qPykgOjogKC4qKSQvXG4gICAgICBjb25zdCBtYXRjaCA9IHMubWF0Y2gocGF0dGVybilcbiAgICAgIGxldCBuYW1lOiBzdHJpbmdcbiAgICAgIGxldCB0eXBlU2lnbmF0dXJlOiBzdHJpbmcgfCB1bmRlZmluZWRcbiAgICAgIGxldCBwYXJlbnQ6IHN0cmluZyB8IHVuZGVmaW5lZFxuICAgICAgaWYgKG1hdGNoKSB7XG4gICAgICAgIG5hbWUgPSBtYXRjaFsxXVxuICAgICAgICB0eXBlU2lnbmF0dXJlID0gbWF0Y2hbMl1cbiAgICAgICAgcGFyZW50ID0gbWF0Y2hbM11cbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIG5hbWUgPSBzXG4gICAgICB9XG4gICAgICBsZXQgc3ltYm9sVHlwZTogVVBJLkNvbXBsZXRpb25CYWNrZW5kLlN5bWJvbFR5cGVcbiAgICAgIGlmICh0eXBlU2lnbmF0dXJlICYmIC9eKD86dHlwZXxkYXRhfG5ld3R5cGUpLy50ZXN0KHR5cGVTaWduYXR1cmUpKSB7XG4gICAgICAgIHN5bWJvbFR5cGUgPSAndHlwZSdcbiAgICAgIH0gZWxzZSBpZiAodHlwZVNpZ25hdHVyZSAmJiAvXig/OmNsYXNzKS8udGVzdCh0eXBlU2lnbmF0dXJlKSkge1xuICAgICAgICBzeW1ib2xUeXBlID0gJ2NsYXNzJ1xuICAgICAgfSBlbHNlIGlmICgvXlxcKC4qXFwpJC8udGVzdChuYW1lKSkge1xuICAgICAgICBzeW1ib2xUeXBlID0gJ29wZXJhdG9yJ1xuICAgICAgICBuYW1lID0gbmFtZS5zbGljZSgxLCAtMSlcbiAgICAgIH0gZWxzZSBpZiAoVXRpbC5pc1VwcGVyQ2FzZShuYW1lWzBdKSkge1xuICAgICAgICBzeW1ib2xUeXBlID0gJ3RhZydcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHN5bWJvbFR5cGUgPSAnZnVuY3Rpb24nXG4gICAgICB9XG4gICAgICByZXR1cm4geyBuYW1lLCB0eXBlU2lnbmF0dXJlLCBzeW1ib2xUeXBlLCBwYXJlbnQgfVxuICAgIH0pXG4gIH1cblxuICBwdWJsaWMgYXN5bmMgZ2V0VHlwZUluQnVmZmVyKFxuICAgIGJ1ZmZlcjogQXRvbVR5cGVzLlRleHRCdWZmZXIsIGNyYW5nZTogQXRvbVR5cGVzLlJhbmdlLFxuICApIHtcbiAgICBpZiAoIWJ1ZmZlci5nZXRVcmkoKSkgeyB0aHJvdyBuZXcgRXJyb3IoJ05vIFVSSSBmb3IgYnVmZmVyJykgfVxuICAgIGNyYW5nZSA9IFV0aWwudGFiU2hpZnRGb3JSYW5nZShidWZmZXIsIGNyYW5nZSlcbiAgICBjb25zdCByb290RGlyID0gYXdhaXQgdGhpcy5nZXRSb290RGlyKGJ1ZmZlcilcbiAgICBjb25zdCBjYXBzID0gYXdhaXQgdGhpcy5yZXNvbHZlQ2Fwcyhyb290RGlyKVxuICAgIGNvbnN0IGxpbmVzID0gYXdhaXQgdGhpcy5xdWV1ZUNtZCgndHlwZWluZm8nLCByb290RGlyLCB7XG4gICAgICBpbnRlcmFjdGl2ZTogdHJ1ZSxcbiAgICAgIGNvbW1hbmQ6ICd0eXBlJyxcbiAgICAgIHVyaTogYnVmZmVyLmdldFVyaSgpLFxuICAgICAgdGV4dDogYnVmZmVyLmlzTW9kaWZpZWQoKSA/IGJ1ZmZlci5nZXRUZXh0KCkgOiB1bmRlZmluZWQsXG4gICAgICBkYXNoQXJnczogY2Fwcy50eXBlQ29uc3RyYWludHMgPyBbJy1jJ10gOiBbXSxcbiAgICAgIGFyZ3M6IFtjcmFuZ2Uuc3RhcnQucm93ICsgMSwgY3JhbmdlLnN0YXJ0LmNvbHVtbiArIDFdLm1hcCgodikgPT4gdi50b1N0cmluZygpKSxcbiAgICB9KVxuXG4gICAgY29uc3QgcnggPSAvXihcXGQrKVxccysoXFxkKylcXHMrKFxcZCspXFxzKyhcXGQrKVxccytcIihbXl0qKVwiJC8gLy8gW15dIGJhc2ljYWxseSBtZWFucyBcImFueXRoaW5nXCIsIGluY2wuIG5ld2xpbmVzXG4gICAgZm9yIChjb25zdCBsaW5lIG9mIGxpbmVzKSB7XG4gICAgICBjb25zdCBtYXRjaCA9IGxpbmUubWF0Y2gocngpXG4gICAgICBpZiAoIW1hdGNoKSB7IGNvbnRpbnVlIH1cbiAgICAgIGNvbnN0IFtyb3dzdGFydCwgY29sc3RhcnQsIHJvd2VuZCwgY29sZW5kLCB0eXBlXSA9IG1hdGNoLnNsaWNlKDEpXG4gICAgICBjb25zdCByYW5nZSA9XG4gICAgICAgIFJhbmdlLmZyb21PYmplY3QoW1xuICAgICAgICAgIFtwYXJzZUludChyb3dzdGFydCwgMTApIC0gMSwgcGFyc2VJbnQoY29sc3RhcnQsIDEwKSAtIDFdLFxuICAgICAgICAgIFtwYXJzZUludChyb3dlbmQsIDEwKSAtIDEsIHBhcnNlSW50KGNvbGVuZCwgMTApIC0gMV0sXG4gICAgICAgIF0pXG4gICAgICBpZiAocmFuZ2UuaXNFbXB0eSgpKSB7IGNvbnRpbnVlIH1cbiAgICAgIGlmICghcmFuZ2UuY29udGFpbnNSYW5nZShjcmFuZ2UpKSB7IGNvbnRpbnVlIH1cbiAgICAgIHJldHVybiB7XG4gICAgICAgIHJhbmdlOiBVdGlsLnRhYlVuc2hpZnRGb3JSYW5nZShidWZmZXIsIHJhbmdlKSxcbiAgICAgICAgdHlwZTogdHlwZS5yZXBsYWNlKC9cXFxcXCIvZywgJ1wiJyksXG4gICAgICB9XG4gICAgfVxuICAgIHRocm93IG5ldyBFcnJvcignTm8gdHlwZScpXG4gIH1cblxuICBwdWJsaWMgYXN5bmMgZG9DYXNlU3BsaXQoYnVmZmVyOiBBdG9tVHlwZXMuVGV4dEJ1ZmZlciwgY3JhbmdlOiBBdG9tVHlwZXMuUmFuZ2UpIHtcbiAgICBpZiAoIWJ1ZmZlci5nZXRVcmkoKSkgeyB0aHJvdyBuZXcgRXJyb3IoJ05vIFVSSSBmb3IgYnVmZmVyJykgfVxuICAgIGNyYW5nZSA9IFV0aWwudGFiU2hpZnRGb3JSYW5nZShidWZmZXIsIGNyYW5nZSlcbiAgICBjb25zdCByb290RGlyID0gYXdhaXQgdGhpcy5nZXRSb290RGlyKGJ1ZmZlcilcbiAgICBjb25zdCBjYXBzID0gYXdhaXQgdGhpcy5yZXNvbHZlQ2Fwcyhyb290RGlyKVxuICAgIGNvbnN0IGxpbmVzID0gYXdhaXQgdGhpcy5xdWV1ZUNtZCgndHlwZWluZm8nLCByb290RGlyLCB7XG4gICAgICBpbnRlcmFjdGl2ZTogY2Fwcy5pbnRlcmFjdGl2ZUNhc2VTcGxpdCxcbiAgICAgIGNvbW1hbmQ6ICdzcGxpdCcsXG4gICAgICB1cmk6IGJ1ZmZlci5nZXRVcmkoKSxcbiAgICAgIHRleHQ6IGJ1ZmZlci5pc01vZGlmaWVkKCkgPyBidWZmZXIuZ2V0VGV4dCgpIDogdW5kZWZpbmVkLFxuICAgICAgYXJnczogW2NyYW5nZS5zdGFydC5yb3cgKyAxLCBjcmFuZ2Uuc3RhcnQuY29sdW1uICsgMV0ubWFwKCh2KSA9PiB2LnRvU3RyaW5nKCkpLFxuICAgIH0pXG5cbiAgICBjb25zdCByeCA9IC9eKFxcZCspXFxzKyhcXGQrKVxccysoXFxkKylcXHMrKFxcZCspXFxzK1wiKFteXSopXCIkLyAvLyBbXl0gYmFzaWNhbGx5IG1lYW5zIFwiYW55dGhpbmdcIiwgaW5jbC4gbmV3bGluZXNcbiAgICBjb25zdCByZXMgPSBbXVxuICAgIGZvciAoY29uc3QgbGluZSBvZiBsaW5lcykge1xuICAgICAgY29uc3QgbWF0Y2ggPSBsaW5lLm1hdGNoKHJ4KVxuICAgICAgaWYgKCFtYXRjaCkge1xuICAgICAgICBVdGlsLndhcm4oYGdoYy1tb2Qgc2F5czogJHtsaW5lfWApXG4gICAgICAgIGNvbnRpbnVlXG4gICAgICB9XG4gICAgICBjb25zdCBbcm93c3RhcnQsIGNvbHN0YXJ0LCByb3dlbmQsIGNvbGVuZCwgdGV4dF0gPSBtYXRjaC5zbGljZSgxKVxuICAgICAgcmVzLnB1c2goe1xuICAgICAgICByYW5nZTpcbiAgICAgICAgUmFuZ2UuZnJvbU9iamVjdChbXG4gICAgICAgICAgW3BhcnNlSW50KHJvd3N0YXJ0LCAxMCkgLSAxLCBwYXJzZUludChjb2xzdGFydCwgMTApIC0gMV0sXG4gICAgICAgICAgW3BhcnNlSW50KHJvd2VuZCwgMTApIC0gMSwgcGFyc2VJbnQoY29sZW5kLCAxMCkgLSAxXSxcbiAgICAgICAgXSksXG4gICAgICAgIHJlcGxhY2VtZW50OiB0ZXh0LFxuICAgICAgfSlcbiAgICB9XG4gICAgcmV0dXJuIHJlc1xuICB9XG5cbiAgcHVibGljIGFzeW5jIGRvU2lnRmlsbChidWZmZXI6IEF0b21UeXBlcy5UZXh0QnVmZmVyLCBjcmFuZ2U6IEF0b21UeXBlcy5SYW5nZSkge1xuICAgIGlmICghYnVmZmVyLmdldFVyaSgpKSB7IHRocm93IG5ldyBFcnJvcignTm8gVVJJIGZvciBidWZmZXInKSB9XG4gICAgY3JhbmdlID0gVXRpbC50YWJTaGlmdEZvclJhbmdlKGJ1ZmZlciwgY3JhbmdlKVxuICAgIGNvbnN0IHJvb3REaXIgPSBhd2FpdCB0aGlzLmdldFJvb3REaXIoYnVmZmVyKVxuICAgIGNvbnN0IGNhcHMgPSBhd2FpdCB0aGlzLnJlc29sdmVDYXBzKHJvb3REaXIpXG4gICAgY29uc3QgbGluZXMgPSBhd2FpdCB0aGlzLnF1ZXVlQ21kKCd0eXBlaW5mbycsIHJvb3REaXIsIHtcbiAgICAgIGludGVyYWN0aXZlOiBjYXBzLmludGVyYWN0aXZlQ2FzZVNwbGl0LFxuICAgICAgY29tbWFuZDogJ3NpZycsXG4gICAgICB1cmk6IGJ1ZmZlci5nZXRVcmkoKSxcbiAgICAgIHRleHQ6IGJ1ZmZlci5pc01vZGlmaWVkKCkgPyBidWZmZXIuZ2V0VGV4dCgpIDogdW5kZWZpbmVkLFxuICAgICAgYXJnczogW2NyYW5nZS5zdGFydC5yb3cgKyAxLCBjcmFuZ2Uuc3RhcnQuY29sdW1uICsgMV0ubWFwKCh2KSA9PiB2LnRvU3RyaW5nKCkpLFxuICAgIH0pXG4gICAgaWYgKGxpbmVzLmxlbmd0aCA8IDIpIHsgdGhyb3cgbmV3IEVycm9yKGBDb3VsZCBub3QgdW5kZXJzdGFuZCByZXNwb25zZTogJHtsaW5lcy5qb2luKCdcXG4nKX1gKSB9XG4gICAgY29uc3QgcnggPSAvXihcXGQrKVxccysoXFxkKylcXHMrKFxcZCspXFxzKyhcXGQrKSQvIC8vIHBvc2l0aW9uIHJ4XG4gICAgY29uc3QgbWF0Y2ggPSBsaW5lc1sxXS5tYXRjaChyeClcbiAgICBpZiAoIW1hdGNoKSB7IHRocm93IG5ldyBFcnJvcihgQ291bGQgbm90IHVuZGVyc3RhbmQgcmVzcG9uc2U6ICR7bGluZXMuam9pbignXFxuJyl9YCkgfVxuICAgIGNvbnN0IFtyb3dzdGFydCwgY29sc3RhcnQsIHJvd2VuZCwgY29sZW5kXSA9IG1hdGNoLnNsaWNlKDEpXG4gICAgY29uc3QgcmFuZ2UgPVxuICAgICAgUmFuZ2UuZnJvbU9iamVjdChbXG4gICAgICAgIFtwYXJzZUludChyb3dzdGFydCwgMTApIC0gMSwgcGFyc2VJbnQoY29sc3RhcnQsIDEwKSAtIDFdLFxuICAgICAgICBbcGFyc2VJbnQocm93ZW5kLCAxMCkgLSAxLCBwYXJzZUludChjb2xlbmQsIDEwKSAtIDFdLFxuICAgICAgXSlcbiAgICByZXR1cm4ge1xuICAgICAgdHlwZTogbGluZXNbMF0sXG4gICAgICByYW5nZSxcbiAgICAgIGJvZHk6IGxpbmVzLnNsaWNlKDIpLmpvaW4oJ1xcbicpLFxuICAgIH1cbiAgfVxuXG4gIHB1YmxpYyBhc3luYyBnZXRJbmZvSW5CdWZmZXIoZWRpdG9yOiBBdG9tVHlwZXMuVGV4dEVkaXRvciwgY3JhbmdlOiBBdG9tVHlwZXMuUmFuZ2UpIHtcbiAgICBjb25zdCBidWZmZXIgPSBlZGl0b3IuZ2V0QnVmZmVyKClcbiAgICBpZiAoIWJ1ZmZlci5nZXRVcmkoKSkgeyB0aHJvdyBuZXcgRXJyb3IoJ05vIFVSSSBmb3IgYnVmZmVyJykgfVxuICAgIGNvbnN0IHN5bUluZm8gPSBVdGlsLmdldFN5bWJvbEluUmFuZ2UoZWRpdG9yLCBjcmFuZ2UpXG4gICAgaWYgKCFzeW1JbmZvKSB7IHRocm93IG5ldyBFcnJvcignQ291bGRuXFwndCBnZXQgc3ltYm9sIGZvciBpbmZvJykgfVxuICAgIGNvbnN0IHsgc3ltYm9sLCByYW5nZSB9ID0gc3ltSW5mb1xuXG4gICAgY29uc3QgbGluZXMgPSBhd2FpdCB0aGlzLnF1ZXVlQ21kKCd0eXBlaW5mbycsIGF3YWl0IHRoaXMuZ2V0Um9vdERpcihidWZmZXIpLCB7XG4gICAgICBpbnRlcmFjdGl2ZTogdHJ1ZSxcbiAgICAgIGNvbW1hbmQ6ICdpbmZvJyxcbiAgICAgIHVyaTogYnVmZmVyLmdldFVyaSgpLFxuICAgICAgdGV4dDogYnVmZmVyLmlzTW9kaWZpZWQoKSA/IGJ1ZmZlci5nZXRUZXh0KCkgOiB1bmRlZmluZWQsXG4gICAgICBhcmdzOiBbc3ltYm9sXSxcbiAgICB9KVxuXG4gICAgY29uc3QgaW5mbyA9IGxpbmVzLmpvaW4oJ1xcbicpXG4gICAgaWYgKChpbmZvID09PSAnQ2Fubm90IHNob3cgaW5mbycpIHx8ICFpbmZvKSB7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoJ05vIGluZm8nKVxuICAgIH0gZWxzZSB7XG4gICAgICByZXR1cm4geyByYW5nZSwgaW5mbyB9XG4gICAgfVxuICB9XG5cbiAgcHVibGljIGFzeW5jIGZpbmRTeW1ib2xQcm92aWRlcnNJbkJ1ZmZlcihlZGl0b3I6IEF0b21UeXBlcy5UZXh0RWRpdG9yLCBjcmFuZ2U6IEF0b21UeXBlcy5SYW5nZSkge1xuICAgIGNvbnN0IGJ1ZmZlciA9IGVkaXRvci5nZXRCdWZmZXIoKVxuICAgIGNvbnN0IHN5bUluZm8gPSBVdGlsLmdldFN5bWJvbEluUmFuZ2UoZWRpdG9yLCBjcmFuZ2UpXG4gICAgaWYgKCFzeW1JbmZvKSB7IHRocm93IG5ldyBFcnJvcignQ291bGRuXFwndCBnZXQgc3ltYm9sIGZvciBpbXBvcnQnKSB9XG4gICAgY29uc3QgeyBzeW1ib2wgfSA9IHN5bUluZm9cblxuICAgIHJldHVybiB0aGlzLnF1ZXVlQ21kKCdmaW5kJywgYXdhaXQgdGhpcy5nZXRSb290RGlyKGJ1ZmZlciksIHtcbiAgICAgIGludGVyYWN0aXZlOiB0cnVlLFxuICAgICAgY29tbWFuZDogJ2ZpbmQnLFxuICAgICAgYXJnczogW3N5bWJvbF0sXG4gICAgfSlcbiAgfVxuXG4gIHB1YmxpYyBhc3luYyBkb0NoZWNrQnVmZmVyKGJ1ZmZlcjogQXRvbVR5cGVzLlRleHRCdWZmZXIsIGZhc3Q6IGJvb2xlYW4pIHtcbiAgICByZXR1cm4gdGhpcy5kb0NoZWNrT3JMaW50QnVmZmVyKCdjaGVjaycsIGJ1ZmZlciwgZmFzdClcbiAgfVxuXG4gIHB1YmxpYyBhc3luYyBkb0xpbnRCdWZmZXIoYnVmZmVyOiBBdG9tVHlwZXMuVGV4dEJ1ZmZlcikge1xuICAgIHJldHVybiB0aGlzLmRvQ2hlY2tPckxpbnRCdWZmZXIoJ2xpbnQnLCBidWZmZXIsIGZhbHNlKVxuICB9XG5cbiAgcHVibGljIGFzeW5jIGRvQ2hlY2tBbmRMaW50KGJ1ZmZlcjogQXRvbVR5cGVzLlRleHRCdWZmZXIsIGZhc3Q6IGJvb2xlYW4pIHtcbiAgICBjb25zdCBbY3IsIGxyXSA9IGF3YWl0IFByb21pc2UuYWxsKFt0aGlzLmRvQ2hlY2tCdWZmZXIoYnVmZmVyLCBmYXN0KSwgdGhpcy5kb0xpbnRCdWZmZXIoYnVmZmVyKV0pXG4gICAgcmV0dXJuIGNyLmNvbmNhdChscilcbiAgfVxuXG4gIHByaXZhdGUgYXN5bmMgaW5pdEJhY2tlbmQocm9vdERpcjogQXRvbVR5cGVzLkRpcmVjdG9yeSk6IFByb21pc2U8R2hjTW9kaVByb2Nlc3NSZWFsPiB7XG4gICAgY29uc3Qgcm9vdFBhdGggPSByb290RGlyLmdldFBhdGgoKVxuICAgIGNvbnN0IGNhY2hlZCA9IHRoaXMuYmFja2VuZC5nZXQocm9vdFBhdGgpXG4gICAgaWYgKGNhY2hlZCkgeyByZXR1cm4gYXdhaXQgY2FjaGVkIH1cbiAgICBjb25zdCBuZXdCYWNrZW5kID0gdGhpcy5pbml0QmFja2VuZFJlYWwocm9vdERpcilcbiAgICB0aGlzLmJhY2tlbmQuc2V0KHJvb3RQYXRoLCBuZXdCYWNrZW5kKVxuICAgIHJldHVybiBhd2FpdCBuZXdCYWNrZW5kXG4gIH1cblxuICBwcml2YXRlIGFzeW5jIGluaXRCYWNrZW5kUmVhbChyb290RGlyOiBBdG9tVHlwZXMuRGlyZWN0b3J5KTogUHJvbWlzZTxHaGNNb2RpUHJvY2Vzc1JlYWw+IHtcbiAgICBsZXQgb3B0c1xuICAgIGxldCB2ZXJzXG4gICAgbGV0IGNhcHNcbiAgICB0cnkge1xuICAgICAgb3B0cyA9IGF3YWl0IFV0aWwuZ2V0UHJvY2Vzc09wdGlvbnMocm9vdERpci5nZXRQYXRoKCkpXG4gICAgICBjb25zdCB2ZXJzUCA9IHRoaXMuZ2V0VmVyc2lvbihvcHRzKVxuICAgICAgY29uc3QgYm9wdHMgPSBvcHRzXG4gICAgICB2ZXJzUC50aGVuKCh2KSA9PiB7IHRoaXMuY2hlY2tDb21wKGJvcHRzLCB2KSB9KVxuICAgICAgdmVycyA9IGF3YWl0IHZlcnNQXG4gICAgICBjYXBzID0gdGhpcy5nZXRDYXBzKHZlcnMpXG4gICAgICB0aGlzLnJlc29sdmVDYXBzUHJvbWlzZShjYXBzKVxuICAgICAgY29uc3QgYmFja2VuZCA9IG5ldyBHaGNNb2RpUHJvY2Vzc1JlYWwoYXdhaXQgdGhpcy5yZXNvbHZlQ2Fwcyhyb290RGlyKSwgcm9vdERpciwgb3B0cylcbiAgICAgIHRoaXMuZGlzcG9zYWJsZXMuYWRkKFxuICAgICAgICBiYWNrZW5kLm9uRXJyb3IoKGFyZykgPT4gdGhpcy5lbWl0dGVyLmVtaXQoJ2Vycm9yJywgYXJnKSksXG4gICAgICAgIGJhY2tlbmQub25XYXJuaW5nKChhcmcpID0+IHRoaXMuZW1pdHRlci5lbWl0KCd3YXJuaW5nJywgYXJnKSksXG4gICAgICApXG4gICAgICByZXR1cm4gYmFja2VuZFxuICAgIH0gY2F0Y2ggKGVycikge1xuICAgICAgVXRpbC5ub3RpZnlTcGF3bkZhaWwoeyBkaXI6IHJvb3REaXIuZ2V0UGF0aCgpLCBlcnIsIG9wdHMsIHZlcnMsIGNhcHMgfSlcbiAgICAgIHRocm93IGVyclxuICAgIH1cbiAgfVxuXG4gIHByaXZhdGUgY3JlYXRlUXVldWVzKCkge1xuICAgIHRoaXMuY29tbWFuZFF1ZXVlcyA9IHtcbiAgICAgIGNoZWNrbGludDogbmV3IFF1ZXVlKDIpLFxuICAgICAgYnJvd3NlOiBuZXcgUXVldWUoYXRvbS5jb25maWcuZ2V0KCdoYXNrZWxsLWdoYy1tb2QubWF4QnJvd3NlUHJvY2Vzc2VzJykpLFxuICAgICAgdHlwZWluZm86IG5ldyBRdWV1ZSgxKSxcbiAgICAgIGZpbmQ6IG5ldyBRdWV1ZSgxKSxcbiAgICAgIGluaXQ6IG5ldyBRdWV1ZSg0KSxcbiAgICAgIGxpc3Q6IG5ldyBRdWV1ZSgxKSxcbiAgICAgIGxvd21lbTogbmV3IFF1ZXVlKDEpLFxuICAgIH1cbiAgICB0aGlzLmRpc3Bvc2FibGVzLmFkZChhdG9tLmNvbmZpZy5vbkRpZENoYW5nZSgnaGFza2VsbC1naGMtbW9kLm1heEJyb3dzZVByb2Nlc3NlcycsICh7IG5ld1ZhbHVlIH0pID0+XG4gICAgICB0aGlzLmNvbW1hbmRRdWV1ZXMuYnJvd3NlID0gbmV3IFF1ZXVlKG5ld1ZhbHVlIGFzIG51bWJlcikpLFxuICAgIClcbiAgfVxuXG4gIHByaXZhdGUgYXN5bmMgZ2V0VmVyc2lvbihvcHRzOiBVdGlsLkV4ZWNPcHRzKSB7XG4gICAgY29uc3QgdGltZW91dCA9IGF0b20uY29uZmlnLmdldCgnaGFza2VsbC1naGMtbW9kLmluaXRUaW1lb3V0JykgKiAxMDAwXG4gICAgY29uc3QgY21kID0gYXRvbS5jb25maWcuZ2V0KCdoYXNrZWxsLWdoYy1tb2QuZ2hjTW9kUGF0aCcpXG4gICAgY29uc3QgeyBzdGRvdXQgfSA9IGF3YWl0IFV0aWwuZXhlY1Byb21pc2UoY21kLCBbJ3ZlcnNpb24nXSwgeyB0aW1lb3V0LCAuLi5vcHRzIH0pXG4gICAgY29uc3QgdmVyc1JhdyA9IC9eZ2hjLW1vZCB2ZXJzaW9uIChcXGQrKVxcLihcXGQrKVxcLihcXGQrKSg/OlxcLihcXGQrKSk/Ly5leGVjKHN0ZG91dClcbiAgICBpZiAoIXZlcnNSYXcpIHsgdGhyb3cgbmV3IEVycm9yKFwiQ291bGRuJ3QgZ2V0IGdoYy1tb2QgdmVyc2lvblwiKSB9XG4gICAgY29uc3QgdmVycyA9IHZlcnNSYXcuc2xpY2UoMSwgNSkubWFwKChpKSA9PiBwYXJzZUludChpLCAxMCkpXG4gICAgY29uc3QgY29tcFJhdyA9IC9HSEMgKC4rKSQvLmV4ZWMoc3Rkb3V0LnRyaW0oKSlcbiAgICBpZiAoIWNvbXBSYXcpIHsgdGhyb3cgbmV3IEVycm9yKFwiQ291bGRuJ3QgZ2V0IGdoYyB2ZXJzaW9uXCIpIH1cbiAgICBjb25zdCBjb21wID0gY29tcFJhd1sxXVxuICAgIFV0aWwuZGVidWcoYEdoYy1tb2QgJHt2ZXJzfSBidWlsdCB3aXRoICR7Y29tcH1gKVxuICAgIHJldHVybiB7IHZlcnMsIGNvbXAgfVxuICB9XG5cbiAgcHJpdmF0ZSBhc3luYyBjaGVja0NvbXAob3B0czogVXRpbC5FeGVjT3B0cywgeyBjb21wIH06IHsgY29tcDogc3RyaW5nIH0pIHtcbiAgICBjb25zdCB0aW1lb3V0ID0gYXRvbS5jb25maWcuZ2V0KCdoYXNrZWxsLWdoYy1tb2QuaW5pdFRpbWVvdXQnKSAqIDEwMDBcbiAgICBjb25zdCB0cnlXYXJuID0gYXN5bmMgKGNtZDogc3RyaW5nLCBhcmdzOiBzdHJpbmdbXSkgPT4ge1xuICAgICAgdHJ5IHtcbiAgICAgICAgcmV0dXJuIChhd2FpdCBVdGlsLmV4ZWNQcm9taXNlKGNtZCwgYXJncywgeyB0aW1lb3V0LCAuLi5vcHRzIH0pKS5zdGRvdXQudHJpbSgpXG4gICAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgICBVdGlsLndhcm4oZXJyb3IpXG4gICAgICB9XG4gICAgfVxuICAgIGNvbnN0IFtzdGFja2doYywgcGF0aGdoY10gPSBhd2FpdCBQcm9taXNlLmFsbChbXG4gICAgICB0cnlXYXJuKCdzdGFjaycsIFsnZ2hjJywgJy0tJywgJy0tbnVtZXJpYy12ZXJzaW9uJ10pLFxuICAgICAgdHJ5V2FybignZ2hjJywgWyctLW51bWVyaWMtdmVyc2lvbiddKSxcbiAgICBdKVxuICAgIFV0aWwuZGVidWcoYFN0YWNrIEdIQyB2ZXJzaW9uICR7c3RhY2tnaGN9YClcbiAgICBVdGlsLmRlYnVnKGBQYXRoIEdIQyB2ZXJzaW9uICR7cGF0aGdoY31gKVxuICAgIGlmIChzdGFja2doYyAmJiAoc3RhY2tnaGMgIT09IGNvbXApKSB7XG4gICAgICBjb25zdCB3YXJuID0gYFxcXG5HSEMgdmVyc2lvbiBpbiB5b3VyIFN0YWNrICcke3N0YWNrZ2hjfScgZG9lc24ndCBtYXRjaCB3aXRoIFxcXG5HSEMgdmVyc2lvbiB1c2VkIHRvIGJ1aWxkIGdoYy1tb2QgJyR7Y29tcH0nLiBUaGlzIGNhbiBsZWFkIHRvIFxcXG5wcm9ibGVtcyB3aGVuIHVzaW5nIFN0YWNrIHByb2plY3RzYFxuICAgICAgYXRvbS5ub3RpZmljYXRpb25zLmFkZFdhcm5pbmcod2FybilcbiAgICAgIFV0aWwud2Fybih3YXJuKVxuICAgIH1cbiAgICBpZiAocGF0aGdoYyAmJiAocGF0aGdoYyAhPT0gY29tcCkpIHtcbiAgICAgIGNvbnN0IHdhcm4gPSBgXFxcbkdIQyB2ZXJzaW9uIGluIHlvdXIgUEFUSCAnJHtwYXRoZ2hjfScgZG9lc24ndCBtYXRjaCB3aXRoIFxcXG5HSEMgdmVyc2lvbiB1c2VkIHRvIGJ1aWxkIGdoYy1tb2QgJyR7Y29tcH0nLiBUaGlzIGNhbiBsZWFkIHRvIFxcXG5wcm9ibGVtcyB3aGVuIHVzaW5nIENhYmFsIG9yIFBsYWluIHByb2plY3RzYFxuICAgICAgYXRvbS5ub3RpZmljYXRpb25zLmFkZFdhcm5pbmcod2FybilcbiAgICAgIFV0aWwud2Fybih3YXJuKVxuICAgIH1cbiAgfVxuXG4gIHByaXZhdGUgYXN5bmMgcmVzb2x2ZUNhcHMocm9vdERpcjogQXRvbVR5cGVzLkRpcmVjdG9yeSk6IFByb21pc2U8R0hDTW9kQ2Fwcz4ge1xuICAgIHRoaXMuaW5pdEJhY2tlbmQocm9vdERpcilcbiAgICByZXR1cm4gdGhpcy5jYXBzXG4gIH1cblxuICBwcml2YXRlIGdldENhcHMoeyB2ZXJzIH06IHsgdmVyczogbnVtYmVyW10gfSk6IEdIQ01vZENhcHMge1xuICAgIGNvbnN0IGNhcHM6IEdIQ01vZENhcHMgPSB7XG4gICAgICB2ZXJzaW9uOiB2ZXJzLFxuICAgICAgZmlsZU1hcDogZmFsc2UsXG4gICAgICBxdW90ZUFyZ3M6IGZhbHNlLFxuICAgICAgb3B0cGFyc2U6IGZhbHNlLFxuICAgICAgdHlwZUNvbnN0cmFpbnRzOiBmYWxzZSxcbiAgICAgIGJyb3dzZVBhcmVudHM6IGZhbHNlLFxuICAgICAgaW50ZXJhY3RpdmVDYXNlU3BsaXQ6IGZhbHNlLFxuICAgICAgaW1wb3J0ZWRGcm9tOiBmYWxzZSxcbiAgICAgIGJyb3dzZU1haW46IGZhbHNlLFxuICAgIH1cblxuICAgIGNvbnN0IGF0TGVhc3QgPSAoYjogbnVtYmVyW10pID0+IHtcbiAgICAgIGZvciAobGV0IGkgPSAwOyBpIDwgYi5sZW5ndGg7IGkrKykge1xuICAgICAgICBjb25zdCB2ID0gYltpXVxuICAgICAgICBpZiAodmVyc1tpXSA+IHYpIHtcbiAgICAgICAgICByZXR1cm4gdHJ1ZVxuICAgICAgICB9IGVsc2UgaWYgKHZlcnNbaV0gPCB2KSB7XG4gICAgICAgICAgcmV0dXJuIGZhbHNlXG4gICAgICAgIH1cbiAgICAgIH1cbiAgICAgIHJldHVybiB0cnVlXG4gICAgfVxuXG4gICAgY29uc3QgZXhhY3QgPSAoYjogbnVtYmVyW10pID0+IHtcbiAgICAgIGZvciAobGV0IGkgPSAwOyBpIDwgYi5sZW5ndGg7IGkrKykge1xuICAgICAgICBjb25zdCB2ID0gYltpXVxuICAgICAgICBpZiAodmVyc1tpXSAhPT0gdikge1xuICAgICAgICAgIHJldHVybiBmYWxzZVxuICAgICAgICB9XG4gICAgICB9XG4gICAgICByZXR1cm4gdHJ1ZVxuICAgIH1cblxuICAgIGlmICghYXRMZWFzdChbNSwgNF0pKSB7XG4gICAgICBhdG9tLm5vdGlmaWNhdGlvbnMuYWRkRXJyb3IoXG4gICAgICAgIGBcXFxuSGFza2VsbC1naGMtbW9kOiBnaGMtbW9kIDwgNS40IGlzIG5vdCBzdXBwb3J0ZWQuIFxcXG5Vc2UgYXQgeW91ciBvd24gcmlzayBvciB1cGRhdGUgeW91ciBnaGMtbW9kIGluc3RhbGxhdGlvbmAsXG4gICAgICAgIHsgZGlzbWlzc2FibGU6IHRydWUgfSxcbiAgICAgIClcbiAgICB9XG4gICAgaWYgKGV4YWN0KFs1LCA0XSkpIHtcbiAgICAgIGF0b20ubm90aWZpY2F0aW9ucy5hZGRXYXJuaW5nKFxuICAgICAgICBgXFxcbkhhc2tlbGwtZ2hjLW1vZDogZ2hjLW1vZCA1LjQuKiBpcyBkZXByZWNhdGVkLiBcXFxuVXNlIGF0IHlvdXIgb3duIHJpc2sgb3IgdXBkYXRlIHlvdXIgZ2hjLW1vZCBpbnN0YWxsYXRpb25gLFxuICAgICAgICB7IGRpc21pc3NhYmxlOiB0cnVlIH0sXG4gICAgICApXG4gICAgfVxuICAgIGlmIChhdExlYXN0KFs1LCA0XSkpIHtcbiAgICAgIGNhcHMuZmlsZU1hcCA9IHRydWVcbiAgICB9XG4gICAgaWYgKGF0TGVhc3QoWzUsIDVdKSkge1xuICAgICAgY2Fwcy5xdW90ZUFyZ3MgPSB0cnVlXG4gICAgICBjYXBzLm9wdHBhcnNlID0gdHJ1ZVxuICAgIH1cbiAgICBpZiAoYXRMZWFzdChbNSwgNl0pKSB7XG4gICAgICBjYXBzLnR5cGVDb25zdHJhaW50cyA9IHRydWVcbiAgICAgIGNhcHMuYnJvd3NlUGFyZW50cyA9IHRydWVcbiAgICAgIGNhcHMuaW50ZXJhY3RpdmVDYXNlU3BsaXQgPSB0cnVlXG4gICAgfVxuICAgIGlmIChhdG9tLmNvbmZpZy5nZXQoJ2hhc2tlbGwtZ2hjLW1vZC5leHBlcmltZW50YWwnKSkge1xuICAgICAgY2Fwcy5pbXBvcnRlZEZyb20gPSB0cnVlXG4gICAgfVxuICAgIFV0aWwuZGVidWcoSlNPTi5zdHJpbmdpZnkoY2FwcykpXG4gICAgcmV0dXJuIGNhcHNcbiAgfVxuXG4gIHByaXZhdGUgYXN5bmMgZ2V0U2V0dGluZ3MocnVuRGlyOiBBdG9tVHlwZXMuRGlyZWN0b3J5KSB7XG4gICAgY29uc3QgcmVhZFNldHRpbmdzID0gYXN5bmMgKGZpbGU6IEF0b21UeXBlcy5GaWxlKSA9PiB7XG4gICAgICB0cnkge1xuICAgICAgICBjb25zdCBleCA9IGF3YWl0IGZpbGUuZXhpc3RzKClcbiAgICAgICAgaWYgKGV4KSB7XG4gICAgICAgICAgY29uc3QgY29udGVudHMgPSBhd2FpdCBmaWxlLnJlYWQoKVxuICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICByZXR1cm4gSlNPTi5wYXJzZShjb250ZW50cylcbiAgICAgICAgICB9IGNhdGNoIChlcnIpIHtcbiAgICAgICAgICAgIGF0b20ubm90aWZpY2F0aW9ucy5hZGRFcnJvcihgRmFpbGVkIHRvIHBhcnNlICR7ZmlsZS5nZXRQYXRoKCl9YCwge1xuICAgICAgICAgICAgICBkZXRhaWw6IGVycixcbiAgICAgICAgICAgICAgZGlzbWlzc2FibGU6IHRydWUsXG4gICAgICAgICAgICB9KVxuICAgICAgICAgICAgdGhyb3cgZXJyXG4gICAgICAgICAgfVxuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIHJldHVybiB7fVxuICAgICAgICB9XG4gICAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgICBpZiAoZXJyb3IpIHsgVXRpbC53YXJuKGVycm9yKSB9XG4gICAgICAgIHJldHVybiB7fVxuICAgICAgfVxuICAgIH1cblxuICAgIGNvbnN0IGxvY2FsU2V0dGluZ3MgPSByZWFkU2V0dGluZ3MocnVuRGlyLmdldEZpbGUoJy5oYXNrZWxsLWdoYy1tb2QuanNvbicpKVxuXG4gICAgY29uc3QgW3Byb2plY3REaXJdID0gYXRvbS5wcm9qZWN0LmdldERpcmVjdG9yaWVzKCkuZmlsdGVyKChkKSA9PiBkLmNvbnRhaW5zKHJ1bkRpci5nZXRQYXRoKCkpKVxuICAgIGNvbnN0IHByb2plY3RTZXR0aW5ncyA9XG4gICAgICBwcm9qZWN0RGlyID9cbiAgICAgICAgcmVhZFNldHRpbmdzKHByb2plY3REaXIuZ2V0RmlsZSgnLmhhc2tlbGwtZ2hjLW1vZC5qc29uJykpXG4gICAgICAgIDpcbiAgICAgICAgUHJvbWlzZS5yZXNvbHZlKHt9KVxuXG4gICAgY29uc3QgY29uZmlnRGlyID0gbmV3IERpcmVjdG9yeShhdG9tLmdldENvbmZpZ0RpclBhdGgoKSlcbiAgICBjb25zdCBnbG9iYWxTZXR0aW5ncyA9IHJlYWRTZXR0aW5ncyhjb25maWdEaXIuZ2V0RmlsZSgnaGFza2VsbC1naGMtbW9kLmpzb24nKSlcblxuICAgIGNvbnN0IFtnbG9iLCBwcmosIGxvY10gPSBhd2FpdCBQcm9taXNlLmFsbChbZ2xvYmFsU2V0dGluZ3MsIHByb2plY3RTZXR0aW5ncywgbG9jYWxTZXR0aW5nc10pXG4gICAgcmV0dXJuIHsgLi4uZ2xvYiwgLi4ucHJqLCAuLi5sb2MgfVxuICB9XG5cbiAgcHJpdmF0ZSBhc3luYyBxdWV1ZUNtZChcbiAgICBxdWV1ZU5hbWU6IENvbW1hbmRzLFxuICAgIGRpcjogQXRvbVR5cGVzLkRpcmVjdG9yeSxcbiAgICBydW5BcmdzOiB7XG4gICAgICBjb21tYW5kOiBzdHJpbmcsIHRleHQ/OiBzdHJpbmcsIHVyaT86IHN0cmluZywgaW50ZXJhY3RpdmU/OiBib29sZWFuLFxuICAgICAgZGFzaEFyZ3M/OiBzdHJpbmdbXSwgYXJncz86IHN0cmluZ1tdXG4gICAgfSxcbiAgKTogUHJvbWlzZTxzdHJpbmdbXT4ge1xuICAgIGlmIChhdG9tLmNvbmZpZy5nZXQoJ2hhc2tlbGwtZ2hjLW1vZC5sb3dNZW1vcnlTeXN0ZW0nKSkge1xuICAgICAgcXVldWVOYW1lID0gJ2xvd21lbSdcbiAgICB9XG4gICAgY29uc3QgYmFja2VuZCA9IGF3YWl0IHRoaXMuaW5pdEJhY2tlbmQoZGlyKVxuICAgIGNvbnN0IHByb21pc2UgPSB0aGlzLmNvbW1hbmRRdWV1ZXNbcXVldWVOYW1lXS5hZGQoYXN5bmMgKCkgPT4ge1xuICAgICAgdGhpcy5lbWl0dGVyLmVtaXQoJ2JhY2tlbmQtYWN0aXZlJywgdW5kZWZpbmVkKVxuICAgICAgdHJ5IHtcbiAgICAgICAgY29uc3Qgc2V0dGluZ3MgPSBhd2FpdCB0aGlzLmdldFNldHRpbmdzKGRpcilcbiAgICAgICAgaWYgKHNldHRpbmdzLmRpc2FibGUpIHsgdGhyb3cgbmV3IEVycm9yKCdHaGMtbW9kIGRpc2FibGVkIGluIHNldHRpbmdzJykgfVxuICAgICAgICByZXR1cm4gYmFja2VuZC5ydW4oe1xuICAgICAgICAgIC4uLnJ1bkFyZ3MsXG4gICAgICAgICAgc3VwcHJlc3NFcnJvcnM6IHNldHRpbmdzLnN1cHByZXNzRXJyb3JzLFxuICAgICAgICAgIGdoY09wdGlvbnM6IHNldHRpbmdzLmdoY09wdGlvbnMsXG4gICAgICAgICAgZ2hjTW9kT3B0aW9uczogc2V0dGluZ3MuZ2hjTW9kT3B0aW9ucyxcbiAgICAgICAgfSlcbiAgICAgIH0gY2F0Y2ggKGVycikge1xuICAgICAgICBVdGlsLndhcm4oZXJyKVxuICAgICAgICB0aHJvdyBlcnJcbiAgICAgIH1cbiAgICB9KVxuICAgIHByb21pc2UudGhlbigocmVzKSA9PiB7XG4gICAgICBjb25zdCBxZSA9IChxbjogQ29tbWFuZHMpID0+IHtcbiAgICAgICAgY29uc3QgcSA9IHRoaXMuY29tbWFuZFF1ZXVlc1txbl1cbiAgICAgICAgcmV0dXJuIChxLmdldFF1ZXVlTGVuZ3RoKCkgKyBxLmdldFBlbmRpbmdMZW5ndGgoKSkgPT09IDBcbiAgICAgIH1cbiAgICAgIGlmIChxZShxdWV1ZU5hbWUpKSB7XG4gICAgICAgIHRoaXMuZW1pdHRlci5lbWl0KCdxdWV1ZS1pZGxlJywgeyBxdWV1ZTogcXVldWVOYW1lIH0pXG4gICAgICAgIGlmIChPYmplY3Qua2V5cyh0aGlzLmNvbW1hbmRRdWV1ZXMpLmV2ZXJ5KHFlKSkge1xuICAgICAgICAgIHRoaXMuZW1pdHRlci5lbWl0KCdiYWNrZW5kLWlkbGUnLCB1bmRlZmluZWQpXG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9KVxuICAgIHJldHVybiBwcm9taXNlXG4gIH1cblxuICBwcml2YXRlIGFzeW5jIGRvQ2hlY2tPckxpbnRCdWZmZXIoY21kOiAnY2hlY2snIHwgJ2xpbnQnLCBidWZmZXI6IEF0b21UeXBlcy5UZXh0QnVmZmVyLCBmYXN0OiBib29sZWFuKSB7XG4gICAgbGV0IGRhc2hBcmdzXG4gICAgaWYgKGJ1ZmZlci5pc0VtcHR5KCkpIHsgcmV0dXJuIFtdIH1cbiAgICBpZiAoIWJ1ZmZlci5nZXRVcmkoKSkgeyByZXR1cm4gW10gfVxuXG4gICAgLy8gQSBkaXJ0eSBoYWNrIHRvIG1ha2UgbGludCB3b3JrIHdpdGggbGhzXG4gICAgbGV0IHVyaSA9IGJ1ZmZlci5nZXRVcmkoKVxuICAgIGNvbnN0IG9sZHVyaSA9IGJ1ZmZlci5nZXRVcmkoKVxuICAgIGxldCB0ZXh0XG4gICAgdHJ5IHtcbiAgICAgIGlmICgoY21kID09PSAnbGludCcpICYmIChleHRuYW1lKHVyaSkgPT09ICcubGhzJykpIHtcbiAgICAgICAgdXJpID0gdXJpLnNsaWNlKDAsIC0xKVxuICAgICAgICB0ZXh0ID0gYXdhaXQgdW5saXQob2xkdXJpLCBidWZmZXIuZ2V0VGV4dCgpKVxuICAgICAgfSBlbHNlIGlmIChidWZmZXIuaXNNb2RpZmllZCgpKSB7XG4gICAgICAgIHRleHQgPSBidWZmZXIuZ2V0VGV4dCgpXG4gICAgICB9XG4gICAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICAgIC8vIFRPRE86IFJlamVjdFxuICAgICAgY29uc3QgbSA9IChlcnJvciBhcyBFcnJvcikubWVzc2FnZS5tYXRjaCgvXiguKj8pOihbMC05XSspOiAqKC4qKSAqJC8pXG4gICAgICBpZiAoIW0pIHsgdGhyb3cgZXJyb3IgfVxuICAgICAgY29uc3QgW3VyaTIsIGxpbmUsIG1lc3NdID0gbS5zbGljZSgxKVxuICAgICAgcmV0dXJuIFt7XG4gICAgICAgIHVyaTogdXJpMixcbiAgICAgICAgcG9zaXRpb246IG5ldyBQb2ludChwYXJzZUludChsaW5lLCAxMCkgLSAxLCAwKSxcbiAgICAgICAgbWVzc2FnZTogbWVzcyxcbiAgICAgICAgc2V2ZXJpdHk6ICdsaW50JyxcbiAgICAgIH1dXG4gICAgfVxuICAgIC8vIGVuZCBvZiBkaXJ0eSBoYWNrXG5cbiAgICAvLyB0c2xpbnQ6ZGlzYWJsZS1uZXh0LWxpbmU6IHRvdGFsaXR5LWNoZWNrXG4gICAgaWYgKGNtZCA9PT0gJ2xpbnQnKSB7XG4gICAgICBjb25zdCBvcHRzOiBzdHJpbmdbXSA9IGF0b20uY29uZmlnLmdldCgnaGFza2VsbC1naGMtbW9kLmhsaW50T3B0aW9ucycpXG4gICAgICBkYXNoQXJncyA9IFtdXG4gICAgICBmb3IgKGNvbnN0IG9wdCBvZiBvcHRzKSB7XG4gICAgICAgIGRhc2hBcmdzLnB1c2goJy0taGxpbnRPcHQnLCBvcHQpXG4gICAgICB9XG4gICAgfVxuXG4gICAgY29uc3Qgcm9vdERpciA9IGF3YWl0IHRoaXMuZ2V0Um9vdERpcihidWZmZXIpXG5cbiAgICBjb25zdCBsaW5lcyA9IGF3YWl0IHRoaXMucXVldWVDbWQoJ2NoZWNrbGludCcsIHJvb3REaXIsIHtcbiAgICAgIGludGVyYWN0aXZlOiBmYXN0LFxuICAgICAgY29tbWFuZDogY21kLFxuICAgICAgdXJpLFxuICAgICAgdGV4dCxcbiAgICAgIGRhc2hBcmdzLFxuICAgIH0pXG5cbiAgICBjb25zdCByeCA9IC9eKC4qPyk6KFswLTlcXHNdKyk6KFswLTlcXHNdKyk6ICooPzooV2FybmluZ3xFcnJvcik6ICopPyhbXl0qKS9cbiAgICBjb25zdCByZXMgPSBbXVxuICAgIGZvciAoY29uc3QgbGluZSBvZiBsaW5lcykge1xuICAgICAgY29uc3QgbWF0Y2ggPSBsaW5lLm1hdGNoKHJ4KVxuICAgICAgaWYgKCFtYXRjaCkge1xuICAgICAgICBpZiAobGluZS50cmltKCkubGVuZ3RoKSB7IFV0aWwud2FybihgZ2hjLW1vZCBzYXlzOiAke2xpbmV9YCkgfVxuICAgICAgICBjb250aW51ZVxuICAgICAgfVxuICAgICAgY29uc3QgW2ZpbGUyLCByb3csIGNvbCwgd2FybmluZywgbWVzc2FnZV0gPSBtYXRjaC5zbGljZSgxKVxuICAgICAgaWYgKGZpbGUyID09PSAnRHVtbXknICYmIHJvdyA9PT0gJzAnICYmIGNvbCA9PT0gJzAnKSB7XG4gICAgICAgIGlmICh3YXJuaW5nID09PSAnRXJyb3InKSB7XG4gICAgICAgICAgdGhpcy5lbWl0dGVyLmVtaXQoJ2Vycm9yJywgeyBlcnI6IFV0aWwubWtFcnJvcignR0hDTW9kU3Rkb3V0RXJyb3InLCBtZXNzYWdlKSwgY2FwczogYXdhaXQgdGhpcy5jYXBzIH0pXG4gICAgICAgICAgY29udGludWVcbiAgICAgICAgfSBlbHNlIGlmICh3YXJuaW5nID09PSAnV2FybmluZycpIHtcbiAgICAgICAgICB0aGlzLmVtaXR0ZXIuZW1pdCgnd2FybmluZycsIG1lc3NhZ2UpXG4gICAgICAgICAgY29udGludWVcbiAgICAgICAgfVxuICAgICAgfVxuXG4gICAgICBjb25zdCBmaWxlID0gdXJpLmVuZHNXaXRoKGZpbGUyKSA/IG9sZHVyaSA6IGZpbGUyXG4gICAgICBjb25zdCBzZXZlcml0eSA9XG4gICAgICAgIGNtZCA9PT0gJ2xpbnQnID9cbiAgICAgICAgICAnbGludCdcbiAgICAgICAgICA6IHdhcm5pbmcgPT09ICdXYXJuaW5nJyA/XG4gICAgICAgICAgICAnd2FybmluZydcbiAgICAgICAgICAgIDpcbiAgICAgICAgICAgICdlcnJvcidcbiAgICAgIGNvbnN0IG1lc3NQb3MgPSBuZXcgUG9pbnQocGFyc2VJbnQocm93LCAxMCkgLSAxLCBwYXJzZUludChjb2wsIDEwKSAtIDEpXG4gICAgICBjb25zdCBwb3NpdGlvbiA9IFV0aWwudGFiVW5zaGlmdEZvclBvaW50KGJ1ZmZlciwgbWVzc1BvcylcbiAgICAgIGxldCBteXVyaVxuICAgICAgdHJ5IHtcbiAgICAgICAgbXl1cmkgPSByb290RGlyLmdldEZpbGUocm9vdERpci5yZWxhdGl2aXplKGZpbGUpKS5nZXRQYXRoKClcbiAgICAgIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgICAgIG15dXJpID0gZmlsZVxuICAgICAgfVxuICAgICAgcmVzLnB1c2goe1xuICAgICAgICB1cmk6IG15dXJpLFxuICAgICAgICBwb3NpdGlvbixcbiAgICAgICAgbWVzc2FnZSxcbiAgICAgICAgc2V2ZXJpdHksXG4gICAgICB9KVxuICAgIH1cbiAgICByZXR1cm4gcmVzXG4gIH1cbn1cbiJdfQ==