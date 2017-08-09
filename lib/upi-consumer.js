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
const import_list_view_1 = require("./views/import-list-view");
const Util = require("./util");
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
            'haskell-ghc-mod:insert-import': this.insertImportCommand.bind(this)
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
exports.UPIConsumer = UPIConsumer;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidXBpLWNvbnN1bWVyLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vc3JjL3VwaS1jb25zdW1lci50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOzs7Ozs7Ozs7O0FBQUEsK0JBQWlEO0FBRWpELCtEQUF1RDtBQUN2RCwrQkFBK0I7QUFFL0IsTUFBTSxZQUFZLEdBQUc7SUFDbkIsS0FBSyxFQUFFLEVBQUU7SUFDVCxPQUFPLEVBQUUsRUFBRTtJQUNYLElBQUksRUFBRSxFQUFFO0NBQ1QsQ0FBQTtBQUVELE1BQU0sV0FBVyxHQUFHO0lBQ2xCLFNBQVMsRUFBRTtRQUNULFNBQVMsRUFBRSxLQUFLO1FBQ2hCLFVBQVUsRUFBRSxJQUFJO0tBQ2pCO0NBQ0YsQ0FBQTtBQUVELE1BQU0sWUFBWSxHQUFHLDJDQUEyQyxDQUFBO0FBRWhFLE1BQU0sUUFBUSxHQUFHO0lBQ2YsS0FBSyxFQUFFLFNBQVM7SUFDaEIsSUFBSSxFQUFFO1FBQ0osRUFBQyxLQUFLLEVBQUUsT0FBTyxFQUFFLE9BQU8sRUFBRSw0QkFBNEIsRUFBQztRQUN2RCxFQUFDLEtBQUssRUFBRSxNQUFNLEVBQUUsT0FBTyxFQUFFLDJCQUEyQixFQUFDO1FBQ3JELEVBQUMsS0FBSyxFQUFFLGNBQWMsRUFBRSxPQUFPLEVBQUUsa0NBQWtDLEVBQUM7S0FDckU7Q0FDRixDQUFBO0FBRUQsSUFBVyxVQUlWO0FBSkQsV0FBVyxVQUFVO0lBQ25CLGlDQUFtQixDQUFBO0lBQ25CLHlCQUFXLENBQUE7SUFDWCw2QkFBZSxDQUFBO0FBQ2pCLENBQUMsRUFKVSxVQUFVLEtBQVYsVUFBVSxRQUlwQjtBQUVEO0lBMkNFLFlBQWEsUUFBOEIsRUFBVSxPQUF1QjtRQUF2QixZQUFPLEdBQVAsT0FBTyxDQUFnQjtRQXpDcEUsZ0JBQVcsR0FBd0IsSUFBSSwwQkFBbUIsRUFBRSxDQUFBO1FBQzVELG9CQUFlLEdBQXNCLEVBQUUsQ0FBQTtRQUN2QyxpQkFBWSxHQUFzQixFQUFFLENBQUE7UUFDcEMsZUFBVSxHQUFl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O0lBRU8sb0JBQW9CLENBQUUsT0FBZTtRQUMzQyxNQUFNLENBQUMsQ0FBQyxJQUFJLENBQUMsVUFBVSxDQUFDLENBQUMsQ0FBQztZQUN4QjtnQkFDRSxJQUFJLENBQUMsZUFBZSxDQUFDLElBQUksQ0FBQztvQkFDeEIsT0FBTyxFQUFFLE9BQU87b0JBQ2hCLFFBQVEsRUFBRSxTQUFTO2lCQUNwQixDQUFDLENBQUE7Z0JBQ0YsSUFBSSxDQUFDLElBQUksQ0FBQyxPQUFPLENBQUMsQ0FBQTtnQkFDbEIsSUFBSSxDQUFDLFlBQVksRUFBRSxDQUFBO2dCQUNuQixLQUFLLENBQUE7WUFDUDtnQkFDRSxJQUFJLENBQUMsSUFBSSxDQUFDLE9BQU8sQ0FBQyxDQUFBO2dCQUNsQixLQUFLLENBQUE7WUFDUDtnQkFDRSxJQUFJLENBQUMsSUFBSSxDQUFDLE9BQU8sQ0FBQyxDQUFBO2dCQUNsQixJQUFJLENBQUMsYUFBYSxDQUFDLFVBQVUsQ0FBQyxPQUFPLEVBQUU7b0JBQ3JDLFdBQVcsRUFBRSxLQUFLO2lCQUNuQixDQUFDLENBQUE7Z0JBQ0YsS0FBSyxDQUFBO1FBQ1QsQ0FBQztJQUNILENBQUM7Q0FDRjtBQXRZRCxrQ0FzWUMiLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgeyBDb21wb3NpdGVEaXNwb3NhYmxlLCBSYW5nZSB9IGZyb20gJ2F0b20nXG5pbXBvcnQge0doY01vZGlQcm9jZXNzLCBJRXJyb3JDYWxsYmFja0FyZ3N9IGZyb20gJy4vZ2hjLW1vZCdcbmltcG9ydCB7aW1wb3J0TGlzdFZpZXd9IGZyb20gJy4vdmlld3MvaW1wb3J0LWxpc3QtdmlldydcbmltcG9ydCBVdGlsID0gcmVxdWlyZSgnLi91dGlsJylcblxuY29uc3QgbWVzc2FnZVR5cGVzID0ge1xuICBlcnJvcjoge30sXG4gIHdhcm5pbmc6IHt9LFxuICBsaW50OiB7fVxufVxuXG5jb25zdCBhZGRNc2dUeXBlcyA9IHtcbiAgJ2doYy1tb2QnOiB7XG4gICAgdXJpRmlsdGVyOiBmYWxzZSxcbiAgICBhdXRvU2Nyb2xsOiB0cnVlXG4gIH1cbn1cblxuY29uc3QgY29udGV4dFNjb3BlID0gJ2F0b20tdGV4dC1lZGl0b3JbZGF0YS1ncmFtbWFyfj1cImhhc2tlbGxcIl0nXG5cbmNvbnN0IG1haW5NZW51ID0ge1xuICBsYWJlbDogJ2doYy1tb2QnLFxuICBtZW51OiBbXG4gICAge2xhYmVsOiAnQ2hlY2snLCBjb21tYW5kOiAnaGFza2VsbC1naGMtbW9kOmNoZWNrLWZpbGUnfSxcbiAgICB7bGFiZWw6ICdMaW50JywgY29tbWFuZDogJ2hhc2tlbGwtZ2hjLW1vZDpsaW50LWZpbGUnfSxcbiAgICB7bGFiZWw6ICdTdG9wIEJhY2tlbmQnLCBjb21tYW5kOiAnaGFza2VsbC1naGMtbW9kOnNodXRkb3duLWJhY2tlbmQnfVxuICBdXG59XG5cbmNvbnN0IGVudW0gTXNnQmFja2VuZCB7XG4gIENvbnNvbGUgPSAnY29uc29sZScsXG4gIFVQSSA9ICd1cGknLFxuICBQb3B1cCA9ICdwb3B1cCcsXG59XG5cbmV4cG9ydCBjbGFzcyBVUElDb25zdW1lciB7XG4gIHByaXZhdGUgdXBpOiBVUEkuSVVQSUluc3RhbmNlXG4gIHByaXZhdGUgZGlzcG9zYWJsZXM6IENvbXBvc2l0ZURpc3Bvc2FibGUgPSBuZXcgQ29tcG9zaXRlRGlzcG9zYWJsZSgpXG4gIHByaXZhdGUgcHJvY2Vzc01lc3NhZ2VzOiBVUEkuSVJlc3VsdEl0ZW1bXSA9IFtdXG4gIHByaXZhdGUgbGFzdE1lc3NhZ2VzOiBVUEkuSVJlc3VsdEl0ZW1bXSA9IFtdXG4gIHByaXZhdGUgbXNnQmFja2VuZDogTXNnQmFja2VuZCA9IGF0b20uY29uZmlnLmdldCgnaGFza2VsbC1naGMtbW9kLmdoY01vZE1lc3NhZ2VzJylcblxuICBwcml2YXRlIGNvbnRleHRDb21tYW5kcyA9IHtcbiAgICAnaGFza2VsbC1naGMtbW9kOnNob3ctdHlwZSc6IHRoaXMudG9vbHRpcENvbW1hbmQodGhpcy50eXBlVG9vbHRpcC5iaW5kKHRoaXMpKSxcbiAgICAnaGFza2VsbC1naGMtbW9kOnNob3ctaW5mbyc6IHRoaXMudG9vbHRpcENvbW1hbmQodGhpcy5pbmZvVG9vbHRpcC5iaW5kKHRoaXMpKSxcbiAgICAnaGFza2VsbC1naGMtbW9kOmNhc2Utc3BsaXQnOiB0aGlzLmNhc2VTcGxpdENvbW1hbmQuYmluZCh0aGlzKSxcbiAgICAnaGFza2VsbC1naGMtbW9kOnNpZy1maWxsJzogdGhpcy5zaWdGaWxsQ29tbWFuZC5iaW5kKHRoaXMpLFxuICAgICdoYXNrZWxsLWdoYy1tb2Q6Z28tdG8tZGVjbGFyYXRpb24nOiB0aGlzLmdvVG9EZWNsQ29tbWFuZC5iaW5kKHRoaXMpLFxuICAgICdoYXNrZWxsLWdoYy1tb2Q6c2hvdy1pbmZvLWZhbGxiYWNrLXRvLXR5cGUnOiB0aGlzLnRvb2x0aXBDb21tYW5kKHRoaXMuaW5mb1R5cGVUb29sdGlwLmJpbmQodGhpcykpLFxuICAgICdoYXNrZWxsLWdoYy1tb2Q6c2hvdy10eXBlLWZhbGxiYWNrLXRvLWluZm8nOiB0aGlzLnRvb2x0aXBDb21tYW5kKHRoaXMudHlwZUluZm9Ub29sdGlwLmJpbmQodGhpcykpLFxuICAgICdoYXNrZWxsLWdoYy1tb2Q6c2hvdy10eXBlLWFuZC1pbmZvJzogdGhpcy50b29sdGlwQ29tbWFuZCh0aGlzLnR5cGVBbmRJbmZvVG9vbHRpcC5iaW5kKHRoaXMpKSxcbiAgICAnaGFza2VsbC1naGMtbW9kOmluc2VydC10eXBlJzogdGhpcy5pbnNlcnRUeXBlQ29tbWFuZC5iaW5kKHRoaXMpLFxuICAgICdoYXNrZWxsLWdoYy1tb2Q6aW5zZXJ0LWltcG9ydCc6IHRoaXMuaW5zZXJ0SW1wb3J0Q29tbWFuZC5iaW5kKHRoaXMpXG4gIH1cblxuICBwcml2YXRlIGdsb2JhbENvbW1hbmRzID0ge1xuICAgICdoYXNrZWxsLWdoYy1tb2Q6Y2hlY2stZmlsZSc6IHRoaXMuY2hlY2tDb21tYW5kLmJpbmQodGhpcyksXG4gICAgJ2hhc2tlbGwtZ2hjLW1vZDpsaW50LWZpbGUnOiB0aGlzLmxpbnRDb21tYW5kLmJpbmQodGhpcyksXG4gICAgLi4udGhpcy5jb250ZXh0Q29tbWFuZHNcbiAgfVxuXG4gIHByaXZhdGUgY29udGV4dE1lbnU6IHtcbiAgICBsYWJlbDogc3RyaW5nLCBzdWJtZW51OiBBcnJheTx7bGFiZWw6IHN0cmluZywgY29tbWFuZDoga2V5b2YgVVBJQ29uc3VtZXJbJ2NvbnRleHRDb21tYW5kcyddfT5cbiAgfSA9IHtcbiAgICBsYWJlbDogJ2doYy1tb2QnLFxuICAgIHN1Ym1lbnU6XG4gICAgICBbXG4gICAgICAgIHtsYWJlbDogJ1Nob3cgVHlwZScsIGNvbW1hbmQ6ICdoYXNrZWxsLWdoYy1tb2Q6c2hvdy10eXBlJ30sXG4gICAgICAgIHtsYWJlbDogJ1Nob3cgSW5mbycsIGNvbW1hbmQ6ICdoYXNrZWxsLWdoYy1tb2Q6c2hvdy1pbmZvJ30sXG4gICAgICAgIHtsYWJlbDogJ1Nob3cgVHlwZSBBbmQgSW5mbycsIGNvbW1hbmQ6ICdoYXNrZWxsLWdoYy1tb2Q6c2hvdy10eXBlLWFuZC1pbmZvJ30sXG4gICAgICAgIHtsYWJlbDogJ0Nhc2UgU3BsaXQnLCBjb21tYW5kOiAnaGFza2VsbC1naGMtbW9kOmNhc2Utc3BsaXQnfSxcbiAgICAgICAge2xhYmVsOiAnU2lnIEZpbGwnLCBjb21tYW5kOiAnaGFza2VsbC1naGMtbW9kOnNpZy1maWxsJ30sXG4gICAgICAgIHtsYWJlbDogJ0luc2VydCBUeXBlJywgY29tbWFuZDogJ2hhc2tlbGwtZ2hjLW1vZDppbnNlcnQtdHlwZSd9LFxuICAgICAgICB7bGFiZWw6ICdJbnNlcnQgSW1wb3J0JywgY29tbWFuZDogJ2hhc2tlbGwtZ2hjLW1vZDppbnNlcnQtaW1wb3J0J30sXG4gICAgICAgIHtsYWJlbDogJ0dvIFRvIERlY2xhcmF0aW9uJywgY29tbWFuZDogJ2hhc2tlbGwtZ2hjLW1vZDpnby10by1kZWNsYXJhdGlvbid9XG4gICAgICBdXG4gIH1cblxuICBjb25zdHJ1Y3RvciAocmVnaXN0ZXI6IFVQSS5JVVBJUmVnaXN0cmF0aW9uLCBwcml2YXRlIHByb2Nlc3M6IEdoY01vZGlQcm9jZXNzKSB7XG4gICAgdGhpcy5kaXNwb3NhYmxlcy5hZGQoXG4gICAgICB0aGlzLnByb2Nlc3Mub25FcnJvcih0aGlzLmhhbmRsZVByb2Nlc3NFcnJvci5iaW5kKHRoaXMpKSxcbiAgICAgIHRoaXMucHJvY2Vzcy5vbldhcm5pbmcodGhpcy5oYW5kbGVQcm9jZXNzV2FybmluZy5iaW5kKHRoaXMpKSxcbiAgICApXG5cbiAgICBjb25zdCBtc2dUeXBlcyA9XG4gICAgICB0aGlzLm1zZ0JhY2tlbmQgPT09IE1zZ0JhY2tlbmQuVVBJXG4gICAgICA/IHsgLi4ubWVzc2FnZVR5cGVzLCAuLi5hZGRNc2dUeXBlcyB9XG4gICAgICA6IG1lc3NhZ2VUeXBlc1xuXG4gICAgdGhpcy51cGkgPSByZWdpc3Rlcih7XG4gICAgICBuYW1lOiAnaGFza2VsbC1naGMtbW9kJyxcbiAgICAgIG1lbnU6IG1haW5NZW51LFxuICAgICAgbWVzc2FnZVR5cGVzOiBtc2dUeXBlcyxcbiAgICAgIHRvb2x0aXA6IHRoaXMuc2hvdWxkU2hvd1Rvb2x0aXAuYmluZCh0aGlzKSxcbiAgICAgIGV2ZW50czoge1xuICAgICAgICBvbkRpZFNhdmVCdWZmZXI6IGFzeW5jIChidWZmZXIpID0+XG4gICAgICAgICAgdGhpcy5jaGVja0xpbnQoYnVmZmVyLCAnU2F2ZScpLFxuICAgICAgICBvbkRpZFN0b3BDaGFuZ2luZzogYXN5bmMgKGJ1ZmZlcikgPT5cbiAgICAgICAgICB0aGlzLmNoZWNrTGludChidWZmZXIsICdDaGFuZ2UnLCB0cnVlKVxuICAgICAgfVxuICAgIH0pXG5cbiAgICB0aGlzLmRpc3Bvc2FibGVzLmFkZChcbiAgICAgIHRoaXMudXBpLFxuICAgICAgdGhpcy5wcm9jZXNzLm9uQmFja2VuZEFjdGl2ZSgoKSA9PiB0aGlzLnVwaS5zZXRTdGF0dXMoe3N0YXR1czogJ3Byb2dyZXNzJywgZGV0YWlsOiAnJ30pKSxcbiAgICAgIHRoaXMucHJvY2Vzcy5vbkJhY2tlbmRJZGxlKCgpID0+IHRoaXMudXBpLnNldFN0YXR1cyh7c3RhdHVzOiAncmVhZHknLCBkZXRhaWw6ICcnfSkpLFxuICAgICAgYXRvbS5jb21tYW5kcy5hZGQoY29udGV4dFNjb3BlLCB0aGlzLmdsb2JhbENvbW1hbmRzKSxcbiAgICApXG4gICAgY29uc3QgY20gPSB7fVxuICAgIGNtW2NvbnRleHRTY29wZV0gPSBbdGhpcy5jb250ZXh0TWVudV1cbiAgICB0aGlzLmRpc3Bvc2FibGVzLmFkZChhdG9tLmNvbnRleHRNZW51LmFkZChjbSkpXG4gIH1cblxuICBwdWJsaWMgZGlzcG9zZSAoKSB7XG4gICAgdGhpcy5kaXNwb3NhYmxlcy5kaXNwb3NlKClcbiAgfVxuXG4gIHByaXZhdGUgYXN5bmMgc2hvdWxkU2hvd1Rvb2x0aXAgKFxuICAgIGVkaXRvcjogQXRvbVR5cGVzLlRleHRFZGl0b3IsIGNyYW5nZTogQXRvbVR5cGVzLlJhbmdlLCB0eXBlOiBVUEkuVEV2ZW50UmFuZ2VUeXBlXG4gICk6IFByb21pc2U8VVBJLklUb29sdGlwRGF0YSB8IHVuZGVmaW5lZD4ge1xuICAgICAgaWYgKHR5cGUgPT09ICdtb3VzZScpIHtcbiAgICAgICAgY29uc3QgdCA9IGF0b20uY29uZmlnLmdldCgnaGFza2VsbC1naGMtbW9kLm9uTW91c2VIb3ZlclNob3cnKVxuICAgICAgICBpZiAodCkge1xuICAgICAgICAgIHJldHVybiB0aGlzW2Ake3R9VG9vbHRpcGBdKGVkaXRvciwgY3JhbmdlKVxuICAgICAgICB9XG4gICAgICB9IGVsc2UgaWYgKHR5cGUgPT09ICdzZWxlY3Rpb24nKSB7XG4gICAgICAgIGNvbnN0IHQgPSBhdG9tLmNvbmZpZy5nZXQoJ2hhc2tlbGwtZ2hjLW1vZC5vblNlbGVjdGlvblNob3cnKVxuICAgICAgICBpZiAodCkge1xuICAgICAgICAgIHJldHVybiB0aGlzW2Ake3R9VG9vbHRpcGBdKGVkaXRvciwgY3JhbmdlKVxuICAgICAgICB9XG4gICAgICB9XG4gIH1cblxuICBwcml2YXRlIGFzeW5jIGNoZWNrQ29tbWFuZCAoe2N1cnJlbnRUYXJnZXR9OiBJRXZlbnREZXNjKSB7XG4gICAgY29uc3QgZWRpdG9yID0gY3VycmVudFRhcmdldC5nZXRNb2RlbCgpXG4gICAgY29uc3QgcmVzID0gYXdhaXQgdGhpcy5wcm9jZXNzLmRvQ2hlY2tCdWZmZXIoZWRpdG9yLmdldEJ1ZmZlcigpKVxuICAgIHRoaXMuc2V0TWVzc2FnZXMocmVzKVxuICB9XG5cbiAgcHJpdmF0ZSBhc3luYyBsaW50Q29tbWFuZCAoe2N1cnJlbnRUYXJnZXR9OiBJRXZlbnREZXNjKSB7XG4gICAgY29uc3QgZWRpdG9yID0gY3VycmVudFRhcmdldC5nZXRNb2RlbCgpXG4gICAgY29uc3QgcmVzID0gYXdhaXQgdGhpcy5wcm9jZXNzLmRvTGludEJ1ZmZlcihlZGl0b3IuZ2V0QnVmZmVyKCkpXG4gICAgdGhpcy5zZXRNZXNzYWdlcyhyZXMpXG4gIH1cblxuICBwcml2YXRlIHRvb2x0aXBDb21tYW5kICh0b29sdGlwZnVuOiAoZTogQXRvbVR5cGVzLlRleHRFZGl0b3IsIHA6IEF0b21UeXBlcy5SYW5nZSkgPT4gUHJvbWlzZTxVUEkuSVRvb2x0aXBEYXRhPikge1xuICAgIHJldHVybiAoe2N1cnJlbnRUYXJnZXQsIGRldGFpbH06IElFdmVudERlc2MpID0+XG4gICAgICB0aGlzLnVwaS5zaG93VG9vbHRpcCh7XG4gICAgICAgIGVkaXRvcjogY3VycmVudFRhcmdldC5nZXRNb2RlbCgpLFxuICAgICAgICBkZXRhaWwsXG4gICAgICAgIGFzeW5jIHRvb2x0aXAgKGNyYW5nZSkge1xuICAgICAgICAgIHJldHVybiB0b29sdGlwZnVuKGN1cnJlbnRUYXJnZXQuZ2V0TW9kZWwoKSwgY3JhbmdlKVxuICAgICAgICB9XG4gICAgICB9KVxuICB9XG5cbiAgcHJpdmF0ZSBhc3luYyBpbnNlcnRUeXBlQ29tbWFuZCAoe2N1cnJlbnRUYXJnZXQsIGRldGFpbH06IElFdmVudERlc2MpIHtcbiAgICBjb25zdCBlZGl0b3IgPSBjdXJyZW50VGFyZ2V0LmdldE1vZGVsKClcbiAgICBjb25zdCBlciA9IHRoaXMudXBpLmdldEV2ZW50UmFuZ2UoZWRpdG9yLCBkZXRhaWwpXG4gICAgaWYgKGVyID09PSB1bmRlZmluZWQpIHsgcmV0dXJuIH1cbiAgICBjb25zdCB7Y3JhbmdlLCBwb3N9ID0gZXJcbiAgICBjb25zdCB7dHlwZX0gPSBhd2FpdCB0aGlzLnByb2Nlc3MuZ2V0VHlwZUluQnVmZmVyKGVkaXRvci5nZXRCdWZmZXIoKSwgY3JhbmdlKVxuICAgIGNvbnN0IHN5bUluZm8gPSBVdGlsLmdldFN5bWJvbEF0UG9pbnQoZWRpdG9yLCBwb3MpXG4gICAgaWYgKCFzeW1JbmZvKSB7IHJldHVybiB9XG4gICAgY29uc3Qge3Njb3BlLCByYW5nZSwgc3ltYm9sfSA9IHN5bUluZm9cbiAgICBpZiAoc2NvcGUuc3RhcnRzV2l0aCgna2V5d29yZC5vcGVyYXRvci4nKSkgeyByZXR1cm4gfSAvLyBjYW4ndCBjb3JyZWN0bHkgaGFuZGxlIGluZml4IG5vdGF0aW9uXG4gICAgaWYgKGVkaXRvci5nZXRUZXh0SW5CdWZmZXJSYW5nZShbcmFuZ2UuZW5kLCBlZGl0b3IuYnVmZmVyUmFuZ2VGb3JCdWZmZXJSb3cocmFuZ2UuZW5kLnJvdykuZW5kXSkubWF0Y2goLz0vKSkge1xuICAgICAgbGV0IGluZGVudCA9IGVkaXRvci5nZXRUZXh0SW5CdWZmZXJSYW5nZShbW3JhbmdlLnN0YXJ0LnJvdywgMF0sIHJhbmdlLnN0YXJ0XSlcbiAgICAgIGxldCBiaXJkVHJhY2sgPSAnJ1xuICAgICAgaWYgKGVkaXRvci5zY29wZURlc2NyaXB0b3JGb3JCdWZmZXJQb3NpdGlvbihwb3MpLmdldFNjb3Blc0FycmF5KCkuaW5jbHVkZXMoJ21ldGEuZW1iZWRkZWQuaGFza2VsbCcpKSB7XG4gICAgICAgIGJpcmRUcmFjayA9IGluZGVudC5zbGljZSgwLCAyKVxuICAgICAgICBpbmRlbnQgPSBpbmRlbnQuc2xpY2UoMilcbiAgICAgIH1cbiAgICAgIGlmIChpbmRlbnQubWF0Y2goL1xcUy8pKSB7XG4gICAgICAgIGluZGVudCA9IGluZGVudC5yZXBsYWNlKC9cXFMvZywgJyAnKVxuICAgICAgfVxuICAgICAgZWRpdG9yLnNldFRleHRJbkJ1ZmZlclJhbmdlKFxuICAgICAgICBbcmFuZ2Uuc3RhcnQsIHJhbmdlLnN0YXJ0XSwgYCR7c3ltYm9sfSA6OiAke3R5cGV9XFxuJHtiaXJkVHJhY2t9JHtpbmRlbnR9YFxuICAgICAgKVxuICAgIH0gZWxzZSB7XG4gICAgICBlZGl0b3Iuc2V0VGV4dEluQnVmZmVyUmFuZ2UocmFuZ2UsIGAoJHtlZGl0b3IuZ2V0VGV4dEluQnVmZmVyUmFuZ2UocmFuZ2UpfSA6OiAke3R5cGV9KWApXG4gICAgfVxuICB9XG5cbiAgcHJpdmF0ZSBhc3luYyBjYXNlU3BsaXRDb21tYW5kICh7Y3VycmVudFRhcmdldCwgZGV0YWlsfTogSUV2ZW50RGVzYykge1xuICAgIGNvbnN0IGVkaXRvciA9IGN1cnJlbnRUYXJnZXQuZ2V0TW9kZWwoKVxuICAgIGNvbnN0IGV2ciA9IHRoaXMudXBpLmdldEV2ZW50UmFuZ2UoZWRpdG9yLCBkZXRhaWwpXG4gICAgaWYgKCFldnIpIHsgcmV0dXJuIH1cbiAgICBjb25zdCB7Y3JhbmdlfSA9IGV2clxuICAgIGNvbnN0IHJlcyA9IGF3YWl0IHRoaXMucHJvY2Vzcy5kb0Nhc2VTcGxpdChlZGl0b3IuZ2V0QnVmZmVyKCksIGNyYW5nZSlcbiAgICBmb3IgKGNvbnN0IHtyYW5nZSwgcmVwbGFjZW1lbnR9IG9mIHJlcykge1xuICAgICAgZWRpdG9yLnNldFRleHRJbkJ1ZmZlclJhbmdlKHJhbmdlLCByZXBsYWNlbWVudClcbiAgICB9XG4gIH1cblxuICBwcml2YXRlIGFzeW5jIHNpZ0ZpbGxDb21tYW5kICh7Y3VycmVudFRhcmdldCwgZGV0YWlsfTogSUV2ZW50RGVzYykge1xuICAgIGNvbnN0IGVkaXRvciA9IGN1cnJlbnRUYXJnZXQuZ2V0TW9kZWwoKVxuICAgIGNvbnN0IGV2ciA9IHRoaXMudXBpLmdldEV2ZW50UmFuZ2UoZWRpdG9yLCBkZXRhaWwpXG4gICAgaWYgKCFldnIpIHsgcmV0dXJuIH1cbiAgICBjb25zdCB7Y3JhbmdlfSA9IGV2clxuICAgIGNvbnN0IHJlcyA9IGF3YWl0IHRoaXMucHJvY2Vzcy5kb1NpZ0ZpbGwoZWRpdG9yLmdldEJ1ZmZlcigpLCBjcmFuZ2UpXG5cbiAgICBlZGl0b3IudHJhbnNhY3QoKCkgPT4ge1xuICAgICAgY29uc3QgeyB0eXBlLCByYW5nZSwgYm9keSB9ID0gcmVzXG4gICAgICBjb25zdCBzaWcgPSBlZGl0b3IuZ2V0VGV4dEluQnVmZmVyUmFuZ2UocmFuZ2UpXG4gICAgICBsZXQgaW5kZW50ID0gZWRpdG9yLmluZGVudExldmVsRm9yTGluZShzaWcpXG4gICAgICBjb25zdCBwb3MgPSByYW5nZS5lbmRcbiAgICAgIGNvbnN0IHRleHQgPSBgXFxuJHtib2R5fWBcbiAgICAgIGlmICh0eXBlID09PSAnaW5zdGFuY2UnKSB7XG4gICAgICAgIGluZGVudCArPSAxXG4gICAgICAgIGlmICghc2lnLmVuZHNXaXRoKCcgd2hlcmUnKSkge1xuICAgICAgICAgIGVkaXRvci5zZXRUZXh0SW5CdWZmZXJSYW5nZShbcmFuZ2UuZW5kLCByYW5nZS5lbmRdLCAnIHdoZXJlJylcbiAgICAgICAgfVxuICAgICAgfVxuICAgICAgY29uc3QgbmV3cmFuZ2UgPSBlZGl0b3Iuc2V0VGV4dEluQnVmZmVyUmFuZ2UoW3BvcywgcG9zXSwgdGV4dClcbiAgICAgIG5ld3JhbmdlLmdldFJvd3MoKS5zbGljZSgxKS5tYXAoKHJvdykgPT5cbiAgICAgICAgZWRpdG9yLnNldEluZGVudGF0aW9uRm9yQnVmZmVyUm93KHJvdywgaW5kZW50KSlcbiAgICB9KVxuICB9XG5cbiAgcHJpdmF0ZSBhc3luYyBnb1RvRGVjbENvbW1hbmQgKHtjdXJyZW50VGFyZ2V0LCBkZXRhaWx9OiBJRXZlbnREZXNjKSB7XG4gICAgY29uc3QgZWRpdG9yID0gY3VycmVudFRhcmdldC5nZXRNb2RlbCgpXG4gICAgY29uc3QgZXZyID0gdGhpcy51cGkuZ2V0RXZlbnRSYW5nZShlZGl0b3IsIGRldGFpbClcbiAgICBpZiAoIWV2cikgeyByZXR1cm4gfVxuICAgIGNvbnN0IHtjcmFuZ2V9ID0gZXZyXG4gICAgY29uc3Qge2luZm99ID0gYXdhaXQgdGhpcy5wcm9jZXNzLmdldEluZm9JbkJ1ZmZlcihlZGl0b3IsIGNyYW5nZSlcbiAgICBjb25zdCByZXMgPSAvLiotLSBEZWZpbmVkIGF0ICguKyk6KFxcZCspOihcXGQrKS8uZXhlYyhpbmZvKVxuICAgIGlmICghcmVzKSB7IHJldHVybiB9XG4gICAgY29uc3QgW2ZuLCBsaW5lLCBjb2xdID0gcmVzLnNsaWNlKDEpXG4gICAgY29uc3Qgcm9vdERpciA9IGF3YWl0IHRoaXMucHJvY2Vzcy5nZXRSb290RGlyKGVkaXRvci5nZXRCdWZmZXIoKSlcbiAgICBpZiAoIXJvb3REaXIpIHsgcmV0dXJuIH1cbiAgICBjb25zdCB1cmkgPSByb290RGlyLmdldEZpbGUoZm4pLmdldFBhdGgoKSB8fCBmblxuICAgIGF0b20ud29ya3NwYWNlLm9wZW4odXJpLCB7XG4gICAgICAgIGluaXRpYWxMaW5lOiBwYXJzZUludChsaW5lLCAxMCkgLSAxLFxuICAgICAgICBpbml0aWFsQ29sdW1uOiBwYXJzZUludChjb2wsIDEwKSAtIDFcbiAgICAgIH1cbiAgICApXG4gIH1cblxuICBwcml2YXRlIGFzeW5jIGluc2VydEltcG9ydENvbW1hbmQgKHtjdXJyZW50VGFyZ2V0LCBkZXRhaWx9OiBJRXZlbnREZXNjKSB7XG4gICAgY29uc3QgZWRpdG9yID0gY3VycmVudFRhcmdldC5nZXRNb2RlbCgpXG4gICAgY29uc3QgYnVmZmVyID0gZWRpdG9yLmdldEJ1ZmZlcigpXG4gICAgY29uc3QgZXZyID0gdGhpcy51cGkuZ2V0RXZlbnRSYW5nZShlZGl0b3IsIGRldGFpbClcbiAgICBpZiAoIWV2cikgeyByZXR1cm4gfVxuICAgIGNvbnN0IHtjcmFuZ2V9ID0gZXZyXG4gICAgY29uc3QgbGluZXMgPSBhd2FpdCB0aGlzLnByb2Nlc3MuZmluZFN5bWJvbFByb3ZpZGVyc0luQnVmZmVyKGVkaXRvciwgY3JhbmdlKVxuICAgIGNvbnN0IG1vZCA9IGF3YWl0IGltcG9ydExpc3RWaWV3KGxpbmVzKVxuICAgIGlmIChtb2QpIHtcbiAgICAgIGNvbnN0IHBpID0gYXdhaXQgbmV3IFByb21pc2U8e3BvczogQXRvbVR5cGVzLlBvaW50LCBpbmRlbnQ6IHN0cmluZywgZW5kOiBzdHJpbmd9PigocmVzb2x2ZSkgPT4ge1xuICAgICAgICBidWZmZXIuYmFja3dhcmRzU2NhbigvXihcXHMqKShpbXBvcnR8bW9kdWxlKS8sICh7IG1hdGNoLCByYW5nZSwgc3RvcCB9KSA9PiB7XG4gICAgICAgICAgbGV0IGluZGVudCA9ICcnXG4gICAgICAgICAgc3dpdGNoIChtYXRjaFsyXSkge1xuICAgICAgICAgICAgY2FzZSAnaW1wb3J0JzpcbiAgICAgICAgICAgICAgaW5kZW50ID0gYFxcbiR7bWF0Y2hbMV19YFxuICAgICAgICAgICAgICBicmVha1xuICAgICAgICAgICAgY2FzZSAnbW9kdWxlJzpcbiAgICAgICAgICAgICAgaW5kZW50ID0gYFxcblxcbiR7bWF0Y2hbMV19YFxuICAgICAgICAgICAgICBicmVha1xuICAgICAgICAgIH1cbiAgICAgICAgICByZXNvbHZlKHtwb3M6IGJ1ZmZlci5yYW5nZUZvclJvdyhyYW5nZS5zdGFydC5yb3cpLmVuZCwgaW5kZW50LCBlbmQ6ICcnfSlcbiAgICAgICAgfSlcbiAgICAgICAgLy8gbm90aGluZyBmb3VuZFxuICAgICAgICByZXNvbHZlKHtcbiAgICAgICAgICBwb3M6IGJ1ZmZlci5nZXRGaXJzdFBvc2l0aW9uKCksXG4gICAgICAgICAgaW5kZW50OiAnJyxcbiAgICAgICAgICBlbmQ6ICdcXG4nXG4gICAgICAgIH0pXG4gICAgICB9KVxuICAgICAgZWRpdG9yLnNldFRleHRJbkJ1ZmZlclJhbmdlKFtwaS5wb3MsIHBpLnBvc10sIGAke3BpLmluZGVudH1pbXBvcnQgJHttb2R9JHtwaS5lbmR9YClcbiAgICB9XG4gIH1cblxuICBwcml2YXRlIGFzeW5jIHR5cGVUb29sdGlwIChlOiBBdG9tVHlwZXMuVGV4dEVkaXRvciwgcDogQXRvbVR5cGVzLlJhbmdlKSB7XG4gICAgY29uc3Qge3JhbmdlLCB0eXBlfSA9IGF3YWl0IHRoaXMucHJvY2Vzcy5nZXRUeXBlSW5CdWZmZXIoZS5nZXRCdWZmZXIoKSwgcClcbiAgICByZXR1cm4ge1xuICAgICAgICByYW5nZSxcbiAgICAgICAgdGV4dDoge1xuICAgICAgICAgIHRleHQ6IHR5cGUsXG4gICAgICAgICAgaGlnaGxpZ2h0ZXI6XG4gICAgICAgICAgICBhdG9tLmNvbmZpZy5nZXQoJ2hhc2tlbGwtZ2hjLW1vZC5oaWdobGlnaHRUb29sdGlwcycpID9cbiAgICAgICAgICAgICAgJ2hpbnQudHlwZS5oYXNrZWxsJyA6IHVuZGVmaW5lZFxuICAgICAgICB9XG4gICAgICB9XG4gIH1cblxuICBwcml2YXRlIGFzeW5jIGluZm9Ub29sdGlwIChlOiBBdG9tVHlwZXMuVGV4dEVkaXRvciwgcDogQXRvbVR5cGVzLlJhbmdlKSB7XG4gICAgY29uc3Qge3JhbmdlLCBpbmZvfSA9IGF3YWl0IHRoaXMucHJvY2Vzcy5nZXRJbmZvSW5CdWZmZXIoZSwgcClcbiAgICByZXR1cm4ge1xuICAgICAgICByYW5nZSxcbiAgICAgICAgdGV4dDoge1xuICAgICAgICAgIHRleHQ6IGluZm8sXG4gICAgICAgICAgaGlnaGxpZ2h0ZXI6XG4gICAgICAgICAgICBhdG9tLmNvbmZpZy5nZXQoJ2hhc2tlbGwtZ2hjLW1vZC5oaWdobGlnaHRUb29sdGlwcycpID9cbiAgICAgICAgICAgICAgJ3NvdXJjZS5oYXNrZWxsJyA6IHVuZGVmaW5lZFxuICAgICAgICB9XG4gICAgICB9XG4gIH1cblxuICBwcml2YXRlIGFzeW5jIGluZm9UeXBlVG9vbHRpcCAoZTogQXRvbVR5cGVzLlRleHRFZGl0b3IsIHA6IEF0b21UeXBlcy5SYW5nZSkge1xuICAgIHRyeSB7XG4gICAgICByZXR1cm4gYXdhaXQgdGhpcy5pbmZvVG9vbHRpcChlLCBwKVxuICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgIHJldHVybiB0aGlzLnR5cGVUb29sdGlwKGUsIHApXG4gICAgfVxuICB9XG5cbiAgcHJpdmF0ZSBhc3luYyB0eXBlSW5mb1Rvb2x0aXAgKGU6IEF0b21UeXBlcy5UZXh0RWRpdG9yLCBwOiBBdG9tVHlwZXMuUmFuZ2UpIHtcbiAgICB0cnkge1xuICAgICAgcmV0dXJuIGF3YWl0IHRoaXMudHlwZVRvb2x0aXAoZSwgcClcbiAgICB9IGNhdGNoIChlKSB7XG4gICAgICByZXR1cm4gdGhpcy5pbmZvVG9vbHRpcChlLCBwKVxuICAgIH1cbiAgfVxuXG4gIHByaXZhdGUgYXN5bmMgdHlwZUFuZEluZm9Ub29sdGlwIChlOiBBdG9tVHlwZXMuVGV4dEVkaXRvciwgcDogQXRvbVR5cGVzLlJhbmdlKSB7XG4gICAgY29uc3QgdHlwZVAgPSB0aGlzLnR5cGVUb29sdGlwKGUsIHApLmNhdGNoKCgpID0+IHVuZGVmaW5lZClcbiAgICBjb25zdCBpbmZvUCA9IHRoaXMuaW5mb1Rvb2x0aXAoZSwgcCkuY2F0Y2goKCkgPT4gdW5kZWZpbmVkKVxuICAgIGNvbnN0IFt0eXBlLCBpbmZvXSA9IGF3YWl0IFByb21pc2UuYWxsKFt0eXBlUCwgaW5mb1BdKVxuICAgIGxldCByYW5nZSwgdGV4dDogc3RyaW5nXG4gICAgaWYgKHR5cGUgJiYgaW5mbykge1xuICAgICAgcmFuZ2UgPSB0eXBlLnJhbmdlLnVuaW9uKGluZm8ucmFuZ2UpXG4gICAgICB0ZXh0ID0gYDo6ICR7dHlwZS50ZXh0LnRleHR9XFxuJHtpbmZvLnRleHQudGV4dH1gXG4gICAgfSBlbHNlIGlmICh0eXBlKSB7XG4gICAgICByYW5nZSA9IHR5cGUucmFuZ2VcbiAgICAgIHRleHQgPSBgOjogJHt0eXBlLnRleHQudGV4dH1gXG4gICAgfSBlbHNlIGlmIChpbmZvKSB7XG4gICAgICByYW5nZSA9IGluZm8ucmFuZ2VcbiAgICAgIHRleHQgPSBpbmZvLnRleHQudGV4dFxuICAgIH0gZWxzZSB7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoJ0dvdCBuZWl0aGVyIHR5cGUgbm9yIGluZm8nKVxuICAgIH1cbiAgICBjb25zdCBoaWdobGlnaHRlciA9IGF0b20uY29uZmlnLmdldCgnaGFza2VsbC1naGMtbW9kLmhpZ2hsaWdodFRvb2x0aXBzJykgPyAnc291cmNlLmhhc2tlbGwnIDogdW5kZWZpbmVkXG4gICAgcmV0dXJuIHsgcmFuZ2UsIHRleHQ6IHsgdGV4dCwgaGlnaGxpZ2h0ZXIgfSB9XG4gIH1cblxuICBwcml2YXRlIHNldEhpZ2hsaWdodGVyICgpIHtcbiAgICBpZiAoYXRvbS5jb25maWcuZ2V0KCdoYXNrZWxsLWdoYy1tb2QuaGlnaGxpZ2h0TWVzc2FnZXMnKSkge1xuICAgICAgcmV0dXJuIChtOiBVUEkuSVJlc3VsdEl0ZW0pOiBVUEkuSVJlc3VsdEl0ZW0gPT4ge1xuICAgICAgICBpZiAodHlwZW9mIG0ubWVzc2FnZSA9PT0gJ3N0cmluZycpIHtcbiAgICAgICAgICBjb25zdCBtZXNzYWdlOiBVUEkuSU1lc3NhZ2VUZXh0ID0ge1xuICAgICAgICAgICAgdGV4dDogbS5tZXNzYWdlLFxuICAgICAgICAgICAgaGlnaGxpZ2h0ZXI6ICdoaW50Lm1lc3NhZ2UuaGFza2VsbCdcbiAgICAgICAgICB9XG4gICAgICAgICAgcmV0dXJuIHsuLi5tLCBtZXNzYWdlfVxuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIHJldHVybiBtXG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9IGVsc2Uge1xuICAgICAgcmV0dXJuIChtOiBVUEkuSVJlc3VsdEl0ZW0pID0+IG1cbiAgICB9XG4gIH1cblxuICBwcml2YXRlIHNldE1lc3NhZ2VzIChtZXNzYWdlczogVVBJLklSZXN1bHRJdGVtW10pIHtcbiAgICB0aGlzLmxhc3RNZXNzYWdlcyA9IG1lc3NhZ2VzLm1hcCh0aGlzLnNldEhpZ2hsaWdodGVyKCkpXG4gICAgdGhpcy5zZW5kTWVzc2FnZXMoKVxuICB9XG5cbiAgcHJpdmF0ZSBzZW5kTWVzc2FnZXMgKCkge1xuICAgIHRoaXMudXBpLnNldE1lc3NhZ2VzKHRoaXMucHJvY2Vzc01lc3NhZ2VzLmNvbmNhdCh0aGlzLmxhc3RNZXNzYWdlcykpXG4gIH1cblxuICBwcml2YXRlIGFzeW5jIGNoZWNrTGludCAoYnVmZmVyOiBBdG9tVHlwZXMuVGV4dEJ1ZmZlciwgb3B0OiAnU2F2ZScgfCAnQ2hhbmdlJywgZmFzdDogYm9vbGVhbiA9IGZhbHNlKSB7XG4gICAgbGV0IHJlc1xuICAgIGlmIChhdG9tLmNvbmZpZy5nZXQoYGhhc2tlbGwtZ2hjLW1vZC5vbiR7b3B0fUNoZWNrYCkgJiYgYXRvbS5jb25maWcuZ2V0KGBoYXNrZWxsLWdoYy1tb2Qub24ke29wdH1MaW50YCkpIHtcbiAgICAgIHJlcyA9IGF3YWl0IHRoaXMucHJvY2Vzcy5kb0NoZWNrQW5kTGludChidWZmZXIsIGZhc3QpXG4gICAgfSBlbHNlIGlmIChhdG9tLmNvbmZpZy5nZXQoYGhhc2tlbGwtZ2hjLW1vZC5vbiR7b3B0fUNoZWNrYCkpIHtcbiAgICAgIHJlcyA9IGF3YWl0IHRoaXMucHJvY2Vzcy5kb0NoZWNrQnVmZmVyKGJ1ZmZlciwgZmFzdClcbiAgICB9IGVsc2UgaWYgKGF0b20uY29uZmlnLmdldChgaGFza2VsbC1naGMtbW9kLm9uJHtvcHR9TGludGApKSB7XG4gICAgICByZXMgPSBhd2FpdCB0aGlzLnByb2Nlc3MuZG9MaW50QnVmZmVyKGJ1ZmZlciwgZmFzdClcbiAgICB9XG4gICAgaWYgKHJlcykge1xuICAgICAgdGhpcy5zZXRNZXNzYWdlcyhyZXMpXG4gICAgfVxuICB9XG5cbiAgcHJpdmF0ZSBjb25zb2xlUmVwb3J0IChhcmc6IElFcnJvckNhbGxiYWNrQXJncykge1xuICAgIFV0aWwuZXJyb3IoVXRpbC5mb3JtYXRFcnJvcihhcmcpLCBVdGlsLmdldEVycm9yRGV0YWlsKGFyZykpXG4gIH1cblxuICBwcml2YXRlIGhhbmRsZVByb2Nlc3NFcnJvciAoYXJnOiBJRXJyb3JDYWxsYmFja0FyZ3MpIHtcbiAgICBzd2l0Y2ggKHRoaXMubXNnQmFja2VuZCkge1xuICAgICAgY2FzZSBNc2dCYWNrZW5kLlVQSTpcbiAgICAgICAgdGhpcy5wcm9jZXNzTWVzc2FnZXMucHVzaCh7XG4gICAgICAgICAgbWVzc2FnZTogVXRpbC5mb3JtYXRFcnJvcihhcmcpXG4gICAgICAgICAgICArICdcXG5cXG5TZWUgY29uc29sZSAoVmlldyDihpIgRGV2ZWxvcGVyIOKGkiBUb2dnbGUgRGV2ZWxvcGVyIFRvb2xzIOKGkiBDb25zb2xlIHRhYikgZm9yIGRldGFpbHMuJyxcbiAgICAgICAgICBzZXZlcml0eTogJ2doYy1tb2QnXG4gICAgICAgIH0pXG4gICAgICAgIHRoaXMuY29uc29sZVJlcG9ydChhcmcpXG4gICAgICAgIHRoaXMuc2VuZE1lc3NhZ2VzKClcbiAgICAgICAgYnJlYWtcbiAgICAgIGNhc2UgTXNnQmFja2VuZC5Db25zb2xlOlxuICAgICAgICB0aGlzLmNvbnNvbGVSZXBvcnQoYXJnKVxuICAgICAgICBicmVha1xuICAgICAgY2FzZSBNc2dCYWNrZW5kLlBvcHVwOlxuICAgICAgICB0aGlzLmNvbnNvbGVSZXBvcnQoYXJnKVxuICAgICAgICBhdG9tLm5vdGlmaWNhdGlvbnMuYWRkRXJyb3IoVXRpbC5mb3JtYXRFcnJvcihhcmcpLCB7XG4gICAgICAgICAgZGV0YWlsOiBVdGlsLmdldEVycm9yRGV0YWlsKGFyZyksXG4gICAgICAgICAgZGlzbWlzc2FibGU6IHRydWVcbiAgICAgICAgfSlcbiAgICAgICAgYnJlYWtcbiAgICB9XG4gIH1cblxuICBwcml2YXRlIGhhbmRsZVByb2Nlc3NXYXJuaW5nICh3YXJuaW5nOiBzdHJpbmcpIHtcbiAgICBzd2l0Y2ggKHRoaXMubXNnQmFja2VuZCkge1xuICAgICAgY2FzZSBNc2dCYWNrZW5kLlVQSTpcbiAgICAgICAgdGhpcy5wcm9jZXNzTWVzc2FnZXMucHVzaCh7XG4gICAgICAgICAgbWVzc2FnZTogd2FybmluZyxcbiAgICAgICAgICBzZXZlcml0eTogJ2doYy1tb2QnXG4gICAgICAgIH0pXG4gICAgICAgIFV0aWwud2Fybih3YXJuaW5nKVxuICAgICAgICB0aGlzLnNlbmRNZXNzYWdlcygpXG4gICAgICAgIGJyZWFrXG4gICAgICBjYXNlIE1zZ0JhY2tlbmQuQ29uc29sZTpcbiAgICAgICAgVXRpbC53YXJuKHdhcm5pbmcpXG4gICAgICAgIGJyZWFrXG4gICAgICBjYXNlIE1zZ0JhY2tlbmQuUG9wdXA6XG4gICAgICAgIFV0aWwud2Fybih3YXJuaW5nKVxuICAgICAgICBhdG9tLm5vdGlmaWNhdGlvbnMuYWRkV2FybmluZyh3YXJuaW5nLCB7XG4gICAgICAgICAgZGlzbWlzc2FibGU6IGZhbHNlXG4gICAgICAgIH0pXG4gICAgICAgIGJyZWFrXG4gICAgfVxuICB9XG59XG4iXX0=