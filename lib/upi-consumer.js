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
        this.process = process;
        this.disposables = new atom_1.CompositeDisposable();
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
    destroy() {
        this.disposables.dispose();
    }
    shouldShowTooltip(editor, crange, type) {
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
    }
    checkCommand({ currentTarget }) {
        return __awaiter(this, void 0, void 0, function* () {
            const editor = currentTarget.getModel();
            const res = yield this.process.doCheckBuffer(editor.getBuffer());
            return this.setMessages(res);
        });
    }
    lintCommand({ currentTarget }) {
        return __awaiter(this, void 0, void 0, function* () {
            const editor = currentTarget.getModel();
            const res = yield this.process.doLintBuffer(editor.getBuffer());
            return this.setMessages(res);
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
            const { scope, range } = symInfo;
            let { symbol } = symInfo;
            if (editor.getTextInBufferRange(range).match(/[=]/)) {
                let indent = editor.getTextInBufferRange([[range.start.row, 0], range.start]);
                if (scope === 'keyword.operator.haskell') {
                    symbol = `(${symbol})`;
                }
                let birdTrack = '';
                if (editor.scopeDescriptorForBufferPosition(pos).getScopesArray().includes('meta.embedded.haskell')) {
                    birdTrack = indent.slice(0, 2);
                    indent = indent.slice(2);
                }
                if (indent.match(/\S/)) {
                    indent = indent.replace(/\S/g, ' ');
                }
                return editor.setTextInBufferRange([range.start, range.start], `${symbol} :: ${type}\n${birdTrack}${indent}`);
            }
            else if (!scope) {
                return editor.setTextInBufferRange(range, `(${editor.getTextInBufferRange(range)} :: ${type})`);
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
                return newrange.getRows().slice(1).map((row) => editor.setIndentationForBufferRow(row, indent));
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
            return atom.workspace.open(uri, {
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
        return this.upi.setMessages(messages.map(this.setHighlighter()));
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
}
exports.UPIConsumer = UPIConsumer;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidXBpLWNvbnN1bWVyLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vc3JjL3VwaS1jb25zdW1lci50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOzs7Ozs7Ozs7O0FBYUEsK0JBQWlEO0FBRWpELCtEQUF1RDtBQUN2RCwrQkFBK0I7QUFFL0IsTUFBTSxZQUFZLEdBQUc7SUFDbkIsS0FBSyxFQUFFLEVBQUU7SUFDVCxPQUFPLEVBQUUsRUFBRTtJQUNYLElBQUksRUFBRSxFQUFFO0NBQ1QsQ0FBQTtBQUVELE1BQU0sWUFBWSxHQUFHLDJDQUEyQyxDQUFBO0FBRWhFLE1BQU0sUUFBUSxHQUFHO0lBQ2YsS0FBSyxFQUFFLFNBQVM7SUFDaEIsSUFBSSxFQUFFO1FBQ0osRUFBQyxLQUFLLEVBQUUsT0FBTyxFQUFFLE9BQU8sRUFBRSw0QkFBNEIsRUFBQztRQUN2RCxFQUFDLEtBQUssRUFBRSxNQUFNLEVBQUUsT0FBTyxFQUFFLDJCQUEyQixFQUFDO1FBQ3JELEVBQUMsS0FBSyxFQUFFLGNBQWMsRUFBRSxPQUFPLEVBQUUsa0NBQWtDLEVBQUM7S0FDckU7Q0FDRixDQUFBO0FBRUQ7SUF5Q0UsWUFBYSxRQUE4QixFQUFFLE9BQXVCO1FBcEM1RCxvQkFBZSxHQUFHO1lBQ3hCLDJCQUEyQixFQUFFLElBQUksQ0FBQyxjQUFjLENBQUMsSUFBSSxDQUFDLFdBQVcsQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLENBQUM7WUFDN0UsMkJBQTJCLEVBQUUsSUFBSSxDQUFDLGNBQWMsQ0FBQyxJQUFJLENBQUMsV0FBVyxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsQ0FBQztZQUM3RSw0QkFBNEIsRUFBRSxJQUFJLENBQUMsZ0JBQWdCLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQztZQUM5RCwwQkFBMEIsRUFBRSxJQUFJLENBQUMsY0FBYyxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUM7WUFDMUQsbUNBQW1DLEVBQUUsSUFBSSxDQUFDLGVBQWUsQ0FBQyxJQUFJLENBQUMs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RUFBRSxDQUFDLENBQUMsSUFBSSxDQUFDLE1BQU0sQ0FBQyxHQUFHLENBQUMscUJBQXFCLEdBQUcsTUFBTSxDQUFDLENBQUMsQ0FBQyxDQUFDO2dCQUMzRCxHQUFHLEdBQUcsTUFBTSxJQUFJLENBQUMsT0FBTyxDQUFDLFlBQVksQ0FBQyxNQUFNLEVBQUUsSUFBSSxDQUFDLENBQUE7WUFDckQsQ0FBQztZQUNELEVBQUUsQ0FBQyxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUM7Z0JBQ1IsSUFBSSxDQUFDLFdBQVcsQ0FBQyxHQUFHLENBQUMsQ0FBQTtZQUN2QixDQUFDO1FBQ0gsQ0FBQztLQUFBO0NBQ0Y7QUFuVUQsa0NBbVVDIiwic291cmNlc0NvbnRlbnQiOlsiLypcbiAqIGRlY2FmZmVpbmF0ZSBzdWdnZXN0aW9uczpcbiAqIERTMTAxOiBSZW1vdmUgdW5uZWNlc3NhcnkgdXNlIG9mIEFycmF5LmZyb21cbiAqIERTMTAyOiBSZW1vdmUgdW5uZWNlc3NhcnkgY29kZSBjcmVhdGVkIGJlY2F1c2Ugb2YgaW1wbGljaXQgcmV0dXJuc1xuICogRFMxMDM6IFJld3JpdGUgY29kZSB0byBubyBsb25nZXIgdXNlIF9fZ3VhcmRfX1xuICogRFMxMDQ6IEF2b2lkIGlubGluZSBhc3NpZ25tZW50c1xuICogRFMyMDE6IFNpbXBsaWZ5IGNvbXBsZXggZGVzdHJ1Y3R1cmUgYXNzaWdubWVudHNcbiAqIERTMjA0OiBDaGFuZ2UgaW5jbHVkZXMgY2FsbHMgdG8gaGF2ZSBhIG1vcmUgbmF0dXJhbCBldmFsdWF0aW9uIG9yZGVyXG4gKiBEUzIwNTogQ29uc2lkZXIgcmV3b3JraW5nIGNvZGUgdG8gYXZvaWQgdXNlIG9mIElJRkVzXG4gKiBEUzIwNjogQ29uc2lkZXIgcmV3b3JraW5nIGNsYXNzZXMgdG8gYXZvaWQgaW5pdENsYXNzXG4gKiBEUzIwNzogQ29uc2lkZXIgc2hvcnRlciB2YXJpYXRpb25zIG9mIG51bGwgY2hlY2tzXG4gKiBGdWxsIGRvY3M6IGh0dHBzOi8vZ2l0aHViLmNvbS9kZWNhZmZlaW5hdGUvZGVjYWZmZWluYXRlL2Jsb2IvbWFzdGVyL2RvY3Mvc3VnZ2VzdGlvbnMubWRcbiAqL1xuaW1wb3J0IHsgQ29tcG9zaXRlRGlzcG9zYWJsZSwgUmFuZ2UgfSBmcm9tICdhdG9tJ1xuaW1wb3J0IHtHaGNNb2RpUHJvY2Vzc30gZnJvbSAnLi9naGMtbW9kL2doYy1tb2RpLXByb2Nlc3MnXG5pbXBvcnQge2ltcG9ydExpc3RWaWV3fSBmcm9tICcuL3ZpZXdzL2ltcG9ydC1saXN0LXZpZXcnXG5pbXBvcnQgVXRpbCA9IHJlcXVpcmUoJy4vdXRpbCcpXG5cbmNvbnN0IG1lc3NhZ2VUeXBlcyA9IHtcbiAgZXJyb3I6IHt9LFxuICB3YXJuaW5nOiB7fSxcbiAgbGludDoge31cbn1cblxuY29uc3QgY29udGV4dFNjb3BlID0gJ2F0b20tdGV4dC1lZGl0b3JbZGF0YS1ncmFtbWFyfj1cImhhc2tlbGxcIl0nXG5cbmNvbnN0IG1haW5NZW51ID0ge1xuICBsYWJlbDogJ2doYy1tb2QnLFxuICBtZW51OiBbXG4gICAge2xhYmVsOiAnQ2hlY2snLCBjb21tYW5kOiAnaGFza2VsbC1naGMtbW9kOmNoZWNrLWZpbGUnfSxcbiAgICB7bGFiZWw6ICdMaW50JywgY29tbWFuZDogJ2hhc2tlbGwtZ2hjLW1vZDpsaW50LWZpbGUnfSxcbiAgICB7bGFiZWw6ICdTdG9wIEJhY2tlbmQnLCBjb21tYW5kOiAnaGFza2VsbC1naGMtbW9kOnNodXRkb3duLWJhY2tlbmQnfVxuICBdXG59XG5cbmV4cG9ydCBjbGFzcyBVUElDb25zdW1lciB7XG4gIHByaXZhdGUgdXBpOiBVUEkuSVVQSUluc3RhbmNlXG4gIHByaXZhdGUgcHJvY2VzczogR2hjTW9kaVByb2Nlc3NcbiAgcHJpdmF0ZSBkaXNwb3NhYmxlczogQ29tcG9zaXRlRGlzcG9zYWJsZVxuXG4gIHByaXZhdGUgY29udGV4dENvbW1hbmRzID0ge1xuICAgICdoYXNrZWxsLWdoYy1tb2Q6c2hvdy10eXBlJzogdGhpcy50b29sdGlwQ29tbWFuZCh0aGlzLnR5cGVUb29sdGlwLmJpbmQodGhpcykpLFxuICAgICdoYXNrZWxsLWdoYy1tb2Q6c2hvdy1pbmZvJzogdGhpcy50b29sdGlwQ29tbWFuZCh0aGlzLmluZm9Ub29sdGlwLmJpbmQodGhpcykpLFxuICAgICdoYXNrZWxsLWdoYy1tb2Q6Y2FzZS1zcGxpdCc6IHRoaXMuY2FzZVNwbGl0Q29tbWFuZC5iaW5kKHRoaXMpLFxuICAgICdoYXNrZWxsLWdoYy1tb2Q6c2lnLWZpbGwnOiB0aGlzLnNpZ0ZpbGxDb21tYW5kLmJpbmQodGhpcyksXG4gICAgJ2hhc2tlbGwtZ2hjLW1vZDpnby10by1kZWNsYXJhdGlvbic6IHRoaXMuZ29Ub0RlY2xDb21tYW5kLmJpbmQodGhpcyksXG4gICAgJ2hhc2tlbGwtZ2hjLW1vZDpzaG93LWluZm8tZmFsbGJhY2stdG8tdHlwZSc6IHRoaXMudG9vbHRpcENvbW1hbmQodGhpcy5pbmZvVHlwZVRvb2x0aXAuYmluZCh0aGlzKSksXG4gICAgJ2hhc2tlbGwtZ2hjLW1vZDpzaG93LXR5cGUtZmFsbGJhY2stdG8taW5mbyc6IHRoaXMudG9vbHRpcENvbW1hbmQodGhpcy50eXBlSW5mb1Rvb2x0aXAuYmluZCh0aGlzKSksXG4gICAgJ2hhc2tlbGwtZ2hjLW1vZDpzaG93LXR5cGUtYW5kLWluZm8nOiB0aGlzLnRvb2x0aXBDb21tYW5kKHRoaXMudHlwZUFuZEluZm9Ub29sdGlwLmJpbmQodGhpcykpLFxuICAgICdoYXNrZWxsLWdoYy1tb2Q6aW5zZXJ0LXR5cGUnOiB0aGlzLmluc2VydFR5cGVDb21tYW5kLmJpbmQodGhpcyksXG4gICAgJ2hhc2tlbGwtZ2hjLW1vZDppbnNlcnQtaW1wb3J0JzogdGhpcy5pbnNlcnRJbXBvcnRDb21tYW5kLmJpbmQodGhpcylcbiAgfVxuXG4gIHByaXZhdGUgZ2xvYmFsQ29tbWFuZHMgPSB7XG4gICAgJ2hhc2tlbGwtZ2hjLW1vZDpjaGVjay1maWxlJzogdGhpcy5jaGVja0NvbW1hbmQuYmluZCh0aGlzKSxcbiAgICAnaGFza2VsbC1naGMtbW9kOmxpbnQtZmlsZSc6IHRoaXMubGludENvbW1hbmQuYmluZCh0aGlzKSxcbiAgICAuLi50aGlzLmNvbnRleHRDb21tYW5kc1xuICB9XG5cbiAgcHJpdmF0ZSBjb250ZXh0TWVudToge1xuICAgIGxhYmVsOiBzdHJpbmcsIHN1Ym1lbnU6IEFycmF5PHtsYWJlbDogc3RyaW5nLCBjb21tYW5kOiBrZXlvZiBVUElDb25zdW1lclsnY29udGV4dENvbW1hbmRzJ119PlxuICB9ID0ge1xuICAgIGxhYmVsOiAnZ2hjLW1vZCcsXG4gICAgc3VibWVudTpcbiAgICAgIFtcbiAgICAgICAge2xhYmVsOiAnU2hvdyBUeXBlJywgY29tbWFuZDogJ2hhc2tlbGwtZ2hjLW1vZDpzaG93LXR5cGUnfSxcbiAgICAgICAge2xhYmVsOiAnU2hvdyBJbmZvJywgY29tbWFuZDogJ2hhc2tlbGwtZ2hjLW1vZDpzaG93LWluZm8nfSxcbiAgICAgICAge2xhYmVsOiAnU2hvdyBUeXBlIEFuZCBJbmZvJywgY29tbWFuZDogJ2hhc2tlbGwtZ2hjLW1vZDpzaG93LXR5cGUtYW5kLWluZm8nfSxcbiAgICAgICAge2xhYmVsOiAnQ2FzZSBTcGxpdCcsIGNvbW1hbmQ6ICdoYXNrZWxsLWdoYy1tb2Q6Y2FzZS1zcGxpdCd9LFxuICAgICAgICB7bGFiZWw6ICdTaWcgRmlsbCcsIGNvbW1hbmQ6ICdoYXNrZWxsLWdoYy1tb2Q6c2lnLWZpbGwnfSxcbiAgICAgICAge2xhYmVsOiAnSW5zZXJ0IFR5cGUnLCBjb21tYW5kOiAnaGFza2VsbC1naGMtbW9kOmluc2VydC10eXBlJ30sXG4gICAgICAgIHtsYWJlbDogJ0luc2VydCBJbXBvcnQnLCBjb21tYW5kOiAnaGFza2VsbC1naGMtbW9kOmluc2VydC1pbXBvcnQnfSxcbiAgICAgICAge2xhYmVsOiAnR28gVG8gRGVjbGFyYXRpb24nLCBjb21tYW5kOiAnaGFza2VsbC1naGMtbW9kOmdvLXRvLWRlY2xhcmF0aW9uJ31cbiAgICAgIF1cbiAgfVxuXG4gIGNvbnN0cnVjdG9yIChyZWdpc3RlcjogVVBJLklVUElSZWdpc3RyYXRpb24sIHByb2Nlc3M6IEdoY01vZGlQcm9jZXNzKSB7XG4gICAgdGhpcy5wcm9jZXNzID0gcHJvY2Vzc1xuICAgIHRoaXMuZGlzcG9zYWJsZXMgPSBuZXcgQ29tcG9zaXRlRGlzcG9zYWJsZSgpXG5cbiAgICB0aGlzLnVwaSA9IHJlZ2lzdGVyKHtcbiAgICAgIG5hbWU6ICdoYXNrZWxsLWdoYy1tb2QnLFxuICAgICAgbWVudTogbWFpbk1lbnUsXG4gICAgICBtZXNzYWdlVHlwZXMsXG4gICAgICB0b29sdGlwOiB0aGlzLnNob3VsZFNob3dUb29sdGlwLmJpbmQodGhpcyksXG4gICAgICBldmVudHM6IHtcbiAgICAgICAgb25EaWRTYXZlQnVmZmVyOiBhc3luYyAoYnVmZmVyKSA9PlxuICAgICAgICAgIHRoaXMuY2hlY2tMaW50KGJ1ZmZlciwgJ1NhdmUnKSxcbiAgICAgICAgb25EaWRTdG9wQ2hhbmdpbmc6IGFzeW5jIChidWZmZXIpID0+XG4gICAgICAgICAgdGhpcy5jaGVja0xpbnQoYnVmZmVyLCAnQ2hhbmdlJywgdHJ1ZSlcbiAgICAgIH1cbiAgICB9KVxuXG4gICAgdGhpcy5kaXNwb3NhYmxlcy5hZGQoXG4gICAgICB0aGlzLnVwaSxcbiAgICAgIHRoaXMucHJvY2Vzcy5vbkJhY2tlbmRBY3RpdmUoKCkgPT4gdGhpcy51cGkuc2V0U3RhdHVzKHtzdGF0dXM6ICdwcm9ncmVzcycsIGRldGFpbDogJyd9KSksXG4gICAgICB0aGlzLnByb2Nlc3Mub25CYWNrZW5kSWRsZSgoKSA9PiB0aGlzLnVwaS5zZXRTdGF0dXMoe3N0YXR1czogJ3JlYWR5JywgZGV0YWlsOiAnJ30pKSxcbiAgICAgIGF0b20uY29tbWFuZHMuYWRkKGNvbnRleHRTY29wZSwgdGhpcy5nbG9iYWxDb21tYW5kcyksXG4gICAgKVxuICAgIGNvbnN0IGNtID0ge31cbiAgICBjbVtjb250ZXh0U2NvcGVdID0gW3RoaXMuY29udGV4dE1lbnVdXG4gICAgdGhpcy5kaXNwb3NhYmxlcy5hZGQoYXRvbS5jb250ZXh0TWVudS5hZGQoY20pKVxuICB9XG5cbiAgcHVibGljIGRlc3Ryb3kgKCkge1xuICAgIHRoaXMuZGlzcG9zYWJsZXMuZGlzcG9zZSgpXG4gIH1cblxuICBwcml2YXRlIHNob3VsZFNob3dUb29sdGlwIChlZGl0b3I6IEF0b21UeXBlcy5UZXh0RWRpdG9yLCBjcmFuZ2U6IEF0b21UeXBlcy5SYW5nZSwgdHlwZTogVVBJLlRFdmVudFJhbmdlVHlwZSkge1xuICAgICAgaWYgKHR5cGUgPT09ICdtb3VzZScpIHtcbiAgICAgICAgY29uc3QgdCA9IGF0b20uY29uZmlnLmdldCgnaGFza2VsbC1naGMtbW9kLm9uTW91c2VIb3ZlclNob3cnKVxuICAgICAgICBpZiAodCkge1xuICAgICAgICAgIHJldHVybiB0aGlzW2Ake3R9VG9vbHRpcGBdKGVkaXRvciwgY3JhbmdlKVxuICAgICAgICB9XG4gICAgICB9IGVsc2UgaWYgKHR5cGUgPT09ICdzZWxlY3Rpb24nKSB7XG4gICAgICAgIGNvbnN0IHQgPSBhdG9tLmNvbmZpZy5nZXQoJ2hhc2tlbGwtZ2hjLW1vZC5vblNlbGVjdGlvblNob3cnKVxuICAgICAgICBpZiAodCkge1xuICAgICAgICAgIHJldHVybiB0aGlzW2Ake3R9VG9vbHRpcGBdKGVkaXRvciwgY3JhbmdlKVxuICAgICAgICB9XG4gICAgICB9XG4gIH1cblxuICBwcml2YXRlIGFzeW5jIGNoZWNrQ29tbWFuZCAoe2N1cnJlbnRUYXJnZXR9OiBJRXZlbnREZXNjKSB7XG4gICAgY29uc3QgZWRpdG9yID0gY3VycmVudFRhcmdldC5nZXRNb2RlbCgpXG4gICAgY29uc3QgcmVzID0gYXdhaXQgdGhpcy5wcm9jZXNzLmRvQ2hlY2tCdWZmZXIoZWRpdG9yLmdldEJ1ZmZlcigpKVxuICAgIHJldHVybiB0aGlzLnNldE1lc3NhZ2VzKHJlcylcbiAgfVxuXG4gIHByaXZhdGUgYXN5bmMgbGludENvbW1hbmQgKHtjdXJyZW50VGFyZ2V0fTogSUV2ZW50RGVzYykge1xuICAgIGNvbnN0IGVkaXRvciA9IGN1cnJlbnRUYXJnZXQuZ2V0TW9kZWwoKVxuICAgIGNvbnN0IHJlcyA9IGF3YWl0IHRoaXMucHJvY2Vzcy5kb0xpbnRCdWZmZXIoZWRpdG9yLmdldEJ1ZmZlcigpKVxuICAgIHJldHVybiB0aGlzLnNldE1lc3NhZ2VzKHJlcylcbiAgfVxuXG4gIHByaXZhdGUgdG9vbHRpcENvbW1hbmQgKHRvb2x0aXBmdW46IChlOiBBdG9tVHlwZXMuVGV4dEVkaXRvciwgcDogQXRvbVR5cGVzLlJhbmdlKSA9PiBQcm9taXNlPFVQSS5JVG9vbHRpcERhdGE+KSB7XG4gICAgcmV0dXJuICh7Y3VycmVudFRhcmdldCwgZGV0YWlsfTogSUV2ZW50RGVzYykgPT5cbiAgICAgIHRoaXMudXBpLnNob3dUb29sdGlwKHtcbiAgICAgICAgZWRpdG9yOiBjdXJyZW50VGFyZ2V0LmdldE1vZGVsKCksXG4gICAgICAgIGRldGFpbCxcbiAgICAgICAgYXN5bmMgdG9vbHRpcCAoY3JhbmdlKSB7XG4gICAgICAgICAgcmV0dXJuIHRvb2x0aXBmdW4oY3VycmVudFRhcmdldC5nZXRNb2RlbCgpLCBjcmFuZ2UpXG4gICAgICAgIH1cbiAgICAgIH0pXG4gIH1cblxuICBwcml2YXRlIGFzeW5jIGluc2VydFR5cGVDb21tYW5kICh7Y3VycmVudFRhcmdldCwgZGV0YWlsfTogSUV2ZW50RGVzYykge1xuICAgIGNvbnN0IGVkaXRvciA9IGN1cnJlbnRUYXJnZXQuZ2V0TW9kZWwoKVxuICAgIGNvbnN0IGVyID0gdGhpcy51cGkuZ2V0RXZlbnRSYW5nZShlZGl0b3IsIGRldGFpbClcbiAgICBpZiAoZXIgPT09IHVuZGVmaW5lZCkgeyByZXR1cm4gfVxuICAgIGNvbnN0IHtjcmFuZ2UsIHBvc30gPSBlclxuICAgIGNvbnN0IHt0eXBlfSA9IGF3YWl0IHRoaXMucHJvY2Vzcy5nZXRUeXBlSW5CdWZmZXIoZWRpdG9yLmdldEJ1ZmZlcigpLCBjcmFuZ2UpXG4gICAgY29uc3Qgc3ltSW5mbyA9IFV0aWwuZ2V0U3ltYm9sQXRQb2ludChlZGl0b3IsIHBvcylcbiAgICBjb25zdCB7c2NvcGUsIHJhbmdlfSA9IHN5bUluZm9cbiAgICBsZXQge3N5bWJvbH0gPSBzeW1JbmZvXG4gICAgaWYgKGVkaXRvci5nZXRUZXh0SW5CdWZmZXJSYW5nZShyYW5nZSkubWF0Y2goL1s9XS8pKSB7XG4gICAgICBsZXQgaW5kZW50ID0gZWRpdG9yLmdldFRleHRJbkJ1ZmZlclJhbmdlKFtbcmFuZ2Uuc3RhcnQucm93LCAwXSwgcmFuZ2Uuc3RhcnRdKVxuICAgICAgaWYgKHNjb3BlID09PSAna2V5d29yZC5vcGVyYXRvci5oYXNrZWxsJykgeyBzeW1ib2wgPSBgKCR7c3ltYm9sfSlgIH1cbiAgICAgIGxldCBiaXJkVHJhY2sgPSAnJ1xuICAgICAgaWYgKGVkaXRvci5zY29wZURlc2NyaXB0b3JGb3JCdWZmZXJQb3NpdGlvbihwb3MpLmdldFNjb3Blc0FycmF5KCkuaW5jbHVkZXMoJ21ldGEuZW1iZWRkZWQuaGFza2VsbCcpKSB7XG4gICAgICAgIGJpcmRUcmFjayA9IGluZGVudC5zbGljZSgwLCAyKVxuICAgICAgICBpbmRlbnQgPSBpbmRlbnQuc2xpY2UoMilcbiAgICAgIH1cbiAgICAgIGlmIChpbmRlbnQubWF0Y2goL1xcUy8pKSB7XG4gICAgICAgIGluZGVudCA9IGluZGVudC5yZXBsYWNlKC9cXFMvZywgJyAnKVxuICAgICAgfVxuICAgICAgcmV0dXJuIGVkaXRvci5zZXRUZXh0SW5CdWZmZXJSYW5nZShbcmFuZ2Uuc3RhcnQsIHJhbmdlLnN0YXJ0XSxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgYCR7c3ltYm9sfSA6OiAke3R5cGV9XFxuJHtiaXJkVHJhY2t9JHtpbmRlbnR9YClcbiAgICB9IGVsc2UgaWYgKCFzY29wZSkgeyAvLyBuZWl0aGVyIG9wZXJhdG9yIG5vciBpbmZpeFxuICAgICAgcmV0dXJuIGVkaXRvci5zZXRUZXh0SW5CdWZmZXJSYW5nZShyYW5nZSwgYCgke2VkaXRvci5nZXRUZXh0SW5CdWZmZXJSYW5nZShyYW5nZSl9IDo6ICR7dHlwZX0pYClcbiAgICB9XG4gIH1cblxuICBwcml2YXRlIGFzeW5jIGNhc2VTcGxpdENvbW1hbmQgKHtjdXJyZW50VGFyZ2V0LCBkZXRhaWx9OiBJRXZlbnREZXNjKSB7XG4gICAgY29uc3QgZWRpdG9yID0gY3VycmVudFRhcmdldC5nZXRNb2RlbCgpXG4gICAgY29uc3QgZXZyID0gdGhpcy51cGkuZ2V0RXZlbnRSYW5nZShlZGl0b3IsIGRldGFpbClcbiAgICBpZiAoIWV2cikgeyByZXR1cm4gfVxuICAgIGNvbnN0IHtjcmFuZ2V9ID0gZXZyXG4gICAgY29uc3QgcmVzID0gYXdhaXQgdGhpcy5wcm9jZXNzLmRvQ2FzZVNwbGl0KGVkaXRvci5nZXRCdWZmZXIoKSwgY3JhbmdlKVxuICAgIGZvciAoY29uc3Qge3JhbmdlLCByZXBsYWNlbWVudH0gb2YgcmVzKSB7XG4gICAgICBlZGl0b3Iuc2V0VGV4dEluQnVmZmVyUmFuZ2UocmFuZ2UsIHJlcGxhY2VtZW50KVxuICAgIH1cbiAgfVxuXG4gIHByaXZhdGUgYXN5bmMgc2lnRmlsbENvbW1hbmQgKHtjdXJyZW50VGFyZ2V0LCBkZXRhaWx9OiBJRXZlbnREZXNjKSB7XG4gICAgY29uc3QgZWRpdG9yID0gY3VycmVudFRhcmdldC5nZXRNb2RlbCgpXG4gICAgY29uc3QgZXZyID0gdGhpcy51cGkuZ2V0RXZlbnRSYW5nZShlZGl0b3IsIGRldGFpbClcbiAgICBpZiAoIWV2cikgeyByZXR1cm4gfVxuICAgIGNvbnN0IHtjcmFuZ2V9ID0gZXZyXG4gICAgY29uc3QgcmVzID0gYXdhaXQgdGhpcy5wcm9jZXNzLmRvU2lnRmlsbChlZGl0b3IuZ2V0QnVmZmVyKCksIGNyYW5nZSlcblxuICAgIGVkaXRvci50cmFuc2FjdCgoKSA9PiB7XG4gICAgICBjb25zdCB7IHR5cGUsIHJhbmdlLCBib2R5IH0gPSByZXNcbiAgICAgIGNvbnN0IHNpZyA9IGVkaXRvci5nZXRUZXh0SW5CdWZmZXJSYW5nZShyYW5nZSlcbiAgICAgIGxldCBpbmRlbnQgPSBlZGl0b3IuaW5kZW50TGV2ZWxGb3JMaW5lKHNpZylcbiAgICAgIGNvbnN0IHBvcyA9IHJhbmdlLmVuZFxuICAgICAgY29uc3QgdGV4dCA9IGBcXG4ke2JvZHl9YFxuICAgICAgaWYgKHR5cGUgPT09ICdpbnN0YW5jZScpIHtcbiAgICAgICAgaW5kZW50ICs9IDFcbiAgICAgICAgaWYgKCFzaWcuZW5kc1dpdGgoJyB3aGVyZScpKSB7XG4gICAgICAgICAgZWRpdG9yLnNldFRleHRJbkJ1ZmZlclJhbmdlKFtyYW5nZS5lbmQsIHJhbmdlLmVuZF0sICcgd2hlcmUnKVxuICAgICAgICB9XG4gICAgICB9XG4gICAgICBjb25zdCBuZXdyYW5nZSA9IGVkaXRvci5zZXRUZXh0SW5CdWZmZXJSYW5nZShbcG9zLCBwb3NdLCB0ZXh0KVxuICAgICAgcmV0dXJuIG5ld3JhbmdlLmdldFJvd3MoKS5zbGljZSgxKS5tYXAoKHJvdykgPT5cbiAgICAgICAgZWRpdG9yLnNldEluZGVudGF0aW9uRm9yQnVmZmVyUm93KHJvdywgaW5kZW50KSlcbiAgICB9KVxuICB9XG5cbiAgcHJpdmF0ZSBhc3luYyBnb1RvRGVjbENvbW1hbmQgKHtjdXJyZW50VGFyZ2V0LCBkZXRhaWx9OiBJRXZlbnREZXNjKSB7XG4gICAgY29uc3QgZWRpdG9yID0gY3VycmVudFRhcmdldC5nZXRNb2RlbCgpXG4gICAgY29uc3QgZXZyID0gdGhpcy51cGkuZ2V0RXZlbnRSYW5nZShlZGl0b3IsIGRldGFpbClcbiAgICBpZiAoIWV2cikgeyByZXR1cm4gfVxuICAgIGNvbnN0IHtjcmFuZ2V9ID0gZXZyXG4gICAgY29uc3Qge2luZm99ID0gYXdhaXQgdGhpcy5wcm9jZXNzLmdldEluZm9JbkJ1ZmZlcihlZGl0b3IsIGNyYW5nZSlcbiAgICBjb25zdCByZXMgPSAvLiotLSBEZWZpbmVkIGF0ICguKyk6KFxcZCspOihcXGQrKS8uZXhlYyhpbmZvKVxuICAgIGlmICghcmVzKSB7IHJldHVybiB9XG4gICAgY29uc3QgW2ZuLCBsaW5lLCBjb2xdID0gcmVzLnNsaWNlKDEpXG4gICAgY29uc3Qgcm9vdERpciA9IGF3YWl0IHRoaXMucHJvY2Vzcy5nZXRSb290RGlyKGVkaXRvci5nZXRCdWZmZXIoKSlcbiAgICBpZiAoIXJvb3REaXIpIHsgcmV0dXJuIH1cbiAgICBjb25zdCB1cmkgPSByb290RGlyLmdldEZpbGUoZm4pLmdldFBhdGgoKSB8fCBmblxuICAgIHJldHVybiBhdG9tLndvcmtzcGFjZS5vcGVuKHVyaSwge1xuICAgICAgICBpbml0aWFsTGluZTogcGFyc2VJbnQobGluZSwgMTApIC0gMSxcbiAgICAgICAgaW5pdGlhbENvbHVtbjogcGFyc2VJbnQoY29sLCAxMCkgLSAxXG4gICAgICB9XG4gICAgKVxuICB9XG5cbiAgcHJpdmF0ZSBhc3luYyBpbnNlcnRJbXBvcnRDb21tYW5kICh7Y3VycmVudFRhcmdldCwgZGV0YWlsfTogSUV2ZW50RGVzYykge1xuICAgIGNvbnN0IGVkaXRvciA9IGN1cnJlbnRUYXJnZXQuZ2V0TW9kZWwoKVxuICAgIGNvbnN0IGJ1ZmZlciA9IGVkaXRvci5nZXRCdWZmZXIoKVxuICAgIGNvbnN0IGV2ciA9IHRoaXMudXBpLmdldEV2ZW50UmFuZ2UoZWRpdG9yLCBkZXRhaWwpXG4gICAgaWYgKCFldnIpIHsgcmV0dXJuIH1cbiAgICBjb25zdCB7Y3JhbmdlfSA9IGV2clxuICAgIGNvbnN0IGxpbmVzID0gYXdhaXQgdGhpcy5wcm9jZXNzLmZpbmRTeW1ib2xQcm92aWRlcnNJbkJ1ZmZlcihlZGl0b3IsIGNyYW5nZSlcbiAgICBjb25zdCBtb2QgPSBhd2FpdCBpbXBvcnRMaXN0VmlldyhsaW5lcylcbiAgICBpZiAobW9kKSB7XG4gICAgICBjb25zdCBwaSA9IGF3YWl0IG5ldyBQcm9taXNlPHtwb3M6IEF0b21UeXBlcy5Qb2ludCwgaW5kZW50OiBzdHJpbmcsIGVuZDogc3RyaW5nfT4oKHJlc29sdmUpID0+IHtcbiAgICAgICAgYnVmZmVyLmJhY2t3YXJkc1NjYW4oL14oXFxzKikoaW1wb3J0fG1vZHVsZSkvLCAoeyBtYXRjaCwgcmFuZ2UsIHN0b3AgfSkgPT4ge1xuICAgICAgICAgIGxldCBpbmRlbnQgPSAnJ1xuICAgICAgICAgIHN3aXRjaCAobWF0Y2hbMl0pIHtcbiAgICAgICAgICAgIGNhc2UgJ2ltcG9ydCc6XG4gICAgICAgICAgICAgIGluZGVudCA9IGBcXG4ke21hdGNoWzFdfWBcbiAgICAgICAgICAgICAgYnJlYWtcbiAgICAgICAgICAgIGNhc2UgJ21vZHVsZSc6XG4gICAgICAgICAgICAgIGluZGVudCA9IGBcXG5cXG4ke21hdGNoWzFdfWBcbiAgICAgICAgICAgICAgYnJlYWtcbiAgICAgICAgICB9XG4gICAgICAgICAgcmVzb2x2ZSh7cG9zOiBidWZmZXIucmFuZ2VGb3JSb3cocmFuZ2Uuc3RhcnQucm93KS5lbmQsIGluZGVudCwgZW5kOiAnJ30pXG4gICAgICAgIH0pXG4gICAgICAgIC8vIG5vdGhpbmcgZm91bmRcbiAgICAgICAgcmVzb2x2ZSh7XG4gICAgICAgICAgcG9zOiBidWZmZXIuZ2V0Rmlyc3RQb3NpdGlvbigpLFxuICAgICAgICAgIGluZGVudDogJycsXG4gICAgICAgICAgZW5kOiAnXFxuJ1xuICAgICAgICB9KVxuICAgICAgfSlcbiAgICAgIGVkaXRvci5zZXRUZXh0SW5CdWZmZXJSYW5nZShbcGkucG9zLCBwaS5wb3NdLCBgJHtwaS5pbmRlbnR9aW1wb3J0ICR7bW9kfSR7cGkuZW5kfWApXG4gICAgfVxuICB9XG5cbiAgcHJpdmF0ZSBhc3luYyB0eXBlVG9vbHRpcCAoZTogQXRvbVR5cGVzLlRleHRFZGl0b3IsIHA6IEF0b21UeXBlcy5SYW5nZSkge1xuICAgIGNvbnN0IHtyYW5nZSwgdHlwZX0gPSBhd2FpdCB0aGlzLnByb2Nlc3MuZ2V0VHlwZUluQnVmZmVyKGUuZ2V0QnVmZmVyKCksIHApXG4gICAgcmV0dXJuIHtcbiAgICAgICAgcmFuZ2UsXG4gICAgICAgIHRleHQ6IHtcbiAgICAgICAgICB0ZXh0OiB0eXBlLFxuICAgICAgICAgIGhpZ2hsaWdodGVyOlxuICAgICAgICAgICAgYXRvbS5jb25maWcuZ2V0KCdoYXNrZWxsLWdoYy1tb2QuaGlnaGxpZ2h0VG9vbHRpcHMnKSA/XG4gICAgICAgICAgICAgICdoaW50LnR5cGUuaGFza2VsbCcgOiB1bmRlZmluZWRcbiAgICAgICAgfVxuICAgICAgfVxuICB9XG5cbiAgcHJpdmF0ZSBhc3luYyBpbmZvVG9vbHRpcCAoZTogQXRvbVR5cGVzLlRleHRFZGl0b3IsIHA6IEF0b21UeXBlcy5SYW5nZSkge1xuICAgIGNvbnN0IHtyYW5nZSwgaW5mb30gPSBhd2FpdCB0aGlzLnByb2Nlc3MuZ2V0SW5mb0luQnVmZmVyKGUsIHApXG4gICAgcmV0dXJuIHtcbiAgICAgICAgcmFuZ2UsXG4gICAgICAgIHRleHQ6IHtcbiAgICAgICAgICB0ZXh0OiBpbmZvLFxuICAgICAgICAgIGhpZ2hsaWdodGVyOlxuICAgICAgICAgICAgYXRvbS5jb25maWcuZ2V0KCdoYXNrZWxsLWdoYy1tb2QuaGlnaGxpZ2h0VG9vbHRpcHMnKSA/XG4gICAgICAgICAgICAgICdzb3VyY2UuaGFza2VsbCcgOiB1bmRlZmluZWRcbiAgICAgICAgfVxuICAgICAgfVxuICB9XG5cbiAgcHJpdmF0ZSBhc3luYyBpbmZvVHlwZVRvb2x0aXAgKGU6IEF0b21UeXBlcy5UZXh0RWRpdG9yLCBwOiBBdG9tVHlwZXMuUmFuZ2UpIHtcbiAgICB0cnkge1xuICAgICAgcmV0dXJuIGF3YWl0IHRoaXMuaW5mb1Rvb2x0aXAoZSwgcClcbiAgICB9IGNhdGNoIChlKSB7XG4gICAgICByZXR1cm4gdGhpcy50eXBlVG9vbHRpcChlLCBwKVxuICAgIH1cbiAgfVxuXG4gIHByaXZhdGUgYXN5bmMgdHlwZUluZm9Ub29sdGlwIChlOiBBdG9tVHlwZXMuVGV4dEVkaXRvciwgcDogQXRvbVR5cGVzLlJhbmdlKSB7XG4gICAgdHJ5IHtcbiAgICAgIHJldHVybiBhd2FpdCB0aGlzLnR5cGVUb29sdGlwKGUsIHApXG4gICAgfSBjYXRjaCAoZSkge1xuICAgICAgcmV0dXJuIHRoaXMuaW5mb1Rvb2x0aXAoZSwgcClcbiAgICB9XG4gIH1cblxuICBwcml2YXRlIGFzeW5jIHR5cGVBbmRJbmZvVG9vbHRpcCAoZTogQXRvbVR5cGVzLlRleHRFZGl0b3IsIHA6IEF0b21UeXBlcy5SYW5nZSkge1xuICAgIGNvbnN0IHR5cGVQID0gdGhpcy50eXBlVG9vbHRpcChlLCBwKS5jYXRjaCgoKSA9PiB1bmRlZmluZWQpXG4gICAgY29uc3QgaW5mb1AgPSB0aGlzLmluZm9Ub29sdGlwKGUsIHApLmNhdGNoKCgpID0+IHVuZGVmaW5lZClcbiAgICBjb25zdCBbdHlwZSwgaW5mb10gPSBhd2FpdCBQcm9taXNlLmFsbChbdHlwZVAsIGluZm9QXSlcbiAgICBsZXQgcmFuZ2UsIHRleHQ6IHN0cmluZ1xuICAgIGlmICh0eXBlICYmIGluZm8pIHtcbiAgICAgIHJhbmdlID0gdHlwZS5yYW5nZS51bmlvbihpbmZvLnJhbmdlKVxuICAgICAgdGV4dCA9IGA6OiAke3R5cGUudGV4dC50ZXh0fVxcbiR7aW5mby50ZXh0LnRleHR9YFxuICAgIH0gZWxzZSBpZiAodHlwZSkge1xuICAgICAgcmFuZ2UgPSB0eXBlLnJhbmdlXG4gICAgICB0ZXh0ID0gdHlwZS50ZXh0LnRleHRcbiAgICB9IGVsc2UgaWYgKGluZm8pIHtcbiAgICAgIHJhbmdlID0gaW5mby5yYW5nZVxuICAgICAgdGV4dCA9IGluZm8udGV4dC50ZXh0XG4gICAgfSBlbHNlIHtcbiAgICAgIHRocm93IG5ldyBFcnJvcignR290IG5laXRoZXIgdHlwZSBub3IgaW5mbycpXG4gICAgfVxuICAgIGNvbnN0IGhpZ2hsaWdodGVyID0gYXRvbS5jb25maWcuZ2V0KCdoYXNrZWxsLWdoYy1tb2QuaGlnaGxpZ2h0VG9vbHRpcHMnKSA/ICdzb3VyY2UuaGFza2VsbCcgOiB1bmRlZmluZWRcbiAgICByZXR1cm4geyByYW5nZSwgdGV4dDogeyB0ZXh0LCBoaWdobGlnaHRlciB9IH1cbiAgfVxuXG4gIHByaXZhdGUgc2V0SGlnaGxpZ2h0ZXIgKCkge1xuICAgIGlmIChhdG9tLmNvbmZpZy5nZXQoJ2hhc2tlbGwtZ2hjLW1vZC5oaWdobGlnaHRNZXNzYWdlcycpKSB7XG4gICAgICByZXR1cm4gKG06IFVQSS5JUmVzdWx0SXRlbSk6IFVQSS5JUmVzdWx0SXRlbSA9PiB7XG4gICAgICAgIGlmICh0eXBlb2YgbS5tZXNzYWdlID09PSAnc3RyaW5nJykge1xuICAgICAgICAgIGNvbnN0IG1lc3NhZ2U6IFVQSS5JTWVzc2FnZVRleHQgPSB7XG4gICAgICAgICAgICB0ZXh0OiBtLm1lc3NhZ2UsXG4gICAgICAgICAgICBoaWdobGlnaHRlcjogJ2hpbnQubWVzc2FnZS5oYXNrZWxsJ1xuICAgICAgICAgIH1cbiAgICAgICAgICByZXR1cm4gey4uLm0sIG1lc3NhZ2V9XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgcmV0dXJuIG1cbiAgICAgICAgfVxuICAgICAgfVxuICAgIH0gZWxzZSB7XG4gICAgICByZXR1cm4gKG06IFVQSS5JUmVzdWx0SXRlbSkgPT4gbVxuICAgIH1cbiAgfVxuXG4gIHByaXZhdGUgc2V0TWVzc2FnZXMgKG1lc3NhZ2VzOiBVUEkuSVJlc3VsdEl0ZW1bXSkge1xuICAgIHJldHVybiB0aGlzLnVwaS5zZXRNZXNzYWdlcyhtZXNzYWdlcy5tYXAodGhpcy5zZXRIaWdobGlnaHRlcigpKSlcbiAgfVxuXG4gIHByaXZhdGUgYXN5bmMgY2hlY2tMaW50IChidWZmZXI6IEF0b21UeXBlcy5UZXh0QnVmZmVyLCBvcHQ6ICdTYXZlJyB8ICdDaGFuZ2UnLCBmYXN0OiBib29sZWFuID0gZmFsc2UpIHtcbiAgICBsZXQgcmVzXG4gICAgaWYgKGF0b20uY29uZmlnLmdldChgaGFza2VsbC1naGMtbW9kLm9uJHtvcHR9Q2hlY2tgKSAmJiBhdG9tLmNvbmZpZy5nZXQoYGhhc2tlbGwtZ2hjLW1vZC5vbiR7b3B0fUxpbnRgKSkge1xuICAgICAgcmVzID0gYXdhaXQgdGhpcy5wcm9jZXNzLmRvQ2hlY2tBbmRMaW50KGJ1ZmZlciwgZmFzdClcbiAgICB9IGVsc2UgaWYgKGF0b20uY29uZmlnLmdldChgaGFza2VsbC1naGMtbW9kLm9uJHtvcHR9Q2hlY2tgKSkge1xuICAgICAgcmVzID0gYXdhaXQgdGhpcy5wcm9jZXNzLmRvQ2hlY2tCdWZmZXIoYnVmZmVyLCBmYXN0KVxuICAgIH0gZWxzZSBpZiAoYXRvbS5jb25maWcuZ2V0KGBoYXNrZWxsLWdoYy1tb2Qub24ke29wdH1MaW50YCkpIHtcbiAgICAgIHJlcyA9IGF3YWl0IHRoaXMucHJvY2Vzcy5kb0xpbnRCdWZmZXIoYnVmZmVyLCBmYXN0KVxuICAgIH1cbiAgICBpZiAocmVzKSB7XG4gICAgICB0aGlzLnNldE1lc3NhZ2VzKHJlcylcbiAgICB9XG4gIH1cbn1cbiJdfQ==