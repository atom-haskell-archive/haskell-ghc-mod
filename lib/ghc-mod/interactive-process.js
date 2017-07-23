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
            this.timer && clearTimeout(this.timer);
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
                                util_1.warn(stdout);
                                reject(util_1.mkError('ghc-modi crashed', `${stdout}\n\n${stderr}`));
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
                        yield this.proc.kill();
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
            this.timer = setTimeout(() => { this.kill(); }, tml * 60 * 1000);
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
                    if (buffer.match(/\n/)) {
                        const arr = buffer.split('\n');
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaW50ZXJhY3RpdmUtcHJvY2Vzcy5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uLy4uL3NyYy9naGMtbW9kL2ludGVyYWN0aXZlLXByb2Nlc3MudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7QUFTQSwrQkFBbUQ7QUFDbkQsa0NBQW1EO0FBQ25ELDJCQUF3QjtBQUN4QixvQ0FBbUM7QUFDbkMsdUNBQXVDO0FBY3ZDO0lBUUUsWUFBYSxJQUFZLEVBQUUsR0FBYSxFQUFFLE9BQXNCLEVBQVUsSUFBZ0I7UUFBaEIsU0FBSSxHQUFKLElBQUksQ0FBWTtRQUN4RixJQUFJLENBQUMsSUFBSSxHQUFHLElBQUksQ0FBQTtRQUNoQixJQUFJLENBQUMsV0FBVyxHQUFHLElBQUksMEJBQW1CLEVBQUUsQ0FBQTtRQUM1QyxJQUFJLENBQUMsT0FBTyxHQUFHLElBQUksY0FBTyxFQUFFLENBQUE7UUFDNUIsSUFBSSxDQUFDLFdBQVcsQ0FBQyxHQUFHLENBQUMsSUFBSSxDQUFDLE9BQU8sQ0FBQyxDQUFBO1FBQ2xDLElBQUksQ0FBQyxHQUFHLEdBQUcsT0FBTyxDQUFDLEdBQUcsQ0FBQTtRQUN0QixJQUFJLENBQUMsWUFBWSxHQUFHLElBQUksS0FBSyxDQUFDLENBQUMsRUFBRSxHQUFHLENBQUMsQ0FBQTtRQUVyQyxZQUFLLENBQUMsc0NBQXNDLE9BQU8sQ0FBQyxHQUFHLGtCQUFrQixFQUFFLE9BQU8sQ0FBQyxDQUFBO1FBQ25GLElBQUksQ0FBQyxJQUFJLEdBQUcsRUFBRSxDQUFDLEtBQUssQ0FBQyxJQUFJLEVBQUUsR0FBRyxFQUFFLE9BQU8sQ0FBQyxDQUFBO1FBQ3hDLElBQUksQ0FBQyxJQUFJLENBQUMsTUFBTSxDQUFDLFdBQVcsQ0FBQyxPQUFPLENBQUMsQ0FBQTtRQUNyQyxJQUFJLENBQUMsSUFBSSxDQUFDLE1BQU0sQ0FBQyxXQUFXLENBQUMsT0FBTyxDQUFDLENBQUE7UUFDckMsSUFBSSxDQUFD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QUFDLElBQUksS0FBSyxJQUFJLENBQUMsQ0FBQyxDQUFDO29CQUNsQixNQUFNLElBQUksSUFBSSxDQUFBO29CQUNkLEVBQUUsQ0FBQyxDQUFDLE1BQU0sQ0FBQyxLQUFLLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxDQUFDO3dCQUN2QixNQUFNLEdBQUcsR0FBRyxNQUFNLENBQUMsS0FBSyxDQUFDLElBQUksQ0FBQyxDQUFBO3dCQUM5QixNQUFNLEdBQUcsR0FBRyxDQUFDLEdBQUcsRUFBRSxJQUFJLEVBQUUsQ0FBQTt3QkFDeEIsY0FBQSxPQUFPLGlCQUFBLGNBQUEsR0FBRyxDQUFBLENBQUEsQ0FBQSxDQUFBO29CQUNaLENBQUM7Z0JBQ0gsQ0FBQztnQkFBQyxJQUFJLENBQUMsQ0FBQztvQkFDTixjQUFNLElBQUksQ0FBQyxZQUFZLENBQUMsR0FBRyxDQUFDLENBQUEsQ0FBQTtnQkFDOUIsQ0FBQztZQUNILENBQUM7WUFDRCxFQUFFLENBQUMsQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDO2dCQUFDLEdBQUcsQ0FBQyxPQUFPLENBQUMsTUFBTSxDQUFDLENBQUE7WUFBQyxDQUFDO1FBQ3JDLENBQUM7S0FBQTtDQUNGO0FBckpELGdEQXFKQyIsInNvdXJjZXNDb250ZW50IjpbIi8qXG4gKiBkZWNhZmZlaW5hdGUgc3VnZ2VzdGlvbnM6XG4gKiBEUzEwMTogUmVtb3ZlIHVubmVjZXNzYXJ5IHVzZSBvZiBBcnJheS5mcm9tXG4gKiBEUzEwMjogUmVtb3ZlIHVubmVjZXNzYXJ5IGNvZGUgY3JlYXRlZCBiZWNhdXNlIG9mIGltcGxpY2l0IHJldHVybnNcbiAqIERTMTAzOiBSZXdyaXRlIGNvZGUgdG8gbm8gbG9uZ2VyIHVzZSBfX2d1YXJkX19cbiAqIERTMjAxOiBTaW1wbGlmeSBjb21wbGV4IGRlc3RydWN0dXJlIGFzc2lnbm1lbnRzXG4gKiBEUzIwNzogQ29uc2lkZXIgc2hvcnRlciB2YXJpYXRpb25zIG9mIG51bGwgY2hlY2tzXG4gKiBGdWxsIGRvY3M6IGh0dHBzOi8vZ2l0aHViLmNvbS9kZWNhZmZlaW5hdGUvZGVjYWZmZWluYXRlL2Jsb2IvbWFzdGVyL2RvY3Mvc3VnZ2VzdGlvbnMubWRcbiAqL1xuaW1wb3J0IHsgRW1pdHRlciwgQ29tcG9zaXRlRGlzcG9zYWJsZSB9IGZyb20gJ2F0b20nXG5pbXBvcnQgeyBkZWJ1Zywgd2FybiwgbWtFcnJvciwgRU9UIH0gZnJvbSAnLi4vdXRpbCdcbmltcG9ydCB7IEVPTCB9IGZyb20gJ29zJ1xuaW1wb3J0ICogYXMgQ1AgZnJvbSAnY2hpbGRfcHJvY2VzcydcbmltcG9ydCBRdWV1ZSA9IHJlcXVpcmUoJ3Byb21pc2UtcXVldWUnKVxuXG5leHBvcnQgaW50ZXJmYWNlIEdIQ01vZENhcHMge1xuICB2ZXJzaW9uOiBudW1iZXJbXSxcbiAgZmlsZU1hcDogYm9vbGVhbixcbiAgcXVvdGVBcmdzOiBib29sZWFuLFxuICBvcHRwYXJzZTogYm9vbGVhbixcbiAgdHlwZUNvbnN0cmFpbnRzOiBib29sZWFuLFxuICBicm93c2VQYXJlbnRzOiBib29sZWFuLFxuICBpbnRlcmFjdGl2ZUNhc2VTcGxpdDogYm9vbGVhbixcbiAgaW1wb3J0ZWRGcm9tOiBib29sZWFuLFxuICBicm93c2VNYWluOiBib29sZWFuXG59XG5cbmV4cG9ydCBjbGFzcyBJbnRlcmFjdGl2ZVByb2Nlc3Mge1xuICBwcml2YXRlIGRpc3Bvc2FibGVzOiBDb21wb3NpdGVEaXNwb3NhYmxlXG4gIHByaXZhdGUgZW1pdHRlcjogRW1pdHRlclxuICBwcml2YXRlIHByb2M6IENQLkNoaWxkUHJvY2Vzc1xuICBwcml2YXRlIGN3ZDogc3RyaW5nXG4gIHByaXZhdGUgdGltZXI6IE5vZGVKUy5UaW1lclxuICBwcml2YXRlIHJlcXVlc3RRdWV1ZTogUXVldWVcblxuICBjb25zdHJ1Y3RvciAocGF0aDogc3RyaW5nLCBjbWQ6IHN0cmluZ1tdLCBvcHRpb25zOiB7Y3dkOiBzdHJpbmd9LCBwcml2YXRlIGNhcHM6IEdIQ01vZENhcHMpIHtcbiAgICB0aGlzLmNhcHMgPSBjYXBzXG4gICAgdGhpcy5kaXNwb3NhYmxlcyA9IG5ldyBDb21wb3NpdGVEaXNwb3NhYmxlKClcbiAgICB0aGlzLmVtaXR0ZXIgPSBuZXcgRW1pdHRlcigpXG4gICAgdGhpcy5kaXNwb3NhYmxlcy5hZGQodGhpcy5lbWl0dGVyKVxuICAgIHRoaXMuY3dkID0gb3B0aW9ucy5jd2RcbiAgICB0aGlzLnJlcXVlc3RRdWV1ZSA9IG5ldyBRdWV1ZSgxLCAxMDApXG5cbiAgICBkZWJ1ZyhgU3Bhd25pbmcgbmV3IGdoYy1tb2RpIGluc3RhbmNlIGZvciAke29wdGlvbnMuY3dkfSB3aXRoIG9wdGlvbnMgPSBgLCBvcHRpb25zKVxuICAgIHRoaXMucHJvYyA9IENQLnNwYXduKHBhdGgsIGNtZCwgb3B0aW9ucylcbiAgICB0aGlzLnByb2Muc3Rkb3V0LnNldEVuY29kaW5nKCd1dGYtOCcpXG4gICAgdGhpcy5wcm9jLnN0ZGVyci5zZXRFbmNvZGluZygndXRmLTgnKVxuICAgIHRoaXMucHJvYy5zZXRNYXhMaXN0ZW5lcnMoMTAwKVxuICAgIHRoaXMucHJvYy5zdGRvdXQuc2V0TWF4TGlzdGVuZXJzKDEwMClcbiAgICB0aGlzLnByb2Muc3RkZXJyLnNldE1heExpc3RlbmVycygxMDApXG4gICAgdGhpcy5yZXNldFRpbWVyKClcbiAgICB0aGlzLnByb2Mub25jZSgnZXhpdCcsIChjb2RlKSA9PiB7XG4gICAgICB0aGlzLnRpbWVyICYmIGNsZWFyVGltZW91dCh0aGlzLnRpbWVyKVxuICAgICAgZGVidWcoYGdoYy1tb2RpIGZvciAke29wdGlvbnMuY3dkfSBlbmRlZCB3aXRoICR7Y29kZX1gKVxuICAgICAgdGhpcy5lbWl0dGVyLmVtaXQoJ2RpZC1leGl0JywgY29kZSlcbiAgICAgIHRoaXMuZGlzcG9zYWJsZXMuZGlzcG9zZSgpXG4gICAgfSlcbiAgfVxuXG4gIHB1YmxpYyBvbmNlRXhpdCAoYWN0aW9uOiAoY29kZTogbnVtYmVyKSA9PiB2b2lkKSB7XG4gICAgcmV0dXJuIHRoaXMuZW1pdHRlci5vbmNlKCdkaWQtZXhpdCcsIGFjdGlvbilcbiAgfVxuXG4gIHB1YmxpYyBhc3luYyBraWxsICgpOiBQcm9taXNlPG51bWJlcj4ge1xuICAgIHRoaXMucHJvYy5zdGRpbi5lbmQoKVxuICAgIHRoaXMucHJvYy5raWxsKClcbiAgICByZXR1cm4gbmV3IFByb21pc2U8bnVtYmVyPigocmVzb2x2ZSkgPT4ge1xuICAgICAgdGhpcy5wcm9jLm9uY2UoJ2V4aXQnLCAoY29kZSkgPT4gcmVzb2x2ZShjb2RlKSlcbiAgICB9KVxuICB9XG5cbiAgcHVibGljIGFzeW5jIGludGVyYWN0IChcbiAgICBjb21tYW5kOiBzdHJpbmcsIGFyZ3M6IHN0cmluZ1tdLCBkYXRhPzogc3RyaW5nXG4gICk6IFByb21pc2U8e3N0ZG91dDogc3RyaW5nW10sIHN0ZGVycjogc3RyaW5nW119PiB7XG4gICAgcmV0dXJuIHRoaXMucmVxdWVzdFF1ZXVlLmFkZChhc3luYyAoKSA9PiB7XG4gICAgICB0aGlzLnByb2Muc3Rkb3V0LnBhdXNlKClcbiAgICAgIHRoaXMucHJvYy5zdGRlcnIucGF1c2UoKVxuXG4gICAgICBkZWJ1ZyhgU3RhcnRlZCBpbnRlcmFjdGl2ZSBhY3Rpb24gYmxvY2sgaW4gJHt0aGlzLmN3ZH1gKVxuICAgICAgZGVidWcoYFJ1bm5pbmcgaW50ZXJhY3RpdmUgY29tbWFuZCAke2NvbW1hbmR9ICR7YXJnc30gJHtkYXRhID8gJ3dpdGgnIDogJ3dpdGhvdXQnfSBhZGRpdGlvbmFsIGRhdGFgKVxuICAgICAgbGV0IGVuZGVkID0gZmFsc2VcbiAgICAgIHRyeSB7XG4gICAgICAgIGNvbnN0IGlzRW5kZWQgPSAoKSA9PiBlbmRlZFxuICAgICAgICBjb25zdCBzdGRlcnI6IHN0cmluZ1tdID0gW11cbiAgICAgICAgY29uc3Qgc3Rkb3V0OiBzdHJpbmdbXSA9IFtdXG4gICAgICAgIHNldEltbWVkaWF0ZShhc3luYyAoKSA9PiB7XG4gICAgICAgICAgZm9yIGF3YWl0IChjb25zdCBsaW5lIG9mIHRoaXMucmVhZGdlbih0aGlzLnByb2Muc3RkZXJyLCBpc0VuZGVkKSkge1xuICAgICAgICAgICAgc3RkZXJyLnB1c2gobGluZSlcbiAgICAgICAgICB9XG4gICAgICAgIH0pXG4gICAgICAgIGNvbnN0IHJlYWRPdXRwdXQgPSBhc3luYyAoKSA9PiB7XG4gICAgICAgICAgZm9yIGF3YWl0IChjb25zdCBsaW5lIG9mIHRoaXMucmVhZGdlbih0aGlzLnByb2Muc3Rkb3V0LCBpc0VuZGVkKSkge1xuICAgICAgICAgICAgZGVidWcoYEdvdCByZXNwb25zZSBmcm9tIGdoYy1tb2RpOiAke2xpbmV9YClcbiAgICAgICAgICAgIGlmIChsaW5lID09PSAnT0snKSB7XG4gICAgICAgICAgICAgIGVuZGVkID0gdHJ1ZVxuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgc3Rkb3V0LnB1c2gobGluZSlcbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9XG4gICAgICAgICAgcmV0dXJuIHtzdGRvdXQsIHN0ZGVycn1cbiAgICAgICAgfVxuICAgICAgICBjb25zdCBleGl0RXZlbnQgPSBhc3luYyAoKSA9PiBuZXcgUHJvbWlzZTxuZXZlcj4oKHJlc29sdmUsIHJlamVjdCkgPT4ge1xuICAgICAgICAgIHRoaXMucHJvYy5vbmNlKCdleGl0JywgKGNvZGUpID0+IHtcbiAgICAgICAgICAgIHdhcm4oc3Rkb3V0KVxuICAgICAgICAgICAgcmVqZWN0KG1rRXJyb3IoJ2doYy1tb2RpIGNyYXNoZWQnLCBgJHtzdGRvdXR9XFxuXFxuJHtzdGRlcnJ9YCkpXG4gICAgICAgICAgfSlcbiAgICAgICAgfSlcbiAgICAgICAgY29uc3QgdGltZW91dEV2ZW50ID0gYXN5bmMgKCkgPT4gbmV3IFByb21pc2U8bmV2ZXI+KChyZXNvbHZlLCByZWplY3QpID0+IHtcbiAgICAgICAgICBjb25zdCB0bWw6IG51bWJlciA9IGF0b20uY29uZmlnLmdldCgnaGFza2VsbC1naGMtbW9kLmludGVyYWN0aXZlQWN0aW9uVGltZW91dCcpXG4gICAgICAgICAgaWYgKHRtbCkge1xuICAgICAgICAgICAgc2V0VGltZW91dCgoKSA9PiB7XG4gICAgICAgICAgICAgIHJlamVjdChta0Vycm9yKCdJbnRlcmFjdGl2ZUFjdGlvblRpbWVvdXQnLCBgJHtzdGRvdXR9XFxuXFxuJHtzdGRlcnJ9YCkpXG4gICAgICAgICAgICB9LCAgICAgICAgIHRtbCAqIDEwMDApXG4gICAgICAgICAgfVxuICAgICAgICB9KVxuXG4gICAgICAgIGNvbnN0IGFyZ3MyID1cbiAgICAgICAgICB0aGlzLmNhcHMucXVvdGVBcmdzID9cbiAgICAgICAgICAgIFsnYXNjaWktZXNjYXBlJywgY29tbWFuZF0uY29uY2F0KGFyZ3MubWFwKCh4KSA9PiBgXFx4MDIke3h9XFx4MDNgKSlcbiAgICAgICAgICA6XG4gICAgICAgICAgICBbY29tbWFuZCwgLi4uYXJnc11cbiAgICAgICAgZGVidWcoYFJ1bm5pbmcgZ2hjLW1vZGkgY29tbWFuZCAke2NvbW1hbmR9YCwgLi4uYXJncylcbiAgICAgICAgdGhpcy5wcm9jLnN0ZGluLndyaXRlKGAke2FyZ3MyLmpvaW4oJyAnKS5yZXBsYWNlKC8oPzpcXHI/XFxufFxccikvZywgJyAnKX0ke0VPTH1gKVxuICAgICAgICBpZiAoZGF0YSkge1xuICAgICAgICAgIGRlYnVnKCdXcml0aW5nIGRhdGEgdG8gc3RkaW4uLi4nKVxuICAgICAgICAgIHRoaXMucHJvYy5zdGRpbi53cml0ZShgJHtkYXRhfSR7RU9UfWApXG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIGF3YWl0IFByb21pc2UucmFjZShbcmVhZE91dHB1dCgpLCBleGl0RXZlbnQoKSwgdGltZW91dEV2ZW50KCldKVxuICAgICAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICAgICAgaWYgKGVycm9yLm5hbWUgPT09ICdJbnRlcmFjdGl2ZUFjdGlvblRpbWVvdXQnKSB7XG4gICAgICAgICAgYXdhaXQgdGhpcy5wcm9jLmtpbGwoKVxuICAgICAgICB9XG4gICAgICAgIHRocm93IGVycm9yXG4gICAgICB9IGZpbmFsbHkge1xuICAgICAgICBkZWJ1ZyhgRW5kZWQgaW50ZXJhY3RpdmUgYWN0aW9uIGJsb2NrIGluICR7dGhpcy5jd2R9YClcbiAgICAgICAgZW5kZWQgPSB0cnVlXG4gICAgICAgIHRoaXMucHJvYy5zdGRvdXQucmVzdW1lKClcbiAgICAgICAgdGhpcy5wcm9jLnN0ZGVyci5yZXN1bWUoKVxuICAgICAgfVxuICAgIH0pXG4gIH1cblxuICBwcml2YXRlIHJlc2V0VGltZXIgKCkge1xuICAgIGlmICh0aGlzLnRpbWVyKSB7XG4gICAgICBjbGVhclRpbWVvdXQodGhpcy50aW1lcilcbiAgICB9XG4gICAgY29uc3QgdG1sID0gYXRvbS5jb25maWcuZ2V0KCdoYXNrZWxsLWdoYy1tb2QuaW50ZXJhY3RpdmVJbmFjdGl2aXR5VGltZW91dCcpXG4gICAgaWYgKHRtbCkge1xuICAgICAgdGhpcy50aW1lciA9IHNldFRpbWVvdXQoKCkgPT4geyB0aGlzLmtpbGwoKSB9LCB0bWwgKiA2MCAqIDEwMDApXG4gICAgfVxuICB9XG5cbiAgcHJpdmF0ZSBhc3luYyB3YWl0UmVhZGFibGUgKHN0cmVhbTogTm9kZUpTLlJlYWRhYmxlU3RyZWFtKSB7XG4gICAgcmV0dXJuIG5ldyBQcm9taXNlKChyZXNvbHZlKSA9PiBzdHJlYW0ub25jZSgncmVhZGFibGUnLCAoKSA9PiB7XG4gICAgICByZXNvbHZlKClcbiAgICB9KSlcbiAgfVxuXG4gIHByaXZhdGUgYXN5bmMgKnJlYWRnZW4gKG91dDogTm9kZUpTLlJlYWRhYmxlU3RyZWFtLCBpc0VuZGVkOiAoKSA9PiBib29sZWFuKSB7XG4gICAgbGV0IGJ1ZmZlciA9ICcnXG4gICAgd2hpbGUgKCEgaXNFbmRlZCgpKSB7XG4gICAgICBjb25zdCByZWFkID0gb3V0LnJlYWQoKSBhcyAoc3RyaW5nIHwgbnVsbClcbiAgICAgIC8vIHRzbGludDpkaXNhYmxlLW5leHQtbGluZTogbm8tbnVsbC1rZXl3b3JkXG4gICAgICBpZiAocmVhZCAhPT0gbnVsbCkge1xuICAgICAgICBidWZmZXIgKz0gcmVhZFxuICAgICAgICBpZiAoYnVmZmVyLm1hdGNoKC9cXG4vKSkge1xuICAgICAgICAgIGNvbnN0IGFyciA9IGJ1ZmZlci5zcGxpdCgnXFxuJylcbiAgICAgICAgICBidWZmZXIgPSBhcnIucG9wKCkgfHwgJydcbiAgICAgICAgICB5aWVsZCogYXJyXG4gICAgICAgIH1cbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIGF3YWl0IHRoaXMud2FpdFJlYWRhYmxlKG91dClcbiAgICAgIH1cbiAgICB9XG4gICAgaWYgKGJ1ZmZlcikgeyBvdXQudW5zaGlmdChidWZmZXIpIH1cbiAgfVxufVxuIl19