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
    'error': {},
    'warning': {},
    'lint': {},
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
class UPIConsumer {
    constructor(register, process) {
        this.process = process;
        this.disposables = new atom_1.CompositeDisposable();
        this.processMessages = [];
        this.lastMessages = [];
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
        this.upi = register({
            name: 'haskell-ghc-mod',
            menu: mainMenu,
            messageTypes,
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
    handleProcessError(arg) {
        this.processMessages.push({
            message: Util.formatError(arg)
                + '\n\nSee console (View → Developer → Toggle Developer Tools → Console tab) for details.',
            severity: 'ghc-mod'
        });
        console.error(Util.formatError(arg), Util.getErrorDetail(arg));
        this.sendMessages();
    }
    handleProcessWarning(warning) {
        this.processMessages.push({
            message: warning,
            severity: 'ghc-mod'
        });
        Util.warn(warning);
        this.sendMessages();
    }
}
exports.UPIConsumer = UPIConsumer;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidXBpLWNvbnN1bWVyLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vc3JjL3VwaS1jb25zdW1lci50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOzs7Ozs7Ozs7O0FBQUEsK0JBQWlEO0FBRWpELCtEQUF1RDtBQUN2RCwrQkFBK0I7QUFFL0IsTUFBTSxZQUFZLEdBQUc7SUFDbkIsT0FBTyxFQUFFLEVBQUU7SUFDWCxTQUFTLEVBQUUsRUFBRTtJQUNiLE1BQU0sRUFBRSxFQUFFO0lBQ1YsU0FBUyxFQUFFO1FBQ1QsU0FBUyxFQUFFLEtBQUs7UUFDaEIsVUFBVSxFQUFFLElBQUk7S0FDakI7Q0FDRixDQUFBO0FBRUQsTUFBTSxZQUFZLEdBQUcsMkNBQTJDLENBQUE7QUFFaEUsTUFBTSxRQUFRLEdBQUc7SUFDZixLQUFLLEVBQUUsU0FBUztJQUNoQixJQUFJLEVBQUU7UUFDSixFQUFDLEtBQUssRUFBRSxPQUFPLEVBQUUsT0FBTyxFQUFFLDRCQUE0QixFQUFDO1FBQ3ZELEVBQUMsS0FBSyxFQUFFLE1BQU0sRUFBRSxPQUFPLEVBQUUsMkJBQTJCLEVBQUM7UUFDckQsRUFBQyxLQUFLLEVBQUUsY0FBYyxFQUFFLE9BQU8sRUFBRSxrQ0FBa0MsRUFBQztLQUNyRTtDQUNGLENBQUE7QUFFRDtJQTBDRSxZQUFhLFFBQThCLEVBQVUsT0FBdUI7UUFBdkIsWUFBTyxHQUFQLE9BQU8sQ0FBZ0I7UUF4Q3BFLGdCQUFXLEdBQXdCLElBQUksMEJBQW1CLEVBQUUsQ0FBQTtRQUM1RCxvQkFBZSxHQUFzQixFQUFFLENBQUE7UUFDdkMsaUJBQVksR0FBc0IsRUFBRSxDQUFBO1FBRXBDLG9CQUFlLEdBQUc7WUFDeEIsMkJBQTJCLEVBQUUsSUFBSSxDQUFDLGNBQWMsQ0FBQyxJQUFJLENBQUMsV0FBVyxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsQ0FBQztZQUM3RSwyQkFBMkIsRUFBRSxJQUFJLENBQUMsY0FBYyxDQUFDLElBQUksQ0FBQyxXQUFXLENBQUMsSUFBSSxD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QTtRQUVGLE9BQU8sQ0FBQyxLQUFLLENBQUMsSUFBSSxDQUFDLFdBQVcsQ0FBQyxHQUFHLENBQUMsRUFBRSxJQUFJLENBQUMsY0FBYyxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUE7UUFDOUQsSUFBSSxDQUFDLFlBQVksRUFBRSxDQUFBO0lBQ3JCLENBQUM7SUFFTyxvQkFBb0IsQ0FBRSxPQUFlO1FBQzNDLElBQUksQ0FBQyxlQUFlLENBQUMsSUFBSSxDQUFDO1lBQ3hCLE9BQU8sRUFBRSxPQUFPO1lBQ2hCLFFBQVEsRUFBRSxTQUFTO1NBQ3BCLENBQUMsQ0FBQTtRQUNGLElBQUksQ0FBQyxJQUFJLENBQUMsT0FBTyxDQUFDLENBQUE7UUFDbEIsSUFBSSxDQUFDLFlBQVksRUFBRSxDQUFBO0lBQ3JCLENBQUM7Q0FDRjtBQWxXRCxrQ0FrV0MiLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgeyBDb21wb3NpdGVEaXNwb3NhYmxlLCBSYW5nZSB9IGZyb20gJ2F0b20nXG5pbXBvcnQge0doY01vZGlQcm9jZXNzLCBJRXJyb3JDYWxsYmFja0FyZ3N9IGZyb20gJy4vZ2hjLW1vZCdcbmltcG9ydCB7aW1wb3J0TGlzdFZpZXd9IGZyb20gJy4vdmlld3MvaW1wb3J0LWxpc3QtdmlldydcbmltcG9ydCBVdGlsID0gcmVxdWlyZSgnLi91dGlsJylcblxuY29uc3QgbWVzc2FnZVR5cGVzID0ge1xuICAnZXJyb3InOiB7fSxcbiAgJ3dhcm5pbmcnOiB7fSxcbiAgJ2xpbnQnOiB7fSxcbiAgJ2doYy1tb2QnOiB7XG4gICAgdXJpRmlsdGVyOiBmYWxzZSxcbiAgICBhdXRvU2Nyb2xsOiB0cnVlXG4gIH1cbn1cblxuY29uc3QgY29udGV4dFNjb3BlID0gJ2F0b20tdGV4dC1lZGl0b3JbZGF0YS1ncmFtbWFyfj1cImhhc2tlbGxcIl0nXG5cbmNvbnN0IG1haW5NZW51ID0ge1xuICBsYWJlbDogJ2doYy1tb2QnLFxuICBtZW51OiBbXG4gICAge2xhYmVsOiAnQ2hlY2snLCBjb21tYW5kOiAnaGFza2VsbC1naGMtbW9kOmNoZWNrLWZpbGUnfSxcbiAgICB7bGFiZWw6ICdMaW50JywgY29tbWFuZDogJ2hhc2tlbGwtZ2hjLW1vZDpsaW50LWZpbGUnfSxcbiAgICB7bGFiZWw6ICdTdG9wIEJhY2tlbmQnLCBjb21tYW5kOiAnaGFza2VsbC1naGMtbW9kOnNodXRkb3duLWJhY2tlbmQnfVxuICBdXG59XG5cbmV4cG9ydCBjbGFzcyBVUElDb25zdW1lciB7XG4gIHByaXZhdGUgdXBpOiBVUEkuSVVQSUluc3RhbmNlXG4gIHByaXZhdGUgZGlzcG9zYWJsZXM6IENvbXBvc2l0ZURpc3Bvc2FibGUgPSBuZXcgQ29tcG9zaXRlRGlzcG9zYWJsZSgpXG4gIHByaXZhdGUgcHJvY2Vzc01lc3NhZ2VzOiBVUEkuSVJlc3VsdEl0ZW1bXSA9IFtdXG4gIHByaXZhdGUgbGFzdE1lc3NhZ2VzOiBVUEkuSVJlc3VsdEl0ZW1bXSA9IFtdXG5cbiAgcHJpdmF0ZSBjb250ZXh0Q29tbWFuZHMgPSB7XG4gICAgJ2hhc2tlbGwtZ2hjLW1vZDpzaG93LXR5cGUnOiB0aGlzLnRvb2x0aXBDb21tYW5kKHRoaXMudHlwZVRvb2x0aXAuYmluZCh0aGlzKSksXG4gICAgJ2hhc2tlbGwtZ2hjLW1vZDpzaG93LWluZm8nOiB0aGlzLnRvb2x0aXBDb21tYW5kKHRoaXMuaW5mb1Rvb2x0aXAuYmluZCh0aGlzKSksXG4gICAgJ2hhc2tlbGwtZ2hjLW1vZDpjYXNlLXNwbGl0JzogdGhpcy5jYXNlU3BsaXRDb21tYW5kLmJpbmQodGhpcyksXG4gICAgJ2hhc2tlbGwtZ2hjLW1vZDpzaWctZmlsbCc6IHRoaXMuc2lnRmlsbENvbW1hbmQuYmluZCh0aGlzKSxcbiAgICAnaGFza2VsbC1naGMtbW9kOmdvLXRvLWRlY2xhcmF0aW9uJzogdGhpcy5nb1RvRGVjbENvbW1hbmQuYmluZCh0aGlzKSxcbiAgICAnaGFza2VsbC1naGMtbW9kOnNob3ctaW5mby1mYWxsYmFjay10by10eXBlJzogdGhpcy50b29sdGlwQ29tbWFuZCh0aGlzLmluZm9UeXBlVG9vbHRpcC5iaW5kKHRoaXMpKSxcbiAgICAnaGFza2VsbC1naGMtbW9kOnNob3ctdHlwZS1mYWxsYmFjay10by1pbmZvJzogdGhpcy50b29sdGlwQ29tbWFuZCh0aGlzLnR5cGVJbmZvVG9vbHRpcC5iaW5kKHRoaXMpKSxcbiAgICAnaGFza2VsbC1naGMtbW9kOnNob3ctdHlwZS1hbmQtaW5mbyc6IHRoaXMudG9vbHRpcENvbW1hbmQodGhpcy50eXBlQW5kSW5mb1Rvb2x0aXAuYmluZCh0aGlzKSksXG4gICAgJ2hhc2tlbGwtZ2hjLW1vZDppbnNlcnQtdHlwZSc6IHRoaXMuaW5zZXJ0VHlwZUNvbW1hbmQuYmluZCh0aGlzKSxcbiAgICAnaGFza2VsbC1naGMtbW9kOmluc2VydC1pbXBvcnQnOiB0aGlzLmluc2VydEltcG9ydENvbW1hbmQuYmluZCh0aGlzKVxuICB9XG5cbiAgcHJpdmF0ZSBnbG9iYWxDb21tYW5kcyA9IHtcbiAgICAnaGFza2VsbC1naGMtbW9kOmNoZWNrLWZpbGUnOiB0aGlzLmNoZWNrQ29tbWFuZC5iaW5kKHRoaXMpLFxuICAgICdoYXNrZWxsLWdoYy1tb2Q6bGludC1maWxlJzogdGhpcy5saW50Q29tbWFuZC5iaW5kKHRoaXMpLFxuICAgIC4uLnRoaXMuY29udGV4dENvbW1hbmRzXG4gIH1cblxuICBwcml2YXRlIGNvbnRleHRNZW51OiB7XG4gICAgbGFiZWw6IHN0cmluZywgc3VibWVudTogQXJyYXk8e2xhYmVsOiBzdHJpbmcsIGNvbW1hbmQ6IGtleW9mIFVQSUNvbnN1bWVyWydjb250ZXh0Q29tbWFuZHMnXX0+XG4gIH0gPSB7XG4gICAgbGFiZWw6ICdnaGMtbW9kJyxcbiAgICBzdWJtZW51OlxuICAgICAgW1xuICAgICAgICB7bGFiZWw6ICdTaG93IFR5cGUnLCBjb21tYW5kOiAnaGFza2VsbC1naGMtbW9kOnNob3ctdHlwZSd9LFxuICAgICAgICB7bGFiZWw6ICdTaG93IEluZm8nLCBjb21tYW5kOiAnaGFza2VsbC1naGMtbW9kOnNob3ctaW5mbyd9LFxuICAgICAgICB7bGFiZWw6ICdTaG93IFR5cGUgQW5kIEluZm8nLCBjb21tYW5kOiAnaGFza2VsbC1naGMtbW9kOnNob3ctdHlwZS1hbmQtaW5mbyd9LFxuICAgICAgICB7bGFiZWw6ICdDYXNlIFNwbGl0JywgY29tbWFuZDogJ2hhc2tlbGwtZ2hjLW1vZDpjYXNlLXNwbGl0J30sXG4gICAgICAgIHtsYWJlbDogJ1NpZyBGaWxsJywgY29tbWFuZDogJ2hhc2tlbGwtZ2hjLW1vZDpzaWctZmlsbCd9LFxuICAgICAgICB7bGFiZWw6ICdJbnNlcnQgVHlwZScsIGNvbW1hbmQ6ICdoYXNrZWxsLWdoYy1tb2Q6aW5zZXJ0LXR5cGUnfSxcbiAgICAgICAge2xhYmVsOiAnSW5zZXJ0IEltcG9ydCcsIGNvbW1hbmQ6ICdoYXNrZWxsLWdoYy1tb2Q6aW5zZXJ0LWltcG9ydCd9LFxuICAgICAgICB7bGFiZWw6ICdHbyBUbyBEZWNsYXJhdGlvbicsIGNvbW1hbmQ6ICdoYXNrZWxsLWdoYy1tb2Q6Z28tdG8tZGVjbGFyYXRpb24nfVxuICAgICAgXVxuICB9XG5cbiAgY29uc3RydWN0b3IgKHJlZ2lzdGVyOiBVUEkuSVVQSVJlZ2lzdHJhdGlvbiwgcHJpdmF0ZSBwcm9jZXNzOiBHaGNNb2RpUHJvY2Vzcykge1xuICAgIHRoaXMuZGlzcG9zYWJsZXMuYWRkKFxuICAgICAgdGhpcy5wcm9jZXNzLm9uRXJyb3IodGhpcy5oYW5kbGVQcm9jZXNzRXJyb3IuYmluZCh0aGlzKSksXG4gICAgICB0aGlzLnByb2Nlc3Mub25XYXJuaW5nKHRoaXMuaGFuZGxlUHJvY2Vzc1dhcm5pbmcuYmluZCh0aGlzKSksXG4gICAgKVxuXG4gICAgdGhpcy51cGkgPSByZWdpc3Rlcih7XG4gICAgICBuYW1lOiAnaGFza2VsbC1naGMtbW9kJyxcbiAgICAgIG1lbnU6IG1haW5NZW51LFxuICAgICAgbWVzc2FnZVR5cGVzLFxuICAgICAgdG9vbHRpcDogdGhpcy5zaG91bGRTaG93VG9vbHRpcC5iaW5kKHRoaXMpLFxuICAgICAgZXZlbnRzOiB7XG4gICAgICAgIG9uRGlkU2F2ZUJ1ZmZlcjogYXN5bmMgKGJ1ZmZlcikgPT5cbiAgICAgICAgICB0aGlzLmNoZWNrTGludChidWZmZXIsICdTYXZlJyksXG4gICAgICAgIG9uRGlkU3RvcENoYW5naW5nOiBhc3luYyAoYnVmZmVyKSA9PlxuICAgICAgICAgIHRoaXMuY2hlY2tMaW50KGJ1ZmZlciwgJ0NoYW5nZScsIHRydWUpXG4gICAgICB9XG4gICAgfSlcblxuICAgIHRoaXMuZGlzcG9zYWJsZXMuYWRkKFxuICAgICAgdGhpcy51cGksXG4gICAgICB0aGlzLnByb2Nlc3Mub25CYWNrZW5kQWN0aXZlKCgpID0+IHRoaXMudXBpLnNldFN0YXR1cyh7c3RhdHVzOiAncHJvZ3Jlc3MnLCBkZXRhaWw6ICcnfSkpLFxuICAgICAgdGhpcy5wcm9jZXNzLm9uQmFja2VuZElkbGUoKCkgPT4gdGhpcy51cGkuc2V0U3RhdHVzKHtzdGF0dXM6ICdyZWFkeScsIGRldGFpbDogJyd9KSksXG4gICAgICBhdG9tLmNvbW1hbmRzLmFkZChjb250ZXh0U2NvcGUsIHRoaXMuZ2xvYmFsQ29tbWFuZHMpLFxuICAgIClcbiAgICBjb25zdCBjbSA9IHt9XG4gICAgY21bY29udGV4dFNjb3BlXSA9IFt0aGlzLmNvbnRleHRNZW51XVxuICAgIHRoaXMuZGlzcG9zYWJsZXMuYWRkKGF0b20uY29udGV4dE1lbnUuYWRkKGNtKSlcbiAgfVxuXG4gIHB1YmxpYyBkaXNwb3NlICgpIHtcbiAgICB0aGlzLmRpc3Bvc2FibGVzLmRpc3Bvc2UoKVxuICB9XG5cbiAgcHJpdmF0ZSBhc3luYyBzaG91bGRTaG93VG9vbHRpcCAoXG4gICAgZWRpdG9yOiBBdG9tVHlwZXMuVGV4dEVkaXRvciwgY3JhbmdlOiBBdG9tVHlwZXMuUmFuZ2UsIHR5cGU6IFVQSS5URXZlbnRSYW5nZVR5cGVcbiAgKTogUHJvbWlzZTxVUEkuSVRvb2x0aXBEYXRhIHwgdW5kZWZpbmVkPiB7XG4gICAgICBpZiAodHlwZSA9PT0gJ21vdXNlJykge1xuICAgICAgICBjb25zdCB0ID0gYXRvbS5jb25maWcuZ2V0KCdoYXNrZWxsLWdoYy1tb2Qub25Nb3VzZUhvdmVyU2hvdycpXG4gICAgICAgIGlmICh0KSB7XG4gICAgICAgICAgcmV0dXJuIHRoaXNbYCR7dH1Ub29sdGlwYF0oZWRpdG9yLCBjcmFuZ2UpXG4gICAgICAgIH1cbiAgICAgIH0gZWxzZSBpZiAodHlwZSA9PT0gJ3NlbGVjdGlvbicpIHtcbiAgICAgICAgY29uc3QgdCA9IGF0b20uY29uZmlnLmdldCgnaGFza2VsbC1naGMtbW9kLm9uU2VsZWN0aW9uU2hvdycpXG4gICAgICAgIGlmICh0KSB7XG4gICAgICAgICAgcmV0dXJuIHRoaXNbYCR7dH1Ub29sdGlwYF0oZWRpdG9yLCBjcmFuZ2UpXG4gICAgICAgIH1cbiAgICAgIH1cbiAgfVxuXG4gIHByaXZhdGUgYXN5bmMgY2hlY2tDb21tYW5kICh7Y3VycmVudFRhcmdldH06IElFdmVudERlc2MpIHtcbiAgICBjb25zdCBlZGl0b3IgPSBjdXJyZW50VGFyZ2V0LmdldE1vZGVsKClcbiAgICBjb25zdCByZXMgPSBhd2FpdCB0aGlzLnByb2Nlc3MuZG9DaGVja0J1ZmZlcihlZGl0b3IuZ2V0QnVmZmVyKCkpXG4gICAgdGhpcy5zZXRNZXNzYWdlcyhyZXMpXG4gIH1cblxuICBwcml2YXRlIGFzeW5jIGxpbnRDb21tYW5kICh7Y3VycmVudFRhcmdldH06IElFdmVudERlc2MpIHtcbiAgICBjb25zdCBlZGl0b3IgPSBjdXJyZW50VGFyZ2V0LmdldE1vZGVsKClcbiAgICBjb25zdCByZXMgPSBhd2FpdCB0aGlzLnByb2Nlc3MuZG9MaW50QnVmZmVyKGVkaXRvci5nZXRCdWZmZXIoKSlcbiAgICB0aGlzLnNldE1lc3NhZ2VzKHJlcylcbiAgfVxuXG4gIHByaXZhdGUgdG9vbHRpcENvbW1hbmQgKHRvb2x0aXBmdW46IChlOiBBdG9tVHlwZXMuVGV4dEVkaXRvciwgcDogQXRvbVR5cGVzLlJhbmdlKSA9PiBQcm9taXNlPFVQSS5JVG9vbHRpcERhdGE+KSB7XG4gICAgcmV0dXJuICh7Y3VycmVudFRhcmdldCwgZGV0YWlsfTogSUV2ZW50RGVzYykgPT5cbiAgICAgIHRoaXMudXBpLnNob3dUb29sdGlwKHtcbiAgICAgICAgZWRpdG9yOiBjdXJyZW50VGFyZ2V0LmdldE1vZGVsKCksXG4gICAgICAgIGRldGFpbCxcbiAgICAgICAgYXN5bmMgdG9vbHRpcCAoY3JhbmdlKSB7XG4gICAgICAgICAgcmV0dXJuIHRvb2x0aXBmdW4oY3VycmVudFRhcmdldC5nZXRNb2RlbCgpLCBjcmFuZ2UpXG4gICAgICAgIH1cbiAgICAgIH0pXG4gIH1cblxuICBwcml2YXRlIGFzeW5jIGluc2VydFR5cGVDb21tYW5kICh7Y3VycmVudFRhcmdldCwgZGV0YWlsfTogSUV2ZW50RGVzYykge1xuICAgIGNvbnN0IGVkaXRvciA9IGN1cnJlbnRUYXJnZXQuZ2V0TW9kZWwoKVxuICAgIGNvbnN0IGVyID0gdGhpcy51cGkuZ2V0RXZlbnRSYW5nZShlZGl0b3IsIGRldGFpbClcbiAgICBpZiAoZXIgPT09IHVuZGVmaW5lZCkgeyByZXR1cm4gfVxuICAgIGNvbnN0IHtjcmFuZ2UsIHBvc30gPSBlclxuICAgIGNvbnN0IHt0eXBlfSA9IGF3YWl0IHRoaXMucHJvY2Vzcy5nZXRUeXBlSW5CdWZmZXIoZWRpdG9yLmdldEJ1ZmZlcigpLCBjcmFuZ2UpXG4gICAgY29uc3Qgc3ltSW5mbyA9IFV0aWwuZ2V0U3ltYm9sQXRQb2ludChlZGl0b3IsIHBvcylcbiAgICBpZiAoIXN5bUluZm8pIHsgcmV0dXJuIH1cbiAgICBjb25zdCB7c2NvcGUsIHJhbmdlLCBzeW1ib2x9ID0gc3ltSW5mb1xuICAgIGlmIChzY29wZS5zdGFydHNXaXRoKCdrZXl3b3JkLm9wZXJhdG9yLicpKSB7IHJldHVybiB9IC8vIGNhbid0IGNvcnJlY3RseSBoYW5kbGUgaW5maXggbm90YXRpb25cbiAgICBpZiAoZWRpdG9yLmdldFRleHRJbkJ1ZmZlclJhbmdlKFtyYW5nZS5lbmQsIGVkaXRvci5idWZmZXJSYW5nZUZvckJ1ZmZlclJvdyhyYW5nZS5lbmQucm93KS5lbmRdKS5tYXRjaCgvPS8pKSB7XG4gICAgICBsZXQgaW5kZW50ID0gZWRpdG9yLmdldFRleHRJbkJ1ZmZlclJhbmdlKFtbcmFuZ2Uuc3RhcnQucm93LCAwXSwgcmFuZ2Uuc3RhcnRdKVxuICAgICAgbGV0IGJpcmRUcmFjayA9ICcnXG4gICAgICBpZiAoZWRpdG9yLnNjb3BlRGVzY3JpcHRvckZvckJ1ZmZlclBvc2l0aW9uKHBvcykuZ2V0U2NvcGVzQXJyYXkoKS5pbmNsdWRlcygnbWV0YS5lbWJlZGRlZC5oYXNrZWxsJykpIHtcbiAgICAgICAgYmlyZFRyYWNrID0gaW5kZW50LnNsaWNlKDAsIDIpXG4gICAgICAgIGluZGVudCA9IGluZGVudC5zbGljZSgyKVxuICAgICAgfVxuICAgICAgaWYgKGluZGVudC5tYXRjaCgvXFxTLykpIHtcbiAgICAgICAgaW5kZW50ID0gaW5kZW50LnJlcGxhY2UoL1xcUy9nLCAnICcpXG4gICAgICB9XG4gICAgICBlZGl0b3Iuc2V0VGV4dEluQnVmZmVyUmFuZ2UoXG4gICAgICAgIFtyYW5nZS5zdGFydCwgcmFuZ2Uuc3RhcnRdLCBgJHtzeW1ib2x9IDo6ICR7dHlwZX1cXG4ke2JpcmRUcmFja30ke2luZGVudH1gXG4gICAgICApXG4gICAgfSBlbHNlIHtcbiAgICAgIGVkaXRvci5zZXRUZXh0SW5CdWZmZXJSYW5nZShyYW5nZSwgYCgke2VkaXRvci5nZXRUZXh0SW5CdWZmZXJSYW5nZShyYW5nZSl9IDo6ICR7dHlwZX0pYClcbiAgICB9XG4gIH1cblxuICBwcml2YXRlIGFzeW5jIGNhc2VTcGxpdENvbW1hbmQgKHtjdXJyZW50VGFyZ2V0LCBkZXRhaWx9OiBJRXZlbnREZXNjKSB7XG4gICAgY29uc3QgZWRpdG9yID0gY3VycmVudFRhcmdldC5nZXRNb2RlbCgpXG4gICAgY29uc3QgZXZyID0gdGhpcy51cGkuZ2V0RXZlbnRSYW5nZShlZGl0b3IsIGRldGFpbClcbiAgICBpZiAoIWV2cikgeyByZXR1cm4gfVxuICAgIGNvbnN0IHtjcmFuZ2V9ID0gZXZyXG4gICAgY29uc3QgcmVzID0gYXdhaXQgdGhpcy5wcm9jZXNzLmRvQ2FzZVNwbGl0KGVkaXRvci5nZXRCdWZmZXIoKSwgY3JhbmdlKVxuICAgIGZvciAoY29uc3Qge3JhbmdlLCByZXBsYWNlbWVudH0gb2YgcmVzKSB7XG4gICAgICBlZGl0b3Iuc2V0VGV4dEluQnVmZmVyUmFuZ2UocmFuZ2UsIHJlcGxhY2VtZW50KVxuICAgIH1cbiAgfVxuXG4gIHByaXZhdGUgYXN5bmMgc2lnRmlsbENvbW1hbmQgKHtjdXJyZW50VGFyZ2V0LCBkZXRhaWx9OiBJRXZlbnREZXNjKSB7XG4gICAgY29uc3QgZWRpdG9yID0gY3VycmVudFRhcmdldC5nZXRNb2RlbCgpXG4gICAgY29uc3QgZXZyID0gdGhpcy51cGkuZ2V0RXZlbnRSYW5nZShlZGl0b3IsIGRldGFpbClcbiAgICBpZiAoIWV2cikgeyByZXR1cm4gfVxuICAgIGNvbnN0IHtjcmFuZ2V9ID0gZXZyXG4gICAgY29uc3QgcmVzID0gYXdhaXQgdGhpcy5wcm9jZXNzLmRvU2lnRmlsbChlZGl0b3IuZ2V0QnVmZmVyKCksIGNyYW5nZSlcblxuICAgIGVkaXRvci50cmFuc2FjdCgoKSA9PiB7XG4gICAgICBjb25zdCB7IHR5cGUsIHJhbmdlLCBib2R5IH0gPSByZXNcbiAgICAgIGNvbnN0IHNpZyA9IGVkaXRvci5nZXRUZXh0SW5CdWZmZXJSYW5nZShyYW5nZSlcbiAgICAgIGxldCBpbmRlbnQgPSBlZGl0b3IuaW5kZW50TGV2ZWxGb3JMaW5lKHNpZylcbiAgICAgIGNvbnN0IHBvcyA9IHJhbmdlLmVuZFxuICAgICAgY29uc3QgdGV4dCA9IGBcXG4ke2JvZHl9YFxuICAgICAgaWYgKHR5cGUgPT09ICdpbnN0YW5jZScpIHtcbiAgICAgICAgaW5kZW50ICs9IDFcbiAgICAgICAgaWYgKCFzaWcuZW5kc1dpdGgoJyB3aGVyZScpKSB7XG4gICAgICAgICAgZWRpdG9yLnNldFRleHRJbkJ1ZmZlclJhbmdlKFtyYW5nZS5lbmQsIHJhbmdlLmVuZF0sICcgd2hlcmUnKVxuICAgICAgICB9XG4gICAgICB9XG4gICAgICBjb25zdCBuZXdyYW5nZSA9IGVkaXRvci5zZXRUZXh0SW5CdWZmZXJSYW5nZShbcG9zLCBwb3NdLCB0ZXh0KVxuICAgICAgbmV3cmFuZ2UuZ2V0Um93cygpLnNsaWNlKDEpLm1hcCgocm93KSA9PlxuICAgICAgICBlZGl0b3Iuc2V0SW5kZW50YXRpb25Gb3JCdWZmZXJSb3cocm93LCBpbmRlbnQpKVxuICAgIH0pXG4gIH1cblxuICBwcml2YXRlIGFzeW5jIGdvVG9EZWNsQ29tbWFuZCAoe2N1cnJlbnRUYXJnZXQsIGRldGFpbH06IElFdmVudERlc2MpIHtcbiAgICBjb25zdCBlZGl0b3IgPSBjdXJyZW50VGFyZ2V0LmdldE1vZGVsKClcbiAgICBjb25zdCBldnIgPSB0aGlzLnVwaS5nZXRFdmVudFJhbmdlKGVkaXRvciwgZGV0YWlsKVxuICAgIGlmICghZXZyKSB7IHJldHVybiB9XG4gICAgY29uc3Qge2NyYW5nZX0gPSBldnJcbiAgICBjb25zdCB7aW5mb30gPSBhd2FpdCB0aGlzLnByb2Nlc3MuZ2V0SW5mb0luQnVmZmVyKGVkaXRvciwgY3JhbmdlKVxuICAgIGNvbnN0IHJlcyA9IC8uKi0tIERlZmluZWQgYXQgKC4rKTooXFxkKyk6KFxcZCspLy5leGVjKGluZm8pXG4gICAgaWYgKCFyZXMpIHsgcmV0dXJuIH1cbiAgICBjb25zdCBbZm4sIGxpbmUsIGNvbF0gPSByZXMuc2xpY2UoMSlcbiAgICBjb25zdCByb290RGlyID0gYXdhaXQgdGhpcy5wcm9jZXNzLmdldFJvb3REaXIoZWRpdG9yLmdldEJ1ZmZlcigpKVxuICAgIGlmICghcm9vdERpcikgeyByZXR1cm4gfVxuICAgIGNvbnN0IHVyaSA9IHJvb3REaXIuZ2V0RmlsZShmbikuZ2V0UGF0aCgpIHx8IGZuXG4gICAgYXRvbS53b3Jrc3BhY2Uub3Blbih1cmksIHtcbiAgICAgICAgaW5pdGlhbExpbmU6IHBhcnNlSW50KGxpbmUsIDEwKSAtIDEsXG4gICAgICAgIGluaXRpYWxDb2x1bW46IHBhcnNlSW50KGNvbCwgMTApIC0gMVxuICAgICAgfVxuICAgIClcbiAgfVxuXG4gIHByaXZhdGUgYXN5bmMgaW5zZXJ0SW1wb3J0Q29tbWFuZCAoe2N1cnJlbnRUYXJnZXQsIGRldGFpbH06IElFdmVudERlc2MpIHtcbiAgICBjb25zdCBlZGl0b3IgPSBjdXJyZW50VGFyZ2V0LmdldE1vZGVsKClcbiAgICBjb25zdCBidWZmZXIgPSBlZGl0b3IuZ2V0QnVmZmVyKClcbiAgICBjb25zdCBldnIgPSB0aGlzLnVwaS5nZXRFdmVudFJhbmdlKGVkaXRvciwgZGV0YWlsKVxuICAgIGlmICghZXZyKSB7IHJldHVybiB9XG4gICAgY29uc3Qge2NyYW5nZX0gPSBldnJcbiAgICBjb25zdCBsaW5lcyA9IGF3YWl0IHRoaXMucHJvY2Vzcy5maW5kU3ltYm9sUHJvdmlkZXJzSW5CdWZmZXIoZWRpdG9yLCBjcmFuZ2UpXG4gICAgY29uc3QgbW9kID0gYXdhaXQgaW1wb3J0TGlzdFZpZXcobGluZXMpXG4gICAgaWYgKG1vZCkge1xuICAgICAgY29uc3QgcGkgPSBhd2FpdCBuZXcgUHJvbWlzZTx7cG9zOiBBdG9tVHlwZXMuUG9pbnQsIGluZGVudDogc3RyaW5nLCBlbmQ6IHN0cmluZ30+KChyZXNvbHZlKSA9PiB7XG4gICAgICAgIGJ1ZmZlci5iYWNrd2FyZHNTY2FuKC9eKFxccyopKGltcG9ydHxtb2R1bGUpLywgKHsgbWF0Y2gsIHJhbmdlLCBzdG9wIH0pID0+IHtcbiAgICAgICAgICBsZXQgaW5kZW50ID0gJydcbiAgICAgICAgICBzd2l0Y2ggKG1hdGNoWzJdKSB7XG4gICAgICAgICAgICBjYXNlICdpbXBvcnQnOlxuICAgICAgICAgICAgICBpbmRlbnQgPSBgXFxuJHttYXRjaFsxXX1gXG4gICAgICAgICAgICAgIGJyZWFrXG4gICAgICAgICAgICBjYXNlICdtb2R1bGUnOlxuICAgICAgICAgICAgICBpbmRlbnQgPSBgXFxuXFxuJHttYXRjaFsxXX1gXG4gICAgICAgICAgICAgIGJyZWFrXG4gICAgICAgICAgfVxuICAgICAgICAgIHJlc29sdmUoe3BvczogYnVmZmVyLnJhbmdlRm9yUm93KHJhbmdlLnN0YXJ0LnJvdykuZW5kLCBpbmRlbnQsIGVuZDogJyd9KVxuICAgICAgICB9KVxuICAgICAgICAvLyBub3RoaW5nIGZvdW5kXG4gICAgICAgIHJlc29sdmUoe1xuICAgICAgICAgIHBvczogYnVmZmVyLmdldEZpcnN0UG9zaXRpb24oKSxcbiAgICAgICAgICBpbmRlbnQ6ICcnLFxuICAgICAgICAgIGVuZDogJ1xcbidcbiAgICAgICAgfSlcbiAgICAgIH0pXG4gICAgICBlZGl0b3Iuc2V0VGV4dEluQnVmZmVyUmFuZ2UoW3BpLnBvcywgcGkucG9zXSwgYCR7cGkuaW5kZW50fWltcG9ydCAke21vZH0ke3BpLmVuZH1gKVxuICAgIH1cbiAgfVxuXG4gIHByaXZhdGUgYXN5bmMgdHlwZVRvb2x0aXAgKGU6IEF0b21UeXBlcy5UZXh0RWRpdG9yLCBwOiBBdG9tVHlwZXMuUmFuZ2UpIHtcbiAgICBjb25zdCB7cmFuZ2UsIHR5cGV9ID0gYXdhaXQgdGhpcy5wcm9jZXNzLmdldFR5cGVJbkJ1ZmZlcihlLmdldEJ1ZmZlcigpLCBwKVxuICAgIHJldHVybiB7XG4gICAgICAgIHJhbmdlLFxuICAgICAgICB0ZXh0OiB7XG4gICAgICAgICAgdGV4dDogdHlwZSxcbiAgICAgICAgICBoaWdobGlnaHRlcjpcbiAgICAgICAgICAgIGF0b20uY29uZmlnLmdldCgnaGFza2VsbC1naGMtbW9kLmhpZ2hsaWdodFRvb2x0aXBzJykgP1xuICAgICAgICAgICAgICAnaGludC50eXBlLmhhc2tlbGwnIDogdW5kZWZpbmVkXG4gICAgICAgIH1cbiAgICAgIH1cbiAgfVxuXG4gIHByaXZhdGUgYXN5bmMgaW5mb1Rvb2x0aXAgKGU6IEF0b21UeXBlcy5UZXh0RWRpdG9yLCBwOiBBdG9tVHlwZXMuUmFuZ2UpIHtcbiAgICBjb25zdCB7cmFuZ2UsIGluZm99ID0gYXdhaXQgdGhpcy5wcm9jZXNzLmdldEluZm9JbkJ1ZmZlcihlLCBwKVxuICAgIHJldHVybiB7XG4gICAgICAgIHJhbmdlLFxuICAgICAgICB0ZXh0OiB7XG4gICAgICAgICAgdGV4dDogaW5mbyxcbiAgICAgICAgICBoaWdobGlnaHRlcjpcbiAgICAgICAgICAgIGF0b20uY29uZmlnLmdldCgnaGFza2VsbC1naGMtbW9kLmhpZ2hsaWdodFRvb2x0aXBzJykgP1xuICAgICAgICAgICAgICAnc291cmNlLmhhc2tlbGwnIDogdW5kZWZpbmVkXG4gICAgICAgIH1cbiAgICAgIH1cbiAgfVxuXG4gIHByaXZhdGUgYXN5bmMgaW5mb1R5cGVUb29sdGlwIChlOiBBdG9tVHlwZXMuVGV4dEVkaXRvciwgcDogQXRvbVR5cGVzLlJhbmdlKSB7XG4gICAgdHJ5IHtcbiAgICAgIHJldHVybiBhd2FpdCB0aGlzLmluZm9Ub29sdGlwKGUsIHApXG4gICAgfSBjYXRjaCAoZSkge1xuICAgICAgcmV0dXJuIHRoaXMudHlwZVRvb2x0aXAoZSwgcClcbiAgICB9XG4gIH1cblxuICBwcml2YXRlIGFzeW5jIHR5cGVJbmZvVG9vbHRpcCAoZTogQXRvbVR5cGVzLlRleHRFZGl0b3IsIHA6IEF0b21UeXBlcy5SYW5nZSkge1xuICAgIHRyeSB7XG4gICAgICByZXR1cm4gYXdhaXQgdGhpcy50eXBlVG9vbHRpcChlLCBwKVxuICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgIHJldHVybiB0aGlzLmluZm9Ub29sdGlwKGUsIHApXG4gICAgfVxuICB9XG5cbiAgcHJpdmF0ZSBhc3luYyB0eXBlQW5kSW5mb1Rvb2x0aXAgKGU6IEF0b21UeXBlcy5UZXh0RWRpdG9yLCBwOiBBdG9tVHlwZXMuUmFuZ2UpIHtcbiAgICBjb25zdCB0eXBlUCA9IHRoaXMudHlwZVRvb2x0aXAoZSwgcCkuY2F0Y2goKCkgPT4gdW5kZWZpbmVkKVxuICAgIGNvbnN0IGluZm9QID0gdGhpcy5pbmZvVG9vbHRpcChlLCBwKS5jYXRjaCgoKSA9PiB1bmRlZmluZWQpXG4gICAgY29uc3QgW3R5cGUsIGluZm9dID0gYXdhaXQgUHJvbWlzZS5hbGwoW3R5cGVQLCBpbmZvUF0pXG4gICAgbGV0IHJhbmdlLCB0ZXh0OiBzdHJpbmdcbiAgICBpZiAodHlwZSAmJiBpbmZvKSB7XG4gICAgICByYW5nZSA9IHR5cGUucmFuZ2UudW5pb24oaW5mby5yYW5nZSlcbiAgICAgIHRleHQgPSBgOjogJHt0eXBlLnRleHQudGV4dH1cXG4ke2luZm8udGV4dC50ZXh0fWBcbiAgICB9IGVsc2UgaWYgKHR5cGUpIHtcbiAgICAgIHJhbmdlID0gdHlwZS5yYW5nZVxuICAgICAgdGV4dCA9IHR5cGUudGV4dC50ZXh0XG4gICAgfSBlbHNlIGlmIChpbmZvKSB7XG4gICAgICByYW5nZSA9IGluZm8ucmFuZ2VcbiAgICAgIHRleHQgPSBpbmZvLnRleHQudGV4dFxuICAgIH0gZWxzZSB7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoJ0dvdCBuZWl0aGVyIHR5cGUgbm9yIGluZm8nKVxuICAgIH1cbiAgICBjb25zdCBoaWdobGlnaHRlciA9IGF0b20uY29uZmlnLmdldCgnaGFza2VsbC1naGMtbW9kLmhpZ2hsaWdodFRvb2x0aXBzJykgPyAnc291cmNlLmhhc2tlbGwnIDogdW5kZWZpbmVkXG4gICAgcmV0dXJuIHsgcmFuZ2UsIHRleHQ6IHsgdGV4dCwgaGlnaGxpZ2h0ZXIgfSB9XG4gIH1cblxuICBwcml2YXRlIHNldEhpZ2hsaWdodGVyICgpIHtcbiAgICBpZiAoYXRvbS5jb25maWcuZ2V0KCdoYXNrZWxsLWdoYy1tb2QuaGlnaGxpZ2h0TWVzc2FnZXMnKSkge1xuICAgICAgcmV0dXJuIChtOiBVUEkuSVJlc3VsdEl0ZW0pOiBVUEkuSVJlc3VsdEl0ZW0gPT4ge1xuICAgICAgICBpZiAodHlwZW9mIG0ubWVzc2FnZSA9PT0gJ3N0cmluZycpIHtcbiAgICAgICAgICBjb25zdCBtZXNzYWdlOiBVUEkuSU1lc3NhZ2VUZXh0ID0ge1xuICAgICAgICAgICAgdGV4dDogbS5tZXNzYWdlLFxuICAgICAgICAgICAgaGlnaGxpZ2h0ZXI6ICdoaW50Lm1lc3NhZ2UuaGFza2VsbCdcbiAgICAgICAgICB9XG4gICAgICAgICAgcmV0dXJuIHsuLi5tLCBtZXNzYWdlfVxuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIHJldHVybiBtXG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9IGVsc2Uge1xuICAgICAgcmV0dXJuIChtOiBVUEkuSVJlc3VsdEl0ZW0pID0+IG1cbiAgICB9XG4gIH1cblxuICBwcml2YXRlIHNldE1lc3NhZ2VzIChtZXNzYWdlczogVVBJLklSZXN1bHRJdGVtW10pIHtcbiAgICB0aGlzLmxhc3RNZXNzYWdlcyA9IG1lc3NhZ2VzLm1hcCh0aGlzLnNldEhpZ2hsaWdodGVyKCkpXG4gICAgdGhpcy5zZW5kTWVzc2FnZXMoKVxuICB9XG5cbiAgcHJpdmF0ZSBzZW5kTWVzc2FnZXMgKCkge1xuICAgIHRoaXMudXBpLnNldE1lc3NhZ2VzKHRoaXMucHJvY2Vzc01lc3NhZ2VzLmNvbmNhdCh0aGlzLmxhc3RNZXNzYWdlcykpXG4gIH1cblxuICBwcml2YXRlIGFzeW5jIGNoZWNrTGludCAoYnVmZmVyOiBBdG9tVHlwZXMuVGV4dEJ1ZmZlciwgb3B0OiAnU2F2ZScgfCAnQ2hhbmdlJywgZmFzdDogYm9vbGVhbiA9IGZhbHNlKSB7XG4gICAgbGV0IHJlc1xuICAgIGlmIChhdG9tLmNvbmZpZy5nZXQoYGhhc2tlbGwtZ2hjLW1vZC5vbiR7b3B0fUNoZWNrYCkgJiYgYXRvbS5jb25maWcuZ2V0KGBoYXNrZWxsLWdoYy1tb2Qub24ke29wdH1MaW50YCkpIHtcbiAgICAgIHJlcyA9IGF3YWl0IHRoaXMucHJvY2Vzcy5kb0NoZWNrQW5kTGludChidWZmZXIsIGZhc3QpXG4gICAgfSBlbHNlIGlmIChhdG9tLmNvbmZpZy5nZXQoYGhhc2tlbGwtZ2hjLW1vZC5vbiR7b3B0fUNoZWNrYCkpIHtcbiAgICAgIHJlcyA9IGF3YWl0IHRoaXMucHJvY2Vzcy5kb0NoZWNrQnVmZmVyKGJ1ZmZlciwgZmFzdClcbiAgICB9IGVsc2UgaWYgKGF0b20uY29uZmlnLmdldChgaGFza2VsbC1naGMtbW9kLm9uJHtvcHR9TGludGApKSB7XG4gICAgICByZXMgPSBhd2FpdCB0aGlzLnByb2Nlc3MuZG9MaW50QnVmZmVyKGJ1ZmZlciwgZmFzdClcbiAgICB9XG4gICAgaWYgKHJlcykge1xuICAgICAgdGhpcy5zZXRNZXNzYWdlcyhyZXMpXG4gICAgfVxuICB9XG5cbiAgcHJpdmF0ZSBoYW5kbGVQcm9jZXNzRXJyb3IgKGFyZzogSUVycm9yQ2FsbGJhY2tBcmdzKSB7XG4gICAgdGhpcy5wcm9jZXNzTWVzc2FnZXMucHVzaCh7XG4gICAgICBtZXNzYWdlOiBVdGlsLmZvcm1hdEVycm9yKGFyZylcbiAgICAgICAgKyAnXFxuXFxuU2VlIGNvbnNvbGUgKFZpZXcg4oaSIERldmVsb3BlciDihpIgVG9nZ2xlIERldmVsb3BlciBUb29scyDihpIgQ29uc29sZSB0YWIpIGZvciBkZXRhaWxzLicsXG4gICAgICBzZXZlcml0eTogJ2doYy1tb2QnXG4gICAgfSlcbiAgICAvLyB0c2xpbnQ6ZGlzYWJsZS1uZXh0LWxpbmU6IG5vLWNvbnNvbGVcbiAgICBjb25zb2xlLmVycm9yKFV0aWwuZm9ybWF0RXJyb3IoYXJnKSwgVXRpbC5nZXRFcnJvckRldGFpbChhcmcpKVxuICAgIHRoaXMuc2VuZE1lc3NhZ2VzKClcbiAgfVxuXG4gIHByaXZhdGUgaGFuZGxlUHJvY2Vzc1dhcm5pbmcgKHdhcm5pbmc6IHN0cmluZykge1xuICAgIHRoaXMucHJvY2Vzc01lc3NhZ2VzLnB1c2goe1xuICAgICAgbWVzc2FnZTogd2FybmluZyxcbiAgICAgIHNldmVyaXR5OiAnZ2hjLW1vZCdcbiAgICB9KVxuICAgIFV0aWwud2Fybih3YXJuaW5nKVxuICAgIHRoaXMuc2VuZE1lc3NhZ2VzKClcbiAgfVxufVxuIl19