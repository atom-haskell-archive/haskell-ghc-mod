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
        if (process.env.GHC_PACKAGE_PATH &&
            !atom.config.get('haskell-ghc-mod.suppressGhcPackagePathWarning')) {
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
        this.disposables.add(atom.config.onDidChange('haskell-ghc-mod.maxBrowseProcesses', ({ newValue }) => (this.commandQueues.browse = new Queue(newValue))));
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
            bp.then((b) => b.killProcess()).catch((e) => {
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
            bp.then((b) => b.destroy()).catch((e) => {
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
        return this.queueCmd('list', await this.getRootDir(buffer), () => ({
            command: 'list',
        }));
    }
    async runLang(dir) {
        return this.queueCmd('init', dir, () => ({ command: 'lang' }));
    }
    async runFlag(dir) {
        return this.queueCmd('init', dir, () => ({ command: 'flag' }));
    }
    async runBrowse(rootDir, modules) {
        const lines = await this.queueCmd('browse', rootDir, (caps) => {
            const args = caps.browseMain
                ? modules
                : modules.filter((v) => v !== 'Main');
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
            throw new Error("Couldn't get symbol for info");
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
        if (info === 'Cannot show info' || !info) {
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
            throw new Error("Couldn't get symbol for import");
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
        promise
            .then(() => {
            const qe = (qn) => {
                const q = this.commandQueues[qn];
                return q.getQueueLength() + q.getPendingLength() === 0;
            };
            if (qe(queueName)) {
                this.emitter.emit('queue-idle', { queue: queueName });
                if (Object.keys(this.commandQueues).every(qe)) {
                    this.emitter.emit('backend-idle');
                }
            }
        })
            .catch((e) => {
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
            if (cmd === 'lint' && path_1.extname(uri) === '.lhs') {
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
            return [
                {
                    uri: uri2,
                    position: new atom_1.Point(parseInt(line, 10) - 1, 0),
                    message: mess,
                    severity: 'lint',
                },
            ];
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
            const severity = cmd === 'lint' ? 'lint' : warning === 'Warning' ? 'warning' : 'error';
            const messPos = new atom_1.Point(parseInt(row, 10) - 1, parseInt(col, 10) - 1);
            const position = Util.tabUnshiftForPoint(buffer, messPos);
            const myuri = path_1.isAbsolute(file) ? file : rootDir.getFile(file).getPath();
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaW5kZXguanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi9zcmMvZ2hjLW1vZC9pbmRleC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOztBQUFBLCtCQVFhO0FBQ2IsZ0NBQStCO0FBQy9CLCtCQUEwQztBQUMxQyx1Q0FBdUM7QUFDdkMsMkRBQTBDO0FBVTFDLG1GQUEwRTtBQUMxRSx5Q0FBd0M7QUFvQnhDLE1BQWEsY0FBYztJQWtCekIsWUFBb0IsVUFBcUM7UUFBckMsZUFBVSxHQUFWLFVBQVUsQ0FBMkI7UUFDdkQsSUFBSSxDQUFDLFdBQVcsR0FBRyxJQUFJLDBCQUFtQixFQUFFLENBQUE7UUFDNUMsSUFBSSxDQUFDLE9BQU8sR0FBRyxJQUFJLGNBQU8sRUFBRSxDQUFBO1FBQzVCLElBQUksQ0FBQyxXQUFXLENBQUMsR0FBRyxDQUFDLElBQUksQ0FBQyxPQUFPLENBQUMsQ0FBQTtRQUNsQyxJQUFJLENBQUMsWUFBWSxHQUFHLElBQUksT0FBTyxFQUFFLENBQUE7UUFDakMsSUFBSSxDQUFDLE9BQU8sR0FBRyxJQUFJLEdBQUcsRUFBRSxDQUFBO1FBRXhCLElBQ0UsT0FBTyxDQUFDLEdBQUcsQ0FBQyxnQkFBZ0I7WUFDNUIsQ0FBQyxJQUFJLENBQUMsTUFBTSxDQUFDLEdBQUcsQ0FBQywrQ0FBK0MsQ0FBQyxFQUNqRTtZQUNBLElBQUksQ0FBQyxrQkFBa0IsRUFBRSxDQUFBO1NBQzFCO1FBRUQsSUFBSSxDQUFDLGFBQWEsR0FBRztZQUNuQixTQUFTLEVBQUUsSUFBSSxLQUFLLENBQUMsQ0FBQyxDQUFDO1lBQ3ZCLE1BQU0sRUFBRSxJQUFJLEtBQUssQ0FBQyxJQUFJLENBQUMsTUFBTSxDQUFDLEdBQUcsQ0FBQyxvQ0FBb0MsQ0FBQyxDQUFDO1lBQ3hFLFFBQVEsRUFBRSxJQUFJLEtBQUssQ0FBQyxDQUFDLENBQUM7WUFDdEIsSUFBSSxFQUFFLElBQUksS0FBSyxDQUFDLENBQUMsQ0FBQztZQUNsQixJQUFJLEVBQUUsSUFBSSxLQUFLLENB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O0lBQ1osQ0FBQztDQUNGO0FBN2hCRCx3Q0E2aEJDIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IHtcbiAgUmFuZ2UsXG4gIFBvaW50LFxuICBFbWl0dGVyLFxuICBDb21wb3NpdGVEaXNwb3NhYmxlLFxuICBUZXh0QnVmZmVyLFxuICBEaXJlY3RvcnksXG4gIFRleHRFZGl0b3IsXG59IGZyb20gJ2F0b20nXG5pbXBvcnQgKiBhcyBVdGlsIGZyb20gJy4uL3V0aWwnXG5pbXBvcnQgeyBleHRuYW1lLCBpc0Fic29sdXRlIH0gZnJvbSAncGF0aCdcbmltcG9ydCBRdWV1ZSA9IHJlcXVpcmUoJ3Byb21pc2UtcXVldWUnKVxuaW1wb3J0IHsgdW5saXQgfSBmcm9tICdhdG9tLWhhc2tlbGwtdXRpbHMnXG5pbXBvcnQgKiBhcyBDb21wbGV0aW9uQmFja2VuZCBmcm9tICdhdG9tLWhhc2tlbGwtdXBpL2NvbXBsZXRpb24tYmFja2VuZCdcbmltcG9ydCAqIGFzIFVQSSBmcm9tICdhdG9tLWhhc2tlbGwtdXBpJ1xuXG5pbXBvcnQge1xuICBHaGNNb2RpUHJvY2Vzc1JlYWwsXG4gIEdIQ01vZENhcHMsXG4gIFJ1bkFyZ3MsXG4gIElFcnJvckNhbGxiYWNrQXJncyxcbn0gZnJvbSAnLi9naGMtbW9kaS1wcm9jZXNzLXJlYWwnXG5pbXBvcnQgeyBjcmVhdGVHaGNNb2RpUHJvY2Vzc1JlYWwgfSBmcm9tICcuL2doYy1tb2RpLXByb2Nlc3MtcmVhbC1mYWN0b3J5J1xuaW1wb3J0IHsgZ2V0U2V0dGluZ3MgfSBmcm9tICcuL3NldHRpbmdzJ1xuXG5leHBvcnQgeyBJRXJyb3JDYWxsYmFja0FyZ3MsIFJ1bkFyZ3MsIEdIQ01vZENhcHMgfVxuXG50eXBlIENvbW1hbmRzID1cbiAgfCAnY2hlY2tsaW50J1xuICB8ICdicm93c2UnXG4gIHwgJ3R5cGVpbmZvJ1xuICB8ICdmaW5kJ1xuICB8ICdpbml0J1xuICB8ICdsaXN0J1xuICB8ICdsb3dtZW0nXG5cbmV4cG9ydCBpbnRlcmZhY2UgU3ltYm9sRGVzYyB7XG4gIG5hbWU6IHN0cmluZ1xuICBzeW1ib2xUeXBlOiBDb21wbGV0aW9uQmFja2VuZC5TeW1ib2xUeXBlXG4gIHR5cGVTaWduYXR1cmU/OiBzdHJpbmdcbiAgcGFyZW50Pzogc3RyaW5nXG59XG5cbmV4cG9ydCBjbGFzcyBHaGNNb2RpUHJvY2VzcyB7XG4gIHByaXZhdGUgYmFja2VuZDogTWFwPHN0cmluZywgUHJvbWlzZTxHaGNNb2RpUHJvY2Vzc1JlYWw+PlxuICBwcml2YXRlIGRpc3Bvc2FibGVzOiBDb21wb3NpdGVEaXNwb3NhYmxlXG4gIHByaXZhdGUgZW1pdHRlcjogRW1pdHRlcjxcbiAgICB7XG4gICAgICAnZGlkLWRlc3Ryb3knOiB1bmRlZmluZWRcbiAgICAgICdiYWNrZW5kLWFjdGl2ZSc6IHVuZGVmaW5lZFxuICAgICAgJ2JhY2tlbmQtaWRsZSc6IHVuZGVmaW5lZFxuICAgIH0sXG4gICAge1xuICAgICAgd2FybmluZzogc3RyaW5nXG4gICAgICBlcnJvcjogSUVycm9yQ2FsbGJhY2tBcmdzXG4gICAgICAncXVldWUtaWRsZSc6IHsgcXVldWU6IENvbW1hbmRzIH1cbiAgICB9XG4gID5cbiAgcHJpdmF0ZSBidWZmZXJEaXJNYXA6IFdlYWtNYXA8VGV4dEJ1ZmZlciwgRGlyZWN0b3J5PlxuICBwcml2YXRlIGNvbW1hbmRRdWV1ZXM6IHsgW0sgaW4gQ29tbWFuZHNdOiBRdWV1ZSB9XG5cbiAgY29uc3RydWN0b3IocHJpdmF0ZSB1cGlQcm9taXNlOiBQcm9taXNlPFVQSS5JVVBJSW5zdGFuY2U+KSB7XG4gICAgdGhpcy5kaXNwb3NhYmxlcyA9IG5ldyBDb21wb3NpdGVEaXNwb3NhYmxlKClcbiAgICB0aGlzLmVtaXR0ZXIgPSBuZXcgRW1pdHRlcigpXG4gICAgdGhpcy5kaXNwb3NhYmxlcy5hZGQodGhpcy5lbWl0dGVyKVxuICAgIHRoaXMuYnVmZmVyRGlyTWFwID0gbmV3IFdlYWtNYXAoKVxuICAgIHRoaXMuYmFja2VuZCA9IG5ldyBNYXAoKVxuXG4gICAgaWYgKFxuICAgICAgcHJvY2Vzcy5lbnYuR0hDX1BBQ0tBR0VfUEFUSCAmJlxuICAgICAgIWF0b20uY29uZmlnLmdldCgnaGFza2VsbC1naGMtbW9kLnN1cHByZXNzR2hjUGFja2FnZVBhdGhXYXJuaW5nJylcbiAgICApIHtcbiAgICAgIFV0aWwud2FybkdIQ1BhY2thZ2VQYXRoKClcbiAgICB9XG5cbiAgICB0aGlzLmNvbW1hbmRRdWV1ZXMgPSB7XG4gICAgICBjaGVja2xpbnQ6IG5ldyBRdWV1ZSgyKSxcbiAgICAgIGJyb3dzZTogbmV3IFF1ZXVlKGF0b20uY29uZmlnLmdldCgnaGFza2VsbC1naGMtbW9kLm1heEJyb3dzZVByb2Nlc3NlcycpKSxcbiAgICAgIHR5cGVpbmZvOiBuZXcgUXVldWUoMSksXG4gICAgICBmaW5kOiBuZXcgUXVldWUoMSksXG4gICAgICBpbml0OiBuZXcgUXVldWUoNCksXG4gICAgICBsaXN0OiBuZXcgUXVldWUoMSksXG4gICAgICBsb3dtZW06IG5ldyBRdWV1ZSgxKSxcbiAgICB9XG4gICAgdGhpcy5kaXNwb3NhYmxlcy5hZGQoXG4gICAgICBhdG9tLmNvbmZpZy5vbkRpZENoYW5nZShcbiAgICAgICAgJ2hhc2tlbGwtZ2hjLW1vZC5tYXhCcm93c2VQcm9jZXNzZXMnLFxuICAgICAgICAoeyBuZXdWYWx1ZSB9KSA9PlxuICAgICAgICAgICh0aGlzLmNvbW1hbmRRdWV1ZXMuYnJvd3NlID0gbmV3IFF1ZXVlKG5ld1ZhbHVlIGFzIG51bWJlcikpLFxuICAgICAgKSxcbiAgICApXG4gIH1cblxuICBwdWJsaWMgYXN5bmMgZ2V0Um9vdERpcihidWZmZXI6IFRleHRCdWZmZXIpOiBQcm9taXNlPERpcmVjdG9yeT4ge1xuICAgIGxldCBkaXJcbiAgICBkaXIgPSB0aGlzLmJ1ZmZlckRpck1hcC5nZXQoYnVmZmVyKVxuICAgIGlmIChkaXIpIHtcbiAgICAgIHJldHVybiBkaXJcbiAgICB9XG4gICAgZGlyID0gYXdhaXQgVXRpbC5nZXRSb290RGlyKGJ1ZmZlcilcbiAgICB0aGlzLmJ1ZmZlckRpck1hcC5zZXQoYnVmZmVyLCBkaXIpXG4gICAgcmV0dXJuIGRpclxuICB9XG5cbiAgcHVibGljIGtpbGxQcm9jZXNzKCkge1xuICAgIGZvciAoY29uc3QgYnAgb2YgdGhpcy5iYWNrZW5kLnZhbHVlcygpKSB7XG4gICAgICBicC50aGVuKChiKSA9PiBiLmtpbGxQcm9jZXNzKCkpLmNhdGNoKChlOiBFcnJvcikgPT4ge1xuICAgICAgICBhdG9tLm5vdGlmaWNhdGlvbnMuYWRkRXJyb3IoJ0Vycm9yIGtpbGxpbmcgZ2hjLW1vZCBwcm9jZXNzJywge1xuICAgICAgICAgIGRldGFpbDogZS50b1N0cmluZygpLFxuICAgICAgICAgIHN0YWNrOiBlLnN0YWNrLFxuICAgICAgICAgIGRpc21pc3NhYmxlOiB0cnVlLFxuICAgICAgICB9KVxuICAgICAgfSlcbiAgICB9XG4gICAgdGhpcy5iYWNrZW5kLmNsZWFyKClcbiAgfVxuXG4gIHB1YmxpYyBkZXN0cm95KCkge1xuICAgIGZvciAoY29uc3QgYnAgb2YgdGhpcy5iYWNrZW5kLnZhbHVlcygpKSB7XG4gICAgICBicC50aGVuKChiKSA9PiBiLmRlc3Ryb3koKSkuY2F0Y2goKGU6IEVycm9yKSA9PiB7XG4gICAgICAgIGF0b20ubm90aWZpY2F0aW9ucy5hZGRFcnJvcignRXJyb3Iga2lsbGluZyBnaGMtbW9kIHByb2Nlc3MnLCB7XG4gICAgICAgICAgZGV0YWlsOiBlLnRvU3RyaW5nKCksXG4gICAgICAgICAgc3RhY2s6IGUuc3RhY2ssXG4gICAgICAgICAgZGlzbWlzc2FibGU6IHRydWUsXG4gICAgICAgIH0pXG4gICAgICB9KVxuICAgIH1cbiAgICB0aGlzLmJhY2tlbmQuY2xlYXIoKVxuICAgIHRoaXMuZW1pdHRlci5lbWl0KCdkaWQtZGVzdHJveScpXG4gICAgdGhpcy5kaXNwb3NhYmxlcy5kaXNwb3NlKClcbiAgfVxuXG4gIHB1YmxpYyBvbkRpZERlc3Ryb3koY2FsbGJhY2s6ICgpID0+IHZvaWQpIHtcbiAgICByZXR1cm4gdGhpcy5lbWl0dGVyLm9uKCdkaWQtZGVzdHJveScsIGNhbGxiYWNrKVxuICB9XG5cbiAgcHVibGljIG9uV2FybmluZyhjYWxsYmFjazogKHdhcm5pbmc6IHN0cmluZykgPT4gdm9pZCkge1xuICAgIHJldHVybiB0aGlzLmVtaXR0ZXIub24oJ3dhcm5pbmcnLCBjYWxsYmFjaylcbiAgfVxuXG4gIHB1YmxpYyBvbkVycm9yKGNhbGxiYWNrOiAoZXJyb3I6IElFcnJvckNhbGxiYWNrQXJncykgPT4gdm9pZCkge1xuICAgIHJldHVybiB0aGlzLmVtaXR0ZXIub24oJ2Vycm9yJywgY2FsbGJhY2spXG4gIH1cblxuICBwdWJsaWMgb25CYWNrZW5kQWN0aXZlKGNhbGxiYWNrOiAoKSA9PiB2b2lkKSB7XG4gICAgcmV0dXJuIHRoaXMuZW1pdHRlci5vbignYmFja2VuZC1hY3RpdmUnLCBjYWxsYmFjaylcbiAgfVxuXG4gIHB1YmxpYyBvbkJhY2tlbmRJZGxlKGNhbGxiYWNrOiAoKSA9PiB2b2lkKSB7XG4gICAgcmV0dXJuIHRoaXMuZW1pdHRlci5vbignYmFja2VuZC1pZGxlJywgY2FsbGJhY2spXG4gIH1cblxuICBwdWJsaWMgb25RdWV1ZUlkbGUoY2FsbGJhY2s6ICgpID0+IHZvaWQpIHtcbiAgICByZXR1cm4gdGhpcy5lbWl0dGVyLm9uKCdxdWV1ZS1pZGxlJywgY2FsbGJhY2spXG4gIH1cblxuICBwdWJsaWMgYXN5bmMgcnVuTGlzdChidWZmZXI6IFRleHRCdWZmZXIpIHtcbiAgICByZXR1cm4gdGhpcy5xdWV1ZUNtZCgnbGlzdCcsIGF3YWl0IHRoaXMuZ2V0Um9vdERpcihidWZmZXIpLCAoKSA9PiAoe1xuICAgICAgY29tbWFuZDogJ2xpc3QnLFxuICAgIH0pKVxuICB9XG5cbiAgcHVibGljIGFzeW5jIHJ1bkxhbmcoZGlyOiBEaXJlY3RvcnkpIHtcbiAgICByZXR1cm4gdGhpcy5xdWV1ZUNtZCgnaW5pdCcsIGRpciwgKCkgPT4gKHsgY29tbWFuZDogJ2xhbmcnIH0pKVxuICB9XG5cbiAgcHVibGljIGFzeW5jIHJ1bkZsYWcoZGlyOiBEaXJlY3RvcnkpIHtcbiAgICByZXR1cm4gdGhpcy5xdWV1ZUNtZCgnaW5pdCcsIGRpciwgKCkgPT4gKHsgY29tbWFuZDogJ2ZsYWcnIH0pKVxuICB9XG5cbiAgcHVibGljIGFzeW5jIHJ1bkJyb3dzZShcbiAgICByb290RGlyOiBEaXJlY3RvcnksXG4gICAgbW9kdWxlczogc3RyaW5nW10sXG4gICk6IFByb21pc2U8U3ltYm9sRGVzY1tdPiB7XG4gICAgY29uc3QgbGluZXMgPSBhd2FpdCB0aGlzLnF1ZXVlQ21kKCdicm93c2UnLCByb290RGlyLCAoY2FwcykgPT4ge1xuICAgICAgY29uc3QgYXJncyA9IGNhcHMuYnJvd3NlTWFpblxuICAgICAgICA/IG1vZHVsZXNcbiAgICAgICAgOiBtb2R1bGVzLmZpbHRlcigodikgPT4gdiAhPT0gJ01haW4nKVxuICAgICAgaWYgKGFyZ3MubGVuZ3RoID09PSAwKSByZXR1cm4gdW5kZWZpbmVkXG4gICAgICByZXR1cm4ge1xuICAgICAgICBjb21tYW5kOiAnYnJvd3NlJyxcbiAgICAgICAgZGFzaEFyZ3M6IGNhcHMuYnJvd3NlUGFyZW50cyA/IFsnLWQnLCAnLW8nLCAnLXAnXSA6IFsnLWQnLCAnLW8nXSxcbiAgICAgICAgYXJncyxcbiAgICAgIH1cbiAgICB9KVxuICAgIHJldHVybiBsaW5lcy5tYXAoKHMpID0+IHtcbiAgICAgIC8vIGVudW1Gcm9tIDo6IEVudW0gYSA9PiBhIC0+IFthXSAtLSBmcm9tOkVudW1cbiAgICAgIGNvbnN0IHBhdHRlcm4gPSAvXiguKj8pIDo6ICguKj8pKD86IC0tIGZyb206KC4qKSk/JC9cbiAgICAgIGNvbnN0IG1hdGNoID0gcy5tYXRjaChwYXR0ZXJuKVxuICAgICAgbGV0IG5hbWU6IHN0cmluZ1xuICAgICAgbGV0IHR5cGVTaWduYXR1cmU6IHN0cmluZyB8IHVuZGVmaW5lZFxuICAgICAgbGV0IHBhcmVudDogc3RyaW5nIHwgdW5kZWZpbmVkXG4gICAgICBpZiAobWF0Y2gpIHtcbiAgICAgICAgbmFtZSA9IG1hdGNoWzFdXG4gICAgICAgIHR5cGVTaWduYXR1cmUgPSBtYXRjaFsyXVxuICAgICAgICBwYXJlbnQgPSBtYXRjaFszXVxuICAgICAgfSBlbHNlIHtcbiAgICAgICAgbmFtZSA9IHNcbiAgICAgIH1cbiAgICAgIGxldCBzeW1ib2xUeXBlOiBDb21wbGV0aW9uQmFja2VuZC5TeW1ib2xUeXBlXG4gICAgICBpZiAodHlwZVNpZ25hdHVyZSAmJiAvXig/OnR5cGV8ZGF0YXxuZXd0eXBlKS8udGVzdCh0eXBlU2lnbmF0dXJlKSkge1xuICAgICAgICBzeW1ib2xUeXBlID0gJ3R5cGUnXG4gICAgICB9IGVsc2UgaWYgKHR5cGVTaWduYXR1cmUgJiYgL14oPzpjbGFzcykvLnRlc3QodHlwZVNpZ25hdHVyZSkpIHtcbiAgICAgICAgc3ltYm9sVHlwZSA9ICdjbGFzcydcbiAgICAgIH0gZWxzZSBpZiAoL15cXCguKlxcKSQvLnRlc3QobmFtZSkpIHtcbiAgICAgICAgc3ltYm9sVHlwZSA9ICdvcGVyYXRvcidcbiAgICAgICAgbmFtZSA9IG5hbWUuc2xpY2UoMSwgLTEpXG4gICAgICB9IGVsc2UgaWYgKFV0aWwuaXNVcHBlckNhc2UobmFtZVswXSkpIHtcbiAgICAgICAgc3ltYm9sVHlwZSA9ICd0YWcnXG4gICAgICB9IGVsc2Uge1xuICAgICAgICBzeW1ib2xUeXBlID0gJ2Z1bmN0aW9uJ1xuICAgICAgfVxuICAgICAgcmV0dXJuIHsgbmFtZSwgdHlwZVNpZ25hdHVyZSwgc3ltYm9sVHlwZSwgcGFyZW50IH1cbiAgICB9KVxuICB9XG5cbiAgcHVibGljIGFzeW5jIGdldFR5cGVJbkJ1ZmZlcihidWZmZXI6IFRleHRCdWZmZXIsIGNyYW5nZTogUmFuZ2UpIHtcbiAgICBpZiAoIWJ1ZmZlci5nZXRVcmkoKSkge1xuICAgICAgdGhyb3cgbmV3IEVycm9yKCdObyBVUkkgZm9yIGJ1ZmZlcicpXG4gICAgfVxuICAgIGNyYW5nZSA9IFV0aWwudGFiU2hpZnRGb3JSYW5nZShidWZmZXIsIGNyYW5nZSlcbiAgICBjb25zdCByb290RGlyID0gYXdhaXQgdGhpcy5nZXRSb290RGlyKGJ1ZmZlcilcbiAgICBjb25zdCBsaW5lcyA9IGF3YWl0IHRoaXMucXVldWVDbWQoJ3R5cGVpbmZvJywgcm9vdERpciwgKGNhcHMpID0+ICh7XG4gICAgICBpbnRlcmFjdGl2ZTogdHJ1ZSxcbiAgICAgIGNvbW1hbmQ6ICd0eXBlJyxcbiAgICAgIHVyaTogYnVmZmVyLmdldFVyaSgpLFxuICAgICAgdGV4dDogYnVmZmVyLmlzTW9kaWZpZWQoKSA/IGJ1ZmZlci5nZXRUZXh0KCkgOiB1bmRlZmluZWQsXG4gICAgICBkYXNoQXJnczogY2Fwcy50eXBlQ29uc3RyYWludHMgPyBbJy1jJ10gOiBbXSxcbiAgICAgIGFyZ3M6IFtjcmFuZ2Uuc3RhcnQucm93ICsgMSwgY3JhbmdlLnN0YXJ0LmNvbHVtbiArIDFdLm1hcCgodikgPT5cbiAgICAgICAgdi50b1N0cmluZygpLFxuICAgICAgKSxcbiAgICB9KSlcblxuICAgIGNvbnN0IHJ4ID0gL14oXFxkKylcXHMrKFxcZCspXFxzKyhcXGQrKVxccysoXFxkKylcXHMrXCIoW15dKilcIiQvIC8vIFteXSBiYXNpY2FsbHkgbWVhbnMgXCJhbnl0aGluZ1wiLCBpbmNsLiBuZXdsaW5lc1xuICAgIGZvciAoY29uc3QgbGluZSBvZiBsaW5lcykge1xuICAgICAgY29uc3QgbWF0Y2ggPSBsaW5lLm1hdGNoKHJ4KVxuICAgICAgaWYgKCFtYXRjaCkge1xuICAgICAgICBjb250aW51ZVxuICAgICAgfVxuICAgICAgY29uc3QgW3Jvd3N0YXJ0LCBjb2xzdGFydCwgcm93ZW5kLCBjb2xlbmQsIHR5cGVdID0gbWF0Y2guc2xpY2UoMSlcbiAgICAgIGNvbnN0IHJhbmdlID0gUmFuZ2UuZnJvbU9iamVjdChbXG4gICAgICAgIFtwYXJzZUludChyb3dzdGFydCwgMTApIC0gMSwgcGFyc2VJbnQoY29sc3RhcnQsIDEwKSAtIDFdLFxuICAgICAgICBbcGFyc2VJbnQocm93ZW5kLCAxMCkgLSAxLCBwYXJzZUludChjb2xlbmQsIDEwKSAtIDFdLFxuICAgICAgXSlcbiAgICAgIGlmIChyYW5nZS5pc0VtcHR5KCkpIHtcbiAgICAgICAgY29udGludWVcbiAgICAgIH1cbiAgICAgIGlmICghcmFuZ2UuY29udGFpbnNSYW5nZShjcmFuZ2UpKSB7XG4gICAgICAgIGNvbnRpbnVlXG4gICAgICB9XG4gICAgICByZXR1cm4ge1xuICAgICAgICByYW5nZTogVXRpbC50YWJVbnNoaWZ0Rm9yUmFuZ2UoYnVmZmVyLCByYW5nZSksXG4gICAgICAgIHR5cGU6IHR5cGUucmVwbGFjZSgvXFxcXFwiL2csICdcIicpLFxuICAgICAgfVxuICAgIH1cbiAgICB0aHJvdyBuZXcgRXJyb3IoJ05vIHR5cGUnKVxuICB9XG5cbiAgcHVibGljIGFzeW5jIGRvQ2FzZVNwbGl0KGJ1ZmZlcjogVGV4dEJ1ZmZlciwgY3JhbmdlOiBSYW5nZSkge1xuICAgIGlmICghYnVmZmVyLmdldFVyaSgpKSB7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoJ05vIFVSSSBmb3IgYnVmZmVyJylcbiAgICB9XG4gICAgY3JhbmdlID0gVXRpbC50YWJTaGlmdEZvclJhbmdlKGJ1ZmZlciwgY3JhbmdlKVxuICAgIGNvbnN0IHJvb3REaXIgPSBhd2FpdCB0aGlzLmdldFJvb3REaXIoYnVmZmVyKVxuICAgIGNvbnN0IGxpbmVzID0gYXdhaXQgdGhpcy5xdWV1ZUNtZCgndHlwZWluZm8nLCByb290RGlyLCAoY2FwcykgPT4gKHtcbiAgICAgIGludGVyYWN0aXZlOiBjYXBzLmludGVyYWN0aXZlQ2FzZVNwbGl0LFxuICAgICAgY29tbWFuZDogJ3NwbGl0JyxcbiAgICAgIHVyaTogYnVmZmVyLmdldFVyaSgpLFxuICAgICAgdGV4dDogYnVmZmVyLmlzTW9kaWZpZWQoKSA/IGJ1ZmZlci5nZXRUZXh0KCkgOiB1bmRlZmluZWQsXG4gICAgICBhcmdzOiBbY3JhbmdlLnN0YXJ0LnJvdyArIDEsIGNyYW5nZS5zdGFydC5jb2x1bW4gKyAxXS5tYXAoKHYpID0+XG4gICAgICAgIHYudG9TdHJpbmcoKSxcbiAgICAgICksXG4gICAgfSkpXG5cbiAgICBjb25zdCByeCA9IC9eKFxcZCspXFxzKyhcXGQrKVxccysoXFxkKylcXHMrKFxcZCspXFxzK1wiKFteXSopXCIkLyAvLyBbXl0gYmFzaWNhbGx5IG1lYW5zIFwiYW55dGhpbmdcIiwgaW5jbC4gbmV3bGluZXNcbiAgICBjb25zdCByZXMgPSBbXVxuICAgIGZvciAoY29uc3QgbGluZSBvZiBsaW5lcykge1xuICAgICAgY29uc3QgbWF0Y2ggPSBsaW5lLm1hdGNoKHJ4KVxuICAgICAgaWYgKCFtYXRjaCkge1xuICAgICAgICBVdGlsLndhcm4oYGdoYy1tb2Qgc2F5czogJHtsaW5lfWApXG4gICAgICAgIGNvbnRpbnVlXG4gICAgICB9XG4gICAgICBjb25zdCBbcm93c3RhcnQsIGNvbHN0YXJ0LCByb3dlbmQsIGNvbGVuZCwgdGV4dF0gPSBtYXRjaC5zbGljZSgxKVxuICAgICAgcmVzLnB1c2goe1xuICAgICAgICByYW5nZTogUmFuZ2UuZnJvbU9iamVjdChbXG4gICAgICAgICAgW3BhcnNlSW50KHJvd3N0YXJ0LCAxMCkgLSAxLCBwYXJzZUludChjb2xzdGFydCwgMTApIC0gMV0sXG4gICAgICAgICAgW3BhcnNlSW50KHJvd2VuZCwgMTApIC0gMSwgcGFyc2VJbnQoY29sZW5kLCAxMCkgLSAxXSxcbiAgICAgICAgXSksXG4gICAgICAgIHJlcGxhY2VtZW50OiB0ZXh0LFxuICAgICAgfSlcbiAgICB9XG4gICAgcmV0dXJuIHJlc1xuICB9XG5cbiAgcHVibGljIGFzeW5jIGRvU2lnRmlsbChidWZmZXI6IFRleHRCdWZmZXIsIGNyYW5nZTogUmFuZ2UpIHtcbiAgICBpZiAoIWJ1ZmZlci5nZXRVcmkoKSkge1xuICAgICAgdGhyb3cgbmV3IEVycm9yKCdObyBVUkkgZm9yIGJ1ZmZlcicpXG4gICAgfVxuICAgIGNyYW5nZSA9IFV0aWwudGFiU2hpZnRGb3JSYW5nZShidWZmZXIsIGNyYW5nZSlcbiAgICBjb25zdCByb290RGlyID0gYXdhaXQgdGhpcy5nZXRSb290RGlyKGJ1ZmZlcilcbiAgICBjb25zdCBsaW5lcyA9IGF3YWl0IHRoaXMucXVldWVDbWQoJ3R5cGVpbmZvJywgcm9vdERpciwgKGNhcHMpID0+ICh7XG4gICAgICBpbnRlcmFjdGl2ZTogY2Fwcy5pbnRlcmFjdGl2ZUNhc2VTcGxpdCxcbiAgICAgIGNvbW1hbmQ6ICdzaWcnLFxuICAgICAgdXJpOiBidWZmZXIuZ2V0VXJpKCksXG4gICAgICB0ZXh0OiBidWZmZXIuaXNNb2RpZmllZCgpID8gYnVmZmVyLmdldFRleHQoKSA6IHVuZGVmaW5lZCxcbiAgICAgIGFyZ3M6IFtjcmFuZ2Uuc3RhcnQucm93ICsgMSwgY3JhbmdlLnN0YXJ0LmNvbHVtbiArIDFdLm1hcCgodikgPT5cbiAgICAgICAgdi50b1N0cmluZygpLFxuICAgICAgKSxcbiAgICB9KSlcbiAgICBpZiAobGluZXMubGVuZ3RoIDwgMikge1xuICAgICAgdGhyb3cgbmV3IEVycm9yKGBDb3VsZCBub3QgdW5kZXJzdGFuZCByZXNwb25zZTogJHtsaW5lcy5qb2luKCdcXG4nKX1gKVxuICAgIH1cbiAgICBjb25zdCByeCA9IC9eKFxcZCspXFxzKyhcXGQrKVxccysoXFxkKylcXHMrKFxcZCspJC8gLy8gcG9zaXRpb24gcnhcbiAgICBjb25zdCBtYXRjaCA9IGxpbmVzWzFdLm1hdGNoKHJ4KVxuICAgIGlmICghbWF0Y2gpIHtcbiAgICAgIHRocm93IG5ldyBFcnJvcihgQ291bGQgbm90IHVuZGVyc3RhbmQgcmVzcG9uc2U6ICR7bGluZXMuam9pbignXFxuJyl9YClcbiAgICB9XG4gICAgY29uc3QgW3Jvd3N0YXJ0LCBjb2xzdGFydCwgcm93ZW5kLCBjb2xlbmRdID0gbWF0Y2guc2xpY2UoMSlcbiAgICBjb25zdCByYW5nZSA9IFJhbmdlLmZyb21PYmplY3QoW1xuICAgICAgW3BhcnNlSW50KHJvd3N0YXJ0LCAxMCkgLSAxLCBwYXJzZUludChjb2xzdGFydCwgMTApIC0gMV0sXG4gICAgICBbcGFyc2VJbnQocm93ZW5kLCAxMCkgLSAxLCBwYXJzZUludChjb2xlbmQsIDEwKSAtIDFdLFxuICAgIF0pXG4gICAgcmV0dXJuIHtcbiAgICAgIHR5cGU6IGxpbmVzWzBdLFxuICAgICAgcmFuZ2UsXG4gICAgICBib2R5OiBsaW5lcy5zbGljZSgyKS5qb2luKCdcXG4nKSxcbiAgICB9XG4gIH1cblxuICBwdWJsaWMgYXN5bmMgZ2V0SW5mb0luQnVmZmVyKGVkaXRvcjogVGV4dEVkaXRvciwgY3JhbmdlOiBSYW5nZSkge1xuICAgIGNvbnN0IGJ1ZmZlciA9IGVkaXRvci5nZXRCdWZmZXIoKVxuICAgIGlmICghYnVmZmVyLmdldFVyaSgpKSB7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoJ05vIFVSSSBmb3IgYnVmZmVyJylcbiAgICB9XG4gICAgY29uc3Qgc3ltSW5mbyA9IFV0aWwuZ2V0U3ltYm9sSW5SYW5nZShlZGl0b3IsIGNyYW5nZSlcbiAgICBpZiAoIXN5bUluZm8pIHtcbiAgICAgIHRocm93IG5ldyBFcnJvcihcIkNvdWxkbid0IGdldCBzeW1ib2wgZm9yIGluZm9cIilcbiAgICB9XG4gICAgY29uc3QgeyBzeW1ib2wsIHJhbmdlIH0gPSBzeW1JbmZvXG5cbiAgICBjb25zdCBsaW5lcyA9IGF3YWl0IHRoaXMucXVldWVDbWQoXG4gICAgICAndHlwZWluZm8nLFxuICAgICAgYXdhaXQgdGhpcy5nZXRSb290RGlyKGJ1ZmZlciksXG4gICAgICAoKSA9PiAoe1xuICAgICAgICBpbnRlcmFjdGl2ZTogdHJ1ZSxcbiAgICAgICAgY29tbWFuZDogJ2luZm8nLFxuICAgICAgICB1cmk6IGJ1ZmZlci5nZXRVcmkoKSxcbiAgICAgICAgdGV4dDogYnVmZmVyLmlzTW9kaWZpZWQoKSA/IGJ1ZmZlci5nZXRUZXh0KCkgOiB1bmRlZmluZWQsXG4gICAgICAgIGFyZ3M6IFtzeW1ib2xdLFxuICAgICAgfSksXG4gICAgKVxuXG4gICAgY29uc3QgaW5mbyA9IGxpbmVzLmpvaW4oJ1xcbicpXG4gICAgaWYgKGluZm8gPT09ICdDYW5ub3Qgc2hvdyBpbmZvJyB8fCAhaW5mbykge1xuICAgICAgdGhyb3cgbmV3IEVycm9yKCdObyBpbmZvJylcbiAgICB9IGVsc2Uge1xuICAgICAgcmV0dXJuIHsgcmFuZ2UsIGluZm8gfVxuICAgIH1cbiAgfVxuXG4gIHB1YmxpYyBhc3luYyBmaW5kU3ltYm9sUHJvdmlkZXJzSW5CdWZmZXIoZWRpdG9yOiBUZXh0RWRpdG9yLCBjcmFuZ2U6IFJhbmdlKSB7XG4gICAgY29uc3QgYnVmZmVyID0gZWRpdG9yLmdldEJ1ZmZlcigpXG4gICAgY29uc3Qgc3ltSW5mbyA9IFV0aWwuZ2V0U3ltYm9sSW5SYW5nZShlZGl0b3IsIGNyYW5nZSlcbiAgICBpZiAoIXN5bUluZm8pIHtcbiAgICAgIHRocm93IG5ldyBFcnJvcihcIkNvdWxkbid0IGdldCBzeW1ib2wgZm9yIGltcG9ydFwiKVxuICAgIH1cbiAgICBjb25zdCB7IHN5bWJvbCB9ID0gc3ltSW5mb1xuXG4gICAgcmV0dXJuIHRoaXMucXVldWVDbWQoJ2ZpbmQnLCBhd2FpdCB0aGlzLmdldFJvb3REaXIoYnVmZmVyKSwgKCkgPT4gKHtcbiAgICAgIGludGVyYWN0aXZlOiB0cnVlLFxuICAgICAgY29tbWFuZDogJ2ZpbmQnLFxuICAgICAgYXJnczogW3N5bWJvbF0sXG4gICAgfSkpXG4gIH1cblxuICBwdWJsaWMgYXN5bmMgZG9DaGVja0J1ZmZlcihidWZmZXI6IFRleHRCdWZmZXIsIGZhc3Q6IGJvb2xlYW4pIHtcbiAgICByZXR1cm4gdGhpcy5kb0NoZWNrT3JMaW50QnVmZmVyKCdjaGVjaycsIGJ1ZmZlciwgZmFzdClcbiAgfVxuXG4gIHB1YmxpYyBhc3luYyBkb0xpbnRCdWZmZXIoYnVmZmVyOiBUZXh0QnVmZmVyKSB7XG4gICAgcmV0dXJuIHRoaXMuZG9DaGVja09yTGludEJ1ZmZlcignbGludCcsIGJ1ZmZlciwgZmFsc2UpXG4gIH1cblxuICBwcml2YXRlIGFzeW5jIGdldFVQSSgpIHtcbiAgICByZXR1cm4gUHJvbWlzZS5yYWNlKFt0aGlzLnVwaVByb21pc2UsIFByb21pc2UucmVzb2x2ZSh1bmRlZmluZWQpXSlcbiAgfVxuXG4gIHByaXZhdGUgYXN5bmMgaW5pdEJhY2tlbmQocm9vdERpcjogRGlyZWN0b3J5KTogUHJvbWlzZTxHaGNNb2RpUHJvY2Vzc1JlYWw+IHtcbiAgICBjb25zdCByb290UGF0aCA9IHJvb3REaXIuZ2V0UGF0aCgpXG4gICAgY29uc3QgY2FjaGVkID0gdGhpcy5iYWNrZW5kLmdldChyb290UGF0aClcbiAgICBpZiAoY2FjaGVkKSB7XG4gICAgICByZXR1cm4gY2FjaGVkXG4gICAgfVxuICAgIGNvbnN0IGJhY2tlbmQgPSB0aGlzLmNyZWF0ZUJhY2tlbmQocm9vdERpcilcbiAgICB0aGlzLmJhY2tlbmQuc2V0KHJvb3RQYXRoLCBiYWNrZW5kKVxuICAgIHJldHVybiBiYWNrZW5kXG4gIH1cblxuICBwcml2YXRlIGFzeW5jIGNyZWF0ZUJhY2tlbmQocm9vdERpcjogRGlyZWN0b3J5KTogUHJvbWlzZTxHaGNNb2RpUHJvY2Vzc1JlYWw+IHtcbiAgICBjb25zdCBuZXdCYWNrZW5kID0gY3JlYXRlR2hjTW9kaVByb2Nlc3NSZWFsKHJvb3REaXIsIGF3YWl0IHRoaXMuZ2V0VVBJKCkpXG4gICAgY29uc3QgYmFja2VuZCA9IGF3YWl0IG5ld0JhY2tlbmRcbiAgICB0aGlzLmRpc3Bvc2FibGVzLmFkZChcbiAgICAgIGJhY2tlbmQub25FcnJvcigoYXJnKSA9PiB0aGlzLmVtaXR0ZXIuZW1pdCgnZXJyb3InLCBhcmcpKSxcbiAgICAgIGJhY2tlbmQub25XYXJuaW5nKChhcmcpID0+IHRoaXMuZW1pdHRlci5lbWl0KCd3YXJuaW5nJywgYXJnKSksXG4gICAgKVxuICAgIHJldHVybiBiYWNrZW5kXG4gIH1cblxuICBwcml2YXRlIGFzeW5jIHF1ZXVlQ21kKFxuICAgIHF1ZXVlTmFtZTogQ29tbWFuZHMsXG4gICAgZGlyOiBEaXJlY3RvcnksXG4gICAgcnVuQXJnc0Z1bmM6IChcbiAgICAgIGNhcHM6IEdIQ01vZENhcHMsXG4gICAgKSA9PlxuICAgICAgfCB7XG4gICAgICAgICAgY29tbWFuZDogc3RyaW5nXG4gICAgICAgICAgdGV4dD86IHN0cmluZ1xuICAgICAgICAgIHVyaT86IHN0cmluZ1xuICAgICAgICAgIGludGVyYWN0aXZlPzogYm9vbGVhblxuICAgICAgICAgIGRhc2hBcmdzPzogc3RyaW5nW11cbiAgICAgICAgICBhcmdzPzogc3RyaW5nW11cbiAgICAgICAgfVxuICAgICAgfCB1bmRlZmluZWQsXG4gICk6IFByb21pc2U8c3RyaW5nW10+IHtcbiAgICBpZiAoYXRvbS5jb25maWcuZ2V0KCdoYXNrZWxsLWdoYy1tb2QubG93TWVtb3J5U3lzdGVtJykpIHtcbiAgICAgIHF1ZXVlTmFtZSA9ICdsb3dtZW0nXG4gICAgfVxuICAgIGNvbnN0IGJhY2tlbmQgPSBhd2FpdCB0aGlzLmluaXRCYWNrZW5kKGRpcilcbiAgICBjb25zdCBwcm9taXNlID0gdGhpcy5jb21tYW5kUXVldWVzW3F1ZXVlTmFtZV0uYWRkKGFzeW5jICgpID0+IHtcbiAgICAgIHRoaXMuZW1pdHRlci5lbWl0KCdiYWNrZW5kLWFjdGl2ZScpXG4gICAgICB0cnkge1xuICAgICAgICBjb25zdCBzZXR0aW5ncyA9IGF3YWl0IGdldFNldHRpbmdzKGRpcilcbiAgICAgICAgaWYgKHNldHRpbmdzLmRpc2FibGUpIHtcbiAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoJ0doYy1tb2QgZGlzYWJsZWQgaW4gc2V0dGluZ3MnKVxuICAgICAgICB9XG4gICAgICAgIGNvbnN0IHJ1bkFyZ3MgPSBydW5BcmdzRnVuYyhiYWNrZW5kLmdldENhcHMoKSlcbiAgICAgICAgaWYgKHJ1bkFyZ3MgPT09IHVuZGVmaW5lZCkgcmV0dXJuIFtdXG4gICAgICAgIGNvbnN0IHVwaSA9IGF3YWl0IHRoaXMuZ2V0VVBJKClcbiAgICAgICAgbGV0IGJ1aWxkZXI6IHN0cmluZyB8IHVuZGVmaW5lZFxuICAgICAgICBpZiAodXBpICYmIGF0b20uY29uZmlnLmdldCgnaGFza2VsbC1naGMtbW9kLmJ1aWxkZXJNYW5hZ2VtZW50JykpIHtcbiAgICAgICAgICAvLyBUT0RPOiB0aGlzIGlzIHVzZWQgdHdpY2UsIHRoZSBzZWNvbmQgdGltZSBpbiBnaGMtbW9kLXByb2Nlc3MtcmVhbC1mYWN0b3J5LnRzLCBzaG91bGQgcHJvYmFibHkgZml4IHRoYXRcbiAgICAgICAgICBjb25zdCBiID0gYXdhaXQgdXBpLmdldE90aGVyc0NvbmZpZ1BhcmFtPHsgbmFtZTogc3RyaW5nIH0+KFxuICAgICAgICAgICAgJ2lkZS1oYXNrZWxsLWNhYmFsJyxcbiAgICAgICAgICAgICdidWlsZGVyJyxcbiAgICAgICAgICApXG4gICAgICAgICAgaWYgKGIpIGJ1aWxkZXIgPSBiLm5hbWVcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gYmFja2VuZC5ydW4oe1xuICAgICAgICAgIC4uLnJ1bkFyZ3MsXG4gICAgICAgICAgYnVpbGRlcixcbiAgICAgICAgICBzdXBwcmVzc0Vycm9yczogc2V0dGluZ3Muc3VwcHJlc3NFcnJvcnMsXG4gICAgICAgICAgZ2hjT3B0aW9uczogc2V0dGluZ3MuZ2hjT3B0aW9ucyxcbiAgICAgICAgICBnaGNNb2RPcHRpb25zOiBzZXR0aW5ncy5naGNNb2RPcHRpb25zLFxuICAgICAgICB9KVxuICAgICAgfSBjYXRjaCAoZXJyKSB7XG4gICAgICAgIFV0aWwud2FybihlcnIpXG4gICAgICAgIHRocm93IGVyclxuICAgICAgfVxuICAgIH0pXG4gICAgcHJvbWlzZVxuICAgICAgLnRoZW4oKCkgPT4ge1xuICAgICAgICBjb25zdCBxZSA9IChxbjogQ29tbWFuZHMpID0+IHtcbiAgICAgICAgICBjb25zdCBxID0gdGhpcy5jb21tYW5kUXVldWVzW3FuXVxuICAgICAgICAgIHJldHVybiBxLmdldFF1ZXVlTGVuZ3RoKCkgKyBxLmdldFBlbmRpbmdMZW5ndGgoKSA9PT0gMFxuICAgICAgICB9XG4gICAgICAgIGlmIChxZShxdWV1ZU5hbWUpKSB7XG4gICAgICAgICAgdGhpcy5lbWl0dGVyLmVtaXQoJ3F1ZXVlLWlkbGUnLCB7IHF1ZXVlOiBxdWV1ZU5hbWUgfSlcbiAgICAgICAgICBpZiAoT2JqZWN0LmtleXModGhpcy5jb21tYW5kUXVldWVzKS5ldmVyeShxZSkpIHtcbiAgICAgICAgICAgIHRoaXMuZW1pdHRlci5lbWl0KCdiYWNrZW5kLWlkbGUnKVxuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgfSlcbiAgICAgIC5jYXRjaCgoZTogRXJyb3IpID0+IHtcbiAgICAgICAgYXRvbS5ub3RpZmljYXRpb25zLmFkZEVycm9yKCdFcnJvciBpbiBHSENNb2QgY29tbWFuZCBxdWV1ZScsIHtcbiAgICAgICAgICBkZXRhaWw6IGUudG9TdHJpbmcoKSxcbiAgICAgICAgICBzdGFjazogZS5zdGFjayxcbiAgICAgICAgICBkaXNtaXNzYWJsZTogdHJ1ZSxcbiAgICAgICAgfSlcbiAgICAgIH0pXG4gICAgcmV0dXJuIHByb21pc2VcbiAgfVxuXG4gIHByaXZhdGUgYXN5bmMgZG9DaGVja09yTGludEJ1ZmZlcihcbiAgICBjbWQ6ICdjaGVjaycgfCAnbGludCcsXG4gICAgYnVmZmVyOiBUZXh0QnVmZmVyLFxuICAgIGZhc3Q6IGJvb2xlYW4sXG4gICkge1xuICAgIGxldCBkYXNoQXJnc1xuICAgIGlmIChidWZmZXIuaXNFbXB0eSgpKSB7XG4gICAgICByZXR1cm4gW11cbiAgICB9XG4gICAgaWYgKCFidWZmZXIuZ2V0VXJpKCkpIHtcbiAgICAgIHJldHVybiBbXVxuICAgIH1cblxuICAgIC8vIEEgZGlydHkgaGFjayB0byBtYWtlIGxpbnQgd29yayB3aXRoIGxoc1xuICAgIGxldCB1cmkgPSBidWZmZXIuZ2V0VXJpKClcbiAgICBjb25zdCBvbGR1cmkgPSBidWZmZXIuZ2V0VXJpKClcbiAgICBsZXQgdGV4dDogc3RyaW5nIHwgdW5kZWZpbmVkXG4gICAgdHJ5IHtcbiAgICAgIGlmIChjbWQgPT09ICdsaW50JyAmJiBleHRuYW1lKHVyaSkgPT09ICcubGhzJykge1xuICAgICAgICB1cmkgPSB1cmkuc2xpY2UoMCwgLTEpXG4gICAgICAgIHRleHQgPSBhd2FpdCB1bmxpdChvbGR1cmksIGJ1ZmZlci5nZXRUZXh0KCkpXG4gICAgICB9IGVsc2UgaWYgKGJ1ZmZlci5pc01vZGlmaWVkKCkpIHtcbiAgICAgICAgdGV4dCA9IGJ1ZmZlci5nZXRUZXh0KClcbiAgICAgIH1cbiAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgLy8gVE9ETzogUmVqZWN0XG4gICAgICBjb25zdCBtID0gKGVycm9yIGFzIEVycm9yKS5tZXNzYWdlLm1hdGNoKC9eKC4qPyk6KFswLTldKyk6ICooLiopICokLylcbiAgICAgIGlmICghbSkge1xuICAgICAgICB0aHJvdyBlcnJvclxuICAgICAgfVxuICAgICAgY29uc3QgW3VyaTIsIGxpbmUsIG1lc3NdID0gbS5zbGljZSgxKVxuICAgICAgcmV0dXJuIFtcbiAgICAgICAge1xuICAgICAgICAgIHVyaTogdXJpMixcbiAgICAgICAgICBwb3NpdGlvbjogbmV3IFBvaW50KHBhcnNlSW50KGxpbmUsIDEwKSAtIDEsIDApLFxuICAgICAgICAgIG1lc3NhZ2U6IG1lc3MsXG4gICAgICAgICAgc2V2ZXJpdHk6ICdsaW50JyxcbiAgICAgICAgfSxcbiAgICAgIF1cbiAgICB9XG4gICAgLy8gZW5kIG9mIGRpcnR5IGhhY2tcblxuICAgIC8vIHRzbGludDpkaXNhYmxlLW5leHQtbGluZTogdG90YWxpdHktY2hlY2tcbiAgICBpZiAoY21kID09PSAnbGludCcpIHtcbiAgICAgIGNvbnN0IG9wdHM6IHN0cmluZ1tdID0gYXRvbS5jb25maWcuZ2V0KCdoYXNrZWxsLWdoYy1tb2QuaGxpbnRPcHRpb25zJylcbiAgICAgIGRhc2hBcmdzID0gW11cbiAgICAgIGZvciAoY29uc3Qgb3B0IG9mIG9wdHMpIHtcbiAgICAgICAgZGFzaEFyZ3MucHVzaCgnLS1obGludE9wdCcsIG9wdClcbiAgICAgIH1cbiAgICB9XG5cbiAgICBjb25zdCByb290RGlyID0gYXdhaXQgdGhpcy5nZXRSb290RGlyKGJ1ZmZlcilcblxuICAgIGNvbnN0IHRleHRCID0gdGV4dFxuICAgIGNvbnN0IGRhc2hBcmdzQiA9IGRhc2hBcmdzXG4gICAgY29uc3QgbGluZXMgPSBhd2FpdCB0aGlzLnF1ZXVlQ21kKCdjaGVja2xpbnQnLCByb290RGlyLCAoKSA9PiAoe1xuICAgICAgaW50ZXJhY3RpdmU6IGZhc3QsXG4gICAgICBjb21tYW5kOiBjbWQsXG4gICAgICB1cmksXG4gICAgICB0ZXh0OiB0ZXh0QixcbiAgICAgIGRhc2hBcmdzOiBkYXNoQXJnc0IsXG4gICAgfSkpXG5cbiAgICBjb25zdCByeCA9IC9eKC4qPyk6KFswLTlcXHNdKyk6KFswLTlcXHNdKyk6ICooPzooV2FybmluZ3xFcnJvcik6ICopPyhbXl0qKS9cbiAgICBjb25zdCByZXMgPSBbXVxuICAgIGZvciAoY29uc3QgbGluZSBvZiBsaW5lcykge1xuICAgICAgY29uc3QgbWF0Y2ggPSBsaW5lLm1hdGNoKHJ4KVxuICAgICAgaWYgKCFtYXRjaCkge1xuICAgICAgICBpZiAobGluZS50cmltKCkubGVuZ3RoKSB7XG4gICAgICAgICAgVXRpbC53YXJuKGBnaGMtbW9kIHNheXM6ICR7bGluZX1gKVxuICAgICAgICB9XG4gICAgICAgIGNvbnRpbnVlXG4gICAgICB9XG4gICAgICBjb25zdCBbZmlsZTIsIHJvdywgY29sLCB3YXJuaW5nLCBtZXNzYWdlXSA9IG1hdGNoLnNsaWNlKDEpXG4gICAgICBpZiAoZmlsZTIgPT09ICdEdW1teScgJiYgcm93ID09PSAnMCcgJiYgY29sID09PSAnMCcpIHtcbiAgICAgICAgaWYgKHdhcm5pbmcgPT09ICdFcnJvcicpIHtcbiAgICAgICAgICB0aGlzLmVtaXR0ZXIuZW1pdCgnZXJyb3InLCB7XG4gICAgICAgICAgICBlcnI6IFV0aWwubWtFcnJvcignR0hDTW9kU3Rkb3V0RXJyb3InLCBtZXNzYWdlKSxcbiAgICAgICAgICAgIGNhcHM6IChhd2FpdCB0aGlzLmluaXRCYWNrZW5kKHJvb3REaXIpKS5nZXRDYXBzKCksIC8vIFRPRE86IFRoaXMgaXMgbm90IHByZXR0eVxuICAgICAgICAgIH0pXG4gICAgICAgICAgY29udGludWVcbiAgICAgICAgfSBlbHNlIGlmICh3YXJuaW5nID09PSAnV2FybmluZycpIHtcbiAgICAgICAgICB0aGlzLmVtaXR0ZXIuZW1pdCgnd2FybmluZycsIG1lc3NhZ2UpXG4gICAgICAgICAgY29udGludWVcbiAgICAgICAgfVxuICAgICAgfVxuXG4gICAgICBjb25zdCBmaWxlID0gdXJpLmVuZHNXaXRoKGZpbGUyKSA/IG9sZHVyaSA6IGZpbGUyXG4gICAgICBjb25zdCBzZXZlcml0eSA9XG4gICAgICAgIGNtZCA9PT0gJ2xpbnQnID8gJ2xpbnQnIDogd2FybmluZyA9PT0gJ1dhcm5pbmcnID8gJ3dhcm5pbmcnIDogJ2Vycm9yJ1xuICAgICAgY29uc3QgbWVzc1BvcyA9IG5ldyBQb2ludChwYXJzZUludChyb3csIDEwKSAtIDEsIHBhcnNlSW50KGNvbCwgMTApIC0gMSlcbiAgICAgIGNvbnN0IHBvc2l0aW9uID0gVXRpbC50YWJVbnNoaWZ0Rm9yUG9pbnQoYnVmZmVyLCBtZXNzUG9zKVxuICAgICAgY29uc3QgbXl1cmkgPSBpc0Fic29sdXRlKGZpbGUpID8gZmlsZSA6IHJvb3REaXIuZ2V0RmlsZShmaWxlKS5nZXRQYXRoKClcbiAgICAgIHJlcy5wdXNoKHtcbiAgICAgICAgdXJpOiBteXVyaSxcbiAgICAgICAgcG9zaXRpb24sXG4gICAgICAgIG1lc3NhZ2UsXG4gICAgICAgIHNldmVyaXR5LFxuICAgICAgfSlcbiAgICB9XG4gICAgcmV0dXJuIHJlc1xuICB9XG59XG4iXX0=