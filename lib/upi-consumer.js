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
                text = type.text.text;
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidXBpLWNvbnN1bWVyLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vc3JjL3VwaS1jb25zdW1lci50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOzs7Ozs7Ozs7O0FBQUEsK0JBQWlEO0FBRWpELCtEQUF1RDtBQUN2RCwrQkFBK0I7QUFFL0IsTUFBTSxZQUFZLEdBQUc7SUFDbkIsS0FBSyxFQUFFLEVBQUU7SUFDVCxPQUFPLEVBQUUsRUFBRTtJQUNYLElBQUksRUFBRSxFQUFFO0NBQ1QsQ0FBQTtBQUVELE1BQU0sV0FBVyxHQUFHO0lBQ2xCLFNBQVMsRUFBRTtRQUNULFNBQVMsRUFBRSxLQUFLO1FBQ2hCLFVBQVUsRUFBRSxJQUFJO0tBQ2pCO0NBQ0YsQ0FBQTtBQUVELE1BQU0sWUFBWSxHQUFHLDJDQUEyQyxDQUFBO0FBRWhFLE1BQU0sUUFBUSxHQUFHO0lBQ2YsS0FBSyxFQUFFLFNBQVM7SUFDaEIsSUFBSSxFQUFFO1FBQ0osRUFBQyxLQUFLLEVBQUUsT0FBTyxFQUFFLE9BQU8sRUFBRSw0QkFBNEIsRUFBQztRQUN2RCxFQUFDLEtBQUssRUFBRSxNQUFNLEVBQUUsT0FBTyxFQUFFLDJCQUEyQixFQUFDO1FBQ3JELEVBQUMsS0FBSyxFQUFFLGNBQWMsRUFBRSxPQUFPLEVBQUUsa0NBQWtDLEVBQUM7S0FDckU7Q0FDRixDQUFBO0FBRUQsSUFBVyxVQUlWO0FBSkQsV0FBVyxVQUFVO0lBQ25CLGlDQUFtQixDQUFBO0lBQ25CLHlCQUFXLENBQUE7SUFDWCw2QkFBZSxDQUFBO0FBQ2pCLENBQUMsRUFKVSxVQUFVLEtBQVYsVUFBVSxRQUlwQjtBQUVEO0lBMkNFLFlBQWEsUUFBOEIsRUFBVSxPQUF1QjtRQUF2QixZQUFPLEdBQVAsT0FBTyxDQUFnQjtRQXpDcEUsZ0JBQVcsR0FBd0IsSUFBSSwwQkFBbUIsRUFBRSxDQUFBO1FBQzVELG9CQUFlLEdBQXNCLEVBQUUsQ0FBQTtRQUN2QyxpQkFBWSxHQUFzQixFQUFFLENBQUE7UUFDcEMsZUFBVSxHQUFl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b0IsQ0FBRSxPQUFlO1FBQzNDLE1BQU0sQ0FBQyxDQUFDLElBQUksQ0FBQyxVQUFVLENBQUMsQ0FBQyxDQUFDO1lBQ3hCO2dCQUNFLElBQUksQ0FBQyxlQUFlLENBQUMsSUFBSSxDQUFDO29CQUN4QixPQUFPLEVBQUUsT0FBTztvQkFDaEIsUUFBUSxFQUFFLFNBQVM7aUJBQ3BCLENBQUMsQ0FBQTtnQkFDRixJQUFJLENBQUMsSUFBSSxDQUFDLE9BQU8sQ0FBQyxDQUFBO2dCQUNsQixJQUFJLENBQUMsWUFBWSxFQUFFLENBQUE7Z0JBQ25CLEtBQUssQ0FBQTtZQUNQO2dCQUNFLElBQUksQ0FBQyxJQUFJLENBQUMsT0FBTyxDQUFDLENBQUE7Z0JBQ2xCLEtBQUssQ0FBQTtZQUNQO2dCQUNFLElBQUksQ0FBQyxJQUFJLENBQUMsT0FBTyxDQUFDLENBQUE7Z0JBQ2xCLElBQUksQ0FBQyxhQUFhLENBQUMsVUFBVSxDQUFDLE9BQU8sRUFBRTtvQkFDckMsV0FBVyxFQUFFLEtBQUs7aUJBQ25CLENBQUMsQ0FBQTtnQkFDRixLQUFLLENBQUE7UUFDVCxDQUFDO0lBQ0gsQ0FBQztDQUNGO0FBdFlELGtDQXNZQyIsInNvdXJjZXNDb250ZW50IjpbImltcG9ydCB7IENvbXBvc2l0ZURpc3Bvc2FibGUsIFJhbmdlIH0gZnJvbSAnYXRvbSdcbmltcG9ydCB7R2hjTW9kaVByb2Nlc3MsIElFcnJvckNhbGxiYWNrQXJnc30gZnJvbSAnLi9naGMtbW9kJ1xuaW1wb3J0IHtpbXBvcnRMaXN0Vmlld30gZnJvbSAnLi92aWV3cy9pbXBvcnQtbGlzdC12aWV3J1xuaW1wb3J0IFV0aWwgPSByZXF1aXJlKCcuL3V0aWwnKVxuXG5jb25zdCBtZXNzYWdlVHlwZXMgPSB7XG4gIGVycm9yOiB7fSxcbiAgd2FybmluZzoge30sXG4gIGxpbnQ6IHt9XG59XG5cbmNvbnN0IGFkZE1zZ1R5cGVzID0ge1xuICAnZ2hjLW1vZCc6IHtcbiAgICB1cmlGaWx0ZXI6IGZhbHNlLFxuICAgIGF1dG9TY3JvbGw6IHRydWVcbiAgfVxufVxuXG5jb25zdCBjb250ZXh0U2NvcGUgPSAnYXRvbS10ZXh0LWVkaXRvcltkYXRhLWdyYW1tYXJ+PVwiaGFza2VsbFwiXSdcblxuY29uc3QgbWFpbk1lbnUgPSB7XG4gIGxhYmVsOiAnZ2hjLW1vZCcsXG4gIG1lbnU6IFtcbiAgICB7bGFiZWw6ICdDaGVjaycsIGNvbW1hbmQ6ICdoYXNrZWxsLWdoYy1tb2Q6Y2hlY2stZmlsZSd9LFxuICAgIHtsYWJlbDogJ0xpbnQnLCBjb21tYW5kOiAnaGFza2VsbC1naGMtbW9kOmxpbnQtZmlsZSd9LFxuICAgIHtsYWJlbDogJ1N0b3AgQmFja2VuZCcsIGNvbW1hbmQ6ICdoYXNrZWxsLWdoYy1tb2Q6c2h1dGRvd24tYmFja2VuZCd9XG4gIF1cbn1cblxuY29uc3QgZW51bSBNc2dCYWNrZW5kIHtcbiAgQ29uc29sZSA9ICdjb25zb2xlJyxcbiAgVVBJID0gJ3VwaScsXG4gIFBvcHVwID0gJ3BvcHVwJyxcbn1cblxuZXhwb3J0IGNsYXNzIFVQSUNvbnN1bWVyIHtcbiAgcHJpdmF0ZSB1cGk6IFVQSS5JVVBJSW5zdGFuY2VcbiAgcHJpdmF0ZSBkaXNwb3NhYmxlczogQ29tcG9zaXRlRGlzcG9zYWJsZSA9IG5ldyBDb21wb3NpdGVEaXNwb3NhYmxlKClcbiAgcHJpdmF0ZSBwcm9jZXNzTWVzc2FnZXM6IFVQSS5JUmVzdWx0SXRlbVtdID0gW11cbiAgcHJpdmF0ZSBsYXN0TWVzc2FnZXM6IFVQSS5JUmVzdWx0SXRlbVtdID0gW11cbiAgcHJpdmF0ZSBtc2dCYWNrZW5kOiBNc2dCYWNrZW5kID0gYXRvbS5jb25maWcuZ2V0KCdoYXNrZWxsLWdoYy1tb2QuZ2hjTW9kTWVzc2FnZXMnKVxuXG4gIHByaXZhdGUgY29udGV4dENvbW1hbmRzID0ge1xuICAgICdoYXNrZWxsLWdoYy1tb2Q6c2hvdy10eXBlJzogdGhpcy50b29sdGlwQ29tbWFuZCh0aGlzLnR5cGVUb29sdGlwLmJpbmQodGhpcykpLFxuICAgICdoYXNrZWxsLWdoYy1tb2Q6c2hvdy1pbmZvJzogdGhpcy50b29sdGlwQ29tbWFuZCh0aGlzLmluZm9Ub29sdGlwLmJpbmQodGhpcykpLFxuICAgICdoYXNrZWxsLWdoYy1tb2Q6Y2FzZS1zcGxpdCc6IHRoaXMuY2FzZVNwbGl0Q29tbWFuZC5iaW5kKHRoaXMpLFxuICAgICdoYXNrZWxsLWdoYy1tb2Q6c2lnLWZpbGwnOiB0aGlzLnNpZ0ZpbGxDb21tYW5kLmJpbmQodGhpcyksXG4gICAgJ2hhc2tlbGwtZ2hjLW1vZDpnby10by1kZWNsYXJhdGlvbic6IHRoaXMuZ29Ub0RlY2xDb21tYW5kLmJpbmQodGhpcyksXG4gICAgJ2hhc2tlbGwtZ2hjLW1vZDpzaG93LWluZm8tZmFsbGJhY2stdG8tdHlwZSc6IHRoaXMudG9vbHRpcENvbW1hbmQodGhpcy5pbmZvVHlwZVRvb2x0aXAuYmluZCh0aGlzKSksXG4gICAgJ2hhc2tlbGwtZ2hjLW1vZDpzaG93LXR5cGUtZmFsbGJhY2stdG8taW5mbyc6IHRoaXMudG9vbHRpcENvbW1hbmQodGhpcy50eXBlSW5mb1Rvb2x0aXAuYmluZCh0aGlzKSksXG4gICAgJ2hhc2tlbGwtZ2hjLW1vZDpzaG93LXR5cGUtYW5kLWluZm8nOiB0aGlzLnRvb2x0aXBDb21tYW5kKHRoaXMudHlwZUFuZEluZm9Ub29sdGlwLmJpbmQodGhpcykpLFxuICAgICdoYXNrZWxsLWdoYy1tb2Q6aW5zZXJ0LXR5cGUnOiB0aGlzLmluc2VydFR5cGVDb21tYW5kLmJpbmQodGhpcyksXG4gICAgJ2hhc2tlbGwtZ2hjLW1vZDppbnNlcnQtaW1wb3J0JzogdGhpcy5pbnNlcnRJbXBvcnRDb21tYW5kLmJpbmQodGhpcylcbiAgfVxuXG4gIHByaXZhdGUgZ2xvYmFsQ29tbWFuZHMgPSB7XG4gICAgJ2hhc2tlbGwtZ2hjLW1vZDpjaGVjay1maWxlJzogdGhpcy5jaGVja0NvbW1hbmQuYmluZCh0aGlzKSxcbiAgICAnaGFza2VsbC1naGMtbW9kOmxpbnQtZmlsZSc6IHRoaXMubGludENvbW1hbmQuYmluZCh0aGlzKSxcbiAgICAuLi50aGlzLmNvbnRleHRDb21tYW5kc1xuICB9XG5cbiAgcHJpdmF0ZSBjb250ZXh0TWVudToge1xuICAgIGxhYmVsOiBzdHJpbmcsIHN1Ym1lbnU6IEFycmF5PHtsYWJlbDogc3RyaW5nLCBjb21tYW5kOiBrZXlvZiBVUElDb25zdW1lclsnY29udGV4dENvbW1hbmRzJ119PlxuICB9ID0ge1xuICAgIGxhYmVsOiAnZ2hjLW1vZCcsXG4gICAgc3VibWVudTpcbiAgICAgIFtcbiAgICAgICAge2xhYmVsOiAnU2hvdyBUeXBlJywgY29tbWFuZDogJ2hhc2tlbGwtZ2hjLW1vZDpzaG93LXR5cGUnfSxcbiAgICAgICAge2xhYmVsOiAnU2hvdyBJbmZvJywgY29tbWFuZDogJ2hhc2tlbGwtZ2hjLW1vZDpzaG93LWluZm8nfSxcbiAgICAgICAge2xhYmVsOiAnU2hvdyBUeXBlIEFuZCBJbmZvJywgY29tbWFuZDogJ2hhc2tlbGwtZ2hjLW1vZDpzaG93LXR5cGUtYW5kLWluZm8nfSxcbiAgICAgICAge2xhYmVsOiAnQ2FzZSBTcGxpdCcsIGNvbW1hbmQ6ICdoYXNrZWxsLWdoYy1tb2Q6Y2FzZS1zcGxpdCd9LFxuICAgICAgICB7bGFiZWw6ICdTaWcgRmlsbCcsIGNvbW1hbmQ6ICdoYXNrZWxsLWdoYy1tb2Q6c2lnLWZpbGwnfSxcbiAgICAgICAge2xhYmVsOiAnSW5zZXJ0IFR5cGUnLCBjb21tYW5kOiAnaGFza2VsbC1naGMtbW9kOmluc2VydC10eXBlJ30sXG4gICAgICAgIHtsYWJlbDogJ0luc2VydCBJbXBvcnQnLCBjb21tYW5kOiAnaGFza2VsbC1naGMtbW9kOmluc2VydC1pbXBvcnQnfSxcbiAgICAgICAge2xhYmVsOiAnR28gVG8gRGVjbGFyYXRpb24nLCBjb21tYW5kOiAnaGFza2VsbC1naGMtbW9kOmdvLXRvLWRlY2xhcmF0aW9uJ31cbiAgICAgIF1cbiAgfVxuXG4gIGNvbnN0cnVjdG9yIChyZWdpc3RlcjogVVBJLklVUElSZWdpc3RyYXRpb24sIHByaXZhdGUgcHJvY2VzczogR2hjTW9kaVByb2Nlc3MpIHtcbiAgICB0aGlzLmRpc3Bvc2FibGVzLmFkZChcbiAgICAgIHRoaXMucHJvY2Vzcy5vbkVycm9yKHRoaXMuaGFuZGxlUHJvY2Vzc0Vycm9yLmJpbmQodGhpcykpLFxuICAgICAgdGhpcy5wcm9jZXNzLm9uV2FybmluZyh0aGlzLmhhbmRsZVByb2Nlc3NXYXJuaW5nLmJpbmQodGhpcykpLFxuICAgIClcblxuICAgIGNvbnN0IG1zZ1R5cGVzID1cbiAgICAgIHRoaXMubXNnQmFja2VuZCA9PT0gTXNnQmFja2VuZC5VUElcbiAgICAgID8geyAuLi5tZXNzYWdlVHlwZXMsIC4uLmFkZE1zZ1R5cGVzIH1cbiAgICAgIDogbWVzc2FnZVR5cGVzXG5cbiAgICB0aGlzLnVwaSA9IHJlZ2lzdGVyKHtcbiAgICAgIG5hbWU6ICdoYXNrZWxsLWdoYy1tb2QnLFxuICAgICAgbWVudTogbWFpbk1lbnUsXG4gICAgICBtZXNzYWdlVHlwZXM6IG1zZ1R5cGVzLFxuICAgICAgdG9vbHRpcDogdGhpcy5zaG91bGRTaG93VG9vbHRpcC5iaW5kKHRoaXMpLFxuICAgICAgZXZlbnRzOiB7XG4gICAgICAgIG9uRGlkU2F2ZUJ1ZmZlcjogYXN5bmMgKGJ1ZmZlcikgPT5cbiAgICAgICAgICB0aGlzLmNoZWNrTGludChidWZmZXIsICdTYXZlJyksXG4gICAgICAgIG9uRGlkU3RvcENoYW5naW5nOiBhc3luYyAoYnVmZmVyKSA9PlxuICAgICAgICAgIHRoaXMuY2hlY2tMaW50KGJ1ZmZlciwgJ0NoYW5nZScsIHRydWUpXG4gICAgICB9XG4gICAgfSlcblxuICAgIHRoaXMuZGlzcG9zYWJsZXMuYWRkKFxuICAgICAgdGhpcy51cGksXG4gICAgICB0aGlzLnByb2Nlc3Mub25CYWNrZW5kQWN0aXZlKCgpID0+IHRoaXMudXBpLnNldFN0YXR1cyh7c3RhdHVzOiAncHJvZ3Jlc3MnLCBkZXRhaWw6ICcnfSkpLFxuICAgICAgdGhpcy5wcm9jZXNzLm9uQmFja2VuZElkbGUoKCkgPT4gdGhpcy51cGkuc2V0U3RhdHVzKHtzdGF0dXM6ICdyZWFkeScsIGRldGFpbDogJyd9KSksXG4gICAgICBhdG9tLmNvbW1hbmRzLmFkZChjb250ZXh0U2NvcGUsIHRoaXMuZ2xvYmFsQ29tbWFuZHMpLFxuICAgIClcbiAgICBjb25zdCBjbSA9IHt9XG4gICAgY21bY29udGV4dFNjb3BlXSA9IFt0aGlzLmNvbnRleHRNZW51XVxuICAgIHRoaXMuZGlzcG9zYWJsZXMuYWRkKGF0b20uY29udGV4dE1lbnUuYWRkKGNtKSlcbiAgfVxuXG4gIHB1YmxpYyBkaXNwb3NlICgpIHtcbiAgICB0aGlzLmRpc3Bvc2FibGVzLmRpc3Bvc2UoKVxuICB9XG5cbiAgcHJpdmF0ZSBhc3luYyBzaG91bGRTaG93VG9vbHRpcCAoXG4gICAgZWRpdG9yOiBBdG9tVHlwZXMuVGV4dEVkaXRvciwgY3JhbmdlOiBBdG9tVHlwZXMuUmFuZ2UsIHR5cGU6IFVQSS5URXZlbnRSYW5nZVR5cGVcbiAgKTogUHJvbWlzZTxVUEkuSVRvb2x0aXBEYXRhIHwgdW5kZWZpbmVkPiB7XG4gICAgICBpZiAodHlwZSA9PT0gJ21vdXNlJykge1xuICAgICAgICBjb25zdCB0ID0gYXRvbS5jb25maWcuZ2V0KCdoYXNrZWxsLWdoYy1tb2Qub25Nb3VzZUhvdmVyU2hvdycpXG4gICAgICAgIGlmICh0KSB7XG4gICAgICAgICAgcmV0dXJuIHRoaXNbYCR7dH1Ub29sdGlwYF0oZWRpdG9yLCBjcmFuZ2UpXG4gICAgICAgIH1cbiAgICAgIH0gZWxzZSBpZiAodHlwZSA9PT0gJ3NlbGVjdGlvbicpIHtcbiAgICAgICAgY29uc3QgdCA9IGF0b20uY29uZmlnLmdldCgnaGFza2VsbC1naGMtbW9kLm9uU2VsZWN0aW9uU2hvdycpXG4gICAgICAgIGlmICh0KSB7XG4gICAgICAgICAgcmV0dXJuIHRoaXNbYCR7dH1Ub29sdGlwYF0oZWRpdG9yLCBjcmFuZ2UpXG4gICAgICAgIH1cbiAgICAgIH1cbiAgfVxuXG4gIHByaXZhdGUgYXN5bmMgY2hlY2tDb21tYW5kICh7Y3VycmVudFRhcmdldH06IElFdmVudERlc2MpIHtcbiAgICBjb25zdCBlZGl0b3IgPSBjdXJyZW50VGFyZ2V0LmdldE1vZGVsKClcbiAgICBjb25zdCByZXMgPSBhd2FpdCB0aGlzLnByb2Nlc3MuZG9DaGVja0J1ZmZlcihlZGl0b3IuZ2V0QnVmZmVyKCkpXG4gICAgdGhpcy5zZXRNZXNzYWdlcyhyZXMpXG4gIH1cblxuICBwcml2YXRlIGFzeW5jIGxpbnRDb21tYW5kICh7Y3VycmVudFRhcmdldH06IElFdmVudERlc2MpIHtcbiAgICBjb25zdCBlZGl0b3IgPSBjdXJyZW50VGFyZ2V0LmdldE1vZGVsKClcbiAgICBjb25zdCByZXMgPSBhd2FpdCB0aGlzLnByb2Nlc3MuZG9MaW50QnVmZmVyKGVkaXRvci5nZXRCdWZmZXIoKSlcbiAgICB0aGlzLnNldE1lc3NhZ2VzKHJlcylcbiAgfVxuXG4gIHByaXZhdGUgdG9vbHRpcENvbW1hbmQgKHRvb2x0aXBmdW46IChlOiBBdG9tVHlwZXMuVGV4dEVkaXRvciwgcDogQXRvbVR5cGVzLlJhbmdlKSA9PiBQcm9taXNlPFVQSS5JVG9vbHRpcERhdGE+KSB7XG4gICAgcmV0dXJuICh7Y3VycmVudFRhcmdldCwgZGV0YWlsfTogSUV2ZW50RGVzYykgPT5cbiAgICAgIHRoaXMudXBpLnNob3dUb29sdGlwKHtcbiAgICAgICAgZWRpdG9yOiBjdXJyZW50VGFyZ2V0LmdldE1vZGVsKCksXG4gICAgICAgIGRldGFpbCxcbiAgICAgICAgYXN5bmMgdG9vbHRpcCAoY3JhbmdlKSB7XG4gICAgICAgICAgcmV0dXJuIHRvb2x0aXBmdW4oY3VycmVudFRhcmdldC5nZXRNb2RlbCgpLCBjcmFuZ2UpXG4gICAgICAgIH1cbiAgICAgIH0pXG4gIH1cblxuICBwcml2YXRlIGFzeW5jIGluc2VydFR5cGVDb21tYW5kICh7Y3VycmVudFRhcmdldCwgZGV0YWlsfTogSUV2ZW50RGVzYykge1xuICAgIGNvbnN0IGVkaXRvciA9IGN1cnJlbnRUYXJnZXQuZ2V0TW9kZWwoKVxuICAgIGNvbnN0IGVyID0gdGhpcy51cGkuZ2V0RXZlbnRSYW5nZShlZGl0b3IsIGRldGFpbClcbiAgICBpZiAoZXIgPT09IHVuZGVmaW5lZCkgeyByZXR1cm4gfVxuICAgIGNvbnN0IHtjcmFuZ2UsIHBvc30gPSBlclxuICAgIGNvbnN0IHt0eXBlfSA9IGF3YWl0IHRoaXMucHJvY2Vzcy5nZXRUeXBlSW5CdWZmZXIoZWRpdG9yLmdldEJ1ZmZlcigpLCBjcmFuZ2UpXG4gICAgY29uc3Qgc3ltSW5mbyA9IFV0aWwuZ2V0U3ltYm9sQXRQb2ludChlZGl0b3IsIHBvcylcbiAgICBpZiAoIXN5bUluZm8pIHsgcmV0dXJuIH1cbiAgICBjb25zdCB7c2NvcGUsIHJhbmdlLCBzeW1ib2x9ID0gc3ltSW5mb1xuICAgIGlmIChzY29wZS5zdGFydHNXaXRoKCdrZXl3b3JkLm9wZXJhdG9yLicpKSB7IHJldHVybiB9IC8vIGNhbid0IGNvcnJlY3RseSBoYW5kbGUgaW5maXggbm90YXRpb25cbiAgICBpZiAoZWRpdG9yLmdldFRleHRJbkJ1ZmZlclJhbmdlKFtyYW5nZS5lbmQsIGVkaXRvci5idWZmZXJSYW5nZUZvckJ1ZmZlclJvdyhyYW5nZS5lbmQucm93KS5lbmRdKS5tYXRjaCgvPS8pKSB7XG4gICAgICBsZXQgaW5kZW50ID0gZWRpdG9yLmdldFRleHRJbkJ1ZmZlclJhbmdlKFtbcmFuZ2Uuc3RhcnQucm93LCAwXSwgcmFuZ2Uuc3RhcnRdKVxuICAgICAgbGV0IGJpcmRUcmFjayA9ICcnXG4gICAgICBpZiAoZWRpdG9yLnNjb3BlRGVzY3JpcHRvckZvckJ1ZmZlclBvc2l0aW9uKHBvcykuZ2V0U2NvcGVzQXJyYXkoKS5pbmNsdWRlcygnbWV0YS5lbWJlZGRlZC5oYXNrZWxsJykpIHtcbiAgICAgICAgYmlyZFRyYWNrID0gaW5kZW50LnNsaWNlKDAsIDIpXG4gICAgICAgIGluZGVudCA9IGluZGVudC5zbGljZSgyKVxuICAgICAgfVxuICAgICAgaWYgKGluZGVudC5tYXRjaCgvXFxTLykpIHtcbiAgICAgICAgaW5kZW50ID0gaW5kZW50LnJlcGxhY2UoL1xcUy9nLCAnICcpXG4gICAgICB9XG4gICAgICBlZGl0b3Iuc2V0VGV4dEluQnVmZmVyUmFuZ2UoXG4gICAgICAgIFtyYW5nZS5zdGFydCwgcmFuZ2Uuc3RhcnRdLCBgJHtzeW1ib2x9IDo6ICR7dHlwZX1cXG4ke2JpcmRUcmFja30ke2luZGVudH1gXG4gICAgICApXG4gICAgfSBlbHNlIHtcbiAgICAgIGVkaXRvci5zZXRUZXh0SW5CdWZmZXJSYW5nZShyYW5nZSwgYCgke2VkaXRvci5nZXRUZXh0SW5CdWZmZXJSYW5nZShyYW5nZSl9IDo6ICR7dHlwZX0pYClcbiAgICB9XG4gIH1cblxuICBwcml2YXRlIGFzeW5jIGNhc2VTcGxpdENvbW1hbmQgKHtjdXJyZW50VGFyZ2V0LCBkZXRhaWx9OiBJRXZlbnREZXNjKSB7XG4gICAgY29uc3QgZWRpdG9yID0gY3VycmVudFRhcmdldC5nZXRNb2RlbCgpXG4gICAgY29uc3QgZXZyID0gdGhpcy51cGkuZ2V0RXZlbnRSYW5nZShlZGl0b3IsIGRldGFpbClcbiAgICBpZiAoIWV2cikgeyByZXR1cm4gfVxuICAgIGNvbnN0IHtjcmFuZ2V9ID0gZXZyXG4gICAgY29uc3QgcmVzID0gYXdhaXQgdGhpcy5wcm9jZXNzLmRvQ2FzZVNwbGl0KGVkaXRvci5nZXRCdWZmZXIoKSwgY3JhbmdlKVxuICAgIGZvciAoY29uc3Qge3JhbmdlLCByZXBsYWNlbWVudH0gb2YgcmVzKSB7XG4gICAgICBlZGl0b3Iuc2V0VGV4dEluQnVmZmVyUmFuZ2UocmFuZ2UsIHJlcGxhY2VtZW50KVxuICAgIH1cbiAgfVxuXG4gIHByaXZhdGUgYXN5bmMgc2lnRmlsbENvbW1hbmQgKHtjdXJyZW50VGFyZ2V0LCBkZXRhaWx9OiBJRXZlbnREZXNjKSB7XG4gICAgY29uc3QgZWRpdG9yID0gY3VycmVudFRhcmdldC5nZXRNb2RlbCgpXG4gICAgY29uc3QgZXZyID0gdGhpcy51cGkuZ2V0RXZlbnRSYW5nZShlZGl0b3IsIGRldGFpbClcbiAgICBpZiAoIWV2cikgeyByZXR1cm4gfVxuICAgIGNvbnN0IHtjcmFuZ2V9ID0gZXZyXG4gICAgY29uc3QgcmVzID0gYXdhaXQgdGhpcy5wcm9jZXNzLmRvU2lnRmlsbChlZGl0b3IuZ2V0QnVmZmVyKCksIGNyYW5nZSlcblxuICAgIGVkaXRvci50cmFuc2FjdCgoKSA9PiB7XG4gICAgICBjb25zdCB7IHR5cGUsIHJhbmdlLCBib2R5IH0gPSByZXNcbiAgICAgIGNvbnN0IHNpZyA9IGVkaXRvci5nZXRUZXh0SW5CdWZmZXJSYW5nZShyYW5nZSlcbiAgICAgIGxldCBpbmRlbnQgPSBlZGl0b3IuaW5kZW50TGV2ZWxGb3JMaW5lKHNpZylcbiAgICAgIGNvbnN0IHBvcyA9IHJhbmdlLmVuZFxuICAgICAgY29uc3QgdGV4dCA9IGBcXG4ke2JvZHl9YFxuICAgICAgaWYgKHR5cGUgPT09ICdpbnN0YW5jZScpIHtcbiAgICAgICAgaW5kZW50ICs9IDFcbiAgICAgICAgaWYgKCFzaWcuZW5kc1dpdGgoJyB3aGVyZScpKSB7XG4gICAgICAgICAgZWRpdG9yLnNldFRleHRJbkJ1ZmZlclJhbmdlKFtyYW5nZS5lbmQsIHJhbmdlLmVuZF0sICcgd2hlcmUnKVxuICAgICAgICB9XG4gICAgICB9XG4gICAgICBjb25zdCBuZXdyYW5nZSA9IGVkaXRvci5zZXRUZXh0SW5CdWZmZXJSYW5nZShbcG9zLCBwb3NdLCB0ZXh0KVxuICAgICAgbmV3cmFuZ2UuZ2V0Um93cygpLnNsaWNlKDEpLm1hcCgocm93KSA9PlxuICAgICAgICBlZGl0b3Iuc2V0SW5kZW50YXRpb25Gb3JCdWZmZXJSb3cocm93LCBpbmRlbnQpKVxuICAgIH0pXG4gIH1cblxuICBwcml2YXRlIGFzeW5jIGdvVG9EZWNsQ29tbWFuZCAoe2N1cnJlbnRUYXJnZXQsIGRldGFpbH06IElFdmVudERlc2MpIHtcbiAgICBjb25zdCBlZGl0b3IgPSBjdXJyZW50VGFyZ2V0LmdldE1vZGVsKClcbiAgICBjb25zdCBldnIgPSB0aGlzLnVwaS5nZXRFdmVudFJhbmdlKGVkaXRvciwgZGV0YWlsKVxuICAgIGlmICghZXZyKSB7IHJldHVybiB9XG4gICAgY29uc3Qge2NyYW5nZX0gPSBldnJcbiAgICBjb25zdCB7aW5mb30gPSBhd2FpdCB0aGlzLnByb2Nlc3MuZ2V0SW5mb0luQnVmZmVyKGVkaXRvciwgY3JhbmdlKVxuICAgIGNvbnN0IHJlcyA9IC8uKi0tIERlZmluZWQgYXQgKC4rKTooXFxkKyk6KFxcZCspLy5leGVjKGluZm8pXG4gICAgaWYgKCFyZXMpIHsgcmV0dXJuIH1cbiAgICBjb25zdCBbZm4sIGxpbmUsIGNvbF0gPSByZXMuc2xpY2UoMSlcbiAgICBjb25zdCByb290RGlyID0gYXdhaXQgdGhpcy5wcm9jZXNzLmdldFJvb3REaXIoZWRpdG9yLmdldEJ1ZmZlcigpKVxuICAgIGlmICghcm9vdERpcikgeyByZXR1cm4gfVxuICAgIGNvbnN0IHVyaSA9IHJvb3REaXIuZ2V0RmlsZShmbikuZ2V0UGF0aCgpIHx8IGZuXG4gICAgYXRvbS53b3Jrc3BhY2Uub3Blbih1cmksIHtcbiAgICAgICAgaW5pdGlhbExpbmU6IHBhcnNlSW50KGxpbmUsIDEwKSAtIDEsXG4gICAgICAgIGluaXRpYWxDb2x1bW46IHBhcnNlSW50KGNvbCwgMTApIC0gMVxuICAgICAgfVxuICAgIClcbiAgfVxuXG4gIHByaXZhdGUgYXN5bmMgaW5zZXJ0SW1wb3J0Q29tbWFuZCAoe2N1cnJlbnRUYXJnZXQsIGRldGFpbH06IElFdmVudERlc2MpIHtcbiAgICBjb25zdCBlZGl0b3IgPSBjdXJyZW50VGFyZ2V0LmdldE1vZGVsKClcbiAgICBjb25zdCBidWZmZXIgPSBlZGl0b3IuZ2V0QnVmZmVyKClcbiAgICBjb25zdCBldnIgPSB0aGlzLnVwaS5nZXRFdmVudFJhbmdlKGVkaXRvciwgZGV0YWlsKVxuICAgIGlmICghZXZyKSB7IHJldHVybiB9XG4gICAgY29uc3Qge2NyYW5nZX0gPSBldnJcbiAgICBjb25zdCBsaW5lcyA9IGF3YWl0IHRoaXMucHJvY2Vzcy5maW5kU3ltYm9sUHJvdmlkZXJzSW5CdWZmZXIoZWRpdG9yLCBjcmFuZ2UpXG4gICAgY29uc3QgbW9kID0gYXdhaXQgaW1wb3J0TGlzdFZpZXcobGluZXMpXG4gICAgaWYgKG1vZCkge1xuICAgICAgY29uc3QgcGkgPSBhd2FpdCBuZXcgUHJvbWlzZTx7cG9zOiBBdG9tVHlwZXMuUG9pbnQsIGluZGVudDogc3RyaW5nLCBlbmQ6IHN0cmluZ30+KChyZXNvbHZlKSA9PiB7XG4gICAgICAgIGJ1ZmZlci5iYWNrd2FyZHNTY2FuKC9eKFxccyopKGltcG9ydHxtb2R1bGUpLywgKHsgbWF0Y2gsIHJhbmdlLCBzdG9wIH0pID0+IHtcbiAgICAgICAgICBsZXQgaW5kZW50ID0gJydcbiAgICAgICAgICBzd2l0Y2ggKG1hdGNoWzJdKSB7XG4gICAgICAgICAgICBjYXNlICdpbXBvcnQnOlxuICAgICAgICAgICAgICBpbmRlbnQgPSBgXFxuJHttYXRjaFsxXX1gXG4gICAgICAgICAgICAgIGJyZWFrXG4gICAgICAgICAgICBjYXNlICdtb2R1bGUnOlxuICAgICAgICAgICAgICBpbmRlbnQgPSBgXFxuXFxuJHttYXRjaFsxXX1gXG4gICAgICAgICAgICAgIGJyZWFrXG4gICAgICAgICAgfVxuICAgICAgICAgIHJlc29sdmUoe3BvczogYnVmZmVyLnJhbmdlRm9yUm93KHJhbmdlLnN0YXJ0LnJvdykuZW5kLCBpbmRlbnQsIGVuZDogJyd9KVxuICAgICAgICB9KVxuICAgICAgICAvLyBub3RoaW5nIGZvdW5kXG4gICAgICAgIHJlc29sdmUoe1xuICAgICAgICAgIHBvczogYnVmZmVyLmdldEZpcnN0UG9zaXRpb24oKSxcbiAgICAgICAgICBpbmRlbnQ6ICcnLFxuICAgICAgICAgIGVuZDogJ1xcbidcbiAgICAgICAgfSlcbiAgICAgIH0pXG4gICAgICBlZGl0b3Iuc2V0VGV4dEluQnVmZmVyUmFuZ2UoW3BpLnBvcywgcGkucG9zXSwgYCR7cGkuaW5kZW50fWltcG9ydCAke21vZH0ke3BpLmVuZH1gKVxuICAgIH1cbiAgfVxuXG4gIHByaXZhdGUgYXN5bmMgdHlwZVRvb2x0aXAgKGU6IEF0b21UeXBlcy5UZXh0RWRpdG9yLCBwOiBBdG9tVHlwZXMuUmFuZ2UpIHtcbiAgICBjb25zdCB7cmFuZ2UsIHR5cGV9ID0gYXdhaXQgdGhpcy5wcm9jZXNzLmdldFR5cGVJbkJ1ZmZlcihlLmdldEJ1ZmZlcigpLCBwKVxuICAgIHJldHVybiB7XG4gICAgICAgIHJhbmdlLFxuICAgICAgICB0ZXh0OiB7XG4gICAgICAgICAgdGV4dDogdHlwZSxcbiAgICAgICAgICBoaWdobGlnaHRlcjpcbiAgICAgICAgICAgIGF0b20uY29uZmlnLmdldCgnaGFza2VsbC1naGMtbW9kLmhpZ2hsaWdodFRvb2x0aXBzJykgP1xuICAgICAgICAgICAgICAnaGludC50eXBlLmhhc2tlbGwnIDogdW5kZWZpbmVkXG4gICAgICAgIH1cbiAgICAgIH1cbiAgfVxuXG4gIHByaXZhdGUgYXN5bmMgaW5mb1Rvb2x0aXAgKGU6IEF0b21UeXBlcy5UZXh0RWRpdG9yLCBwOiBBdG9tVHlwZXMuUmFuZ2UpIHtcbiAgICBjb25zdCB7cmFuZ2UsIGluZm99ID0gYXdhaXQgdGhpcy5wcm9jZXNzLmdldEluZm9JbkJ1ZmZlcihlLCBwKVxuICAgIHJldHVybiB7XG4gICAgICAgIHJhbmdlLFxuICAgICAgICB0ZXh0OiB7XG4gICAgICAgICAgdGV4dDogaW5mbyxcbiAgICAgICAgICBoaWdobGlnaHRlcjpcbiAgICAgICAgICAgIGF0b20uY29uZmlnLmdldCgnaGFza2VsbC1naGMtbW9kLmhpZ2hsaWdodFRvb2x0aXBzJykgP1xuICAgICAgICAgICAgICAnc291cmNlLmhhc2tlbGwnIDogdW5kZWZpbmVkXG4gICAgICAgIH1cbiAgICAgIH1cbiAgfVxuXG4gIHByaXZhdGUgYXN5bmMgaW5mb1R5cGVUb29sdGlwIChlOiBBdG9tVHlwZXMuVGV4dEVkaXRvciwgcDogQXRvbVR5cGVzLlJhbmdlKSB7XG4gICAgdHJ5IHtcbiAgICAgIHJldHVybiBhd2FpdCB0aGlzLmluZm9Ub29sdGlwKGUsIHApXG4gICAgfSBjYXRjaCAoZSkge1xuICAgICAgcmV0dXJuIHRoaXMudHlwZVRvb2x0aXAoZSwgcClcbiAgICB9XG4gIH1cblxuICBwcml2YXRlIGFzeW5jIHR5cGVJbmZvVG9vbHRpcCAoZTogQXRvbVR5cGVzLlRleHRFZGl0b3IsIHA6IEF0b21UeXBlcy5SYW5nZSkge1xuICAgIHRyeSB7XG4gICAgICByZXR1cm4gYXdhaXQgdGhpcy50eXBlVG9vbHRpcChlLCBwKVxuICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgIHJldHVybiB0aGlzLmluZm9Ub29sdGlwKGUsIHApXG4gICAgfVxuICB9XG5cbiAgcHJpdmF0ZSBhc3luYyB0eXBlQW5kSW5mb1Rvb2x0aXAgKGU6IEF0b21UeXBlcy5UZXh0RWRpdG9yLCBwOiBBdG9tVHlwZXMuUmFuZ2UpIHtcbiAgICBjb25zdCB0eXBlUCA9IHRoaXMudHlwZVRvb2x0aXAoZSwgcCkuY2F0Y2goKCkgPT4gdW5kZWZpbmVkKVxuICAgIGNvbnN0IGluZm9QID0gdGhpcy5pbmZvVG9vbHRpcChlLCBwKS5jYXRjaCgoKSA9PiB1bmRlZmluZWQpXG4gICAgY29uc3QgW3R5cGUsIGluZm9dID0gYXdhaXQgUHJvbWlzZS5hbGwoW3R5cGVQLCBpbmZvUF0pXG4gICAgbGV0IHJhbmdlLCB0ZXh0OiBzdHJpbmdcbiAgICBpZiAodHlwZSAmJiBpbmZvKSB7XG4gICAgICByYW5nZSA9IHR5cGUucmFuZ2UudW5pb24oaW5mby5yYW5nZSlcbiAgICAgIHRleHQgPSBgOjogJHt0eXBlLnRleHQudGV4dH1cXG4ke2luZm8udGV4dC50ZXh0fWBcbiAgICB9IGVsc2UgaWYgKHR5cGUpIHtcbiAgICAgIHJhbmdlID0gdHlwZS5yYW5nZVxuICAgICAgdGV4dCA9IHR5cGUudGV4dC50ZXh0XG4gICAgfSBlbHNlIGlmIChpbmZvKSB7XG4gICAgICByYW5nZSA9IGluZm8ucmFuZ2VcbiAgICAgIHRleHQgPSBpbmZvLnRleHQudGV4dFxuICAgIH0gZWxzZSB7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoJ0dvdCBuZWl0aGVyIHR5cGUgbm9yIGluZm8nKVxuICAgIH1cbiAgICBjb25zdCBoaWdobGlnaHRlciA9IGF0b20uY29uZmlnLmdldCgnaGFza2VsbC1naGMtbW9kLmhpZ2hsaWdodFRvb2x0aXBzJykgPyAnc291cmNlLmhhc2tlbGwnIDogdW5kZWZpbmVkXG4gICAgcmV0dXJuIHsgcmFuZ2UsIHRleHQ6IHsgdGV4dCwgaGlnaGxpZ2h0ZXIgfSB9XG4gIH1cblxuICBwcml2YXRlIHNldEhpZ2hsaWdodGVyICgpIHtcbiAgICBpZiAoYXRvbS5jb25maWcuZ2V0KCdoYXNrZWxsLWdoYy1tb2QuaGlnaGxpZ2h0TWVzc2FnZXMnKSkge1xuICAgICAgcmV0dXJuIChtOiBVUEkuSVJlc3VsdEl0ZW0pOiBVUEkuSVJlc3VsdEl0ZW0gPT4ge1xuICAgICAgICBpZiAodHlwZW9mIG0ubWVzc2FnZSA9PT0gJ3N0cmluZycpIHtcbiAgICAgICAgICBjb25zdCBtZXNzYWdlOiBVUEkuSU1lc3NhZ2VUZXh0ID0ge1xuICAgICAgICAgICAgdGV4dDogbS5tZXNzYWdlLFxuICAgICAgICAgICAgaGlnaGxpZ2h0ZXI6ICdoaW50Lm1lc3NhZ2UuaGFza2VsbCdcbiAgICAgICAgICB9XG4gICAgICAgICAgcmV0dXJuIHsuLi5tLCBtZXNzYWdlfVxuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIHJldHVybiBtXG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9IGVsc2Uge1xuICAgICAgcmV0dXJuIChtOiBVUEkuSVJlc3VsdEl0ZW0pID0+IG1cbiAgICB9XG4gIH1cblxuICBwcml2YXRlIHNldE1lc3NhZ2VzIChtZXNzYWdlczogVVBJLklSZXN1bHRJdGVtW10pIHtcbiAgICB0aGlzLmxhc3RNZXNzYWdlcyA9IG1lc3NhZ2VzLm1hcCh0aGlzLnNldEhpZ2hsaWdodGVyKCkpXG4gICAgdGhpcy5zZW5kTWVzc2FnZXMoKVxuICB9XG5cbiAgcHJpdmF0ZSBzZW5kTWVzc2FnZXMgKCkge1xuICAgIHRoaXMudXBpLnNldE1lc3NhZ2VzKHRoaXMucHJvY2Vzc01lc3NhZ2VzLmNvbmNhdCh0aGlzLmxhc3RNZXNzYWdlcykpXG4gIH1cblxuICBwcml2YXRlIGFzeW5jIGNoZWNrTGludCAoYnVmZmVyOiBBdG9tVHlwZXMuVGV4dEJ1ZmZlciwgb3B0OiAnU2F2ZScgfCAnQ2hhbmdlJywgZmFzdDogYm9vbGVhbiA9IGZhbHNlKSB7XG4gICAgbGV0IHJlc1xuICAgIGlmIChhdG9tLmNvbmZpZy5nZXQoYGhhc2tlbGwtZ2hjLW1vZC5vbiR7b3B0fUNoZWNrYCkgJiYgYXRvbS5jb25maWcuZ2V0KGBoYXNrZWxsLWdoYy1tb2Qub24ke29wdH1MaW50YCkpIHtcbiAgICAgIHJlcyA9IGF3YWl0IHRoaXMucHJvY2Vzcy5kb0NoZWNrQW5kTGludChidWZmZXIsIGZhc3QpXG4gICAgfSBlbHNlIGlmIChhdG9tLmNvbmZpZy5nZXQoYGhhc2tlbGwtZ2hjLW1vZC5vbiR7b3B0fUNoZWNrYCkpIHtcbiAgICAgIHJlcyA9IGF3YWl0IHRoaXMucHJvY2Vzcy5kb0NoZWNrQnVmZmVyKGJ1ZmZlciwgZmFzdClcbiAgICB9IGVsc2UgaWYgKGF0b20uY29uZmlnLmdldChgaGFza2VsbC1naGMtbW9kLm9uJHtvcHR9TGludGApKSB7XG4gICAgICByZXMgPSBhd2FpdCB0aGlzLnByb2Nlc3MuZG9MaW50QnVmZmVyKGJ1ZmZlciwgZmFzdClcbiAgICB9XG4gICAgaWYgKHJlcykge1xuICAgICAgdGhpcy5zZXRNZXNzYWdlcyhyZXMpXG4gICAgfVxuICB9XG5cbiAgcHJpdmF0ZSBjb25zb2xlUmVwb3J0IChhcmc6IElFcnJvckNhbGxiYWNrQXJncykge1xuICAgIFV0aWwuZXJyb3IoVXRpbC5mb3JtYXRFcnJvcihhcmcpLCBVdGlsLmdldEVycm9yRGV0YWlsKGFyZykpXG4gIH1cblxuICBwcml2YXRlIGhhbmRsZVByb2Nlc3NFcnJvciAoYXJnOiBJRXJyb3JDYWxsYmFja0FyZ3MpIHtcbiAgICBzd2l0Y2ggKHRoaXMubXNnQmFja2VuZCkge1xuICAgICAgY2FzZSBNc2dCYWNrZW5kLlVQSTpcbiAgICAgICAgdGhpcy5wcm9jZXNzTWVzc2FnZXMucHVzaCh7XG4gICAgICAgICAgbWVzc2FnZTogVXRpbC5mb3JtYXRFcnJvcihhcmcpXG4gICAgICAgICAgICArICdcXG5cXG5TZWUgY29uc29sZSAoVmlldyDihpIgRGV2ZWxvcGVyIOKGkiBUb2dnbGUgRGV2ZWxvcGVyIFRvb2xzIOKGkiBDb25zb2xlIHRhYikgZm9yIGRldGFpbHMuJyxcbiAgICAgICAgICBzZXZlcml0eTogJ2doYy1tb2QnXG4gICAgICAgIH0pXG4gICAgICAgIHRoaXMuY29uc29sZVJlcG9ydChhcmcpXG4gICAgICAgIHRoaXMuc2VuZE1lc3NhZ2VzKClcbiAgICAgICAgYnJlYWtcbiAgICAgIGNhc2UgTXNnQmFja2VuZC5Db25zb2xlOlxuICAgICAgICB0aGlzLmNvbnNvbGVSZXBvcnQoYXJnKVxuICAgICAgICBicmVha1xuICAgICAgY2FzZSBNc2dCYWNrZW5kLlBvcHVwOlxuICAgICAgICB0aGlzLmNvbnNvbGVSZXBvcnQoYXJnKVxuICAgICAgICBhdG9tLm5vdGlmaWNhdGlvbnMuYWRkRXJyb3IoVXRpbC5mb3JtYXRFcnJvcihhcmcpLCB7XG4gICAgICAgICAgZGV0YWlsOiBVdGlsLmdldEVycm9yRGV0YWlsKGFyZyksXG4gICAgICAgICAgZGlzbWlzc2FibGU6IHRydWVcbiAgICAgICAgfSlcbiAgICAgICAgYnJlYWtcbiAgICB9XG4gIH1cblxuICBwcml2YXRlIGhhbmRsZVByb2Nlc3NXYXJuaW5nICh3YXJuaW5nOiBzdHJpbmcpIHtcbiAgICBzd2l0Y2ggKHRoaXMubXNnQmFja2VuZCkge1xuICAgICAgY2FzZSBNc2dCYWNrZW5kLlVQSTpcbiAgICAgICAgdGhpcy5wcm9jZXNzTWVzc2FnZXMucHVzaCh7XG4gICAgICAgICAgbWVzc2FnZTogd2FybmluZyxcbiAgICAgICAgICBzZXZlcml0eTogJ2doYy1tb2QnXG4gICAgICAgIH0pXG4gICAgICAgIFV0aWwud2Fybih3YXJuaW5nKVxuICAgICAgICB0aGlzLnNlbmRNZXNzYWdlcygpXG4gICAgICAgIGJyZWFrXG4gICAgICBjYXNlIE1zZ0JhY2tlbmQuQ29uc29sZTpcbiAgICAgICAgVXRpbC53YXJuKHdhcm5pbmcpXG4gICAgICAgIGJyZWFrXG4gICAgICBjYXNlIE1zZ0JhY2tlbmQuUG9wdXA6XG4gICAgICAgIFV0aWwud2Fybih3YXJuaW5nKVxuICAgICAgICBhdG9tLm5vdGlmaWNhdGlvbnMuYWRkV2FybmluZyh3YXJuaW5nLCB7XG4gICAgICAgICAgZGlzbWlzc2FibGU6IGZhbHNlXG4gICAgICAgIH0pXG4gICAgICAgIGJyZWFrXG4gICAgfVxuICB9XG59XG4iXX0=