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
const interactive_process_1 = require("./interactive-process");
const Util = require("../util");
const { debug, warn, mkError, withTempFile, EOT } = Util;
const _ = require("underscore");
class GhcModiProcessReal {
    constructor(caps, rootDir, options) {
        this.caps = caps;
        this.rootDir = rootDir;
        this.options = options;
        this.disposables = new atom_1.CompositeDisposable();
        this.emitter = new atom_1.Emitter();
        this.disposables.add(this.emitter);
    }
    run({ interactive, command, text, uri, dashArgs, args, suppressErrors, ghcOptions, ghcModOptions }) {
        return __awaiter(this, void 0, void 0, function* () {
            if (!args) {
                args = [];
            }
            if (!dashArgs) {
                dashArgs = [];
            }
            if (!suppressErrors) {
                suppressErrors = false;
            }
            if (!ghcOptions) {
                ghcOptions = [];
            }
            if (!ghcModOptions) {
                ghcModOptions = [];
            }
            ghcModOptions = ghcModOptions.concat(...ghcOptions.map((opt) => ['--ghc-option', opt]));
            if (atom.config.get('haskell-ghc-mod.lowMemorySystem')) {
                interactive = atom.config.get('haskell-ghc-mod.enableGhcModi');
            }
            if (this.caps.optparse) {
                args = dashArgs.concat(['--']).concat(args);
            }
            else {
                args = dashArgs.concat(args);
            }
            const fun = interactive ? this.runModiCmd.bind(this) : this.runModCmd.bind(this);
            try {
                let res;
                if (uri && text && !this.caps.fileMap) {
                    const myOpts = { ghcModOptions, command, args };
                    res = withTempFile(text, uri, (tempuri) => __awaiter(this, void 0, void 0, function* () {
                        const { stdout, stderr } = yield fun(Object.assign({}, myOpts, { uri: tempuri }));
                        return {
                            stdout: stdout.map((line) => line.split(tempuri).join(uri)),
                            stderr: stderr.map((line) => line.split(tempuri).join(uri))
                        };
                    }));
                }
                else {
                    res = fun({ ghcModOptions, command, text, uri, args });
                }
                const { stdout, stderr } = yield res;
                if (stderr.join('').length) {
                    atom.notifications.addWarning('ghc-mod warning', {
                        detail: stderr.join('\n')
                    });
                }
                return stdout.map((line) => line.replace(/\0/g, '\n'));
            }
            catch (err) {
                debug(err);
                if (err.name === 'InteractiveActionTimeout') {
                    atom.notifications.addError(`\
Haskell-ghc-mod: ghc-mod \
${interactive ? 'interactive ' : ''}command ${command} \
timed out. You can try to fix it by raising 'Interactive Action \
Timeout' setting in haskell-ghc-mod settings.`, {
                        detail: `\
caps: ${JSON.stringify(this.caps)}
URI: ${uri}
Args: ${command} ${dashArgs} -- ${args}
message: ${err.message}\
`,
                        stack: err.stack,
                        dismissable: true
                    });
                }
                else if (!suppressErrors) {
                    atom.notifications.addFatalError(`\
Haskell-ghc-mod: ghc-mod \
${interactive ? 'interactive ' : ''}command ${command} \
failed with error ${err.name}`, {
                        detail: `\
caps: ${JSON.stringify(this.caps)}
URI: ${uri}
Args: ${args}
message: ${err.message}
log:
${Util.getDebugLog()}\
`,
                        stack: err.stack,
                        dismissable: true
                    });
                }
                else {
                    console.error(err);
                }
                return [];
            }
        });
    }
    killProcess() {
        debug(`Killing ghc-modi process for ${this.rootDir.getPath()}`);
        this.proc && this.proc.kill();
    }
    destroy() {
        debug('GhcModiProcessBase destroying');
        this.killProcess();
        this.emitter.emit('did-destroy');
        this.disposables.dispose();
    }
    onDidDestroy(callback) {
        this.emitter.on('did-destroy', callback);
    }
    spawnProcess(ghcModOptions) {
        return __awaiter(this, void 0, void 0, function* () {
            if (!atom.config.get('haskell-ghc-mod.enableGhcModi')) {
                return;
            }
            debug(`Checking for ghc-modi in ${this.rootDir.getPath()}`);
            if (this.proc) {
                if (!_.isEqual(this.ghcModOptions, ghcModOptions)) {
                    debug(`Found running ghc-modi instance for ${this.rootDir.getPath()}, but ghcModOptions don't match. Old: `, this.ghcModOptions, ' new: ', ghcModOptions);
                    yield this.proc.kill();
                    return this.spawnProcess(ghcModOptions);
                }
                debug(`Found running ghc-modi instance for ${this.rootDir.getPath()}`);
                return this.proc;
            }
            debug(`Spawning new ghc-modi instance for ${this.rootDir.getPath()} with`, this.options);
            const modPath = atom.config.get('haskell-ghc-mod.ghcModPath');
            this.ghcModOptions = ghcModOptions;
            this.proc = new interactive_process_1.InteractiveProcess(modPath, ghcModOptions.concat(['legacy-interactive']), this.options, this.caps);
            this.proc.onceExit((code) => {
                debug(`ghc-modi for ${this.rootDir.getPath()} ended with ${code}`);
                return this.proc = undefined;
            });
            return this.proc;
        });
    }
    runModCmd({ ghcModOptions, command, text, uri, args }) {
        return __awaiter(this, void 0, void 0, function* () {
            const modPath = atom.config.get('haskell-ghc-mod.ghcModPath');
            const result = [];
            const err = [];
            let stdin;
            const cmd = [...ghcModOptions];
            if (text && uri) {
                cmd.push('--map-file', uri);
                stdin = `${text}${EOT}`;
            }
            cmd.push(command);
            if (uri) {
                cmd.push(uri);
            }
            cmd.push(...args);
            const { stdout, stderr } = yield Util.execPromise(modPath, cmd, this.options, stdin);
            return {
                stdout: stdout.split('\n').slice(0, -1),
                stderr: stderr.split('\n')
            };
        });
    }
    runModiCmd(o) {
        return __awaiter(this, void 0, void 0, function* () {
            const { ghcModOptions, command, text, args } = o;
            let { uri } = o;
            debug(`Trying to run ghc-modi in ${this.rootDir.getPath()}`);
            const proc = yield this.spawnProcess(ghcModOptions);
            if (!proc) {
                debug('Failed. Falling back to ghc-mod');
                return this.runModCmd(o);
            }
            debug('Success. Resuming...');
            if (uri && !this.caps.quoteArgs) {
                uri = this.rootDir.relativize(uri);
            }
            try {
                if (uri && text) {
                    yield proc.interact('map-file', [uri], text);
                }
                const res = yield proc.interact(command, uri ? [uri].concat(args) : args);
                if (uri && text) {
                    yield proc.interact('unmap-file', [uri]);
                }
                return res;
            }
            finally {
                if (uri && text) {
                    yield proc.interact('unmap-file', [uri]);
                }
            }
        });
    }
}
exports.GhcModiProcessReal = GhcModiProcessReal;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZ2hjLW1vZGktcHJvY2Vzcy1yZWFsLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vLi4vc3JjL2doYy1tb2QvZ2hjLW1vZGktcHJvY2Vzcy1yZWFsLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7Ozs7Ozs7Ozs7QUFPQSwrQkFBOEQ7QUFFOUQsK0RBQW9FO0FBQ3BFLGdDQUErQjtBQUMvQixNQUFNLEVBQUMsS0FBSyxFQUFFLElBQUksRUFBRSxPQUFPLEVBQUUsWUFBWSxFQUFFLEdBQUcsRUFBQyxHQUFHLElBQUksQ0FBQTtBQUV0RCxnQ0FBK0I7QUF1Qi9CO0lBTUUsWUFBcUIsSUFBZ0IsRUFBVSxPQUE0QixFQUFVLE9BQW1CO1FBQW5GLFNBQUksR0FBSixJQUFJLENBQVk7UUFBVSxZQUFPLEdBQVAsT0FBTyxDQUFxQjtRQUFVLFlBQU8sR0FBUCxPQUFPLENBQVk7UUFDdEcsSUFBSSxDQUFDLFdBQVcsR0FBRyxJQUFJLDBCQUFtQixFQUFFLENBQUE7UUFDNUMsSUFBSSxDQUFDLE9BQU8sR0FBRyxJQUFJLGNBQU8sRUFBRSxDQUFBO1FBQzVCLElBQUksQ0FBQyxXQUFXLENBQUMsR0FBRyxDQUFDLElBQUksQ0FBQyxPQUFPLENBQUMsQ0FBQTtJQUNwQyxDQUFDO0lBRVksR0FBRyxDQUNkLEVBQUMsV0FBVyxFQUFFLE9BQU8sRUFBRSxJQUFJLEVBQUUsR0FBRyxFQUFFLFFBQVEsRUFBRSxJQUFJLEVBQUUsY0FBYyxFQUFFLFVBQVUsRUFBRSxhQUFhLEVBQVU7O1lBRXJHLEVBQUUsQ0FBQyxDQUFDLENBQUUsSUFBSSxDQUFDLENBQUMsQ0FBQztnQkFBQyxJQUFJLEdBQUcsRUFBRSxDQUFBO1lBQUMsQ0FBQztZQUN6QixFQUFFLENBQUMsQ0FBQyxDQUFFLFFBQVEsQ0FBQyxDQUFDLENBQUM7Z0JBQUMsUUFBUSxHQUFHLEVBQUUsQ0FBQTtZQUFDLENBQUM7WUFDakMsRUFBRSxDQUFDLENBQUMsQ0FBRSxjQUFjLENBQUMsQ0FBQyxDQUFDO2dCQUFD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QUMsSUFBSSxDQUFDLEdBQUcsSUFBSSxDQUFDLENBQUE7Z0JBQ3pFLEVBQUUsQ0FBQyxDQUFDLEdBQUcsSUFBSSxJQUFJLENBQUMsQ0FBQyxDQUFDO29CQUNoQixNQUFNLElBQUksQ0FBQyxRQUFRLENBQUMsWUFBWSxFQUFFLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQTtnQkFDMUMsQ0FBQztnQkFDRCxNQUFNLENBQUMsR0FBRyxDQUFBO1lBQ1osQ0FBQztvQkFBUyxDQUFDO2dCQUNULEVBQUUsQ0FBQyxDQUFDLEdBQUcsSUFBSSxJQUFJLENBQUMsQ0FBQyxDQUFDO29CQUNoQixNQUFNLElBQUksQ0FBQyxRQUFRLENBQUMsWUFBWSxFQUFFLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQTtnQkFDMUMsQ0FBQztZQUNILENBQUM7UUFDSCxDQUFDO0tBQUE7Q0FDRjtBQWhNRCxnREFnTUMiLCJzb3VyY2VzQ29udGVudCI6WyIvKlxuICogZGVjYWZmZWluYXRlIHN1Z2dlc3Rpb25zOlxuICogRFMxMDE6IFJlbW92ZSB1bm5lY2Vzc2FyeSB1c2Ugb2YgQXJyYXkuZnJvbVxuICogRFMxMDI6IFJlbW92ZSB1bm5lY2Vzc2FyeSBjb2RlIGNyZWF0ZWQgYmVjYXVzZSBvZiBpbXBsaWNpdCByZXR1cm5zXG4gKiBEUzIwNzogQ29uc2lkZXIgc2hvcnRlciB2YXJpYXRpb25zIG9mIG51bGwgY2hlY2tzXG4gKiBGdWxsIGRvY3M6IGh0dHBzOi8vZ2l0aHViLmNvbS9kZWNhZmZlaW5hdGUvZGVjYWZmZWluYXRlL2Jsb2IvbWFzdGVyL2RvY3Mvc3VnZ2VzdGlvbnMubWRcbiAqL1xuaW1wb3J0IHsgRW1pdHRlciwgQ29tcG9zaXRlRGlzcG9zYWJsZSwgRGlyZWN0b3J5IH0gZnJvbSAnYXRvbSdcbmltcG9ydCAqIGFzIENQIGZyb20gJ2NoaWxkX3Byb2Nlc3MnXG5pbXBvcnQge0ludGVyYWN0aXZlUHJvY2VzcywgR0hDTW9kQ2Fwc30gZnJvbSAnLi9pbnRlcmFjdGl2ZS1wcm9jZXNzJ1xuaW1wb3J0ICogYXMgVXRpbCBmcm9tICcuLi91dGlsJ1xuY29uc3Qge2RlYnVnLCB3YXJuLCBta0Vycm9yLCB3aXRoVGVtcEZpbGUsIEVPVH0gPSBVdGlsXG5pbXBvcnQgeyBFT0wgfSBmcm9tICdvcydcbmltcG9ydCAqIGFzIF8gZnJvbSAndW5kZXJzY29yZSdcblxuZXhwb3J0IHsgR0hDTW9kQ2FwcyB9XG5cbmV4cG9ydCBpbnRlcmZhY2UgUnVuQXJncyB7XG4gIGludGVyYWN0aXZlPzogYm9vbGVhblxuICBjb21tYW5kOiBzdHJpbmdcbiAgdGV4dD86IHN0cmluZ1xuICB1cmk/OiBzdHJpbmdcbiAgZGFzaEFyZ3M/OiBzdHJpbmdbXVxuICBhcmdzPzogc3RyaW5nW11cbiAgc3VwcHJlc3NFcnJvcnM/OiBib29sZWFuXG4gIGdoY09wdGlvbnM/OiBzdHJpbmdbXVxuICBnaGNNb2RPcHRpb25zPzogc3RyaW5nW11cbn1cblxuZXhwb3J0IGludGVyZmFjZSBSdW5PcHRpb25zIHtcbiAgY3dkOiBzdHJpbmdcbiAgZW5jb2Rpbmc6ICd1dGY4J1xuICBlbnY6IHsgW2tleTogc3RyaW5nXTogc3RyaW5nIHwgdW5kZWZpbmVkIH1cbiAgbWF4QnVmZmVyOiBudW1iZXJcbn1cblxuZXhwb3J0IGNsYXNzIEdoY01vZGlQcm9jZXNzUmVhbCB7XG4gIHByaXZhdGUgZGlzcG9zYWJsZXM6IENvbXBvc2l0ZURpc3Bvc2FibGVcbiAgcHJpdmF0ZSBlbWl0dGVyOiBFbWl0dGVyXG4gIHByaXZhdGUgZ2hjTW9kT3B0aW9uczogc3RyaW5nW11cbiAgcHJpdmF0ZSBwcm9jOiBJbnRlcmFjdGl2ZVByb2Nlc3MgfCB1bmRlZmluZWRcblxuICBjb25zdHJ1Y3RvciAocHJpdmF0ZSBjYXBzOiBHSENNb2RDYXBzLCBwcml2YXRlIHJvb3REaXI6IEF0b21UeXBlcy5EaXJlY3RvcnksIHByaXZhdGUgb3B0aW9uczogUnVuT3B0aW9ucykge1xuICAgIHRoaXMuZGlzcG9zYWJsZXMgPSBuZXcgQ29tcG9zaXRlRGlzcG9zYWJsZSgpXG4gICAgdGhpcy5lbWl0dGVyID0gbmV3IEVtaXR0ZXIoKVxuICAgIHRoaXMuZGlzcG9zYWJsZXMuYWRkKHRoaXMuZW1pdHRlcilcbiAgfVxuXG4gIHB1YmxpYyBhc3luYyBydW4gKFxuICAgIHtpbnRlcmFjdGl2ZSwgY29tbWFuZCwgdGV4dCwgdXJpLCBkYXNoQXJncywgYXJncywgc3VwcHJlc3NFcnJvcnMsIGdoY09wdGlvbnMsIGdoY01vZE9wdGlvbnN9OiBSdW5BcmdzXG4gICkge1xuICAgIGlmICghIGFyZ3MpIHsgYXJncyA9IFtdIH1cbiAgICBpZiAoISBkYXNoQXJncykgeyBkYXNoQXJncyA9IFtdIH1cbiAgICBpZiAoISBzdXBwcmVzc0Vycm9ycykgeyBzdXBwcmVzc0Vycm9ycyA9IGZhbHNlIH1cbiAgICBpZiAoISBnaGNPcHRpb25zKSB7IGdoY09wdGlvbnMgPSBbXSB9XG4gICAgaWYgKCEgZ2hjTW9kT3B0aW9ucykgeyBnaGNNb2RPcHRpb25zID0gW10gfVxuICAgIGdoY01vZE9wdGlvbnMgPSBnaGNNb2RPcHRpb25zLmNvbmNhdCguLi5naGNPcHRpb25zLm1hcCgob3B0KSA9PiBbJy0tZ2hjLW9wdGlvbicsIG9wdF0pKVxuICAgIGlmIChhdG9tLmNvbmZpZy5nZXQoJ2hhc2tlbGwtZ2hjLW1vZC5sb3dNZW1vcnlTeXN0ZW0nKSkge1xuICAgICAgaW50ZXJhY3RpdmUgPSBhdG9tLmNvbmZpZy5nZXQoJ2hhc2tlbGwtZ2hjLW1vZC5lbmFibGVHaGNNb2RpJylcbiAgICB9XG4gICAgaWYgKHRoaXMuY2Fwcy5vcHRwYXJzZSkge1xuICAgICAgYXJncyA9IGRhc2hBcmdzLmNvbmNhdChbJy0tJ10pLmNvbmNhdChhcmdzKVxuICAgIH0gZWxzZSB7XG4gICAgICBhcmdzID0gZGFzaEFyZ3MuY29uY2F0KGFyZ3MpXG4gICAgfVxuICAgIGNvbnN0IGZ1biA9IGludGVyYWN0aXZlID8gdGhpcy5ydW5Nb2RpQ21kLmJpbmQodGhpcykgOiB0aGlzLnJ1bk1vZENtZC5iaW5kKHRoaXMpXG4gICAgdHJ5IHtcbiAgICAgIGxldCByZXNcbiAgICAgIGlmICh1cmkgJiYgdGV4dCAmJiAhdGhpcy5jYXBzLmZpbGVNYXApIHtcbiAgICAgICAgY29uc3QgbXlPcHRzID0ge2doY01vZE9wdGlvbnMsIGNvbW1hbmQsIGFyZ3N9XG4gICAgICAgIHJlcyA9IHdpdGhUZW1wRmlsZSh0ZXh0LCB1cmksIGFzeW5jICh0ZW1wdXJpKSA9PiB7XG4gICAgICAgICAgY29uc3Qge3N0ZG91dCwgc3RkZXJyfSA9IGF3YWl0IGZ1bih7Li4ubXlPcHRzLCAgdXJpOiB0ZW1wdXJpfSlcbiAgICAgICAgICByZXR1cm4ge1xuICAgICAgICAgICAgc3Rkb3V0OiBzdGRvdXQubWFwKChsaW5lKSA9PiBsaW5lLnNwbGl0KHRlbXB1cmkpLmpvaW4odXJpKSksXG4gICAgICAgICAgICBzdGRlcnI6IHN0ZGVyci5tYXAoKGxpbmUpID0+IGxpbmUuc3BsaXQodGVtcHVyaSkuam9pbih1cmkpKVxuICAgICAgICAgIH1cbiAgICAgICAgfSlcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHJlcyA9IGZ1bih7Z2hjTW9kT3B0aW9ucywgY29tbWFuZCwgdGV4dCwgdXJpLCBhcmdzfSlcbiAgICAgIH1cbiAgICAgIGNvbnN0IHtzdGRvdXQsIHN0ZGVycn0gPSBhd2FpdCByZXNcbiAgICAgIGlmIChzdGRlcnIuam9pbignJykubGVuZ3RoKSB7XG4gICAgICAgIGF0b20ubm90aWZpY2F0aW9ucy5hZGRXYXJuaW5nKCdnaGMtbW9kIHdhcm5pbmcnLCB7XG4gICAgICAgICAgZGV0YWlsOiBzdGRlcnIuam9pbignXFxuJylcbiAgICAgICAgfSlcbiAgICAgIH1cbiAgICAgIHJldHVybiBzdGRvdXQubWFwKChsaW5lKSA9PiBsaW5lLnJlcGxhY2UoL1xcMC9nLCAnXFxuJykpXG4gICAgfSBjYXRjaCAoZXJyKSB7XG4gICAgICBkZWJ1ZyhlcnIpXG4gICAgICBpZiAoZXJyLm5hbWUgPT09ICdJbnRlcmFjdGl2ZUFjdGlvblRpbWVvdXQnKSB7XG4gICAgICAgIGF0b20ubm90aWZpY2F0aW9ucy5hZGRFcnJvcihcbiAgICAgICAgICBgXFxcbkhhc2tlbGwtZ2hjLW1vZDogZ2hjLW1vZCBcXFxuJHtpbnRlcmFjdGl2ZSA/ICdpbnRlcmFjdGl2ZSAnIDogJyd9Y29tbWFuZCAke2NvbW1hbmR9IFxcXG50aW1lZCBvdXQuIFlvdSBjYW4gdHJ5IHRvIGZpeCBpdCBieSByYWlzaW5nICdJbnRlcmFjdGl2ZSBBY3Rpb24gXFxcblRpbWVvdXQnIHNldHRpbmcgaW4gaGFza2VsbC1naGMtbW9kIHNldHRpbmdzLmAsXG4gICAgICAgICAge1xuICAgICAgICAgICAgZGV0YWlsOiBgXFxcbmNhcHM6ICR7SlNPTi5zdHJpbmdpZnkodGhpcy5jYXBzKX1cblVSSTogJHt1cml9XG5BcmdzOiAke2NvbW1hbmR9ICR7ZGFzaEFyZ3N9IC0tICR7YXJnc31cbm1lc3NhZ2U6ICR7ZXJyLm1lc3NhZ2V9XFxcbmAsXG4gICAgICAgICAgICBzdGFjazogZXJyLnN0YWNrLFxuICAgICAgICAgICAgZGlzbWlzc2FibGU6IHRydWVcbiAgICAgICAgICB9XG4gICAgICAgIClcbiAgICAgIH0gZWxzZSBpZiAoIXN1cHByZXNzRXJyb3JzKSB7XG4gICAgICAgIGF0b20ubm90aWZpY2F0aW9ucy5hZGRGYXRhbEVycm9yKFxuICAgICAgICAgIGBcXFxuSGFza2VsbC1naGMtbW9kOiBnaGMtbW9kIFxcXG4ke2ludGVyYWN0aXZlID8gJ2ludGVyYWN0aXZlICcgOiAnJ31jb21tYW5kICR7Y29tbWFuZH0gXFxcbmZhaWxlZCB3aXRoIGVycm9yICR7ZXJyLm5hbWV9YCxcbiAgICAgICAgICB7XG4gICAgICAgICAgICBkZXRhaWw6IGBcXFxuY2FwczogJHtKU09OLnN0cmluZ2lmeSh0aGlzLmNhcHMpfVxuVVJJOiAke3VyaX1cbkFyZ3M6ICR7YXJnc31cbm1lc3NhZ2U6ICR7ZXJyLm1lc3NhZ2V9XG5sb2c6XG4ke1V0aWwuZ2V0RGVidWdMb2coKX1cXFxuYCxcbiAgICAgICAgICAgIHN0YWNrOiBlcnIuc3RhY2ssXG4gICAgICAgICAgICBkaXNtaXNzYWJsZTogdHJ1ZVxuICAgICAgICAgIH1cbiAgICAgICAgKVxuICAgICAgfSBlbHNlIHtcbiAgICAgICAgLy8gdHNsaW50OmRpc2FibGUtbmV4dC1saW5lOiBuby1jb25zb2xlXG4gICAgICAgIGNvbnNvbGUuZXJyb3IoZXJyKVxuICAgICAgfVxuICAgICAgcmV0dXJuIFtdXG4gICAgfVxuICB9XG5cbiAgcHVibGljIGtpbGxQcm9jZXNzICgpIHtcbiAgICBkZWJ1ZyhgS2lsbGluZyBnaGMtbW9kaSBwcm9jZXNzIGZvciAke3RoaXMucm9vdERpci5nZXRQYXRoKCl9YClcbiAgICB0aGlzLnByb2MgJiYgdGhpcy5wcm9jLmtpbGwoKVxuICB9XG5cbiAgcHVibGljIGRlc3Ryb3kgKCkge1xuICAgIGRlYnVnKCdHaGNNb2RpUHJvY2Vzc0Jhc2UgZGVzdHJveWluZycpXG4gICAgdGhpcy5raWxsUHJvY2VzcygpXG4gICAgdGhpcy5lbWl0dGVyLmVtaXQoJ2RpZC1kZXN0cm95JylcbiAgICB0aGlzLmRpc3Bvc2FibGVzLmRpc3Bvc2UoKVxuICB9XG5cbiAgcHVibGljIG9uRGlkRGVzdHJveSAoY2FsbGJhY2s6ICgpID0+IHZvaWQpIHtcbiAgICB0aGlzLmVtaXR0ZXIub24oJ2RpZC1kZXN0cm95JywgY2FsbGJhY2spXG4gIH1cblxuICBwcml2YXRlIGFzeW5jIHNwYXduUHJvY2VzcyAoZ2hjTW9kT3B0aW9uczogc3RyaW5nW10pOiBQcm9taXNlPEludGVyYWN0aXZlUHJvY2VzcyB8IHVuZGVmaW5lZD4ge1xuICAgIGlmICghYXRvbS5jb25maWcuZ2V0KCdoYXNrZWxsLWdoYy1tb2QuZW5hYmxlR2hjTW9kaScpKSB7IHJldHVybiB9XG4gICAgZGVidWcoYENoZWNraW5nIGZvciBnaGMtbW9kaSBpbiAke3RoaXMucm9vdERpci5nZXRQYXRoKCl9YClcbiAgICBpZiAodGhpcy5wcm9jKSB7XG4gICAgICBpZiAoIV8uaXNFcXVhbCh0aGlzLmdoY01vZE9wdGlvbnMsIGdoY01vZE9wdGlvbnMpKSB7XG4gICAgICAgIGRlYnVnKGBGb3VuZCBydW5uaW5nIGdoYy1tb2RpIGluc3RhbmNlIGZvciAke3RoaXMucm9vdERpci5nZXRQYXRoKCl9LCBidXQgZ2hjTW9kT3B0aW9ucyBkb24ndCBtYXRjaC4gT2xkOiBgLFxuICAgICAgICAgICAgICB0aGlzLmdoY01vZE9wdGlvbnMsICcgbmV3OiAnLCBnaGNNb2RPcHRpb25zKVxuICAgICAgICBhd2FpdCB0aGlzLnByb2Mua2lsbCgpXG4gICAgICAgIHJldHVybiB0aGlzLnNwYXduUHJvY2VzcyhnaGNNb2RPcHRpb25zKVxuICAgICAgfVxuICAgICAgZGVidWcoYEZvdW5kIHJ1bm5pbmcgZ2hjLW1vZGkgaW5zdGFuY2UgZm9yICR7dGhpcy5yb290RGlyLmdldFBhdGgoKX1gKVxuICAgICAgcmV0dXJuIHRoaXMucHJvY1xuICAgIH1cbiAgICBkZWJ1ZyhgU3Bhd25pbmcgbmV3IGdoYy1tb2RpIGluc3RhbmNlIGZvciAke3RoaXMucm9vdERpci5nZXRQYXRoKCl9IHdpdGhgLCB0aGlzLm9wdGlvbnMpXG4gICAgY29uc3QgbW9kUGF0aCA9IGF0b20uY29uZmlnLmdldCgnaGFza2VsbC1naGMtbW9kLmdoY01vZFBhdGgnKVxuICAgIHRoaXMuZ2hjTW9kT3B0aW9ucyA9IGdoY01vZE9wdGlvbnNcbiAgICB0aGlzLnByb2MgPSBuZXcgSW50ZXJhY3RpdmVQcm9jZXNzKG1vZFBhdGgsIGdoY01vZE9wdGlvbnMuY29uY2F0KFsnbGVnYWN5LWludGVyYWN0aXZlJ10pLCB0aGlzLm9wdGlvbnMsIHRoaXMuY2FwcylcbiAgICB0aGlzLnByb2Mub25jZUV4aXQoKGNvZGUpID0+IHtcbiAgICAgIGRlYnVnKGBnaGMtbW9kaSBmb3IgJHt0aGlzLnJvb3REaXIuZ2V0UGF0aCgpfSBlbmRlZCB3aXRoICR7Y29kZX1gKVxuICAgICAgcmV0dXJuIHRoaXMucHJvYyA9IHVuZGVmaW5lZFxuICAgIH0pXG4gICAgcmV0dXJuIHRoaXMucHJvY1xuICB9XG5cbiAgcHJpdmF0ZSBhc3luYyBydW5Nb2RDbWQgKFxuICAgIHtcbiAgICAgIGdoY01vZE9wdGlvbnMsIGNvbW1hbmQsIHRleHQsIHVyaSwgYXJnc1xuICAgIH06IHtnaGNNb2RPcHRpb25zOiBzdHJpbmdbXSwgY29tbWFuZDogc3RyaW5nLCB0ZXh0Pzogc3RyaW5nLCB1cmk/OiBzdHJpbmcsIGFyZ3M6IHN0cmluZ1tdfVxuICApIHtcbiAgICBjb25zdCBtb2RQYXRoID0gYXRvbS5jb25maWcuZ2V0KCdoYXNrZWxsLWdoYy1tb2QuZ2hjTW9kUGF0aCcpXG4gICAgY29uc3QgcmVzdWx0ID0gW11cbiAgICBjb25zdCBlcnIgPSBbXVxuICAgIGxldCBzdGRpblxuICAgIGNvbnN0IGNtZCA9IFsuLi5naGNNb2RPcHRpb25zXVxuICAgIGlmICh0ZXh0ICYmIHVyaSkge1xuICAgICAgY21kLnB1c2goJy0tbWFwLWZpbGUnLCB1cmkpXG4gICAgICBzdGRpbiA9IGAke3RleHR9JHtFT1R9YFxuICAgIH1cbiAgICBjbWQucHVzaChjb21tYW5kKVxuICAgIGlmICh1cmkpIHtcbiAgICAgIGNtZC5wdXNoKHVyaSlcbiAgICB9XG4gICAgY21kLnB1c2goLi4uYXJncylcbiAgICBjb25zdCB7c3Rkb3V0LCBzdGRlcnJ9ID0gYXdhaXQgVXRpbC5leGVjUHJvbWlzZShtb2RQYXRoLCBjbWQsIHRoaXMub3B0aW9ucywgc3RkaW4pXG4gICAgcmV0dXJuICB7XG4gICAgICBzdGRvdXQ6IHN0ZG91dC5zcGxpdCgnXFxuJykuc2xpY2UoMCwgLTEpLFxuICAgICAgc3RkZXJyOiBzdGRlcnIuc3BsaXQoJ1xcbicpXG4gICAgfVxuICB9XG5cbiAgcHJpdmF0ZSBhc3luYyBydW5Nb2RpQ21kIChcbiAgICBvOiB7Z2hjTW9kT3B0aW9uczogc3RyaW5nW10sIGNvbW1hbmQ6IHN0cmluZywgdGV4dD86IHN0cmluZywgdXJpPzogc3RyaW5nLCBhcmdzOiBzdHJpbmdbXX1cbiAgKSB7XG4gICAgY29uc3Qge2doY01vZE9wdGlvbnMsIGNvbW1hbmQsIHRleHQsIGFyZ3N9ID0gb1xuICAgIGxldCB7dXJpfSA9IG9cbiAgICBkZWJ1ZyhgVHJ5aW5nIHRvIHJ1biBnaGMtbW9kaSBpbiAke3RoaXMucm9vdERpci5nZXRQYXRoKCl9YClcbiAgICBjb25zdCBwcm9jID0gYXdhaXQgdGhpcy5zcGF3blByb2Nlc3MoZ2hjTW9kT3B0aW9ucylcbiAgICBpZiAoIXByb2MpIHtcbiAgICAgIGRlYnVnKCdGYWlsZWQuIEZhbGxpbmcgYmFjayB0byBnaGMtbW9kJylcbiAgICAgIHJldHVybiB0aGlzLnJ1bk1vZENtZChvKVxuICAgIH1cbiAgICBkZWJ1ZygnU3VjY2Vzcy4gUmVzdW1pbmcuLi4nKVxuICAgIGlmICh1cmkgJiYgIXRoaXMuY2Fwcy5xdW90ZUFyZ3MpIHsgdXJpID0gdGhpcy5yb290RGlyLnJlbGF0aXZpemUodXJpKSB9XG4gICAgdHJ5IHtcbiAgICAgIGlmICh1cmkgJiYgdGV4dCkge1xuICAgICAgICBhd2FpdCBwcm9jLmludGVyYWN0KCdtYXAtZmlsZScsIFt1cmldLCB0ZXh0KVxuICAgICAgfVxuICAgICAgY29uc3QgcmVzID0gYXdhaXQgcHJvYy5pbnRlcmFjdChjb21tYW5kLCB1cmkgPyBbdXJpXS5jb25jYXQoYXJncykgOiBhcmdzKVxuICAgICAgaWYgKHVyaSAmJiB0ZXh0KSB7XG4gICAgICAgIGF3YWl0IHByb2MuaW50ZXJhY3QoJ3VubWFwLWZpbGUnLCBbdXJpXSlcbiAgICAgIH1cbiAgICAgIHJldHVybiByZXNcbiAgICB9IGZpbmFsbHkge1xuICAgICAgaWYgKHVyaSAmJiB0ZXh0KSB7XG4gICAgICAgIGF3YWl0IHByb2MuaW50ZXJhY3QoJ3VubWFwLWZpbGUnLCBbdXJpXSlcbiAgICAgIH1cbiAgICB9XG4gIH1cbn1cbiJdfQ==