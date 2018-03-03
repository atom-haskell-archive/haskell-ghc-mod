"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const tslib_1 = require("tslib");
const atom_1 = require("atom");
const import_list_view_1 = require("./views/import-list-view");
const Util = require("./util");
const { handleException } = Util;
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
        this.lastMessages = { check: [], lint: [] };
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
                {
                    label: 'Show Type And Info',
                    command: 'haskell-ghc-mod:show-type-and-info',
                },
                { label: 'Case Split', command: 'haskell-ghc-mod:case-split' },
                { label: 'Sig Fill', command: 'haskell-ghc-mod:sig-fill' },
                { label: 'Insert Type', command: 'haskell-ghc-mod:insert-type' },
                { label: 'Insert Import', command: 'haskell-ghc-mod:insert-import' },
                {
                    label: 'Go To Declaration',
                    command: 'haskell-ghc-mod:go-to-declaration',
                },
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
                onDidSaveBuffer: async (buffer) => this.checkLint(buffer, 'Save', atom.config.get('haskell-ghc-mod.alwaysInteractiveCheck')),
                onDidStopChanging: async (buffer) => this.checkLint(buffer, 'Change', true),
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
    async shouldShowTooltip(editor, crange, type) {
        const n = type === 'mouse'
            ? 'haskell-ghc-mod.onMouseHoverShow'
            : type === 'selection' ? 'haskell-ghc-mod.onSelectionShow' : undefined;
        const t = n && atom.config.get(n);
        if (t)
            return this[`${t}Tooltip`](editor, crange);
        else
            return undefined;
    }
    async checkCommand({ currentTarget }) {
        const editor = currentTarget.getModel();
        const res = await this.process.doCheckBuffer(editor.getBuffer(), atom.config.get('haskell-ghc-mod.alwaysInteractiveCheck'));
        this.setMessages('check', res);
    }
    async lintCommand({ currentTarget }) {
        const editor = currentTarget.getModel();
        const res = await this.process.doLintBuffer(editor.getBuffer());
        this.setMessages('lint', res);
    }
    tooltipCommand(tooltipfun) {
        return async ({ currentTarget, detail }) => this.upi.showTooltip({
            editor: currentTarget.getModel(),
            detail,
            async tooltip(crange) {
                return tooltipfun(currentTarget.getModel(), crange);
            },
        });
    }
    async insertTypeCommand({ currentTarget, detail }) {
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
        const { type } = await this.process.getTypeInBuffer(editor.getBuffer(), crange);
        if (editor
            .getTextInBufferRange([
            range.end,
            editor.getBuffer().rangeForRow(range.end.row, false).end,
        ])
            .match(/=/)) {
            let indent = editor.getTextInBufferRange([
                [range.start.row, 0],
                range.start,
            ]);
            let birdTrack = '';
            if (editor
                .scopeDescriptorForBufferPosition(pos)
                .getScopesArray()
                .includes('meta.embedded.haskell')) {
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
    }
    async caseSplitCommand({ currentTarget, detail }) {
        const editor = currentTarget.getModel();
        const evr = this.upi.getEventRange(editor, detail);
        if (!evr) {
            return;
        }
        const { crange } = evr;
        const res = await this.process.doCaseSplit(editor.getBuffer(), crange);
        for (const { range, replacement } of res) {
            editor.setTextInBufferRange(range, replacement);
        }
    }
    async sigFillCommand({ currentTarget, detail }) {
        const editor = currentTarget.getModel();
        const evr = this.upi.getEventRange(editor, detail);
        if (!evr) {
            return;
        }
        const { crange } = evr;
        const res = await this.process.doSigFill(editor.getBuffer(), crange);
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
            newrange
                .getRows()
                .slice(1)
                .map((row) => editor.setIndentationForBufferRow(row, indent));
        });
    }
    async goToDeclCommand({ currentTarget, detail }) {
        const editor = currentTarget.getModel();
        const evr = this.upi.getEventRange(editor, detail);
        if (!evr) {
            return;
        }
        const { crange } = evr;
        const { info } = await this.process.getInfoInBuffer(editor, crange);
        const res = /.*-- Defined at (.+):(\d+):(\d+)/.exec(info);
        if (!res) {
            return;
        }
        const [fn, line, col] = res.slice(1);
        const rootDir = await this.process.getRootDir(editor.getBuffer());
        if (!rootDir) {
            return;
        }
        const uri = rootDir.getFile(fn).getPath() || fn;
        await atom.workspace.open(uri, {
            initialLine: parseInt(line, 10) - 1,
            initialColumn: parseInt(col, 10) - 1,
        });
    }
    async insertImportCommand({ currentTarget, detail }) {
        const editor = currentTarget.getModel();
        const buffer = editor.getBuffer();
        const evr = this.upi.getEventRange(editor, detail);
        if (!evr) {
            return;
        }
        const { crange } = evr;
        const lines = await this.process.findSymbolProvidersInBuffer(editor, crange);
        const mod = await import_list_view_1.importListView(lines);
        if (mod) {
            const pi = await new Promise((resolve) => {
                buffer.backwardsScan(/^(\s*)(import|module)/, ({ match, range }) => {
                    let indent = '';
                    switch (match[2]) {
                        case 'import':
                            indent = `\n${match[1]}`;
                            break;
                        case 'module':
                            indent = `\n\n${match[1]}`;
                            break;
                    }
                    resolve({
                        pos: buffer.rangeForRow(range.start.row, false).end,
                        indent,
                        end: '',
                    });
                });
                resolve({
                    pos: buffer.getFirstPosition(),
                    indent: '',
                    end: '\n',
                });
            });
            editor.setTextInBufferRange([pi.pos, pi.pos], `${pi.indent}import ${mod}${pi.end}`);
        }
    }
    async typeTooltip(e, p) {
        const { range, type } = await this.process.getTypeInBuffer(e.getBuffer(), p);
        return {
            range,
            text: {
                text: type,
                highlighter: atom.config.get('haskell-ghc-mod.highlightTooltips')
                    ? 'hint.type.haskell'
                    : undefined,
            },
        };
    }
    async infoTooltip(e, p) {
        const { range, info } = await this.process.getInfoInBuffer(e, p);
        return {
            range,
            text: {
                text: info,
                highlighter: atom.config.get('haskell-ghc-mod.highlightTooltips')
                    ? 'source.haskell'
                    : undefined,
            },
        };
    }
    async infoTypeTooltip(e, p) {
        try {
            return await this.infoTooltip(e, p);
        }
        catch (_a) {
            return this.typeTooltip(e, p);
        }
    }
    async typeInfoTooltip(e, p) {
        try {
            return await this.typeTooltip(e, p);
        }
        catch (_a) {
            return this.infoTooltip(e, p);
        }
    }
    async typeAndInfoTooltip(e, p) {
        const typeP = this.typeTooltip(e, p).catch(() => undefined);
        const infoP = this.infoTooltip(e, p).catch(() => undefined);
        const [type, info] = await Promise.all([typeP, infoP]);
        let range;
        let text;
        if (type && info) {
            range = type.range.union(info.range);
            const sup = atom.config.get('haskell-ghc-mod.suppressRedundantTypeInTypeAndInfoTooltips');
            if (sup && info.text.text.includes(`:: ${type.text.text}`)) {
                text = info.text.text;
            }
            else {
                text = `:: ${type.text.text}\n${info.text.text}`;
            }
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
        const highlighter = atom.config.get('haskell-ghc-mod.highlightTooltips')
            ? 'source.haskell'
            : undefined;
        return { range, text: { text, highlighter } };
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
    setMessages(type, messages) {
        this.lastMessages[type] = messages.map(this.setHighlighter());
        this.sendMessages();
    }
    sendMessages() {
        this.upi.setMessages(this.processMessages.concat(this.lastMessages.check, this.lastMessages.lint));
    }
    async checkLint(buffer, opt, fast) {
        const check = atom.config.get(`haskell-ghc-mod.on${opt}Check`);
        const lint = atom.config.get(`haskell-ghc-mod.on${opt}Lint`);
        const promises = [];
        if (check) {
            promises.push(this.process.doCheckBuffer(buffer, fast).then((res) => {
                this.setMessages('check', res);
            }));
        }
        if (lint) {
            promises.push(this.process.doLintBuffer(buffer).then((res) => {
                this.setMessages('lint', res);
            }));
        }
        await Promise.all(promises);
    }
    consoleReport(arg) {
        console.error(Util.formatError(arg), Util.getErrorDetail(arg));
    }
    handleProcessError(arg) {
        switch (this.msgBackend) {
            case 'upi':
                this.processMessages.push({
                    message: Util.formatError(arg) +
                        '\n\nSee console (View → Developer → Toggle Developer Tools → Console tab) for details.',
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
tslib_1.__decorate([
    handleException,
    tslib_1.__metadata("design:type", Function),
    tslib_1.__metadata("design:paramtypes", [Object]),
    tslib_1.__metadata("design:returntype", Promise)
], UPIConsumer.prototype, "checkCommand", null);
tslib_1.__decorate([
    handleException,
    tslib_1.__metadata("design:type", Function),
    tslib_1.__metadata("design:paramtypes", [Object]),
    tslib_1.__metadata("design:returntype", Promise)
], UPIConsumer.prototype, "lintCommand", null);
tslib_1.__decorate([
    handleException,
    tslib_1.__metadata("design:type", Function),
    tslib_1.__metadata("design:paramtypes", [Object]),
    tslib_1.__metadata("design:returntype", Promise)
], UPIConsumer.prototype, "insertTypeCommand", null);
tslib_1.__decorate([
    handleException,
    tslib_1.__metadata("design:type", Function),
    tslib_1.__metadata("design:paramtypes", [Object]),
    tslib_1.__metadata("design:returntype", Promise)
], UPIConsumer.prototype, "caseSplitCommand", null);
tslib_1.__decorate([
    handleException,
    tslib_1.__metadata("design:type", Function),
    tslib_1.__metadata("design:paramtypes", [Object]),
    tslib_1.__metadata("design:returntype", Promise)
], UPIConsumer.prototype, "sigFillCommand", null);
tslib_1.__decorate([
    handleException,
    tslib_1.__metadata("design:type", Function),
    tslib_1.__metadata("design:paramtypes", [Object]),
    tslib_1.__metadata("design:returntype", Promise)
], UPIConsumer.prototype, "goToDeclCommand", null);
tslib_1.__decorate([
    handleException,
    tslib_1.__metadata("design:type", Function),
    tslib_1.__metadata("design:paramtypes", [Object]),
    tslib_1.__metadata("design:returntype", Promise)
], UPIConsumer.prototype, "insertImportCommand", null);
tslib_1.__decorate([
    handleException,
    tslib_1.__metadata("design:type", Function),
    tslib_1.__metadata("design:paramtypes", [atom_1.TextBuffer, String, Boolean]),
    tslib_1.__metadata("design:returntype", Promise)
], UPIConsumer.prototype, "checkLint", null);
exports.UPIConsumer = UPIConsumer;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidXBpLWNvbnN1bWVyLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vc3JjL3VwaS1jb25zdW1lci50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOzs7QUFBQSwrQkFRYTtBQUViLCtEQUF5RDtBQUN6RCwrQkFBOEI7QUFFOUIsTUFBTSxFQUFFLGVBQWUsRUFBRSxHQUFHLElBQUksQ0FBQTtBQUVoQyxNQUFNLFlBQVksR0FBRztJQUNuQixLQUFLLEVBQUUsRUFBRTtJQUNULE9BQU8sRUFBRSxFQUFFO0lBQ1gsSUFBSSxFQUFFLEVBQUU7Q0FDVCxDQUFBO0FBRUQsTUFBTSxXQUFXLEdBQUc7SUFDbEIsU0FBUyxFQUFFO1FBQ1QsU0FBUyxFQUFFLEtBQUs7UUFDaEIsVUFBVSxFQUFFLElBQUk7S0FDakI7Q0FDRixDQUFBO0FBRUQsTUFBTSxZQUFZLEdBQUcsMkNBQTJDLENBQUE7QUFFaEUsTUFBTSxRQUFRLEdBQUc7SUFDZixLQUFLLEVBQUUsU0FBUztJQUNoQixJQUFJLEVBQUU7UUFDSixFQUFFLEtBQUssRUFBRSxPQUFPLEVBQUUsT0FBTyxFQUFFLDRCQUE0QixFQUFFO1FBQ3pELEVBQUUsS0FBSyxFQUFFLE1BQU0sRUFBRSxPQUFPLEVBQUUsMkJBQTJCLEVBQUU7UUFDdkQsRUFBRSxLQUFLLEVBQUUsY0FBYyxFQUFFLE9BQU8sRUFBRSxrQ0FBa0MsRUFBRTtLQUN2RTtDQUNGLENBQUE7QUFRRDtJQThERSxZQUFZLFFBQThCLEVBQVUsT0FBdUI7UUFBdkIsWUFBTyxHQUFQLE9BQU8sQ0FBZ0I7UUE1RG5FLGdCQUFXLEdBQXdCLElBQUksMEJBQW1CLEVBQUUsQ0FBQTtRQUM1RCxvQkFBZSxHQUFzQixFQUFFLENBQUE7UUFDdkMsaUJBQVksR0FBa0IsRUFBRSxLQUFLLEVBQUUsRUFBRSxFQUFFLElBQUksRUFBRSxFQUFFLEVBQUUsQ0FBQTtRQUNyRCxlQUFVLEdBQUcsSUFBSSxDQUFDLE1BQU0sQ0FBQyxHQUFHLENBQUMsZ0NBQWdDLENBQUMsQ0FB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QUFPLENBQUMsQ0FBQTtnQkFDbEIsSUFBSSxDQUFDLGFBQWEsQ0FBQyxVQUFVLENBQUMsT0FBTyxFQUFFO29CQUNyQyxXQUFXLEVBQUUsS0FBSztpQkFDbkIsQ0FBQyxDQUFBO2dCQUNGLEtBQUssQ0FBQTtRQUNULENBQUM7SUFDSCxDQUFDO0NBQ0Y7QUFsWUM7SUFEQyxlQUFlOzs7OytDQVFmO0FBR0Q7SUFEQyxlQUFlOzs7OzhDQUtmO0FBZ0JEO0lBREMsZUFBZTs7OztvREF1RGY7QUFHRDtJQURDLGVBQWU7Ozs7bURBWWY7QUFHRDtJQURDLGVBQWU7Ozs7aURBNEJmO0FBR0Q7SUFEQyxlQUFlOzs7O2tEQXVCZjtBQUdEO0lBREMsZUFBZTs7OztzREEyQ2Y7QUE0R0Q7SUFEQyxlQUFlOzs2Q0FFTixpQkFBVTs7NENBMEJuQjtBQXpjSCxrQ0E4ZkMiLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQge1xuICBDb21tYW5kRXZlbnQsXG4gIENvbXBvc2l0ZURpc3Bvc2FibGUsXG4gIFJhbmdlLFxuICBUZXh0QnVmZmVyLFxuICBUZXh0RWRpdG9yLFxuICBQb2ludCxcbiAgVGV4dEVkaXRvckVsZW1lbnQsXG59IGZyb20gJ2F0b20nXG5pbXBvcnQgeyBHaGNNb2RpUHJvY2VzcywgSUVycm9yQ2FsbGJhY2tBcmdzIH0gZnJvbSAnLi9naGMtbW9kJ1xuaW1wb3J0IHsgaW1wb3J0TGlzdFZpZXcgfSBmcm9tICcuL3ZpZXdzL2ltcG9ydC1saXN0LXZpZXcnXG5pbXBvcnQgKiBhcyBVdGlsIGZyb20gJy4vdXRpbCdcbmltcG9ydCAqIGFzIFVQSSBmcm9tICdhdG9tLWhhc2tlbGwtdXBpJ1xuY29uc3QgeyBoYW5kbGVFeGNlcHRpb24gfSA9IFV0aWxcblxuY29uc3QgbWVzc2FnZVR5cGVzID0ge1xuICBlcnJvcjoge30sXG4gIHdhcm5pbmc6IHt9LFxuICBsaW50OiB7fSxcbn1cblxuY29uc3QgYWRkTXNnVHlwZXMgPSB7XG4gICdnaGMtbW9kJzoge1xuICAgIHVyaUZpbHRlcjogZmFsc2UsXG4gICAgYXV0b1Njcm9sbDogdHJ1ZSxcbiAgfSxcbn1cblxuY29uc3QgY29udGV4dFNjb3BlID0gJ2F0b20tdGV4dC1lZGl0b3JbZGF0YS1ncmFtbWFyfj1cImhhc2tlbGxcIl0nXG5cbmNvbnN0IG1haW5NZW51ID0ge1xuICBsYWJlbDogJ2doYy1tb2QnLFxuICBtZW51OiBbXG4gICAgeyBsYWJlbDogJ0NoZWNrJywgY29tbWFuZDogJ2hhc2tlbGwtZ2hjLW1vZDpjaGVjay1maWxlJyB9LFxuICAgIHsgbGFiZWw6ICdMaW50JywgY29tbWFuZDogJ2hhc2tlbGwtZ2hjLW1vZDpsaW50LWZpbGUnIH0sXG4gICAgeyBsYWJlbDogJ1N0b3AgQmFja2VuZCcsIGNvbW1hbmQ6ICdoYXNrZWxsLWdoYy1tb2Q6c2h1dGRvd24tYmFja2VuZCcgfSxcbiAgXSxcbn1cblxudHlwZSBURUNvbW1hbmRFdmVudCA9IENvbW1hbmRFdmVudDxUZXh0RWRpdG9yRWxlbWVudD5cbnR5cGUgVExhc3RNZXNzYWdlcyA9IHtcbiAgY2hlY2s6IFVQSS5JUmVzdWx0SXRlbVtdXG4gIGxpbnQ6IFVQSS5JUmVzdWx0SXRlbVtdXG59XG5cbmV4cG9ydCBjbGFzcyBVUElDb25zdW1lciB7XG4gIHB1YmxpYyB1cGk6IFVQSS5JVVBJSW5zdGFuY2VcbiAgcHJpdmF0ZSBkaXNwb3NhYmxlczogQ29tcG9zaXRlRGlzcG9zYWJsZSA9IG5ldyBDb21wb3NpdGVEaXNwb3NhYmxlKClcbiAgcHJpdmF0ZSBwcm9jZXNzTWVzc2FnZXM6IFVQSS5JUmVzdWx0SXRlbVtdID0gW11cbiAgcHJpdmF0ZSBsYXN0TWVzc2FnZXM6IFRMYXN0TWVzc2FnZXMgPSB7IGNoZWNrOiBbXSwgbGludDogW10gfVxuICBwcml2YXRlIG1zZ0JhY2tlbmQgPSBhdG9tLmNvbmZpZy5nZXQoJ2hhc2tlbGwtZ2hjLW1vZC5naGNNb2RNZXNzYWdlcycpXG5cbiAgcHJpdmF0ZSBjb250ZXh0Q29tbWFuZHMgPSB7XG4gICAgJ2hhc2tlbGwtZ2hjLW1vZDpzaG93LXR5cGUnOiB0aGlzLnRvb2x0aXBDb21tYW5kKFxuICAgICAgdGhpcy50eXBlVG9vbHRpcC5iaW5kKHRoaXMpLFxuICAgICksXG4gICAgJ2hhc2tlbGwtZ2hjLW1vZDpzaG93LWluZm8nOiB0aGlzLnRvb2x0aXBDb21tYW5kKFxuICAgICAgdGhpcy5pbmZvVG9vbHRpcC5iaW5kKHRoaXMpLFxuICAgICksXG4gICAgJ2hhc2tlbGwtZ2hjLW1vZDpjYXNlLXNwbGl0JzogdGhpcy5jYXNlU3BsaXRDb21tYW5kLmJpbmQodGhpcyksXG4gICAgJ2hhc2tlbGwtZ2hjLW1vZDpzaWctZmlsbCc6IHRoaXMuc2lnRmlsbENvbW1hbmQuYmluZCh0aGlzKSxcbiAgICAnaGFza2VsbC1naGMtbW9kOmdvLXRvLWRlY2xhcmF0aW9uJzogdGhpcy5nb1RvRGVjbENvbW1hbmQuYmluZCh0aGlzKSxcbiAgICAnaGFza2VsbC1naGMtbW9kOnNob3ctaW5mby1mYWxsYmFjay10by10eXBlJzogdGhpcy50b29sdGlwQ29tbWFuZChcbiAgICAgIHRoaXMuaW5mb1R5cGVUb29sdGlwLmJpbmQodGhpcyksXG4gICAgKSxcbiAgICAnaGFza2VsbC1naGMtbW9kOnNob3ctdHlwZS1mYWxsYmFjay10by1pbmZvJzogdGhpcy50b29sdGlwQ29tbWFuZChcbiAgICAgIHRoaXMudHlwZUluZm9Ub29sdGlwLmJpbmQodGhpcyksXG4gICAgKSxcbiAgICAnaGFza2VsbC1naGMtbW9kOnNob3ctdHlwZS1hbmQtaW5mbyc6IHRoaXMudG9vbHRpcENvbW1hbmQoXG4gICAgICB0aGlzLnR5cGVBbmRJbmZvVG9vbHRpcC5iaW5kKHRoaXMpLFxuICAgICksXG4gICAgJ2hhc2tlbGwtZ2hjLW1vZDppbnNlcnQtdHlwZSc6IHRoaXMuaW5zZXJ0VHlwZUNvbW1hbmQuYmluZCh0aGlzKSxcbiAgICAnaGFza2VsbC1naGMtbW9kOmluc2VydC1pbXBvcnQnOiB0aGlzLmluc2VydEltcG9ydENvbW1hbmQuYmluZCh0aGlzKSxcbiAgfVxuXG4gIHByaXZhdGUgZ2xvYmFsQ29tbWFuZHMgPSB7XG4gICAgJ2hhc2tlbGwtZ2hjLW1vZDpjaGVjay1maWxlJzogdGhpcy5jaGVja0NvbW1hbmQuYmluZCh0aGlzKSxcbiAgICAnaGFza2VsbC1naGMtbW9kOmxpbnQtZmlsZSc6IHRoaXMubGludENvbW1hbmQuYmluZCh0aGlzKSxcbiAgICAuLi50aGlzLmNvbnRleHRDb21tYW5kcyxcbiAgfVxuXG4gIHByaXZhdGUgY29udGV4dE1lbnU6IHtcbiAgICBsYWJlbDogc3RyaW5nXG4gICAgc3VibWVudTogQXJyYXk8e1xuICAgICAgbGFiZWw6IHN0cmluZ1xuICAgICAgY29tbWFuZDoga2V5b2YgVVBJQ29uc3VtZXJbJ2NvbnRleHRDb21tYW5kcyddXG4gICAgfT5cbiAgfSA9IHtcbiAgICBsYWJlbDogJ2doYy1tb2QnLFxuICAgIHN1Ym1lbnU6IFtcbiAgICAgIHsgbGFiZWw6ICdTaG93IFR5cGUnLCBjb21tYW5kOiAnaGFza2VsbC1naGMtbW9kOnNob3ctdHlwZScgfSxcbiAgICAgIHsgbGFiZWw6ICdTaG93IEluZm8nLCBjb21tYW5kOiAnaGFza2VsbC1naGMtbW9kOnNob3ctaW5mbycgfSxcbiAgICAgIHtcbiAgICAgICAgbGFiZWw6ICdTaG93IFR5cGUgQW5kIEluZm8nLFxuICAgICAgICBjb21tYW5kOiAnaGFza2VsbC1naGMtbW9kOnNob3ctdHlwZS1hbmQtaW5mbycsXG4gICAgICB9LFxuICAgICAgeyBsYWJlbDogJ0Nhc2UgU3BsaXQnLCBjb21tYW5kOiAnaGFza2VsbC1naGMtbW9kOmNhc2Utc3BsaXQnIH0sXG4gICAgICB7IGxhYmVsOiAnU2lnIEZpbGwnLCBjb21tYW5kOiAnaGFza2VsbC1naGMtbW9kOnNpZy1maWxsJyB9LFxuICAgICAgeyBsYWJlbDogJ0luc2VydCBUeXBlJywgY29tbWFuZDogJ2hhc2tlbGwtZ2hjLW1vZDppbnNlcnQtdHlwZScgfSxcbiAgICAgIHsgbGFiZWw6ICdJbnNlcnQgSW1wb3J0JywgY29tbWFuZDogJ2hhc2tlbGwtZ2hjLW1vZDppbnNlcnQtaW1wb3J0JyB9LFxuICAgICAge1xuICAgICAgICBsYWJlbDogJ0dvIFRvIERlY2xhcmF0aW9uJyxcbiAgICAgICAgY29tbWFuZDogJ2hhc2tlbGwtZ2hjLW1vZDpnby10by1kZWNsYXJhdGlvbicsXG4gICAgICB9LFxuICAgIF0sXG4gIH1cblxuICBjb25zdHJ1Y3RvcihyZWdpc3RlcjogVVBJLklVUElSZWdpc3RyYXRpb24sIHByaXZhdGUgcHJvY2VzczogR2hjTW9kaVByb2Nlc3MpIHtcbiAgICB0aGlzLmRpc3Bvc2FibGVzLmFkZChcbiAgICAgIHRoaXMucHJvY2Vzcy5vbkVycm9yKHRoaXMuaGFuZGxlUHJvY2Vzc0Vycm9yLmJpbmQodGhpcykpLFxuICAgICAgdGhpcy5wcm9jZXNzLm9uV2FybmluZyh0aGlzLmhhbmRsZVByb2Nlc3NXYXJuaW5nLmJpbmQodGhpcykpLFxuICAgIClcblxuICAgIGNvbnN0IG1zZ1R5cGVzID1cbiAgICAgIHRoaXMubXNnQmFja2VuZCA9PT0gJ3VwaSdcbiAgICAgICAgPyB7IC4uLm1lc3NhZ2VUeXBlcywgLi4uYWRkTXNnVHlwZXMgfVxuICAgICAgICA6IG1lc3NhZ2VUeXBlc1xuXG4gICAgdGhpcy51cGkgPSByZWdpc3Rlcih7XG4gICAgICBuYW1lOiAnaGFza2VsbC1naGMtbW9kJyxcbiAgICAgIG1lbnU6IG1haW5NZW51LFxuICAgICAgbWVzc2FnZVR5cGVzOiBtc2dUeXBlcyxcbiAgICAgIHRvb2x0aXA6IHRoaXMuc2hvdWxkU2hvd1Rvb2x0aXAuYmluZCh0aGlzKSxcbiAgICAgIGV2ZW50czoge1xuICAgICAgICBvbkRpZFNhdmVCdWZmZXI6IGFzeW5jIChidWZmZXIpID0+XG4gICAgICAgICAgdGhpcy5jaGVja0xpbnQoXG4gICAgICAgICAgICBidWZmZXIsXG4gICAgICAgICAgICAnU2F2ZScsXG4gICAgICAgICAgICBhdG9tLmNvbmZpZy5nZXQoJ2hhc2tlbGwtZ2hjLW1vZC5hbHdheXNJbnRlcmFjdGl2ZUNoZWNrJyksXG4gICAgICAgICAgKSxcbiAgICAgICAgb25EaWRTdG9wQ2hhbmdpbmc6IGFzeW5jIChidWZmZXIpID0+XG4gICAgICAgICAgdGhpcy5jaGVja0xpbnQoYnVmZmVyLCAnQ2hhbmdlJywgdHJ1ZSksXG4gICAgICB9LFxuICAgIH0pXG5cbiAgICB0aGlzLmRpc3Bvc2FibGVzLmFkZChcbiAgICAgIHRoaXMudXBpLFxuICAgICAgdGhpcy5wcm9jZXNzLm9uQmFja2VuZEFjdGl2ZSgoKSA9PlxuICAgICAgICB0aGlzLnVwaS5zZXRTdGF0dXMoeyBzdGF0dXM6ICdwcm9ncmVzcycsIGRldGFpbDogJycgfSksXG4gICAgICApLFxuICAgICAgdGhpcy5wcm9jZXNzLm9uQmFja2VuZElkbGUoKCkgPT5cbiAgICAgICAgdGhpcy51cGkuc2V0U3RhdHVzKHsgc3RhdHVzOiAncmVhZHknLCBkZXRhaWw6ICcnIH0pLFxuICAgICAgKSxcbiAgICAgIGF0b20uY29tbWFuZHMuYWRkKGNvbnRleHRTY29wZSwgdGhpcy5nbG9iYWxDb21tYW5kcyksXG4gICAgKVxuICAgIGNvbnN0IGNtID0ge31cbiAgICBjbVtjb250ZXh0U2NvcGVdID0gW3RoaXMuY29udGV4dE1lbnVdXG4gICAgdGhpcy5kaXNwb3NhYmxlcy5hZGQoYXRvbS5jb250ZXh0TWVudS5hZGQoY20pKVxuICB9XG5cbiAgcHVibGljIGRpc3Bvc2UoKSB7XG4gICAgdGhpcy5kaXNwb3NhYmxlcy5kaXNwb3NlKClcbiAgfVxuXG4gIHByaXZhdGUgYXN5bmMgc2hvdWxkU2hvd1Rvb2x0aXAoXG4gICAgZWRpdG9yOiBUZXh0RWRpdG9yLFxuICAgIGNyYW5nZTogUmFuZ2UsXG4gICAgdHlwZTogVVBJLlRFdmVudFJhbmdlVHlwZSxcbiAgKTogUHJvbWlzZTxVUEkuSVRvb2x0aXBEYXRhIHwgdW5kZWZpbmVkPiB7XG4gICAgY29uc3QgbiA9XG4gICAgICB0eXBlID09PSAnbW91c2UnXG4gICAgICAgID8gJ2hhc2tlbGwtZ2hjLW1vZC5vbk1vdXNlSG92ZXJTaG93J1xuICAgICAgICA6IHR5cGUgPT09ICdzZWxlY3Rpb24nID8gJ2hhc2tlbGwtZ2hjLW1vZC5vblNlbGVjdGlvblNob3cnIDogdW5kZWZpbmVkXG4gICAgY29uc3QgdCA9IG4gJiYgYXRvbS5jb25maWcuZ2V0KG4pXG4gICAgaWYgKHQpIHJldHVybiB0aGlzW2Ake3R9VG9vbHRpcGBdKGVkaXRvciwgY3JhbmdlKVxuICAgIGVsc2UgcmV0dXJuIHVuZGVmaW5lZFxuICB9XG5cbiAgQGhhbmRsZUV4Y2VwdGlvblxuICBwcml2YXRlIGFzeW5jIGNoZWNrQ29tbWFuZCh7IGN1cnJlbnRUYXJnZXQgfTogVEVDb21tYW5kRXZlbnQpIHtcbiAgICBjb25zdCBlZGl0b3IgPSBjdXJyZW50VGFyZ2V0LmdldE1vZGVsKClcbiAgICBjb25zdCByZXMgPSBhd2FpdCB0aGlzLnByb2Nlc3MuZG9DaGVja0J1ZmZlcihcbiAgICAgIGVkaXRvci5nZXRCdWZmZXIoKSxcbiAgICAgIGF0b20uY29uZmlnLmdldCgnaGFza2VsbC1naGMtbW9kLmFsd2F5c0ludGVyYWN0aXZlQ2hlY2snKSxcbiAgICApXG4gICAgdGhpcy5zZXRNZXNzYWdlcygnY2hlY2snLCByZXMpXG4gIH1cblxuICBAaGFuZGxlRXhjZXB0aW9uXG4gIHByaXZhdGUgYXN5bmMgbGludENvbW1hbmQoeyBjdXJyZW50VGFyZ2V0IH06IFRFQ29tbWFuZEV2ZW50KSB7XG4gICAgY29uc3QgZWRpdG9yID0gY3VycmVudFRhcmdldC5nZXRNb2RlbCgpXG4gICAgY29uc3QgcmVzID0gYXdhaXQgdGhpcy5wcm9jZXNzLmRvTGludEJ1ZmZlcihlZGl0b3IuZ2V0QnVmZmVyKCkpXG4gICAgdGhpcy5zZXRNZXNzYWdlcygnbGludCcsIHJlcylcbiAgfVxuXG4gIHByaXZhdGUgdG9vbHRpcENvbW1hbmQoXG4gICAgdG9vbHRpcGZ1bjogKGU6IFRleHRFZGl0b3IsIHA6IFJhbmdlKSA9PiBQcm9taXNlPFVQSS5JVG9vbHRpcERhdGE+LFxuICApIHtcbiAgICByZXR1cm4gYXN5bmMgKHsgY3VycmVudFRhcmdldCwgZGV0YWlsIH06IFRFQ29tbWFuZEV2ZW50KSA9PlxuICAgICAgdGhpcy51cGkuc2hvd1Rvb2x0aXAoe1xuICAgICAgICBlZGl0b3I6IGN1cnJlbnRUYXJnZXQuZ2V0TW9kZWwoKSxcbiAgICAgICAgZGV0YWlsLFxuICAgICAgICBhc3luYyB0b29sdGlwKGNyYW5nZSkge1xuICAgICAgICAgIHJldHVybiB0b29sdGlwZnVuKGN1cnJlbnRUYXJnZXQuZ2V0TW9kZWwoKSwgY3JhbmdlKVxuICAgICAgICB9LFxuICAgICAgfSlcbiAgfVxuXG4gIEBoYW5kbGVFeGNlcHRpb25cbiAgcHJpdmF0ZSBhc3luYyBpbnNlcnRUeXBlQ29tbWFuZCh7IGN1cnJlbnRUYXJnZXQsIGRldGFpbCB9OiBURUNvbW1hbmRFdmVudCkge1xuICAgIGNvbnN0IGVkaXRvciA9IGN1cnJlbnRUYXJnZXQuZ2V0TW9kZWwoKVxuICAgIGNvbnN0IGVyID0gdGhpcy51cGkuZ2V0RXZlbnRSYW5nZShlZGl0b3IsIGRldGFpbClcbiAgICBpZiAoZXIgPT09IHVuZGVmaW5lZCkge1xuICAgICAgcmV0dXJuXG4gICAgfVxuICAgIGNvbnN0IHsgY3JhbmdlLCBwb3MgfSA9IGVyXG4gICAgY29uc3Qgc3ltSW5mbyA9IFV0aWwuZ2V0U3ltYm9sQXRQb2ludChlZGl0b3IsIHBvcylcbiAgICBpZiAoIXN5bUluZm8pIHtcbiAgICAgIHJldHVyblxuICAgIH1cbiAgICBjb25zdCB7IHNjb3BlLCByYW5nZSwgc3ltYm9sIH0gPSBzeW1JbmZvXG4gICAgaWYgKHNjb3BlLnN0YXJ0c1dpdGgoJ2tleXdvcmQub3BlcmF0b3IuJykpIHtcbiAgICAgIHJldHVyblxuICAgIH0gLy8gY2FuJ3QgY29ycmVjdGx5IGhhbmRsZSBpbmZpeCBub3RhdGlvblxuICAgIGNvbnN0IHsgdHlwZSB9ID0gYXdhaXQgdGhpcy5wcm9jZXNzLmdldFR5cGVJbkJ1ZmZlcihcbiAgICAgIGVkaXRvci5nZXRCdWZmZXIoKSxcbiAgICAgIGNyYW5nZSxcbiAgICApXG4gICAgaWYgKFxuICAgICAgZWRpdG9yXG4gICAgICAgIC5nZXRUZXh0SW5CdWZmZXJSYW5nZShbXG4gICAgICAgICAgcmFuZ2UuZW5kLFxuICAgICAgICAgIGVkaXRvci5nZXRCdWZmZXIoKS5yYW5nZUZvclJvdyhyYW5nZS5lbmQucm93LCBmYWxzZSkuZW5kLFxuICAgICAgICBdKVxuICAgICAgICAubWF0Y2goLz0vKVxuICAgICkge1xuICAgICAgbGV0IGluZGVudCA9IGVkaXRvci5nZXRUZXh0SW5CdWZmZXJSYW5nZShbXG4gICAgICAgIFtyYW5nZS5zdGFydC5yb3csIDBdLFxuICAgICAgICByYW5nZS5zdGFydCxcbiAgICAgIF0pXG4gICAgICBsZXQgYmlyZFRyYWNrID0gJydcbiAgICAgIGlmIChcbiAgICAgICAgZWRpdG9yXG4gICAgICAgICAgLnNjb3BlRGVzY3JpcHRvckZvckJ1ZmZlclBvc2l0aW9uKHBvcylcbiAgICAgICAgICAuZ2V0U2NvcGVzQXJyYXkoKVxuICAgICAgICAgIC5pbmNsdWRlcygnbWV0YS5lbWJlZGRlZC5oYXNrZWxsJylcbiAgICAgICkge1xuICAgICAgICBiaXJkVHJhY2sgPSBpbmRlbnQuc2xpY2UoMCwgMilcbiAgICAgICAgaW5kZW50ID0gaW5kZW50LnNsaWNlKDIpXG4gICAgICB9XG4gICAgICBpZiAoaW5kZW50Lm1hdGNoKC9cXFMvKSkge1xuICAgICAgICBpbmRlbnQgPSBpbmRlbnQucmVwbGFjZSgvXFxTL2csICcgJylcbiAgICAgIH1cbiAgICAgIGVkaXRvci5zZXRUZXh0SW5CdWZmZXJSYW5nZShcbiAgICAgICAgW3JhbmdlLnN0YXJ0LCByYW5nZS5zdGFydF0sXG4gICAgICAgIGAke3N5bWJvbH0gOjogJHt0eXBlfVxcbiR7YmlyZFRyYWNrfSR7aW5kZW50fWAsXG4gICAgICApXG4gICAgfSBlbHNlIHtcbiAgICAgIGVkaXRvci5zZXRUZXh0SW5CdWZmZXJSYW5nZShcbiAgICAgICAgcmFuZ2UsXG4gICAgICAgIGAoJHtlZGl0b3IuZ2V0VGV4dEluQnVmZmVyUmFuZ2UocmFuZ2UpfSA6OiAke3R5cGV9KWAsXG4gICAgICApXG4gICAgfVxuICB9XG5cbiAgQGhhbmRsZUV4Y2VwdGlvblxuICBwcml2YXRlIGFzeW5jIGNhc2VTcGxpdENvbW1hbmQoeyBjdXJyZW50VGFyZ2V0LCBkZXRhaWwgfTogVEVDb21tYW5kRXZlbnQpIHtcbiAgICBjb25zdCBlZGl0b3IgPSBjdXJyZW50VGFyZ2V0LmdldE1vZGVsKClcbiAgICBjb25zdCBldnIgPSB0aGlzLnVwaS5nZXRFdmVudFJhbmdlKGVkaXRvciwgZGV0YWlsKVxuICAgIGlmICghZXZyKSB7XG4gICAgICByZXR1cm5cbiAgICB9XG4gICAgY29uc3QgeyBjcmFuZ2UgfSA9IGV2clxuICAgIGNvbnN0IHJlcyA9IGF3YWl0IHRoaXMucHJvY2Vzcy5kb0Nhc2VTcGxpdChlZGl0b3IuZ2V0QnVmZmVyKCksIGNyYW5nZSlcbiAgICBmb3IgKGNvbnN0IHsgcmFuZ2UsIHJlcGxhY2VtZW50IH0gb2YgcmVzKSB7XG4gICAgICBlZGl0b3Iuc2V0VGV4dEluQnVmZmVyUmFuZ2UocmFuZ2UsIHJlcGxhY2VtZW50KVxuICAgIH1cbiAgfVxuXG4gIEBoYW5kbGVFeGNlcHRpb25cbiAgcHJpdmF0ZSBhc3luYyBzaWdGaWxsQ29tbWFuZCh7IGN1cnJlbnRUYXJnZXQsIGRldGFpbCB9OiBURUNvbW1hbmRFdmVudCkge1xuICAgIGNvbnN0IGVkaXRvciA9IGN1cnJlbnRUYXJnZXQuZ2V0TW9kZWwoKVxuICAgIGNvbnN0IGV2ciA9IHRoaXMudXBpLmdldEV2ZW50UmFuZ2UoZWRpdG9yLCBkZXRhaWwpXG4gICAgaWYgKCFldnIpIHtcbiAgICAgIHJldHVyblxuICAgIH1cbiAgICBjb25zdCB7IGNyYW5nZSB9ID0gZXZyXG4gICAgY29uc3QgcmVzID0gYXdhaXQgdGhpcy5wcm9jZXNzLmRvU2lnRmlsbChlZGl0b3IuZ2V0QnVmZmVyKCksIGNyYW5nZSlcblxuICAgIGVkaXRvci50cmFuc2FjdCgoKSA9PiB7XG4gICAgICBjb25zdCB7IHR5cGUsIHJhbmdlLCBib2R5IH0gPSByZXNcbiAgICAgIGNvbnN0IHNpZyA9IGVkaXRvci5nZXRUZXh0SW5CdWZmZXJSYW5nZShyYW5nZSlcbiAgICAgIGxldCBpbmRlbnQgPSBlZGl0b3IuaW5kZW50TGV2ZWxGb3JMaW5lKHNpZylcbiAgICAgIGNvbnN0IHBvcyA9IHJhbmdlLmVuZFxuICAgICAgY29uc3QgdGV4dCA9IGBcXG4ke2JvZHl9YFxuICAgICAgaWYgKHR5cGUgPT09ICdpbnN0YW5jZScpIHtcbiAgICAgICAgaW5kZW50ICs9IDFcbiAgICAgICAgaWYgKCFzaWcuZW5kc1dpdGgoJyB3aGVyZScpKSB7XG4gICAgICAgICAgZWRpdG9yLnNldFRleHRJbkJ1ZmZlclJhbmdlKFtyYW5nZS5lbmQsIHJhbmdlLmVuZF0sICcgd2hlcmUnKVxuICAgICAgICB9XG4gICAgICB9XG4gICAgICBjb25zdCBuZXdyYW5nZSA9IGVkaXRvci5zZXRUZXh0SW5CdWZmZXJSYW5nZShbcG9zLCBwb3NdLCB0ZXh0KVxuICAgICAgbmV3cmFuZ2VcbiAgICAgICAgLmdldFJvd3MoKVxuICAgICAgICAuc2xpY2UoMSlcbiAgICAgICAgLm1hcCgocm93KSA9PiBlZGl0b3Iuc2V0SW5kZW50YXRpb25Gb3JCdWZmZXJSb3cocm93LCBpbmRlbnQpKVxuICAgIH0pXG4gIH1cblxuICBAaGFuZGxlRXhjZXB0aW9uXG4gIHByaXZhdGUgYXN5bmMgZ29Ub0RlY2xDb21tYW5kKHsgY3VycmVudFRhcmdldCwgZGV0YWlsIH06IFRFQ29tbWFuZEV2ZW50KSB7XG4gICAgY29uc3QgZWRpdG9yID0gY3VycmVudFRhcmdldC5nZXRNb2RlbCgpXG4gICAgY29uc3QgZXZyID0gdGhpcy51cGkuZ2V0RXZlbnRSYW5nZShlZGl0b3IsIGRldGFpbClcbiAgICBpZiAoIWV2cikge1xuICAgICAgcmV0dXJuXG4gICAgfVxuICAgIGNvbnN0IHsgY3JhbmdlIH0gPSBldnJcbiAgICBjb25zdCB7IGluZm8gfSA9IGF3YWl0IHRoaXMucHJvY2Vzcy5nZXRJbmZvSW5CdWZmZXIoZWRpdG9yLCBjcmFuZ2UpXG4gICAgY29uc3QgcmVzID0gLy4qLS0gRGVmaW5lZCBhdCAoLispOihcXGQrKTooXFxkKykvLmV4ZWMoaW5mbylcbiAgICBpZiAoIXJlcykge1xuICAgICAgcmV0dXJuXG4gICAgfVxuICAgIGNvbnN0IFtmbiwgbGluZSwgY29sXSA9IHJlcy5zbGljZSgxKVxuICAgIGNvbnN0IHJvb3REaXIgPSBhd2FpdCB0aGlzLnByb2Nlc3MuZ2V0Um9vdERpcihlZGl0b3IuZ2V0QnVmZmVyKCkpXG4gICAgaWYgKCFyb290RGlyKSB7XG4gICAgICByZXR1cm5cbiAgICB9XG4gICAgY29uc3QgdXJpID0gcm9vdERpci5nZXRGaWxlKGZuKS5nZXRQYXRoKCkgfHwgZm5cbiAgICBhd2FpdCBhdG9tLndvcmtzcGFjZS5vcGVuKHVyaSwge1xuICAgICAgaW5pdGlhbExpbmU6IHBhcnNlSW50KGxpbmUsIDEwKSAtIDEsXG4gICAgICBpbml0aWFsQ29sdW1uOiBwYXJzZUludChjb2wsIDEwKSAtIDEsXG4gICAgfSlcbiAgfVxuXG4gIEBoYW5kbGVFeGNlcHRpb25cbiAgcHJpdmF0ZSBhc3luYyBpbnNlcnRJbXBvcnRDb21tYW5kKHsgY3VycmVudFRhcmdldCwgZGV0YWlsIH06IFRFQ29tbWFuZEV2ZW50KSB7XG4gICAgY29uc3QgZWRpdG9yID0gY3VycmVudFRhcmdldC5nZXRNb2RlbCgpXG4gICAgY29uc3QgYnVmZmVyID0gZWRpdG9yLmdldEJ1ZmZlcigpXG4gICAgY29uc3QgZXZyID0gdGhpcy51cGkuZ2V0RXZlbnRSYW5nZShlZGl0b3IsIGRldGFpbClcbiAgICBpZiAoIWV2cikge1xuICAgICAgcmV0dXJuXG4gICAgfVxuICAgIGNvbnN0IHsgY3JhbmdlIH0gPSBldnJcbiAgICBjb25zdCBsaW5lcyA9IGF3YWl0IHRoaXMucHJvY2Vzcy5maW5kU3ltYm9sUHJvdmlkZXJzSW5CdWZmZXIoZWRpdG9yLCBjcmFuZ2UpXG4gICAgY29uc3QgbW9kID0gYXdhaXQgaW1wb3J0TGlzdFZpZXcobGluZXMpXG4gICAgaWYgKG1vZCkge1xuICAgICAgY29uc3QgcGkgPSBhd2FpdCBuZXcgUHJvbWlzZTx7IHBvczogUG9pbnQ7IGluZGVudDogc3RyaW5nOyBlbmQ6IHN0cmluZyB9PihcbiAgICAgICAgKHJlc29sdmUpID0+IHtcbiAgICAgICAgICBidWZmZXIuYmFja3dhcmRzU2NhbigvXihcXHMqKShpbXBvcnR8bW9kdWxlKS8sICh7IG1hdGNoLCByYW5nZSB9KSA9PiB7XG4gICAgICAgICAgICBsZXQgaW5kZW50ID0gJydcbiAgICAgICAgICAgIHN3aXRjaCAobWF0Y2hbMl0pIHtcbiAgICAgICAgICAgICAgY2FzZSAnaW1wb3J0JzpcbiAgICAgICAgICAgICAgICBpbmRlbnQgPSBgXFxuJHttYXRjaFsxXX1gXG4gICAgICAgICAgICAgICAgYnJlYWtcbiAgICAgICAgICAgICAgY2FzZSAnbW9kdWxlJzpcbiAgICAgICAgICAgICAgICBpbmRlbnQgPSBgXFxuXFxuJHttYXRjaFsxXX1gXG4gICAgICAgICAgICAgICAgYnJlYWtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHJlc29sdmUoe1xuICAgICAgICAgICAgICBwb3M6IGJ1ZmZlci5yYW5nZUZvclJvdyhyYW5nZS5zdGFydC5yb3csIGZhbHNlKS5lbmQsXG4gICAgICAgICAgICAgIGluZGVudCxcbiAgICAgICAgICAgICAgZW5kOiAnJyxcbiAgICAgICAgICAgIH0pXG4gICAgICAgICAgfSlcbiAgICAgICAgICAvLyBub3RoaW5nIGZvdW5kXG4gICAgICAgICAgcmVzb2x2ZSh7XG4gICAgICAgICAgICBwb3M6IGJ1ZmZlci5nZXRGaXJzdFBvc2l0aW9uKCksXG4gICAgICAgICAgICBpbmRlbnQ6ICcnLFxuICAgICAgICAgICAgZW5kOiAnXFxuJyxcbiAgICAgICAgICB9KVxuICAgICAgICB9LFxuICAgICAgKVxuICAgICAgZWRpdG9yLnNldFRleHRJbkJ1ZmZlclJhbmdlKFxuICAgICAgICBbcGkucG9zLCBwaS5wb3NdLFxuICAgICAgICBgJHtwaS5pbmRlbnR9aW1wb3J0ICR7bW9kfSR7cGkuZW5kfWAsXG4gICAgICApXG4gICAgfVxuICB9XG5cbiAgcHJpdmF0ZSBhc3luYyB0eXBlVG9vbHRpcChlOiBUZXh0RWRpdG9yLCBwOiBSYW5nZSkge1xuICAgIGNvbnN0IHsgcmFuZ2UsIHR5cGUgfSA9IGF3YWl0IHRoaXMucHJvY2Vzcy5nZXRUeXBlSW5CdWZmZXIoZS5nZXRCdWZmZXIoKSwgcClcbiAgICByZXR1cm4ge1xuICAgICAgcmFuZ2UsXG4gICAgICB0ZXh0OiB7XG4gICAgICAgIHRleHQ6IHR5cGUsXG4gICAgICAgIGhpZ2hsaWdodGVyOiBhdG9tLmNvbmZpZy5nZXQoJ2hhc2tlbGwtZ2hjLW1vZC5oaWdobGlnaHRUb29sdGlwcycpXG4gICAgICAgICAgPyAnaGludC50eXBlLmhhc2tlbGwnXG4gICAgICAgICAgOiB1bmRlZmluZWQsXG4gICAgICB9LFxuICAgIH1cbiAgfVxuXG4gIHByaXZhdGUgYXN5bmMgaW5mb1Rvb2x0aXAoZTogVGV4dEVkaXRvciwgcDogUmFuZ2UpIHtcbiAgICBjb25zdCB7IHJhbmdlLCBpbmZvIH0gPSBhd2FpdCB0aGlzLnByb2Nlc3MuZ2V0SW5mb0luQnVmZmVyKGUsIHApXG4gICAgcmV0dXJuIHtcbiAgICAgIHJhbmdlLFxuICAgICAgdGV4dDoge1xuICAgICAgICB0ZXh0OiBpbmZvLFxuICAgICAgICBoaWdobGlnaHRlcjogYXRvbS5jb25maWcuZ2V0KCdoYXNrZWxsLWdoYy1tb2QuaGlnaGxpZ2h0VG9vbHRpcHMnKVxuICAgICAgICAgID8gJ3NvdXJjZS5oYXNrZWxsJ1xuICAgICAgICAgIDogdW5kZWZpbmVkLFxuICAgICAgfSxcbiAgICB9XG4gIH1cblxuICBwcml2YXRlIGFzeW5jIGluZm9UeXBlVG9vbHRpcChlOiBUZXh0RWRpdG9yLCBwOiBSYW5nZSkge1xuICAgIHRyeSB7XG4gICAgICByZXR1cm4gYXdhaXQgdGhpcy5pbmZvVG9vbHRpcChlLCBwKVxuICAgIH0gY2F0Y2gge1xuICAgICAgcmV0dXJuIHRoaXMudHlwZVRvb2x0aXAoZSwgcClcbiAgICB9XG4gIH1cblxuICBwcml2YXRlIGFzeW5jIHR5cGVJbmZvVG9vbHRpcChlOiBUZXh0RWRpdG9yLCBwOiBSYW5nZSkge1xuICAgIHRyeSB7XG4gICAgICByZXR1cm4gYXdhaXQgdGhpcy50eXBlVG9vbHRpcChlLCBwKVxuICAgIH0gY2F0Y2gge1xuICAgICAgcmV0dXJuIHRoaXMuaW5mb1Rvb2x0aXAoZSwgcClcbiAgICB9XG4gIH1cblxuICBwcml2YXRlIGFzeW5jIHR5cGVBbmRJbmZvVG9vbHRpcChlOiBUZXh0RWRpdG9yLCBwOiBSYW5nZSkge1xuICAgIGNvbnN0IHR5cGVQID0gdGhpcy50eXBlVG9vbHRpcChlLCBwKS5jYXRjaCgoKSA9PiB1bmRlZmluZWQpXG4gICAgY29uc3QgaW5mb1AgPSB0aGlzLmluZm9Ub29sdGlwKGUsIHApLmNhdGNoKCgpID0+IHVuZGVmaW5lZClcbiAgICBjb25zdCBbdHlwZSwgaW5mb10gPSBhd2FpdCBQcm9taXNlLmFsbChbdHlwZVAsIGluZm9QXSlcbiAgICBsZXQgcmFuZ2U6IFJhbmdlXG4gICAgbGV0IHRleHQ6IHN0cmluZ1xuICAgIGlmICh0eXBlICYmIGluZm8pIHtcbiAgICAgIHJhbmdlID0gdHlwZS5yYW5nZS51bmlvbihpbmZvLnJhbmdlKVxuICAgICAgY29uc3Qgc3VwID0gYXRvbS5jb25maWcuZ2V0KFxuICAgICAgICAnaGFza2VsbC1naGMtbW9kLnN1cHByZXNzUmVkdW5kYW50VHlwZUluVHlwZUFuZEluZm9Ub29sdGlwcycsXG4gICAgICApXG4gICAgICBpZiAoc3VwICYmIGluZm8udGV4dC50ZXh0LmluY2x1ZGVzKGA6OiAke3R5cGUudGV4dC50ZXh0fWApKSB7XG4gICAgICAgIHRleHQgPSBpbmZvLnRleHQudGV4dFxuICAgICAgfSBlbHNlIHtcbiAgICAgICAgdGV4dCA9IGA6OiAke3R5cGUudGV4dC50ZXh0fVxcbiR7aW5mby50ZXh0LnRleHR9YFxuICAgICAgfVxuICAgIH0gZWxzZSBpZiAodHlwZSkge1xuICAgICAgcmFuZ2UgPSB0eXBlLnJhbmdlXG4gICAgICB0ZXh0ID0gYDo6ICR7dHlwZS50ZXh0LnRleHR9YFxuICAgIH0gZWxzZSBpZiAoaW5mbykge1xuICAgICAgcmFuZ2UgPSBpbmZvLnJhbmdlXG4gICAgICB0ZXh0ID0gaW5mby50ZXh0LnRleHRcbiAgICB9IGVsc2Uge1xuICAgICAgdGhyb3cgbmV3IEVycm9yKCdHb3QgbmVpdGhlciB0eXBlIG5vciBpbmZvJylcbiAgICB9XG4gICAgY29uc3QgaGlnaGxpZ2h0ZXIgPSBhdG9tLmNvbmZpZy5nZXQoJ2hhc2tlbGwtZ2hjLW1vZC5oaWdobGlnaHRUb29sdGlwcycpXG4gICAgICA/ICdzb3VyY2UuaGFza2VsbCdcbiAgICAgIDogdW5kZWZpbmVkXG4gICAgcmV0dXJuIHsgcmFuZ2UsIHRleHQ6IHsgdGV4dCwgaGlnaGxpZ2h0ZXIgfSB9XG4gIH1cblxuICBwcml2YXRlIHNldEhpZ2hsaWdodGVyKCkge1xuICAgIGlmIChhdG9tLmNvbmZpZy5nZXQoJ2hhc2tlbGwtZ2hjLW1vZC5oaWdobGlnaHRNZXNzYWdlcycpKSB7XG4gICAgICByZXR1cm4gKG06IFVQSS5JUmVzdWx0SXRlbSk6IFVQSS5JUmVzdWx0SXRlbSA9PiB7XG4gICAgICAgIGlmICh0eXBlb2YgbS5tZXNzYWdlID09PSAnc3RyaW5nJykge1xuICAgICAgICAgIGNvbnN0IG1lc3NhZ2U6IFVQSS5JTWVzc2FnZVRleHQgPSB7XG4gICAgICAgICAgICB0ZXh0OiBtLm1lc3NhZ2UsXG4gICAgICAgICAgICBoaWdobGlnaHRlcjogJ2hpbnQubWVzc2FnZS5oYXNrZWxsJyxcbiAgICAgICAgICB9XG4gICAgICAgICAgcmV0dXJuIHsgLi4ubSwgbWVzc2FnZSB9XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgcmV0dXJuIG1cbiAgICAgICAgfVxuICAgICAgfVxuICAgIH0gZWxzZSB7XG4gICAgICByZXR1cm4gKG06IFVQSS5JUmVzdWx0SXRlbSkgPT4gbVxuICAgIH1cbiAgfVxuXG4gIHByaXZhdGUgc2V0TWVzc2FnZXModHlwZToga2V5b2YgVExhc3RNZXNzYWdlcywgbWVzc2FnZXM6IFVQSS5JUmVzdWx0SXRlbVtdKSB7XG4gICAgdGhpcy5sYXN0TWVzc2FnZXNbdHlwZV0gPSBtZXNzYWdlcy5tYXAodGhpcy5zZXRIaWdobGlnaHRlcigpKVxuICAgIHRoaXMuc2VuZE1lc3NhZ2VzKClcbiAgfVxuXG4gIHByaXZhdGUgc2VuZE1lc3NhZ2VzKCkge1xuICAgIHRoaXMudXBpLnNldE1lc3NhZ2VzKFxuICAgICAgdGhpcy5wcm9jZXNzTWVzc2FnZXMuY29uY2F0KFxuICAgICAgICB0aGlzLmxhc3RNZXNzYWdlcy5jaGVjayxcbiAgICAgICAgdGhpcy5sYXN0TWVzc2FnZXMubGludCxcbiAgICAgICksXG4gICAgKVxuICB9XG5cbiAgQGhhbmRsZUV4Y2VwdGlvblxuICBwcml2YXRlIGFzeW5jIGNoZWNrTGludChcbiAgICBidWZmZXI6IFRleHRCdWZmZXIsXG4gICAgb3B0OiAnU2F2ZScgfCAnQ2hhbmdlJyxcbiAgICBmYXN0OiBib29sZWFuLFxuICApIHtcbiAgICBjb25zdCBjaGVjayA9IGF0b20uY29uZmlnLmdldChgaGFza2VsbC1naGMtbW9kLm9uJHtvcHR9Q2hlY2tgIGFzXG4gICAgICB8ICdoYXNrZWxsLWdoYy1tb2Qub25TYXZlQ2hlY2snXG4gICAgICB8ICdoYXNrZWxsLWdoYy1tb2Qub25DaGFuZ2VDaGVjaycpXG4gICAgY29uc3QgbGludCA9IGF0b20uY29uZmlnLmdldChgaGFza2VsbC1naGMtbW9kLm9uJHtvcHR9TGludGAgYXNcbiAgICAgIHwgJ2hhc2tlbGwtZ2hjLW1vZC5vblNhdmVMaW50J1xuICAgICAgfCAnaGFza2VsbC1naGMtbW9kLm9uQ2hhbmdlTGludCcpXG4gICAgY29uc3QgcHJvbWlzZXMgPSBbXVxuICAgIGlmIChjaGVjaykge1xuICAgICAgcHJvbWlzZXMucHVzaChcbiAgICAgICAgdGhpcy5wcm9jZXNzLmRvQ2hlY2tCdWZmZXIoYnVmZmVyLCBmYXN0KS50aGVuKChyZXMpID0+IHtcbiAgICAgICAgICB0aGlzLnNldE1lc3NhZ2VzKCdjaGVjaycsIHJlcylcbiAgICAgICAgfSksXG4gICAgICApXG4gICAgfVxuICAgIGlmIChsaW50KSB7XG4gICAgICBwcm9taXNlcy5wdXNoKFxuICAgICAgICB0aGlzLnByb2Nlc3MuZG9MaW50QnVmZmVyKGJ1ZmZlcikudGhlbigocmVzKSA9PiB7XG4gICAgICAgICAgdGhpcy5zZXRNZXNzYWdlcygnbGludCcsIHJlcylcbiAgICAgICAgfSksXG4gICAgICApXG4gICAgfVxuICAgIGF3YWl0IFByb21pc2UuYWxsKHByb21pc2VzKVxuICB9XG5cbiAgcHJpdmF0ZSBjb25zb2xlUmVwb3J0KGFyZzogSUVycm9yQ2FsbGJhY2tBcmdzKSB7XG4gICAgLy8gdHNsaW50OmRpc2JhbGUtbmV4dC1saW5lOiBuby1jb25zb2xlXG4gICAgY29uc29sZS5lcnJvcihVdGlsLmZvcm1hdEVycm9yKGFyZyksIFV0aWwuZ2V0RXJyb3JEZXRhaWwoYXJnKSlcbiAgfVxuXG4gIHByaXZhdGUgaGFuZGxlUHJvY2Vzc0Vycm9yKGFyZzogSUVycm9yQ2FsbGJhY2tBcmdzKSB7XG4gICAgc3dpdGNoICh0aGlzLm1zZ0JhY2tlbmQpIHtcbiAgICAgIGNhc2UgJ3VwaSc6XG4gICAgICAgIHRoaXMucHJvY2Vzc01lc3NhZ2VzLnB1c2goe1xuICAgICAgICAgIG1lc3NhZ2U6XG4gICAgICAgICAgICBVdGlsLmZvcm1hdEVycm9yKGFyZykgK1xuICAgICAgICAgICAgJ1xcblxcblNlZSBjb25zb2xlIChWaWV3IOKGkiBEZXZlbG9wZXIg4oaSIFRvZ2dsZSBEZXZlbG9wZXIgVG9vbHMg4oaSIENvbnNvbGUgdGFiKSBmb3IgZGV0YWlscy4nLFxuICAgICAgICAgIHNldmVyaXR5OiAnZ2hjLW1vZCcsXG4gICAgICAgIH0pXG4gICAgICAgIHRoaXMuY29uc29sZVJlcG9ydChhcmcpXG4gICAgICAgIHRoaXMuc2VuZE1lc3NhZ2VzKClcbiAgICAgICAgYnJlYWtcbiAgICAgIGNhc2UgJ2NvbnNvbGUnOlxuICAgICAgICB0aGlzLmNvbnNvbGVSZXBvcnQoYXJnKVxuICAgICAgICBicmVha1xuICAgICAgY2FzZSAncG9wdXAnOlxuICAgICAgICB0aGlzLmNvbnNvbGVSZXBvcnQoYXJnKVxuICAgICAgICBhdG9tLm5vdGlmaWNhdGlvbnMuYWRkRXJyb3IoVXRpbC5mb3JtYXRFcnJvcihhcmcpLCB7XG4gICAgICAgICAgZGV0YWlsOiBVdGlsLmdldEVycm9yRGV0YWlsKGFyZyksXG4gICAgICAgICAgZGlzbWlzc2FibGU6IHRydWUsXG4gICAgICAgIH0pXG4gICAgICAgIGJyZWFrXG4gICAgfVxuICB9XG5cbiAgcHJpdmF0ZSBoYW5kbGVQcm9jZXNzV2FybmluZyh3YXJuaW5nOiBzdHJpbmcpIHtcbiAgICBzd2l0Y2ggKHRoaXMubXNnQmFja2VuZCkge1xuICAgICAgY2FzZSAndXBpJzpcbiAgICAgICAgdGhpcy5wcm9jZXNzTWVzc2FnZXMucHVzaCh7XG4gICAgICAgICAgbWVzc2FnZTogd2FybmluZyxcbiAgICAgICAgICBzZXZlcml0eTogJ2doYy1tb2QnLFxuICAgICAgICB9KVxuICAgICAgICBVdGlsLndhcm4od2FybmluZylcbiAgICAgICAgdGhpcy5zZW5kTWVzc2FnZXMoKVxuICAgICAgICBicmVha1xuICAgICAgY2FzZSAnY29uc29sZSc6XG4gICAgICAgIFV0aWwud2Fybih3YXJuaW5nKVxuICAgICAgICBicmVha1xuICAgICAgY2FzZSAncG9wdXAnOlxuICAgICAgICBVdGlsLndhcm4od2FybmluZylcbiAgICAgICAgYXRvbS5ub3RpZmljYXRpb25zLmFkZFdhcm5pbmcod2FybmluZywge1xuICAgICAgICAgIGRpc21pc3NhYmxlOiBmYWxzZSxcbiAgICAgICAgfSlcbiAgICAgICAgYnJlYWtcbiAgICB9XG4gIH1cbn1cbiJdfQ==