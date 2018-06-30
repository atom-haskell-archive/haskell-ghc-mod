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
            pidusage.stat(this.proc.pid, (err, stat) => {
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaW50ZXJhY3RpdmUtcHJvY2Vzcy5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uLy4uL3NyYy9naGMtbW9kL2ludGVyYWN0aXZlLXByb2Nlc3MudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7O0FBQUEsK0JBQW1EO0FBQ25ELGtDQUFtRDtBQUNuRCwyQkFBd0I7QUFDeEIsb0NBQW1DO0FBQ25DLHVDQUF1QztBQUN2QyxxQ0FBcUM7QUFDckMsRUFBRSxDQUFDLENBQUMsQ0FBQyxNQUFNLENBQUMsYUFBYSxDQUFDLENBQUMsQ0FBQztJQUMxQixNQUFNLENBQUMsY0FBYyxDQUFDLE1BQU0sRUFBRSxlQUFlLEVBQUU7UUFDN0MsS0FBSyxFQUFFLE1BQU0sQ0FBQyxHQUFHLENBQUMsc0JBQXNCLENBQUM7S0FDMUMsQ0FBQyxDQUFBO0FBQ0osQ0FBQztBQWNEO0lBYUUsWUFDRSxJQUFZLEVBQ1osR0FBYSxFQUNiLE9BQXdCLEVBQ2hCLElBQWdCO1FBQWhCLFNBQUksR0FBSixJQUFJLENBQVk7UUFFeEIsSUFBSSxDQUFDLElBQUksR0FBRyxJQUFJLENBQUE7UUFDaEIsSUFBSSxDQUFDLFdBQVcsR0FBRyxJQUFJLDBCQUFtQixFQUFFLENBQUE7UUFDNUMsSUFBSSxDQUFDLE9BQU8sR0FBRyxJQUFJLGNBQU8sRUFBRSxDQUFBO1FBQzVCLElBQUksQ0FBQyxXQUFXLENBQUMsR0FBRyxDQUFDLElBQUksQ0FBQyxPQUFPLENBQUMsQ0FBQTtRQUNsQyxJQUFJLENBQUMsR0FBRyxHQUFHLE9BQU8sQ0FBQyxHQUFHLENBQUE7UUFDdEIsSUFBSSxDQUFDLFlBQVksR0FBRyxJQUFJLEtBQUssQ0FBQyxDQUFDLEVBQUUsR0FBRyxDQUFDLENBQUE7UUFFckMsWUFBSyxDQUNILHNDQUFzQyxPQUFPLENBQUMsR0FBRyxrQkFBa0IsRUFDbkUsT0FBTyxDQUNSLENBQUE7UUFDRCxJQUFJLENBQUMsSUFBSSxHQUFHLEVBQUUsQ0FBQyxLQUFLLENBQUMsSUFBSSxFQUFFLEdB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QUFHLE1BQU0sQ0FBQyxLQUFLLENBQUMsUUFBRyxDQUFDLENBQUE7d0JBQzdCLE1BQU0sR0FBRyxHQUFHLENBQUMsR0FBRyxFQUFFLElBQUksRUFBRSxDQUFBO3dCQUN4QixzQkFBQSxLQUFLLENBQUMsQ0FBQyx5QkFBQSxzQkFBQSxHQUFHLENBQUEsQ0FBQSxDQUFBLENBQUE7b0JBQ1osQ0FBQztnQkFDSCxDQUFDO2dCQUFDLElBQUksQ0FBQyxDQUFDO29CQUNOLHNCQUFNLElBQUksQ0FBQyxZQUFZLENBQUMsR0FBRyxDQUFDLENBQUEsQ0FBQTtnQkFDOUIsQ0FBQztZQUNILENBQUM7WUFDRCxFQUFFLENBQUMsQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDO2dCQUNYLEdBQUcsQ0FBQyxPQUFPLENBQUMsTUFBTSxDQUFDLENBQUE7WUFDckIsQ0FBQztRQUNILENBQUM7S0FBQTtDQUNGO0FBcE1ELGdEQW9NQyIsInNvdXJjZXNDb250ZW50IjpbImltcG9ydCB7IEVtaXR0ZXIsIENvbXBvc2l0ZURpc3Bvc2FibGUgfSBmcm9tICdhdG9tJ1xuaW1wb3J0IHsgZGVidWcsIHdhcm4sIG1rRXJyb3IsIEVPVCB9IGZyb20gJy4uL3V0aWwnXG5pbXBvcnQgeyBFT0wgfSBmcm9tICdvcydcbmltcG9ydCAqIGFzIENQIGZyb20gJ2NoaWxkX3Byb2Nlc3MnXG5pbXBvcnQgUXVldWUgPSByZXF1aXJlKCdwcm9taXNlLXF1ZXVlJylcbmltcG9ydCBwaWR1c2FnZSA9IHJlcXVpcmUoJ3BpZHVzYWdlJylcbmlmICghU3ltYm9sLmFzeW5jSXRlcmF0b3IpIHtcbiAgT2JqZWN0LmRlZmluZVByb3BlcnR5KFN5bWJvbCwgJ2FzeW5jSXRlcmF0b3InLCB7XG4gICAgdmFsdWU6IFN5bWJvbC5mb3IoJ1N5bWJvbC5hc3luY0l0ZXJhdG9yJyksXG4gIH0pXG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgR0hDTW9kQ2FwcyB7XG4gIHZlcnNpb246IG51bWJlcltdXG4gIGZpbGVNYXA6IGJvb2xlYW5cbiAgcXVvdGVBcmdzOiBib29sZWFuXG4gIG9wdHBhcnNlOiBib29sZWFuXG4gIHR5cGVDb25zdHJhaW50czogYm9vbGVhblxuICBicm93c2VQYXJlbnRzOiBib29sZWFuXG4gIGludGVyYWN0aXZlQ2FzZVNwbGl0OiBib29sZWFuXG4gIGltcG9ydGVkRnJvbTogYm9vbGVhblxuICBicm93c2VNYWluOiBib29sZWFuXG59XG5cbmV4cG9ydCBjbGFzcyBJbnRlcmFjdGl2ZVByb2Nlc3Mge1xuICBwcml2YXRlIGRpc3Bvc2FibGVzOiBDb21wb3NpdGVEaXNwb3NhYmxlXG4gIHByaXZhdGUgZW1pdHRlcjogRW1pdHRlcjxcbiAgICB7fSxcbiAgICB7XG4gICAgICAnZGlkLWV4aXQnOiBudW1iZXJcbiAgICB9XG4gID5cbiAgcHJpdmF0ZSBwcm9jOiBDUC5DaGlsZFByb2Nlc3NcbiAgcHJpdmF0ZSBjd2Q6IHN0cmluZ1xuICBwcml2YXRlIHRpbWVyOiBudW1iZXIgfCB1bmRlZmluZWRcbiAgcHJpdmF0ZSByZXF1ZXN0UXVldWU6IFF1ZXVlXG5cbiAgY29uc3RydWN0b3IoXG4gICAgcGF0aDogc3RyaW5nLFxuICAgIGNtZDogc3RyaW5nW10sXG4gICAgb3B0aW9uczogeyBjd2Q6IHN0cmluZyB9LFxuICAgIHByaXZhdGUgY2FwczogR0hDTW9kQ2FwcyxcbiAgKSB7XG4gICAgdGhpcy5jYXBzID0gY2Fwc1xuICAgIHRoaXMuZGlzcG9zYWJsZXMgPSBuZXcgQ29tcG9zaXRlRGlzcG9zYWJsZSgpXG4gICAgdGhpcy5lbWl0dGVyID0gbmV3IEVtaXR0ZXIoKVxuICAgIHRoaXMuZGlzcG9zYWJsZXMuYWRkKHRoaXMuZW1pdHRlcilcbiAgICB0aGlzLmN3ZCA9IG9wdGlvbnMuY3dkXG4gICAgdGhpcy5yZXF1ZXN0UXVldWUgPSBuZXcgUXVldWUoMSwgMTAwKVxuXG4gICAgZGVidWcoXG4gICAgICBgU3Bhd25pbmcgbmV3IGdoYy1tb2RpIGluc3RhbmNlIGZvciAke29wdGlvbnMuY3dkfSB3aXRoIG9wdGlvbnMgPSBgLFxuICAgICAgb3B0aW9ucyxcbiAgICApXG4gICAgdGhpcy5wcm9jID0gQ1Auc3Bhd24ocGF0aCwgY21kLCBvcHRpb25zKVxuICAgIHRoaXMucHJvYy5zdGRvdXQuc2V0RW5jb2RpbmcoJ3V0Zi04JylcbiAgICB0aGlzLnByb2Muc3RkZXJyLnNldEVuY29kaW5nKCd1dGYtOCcpXG4gICAgdGhpcy5wcm9jLnNldE1heExpc3RlbmVycygxMDApXG4gICAgdGhpcy5wcm9jLnN0ZG91dC5zZXRNYXhMaXN0ZW5lcnMoMTAwKVxuICAgIHRoaXMucHJvYy5zdGRlcnIuc2V0TWF4TGlzdGVuZXJzKDEwMClcbiAgICB0aGlzLnJlc2V0VGltZXIoKVxuICAgIHRoaXMucHJvYy5vbmNlKCdleGl0JywgKGNvZGUpID0+IHtcbiAgICAgIHRoaXMudGltZXIgJiYgd2luZG93LmNsZWFyVGltZW91dCh0aGlzLnRpbWVyKVxuICAgICAgZGVidWcoYGdoYy1tb2RpIGZvciAke29wdGlvbnMuY3dkfSBlbmRlZCB3aXRoICR7Y29kZX1gKVxuICAgICAgdGhpcy5lbWl0dGVyLmVtaXQoJ2RpZC1leGl0JywgY29kZSlcbiAgICAgIHRoaXMuZGlzcG9zYWJsZXMuZGlzcG9zZSgpXG4gICAgfSlcbiAgfVxuXG4gIHB1YmxpYyBvbmNlRXhpdChhY3Rpb246IChjb2RlOiBudW1iZXIpID0+IHZvaWQpIHtcbiAgICByZXR1cm4gdGhpcy5lbWl0dGVyLm9uY2UoJ2RpZC1leGl0JywgYWN0aW9uKVxuICB9XG5cbiAgcHVibGljIGFzeW5jIGtpbGwoKTogUHJvbWlzZTxudW1iZXI+IHtcbiAgICB0aGlzLnByb2Muc3RkaW4uZW5kKClcbiAgICB0aGlzLnByb2Mua2lsbCgpXG4gICAgcmV0dXJuIG5ldyBQcm9taXNlPG51bWJlcj4oKHJlc29sdmUpID0+IHtcbiAgICAgIHRoaXMucHJvYy5vbmNlKCdleGl0JywgKGNvZGUpID0+IHJlc29sdmUoY29kZSkpXG4gICAgfSlcbiAgfVxuXG4gIHB1YmxpYyBhc3luYyBpbnRlcmFjdChcbiAgICBjb21tYW5kOiBzdHJpbmcsXG4gICAgYXJnczogc3RyaW5nW10sXG4gICAgZGF0YT86IHN0cmluZyxcbiAgKTogUHJvbWlzZTx7IHN0ZG91dDogc3RyaW5nW107IHN0ZGVycjogc3RyaW5nW10gfT4ge1xuICAgIHJldHVybiB0aGlzLnJlcXVlc3RRdWV1ZS5hZGQoYXN5bmMgKCkgPT4ge1xuICAgICAgdGhpcy5wcm9jLnN0ZG91dC5wYXVzZSgpXG4gICAgICB0aGlzLnByb2Muc3RkZXJyLnBhdXNlKClcblxuICAgICAgcGlkdXNhZ2Uuc3RhdCh0aGlzLnByb2MucGlkLCAoZXJyLCBzdGF0KSA9PiB7XG4gICAgICAgIGlmIChlcnIpIHtcbiAgICAgICAgICB3YXJuKGVycilcbiAgICAgICAgICByZXR1cm5cbiAgICAgICAgfVxuICAgICAgICBpZiAoXG4gICAgICAgICAgc3RhdC5tZW1vcnkgPlxuICAgICAgICAgIGF0b20uY29uZmlnLmdldCgnaGFza2VsbC1naGMtbW9kLm1heE1lbU1lZ3MnKSAqIDEwMjQgKiAxMDI0XG4gICAgICAgICkge1xuICAgICAgICAgIHRoaXMucHJvYy5raWxsKClcbiAgICAgICAgfVxuICAgICAgfSlcblxuICAgICAgZGVidWcoYFN0YXJ0ZWQgaW50ZXJhY3RpdmUgYWN0aW9uIGJsb2NrIGluICR7dGhpcy5jd2R9YClcbiAgICAgIGRlYnVnKFxuICAgICAgICBgUnVubmluZyBpbnRlcmFjdGl2ZSBjb21tYW5kICR7Y29tbWFuZH0gJHthcmdzfSAke1xuICAgICAgICAgIGRhdGEgPyAnd2l0aCcgOiAnd2l0aG91dCdcbiAgICAgICAgfSBhZGRpdGlvbmFsIGRhdGFgLFxuICAgICAgKVxuICAgICAgbGV0IGVuZGVkID0gZmFsc2VcbiAgICAgIHRyeSB7XG4gICAgICAgIGNvbnN0IGlzRW5kZWQgPSAoKSA9PiBlbmRlZFxuICAgICAgICBjb25zdCBzdGRlcnI6IHN0cmluZ1tdID0gW11cbiAgICAgICAgY29uc3Qgc3Rkb3V0OiBzdHJpbmdbXSA9IFtdXG4gICAgICAgIHNldEltbWVkaWF0ZShhc3luYyAoKSA9PiB7XG4gICAgICAgICAgZm9yIGF3YWl0IChjb25zdCBsaW5lIG9mIHRoaXMucmVhZGdlbih0aGlzLnByb2Muc3RkZXJyLCBpc0VuZGVkKSkge1xuICAgICAgICAgICAgc3RkZXJyLnB1c2gobGluZSlcbiAgICAgICAgICB9XG4gICAgICAgIH0pXG4gICAgICAgIGNvbnN0IHJlYWRPdXRwdXQgPSBhc3luYyAoKSA9PiB7XG4gICAgICAgICAgZm9yIGF3YWl0IChjb25zdCBsaW5lIG9mIHRoaXMucmVhZGdlbih0aGlzLnByb2Muc3Rkb3V0LCBpc0VuZGVkKSkge1xuICAgICAgICAgICAgZGVidWcoYEdvdCByZXNwb25zZSBmcm9tIGdoYy1tb2RpOiAke2xpbmV9YClcbiAgICAgICAgICAgIGlmIChsaW5lID09PSAnT0snKSB7XG4gICAgICAgICAgICAgIGVuZGVkID0gdHJ1ZVxuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgc3Rkb3V0LnB1c2gobGluZSlcbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9XG4gICAgICAgICAgcmV0dXJuIHsgc3Rkb3V0LCBzdGRlcnIgfVxuICAgICAgICB9XG4gICAgICAgIGNvbnN0IGV4aXRFdmVudCA9IGFzeW5jICgpID0+XG4gICAgICAgICAgbmV3IFByb21pc2U8bmV2ZXI+KChfcmVzb2x2ZSwgcmVqZWN0KSA9PiB7XG4gICAgICAgICAgICB0aGlzLnByb2Mub25jZSgnZXhpdCcsICgpID0+IHtcbiAgICAgICAgICAgICAgd2FybihzdGRvdXQuam9pbignXFxuJykpXG4gICAgICAgICAgICAgIHJlamVjdChcbiAgICAgICAgICAgICAgICBta0Vycm9yKCdHSENNb2RJbnRlcmFjdGl2ZUNyYXNoJywgYCR7c3Rkb3V0fVxcblxcbiR7c3RkZXJyfWApLFxuICAgICAgICAgICAgICApXG4gICAgICAgICAgICB9KVxuICAgICAgICAgIH0pXG4gICAgICAgIGNvbnN0IHRpbWVvdXRFdmVudCA9IGFzeW5jICgpID0+XG4gICAgICAgICAgbmV3IFByb21pc2U8bmV2ZXI+KChfcmVzb2x2ZSwgcmVqZWN0KSA9PiB7XG4gICAgICAgICAgICBjb25zdCB0bWw6IG51bWJlciA9IGF0b20uY29uZmlnLmdldChcbiAgICAgICAgICAgICAgJ2hhc2tlbGwtZ2hjLW1vZC5pbnRlcmFjdGl2ZUFjdGlvblRpbWVvdXQnLFxuICAgICAgICAgICAgKVxuICAgICAgICAgICAgaWYgKHRtbCkge1xuICAgICAgICAgICAgICBzZXRUaW1lb3V0KCgpID0+IHtcbiAgICAgICAgICAgICAgICByZWplY3QoXG4gICAgICAgICAgICAgICAgICBta0Vycm9yKCdJbnRlcmFjdGl2ZUFjdGlvblRpbWVvdXQnLCBgJHtzdGRvdXR9XFxuXFxuJHtzdGRlcnJ9YCksXG4gICAgICAgICAgICAgICAgKVxuICAgICAgICAgICAgICB9LCB0bWwgKiAxMDAwKVxuICAgICAgICAgICAgfVxuICAgICAgICAgIH0pXG5cbiAgICAgICAgY29uc3QgYXJnczIgPSB0aGlzLmNhcHMucXVvdGVBcmdzXG4gICAgICAgICAgPyBbJ2FzY2lpLWVzY2FwZScsIGNvbW1hbmRdLmNvbmNhdChhcmdzLm1hcCgoeCkgPT4gYFxceDAyJHt4fVxceDAzYCkpXG4gICAgICAgICAgOiBbY29tbWFuZCwgLi4uYXJnc11cbiAgICAgICAgZGVidWcoYFJ1bm5pbmcgZ2hjLW1vZGkgY29tbWFuZCAke2NvbW1hbmR9YCwgLi4uYXJncylcbiAgICAgICAgdGhpcy5wcm9jLnN0ZGluLndyaXRlKFxuICAgICAgICAgIGAke2FyZ3MyLmpvaW4oJyAnKS5yZXBsYWNlKC8oPzpcXHI/XFxufFxccikvZywgJyAnKX0ke0VPTH1gLFxuICAgICAgICApXG4gICAgICAgIGlmIChkYXRhKSB7XG4gICAgICAgICAgZGVidWcoJ1dyaXRpbmcgZGF0YSB0byBzdGRpbi4uLicpXG4gICAgICAgICAgdGhpcy5wcm9jLnN0ZGluLndyaXRlKGAke2RhdGF9JHtFT1R9YClcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gYXdhaXQgUHJvbWlzZS5yYWNlKFtyZWFkT3V0cHV0KCksIGV4aXRFdmVudCgpLCB0aW1lb3V0RXZlbnQoKV0pXG4gICAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgICBpZiAoZXJyb3IubmFtZSA9PT0gJ0ludGVyYWN0aXZlQWN0aW9uVGltZW91dCcpIHtcbiAgICAgICAgICB0aGlzLnByb2Mua2lsbCgpXG4gICAgICAgIH1cbiAgICAgICAgdGhyb3cgZXJyb3JcbiAgICAgIH0gZmluYWxseSB7XG4gICAgICAgIGRlYnVnKGBFbmRlZCBpbnRlcmFjdGl2ZSBhY3Rpb24gYmxvY2sgaW4gJHt0aGlzLmN3ZH1gKVxuICAgICAgICBlbmRlZCA9IHRydWVcbiAgICAgICAgdGhpcy5wcm9jLnN0ZG91dC5yZXN1bWUoKVxuICAgICAgICB0aGlzLnByb2Muc3RkZXJyLnJlc3VtZSgpXG4gICAgICB9XG4gICAgfSlcbiAgfVxuXG4gIHByaXZhdGUgcmVzZXRUaW1lcigpIHtcbiAgICBpZiAodGhpcy50aW1lcikge1xuICAgICAgY2xlYXJUaW1lb3V0KHRoaXMudGltZXIpXG4gICAgfVxuICAgIGNvbnN0IHRtbCA9IGF0b20uY29uZmlnLmdldCgnaGFza2VsbC1naGMtbW9kLmludGVyYWN0aXZlSW5hY3Rpdml0eVRpbWVvdXQnKVxuICAgIGlmICh0bWwpIHtcbiAgICAgIHRoaXMudGltZXIgPSB3aW5kb3cuc2V0VGltZW91dCgoKSA9PiB7XG4gICAgICAgIC8vIHRzbGludDpkaXNhYmxlLW5leHQtbGluZTogbm8tZmxvYXRpbmctcHJvbWlzZXNcbiAgICAgICAgdGhpcy5raWxsKClcbiAgICAgIH0sIHRtbCAqIDYwICogMTAwMClcbiAgICB9XG4gIH1cblxuICBwcml2YXRlIGFzeW5jIHdhaXRSZWFkYWJsZShzdHJlYW06IE5vZGVKUy5SZWFkYWJsZVN0cmVhbSkge1xuICAgIHJldHVybiBuZXcgUHJvbWlzZSgocmVzb2x2ZSkgPT5cbiAgICAgIHN0cmVhbS5vbmNlKCdyZWFkYWJsZScsICgpID0+IHtcbiAgICAgICAgcmVzb2x2ZSgpXG4gICAgICB9KSxcbiAgICApXG4gIH1cblxuICBwcml2YXRlIGFzeW5jICpyZWFkZ2VuKG91dDogTm9kZUpTLlJlYWRhYmxlU3RyZWFtLCBpc0VuZGVkOiAoKSA9PiBib29sZWFuKSB7XG4gICAgbGV0IGJ1ZmZlciA9ICcnXG4gICAgd2hpbGUgKCFpc0VuZGVkKCkpIHtcbiAgICAgIGNvbnN0IHJlYWQgPSBvdXQucmVhZCgpIGFzIHN0cmluZyB8IG51bGxcbiAgICAgIC8vIHRzbGludDpkaXNhYmxlLW5leHQtbGluZTogbm8tbnVsbC1rZXl3b3JkXG4gICAgICBpZiAocmVhZCAhPT0gbnVsbCkge1xuICAgICAgICBidWZmZXIgKz0gcmVhZFxuICAgICAgICBpZiAoYnVmZmVyLmluY2x1ZGVzKEVPTCkpIHtcbiAgICAgICAgICBjb25zdCBhcnIgPSBidWZmZXIuc3BsaXQoRU9MKVxuICAgICAgICAgIGJ1ZmZlciA9IGFyci5wb3AoKSB8fCAnJ1xuICAgICAgICAgIHlpZWxkKiBhcnJcbiAgICAgICAgfVxuICAgICAgfSBlbHNlIHtcbiAgICAgICAgYXdhaXQgdGhpcy53YWl0UmVhZGFibGUob3V0KVxuICAgICAgfVxuICAgIH1cbiAgICBpZiAoYnVmZmVyKSB7XG4gICAgICBvdXQudW5zaGlmdChidWZmZXIpXG4gICAgfVxuICB9XG59XG4iXX0=