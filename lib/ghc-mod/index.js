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
    async doCheckAndLint(buffer, fast) {
        const [cr, lr] = await Promise.all([
            this.doCheckBuffer(buffer, fast),
            this.doLintBuffer(buffer),
        ]);
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaW5kZXguanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi9zcmMvZ2hjLW1vZC9pbmRleC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOztBQUFBLCtCQVFhO0FBQ2IsZ0NBQStCO0FBQy9CLCtCQUE4QjtBQUM5Qix1Q0FBdUM7QUFDdkMsMkRBQTBDO0FBVTFDLG1GQUEwRTtBQUMxRSx5Q0FBd0M7QUFvQnhDO0lBa0JFLFlBQW9CLFVBQXFDO1FBQXJDLGVBQVUsR0FBVixVQUFVLENBQTJCO1FBQ3ZELElBQUksQ0FBQyxXQUFXLEdBQUcsSUFBSSwwQkFBbUIsRUFBRSxDQUFBO1FBQzVDLElBQUksQ0FBQyxPQUFPLEdBQUcsSUFBSSxjQUFPLEVBQUUsQ0FBQTtRQUM1QixJQUFJLENBQUMsV0FBVyxDQUFDLEdBQUcsQ0FBQyxJQUFJLENBQUMsT0FBTyxDQUFDLENBQUE7UUFDbEMsSUFBSSxDQUFDLFlBQVksR0FBRyxJQUFJLE9BQU8sRUFBRSxDQUFBO1FBQ2pDLElBQUksQ0FBQyxPQUFPLEdBQUcsSUFBSSxHQUFHLEVBQUUsQ0FBQTtRQUV4QixFQUFFLENBQUMsQ0FDRCxPQUFPLENBQUMsR0FBRyxDQUFDLGdCQUFnQjtZQUM1QixDQUFDLElBQUksQ0FBQyxNQUFNLENBQUMsR0FBRyxDQUFDLCtDQUErQyxDQUNsRSxDQUFDLENBQUMsQ0FBQztZQUNELElBQUksQ0FBQyxrQkFBa0IsRUFBRSxDQUFBO1FBQzNCLENBQUM7UUFFRCxJQUFJLENBQUMsYUFBYSxHQUFHO1lBQ25CLFNBQVMsRUFBRSxJQUFJLEtBQUssQ0FBQyxDQUFDLENBQUM7WUFDdkIsTUFBTSxFQUFFLElBQUksS0FBSyxDQUFDLElBQUksQ0FBQyxNQUFNLENBQUMsR0FBRyxDQUFDLG9DQUFvQyxDQUFDLENBQUM7WUFDeEUsUUFBUSxFQUFFLElBQUksS0FBSyxDQUFDLENBQUMsQ0FBQztZQUN0QixJQUFJLEVBQUUsSUFBSSxLQUFLLENBQUMsQ0FBQyxDQUFDO1lBQ2xCLElBQUksRUFB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LENBQUE7UUFDSixDQUFDO1FBQ0QsTUFBTSxDQUFDLEdBQUcsQ0FBQTtJQUNaLENBQUM7Q0FDRjtBQTFpQkQsd0NBMGlCQyIsInNvdXJjZXNDb250ZW50IjpbImltcG9ydCB7XG4gIFJhbmdlLFxuICBQb2ludCxcbiAgRW1pdHRlcixcbiAgQ29tcG9zaXRlRGlzcG9zYWJsZSxcbiAgVGV4dEJ1ZmZlcixcbiAgRGlyZWN0b3J5LFxuICBUZXh0RWRpdG9yLFxufSBmcm9tICdhdG9tJ1xuaW1wb3J0ICogYXMgVXRpbCBmcm9tICcuLi91dGlsJ1xuaW1wb3J0IHsgZXh0bmFtZSB9IGZyb20gJ3BhdGgnXG5pbXBvcnQgUXVldWUgPSByZXF1aXJlKCdwcm9taXNlLXF1ZXVlJylcbmltcG9ydCB7IHVubGl0IH0gZnJvbSAnYXRvbS1oYXNrZWxsLXV0aWxzJ1xuaW1wb3J0ICogYXMgQ29tcGxldGlvbkJhY2tlbmQgZnJvbSAnYXRvbS1oYXNrZWxsLXVwaS9jb21wbGV0aW9uLWJhY2tlbmQnXG5pbXBvcnQgKiBhcyBVUEkgZnJvbSAnYXRvbS1oYXNrZWxsLXVwaSdcblxuaW1wb3J0IHtcbiAgR2hjTW9kaVByb2Nlc3NSZWFsLFxuICBHSENNb2RDYXBzLFxuICBSdW5BcmdzLFxuICBJRXJyb3JDYWxsYmFja0FyZ3MsXG59IGZyb20gJy4vZ2hjLW1vZGktcHJvY2Vzcy1yZWFsJ1xuaW1wb3J0IHsgY3JlYXRlR2hjTW9kaVByb2Nlc3NSZWFsIH0gZnJvbSAnLi9naGMtbW9kaS1wcm9jZXNzLXJlYWwtZmFjdG9yeSdcbmltcG9ydCB7IGdldFNldHRpbmdzIH0gZnJvbSAnLi9zZXR0aW5ncydcblxuZXhwb3J0IHsgSUVycm9yQ2FsbGJhY2tBcmdzLCBSdW5BcmdzLCBHSENNb2RDYXBzIH1cblxudHlwZSBDb21tYW5kcyA9XG4gIHwgJ2NoZWNrbGludCdcbiAgfCAnYnJvd3NlJ1xuICB8ICd0eXBlaW5mbydcbiAgfCAnZmluZCdcbiAgfCAnaW5pdCdcbiAgfCAnbGlzdCdcbiAgfCAnbG93bWVtJ1xuXG5leHBvcnQgaW50ZXJmYWNlIFN5bWJvbERlc2Mge1xuICBuYW1lOiBzdHJpbmdcbiAgc3ltYm9sVHlwZTogQ29tcGxldGlvbkJhY2tlbmQuU3ltYm9sVHlwZVxuICB0eXBlU2lnbmF0dXJlPzogc3RyaW5nXG4gIHBhcmVudD86IHN0cmluZ1xufVxuXG5leHBvcnQgY2xhc3MgR2hjTW9kaVByb2Nlc3Mge1xuICBwcml2YXRlIGJhY2tlbmQ6IE1hcDxzdHJpbmcsIFByb21pc2U8R2hjTW9kaVByb2Nlc3NSZWFsPj5cbiAgcHJpdmF0ZSBkaXNwb3NhYmxlczogQ29tcG9zaXRlRGlzcG9zYWJsZVxuICBwcml2YXRlIGVtaXR0ZXI6IEVtaXR0ZXI8XG4gICAge1xuICAgICAgJ2RpZC1kZXN0cm95JzogdW5kZWZpbmVkXG4gICAgICAnYmFja2VuZC1hY3RpdmUnOiB1bmRlZmluZWRcbiAgICAgICdiYWNrZW5kLWlkbGUnOiB1bmRlZmluZWRcbiAgICB9LFxuICAgIHtcbiAgICAgIHdhcm5pbmc6IHN0cmluZ1xuICAgICAgZXJyb3I6IElFcnJvckNhbGxiYWNrQXJnc1xuICAgICAgJ3F1ZXVlLWlkbGUnOiB7IHF1ZXVlOiBDb21tYW5kcyB9XG4gICAgfVxuICA+XG4gIHByaXZhdGUgYnVmZmVyRGlyTWFwOiBXZWFrTWFwPFRleHRCdWZmZXIsIERpcmVjdG9yeT5cbiAgcHJpdmF0ZSBjb21tYW5kUXVldWVzOiB7IFtLIGluIENvbW1hbmRzXTogUXVldWUgfVxuXG4gIGNvbnN0cnVjdG9yKHByaXZhdGUgdXBpUHJvbWlzZTogUHJvbWlzZTxVUEkuSVVQSUluc3RhbmNlPikge1xuICAgIHRoaXMuZGlzcG9zYWJsZXMgPSBuZXcgQ29tcG9zaXRlRGlzcG9zYWJsZSgpXG4gICAgdGhpcy5lbWl0dGVyID0gbmV3IEVtaXR0ZXIoKVxuICAgIHRoaXMuZGlzcG9zYWJsZXMuYWRkKHRoaXMuZW1pdHRlcilcbiAgICB0aGlzLmJ1ZmZlckRpck1hcCA9IG5ldyBXZWFrTWFwKClcbiAgICB0aGlzLmJhY2tlbmQgPSBuZXcgTWFwKClcblxuICAgIGlmIChcbiAgICAgIHByb2Nlc3MuZW52LkdIQ19QQUNLQUdFX1BBVEggJiZcbiAgICAgICFhdG9tLmNvbmZpZy5nZXQoJ2hhc2tlbGwtZ2hjLW1vZC5zdXBwcmVzc0doY1BhY2thZ2VQYXRoV2FybmluZycpXG4gICAgKSB7XG4gICAgICBVdGlsLndhcm5HSENQYWNrYWdlUGF0aCgpXG4gICAgfVxuXG4gICAgdGhpcy5jb21tYW5kUXVldWVzID0ge1xuICAgICAgY2hlY2tsaW50OiBuZXcgUXVldWUoMiksXG4gICAgICBicm93c2U6IG5ldyBRdWV1ZShhdG9tLmNvbmZpZy5nZXQoJ2hhc2tlbGwtZ2hjLW1vZC5tYXhCcm93c2VQcm9jZXNzZXMnKSksXG4gICAgICB0eXBlaW5mbzogbmV3IFF1ZXVlKDEpLFxuICAgICAgZmluZDogbmV3IFF1ZXVlKDEpLFxuICAgICAgaW5pdDogbmV3IFF1ZXVlKDQpLFxuICAgICAgbGlzdDogbmV3IFF1ZXVlKDEpLFxuICAgICAgbG93bWVtOiBuZXcgUXVldWUoMSksXG4gICAgfVxuICAgIHRoaXMuZGlzcG9zYWJsZXMuYWRkKFxuICAgICAgYXRvbS5jb25maWcub25EaWRDaGFuZ2UoXG4gICAgICAgICdoYXNrZWxsLWdoYy1tb2QubWF4QnJvd3NlUHJvY2Vzc2VzJyxcbiAgICAgICAgKHsgbmV3VmFsdWUgfSkgPT5cbiAgICAgICAgICAodGhpcy5jb21tYW5kUXVldWVzLmJyb3dzZSA9IG5ldyBRdWV1ZShuZXdWYWx1ZSBhcyBudW1iZXIpKSxcbiAgICAgICksXG4gICAgKVxuICB9XG5cbiAgcHVibGljIGFzeW5jIGdldFJvb3REaXIoYnVmZmVyOiBUZXh0QnVmZmVyKTogUHJvbWlzZTxEaXJlY3Rvcnk+IHtcbiAgICBsZXQgZGlyXG4gICAgZGlyID0gdGhpcy5idWZmZXJEaXJNYXAuZ2V0KGJ1ZmZlcilcbiAgICBpZiAoZGlyKSB7XG4gICAgICByZXR1cm4gZGlyXG4gICAgfVxuICAgIGRpciA9IGF3YWl0IFV0aWwuZ2V0Um9vdERpcihidWZmZXIpXG4gICAgdGhpcy5idWZmZXJEaXJNYXAuc2V0KGJ1ZmZlciwgZGlyKVxuICAgIHJldHVybiBkaXJcbiAgfVxuXG4gIHB1YmxpYyBraWxsUHJvY2VzcygpIHtcbiAgICBmb3IgKGNvbnN0IGJwIG9mIHRoaXMuYmFja2VuZC52YWx1ZXMoKSkge1xuICAgICAgYnAudGhlbigoYikgPT4gYi5raWxsUHJvY2VzcygpKS5jYXRjaCgoZTogRXJyb3IpID0+IHtcbiAgICAgICAgYXRvbS5ub3RpZmljYXRpb25zLmFkZEVycm9yKCdFcnJvciBraWxsaW5nIGdoYy1tb2QgcHJvY2VzcycsIHtcbiAgICAgICAgICBkZXRhaWw6IGUudG9TdHJpbmcoKSxcbiAgICAgICAgICBzdGFjazogZS5zdGFjayxcbiAgICAgICAgICBkaXNtaXNzYWJsZTogdHJ1ZSxcbiAgICAgICAgfSlcbiAgICAgIH0pXG4gICAgfVxuICAgIHRoaXMuYmFja2VuZC5jbGVhcigpXG4gIH1cblxuICBwdWJsaWMgZGVzdHJveSgpIHtcbiAgICBmb3IgKGNvbnN0IGJwIG9mIHRoaXMuYmFja2VuZC52YWx1ZXMoKSkge1xuICAgICAgYnAudGhlbigoYikgPT4gYi5kZXN0cm95KCkpLmNhdGNoKChlOiBFcnJvcikgPT4ge1xuICAgICAgICBhdG9tLm5vdGlmaWNhdGlvbnMuYWRkRXJyb3IoJ0Vycm9yIGtpbGxpbmcgZ2hjLW1vZCBwcm9jZXNzJywge1xuICAgICAgICAgIGRldGFpbDogZS50b1N0cmluZygpLFxuICAgICAgICAgIHN0YWNrOiBlLnN0YWNrLFxuICAgICAgICAgIGRpc21pc3NhYmxlOiB0cnVlLFxuICAgICAgICB9KVxuICAgICAgfSlcbiAgICB9XG4gICAgdGhpcy5iYWNrZW5kLmNsZWFyKClcbiAgICB0aGlzLmVtaXR0ZXIuZW1pdCgnZGlkLWRlc3Ryb3knKVxuICAgIHRoaXMuZGlzcG9zYWJsZXMuZGlzcG9zZSgpXG4gIH1cblxuICBwdWJsaWMgb25EaWREZXN0cm95KGNhbGxiYWNrOiAoKSA9PiB2b2lkKSB7XG4gICAgcmV0dXJuIHRoaXMuZW1pdHRlci5vbignZGlkLWRlc3Ryb3knLCBjYWxsYmFjaylcbiAgfVxuXG4gIHB1YmxpYyBvbldhcm5pbmcoY2FsbGJhY2s6ICh3YXJuaW5nOiBzdHJpbmcpID0+IHZvaWQpIHtcbiAgICByZXR1cm4gdGhpcy5lbWl0dGVyLm9uKCd3YXJuaW5nJywgY2FsbGJhY2spXG4gIH1cblxuICBwdWJsaWMgb25FcnJvcihjYWxsYmFjazogKGVycm9yOiBJRXJyb3JDYWxsYmFja0FyZ3MpID0+IHZvaWQpIHtcbiAgICByZXR1cm4gdGhpcy5lbWl0dGVyLm9uKCdlcnJvcicsIGNhbGxiYWNrKVxuICB9XG5cbiAgcHVibGljIG9uQmFja2VuZEFjdGl2ZShjYWxsYmFjazogKCkgPT4gdm9pZCkge1xuICAgIHJldHVybiB0aGlzLmVtaXR0ZXIub24oJ2JhY2tlbmQtYWN0aXZlJywgY2FsbGJhY2spXG4gIH1cblxuICBwdWJsaWMgb25CYWNrZW5kSWRsZShjYWxsYmFjazogKCkgPT4gdm9pZCkge1xuICAgIHJldHVybiB0aGlzLmVtaXR0ZXIub24oJ2JhY2tlbmQtaWRsZScsIGNhbGxiYWNrKVxuICB9XG5cbiAgcHVibGljIG9uUXVldWVJZGxlKGNhbGxiYWNrOiAoKSA9PiB2b2lkKSB7XG4gICAgcmV0dXJuIHRoaXMuZW1pdHRlci5vbigncXVldWUtaWRsZScsIGNhbGxiYWNrKVxuICB9XG5cbiAgcHVibGljIGFzeW5jIHJ1bkxpc3QoYnVmZmVyOiBUZXh0QnVmZmVyKSB7XG4gICAgcmV0dXJuIHRoaXMucXVldWVDbWQoJ2xpc3QnLCBhd2FpdCB0aGlzLmdldFJvb3REaXIoYnVmZmVyKSwgKCkgPT4gKHtcbiAgICAgIGNvbW1hbmQ6ICdsaXN0JyxcbiAgICB9KSlcbiAgfVxuXG4gIHB1YmxpYyBhc3luYyBydW5MYW5nKGRpcjogRGlyZWN0b3J5KSB7XG4gICAgcmV0dXJuIHRoaXMucXVldWVDbWQoJ2luaXQnLCBkaXIsICgpID0+ICh7IGNvbW1hbmQ6ICdsYW5nJyB9KSlcbiAgfVxuXG4gIHB1YmxpYyBhc3luYyBydW5GbGFnKGRpcjogRGlyZWN0b3J5KSB7XG4gICAgcmV0dXJuIHRoaXMucXVldWVDbWQoJ2luaXQnLCBkaXIsICgpID0+ICh7IGNvbW1hbmQ6ICdmbGFnJyB9KSlcbiAgfVxuXG4gIHB1YmxpYyBhc3luYyBydW5Ccm93c2UoXG4gICAgcm9vdERpcjogRGlyZWN0b3J5LFxuICAgIG1vZHVsZXM6IHN0cmluZ1tdLFxuICApOiBQcm9taXNlPFN5bWJvbERlc2NbXT4ge1xuICAgIGNvbnN0IGxpbmVzID0gYXdhaXQgdGhpcy5xdWV1ZUNtZCgnYnJvd3NlJywgcm9vdERpciwgKGNhcHMpID0+IHtcbiAgICAgIGNvbnN0IGFyZ3MgPSBjYXBzLmJyb3dzZU1haW5cbiAgICAgICAgPyBtb2R1bGVzXG4gICAgICAgIDogbW9kdWxlcy5maWx0ZXIoKHYpID0+IHYgIT09ICdNYWluJylcbiAgICAgIGlmIChhcmdzLmxlbmd0aCA9PT0gMCkgcmV0dXJuIHVuZGVmaW5lZFxuICAgICAgcmV0dXJuIHtcbiAgICAgICAgY29tbWFuZDogJ2Jyb3dzZScsXG4gICAgICAgIGRhc2hBcmdzOiBjYXBzLmJyb3dzZVBhcmVudHMgPyBbJy1kJywgJy1vJywgJy1wJ10gOiBbJy1kJywgJy1vJ10sXG4gICAgICAgIGFyZ3MsXG4gICAgICB9XG4gICAgfSlcbiAgICByZXR1cm4gbGluZXMubWFwKChzKSA9PiB7XG4gICAgICAvLyBlbnVtRnJvbSA6OiBFbnVtIGEgPT4gYSAtPiBbYV0gLS0gZnJvbTpFbnVtXG4gICAgICBjb25zdCBwYXR0ZXJuID0gL14oLio/KSA6OiAoLio/KSg/OiAtLSBmcm9tOiguKikpPyQvXG4gICAgICBjb25zdCBtYXRjaCA9IHMubWF0Y2gocGF0dGVybilcbiAgICAgIGxldCBuYW1lOiBzdHJpbmdcbiAgICAgIGxldCB0eXBlU2lnbmF0dXJlOiBzdHJpbmcgfCB1bmRlZmluZWRcbiAgICAgIGxldCBwYXJlbnQ6IHN0cmluZyB8IHVuZGVmaW5lZFxuICAgICAgaWYgKG1hdGNoKSB7XG4gICAgICAgIG5hbWUgPSBtYXRjaFsxXVxuICAgICAgICB0eXBlU2lnbmF0dXJlID0gbWF0Y2hbMl1cbiAgICAgICAgcGFyZW50ID0gbWF0Y2hbM11cbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIG5hbWUgPSBzXG4gICAgICB9XG4gICAgICBsZXQgc3ltYm9sVHlwZTogQ29tcGxldGlvbkJhY2tlbmQuU3ltYm9sVHlwZVxuICAgICAgaWYgKHR5cGVTaWduYXR1cmUgJiYgL14oPzp0eXBlfGRhdGF8bmV3dHlwZSkvLnRlc3QodHlwZVNpZ25hdHVyZSkpIHtcbiAgICAgICAgc3ltYm9sVHlwZSA9ICd0eXBlJ1xuICAgICAgfSBlbHNlIGlmICh0eXBlU2lnbmF0dXJlICYmIC9eKD86Y2xhc3MpLy50ZXN0KHR5cGVTaWduYXR1cmUpKSB7XG4gICAgICAgIHN5bWJvbFR5cGUgPSAnY2xhc3MnXG4gICAgICB9IGVsc2UgaWYgKC9eXFwoLipcXCkkLy50ZXN0KG5hbWUpKSB7XG4gICAgICAgIHN5bWJvbFR5cGUgPSAnb3BlcmF0b3InXG4gICAgICAgIG5hbWUgPSBuYW1lLnNsaWNlKDEsIC0xKVxuICAgICAgfSBlbHNlIGlmIChVdGlsLmlzVXBwZXJDYXNlKG5hbWVbMF0pKSB7XG4gICAgICAgIHN5bWJvbFR5cGUgPSAndGFnJ1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgc3ltYm9sVHlwZSA9ICdmdW5jdGlvbidcbiAgICAgIH1cbiAgICAgIHJldHVybiB7IG5hbWUsIHR5cGVTaWduYXR1cmUsIHN5bWJvbFR5cGUsIHBhcmVudCB9XG4gICAgfSlcbiAgfVxuXG4gIHB1YmxpYyBhc3luYyBnZXRUeXBlSW5CdWZmZXIoYnVmZmVyOiBUZXh0QnVmZmVyLCBjcmFuZ2U6IFJhbmdlKSB7XG4gICAgaWYgKCFidWZmZXIuZ2V0VXJpKCkpIHtcbiAgICAgIHRocm93IG5ldyBFcnJvcignTm8gVVJJIGZvciBidWZmZXInKVxuICAgIH1cbiAgICBjcmFuZ2UgPSBVdGlsLnRhYlNoaWZ0Rm9yUmFuZ2UoYnVmZmVyLCBjcmFuZ2UpXG4gICAgY29uc3Qgcm9vdERpciA9IGF3YWl0IHRoaXMuZ2V0Um9vdERpcihidWZmZXIpXG4gICAgY29uc3QgbGluZXMgPSBhd2FpdCB0aGlzLnF1ZXVlQ21kKCd0eXBlaW5mbycsIHJvb3REaXIsIChjYXBzKSA9PiAoe1xuICAgICAgaW50ZXJhY3RpdmU6IHRydWUsXG4gICAgICBjb21tYW5kOiAndHlwZScsXG4gICAgICB1cmk6IGJ1ZmZlci5nZXRVcmkoKSxcbiAgICAgIHRleHQ6IGJ1ZmZlci5pc01vZGlmaWVkKCkgPyBidWZmZXIuZ2V0VGV4dCgpIDogdW5kZWZpbmVkLFxuICAgICAgZGFzaEFyZ3M6IGNhcHMudHlwZUNvbnN0cmFpbnRzID8gWyctYyddIDogW10sXG4gICAgICBhcmdzOiBbY3JhbmdlLnN0YXJ0LnJvdyArIDEsIGNyYW5nZS5zdGFydC5jb2x1bW4gKyAxXS5tYXAoKHYpID0+XG4gICAgICAgIHYudG9TdHJpbmcoKSxcbiAgICAgICksXG4gICAgfSkpXG5cbiAgICBjb25zdCByeCA9IC9eKFxcZCspXFxzKyhcXGQrKVxccysoXFxkKylcXHMrKFxcZCspXFxzK1wiKFteXSopXCIkLyAvLyBbXl0gYmFzaWNhbGx5IG1lYW5zIFwiYW55dGhpbmdcIiwgaW5jbC4gbmV3bGluZXNcbiAgICBmb3IgKGNvbnN0IGxpbmUgb2YgbGluZXMpIHtcbiAgICAgIGNvbnN0IG1hdGNoID0gbGluZS5tYXRjaChyeClcbiAgICAgIGlmICghbWF0Y2gpIHtcbiAgICAgICAgY29udGludWVcbiAgICAgIH1cbiAgICAgIGNvbnN0IFtyb3dzdGFydCwgY29sc3RhcnQsIHJvd2VuZCwgY29sZW5kLCB0eXBlXSA9IG1hdGNoLnNsaWNlKDEpXG4gICAgICBjb25zdCByYW5nZSA9IFJhbmdlLmZyb21PYmplY3QoW1xuICAgICAgICBbcGFyc2VJbnQocm93c3RhcnQsIDEwKSAtIDEsIHBhcnNlSW50KGNvbHN0YXJ0LCAxMCkgLSAxXSxcbiAgICAgICAgW3BhcnNlSW50KHJvd2VuZCwgMTApIC0gMSwgcGFyc2VJbnQoY29sZW5kLCAxMCkgLSAxXSxcbiAgICAgIF0pXG4gICAgICBpZiAocmFuZ2UuaXNFbXB0eSgpKSB7XG4gICAgICAgIGNvbnRpbnVlXG4gICAgICB9XG4gICAgICBpZiAoIXJhbmdlLmNvbnRhaW5zUmFuZ2UoY3JhbmdlKSkge1xuICAgICAgICBjb250aW51ZVxuICAgICAgfVxuICAgICAgcmV0dXJuIHtcbiAgICAgICAgcmFuZ2U6IFV0aWwudGFiVW5zaGlmdEZvclJhbmdlKGJ1ZmZlciwgcmFuZ2UpLFxuICAgICAgICB0eXBlOiB0eXBlLnJlcGxhY2UoL1xcXFxcIi9nLCAnXCInKSxcbiAgICAgIH1cbiAgICB9XG4gICAgdGhyb3cgbmV3IEVycm9yKCdObyB0eXBlJylcbiAgfVxuXG4gIHB1YmxpYyBhc3luYyBkb0Nhc2VTcGxpdChidWZmZXI6IFRleHRCdWZmZXIsIGNyYW5nZTogUmFuZ2UpIHtcbiAgICBpZiAoIWJ1ZmZlci5nZXRVcmkoKSkge1xuICAgICAgdGhyb3cgbmV3IEVycm9yKCdObyBVUkkgZm9yIGJ1ZmZlcicpXG4gICAgfVxuICAgIGNyYW5nZSA9IFV0aWwudGFiU2hpZnRGb3JSYW5nZShidWZmZXIsIGNyYW5nZSlcbiAgICBjb25zdCByb290RGlyID0gYXdhaXQgdGhpcy5nZXRSb290RGlyKGJ1ZmZlcilcbiAgICBjb25zdCBsaW5lcyA9IGF3YWl0IHRoaXMucXVldWVDbWQoJ3R5cGVpbmZvJywgcm9vdERpciwgKGNhcHMpID0+ICh7XG4gICAgICBpbnRlcmFjdGl2ZTogY2Fwcy5pbnRlcmFjdGl2ZUNhc2VTcGxpdCxcbiAgICAgIGNvbW1hbmQ6ICdzcGxpdCcsXG4gICAgICB1cmk6IGJ1ZmZlci5nZXRVcmkoKSxcbiAgICAgIHRleHQ6IGJ1ZmZlci5pc01vZGlmaWVkKCkgPyBidWZmZXIuZ2V0VGV4dCgpIDogdW5kZWZpbmVkLFxuICAgICAgYXJnczogW2NyYW5nZS5zdGFydC5yb3cgKyAxLCBjcmFuZ2Uuc3RhcnQuY29sdW1uICsgMV0ubWFwKCh2KSA9PlxuICAgICAgICB2LnRvU3RyaW5nKCksXG4gICAgICApLFxuICAgIH0pKVxuXG4gICAgY29uc3QgcnggPSAvXihcXGQrKVxccysoXFxkKylcXHMrKFxcZCspXFxzKyhcXGQrKVxccytcIihbXl0qKVwiJC8gLy8gW15dIGJhc2ljYWxseSBtZWFucyBcImFueXRoaW5nXCIsIGluY2wuIG5ld2xpbmVzXG4gICAgY29uc3QgcmVzID0gW11cbiAgICBmb3IgKGNvbnN0IGxpbmUgb2YgbGluZXMpIHtcbiAgICAgIGNvbnN0IG1hdGNoID0gbGluZS5tYXRjaChyeClcbiAgICAgIGlmICghbWF0Y2gpIHtcbiAgICAgICAgVXRpbC53YXJuKGBnaGMtbW9kIHNheXM6ICR7bGluZX1gKVxuICAgICAgICBjb250aW51ZVxuICAgICAgfVxuICAgICAgY29uc3QgW3Jvd3N0YXJ0LCBjb2xzdGFydCwgcm93ZW5kLCBjb2xlbmQsIHRleHRdID0gbWF0Y2guc2xpY2UoMSlcbiAgICAgIHJlcy5wdXNoKHtcbiAgICAgICAgcmFuZ2U6IFJhbmdlLmZyb21PYmplY3QoW1xuICAgICAgICAgIFtwYXJzZUludChyb3dzdGFydCwgMTApIC0gMSwgcGFyc2VJbnQoY29sc3RhcnQsIDEwKSAtIDFdLFxuICAgICAgICAgIFtwYXJzZUludChyb3dlbmQsIDEwKSAtIDEsIHBhcnNlSW50KGNvbGVuZCwgMTApIC0gMV0sXG4gICAgICAgIF0pLFxuICAgICAgICByZXBsYWNlbWVudDogdGV4dCxcbiAgICAgIH0pXG4gICAgfVxuICAgIHJldHVybiByZXNcbiAgfVxuXG4gIHB1YmxpYyBhc3luYyBkb1NpZ0ZpbGwoYnVmZmVyOiBUZXh0QnVmZmVyLCBjcmFuZ2U6IFJhbmdlKSB7XG4gICAgaWYgKCFidWZmZXIuZ2V0VXJpKCkpIHtcbiAgICAgIHRocm93IG5ldyBFcnJvcignTm8gVVJJIGZvciBidWZmZXInKVxuICAgIH1cbiAgICBjcmFuZ2UgPSBVdGlsLnRhYlNoaWZ0Rm9yUmFuZ2UoYnVmZmVyLCBjcmFuZ2UpXG4gICAgY29uc3Qgcm9vdERpciA9IGF3YWl0IHRoaXMuZ2V0Um9vdERpcihidWZmZXIpXG4gICAgY29uc3QgbGluZXMgPSBhd2FpdCB0aGlzLnF1ZXVlQ21kKCd0eXBlaW5mbycsIHJvb3REaXIsIChjYXBzKSA9PiAoe1xuICAgICAgaW50ZXJhY3RpdmU6IGNhcHMuaW50ZXJhY3RpdmVDYXNlU3BsaXQsXG4gICAgICBjb21tYW5kOiAnc2lnJyxcbiAgICAgIHVyaTogYnVmZmVyLmdldFVyaSgpLFxuICAgICAgdGV4dDogYnVmZmVyLmlzTW9kaWZpZWQoKSA/IGJ1ZmZlci5nZXRUZXh0KCkgOiB1bmRlZmluZWQsXG4gICAgICBhcmdzOiBbY3JhbmdlLnN0YXJ0LnJvdyArIDEsIGNyYW5nZS5zdGFydC5jb2x1bW4gKyAxXS5tYXAoKHYpID0+XG4gICAgICAgIHYudG9TdHJpbmcoKSxcbiAgICAgICksXG4gICAgfSkpXG4gICAgaWYgKGxpbmVzLmxlbmd0aCA8IDIpIHtcbiAgICAgIHRocm93IG5ldyBFcnJvcihgQ291bGQgbm90IHVuZGVyc3RhbmQgcmVzcG9uc2U6ICR7bGluZXMuam9pbignXFxuJyl9YClcbiAgICB9XG4gICAgY29uc3QgcnggPSAvXihcXGQrKVxccysoXFxkKylcXHMrKFxcZCspXFxzKyhcXGQrKSQvIC8vIHBvc2l0aW9uIHJ4XG4gICAgY29uc3QgbWF0Y2ggPSBsaW5lc1sxXS5tYXRjaChyeClcbiAgICBpZiAoIW1hdGNoKSB7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoYENvdWxkIG5vdCB1bmRlcnN0YW5kIHJlc3BvbnNlOiAke2xpbmVzLmpvaW4oJ1xcbicpfWApXG4gICAgfVxuICAgIGNvbnN0IFtyb3dzdGFydCwgY29sc3RhcnQsIHJvd2VuZCwgY29sZW5kXSA9IG1hdGNoLnNsaWNlKDEpXG4gICAgY29uc3QgcmFuZ2UgPSBSYW5nZS5mcm9tT2JqZWN0KFtcbiAgICAgIFtwYXJzZUludChyb3dzdGFydCwgMTApIC0gMSwgcGFyc2VJbnQoY29sc3RhcnQsIDEwKSAtIDFdLFxuICAgICAgW3BhcnNlSW50KHJvd2VuZCwgMTApIC0gMSwgcGFyc2VJbnQoY29sZW5kLCAxMCkgLSAxXSxcbiAgICBdKVxuICAgIHJldHVybiB7XG4gICAgICB0eXBlOiBsaW5lc1swXSxcbiAgICAgIHJhbmdlLFxuICAgICAgYm9keTogbGluZXMuc2xpY2UoMikuam9pbignXFxuJyksXG4gICAgfVxuICB9XG5cbiAgcHVibGljIGFzeW5jIGdldEluZm9JbkJ1ZmZlcihlZGl0b3I6IFRleHRFZGl0b3IsIGNyYW5nZTogUmFuZ2UpIHtcbiAgICBjb25zdCBidWZmZXIgPSBlZGl0b3IuZ2V0QnVmZmVyKClcbiAgICBpZiAoIWJ1ZmZlci5nZXRVcmkoKSkge1xuICAgICAgdGhyb3cgbmV3IEVycm9yKCdObyBVUkkgZm9yIGJ1ZmZlcicpXG4gICAgfVxuICAgIGNvbnN0IHN5bUluZm8gPSBVdGlsLmdldFN5bWJvbEluUmFuZ2UoZWRpdG9yLCBjcmFuZ2UpXG4gICAgaWYgKCFzeW1JbmZvKSB7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoXCJDb3VsZG4ndCBnZXQgc3ltYm9sIGZvciBpbmZvXCIpXG4gICAgfVxuICAgIGNvbnN0IHsgc3ltYm9sLCByYW5nZSB9ID0gc3ltSW5mb1xuXG4gICAgY29uc3QgbGluZXMgPSBhd2FpdCB0aGlzLnF1ZXVlQ21kKFxuICAgICAgJ3R5cGVpbmZvJyxcbiAgICAgIGF3YWl0IHRoaXMuZ2V0Um9vdERpcihidWZmZXIpLFxuICAgICAgKCkgPT4gKHtcbiAgICAgICAgaW50ZXJhY3RpdmU6IHRydWUsXG4gICAgICAgIGNvbW1hbmQ6ICdpbmZvJyxcbiAgICAgICAgdXJpOiBidWZmZXIuZ2V0VXJpKCksXG4gICAgICAgIHRleHQ6IGJ1ZmZlci5pc01vZGlmaWVkKCkgPyBidWZmZXIuZ2V0VGV4dCgpIDogdW5kZWZpbmVkLFxuICAgICAgICBhcmdzOiBbc3ltYm9sXSxcbiAgICAgIH0pLFxuICAgIClcblxuICAgIGNvbnN0IGluZm8gPSBsaW5lcy5qb2luKCdcXG4nKVxuICAgIGlmIChpbmZvID09PSAnQ2Fubm90IHNob3cgaW5mbycgfHwgIWluZm8pIHtcbiAgICAgIHRocm93IG5ldyBFcnJvcignTm8gaW5mbycpXG4gICAgfSBlbHNlIHtcbiAgICAgIHJldHVybiB7IHJhbmdlLCBpbmZvIH1cbiAgICB9XG4gIH1cblxuICBwdWJsaWMgYXN5bmMgZmluZFN5bWJvbFByb3ZpZGVyc0luQnVmZmVyKGVkaXRvcjogVGV4dEVkaXRvciwgY3JhbmdlOiBSYW5nZSkge1xuICAgIGNvbnN0IGJ1ZmZlciA9IGVkaXRvci5nZXRCdWZmZXIoKVxuICAgIGNvbnN0IHN5bUluZm8gPSBVdGlsLmdldFN5bWJvbEluUmFuZ2UoZWRpdG9yLCBjcmFuZ2UpXG4gICAgaWYgKCFzeW1JbmZvKSB7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoXCJDb3VsZG4ndCBnZXQgc3ltYm9sIGZvciBpbXBvcnRcIilcbiAgICB9XG4gICAgY29uc3QgeyBzeW1ib2wgfSA9IHN5bUluZm9cblxuICAgIHJldHVybiB0aGlzLnF1ZXVlQ21kKCdmaW5kJywgYXdhaXQgdGhpcy5nZXRSb290RGlyKGJ1ZmZlciksICgpID0+ICh7XG4gICAgICBpbnRlcmFjdGl2ZTogdHJ1ZSxcbiAgICAgIGNvbW1hbmQ6ICdmaW5kJyxcbiAgICAgIGFyZ3M6IFtzeW1ib2xdLFxuICAgIH0pKVxuICB9XG5cbiAgcHVibGljIGFzeW5jIGRvQ2hlY2tCdWZmZXIoYnVmZmVyOiBUZXh0QnVmZmVyLCBmYXN0OiBib29sZWFuKSB7XG4gICAgcmV0dXJuIHRoaXMuZG9DaGVja09yTGludEJ1ZmZlcignY2hlY2snLCBidWZmZXIsIGZhc3QpXG4gIH1cblxuICBwdWJsaWMgYXN5bmMgZG9MaW50QnVmZmVyKGJ1ZmZlcjogVGV4dEJ1ZmZlcikge1xuICAgIHJldHVybiB0aGlzLmRvQ2hlY2tPckxpbnRCdWZmZXIoJ2xpbnQnLCBidWZmZXIsIGZhbHNlKVxuICB9XG5cbiAgcHVibGljIGFzeW5jIGRvQ2hlY2tBbmRMaW50KGJ1ZmZlcjogVGV4dEJ1ZmZlciwgZmFzdDogYm9vbGVhbikge1xuICAgIGNvbnN0IFtjciwgbHJdID0gYXdhaXQgUHJvbWlzZS5hbGwoW1xuICAgICAgdGhpcy5kb0NoZWNrQnVmZmVyKGJ1ZmZlciwgZmFzdCksXG4gICAgICB0aGlzLmRvTGludEJ1ZmZlcihidWZmZXIpLFxuICAgIF0pXG4gICAgcmV0dXJuIGNyLmNvbmNhdChscilcbiAgfVxuXG4gIHByaXZhdGUgYXN5bmMgZ2V0VVBJKCkge1xuICAgIHJldHVybiBQcm9taXNlLnJhY2UoW3RoaXMudXBpUHJvbWlzZSwgUHJvbWlzZS5yZXNvbHZlKHVuZGVmaW5lZCldKVxuICB9XG5cbiAgcHJpdmF0ZSBhc3luYyBpbml0QmFja2VuZChyb290RGlyOiBEaXJlY3RvcnkpOiBQcm9taXNlPEdoY01vZGlQcm9jZXNzUmVhbD4ge1xuICAgIGNvbnN0IHJvb3RQYXRoID0gcm9vdERpci5nZXRQYXRoKClcbiAgICBjb25zdCBjYWNoZWQgPSB0aGlzLmJhY2tlbmQuZ2V0KHJvb3RQYXRoKVxuICAgIGlmIChjYWNoZWQpIHtcbiAgICAgIHJldHVybiBjYWNoZWRcbiAgICB9XG4gICAgY29uc3QgYmFja2VuZCA9IHRoaXMuY3JlYXRlQmFja2VuZChyb290RGlyKVxuICAgIHRoaXMuYmFja2VuZC5zZXQocm9vdFBhdGgsIGJhY2tlbmQpXG4gICAgcmV0dXJuIGJhY2tlbmRcbiAgfVxuXG4gIHByaXZhdGUgYXN5bmMgY3JlYXRlQmFja2VuZChyb290RGlyOiBEaXJlY3RvcnkpOiBQcm9taXNlPEdoY01vZGlQcm9jZXNzUmVhbD4ge1xuICAgIGNvbnN0IG5ld0JhY2tlbmQgPSBjcmVhdGVHaGNNb2RpUHJvY2Vzc1JlYWwocm9vdERpciwgYXdhaXQgdGhpcy5nZXRVUEkoKSlcbiAgICBjb25zdCBiYWNrZW5kID0gYXdhaXQgbmV3QmFja2VuZFxuICAgIHRoaXMuZGlzcG9zYWJsZXMuYWRkKFxuICAgICAgYmFja2VuZC5vbkVycm9yKChhcmcpID0+IHRoaXMuZW1pdHRlci5lbWl0KCdlcnJvcicsIGFyZykpLFxuICAgICAgYmFja2VuZC5vbldhcm5pbmcoKGFyZykgPT4gdGhpcy5lbWl0dGVyLmVtaXQoJ3dhcm5pbmcnLCBhcmcpKSxcbiAgICApXG4gICAgcmV0dXJuIGJhY2tlbmRcbiAgfVxuXG4gIHByaXZhdGUgYXN5bmMgcXVldWVDbWQoXG4gICAgcXVldWVOYW1lOiBDb21tYW5kcyxcbiAgICBkaXI6IERpcmVjdG9yeSxcbiAgICBydW5BcmdzRnVuYzogKFxuICAgICAgY2FwczogR0hDTW9kQ2FwcyxcbiAgICApID0+XG4gICAgICB8IHtcbiAgICAgICAgICBjb21tYW5kOiBzdHJpbmdcbiAgICAgICAgICB0ZXh0Pzogc3RyaW5nXG4gICAgICAgICAgdXJpPzogc3RyaW5nXG4gICAgICAgICAgaW50ZXJhY3RpdmU/OiBib29sZWFuXG4gICAgICAgICAgZGFzaEFyZ3M/OiBzdHJpbmdbXVxuICAgICAgICAgIGFyZ3M/OiBzdHJpbmdbXVxuICAgICAgICB9XG4gICAgICB8IHVuZGVmaW5lZCxcbiAgKTogUHJvbWlzZTxzdHJpbmdbXT4ge1xuICAgIGlmIChhdG9tLmNvbmZpZy5nZXQoJ2hhc2tlbGwtZ2hjLW1vZC5sb3dNZW1vcnlTeXN0ZW0nKSkge1xuICAgICAgcXVldWVOYW1lID0gJ2xvd21lbSdcbiAgICB9XG4gICAgY29uc3QgYmFja2VuZCA9IGF3YWl0IHRoaXMuaW5pdEJhY2tlbmQoZGlyKVxuICAgIGNvbnN0IHByb21pc2UgPSB0aGlzLmNvbW1hbmRRdWV1ZXNbcXVldWVOYW1lXS5hZGQoYXN5bmMgKCkgPT4ge1xuICAgICAgdGhpcy5lbWl0dGVyLmVtaXQoJ2JhY2tlbmQtYWN0aXZlJylcbiAgICAgIHRyeSB7XG4gICAgICAgIGNvbnN0IHNldHRpbmdzID0gYXdhaXQgZ2V0U2V0dGluZ3MoZGlyKVxuICAgICAgICBpZiAoc2V0dGluZ3MuZGlzYWJsZSkge1xuICAgICAgICAgIHRocm93IG5ldyBFcnJvcignR2hjLW1vZCBkaXNhYmxlZCBpbiBzZXR0aW5ncycpXG4gICAgICAgIH1cbiAgICAgICAgY29uc3QgcnVuQXJncyA9IHJ1bkFyZ3NGdW5jKGJhY2tlbmQuZ2V0Q2FwcygpKVxuICAgICAgICBpZiAocnVuQXJncyA9PT0gdW5kZWZpbmVkKSByZXR1cm4gW11cbiAgICAgICAgY29uc3QgdXBpID0gYXdhaXQgdGhpcy5nZXRVUEkoKVxuICAgICAgICBsZXQgYnVpbGRlcjogc3RyaW5nIHwgdW5kZWZpbmVkXG4gICAgICAgIGlmICh1cGkgJiYgYXRvbS5jb25maWcuZ2V0KCdoYXNrZWxsLWdoYy1tb2QuYnVpbGRlck1hbmFnZW1lbnQnKSkge1xuICAgICAgICAgIC8vIFRPRE86IHRoaXMgaXMgdXNlZCB0d2ljZSwgdGhlIHNlY29uZCB0aW1lIGluIGdoYy1tb2QtcHJvY2Vzcy1yZWFsLWZhY3RvcnkudHMsIHNob3VsZCBwcm9iYWJseSBmaXggdGhhdFxuICAgICAgICAgIGNvbnN0IGIgPSBhd2FpdCB1cGkuZ2V0T3RoZXJzQ29uZmlnUGFyYW08eyBuYW1lOiBzdHJpbmcgfT4oXG4gICAgICAgICAgICAnaWRlLWhhc2tlbGwtY2FiYWwnLFxuICAgICAgICAgICAgJ2J1aWxkZXInLFxuICAgICAgICAgIClcbiAgICAgICAgICBpZiAoYikgYnVpbGRlciA9IGIubmFtZVxuICAgICAgICB9XG4gICAgICAgIHJldHVybiBiYWNrZW5kLnJ1bih7XG4gICAgICAgICAgLi4ucnVuQXJncyxcbiAgICAgICAgICBidWlsZGVyLFxuICAgICAgICAgIHN1cHByZXNzRXJyb3JzOiBzZXR0aW5ncy5zdXBwcmVzc0Vycm9ycyxcbiAgICAgICAgICBnaGNPcHRpb25zOiBzZXR0aW5ncy5naGNPcHRpb25zLFxuICAgICAgICAgIGdoY01vZE9wdGlvbnM6IHNldHRpbmdzLmdoY01vZE9wdGlvbnMsXG4gICAgICAgIH0pXG4gICAgICB9IGNhdGNoIChlcnIpIHtcbiAgICAgICAgVXRpbC53YXJuKGVycilcbiAgICAgICAgdGhyb3cgZXJyXG4gICAgICB9XG4gICAgfSlcbiAgICBwcm9taXNlXG4gICAgICAudGhlbigoKSA9PiB7XG4gICAgICAgIGNvbnN0IHFlID0gKHFuOiBDb21tYW5kcykgPT4ge1xuICAgICAgICAgIGNvbnN0IHEgPSB0aGlzLmNvbW1hbmRRdWV1ZXNbcW5dXG4gICAgICAgICAgcmV0dXJuIHEuZ2V0UXVldWVMZW5ndGgoKSArIHEuZ2V0UGVuZGluZ0xlbmd0aCgpID09PSAwXG4gICAgICAgIH1cbiAgICAgICAgaWYgKHFlKHF1ZXVlTmFtZSkpIHtcbiAgICAgICAgICB0aGlzLmVtaXR0ZXIuZW1pdCgncXVldWUtaWRsZScsIHsgcXVldWU6IHF1ZXVlTmFtZSB9KVxuICAgICAgICAgIGlmIChPYmplY3Qua2V5cyh0aGlzLmNvbW1hbmRRdWV1ZXMpLmV2ZXJ5KHFlKSkge1xuICAgICAgICAgICAgdGhpcy5lbWl0dGVyLmVtaXQoJ2JhY2tlbmQtaWRsZScpXG4gICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICB9KVxuICAgICAgLmNhdGNoKChlOiBFcnJvcikgPT4ge1xuICAgICAgICBhdG9tLm5vdGlmaWNhdGlvbnMuYWRkRXJyb3IoJ0Vycm9yIGluIEdIQ01vZCBjb21tYW5kIHF1ZXVlJywge1xuICAgICAgICAgIGRldGFpbDogZS50b1N0cmluZygpLFxuICAgICAgICAgIHN0YWNrOiBlLnN0YWNrLFxuICAgICAgICAgIGRpc21pc3NhYmxlOiB0cnVlLFxuICAgICAgICB9KVxuICAgICAgfSlcbiAgICByZXR1cm4gcHJvbWlzZVxuICB9XG5cbiAgcHJpdmF0ZSBhc3luYyBkb0NoZWNrT3JMaW50QnVmZmVyKFxuICAgIGNtZDogJ2NoZWNrJyB8ICdsaW50JyxcbiAgICBidWZmZXI6IFRleHRCdWZmZXIsXG4gICAgZmFzdDogYm9vbGVhbixcbiAgKSB7XG4gICAgbGV0IGRhc2hBcmdzXG4gICAgaWYgKGJ1ZmZlci5pc0VtcHR5KCkpIHtcbiAgICAgIHJldHVybiBbXVxuICAgIH1cbiAgICBpZiAoIWJ1ZmZlci5nZXRVcmkoKSkge1xuICAgICAgcmV0dXJuIFtdXG4gICAgfVxuXG4gICAgLy8gQSBkaXJ0eSBoYWNrIHRvIG1ha2UgbGludCB3b3JrIHdpdGggbGhzXG4gICAgbGV0IHVyaSA9IGJ1ZmZlci5nZXRVcmkoKVxuICAgIGNvbnN0IG9sZHVyaSA9IGJ1ZmZlci5nZXRVcmkoKVxuICAgIGxldCB0ZXh0OiBzdHJpbmcgfCB1bmRlZmluZWRcbiAgICB0cnkge1xuICAgICAgaWYgKGNtZCA9PT0gJ2xpbnQnICYmIGV4dG5hbWUodXJpKSA9PT0gJy5saHMnKSB7XG4gICAgICAgIHVyaSA9IHVyaS5zbGljZSgwLCAtMSlcbiAgICAgICAgdGV4dCA9IGF3YWl0IHVubGl0KG9sZHVyaSwgYnVmZmVyLmdldFRleHQoKSlcbiAgICAgIH0gZWxzZSBpZiAoYnVmZmVyLmlzTW9kaWZpZWQoKSkge1xuICAgICAgICB0ZXh0ID0gYnVmZmVyLmdldFRleHQoKVxuICAgICAgfVxuICAgIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgICAvLyBUT0RPOiBSZWplY3RcbiAgICAgIGNvbnN0IG0gPSAoZXJyb3IgYXMgRXJyb3IpLm1lc3NhZ2UubWF0Y2goL14oLio/KTooWzAtOV0rKTogKiguKikgKiQvKVxuICAgICAgaWYgKCFtKSB7XG4gICAgICAgIHRocm93IGVycm9yXG4gICAgICB9XG4gICAgICBjb25zdCBbdXJpMiwgbGluZSwgbWVzc10gPSBtLnNsaWNlKDEpXG4gICAgICByZXR1cm4gW1xuICAgICAgICB7XG4gICAgICAgICAgdXJpOiB1cmkyLFxuICAgICAgICAgIHBvc2l0aW9uOiBuZXcgUG9pbnQocGFyc2VJbnQobGluZSwgMTApIC0gMSwgMCksXG4gICAgICAgICAgbWVzc2FnZTogbWVzcyxcbiAgICAgICAgICBzZXZlcml0eTogJ2xpbnQnLFxuICAgICAgICB9LFxuICAgICAgXVxuICAgIH1cbiAgICAvLyBlbmQgb2YgZGlydHkgaGFja1xuXG4gICAgLy8gdHNsaW50OmRpc2FibGUtbmV4dC1saW5lOiB0b3RhbGl0eS1jaGVja1xuICAgIGlmIChjbWQgPT09ICdsaW50Jykge1xuICAgICAgY29uc3Qgb3B0czogc3RyaW5nW10gPSBhdG9tLmNvbmZpZy5nZXQoJ2hhc2tlbGwtZ2hjLW1vZC5obGludE9wdGlvbnMnKVxuICAgICAgZGFzaEFyZ3MgPSBbXVxuICAgICAgZm9yIChjb25zdCBvcHQgb2Ygb3B0cykge1xuICAgICAgICBkYXNoQXJncy5wdXNoKCctLWhsaW50T3B0Jywgb3B0KVxuICAgICAgfVxuICAgIH1cblxuICAgIGNvbnN0IHJvb3REaXIgPSBhd2FpdCB0aGlzLmdldFJvb3REaXIoYnVmZmVyKVxuXG4gICAgY29uc3QgdGV4dEIgPSB0ZXh0XG4gICAgY29uc3QgZGFzaEFyZ3NCID0gZGFzaEFyZ3NcbiAgICBjb25zdCBsaW5lcyA9IGF3YWl0IHRoaXMucXVldWVDbWQoJ2NoZWNrbGludCcsIHJvb3REaXIsICgpID0+ICh7XG4gICAgICBpbnRlcmFjdGl2ZTogZmFzdCxcbiAgICAgIGNvbW1hbmQ6IGNtZCxcbiAgICAgIHVyaSxcbiAgICAgIHRleHQ6IHRleHRCLFxuICAgICAgZGFzaEFyZ3M6IGRhc2hBcmdzQixcbiAgICB9KSlcblxuICAgIGNvbnN0IHJ4ID0gL14oLio/KTooWzAtOVxcc10rKTooWzAtOVxcc10rKTogKig/OihXYXJuaW5nfEVycm9yKTogKik/KFteXSopL1xuICAgIGNvbnN0IHJlcyA9IFtdXG4gICAgZm9yIChjb25zdCBsaW5lIG9mIGxpbmVzKSB7XG4gICAgICBjb25zdCBtYXRjaCA9IGxpbmUubWF0Y2gocngpXG4gICAgICBpZiAoIW1hdGNoKSB7XG4gICAgICAgIGlmIChsaW5lLnRyaW0oKS5sZW5ndGgpIHtcbiAgICAgICAgICBVdGlsLndhcm4oYGdoYy1tb2Qgc2F5czogJHtsaW5lfWApXG4gICAgICAgIH1cbiAgICAgICAgY29udGludWVcbiAgICAgIH1cbiAgICAgIGNvbnN0IFtmaWxlMiwgcm93LCBjb2wsIHdhcm5pbmcsIG1lc3NhZ2VdID0gbWF0Y2guc2xpY2UoMSlcbiAgICAgIGlmIChmaWxlMiA9PT0gJ0R1bW15JyAmJiByb3cgPT09ICcwJyAmJiBjb2wgPT09ICcwJykge1xuICAgICAgICBpZiAod2FybmluZyA9PT0gJ0Vycm9yJykge1xuICAgICAgICAgIHRoaXMuZW1pdHRlci5lbWl0KCdlcnJvcicsIHtcbiAgICAgICAgICAgIGVycjogVXRpbC5ta0Vycm9yKCdHSENNb2RTdGRvdXRFcnJvcicsIG1lc3NhZ2UpLFxuICAgICAgICAgICAgY2FwczogKGF3YWl0IHRoaXMuaW5pdEJhY2tlbmQocm9vdERpcikpLmdldENhcHMoKSwgLy8gVE9ETzogVGhpcyBpcyBub3QgcHJldHR5XG4gICAgICAgICAgfSlcbiAgICAgICAgICBjb250aW51ZVxuICAgICAgICB9IGVsc2UgaWYgKHdhcm5pbmcgPT09ICdXYXJuaW5nJykge1xuICAgICAgICAgIHRoaXMuZW1pdHRlci5lbWl0KCd3YXJuaW5nJywgbWVzc2FnZSlcbiAgICAgICAgICBjb250aW51ZVxuICAgICAgICB9XG4gICAgICB9XG5cbiAgICAgIGNvbnN0IGZpbGUgPSB1cmkuZW5kc1dpdGgoZmlsZTIpID8gb2xkdXJpIDogZmlsZTJcbiAgICAgIGNvbnN0IHNldmVyaXR5ID1cbiAgICAgICAgY21kID09PSAnbGludCcgPyAnbGludCcgOiB3YXJuaW5nID09PSAnV2FybmluZycgPyAnd2FybmluZycgOiAnZXJyb3InXG4gICAgICBjb25zdCBtZXNzUG9zID0gbmV3IFBvaW50KHBhcnNlSW50KHJvdywgMTApIC0gMSwgcGFyc2VJbnQoY29sLCAxMCkgLSAxKVxuICAgICAgY29uc3QgcG9zaXRpb24gPSBVdGlsLnRhYlVuc2hpZnRGb3JQb2ludChidWZmZXIsIG1lc3NQb3MpXG4gICAgICBsZXQgbXl1cmlcbiAgICAgIHRyeSB7XG4gICAgICAgIG15dXJpID0gcm9vdERpci5nZXRGaWxlKHJvb3REaXIucmVsYXRpdml6ZShmaWxlKSkuZ2V0UGF0aCgpXG4gICAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgICBteXVyaSA9IGZpbGVcbiAgICAgIH1cbiAgICAgIHJlcy5wdXNoKHtcbiAgICAgICAgdXJpOiBteXVyaSxcbiAgICAgICAgcG9zaXRpb24sXG4gICAgICAgIG1lc3NhZ2UsXG4gICAgICAgIHNldmVyaXR5LFxuICAgICAgfSlcbiAgICB9XG4gICAgcmV0dXJuIHJlc1xuICB9XG59XG4iXX0=