"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const tslib_1 = require("tslib");
const atom_1 = require("atom");
const util_1 = require("../util");
const os_1 = require("os");
const CP = require("child_process");
const Queue = require("promise-queue");
const pidusage = require("pidusage");
if (!Symbol.asyncIterator) {
    Object.defineProperty(Symbol, 'asyncIterator', {
        value: Symbol.for('Symbol.asyncIterator'),
    });
}
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
            pidusage(this.proc.pid, (err, stat) => {
                if (err) {
                    util_1.warn(err);
                    return;
                }
                if (stat.memory >
                    atom.config.get('haskell-ghc-mod.maxMemMegs') * 1024 * 1024) {
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
                    var e_1, _a;
                    try {
                        for (var _b = tslib_1.__asyncValues(this.readgen(this.proc.stderr, isEnded)), _c; _c = await _b.next(), !_c.done;) {
                            const line = _c.value;
                            stderr.push(line);
                        }
                    }
                    catch (e_1_1) { e_1 = { error: e_1_1 }; }
                    finally {
                        try {
                            if (_c && !_c.done && (_a = _b.return)) await _a.call(_b);
                        }
                        finally { if (e_1) throw e_1.error; }
                    }
                });
                const readOutput = async () => {
                    var e_2, _a;
                    try {
                        for (var _b = tslib_1.__asyncValues(this.readgen(this.proc.stdout, isEnded)), _c; _c = await _b.next(), !_c.done;) {
                            const line = _c.value;
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
                            if (_c && !_c.done && (_a = _b.return)) await _a.call(_b);
                        }
                        finally { if (e_2) throw e_2.error; }
                    }
                    return { stdout, stderr };
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
                const args2 = this.caps.quoteArgs
                    ? ['ascii-escape', command].concat(args.map((x) => `\x02${x}\x03`))
                    : [command, ...args];
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
            this.timer = window.setTimeout(() => {
                this.kill();
            }, tml * 60 * 1000);
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaW50ZXJhY3RpdmUtcHJvY2Vzcy5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uLy4uL3NyYy9naGMtbW9kL2ludGVyYWN0aXZlLXByb2Nlc3MudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7O0FBQUEsK0JBQW1EO0FBQ25ELGtDQUFtRDtBQUNuRCwyQkFBd0I7QUFDeEIsb0NBQW1DO0FBQ25DLHVDQUF1QztBQUN2QyxxQ0FBcUM7QUFDckMsSUFBSSxDQUFDLE1BQU0sQ0FBQyxhQUFhLEVBQUU7SUFDekIsTUFBTSxDQUFDLGNBQWMsQ0FBQyxNQUFNLEVBQUUsZUFBZSxFQUFFO1FBQzdDLEtBQUssRUFBRSxNQUFNLENBQUMsR0FBRyxDQUFDLHNCQUFzQixDQUFDO0tBQzFDLENBQUMsQ0FBQTtDQUNIO0FBY0QsTUFBYSxrQkFBa0I7SUFhN0IsWUFDRSxJQUFZLEVBQ1osR0FBYSxFQUNiLE9BQXdCLEVBQ2hCLElBQWdCO1FBQWhCLFNBQUksR0FBSixJQUFJLENBQVk7UUFFeEIsSUFBSSxDQUFDLElBQUksR0FBRyxJQUFJLENBQUE7UUFDaEIsSUFBSSxDQUFDLFdBQVcsR0FBRyxJQUFJLDBCQUFtQixFQUFFLENBQUE7UUFDNUMsSUFBSSxDQUFDLE9BQU8sR0FBRyxJQUFJLGNBQU8sRUFBRSxDQUFBO1FBQzVCLElBQUksQ0FBQyxXQUFXLENBQUMsR0FBRyxDQUFDLElBQUksQ0FBQyxPQUFPLENBQUMsQ0FBQTtRQUNsQyxJQUFJLENBQUMsR0FBRyxHQUFHLE9BQU8sQ0FBQyxHQUFHLENBQUE7UUFDdEIsSUFBSSxDQUFDLFlBQVksR0FBRyxJQUFJLEtBQUssQ0FBQyxDQUFDLEVBQUUsR0FBRyxDQUFDLENBQUE7UUFFckMsWUFBSyxDQUNILHNDQUFzQyxPQUFPLENBQUMsR0FBRyxrQkFBa0IsRUFDbkUsT0FBTyxDQUNSLENBQUE7UUFDRCxJQUFJLENBQUMsSUFBSSxHQUFHLEVBQUUsQ0FBQyxLQUFLLENBQUMsSUFBSSxFQUFFLEdBQUcsRUFBRSxPQUFP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c2FibGUgfSBmcm9tICdhdG9tJ1xuaW1wb3J0IHsgZGVidWcsIHdhcm4sIG1rRXJyb3IsIEVPVCB9IGZyb20gJy4uL3V0aWwnXG5pbXBvcnQgeyBFT0wgfSBmcm9tICdvcydcbmltcG9ydCAqIGFzIENQIGZyb20gJ2NoaWxkX3Byb2Nlc3MnXG5pbXBvcnQgUXVldWUgPSByZXF1aXJlKCdwcm9taXNlLXF1ZXVlJylcbmltcG9ydCBwaWR1c2FnZSA9IHJlcXVpcmUoJ3BpZHVzYWdlJylcbmlmICghU3ltYm9sLmFzeW5jSXRlcmF0b3IpIHtcbiAgT2JqZWN0LmRlZmluZVByb3BlcnR5KFN5bWJvbCwgJ2FzeW5jSXRlcmF0b3InLCB7XG4gICAgdmFsdWU6IFN5bWJvbC5mb3IoJ1N5bWJvbC5hc3luY0l0ZXJhdG9yJyksXG4gIH0pXG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgR0hDTW9kQ2FwcyB7XG4gIHZlcnNpb246IG51bWJlcltdXG4gIGZpbGVNYXA6IGJvb2xlYW5cbiAgcXVvdGVBcmdzOiBib29sZWFuXG4gIG9wdHBhcnNlOiBib29sZWFuXG4gIHR5cGVDb25zdHJhaW50czogYm9vbGVhblxuICBicm93c2VQYXJlbnRzOiBib29sZWFuXG4gIGludGVyYWN0aXZlQ2FzZVNwbGl0OiBib29sZWFuXG4gIGltcG9ydGVkRnJvbTogYm9vbGVhblxuICBicm93c2VNYWluOiBib29sZWFuXG59XG5cbmV4cG9ydCBjbGFzcyBJbnRlcmFjdGl2ZVByb2Nlc3Mge1xuICBwcml2YXRlIGRpc3Bvc2FibGVzOiBDb21wb3NpdGVEaXNwb3NhYmxlXG4gIHByaXZhdGUgZW1pdHRlcjogRW1pdHRlcjxcbiAgICB7fSxcbiAgICB7XG4gICAgICAnZGlkLWV4aXQnOiBudW1iZXJcbiAgICB9XG4gID5cbiAgcHJpdmF0ZSBwcm9jOiBDUC5DaGlsZFByb2Nlc3NcbiAgcHJpdmF0ZSBjd2Q6IHN0cmluZ1xuICBwcml2YXRlIHRpbWVyOiBudW1iZXIgfCB1bmRlZmluZWRcbiAgcHJpdmF0ZSByZXF1ZXN0UXVldWU6IFF1ZXVlXG5cbiAgY29uc3RydWN0b3IoXG4gICAgcGF0aDogc3RyaW5nLFxuICAgIGNtZDogc3RyaW5nW10sXG4gICAgb3B0aW9uczogeyBjd2Q6IHN0cmluZyB9LFxuICAgIHByaXZhdGUgY2FwczogR0hDTW9kQ2FwcyxcbiAgKSB7XG4gICAgdGhpcy5jYXBzID0gY2Fwc1xuICAgIHRoaXMuZGlzcG9zYWJsZXMgPSBuZXcgQ29tcG9zaXRlRGlzcG9zYWJsZSgpXG4gICAgdGhpcy5lbWl0dGVyID0gbmV3IEVtaXR0ZXIoKVxuICAgIHRoaXMuZGlzcG9zYWJsZXMuYWRkKHRoaXMuZW1pdHRlcilcbiAgICB0aGlzLmN3ZCA9IG9wdGlvbnMuY3dkXG4gICAgdGhpcy5yZXF1ZXN0UXVldWUgPSBuZXcgUXVldWUoMSwgMTAwKVxuXG4gICAgZGVidWcoXG4gICAgICBgU3Bhd25pbmcgbmV3IGdoYy1tb2RpIGluc3RhbmNlIGZvciAke29wdGlvbnMuY3dkfSB3aXRoIG9wdGlvbnMgPSBgLFxuICAgICAgb3B0aW9ucyxcbiAgICApXG4gICAgdGhpcy5wcm9jID0gQ1Auc3Bhd24ocGF0aCwgY21kLCBvcHRpb25zKVxuICAgIHRoaXMucHJvYy5zdGRvdXQuc2V0RW5jb2RpbmcoJ3V0Zi04JylcbiAgICB0aGlzLnByb2Muc3RkZXJyLnNldEVuY29kaW5nKCd1dGYtOCcpXG4gICAgdGhpcy5wcm9jLnNldE1heExpc3RlbmVycygxMDApXG4gICAgdGhpcy5wcm9jLnN0ZG91dC5zZXRNYXhMaXN0ZW5lcnMoMTAwKVxuICAgIHRoaXMucHJvYy5zdGRlcnIuc2V0TWF4TGlzdGVuZXJzKDEwMClcbiAgICB0aGlzLnJlc2V0VGltZXIoKVxuICAgIHRoaXMucHJvYy5vbmNlKCdleGl0JywgKGNvZGUpID0+IHtcbiAgICAgIHRoaXMudGltZXIgJiYgd2luZG93LmNsZWFyVGltZW91dCh0aGlzLnRpbWVyKVxuICAgICAgZGVidWcoYGdoYy1tb2RpIGZvciAke29wdGlvbnMuY3dkfSBlbmRlZCB3aXRoICR7Y29kZX1gKVxuICAgICAgdGhpcy5lbWl0dGVyLmVtaXQoJ2RpZC1leGl0JywgY29kZSlcbiAgICAgIHRoaXMuZGlzcG9zYWJsZXMuZGlzcG9zZSgpXG4gICAgfSlcbiAgfVxuXG4gIHB1YmxpYyBvbmNlRXhpdChhY3Rpb246IChjb2RlOiBudW1iZXIpID0+IHZvaWQpIHtcbiAgICByZXR1cm4gdGhpcy5lbWl0dGVyLm9uY2UoJ2RpZC1leGl0JywgYWN0aW9uKVxuICB9XG5cbiAgcHVibGljIGFzeW5jIGtpbGwoKTogUHJvbWlzZTxudW1iZXI+IHtcbiAgICB0aGlzLnByb2Muc3RkaW4uZW5kKClcbiAgICB0aGlzLnByb2Mua2lsbCgpXG4gICAgcmV0dXJuIG5ldyBQcm9taXNlPG51bWJlcj4oKHJlc29sdmUpID0+IHtcbiAgICAgIHRoaXMucHJvYy5vbmNlKCdleGl0JywgKGNvZGUpID0+IHJlc29sdmUoY29kZSkpXG4gICAgfSlcbiAgfVxuXG4gIHB1YmxpYyBhc3luYyBpbnRlcmFjdChcbiAgICBjb21tYW5kOiBzdHJpbmcsXG4gICAgYXJnczogc3RyaW5nW10sXG4gICAgZGF0YT86IHN0cmluZyxcbiAgKTogUHJvbWlzZTx7IHN0ZG91dDogc3RyaW5nW107IHN0ZGVycjogc3RyaW5nW10gfT4ge1xuICAgIHJldHVybiB0aGlzLnJlcXVlc3RRdWV1ZS5hZGQoYXN5bmMgKCkgPT4ge1xuICAgICAgdGhpcy5wcm9jLnN0ZG91dC5wYXVzZSgpXG4gICAgICB0aGlzLnByb2Muc3RkZXJyLnBhdXNlKClcblxuICAgICAgcGlkdXNhZ2UodGhpcy5wcm9jLnBpZCwgKGVyciwgc3RhdCkgPT4ge1xuICAgICAgICBpZiAoZXJyKSB7XG4gICAgICAgICAgd2FybihlcnIpXG4gICAgICAgICAgcmV0dXJuXG4gICAgICAgIH1cbiAgICAgICAgaWYgKFxuICAgICAgICAgIHN0YXQubWVtb3J5ID5cbiAgICAgICAgICBhdG9tLmNvbmZpZy5nZXQoJ2hhc2tlbGwtZ2hjLW1vZC5tYXhNZW1NZWdzJykgKiAxMDI0ICogMTAyNFxuICAgICAgICApIHtcbiAgICAgICAgICB0aGlzLnByb2Mua2lsbCgpXG4gICAgICAgIH1cbiAgICAgIH0pXG5cbiAgICAgIGRlYnVnKGBTdGFydGVkIGludGVyYWN0aXZlIGFjdGlvbiBibG9jayBpbiAke3RoaXMuY3dkfWApXG4gICAgICBkZWJ1ZyhcbiAgICAgICAgYFJ1bm5pbmcgaW50ZXJhY3RpdmUgY29tbWFuZCAke2NvbW1hbmR9ICR7YXJnc30gJHtcbiAgICAgICAgICBkYXRhID8gJ3dpdGgnIDogJ3dpdGhvdXQnXG4gICAgICAgIH0gYWRkaXRpb25hbCBkYXRhYCxcbiAgICAgIClcbiAgICAgIGxldCBlbmRlZCA9IGZhbHNlXG4gICAgICB0cnkge1xuICAgICAgICBjb25zdCBpc0VuZGVkID0gKCkgPT4gZW5kZWRcbiAgICAgICAgY29uc3Qgc3RkZXJyOiBzdHJpbmdbXSA9IFtdXG4gICAgICAgIGNvbnN0IHN0ZG91dDogc3RyaW5nW10gPSBbXVxuICAgICAgICBzZXRJbW1lZGlhdGUoYXN5bmMgKCkgPT4ge1xuICAgICAgICAgIGZvciBhd2FpdCAoY29uc3QgbGluZSBvZiB0aGlzLnJlYWRnZW4odGhpcy5wcm9jLnN0ZGVyciwgaXNFbmRlZCkpIHtcbiAgICAgICAgICAgIHN0ZGVyci5wdXNoKGxpbmUpXG4gICAgICAgICAgfVxuICAgICAgICB9KVxuICAgICAgICBjb25zdCByZWFkT3V0cHV0ID0gYXN5bmMgKCkgPT4ge1xuICAgICAgICAgIGZvciBhd2FpdCAoY29uc3QgbGluZSBvZiB0aGlzLnJlYWRnZW4odGhpcy5wcm9jLnN0ZG91dCwgaXNFbmRlZCkpIHtcbiAgICAgICAgICAgIGRlYnVnKGBHb3QgcmVzcG9uc2UgZnJvbSBnaGMtbW9kaTogJHtsaW5lfWApXG4gICAgICAgICAgICBpZiAobGluZSA9PT0gJ09LJykge1xuICAgICAgICAgICAgICBlbmRlZCA9IHRydWVcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgIHN0ZG91dC5wdXNoKGxpbmUpXG4gICAgICAgICAgICB9XG4gICAgICAgICAgfVxuICAgICAgICAgIHJldHVybiB7IHN0ZG91dCwgc3RkZXJyIH1cbiAgICAgICAgfVxuICAgICAgICBjb25zdCBleGl0RXZlbnQgPSBhc3luYyAoKSA9PlxuICAgICAgICAgIG5ldyBQcm9taXNlPG5ldmVyPigoX3Jlc29sdmUsIHJlamVjdCkgPT4ge1xuICAgICAgICAgICAgdGhpcy5wcm9jLm9uY2UoJ2V4aXQnLCAoKSA9PiB7XG4gICAgICAgICAgICAgIHdhcm4oc3Rkb3V0LmpvaW4oJ1xcbicpKVxuICAgICAgICAgICAgICByZWplY3QoXG4gICAgICAgICAgICAgICAgbWtFcnJvcignR0hDTW9kSW50ZXJhY3RpdmVDcmFzaCcsIGAke3N0ZG91dH1cXG5cXG4ke3N0ZGVycn1gKSxcbiAgICAgICAgICAgICAgKVxuICAgICAgICAgICAgfSlcbiAgICAgICAgICB9KVxuICAgICAgICBjb25zdCB0aW1lb3V0RXZlbnQgPSBhc3luYyAoKSA9PlxuICAgICAgICAgIG5ldyBQcm9taXNlPG5ldmVyPigoX3Jlc29sdmUsIHJlamVjdCkgPT4ge1xuICAgICAgICAgICAgY29uc3QgdG1sOiBudW1iZXIgPSBhdG9tLmNvbmZpZy5nZXQoXG4gICAgICAgICAgICAgICdoYXNrZWxsLWdoYy1tb2QuaW50ZXJhY3RpdmVBY3Rpb25UaW1lb3V0JyxcbiAgICAgICAgICAgIClcbiAgICAgICAgICAgIGlmICh0bWwpIHtcbiAgICAgICAgICAgICAgc2V0VGltZW91dCgoKSA9PiB7XG4gICAgICAgICAgICAgICAgcmVqZWN0KFxuICAgICAgICAgICAgICAgICAgbWtFcnJvcignSW50ZXJhY3RpdmVBY3Rpb25UaW1lb3V0JywgYCR7c3Rkb3V0fVxcblxcbiR7c3RkZXJyfWApLFxuICAgICAgICAgICAgICAgIClcbiAgICAgICAgICAgICAgfSwgdG1sICogMTAwMClcbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9KVxuXG4gICAgICAgIGNvbnN0IGFyZ3MyID0gdGhpcy5jYXBzLnF1b3RlQXJnc1xuICAgICAgICAgID8gWydhc2NpaS1lc2NhcGUnLCBjb21tYW5kXS5jb25jYXQoYXJncy5tYXAoKHgpID0+IGBcXHgwMiR7eH1cXHgwM2ApKVxuICAgICAgICAgIDogW2NvbW1hbmQsIC4uLmFyZ3NdXG4gICAgICAgIGRlYnVnKGBSdW5uaW5nIGdoYy1tb2RpIGNvbW1hbmQgJHtjb21tYW5kfWAsIC4uLmFyZ3MpXG4gICAgICAgIHRoaXMucHJvYy5zdGRpbi53cml0ZShcbiAgICAgICAgICBgJHthcmdzMi5qb2luKCcgJykucmVwbGFjZSgvKD86XFxyP1xcbnxcXHIpL2csICcgJyl9JHtFT0x9YCxcbiAgICAgICAgKVxuICAgICAgICBpZiAoZGF0YSkge1xuICAgICAgICAgIGRlYnVnKCdXcml0aW5nIGRhdGEgdG8gc3RkaW4uLi4nKVxuICAgICAgICAgIHRoaXMucHJvYy5zdGRpbi53cml0ZShgJHtkYXRhfSR7RU9UfWApXG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIGF3YWl0IFByb21pc2UucmFjZShbcmVhZE91dHB1dCgpLCBleGl0RXZlbnQoKSwgdGltZW91dEV2ZW50KCldKVxuICAgICAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICAgICAgaWYgKGVycm9yLm5hbWUgPT09ICdJbnRlcmFjdGl2ZUFjdGlvblRpbWVvdXQnKSB7XG4gICAgICAgICAgdGhpcy5wcm9jLmtpbGwoKVxuICAgICAgICB9XG4gICAgICAgIHRocm93IGVycm9yXG4gICAgICB9IGZpbmFsbHkge1xuICAgICAgICBkZWJ1ZyhgRW5kZWQgaW50ZXJhY3RpdmUgYWN0aW9uIGJsb2NrIGluICR7dGhpcy5jd2R9YClcbiAgICAgICAgZW5kZWQgPSB0cnVlXG4gICAgICAgIHRoaXMucHJvYy5zdGRvdXQucmVzdW1lKClcbiAgICAgICAgdGhpcy5wcm9jLnN0ZGVyci5yZXN1bWUoKVxuICAgICAgfVxuICAgIH0pXG4gIH1cblxuICBwcml2YXRlIHJlc2V0VGltZXIoKSB7XG4gICAgaWYgKHRoaXMudGltZXIpIHtcbiAgICAgIGNsZWFyVGltZW91dCh0aGlzLnRpbWVyKVxuICAgIH1cbiAgICBjb25zdCB0bWwgPSBhdG9tLmNvbmZpZy5nZXQoJ2hhc2tlbGwtZ2hjLW1vZC5pbnRlcmFjdGl2ZUluYWN0aXZpdHlUaW1lb3V0JylcbiAgICBpZiAodG1sKSB7XG4gICAgICB0aGlzLnRpbWVyID0gd2luZG93LnNldFRpbWVvdXQoKCkgPT4ge1xuICAgICAgICAvLyB0c2xpbnQ6ZGlzYWJsZS1uZXh0LWxpbmU6IG5vLWZsb2F0aW5nLXByb21pc2VzXG4gICAgICAgIHRoaXMua2lsbCgpXG4gICAgICB9LCB0bWwgKiA2MCAqIDEwMDApXG4gICAgfVxuICB9XG5cbiAgcHJpdmF0ZSBhc3luYyB3YWl0UmVhZGFibGUoc3RyZWFtOiBOb2RlSlMuUmVhZGFibGVTdHJlYW0pIHtcbiAgICByZXR1cm4gbmV3IFByb21pc2UoKHJlc29sdmUpID0+XG4gICAgICBzdHJlYW0ub25jZSgncmVhZGFibGUnLCAoKSA9PiB7XG4gICAgICAgIHJlc29sdmUoKVxuICAgICAgfSksXG4gICAgKVxuICB9XG5cbiAgcHJpdmF0ZSBhc3luYyAqcmVhZGdlbihvdXQ6IE5vZGVKUy5SZWFkYWJsZVN0cmVhbSwgaXNFbmRlZDogKCkgPT4gYm9vbGVhbikge1xuICAgIGxldCBidWZmZXIgPSAnJ1xuICAgIHdoaWxlICghaXNFbmRlZCgpKSB7XG4gICAgICBjb25zdCByZWFkID0gb3V0LnJlYWQoKSBhcyBzdHJpbmcgfCBudWxsXG4gICAgICAvLyB0c2xpbnQ6ZGlzYWJsZS1uZXh0LWxpbmU6IG5vLW51bGwta2V5d29yZFxuICAgICAgaWYgKHJlYWQgIT09IG51bGwpIHtcbiAgICAgICAgYnVmZmVyICs9IHJlYWRcbiAgICAgICAgaWYgKGJ1ZmZlci5pbmNsdWRlcyhFT0wpKSB7XG4gICAgICAgICAgY29uc3QgYXJyID0gYnVmZmVyLnNwbGl0KEVPTClcbiAgICAgICAgICBidWZmZXIgPSBhcnIucG9wKCkgfHwgJydcbiAgICAgICAgICB5aWVsZCogYXJyXG4gICAgICAgIH1cbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIGF3YWl0IHRoaXMud2FpdFJlYWRhYmxlKG91dClcbiAgICAgIH1cbiAgICB9XG4gICAgaWYgKGJ1ZmZlcikge1xuICAgICAgb3V0LnVuc2hpZnQoYnVmZmVyKVxuICAgIH1cbiAgfVxufVxuIl19