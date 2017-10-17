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
const settings_1 = require("./settings");
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
    queueCmd(queueName, dir, runArgsFunc) {
        return __awaiter(this, void 0, void 0, function* () {
            if (atom.config.get('haskell-ghc-mod.lowMemorySystem')) {
                queueName = 'lowmem';
            }
            const backend = yield this.initBackend(dir);
            const promise = this.commandQueues[queueName].add(() => __awaiter(this, void 0, void 0, function* () {
                this.emitter.emit('backend-active', undefined);
                try {
                    const settings = yield settings_1.getSettings(dir);
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaW5kZXguanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi9zcmMvZ2hjLW1vZC9pbmRleC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOzs7Ozs7Ozs7O0FBQUEsK0JBQTJFO0FBQzNFLGdDQUErQjtBQUMvQiwrQkFBOEI7QUFDOUIsdUNBQXVDO0FBQ3ZDLDJEQUEwQztBQUcxQyxtRkFBMEU7QUFDMUUseUNBQXdDO0FBYXhDO0lBY0U7UUFDRSxJQUFJLENBQUMsV0FBVyxHQUFHLElBQUksMEJBQW1CLEVBQUUsQ0FBQTtRQUM1QyxJQUFJLENBQUMsT0FBTyxHQUFHLElBQUksY0FBTyxFQUFFLENBQUE7UUFDNUIsSUFBSSxDQUFDLFdBQVcsQ0FBQyxHQUFHLENBQUMsSUFBSSxDQUFDLE9BQU8sQ0FBQyxDQUFBO1FBQ2xDLElBQUksQ0FBQyxZQUFZLEdBQUcsSUFBSSxPQUFPLEVBQUUsQ0FBQTtRQUNqQyxJQUFJLENBQUMsT0FBTyxHQUFHLElBQUksR0FBRyxFQUFFLENBQUE7UUFFeEIsRUFBRSxDQUFDLENBQUMsT0FBTyxDQUFDLEdBQUcsQ0FBQyxnQkFBZ0IsSUFBSSxDQUFDLElBQUksQ0FBQyxNQUFNLENBQUMsR0FBRyxDQUFDLCtDQUErQyxDQUFDLENBQUMsQ0FBQyxDQUFDO1lBQ3RHLElBQUksQ0FBQyxrQkFBa0IsRUFBRSxDQUFBO1FBQzNCLENBQUM7UUFFRCxJQUFJLENBQUMsYUFBYSxHQUFHO1lBQ25CLFNBQVMsRUFBRSxJQUFJLEtBQUssQ0FBQyxDQUFDLENBQUM7WUFDdkIsTUFBTSxFQUFFLElBQUksS0FBSyxDQUFDLElBQUksQ0FBQyxNQUFNLENBQUMsR0FBRyxDQUFDLG9DQUFvQyxDQUFDLENBQUM7WUFDeEUsUUFBUSxFQUFFLElBQUksS0FBSyxDQUFDLENBQUMsQ0FBQztZQUN0QixJQUFJLEVBQUUsSUFBSSxLQUFLLENBQUMsQ0FBQyxDQUFDO1lBQ2xCLElBQUksRUFBRSxJQUFJLEtBQUssQ0FBQyxDQUFDLENBQUM7WUFDbEIs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QUFDLEdBQUcsQ0FBQyxFQUFFLFFBQVEsQ0FBQyxHQUFHLEVBQUUsRUFBRSxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUE7Z0JBQ3ZFLE1BQU0sUUFBUSxHQUFHLElBQUksQ0FBQyxrQkFBa0IsQ0FBQyxNQUFNLEVBQUUsT0FBTyxDQUFDLENBQUE7Z0JBQ3pELElBQUksS0FBSyxDQUFBO2dCQUNULElBQUksQ0FBQztvQkFDSCxLQUFLLEdBQUcsT0FBTyxDQUFDLE9BQU8sQ0FBQyxPQUFPLENBQUMsVUFBVSxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsT0FBTyxFQUFFLENBQUE7Z0JBQzdELENBQUM7Z0JBQUMsS0FBSyxDQUFDLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQztvQkFDZixLQUFLLEdBQUcsSUFBSSxDQUFBO2dCQUNkLENBQUM7Z0JBQ0QsR0FBRyxDQUFDLElBQUksQ0FBQztvQkFDUCxHQUFHLEVBQUUsS0FBSztvQkFDVixRQUFRO29CQUNSLE9BQU87b0JBQ1AsUUFBUTtpQkFDVCxDQUFDLENBQUE7WUFDSixDQUFDO1lBQ0QsTUFBTSxDQUFDLEdBQUcsQ0FBQTtRQUNaLENBQUM7S0FBQTtDQUNGO0FBdmJELHdDQXViQyIsInNvdXJjZXNDb250ZW50IjpbImltcG9ydCB7IFJhbmdlLCBQb2ludCwgVEVtaXR0ZXIsIEVtaXR0ZXIsIENvbXBvc2l0ZURpc3Bvc2FibGUgfSBmcm9tICdhdG9tJ1xuaW1wb3J0ICogYXMgVXRpbCBmcm9tICcuLi91dGlsJ1xuaW1wb3J0IHsgZXh0bmFtZSB9IGZyb20gJ3BhdGgnXG5pbXBvcnQgUXVldWUgPSByZXF1aXJlKCdwcm9taXNlLXF1ZXVlJylcbmltcG9ydCB7IHVubGl0IH0gZnJvbSAnYXRvbS1oYXNrZWxsLXV0aWxzJ1xuXG5pbXBvcnQgeyBHaGNNb2RpUHJvY2Vzc1JlYWwsIEdIQ01vZENhcHMsIFJ1bkFyZ3MsIElFcnJvckNhbGxiYWNrQXJncyB9IGZyb20gJy4vZ2hjLW1vZGktcHJvY2Vzcy1yZWFsJ1xuaW1wb3J0IHsgY3JlYXRlR2hjTW9kaVByb2Nlc3NSZWFsIH0gZnJvbSAnLi9naGMtbW9kaS1wcm9jZXNzLXJlYWwtZmFjdG9yeSdcbmltcG9ydCB7IGdldFNldHRpbmdzIH0gZnJvbSAnLi9zZXR0aW5ncydcblxuZXhwb3J0IHsgSUVycm9yQ2FsbGJhY2tBcmdzLCBSdW5BcmdzLCBHSENNb2RDYXBzIH1cblxudHlwZSBDb21tYW5kcyA9ICdjaGVja2xpbnQnIHwgJ2Jyb3dzZScgfCAndHlwZWluZm8nIHwgJ2ZpbmQnIHwgJ2luaXQnIHwgJ2xpc3QnIHwgJ2xvd21lbSdcblxuZXhwb3J0IGludGVyZmFjZSBTeW1ib2xEZXNjIHtcbiAgbmFtZTogc3RyaW5nLFxuICBzeW1ib2xUeXBlOiBVUEkuQ29tcGxldGlvbkJhY2tlbmQuU3ltYm9sVHlwZSxcbiAgdHlwZVNpZ25hdHVyZT86IHN0cmluZyxcbiAgcGFyZW50Pzogc3RyaW5nXG59XG5cbmV4cG9ydCBjbGFzcyBHaGNNb2RpUHJvY2VzcyB7XG4gIHByaXZhdGUgYmFja2VuZDogTWFwPHN0cmluZywgUHJvbWlzZTxHaGNNb2RpUHJvY2Vzc1JlYWw+PlxuICBwcml2YXRlIGRpc3Bvc2FibGVzOiBDb21wb3NpdGVEaXNwb3NhYmxlXG4gIHByaXZhdGUgZW1pdHRlcjogVEVtaXR0ZXI8e1xuICAgICdkaWQtZGVzdHJveSc6IHVuZGVmaW5lZFxuICAgICd3YXJuaW5nJzogc3RyaW5nXG4gICAgJ2Vycm9yJzogSUVycm9yQ2FsbGJhY2tBcmdzXG4gICAgJ2JhY2tlbmQtYWN0aXZlJzogdm9pZFxuICAgICdiYWNrZW5kLWlkbGUnOiB2b2lkXG4gICAgJ3F1ZXVlLWlkbGUnOiB7IHF1ZXVlOiBDb21tYW5kcyB9XG4gIH0+XG4gIHByaXZhdGUgYnVmZmVyRGlyTWFwOiBXZWFrTWFwPEF0b21UeXBlcy5UZXh0QnVmZmVyLCBBdG9tVHlwZXMuRGlyZWN0b3J5PlxuICBwcml2YXRlIGNvbW1hbmRRdWV1ZXM6IHtbSyBpbiBDb21tYW5kc106IFF1ZXVlfVxuXG4gIGNvbnN0cnVjdG9yKCkge1xuICAgIHRoaXMuZGlzcG9zYWJsZXMgPSBuZXcgQ29tcG9zaXRlRGlzcG9zYWJsZSgpXG4gICAgdGhpcy5lbWl0dGVyID0gbmV3IEVtaXR0ZXIoKVxuICAgIHRoaXMuZGlzcG9zYWJsZXMuYWRkKHRoaXMuZW1pdHRlcilcbiAgICB0aGlzLmJ1ZmZlckRpck1hcCA9IG5ldyBXZWFrTWFwKClcbiAgICB0aGlzLmJhY2tlbmQgPSBuZXcgTWFwKClcblxuICAgIGlmIChwcm9jZXNzLmVudi5HSENfUEFDS0FHRV9QQVRIICYmICFhdG9tLmNvbmZpZy5nZXQoJ2hhc2tlbGwtZ2hjLW1vZC5zdXBwcmVzc0doY1BhY2thZ2VQYXRoV2FybmluZycpKSB7XG4gICAgICBVdGlsLndhcm5HSENQYWNrYWdlUGF0aCgpXG4gICAgfVxuXG4gICAgdGhpcy5jb21tYW5kUXVldWVzID0ge1xuICAgICAgY2hlY2tsaW50OiBuZXcgUXVldWUoMiksXG4gICAgICBicm93c2U6IG5ldyBRdWV1ZShhdG9tLmNvbmZpZy5nZXQoJ2hhc2tlbGwtZ2hjLW1vZC5tYXhCcm93c2VQcm9jZXNzZXMnKSksXG4gICAgICB0eXBlaW5mbzogbmV3IFF1ZXVlKDEpLFxuICAgICAgZmluZDogbmV3IFF1ZXVlKDEpLFxuICAgICAgaW5pdDogbmV3IFF1ZXVlKDQpLFxuICAgICAgbGlzdDogbmV3IFF1ZXVlKDEpLFxuICAgICAgbG93bWVtOiBuZXcgUXVldWUoMSksXG4gICAgfVxuICAgIHRoaXMuZGlzcG9zYWJsZXMuYWRkKGF0b20uY29uZmlnLm9uRGlkQ2hhbmdlKCdoYXNrZWxsLWdoYy1tb2QubWF4QnJvd3NlUHJvY2Vzc2VzJywgKHsgbmV3VmFsdWUgfSkgPT5cbiAgICAgIHRoaXMuY29tbWFuZFF1ZXVlcy5icm93c2UgPSBuZXcgUXVldWUobmV3VmFsdWUgYXMgbnVtYmVyKSksXG4gICAgKVxuICB9XG5cbiAgcHVibGljIGFzeW5jIGdldFJvb3REaXIoYnVmZmVyOiBBdG9tVHlwZXMuVGV4dEJ1ZmZlcik6IFByb21pc2U8QXRvbVR5cGVzLkRpcmVjdG9yeT4ge1xuICAgIGxldCBkaXJcbiAgICBkaXIgPSB0aGlzLmJ1ZmZlckRpck1hcC5nZXQoYnVmZmVyKVxuICAgIGlmIChkaXIpIHtcbiAgICAgIHJldHVybiBkaXJcbiAgICB9XG4gICAgZGlyID0gYXdhaXQgVXRpbC5nZXRSb290RGlyKGJ1ZmZlcilcbiAgICB0aGlzLmJ1ZmZlckRpck1hcC5zZXQoYnVmZmVyLCBkaXIpXG4gICAgcmV0dXJuIGRpclxuICB9XG5cbiAgcHVibGljIGtpbGxQcm9jZXNzKCkge1xuICAgIGZvciAoY29uc3QgYnAgb2YgdGhpcy5iYWNrZW5kLnZhbHVlcygpKSB7XG4gICAgICBicC50aGVuKChiKSA9PiBiLmtpbGxQcm9jZXNzKCkpXG4gICAgfVxuICAgIHRoaXMuYmFja2VuZC5jbGVhcigpXG4gIH1cblxuICBwdWJsaWMgZGVzdHJveSgpIHtcbiAgICBmb3IgKGNvbnN0IGJwIG9mIHRoaXMuYmFja2VuZC52YWx1ZXMoKSkge1xuICAgICAgYnAudGhlbigoYikgPT4gYi5kZXN0cm95KCkpXG4gICAgfVxuICAgIHRoaXMuYmFja2VuZC5jbGVhcigpXG4gICAgdGhpcy5lbWl0dGVyLmVtaXQoJ2RpZC1kZXN0cm95JywgdW5kZWZpbmVkKVxuICAgIHRoaXMuZGlzcG9zYWJsZXMuZGlzcG9zZSgpXG4gIH1cblxuICBwdWJsaWMgb25EaWREZXN0cm95KGNhbGxiYWNrOiAoKSA9PiB2b2lkKSB7XG4gICAgcmV0dXJuIHRoaXMuZW1pdHRlci5vbignZGlkLWRlc3Ryb3knLCBjYWxsYmFjaylcbiAgfVxuXG4gIHB1YmxpYyBvbldhcm5pbmcoY2FsbGJhY2s6ICh3YXJuaW5nOiBzdHJpbmcpID0+IHZvaWQpIHtcbiAgICByZXR1cm4gdGhpcy5lbWl0dGVyLm9uKCd3YXJuaW5nJywgY2FsbGJhY2spXG4gIH1cblxuICBwdWJsaWMgb25FcnJvcihjYWxsYmFjazogKGVycm9yOiBJRXJyb3JDYWxsYmFja0FyZ3MpID0+IHZvaWQpIHtcbiAgICByZXR1cm4gdGhpcy5lbWl0dGVyLm9uKCdlcnJvcicsIGNhbGxiYWNrKVxuICB9XG5cbiAgcHVibGljIG9uQmFja2VuZEFjdGl2ZShjYWxsYmFjazogKCkgPT4gdm9pZCkge1xuICAgIHJldHVybiB0aGlzLmVtaXR0ZXIub24oJ2JhY2tlbmQtYWN0aXZlJywgY2FsbGJhY2spXG4gIH1cblxuICBwdWJsaWMgb25CYWNrZW5kSWRsZShjYWxsYmFjazogKCkgPT4gdm9pZCkge1xuICAgIHJldHVybiB0aGlzLmVtaXR0ZXIub24oJ2JhY2tlbmQtaWRsZScsIGNhbGxiYWNrKVxuICB9XG5cbiAgcHVibGljIG9uUXVldWVJZGxlKGNhbGxiYWNrOiAoKSA9PiB2b2lkKSB7XG4gICAgcmV0dXJuIHRoaXMuZW1pdHRlci5vbigncXVldWUtaWRsZScsIGNhbGxiYWNrKVxuICB9XG5cbiAgcHVibGljIGFzeW5jIHJ1bkxpc3QoYnVmZmVyOiBBdG9tVHlwZXMuVGV4dEJ1ZmZlcikge1xuICAgIHJldHVybiB0aGlzLnF1ZXVlQ21kKCdsaXN0JywgYXdhaXQgdGhpcy5nZXRSb290RGlyKGJ1ZmZlciksICgpID0+ICh7IGNvbW1hbmQ6ICdsaXN0JyB9KSlcbiAgfVxuXG4gIHB1YmxpYyBhc3luYyBydW5MYW5nKGRpcjogQXRvbVR5cGVzLkRpcmVjdG9yeSkge1xuICAgIHJldHVybiB0aGlzLnF1ZXVlQ21kKCdpbml0JywgZGlyLCAoKSA9PiAoeyBjb21tYW5kOiAnbGFuZycgfSkpXG4gIH1cblxuICBwdWJsaWMgYXN5bmMgcnVuRmxhZyhkaXI6IEF0b21UeXBlcy5EaXJlY3RvcnkpIHtcbiAgICByZXR1cm4gdGhpcy5xdWV1ZUNtZCgnaW5pdCcsIGRpciwgKCkgPT4gKHsgY29tbWFuZDogJ2ZsYWcnIH0pKVxuICB9XG5cbiAgcHVibGljIGFzeW5jIHJ1bkJyb3dzZShyb290RGlyOiBBdG9tVHlwZXMuRGlyZWN0b3J5LCBtb2R1bGVzOiBzdHJpbmdbXSk6IFByb21pc2U8U3ltYm9sRGVzY1tdPiB7XG4gICAgY29uc3QgbGluZXMgPSBhd2FpdCB0aGlzLnF1ZXVlQ21kKCdicm93c2UnLCByb290RGlyLCAoY2FwcykgPT4gKHtcbiAgICAgIGNvbW1hbmQ6ICdicm93c2UnLFxuICAgICAgZGFzaEFyZ3M6IGNhcHMuYnJvd3NlUGFyZW50cyA/IFsnLWQnLCAnLW8nLCAnLXAnXSA6IFsnLWQnLCAnLW8nXSxcbiAgICAgIGFyZ3M6IGNhcHMuYnJvd3NlTWFpbiA/IG1vZHVsZXMgOiBtb2R1bGVzLmZpbHRlcigodikgPT4gdiAhPT0gJ01haW4nKSxcbiAgICB9KSlcbiAgICByZXR1cm4gbGluZXMubWFwKChzKSA9PiB7XG4gICAgICAvLyBlbnVtRnJvbSA6OiBFbnVtIGEgPT4gYSAtPiBbYV0gLS0gZnJvbTpFbnVtXG4gICAgICBjb25zdCBwYXR0ZXJuID0gL14oLio/KSA6OiAoLio/KSg/OiAtLSBmcm9tOiguKikpPyQvXG4gICAgICBjb25zdCBtYXRjaCA9IHMubWF0Y2gocGF0dGVybilcbiAgICAgIGxldCBuYW1lOiBzdHJpbmdcbiAgICAgIGxldCB0eXBlU2lnbmF0dXJlOiBzdHJpbmcgfCB1bmRlZmluZWRcbiAgICAgIGxldCBwYXJlbnQ6IHN0cmluZyB8IHVuZGVmaW5lZFxuICAgICAgaWYgKG1hdGNoKSB7XG4gICAgICAgIG5hbWUgPSBtYXRjaFsxXVxuICAgICAgICB0eXBlU2lnbmF0dXJlID0gbWF0Y2hbMl1cbiAgICAgICAgcGFyZW50ID0gbWF0Y2hbM11cbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIG5hbWUgPSBzXG4gICAgICB9XG4gICAgICBsZXQgc3ltYm9sVHlwZTogVVBJLkNvbXBsZXRpb25CYWNrZW5kLlN5bWJvbFR5cGVcbiAgICAgIGlmICh0eXBlU2lnbmF0dXJlICYmIC9eKD86dHlwZXxkYXRhfG5ld3R5cGUpLy50ZXN0KHR5cGVTaWduYXR1cmUpKSB7XG4gICAgICAgIHN5bWJvbFR5cGUgPSAndHlwZSdcbiAgICAgIH0gZWxzZSBpZiAodHlwZVNpZ25hdHVyZSAmJiAvXig/OmNsYXNzKS8udGVzdCh0eXBlU2lnbmF0dXJlKSkge1xuICAgICAgICBzeW1ib2xUeXBlID0gJ2NsYXNzJ1xuICAgICAgfSBlbHNlIGlmICgvXlxcKC4qXFwpJC8udGVzdChuYW1lKSkge1xuICAgICAgICBzeW1ib2xUeXBlID0gJ29wZXJhdG9yJ1xuICAgICAgICBuYW1lID0gbmFtZS5zbGljZSgxLCAtMSlcbiAgICAgIH0gZWxzZSBpZiAoVXRpbC5pc1VwcGVyQ2FzZShuYW1lWzBdKSkge1xuICAgICAgICBzeW1ib2xUeXBlID0gJ3RhZydcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHN5bWJvbFR5cGUgPSAnZnVuY3Rpb24nXG4gICAgICB9XG4gICAgICByZXR1cm4geyBuYW1lLCB0eXBlU2lnbmF0dXJlLCBzeW1ib2xUeXBlLCBwYXJlbnQgfVxuICAgIH0pXG4gIH1cblxuICBwdWJsaWMgYXN5bmMgZ2V0VHlwZUluQnVmZmVyKFxuICAgIGJ1ZmZlcjogQXRvbVR5cGVzLlRleHRCdWZmZXIsIGNyYW5nZTogQXRvbVR5cGVzLlJhbmdlLFxuICApIHtcbiAgICBpZiAoIWJ1ZmZlci5nZXRVcmkoKSkgeyB0aHJvdyBuZXcgRXJyb3IoJ05vIFVSSSBmb3IgYnVmZmVyJykgfVxuICAgIGNyYW5nZSA9IFV0aWwudGFiU2hpZnRGb3JSYW5nZShidWZmZXIsIGNyYW5nZSlcbiAgICBjb25zdCByb290RGlyID0gYXdhaXQgdGhpcy5nZXRSb290RGlyKGJ1ZmZlcilcbiAgICBjb25zdCBsaW5lcyA9IGF3YWl0IHRoaXMucXVldWVDbWQoJ3R5cGVpbmZvJywgcm9vdERpciwgKGNhcHMpID0+ICh7XG4gICAgICBpbnRlcmFjdGl2ZTogdHJ1ZSxcbiAgICAgIGNvbW1hbmQ6ICd0eXBlJyxcbiAgICAgIHVyaTogYnVmZmVyLmdldFVyaSgpLFxuICAgICAgdGV4dDogYnVmZmVyLmlzTW9kaWZpZWQoKSA/IGJ1ZmZlci5nZXRUZXh0KCkgOiB1bmRlZmluZWQsXG4gICAgICBkYXNoQXJnczogY2Fwcy50eXBlQ29uc3RyYWludHMgPyBbJy1jJ10gOiBbXSxcbiAgICAgIGFyZ3M6IFtjcmFuZ2Uuc3RhcnQucm93ICsgMSwgY3JhbmdlLnN0YXJ0LmNvbHVtbiArIDFdLm1hcCgodikgPT4gdi50b1N0cmluZygpKSxcbiAgICB9KSlcblxuICAgIGNvbnN0IHJ4ID0gL14oXFxkKylcXHMrKFxcZCspXFxzKyhcXGQrKVxccysoXFxkKylcXHMrXCIoW15dKilcIiQvIC8vIFteXSBiYXNpY2FsbHkgbWVhbnMgXCJhbnl0aGluZ1wiLCBpbmNsLiBuZXdsaW5lc1xuICAgIGZvciAoY29uc3QgbGluZSBvZiBsaW5lcykge1xuICAgICAgY29uc3QgbWF0Y2ggPSBsaW5lLm1hdGNoKHJ4KVxuICAgICAgaWYgKCFtYXRjaCkgeyBjb250aW51ZSB9XG4gICAgICBjb25zdCBbcm93c3RhcnQsIGNvbHN0YXJ0LCByb3dlbmQsIGNvbGVuZCwgdHlwZV0gPSBtYXRjaC5zbGljZSgxKVxuICAgICAgY29uc3QgcmFuZ2UgPVxuICAgICAgICBSYW5nZS5mcm9tT2JqZWN0KFtcbiAgICAgICAgICBbcGFyc2VJbnQocm93c3RhcnQsIDEwKSAtIDEsIHBhcnNlSW50KGNvbHN0YXJ0LCAxMCkgLSAxXSxcbiAgICAgICAgICBbcGFyc2VJbnQocm93ZW5kLCAxMCkgLSAxLCBwYXJzZUludChjb2xlbmQsIDEwKSAtIDFdLFxuICAgICAgICBdKVxuICAgICAgaWYgKHJhbmdlLmlzRW1wdHkoKSkgeyBjb250aW51ZSB9XG4gICAgICBpZiAoIXJhbmdlLmNvbnRhaW5zUmFuZ2UoY3JhbmdlKSkgeyBjb250aW51ZSB9XG4gICAgICByZXR1cm4ge1xuICAgICAgICByYW5nZTogVXRpbC50YWJVbnNoaWZ0Rm9yUmFuZ2UoYnVmZmVyLCByYW5nZSksXG4gICAgICAgIHR5cGU6IHR5cGUucmVwbGFjZSgvXFxcXFwiL2csICdcIicpLFxuICAgICAgfVxuICAgIH1cbiAgICB0aHJvdyBuZXcgRXJyb3IoJ05vIHR5cGUnKVxuICB9XG5cbiAgcHVibGljIGFzeW5jIGRvQ2FzZVNwbGl0KGJ1ZmZlcjogQXRvbVR5cGVzLlRleHRCdWZmZXIsIGNyYW5nZTogQXRvbVR5cGVzLlJhbmdlKSB7XG4gICAgaWYgKCFidWZmZXIuZ2V0VXJpKCkpIHsgdGhyb3cgbmV3IEVycm9yKCdObyBVUkkgZm9yIGJ1ZmZlcicpIH1cbiAgICBjcmFuZ2UgPSBVdGlsLnRhYlNoaWZ0Rm9yUmFuZ2UoYnVmZmVyLCBjcmFuZ2UpXG4gICAgY29uc3Qgcm9vdERpciA9IGF3YWl0IHRoaXMuZ2V0Um9vdERpcihidWZmZXIpXG4gICAgY29uc3QgbGluZXMgPSBhd2FpdCB0aGlzLnF1ZXVlQ21kKCd0eXBlaW5mbycsIHJvb3REaXIsIChjYXBzKSA9PiAoe1xuICAgICAgaW50ZXJhY3RpdmU6IGNhcHMuaW50ZXJhY3RpdmVDYXNlU3BsaXQsXG4gICAgICBjb21tYW5kOiAnc3BsaXQnLFxuICAgICAgdXJpOiBidWZmZXIuZ2V0VXJpKCksXG4gICAgICB0ZXh0OiBidWZmZXIuaXNNb2RpZmllZCgpID8gYnVmZmVyLmdldFRleHQoKSA6IHVuZGVmaW5lZCxcbiAgICAgIGFyZ3M6IFtjcmFuZ2Uuc3RhcnQucm93ICsgMSwgY3JhbmdlLnN0YXJ0LmNvbHVtbiArIDFdLm1hcCgodikgPT4gdi50b1N0cmluZygpKSxcbiAgICB9KSlcblxuICAgIGNvbnN0IHJ4ID0gL14oXFxkKylcXHMrKFxcZCspXFxzKyhcXGQrKVxccysoXFxkKylcXHMrXCIoW15dKilcIiQvIC8vIFteXSBiYXNpY2FsbHkgbWVhbnMgXCJhbnl0aGluZ1wiLCBpbmNsLiBuZXdsaW5lc1xuICAgIGNvbnN0IHJlcyA9IFtdXG4gICAgZm9yIChjb25zdCBsaW5lIG9mIGxpbmVzKSB7XG4gICAgICBjb25zdCBtYXRjaCA9IGxpbmUubWF0Y2gocngpXG4gICAgICBpZiAoIW1hdGNoKSB7XG4gICAgICAgIFV0aWwud2FybihgZ2hjLW1vZCBzYXlzOiAke2xpbmV9YClcbiAgICAgICAgY29udGludWVcbiAgICAgIH1cbiAgICAgIGNvbnN0IFtyb3dzdGFydCwgY29sc3RhcnQsIHJvd2VuZCwgY29sZW5kLCB0ZXh0XSA9IG1hdGNoLnNsaWNlKDEpXG4gICAgICByZXMucHVzaCh7XG4gICAgICAgIHJhbmdlOlxuICAgICAgICBSYW5nZS5mcm9tT2JqZWN0KFtcbiAgICAgICAgICBbcGFyc2VJbnQocm93c3RhcnQsIDEwKSAtIDEsIHBhcnNlSW50KGNvbHN0YXJ0LCAxMCkgLSAxXSxcbiAgICAgICAgICBbcGFyc2VJbnQocm93ZW5kLCAxMCkgLSAxLCBwYXJzZUludChjb2xlbmQsIDEwKSAtIDFdLFxuICAgICAgICBdKSxcbiAgICAgICAgcmVwbGFjZW1lbnQ6IHRleHQsXG4gICAgICB9KVxuICAgIH1cbiAgICByZXR1cm4gcmVzXG4gIH1cblxuICBwdWJsaWMgYXN5bmMgZG9TaWdGaWxsKGJ1ZmZlcjogQXRvbVR5cGVzLlRleHRCdWZmZXIsIGNyYW5nZTogQXRvbVR5cGVzLlJhbmdlKSB7XG4gICAgaWYgKCFidWZmZXIuZ2V0VXJpKCkpIHsgdGhyb3cgbmV3IEVycm9yKCdObyBVUkkgZm9yIGJ1ZmZlcicpIH1cbiAgICBjcmFuZ2UgPSBVdGlsLnRhYlNoaWZ0Rm9yUmFuZ2UoYnVmZmVyLCBjcmFuZ2UpXG4gICAgY29uc3Qgcm9vdERpciA9IGF3YWl0IHRoaXMuZ2V0Um9vdERpcihidWZmZXIpXG4gICAgY29uc3QgbGluZXMgPSBhd2FpdCB0aGlzLnF1ZXVlQ21kKCd0eXBlaW5mbycsIHJvb3REaXIsIChjYXBzKSA9PiAoe1xuICAgICAgaW50ZXJhY3RpdmU6IGNhcHMuaW50ZXJhY3RpdmVDYXNlU3BsaXQsXG4gICAgICBjb21tYW5kOiAnc2lnJyxcbiAgICAgIHVyaTogYnVmZmVyLmdldFVyaSgpLFxuICAgICAgdGV4dDogYnVmZmVyLmlzTW9kaWZpZWQoKSA/IGJ1ZmZlci5nZXRUZXh0KCkgOiB1bmRlZmluZWQsXG4gICAgICBhcmdzOiBbY3JhbmdlLnN0YXJ0LnJvdyArIDEsIGNyYW5nZS5zdGFydC5jb2x1bW4gKyAxXS5tYXAoKHYpID0+IHYudG9TdHJpbmcoKSksXG4gICAgfSkpXG4gICAgaWYgKGxpbmVzLmxlbmd0aCA8IDIpIHsgdGhyb3cgbmV3IEVycm9yKGBDb3VsZCBub3QgdW5kZXJzdGFuZCByZXNwb25zZTogJHtsaW5lcy5qb2luKCdcXG4nKX1gKSB9XG4gICAgY29uc3QgcnggPSAvXihcXGQrKVxccysoXFxkKylcXHMrKFxcZCspXFxzKyhcXGQrKSQvIC8vIHBvc2l0aW9uIHJ4XG4gICAgY29uc3QgbWF0Y2ggPSBsaW5lc1sxXS5tYXRjaChyeClcbiAgICBpZiAoIW1hdGNoKSB7IHRocm93IG5ldyBFcnJvcihgQ291bGQgbm90IHVuZGVyc3RhbmQgcmVzcG9uc2U6ICR7bGluZXMuam9pbignXFxuJyl9YCkgfVxuICAgIGNvbnN0IFtyb3dzdGFydCwgY29sc3RhcnQsIHJvd2VuZCwgY29sZW5kXSA9IG1hdGNoLnNsaWNlKDEpXG4gICAgY29uc3QgcmFuZ2UgPVxuICAgICAgUmFuZ2UuZnJvbU9iamVjdChbXG4gICAgICAgIFtwYXJzZUludChyb3dzdGFydCwgMTApIC0gMSwgcGFyc2VJbnQoY29sc3RhcnQsIDEwKSAtIDFdLFxuICAgICAgICBbcGFyc2VJbnQocm93ZW5kLCAxMCkgLSAxLCBwYXJzZUludChjb2xlbmQsIDEwKSAtIDFdLFxuICAgICAgXSlcbiAgICByZXR1cm4ge1xuICAgICAgdHlwZTogbGluZXNbMF0sXG4gICAgICByYW5nZSxcbiAgICAgIGJvZHk6IGxpbmVzLnNsaWNlKDIpLmpvaW4oJ1xcbicpLFxuICAgIH1cbiAgfVxuXG4gIHB1YmxpYyBhc3luYyBnZXRJbmZvSW5CdWZmZXIoZWRpdG9yOiBBdG9tVHlwZXMuVGV4dEVkaXRvciwgY3JhbmdlOiBBdG9tVHlwZXMuUmFuZ2UpIHtcbiAgICBjb25zdCBidWZmZXIgPSBlZGl0b3IuZ2V0QnVmZmVyKClcbiAgICBpZiAoIWJ1ZmZlci5nZXRVcmkoKSkgeyB0aHJvdyBuZXcgRXJyb3IoJ05vIFVSSSBmb3IgYnVmZmVyJykgfVxuICAgIGNvbnN0IHN5bUluZm8gPSBVdGlsLmdldFN5bWJvbEluUmFuZ2UoZWRpdG9yLCBjcmFuZ2UpXG4gICAgaWYgKCFzeW1JbmZvKSB7IHRocm93IG5ldyBFcnJvcignQ291bGRuXFwndCBnZXQgc3ltYm9sIGZvciBpbmZvJykgfVxuICAgIGNvbnN0IHsgc3ltYm9sLCByYW5nZSB9ID0gc3ltSW5mb1xuXG4gICAgY29uc3QgbGluZXMgPSBhd2FpdCB0aGlzLnF1ZXVlQ21kKCd0eXBlaW5mbycsIGF3YWl0IHRoaXMuZ2V0Um9vdERpcihidWZmZXIpLCAoKSA9PiAoe1xuICAgICAgaW50ZXJhY3RpdmU6IHRydWUsXG4gICAgICBjb21tYW5kOiAnaW5mbycsXG4gICAgICB1cmk6IGJ1ZmZlci5nZXRVcmkoKSxcbiAgICAgIHRleHQ6IGJ1ZmZlci5pc01vZGlmaWVkKCkgPyBidWZmZXIuZ2V0VGV4dCgpIDogdW5kZWZpbmVkLFxuICAgICAgYXJnczogW3N5bWJvbF0sXG4gICAgfSkpXG5cbiAgICBjb25zdCBpbmZvID0gbGluZXMuam9pbignXFxuJylcbiAgICBpZiAoKGluZm8gPT09ICdDYW5ub3Qgc2hvdyBpbmZvJykgfHwgIWluZm8pIHtcbiAgICAgIHRocm93IG5ldyBFcnJvcignTm8gaW5mbycpXG4gICAgfSBlbHNlIHtcbiAgICAgIHJldHVybiB7IHJhbmdlLCBpbmZvIH1cbiAgICB9XG4gIH1cblxuICBwdWJsaWMgYXN5bmMgZmluZFN5bWJvbFByb3ZpZGVyc0luQnVmZmVyKGVkaXRvcjogQXRvbVR5cGVzLlRleHRFZGl0b3IsIGNyYW5nZTogQXRvbVR5cGVzLlJhbmdlKSB7XG4gICAgY29uc3QgYnVmZmVyID0gZWRpdG9yLmdldEJ1ZmZlcigpXG4gICAgY29uc3Qgc3ltSW5mbyA9IFV0aWwuZ2V0U3ltYm9sSW5SYW5nZShlZGl0b3IsIGNyYW5nZSlcbiAgICBpZiAoIXN5bUluZm8pIHsgdGhyb3cgbmV3IEVycm9yKCdDb3VsZG5cXCd0IGdldCBzeW1ib2wgZm9yIGltcG9ydCcpIH1cbiAgICBjb25zdCB7IHN5bWJvbCB9ID0gc3ltSW5mb1xuXG4gICAgcmV0dXJuIHRoaXMucXVldWVDbWQoJ2ZpbmQnLCBhd2FpdCB0aGlzLmdldFJvb3REaXIoYnVmZmVyKSwgKCkgPT4gKHtcbiAgICAgIGludGVyYWN0aXZlOiB0cnVlLFxuICAgICAgY29tbWFuZDogJ2ZpbmQnLFxuICAgICAgYXJnczogW3N5bWJvbF0sXG4gICAgfSkpXG4gIH1cblxuICBwdWJsaWMgYXN5bmMgZG9DaGVja0J1ZmZlcihidWZmZXI6IEF0b21UeXBlcy5UZXh0QnVmZmVyLCBmYXN0OiBib29sZWFuKSB7XG4gICAgcmV0dXJuIHRoaXMuZG9DaGVja09yTGludEJ1ZmZlcignY2hlY2snLCBidWZmZXIsIGZhc3QpXG4gIH1cblxuICBwdWJsaWMgYXN5bmMgZG9MaW50QnVmZmVyKGJ1ZmZlcjogQXRvbVR5cGVzLlRleHRCdWZmZXIpIHtcbiAgICByZXR1cm4gdGhpcy5kb0NoZWNrT3JMaW50QnVmZmVyKCdsaW50JywgYnVmZmVyLCBmYWxzZSlcbiAgfVxuXG4gIHB1YmxpYyBhc3luYyBkb0NoZWNrQW5kTGludChidWZmZXI6IEF0b21UeXBlcy5UZXh0QnVmZmVyLCBmYXN0OiBib29sZWFuKSB7XG4gICAgY29uc3QgW2NyLCBscl0gPSBhd2FpdCBQcm9taXNlLmFsbChbdGhpcy5kb0NoZWNrQnVmZmVyKGJ1ZmZlciwgZmFzdCksIHRoaXMuZG9MaW50QnVmZmVyKGJ1ZmZlcildKVxuICAgIHJldHVybiBjci5jb25jYXQobHIpXG4gIH1cblxuICBwcml2YXRlIGFzeW5jIGluaXRCYWNrZW5kKHJvb3REaXI6IEF0b21UeXBlcy5EaXJlY3RvcnkpOiBQcm9taXNlPEdoY01vZGlQcm9jZXNzUmVhbD4ge1xuICAgIGNvbnN0IHJvb3RQYXRoID0gcm9vdERpci5nZXRQYXRoKClcbiAgICBjb25zdCBjYWNoZWQgPSB0aGlzLmJhY2tlbmQuZ2V0KHJvb3RQYXRoKVxuICAgIGlmIChjYWNoZWQpIHsgcmV0dXJuIGF3YWl0IGNhY2hlZCB9XG4gICAgY29uc3QgbmV3QmFja2VuZCA9IGNyZWF0ZUdoY01vZGlQcm9jZXNzUmVhbChyb290RGlyKVxuICAgIHRoaXMuYmFja2VuZC5zZXQocm9vdFBhdGgsIG5ld0JhY2tlbmQpXG4gICAgY29uc3QgYmFja2VuZCA9IGF3YWl0IG5ld0JhY2tlbmRcbiAgICB0aGlzLmRpc3Bvc2FibGVzLmFkZChcbiAgICAgIGJhY2tlbmQub25FcnJvcigoYXJnKSA9PiB0aGlzLmVtaXR0ZXIuZW1pdCgnZXJyb3InLCBhcmcpKSxcbiAgICAgIGJhY2tlbmQub25XYXJuaW5nKChhcmcpID0+IHRoaXMuZW1pdHRlci5lbWl0KCd3YXJuaW5nJywgYXJnKSksXG4gICAgKVxuICAgIHJldHVybiBiYWNrZW5kXG4gIH1cblxuICBwcml2YXRlIGFzeW5jIHF1ZXVlQ21kKFxuICAgIHF1ZXVlTmFtZTogQ29tbWFuZHMsXG4gICAgZGlyOiBBdG9tVHlwZXMuRGlyZWN0b3J5LFxuICAgIHJ1bkFyZ3NGdW5jOiAoY2FwczogR0hDTW9kQ2FwcykgPT4ge1xuICAgICAgY29tbWFuZDogc3RyaW5nLCB0ZXh0Pzogc3RyaW5nLCB1cmk/OiBzdHJpbmcsIGludGVyYWN0aXZlPzogYm9vbGVhbixcbiAgICAgIGRhc2hBcmdzPzogc3RyaW5nW10sIGFyZ3M/OiBzdHJpbmdbXVxuICAgIH0sXG4gICk6IFByb21pc2U8c3RyaW5nW10+IHtcbiAgICBpZiAoYXRvbS5jb25maWcuZ2V0KCdoYXNrZWxsLWdoYy1tb2QubG93TWVtb3J5U3lzdGVtJykpIHtcbiAgICAgIHF1ZXVlTmFtZSA9ICdsb3dtZW0nXG4gICAgfVxuICAgIGNvbnN0IGJhY2tlbmQgPSBhd2FpdCB0aGlzLmluaXRCYWNrZW5kKGRpcilcbiAgICBjb25zdCBwcm9taXNlID0gdGhpcy5jb21tYW5kUXVldWVzW3F1ZXVlTmFtZV0uYWRkKGFzeW5jICgpID0+IHtcbiAgICAgIHRoaXMuZW1pdHRlci5lbWl0KCdiYWNrZW5kLWFjdGl2ZScsIHVuZGVmaW5lZClcbiAgICAgIHRyeSB7XG4gICAgICAgIGNvbnN0IHNldHRpbmdzID0gYXdhaXQgZ2V0U2V0dGluZ3MoZGlyKVxuICAgICAgICBpZiAoc2V0dGluZ3MuZGlzYWJsZSkgeyB0aHJvdyBuZXcgRXJyb3IoJ0doYy1tb2QgZGlzYWJsZWQgaW4gc2V0dGluZ3MnKSB9XG4gICAgICAgIHJldHVybiBiYWNrZW5kLnJ1bih7XG4gICAgICAgICAgLi4ucnVuQXJnc0Z1bmMoYmFja2VuZC5nZXRDYXBzKCkpLFxuICAgICAgICAgIHN1cHByZXNzRXJyb3JzOiBzZXR0aW5ncy5zdXBwcmVzc0Vycm9ycyxcbiAgICAgICAgICBnaGNPcHRpb25zOiBzZXR0aW5ncy5naGNPcHRpb25zLFxuICAgICAgICAgIGdoY01vZE9wdGlvbnM6IHNldHRpbmdzLmdoY01vZE9wdGlvbnMsXG4gICAgICAgIH0pXG4gICAgICB9IGNhdGNoIChlcnIpIHtcbiAgICAgICAgVXRpbC53YXJuKGVycilcbiAgICAgICAgdGhyb3cgZXJyXG4gICAgICB9XG4gICAgfSlcbiAgICBwcm9taXNlLnRoZW4oKHJlcykgPT4ge1xuICAgICAgY29uc3QgcWUgPSAocW46IENvbW1hbmRzKSA9PiB7XG4gICAgICAgIGNvbnN0IHEgPSB0aGlzLmNvbW1hbmRRdWV1ZXNbcW5dXG4gICAgICAgIHJldHVybiAocS5nZXRRdWV1ZUxlbmd0aCgpICsgcS5nZXRQZW5kaW5nTGVuZ3RoKCkpID09PSAwXG4gICAgICB9XG4gICAgICBpZiAocWUocXVldWVOYW1lKSkge1xuICAgICAgICB0aGlzLmVtaXR0ZXIuZW1pdCgncXVldWUtaWRsZScsIHsgcXVldWU6IHF1ZXVlTmFtZSB9KVxuICAgICAgICBpZiAoT2JqZWN0LmtleXModGhpcy5jb21tYW5kUXVldWVzKS5ldmVyeShxZSkpIHtcbiAgICAgICAgICB0aGlzLmVtaXR0ZXIuZW1pdCgnYmFja2VuZC1pZGxlJywgdW5kZWZpbmVkKVxuICAgICAgICB9XG4gICAgICB9XG4gICAgfSlcbiAgICByZXR1cm4gcHJvbWlzZVxuICB9XG5cbiAgcHJpdmF0ZSBhc3luYyBkb0NoZWNrT3JMaW50QnVmZmVyKGNtZDogJ2NoZWNrJyB8ICdsaW50JywgYnVmZmVyOiBBdG9tVHlwZXMuVGV4dEJ1ZmZlciwgZmFzdDogYm9vbGVhbikge1xuICAgIGxldCBkYXNoQXJnc1xuICAgIGlmIChidWZmZXIuaXNFbXB0eSgpKSB7IHJldHVybiBbXSB9XG4gICAgaWYgKCFidWZmZXIuZ2V0VXJpKCkpIHsgcmV0dXJuIFtdIH1cblxuICAgIC8vIEEgZGlydHkgaGFjayB0byBtYWtlIGxpbnQgd29yayB3aXRoIGxoc1xuICAgIGxldCB1cmkgPSBidWZmZXIuZ2V0VXJpKClcbiAgICBjb25zdCBvbGR1cmkgPSBidWZmZXIuZ2V0VXJpKClcbiAgICBsZXQgdGV4dFxuICAgIHRyeSB7XG4gICAgICBpZiAoKGNtZCA9PT0gJ2xpbnQnKSAmJiAoZXh0bmFtZSh1cmkpID09PSAnLmxocycpKSB7XG4gICAgICAgIHVyaSA9IHVyaS5zbGljZSgwLCAtMSlcbiAgICAgICAgdGV4dCA9IGF3YWl0IHVubGl0KG9sZHVyaSwgYnVmZmVyLmdldFRleHQoKSlcbiAgICAgIH0gZWxzZSBpZiAoYnVmZmVyLmlzTW9kaWZpZWQoKSkge1xuICAgICAgICB0ZXh0ID0gYnVmZmVyLmdldFRleHQoKVxuICAgICAgfVxuICAgIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgICAvLyBUT0RPOiBSZWplY3RcbiAgICAgIGNvbnN0IG0gPSAoZXJyb3IgYXMgRXJyb3IpLm1lc3NhZ2UubWF0Y2goL14oLio/KTooWzAtOV0rKTogKiguKikgKiQvKVxuICAgICAgaWYgKCFtKSB7IHRocm93IGVycm9yIH1cbiAgICAgIGNvbnN0IFt1cmkyLCBsaW5lLCBtZXNzXSA9IG0uc2xpY2UoMSlcbiAgICAgIHJldHVybiBbe1xuICAgICAgICB1cmk6IHVyaTIsXG4gICAgICAgIHBvc2l0aW9uOiBuZXcgUG9pbnQocGFyc2VJbnQobGluZSwgMTApIC0gMSwgMCksXG4gICAgICAgIG1lc3NhZ2U6IG1lc3MsXG4gICAgICAgIHNldmVyaXR5OiAnbGludCcsXG4gICAgICB9XVxuICAgIH1cbiAgICAvLyBlbmQgb2YgZGlydHkgaGFja1xuXG4gICAgLy8gdHNsaW50OmRpc2FibGUtbmV4dC1saW5lOiB0b3RhbGl0eS1jaGVja1xuICAgIGlmIChjbWQgPT09ICdsaW50Jykge1xuICAgICAgY29uc3Qgb3B0czogc3RyaW5nW10gPSBhdG9tLmNvbmZpZy5nZXQoJ2hhc2tlbGwtZ2hjLW1vZC5obGludE9wdGlvbnMnKVxuICAgICAgZGFzaEFyZ3MgPSBbXVxuICAgICAgZm9yIChjb25zdCBvcHQgb2Ygb3B0cykge1xuICAgICAgICBkYXNoQXJncy5wdXNoKCctLWhsaW50T3B0Jywgb3B0KVxuICAgICAgfVxuICAgIH1cblxuICAgIGNvbnN0IHJvb3REaXIgPSBhd2FpdCB0aGlzLmdldFJvb3REaXIoYnVmZmVyKVxuXG4gICAgY29uc3QgdGV4dEIgPSB0ZXh0XG4gICAgY29uc3QgZGFzaEFyZ3NCID0gZGFzaEFyZ3NcbiAgICBjb25zdCBsaW5lcyA9IGF3YWl0IHRoaXMucXVldWVDbWQoJ2NoZWNrbGludCcsIHJvb3REaXIsICgpID0+ICh7XG4gICAgICBpbnRlcmFjdGl2ZTogZmFzdCxcbiAgICAgIGNvbW1hbmQ6IGNtZCxcbiAgICAgIHVyaSxcbiAgICAgIHRleHQ6IHRleHRCLFxuICAgICAgZGFzaEFyZ3M6IGRhc2hBcmdzQixcbiAgICB9KSlcblxuICAgIGNvbnN0IHJ4ID0gL14oLio/KTooWzAtOVxcc10rKTooWzAtOVxcc10rKTogKig/OihXYXJuaW5nfEVycm9yKTogKik/KFteXSopL1xuICAgIGNvbnN0IHJlcyA9IFtdXG4gICAgZm9yIChjb25zdCBsaW5lIG9mIGxpbmVzKSB7XG4gICAgICBjb25zdCBtYXRjaCA9IGxpbmUubWF0Y2gocngpXG4gICAgICBpZiAoIW1hdGNoKSB7XG4gICAgICAgIGlmIChsaW5lLnRyaW0oKS5sZW5ndGgpIHsgVXRpbC53YXJuKGBnaGMtbW9kIHNheXM6ICR7bGluZX1gKSB9XG4gICAgICAgIGNvbnRpbnVlXG4gICAgICB9XG4gICAgICBjb25zdCBbZmlsZTIsIHJvdywgY29sLCB3YXJuaW5nLCBtZXNzYWdlXSA9IG1hdGNoLnNsaWNlKDEpXG4gICAgICBpZiAoZmlsZTIgPT09ICdEdW1teScgJiYgcm93ID09PSAnMCcgJiYgY29sID09PSAnMCcpIHtcbiAgICAgICAgaWYgKHdhcm5pbmcgPT09ICdFcnJvcicpIHtcbiAgICAgICAgICB0aGlzLmVtaXR0ZXIuZW1pdCgnZXJyb3InLCB7XG4gICAgICAgICAgICBlcnI6IFV0aWwubWtFcnJvcignR0hDTW9kU3Rkb3V0RXJyb3InLCBtZXNzYWdlKSxcbiAgICAgICAgICAgIGNhcHM6IChhd2FpdCB0aGlzLmluaXRCYWNrZW5kKHJvb3REaXIpKS5nZXRDYXBzKCksIC8vIFRPRE86IFRoaXMgaXMgbm90IHByZXR0eVxuICAgICAgICAgIH0pXG4gICAgICAgICAgY29udGludWVcbiAgICAgICAgfSBlbHNlIGlmICh3YXJuaW5nID09PSAnV2FybmluZycpIHtcbiAgICAgICAgICB0aGlzLmVtaXR0ZXIuZW1pdCgnd2FybmluZycsIG1lc3NhZ2UpXG4gICAgICAgICAgY29udGludWVcbiAgICAgICAgfVxuICAgICAgfVxuXG4gICAgICBjb25zdCBmaWxlID0gdXJpLmVuZHNXaXRoKGZpbGUyKSA/IG9sZHVyaSA6IGZpbGUyXG4gICAgICBjb25zdCBzZXZlcml0eSA9XG4gICAgICAgIGNtZCA9PT0gJ2xpbnQnID9cbiAgICAgICAgICAnbGludCdcbiAgICAgICAgICA6IHdhcm5pbmcgPT09ICdXYXJuaW5nJyA/XG4gICAgICAgICAgICAnd2FybmluZydcbiAgICAgICAgICAgIDpcbiAgICAgICAgICAgICdlcnJvcidcbiAgICAgIGNvbnN0IG1lc3NQb3MgPSBuZXcgUG9pbnQocGFyc2VJbnQocm93LCAxMCkgLSAxLCBwYXJzZUludChjb2wsIDEwKSAtIDEpXG4gICAgICBjb25zdCBwb3NpdGlvbiA9IFV0aWwudGFiVW5zaGlmdEZvclBvaW50KGJ1ZmZlciwgbWVzc1BvcylcbiAgICAgIGxldCBteXVyaVxuICAgICAgdHJ5IHtcbiAgICAgICAgbXl1cmkgPSByb290RGlyLmdldEZpbGUocm9vdERpci5yZWxhdGl2aXplKGZpbGUpKS5nZXRQYXRoKClcbiAgICAgIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgICAgIG15dXJpID0gZmlsZVxuICAgICAgfVxuICAgICAgcmVzLnB1c2goe1xuICAgICAgICB1cmk6IG15dXJpLFxuICAgICAgICBwb3NpdGlvbixcbiAgICAgICAgbWVzc2FnZSxcbiAgICAgICAgc2V2ZXJpdHksXG4gICAgICB9KVxuICAgIH1cbiAgICByZXR1cm4gcmVzXG4gIH1cbn1cbiJdfQ==