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
        const n = type === 'mouse' ? 'haskell-ghc-mod.onMouseHoverShow'
            : type === 'selection' ? 'haskell-ghc-mod.onSelectionShow'
                : undefined;
        const t = n && atom.config.get(n);
        if (t)
            return this[`${t}Tooltip`](editor, crange);
        else
            return undefined;
    }
    async checkCommand({ currentTarget }) {
        const editor = currentTarget.getModel();
        const res = await this.process.doCheckBuffer(editor.getBuffer(), atom.config.get('haskell-ghc-mod.alwaysInteractiveCheck'));
        this.setMessages(res);
    }
    async lintCommand({ currentTarget }) {
        const editor = currentTarget.getModel();
        const res = await this.process.doLintBuffer(editor.getBuffer());
        this.setMessages(res);
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
        if (editor.getTextInBufferRange([range.end, editor.getBuffer().rangeForRow(range.end.row, false).end]).match(/=/)) {
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
            newrange.getRows().slice(1).map((row) => editor.setIndentationForBufferRow(row, indent));
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
                    resolve({ pos: buffer.rangeForRow(range.start.row, false).end, indent, end: '' });
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
                highlighter: atom.config.get('haskell-ghc-mod.highlightTooltips') ?
                    'hint.type.haskell' : undefined,
            },
        };
    }
    async infoTooltip(e, p) {
        const { range, info } = await this.process.getInfoInBuffer(e, p);
        return {
            range,
            text: {
                text: info,
                highlighter: atom.config.get('haskell-ghc-mod.highlightTooltips') ?
                    'source.haskell' : undefined,
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
    async checkLint(buffer, opt, fast) {
        const check = atom.config.get(`haskell-ghc-mod.on${opt}Check`);
        const lint = atom.config.get(`haskell-ghc-mod.on${opt}Lint`);
        let res;
        if (check && lint) {
            res = await this.process.doCheckAndLint(buffer, fast);
        }
        else if (check) {
            res = await this.process.doCheckBuffer(buffer, fast);
        }
        else if (lint) {
            res = await this.process.doLintBuffer(buffer);
        }
        if (res) {
            this.setMessages(res);
        }
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
exports.UPIConsumer = UPIConsumer;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidXBpLWNvbnN1bWVyLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vc3JjL3VwaS1jb25zdW1lci50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOzs7QUFBQSwrQkFBaUg7QUFFakgsK0RBQXlEO0FBQ3pELCtCQUE4QjtBQUU5QixNQUFNLEVBQUUsZUFBZSxFQUFFLEdBQUcsSUFBSSxDQUFBO0FBRWhDLE1BQU0sWUFBWSxHQUFHO0lBQ25CLEtBQUssRUFBRSxFQUFFO0lBQ1QsT0FBTyxFQUFFLEVBQUU7SUFDWCxJQUFJLEVBQUUsRUFBRTtDQUNULENBQUE7QUFFRCxNQUFNLFdBQVcsR0FBRztJQUNsQixTQUFTLEVBQUU7UUFDVCxTQUFTLEVBQUUsS0FBSztRQUNoQixVQUFVLEVBQUUsSUFBSTtLQUNqQjtDQUNGLENBQUE7QUFFRCxNQUFNLFlBQVksR0FBRywyQ0FBMkMsQ0FBQTtBQUVoRSxNQUFNLFFBQVEsR0FBRztJQUNmLEtBQUssRUFBRSxTQUFTO0lBQ2hCLElBQUksRUFBRTtRQUNKLEVBQUUsS0FBSyxFQUFFLE9BQU8sRUFBRSxPQUFPLEVBQUUsNEJBQTRCLEVBQUU7UUFDekQsRUFBRSxLQUFLLEVBQUUsTUFBTSxFQUFFLE9BQU8sRUFBRSwyQkFBMkIsRUFBRTtRQUN2RCxFQUFFLEtBQUssRUFBRSxjQUFjLEVBQUUsT0FBTyxFQUFFLGtDQUFrQyxFQUFFO0tBQ3ZFO0NBQ0YsQ0FBQTtBQUlEO0lBMkNFLFlBQVksUUFBOEIsRUFBVSxPQUF1QjtRQUF2QixZQUFPLEdBQVAsT0FBTyxDQUFnQjtRQXpDbkUsZ0JBQVcsR0FBd0IsSUFBSSwwQkFBbUIsRUFBRSxDQUFBO1FBQzVELG9CQUFlLEdBQXNCLEVBQUUsQ0FBQTtRQUN2QyxpQkFBWSxHQUFzQixFQUFFLENBQUE7UUFDcEMsZUFBVSxHQUFHLElBQUksQ0FBQyxNQUFNLENBQUMsR0FBRyxDQUFDLGdDQUFnQyxDQUFDLENBQUE7UUFFOUQsb0JBQWUsR0FBRztZQUN4QiwyQkFBMkIsRUFBRSxJ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Z0JBQ0YsS0FBSyxDQUFBO1FBQ1QsQ0FBQztJQUNILENBQUM7SUFFTyxvQkFBb0IsQ0FBQyxPQUFlO1FBQzFDLE1BQU0sQ0FBQyxDQUFDLElBQUksQ0FBQyxVQUFVLENBQUMsQ0FBQyxDQUFDO1lBQ3hCLEtBQUssS0FBSztnQkFDUixJQUFJLENBQUMsZUFBZSxDQUFDLElBQUksQ0FBQztvQkFDeEIsT0FBTyxFQUFFLE9BQU87b0JBQ2hCLFFBQVEsRUFBRSxTQUFTO2lCQUNwQixDQUFDLENBQUE7Z0JBQ0YsSUFBSSxDQUFDLElBQUksQ0FBQyxPQUFPLENBQUMsQ0FBQTtnQkFDbEIsSUFBSSxDQUFDLFlBQVksRUFBRSxDQUFBO2dCQUNuQixLQUFLLENBQUE7WUFDUCxLQUFLLFNBQVM7Z0JBQ1osSUFBSSxDQUFDLElBQUksQ0FBQyxPQUFPLENBQUMsQ0FBQTtnQkFDbEIsS0FBSyxDQUFBO1lBQ1AsS0FBSyxPQUFPO2dCQUNWLElBQUksQ0FBQyxJQUFJLENBQUMsT0FBTyxDQUFDLENBQUE7Z0JBQ2xCLElBQUksQ0FBQyxhQUFhLENBQUMsVUFBVSxDQUFDLE9BQU8sRUFBRTtvQkFDckMsV0FBVyxFQUFFLEtBQUs7aUJBQ25CLENBQUMsQ0FBQTtnQkFDRixLQUFLLENBQUE7UUFDVCxDQUFDO0lBQ0gsQ0FBQztDQUNGO0FBalRDO0lBREMsZUFBZTs7OzsrQ0FLZjtBQUdEO0lBREMsZUFBZTs7Ozs4Q0FLZjtBQWNEO0lBREMsZUFBZTs7OztvREEyQmY7QUFHRDtJQURDLGVBQWU7Ozs7bURBVWY7QUFHRDtJQURDLGVBQWU7Ozs7aURBd0JmO0FBR0Q7SUFEQyxlQUFlOzs7O2tEQWlCZjtBQUdEO0lBREMsZUFBZTs7OztzREFnQ2Y7QUE3T0gsa0NBZ1pDIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IHsgQ29tbWFuZEV2ZW50LCBDb21wb3NpdGVEaXNwb3NhYmxlLCBSYW5nZSwgVGV4dEJ1ZmZlciwgVGV4dEVkaXRvciwgUG9pbnQsIFRleHRFZGl0b3JFbGVtZW50IH0gZnJvbSAnYXRvbSdcbmltcG9ydCB7IEdoY01vZGlQcm9jZXNzLCBJRXJyb3JDYWxsYmFja0FyZ3MgfSBmcm9tICcuL2doYy1tb2QnXG5pbXBvcnQgeyBpbXBvcnRMaXN0VmlldyB9IGZyb20gJy4vdmlld3MvaW1wb3J0LWxpc3QtdmlldydcbmltcG9ydCAqIGFzIFV0aWwgZnJvbSAnLi91dGlsJ1xuaW1wb3J0ICogYXMgVVBJIGZyb20gJ2F0b20taGFza2VsbC11cGknXG5jb25zdCB7IGhhbmRsZUV4Y2VwdGlvbiB9ID0gVXRpbFxuXG5jb25zdCBtZXNzYWdlVHlwZXMgPSB7XG4gIGVycm9yOiB7fSxcbiAgd2FybmluZzoge30sXG4gIGxpbnQ6IHt9LFxufVxuXG5jb25zdCBhZGRNc2dUeXBlcyA9IHtcbiAgJ2doYy1tb2QnOiB7XG4gICAgdXJpRmlsdGVyOiBmYWxzZSxcbiAgICBhdXRvU2Nyb2xsOiB0cnVlLFxuICB9LFxufVxuXG5jb25zdCBjb250ZXh0U2NvcGUgPSAnYXRvbS10ZXh0LWVkaXRvcltkYXRhLWdyYW1tYXJ+PVwiaGFza2VsbFwiXSdcblxuY29uc3QgbWFpbk1lbnUgPSB7XG4gIGxhYmVsOiAnZ2hjLW1vZCcsXG4gIG1lbnU6IFtcbiAgICB7IGxhYmVsOiAnQ2hlY2snLCBjb21tYW5kOiAnaGFza2VsbC1naGMtbW9kOmNoZWNrLWZpbGUnIH0sXG4gICAgeyBsYWJlbDogJ0xpbnQnLCBjb21tYW5kOiAnaGFza2VsbC1naGMtbW9kOmxpbnQtZmlsZScgfSxcbiAgICB7IGxhYmVsOiAnU3RvcCBCYWNrZW5kJywgY29tbWFuZDogJ2hhc2tlbGwtZ2hjLW1vZDpzaHV0ZG93bi1iYWNrZW5kJyB9LFxuICBdLFxufVxuXG50eXBlIFRFQ29tbWFuZEV2ZW50ID0gQ29tbWFuZEV2ZW50PFRleHRFZGl0b3JFbGVtZW50PlxuXG5leHBvcnQgY2xhc3MgVVBJQ29uc3VtZXIge1xuICBwdWJsaWMgdXBpOiBVUEkuSVVQSUluc3RhbmNlXG4gIHByaXZhdGUgZGlzcG9zYWJsZXM6IENvbXBvc2l0ZURpc3Bvc2FibGUgPSBuZXcgQ29tcG9zaXRlRGlzcG9zYWJsZSgpXG4gIHByaXZhdGUgcHJvY2Vzc01lc3NhZ2VzOiBVUEkuSVJlc3VsdEl0ZW1bXSA9IFtdXG4gIHByaXZhdGUgbGFzdE1lc3NhZ2VzOiBVUEkuSVJlc3VsdEl0ZW1bXSA9IFtdXG4gIHByaXZhdGUgbXNnQmFja2VuZCA9IGF0b20uY29uZmlnLmdldCgnaGFza2VsbC1naGMtbW9kLmdoY01vZE1lc3NhZ2VzJylcblxuICBwcml2YXRlIGNvbnRleHRDb21tYW5kcyA9IHtcbiAgICAnaGFza2VsbC1naGMtbW9kOnNob3ctdHlwZSc6IHRoaXMudG9vbHRpcENvbW1hbmQodGhpcy50eXBlVG9vbHRpcC5iaW5kKHRoaXMpKSxcbiAgICAnaGFza2VsbC1naGMtbW9kOnNob3ctaW5mbyc6IHRoaXMudG9vbHRpcENvbW1hbmQodGhpcy5pbmZvVG9vbHRpcC5iaW5kKHRoaXMpKSxcbiAgICAnaGFza2VsbC1naGMtbW9kOmNhc2Utc3BsaXQnOiB0aGlzLmNhc2VTcGxpdENvbW1hbmQuYmluZCh0aGlzKSxcbiAgICAnaGFza2VsbC1naGMtbW9kOnNpZy1maWxsJzogdGhpcy5zaWdGaWxsQ29tbWFuZC5iaW5kKHRoaXMpLFxuICAgICdoYXNrZWxsLWdoYy1tb2Q6Z28tdG8tZGVjbGFyYXRpb24nOiB0aGlzLmdvVG9EZWNsQ29tbWFuZC5iaW5kKHRoaXMpLFxuICAgICdoYXNrZWxsLWdoYy1tb2Q6c2hvdy1pbmZvLWZhbGxiYWNrLXRvLXR5cGUnOiB0aGlzLnRvb2x0aXBDb21tYW5kKHRoaXMuaW5mb1R5cGVUb29sdGlwLmJpbmQodGhpcykpLFxuICAgICdoYXNrZWxsLWdoYy1tb2Q6c2hvdy10eXBlLWZhbGxiYWNrLXRvLWluZm8nOiB0aGlzLnRvb2x0aXBDb21tYW5kKHRoaXMudHlwZUluZm9Ub29sdGlwLmJpbmQodGhpcykpLFxuICAgICdoYXNrZWxsLWdoYy1tb2Q6c2hvdy10eXBlLWFuZC1pbmZvJzogdGhpcy50b29sdGlwQ29tbWFuZCh0aGlzLnR5cGVBbmRJbmZvVG9vbHRpcC5iaW5kKHRoaXMpKSxcbiAgICAnaGFza2VsbC1naGMtbW9kOmluc2VydC10eXBlJzogdGhpcy5pbnNlcnRUeXBlQ29tbWFuZC5iaW5kKHRoaXMpLFxuICAgICdoYXNrZWxsLWdoYy1tb2Q6aW5zZXJ0LWltcG9ydCc6IHRoaXMuaW5zZXJ0SW1wb3J0Q29tbWFuZC5iaW5kKHRoaXMpLFxuICB9XG5cbiAgcHJpdmF0ZSBnbG9iYWxDb21tYW5kcyA9IHtcbiAgICAnaGFza2VsbC1naGMtbW9kOmNoZWNrLWZpbGUnOiB0aGlzLmNoZWNrQ29tbWFuZC5iaW5kKHRoaXMpLFxuICAgICdoYXNrZWxsLWdoYy1tb2Q6bGludC1maWxlJzogdGhpcy5saW50Q29tbWFuZC5iaW5kKHRoaXMpLFxuICAgIC4uLnRoaXMuY29udGV4dENvbW1hbmRzLFxuICB9XG5cbiAgcHJpdmF0ZSBjb250ZXh0TWVudToge1xuICAgIGxhYmVsOiBzdHJpbmcsIHN1Ym1lbnU6IEFycmF5PHsgbGFiZWw6IHN0cmluZywgY29tbWFuZDoga2V5b2YgVVBJQ29uc3VtZXJbJ2NvbnRleHRDb21tYW5kcyddIH0+XG4gIH0gPSB7XG4gICAgbGFiZWw6ICdnaGMtbW9kJyxcbiAgICBzdWJtZW51OlxuICAgIFtcbiAgICAgIHsgbGFiZWw6ICdTaG93IFR5cGUnLCBjb21tYW5kOiAnaGFza2VsbC1naGMtbW9kOnNob3ctdHlwZScgfSxcbiAgICAgIHsgbGFiZWw6ICdTaG93IEluZm8nLCBjb21tYW5kOiAnaGFza2VsbC1naGMtbW9kOnNob3ctaW5mbycgfSxcbiAgICAgIHsgbGFiZWw6ICdTaG93IFR5cGUgQW5kIEluZm8nLCBjb21tYW5kOiAnaGFza2VsbC1naGMtbW9kOnNob3ctdHlwZS1hbmQtaW5mbycgfSxcbiAgICAgIHsgbGFiZWw6ICdDYXNlIFNwbGl0JywgY29tbWFuZDogJ2hhc2tlbGwtZ2hjLW1vZDpjYXNlLXNwbGl0JyB9LFxuICAgICAgeyBsYWJlbDogJ1NpZyBGaWxsJywgY29tbWFuZDogJ2hhc2tlbGwtZ2hjLW1vZDpzaWctZmlsbCcgfSxcbiAgICAgIHsgbGFiZWw6ICdJbnNlcnQgVHlwZScsIGNvbW1hbmQ6ICdoYXNrZWxsLWdoYy1tb2Q6aW5zZXJ0LXR5cGUnIH0sXG4gICAgICB7IGxhYmVsOiAnSW5zZXJ0IEltcG9ydCcsIGNvbW1hbmQ6ICdoYXNrZWxsLWdoYy1tb2Q6aW5zZXJ0LWltcG9ydCcgfSxcbiAgICAgIHsgbGFiZWw6ICdHbyBUbyBEZWNsYXJhdGlvbicsIGNvbW1hbmQ6ICdoYXNrZWxsLWdoYy1tb2Q6Z28tdG8tZGVjbGFyYXRpb24nIH0sXG4gICAgXSxcbiAgfVxuXG4gIGNvbnN0cnVjdG9yKHJlZ2lzdGVyOiBVUEkuSVVQSVJlZ2lzdHJhdGlvbiwgcHJpdmF0ZSBwcm9jZXNzOiBHaGNNb2RpUHJvY2Vzcykge1xuICAgIHRoaXMuZGlzcG9zYWJsZXMuYWRkKFxuICAgICAgdGhpcy5wcm9jZXNzLm9uRXJyb3IodGhpcy5oYW5kbGVQcm9jZXNzRXJyb3IuYmluZCh0aGlzKSksXG4gICAgICB0aGlzLnByb2Nlc3Mub25XYXJuaW5nKHRoaXMuaGFuZGxlUHJvY2Vzc1dhcm5pbmcuYmluZCh0aGlzKSksXG4gICAgKVxuXG4gICAgY29uc3QgbXNnVHlwZXMgPVxuICAgICAgdGhpcy5tc2dCYWNrZW5kID09PSAndXBpJ1xuICAgICAgICA/IHsgLi4ubWVzc2FnZVR5cGVzLCAuLi5hZGRNc2dUeXBlcyB9XG4gICAgICAgIDogbWVzc2FnZVR5cGVzXG5cbiAgICB0aGlzLnVwaSA9IHJlZ2lzdGVyKHtcbiAgICAgIG5hbWU6ICdoYXNrZWxsLWdoYy1tb2QnLFxuICAgICAgbWVudTogbWFpbk1lbnUsXG4gICAgICBtZXNzYWdlVHlwZXM6IG1zZ1R5cGVzLFxuICAgICAgdG9vbHRpcDogdGhpcy5zaG91bGRTaG93VG9vbHRpcC5iaW5kKHRoaXMpLFxuICAgICAgZXZlbnRzOiB7XG4gICAgICAgIG9uRGlkU2F2ZUJ1ZmZlcjogYXN5bmMgKGJ1ZmZlcikgPT5cbiAgICAgICAgICB0aGlzLmNoZWNrTGludChidWZmZXIsICdTYXZlJywgYXRvbS5jb25maWcuZ2V0KCdoYXNrZWxsLWdoYy1tb2QuYWx3YXlzSW50ZXJhY3RpdmVDaGVjaycpKSxcbiAgICAgICAgb25EaWRTdG9wQ2hhbmdpbmc6IGFzeW5jIChidWZmZXIpID0+XG4gICAgICAgICAgdGhpcy5jaGVja0xpbnQoYnVmZmVyLCAnQ2hhbmdlJywgdHJ1ZSksXG4gICAgICB9LFxuICAgIH0pXG5cbiAgICB0aGlzLmRpc3Bvc2FibGVzLmFkZChcbiAgICAgIHRoaXMudXBpLFxuICAgICAgdGhpcy5wcm9jZXNzLm9uQmFja2VuZEFjdGl2ZSgoKSA9PiB0aGlzLnVwaS5zZXRTdGF0dXMoeyBzdGF0dXM6ICdwcm9ncmVzcycsIGRldGFpbDogJycgfSkpLFxuICAgICAgdGhpcy5wcm9jZXNzLm9uQmFja2VuZElkbGUoKCkgPT4gdGhpcy51cGkuc2V0U3RhdHVzKHsgc3RhdHVzOiAncmVhZHknLCBkZXRhaWw6ICcnIH0pKSxcbiAgICAgIGF0b20uY29tbWFuZHMuYWRkKGNvbnRleHRTY29wZSwgdGhpcy5nbG9iYWxDb21tYW5kcyksXG4gICAgKVxuICAgIGNvbnN0IGNtID0ge31cbiAgICBjbVtjb250ZXh0U2NvcGVdID0gW3RoaXMuY29udGV4dE1lbnVdXG4gICAgdGhpcy5kaXNwb3NhYmxlcy5hZGQoYXRvbS5jb250ZXh0TWVudS5hZGQoY20pKVxuICB9XG5cbiAgcHVibGljIGRpc3Bvc2UoKSB7XG4gICAgdGhpcy5kaXNwb3NhYmxlcy5kaXNwb3NlKClcbiAgfVxuXG4gIHByaXZhdGUgYXN5bmMgc2hvdWxkU2hvd1Rvb2x0aXAoXG4gICAgZWRpdG9yOiBUZXh0RWRpdG9yLCBjcmFuZ2U6IFJhbmdlLCB0eXBlOiBVUEkuVEV2ZW50UmFuZ2VUeXBlLFxuICApOiBQcm9taXNlPFVQSS5JVG9vbHRpcERhdGEgfCB1bmRlZmluZWQ+IHtcbiAgICBjb25zdCBuID0gdHlwZSA9PT0gJ21vdXNlJyA/ICdoYXNrZWxsLWdoYy1tb2Qub25Nb3VzZUhvdmVyU2hvdydcbiAgICAgICAgICAgIDogdHlwZSA9PT0gJ3NlbGVjdGlvbicgPyAnaGFza2VsbC1naGMtbW9kLm9uU2VsZWN0aW9uU2hvdydcbiAgICAgICAgICAgIDogdW5kZWZpbmVkXG4gICAgY29uc3QgdCA9IG4gJiYgYXRvbS5jb25maWcuZ2V0KG4pXG4gICAgLy8gdHNsaW50OmRpc2FibGUtbmV4dC1saW5lOm5vLXVuc2FmZS1hbnlcbiAgICBpZiAodCkgcmV0dXJuIHRoaXNbYCR7dH1Ub29sdGlwYF0oZWRpdG9yLCBjcmFuZ2UpXG4gICAgZWxzZSByZXR1cm4gdW5kZWZpbmVkXG4gIH1cblxuICBAaGFuZGxlRXhjZXB0aW9uXG4gIHByaXZhdGUgYXN5bmMgY2hlY2tDb21tYW5kKHsgY3VycmVudFRhcmdldCB9OiBURUNvbW1hbmRFdmVudCkge1xuICAgIGNvbnN0IGVkaXRvciA9IGN1cnJlbnRUYXJnZXQuZ2V0TW9kZWwoKVxuICAgIGNvbnN0IHJlcyA9IGF3YWl0IHRoaXMucHJvY2Vzcy5kb0NoZWNrQnVmZmVyKGVkaXRvci5nZXRCdWZmZXIoKSwgYXRvbS5jb25maWcuZ2V0KCdoYXNrZWxsLWdoYy1tb2QuYWx3YXlzSW50ZXJhY3RpdmVDaGVjaycpKVxuICAgIHRoaXMuc2V0TWVzc2FnZXMocmVzKVxuICB9XG5cbiAgQGhhbmRsZUV4Y2VwdGlvblxuICBwcml2YXRlIGFzeW5jIGxpbnRDb21tYW5kKHsgY3VycmVudFRhcmdldCB9OiBURUNvbW1hbmRFdmVudCkge1xuICAgIGNvbnN0IGVkaXRvciA9IGN1cnJlbnRUYXJnZXQuZ2V0TW9kZWwoKVxuICAgIGNvbnN0IHJlcyA9IGF3YWl0IHRoaXMucHJvY2Vzcy5kb0xpbnRCdWZmZXIoZWRpdG9yLmdldEJ1ZmZlcigpKVxuICAgIHRoaXMuc2V0TWVzc2FnZXMocmVzKVxuICB9XG5cbiAgcHJpdmF0ZSB0b29sdGlwQ29tbWFuZCh0b29sdGlwZnVuOiAoZTogVGV4dEVkaXRvciwgcDogUmFuZ2UpID0+IFByb21pc2U8VVBJLklUb29sdGlwRGF0YT4pIHtcbiAgICByZXR1cm4gYXN5bmMgKHsgY3VycmVudFRhcmdldCwgZGV0YWlsIH06IFRFQ29tbWFuZEV2ZW50KSA9PlxuICAgICAgdGhpcy51cGkuc2hvd1Rvb2x0aXAoe1xuICAgICAgICBlZGl0b3I6IGN1cnJlbnRUYXJnZXQuZ2V0TW9kZWwoKSxcbiAgICAgICAgZGV0YWlsLFxuICAgICAgICBhc3luYyB0b29sdGlwKGNyYW5nZSkge1xuICAgICAgICAgIHJldHVybiB0b29sdGlwZnVuKGN1cnJlbnRUYXJnZXQuZ2V0TW9kZWwoKSwgY3JhbmdlKVxuICAgICAgICB9LFxuICAgICAgfSlcbiAgfVxuXG4gIEBoYW5kbGVFeGNlcHRpb25cbiAgcHJpdmF0ZSBhc3luYyBpbnNlcnRUeXBlQ29tbWFuZCh7IGN1cnJlbnRUYXJnZXQsIGRldGFpbCB9OiBURUNvbW1hbmRFdmVudCkge1xuICAgIGNvbnN0IGVkaXRvciA9IGN1cnJlbnRUYXJnZXQuZ2V0TW9kZWwoKVxuICAgIGNvbnN0IGVyID0gdGhpcy51cGkuZ2V0RXZlbnRSYW5nZShlZGl0b3IsIGRldGFpbClcbiAgICBpZiAoZXIgPT09IHVuZGVmaW5lZCkgeyByZXR1cm4gfVxuICAgIGNvbnN0IHsgY3JhbmdlLCBwb3MgfSA9IGVyXG4gICAgY29uc3Qgc3ltSW5mbyA9IFV0aWwuZ2V0U3ltYm9sQXRQb2ludChlZGl0b3IsIHBvcylcbiAgICBpZiAoIXN5bUluZm8pIHsgcmV0dXJuIH1cbiAgICBjb25zdCB7IHNjb3BlLCByYW5nZSwgc3ltYm9sIH0gPSBzeW1JbmZvXG4gICAgaWYgKHNjb3BlLnN0YXJ0c1dpdGgoJ2tleXdvcmQub3BlcmF0b3IuJykpIHsgcmV0dXJuIH0gLy8gY2FuJ3QgY29ycmVjdGx5IGhhbmRsZSBpbmZpeCBub3RhdGlvblxuICAgIGNvbnN0IHsgdHlwZSB9ID0gYXdhaXQgdGhpcy5wcm9jZXNzLmdldFR5cGVJbkJ1ZmZlcihlZGl0b3IuZ2V0QnVmZmVyKCksIGNyYW5nZSlcbiAgICBpZiAoZWRpdG9yLmdldFRleHRJbkJ1ZmZlclJhbmdlKFtyYW5nZS5lbmQsIGVkaXRvci5nZXRCdWZmZXIoKS5yYW5nZUZvclJvdyhyYW5nZS5lbmQucm93LCBmYWxzZSkuZW5kXSkubWF0Y2goLz0vKSkge1xuICAgICAgbGV0IGluZGVudCA9IGVkaXRvci5nZXRUZXh0SW5CdWZmZXJSYW5nZShbW3JhbmdlLnN0YXJ0LnJvdywgMF0sIHJhbmdlLnN0YXJ0XSlcbiAgICAgIGxldCBiaXJkVHJhY2sgPSAnJ1xuICAgICAgaWYgKGVkaXRvci5zY29wZURlc2NyaXB0b3JGb3JCdWZmZXJQb3NpdGlvbihwb3MpLmdldFNjb3Blc0FycmF5KCkuaW5jbHVkZXMoJ21ldGEuZW1iZWRkZWQuaGFza2VsbCcpKSB7XG4gICAgICAgIGJpcmRUcmFjayA9IGluZGVudC5zbGljZSgwLCAyKVxuICAgICAgICBpbmRlbnQgPSBpbmRlbnQuc2xpY2UoMilcbiAgICAgIH1cbiAgICAgIGlmIChpbmRlbnQubWF0Y2goL1xcUy8pKSB7XG4gICAgICAgIGluZGVudCA9IGluZGVudC5yZXBsYWNlKC9cXFMvZywgJyAnKVxuICAgICAgfVxuICAgICAgZWRpdG9yLnNldFRleHRJbkJ1ZmZlclJhbmdlKFxuICAgICAgICBbcmFuZ2Uuc3RhcnQsIHJhbmdlLnN0YXJ0XSwgYCR7c3ltYm9sfSA6OiAke3R5cGV9XFxuJHtiaXJkVHJhY2t9JHtpbmRlbnR9YCxcbiAgICAgIClcbiAgICB9IGVsc2Uge1xuICAgICAgZWRpdG9yLnNldFRleHRJbkJ1ZmZlclJhbmdlKHJhbmdlLCBgKCR7ZWRpdG9yLmdldFRleHRJbkJ1ZmZlclJhbmdlKHJhbmdlKX0gOjogJHt0eXBlfSlgKVxuICAgIH1cbiAgfVxuXG4gIEBoYW5kbGVFeGNlcHRpb25cbiAgcHJpdmF0ZSBhc3luYyBjYXNlU3BsaXRDb21tYW5kKHsgY3VycmVudFRhcmdldCwgZGV0YWlsIH06IFRFQ29tbWFuZEV2ZW50KSB7XG4gICAgY29uc3QgZWRpdG9yID0gY3VycmVudFRhcmdldC5nZXRNb2RlbCgpXG4gICAgY29uc3QgZXZyID0gdGhpcy51cGkuZ2V0RXZlbnRSYW5nZShlZGl0b3IsIGRldGFpbClcbiAgICBpZiAoIWV2cikgeyByZXR1cm4gfVxuICAgIGNvbnN0IHsgY3JhbmdlIH0gPSBldnJcbiAgICBjb25zdCByZXMgPSBhd2FpdCB0aGlzLnByb2Nlc3MuZG9DYXNlU3BsaXQoZWRpdG9yLmdldEJ1ZmZlcigpLCBjcmFuZ2UpXG4gICAgZm9yIChjb25zdCB7IHJhbmdlLCByZXBsYWNlbWVudCB9IG9mIHJlcykge1xuICAgICAgZWRpdG9yLnNldFRleHRJbkJ1ZmZlclJhbmdlKHJhbmdlLCByZXBsYWNlbWVudClcbiAgICB9XG4gIH1cblxuICBAaGFuZGxlRXhjZXB0aW9uXG4gIHByaXZhdGUgYXN5bmMgc2lnRmlsbENvbW1hbmQoeyBjdXJyZW50VGFyZ2V0LCBkZXRhaWwgfTogVEVDb21tYW5kRXZlbnQpIHtcbiAgICBjb25zdCBlZGl0b3IgPSBjdXJyZW50VGFyZ2V0LmdldE1vZGVsKClcbiAgICBjb25zdCBldnIgPSB0aGlzLnVwaS5nZXRFdmVudFJhbmdlKGVkaXRvciwgZGV0YWlsKVxuICAgIGlmICghZXZyKSB7IHJldHVybiB9XG4gICAgY29uc3QgeyBjcmFuZ2UgfSA9IGV2clxuICAgIGNvbnN0IHJlcyA9IGF3YWl0IHRoaXMucHJvY2Vzcy5kb1NpZ0ZpbGwoZWRpdG9yLmdldEJ1ZmZlcigpLCBjcmFuZ2UpXG5cbiAgICBlZGl0b3IudHJhbnNhY3QoKCkgPT4ge1xuICAgICAgY29uc3QgeyB0eXBlLCByYW5nZSwgYm9keSB9ID0gcmVzXG4gICAgICBjb25zdCBzaWcgPSBlZGl0b3IuZ2V0VGV4dEluQnVmZmVyUmFuZ2UocmFuZ2UpXG4gICAgICBsZXQgaW5kZW50ID0gZWRpdG9yLmluZGVudExldmVsRm9yTGluZShzaWcpXG4gICAgICBjb25zdCBwb3MgPSByYW5nZS5lbmRcbiAgICAgIGNvbnN0IHRleHQgPSBgXFxuJHtib2R5fWBcbiAgICAgIGlmICh0eXBlID09PSAnaW5zdGFuY2UnKSB7XG4gICAgICAgIGluZGVudCArPSAxXG4gICAgICAgIGlmICghc2lnLmVuZHNXaXRoKCcgd2hlcmUnKSkge1xuICAgICAgICAgIGVkaXRvci5zZXRUZXh0SW5CdWZmZXJSYW5nZShbcmFuZ2UuZW5kLCByYW5nZS5lbmRdLCAnIHdoZXJlJylcbiAgICAgICAgfVxuICAgICAgfVxuICAgICAgY29uc3QgbmV3cmFuZ2UgPSBlZGl0b3Iuc2V0VGV4dEluQnVmZmVyUmFuZ2UoW3BvcywgcG9zXSwgdGV4dClcbiAgICAgIG5ld3JhbmdlLmdldFJvd3MoKS5zbGljZSgxKS5tYXAoKHJvdykgPT5cbiAgICAgICAgZWRpdG9yLnNldEluZGVudGF0aW9uRm9yQnVmZmVyUm93KHJvdywgaW5kZW50KSlcbiAgICB9KVxuICB9XG5cbiAgQGhhbmRsZUV4Y2VwdGlvblxuICBwcml2YXRlIGFzeW5jIGdvVG9EZWNsQ29tbWFuZCh7IGN1cnJlbnRUYXJnZXQsIGRldGFpbCB9OiBURUNvbW1hbmRFdmVudCkge1xuICAgIGNvbnN0IGVkaXRvciA9IGN1cnJlbnRUYXJnZXQuZ2V0TW9kZWwoKVxuICAgIGNvbnN0IGV2ciA9IHRoaXMudXBpLmdldEV2ZW50UmFuZ2UoZWRpdG9yLCBkZXRhaWwpXG4gICAgaWYgKCFldnIpIHsgcmV0dXJuIH1cbiAgICBjb25zdCB7IGNyYW5nZSB9ID0gZXZyXG4gICAgY29uc3QgeyBpbmZvIH0gPSBhd2FpdCB0aGlzLnByb2Nlc3MuZ2V0SW5mb0luQnVmZmVyKGVkaXRvciwgY3JhbmdlKVxuICAgIGNvbnN0IHJlcyA9IC8uKi0tIERlZmluZWQgYXQgKC4rKTooXFxkKyk6KFxcZCspLy5leGVjKGluZm8pXG4gICAgaWYgKCFyZXMpIHsgcmV0dXJuIH1cbiAgICBjb25zdCBbZm4sIGxpbmUsIGNvbF0gPSByZXMuc2xpY2UoMSlcbiAgICBjb25zdCByb290RGlyID0gYXdhaXQgdGhpcy5wcm9jZXNzLmdldFJvb3REaXIoZWRpdG9yLmdldEJ1ZmZlcigpKVxuICAgIGlmICghcm9vdERpcikgeyByZXR1cm4gfVxuICAgIGNvbnN0IHVyaSA9IHJvb3REaXIuZ2V0RmlsZShmbikuZ2V0UGF0aCgpIHx8IGZuXG4gICAgYXdhaXQgYXRvbS53b3Jrc3BhY2Uub3Blbih1cmksIHtcbiAgICAgIGluaXRpYWxMaW5lOiBwYXJzZUludChsaW5lLCAxMCkgLSAxLFxuICAgICAgaW5pdGlhbENvbHVtbjogcGFyc2VJbnQoY29sLCAxMCkgLSAxLFxuICAgIH0pXG4gIH1cblxuICBAaGFuZGxlRXhjZXB0aW9uXG4gIHByaXZhdGUgYXN5bmMgaW5zZXJ0SW1wb3J0Q29tbWFuZCh7IGN1cnJlbnRUYXJnZXQsIGRldGFpbCB9OiBURUNvbW1hbmRFdmVudCkge1xuICAgIGNvbnN0IGVkaXRvciA9IGN1cnJlbnRUYXJnZXQuZ2V0TW9kZWwoKVxuICAgIGNvbnN0IGJ1ZmZlciA9IGVkaXRvci5nZXRCdWZmZXIoKVxuICAgIGNvbnN0IGV2ciA9IHRoaXMudXBpLmdldEV2ZW50UmFuZ2UoZWRpdG9yLCBkZXRhaWwpXG4gICAgaWYgKCFldnIpIHsgcmV0dXJuIH1cbiAgICBjb25zdCB7IGNyYW5nZSB9ID0gZXZyXG4gICAgY29uc3QgbGluZXMgPSBhd2FpdCB0aGlzLnByb2Nlc3MuZmluZFN5bWJvbFByb3ZpZGVyc0luQnVmZmVyKGVkaXRvciwgY3JhbmdlKVxuICAgIGNvbnN0IG1vZCA9IGF3YWl0IGltcG9ydExpc3RWaWV3KGxpbmVzKVxuICAgIGlmIChtb2QpIHtcbiAgICAgIGNvbnN0IHBpID0gYXdhaXQgbmV3IFByb21pc2U8eyBwb3M6IFBvaW50LCBpbmRlbnQ6IHN0cmluZywgZW5kOiBzdHJpbmcgfT4oKHJlc29sdmUpID0+IHtcbiAgICAgICAgYnVmZmVyLmJhY2t3YXJkc1NjYW4oL14oXFxzKikoaW1wb3J0fG1vZHVsZSkvLCAoeyBtYXRjaCwgcmFuZ2UgfSkgPT4ge1xuICAgICAgICAgIGxldCBpbmRlbnQgPSAnJ1xuICAgICAgICAgIHN3aXRjaCAobWF0Y2hbMl0pIHtcbiAgICAgICAgICAgIGNhc2UgJ2ltcG9ydCc6XG4gICAgICAgICAgICAgIGluZGVudCA9IGBcXG4ke21hdGNoWzFdfWBcbiAgICAgICAgICAgICAgYnJlYWtcbiAgICAgICAgICAgIGNhc2UgJ21vZHVsZSc6XG4gICAgICAgICAgICAgIGluZGVudCA9IGBcXG5cXG4ke21hdGNoWzFdfWBcbiAgICAgICAgICAgICAgYnJlYWtcbiAgICAgICAgICB9XG4gICAgICAgICAgcmVzb2x2ZSh7IHBvczogYnVmZmVyLnJhbmdlRm9yUm93KHJhbmdlLnN0YXJ0LnJvdywgZmFsc2UpLmVuZCwgaW5kZW50LCBlbmQ6ICcnIH0pXG4gICAgICAgIH0pXG4gICAgICAgIC8vIG5vdGhpbmcgZm91bmRcbiAgICAgICAgcmVzb2x2ZSh7XG4gICAgICAgICAgcG9zOiBidWZmZXIuZ2V0Rmlyc3RQb3NpdGlvbigpLFxuICAgICAgICAgIGluZGVudDogJycsXG4gICAgICAgICAgZW5kOiAnXFxuJyxcbiAgICAgICAgfSlcbiAgICAgIH0pXG4gICAgICBlZGl0b3Iuc2V0VGV4dEluQnVmZmVyUmFuZ2UoW3BpLnBvcywgcGkucG9zXSwgYCR7cGkuaW5kZW50fWltcG9ydCAke21vZH0ke3BpLmVuZH1gKVxuICAgIH1cbiAgfVxuXG4gIHByaXZhdGUgYXN5bmMgdHlwZVRvb2x0aXAoZTogVGV4dEVkaXRvciwgcDogUmFuZ2UpIHtcbiAgICBjb25zdCB7IHJhbmdlLCB0eXBlIH0gPSBhd2FpdCB0aGlzLnByb2Nlc3MuZ2V0VHlwZUluQnVmZmVyKGUuZ2V0QnVmZmVyKCksIHApXG4gICAgcmV0dXJuIHtcbiAgICAgIHJhbmdlLFxuICAgICAgdGV4dDoge1xuICAgICAgICB0ZXh0OiB0eXBlLFxuICAgICAgICBoaWdobGlnaHRlcjpcbiAgICAgICAgYXRvbS5jb25maWcuZ2V0KCdoYXNrZWxsLWdoYy1tb2QuaGlnaGxpZ2h0VG9vbHRpcHMnKSA/XG4gICAgICAgICAgJ2hpbnQudHlwZS5oYXNrZWxsJyA6IHVuZGVmaW5lZCxcbiAgICAgIH0sXG4gICAgfVxuICB9XG5cbiAgcHJpdmF0ZSBhc3luYyBpbmZvVG9vbHRpcChlOiBUZXh0RWRpdG9yLCBwOiBSYW5nZSkge1xuICAgIGNvbnN0IHsgcmFuZ2UsIGluZm8gfSA9IGF3YWl0IHRoaXMucHJvY2Vzcy5nZXRJbmZvSW5CdWZmZXIoZSwgcClcbiAgICByZXR1cm4ge1xuICAgICAgcmFuZ2UsXG4gICAgICB0ZXh0OiB7XG4gICAgICAgIHRleHQ6IGluZm8sXG4gICAgICAgIGhpZ2hsaWdodGVyOlxuICAgICAgICBhdG9tLmNvbmZpZy5nZXQoJ2hhc2tlbGwtZ2hjLW1vZC5oaWdobGlnaHRUb29sdGlwcycpID9cbiAgICAgICAgICAnc291cmNlLmhhc2tlbGwnIDogdW5kZWZpbmVkLFxuICAgICAgfSxcbiAgICB9XG4gIH1cblxuICBwcml2YXRlIGFzeW5jIGluZm9UeXBlVG9vbHRpcChlOiBUZXh0RWRpdG9yLCBwOiBSYW5nZSkge1xuICAgIHRyeSB7XG4gICAgICByZXR1cm4gYXdhaXQgdGhpcy5pbmZvVG9vbHRpcChlLCBwKVxuICAgIH0gY2F0Y2gge1xuICAgICAgcmV0dXJuIHRoaXMudHlwZVRvb2x0aXAoZSwgcClcbiAgICB9XG4gIH1cblxuICBwcml2YXRlIGFzeW5jIHR5cGVJbmZvVG9vbHRpcChlOiBUZXh0RWRpdG9yLCBwOiBSYW5nZSkge1xuICAgIHRyeSB7XG4gICAgICByZXR1cm4gYXdhaXQgdGhpcy50eXBlVG9vbHRpcChlLCBwKVxuICAgIH0gY2F0Y2gge1xuICAgICAgcmV0dXJuIHRoaXMuaW5mb1Rvb2x0aXAoZSwgcClcbiAgICB9XG4gIH1cblxuICBwcml2YXRlIGFzeW5jIHR5cGVBbmRJbmZvVG9vbHRpcChlOiBUZXh0RWRpdG9yLCBwOiBSYW5nZSkge1xuICAgIGNvbnN0IHR5cGVQID0gdGhpcy50eXBlVG9vbHRpcChlLCBwKS5jYXRjaCgoKSA9PiB1bmRlZmluZWQpXG4gICAgY29uc3QgaW5mb1AgPSB0aGlzLmluZm9Ub29sdGlwKGUsIHApLmNhdGNoKCgpID0+IHVuZGVmaW5lZClcbiAgICBjb25zdCBbdHlwZSwgaW5mb10gPSBhd2FpdCBQcm9taXNlLmFsbChbdHlwZVAsIGluZm9QXSlcbiAgICBsZXQgcmFuZ2U6IFJhbmdlXG4gICAgbGV0IHRleHQ6IHN0cmluZ1xuICAgIGlmICh0eXBlICYmIGluZm8pIHtcbiAgICAgIHJhbmdlID0gdHlwZS5yYW5nZS51bmlvbihpbmZvLnJhbmdlKVxuICAgICAgdGV4dCA9IGA6OiAke3R5cGUudGV4dC50ZXh0fVxcbiR7aW5mby50ZXh0LnRleHR9YFxuICAgIH0gZWxzZSBpZiAodHlwZSkge1xuICAgICAgcmFuZ2UgPSB0eXBlLnJhbmdlXG4gICAgICB0ZXh0ID0gYDo6ICR7dHlwZS50ZXh0LnRleHR9YFxuICAgIH0gZWxzZSBpZiAoaW5mbykge1xuICAgICAgcmFuZ2UgPSBpbmZvLnJhbmdlXG4gICAgICB0ZXh0ID0gaW5mby50ZXh0LnRleHRcbiAgICB9IGVsc2Uge1xuICAgICAgdGhyb3cgbmV3IEVycm9yKCdHb3QgbmVpdGhlciB0eXBlIG5vciBpbmZvJylcbiAgICB9XG4gICAgY29uc3QgaGlnaGxpZ2h0ZXIgPSBhdG9tLmNvbmZpZy5nZXQoJ2hhc2tlbGwtZ2hjLW1vZC5oaWdobGlnaHRUb29sdGlwcycpID8gJ3NvdXJjZS5oYXNrZWxsJyA6IHVuZGVmaW5lZFxuICAgIHJldHVybiB7IHJhbmdlLCB0ZXh0OiB7IHRleHQsIGhpZ2hsaWdodGVyIH0gfVxuICB9XG5cbiAgcHJpdmF0ZSBzZXRIaWdobGlnaHRlcigpIHtcbiAgICBpZiAoYXRvbS5jb25maWcuZ2V0KCdoYXNrZWxsLWdoYy1tb2QuaGlnaGxpZ2h0TWVzc2FnZXMnKSkge1xuICAgICAgcmV0dXJuIChtOiBVUEkuSVJlc3VsdEl0ZW0pOiBVUEkuSVJlc3VsdEl0ZW0gPT4ge1xuICAgICAgICBpZiAodHlwZW9mIG0ubWVzc2FnZSA9PT0gJ3N0cmluZycpIHtcbiAgICAgICAgICBjb25zdCBtZXNzYWdlOiBVUEkuSU1lc3NhZ2VUZXh0ID0ge1xuICAgICAgICAgICAgdGV4dDogbS5tZXNzYWdlLFxuICAgICAgICAgICAgaGlnaGxpZ2h0ZXI6ICdoaW50Lm1lc3NhZ2UuaGFza2VsbCcsXG4gICAgICAgICAgfVxuICAgICAgICAgIHJldHVybiB7IC4uLm0sIG1lc3NhZ2UgfVxuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIHJldHVybiBtXG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9IGVsc2Uge1xuICAgICAgcmV0dXJuIChtOiBVUEkuSVJlc3VsdEl0ZW0pID0+IG1cbiAgICB9XG4gIH1cblxuICBwcml2YXRlIHNldE1lc3NhZ2VzKG1lc3NhZ2VzOiBVUEkuSVJlc3VsdEl0ZW1bXSkge1xuICAgIHRoaXMubGFzdE1lc3NhZ2VzID0gbWVzc2FnZXMubWFwKHRoaXMuc2V0SGlnaGxpZ2h0ZXIoKSlcbiAgICB0aGlzLnNlbmRNZXNzYWdlcygpXG4gIH1cblxuICBwcml2YXRlIHNlbmRNZXNzYWdlcygpIHtcbiAgICB0aGlzLnVwaS5zZXRNZXNzYWdlcyh0aGlzLnByb2Nlc3NNZXNzYWdlcy5jb25jYXQodGhpcy5sYXN0TWVzc2FnZXMpKVxuICB9XG5cbiAgcHJpdmF0ZSBhc3luYyBjaGVja0xpbnQoYnVmZmVyOiBUZXh0QnVmZmVyLCBvcHQ6ICdTYXZlJyB8ICdDaGFuZ2UnLCBmYXN0OiBib29sZWFuKSB7XG4gICAgY29uc3QgY2hlY2sgPSBhdG9tLmNvbmZpZy5nZXQoXG4gICAgICBgaGFza2VsbC1naGMtbW9kLm9uJHtvcHR9Q2hlY2tgIGFzICdoYXNrZWxsLWdoYy1tb2Qub25TYXZlQ2hlY2snIHwgJ2hhc2tlbGwtZ2hjLW1vZC5vbkNoYW5nZUNoZWNrJyxcbiAgICApXG4gICAgY29uc3QgbGludCA9IGF0b20uY29uZmlnLmdldChcbiAgICAgIGBoYXNrZWxsLWdoYy1tb2Qub24ke29wdH1MaW50YCBhcyAnaGFza2VsbC1naGMtbW9kLm9uU2F2ZUxpbnQnIHwgJ2hhc2tlbGwtZ2hjLW1vZC5vbkNoYW5nZUxpbnQnLFxuICAgIClcbiAgICBsZXQgcmVzXG4gICAgaWYgKGNoZWNrICYmIGxpbnQpIHtcbiAgICAgIHJlcyA9IGF3YWl0IHRoaXMucHJvY2Vzcy5kb0NoZWNrQW5kTGludChidWZmZXIsIGZhc3QpXG4gICAgfSBlbHNlIGlmIChjaGVjaykge1xuICAgICAgcmVzID0gYXdhaXQgdGhpcy5wcm9jZXNzLmRvQ2hlY2tCdWZmZXIoYnVmZmVyLCBmYXN0KVxuICAgIH0gZWxzZSBpZiAobGludCkge1xuICAgICAgcmVzID0gYXdhaXQgdGhpcy5wcm9jZXNzLmRvTGludEJ1ZmZlcihidWZmZXIpXG4gICAgfVxuICAgIGlmIChyZXMpIHtcbiAgICAgIHRoaXMuc2V0TWVzc2FnZXMocmVzKVxuICAgIH1cbiAgfVxuXG4gIHByaXZhdGUgY29uc29sZVJlcG9ydChhcmc6IElFcnJvckNhbGxiYWNrQXJncykge1xuICAgIC8vIHRzbGludDpkaXNiYWxlLW5leHQtbGluZTogbm8tY29uc29sZVxuICAgIGNvbnNvbGUuZXJyb3IoVXRpbC5mb3JtYXRFcnJvcihhcmcpLCBVdGlsLmdldEVycm9yRGV0YWlsKGFyZykpXG4gIH1cblxuICBwcml2YXRlIGhhbmRsZVByb2Nlc3NFcnJvcihhcmc6IElFcnJvckNhbGxiYWNrQXJncykge1xuICAgIHN3aXRjaCAodGhpcy5tc2dCYWNrZW5kKSB7XG4gICAgICBjYXNlICd1cGknOlxuICAgICAgICB0aGlzLnByb2Nlc3NNZXNzYWdlcy5wdXNoKHtcbiAgICAgICAgICBtZXNzYWdlOiBVdGlsLmZvcm1hdEVycm9yKGFyZylcbiAgICAgICAgICArICdcXG5cXG5TZWUgY29uc29sZSAoVmlldyDihpIgRGV2ZWxvcGVyIOKGkiBUb2dnbGUgRGV2ZWxvcGVyIFRvb2xzIOKGkiBDb25zb2xlIHRhYikgZm9yIGRldGFpbHMuJyxcbiAgICAgICAgICBzZXZlcml0eTogJ2doYy1tb2QnLFxuICAgICAgICB9KVxuICAgICAgICB0aGlzLmNvbnNvbGVSZXBvcnQoYXJnKVxuICAgICAgICB0aGlzLnNlbmRNZXNzYWdlcygpXG4gICAgICAgIGJyZWFrXG4gICAgICBjYXNlICdjb25zb2xlJzpcbiAgICAgICAgdGhpcy5jb25zb2xlUmVwb3J0KGFyZylcbiAgICAgICAgYnJlYWtcbiAgICAgIGNhc2UgJ3BvcHVwJzpcbiAgICAgICAgdGhpcy5jb25zb2xlUmVwb3J0KGFyZylcbiAgICAgICAgYXRvbS5ub3RpZmljYXRpb25zLmFkZEVycm9yKFV0aWwuZm9ybWF0RXJyb3IoYXJnKSwge1xuICAgICAgICAgIGRldGFpbDogVXRpbC5nZXRFcnJvckRldGFpbChhcmcpLFxuICAgICAgICAgIGRpc21pc3NhYmxlOiB0cnVlLFxuICAgICAgICB9KVxuICAgICAgICBicmVha1xuICAgIH1cbiAgfVxuXG4gIHByaXZhdGUgaGFuZGxlUHJvY2Vzc1dhcm5pbmcod2FybmluZzogc3RyaW5nKSB7XG4gICAgc3dpdGNoICh0aGlzLm1zZ0JhY2tlbmQpIHtcbiAgICAgIGNhc2UgJ3VwaSc6XG4gICAgICAgIHRoaXMucHJvY2Vzc01lc3NhZ2VzLnB1c2goe1xuICAgICAgICAgIG1lc3NhZ2U6IHdhcm5pbmcsXG4gICAgICAgICAgc2V2ZXJpdHk6ICdnaGMtbW9kJyxcbiAgICAgICAgfSlcbiAgICAgICAgVXRpbC53YXJuKHdhcm5pbmcpXG4gICAgICAgIHRoaXMuc2VuZE1lc3NhZ2VzKClcbiAgICAgICAgYnJlYWtcbiAgICAgIGNhc2UgJ2NvbnNvbGUnOlxuICAgICAgICBVdGlsLndhcm4od2FybmluZylcbiAgICAgICAgYnJlYWtcbiAgICAgIGNhc2UgJ3BvcHVwJzpcbiAgICAgICAgVXRpbC53YXJuKHdhcm5pbmcpXG4gICAgICAgIGF0b20ubm90aWZpY2F0aW9ucy5hZGRXYXJuaW5nKHdhcm5pbmcsIHtcbiAgICAgICAgICBkaXNtaXNzYWJsZTogZmFsc2UsXG4gICAgICAgIH0pXG4gICAgICAgIGJyZWFrXG4gICAgfVxuICB9XG59XG4iXX0=