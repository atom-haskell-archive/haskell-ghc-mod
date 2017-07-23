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
            if (typeof (dashArgs) === 'function') {
                dashArgs = dashArgs(this.caps);
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
                stdout: stdout.split('\n'),
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZ2hjLW1vZGktcHJvY2Vzcy1yZWFsLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vLi4vc3JjL2doYy1tb2QvZ2hjLW1vZGktcHJvY2Vzcy1yZWFsLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7Ozs7Ozs7Ozs7QUFPQSwrQkFBOEQ7QUFFOUQsK0RBQW9FO0FBQ3BFLGdDQUErQjtBQUMvQixNQUFNLEVBQUMsS0FBSyxFQUFFLElBQUksRUFBRSxPQUFPLEVBQUUsWUFBWSxFQUFFLEdBQUcsRUFBQyxHQUFHLElBQUksQ0FBQTtBQUV0RCxnQ0FBK0I7QUF1Qi9CO0lBTUUsWUFBcUIsSUFBZ0IsRUFBVSxPQUE0QixFQUFVLE9BQW1CO1FBQW5GLFNBQUksR0FBSixJQUFJLENBQVk7UUFBVSxZQUFPLEdBQVAsT0FBTyxDQUFxQjtRQUFVLFlBQU8sR0FBUCxPQUFPLENBQVk7UUFDdEcsSUFBSSxDQUFDLFdBQVcsR0FBRyxJQUFJLDBCQUFtQixFQUFFLENBQUE7UUFDNUMsSUFBSSxDQUFDLE9BQU8sR0FBRyxJQUFJLGNBQU8sRUFBRSxDQUFBO1FBQzVCLElBQUksQ0FBQyxXQUFXLENBQUMsR0FBRyxDQUFDLElBQUksQ0FBQyxPQUFPLENBQUMsQ0FBQTtJQUNwQyxDQUFDO0lBRVksR0FBRyxDQUNkLEVBQUMsV0FBVyxFQUFFLE9BQU8sRUFBRSxJQUFJLEVBQUUsR0FBRyxFQUFFLFFBQVEsRUFBRSxJQUFJLEVBQUUsY0FBYyxFQUFFLFVBQVUsRUFBRSxhQUFhLEVBQVU7O1lBRXJHLEVBQUUsQ0FBQyxDQUFDLENBQUUsSUFBSSxDQUFDLENBQUMsQ0FBQztnQkFBQyxJQUFJLEdBQUcsRUFBRSxDQUFBO1lBQUMsQ0FBQztZQUN6QixFQUFFLENBQUMsQ0FBQyxDQUFFLFFBQVEsQ0FBQyxDQUFDLENBQUM7Z0JBQUMsUUFBUSxHQUFHLEVBQUUsQ0FBQTtZQUFDLENBQUM7WUFDakMsRUFBRSxDQUFDLENBQUMsQ0FBRSxjQUFjLENBQUMsQ0FBQyxDQUFDO2dCQUFD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LE1BQU0sR0FBRyxHQUFHLE1BQU0sSUFBSSxDQUFDLFFBQVEsQ0FBQyxPQUFPLEVBQUUsR0FBRyxHQUFHLENBQUMsR0FBRyxDQUFDLENBQUMsTUFBTSxDQUFDLElBQUksQ0FBQyxHQUFHLElBQUksQ0FBQyxDQUFBO2dCQUN6RSxFQUFFLENBQUMsQ0FBQyxHQUFHLElBQUksSUFBSSxDQUFDLENBQUMsQ0FBQztvQkFDaEIsTUFBTSxJQUFJLENBQUMsUUFBUSxDQUFDLFlBQVksRUFBRSxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUE7Z0JBQzFDLENBQUM7Z0JBQ0QsTUFBTSxDQUFDLEdBQUcsQ0FBQTtZQUNaLENBQUM7b0JBQVMsQ0FBQztnQkFDVCxFQUFFLENBQUMsQ0FBQyxHQUFHLElBQUksSUFBSSxDQUFDLENBQUMsQ0FBQztvQkFDaEIsTUFBTSxJQUFJLENBQUMsUUFBUSxDQUFDLFlBQVksRUFBRSxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUE7Z0JBQzFDLENBQUM7WUFDSCxDQUFDO1FBQ0gsQ0FBQztLQUFBO0NBQ0Y7QUFuTUQsZ0RBbU1DIiwic291cmNlc0NvbnRlbnQiOlsiLypcbiAqIGRlY2FmZmVpbmF0ZSBzdWdnZXN0aW9uczpcbiAqIERTMTAxOiBSZW1vdmUgdW5uZWNlc3NhcnkgdXNlIG9mIEFycmF5LmZyb21cbiAqIERTMTAyOiBSZW1vdmUgdW5uZWNlc3NhcnkgY29kZSBjcmVhdGVkIGJlY2F1c2Ugb2YgaW1wbGljaXQgcmV0dXJuc1xuICogRFMyMDc6IENvbnNpZGVyIHNob3J0ZXIgdmFyaWF0aW9ucyBvZiBudWxsIGNoZWNrc1xuICogRnVsbCBkb2NzOiBodHRwczovL2dpdGh1Yi5jb20vZGVjYWZmZWluYXRlL2RlY2FmZmVpbmF0ZS9ibG9iL21hc3Rlci9kb2NzL3N1Z2dlc3Rpb25zLm1kXG4gKi9cbmltcG9ydCB7IEVtaXR0ZXIsIENvbXBvc2l0ZURpc3Bvc2FibGUsIERpcmVjdG9yeSB9IGZyb20gJ2F0b20nXG5pbXBvcnQgKiBhcyBDUCBmcm9tICdjaGlsZF9wcm9jZXNzJ1xuaW1wb3J0IHtJbnRlcmFjdGl2ZVByb2Nlc3MsIEdIQ01vZENhcHN9IGZyb20gJy4vaW50ZXJhY3RpdmUtcHJvY2VzcydcbmltcG9ydCAqIGFzIFV0aWwgZnJvbSAnLi4vdXRpbCdcbmNvbnN0IHtkZWJ1Zywgd2FybiwgbWtFcnJvciwgd2l0aFRlbXBGaWxlLCBFT1R9ID0gVXRpbFxuaW1wb3J0IHsgRU9MIH0gZnJvbSAnb3MnXG5pbXBvcnQgKiBhcyBfIGZyb20gJ3VuZGVyc2NvcmUnXG5cbmV4cG9ydCB7IEdIQ01vZENhcHMgfVxuXG5leHBvcnQgaW50ZXJmYWNlIFJ1bkFyZ3Mge1xuICBpbnRlcmFjdGl2ZT86IGJvb2xlYW5cbiAgY29tbWFuZDogc3RyaW5nXG4gIHRleHQ/OiBzdHJpbmdcbiAgdXJpPzogc3RyaW5nXG4gIGRhc2hBcmdzPzogc3RyaW5nW10gfCAoKGNhcHM6IEdIQ01vZENhcHMpID0+IHN0cmluZ1tdKVxuICBhcmdzPzogc3RyaW5nW11cbiAgc3VwcHJlc3NFcnJvcnM/OiBib29sZWFuXG4gIGdoY09wdGlvbnM/OiBzdHJpbmdbXVxuICBnaGNNb2RPcHRpb25zPzogc3RyaW5nW11cbn1cblxuZXhwb3J0IGludGVyZmFjZSBSdW5PcHRpb25zIHtcbiAgY3dkOiBzdHJpbmdcbiAgZW5jb2Rpbmc6ICd1dGY4J1xuICBlbnY6IHsgW2tleTogc3RyaW5nXTogc3RyaW5nIHwgdW5kZWZpbmVkIH1cbiAgbWF4QnVmZmVyOiBudW1iZXJcbn1cblxuZXhwb3J0IGNsYXNzIEdoY01vZGlQcm9jZXNzUmVhbCB7XG4gIHByaXZhdGUgZGlzcG9zYWJsZXM6IENvbXBvc2l0ZURpc3Bvc2FibGVcbiAgcHJpdmF0ZSBlbWl0dGVyOiBFbWl0dGVyXG4gIHByaXZhdGUgZ2hjTW9kT3B0aW9uczogc3RyaW5nW11cbiAgcHJpdmF0ZSBwcm9jOiBJbnRlcmFjdGl2ZVByb2Nlc3MgfCB1bmRlZmluZWRcblxuICBjb25zdHJ1Y3RvciAocHJpdmF0ZSBjYXBzOiBHSENNb2RDYXBzLCBwcml2YXRlIHJvb3REaXI6IEF0b21UeXBlcy5EaXJlY3RvcnksIHByaXZhdGUgb3B0aW9uczogUnVuT3B0aW9ucykge1xuICAgIHRoaXMuZGlzcG9zYWJsZXMgPSBuZXcgQ29tcG9zaXRlRGlzcG9zYWJsZSgpXG4gICAgdGhpcy5lbWl0dGVyID0gbmV3IEVtaXR0ZXIoKVxuICAgIHRoaXMuZGlzcG9zYWJsZXMuYWRkKHRoaXMuZW1pdHRlcilcbiAgfVxuXG4gIHB1YmxpYyBhc3luYyBydW4gKFxuICAgIHtpbnRlcmFjdGl2ZSwgY29tbWFuZCwgdGV4dCwgdXJpLCBkYXNoQXJncywgYXJncywgc3VwcHJlc3NFcnJvcnMsIGdoY09wdGlvbnMsIGdoY01vZE9wdGlvbnN9OiBSdW5BcmdzXG4gICkge1xuICAgIGlmICghIGFyZ3MpIHsgYXJncyA9IFtdIH1cbiAgICBpZiAoISBkYXNoQXJncykgeyBkYXNoQXJncyA9IFtdIH1cbiAgICBpZiAoISBzdXBwcmVzc0Vycm9ycykgeyBzdXBwcmVzc0Vycm9ycyA9IGZhbHNlIH1cbiAgICBpZiAoISBnaGNPcHRpb25zKSB7IGdoY09wdGlvbnMgPSBbXSB9XG4gICAgaWYgKCEgZ2hjTW9kT3B0aW9ucykgeyBnaGNNb2RPcHRpb25zID0gW10gfVxuICAgIGdoY01vZE9wdGlvbnMgPSBnaGNNb2RPcHRpb25zLmNvbmNhdCguLi5naGNPcHRpb25zLm1hcCgob3B0KSA9PiBbJy0tZ2hjLW9wdGlvbicsIG9wdF0pKVxuICAgIGlmIChhdG9tLmNvbmZpZy5nZXQoJ2hhc2tlbGwtZ2hjLW1vZC5sb3dNZW1vcnlTeXN0ZW0nKSkge1xuICAgICAgaW50ZXJhY3RpdmUgPSBhdG9tLmNvbmZpZy5nZXQoJ2hhc2tlbGwtZ2hjLW1vZC5lbmFibGVHaGNNb2RpJylcbiAgICB9XG4gICAgaWYgKHR5cGVvZihkYXNoQXJncykgPT09ICdmdW5jdGlvbicpIHtcbiAgICAgIGRhc2hBcmdzID0gZGFzaEFyZ3ModGhpcy5jYXBzKVxuICAgIH1cbiAgICBpZiAodGhpcy5jYXBzLm9wdHBhcnNlKSB7XG4gICAgICBhcmdzID0gZGFzaEFyZ3MuY29uY2F0KFsnLS0nXSkuY29uY2F0KGFyZ3MpXG4gICAgfSBlbHNlIHtcbiAgICAgIGFyZ3MgPSBkYXNoQXJncy5jb25jYXQoYXJncylcbiAgICB9XG4gICAgY29uc3QgZnVuID0gaW50ZXJhY3RpdmUgPyB0aGlzLnJ1bk1vZGlDbWQuYmluZCh0aGlzKSA6IHRoaXMucnVuTW9kQ21kLmJpbmQodGhpcylcbiAgICB0cnkge1xuICAgICAgbGV0IHJlc1xuICAgICAgaWYgKHVyaSAmJiB0ZXh0ICYmICF0aGlzLmNhcHMuZmlsZU1hcCkge1xuICAgICAgICBjb25zdCBteU9wdHMgPSB7Z2hjTW9kT3B0aW9ucywgY29tbWFuZCwgYXJnc31cbiAgICAgICAgcmVzID0gd2l0aFRlbXBGaWxlKHRleHQsIHVyaSwgYXN5bmMgKHRlbXB1cmkpID0+IHtcbiAgICAgICAgICBjb25zdCB7c3Rkb3V0LCBzdGRlcnJ9ID0gYXdhaXQgZnVuKHsuLi5teU9wdHMsICB1cmk6IHRlbXB1cml9KVxuICAgICAgICAgIHJldHVybiB7XG4gICAgICAgICAgICBzdGRvdXQ6IHN0ZG91dC5tYXAoKGxpbmUpID0+IGxpbmUuc3BsaXQodGVtcHVyaSkuam9pbih1cmkpKSxcbiAgICAgICAgICAgIHN0ZGVycjogc3RkZXJyLm1hcCgobGluZSkgPT4gbGluZS5zcGxpdCh0ZW1wdXJpKS5qb2luKHVyaSkpXG4gICAgICAgICAgfVxuICAgICAgICB9KVxuICAgICAgfSBlbHNlIHtcbiAgICAgICAgcmVzID0gZnVuKHtnaGNNb2RPcHRpb25zLCBjb21tYW5kLCB0ZXh0LCB1cmksIGFyZ3N9KVxuICAgICAgfVxuICAgICAgY29uc3Qge3N0ZG91dCwgc3RkZXJyfSA9IGF3YWl0IHJlc1xuICAgICAgaWYgKHN0ZGVyci5qb2luKCcnKS5sZW5ndGgpIHtcbiAgICAgICAgYXRvbS5ub3RpZmljYXRpb25zLmFkZFdhcm5pbmcoJ2doYy1tb2Qgd2FybmluZycsIHtcbiAgICAgICAgICBkZXRhaWw6IHN0ZGVyci5qb2luKCdcXG4nKVxuICAgICAgICB9KVxuICAgICAgfVxuICAgICAgcmV0dXJuIHN0ZG91dC5tYXAoKGxpbmUpID0+IGxpbmUucmVwbGFjZSgvXFwwL2csICdcXG4nKSlcbiAgICB9IGNhdGNoIChlcnIpIHtcbiAgICAgIGRlYnVnKGVycilcbiAgICAgIGlmIChlcnIubmFtZSA9PT0gJ0ludGVyYWN0aXZlQWN0aW9uVGltZW91dCcpIHtcbiAgICAgICAgYXRvbS5ub3RpZmljYXRpb25zLmFkZEVycm9yKFxuICAgICAgICAgIGBcXFxuSGFza2VsbC1naGMtbW9kOiBnaGMtbW9kIFxcXG4ke2ludGVyYWN0aXZlID8gJ2ludGVyYWN0aXZlICcgOiAnJ31jb21tYW5kICR7Y29tbWFuZH0gXFxcbnRpbWVkIG91dC4gWW91IGNhbiB0cnkgdG8gZml4IGl0IGJ5IHJhaXNpbmcgJ0ludGVyYWN0aXZlIEFjdGlvbiBcXFxuVGltZW91dCcgc2V0dGluZyBpbiBoYXNrZWxsLWdoYy1tb2Qgc2V0dGluZ3MuYCxcbiAgICAgICAgICB7XG4gICAgICAgICAgICBkZXRhaWw6IGBcXFxuY2FwczogJHtKU09OLnN0cmluZ2lmeSh0aGlzLmNhcHMpfVxuVVJJOiAke3VyaX1cbkFyZ3M6ICR7Y29tbWFuZH0gJHtkYXNoQXJnc30gLS0gJHthcmdzfVxubWVzc2FnZTogJHtlcnIubWVzc2FnZX1cXFxuYCxcbiAgICAgICAgICAgIHN0YWNrOiBlcnIuc3RhY2ssXG4gICAgICAgICAgICBkaXNtaXNzYWJsZTogdHJ1ZVxuICAgICAgICAgIH1cbiAgICAgICAgKVxuICAgICAgfSBlbHNlIGlmICghc3VwcHJlc3NFcnJvcnMpIHtcbiAgICAgICAgYXRvbS5ub3RpZmljYXRpb25zLmFkZEZhdGFsRXJyb3IoXG4gICAgICAgICAgYFxcXG5IYXNrZWxsLWdoYy1tb2Q6IGdoYy1tb2QgXFxcbiR7aW50ZXJhY3RpdmUgPyAnaW50ZXJhY3RpdmUgJyA6ICcnfWNvbW1hbmQgJHtjb21tYW5kfSBcXFxuZmFpbGVkIHdpdGggZXJyb3IgJHtlcnIubmFtZX1gLFxuICAgICAgICAgIHtcbiAgICAgICAgICAgIGRldGFpbDogYFxcXG5jYXBzOiAke0pTT04uc3RyaW5naWZ5KHRoaXMuY2Fwcyl9XG5VUkk6ICR7dXJpfVxuQXJnczogJHthcmdzfVxubWVzc2FnZTogJHtlcnIubWVzc2FnZX1cbmxvZzpcbiR7VXRpbC5nZXREZWJ1Z0xvZygpfVxcXG5gLFxuICAgICAgICAgICAgc3RhY2s6IGVyci5zdGFjayxcbiAgICAgICAgICAgIGRpc21pc3NhYmxlOiB0cnVlXG4gICAgICAgICAgfVxuICAgICAgICApXG4gICAgICB9IGVsc2Uge1xuICAgICAgICAvLyB0c2xpbnQ6ZGlzYWJsZS1uZXh0LWxpbmU6IG5vLWNvbnNvbGVcbiAgICAgICAgY29uc29sZS5lcnJvcihlcnIpXG4gICAgICB9XG4gICAgICByZXR1cm4gW11cbiAgICB9XG4gIH1cblxuICBwdWJsaWMga2lsbFByb2Nlc3MgKCkge1xuICAgIGRlYnVnKGBLaWxsaW5nIGdoYy1tb2RpIHByb2Nlc3MgZm9yICR7dGhpcy5yb290RGlyLmdldFBhdGgoKX1gKVxuICAgIHRoaXMucHJvYyAmJiB0aGlzLnByb2Mua2lsbCgpXG4gIH1cblxuICBwdWJsaWMgZGVzdHJveSAoKSB7XG4gICAgZGVidWcoJ0doY01vZGlQcm9jZXNzQmFzZSBkZXN0cm95aW5nJylcbiAgICB0aGlzLmtpbGxQcm9jZXNzKClcbiAgICB0aGlzLmVtaXR0ZXIuZW1pdCgnZGlkLWRlc3Ryb3knKVxuICAgIHRoaXMuZGlzcG9zYWJsZXMuZGlzcG9zZSgpXG4gIH1cblxuICBwdWJsaWMgb25EaWREZXN0cm95IChjYWxsYmFjazogKCkgPT4gdm9pZCkge1xuICAgIHRoaXMuZW1pdHRlci5vbignZGlkLWRlc3Ryb3knLCBjYWxsYmFjaylcbiAgfVxuXG4gIHByaXZhdGUgYXN5bmMgc3Bhd25Qcm9jZXNzIChnaGNNb2RPcHRpb25zOiBzdHJpbmdbXSk6IFByb21pc2U8SW50ZXJhY3RpdmVQcm9jZXNzIHwgdW5kZWZpbmVkPiB7XG4gICAgaWYgKCFhdG9tLmNvbmZpZy5nZXQoJ2hhc2tlbGwtZ2hjLW1vZC5lbmFibGVHaGNNb2RpJykpIHsgcmV0dXJuIH1cbiAgICBkZWJ1ZyhgQ2hlY2tpbmcgZm9yIGdoYy1tb2RpIGluICR7dGhpcy5yb290RGlyLmdldFBhdGgoKX1gKVxuICAgIGlmICh0aGlzLnByb2MpIHtcbiAgICAgIGlmICghXy5pc0VxdWFsKHRoaXMuZ2hjTW9kT3B0aW9ucywgZ2hjTW9kT3B0aW9ucykpIHtcbiAgICAgICAgZGVidWcoYEZvdW5kIHJ1bm5pbmcgZ2hjLW1vZGkgaW5zdGFuY2UgZm9yICR7dGhpcy5yb290RGlyLmdldFBhdGgoKX0sIGJ1dCBnaGNNb2RPcHRpb25zIGRvbid0IG1hdGNoLiBPbGQ6IGAsXG4gICAgICAgICAgICAgIHRoaXMuZ2hjTW9kT3B0aW9ucywgJyBuZXc6ICcsIGdoY01vZE9wdGlvbnMpXG4gICAgICAgIGF3YWl0IHRoaXMucHJvYy5raWxsKClcbiAgICAgICAgcmV0dXJuIHRoaXMuc3Bhd25Qcm9jZXNzKGdoY01vZE9wdGlvbnMpXG4gICAgICB9XG4gICAgICBkZWJ1ZyhgRm91bmQgcnVubmluZyBnaGMtbW9kaSBpbnN0YW5jZSBmb3IgJHt0aGlzLnJvb3REaXIuZ2V0UGF0aCgpfWApXG4gICAgICByZXR1cm4gdGhpcy5wcm9jXG4gICAgfVxuICAgIGRlYnVnKGBTcGF3bmluZyBuZXcgZ2hjLW1vZGkgaW5zdGFuY2UgZm9yICR7dGhpcy5yb290RGlyLmdldFBhdGgoKX0gd2l0aGAsIHRoaXMub3B0aW9ucylcbiAgICBjb25zdCBtb2RQYXRoID0gYXRvbS5jb25maWcuZ2V0KCdoYXNrZWxsLWdoYy1tb2QuZ2hjTW9kUGF0aCcpXG4gICAgdGhpcy5naGNNb2RPcHRpb25zID0gZ2hjTW9kT3B0aW9uc1xuICAgIHRoaXMucHJvYyA9IG5ldyBJbnRlcmFjdGl2ZVByb2Nlc3MobW9kUGF0aCwgZ2hjTW9kT3B0aW9ucy5jb25jYXQoWydsZWdhY3ktaW50ZXJhY3RpdmUnXSksIHRoaXMub3B0aW9ucywgdGhpcy5jYXBzKVxuICAgIHRoaXMucHJvYy5vbmNlRXhpdCgoY29kZSkgPT4ge1xuICAgICAgZGVidWcoYGdoYy1tb2RpIGZvciAke3RoaXMucm9vdERpci5nZXRQYXRoKCl9IGVuZGVkIHdpdGggJHtjb2RlfWApXG4gICAgICByZXR1cm4gdGhpcy5wcm9jID0gdW5kZWZpbmVkXG4gICAgfSlcbiAgICByZXR1cm4gdGhpcy5wcm9jXG4gIH1cblxuICBwcml2YXRlIGFzeW5jIHJ1bk1vZENtZCAoXG4gICAge1xuICAgICAgZ2hjTW9kT3B0aW9ucywgY29tbWFuZCwgdGV4dCwgdXJpLCBhcmdzXG4gICAgfToge2doY01vZE9wdGlvbnM6IHN0cmluZ1tdLCBjb21tYW5kOiBzdHJpbmcsIHRleHQ/OiBzdHJpbmcsIHVyaT86IHN0cmluZywgYXJnczogc3RyaW5nW119XG4gICkge1xuICAgIGNvbnN0IG1vZFBhdGggPSBhdG9tLmNvbmZpZy5nZXQoJ2hhc2tlbGwtZ2hjLW1vZC5naGNNb2RQYXRoJylcbiAgICBjb25zdCByZXN1bHQgPSBbXVxuICAgIGNvbnN0IGVyciA9IFtdXG4gICAgbGV0IHN0ZGluXG4gICAgY29uc3QgY21kID0gWy4uLmdoY01vZE9wdGlvbnNdXG4gICAgaWYgKHRleHQgJiYgdXJpKSB7XG4gICAgICBjbWQucHVzaCgnLS1tYXAtZmlsZScsIHVyaSlcbiAgICAgIHN0ZGluID0gYCR7dGV4dH0ke0VPVH1gXG4gICAgfVxuICAgIGNtZC5wdXNoKGNvbW1hbmQpXG4gICAgaWYgKHVyaSkge1xuICAgICAgY21kLnB1c2godXJpKVxuICAgIH1cbiAgICBjbWQucHVzaCguLi5hcmdzKVxuICAgIGNvbnN0IHtzdGRvdXQsIHN0ZGVycn0gPSBhd2FpdCBVdGlsLmV4ZWNQcm9taXNlKG1vZFBhdGgsIGNtZCwgdGhpcy5vcHRpb25zLCBzdGRpbilcbiAgICByZXR1cm4gIHtcbiAgICAgIHN0ZG91dDogc3Rkb3V0LnNwbGl0KCdcXG4nKSxcbiAgICAgIHN0ZGVycjogc3RkZXJyLnNwbGl0KCdcXG4nKVxuICAgIH1cbiAgfVxuXG4gIHByaXZhdGUgYXN5bmMgcnVuTW9kaUNtZCAoXG4gICAgbzoge2doY01vZE9wdGlvbnM6IHN0cmluZ1tdLCBjb21tYW5kOiBzdHJpbmcsIHRleHQ/OiBzdHJpbmcsIHVyaT86IHN0cmluZywgYXJnczogc3RyaW5nW119XG4gICkge1xuICAgIGNvbnN0IHtnaGNNb2RPcHRpb25zLCBjb21tYW5kLCB0ZXh0LCBhcmdzfSA9IG9cbiAgICBsZXQge3VyaX0gPSBvXG4gICAgZGVidWcoYFRyeWluZyB0byBydW4gZ2hjLW1vZGkgaW4gJHt0aGlzLnJvb3REaXIuZ2V0UGF0aCgpfWApXG4gICAgY29uc3QgcHJvYyA9IGF3YWl0IHRoaXMuc3Bhd25Qcm9jZXNzKGdoY01vZE9wdGlvbnMpXG4gICAgaWYgKCFwcm9jKSB7XG4gICAgICBkZWJ1ZygnRmFpbGVkLiBGYWxsaW5nIGJhY2sgdG8gZ2hjLW1vZCcpXG4gICAgICByZXR1cm4gdGhpcy5ydW5Nb2RDbWQobylcbiAgICB9XG4gICAgZGVidWcoJ1N1Y2Nlc3MuIFJlc3VtaW5nLi4uJylcbiAgICBpZiAodXJpICYmICF0aGlzLmNhcHMucXVvdGVBcmdzKSB7IHVyaSA9IHRoaXMucm9vdERpci5yZWxhdGl2aXplKHVyaSkgfVxuICAgIHRyeSB7XG4gICAgICBpZiAodXJpICYmIHRleHQpIHtcbiAgICAgICAgYXdhaXQgcHJvYy5pbnRlcmFjdCgnbWFwLWZpbGUnLCBbdXJpXSwgdGV4dClcbiAgICAgIH1cbiAgICAgIGNvbnN0IHJlcyA9IGF3YWl0IHByb2MuaW50ZXJhY3QoY29tbWFuZCwgdXJpID8gW3VyaV0uY29uY2F0KGFyZ3MpIDogYXJncylcbiAgICAgIGlmICh1cmkgJiYgdGV4dCkge1xuICAgICAgICBhd2FpdCBwcm9jLmludGVyYWN0KCd1bm1hcC1maWxlJywgW3VyaV0pXG4gICAgICB9XG4gICAgICByZXR1cm4gcmVzXG4gICAgfSBmaW5hbGx5IHtcbiAgICAgIGlmICh1cmkgJiYgdGV4dCkge1xuICAgICAgICBhd2FpdCBwcm9jLmludGVyYWN0KCd1bm1hcC1maWxlJywgW3VyaV0pXG4gICAgICB9XG4gICAgfVxuICB9XG59XG4iXX0=