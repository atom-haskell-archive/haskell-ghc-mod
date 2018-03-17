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
        try {
            if (t)
                return await this[`${t}Tooltip`](editor, crange);
            else
                return undefined;
        }
        catch (e) {
            Util.warn(e);
            return undefined;
        }
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidXBpLWNvbnN1bWVyLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vc3JjL3VwaS1jb25zdW1lci50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOzs7QUFBQSwrQkFRYTtBQUViLCtEQUF5RDtBQUN6RCwrQkFBOEI7QUFFOUIsTUFBTSxFQUFFLGVBQWUsRUFBRSxHQUFHLElBQUksQ0FBQTtBQUVoQyxNQUFNLFlBQVksR0FBRztJQUNuQixLQUFLLEVBQUUsRUFBRTtJQUNULE9BQU8sRUFBRSxFQUFFO0lBQ1gsSUFBSSxFQUFFLEVBQUU7Q0FDVCxDQUFBO0FBRUQsTUFBTSxXQUFXLEdBQUc7SUFDbEIsU0FBUyxFQUFFO1FBQ1QsU0FBUyxFQUFFLEtBQUs7UUFDaEIsVUFBVSxFQUFFLElBQUk7S0FDakI7Q0FDRixDQUFBO0FBRUQsTUFBTSxZQUFZLEdBQUcsMkNBQTJDLENBQUE7QUFFaEUsTUFBTSxRQUFRLEdBQUc7SUFDZixLQUFLLEVBQUUsU0FBUztJQUNoQixJQUFJLEVBQUU7UUFDSixFQUFFLEtBQUssRUFBRSxPQUFPLEVBQUUsT0FBTyxFQUFFLDRCQUE0QixFQUFFO1FBQ3pELEVBQUUsS0FBSyxFQUFFLE1BQU0sRUFBRSxPQUFPLEVBQUUsMkJBQTJCLEVBQUU7UUFDdkQsRUFBRSxLQUFLLEVBQUUsY0FBYyxFQUFFLE9BQU8sRUFBRSxrQ0FBa0MsRUFBRTtLQUN2RTtDQUNGLENBQUE7QUFRRDtJQThERSxZQUFZLFFBQThCLEVBQVUsT0FBdUI7UUFBdkIsWUFBTyxHQUFQLE9BQU8sQ0FBZ0I7UUE1RG5FLGdCQUFXLEdBQXdCLElBQUksMEJBQW1CLEVBQUUsQ0FBQTtRQUM1RCxvQkFBZSxHQUFzQixFQUFFLENBQUE7UUFDdkMsaUJBQVksR0FBa0IsRUFBRSxLQUFLLEVBQUUsRUFBRSxFQUFFLElBQUksRUFBRSxFQUFFLEVBQUUsQ0FBQTtRQUNyRCxlQUFVLEdBQUcsSUFBSSxDQUFDLE1BQU0sQ0FBQyxHQUFHLENBQUMsZ0NBQWdDLENBQUMsQ0FB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LFlBQVksRUFBRSxDQUFBO2dCQUNuQixLQUFLLENBQUE7WUFDUCxLQUFLLFNBQVM7Z0JBQ1osSUFBSSxDQUFDLElBQUksQ0FBQyxPQUFPLENBQUMsQ0FBQTtnQkFDbEIsS0FBSyxDQUFBO1lBQ1AsS0FBSyxPQUFPO2dCQUNWLElBQUksQ0FBQyxJQUFJLENBQUMsT0FBTyxDQUFDLENBQUE7Z0JBQ2xCLElBQUksQ0FBQyxhQUFhLENBQUMsVUFBVSxDQUFDLE9BQU8sRUFBRTtvQkFDckMsV0FBVyxFQUFFLEtBQUs7aUJBQ25CLENBQUMsQ0FBQTtnQkFDRixLQUFLLENBQUE7UUFDVCxDQUFDO0lBQ0gsQ0FBQztDQUNGO0FBbFlDO0lBREMsZUFBZTs7OzsrQ0FRZjtBQUdEO0lBREMsZUFBZTs7Ozs4Q0FLZjtBQWdCRDtJQURDLGVBQWU7Ozs7b0RBdURmO0FBR0Q7SUFEQyxlQUFlOzs7O21EQVlmO0FBR0Q7SUFEQyxlQUFlOzs7O2lEQTRCZjtBQUdEO0lBREMsZUFBZTs7OztrREF1QmY7QUFHRDtJQURDLGVBQWU7Ozs7c0RBMkNmO0FBNEdEO0lBREMsZUFBZTs7NkNBRU4saUJBQVU7OzRDQTBCbkI7QUE5Y0gsa0NBbWdCQyIsInNvdXJjZXNDb250ZW50IjpbImltcG9ydCB7XG4gIENvbW1hbmRFdmVudCxcbiAgQ29tcG9zaXRlRGlzcG9zYWJsZSxcbiAgUmFuZ2UsXG4gIFRleHRCdWZmZXIsXG4gIFRleHRFZGl0b3IsXG4gIFBvaW50LFxuICBUZXh0RWRpdG9yRWxlbWVudCxcbn0gZnJvbSAnYXRvbSdcbmltcG9ydCB7IEdoY01vZGlQcm9jZXNzLCBJRXJyb3JDYWxsYmFja0FyZ3MgfSBmcm9tICcuL2doYy1tb2QnXG5pbXBvcnQgeyBpbXBvcnRMaXN0VmlldyB9IGZyb20gJy4vdmlld3MvaW1wb3J0LWxpc3QtdmlldydcbmltcG9ydCAqIGFzIFV0aWwgZnJvbSAnLi91dGlsJ1xuaW1wb3J0ICogYXMgVVBJIGZyb20gJ2F0b20taGFza2VsbC11cGknXG5jb25zdCB7IGhhbmRsZUV4Y2VwdGlvbiB9ID0gVXRpbFxuXG5jb25zdCBtZXNzYWdlVHlwZXMgPSB7XG4gIGVycm9yOiB7fSxcbiAgd2FybmluZzoge30sXG4gIGxpbnQ6IHt9LFxufVxuXG5jb25zdCBhZGRNc2dUeXBlcyA9IHtcbiAgJ2doYy1tb2QnOiB7XG4gICAgdXJpRmlsdGVyOiBmYWxzZSxcbiAgICBhdXRvU2Nyb2xsOiB0cnVlLFxuICB9LFxufVxuXG5jb25zdCBjb250ZXh0U2NvcGUgPSAnYXRvbS10ZXh0LWVkaXRvcltkYXRhLWdyYW1tYXJ+PVwiaGFza2VsbFwiXSdcblxuY29uc3QgbWFpbk1lbnUgPSB7XG4gIGxhYmVsOiAnZ2hjLW1vZCcsXG4gIG1lbnU6IFtcbiAgICB7IGxhYmVsOiAnQ2hlY2snLCBjb21tYW5kOiAnaGFza2VsbC1naGMtbW9kOmNoZWNrLWZpbGUnIH0sXG4gICAgeyBsYWJlbDogJ0xpbnQnLCBjb21tYW5kOiAnaGFza2VsbC1naGMtbW9kOmxpbnQtZmlsZScgfSxcbiAgICB7IGxhYmVsOiAnU3RvcCBCYWNrZW5kJywgY29tbWFuZDogJ2hhc2tlbGwtZ2hjLW1vZDpzaHV0ZG93bi1iYWNrZW5kJyB9LFxuICBdLFxufVxuXG50eXBlIFRFQ29tbWFuZEV2ZW50ID0gQ29tbWFuZEV2ZW50PFRleHRFZGl0b3JFbGVtZW50PlxudHlwZSBUTGFzdE1lc3NhZ2VzID0ge1xuICBjaGVjazogVVBJLklSZXN1bHRJdGVtW11cbiAgbGludDogVVBJLklSZXN1bHRJdGVtW11cbn1cblxuZXhwb3J0IGNsYXNzIFVQSUNvbnN1bWVyIHtcbiAgcHVibGljIHVwaTogVVBJLklVUElJbnN0YW5jZVxuICBwcml2YXRlIGRpc3Bvc2FibGVzOiBDb21wb3NpdGVEaXNwb3NhYmxlID0gbmV3IENvbXBvc2l0ZURpc3Bvc2FibGUoKVxuICBwcml2YXRlIHByb2Nlc3NNZXNzYWdlczogVVBJLklSZXN1bHRJdGVtW10gPSBbXVxuICBwcml2YXRlIGxhc3RNZXNzYWdlczogVExhc3RNZXNzYWdlcyA9IHsgY2hlY2s6IFtdLCBsaW50OiBbXSB9XG4gIHByaXZhdGUgbXNnQmFja2VuZCA9IGF0b20uY29uZmlnLmdldCgnaGFza2VsbC1naGMtbW9kLmdoY01vZE1lc3NhZ2VzJylcblxuICBwcml2YXRlIGNvbnRleHRDb21tYW5kcyA9IHtcbiAgICAnaGFza2VsbC1naGMtbW9kOnNob3ctdHlwZSc6IHRoaXMudG9vbHRpcENvbW1hbmQoXG4gICAgICB0aGlzLnR5cGVUb29sdGlwLmJpbmQodGhpcyksXG4gICAgKSxcbiAgICAnaGFza2VsbC1naGMtbW9kOnNob3ctaW5mbyc6IHRoaXMudG9vbHRpcENvbW1hbmQoXG4gICAgICB0aGlzLmluZm9Ub29sdGlwLmJpbmQodGhpcyksXG4gICAgKSxcbiAgICAnaGFza2VsbC1naGMtbW9kOmNhc2Utc3BsaXQnOiB0aGlzLmNhc2VTcGxpdENvbW1hbmQuYmluZCh0aGlzKSxcbiAgICAnaGFza2VsbC1naGMtbW9kOnNpZy1maWxsJzogdGhpcy5zaWdGaWxsQ29tbWFuZC5iaW5kKHRoaXMpLFxuICAgICdoYXNrZWxsLWdoYy1tb2Q6Z28tdG8tZGVjbGFyYXRpb24nOiB0aGlzLmdvVG9EZWNsQ29tbWFuZC5iaW5kKHRoaXMpLFxuICAgICdoYXNrZWxsLWdoYy1tb2Q6c2hvdy1pbmZvLWZhbGxiYWNrLXRvLXR5cGUnOiB0aGlzLnRvb2x0aXBDb21tYW5kKFxuICAgICAgdGhpcy5pbmZvVHlwZVRvb2x0aXAuYmluZCh0aGlzKSxcbiAgICApLFxuICAgICdoYXNrZWxsLWdoYy1tb2Q6c2hvdy10eXBlLWZhbGxiYWNrLXRvLWluZm8nOiB0aGlzLnRvb2x0aXBDb21tYW5kKFxuICAgICAgdGhpcy50eXBlSW5mb1Rvb2x0aXAuYmluZCh0aGlzKSxcbiAgICApLFxuICAgICdoYXNrZWxsLWdoYy1tb2Q6c2hvdy10eXBlLWFuZC1pbmZvJzogdGhpcy50b29sdGlwQ29tbWFuZChcbiAgICAgIHRoaXMudHlwZUFuZEluZm9Ub29sdGlwLmJpbmQodGhpcyksXG4gICAgKSxcbiAgICAnaGFza2VsbC1naGMtbW9kOmluc2VydC10eXBlJzogdGhpcy5pbnNlcnRUeXBlQ29tbWFuZC5iaW5kKHRoaXMpLFxuICAgICdoYXNrZWxsLWdoYy1tb2Q6aW5zZXJ0LWltcG9ydCc6IHRoaXMuaW5zZXJ0SW1wb3J0Q29tbWFuZC5iaW5kKHRoaXMpLFxuICB9XG5cbiAgcHJpdmF0ZSBnbG9iYWxDb21tYW5kcyA9IHtcbiAgICAnaGFza2VsbC1naGMtbW9kOmNoZWNrLWZpbGUnOiB0aGlzLmNoZWNrQ29tbWFuZC5iaW5kKHRoaXMpLFxuICAgICdoYXNrZWxsLWdoYy1tb2Q6bGludC1maWxlJzogdGhpcy5saW50Q29tbWFuZC5iaW5kKHRoaXMpLFxuICAgIC4uLnRoaXMuY29udGV4dENvbW1hbmRzLFxuICB9XG5cbiAgcHJpdmF0ZSBjb250ZXh0TWVudToge1xuICAgIGxhYmVsOiBzdHJpbmdcbiAgICBzdWJtZW51OiBBcnJheTx7XG4gICAgICBsYWJlbDogc3RyaW5nXG4gICAgICBjb21tYW5kOiBrZXlvZiBVUElDb25zdW1lclsnY29udGV4dENvbW1hbmRzJ11cbiAgICB9PlxuICB9ID0ge1xuICAgIGxhYmVsOiAnZ2hjLW1vZCcsXG4gICAgc3VibWVudTogW1xuICAgICAgeyBsYWJlbDogJ1Nob3cgVHlwZScsIGNvbW1hbmQ6ICdoYXNrZWxsLWdoYy1tb2Q6c2hvdy10eXBlJyB9LFxuICAgICAgeyBsYWJlbDogJ1Nob3cgSW5mbycsIGNvbW1hbmQ6ICdoYXNrZWxsLWdoYy1tb2Q6c2hvdy1pbmZvJyB9LFxuICAgICAge1xuICAgICAgICBsYWJlbDogJ1Nob3cgVHlwZSBBbmQgSW5mbycsXG4gICAgICAgIGNvbW1hbmQ6ICdoYXNrZWxsLWdoYy1tb2Q6c2hvdy10eXBlLWFuZC1pbmZvJyxcbiAgICAgIH0sXG4gICAgICB7IGxhYmVsOiAnQ2FzZSBTcGxpdCcsIGNvbW1hbmQ6ICdoYXNrZWxsLWdoYy1tb2Q6Y2FzZS1zcGxpdCcgfSxcbiAgICAgIHsgbGFiZWw6ICdTaWcgRmlsbCcsIGNvbW1hbmQ6ICdoYXNrZWxsLWdoYy1tb2Q6c2lnLWZpbGwnIH0sXG4gICAgICB7IGxhYmVsOiAnSW5zZXJ0IFR5cGUnLCBjb21tYW5kOiAnaGFza2VsbC1naGMtbW9kOmluc2VydC10eXBlJyB9LFxuICAgICAgeyBsYWJlbDogJ0luc2VydCBJbXBvcnQnLCBjb21tYW5kOiAnaGFza2VsbC1naGMtbW9kOmluc2VydC1pbXBvcnQnIH0sXG4gICAgICB7XG4gICAgICAgIGxhYmVsOiAnR28gVG8gRGVjbGFyYXRpb24nLFxuICAgICAgICBjb21tYW5kOiAnaGFza2VsbC1naGMtbW9kOmdvLXRvLWRlY2xhcmF0aW9uJyxcbiAgICAgIH0sXG4gICAgXSxcbiAgfVxuXG4gIGNvbnN0cnVjdG9yKHJlZ2lzdGVyOiBVUEkuSVVQSVJlZ2lzdHJhdGlvbiwgcHJpdmF0ZSBwcm9jZXNzOiBHaGNNb2RpUHJvY2Vzcykge1xuICAgIHRoaXMuZGlzcG9zYWJsZXMuYWRkKFxuICAgICAgdGhpcy5wcm9jZXNzLm9uRXJyb3IodGhpcy5oYW5kbGVQcm9jZXNzRXJyb3IuYmluZCh0aGlzKSksXG4gICAgICB0aGlzLnByb2Nlc3Mub25XYXJuaW5nKHRoaXMuaGFuZGxlUHJvY2Vzc1dhcm5pbmcuYmluZCh0aGlzKSksXG4gICAgKVxuXG4gICAgY29uc3QgbXNnVHlwZXMgPVxuICAgICAgdGhpcy5tc2dCYWNrZW5kID09PSAndXBpJ1xuICAgICAgICA/IHsgLi4ubWVzc2FnZVR5cGVzLCAuLi5hZGRNc2dUeXBlcyB9XG4gICAgICAgIDogbWVzc2FnZVR5cGVzXG5cbiAgICB0aGlzLnVwaSA9IHJlZ2lzdGVyKHtcbiAgICAgIG5hbWU6ICdoYXNrZWxsLWdoYy1tb2QnLFxuICAgICAgbWVudTogbWFpbk1lbnUsXG4gICAgICBtZXNzYWdlVHlwZXM6IG1zZ1R5cGVzLFxuICAgICAgdG9vbHRpcDogdGhpcy5zaG91bGRTaG93VG9vbHRpcC5iaW5kKHRoaXMpLFxuICAgICAgZXZlbnRzOiB7XG4gICAgICAgIG9uRGlkU2F2ZUJ1ZmZlcjogYXN5bmMgKGJ1ZmZlcikgPT5cbiAgICAgICAgICB0aGlzLmNoZWNrTGludChcbiAgICAgICAgICAgIGJ1ZmZlcixcbiAgICAgICAgICAgICdTYXZlJyxcbiAgICAgICAgICAgIGF0b20uY29uZmlnLmdldCgnaGFza2VsbC1naGMtbW9kLmFsd2F5c0ludGVyYWN0aXZlQ2hlY2snKSxcbiAgICAgICAgICApLFxuICAgICAgICBvbkRpZFN0b3BDaGFuZ2luZzogYXN5bmMgKGJ1ZmZlcikgPT5cbiAgICAgICAgICB0aGlzLmNoZWNrTGludChidWZmZXIsICdDaGFuZ2UnLCB0cnVlKSxcbiAgICAgIH0sXG4gICAgfSlcblxuICAgIHRoaXMuZGlzcG9zYWJsZXMuYWRkKFxuICAgICAgdGhpcy51cGksXG4gICAgICB0aGlzLnByb2Nlc3Mub25CYWNrZW5kQWN0aXZlKCgpID0+XG4gICAgICAgIHRoaXMudXBpLnNldFN0YXR1cyh7IHN0YXR1czogJ3Byb2dyZXNzJywgZGV0YWlsOiAnJyB9KSxcbiAgICAgICksXG4gICAgICB0aGlzLnByb2Nlc3Mub25CYWNrZW5kSWRsZSgoKSA9PlxuICAgICAgICB0aGlzLnVwaS5zZXRTdGF0dXMoeyBzdGF0dXM6ICdyZWFkeScsIGRldGFpbDogJycgfSksXG4gICAgICApLFxuICAgICAgYXRvbS5jb21tYW5kcy5hZGQoY29udGV4dFNjb3BlLCB0aGlzLmdsb2JhbENvbW1hbmRzKSxcbiAgICApXG4gICAgY29uc3QgY20gPSB7fVxuICAgIGNtW2NvbnRleHRTY29wZV0gPSBbdGhpcy5jb250ZXh0TWVudV1cbiAgICB0aGlzLmRpc3Bvc2FibGVzLmFkZChhdG9tLmNvbnRleHRNZW51LmFkZChjbSkpXG4gIH1cblxuICBwdWJsaWMgZGlzcG9zZSgpIHtcbiAgICB0aGlzLmRpc3Bvc2FibGVzLmRpc3Bvc2UoKVxuICB9XG5cbiAgcHJpdmF0ZSBhc3luYyBzaG91bGRTaG93VG9vbHRpcChcbiAgICBlZGl0b3I6IFRleHRFZGl0b3IsXG4gICAgY3JhbmdlOiBSYW5nZSxcbiAgICB0eXBlOiBVUEkuVEV2ZW50UmFuZ2VUeXBlLFxuICApOiBQcm9taXNlPFVQSS5JVG9vbHRpcERhdGEgfCB1bmRlZmluZWQ+IHtcbiAgICBjb25zdCBuID1cbiAgICAgIHR5cGUgPT09ICdtb3VzZSdcbiAgICAgICAgPyAnaGFza2VsbC1naGMtbW9kLm9uTW91c2VIb3ZlclNob3cnXG4gICAgICAgIDogdHlwZSA9PT0gJ3NlbGVjdGlvbicgPyAnaGFza2VsbC1naGMtbW9kLm9uU2VsZWN0aW9uU2hvdycgOiB1bmRlZmluZWRcbiAgICBjb25zdCB0ID0gbiAmJiBhdG9tLmNvbmZpZy5nZXQobilcbiAgICB0cnkge1xuICAgICAgaWYgKHQpIHJldHVybiBhd2FpdCB0aGlzW2Ake3R9VG9vbHRpcGBdKGVkaXRvciwgY3JhbmdlKVxuICAgICAgZWxzZSByZXR1cm4gdW5kZWZpbmVkXG4gICAgfSBjYXRjaCAoZSkge1xuICAgICAgVXRpbC53YXJuKGUpXG4gICAgICByZXR1cm4gdW5kZWZpbmVkXG4gICAgfVxuICB9XG5cbiAgQGhhbmRsZUV4Y2VwdGlvblxuICBwcml2YXRlIGFzeW5jIGNoZWNrQ29tbWFuZCh7IGN1cnJlbnRUYXJnZXQgfTogVEVDb21tYW5kRXZlbnQpIHtcbiAgICBjb25zdCBlZGl0b3IgPSBjdXJyZW50VGFyZ2V0LmdldE1vZGVsKClcbiAgICBjb25zdCByZXMgPSBhd2FpdCB0aGlzLnByb2Nlc3MuZG9DaGVja0J1ZmZlcihcbiAgICAgIGVkaXRvci5nZXRCdWZmZXIoKSxcbiAgICAgIGF0b20uY29uZmlnLmdldCgnaGFza2VsbC1naGMtbW9kLmFsd2F5c0ludGVyYWN0aXZlQ2hlY2snKSxcbiAgICApXG4gICAgdGhpcy5zZXRNZXNzYWdlcygnY2hlY2snLCByZXMpXG4gIH1cblxuICBAaGFuZGxlRXhjZXB0aW9uXG4gIHByaXZhdGUgYXN5bmMgbGludENvbW1hbmQoeyBjdXJyZW50VGFyZ2V0IH06IFRFQ29tbWFuZEV2ZW50KSB7XG4gICAgY29uc3QgZWRpdG9yID0gY3VycmVudFRhcmdldC5nZXRNb2RlbCgpXG4gICAgY29uc3QgcmVzID0gYXdhaXQgdGhpcy5wcm9jZXNzLmRvTGludEJ1ZmZlcihlZGl0b3IuZ2V0QnVmZmVyKCkpXG4gICAgdGhpcy5zZXRNZXNzYWdlcygnbGludCcsIHJlcylcbiAgfVxuXG4gIHByaXZhdGUgdG9vbHRpcENvbW1hbmQoXG4gICAgdG9vbHRpcGZ1bjogKGU6IFRleHRFZGl0b3IsIHA6IFJhbmdlKSA9PiBQcm9taXNlPFVQSS5JVG9vbHRpcERhdGE+LFxuICApIHtcbiAgICByZXR1cm4gYXN5bmMgKHsgY3VycmVudFRhcmdldCwgZGV0YWlsIH06IFRFQ29tbWFuZEV2ZW50KSA9PlxuICAgICAgdGhpcy51cGkuc2hvd1Rvb2x0aXAoe1xuICAgICAgICBlZGl0b3I6IGN1cnJlbnRUYXJnZXQuZ2V0TW9kZWwoKSxcbiAgICAgICAgZGV0YWlsLFxuICAgICAgICBhc3luYyB0b29sdGlwKGNyYW5nZSkge1xuICAgICAgICAgIHJldHVybiB0b29sdGlwZnVuKGN1cnJlbnRUYXJnZXQuZ2V0TW9kZWwoKSwgY3JhbmdlKVxuICAgICAgICB9LFxuICAgICAgfSlcbiAgfVxuXG4gIEBoYW5kbGVFeGNlcHRpb25cbiAgcHJpdmF0ZSBhc3luYyBpbnNlcnRUeXBlQ29tbWFuZCh7IGN1cnJlbnRUYXJnZXQsIGRldGFpbCB9OiBURUNvbW1hbmRFdmVudCkge1xuICAgIGNvbnN0IGVkaXRvciA9IGN1cnJlbnRUYXJnZXQuZ2V0TW9kZWwoKVxuICAgIGNvbnN0IGVyID0gdGhpcy51cGkuZ2V0RXZlbnRSYW5nZShlZGl0b3IsIGRldGFpbClcbiAgICBpZiAoZXIgPT09IHVuZGVmaW5lZCkge1xuICAgICAgcmV0dXJuXG4gICAgfVxuICAgIGNvbnN0IHsgY3JhbmdlLCBwb3MgfSA9IGVyXG4gICAgY29uc3Qgc3ltSW5mbyA9IFV0aWwuZ2V0U3ltYm9sQXRQb2ludChlZGl0b3IsIHBvcylcbiAgICBpZiAoIXN5bUluZm8pIHtcbiAgICAgIHJldHVyblxuICAgIH1cbiAgICBjb25zdCB7IHNjb3BlLCByYW5nZSwgc3ltYm9sIH0gPSBzeW1JbmZvXG4gICAgaWYgKHNjb3BlLnN0YXJ0c1dpdGgoJ2tleXdvcmQub3BlcmF0b3IuJykpIHtcbiAgICAgIHJldHVyblxuICAgIH0gLy8gY2FuJ3QgY29ycmVjdGx5IGhhbmRsZSBpbmZpeCBub3RhdGlvblxuICAgIGNvbnN0IHsgdHlwZSB9ID0gYXdhaXQgdGhpcy5wcm9jZXNzLmdldFR5cGVJbkJ1ZmZlcihcbiAgICAgIGVkaXRvci5nZXRCdWZmZXIoKSxcbiAgICAgIGNyYW5nZSxcbiAgICApXG4gICAgaWYgKFxuICAgICAgZWRpdG9yXG4gICAgICAgIC5nZXRUZXh0SW5CdWZmZXJSYW5nZShbXG4gICAgICAgICAgcmFuZ2UuZW5kLFxuICAgICAgICAgIGVkaXRvci5nZXRCdWZmZXIoKS5yYW5nZUZvclJvdyhyYW5nZS5lbmQucm93LCBmYWxzZSkuZW5kLFxuICAgICAgICBdKVxuICAgICAgICAubWF0Y2goLz0vKVxuICAgICkge1xuICAgICAgbGV0IGluZGVudCA9IGVkaXRvci5nZXRUZXh0SW5CdWZmZXJSYW5nZShbXG4gICAgICAgIFtyYW5nZS5zdGFydC5yb3csIDBdLFxuICAgICAgICByYW5nZS5zdGFydCxcbiAgICAgIF0pXG4gICAgICBsZXQgYmlyZFRyYWNrID0gJydcbiAgICAgIGlmIChcbiAgICAgICAgZWRpdG9yXG4gICAgICAgICAgLnNjb3BlRGVzY3JpcHRvckZvckJ1ZmZlclBvc2l0aW9uKHBvcylcbiAgICAgICAgICAuZ2V0U2NvcGVzQXJyYXkoKVxuICAgICAgICAgIC5pbmNsdWRlcygnbWV0YS5lbWJlZGRlZC5oYXNrZWxsJylcbiAgICAgICkge1xuICAgICAgICBiaXJkVHJhY2sgPSBpbmRlbnQuc2xpY2UoMCwgMilcbiAgICAgICAgaW5kZW50ID0gaW5kZW50LnNsaWNlKDIpXG4gICAgICB9XG4gICAgICBpZiAoaW5kZW50Lm1hdGNoKC9cXFMvKSkge1xuICAgICAgICBpbmRlbnQgPSBpbmRlbnQucmVwbGFjZSgvXFxTL2csICcgJylcbiAgICAgIH1cbiAgICAgIGVkaXRvci5zZXRUZXh0SW5CdWZmZXJSYW5nZShcbiAgICAgICAgW3JhbmdlLnN0YXJ0LCByYW5nZS5zdGFydF0sXG4gICAgICAgIGAke3N5bWJvbH0gOjogJHt0eXBlfVxcbiR7YmlyZFRyYWNrfSR7aW5kZW50fWAsXG4gICAgICApXG4gICAgfSBlbHNlIHtcbiAgICAgIGVkaXRvci5zZXRUZXh0SW5CdWZmZXJSYW5nZShcbiAgICAgICAgcmFuZ2UsXG4gICAgICAgIGAoJHtlZGl0b3IuZ2V0VGV4dEluQnVmZmVyUmFuZ2UocmFuZ2UpfSA6OiAke3R5cGV9KWAsXG4gICAgICApXG4gICAgfVxuICB9XG5cbiAgQGhhbmRsZUV4Y2VwdGlvblxuICBwcml2YXRlIGFzeW5jIGNhc2VTcGxpdENvbW1hbmQoeyBjdXJyZW50VGFyZ2V0LCBkZXRhaWwgfTogVEVDb21tYW5kRXZlbnQpIHtcbiAgICBjb25zdCBlZGl0b3IgPSBjdXJyZW50VGFyZ2V0LmdldE1vZGVsKClcbiAgICBjb25zdCBldnIgPSB0aGlzLnVwaS5nZXRFdmVudFJhbmdlKGVkaXRvciwgZGV0YWlsKVxuICAgIGlmICghZXZyKSB7XG4gICAgICByZXR1cm5cbiAgICB9XG4gICAgY29uc3QgeyBjcmFuZ2UgfSA9IGV2clxuICAgIGNvbnN0IHJlcyA9IGF3YWl0IHRoaXMucHJvY2Vzcy5kb0Nhc2VTcGxpdChlZGl0b3IuZ2V0QnVmZmVyKCksIGNyYW5nZSlcbiAgICBmb3IgKGNvbnN0IHsgcmFuZ2UsIHJlcGxhY2VtZW50IH0gb2YgcmVzKSB7XG4gICAgICBlZGl0b3Iuc2V0VGV4dEluQnVmZmVyUmFuZ2UocmFuZ2UsIHJlcGxhY2VtZW50KVxuICAgIH1cbiAgfVxuXG4gIEBoYW5kbGVFeGNlcHRpb25cbiAgcHJpdmF0ZSBhc3luYyBzaWdGaWxsQ29tbWFuZCh7IGN1cnJlbnRUYXJnZXQsIGRldGFpbCB9OiBURUNvbW1hbmRFdmVudCkge1xuICAgIGNvbnN0IGVkaXRvciA9IGN1cnJlbnRUYXJnZXQuZ2V0TW9kZWwoKVxuICAgIGNvbnN0IGV2ciA9IHRoaXMudXBpLmdldEV2ZW50UmFuZ2UoZWRpdG9yLCBkZXRhaWwpXG4gICAgaWYgKCFldnIpIHtcbiAgICAgIHJldHVyblxuICAgIH1cbiAgICBjb25zdCB7IGNyYW5nZSB9ID0gZXZyXG4gICAgY29uc3QgcmVzID0gYXdhaXQgdGhpcy5wcm9jZXNzLmRvU2lnRmlsbChlZGl0b3IuZ2V0QnVmZmVyKCksIGNyYW5nZSlcblxuICAgIGVkaXRvci50cmFuc2FjdCgoKSA9PiB7XG4gICAgICBjb25zdCB7IHR5cGUsIHJhbmdlLCBib2R5IH0gPSByZXNcbiAgICAgIGNvbnN0IHNpZyA9IGVkaXRvci5nZXRUZXh0SW5CdWZmZXJSYW5nZShyYW5nZSlcbiAgICAgIGxldCBpbmRlbnQgPSBlZGl0b3IuaW5kZW50TGV2ZWxGb3JMaW5lKHNpZylcbiAgICAgIGNvbnN0IHBvcyA9IHJhbmdlLmVuZFxuICAgICAgY29uc3QgdGV4dCA9IGBcXG4ke2JvZHl9YFxuICAgICAgaWYgKHR5cGUgPT09ICdpbnN0YW5jZScpIHtcbiAgICAgICAgaW5kZW50ICs9IDFcbiAgICAgICAgaWYgKCFzaWcuZW5kc1dpdGgoJyB3aGVyZScpKSB7XG4gICAgICAgICAgZWRpdG9yLnNldFRleHRJbkJ1ZmZlclJhbmdlKFtyYW5nZS5lbmQsIHJhbmdlLmVuZF0sICcgd2hlcmUnKVxuICAgICAgICB9XG4gICAgICB9XG4gICAgICBjb25zdCBuZXdyYW5nZSA9IGVkaXRvci5zZXRUZXh0SW5CdWZmZXJSYW5nZShbcG9zLCBwb3NdLCB0ZXh0KVxuICAgICAgbmV3cmFuZ2VcbiAgICAgICAgLmdldFJvd3MoKVxuICAgICAgICAuc2xpY2UoMSlcbiAgICAgICAgLm1hcCgocm93KSA9PiBlZGl0b3Iuc2V0SW5kZW50YXRpb25Gb3JCdWZmZXJSb3cocm93LCBpbmRlbnQpKVxuICAgIH0pXG4gIH1cblxuICBAaGFuZGxlRXhjZXB0aW9uXG4gIHByaXZhdGUgYXN5bmMgZ29Ub0RlY2xDb21tYW5kKHsgY3VycmVudFRhcmdldCwgZGV0YWlsIH06IFRFQ29tbWFuZEV2ZW50KSB7XG4gICAgY29uc3QgZWRpdG9yID0gY3VycmVudFRhcmdldC5nZXRNb2RlbCgpXG4gICAgY29uc3QgZXZyID0gdGhpcy51cGkuZ2V0RXZlbnRSYW5nZShlZGl0b3IsIGRldGFpbClcbiAgICBpZiAoIWV2cikge1xuICAgICAgcmV0dXJuXG4gICAgfVxuICAgIGNvbnN0IHsgY3JhbmdlIH0gPSBldnJcbiAgICBjb25zdCB7IGluZm8gfSA9IGF3YWl0IHRoaXMucHJvY2Vzcy5nZXRJbmZvSW5CdWZmZXIoZWRpdG9yLCBjcmFuZ2UpXG4gICAgY29uc3QgcmVzID0gLy4qLS0gRGVmaW5lZCBhdCAoLispOihcXGQrKTooXFxkKykvLmV4ZWMoaW5mbylcbiAgICBpZiAoIXJlcykge1xuICAgICAgcmV0dXJuXG4gICAgfVxuICAgIGNvbnN0IFtmbiwgbGluZSwgY29sXSA9IHJlcy5zbGljZSgxKVxuICAgIGNvbnN0IHJvb3REaXIgPSBhd2FpdCB0aGlzLnByb2Nlc3MuZ2V0Um9vdERpcihlZGl0b3IuZ2V0QnVmZmVyKCkpXG4gICAgaWYgKCFyb290RGlyKSB7XG4gICAgICByZXR1cm5cbiAgICB9XG4gICAgY29uc3QgdXJpID0gcm9vdERpci5nZXRGaWxlKGZuKS5nZXRQYXRoKCkgfHwgZm5cbiAgICBhd2FpdCBhdG9tLndvcmtzcGFjZS5vcGVuKHVyaSwge1xuICAgICAgaW5pdGlhbExpbmU6IHBhcnNlSW50KGxpbmUsIDEwKSAtIDEsXG4gICAgICBpbml0aWFsQ29sdW1uOiBwYXJzZUludChjb2wsIDEwKSAtIDEsXG4gICAgfSlcbiAgfVxuXG4gIEBoYW5kbGVFeGNlcHRpb25cbiAgcHJpdmF0ZSBhc3luYyBpbnNlcnRJbXBvcnRDb21tYW5kKHsgY3VycmVudFRhcmdldCwgZGV0YWlsIH06IFRFQ29tbWFuZEV2ZW50KSB7XG4gICAgY29uc3QgZWRpdG9yID0gY3VycmVudFRhcmdldC5nZXRNb2RlbCgpXG4gICAgY29uc3QgYnVmZmVyID0gZWRpdG9yLmdldEJ1ZmZlcigpXG4gICAgY29uc3QgZXZyID0gdGhpcy51cGkuZ2V0RXZlbnRSYW5nZShlZGl0b3IsIGRldGFpbClcbiAgICBpZiAoIWV2cikge1xuICAgICAgcmV0dXJuXG4gICAgfVxuICAgIGNvbnN0IHsgY3JhbmdlIH0gPSBldnJcbiAgICBjb25zdCBsaW5lcyA9IGF3YWl0IHRoaXMucHJvY2Vzcy5maW5kU3ltYm9sUHJvdmlkZXJzSW5CdWZmZXIoZWRpdG9yLCBjcmFuZ2UpXG4gICAgY29uc3QgbW9kID0gYXdhaXQgaW1wb3J0TGlzdFZpZXcobGluZXMpXG4gICAgaWYgKG1vZCkge1xuICAgICAgY29uc3QgcGkgPSBhd2FpdCBuZXcgUHJvbWlzZTx7IHBvczogUG9pbnQ7IGluZGVudDogc3RyaW5nOyBlbmQ6IHN0cmluZyB9PihcbiAgICAgICAgKHJlc29sdmUpID0+IHtcbiAgICAgICAgICBidWZmZXIuYmFja3dhcmRzU2NhbigvXihcXHMqKShpbXBvcnR8bW9kdWxlKS8sICh7IG1hdGNoLCByYW5nZSB9KSA9PiB7XG4gICAgICAgICAgICBsZXQgaW5kZW50ID0gJydcbiAgICAgICAgICAgIHN3aXRjaCAobWF0Y2hbMl0pIHtcbiAgICAgICAgICAgICAgY2FzZSAnaW1wb3J0JzpcbiAgICAgICAgICAgICAgICBpbmRlbnQgPSBgXFxuJHttYXRjaFsxXX1gXG4gICAgICAgICAgICAgICAgYnJlYWtcbiAgICAgICAgICAgICAgY2FzZSAnbW9kdWxlJzpcbiAgICAgICAgICAgICAgICBpbmRlbnQgPSBgXFxuXFxuJHttYXRjaFsxXX1gXG4gICAgICAgICAgICAgICAgYnJlYWtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHJlc29sdmUoe1xuICAgICAgICAgICAgICBwb3M6IGJ1ZmZlci5yYW5nZUZvclJvdyhyYW5nZS5zdGFydC5yb3csIGZhbHNlKS5lbmQsXG4gICAgICAgICAgICAgIGluZGVudCxcbiAgICAgICAgICAgICAgZW5kOiAnJyxcbiAgICAgICAgICAgIH0pXG4gICAgICAgICAgfSlcbiAgICAgICAgICAvLyBub3RoaW5nIGZvdW5kXG4gICAgICAgICAgcmVzb2x2ZSh7XG4gICAgICAgICAgICBwb3M6IGJ1ZmZlci5nZXRGaXJzdFBvc2l0aW9uKCksXG4gICAgICAgICAgICBpbmRlbnQ6ICcnLFxuICAgICAgICAgICAgZW5kOiAnXFxuJyxcbiAgICAgICAgICB9KVxuICAgICAgICB9LFxuICAgICAgKVxuICAgICAgZWRpdG9yLnNldFRleHRJbkJ1ZmZlclJhbmdlKFxuICAgICAgICBbcGkucG9zLCBwaS5wb3NdLFxuICAgICAgICBgJHtwaS5pbmRlbnR9aW1wb3J0ICR7bW9kfSR7cGkuZW5kfWAsXG4gICAgICApXG4gICAgfVxuICB9XG5cbiAgcHJpdmF0ZSBhc3luYyB0eXBlVG9vbHRpcChlOiBUZXh0RWRpdG9yLCBwOiBSYW5nZSkge1xuICAgIGNvbnN0IHsgcmFuZ2UsIHR5cGUgfSA9IGF3YWl0IHRoaXMucHJvY2Vzcy5nZXRUeXBlSW5CdWZmZXIoZS5nZXRCdWZmZXIoKSwgcClcbiAgICByZXR1cm4ge1xuICAgICAgcmFuZ2UsXG4gICAgICB0ZXh0OiB7XG4gICAgICAgIHRleHQ6IHR5cGUsXG4gICAgICAgIGhpZ2hsaWdodGVyOiBhdG9tLmNvbmZpZy5nZXQoJ2hhc2tlbGwtZ2hjLW1vZC5oaWdobGlnaHRUb29sdGlwcycpXG4gICAgICAgICAgPyAnaGludC50eXBlLmhhc2tlbGwnXG4gICAgICAgICAgOiB1bmRlZmluZWQsXG4gICAgICB9LFxuICAgIH1cbiAgfVxuXG4gIHByaXZhdGUgYXN5bmMgaW5mb1Rvb2x0aXAoZTogVGV4dEVkaXRvciwgcDogUmFuZ2UpIHtcbiAgICBjb25zdCB7IHJhbmdlLCBpbmZvIH0gPSBhd2FpdCB0aGlzLnByb2Nlc3MuZ2V0SW5mb0luQnVmZmVyKGUsIHApXG4gICAgcmV0dXJuIHtcbiAgICAgIHJhbmdlLFxuICAgICAgdGV4dDoge1xuICAgICAgICB0ZXh0OiBpbmZvLFxuICAgICAgICBoaWdobGlnaHRlcjogYXRvbS5jb25maWcuZ2V0KCdoYXNrZWxsLWdoYy1tb2QuaGlnaGxpZ2h0VG9vbHRpcHMnKVxuICAgICAgICAgID8gJ3NvdXJjZS5oYXNrZWxsJ1xuICAgICAgICAgIDogdW5kZWZpbmVkLFxuICAgICAgfSxcbiAgICB9XG4gIH1cblxuICBwcml2YXRlIGFzeW5jIGluZm9UeXBlVG9vbHRpcChlOiBUZXh0RWRpdG9yLCBwOiBSYW5nZSkge1xuICAgIHRyeSB7XG4gICAgICByZXR1cm4gYXdhaXQgdGhpcy5pbmZvVG9vbHRpcChlLCBwKVxuICAgIH0gY2F0Y2gge1xuICAgICAgcmV0dXJuIHRoaXMudHlwZVRvb2x0aXAoZSwgcClcbiAgICB9XG4gIH1cblxuICBwcml2YXRlIGFzeW5jIHR5cGVJbmZvVG9vbHRpcChlOiBUZXh0RWRpdG9yLCBwOiBSYW5nZSkge1xuICAgIHRyeSB7XG4gICAgICByZXR1cm4gYXdhaXQgdGhpcy50eXBlVG9vbHRpcChlLCBwKVxuICAgIH0gY2F0Y2gge1xuICAgICAgcmV0dXJuIHRoaXMuaW5mb1Rvb2x0aXAoZSwgcClcbiAgICB9XG4gIH1cblxuICBwcml2YXRlIGFzeW5jIHR5cGVBbmRJbmZvVG9vbHRpcChlOiBUZXh0RWRpdG9yLCBwOiBSYW5nZSkge1xuICAgIGNvbnN0IHR5cGVQID0gdGhpcy50eXBlVG9vbHRpcChlLCBwKS5jYXRjaCgoKSA9PiB1bmRlZmluZWQpXG4gICAgY29uc3QgaW5mb1AgPSB0aGlzLmluZm9Ub29sdGlwKGUsIHApLmNhdGNoKCgpID0+IHVuZGVmaW5lZClcbiAgICBjb25zdCBbdHlwZSwgaW5mb10gPSBhd2FpdCBQcm9taXNlLmFsbChbdHlwZVAsIGluZm9QXSlcbiAgICBsZXQgcmFuZ2U6IFJhbmdlXG4gICAgbGV0IHRleHQ6IHN0cmluZ1xuICAgIGlmICh0eXBlICYmIGluZm8pIHtcbiAgICAgIHJhbmdlID0gdHlwZS5yYW5nZS51bmlvbihpbmZvLnJhbmdlKVxuICAgICAgY29uc3Qgc3VwID0gYXRvbS5jb25maWcuZ2V0KFxuICAgICAgICAnaGFza2VsbC1naGMtbW9kLnN1cHByZXNzUmVkdW5kYW50VHlwZUluVHlwZUFuZEluZm9Ub29sdGlwcycsXG4gICAgICApXG4gICAgICBpZiAoc3VwICYmIGluZm8udGV4dC50ZXh0LmluY2x1ZGVzKGA6OiAke3R5cGUudGV4dC50ZXh0fWApKSB7XG4gICAgICAgIHRleHQgPSBpbmZvLnRleHQudGV4dFxuICAgICAgfSBlbHNlIHtcbiAgICAgICAgdGV4dCA9IGA6OiAke3R5cGUudGV4dC50ZXh0fVxcbiR7aW5mby50ZXh0LnRleHR9YFxuICAgICAgfVxuICAgIH0gZWxzZSBpZiAodHlwZSkge1xuICAgICAgcmFuZ2UgPSB0eXBlLnJhbmdlXG4gICAgICB0ZXh0ID0gYDo6ICR7dHlwZS50ZXh0LnRleHR9YFxuICAgIH0gZWxzZSBpZiAoaW5mbykge1xuICAgICAgcmFuZ2UgPSBpbmZvLnJhbmdlXG4gICAgICB0ZXh0ID0gaW5mby50ZXh0LnRleHRcbiAgICB9IGVsc2Uge1xuICAgICAgdGhyb3cgbmV3IEVycm9yKCdHb3QgbmVpdGhlciB0eXBlIG5vciBpbmZvJylcbiAgICB9XG4gICAgY29uc3QgaGlnaGxpZ2h0ZXIgPSBhdG9tLmNvbmZpZy5nZXQoJ2hhc2tlbGwtZ2hjLW1vZC5oaWdobGlnaHRUb29sdGlwcycpXG4gICAgICA/ICdzb3VyY2UuaGFza2VsbCdcbiAgICAgIDogdW5kZWZpbmVkXG4gICAgcmV0dXJuIHsgcmFuZ2UsIHRleHQ6IHsgdGV4dCwgaGlnaGxpZ2h0ZXIgfSB9XG4gIH1cblxuICBwcml2YXRlIHNldEhpZ2hsaWdodGVyKCkge1xuICAgIGlmIChhdG9tLmNvbmZpZy5nZXQoJ2hhc2tlbGwtZ2hjLW1vZC5oaWdobGlnaHRNZXNzYWdlcycpKSB7XG4gICAgICByZXR1cm4gKG06IFVQSS5JUmVzdWx0SXRlbSk6IFVQSS5JUmVzdWx0SXRlbSA9PiB7XG4gICAgICAgIGlmICh0eXBlb2YgbS5tZXNzYWdlID09PSAnc3RyaW5nJykge1xuICAgICAgICAgIGNvbnN0IG1lc3NhZ2U6IFVQSS5JTWVzc2FnZVRleHQgPSB7XG4gICAgICAgICAgICB0ZXh0OiBtLm1lc3NhZ2UsXG4gICAgICAgICAgICBoaWdobGlnaHRlcjogJ2hpbnQubWVzc2FnZS5oYXNrZWxsJyxcbiAgICAgICAgICB9XG4gICAgICAgICAgcmV0dXJuIHsgLi4ubSwgbWVzc2FnZSB9XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgcmV0dXJuIG1cbiAgICAgICAgfVxuICAgICAgfVxuICAgIH0gZWxzZSB7XG4gICAgICByZXR1cm4gKG06IFVQSS5JUmVzdWx0SXRlbSkgPT4gbVxuICAgIH1cbiAgfVxuXG4gIHByaXZhdGUgc2V0TWVzc2FnZXModHlwZToga2V5b2YgVExhc3RNZXNzYWdlcywgbWVzc2FnZXM6IFVQSS5JUmVzdWx0SXRlbVtdKSB7XG4gICAgdGhpcy5sYXN0TWVzc2FnZXNbdHlwZV0gPSBtZXNzYWdlcy5tYXAodGhpcy5zZXRIaWdobGlnaHRlcigpKVxuICAgIHRoaXMuc2VuZE1lc3NhZ2VzKClcbiAgfVxuXG4gIHByaXZhdGUgc2VuZE1lc3NhZ2VzKCkge1xuICAgIHRoaXMudXBpLnNldE1lc3NhZ2VzKFxuICAgICAgdGhpcy5wcm9jZXNzTWVzc2FnZXMuY29uY2F0KFxuICAgICAgICB0aGlzLmxhc3RNZXNzYWdlcy5jaGVjayxcbiAgICAgICAgdGhpcy5sYXN0TWVzc2FnZXMubGludCxcbiAgICAgICksXG4gICAgKVxuICB9XG5cbiAgQGhhbmRsZUV4Y2VwdGlvblxuICBwcml2YXRlIGFzeW5jIGNoZWNrTGludChcbiAgICBidWZmZXI6IFRleHRCdWZmZXIsXG4gICAgb3B0OiAnU2F2ZScgfCAnQ2hhbmdlJyxcbiAgICBmYXN0OiBib29sZWFuLFxuICApIHtcbiAgICBjb25zdCBjaGVjayA9IGF0b20uY29uZmlnLmdldChgaGFza2VsbC1naGMtbW9kLm9uJHtvcHR9Q2hlY2tgIGFzXG4gICAgICB8ICdoYXNrZWxsLWdoYy1tb2Qub25TYXZlQ2hlY2snXG4gICAgICB8ICdoYXNrZWxsLWdoYy1tb2Qub25DaGFuZ2VDaGVjaycpXG4gICAgY29uc3QgbGludCA9IGF0b20uY29uZmlnLmdldChgaGFza2VsbC1naGMtbW9kLm9uJHtvcHR9TGludGAgYXNcbiAgICAgIHwgJ2hhc2tlbGwtZ2hjLW1vZC5vblNhdmVMaW50J1xuICAgICAgfCAnaGFza2VsbC1naGMtbW9kLm9uQ2hhbmdlTGludCcpXG4gICAgY29uc3QgcHJvbWlzZXMgPSBbXVxuICAgIGlmIChjaGVjaykge1xuICAgICAgcHJvbWlzZXMucHVzaChcbiAgICAgICAgdGhpcy5wcm9jZXNzLmRvQ2hlY2tCdWZmZXIoYnVmZmVyLCBmYXN0KS50aGVuKChyZXMpID0+IHtcbiAgICAgICAgICB0aGlzLnNldE1lc3NhZ2VzKCdjaGVjaycsIHJlcylcbiAgICAgICAgfSksXG4gICAgICApXG4gICAgfVxuICAgIGlmIChsaW50KSB7XG4gICAgICBwcm9taXNlcy5wdXNoKFxuICAgICAgICB0aGlzLnByb2Nlc3MuZG9MaW50QnVmZmVyKGJ1ZmZlcikudGhlbigocmVzKSA9PiB7XG4gICAgICAgICAgdGhpcy5zZXRNZXNzYWdlcygnbGludCcsIHJlcylcbiAgICAgICAgfSksXG4gICAgICApXG4gICAgfVxuICAgIGF3YWl0IFByb21pc2UuYWxsKHByb21pc2VzKVxuICB9XG5cbiAgcHJpdmF0ZSBjb25zb2xlUmVwb3J0KGFyZzogSUVycm9yQ2FsbGJhY2tBcmdzKSB7XG4gICAgLy8gdHNsaW50OmRpc2JhbGUtbmV4dC1saW5lOiBuby1jb25zb2xlXG4gICAgY29uc29sZS5lcnJvcihVdGlsLmZvcm1hdEVycm9yKGFyZyksIFV0aWwuZ2V0RXJyb3JEZXRhaWwoYXJnKSlcbiAgfVxuXG4gIHByaXZhdGUgaGFuZGxlUHJvY2Vzc0Vycm9yKGFyZzogSUVycm9yQ2FsbGJhY2tBcmdzKSB7XG4gICAgc3dpdGNoICh0aGlzLm1zZ0JhY2tlbmQpIHtcbiAgICAgIGNhc2UgJ3VwaSc6XG4gICAgICAgIHRoaXMucHJvY2Vzc01lc3NhZ2VzLnB1c2goe1xuICAgICAgICAgIG1lc3NhZ2U6XG4gICAgICAgICAgICBVdGlsLmZvcm1hdEVycm9yKGFyZykgK1xuICAgICAgICAgICAgJ1xcblxcblNlZSBjb25zb2xlIChWaWV3IOKGkiBEZXZlbG9wZXIg4oaSIFRvZ2dsZSBEZXZlbG9wZXIgVG9vbHMg4oaSIENvbnNvbGUgdGFiKSBmb3IgZGV0YWlscy4nLFxuICAgICAgICAgIHNldmVyaXR5OiAnZ2hjLW1vZCcsXG4gICAgICAgIH0pXG4gICAgICAgIHRoaXMuY29uc29sZVJlcG9ydChhcmcpXG4gICAgICAgIHRoaXMuc2VuZE1lc3NhZ2VzKClcbiAgICAgICAgYnJlYWtcbiAgICAgIGNhc2UgJ2NvbnNvbGUnOlxuICAgICAgICB0aGlzLmNvbnNvbGVSZXBvcnQoYXJnKVxuICAgICAgICBicmVha1xuICAgICAgY2FzZSAncG9wdXAnOlxuICAgICAgICB0aGlzLmNvbnNvbGVSZXBvcnQoYXJnKVxuICAgICAgICBhdG9tLm5vdGlmaWNhdGlvbnMuYWRkRXJyb3IoVXRpbC5mb3JtYXRFcnJvcihhcmcpLCB7XG4gICAgICAgICAgZGV0YWlsOiBVdGlsLmdldEVycm9yRGV0YWlsKGFyZyksXG4gICAgICAgICAgZGlzbWlzc2FibGU6IHRydWUsXG4gICAgICAgIH0pXG4gICAgICAgIGJyZWFrXG4gICAgfVxuICB9XG5cbiAgcHJpdmF0ZSBoYW5kbGVQcm9jZXNzV2FybmluZyh3YXJuaW5nOiBzdHJpbmcpIHtcbiAgICBzd2l0Y2ggKHRoaXMubXNnQmFja2VuZCkge1xuICAgICAgY2FzZSAndXBpJzpcbiAgICAgICAgdGhpcy5wcm9jZXNzTWVzc2FnZXMucHVzaCh7XG4gICAgICAgICAgbWVzc2FnZTogd2FybmluZyxcbiAgICAgICAgICBzZXZlcml0eTogJ2doYy1tb2QnLFxuICAgICAgICB9KVxuICAgICAgICBVdGlsLndhcm4od2FybmluZylcbiAgICAgICAgdGhpcy5zZW5kTWVzc2FnZXMoKVxuICAgICAgICBicmVha1xuICAgICAgY2FzZSAnY29uc29sZSc6XG4gICAgICAgIFV0aWwud2Fybih3YXJuaW5nKVxuICAgICAgICBicmVha1xuICAgICAgY2FzZSAncG9wdXAnOlxuICAgICAgICBVdGlsLndhcm4od2FybmluZylcbiAgICAgICAgYXRvbS5ub3RpZmljYXRpb25zLmFkZFdhcm5pbmcod2FybmluZywge1xuICAgICAgICAgIGRpc21pc3NhYmxlOiBmYWxzZSxcbiAgICAgICAgfSlcbiAgICAgICAgYnJlYWtcbiAgICB9XG4gIH1cbn1cbiJdfQ==