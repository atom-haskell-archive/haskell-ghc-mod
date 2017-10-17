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
const ghc_modi_process_real_factory_1 = require("./ghc-modi-process-real-factory");
class GhcModiProcess {
    constructor() {
        this.disposables = new atom_1.CompositeDisposable();
        this.emitter = new atom_1.Emitter();
        this.disposables.add(this.emitter);
        this.bufferDirMap = new WeakMap();
        this.backend = new Map();
        if (process.env.GHC_PACKAGE_PATH && !atom.config.get('haskell-ghc-mod.suppressGhcPackagePathWarning')) {
            Util.warnGHCPackagePath();
        }
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
            return this.queueCmd('list', yield this.getRootDir(buffer), () => ({ command: 'list' }));
        });
    }
    runLang(dir) {
        return __awaiter(this, void 0, void 0, function* () {
            return this.queueCmd('init', dir, () => ({ command: 'lang' }));
        });
    }
    runFlag(dir) {
        return __awaiter(this, void 0, void 0, function* () {
            return this.queueCmd('init', dir, () => ({ command: 'flag' }));
        });
    }
    runBrowse(rootDir, modules) {
        return __awaiter(this, void 0, void 0, function* () {
            const lines = yield this.queueCmd('browse', rootDir, (caps) => ({
                command: 'browse',
                dashArgs: caps.browseParents ? ['-d', '-o', '-p'] : ['-d', '-o'],
                args: caps.browseMain ? modules : modules.filter((v) => v !== 'Main'),
            }));
            return lines.map((s) => {
                const pattern = /^(.*?) :: (.*?)(?: -- from:(.*))?$/;
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
            const lines = yield this.queueCmd('typeinfo', rootDir, (caps) => ({
                interactive: true,
                command: 'type',
                uri: buffer.getUri(),
                text: buffer.isModified() ? buffer.getText() : undefined,
                dashArgs: caps.typeConstraints ? ['-c'] : [],
                args: [crange.start.row + 1, crange.start.column + 1].map((v) => v.toString()),
            }));
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
            const lines = yield this.queueCmd('typeinfo', rootDir, (caps) => ({
                interactive: caps.interactiveCaseSplit,
                command: 'split',
                uri: buffer.getUri(),
                text: buffer.isModified() ? buffer.getText() : undefined,
                args: [crange.start.row + 1, crange.start.column + 1].map((v) => v.toString()),
            }));
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
            const lines = yield this.queueCmd('typeinfo', rootDir, (caps) => ({
                interactive: caps.interactiveCaseSplit,
                command: 'sig',
                uri: buffer.getUri(),
                text: buffer.isModified() ? buffer.getText() : undefined,
                args: [crange.start.row + 1, crange.start.column + 1].map((v) => v.toString()),
            }));
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
            const lines = yield this.queueCmd('typeinfo', yield this.getRootDir(buffer), () => ({
                interactive: true,
                command: 'info',
                uri: buffer.getUri(),
                text: buffer.isModified() ? buffer.getText() : undefined,
                args: [symbol],
            }));
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
            return this.queueCmd('find', yield this.getRootDir(buffer), () => ({
                interactive: true,
                command: 'find',
                args: [symbol],
            }));
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
            const newBackend = ghc_modi_process_real_factory_1.createGhcModiProcessReal(rootDir);
            this.backend.set(rootPath, newBackend);
            const backend = yield newBackend;
            this.disposables.add(backend.onError((arg) => this.emitter.emit('error', arg)), backend.onWarning((arg) => this.emitter.emit('warning', arg)));
            return backend;
        });
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
    queueCmd(queueName, dir, runArgsFunc) {
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
                    return backend.run(Object.assign({}, runArgsFunc(backend.getCaps()), { suppressErrors: settings.suppressErrors, ghcOptions: settings.ghcOptions, ghcModOptions: settings.ghcModOptions }));
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
            const textB = text;
            const dashArgsB = dashArgs;
            const lines = yield this.queueCmd('checklint', rootDir, () => ({
                interactive: fast,
                command: cmd,
                uri,
                text: textB,
                dashArgs: dashArgsB,
            }));
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
                        this.emitter.emit('error', {
                            err: Util.mkError('GHCModStdoutError', message),
                            caps: (yield this.initBackend(rootDir)).getCaps(),
                        });
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaW5kZXguanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi9zcmMvZ2hjLW1vZC9pbmRleC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOzs7Ozs7Ozs7O0FBQUEsK0JBQXNGO0FBQ3RGLGdDQUErQjtBQUMvQiwrQkFBOEI7QUFDOUIsdUNBQXVDO0FBQ3ZDLDJEQUEwQztBQUcxQyxtRkFBMEU7QUFhMUU7SUFjRTtRQUNFLElBQUksQ0FBQyxXQUFXLEdBQUcsSUFBSSwwQkFBbUIsRUFBRSxDQUFBO1FBQzVDLElBQUksQ0FBQyxPQUFPLEdBQUcsSUFBSSxjQUFPLEVBQUUsQ0FBQTtRQUM1QixJQUFJLENBQUMsV0FBVyxDQUFDLEdBQUcsQ0FBQyxJQUFJLENBQUMsT0FBTyxDQUFDLENBQUE7UUFDbEMsSUFBSSxDQUFDLFlBQVksR0FBRyxJQUFJLE9BQU8sRUFBRSxDQUFBO1FBQ2pDLElBQUksQ0FBQyxPQUFPLEdBQUcsSUFBSSxHQUFHLEVBQUUsQ0FBQTtRQUV4QixFQUFFLENBQUMsQ0FBQyxPQUFPLENBQUMsR0FBRyxDQUFDLGdCQUFnQixJQUFJLENBQUMsSUFBSSxDQUFDLE1BQU0sQ0FBQyxHQUFHLENBQUMsK0NBQStDLENBQUMsQ0FBQyxDQUFDLENBQUM7WUFDdEcsSUFBSSxDQUFDLGtCQUFrQixFQUFFLENBQUE7UUFDM0IsQ0FBQztRQUVELElBQUksQ0FBQyxhQUFhLEdBQUc7WUFDbkIsU0FBUyxFQUFFLElBQUksS0FBSyxDQUFDLENBQUMsQ0FBQztZQUN2QixNQUFNLEVBQUUsSUFBSSxLQUFLLENBQUMsSUFBSSxDQUFDLE1BQU0sQ0FBQyxHQUFHLENBQUMsb0NBQW9DLENBQUMsQ0FBQztZQUN4RSxRQUFRLEVBQUUsSUFBSSxLQUFLLENBQUMsQ0FBQyxDQUFDO1lBQ3RCLElBQUksRUFBRSxJQUFJLEtBQUssQ0FBQyxDQUFDLENBQUM7WUFDbEIsSUFBSSxFQUFFLElBQUksS0FBSyxDQUFDLENBQUMsQ0FBQztZQUNsQixJQUFJLEVBQUUsSUFB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ZixLQUFLLEdBQUcsSUFBSSxDQUFBO2dCQUNkLENBQUM7Z0JBQ0QsR0FBRyxDQUFDLElBQUksQ0FBQztvQkFDUCxHQUFHLEVBQUUsS0FBSztvQkFDVixRQUFRO29CQUNSLE9BQU87b0JBQ1AsUUFBUTtpQkFDVCxDQUFDLENBQUE7WUFDSixDQUFDO1lBQ0QsTUFBTSxDQUFDLEdBQUcsQ0FBQTtRQUNaLENBQUM7S0FBQTtDQUNGO0FBL2RELHdDQStkQyIsInNvdXJjZXNDb250ZW50IjpbImltcG9ydCB7IFJhbmdlLCBQb2ludCwgVEVtaXR0ZXIsIEVtaXR0ZXIsIENvbXBvc2l0ZURpc3Bvc2FibGUsIERpcmVjdG9yeSB9IGZyb20gJ2F0b20nXG5pbXBvcnQgKiBhcyBVdGlsIGZyb20gJy4uL3V0aWwnXG5pbXBvcnQgeyBleHRuYW1lIH0gZnJvbSAncGF0aCdcbmltcG9ydCBRdWV1ZSA9IHJlcXVpcmUoJ3Byb21pc2UtcXVldWUnKVxuaW1wb3J0IHsgdW5saXQgfSBmcm9tICdhdG9tLWhhc2tlbGwtdXRpbHMnXG5cbmltcG9ydCB7IEdoY01vZGlQcm9jZXNzUmVhbCwgR0hDTW9kQ2FwcywgUnVuQXJncywgSUVycm9yQ2FsbGJhY2tBcmdzIH0gZnJvbSAnLi9naGMtbW9kaS1wcm9jZXNzLXJlYWwnXG5pbXBvcnQgeyBjcmVhdGVHaGNNb2RpUHJvY2Vzc1JlYWwgfSBmcm9tICcuL2doYy1tb2RpLXByb2Nlc3MtcmVhbC1mYWN0b3J5J1xuXG5leHBvcnQgeyBJRXJyb3JDYWxsYmFja0FyZ3MsIFJ1bkFyZ3MsIEdIQ01vZENhcHMgfVxuXG50eXBlIENvbW1hbmRzID0gJ2NoZWNrbGludCcgfCAnYnJvd3NlJyB8ICd0eXBlaW5mbycgfCAnZmluZCcgfCAnaW5pdCcgfCAnbGlzdCcgfCAnbG93bWVtJ1xuXG5leHBvcnQgaW50ZXJmYWNlIFN5bWJvbERlc2Mge1xuICBuYW1lOiBzdHJpbmcsXG4gIHN5bWJvbFR5cGU6IFVQSS5Db21wbGV0aW9uQmFja2VuZC5TeW1ib2xUeXBlLFxuICB0eXBlU2lnbmF0dXJlPzogc3RyaW5nLFxuICBwYXJlbnQ/OiBzdHJpbmdcbn1cblxuZXhwb3J0IGNsYXNzIEdoY01vZGlQcm9jZXNzIHtcbiAgcHJpdmF0ZSBiYWNrZW5kOiBNYXA8c3RyaW5nLCBQcm9taXNlPEdoY01vZGlQcm9jZXNzUmVhbD4+XG4gIHByaXZhdGUgZGlzcG9zYWJsZXM6IENvbXBvc2l0ZURpc3Bvc2FibGVcbiAgcHJpdmF0ZSBlbWl0dGVyOiBURW1pdHRlcjx7XG4gICAgJ2RpZC1kZXN0cm95JzogdW5kZWZpbmVkXG4gICAgJ3dhcm5pbmcnOiBzdHJpbmdcbiAgICAnZXJyb3InOiBJRXJyb3JDYWxsYmFja0FyZ3NcbiAgICAnYmFja2VuZC1hY3RpdmUnOiB2b2lkXG4gICAgJ2JhY2tlbmQtaWRsZSc6IHZvaWRcbiAgICAncXVldWUtaWRsZSc6IHsgcXVldWU6IENvbW1hbmRzIH1cbiAgfT5cbiAgcHJpdmF0ZSBidWZmZXJEaXJNYXA6IFdlYWtNYXA8QXRvbVR5cGVzLlRleHRCdWZmZXIsIEF0b21UeXBlcy5EaXJlY3Rvcnk+XG4gIHByaXZhdGUgY29tbWFuZFF1ZXVlczoge1tLIGluIENvbW1hbmRzXTogUXVldWV9XG5cbiAgY29uc3RydWN0b3IoKSB7XG4gICAgdGhpcy5kaXNwb3NhYmxlcyA9IG5ldyBDb21wb3NpdGVEaXNwb3NhYmxlKClcbiAgICB0aGlzLmVtaXR0ZXIgPSBuZXcgRW1pdHRlcigpXG4gICAgdGhpcy5kaXNwb3NhYmxlcy5hZGQodGhpcy5lbWl0dGVyKVxuICAgIHRoaXMuYnVmZmVyRGlyTWFwID0gbmV3IFdlYWtNYXAoKVxuICAgIHRoaXMuYmFja2VuZCA9IG5ldyBNYXAoKVxuXG4gICAgaWYgKHByb2Nlc3MuZW52LkdIQ19QQUNLQUdFX1BBVEggJiYgIWF0b20uY29uZmlnLmdldCgnaGFza2VsbC1naGMtbW9kLnN1cHByZXNzR2hjUGFja2FnZVBhdGhXYXJuaW5nJykpIHtcbiAgICAgIFV0aWwud2FybkdIQ1BhY2thZ2VQYXRoKClcbiAgICB9XG5cbiAgICB0aGlzLmNvbW1hbmRRdWV1ZXMgPSB7XG4gICAgICBjaGVja2xpbnQ6IG5ldyBRdWV1ZSgyKSxcbiAgICAgIGJyb3dzZTogbmV3IFF1ZXVlKGF0b20uY29uZmlnLmdldCgnaGFza2VsbC1naGMtbW9kLm1heEJyb3dzZVByb2Nlc3NlcycpKSxcbiAgICAgIHR5cGVpbmZvOiBuZXcgUXVldWUoMSksXG4gICAgICBmaW5kOiBuZXcgUXVldWUoMSksXG4gICAgICBpbml0OiBuZXcgUXVldWUoNCksXG4gICAgICBsaXN0OiBuZXcgUXVldWUoMSksXG4gICAgICBsb3dtZW06IG5ldyBRdWV1ZSgxKSxcbiAgICB9XG4gICAgdGhpcy5kaXNwb3NhYmxlcy5hZGQoYXRvbS5jb25maWcub25EaWRDaGFuZ2UoJ2hhc2tlbGwtZ2hjLW1vZC5tYXhCcm93c2VQcm9jZXNzZXMnLCAoeyBuZXdWYWx1ZSB9KSA9PlxuICAgICAgdGhpcy5jb21tYW5kUXVldWVzLmJyb3dzZSA9IG5ldyBRdWV1ZShuZXdWYWx1ZSBhcyBudW1iZXIpKSxcbiAgICApXG4gIH1cblxuICBwdWJsaWMgYXN5bmMgZ2V0Um9vdERpcihidWZmZXI6IEF0b21UeXBlcy5UZXh0QnVmZmVyKTogUHJvbWlzZTxBdG9tVHlwZXMuRGlyZWN0b3J5PiB7XG4gICAgbGV0IGRpclxuICAgIGRpciA9IHRoaXMuYnVmZmVyRGlyTWFwLmdldChidWZmZXIpXG4gICAgaWYgKGRpcikge1xuICAgICAgcmV0dXJuIGRpclxuICAgIH1cbiAgICBkaXIgPSBhd2FpdCBVdGlsLmdldFJvb3REaXIoYnVmZmVyKVxuICAgIHRoaXMuYnVmZmVyRGlyTWFwLnNldChidWZmZXIsIGRpcilcbiAgICByZXR1cm4gZGlyXG4gIH1cblxuICBwdWJsaWMga2lsbFByb2Nlc3MoKSB7XG4gICAgZm9yIChjb25zdCBicCBvZiB0aGlzLmJhY2tlbmQudmFsdWVzKCkpIHtcbiAgICAgIGJwLnRoZW4oKGIpID0+IGIua2lsbFByb2Nlc3MoKSlcbiAgICB9XG4gICAgdGhpcy5iYWNrZW5kLmNsZWFyKClcbiAgfVxuXG4gIHB1YmxpYyBkZXN0cm95KCkge1xuICAgIGZvciAoY29uc3QgYnAgb2YgdGhpcy5iYWNrZW5kLnZhbHVlcygpKSB7XG4gICAgICBicC50aGVuKChiKSA9PiBiLmRlc3Ryb3koKSlcbiAgICB9XG4gICAgdGhpcy5iYWNrZW5kLmNsZWFyKClcbiAgICB0aGlzLmVtaXR0ZXIuZW1pdCgnZGlkLWRlc3Ryb3knLCB1bmRlZmluZWQpXG4gICAgdGhpcy5kaXNwb3NhYmxlcy5kaXNwb3NlKClcbiAgfVxuXG4gIHB1YmxpYyBvbkRpZERlc3Ryb3koY2FsbGJhY2s6ICgpID0+IHZvaWQpIHtcbiAgICByZXR1cm4gdGhpcy5lbWl0dGVyLm9uKCdkaWQtZGVzdHJveScsIGNhbGxiYWNrKVxuICB9XG5cbiAgcHVibGljIG9uV2FybmluZyhjYWxsYmFjazogKHdhcm5pbmc6IHN0cmluZykgPT4gdm9pZCkge1xuICAgIHJldHVybiB0aGlzLmVtaXR0ZXIub24oJ3dhcm5pbmcnLCBjYWxsYmFjaylcbiAgfVxuXG4gIHB1YmxpYyBvbkVycm9yKGNhbGxiYWNrOiAoZXJyb3I6IElFcnJvckNhbGxiYWNrQXJncykgPT4gdm9pZCkge1xuICAgIHJldHVybiB0aGlzLmVtaXR0ZXIub24oJ2Vycm9yJywgY2FsbGJhY2spXG4gIH1cblxuICBwdWJsaWMgb25CYWNrZW5kQWN0aXZlKGNhbGxiYWNrOiAoKSA9PiB2b2lkKSB7XG4gICAgcmV0dXJuIHRoaXMuZW1pdHRlci5vbignYmFja2VuZC1hY3RpdmUnLCBjYWxsYmFjaylcbiAgfVxuXG4gIHB1YmxpYyBvbkJhY2tlbmRJZGxlKGNhbGxiYWNrOiAoKSA9PiB2b2lkKSB7XG4gICAgcmV0dXJuIHRoaXMuZW1pdHRlci5vbignYmFja2VuZC1pZGxlJywgY2FsbGJhY2spXG4gIH1cblxuICBwdWJsaWMgb25RdWV1ZUlkbGUoY2FsbGJhY2s6ICgpID0+IHZvaWQpIHtcbiAgICByZXR1cm4gdGhpcy5lbWl0dGVyLm9uKCdxdWV1ZS1pZGxlJywgY2FsbGJhY2spXG4gIH1cblxuICBwdWJsaWMgYXN5bmMgcnVuTGlzdChidWZmZXI6IEF0b21UeXBlcy5UZXh0QnVmZmVyKSB7XG4gICAgcmV0dXJuIHRoaXMucXVldWVDbWQoJ2xpc3QnLCBhd2FpdCB0aGlzLmdldFJvb3REaXIoYnVmZmVyKSwgKCkgPT4gKHsgY29tbWFuZDogJ2xpc3QnIH0pKVxuICB9XG5cbiAgcHVibGljIGFzeW5jIHJ1bkxhbmcoZGlyOiBBdG9tVHlwZXMuRGlyZWN0b3J5KSB7XG4gICAgcmV0dXJuIHRoaXMucXVldWVDbWQoJ2luaXQnLCBkaXIsICgpID0+ICh7IGNvbW1hbmQ6ICdsYW5nJyB9KSlcbiAgfVxuXG4gIHB1YmxpYyBhc3luYyBydW5GbGFnKGRpcjogQXRvbVR5cGVzLkRpcmVjdG9yeSkge1xuICAgIHJldHVybiB0aGlzLnF1ZXVlQ21kKCdpbml0JywgZGlyLCAoKSA9PiAoeyBjb21tYW5kOiAnZmxhZycgfSkpXG4gIH1cblxuICBwdWJsaWMgYXN5bmMgcnVuQnJvd3NlKHJvb3REaXI6IEF0b21UeXBlcy5EaXJlY3RvcnksIG1vZHVsZXM6IHN0cmluZ1tdKTogUHJvbWlzZTxTeW1ib2xEZXNjW10+IHtcbiAgICBjb25zdCBsaW5lcyA9IGF3YWl0IHRoaXMucXVldWVDbWQoJ2Jyb3dzZScsIHJvb3REaXIsIChjYXBzKSA9PiAoe1xuICAgICAgY29tbWFuZDogJ2Jyb3dzZScsXG4gICAgICBkYXNoQXJnczogY2Fwcy5icm93c2VQYXJlbnRzID8gWyctZCcsICctbycsICctcCddIDogWyctZCcsICctbyddLFxuICAgICAgYXJnczogY2Fwcy5icm93c2VNYWluID8gbW9kdWxlcyA6IG1vZHVsZXMuZmlsdGVyKCh2KSA9PiB2ICE9PSAnTWFpbicpLFxuICAgIH0pKVxuICAgIHJldHVybiBsaW5lcy5tYXAoKHMpID0+IHtcbiAgICAgIC8vIGVudW1Gcm9tIDo6IEVudW0gYSA9PiBhIC0+IFthXSAtLSBmcm9tOkVudW1cbiAgICAgIGNvbnN0IHBhdHRlcm4gPSAvXiguKj8pIDo6ICguKj8pKD86IC0tIGZyb206KC4qKSk/JC9cbiAgICAgIGNvbnN0IG1hdGNoID0gcy5tYXRjaChwYXR0ZXJuKVxuICAgICAgbGV0IG5hbWU6IHN0cmluZ1xuICAgICAgbGV0IHR5cGVTaWduYXR1cmU6IHN0cmluZyB8IHVuZGVmaW5lZFxuICAgICAgbGV0IHBhcmVudDogc3RyaW5nIHwgdW5kZWZpbmVkXG4gICAgICBpZiAobWF0Y2gpIHtcbiAgICAgICAgbmFtZSA9IG1hdGNoWzFdXG4gICAgICAgIHR5cGVTaWduYXR1cmUgPSBtYXRjaFsyXVxuICAgICAgICBwYXJlbnQgPSBtYXRjaFszXVxuICAgICAgfSBlbHNlIHtcbiAgICAgICAgbmFtZSA9IHNcbiAgICAgIH1cbiAgICAgIGxldCBzeW1ib2xUeXBlOiBVUEkuQ29tcGxldGlvbkJhY2tlbmQuU3ltYm9sVHlwZVxuICAgICAgaWYgKHR5cGVTaWduYXR1cmUgJiYgL14oPzp0eXBlfGRhdGF8bmV3dHlwZSkvLnRlc3QodHlwZVNpZ25hdHVyZSkpIHtcbiAgICAgICAgc3ltYm9sVHlwZSA9ICd0eXBlJ1xuICAgICAgfSBlbHNlIGlmICh0eXBlU2lnbmF0dXJlICYmIC9eKD86Y2xhc3MpLy50ZXN0KHR5cGVTaWduYXR1cmUpKSB7XG4gICAgICAgIHN5bWJvbFR5cGUgPSAnY2xhc3MnXG4gICAgICB9IGVsc2UgaWYgKC9eXFwoLipcXCkkLy50ZXN0KG5hbWUpKSB7XG4gICAgICAgIHN5bWJvbFR5cGUgPSAnb3BlcmF0b3InXG4gICAgICAgIG5hbWUgPSBuYW1lLnNsaWNlKDEsIC0xKVxuICAgICAgfSBlbHNlIGlmIChVdGlsLmlzVXBwZXJDYXNlKG5hbWVbMF0pKSB7XG4gICAgICAgIHN5bWJvbFR5cGUgPSAndGFnJ1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgc3ltYm9sVHlwZSA9ICdmdW5jdGlvbidcbiAgICAgIH1cbiAgICAgIHJldHVybiB7IG5hbWUsIHR5cGVTaWduYXR1cmUsIHN5bWJvbFR5cGUsIHBhcmVudCB9XG4gICAgfSlcbiAgfVxuXG4gIHB1YmxpYyBhc3luYyBnZXRUeXBlSW5CdWZmZXIoXG4gICAgYnVmZmVyOiBBdG9tVHlwZXMuVGV4dEJ1ZmZlciwgY3JhbmdlOiBBdG9tVHlwZXMuUmFuZ2UsXG4gICkge1xuICAgIGlmICghYnVmZmVyLmdldFVyaSgpKSB7IHRocm93IG5ldyBFcnJvcignTm8gVVJJIGZvciBidWZmZXInKSB9XG4gICAgY3JhbmdlID0gVXRpbC50YWJTaGlmdEZvclJhbmdlKGJ1ZmZlciwgY3JhbmdlKVxuICAgIGNvbnN0IHJvb3REaXIgPSBhd2FpdCB0aGlzLmdldFJvb3REaXIoYnVmZmVyKVxuICAgIGNvbnN0IGxpbmVzID0gYXdhaXQgdGhpcy5xdWV1ZUNtZCgndHlwZWluZm8nLCByb290RGlyLCAoY2FwcykgPT4gKHtcbiAgICAgIGludGVyYWN0aXZlOiB0cnVlLFxuICAgICAgY29tbWFuZDogJ3R5cGUnLFxuICAgICAgdXJpOiBidWZmZXIuZ2V0VXJpKCksXG4gICAgICB0ZXh0OiBidWZmZXIuaXNNb2RpZmllZCgpID8gYnVmZmVyLmdldFRleHQoKSA6IHVuZGVmaW5lZCxcbiAgICAgIGRhc2hBcmdzOiBjYXBzLnR5cGVDb25zdHJhaW50cyA/IFsnLWMnXSA6IFtdLFxuICAgICAgYXJnczogW2NyYW5nZS5zdGFydC5yb3cgKyAxLCBjcmFuZ2Uuc3RhcnQuY29sdW1uICsgMV0ubWFwKCh2KSA9PiB2LnRvU3RyaW5nKCkpLFxuICAgIH0pKVxuXG4gICAgY29uc3QgcnggPSAvXihcXGQrKVxccysoXFxkKylcXHMrKFxcZCspXFxzKyhcXGQrKVxccytcIihbXl0qKVwiJC8gLy8gW15dIGJhc2ljYWxseSBtZWFucyBcImFueXRoaW5nXCIsIGluY2wuIG5ld2xpbmVzXG4gICAgZm9yIChjb25zdCBsaW5lIG9mIGxpbmVzKSB7XG4gICAgICBjb25zdCBtYXRjaCA9IGxpbmUubWF0Y2gocngpXG4gICAgICBpZiAoIW1hdGNoKSB7IGNvbnRpbnVlIH1cbiAgICAgIGNvbnN0IFtyb3dzdGFydCwgY29sc3RhcnQsIHJvd2VuZCwgY29sZW5kLCB0eXBlXSA9IG1hdGNoLnNsaWNlKDEpXG4gICAgICBjb25zdCByYW5nZSA9XG4gICAgICAgIFJhbmdlLmZyb21PYmplY3QoW1xuICAgICAgICAgIFtwYXJzZUludChyb3dzdGFydCwgMTApIC0gMSwgcGFyc2VJbnQoY29sc3RhcnQsIDEwKSAtIDFdLFxuICAgICAgICAgIFtwYXJzZUludChyb3dlbmQsIDEwKSAtIDEsIHBhcnNlSW50KGNvbGVuZCwgMTApIC0gMV0sXG4gICAgICAgIF0pXG4gICAgICBpZiAocmFuZ2UuaXNFbXB0eSgpKSB7IGNvbnRpbnVlIH1cbiAgICAgIGlmICghcmFuZ2UuY29udGFpbnNSYW5nZShjcmFuZ2UpKSB7IGNvbnRpbnVlIH1cbiAgICAgIHJldHVybiB7XG4gICAgICAgIHJhbmdlOiBVdGlsLnRhYlVuc2hpZnRGb3JSYW5nZShidWZmZXIsIHJhbmdlKSxcbiAgICAgICAgdHlwZTogdHlwZS5yZXBsYWNlKC9cXFxcXCIvZywgJ1wiJyksXG4gICAgICB9XG4gICAgfVxuICAgIHRocm93IG5ldyBFcnJvcignTm8gdHlwZScpXG4gIH1cblxuICBwdWJsaWMgYXN5bmMgZG9DYXNlU3BsaXQoYnVmZmVyOiBBdG9tVHlwZXMuVGV4dEJ1ZmZlciwgY3JhbmdlOiBBdG9tVHlwZXMuUmFuZ2UpIHtcbiAgICBpZiAoIWJ1ZmZlci5nZXRVcmkoKSkgeyB0aHJvdyBuZXcgRXJyb3IoJ05vIFVSSSBmb3IgYnVmZmVyJykgfVxuICAgIGNyYW5nZSA9IFV0aWwudGFiU2hpZnRGb3JSYW5nZShidWZmZXIsIGNyYW5nZSlcbiAgICBjb25zdCByb290RGlyID0gYXdhaXQgdGhpcy5nZXRSb290RGlyKGJ1ZmZlcilcbiAgICBjb25zdCBsaW5lcyA9IGF3YWl0IHRoaXMucXVldWVDbWQoJ3R5cGVpbmZvJywgcm9vdERpciwgKGNhcHMpID0+ICh7XG4gICAgICBpbnRlcmFjdGl2ZTogY2Fwcy5pbnRlcmFjdGl2ZUNhc2VTcGxpdCxcbiAgICAgIGNvbW1hbmQ6ICdzcGxpdCcsXG4gICAgICB1cmk6IGJ1ZmZlci5nZXRVcmkoKSxcbiAgICAgIHRleHQ6IGJ1ZmZlci5pc01vZGlmaWVkKCkgPyBidWZmZXIuZ2V0VGV4dCgpIDogdW5kZWZpbmVkLFxuICAgICAgYXJnczogW2NyYW5nZS5zdGFydC5yb3cgKyAxLCBjcmFuZ2Uuc3RhcnQuY29sdW1uICsgMV0ubWFwKCh2KSA9PiB2LnRvU3RyaW5nKCkpLFxuICAgIH0pKVxuXG4gICAgY29uc3QgcnggPSAvXihcXGQrKVxccysoXFxkKylcXHMrKFxcZCspXFxzKyhcXGQrKVxccytcIihbXl0qKVwiJC8gLy8gW15dIGJhc2ljYWxseSBtZWFucyBcImFueXRoaW5nXCIsIGluY2wuIG5ld2xpbmVzXG4gICAgY29uc3QgcmVzID0gW11cbiAgICBmb3IgKGNvbnN0IGxpbmUgb2YgbGluZXMpIHtcbiAgICAgIGNvbnN0IG1hdGNoID0gbGluZS5tYXRjaChyeClcbiAgICAgIGlmICghbWF0Y2gpIHtcbiAgICAgICAgVXRpbC53YXJuKGBnaGMtbW9kIHNheXM6ICR7bGluZX1gKVxuICAgICAgICBjb250aW51ZVxuICAgICAgfVxuICAgICAgY29uc3QgW3Jvd3N0YXJ0LCBjb2xzdGFydCwgcm93ZW5kLCBjb2xlbmQsIHRleHRdID0gbWF0Y2guc2xpY2UoMSlcbiAgICAgIHJlcy5wdXNoKHtcbiAgICAgICAgcmFuZ2U6XG4gICAgICAgIFJhbmdlLmZyb21PYmplY3QoW1xuICAgICAgICAgIFtwYXJzZUludChyb3dzdGFydCwgMTApIC0gMSwgcGFyc2VJbnQoY29sc3RhcnQsIDEwKSAtIDFdLFxuICAgICAgICAgIFtwYXJzZUludChyb3dlbmQsIDEwKSAtIDEsIHBhcnNlSW50KGNvbGVuZCwgMTApIC0gMV0sXG4gICAgICAgIF0pLFxuICAgICAgICByZXBsYWNlbWVudDogdGV4dCxcbiAgICAgIH0pXG4gICAgfVxuICAgIHJldHVybiByZXNcbiAgfVxuXG4gIHB1YmxpYyBhc3luYyBkb1NpZ0ZpbGwoYnVmZmVyOiBBdG9tVHlwZXMuVGV4dEJ1ZmZlciwgY3JhbmdlOiBBdG9tVHlwZXMuUmFuZ2UpIHtcbiAgICBpZiAoIWJ1ZmZlci5nZXRVcmkoKSkgeyB0aHJvdyBuZXcgRXJyb3IoJ05vIFVSSSBmb3IgYnVmZmVyJykgfVxuICAgIGNyYW5nZSA9IFV0aWwudGFiU2hpZnRGb3JSYW5nZShidWZmZXIsIGNyYW5nZSlcbiAgICBjb25zdCByb290RGlyID0gYXdhaXQgdGhpcy5nZXRSb290RGlyKGJ1ZmZlcilcbiAgICBjb25zdCBsaW5lcyA9IGF3YWl0IHRoaXMucXVldWVDbWQoJ3R5cGVpbmZvJywgcm9vdERpciwgKGNhcHMpID0+ICh7XG4gICAgICBpbnRlcmFjdGl2ZTogY2Fwcy5pbnRlcmFjdGl2ZUNhc2VTcGxpdCxcbiAgICAgIGNvbW1hbmQ6ICdzaWcnLFxuICAgICAgdXJpOiBidWZmZXIuZ2V0VXJpKCksXG4gICAgICB0ZXh0OiBidWZmZXIuaXNNb2RpZmllZCgpID8gYnVmZmVyLmdldFRleHQoKSA6IHVuZGVmaW5lZCxcbiAgICAgIGFyZ3M6IFtjcmFuZ2Uuc3RhcnQucm93ICsgMSwgY3JhbmdlLnN0YXJ0LmNvbHVtbiArIDFdLm1hcCgodikgPT4gdi50b1N0cmluZygpKSxcbiAgICB9KSlcbiAgICBpZiAobGluZXMubGVuZ3RoIDwgMikgeyB0aHJvdyBuZXcgRXJyb3IoYENvdWxkIG5vdCB1bmRlcnN0YW5kIHJlc3BvbnNlOiAke2xpbmVzLmpvaW4oJ1xcbicpfWApIH1cbiAgICBjb25zdCByeCA9IC9eKFxcZCspXFxzKyhcXGQrKVxccysoXFxkKylcXHMrKFxcZCspJC8gLy8gcG9zaXRpb24gcnhcbiAgICBjb25zdCBtYXRjaCA9IGxpbmVzWzFdLm1hdGNoKHJ4KVxuICAgIGlmICghbWF0Y2gpIHsgdGhyb3cgbmV3IEVycm9yKGBDb3VsZCBub3QgdW5kZXJzdGFuZCByZXNwb25zZTogJHtsaW5lcy5qb2luKCdcXG4nKX1gKSB9XG4gICAgY29uc3QgW3Jvd3N0YXJ0LCBjb2xzdGFydCwgcm93ZW5kLCBjb2xlbmRdID0gbWF0Y2guc2xpY2UoMSlcbiAgICBjb25zdCByYW5nZSA9XG4gICAgICBSYW5nZS5mcm9tT2JqZWN0KFtcbiAgICAgICAgW3BhcnNlSW50KHJvd3N0YXJ0LCAxMCkgLSAxLCBwYXJzZUludChjb2xzdGFydCwgMTApIC0gMV0sXG4gICAgICAgIFtwYXJzZUludChyb3dlbmQsIDEwKSAtIDEsIHBhcnNlSW50KGNvbGVuZCwgMTApIC0gMV0sXG4gICAgICBdKVxuICAgIHJldHVybiB7XG4gICAgICB0eXBlOiBsaW5lc1swXSxcbiAgICAgIHJhbmdlLFxuICAgICAgYm9keTogbGluZXMuc2xpY2UoMikuam9pbignXFxuJyksXG4gICAgfVxuICB9XG5cbiAgcHVibGljIGFzeW5jIGdldEluZm9JbkJ1ZmZlcihlZGl0b3I6IEF0b21UeXBlcy5UZXh0RWRpdG9yLCBjcmFuZ2U6IEF0b21UeXBlcy5SYW5nZSkge1xuICAgIGNvbnN0IGJ1ZmZlciA9IGVkaXRvci5nZXRCdWZmZXIoKVxuICAgIGlmICghYnVmZmVyLmdldFVyaSgpKSB7IHRocm93IG5ldyBFcnJvcignTm8gVVJJIGZvciBidWZmZXInKSB9XG4gICAgY29uc3Qgc3ltSW5mbyA9IFV0aWwuZ2V0U3ltYm9sSW5SYW5nZShlZGl0b3IsIGNyYW5nZSlcbiAgICBpZiAoIXN5bUluZm8pIHsgdGhyb3cgbmV3IEVycm9yKCdDb3VsZG5cXCd0IGdldCBzeW1ib2wgZm9yIGluZm8nKSB9XG4gICAgY29uc3QgeyBzeW1ib2wsIHJhbmdlIH0gPSBzeW1JbmZvXG5cbiAgICBjb25zdCBsaW5lcyA9IGF3YWl0IHRoaXMucXVldWVDbWQoJ3R5cGVpbmZvJywgYXdhaXQgdGhpcy5nZXRSb290RGlyKGJ1ZmZlciksICgpID0+ICh7XG4gICAgICBpbnRlcmFjdGl2ZTogdHJ1ZSxcbiAgICAgIGNvbW1hbmQ6ICdpbmZvJyxcbiAgICAgIHVyaTogYnVmZmVyLmdldFVyaSgpLFxuICAgICAgdGV4dDogYnVmZmVyLmlzTW9kaWZpZWQoKSA/IGJ1ZmZlci5nZXRUZXh0KCkgOiB1bmRlZmluZWQsXG4gICAgICBhcmdzOiBbc3ltYm9sXSxcbiAgICB9KSlcblxuICAgIGNvbnN0IGluZm8gPSBsaW5lcy5qb2luKCdcXG4nKVxuICAgIGlmICgoaW5mbyA9PT0gJ0Nhbm5vdCBzaG93IGluZm8nKSB8fCAhaW5mbykge1xuICAgICAgdGhyb3cgbmV3IEVycm9yKCdObyBpbmZvJylcbiAgICB9IGVsc2Uge1xuICAgICAgcmV0dXJuIHsgcmFuZ2UsIGluZm8gfVxuICAgIH1cbiAgfVxuXG4gIHB1YmxpYyBhc3luYyBmaW5kU3ltYm9sUHJvdmlkZXJzSW5CdWZmZXIoZWRpdG9yOiBBdG9tVHlwZXMuVGV4dEVkaXRvciwgY3JhbmdlOiBBdG9tVHlwZXMuUmFuZ2UpIHtcbiAgICBjb25zdCBidWZmZXIgPSBlZGl0b3IuZ2V0QnVmZmVyKClcbiAgICBjb25zdCBzeW1JbmZvID0gVXRpbC5nZXRTeW1ib2xJblJhbmdlKGVkaXRvciwgY3JhbmdlKVxuICAgIGlmICghc3ltSW5mbykgeyB0aHJvdyBuZXcgRXJyb3IoJ0NvdWxkblxcJ3QgZ2V0IHN5bWJvbCBmb3IgaW1wb3J0JykgfVxuICAgIGNvbnN0IHsgc3ltYm9sIH0gPSBzeW1JbmZvXG5cbiAgICByZXR1cm4gdGhpcy5xdWV1ZUNtZCgnZmluZCcsIGF3YWl0IHRoaXMuZ2V0Um9vdERpcihidWZmZXIpLCAoKSA9PiAoe1xuICAgICAgaW50ZXJhY3RpdmU6IHRydWUsXG4gICAgICBjb21tYW5kOiAnZmluZCcsXG4gICAgICBhcmdzOiBbc3ltYm9sXSxcbiAgICB9KSlcbiAgfVxuXG4gIHB1YmxpYyBhc3luYyBkb0NoZWNrQnVmZmVyKGJ1ZmZlcjogQXRvbVR5cGVzLlRleHRCdWZmZXIsIGZhc3Q6IGJvb2xlYW4pIHtcbiAgICByZXR1cm4gdGhpcy5kb0NoZWNrT3JMaW50QnVmZmVyKCdjaGVjaycsIGJ1ZmZlciwgZmFzdClcbiAgfVxuXG4gIHB1YmxpYyBhc3luYyBkb0xpbnRCdWZmZXIoYnVmZmVyOiBBdG9tVHlwZXMuVGV4dEJ1ZmZlcikge1xuICAgIHJldHVybiB0aGlzLmRvQ2hlY2tPckxpbnRCdWZmZXIoJ2xpbnQnLCBidWZmZXIsIGZhbHNlKVxuICB9XG5cbiAgcHVibGljIGFzeW5jIGRvQ2hlY2tBbmRMaW50KGJ1ZmZlcjogQXRvbVR5cGVzLlRleHRCdWZmZXIsIGZhc3Q6IGJvb2xlYW4pIHtcbiAgICBjb25zdCBbY3IsIGxyXSA9IGF3YWl0IFByb21pc2UuYWxsKFt0aGlzLmRvQ2hlY2tCdWZmZXIoYnVmZmVyLCBmYXN0KSwgdGhpcy5kb0xpbnRCdWZmZXIoYnVmZmVyKV0pXG4gICAgcmV0dXJuIGNyLmNvbmNhdChscilcbiAgfVxuXG4gIHByaXZhdGUgYXN5bmMgaW5pdEJhY2tlbmQocm9vdERpcjogQXRvbVR5cGVzLkRpcmVjdG9yeSk6IFByb21pc2U8R2hjTW9kaVByb2Nlc3NSZWFsPiB7XG4gICAgY29uc3Qgcm9vdFBhdGggPSByb290RGlyLmdldFBhdGgoKVxuICAgIGNvbnN0IGNhY2hlZCA9IHRoaXMuYmFja2VuZC5nZXQocm9vdFBhdGgpXG4gICAgaWYgKGNhY2hlZCkgeyByZXR1cm4gYXdhaXQgY2FjaGVkIH1cbiAgICBjb25zdCBuZXdCYWNrZW5kID0gY3JlYXRlR2hjTW9kaVByb2Nlc3NSZWFsKHJvb3REaXIpXG4gICAgdGhpcy5iYWNrZW5kLnNldChyb290UGF0aCwgbmV3QmFja2VuZClcbiAgICBjb25zdCBiYWNrZW5kID0gYXdhaXQgbmV3QmFja2VuZFxuICAgIHRoaXMuZGlzcG9zYWJsZXMuYWRkKFxuICAgICAgYmFja2VuZC5vbkVycm9yKChhcmcpID0+IHRoaXMuZW1pdHRlci5lbWl0KCdlcnJvcicsIGFyZykpLFxuICAgICAgYmFja2VuZC5vbldhcm5pbmcoKGFyZykgPT4gdGhpcy5lbWl0dGVyLmVtaXQoJ3dhcm5pbmcnLCBhcmcpKSxcbiAgICApXG4gICAgcmV0dXJuIGJhY2tlbmRcbiAgfVxuXG4gIHByaXZhdGUgYXN5bmMgZ2V0U2V0dGluZ3MocnVuRGlyOiBBdG9tVHlwZXMuRGlyZWN0b3J5KSB7XG4gICAgY29uc3QgcmVhZFNldHRpbmdzID0gYXN5bmMgKGZpbGU6IEF0b21UeXBlcy5GaWxlKSA9PiB7XG4gICAgICB0cnkge1xuICAgICAgICBjb25zdCBleCA9IGF3YWl0IGZpbGUuZXhpc3RzKClcbiAgICAgICAgaWYgKGV4KSB7XG4gICAgICAgICAgY29uc3QgY29udGVudHMgPSBhd2FpdCBmaWxlLnJlYWQoKVxuICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICByZXR1cm4gSlNPTi5wYXJzZShjb250ZW50cylcbiAgICAgICAgICB9IGNhdGNoIChlcnIpIHtcbiAgICAgICAgICAgIGF0b20ubm90aWZpY2F0aW9ucy5hZGRFcnJvcihgRmFpbGVkIHRvIHBhcnNlICR7ZmlsZS5nZXRQYXRoKCl9YCwge1xuICAgICAgICAgICAgICBkZXRhaWw6IGVycixcbiAgICAgICAgICAgICAgZGlzbWlzc2FibGU6IHRydWUsXG4gICAgICAgICAgICB9KVxuICAgICAgICAgICAgdGhyb3cgZXJyXG4gICAgICAgICAgfVxuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIHJldHVybiB7fVxuICAgICAgICB9XG4gICAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgICBpZiAoZXJyb3IpIHsgVXRpbC53YXJuKGVycm9yKSB9XG4gICAgICAgIHJldHVybiB7fVxuICAgICAgfVxuICAgIH1cblxuICAgIGNvbnN0IGxvY2FsU2V0dGluZ3MgPSByZWFkU2V0dGluZ3MocnVuRGlyLmdldEZpbGUoJy5oYXNrZWxsLWdoYy1tb2QuanNvbicpKVxuXG4gICAgY29uc3QgW3Byb2plY3REaXJdID0gYXRvbS5wcm9qZWN0LmdldERpcmVjdG9yaWVzKCkuZmlsdGVyKChkKSA9PiBkLmNvbnRhaW5zKHJ1bkRpci5nZXRQYXRoKCkpKVxuICAgIGNvbnN0IHByb2plY3RTZXR0aW5ncyA9XG4gICAgICBwcm9qZWN0RGlyID9cbiAgICAgICAgcmVhZFNldHRpbmdzKHByb2plY3REaXIuZ2V0RmlsZSgnLmhhc2tlbGwtZ2hjLW1vZC5qc29uJykpXG4gICAgICAgIDpcbiAgICAgICAgUHJvbWlzZS5yZXNvbHZlKHt9KVxuXG4gICAgY29uc3QgY29uZmlnRGlyID0gbmV3IERpcmVjdG9yeShhdG9tLmdldENvbmZpZ0RpclBhdGgoKSlcbiAgICBjb25zdCBnbG9iYWxTZXR0aW5ncyA9IHJlYWRTZXR0aW5ncyhjb25maWdEaXIuZ2V0RmlsZSgnaGFza2VsbC1naGMtbW9kLmpzb24nKSlcblxuICAgIGNvbnN0IFtnbG9iLCBwcmosIGxvY10gPSBhd2FpdCBQcm9taXNlLmFsbChbZ2xvYmFsU2V0dGluZ3MsIHByb2plY3RTZXR0aW5ncywgbG9jYWxTZXR0aW5nc10pXG4gICAgcmV0dXJuIHsgLi4uZ2xvYiwgLi4ucHJqLCAuLi5sb2MgfVxuICB9XG5cbiAgcHJpdmF0ZSBhc3luYyBxdWV1ZUNtZChcbiAgICBxdWV1ZU5hbWU6IENvbW1hbmRzLFxuICAgIGRpcjogQXRvbVR5cGVzLkRpcmVjdG9yeSxcbiAgICBydW5BcmdzRnVuYzogKGNhcHM6IEdIQ01vZENhcHMpID0+IHtcbiAgICAgIGNvbW1hbmQ6IHN0cmluZywgdGV4dD86IHN0cmluZywgdXJpPzogc3RyaW5nLCBpbnRlcmFjdGl2ZT86IGJvb2xlYW4sXG4gICAgICBkYXNoQXJncz86IHN0cmluZ1tdLCBhcmdzPzogc3RyaW5nW11cbiAgICB9LFxuICApOiBQcm9taXNlPHN0cmluZ1tdPiB7XG4gICAgaWYgKGF0b20uY29uZmlnLmdldCgnaGFza2VsbC1naGMtbW9kLmxvd01lbW9yeVN5c3RlbScpKSB7XG4gICAgICBxdWV1ZU5hbWUgPSAnbG93bWVtJ1xuICAgIH1cbiAgICBjb25zdCBiYWNrZW5kID0gYXdhaXQgdGhpcy5pbml0QmFja2VuZChkaXIpXG4gICAgY29uc3QgcHJvbWlzZSA9IHRoaXMuY29tbWFuZFF1ZXVlc1txdWV1ZU5hbWVdLmFkZChhc3luYyAoKSA9PiB7XG4gICAgICB0aGlzLmVtaXR0ZXIuZW1pdCgnYmFja2VuZC1hY3RpdmUnLCB1bmRlZmluZWQpXG4gICAgICB0cnkge1xuICAgICAgICBjb25zdCBzZXR0aW5ncyA9IGF3YWl0IHRoaXMuZ2V0U2V0dGluZ3MoZGlyKVxuICAgICAgICBpZiAoc2V0dGluZ3MuZGlzYWJsZSkgeyB0aHJvdyBuZXcgRXJyb3IoJ0doYy1tb2QgZGlzYWJsZWQgaW4gc2V0dGluZ3MnKSB9XG4gICAgICAgIHJldHVybiBiYWNrZW5kLnJ1bih7XG4gICAgICAgICAgLi4ucnVuQXJnc0Z1bmMoYmFja2VuZC5nZXRDYXBzKCkpLFxuICAgICAgICAgIHN1cHByZXNzRXJyb3JzOiBzZXR0aW5ncy5zdXBwcmVzc0Vycm9ycyxcbiAgICAgICAgICBnaGNPcHRpb25zOiBzZXR0aW5ncy5naGNPcHRpb25zLFxuICAgICAgICAgIGdoY01vZE9wdGlvbnM6IHNldHRpbmdzLmdoY01vZE9wdGlvbnMsXG4gICAgICAgIH0pXG4gICAgICB9IGNhdGNoIChlcnIpIHtcbiAgICAgICAgVXRpbC53YXJuKGVycilcbiAgICAgICAgdGhyb3cgZXJyXG4gICAgICB9XG4gICAgfSlcbiAgICBwcm9taXNlLnRoZW4oKHJlcykgPT4ge1xuICAgICAgY29uc3QgcWUgPSAocW46IENvbW1hbmRzKSA9PiB7XG4gICAgICAgIGNvbnN0IHEgPSB0aGlzLmNvbW1hbmRRdWV1ZXNbcW5dXG4gICAgICAgIHJldHVybiAocS5nZXRRdWV1ZUxlbmd0aCgpICsgcS5nZXRQZW5kaW5nTGVuZ3RoKCkpID09PSAwXG4gICAgICB9XG4gICAgICBpZiAocWUocXVldWVOYW1lKSkge1xuICAgICAgICB0aGlzLmVtaXR0ZXIuZW1pdCgncXVldWUtaWRsZScsIHsgcXVldWU6IHF1ZXVlTmFtZSB9KVxuICAgICAgICBpZiAoT2JqZWN0LmtleXModGhpcy5jb21tYW5kUXVldWVzKS5ldmVyeShxZSkpIHtcbiAgICAgICAgICB0aGlzLmVtaXR0ZXIuZW1pdCgnYmFja2VuZC1pZGxlJywgdW5kZWZpbmVkKVxuICAgICAgICB9XG4gICAgICB9XG4gICAgfSlcbiAgICByZXR1cm4gcHJvbWlzZVxuICB9XG5cbiAgcHJpdmF0ZSBhc3luYyBkb0NoZWNrT3JMaW50QnVmZmVyKGNtZDogJ2NoZWNrJyB8ICdsaW50JywgYnVmZmVyOiBBdG9tVHlwZXMuVGV4dEJ1ZmZlciwgZmFzdDogYm9vbGVhbikge1xuICAgIGxldCBkYXNoQXJnc1xuICAgIGlmIChidWZmZXIuaXNFbXB0eSgpKSB7IHJldHVybiBbXSB9XG4gICAgaWYgKCFidWZmZXIuZ2V0VXJpKCkpIHsgcmV0dXJuIFtdIH1cblxuICAgIC8vIEEgZGlydHkgaGFjayB0byBtYWtlIGxpbnQgd29yayB3aXRoIGxoc1xuICAgIGxldCB1cmkgPSBidWZmZXIuZ2V0VXJpKClcbiAgICBjb25zdCBvbGR1cmkgPSBidWZmZXIuZ2V0VXJpKClcbiAgICBsZXQgdGV4dFxuICAgIHRyeSB7XG4gICAgICBpZiAoKGNtZCA9PT0gJ2xpbnQnKSAmJiAoZXh0bmFtZSh1cmkpID09PSAnLmxocycpKSB7XG4gICAgICAgIHVyaSA9IHVyaS5zbGljZSgwLCAtMSlcbiAgICAgICAgdGV4dCA9IGF3YWl0IHVubGl0KG9sZHVyaSwgYnVmZmVyLmdldFRleHQoKSlcbiAgICAgIH0gZWxzZSBpZiAoYnVmZmVyLmlzTW9kaWZpZWQoKSkge1xuICAgICAgICB0ZXh0ID0gYnVmZmVyLmdldFRleHQoKVxuICAgICAgfVxuICAgIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgICAvLyBUT0RPOiBSZWplY3RcbiAgICAgIGNvbnN0IG0gPSAoZXJyb3IgYXMgRXJyb3IpLm1lc3NhZ2UubWF0Y2goL14oLio/KTooWzAtOV0rKTogKiguKikgKiQvKVxuICAgICAgaWYgKCFtKSB7IHRocm93IGVycm9yIH1cbiAgICAgIGNvbnN0IFt1cmkyLCBsaW5lLCBtZXNzXSA9IG0uc2xpY2UoMSlcbiAgICAgIHJldHVybiBbe1xuICAgICAgICB1cmk6IHVyaTIsXG4gICAgICAgIHBvc2l0aW9uOiBuZXcgUG9pbnQocGFyc2VJbnQobGluZSwgMTApIC0gMSwgMCksXG4gICAgICAgIG1lc3NhZ2U6IG1lc3MsXG4gICAgICAgIHNldmVyaXR5OiAnbGludCcsXG4gICAgICB9XVxuICAgIH1cbiAgICAvLyBlbmQgb2YgZGlydHkgaGFja1xuXG4gICAgLy8gdHNsaW50OmRpc2FibGUtbmV4dC1saW5lOiB0b3RhbGl0eS1jaGVja1xuICAgIGlmIChjbWQgPT09ICdsaW50Jykge1xuICAgICAgY29uc3Qgb3B0czogc3RyaW5nW10gPSBhdG9tLmNvbmZpZy5nZXQoJ2hhc2tlbGwtZ2hjLW1vZC5obGludE9wdGlvbnMnKVxuICAgICAgZGFzaEFyZ3MgPSBbXVxuICAgICAgZm9yIChjb25zdCBvcHQgb2Ygb3B0cykge1xuICAgICAgICBkYXNoQXJncy5wdXNoKCctLWhsaW50T3B0Jywgb3B0KVxuICAgICAgfVxuICAgIH1cblxuICAgIGNvbnN0IHJvb3REaXIgPSBhd2FpdCB0aGlzLmdldFJvb3REaXIoYnVmZmVyKVxuXG4gICAgY29uc3QgdGV4dEIgPSB0ZXh0XG4gICAgY29uc3QgZGFzaEFyZ3NCID0gZGFzaEFyZ3NcbiAgICBjb25zdCBsaW5lcyA9IGF3YWl0IHRoaXMucXVldWVDbWQoJ2NoZWNrbGludCcsIHJvb3REaXIsICgpID0+ICh7XG4gICAgICBpbnRlcmFjdGl2ZTogZmFzdCxcbiAgICAgIGNvbW1hbmQ6IGNtZCxcbiAgICAgIHVyaSxcbiAgICAgIHRleHQ6IHRleHRCLFxuICAgICAgZGFzaEFyZ3M6IGRhc2hBcmdzQixcbiAgICB9KSlcblxuICAgIGNvbnN0IHJ4ID0gL14oLio/KTooWzAtOVxcc10rKTooWzAtOVxcc10rKTogKig/OihXYXJuaW5nfEVycm9yKTogKik/KFteXSopL1xuICAgIGNvbnN0IHJlcyA9IFtdXG4gICAgZm9yIChjb25zdCBsaW5lIG9mIGxpbmVzKSB7XG4gICAgICBjb25zdCBtYXRjaCA9IGxpbmUubWF0Y2gocngpXG4gICAgICBpZiAoIW1hdGNoKSB7XG4gICAgICAgIGlmIChsaW5lLnRyaW0oKS5sZW5ndGgpIHsgVXRpbC53YXJuKGBnaGMtbW9kIHNheXM6ICR7bGluZX1gKSB9XG4gICAgICAgIGNvbnRpbnVlXG4gICAgICB9XG4gICAgICBjb25zdCBbZmlsZTIsIHJvdywgY29sLCB3YXJuaW5nLCBtZXNzYWdlXSA9IG1hdGNoLnNsaWNlKDEpXG4gICAgICBpZiAoZmlsZTIgPT09ICdEdW1teScgJiYgcm93ID09PSAnMCcgJiYgY29sID09PSAnMCcpIHtcbiAgICAgICAgaWYgKHdhcm5pbmcgPT09ICdFcnJvcicpIHtcbiAgICAgICAgICB0aGlzLmVtaXR0ZXIuZW1pdCgnZXJyb3InLCB7XG4gICAgICAgICAgICBlcnI6IFV0aWwubWtFcnJvcignR0hDTW9kU3Rkb3V0RXJyb3InLCBtZXNzYWdlKSxcbiAgICAgICAgICAgIGNhcHM6IChhd2FpdCB0aGlzLmluaXRCYWNrZW5kKHJvb3REaXIpKS5nZXRDYXBzKCksIC8vIFRPRE86IFRoaXMgaXMgbm90IHByZXR0eVxuICAgICAgICAgIH0pXG4gICAgICAgICAgY29udGludWVcbiAgICAgICAgfSBlbHNlIGlmICh3YXJuaW5nID09PSAnV2FybmluZycpIHtcbiAgICAgICAgICB0aGlzLmVtaXR0ZXIuZW1pdCgnd2FybmluZycsIG1lc3NhZ2UpXG4gICAgICAgICAgY29udGludWVcbiAgICAgICAgfVxuICAgICAgfVxuXG4gICAgICBjb25zdCBmaWxlID0gdXJpLmVuZHNXaXRoKGZpbGUyKSA/IG9sZHVyaSA6IGZpbGUyXG4gICAgICBjb25zdCBzZXZlcml0eSA9XG4gICAgICAgIGNtZCA9PT0gJ2xpbnQnID9cbiAgICAgICAgICAnbGludCdcbiAgICAgICAgICA6IHdhcm5pbmcgPT09ICdXYXJuaW5nJyA/XG4gICAgICAgICAgICAnd2FybmluZydcbiAgICAgICAgICAgIDpcbiAgICAgICAgICAgICdlcnJvcidcbiAgICAgIGNvbnN0IG1lc3NQb3MgPSBuZXcgUG9pbnQocGFyc2VJbnQocm93LCAxMCkgLSAxLCBwYXJzZUludChjb2wsIDEwKSAtIDEpXG4gICAgICBjb25zdCBwb3NpdGlvbiA9IFV0aWwudGFiVW5zaGlmdEZvclBvaW50KGJ1ZmZlciwgbWVzc1BvcylcbiAgICAgIGxldCBteXVyaVxuICAgICAgdHJ5IHtcbiAgICAgICAgbXl1cmkgPSByb290RGlyLmdldEZpbGUocm9vdERpci5yZWxhdGl2aXplKGZpbGUpKS5nZXRQYXRoKClcbiAgICAgIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgICAgIG15dXJpID0gZmlsZVxuICAgICAgfVxuICAgICAgcmVzLnB1c2goe1xuICAgICAgICB1cmk6IG15dXJpLFxuICAgICAgICBwb3NpdGlvbixcbiAgICAgICAgbWVzc2FnZSxcbiAgICAgICAgc2V2ZXJpdHksXG4gICAgICB9KVxuICAgIH1cbiAgICByZXR1cm4gcmVzXG4gIH1cbn1cbiJdfQ==