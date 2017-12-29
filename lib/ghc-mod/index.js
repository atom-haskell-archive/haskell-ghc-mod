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
        const backend = this.createBackend(rootDir);
        this.backend.set(rootPath, backend);
        return backend;
    }
    async createBackend(rootDir) {
        const newBackend = ghc_modi_process_real_factory_1.createGhcModiProcessReal(rootDir, await this.getUPI());
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
                if (upi && atom.config.get('haskell-ghc-mod.builderManagement')) {
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaW5kZXguanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi9zcmMvZ2hjLW1vZC9pbmRleC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOztBQUFBLCtCQUMrQztBQUMvQyxnQ0FBK0I7QUFDL0IsK0JBQThCO0FBQzlCLHVDQUF1QztBQUN2QywyREFBMEM7QUFLMUMsbUZBQTBFO0FBQzFFLHlDQUF3QztBQWF4QztJQWVFLFlBQW9CLFVBQXFDO1FBQXJDLGVBQVUsR0FBVixVQUFVLENBQTJCO1FBQ3ZELElBQUksQ0FBQyxXQUFXLEdBQUcsSUFBSSwwQkFBbUIsRUFBRSxDQUFBO1FBQzVDLElBQUksQ0FBQyxPQUFPLEdBQUcsSUFBSSxjQUFPLEVBQUUsQ0FBQTtRQUM1QixJQUFJLENBQUMsV0FBVyxDQUFDLEdBQUcsQ0FBQyxJQUFJLENBQUMsT0FBTyxDQUFDLENBQUE7UUFDbEMsSUFBSSxDQUFDLFlBQVksR0FBRyxJQUFJLE9BQU8sRUFBRSxDQUFBO1FBQ2pDLElBQUksQ0FBQyxPQUFPLEdBQUcsSUFBSSxHQUFHLEVBQUUsQ0FBQTtRQUV4QixFQUFFLENBQUMsQ0FBQyxPQUFPLENBQUMsR0FBRyxDQUFDLGdCQUFnQixJQUFJLENBQUMsSUFBSSxDQUFDLE1BQU0sQ0FBQyxHQUFHLENBQUMsK0NBQStDLENBQUMsQ0FBQyxDQUFDLENBQUM7WUFDdEcsSUFBSSxDQUFDLGtCQUFrQixFQUFFLENBQUE7UUFDM0IsQ0FBQztRQUVELElBQUksQ0FBQyxhQUFhLEdBQUc7WUFDbkIsU0FBUyxFQUFFLElBQUksS0FBSyxDQUFDLENBQUMsQ0FBQztZQUN2QixNQUFNLEVBQUUsSUFBSSxLQUFLLENBQUMsSUFBSSxDQUFDLE1BQU0sQ0FBQyxHQUFHLENBQUMsb0NBQW9DLENBQUMsQ0FBQztZQUN4RSxRQUFRLEVBQUUsSUFBSSxLQUFLLENBQUMsQ0FBQyxDQUFDO1lBQ3RCLElBQUksRUFBRSxJQUFJLEtBQUssQ0FBQyxDQUFDLENBQUM7WUFDbEIsSUFBSSxFQUFF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QkFDUCxRQUFRO2FBQ1QsQ0FBQyxDQUFBO1FBQ0osQ0FBQztRQUNELE1BQU0sQ0FBQyxHQUFHLENBQUE7SUFDWixDQUFDO0NBQ0Y7QUFuZUQsd0NBbWVDIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IHsgUmFuZ2UsIFBvaW50LCBFbWl0dGVyLCBDb21wb3NpdGVEaXNwb3NhYmxlLFxuVGV4dEJ1ZmZlciwgRGlyZWN0b3J5LCBUZXh0RWRpdG9yIH0gZnJvbSAnYXRvbSdcbmltcG9ydCAqIGFzIFV0aWwgZnJvbSAnLi4vdXRpbCdcbmltcG9ydCB7IGV4dG5hbWUgfSBmcm9tICdwYXRoJ1xuaW1wb3J0IFF1ZXVlID0gcmVxdWlyZSgncHJvbWlzZS1xdWV1ZScpXG5pbXBvcnQgeyB1bmxpdCB9IGZyb20gJ2F0b20taGFza2VsbC11dGlscydcbmltcG9ydCAqIGFzIENvbXBsZXRpb25CYWNrZW5kIGZyb20gJ2F0b20taGFza2VsbC11cGkvY29tcGxldGlvbi1iYWNrZW5kJ1xuaW1wb3J0ICogYXMgVVBJIGZyb20gJ2F0b20taGFza2VsbC11cGknXG5cbmltcG9ydCB7IEdoY01vZGlQcm9jZXNzUmVhbCwgR0hDTW9kQ2FwcywgUnVuQXJncywgSUVycm9yQ2FsbGJhY2tBcmdzIH0gZnJvbSAnLi9naGMtbW9kaS1wcm9jZXNzLXJlYWwnXG5pbXBvcnQgeyBjcmVhdGVHaGNNb2RpUHJvY2Vzc1JlYWwgfSBmcm9tICcuL2doYy1tb2RpLXByb2Nlc3MtcmVhbC1mYWN0b3J5J1xuaW1wb3J0IHsgZ2V0U2V0dGluZ3MgfSBmcm9tICcuL3NldHRpbmdzJ1xuXG5leHBvcnQgeyBJRXJyb3JDYWxsYmFja0FyZ3MsIFJ1bkFyZ3MsIEdIQ01vZENhcHMgfVxuXG50eXBlIENvbW1hbmRzID0gJ2NoZWNrbGludCcgfCAnYnJvd3NlJyB8ICd0eXBlaW5mbycgfCAnZmluZCcgfCAnaW5pdCcgfCAnbGlzdCcgfCAnbG93bWVtJ1xuXG5leHBvcnQgaW50ZXJmYWNlIFN5bWJvbERlc2Mge1xuICBuYW1lOiBzdHJpbmcsXG4gIHN5bWJvbFR5cGU6IENvbXBsZXRpb25CYWNrZW5kLlN5bWJvbFR5cGUsXG4gIHR5cGVTaWduYXR1cmU/OiBzdHJpbmcsXG4gIHBhcmVudD86IHN0cmluZ1xufVxuXG5leHBvcnQgY2xhc3MgR2hjTW9kaVByb2Nlc3Mge1xuICBwcml2YXRlIGJhY2tlbmQ6IE1hcDxzdHJpbmcsIFByb21pc2U8R2hjTW9kaVByb2Nlc3NSZWFsPj5cbiAgcHJpdmF0ZSBkaXNwb3NhYmxlczogQ29tcG9zaXRlRGlzcG9zYWJsZVxuICBwcml2YXRlIGVtaXR0ZXI6IEVtaXR0ZXI8e1xuICAgICdkaWQtZGVzdHJveSc6IHVuZGVmaW5lZFxuICAgICdiYWNrZW5kLWFjdGl2ZSc6IHVuZGVmaW5lZFxuICAgICdiYWNrZW5kLWlkbGUnOiB1bmRlZmluZWRcbiAgfSwge1xuICAgICd3YXJuaW5nJzogc3RyaW5nXG4gICAgJ2Vycm9yJzogSUVycm9yQ2FsbGJhY2tBcmdzXG4gICAgJ3F1ZXVlLWlkbGUnOiB7IHF1ZXVlOiBDb21tYW5kcyB9XG4gIH0+XG4gIHByaXZhdGUgYnVmZmVyRGlyTWFwOiBXZWFrTWFwPFRleHRCdWZmZXIsIERpcmVjdG9yeT5cbiAgcHJpdmF0ZSBjb21tYW5kUXVldWVzOiB7W0sgaW4gQ29tbWFuZHNdOiBRdWV1ZX1cblxuICBjb25zdHJ1Y3Rvcihwcml2YXRlIHVwaVByb21pc2U6IFByb21pc2U8VVBJLklVUElJbnN0YW5jZT4pIHtcbiAgICB0aGlzLmRpc3Bvc2FibGVzID0gbmV3IENvbXBvc2l0ZURpc3Bvc2FibGUoKVxuICAgIHRoaXMuZW1pdHRlciA9IG5ldyBFbWl0dGVyKClcbiAgICB0aGlzLmRpc3Bvc2FibGVzLmFkZCh0aGlzLmVtaXR0ZXIpXG4gICAgdGhpcy5idWZmZXJEaXJNYXAgPSBuZXcgV2Vha01hcCgpXG4gICAgdGhpcy5iYWNrZW5kID0gbmV3IE1hcCgpXG5cbiAgICBpZiAocHJvY2Vzcy5lbnYuR0hDX1BBQ0tBR0VfUEFUSCAmJiAhYXRvbS5jb25maWcuZ2V0KCdoYXNrZWxsLWdoYy1tb2Quc3VwcHJlc3NHaGNQYWNrYWdlUGF0aFdhcm5pbmcnKSkge1xuICAgICAgVXRpbC53YXJuR0hDUGFja2FnZVBhdGgoKVxuICAgIH1cblxuICAgIHRoaXMuY29tbWFuZFF1ZXVlcyA9IHtcbiAgICAgIGNoZWNrbGludDogbmV3IFF1ZXVlKDIpLFxuICAgICAgYnJvd3NlOiBuZXcgUXVldWUoYXRvbS5jb25maWcuZ2V0KCdoYXNrZWxsLWdoYy1tb2QubWF4QnJvd3NlUHJvY2Vzc2VzJykpLFxuICAgICAgdHlwZWluZm86IG5ldyBRdWV1ZSgxKSxcbiAgICAgIGZpbmQ6IG5ldyBRdWV1ZSgxKSxcbiAgICAgIGluaXQ6IG5ldyBRdWV1ZSg0KSxcbiAgICAgIGxpc3Q6IG5ldyBRdWV1ZSgxKSxcbiAgICAgIGxvd21lbTogbmV3IFF1ZXVlKDEpLFxuICAgIH1cbiAgICB0aGlzLmRpc3Bvc2FibGVzLmFkZChhdG9tLmNvbmZpZy5vbkRpZENoYW5nZSgnaGFza2VsbC1naGMtbW9kLm1heEJyb3dzZVByb2Nlc3NlcycsICh7IG5ld1ZhbHVlIH0pID0+XG4gICAgICB0aGlzLmNvbW1hbmRRdWV1ZXMuYnJvd3NlID0gbmV3IFF1ZXVlKG5ld1ZhbHVlIGFzIG51bWJlcikpLFxuICAgIClcbiAgfVxuXG4gIHB1YmxpYyBhc3luYyBnZXRSb290RGlyKGJ1ZmZlcjogVGV4dEJ1ZmZlcik6IFByb21pc2U8RGlyZWN0b3J5PiB7XG4gICAgbGV0IGRpclxuICAgIGRpciA9IHRoaXMuYnVmZmVyRGlyTWFwLmdldChidWZmZXIpXG4gICAgaWYgKGRpcikge1xuICAgICAgcmV0dXJuIGRpclxuICAgIH1cbiAgICBkaXIgPSBhd2FpdCBVdGlsLmdldFJvb3REaXIoYnVmZmVyKVxuICAgIHRoaXMuYnVmZmVyRGlyTWFwLnNldChidWZmZXIsIGRpcilcbiAgICByZXR1cm4gZGlyXG4gIH1cblxuICBwdWJsaWMga2lsbFByb2Nlc3MoKSB7XG4gICAgZm9yIChjb25zdCBicCBvZiB0aGlzLmJhY2tlbmQudmFsdWVzKCkpIHtcbiAgICAgIGJwLnRoZW4oKGIpID0+IGIua2lsbFByb2Nlc3MoKSlcbiAgICAgIC5jYXRjaCgoZTogRXJyb3IpID0+IHtcbiAgICAgICAgYXRvbS5ub3RpZmljYXRpb25zLmFkZEVycm9yKCdFcnJvciBraWxsaW5nIGdoYy1tb2QgcHJvY2VzcycsIHtcbiAgICAgICAgICBkZXRhaWw6IGUudG9TdHJpbmcoKSxcbiAgICAgICAgICBzdGFjazogZS5zdGFjayxcbiAgICAgICAgICBkaXNtaXNzYWJsZTogdHJ1ZSxcbiAgICAgICAgfSlcbiAgICAgIH0pXG4gICAgfVxuICAgIHRoaXMuYmFja2VuZC5jbGVhcigpXG4gIH1cblxuICBwdWJsaWMgZGVzdHJveSgpIHtcbiAgICBmb3IgKGNvbnN0IGJwIG9mIHRoaXMuYmFja2VuZC52YWx1ZXMoKSkge1xuICAgICAgYnAudGhlbigoYikgPT4gYi5kZXN0cm95KCkpXG4gICAgICAuY2F0Y2goKGU6IEVycm9yKSA9PiB7XG4gICAgICAgIGF0b20ubm90aWZpY2F0aW9ucy5hZGRFcnJvcignRXJyb3Iga2lsbGluZyBnaGMtbW9kIHByb2Nlc3MnLCB7XG4gICAgICAgICAgZGV0YWlsOiBlLnRvU3RyaW5nKCksXG4gICAgICAgICAgc3RhY2s6IGUuc3RhY2ssXG4gICAgICAgICAgZGlzbWlzc2FibGU6IHRydWUsXG4gICAgICAgIH0pXG4gICAgICB9KVxuICAgIH1cbiAgICB0aGlzLmJhY2tlbmQuY2xlYXIoKVxuICAgIHRoaXMuZW1pdHRlci5lbWl0KCdkaWQtZGVzdHJveScpXG4gICAgdGhpcy5kaXNwb3NhYmxlcy5kaXNwb3NlKClcbiAgfVxuXG4gIHB1YmxpYyBvbkRpZERlc3Ryb3koY2FsbGJhY2s6ICgpID0+IHZvaWQpIHtcbiAgICByZXR1cm4gdGhpcy5lbWl0dGVyLm9uKCdkaWQtZGVzdHJveScsIGNhbGxiYWNrKVxuICB9XG5cbiAgcHVibGljIG9uV2FybmluZyhjYWxsYmFjazogKHdhcm5pbmc6IHN0cmluZykgPT4gdm9pZCkge1xuICAgIHJldHVybiB0aGlzLmVtaXR0ZXIub24oJ3dhcm5pbmcnLCBjYWxsYmFjaylcbiAgfVxuXG4gIHB1YmxpYyBvbkVycm9yKGNhbGxiYWNrOiAoZXJyb3I6IElFcnJvckNhbGxiYWNrQXJncykgPT4gdm9pZCkge1xuICAgIHJldHVybiB0aGlzLmVtaXR0ZXIub24oJ2Vycm9yJywgY2FsbGJhY2spXG4gIH1cblxuICBwdWJsaWMgb25CYWNrZW5kQWN0aXZlKGNhbGxiYWNrOiAoKSA9PiB2b2lkKSB7XG4gICAgcmV0dXJuIHRoaXMuZW1pdHRlci5vbignYmFja2VuZC1hY3RpdmUnLCBjYWxsYmFjaylcbiAgfVxuXG4gIHB1YmxpYyBvbkJhY2tlbmRJZGxlKGNhbGxiYWNrOiAoKSA9PiB2b2lkKSB7XG4gICAgcmV0dXJuIHRoaXMuZW1pdHRlci5vbignYmFja2VuZC1pZGxlJywgY2FsbGJhY2spXG4gIH1cblxuICBwdWJsaWMgb25RdWV1ZUlkbGUoY2FsbGJhY2s6ICgpID0+IHZvaWQpIHtcbiAgICByZXR1cm4gdGhpcy5lbWl0dGVyLm9uKCdxdWV1ZS1pZGxlJywgY2FsbGJhY2spXG4gIH1cblxuICBwdWJsaWMgYXN5bmMgcnVuTGlzdChidWZmZXI6IFRleHRCdWZmZXIpIHtcbiAgICByZXR1cm4gdGhpcy5xdWV1ZUNtZCgnbGlzdCcsIGF3YWl0IHRoaXMuZ2V0Um9vdERpcihidWZmZXIpLCAoKSA9PiAoeyBjb21tYW5kOiAnbGlzdCcgfSkpXG4gIH1cblxuICBwdWJsaWMgYXN5bmMgcnVuTGFuZyhkaXI6IERpcmVjdG9yeSkge1xuICAgIHJldHVybiB0aGlzLnF1ZXVlQ21kKCdpbml0JywgZGlyLCAoKSA9PiAoeyBjb21tYW5kOiAnbGFuZycgfSkpXG4gIH1cblxuICBwdWJsaWMgYXN5bmMgcnVuRmxhZyhkaXI6IERpcmVjdG9yeSkge1xuICAgIHJldHVybiB0aGlzLnF1ZXVlQ21kKCdpbml0JywgZGlyLCAoKSA9PiAoeyBjb21tYW5kOiAnZmxhZycgfSkpXG4gIH1cblxuICBwdWJsaWMgYXN5bmMgcnVuQnJvd3NlKHJvb3REaXI6IERpcmVjdG9yeSwgbW9kdWxlczogc3RyaW5nW10pOiBQcm9taXNlPFN5bWJvbERlc2NbXT4ge1xuICAgIGNvbnN0IGxpbmVzID0gYXdhaXQgdGhpcy5xdWV1ZUNtZCgnYnJvd3NlJywgcm9vdERpciwgKGNhcHMpID0+IHtcbiAgICAgIGNvbnN0IGFyZ3MgPSBjYXBzLmJyb3dzZU1haW4gPyBtb2R1bGVzIDogbW9kdWxlcy5maWx0ZXIoKHYpID0+IHYgIT09ICdNYWluJylcbiAgICAgIGlmIChhcmdzLmxlbmd0aCA9PT0gMCkgcmV0dXJuIHVuZGVmaW5lZFxuICAgICAgcmV0dXJuIHtcbiAgICAgICAgY29tbWFuZDogJ2Jyb3dzZScsXG4gICAgICAgIGRhc2hBcmdzOiBjYXBzLmJyb3dzZVBhcmVudHMgPyBbJy1kJywgJy1vJywgJy1wJ10gOiBbJy1kJywgJy1vJ10sXG4gICAgICAgIGFyZ3MsXG4gICAgICB9XG4gICAgfSlcbiAgICByZXR1cm4gbGluZXMubWFwKChzKSA9PiB7XG4gICAgICAvLyBlbnVtRnJvbSA6OiBFbnVtIGEgPT4gYSAtPiBbYV0gLS0gZnJvbTpFbnVtXG4gICAgICBjb25zdCBwYXR0ZXJuID0gL14oLio/KSA6OiAoLio/KSg/OiAtLSBmcm9tOiguKikpPyQvXG4gICAgICBjb25zdCBtYXRjaCA9IHMubWF0Y2gocGF0dGVybilcbiAgICAgIGxldCBuYW1lOiBzdHJpbmdcbiAgICAgIGxldCB0eXBlU2lnbmF0dXJlOiBzdHJpbmcgfCB1bmRlZmluZWRcbiAgICAgIGxldCBwYXJlbnQ6IHN0cmluZyB8IHVuZGVmaW5lZFxuICAgICAgaWYgKG1hdGNoKSB7XG4gICAgICAgIG5hbWUgPSBtYXRjaFsxXVxuICAgICAgICB0eXBlU2lnbmF0dXJlID0gbWF0Y2hbMl1cbiAgICAgICAgcGFyZW50ID0gbWF0Y2hbM11cbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIG5hbWUgPSBzXG4gICAgICB9XG4gICAgICBsZXQgc3ltYm9sVHlwZTogQ29tcGxldGlvbkJhY2tlbmQuU3ltYm9sVHlwZVxuICAgICAgaWYgKHR5cGVTaWduYXR1cmUgJiYgL14oPzp0eXBlfGRhdGF8bmV3dHlwZSkvLnRlc3QodHlwZVNpZ25hdHVyZSkpIHtcbiAgICAgICAgc3ltYm9sVHlwZSA9ICd0eXBlJ1xuICAgICAgfSBlbHNlIGlmICh0eXBlU2lnbmF0dXJlICYmIC9eKD86Y2xhc3MpLy50ZXN0KHR5cGVTaWduYXR1cmUpKSB7XG4gICAgICAgIHN5bWJvbFR5cGUgPSAnY2xhc3MnXG4gICAgICB9IGVsc2UgaWYgKC9eXFwoLipcXCkkLy50ZXN0KG5hbWUpKSB7XG4gICAgICAgIHN5bWJvbFR5cGUgPSAnb3BlcmF0b3InXG4gICAgICAgIG5hbWUgPSBuYW1lLnNsaWNlKDEsIC0xKVxuICAgICAgfSBlbHNlIGlmIChVdGlsLmlzVXBwZXJDYXNlKG5hbWVbMF0pKSB7XG4gICAgICAgIHN5bWJvbFR5cGUgPSAndGFnJ1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgc3ltYm9sVHlwZSA9ICdmdW5jdGlvbidcbiAgICAgIH1cbiAgICAgIHJldHVybiB7IG5hbWUsIHR5cGVTaWduYXR1cmUsIHN5bWJvbFR5cGUsIHBhcmVudCB9XG4gICAgfSlcbiAgfVxuXG4gIHB1YmxpYyBhc3luYyBnZXRUeXBlSW5CdWZmZXIoXG4gICAgYnVmZmVyOiBUZXh0QnVmZmVyLCBjcmFuZ2U6IFJhbmdlLFxuICApIHtcbiAgICBpZiAoIWJ1ZmZlci5nZXRVcmkoKSkgeyB0aHJvdyBuZXcgRXJyb3IoJ05vIFVSSSBmb3IgYnVmZmVyJykgfVxuICAgIGNyYW5nZSA9IFV0aWwudGFiU2hpZnRGb3JSYW5nZShidWZmZXIsIGNyYW5nZSlcbiAgICBjb25zdCByb290RGlyID0gYXdhaXQgdGhpcy5nZXRSb290RGlyKGJ1ZmZlcilcbiAgICBjb25zdCBsaW5lcyA9IGF3YWl0IHRoaXMucXVldWVDbWQoJ3R5cGVpbmZvJywgcm9vdERpciwgKGNhcHMpID0+ICh7XG4gICAgICBpbnRlcmFjdGl2ZTogdHJ1ZSxcbiAgICAgIGNvbW1hbmQ6ICd0eXBlJyxcbiAgICAgIHVyaTogYnVmZmVyLmdldFVyaSgpLFxuICAgICAgdGV4dDogYnVmZmVyLmlzTW9kaWZpZWQoKSA/IGJ1ZmZlci5nZXRUZXh0KCkgOiB1bmRlZmluZWQsXG4gICAgICBkYXNoQXJnczogY2Fwcy50eXBlQ29uc3RyYWludHMgPyBbJy1jJ10gOiBbXSxcbiAgICAgIGFyZ3M6IFtjcmFuZ2Uuc3RhcnQucm93ICsgMSwgY3JhbmdlLnN0YXJ0LmNvbHVtbiArIDFdLm1hcCgodikgPT4gdi50b1N0cmluZygpKSxcbiAgICB9KSlcblxuICAgIGNvbnN0IHJ4ID0gL14oXFxkKylcXHMrKFxcZCspXFxzKyhcXGQrKVxccysoXFxkKylcXHMrXCIoW15dKilcIiQvIC8vIFteXSBiYXNpY2FsbHkgbWVhbnMgXCJhbnl0aGluZ1wiLCBpbmNsLiBuZXdsaW5lc1xuICAgIGZvciAoY29uc3QgbGluZSBvZiBsaW5lcykge1xuICAgICAgY29uc3QgbWF0Y2ggPSBsaW5lLm1hdGNoKHJ4KVxuICAgICAgaWYgKCFtYXRjaCkgeyBjb250aW51ZSB9XG4gICAgICBjb25zdCBbcm93c3RhcnQsIGNvbHN0YXJ0LCByb3dlbmQsIGNvbGVuZCwgdHlwZV0gPSBtYXRjaC5zbGljZSgxKVxuICAgICAgY29uc3QgcmFuZ2UgPVxuICAgICAgICBSYW5nZS5mcm9tT2JqZWN0KFtcbiAgICAgICAgICBbcGFyc2VJbnQocm93c3RhcnQsIDEwKSAtIDEsIHBhcnNlSW50KGNvbHN0YXJ0LCAxMCkgLSAxXSxcbiAgICAgICAgICBbcGFyc2VJbnQocm93ZW5kLCAxMCkgLSAxLCBwYXJzZUludChjb2xlbmQsIDEwKSAtIDFdLFxuICAgICAgICBdKVxuICAgICAgaWYgKHJhbmdlLmlzRW1wdHkoKSkgeyBjb250aW51ZSB9XG4gICAgICBpZiAoIXJhbmdlLmNvbnRhaW5zUmFuZ2UoY3JhbmdlKSkgeyBjb250aW51ZSB9XG4gICAgICByZXR1cm4ge1xuICAgICAgICByYW5nZTogVXRpbC50YWJVbnNoaWZ0Rm9yUmFuZ2UoYnVmZmVyLCByYW5nZSksXG4gICAgICAgIHR5cGU6IHR5cGUucmVwbGFjZSgvXFxcXFwiL2csICdcIicpLFxuICAgICAgfVxuICAgIH1cbiAgICB0aHJvdyBuZXcgRXJyb3IoJ05vIHR5cGUnKVxuICB9XG5cbiAgcHVibGljIGFzeW5jIGRvQ2FzZVNwbGl0KGJ1ZmZlcjogVGV4dEJ1ZmZlciwgY3JhbmdlOiBSYW5nZSkge1xuICAgIGlmICghYnVmZmVyLmdldFVyaSgpKSB7IHRocm93IG5ldyBFcnJvcignTm8gVVJJIGZvciBidWZmZXInKSB9XG4gICAgY3JhbmdlID0gVXRpbC50YWJTaGlmdEZvclJhbmdlKGJ1ZmZlciwgY3JhbmdlKVxuICAgIGNvbnN0IHJvb3REaXIgPSBhd2FpdCB0aGlzLmdldFJvb3REaXIoYnVmZmVyKVxuICAgIGNvbnN0IGxpbmVzID0gYXdhaXQgdGhpcy5xdWV1ZUNtZCgndHlwZWluZm8nLCByb290RGlyLCAoY2FwcykgPT4gKHtcbiAgICAgIGludGVyYWN0aXZlOiBjYXBzLmludGVyYWN0aXZlQ2FzZVNwbGl0LFxuICAgICAgY29tbWFuZDogJ3NwbGl0JyxcbiAgICAgIHVyaTogYnVmZmVyLmdldFVyaSgpLFxuICAgICAgdGV4dDogYnVmZmVyLmlzTW9kaWZpZWQoKSA/IGJ1ZmZlci5nZXRUZXh0KCkgOiB1bmRlZmluZWQsXG4gICAgICBhcmdzOiBbY3JhbmdlLnN0YXJ0LnJvdyArIDEsIGNyYW5nZS5zdGFydC5jb2x1bW4gKyAxXS5tYXAoKHYpID0+IHYudG9TdHJpbmcoKSksXG4gICAgfSkpXG5cbiAgICBjb25zdCByeCA9IC9eKFxcZCspXFxzKyhcXGQrKVxccysoXFxkKylcXHMrKFxcZCspXFxzK1wiKFteXSopXCIkLyAvLyBbXl0gYmFzaWNhbGx5IG1lYW5zIFwiYW55dGhpbmdcIiwgaW5jbC4gbmV3bGluZXNcbiAgICBjb25zdCByZXMgPSBbXVxuICAgIGZvciAoY29uc3QgbGluZSBvZiBsaW5lcykge1xuICAgICAgY29uc3QgbWF0Y2ggPSBsaW5lLm1hdGNoKHJ4KVxuICAgICAgaWYgKCFtYXRjaCkge1xuICAgICAgICBVdGlsLndhcm4oYGdoYy1tb2Qgc2F5czogJHtsaW5lfWApXG4gICAgICAgIGNvbnRpbnVlXG4gICAgICB9XG4gICAgICBjb25zdCBbcm93c3RhcnQsIGNvbHN0YXJ0LCByb3dlbmQsIGNvbGVuZCwgdGV4dF0gPSBtYXRjaC5zbGljZSgxKVxuICAgICAgcmVzLnB1c2goe1xuICAgICAgICByYW5nZTpcbiAgICAgICAgUmFuZ2UuZnJvbU9iamVjdChbXG4gICAgICAgICAgW3BhcnNlSW50KHJvd3N0YXJ0LCAxMCkgLSAxLCBwYXJzZUludChjb2xzdGFydCwgMTApIC0gMV0sXG4gICAgICAgICAgW3BhcnNlSW50KHJvd2VuZCwgMTApIC0gMSwgcGFyc2VJbnQoY29sZW5kLCAxMCkgLSAxXSxcbiAgICAgICAgXSksXG4gICAgICAgIHJlcGxhY2VtZW50OiB0ZXh0LFxuICAgICAgfSlcbiAgICB9XG4gICAgcmV0dXJuIHJlc1xuICB9XG5cbiAgcHVibGljIGFzeW5jIGRvU2lnRmlsbChidWZmZXI6IFRleHRCdWZmZXIsIGNyYW5nZTogUmFuZ2UpIHtcbiAgICBpZiAoIWJ1ZmZlci5nZXRVcmkoKSkgeyB0aHJvdyBuZXcgRXJyb3IoJ05vIFVSSSBmb3IgYnVmZmVyJykgfVxuICAgIGNyYW5nZSA9IFV0aWwudGFiU2hpZnRGb3JSYW5nZShidWZmZXIsIGNyYW5nZSlcbiAgICBjb25zdCByb290RGlyID0gYXdhaXQgdGhpcy5nZXRSb290RGlyKGJ1ZmZlcilcbiAgICBjb25zdCBsaW5lcyA9IGF3YWl0IHRoaXMucXVldWVDbWQoJ3R5cGVpbmZvJywgcm9vdERpciwgKGNhcHMpID0+ICh7XG4gICAgICBpbnRlcmFjdGl2ZTogY2Fwcy5pbnRlcmFjdGl2ZUNhc2VTcGxpdCxcbiAgICAgIGNvbW1hbmQ6ICdzaWcnLFxuICAgICAgdXJpOiBidWZmZXIuZ2V0VXJpKCksXG4gICAgICB0ZXh0OiBidWZmZXIuaXNNb2RpZmllZCgpID8gYnVmZmVyLmdldFRleHQoKSA6IHVuZGVmaW5lZCxcbiAgICAgIGFyZ3M6IFtjcmFuZ2Uuc3RhcnQucm93ICsgMSwgY3JhbmdlLnN0YXJ0LmNvbHVtbiArIDFdLm1hcCgodikgPT4gdi50b1N0cmluZygpKSxcbiAgICB9KSlcbiAgICBpZiAobGluZXMubGVuZ3RoIDwgMikgeyB0aHJvdyBuZXcgRXJyb3IoYENvdWxkIG5vdCB1bmRlcnN0YW5kIHJlc3BvbnNlOiAke2xpbmVzLmpvaW4oJ1xcbicpfWApIH1cbiAgICBjb25zdCByeCA9IC9eKFxcZCspXFxzKyhcXGQrKVxccysoXFxkKylcXHMrKFxcZCspJC8gLy8gcG9zaXRpb24gcnhcbiAgICBjb25zdCBtYXRjaCA9IGxpbmVzWzFdLm1hdGNoKHJ4KVxuICAgIGlmICghbWF0Y2gpIHsgdGhyb3cgbmV3IEVycm9yKGBDb3VsZCBub3QgdW5kZXJzdGFuZCByZXNwb25zZTogJHtsaW5lcy5qb2luKCdcXG4nKX1gKSB9XG4gICAgY29uc3QgW3Jvd3N0YXJ0LCBjb2xzdGFydCwgcm93ZW5kLCBjb2xlbmRdID0gbWF0Y2guc2xpY2UoMSlcbiAgICBjb25zdCByYW5nZSA9XG4gICAgICBSYW5nZS5mcm9tT2JqZWN0KFtcbiAgICAgICAgW3BhcnNlSW50KHJvd3N0YXJ0LCAxMCkgLSAxLCBwYXJzZUludChjb2xzdGFydCwgMTApIC0gMV0sXG4gICAgICAgIFtwYXJzZUludChyb3dlbmQsIDEwKSAtIDEsIHBhcnNlSW50KGNvbGVuZCwgMTApIC0gMV0sXG4gICAgICBdKVxuICAgIHJldHVybiB7XG4gICAgICB0eXBlOiBsaW5lc1swXSxcbiAgICAgIHJhbmdlLFxuICAgICAgYm9keTogbGluZXMuc2xpY2UoMikuam9pbignXFxuJyksXG4gICAgfVxuICB9XG5cbiAgcHVibGljIGFzeW5jIGdldEluZm9JbkJ1ZmZlcihlZGl0b3I6IFRleHRFZGl0b3IsIGNyYW5nZTogUmFuZ2UpIHtcbiAgICBjb25zdCBidWZmZXIgPSBlZGl0b3IuZ2V0QnVmZmVyKClcbiAgICBpZiAoIWJ1ZmZlci5nZXRVcmkoKSkgeyB0aHJvdyBuZXcgRXJyb3IoJ05vIFVSSSBmb3IgYnVmZmVyJykgfVxuICAgIGNvbnN0IHN5bUluZm8gPSBVdGlsLmdldFN5bWJvbEluUmFuZ2UoZWRpdG9yLCBjcmFuZ2UpXG4gICAgaWYgKCFzeW1JbmZvKSB7IHRocm93IG5ldyBFcnJvcignQ291bGRuXFwndCBnZXQgc3ltYm9sIGZvciBpbmZvJykgfVxuICAgIGNvbnN0IHsgc3ltYm9sLCByYW5nZSB9ID0gc3ltSW5mb1xuXG4gICAgY29uc3QgbGluZXMgPSBhd2FpdCB0aGlzLnF1ZXVlQ21kKCd0eXBlaW5mbycsIGF3YWl0IHRoaXMuZ2V0Um9vdERpcihidWZmZXIpLCAoKSA9PiAoe1xuICAgICAgaW50ZXJhY3RpdmU6IHRydWUsXG4gICAgICBjb21tYW5kOiAnaW5mbycsXG4gICAgICB1cmk6IGJ1ZmZlci5nZXRVcmkoKSxcbiAgICAgIHRleHQ6IGJ1ZmZlci5pc01vZGlmaWVkKCkgPyBidWZmZXIuZ2V0VGV4dCgpIDogdW5kZWZpbmVkLFxuICAgICAgYXJnczogW3N5bWJvbF0sXG4gICAgfSkpXG5cbiAgICBjb25zdCBpbmZvID0gbGluZXMuam9pbignXFxuJylcbiAgICBpZiAoKGluZm8gPT09ICdDYW5ub3Qgc2hvdyBpbmZvJykgfHwgIWluZm8pIHtcbiAgICAgIHRocm93IG5ldyBFcnJvcignTm8gaW5mbycpXG4gICAgfSBlbHNlIHtcbiAgICAgIHJldHVybiB7IHJhbmdlLCBpbmZvIH1cbiAgICB9XG4gIH1cblxuICBwdWJsaWMgYXN5bmMgZmluZFN5bWJvbFByb3ZpZGVyc0luQnVmZmVyKGVkaXRvcjogVGV4dEVkaXRvciwgY3JhbmdlOiBSYW5nZSkge1xuICAgIGNvbnN0IGJ1ZmZlciA9IGVkaXRvci5nZXRCdWZmZXIoKVxuICAgIGNvbnN0IHN5bUluZm8gPSBVdGlsLmdldFN5bWJvbEluUmFuZ2UoZWRpdG9yLCBjcmFuZ2UpXG4gICAgaWYgKCFzeW1JbmZvKSB7IHRocm93IG5ldyBFcnJvcignQ291bGRuXFwndCBnZXQgc3ltYm9sIGZvciBpbXBvcnQnKSB9XG4gICAgY29uc3QgeyBzeW1ib2wgfSA9IHN5bUluZm9cblxuICAgIHJldHVybiB0aGlzLnF1ZXVlQ21kKCdmaW5kJywgYXdhaXQgdGhpcy5nZXRSb290RGlyKGJ1ZmZlciksICgpID0+ICh7XG4gICAgICBpbnRlcmFjdGl2ZTogdHJ1ZSxcbiAgICAgIGNvbW1hbmQ6ICdmaW5kJyxcbiAgICAgIGFyZ3M6IFtzeW1ib2xdLFxuICAgIH0pKVxuICB9XG5cbiAgcHVibGljIGFzeW5jIGRvQ2hlY2tCdWZmZXIoYnVmZmVyOiBUZXh0QnVmZmVyLCBmYXN0OiBib29sZWFuKSB7XG4gICAgcmV0dXJuIHRoaXMuZG9DaGVja09yTGludEJ1ZmZlcignY2hlY2snLCBidWZmZXIsIGZhc3QpXG4gIH1cblxuICBwdWJsaWMgYXN5bmMgZG9MaW50QnVmZmVyKGJ1ZmZlcjogVGV4dEJ1ZmZlcikge1xuICAgIHJldHVybiB0aGlzLmRvQ2hlY2tPckxpbnRCdWZmZXIoJ2xpbnQnLCBidWZmZXIsIGZhbHNlKVxuICB9XG5cbiAgcHVibGljIGFzeW5jIGRvQ2hlY2tBbmRMaW50KGJ1ZmZlcjogVGV4dEJ1ZmZlciwgZmFzdDogYm9vbGVhbikge1xuICAgIGNvbnN0IFtjciwgbHJdID0gYXdhaXQgUHJvbWlzZS5hbGwoW3RoaXMuZG9DaGVja0J1ZmZlcihidWZmZXIsIGZhc3QpLCB0aGlzLmRvTGludEJ1ZmZlcihidWZmZXIpXSlcbiAgICByZXR1cm4gY3IuY29uY2F0KGxyKVxuICB9XG5cbiAgcHJpdmF0ZSBhc3luYyBnZXRVUEkoKSB7XG4gICAgcmV0dXJuIFByb21pc2UucmFjZShbdGhpcy51cGlQcm9taXNlLCBQcm9taXNlLnJlc29sdmUodW5kZWZpbmVkKV0pXG4gIH1cblxuICBwcml2YXRlIGFzeW5jIGluaXRCYWNrZW5kKHJvb3REaXI6IERpcmVjdG9yeSk6IFByb21pc2U8R2hjTW9kaVByb2Nlc3NSZWFsPiB7XG4gICAgY29uc3Qgcm9vdFBhdGggPSByb290RGlyLmdldFBhdGgoKVxuICAgIGNvbnN0IGNhY2hlZCA9IHRoaXMuYmFja2VuZC5nZXQocm9vdFBhdGgpXG4gICAgaWYgKGNhY2hlZCkgeyByZXR1cm4gY2FjaGVkIH1cbiAgICBjb25zdCBiYWNrZW5kID0gdGhpcy5jcmVhdGVCYWNrZW5kKHJvb3REaXIpXG4gICAgdGhpcy5iYWNrZW5kLnNldChyb290UGF0aCwgYmFja2VuZClcbiAgICByZXR1cm4gYmFja2VuZFxuICB9XG5cbiAgcHJpdmF0ZSBhc3luYyBjcmVhdGVCYWNrZW5kKHJvb3REaXI6IERpcmVjdG9yeSk6IFByb21pc2U8R2hjTW9kaVByb2Nlc3NSZWFsPiB7XG4gICAgY29uc3QgbmV3QmFja2VuZCA9IGNyZWF0ZUdoY01vZGlQcm9jZXNzUmVhbChyb290RGlyLCBhd2FpdCB0aGlzLmdldFVQSSgpKVxuICAgIGNvbnN0IGJhY2tlbmQgPSBhd2FpdCBuZXdCYWNrZW5kXG4gICAgdGhpcy5kaXNwb3NhYmxlcy5hZGQoXG4gICAgICBiYWNrZW5kLm9uRXJyb3IoKGFyZykgPT4gdGhpcy5lbWl0dGVyLmVtaXQoJ2Vycm9yJywgYXJnKSksXG4gICAgICBiYWNrZW5kLm9uV2FybmluZygoYXJnKSA9PiB0aGlzLmVtaXR0ZXIuZW1pdCgnd2FybmluZycsIGFyZykpLFxuICAgIClcbiAgICByZXR1cm4gYmFja2VuZFxuICB9XG5cbiAgcHJpdmF0ZSBhc3luYyBxdWV1ZUNtZChcbiAgICBxdWV1ZU5hbWU6IENvbW1hbmRzLFxuICAgIGRpcjogRGlyZWN0b3J5LFxuICAgIHJ1bkFyZ3NGdW5jOiAoY2FwczogR0hDTW9kQ2FwcykgPT4ge1xuICAgICAgY29tbWFuZDogc3RyaW5nLCB0ZXh0Pzogc3RyaW5nLCB1cmk/OiBzdHJpbmcsIGludGVyYWN0aXZlPzogYm9vbGVhbixcbiAgICAgIGRhc2hBcmdzPzogc3RyaW5nW10sIGFyZ3M/OiBzdHJpbmdbXVxuICAgIH0gfCB1bmRlZmluZWQsXG4gICk6IFByb21pc2U8c3RyaW5nW10+IHtcbiAgICBpZiAoYXRvbS5jb25maWcuZ2V0KCdoYXNrZWxsLWdoYy1tb2QubG93TWVtb3J5U3lzdGVtJykpIHtcbiAgICAgIHF1ZXVlTmFtZSA9ICdsb3dtZW0nXG4gICAgfVxuICAgIGNvbnN0IGJhY2tlbmQgPSBhd2FpdCB0aGlzLmluaXRCYWNrZW5kKGRpcilcbiAgICBjb25zdCBwcm9taXNlID0gdGhpcy5jb21tYW5kUXVldWVzW3F1ZXVlTmFtZV0uYWRkKGFzeW5jICgpID0+IHtcbiAgICAgIHRoaXMuZW1pdHRlci5lbWl0KCdiYWNrZW5kLWFjdGl2ZScpXG4gICAgICB0cnkge1xuICAgICAgICBjb25zdCBzZXR0aW5ncyA9IGF3YWl0IGdldFNldHRpbmdzKGRpcilcbiAgICAgICAgaWYgKHNldHRpbmdzLmRpc2FibGUpIHsgdGhyb3cgbmV3IEVycm9yKCdHaGMtbW9kIGRpc2FibGVkIGluIHNldHRpbmdzJykgfVxuICAgICAgICBjb25zdCBydW5BcmdzID0gcnVuQXJnc0Z1bmMoYmFja2VuZC5nZXRDYXBzKCkpXG4gICAgICAgIGlmIChydW5BcmdzID09PSB1bmRlZmluZWQpIHJldHVybiBbXVxuICAgICAgICBjb25zdCB1cGkgPSBhd2FpdCB0aGlzLmdldFVQSSgpXG4gICAgICAgIGxldCBidWlsZGVyOiBzdHJpbmcgfCB1bmRlZmluZWRcbiAgICAgICAgaWYgKHVwaSAmJiBhdG9tLmNvbmZpZy5nZXQoJ2hhc2tlbGwtZ2hjLW1vZC5idWlsZGVyTWFuYWdlbWVudCcpKSB7XG4gICAgICAgICAgLy8gVE9ETzogdGhpcyBpcyB1c2VkIHR3aWNlLCB0aGUgc2Vjb25kIHRpbWUgaW4gZ2hjLW1vZC1wcm9jZXNzLXJlYWwtZmFjdG9yeS50cywgc2hvdWxkIHByb2JhYmx5IGZpeCB0aGF0XG4gICAgICAgICAgY29uc3QgYiA9IGF3YWl0IHVwaS5nZXRPdGhlcnNDb25maWdQYXJhbTx7IG5hbWU6IHN0cmluZyB9PignaWRlLWhhc2tlbGwtY2FiYWwnLCAnYnVpbGRlcicpXG4gICAgICAgICAgaWYgKGIpIGJ1aWxkZXIgPSBiLm5hbWVcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gYmFja2VuZC5ydW4oe1xuICAgICAgICAgIC4uLnJ1bkFyZ3MsXG4gICAgICAgICAgYnVpbGRlcixcbiAgICAgICAgICBzdXBwcmVzc0Vycm9yczogc2V0dGluZ3Muc3VwcHJlc3NFcnJvcnMsXG4gICAgICAgICAgZ2hjT3B0aW9uczogc2V0dGluZ3MuZ2hjT3B0aW9ucyxcbiAgICAgICAgICBnaGNNb2RPcHRpb25zOiBzZXR0aW5ncy5naGNNb2RPcHRpb25zLFxuICAgICAgICB9KVxuICAgICAgfSBjYXRjaCAoZXJyKSB7XG4gICAgICAgIFV0aWwud2FybihlcnIpXG4gICAgICAgIHRocm93IGVyclxuICAgICAgfVxuICAgIH0pXG4gICAgcHJvbWlzZS50aGVuKCgpID0+IHtcbiAgICAgIGNvbnN0IHFlID0gKHFuOiBDb21tYW5kcykgPT4ge1xuICAgICAgICBjb25zdCBxID0gdGhpcy5jb21tYW5kUXVldWVzW3FuXVxuICAgICAgICByZXR1cm4gKHEuZ2V0UXVldWVMZW5ndGgoKSArIHEuZ2V0UGVuZGluZ0xlbmd0aCgpKSA9PT0gMFxuICAgICAgfVxuICAgICAgaWYgKHFlKHF1ZXVlTmFtZSkpIHtcbiAgICAgICAgdGhpcy5lbWl0dGVyLmVtaXQoJ3F1ZXVlLWlkbGUnLCB7IHF1ZXVlOiBxdWV1ZU5hbWUgfSlcbiAgICAgICAgaWYgKE9iamVjdC5rZXlzKHRoaXMuY29tbWFuZFF1ZXVlcykuZXZlcnkocWUpKSB7XG4gICAgICAgICAgdGhpcy5lbWl0dGVyLmVtaXQoJ2JhY2tlbmQtaWRsZScpXG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9KS5jYXRjaCgoZTogRXJyb3IpID0+IHtcbiAgICAgIGF0b20ubm90aWZpY2F0aW9ucy5hZGRFcnJvcignRXJyb3IgaW4gR0hDTW9kIGNvbW1hbmQgcXVldWUnLCB7XG4gICAgICAgIGRldGFpbDogZS50b1N0cmluZygpLFxuICAgICAgICBzdGFjazogZS5zdGFjayxcbiAgICAgICAgZGlzbWlzc2FibGU6IHRydWUsXG4gICAgICB9KVxuICAgIH0pXG4gICAgcmV0dXJuIHByb21pc2VcbiAgfVxuXG4gIHByaXZhdGUgYXN5bmMgZG9DaGVja09yTGludEJ1ZmZlcihjbWQ6ICdjaGVjaycgfCAnbGludCcsIGJ1ZmZlcjogVGV4dEJ1ZmZlciwgZmFzdDogYm9vbGVhbikge1xuICAgIGxldCBkYXNoQXJnc1xuICAgIGlmIChidWZmZXIuaXNFbXB0eSgpKSB7IHJldHVybiBbXSB9XG4gICAgaWYgKCFidWZmZXIuZ2V0VXJpKCkpIHsgcmV0dXJuIFtdIH1cblxuICAgIC8vIEEgZGlydHkgaGFjayB0byBtYWtlIGxpbnQgd29yayB3aXRoIGxoc1xuICAgIGxldCB1cmkgPSBidWZmZXIuZ2V0VXJpKClcbiAgICBjb25zdCBvbGR1cmkgPSBidWZmZXIuZ2V0VXJpKClcbiAgICBsZXQgdGV4dDogc3RyaW5nIHwgdW5kZWZpbmVkXG4gICAgdHJ5IHtcbiAgICAgIGlmICgoY21kID09PSAnbGludCcpICYmIChleHRuYW1lKHVyaSkgPT09ICcubGhzJykpIHtcbiAgICAgICAgdXJpID0gdXJpLnNsaWNlKDAsIC0xKVxuICAgICAgICB0ZXh0ID0gYXdhaXQgdW5saXQob2xkdXJpLCBidWZmZXIuZ2V0VGV4dCgpKVxuICAgICAgfSBlbHNlIGlmIChidWZmZXIuaXNNb2RpZmllZCgpKSB7XG4gICAgICAgIHRleHQgPSBidWZmZXIuZ2V0VGV4dCgpXG4gICAgICB9XG4gICAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICAgIC8vIFRPRE86IFJlamVjdFxuICAgICAgY29uc3QgbSA9IChlcnJvciBhcyBFcnJvcikubWVzc2FnZS5tYXRjaCgvXiguKj8pOihbMC05XSspOiAqKC4qKSAqJC8pXG4gICAgICBpZiAoIW0pIHsgdGhyb3cgZXJyb3IgfVxuICAgICAgY29uc3QgW3VyaTIsIGxpbmUsIG1lc3NdID0gbS5zbGljZSgxKVxuICAgICAgcmV0dXJuIFt7XG4gICAgICAgIHVyaTogdXJpMixcbiAgICAgICAgcG9zaXRpb246IG5ldyBQb2ludChwYXJzZUludChsaW5lLCAxMCkgLSAxLCAwKSxcbiAgICAgICAgbWVzc2FnZTogbWVzcyxcbiAgICAgICAgc2V2ZXJpdHk6ICdsaW50JyxcbiAgICAgIH1dXG4gICAgfVxuICAgIC8vIGVuZCBvZiBkaXJ0eSBoYWNrXG5cbiAgICAvLyB0c2xpbnQ6ZGlzYWJsZS1uZXh0LWxpbmU6IHRvdGFsaXR5LWNoZWNrXG4gICAgaWYgKGNtZCA9PT0gJ2xpbnQnKSB7XG4gICAgICBjb25zdCBvcHRzOiBzdHJpbmdbXSA9IGF0b20uY29uZmlnLmdldCgnaGFza2VsbC1naGMtbW9kLmhsaW50T3B0aW9ucycpXG4gICAgICBkYXNoQXJncyA9IFtdXG4gICAgICBmb3IgKGNvbnN0IG9wdCBvZiBvcHRzKSB7XG4gICAgICAgIGRhc2hBcmdzLnB1c2goJy0taGxpbnRPcHQnLCBvcHQpXG4gICAgICB9XG4gICAgfVxuXG4gICAgY29uc3Qgcm9vdERpciA9IGF3YWl0IHRoaXMuZ2V0Um9vdERpcihidWZmZXIpXG5cbiAgICBjb25zdCB0ZXh0QiA9IHRleHRcbiAgICBjb25zdCBkYXNoQXJnc0IgPSBkYXNoQXJnc1xuICAgIGNvbnN0IGxpbmVzID0gYXdhaXQgdGhpcy5xdWV1ZUNtZCgnY2hlY2tsaW50Jywgcm9vdERpciwgKCkgPT4gKHtcbiAgICAgIGludGVyYWN0aXZlOiBmYXN0LFxuICAgICAgY29tbWFuZDogY21kLFxuICAgICAgdXJpLFxuICAgICAgdGV4dDogdGV4dEIsXG4gICAgICBkYXNoQXJnczogZGFzaEFyZ3NCLFxuICAgIH0pKVxuXG4gICAgY29uc3QgcnggPSAvXiguKj8pOihbMC05XFxzXSspOihbMC05XFxzXSspOiAqKD86KFdhcm5pbmd8RXJyb3IpOiAqKT8oW15dKikvXG4gICAgY29uc3QgcmVzID0gW11cbiAgICBmb3IgKGNvbnN0IGxpbmUgb2YgbGluZXMpIHtcbiAgICAgIGNvbnN0IG1hdGNoID0gbGluZS5tYXRjaChyeClcbiAgICAgIGlmICghbWF0Y2gpIHtcbiAgICAgICAgaWYgKGxpbmUudHJpbSgpLmxlbmd0aCkgeyBVdGlsLndhcm4oYGdoYy1tb2Qgc2F5czogJHtsaW5lfWApIH1cbiAgICAgICAgY29udGludWVcbiAgICAgIH1cbiAgICAgIGNvbnN0IFtmaWxlMiwgcm93LCBjb2wsIHdhcm5pbmcsIG1lc3NhZ2VdID0gbWF0Y2guc2xpY2UoMSlcbiAgICAgIGlmIChmaWxlMiA9PT0gJ0R1bW15JyAmJiByb3cgPT09ICcwJyAmJiBjb2wgPT09ICcwJykge1xuICAgICAgICBpZiAod2FybmluZyA9PT0gJ0Vycm9yJykge1xuICAgICAgICAgIHRoaXMuZW1pdHRlci5lbWl0KCdlcnJvcicsIHtcbiAgICAgICAgICAgIGVycjogVXRpbC5ta0Vycm9yKCdHSENNb2RTdGRvdXRFcnJvcicsIG1lc3NhZ2UpLFxuICAgICAgICAgICAgY2FwczogKGF3YWl0IHRoaXMuaW5pdEJhY2tlbmQocm9vdERpcikpLmdldENhcHMoKSwgLy8gVE9ETzogVGhpcyBpcyBub3QgcHJldHR5XG4gICAgICAgICAgfSlcbiAgICAgICAgICBjb250aW51ZVxuICAgICAgICB9IGVsc2UgaWYgKHdhcm5pbmcgPT09ICdXYXJuaW5nJykge1xuICAgICAgICAgIHRoaXMuZW1pdHRlci5lbWl0KCd3YXJuaW5nJywgbWVzc2FnZSlcbiAgICAgICAgICBjb250aW51ZVxuICAgICAgICB9XG4gICAgICB9XG5cbiAgICAgIGNvbnN0IGZpbGUgPSB1cmkuZW5kc1dpdGgoZmlsZTIpID8gb2xkdXJpIDogZmlsZTJcbiAgICAgIGNvbnN0IHNldmVyaXR5ID1cbiAgICAgICAgY21kID09PSAnbGludCcgP1xuICAgICAgICAgICdsaW50J1xuICAgICAgICAgIDogd2FybmluZyA9PT0gJ1dhcm5pbmcnID9cbiAgICAgICAgICAgICd3YXJuaW5nJ1xuICAgICAgICAgICAgOlxuICAgICAgICAgICAgJ2Vycm9yJ1xuICAgICAgY29uc3QgbWVzc1BvcyA9IG5ldyBQb2ludChwYXJzZUludChyb3csIDEwKSAtIDEsIHBhcnNlSW50KGNvbCwgMTApIC0gMSlcbiAgICAgIGNvbnN0IHBvc2l0aW9uID0gVXRpbC50YWJVbnNoaWZ0Rm9yUG9pbnQoYnVmZmVyLCBtZXNzUG9zKVxuICAgICAgbGV0IG15dXJpXG4gICAgICB0cnkge1xuICAgICAgICBteXVyaSA9IHJvb3REaXIuZ2V0RmlsZShyb290RGlyLnJlbGF0aXZpemUoZmlsZSkpLmdldFBhdGgoKVxuICAgICAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICAgICAgbXl1cmkgPSBmaWxlXG4gICAgICB9XG4gICAgICByZXMucHVzaCh7XG4gICAgICAgIHVyaTogbXl1cmksXG4gICAgICAgIHBvc2l0aW9uLFxuICAgICAgICBtZXNzYWdlLFxuICAgICAgICBzZXZlcml0eSxcbiAgICAgIH0pXG4gICAgfVxuICAgIHJldHVybiByZXNcbiAgfVxufVxuIl19