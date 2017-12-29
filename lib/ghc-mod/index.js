"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const atom_1 = require("atom");
const Util = require("../util");
const path_1 = require("path");
const Queue = require("promise-queue");
const atom_haskell_utils_1 = require("atom-haskell-utils");
const ghc_modi_process_real_factory_1 = require("./ghc-modi-process-real-factory");
const settings_1 = require("./settings");
class GhcModiProcess {
    constructor(upiPromise) {
        this.upiPromise = upiPromise;
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
    async getRootDir(buffer) {
        let dir;
        dir = this.bufferDirMap.get(buffer);
        if (dir) {
            return dir;
        }
        dir = await Util.getRootDir(buffer);
        this.bufferDirMap.set(buffer, dir);
        return dir;
    }
    killProcess() {
        for (const bp of this.backend.values()) {
            bp.then((b) => b.killProcess())
                .catch((e) => {
                atom.notifications.addError('Error killing ghc-mod process', {
                    detail: e.toString(),
                    stack: e.stack,
                    dismissable: true,
                });
            });
        }
        this.backend.clear();
    }
    destroy() {
        for (const bp of this.backend.values()) {
            bp.then((b) => b.destroy())
                .catch((e) => {
                atom.notifications.addError('Error killing ghc-mod process', {
                    detail: e.toString(),
                    stack: e.stack,
                    dismissable: true,
                });
            });
        }
        this.backend.clear();
        this.emitter.emit('did-destroy');
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
    async runList(buffer) {
        return this.queueCmd('list', await this.getRootDir(buffer), () => ({ command: 'list' }));
    }
    async runLang(dir) {
        return this.queueCmd('init', dir, () => ({ command: 'lang' }));
    }
    async runFlag(dir) {
        return this.queueCmd('init', dir, () => ({ command: 'flag' }));
    }
    async runBrowse(rootDir, modules) {
        const lines = await this.queueCmd('browse', rootDir, (caps) => {
            const args = caps.browseMain ? modules : modules.filter((v) => v !== 'Main');
            if (args.length === 0)
                return undefined;
            return {
                command: 'browse',
                dashArgs: caps.browseParents ? ['-d', '-o', '-p'] : ['-d', '-o'],
                args,
            };
        });
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
    }
    async getTypeInBuffer(buffer, crange) {
        if (!buffer.getUri()) {
            throw new Error('No URI for buffer');
        }
        crange = Util.tabShiftForRange(buffer, crange);
        const rootDir = await this.getRootDir(buffer);
        const lines = await this.queueCmd('typeinfo', rootDir, (caps) => ({
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
    }
    async doCaseSplit(buffer, crange) {
        if (!buffer.getUri()) {
            throw new Error('No URI for buffer');
        }
        crange = Util.tabShiftForRange(buffer, crange);
        const rootDir = await this.getRootDir(buffer);
        const lines = await this.queueCmd('typeinfo', rootDir, (caps) => ({
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
    }
    async doSigFill(buffer, crange) {
        if (!buffer.getUri()) {
            throw new Error('No URI for buffer');
        }
        crange = Util.tabShiftForRange(buffer, crange);
        const rootDir = await this.getRootDir(buffer);
        const lines = await this.queueCmd('typeinfo', rootDir, (caps) => ({
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
    }
    async getInfoInBuffer(editor, crange) {
        const buffer = editor.getBuffer();
        if (!buffer.getUri()) {
            throw new Error('No URI for buffer');
        }
        const symInfo = Util.getSymbolInRange(editor, crange);
        if (!symInfo) {
            throw new Error('Couldn\'t get symbol for info');
        }
        const { symbol, range } = symInfo;
        const lines = await this.queueCmd('typeinfo', await this.getRootDir(buffer), () => ({
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
    }
    async findSymbolProvidersInBuffer(editor, crange) {
        const buffer = editor.getBuffer();
        const symInfo = Util.getSymbolInRange(editor, crange);
        if (!symInfo) {
            throw new Error('Couldn\'t get symbol for import');
        }
        const { symbol } = symInfo;
        return this.queueCmd('find', await this.getRootDir(buffer), () => ({
            interactive: true,
            command: 'find',
            args: [symbol],
        }));
    }
    async doCheckBuffer(buffer, fast) {
        return this.doCheckOrLintBuffer('check', buffer, fast);
    }
    async doLintBuffer(buffer) {
        return this.doCheckOrLintBuffer('lint', buffer, false);
    }
    async doCheckAndLint(buffer, fast) {
        const [cr, lr] = await Promise.all([this.doCheckBuffer(buffer, fast), this.doLintBuffer(buffer)]);
        return cr.concat(lr);
    }
    async getUPI() {
        return Promise.race([this.upiPromise, Promise.resolve(undefined)]);
    }
    async initBackend(rootDir) {
        const rootPath = rootDir.getPath();
        const cached = this.backend.get(rootPath);
        if (cached) {
            return cached;
        }
        const newBackend = ghc_modi_process_real_factory_1.createGhcModiProcessReal(rootDir, await this.getUPI());
        this.backend.set(rootPath, newBackend);
        const backend = await newBackend;
        this.disposables.add(backend.onError((arg) => this.emitter.emit('error', arg)), backend.onWarning((arg) => this.emitter.emit('warning', arg)));
        return backend;
    }
    async queueCmd(queueName, dir, runArgsFunc) {
        if (atom.config.get('haskell-ghc-mod.lowMemorySystem')) {
            queueName = 'lowmem';
        }
        const backend = await this.initBackend(dir);
        const promise = this.commandQueues[queueName].add(async () => {
            this.emitter.emit('backend-active');
            try {
                const settings = await settings_1.getSettings(dir);
                if (settings.disable) {
                    throw new Error('Ghc-mod disabled in settings');
                }
                const runArgs = runArgsFunc(backend.getCaps());
                if (runArgs === undefined)
                    return [];
                const upi = await this.getUPI();
                let builder;
                if (upi) {
                    const b = await upi.getOthersConfigParam('ide-haskell-cabal', 'builder');
                    if (b)
                        builder = b.name;
                }
                return backend.run(Object.assign({}, runArgs, { builder, suppressErrors: settings.suppressErrors, ghcOptions: settings.ghcOptions, ghcModOptions: settings.ghcModOptions }));
            }
            catch (err) {
                Util.warn(err);
                throw err;
            }
        });
        promise.then(() => {
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
        }).catch((e) => {
            atom.notifications.addError('Error in GHCMod command queue', {
                detail: e.toString(),
                stack: e.stack,
                dismissable: true,
            });
        });
        return promise;
    }
    async doCheckOrLintBuffer(cmd, buffer, fast) {
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
                text = await atom_haskell_utils_1.unlit(olduri, buffer.getText());
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
        const rootDir = await this.getRootDir(buffer);
        const textB = text;
        const dashArgsB = dashArgs;
        const lines = await this.queueCmd('checklint', rootDir, () => ({
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
                        caps: (await this.initBackend(rootDir)).getCaps(),
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
    }
}
exports.GhcModiProcess = GhcModiProcess;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaW5kZXguanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi9zcmMvZ2hjLW1vZC9pbmRleC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOztBQUFBLCtCQUMrQztBQUMvQyxnQ0FBK0I7QUFDL0IsK0JBQThCO0FBQzlCLHVDQUF1QztBQUN2QywyREFBMEM7QUFLMUMsbUZBQTBFO0FBQzFFLHlDQUF3QztBQWF4QztJQWVFLFlBQW9CLFVBQXFDO1FBQXJDLGVBQVUsR0FBVixVQUFVLENBQTJCO1FBQ3ZELElBQUksQ0FBQyxXQUFXLEdBQUcsSUFBSSwwQkFBbUIsRUFBRSxDQUFBO1FBQzVDLElBQUksQ0FBQyxPQUFPLEdBQUcsSUFBSSxjQUFPLEVBQUUsQ0FBQTtRQUM1QixJQUFJLENBQUMsV0FBVyxDQUFDLEdBQUcsQ0FBQyxJQUFJLENBQUMsT0FBTyxDQUFDLENBQUE7UUFDbEMsSUFBSSxDQUFDLFlBQVksR0FBRyxJQUFJLE9BQU8sRUFBRSxDQUFBO1FBQ2pDLElBQUksQ0FBQyxPQUFPLEdBQUcsSUFBSSxHQUFHLEVBQUUsQ0FBQTtRQUV4QixFQUFFLENBQUMsQ0FBQyxPQUFPLENBQUMsR0FBRyxDQUFDLGdCQUFnQixJQUFJLENBQUMsSUFBSSxDQUFDLE1BQU0sQ0FBQyxHQUFHLENBQUMsK0NBQStDLENBQUMsQ0FBQyxDQUFDLENBQUM7WUFDdEcsSUFBSSxDQUFDLGtCQUFrQixFQUFFLENBQUE7UUFDM0IsQ0FBQztRQUVELElBQUksQ0FBQyxhQUFhLEdBQUc7WUFDbkIsU0FBUyxFQUFFLElBQUksS0FBSyxDQUFDLENBQUMsQ0FBQztZQUN2QixNQUFNLEVBQUUsSUFBSSxLQUFLLENBQUMsSUFBSSxDQUFDLE1BQU0sQ0FBQyxHQUFHLENBQUMsb0NBQW9DLENBQUMsQ0FBQztZQUN4RSxRQUFRLEVBQUUsSUFBSSxLQUFLLENBQUMsQ0FBQyxDQUFDO1lBQ3RCLElBQUksRUFBRSxJQUFJLEtBQUssQ0FBQyxDQUFDLENBQUM7WUFDbEIsSUFBSSxFQUFF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Q0FBQztZQUNILENBQUM7WUFFRCxNQUFNLElBQUksR0FBRyxHQUFHLENBQUMsUUFBUSxDQUFDLEtBQUssQ0FBQyxDQUFDLENBQUMsQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDLEtBQUssQ0FBQTtZQUNqRCxNQUFNLFFBQVEsR0FDWixHQUFHLEtBQUssTUFBTSxDQUFDLENBQUM7Z0JBQ2QsTUFBTTtnQkFDTixDQUFDLENBQUMsT0FBTyxLQUFLLFNBQVMsQ0FBQyxDQUFDO29CQUN2QixTQUFTO29CQUNULENBQUM7d0JBQ0QsT0FBTyxDQUFBO1lBQ2IsTUFBTSxPQUFPLEdBQUcsSUFBSSxZQUFLLENBQUMsUUFBUSxDQUFDLEdBQUcsRUFBRSxFQUFFLENBQUMsR0FBRyxDQUFDLEVBQUUsUUFBUSxDQUFDLEdBQUcsRUFBRSxFQUFFLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQTtZQUN2RSxNQUFNLFFBQVEsR0FBRyxJQUFJLENBQUMsa0JBQWtCLENBQUMsTUFBTSxFQUFFLE9BQU8sQ0FBQyxDQUFBO1lBQ3pELElBQUksS0FBSyxDQUFBO1lBQ1QsSUFBSSxDQUFDO2dCQUNILEtBQUssR0FBRyxPQUFPLENBQUMsT0FBTyxDQUFDLE9BQU8sQ0FBQyxVQUFVLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxPQUFPLEVBQUUsQ0FBQTtZQUM3RCxDQUFDO1lBQUMsS0FBSyxDQUFDLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQztnQkFDZixLQUFLLEdBQUcsSUFBSSxDQUFBO1lBQ2QsQ0FBQztZQUNELEdBQUcsQ0FBQyxJQUFJLENBQUM7Z0JBQ1AsR0FBRyxFQUFFLEtBQUs7Z0JBQ1YsUUFBUTtnQkFDUixPQUFPO2dCQUNQLFFBQVE7YUFDVCxDQUFDLENBQUE7UUFDSixDQUFDO1FBQ0QsTUFBTSxDQUFDLEdBQUcsQ0FBQTtJQUNaLENBQUM7Q0FDRjtBQTlkRCx3Q0E4ZEMiLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgeyBSYW5nZSwgUG9pbnQsIEVtaXR0ZXIsIENvbXBvc2l0ZURpc3Bvc2FibGUsXG5UZXh0QnVmZmVyLCBEaXJlY3RvcnksIFRleHRFZGl0b3IgfSBmcm9tICdhdG9tJ1xuaW1wb3J0ICogYXMgVXRpbCBmcm9tICcuLi91dGlsJ1xuaW1wb3J0IHsgZXh0bmFtZSB9IGZyb20gJ3BhdGgnXG5pbXBvcnQgUXVldWUgPSByZXF1aXJlKCdwcm9taXNlLXF1ZXVlJylcbmltcG9ydCB7IHVubGl0IH0gZnJvbSAnYXRvbS1oYXNrZWxsLXV0aWxzJ1xuaW1wb3J0ICogYXMgQ29tcGxldGlvbkJhY2tlbmQgZnJvbSAnYXRvbS1oYXNrZWxsLXVwaS9jb21wbGV0aW9uLWJhY2tlbmQnXG5pbXBvcnQgKiBhcyBVUEkgZnJvbSAnYXRvbS1oYXNrZWxsLXVwaSdcblxuaW1wb3J0IHsgR2hjTW9kaVByb2Nlc3NSZWFsLCBHSENNb2RDYXBzLCBSdW5BcmdzLCBJRXJyb3JDYWxsYmFja0FyZ3MgfSBmcm9tICcuL2doYy1tb2RpLXByb2Nlc3MtcmVhbCdcbmltcG9ydCB7IGNyZWF0ZUdoY01vZGlQcm9jZXNzUmVhbCB9IGZyb20gJy4vZ2hjLW1vZGktcHJvY2Vzcy1yZWFsLWZhY3RvcnknXG5pbXBvcnQgeyBnZXRTZXR0aW5ncyB9IGZyb20gJy4vc2V0dGluZ3MnXG5cbmV4cG9ydCB7IElFcnJvckNhbGxiYWNrQXJncywgUnVuQXJncywgR0hDTW9kQ2FwcyB9XG5cbnR5cGUgQ29tbWFuZHMgPSAnY2hlY2tsaW50JyB8ICdicm93c2UnIHwgJ3R5cGVpbmZvJyB8ICdmaW5kJyB8ICdpbml0JyB8ICdsaXN0JyB8ICdsb3dtZW0nXG5cbmV4cG9ydCBpbnRlcmZhY2UgU3ltYm9sRGVzYyB7XG4gIG5hbWU6IHN0cmluZyxcbiAgc3ltYm9sVHlwZTogQ29tcGxldGlvbkJhY2tlbmQuU3ltYm9sVHlwZSxcbiAgdHlwZVNpZ25hdHVyZT86IHN0cmluZyxcbiAgcGFyZW50Pzogc3RyaW5nXG59XG5cbmV4cG9ydCBjbGFzcyBHaGNNb2RpUHJvY2VzcyB7XG4gIHByaXZhdGUgYmFja2VuZDogTWFwPHN0cmluZywgUHJvbWlzZTxHaGNNb2RpUHJvY2Vzc1JlYWw+PlxuICBwcml2YXRlIGRpc3Bvc2FibGVzOiBDb21wb3NpdGVEaXNwb3NhYmxlXG4gIHByaXZhdGUgZW1pdHRlcjogRW1pdHRlcjx7XG4gICAgJ2RpZC1kZXN0cm95JzogdW5kZWZpbmVkXG4gICAgJ2JhY2tlbmQtYWN0aXZlJzogdW5kZWZpbmVkXG4gICAgJ2JhY2tlbmQtaWRsZSc6IHVuZGVmaW5lZFxuICB9LCB7XG4gICAgJ3dhcm5pbmcnOiBzdHJpbmdcbiAgICAnZXJyb3InOiBJRXJyb3JDYWxsYmFja0FyZ3NcbiAgICAncXVldWUtaWRsZSc6IHsgcXVldWU6IENvbW1hbmRzIH1cbiAgfT5cbiAgcHJpdmF0ZSBidWZmZXJEaXJNYXA6IFdlYWtNYXA8VGV4dEJ1ZmZlciwgRGlyZWN0b3J5PlxuICBwcml2YXRlIGNvbW1hbmRRdWV1ZXM6IHtbSyBpbiBDb21tYW5kc106IFF1ZXVlfVxuXG4gIGNvbnN0cnVjdG9yKHByaXZhdGUgdXBpUHJvbWlzZTogUHJvbWlzZTxVUEkuSVVQSUluc3RhbmNlPikge1xuICAgIHRoaXMuZGlzcG9zYWJsZXMgPSBuZXcgQ29tcG9zaXRlRGlzcG9zYWJsZSgpXG4gICAgdGhpcy5lbWl0dGVyID0gbmV3IEVtaXR0ZXIoKVxuICAgIHRoaXMuZGlzcG9zYWJsZXMuYWRkKHRoaXMuZW1pdHRlcilcbiAgICB0aGlzLmJ1ZmZlckRpck1hcCA9IG5ldyBXZWFrTWFwKClcbiAgICB0aGlzLmJhY2tlbmQgPSBuZXcgTWFwKClcblxuICAgIGlmIChwcm9jZXNzLmVudi5HSENfUEFDS0FHRV9QQVRIICYmICFhdG9tLmNvbmZpZy5nZXQoJ2hhc2tlbGwtZ2hjLW1vZC5zdXBwcmVzc0doY1BhY2thZ2VQYXRoV2FybmluZycpKSB7XG4gICAgICBVdGlsLndhcm5HSENQYWNrYWdlUGF0aCgpXG4gICAgfVxuXG4gICAgdGhpcy5jb21tYW5kUXVldWVzID0ge1xuICAgICAgY2hlY2tsaW50OiBuZXcgUXVldWUoMiksXG4gICAgICBicm93c2U6IG5ldyBRdWV1ZShhdG9tLmNvbmZpZy5nZXQoJ2hhc2tlbGwtZ2hjLW1vZC5tYXhCcm93c2VQcm9jZXNzZXMnKSksXG4gICAgICB0eXBlaW5mbzogbmV3IFF1ZXVlKDEpLFxuICAgICAgZmluZDogbmV3IFF1ZXVlKDEpLFxuICAgICAgaW5pdDogbmV3IFF1ZXVlKDQpLFxuICAgICAgbGlzdDogbmV3IFF1ZXVlKDEpLFxuICAgICAgbG93bWVtOiBuZXcgUXVldWUoMSksXG4gICAgfVxuICAgIHRoaXMuZGlzcG9zYWJsZXMuYWRkKGF0b20uY29uZmlnLm9uRGlkQ2hhbmdlKCdoYXNrZWxsLWdoYy1tb2QubWF4QnJvd3NlUHJvY2Vzc2VzJywgKHsgbmV3VmFsdWUgfSkgPT5cbiAgICAgIHRoaXMuY29tbWFuZFF1ZXVlcy5icm93c2UgPSBuZXcgUXVldWUobmV3VmFsdWUgYXMgbnVtYmVyKSksXG4gICAgKVxuICB9XG5cbiAgcHVibGljIGFzeW5jIGdldFJvb3REaXIoYnVmZmVyOiBUZXh0QnVmZmVyKTogUHJvbWlzZTxEaXJlY3Rvcnk+IHtcbiAgICBsZXQgZGlyXG4gICAgZGlyID0gdGhpcy5idWZmZXJEaXJNYXAuZ2V0KGJ1ZmZlcilcbiAgICBpZiAoZGlyKSB7XG4gICAgICByZXR1cm4gZGlyXG4gICAgfVxuICAgIGRpciA9IGF3YWl0IFV0aWwuZ2V0Um9vdERpcihidWZmZXIpXG4gICAgdGhpcy5idWZmZXJEaXJNYXAuc2V0KGJ1ZmZlciwgZGlyKVxuICAgIHJldHVybiBkaXJcbiAgfVxuXG4gIHB1YmxpYyBraWxsUHJvY2VzcygpIHtcbiAgICBmb3IgKGNvbnN0IGJwIG9mIHRoaXMuYmFja2VuZC52YWx1ZXMoKSkge1xuICAgICAgYnAudGhlbigoYikgPT4gYi5raWxsUHJvY2VzcygpKVxuICAgICAgLmNhdGNoKChlOiBFcnJvcikgPT4ge1xuICAgICAgICBhdG9tLm5vdGlmaWNhdGlvbnMuYWRkRXJyb3IoJ0Vycm9yIGtpbGxpbmcgZ2hjLW1vZCBwcm9jZXNzJywge1xuICAgICAgICAgIGRldGFpbDogZS50b1N0cmluZygpLFxuICAgICAgICAgIHN0YWNrOiBlLnN0YWNrLFxuICAgICAgICAgIGRpc21pc3NhYmxlOiB0cnVlLFxuICAgICAgICB9KVxuICAgICAgfSlcbiAgICB9XG4gICAgdGhpcy5iYWNrZW5kLmNsZWFyKClcbiAgfVxuXG4gIHB1YmxpYyBkZXN0cm95KCkge1xuICAgIGZvciAoY29uc3QgYnAgb2YgdGhpcy5iYWNrZW5kLnZhbHVlcygpKSB7XG4gICAgICBicC50aGVuKChiKSA9PiBiLmRlc3Ryb3koKSlcbiAgICAgIC5jYXRjaCgoZTogRXJyb3IpID0+IHtcbiAgICAgICAgYXRvbS5ub3RpZmljYXRpb25zLmFkZEVycm9yKCdFcnJvciBraWxsaW5nIGdoYy1tb2QgcHJvY2VzcycsIHtcbiAgICAgICAgICBkZXRhaWw6IGUudG9TdHJpbmcoKSxcbiAgICAgICAgICBzdGFjazogZS5zdGFjayxcbiAgICAgICAgICBkaXNtaXNzYWJsZTogdHJ1ZSxcbiAgICAgICAgfSlcbiAgICAgIH0pXG4gICAgfVxuICAgIHRoaXMuYmFja2VuZC5jbGVhcigpXG4gICAgdGhpcy5lbWl0dGVyLmVtaXQoJ2RpZC1kZXN0cm95JylcbiAgICB0aGlzLmRpc3Bvc2FibGVzLmRpc3Bvc2UoKVxuICB9XG5cbiAgcHVibGljIG9uRGlkRGVzdHJveShjYWxsYmFjazogKCkgPT4gdm9pZCkge1xuICAgIHJldHVybiB0aGlzLmVtaXR0ZXIub24oJ2RpZC1kZXN0cm95JywgY2FsbGJhY2spXG4gIH1cblxuICBwdWJsaWMgb25XYXJuaW5nKGNhbGxiYWNrOiAod2FybmluZzogc3RyaW5nKSA9PiB2b2lkKSB7XG4gICAgcmV0dXJuIHRoaXMuZW1pdHRlci5vbignd2FybmluZycsIGNhbGxiYWNrKVxuICB9XG5cbiAgcHVibGljIG9uRXJyb3IoY2FsbGJhY2s6IChlcnJvcjogSUVycm9yQ2FsbGJhY2tBcmdzKSA9PiB2b2lkKSB7XG4gICAgcmV0dXJuIHRoaXMuZW1pdHRlci5vbignZXJyb3InLCBjYWxsYmFjaylcbiAgfVxuXG4gIHB1YmxpYyBvbkJhY2tlbmRBY3RpdmUoY2FsbGJhY2s6ICgpID0+IHZvaWQpIHtcbiAgICByZXR1cm4gdGhpcy5lbWl0dGVyLm9uKCdiYWNrZW5kLWFjdGl2ZScsIGNhbGxiYWNrKVxuICB9XG5cbiAgcHVibGljIG9uQmFja2VuZElkbGUoY2FsbGJhY2s6ICgpID0+IHZvaWQpIHtcbiAgICByZXR1cm4gdGhpcy5lbWl0dGVyLm9uKCdiYWNrZW5kLWlkbGUnLCBjYWxsYmFjaylcbiAgfVxuXG4gIHB1YmxpYyBvblF1ZXVlSWRsZShjYWxsYmFjazogKCkgPT4gdm9pZCkge1xuICAgIHJldHVybiB0aGlzLmVtaXR0ZXIub24oJ3F1ZXVlLWlkbGUnLCBjYWxsYmFjaylcbiAgfVxuXG4gIHB1YmxpYyBhc3luYyBydW5MaXN0KGJ1ZmZlcjogVGV4dEJ1ZmZlcikge1xuICAgIHJldHVybiB0aGlzLnF1ZXVlQ21kKCdsaXN0JywgYXdhaXQgdGhpcy5nZXRSb290RGlyKGJ1ZmZlciksICgpID0+ICh7IGNvbW1hbmQ6ICdsaXN0JyB9KSlcbiAgfVxuXG4gIHB1YmxpYyBhc3luYyBydW5MYW5nKGRpcjogRGlyZWN0b3J5KSB7XG4gICAgcmV0dXJuIHRoaXMucXVldWVDbWQoJ2luaXQnLCBkaXIsICgpID0+ICh7IGNvbW1hbmQ6ICdsYW5nJyB9KSlcbiAgfVxuXG4gIHB1YmxpYyBhc3luYyBydW5GbGFnKGRpcjogRGlyZWN0b3J5KSB7XG4gICAgcmV0dXJuIHRoaXMucXVldWVDbWQoJ2luaXQnLCBkaXIsICgpID0+ICh7IGNvbW1hbmQ6ICdmbGFnJyB9KSlcbiAgfVxuXG4gIHB1YmxpYyBhc3luYyBydW5Ccm93c2Uocm9vdERpcjogRGlyZWN0b3J5LCBtb2R1bGVzOiBzdHJpbmdbXSk6IFByb21pc2U8U3ltYm9sRGVzY1tdPiB7XG4gICAgY29uc3QgbGluZXMgPSBhd2FpdCB0aGlzLnF1ZXVlQ21kKCdicm93c2UnLCByb290RGlyLCAoY2FwcykgPT4ge1xuICAgICAgY29uc3QgYXJncyA9IGNhcHMuYnJvd3NlTWFpbiA/IG1vZHVsZXMgOiBtb2R1bGVzLmZpbHRlcigodikgPT4gdiAhPT0gJ01haW4nKVxuICAgICAgaWYgKGFyZ3MubGVuZ3RoID09PSAwKSByZXR1cm4gdW5kZWZpbmVkXG4gICAgICByZXR1cm4ge1xuICAgICAgICBjb21tYW5kOiAnYnJvd3NlJyxcbiAgICAgICAgZGFzaEFyZ3M6IGNhcHMuYnJvd3NlUGFyZW50cyA/IFsnLWQnLCAnLW8nLCAnLXAnXSA6IFsnLWQnLCAnLW8nXSxcbiAgICAgICAgYXJncyxcbiAgICAgIH1cbiAgICB9KVxuICAgIHJldHVybiBsaW5lcy5tYXAoKHMpID0+IHtcbiAgICAgIC8vIGVudW1Gcm9tIDo6IEVudW0gYSA9PiBhIC0+IFthXSAtLSBmcm9tOkVudW1cbiAgICAgIGNvbnN0IHBhdHRlcm4gPSAvXiguKj8pIDo6ICguKj8pKD86IC0tIGZyb206KC4qKSk/JC9cbiAgICAgIGNvbnN0IG1hdGNoID0gcy5tYXRjaChwYXR0ZXJuKVxuICAgICAgbGV0IG5hbWU6IHN0cmluZ1xuICAgICAgbGV0IHR5cGVTaWduYXR1cmU6IHN0cmluZyB8IHVuZGVmaW5lZFxuICAgICAgbGV0IHBhcmVudDogc3RyaW5nIHwgdW5kZWZpbmVkXG4gICAgICBpZiAobWF0Y2gpIHtcbiAgICAgICAgbmFtZSA9IG1hdGNoWzFdXG4gICAgICAgIHR5cGVTaWduYXR1cmUgPSBtYXRjaFsyXVxuICAgICAgICBwYXJlbnQgPSBtYXRjaFszXVxuICAgICAgfSBlbHNlIHtcbiAgICAgICAgbmFtZSA9IHNcbiAgICAgIH1cbiAgICAgIGxldCBzeW1ib2xUeXBlOiBDb21wbGV0aW9uQmFja2VuZC5TeW1ib2xUeXBlXG4gICAgICBpZiAodHlwZVNpZ25hdHVyZSAmJiAvXig/OnR5cGV8ZGF0YXxuZXd0eXBlKS8udGVzdCh0eXBlU2lnbmF0dXJlKSkge1xuICAgICAgICBzeW1ib2xUeXBlID0gJ3R5cGUnXG4gICAgICB9IGVsc2UgaWYgKHR5cGVTaWduYXR1cmUgJiYgL14oPzpjbGFzcykvLnRlc3QodHlwZVNpZ25hdHVyZSkpIHtcbiAgICAgICAgc3ltYm9sVHlwZSA9ICdjbGFzcydcbiAgICAgIH0gZWxzZSBpZiAoL15cXCguKlxcKSQvLnRlc3QobmFtZSkpIHtcbiAgICAgICAgc3ltYm9sVHlwZSA9ICdvcGVyYXRvcidcbiAgICAgICAgbmFtZSA9IG5hbWUuc2xpY2UoMSwgLTEpXG4gICAgICB9IGVsc2UgaWYgKFV0aWwuaXNVcHBlckNhc2UobmFtZVswXSkpIHtcbiAgICAgICAgc3ltYm9sVHlwZSA9ICd0YWcnXG4gICAgICB9IGVsc2Uge1xuICAgICAgICBzeW1ib2xUeXBlID0gJ2Z1bmN0aW9uJ1xuICAgICAgfVxuICAgICAgcmV0dXJuIHsgbmFtZSwgdHlwZVNpZ25hdHVyZSwgc3ltYm9sVHlwZSwgcGFyZW50IH1cbiAgICB9KVxuICB9XG5cbiAgcHVibGljIGFzeW5jIGdldFR5cGVJbkJ1ZmZlcihcbiAgICBidWZmZXI6IFRleHRCdWZmZXIsIGNyYW5nZTogUmFuZ2UsXG4gICkge1xuICAgIGlmICghYnVmZmVyLmdldFVyaSgpKSB7IHRocm93IG5ldyBFcnJvcignTm8gVVJJIGZvciBidWZmZXInKSB9XG4gICAgY3JhbmdlID0gVXRpbC50YWJTaGlmdEZvclJhbmdlKGJ1ZmZlciwgY3JhbmdlKVxuICAgIGNvbnN0IHJvb3REaXIgPSBhd2FpdCB0aGlzLmdldFJvb3REaXIoYnVmZmVyKVxuICAgIGNvbnN0IGxpbmVzID0gYXdhaXQgdGhpcy5xdWV1ZUNtZCgndHlwZWluZm8nLCByb290RGlyLCAoY2FwcykgPT4gKHtcbiAgICAgIGludGVyYWN0aXZlOiB0cnVlLFxuICAgICAgY29tbWFuZDogJ3R5cGUnLFxuICAgICAgdXJpOiBidWZmZXIuZ2V0VXJpKCksXG4gICAgICB0ZXh0OiBidWZmZXIuaXNNb2RpZmllZCgpID8gYnVmZmVyLmdldFRleHQoKSA6IHVuZGVmaW5lZCxcbiAgICAgIGRhc2hBcmdzOiBjYXBzLnR5cGVDb25zdHJhaW50cyA/IFsnLWMnXSA6IFtdLFxuICAgICAgYXJnczogW2NyYW5nZS5zdGFydC5yb3cgKyAxLCBjcmFuZ2Uuc3RhcnQuY29sdW1uICsgMV0ubWFwKCh2KSA9PiB2LnRvU3RyaW5nKCkpLFxuICAgIH0pKVxuXG4gICAgY29uc3QgcnggPSAvXihcXGQrKVxccysoXFxkKylcXHMrKFxcZCspXFxzKyhcXGQrKVxccytcIihbXl0qKVwiJC8gLy8gW15dIGJhc2ljYWxseSBtZWFucyBcImFueXRoaW5nXCIsIGluY2wuIG5ld2xpbmVzXG4gICAgZm9yIChjb25zdCBsaW5lIG9mIGxpbmVzKSB7XG4gICAgICBjb25zdCBtYXRjaCA9IGxpbmUubWF0Y2gocngpXG4gICAgICBpZiAoIW1hdGNoKSB7IGNvbnRpbnVlIH1cbiAgICAgIGNvbnN0IFtyb3dzdGFydCwgY29sc3RhcnQsIHJvd2VuZCwgY29sZW5kLCB0eXBlXSA9IG1hdGNoLnNsaWNlKDEpXG4gICAgICBjb25zdCByYW5nZSA9XG4gICAgICAgIFJhbmdlLmZyb21PYmplY3QoW1xuICAgICAgICAgIFtwYXJzZUludChyb3dzdGFydCwgMTApIC0gMSwgcGFyc2VJbnQoY29sc3RhcnQsIDEwKSAtIDFdLFxuICAgICAgICAgIFtwYXJzZUludChyb3dlbmQsIDEwKSAtIDEsIHBhcnNlSW50KGNvbGVuZCwgMTApIC0gMV0sXG4gICAgICAgIF0pXG4gICAgICBpZiAocmFuZ2UuaXNFbXB0eSgpKSB7IGNvbnRpbnVlIH1cbiAgICAgIGlmICghcmFuZ2UuY29udGFpbnNSYW5nZShjcmFuZ2UpKSB7IGNvbnRpbnVlIH1cbiAgICAgIHJldHVybiB7XG4gICAgICAgIHJhbmdlOiBVdGlsLnRhYlVuc2hpZnRGb3JSYW5nZShidWZmZXIsIHJhbmdlKSxcbiAgICAgICAgdHlwZTogdHlwZS5yZXBsYWNlKC9cXFxcXCIvZywgJ1wiJyksXG4gICAgICB9XG4gICAgfVxuICAgIHRocm93IG5ldyBFcnJvcignTm8gdHlwZScpXG4gIH1cblxuICBwdWJsaWMgYXN5bmMgZG9DYXNlU3BsaXQoYnVmZmVyOiBUZXh0QnVmZmVyLCBjcmFuZ2U6IFJhbmdlKSB7XG4gICAgaWYgKCFidWZmZXIuZ2V0VXJpKCkpIHsgdGhyb3cgbmV3IEVycm9yKCdObyBVUkkgZm9yIGJ1ZmZlcicpIH1cbiAgICBjcmFuZ2UgPSBVdGlsLnRhYlNoaWZ0Rm9yUmFuZ2UoYnVmZmVyLCBjcmFuZ2UpXG4gICAgY29uc3Qgcm9vdERpciA9IGF3YWl0IHRoaXMuZ2V0Um9vdERpcihidWZmZXIpXG4gICAgY29uc3QgbGluZXMgPSBhd2FpdCB0aGlzLnF1ZXVlQ21kKCd0eXBlaW5mbycsIHJvb3REaXIsIChjYXBzKSA9PiAoe1xuICAgICAgaW50ZXJhY3RpdmU6IGNhcHMuaW50ZXJhY3RpdmVDYXNlU3BsaXQsXG4gICAgICBjb21tYW5kOiAnc3BsaXQnLFxuICAgICAgdXJpOiBidWZmZXIuZ2V0VXJpKCksXG4gICAgICB0ZXh0OiBidWZmZXIuaXNNb2RpZmllZCgpID8gYnVmZmVyLmdldFRleHQoKSA6IHVuZGVmaW5lZCxcbiAgICAgIGFyZ3M6IFtjcmFuZ2Uuc3RhcnQucm93ICsgMSwgY3JhbmdlLnN0YXJ0LmNvbHVtbiArIDFdLm1hcCgodikgPT4gdi50b1N0cmluZygpKSxcbiAgICB9KSlcblxuICAgIGNvbnN0IHJ4ID0gL14oXFxkKylcXHMrKFxcZCspXFxzKyhcXGQrKVxccysoXFxkKylcXHMrXCIoW15dKilcIiQvIC8vIFteXSBiYXNpY2FsbHkgbWVhbnMgXCJhbnl0aGluZ1wiLCBpbmNsLiBuZXdsaW5lc1xuICAgIGNvbnN0IHJlcyA9IFtdXG4gICAgZm9yIChjb25zdCBsaW5lIG9mIGxpbmVzKSB7XG4gICAgICBjb25zdCBtYXRjaCA9IGxpbmUubWF0Y2gocngpXG4gICAgICBpZiAoIW1hdGNoKSB7XG4gICAgICAgIFV0aWwud2FybihgZ2hjLW1vZCBzYXlzOiAke2xpbmV9YClcbiAgICAgICAgY29udGludWVcbiAgICAgIH1cbiAgICAgIGNvbnN0IFtyb3dzdGFydCwgY29sc3RhcnQsIHJvd2VuZCwgY29sZW5kLCB0ZXh0XSA9IG1hdGNoLnNsaWNlKDEpXG4gICAgICByZXMucHVzaCh7XG4gICAgICAgIHJhbmdlOlxuICAgICAgICBSYW5nZS5mcm9tT2JqZWN0KFtcbiAgICAgICAgICBbcGFyc2VJbnQocm93c3RhcnQsIDEwKSAtIDEsIHBhcnNlSW50KGNvbHN0YXJ0LCAxMCkgLSAxXSxcbiAgICAgICAgICBbcGFyc2VJbnQocm93ZW5kLCAxMCkgLSAxLCBwYXJzZUludChjb2xlbmQsIDEwKSAtIDFdLFxuICAgICAgICBdKSxcbiAgICAgICAgcmVwbGFjZW1lbnQ6IHRleHQsXG4gICAgICB9KVxuICAgIH1cbiAgICByZXR1cm4gcmVzXG4gIH1cblxuICBwdWJsaWMgYXN5bmMgZG9TaWdGaWxsKGJ1ZmZlcjogVGV4dEJ1ZmZlciwgY3JhbmdlOiBSYW5nZSkge1xuICAgIGlmICghYnVmZmVyLmdldFVyaSgpKSB7IHRocm93IG5ldyBFcnJvcignTm8gVVJJIGZvciBidWZmZXInKSB9XG4gICAgY3JhbmdlID0gVXRpbC50YWJTaGlmdEZvclJhbmdlKGJ1ZmZlciwgY3JhbmdlKVxuICAgIGNvbnN0IHJvb3REaXIgPSBhd2FpdCB0aGlzLmdldFJvb3REaXIoYnVmZmVyKVxuICAgIGNvbnN0IGxpbmVzID0gYXdhaXQgdGhpcy5xdWV1ZUNtZCgndHlwZWluZm8nLCByb290RGlyLCAoY2FwcykgPT4gKHtcbiAgICAgIGludGVyYWN0aXZlOiBjYXBzLmludGVyYWN0aXZlQ2FzZVNwbGl0LFxuICAgICAgY29tbWFuZDogJ3NpZycsXG4gICAgICB1cmk6IGJ1ZmZlci5nZXRVcmkoKSxcbiAgICAgIHRleHQ6IGJ1ZmZlci5pc01vZGlmaWVkKCkgPyBidWZmZXIuZ2V0VGV4dCgpIDogdW5kZWZpbmVkLFxuICAgICAgYXJnczogW2NyYW5nZS5zdGFydC5yb3cgKyAxLCBjcmFuZ2Uuc3RhcnQuY29sdW1uICsgMV0ubWFwKCh2KSA9PiB2LnRvU3RyaW5nKCkpLFxuICAgIH0pKVxuICAgIGlmIChsaW5lcy5sZW5ndGggPCAyKSB7IHRocm93IG5ldyBFcnJvcihgQ291bGQgbm90IHVuZGVyc3RhbmQgcmVzcG9uc2U6ICR7bGluZXMuam9pbignXFxuJyl9YCkgfVxuICAgIGNvbnN0IHJ4ID0gL14oXFxkKylcXHMrKFxcZCspXFxzKyhcXGQrKVxccysoXFxkKykkLyAvLyBwb3NpdGlvbiByeFxuICAgIGNvbnN0IG1hdGNoID0gbGluZXNbMV0ubWF0Y2gocngpXG4gICAgaWYgKCFtYXRjaCkgeyB0aHJvdyBuZXcgRXJyb3IoYENvdWxkIG5vdCB1bmRlcnN0YW5kIHJlc3BvbnNlOiAke2xpbmVzLmpvaW4oJ1xcbicpfWApIH1cbiAgICBjb25zdCBbcm93c3RhcnQsIGNvbHN0YXJ0LCByb3dlbmQsIGNvbGVuZF0gPSBtYXRjaC5zbGljZSgxKVxuICAgIGNvbnN0IHJhbmdlID1cbiAgICAgIFJhbmdlLmZyb21PYmplY3QoW1xuICAgICAgICBbcGFyc2VJbnQocm93c3RhcnQsIDEwKSAtIDEsIHBhcnNlSW50KGNvbHN0YXJ0LCAxMCkgLSAxXSxcbiAgICAgICAgW3BhcnNlSW50KHJvd2VuZCwgMTApIC0gMSwgcGFyc2VJbnQoY29sZW5kLCAxMCkgLSAxXSxcbiAgICAgIF0pXG4gICAgcmV0dXJuIHtcbiAgICAgIHR5cGU6IGxpbmVzWzBdLFxuICAgICAgcmFuZ2UsXG4gICAgICBib2R5OiBsaW5lcy5zbGljZSgyKS5qb2luKCdcXG4nKSxcbiAgICB9XG4gIH1cblxuICBwdWJsaWMgYXN5bmMgZ2V0SW5mb0luQnVmZmVyKGVkaXRvcjogVGV4dEVkaXRvciwgY3JhbmdlOiBSYW5nZSkge1xuICAgIGNvbnN0IGJ1ZmZlciA9IGVkaXRvci5nZXRCdWZmZXIoKVxuICAgIGlmICghYnVmZmVyLmdldFVyaSgpKSB7IHRocm93IG5ldyBFcnJvcignTm8gVVJJIGZvciBidWZmZXInKSB9XG4gICAgY29uc3Qgc3ltSW5mbyA9IFV0aWwuZ2V0U3ltYm9sSW5SYW5nZShlZGl0b3IsIGNyYW5nZSlcbiAgICBpZiAoIXN5bUluZm8pIHsgdGhyb3cgbmV3IEVycm9yKCdDb3VsZG5cXCd0IGdldCBzeW1ib2wgZm9yIGluZm8nKSB9XG4gICAgY29uc3QgeyBzeW1ib2wsIHJhbmdlIH0gPSBzeW1JbmZvXG5cbiAgICBjb25zdCBsaW5lcyA9IGF3YWl0IHRoaXMucXVldWVDbWQoJ3R5cGVpbmZvJywgYXdhaXQgdGhpcy5nZXRSb290RGlyKGJ1ZmZlciksICgpID0+ICh7XG4gICAgICBpbnRlcmFjdGl2ZTogdHJ1ZSxcbiAgICAgIGNvbW1hbmQ6ICdpbmZvJyxcbiAgICAgIHVyaTogYnVmZmVyLmdldFVyaSgpLFxuICAgICAgdGV4dDogYnVmZmVyLmlzTW9kaWZpZWQoKSA/IGJ1ZmZlci5nZXRUZXh0KCkgOiB1bmRlZmluZWQsXG4gICAgICBhcmdzOiBbc3ltYm9sXSxcbiAgICB9KSlcblxuICAgIGNvbnN0IGluZm8gPSBsaW5lcy5qb2luKCdcXG4nKVxuICAgIGlmICgoaW5mbyA9PT0gJ0Nhbm5vdCBzaG93IGluZm8nKSB8fCAhaW5mbykge1xuICAgICAgdGhyb3cgbmV3IEVycm9yKCdObyBpbmZvJylcbiAgICB9IGVsc2Uge1xuICAgICAgcmV0dXJuIHsgcmFuZ2UsIGluZm8gfVxuICAgIH1cbiAgfVxuXG4gIHB1YmxpYyBhc3luYyBmaW5kU3ltYm9sUHJvdmlkZXJzSW5CdWZmZXIoZWRpdG9yOiBUZXh0RWRpdG9yLCBjcmFuZ2U6IFJhbmdlKSB7XG4gICAgY29uc3QgYnVmZmVyID0gZWRpdG9yLmdldEJ1ZmZlcigpXG4gICAgY29uc3Qgc3ltSW5mbyA9IFV0aWwuZ2V0U3ltYm9sSW5SYW5nZShlZGl0b3IsIGNyYW5nZSlcbiAgICBpZiAoIXN5bUluZm8pIHsgdGhyb3cgbmV3IEVycm9yKCdDb3VsZG5cXCd0IGdldCBzeW1ib2wgZm9yIGltcG9ydCcpIH1cbiAgICBjb25zdCB7IHN5bWJvbCB9ID0gc3ltSW5mb1xuXG4gICAgcmV0dXJuIHRoaXMucXVldWVDbWQoJ2ZpbmQnLCBhd2FpdCB0aGlzLmdldFJvb3REaXIoYnVmZmVyKSwgKCkgPT4gKHtcbiAgICAgIGludGVyYWN0aXZlOiB0cnVlLFxuICAgICAgY29tbWFuZDogJ2ZpbmQnLFxuICAgICAgYXJnczogW3N5bWJvbF0sXG4gICAgfSkpXG4gIH1cblxuICBwdWJsaWMgYXN5bmMgZG9DaGVja0J1ZmZlcihidWZmZXI6IFRleHRCdWZmZXIsIGZhc3Q6IGJvb2xlYW4pIHtcbiAgICByZXR1cm4gdGhpcy5kb0NoZWNrT3JMaW50QnVmZmVyKCdjaGVjaycsIGJ1ZmZlciwgZmFzdClcbiAgfVxuXG4gIHB1YmxpYyBhc3luYyBkb0xpbnRCdWZmZXIoYnVmZmVyOiBUZXh0QnVmZmVyKSB7XG4gICAgcmV0dXJuIHRoaXMuZG9DaGVja09yTGludEJ1ZmZlcignbGludCcsIGJ1ZmZlciwgZmFsc2UpXG4gIH1cblxuICBwdWJsaWMgYXN5bmMgZG9DaGVja0FuZExpbnQoYnVmZmVyOiBUZXh0QnVmZmVyLCBmYXN0OiBib29sZWFuKSB7XG4gICAgY29uc3QgW2NyLCBscl0gPSBhd2FpdCBQcm9taXNlLmFsbChbdGhpcy5kb0NoZWNrQnVmZmVyKGJ1ZmZlciwgZmFzdCksIHRoaXMuZG9MaW50QnVmZmVyKGJ1ZmZlcildKVxuICAgIHJldHVybiBjci5jb25jYXQobHIpXG4gIH1cblxuICBwcml2YXRlIGFzeW5jIGdldFVQSSgpIHtcbiAgICByZXR1cm4gUHJvbWlzZS5yYWNlKFt0aGlzLnVwaVByb21pc2UsIFByb21pc2UucmVzb2x2ZSh1bmRlZmluZWQpXSlcbiAgfVxuXG4gIHByaXZhdGUgYXN5bmMgaW5pdEJhY2tlbmQocm9vdERpcjogRGlyZWN0b3J5KTogUHJvbWlzZTxHaGNNb2RpUHJvY2Vzc1JlYWw+IHtcbiAgICBjb25zdCByb290UGF0aCA9IHJvb3REaXIuZ2V0UGF0aCgpXG4gICAgY29uc3QgY2FjaGVkID0gdGhpcy5iYWNrZW5kLmdldChyb290UGF0aClcbiAgICBpZiAoY2FjaGVkKSB7IHJldHVybiBjYWNoZWQgfVxuICAgIGNvbnN0IG5ld0JhY2tlbmQgPSBjcmVhdGVHaGNNb2RpUHJvY2Vzc1JlYWwocm9vdERpciwgYXdhaXQgdGhpcy5nZXRVUEkoKSlcbiAgICB0aGlzLmJhY2tlbmQuc2V0KHJvb3RQYXRoLCBuZXdCYWNrZW5kKVxuICAgIGNvbnN0IGJhY2tlbmQgPSBhd2FpdCBuZXdCYWNrZW5kXG4gICAgdGhpcy5kaXNwb3NhYmxlcy5hZGQoXG4gICAgICBiYWNrZW5kLm9uRXJyb3IoKGFyZykgPT4gdGhpcy5lbWl0dGVyLmVtaXQoJ2Vycm9yJywgYXJnKSksXG4gICAgICBiYWNrZW5kLm9uV2FybmluZygoYXJnKSA9PiB0aGlzLmVtaXR0ZXIuZW1pdCgnd2FybmluZycsIGFyZykpLFxuICAgIClcbiAgICByZXR1cm4gYmFja2VuZFxuICB9XG5cbiAgcHJpdmF0ZSBhc3luYyBxdWV1ZUNtZChcbiAgICBxdWV1ZU5hbWU6IENvbW1hbmRzLFxuICAgIGRpcjogRGlyZWN0b3J5LFxuICAgIHJ1bkFyZ3NGdW5jOiAoY2FwczogR0hDTW9kQ2FwcykgPT4ge1xuICAgICAgY29tbWFuZDogc3RyaW5nLCB0ZXh0Pzogc3RyaW5nLCB1cmk/OiBzdHJpbmcsIGludGVyYWN0aXZlPzogYm9vbGVhbixcbiAgICAgIGRhc2hBcmdzPzogc3RyaW5nW10sIGFyZ3M/OiBzdHJpbmdbXVxuICAgIH0gfCB1bmRlZmluZWQsXG4gICk6IFByb21pc2U8c3RyaW5nW10+IHtcbiAgICBpZiAoYXRvbS5jb25maWcuZ2V0KCdoYXNrZWxsLWdoYy1tb2QubG93TWVtb3J5U3lzdGVtJykpIHtcbiAgICAgIHF1ZXVlTmFtZSA9ICdsb3dtZW0nXG4gICAgfVxuICAgIGNvbnN0IGJhY2tlbmQgPSBhd2FpdCB0aGlzLmluaXRCYWNrZW5kKGRpcilcbiAgICBjb25zdCBwcm9taXNlID0gdGhpcy5jb21tYW5kUXVldWVzW3F1ZXVlTmFtZV0uYWRkKGFzeW5jICgpID0+IHtcbiAgICAgIHRoaXMuZW1pdHRlci5lbWl0KCdiYWNrZW5kLWFjdGl2ZScpXG4gICAgICB0cnkge1xuICAgICAgICBjb25zdCBzZXR0aW5ncyA9IGF3YWl0IGdldFNldHRpbmdzKGRpcilcbiAgICAgICAgaWYgKHNldHRpbmdzLmRpc2FibGUpIHsgdGhyb3cgbmV3IEVycm9yKCdHaGMtbW9kIGRpc2FibGVkIGluIHNldHRpbmdzJykgfVxuICAgICAgICBjb25zdCBydW5BcmdzID0gcnVuQXJnc0Z1bmMoYmFja2VuZC5nZXRDYXBzKCkpXG4gICAgICAgIGlmIChydW5BcmdzID09PSB1bmRlZmluZWQpIHJldHVybiBbXVxuICAgICAgICBjb25zdCB1cGkgPSBhd2FpdCB0aGlzLmdldFVQSSgpXG4gICAgICAgIGxldCBidWlsZGVyOiBzdHJpbmcgfCB1bmRlZmluZWRcbiAgICAgICAgaWYgKHVwaSkge1xuICAgICAgICAgIC8vIFRPRE86IHRoaXMgaXMgdXNlZCB0d2ljZSwgdGhlIHNlY29uZCB0aW1lIGluIGdoYy1tb2QtcHJvY2Vzcy1yZWFsLWZhY3RvcnkudHMsIHNob3VsZCBwcm9iYWJseSBmaXggdGhhdFxuICAgICAgICAgIGNvbnN0IGIgPSBhd2FpdCB1cGkuZ2V0T3RoZXJzQ29uZmlnUGFyYW08eyBuYW1lOiBzdHJpbmcgfT4oJ2lkZS1oYXNrZWxsLWNhYmFsJywgJ2J1aWxkZXInKVxuICAgICAgICAgIGlmIChiKSBidWlsZGVyID0gYi5uYW1lXG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIGJhY2tlbmQucnVuKHtcbiAgICAgICAgICAuLi5ydW5BcmdzLFxuICAgICAgICAgIGJ1aWxkZXIsXG4gICAgICAgICAgc3VwcHJlc3NFcnJvcnM6IHNldHRpbmdzLnN1cHByZXNzRXJyb3JzLFxuICAgICAgICAgIGdoY09wdGlvbnM6IHNldHRpbmdzLmdoY09wdGlvbnMsXG4gICAgICAgICAgZ2hjTW9kT3B0aW9uczogc2V0dGluZ3MuZ2hjTW9kT3B0aW9ucyxcbiAgICAgICAgfSlcbiAgICAgIH0gY2F0Y2ggKGVycikge1xuICAgICAgICBVdGlsLndhcm4oZXJyKVxuICAgICAgICB0aHJvdyBlcnJcbiAgICAgIH1cbiAgICB9KVxuICAgIHByb21pc2UudGhlbigoKSA9PiB7XG4gICAgICBjb25zdCBxZSA9IChxbjogQ29tbWFuZHMpID0+IHtcbiAgICAgICAgY29uc3QgcSA9IHRoaXMuY29tbWFuZFF1ZXVlc1txbl1cbiAgICAgICAgcmV0dXJuIChxLmdldFF1ZXVlTGVuZ3RoKCkgKyBxLmdldFBlbmRpbmdMZW5ndGgoKSkgPT09IDBcbiAgICAgIH1cbiAgICAgIGlmIChxZShxdWV1ZU5hbWUpKSB7XG4gICAgICAgIHRoaXMuZW1pdHRlci5lbWl0KCdxdWV1ZS1pZGxlJywgeyBxdWV1ZTogcXVldWVOYW1lIH0pXG4gICAgICAgIGlmIChPYmplY3Qua2V5cyh0aGlzLmNvbW1hbmRRdWV1ZXMpLmV2ZXJ5KHFlKSkge1xuICAgICAgICAgIHRoaXMuZW1pdHRlci5lbWl0KCdiYWNrZW5kLWlkbGUnKVxuICAgICAgICB9XG4gICAgICB9XG4gICAgfSkuY2F0Y2goKGU6IEVycm9yKSA9PiB7XG4gICAgICBhdG9tLm5vdGlmaWNhdGlvbnMuYWRkRXJyb3IoJ0Vycm9yIGluIEdIQ01vZCBjb21tYW5kIHF1ZXVlJywge1xuICAgICAgICBkZXRhaWw6IGUudG9TdHJpbmcoKSxcbiAgICAgICAgc3RhY2s6IGUuc3RhY2ssXG4gICAgICAgIGRpc21pc3NhYmxlOiB0cnVlLFxuICAgICAgfSlcbiAgICB9KVxuICAgIHJldHVybiBwcm9taXNlXG4gIH1cblxuICBwcml2YXRlIGFzeW5jIGRvQ2hlY2tPckxpbnRCdWZmZXIoY21kOiAnY2hlY2snIHwgJ2xpbnQnLCBidWZmZXI6IFRleHRCdWZmZXIsIGZhc3Q6IGJvb2xlYW4pIHtcbiAgICBsZXQgZGFzaEFyZ3NcbiAgICBpZiAoYnVmZmVyLmlzRW1wdHkoKSkgeyByZXR1cm4gW10gfVxuICAgIGlmICghYnVmZmVyLmdldFVyaSgpKSB7IHJldHVybiBbXSB9XG5cbiAgICAvLyBBIGRpcnR5IGhhY2sgdG8gbWFrZSBsaW50IHdvcmsgd2l0aCBsaHNcbiAgICBsZXQgdXJpID0gYnVmZmVyLmdldFVyaSgpXG4gICAgY29uc3Qgb2xkdXJpID0gYnVmZmVyLmdldFVyaSgpXG4gICAgbGV0IHRleHQ6IHN0cmluZyB8IHVuZGVmaW5lZFxuICAgIHRyeSB7XG4gICAgICBpZiAoKGNtZCA9PT0gJ2xpbnQnKSAmJiAoZXh0bmFtZSh1cmkpID09PSAnLmxocycpKSB7XG4gICAgICAgIHVyaSA9IHVyaS5zbGljZSgwLCAtMSlcbiAgICAgICAgdGV4dCA9IGF3YWl0IHVubGl0KG9sZHVyaSwgYnVmZmVyLmdldFRleHQoKSlcbiAgICAgIH0gZWxzZSBpZiAoYnVmZmVyLmlzTW9kaWZpZWQoKSkge1xuICAgICAgICB0ZXh0ID0gYnVmZmVyLmdldFRleHQoKVxuICAgICAgfVxuICAgIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgICAvLyBUT0RPOiBSZWplY3RcbiAgICAgIGNvbnN0IG0gPSAoZXJyb3IgYXMgRXJyb3IpLm1lc3NhZ2UubWF0Y2goL14oLio/KTooWzAtOV0rKTogKiguKikgKiQvKVxuICAgICAgaWYgKCFtKSB7IHRocm93IGVycm9yIH1cbiAgICAgIGNvbnN0IFt1cmkyLCBsaW5lLCBtZXNzXSA9IG0uc2xpY2UoMSlcbiAgICAgIHJldHVybiBbe1xuICAgICAgICB1cmk6IHVyaTIsXG4gICAgICAgIHBvc2l0aW9uOiBuZXcgUG9pbnQocGFyc2VJbnQobGluZSwgMTApIC0gMSwgMCksXG4gICAgICAgIG1lc3NhZ2U6IG1lc3MsXG4gICAgICAgIHNldmVyaXR5OiAnbGludCcsXG4gICAgICB9XVxuICAgIH1cbiAgICAvLyBlbmQgb2YgZGlydHkgaGFja1xuXG4gICAgLy8gdHNsaW50OmRpc2FibGUtbmV4dC1saW5lOiB0b3RhbGl0eS1jaGVja1xuICAgIGlmIChjbWQgPT09ICdsaW50Jykge1xuICAgICAgY29uc3Qgb3B0czogc3RyaW5nW10gPSBhdG9tLmNvbmZpZy5nZXQoJ2hhc2tlbGwtZ2hjLW1vZC5obGludE9wdGlvbnMnKVxuICAgICAgZGFzaEFyZ3MgPSBbXVxuICAgICAgZm9yIChjb25zdCBvcHQgb2Ygb3B0cykge1xuICAgICAgICBkYXNoQXJncy5wdXNoKCctLWhsaW50T3B0Jywgb3B0KVxuICAgICAgfVxuICAgIH1cblxuICAgIGNvbnN0IHJvb3REaXIgPSBhd2FpdCB0aGlzLmdldFJvb3REaXIoYnVmZmVyKVxuXG4gICAgY29uc3QgdGV4dEIgPSB0ZXh0XG4gICAgY29uc3QgZGFzaEFyZ3NCID0gZGFzaEFyZ3NcbiAgICBjb25zdCBsaW5lcyA9IGF3YWl0IHRoaXMucXVldWVDbWQoJ2NoZWNrbGludCcsIHJvb3REaXIsICgpID0+ICh7XG4gICAgICBpbnRlcmFjdGl2ZTogZmFzdCxcbiAgICAgIGNvbW1hbmQ6IGNtZCxcbiAgICAgIHVyaSxcbiAgICAgIHRleHQ6IHRleHRCLFxuICAgICAgZGFzaEFyZ3M6IGRhc2hBcmdzQixcbiAgICB9KSlcblxuICAgIGNvbnN0IHJ4ID0gL14oLio/KTooWzAtOVxcc10rKTooWzAtOVxcc10rKTogKig/OihXYXJuaW5nfEVycm9yKTogKik/KFteXSopL1xuICAgIGNvbnN0IHJlcyA9IFtdXG4gICAgZm9yIChjb25zdCBsaW5lIG9mIGxpbmVzKSB7XG4gICAgICBjb25zdCBtYXRjaCA9IGxpbmUubWF0Y2gocngpXG4gICAgICBpZiAoIW1hdGNoKSB7XG4gICAgICAgIGlmIChsaW5lLnRyaW0oKS5sZW5ndGgpIHsgVXRpbC53YXJuKGBnaGMtbW9kIHNheXM6ICR7bGluZX1gKSB9XG4gICAgICAgIGNvbnRpbnVlXG4gICAgICB9XG4gICAgICBjb25zdCBbZmlsZTIsIHJvdywgY29sLCB3YXJuaW5nLCBtZXNzYWdlXSA9IG1hdGNoLnNsaWNlKDEpXG4gICAgICBpZiAoZmlsZTIgPT09ICdEdW1teScgJiYgcm93ID09PSAnMCcgJiYgY29sID09PSAnMCcpIHtcbiAgICAgICAgaWYgKHdhcm5pbmcgPT09ICdFcnJvcicpIHtcbiAgICAgICAgICB0aGlzLmVtaXR0ZXIuZW1pdCgnZXJyb3InLCB7XG4gICAgICAgICAgICBlcnI6IFV0aWwubWtFcnJvcignR0hDTW9kU3Rkb3V0RXJyb3InLCBtZXNzYWdlKSxcbiAgICAgICAgICAgIGNhcHM6IChhd2FpdCB0aGlzLmluaXRCYWNrZW5kKHJvb3REaXIpKS5nZXRDYXBzKCksIC8vIFRPRE86IFRoaXMgaXMgbm90IHByZXR0eVxuICAgICAgICAgIH0pXG4gICAgICAgICAgY29udGludWVcbiAgICAgICAgfSBlbHNlIGlmICh3YXJuaW5nID09PSAnV2FybmluZycpIHtcbiAgICAgICAgICB0aGlzLmVtaXR0ZXIuZW1pdCgnd2FybmluZycsIG1lc3NhZ2UpXG4gICAgICAgICAgY29udGludWVcbiAgICAgICAgfVxuICAgICAgfVxuXG4gICAgICBjb25zdCBmaWxlID0gdXJpLmVuZHNXaXRoKGZpbGUyKSA/IG9sZHVyaSA6IGZpbGUyXG4gICAgICBjb25zdCBzZXZlcml0eSA9XG4gICAgICAgIGNtZCA9PT0gJ2xpbnQnID9cbiAgICAgICAgICAnbGludCdcbiAgICAgICAgICA6IHdhcm5pbmcgPT09ICdXYXJuaW5nJyA/XG4gICAgICAgICAgICAnd2FybmluZydcbiAgICAgICAgICAgIDpcbiAgICAgICAgICAgICdlcnJvcidcbiAgICAgIGNvbnN0IG1lc3NQb3MgPSBuZXcgUG9pbnQocGFyc2VJbnQocm93LCAxMCkgLSAxLCBwYXJzZUludChjb2wsIDEwKSAtIDEpXG4gICAgICBjb25zdCBwb3NpdGlvbiA9IFV0aWwudGFiVW5zaGlmdEZvclBvaW50KGJ1ZmZlciwgbWVzc1BvcylcbiAgICAgIGxldCBteXVyaVxuICAgICAgdHJ5IHtcbiAgICAgICAgbXl1cmkgPSByb290RGlyLmdldEZpbGUocm9vdERpci5yZWxhdGl2aXplKGZpbGUpKS5nZXRQYXRoKClcbiAgICAgIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgICAgIG15dXJpID0gZmlsZVxuICAgICAgfVxuICAgICAgcmVzLnB1c2goe1xuICAgICAgICB1cmk6IG15dXJpLFxuICAgICAgICBwb3NpdGlvbixcbiAgICAgICAgbWVzc2FnZSxcbiAgICAgICAgc2V2ZXJpdHksXG4gICAgICB9KVxuICAgIH1cbiAgICByZXR1cm4gcmVzXG4gIH1cbn1cbiJdfQ==