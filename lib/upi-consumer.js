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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidXBpLWNvbnN1bWVyLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vc3JjL3VwaS1jb25zdW1lci50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOzs7QUFBQSwrQkFRYTtBQUViLCtEQUF5RDtBQUN6RCwrQkFBOEI7QUFFOUIsTUFBTSxFQUFFLGVBQWUsRUFBRSxHQUFHLElBQUksQ0FBQTtBQUVoQyxNQUFNLFlBQVksR0FBRztJQUNuQixLQUFLLEVBQUUsRUFBRTtJQUNULE9BQU8sRUFBRSxFQUFFO0lBQ1gsSUFBSSxFQUFFLEVBQUU7Q0FDVCxDQUFBO0FBRUQsTUFBTSxXQUFXLEdBQUc7SUFDbEIsU0FBUyxFQUFFO1FBQ1QsU0FBUyxFQUFFLEtBQUs7UUFDaEIsVUFBVSxFQUFFLElBQUk7S0FDakI7Q0FDRixDQUFBO0FBRUQsTUFBTSxZQUFZLEdBQUcsMkNBQTJDLENBQUE7QUFFaEUsTUFBTSxRQUFRLEdBQUc7SUFDZixLQUFLLEVBQUUsU0FBUztJQUNoQixJQUFJLEVBQUU7UUFDSixFQUFFLEtBQUssRUFBRSxPQUFPLEVBQUUsT0FBTyxFQUFFLDRCQUE0QixFQUFFO1FBQ3pELEVBQUUsS0FBSyxFQUFFLE1BQU0sRUFBRSxPQUFPLEVBQUUsMkJBQTJCLEVBQUU7UUFDdkQsRUFBRSxLQUFLLEVBQUUsY0FBYyxFQUFFLE9BQU8sRUFBRSxrQ0FBa0MsRUFBRTtLQUN2RTtDQUNGLENBQUE7QUFRRDtJQThERSxZQUFZLFFBQThCLEVBQVUsT0FBdUI7UUFBdkIsWUFBTyxHQUFQLE9BQU8sQ0FBZ0I7UUE1RG5FLGdCQUFXLEdBQXdCLElBQUksMEJBQW1CLEVBQUUsQ0FBQTtRQUM1RCxvQkFBZSxHQUFzQixFQUFFLENBQUE7UUFDdkMsaUJBQVksR0FBa0IsRUFBRSxLQUFLLEVBQUUsRUFBRSxFQUFFLElBQUksRUFBRSxFQUFFLEVBQUUsQ0FBQTtRQUNyRCxlQUFVLEdBQUcsSUFBSSxDQUFDLE1BQU0sQ0FBQyxHQUFHLENBQUMsZ0NBQWdDLENBQUMsQ0FB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QUFPLENBQUMsQ0FBQTtnQkFDbEIsSUFBSSxDQUFDLGFBQWEsQ0FBQyxVQUFVLENBQUMsT0FBTyxFQUFFO29CQUNyQyxXQUFXLEVBQUUsS0FBSztpQkFDbkIsQ0FBQyxDQUFBO2dCQUNGLEtBQUssQ0FBQTtRQUNULENBQUM7SUFDSCxDQUFDO0NBQ0Y7QUFsWUM7SUFEQyxlQUFlOzs7OytDQVFmO0FBR0Q7SUFEQyxlQUFlOzs7OzhDQUtmO0FBZ0JEO0lBREMsZUFBZTs7OztvREF1RGY7QUFHRDtJQURDLGVBQWU7Ozs7bURBWWY7QUFHRDtJQURDLGVBQWU7Ozs7aURBNEJmO0FBR0Q7SUFEQyxlQUFlOzs7O2tEQXVCZjtBQUdEO0lBREMsZUFBZTs7OztzREEyQ2Y7QUE0R0Q7SUFEQyxlQUFlOzs2Q0FFTixpQkFBVTs7NENBMEJuQjtBQTFjSCxrQ0ErZkMiLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQge1xuICBDb21tYW5kRXZlbnQsXG4gIENvbXBvc2l0ZURpc3Bvc2FibGUsXG4gIFJhbmdlLFxuICBUZXh0QnVmZmVyLFxuICBUZXh0RWRpdG9yLFxuICBQb2ludCxcbiAgVGV4dEVkaXRvckVsZW1lbnQsXG59IGZyb20gJ2F0b20nXG5pbXBvcnQgeyBHaGNNb2RpUHJvY2VzcywgSUVycm9yQ2FsbGJhY2tBcmdzIH0gZnJvbSAnLi9naGMtbW9kJ1xuaW1wb3J0IHsgaW1wb3J0TGlzdFZpZXcgfSBmcm9tICcuL3ZpZXdzL2ltcG9ydC1saXN0LXZpZXcnXG5pbXBvcnQgKiBhcyBVdGlsIGZyb20gJy4vdXRpbCdcbmltcG9ydCAqIGFzIFVQSSBmcm9tICdhdG9tLWhhc2tlbGwtdXBpJ1xuY29uc3QgeyBoYW5kbGVFeGNlcHRpb24gfSA9IFV0aWxcblxuY29uc3QgbWVzc2FnZVR5cGVzID0ge1xuICBlcnJvcjoge30sXG4gIHdhcm5pbmc6IHt9LFxuICBsaW50OiB7fSxcbn1cblxuY29uc3QgYWRkTXNnVHlwZXMgPSB7XG4gICdnaGMtbW9kJzoge1xuICAgIHVyaUZpbHRlcjogZmFsc2UsXG4gICAgYXV0b1Njcm9sbDogdHJ1ZSxcbiAgfSxcbn1cblxuY29uc3QgY29udGV4dFNjb3BlID0gJ2F0b20tdGV4dC1lZGl0b3JbZGF0YS1ncmFtbWFyfj1cImhhc2tlbGxcIl0nXG5cbmNvbnN0IG1haW5NZW51ID0ge1xuICBsYWJlbDogJ2doYy1tb2QnLFxuICBtZW51OiBbXG4gICAgeyBsYWJlbDogJ0NoZWNrJywgY29tbWFuZDogJ2hhc2tlbGwtZ2hjLW1vZDpjaGVjay1maWxlJyB9LFxuICAgIHsgbGFiZWw6ICdMaW50JywgY29tbWFuZDogJ2hhc2tlbGwtZ2hjLW1vZDpsaW50LWZpbGUnIH0sXG4gICAgeyBsYWJlbDogJ1N0b3AgQmFja2VuZCcsIGNvbW1hbmQ6ICdoYXNrZWxsLWdoYy1tb2Q6c2h1dGRvd24tYmFja2VuZCcgfSxcbiAgXSxcbn1cblxudHlwZSBURUNvbW1hbmRFdmVudCA9IENvbW1hbmRFdmVudDxUZXh0RWRpdG9yRWxlbWVudD5cbnR5cGUgVExhc3RNZXNzYWdlcyA9IHtcbiAgY2hlY2s6IFVQSS5JUmVzdWx0SXRlbVtdXG4gIGxpbnQ6IFVQSS5JUmVzdWx0SXRlbVtdXG59XG5cbmV4cG9ydCBjbGFzcyBVUElDb25zdW1lciB7XG4gIHB1YmxpYyB1cGk6IFVQSS5JVVBJSW5zdGFuY2VcbiAgcHJpdmF0ZSBkaXNwb3NhYmxlczogQ29tcG9zaXRlRGlzcG9zYWJsZSA9IG5ldyBDb21wb3NpdGVEaXNwb3NhYmxlKClcbiAgcHJpdmF0ZSBwcm9jZXNzTWVzc2FnZXM6IFVQSS5JUmVzdWx0SXRlbVtdID0gW11cbiAgcHJpdmF0ZSBsYXN0TWVzc2FnZXM6IFRMYXN0TWVzc2FnZXMgPSB7IGNoZWNrOiBbXSwgbGludDogW10gfVxuICBwcml2YXRlIG1zZ0JhY2tlbmQgPSBhdG9tLmNvbmZpZy5nZXQoJ2hhc2tlbGwtZ2hjLW1vZC5naGNNb2RNZXNzYWdlcycpXG5cbiAgcHJpdmF0ZSBjb250ZXh0Q29tbWFuZHMgPSB7XG4gICAgJ2hhc2tlbGwtZ2hjLW1vZDpzaG93LXR5cGUnOiB0aGlzLnRvb2x0aXBDb21tYW5kKFxuICAgICAgdGhpcy50eXBlVG9vbHRpcC5iaW5kKHRoaXMpLFxuICAgICksXG4gICAgJ2hhc2tlbGwtZ2hjLW1vZDpzaG93LWluZm8nOiB0aGlzLnRvb2x0aXBDb21tYW5kKFxuICAgICAgdGhpcy5pbmZvVG9vbHRpcC5iaW5kKHRoaXMpLFxuICAgICksXG4gICAgJ2hhc2tlbGwtZ2hjLW1vZDpjYXNlLXNwbGl0JzogdGhpcy5jYXNlU3BsaXRDb21tYW5kLmJpbmQodGhpcyksXG4gICAgJ2hhc2tlbGwtZ2hjLW1vZDpzaWctZmlsbCc6IHRoaXMuc2lnRmlsbENvbW1hbmQuYmluZCh0aGlzKSxcbiAgICAnaGFza2VsbC1naGMtbW9kOmdvLXRvLWRlY2xhcmF0aW9uJzogdGhpcy5nb1RvRGVjbENvbW1hbmQuYmluZCh0aGlzKSxcbiAgICAnaGFza2VsbC1naGMtbW9kOnNob3ctaW5mby1mYWxsYmFjay10by10eXBlJzogdGhpcy50b29sdGlwQ29tbWFuZChcbiAgICAgIHRoaXMuaW5mb1R5cGVUb29sdGlwLmJpbmQodGhpcyksXG4gICAgKSxcbiAgICAnaGFza2VsbC1naGMtbW9kOnNob3ctdHlwZS1mYWxsYmFjay10by1pbmZvJzogdGhpcy50b29sdGlwQ29tbWFuZChcbiAgICAgIHRoaXMudHlwZUluZm9Ub29sdGlwLmJpbmQodGhpcyksXG4gICAgKSxcbiAgICAnaGFza2VsbC1naGMtbW9kOnNob3ctdHlwZS1hbmQtaW5mbyc6IHRoaXMudG9vbHRpcENvbW1hbmQoXG4gICAgICB0aGlzLnR5cGVBbmRJbmZvVG9vbHRpcC5iaW5kKHRoaXMpLFxuICAgICksXG4gICAgJ2hhc2tlbGwtZ2hjLW1vZDppbnNlcnQtdHlwZSc6IHRoaXMuaW5zZXJ0VHlwZUNvbW1hbmQuYmluZCh0aGlzKSxcbiAgICAnaGFza2VsbC1naGMtbW9kOmluc2VydC1pbXBvcnQnOiB0aGlzLmluc2VydEltcG9ydENvbW1hbmQuYmluZCh0aGlzKSxcbiAgfVxuXG4gIHByaXZhdGUgZ2xvYmFsQ29tbWFuZHMgPSB7XG4gICAgJ2hhc2tlbGwtZ2hjLW1vZDpjaGVjay1maWxlJzogdGhpcy5jaGVja0NvbW1hbmQuYmluZCh0aGlzKSxcbiAgICAnaGFza2VsbC1naGMtbW9kOmxpbnQtZmlsZSc6IHRoaXMubGludENvbW1hbmQuYmluZCh0aGlzKSxcbiAgICAuLi50aGlzLmNvbnRleHRDb21tYW5kcyxcbiAgfVxuXG4gIHByaXZhdGUgY29udGV4dE1lbnU6IHtcbiAgICBsYWJlbDogc3RyaW5nXG4gICAgc3VibWVudTogQXJyYXk8e1xuICAgICAgbGFiZWw6IHN0cmluZ1xuICAgICAgY29tbWFuZDoga2V5b2YgVVBJQ29uc3VtZXJbJ2NvbnRleHRDb21tYW5kcyddXG4gICAgfT5cbiAgfSA9IHtcbiAgICBsYWJlbDogJ2doYy1tb2QnLFxuICAgIHN1Ym1lbnU6IFtcbiAgICAgIHsgbGFiZWw6ICdTaG93IFR5cGUnLCBjb21tYW5kOiAnaGFza2VsbC1naGMtbW9kOnNob3ctdHlwZScgfSxcbiAgICAgIHsgbGFiZWw6ICdTaG93IEluZm8nLCBjb21tYW5kOiAnaGFza2VsbC1naGMtbW9kOnNob3ctaW5mbycgfSxcbiAgICAgIHtcbiAgICAgICAgbGFiZWw6ICdTaG93IFR5cGUgQW5kIEluZm8nLFxuICAgICAgICBjb21tYW5kOiAnaGFza2VsbC1naGMtbW9kOnNob3ctdHlwZS1hbmQtaW5mbycsXG4gICAgICB9LFxuICAgICAgeyBsYWJlbDogJ0Nhc2UgU3BsaXQnLCBjb21tYW5kOiAnaGFza2VsbC1naGMtbW9kOmNhc2Utc3BsaXQnIH0sXG4gICAgICB7IGxhYmVsOiAnU2lnIEZpbGwnLCBjb21tYW5kOiAnaGFza2VsbC1naGMtbW9kOnNpZy1maWxsJyB9LFxuICAgICAgeyBsYWJlbDogJ0luc2VydCBUeXBlJywgY29tbWFuZDogJ2hhc2tlbGwtZ2hjLW1vZDppbnNlcnQtdHlwZScgfSxcbiAgICAgIHsgbGFiZWw6ICdJbnNlcnQgSW1wb3J0JywgY29tbWFuZDogJ2hhc2tlbGwtZ2hjLW1vZDppbnNlcnQtaW1wb3J0JyB9LFxuICAgICAge1xuICAgICAgICBsYWJlbDogJ0dvIFRvIERlY2xhcmF0aW9uJyxcbiAgICAgICAgY29tbWFuZDogJ2hhc2tlbGwtZ2hjLW1vZDpnby10by1kZWNsYXJhdGlvbicsXG4gICAgICB9LFxuICAgIF0sXG4gIH1cblxuICBjb25zdHJ1Y3RvcihyZWdpc3RlcjogVVBJLklVUElSZWdpc3RyYXRpb24sIHByaXZhdGUgcHJvY2VzczogR2hjTW9kaVByb2Nlc3MpIHtcbiAgICB0aGlzLmRpc3Bvc2FibGVzLmFkZChcbiAgICAgIHRoaXMucHJvY2Vzcy5vbkVycm9yKHRoaXMuaGFuZGxlUHJvY2Vzc0Vycm9yLmJpbmQodGhpcykpLFxuICAgICAgdGhpcy5wcm9jZXNzLm9uV2FybmluZyh0aGlzLmhhbmRsZVByb2Nlc3NXYXJuaW5nLmJpbmQodGhpcykpLFxuICAgIClcblxuICAgIGNvbnN0IG1zZ1R5cGVzID1cbiAgICAgIHRoaXMubXNnQmFja2VuZCA9PT0gJ3VwaSdcbiAgICAgICAgPyB7IC4uLm1lc3NhZ2VUeXBlcywgLi4uYWRkTXNnVHlwZXMgfVxuICAgICAgICA6IG1lc3NhZ2VUeXBlc1xuXG4gICAgdGhpcy51cGkgPSByZWdpc3Rlcih7XG4gICAgICBuYW1lOiAnaGFza2VsbC1naGMtbW9kJyxcbiAgICAgIG1lbnU6IG1haW5NZW51LFxuICAgICAgbWVzc2FnZVR5cGVzOiBtc2dUeXBlcyxcbiAgICAgIHRvb2x0aXA6IHRoaXMuc2hvdWxkU2hvd1Rvb2x0aXAuYmluZCh0aGlzKSxcbiAgICAgIGV2ZW50czoge1xuICAgICAgICBvbkRpZFNhdmVCdWZmZXI6IGFzeW5jIChidWZmZXIpID0+XG4gICAgICAgICAgdGhpcy5jaGVja0xpbnQoXG4gICAgICAgICAgICBidWZmZXIsXG4gICAgICAgICAgICAnU2F2ZScsXG4gICAgICAgICAgICBhdG9tLmNvbmZpZy5nZXQoJ2hhc2tlbGwtZ2hjLW1vZC5hbHdheXNJbnRlcmFjdGl2ZUNoZWNrJyksXG4gICAgICAgICAgKSxcbiAgICAgICAgb25EaWRTdG9wQ2hhbmdpbmc6IGFzeW5jIChidWZmZXIpID0+XG4gICAgICAgICAgdGhpcy5jaGVja0xpbnQoYnVmZmVyLCAnQ2hhbmdlJywgdHJ1ZSksXG4gICAgICB9LFxuICAgIH0pXG5cbiAgICB0aGlzLmRpc3Bvc2FibGVzLmFkZChcbiAgICAgIHRoaXMudXBpLFxuICAgICAgdGhpcy5wcm9jZXNzLm9uQmFja2VuZEFjdGl2ZSgoKSA9PlxuICAgICAgICB0aGlzLnVwaS5zZXRTdGF0dXMoeyBzdGF0dXM6ICdwcm9ncmVzcycsIGRldGFpbDogJycgfSksXG4gICAgICApLFxuICAgICAgdGhpcy5wcm9jZXNzLm9uQmFja2VuZElkbGUoKCkgPT5cbiAgICAgICAgdGhpcy51cGkuc2V0U3RhdHVzKHsgc3RhdHVzOiAncmVhZHknLCBkZXRhaWw6ICcnIH0pLFxuICAgICAgKSxcbiAgICAgIGF0b20uY29tbWFuZHMuYWRkKGNvbnRleHRTY29wZSwgdGhpcy5nbG9iYWxDb21tYW5kcyksXG4gICAgKVxuICAgIGNvbnN0IGNtID0ge31cbiAgICBjbVtjb250ZXh0U2NvcGVdID0gW3RoaXMuY29udGV4dE1lbnVdXG4gICAgdGhpcy5kaXNwb3NhYmxlcy5hZGQoYXRvbS5jb250ZXh0TWVudS5hZGQoY20pKVxuICB9XG5cbiAgcHVibGljIGRpc3Bvc2UoKSB7XG4gICAgdGhpcy5kaXNwb3NhYmxlcy5kaXNwb3NlKClcbiAgfVxuXG4gIHByaXZhdGUgYXN5bmMgc2hvdWxkU2hvd1Rvb2x0aXAoXG4gICAgZWRpdG9yOiBUZXh0RWRpdG9yLFxuICAgIGNyYW5nZTogUmFuZ2UsXG4gICAgdHlwZTogVVBJLlRFdmVudFJhbmdlVHlwZSxcbiAgKTogUHJvbWlzZTxVUEkuSVRvb2x0aXBEYXRhIHwgdW5kZWZpbmVkPiB7XG4gICAgY29uc3QgbiA9XG4gICAgICB0eXBlID09PSAnbW91c2UnXG4gICAgICAgID8gJ2hhc2tlbGwtZ2hjLW1vZC5vbk1vdXNlSG92ZXJTaG93J1xuICAgICAgICA6IHR5cGUgPT09ICdzZWxlY3Rpb24nID8gJ2hhc2tlbGwtZ2hjLW1vZC5vblNlbGVjdGlvblNob3cnIDogdW5kZWZpbmVkXG4gICAgY29uc3QgdCA9IG4gJiYgYXRvbS5jb25maWcuZ2V0KG4pXG4gICAgLy8gdHNsaW50OmRpc2FibGUtbmV4dC1saW5lOm5vLXVuc2FmZS1hbnlcbiAgICBpZiAodCkgcmV0dXJuIHRoaXNbYCR7dH1Ub29sdGlwYF0oZWRpdG9yLCBjcmFuZ2UpXG4gICAgZWxzZSByZXR1cm4gdW5kZWZpbmVkXG4gIH1cblxuICBAaGFuZGxlRXhjZXB0aW9uXG4gIHByaXZhdGUgYXN5bmMgY2hlY2tDb21tYW5kKHsgY3VycmVudFRhcmdldCB9OiBURUNvbW1hbmRFdmVudCkge1xuICAgIGNvbnN0IGVkaXRvciA9IGN1cnJlbnRUYXJnZXQuZ2V0TW9kZWwoKVxuICAgIGNvbnN0IHJlcyA9IGF3YWl0IHRoaXMucHJvY2Vzcy5kb0NoZWNrQnVmZmVyKFxuICAgICAgZWRpdG9yLmdldEJ1ZmZlcigpLFxuICAgICAgYXRvbS5jb25maWcuZ2V0KCdoYXNrZWxsLWdoYy1tb2QuYWx3YXlzSW50ZXJhY3RpdmVDaGVjaycpLFxuICAgIClcbiAgICB0aGlzLnNldE1lc3NhZ2VzKCdjaGVjaycsIHJlcylcbiAgfVxuXG4gIEBoYW5kbGVFeGNlcHRpb25cbiAgcHJpdmF0ZSBhc3luYyBsaW50Q29tbWFuZCh7IGN1cnJlbnRUYXJnZXQgfTogVEVDb21tYW5kRXZlbnQpIHtcbiAgICBjb25zdCBlZGl0b3IgPSBjdXJyZW50VGFyZ2V0LmdldE1vZGVsKClcbiAgICBjb25zdCByZXMgPSBhd2FpdCB0aGlzLnByb2Nlc3MuZG9MaW50QnVmZmVyKGVkaXRvci5nZXRCdWZmZXIoKSlcbiAgICB0aGlzLnNldE1lc3NhZ2VzKCdsaW50JywgcmVzKVxuICB9XG5cbiAgcHJpdmF0ZSB0b29sdGlwQ29tbWFuZChcbiAgICB0b29sdGlwZnVuOiAoZTogVGV4dEVkaXRvciwgcDogUmFuZ2UpID0+IFByb21pc2U8VVBJLklUb29sdGlwRGF0YT4sXG4gICkge1xuICAgIHJldHVybiBhc3luYyAoeyBjdXJyZW50VGFyZ2V0LCBkZXRhaWwgfTogVEVDb21tYW5kRXZlbnQpID0+XG4gICAgICB0aGlzLnVwaS5zaG93VG9vbHRpcCh7XG4gICAgICAgIGVkaXRvcjogY3VycmVudFRhcmdldC5nZXRNb2RlbCgpLFxuICAgICAgICBkZXRhaWwsXG4gICAgICAgIGFzeW5jIHRvb2x0aXAoY3JhbmdlKSB7XG4gICAgICAgICAgcmV0dXJuIHRvb2x0aXBmdW4oY3VycmVudFRhcmdldC5nZXRNb2RlbCgpLCBjcmFuZ2UpXG4gICAgICAgIH0sXG4gICAgICB9KVxuICB9XG5cbiAgQGhhbmRsZUV4Y2VwdGlvblxuICBwcml2YXRlIGFzeW5jIGluc2VydFR5cGVDb21tYW5kKHsgY3VycmVudFRhcmdldCwgZGV0YWlsIH06IFRFQ29tbWFuZEV2ZW50KSB7XG4gICAgY29uc3QgZWRpdG9yID0gY3VycmVudFRhcmdldC5nZXRNb2RlbCgpXG4gICAgY29uc3QgZXIgPSB0aGlzLnVwaS5nZXRFdmVudFJhbmdlKGVkaXRvciwgZGV0YWlsKVxuICAgIGlmIChlciA9PT0gdW5kZWZpbmVkKSB7XG4gICAgICByZXR1cm5cbiAgICB9XG4gICAgY29uc3QgeyBjcmFuZ2UsIHBvcyB9ID0gZXJcbiAgICBjb25zdCBzeW1JbmZvID0gVXRpbC5nZXRTeW1ib2xBdFBvaW50KGVkaXRvciwgcG9zKVxuICAgIGlmICghc3ltSW5mbykge1xuICAgICAgcmV0dXJuXG4gICAgfVxuICAgIGNvbnN0IHsgc2NvcGUsIHJhbmdlLCBzeW1ib2wgfSA9IHN5bUluZm9cbiAgICBpZiAoc2NvcGUuc3RhcnRzV2l0aCgna2V5d29yZC5vcGVyYXRvci4nKSkge1xuICAgICAgcmV0dXJuXG4gICAgfSAvLyBjYW4ndCBjb3JyZWN0bHkgaGFuZGxlIGluZml4IG5vdGF0aW9uXG4gICAgY29uc3QgeyB0eXBlIH0gPSBhd2FpdCB0aGlzLnByb2Nlc3MuZ2V0VHlwZUluQnVmZmVyKFxuICAgICAgZWRpdG9yLmdldEJ1ZmZlcigpLFxuICAgICAgY3JhbmdlLFxuICAgIClcbiAgICBpZiAoXG4gICAgICBlZGl0b3JcbiAgICAgICAgLmdldFRleHRJbkJ1ZmZlclJhbmdlKFtcbiAgICAgICAgICByYW5nZS5lbmQsXG4gICAgICAgICAgZWRpdG9yLmdldEJ1ZmZlcigpLnJhbmdlRm9yUm93KHJhbmdlLmVuZC5yb3csIGZhbHNlKS5lbmQsXG4gICAgICAgIF0pXG4gICAgICAgIC5tYXRjaCgvPS8pXG4gICAgKSB7XG4gICAgICBsZXQgaW5kZW50ID0gZWRpdG9yLmdldFRleHRJbkJ1ZmZlclJhbmdlKFtcbiAgICAgICAgW3JhbmdlLnN0YXJ0LnJvdywgMF0sXG4gICAgICAgIHJhbmdlLnN0YXJ0LFxuICAgICAgXSlcbiAgICAgIGxldCBiaXJkVHJhY2sgPSAnJ1xuICAgICAgaWYgKFxuICAgICAgICBlZGl0b3JcbiAgICAgICAgICAuc2NvcGVEZXNjcmlwdG9yRm9yQnVmZmVyUG9zaXRpb24ocG9zKVxuICAgICAgICAgIC5nZXRTY29wZXNBcnJheSgpXG4gICAgICAgICAgLmluY2x1ZGVzKCdtZXRhLmVtYmVkZGVkLmhhc2tlbGwnKVxuICAgICAgKSB7XG4gICAgICAgIGJpcmRUcmFjayA9IGluZGVudC5zbGljZSgwLCAyKVxuICAgICAgICBpbmRlbnQgPSBpbmRlbnQuc2xpY2UoMilcbiAgICAgIH1cbiAgICAgIGlmIChpbmRlbnQubWF0Y2goL1xcUy8pKSB7XG4gICAgICAgIGluZGVudCA9IGluZGVudC5yZXBsYWNlKC9cXFMvZywgJyAnKVxuICAgICAgfVxuICAgICAgZWRpdG9yLnNldFRleHRJbkJ1ZmZlclJhbmdlKFxuICAgICAgICBbcmFuZ2Uuc3RhcnQsIHJhbmdlLnN0YXJ0XSxcbiAgICAgICAgYCR7c3ltYm9sfSA6OiAke3R5cGV9XFxuJHtiaXJkVHJhY2t9JHtpbmRlbnR9YCxcbiAgICAgIClcbiAgICB9IGVsc2Uge1xuICAgICAgZWRpdG9yLnNldFRleHRJbkJ1ZmZlclJhbmdlKFxuICAgICAgICByYW5nZSxcbiAgICAgICAgYCgke2VkaXRvci5nZXRUZXh0SW5CdWZmZXJSYW5nZShyYW5nZSl9IDo6ICR7dHlwZX0pYCxcbiAgICAgIClcbiAgICB9XG4gIH1cblxuICBAaGFuZGxlRXhjZXB0aW9uXG4gIHByaXZhdGUgYXN5bmMgY2FzZVNwbGl0Q29tbWFuZCh7IGN1cnJlbnRUYXJnZXQsIGRldGFpbCB9OiBURUNvbW1hbmRFdmVudCkge1xuICAgIGNvbnN0IGVkaXRvciA9IGN1cnJlbnRUYXJnZXQuZ2V0TW9kZWwoKVxuICAgIGNvbnN0IGV2ciA9IHRoaXMudXBpLmdldEV2ZW50UmFuZ2UoZWRpdG9yLCBkZXRhaWwpXG4gICAgaWYgKCFldnIpIHtcbiAgICAgIHJldHVyblxuICAgIH1cbiAgICBjb25zdCB7IGNyYW5nZSB9ID0gZXZyXG4gICAgY29uc3QgcmVzID0gYXdhaXQgdGhpcy5wcm9jZXNzLmRvQ2FzZVNwbGl0KGVkaXRvci5nZXRCdWZmZXIoKSwgY3JhbmdlKVxuICAgIGZvciAoY29uc3QgeyByYW5nZSwgcmVwbGFjZW1lbnQgfSBvZiByZXMpIHtcbiAgICAgIGVkaXRvci5zZXRUZXh0SW5CdWZmZXJSYW5nZShyYW5nZSwgcmVwbGFjZW1lbnQpXG4gICAgfVxuICB9XG5cbiAgQGhhbmRsZUV4Y2VwdGlvblxuICBwcml2YXRlIGFzeW5jIHNpZ0ZpbGxDb21tYW5kKHsgY3VycmVudFRhcmdldCwgZGV0YWlsIH06IFRFQ29tbWFuZEV2ZW50KSB7XG4gICAgY29uc3QgZWRpdG9yID0gY3VycmVudFRhcmdldC5nZXRNb2RlbCgpXG4gICAgY29uc3QgZXZyID0gdGhpcy51cGkuZ2V0RXZlbnRSYW5nZShlZGl0b3IsIGRldGFpbClcbiAgICBpZiAoIWV2cikge1xuICAgICAgcmV0dXJuXG4gICAgfVxuICAgIGNvbnN0IHsgY3JhbmdlIH0gPSBldnJcbiAgICBjb25zdCByZXMgPSBhd2FpdCB0aGlzLnByb2Nlc3MuZG9TaWdGaWxsKGVkaXRvci5nZXRCdWZmZXIoKSwgY3JhbmdlKVxuXG4gICAgZWRpdG9yLnRyYW5zYWN0KCgpID0+IHtcbiAgICAgIGNvbnN0IHsgdHlwZSwgcmFuZ2UsIGJvZHkgfSA9IHJlc1xuICAgICAgY29uc3Qgc2lnID0gZWRpdG9yLmdldFRleHRJbkJ1ZmZlclJhbmdlKHJhbmdlKVxuICAgICAgbGV0IGluZGVudCA9IGVkaXRvci5pbmRlbnRMZXZlbEZvckxpbmUoc2lnKVxuICAgICAgY29uc3QgcG9zID0gcmFuZ2UuZW5kXG4gICAgICBjb25zdCB0ZXh0ID0gYFxcbiR7Ym9keX1gXG4gICAgICBpZiAodHlwZSA9PT0gJ2luc3RhbmNlJykge1xuICAgICAgICBpbmRlbnQgKz0gMVxuICAgICAgICBpZiAoIXNpZy5lbmRzV2l0aCgnIHdoZXJlJykpIHtcbiAgICAgICAgICBlZGl0b3Iuc2V0VGV4dEluQnVmZmVyUmFuZ2UoW3JhbmdlLmVuZCwgcmFuZ2UuZW5kXSwgJyB3aGVyZScpXG4gICAgICAgIH1cbiAgICAgIH1cbiAgICAgIGNvbnN0IG5ld3JhbmdlID0gZWRpdG9yLnNldFRleHRJbkJ1ZmZlclJhbmdlKFtwb3MsIHBvc10sIHRleHQpXG4gICAgICBuZXdyYW5nZVxuICAgICAgICAuZ2V0Um93cygpXG4gICAgICAgIC5zbGljZSgxKVxuICAgICAgICAubWFwKChyb3cpID0+IGVkaXRvci5zZXRJbmRlbnRhdGlvbkZvckJ1ZmZlclJvdyhyb3csIGluZGVudCkpXG4gICAgfSlcbiAgfVxuXG4gIEBoYW5kbGVFeGNlcHRpb25cbiAgcHJpdmF0ZSBhc3luYyBnb1RvRGVjbENvbW1hbmQoeyBjdXJyZW50VGFyZ2V0LCBkZXRhaWwgfTogVEVDb21tYW5kRXZlbnQpIHtcbiAgICBjb25zdCBlZGl0b3IgPSBjdXJyZW50VGFyZ2V0LmdldE1vZGVsKClcbiAgICBjb25zdCBldnIgPSB0aGlzLnVwaS5nZXRFdmVudFJhbmdlKGVkaXRvciwgZGV0YWlsKVxuICAgIGlmICghZXZyKSB7XG4gICAgICByZXR1cm5cbiAgICB9XG4gICAgY29uc3QgeyBjcmFuZ2UgfSA9IGV2clxuICAgIGNvbnN0IHsgaW5mbyB9ID0gYXdhaXQgdGhpcy5wcm9jZXNzLmdldEluZm9JbkJ1ZmZlcihlZGl0b3IsIGNyYW5nZSlcbiAgICBjb25zdCByZXMgPSAvLiotLSBEZWZpbmVkIGF0ICguKyk6KFxcZCspOihcXGQrKS8uZXhlYyhpbmZvKVxuICAgIGlmICghcmVzKSB7XG4gICAgICByZXR1cm5cbiAgICB9XG4gICAgY29uc3QgW2ZuLCBsaW5lLCBjb2xdID0gcmVzLnNsaWNlKDEpXG4gICAgY29uc3Qgcm9vdERpciA9IGF3YWl0IHRoaXMucHJvY2Vzcy5nZXRSb290RGlyKGVkaXRvci5nZXRCdWZmZXIoKSlcbiAgICBpZiAoIXJvb3REaXIpIHtcbiAgICAgIHJldHVyblxuICAgIH1cbiAgICBjb25zdCB1cmkgPSByb290RGlyLmdldEZpbGUoZm4pLmdldFBhdGgoKSB8fCBmblxuICAgIGF3YWl0IGF0b20ud29ya3NwYWNlLm9wZW4odXJpLCB7XG4gICAgICBpbml0aWFsTGluZTogcGFyc2VJbnQobGluZSwgMTApIC0gMSxcbiAgICAgIGluaXRpYWxDb2x1bW46IHBhcnNlSW50KGNvbCwgMTApIC0gMSxcbiAgICB9KVxuICB9XG5cbiAgQGhhbmRsZUV4Y2VwdGlvblxuICBwcml2YXRlIGFzeW5jIGluc2VydEltcG9ydENvbW1hbmQoeyBjdXJyZW50VGFyZ2V0LCBkZXRhaWwgfTogVEVDb21tYW5kRXZlbnQpIHtcbiAgICBjb25zdCBlZGl0b3IgPSBjdXJyZW50VGFyZ2V0LmdldE1vZGVsKClcbiAgICBjb25zdCBidWZmZXIgPSBlZGl0b3IuZ2V0QnVmZmVyKClcbiAgICBjb25zdCBldnIgPSB0aGlzLnVwaS5nZXRFdmVudFJhbmdlKGVkaXRvciwgZGV0YWlsKVxuICAgIGlmICghZXZyKSB7XG4gICAgICByZXR1cm5cbiAgICB9XG4gICAgY29uc3QgeyBjcmFuZ2UgfSA9IGV2clxuICAgIGNvbnN0IGxpbmVzID0gYXdhaXQgdGhpcy5wcm9jZXNzLmZpbmRTeW1ib2xQcm92aWRlcnNJbkJ1ZmZlcihlZGl0b3IsIGNyYW5nZSlcbiAgICBjb25zdCBtb2QgPSBhd2FpdCBpbXBvcnRMaXN0VmlldyhsaW5lcylcbiAgICBpZiAobW9kKSB7XG4gICAgICBjb25zdCBwaSA9IGF3YWl0IG5ldyBQcm9taXNlPHsgcG9zOiBQb2ludDsgaW5kZW50OiBzdHJpbmc7IGVuZDogc3RyaW5nIH0+KFxuICAgICAgICAocmVzb2x2ZSkgPT4ge1xuICAgICAgICAgIGJ1ZmZlci5iYWNrd2FyZHNTY2FuKC9eKFxccyopKGltcG9ydHxtb2R1bGUpLywgKHsgbWF0Y2gsIHJhbmdlIH0pID0+IHtcbiAgICAgICAgICAgIGxldCBpbmRlbnQgPSAnJ1xuICAgICAgICAgICAgc3dpdGNoIChtYXRjaFsyXSkge1xuICAgICAgICAgICAgICBjYXNlICdpbXBvcnQnOlxuICAgICAgICAgICAgICAgIGluZGVudCA9IGBcXG4ke21hdGNoWzFdfWBcbiAgICAgICAgICAgICAgICBicmVha1xuICAgICAgICAgICAgICBjYXNlICdtb2R1bGUnOlxuICAgICAgICAgICAgICAgIGluZGVudCA9IGBcXG5cXG4ke21hdGNoWzFdfWBcbiAgICAgICAgICAgICAgICBicmVha1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgcmVzb2x2ZSh7XG4gICAgICAgICAgICAgIHBvczogYnVmZmVyLnJhbmdlRm9yUm93KHJhbmdlLnN0YXJ0LnJvdywgZmFsc2UpLmVuZCxcbiAgICAgICAgICAgICAgaW5kZW50LFxuICAgICAgICAgICAgICBlbmQ6ICcnLFxuICAgICAgICAgICAgfSlcbiAgICAgICAgICB9KVxuICAgICAgICAgIC8vIG5vdGhpbmcgZm91bmRcbiAgICAgICAgICByZXNvbHZlKHtcbiAgICAgICAgICAgIHBvczogYnVmZmVyLmdldEZpcnN0UG9zaXRpb24oKSxcbiAgICAgICAgICAgIGluZGVudDogJycsXG4gICAgICAgICAgICBlbmQ6ICdcXG4nLFxuICAgICAgICAgIH0pXG4gICAgICAgIH0sXG4gICAgICApXG4gICAgICBlZGl0b3Iuc2V0VGV4dEluQnVmZmVyUmFuZ2UoXG4gICAgICAgIFtwaS5wb3MsIHBpLnBvc10sXG4gICAgICAgIGAke3BpLmluZGVudH1pbXBvcnQgJHttb2R9JHtwaS5lbmR9YCxcbiAgICAgIClcbiAgICB9XG4gIH1cblxuICBwcml2YXRlIGFzeW5jIHR5cGVUb29sdGlwKGU6IFRleHRFZGl0b3IsIHA6IFJhbmdlKSB7XG4gICAgY29uc3QgeyByYW5nZSwgdHlwZSB9ID0gYXdhaXQgdGhpcy5wcm9jZXNzLmdldFR5cGVJbkJ1ZmZlcihlLmdldEJ1ZmZlcigpLCBwKVxuICAgIHJldHVybiB7XG4gICAgICByYW5nZSxcbiAgICAgIHRleHQ6IHtcbiAgICAgICAgdGV4dDogdHlwZSxcbiAgICAgICAgaGlnaGxpZ2h0ZXI6IGF0b20uY29uZmlnLmdldCgnaGFza2VsbC1naGMtbW9kLmhpZ2hsaWdodFRvb2x0aXBzJylcbiAgICAgICAgICA/ICdoaW50LnR5cGUuaGFza2VsbCdcbiAgICAgICAgICA6IHVuZGVmaW5lZCxcbiAgICAgIH0sXG4gICAgfVxuICB9XG5cbiAgcHJpdmF0ZSBhc3luYyBpbmZvVG9vbHRpcChlOiBUZXh0RWRpdG9yLCBwOiBSYW5nZSkge1xuICAgIGNvbnN0IHsgcmFuZ2UsIGluZm8gfSA9IGF3YWl0IHRoaXMucHJvY2Vzcy5nZXRJbmZvSW5CdWZmZXIoZSwgcClcbiAgICByZXR1cm4ge1xuICAgICAgcmFuZ2UsXG4gICAgICB0ZXh0OiB7XG4gICAgICAgIHRleHQ6IGluZm8sXG4gICAgICAgIGhpZ2hsaWdodGVyOiBhdG9tLmNvbmZpZy5nZXQoJ2hhc2tlbGwtZ2hjLW1vZC5oaWdobGlnaHRUb29sdGlwcycpXG4gICAgICAgICAgPyAnc291cmNlLmhhc2tlbGwnXG4gICAgICAgICAgOiB1bmRlZmluZWQsXG4gICAgICB9LFxuICAgIH1cbiAgfVxuXG4gIHByaXZhdGUgYXN5bmMgaW5mb1R5cGVUb29sdGlwKGU6IFRleHRFZGl0b3IsIHA6IFJhbmdlKSB7XG4gICAgdHJ5IHtcbiAgICAgIHJldHVybiBhd2FpdCB0aGlzLmluZm9Ub29sdGlwKGUsIHApXG4gICAgfSBjYXRjaCB7XG4gICAgICByZXR1cm4gdGhpcy50eXBlVG9vbHRpcChlLCBwKVxuICAgIH1cbiAgfVxuXG4gIHByaXZhdGUgYXN5bmMgdHlwZUluZm9Ub29sdGlwKGU6IFRleHRFZGl0b3IsIHA6IFJhbmdlKSB7XG4gICAgdHJ5IHtcbiAgICAgIHJldHVybiBhd2FpdCB0aGlzLnR5cGVUb29sdGlwKGUsIHApXG4gICAgfSBjYXRjaCB7XG4gICAgICByZXR1cm4gdGhpcy5pbmZvVG9vbHRpcChlLCBwKVxuICAgIH1cbiAgfVxuXG4gIHByaXZhdGUgYXN5bmMgdHlwZUFuZEluZm9Ub29sdGlwKGU6IFRleHRFZGl0b3IsIHA6IFJhbmdlKSB7XG4gICAgY29uc3QgdHlwZVAgPSB0aGlzLnR5cGVUb29sdGlwKGUsIHApLmNhdGNoKCgpID0+IHVuZGVmaW5lZClcbiAgICBjb25zdCBpbmZvUCA9IHRoaXMuaW5mb1Rvb2x0aXAoZSwgcCkuY2F0Y2goKCkgPT4gdW5kZWZpbmVkKVxuICAgIGNvbnN0IFt0eXBlLCBpbmZvXSA9IGF3YWl0IFByb21pc2UuYWxsKFt0eXBlUCwgaW5mb1BdKVxuICAgIGxldCByYW5nZTogUmFuZ2VcbiAgICBsZXQgdGV4dDogc3RyaW5nXG4gICAgaWYgKHR5cGUgJiYgaW5mbykge1xuICAgICAgcmFuZ2UgPSB0eXBlLnJhbmdlLnVuaW9uKGluZm8ucmFuZ2UpXG4gICAgICBjb25zdCBzdXAgPSBhdG9tLmNvbmZpZy5nZXQoXG4gICAgICAgICdoYXNrZWxsLWdoYy1tb2Quc3VwcHJlc3NSZWR1bmRhbnRUeXBlSW5UeXBlQW5kSW5mb1Rvb2x0aXBzJyxcbiAgICAgIClcbiAgICAgIGlmIChzdXAgJiYgaW5mby50ZXh0LnRleHQuaW5jbHVkZXMoYDo6ICR7dHlwZS50ZXh0LnRleHR9YCkpIHtcbiAgICAgICAgdGV4dCA9IGluZm8udGV4dC50ZXh0XG4gICAgICB9IGVsc2Uge1xuICAgICAgICB0ZXh0ID0gYDo6ICR7dHlwZS50ZXh0LnRleHR9XFxuJHtpbmZvLnRleHQudGV4dH1gXG4gICAgICB9XG4gICAgfSBlbHNlIGlmICh0eXBlKSB7XG4gICAgICByYW5nZSA9IHR5cGUucmFuZ2VcbiAgICAgIHRleHQgPSBgOjogJHt0eXBlLnRleHQudGV4dH1gXG4gICAgfSBlbHNlIGlmIChpbmZvKSB7XG4gICAgICByYW5nZSA9IGluZm8ucmFuZ2VcbiAgICAgIHRleHQgPSBpbmZvLnRleHQudGV4dFxuICAgIH0gZWxzZSB7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoJ0dvdCBuZWl0aGVyIHR5cGUgbm9yIGluZm8nKVxuICAgIH1cbiAgICBjb25zdCBoaWdobGlnaHRlciA9IGF0b20uY29uZmlnLmdldCgnaGFza2VsbC1naGMtbW9kLmhpZ2hsaWdodFRvb2x0aXBzJylcbiAgICAgID8gJ3NvdXJjZS5oYXNrZWxsJ1xuICAgICAgOiB1bmRlZmluZWRcbiAgICByZXR1cm4geyByYW5nZSwgdGV4dDogeyB0ZXh0LCBoaWdobGlnaHRlciB9IH1cbiAgfVxuXG4gIHByaXZhdGUgc2V0SGlnaGxpZ2h0ZXIoKSB7XG4gICAgaWYgKGF0b20uY29uZmlnLmdldCgnaGFza2VsbC1naGMtbW9kLmhpZ2hsaWdodE1lc3NhZ2VzJykpIHtcbiAgICAgIHJldHVybiAobTogVVBJLklSZXN1bHRJdGVtKTogVVBJLklSZXN1bHRJdGVtID0+IHtcbiAgICAgICAgaWYgKHR5cGVvZiBtLm1lc3NhZ2UgPT09ICdzdHJpbmcnKSB7XG4gICAgICAgICAgY29uc3QgbWVzc2FnZTogVVBJLklNZXNzYWdlVGV4dCA9IHtcbiAgICAgICAgICAgIHRleHQ6IG0ubWVzc2FnZSxcbiAgICAgICAgICAgIGhpZ2hsaWdodGVyOiAnaGludC5tZXNzYWdlLmhhc2tlbGwnLFxuICAgICAgICAgIH1cbiAgICAgICAgICByZXR1cm4geyAuLi5tLCBtZXNzYWdlIH1cbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICByZXR1cm4gbVxuICAgICAgICB9XG4gICAgICB9XG4gICAgfSBlbHNlIHtcbiAgICAgIHJldHVybiAobTogVVBJLklSZXN1bHRJdGVtKSA9PiBtXG4gICAgfVxuICB9XG5cbiAgcHJpdmF0ZSBzZXRNZXNzYWdlcyh0eXBlOiBrZXlvZiBUTGFzdE1lc3NhZ2VzLCBtZXNzYWdlczogVVBJLklSZXN1bHRJdGVtW10pIHtcbiAgICB0aGlzLmxhc3RNZXNzYWdlc1t0eXBlXSA9IG1lc3NhZ2VzLm1hcCh0aGlzLnNldEhpZ2hsaWdodGVyKCkpXG4gICAgdGhpcy5zZW5kTWVzc2FnZXMoKVxuICB9XG5cbiAgcHJpdmF0ZSBzZW5kTWVzc2FnZXMoKSB7XG4gICAgdGhpcy51cGkuc2V0TWVzc2FnZXMoXG4gICAgICB0aGlzLnByb2Nlc3NNZXNzYWdlcy5jb25jYXQoXG4gICAgICAgIHRoaXMubGFzdE1lc3NhZ2VzLmNoZWNrLFxuICAgICAgICB0aGlzLmxhc3RNZXNzYWdlcy5saW50LFxuICAgICAgKSxcbiAgICApXG4gIH1cblxuICBAaGFuZGxlRXhjZXB0aW9uXG4gIHByaXZhdGUgYXN5bmMgY2hlY2tMaW50KFxuICAgIGJ1ZmZlcjogVGV4dEJ1ZmZlcixcbiAgICBvcHQ6ICdTYXZlJyB8ICdDaGFuZ2UnLFxuICAgIGZhc3Q6IGJvb2xlYW4sXG4gICkge1xuICAgIGNvbnN0IGNoZWNrID0gYXRvbS5jb25maWcuZ2V0KGBoYXNrZWxsLWdoYy1tb2Qub24ke29wdH1DaGVja2AgYXNcbiAgICAgIHwgJ2hhc2tlbGwtZ2hjLW1vZC5vblNhdmVDaGVjaydcbiAgICAgIHwgJ2hhc2tlbGwtZ2hjLW1vZC5vbkNoYW5nZUNoZWNrJylcbiAgICBjb25zdCBsaW50ID0gYXRvbS5jb25maWcuZ2V0KGBoYXNrZWxsLWdoYy1tb2Qub24ke29wdH1MaW50YCBhc1xuICAgICAgfCAnaGFza2VsbC1naGMtbW9kLm9uU2F2ZUxpbnQnXG4gICAgICB8ICdoYXNrZWxsLWdoYy1tb2Qub25DaGFuZ2VMaW50JylcbiAgICBjb25zdCBwcm9taXNlcyA9IFtdXG4gICAgaWYgKGNoZWNrKSB7XG4gICAgICBwcm9taXNlcy5wdXNoKFxuICAgICAgICB0aGlzLnByb2Nlc3MuZG9DaGVja0J1ZmZlcihidWZmZXIsIGZhc3QpLnRoZW4oKHJlcykgPT4ge1xuICAgICAgICAgIHRoaXMuc2V0TWVzc2FnZXMoJ2NoZWNrJywgcmVzKVxuICAgICAgICB9KSxcbiAgICAgIClcbiAgICB9XG4gICAgaWYgKGxpbnQpIHtcbiAgICAgIHByb21pc2VzLnB1c2goXG4gICAgICAgIHRoaXMucHJvY2Vzcy5kb0xpbnRCdWZmZXIoYnVmZmVyKS50aGVuKChyZXMpID0+IHtcbiAgICAgICAgICB0aGlzLnNldE1lc3NhZ2VzKCdsaW50JywgcmVzKVxuICAgICAgICB9KSxcbiAgICAgIClcbiAgICB9XG4gICAgYXdhaXQgUHJvbWlzZS5hbGwocHJvbWlzZXMpXG4gIH1cblxuICBwcml2YXRlIGNvbnNvbGVSZXBvcnQoYXJnOiBJRXJyb3JDYWxsYmFja0FyZ3MpIHtcbiAgICAvLyB0c2xpbnQ6ZGlzYmFsZS1uZXh0LWxpbmU6IG5vLWNvbnNvbGVcbiAgICBjb25zb2xlLmVycm9yKFV0aWwuZm9ybWF0RXJyb3IoYXJnKSwgVXRpbC5nZXRFcnJvckRldGFpbChhcmcpKVxuICB9XG5cbiAgcHJpdmF0ZSBoYW5kbGVQcm9jZXNzRXJyb3IoYXJnOiBJRXJyb3JDYWxsYmFja0FyZ3MpIHtcbiAgICBzd2l0Y2ggKHRoaXMubXNnQmFja2VuZCkge1xuICAgICAgY2FzZSAndXBpJzpcbiAgICAgICAgdGhpcy5wcm9jZXNzTWVzc2FnZXMucHVzaCh7XG4gICAgICAgICAgbWVzc2FnZTpcbiAgICAgICAgICAgIFV0aWwuZm9ybWF0RXJyb3IoYXJnKSArXG4gICAgICAgICAgICAnXFxuXFxuU2VlIGNvbnNvbGUgKFZpZXcg4oaSIERldmVsb3BlciDihpIgVG9nZ2xlIERldmVsb3BlciBUb29scyDihpIgQ29uc29sZSB0YWIpIGZvciBkZXRhaWxzLicsXG4gICAgICAgICAgc2V2ZXJpdHk6ICdnaGMtbW9kJyxcbiAgICAgICAgfSlcbiAgICAgICAgdGhpcy5jb25zb2xlUmVwb3J0KGFyZylcbiAgICAgICAgdGhpcy5zZW5kTWVzc2FnZXMoKVxuICAgICAgICBicmVha1xuICAgICAgY2FzZSAnY29uc29sZSc6XG4gICAgICAgIHRoaXMuY29uc29sZVJlcG9ydChhcmcpXG4gICAgICAgIGJyZWFrXG4gICAgICBjYXNlICdwb3B1cCc6XG4gICAgICAgIHRoaXMuY29uc29sZVJlcG9ydChhcmcpXG4gICAgICAgIGF0b20ubm90aWZpY2F0aW9ucy5hZGRFcnJvcihVdGlsLmZvcm1hdEVycm9yKGFyZyksIHtcbiAgICAgICAgICBkZXRhaWw6IFV0aWwuZ2V0RXJyb3JEZXRhaWwoYXJnKSxcbiAgICAgICAgICBkaXNtaXNzYWJsZTogdHJ1ZSxcbiAgICAgICAgfSlcbiAgICAgICAgYnJlYWtcbiAgICB9XG4gIH1cblxuICBwcml2YXRlIGhhbmRsZVByb2Nlc3NXYXJuaW5nKHdhcm5pbmc6IHN0cmluZykge1xuICAgIHN3aXRjaCAodGhpcy5tc2dCYWNrZW5kKSB7XG4gICAgICBjYXNlICd1cGknOlxuICAgICAgICB0aGlzLnByb2Nlc3NNZXNzYWdlcy5wdXNoKHtcbiAgICAgICAgICBtZXNzYWdlOiB3YXJuaW5nLFxuICAgICAgICAgIHNldmVyaXR5OiAnZ2hjLW1vZCcsXG4gICAgICAgIH0pXG4gICAgICAgIFV0aWwud2Fybih3YXJuaW5nKVxuICAgICAgICB0aGlzLnNlbmRNZXNzYWdlcygpXG4gICAgICAgIGJyZWFrXG4gICAgICBjYXNlICdjb25zb2xlJzpcbiAgICAgICAgVXRpbC53YXJuKHdhcm5pbmcpXG4gICAgICAgIGJyZWFrXG4gICAgICBjYXNlICdwb3B1cCc6XG4gICAgICAgIFV0aWwud2Fybih3YXJuaW5nKVxuICAgICAgICBhdG9tLm5vdGlmaWNhdGlvbnMuYWRkV2FybmluZyh3YXJuaW5nLCB7XG4gICAgICAgICAgZGlzbWlzc2FibGU6IGZhbHNlLFxuICAgICAgICB9KVxuICAgICAgICBicmVha1xuICAgIH1cbiAgfVxufVxuIl19