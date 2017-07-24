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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZ2hjLW1vZGktcHJvY2Vzcy1yZWFsLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vLi4vc3JjL2doYy1tb2QvZ2hjLW1vZGktcHJvY2Vzcy1yZWFsLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7Ozs7Ozs7Ozs7QUFBQSwrQkFBOEQ7QUFFOUQsK0RBQW9FO0FBQ3BFLGdDQUErQjtBQUMvQixNQUFNLEVBQUMsS0FBSyxFQUFFLElBQUksRUFBRSxPQUFPLEVBQUUsWUFBWSxFQUFFLEdBQUcsRUFBQyxHQUFHLElBQUksQ0FBQTtBQUV0RCxnQ0FBK0I7QUE2Qi9CO0lBVUUsWUFBcUIsSUFBZ0IsRUFBVSxPQUE0QixFQUFVLE9BQW1CO1FBQW5GLFNBQUksR0FBSixJQUFJLENBQVk7UUFBVSxZQUFPLEdBQVAsT0FBTyxDQUFxQjtRQUFVLFlBQU8sR0FBUCxPQUFPLENBQVk7UUFDdEcsSUFBSSxDQUFDLFdBQVcsR0FBRyxJQUFJLDBCQUFtQixFQUFFLENBQUE7UUFDNUMsSUFBSSxDQUFDLE9BQU8sR0FBRyxJQUFJLGNBQU8sRUFBRSxDQUFBO1FBQzVCLElBQUksQ0FBQyxXQUFXLENBQUMsR0FBRyxDQUFDLElBQUksQ0FBQyxPQUFPLENBQUMsQ0FBQTtJQUNwQyxDQUFDO0lBRVksR0FBRyxDQUNkLE9BQWdCOztZQUVoQixJQUFJLEVBQUMsV0FBVyxFQUFFLFFBQVEsRUFBRSxJQUFJLEVBQUUsY0FBYyxFQUFFLFVBQVUsRUFBRSxhQUFhLEVBQUMsR0FBRyxPQUFPLENBQUE7WUFDdEYsTUFBTSxFQUFDLE9BQU8sRUFBRSxJQUFJLEVBQUUsR0FBRyxFQUFDLEdBQUcsT0FBTyxDQUFBO1lBQ3BDLEVBQUUsQ0FBQyxDQUFDLENBQUUsSUFBSSxDQUFDLENBQUMsQ0FBQztnQkFBQyxJQUFJLEdBQUcsRUFBRSxDQUFBO1lBQUMsQ0FBQztZQUN6QixFQUFFLENBQUMsQ0FBQyxDQUFFLFFBQVEsQ0FBQyxDQUFDLENBQUM7Z0JBQUMsUUFBUSxHQUFHLEVBQUUsQ0FB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QUFBO1lBQzFCLENBQUM7WUFDRCxLQUFLLENBQUMsc0JBQXNCLENBQUMsQ0FBQTtZQUM3QixFQUFFLENBQUMsQ0FBQyxHQUFHLElBQUksQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLFNBQVMsQ0FBQyxDQUFDLENBQUM7Z0JBQUMsR0FBRyxHQUFHLElBQUksQ0FBQyxPQUFPLENBQUMsVUFBVSxDQUFDLEdBQUcsQ0FBQyxDQUFBO1lBQUMsQ0FBQztZQUN2RSxJQUFJLENBQUM7Z0JBQ0gsRUFBRSxDQUFDLENBQUMsR0FBRyxJQUFJLElBQUksQ0FBQyxDQUFDLENBQUM7b0JBQ2hCLE1BQU0sSUFBSSxDQUFDLFFBQVEsQ0FBQyxVQUFVLEVBQUUsQ0FBQyxHQUFHLENBQUMsRUFBRSxJQUFJLENBQUMsQ0FBQTtnQkFDOUMsQ0FBQztnQkFDRCxNQUFNLEdBQUcsR0FBRyxNQUFNLElBQUksQ0FBQyxRQUFRLENBQUMsT0FBTyxFQUFFLEdBQUcsR0FBRyxDQUFDLEdBQUcsQ0FBQyxDQUFDLE1BQU0sQ0FBQyxJQUFJLENBQUMsR0FBRyxJQUFJLENBQUMsQ0FBQTtnQkFDekUsRUFBRSxDQUFDLENBQUMsR0FBRyxJQUFJLElBQUksQ0FBQyxDQUFDLENBQUM7b0JBQ2hCLE1BQU0sSUFBSSxDQUFDLFFBQVEsQ0FBQyxZQUFZLEVBQUUsQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFBO2dCQUMxQyxDQUFDO2dCQUNELE1BQU0sQ0FBQyxHQUFHLENBQUE7WUFDWixDQUFDO29CQUFTLENBQUM7Z0JBQ1QsRUFBRSxDQUFDLENBQUMsR0FBRyxJQUFJLElBQUksQ0FBQyxDQUFDLENBQUM7b0JBQ2hCLE1BQU0sSUFBSSxDQUFDLFFBQVEsQ0FBQyxZQUFZLEVBQUUsQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFBO2dCQUMxQyxDQUFDO1lBQ0gsQ0FBQztRQUNILENBQUM7S0FBQTtDQUNGO0FBcEtELGdEQW9LQyIsInNvdXJjZXNDb250ZW50IjpbImltcG9ydCB7IEVtaXR0ZXIsIENvbXBvc2l0ZURpc3Bvc2FibGUsIERpcmVjdG9yeSB9IGZyb20gJ2F0b20nXG5pbXBvcnQgKiBhcyBDUCBmcm9tICdjaGlsZF9wcm9jZXNzJ1xuaW1wb3J0IHtJbnRlcmFjdGl2ZVByb2Nlc3MsIEdIQ01vZENhcHN9IGZyb20gJy4vaW50ZXJhY3RpdmUtcHJvY2VzcydcbmltcG9ydCAqIGFzIFV0aWwgZnJvbSAnLi4vdXRpbCdcbmNvbnN0IHtkZWJ1Zywgd2FybiwgbWtFcnJvciwgd2l0aFRlbXBGaWxlLCBFT1R9ID0gVXRpbFxuaW1wb3J0IHsgRU9MIH0gZnJvbSAnb3MnXG5pbXBvcnQgKiBhcyBfIGZyb20gJ3VuZGVyc2NvcmUnXG5cbmV4cG9ydCB7IEdIQ01vZENhcHMgfVxuXG5leHBvcnQgaW50ZXJmYWNlIFJ1bkFyZ3Mge1xuICBpbnRlcmFjdGl2ZT86IGJvb2xlYW5cbiAgY29tbWFuZDogc3RyaW5nXG4gIHRleHQ/OiBzdHJpbmdcbiAgdXJpPzogc3RyaW5nXG4gIGRhc2hBcmdzPzogc3RyaW5nW11cbiAgYXJncz86IHN0cmluZ1tdXG4gIHN1cHByZXNzRXJyb3JzPzogYm9vbGVhblxuICBnaGNPcHRpb25zPzogc3RyaW5nW11cbiAgZ2hjTW9kT3B0aW9ucz86IHN0cmluZ1tdXG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgUnVuT3B0aW9ucyB7XG4gIGN3ZDogc3RyaW5nXG4gIGVuY29kaW5nOiAndXRmOCdcbiAgZW52OiB7IFtrZXk6IHN0cmluZ106IHN0cmluZyB8IHVuZGVmaW5lZCB9XG4gIG1heEJ1ZmZlcjogbnVtYmVyXG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSUVycm9yQ2FsbGJhY2tBcmdzIHtcbiAgcnVuQXJncz86IFJ1bkFyZ3NcbiAgZXJyOiBFcnJvclxuICBjYXBzOiBHSENNb2RDYXBzXG59XG5cbmV4cG9ydCBjbGFzcyBHaGNNb2RpUHJvY2Vzc1JlYWwge1xuICBwcml2YXRlIGRpc3Bvc2FibGVzOiBDb21wb3NpdGVEaXNwb3NhYmxlXG4gIHByaXZhdGUgZW1pdHRlcjogTXlFbWl0dGVyPHtcbiAgICAnZGlkLWRlc3Ryb3knOiB1bmRlZmluZWRcbiAgICAnd2FybmluZyc6IHN0cmluZ1xuICAgICdlcnJvcic6IElFcnJvckNhbGxiYWNrQXJnc1xuICB9PlxuICBwcml2YXRlIGdoY01vZE9wdGlvbnM6IHN0cmluZ1tdXG4gIHByaXZhdGUgcHJvYzogSW50ZXJhY3RpdmVQcm9jZXNzIHwgdW5kZWZpbmVkXG5cbiAgY29uc3RydWN0b3IgKHByaXZhdGUgY2FwczogR0hDTW9kQ2FwcywgcHJpdmF0ZSByb290RGlyOiBBdG9tVHlwZXMuRGlyZWN0b3J5LCBwcml2YXRlIG9wdGlvbnM6IFJ1bk9wdGlvbnMpIHtcbiAgICB0aGlzLmRpc3Bvc2FibGVzID0gbmV3IENvbXBvc2l0ZURpc3Bvc2FibGUoKVxuICAgIHRoaXMuZW1pdHRlciA9IG5ldyBFbWl0dGVyKClcbiAgICB0aGlzLmRpc3Bvc2FibGVzLmFkZCh0aGlzLmVtaXR0ZXIpXG4gIH1cblxuICBwdWJsaWMgYXN5bmMgcnVuIChcbiAgICBydW5BcmdzOiBSdW5BcmdzXG4gICkge1xuICAgIGxldCB7aW50ZXJhY3RpdmUsIGRhc2hBcmdzLCBhcmdzLCBzdXBwcmVzc0Vycm9ycywgZ2hjT3B0aW9ucywgZ2hjTW9kT3B0aW9uc30gPSBydW5BcmdzXG4gICAgY29uc3Qge2NvbW1hbmQsIHRleHQsIHVyaX0gPSBydW5BcmdzXG4gICAgaWYgKCEgYXJncykgeyBhcmdzID0gW10gfVxuICAgIGlmICghIGRhc2hBcmdzKSB7IGRhc2hBcmdzID0gW10gfVxuICAgIGlmICghIHN1cHByZXNzRXJyb3JzKSB7IHN1cHByZXNzRXJyb3JzID0gZmFsc2UgfVxuICAgIGlmICghIGdoY09wdGlvbnMpIHsgZ2hjT3B0aW9ucyA9IFtdIH1cbiAgICBpZiAoISBnaGNNb2RPcHRpb25zKSB7IGdoY01vZE9wdGlvbnMgPSBbXSB9XG4gICAgZ2hjTW9kT3B0aW9ucyA9IGdoY01vZE9wdGlvbnMuY29uY2F0KC4uLmdoY09wdGlvbnMubWFwKChvcHQpID0+IFsnLS1naGMtb3B0aW9uJywgb3B0XSkpXG4gICAgaWYgKGF0b20uY29uZmlnLmdldCgnaGFza2VsbC1naGMtbW9kLmxvd01lbW9yeVN5c3RlbScpKSB7XG4gICAgICBpbnRlcmFjdGl2ZSA9IGF0b20uY29uZmlnLmdldCgnaGFza2VsbC1naGMtbW9kLmVuYWJsZUdoY01vZGknKVxuICAgIH1cbiAgICBpZiAodGhpcy5jYXBzLm9wdHBhcnNlKSB7XG4gICAgICBhcmdzID0gZGFzaEFyZ3MuY29uY2F0KFsnLS0nXSkuY29uY2F0KGFyZ3MpXG4gICAgfSBlbHNlIHtcbiAgICAgIGFyZ3MgPSBkYXNoQXJncy5jb25jYXQoYXJncylcbiAgICB9XG4gICAgY29uc3QgZnVuID0gaW50ZXJhY3RpdmUgPyB0aGlzLnJ1bk1vZGlDbWQuYmluZCh0aGlzKSA6IHRoaXMucnVuTW9kQ21kLmJpbmQodGhpcylcbiAgICB0cnkge1xuICAgICAgbGV0IHJlc1xuICAgICAgaWYgKHVyaSAmJiB0ZXh0ICYmICF0aGlzLmNhcHMuZmlsZU1hcCkge1xuICAgICAgICBjb25zdCBteU9wdHMgPSB7Z2hjTW9kT3B0aW9ucywgY29tbWFuZCwgYXJnc31cbiAgICAgICAgcmVzID0gd2l0aFRlbXBGaWxlKHRleHQsIHVyaSwgYXN5bmMgKHRlbXB1cmkpID0+IHtcbiAgICAgICAgICBjb25zdCB7c3Rkb3V0LCBzdGRlcnJ9ID0gYXdhaXQgZnVuKHsuLi5teU9wdHMsICB1cmk6IHRlbXB1cml9KVxuICAgICAgICAgIHJldHVybiB7XG4gICAgICAgICAgICBzdGRvdXQ6IHN0ZG91dC5tYXAoKGxpbmUpID0+IGxpbmUuc3BsaXQodGVtcHVyaSkuam9pbih1cmkpKSxcbiAgICAgICAgICAgIHN0ZGVycjogc3RkZXJyLm1hcCgobGluZSkgPT4gbGluZS5zcGxpdCh0ZW1wdXJpKS5qb2luKHVyaSkpXG4gICAgICAgICAgfVxuICAgICAgICB9KVxuICAgICAgfSBlbHNlIHtcbiAgICAgICAgcmVzID0gZnVuKHtnaGNNb2RPcHRpb25zLCBjb21tYW5kLCB0ZXh0LCB1cmksIGFyZ3N9KVxuICAgICAgfVxuICAgICAgY29uc3Qge3N0ZG91dCwgc3RkZXJyfSA9IGF3YWl0IHJlc1xuICAgICAgaWYgKHN0ZGVyci5qb2luKCcnKS5sZW5ndGgpIHtcbiAgICAgICAgdGhpcy5lbWl0dGVyLmVtaXQoJ3dhcm5pbmcnLCBzdGRlcnIuam9pbignXFxuJykpXG4gICAgICB9XG4gICAgICByZXR1cm4gc3Rkb3V0Lm1hcCgobGluZSkgPT4gbGluZS5yZXBsYWNlKC9cXDAvZywgJ1xcbicpKVxuICAgIH0gY2F0Y2ggKGVycikge1xuICAgICAgZGVidWcoZXJyKVxuICAgICAgdGhpcy5lbWl0dGVyLmVtaXQoJ2Vycm9yJywge3J1bkFyZ3MsIGVyciwgY2FwczogdGhpcy5jYXBzfSlcbiAgICAgIHJldHVybiBbXVxuICAgIH1cbiAgfVxuXG4gIHB1YmxpYyBraWxsUHJvY2VzcyAoKSB7XG4gICAgZGVidWcoYEtpbGxpbmcgZ2hjLW1vZGkgcHJvY2VzcyBmb3IgJHt0aGlzLnJvb3REaXIuZ2V0UGF0aCgpfWApXG4gICAgdGhpcy5wcm9jICYmIHRoaXMucHJvYy5raWxsKClcbiAgfVxuXG4gIHB1YmxpYyBkZXN0cm95ICgpIHtcbiAgICBkZWJ1ZygnR2hjTW9kaVByb2Nlc3NCYXNlIGRlc3Ryb3lpbmcnKVxuICAgIHRoaXMua2lsbFByb2Nlc3MoKVxuICAgIHRoaXMuZW1pdHRlci5lbWl0KCdkaWQtZGVzdHJveScsIHVuZGVmaW5lZClcbiAgICB0aGlzLmRpc3Bvc2FibGVzLmRpc3Bvc2UoKVxuICB9XG5cbiAgcHVibGljIG9uRGlkRGVzdHJveSAoY2FsbGJhY2s6ICgpID0+IHZvaWQpIHtcbiAgICByZXR1cm4gdGhpcy5lbWl0dGVyLm9uKCdkaWQtZGVzdHJveScsIGNhbGxiYWNrKVxuICB9XG5cbiAgcHVibGljIG9uV2FybmluZyAoY2FsbGJhY2s6ICh3YXJuaW5nOiBzdHJpbmcpID0+IHZvaWQpIHtcbiAgICByZXR1cm4gdGhpcy5lbWl0dGVyLm9uKCd3YXJuaW5nJywgY2FsbGJhY2spXG4gIH1cblxuICBwdWJsaWMgb25FcnJvciAoY2FsbGJhY2s6IChlcnJvcjogSUVycm9yQ2FsbGJhY2tBcmdzKSA9PiB2b2lkKSB7XG4gICAgcmV0dXJuIHRoaXMuZW1pdHRlci5vbignZXJyb3InLCBjYWxsYmFjaylcbiAgfVxuXG4gIHByaXZhdGUgYXN5bmMgc3Bhd25Qcm9jZXNzIChnaGNNb2RPcHRpb25zOiBzdHJpbmdbXSk6IFByb21pc2U8SW50ZXJhY3RpdmVQcm9jZXNzIHwgdW5kZWZpbmVkPiB7XG4gICAgaWYgKCFhdG9tLmNvbmZpZy5nZXQoJ2hhc2tlbGwtZ2hjLW1vZC5lbmFibGVHaGNNb2RpJykpIHsgcmV0dXJuIH1cbiAgICBkZWJ1ZyhgQ2hlY2tpbmcgZm9yIGdoYy1tb2RpIGluICR7dGhpcy5yb290RGlyLmdldFBhdGgoKX1gKVxuICAgIGlmICh0aGlzLnByb2MpIHtcbiAgICAgIGlmICghXy5pc0VxdWFsKHRoaXMuZ2hjTW9kT3B0aW9ucywgZ2hjTW9kT3B0aW9ucykpIHtcbiAgICAgICAgZGVidWcoYEZvdW5kIHJ1bm5pbmcgZ2hjLW1vZGkgaW5zdGFuY2UgZm9yICR7dGhpcy5yb290RGlyLmdldFBhdGgoKX0sIGJ1dCBnaGNNb2RPcHRpb25zIGRvbid0IG1hdGNoLiBPbGQ6IGAsXG4gICAgICAgICAgICAgIHRoaXMuZ2hjTW9kT3B0aW9ucywgJyBuZXc6ICcsIGdoY01vZE9wdGlvbnMpXG4gICAgICAgIGF3YWl0IHRoaXMucHJvYy5raWxsKClcbiAgICAgICAgcmV0dXJuIHRoaXMuc3Bhd25Qcm9jZXNzKGdoY01vZE9wdGlvbnMpXG4gICAgICB9XG4gICAgICBkZWJ1ZyhgRm91bmQgcnVubmluZyBnaGMtbW9kaSBpbnN0YW5jZSBmb3IgJHt0aGlzLnJvb3REaXIuZ2V0UGF0aCgpfWApXG4gICAgICByZXR1cm4gdGhpcy5wcm9jXG4gICAgfVxuICAgIGRlYnVnKGBTcGF3bmluZyBuZXcgZ2hjLW1vZGkgaW5zdGFuY2UgZm9yICR7dGhpcy5yb290RGlyLmdldFBhdGgoKX0gd2l0aGAsIHRoaXMub3B0aW9ucylcbiAgICBjb25zdCBtb2RQYXRoID0gYXRvbS5jb25maWcuZ2V0KCdoYXNrZWxsLWdoYy1tb2QuZ2hjTW9kUGF0aCcpXG4gICAgdGhpcy5naGNNb2RPcHRpb25zID0gZ2hjTW9kT3B0aW9uc1xuICAgIHRoaXMucHJvYyA9IG5ldyBJbnRlcmFjdGl2ZVByb2Nlc3MobW9kUGF0aCwgZ2hjTW9kT3B0aW9ucy5jb25jYXQoWydsZWdhY3ktaW50ZXJhY3RpdmUnXSksIHRoaXMub3B0aW9ucywgdGhpcy5jYXBzKVxuICAgIHRoaXMucHJvYy5vbmNlRXhpdCgoY29kZSkgPT4ge1xuICAgICAgZGVidWcoYGdoYy1tb2RpIGZvciAke3RoaXMucm9vdERpci5nZXRQYXRoKCl9IGVuZGVkIHdpdGggJHtjb2RlfWApXG4gICAgICB0aGlzLnByb2MgPSB1bmRlZmluZWRcbiAgICB9KVxuICAgIHJldHVybiB0aGlzLnByb2NcbiAgfVxuXG4gIHByaXZhdGUgYXN5bmMgcnVuTW9kQ21kIChcbiAgICB7XG4gICAgICBnaGNNb2RPcHRpb25zLCBjb21tYW5kLCB0ZXh0LCB1cmksIGFyZ3NcbiAgICB9OiB7Z2hjTW9kT3B0aW9uczogc3RyaW5nW10sIGNvbW1hbmQ6IHN0cmluZywgdGV4dD86IHN0cmluZywgdXJpPzogc3RyaW5nLCBhcmdzOiBzdHJpbmdbXX1cbiAgKSB7XG4gICAgY29uc3QgbW9kUGF0aCA9IGF0b20uY29uZmlnLmdldCgnaGFza2VsbC1naGMtbW9kLmdoY01vZFBhdGgnKVxuICAgIGNvbnN0IHJlc3VsdCA9IFtdXG4gICAgY29uc3QgZXJyID0gW11cbiAgICBsZXQgc3RkaW5cbiAgICBjb25zdCBjbWQgPSBbLi4uZ2hjTW9kT3B0aW9uc11cbiAgICBpZiAodGV4dCAmJiB1cmkpIHtcbiAgICAgIGNtZC5wdXNoKCctLW1hcC1maWxlJywgdXJpKVxuICAgICAgc3RkaW4gPSBgJHt0ZXh0fSR7RU9UfWBcbiAgICB9XG4gICAgY21kLnB1c2goY29tbWFuZClcbiAgICBpZiAodXJpKSB7XG4gICAgICBjbWQucHVzaCh1cmkpXG4gICAgfVxuICAgIGNtZC5wdXNoKC4uLmFyZ3MpXG4gICAgY29uc3Qge3N0ZG91dCwgc3RkZXJyfSA9IGF3YWl0IFV0aWwuZXhlY1Byb21pc2UobW9kUGF0aCwgY21kLCB0aGlzLm9wdGlvbnMsIHN0ZGluKVxuICAgIHJldHVybiAge1xuICAgICAgc3Rkb3V0OiBzdGRvdXQuc3BsaXQoJ1xcbicpLnNsaWNlKDAsIC0xKSxcbiAgICAgIHN0ZGVycjogc3RkZXJyLnNwbGl0KCdcXG4nKVxuICAgIH1cbiAgfVxuXG4gIHByaXZhdGUgYXN5bmMgcnVuTW9kaUNtZCAoXG4gICAgbzoge2doY01vZE9wdGlvbnM6IHN0cmluZ1tdLCBjb21tYW5kOiBzdHJpbmcsIHRleHQ/OiBzdHJpbmcsIHVyaT86IHN0cmluZywgYXJnczogc3RyaW5nW119XG4gICkge1xuICAgIGNvbnN0IHtnaGNNb2RPcHRpb25zLCBjb21tYW5kLCB0ZXh0LCBhcmdzfSA9IG9cbiAgICBsZXQge3VyaX0gPSBvXG4gICAgZGVidWcoYFRyeWluZyB0byBydW4gZ2hjLW1vZGkgaW4gJHt0aGlzLnJvb3REaXIuZ2V0UGF0aCgpfWApXG4gICAgY29uc3QgcHJvYyA9IGF3YWl0IHRoaXMuc3Bhd25Qcm9jZXNzKGdoY01vZE9wdGlvbnMpXG4gICAgaWYgKCFwcm9jKSB7XG4gICAgICBkZWJ1ZygnRmFpbGVkLiBGYWxsaW5nIGJhY2sgdG8gZ2hjLW1vZCcpXG4gICAgICByZXR1cm4gdGhpcy5ydW5Nb2RDbWQobylcbiAgICB9XG4gICAgZGVidWcoJ1N1Y2Nlc3MuIFJlc3VtaW5nLi4uJylcbiAgICBpZiAodXJpICYmICF0aGlzLmNhcHMucXVvdGVBcmdzKSB7IHVyaSA9IHRoaXMucm9vdERpci5yZWxhdGl2aXplKHVyaSkgfVxuICAgIHRyeSB7XG4gICAgICBpZiAodXJpICYmIHRleHQpIHtcbiAgICAgICAgYXdhaXQgcHJvYy5pbnRlcmFjdCgnbWFwLWZpbGUnLCBbdXJpXSwgdGV4dClcbiAgICAgIH1cbiAgICAgIGNvbnN0IHJlcyA9IGF3YWl0IHByb2MuaW50ZXJhY3QoY29tbWFuZCwgdXJpID8gW3VyaV0uY29uY2F0KGFyZ3MpIDogYXJncylcbiAgICAgIGlmICh1cmkgJiYgdGV4dCkge1xuICAgICAgICBhd2FpdCBwcm9jLmludGVyYWN0KCd1bm1hcC1maWxlJywgW3VyaV0pXG4gICAgICB9XG4gICAgICByZXR1cm4gcmVzXG4gICAgfSBmaW5hbGx5IHtcbiAgICAgIGlmICh1cmkgJiYgdGV4dCkge1xuICAgICAgICBhd2FpdCBwcm9jLmludGVyYWN0KCd1bm1hcC1maWxlJywgW3VyaV0pXG4gICAgICB9XG4gICAgfVxuICB9XG59XG4iXX0=