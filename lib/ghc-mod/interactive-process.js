"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const tslib_1 = require("tslib");
const atom_1 = require("atom");
const util_1 = require("../util");
const os_1 = require("os");
const CP = require("child_process");
const Queue = require("promise-queue");
const pidusage = require("pidusage");
Symbol.asyncIterator = Symbol.asyncIterator || Symbol.for('Symbol.asyncIterator');
class InteractiveProcess {
    constructor(path, cmd, options, caps) {
        this.caps = caps;
        this.caps = caps;
        this.disposables = new atom_1.CompositeDisposable();
        this.emitter = new atom_1.Emitter();
        this.disposables.add(this.emitter);
        this.cwd = options.cwd;
        this.requestQueue = new Queue(1, 100);
        util_1.debug(`Spawning new ghc-modi instance for ${options.cwd} with options = `, options);
        this.proc = CP.spawn(path, cmd, options);
        this.proc.stdout.setEncoding('utf-8');
        this.proc.stderr.setEncoding('utf-8');
        this.proc.setMaxListeners(100);
        this.proc.stdout.setMaxListeners(100);
        this.proc.stderr.setMaxListeners(100);
        this.resetTimer();
        this.proc.once('exit', (code) => {
            this.timer && window.clearTimeout(this.timer);
            util_1.debug(`ghc-modi for ${options.cwd} ended with ${code}`);
            this.emitter.emit('did-exit', code);
            this.disposables.dispose();
        });
    }
    onceExit(action) {
        return this.emitter.once('did-exit', action);
    }
    async kill() {
        this.proc.stdin.end();
        this.proc.kill();
        return new Promise((resolve) => {
            this.proc.once('exit', (code) => resolve(code));
        });
    }
    async interact(command, args, data) {
        return this.requestQueue.add(async () => {
            this.proc.stdout.pause();
            this.proc.stderr.pause();
            pidusage.stat(this.proc.pid, (err, stat) => {
                if (err) {
                    util_1.warn(err);
                    return;
                }
                if (stat.memory > atom.config.get('haskell-ghc-mod.maxMemMegs') * 1024 * 1024) {
                    this.proc.kill();
                }
            });
            util_1.debug(`Started interactive action block in ${this.cwd}`);
            util_1.debug(`Running interactive command ${command} ${args} ${data ? 'with' : 'without'} additional data`);
            let ended = false;
            try {
                const isEnded = () => ended;
                const stderr = [];
                const stdout = [];
                setImmediate(async () => {
                    try {
                        for (var _a = tslib_1.__asyncValues(this.readgen(this.proc.stderr, isEnded)), _b; _b = await _a.next(), !_b.done;) {
                            const line = await _b.value;
                            stderr.push(line);
                        }
                    }
                    catch (e_1_1) { e_1 = { error: e_1_1 }; }
                    finally {
                        try {
                            if (_b && !_b.done && (_c = _a.return)) await _c.call(_a);
                        }
                        finally { if (e_1) throw e_1.error; }
                    }
                    var e_1, _c;
                });
                const readOutput = async () => {
                    try {
                        for (var _a = tslib_1.__asyncValues(this.readgen(this.proc.stdout, isEnded)), _b; _b = await _a.next(), !_b.done;) {
                            const line = await _b.value;
                            util_1.debug(`Got response from ghc-modi: ${line}`);
                            if (line === 'OK') {
                                ended = true;
                            }
                            else {
                                stdout.push(line);
                            }
                        }
                    }
                    catch (e_2_1) { e_2 = { error: e_2_1 }; }
                    finally {
                        try {
                            if (_b && !_b.done && (_c = _a.return)) await _c.call(_a);
                        }
                        finally { if (e_2) throw e_2.error; }
                    }
                    return { stdout, stderr };
                    var e_2, _c;
                };
                const exitEvent = async () => new Promise((_resolve, reject) => {
                    this.proc.once('exit', () => {
                        util_1.warn(stdout.join('\n'));
                        reject(util_1.mkError('GHCModInteractiveCrash', `${stdout}\n\n${stderr}`));
                    });
                });
                const timeoutEvent = async () => new Promise((_resolve, reject) => {
                    const tml = atom.config.get('haskell-ghc-mod.interactiveActionTimeout');
                    if (tml) {
                        setTimeout(() => {
                            reject(util_1.mkError('InteractiveActionTimeout', `${stdout}\n\n${stderr}`));
                        }, tml * 1000);
                    }
                });
                const args2 = this.caps.quoteArgs ?
                    ['ascii-escape', command].concat(args.map((x) => `\x02${x}\x03`))
                    :
                        [command, ...args];
                util_1.debug(`Running ghc-modi command ${command}`, ...args);
                this.proc.stdin.write(`${args2.join(' ').replace(/(?:\r?\n|\r)/g, ' ')}${os_1.EOL}`);
                if (data) {
                    util_1.debug('Writing data to stdin...');
                    this.proc.stdin.write(`${data}${util_1.EOT}`);
                }
                return await Promise.race([readOutput(), exitEvent(), timeoutEvent()]);
            }
            catch (error) {
                if (error.name === 'InteractiveActionTimeout') {
                    this.proc.kill();
                }
                throw error;
            }
            finally {
                util_1.debug(`Ended interactive action block in ${this.cwd}`);
                ended = true;
                this.proc.stdout.resume();
                this.proc.stderr.resume();
            }
        });
    }
    resetTimer() {
        if (this.timer) {
            clearTimeout(this.timer);
        }
        const tml = atom.config.get('haskell-ghc-mod.interactiveInactivityTimeout');
        if (tml) {
            this.timer = window.setTimeout(() => { this.kill(); }, tml * 60 * 1000);
        }
    }
    async waitReadable(stream) {
        return new Promise((resolve) => stream.once('readable', () => {
            resolve();
        }));
    }
    readgen(out, isEnded) {
        return tslib_1.__asyncGenerator(this, arguments, function* readgen_1() {
            let buffer = '';
            while (!isEnded()) {
                const read = out.read();
                if (read !== null) {
                    buffer += read;
                    if (buffer.includes(os_1.EOL)) {
                        const arr = buffer.split(os_1.EOL);
                        buffer = arr.pop() || '';
                        yield tslib_1.__await(yield* tslib_1.__asyncDelegator(tslib_1.__asyncValues(arr)));
                    }
                }
                else {
                    yield tslib_1.__await(this.waitReadable(out));
                }
            }
            if (buffer) {
                out.unshift(buffer);
            }
        });
    }
}
exports.InteractiveProcess = InteractiveProcess;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaW50ZXJhY3RpdmUtcHJvY2Vzcy5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uLy4uL3NyYy9naGMtbW9kL2ludGVyYWN0aXZlLXByb2Nlc3MudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7O0FBQUEsK0JBQW1EO0FBQ25ELGtDQUFtRDtBQUNuRCwyQkFBd0I7QUFDeEIsb0NBQW1DO0FBQ25DLHVDQUF1QztBQUN2QyxxQ0FBcUM7QUFFcEMsTUFBYyxDQUFDLGFBQWEsR0FBRyxNQUFNLENBQUMsYUFBYSxJQUFJLE1BQU0sQ0FBQyxHQUFHLENBQUMsc0JBQXNCLENBQUMsQ0FBQTtBQWMxRjtJQVVFLFlBQVksSUFBWSxFQUFFLEdBQWEsRUFBRSxPQUF3QixFQUFVLElBQWdCO1FBQWhCLFNBQUksR0FBSixJQUFJLENBQVk7UUFDekYsSUFBSSxDQUFDLElBQUksR0FBRyxJQUFJLENBQUE7UUFDaEIsSUFBSSxDQUFDLFdBQVcsR0FBRyxJQUFJLDBCQUFtQixFQUFFLENBQUE7UUFDNUMsSUFBSSxDQUFDLE9BQU8sR0FBRyxJQUFJLGNBQU8sRUFBRSxDQUFBO1FBQzVCLElBQUksQ0FBQyxXQUFXLENBQUMsR0FBRyxDQUFDLElBQUksQ0FBQyxPQUFPLENBQUMsQ0FBQTtRQUNsQyxJQUFJLENBQUMsR0FBRyxHQUFHLE9BQU8sQ0FBQyxHQUFHLENBQUE7UUFDdEIsSUFBSSxDQUFDLFlBQVksR0FBRyxJQUFJLEtBQUssQ0FBQyxDQUFDLEVBQUUsR0FBRyxDQUFDLENBQUE7UUFFckMsWUFBSyxDQUFDLHNDQUFzQyxPQUFPLENBQUMsR0FBRyxrQkFBa0IsRUFBRSxPQUFPLENBQUMsQ0FBQTtRQUNuRixJQUFJLENBQUMsSUFBSSxHQUFHLEVBQUUsQ0FBQyxLQUFLLENBQUMsSUFBSSxFQUFFLEdBQUcsRUFBRSxPQUFPLENBQUMsQ0FBQTtRQUN4QyxJQUFJLENBQUMsSUFBSSxDQUFDLE1BQU0sQ0FBQyxXQUFXLENBQUMsT0FBTyxDQUFDLENBQUE7UUFDckMsSUFBSSxDQUFDLElBQUksQ0FBQyxNQUFNLENBQUMsV0FBVyxDQUFDLE9BQU8sQ0FBQyxDQUFBO1FBQ3JDLElBQUksQ0FBQyxJQUFJLENBQUMsZUFBZSxDQUFDLEdBQUcsQ0FBQyxDQUFBO1FBQzlCLElBQUksQ0FBQyxJQUFJLENBQUMsTUFBTSxDQUFDLGVBQWUsQ0FBQyxHQUFHLENBQUMsQ0FBQTtRQUNyQyxJQUFJLENBQUMsSUFBSSxDQUFDLE1BQU0sQ0FBQyxlQUFlLENBQUMsR0FBRyxDQUFDLENBQUE7UUFDckMsSUFBSSxDQUFDLFVBQVUsRUFBRSxDQUFBO1FBQ2pCLElBQUksQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLE1BQU0sRUFBRSxDQUFDLElBQUksRUFBRSxFQUFFO1lBQzlCLElBQUksQ0FBQyxLQUFLLElBQUksTUFBTSxDQUFDLFlBQVksQ0FBQyxJQUFJLENBQUMsS0FBSyxDQUFDLENBQUE7WUFDN0MsWUFBSyxDQUFDLGdCQUFnQixPQUFPLENBQUMsR0FBRyxlQUFlLElBQUksRUFBRSxDQUFDLENBQUE7WUFDdkQsSUFBSSxDQUFDLE9BQU8sQ0FBQyxJQUFJLENBQUMsVUFBVSxFQUFFLElBQUksQ0FBQyxDQUFBO1lBQ25DLElBQUksQ0FBQyxXQUFXLENBQUMsT0FBTyxFQUFFLENBQUE7UUFDNUIsQ0FBQyxDQUFDLENBQUE7SUFDSixDQUFDO0lBRU0sUUFBUSxDQUFDLE1BQThCO1FBQzVDLE1BQU0sQ0FBQyxJQUFJLENBQUMsT0FBTyxDQUFDLElBQUksQ0FBQyxVQUFVLEVBQUUsTUFBTSxDQUFDLENBQUE7SUFDOUMsQ0FBQztJQUVNLEtBQUssQ0FBQyxJQUFJO1FBQ2YsSUFBSSxDQUFDLElBQUksQ0FBQyxLQUFLLENBQUMsR0FBRyxFQUFFLENBQUE7UUFDckIsSUFBSSxDQUFDLElBQUksQ0FBQyxJQUFJLEVBQUUsQ0FBQTtRQUNoQixNQUFNLENBQUMsSUFBSSxPQUFPLENBQVMsQ0FBQyxPQUFPLEVBQUUsRUFBRTtZQUNyQyxJQUFJLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxNQUFNLEVBQUUsQ0FBQyxJQUFJLEVBQUUsRUFBRSxDQUFDLE9BQU8sQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFBO1FBQ2pELENBQUMsQ0FBQyxDQUFBO0lBQ0osQ0FBQztJQUVNLEtBQUssQ0FBQyxRQUFRLENBQ25CLE9BQWUsRUFBRSxJQUFjLEVBQUUsSUFBYTtRQUU5QyxNQUFNLENBQUMsSUFBSSxDQUFDLFlBQVksQ0FBQyxHQUFHLENBQUMsS0FBSyxJQUFJLEVBQUU7WUFDdEMsSUFBSSxDQUFDLElBQUksQ0FBQyxNQUFNLENBQUMsS0FBSyxFQUFFLENBQUE7WUFDeEIsSUFBSSxDQUFDLElBQUksQ0FBQyxNQUFNLENBQUMsS0FBSyxFQUFFLENBQUE7WUFFeEIsUUFBUSxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLEdBQUcsRUFBRSxDQUFDLEdBQUcsRUFBRSxJQUFJLEVBQUUsRUFBRTtnQkFDekMsRUFBRSxDQUFDLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQztvQkFDUixXQUFJLENBQUMsR0FBRyxDQUFDLENBQUE7b0JBQ1QsTUFBTSxDQUFBO2dCQUNSLENBQUM7Z0JBQ0QsRUFBRSxDQUFDLENBQUMsSUFBSSxDQUFDLE1BQU0sR0FBRyxJQUFJLENBQUMsTUFBTSxDQUFDLEdBQUcsQ0FBQyw0QkFBNEIsQ0FBQyxHQUFHLElBQUksR0FBRyxJQUFJLENBQUMsQ0FBQyxDQUFDO29CQUM5RSxJQUFJLENBQUMsSUFBSSxDQUFDLElBQUksRUFBRSxDQUFBO2dCQUNsQixDQUFDO1lBQ0gsQ0FBQyxDQUFDLENBQUE7WUFFRixZQUFLLENBQUMsdUNBQXVDLElBQUksQ0FBQyxHQUFHLEVBQUUsQ0FBQyxDQUFBO1lBQ3hELFlBQUssQ0FBQywrQkFBK0IsT0FBTyxJQUFJLElBQUksSUFBSSxJQUFJLENBQUMsQ0FBQyxDQUFDLE1BQU0sQ0FBQyxDQUFDLENBQUMsU0FBUyxrQkFBa0IsQ0FBQyxDQUFBO1lBQ3BHLElBQUksS0FBSyxHQUFHLEtBQUssQ0FBQTtZQUNqQixJQUFJLENBQUM7Z0JBQ0gsTUFBTSxPQUFPLEdBQUcsR0FBRyxFQUFFLENBQUMsS0FBSyxDQUFBO2dCQUMzQixNQUFNLE1BQU0sR0FBYSxFQUFFLENBQUE7Z0JBQzNCLE1BQU0sTUFBTSxHQUFhLEVBQUUsQ0FBQTtnQkFDM0IsWUFBWSxDQUFDLEtBQUssSUFBSSxFQUFFOzt3QkFDdEIsR0FBRyxDQUFDLENBQXFCLElBQUEsS0FBQSxzQkFBQSxJQUFJLENBQUMsT0FBTyxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsTUFBTSxFQUFFLE9BQU8sQ0FBQyxDQUFBLElBQUE7NEJBQXJELE1BQU0sSUFBSSxpQkFBQSxDQUFBOzRCQUNuQixNQUFNLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxDQUFBO3lCQUNsQjs7Ozs7Ozs7OztnQkFDSCxDQUFDLENBQUMsQ0FBQTtnQkFDRixNQUFNLFVBQVUsR0FBRyxLQUFLLElBQUksRUFBRTs7d0JBQzVCLEdBQUcsQ0FBQyxDQUFxQixJQUFBLEtBQUEsc0JBQUEsSUFBSSxDQUFDLE9BQU8sQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLE1BQU0sRUFBRSxPQUFPLENBQUMsQ0FBQSxJQUFBOzRCQUFyRCxNQUFNLElBQUksaUJBQUEsQ0FBQTs0QkFDbkIsWUFBSyxDQUFDLCtCQUErQixJQUFJLEVBQUUsQ0FBQyxDQUFBOzRCQUM1QyxFQUFFLENBQUMsQ0FBQyxJQUFJLEtBQUssSUFBSSxDQUFDLENBQUMsQ0FBQztnQ0FDbEIsS0FBSyxHQUFHLElBQUksQ0FBQTs0QkFDZCxDQUFDOzRCQUFDLElBQUksQ0FBQyxDQUFDO2dDQUNOLE1BQU0sQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLENBQUE7NEJBQ25CLENBQUM7eUJBQ0Y7Ozs7Ozs7OztvQkFDRCxNQUFNLENBQUMsRUFBRSxNQUFNLEVBQUUsTUFBTSxFQUFFLENBQUE7O2dCQUMzQixDQUFDLENBQUE7Z0JBQ0QsTUFBTSxTQUFTLEdBQUcsS0FBSyxJQUFJLEVBQUUsQ0FBQyxJQUFJLE9BQU8sQ0FBUSxDQUFDLFFBQVEsRUFBRSxNQUFNLEVBQUUsRUFBRTtvQkFDcEUsSUFBSSxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsTUFBTSxFQUFFLEdBQUcsRUFBRTt3QkFDMUIsV0FBSSxDQUFDLE1BQU0sQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQTt3QkFDdkIsTUFBTSxDQUFDLGNBQU8sQ0FBQyx3QkFBd0IsRUFBRSxHQUFHLE1BQU0sT0FBTyxNQUFNLEVBQUUsQ0FBQyxDQUFDLENBQUE7b0JBQ3JFLENBQUMsQ0FBQyxDQUFBO2dCQUNKLENBQUMsQ0FBQyxDQUFBO2dCQUNGLE1BQU0sWUFBWSxHQUFHLEtBQUssSUFBSSxFQUFFLENBQUMsSUFBSSxPQUFPLENBQVEsQ0FBQyxRQUFRLEVBQUUsTUFBTSxFQUFFLEVBQUU7b0JBQ3ZFLE1BQU0sR0FBRyxHQUFXLElBQUksQ0FBQyxNQUFNLENBQUMsR0FBRyxDQUFDLDBDQUEwQyxDQUFDLENBQUE7b0JBQy9FLEVBQUUsQ0FBQyxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUM7d0JBQ1IsVUFBVSxDQUNSLEdBQUcsRUFBRTs0QkFDSCxNQUFNLENBQUMsY0FBTyxDQUFDLDBCQUEwQixFQUFFLEdBQUcsTUFBTSxPQUFPLE1BQU0sRUFBRSxDQUFDLENBQUMsQ0FBQTt3QkFDdkUsQ0FBQyxFQUNELEdBQUcsR0FBRyxJQUFJLENBQ1gsQ0FBQTtvQkFDSCxDQUFDO2dCQUNILENBQUMsQ0FBQyxDQUFBO2dCQUVGLE1BQU0sS0FBSyxHQUNULElBQUksQ0FBQyxJQUFJLENBQUMsU0FBUyxDQUFDLENBQUM7b0JBQ25CLENBQUMsY0FBYyxFQUFFLE9BQU8sQ0FBQyxDQUFDLE1BQU0sQ0FBQyxJQUFJLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQyxFQUFFLEVBQUUsQ0FBQyxPQUFPLENBQUMsTUFBTSxDQUFDLENBQUM7b0JBQ2pFLENBQUM7d0JBQ0QsQ0FBQyxPQUFPLEVBQUUsR0FBRyxJQUFJLENBQUMsQ0FBQTtnQkFDdEIsWUFBSyxDQUFDLDRCQUE0QixPQUFPLEVBQUUsRUFBRSxHQUFHLElBQUksQ0FBQyxDQUFBO2dCQUNyRCxJQUFJLENBQUMsSUFBSSxDQUFDLEtBQUssQ0FBQyxLQUFLLENBQUMsR0FBRyxLQUFLLENBQUMsSUFBSSxDQUFDLEdBQUcsQ0FBQyxDQUFDLE9BQU8sQ0FBQyxlQUFlLEVBQUUsR0FBRyxDQUFDLEdBQUcsUUFBRyxFQUFFLENBQUMsQ0FBQTtnQkFDL0UsRUFBRSxDQUFDLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQztvQkFDVCxZQUFLLENBQUMsMEJBQTBCLENBQUMsQ0FBQTtvQkFDakMsSUFBSSxDQUFDLElBQUksQ0FBQyxLQUFLLENBQUMsS0FBSyxDQUFDLEdBQUcsSUFBSSxHQUFHLFVBQUcsRUFBRSxDQUFDLENBQUE7Z0JBQ3hDLENBQUM7Z0JBQ0QsTUFBTSxDQUFDLE1BQU0sT0FBTyxDQUFDLElBQUksQ0FBQyxDQUFDLFVBQVUsRUFBRSxFQUFFLFNBQVMsRUFBRSxFQUFFLFlBQVksRUFBRSxDQUFDLENBQUMsQ0FBQTtZQUN4RSxDQUFDO1lBQUMsS0FBSyxDQUFDLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQztnQkFFZixFQUFFLENBQUMsQ0FBQyxLQUFLLENBQUMsSUFBSSxLQUFLLDBCQUEwQixDQUFDLENBQUMsQ0FBQztvQkFDOUMsSUFBSSxDQUFDLElBQUksQ0FBQyxJQUFJLEVBQUUsQ0FBQTtnQkFDbEIsQ0FBQztnQkFDRCxNQUFNLEtBQUssQ0FBQTtZQUNiLENBQUM7b0JBQVMsQ0FBQztnQkFDVCxZQUFLLENBQUMscUNBQXFDLElBQUksQ0FBQyxHQUFHLEVBQUUsQ0FBQyxDQUFBO2dCQUN0RCxLQUFLLEdBQUcsSUFBSSxDQUFBO2dCQUNaLElBQUksQ0FBQyxJQUFJLENBQUMsTUFBTSxDQUFDLE1BQU0sRUFBRSxDQUFBO2dCQUN6QixJQUFJLENBQUMsSUFBSSxDQUFDLE1BQU0sQ0FBQyxNQUFNLEVBQUUsQ0FBQTtZQUMzQixDQUFDO1FBQ0gsQ0FBQyxDQUFDLENBQUE7SUFDSixDQUFDO0lBRU8sVUFBVTtRQUNoQixFQUFFLENBQUMsQ0FBQyxJQUFJLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQztZQUNmLFlBQVksQ0FBQyxJQUFJLENBQUMsS0FBSyxDQUFDLENBQUE7UUFDMUIsQ0FBQztRQUNELE1BQU0sR0FBRyxHQUFHLElBQUksQ0FBQyxNQUFNLENBQUMsR0FBRyxDQUFDLDhDQUE4QyxDQUFDLENBQUE7UUFDM0UsRUFBRSxDQUFDLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQztZQUVSLElBQUksQ0FBQyxLQUFLLEdBQUcsTUFBTSxDQUFDLFVBQVUsQ0FBQyxHQUFHLEVBQUUsR0FBRyxJQUFJLENBQUMsSUFBSSxFQUFFLENBQUEsQ0FBQyxDQUFDLEVBQUUsR0FBRyxHQUFHLEVBQUUsR0FBRyxJQUFJLENBQUMsQ0FBQTtRQUN4RSxDQUFDO0lBQ0gsQ0FBQztJQUVPLEtBQUssQ0FBQyxZQUFZLENBQUMsTUFBNkI7UUFDdEQsTUFBTSxDQUFDLElBQUksT0FBTyxDQUFDLENBQUMsT0FBTyxFQUFFLEVBQUUsQ0FBQyxNQUFNLENBQUMsSUFBSSxDQUFDLFVBQVUsRUFBRSxHQUFHLEVBQUU7WUFDM0QsT0FBTyxFQUFFLENBQUE7UUFDWCxDQUFDLENBQUMsQ0FBQyxDQUFBO0lBQ0wsQ0FBQztJQUVjLE9BQU8sQ0FBQyxHQUEwQixFQUFFLE9BQXNCOztZQUN2RSxJQUFJLE1BQU0sR0FBRyxFQUFFLENBQUE7WUFDZixPQUFPLENBQUMsT0FBTyxFQUFFLEVBQUUsQ0FBQztnQkFDbEIsTUFBTSxJQUFJLEdBQUcsR0FBRyxDQUFDLElBQUksRUFBcUIsQ0FBQTtnQkFFMUMsRUFBRSxDQUFDLENBQUMsSUFBSSxLQUFLLElBQUksQ0FBQyxDQUFDLENBQUM7b0JBQ2xCLE1BQU0sSUFBSSxJQUFJLENBQUE7b0JBQ2QsRUFBRSxDQUFDLENBQUMsTUFBTSxDQUFDLFFBQVEsQ0FBQyxRQUFHLENBQUMsQ0FBQyxDQUFDLENBQUM7d0JBQ3pCLE1BQU0sR0FBRyxHQUFHLE1BQU0sQ0FBQyxLQUFLLENBQUMsUUFBRyxDQUFDLENBQUE7d0JBQzdCLE1BQU0sR0FBRyxHQUFHLENBQUMsR0FBRyxFQUFFLElBQUksRUFBRSxDQUFBO3dCQUN4QixzQkFBQSxLQUFLLENBQUMsQ0FBQyx5QkFBQSxzQkFBQSxHQUFHLENBQUEsQ0FBQSxDQUFBLENBQUE7b0JBQ1osQ0FBQztnQkFDSCxDQUFDO2dCQUFDLElBQUksQ0FBQyxDQUFDO29CQUNOLHNCQUFNLElBQUksQ0FBQyxZQUFZLENBQUMsR0FBRyxDQUFDLENBQUEsQ0FBQTtnQkFDOUIsQ0FBQztZQUNILENBQUM7WUFDRCxFQUFFLENBQUMsQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDO2dCQUFDLEdBQUcsQ0FBQyxPQUFPLENBQUMsTUFBTSxDQUFDLENBQUE7WUFBQyxDQUFDO1FBQ3JDLENBQUM7S0FBQTtDQUNGO0FBdEtELGdEQXNLQyIsInNvdXJjZXNDb250ZW50IjpbImltcG9ydCB7IEVtaXR0ZXIsIENvbXBvc2l0ZURpc3Bvc2FibGUgfSBmcm9tICdhdG9tJ1xuaW1wb3J0IHsgZGVidWcsIHdhcm4sIG1rRXJyb3IsIEVPVCB9IGZyb20gJy4uL3V0aWwnXG5pbXBvcnQgeyBFT0wgfSBmcm9tICdvcydcbmltcG9ydCAqIGFzIENQIGZyb20gJ2NoaWxkX3Byb2Nlc3MnXG5pbXBvcnQgUXVldWUgPSByZXF1aXJlKCdwcm9taXNlLXF1ZXVlJylcbmltcG9ydCBwaWR1c2FnZSA9IHJlcXVpcmUoJ3BpZHVzYWdlJylcblxuKFN5bWJvbCBhcyBhbnkpLmFzeW5jSXRlcmF0b3IgPSBTeW1ib2wuYXN5bmNJdGVyYXRvciB8fCBTeW1ib2wuZm9yKCdTeW1ib2wuYXN5bmNJdGVyYXRvcicpXG5cbmV4cG9ydCBpbnRlcmZhY2UgR0hDTW9kQ2FwcyB7XG4gIHZlcnNpb246IG51bWJlcltdLFxuICBmaWxlTWFwOiBib29sZWFuLFxuICBxdW90ZUFyZ3M6IGJvb2xlYW4sXG4gIG9wdHBhcnNlOiBib29sZWFuLFxuICB0eXBlQ29uc3RyYWludHM6IGJvb2xlYW4sXG4gIGJyb3dzZVBhcmVudHM6IGJvb2xlYW4sXG4gIGludGVyYWN0aXZlQ2FzZVNwbGl0OiBib29sZWFuLFxuICBpbXBvcnRlZEZyb206IGJvb2xlYW4sXG4gIGJyb3dzZU1haW46IGJvb2xlYW5cbn1cblxuZXhwb3J0IGNsYXNzIEludGVyYWN0aXZlUHJvY2VzcyB7XG4gIHByaXZhdGUgZGlzcG9zYWJsZXM6IENvbXBvc2l0ZURpc3Bvc2FibGVcbiAgcHJpdmF0ZSBlbWl0dGVyOiBFbWl0dGVyPHt9LCB7XG4gICAgJ2RpZC1leGl0JzogbnVtYmVyXG4gIH0+XG4gIHByaXZhdGUgcHJvYzogQ1AuQ2hpbGRQcm9jZXNzXG4gIHByaXZhdGUgY3dkOiBzdHJpbmdcbiAgcHJpdmF0ZSB0aW1lcjogbnVtYmVyIHwgdW5kZWZpbmVkXG4gIHByaXZhdGUgcmVxdWVzdFF1ZXVlOiBRdWV1ZVxuXG4gIGNvbnN0cnVjdG9yKHBhdGg6IHN0cmluZywgY21kOiBzdHJpbmdbXSwgb3B0aW9uczogeyBjd2Q6IHN0cmluZyB9LCBwcml2YXRlIGNhcHM6IEdIQ01vZENhcHMpIHtcbiAgICB0aGlzLmNhcHMgPSBjYXBzXG4gICAgdGhpcy5kaXNwb3NhYmxlcyA9IG5ldyBDb21wb3NpdGVEaXNwb3NhYmxlKClcbiAgICB0aGlzLmVtaXR0ZXIgPSBuZXcgRW1pdHRlcigpXG4gICAgdGhpcy5kaXNwb3NhYmxlcy5hZGQodGhpcy5lbWl0dGVyKVxuICAgIHRoaXMuY3dkID0gb3B0aW9ucy5jd2RcbiAgICB0aGlzLnJlcXVlc3RRdWV1ZSA9IG5ldyBRdWV1ZSgxLCAxMDApXG5cbiAgICBkZWJ1ZyhgU3Bhd25pbmcgbmV3IGdoYy1tb2RpIGluc3RhbmNlIGZvciAke29wdGlvbnMuY3dkfSB3aXRoIG9wdGlvbnMgPSBgLCBvcHRpb25zKVxuICAgIHRoaXMucHJvYyA9IENQLnNwYXduKHBhdGgsIGNtZCwgb3B0aW9ucylcbiAgICB0aGlzLnByb2Muc3Rkb3V0LnNldEVuY29kaW5nKCd1dGYtOCcpXG4gICAgdGhpcy5wcm9jLnN0ZGVyci5zZXRFbmNvZGluZygndXRmLTgnKVxuICAgIHRoaXMucHJvYy5zZXRNYXhMaXN0ZW5lcnMoMTAwKVxuICAgIHRoaXMucHJvYy5zdGRvdXQuc2V0TWF4TGlzdGVuZXJzKDEwMClcbiAgICB0aGlzLnByb2Muc3RkZXJyLnNldE1heExpc3RlbmVycygxMDApXG4gICAgdGhpcy5yZXNldFRpbWVyKClcbiAgICB0aGlzLnByb2Mub25jZSgnZXhpdCcsIChjb2RlKSA9PiB7XG4gICAgICB0aGlzLnRpbWVyICYmIHdpbmRvdy5jbGVhclRpbWVvdXQodGhpcy50aW1lcilcbiAgICAgIGRlYnVnKGBnaGMtbW9kaSBmb3IgJHtvcHRpb25zLmN3ZH0gZW5kZWQgd2l0aCAke2NvZGV9YClcbiAgICAgIHRoaXMuZW1pdHRlci5lbWl0KCdkaWQtZXhpdCcsIGNvZGUpXG4gICAgICB0aGlzLmRpc3Bvc2FibGVzLmRpc3Bvc2UoKVxuICAgIH0pXG4gIH1cblxuICBwdWJsaWMgb25jZUV4aXQoYWN0aW9uOiAoY29kZTogbnVtYmVyKSA9PiB2b2lkKSB7XG4gICAgcmV0dXJuIHRoaXMuZW1pdHRlci5vbmNlKCdkaWQtZXhpdCcsIGFjdGlvbilcbiAgfVxuXG4gIHB1YmxpYyBhc3luYyBraWxsKCk6IFByb21pc2U8bnVtYmVyPiB7XG4gICAgdGhpcy5wcm9jLnN0ZGluLmVuZCgpXG4gICAgdGhpcy5wcm9jLmtpbGwoKVxuICAgIHJldHVybiBuZXcgUHJvbWlzZTxudW1iZXI+KChyZXNvbHZlKSA9PiB7XG4gICAgICB0aGlzLnByb2Mub25jZSgnZXhpdCcsIChjb2RlKSA9PiByZXNvbHZlKGNvZGUpKVxuICAgIH0pXG4gIH1cblxuICBwdWJsaWMgYXN5bmMgaW50ZXJhY3QoXG4gICAgY29tbWFuZDogc3RyaW5nLCBhcmdzOiBzdHJpbmdbXSwgZGF0YT86IHN0cmluZyxcbiAgKTogUHJvbWlzZTx7IHN0ZG91dDogc3RyaW5nW10sIHN0ZGVycjogc3RyaW5nW10gfT4ge1xuICAgIHJldHVybiB0aGlzLnJlcXVlc3RRdWV1ZS5hZGQoYXN5bmMgKCkgPT4ge1xuICAgICAgdGhpcy5wcm9jLnN0ZG91dC5wYXVzZSgpXG4gICAgICB0aGlzLnByb2Muc3RkZXJyLnBhdXNlKClcblxuICAgICAgcGlkdXNhZ2Uuc3RhdCh0aGlzLnByb2MucGlkLCAoZXJyLCBzdGF0KSA9PiB7XG4gICAgICAgIGlmIChlcnIpIHtcbiAgICAgICAgICB3YXJuKGVycilcbiAgICAgICAgICByZXR1cm5cbiAgICAgICAgfVxuICAgICAgICBpZiAoc3RhdC5tZW1vcnkgPiBhdG9tLmNvbmZpZy5nZXQoJ2hhc2tlbGwtZ2hjLW1vZC5tYXhNZW1NZWdzJykgKiAxMDI0ICogMTAyNCkge1xuICAgICAgICAgIHRoaXMucHJvYy5raWxsKClcbiAgICAgICAgfVxuICAgICAgfSlcblxuICAgICAgZGVidWcoYFN0YXJ0ZWQgaW50ZXJhY3RpdmUgYWN0aW9uIGJsb2NrIGluICR7dGhpcy5jd2R9YClcbiAgICAgIGRlYnVnKGBSdW5uaW5nIGludGVyYWN0aXZlIGNvbW1hbmQgJHtjb21tYW5kfSAke2FyZ3N9ICR7ZGF0YSA/ICd3aXRoJyA6ICd3aXRob3V0J30gYWRkaXRpb25hbCBkYXRhYClcbiAgICAgIGxldCBlbmRlZCA9IGZhbHNlXG4gICAgICB0cnkge1xuICAgICAgICBjb25zdCBpc0VuZGVkID0gKCkgPT4gZW5kZWRcbiAgICAgICAgY29uc3Qgc3RkZXJyOiBzdHJpbmdbXSA9IFtdXG4gICAgICAgIGNvbnN0IHN0ZG91dDogc3RyaW5nW10gPSBbXVxuICAgICAgICBzZXRJbW1lZGlhdGUoYXN5bmMgKCkgPT4ge1xuICAgICAgICAgIGZvciBhd2FpdCAoY29uc3QgbGluZSBvZiB0aGlzLnJlYWRnZW4odGhpcy5wcm9jLnN0ZGVyciwgaXNFbmRlZCkpIHtcbiAgICAgICAgICAgIHN0ZGVyci5wdXNoKGxpbmUpXG4gICAgICAgICAgfVxuICAgICAgICB9KVxuICAgICAgICBjb25zdCByZWFkT3V0cHV0ID0gYXN5bmMgKCkgPT4ge1xuICAgICAgICAgIGZvciBhd2FpdCAoY29uc3QgbGluZSBvZiB0aGlzLnJlYWRnZW4odGhpcy5wcm9jLnN0ZG91dCwgaXNFbmRlZCkpIHtcbiAgICAgICAgICAgIGRlYnVnKGBHb3QgcmVzcG9uc2UgZnJvbSBnaGMtbW9kaTogJHtsaW5lfWApXG4gICAgICAgICAgICBpZiAobGluZSA9PT0gJ09LJykge1xuICAgICAgICAgICAgICBlbmRlZCA9IHRydWVcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgIHN0ZG91dC5wdXNoKGxpbmUpXG4gICAgICAgICAgICB9XG4gICAgICAgICAgfVxuICAgICAgICAgIHJldHVybiB7IHN0ZG91dCwgc3RkZXJyIH1cbiAgICAgICAgfVxuICAgICAgICBjb25zdCBleGl0RXZlbnQgPSBhc3luYyAoKSA9PiBuZXcgUHJvbWlzZTxuZXZlcj4oKF9yZXNvbHZlLCByZWplY3QpID0+IHtcbiAgICAgICAgICB0aGlzLnByb2Mub25jZSgnZXhpdCcsICgpID0+IHtcbiAgICAgICAgICAgIHdhcm4oc3Rkb3V0LmpvaW4oJ1xcbicpKVxuICAgICAgICAgICAgcmVqZWN0KG1rRXJyb3IoJ0dIQ01vZEludGVyYWN0aXZlQ3Jhc2gnLCBgJHtzdGRvdXR9XFxuXFxuJHtzdGRlcnJ9YCkpXG4gICAgICAgICAgfSlcbiAgICAgICAgfSlcbiAgICAgICAgY29uc3QgdGltZW91dEV2ZW50ID0gYXN5bmMgKCkgPT4gbmV3IFByb21pc2U8bmV2ZXI+KChfcmVzb2x2ZSwgcmVqZWN0KSA9PiB7XG4gICAgICAgICAgY29uc3QgdG1sOiBudW1iZXIgPSBhdG9tLmNvbmZpZy5nZXQoJ2hhc2tlbGwtZ2hjLW1vZC5pbnRlcmFjdGl2ZUFjdGlvblRpbWVvdXQnKVxuICAgICAgICAgIGlmICh0bWwpIHtcbiAgICAgICAgICAgIHNldFRpbWVvdXQoXG4gICAgICAgICAgICAgICgpID0+IHtcbiAgICAgICAgICAgICAgICByZWplY3QobWtFcnJvcignSW50ZXJhY3RpdmVBY3Rpb25UaW1lb3V0JywgYCR7c3Rkb3V0fVxcblxcbiR7c3RkZXJyfWApKVxuICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgICB0bWwgKiAxMDAwLFxuICAgICAgICAgICAgKVxuICAgICAgICAgIH1cbiAgICAgICAgfSlcblxuICAgICAgICBjb25zdCBhcmdzMiA9XG4gICAgICAgICAgdGhpcy5jYXBzLnF1b3RlQXJncyA/XG4gICAgICAgICAgICBbJ2FzY2lpLWVzY2FwZScsIGNvbW1hbmRdLmNvbmNhdChhcmdzLm1hcCgoeCkgPT4gYFxceDAyJHt4fVxceDAzYCkpXG4gICAgICAgICAgICA6XG4gICAgICAgICAgICBbY29tbWFuZCwgLi4uYXJnc11cbiAgICAgICAgZGVidWcoYFJ1bm5pbmcgZ2hjLW1vZGkgY29tbWFuZCAke2NvbW1hbmR9YCwgLi4uYXJncylcbiAgICAgICAgdGhpcy5wcm9jLnN0ZGluLndyaXRlKGAke2FyZ3MyLmpvaW4oJyAnKS5yZXBsYWNlKC8oPzpcXHI/XFxufFxccikvZywgJyAnKX0ke0VPTH1gKVxuICAgICAgICBpZiAoZGF0YSkge1xuICAgICAgICAgIGRlYnVnKCdXcml0aW5nIGRhdGEgdG8gc3RkaW4uLi4nKVxuICAgICAgICAgIHRoaXMucHJvYy5zdGRpbi53cml0ZShgJHtkYXRhfSR7RU9UfWApXG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIGF3YWl0IFByb21pc2UucmFjZShbcmVhZE91dHB1dCgpLCBleGl0RXZlbnQoKSwgdGltZW91dEV2ZW50KCldKVxuICAgICAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICAgICAgLy8gdHNsaW50OmRpc2FibGUtbmV4dC1saW5lOm5vLXVuc2FmZS1hbnlcbiAgICAgICAgaWYgKGVycm9yLm5hbWUgPT09ICdJbnRlcmFjdGl2ZUFjdGlvblRpbWVvdXQnKSB7XG4gICAgICAgICAgdGhpcy5wcm9jLmtpbGwoKVxuICAgICAgICB9XG4gICAgICAgIHRocm93IGVycm9yXG4gICAgICB9IGZpbmFsbHkge1xuICAgICAgICBkZWJ1ZyhgRW5kZWQgaW50ZXJhY3RpdmUgYWN0aW9uIGJsb2NrIGluICR7dGhpcy5jd2R9YClcbiAgICAgICAgZW5kZWQgPSB0cnVlXG4gICAgICAgIHRoaXMucHJvYy5zdGRvdXQucmVzdW1lKClcbiAgICAgICAgdGhpcy5wcm9jLnN0ZGVyci5yZXN1bWUoKVxuICAgICAgfVxuICAgIH0pXG4gIH1cblxuICBwcml2YXRlIHJlc2V0VGltZXIoKSB7XG4gICAgaWYgKHRoaXMudGltZXIpIHtcbiAgICAgIGNsZWFyVGltZW91dCh0aGlzLnRpbWVyKVxuICAgIH1cbiAgICBjb25zdCB0bWwgPSBhdG9tLmNvbmZpZy5nZXQoJ2hhc2tlbGwtZ2hjLW1vZC5pbnRlcmFjdGl2ZUluYWN0aXZpdHlUaW1lb3V0JylcbiAgICBpZiAodG1sKSB7XG4gICAgICAvLyB0c2xpbnQ6ZGlzYWJsZS1uZXh0LWxpbmU6IG5vLWZsb2F0aW5nLXByb21pc2VzXG4gICAgICB0aGlzLnRpbWVyID0gd2luZG93LnNldFRpbWVvdXQoKCkgPT4geyB0aGlzLmtpbGwoKSB9LCB0bWwgKiA2MCAqIDEwMDApXG4gICAgfVxuICB9XG5cbiAgcHJpdmF0ZSBhc3luYyB3YWl0UmVhZGFibGUoc3RyZWFtOiBOb2RlSlMuUmVhZGFibGVTdHJlYW0pIHtcbiAgICByZXR1cm4gbmV3IFByb21pc2UoKHJlc29sdmUpID0+IHN0cmVhbS5vbmNlKCdyZWFkYWJsZScsICgpID0+IHtcbiAgICAgIHJlc29sdmUoKVxuICAgIH0pKVxuICB9XG5cbiAgcHJpdmF0ZSBhc3luYyAqcmVhZGdlbihvdXQ6IE5vZGVKUy5SZWFkYWJsZVN0cmVhbSwgaXNFbmRlZDogKCkgPT4gYm9vbGVhbikge1xuICAgIGxldCBidWZmZXIgPSAnJ1xuICAgIHdoaWxlICghaXNFbmRlZCgpKSB7XG4gICAgICBjb25zdCByZWFkID0gb3V0LnJlYWQoKSBhcyAoc3RyaW5nIHwgbnVsbClcbiAgICAgIC8vIHRzbGludDpkaXNhYmxlLW5leHQtbGluZTogbm8tbnVsbC1rZXl3b3JkXG4gICAgICBpZiAocmVhZCAhPT0gbnVsbCkge1xuICAgICAgICBidWZmZXIgKz0gcmVhZFxuICAgICAgICBpZiAoYnVmZmVyLmluY2x1ZGVzKEVPTCkpIHtcbiAgICAgICAgICBjb25zdCBhcnIgPSBidWZmZXIuc3BsaXQoRU9MKVxuICAgICAgICAgIGJ1ZmZlciA9IGFyci5wb3AoKSB8fCAnJ1xuICAgICAgICAgIHlpZWxkKiBhcnJcbiAgICAgICAgfVxuICAgICAgfSBlbHNlIHtcbiAgICAgICAgYXdhaXQgdGhpcy53YWl0UmVhZGFibGUob3V0KVxuICAgICAgfVxuICAgIH1cbiAgICBpZiAoYnVmZmVyKSB7IG91dC51bnNoaWZ0KGJ1ZmZlcikgfVxuICB9XG59XG4iXX0=