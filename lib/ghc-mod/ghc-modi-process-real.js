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
const os_1 = require("os");
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
    run(runArgs) {
        return __awaiter(this, void 0, void 0, function* () {
            let { interactive, dashArgs, args, suppressErrors, ghcOptions, ghcModOptions } = runArgs;
            const { command, text, uri } = runArgs;
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
                    this.emitter.emit('warning', stderr.join('\n'));
                }
                return stdout.map((line) => line.replace(/\0/g, '\n'));
            }
            catch (err) {
                debug(err);
                this.emitter.emit('error', { runArgs, err, caps: this.caps });
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
        this.emitter.emit('did-destroy', undefined);
        this.disposables.dispose();
    }
    onDidDestroy(callback) {
        return this.emitter.on('did-destroy', callback);
    }
    onWarning(callback) {
        return this.emitter.on('warning', callback);
    }
    onError(callback) {
        return this.emitter.on('error', callback);
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
                this.proc = undefined;
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
                stdout: stdout.split(os_1.EOL).slice(0, -1),
                stderr: stderr.split(os_1.EOL)
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZ2hjLW1vZGktcHJvY2Vzcy1yZWFsLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vLi4vc3JjL2doYy1tb2QvZ2hjLW1vZGktcHJvY2Vzcy1yZWFsLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7Ozs7Ozs7Ozs7QUFBQSwrQkFBOEQ7QUFFOUQsK0RBQW9FO0FBQ3BFLGdDQUErQjtBQUMvQixNQUFNLEVBQUMsS0FBSyxFQUFFLElBQUksRUFBRSxPQUFPLEVBQUUsWUFBWSxFQUFFLEdBQUcsRUFBQyxHQUFHLElBQUksQ0FBQTtBQUN0RCwyQkFBd0I7QUFDeEIsZ0NBQStCO0FBNkIvQjtJQVVFLFlBQXFCLElBQWdCLEVBQVUsT0FBNEIsRUFBVSxPQUFtQjtRQUFuRixTQUFJLEdBQUosSUFBSSxDQUFZO1FBQVUsWUFBTyxHQUFQLE9BQU8sQ0FBcUI7UUFBVSxZQUFPLEdBQVAsT0FBTyxDQUFZO1FBQ3RHLElBQUksQ0FBQyxXQUFXLEdBQUcsSUFBSSwwQkFBbUIsRUFBRSxDQUFBO1FBQzVDLElBQUksQ0FBQyxPQUFPLEdBQUcsSUFBSSxjQUFPLEVBQUUsQ0FBQTtRQUM1QixJQUFJLENBQUMsV0FBVyxDQUFDLEdBQUcsQ0FBQyxJQUFJLENBQUMsT0FBTyxDQUFDLENBQUE7SUFDcEMsQ0FBQztJQUVZLEdBQUcsQ0FDZCxPQUFnQjs7WUFFaEIsSUFBSSxFQUFDLFdBQVcsRUFBRSxRQUFRLEVBQUUsSUFBSSxFQUFFLGNBQWMsRUFBRSxVQUFVLEVBQUUsYUFBYSxFQUFDLEdBQUcsT0FBTyxDQUFBO1lBQ3RGLE1BQU0sRUFBQyxPQUFPLEVBQUUsSUFBSSxFQUFFLEdBQUcsRUFBQyxHQUFHLE9BQU8sQ0FBQTtZQUNwQyxFQUFFLENBQUMsQ0FBQyxDQUFFLElBQUksQ0FBQyxDQUFDLENBQUM7Z0JBQUMsSUFBSSxHQUFHLEVBQUUsQ0FBQTtZQUFDLENBQUM7WUFDekIsRUFBRSxDQUFDLENBQUMsQ0FBRSxRQUFRLENBQUMsQ0FBQyxDQUFDO2dCQUFDLFFBQVEs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aXJlY3RvcnkgfSBmcm9tICdhdG9tJ1xuaW1wb3J0ICogYXMgQ1AgZnJvbSAnY2hpbGRfcHJvY2VzcydcbmltcG9ydCB7SW50ZXJhY3RpdmVQcm9jZXNzLCBHSENNb2RDYXBzfSBmcm9tICcuL2ludGVyYWN0aXZlLXByb2Nlc3MnXG5pbXBvcnQgKiBhcyBVdGlsIGZyb20gJy4uL3V0aWwnXG5jb25zdCB7ZGVidWcsIHdhcm4sIG1rRXJyb3IsIHdpdGhUZW1wRmlsZSwgRU9UfSA9IFV0aWxcbmltcG9ydCB7IEVPTCB9IGZyb20gJ29zJ1xuaW1wb3J0ICogYXMgXyBmcm9tICd1bmRlcnNjb3JlJ1xuXG5leHBvcnQgeyBHSENNb2RDYXBzIH1cblxuZXhwb3J0IGludGVyZmFjZSBSdW5BcmdzIHtcbiAgaW50ZXJhY3RpdmU/OiBib29sZWFuXG4gIGNvbW1hbmQ6IHN0cmluZ1xuICB0ZXh0Pzogc3RyaW5nXG4gIHVyaT86IHN0cmluZ1xuICBkYXNoQXJncz86IHN0cmluZ1tdXG4gIGFyZ3M/OiBzdHJpbmdbXVxuICBzdXBwcmVzc0Vycm9ycz86IGJvb2xlYW5cbiAgZ2hjT3B0aW9ucz86IHN0cmluZ1tdXG4gIGdoY01vZE9wdGlvbnM/OiBzdHJpbmdbXVxufVxuXG5leHBvcnQgaW50ZXJmYWNlIFJ1bk9wdGlvbnMge1xuICBjd2Q6IHN0cmluZ1xuICBlbmNvZGluZzogJ3V0ZjgnXG4gIGVudjogeyBba2V5OiBzdHJpbmddOiBzdHJpbmcgfCB1bmRlZmluZWQgfVxuICBtYXhCdWZmZXI6IG51bWJlclxufVxuXG5leHBvcnQgaW50ZXJmYWNlIElFcnJvckNhbGxiYWNrQXJncyB7XG4gIHJ1bkFyZ3M/OiBSdW5BcmdzXG4gIGVycjogRXJyb3JcbiAgY2FwczogR0hDTW9kQ2Fwc1xufVxuXG5leHBvcnQgY2xhc3MgR2hjTW9kaVByb2Nlc3NSZWFsIHtcbiAgcHJpdmF0ZSBkaXNwb3NhYmxlczogQ29tcG9zaXRlRGlzcG9zYWJsZVxuICBwcml2YXRlIGVtaXR0ZXI6IE15RW1pdHRlcjx7XG4gICAgJ2RpZC1kZXN0cm95JzogdW5kZWZpbmVkXG4gICAgJ3dhcm5pbmcnOiBzdHJpbmdcbiAgICAnZXJyb3InOiBJRXJyb3JDYWxsYmFja0FyZ3NcbiAgfT5cbiAgcHJpdmF0ZSBnaGNNb2RPcHRpb25zOiBzdHJpbmdbXVxuICBwcml2YXRlIHByb2M6IEludGVyYWN0aXZlUHJvY2VzcyB8IHVuZGVmaW5lZFxuXG4gIGNvbnN0cnVjdG9yIChwcml2YXRlIGNhcHM6IEdIQ01vZENhcHMsIHByaXZhdGUgcm9vdERpcjogQXRvbVR5cGVzLkRpcmVjdG9yeSwgcHJpdmF0ZSBvcHRpb25zOiBSdW5PcHRpb25zKSB7XG4gICAgdGhpcy5kaXNwb3NhYmxlcyA9IG5ldyBDb21wb3NpdGVEaXNwb3NhYmxlKClcbiAgICB0aGlzLmVtaXR0ZXIgPSBuZXcgRW1pdHRlcigpXG4gICAgdGhpcy5kaXNwb3NhYmxlcy5hZGQodGhpcy5lbWl0dGVyKVxuICB9XG5cbiAgcHVibGljIGFzeW5jIHJ1biAoXG4gICAgcnVuQXJnczogUnVuQXJnc1xuICApIHtcbiAgICBsZXQge2ludGVyYWN0aXZlLCBkYXNoQXJncywgYXJncywgc3VwcHJlc3NFcnJvcnMsIGdoY09wdGlvbnMsIGdoY01vZE9wdGlvbnN9ID0gcnVuQXJnc1xuICAgIGNvbnN0IHtjb21tYW5kLCB0ZXh0LCB1cml9ID0gcnVuQXJnc1xuICAgIGlmICghIGFyZ3MpIHsgYXJncyA9IFtdIH1cbiAgICBpZiAoISBkYXNoQXJncykgeyBkYXNoQXJncyA9IFtdIH1cbiAgICBpZiAoISBzdXBwcmVzc0Vycm9ycykgeyBzdXBwcmVzc0Vycm9ycyA9IGZhbHNlIH1cbiAgICBpZiAoISBnaGNPcHRpb25zKSB7IGdoY09wdGlvbnMgPSBbXSB9XG4gICAgaWYgKCEgZ2hjTW9kT3B0aW9ucykgeyBnaGNNb2RPcHRpb25zID0gW10gfVxuICAgIGdoY01vZE9wdGlvbnMgPSBnaGNNb2RPcHRpb25zLmNvbmNhdCguLi5naGNPcHRpb25zLm1hcCgob3B0KSA9PiBbJy0tZ2hjLW9wdGlvbicsIG9wdF0pKVxuICAgIGlmIChhdG9tLmNvbmZpZy5nZXQoJ2hhc2tlbGwtZ2hjLW1vZC5sb3dNZW1vcnlTeXN0ZW0nKSkge1xuICAgICAgaW50ZXJhY3RpdmUgPSBhdG9tLmNvbmZpZy5nZXQoJ2hhc2tlbGwtZ2hjLW1vZC5lbmFibGVHaGNNb2RpJylcbiAgICB9XG4gICAgaWYgKHRoaXMuY2Fwcy5vcHRwYXJzZSkge1xuICAgICAgYXJncyA9IGRhc2hBcmdzLmNvbmNhdChbJy0tJ10pLmNvbmNhdChhcmdzKVxuICAgIH0gZWxzZSB7XG4gICAgICBhcmdzID0gZGFzaEFyZ3MuY29uY2F0KGFyZ3MpXG4gICAgfVxuICAgIGNvbnN0IGZ1biA9IGludGVyYWN0aXZlID8gdGhpcy5ydW5Nb2RpQ21kLmJpbmQodGhpcykgOiB0aGlzLnJ1bk1vZENtZC5iaW5kKHRoaXMpXG4gICAgdHJ5IHtcbiAgICAgIGxldCByZXNcbiAgICAgIGlmICh1cmkgJiYgdGV4dCAmJiAhdGhpcy5jYXBzLmZpbGVNYXApIHtcbiAgICAgICAgY29uc3QgbXlPcHRzID0ge2doY01vZE9wdGlvbnMsIGNvbW1hbmQsIGFyZ3N9XG4gICAgICAgIHJlcyA9IHdpdGhUZW1wRmlsZSh0ZXh0LCB1cmksIGFzeW5jICh0ZW1wdXJpKSA9PiB7XG4gICAgICAgICAgY29uc3Qge3N0ZG91dCwgc3RkZXJyfSA9IGF3YWl0IGZ1bih7Li4ubXlPcHRzLCAgdXJpOiB0ZW1wdXJpfSlcbiAgICAgICAgICByZXR1cm4ge1xuICAgICAgICAgICAgc3Rkb3V0OiBzdGRvdXQubWFwKChsaW5lKSA9PiBsaW5lLnNwbGl0KHRlbXB1cmkpLmpvaW4odXJpKSksXG4gICAgICAgICAgICBzdGRlcnI6IHN0ZGVyci5tYXAoKGxpbmUpID0+IGxpbmUuc3BsaXQodGVtcHVyaSkuam9pbih1cmkpKVxuICAgICAgICAgIH1cbiAgICAgICAgfSlcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHJlcyA9IGZ1bih7Z2hjTW9kT3B0aW9ucywgY29tbWFuZCwgdGV4dCwgdXJpLCBhcmdzfSlcbiAgICAgIH1cbiAgICAgIGNvbnN0IHtzdGRvdXQsIHN0ZGVycn0gPSBhd2FpdCByZXNcbiAgICAgIGlmIChzdGRlcnIuam9pbignJykubGVuZ3RoKSB7XG4gICAgICAgIHRoaXMuZW1pdHRlci5lbWl0KCd3YXJuaW5nJywgc3RkZXJyLmpvaW4oJ1xcbicpKVxuICAgICAgfVxuICAgICAgcmV0dXJuIHN0ZG91dC5tYXAoKGxpbmUpID0+IGxpbmUucmVwbGFjZSgvXFwwL2csICdcXG4nKSlcbiAgICB9IGNhdGNoIChlcnIpIHtcbiAgICAgIGRlYnVnKGVycilcbiAgICAgIHRoaXMuZW1pdHRlci5lbWl0KCdlcnJvcicsIHtydW5BcmdzLCBlcnIsIGNhcHM6IHRoaXMuY2Fwc30pXG4gICAgICByZXR1cm4gW11cbiAgICB9XG4gIH1cblxuICBwdWJsaWMga2lsbFByb2Nlc3MgKCkge1xuICAgIGRlYnVnKGBLaWxsaW5nIGdoYy1tb2RpIHByb2Nlc3MgZm9yICR7dGhpcy5yb290RGlyLmdldFBhdGgoKX1gKVxuICAgIHRoaXMucHJvYyAmJiB0aGlzLnByb2Mua2lsbCgpXG4gIH1cblxuICBwdWJsaWMgZGVzdHJveSAoKSB7XG4gICAgZGVidWcoJ0doY01vZGlQcm9jZXNzQmFzZSBkZXN0cm95aW5nJylcbiAgICB0aGlzLmtpbGxQcm9jZXNzKClcbiAgICB0aGlzLmVtaXR0ZXIuZW1pdCgnZGlkLWRlc3Ryb3knLCB1bmRlZmluZWQpXG4gICAgdGhpcy5kaXNwb3NhYmxlcy5kaXNwb3NlKClcbiAgfVxuXG4gIHB1YmxpYyBvbkRpZERlc3Ryb3kgKGNhbGxiYWNrOiAoKSA9PiB2b2lkKSB7XG4gICAgcmV0dXJuIHRoaXMuZW1pdHRlci5vbignZGlkLWRlc3Ryb3knLCBjYWxsYmFjaylcbiAgfVxuXG4gIHB1YmxpYyBvbldhcm5pbmcgKGNhbGxiYWNrOiAod2FybmluZzogc3RyaW5nKSA9PiB2b2lkKSB7XG4gICAgcmV0dXJuIHRoaXMuZW1pdHRlci5vbignd2FybmluZycsIGNhbGxiYWNrKVxuICB9XG5cbiAgcHVibGljIG9uRXJyb3IgKGNhbGxiYWNrOiAoZXJyb3I6IElFcnJvckNhbGxiYWNrQXJncykgPT4gdm9pZCkge1xuICAgIHJldHVybiB0aGlzLmVtaXR0ZXIub24oJ2Vycm9yJywgY2FsbGJhY2spXG4gIH1cblxuICBwcml2YXRlIGFzeW5jIHNwYXduUHJvY2VzcyAoZ2hjTW9kT3B0aW9uczogc3RyaW5nW10pOiBQcm9taXNlPEludGVyYWN0aXZlUHJvY2VzcyB8IHVuZGVmaW5lZD4ge1xuICAgIGlmICghYXRvbS5jb25maWcuZ2V0KCdoYXNrZWxsLWdoYy1tb2QuZW5hYmxlR2hjTW9kaScpKSB7IHJldHVybiB9XG4gICAgZGVidWcoYENoZWNraW5nIGZvciBnaGMtbW9kaSBpbiAke3RoaXMucm9vdERpci5nZXRQYXRoKCl9YClcbiAgICBpZiAodGhpcy5wcm9jKSB7XG4gICAgICBpZiAoIV8uaXNFcXVhbCh0aGlzLmdoY01vZE9wdGlvbnMsIGdoY01vZE9wdGlvbnMpKSB7XG4gICAgICAgIGRlYnVnKGBGb3VuZCBydW5uaW5nIGdoYy1tb2RpIGluc3RhbmNlIGZvciAke3RoaXMucm9vdERpci5nZXRQYXRoKCl9LCBidXQgZ2hjTW9kT3B0aW9ucyBkb24ndCBtYXRjaC4gT2xkOiBgLFxuICAgICAgICAgICAgICB0aGlzLmdoY01vZE9wdGlvbnMsICcgbmV3OiAnLCBnaGNNb2RPcHRpb25zKVxuICAgICAgICBhd2FpdCB0aGlzLnByb2Mua2lsbCgpXG4gICAgICAgIHJldHVybiB0aGlzLnNwYXduUHJvY2VzcyhnaGNNb2RPcHRpb25zKVxuICAgICAgfVxuICAgICAgZGVidWcoYEZvdW5kIHJ1bm5pbmcgZ2hjLW1vZGkgaW5zdGFuY2UgZm9yICR7dGhpcy5yb290RGlyLmdldFBhdGgoKX1gKVxuICAgICAgcmV0dXJuIHRoaXMucHJvY1xuICAgIH1cbiAgICBkZWJ1ZyhgU3Bhd25pbmcgbmV3IGdoYy1tb2RpIGluc3RhbmNlIGZvciAke3RoaXMucm9vdERpci5nZXRQYXRoKCl9IHdpdGhgLCB0aGlzLm9wdGlvbnMpXG4gICAgY29uc3QgbW9kUGF0aCA9IGF0b20uY29uZmlnLmdldCgnaGFza2VsbC1naGMtbW9kLmdoY01vZFBhdGgnKVxuICAgIHRoaXMuZ2hjTW9kT3B0aW9ucyA9IGdoY01vZE9wdGlvbnNcbiAgICB0aGlzLnByb2MgPSBuZXcgSW50ZXJhY3RpdmVQcm9jZXNzKG1vZFBhdGgsIGdoY01vZE9wdGlvbnMuY29uY2F0KFsnbGVnYWN5LWludGVyYWN0aXZlJ10pLCB0aGlzLm9wdGlvbnMsIHRoaXMuY2FwcylcbiAgICB0aGlzLnByb2Mub25jZUV4aXQoKGNvZGUpID0+IHtcbiAgICAgIGRlYnVnKGBnaGMtbW9kaSBmb3IgJHt0aGlzLnJvb3REaXIuZ2V0UGF0aCgpfSBlbmRlZCB3aXRoICR7Y29kZX1gKVxuICAgICAgdGhpcy5wcm9jID0gdW5kZWZpbmVkXG4gICAgfSlcbiAgICByZXR1cm4gdGhpcy5wcm9jXG4gIH1cblxuICBwcml2YXRlIGFzeW5jIHJ1bk1vZENtZCAoXG4gICAge1xuICAgICAgZ2hjTW9kT3B0aW9ucywgY29tbWFuZCwgdGV4dCwgdXJpLCBhcmdzXG4gICAgfToge2doY01vZE9wdGlvbnM6IHN0cmluZ1tdLCBjb21tYW5kOiBzdHJpbmcsIHRleHQ/OiBzdHJpbmcsIHVyaT86IHN0cmluZywgYXJnczogc3RyaW5nW119XG4gICkge1xuICAgIGNvbnN0IG1vZFBhdGggPSBhdG9tLmNvbmZpZy5nZXQoJ2hhc2tlbGwtZ2hjLW1vZC5naGNNb2RQYXRoJylcbiAgICBjb25zdCByZXN1bHQgPSBbXVxuICAgIGNvbnN0IGVyciA9IFtdXG4gICAgbGV0IHN0ZGluXG4gICAgY29uc3QgY21kID0gWy4uLmdoY01vZE9wdGlvbnNdXG4gICAgaWYgKHRleHQgJiYgdXJpKSB7XG4gICAgICBjbWQucHVzaCgnLS1tYXAtZmlsZScsIHVyaSlcbiAgICAgIHN0ZGluID0gYCR7dGV4dH0ke0VPVH1gXG4gICAgfVxuICAgIGNtZC5wdXNoKGNvbW1hbmQpXG4gICAgaWYgKHVyaSkge1xuICAgICAgY21kLnB1c2godXJpKVxuICAgIH1cbiAgICBjbWQucHVzaCguLi5hcmdzKVxuICAgIGNvbnN0IHtzdGRvdXQsIHN0ZGVycn0gPSBhd2FpdCBVdGlsLmV4ZWNQcm9taXNlKG1vZFBhdGgsIGNtZCwgdGhpcy5vcHRpb25zLCBzdGRpbilcbiAgICByZXR1cm4gIHtcbiAgICAgIHN0ZG91dDogc3Rkb3V0LnNwbGl0KEVPTCkuc2xpY2UoMCwgLTEpLFxuICAgICAgc3RkZXJyOiBzdGRlcnIuc3BsaXQoRU9MKVxuICAgIH1cbiAgfVxuXG4gIHByaXZhdGUgYXN5bmMgcnVuTW9kaUNtZCAoXG4gICAgbzoge2doY01vZE9wdGlvbnM6IHN0cmluZ1tdLCBjb21tYW5kOiBzdHJpbmcsIHRleHQ/OiBzdHJpbmcsIHVyaT86IHN0cmluZywgYXJnczogc3RyaW5nW119XG4gICkge1xuICAgIGNvbnN0IHtnaGNNb2RPcHRpb25zLCBjb21tYW5kLCB0ZXh0LCBhcmdzfSA9IG9cbiAgICBsZXQge3VyaX0gPSBvXG4gICAgZGVidWcoYFRyeWluZyB0byBydW4gZ2hjLW1vZGkgaW4gJHt0aGlzLnJvb3REaXIuZ2V0UGF0aCgpfWApXG4gICAgY29uc3QgcHJvYyA9IGF3YWl0IHRoaXMuc3Bhd25Qcm9jZXNzKGdoY01vZE9wdGlvbnMpXG4gICAgaWYgKCFwcm9jKSB7XG4gICAgICBkZWJ1ZygnRmFpbGVkLiBGYWxsaW5nIGJhY2sgdG8gZ2hjLW1vZCcpXG4gICAgICByZXR1cm4gdGhpcy5ydW5Nb2RDbWQobylcbiAgICB9XG4gICAgZGVidWcoJ1N1Y2Nlc3MuIFJlc3VtaW5nLi4uJylcbiAgICBpZiAodXJpICYmICF0aGlzLmNhcHMucXVvdGVBcmdzKSB7IHVyaSA9IHRoaXMucm9vdERpci5yZWxhdGl2aXplKHVyaSkgfVxuICAgIHRyeSB7XG4gICAgICBpZiAodXJpICYmIHRleHQpIHtcbiAgICAgICAgYXdhaXQgcHJvYy5pbnRlcmFjdCgnbWFwLWZpbGUnLCBbdXJpXSwgdGV4dClcbiAgICAgIH1cbiAgICAgIGNvbnN0IHJlcyA9IGF3YWl0IHByb2MuaW50ZXJhY3QoY29tbWFuZCwgdXJpID8gW3VyaV0uY29uY2F0KGFyZ3MpIDogYXJncylcbiAgICAgIGlmICh1cmkgJiYgdGV4dCkge1xuICAgICAgICBhd2FpdCBwcm9jLmludGVyYWN0KCd1bm1hcC1maWxlJywgW3VyaV0pXG4gICAgICB9XG4gICAgICByZXR1cm4gcmVzXG4gICAgfSBmaW5hbGx5IHtcbiAgICAgIGlmICh1cmkgJiYgdGV4dCkge1xuICAgICAgICBhd2FpdCBwcm9jLmludGVyYWN0KCd1bm1hcC1maWxlJywgW3VyaV0pXG4gICAgICB9XG4gICAgfVxuICB9XG59XG4iXX0=