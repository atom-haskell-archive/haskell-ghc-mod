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
exports.UPIConsumer = UPIConsumer;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidXBpLWNvbnN1bWVyLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vc3JjL3VwaS1jb25zdW1lci50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOzs7QUFBQSwrQkFRYTtBQUViLCtEQUF5RDtBQUN6RCwrQkFBOEI7QUFFOUIsTUFBTSxFQUFFLGVBQWUsRUFBRSxHQUFHLElBQUksQ0FBQTtBQUVoQyxNQUFNLFlBQVksR0FBRztJQUNuQixLQUFLLEVBQUUsRUFBRTtJQUNULE9BQU8sRUFBRSxFQUFFO0lBQ1gsSUFBSSxFQUFFLEVBQUU7Q0FDVCxDQUFBO0FBRUQsTUFBTSxXQUFXLEdBQUc7SUFDbEIsU0FBUyxFQUFFO1FBQ1QsU0FBUyxFQUFFLEtBQUs7UUFDaEIsVUFBVSxFQUFFLElBQUk7S0FDakI7Q0FDRixDQUFBO0FBRUQsTUFBTSxZQUFZLEdBQUcsMkNBQTJDLENBQUE7QUFFaEUsTUFBTSxRQUFRLEdBQUc7SUFDZixLQUFLLEVBQUUsU0FBUztJQUNoQixJQUFJLEVBQUU7UUFDSixFQUFFLEtBQUssRUFBRSxPQUFPLEVBQUUsT0FBTyxFQUFFLDRCQUE0QixFQUFFO1FBQ3pELEVBQUUsS0FBSyxFQUFFLE1BQU0sRUFBRSxPQUFPLEVBQUUsMkJBQTJCLEVBQUU7UUFDdkQsRUFBRSxLQUFLLEVBQUUsY0FBYyxFQUFFLE9BQU8sRUFBRSxrQ0FBa0MsRUFBRTtLQUN2RTtDQUNGLENBQUE7QUFJRDtJQThERSxZQUFZLFFBQThCLEVBQVUsT0FBdUI7UUFBdkIsWUFBTyxHQUFQLE9BQU8sQ0FBZ0I7UUE1RG5FLGdCQUFXLEdBQXdCLElBQUksMEJBQW1CLEVBQUUsQ0FBQTtRQUM1RCxvQkFBZSxHQUFzQixFQUFFLENBQUE7UUFDdkMsaUJBQVksR0FBc0IsRUFBRSxDQUFBO1FBQ3BDLGVBQVUsR0FBRyxJQUFJLENBQUMsTUFBTSxDQUFDLEdBQUcsQ0FBQyxnQ0FBZ0MsQ0FBQyxDQUFBO1FBRTlELG9CQUFlLEdBQUc7WUFDeEIsMkJBQTJCLEVBQUUsSUFBSSxDQUFDLGNBQWMsQ0FDOUMsSUFBSSxDQUFDLFdBQVcsQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLENBQzVCO1lBQ0QsMkJBQTJCLEVBQUUsSUFBSSxDQUFDLGNBQWMsQ0FDOUMsSUFBSSxDQUFDLFdBQVcsQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLENBQzVCO1lBQ0QsNEJBQTRCLEVBQUUsSUFBSSxDQUFDLGdCQUFnQixDQUFDLElBQUksQ0FBQyxJQUFJLENBQUM7WUFDOUQsMEJBQTBCLEVBQUUsSUFBSSxDQUFDLGNBQWMsQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDO1lBQzFELG1DQUFtQyxFQUFFLElBQUksQ0FBQyxlQUFlLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQztZQUNwRSw0Q0FBNEMsRUFBRSxJQUFJLENBQUMsY0FBYyxDQUMvRCxJQUFJLENBQUMsZUFBZSxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsQ0FDaEM7WUFDRCw0Q0FBNEMsRUFBRSxJQUFJLENBQUMsY0FBYyxDQUMvRCxJQUFJLENBQUMsZUFBZSxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsQ0FDaEM7WUFDRCxvQ0FBb0MsRUFBRSxJQUFJLENBQUMsY0FBYyxDQUN2RCxJQUFJLENBQUMsa0JBQWtCLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxDQUNuQztZQUNELDZCQUE2QixFQUFFLElBQUksQ0FBQyxpQkFBaUIsQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDO1lBQ2hFLCtCQUErQixFQUFFLElBQUksQ0FBQyxtQkFBbUIsQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDO1NBQ3JFLENBQUE7UUFFTyxtQkFBYyxtQkFDcEIsNEJBQTRCLEVBQUUsSUFBSSxDQUFDLFlBQVksQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLEVBQzFELDJCQUEyQixFQUFFLElBQUksQ0FBQyxXQUFXLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxJQUNyRCxJQUFJLENBQUMsZUFBZSxFQUN4QjtRQUVPLGdCQUFXLEdBTWY7WUFDRixLQUFLLEVBQUUsU0FBUztZQUNoQixPQUFPLEVBQUU7Z0JBQ1AsRUFBRSxLQUFLLEVBQUUsV0FBVyxFQUFFLE9BQU8sRUFBRSwyQkFBMkIsRUFBRTtnQkFDNUQsRUFBRSxLQUFLLEVBQUUsV0FBVyxFQUFFLE9BQU8sRUFBRSwyQkFBMkIsRUFBRTtnQkFDNUQ7b0JBQ0UsS0FBSyxFQUFFLG9CQUFvQjtvQkFDM0IsT0FBTyxFQUFFLG9DQUFvQztpQkFDOUM7Z0JBQ0QsRUFBRSxLQUFLLEVBQUUsWUFBWSxFQUFFLE9BQU8sRUFBRSw0QkFBNEIsRUFBRTtnQkFDOUQsRUFBRSxLQUFLLEVBQUUsVUFBVSxFQUFFLE9BQU8sRUFBRSwwQkFBMEIsRUFBRTtnQkFDMUQsRUFBRSxLQUFLLEVBQUUsYUFBYSxFQUFFLE9BQU8sRUFBRSw2QkFBNkIsRUFBRTtnQkFDaEUsRUFBRSxLQUFLLEVBQUUsZUFBZSxFQUFFLE9BQU8sRUFBRSwrQkFBK0IsRUFBRTtnQkFDcEU7b0JBQ0UsS0FBSyxFQUFFLG1CQUFtQjtvQkFDMUIsT0FBTyxFQUFFLG1DQUFtQztpQkFDN0M7YUFDRjtTQUNGLENBQUE7UUFHQyxJQUFJLENBQUMsV0FBVyxDQUFDLEdBQUcsQ0FDbEIsSUFBSSxDQUFDLE9BQU8sQ0FBQyxPQUFPLENBQUMsSUFBSSxDQUFDLGtCQUFrQixDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsQ0FBQyxFQUN4RCxJQUFJLENBQUMsT0FBTyxDQUFDLFNBQVMsQ0FBQyxJQUFJLENBQUMsb0JBQW9CLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxDQUFDLENBQzdELENBQUE7UUFFRCxNQUFNLFFBQVEsR0FDWixJQUFJLENBQUMsVUFBVSxLQUFLLEtBQUs7WUFDdkIsQ0FBQyxtQkFBTSxZQUFZLEVBQUssV0FBVyxFQUNuQyxDQUFDLENBQUMsWUFBWSxDQUFBO1FBRWxCLElBQUksQ0FBQyxHQUFHLEdBQUcsUUFBUSxDQUFDO1lBQ2xCLElBQUksRUFBRSxpQkFBaUI7WUFDdkIsSUFBSSxFQUFFLFFBQVE7WUFDZCxZQUFZLEVBQUUsUUFBUTtZQUN0QixPQUFPLEVBQUUsSUFBSSxDQUFDLGlCQUFpQixDQUFDLElBQUksQ0FBQyxJQUFJLENBQUM7WUFDMUMsTUFBTSxFQUFFO2dCQUNOLGVBQWUsRUFBRSxLQUFLLEVBQUUsTUFBTSxFQUFFLEVBQUUsQ0FDaEMsSUFBSSxDQUFDLFNBQVMsQ0FDWixNQUFNLEVBQ04sTUFBTSxFQUNOLElBQUksQ0FBQyxNQUFNLENBQUMsR0FBRyxDQUFDLHdDQUF3QyxDQUFDLENBQzFEO2dCQUNILGlCQUFpQixFQUFFLEtBQUssRUFBRSxNQUFNLEVBQUUsRUFBRSxDQUNsQyxJQUFJLENBQUMsU0FBUyxDQUFDLE1BQU0sRUFBRSxRQUFRLEVBQUUsSUFBSSxDQUFDO2FBQ3pDO1NBQ0YsQ0FBQyxDQUFBO1FBRUYsSUFBSSxDQUFDLFdBQVcsQ0FBQyxHQUFHLENBQ2xCLElBQUksQ0FBQyxHQUFHLEVBQ1IsSUFBSSxDQUFDLE9BQU8sQ0FBQyxlQUFlLENBQUMsR0FBRyxFQUFFLENBQ2hDLElBQUksQ0FBQyxHQUFHLENBQUMsU0FBUyxDQUFDLEVBQUUsTUFBTSxFQUFFLFVBQVUsRUFBRSxNQUFNLEVBQUUsRUFBRSxFQUFFLENBQUMsQ0FDdkQsRUFDRCxJQUFJLENBQUMsT0FBTyxDQUFDLGFBQWEsQ0FBQyxHQUFHLEVBQUUsQ0FDOUIsSUFBSSxDQUFDLEdBQUcsQ0FBQyxTQUFTLENBQUMsRUFBRSxNQUFNLEVBQUUsT0FBTyxFQUFFLE1BQU0sRUFBRSxFQUFFLEVBQUUsQ0FBQyxDQUNwRCxFQUNELElBQUksQ0FBQyxRQUFRLENBQUMsR0FBRyxDQUFDLFlBQVksRUFBRSxJQUFJLENBQUMsY0FBYyxDQUFDLENBQ3JELENBQUE7UUFDRCxNQUFNLEVBQUUsR0FBRyxFQUFFLENBQUE7UUFDYixFQUFFLENBQUMsWUFBWSxDQUFDLEdBQUcsQ0FBQyxJQUFJLENBQUMsV0FBVyxDQUFDLENBQUE7UUFDckMsSUFBSSxDQUFDLFdBQVcsQ0FBQyxHQUFHLENBQUMsSUFBSSxDQUFDLFdBQVcsQ0FBQyxHQUFHLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQTtJQUNoRCxDQUFDO0lBRU0sT0FBTztRQUNaLElBQUksQ0FBQyxXQUFXLENBQUMsT0FBTyxFQUFFLENBQUE7SUFDNUIsQ0FBQztJQUVPLEtBQUssQ0FBQyxpQkFBaUIsQ0FDN0IsTUFBa0IsRUFDbEIsTUFBYSxFQUNiLElBQXlCO1FBRXpCLE1BQU0sQ0FBQyxHQUNMLElBQUksS0FBSyxPQUFPO1lBQ2QsQ0FBQyxDQUFDLGtDQUFrQztZQUNwQyxDQUFDLENBQUMsSUFBSSxLQUFLLFdBQVcsQ0FBQyxDQUFDLENBQUMsaUNBQWlDLENBQUMsQ0FBQyxDQUFDLFNBQVMsQ0FBQTtRQUMxRSxNQUFNLENBQUMsR0FBRyxDQUFDLElBQUksSUFBSSxDQUFDLE1BQU0sQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDLENBQUE7UUFFakMsRUFBRSxDQUFDLENBQUMsQ0FBQyxDQUFDO1lBQUMsTUFBTSxDQUFDLElBQUksQ0FBQyxHQUFHLENBQUMsU0FBUyxDQUFDLENBQUMsTUFBTSxFQUFFLE1BQU0sQ0FBQyxDQUFBO1FBQ2pELElBQUk7WUFBQyxNQUFNLENBQUMsU0FBUyxDQUFBO0lBQ3ZCLENBQUM7SUFHTyxLQUFLLENBQUMsWUFBWSxDQUFDLEVBQUUsYUFBYSxFQUFrQjtRQUMxRCxNQUFNLE1BQU0sR0FBRyxhQUFhLENBQUMsUUFBUSxFQUFFLENBQUE7UUFDdkMsTUFBTSxHQUFHLEdBQUcsTUFBTSxJQUFJLENBQUMsT0FBTyxDQUFDLGFBQWEsQ0FDMUMsTUFBTSxDQUFDLFNBQVMsRUFBRSxFQUNsQixJQUFJLENBQUMsTUFBTSxDQUFDLEdBQUcsQ0FBQyx3Q0FBd0MsQ0FBQyxDQUMxRCxDQUFBO1FBQ0QsSUFBSSxDQUFDLFdBQVcsQ0FBQyxHQUFHLENBQUMsQ0FBQTtJQUN2QixDQUFDO0lBR08sS0FBSyxDQUFDLFdBQVcsQ0FBQyxFQUFFLGFBQWEsRUFBa0I7UUFDekQsTUFBTSxNQUFNLEdBQUcsYUFBYSxDQUFDLFFBQVEsRUFBRSxDQUFBO1FBQ3ZDLE1BQU0sR0FBRyxHQUFHLE1BQU0sSUFBSSxDQUFDLE9BQU8sQ0FBQyxZQUFZLENBQUMsTUFBTSxDQUFDLFNBQVMsRUFBRSxDQUFDLENBQUE7UUFDL0QsSUFBSSxDQUFDLFdBQVcsQ0FBQyxHQUFHLENBQUMsQ0FBQTtJQUN2QixDQUFDO0lBRU8sY0FBYyxDQUNwQixVQUFrRTtRQUVsRSxNQUFNLENBQUMsS0FBSyxFQUFFLEVBQUUsYUFBYSxFQUFFLE1BQU0sRUFBa0IsRUFBRSxFQUFFLENBQ3pELElBQUksQ0FBQyxHQUFHLENBQUMsV0FBVyxDQUFDO1lBQ25CLE1BQU0sRUFBRSxhQUFhLENBQUMsUUFBUSxFQUFFO1lBQ2hDLE1BQU07WUFDTixLQUFLLENBQUMsT0FBTyxDQUFDLE1BQU07Z0JBQ2xCLE1BQU0sQ0FBQyxVQUFVLENBQUMsYUFBYSxDQUFDLFFBQVEsRUFBRSxFQUFFLE1BQU0sQ0FBQyxDQUFBO1lBQ3JELENBQUM7U0FDRixDQUFDLENBQUE7SUFDTixDQUFDO0lBR08sS0FBSyxDQUFDLGlCQUFpQixDQUFDLEVBQUUsYUFBYSxFQUFFLE1BQU0sRUFBa0I7UUFDdkUsTUFBTSxNQUFNLEdBQUcsYUFBYSxDQUFDLFFBQVEsRUFBRSxDQUFBO1FBQ3ZDLE1BQU0sRUFBRSxHQUFHLElBQUksQ0FBQyxHQUFHLENBQUMsYUFBYSxDQUFDLE1BQU0sRUFBRSxNQUFNLENBQUMsQ0FBQTtRQUNqRCxFQUFFLENBQUMsQ0FBQyxFQUFFLEtBQUssU0FBUyxDQUFDLENBQUMsQ0FBQztZQUNyQixNQUFNLENBQUE7UUFDUixDQUFDO1FBQ0QsTUFBTSxFQUFFLE1BQU0sRUFBRSxHQUFHLEVBQUUsR0FBRyxFQUFFLENBQUE7UUFDMUIsTUFBTSxPQUFPLEdBQUcsSUFBSSxDQUFDLGdCQUFnQixDQUFDLE1BQU0sRUFBRSxHQUFHLENBQUMsQ0FBQTtRQUNsRCxFQUFFLENBQUMsQ0FBQyxDQUFDLE9BQU8sQ0FBQyxDQUFDLENBQUM7WUFDYixNQUFNLENBQUE7UUFDUixDQUFDO1FBQ0QsTUFBTSxFQUFFLEtBQUssRUFBRSxLQUFLLEVBQUUsTUFBTSxFQUFFLEdBQUcsT0FBTyxDQUFBO1FBQ3hDLEVBQUUsQ0FBQyxDQUFDLEtBQUssQ0FBQyxVQUFVLENBQUMsbUJBQW1CLENBQUMsQ0FBQyxDQUFDLENBQUM7WUFDMUMsTUFBTSxDQUFBO1FBQ1IsQ0FBQztRQUNELE1BQU0sRUFBRSxJQUFJLEVBQUUsR0FBRyxNQUFNLElBQUksQ0FBQyxPQUFPLENBQUMsZUFBZSxDQUNqRCxNQUFNLENBQUMsU0FBUyxFQUFFLEVBQ2xCLE1BQU0sQ0FDUCxDQUFBO1FBQ0QsRUFBRSxDQUFDLENBQ0QsTUFBTTthQUNILG9CQUFvQixDQUFDO1lBQ3BCLEtBQUssQ0FBQyxHQUFHO1lBQ1QsTUFBTSxDQUFDLFNBQVMsRUFBRSxDQUFDLFdBQVcsQ0FBQyxLQUFLLENBQUMsR0FBRyxDQUFDLEdBQUcsRUFBRSxLQUFLLENBQUMsQ0FBQyxHQUFHO1NBQ3pELENBQUM7YUFDRCxLQUFLLENBQUMsR0FBRyxDQUNkLENBQUMsQ0FBQyxDQUFDO1lBQ0QsSUFBSSxNQUFNLEdBQUcsTUFBTSxDQUFDLG9CQUFvQixDQUFDO2dCQUN2QyxDQUFDLEtBQUssQ0FBQyxLQUFLLENBQUMsR0FBRyxFQUFFLENBQUMsQ0FBQztnQkFDcEIsS0FBSyxDQUFDLEtBQUs7YUFDWixDQUFDLENBQUE7WUFDRixJQUFJLFNBQVMsR0FBRyxFQUFFLENBQUE7WUFDbEIsRUFBRSxDQUFDLENBQ0QsTUFBTTtpQkFDSCxnQ0FBZ0MsQ0FBQyxHQUFHLENBQUM7aUJBQ3JDLGNBQWMsRUFBRTtpQkFDaEIsUUFBUSxDQUFDLHVCQUF1QixDQUNyQyxDQUFDLENBQUMsQ0FBQztnQkFDRCxTQUFTLEdBQUcsTUFBTSxDQUFDLEtBQUssQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUE7Z0JBQzlCLE1BQU0sR0FBRyxNQUFNLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQyxDQUFBO1lBQzFCLENBQUM7WUFDRCxFQUFFLENBQUMsQ0FBQyxNQUFNLENBQUMsS0FBSyxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsQ0FBQztnQkFDdkIsTUFBTSxHQUFHLE1BQU0sQ0FBQyxPQUFPLENBQUMsS0FBSyxFQUFFLEdBQUcsQ0FBQyxDQUFBO1lBQ3JDLENBQUM7WUFDRCxNQUFNLENBQUMsb0JBQW9CLENBQ3pCLENBQUMsS0FBSyxDQUFDLEtBQUssRUFBRSxLQUFLLENBQUMsS0FBSyxDQUFDLEVBQzFCLEdBQUcsTUFBTSxPQUFPLElBQUksS0FBSyxTQUFTLEdBQUcsTUFBTSxFQUFFLENBQzlDLENBQUE7UUFDSCxDQUFDO1FBQUMsSUFBSSxDQUFDLENBQUM7WUFDTixNQUFNLENBQUMsb0JBQW9CLENBQ3pCLEtBQUssRUFDTCxJQUFJLE1BQU0sQ0FBQyxvQkFBb0IsQ0FBQyxLQUFLLENBQUMsT0FBTyxJQUFJLEdBQUcsQ0FDckQsQ0FBQTtRQUNILENBQUM7SUFDSCxDQUFDO0lBR08sS0FBSyxDQUFDLGdCQUFnQixDQUFDLEVBQUUsYUFBYSxFQUFFLE1BQU0sRUFBa0I7UUFDdEUsTUFBTSxNQUFNLEdBQUcsYUFBYSxDQUFDLFFBQVEsRUFBRSxDQUFBO1FBQ3ZDLE1BQU0sR0FBRyxHQUFHLElBQUksQ0FBQyxHQUFHLENBQUMsYUFBYSxDQUFDLE1BQU0sRUFBRSxNQUFNLENBQUMsQ0FBQTtRQUNsRCxFQUFFLENBQUMsQ0FBQyxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUM7WUFDVCxNQUFNLENBQUE7UUFDUixDQUFDO1FBQ0QsTUFBTSxFQUFFLE1BQU0sRUFBRSxHQUFHLEdBQUcsQ0FBQTtRQUN0QixNQUFNLEdBQUcsR0FBRyxNQUFNLElBQUksQ0FBQyxPQUFPLENBQUMsV0FBVyxDQUFDLE1BQU0sQ0FBQyxTQUFTLEVBQUUsRUFBRSxNQUFNLENBQUMsQ0FBQTtRQUN0RSxHQUFHLENBQUMsQ0FBQyxNQUFNLEVBQUUsS0FBSyxFQUFFLFdBQVcsRUFBRSxJQUFJLEdBQUcsQ0FBQyxDQUFDLENBQUM7WUFDekMsTUFBTSxDQUFDLG9CQUFvQixDQUFDLEtBQUssRUFBRSxXQUFXLENBQUMsQ0FBQTtRQUNqRCxDQUFDO0lBQ0gsQ0FBQztJQUdPLEtBQUssQ0FBQyxjQUFjLENBQUMsRUFBRSxhQUFhLEVBQUUsTUFBTSxFQUFrQjtRQUNwRSxNQUFNLE1BQU0sR0FBRyxhQUFhLENBQUMsUUFBUSxFQUFFLENBQUE7UUFDdkMsTUFBTSxHQUFHLEdBQUcsSUFBSSxDQUFDLEdBQUcsQ0FBQyxhQUFhLENBQUMsTUFBTSxFQUFFLE1BQU0sQ0FBQyxDQUFBO1FBQ2xELEVBQUUsQ0FBQyxDQUFDLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQztZQUNULE1BQU0sQ0FBQTtRQUNSLENBQUM7UUFDRCxNQUFNLEVBQUUsTUFBTSxFQUFFLEdBQUcsR0FBRyxDQUFBO1FBQ3RCLE1BQU0sR0FBRyxHQUFHLE1BQU0sSUFBSSxDQUFDLE9BQU8sQ0FBQyxTQUFTLENBQUMsTUFBTSxDQUFDLFNBQVMsRUFBRSxFQUFFLE1BQU0sQ0FBQyxDQUFBO1FBRXBFLE1BQU0sQ0FBQyxRQUFRLENBQUMsR0FBRyxFQUFFO1lBQ25CLE1BQU0sRUFBRSxJQUFJLEVBQUUsS0FBSyxFQUFFLElBQUksRUFBRSxHQUFHLEdBQUcsQ0FBQTtZQUNqQyxNQUFNLEdBQUcsR0FBRyxNQUFNLENBQUMsb0JBQW9CLENBQUMsS0FBSyxDQUFDLENBQUE7WUFDOUMsSUFBSSxNQUFNLEdBQUcsTUFBTSxDQUFDLGtCQUFrQixDQUFDLEdBQUcsQ0FBQyxDQUFBO1lBQzNDLE1BQU0sR0FBRyxHQUFHLEtBQUssQ0FBQyxHQUFHLENBQUE7WUFDckIsTUFBTSxJQUFJLEdBQUcsS0FBSyxJQUFJLEVBQUUsQ0FBQTtZQUN4QixFQUFFLENBQUMsQ0FBQyxJQUFJLEtBQUssVUFBVSxDQUFDLENBQUMsQ0FBQztnQkFDeEIsTUFBTSxJQUFJLENBQUMsQ0FBQTtnQkFDWCxFQUFFLENBQUMsQ0FBQyxDQUFDLEdBQUcsQ0FBQyxRQUFRLENBQUMsUUFBUSxDQUFDLENBQUMsQ0FBQyxDQUFDO29CQUM1QixNQUFNLENBQUMsb0JBQW9CLENBQUMsQ0FBQyxLQUFLLENBQUMsR0FBRyxFQUFFLEtBQUssQ0FBQyxHQUFHLENBQUMsRUFBRSxRQUFRLENBQUMsQ0FBQTtnQkFDL0QsQ0FBQztZQUNILENBQUM7WUFDRCxNQUFNLFFBQVEsR0FBRyxNQUFNLENBQUMsb0JBQW9CLENBQUMsQ0FBQyxHQUFHLEVBQUUsR0FBRyxDQUFDLEVBQUUsSUFBSSxDQUFDLENBQUE7WUFDOUQsUUFBUTtpQkFDTCxPQUFPLEVBQUU7aUJBQ1QsS0FBSyxDQUFDLENBQUMsQ0FBQztpQkFDUixHQUFHLENBQUMsQ0FBQyxHQUFHLEVBQUUsRUFBRSxDQUFDLE1BQU0sQ0FBQywwQkFBMEIsQ0FBQyxHQUFHLEVBQUUsTUFBTSxDQUFDLENBQUMsQ0FBQTtRQUNqRSxDQUFDLENBQUMsQ0FBQTtJQUNKLENBQUM7SUFHTyxLQUFLLENBQUMsZUFBZSxDQUFDLEVBQUUsYUFBYSxFQUFFLE1BQU0sRUFBa0I7UUFDckUsTUFBTSxNQUFNLEdBQUcsYUFBYSxDQUFDLFFBQVEsRUFBRSxDQUFBO1FBQ3ZDLE1BQU0sR0FBRyxHQUFHLElBQUksQ0FBQyxHQUFHLENBQUMsYUFBYSxDQUFDLE1BQU0sRUFBRSxNQUFNLENBQUMsQ0FBQTtRQUNsRCxFQUFFLENBQUMsQ0FBQyxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUM7WUFDVCxNQUFNLENBQUE7UUFDUixDQUFDO1FBQ0QsTUFBTSxFQUFFLE1BQU0sRUFBRSxHQUFHLEdBQUcsQ0FBQTtRQUN0QixNQUFNLEVBQUUsSUFBSSxFQUFFLEdBQUcsTUFBTSxJQUFJLENBQUMsT0FBTyxDQUFDLGVBQWUsQ0FBQyxNQUFNLEVBQUUsTUFBTSxDQUFDLENBQUE7UUFDbkUsTUFBTSxHQUFHLEdBQUcsa0NBQWtDLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxDQUFBO1FBQ3pELEVBQUUsQ0FBQyxDQUFDLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQztZQUNULE1BQU0sQ0FBQTtRQUNSLENBQUM7UUFDRCxNQUFNLENBQUMsRUFBRSxFQUFFLElBQUksRUFBRSxHQUFHLENBQUMsR0FBRyxHQUFHLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQyxDQUFBO1FBQ3BDLE1BQU0sT0FBTyxHQUFHLE1BQU0sSUFBSSxDQUFDLE9BQU8sQ0FBQyxVQUFVLENBQUMsTUFBTSxDQUFDLFNBQVMsRUFBRSxDQUFDLENBQUE7UUFDakUsRUFBRSxDQUFDLENBQUMsQ0FBQyxPQUFPLENBQUMsQ0FBQyxDQUFDO1lBQ2IsTUFBTSxDQUFBO1FBQ1IsQ0FBQztRQUNELE1BQU0sR0FBRyxHQUFHLE9BQU8sQ0FBQyxPQUFPLENBQUMsRUFBRSxDQUFDLENBQUMsT0FBTyxFQUFFLElBQUksRUFBRSxDQUFBO1FBQy9DLE1BQU0sSUFBSSxDQUFDLFNBQVMsQ0FBQyxJQUFJLENBQUMsR0FBRyxFQUFFO1lBQzdCLFdBQVcsRUFBRSxRQUFRLENBQUMsSUFBSSxFQUFFLEVBQUUsQ0FBQyxHQUFHLENBQUM7WUFDbkMsYUFBYSxFQUFFLFFBQVEsQ0FBQyxHQUFHLEVBQUUsRUFBRSxDQUFDLEdBQUcsQ0FBQztTQUNyQyxDQUFDLENBQUE7SUFDSixDQUFDO0lBR08sS0FBSyxDQUFDLG1CQUFtQixDQUFDLEVBQUUsYUFBYSxFQUFFLE1BQU0sRUFBa0I7UUFDekUsTUFBTSxNQUFNLEdBQUcsYUFBYSxDQUFDLFFBQVEsRUFBRSxDQUFBO1FBQ3ZDLE1BQU0sTUFBTSxHQUFHLE1BQU0sQ0FBQyxTQUFTLEVBQUUsQ0FBQTtRQUNqQyxNQUFNLEdBQUcsR0FBRyxJQUFJLENBQUMsR0FBRyxDQUFDLGFBQWEsQ0FBQyxNQUFNLEVBQUUsTUFBTSxDQUFDLENBQUE7UUFDbEQsRUFBRSxDQUFDLENBQUMsQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDO1lBQ1QsTUFBTSxDQUFBO1FBQ1IsQ0FBQztRQUNELE1BQU0sRUFBRSxNQUFNLEVBQUUsR0FBRyxHQUFHLENBQUE7UUFDdEIsTUFBTSxLQUFLLEdBQUcsTUFBTSxJQUFJLENBQUMsT0FBTyxDQUFDLDJCQUEyQixDQUFDLE1BQU0sRUFBRSxNQUFNLENBQUMsQ0FBQTtRQUM1RSxNQUFNLEdBQUcsR0FBRyxNQUFNLGlDQUFjLENBQUMsS0FBSyxDQUFDLENBQUE7UUFDdkMsRUFBRSxDQUFDLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQztZQUNSLE1BQU0sRUFBRSxHQUFHLE1BQU0sSUFBSSxPQUFPLENBQzFCLENBQUMsT0FBTyxFQUFFLEVBQUU7Z0JBQ1YsTUFBTSxDQUFDLGFBQWEsQ0FBQyx1QkFBdUIsRUFBRSxDQUFDLEVBQUUsS0FBSyxFQUFFLEtBQUssRUFBRSxFQUFFLEVBQUU7b0JBQ2pFLElBQUksTUFBTSxHQUFHLEVBQUUsQ0FBQTtvQkFDZixNQUFNLENBQUMsQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDO3dCQUNqQixLQUFLLFFBQVE7NEJBQ1gsTUFBTSxHQUFHLEtBQUssS0FBSyxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUE7NEJBQ3hCLEtBQUssQ0FBQTt3QkFDUCxLQUFLLFFBQVE7NEJBQ1gsTUFBTSxHQUFHLE9BQU8sS0FBSyxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUE7NEJBQzFCLEtBQUssQ0FBQTtvQkFDVCxDQUFDO29CQUNELE9BQU8sQ0FBQzt3QkFDTixHQUFHLEVBQUUsTUFBTSxDQUFDLFdBQVcsQ0FBQyxLQUFLLENBQUMsS0FBSyxDQUFDLEdBQUcsRUFBRSxLQUFLLENBQUMsQ0FBQyxHQUFHO3dCQUNuRCxNQUFNO3dCQUNOLEdBQUcsRUFBRSxFQUFFO3FCQUNSLENBQUMsQ0FBQTtnQkFDSixDQUFDLENBQUMsQ0FBQTtnQkFFRixPQUFPLENBQUM7b0JBQ04sR0FBRyxFQUFFLE1BQU0sQ0FBQyxnQkFBZ0IsRUFBRTtvQkFDOUIsTUFBTSxFQUFFLEVBQUU7b0JBQ1YsR0FBRyxFQUFFLElBQUk7aUJBQ1YsQ0FBQyxDQUFBO1lBQ0osQ0FBQyxDQUNGLENBQUE7WUFDRCxNQUFNLENBQUMsb0JBQW9CLENBQ3pCLENBQUMsRUFBRSxDQUFDLEdBQUcsRUFBRSxFQUFFLENBQUMsR0FBRyxDQUFDLEVBQ2hCLEdBQUcsRUFBRSxDQUFDLE1BQU0sVUFBVSxHQUFHLEdBQUcsRUFBRSxDQUFDLEdBQUcsRUFBRSxDQUNyQyxDQUFBO1FBQ0gsQ0FBQztJQUNILENBQUM7SUFFTyxLQUFLLENBQUMsV0FBVyxDQUFDLENBQWEsRUFBRSxDQUFRO1FBQy9DLE1BQU0sRUFBRSxLQUFLLEVBQUUsSUFBSSxFQUFFLEdBQUcsTUFBTSxJQUFJLENBQUMsT0FBTyxDQUFDLGVBQWUsQ0FBQyxDQUFDLENBQUMsU0FBUyxFQUFFLEVBQUUsQ0FBQyxDQUFDLENBQUE7UUFDNUUsTUFBTSxDQUFDO1lBQ0wsS0FBSztZQUNMLElBQUksRUFBRTtnQkFDSixJQUFJLEVBQUUsSUFBSTtnQkFDVixXQUFXLEVBQUUsSUFBSSxDQUFDLE1BQU0sQ0FBQyxHQUFHLENBQUMsbUNBQW1DLENBQUM7b0JBQy9ELENBQUMsQ0FBQyxtQkFBbUI7b0JBQ3JCLENBQUMsQ0FBQyxTQUFTO2FBQ2Q7U0FDRixDQUFBO0lBQ0gsQ0FBQztJQUVPLEtBQUssQ0FBQyxXQUFXLENBQUMsQ0FBYSxFQUFFLENBQVE7UUFDL0MsTUFBTSxFQUFFLEtBQUssRUFBRSxJQUFJLEVBQUUsR0FBRyxNQUFNLElBQUksQ0FBQyxPQUFPLENBQUMsZUFBZSxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQTtRQUNoRSxNQUFNLENBQUM7WUFDTCxLQUFLO1lBQ0wsSUFBSSxFQUFFO2dCQUNKLElBQUksRUFBRSxJQUFJO2dCQUNWLFdBQVcsRUFBRSxJQUFJLENBQUMsTUFBTSxDQUFDLEdBQUcsQ0FBQyxtQ0FBbUMsQ0FBQztvQkFDL0QsQ0FBQyxDQUFDLGdCQUFnQjtvQkFDbEIsQ0FBQyxDQUFDLFNBQVM7YUFDZDtTQUNGLENBQUE7SUFDSCxDQUFDO0lBRU8sS0FBSyxDQUFDLGVBQWUsQ0FBQyxDQUFhLEVBQUUsQ0FBUTtRQUNuRCxJQUFJLENBQUM7WUFDSCxNQUFNLENBQUMsTUFBTSxJQUFJLENBQUMsV0FBVyxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQTtRQUNyQyxDQUFDO1FBQUMsS0FBSyxDQUFDLENBQUMsSUFBRCxDQUFDO1lBQ1AsTUFBTSxDQUFDLElBQUksQ0FBQyxXQUFXLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFBO1FBQy9CLENBQUM7SUFDSCxDQUFDO0lBRU8sS0FBSyxDQUFDLGVBQWUsQ0FBQyxDQUFhLEVBQUUsQ0FBUTtRQUNuRCxJQUFJLENBQUM7WUFDSCxNQUFNLENBQUMsTUFBTSxJQUFJLENBQUMsV0FBVyxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQTtRQUNyQyxDQUFDO1FBQUMsS0FBSyxDQUFDLENBQUMsSUFBRCxDQUFDO1lBQ1AsTUFBTSxDQUFDLElBQUksQ0FBQyxXQUFXLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFBO1FBQy9CLENBQUM7SUFDSCxDQUFDO0lBRU8sS0FBSyxDQUFDLGtCQUFrQixDQUFDLENBQWEsRUFBRSxDQUFRO1FBQ3RELE1BQU0sS0FBSyxHQUFHLElBQUksQ0FBQyxXQUFXLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDLEtBQUssQ0FBQyxHQUFHLEVBQUUsQ0FBQyxTQUFTLENBQUMsQ0FBQTtRQUMzRCxNQUFNLEtBQUssR0FBRyxJQUFJLENBQUMsV0FBVyxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQyxLQUFLLENBQUMsR0FBRyxFQUFFLENBQUMsU0FBUyxDQUFDLENBQUE7UUFDM0QsTUFBTSxDQUFDLElBQUksRUFBRSxJQUFJLENBQUMsR0FBRyxNQUFNLE9BQU8sQ0FBQyxHQUFHLENBQUMsQ0FBQyxLQUFLLEVBQUUsS0FBSyxDQUFDLENBQUMsQ0FBQTtRQUN0RCxJQUFJLEtBQVksQ0FBQTtRQUNoQixJQUFJLElBQVksQ0FBQTtRQUNoQixFQUFFLENBQUMsQ0FBQyxJQUFJLElBQUksSUFBSSxDQUFDLENBQUMsQ0FBQztZQUNqQixLQUFLLEdBQUcsSUFBSSxDQUFDLEtBQUssQ0FBQyxLQUFLLENBQUMsSUFBSSxDQUFDLEtBQUssQ0FBQyxDQUFBO1lBQ3BDLE1BQU0sR0FBRyxHQUFHLElBQUksQ0FBQyxNQUFNLENBQUMsR0FBRyxDQUN6Qiw0REFBNEQsQ0FDN0QsQ0FBQTtZQUNELEVBQUUsQ0FBQyxDQUFDLEdBQUcsSUFBSSxJQUFJLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxRQUFRLENBQUMsTUFBTSxJQUFJLENBQUMsSUFBSSxDQUFDLElBQUksRUFBRSxDQUFDLENBQUMsQ0FBQyxDQUFDO2dCQUMzRCxJQUFJLEdBQUcsSUFBSSxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUE7WUFDdkIsQ0FBQztZQUFDLElBQUksQ0FBQyxDQUFDO2dCQUNOLElBQUksR0FBRyxNQUFNLElBQUksQ0FBQyxJQUFJLENBQUMsSUFBSSxLQUFLLElBQUksQ0FBQyxJQUFJLENBQUMsSUFBSSxFQUFFLENBQUE7WUFDbEQsQ0FBQztRQUNILENBQUM7UUFBQyxJQUFJLENBQUMsRUFBRSxDQUFDLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQztZQUNoQixLQUFLLEdBQUcsSUFBSSxDQUFDLEtBQUssQ0FBQTtZQUNsQixJQUFJLEdBQUcsTUFBTSxJQUFJLENBQUMsSUFBSSxDQUFDLElBQUksRUFBRSxDQUFBO1FBQy9CLENBQUM7UUFBQyxJQUFJLENBQUMsRUFBRSxDQUFDLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQztZQUNoQixLQUFLLEdBQUcsSUFBSSxDQUFDLEtBQUssQ0FBQTtZQUNsQixJQUFJLEdBQUcsSUFBSSxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUE7UUFDdkIsQ0FBQztRQUFDLElBQUksQ0FBQyxDQUFDO1lBQ04sTUFBTSxJQUFJLEtBQUssQ0FBQywyQkFBMkIsQ0FBQyxDQUFBO1FBQzlDLENBQUM7UUFDRCxNQUFNLFdBQVcsR0FBRyxJQUFJLENBQUMsTUFBTSxDQUFDLEdBQUcsQ0FBQyxtQ0FBbUMsQ0FBQztZQUN0RSxDQUFDLENBQUMsZ0JBQWdCO1lBQ2xCLENBQUMsQ0FBQyxTQUFTLENBQUE7UUFDYixNQUFNLENBQUMsRUFBRSxLQUFLLEVBQUUsSUFBSSxFQUFFLEVBQUUsSUFBSSxFQUFFLFdBQVcsRUFBRSxFQUFFLENBQUE7SUFDL0MsQ0FBQztJQUVPLGNBQWM7UUFDcEIsRUFBRSxDQUFDLENBQUMsSUFBSSxDQUFDLE1BQU0sQ0FBQyxHQUFHLENBQUMsbUNBQW1DLENBQUMsQ0FBQyxDQUFDLENBQUM7WUFDekQsTUFBTSxDQUFDLENBQUMsQ0FBa0IsRUFBbUIsRUFBRTtnQkFDN0MsRUFBRSxDQUFDLENBQUMsT0FBTyxDQUFDLENBQUMsT0FBTyxLQUFLLFFBQVEsQ0FBQyxDQUFDLENBQUM7b0JBQ2xDLE1BQU0sT0FBTyxHQUFxQjt3QkFDaEMsSUFBSSxFQUFFLENBQUMsQ0FBQyxPQUFPO3dCQUNmLFdBQVcsRUFBRSxzQkFBc0I7cUJBQ3BDLENBQUE7b0JBQ0QsTUFBTSxtQkFBTSxDQUFDLElBQUUsT0FBTyxJQUFFO2dCQUMxQixDQUFDO2dCQUFDLElBQUksQ0FBQyxDQUFDO29CQUNOLE1BQU0sQ0FBQyxDQUFDLENBQUE7Z0JBQ1YsQ0FBQztZQUNILENBQUMsQ0FBQTtRQUNILENBQUM7UUFBQyxJQUFJLENBQUMsQ0FBQztZQUNOLE1BQU0sQ0FBQyxDQUFDLENBQWtCLEVBQUUsRUFBRSxDQUFDLENBQUMsQ0FBQTtRQUNsQyxDQUFDO0lBQ0gsQ0FBQztJQUVPLFdBQVcsQ0FBQyxRQUEyQjtRQUM3QyxJQUFJLENBQUMsWUFBWSxHQUFHLFFBQVEsQ0FBQyxHQUFHLENBQUMsSUFBSSxDQUFDLGNBQWMsRUFBRSxDQUFDLENBQUE7UUFDdkQsSUFBSSxDQUFDLFlBQVksRUFBRSxDQUFBO0lBQ3JCLENBQUM7SUFFTyxZQUFZO1FBQ2xCLElBQUksQ0FBQyxHQUFHLENBQUMsV0FBVyxDQUFDLElBQUksQ0FBQyxlQUFlLENBQUMsTUFBTSxDQUFDLElBQUksQ0FBQyxZQUFZLENBQUMsQ0FBQyxDQUFBO0lBQ3RFLENBQUM7SUFFTyxLQUFLLENBQUMsU0FBUyxDQUNyQixNQUFrQixFQUNsQixHQUFzQixFQUN0QixJQUFhO1FBRWIsTUFBTSxLQUFLLEdBQUcsSUFBSSxDQUFDLE1BQU0sQ0FBQyxHQUFHLENBQUMscUJBQXFCLEdBQUcsT0FFbkIsQ0FBQyxDQUFBO1FBQ3BDLE1BQU0sSUFBSSxHQUFHLElBQUksQ0FBQyxNQUFNLENBQUMsR0FBRyxDQUFDLHFCQUFxQixHQUFHLE1BRW5CLENBQUMsQ0FBQTtRQUNuQyxJQUFJLEdBQUcsQ0FBQTtRQUNQLEVBQUUsQ0FBQyxDQUFDLEtBQUssSUFBSSxJQUFJLENBQUMsQ0FBQyxDQUFDO1lBQ2xCLEdBQUcsR0FBRyxNQUFNLElBQUksQ0FBQyxPQUFPLENBQUMsY0FBYyxDQUFDLE1BQU0sRUFBRSxJQUFJLENBQUMsQ0FBQTtRQUN2RCxDQUFDO1FBQUMsSUFBSSxDQUFDLEVBQUUsQ0FBQyxDQUFDLEtBQUssQ0FBQyxDQUFDLENBQUM7WUFDakIsR0FBRyxHQUFHLE1BQU0sSUFBSSxDQUFDLE9BQU8sQ0FBQyxhQUFhLENBQUMsTUFBTSxFQUFFLElBQUksQ0FBQyxDQUFBO1FBQ3RELENBQUM7UUFBQyxJQUFJLENBQUMsRUFBRSxDQUFDLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQztZQUNoQixHQUFHLEdBQUcsTUFBTSxJQUFJLENBQUMsT0FBTyxDQUFDLFlBQVksQ0FBQyxNQUFNLENBQUMsQ0FBQTtRQUMvQyxDQUFDO1FBQ0QsRUFBRSxDQUFDLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQztZQUNSLElBQUksQ0FBQyxXQUFXLENBQUMsR0FBRyxDQUFDLENBQUE7UUFDdkIsQ0FBQztJQUNILENBQUM7SUFFTyxhQUFhLENBQUMsR0FBdUI7UUFFM0MsT0FBTyxDQUFDLEtBQUssQ0FBQyxJQUFJLENBQUMsV0FBVyxDQUFDLEdBQUcsQ0FBQyxFQUFFLElBQUksQ0FBQyxjQUFjLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQTtJQUNoRSxDQUFDO0lBRU8sa0JBQWtCLENBQUMsR0FBdUI7UUFDaEQsTUFBTSxDQUFDLENBQUMsSUFBSSxDQUFDLFVBQVUsQ0FBQyxDQUFDLENBQUM7WUFDeEIsS0FBSyxLQUFLO2dCQUNSLElBQUksQ0FBQyxlQUFlLENBQUMsSUFBSSxDQUFDO29CQUN4QixPQUFPLEVBQ0wsSUFBSSxDQUFDLFdBQVcsQ0FBQyxHQUFHLENBQUM7d0JBQ3JCLHdGQUF3RjtvQkFDMUYsUUFBUSxFQUFFLFNBQVM7aUJBQ3BCLENBQUMsQ0FBQTtnQkFDRixJQUFJLENBQUMsYUFBYSxDQUFDLEdBQUcsQ0FBQyxDQUFBO2dCQUN2QixJQUFJLENBQUMsWUFBWSxFQUFFLENBQUE7Z0JBQ25CLEtBQUssQ0FBQTtZQUNQLEtBQUssU0FBUztnQkFDWixJQUFJLENBQUMsYUFBYSxDQUFDLEdBQUcsQ0FBQyxDQUFBO2dCQUN2QixLQUFLLENBQUE7WUFDUCxLQUFLLE9BQU87Z0JBQ1YsSUFBSSxDQUFDLGFBQWEsQ0FBQyxHQUFHLENBQUMsQ0FBQTtnQkFDdkIsSUFBSSxDQUFDLGFBQWEsQ0FBQyxRQUFRLENBQUMsSUFBSSxDQUFDLFdBQVcsQ0FBQyxHQUFHLENBQUMsRUFBRTtvQkFDakQsTUFBTSxFQUFFLElBQUksQ0FBQyxjQUFjLENBQUMsR0FBRyxDQUFDO29CQUNoQyxXQUFXLEVBQUUsSUFBSTtpQkFDbEIsQ0FBQyxDQUFBO2dCQUNGLEtBQUssQ0FBQTtRQUNULENBQUM7SUFDSCxDQUFDO0lBRU8sb0JBQW9CLENBQUMsT0FBZTtRQUMxQyxNQUFNLENBQUMsQ0FBQyxJQUFJLENBQUMsVUFBVSxDQUFDLENBQUMsQ0FBQztZQUN4QixLQUFLLEtBQUs7Z0JBQ1IsSUFBSSxDQUFDLGVBQWUsQ0FBQyxJQUFJLENBQUM7b0JBQ3hCLE9BQU8sRUFBRSxPQUFPO29CQUNoQixRQUFRLEVBQUUsU0FBUztpQkFDcEIsQ0FBQyxDQUFBO2dCQUNGLElBQUksQ0FBQyxJQUFJLENBQUMsT0FBTyxDQUFDLENBQUE7Z0JBQ2xCLElBQUksQ0FBQyxZQUFZLEVBQUUsQ0FBQTtnQkFDbkIsS0FBSyxDQUFBO1lBQ1AsS0FBSyxTQUFTO2dCQUNaLElBQUksQ0FBQyxJQUFJLENBQUMsT0FBTyxDQUFDLENBQUE7Z0JBQ2xCLEtBQUssQ0FBQTtZQUNQLEtBQUssT0FBTztnQkFDVixJQUFJLENBQUMsSUFBSSxDQUFDLE9BQU8sQ0FBQyxDQUFBO2dCQUNsQixJQUFJLENBQUMsYUFBYSxDQUFDLFVBQVUsQ0FBQyxPQUFPLEVBQUU7b0JBQ3JDLFdBQVcsRUFBRSxLQUFLO2lCQUNuQixDQUFDLENBQUE7Z0JBQ0YsS0FBSyxDQUFBO1FBQ1QsQ0FBQztJQUNILENBQUM7Q0FDRjtBQXZYQztJQURDLGVBQWU7Ozs7K0NBUWY7QUFHRDtJQURDLGVBQWU7Ozs7OENBS2Y7QUFnQkQ7SUFEQyxlQUFlOzs7O29EQXVEZjtBQUdEO0lBREMsZUFBZTs7OzttREFZZjtBQUdEO0lBREMsZUFBZTs7OztpREE0QmY7QUFHRDtJQURDLGVBQWU7Ozs7a0RBdUJmO0FBR0Q7SUFEQyxlQUFlOzs7O3NEQTJDZjtBQW5VSCxrQ0FvZkMiLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQge1xuICBDb21tYW5kRXZlbnQsXG4gIENvbXBvc2l0ZURpc3Bvc2FibGUsXG4gIFJhbmdlLFxuICBUZXh0QnVmZmVyLFxuICBUZXh0RWRpdG9yLFxuICBQb2ludCxcbiAgVGV4dEVkaXRvckVsZW1lbnQsXG59IGZyb20gJ2F0b20nXG5pbXBvcnQgeyBHaGNNb2RpUHJvY2VzcywgSUVycm9yQ2FsbGJhY2tBcmdzIH0gZnJvbSAnLi9naGMtbW9kJ1xuaW1wb3J0IHsgaW1wb3J0TGlzdFZpZXcgfSBmcm9tICcuL3ZpZXdzL2ltcG9ydC1saXN0LXZpZXcnXG5pbXBvcnQgKiBhcyBVdGlsIGZyb20gJy4vdXRpbCdcbmltcG9ydCAqIGFzIFVQSSBmcm9tICdhdG9tLWhhc2tlbGwtdXBpJ1xuY29uc3QgeyBoYW5kbGVFeGNlcHRpb24gfSA9IFV0aWxcblxuY29uc3QgbWVzc2FnZVR5cGVzID0ge1xuICBlcnJvcjoge30sXG4gIHdhcm5pbmc6IHt9LFxuICBsaW50OiB7fSxcbn1cblxuY29uc3QgYWRkTXNnVHlwZXMgPSB7XG4gICdnaGMtbW9kJzoge1xuICAgIHVyaUZpbHRlcjogZmFsc2UsXG4gICAgYXV0b1Njcm9sbDogdHJ1ZSxcbiAgfSxcbn1cblxuY29uc3QgY29udGV4dFNjb3BlID0gJ2F0b20tdGV4dC1lZGl0b3JbZGF0YS1ncmFtbWFyfj1cImhhc2tlbGxcIl0nXG5cbmNvbnN0IG1haW5NZW51ID0ge1xuICBsYWJlbDogJ2doYy1tb2QnLFxuICBtZW51OiBbXG4gICAgeyBsYWJlbDogJ0NoZWNrJywgY29tbWFuZDogJ2hhc2tlbGwtZ2hjLW1vZDpjaGVjay1maWxlJyB9LFxuICAgIHsgbGFiZWw6ICdMaW50JywgY29tbWFuZDogJ2hhc2tlbGwtZ2hjLW1vZDpsaW50LWZpbGUnIH0sXG4gICAgeyBsYWJlbDogJ1N0b3AgQmFja2VuZCcsIGNvbW1hbmQ6ICdoYXNrZWxsLWdoYy1tb2Q6c2h1dGRvd24tYmFja2VuZCcgfSxcbiAgXSxcbn1cblxudHlwZSBURUNvbW1hbmRFdmVudCA9IENvbW1hbmRFdmVudDxUZXh0RWRpdG9yRWxlbWVudD5cblxuZXhwb3J0IGNsYXNzIFVQSUNvbnN1bWVyIHtcbiAgcHVibGljIHVwaTogVVBJLklVUElJbnN0YW5jZVxuICBwcml2YXRlIGRpc3Bvc2FibGVzOiBDb21wb3NpdGVEaXNwb3NhYmxlID0gbmV3IENvbXBvc2l0ZURpc3Bvc2FibGUoKVxuICBwcml2YXRlIHByb2Nlc3NNZXNzYWdlczogVVBJLklSZXN1bHRJdGVtW10gPSBbXVxuICBwcml2YXRlIGxhc3RNZXNzYWdlczogVVBJLklSZXN1bHRJdGVtW10gPSBbXVxuICBwcml2YXRlIG1zZ0JhY2tlbmQgPSBhdG9tLmNvbmZpZy5nZXQoJ2hhc2tlbGwtZ2hjLW1vZC5naGNNb2RNZXNzYWdlcycpXG5cbiAgcHJpdmF0ZSBjb250ZXh0Q29tbWFuZHMgPSB7XG4gICAgJ2hhc2tlbGwtZ2hjLW1vZDpzaG93LXR5cGUnOiB0aGlzLnRvb2x0aXBDb21tYW5kKFxuICAgICAgdGhpcy50eXBlVG9vbHRpcC5iaW5kKHRoaXMpLFxuICAgICksXG4gICAgJ2hhc2tlbGwtZ2hjLW1vZDpzaG93LWluZm8nOiB0aGlzLnRvb2x0aXBDb21tYW5kKFxuICAgICAgdGhpcy5pbmZvVG9vbHRpcC5iaW5kKHRoaXMpLFxuICAgICksXG4gICAgJ2hhc2tlbGwtZ2hjLW1vZDpjYXNlLXNwbGl0JzogdGhpcy5jYXNlU3BsaXRDb21tYW5kLmJpbmQodGhpcyksXG4gICAgJ2hhc2tlbGwtZ2hjLW1vZDpzaWctZmlsbCc6IHRoaXMuc2lnRmlsbENvbW1hbmQuYmluZCh0aGlzKSxcbiAgICAnaGFza2VsbC1naGMtbW9kOmdvLXRvLWRlY2xhcmF0aW9uJzogdGhpcy5nb1RvRGVjbENvbW1hbmQuYmluZCh0aGlzKSxcbiAgICAnaGFza2VsbC1naGMtbW9kOnNob3ctaW5mby1mYWxsYmFjay10by10eXBlJzogdGhpcy50b29sdGlwQ29tbWFuZChcbiAgICAgIHRoaXMuaW5mb1R5cGVUb29sdGlwLmJpbmQodGhpcyksXG4gICAgKSxcbiAgICAnaGFza2VsbC1naGMtbW9kOnNob3ctdHlwZS1mYWxsYmFjay10by1pbmZvJzogdGhpcy50b29sdGlwQ29tbWFuZChcbiAgICAgIHRoaXMudHlwZUluZm9Ub29sdGlwLmJpbmQodGhpcyksXG4gICAgKSxcbiAgICAnaGFza2VsbC1naGMtbW9kOnNob3ctdHlwZS1hbmQtaW5mbyc6IHRoaXMudG9vbHRpcENvbW1hbmQoXG4gICAgICB0aGlzLnR5cGVBbmRJbmZvVG9vbHRpcC5iaW5kKHRoaXMpLFxuICAgICksXG4gICAgJ2hhc2tlbGwtZ2hjLW1vZDppbnNlcnQtdHlwZSc6IHRoaXMuaW5zZXJ0VHlwZUNvbW1hbmQuYmluZCh0aGlzKSxcbiAgICAnaGFza2VsbC1naGMtbW9kOmluc2VydC1pbXBvcnQnOiB0aGlzLmluc2VydEltcG9ydENvbW1hbmQuYmluZCh0aGlzKSxcbiAgfVxuXG4gIHByaXZhdGUgZ2xvYmFsQ29tbWFuZHMgPSB7XG4gICAgJ2hhc2tlbGwtZ2hjLW1vZDpjaGVjay1maWxlJzogdGhpcy5jaGVja0NvbW1hbmQuYmluZCh0aGlzKSxcbiAgICAnaGFza2VsbC1naGMtbW9kOmxpbnQtZmlsZSc6IHRoaXMubGludENvbW1hbmQuYmluZCh0aGlzKSxcbiAgICAuLi50aGlzLmNvbnRleHRDb21tYW5kcyxcbiAgfVxuXG4gIHByaXZhdGUgY29udGV4dE1lbnU6IHtcbiAgICBsYWJlbDogc3RyaW5nXG4gICAgc3VibWVudTogQXJyYXk8e1xuICAgICAgbGFiZWw6IHN0cmluZ1xuICAgICAgY29tbWFuZDoga2V5b2YgVVBJQ29uc3VtZXJbJ2NvbnRleHRDb21tYW5kcyddXG4gICAgfT5cbiAgfSA9IHtcbiAgICBsYWJlbDogJ2doYy1tb2QnLFxuICAgIHN1Ym1lbnU6IFtcbiAgICAgIHsgbGFiZWw6ICdTaG93IFR5cGUnLCBjb21tYW5kOiAnaGFza2VsbC1naGMtbW9kOnNob3ctdHlwZScgfSxcbiAgICAgIHsgbGFiZWw6ICdTaG93IEluZm8nLCBjb21tYW5kOiAnaGFza2VsbC1naGMtbW9kOnNob3ctaW5mbycgfSxcbiAgICAgIHtcbiAgICAgICAgbGFiZWw6ICdTaG93IFR5cGUgQW5kIEluZm8nLFxuICAgICAgICBjb21tYW5kOiAnaGFza2VsbC1naGMtbW9kOnNob3ctdHlwZS1hbmQtaW5mbycsXG4gICAgICB9LFxuICAgICAgeyBsYWJlbDogJ0Nhc2UgU3BsaXQnLCBjb21tYW5kOiAnaGFza2VsbC1naGMtbW9kOmNhc2Utc3BsaXQnIH0sXG4gICAgICB7IGxhYmVsOiAnU2lnIEZpbGwnLCBjb21tYW5kOiAnaGFza2VsbC1naGMtbW9kOnNpZy1maWxsJyB9LFxuICAgICAgeyBsYWJlbDogJ0luc2VydCBUeXBlJywgY29tbWFuZDogJ2hhc2tlbGwtZ2hjLW1vZDppbnNlcnQtdHlwZScgfSxcbiAgICAgIHsgbGFiZWw6ICdJbnNlcnQgSW1wb3J0JywgY29tbWFuZDogJ2hhc2tlbGwtZ2hjLW1vZDppbnNlcnQtaW1wb3J0JyB9LFxuICAgICAge1xuICAgICAgICBsYWJlbDogJ0dvIFRvIERlY2xhcmF0aW9uJyxcbiAgICAgICAgY29tbWFuZDogJ2hhc2tlbGwtZ2hjLW1vZDpnby10by1kZWNsYXJhdGlvbicsXG4gICAgICB9LFxuICAgIF0sXG4gIH1cblxuICBjb25zdHJ1Y3RvcihyZWdpc3RlcjogVVBJLklVUElSZWdpc3RyYXRpb24sIHByaXZhdGUgcHJvY2VzczogR2hjTW9kaVByb2Nlc3MpIHtcbiAgICB0aGlzLmRpc3Bvc2FibGVzLmFkZChcbiAgICAgIHRoaXMucHJvY2Vzcy5vbkVycm9yKHRoaXMuaGFuZGxlUHJvY2Vzc0Vycm9yLmJpbmQodGhpcykpLFxuICAgICAgdGhpcy5wcm9jZXNzLm9uV2FybmluZyh0aGlzLmhhbmRsZVByb2Nlc3NXYXJuaW5nLmJpbmQodGhpcykpLFxuICAgIClcblxuICAgIGNvbnN0IG1zZ1R5cGVzID1cbiAgICAgIHRoaXMubXNnQmFja2VuZCA9PT0gJ3VwaSdcbiAgICAgICAgPyB7IC4uLm1lc3NhZ2VUeXBlcywgLi4uYWRkTXNnVHlwZXMgfVxuICAgICAgICA6IG1lc3NhZ2VUeXBlc1xuXG4gICAgdGhpcy51cGkgPSByZWdpc3Rlcih7XG4gICAgICBuYW1lOiAnaGFza2VsbC1naGMtbW9kJyxcbiAgICAgIG1lbnU6IG1haW5NZW51LFxuICAgICAgbWVzc2FnZVR5cGVzOiBtc2dUeXBlcyxcbiAgICAgIHRvb2x0aXA6IHRoaXMuc2hvdWxkU2hvd1Rvb2x0aXAuYmluZCh0aGlzKSxcbiAgICAgIGV2ZW50czoge1xuICAgICAgICBvbkRpZFNhdmVCdWZmZXI6IGFzeW5jIChidWZmZXIpID0+XG4gICAgICAgICAgdGhpcy5jaGVja0xpbnQoXG4gICAgICAgICAgICBidWZmZXIsXG4gICAgICAgICAgICAnU2F2ZScsXG4gICAgICAgICAgICBhdG9tLmNvbmZpZy5nZXQoJ2hhc2tlbGwtZ2hjLW1vZC5hbHdheXNJbnRlcmFjdGl2ZUNoZWNrJyksXG4gICAgICAgICAgKSxcbiAgICAgICAgb25EaWRTdG9wQ2hhbmdpbmc6IGFzeW5jIChidWZmZXIpID0+XG4gICAgICAgICAgdGhpcy5jaGVja0xpbnQoYnVmZmVyLCAnQ2hhbmdlJywgdHJ1ZSksXG4gICAgICB9LFxuICAgIH0pXG5cbiAgICB0aGlzLmRpc3Bvc2FibGVzLmFkZChcbiAgICAgIHRoaXMudXBpLFxuICAgICAgdGhpcy5wcm9jZXNzLm9uQmFja2VuZEFjdGl2ZSgoKSA9PlxuICAgICAgICB0aGlzLnVwaS5zZXRTdGF0dXMoeyBzdGF0dXM6ICdwcm9ncmVzcycsIGRldGFpbDogJycgfSksXG4gICAgICApLFxuICAgICAgdGhpcy5wcm9jZXNzLm9uQmFja2VuZElkbGUoKCkgPT5cbiAgICAgICAgdGhpcy51cGkuc2V0U3RhdHVzKHsgc3RhdHVzOiAncmVhZHknLCBkZXRhaWw6ICcnIH0pLFxuICAgICAgKSxcbiAgICAgIGF0b20uY29tbWFuZHMuYWRkKGNvbnRleHRTY29wZSwgdGhpcy5nbG9iYWxDb21tYW5kcyksXG4gICAgKVxuICAgIGNvbnN0IGNtID0ge31cbiAgICBjbVtjb250ZXh0U2NvcGVdID0gW3RoaXMuY29udGV4dE1lbnVdXG4gICAgdGhpcy5kaXNwb3NhYmxlcy5hZGQoYXRvbS5jb250ZXh0TWVudS5hZGQoY20pKVxuICB9XG5cbiAgcHVibGljIGRpc3Bvc2UoKSB7XG4gICAgdGhpcy5kaXNwb3NhYmxlcy5kaXNwb3NlKClcbiAgfVxuXG4gIHByaXZhdGUgYXN5bmMgc2hvdWxkU2hvd1Rvb2x0aXAoXG4gICAgZWRpdG9yOiBUZXh0RWRpdG9yLFxuICAgIGNyYW5nZTogUmFuZ2UsXG4gICAgdHlwZTogVVBJLlRFdmVudFJhbmdlVHlwZSxcbiAgKTogUHJvbWlzZTxVUEkuSVRvb2x0aXBEYXRhIHwgdW5kZWZpbmVkPiB7XG4gICAgY29uc3QgbiA9XG4gICAgICB0eXBlID09PSAnbW91c2UnXG4gICAgICAgID8gJ2hhc2tlbGwtZ2hjLW1vZC5vbk1vdXNlSG92ZXJTaG93J1xuICAgICAgICA6IHR5cGUgPT09ICdzZWxlY3Rpb24nID8gJ2hhc2tlbGwtZ2hjLW1vZC5vblNlbGVjdGlvblNob3cnIDogdW5kZWZpbmVkXG4gICAgY29uc3QgdCA9IG4gJiYgYXRvbS5jb25maWcuZ2V0KG4pXG4gICAgLy8gdHNsaW50OmRpc2FibGUtbmV4dC1saW5lOm5vLXVuc2FmZS1hbnlcbiAgICBpZiAodCkgcmV0dXJuIHRoaXNbYCR7dH1Ub29sdGlwYF0oZWRpdG9yLCBjcmFuZ2UpXG4gICAgZWxzZSByZXR1cm4gdW5kZWZpbmVkXG4gIH1cblxuICBAaGFuZGxlRXhjZXB0aW9uXG4gIHByaXZhdGUgYXN5bmMgY2hlY2tDb21tYW5kKHsgY3VycmVudFRhcmdldCB9OiBURUNvbW1hbmRFdmVudCkge1xuICAgIGNvbnN0IGVkaXRvciA9IGN1cnJlbnRUYXJnZXQuZ2V0TW9kZWwoKVxuICAgIGNvbnN0IHJlcyA9IGF3YWl0IHRoaXMucHJvY2Vzcy5kb0NoZWNrQnVmZmVyKFxuICAgICAgZWRpdG9yLmdldEJ1ZmZlcigpLFxuICAgICAgYXRvbS5jb25maWcuZ2V0KCdoYXNrZWxsLWdoYy1tb2QuYWx3YXlzSW50ZXJhY3RpdmVDaGVjaycpLFxuICAgIClcbiAgICB0aGlzLnNldE1lc3NhZ2VzKHJlcylcbiAgfVxuXG4gIEBoYW5kbGVFeGNlcHRpb25cbiAgcHJpdmF0ZSBhc3luYyBsaW50Q29tbWFuZCh7IGN1cnJlbnRUYXJnZXQgfTogVEVDb21tYW5kRXZlbnQpIHtcbiAgICBjb25zdCBlZGl0b3IgPSBjdXJyZW50VGFyZ2V0LmdldE1vZGVsKClcbiAgICBjb25zdCByZXMgPSBhd2FpdCB0aGlzLnByb2Nlc3MuZG9MaW50QnVmZmVyKGVkaXRvci5nZXRCdWZmZXIoKSlcbiAgICB0aGlzLnNldE1lc3NhZ2VzKHJlcylcbiAgfVxuXG4gIHByaXZhdGUgdG9vbHRpcENvbW1hbmQoXG4gICAgdG9vbHRpcGZ1bjogKGU6IFRleHRFZGl0b3IsIHA6IFJhbmdlKSA9PiBQcm9taXNlPFVQSS5JVG9vbHRpcERhdGE+LFxuICApIHtcbiAgICByZXR1cm4gYXN5bmMgKHsgY3VycmVudFRhcmdldCwgZGV0YWlsIH06IFRFQ29tbWFuZEV2ZW50KSA9PlxuICAgICAgdGhpcy51cGkuc2hvd1Rvb2x0aXAoe1xuICAgICAgICBlZGl0b3I6IGN1cnJlbnRUYXJnZXQuZ2V0TW9kZWwoKSxcbiAgICAgICAgZGV0YWlsLFxuICAgICAgICBhc3luYyB0b29sdGlwKGNyYW5nZSkge1xuICAgICAgICAgIHJldHVybiB0b29sdGlwZnVuKGN1cnJlbnRUYXJnZXQuZ2V0TW9kZWwoKSwgY3JhbmdlKVxuICAgICAgICB9LFxuICAgICAgfSlcbiAgfVxuXG4gIEBoYW5kbGVFeGNlcHRpb25cbiAgcHJpdmF0ZSBhc3luYyBpbnNlcnRUeXBlQ29tbWFuZCh7IGN1cnJlbnRUYXJnZXQsIGRldGFpbCB9OiBURUNvbW1hbmRFdmVudCkge1xuICAgIGNvbnN0IGVkaXRvciA9IGN1cnJlbnRUYXJnZXQuZ2V0TW9kZWwoKVxuICAgIGNvbnN0IGVyID0gdGhpcy51cGkuZ2V0RXZlbnRSYW5nZShlZGl0b3IsIGRldGFpbClcbiAgICBpZiAoZXIgPT09IHVuZGVmaW5lZCkge1xuICAgICAgcmV0dXJuXG4gICAgfVxuICAgIGNvbnN0IHsgY3JhbmdlLCBwb3MgfSA9IGVyXG4gICAgY29uc3Qgc3ltSW5mbyA9IFV0aWwuZ2V0U3ltYm9sQXRQb2ludChlZGl0b3IsIHBvcylcbiAgICBpZiAoIXN5bUluZm8pIHtcbiAgICAgIHJldHVyblxuICAgIH1cbiAgICBjb25zdCB7IHNjb3BlLCByYW5nZSwgc3ltYm9sIH0gPSBzeW1JbmZvXG4gICAgaWYgKHNjb3BlLnN0YXJ0c1dpdGgoJ2tleXdvcmQub3BlcmF0b3IuJykpIHtcbiAgICAgIHJldHVyblxuICAgIH0gLy8gY2FuJ3QgY29ycmVjdGx5IGhhbmRsZSBpbmZpeCBub3RhdGlvblxuICAgIGNvbnN0IHsgdHlwZSB9ID0gYXdhaXQgdGhpcy5wcm9jZXNzLmdldFR5cGVJbkJ1ZmZlcihcbiAgICAgIGVkaXRvci5nZXRCdWZmZXIoKSxcbiAgICAgIGNyYW5nZSxcbiAgICApXG4gICAgaWYgKFxuICAgICAgZWRpdG9yXG4gICAgICAgIC5nZXRUZXh0SW5CdWZmZXJSYW5nZShbXG4gICAgICAgICAgcmFuZ2UuZW5kLFxuICAgICAgICAgIGVkaXRvci5nZXRCdWZmZXIoKS5yYW5nZUZvclJvdyhyYW5nZS5lbmQucm93LCBmYWxzZSkuZW5kLFxuICAgICAgICBdKVxuICAgICAgICAubWF0Y2goLz0vKVxuICAgICkge1xuICAgICAgbGV0IGluZGVudCA9IGVkaXRvci5nZXRUZXh0SW5CdWZmZXJSYW5nZShbXG4gICAgICAgIFtyYW5nZS5zdGFydC5yb3csIDBdLFxuICAgICAgICByYW5nZS5zdGFydCxcbiAgICAgIF0pXG4gICAgICBsZXQgYmlyZFRyYWNrID0gJydcbiAgICAgIGlmIChcbiAgICAgICAgZWRpdG9yXG4gICAgICAgICAgLnNjb3BlRGVzY3JpcHRvckZvckJ1ZmZlclBvc2l0aW9uKHBvcylcbiAgICAgICAgICAuZ2V0U2NvcGVzQXJyYXkoKVxuICAgICAgICAgIC5pbmNsdWRlcygnbWV0YS5lbWJlZGRlZC5oYXNrZWxsJylcbiAgICAgICkge1xuICAgICAgICBiaXJkVHJhY2sgPSBpbmRlbnQuc2xpY2UoMCwgMilcbiAgICAgICAgaW5kZW50ID0gaW5kZW50LnNsaWNlKDIpXG4gICAgICB9XG4gICAgICBpZiAoaW5kZW50Lm1hdGNoKC9cXFMvKSkge1xuICAgICAgICBpbmRlbnQgPSBpbmRlbnQucmVwbGFjZSgvXFxTL2csICcgJylcbiAgICAgIH1cbiAgICAgIGVkaXRvci5zZXRUZXh0SW5CdWZmZXJSYW5nZShcbiAgICAgICAgW3JhbmdlLnN0YXJ0LCByYW5nZS5zdGFydF0sXG4gICAgICAgIGAke3N5bWJvbH0gOjogJHt0eXBlfVxcbiR7YmlyZFRyYWNrfSR7aW5kZW50fWAsXG4gICAgICApXG4gICAgfSBlbHNlIHtcbiAgICAgIGVkaXRvci5zZXRUZXh0SW5CdWZmZXJSYW5nZShcbiAgICAgICAgcmFuZ2UsXG4gICAgICAgIGAoJHtlZGl0b3IuZ2V0VGV4dEluQnVmZmVyUmFuZ2UocmFuZ2UpfSA6OiAke3R5cGV9KWAsXG4gICAgICApXG4gICAgfVxuICB9XG5cbiAgQGhhbmRsZUV4Y2VwdGlvblxuICBwcml2YXRlIGFzeW5jIGNhc2VTcGxpdENvbW1hbmQoeyBjdXJyZW50VGFyZ2V0LCBkZXRhaWwgfTogVEVDb21tYW5kRXZlbnQpIHtcbiAgICBjb25zdCBlZGl0b3IgPSBjdXJyZW50VGFyZ2V0LmdldE1vZGVsKClcbiAgICBjb25zdCBldnIgPSB0aGlzLnVwaS5nZXRFdmVudFJhbmdlKGVkaXRvciwgZGV0YWlsKVxuICAgIGlmICghZXZyKSB7XG4gICAgICByZXR1cm5cbiAgICB9XG4gICAgY29uc3QgeyBjcmFuZ2UgfSA9IGV2clxuICAgIGNvbnN0IHJlcyA9IGF3YWl0IHRoaXMucHJvY2Vzcy5kb0Nhc2VTcGxpdChlZGl0b3IuZ2V0QnVmZmVyKCksIGNyYW5nZSlcbiAgICBmb3IgKGNvbnN0IHsgcmFuZ2UsIHJlcGxhY2VtZW50IH0gb2YgcmVzKSB7XG4gICAgICBlZGl0b3Iuc2V0VGV4dEluQnVmZmVyUmFuZ2UocmFuZ2UsIHJlcGxhY2VtZW50KVxuICAgIH1cbiAgfVxuXG4gIEBoYW5kbGVFeGNlcHRpb25cbiAgcHJpdmF0ZSBhc3luYyBzaWdGaWxsQ29tbWFuZCh7IGN1cnJlbnRUYXJnZXQsIGRldGFpbCB9OiBURUNvbW1hbmRFdmVudCkge1xuICAgIGNvbnN0IGVkaXRvciA9IGN1cnJlbnRUYXJnZXQuZ2V0TW9kZWwoKVxuICAgIGNvbnN0IGV2ciA9IHRoaXMudXBpLmdldEV2ZW50UmFuZ2UoZWRpdG9yLCBkZXRhaWwpXG4gICAgaWYgKCFldnIpIHtcbiAgICAgIHJldHVyblxuICAgIH1cbiAgICBjb25zdCB7IGNyYW5nZSB9ID0gZXZyXG4gICAgY29uc3QgcmVzID0gYXdhaXQgdGhpcy5wcm9jZXNzLmRvU2lnRmlsbChlZGl0b3IuZ2V0QnVmZmVyKCksIGNyYW5nZSlcblxuICAgIGVkaXRvci50cmFuc2FjdCgoKSA9PiB7XG4gICAgICBjb25zdCB7IHR5cGUsIHJhbmdlLCBib2R5IH0gPSByZXNcbiAgICAgIGNvbnN0IHNpZyA9IGVkaXRvci5nZXRUZXh0SW5CdWZmZXJSYW5nZShyYW5nZSlcbiAgICAgIGxldCBpbmRlbnQgPSBlZGl0b3IuaW5kZW50TGV2ZWxGb3JMaW5lKHNpZylcbiAgICAgIGNvbnN0IHBvcyA9IHJhbmdlLmVuZFxuICAgICAgY29uc3QgdGV4dCA9IGBcXG4ke2JvZHl9YFxuICAgICAgaWYgKHR5cGUgPT09ICdpbnN0YW5jZScpIHtcbiAgICAgICAgaW5kZW50ICs9IDFcbiAgICAgICAgaWYgKCFzaWcuZW5kc1dpdGgoJyB3aGVyZScpKSB7XG4gICAgICAgICAgZWRpdG9yLnNldFRleHRJbkJ1ZmZlclJhbmdlKFtyYW5nZS5lbmQsIHJhbmdlLmVuZF0sICcgd2hlcmUnKVxuICAgICAgICB9XG4gICAgICB9XG4gICAgICBjb25zdCBuZXdyYW5nZSA9IGVkaXRvci5zZXRUZXh0SW5CdWZmZXJSYW5nZShbcG9zLCBwb3NdLCB0ZXh0KVxuICAgICAgbmV3cmFuZ2VcbiAgICAgICAgLmdldFJvd3MoKVxuICAgICAgICAuc2xpY2UoMSlcbiAgICAgICAgLm1hcCgocm93KSA9PiBlZGl0b3Iuc2V0SW5kZW50YXRpb25Gb3JCdWZmZXJSb3cocm93LCBpbmRlbnQpKVxuICAgIH0pXG4gIH1cblxuICBAaGFuZGxlRXhjZXB0aW9uXG4gIHByaXZhdGUgYXN5bmMgZ29Ub0RlY2xDb21tYW5kKHsgY3VycmVudFRhcmdldCwgZGV0YWlsIH06IFRFQ29tbWFuZEV2ZW50KSB7XG4gICAgY29uc3QgZWRpdG9yID0gY3VycmVudFRhcmdldC5nZXRNb2RlbCgpXG4gICAgY29uc3QgZXZyID0gdGhpcy51cGkuZ2V0RXZlbnRSYW5nZShlZGl0b3IsIGRldGFpbClcbiAgICBpZiAoIWV2cikge1xuICAgICAgcmV0dXJuXG4gICAgfVxuICAgIGNvbnN0IHsgY3JhbmdlIH0gPSBldnJcbiAgICBjb25zdCB7IGluZm8gfSA9IGF3YWl0IHRoaXMucHJvY2Vzcy5nZXRJbmZvSW5CdWZmZXIoZWRpdG9yLCBjcmFuZ2UpXG4gICAgY29uc3QgcmVzID0gLy4qLS0gRGVmaW5lZCBhdCAoLispOihcXGQrKTooXFxkKykvLmV4ZWMoaW5mbylcbiAgICBpZiAoIXJlcykge1xuICAgICAgcmV0dXJuXG4gICAgfVxuICAgIGNvbnN0IFtmbiwgbGluZSwgY29sXSA9IHJlcy5zbGljZSgxKVxuICAgIGNvbnN0IHJvb3REaXIgPSBhd2FpdCB0aGlzLnByb2Nlc3MuZ2V0Um9vdERpcihlZGl0b3IuZ2V0QnVmZmVyKCkpXG4gICAgaWYgKCFyb290RGlyKSB7XG4gICAgICByZXR1cm5cbiAgICB9XG4gICAgY29uc3QgdXJpID0gcm9vdERpci5nZXRGaWxlKGZuKS5nZXRQYXRoKCkgfHwgZm5cbiAgICBhd2FpdCBhdG9tLndvcmtzcGFjZS5vcGVuKHVyaSwge1xuICAgICAgaW5pdGlhbExpbmU6IHBhcnNlSW50KGxpbmUsIDEwKSAtIDEsXG4gICAgICBpbml0aWFsQ29sdW1uOiBwYXJzZUludChjb2wsIDEwKSAtIDEsXG4gICAgfSlcbiAgfVxuXG4gIEBoYW5kbGVFeGNlcHRpb25cbiAgcHJpdmF0ZSBhc3luYyBpbnNlcnRJbXBvcnRDb21tYW5kKHsgY3VycmVudFRhcmdldCwgZGV0YWlsIH06IFRFQ29tbWFuZEV2ZW50KSB7XG4gICAgY29uc3QgZWRpdG9yID0gY3VycmVudFRhcmdldC5nZXRNb2RlbCgpXG4gICAgY29uc3QgYnVmZmVyID0gZWRpdG9yLmdldEJ1ZmZlcigpXG4gICAgY29uc3QgZXZyID0gdGhpcy51cGkuZ2V0RXZlbnRSYW5nZShlZGl0b3IsIGRldGFpbClcbiAgICBpZiAoIWV2cikge1xuICAgICAgcmV0dXJuXG4gICAgfVxuICAgIGNvbnN0IHsgY3JhbmdlIH0gPSBldnJcbiAgICBjb25zdCBsaW5lcyA9IGF3YWl0IHRoaXMucHJvY2Vzcy5maW5kU3ltYm9sUHJvdmlkZXJzSW5CdWZmZXIoZWRpdG9yLCBjcmFuZ2UpXG4gICAgY29uc3QgbW9kID0gYXdhaXQgaW1wb3J0TGlzdFZpZXcobGluZXMpXG4gICAgaWYgKG1vZCkge1xuICAgICAgY29uc3QgcGkgPSBhd2FpdCBuZXcgUHJvbWlzZTx7IHBvczogUG9pbnQ7IGluZGVudDogc3RyaW5nOyBlbmQ6IHN0cmluZyB9PihcbiAgICAgICAgKHJlc29sdmUpID0+IHtcbiAgICAgICAgICBidWZmZXIuYmFja3dhcmRzU2NhbigvXihcXHMqKShpbXBvcnR8bW9kdWxlKS8sICh7IG1hdGNoLCByYW5nZSB9KSA9PiB7XG4gICAgICAgICAgICBsZXQgaW5kZW50ID0gJydcbiAgICAgICAgICAgIHN3aXRjaCAobWF0Y2hbMl0pIHtcbiAgICAgICAgICAgICAgY2FzZSAnaW1wb3J0JzpcbiAgICAgICAgICAgICAgICBpbmRlbnQgPSBgXFxuJHttYXRjaFsxXX1gXG4gICAgICAgICAgICAgICAgYnJlYWtcbiAgICAgICAgICAgICAgY2FzZSAnbW9kdWxlJzpcbiAgICAgICAgICAgICAgICBpbmRlbnQgPSBgXFxuXFxuJHttYXRjaFsxXX1gXG4gICAgICAgICAgICAgICAgYnJlYWtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHJlc29sdmUoe1xuICAgICAgICAgICAgICBwb3M6IGJ1ZmZlci5yYW5nZUZvclJvdyhyYW5nZS5zdGFydC5yb3csIGZhbHNlKS5lbmQsXG4gICAgICAgICAgICAgIGluZGVudCxcbiAgICAgICAgICAgICAgZW5kOiAnJyxcbiAgICAgICAgICAgIH0pXG4gICAgICAgICAgfSlcbiAgICAgICAgICAvLyBub3RoaW5nIGZvdW5kXG4gICAgICAgICAgcmVzb2x2ZSh7XG4gICAgICAgICAgICBwb3M6IGJ1ZmZlci5nZXRGaXJzdFBvc2l0aW9uKCksXG4gICAgICAgICAgICBpbmRlbnQ6ICcnLFxuICAgICAgICAgICAgZW5kOiAnXFxuJyxcbiAgICAgICAgICB9KVxuICAgICAgICB9LFxuICAgICAgKVxuICAgICAgZWRpdG9yLnNldFRleHRJbkJ1ZmZlclJhbmdlKFxuICAgICAgICBbcGkucG9zLCBwaS5wb3NdLFxuICAgICAgICBgJHtwaS5pbmRlbnR9aW1wb3J0ICR7bW9kfSR7cGkuZW5kfWAsXG4gICAgICApXG4gICAgfVxuICB9XG5cbiAgcHJpdmF0ZSBhc3luYyB0eXBlVG9vbHRpcChlOiBUZXh0RWRpdG9yLCBwOiBSYW5nZSkge1xuICAgIGNvbnN0IHsgcmFuZ2UsIHR5cGUgfSA9IGF3YWl0IHRoaXMucHJvY2Vzcy5nZXRUeXBlSW5CdWZmZXIoZS5nZXRCdWZmZXIoKSwgcClcbiAgICByZXR1cm4ge1xuICAgICAgcmFuZ2UsXG4gICAgICB0ZXh0OiB7XG4gICAgICAgIHRleHQ6IHR5cGUsXG4gICAgICAgIGhpZ2hsaWdodGVyOiBhdG9tLmNvbmZpZy5nZXQoJ2hhc2tlbGwtZ2hjLW1vZC5oaWdobGlnaHRUb29sdGlwcycpXG4gICAgICAgICAgPyAnaGludC50eXBlLmhhc2tlbGwnXG4gICAgICAgICAgOiB1bmRlZmluZWQsXG4gICAgICB9LFxuICAgIH1cbiAgfVxuXG4gIHByaXZhdGUgYXN5bmMgaW5mb1Rvb2x0aXAoZTogVGV4dEVkaXRvciwgcDogUmFuZ2UpIHtcbiAgICBjb25zdCB7IHJhbmdlLCBpbmZvIH0gPSBhd2FpdCB0aGlzLnByb2Nlc3MuZ2V0SW5mb0luQnVmZmVyKGUsIHApXG4gICAgcmV0dXJuIHtcbiAgICAgIHJhbmdlLFxuICAgICAgdGV4dDoge1xuICAgICAgICB0ZXh0OiBpbmZvLFxuICAgICAgICBoaWdobGlnaHRlcjogYXRvbS5jb25maWcuZ2V0KCdoYXNrZWxsLWdoYy1tb2QuaGlnaGxpZ2h0VG9vbHRpcHMnKVxuICAgICAgICAgID8gJ3NvdXJjZS5oYXNrZWxsJ1xuICAgICAgICAgIDogdW5kZWZpbmVkLFxuICAgICAgfSxcbiAgICB9XG4gIH1cblxuICBwcml2YXRlIGFzeW5jIGluZm9UeXBlVG9vbHRpcChlOiBUZXh0RWRpdG9yLCBwOiBSYW5nZSkge1xuICAgIHRyeSB7XG4gICAgICByZXR1cm4gYXdhaXQgdGhpcy5pbmZvVG9vbHRpcChlLCBwKVxuICAgIH0gY2F0Y2gge1xuICAgICAgcmV0dXJuIHRoaXMudHlwZVRvb2x0aXAoZSwgcClcbiAgICB9XG4gIH1cblxuICBwcml2YXRlIGFzeW5jIHR5cGVJbmZvVG9vbHRpcChlOiBUZXh0RWRpdG9yLCBwOiBSYW5nZSkge1xuICAgIHRyeSB7XG4gICAgICByZXR1cm4gYXdhaXQgdGhpcy50eXBlVG9vbHRpcChlLCBwKVxuICAgIH0gY2F0Y2gge1xuICAgICAgcmV0dXJuIHRoaXMuaW5mb1Rvb2x0aXAoZSwgcClcbiAgICB9XG4gIH1cblxuICBwcml2YXRlIGFzeW5jIHR5cGVBbmRJbmZvVG9vbHRpcChlOiBUZXh0RWRpdG9yLCBwOiBSYW5nZSkge1xuICAgIGNvbnN0IHR5cGVQID0gdGhpcy50eXBlVG9vbHRpcChlLCBwKS5jYXRjaCgoKSA9PiB1bmRlZmluZWQpXG4gICAgY29uc3QgaW5mb1AgPSB0aGlzLmluZm9Ub29sdGlwKGUsIHApLmNhdGNoKCgpID0+IHVuZGVmaW5lZClcbiAgICBjb25zdCBbdHlwZSwgaW5mb10gPSBhd2FpdCBQcm9taXNlLmFsbChbdHlwZVAsIGluZm9QXSlcbiAgICBsZXQgcmFuZ2U6IFJhbmdlXG4gICAgbGV0IHRleHQ6IHN0cmluZ1xuICAgIGlmICh0eXBlICYmIGluZm8pIHtcbiAgICAgIHJhbmdlID0gdHlwZS5yYW5nZS51bmlvbihpbmZvLnJhbmdlKVxuICAgICAgY29uc3Qgc3VwID0gYXRvbS5jb25maWcuZ2V0KFxuICAgICAgICAnaGFza2VsbC1naGMtbW9kLnN1cHByZXNzUmVkdW5kYW50VHlwZUluVHlwZUFuZEluZm9Ub29sdGlwcycsXG4gICAgICApXG4gICAgICBpZiAoc3VwICYmIGluZm8udGV4dC50ZXh0LmluY2x1ZGVzKGA6OiAke3R5cGUudGV4dC50ZXh0fWApKSB7XG4gICAgICAgIHRleHQgPSBpbmZvLnRleHQudGV4dFxuICAgICAgfSBlbHNlIHtcbiAgICAgICAgdGV4dCA9IGA6OiAke3R5cGUudGV4dC50ZXh0fVxcbiR7aW5mby50ZXh0LnRleHR9YFxuICAgICAgfVxuICAgIH0gZWxzZSBpZiAodHlwZSkge1xuICAgICAgcmFuZ2UgPSB0eXBlLnJhbmdlXG4gICAgICB0ZXh0ID0gYDo6ICR7dHlwZS50ZXh0LnRleHR9YFxuICAgIH0gZWxzZSBpZiAoaW5mbykge1xuICAgICAgcmFuZ2UgPSBpbmZvLnJhbmdlXG4gICAgICB0ZXh0ID0gaW5mby50ZXh0LnRleHRcbiAgICB9IGVsc2Uge1xuICAgICAgdGhyb3cgbmV3IEVycm9yKCdHb3QgbmVpdGhlciB0eXBlIG5vciBpbmZvJylcbiAgICB9XG4gICAgY29uc3QgaGlnaGxpZ2h0ZXIgPSBhdG9tLmNvbmZpZy5nZXQoJ2hhc2tlbGwtZ2hjLW1vZC5oaWdobGlnaHRUb29sdGlwcycpXG4gICAgICA/ICdzb3VyY2UuaGFza2VsbCdcbiAgICAgIDogdW5kZWZpbmVkXG4gICAgcmV0dXJuIHsgcmFuZ2UsIHRleHQ6IHsgdGV4dCwgaGlnaGxpZ2h0ZXIgfSB9XG4gIH1cblxuICBwcml2YXRlIHNldEhpZ2hsaWdodGVyKCkge1xuICAgIGlmIChhdG9tLmNvbmZpZy5nZXQoJ2hhc2tlbGwtZ2hjLW1vZC5oaWdobGlnaHRNZXNzYWdlcycpKSB7XG4gICAgICByZXR1cm4gKG06IFVQSS5JUmVzdWx0SXRlbSk6IFVQSS5JUmVzdWx0SXRlbSA9PiB7XG4gICAgICAgIGlmICh0eXBlb2YgbS5tZXNzYWdlID09PSAnc3RyaW5nJykge1xuICAgICAgICAgIGNvbnN0IG1lc3NhZ2U6IFVQSS5JTWVzc2FnZVRleHQgPSB7XG4gICAgICAgICAgICB0ZXh0OiBtLm1lc3NhZ2UsXG4gICAgICAgICAgICBoaWdobGlnaHRlcjogJ2hpbnQubWVzc2FnZS5oYXNrZWxsJyxcbiAgICAgICAgICB9XG4gICAgICAgICAgcmV0dXJuIHsgLi4ubSwgbWVzc2FnZSB9XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgcmV0dXJuIG1cbiAgICAgICAgfVxuICAgICAgfVxuICAgIH0gZWxzZSB7XG4gICAgICByZXR1cm4gKG06IFVQSS5JUmVzdWx0SXRlbSkgPT4gbVxuICAgIH1cbiAgfVxuXG4gIHByaXZhdGUgc2V0TWVzc2FnZXMobWVzc2FnZXM6IFVQSS5JUmVzdWx0SXRlbVtdKSB7XG4gICAgdGhpcy5sYXN0TWVzc2FnZXMgPSBtZXNzYWdlcy5tYXAodGhpcy5zZXRIaWdobGlnaHRlcigpKVxuICAgIHRoaXMuc2VuZE1lc3NhZ2VzKClcbiAgfVxuXG4gIHByaXZhdGUgc2VuZE1lc3NhZ2VzKCkge1xuICAgIHRoaXMudXBpLnNldE1lc3NhZ2VzKHRoaXMucHJvY2Vzc01lc3NhZ2VzLmNvbmNhdCh0aGlzLmxhc3RNZXNzYWdlcykpXG4gIH1cblxuICBwcml2YXRlIGFzeW5jIGNoZWNrTGludChcbiAgICBidWZmZXI6IFRleHRCdWZmZXIsXG4gICAgb3B0OiAnU2F2ZScgfCAnQ2hhbmdlJyxcbiAgICBmYXN0OiBib29sZWFuLFxuICApIHtcbiAgICBjb25zdCBjaGVjayA9IGF0b20uY29uZmlnLmdldChgaGFza2VsbC1naGMtbW9kLm9uJHtvcHR9Q2hlY2tgIGFzXG4gICAgICB8ICdoYXNrZWxsLWdoYy1tb2Qub25TYXZlQ2hlY2snXG4gICAgICB8ICdoYXNrZWxsLWdoYy1tb2Qub25DaGFuZ2VDaGVjaycpXG4gICAgY29uc3QgbGludCA9IGF0b20uY29uZmlnLmdldChgaGFza2VsbC1naGMtbW9kLm9uJHtvcHR9TGludGAgYXNcbiAgICAgIHwgJ2hhc2tlbGwtZ2hjLW1vZC5vblNhdmVMaW50J1xuICAgICAgfCAnaGFza2VsbC1naGMtbW9kLm9uQ2hhbmdlTGludCcpXG4gICAgbGV0IHJlc1xuICAgIGlmIChjaGVjayAmJiBsaW50KSB7XG4gICAgICByZXMgPSBhd2FpdCB0aGlzLnByb2Nlc3MuZG9DaGVja0FuZExpbnQoYnVmZmVyLCBmYXN0KVxuICAgIH0gZWxzZSBpZiAoY2hlY2spIHtcbiAgICAgIHJlcyA9IGF3YWl0IHRoaXMucHJvY2Vzcy5kb0NoZWNrQnVmZmVyKGJ1ZmZlciwgZmFzdClcbiAgICB9IGVsc2UgaWYgKGxpbnQpIHtcbiAgICAgIHJlcyA9IGF3YWl0IHRoaXMucHJvY2Vzcy5kb0xpbnRCdWZmZXIoYnVmZmVyKVxuICAgIH1cbiAgICBpZiAocmVzKSB7XG4gICAgICB0aGlzLnNldE1lc3NhZ2VzKHJlcylcbiAgICB9XG4gIH1cblxuICBwcml2YXRlIGNvbnNvbGVSZXBvcnQoYXJnOiBJRXJyb3JDYWxsYmFja0FyZ3MpIHtcbiAgICAvLyB0c2xpbnQ6ZGlzYmFsZS1uZXh0LWxpbmU6IG5vLWNvbnNvbGVcbiAgICBjb25zb2xlLmVycm9yKFV0aWwuZm9ybWF0RXJyb3IoYXJnKSwgVXRpbC5nZXRFcnJvckRldGFpbChhcmcpKVxuICB9XG5cbiAgcHJpdmF0ZSBoYW5kbGVQcm9jZXNzRXJyb3IoYXJnOiBJRXJyb3JDYWxsYmFja0FyZ3MpIHtcbiAgICBzd2l0Y2ggKHRoaXMubXNnQmFja2VuZCkge1xuICAgICAgY2FzZSAndXBpJzpcbiAgICAgICAgdGhpcy5wcm9jZXNzTWVzc2FnZXMucHVzaCh7XG4gICAgICAgICAgbWVzc2FnZTpcbiAgICAgICAgICAgIFV0aWwuZm9ybWF0RXJyb3IoYXJnKSArXG4gICAgICAgICAgICAnXFxuXFxuU2VlIGNvbnNvbGUgKFZpZXcg4oaSIERldmVsb3BlciDihpIgVG9nZ2xlIERldmVsb3BlciBUb29scyDihpIgQ29uc29sZSB0YWIpIGZvciBkZXRhaWxzLicsXG4gICAgICAgICAgc2V2ZXJpdHk6ICdnaGMtbW9kJyxcbiAgICAgICAgfSlcbiAgICAgICAgdGhpcy5jb25zb2xlUmVwb3J0KGFyZylcbiAgICAgICAgdGhpcy5zZW5kTWVzc2FnZXMoKVxuICAgICAgICBicmVha1xuICAgICAgY2FzZSAnY29uc29sZSc6XG4gICAgICAgIHRoaXMuY29uc29sZVJlcG9ydChhcmcpXG4gICAgICAgIGJyZWFrXG4gICAgICBjYXNlICdwb3B1cCc6XG4gICAgICAgIHRoaXMuY29uc29sZVJlcG9ydChhcmcpXG4gICAgICAgIGF0b20ubm90aWZpY2F0aW9ucy5hZGRFcnJvcihVdGlsLmZvcm1hdEVycm9yKGFyZyksIHtcbiAgICAgICAgICBkZXRhaWw6IFV0aWwuZ2V0RXJyb3JEZXRhaWwoYXJnKSxcbiAgICAgICAgICBkaXNtaXNzYWJsZTogdHJ1ZSxcbiAgICAgICAgfSlcbiAgICAgICAgYnJlYWtcbiAgICB9XG4gIH1cblxuICBwcml2YXRlIGhhbmRsZVByb2Nlc3NXYXJuaW5nKHdhcm5pbmc6IHN0cmluZykge1xuICAgIHN3aXRjaCAodGhpcy5tc2dCYWNrZW5kKSB7XG4gICAgICBjYXNlICd1cGknOlxuICAgICAgICB0aGlzLnByb2Nlc3NNZXNzYWdlcy5wdXNoKHtcbiAgICAgICAgICBtZXNzYWdlOiB3YXJuaW5nLFxuICAgICAgICAgIHNldmVyaXR5OiAnZ2hjLW1vZCcsXG4gICAgICAgIH0pXG4gICAgICAgIFV0aWwud2Fybih3YXJuaW5nKVxuICAgICAgICB0aGlzLnNlbmRNZXNzYWdlcygpXG4gICAgICAgIGJyZWFrXG4gICAgICBjYXNlICdjb25zb2xlJzpcbiAgICAgICAgVXRpbC53YXJuKHdhcm5pbmcpXG4gICAgICAgIGJyZWFrXG4gICAgICBjYXNlICdwb3B1cCc6XG4gICAgICAgIFV0aWwud2Fybih3YXJuaW5nKVxuICAgICAgICBhdG9tLm5vdGlmaWNhdGlvbnMuYWRkV2FybmluZyh3YXJuaW5nLCB7XG4gICAgICAgICAgZGlzbWlzc2FibGU6IGZhbHNlLFxuICAgICAgICB9KVxuICAgICAgICBicmVha1xuICAgIH1cbiAgfVxufVxuIl19