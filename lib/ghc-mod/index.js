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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaW5kZXguanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi9zcmMvZ2hjLW1vZC9pbmRleC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOzs7Ozs7Ozs7O0FBWUEsK0JBQTRFO0FBQzVFLGdDQUErQjtBQUMvQiwrQkFBOEI7QUFDOUIsdUNBQXVDO0FBQ3ZDLDJEQUEwQztBQUUxQyxtRUFBd0U7QUFheEU7SUFRRTtRQUNFLElBQUksQ0FBQyxXQUFXLEdBQUcsSUFBSSwwQkFBbUIsRUFBRSxDQUFBO1FBQzVDLElBQUksQ0FBQyxPQUFPLEdBQUcsSUFBSSxjQUFPLEVBQUUsQ0FBQTtRQUM1QixJQUFJLENBQUMsV0FBVyxDQUFDLEdBQUcsQ0FBQyxJQUFJLENBQUMsT0FBTyxDQUFDLENBQUE7UUFDbEMsSUFBSSxDQUFDLFlBQVksR0FBRyxJQUFJLE9BQU8sRUFBRSxDQUFBO1FBQ2pDLElBQUksQ0FBQyxPQUFPLEdBQUcsSUFBSSxHQUFHLEVBQUUsQ0FBQTtRQUV4QixFQUFFLENBQUMsQ0FBQyxPQUFPLENBQUMsR0FBRyxDQUFDLGdCQUFnQixJQUFJLENBQUMsSUFBSSxDQUFDLE1BQU0sQ0FBQyxHQUFHLENBQUMsK0NBQStDLENBQUMsQ0FBQyxDQUFDLENBQUM7WUFDdEcsSUFBSSxDQUFDLGFBQWEsQ0FBQyxVQUFVLENBQUM7O0NBRW5DLEVBQW1DO2dCQUMxQixXQUFXLEVBQUUsSUFBSTtnQkFDakIsTUFBTSxFQUFFOzs7Ozs7OztDQVFqQjthQUNRLENBQ0YsQ0FBQTtRQUNILENBQUM7UUFFRCxJQUFJLENBQUMsWUFBWSxFQUFFLENBQUE7SUFDckIsQ0FBQztJQUVZLFVBQVUsQ0FBRSxNQUE0Qjs7WUFDbkQsSUFBSSxHQUFHLENBQUE7WUFDUCxHQUFHLEdBQUcsSUFBSSxDQUFDLFlBQVksQ0FBQyxHQUFHLENBQUMsTUFBTSxDQUFDLENBQUE7WUFDbkMsRUFBRSxDQUFDLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQztnQkFDUixNQUFNLENBQUMsR0FB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QUFDLEdBQUcsTUFBTSxHQUFHLEtBQUssQ0FBQTtnQkFDakQsTUFBTSxRQUFRLEdBQ1osR0FBRyxLQUFLLE1BQU07b0JBQ1osTUFBTTtzQkFDSixPQUFPLEtBQUssU0FBUzt3QkFDckIsU0FBUzs7NEJBRVQsT0FBTyxDQUFBO2dCQUNiLE1BQU0sT0FBTyxHQUFHLElBQUksWUFBSyxDQUFDLFFBQVEsQ0FBQyxHQUFHLEVBQUUsRUFBRSxDQUFDLEdBQUcsQ0FBQyxFQUFFLFFBQVEsQ0FBQyxHQUFHLEVBQUUsRUFBRSxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUE7Z0JBQ3ZFLE1BQU0sUUFBUSxHQUFHLElBQUksQ0FBQyxrQkFBa0IsQ0FBQyxNQUFNLEVBQUUsT0FBTyxDQUFDLENBQUE7Z0JBQ3pELElBQUksS0FBSyxDQUFBO2dCQUNULElBQUksQ0FBQztvQkFDSCxLQUFLLEdBQUcsT0FBTyxDQUFDLE9BQU8sQ0FBQyxPQUFPLENBQUMsVUFBVSxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsT0FBTyxFQUFFLENBQUE7Z0JBQzdELENBQUM7Z0JBQUMsS0FBSyxDQUFDLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQztvQkFDZixLQUFLLEdBQUcsSUFBSSxDQUFBO2dCQUNkLENBQUM7Z0JBQ0QsR0FBRyxDQUFDLElBQUksQ0FBQztvQkFDUCxHQUFHLEVBQUUsS0FBSztvQkFDVixRQUFRO29CQUNSLE9BQU87b0JBQ1AsUUFBUTtpQkFDVCxDQUFDLENBQUE7WUFDSixDQUFDO1lBQ0QsTUFBTSxDQUFDLEdBQUcsQ0FBQTtRQUNaLENBQUM7S0FBQTtDQUNGO0FBOWxCRCx3Q0E4bEJDIiwic291cmNlc0NvbnRlbnQiOlsiLypcbiAqIGRlY2FmZmVpbmF0ZSBzdWdnZXN0aW9uczpcbiAqIERTMTAxOiBSZW1vdmUgdW5uZWNlc3NhcnkgdXNlIG9mIEFycmF5LmZyb21cbiAqIERTMTAyOiBSZW1vdmUgdW5uZWNlc3NhcnkgY29kZSBjcmVhdGVkIGJlY2F1c2Ugb2YgaW1wbGljaXQgcmV0dXJuc1xuICogRFMxMDM6IFJld3JpdGUgY29kZSB0byBubyBsb25nZXIgdXNlIF9fZ3VhcmRfX1xuICogRFMxMDQ6IEF2b2lkIGlubGluZSBhc3NpZ25tZW50c1xuICogRFMyMDE6IFNpbXBsaWZ5IGNvbXBsZXggZGVzdHJ1Y3R1cmUgYXNzaWdubWVudHNcbiAqIERTMjA1OiBDb25zaWRlciByZXdvcmtpbmcgY29kZSB0byBhdm9pZCB1c2Ugb2YgSUlGRXNcbiAqIERTMjA2OiBDb25zaWRlciByZXdvcmtpbmcgY2xhc3NlcyB0byBhdm9pZCBpbml0Q2xhc3NcbiAqIERTMjA3OiBDb25zaWRlciBzaG9ydGVyIHZhcmlhdGlvbnMgb2YgbnVsbCBjaGVja3NcbiAqIEZ1bGwgZG9jczogaHR0cHM6Ly9naXRodWIuY29tL2RlY2FmZmVpbmF0ZS9kZWNhZmZlaW5hdGUvYmxvYi9tYXN0ZXIvZG9jcy9zdWdnZXN0aW9ucy5tZFxuICovXG5pbXBvcnQgeyBSYW5nZSwgUG9pbnQsIEVtaXR0ZXIsIENvbXBvc2l0ZURpc3Bvc2FibGUsIERpcmVjdG9yeSB9IGZyb20gJ2F0b20nXG5pbXBvcnQgKiBhcyBVdGlsIGZyb20gJy4uL3V0aWwnXG5pbXBvcnQgeyBleHRuYW1lIH0gZnJvbSAncGF0aCdcbmltcG9ydCBRdWV1ZSA9IHJlcXVpcmUoJ3Byb21pc2UtcXVldWUnKVxuaW1wb3J0IHsgdW5saXQgfSBmcm9tICdhdG9tLWhhc2tlbGwtdXRpbHMnXG5cbmltcG9ydCB7IEdoY01vZGlQcm9jZXNzUmVhbCwgR0hDTW9kQ2FwcyB9IGZyb20gJy4vZ2hjLW1vZGktcHJvY2Vzcy1yZWFsJ1xuXG50eXBlIENvbW1hbmRzID0gJ2NoZWNrbGludCcgfCAnYnJvd3NlJyB8ICd0eXBlaW5mbycgfCAnZmluZCcgfCAnaW5pdCcgfCAnbGlzdCcgfCAnbG93bWVtJ1xuXG5leHBvcnQgdHlwZSBTeW1ib2xUeXBlID0gJ3R5cGUnIHwgJ2NsYXNzJyB8ICdmdW5jdGlvbidcblxuZXhwb3J0IGludGVyZmFjZSBTeW1ib2xEZXNjIHtcbiAgbmFtZTogc3RyaW5nLFxuICBzeW1ib2xUeXBlOiBTeW1ib2xUeXBlLFxuICB0eXBlU2lnbmF0dXJlPzogc3RyaW5nLFxuICBwYXJlbnQ/OiBzdHJpbmdcbn1cblxuZXhwb3J0IGNsYXNzIEdoY01vZGlQcm9jZXNzIHtcbiAgcHJpdmF0ZSBiYWNrZW5kOiBNYXA8c3RyaW5nLCBQcm9taXNlPEdoY01vZGlQcm9jZXNzUmVhbD4+XG4gIHByaXZhdGUgZGlzcG9zYWJsZXM6IENvbXBvc2l0ZURpc3Bvc2FibGVcbiAgcHJpdmF0ZSBlbWl0dGVyOiBFbWl0dGVyXG4gIHByaXZhdGUgYnVmZmVyRGlyTWFwOiBXZWFrTWFwPEF0b21UeXBlcy5UZXh0QnVmZmVyLCBBdG9tVHlwZXMuRGlyZWN0b3J5PlxuICBwcml2YXRlIGNvbW1hbmRRdWV1ZXM6IHtbSyBpbiBDb21tYW5kc106IFF1ZXVlfVxuICBwcml2YXRlIGNhcHM6IEdIQ01vZENhcHNcblxuICBjb25zdHJ1Y3RvciAoKSB7XG4gICAgdGhpcy5kaXNwb3NhYmxlcyA9IG5ldyBDb21wb3NpdGVEaXNwb3NhYmxlKClcbiAgICB0aGlzLmVtaXR0ZXIgPSBuZXcgRW1pdHRlcigpXG4gICAgdGhpcy5kaXNwb3NhYmxlcy5hZGQodGhpcy5lbWl0dGVyKVxuICAgIHRoaXMuYnVmZmVyRGlyTWFwID0gbmV3IFdlYWtNYXAoKVxuICAgIHRoaXMuYmFja2VuZCA9IG5ldyBNYXAoKVxuXG4gICAgaWYgKHByb2Nlc3MuZW52LkdIQ19QQUNLQUdFX1BBVEggJiYgIWF0b20uY29uZmlnLmdldCgnaGFza2VsbC1naGMtbW9kLnN1cHByZXNzR2hjUGFja2FnZVBhdGhXYXJuaW5nJykpIHtcbiAgICAgIGF0b20ubm90aWZpY2F0aW9ucy5hZGRXYXJuaW5nKGBcXFxuaGFza2VsbC1naGMtbW9kOiBZb3UgaGF2ZSBHSENfUEFDS0FHRV9QQVRIIGVudmlyb25tZW50IHZhcmlhYmxlIHNldCFcXFxuYCwgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAge1xuICAgICAgICAgIGRpc21pc3NhYmxlOiB0cnVlLFxuICAgICAgICAgIGRldGFpbDogYFxcXG5UaGlzIGNvbmZpZ3VyYXRpb24gaXMgbm90IHN1cHBvcnRlZCwgYW5kIGNhbiBicmVhayBhcmJpdHJhcmlseS4gWW91IGNhbiB0cnkgdG8gYmFuZC1haWQgaXQgYnkgYWRkaW5nXG5cbmRlbGV0ZSBwcm9jZXNzLmVudi5HSENfUEFDS0FHRV9QQVRIXG5cbnRvIHlvdXIgQXRvbSBpbml0IHNjcmlwdCAoRWRpdCDihpIgSW5pdCBTY3JpcHQuLi4pXG5cbllvdSBjYW4gc3VwcHJlc3MgdGhpcyB3YXJuaW5nIGluIGhhc2tlbGwtZ2hjLW1vZCBzZXR0aW5ncy5cXFxuYFxuICAgICAgICB9XG4gICAgICApXG4gICAgfVxuXG4gICAgdGhpcy5jcmVhdGVRdWV1ZXMoKVxuICB9XG5cbiAgcHVibGljIGFzeW5jIGdldFJvb3REaXIgKGJ1ZmZlcjogQXRvbVR5cGVzLlRleHRCdWZmZXIpOiBQcm9taXNlPEF0b21UeXBlcy5EaXJlY3Rvcnk+IHtcbiAgICBsZXQgZGlyXG4gICAgZGlyID0gdGhpcy5idWZmZXJEaXJNYXAuZ2V0KGJ1ZmZlcilcbiAgICBpZiAoZGlyKSB7XG4gICAgICByZXR1cm4gZGlyXG4gICAgfVxuICAgIGRpciA9IGF3YWl0IFV0aWwuZ2V0Um9vdERpcihidWZmZXIpXG4gICAgdGhpcy5idWZmZXJEaXJNYXAuc2V0KGJ1ZmZlciwgZGlyKVxuICAgIHJldHVybiBkaXJcbiAgfVxuXG4gIHB1YmxpYyBraWxsUHJvY2VzcyAoKSB7XG4gICAgZm9yIChjb25zdCBicCBvZiB0aGlzLmJhY2tlbmQudmFsdWVzKCkpIHtcbiAgICAgIGJwLnRoZW4oKGIpID0+IGIua2lsbFByb2Nlc3MoKSlcbiAgICB9XG4gICAgdGhpcy5iYWNrZW5kLmNsZWFyKClcbiAgfVxuXG4gIHB1YmxpYyBkZXN0cm95ICgpIHtcbiAgICBmb3IgKGNvbnN0IGJwIG9mIHRoaXMuYmFja2VuZC52YWx1ZXMoKSkge1xuICAgICAgYnAudGhlbigoYikgPT4gYi5kZXN0cm95KCkpXG4gICAgfVxuICAgIHRoaXMuYmFja2VuZC5jbGVhcigpXG4gICAgdGhpcy5lbWl0dGVyLmVtaXQoJ2RpZC1kZXN0cm95JylcbiAgICB0aGlzLmRpc3Bvc2FibGVzLmRpc3Bvc2UoKVxuICB9XG5cbiAgcHVibGljIG9uRGlkRGVzdHJveSAoY2FsbGJhY2s6ICgpID0+IHZvaWQpIHtcbiAgICByZXR1cm4gdGhpcy5lbWl0dGVyLm9uKCdkaWQtZGVzdHJveScsIGNhbGxiYWNrKVxuICB9XG5cbiAgcHVibGljIG9uQmFja2VuZEFjdGl2ZSAoY2FsbGJhY2s6ICgpID0+IHZvaWQpIHtcbiAgICByZXR1cm4gdGhpcy5lbWl0dGVyLm9uKCdiYWNrZW5kLWFjdGl2ZScsIGNhbGxiYWNrKVxuICB9XG5cbiAgcHVibGljIG9uQmFja2VuZElkbGUgKGNhbGxiYWNrOiAoKSA9PiB2b2lkKSB7XG4gICAgcmV0dXJuIHRoaXMuZW1pdHRlci5vbignYmFja2VuZC1pZGxlJywgY2FsbGJhY2spXG4gIH1cblxuICBwdWJsaWMgb25RdWV1ZUlkbGUgKGNhbGxiYWNrOiAoKSA9PiB2b2lkKSB7XG4gICAgcmV0dXJuIHRoaXMuZW1pdHRlci5vbigncXVldWUtaWRsZScsIGNhbGxiYWNrKVxuICB9XG5cbiAgcHVibGljIGFzeW5jIHJ1bkxpc3QgKGJ1ZmZlcjogQXRvbVR5cGVzLlRleHRCdWZmZXIpIHtcbiAgICByZXR1cm4gdGhpcy5xdWV1ZUNtZCgnbGlzdCcsIGF3YWl0IHRoaXMuZ2V0Um9vdERpcihidWZmZXIpLCB7IGNvbW1hbmQ6ICdsaXN0JyB9KVxuICB9XG5cbiAgcHVibGljIGFzeW5jIHJ1bkxhbmcgKGRpcjogQXRvbVR5cGVzLkRpcmVjdG9yeSkge1xuICAgIHJldHVybiB0aGlzLnF1ZXVlQ21kKCdpbml0JywgZGlyLCB7IGNvbW1hbmQ6ICdsYW5nJyB9KVxuICB9XG5cbiAgcHVibGljIGFzeW5jIHJ1bkZsYWcgKGRpcjogQXRvbVR5cGVzLkRpcmVjdG9yeSkge1xuICAgIHJldHVybiB0aGlzLnF1ZXVlQ21kKCdpbml0JywgZGlyLCB7IGNvbW1hbmQ6ICdmbGFnJyB9KVxuICB9XG5cbiAgcHVibGljIGFzeW5jIHJ1bkJyb3dzZSAocm9vdERpcjogQXRvbVR5cGVzLkRpcmVjdG9yeSwgbW9kdWxlczogc3RyaW5nW10pOiBQcm9taXNlPFN5bWJvbERlc2NbXT4ge1xuICAgIGNvbnN0IGxpbmVzID0gYXdhaXQgdGhpcy5xdWV1ZUNtZCgnYnJvd3NlJywgcm9vdERpciwge1xuICAgICAgY29tbWFuZDogJ2Jyb3dzZScsXG4gICAgICBkYXNoQXJncyAoY2Fwcykge1xuICAgICAgICBjb25zdCBhcmdzID0gWyctZCddXG4gICAgICAgIGlmIChjYXBzLmJyb3dzZVBhcmVudHMpIHsgYXJncy5wdXNoKCctcCcpIH1cbiAgICAgICAgcmV0dXJuIGFyZ3NcbiAgICAgIH0sXG4gICAgICBhcmdzOiBtb2R1bGVzXG4gICAgfSlcbiAgICByZXR1cm4gbGluZXMubWFwKChzKSA9PiB7XG4gICAgICAvLyBlbnVtRnJvbSA6OiBFbnVtIGEgPT4gYSAtPiBbYV0gLS0gZnJvbTpFbnVtXG4gICAgICBjb25zdCBwYXR0ZXJuID0gdGhpcy5jYXBzLmJyb3dzZVBhcmVudHMgPyAvXiguKj8pIDo6ICguKj8pKD86IC0tIGZyb206KC4qKSk/JC8gOiAvXiguKj8pIDo6ICguKikkL1xuICAgICAgY29uc3QgbWF0Y2ggPSBzLm1hdGNoKHBhdHRlcm4pXG4gICAgICBsZXQgbmFtZSwgdHlwZVNpZ25hdHVyZSwgcGFyZW50XG4gICAgICBpZiAobWF0Y2gpIHtcbiAgICAgICAgbmFtZSA9IG1hdGNoWzFdXG4gICAgICAgIHR5cGVTaWduYXR1cmUgPSBtYXRjaFsyXVxuICAgICAgICBwYXJlbnQgPSBtYXRjaFszXVxuICAgICAgfSBlbHNlIHtcbiAgICAgICAgbmFtZSA9IHNcbiAgICAgIH1cbiAgICAgIGxldCBzeW1ib2xUeXBlOiBTeW1ib2xUeXBlXG4gICAgICBpZiAodHlwZVNpZ25hdHVyZSAmJiAvXig/OnR5cGV8ZGF0YXxuZXd0eXBlKS8udGVzdCh0eXBlU2lnbmF0dXJlKSkge1xuICAgICAgICBzeW1ib2xUeXBlID0gJ3R5cGUnXG4gICAgICB9IGVsc2UgaWYgKHR5cGVTaWduYXR1cmUgJiYgL14oPzpjbGFzcykvLnRlc3QodHlwZVNpZ25hdHVyZSkpIHtcbiAgICAgICAgc3ltYm9sVHlwZSA9ICdjbGFzcydcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHN5bWJvbFR5cGUgPSAnZnVuY3Rpb24nXG4gICAgICB9XG4gICAgICByZXR1cm4geyBuYW1lLCB0eXBlU2lnbmF0dXJlLCBzeW1ib2xUeXBlLCBwYXJlbnQgfVxuICAgIH0pXG4gIH1cblxuICBwdWJsaWMgYXN5bmMgZ2V0VHlwZUluQnVmZmVyIChcbiAgICBidWZmZXI6IEF0b21UeXBlcy5UZXh0QnVmZmVyLCBjcmFuZ2U6IEF0b21UeXBlcy5SYW5nZVxuICApICB7XG4gICAgaWYgKCEgYnVmZmVyLmdldFVyaSgpKSB7IHRocm93IG5ldyBFcnJvcignTm8gVVJJIGZvciBidWZmZXInKSB9XG4gICAgY3JhbmdlID0gVXRpbC50YWJTaGlmdEZvclJhbmdlKGJ1ZmZlciwgY3JhbmdlKVxuICAgIGNvbnN0IGxpbmVzID0gYXdhaXQgdGhpcy5xdWV1ZUNtZCgndHlwZWluZm8nLCBhd2FpdCB0aGlzLmdldFJvb3REaXIoYnVmZmVyKSwge1xuICAgICAgaW50ZXJhY3RpdmU6IHRydWUsXG4gICAgICBjb21tYW5kOiAndHlwZScsXG4gICAgICB1cmk6IGJ1ZmZlci5nZXRVcmkoKSxcbiAgICAgIHRleHQ6IGJ1ZmZlci5pc01vZGlmaWVkKCkgPyBidWZmZXIuZ2V0VGV4dCgpIDogdW5kZWZpbmVkLFxuICAgICAgZGFzaEFyZ3MgKGNhcHMpIHtcbiAgICAgICAgcmV0dXJuIGNhcHMudHlwZUNvbnN0cmFpbnRzID8gWyctYyddIDogW11cbiAgICAgIH0sXG4gICAgICBhcmdzOiBbY3JhbmdlLnN0YXJ0LnJvdyArIDEsIGNyYW5nZS5zdGFydC5jb2x1bW4gKyAxXS5tYXAoKHYpID0+IHYudG9TdHJpbmcoKSlcbiAgICB9KVxuXG4gICAgY29uc3QgcnggPSAvXihcXGQrKVxccysoXFxkKylcXHMrKFxcZCspXFxzKyhcXGQrKVxccytcIihbXl0qKVwiJC8gLy8gW15dIGJhc2ljYWxseSBtZWFucyBcImFueXRoaW5nXCIsIGluY2wuIG5ld2xpbmVzXG4gICAgZm9yIChjb25zdCBsaW5lIG9mIGxpbmVzKSB7XG4gICAgICBjb25zdCBtYXRjaCA9IGxpbmUubWF0Y2gocngpXG4gICAgICBpZiAoIW1hdGNoKSB7IGNvbnRpbnVlIH1cbiAgICAgIGNvbnN0IFtyb3dzdGFydCwgY29sc3RhcnQsIHJvd2VuZCwgY29sZW5kLCB0eXBlXSA9IG1hdGNoLnNsaWNlKDEpXG4gICAgICBjb25zdCByYW5nZSA9XG4gICAgICAgIFJhbmdlLmZyb21PYmplY3QoW1xuICAgICAgICAgIFtwYXJzZUludChyb3dzdGFydCwgMTApIC0gMSwgcGFyc2VJbnQoY29sc3RhcnQsIDEwKSAtIDFdLFxuICAgICAgICAgIFtwYXJzZUludChyb3dlbmQsIDEwKSAtIDEsIHBhcnNlSW50KGNvbGVuZCwgMTApIC0gMV1cbiAgICAgICAgXSlcbiAgICAgIGlmIChyYW5nZS5pc0VtcHR5KCkpIHsgY29udGludWUgfVxuICAgICAgaWYgKCFyYW5nZS5jb250YWluc1JhbmdlKGNyYW5nZSkpIHsgY29udGludWUgfVxuICAgICAgcmV0dXJuIHtcbiAgICAgICAgcmFuZ2U6IFV0aWwudGFiVW5zaGlmdEZvclJhbmdlKGJ1ZmZlciwgcmFuZ2UpLFxuICAgICAgICB0eXBlOiB0eXBlLnJlcGxhY2UoL1xcXFxcIi9nLCAnXCInKVxuICAgICAgfVxuICAgIH1cbiAgICB0aHJvdyBuZXcgRXJyb3IoJ05vIHR5cGUnKVxuICB9XG5cbiAgcHVibGljIGFzeW5jIGRvQ2FzZVNwbGl0IChidWZmZXI6IEF0b21UeXBlcy5UZXh0QnVmZmVyLCBjcmFuZ2U6IEF0b21UeXBlcy5SYW5nZSkge1xuICAgIGlmICghIGJ1ZmZlci5nZXRVcmkoKSkgeyB0aHJvdyBuZXcgRXJyb3IoJ05vIFVSSSBmb3IgYnVmZmVyJykgfVxuICAgIGNyYW5nZSA9IFV0aWwudGFiU2hpZnRGb3JSYW5nZShidWZmZXIsIGNyYW5nZSlcbiAgICBjb25zdCBsaW5lcyA9IGF3YWl0IHRoaXMucXVldWVDbWQoJ3R5cGVpbmZvJywgYXdhaXQgdGhpcy5nZXRSb290RGlyKGJ1ZmZlciksIHtcbiAgICAgIGludGVyYWN0aXZlOiB0aGlzLmNhcHMuaW50ZXJhY3RpdmVDYXNlU3BsaXQsXG4gICAgICBjb21tYW5kOiAnc3BsaXQnLFxuICAgICAgdXJpOiBidWZmZXIuZ2V0VXJpKCksXG4gICAgICB0ZXh0OiBidWZmZXIuaXNNb2RpZmllZCgpID8gYnVmZmVyLmdldFRleHQoKSA6IHVuZGVmaW5lZCxcbiAgICAgIGFyZ3M6IFtjcmFuZ2Uuc3RhcnQucm93ICsgMSwgY3JhbmdlLnN0YXJ0LmNvbHVtbiArIDFdLm1hcCgodikgPT4gdi50b1N0cmluZygpKVxuICAgIH0pXG5cbiAgICBjb25zdCByeCA9IC9eKFxcZCspXFxzKyhcXGQrKVxccysoXFxkKylcXHMrKFxcZCspXFxzK1wiKFteXSopXCIkLyAvLyBbXl0gYmFzaWNhbGx5IG1lYW5zIFwiYW55dGhpbmdcIiwgaW5jbC4gbmV3bGluZXNcbiAgICBjb25zdCByZXMgPSBbXVxuICAgIGZvciAoY29uc3QgbGluZSBvZiBsaW5lcykge1xuICAgICAgY29uc3QgbWF0Y2ggPSBsaW5lLm1hdGNoKHJ4KVxuICAgICAgaWYgKCEgbWF0Y2gpIHtcbiAgICAgICAgVXRpbC53YXJuKGBnaGMtbW9kIHNheXM6ICR7bGluZX1gKVxuICAgICAgICBjb250aW51ZVxuICAgICAgfVxuICAgICAgY29uc3QgW3Jvd3N0YXJ0LCBjb2xzdGFydCwgcm93ZW5kLCBjb2xlbmQsIHRleHRdID0gbWF0Y2guc2xpY2UoMSlcbiAgICAgIHJlcy5wdXNoKHtcbiAgICAgICAgcmFuZ2U6XG4gICAgICAgIFJhbmdlLmZyb21PYmplY3QoW1xuICAgICAgICAgIFtwYXJzZUludChyb3dzdGFydCwgMTApIC0gMSwgcGFyc2VJbnQoY29sc3RhcnQsIDEwKSAtIDFdLFxuICAgICAgICAgIFtwYXJzZUludChyb3dlbmQsIDEwKSAtIDEsIHBhcnNlSW50KGNvbGVuZCwgMTApIC0gMV1cbiAgICAgICAgXSksXG4gICAgICAgIHJlcGxhY2VtZW50OiB0ZXh0XG4gICAgICB9KVxuICAgIH1cbiAgICByZXR1cm4gcmVzXG4gIH1cblxuICBwdWJsaWMgYXN5bmMgZG9TaWdGaWxsIChidWZmZXI6IEF0b21UeXBlcy5UZXh0QnVmZmVyLCBjcmFuZ2U6IEF0b21UeXBlcy5SYW5nZSkge1xuICAgIGlmICghIGJ1ZmZlci5nZXRVcmkoKSkgeyB0aHJvdyBuZXcgRXJyb3IoJ05vIFVSSSBmb3IgYnVmZmVyJykgfVxuICAgIGNyYW5nZSA9IFV0aWwudGFiU2hpZnRGb3JSYW5nZShidWZmZXIsIGNyYW5nZSlcbiAgICBjb25zdCBsaW5lcyA9IGF3YWl0IHRoaXMucXVldWVDbWQoJ3R5cGVpbmZvJywgYXdhaXQgdGhpcy5nZXRSb290RGlyKGJ1ZmZlciksIHtcbiAgICAgIGludGVyYWN0aXZlOiB0aGlzLmNhcHMuaW50ZXJhY3RpdmVDYXNlU3BsaXQsXG4gICAgICBjb21tYW5kOiAnc2lnJyxcbiAgICAgIHVyaTogYnVmZmVyLmdldFVyaSgpLFxuICAgICAgdGV4dDogYnVmZmVyLmlzTW9kaWZpZWQoKSA/IGJ1ZmZlci5nZXRUZXh0KCkgOiB1bmRlZmluZWQsXG4gICAgICBhcmdzOiBbY3JhbmdlLnN0YXJ0LnJvdyArIDEsIGNyYW5nZS5zdGFydC5jb2x1bW4gKyAxXS5tYXAoKHYpID0+IHYudG9TdHJpbmcoKSlcbiAgICB9KVxuICAgIGlmIChsaW5lcy5sZW5ndGggPCAyKSB7IHRocm93IG5ldyBFcnJvcihgQ291bGQgbm90IHVuZGVyc3RhbmQgcmVzcG9uc2U6ICR7bGluZXMuam9pbignXFxuJyl9YCkgfVxuICAgIGNvbnN0IHJ4ID0gL14oXFxkKylcXHMrKFxcZCspXFxzKyhcXGQrKVxccysoXFxkKykkLyAvLyBwb3NpdGlvbiByeFxuICAgIGNvbnN0IG1hdGNoID0gbGluZXNbMV0ubWF0Y2gocngpXG4gICAgaWYgKCEgbWF0Y2gpIHsgdGhyb3cgbmV3IEVycm9yKGBDb3VsZCBub3QgdW5kZXJzdGFuZCByZXNwb25zZTogJHtsaW5lcy5qb2luKCdcXG4nKX1gKSB9XG4gICAgY29uc3QgW3Jvd3N0YXJ0LCBjb2xzdGFydCwgcm93ZW5kLCBjb2xlbmRdID0gbWF0Y2guc2xpY2UoMSlcbiAgICBjb25zdCByYW5nZSA9XG4gICAgICBSYW5nZS5mcm9tT2JqZWN0KFtcbiAgICAgICAgW3BhcnNlSW50KHJvd3N0YXJ0LCAxMCkgLSAxLCBwYXJzZUludChjb2xzdGFydCwgMTApIC0gMV0sXG4gICAgICAgIFtwYXJzZUludChyb3dlbmQsIDEwKSAtIDEsIHBhcnNlSW50KGNvbGVuZCwgMTApIC0gMV1cbiAgICAgIF0pXG4gICAgcmV0dXJuIHtcbiAgICAgIHR5cGU6IGxpbmVzWzBdLFxuICAgICAgcmFuZ2UsXG4gICAgICBib2R5OiBsaW5lcy5zbGljZSgyKS5qb2luKCdcXG4nKVxuICAgIH1cbiAgfVxuXG4gIHB1YmxpYyBhc3luYyBnZXRJbmZvSW5CdWZmZXIgKGVkaXRvcjogQXRvbVR5cGVzLlRleHRFZGl0b3IsIGNyYW5nZTogQXRvbVR5cGVzLlJhbmdlKSB7XG4gICAgY29uc3QgYnVmZmVyID0gZWRpdG9yLmdldEJ1ZmZlcigpXG4gICAgaWYgKCFidWZmZXIuZ2V0VXJpKCkpIHsgdGhyb3cgbmV3IEVycm9yKCdObyBVUkkgZm9yIGJ1ZmZlcicpIH1cbiAgICBjb25zdCB7IHN5bWJvbCwgcmFuZ2UgfSA9IFV0aWwuZ2V0U3ltYm9sSW5SYW5nZShlZGl0b3IsIGNyYW5nZSlcblxuICAgIGNvbnN0IGxpbmVzID0gYXdhaXQgdGhpcy5xdWV1ZUNtZCgndHlwZWluZm8nLCBhd2FpdCB0aGlzLmdldFJvb3REaXIoYnVmZmVyKSwge1xuICAgICAgaW50ZXJhY3RpdmU6IHRydWUsXG4gICAgICBjb21tYW5kOiAnaW5mbycsXG4gICAgICB1cmk6IGJ1ZmZlci5nZXRVcmkoKSxcbiAgICAgIHRleHQ6IGJ1ZmZlci5pc01vZGlmaWVkKCkgPyBidWZmZXIuZ2V0VGV4dCgpIDogdW5kZWZpbmVkLFxuICAgICAgYXJnczogW3N5bWJvbF1cbiAgICB9KVxuXG4gICAgY29uc3QgaW5mbyA9IGxpbmVzLmpvaW4oJ1xcbicpXG4gICAgaWYgKChpbmZvID09PSAnQ2Fubm90IHNob3cgaW5mbycpIHx8ICFpbmZvKSB7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoJ05vIGluZm8nKVxuICAgIH0gZWxzZSB7XG4gICAgICByZXR1cm4geyByYW5nZSwgaW5mbyB9XG4gICAgfVxuICB9XG5cbiAgcHVibGljIGFzeW5jIGZpbmRTeW1ib2xQcm92aWRlcnNJbkJ1ZmZlciAoZWRpdG9yOiBBdG9tVHlwZXMuVGV4dEVkaXRvciwgY3JhbmdlOiBBdG9tVHlwZXMuUmFuZ2UpIHtcbiAgICBjb25zdCBidWZmZXIgPSBlZGl0b3IuZ2V0QnVmZmVyKClcbiAgICBjb25zdCB7IHN5bWJvbCB9ID0gVXRpbC5nZXRTeW1ib2xJblJhbmdlKGVkaXRvciwgY3JhbmdlKVxuXG4gICAgcmV0dXJuIHRoaXMucXVldWVDbWQoJ2ZpbmQnLCBhd2FpdCB0aGlzLmdldFJvb3REaXIoYnVmZmVyKSwge1xuICAgICAgaW50ZXJhY3RpdmU6IHRydWUsXG4gICAgICBjb21tYW5kOiAnZmluZCcsXG4gICAgICBhcmdzOiBbc3ltYm9sXVxuICAgIH0pXG4gIH1cblxuICBwdWJsaWMgYXN5bmMgZG9DaGVja0J1ZmZlciAoYnVmZmVyOiBBdG9tVHlwZXMuVGV4dEJ1ZmZlciwgZmFzdDogYm9vbGVhbiA9IGZhbHNlKSB7XG4gICAgcmV0dXJuIHRoaXMuZG9DaGVja09yTGludEJ1ZmZlcignY2hlY2snLCBidWZmZXIsIGZhc3QpXG4gIH1cblxuICBwdWJsaWMgYXN5bmMgZG9MaW50QnVmZmVyIChidWZmZXI6IEF0b21UeXBlcy5UZXh0QnVmZmVyLCBmYXN0OiBib29sZWFuID0gZmFsc2UpIHtcbiAgICByZXR1cm4gdGhpcy5kb0NoZWNrT3JMaW50QnVmZmVyKCdsaW50JywgYnVmZmVyLCBmYXN0KVxuICB9XG5cbiAgcHVibGljIGFzeW5jIGRvQ2hlY2tBbmRMaW50IChidWZmZXI6IEF0b21UeXBlcy5UZXh0QnVmZmVyLCBmYXN0OiBib29sZWFuKSB7XG4gICAgY29uc3QgW2NyLCBscl0gPSBhd2FpdCBQcm9taXNlLmFsbChbdGhpcy5kb0NoZWNrQnVmZmVyKGJ1ZmZlciwgZmFzdCksIHRoaXMuZG9MaW50QnVmZmVyKGJ1ZmZlciwgZmFzdCldKVxuICAgIHJldHVybiBjci5jb25jYXQobHIpXG4gIH1cblxuICBwcml2YXRlIGFzeW5jIGluaXRCYWNrZW5kIChyb290RGlyOiBBdG9tVHlwZXMuRGlyZWN0b3J5KTogUHJvbWlzZTxHaGNNb2RpUHJvY2Vzc1JlYWw+IHtcbiAgICBjb25zdCByb290UGF0aCA9IHJvb3REaXIuZ2V0UGF0aCgpXG4gICAgY29uc3QgY2FjaGVkID0gdGhpcy5iYWNrZW5kLmdldChyb290UGF0aClcbiAgICBpZiAoY2FjaGVkKSB7IHJldHVybiBhd2FpdCBjYWNoZWQgfVxuICAgIGNvbnN0IG5ld0JhY2tlbmQgPSB0aGlzLmluaXRCYWNrZW5kUmVhbChyb290RGlyKVxuICAgIHRoaXMuYmFja2VuZC5zZXQocm9vdFBhdGgsIG5ld0JhY2tlbmQpXG4gICAgcmV0dXJuIGF3YWl0IG5ld0JhY2tlbmRcbiAgfVxuXG4gIHByaXZhdGUgYXN5bmMgaW5pdEJhY2tlbmRSZWFsIChyb290RGlyOiBBdG9tVHlwZXMuRGlyZWN0b3J5KTogUHJvbWlzZTxHaGNNb2RpUHJvY2Vzc1JlYWw+IHtcbiAgICB0cnkge1xuICAgICAgY29uc3Qgb3B0cyA9IGF3YWl0IFV0aWwuZ2V0UHJvY2Vzc09wdGlvbnMocm9vdERpci5nZXRQYXRoKCkpXG4gICAgICBjb25zdCB2ZXJzUCA9IHRoaXMuZ2V0VmVyc2lvbihvcHRzKVxuICAgICAgdmVyc1AudGhlbigodikgPT4geyB0aGlzLmNoZWNrQ29tcChvcHRzLCB2KSB9KVxuICAgICAgY29uc3QgdmVycyA9IGF3YWl0IHZlcnNQXG5cbiAgICAgIHRoaXMuY2FwcyA9IGF3YWl0IHRoaXMuZ2V0Q2Fwcyh2ZXJzKVxuICAgICAgY29uc3QgYmFja2VuZCA9IG5ldyBHaGNNb2RpUHJvY2Vzc1JlYWwodGhpcy5jYXBzLCByb290RGlyLCBvcHRzKVxuICAgICAgcmV0dXJuIGJhY2tlbmRcbiAgICB9IGNhdGNoIChlcnIpIHtcbiAgICAgIGF0b20ubm90aWZpY2F0aW9ucy5hZGRGYXRhbEVycm9yKFxuICAgICAgICBgXFxcbkhhc2tlbGwtZ2hjLW1vZDogZ2hjLW1vZCBmYWlsZWQgdG8gbGF1bmNoLlxuSXQgaXMgcHJvYmFibHkgbWlzc2luZyBvciBtaXNjb25maWd1cmVkLiAke2Vyci5jb2RlfWAsXG4gICAgICAgIHtcbiAgICAgICAgICBkZXRhaWw6IGBcXFxuJHtlcnJ9XG5QQVRIOiAke3Byb2Nlc3MuZW52LlBBVEh9XG5wYXRoOiAke3Byb2Nlc3MuZW52LnBhdGh9XG5QYXRoOiAke3Byb2Nlc3MuZW52LlBhdGh9XFxcbmAsXG4gICAgICAgICAgc3RhY2s6IGVyci5zdGFjayxcbiAgICAgICAgICBkaXNtaXNzYWJsZTogdHJ1ZVxuICAgICAgICB9XG4gICAgICApXG4gICAgICB0aHJvdyBlcnJcbiAgICB9XG4gIH1cblxuICBwcml2YXRlIGNyZWF0ZVF1ZXVlcyAoKSB7XG4gICAgdGhpcy5jb21tYW5kUXVldWVzID0ge1xuICAgICAgY2hlY2tsaW50OiBuZXcgUXVldWUoMiksXG4gICAgICBicm93c2U6IG5ldyBRdWV1ZShhdG9tLmNvbmZpZy5nZXQoJ2hhc2tlbGwtZ2hjLW1vZC5tYXhCcm93c2VQcm9jZXNzZXMnKSksXG4gICAgICB0eXBlaW5mbzogbmV3IFF1ZXVlKDEpLFxuICAgICAgZmluZDogbmV3IFF1ZXVlKDEpLFxuICAgICAgaW5pdDogbmV3IFF1ZXVlKDQpLFxuICAgICAgbGlzdDogbmV3IFF1ZXVlKDEpLFxuICAgICAgbG93bWVtOiBuZXcgUXVldWUoMSlcbiAgICB9XG4gICAgdGhpcy5kaXNwb3NhYmxlcy5hZGQoYXRvbS5jb25maWcub25EaWRDaGFuZ2UoJ2hhc2tlbGwtZ2hjLW1vZC5tYXhCcm93c2VQcm9jZXNzZXMnLCAoe25ld1ZhbHVlfSkgPT5cbiAgICAgIHRoaXMuY29tbWFuZFF1ZXVlcy5icm93c2UgPSBuZXcgUXVldWUobmV3VmFsdWUgYXMgbnVtYmVyKSlcbiAgICApXG4gIH1cblxuICBwcml2YXRlIGFzeW5jIGdldFZlcnNpb24gKG9wdHM6IFV0aWwuRXhlY09wdHMpIHtcbiAgICBjb25zdCB0aW1lb3V0ID0gYXRvbS5jb25maWcuZ2V0KCdoYXNrZWxsLWdoYy1tb2QuaW5pdFRpbWVvdXQnKSAqIDEwMDBcbiAgICBjb25zdCBjbWQgPSBhdG9tLmNvbmZpZy5nZXQoJ2hhc2tlbGwtZ2hjLW1vZC5naGNNb2RQYXRoJylcbiAgICBjb25zdCB7c3Rkb3V0fSA9IGF3YWl0IFV0aWwuZXhlY1Byb21pc2UoY21kLCBbJ3ZlcnNpb24nXSwgeyB0aW1lb3V0LCAuLi5vcHRzIH0pXG4gICAgY29uc3QgdmVyc1JhdyA9IC9eZ2hjLW1vZCB2ZXJzaW9uIChcXGQrKVxcLihcXGQrKVxcLihcXGQrKSg/OlxcLihcXGQrKSk/Ly5leGVjKHN0ZG91dClcbiAgICBpZiAoIXZlcnNSYXcpIHsgdGhyb3cgbmV3IEVycm9yKFwiQ291bGRuJ3QgZ2V0IGdoYy1tb2QgdmVyc2lvblwiKSB9XG4gICAgY29uc3QgdmVycyA9IHZlcnNSYXcuc2xpY2UoMSwgNSkubWFwKChpKSA9PiBwYXJzZUludChpLCAxMCkpXG4gICAgY29uc3QgY29tcFJhdyA9IC9HSEMgKC4rKSQvLmV4ZWMoc3Rkb3V0LnRyaW0oKSlcbiAgICBpZiAoIWNvbXBSYXcpIHsgdGhyb3cgbmV3IEVycm9yKFwiQ291bGRuJ3QgZ2V0IGdoYyB2ZXJzaW9uXCIpIH1cbiAgICBjb25zdCBjb21wID0gY29tcFJhd1sxXVxuICAgIFV0aWwuZGVidWcoYEdoYy1tb2QgJHt2ZXJzfSBidWlsdCB3aXRoICR7Y29tcH1gKVxuICAgIHJldHVybiB7IHZlcnMsIGNvbXAgfVxuICB9XG5cbiAgcHJpdmF0ZSBhc3luYyBjaGVja0NvbXAgKG9wdHM6IFV0aWwuRXhlY09wdHMsIHsgY29tcCB9OiB7Y29tcDogc3RyaW5nfSkge1xuICAgIGNvbnN0IHRpbWVvdXQgPSBhdG9tLmNvbmZpZy5nZXQoJ2hhc2tlbGwtZ2hjLW1vZC5pbml0VGltZW91dCcpICogMTAwMFxuICAgIGNvbnN0IHRyeVdhcm4gPSBhc3luYyAoY21kOiBzdHJpbmcsIGFyZ3M6IHN0cmluZ1tdKSA9PiB7XG4gICAgICB0cnkge1xuICAgICAgICByZXR1cm4gKGF3YWl0IFV0aWwuZXhlY1Byb21pc2UoY21kLCBhcmdzLCB7IHRpbWVvdXQsIC4uLm9wdHMgfSkpLnN0ZG91dC50cmltKClcbiAgICAgIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgICAgIFV0aWwud2FybihlcnJvcilcbiAgICAgIH1cbiAgICB9XG4gICAgY29uc3QgW3N0YWNrZ2hjLCBwYXRoZ2hjXSA9IGF3YWl0IFByb21pc2UuYWxsKFtcbiAgICAgIHRyeVdhcm4oJ3N0YWNrJywgWydnaGMnLCAnLS0nLCAnLS1udW1lcmljLXZlcnNpb24nXSksXG4gICAgICB0cnlXYXJuKCdnaGMnLCBbJy0tbnVtZXJpYy12ZXJzaW9uJ10pLFxuICAgIF0pXG4gICAgVXRpbC5kZWJ1ZyhgU3RhY2sgR0hDIHZlcnNpb24gJHtzdGFja2doY31gKVxuICAgIFV0aWwuZGVidWcoYFBhdGggR0hDIHZlcnNpb24gJHtwYXRoZ2hjfWApXG4gICAgaWYgKHN0YWNrZ2hjICYmIChzdGFja2doYyAhPT0gY29tcCkpIHtcbiAgICAgIGNvbnN0IHdhcm4gPSBgXFxcbkdIQyB2ZXJzaW9uIGluIHlvdXIgU3RhY2sgJyR7c3RhY2tnaGN9JyBkb2Vzbid0IG1hdGNoIHdpdGggXFxcbkdIQyB2ZXJzaW9uIHVzZWQgdG8gYnVpbGQgZ2hjLW1vZCAnJHtjb21wfScuIFRoaXMgY2FuIGxlYWQgdG8gXFxcbnByb2JsZW1zIHdoZW4gdXNpbmcgU3RhY2sgcHJvamVjdHNgXG4gICAgICBhdG9tLm5vdGlmaWNhdGlvbnMuYWRkV2FybmluZyh3YXJuKVxuICAgICAgVXRpbC53YXJuKHdhcm4pXG4gICAgfVxuICAgIGlmIChwYXRoZ2hjICYmIChwYXRoZ2hjICE9PSBjb21wKSkge1xuICAgICAgY29uc3Qgd2FybiA9IGBcXFxuR0hDIHZlcnNpb24gaW4geW91ciBQQVRIICcke3BhdGhnaGN9JyBkb2Vzbid0IG1hdGNoIHdpdGggXFxcbkdIQyB2ZXJzaW9uIHVzZWQgdG8gYnVpbGQgZ2hjLW1vZCAnJHtjb21wfScuIFRoaXMgY2FuIGxlYWQgdG8gXFxcbnByb2JsZW1zIHdoZW4gdXNpbmcgQ2FiYWwgb3IgUGxhaW4gcHJvamVjdHNgXG4gICAgICBhdG9tLm5vdGlmaWNhdGlvbnMuYWRkV2FybmluZyh3YXJuKVxuICAgICAgVXRpbC53YXJuKHdhcm4pXG4gICAgfVxuICB9XG5cbiAgcHJpdmF0ZSBnZXRDYXBzICh7IHZlcnMgfToge3ZlcnM6IG51bWJlcltdfSkge1xuICAgIGNvbnN0IGNhcHMgPSB7XG4gICAgICB2ZXJzaW9uOiB2ZXJzLFxuICAgICAgZmlsZU1hcDogZmFsc2UsXG4gICAgICBxdW90ZUFyZ3M6IGZhbHNlLFxuICAgICAgb3B0cGFyc2U6IGZhbHNlLFxuICAgICAgdHlwZUNvbnN0cmFpbnRzOiBmYWxzZSxcbiAgICAgIGJyb3dzZVBhcmVudHM6IGZhbHNlLFxuICAgICAgaW50ZXJhY3RpdmVDYXNlU3BsaXQ6IGZhbHNlLFxuICAgICAgaW1wb3J0ZWRGcm9tOiBmYWxzZVxuICAgIH1cblxuICAgIGNvbnN0IGF0TGVhc3QgPSAoYjogbnVtYmVyW10pID0+IHtcbiAgICAgIGZvciAobGV0IGkgPSAwOyBpIDwgYi5sZW5ndGg7IGkrKykge1xuICAgICAgICBjb25zdCB2ID0gYltpXVxuICAgICAgICBpZiAodmVyc1tpXSA+IHYpIHtcbiAgICAgICAgICByZXR1cm4gdHJ1ZVxuICAgICAgICB9IGVsc2UgaWYgKHZlcnNbaV0gPCB2KSB7XG4gICAgICAgICAgcmV0dXJuIGZhbHNlXG4gICAgICAgIH1cbiAgICAgIH1cbiAgICAgIHJldHVybiB0cnVlXG4gICAgfVxuXG4gICAgY29uc3QgZXhhY3QgPSAoYjogbnVtYmVyW10pID0+IHtcbiAgICAgIGZvciAobGV0IGkgPSAwOyBpIDwgYi5sZW5ndGg7IGkrKykge1xuICAgICAgICBjb25zdCB2ID0gYltpXVxuICAgICAgICBpZiAodmVyc1tpXSAhPT0gdikge1xuICAgICAgICAgIHJldHVybiBmYWxzZVxuICAgICAgICB9XG4gICAgICB9XG4gICAgICByZXR1cm4gdHJ1ZVxuICAgIH1cblxuICAgIGlmICghYXRMZWFzdChbNSwgNF0pKSB7XG4gICAgICBhdG9tLm5vdGlmaWNhdGlvbnMuYWRkRXJyb3IoYFxcXG5IYXNrZWxsLWdoYy1tb2Q6IGdoYy1tb2QgPCA1LjQgaXMgbm90IHN1cHBvcnRlZC4gXFxcblVzZSBhdCB5b3VyIG93biByaXNrIG9yIHVwZGF0ZSB5b3VyIGdoYy1tb2QgaW5zdGFsbGF0aW9uYCxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICB7IGRpc21pc3NhYmxlOiB0cnVlIH0pXG4gICAgfVxuICAgIGlmIChleGFjdChbNSwgNF0pKSB7XG4gICAgICBhdG9tLm5vdGlmaWNhdGlvbnMuYWRkV2FybmluZyhgXFxcbkhhc2tlbGwtZ2hjLW1vZDogZ2hjLW1vZCA1LjQuKiBpcyBkZXByZWNhdGVkLiBcXFxuVXNlIGF0IHlvdXIgb3duIHJpc2sgb3IgdXBkYXRlIHlvdXIgZ2hjLW1vZCBpbnN0YWxsYXRpb25gLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgeyBkaXNtaXNzYWJsZTogdHJ1ZSB9KVxuICAgIH1cbiAgICBpZiAoYXRMZWFzdChbNSwgNF0pKSB7XG4gICAgICBjYXBzLmZpbGVNYXAgPSB0cnVlXG4gICAgfVxuICAgIGlmIChhdExlYXN0KFs1LCA1XSkpIHtcbiAgICAgIGNhcHMucXVvdGVBcmdzID0gdHJ1ZVxuICAgICAgY2Fwcy5vcHRwYXJzZSA9IHRydWVcbiAgICB9XG4gICAgaWYgKGF0TGVhc3QoWzUsIDZdKSkge1xuICAgICAgY2Fwcy50eXBlQ29uc3RyYWludHMgPSB0cnVlXG4gICAgICBjYXBzLmJyb3dzZVBhcmVudHMgPSB0cnVlXG4gICAgICBjYXBzLmludGVyYWN0aXZlQ2FzZVNwbGl0ID0gdHJ1ZVxuICAgIH1cbiAgICBpZiAoYXRvbS5jb25maWcuZ2V0KCdoYXNrZWxsLWdoYy1tb2QuZXhwZXJpbWVudGFsJykpIHtcbiAgICAgIGNhcHMuaW1wb3J0ZWRGcm9tID0gdHJ1ZVxuICAgIH1cbiAgICBVdGlsLmRlYnVnKEpTT04uc3RyaW5naWZ5KGNhcHMpKVxuICAgIHJldHVybiBjYXBzXG4gIH1cblxuICBwcml2YXRlIGFzeW5jIGdldFNldHRpbmdzIChydW5EaXI6IEF0b21UeXBlcy5EaXJlY3RvcnkpIHtcbiAgICBjb25zdCByZWFkU2V0dGluZ3MgPSBhc3luYyAoZmlsZTogQXRvbVR5cGVzLkZpbGUpID0+IHtcbiAgICAgIHRyeSB7XG4gICAgICAgIGNvbnN0IGV4ID0gYXdhaXQgZmlsZS5leGlzdHMoKVxuICAgICAgICBpZiAoZXgpIHtcbiAgICAgICAgICBjb25zdCBjb250ZW50cyA9IGF3YWl0IGZpbGUucmVhZCgpXG4gICAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgIHJldHVybiBKU09OLnBhcnNlKGNvbnRlbnRzKVxuICAgICAgICAgIH0gY2F0Y2ggKGVycikge1xuICAgICAgICAgICAgYXRvbS5ub3RpZmljYXRpb25zLmFkZEVycm9yKGBGYWlsZWQgdG8gcGFyc2UgJHtmaWxlLmdldFBhdGgoKX1gLCB7XG4gICAgICAgICAgICAgIGRldGFpbDogZXJyLFxuICAgICAgICAgICAgICBkaXNtaXNzYWJsZTogdHJ1ZVxuICAgICAgICAgICAgfSlcbiAgICAgICAgICAgIHRocm93IGVyclxuICAgICAgICAgIH1cbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICByZXR1cm4ge31cbiAgICAgICAgfVxuICAgICAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICAgICAgaWYgKGVycm9yKSB7IFV0aWwud2FybihlcnJvcikgfVxuICAgICAgICByZXR1cm4ge31cbiAgICAgIH1cbiAgICB9XG5cbiAgICBjb25zdCBsb2NhbFNldHRpbmdzID0gcmVhZFNldHRpbmdzKHJ1bkRpci5nZXRGaWxlKCcuaGFza2VsbC1naGMtbW9kLmpzb24nKSlcblxuICAgIGNvbnN0IFtwcm9qZWN0RGlyXSA9IEFycmF5LmZyb20oYXRvbS5wcm9qZWN0LmdldERpcmVjdG9yaWVzKCkuZmlsdGVyKChkKSA9PiBkLmNvbnRhaW5zKHJ1bkRpci5nZXRQYXRoKCkpKSlcbiAgICBjb25zdCBwcm9qZWN0U2V0dGluZ3MgPVxuICAgICAgcHJvamVjdERpciA/XG4gICAgICAgIHJlYWRTZXR0aW5ncyhwcm9qZWN0RGlyLmdldEZpbGUoJy5oYXNrZWxsLWdoYy1tb2QuanNvbicpKVxuICAgICAgICA6XG4gICAgICAgIFByb21pc2UucmVzb2x2ZSh7fSlcblxuICAgIGNvbnN0IGNvbmZpZ0RpciA9IG5ldyBEaXJlY3RvcnkoYXRvbS5nZXRDb25maWdEaXJQYXRoKCkpXG4gICAgY29uc3QgZ2xvYmFsU2V0dGluZ3MgPSByZWFkU2V0dGluZ3MoY29uZmlnRGlyLmdldEZpbGUoJ2hhc2tlbGwtZ2hjLW1vZC5qc29uJykpXG5cbiAgICBjb25zdCBbZ2xvYiwgcHJqLCBsb2NdID0gYXdhaXQgUHJvbWlzZS5hbGwoW2dsb2JhbFNldHRpbmdzLCBwcm9qZWN0U2V0dGluZ3MsIGxvY2FsU2V0dGluZ3NdKVxuICAgIHJldHVybiB7IC4uLmdsb2IsIC4uLnByaiwgLi4ubG9jIH1cbiAgfVxuXG4gIHByaXZhdGUgYXN5bmMgcXVldWVDbWQgKFxuICAgIHF1ZXVlTmFtZTogQ29tbWFuZHMsXG4gICAgZGlyOiBBdG9tVHlwZXMuRGlyZWN0b3J5LFxuICAgIHJ1bkFyZ3M6IHtcbiAgICAgIGNvbW1hbmQ6IHN0cmluZywgdGV4dD86IHN0cmluZywgdXJpPzogc3RyaW5nLCBpbnRlcmFjdGl2ZT86IGJvb2xlYW4sXG4gICAgICBkYXNoQXJncz86IHN0cmluZ1tdIHwgKChjYXBzOiBHSENNb2RDYXBzKSA9PiBzdHJpbmdbXSksIGFyZ3M/OiBzdHJpbmdbXVxuICAgIH1cbiAgKTogUHJvbWlzZTxzdHJpbmdbXT4ge1xuICAgIGlmIChhdG9tLmNvbmZpZy5nZXQoJ2hhc2tlbGwtZ2hjLW1vZC5sb3dNZW1vcnlTeXN0ZW0nKSkge1xuICAgICAgcXVldWVOYW1lID0gJ2xvd21lbSdcbiAgICB9XG4gICAgY29uc3QgYmFja2VuZCA9IGF3YWl0IHRoaXMuaW5pdEJhY2tlbmQoZGlyKVxuICAgIGNvbnN0IHByb21pc2UgPSB0aGlzLmNvbW1hbmRRdWV1ZXNbcXVldWVOYW1lXS5hZGQoYXN5bmMgKCkgPT4ge1xuICAgICAgdGhpcy5lbWl0dGVyLmVtaXQoJ2JhY2tlbmQtYWN0aXZlJylcbiAgICAgIHRyeSB7XG4gICAgICAgIGNvbnN0IHNldHRpbmdzID0gYXdhaXQgdGhpcy5nZXRTZXR0aW5ncyhkaXIpXG4gICAgICAgIGlmIChzZXR0aW5ncy5kaXNhYmxlKSB7IHRocm93IG5ldyBFcnJvcignR2hjLW1vZCBkaXNhYmxlZCBpbiBzZXR0aW5ncycpIH1cbiAgICAgICAgcmV0dXJuIGJhY2tlbmQucnVuKHtcbiAgICAgICAgICAuLi5ydW5BcmdzLFxuICAgICAgICAgIHN1cHByZXNzRXJyb3JzOiBzZXR0aW5ncy5zdXBwcmVzc0Vycm9ycyxcbiAgICAgICAgICBnaGNPcHRpb25zOiBzZXR0aW5ncy5naGNPcHRpb25zLFxuICAgICAgICAgIGdoY01vZE9wdGlvbnM6IHNldHRpbmdzLmdoY01vZE9wdGlvbnMsXG4gICAgICAgIH0pXG4gICAgICB9IGNhdGNoIChlcnIpIHtcbiAgICAgICAgICBVdGlsLndhcm4oZXJyKVxuICAgICAgICAgIHRocm93IGVyclxuICAgICAgfVxuICAgIH0pXG4gICAgcHJvbWlzZS50aGVuKChyZXMpID0+IHtcbiAgICAgIGNvbnN0IHFlID0gKHFuOiBDb21tYW5kcykgPT4ge1xuICAgICAgICBjb25zdCBxID0gdGhpcy5jb21tYW5kUXVldWVzW3FuXVxuICAgICAgICByZXR1cm4gKHEuZ2V0UXVldWVMZW5ndGgoKSArIHEuZ2V0UGVuZGluZ0xlbmd0aCgpKSA9PT0gMFxuICAgICAgfVxuICAgICAgaWYgKHFlKHF1ZXVlTmFtZSkpIHtcbiAgICAgICAgdGhpcy5lbWl0dGVyLmVtaXQoJ3F1ZXVlLWlkbGUnLCB7IHF1ZXVlOiBxdWV1ZU5hbWUgfSlcbiAgICAgICAgaWYgKE9iamVjdC5rZXlzKHRoaXMuY29tbWFuZFF1ZXVlcykuZXZlcnkocWUpKSB7XG4gICAgICAgICAgdGhpcy5lbWl0dGVyLmVtaXQoJ2JhY2tlbmQtaWRsZScpXG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9KVxuICAgIHJldHVybiBwcm9taXNlXG4gIH1cblxuICBwcml2YXRlIGFzeW5jIGRvQ2hlY2tPckxpbnRCdWZmZXIgKGNtZDogJ2NoZWNrJyB8ICdsaW50JywgYnVmZmVyOiBBdG9tVHlwZXMuVGV4dEJ1ZmZlciwgZmFzdDogYm9vbGVhbikge1xuICAgIGxldCBkYXNoQXJnc1xuICAgIGlmIChidWZmZXIuaXNFbXB0eSgpKSB7IHJldHVybiBbXSB9XG4gICAgaWYgKCEgYnVmZmVyLmdldFVyaSgpKSB7IHJldHVybiBbXSB9XG5cbiAgICAvLyBBIGRpcnR5IGhhY2sgdG8gbWFrZSBsaW50IHdvcmsgd2l0aCBsaHNcbiAgICBsZXQgdXJpID0gYnVmZmVyLmdldFVyaSgpXG4gICAgY29uc3Qgb2xkdXJpID0gYnVmZmVyLmdldFVyaSgpXG4gICAgbGV0IHRleHRcbiAgICB0cnkge1xuICAgICAgaWYgKChjbWQgPT09ICdsaW50JykgJiYgKGV4dG5hbWUodXJpKSA9PT0gJy5saHMnKSkge1xuICAgICAgICB1cmkgPSB1cmkuc2xpY2UoMCwgLTEpXG4gICAgICAgIHRleHQgPSBhd2FpdCB1bmxpdChvbGR1cmksIGJ1ZmZlci5nZXRUZXh0KCkpXG4gICAgICB9IGVsc2UgaWYgKGJ1ZmZlci5pc01vZGlmaWVkKCkpIHtcbiAgICAgICAgdGV4dCA9IGJ1ZmZlci5nZXRUZXh0KClcbiAgICAgIH1cbiAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgLy8gVE9ETzogUmVqZWN0XG4gICAgICBjb25zdCBtID0gKGVycm9yIGFzIEVycm9yKS5tZXNzYWdlLm1hdGNoKC9eKC4qPyk6KFswLTldKyk6ICooLiopICokLylcbiAgICAgIGlmICghbSkgeyB0aHJvdyBlcnJvciB9XG4gICAgICBjb25zdCBbdXJpMiwgbGluZSwgbWVzc10gPSBtLnNsaWNlKDEpXG4gICAgICByZXR1cm4gW3tcbiAgICAgICAgdXJpOiB1cmkyLFxuICAgICAgICBwb3NpdGlvbjogbmV3IFBvaW50KHBhcnNlSW50KGxpbmUsIDEwKSAtIDEsIDApLFxuICAgICAgICBtZXNzYWdlOiBtZXNzLFxuICAgICAgICBzZXZlcml0eTogJ2xpbnQnXG4gICAgICB9XVxuICAgIH1cbiAgICAvLyBlbmQgb2YgZGlydHkgaGFja1xuXG4gICAgaWYgKGNtZCA9PT0gJ2xpbnQnKSB7XG4gICAgICBjb25zdCBvcHRzOiBzdHJpbmdbXSA9IGF0b20uY29uZmlnLmdldCgnaGFza2VsbC1naGMtbW9kLmhsaW50T3B0aW9ucycpXG4gICAgICBkYXNoQXJncyA9IFtdXG4gICAgICBmb3IgKGNvbnN0IG9wdCBvZiBvcHRzKSB7XG4gICAgICAgIGRhc2hBcmdzLnB1c2goJy0taGxpbnRPcHQnLCBvcHQpXG4gICAgICB9XG4gICAgfVxuXG4gICAgY29uc3Qgcm9vdERpciA9IGF3YWl0IHRoaXMuZ2V0Um9vdERpcihidWZmZXIpXG5cbiAgICBjb25zdCBsaW5lcyA9IGF3YWl0IHRoaXMucXVldWVDbWQoJ2NoZWNrbGludCcsIHJvb3REaXIsIHtcbiAgICAgIGludGVyYWN0aXZlOiBmYXN0LFxuICAgICAgY29tbWFuZDogY21kLFxuICAgICAgdXJpLFxuICAgICAgdGV4dCxcbiAgICAgIGRhc2hBcmdzXG4gICAgfSlcblxuICAgIGNvbnN0IHJ4ID0gL14oLio/KTooWzAtOVxcc10rKTooWzAtOVxcc10rKTogKig/OihXYXJuaW5nfEVycm9yKTogKik/KFteXSopL1xuICAgIGNvbnN0IHJlcyA9IFtdXG4gICAgZm9yIChjb25zdCBsaW5lIG9mIGxpbmVzKSB7XG4gICAgICBjb25zdCBtYXRjaCA9IGxpbmUubWF0Y2gocngpXG4gICAgICBpZiAoIW1hdGNoKSB7XG4gICAgICAgIGlmIChsaW5lLnRyaW0oKS5sZW5ndGgpIHsgVXRpbC53YXJuKGBnaGMtbW9kIHNheXM6ICR7bGluZX1gKSB9XG4gICAgICAgIGNvbnRpbnVlXG4gICAgICB9XG4gICAgICBjb25zdCBbZmlsZTIsIHJvdywgY29sLCB3YXJuaW5nLCBtZXNzYWdlXSA9IG1hdGNoLnNsaWNlKDEpXG4gICAgICBpZiAoZmlsZTIgPT09ICdEdW1teScgJiYgcm93ID09PSAnMCcgJiYgY29sID09PSAnMCcpIHtcbiAgICAgICAgaWYgKHdhcm5pbmcgPT09ICdFcnJvcicpIHtcbiAgICAgICAgICBhdG9tLm5vdGlmaWNhdGlvbnMuYWRkRXJyb3IobWVzc2FnZSlcbiAgICAgICAgICBjb250aW51ZVxuICAgICAgICB9IGVsc2UgaWYgKHdhcm5pbmcgPT09ICdXYXJuaW5nJykge1xuICAgICAgICAgIGF0b20ubm90aWZpY2F0aW9ucy5hZGRXYXJuaW5nKG1lc3NhZ2UpXG4gICAgICAgICAgY29udGludWVcbiAgICAgICAgfVxuICAgICAgfVxuXG4gICAgICBjb25zdCBmaWxlID0gdXJpLmVuZHNXaXRoKGZpbGUyKSA/IG9sZHVyaSA6IGZpbGUyXG4gICAgICBjb25zdCBzZXZlcml0eSA9XG4gICAgICAgIGNtZCA9PT0gJ2xpbnQnID9cbiAgICAgICAgICAnbGludCdcbiAgICAgICAgICA6IHdhcm5pbmcgPT09ICdXYXJuaW5nJyA/XG4gICAgICAgICAgICAnd2FybmluZydcbiAgICAgICAgICAgIDpcbiAgICAgICAgICAgICdlcnJvcidcbiAgICAgIGNvbnN0IG1lc3NQb3MgPSBuZXcgUG9pbnQocGFyc2VJbnQocm93LCAxMCkgLSAxLCBwYXJzZUludChjb2wsIDEwKSAtIDEpXG4gICAgICBjb25zdCBwb3NpdGlvbiA9IFV0aWwudGFiVW5zaGlmdEZvclBvaW50KGJ1ZmZlciwgbWVzc1BvcylcbiAgICAgIGxldCBteXVyaVxuICAgICAgdHJ5IHtcbiAgICAgICAgbXl1cmkgPSByb290RGlyLmdldEZpbGUocm9vdERpci5yZWxhdGl2aXplKGZpbGUpKS5nZXRQYXRoKClcbiAgICAgIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgICAgIG15dXJpID0gZmlsZVxuICAgICAgfVxuICAgICAgcmVzLnB1c2goe1xuICAgICAgICB1cmk6IG15dXJpLFxuICAgICAgICBwb3NpdGlvbixcbiAgICAgICAgbWVzc2FnZSxcbiAgICAgICAgc2V2ZXJpdHlcbiAgICAgIH0pXG4gICAgfVxuICAgIHJldHVybiByZXNcbiAgfVxufVxuIl19