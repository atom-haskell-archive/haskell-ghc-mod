"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
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
const import_list_view_1 = require("./views/import-list-view");
const Util = require("./util");
const util_1 = require("./util");
const messageTypes = {
    error: {},
    warning: {},
    lint: {},
};
const addMsgTypes = {
    'ghc-mod': {
        uriFilter: false,
        autoScroll: true,
    },
};
const contextScope = 'atom-text-editor[data-grammar~="haskell"]';
const mainMenu = {
    label: 'ghc-mod',
    menu: [
        { label: 'Check', command: 'haskell-ghc-mod:check-file' },
        { label: 'Lint', command: 'haskell-ghc-mod:lint-file' },
        { label: 'Stop Backend', command: 'haskell-ghc-mod:shutdown-backend' },
    ],
};
class UPIConsumer {
    constructor(register, process) {
        this.process = process;
        this.disposables = new atom_1.CompositeDisposable();
        this.processMessages = [];
        this.lastMessages = [];
        this.msgBackend = atom.config.get('haskell-ghc-mod.ghcModMessages');
        this.contextCommands = {
            'haskell-ghc-mod:show-type': this.tooltipCommand(this.typeTooltip.bind(this)),
            'haskell-ghc-mod:show-info': this.tooltipCommand(this.infoTooltip.bind(this)),
            'haskell-ghc-mod:case-split': this.caseSplitCommand.bind(this),
            'haskell-ghc-mod:sig-fill': this.sigFillCommand.bind(this),
            'haskell-ghc-mod:go-to-declaration': this.goToDeclCommand.bind(this),
            'haskell-ghc-mod:show-info-fallback-to-type': this.tooltipCommand(this.infoTypeTooltip.bind(this)),
            'haskell-ghc-mod:show-type-fallback-to-info': this.tooltipCommand(this.typeInfoTooltip.bind(this)),
            'haskell-ghc-mod:show-type-and-info': this.tooltipCommand(this.typeAndInfoTooltip.bind(this)),
            'haskell-ghc-mod:insert-type': this.insertTypeCommand.bind(this),
            'haskell-ghc-mod:insert-import': this.insertImportCommand.bind(this),
        };
        this.globalCommands = Object.assign({ 'haskell-ghc-mod:check-file': this.checkCommand.bind(this), 'haskell-ghc-mod:lint-file': this.lintCommand.bind(this) }, this.contextCommands);
        this.contextMenu = {
            label: 'ghc-mod',
            submenu: [
                { label: 'Show Type', command: 'haskell-ghc-mod:show-type' },
                { label: 'Show Info', command: 'haskell-ghc-mod:show-info' },
                { label: 'Show Type And Info', command: 'haskell-ghc-mod:show-type-and-info' },
                { label: 'Case Split', command: 'haskell-ghc-mod:case-split' },
                { label: 'Sig Fill', command: 'haskell-ghc-mod:sig-fill' },
                { label: 'Insert Type', command: 'haskell-ghc-mod:insert-type' },
                { label: 'Insert Import', command: 'haskell-ghc-mod:insert-import' },
                { label: 'Go To Declaration', command: 'haskell-ghc-mod:go-to-declaration' },
            ],
        };
        this.disposables.add(this.process.onError(this.handleProcessError.bind(this)), this.process.onWarning(this.handleProcessWarning.bind(this)));
        const msgTypes = this.msgBackend === 'upi'
            ? Object.assign({}, messageTypes, addMsgTypes) : messageTypes;
        this.upi = register({
            name: 'haskell-ghc-mod',
            menu: mainMenu,
            messageTypes: msgTypes,
            tooltip: this.shouldShowTooltip.bind(this),
            events: {
                onDidSaveBuffer: (buffer) => __awaiter(this, void 0, void 0, function* () { return this.checkLint(buffer, 'Save', atom.config.get('haskell-ghc-mod.alwaysInteractiveCheck')); }),
                onDidStopChanging: (buffer) => __awaiter(this, void 0, void 0, function* () { return this.checkLint(buffer, 'Change', true); }),
            },
        });
        this.disposables.add(this.upi, this.process.onBackendActive(() => this.upi.setStatus({ status: 'progress', detail: '' })), this.process.onBackendIdle(() => this.upi.setStatus({ status: 'ready', detail: '' })), atom.commands.add(contextScope, this.globalCommands));
        const cm = {};
        cm[contextScope] = [this.contextMenu];
        this.disposables.add(atom.contextMenu.add(cm));
    }
    dispose() {
        this.disposables.dispose();
    }
    shouldShowTooltip(editor, crange, type) {
        return __awaiter(this, void 0, void 0, function* () {
            const n = type === 'mouse' ? 'haskell-ghc-mod.onMouseHoverShow'
                : type === 'selection' ? 'haskell-ghc-mod.onSelectionShow'
                    : undefined;
            const t = n && atom.config.get(n);
            if (t)
                return this[`${t}Tooltip`](editor, crange);
        });
    }
    checkCommand({ currentTarget }) {
        return __awaiter(this, void 0, void 0, function* () {
            const editor = currentTarget.getModel();
            const res = yield this.process.doCheckBuffer(editor.getBuffer(), atom.config.get('haskell-ghc-mod.alwaysInteractiveCheck'));
            this.setMessages(res);
        });
    }
    lintCommand({ currentTarget }) {
        return __awaiter(this, void 0, void 0, function* () {
            const editor = currentTarget.getModel();
            const res = yield this.process.doLintBuffer(editor.getBuffer());
            this.setMessages(res);
        });
    }
    tooltipCommand(tooltipfun) {
        return ({ currentTarget, detail }) => __awaiter(this, void 0, void 0, function* () {
            return this.upi.showTooltip({
                editor: currentTarget.getModel(),
                detail,
                tooltip(crange) {
                    return __awaiter(this, void 0, void 0, function* () {
                        return tooltipfun(currentTarget.getModel(), crange);
                    });
                },
            });
        });
    }
    insertTypeCommand({ currentTarget, detail }) {
        return __awaiter(this, void 0, void 0, function* () {
            const editor = currentTarget.getModel();
            const er = this.upi.getEventRange(editor, detail);
            if (er === undefined) {
                return;
            }
            const { crange, pos } = er;
            const symInfo = Util.getSymbolAtPoint(editor, pos);
            if (!symInfo) {
                return;
            }
            const { scope, range, symbol } = symInfo;
            if (scope.startsWith('keyword.operator.')) {
                return;
            }
            const { type } = yield this.process.getTypeInBuffer(editor.getBuffer(), crange);
            if (editor.getTextInBufferRange([range.end, editor.bufferRangeForBufferRow(range.end.row).end]).match(/=/)) {
                let indent = editor.getTextInBufferRange([[range.start.row, 0], range.start]);
                let birdTrack = '';
                if (editor.scopeDescriptorForBufferPosition(pos).getScopesArray().includes('meta.embedded.haskell')) {
                    birdTrack = indent.slice(0, 2);
                    indent = indent.slice(2);
                }
                if (indent.match(/\S/)) {
                    indent = indent.replace(/\S/g, ' ');
                }
                editor.setTextInBufferRange([range.start, range.start], `${symbol} :: ${type}\n${birdTrack}${indent}`);
            }
            else {
                editor.setTextInBufferRange(range, `(${editor.getTextInBufferRange(range)} :: ${type})`);
            }
        });
    }
    caseSplitCommand({ currentTarget, detail }) {
        return __awaiter(this, void 0, void 0, function* () {
            const editor = currentTarget.getModel();
            const evr = this.upi.getEventRange(editor, detail);
            if (!evr) {
                return;
            }
            const { crange } = evr;
            const res = yield this.process.doCaseSplit(editor.getBuffer(), crange);
            for (const { range, replacement } of res) {
                editor.setTextInBufferRange(range, replacement);
            }
        });
    }
    sigFillCommand({ currentTarget, detail }) {
        return __awaiter(this, void 0, void 0, function* () {
            const editor = currentTarget.getModel();
            const evr = this.upi.getEventRange(editor, detail);
            if (!evr) {
                return;
            }
            const { crange } = evr;
            const res = yield this.process.doSigFill(editor.getBuffer(), crange);
            editor.transact(() => {
                const { type, range, body } = res;
                const sig = editor.getTextInBufferRange(range);
                let indent = editor.indentLevelForLine(sig);
                const pos = range.end;
                const text = `\n${body}`;
                if (type === 'instance') {
                    indent += 1;
                    if (!sig.endsWith(' where')) {
                        editor.setTextInBufferRange([range.end, range.end], ' where');
                    }
                }
                const newrange = editor.setTextInBufferRange([pos, pos], text);
                newrange.getRows().slice(1).map((row) => editor.setIndentationForBufferRow(row, indent));
            });
        });
    }
    goToDeclCommand({ currentTarget, detail }) {
        return __awaiter(this, void 0, void 0, function* () {
            const editor = currentTarget.getModel();
            const evr = this.upi.getEventRange(editor, detail);
            if (!evr) {
                return;
            }
            const { crange } = evr;
            const { info } = yield this.process.getInfoInBuffer(editor, crange);
            const res = /.*-- Defined at (.+):(\d+):(\d+)/.exec(info);
            if (!res) {
                return;
            }
            const [fn, line, col] = res.slice(1);
            const rootDir = yield this.process.getRootDir(editor.getBuffer());
            if (!rootDir) {
                return;
            }
            const uri = rootDir.getFile(fn).getPath() || fn;
            yield atom.workspace.open(uri, {
                initialLine: parseInt(line, 10) - 1,
                initialColumn: parseInt(col, 10) - 1,
            });
        });
    }
    insertImportCommand({ currentTarget, detail }) {
        return __awaiter(this, void 0, void 0, function* () {
            const editor = currentTarget.getModel();
            const buffer = editor.getBuffer();
            const evr = this.upi.getEventRange(editor, detail);
            if (!evr) {
                return;
            }
            const { crange } = evr;
            const lines = yield this.process.findSymbolProvidersInBuffer(editor, crange);
            const mod = yield import_list_view_1.importListView(lines);
            if (mod) {
                const pi = yield new Promise((resolve) => {
                    buffer.backwardsScan(/^(\s*)(import|module)/, ({ match, range, stop }) => {
                        let indent = '';
                        switch (match[2]) {
                            case 'import':
                                indent = `\n${match[1]}`;
                                break;
                            case 'module':
                                indent = `\n\n${match[1]}`;
                                break;
                        }
                        resolve({ pos: buffer.rangeForRow(range.start.row).end, indent, end: '' });
                    });
                    resolve({
                        pos: buffer.getFirstPosition(),
                        indent: '',
                        end: '\n',
                    });
                });
                editor.setTextInBufferRange([pi.pos, pi.pos], `${pi.indent}import ${mod}${pi.end}`);
            }
        });
    }
    typeTooltip(e, p) {
        return __awaiter(this, void 0, void 0, function* () {
            const { range, type } = yield this.process.getTypeInBuffer(e.getBuffer(), p);
            return {
                range,
                text: {
                    text: type,
                    highlighter: atom.config.get('haskell-ghc-mod.highlightTooltips') ?
                        'hint.type.haskell' : undefined,
                },
            };
        });
    }
    infoTooltip(e, p) {
        return __awaiter(this, void 0, void 0, function* () {
            const { range, info } = yield this.process.getInfoInBuffer(e, p);
            return {
                range,
                text: {
                    text: info,
                    highlighter: atom.config.get('haskell-ghc-mod.highlightTooltips') ?
                        'source.haskell' : undefined,
                },
            };
        });
    }
    infoTypeTooltip(e, p) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                return yield this.infoTooltip(e, p);
            }
            catch (_a) {
                return this.typeTooltip(e, p);
            }
        });
    }
    typeInfoTooltip(e, p) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                return yield this.typeTooltip(e, p);
            }
            catch (_a) {
                return this.infoTooltip(e, p);
            }
        });
    }
    typeAndInfoTooltip(e, p) {
        return __awaiter(this, void 0, void 0, function* () {
            const typeP = this.typeTooltip(e, p).catch(() => undefined);
            const infoP = this.infoTooltip(e, p).catch(() => undefined);
            const [type, info] = yield Promise.all([typeP, infoP]);
            let range;
            let text;
            if (type && info) {
                range = type.range.union(info.range);
                text = `:: ${type.text.text}\n${info.text.text}`;
            }
            else if (type) {
                range = type.range;
                text = `:: ${type.text.text}`;
            }
            else if (info) {
                range = info.range;
                text = info.text.text;
            }
            else {
                throw new Error('Got neither type nor info');
            }
            const highlighter = atom.config.get('haskell-ghc-mod.highlightTooltips') ? 'source.haskell' : undefined;
            return { range, text: { text, highlighter } };
        });
    }
    setHighlighter() {
        if (atom.config.get('haskell-ghc-mod.highlightMessages')) {
            return (m) => {
                if (typeof m.message === 'string') {
                    const message = {
                        text: m.message,
                        highlighter: 'hint.message.haskell',
                    };
                    return Object.assign({}, m, { message });
                }
                else {
                    return m;
                }
            };
        }
        else {
            return (m) => m;
        }
    }
    setMessages(messages) {
        this.lastMessages = messages.map(this.setHighlighter());
        this.sendMessages();
    }
    sendMessages() {
        this.upi.setMessages(this.processMessages.concat(this.lastMessages));
    }
    checkLint(buffer, opt, fast) {
        return __awaiter(this, void 0, void 0, function* () {
            const check = atom.config.get(`haskell-ghc-mod.on${opt}Check`);
            const lint = atom.config.get(`haskell-ghc-mod.on${opt}Lint`);
            let res;
            if (check && lint) {
                res = yield this.process.doCheckAndLint(buffer, fast);
            }
            else if (check) {
                res = yield this.process.doCheckBuffer(buffer, fast);
            }
            else if (lint) {
                res = yield this.process.doLintBuffer(buffer);
            }
            if (res) {
                this.setMessages(res);
            }
        });
    }
    consoleReport(arg) {
        console.error(Util.formatError(arg), Util.getErrorDetail(arg));
    }
    handleProcessError(arg) {
        switch (this.msgBackend) {
            case 'upi':
                this.processMessages.push({
                    message: Util.formatError(arg)
                        + '\n\nSee console (View → Developer → Toggle Developer Tools → Console tab) for details.',
                    severity: 'ghc-mod',
                });
                this.consoleReport(arg);
                this.sendMessages();
                break;
            case 'console':
                this.consoleReport(arg);
                break;
            case 'popup':
                this.consoleReport(arg);
                atom.notifications.addError(Util.formatError(arg), {
                    detail: Util.getErrorDetail(arg),
                    dismissable: true,
                });
                break;
        }
    }
    handleProcessWarning(warning) {
        switch (this.msgBackend) {
            case 'upi':
                this.processMessages.push({
                    message: warning,
                    severity: 'ghc-mod',
                });
                Util.warn(warning);
                this.sendMessages();
                break;
            case 'console':
                Util.warn(warning);
                break;
            case 'popup':
                Util.warn(warning);
                atom.notifications.addWarning(warning, {
                    dismissable: false,
                });
                break;
        }
    }
}
__decorate([
    util_1.handleException,
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], UPIConsumer.prototype, "checkCommand", null);
__decorate([
    util_1.handleException,
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], UPIConsumer.prototype, "lintCommand", null);
__decorate([
    util_1.handleException,
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], UPIConsumer.prototype, "insertTypeCommand", null);
__decorate([
    util_1.handleException,
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], UPIConsumer.prototype, "caseSplitCommand", null);
__decorate([
    util_1.handleException,
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], UPIConsumer.prototype, "sigFillCommand", null);
__decorate([
    util_1.handleException,
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], UPIConsumer.prototype, "goToDeclCommand", null);
__decorate([
    util_1.handleException,
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], UPIConsumer.prototype, "insertImportCommand", null);
exports.UPIConsumer = UPIConsumer;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidXBpLWNvbnN1bWVyLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vc3JjL3VwaS1jb25zdW1lci50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOzs7Ozs7Ozs7Ozs7Ozs7Ozs7O0FBQUEsK0JBQTZEO0FBRTdELCtEQUF5RDtBQUN6RCwrQkFBOEI7QUFDOUIsaUNBQXdDO0FBRXhDLE1BQU0sWUFBWSxHQUFHO0lBQ25CLEtBQUssRUFBRSxFQUFFO0lBQ1QsT0FBTyxFQUFFLEVBQUU7SUFDWCxJQUFJLEVBQUUsRUFBRTtDQUNULENBQUE7QUFFRCxNQUFNLFdBQVcsR0FBRztJQUNsQixTQUFTLEVBQUU7UUFDVCxTQUFTLEVBQUUsS0FBSztRQUNoQixVQUFVLEVBQUUsSUFBSTtLQUNqQjtDQUNGLENBQUE7QUFFRCxNQUFNLFlBQVksR0FBRywyQ0FBMkMsQ0FBQTtBQUVoRSxNQUFNLFFBQVEsR0FBRztJQUNmLEtBQUssRUFBRSxTQUFTO0lBQ2hCLElBQUksRUFBRTtRQUNKLEVBQUUsS0FBSyxFQUFFLE9BQU8sRUFBRSxPQUFPLEVBQUUsNEJBQTRCLEVBQUU7UUFDekQsRUFBRSxLQUFLLEVBQUUsTUFBTSxFQUFFLE9BQU8sRUFBRSwyQkFBMkIsRUFBRTtRQUN2RCxFQUFFLEtBQUssRUFBRSxjQUFjLEVBQUUsT0FBTyxFQUFFLGtDQUFrQyxFQUFFO0tBQ3ZFO0NBQ0YsQ0FBQTtBQUVEO0lBMkNFLFlBQVksUUFBOEIsRUFBVSxPQUF1QjtRQUF2QixZQUFPLEdBQVAsT0FBTyxDQUFnQjtRQXpDbkUsZ0JBQVcsR0FBd0IsSUFBSSwwQkFBbUIsRUFBRSxDQUFBO1FBQzVELG9CQUFlLEdBQXNCLEVBQUUsQ0FBQTtRQUN2QyxpQkFBWSxHQUFzQixFQUFFLENBQUE7UUFDcEMsZUFBVSxHQUFHLElBQUksQ0FBQyxNQUFNLENBQUMsR0FBRyxDQUFDLGdDQUFnQyxDQUFDLENBQUE7UUFFOUQsb0JBQWUsR0FBRztZQUN4QiwyQkFBMkIsRUFBRSxJQUFJLENBQUMsY0FB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Q0FBQztJQUNILENBQUM7SUFFTyxvQkFBb0IsQ0FBQyxPQUFlO1FBQzFDLE1BQU0sQ0FBQyxDQUFDLElBQUksQ0FBQyxVQUFVLENBQUMsQ0FBQyxDQUFDO1lBQ3hCLEtBQUssS0FBSztnQkFDUixJQUFJLENBQUMsZUFBZSxDQUFDLElBQUksQ0FBQztvQkFDeEIsT0FBTyxFQUFFLE9BQU87b0JBQ2hCLFFBQVEsRUFBRSxTQUFTO2lCQUNwQixDQUFDLENBQUE7Z0JBQ0YsSUFBSSxDQUFDLElBQUksQ0FBQyxPQUFPLENBQUMsQ0FBQTtnQkFDbEIsSUFBSSxDQUFDLFlBQVksRUFBRSxDQUFBO2dCQUNuQixLQUFLLENBQUE7WUFDUCxLQUFLLFNBQVM7Z0JBQ1osSUFBSSxDQUFDLElBQUksQ0FBQyxPQUFPLENBQUMsQ0FBQTtnQkFDbEIsS0FBSyxDQUFBO1lBQ1AsS0FBSyxPQUFPO2dCQUNWLElBQUksQ0FBQyxJQUFJLENBQUMsT0FBTyxDQUFDLENBQUE7Z0JBQ2xCLElBQUksQ0FBQyxhQUFhLENBQUMsVUFBVSxDQUFDLE9BQU8sRUFBRTtvQkFDckMsV0FBVyxFQUFFLEtBQUs7aUJBQ25CLENBQUMsQ0FBQTtnQkFDRixLQUFLLENBQUE7UUFDVCxDQUFDO0lBQ0gsQ0FBQztDQUNGO0FBalRDO0lBREMsc0JBQWU7Ozs7K0NBS2Y7QUFHRDtJQURDLHNCQUFlOzs7OzhDQUtmO0FBY0Q7SUFEQyxzQkFBZTs7OztvREEyQmY7QUFHRDtJQURDLHNCQUFlOzs7O21EQVVmO0FBR0Q7SUFEQyxzQkFBZTs7OztpREF3QmY7QUFHRDtJQURDLHNCQUFlOzs7O2tEQWlCZjtBQUdEO0lBREMsc0JBQWU7Ozs7c0RBZ0NmO0FBNU9ILGtDQStZQyIsInNvdXJjZXNDb250ZW50IjpbImltcG9ydCB7IElFdmVudERlc2MsIENvbXBvc2l0ZURpc3Bvc2FibGUsIFJhbmdlIH0gZnJvbSAnYXRvbSdcbmltcG9ydCB7IEdoY01vZGlQcm9jZXNzLCBJRXJyb3JDYWxsYmFja0FyZ3MgfSBmcm9tICcuL2doYy1tb2QnXG5pbXBvcnQgeyBpbXBvcnRMaXN0VmlldyB9IGZyb20gJy4vdmlld3MvaW1wb3J0LWxpc3QtdmlldydcbmltcG9ydCAqIGFzIFV0aWwgZnJvbSAnLi91dGlsJ1xuaW1wb3J0IHsgaGFuZGxlRXhjZXB0aW9uIH0gZnJvbSAnLi91dGlsJ1xuXG5jb25zdCBtZXNzYWdlVHlwZXMgPSB7XG4gIGVycm9yOiB7fSxcbiAgd2FybmluZzoge30sXG4gIGxpbnQ6IHt9LFxufVxuXG5jb25zdCBhZGRNc2dUeXBlcyA9IHtcbiAgJ2doYy1tb2QnOiB7XG4gICAgdXJpRmlsdGVyOiBmYWxzZSxcbiAgICBhdXRvU2Nyb2xsOiB0cnVlLFxuICB9LFxufVxuXG5jb25zdCBjb250ZXh0U2NvcGUgPSAnYXRvbS10ZXh0LWVkaXRvcltkYXRhLWdyYW1tYXJ+PVwiaGFza2VsbFwiXSdcblxuY29uc3QgbWFpbk1lbnUgPSB7XG4gIGxhYmVsOiAnZ2hjLW1vZCcsXG4gIG1lbnU6IFtcbiAgICB7IGxhYmVsOiAnQ2hlY2snLCBjb21tYW5kOiAnaGFza2VsbC1naGMtbW9kOmNoZWNrLWZpbGUnIH0sXG4gICAgeyBsYWJlbDogJ0xpbnQnLCBjb21tYW5kOiAnaGFza2VsbC1naGMtbW9kOmxpbnQtZmlsZScgfSxcbiAgICB7IGxhYmVsOiAnU3RvcCBCYWNrZW5kJywgY29tbWFuZDogJ2hhc2tlbGwtZ2hjLW1vZDpzaHV0ZG93bi1iYWNrZW5kJyB9LFxuICBdLFxufVxuXG5leHBvcnQgY2xhc3MgVVBJQ29uc3VtZXIge1xuICBwdWJsaWMgdXBpOiBVUEkuSVVQSUluc3RhbmNlXG4gIHByaXZhdGUgZGlzcG9zYWJsZXM6IENvbXBvc2l0ZURpc3Bvc2FibGUgPSBuZXcgQ29tcG9zaXRlRGlzcG9zYWJsZSgpXG4gIHByaXZhdGUgcHJvY2Vzc01lc3NhZ2VzOiBVUEkuSVJlc3VsdEl0ZW1bXSA9IFtdXG4gIHByaXZhdGUgbGFzdE1lc3NhZ2VzOiBVUEkuSVJlc3VsdEl0ZW1bXSA9IFtdXG4gIHByaXZhdGUgbXNnQmFja2VuZCA9IGF0b20uY29uZmlnLmdldCgnaGFza2VsbC1naGMtbW9kLmdoY01vZE1lc3NhZ2VzJylcblxuICBwcml2YXRlIGNvbnRleHRDb21tYW5kcyA9IHtcbiAgICAnaGFza2VsbC1naGMtbW9kOnNob3ctdHlwZSc6IHRoaXMudG9vbHRpcENvbW1hbmQodGhpcy50eXBlVG9vbHRpcC5iaW5kKHRoaXMpKSxcbiAgICAnaGFza2VsbC1naGMtbW9kOnNob3ctaW5mbyc6IHRoaXMudG9vbHRpcENvbW1hbmQodGhpcy5pbmZvVG9vbHRpcC5iaW5kKHRoaXMpKSxcbiAgICAnaGFza2VsbC1naGMtbW9kOmNhc2Utc3BsaXQnOiB0aGlzLmNhc2VTcGxpdENvbW1hbmQuYmluZCh0aGlzKSxcbiAgICAnaGFza2VsbC1naGMtbW9kOnNpZy1maWxsJzogdGhpcy5zaWdGaWxsQ29tbWFuZC5iaW5kKHRoaXMpLFxuICAgICdoYXNrZWxsLWdoYy1tb2Q6Z28tdG8tZGVjbGFyYXRpb24nOiB0aGlzLmdvVG9EZWNsQ29tbWFuZC5iaW5kKHRoaXMpLFxuICAgICdoYXNrZWxsLWdoYy1tb2Q6c2hvdy1pbmZvLWZhbGxiYWNrLXRvLXR5cGUnOiB0aGlzLnRvb2x0aXBDb21tYW5kKHRoaXMuaW5mb1R5cGVUb29sdGlwLmJpbmQodGhpcykpLFxuICAgICdoYXNrZWxsLWdoYy1tb2Q6c2hvdy10eXBlLWZhbGxiYWNrLXRvLWluZm8nOiB0aGlzLnRvb2x0aXBDb21tYW5kKHRoaXMudHlwZUluZm9Ub29sdGlwLmJpbmQodGhpcykpLFxuICAgICdoYXNrZWxsLWdoYy1tb2Q6c2hvdy10eXBlLWFuZC1pbmZvJzogdGhpcy50b29sdGlwQ29tbWFuZCh0aGlzLnR5cGVBbmRJbmZvVG9vbHRpcC5iaW5kKHRoaXMpKSxcbiAgICAnaGFza2VsbC1naGMtbW9kOmluc2VydC10eXBlJzogdGhpcy5pbnNlcnRUeXBlQ29tbWFuZC5iaW5kKHRoaXMpLFxuICAgICdoYXNrZWxsLWdoYy1tb2Q6aW5zZXJ0LWltcG9ydCc6IHRoaXMuaW5zZXJ0SW1wb3J0Q29tbWFuZC5iaW5kKHRoaXMpLFxuICB9XG5cbiAgcHJpdmF0ZSBnbG9iYWxDb21tYW5kcyA9IHtcbiAgICAnaGFza2VsbC1naGMtbW9kOmNoZWNrLWZpbGUnOiB0aGlzLmNoZWNrQ29tbWFuZC5iaW5kKHRoaXMpLFxuICAgICdoYXNrZWxsLWdoYy1tb2Q6bGludC1maWxlJzogdGhpcy5saW50Q29tbWFuZC5iaW5kKHRoaXMpLFxuICAgIC4uLnRoaXMuY29udGV4dENvbW1hbmRzLFxuICB9XG5cbiAgcHJpdmF0ZSBjb250ZXh0TWVudToge1xuICAgIGxhYmVsOiBzdHJpbmcsIHN1Ym1lbnU6IEFycmF5PHsgbGFiZWw6IHN0cmluZywgY29tbWFuZDoga2V5b2YgVVBJQ29uc3VtZXJbJ2NvbnRleHRDb21tYW5kcyddIH0+XG4gIH0gPSB7XG4gICAgbGFiZWw6ICdnaGMtbW9kJyxcbiAgICBzdWJtZW51OlxuICAgIFtcbiAgICAgIHsgbGFiZWw6ICdTaG93IFR5cGUnLCBjb21tYW5kOiAnaGFza2VsbC1naGMtbW9kOnNob3ctdHlwZScgfSxcbiAgICAgIHsgbGFiZWw6ICdTaG93IEluZm8nLCBjb21tYW5kOiAnaGFza2VsbC1naGMtbW9kOnNob3ctaW5mbycgfSxcbiAgICAgIHsgbGFiZWw6ICdTaG93IFR5cGUgQW5kIEluZm8nLCBjb21tYW5kOiAnaGFza2VsbC1naGMtbW9kOnNob3ctdHlwZS1hbmQtaW5mbycgfSxcbiAgICAgIHsgbGFiZWw6ICdDYXNlIFNwbGl0JywgY29tbWFuZDogJ2hhc2tlbGwtZ2hjLW1vZDpjYXNlLXNwbGl0JyB9LFxuICAgICAgeyBsYWJlbDogJ1NpZyBGaWxsJywgY29tbWFuZDogJ2hhc2tlbGwtZ2hjLW1vZDpzaWctZmlsbCcgfSxcbiAgICAgIHsgbGFiZWw6ICdJbnNlcnQgVHlwZScsIGNvbW1hbmQ6ICdoYXNrZWxsLWdoYy1tb2Q6aW5zZXJ0LXR5cGUnIH0sXG4gICAgICB7IGxhYmVsOiAnSW5zZXJ0IEltcG9ydCcsIGNvbW1hbmQ6ICdoYXNrZWxsLWdoYy1tb2Q6aW5zZXJ0LWltcG9ydCcgfSxcbiAgICAgIHsgbGFiZWw6ICdHbyBUbyBEZWNsYXJhdGlvbicsIGNvbW1hbmQ6ICdoYXNrZWxsLWdoYy1tb2Q6Z28tdG8tZGVjbGFyYXRpb24nIH0sXG4gICAgXSxcbiAgfVxuXG4gIGNvbnN0cnVjdG9yKHJlZ2lzdGVyOiBVUEkuSVVQSVJlZ2lzdHJhdGlvbiwgcHJpdmF0ZSBwcm9jZXNzOiBHaGNNb2RpUHJvY2Vzcykge1xuICAgIHRoaXMuZGlzcG9zYWJsZXMuYWRkKFxuICAgICAgdGhpcy5wcm9jZXNzLm9uRXJyb3IodGhpcy5oYW5kbGVQcm9jZXNzRXJyb3IuYmluZCh0aGlzKSksXG4gICAgICB0aGlzLnByb2Nlc3Mub25XYXJuaW5nKHRoaXMuaGFuZGxlUHJvY2Vzc1dhcm5pbmcuYmluZCh0aGlzKSksXG4gICAgKVxuXG4gICAgY29uc3QgbXNnVHlwZXMgPVxuICAgICAgdGhpcy5tc2dCYWNrZW5kID09PSAndXBpJ1xuICAgICAgICA/IHsgLi4ubWVzc2FnZVR5cGVzLCAuLi5hZGRNc2dUeXBlcyB9XG4gICAgICAgIDogbWVzc2FnZVR5cGVzXG5cbiAgICB0aGlzLnVwaSA9IHJlZ2lzdGVyKHtcbiAgICAgIG5hbWU6ICdoYXNrZWxsLWdoYy1tb2QnLFxuICAgICAgbWVudTogbWFpbk1lbnUsXG4gICAgICBtZXNzYWdlVHlwZXM6IG1zZ1R5cGVzLFxuICAgICAgdG9vbHRpcDogdGhpcy5zaG91bGRTaG93VG9vbHRpcC5iaW5kKHRoaXMpLFxuICAgICAgZXZlbnRzOiB7XG4gICAgICAgIG9uRGlkU2F2ZUJ1ZmZlcjogYXN5bmMgKGJ1ZmZlcikgPT5cbiAgICAgICAgICB0aGlzLmNoZWNrTGludChidWZmZXIsICdTYXZlJywgYXRvbS5jb25maWcuZ2V0KCdoYXNrZWxsLWdoYy1tb2QuYWx3YXlzSW50ZXJhY3RpdmVDaGVjaycpKSxcbiAgICAgICAgb25EaWRTdG9wQ2hhbmdpbmc6IGFzeW5jIChidWZmZXIpID0+XG4gICAgICAgICAgdGhpcy5jaGVja0xpbnQoYnVmZmVyLCAnQ2hhbmdlJywgdHJ1ZSksXG4gICAgICB9LFxuICAgIH0pXG5cbiAgICB0aGlzLmRpc3Bvc2FibGVzLmFkZChcbiAgICAgIHRoaXMudXBpLFxuICAgICAgdGhpcy5wcm9jZXNzLm9uQmFja2VuZEFjdGl2ZSgoKSA9PiB0aGlzLnVwaS5zZXRTdGF0dXMoeyBzdGF0dXM6ICdwcm9ncmVzcycsIGRldGFpbDogJycgfSkpLFxuICAgICAgdGhpcy5wcm9jZXNzLm9uQmFja2VuZElkbGUoKCkgPT4gdGhpcy51cGkuc2V0U3RhdHVzKHsgc3RhdHVzOiAncmVhZHknLCBkZXRhaWw6ICcnIH0pKSxcbiAgICAgIGF0b20uY29tbWFuZHMuYWRkKGNvbnRleHRTY29wZSwgdGhpcy5nbG9iYWxDb21tYW5kcyksXG4gICAgKVxuICAgIGNvbnN0IGNtID0ge31cbiAgICBjbVtjb250ZXh0U2NvcGVdID0gW3RoaXMuY29udGV4dE1lbnVdXG4gICAgdGhpcy5kaXNwb3NhYmxlcy5hZGQoYXRvbS5jb250ZXh0TWVudS5hZGQoY20pKVxuICB9XG5cbiAgcHVibGljIGRpc3Bvc2UoKSB7XG4gICAgdGhpcy5kaXNwb3NhYmxlcy5kaXNwb3NlKClcbiAgfVxuXG4gIHByaXZhdGUgYXN5bmMgc2hvdWxkU2hvd1Rvb2x0aXAoXG4gICAgZWRpdG9yOiBBdG9tVHlwZXMuVGV4dEVkaXRvciwgY3JhbmdlOiBBdG9tVHlwZXMuUmFuZ2UsIHR5cGU6IFVQSS5URXZlbnRSYW5nZVR5cGUsXG4gICk6IFByb21pc2U8VVBJLklUb29sdGlwRGF0YSB8IHVuZGVmaW5lZD4ge1xuICAgIGNvbnN0IG4gPSB0eXBlID09PSAnbW91c2UnID8gJ2hhc2tlbGwtZ2hjLW1vZC5vbk1vdXNlSG92ZXJTaG93J1xuICAgICAgICAgICAgOiB0eXBlID09PSAnc2VsZWN0aW9uJyA/ICdoYXNrZWxsLWdoYy1tb2Qub25TZWxlY3Rpb25TaG93J1xuICAgICAgICAgICAgOiB1bmRlZmluZWRcbiAgICBjb25zdCB0ID0gbiAmJiBhdG9tLmNvbmZpZy5nZXQobilcbiAgICAvLyB0c2xpbnQ6ZGlzYWJsZS1uZXh0LWxpbmU6bm8tdW5zYWZlLWFueVxuICAgIGlmICh0KSByZXR1cm4gdGhpc1tgJHt0fVRvb2x0aXBgXShlZGl0b3IsIGNyYW5nZSlcbiAgfVxuXG4gIEBoYW5kbGVFeGNlcHRpb25cbiAgcHJpdmF0ZSBhc3luYyBjaGVja0NvbW1hbmQoeyBjdXJyZW50VGFyZ2V0IH06IElFdmVudERlc2MpIHtcbiAgICBjb25zdCBlZGl0b3IgPSBjdXJyZW50VGFyZ2V0LmdldE1vZGVsKClcbiAgICBjb25zdCByZXMgPSBhd2FpdCB0aGlzLnByb2Nlc3MuZG9DaGVja0J1ZmZlcihlZGl0b3IuZ2V0QnVmZmVyKCksIGF0b20uY29uZmlnLmdldCgnaGFza2VsbC1naGMtbW9kLmFsd2F5c0ludGVyYWN0aXZlQ2hlY2snKSlcbiAgICB0aGlzLnNldE1lc3NhZ2VzKHJlcylcbiAgfVxuXG4gIEBoYW5kbGVFeGNlcHRpb25cbiAgcHJpdmF0ZSBhc3luYyBsaW50Q29tbWFuZCh7IGN1cnJlbnRUYXJnZXQgfTogSUV2ZW50RGVzYykge1xuICAgIGNvbnN0IGVkaXRvciA9IGN1cnJlbnRUYXJnZXQuZ2V0TW9kZWwoKVxuICAgIGNvbnN0IHJlcyA9IGF3YWl0IHRoaXMucHJvY2Vzcy5kb0xpbnRCdWZmZXIoZWRpdG9yLmdldEJ1ZmZlcigpKVxuICAgIHRoaXMuc2V0TWVzc2FnZXMocmVzKVxuICB9XG5cbiAgcHJpdmF0ZSB0b29sdGlwQ29tbWFuZCh0b29sdGlwZnVuOiAoZTogQXRvbVR5cGVzLlRleHRFZGl0b3IsIHA6IEF0b21UeXBlcy5SYW5nZSkgPT4gUHJvbWlzZTxVUEkuSVRvb2x0aXBEYXRhPikge1xuICAgIHJldHVybiBhc3luYyAoeyBjdXJyZW50VGFyZ2V0LCBkZXRhaWwgfTogSUV2ZW50RGVzYykgPT5cbiAgICAgIHRoaXMudXBpLnNob3dUb29sdGlwKHtcbiAgICAgICAgZWRpdG9yOiBjdXJyZW50VGFyZ2V0LmdldE1vZGVsKCksXG4gICAgICAgIGRldGFpbCxcbiAgICAgICAgYXN5bmMgdG9vbHRpcChjcmFuZ2UpIHtcbiAgICAgICAgICByZXR1cm4gdG9vbHRpcGZ1bihjdXJyZW50VGFyZ2V0LmdldE1vZGVsKCksIGNyYW5nZSlcbiAgICAgICAgfSxcbiAgICAgIH0pXG4gIH1cblxuICBAaGFuZGxlRXhjZXB0aW9uXG4gIHByaXZhdGUgYXN5bmMgaW5zZXJ0VHlwZUNvbW1hbmQoeyBjdXJyZW50VGFyZ2V0LCBkZXRhaWwgfTogSUV2ZW50RGVzYykge1xuICAgIGNvbnN0IGVkaXRvciA9IGN1cnJlbnRUYXJnZXQuZ2V0TW9kZWwoKVxuICAgIGNvbnN0IGVyID0gdGhpcy51cGkuZ2V0RXZlbnRSYW5nZShlZGl0b3IsIGRldGFpbClcbiAgICBpZiAoZXIgPT09IHVuZGVmaW5lZCkgeyByZXR1cm4gfVxuICAgIGNvbnN0IHsgY3JhbmdlLCBwb3MgfSA9IGVyXG4gICAgY29uc3Qgc3ltSW5mbyA9IFV0aWwuZ2V0U3ltYm9sQXRQb2ludChlZGl0b3IsIHBvcylcbiAgICBpZiAoIXN5bUluZm8pIHsgcmV0dXJuIH1cbiAgICBjb25zdCB7IHNjb3BlLCByYW5nZSwgc3ltYm9sIH0gPSBzeW1JbmZvXG4gICAgaWYgKHNjb3BlLnN0YXJ0c1dpdGgoJ2tleXdvcmQub3BlcmF0b3IuJykpIHsgcmV0dXJuIH0gLy8gY2FuJ3QgY29ycmVjdGx5IGhhbmRsZSBpbmZpeCBub3RhdGlvblxuICAgIGNvbnN0IHsgdHlwZSB9ID0gYXdhaXQgdGhpcy5wcm9jZXNzLmdldFR5cGVJbkJ1ZmZlcihlZGl0b3IuZ2V0QnVmZmVyKCksIGNyYW5nZSlcbiAgICBpZiAoZWRpdG9yLmdldFRleHRJbkJ1ZmZlclJhbmdlKFtyYW5nZS5lbmQsIGVkaXRvci5idWZmZXJSYW5nZUZvckJ1ZmZlclJvdyhyYW5nZS5lbmQucm93KS5lbmRdKS5tYXRjaCgvPS8pKSB7XG4gICAgICBsZXQgaW5kZW50ID0gZWRpdG9yLmdldFRleHRJbkJ1ZmZlclJhbmdlKFtbcmFuZ2Uuc3RhcnQucm93LCAwXSwgcmFuZ2Uuc3RhcnRdKVxuICAgICAgbGV0IGJpcmRUcmFjayA9ICcnXG4gICAgICBpZiAoZWRpdG9yLnNjb3BlRGVzY3JpcHRvckZvckJ1ZmZlclBvc2l0aW9uKHBvcykuZ2V0U2NvcGVzQXJyYXkoKS5pbmNsdWRlcygnbWV0YS5lbWJlZGRlZC5oYXNrZWxsJykpIHtcbiAgICAgICAgYmlyZFRyYWNrID0gaW5kZW50LnNsaWNlKDAsIDIpXG4gICAgICAgIGluZGVudCA9IGluZGVudC5zbGljZSgyKVxuICAgICAgfVxuICAgICAgaWYgKGluZGVudC5tYXRjaCgvXFxTLykpIHtcbiAgICAgICAgaW5kZW50ID0gaW5kZW50LnJlcGxhY2UoL1xcUy9nLCAnICcpXG4gICAgICB9XG4gICAgICBlZGl0b3Iuc2V0VGV4dEluQnVmZmVyUmFuZ2UoXG4gICAgICAgIFtyYW5nZS5zdGFydCwgcmFuZ2Uuc3RhcnRdLCBgJHtzeW1ib2x9IDo6ICR7dHlwZX1cXG4ke2JpcmRUcmFja30ke2luZGVudH1gLFxuICAgICAgKVxuICAgIH0gZWxzZSB7XG4gICAgICBlZGl0b3Iuc2V0VGV4dEluQnVmZmVyUmFuZ2UocmFuZ2UsIGAoJHtlZGl0b3IuZ2V0VGV4dEluQnVmZmVyUmFuZ2UocmFuZ2UpfSA6OiAke3R5cGV9KWApXG4gICAgfVxuICB9XG5cbiAgQGhhbmRsZUV4Y2VwdGlvblxuICBwcml2YXRlIGFzeW5jIGNhc2VTcGxpdENvbW1hbmQoeyBjdXJyZW50VGFyZ2V0LCBkZXRhaWwgfTogSUV2ZW50RGVzYykge1xuICAgIGNvbnN0IGVkaXRvciA9IGN1cnJlbnRUYXJnZXQuZ2V0TW9kZWwoKVxuICAgIGNvbnN0IGV2ciA9IHRoaXMudXBpLmdldEV2ZW50UmFuZ2UoZWRpdG9yLCBkZXRhaWwpXG4gICAgaWYgKCFldnIpIHsgcmV0dXJuIH1cbiAgICBjb25zdCB7IGNyYW5nZSB9ID0gZXZyXG4gICAgY29uc3QgcmVzID0gYXdhaXQgdGhpcy5wcm9jZXNzLmRvQ2FzZVNwbGl0KGVkaXRvci5nZXRCdWZmZXIoKSwgY3JhbmdlKVxuICAgIGZvciAoY29uc3QgeyByYW5nZSwgcmVwbGFjZW1lbnQgfSBvZiByZXMpIHtcbiAgICAgIGVkaXRvci5zZXRUZXh0SW5CdWZmZXJSYW5nZShyYW5nZSwgcmVwbGFjZW1lbnQpXG4gICAgfVxuICB9XG5cbiAgQGhhbmRsZUV4Y2VwdGlvblxuICBwcml2YXRlIGFzeW5jIHNpZ0ZpbGxDb21tYW5kKHsgY3VycmVudFRhcmdldCwgZGV0YWlsIH06IElFdmVudERlc2MpIHtcbiAgICBjb25zdCBlZGl0b3IgPSBjdXJyZW50VGFyZ2V0LmdldE1vZGVsKClcbiAgICBjb25zdCBldnIgPSB0aGlzLnVwaS5nZXRFdmVudFJhbmdlKGVkaXRvciwgZGV0YWlsKVxuICAgIGlmICghZXZyKSB7IHJldHVybiB9XG4gICAgY29uc3QgeyBjcmFuZ2UgfSA9IGV2clxuICAgIGNvbnN0IHJlcyA9IGF3YWl0IHRoaXMucHJvY2Vzcy5kb1NpZ0ZpbGwoZWRpdG9yLmdldEJ1ZmZlcigpLCBjcmFuZ2UpXG5cbiAgICBlZGl0b3IudHJhbnNhY3QoKCkgPT4ge1xuICAgICAgY29uc3QgeyB0eXBlLCByYW5nZSwgYm9keSB9ID0gcmVzXG4gICAgICBjb25zdCBzaWcgPSBlZGl0b3IuZ2V0VGV4dEluQnVmZmVyUmFuZ2UocmFuZ2UpXG4gICAgICBsZXQgaW5kZW50ID0gZWRpdG9yLmluZGVudExldmVsRm9yTGluZShzaWcpXG4gICAgICBjb25zdCBwb3MgPSByYW5nZS5lbmRcbiAgICAgIGNvbnN0IHRleHQgPSBgXFxuJHtib2R5fWBcbiAgICAgIGlmICh0eXBlID09PSAnaW5zdGFuY2UnKSB7XG4gICAgICAgIGluZGVudCArPSAxXG4gICAgICAgIGlmICghc2lnLmVuZHNXaXRoKCcgd2hlcmUnKSkge1xuICAgICAgICAgIGVkaXRvci5zZXRUZXh0SW5CdWZmZXJSYW5nZShbcmFuZ2UuZW5kLCByYW5nZS5lbmRdLCAnIHdoZXJlJylcbiAgICAgICAgfVxuICAgICAgfVxuICAgICAgY29uc3QgbmV3cmFuZ2UgPSBlZGl0b3Iuc2V0VGV4dEluQnVmZmVyUmFuZ2UoW3BvcywgcG9zXSwgdGV4dClcbiAgICAgIG5ld3JhbmdlLmdldFJvd3MoKS5zbGljZSgxKS5tYXAoKHJvdykgPT5cbiAgICAgICAgZWRpdG9yLnNldEluZGVudGF0aW9uRm9yQnVmZmVyUm93KHJvdywgaW5kZW50KSlcbiAgICB9KVxuICB9XG5cbiAgQGhhbmRsZUV4Y2VwdGlvblxuICBwcml2YXRlIGFzeW5jIGdvVG9EZWNsQ29tbWFuZCh7IGN1cnJlbnRUYXJnZXQsIGRldGFpbCB9OiBJRXZlbnREZXNjKSB7XG4gICAgY29uc3QgZWRpdG9yID0gY3VycmVudFRhcmdldC5nZXRNb2RlbCgpXG4gICAgY29uc3QgZXZyID0gdGhpcy51cGkuZ2V0RXZlbnRSYW5nZShlZGl0b3IsIGRldGFpbClcbiAgICBpZiAoIWV2cikgeyByZXR1cm4gfVxuICAgIGNvbnN0IHsgY3JhbmdlIH0gPSBldnJcbiAgICBjb25zdCB7IGluZm8gfSA9IGF3YWl0IHRoaXMucHJvY2Vzcy5nZXRJbmZvSW5CdWZmZXIoZWRpdG9yLCBjcmFuZ2UpXG4gICAgY29uc3QgcmVzID0gLy4qLS0gRGVmaW5lZCBhdCAoLispOihcXGQrKTooXFxkKykvLmV4ZWMoaW5mbylcbiAgICBpZiAoIXJlcykgeyByZXR1cm4gfVxuICAgIGNvbnN0IFtmbiwgbGluZSwgY29sXSA9IHJlcy5zbGljZSgxKVxuICAgIGNvbnN0IHJvb3REaXIgPSBhd2FpdCB0aGlzLnByb2Nlc3MuZ2V0Um9vdERpcihlZGl0b3IuZ2V0QnVmZmVyKCkpXG4gICAgaWYgKCFyb290RGlyKSB7IHJldHVybiB9XG4gICAgY29uc3QgdXJpID0gcm9vdERpci5nZXRGaWxlKGZuKS5nZXRQYXRoKCkgfHwgZm5cbiAgICBhd2FpdCBhdG9tLndvcmtzcGFjZS5vcGVuKHVyaSwge1xuICAgICAgaW5pdGlhbExpbmU6IHBhcnNlSW50KGxpbmUsIDEwKSAtIDEsXG4gICAgICBpbml0aWFsQ29sdW1uOiBwYXJzZUludChjb2wsIDEwKSAtIDEsXG4gICAgfSlcbiAgfVxuXG4gIEBoYW5kbGVFeGNlcHRpb25cbiAgcHJpdmF0ZSBhc3luYyBpbnNlcnRJbXBvcnRDb21tYW5kKHsgY3VycmVudFRhcmdldCwgZGV0YWlsIH06IElFdmVudERlc2MpIHtcbiAgICBjb25zdCBlZGl0b3IgPSBjdXJyZW50VGFyZ2V0LmdldE1vZGVsKClcbiAgICBjb25zdCBidWZmZXIgPSBlZGl0b3IuZ2V0QnVmZmVyKClcbiAgICBjb25zdCBldnIgPSB0aGlzLnVwaS5nZXRFdmVudFJhbmdlKGVkaXRvciwgZGV0YWlsKVxuICAgIGlmICghZXZyKSB7IHJldHVybiB9XG4gICAgY29uc3QgeyBjcmFuZ2UgfSA9IGV2clxuICAgIGNvbnN0IGxpbmVzID0gYXdhaXQgdGhpcy5wcm9jZXNzLmZpbmRTeW1ib2xQcm92aWRlcnNJbkJ1ZmZlcihlZGl0b3IsIGNyYW5nZSlcbiAgICBjb25zdCBtb2QgPSBhd2FpdCBpbXBvcnRMaXN0VmlldyhsaW5lcylcbiAgICBpZiAobW9kKSB7XG4gICAgICBjb25zdCBwaSA9IGF3YWl0IG5ldyBQcm9taXNlPHsgcG9zOiBBdG9tVHlwZXMuUG9pbnQsIGluZGVudDogc3RyaW5nLCBlbmQ6IHN0cmluZyB9PigocmVzb2x2ZSkgPT4ge1xuICAgICAgICBidWZmZXIuYmFja3dhcmRzU2NhbigvXihcXHMqKShpbXBvcnR8bW9kdWxlKS8sICh7IG1hdGNoLCByYW5nZSwgc3RvcCB9KSA9PiB7XG4gICAgICAgICAgbGV0IGluZGVudCA9ICcnXG4gICAgICAgICAgc3dpdGNoIChtYXRjaFsyXSkge1xuICAgICAgICAgICAgY2FzZSAnaW1wb3J0JzpcbiAgICAgICAgICAgICAgaW5kZW50ID0gYFxcbiR7bWF0Y2hbMV19YFxuICAgICAgICAgICAgICBicmVha1xuICAgICAgICAgICAgY2FzZSAnbW9kdWxlJzpcbiAgICAgICAgICAgICAgaW5kZW50ID0gYFxcblxcbiR7bWF0Y2hbMV19YFxuICAgICAgICAgICAgICBicmVha1xuICAgICAgICAgIH1cbiAgICAgICAgICByZXNvbHZlKHsgcG9zOiBidWZmZXIucmFuZ2VGb3JSb3cocmFuZ2Uuc3RhcnQucm93KS5lbmQsIGluZGVudCwgZW5kOiAnJyB9KVxuICAgICAgICB9KVxuICAgICAgICAvLyBub3RoaW5nIGZvdW5kXG4gICAgICAgIHJlc29sdmUoe1xuICAgICAgICAgIHBvczogYnVmZmVyLmdldEZpcnN0UG9zaXRpb24oKSxcbiAgICAgICAgICBpbmRlbnQ6ICcnLFxuICAgICAgICAgIGVuZDogJ1xcbicsXG4gICAgICAgIH0pXG4gICAgICB9KVxuICAgICAgZWRpdG9yLnNldFRleHRJbkJ1ZmZlclJhbmdlKFtwaS5wb3MsIHBpLnBvc10sIGAke3BpLmluZGVudH1pbXBvcnQgJHttb2R9JHtwaS5lbmR9YClcbiAgICB9XG4gIH1cblxuICBwcml2YXRlIGFzeW5jIHR5cGVUb29sdGlwKGU6IEF0b21UeXBlcy5UZXh0RWRpdG9yLCBwOiBBdG9tVHlwZXMuUmFuZ2UpIHtcbiAgICBjb25zdCB7IHJhbmdlLCB0eXBlIH0gPSBhd2FpdCB0aGlzLnByb2Nlc3MuZ2V0VHlwZUluQnVmZmVyKGUuZ2V0QnVmZmVyKCksIHApXG4gICAgcmV0dXJuIHtcbiAgICAgIHJhbmdlLFxuICAgICAgdGV4dDoge1xuICAgICAgICB0ZXh0OiB0eXBlLFxuICAgICAgICBoaWdobGlnaHRlcjpcbiAgICAgICAgYXRvbS5jb25maWcuZ2V0KCdoYXNrZWxsLWdoYy1tb2QuaGlnaGxpZ2h0VG9vbHRpcHMnKSA/XG4gICAgICAgICAgJ2hpbnQudHlwZS5oYXNrZWxsJyA6IHVuZGVmaW5lZCxcbiAgICAgIH0sXG4gICAgfVxuICB9XG5cbiAgcHJpdmF0ZSBhc3luYyBpbmZvVG9vbHRpcChlOiBBdG9tVHlwZXMuVGV4dEVkaXRvciwgcDogQXRvbVR5cGVzLlJhbmdlKSB7XG4gICAgY29uc3QgeyByYW5nZSwgaW5mbyB9ID0gYXdhaXQgdGhpcy5wcm9jZXNzLmdldEluZm9JbkJ1ZmZlcihlLCBwKVxuICAgIHJldHVybiB7XG4gICAgICByYW5nZSxcbiAgICAgIHRleHQ6IHtcbiAgICAgICAgdGV4dDogaW5mbyxcbiAgICAgICAgaGlnaGxpZ2h0ZXI6XG4gICAgICAgIGF0b20uY29uZmlnLmdldCgnaGFza2VsbC1naGMtbW9kLmhpZ2hsaWdodFRvb2x0aXBzJykgP1xuICAgICAgICAgICdzb3VyY2UuaGFza2VsbCcgOiB1bmRlZmluZWQsXG4gICAgICB9LFxuICAgIH1cbiAgfVxuXG4gIHByaXZhdGUgYXN5bmMgaW5mb1R5cGVUb29sdGlwKGU6IEF0b21UeXBlcy5UZXh0RWRpdG9yLCBwOiBBdG9tVHlwZXMuUmFuZ2UpIHtcbiAgICB0cnkge1xuICAgICAgcmV0dXJuIGF3YWl0IHRoaXMuaW5mb1Rvb2x0aXAoZSwgcClcbiAgICB9IGNhdGNoIHtcbiAgICAgIHJldHVybiB0aGlzLnR5cGVUb29sdGlwKGUsIHApXG4gICAgfVxuICB9XG5cbiAgcHJpdmF0ZSBhc3luYyB0eXBlSW5mb1Rvb2x0aXAoZTogQXRvbVR5cGVzLlRleHRFZGl0b3IsIHA6IEF0b21UeXBlcy5SYW5nZSkge1xuICAgIHRyeSB7XG4gICAgICByZXR1cm4gYXdhaXQgdGhpcy50eXBlVG9vbHRpcChlLCBwKVxuICAgIH0gY2F0Y2gge1xuICAgICAgcmV0dXJuIHRoaXMuaW5mb1Rvb2x0aXAoZSwgcClcbiAgICB9XG4gIH1cblxuICBwcml2YXRlIGFzeW5jIHR5cGVBbmRJbmZvVG9vbHRpcChlOiBBdG9tVHlwZXMuVGV4dEVkaXRvciwgcDogQXRvbVR5cGVzLlJhbmdlKSB7XG4gICAgY29uc3QgdHlwZVAgPSB0aGlzLnR5cGVUb29sdGlwKGUsIHApLmNhdGNoKCgpID0+IHVuZGVmaW5lZClcbiAgICBjb25zdCBpbmZvUCA9IHRoaXMuaW5mb1Rvb2x0aXAoZSwgcCkuY2F0Y2goKCkgPT4gdW5kZWZpbmVkKVxuICAgIGNvbnN0IFt0eXBlLCBpbmZvXSA9IGF3YWl0IFByb21pc2UuYWxsKFt0eXBlUCwgaW5mb1BdKVxuICAgIGxldCByYW5nZTogUmFuZ2VcbiAgICBsZXQgdGV4dDogc3RyaW5nXG4gICAgaWYgKHR5cGUgJiYgaW5mbykge1xuICAgICAgcmFuZ2UgPSB0eXBlLnJhbmdlLnVuaW9uKGluZm8ucmFuZ2UpXG4gICAgICB0ZXh0ID0gYDo6ICR7dHlwZS50ZXh0LnRleHR9XFxuJHtpbmZvLnRleHQudGV4dH1gXG4gICAgfSBlbHNlIGlmICh0eXBlKSB7XG4gICAgICByYW5nZSA9IHR5cGUucmFuZ2VcbiAgICAgIHRleHQgPSBgOjogJHt0eXBlLnRleHQudGV4dH1gXG4gICAgfSBlbHNlIGlmIChpbmZvKSB7XG4gICAgICByYW5nZSA9IGluZm8ucmFuZ2VcbiAgICAgIHRleHQgPSBpbmZvLnRleHQudGV4dFxuICAgIH0gZWxzZSB7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoJ0dvdCBuZWl0aGVyIHR5cGUgbm9yIGluZm8nKVxuICAgIH1cbiAgICBjb25zdCBoaWdobGlnaHRlciA9IGF0b20uY29uZmlnLmdldCgnaGFza2VsbC1naGMtbW9kLmhpZ2hsaWdodFRvb2x0aXBzJykgPyAnc291cmNlLmhhc2tlbGwnIDogdW5kZWZpbmVkXG4gICAgcmV0dXJuIHsgcmFuZ2UsIHRleHQ6IHsgdGV4dCwgaGlnaGxpZ2h0ZXIgfSB9XG4gIH1cblxuICBwcml2YXRlIHNldEhpZ2hsaWdodGVyKCkge1xuICAgIGlmIChhdG9tLmNvbmZpZy5nZXQoJ2hhc2tlbGwtZ2hjLW1vZC5oaWdobGlnaHRNZXNzYWdlcycpKSB7XG4gICAgICByZXR1cm4gKG06IFVQSS5JUmVzdWx0SXRlbSk6IFVQSS5JUmVzdWx0SXRlbSA9PiB7XG4gICAgICAgIGlmICh0eXBlb2YgbS5tZXNzYWdlID09PSAnc3RyaW5nJykge1xuICAgICAgICAgIGNvbnN0IG1lc3NhZ2U6IFVQSS5JTWVzc2FnZVRleHQgPSB7XG4gICAgICAgICAgICB0ZXh0OiBtLm1lc3NhZ2UsXG4gICAgICAgICAgICBoaWdobGlnaHRlcjogJ2hpbnQubWVzc2FnZS5oYXNrZWxsJyxcbiAgICAgICAgICB9XG4gICAgICAgICAgcmV0dXJuIHsgLi4ubSwgbWVzc2FnZSB9XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgcmV0dXJuIG1cbiAgICAgICAgfVxuICAgICAgfVxuICAgIH0gZWxzZSB7XG4gICAgICByZXR1cm4gKG06IFVQSS5JUmVzdWx0SXRlbSkgPT4gbVxuICAgIH1cbiAgfVxuXG4gIHByaXZhdGUgc2V0TWVzc2FnZXMobWVzc2FnZXM6IFVQSS5JUmVzdWx0SXRlbVtdKSB7XG4gICAgdGhpcy5sYXN0TWVzc2FnZXMgPSBtZXNzYWdlcy5tYXAodGhpcy5zZXRIaWdobGlnaHRlcigpKVxuICAgIHRoaXMuc2VuZE1lc3NhZ2VzKClcbiAgfVxuXG4gIHByaXZhdGUgc2VuZE1lc3NhZ2VzKCkge1xuICAgIHRoaXMudXBpLnNldE1lc3NhZ2VzKHRoaXMucHJvY2Vzc01lc3NhZ2VzLmNvbmNhdCh0aGlzLmxhc3RNZXNzYWdlcykpXG4gIH1cblxuICBwcml2YXRlIGFzeW5jIGNoZWNrTGludChidWZmZXI6IEF0b21UeXBlcy5UZXh0QnVmZmVyLCBvcHQ6ICdTYXZlJyB8ICdDaGFuZ2UnLCBmYXN0OiBib29sZWFuKSB7XG4gICAgY29uc3QgY2hlY2sgPSBhdG9tLmNvbmZpZy5nZXQoXG4gICAgICBgaGFza2VsbC1naGMtbW9kLm9uJHtvcHR9Q2hlY2tgIGFzICdoYXNrZWxsLWdoYy1tb2Qub25TYXZlQ2hlY2snIHwgJ2hhc2tlbGwtZ2hjLW1vZC5vbkNoYW5nZUNoZWNrJyxcbiAgICApXG4gICAgY29uc3QgbGludCA9IGF0b20uY29uZmlnLmdldChcbiAgICAgIGBoYXNrZWxsLWdoYy1tb2Qub24ke29wdH1MaW50YCBhcyAnaGFza2VsbC1naGMtbW9kLm9uU2F2ZUxpbnQnIHwgJ2hhc2tlbGwtZ2hjLW1vZC5vbkNoYW5nZUxpbnQnLFxuICAgIClcbiAgICBsZXQgcmVzXG4gICAgaWYgKGNoZWNrICYmIGxpbnQpIHtcbiAgICAgIHJlcyA9IGF3YWl0IHRoaXMucHJvY2Vzcy5kb0NoZWNrQW5kTGludChidWZmZXIsIGZhc3QpXG4gICAgfSBlbHNlIGlmIChjaGVjaykge1xuICAgICAgcmVzID0gYXdhaXQgdGhpcy5wcm9jZXNzLmRvQ2hlY2tCdWZmZXIoYnVmZmVyLCBmYXN0KVxuICAgIH0gZWxzZSBpZiAobGludCkge1xuICAgICAgcmVzID0gYXdhaXQgdGhpcy5wcm9jZXNzLmRvTGludEJ1ZmZlcihidWZmZXIpXG4gICAgfVxuICAgIGlmIChyZXMpIHtcbiAgICAgIHRoaXMuc2V0TWVzc2FnZXMocmVzKVxuICAgIH1cbiAgfVxuXG4gIHByaXZhdGUgY29uc29sZVJlcG9ydChhcmc6IElFcnJvckNhbGxiYWNrQXJncykge1xuICAgIC8vIHRzbGludDpkaXNiYWxlLW5leHQtbGluZTogbm8tY29uc29sZVxuICAgIGNvbnNvbGUuZXJyb3IoVXRpbC5mb3JtYXRFcnJvcihhcmcpLCBVdGlsLmdldEVycm9yRGV0YWlsKGFyZykpXG4gIH1cblxuICBwcml2YXRlIGhhbmRsZVByb2Nlc3NFcnJvcihhcmc6IElFcnJvckNhbGxiYWNrQXJncykge1xuICAgIHN3aXRjaCAodGhpcy5tc2dCYWNrZW5kKSB7XG4gICAgICBjYXNlICd1cGknOlxuICAgICAgICB0aGlzLnByb2Nlc3NNZXNzYWdlcy5wdXNoKHtcbiAgICAgICAgICBtZXNzYWdlOiBVdGlsLmZvcm1hdEVycm9yKGFyZylcbiAgICAgICAgICArICdcXG5cXG5TZWUgY29uc29sZSAoVmlldyDihpIgRGV2ZWxvcGVyIOKGkiBUb2dnbGUgRGV2ZWxvcGVyIFRvb2xzIOKGkiBDb25zb2xlIHRhYikgZm9yIGRldGFpbHMuJyxcbiAgICAgICAgICBzZXZlcml0eTogJ2doYy1tb2QnLFxuICAgICAgICB9KVxuICAgICAgICB0aGlzLmNvbnNvbGVSZXBvcnQoYXJnKVxuICAgICAgICB0aGlzLnNlbmRNZXNzYWdlcygpXG4gICAgICAgIGJyZWFrXG4gICAgICBjYXNlICdjb25zb2xlJzpcbiAgICAgICAgdGhpcy5jb25zb2xlUmVwb3J0KGFyZylcbiAgICAgICAgYnJlYWtcbiAgICAgIGNhc2UgJ3BvcHVwJzpcbiAgICAgICAgdGhpcy5jb25zb2xlUmVwb3J0KGFyZylcbiAgICAgICAgYXRvbS5ub3RpZmljYXRpb25zLmFkZEVycm9yKFV0aWwuZm9ybWF0RXJyb3IoYXJnKSwge1xuICAgICAgICAgIGRldGFpbDogVXRpbC5nZXRFcnJvckRldGFpbChhcmcpLFxuICAgICAgICAgIGRpc21pc3NhYmxlOiB0cnVlLFxuICAgICAgICB9KVxuICAgICAgICBicmVha1xuICAgIH1cbiAgfVxuXG4gIHByaXZhdGUgaGFuZGxlUHJvY2Vzc1dhcm5pbmcod2FybmluZzogc3RyaW5nKSB7XG4gICAgc3dpdGNoICh0aGlzLm1zZ0JhY2tlbmQpIHtcbiAgICAgIGNhc2UgJ3VwaSc6XG4gICAgICAgIHRoaXMucHJvY2Vzc01lc3NhZ2VzLnB1c2goe1xuICAgICAgICAgIG1lc3NhZ2U6IHdhcm5pbmcsXG4gICAgICAgICAgc2V2ZXJpdHk6ICdnaGMtbW9kJyxcbiAgICAgICAgfSlcbiAgICAgICAgVXRpbC53YXJuKHdhcm5pbmcpXG4gICAgICAgIHRoaXMuc2VuZE1lc3NhZ2VzKClcbiAgICAgICAgYnJlYWtcbiAgICAgIGNhc2UgJ2NvbnNvbGUnOlxuICAgICAgICBVdGlsLndhcm4od2FybmluZylcbiAgICAgICAgYnJlYWtcbiAgICAgIGNhc2UgJ3BvcHVwJzpcbiAgICAgICAgVXRpbC53YXJuKHdhcm5pbmcpXG4gICAgICAgIGF0b20ubm90aWZpY2F0aW9ucy5hZGRXYXJuaW5nKHdhcm5pbmcsIHtcbiAgICAgICAgICBkaXNtaXNzYWJsZTogZmFsc2UsXG4gICAgICAgIH0pXG4gICAgICAgIGJyZWFrXG4gICAgfVxuICB9XG59XG4iXX0=