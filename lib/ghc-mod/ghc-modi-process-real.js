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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZ2hjLW1vZGktcHJvY2Vzcy1yZWFsLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vLi4vc3JjL2doYy1tb2QvZ2hjLW1vZGktcHJvY2Vzcy1yZWFsLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7Ozs7Ozs7Ozs7QUFPQSwrQkFBOEQ7QUFFOUQsK0RBQW9FO0FBQ3BFLGdDQUErQjtBQUMvQixNQUFNLEVBQUMsS0FBSyxFQUFFLElBQUksRUFBRSxPQUFPLEVBQUUsWUFBWSxFQUFFLEdBQUcsRUFBQyxHQUFHLElBQUksQ0FBQTtBQUV0RCxnQ0FBK0I7QUF1Qi9CO0lBTUUsWUFBcUIsSUFBZ0IsRUFBVSxPQUE0QixFQUFVLE9BQW1CO1FBQW5GLFNBQUksR0FBSixJQUFJLENBQVk7UUFBVSxZQUFPLEdBQVAsT0FBTyxDQUFxQjtRQUFVLFlBQU8sR0FBUCxPQUFPLENBQVk7UUFDdEcsSUFBSSxDQUFDLFdBQVcsR0FBRyxJQUFJLDBCQUFtQixFQUFFLENBQUE7UUFDNUMsSUFBSSxDQUFDLE9BQU8sR0FBRyxJQUFJLGNBQU8sRUFBRSxDQUFBO1FBQzVCLElBQUksQ0FBQyxXQUFXLENBQUMsR0FBRyxDQUFDLElBQUksQ0FBQyxPQUFPLENBQUMsQ0FBQTtJQUNwQyxDQUFDO0lBRVksR0FBRyxDQUNkLEVBQUMsV0FBVyxFQUFFLE9BQU8sRUFBRSxJQUFJLEVBQUUsR0FBRyxFQUFFLFFBQVEsRUFBRSxJQUFJLEVBQUUsY0FBYyxFQUFFLFVBQVUsRUFBRSxhQUFhLEVBQVU7O1lBRXJHLEVBQUUsQ0FBQyxDQUFDLENBQUUsSUFBSSxDQUFDLENBQUMsQ0FBQztnQkFBQyxJQUFJLEdBQUcsRUFBRSxDQUFBO1lBQUMsQ0FBQztZQUN6QixFQUFFLENBQUMsQ0FBQyxDQUFFLFFBQVEsQ0FBQyxDQUFDLENBQUM7Z0JBQUMsUUFBUSxHQUFHLEVBQUUsQ0FBQTtZQUFDLENBQUM7WUFDakMsRUFBRSxDQUFDLENBQUMsQ0FBRSxjQUFjLENBQUMsQ0FBQyxDQUFDO2dCQUFD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QUMsRUFBRSxJQUFJLENBQUMsQ0FBQTtnQkFDOUMsQ0FBQztnQkFDRCxNQUFNLEdBQUcsR0FBRyxNQUFNLElBQUksQ0FBQyxRQUFRLENBQUMsT0FBTyxFQUFFLEdBQUcsR0FBRyxDQUFDLEdBQUcsQ0FBQyxDQUFDLE1BQU0sQ0FBQyxJQUFJLENBQUMsR0FBRyxJQUFJLENBQUMsQ0FBQTtnQkFDekUsRUFBRSxDQUFDLENBQUMsR0FBRyxJQUFJLElBQUksQ0FBQyxDQUFDLENBQUM7b0JBQ2hCLE1BQU0sSUFBSSxDQUFDLFFBQVEsQ0FBQyxZQUFZLEVBQUUsQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFBO2dCQUMxQyxDQUFDO2dCQUNELE1BQU0sQ0FBQyxHQUFHLENBQUE7WUFDWixDQUFDO29CQUFTLENBQUM7Z0JBQ1QsRUFBRSxDQUFDLENBQUMsR0FBRyxJQUFJLElBQUksQ0FBQyxDQUFDLENBQUM7b0JBQ2hCLE1BQU0sSUFBSSxDQUFDLFFBQVEsQ0FBQyxZQUFZLEVBQUUsQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFBO2dCQUMxQyxDQUFDO1lBQ0gsQ0FBQztRQUNILENBQUM7S0FBQTtDQUNGO0FBbk1ELGdEQW1NQyIsInNvdXJjZXNDb250ZW50IjpbIi8qXG4gKiBkZWNhZmZlaW5hdGUgc3VnZ2VzdGlvbnM6XG4gKiBEUzEwMTogUmVtb3ZlIHVubmVjZXNzYXJ5IHVzZSBvZiBBcnJheS5mcm9tXG4gKiBEUzEwMjogUmVtb3ZlIHVubmVjZXNzYXJ5IGNvZGUgY3JlYXRlZCBiZWNhdXNlIG9mIGltcGxpY2l0IHJldHVybnNcbiAqIERTMjA3OiBDb25zaWRlciBzaG9ydGVyIHZhcmlhdGlvbnMgb2YgbnVsbCBjaGVja3NcbiAqIEZ1bGwgZG9jczogaHR0cHM6Ly9naXRodWIuY29tL2RlY2FmZmVpbmF0ZS9kZWNhZmZlaW5hdGUvYmxvYi9tYXN0ZXIvZG9jcy9zdWdnZXN0aW9ucy5tZFxuICovXG5pbXBvcnQgeyBFbWl0dGVyLCBDb21wb3NpdGVEaXNwb3NhYmxlLCBEaXJlY3RvcnkgfSBmcm9tICdhdG9tJ1xuaW1wb3J0ICogYXMgQ1AgZnJvbSAnY2hpbGRfcHJvY2VzcydcbmltcG9ydCB7SW50ZXJhY3RpdmVQcm9jZXNzLCBHSENNb2RDYXBzfSBmcm9tICcuL2ludGVyYWN0aXZlLXByb2Nlc3MnXG5pbXBvcnQgKiBhcyBVdGlsIGZyb20gJy4uL3V0aWwnXG5jb25zdCB7ZGVidWcsIHdhcm4sIG1rRXJyb3IsIHdpdGhUZW1wRmlsZSwgRU9UfSA9IFV0aWxcbmltcG9ydCB7IEVPTCB9IGZyb20gJ29zJ1xuaW1wb3J0ICogYXMgXyBmcm9tICd1bmRlcnNjb3JlJ1xuXG5leHBvcnQgeyBHSENNb2RDYXBzIH1cblxuZXhwb3J0IGludGVyZmFjZSBSdW5BcmdzIHtcbiAgaW50ZXJhY3RpdmU/OiBib29sZWFuXG4gIGNvbW1hbmQ6IHN0cmluZ1xuICB0ZXh0Pzogc3RyaW5nXG4gIHVyaT86IHN0cmluZ1xuICBkYXNoQXJncz86IHN0cmluZ1tdIHwgKChjYXBzOiBHSENNb2RDYXBzKSA9PiBzdHJpbmdbXSlcbiAgYXJncz86IHN0cmluZ1tdXG4gIHN1cHByZXNzRXJyb3JzPzogYm9vbGVhblxuICBnaGNPcHRpb25zPzogc3RyaW5nW11cbiAgZ2hjTW9kT3B0aW9ucz86IHN0cmluZ1tdXG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgUnVuT3B0aW9ucyB7XG4gIGN3ZDogc3RyaW5nXG4gIGVuY29kaW5nOiAndXRmOCdcbiAgZW52OiB7IFtrZXk6IHN0cmluZ106IHN0cmluZyB8IHVuZGVmaW5lZCB9XG4gIG1heEJ1ZmZlcjogbnVtYmVyXG59XG5cbmV4cG9ydCBjbGFzcyBHaGNNb2RpUHJvY2Vzc1JlYWwge1xuICBwcml2YXRlIGRpc3Bvc2FibGVzOiBDb21wb3NpdGVEaXNwb3NhYmxlXG4gIHByaXZhdGUgZW1pdHRlcjogRW1pdHRlclxuICBwcml2YXRlIGdoY01vZE9wdGlvbnM6IHN0cmluZ1tdXG4gIHByaXZhdGUgcHJvYzogSW50ZXJhY3RpdmVQcm9jZXNzIHwgdW5kZWZpbmVkXG5cbiAgY29uc3RydWN0b3IgKHByaXZhdGUgY2FwczogR0hDTW9kQ2FwcywgcHJpdmF0ZSByb290RGlyOiBBdG9tVHlwZXMuRGlyZWN0b3J5LCBwcml2YXRlIG9wdGlvbnM6IFJ1bk9wdGlvbnMpIHtcbiAgICB0aGlzLmRpc3Bvc2FibGVzID0gbmV3IENvbXBvc2l0ZURpc3Bvc2FibGUoKVxuICAgIHRoaXMuZW1pdHRlciA9IG5ldyBFbWl0dGVyKClcbiAgICB0aGlzLmRpc3Bvc2FibGVzLmFkZCh0aGlzLmVtaXR0ZXIpXG4gIH1cblxuICBwdWJsaWMgYXN5bmMgcnVuIChcbiAgICB7aW50ZXJhY3RpdmUsIGNvbW1hbmQsIHRleHQsIHVyaSwgZGFzaEFyZ3MsIGFyZ3MsIHN1cHByZXNzRXJyb3JzLCBnaGNPcHRpb25zLCBnaGNNb2RPcHRpb25zfTogUnVuQXJnc1xuICApIHtcbiAgICBpZiAoISBhcmdzKSB7IGFyZ3MgPSBbXSB9XG4gICAgaWYgKCEgZGFzaEFyZ3MpIHsgZGFzaEFyZ3MgPSBbXSB9XG4gICAgaWYgKCEgc3VwcHJlc3NFcnJvcnMpIHsgc3VwcHJlc3NFcnJvcnMgPSBmYWxzZSB9XG4gICAgaWYgKCEgZ2hjT3B0aW9ucykgeyBnaGNPcHRpb25zID0gW10gfVxuICAgIGlmICghIGdoY01vZE9wdGlvbnMpIHsgZ2hjTW9kT3B0aW9ucyA9IFtdIH1cbiAgICBnaGNNb2RPcHRpb25zID0gZ2hjTW9kT3B0aW9ucy5jb25jYXQoLi4uZ2hjT3B0aW9ucy5tYXAoKG9wdCkgPT4gWyctLWdoYy1vcHRpb24nLCBvcHRdKSlcbiAgICBpZiAoYXRvbS5jb25maWcuZ2V0KCdoYXNrZWxsLWdoYy1tb2QubG93TWVtb3J5U3lzdGVtJykpIHtcbiAgICAgIGludGVyYWN0aXZlID0gYXRvbS5jb25maWcuZ2V0KCdoYXNrZWxsLWdoYy1tb2QuZW5hYmxlR2hjTW9kaScpXG4gICAgfVxuICAgIGlmICh0eXBlb2YoZGFzaEFyZ3MpID09PSAnZnVuY3Rpb24nKSB7XG4gICAgICBkYXNoQXJncyA9IGRhc2hBcmdzKHRoaXMuY2FwcylcbiAgICB9XG4gICAgaWYgKHRoaXMuY2Fwcy5vcHRwYXJzZSkge1xuICAgICAgYXJncyA9IGRhc2hBcmdzLmNvbmNhdChbJy0tJ10pLmNvbmNhdChhcmdzKVxuICAgIH0gZWxzZSB7XG4gICAgICBhcmdzID0gZGFzaEFyZ3MuY29uY2F0KGFyZ3MpXG4gICAgfVxuICAgIGNvbnN0IGZ1biA9IGludGVyYWN0aXZlID8gdGhpcy5ydW5Nb2RpQ21kLmJpbmQodGhpcykgOiB0aGlzLnJ1bk1vZENtZC5iaW5kKHRoaXMpXG4gICAgdHJ5IHtcbiAgICAgIGxldCByZXNcbiAgICAgIGlmICh1cmkgJiYgdGV4dCAmJiAhdGhpcy5jYXBzLmZpbGVNYXApIHtcbiAgICAgICAgY29uc3QgbXlPcHRzID0ge2doY01vZE9wdGlvbnMsIGNvbW1hbmQsIGFyZ3N9XG4gICAgICAgIHJlcyA9IHdpdGhUZW1wRmlsZSh0ZXh0LCB1cmksIGFzeW5jICh0ZW1wdXJpKSA9PiB7XG4gICAgICAgICAgY29uc3Qge3N0ZG91dCwgc3RkZXJyfSA9IGF3YWl0IGZ1bih7Li4ubXlPcHRzLCAgdXJpOiB0ZW1wdXJpfSlcbiAgICAgICAgICByZXR1cm4ge1xuICAgICAgICAgICAgc3Rkb3V0OiBzdGRvdXQubWFwKChsaW5lKSA9PiBsaW5lLnNwbGl0KHRlbXB1cmkpLmpvaW4odXJpKSksXG4gICAgICAgICAgICBzdGRlcnI6IHN0ZGVyci5tYXAoKGxpbmUpID0+IGxpbmUuc3BsaXQodGVtcHVyaSkuam9pbih1cmkpKVxuICAgICAgICAgIH1cbiAgICAgICAgfSlcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHJlcyA9IGZ1bih7Z2hjTW9kT3B0aW9ucywgY29tbWFuZCwgdGV4dCwgdXJpLCBhcmdzfSlcbiAgICAgIH1cbiAgICAgIGNvbnN0IHtzdGRvdXQsIHN0ZGVycn0gPSBhd2FpdCByZXNcbiAgICAgIGlmIChzdGRlcnIuam9pbignJykubGVuZ3RoKSB7XG4gICAgICAgIGF0b20ubm90aWZpY2F0aW9ucy5hZGRXYXJuaW5nKCdnaGMtbW9kIHdhcm5pbmcnLCB7XG4gICAgICAgICAgZGV0YWlsOiBzdGRlcnIuam9pbignXFxuJylcbiAgICAgICAgfSlcbiAgICAgIH1cbiAgICAgIHJldHVybiBzdGRvdXQubWFwKChsaW5lKSA9PiBsaW5lLnJlcGxhY2UoL1xcMC9nLCAnXFxuJykpXG4gICAgfSBjYXRjaCAoZXJyKSB7XG4gICAgICBkZWJ1ZyhlcnIpXG4gICAgICBpZiAoZXJyLm5hbWUgPT09ICdJbnRlcmFjdGl2ZUFjdGlvblRpbWVvdXQnKSB7XG4gICAgICAgIGF0b20ubm90aWZpY2F0aW9ucy5hZGRFcnJvcihcbiAgICAgICAgICBgXFxcbkhhc2tlbGwtZ2hjLW1vZDogZ2hjLW1vZCBcXFxuJHtpbnRlcmFjdGl2ZSA/ICdpbnRlcmFjdGl2ZSAnIDogJyd9Y29tbWFuZCAke2NvbW1hbmR9IFxcXG50aW1lZCBvdXQuIFlvdSBjYW4gdHJ5IHRvIGZpeCBpdCBieSByYWlzaW5nICdJbnRlcmFjdGl2ZSBBY3Rpb24gXFxcblRpbWVvdXQnIHNldHRpbmcgaW4gaGFza2VsbC1naGMtbW9kIHNldHRpbmdzLmAsXG4gICAgICAgICAge1xuICAgICAgICAgICAgZGV0YWlsOiBgXFxcbmNhcHM6ICR7SlNPTi5zdHJpbmdpZnkodGhpcy5jYXBzKX1cblVSSTogJHt1cml9XG5BcmdzOiAke2NvbW1hbmR9ICR7ZGFzaEFyZ3N9IC0tICR7YXJnc31cbm1lc3NhZ2U6ICR7ZXJyLm1lc3NhZ2V9XFxcbmAsXG4gICAgICAgICAgICBzdGFjazogZXJyLnN0YWNrLFxuICAgICAgICAgICAgZGlzbWlzc2FibGU6IHRydWVcbiAgICAgICAgICB9XG4gICAgICAgIClcbiAgICAgIH0gZWxzZSBpZiAoIXN1cHByZXNzRXJyb3JzKSB7XG4gICAgICAgIGF0b20ubm90aWZpY2F0aW9ucy5hZGRGYXRhbEVycm9yKFxuICAgICAgICAgIGBcXFxuSGFza2VsbC1naGMtbW9kOiBnaGMtbW9kIFxcXG4ke2ludGVyYWN0aXZlID8gJ2ludGVyYWN0aXZlICcgOiAnJ31jb21tYW5kICR7Y29tbWFuZH0gXFxcbmZhaWxlZCB3aXRoIGVycm9yICR7ZXJyLm5hbWV9YCxcbiAgICAgICAgICB7XG4gICAgICAgICAgICBkZXRhaWw6IGBcXFxuY2FwczogJHtKU09OLnN0cmluZ2lmeSh0aGlzLmNhcHMpfVxuVVJJOiAke3VyaX1cbkFyZ3M6ICR7YXJnc31cbm1lc3NhZ2U6ICR7ZXJyLm1lc3NhZ2V9XG5sb2c6XG4ke1V0aWwuZ2V0RGVidWdMb2coKX1cXFxuYCxcbiAgICAgICAgICAgIHN0YWNrOiBlcnIuc3RhY2ssXG4gICAgICAgICAgICBkaXNtaXNzYWJsZTogdHJ1ZVxuICAgICAgICAgIH1cbiAgICAgICAgKVxuICAgICAgfSBlbHNlIHtcbiAgICAgICAgLy8gdHNsaW50OmRpc2FibGUtbmV4dC1saW5lOiBuby1jb25zb2xlXG4gICAgICAgIGNvbnNvbGUuZXJyb3IoZXJyKVxuICAgICAgfVxuICAgICAgcmV0dXJuIFtdXG4gICAgfVxuICB9XG5cbiAgcHVibGljIGtpbGxQcm9jZXNzICgpIHtcbiAgICBkZWJ1ZyhgS2lsbGluZyBnaGMtbW9kaSBwcm9jZXNzIGZvciAke3RoaXMucm9vdERpci5nZXRQYXRoKCl9YClcbiAgICB0aGlzLnByb2MgJiYgdGhpcy5wcm9jLmtpbGwoKVxuICB9XG5cbiAgcHVibGljIGRlc3Ryb3kgKCkge1xuICAgIGRlYnVnKCdHaGNNb2RpUHJvY2Vzc0Jhc2UgZGVzdHJveWluZycpXG4gICAgdGhpcy5raWxsUHJvY2VzcygpXG4gICAgdGhpcy5lbWl0dGVyLmVtaXQoJ2RpZC1kZXN0cm95JylcbiAgICB0aGlzLmRpc3Bvc2FibGVzLmRpc3Bvc2UoKVxuICB9XG5cbiAgcHVibGljIG9uRGlkRGVzdHJveSAoY2FsbGJhY2s6ICgpID0+IHZvaWQpIHtcbiAgICB0aGlzLmVtaXR0ZXIub24oJ2RpZC1kZXN0cm95JywgY2FsbGJhY2spXG4gIH1cblxuICBwcml2YXRlIGFzeW5jIHNwYXduUHJvY2VzcyAoZ2hjTW9kT3B0aW9uczogc3RyaW5nW10pOiBQcm9taXNlPEludGVyYWN0aXZlUHJvY2VzcyB8IHVuZGVmaW5lZD4ge1xuICAgIGlmICghYXRvbS5jb25maWcuZ2V0KCdoYXNrZWxsLWdoYy1tb2QuZW5hYmxlR2hjTW9kaScpKSB7IHJldHVybiB9XG4gICAgZGVidWcoYENoZWNraW5nIGZvciBnaGMtbW9kaSBpbiAke3RoaXMucm9vdERpci5nZXRQYXRoKCl9YClcbiAgICBpZiAodGhpcy5wcm9jKSB7XG4gICAgICBpZiAoIV8uaXNFcXVhbCh0aGlzLmdoY01vZE9wdGlvbnMsIGdoY01vZE9wdGlvbnMpKSB7XG4gICAgICAgIGRlYnVnKGBGb3VuZCBydW5uaW5nIGdoYy1tb2RpIGluc3RhbmNlIGZvciAke3RoaXMucm9vdERpci5nZXRQYXRoKCl9LCBidXQgZ2hjTW9kT3B0aW9ucyBkb24ndCBtYXRjaC4gT2xkOiBgLFxuICAgICAgICAgICAgICB0aGlzLmdoY01vZE9wdGlvbnMsICcgbmV3OiAnLCBnaGNNb2RPcHRpb25zKVxuICAgICAgICBhd2FpdCB0aGlzLnByb2Mua2lsbCgpXG4gICAgICAgIHJldHVybiB0aGlzLnNwYXduUHJvY2VzcyhnaGNNb2RPcHRpb25zKVxuICAgICAgfVxuICAgICAgZGVidWcoYEZvdW5kIHJ1bm5pbmcgZ2hjLW1vZGkgaW5zdGFuY2UgZm9yICR7dGhpcy5yb290RGlyLmdldFBhdGgoKX1gKVxuICAgICAgcmV0dXJuIHRoaXMucHJvY1xuICAgIH1cbiAgICBkZWJ1ZyhgU3Bhd25pbmcgbmV3IGdoYy1tb2RpIGluc3RhbmNlIGZvciAke3RoaXMucm9vdERpci5nZXRQYXRoKCl9IHdpdGhgLCB0aGlzLm9wdGlvbnMpXG4gICAgY29uc3QgbW9kUGF0aCA9IGF0b20uY29uZmlnLmdldCgnaGFza2VsbC1naGMtbW9kLmdoY01vZFBhdGgnKVxuICAgIHRoaXMuZ2hjTW9kT3B0aW9ucyA9IGdoY01vZE9wdGlvbnNcbiAgICB0aGlzLnByb2MgPSBuZXcgSW50ZXJhY3RpdmVQcm9jZXNzKG1vZFBhdGgsIGdoY01vZE9wdGlvbnMuY29uY2F0KFsnbGVnYWN5LWludGVyYWN0aXZlJ10pLCB0aGlzLm9wdGlvbnMsIHRoaXMuY2FwcylcbiAgICB0aGlzLnByb2Mub25jZUV4aXQoKGNvZGUpID0+IHtcbiAgICAgIGRlYnVnKGBnaGMtbW9kaSBmb3IgJHt0aGlzLnJvb3REaXIuZ2V0UGF0aCgpfSBlbmRlZCB3aXRoICR7Y29kZX1gKVxuICAgICAgcmV0dXJuIHRoaXMucHJvYyA9IHVuZGVmaW5lZFxuICAgIH0pXG4gICAgcmV0dXJuIHRoaXMucHJvY1xuICB9XG5cbiAgcHJpdmF0ZSBhc3luYyBydW5Nb2RDbWQgKFxuICAgIHtcbiAgICAgIGdoY01vZE9wdGlvbnMsIGNvbW1hbmQsIHRleHQsIHVyaSwgYXJnc1xuICAgIH06IHtnaGNNb2RPcHRpb25zOiBzdHJpbmdbXSwgY29tbWFuZDogc3RyaW5nLCB0ZXh0Pzogc3RyaW5nLCB1cmk/OiBzdHJpbmcsIGFyZ3M6IHN0cmluZ1tdfVxuICApIHtcbiAgICBjb25zdCBtb2RQYXRoID0gYXRvbS5jb25maWcuZ2V0KCdoYXNrZWxsLWdoYy1tb2QuZ2hjTW9kUGF0aCcpXG4gICAgY29uc3QgcmVzdWx0ID0gW11cbiAgICBjb25zdCBlcnIgPSBbXVxuICAgIGxldCBzdGRpblxuICAgIGNvbnN0IGNtZCA9IFsuLi5naGNNb2RPcHRpb25zXVxuICAgIGlmICh0ZXh0ICYmIHVyaSkge1xuICAgICAgY21kLnB1c2goJy0tbWFwLWZpbGUnLCB1cmkpXG4gICAgICBzdGRpbiA9IGAke3RleHR9JHtFT1R9YFxuICAgIH1cbiAgICBjbWQucHVzaChjb21tYW5kKVxuICAgIGlmICh1cmkpIHtcbiAgICAgIGNtZC5wdXNoKHVyaSlcbiAgICB9XG4gICAgY21kLnB1c2goLi4uYXJncylcbiAgICBjb25zdCB7c3Rkb3V0LCBzdGRlcnJ9ID0gYXdhaXQgVXRpbC5leGVjUHJvbWlzZShtb2RQYXRoLCBjbWQsIHRoaXMub3B0aW9ucywgc3RkaW4pXG4gICAgcmV0dXJuICB7XG4gICAgICBzdGRvdXQ6IHN0ZG91dC5zcGxpdCgnXFxuJykuc2xpY2UoMCwgLTEpLFxuICAgICAgc3RkZXJyOiBzdGRlcnIuc3BsaXQoJ1xcbicpXG4gICAgfVxuICB9XG5cbiAgcHJpdmF0ZSBhc3luYyBydW5Nb2RpQ21kIChcbiAgICBvOiB7Z2hjTW9kT3B0aW9uczogc3RyaW5nW10sIGNvbW1hbmQ6IHN0cmluZywgdGV4dD86IHN0cmluZywgdXJpPzogc3RyaW5nLCBhcmdzOiBzdHJpbmdbXX1cbiAgKSB7XG4gICAgY29uc3Qge2doY01vZE9wdGlvbnMsIGNvbW1hbmQsIHRleHQsIGFyZ3N9ID0gb1xuICAgIGxldCB7dXJpfSA9IG9cbiAgICBkZWJ1ZyhgVHJ5aW5nIHRvIHJ1biBnaGMtbW9kaSBpbiAke3RoaXMucm9vdERpci5nZXRQYXRoKCl9YClcbiAgICBjb25zdCBwcm9jID0gYXdhaXQgdGhpcy5zcGF3blByb2Nlc3MoZ2hjTW9kT3B0aW9ucylcbiAgICBpZiAoIXByb2MpIHtcbiAgICAgIGRlYnVnKCdGYWlsZWQuIEZhbGxpbmcgYmFjayB0byBnaGMtbW9kJylcbiAgICAgIHJldHVybiB0aGlzLnJ1bk1vZENtZChvKVxuICAgIH1cbiAgICBkZWJ1ZygnU3VjY2Vzcy4gUmVzdW1pbmcuLi4nKVxuICAgIGlmICh1cmkgJiYgIXRoaXMuY2Fwcy5xdW90ZUFyZ3MpIHsgdXJpID0gdGhpcy5yb290RGlyLnJlbGF0aXZpemUodXJpKSB9XG4gICAgdHJ5IHtcbiAgICAgIGlmICh1cmkgJiYgdGV4dCkge1xuICAgICAgICBhd2FpdCBwcm9jLmludGVyYWN0KCdtYXAtZmlsZScsIFt1cmldLCB0ZXh0KVxuICAgICAgfVxuICAgICAgY29uc3QgcmVzID0gYXdhaXQgcHJvYy5pbnRlcmFjdChjb21tYW5kLCB1cmkgPyBbdXJpXS5jb25jYXQoYXJncykgOiBhcmdzKVxuICAgICAgaWYgKHVyaSAmJiB0ZXh0KSB7XG4gICAgICAgIGF3YWl0IHByb2MuaW50ZXJhY3QoJ3VubWFwLWZpbGUnLCBbdXJpXSlcbiAgICAgIH1cbiAgICAgIHJldHVybiByZXNcbiAgICB9IGZpbmFsbHkge1xuICAgICAgaWYgKHVyaSAmJiB0ZXh0KSB7XG4gICAgICAgIGF3YWl0IHByb2MuaW50ZXJhY3QoJ3VubWFwLWZpbGUnLCBbdXJpXSlcbiAgICAgIH1cbiAgICB9XG4gIH1cbn1cbiJdfQ==