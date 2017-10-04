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
const { debug, withTempFile, EOT } = Util;
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
                            stderr: stderr.map((line) => line.split(tempuri).join(uri)),
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
                return undefined;
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
    runModCmd({ ghcModOptions, command, text, uri, args, }) {
        return __awaiter(this, void 0, void 0, function* () {
            const modPath = atom.config.get('haskell-ghc-mod.ghcModPath');
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
                stderr: stderr.split(os_1.EOL),
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZ2hjLW1vZGktcHJvY2Vzcy1yZWFsLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vLi4vc3JjL2doYy1tb2QvZ2hjLW1vZGktcHJvY2Vzcy1yZWFsLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7Ozs7Ozs7Ozs7QUFBQSwrQkFBNkQ7QUFDN0QsK0RBQXNFO0FBQ3RFLGdDQUErQjtBQUMvQixNQUFNLEVBQUUsS0FBSyxFQUFFLFlBQVksRUFBRSxHQUFHLEVBQUUsR0FBRyxJQUFJLENBQUE7QUFDekMsMkJBQXdCO0FBQ3hCLGdDQUErQjtBQTZCL0I7SUFVRSxZQUFvQixJQUFnQixFQUFVLE9BQTRCLEVBQVUsT0FBbUI7UUFBbkYsU0FBSSxHQUFKLElBQUksQ0FBWTtRQUFVLFlBQU8sR0FBUCxPQUFPLENBQXFCO1FBQVUsWUFBTyxHQUFQLE9BQU8sQ0FBWTtRQUNyRyxJQUFJLENBQUMsV0FBVyxHQUFHLElBQUksMEJBQW1CLEVBQUUsQ0FBQTtRQUM1QyxJQUFJLENBQUMsT0FBTyxHQUFHLElBQUksY0FBTyxFQUFFLENBQUE7UUFDNUIsSUFBSSxDQUFDLFdBQVcsQ0FBQyxHQUFHLENBQUMsSUFBSSxDQUFDLE9BQU8sQ0FBQyxDQUFBO0lBQ3BDLENBQUM7SUFFWSxHQUFHLENBQ2QsT0FBZ0I7O1lBRWhCLElBQUksRUFBRSxXQUFXLEVBQUUsUUFBUSxFQUFFLElBQUksRUFBRSxjQUFjLEVBQUUsVUFBVSxFQUFFLGFBQWEsRUFBRSxHQUFHLE9BQU8sQ0FBQTtZQUN4RixNQUFNLEVBQUUsT0FBTyxFQUFFLElBQUksRUFBRSxHQUFHLEVBQUUsR0FBRyxPQUFPLENBQUE7WUFDdEMsRUFBRSxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDO2dCQUFDLElBQUksR0FBRyxFQUFFLENBQUE7WUFBQyxDQUFDO1lBQ3hCLEVBQUUsQ0FBQyxDQUFDLENBQUMsUUFBUSxDQUFDLENBQUMsQ0FBQztnQkFBQyxRQUFRLEdBQUcsRUFBRSxDQUFBO1lBQUMs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bWl0dGVyLCBFbWl0dGVyLCBDb21wb3NpdGVEaXNwb3NhYmxlIH0gZnJvbSAnYXRvbSdcbmltcG9ydCB7IEludGVyYWN0aXZlUHJvY2VzcywgR0hDTW9kQ2FwcyB9IGZyb20gJy4vaW50ZXJhY3RpdmUtcHJvY2VzcydcbmltcG9ydCAqIGFzIFV0aWwgZnJvbSAnLi4vdXRpbCdcbmNvbnN0IHsgZGVidWcsIHdpdGhUZW1wRmlsZSwgRU9UIH0gPSBVdGlsXG5pbXBvcnQgeyBFT0wgfSBmcm9tICdvcydcbmltcG9ydCAqIGFzIF8gZnJvbSAndW5kZXJzY29yZSdcblxuZXhwb3J0IHsgR0hDTW9kQ2FwcyB9XG5cbmV4cG9ydCBpbnRlcmZhY2UgUnVuQXJncyB7XG4gIGludGVyYWN0aXZlPzogYm9vbGVhblxuICBjb21tYW5kOiBzdHJpbmdcbiAgdGV4dD86IHN0cmluZ1xuICB1cmk/OiBzdHJpbmdcbiAgZGFzaEFyZ3M/OiBzdHJpbmdbXVxuICBhcmdzPzogc3RyaW5nW11cbiAgc3VwcHJlc3NFcnJvcnM/OiBib29sZWFuXG4gIGdoY09wdGlvbnM/OiBzdHJpbmdbXVxuICBnaGNNb2RPcHRpb25zPzogc3RyaW5nW11cbn1cblxuZXhwb3J0IGludGVyZmFjZSBSdW5PcHRpb25zIHtcbiAgY3dkOiBzdHJpbmdcbiAgZW5jb2Rpbmc6ICd1dGY4J1xuICBlbnY6IHsgW2tleTogc3RyaW5nXTogc3RyaW5nIHwgdW5kZWZpbmVkIH1cbiAgbWF4QnVmZmVyOiBudW1iZXJcbn1cblxuZXhwb3J0IGludGVyZmFjZSBJRXJyb3JDYWxsYmFja0FyZ3Mge1xuICBydW5BcmdzPzogUnVuQXJnc1xuICBlcnI6IEVycm9yXG4gIGNhcHM6IEdIQ01vZENhcHNcbn1cblxuZXhwb3J0IGNsYXNzIEdoY01vZGlQcm9jZXNzUmVhbCB7XG4gIHByaXZhdGUgZGlzcG9zYWJsZXM6IENvbXBvc2l0ZURpc3Bvc2FibGVcbiAgcHJpdmF0ZSBlbWl0dGVyOiBURW1pdHRlcjx7XG4gICAgJ2RpZC1kZXN0cm95JzogdW5kZWZpbmVkXG4gICAgJ3dhcm5pbmcnOiBzdHJpbmdcbiAgICAnZXJyb3InOiBJRXJyb3JDYWxsYmFja0FyZ3NcbiAgfT5cbiAgcHJpdmF0ZSBnaGNNb2RPcHRpb25zOiBzdHJpbmdbXSB8IHVuZGVmaW5lZFxuICBwcml2YXRlIHByb2M6IEludGVyYWN0aXZlUHJvY2VzcyB8IHVuZGVmaW5lZFxuXG4gIGNvbnN0cnVjdG9yKHByaXZhdGUgY2FwczogR0hDTW9kQ2FwcywgcHJpdmF0ZSByb290RGlyOiBBdG9tVHlwZXMuRGlyZWN0b3J5LCBwcml2YXRlIG9wdGlvbnM6IFJ1bk9wdGlvbnMpIHtcbiAgICB0aGlzLmRpc3Bvc2FibGVzID0gbmV3IENvbXBvc2l0ZURpc3Bvc2FibGUoKVxuICAgIHRoaXMuZW1pdHRlciA9IG5ldyBFbWl0dGVyKClcbiAgICB0aGlzLmRpc3Bvc2FibGVzLmFkZCh0aGlzLmVtaXR0ZXIpXG4gIH1cblxuICBwdWJsaWMgYXN5bmMgcnVuKFxuICAgIHJ1bkFyZ3M6IFJ1bkFyZ3MsXG4gICkge1xuICAgIGxldCB7IGludGVyYWN0aXZlLCBkYXNoQXJncywgYXJncywgc3VwcHJlc3NFcnJvcnMsIGdoY09wdGlvbnMsIGdoY01vZE9wdGlvbnMgfSA9IHJ1bkFyZ3NcbiAgICBjb25zdCB7IGNvbW1hbmQsIHRleHQsIHVyaSB9ID0gcnVuQXJnc1xuICAgIGlmICghYXJncykgeyBhcmdzID0gW10gfVxuICAgIGlmICghZGFzaEFyZ3MpIHsgZGFzaEFyZ3MgPSBbXSB9XG4gICAgaWYgKCFzdXBwcmVzc0Vycm9ycykgeyBzdXBwcmVzc0Vycm9ycyA9IGZhbHNlIH1cbiAgICBpZiAoIWdoY09wdGlvbnMpIHsgZ2hjT3B0aW9ucyA9IFtdIH1cbiAgICBpZiAoIWdoY01vZE9wdGlvbnMpIHsgZ2hjTW9kT3B0aW9ucyA9IFtdIH1cbiAgICBnaGNNb2RPcHRpb25zID0gZ2hjTW9kT3B0aW9ucy5jb25jYXQoLi4uZ2hjT3B0aW9ucy5tYXAoKG9wdCkgPT4gWyctLWdoYy1vcHRpb24nLCBvcHRdKSlcbiAgICBpZiAoYXRvbS5jb25maWcuZ2V0KCdoYXNrZWxsLWdoYy1tb2QubG93TWVtb3J5U3lzdGVtJykpIHtcbiAgICAgIGludGVyYWN0aXZlID0gYXRvbS5jb25maWcuZ2V0KCdoYXNrZWxsLWdoYy1tb2QuZW5hYmxlR2hjTW9kaScpXG4gICAgfVxuICAgIGlmICh0aGlzLmNhcHMub3B0cGFyc2UpIHtcbiAgICAgIGFyZ3MgPSBkYXNoQXJncy5jb25jYXQoWyctLSddKS5jb25jYXQoYXJncylcbiAgICB9IGVsc2Uge1xuICAgICAgYXJncyA9IGRhc2hBcmdzLmNvbmNhdChhcmdzKVxuICAgIH1cbiAgICBjb25zdCBmdW4gPSBpbnRlcmFjdGl2ZSA/IHRoaXMucnVuTW9kaUNtZC5iaW5kKHRoaXMpIDogdGhpcy5ydW5Nb2RDbWQuYmluZCh0aGlzKVxuICAgIHRyeSB7XG4gICAgICBsZXQgcmVzXG4gICAgICBpZiAodXJpICYmIHRleHQgJiYgIXRoaXMuY2Fwcy5maWxlTWFwKSB7XG4gICAgICAgIGNvbnN0IG15T3B0cyA9IHsgZ2hjTW9kT3B0aW9ucywgY29tbWFuZCwgYXJncyB9XG4gICAgICAgIHJlcyA9IHdpdGhUZW1wRmlsZSh0ZXh0LCB1cmksIGFzeW5jICh0ZW1wdXJpKSA9PiB7XG4gICAgICAgICAgY29uc3QgeyBzdGRvdXQsIHN0ZGVyciB9ID0gYXdhaXQgZnVuKHsgLi4ubXlPcHRzLCB1cmk6IHRlbXB1cmkgfSlcbiAgICAgICAgICByZXR1cm4ge1xuICAgICAgICAgICAgc3Rkb3V0OiBzdGRvdXQubWFwKChsaW5lKSA9PiBsaW5lLnNwbGl0KHRlbXB1cmkpLmpvaW4odXJpKSksXG4gICAgICAgICAgICBzdGRlcnI6IHN0ZGVyci5tYXAoKGxpbmUpID0+IGxpbmUuc3BsaXQodGVtcHVyaSkuam9pbih1cmkpKSxcbiAgICAgICAgICB9XG4gICAgICAgIH0pXG4gICAgICB9IGVsc2Uge1xuICAgICAgICByZXMgPSBmdW4oeyBnaGNNb2RPcHRpb25zLCBjb21tYW5kLCB0ZXh0LCB1cmksIGFyZ3MgfSlcbiAgICAgIH1cbiAgICAgIGNvbnN0IHsgc3Rkb3V0LCBzdGRlcnIgfSA9IGF3YWl0IHJlc1xuICAgICAgaWYgKHN0ZGVyci5qb2luKCcnKS5sZW5ndGgpIHtcbiAgICAgICAgdGhpcy5lbWl0dGVyLmVtaXQoJ3dhcm5pbmcnLCBzdGRlcnIuam9pbignXFxuJykpXG4gICAgICB9XG4gICAgICByZXR1cm4gc3Rkb3V0Lm1hcCgobGluZSkgPT4gbGluZS5yZXBsYWNlKC9cXDAvZywgJ1xcbicpKVxuICAgIH0gY2F0Y2ggKGVycikge1xuICAgICAgZGVidWcoZXJyKVxuICAgICAgdGhpcy5lbWl0dGVyLmVtaXQoJ2Vycm9yJywgeyBydW5BcmdzLCBlcnIsIGNhcHM6IHRoaXMuY2FwcyB9KVxuICAgICAgcmV0dXJuIFtdXG4gICAgfVxuICB9XG5cbiAgcHVibGljIGtpbGxQcm9jZXNzKCkge1xuICAgIGRlYnVnKGBLaWxsaW5nIGdoYy1tb2RpIHByb2Nlc3MgZm9yICR7dGhpcy5yb290RGlyLmdldFBhdGgoKX1gKVxuICAgIHRoaXMucHJvYyAmJiB0aGlzLnByb2Mua2lsbCgpXG4gIH1cblxuICBwdWJsaWMgZGVzdHJveSgpIHtcbiAgICBkZWJ1ZygnR2hjTW9kaVByb2Nlc3NCYXNlIGRlc3Ryb3lpbmcnKVxuICAgIHRoaXMua2lsbFByb2Nlc3MoKVxuICAgIHRoaXMuZW1pdHRlci5lbWl0KCdkaWQtZGVzdHJveScsIHVuZGVmaW5lZClcbiAgICB0aGlzLmRpc3Bvc2FibGVzLmRpc3Bvc2UoKVxuICB9XG5cbiAgcHVibGljIG9uRGlkRGVzdHJveShjYWxsYmFjazogKCkgPT4gdm9pZCkge1xuICAgIHJldHVybiB0aGlzLmVtaXR0ZXIub24oJ2RpZC1kZXN0cm95JywgY2FsbGJhY2spXG4gIH1cblxuICBwdWJsaWMgb25XYXJuaW5nKGNhbGxiYWNrOiAod2FybmluZzogc3RyaW5nKSA9PiB2b2lkKSB7XG4gICAgcmV0dXJuIHRoaXMuZW1pdHRlci5vbignd2FybmluZycsIGNhbGxiYWNrKVxuICB9XG5cbiAgcHVibGljIG9uRXJyb3IoY2FsbGJhY2s6IChlcnJvcjogSUVycm9yQ2FsbGJhY2tBcmdzKSA9PiB2b2lkKSB7XG4gICAgcmV0dXJuIHRoaXMuZW1pdHRlci5vbignZXJyb3InLCBjYWxsYmFjaylcbiAgfVxuXG4gIHByaXZhdGUgYXN5bmMgc3Bhd25Qcm9jZXNzKGdoY01vZE9wdGlvbnM6IHN0cmluZ1tdKTogUHJvbWlzZTxJbnRlcmFjdGl2ZVByb2Nlc3MgfCB1bmRlZmluZWQ+IHtcbiAgICBpZiAoIWF0b20uY29uZmlnLmdldCgnaGFza2VsbC1naGMtbW9kLmVuYWJsZUdoY01vZGknKSkgeyByZXR1cm4gdW5kZWZpbmVkIH1cbiAgICBkZWJ1ZyhgQ2hlY2tpbmcgZm9yIGdoYy1tb2RpIGluICR7dGhpcy5yb290RGlyLmdldFBhdGgoKX1gKVxuICAgIGlmICh0aGlzLnByb2MpIHtcbiAgICAgIGlmICghXy5pc0VxdWFsKHRoaXMuZ2hjTW9kT3B0aW9ucywgZ2hjTW9kT3B0aW9ucykpIHtcbiAgICAgICAgZGVidWcoXG4gICAgICAgICAgYEZvdW5kIHJ1bm5pbmcgZ2hjLW1vZGkgaW5zdGFuY2UgZm9yICR7dGhpcy5yb290RGlyLmdldFBhdGgoKX0sIGJ1dCBnaGNNb2RPcHRpb25zIGRvbid0IG1hdGNoLiBPbGQ6IGAsXG4gICAgICAgICAgdGhpcy5naGNNb2RPcHRpb25zLCAnIG5ldzogJywgZ2hjTW9kT3B0aW9ucyxcbiAgICAgICAgKVxuICAgICAgICBhd2FpdCB0aGlzLnByb2Mua2lsbCgpXG4gICAgICAgIHJldHVybiB0aGlzLnNwYXduUHJvY2VzcyhnaGNNb2RPcHRpb25zKVxuICAgICAgfVxuICAgICAgZGVidWcoYEZvdW5kIHJ1bm5pbmcgZ2hjLW1vZGkgaW5zdGFuY2UgZm9yICR7dGhpcy5yb290RGlyLmdldFBhdGgoKX1gKVxuICAgICAgcmV0dXJuIHRoaXMucHJvY1xuICAgIH1cbiAgICBkZWJ1ZyhgU3Bhd25pbmcgbmV3IGdoYy1tb2RpIGluc3RhbmNlIGZvciAke3RoaXMucm9vdERpci5nZXRQYXRoKCl9IHdpdGhgLCB0aGlzLm9wdGlvbnMpXG4gICAgY29uc3QgbW9kUGF0aCA9IGF0b20uY29uZmlnLmdldCgnaGFza2VsbC1naGMtbW9kLmdoY01vZFBhdGgnKVxuICAgIHRoaXMuZ2hjTW9kT3B0aW9ucyA9IGdoY01vZE9wdGlvbnNcbiAgICB0aGlzLnByb2MgPSBuZXcgSW50ZXJhY3RpdmVQcm9jZXNzKG1vZFBhdGgsIGdoY01vZE9wdGlvbnMuY29uY2F0KFsnbGVnYWN5LWludGVyYWN0aXZlJ10pLCB0aGlzLm9wdGlvbnMsIHRoaXMuY2FwcylcbiAgICB0aGlzLnByb2Mub25jZUV4aXQoKGNvZGUpID0+IHtcbiAgICAgIGRlYnVnKGBnaGMtbW9kaSBmb3IgJHt0aGlzLnJvb3REaXIuZ2V0UGF0aCgpfSBlbmRlZCB3aXRoICR7Y29kZX1gKVxuICAgICAgdGhpcy5wcm9jID0gdW5kZWZpbmVkXG4gICAgfSlcbiAgICByZXR1cm4gdGhpcy5wcm9jXG4gIH1cblxuICBwcml2YXRlIGFzeW5jIHJ1bk1vZENtZChcbiAgICB7XG4gICAgICBnaGNNb2RPcHRpb25zLCBjb21tYW5kLCB0ZXh0LCB1cmksIGFyZ3MsXG4gICAgfTogeyBnaGNNb2RPcHRpb25zOiBzdHJpbmdbXSwgY29tbWFuZDogc3RyaW5nLCB0ZXh0Pzogc3RyaW5nLCB1cmk/OiBzdHJpbmcsIGFyZ3M6IHN0cmluZ1tdIH0sXG4gICkge1xuICAgIGNvbnN0IG1vZFBhdGggPSBhdG9tLmNvbmZpZy5nZXQoJ2hhc2tlbGwtZ2hjLW1vZC5naGNNb2RQYXRoJylcbiAgICBsZXQgc3RkaW5cbiAgICBjb25zdCBjbWQgPSBbLi4uZ2hjTW9kT3B0aW9uc11cbiAgICBpZiAodGV4dCAmJiB1cmkpIHtcbiAgICAgIGNtZC5wdXNoKCctLW1hcC1maWxlJywgdXJpKVxuICAgICAgc3RkaW4gPSBgJHt0ZXh0fSR7RU9UfWBcbiAgICB9XG4gICAgY21kLnB1c2goY29tbWFuZClcbiAgICBpZiAodXJpKSB7XG4gICAgICBjbWQucHVzaCh1cmkpXG4gICAgfVxuICAgIGNtZC5wdXNoKC4uLmFyZ3MpXG4gICAgY29uc3QgeyBzdGRvdXQsIHN0ZGVyciB9ID0gYXdhaXQgVXRpbC5leGVjUHJvbWlzZShtb2RQYXRoLCBjbWQsIHRoaXMub3B0aW9ucywgc3RkaW4pXG4gICAgcmV0dXJuIHtcbiAgICAgIHN0ZG91dDogc3Rkb3V0LnNwbGl0KEVPTCkuc2xpY2UoMCwgLTEpLFxuICAgICAgc3RkZXJyOiBzdGRlcnIuc3BsaXQoRU9MKSxcbiAgICB9XG4gIH1cblxuICBwcml2YXRlIGFzeW5jIHJ1bk1vZGlDbWQoXG4gICAgbzogeyBnaGNNb2RPcHRpb25zOiBzdHJpbmdbXSwgY29tbWFuZDogc3RyaW5nLCB0ZXh0Pzogc3RyaW5nLCB1cmk/OiBzdHJpbmcsIGFyZ3M6IHN0cmluZ1tdIH0sXG4gICkge1xuICAgIGNvbnN0IHsgZ2hjTW9kT3B0aW9ucywgY29tbWFuZCwgdGV4dCwgYXJncyB9ID0gb1xuICAgIGxldCB7IHVyaSB9ID0gb1xuICAgIGRlYnVnKGBUcnlpbmcgdG8gcnVuIGdoYy1tb2RpIGluICR7dGhpcy5yb290RGlyLmdldFBhdGgoKX1gKVxuICAgIGNvbnN0IHByb2MgPSBhd2FpdCB0aGlzLnNwYXduUHJvY2VzcyhnaGNNb2RPcHRpb25zKVxuICAgIGlmICghcHJvYykge1xuICAgICAgZGVidWcoJ0ZhaWxlZC4gRmFsbGluZyBiYWNrIHRvIGdoYy1tb2QnKVxuICAgICAgcmV0dXJuIHRoaXMucnVuTW9kQ21kKG8pXG4gICAgfVxuICAgIGRlYnVnKCdTdWNjZXNzLiBSZXN1bWluZy4uLicpXG4gICAgaWYgKHVyaSAmJiAhdGhpcy5jYXBzLnF1b3RlQXJncykgeyB1cmkgPSB0aGlzLnJvb3REaXIucmVsYXRpdml6ZSh1cmkpIH1cbiAgICB0cnkge1xuICAgICAgaWYgKHVyaSAmJiB0ZXh0KSB7XG4gICAgICAgIGF3YWl0IHByb2MuaW50ZXJhY3QoJ21hcC1maWxlJywgW3VyaV0sIHRleHQpXG4gICAgICB9XG4gICAgICBjb25zdCByZXMgPSBhd2FpdCBwcm9jLmludGVyYWN0KGNvbW1hbmQsIHVyaSA/IFt1cmldLmNvbmNhdChhcmdzKSA6IGFyZ3MpXG4gICAgICBpZiAodXJpICYmIHRleHQpIHtcbiAgICAgICAgYXdhaXQgcHJvYy5pbnRlcmFjdCgndW5tYXAtZmlsZScsIFt1cmldKVxuICAgICAgfVxuICAgICAgcmV0dXJuIHJlc1xuICAgIH0gZmluYWxseSB7XG4gICAgICBpZiAodXJpICYmIHRleHQpIHtcbiAgICAgICAgYXdhaXQgcHJvYy5pbnRlcmFjdCgndW5tYXAtZmlsZScsIFt1cmldKVxuICAgICAgfVxuICAgIH1cbiAgfVxufVxuIl19