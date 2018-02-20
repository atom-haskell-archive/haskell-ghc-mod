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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaW5kZXguanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi9zcmMvZ2hjLW1vZC9pbmRleC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOztBQUFBLCtCQVFhO0FBQ2IsZ0NBQStCO0FBQy9CLCtCQUE4QjtBQUM5Qix1Q0FBdUM7QUFDdkMsMkRBQTBDO0FBVTFDLG1GQUEwRTtBQUMxRSx5Q0FBd0M7QUFvQnhDO0lBa0JFLFlBQW9CLFVBQXFDO1FBQXJDLGVBQVUsR0FBVixVQUFVLENBQTJCO1FBQ3ZELElBQUksQ0FBQyxXQUFXLEdBQUcsSUFBSSwwQkFBbUIsRUFBRSxDQUFBO1FBQzVDLElBQUksQ0FBQyxPQUFPLEdBQUcsSUFBSSxjQUFPLEVBQUUsQ0FBQTtRQUM1QixJQUFJLENBQUMsV0FBVyxDQUFDLEdBQUcsQ0FBQyxJQUFJLENBQUMsT0FBTyxDQUFDLENBQUE7UUFDbEMsSUFBSSxDQUFDLFlBQVksR0FBRyxJQUFJLE9BQU8sRUFBRSxDQUFBO1FBQ2pDLElBQUksQ0FBQyxPQUFPLEdBQUcsSUFBSSxHQUFHLEVBQUUsQ0FBQTtRQUV4QixFQUFFLENBQUMsQ0FDRCxPQUFPLENBQUMsR0FBRyxDQUFDLGdCQUFnQjtZQUM1QixDQUFDLElBQUksQ0FBQyxNQUFNLENBQUMsR0FBRyxDQUFDLCtDQUErQyxDQUNsRSxDQUFDLENBQUMsQ0FBQztZQUNELElBQUksQ0FBQyxrQkFBa0IsRUFBRSxDQUFBO1FBQzNCLENBQUM7UUFFRCxJQUFJLENBQUMsYUFBYSxHQUFHO1lBQ25CLFNBQVMsRUFBRSxJQUFJLEtBQUssQ0FBQyxDQUFDLENBQUM7WUFDdkIsTUFBTSxFQUFFLElBQUksS0FBSyxDQUFDLElBQUksQ0FBQyxNQUFNLENBQUMsR0FBRyxDQUFDLG9DQUFvQyxDQUFDLENBQUM7WUFDeEUsUUFBUSxFQUFFLElBQUksS0FBSyxDQUFDLENBQUMsQ0FBQztZQUN0QixJQUFJLEVBQUUsSUFBSSxLQUFLLENBQUMsQ0FBQyxDQUFDO1lBQ2xCLElBQUksRUFB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QTtZQUNqRCxNQUFNLFFBQVEsR0FDWixHQUFHLEtBQUssTUFBTSxDQUFDLENBQUMsQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDLE9BQU8sS0FBSyxTQUFTLENBQUMsQ0FBQyxDQUFDLFNBQVMsQ0FBQyxDQUFDLENBQUMsT0FBTyxDQUFBO1lBQ3ZFLE1BQU0sT0FBTyxHQUFHLElBQUksWUFBSyxDQUFDLFFBQVEsQ0FBQyxHQUFHLEVBQUUsRUFBRSxDQUFDLEdBQUcsQ0FBQyxFQUFFLFFBQVEsQ0FBQyxHQUFHLEVBQUUsRUFBRSxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUE7WUFDdkUsTUFBTSxRQUFRLEdBQUcsSUFBSSxDQUFDLGtCQUFrQixDQUFDLE1BQU0sRUFBRSxPQUFPLENBQUMsQ0FBQTtZQUN6RCxJQUFJLEtBQUssQ0FBQTtZQUNULElBQUksQ0FBQztnQkFDSCxLQUFLLEdBQUcsT0FBTyxDQUFDLE9BQU8sQ0FBQyxPQUFPLENBQUMsVUFBVSxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsT0FBTyxFQUFFLENBQUE7WUFDN0QsQ0FBQztZQUFDLEtBQUssQ0FBQyxDQUFDLEtBQUssQ0FBQyxDQUFDLENBQUM7Z0JBQ2YsS0FBSyxHQUFHLElBQUksQ0FBQTtZQUNkLENBQUM7WUFDRCxHQUFHLENBQUMsSUFBSSxDQUFDO2dCQUNQLEdBQUcsRUFBRSxLQUFLO2dCQUNWLFFBQVE7Z0JBQ1IsT0FBTztnQkFDUCxRQUFRO2FBQ1QsQ0FBQyxDQUFBO1FBQ0osQ0FBQztRQUNELE1BQU0sQ0FBQyxHQUFHLENBQUE7SUFDWixDQUFDO0NBQ0Y7QUFsaUJELHdDQWtpQkMiLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQge1xuICBSYW5nZSxcbiAgUG9pbnQsXG4gIEVtaXR0ZXIsXG4gIENvbXBvc2l0ZURpc3Bvc2FibGUsXG4gIFRleHRCdWZmZXIsXG4gIERpcmVjdG9yeSxcbiAgVGV4dEVkaXRvcixcbn0gZnJvbSAnYXRvbSdcbmltcG9ydCAqIGFzIFV0aWwgZnJvbSAnLi4vdXRpbCdcbmltcG9ydCB7IGV4dG5hbWUgfSBmcm9tICdwYXRoJ1xuaW1wb3J0IFF1ZXVlID0gcmVxdWlyZSgncHJvbWlzZS1xdWV1ZScpXG5pbXBvcnQgeyB1bmxpdCB9IGZyb20gJ2F0b20taGFza2VsbC11dGlscydcbmltcG9ydCAqIGFzIENvbXBsZXRpb25CYWNrZW5kIGZyb20gJ2F0b20taGFza2VsbC11cGkvY29tcGxldGlvbi1iYWNrZW5kJ1xuaW1wb3J0ICogYXMgVVBJIGZyb20gJ2F0b20taGFza2VsbC11cGknXG5cbmltcG9ydCB7XG4gIEdoY01vZGlQcm9jZXNzUmVhbCxcbiAgR0hDTW9kQ2FwcyxcbiAgUnVuQXJncyxcbiAgSUVycm9yQ2FsbGJhY2tBcmdzLFxufSBmcm9tICcuL2doYy1tb2RpLXByb2Nlc3MtcmVhbCdcbmltcG9ydCB7IGNyZWF0ZUdoY01vZGlQcm9jZXNzUmVhbCB9IGZyb20gJy4vZ2hjLW1vZGktcHJvY2Vzcy1yZWFsLWZhY3RvcnknXG5pbXBvcnQgeyBnZXRTZXR0aW5ncyB9IGZyb20gJy4vc2V0dGluZ3MnXG5cbmV4cG9ydCB7IElFcnJvckNhbGxiYWNrQXJncywgUnVuQXJncywgR0hDTW9kQ2FwcyB9XG5cbnR5cGUgQ29tbWFuZHMgPVxuICB8ICdjaGVja2xpbnQnXG4gIHwgJ2Jyb3dzZSdcbiAgfCAndHlwZWluZm8nXG4gIHwgJ2ZpbmQnXG4gIHwgJ2luaXQnXG4gIHwgJ2xpc3QnXG4gIHwgJ2xvd21lbSdcblxuZXhwb3J0IGludGVyZmFjZSBTeW1ib2xEZXNjIHtcbiAgbmFtZTogc3RyaW5nXG4gIHN5bWJvbFR5cGU6IENvbXBsZXRpb25CYWNrZW5kLlN5bWJvbFR5cGVcbiAgdHlwZVNpZ25hdHVyZT86IHN0cmluZ1xuICBwYXJlbnQ/OiBzdHJpbmdcbn1cblxuZXhwb3J0IGNsYXNzIEdoY01vZGlQcm9jZXNzIHtcbiAgcHJpdmF0ZSBiYWNrZW5kOiBNYXA8c3RyaW5nLCBQcm9taXNlPEdoY01vZGlQcm9jZXNzUmVhbD4+XG4gIHByaXZhdGUgZGlzcG9zYWJsZXM6IENvbXBvc2l0ZURpc3Bvc2FibGVcbiAgcHJpdmF0ZSBlbWl0dGVyOiBFbWl0dGVyPFxuICAgIHtcbiAgICAgICdkaWQtZGVzdHJveSc6IHVuZGVmaW5lZFxuICAgICAgJ2JhY2tlbmQtYWN0aXZlJzogdW5kZWZpbmVkXG4gICAgICAnYmFja2VuZC1pZGxlJzogdW5kZWZpbmVkXG4gICAgfSxcbiAgICB7XG4gICAgICB3YXJuaW5nOiBzdHJpbmdcbiAgICAgIGVycm9yOiBJRXJyb3JDYWxsYmFja0FyZ3NcbiAgICAgICdxdWV1ZS1pZGxlJzogeyBxdWV1ZTogQ29tbWFuZHMgfVxuICAgIH1cbiAgPlxuICBwcml2YXRlIGJ1ZmZlckRpck1hcDogV2Vha01hcDxUZXh0QnVmZmVyLCBEaXJlY3Rvcnk+XG4gIHByaXZhdGUgY29tbWFuZFF1ZXVlczogeyBbSyBpbiBDb21tYW5kc106IFF1ZXVlIH1cblxuICBjb25zdHJ1Y3Rvcihwcml2YXRlIHVwaVByb21pc2U6IFByb21pc2U8VVBJLklVUElJbnN0YW5jZT4pIHtcbiAgICB0aGlzLmRpc3Bvc2FibGVzID0gbmV3IENvbXBvc2l0ZURpc3Bvc2FibGUoKVxuICAgIHRoaXMuZW1pdHRlciA9IG5ldyBFbWl0dGVyKClcbiAgICB0aGlzLmRpc3Bvc2FibGVzLmFkZCh0aGlzLmVtaXR0ZXIpXG4gICAgdGhpcy5idWZmZXJEaXJNYXAgPSBuZXcgV2Vha01hcCgpXG4gICAgdGhpcy5iYWNrZW5kID0gbmV3IE1hcCgpXG5cbiAgICBpZiAoXG4gICAgICBwcm9jZXNzLmVudi5HSENfUEFDS0FHRV9QQVRIICYmXG4gICAgICAhYXRvbS5jb25maWcuZ2V0KCdoYXNrZWxsLWdoYy1tb2Quc3VwcHJlc3NHaGNQYWNrYWdlUGF0aFdhcm5pbmcnKVxuICAgICkge1xuICAgICAgVXRpbC53YXJuR0hDUGFja2FnZVBhdGgoKVxuICAgIH1cblxuICAgIHRoaXMuY29tbWFuZFF1ZXVlcyA9IHtcbiAgICAgIGNoZWNrbGludDogbmV3IFF1ZXVlKDIpLFxuICAgICAgYnJvd3NlOiBuZXcgUXVldWUoYXRvbS5jb25maWcuZ2V0KCdoYXNrZWxsLWdoYy1tb2QubWF4QnJvd3NlUHJvY2Vzc2VzJykpLFxuICAgICAgdHlwZWluZm86IG5ldyBRdWV1ZSgxKSxcbiAgICAgIGZpbmQ6IG5ldyBRdWV1ZSgxKSxcbiAgICAgIGluaXQ6IG5ldyBRdWV1ZSg0KSxcbiAgICAgIGxpc3Q6IG5ldyBRdWV1ZSgxKSxcbiAgICAgIGxvd21lbTogbmV3IFF1ZXVlKDEpLFxuICAgIH1cbiAgICB0aGlzLmRpc3Bvc2FibGVzLmFkZChcbiAgICAgIGF0b20uY29uZmlnLm9uRGlkQ2hhbmdlKFxuICAgICAgICAnaGFza2VsbC1naGMtbW9kLm1heEJyb3dzZVByb2Nlc3NlcycsXG4gICAgICAgICh7IG5ld1ZhbHVlIH0pID0+XG4gICAgICAgICAgKHRoaXMuY29tbWFuZFF1ZXVlcy5icm93c2UgPSBuZXcgUXVldWUobmV3VmFsdWUgYXMgbnVtYmVyKSksXG4gICAgICApLFxuICAgIClcbiAgfVxuXG4gIHB1YmxpYyBhc3luYyBnZXRSb290RGlyKGJ1ZmZlcjogVGV4dEJ1ZmZlcik6IFByb21pc2U8RGlyZWN0b3J5PiB7XG4gICAgbGV0IGRpclxuICAgIGRpciA9IHRoaXMuYnVmZmVyRGlyTWFwLmdldChidWZmZXIpXG4gICAgaWYgKGRpcikge1xuICAgICAgcmV0dXJuIGRpclxuICAgIH1cbiAgICBkaXIgPSBhd2FpdCBVdGlsLmdldFJvb3REaXIoYnVmZmVyKVxuICAgIHRoaXMuYnVmZmVyRGlyTWFwLnNldChidWZmZXIsIGRpcilcbiAgICByZXR1cm4gZGlyXG4gIH1cblxuICBwdWJsaWMga2lsbFByb2Nlc3MoKSB7XG4gICAgZm9yIChjb25zdCBicCBvZiB0aGlzLmJhY2tlbmQudmFsdWVzKCkpIHtcbiAgICAgIGJwLnRoZW4oKGIpID0+IGIua2lsbFByb2Nlc3MoKSkuY2F0Y2goKGU6IEVycm9yKSA9PiB7XG4gICAgICAgIGF0b20ubm90aWZpY2F0aW9ucy5hZGRFcnJvcignRXJyb3Iga2lsbGluZyBnaGMtbW9kIHByb2Nlc3MnLCB7XG4gICAgICAgICAgZGV0YWlsOiBlLnRvU3RyaW5nKCksXG4gICAgICAgICAgc3RhY2s6IGUuc3RhY2ssXG4gICAgICAgICAgZGlzbWlzc2FibGU6IHRydWUsXG4gICAgICAgIH0pXG4gICAgICB9KVxuICAgIH1cbiAgICB0aGlzLmJhY2tlbmQuY2xlYXIoKVxuICB9XG5cbiAgcHVibGljIGRlc3Ryb3koKSB7XG4gICAgZm9yIChjb25zdCBicCBvZiB0aGlzLmJhY2tlbmQudmFsdWVzKCkpIHtcbiAgICAgIGJwLnRoZW4oKGIpID0+IGIuZGVzdHJveSgpKS5jYXRjaCgoZTogRXJyb3IpID0+IHtcbiAgICAgICAgYXRvbS5ub3RpZmljYXRpb25zLmFkZEVycm9yKCdFcnJvciBraWxsaW5nIGdoYy1tb2QgcHJvY2VzcycsIHtcbiAgICAgICAgICBkZXRhaWw6IGUudG9TdHJpbmcoKSxcbiAgICAgICAgICBzdGFjazogZS5zdGFjayxcbiAgICAgICAgICBkaXNtaXNzYWJsZTogdHJ1ZSxcbiAgICAgICAgfSlcbiAgICAgIH0pXG4gICAgfVxuICAgIHRoaXMuYmFja2VuZC5jbGVhcigpXG4gICAgdGhpcy5lbWl0dGVyLmVtaXQoJ2RpZC1kZXN0cm95JylcbiAgICB0aGlzLmRpc3Bvc2FibGVzLmRpc3Bvc2UoKVxuICB9XG5cbiAgcHVibGljIG9uRGlkRGVzdHJveShjYWxsYmFjazogKCkgPT4gdm9pZCkge1xuICAgIHJldHVybiB0aGlzLmVtaXR0ZXIub24oJ2RpZC1kZXN0cm95JywgY2FsbGJhY2spXG4gIH1cblxuICBwdWJsaWMgb25XYXJuaW5nKGNhbGxiYWNrOiAod2FybmluZzogc3RyaW5nKSA9PiB2b2lkKSB7XG4gICAgcmV0dXJuIHRoaXMuZW1pdHRlci5vbignd2FybmluZycsIGNhbGxiYWNrKVxuICB9XG5cbiAgcHVibGljIG9uRXJyb3IoY2FsbGJhY2s6IChlcnJvcjogSUVycm9yQ2FsbGJhY2tBcmdzKSA9PiB2b2lkKSB7XG4gICAgcmV0dXJuIHRoaXMuZW1pdHRlci5vbignZXJyb3InLCBjYWxsYmFjaylcbiAgfVxuXG4gIHB1YmxpYyBvbkJhY2tlbmRBY3RpdmUoY2FsbGJhY2s6ICgpID0+IHZvaWQpIHtcbiAgICByZXR1cm4gdGhpcy5lbWl0dGVyLm9uKCdiYWNrZW5kLWFjdGl2ZScsIGNhbGxiYWNrKVxuICB9XG5cbiAgcHVibGljIG9uQmFja2VuZElkbGUoY2FsbGJhY2s6ICgpID0+IHZvaWQpIHtcbiAgICByZXR1cm4gdGhpcy5lbWl0dGVyLm9uKCdiYWNrZW5kLWlkbGUnLCBjYWxsYmFjaylcbiAgfVxuXG4gIHB1YmxpYyBvblF1ZXVlSWRsZShjYWxsYmFjazogKCkgPT4gdm9pZCkge1xuICAgIHJldHVybiB0aGlzLmVtaXR0ZXIub24oJ3F1ZXVlLWlkbGUnLCBjYWxsYmFjaylcbiAgfVxuXG4gIHB1YmxpYyBhc3luYyBydW5MaXN0KGJ1ZmZlcjogVGV4dEJ1ZmZlcikge1xuICAgIHJldHVybiB0aGlzLnF1ZXVlQ21kKCdsaXN0JywgYXdhaXQgdGhpcy5nZXRSb290RGlyKGJ1ZmZlciksICgpID0+ICh7XG4gICAgICBjb21tYW5kOiAnbGlzdCcsXG4gICAgfSkpXG4gIH1cblxuICBwdWJsaWMgYXN5bmMgcnVuTGFuZyhkaXI6IERpcmVjdG9yeSkge1xuICAgIHJldHVybiB0aGlzLnF1ZXVlQ21kKCdpbml0JywgZGlyLCAoKSA9PiAoeyBjb21tYW5kOiAnbGFuZycgfSkpXG4gIH1cblxuICBwdWJsaWMgYXN5bmMgcnVuRmxhZyhkaXI6IERpcmVjdG9yeSkge1xuICAgIHJldHVybiB0aGlzLnF1ZXVlQ21kKCdpbml0JywgZGlyLCAoKSA9PiAoeyBjb21tYW5kOiAnZmxhZycgfSkpXG4gIH1cblxuICBwdWJsaWMgYXN5bmMgcnVuQnJvd3NlKFxuICAgIHJvb3REaXI6IERpcmVjdG9yeSxcbiAgICBtb2R1bGVzOiBzdHJpbmdbXSxcbiAgKTogUHJvbWlzZTxTeW1ib2xEZXNjW10+IHtcbiAgICBjb25zdCBsaW5lcyA9IGF3YWl0IHRoaXMucXVldWVDbWQoJ2Jyb3dzZScsIHJvb3REaXIsIChjYXBzKSA9PiB7XG4gICAgICBjb25zdCBhcmdzID0gY2Fwcy5icm93c2VNYWluXG4gICAgICAgID8gbW9kdWxlc1xuICAgICAgICA6IG1vZHVsZXMuZmlsdGVyKCh2KSA9PiB2ICE9PSAnTWFpbicpXG4gICAgICBpZiAoYXJncy5sZW5ndGggPT09IDApIHJldHVybiB1bmRlZmluZWRcbiAgICAgIHJldHVybiB7XG4gICAgICAgIGNvbW1hbmQ6ICdicm93c2UnLFxuICAgICAgICBkYXNoQXJnczogY2Fwcy5icm93c2VQYXJlbnRzID8gWyctZCcsICctbycsICctcCddIDogWyctZCcsICctbyddLFxuICAgICAgICBhcmdzLFxuICAgICAgfVxuICAgIH0pXG4gICAgcmV0dXJuIGxpbmVzLm1hcCgocykgPT4ge1xuICAgICAgLy8gZW51bUZyb20gOjogRW51bSBhID0+IGEgLT4gW2FdIC0tIGZyb206RW51bVxuICAgICAgY29uc3QgcGF0dGVybiA9IC9eKC4qPykgOjogKC4qPykoPzogLS0gZnJvbTooLiopKT8kL1xuICAgICAgY29uc3QgbWF0Y2ggPSBzLm1hdGNoKHBhdHRlcm4pXG4gICAgICBsZXQgbmFtZTogc3RyaW5nXG4gICAgICBsZXQgdHlwZVNpZ25hdHVyZTogc3RyaW5nIHwgdW5kZWZpbmVkXG4gICAgICBsZXQgcGFyZW50OiBzdHJpbmcgfCB1bmRlZmluZWRcbiAgICAgIGlmIChtYXRjaCkge1xuICAgICAgICBuYW1lID0gbWF0Y2hbMV1cbiAgICAgICAgdHlwZVNpZ25hdHVyZSA9IG1hdGNoWzJdXG4gICAgICAgIHBhcmVudCA9IG1hdGNoWzNdXG4gICAgICB9IGVsc2Uge1xuICAgICAgICBuYW1lID0gc1xuICAgICAgfVxuICAgICAgbGV0IHN5bWJvbFR5cGU6IENvbXBsZXRpb25CYWNrZW5kLlN5bWJvbFR5cGVcbiAgICAgIGlmICh0eXBlU2lnbmF0dXJlICYmIC9eKD86dHlwZXxkYXRhfG5ld3R5cGUpLy50ZXN0KHR5cGVTaWduYXR1cmUpKSB7XG4gICAgICAgIHN5bWJvbFR5cGUgPSAndHlwZSdcbiAgICAgIH0gZWxzZSBpZiAodHlwZVNpZ25hdHVyZSAmJiAvXig/OmNsYXNzKS8udGVzdCh0eXBlU2lnbmF0dXJlKSkge1xuICAgICAgICBzeW1ib2xUeXBlID0gJ2NsYXNzJ1xuICAgICAgfSBlbHNlIGlmICgvXlxcKC4qXFwpJC8udGVzdChuYW1lKSkge1xuICAgICAgICBzeW1ib2xUeXBlID0gJ29wZXJhdG9yJ1xuICAgICAgICBuYW1lID0gbmFtZS5zbGljZSgxLCAtMSlcbiAgICAgIH0gZWxzZSBpZiAoVXRpbC5pc1VwcGVyQ2FzZShuYW1lWzBdKSkge1xuICAgICAgICBzeW1ib2xUeXBlID0gJ3RhZydcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHN5bWJvbFR5cGUgPSAnZnVuY3Rpb24nXG4gICAgICB9XG4gICAgICByZXR1cm4geyBuYW1lLCB0eXBlU2lnbmF0dXJlLCBzeW1ib2xUeXBlLCBwYXJlbnQgfVxuICAgIH0pXG4gIH1cblxuICBwdWJsaWMgYXN5bmMgZ2V0VHlwZUluQnVmZmVyKGJ1ZmZlcjogVGV4dEJ1ZmZlciwgY3JhbmdlOiBSYW5nZSkge1xuICAgIGlmICghYnVmZmVyLmdldFVyaSgpKSB7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoJ05vIFVSSSBmb3IgYnVmZmVyJylcbiAgICB9XG4gICAgY3JhbmdlID0gVXRpbC50YWJTaGlmdEZvclJhbmdlKGJ1ZmZlciwgY3JhbmdlKVxuICAgIGNvbnN0IHJvb3REaXIgPSBhd2FpdCB0aGlzLmdldFJvb3REaXIoYnVmZmVyKVxuICAgIGNvbnN0IGxpbmVzID0gYXdhaXQgdGhpcy5xdWV1ZUNtZCgndHlwZWluZm8nLCByb290RGlyLCAoY2FwcykgPT4gKHtcbiAgICAgIGludGVyYWN0aXZlOiB0cnVlLFxuICAgICAgY29tbWFuZDogJ3R5cGUnLFxuICAgICAgdXJpOiBidWZmZXIuZ2V0VXJpKCksXG4gICAgICB0ZXh0OiBidWZmZXIuaXNNb2RpZmllZCgpID8gYnVmZmVyLmdldFRleHQoKSA6IHVuZGVmaW5lZCxcbiAgICAgIGRhc2hBcmdzOiBjYXBzLnR5cGVDb25zdHJhaW50cyA/IFsnLWMnXSA6IFtdLFxuICAgICAgYXJnczogW2NyYW5nZS5zdGFydC5yb3cgKyAxLCBjcmFuZ2Uuc3RhcnQuY29sdW1uICsgMV0ubWFwKCh2KSA9PlxuICAgICAgICB2LnRvU3RyaW5nKCksXG4gICAgICApLFxuICAgIH0pKVxuXG4gICAgY29uc3QgcnggPSAvXihcXGQrKVxccysoXFxkKylcXHMrKFxcZCspXFxzKyhcXGQrKVxccytcIihbXl0qKVwiJC8gLy8gW15dIGJhc2ljYWxseSBtZWFucyBcImFueXRoaW5nXCIsIGluY2wuIG5ld2xpbmVzXG4gICAgZm9yIChjb25zdCBsaW5lIG9mIGxpbmVzKSB7XG4gICAgICBjb25zdCBtYXRjaCA9IGxpbmUubWF0Y2gocngpXG4gICAgICBpZiAoIW1hdGNoKSB7XG4gICAgICAgIGNvbnRpbnVlXG4gICAgICB9XG4gICAgICBjb25zdCBbcm93c3RhcnQsIGNvbHN0YXJ0LCByb3dlbmQsIGNvbGVuZCwgdHlwZV0gPSBtYXRjaC5zbGljZSgxKVxuICAgICAgY29uc3QgcmFuZ2UgPSBSYW5nZS5mcm9tT2JqZWN0KFtcbiAgICAgICAgW3BhcnNlSW50KHJvd3N0YXJ0LCAxMCkgLSAxLCBwYXJzZUludChjb2xzdGFydCwgMTApIC0gMV0sXG4gICAgICAgIFtwYXJzZUludChyb3dlbmQsIDEwKSAtIDEsIHBhcnNlSW50KGNvbGVuZCwgMTApIC0gMV0sXG4gICAgICBdKVxuICAgICAgaWYgKHJhbmdlLmlzRW1wdHkoKSkge1xuICAgICAgICBjb250aW51ZVxuICAgICAgfVxuICAgICAgaWYgKCFyYW5nZS5jb250YWluc1JhbmdlKGNyYW5nZSkpIHtcbiAgICAgICAgY29udGludWVcbiAgICAgIH1cbiAgICAgIHJldHVybiB7XG4gICAgICAgIHJhbmdlOiBVdGlsLnRhYlVuc2hpZnRGb3JSYW5nZShidWZmZXIsIHJhbmdlKSxcbiAgICAgICAgdHlwZTogdHlwZS5yZXBsYWNlKC9cXFxcXCIvZywgJ1wiJyksXG4gICAgICB9XG4gICAgfVxuICAgIHRocm93IG5ldyBFcnJvcignTm8gdHlwZScpXG4gIH1cblxuICBwdWJsaWMgYXN5bmMgZG9DYXNlU3BsaXQoYnVmZmVyOiBUZXh0QnVmZmVyLCBjcmFuZ2U6IFJhbmdlKSB7XG4gICAgaWYgKCFidWZmZXIuZ2V0VXJpKCkpIHtcbiAgICAgIHRocm93IG5ldyBFcnJvcignTm8gVVJJIGZvciBidWZmZXInKVxuICAgIH1cbiAgICBjcmFuZ2UgPSBVdGlsLnRhYlNoaWZ0Rm9yUmFuZ2UoYnVmZmVyLCBjcmFuZ2UpXG4gICAgY29uc3Qgcm9vdERpciA9IGF3YWl0IHRoaXMuZ2V0Um9vdERpcihidWZmZXIpXG4gICAgY29uc3QgbGluZXMgPSBhd2FpdCB0aGlzLnF1ZXVlQ21kKCd0eXBlaW5mbycsIHJvb3REaXIsIChjYXBzKSA9PiAoe1xuICAgICAgaW50ZXJhY3RpdmU6IGNhcHMuaW50ZXJhY3RpdmVDYXNlU3BsaXQsXG4gICAgICBjb21tYW5kOiAnc3BsaXQnLFxuICAgICAgdXJpOiBidWZmZXIuZ2V0VXJpKCksXG4gICAgICB0ZXh0OiBidWZmZXIuaXNNb2RpZmllZCgpID8gYnVmZmVyLmdldFRleHQoKSA6IHVuZGVmaW5lZCxcbiAgICAgIGFyZ3M6IFtjcmFuZ2Uuc3RhcnQucm93ICsgMSwgY3JhbmdlLnN0YXJ0LmNvbHVtbiArIDFdLm1hcCgodikgPT5cbiAgICAgICAgdi50b1N0cmluZygpLFxuICAgICAgKSxcbiAgICB9KSlcblxuICAgIGNvbnN0IHJ4ID0gL14oXFxkKylcXHMrKFxcZCspXFxzKyhcXGQrKVxccysoXFxkKylcXHMrXCIoW15dKilcIiQvIC8vIFteXSBiYXNpY2FsbHkgbWVhbnMgXCJhbnl0aGluZ1wiLCBpbmNsLiBuZXdsaW5lc1xuICAgIGNvbnN0IHJlcyA9IFtdXG4gICAgZm9yIChjb25zdCBsaW5lIG9mIGxpbmVzKSB7XG4gICAgICBjb25zdCBtYXRjaCA9IGxpbmUubWF0Y2gocngpXG4gICAgICBpZiAoIW1hdGNoKSB7XG4gICAgICAgIFV0aWwud2FybihgZ2hjLW1vZCBzYXlzOiAke2xpbmV9YClcbiAgICAgICAgY29udGludWVcbiAgICAgIH1cbiAgICAgIGNvbnN0IFtyb3dzdGFydCwgY29sc3RhcnQsIHJvd2VuZCwgY29sZW5kLCB0ZXh0XSA9IG1hdGNoLnNsaWNlKDEpXG4gICAgICByZXMucHVzaCh7XG4gICAgICAgIHJhbmdlOiBSYW5nZS5mcm9tT2JqZWN0KFtcbiAgICAgICAgICBbcGFyc2VJbnQocm93c3RhcnQsIDEwKSAtIDEsIHBhcnNlSW50KGNvbHN0YXJ0LCAxMCkgLSAxXSxcbiAgICAgICAgICBbcGFyc2VJbnQocm93ZW5kLCAxMCkgLSAxLCBwYXJzZUludChjb2xlbmQsIDEwKSAtIDFdLFxuICAgICAgICBdKSxcbiAgICAgICAgcmVwbGFjZW1lbnQ6IHRleHQsXG4gICAgICB9KVxuICAgIH1cbiAgICByZXR1cm4gcmVzXG4gIH1cblxuICBwdWJsaWMgYXN5bmMgZG9TaWdGaWxsKGJ1ZmZlcjogVGV4dEJ1ZmZlciwgY3JhbmdlOiBSYW5nZSkge1xuICAgIGlmICghYnVmZmVyLmdldFVyaSgpKSB7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoJ05vIFVSSSBmb3IgYnVmZmVyJylcbiAgICB9XG4gICAgY3JhbmdlID0gVXRpbC50YWJTaGlmdEZvclJhbmdlKGJ1ZmZlciwgY3JhbmdlKVxuICAgIGNvbnN0IHJvb3REaXIgPSBhd2FpdCB0aGlzLmdldFJvb3REaXIoYnVmZmVyKVxuICAgIGNvbnN0IGxpbmVzID0gYXdhaXQgdGhpcy5xdWV1ZUNtZCgndHlwZWluZm8nLCByb290RGlyLCAoY2FwcykgPT4gKHtcbiAgICAgIGludGVyYWN0aXZlOiBjYXBzLmludGVyYWN0aXZlQ2FzZVNwbGl0LFxuICAgICAgY29tbWFuZDogJ3NpZycsXG4gICAgICB1cmk6IGJ1ZmZlci5nZXRVcmkoKSxcbiAgICAgIHRleHQ6IGJ1ZmZlci5pc01vZGlmaWVkKCkgPyBidWZmZXIuZ2V0VGV4dCgpIDogdW5kZWZpbmVkLFxuICAgICAgYXJnczogW2NyYW5nZS5zdGFydC5yb3cgKyAxLCBjcmFuZ2Uuc3RhcnQuY29sdW1uICsgMV0ubWFwKCh2KSA9PlxuICAgICAgICB2LnRvU3RyaW5nKCksXG4gICAgICApLFxuICAgIH0pKVxuICAgIGlmIChsaW5lcy5sZW5ndGggPCAyKSB7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoYENvdWxkIG5vdCB1bmRlcnN0YW5kIHJlc3BvbnNlOiAke2xpbmVzLmpvaW4oJ1xcbicpfWApXG4gICAgfVxuICAgIGNvbnN0IHJ4ID0gL14oXFxkKylcXHMrKFxcZCspXFxzKyhcXGQrKVxccysoXFxkKykkLyAvLyBwb3NpdGlvbiByeFxuICAgIGNvbnN0IG1hdGNoID0gbGluZXNbMV0ubWF0Y2gocngpXG4gICAgaWYgKCFtYXRjaCkge1xuICAgICAgdGhyb3cgbmV3IEVycm9yKGBDb3VsZCBub3QgdW5kZXJzdGFuZCByZXNwb25zZTogJHtsaW5lcy5qb2luKCdcXG4nKX1gKVxuICAgIH1cbiAgICBjb25zdCBbcm93c3RhcnQsIGNvbHN0YXJ0LCByb3dlbmQsIGNvbGVuZF0gPSBtYXRjaC5zbGljZSgxKVxuICAgIGNvbnN0IHJhbmdlID0gUmFuZ2UuZnJvbU9iamVjdChbXG4gICAgICBbcGFyc2VJbnQocm93c3RhcnQsIDEwKSAtIDEsIHBhcnNlSW50KGNvbHN0YXJ0LCAxMCkgLSAxXSxcbiAgICAgIFtwYXJzZUludChyb3dlbmQsIDEwKSAtIDEsIHBhcnNlSW50KGNvbGVuZCwgMTApIC0gMV0sXG4gICAgXSlcbiAgICByZXR1cm4ge1xuICAgICAgdHlwZTogbGluZXNbMF0sXG4gICAgICByYW5nZSxcbiAgICAgIGJvZHk6IGxpbmVzLnNsaWNlKDIpLmpvaW4oJ1xcbicpLFxuICAgIH1cbiAgfVxuXG4gIHB1YmxpYyBhc3luYyBnZXRJbmZvSW5CdWZmZXIoZWRpdG9yOiBUZXh0RWRpdG9yLCBjcmFuZ2U6IFJhbmdlKSB7XG4gICAgY29uc3QgYnVmZmVyID0gZWRpdG9yLmdldEJ1ZmZlcigpXG4gICAgaWYgKCFidWZmZXIuZ2V0VXJpKCkpIHtcbiAgICAgIHRocm93IG5ldyBFcnJvcignTm8gVVJJIGZvciBidWZmZXInKVxuICAgIH1cbiAgICBjb25zdCBzeW1JbmZvID0gVXRpbC5nZXRTeW1ib2xJblJhbmdlKGVkaXRvciwgY3JhbmdlKVxuICAgIGlmICghc3ltSW5mbykge1xuICAgICAgdGhyb3cgbmV3IEVycm9yKFwiQ291bGRuJ3QgZ2V0IHN5bWJvbCBmb3IgaW5mb1wiKVxuICAgIH1cbiAgICBjb25zdCB7IHN5bWJvbCwgcmFuZ2UgfSA9IHN5bUluZm9cblxuICAgIGNvbnN0IGxpbmVzID0gYXdhaXQgdGhpcy5xdWV1ZUNtZChcbiAgICAgICd0eXBlaW5mbycsXG4gICAgICBhd2FpdCB0aGlzLmdldFJvb3REaXIoYnVmZmVyKSxcbiAgICAgICgpID0+ICh7XG4gICAgICAgIGludGVyYWN0aXZlOiB0cnVlLFxuICAgICAgICBjb21tYW5kOiAnaW5mbycsXG4gICAgICAgIHVyaTogYnVmZmVyLmdldFVyaSgpLFxuICAgICAgICB0ZXh0OiBidWZmZXIuaXNNb2RpZmllZCgpID8gYnVmZmVyLmdldFRleHQoKSA6IHVuZGVmaW5lZCxcbiAgICAgICAgYXJnczogW3N5bWJvbF0sXG4gICAgICB9KSxcbiAgICApXG5cbiAgICBjb25zdCBpbmZvID0gbGluZXMuam9pbignXFxuJylcbiAgICBpZiAoaW5mbyA9PT0gJ0Nhbm5vdCBzaG93IGluZm8nIHx8ICFpbmZvKSB7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoJ05vIGluZm8nKVxuICAgIH0gZWxzZSB7XG4gICAgICByZXR1cm4geyByYW5nZSwgaW5mbyB9XG4gICAgfVxuICB9XG5cbiAgcHVibGljIGFzeW5jIGZpbmRTeW1ib2xQcm92aWRlcnNJbkJ1ZmZlcihlZGl0b3I6IFRleHRFZGl0b3IsIGNyYW5nZTogUmFuZ2UpIHtcbiAgICBjb25zdCBidWZmZXIgPSBlZGl0b3IuZ2V0QnVmZmVyKClcbiAgICBjb25zdCBzeW1JbmZvID0gVXRpbC5nZXRTeW1ib2xJblJhbmdlKGVkaXRvciwgY3JhbmdlKVxuICAgIGlmICghc3ltSW5mbykge1xuICAgICAgdGhyb3cgbmV3IEVycm9yKFwiQ291bGRuJ3QgZ2V0IHN5bWJvbCBmb3IgaW1wb3J0XCIpXG4gICAgfVxuICAgIGNvbnN0IHsgc3ltYm9sIH0gPSBzeW1JbmZvXG5cbiAgICByZXR1cm4gdGhpcy5xdWV1ZUNtZCgnZmluZCcsIGF3YWl0IHRoaXMuZ2V0Um9vdERpcihidWZmZXIpLCAoKSA9PiAoe1xuICAgICAgaW50ZXJhY3RpdmU6IHRydWUsXG4gICAgICBjb21tYW5kOiAnZmluZCcsXG4gICAgICBhcmdzOiBbc3ltYm9sXSxcbiAgICB9KSlcbiAgfVxuXG4gIHB1YmxpYyBhc3luYyBkb0NoZWNrQnVmZmVyKGJ1ZmZlcjogVGV4dEJ1ZmZlciwgZmFzdDogYm9vbGVhbikge1xuICAgIHJldHVybiB0aGlzLmRvQ2hlY2tPckxpbnRCdWZmZXIoJ2NoZWNrJywgYnVmZmVyLCBmYXN0KVxuICB9XG5cbiAgcHVibGljIGFzeW5jIGRvTGludEJ1ZmZlcihidWZmZXI6IFRleHRCdWZmZXIpIHtcbiAgICByZXR1cm4gdGhpcy5kb0NoZWNrT3JMaW50QnVmZmVyKCdsaW50JywgYnVmZmVyLCBmYWxzZSlcbiAgfVxuXG4gIHByaXZhdGUgYXN5bmMgZ2V0VVBJKCkge1xuICAgIHJldHVybiBQcm9taXNlLnJhY2UoW3RoaXMudXBpUHJvbWlzZSwgUHJvbWlzZS5yZXNvbHZlKHVuZGVmaW5lZCldKVxuICB9XG5cbiAgcHJpdmF0ZSBhc3luYyBpbml0QmFja2VuZChyb290RGlyOiBEaXJlY3RvcnkpOiBQcm9taXNlPEdoY01vZGlQcm9jZXNzUmVhbD4ge1xuICAgIGNvbnN0IHJvb3RQYXRoID0gcm9vdERpci5nZXRQYXRoKClcbiAgICBjb25zdCBjYWNoZWQgPSB0aGlzLmJhY2tlbmQuZ2V0KHJvb3RQYXRoKVxuICAgIGlmIChjYWNoZWQpIHtcbiAgICAgIHJldHVybiBjYWNoZWRcbiAgICB9XG4gICAgY29uc3QgYmFja2VuZCA9IHRoaXMuY3JlYXRlQmFja2VuZChyb290RGlyKVxuICAgIHRoaXMuYmFja2VuZC5zZXQocm9vdFBhdGgsIGJhY2tlbmQpXG4gICAgcmV0dXJuIGJhY2tlbmRcbiAgfVxuXG4gIHByaXZhdGUgYXN5bmMgY3JlYXRlQmFja2VuZChyb290RGlyOiBEaXJlY3RvcnkpOiBQcm9taXNlPEdoY01vZGlQcm9jZXNzUmVhbD4ge1xuICAgIGNvbnN0IG5ld0JhY2tlbmQgPSBjcmVhdGVHaGNNb2RpUHJvY2Vzc1JlYWwocm9vdERpciwgYXdhaXQgdGhpcy5nZXRVUEkoKSlcbiAgICBjb25zdCBiYWNrZW5kID0gYXdhaXQgbmV3QmFja2VuZFxuICAgIHRoaXMuZGlzcG9zYWJsZXMuYWRkKFxuICAgICAgYmFja2VuZC5vbkVycm9yKChhcmcpID0+IHRoaXMuZW1pdHRlci5lbWl0KCdlcnJvcicsIGFyZykpLFxuICAgICAgYmFja2VuZC5vbldhcm5pbmcoKGFyZykgPT4gdGhpcy5lbWl0dGVyLmVtaXQoJ3dhcm5pbmcnLCBhcmcpKSxcbiAgICApXG4gICAgcmV0dXJuIGJhY2tlbmRcbiAgfVxuXG4gIHByaXZhdGUgYXN5bmMgcXVldWVDbWQoXG4gICAgcXVldWVOYW1lOiBDb21tYW5kcyxcbiAgICBkaXI6IERpcmVjdG9yeSxcbiAgICBydW5BcmdzRnVuYzogKFxuICAgICAgY2FwczogR0hDTW9kQ2FwcyxcbiAgICApID0+XG4gICAgICB8IHtcbiAgICAgICAgICBjb21tYW5kOiBzdHJpbmdcbiAgICAgICAgICB0ZXh0Pzogc3RyaW5nXG4gICAgICAgICAgdXJpPzogc3RyaW5nXG4gICAgICAgICAgaW50ZXJhY3RpdmU/OiBib29sZWFuXG4gICAgICAgICAgZGFzaEFyZ3M/OiBzdHJpbmdbXVxuICAgICAgICAgIGFyZ3M/OiBzdHJpbmdbXVxuICAgICAgICB9XG4gICAgICB8IHVuZGVmaW5lZCxcbiAgKTogUHJvbWlzZTxzdHJpbmdbXT4ge1xuICAgIGlmIChhdG9tLmNvbmZpZy5nZXQoJ2hhc2tlbGwtZ2hjLW1vZC5sb3dNZW1vcnlTeXN0ZW0nKSkge1xuICAgICAgcXVldWVOYW1lID0gJ2xvd21lbSdcbiAgICB9XG4gICAgY29uc3QgYmFja2VuZCA9IGF3YWl0IHRoaXMuaW5pdEJhY2tlbmQoZGlyKVxuICAgIGNvbnN0IHByb21pc2UgPSB0aGlzLmNvbW1hbmRRdWV1ZXNbcXVldWVOYW1lXS5hZGQoYXN5bmMgKCkgPT4ge1xuICAgICAgdGhpcy5lbWl0dGVyLmVtaXQoJ2JhY2tlbmQtYWN0aXZlJylcbiAgICAgIHRyeSB7XG4gICAgICAgIGNvbnN0IHNldHRpbmdzID0gYXdhaXQgZ2V0U2V0dGluZ3MoZGlyKVxuICAgICAgICBpZiAoc2V0dGluZ3MuZGlzYWJsZSkge1xuICAgICAgICAgIHRocm93IG5ldyBFcnJvcignR2hjLW1vZCBkaXNhYmxlZCBpbiBzZXR0aW5ncycpXG4gICAgICAgIH1cbiAgICAgICAgY29uc3QgcnVuQXJncyA9IHJ1bkFyZ3NGdW5jKGJhY2tlbmQuZ2V0Q2FwcygpKVxuICAgICAgICBpZiAocnVuQXJncyA9PT0gdW5kZWZpbmVkKSByZXR1cm4gW11cbiAgICAgICAgY29uc3QgdXBpID0gYXdhaXQgdGhpcy5nZXRVUEkoKVxuICAgICAgICBsZXQgYnVpbGRlcjogc3RyaW5nIHwgdW5kZWZpbmVkXG4gICAgICAgIGlmICh1cGkgJiYgYXRvbS5jb25maWcuZ2V0KCdoYXNrZWxsLWdoYy1tb2QuYnVpbGRlck1hbmFnZW1lbnQnKSkge1xuICAgICAgICAgIC8vIFRPRE86IHRoaXMgaXMgdXNlZCB0d2ljZSwgdGhlIHNlY29uZCB0aW1lIGluIGdoYy1tb2QtcHJvY2Vzcy1yZWFsLWZhY3RvcnkudHMsIHNob3VsZCBwcm9iYWJseSBmaXggdGhhdFxuICAgICAgICAgIGNvbnN0IGIgPSBhd2FpdCB1cGkuZ2V0T3RoZXJzQ29uZmlnUGFyYW08eyBuYW1lOiBzdHJpbmcgfT4oXG4gICAgICAgICAgICAnaWRlLWhhc2tlbGwtY2FiYWwnLFxuICAgICAgICAgICAgJ2J1aWxkZXInLFxuICAgICAgICAgIClcbiAgICAgICAgICBpZiAoYikgYnVpbGRlciA9IGIubmFtZVxuICAgICAgICB9XG4gICAgICAgIHJldHVybiBiYWNrZW5kLnJ1bih7XG4gICAgICAgICAgLi4ucnVuQXJncyxcbiAgICAgICAgICBidWlsZGVyLFxuICAgICAgICAgIHN1cHByZXNzRXJyb3JzOiBzZXR0aW5ncy5zdXBwcmVzc0Vycm9ycyxcbiAgICAgICAgICBnaGNPcHRpb25zOiBzZXR0aW5ncy5naGNPcHRpb25zLFxuICAgICAgICAgIGdoY01vZE9wdGlvbnM6IHNldHRpbmdzLmdoY01vZE9wdGlvbnMsXG4gICAgICAgIH0pXG4gICAgICB9IGNhdGNoIChlcnIpIHtcbiAgICAgICAgVXRpbC53YXJuKGVycilcbiAgICAgICAgdGhyb3cgZXJyXG4gICAgICB9XG4gICAgfSlcbiAgICBwcm9taXNlXG4gICAgICAudGhlbigoKSA9PiB7XG4gICAgICAgIGNvbnN0IHFlID0gKHFuOiBDb21tYW5kcykgPT4ge1xuICAgICAgICAgIGNvbnN0IHEgPSB0aGlzLmNvbW1hbmRRdWV1ZXNbcW5dXG4gICAgICAgICAgcmV0dXJuIHEuZ2V0UXVldWVMZW5ndGgoKSArIHEuZ2V0UGVuZGluZ0xlbmd0aCgpID09PSAwXG4gICAgICAgIH1cbiAgICAgICAgaWYgKHFlKHF1ZXVlTmFtZSkpIHtcbiAgICAgICAgICB0aGlzLmVtaXR0ZXIuZW1pdCgncXVldWUtaWRsZScsIHsgcXVldWU6IHF1ZXVlTmFtZSB9KVxuICAgICAgICAgIGlmIChPYmplY3Qua2V5cyh0aGlzLmNvbW1hbmRRdWV1ZXMpLmV2ZXJ5KHFlKSkge1xuICAgICAgICAgICAgdGhpcy5lbWl0dGVyLmVtaXQoJ2JhY2tlbmQtaWRsZScpXG4gICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICB9KVxuICAgICAgLmNhdGNoKChlOiBFcnJvcikgPT4ge1xuICAgICAgICBhdG9tLm5vdGlmaWNhdGlvbnMuYWRkRXJyb3IoJ0Vycm9yIGluIEdIQ01vZCBjb21tYW5kIHF1ZXVlJywge1xuICAgICAgICAgIGRldGFpbDogZS50b1N0cmluZygpLFxuICAgICAgICAgIHN0YWNrOiBlLnN0YWNrLFxuICAgICAgICAgIGRpc21pc3NhYmxlOiB0cnVlLFxuICAgICAgICB9KVxuICAgICAgfSlcbiAgICByZXR1cm4gcHJvbWlzZVxuICB9XG5cbiAgcHJpdmF0ZSBhc3luYyBkb0NoZWNrT3JMaW50QnVmZmVyKFxuICAgIGNtZDogJ2NoZWNrJyB8ICdsaW50JyxcbiAgICBidWZmZXI6IFRleHRCdWZmZXIsXG4gICAgZmFzdDogYm9vbGVhbixcbiAgKSB7XG4gICAgbGV0IGRhc2hBcmdzXG4gICAgaWYgKGJ1ZmZlci5pc0VtcHR5KCkpIHtcbiAgICAgIHJldHVybiBbXVxuICAgIH1cbiAgICBpZiAoIWJ1ZmZlci5nZXRVcmkoKSkge1xuICAgICAgcmV0dXJuIFtdXG4gICAgfVxuXG4gICAgLy8gQSBkaXJ0eSBoYWNrIHRvIG1ha2UgbGludCB3b3JrIHdpdGggbGhzXG4gICAgbGV0IHVyaSA9IGJ1ZmZlci5nZXRVcmkoKVxuICAgIGNvbnN0IG9sZHVyaSA9IGJ1ZmZlci5nZXRVcmkoKVxuICAgIGxldCB0ZXh0OiBzdHJpbmcgfCB1bmRlZmluZWRcbiAgICB0cnkge1xuICAgICAgaWYgKGNtZCA9PT0gJ2xpbnQnICYmIGV4dG5hbWUodXJpKSA9PT0gJy5saHMnKSB7XG4gICAgICAgIHVyaSA9IHVyaS5zbGljZSgwLCAtMSlcbiAgICAgICAgdGV4dCA9IGF3YWl0IHVubGl0KG9sZHVyaSwgYnVmZmVyLmdldFRleHQoKSlcbiAgICAgIH0gZWxzZSBpZiAoYnVmZmVyLmlzTW9kaWZpZWQoKSkge1xuICAgICAgICB0ZXh0ID0gYnVmZmVyLmdldFRleHQoKVxuICAgICAgfVxuICAgIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgICAvLyBUT0RPOiBSZWplY3RcbiAgICAgIGNvbnN0IG0gPSAoZXJyb3IgYXMgRXJyb3IpLm1lc3NhZ2UubWF0Y2goL14oLio/KTooWzAtOV0rKTogKiguKikgKiQvKVxuICAgICAgaWYgKCFtKSB7XG4gICAgICAgIHRocm93IGVycm9yXG4gICAgICB9XG4gICAgICBjb25zdCBbdXJpMiwgbGluZSwgbWVzc10gPSBtLnNsaWNlKDEpXG4gICAgICByZXR1cm4gW1xuICAgICAgICB7XG4gICAgICAgICAgdXJpOiB1cmkyLFxuICAgICAgICAgIHBvc2l0aW9uOiBuZXcgUG9pbnQocGFyc2VJbnQobGluZSwgMTApIC0gMSwgMCksXG4gICAgICAgICAgbWVzc2FnZTogbWVzcyxcbiAgICAgICAgICBzZXZlcml0eTogJ2xpbnQnLFxuICAgICAgICB9LFxuICAgICAgXVxuICAgIH1cbiAgICAvLyBlbmQgb2YgZGlydHkgaGFja1xuXG4gICAgLy8gdHNsaW50OmRpc2FibGUtbmV4dC1saW5lOiB0b3RhbGl0eS1jaGVja1xuICAgIGlmIChjbWQgPT09ICdsaW50Jykge1xuICAgICAgY29uc3Qgb3B0czogc3RyaW5nW10gPSBhdG9tLmNvbmZpZy5nZXQoJ2hhc2tlbGwtZ2hjLW1vZC5obGludE9wdGlvbnMnKVxuICAgICAgZGFzaEFyZ3MgPSBbXVxuICAgICAgZm9yIChjb25zdCBvcHQgb2Ygb3B0cykge1xuICAgICAgICBkYXNoQXJncy5wdXNoKCctLWhsaW50T3B0Jywgb3B0KVxuICAgICAgfVxuICAgIH1cblxuICAgIGNvbnN0IHJvb3REaXIgPSBhd2FpdCB0aGlzLmdldFJvb3REaXIoYnVmZmVyKVxuXG4gICAgY29uc3QgdGV4dEIgPSB0ZXh0XG4gICAgY29uc3QgZGFzaEFyZ3NCID0gZGFzaEFyZ3NcbiAgICBjb25zdCBsaW5lcyA9IGF3YWl0IHRoaXMucXVldWVDbWQoJ2NoZWNrbGludCcsIHJvb3REaXIsICgpID0+ICh7XG4gICAgICBpbnRlcmFjdGl2ZTogZmFzdCxcbiAgICAgIGNvbW1hbmQ6IGNtZCxcbiAgICAgIHVyaSxcbiAgICAgIHRleHQ6IHRleHRCLFxuICAgICAgZGFzaEFyZ3M6IGRhc2hBcmdzQixcbiAgICB9KSlcblxuICAgIGNvbnN0IHJ4ID0gL14oLio/KTooWzAtOVxcc10rKTooWzAtOVxcc10rKTogKig/OihXYXJuaW5nfEVycm9yKTogKik/KFteXSopL1xuICAgIGNvbnN0IHJlcyA9IFtdXG4gICAgZm9yIChjb25zdCBsaW5lIG9mIGxpbmVzKSB7XG4gICAgICBjb25zdCBtYXRjaCA9IGxpbmUubWF0Y2gocngpXG4gICAgICBpZiAoIW1hdGNoKSB7XG4gICAgICAgIGlmIChsaW5lLnRyaW0oKS5sZW5ndGgpIHtcbiAgICAgICAgICBVdGlsLndhcm4oYGdoYy1tb2Qgc2F5czogJHtsaW5lfWApXG4gICAgICAgIH1cbiAgICAgICAgY29udGludWVcbiAgICAgIH1cbiAgICAgIGNvbnN0IFtmaWxlMiwgcm93LCBjb2wsIHdhcm5pbmcsIG1lc3NhZ2VdID0gbWF0Y2guc2xpY2UoMSlcbiAgICAgIGlmIChmaWxlMiA9PT0gJ0R1bW15JyAmJiByb3cgPT09ICcwJyAmJiBjb2wgPT09ICcwJykge1xuICAgICAgICBpZiAod2FybmluZyA9PT0gJ0Vycm9yJykge1xuICAgICAgICAgIHRoaXMuZW1pdHRlci5lbWl0KCdlcnJvcicsIHtcbiAgICAgICAgICAgIGVycjogVXRpbC5ta0Vycm9yKCdHSENNb2RTdGRvdXRFcnJvcicsIG1lc3NhZ2UpLFxuICAgICAgICAgICAgY2FwczogKGF3YWl0IHRoaXMuaW5pdEJhY2tlbmQocm9vdERpcikpLmdldENhcHMoKSwgLy8gVE9ETzogVGhpcyBpcyBub3QgcHJldHR5XG4gICAgICAgICAgfSlcbiAgICAgICAgICBjb250aW51ZVxuICAgICAgICB9IGVsc2UgaWYgKHdhcm5pbmcgPT09ICdXYXJuaW5nJykge1xuICAgICAgICAgIHRoaXMuZW1pdHRlci5lbWl0KCd3YXJuaW5nJywgbWVzc2FnZSlcbiAgICAgICAgICBjb250aW51ZVxuICAgICAgICB9XG4gICAgICB9XG5cbiAgICAgIGNvbnN0IGZpbGUgPSB1cmkuZW5kc1dpdGgoZmlsZTIpID8gb2xkdXJpIDogZmlsZTJcbiAgICAgIGNvbnN0IHNldmVyaXR5ID1cbiAgICAgICAgY21kID09PSAnbGludCcgPyAnbGludCcgOiB3YXJuaW5nID09PSAnV2FybmluZycgPyAnd2FybmluZycgOiAnZXJyb3InXG4gICAgICBjb25zdCBtZXNzUG9zID0gbmV3IFBvaW50KHBhcnNlSW50KHJvdywgMTApIC0gMSwgcGFyc2VJbnQoY29sLCAxMCkgLSAxKVxuICAgICAgY29uc3QgcG9zaXRpb24gPSBVdGlsLnRhYlVuc2hpZnRGb3JQb2ludChidWZmZXIsIG1lc3NQb3MpXG4gICAgICBsZXQgbXl1cmlcbiAgICAgIHRyeSB7XG4gICAgICAgIG15dXJpID0gcm9vdERpci5nZXRGaWxlKHJvb3REaXIucmVsYXRpdml6ZShmaWxlKSkuZ2V0UGF0aCgpXG4gICAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgICBteXVyaSA9IGZpbGVcbiAgICAgIH1cbiAgICAgIHJlcy5wdXNoKHtcbiAgICAgICAgdXJpOiBteXVyaSxcbiAgICAgICAgcG9zaXRpb24sXG4gICAgICAgIG1lc3NhZ2UsXG4gICAgICAgIHNldmVyaXR5LFxuICAgICAgfSlcbiAgICB9XG4gICAgcmV0dXJuIHJlc1xuICB9XG59XG4iXX0=