"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : new P(function (resolve) { resolve(result.value); }).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __asyncValues = (this && this.__asyncIterator) || function (o) {
    if (!Symbol.asyncIterator) throw new TypeError("Symbol.asyncIterator is not defined.");
    var m = o[Symbol.asyncIterator];
    return m ? m.call(o) : typeof __values === "function" ? __values(o) : o[Symbol.iterator]();
};
var __await = (this && this.__await) || function (v) { return this instanceof __await ? (this.v = v, this) : new __await(v); }
var __asyncDelegator = (this && this.__asyncDelegator) || function (o) {
    var i, p;
    return i = {}, verb("next"), verb("throw", function (e) { throw e; }), verb("return"), i[Symbol.iterator] = function () { return this; }, i;
    function verb(n, f) { if (o[n]) i[n] = function (v) { return (p = !p) ? { value: __await(o[n](v)), done: n === "return" } : f ? f(v) : v; }; }
};
var __asyncGenerator = (this && this.__asyncGenerator) || function (thisArg, _arguments, generator) {
    if (!Symbol.asyncIterator) throw new TypeError("Symbol.asyncIterator is not defined.");
    var g = generator.apply(thisArg, _arguments || []), i, q = [];
    return i = {}, verb("next"), verb("throw"), verb("return"), i[Symbol.asyncIterator] = function () { return this; }, i;
    function verb(n) { if (g[n]) i[n] = function (v) { return new Promise(function (a, b) { q.push([n, v, a, b]) > 1 || resume(n, v); }); }; }
    function resume(n, v) { try { step(g[n](v)); } catch (e) { settle(q[0][3], e); } }
    function step(r) { r.value instanceof __await ? Promise.resolve(r.value.v).then(fulfill, reject) : settle(q[0][2], r);  }
    function fulfill(value) { resume("next", value); }
    function reject(value) { resume("throw", value); }
    function settle(f, v) { if (f(v), q.shift(), q.length) resume(q[0][0], q[0][1]); }
};
Object.defineProperty(exports, "__esModule", { value: true });
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
    kill() {
        return __awaiter(this, void 0, void 0, function* () {
            this.proc.stdin.end();
            this.proc.kill();
            return new Promise((resolve) => {
                this.proc.once('exit', (code) => resolve(code));
            });
        });
    }
    interact(command, args, data) {
        return __awaiter(this, void 0, void 0, function* () {
            return this.requestQueue.add(() => __awaiter(this, void 0, void 0, function* () {
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
                    setImmediate(() => __awaiter(this, void 0, void 0, function* () {
                        try {
                            for (var _a = __asyncValues(this.readgen(this.proc.stderr, isEnded)), _b; _b = yield _a.next(), !_b.done;) {
                                const line = yield _b.value;
                                stderr.push(line);
                            }
                        }
                        catch (e_1_1) { e_1 = { error: e_1_1 }; }
                        finally {
                            try {
                                if (_b && !_b.done && (_c = _a.return)) yield _c.call(_a);
                            }
                            finally { if (e_1) throw e_1.error; }
                        }
                        var e_1, _c;
                    }));
                    const readOutput = () => __awaiter(this, void 0, void 0, function* () {
                        try {
                            for (var _a = __asyncValues(this.readgen(this.proc.stdout, isEnded)), _b; _b = yield _a.next(), !_b.done;) {
                                const line = yield _b.value;
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
                                if (_b && !_b.done && (_c = _a.return)) yield _c.call(_a);
                            }
                            finally { if (e_2) throw e_2.error; }
                        }
                        return { stdout, stderr };
                        var e_2, _c;
                    });
                    const exitEvent = () => __awaiter(this, void 0, void 0, function* () {
                        return new Promise((resolve, reject) => {
                            this.proc.once('exit', (code) => {
                                util_1.warn(stdout.join('\n'));
                                reject(util_1.mkError('GHCModInteractiveCrash', `${stdout}\n\n${stderr}`));
                            });
                        });
                    });
                    const timeoutEvent = () => __awaiter(this, void 0, void 0, function* () {
                        return new Promise((resolve, reject) => {
                            const tml = atom.config.get('haskell-ghc-mod.interactiveActionTimeout');
                            if (tml) {
                                setTimeout(() => {
                                    reject(util_1.mkError('InteractiveActionTimeout', `${stdout}\n\n${stderr}`));
                                }, tml * 1000);
                            }
                        });
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
                    return yield Promise.race([readOutput(), exitEvent(), timeoutEvent()]);
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
            }));
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
    waitReadable(stream) {
        return __awaiter(this, void 0, void 0, function* () {
            return new Promise((resolve) => stream.once('readable', () => {
                resolve();
            }));
        });
    }
    readgen(out, isEnded) {
        return __asyncGenerator(this, arguments, function* readgen_1() {
            let buffer = '';
            while (!isEnded()) {
                const read = out.read();
                if (read !== null) {
                    buffer += read;
                    if (buffer.includes(os_1.EOL)) {
                        const arr = buffer.split(os_1.EOL);
                        buffer = arr.pop() || '';
                        yield __await(yield* __asyncDelegator(__asyncValues(arr)));
                    }
                }
                else {
                    yield __await(this.waitReadable(out));
                }
            }
            if (buffer) {
                out.unshift(buffer);
            }
        });
    }
}
exports.InteractiveProcess = InteractiveProcess;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaW50ZXJhY3RpdmUtcHJvY2Vzcy5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uLy4uL3NyYy9naGMtbW9kL2ludGVyYWN0aXZlLXByb2Nlc3MudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7QUFBQSwrQkFBNkQ7QUFDN0Qsa0NBQW1EO0FBQ25ELDJCQUF3QjtBQUN4QixvQ0FBbUM7QUFDbkMsdUNBQXVDO0FBQ3ZDLHFDQUFxQztBQUVwQyxNQUFjLENBQUMsYUFBYSxHQUFHLE1BQU0sQ0FBQyxhQUFhLElBQUksTUFBTSxDQUFDLEdBQUcsQ0FBQyxzQkFBc0IsQ0FBQyxDQUFBO0FBYzFGO0lBVUUsWUFBWSxJQUFZLEVBQUUsR0FBYSxFQUFFLE9BQXdCLEVBQVUsSUFBZ0I7UUFBaEIsU0FBSSxHQUFKLElBQUksQ0FBWTtRQUN6RixJQUFJLENBQUMsSUFBSSxHQUFHLElBQUksQ0FBQTtRQUNoQixJQUFJLENBQUMsV0FBVyxHQUFHLElBQUksMEJBQW1CLEVBQUUsQ0FBQTtRQUM1QyxJQUFJLENBQUMsT0FBTyxHQUFHLElBQUksY0FBTyxFQUFFLENBQUE7UUFDNUIsSUFBSSxDQUFDLFdBQVcsQ0FBQyxHQUFHLENBQUMsSUFBSSxDQUFDLE9BQU8sQ0FBQyxDQUFBO1FBQ2xDLElBQUksQ0FBQyxHQUFHLEdBQUcsT0FBTyxDQUFDLEdBQUcsQ0FBQTtRQUN0QixJQUFJLENBQUMsWUFBWSxHQUFHLElBQUksS0FBSyxDQUFDLENBQUMsRUFBRSxHQUFHLENBQUMsQ0FBQTtRQUVyQyxZQUFLLENBQUMsc0NBQXNDLE9BQU8sQ0FBQyxHQUFHLGtCQUFrQixFQUFFLE9BQU8sQ0FBQyxDQUFBO1FBQ25GLElBQUksQ0FBQyxJQUFJLEdBQUcsRUFBRSxDQUFDLEtBQUssQ0FBQyxJQUFJLEVBQUUsR0FBRyxFQUFFLE9BQU8sQ0FBQyxDQUFBO1FBQ3hDLElBQUksQ0FBQyxJQUFJLENBQUMsTUFBTSxDQUFDLFdBQVcs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Q0FBQyxDQUFBO3dCQUM3QixNQUFNLEdBQUcsR0FBRyxDQUFDLEdBQUcsRUFBRSxJQUFJLEVBQUUsQ0FBQTt3QkFDeEIsY0FBQSxLQUFLLENBQUMsQ0FBQyxpQkFBQSxjQUFBLEdBQUcsQ0FBQSxDQUFBLENBQUEsQ0FBQTtvQkFDWixDQUFDO2dCQUNILENBQUM7Z0JBQUMsSUFBSSxDQUFDLENBQUM7b0JBQ04sY0FBTSxJQUFJLENBQUMsWUFBWSxDQUFDLEdBQUcsQ0FBQyxDQUFBLENBQUE7Z0JBQzlCLENBQUM7WUFDSCxDQUFDO1lBQ0QsRUFBRSxDQUFDLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQztnQkFBQyxHQUFHLENBQUMsT0FBTyxDQUFDLE1BQU0sQ0FBQyxDQUFBO1lBQUMsQ0FBQztRQUNyQyxDQUFDO0tBQUE7Q0FDRjtBQXRLRCxnREFzS0MiLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgeyBURW1pdHRlciwgRW1pdHRlciwgQ29tcG9zaXRlRGlzcG9zYWJsZSB9IGZyb20gJ2F0b20nXG5pbXBvcnQgeyBkZWJ1Zywgd2FybiwgbWtFcnJvciwgRU9UIH0gZnJvbSAnLi4vdXRpbCdcbmltcG9ydCB7IEVPTCB9IGZyb20gJ29zJ1xuaW1wb3J0ICogYXMgQ1AgZnJvbSAnY2hpbGRfcHJvY2VzcydcbmltcG9ydCBRdWV1ZSA9IHJlcXVpcmUoJ3Byb21pc2UtcXVldWUnKVxuaW1wb3J0IHBpZHVzYWdlID0gcmVxdWlyZSgncGlkdXNhZ2UnKVxuXG4oU3ltYm9sIGFzIGFueSkuYXN5bmNJdGVyYXRvciA9IFN5bWJvbC5hc3luY0l0ZXJhdG9yIHx8IFN5bWJvbC5mb3IoJ1N5bWJvbC5hc3luY0l0ZXJhdG9yJylcblxuZXhwb3J0IGludGVyZmFjZSBHSENNb2RDYXBzIHtcbiAgdmVyc2lvbjogbnVtYmVyW10sXG4gIGZpbGVNYXA6IGJvb2xlYW4sXG4gIHF1b3RlQXJnczogYm9vbGVhbixcbiAgb3B0cGFyc2U6IGJvb2xlYW4sXG4gIHR5cGVDb25zdHJhaW50czogYm9vbGVhbixcbiAgYnJvd3NlUGFyZW50czogYm9vbGVhbixcbiAgaW50ZXJhY3RpdmVDYXNlU3BsaXQ6IGJvb2xlYW4sXG4gIGltcG9ydGVkRnJvbTogYm9vbGVhbixcbiAgYnJvd3NlTWFpbjogYm9vbGVhblxufVxuXG5leHBvcnQgY2xhc3MgSW50ZXJhY3RpdmVQcm9jZXNzIHtcbiAgcHJpdmF0ZSBkaXNwb3NhYmxlczogQ29tcG9zaXRlRGlzcG9zYWJsZVxuICBwcml2YXRlIGVtaXR0ZXI6IFRFbWl0dGVyPHtcbiAgICAnZGlkLWV4aXQnOiBudW1iZXJcbiAgfT5cbiAgcHJpdmF0ZSBwcm9jOiBDUC5DaGlsZFByb2Nlc3NcbiAgcHJpdmF0ZSBjd2Q6IHN0cmluZ1xuICBwcml2YXRlIHRpbWVyOiBudW1iZXIgfCB1bmRlZmluZWRcbiAgcHJpdmF0ZSByZXF1ZXN0UXVldWU6IFF1ZXVlXG5cbiAgY29uc3RydWN0b3IocGF0aDogc3RyaW5nLCBjbWQ6IHN0cmluZ1tdLCBvcHRpb25zOiB7IGN3ZDogc3RyaW5nIH0sIHByaXZhdGUgY2FwczogR0hDTW9kQ2Fwcykge1xuICAgIHRoaXMuY2FwcyA9IGNhcHNcbiAgICB0aGlzLmRpc3Bvc2FibGVzID0gbmV3IENvbXBvc2l0ZURpc3Bvc2FibGUoKVxuICAgIHRoaXMuZW1pdHRlciA9IG5ldyBFbWl0dGVyKClcbiAgICB0aGlzLmRpc3Bvc2FibGVzLmFkZCh0aGlzLmVtaXR0ZXIpXG4gICAgdGhpcy5jd2QgPSBvcHRpb25zLmN3ZFxuICAgIHRoaXMucmVxdWVzdFF1ZXVlID0gbmV3IFF1ZXVlKDEsIDEwMClcblxuICAgIGRlYnVnKGBTcGF3bmluZyBuZXcgZ2hjLW1vZGkgaW5zdGFuY2UgZm9yICR7b3B0aW9ucy5jd2R9IHdpdGggb3B0aW9ucyA9IGAsIG9wdGlvbnMpXG4gICAgdGhpcy5wcm9jID0gQ1Auc3Bhd24ocGF0aCwgY21kLCBvcHRpb25zKVxuICAgIHRoaXMucHJvYy5zdGRvdXQuc2V0RW5jb2RpbmcoJ3V0Zi04JylcbiAgICB0aGlzLnByb2Muc3RkZXJyLnNldEVuY29kaW5nKCd1dGYtOCcpXG4gICAgdGhpcy5wcm9jLnNldE1heExpc3RlbmVycygxMDApXG4gICAgdGhpcy5wcm9jLnN0ZG91dC5zZXRNYXhMaXN0ZW5lcnMoMTAwKVxuICAgIHRoaXMucHJvYy5zdGRlcnIuc2V0TWF4TGlzdGVuZXJzKDEwMClcbiAgICB0aGlzLnJlc2V0VGltZXIoKVxuICAgIHRoaXMucHJvYy5vbmNlKCdleGl0JywgKGNvZGUpID0+IHtcbiAgICAgIHRoaXMudGltZXIgJiYgd2luZG93LmNsZWFyVGltZW91dCh0aGlzLnRpbWVyKVxuICAgICAgZGVidWcoYGdoYy1tb2RpIGZvciAke29wdGlvbnMuY3dkfSBlbmRlZCB3aXRoICR7Y29kZX1gKVxuICAgICAgdGhpcy5lbWl0dGVyLmVtaXQoJ2RpZC1leGl0JywgY29kZSlcbiAgICAgIHRoaXMuZGlzcG9zYWJsZXMuZGlzcG9zZSgpXG4gICAgfSlcbiAgfVxuXG4gIHB1YmxpYyBvbmNlRXhpdChhY3Rpb246IChjb2RlOiBudW1iZXIpID0+IHZvaWQpIHtcbiAgICByZXR1cm4gdGhpcy5lbWl0dGVyLm9uY2UoJ2RpZC1leGl0JywgYWN0aW9uKVxuICB9XG5cbiAgcHVibGljIGFzeW5jIGtpbGwoKTogUHJvbWlzZTxudW1iZXI+IHtcbiAgICB0aGlzLnByb2Muc3RkaW4uZW5kKClcbiAgICB0aGlzLnByb2Mua2lsbCgpXG4gICAgcmV0dXJuIG5ldyBQcm9taXNlPG51bWJlcj4oKHJlc29sdmUpID0+IHtcbiAgICAgIHRoaXMucHJvYy5vbmNlKCdleGl0JywgKGNvZGUpID0+IHJlc29sdmUoY29kZSkpXG4gICAgfSlcbiAgfVxuXG4gIHB1YmxpYyBhc3luYyBpbnRlcmFjdChcbiAgICBjb21tYW5kOiBzdHJpbmcsIGFyZ3M6IHN0cmluZ1tdLCBkYXRhPzogc3RyaW5nLFxuICApOiBQcm9taXNlPHsgc3Rkb3V0OiBzdHJpbmdbXSwgc3RkZXJyOiBzdHJpbmdbXSB9PiB7XG4gICAgcmV0dXJuIHRoaXMucmVxdWVzdFF1ZXVlLmFkZChhc3luYyAoKSA9PiB7XG4gICAgICB0aGlzLnByb2Muc3Rkb3V0LnBhdXNlKClcbiAgICAgIHRoaXMucHJvYy5zdGRlcnIucGF1c2UoKVxuXG4gICAgICBwaWR1c2FnZS5zdGF0KHRoaXMucHJvYy5waWQsIChlcnIsIHN0YXQpID0+IHtcbiAgICAgICAgaWYgKGVycikge1xuICAgICAgICAgIHdhcm4oZXJyKVxuICAgICAgICAgIHJldHVyblxuICAgICAgICB9XG4gICAgICAgIGlmIChzdGF0Lm1lbW9yeSA+IGF0b20uY29uZmlnLmdldCgnaGFza2VsbC1naGMtbW9kLm1heE1lbU1lZ3MnKSAqIDEwMjQgKiAxMDI0KSB7XG4gICAgICAgICAgdGhpcy5wcm9jLmtpbGwoKVxuICAgICAgICB9XG4gICAgICB9KVxuXG4gICAgICBkZWJ1ZyhgU3RhcnRlZCBpbnRlcmFjdGl2ZSBhY3Rpb24gYmxvY2sgaW4gJHt0aGlzLmN3ZH1gKVxuICAgICAgZGVidWcoYFJ1bm5pbmcgaW50ZXJhY3RpdmUgY29tbWFuZCAke2NvbW1hbmR9ICR7YXJnc30gJHtkYXRhID8gJ3dpdGgnIDogJ3dpdGhvdXQnfSBhZGRpdGlvbmFsIGRhdGFgKVxuICAgICAgbGV0IGVuZGVkID0gZmFsc2VcbiAgICAgIHRyeSB7XG4gICAgICAgIGNvbnN0IGlzRW5kZWQgPSAoKSA9PiBlbmRlZFxuICAgICAgICBjb25zdCBzdGRlcnI6IHN0cmluZ1tdID0gW11cbiAgICAgICAgY29uc3Qgc3Rkb3V0OiBzdHJpbmdbXSA9IFtdXG4gICAgICAgIHNldEltbWVkaWF0ZShhc3luYyAoKSA9PiB7XG4gICAgICAgICAgZm9yIGF3YWl0IChjb25zdCBsaW5lIG9mIHRoaXMucmVhZGdlbih0aGlzLnByb2Muc3RkZXJyLCBpc0VuZGVkKSkge1xuICAgICAgICAgICAgc3RkZXJyLnB1c2gobGluZSlcbiAgICAgICAgICB9XG4gICAgICAgIH0pXG4gICAgICAgIGNvbnN0IHJlYWRPdXRwdXQgPSBhc3luYyAoKSA9PiB7XG4gICAgICAgICAgZm9yIGF3YWl0IChjb25zdCBsaW5lIG9mIHRoaXMucmVhZGdlbih0aGlzLnByb2Muc3Rkb3V0LCBpc0VuZGVkKSkge1xuICAgICAgICAgICAgZGVidWcoYEdvdCByZXNwb25zZSBmcm9tIGdoYy1tb2RpOiAke2xpbmV9YClcbiAgICAgICAgICAgIGlmIChsaW5lID09PSAnT0snKSB7XG4gICAgICAgICAgICAgIGVuZGVkID0gdHJ1ZVxuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgc3Rkb3V0LnB1c2gobGluZSlcbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9XG4gICAgICAgICAgcmV0dXJuIHsgc3Rkb3V0LCBzdGRlcnIgfVxuICAgICAgICB9XG4gICAgICAgIGNvbnN0IGV4aXRFdmVudCA9IGFzeW5jICgpID0+IG5ldyBQcm9taXNlPG5ldmVyPigocmVzb2x2ZSwgcmVqZWN0KSA9PiB7XG4gICAgICAgICAgdGhpcy5wcm9jLm9uY2UoJ2V4aXQnLCAoY29kZSkgPT4ge1xuICAgICAgICAgICAgd2FybihzdGRvdXQuam9pbignXFxuJykpXG4gICAgICAgICAgICByZWplY3QobWtFcnJvcignR0hDTW9kSW50ZXJhY3RpdmVDcmFzaCcsIGAke3N0ZG91dH1cXG5cXG4ke3N0ZGVycn1gKSlcbiAgICAgICAgICB9KVxuICAgICAgICB9KVxuICAgICAgICBjb25zdCB0aW1lb3V0RXZlbnQgPSBhc3luYyAoKSA9PiBuZXcgUHJvbWlzZTxuZXZlcj4oKHJlc29sdmUsIHJlamVjdCkgPT4ge1xuICAgICAgICAgIGNvbnN0IHRtbDogbnVtYmVyID0gYXRvbS5jb25maWcuZ2V0KCdoYXNrZWxsLWdoYy1tb2QuaW50ZXJhY3RpdmVBY3Rpb25UaW1lb3V0JylcbiAgICAgICAgICBpZiAodG1sKSB7XG4gICAgICAgICAgICBzZXRUaW1lb3V0KFxuICAgICAgICAgICAgICAoKSA9PiB7XG4gICAgICAgICAgICAgICAgcmVqZWN0KG1rRXJyb3IoJ0ludGVyYWN0aXZlQWN0aW9uVGltZW91dCcsIGAke3N0ZG91dH1cXG5cXG4ke3N0ZGVycn1gKSlcbiAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgICAgdG1sICogMTAwMCxcbiAgICAgICAgICAgIClcbiAgICAgICAgICB9XG4gICAgICAgIH0pXG5cbiAgICAgICAgY29uc3QgYXJnczIgPVxuICAgICAgICAgIHRoaXMuY2Fwcy5xdW90ZUFyZ3MgP1xuICAgICAgICAgICAgWydhc2NpaS1lc2NhcGUnLCBjb21tYW5kXS5jb25jYXQoYXJncy5tYXAoKHgpID0+IGBcXHgwMiR7eH1cXHgwM2ApKVxuICAgICAgICAgICAgOlxuICAgICAgICAgICAgW2NvbW1hbmQsIC4uLmFyZ3NdXG4gICAgICAgIGRlYnVnKGBSdW5uaW5nIGdoYy1tb2RpIGNvbW1hbmQgJHtjb21tYW5kfWAsIC4uLmFyZ3MpXG4gICAgICAgIHRoaXMucHJvYy5zdGRpbi53cml0ZShgJHthcmdzMi5qb2luKCcgJykucmVwbGFjZSgvKD86XFxyP1xcbnxcXHIpL2csICcgJyl9JHtFT0x9YClcbiAgICAgICAgaWYgKGRhdGEpIHtcbiAgICAgICAgICBkZWJ1ZygnV3JpdGluZyBkYXRhIHRvIHN0ZGluLi4uJylcbiAgICAgICAgICB0aGlzLnByb2Muc3RkaW4ud3JpdGUoYCR7ZGF0YX0ke0VPVH1gKVxuICAgICAgICB9XG4gICAgICAgIHJldHVybiBhd2FpdCBQcm9taXNlLnJhY2UoW3JlYWRPdXRwdXQoKSwgZXhpdEV2ZW50KCksIHRpbWVvdXRFdmVudCgpXSlcbiAgICAgIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgICAgIC8vIHRzbGludDpkaXNhYmxlLW5leHQtbGluZTpuby11bnNhZmUtYW55XG4gICAgICAgIGlmIChlcnJvci5uYW1lID09PSAnSW50ZXJhY3RpdmVBY3Rpb25UaW1lb3V0Jykge1xuICAgICAgICAgIHRoaXMucHJvYy5raWxsKClcbiAgICAgICAgfVxuICAgICAgICB0aHJvdyBlcnJvclxuICAgICAgfSBmaW5hbGx5IHtcbiAgICAgICAgZGVidWcoYEVuZGVkIGludGVyYWN0aXZlIGFjdGlvbiBibG9jayBpbiAke3RoaXMuY3dkfWApXG4gICAgICAgIGVuZGVkID0gdHJ1ZVxuICAgICAgICB0aGlzLnByb2Muc3Rkb3V0LnJlc3VtZSgpXG4gICAgICAgIHRoaXMucHJvYy5zdGRlcnIucmVzdW1lKClcbiAgICAgIH1cbiAgICB9KVxuICB9XG5cbiAgcHJpdmF0ZSByZXNldFRpbWVyKCkge1xuICAgIGlmICh0aGlzLnRpbWVyKSB7XG4gICAgICBjbGVhclRpbWVvdXQodGhpcy50aW1lcilcbiAgICB9XG4gICAgY29uc3QgdG1sID0gYXRvbS5jb25maWcuZ2V0KCdoYXNrZWxsLWdoYy1tb2QuaW50ZXJhY3RpdmVJbmFjdGl2aXR5VGltZW91dCcpXG4gICAgaWYgKHRtbCkge1xuICAgICAgLy8gdHNsaW50OmRpc2FibGUtbmV4dC1saW5lOiBuby1mbG9hdGluZy1wcm9taXNlc1xuICAgICAgdGhpcy50aW1lciA9IHdpbmRvdy5zZXRUaW1lb3V0KCgpID0+IHsgdGhpcy5raWxsKCkgfSwgdG1sICogNjAgKiAxMDAwKVxuICAgIH1cbiAgfVxuXG4gIHByaXZhdGUgYXN5bmMgd2FpdFJlYWRhYmxlKHN0cmVhbTogTm9kZUpTLlJlYWRhYmxlU3RyZWFtKSB7XG4gICAgcmV0dXJuIG5ldyBQcm9taXNlKChyZXNvbHZlKSA9PiBzdHJlYW0ub25jZSgncmVhZGFibGUnLCAoKSA9PiB7XG4gICAgICByZXNvbHZlKClcbiAgICB9KSlcbiAgfVxuXG4gIHByaXZhdGUgYXN5bmMgKnJlYWRnZW4ob3V0OiBOb2RlSlMuUmVhZGFibGVTdHJlYW0sIGlzRW5kZWQ6ICgpID0+IGJvb2xlYW4pIHtcbiAgICBsZXQgYnVmZmVyID0gJydcbiAgICB3aGlsZSAoIWlzRW5kZWQoKSkge1xuICAgICAgY29uc3QgcmVhZCA9IG91dC5yZWFkKCkgYXMgKHN0cmluZyB8IG51bGwpXG4gICAgICAvLyB0c2xpbnQ6ZGlzYWJsZS1uZXh0LWxpbmU6IG5vLW51bGwta2V5d29yZFxuICAgICAgaWYgKHJlYWQgIT09IG51bGwpIHtcbiAgICAgICAgYnVmZmVyICs9IHJlYWRcbiAgICAgICAgaWYgKGJ1ZmZlci5pbmNsdWRlcyhFT0wpKSB7XG4gICAgICAgICAgY29uc3QgYXJyID0gYnVmZmVyLnNwbGl0KEVPTClcbiAgICAgICAgICBidWZmZXIgPSBhcnIucG9wKCkgfHwgJydcbiAgICAgICAgICB5aWVsZCogYXJyXG4gICAgICAgIH1cbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIGF3YWl0IHRoaXMud2FpdFJlYWRhYmxlKG91dClcbiAgICAgIH1cbiAgICB9XG4gICAgaWYgKGJ1ZmZlcikgeyBvdXQudW5zaGlmdChidWZmZXIpIH1cbiAgfVxufVxuIl19