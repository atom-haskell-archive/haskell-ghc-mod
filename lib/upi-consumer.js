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
    lint: {}
};
const addMsgTypes = {
    'ghc-mod': {
        uriFilter: false,
        autoScroll: true
    }
};
const contextScope = 'atom-text-editor[data-grammar~="haskell"]';
const mainMenu = {
    label: 'ghc-mod',
    menu: [
        { label: 'Check', command: 'haskell-ghc-mod:check-file' },
        { label: 'Lint', command: 'haskell-ghc-mod:lint-file' },
        { label: 'Stop Backend', command: 'haskell-ghc-mod:shutdown-backend' }
    ]
};
var MsgBackend;
(function (MsgBackend) {
    MsgBackend["Console"] = "console";
    MsgBackend["UPI"] = "upi";
    MsgBackend["Popup"] = "popup";
})(MsgBackend || (MsgBackend = {}));
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
                { label: 'Go To Declaration', command: 'haskell-ghc-mod:go-to-declaration' }
            ]
        };
        this.disposables.add(this.process.onError(this.handleProcessError.bind(this)), this.process.onWarning(this.handleProcessWarning.bind(this)));
        const msgTypes = this.msgBackend === "upi"
            ? Object.assign({}, messageTypes, addMsgTypes) : messageTypes;
        this.upi = register({
            name: 'haskell-ghc-mod',
            menu: mainMenu,
            messageTypes: msgTypes,
            tooltip: this.shouldShowTooltip.bind(this),
            events: {
                onDidSaveBuffer: (buffer) => __awaiter(this, void 0, void 0, function* () { return this.checkLint(buffer, 'Save'); }),
                onDidStopChanging: (buffer) => __awaiter(this, void 0, void 0, function* () { return this.checkLint(buffer, 'Change', true); })
            }
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
            if (type === 'mouse') {
                const t = atom.config.get('haskell-ghc-mod.onMouseHoverShow');
                if (t) {
                    return this[`${t}Tooltip`](editor, crange);
                }
            }
            else if (type === 'selection') {
                const t = atom.config.get('haskell-ghc-mod.onSelectionShow');
                if (t) {
                    return this[`${t}Tooltip`](editor, crange);
                }
            }
        });
    }
    checkCommand({ currentTarget }) {
        return __awaiter(this, void 0, void 0, function* () {
            const editor = currentTarget.getModel();
            const res = yield this.process.doCheckBuffer(editor.getBuffer());
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
        return ({ currentTarget, detail }) => this.upi.showTooltip({
            editor: currentTarget.getModel(),
            detail,
            tooltip(crange) {
                return __awaiter(this, void 0, void 0, function* () {
                    return tooltipfun(currentTarget.getModel(), crange);
                });
            }
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
            const { type } = yield this.process.getTypeInBuffer(editor.getBuffer(), crange);
            const symInfo = Util.getSymbolAtPoint(editor, pos);
            if (!symInfo) {
                return;
            }
            const { scope, range, symbol } = symInfo;
            if (scope.startsWith('keyword.operator.')) {
                return;
            }
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
            atom.workspace.open(uri, {
                initialLine: parseInt(line, 10) - 1,
                initialColumn: parseInt(col, 10) - 1
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
                        end: '\n'
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
                        'hint.type.haskell' : undefined
                }
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
                        'source.haskell' : undefined
                }
            };
        });
    }
    infoTypeTooltip(e, p) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                return yield this.infoTooltip(e, p);
            }
            catch (e) {
                return this.typeTooltip(e, p);
            }
        });
    }
    typeInfoTooltip(e, p) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                return yield this.typeTooltip(e, p);
            }
            catch (e) {
                return this.infoTooltip(e, p);
            }
        });
    }
    typeAndInfoTooltip(e, p) {
        return __awaiter(this, void 0, void 0, function* () {
            const typeP = this.typeTooltip(e, p).catch(() => undefined);
            const infoP = this.infoTooltip(e, p).catch(() => undefined);
            const [type, info] = yield Promise.all([typeP, infoP]);
            let range, text;
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
                        highlighter: 'hint.message.haskell'
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
    checkLint(buffer, opt, fast = false) {
        return __awaiter(this, void 0, void 0, function* () {
            let res;
            if (atom.config.get(`haskell-ghc-mod.on${opt}Check`) && atom.config.get(`haskell-ghc-mod.on${opt}Lint`)) {
                res = yield this.process.doCheckAndLint(buffer, fast);
            }
            else if (atom.config.get(`haskell-ghc-mod.on${opt}Check`)) {
                res = yield this.process.doCheckBuffer(buffer, fast);
            }
            else if (atom.config.get(`haskell-ghc-mod.on${opt}Lint`)) {
                res = yield this.process.doLintBuffer(buffer, fast);
            }
            if (res) {
                this.setMessages(res);
            }
        });
    }
    consoleReport(arg) {
        Util.error(Util.formatError(arg), Util.getErrorDetail(arg));
    }
    handleProcessError(arg) {
        switch (this.msgBackend) {
            case "upi":
                this.processMessages.push({
                    message: Util.formatError(arg)
                        + '\n\nSee console (View → Developer → Toggle Developer Tools → Console tab) for details.',
                    severity: 'ghc-mod'
                });
                this.consoleReport(arg);
                this.sendMessages();
                break;
            case "console":
                this.consoleReport(arg);
                break;
            case "popup":
                this.consoleReport(arg);
                atom.notifications.addError(Util.formatError(arg), {
                    detail: Util.getErrorDetail(arg),
                    dismissable: true
                });
                break;
        }
    }
    handleProcessWarning(warning) {
        switch (this.msgBackend) {
            case "upi":
                this.processMessages.push({
                    message: warning,
                    severity: 'ghc-mod'
                });
                Util.warn(warning);
                this.sendMessages();
                break;
            case "console":
                Util.warn(warning);
                break;
            case "popup":
                Util.warn(warning);
                atom.notifications.addWarning(warning, {
                    dismissable: false
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidXBpLWNvbnN1bWVyLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vc3JjL3VwaS1jb25zdW1lci50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOzs7Ozs7Ozs7Ozs7Ozs7Ozs7O0FBQUEsK0JBQTZEO0FBRTdELCtEQUF1RDtBQUN2RCwrQkFBOEI7QUFDOUIsaUNBQXNDO0FBRXRDLE1BQU0sWUFBWSxHQUFHO0lBQ25CLEtBQUssRUFBRSxFQUFFO0lBQ1QsT0FBTyxFQUFFLEVBQUU7SUFDWCxJQUFJLEVBQUUsRUFBRTtDQUNULENBQUE7QUFFRCxNQUFNLFdBQVcsR0FBRztJQUNsQixTQUFTLEVBQUU7UUFDVCxTQUFTLEVBQUUsS0FBSztRQUNoQixVQUFVLEVBQUUsSUFBSTtLQUNqQjtDQUNGLENBQUE7QUFFRCxNQUFNLFlBQVksR0FBRywyQ0FBMkMsQ0FBQTtBQUVoRSxNQUFNLFFBQVEsR0FBRztJQUNmLEtBQUssRUFBRSxTQUFTO0lBQ2hCLElBQUksRUFBRTtRQUNKLEVBQUMsS0FBSyxFQUFFLE9BQU8sRUFBRSxPQUFPLEVBQUUsNEJBQTRCLEVBQUM7UUFDdkQsRUFBQyxLQUFLLEVBQUUsTUFBTSxFQUFFLE9BQU8sRUFBRSwyQkFBMkIsRUFBQztRQUNyRCxFQUFDLEtBQUssRUFBRSxjQUFjLEVBQUUsT0FBTyxFQUFFLGtDQUFrQyxFQUFDO0tBQ3JFO0NBQ0YsQ0FBQTtBQUVELElBQVcsVUFJVjtBQUpELFdBQVcsVUFBVTtJQUNuQixpQ0FBbUIsQ0FBQTtJQUNuQix5QkFBVyxDQUFBO0lBQ1gsNkJBQWUsQ0FBQTtBQUNqQixDQUFDLEVBSlUsVUFBVSxLQUFWLFVBQVUsUUFJcEI7QUFFRDtJQTJDRSxZQUFhLFFBQThCLEVBQVUsT0FBdUI7UUFBdkIsWUFBTyxHQUFQLE9BQU8sQ0FBZ0I7UUF6Q3BFLGdCQUFXLEdBQXdCLElBQUksMEJBQW1CLEVBQUUsQ0FBQTtRQUM1RCxvQkFBZSxHQUFzQixFQUFFLENBQUE7UUFDdkMsaUJBQVksR0FBc0IsRUFB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QUE7UUFDVCxDQUFDO0lBQ0gsQ0FBQztJQUVPLG9CQUFvQixDQUFFLE9BQWU7UUFDM0MsTUFBTSxDQUFDLENBQUMsSUFBSSxDQUFDLFVBQVUsQ0FBQyxDQUFDLENBQUM7WUFDeEI7Z0JBQ0UsSUFBSSxDQUFDLGVBQWUsQ0FBQyxJQUFJLENBQUM7b0JBQ3hCLE9BQU8sRUFBRSxPQUFPO29CQUNoQixRQUFRLEVBQUUsU0FBUztpQkFDcEIsQ0FBQyxDQUFBO2dCQUNGLElBQUksQ0FBQyxJQUFJLENBQUMsT0FBTyxDQUFDLENBQUE7Z0JBQ2xCLElBQUksQ0FBQyxZQUFZLEVBQUUsQ0FBQTtnQkFDbkIsS0FBSyxDQUFBO1lBQ1A7Z0JBQ0UsSUFBSSxDQUFDLElBQUksQ0FBQyxPQUFPLENBQUMsQ0FBQTtnQkFDbEIsS0FBSyxDQUFBO1lBQ1A7Z0JBQ0UsSUFBSSxDQUFDLElBQUksQ0FBQyxPQUFPLENBQUMsQ0FBQTtnQkFDbEIsSUFBSSxDQUFDLGFBQWEsQ0FBQyxVQUFVLENBQUMsT0FBTyxFQUFFO29CQUNyQyxXQUFXLEVBQUUsS0FBSztpQkFDbkIsQ0FBQyxDQUFBO2dCQUNGLEtBQUssQ0FBQTtRQUNULENBQUM7SUFDSCxDQUFDO0NBQ0Y7QUExU0M7SUFEQyxzQkFBZTs7OzsrQ0FLZjtBQUdEO0lBREMsc0JBQWU7Ozs7OENBS2Y7QUFjRDtJQURDLHNCQUFlOzs7O29EQTJCZjtBQUdEO0lBREMsc0JBQWU7Ozs7bURBVWY7QUFHRDtJQURDLHNCQUFlOzs7O2lEQXdCZjtBQUdEO0lBREMsc0JBQWU7Ozs7a0RBa0JmO0FBR0Q7SUFEQyxzQkFBZTs7OztzREFnQ2Y7QUFsUEgsa0NBNllDIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IHsgSUV2ZW50RGVzYywgQ29tcG9zaXRlRGlzcG9zYWJsZSwgUmFuZ2UgfSBmcm9tICdhdG9tJ1xuaW1wb3J0IHtHaGNNb2RpUHJvY2VzcywgSUVycm9yQ2FsbGJhY2tBcmdzfSBmcm9tICcuL2doYy1tb2QnXG5pbXBvcnQge2ltcG9ydExpc3RWaWV3fSBmcm9tICcuL3ZpZXdzL2ltcG9ydC1saXN0LXZpZXcnXG5pbXBvcnQgKiBhcyBVdGlsIGZyb20gJy4vdXRpbCdcbmltcG9ydCB7aGFuZGxlRXhjZXB0aW9ufSBmcm9tICcuL3V0aWwnXG5cbmNvbnN0IG1lc3NhZ2VUeXBlcyA9IHtcbiAgZXJyb3I6IHt9LFxuICB3YXJuaW5nOiB7fSxcbiAgbGludDoge31cbn1cblxuY29uc3QgYWRkTXNnVHlwZXMgPSB7XG4gICdnaGMtbW9kJzoge1xuICAgIHVyaUZpbHRlcjogZmFsc2UsXG4gICAgYXV0b1Njcm9sbDogdHJ1ZVxuICB9XG59XG5cbmNvbnN0IGNvbnRleHRTY29wZSA9ICdhdG9tLXRleHQtZWRpdG9yW2RhdGEtZ3JhbW1hcn49XCJoYXNrZWxsXCJdJ1xuXG5jb25zdCBtYWluTWVudSA9IHtcbiAgbGFiZWw6ICdnaGMtbW9kJyxcbiAgbWVudTogW1xuICAgIHtsYWJlbDogJ0NoZWNrJywgY29tbWFuZDogJ2hhc2tlbGwtZ2hjLW1vZDpjaGVjay1maWxlJ30sXG4gICAge2xhYmVsOiAnTGludCcsIGNvbW1hbmQ6ICdoYXNrZWxsLWdoYy1tb2Q6bGludC1maWxlJ30sXG4gICAge2xhYmVsOiAnU3RvcCBCYWNrZW5kJywgY29tbWFuZDogJ2hhc2tlbGwtZ2hjLW1vZDpzaHV0ZG93bi1iYWNrZW5kJ31cbiAgXVxufVxuXG5jb25zdCBlbnVtIE1zZ0JhY2tlbmQge1xuICBDb25zb2xlID0gJ2NvbnNvbGUnLFxuICBVUEkgPSAndXBpJyxcbiAgUG9wdXAgPSAncG9wdXAnLFxufVxuXG5leHBvcnQgY2xhc3MgVVBJQ29uc3VtZXIge1xuICBwdWJsaWMgdXBpOiBVUEkuSVVQSUluc3RhbmNlXG4gIHByaXZhdGUgZGlzcG9zYWJsZXM6IENvbXBvc2l0ZURpc3Bvc2FibGUgPSBuZXcgQ29tcG9zaXRlRGlzcG9zYWJsZSgpXG4gIHByaXZhdGUgcHJvY2Vzc01lc3NhZ2VzOiBVUEkuSVJlc3VsdEl0ZW1bXSA9IFtdXG4gIHByaXZhdGUgbGFzdE1lc3NhZ2VzOiBVUEkuSVJlc3VsdEl0ZW1bXSA9IFtdXG4gIHByaXZhdGUgbXNnQmFja2VuZDogTXNnQmFja2VuZCA9IGF0b20uY29uZmlnLmdldCgnaGFza2VsbC1naGMtbW9kLmdoY01vZE1lc3NhZ2VzJylcblxuICBwcml2YXRlIGNvbnRleHRDb21tYW5kcyA9IHtcbiAgICAnaGFza2VsbC1naGMtbW9kOnNob3ctdHlwZSc6IHRoaXMudG9vbHRpcENvbW1hbmQodGhpcy50eXBlVG9vbHRpcC5iaW5kKHRoaXMpKSxcbiAgICAnaGFza2VsbC1naGMtbW9kOnNob3ctaW5mbyc6IHRoaXMudG9vbHRpcENvbW1hbmQodGhpcy5pbmZvVG9vbHRpcC5iaW5kKHRoaXMpKSxcbiAgICAnaGFza2VsbC1naGMtbW9kOmNhc2Utc3BsaXQnOiB0aGlzLmNhc2VTcGxpdENvbW1hbmQuYmluZCh0aGlzKSxcbiAgICAnaGFza2VsbC1naGMtbW9kOnNpZy1maWxsJzogdGhpcy5zaWdGaWxsQ29tbWFuZC5iaW5kKHRoaXMpLFxuICAgICdoYXNrZWxsLWdoYy1tb2Q6Z28tdG8tZGVjbGFyYXRpb24nOiB0aGlzLmdvVG9EZWNsQ29tbWFuZC5iaW5kKHRoaXMpLFxuICAgICdoYXNrZWxsLWdoYy1tb2Q6c2hvdy1pbmZvLWZhbGxiYWNrLXRvLXR5cGUnOiB0aGlzLnRvb2x0aXBDb21tYW5kKHRoaXMuaW5mb1R5cGVUb29sdGlwLmJpbmQodGhpcykpLFxuICAgICdoYXNrZWxsLWdoYy1tb2Q6c2hvdy10eXBlLWZhbGxiYWNrLXRvLWluZm8nOiB0aGlzLnRvb2x0aXBDb21tYW5kKHRoaXMudHlwZUluZm9Ub29sdGlwLmJpbmQodGhpcykpLFxuICAgICdoYXNrZWxsLWdoYy1tb2Q6c2hvdy10eXBlLWFuZC1pbmZvJzogdGhpcy50b29sdGlwQ29tbWFuZCh0aGlzLnR5cGVBbmRJbmZvVG9vbHRpcC5iaW5kKHRoaXMpKSxcbiAgICAnaGFza2VsbC1naGMtbW9kOmluc2VydC10eXBlJzogdGhpcy5pbnNlcnRUeXBlQ29tbWFuZC5iaW5kKHRoaXMpLFxuICAgICdoYXNrZWxsLWdoYy1tb2Q6aW5zZXJ0LWltcG9ydCc6IHRoaXMuaW5zZXJ0SW1wb3J0Q29tbWFuZC5iaW5kKHRoaXMpLFxuICB9XG5cbiAgcHJpdmF0ZSBnbG9iYWxDb21tYW5kcyA9IHtcbiAgICAnaGFza2VsbC1naGMtbW9kOmNoZWNrLWZpbGUnOiB0aGlzLmNoZWNrQ29tbWFuZC5iaW5kKHRoaXMpLFxuICAgICdoYXNrZWxsLWdoYy1tb2Q6bGludC1maWxlJzogdGhpcy5saW50Q29tbWFuZC5iaW5kKHRoaXMpLFxuICAgIC4uLnRoaXMuY29udGV4dENvbW1hbmRzXG4gIH1cblxuICBwcml2YXRlIGNvbnRleHRNZW51OiB7XG4gICAgbGFiZWw6IHN0cmluZywgc3VibWVudTogQXJyYXk8e2xhYmVsOiBzdHJpbmcsIGNvbW1hbmQ6IGtleW9mIFVQSUNvbnN1bWVyWydjb250ZXh0Q29tbWFuZHMnXX0+XG4gIH0gPSB7XG4gICAgbGFiZWw6ICdnaGMtbW9kJyxcbiAgICBzdWJtZW51OlxuICAgICAgW1xuICAgICAgICB7bGFiZWw6ICdTaG93IFR5cGUnLCBjb21tYW5kOiAnaGFza2VsbC1naGMtbW9kOnNob3ctdHlwZSd9LFxuICAgICAgICB7bGFiZWw6ICdTaG93IEluZm8nLCBjb21tYW5kOiAnaGFza2VsbC1naGMtbW9kOnNob3ctaW5mbyd9LFxuICAgICAgICB7bGFiZWw6ICdTaG93IFR5cGUgQW5kIEluZm8nLCBjb21tYW5kOiAnaGFza2VsbC1naGMtbW9kOnNob3ctdHlwZS1hbmQtaW5mbyd9LFxuICAgICAgICB7bGFiZWw6ICdDYXNlIFNwbGl0JywgY29tbWFuZDogJ2hhc2tlbGwtZ2hjLW1vZDpjYXNlLXNwbGl0J30sXG4gICAgICAgIHtsYWJlbDogJ1NpZyBGaWxsJywgY29tbWFuZDogJ2hhc2tlbGwtZ2hjLW1vZDpzaWctZmlsbCd9LFxuICAgICAgICB7bGFiZWw6ICdJbnNlcnQgVHlwZScsIGNvbW1hbmQ6ICdoYXNrZWxsLWdoYy1tb2Q6aW5zZXJ0LXR5cGUnfSxcbiAgICAgICAge2xhYmVsOiAnSW5zZXJ0IEltcG9ydCcsIGNvbW1hbmQ6ICdoYXNrZWxsLWdoYy1tb2Q6aW5zZXJ0LWltcG9ydCd9LFxuICAgICAgICB7bGFiZWw6ICdHbyBUbyBEZWNsYXJhdGlvbicsIGNvbW1hbmQ6ICdoYXNrZWxsLWdoYy1tb2Q6Z28tdG8tZGVjbGFyYXRpb24nfVxuICAgICAgXVxuICB9XG5cbiAgY29uc3RydWN0b3IgKHJlZ2lzdGVyOiBVUEkuSVVQSVJlZ2lzdHJhdGlvbiwgcHJpdmF0ZSBwcm9jZXNzOiBHaGNNb2RpUHJvY2Vzcykge1xuICAgIHRoaXMuZGlzcG9zYWJsZXMuYWRkKFxuICAgICAgdGhpcy5wcm9jZXNzLm9uRXJyb3IodGhpcy5oYW5kbGVQcm9jZXNzRXJyb3IuYmluZCh0aGlzKSksXG4gICAgICB0aGlzLnByb2Nlc3Mub25XYXJuaW5nKHRoaXMuaGFuZGxlUHJvY2Vzc1dhcm5pbmcuYmluZCh0aGlzKSksXG4gICAgKVxuXG4gICAgY29uc3QgbXNnVHlwZXMgPVxuICAgICAgdGhpcy5tc2dCYWNrZW5kID09PSBNc2dCYWNrZW5kLlVQSVxuICAgICAgPyB7IC4uLm1lc3NhZ2VUeXBlcywgLi4uYWRkTXNnVHlwZXMgfVxuICAgICAgOiBtZXNzYWdlVHlwZXNcblxuICAgIHRoaXMudXBpID0gcmVnaXN0ZXIoe1xuICAgICAgbmFtZTogJ2hhc2tlbGwtZ2hjLW1vZCcsXG4gICAgICBtZW51OiBtYWluTWVudSxcbiAgICAgIG1lc3NhZ2VUeXBlczogbXNnVHlwZXMsXG4gICAgICB0b29sdGlwOiB0aGlzLnNob3VsZFNob3dUb29sdGlwLmJpbmQodGhpcyksXG4gICAgICBldmVudHM6IHtcbiAgICAgICAgb25EaWRTYXZlQnVmZmVyOiBhc3luYyAoYnVmZmVyKSA9PlxuICAgICAgICAgIHRoaXMuY2hlY2tMaW50KGJ1ZmZlciwgJ1NhdmUnKSxcbiAgICAgICAgb25EaWRTdG9wQ2hhbmdpbmc6IGFzeW5jIChidWZmZXIpID0+XG4gICAgICAgICAgdGhpcy5jaGVja0xpbnQoYnVmZmVyLCAnQ2hhbmdlJywgdHJ1ZSlcbiAgICAgIH1cbiAgICB9KVxuXG4gICAgdGhpcy5kaXNwb3NhYmxlcy5hZGQoXG4gICAgICB0aGlzLnVwaSxcbiAgICAgIHRoaXMucHJvY2Vzcy5vbkJhY2tlbmRBY3RpdmUoKCkgPT4gdGhpcy51cGkuc2V0U3RhdHVzKHtzdGF0dXM6ICdwcm9ncmVzcycsIGRldGFpbDogJyd9KSksXG4gICAgICB0aGlzLnByb2Nlc3Mub25CYWNrZW5kSWRsZSgoKSA9PiB0aGlzLnVwaS5zZXRTdGF0dXMoe3N0YXR1czogJ3JlYWR5JywgZGV0YWlsOiAnJ30pKSxcbiAgICAgIGF0b20uY29tbWFuZHMuYWRkKGNvbnRleHRTY29wZSwgdGhpcy5nbG9iYWxDb21tYW5kcyksXG4gICAgKVxuICAgIGNvbnN0IGNtID0ge31cbiAgICBjbVtjb250ZXh0U2NvcGVdID0gW3RoaXMuY29udGV4dE1lbnVdXG4gICAgdGhpcy5kaXNwb3NhYmxlcy5hZGQoYXRvbS5jb250ZXh0TWVudS5hZGQoY20pKVxuICB9XG5cbiAgcHVibGljIGRpc3Bvc2UgKCkge1xuICAgIHRoaXMuZGlzcG9zYWJsZXMuZGlzcG9zZSgpXG4gIH1cblxuICBwcml2YXRlIGFzeW5jIHNob3VsZFNob3dUb29sdGlwIChcbiAgICBlZGl0b3I6IEF0b21UeXBlcy5UZXh0RWRpdG9yLCBjcmFuZ2U6IEF0b21UeXBlcy5SYW5nZSwgdHlwZTogVVBJLlRFdmVudFJhbmdlVHlwZVxuICApOiBQcm9taXNlPFVQSS5JVG9vbHRpcERhdGEgfCB1bmRlZmluZWQ+IHtcbiAgICAgIGlmICh0eXBlID09PSAnbW91c2UnKSB7XG4gICAgICAgIGNvbnN0IHQgPSBhdG9tLmNvbmZpZy5nZXQoJ2hhc2tlbGwtZ2hjLW1vZC5vbk1vdXNlSG92ZXJTaG93JylcbiAgICAgICAgaWYgKHQpIHtcbiAgICAgICAgICByZXR1cm4gdGhpc1tgJHt0fVRvb2x0aXBgXShlZGl0b3IsIGNyYW5nZSlcbiAgICAgICAgfVxuICAgICAgfSBlbHNlIGlmICh0eXBlID09PSAnc2VsZWN0aW9uJykge1xuICAgICAgICBjb25zdCB0ID0gYXRvbS5jb25maWcuZ2V0KCdoYXNrZWxsLWdoYy1tb2Qub25TZWxlY3Rpb25TaG93JylcbiAgICAgICAgaWYgKHQpIHtcbiAgICAgICAgICByZXR1cm4gdGhpc1tgJHt0fVRvb2x0aXBgXShlZGl0b3IsIGNyYW5nZSlcbiAgICAgICAgfVxuICAgICAgfVxuICB9XG5cbiAgQGhhbmRsZUV4Y2VwdGlvblxuICBwcml2YXRlIGFzeW5jIGNoZWNrQ29tbWFuZCAoe2N1cnJlbnRUYXJnZXR9OiBJRXZlbnREZXNjKSB7XG4gICAgY29uc3QgZWRpdG9yID0gY3VycmVudFRhcmdldC5nZXRNb2RlbCgpXG4gICAgY29uc3QgcmVzID0gYXdhaXQgdGhpcy5wcm9jZXNzLmRvQ2hlY2tCdWZmZXIoZWRpdG9yLmdldEJ1ZmZlcigpKVxuICAgIHRoaXMuc2V0TWVzc2FnZXMocmVzKVxuICB9XG5cbiAgQGhhbmRsZUV4Y2VwdGlvblxuICBwcml2YXRlIGFzeW5jIGxpbnRDb21tYW5kICh7Y3VycmVudFRhcmdldH06IElFdmVudERlc2MpIHtcbiAgICBjb25zdCBlZGl0b3IgPSBjdXJyZW50VGFyZ2V0LmdldE1vZGVsKClcbiAgICBjb25zdCByZXMgPSBhd2FpdCB0aGlzLnByb2Nlc3MuZG9MaW50QnVmZmVyKGVkaXRvci5nZXRCdWZmZXIoKSlcbiAgICB0aGlzLnNldE1lc3NhZ2VzKHJlcylcbiAgfVxuXG4gIHByaXZhdGUgdG9vbHRpcENvbW1hbmQgKHRvb2x0aXBmdW46IChlOiBBdG9tVHlwZXMuVGV4dEVkaXRvciwgcDogQXRvbVR5cGVzLlJhbmdlKSA9PiBQcm9taXNlPFVQSS5JVG9vbHRpcERhdGE+KSB7XG4gICAgcmV0dXJuICh7Y3VycmVudFRhcmdldCwgZGV0YWlsfTogSUV2ZW50RGVzYykgPT5cbiAgICAgIHRoaXMudXBpLnNob3dUb29sdGlwKHtcbiAgICAgICAgZWRpdG9yOiBjdXJyZW50VGFyZ2V0LmdldE1vZGVsKCksXG4gICAgICAgIGRldGFpbCxcbiAgICAgICAgYXN5bmMgdG9vbHRpcCAoY3JhbmdlKSB7XG4gICAgICAgICAgcmV0dXJuIHRvb2x0aXBmdW4oY3VycmVudFRhcmdldC5nZXRNb2RlbCgpLCBjcmFuZ2UpXG4gICAgICAgIH1cbiAgICAgIH0pXG4gIH1cblxuICBAaGFuZGxlRXhjZXB0aW9uXG4gIHByaXZhdGUgYXN5bmMgaW5zZXJ0VHlwZUNvbW1hbmQgKHtjdXJyZW50VGFyZ2V0LCBkZXRhaWx9OiBJRXZlbnREZXNjKSB7XG4gICAgY29uc3QgZWRpdG9yID0gY3VycmVudFRhcmdldC5nZXRNb2RlbCgpXG4gICAgY29uc3QgZXIgPSB0aGlzLnVwaS5nZXRFdmVudFJhbmdlKGVkaXRvciwgZGV0YWlsKVxuICAgIGlmIChlciA9PT0gdW5kZWZpbmVkKSB7IHJldHVybiB9XG4gICAgY29uc3Qge2NyYW5nZSwgcG9zfSA9IGVyXG4gICAgY29uc3Qge3R5cGV9ID0gYXdhaXQgdGhpcy5wcm9jZXNzLmdldFR5cGVJbkJ1ZmZlcihlZGl0b3IuZ2V0QnVmZmVyKCksIGNyYW5nZSlcbiAgICBjb25zdCBzeW1JbmZvID0gVXRpbC5nZXRTeW1ib2xBdFBvaW50KGVkaXRvciwgcG9zKVxuICAgIGlmICghc3ltSW5mbykgeyByZXR1cm4gfVxuICAgIGNvbnN0IHtzY29wZSwgcmFuZ2UsIHN5bWJvbH0gPSBzeW1JbmZvXG4gICAgaWYgKHNjb3BlLnN0YXJ0c1dpdGgoJ2tleXdvcmQub3BlcmF0b3IuJykpIHsgcmV0dXJuIH0gLy8gY2FuJ3QgY29ycmVjdGx5IGhhbmRsZSBpbmZpeCBub3RhdGlvblxuICAgIGlmIChlZGl0b3IuZ2V0VGV4dEluQnVmZmVyUmFuZ2UoW3JhbmdlLmVuZCwgZWRpdG9yLmJ1ZmZlclJhbmdlRm9yQnVmZmVyUm93KHJhbmdlLmVuZC5yb3cpLmVuZF0pLm1hdGNoKC89LykpIHtcbiAgICAgIGxldCBpbmRlbnQgPSBlZGl0b3IuZ2V0VGV4dEluQnVmZmVyUmFuZ2UoW1tyYW5nZS5zdGFydC5yb3csIDBdLCByYW5nZS5zdGFydF0pXG4gICAgICBsZXQgYmlyZFRyYWNrID0gJydcbiAgICAgIGlmIChlZGl0b3Iuc2NvcGVEZXNjcmlwdG9yRm9yQnVmZmVyUG9zaXRpb24ocG9zKS5nZXRTY29wZXNBcnJheSgpLmluY2x1ZGVzKCdtZXRhLmVtYmVkZGVkLmhhc2tlbGwnKSkge1xuICAgICAgICBiaXJkVHJhY2sgPSBpbmRlbnQuc2xpY2UoMCwgMilcbiAgICAgICAgaW5kZW50ID0gaW5kZW50LnNsaWNlKDIpXG4gICAgICB9XG4gICAgICBpZiAoaW5kZW50Lm1hdGNoKC9cXFMvKSkge1xuICAgICAgICBpbmRlbnQgPSBpbmRlbnQucmVwbGFjZSgvXFxTL2csICcgJylcbiAgICAgIH1cbiAgICAgIGVkaXRvci5zZXRUZXh0SW5CdWZmZXJSYW5nZShcbiAgICAgICAgW3JhbmdlLnN0YXJ0LCByYW5nZS5zdGFydF0sIGAke3N5bWJvbH0gOjogJHt0eXBlfVxcbiR7YmlyZFRyYWNrfSR7aW5kZW50fWBcbiAgICAgIClcbiAgICB9IGVsc2Uge1xuICAgICAgZWRpdG9yLnNldFRleHRJbkJ1ZmZlclJhbmdlKHJhbmdlLCBgKCR7ZWRpdG9yLmdldFRleHRJbkJ1ZmZlclJhbmdlKHJhbmdlKX0gOjogJHt0eXBlfSlgKVxuICAgIH1cbiAgfVxuXG4gIEBoYW5kbGVFeGNlcHRpb25cbiAgcHJpdmF0ZSBhc3luYyBjYXNlU3BsaXRDb21tYW5kICh7Y3VycmVudFRhcmdldCwgZGV0YWlsfTogSUV2ZW50RGVzYykge1xuICAgIGNvbnN0IGVkaXRvciA9IGN1cnJlbnRUYXJnZXQuZ2V0TW9kZWwoKVxuICAgIGNvbnN0IGV2ciA9IHRoaXMudXBpLmdldEV2ZW50UmFuZ2UoZWRpdG9yLCBkZXRhaWwpXG4gICAgaWYgKCFldnIpIHsgcmV0dXJuIH1cbiAgICBjb25zdCB7Y3JhbmdlfSA9IGV2clxuICAgIGNvbnN0IHJlcyA9IGF3YWl0IHRoaXMucHJvY2Vzcy5kb0Nhc2VTcGxpdChlZGl0b3IuZ2V0QnVmZmVyKCksIGNyYW5nZSlcbiAgICBmb3IgKGNvbnN0IHtyYW5nZSwgcmVwbGFjZW1lbnR9IG9mIHJlcykge1xuICAgICAgZWRpdG9yLnNldFRleHRJbkJ1ZmZlclJhbmdlKHJhbmdlLCByZXBsYWNlbWVudClcbiAgICB9XG4gIH1cblxuICBAaGFuZGxlRXhjZXB0aW9uXG4gIHByaXZhdGUgYXN5bmMgc2lnRmlsbENvbW1hbmQgKHtjdXJyZW50VGFyZ2V0LCBkZXRhaWx9OiBJRXZlbnREZXNjKSB7XG4gICAgY29uc3QgZWRpdG9yID0gY3VycmVudFRhcmdldC5nZXRNb2RlbCgpXG4gICAgY29uc3QgZXZyID0gdGhpcy51cGkuZ2V0RXZlbnRSYW5nZShlZGl0b3IsIGRldGFpbClcbiAgICBpZiAoIWV2cikgeyByZXR1cm4gfVxuICAgIGNvbnN0IHtjcmFuZ2V9ID0gZXZyXG4gICAgY29uc3QgcmVzID0gYXdhaXQgdGhpcy5wcm9jZXNzLmRvU2lnRmlsbChlZGl0b3IuZ2V0QnVmZmVyKCksIGNyYW5nZSlcblxuICAgIGVkaXRvci50cmFuc2FjdCgoKSA9PiB7XG4gICAgICBjb25zdCB7IHR5cGUsIHJhbmdlLCBib2R5IH0gPSByZXNcbiAgICAgIGNvbnN0IHNpZyA9IGVkaXRvci5nZXRUZXh0SW5CdWZmZXJSYW5nZShyYW5nZSlcbiAgICAgIGxldCBpbmRlbnQgPSBlZGl0b3IuaW5kZW50TGV2ZWxGb3JMaW5lKHNpZylcbiAgICAgIGNvbnN0IHBvcyA9IHJhbmdlLmVuZFxuICAgICAgY29uc3QgdGV4dCA9IGBcXG4ke2JvZHl9YFxuICAgICAgaWYgKHR5cGUgPT09ICdpbnN0YW5jZScpIHtcbiAgICAgICAgaW5kZW50ICs9IDFcbiAgICAgICAgaWYgKCFzaWcuZW5kc1dpdGgoJyB3aGVyZScpKSB7XG4gICAgICAgICAgZWRpdG9yLnNldFRleHRJbkJ1ZmZlclJhbmdlKFtyYW5nZS5lbmQsIHJhbmdlLmVuZF0sICcgd2hlcmUnKVxuICAgICAgICB9XG4gICAgICB9XG4gICAgICBjb25zdCBuZXdyYW5nZSA9IGVkaXRvci5zZXRUZXh0SW5CdWZmZXJSYW5nZShbcG9zLCBwb3NdLCB0ZXh0KVxuICAgICAgbmV3cmFuZ2UuZ2V0Um93cygpLnNsaWNlKDEpLm1hcCgocm93KSA9PlxuICAgICAgICBlZGl0b3Iuc2V0SW5kZW50YXRpb25Gb3JCdWZmZXJSb3cocm93LCBpbmRlbnQpKVxuICAgIH0pXG4gIH1cblxuICBAaGFuZGxlRXhjZXB0aW9uXG4gIHByaXZhdGUgYXN5bmMgZ29Ub0RlY2xDb21tYW5kICh7Y3VycmVudFRhcmdldCwgZGV0YWlsfTogSUV2ZW50RGVzYykge1xuICAgIGNvbnN0IGVkaXRvciA9IGN1cnJlbnRUYXJnZXQuZ2V0TW9kZWwoKVxuICAgIGNvbnN0IGV2ciA9IHRoaXMudXBpLmdldEV2ZW50UmFuZ2UoZWRpdG9yLCBkZXRhaWwpXG4gICAgaWYgKCFldnIpIHsgcmV0dXJuIH1cbiAgICBjb25zdCB7Y3JhbmdlfSA9IGV2clxuICAgIGNvbnN0IHtpbmZvfSA9IGF3YWl0IHRoaXMucHJvY2Vzcy5nZXRJbmZvSW5CdWZmZXIoZWRpdG9yLCBjcmFuZ2UpXG4gICAgY29uc3QgcmVzID0gLy4qLS0gRGVmaW5lZCBhdCAoLispOihcXGQrKTooXFxkKykvLmV4ZWMoaW5mbylcbiAgICBpZiAoIXJlcykgeyByZXR1cm4gfVxuICAgIGNvbnN0IFtmbiwgbGluZSwgY29sXSA9IHJlcy5zbGljZSgxKVxuICAgIGNvbnN0IHJvb3REaXIgPSBhd2FpdCB0aGlzLnByb2Nlc3MuZ2V0Um9vdERpcihlZGl0b3IuZ2V0QnVmZmVyKCkpXG4gICAgaWYgKCFyb290RGlyKSB7IHJldHVybiB9XG4gICAgY29uc3QgdXJpID0gcm9vdERpci5nZXRGaWxlKGZuKS5nZXRQYXRoKCkgfHwgZm5cbiAgICBhdG9tLndvcmtzcGFjZS5vcGVuKHVyaSwge1xuICAgICAgICBpbml0aWFsTGluZTogcGFyc2VJbnQobGluZSwgMTApIC0gMSxcbiAgICAgICAgaW5pdGlhbENvbHVtbjogcGFyc2VJbnQoY29sLCAxMCkgLSAxXG4gICAgICB9XG4gICAgKVxuICB9XG5cbiAgQGhhbmRsZUV4Y2VwdGlvblxuICBwcml2YXRlIGFzeW5jIGluc2VydEltcG9ydENvbW1hbmQgKHtjdXJyZW50VGFyZ2V0LCBkZXRhaWx9OiBJRXZlbnREZXNjKSB7XG4gICAgY29uc3QgZWRpdG9yID0gY3VycmVudFRhcmdldC5nZXRNb2RlbCgpXG4gICAgY29uc3QgYnVmZmVyID0gZWRpdG9yLmdldEJ1ZmZlcigpXG4gICAgY29uc3QgZXZyID0gdGhpcy51cGkuZ2V0RXZlbnRSYW5nZShlZGl0b3IsIGRldGFpbClcbiAgICBpZiAoIWV2cikgeyByZXR1cm4gfVxuICAgIGNvbnN0IHtjcmFuZ2V9ID0gZXZyXG4gICAgY29uc3QgbGluZXMgPSBhd2FpdCB0aGlzLnByb2Nlc3MuZmluZFN5bWJvbFByb3ZpZGVyc0luQnVmZmVyKGVkaXRvciwgY3JhbmdlKVxuICAgIGNvbnN0IG1vZCA9IGF3YWl0IGltcG9ydExpc3RWaWV3KGxpbmVzKVxuICAgIGlmIChtb2QpIHtcbiAgICAgIGNvbnN0IHBpID0gYXdhaXQgbmV3IFByb21pc2U8e3BvczogQXRvbVR5cGVzLlBvaW50LCBpbmRlbnQ6IHN0cmluZywgZW5kOiBzdHJpbmd9PigocmVzb2x2ZSkgPT4ge1xuICAgICAgICBidWZmZXIuYmFja3dhcmRzU2NhbigvXihcXHMqKShpbXBvcnR8bW9kdWxlKS8sICh7IG1hdGNoLCByYW5nZSwgc3RvcCB9KSA9PiB7XG4gICAgICAgICAgbGV0IGluZGVudCA9ICcnXG4gICAgICAgICAgc3dpdGNoIChtYXRjaFsyXSkge1xuICAgICAgICAgICAgY2FzZSAnaW1wb3J0JzpcbiAgICAgICAgICAgICAgaW5kZW50ID0gYFxcbiR7bWF0Y2hbMV19YFxuICAgICAgICAgICAgICBicmVha1xuICAgICAgICAgICAgY2FzZSAnbW9kdWxlJzpcbiAgICAgICAgICAgICAgaW5kZW50ID0gYFxcblxcbiR7bWF0Y2hbMV19YFxuICAgICAgICAgICAgICBicmVha1xuICAgICAgICAgIH1cbiAgICAgICAgICByZXNvbHZlKHtwb3M6IGJ1ZmZlci5yYW5nZUZvclJvdyhyYW5nZS5zdGFydC5yb3cpLmVuZCwgaW5kZW50LCBlbmQ6ICcnfSlcbiAgICAgICAgfSlcbiAgICAgICAgLy8gbm90aGluZyBmb3VuZFxuICAgICAgICByZXNvbHZlKHtcbiAgICAgICAgICBwb3M6IGJ1ZmZlci5nZXRGaXJzdFBvc2l0aW9uKCksXG4gICAgICAgICAgaW5kZW50OiAnJyxcbiAgICAgICAgICBlbmQ6ICdcXG4nXG4gICAgICAgIH0pXG4gICAgICB9KVxuICAgICAgZWRpdG9yLnNldFRleHRJbkJ1ZmZlclJhbmdlKFtwaS5wb3MsIHBpLnBvc10sIGAke3BpLmluZGVudH1pbXBvcnQgJHttb2R9JHtwaS5lbmR9YClcbiAgICB9XG4gIH1cblxuICBwcml2YXRlIGFzeW5jIHR5cGVUb29sdGlwIChlOiBBdG9tVHlwZXMuVGV4dEVkaXRvciwgcDogQXRvbVR5cGVzLlJhbmdlKSB7XG4gICAgY29uc3Qge3JhbmdlLCB0eXBlfSA9IGF3YWl0IHRoaXMucHJvY2Vzcy5nZXRUeXBlSW5CdWZmZXIoZS5nZXRCdWZmZXIoKSwgcClcbiAgICByZXR1cm4ge1xuICAgICAgICByYW5nZSxcbiAgICAgICAgdGV4dDoge1xuICAgICAgICAgIHRleHQ6IHR5cGUsXG4gICAgICAgICAgaGlnaGxpZ2h0ZXI6XG4gICAgICAgICAgICBhdG9tLmNvbmZpZy5nZXQoJ2hhc2tlbGwtZ2hjLW1vZC5oaWdobGlnaHRUb29sdGlwcycpID9cbiAgICAgICAgICAgICAgJ2hpbnQudHlwZS5oYXNrZWxsJyA6IHVuZGVmaW5lZFxuICAgICAgICB9XG4gICAgICB9XG4gIH1cblxuICBwcml2YXRlIGFzeW5jIGluZm9Ub29sdGlwIChlOiBBdG9tVHlwZXMuVGV4dEVkaXRvciwgcDogQXRvbVR5cGVzLlJhbmdlKSB7XG4gICAgY29uc3Qge3JhbmdlLCBpbmZvfSA9IGF3YWl0IHRoaXMucHJvY2Vzcy5nZXRJbmZvSW5CdWZmZXIoZSwgcClcbiAgICByZXR1cm4ge1xuICAgICAgICByYW5nZSxcbiAgICAgICAgdGV4dDoge1xuICAgICAgICAgIHRleHQ6IGluZm8sXG4gICAgICAgICAgaGlnaGxpZ2h0ZXI6XG4gICAgICAgICAgICBhdG9tLmNvbmZpZy5nZXQoJ2hhc2tlbGwtZ2hjLW1vZC5oaWdobGlnaHRUb29sdGlwcycpID9cbiAgICAgICAgICAgICAgJ3NvdXJjZS5oYXNrZWxsJyA6IHVuZGVmaW5lZFxuICAgICAgICB9XG4gICAgICB9XG4gIH1cblxuICBwcml2YXRlIGFzeW5jIGluZm9UeXBlVG9vbHRpcCAoZTogQXRvbVR5cGVzLlRleHRFZGl0b3IsIHA6IEF0b21UeXBlcy5SYW5nZSkge1xuICAgIHRyeSB7XG4gICAgICByZXR1cm4gYXdhaXQgdGhpcy5pbmZvVG9vbHRpcChlLCBwKVxuICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgIHJldHVybiB0aGlzLnR5cGVUb29sdGlwKGUsIHApXG4gICAgfVxuICB9XG5cbiAgcHJpdmF0ZSBhc3luYyB0eXBlSW5mb1Rvb2x0aXAgKGU6IEF0b21UeXBlcy5UZXh0RWRpdG9yLCBwOiBBdG9tVHlwZXMuUmFuZ2UpIHtcbiAgICB0cnkge1xuICAgICAgcmV0dXJuIGF3YWl0IHRoaXMudHlwZVRvb2x0aXAoZSwgcClcbiAgICB9IGNhdGNoIChlKSB7XG4gICAgICByZXR1cm4gdGhpcy5pbmZvVG9vbHRpcChlLCBwKVxuICAgIH1cbiAgfVxuXG4gIHByaXZhdGUgYXN5bmMgdHlwZUFuZEluZm9Ub29sdGlwIChlOiBBdG9tVHlwZXMuVGV4dEVkaXRvciwgcDogQXRvbVR5cGVzLlJhbmdlKSB7XG4gICAgY29uc3QgdHlwZVAgPSB0aGlzLnR5cGVUb29sdGlwKGUsIHApLmNhdGNoKCgpID0+IHVuZGVmaW5lZClcbiAgICBjb25zdCBpbmZvUCA9IHRoaXMuaW5mb1Rvb2x0aXAoZSwgcCkuY2F0Y2goKCkgPT4gdW5kZWZpbmVkKVxuICAgIGNvbnN0IFt0eXBlLCBpbmZvXSA9IGF3YWl0IFByb21pc2UuYWxsKFt0eXBlUCwgaW5mb1BdKVxuICAgIGxldCByYW5nZSwgdGV4dDogc3RyaW5nXG4gICAgaWYgKHR5cGUgJiYgaW5mbykge1xuICAgICAgcmFuZ2UgPSB0eXBlLnJhbmdlLnVuaW9uKGluZm8ucmFuZ2UpXG4gICAgICB0ZXh0ID0gYDo6ICR7dHlwZS50ZXh0LnRleHR9XFxuJHtpbmZvLnRleHQudGV4dH1gXG4gICAgfSBlbHNlIGlmICh0eXBlKSB7XG4gICAgICByYW5nZSA9IHR5cGUucmFuZ2VcbiAgICAgIHRleHQgPSBgOjogJHt0eXBlLnRleHQudGV4dH1gXG4gICAgfSBlbHNlIGlmIChpbmZvKSB7XG4gICAgICByYW5nZSA9IGluZm8ucmFuZ2VcbiAgICAgIHRleHQgPSBpbmZvLnRleHQudGV4dFxuICAgIH0gZWxzZSB7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoJ0dvdCBuZWl0aGVyIHR5cGUgbm9yIGluZm8nKVxuICAgIH1cbiAgICBjb25zdCBoaWdobGlnaHRlciA9IGF0b20uY29uZmlnLmdldCgnaGFza2VsbC1naGMtbW9kLmhpZ2hsaWdodFRvb2x0aXBzJykgPyAnc291cmNlLmhhc2tlbGwnIDogdW5kZWZpbmVkXG4gICAgcmV0dXJuIHsgcmFuZ2UsIHRleHQ6IHsgdGV4dCwgaGlnaGxpZ2h0ZXIgfSB9XG4gIH1cblxuICBwcml2YXRlIHNldEhpZ2hsaWdodGVyICgpIHtcbiAgICBpZiAoYXRvbS5jb25maWcuZ2V0KCdoYXNrZWxsLWdoYy1tb2QuaGlnaGxpZ2h0TWVzc2FnZXMnKSkge1xuICAgICAgcmV0dXJuIChtOiBVUEkuSVJlc3VsdEl0ZW0pOiBVUEkuSVJlc3VsdEl0ZW0gPT4ge1xuICAgICAgICBpZiAodHlwZW9mIG0ubWVzc2FnZSA9PT0gJ3N0cmluZycpIHtcbiAgICAgICAgICBjb25zdCBtZXNzYWdlOiBVUEkuSU1lc3NhZ2VUZXh0ID0ge1xuICAgICAgICAgICAgdGV4dDogbS5tZXNzYWdlLFxuICAgICAgICAgICAgaGlnaGxpZ2h0ZXI6ICdoaW50Lm1lc3NhZ2UuaGFza2VsbCdcbiAgICAgICAgICB9XG4gICAgICAgICAgcmV0dXJuIHsuLi5tLCBtZXNzYWdlfVxuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIHJldHVybiBtXG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9IGVsc2Uge1xuICAgICAgcmV0dXJuIChtOiBVUEkuSVJlc3VsdEl0ZW0pID0+IG1cbiAgICB9XG4gIH1cblxuICBwcml2YXRlIHNldE1lc3NhZ2VzIChtZXNzYWdlczogVVBJLklSZXN1bHRJdGVtW10pIHtcbiAgICB0aGlzLmxhc3RNZXNzYWdlcyA9IG1lc3NhZ2VzLm1hcCh0aGlzLnNldEhpZ2hsaWdodGVyKCkpXG4gICAgdGhpcy5zZW5kTWVzc2FnZXMoKVxuICB9XG5cbiAgcHJpdmF0ZSBzZW5kTWVzc2FnZXMgKCkge1xuICAgIHRoaXMudXBpLnNldE1lc3NhZ2VzKHRoaXMucHJvY2Vzc01lc3NhZ2VzLmNvbmNhdCh0aGlzLmxhc3RNZXNzYWdlcykpXG4gIH1cblxuICBwcml2YXRlIGFzeW5jIGNoZWNrTGludCAoYnVmZmVyOiBBdG9tVHlwZXMuVGV4dEJ1ZmZlciwgb3B0OiAnU2F2ZScgfCAnQ2hhbmdlJywgZmFzdDogYm9vbGVhbiA9IGZhbHNlKSB7XG4gICAgbGV0IHJlc1xuICAgIGlmIChhdG9tLmNvbmZpZy5nZXQoYGhhc2tlbGwtZ2hjLW1vZC5vbiR7b3B0fUNoZWNrYCkgJiYgYXRvbS5jb25maWcuZ2V0KGBoYXNrZWxsLWdoYy1tb2Qub24ke29wdH1MaW50YCkpIHtcbiAgICAgIHJlcyA9IGF3YWl0IHRoaXMucHJvY2Vzcy5kb0NoZWNrQW5kTGludChidWZmZXIsIGZhc3QpXG4gICAgfSBlbHNlIGlmIChhdG9tLmNvbmZpZy5nZXQoYGhhc2tlbGwtZ2hjLW1vZC5vbiR7b3B0fUNoZWNrYCkpIHtcbiAgICAgIHJlcyA9IGF3YWl0IHRoaXMucHJvY2Vzcy5kb0NoZWNrQnVmZmVyKGJ1ZmZlciwgZmFzdClcbiAgICB9IGVsc2UgaWYgKGF0b20uY29uZmlnLmdldChgaGFza2VsbC1naGMtbW9kLm9uJHtvcHR9TGludGApKSB7XG4gICAgICByZXMgPSBhd2FpdCB0aGlzLnByb2Nlc3MuZG9MaW50QnVmZmVyKGJ1ZmZlciwgZmFzdClcbiAgICB9XG4gICAgaWYgKHJlcykge1xuICAgICAgdGhpcy5zZXRNZXNzYWdlcyhyZXMpXG4gICAgfVxuICB9XG5cbiAgcHJpdmF0ZSBjb25zb2xlUmVwb3J0IChhcmc6IElFcnJvckNhbGxiYWNrQXJncykge1xuICAgIFV0aWwuZXJyb3IoVXRpbC5mb3JtYXRFcnJvcihhcmcpLCBVdGlsLmdldEVycm9yRGV0YWlsKGFyZykpXG4gIH1cblxuICBwcml2YXRlIGhhbmRsZVByb2Nlc3NFcnJvciAoYXJnOiBJRXJyb3JDYWxsYmFja0FyZ3MpIHtcbiAgICBzd2l0Y2ggKHRoaXMubXNnQmFja2VuZCkge1xuICAgICAgY2FzZSBNc2dCYWNrZW5kLlVQSTpcbiAgICAgICAgdGhpcy5wcm9jZXNzTWVzc2FnZXMucHVzaCh7XG4gICAgICAgICAgbWVzc2FnZTogVXRpbC5mb3JtYXRFcnJvcihhcmcpXG4gICAgICAgICAgICArICdcXG5cXG5TZWUgY29uc29sZSAoVmlldyDihpIgRGV2ZWxvcGVyIOKGkiBUb2dnbGUgRGV2ZWxvcGVyIFRvb2xzIOKGkiBDb25zb2xlIHRhYikgZm9yIGRldGFpbHMuJyxcbiAgICAgICAgICBzZXZlcml0eTogJ2doYy1tb2QnXG4gICAgICAgIH0pXG4gICAgICAgIHRoaXMuY29uc29sZVJlcG9ydChhcmcpXG4gICAgICAgIHRoaXMuc2VuZE1lc3NhZ2VzKClcbiAgICAgICAgYnJlYWtcbiAgICAgIGNhc2UgTXNnQmFja2VuZC5Db25zb2xlOlxuICAgICAgICB0aGlzLmNvbnNvbGVSZXBvcnQoYXJnKVxuICAgICAgICBicmVha1xuICAgICAgY2FzZSBNc2dCYWNrZW5kLlBvcHVwOlxuICAgICAgICB0aGlzLmNvbnNvbGVSZXBvcnQoYXJnKVxuICAgICAgICBhdG9tLm5vdGlmaWNhdGlvbnMuYWRkRXJyb3IoVXRpbC5mb3JtYXRFcnJvcihhcmcpLCB7XG4gICAgICAgICAgZGV0YWlsOiBVdGlsLmdldEVycm9yRGV0YWlsKGFyZyksXG4gICAgICAgICAgZGlzbWlzc2FibGU6IHRydWVcbiAgICAgICAgfSlcbiAgICAgICAgYnJlYWtcbiAgICB9XG4gIH1cblxuICBwcml2YXRlIGhhbmRsZVByb2Nlc3NXYXJuaW5nICh3YXJuaW5nOiBzdHJpbmcpIHtcbiAgICBzd2l0Y2ggKHRoaXMubXNnQmFja2VuZCkge1xuICAgICAgY2FzZSBNc2dCYWNrZW5kLlVQSTpcbiAgICAgICAgdGhpcy5wcm9jZXNzTWVzc2FnZXMucHVzaCh7XG4gICAgICAgICAgbWVzc2FnZTogd2FybmluZyxcbiAgICAgICAgICBzZXZlcml0eTogJ2doYy1tb2QnXG4gICAgICAgIH0pXG4gICAgICAgIFV0aWwud2Fybih3YXJuaW5nKVxuICAgICAgICB0aGlzLnNlbmRNZXNzYWdlcygpXG4gICAgICAgIGJyZWFrXG4gICAgICBjYXNlIE1zZ0JhY2tlbmQuQ29uc29sZTpcbiAgICAgICAgVXRpbC53YXJuKHdhcm5pbmcpXG4gICAgICAgIGJyZWFrXG4gICAgICBjYXNlIE1zZ0JhY2tlbmQuUG9wdXA6XG4gICAgICAgIFV0aWwud2Fybih3YXJuaW5nKVxuICAgICAgICBhdG9tLm5vdGlmaWNhdGlvbnMuYWRkV2FybmluZyh3YXJuaW5nLCB7XG4gICAgICAgICAgZGlzbWlzc2FibGU6IGZhbHNlXG4gICAgICAgIH0pXG4gICAgICAgIGJyZWFrXG4gICAgfVxuICB9XG59XG4iXX0=