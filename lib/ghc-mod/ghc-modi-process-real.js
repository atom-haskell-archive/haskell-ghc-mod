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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZ2hjLW1vZGktcHJvY2Vzcy1yZWFsLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vLi4vc3JjL2doYy1tb2QvZ2hjLW1vZGktcHJvY2Vzcy1yZWFsLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7Ozs7Ozs7Ozs7QUFBQSwrQkFBNkQ7QUFDN0QsK0RBQXNFO0FBQ3RFLGdDQUErQjtBQUMvQixNQUFNLEVBQUUsS0FBSyxFQUFFLFlBQVksRUFBRSxHQUFHLEVBQUUsR0FBRyxJQUFJLENBQUE7QUFDekMsMkJBQXdCO0FBQ3hCLGdDQUErQjtBQTZCL0I7SUFVRSxZQUFvQixJQUFnQixFQUFVLE9BQTRCLEVBQVUsT0FBbUI7UUFBbkYsU0FBSSxHQUFKLElBQUksQ0FBWTtRQUFVLFlBQU8sR0FBUCxPQUFPLENBQXFCO1FBQVUsWUFBTyxHQUFQLE9BQU8sQ0FBWTtRQUNyRyxJQUFJLENBQUMsV0FBVyxHQUFHLElBQUksMEJBQW1CLEVBQUUsQ0FBQTtRQUM1QyxJQUFJLENBQUMsT0FBTyxHQUFHLElBQUksY0FBTyxFQUFFLENBQUE7UUFDNUIsSUFBSSxDQUFDLFdBQVcsQ0FBQyxHQUFHLENBQUMsSUFBSSxDQUFDLE9BQU8sQ0FBQyxDQUFBO0lBQ3BDLENBQUM7SUFFWSxHQUFHLENBQ2QsT0FBZ0I7O1lBRWhCLElBQUksRUFBRSxXQUFXLEVBQUUsUUFBUSxFQUFFLElBQUksRUFBRSxjQUFjLEVBQUUsVUFBVSxFQUFFLGFBQWEsRUFBRSxHQUFHLE9BQU8sQ0FBQTtZQUN4RixNQUFNLEVBQUUsT0FBTyxFQUFFLElBQUksRUFBRSxHQUFHLEVBQUUsR0FBRyxPQUFPLENBQUE7WUFDdEMsRUFBRSxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDO2dCQUFDLElBQUksR0FBRyxFQUFFLENBQUE7WUFBQyxDQUFDO1lBQ3hCLEVBQUUsQ0FBQyxDQUFDLENBQUMsUUFBUSxDQUFDLENBQUMsQ0FBQztnQkFBQyxRQUFRLEdBQUcsRUFBRSxDQUFBO1lBQUMsQ0FBQztZQUNoQyxFQUFFLENBQUMsQ0FBQyxDQUFDLGNBQWMsQ0FBQyxDQUFDLENBQUM7Z0JBQUMsY0FBYyxHQUFHLEtBQUssQ0FBQTtZQUFDLENBQUM7WUFDL0MsRUFBRSxDQUFDLENBQUMsQ0FBQyxVQUFVLENBQUMsQ0FBQyxDQUFDO2dCQUFDLFVBQVUsR0FBRyxFQUFFLENBQUE7WUFBQyxDQUFDO1lBQ3BDLEVBQUUsQ0FBQyxDQUFDLENBQUMsYUFBYSxDQUFDLENBQUMsQ0FBQztnQkFBQyxhQUFhLEdBQUcsRUFBRSxDQUFBO1lBQUMsQ0FBQztZQUMxQyxhQUFhLEdBQUcsYUFBYSxDQUFDLE1BQU0sQ0FBQyxHQUFHLFVBQVUsQ0FBQyxHQUFHLENBQUMsQ0FBQyxHQUFHLEtBQUssQ0FBQyxjQUFjLEVBQUUsR0FBRyxDQUFDLENBQUMsQ0FBQyxDQUFBO1lBQ3ZGLEVBQUUsQ0FBQyxDQUFDLElBQUksQ0FBQyxNQUFNLENBQUMsR0FBRyxDQUFDLGlDQUFpQyxDQUFDLENBQUMsQ0FBQyxDQUFDO2dCQUN2RCxXQUFXLEdBQUcsSUFBSSxDQUFDLE1BQU0sQ0FBQyxHQUFHLENBQUMsK0JBQStCLENBQUMsQ0FBQTtZQUNoRSxDQUFDO1lBQ0QsRUFBRSxDQUFDLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxRQUFRLENBQUMsQ0FBQyxDQUFDO2dCQUN2QixJQUFJLEdBQUcsUUFBUSxDQUFDLE1BQU0sQ0FBQyxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsTUFBTSxDQUFDLElBQUksQ0FBQyxDQUFBO1lBQzdDLENBQUM7WUFBQyxJQUFJLENBQUMsQ0FBQztnQkFDTixJQUFJLEdBQUcsUUFBUSxDQUFDLE1BQU0sQ0FBQyxJQUFJLENBQUMsQ0FBQTtZQUM5QixDQUFDO1lBQ0QsTUFBTSxHQUFHLEdBQUcsV0FBVyxHQUFHLElBQUksQ0FBQyxVQUFVLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxHQUFHLElBQUksQ0FBQyxTQUFTLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxDQUFBO1lBQ2hGLElBQUksQ0FBQztnQkFDSCxJQUFJLEdBQUcsQ0FBQTtnQkFDUCxFQUFFLENBQUMsQ0FBQyxHQUFHLElBQUksSUFBSSxJQUFJLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxPQUFPLENBQUMsQ0FBQyxDQUFDO29CQUN0QyxNQUFNLE1BQU0sR0FBRyxFQUFFLGFBQWEsRUFBRSxPQUFPLEVBQUUsSUFBSSxFQUFFLENBQUE7b0JBQy9DLEdBQUcsR0FBRyxZQUFZLENBQUMsSUFBSSxFQUFFLEdBQUcsRUFBRSxDQUFPLE9BQU87d0JBQzFDLE1BQU0sRUFBRSxNQUFNLEVBQUUsTUFBTSxFQUFFLEdBQUcsTUFBTSxHQUFHLG1CQUFNLE1BQU0sSUFBRSxHQUFHLEVBQUUsT0FBTyxJQUFHLENBQUE7d0JBQ2pFLE1BQU0sQ0FBQzs0QkFDTCxNQUFNLEVBQUUsTUFBTSxDQUFDLEdBQUcsQ0FBQyxDQUFDLElBQUksS0FBSyxJQUFJLENBQUMsS0FBSyxDQUFDLE9BQU8sQ0FBQyxDQUFDLElBQUksQ0FBQyxHQUFHLENBQUMsQ0FBQzs0QkFDM0QsTUFBTSxFQUFFLE1BQU0sQ0FBQyxHQUFHLENBQUMsQ0FBQyxJQUFJLEtBQUssSUFBSSxDQUFDLEtBQUssQ0FBQyxPQUFPLENBQUMsQ0FBQyxJQUFJLENBQUMsR0FBRyxDQUFDLENBQUM7eUJBQzVELENBQUE7b0JBQ0gsQ0FBQyxDQUFBLENBQUMsQ0FBQTtnQkFDSixDQUFDO2dCQUFDLElBQUksQ0FBQyxDQUFDO29CQUNOLEdBQUcsR0FBRyxHQUFHLENBQUMsRUFBRSxhQUFhLEVBQUUsT0FBTyxFQUFFLElBQUksRUFBRSxHQUFHLEVBQUUsSUFBSSxFQUFFLENBQUMsQ0FBQTtnQkFDeEQsQ0FBQztnQkFDRCxNQUFNLEVBQUUsTUFBTSxFQUFFLE1BQU0sRUFBRSxHQUFHLE1BQU0sR0FBRyxDQUFBO2dCQUNwQyxFQUFFLENBQUMsQ0FBQyxNQUFNLENBQUMsSUFBSSxDQUFDLEVBQUUsQ0FBQyxDQUFDLE1BQU0sQ0FBQyxDQUFDLENBQUM7b0JBQzNCLElBQUksQ0FBQyxPQUFPLENBQUMsSUFBSSxDQUFDLFNBQVMsRUFBRSxNQUFNLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUE7Z0JBQ2pELENBQUM7Z0JBQ0QsTUFBTSxDQUFDLE1BQU0sQ0FBQyxHQUFHLENBQUMsQ0FBQyxJQUFJLEtBQUssSUFBSSxDQUFDLE9BQU8sQ0FBQyxLQUFLLEVBQUUsSUFBSSxDQUFDLENBQUMsQ0FBQTtZQUN4RCxDQUFDO1lBQUMsS0FBSyxDQUFDLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQztnQkFDYixLQUFLLENBQUMsR0FBRyxDQUFDLENBQUE7Z0JBQ1YsSUFBSSxDQUFDLE9BQU8sQ0FBQyxJQUFJLENBQUMsT0FBTyxFQUFFLEVBQUUsT0FBTyxFQUFFLEdBQUcsRUFBRSxJQUFJLEVBQUUsSUFBSSxDQUFDLElBQUksRUFBRSxDQUFDLENBQUE7Z0JBQzdELE1BQU0sQ0FBQyxFQUFFLENBQUE7WUFDWCxDQUFDO1FBQ0gsQ0FBQztLQUFBO0lBRU0sV0FBVztRQUNoQixLQUFLLENBQUMsZ0NBQWdDLElBQUksQ0FBQyxPQUFPLENBQUMsT0FBTyxFQUFFLEVBQUUsQ0FBQyxDQUFBO1FBQy9ELElBQUksQ0FBQyxJQUFJLElBQUksSUFBSSxDQUFDLElBQUksQ0FBQyxJQUFJLEVBQUUsQ0FBQTtJQUMvQixDQUFDO0lBRU0sT0FBTztRQUNaLEtBQUssQ0FBQywrQkFBK0IsQ0FBQyxDQUFBO1FBQ3RDLElBQUksQ0FBQyxXQUFXLEVBQUUsQ0FBQTtRQUNsQixJQUFJLENBQUMsT0FBTyxDQUFDLElBQUksQ0FBQyxhQUFhLEVBQUUsU0FBUyxDQUFDLENBQUE7UUFDM0MsSUFBSSxDQUFDLFdBQVcsQ0FBQyxPQUFPLEVBQUUsQ0FBQTtJQUM1QixDQUFDO0lBRU0sWUFBWSxDQUFDLFFBQW9CO1FBQ3RDLE1BQU0sQ0FBQyxJQUFJLENBQUMsT0FBTyxDQUFDLEVBQUUsQ0FBQyxhQUFhLEVBQUUsUUFBUSxDQUFDLENBQUE7SUFDakQsQ0FBQztJQUVNLFNBQVMsQ0FBQyxRQUFtQztRQUNsRCxNQUFNLENBQUMsSUFBSSxDQUFDLE9BQU8sQ0FBQyxFQUFFLENBQUMsU0FBUyxFQUFFLFFBQVEsQ0FBQyxDQUFBO0lBQzdDLENBQUM7SUFFTSxPQUFPLENBQUMsUUFBNkM7UUFDMUQsTUFBTSxDQUFDLElBQUksQ0FBQyxPQUFPLENBQUMsRUFBRSxDQUFDLE9BQU8sRUFBRSxRQUFRLENBQUMsQ0FBQTtJQUMzQyxDQUFDO0lBRWEsWUFBWSxDQUFDLGFBQXVCOztZQUNoRCxFQUFFLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQyxNQUFNLENBQUMsR0FBRyxDQUFDLCtCQUErQixDQUFDLENBQUMsQ0FBQyxDQUFDO2dCQUFDLE1BQU0sQ0FBQyxTQUFTLENBQUE7WUFBQyxDQUFDO1lBQzNFLEtBQUssQ0FBQyw0QkFBNEIsSUFBSSxDQUFDLE9BQU8sQ0FBQyxPQUFPLEVBQUUsRUFBRSxDQUFDLENBQUE7WUFDM0QsRUFBRSxDQUFDLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUM7Z0JBQ2QsRUFBRSxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsT0FBTyxDQUFDLElBQUksQ0FBQyxhQUFhLEVBQUUsYUFBYSxDQUFDLENBQUMsQ0FBQyxDQUFDO29CQUNsRCxLQUFLLENBQ0gsdUNBQXVDLElBQUksQ0FBQyxPQUFPLENBQUMsT0FBTyxFQUFFLHdDQUF3QyxFQUNyRyxJQUFJLENBQUMsYUFBYSxFQUFFLFFBQVEsRUFBRSxhQUFhLENBQzVDLENBQUE7b0JBQ0QsTUFBTSxJQUFJLENBQUMsSUFBSSxDQUFDLElBQUksRUFBRSxDQUFBO29CQUN0QixNQUFNLENBQUMsSUFBSSxDQUFDLFlBQVksQ0FBQyxhQUFhLENBQUMsQ0FBQTtnQkFDekMsQ0FBQztnQkFDRCxLQUFLLENBQUMsdUNBQXVDLElBQUksQ0FBQyxPQUFPLENBQUMsT0FBTyxFQUFFLEVBQUUsQ0FBQyxDQUFBO2dCQUN0RSxNQUFNLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQTtZQUNsQixDQUFDO1lBQ0QsS0FBSyxDQUFDLHNDQUFzQyxJQUFJLENBQUMsT0FBTyxDQUFDLE9BQU8sRUFBRSxPQUFPLEVBQUUsSUFBSSxDQUFDLE9BQU8sQ0FBQyxDQUFBO1lBQ3hGLE1BQU0sT0FBTyxHQUFHLElBQUksQ0FBQyxNQUFNLENBQUMsR0FBRyxDQUFDLDRCQUE0QixDQUFDLENBQUE7WUFDN0QsSUFBSSxDQUFDLGFBQWEsR0FBRyxhQUFhLENBQUE7WUFDbEMsSUFBSSxDQUFDLElBQUksR0FBRyxJQUFJLHdDQUFrQixDQUFDLE9BQU8sRUFBRSxhQUFhLENBQUMsTUFBTSxDQUFDLENBQUMsb0JBQW9CLENBQUMsQ0FBQyxFQUFFLElBQUksQ0FBQyxPQUFPLEVBQUUsSUFBSSxDQUFDLElBQUksQ0FBQyxDQUFBO1lBQ2xILElBQUksQ0FBQyxJQUFJLENBQUMsUUFBUSxDQUFDLENBQUMsSUFBSTtnQkFDdEIsS0FBSyxDQUFDLGdCQUFnQixJQUFJLENBQUMsT0FBTyxDQUFDLE9BQU8sRUFBRSxlQUFlLElBQUksRUFBRSxDQUFDLENBQUE7Z0JBQ2xFLElBQUksQ0FBQyxJQUFJLEdBQUcsU0FBUyxDQUFBO1lBQ3ZCLENBQUMsQ0FBQyxDQUFBO1lBQ0YsTUFBTSxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUE7UUFDbEIsQ0FBQztLQUFBO0lBRWEsU0FBUyxDQUNyQixFQUNFLGFBQWEsRUFBRSxPQUFPLEVBQUUsSUFBSSxFQUFFLEdBQUcsRUFBRSxJQUFJLEdBQ21EOztZQUU1RixNQUFNLE9BQU8sR0FBRyxJQUFJLENBQUMsTUFBTSxDQUFDLEdBQUcsQ0FBQyw0QkFBNEIsQ0FBQyxDQUFBO1lBQzdELElBQUksS0FBSyxDQUFBO1lBQ1QsTUFBTSxHQUFHLEdBQUcsQ0FBQyxHQUFHLGFBQWEsQ0FBQyxDQUFBO1lBQzlCLEVBQUUsQ0FBQyxDQUFDLElBQUksSUFBSSxHQUFHLENBQUMsQ0FBQyxDQUFDO2dCQUNoQixHQUFHLENBQUMsSUFBSSxDQUFDLFlBQVksRUFBRSxHQUFHLENBQUMsQ0FBQTtnQkFDM0IsS0FBSyxHQUFHLEdBQUcsSUFBSSxHQUFHLEdBQUcsRUFBRSxDQUFBO1lBQ3pCLENBQUM7WUFDRCxHQUFHLENBQUMsSUFBSSxDQUFDLE9BQU8sQ0FBQyxDQUFBO1lBQ2pCLEVBQUUsQ0FBQyxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUM7Z0JBQ1IsR0FBRyxDQUFDLElBQUksQ0FBQyxHQUFHLENBQUMsQ0FBQTtZQUNmLENBQUM7WUFDRCxHQUFHLENBQUMsSUFBSSxDQUFDLEdBQUcsSUFBSSxDQUFDLENBQUE7WUFDakIsTUFBTSxFQUFFLE1BQU0sRUFBRSxNQUFNLEVBQUUsR0FBRyxNQUFNLElBQUksQ0FBQyxXQUFXLENBQUMsT0FBTyxFQUFFLEdBQUcsRUFBRSxJQUFJLENBQUMsT0FBTyxFQUFFLEtBQUssQ0FBQyxDQUFBO1lBQ3BGLE1BQU0sQ0FBQztnQkFDTCxNQUFNLEVBQUUsTUFBTSxDQUFDLEtBQUssQ0FBQyxRQUFHLENBQUMsQ0FBQyxLQUFLLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDO2dCQUN0QyxNQUFNLEVBQUUsTUFBTSxDQUFDLEtBQUssQ0FBQyxRQUFHLENBQUM7YUFDMUIsQ0FBQTtRQUNILENBQUM7S0FBQTtJQUVhLFVBQVUsQ0FDdEIsQ0FBNEY7O1lBRTVGLE1BQU0sRUFBRSxhQUFhLEVBQUUsT0FBTyxFQUFFLElBQUksRUFBRSxJQUFJLEVBQUUsR0FBRyxDQUFDLENBQUE7WUFDaEQsSUFBSSxFQUFFLEdBQUcsRUFBRSxHQUFHLENBQUMsQ0FBQTtZQUNmLEtBQUssQ0FBQyw2QkFBNkIsSUFBSSxDQUFDLE9BQU8sQ0FBQyxPQUFPLEVBQUUsRUFBRSxDQUFDLENBQUE7WUFDNUQsTUFBTSxJQUFJLEdBQUcsTUFBTSxJQUFJLENBQUMsWUFBWSxDQUFDLGFBQWEsQ0FBQyxDQUFBO1lBQ25ELEVBQUUsQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQztnQkFDVixLQUFLLENBQUMsaUNBQWlDLENBQUMsQ0FBQTtnQkFDeEMsTUFBTSxDQUFDLElBQUksQ0FBQyxTQUFTLENBQUMsQ0FBQyxDQUFDLENBQUE7WUFDMUIsQ0FBQztZQUNELEtBQUssQ0FBQyxzQkFBc0IsQ0FBQyxDQUFBO1lBQzdCLEVBQUUsQ0FBQyxDQUFDLEdBQUcsSUFBSSxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsU0FBUyxDQUFDLENBQUMsQ0FBQztnQkFBQyxHQUFHLEdBQUcsSUFBSSxDQUFDLE9BQU8sQ0FBQyxVQUFVLENBQUMsR0FBRyxDQUFDLENBQUE7WUFBQyxDQUFDO1lBQ3ZFLElBQUksQ0FBQztnQkFDSCxFQUFFLENBQUMsQ0FBQyxHQUFHLElBQUksSUFBSSxDQUFDLENBQUMsQ0FBQztvQkFDaEIsTUFBTSxJQUFJLENBQUMsUUFBUSxDQUFDLFVBQVUsRUFBRSxDQUFDLEdBQUcsQ0FBQyxFQUFFLElBQUksQ0FBQyxDQUFBO2dCQUM5QyxDQUFDO2dCQUNELE1BQU0sR0FBRyxHQUFHLE1BQU0sSUFBSSxDQUFDLFFBQVEsQ0FBQyxPQUFPLEVBQUUsR0FBRyxHQUFHLENBQUMsR0FBRyxDQUFDLENBQUMsTUFBTSxDQUFDLElBQUksQ0FBQyxHQUFHLElBQUksQ0FBQyxDQUFBO2dCQUN6RSxFQUFFLENBQUMsQ0FBQyxHQUFHLElBQUksSUFBSSxDQUFDLENBQUMsQ0FBQztvQkFDaEIsTUFBTSxJQUFJLENBQUMsUUFBUSxDQUFDLFlBQVksRUFBRSxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUE7Z0JBQzFDLENBQUM7Z0JBQ0QsTUFBTSxDQUFDLEdBQUcsQ0FBQTtZQUNaLENBQUM7b0JBQVMsQ0FBQztnQkFDVCxFQUFFLENBQUMsQ0FBQyxHQUFHLElBQUksSUFBSSxDQUFDLENBQUMsQ0FBQztvQkFDaEIsTUFBTSxJQUFJLENBQUMsUUFBUSxDQUFDLFlBQVksRUFBRSxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUE7Z0JBQzFDLENBQUM7WUFDSCxDQUFDO1FBQ0gsQ0FBQztLQUFBO0NBQ0Y7QUFwS0QsZ0RBb0tDIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IHsgVEVtaXR0ZXIsIEVtaXR0ZXIsIENvbXBvc2l0ZURpc3Bvc2FibGUgfSBmcm9tICdhdG9tJ1xuaW1wb3J0IHsgSW50ZXJhY3RpdmVQcm9jZXNzLCBHSENNb2RDYXBzIH0gZnJvbSAnLi9pbnRlcmFjdGl2ZS1wcm9jZXNzJ1xuaW1wb3J0ICogYXMgVXRpbCBmcm9tICcuLi91dGlsJ1xuY29uc3QgeyBkZWJ1Zywgd2l0aFRlbXBGaWxlLCBFT1QgfSA9IFV0aWxcbmltcG9ydCB7IEVPTCB9IGZyb20gJ29zJ1xuaW1wb3J0ICogYXMgXyBmcm9tICd1bmRlcnNjb3JlJ1xuXG5leHBvcnQgeyBHSENNb2RDYXBzIH1cblxuZXhwb3J0IGludGVyZmFjZSBSdW5BcmdzIHtcbiAgaW50ZXJhY3RpdmU/OiBib29sZWFuXG4gIGNvbW1hbmQ6IHN0cmluZ1xuICB0ZXh0Pzogc3RyaW5nXG4gIHVyaT86IHN0cmluZ1xuICBkYXNoQXJncz86IHN0cmluZ1tdXG4gIGFyZ3M/OiBzdHJpbmdbXVxuICBzdXBwcmVzc0Vycm9ycz86IGJvb2xlYW5cbiAgZ2hjT3B0aW9ucz86IHN0cmluZ1tdXG4gIGdoY01vZE9wdGlvbnM/OiBzdHJpbmdbXVxufVxuXG5leHBvcnQgaW50ZXJmYWNlIFJ1bk9wdGlvbnMge1xuICBjd2Q6IHN0cmluZ1xuICBlbmNvZGluZzogJ3V0ZjgnXG4gIGVudjogeyBba2V5OiBzdHJpbmddOiBzdHJpbmcgfCB1bmRlZmluZWQgfVxuICBtYXhCdWZmZXI6IG51bWJlclxufVxuXG5leHBvcnQgaW50ZXJmYWNlIElFcnJvckNhbGxiYWNrQXJncyB7XG4gIHJ1bkFyZ3M/OiBSdW5BcmdzXG4gIGVycjogRXJyb3JcbiAgY2FwczogR0hDTW9kQ2Fwc1xufVxuXG5leHBvcnQgY2xhc3MgR2hjTW9kaVByb2Nlc3NSZWFsIHtcbiAgcHJpdmF0ZSBkaXNwb3NhYmxlczogQ29tcG9zaXRlRGlzcG9zYWJsZVxuICBwcml2YXRlIGVtaXR0ZXI6IFRFbWl0dGVyPHtcbiAgICAnZGlkLWRlc3Ryb3knOiB1bmRlZmluZWRcbiAgICAnd2FybmluZyc6IHN0cmluZ1xuICAgICdlcnJvcic6IElFcnJvckNhbGxiYWNrQXJnc1xuICB9PlxuICBwcml2YXRlIGdoY01vZE9wdGlvbnM6IHN0cmluZ1tdIHwgdW5kZWZpbmVkXG4gIHByaXZhdGUgcHJvYzogSW50ZXJhY3RpdmVQcm9jZXNzIHwgdW5kZWZpbmVkXG5cbiAgY29uc3RydWN0b3IocHJpdmF0ZSBjYXBzOiBHSENNb2RDYXBzLCBwcml2YXRlIHJvb3REaXI6IEF0b21UeXBlcy5EaXJlY3RvcnksIHByaXZhdGUgb3B0aW9uczogUnVuT3B0aW9ucykge1xuICAgIHRoaXMuZGlzcG9zYWJsZXMgPSBuZXcgQ29tcG9zaXRlRGlzcG9zYWJsZSgpXG4gICAgdGhpcy5lbWl0dGVyID0gbmV3IEVtaXR0ZXIoKVxuICAgIHRoaXMuZGlzcG9zYWJsZXMuYWRkKHRoaXMuZW1pdHRlcilcbiAgfVxuXG4gIHB1YmxpYyBhc3luYyBydW4oXG4gICAgcnVuQXJnczogUnVuQXJncyxcbiAgKSB7XG4gICAgbGV0IHsgaW50ZXJhY3RpdmUsIGRhc2hBcmdzLCBhcmdzLCBzdXBwcmVzc0Vycm9ycywgZ2hjT3B0aW9ucywgZ2hjTW9kT3B0aW9ucyB9ID0gcnVuQXJnc1xuICAgIGNvbnN0IHsgY29tbWFuZCwgdGV4dCwgdXJpIH0gPSBydW5BcmdzXG4gICAgaWYgKCFhcmdzKSB7IGFyZ3MgPSBbXSB9XG4gICAgaWYgKCFkYXNoQXJncykgeyBkYXNoQXJncyA9IFtdIH1cbiAgICBpZiAoIXN1cHByZXNzRXJyb3JzKSB7IHN1cHByZXNzRXJyb3JzID0gZmFsc2UgfVxuICAgIGlmICghZ2hjT3B0aW9ucykgeyBnaGNPcHRpb25zID0gW10gfVxuICAgIGlmICghZ2hjTW9kT3B0aW9ucykgeyBnaGNNb2RPcHRpb25zID0gW10gfVxuICAgIGdoY01vZE9wdGlvbnMgPSBnaGNNb2RPcHRpb25zLmNvbmNhdCguLi5naGNPcHRpb25zLm1hcCgob3B0KSA9PiBbJy0tZ2hjLW9wdGlvbicsIG9wdF0pKVxuICAgIGlmIChhdG9tLmNvbmZpZy5nZXQoJ2hhc2tlbGwtZ2hjLW1vZC5sb3dNZW1vcnlTeXN0ZW0nKSkge1xuICAgICAgaW50ZXJhY3RpdmUgPSBhdG9tLmNvbmZpZy5nZXQoJ2hhc2tlbGwtZ2hjLW1vZC5lbmFibGVHaGNNb2RpJylcbiAgICB9XG4gICAgaWYgKHRoaXMuY2Fwcy5vcHRwYXJzZSkge1xuICAgICAgYXJncyA9IGRhc2hBcmdzLmNvbmNhdChbJy0tJ10pLmNvbmNhdChhcmdzKVxuICAgIH0gZWxzZSB7XG4gICAgICBhcmdzID0gZGFzaEFyZ3MuY29uY2F0KGFyZ3MpXG4gICAgfVxuICAgIGNvbnN0IGZ1biA9IGludGVyYWN0aXZlID8gdGhpcy5ydW5Nb2RpQ21kLmJpbmQodGhpcykgOiB0aGlzLnJ1bk1vZENtZC5iaW5kKHRoaXMpXG4gICAgdHJ5IHtcbiAgICAgIGxldCByZXNcbiAgICAgIGlmICh1cmkgJiYgdGV4dCAmJiAhdGhpcy5jYXBzLmZpbGVNYXApIHtcbiAgICAgICAgY29uc3QgbXlPcHRzID0geyBnaGNNb2RPcHRpb25zLCBjb21tYW5kLCBhcmdzIH1cbiAgICAgICAgcmVzID0gd2l0aFRlbXBGaWxlKHRleHQsIHVyaSwgYXN5bmMgKHRlbXB1cmkpID0+IHtcbiAgICAgICAgICBjb25zdCB7IHN0ZG91dCwgc3RkZXJyIH0gPSBhd2FpdCBmdW4oeyAuLi5teU9wdHMsIHVyaTogdGVtcHVyaSB9KVxuICAgICAgICAgIHJldHVybiB7XG4gICAgICAgICAgICBzdGRvdXQ6IHN0ZG91dC5tYXAoKGxpbmUpID0+IGxpbmUuc3BsaXQodGVtcHVyaSkuam9pbih1cmkpKSxcbiAgICAgICAgICAgIHN0ZGVycjogc3RkZXJyLm1hcCgobGluZSkgPT4gbGluZS5zcGxpdCh0ZW1wdXJpKS5qb2luKHVyaSkpLFxuICAgICAgICAgIH1cbiAgICAgICAgfSlcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHJlcyA9IGZ1bih7IGdoY01vZE9wdGlvbnMsIGNvbW1hbmQsIHRleHQsIHVyaSwgYXJncyB9KVxuICAgICAgfVxuICAgICAgY29uc3QgeyBzdGRvdXQsIHN0ZGVyciB9ID0gYXdhaXQgcmVzXG4gICAgICBpZiAoc3RkZXJyLmpvaW4oJycpLmxlbmd0aCkge1xuICAgICAgICB0aGlzLmVtaXR0ZXIuZW1pdCgnd2FybmluZycsIHN0ZGVyci5qb2luKCdcXG4nKSlcbiAgICAgIH1cbiAgICAgIHJldHVybiBzdGRvdXQubWFwKChsaW5lKSA9PiBsaW5lLnJlcGxhY2UoL1xcMC9nLCAnXFxuJykpXG4gICAgfSBjYXRjaCAoZXJyKSB7XG4gICAgICBkZWJ1ZyhlcnIpXG4gICAgICB0aGlzLmVtaXR0ZXIuZW1pdCgnZXJyb3InLCB7IHJ1bkFyZ3MsIGVyciwgY2FwczogdGhpcy5jYXBzIH0pXG4gICAgICByZXR1cm4gW11cbiAgICB9XG4gIH1cblxuICBwdWJsaWMga2lsbFByb2Nlc3MoKSB7XG4gICAgZGVidWcoYEtpbGxpbmcgZ2hjLW1vZGkgcHJvY2VzcyBmb3IgJHt0aGlzLnJvb3REaXIuZ2V0UGF0aCgpfWApXG4gICAgdGhpcy5wcm9jICYmIHRoaXMucHJvYy5raWxsKClcbiAgfVxuXG4gIHB1YmxpYyBkZXN0cm95KCkge1xuICAgIGRlYnVnKCdHaGNNb2RpUHJvY2Vzc0Jhc2UgZGVzdHJveWluZycpXG4gICAgdGhpcy5raWxsUHJvY2VzcygpXG4gICAgdGhpcy5lbWl0dGVyLmVtaXQoJ2RpZC1kZXN0cm95JywgdW5kZWZpbmVkKVxuICAgIHRoaXMuZGlzcG9zYWJsZXMuZGlzcG9zZSgpXG4gIH1cblxuICBwdWJsaWMgb25EaWREZXN0cm95KGNhbGxiYWNrOiAoKSA9PiB2b2lkKSB7XG4gICAgcmV0dXJuIHRoaXMuZW1pdHRlci5vbignZGlkLWRlc3Ryb3knLCBjYWxsYmFjaylcbiAgfVxuXG4gIHB1YmxpYyBvbldhcm5pbmcoY2FsbGJhY2s6ICh3YXJuaW5nOiBzdHJpbmcpID0+IHZvaWQpIHtcbiAgICByZXR1cm4gdGhpcy5lbWl0dGVyLm9uKCd3YXJuaW5nJywgY2FsbGJhY2spXG4gIH1cblxuICBwdWJsaWMgb25FcnJvcihjYWxsYmFjazogKGVycm9yOiBJRXJyb3JDYWxsYmFja0FyZ3MpID0+IHZvaWQpIHtcbiAgICByZXR1cm4gdGhpcy5lbWl0dGVyLm9uKCdlcnJvcicsIGNhbGxiYWNrKVxuICB9XG5cbiAgcHJpdmF0ZSBhc3luYyBzcGF3blByb2Nlc3MoZ2hjTW9kT3B0aW9uczogc3RyaW5nW10pOiBQcm9taXNlPEludGVyYWN0aXZlUHJvY2VzcyB8IHVuZGVmaW5lZD4ge1xuICAgIGlmICghYXRvbS5jb25maWcuZ2V0KCdoYXNrZWxsLWdoYy1tb2QuZW5hYmxlR2hjTW9kaScpKSB7IHJldHVybiB1bmRlZmluZWQgfVxuICAgIGRlYnVnKGBDaGVja2luZyBmb3IgZ2hjLW1vZGkgaW4gJHt0aGlzLnJvb3REaXIuZ2V0UGF0aCgpfWApXG4gICAgaWYgKHRoaXMucHJvYykge1xuICAgICAgaWYgKCFfLmlzRXF1YWwodGhpcy5naGNNb2RPcHRpb25zLCBnaGNNb2RPcHRpb25zKSkge1xuICAgICAgICBkZWJ1ZyhcbiAgICAgICAgICBgRm91bmQgcnVubmluZyBnaGMtbW9kaSBpbnN0YW5jZSBmb3IgJHt0aGlzLnJvb3REaXIuZ2V0UGF0aCgpfSwgYnV0IGdoY01vZE9wdGlvbnMgZG9uJ3QgbWF0Y2guIE9sZDogYCxcbiAgICAgICAgICB0aGlzLmdoY01vZE9wdGlvbnMsICcgbmV3OiAnLCBnaGNNb2RPcHRpb25zLFxuICAgICAgICApXG4gICAgICAgIGF3YWl0IHRoaXMucHJvYy5raWxsKClcbiAgICAgICAgcmV0dXJuIHRoaXMuc3Bhd25Qcm9jZXNzKGdoY01vZE9wdGlvbnMpXG4gICAgICB9XG4gICAgICBkZWJ1ZyhgRm91bmQgcnVubmluZyBnaGMtbW9kaSBpbnN0YW5jZSBmb3IgJHt0aGlzLnJvb3REaXIuZ2V0UGF0aCgpfWApXG4gICAgICByZXR1cm4gdGhpcy5wcm9jXG4gICAgfVxuICAgIGRlYnVnKGBTcGF3bmluZyBuZXcgZ2hjLW1vZGkgaW5zdGFuY2UgZm9yICR7dGhpcy5yb290RGlyLmdldFBhdGgoKX0gd2l0aGAsIHRoaXMub3B0aW9ucylcbiAgICBjb25zdCBtb2RQYXRoID0gYXRvbS5jb25maWcuZ2V0KCdoYXNrZWxsLWdoYy1tb2QuZ2hjTW9kUGF0aCcpXG4gICAgdGhpcy5naGNNb2RPcHRpb25zID0gZ2hjTW9kT3B0aW9uc1xuICAgIHRoaXMucHJvYyA9IG5ldyBJbnRlcmFjdGl2ZVByb2Nlc3MobW9kUGF0aCwgZ2hjTW9kT3B0aW9ucy5jb25jYXQoWydsZWdhY3ktaW50ZXJhY3RpdmUnXSksIHRoaXMub3B0aW9ucywgdGhpcy5jYXBzKVxuICAgIHRoaXMucHJvYy5vbmNlRXhpdCgoY29kZSkgPT4ge1xuICAgICAgZGVidWcoYGdoYy1tb2RpIGZvciAke3RoaXMucm9vdERpci5nZXRQYXRoKCl9IGVuZGVkIHdpdGggJHtjb2RlfWApXG4gICAgICB0aGlzLnByb2MgPSB1bmRlZmluZWRcbiAgICB9KVxuICAgIHJldHVybiB0aGlzLnByb2NcbiAgfVxuXG4gIHByaXZhdGUgYXN5bmMgcnVuTW9kQ21kKFxuICAgIHtcbiAgICAgIGdoY01vZE9wdGlvbnMsIGNvbW1hbmQsIHRleHQsIHVyaSwgYXJncyxcbiAgICB9OiB7IGdoY01vZE9wdGlvbnM6IHN0cmluZ1tdLCBjb21tYW5kOiBzdHJpbmcsIHRleHQ/OiBzdHJpbmcsIHVyaT86IHN0cmluZywgYXJnczogc3RyaW5nW10gfSxcbiAgKSB7XG4gICAgY29uc3QgbW9kUGF0aCA9IGF0b20uY29uZmlnLmdldCgnaGFza2VsbC1naGMtbW9kLmdoY01vZFBhdGgnKVxuICAgIGxldCBzdGRpblxuICAgIGNvbnN0IGNtZCA9IFsuLi5naGNNb2RPcHRpb25zXVxuICAgIGlmICh0ZXh0ICYmIHVyaSkge1xuICAgICAgY21kLnB1c2goJy0tbWFwLWZpbGUnLCB1cmkpXG4gICAgICBzdGRpbiA9IGAke3RleHR9JHtFT1R9YFxuICAgIH1cbiAgICBjbWQucHVzaChjb21tYW5kKVxuICAgIGlmICh1cmkpIHtcbiAgICAgIGNtZC5wdXNoKHVyaSlcbiAgICB9XG4gICAgY21kLnB1c2goLi4uYXJncylcbiAgICBjb25zdCB7IHN0ZG91dCwgc3RkZXJyIH0gPSBhd2FpdCBVdGlsLmV4ZWNQcm9taXNlKG1vZFBhdGgsIGNtZCwgdGhpcy5vcHRpb25zLCBzdGRpbilcbiAgICByZXR1cm4ge1xuICAgICAgc3Rkb3V0OiBzdGRvdXQuc3BsaXQoRU9MKS5zbGljZSgwLCAtMSksXG4gICAgICBzdGRlcnI6IHN0ZGVyci5zcGxpdChFT0wpLFxuICAgIH1cbiAgfVxuXG4gIHByaXZhdGUgYXN5bmMgcnVuTW9kaUNtZChcbiAgICBvOiB7IGdoY01vZE9wdGlvbnM6IHN0cmluZ1tdLCBjb21tYW5kOiBzdHJpbmcsIHRleHQ/OiBzdHJpbmcsIHVyaT86IHN0cmluZywgYXJnczogc3RyaW5nW10gfSxcbiAgKSB7XG4gICAgY29uc3QgeyBnaGNNb2RPcHRpb25zLCBjb21tYW5kLCB0ZXh0LCBhcmdzIH0gPSBvXG4gICAgbGV0IHsgdXJpIH0gPSBvXG4gICAgZGVidWcoYFRyeWluZyB0byBydW4gZ2hjLW1vZGkgaW4gJHt0aGlzLnJvb3REaXIuZ2V0UGF0aCgpfWApXG4gICAgY29uc3QgcHJvYyA9IGF3YWl0IHRoaXMuc3Bhd25Qcm9jZXNzKGdoY01vZE9wdGlvbnMpXG4gICAgaWYgKCFwcm9jKSB7XG4gICAgICBkZWJ1ZygnRmFpbGVkLiBGYWxsaW5nIGJhY2sgdG8gZ2hjLW1vZCcpXG4gICAgICByZXR1cm4gdGhpcy5ydW5Nb2RDbWQobylcbiAgICB9XG4gICAgZGVidWcoJ1N1Y2Nlc3MuIFJlc3VtaW5nLi4uJylcbiAgICBpZiAodXJpICYmICF0aGlzLmNhcHMucXVvdGVBcmdzKSB7IHVyaSA9IHRoaXMucm9vdERpci5yZWxhdGl2aXplKHVyaSkgfVxuICAgIHRyeSB7XG4gICAgICBpZiAodXJpICYmIHRleHQpIHtcbiAgICAgICAgYXdhaXQgcHJvYy5pbnRlcmFjdCgnbWFwLWZpbGUnLCBbdXJpXSwgdGV4dClcbiAgICAgIH1cbiAgICAgIGNvbnN0IHJlcyA9IGF3YWl0IHByb2MuaW50ZXJhY3QoY29tbWFuZCwgdXJpID8gW3VyaV0uY29uY2F0KGFyZ3MpIDogYXJncylcbiAgICAgIGlmICh1cmkgJiYgdGV4dCkge1xuICAgICAgICBhd2FpdCBwcm9jLmludGVyYWN0KCd1bm1hcC1maWxlJywgW3VyaV0pXG4gICAgICB9XG4gICAgICByZXR1cm4gcmVzXG4gICAgfSBmaW5hbGx5IHtcbiAgICAgIGlmICh1cmkgJiYgdGV4dCkge1xuICAgICAgICBhd2FpdCBwcm9jLmludGVyYWN0KCd1bm1hcC1maWxlJywgW3VyaV0pXG4gICAgICB9XG4gICAgfVxuICB9XG59XG4iXX0=