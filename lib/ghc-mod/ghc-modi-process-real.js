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
        this.runModCmd = ({ ghcModOptions, command, text, uri, args, }) => __awaiter(this, void 0, void 0, function* () {
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
        this.runModiCmd = (o) => __awaiter(this, void 0, void 0, function* () {
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
        this.disposables = new atom_1.CompositeDisposable();
        this.emitter = new atom_1.Emitter();
        this.disposables.add(this.emitter);
    }
    getCaps() {
        return this.caps;
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
            const fun = interactive ? this.runModiCmd : this.runModCmd;
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
}
exports.GhcModiProcessReal = GhcModiProcessReal;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZ2hjLW1vZGktcHJvY2Vzcy1yZWFsLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vLi4vc3JjL2doYy1tb2QvZ2hjLW1vZGktcHJvY2Vzcy1yZWFsLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7Ozs7Ozs7Ozs7QUFBQSwrQkFBNkQ7QUFDN0QsK0RBQXNFO0FBQ3RFLGdDQUErQjtBQUMvQixNQUFNLEVBQUUsS0FBSyxFQUFFLFlBQVksRUFBRSxHQUFHLEVBQUUsR0FBRyxJQUFJLENBQUE7QUFDekMsMkJBQXdCO0FBQ3hCLGdDQUErQjtBQTZCL0I7SUFVRSxZQUFvQixJQUFnQixFQUFVLE9BQTRCLEVBQVUsT0FBbUI7UUFBbkYsU0FBSSxHQUFKLElBQUksQ0FBWTtRQUFVLFlBQU8sR0FBUCxPQUFPLENBQXFCO1FBQVUsWUFBTyxHQUFQLE9BQU8sQ0FBWTtRQTBHL0YsY0FBUyxHQUFHLENBQ2xCLEVBQ0UsYUFBYSxFQUFFLE9BQU8sRUFBRSxJQUFJLEVBQUUsR0FBRyxFQUFFLElBQUksR0FDbUQsRUFDNUYsRUFBRTtZQUNGLE1BQU0sT0FBTyxHQUFHLElBQUksQ0FBQyxNQUFNLENBQUMsR0FBRyxDQUFDLDRCQUE0QixDQUFDLENBQUE7WUFDN0QsSUFBSSxLQUFLLENBQUE7WUFDVCxNQUFNLEdBQUcsR0FBRyxDQUFDLEdBQUcsYUFBYSxDQUFDLENBQUE7WUFDOUIsRUFBRSxDQUFDLENBQUMsSUFBSSxJQUFJLEdBQUcsQ0FBQyxDQUFDLENBQUM7Z0JBQ2hCLEdBQUcsQ0FBQyxJQUFJLENBQUMsWUFBWSxFQUFFLEdBQUcsQ0FBQyxDQUFBO2dCQUMzQixLQUFLLEdBQUcsR0FBRyxJQUFJLEdBQUcsR0FBRyxFQUFFLENBQUE7WUFDekIsQ0FBQztZQUNELEdBQUcsQ0FBQyxJQUFJLENBQUMsT0FBTyxDQUFDLENBQUE7WUFDakIsRUFBRSxDQUFDLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQztnQkFDUixHQUFHLENBQUMsSUFBSSxDQUFDLEdBQUcsQ0FB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REY7QUF4S0QsZ0RBd0tDIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IHsgVEVtaXR0ZXIsIEVtaXR0ZXIsIENvbXBvc2l0ZURpc3Bvc2FibGUgfSBmcm9tICdhdG9tJ1xuaW1wb3J0IHsgSW50ZXJhY3RpdmVQcm9jZXNzLCBHSENNb2RDYXBzIH0gZnJvbSAnLi9pbnRlcmFjdGl2ZS1wcm9jZXNzJ1xuaW1wb3J0ICogYXMgVXRpbCBmcm9tICcuLi91dGlsJ1xuY29uc3QgeyBkZWJ1Zywgd2l0aFRlbXBGaWxlLCBFT1QgfSA9IFV0aWxcbmltcG9ydCB7IEVPTCB9IGZyb20gJ29zJ1xuaW1wb3J0ICogYXMgXyBmcm9tICd1bmRlcnNjb3JlJ1xuXG5leHBvcnQgeyBHSENNb2RDYXBzIH1cblxuZXhwb3J0IGludGVyZmFjZSBSdW5BcmdzIHtcbiAgaW50ZXJhY3RpdmU/OiBib29sZWFuXG4gIGNvbW1hbmQ6IHN0cmluZ1xuICB0ZXh0Pzogc3RyaW5nXG4gIHVyaT86IHN0cmluZ1xuICBkYXNoQXJncz86IHN0cmluZ1tdXG4gIGFyZ3M/OiBzdHJpbmdbXVxuICBzdXBwcmVzc0Vycm9ycz86IGJvb2xlYW5cbiAgZ2hjT3B0aW9ucz86IHN0cmluZ1tdXG4gIGdoY01vZE9wdGlvbnM/OiBzdHJpbmdbXVxufVxuXG5leHBvcnQgaW50ZXJmYWNlIFJ1bk9wdGlvbnMge1xuICBjd2Q6IHN0cmluZ1xuICBlbmNvZGluZzogJ3V0ZjgnXG4gIGVudjogeyBba2V5OiBzdHJpbmddOiBzdHJpbmcgfCB1bmRlZmluZWQgfVxuICBtYXhCdWZmZXI6IG51bWJlclxufVxuXG5leHBvcnQgaW50ZXJmYWNlIElFcnJvckNhbGxiYWNrQXJncyB7XG4gIHJ1bkFyZ3M/OiBSdW5BcmdzXG4gIGVycjogRXJyb3JcbiAgY2FwczogR0hDTW9kQ2Fwc1xufVxuXG5leHBvcnQgY2xhc3MgR2hjTW9kaVByb2Nlc3NSZWFsIHtcbiAgcHJpdmF0ZSBkaXNwb3NhYmxlczogQ29tcG9zaXRlRGlzcG9zYWJsZVxuICBwcml2YXRlIGVtaXR0ZXI6IFRFbWl0dGVyPHtcbiAgICAnZGlkLWRlc3Ryb3knOiB1bmRlZmluZWRcbiAgICAnd2FybmluZyc6IHN0cmluZ1xuICAgICdlcnJvcic6IElFcnJvckNhbGxiYWNrQXJnc1xuICB9PlxuICBwcml2YXRlIGdoY01vZE9wdGlvbnM6IHN0cmluZ1tdIHwgdW5kZWZpbmVkXG4gIHByaXZhdGUgcHJvYzogSW50ZXJhY3RpdmVQcm9jZXNzIHwgdW5kZWZpbmVkXG5cbiAgY29uc3RydWN0b3IocHJpdmF0ZSBjYXBzOiBHSENNb2RDYXBzLCBwcml2YXRlIHJvb3REaXI6IEF0b21UeXBlcy5EaXJlY3RvcnksIHByaXZhdGUgb3B0aW9uczogUnVuT3B0aW9ucykge1xuICAgIHRoaXMuZGlzcG9zYWJsZXMgPSBuZXcgQ29tcG9zaXRlRGlzcG9zYWJsZSgpXG4gICAgdGhpcy5lbWl0dGVyID0gbmV3IEVtaXR0ZXIoKVxuICAgIHRoaXMuZGlzcG9zYWJsZXMuYWRkKHRoaXMuZW1pdHRlcilcbiAgfVxuXG4gIHB1YmxpYyBnZXRDYXBzKCk6IEdIQ01vZENhcHMge1xuICAgIHJldHVybiB0aGlzLmNhcHNcbiAgfVxuXG4gIHB1YmxpYyBhc3luYyBydW4oXG4gICAgcnVuQXJnczogUnVuQXJncyxcbiAgKSB7XG4gICAgbGV0IHsgaW50ZXJhY3RpdmUsIGRhc2hBcmdzLCBhcmdzLCBzdXBwcmVzc0Vycm9ycywgZ2hjT3B0aW9ucywgZ2hjTW9kT3B0aW9ucyB9ID0gcnVuQXJnc1xuICAgIGNvbnN0IHsgY29tbWFuZCwgdGV4dCwgdXJpIH0gPSBydW5BcmdzXG4gICAgaWYgKCFhcmdzKSB7IGFyZ3MgPSBbXSB9XG4gICAgaWYgKCFkYXNoQXJncykgeyBkYXNoQXJncyA9IFtdIH1cbiAgICBpZiAoIXN1cHByZXNzRXJyb3JzKSB7IHN1cHByZXNzRXJyb3JzID0gZmFsc2UgfVxuICAgIGlmICghZ2hjT3B0aW9ucykgeyBnaGNPcHRpb25zID0gW10gfVxuICAgIGlmICghZ2hjTW9kT3B0aW9ucykgeyBnaGNNb2RPcHRpb25zID0gW10gfVxuICAgIGdoY01vZE9wdGlvbnMgPSBnaGNNb2RPcHRpb25zLmNvbmNhdCguLi5naGNPcHRpb25zLm1hcCgob3B0KSA9PiBbJy0tZ2hjLW9wdGlvbicsIG9wdF0pKVxuICAgIGlmIChhdG9tLmNvbmZpZy5nZXQoJ2hhc2tlbGwtZ2hjLW1vZC5sb3dNZW1vcnlTeXN0ZW0nKSkge1xuICAgICAgaW50ZXJhY3RpdmUgPSBhdG9tLmNvbmZpZy5nZXQoJ2hhc2tlbGwtZ2hjLW1vZC5lbmFibGVHaGNNb2RpJylcbiAgICB9XG4gICAgaWYgKHRoaXMuY2Fwcy5vcHRwYXJzZSkge1xuICAgICAgYXJncyA9IGRhc2hBcmdzLmNvbmNhdChbJy0tJ10pLmNvbmNhdChhcmdzKVxuICAgIH0gZWxzZSB7XG4gICAgICBhcmdzID0gZGFzaEFyZ3MuY29uY2F0KGFyZ3MpXG4gICAgfVxuICAgIGNvbnN0IGZ1biA9IGludGVyYWN0aXZlID8gdGhpcy5ydW5Nb2RpQ21kIDogdGhpcy5ydW5Nb2RDbWRcbiAgICB0cnkge1xuICAgICAgbGV0IHJlc1xuICAgICAgaWYgKHVyaSAmJiB0ZXh0ICYmICF0aGlzLmNhcHMuZmlsZU1hcCkge1xuICAgICAgICBjb25zdCBteU9wdHMgPSB7IGdoY01vZE9wdGlvbnMsIGNvbW1hbmQsIGFyZ3MgfVxuICAgICAgICByZXMgPSB3aXRoVGVtcEZpbGUodGV4dCwgdXJpLCBhc3luYyAodGVtcHVyaSkgPT4ge1xuICAgICAgICAgIGNvbnN0IHsgc3Rkb3V0LCBzdGRlcnIgfSA9IGF3YWl0IGZ1bih7IC4uLm15T3B0cywgdXJpOiB0ZW1wdXJpIH0pXG4gICAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAgIHN0ZG91dDogc3Rkb3V0Lm1hcCgobGluZSkgPT4gbGluZS5zcGxpdCh0ZW1wdXJpKS5qb2luKHVyaSkpLFxuICAgICAgICAgICAgc3RkZXJyOiBzdGRlcnIubWFwKChsaW5lKSA9PiBsaW5lLnNwbGl0KHRlbXB1cmkpLmpvaW4odXJpKSksXG4gICAgICAgICAgfVxuICAgICAgICB9KVxuICAgICAgfSBlbHNlIHtcbiAgICAgICAgcmVzID0gZnVuKHsgZ2hjTW9kT3B0aW9ucywgY29tbWFuZCwgdGV4dCwgdXJpLCBhcmdzIH0pXG4gICAgICB9XG4gICAgICBjb25zdCB7IHN0ZG91dCwgc3RkZXJyIH0gPSBhd2FpdCByZXNcbiAgICAgIGlmIChzdGRlcnIuam9pbignJykubGVuZ3RoKSB7XG4gICAgICAgIHRoaXMuZW1pdHRlci5lbWl0KCd3YXJuaW5nJywgc3RkZXJyLmpvaW4oJ1xcbicpKVxuICAgICAgfVxuICAgICAgcmV0dXJuIHN0ZG91dC5tYXAoKGxpbmUpID0+IGxpbmUucmVwbGFjZSgvXFwwL2csICdcXG4nKSlcbiAgICB9IGNhdGNoIChlcnIpIHtcbiAgICAgIGRlYnVnKGVycilcbiAgICAgIHRoaXMuZW1pdHRlci5lbWl0KCdlcnJvcicsIHsgcnVuQXJncywgZXJyLCBjYXBzOiB0aGlzLmNhcHMgfSlcbiAgICAgIHJldHVybiBbXVxuICAgIH1cbiAgfVxuXG4gIHB1YmxpYyBraWxsUHJvY2VzcygpIHtcbiAgICBkZWJ1ZyhgS2lsbGluZyBnaGMtbW9kaSBwcm9jZXNzIGZvciAke3RoaXMucm9vdERpci5nZXRQYXRoKCl9YClcbiAgICB0aGlzLnByb2MgJiYgdGhpcy5wcm9jLmtpbGwoKVxuICB9XG5cbiAgcHVibGljIGRlc3Ryb3koKSB7XG4gICAgZGVidWcoJ0doY01vZGlQcm9jZXNzQmFzZSBkZXN0cm95aW5nJylcbiAgICB0aGlzLmtpbGxQcm9jZXNzKClcbiAgICB0aGlzLmVtaXR0ZXIuZW1pdCgnZGlkLWRlc3Ryb3knLCB1bmRlZmluZWQpXG4gICAgdGhpcy5kaXNwb3NhYmxlcy5kaXNwb3NlKClcbiAgfVxuXG4gIHB1YmxpYyBvbkRpZERlc3Ryb3koY2FsbGJhY2s6ICgpID0+IHZvaWQpIHtcbiAgICByZXR1cm4gdGhpcy5lbWl0dGVyLm9uKCdkaWQtZGVzdHJveScsIGNhbGxiYWNrKVxuICB9XG5cbiAgcHVibGljIG9uV2FybmluZyhjYWxsYmFjazogKHdhcm5pbmc6IHN0cmluZykgPT4gdm9pZCkge1xuICAgIHJldHVybiB0aGlzLmVtaXR0ZXIub24oJ3dhcm5pbmcnLCBjYWxsYmFjaylcbiAgfVxuXG4gIHB1YmxpYyBvbkVycm9yKGNhbGxiYWNrOiAoZXJyb3I6IElFcnJvckNhbGxiYWNrQXJncykgPT4gdm9pZCkge1xuICAgIHJldHVybiB0aGlzLmVtaXR0ZXIub24oJ2Vycm9yJywgY2FsbGJhY2spXG4gIH1cblxuICBwcml2YXRlIGFzeW5jIHNwYXduUHJvY2VzcyhnaGNNb2RPcHRpb25zOiBzdHJpbmdbXSk6IFByb21pc2U8SW50ZXJhY3RpdmVQcm9jZXNzIHwgdW5kZWZpbmVkPiB7XG4gICAgaWYgKCFhdG9tLmNvbmZpZy5nZXQoJ2hhc2tlbGwtZ2hjLW1vZC5lbmFibGVHaGNNb2RpJykpIHsgcmV0dXJuIHVuZGVmaW5lZCB9XG4gICAgZGVidWcoYENoZWNraW5nIGZvciBnaGMtbW9kaSBpbiAke3RoaXMucm9vdERpci5nZXRQYXRoKCl9YClcbiAgICBpZiAodGhpcy5wcm9jKSB7XG4gICAgICBpZiAoIV8uaXNFcXVhbCh0aGlzLmdoY01vZE9wdGlvbnMsIGdoY01vZE9wdGlvbnMpKSB7XG4gICAgICAgIGRlYnVnKFxuICAgICAgICAgIGBGb3VuZCBydW5uaW5nIGdoYy1tb2RpIGluc3RhbmNlIGZvciAke3RoaXMucm9vdERpci5nZXRQYXRoKCl9LCBidXQgZ2hjTW9kT3B0aW9ucyBkb24ndCBtYXRjaC4gT2xkOiBgLFxuICAgICAgICAgIHRoaXMuZ2hjTW9kT3B0aW9ucywgJyBuZXc6ICcsIGdoY01vZE9wdGlvbnMsXG4gICAgICAgIClcbiAgICAgICAgYXdhaXQgdGhpcy5wcm9jLmtpbGwoKVxuICAgICAgICByZXR1cm4gdGhpcy5zcGF3blByb2Nlc3MoZ2hjTW9kT3B0aW9ucylcbiAgICAgIH1cbiAgICAgIGRlYnVnKGBGb3VuZCBydW5uaW5nIGdoYy1tb2RpIGluc3RhbmNlIGZvciAke3RoaXMucm9vdERpci5nZXRQYXRoKCl9YClcbiAgICAgIHJldHVybiB0aGlzLnByb2NcbiAgICB9XG4gICAgZGVidWcoYFNwYXduaW5nIG5ldyBnaGMtbW9kaSBpbnN0YW5jZSBmb3IgJHt0aGlzLnJvb3REaXIuZ2V0UGF0aCgpfSB3aXRoYCwgdGhpcy5vcHRpb25zKVxuICAgIGNvbnN0IG1vZFBhdGggPSBhdG9tLmNvbmZpZy5nZXQoJ2hhc2tlbGwtZ2hjLW1vZC5naGNNb2RQYXRoJylcbiAgICB0aGlzLmdoY01vZE9wdGlvbnMgPSBnaGNNb2RPcHRpb25zXG4gICAgdGhpcy5wcm9jID0gbmV3IEludGVyYWN0aXZlUHJvY2Vzcyhtb2RQYXRoLCBnaGNNb2RPcHRpb25zLmNvbmNhdChbJ2xlZ2FjeS1pbnRlcmFjdGl2ZSddKSwgdGhpcy5vcHRpb25zLCB0aGlzLmNhcHMpXG4gICAgdGhpcy5wcm9jLm9uY2VFeGl0KChjb2RlKSA9PiB7XG4gICAgICBkZWJ1ZyhgZ2hjLW1vZGkgZm9yICR7dGhpcy5yb290RGlyLmdldFBhdGgoKX0gZW5kZWQgd2l0aCAke2NvZGV9YClcbiAgICAgIHRoaXMucHJvYyA9IHVuZGVmaW5lZFxuICAgIH0pXG4gICAgcmV0dXJuIHRoaXMucHJvY1xuICB9XG5cbiAgcHJpdmF0ZSBydW5Nb2RDbWQgPSBhc3luYyAoXG4gICAge1xuICAgICAgZ2hjTW9kT3B0aW9ucywgY29tbWFuZCwgdGV4dCwgdXJpLCBhcmdzLFxuICAgIH06IHsgZ2hjTW9kT3B0aW9uczogc3RyaW5nW10sIGNvbW1hbmQ6IHN0cmluZywgdGV4dD86IHN0cmluZywgdXJpPzogc3RyaW5nLCBhcmdzOiBzdHJpbmdbXSB9LFxuICApID0+IHtcbiAgICBjb25zdCBtb2RQYXRoID0gYXRvbS5jb25maWcuZ2V0KCdoYXNrZWxsLWdoYy1tb2QuZ2hjTW9kUGF0aCcpXG4gICAgbGV0IHN0ZGluXG4gICAgY29uc3QgY21kID0gWy4uLmdoY01vZE9wdGlvbnNdXG4gICAgaWYgKHRleHQgJiYgdXJpKSB7XG4gICAgICBjbWQucHVzaCgnLS1tYXAtZmlsZScsIHVyaSlcbiAgICAgIHN0ZGluID0gYCR7dGV4dH0ke0VPVH1gXG4gICAgfVxuICAgIGNtZC5wdXNoKGNvbW1hbmQpXG4gICAgaWYgKHVyaSkge1xuICAgICAgY21kLnB1c2godXJpKVxuICAgIH1cbiAgICBjbWQucHVzaCguLi5hcmdzKVxuICAgIGNvbnN0IHsgc3Rkb3V0LCBzdGRlcnIgfSA9IGF3YWl0IFV0aWwuZXhlY1Byb21pc2UobW9kUGF0aCwgY21kLCB0aGlzLm9wdGlvbnMsIHN0ZGluKVxuICAgIHJldHVybiB7XG4gICAgICBzdGRvdXQ6IHN0ZG91dC5zcGxpdChFT0wpLnNsaWNlKDAsIC0xKSxcbiAgICAgIHN0ZGVycjogc3RkZXJyLnNwbGl0KEVPTCksXG4gICAgfVxuICB9XG5cbiAgcHJpdmF0ZSBydW5Nb2RpQ21kID0gYXN5bmMgKFxuICAgIG86IHsgZ2hjTW9kT3B0aW9uczogc3RyaW5nW10sIGNvbW1hbmQ6IHN0cmluZywgdGV4dD86IHN0cmluZywgdXJpPzogc3RyaW5nLCBhcmdzOiBzdHJpbmdbXSB9LFxuICApID0+IHtcbiAgICBjb25zdCB7IGdoY01vZE9wdGlvbnMsIGNvbW1hbmQsIHRleHQsIGFyZ3MgfSA9IG9cbiAgICBsZXQgeyB1cmkgfSA9IG9cbiAgICBkZWJ1ZyhgVHJ5aW5nIHRvIHJ1biBnaGMtbW9kaSBpbiAke3RoaXMucm9vdERpci5nZXRQYXRoKCl9YClcbiAgICBjb25zdCBwcm9jID0gYXdhaXQgdGhpcy5zcGF3blByb2Nlc3MoZ2hjTW9kT3B0aW9ucylcbiAgICBpZiAoIXByb2MpIHtcbiAgICAgIGRlYnVnKCdGYWlsZWQuIEZhbGxpbmcgYmFjayB0byBnaGMtbW9kJylcbiAgICAgIHJldHVybiB0aGlzLnJ1bk1vZENtZChvKVxuICAgIH1cbiAgICBkZWJ1ZygnU3VjY2Vzcy4gUmVzdW1pbmcuLi4nKVxuICAgIGlmICh1cmkgJiYgIXRoaXMuY2Fwcy5xdW90ZUFyZ3MpIHsgdXJpID0gdGhpcy5yb290RGlyLnJlbGF0aXZpemUodXJpKSB9XG4gICAgdHJ5IHtcbiAgICAgIGlmICh1cmkgJiYgdGV4dCkge1xuICAgICAgICBhd2FpdCBwcm9jLmludGVyYWN0KCdtYXAtZmlsZScsIFt1cmldLCB0ZXh0KVxuICAgICAgfVxuICAgICAgY29uc3QgcmVzID0gYXdhaXQgcHJvYy5pbnRlcmFjdChjb21tYW5kLCB1cmkgPyBbdXJpXS5jb25jYXQoYXJncykgOiBhcmdzKVxuICAgICAgaWYgKHVyaSAmJiB0ZXh0KSB7XG4gICAgICAgIGF3YWl0IHByb2MuaW50ZXJhY3QoJ3VubWFwLWZpbGUnLCBbdXJpXSlcbiAgICAgIH1cbiAgICAgIHJldHVybiByZXNcbiAgICB9IGZpbmFsbHkge1xuICAgICAgaWYgKHVyaSAmJiB0ZXh0KSB7XG4gICAgICAgIGF3YWl0IHByb2MuaW50ZXJhY3QoJ3VubWFwLWZpbGUnLCBbdXJpXSlcbiAgICAgIH1cbiAgICB9XG4gIH1cbn1cbiJdfQ==