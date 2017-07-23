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
                                util_1.debug(`Got response from ghc-modi:${os_1.EOL}${data}`);
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaW50ZXJhY3RpdmUtcHJvY2Vzcy5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uLy4uL3NyYy9naGMtbW9kL2ludGVyYWN0aXZlLXByb2Nlc3MudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7QUFTQSwrQkFBbUQ7QUFDbkQsa0NBQW1EO0FBQ25ELDJCQUF3QjtBQUN4QixvQ0FBbUM7QUFDbkMsdUNBQXVDO0FBYXZDO0lBUUUsWUFBYSxJQUFZLEVBQUUsR0FBYSxFQUFFLE9BQXNCLEVBQVUsSUFBZ0I7UUFBaEIsU0FBSSxHQUFKLElBQUksQ0FBWTtRQUN4RixJQUFJLENBQUMsSUFBSSxHQUFHLElBQUksQ0FBQTtRQUNoQixJQUFJLENBQUMsV0FBVyxHQUFHLElBQUksMEJBQW1CLEVBQUUsQ0FBQTtRQUM1QyxJQUFJLENBQUMsT0FBTyxHQUFHLElBQUksY0FBTyxFQUFFLENBQUE7UUFDNUIsSUFBSSxDQUFDLFdBQVcsQ0FBQyxHQUFHLENBQUMsSUFBSSxDQUFDLE9BQU8sQ0FBQyxDQUFBO1FBQ2xDLElBQUksQ0FBQyxHQUFHLEdBQUcsT0FBTyxDQUFDLEdBQUcsQ0FBQTtRQUN0QixJQUFJLENBQUMsWUFBWSxHQUFHLElBQUksS0FBSyxDQUFDLENBQUMsRUFBRSxHQUFHLENBQUMsQ0FBQTtRQUVyQyxZQUFLLENBQUMsc0NBQXNDLE9BQU8sQ0FBQyxHQUFHLGtCQUFrQixFQUFFLE9BQU8sQ0FBQyxDQUFBO1FBQ25GLElBQUksQ0FBQyxJQUFJLEdBQUcsRUFBRSxDQUFDLEtBQUssQ0FBQyxJQUFJLEVBQUUsR0FBRyxFQUFFLE9BQU8sQ0FBQyxDQUFBO1FBQ3hDLElBQUksQ0FBQyxJQUFJLENBQUMsTUFBTSxDQUFDLFdBQVcsQ0FBQyxPQUFPLENBQUMsQ0FBQTtRQUNyQyxJQUFJLENBQUMsSUFBSSxDQUFDLE1BQU0sQ0FBQyxXQUFXLENBQUMsT0FBTyxDQUFDLENBQUE7UUFDckMsSUFBSSxDQUFD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LENBQUMsSUFBSSxDQUFDLENBQUE7d0JBQzlCLE1BQU0sR0FBRyxHQUFHLENBQUMsR0FBRyxFQUFFLElBQUksRUFBRSxDQUFBO3dCQUN4QixjQUFBLE9BQU8saUJBQUEsY0FBQSxHQUFHLENBQUEsQ0FBQSxDQUFBLENBQUE7b0JBQ1osQ0FBQztnQkFDSCxDQUFDO2dCQUFDLElBQUksQ0FBQyxDQUFDO29CQUNOLGNBQU0sSUFBSSxDQUFDLFlBQVksQ0FBQyxHQUFHLENBQUMsQ0FBQSxDQUFBO2dCQUM5QixDQUFDO1lBQ0gsQ0FBQztZQUNELEVBQUUsQ0FBQyxDQUFDLE1BQU0sQ0FBQyxDQUFDLENBQUM7Z0JBQUMsR0FBRyxDQUFDLE9BQU8sQ0FBQyxNQUFNLENBQUMsQ0FBQTtZQUFDLENBQUM7UUFDckMsQ0FBQztLQUFBO0NBQ0Y7QUFsSkQsZ0RBa0pDIiwic291cmNlc0NvbnRlbnQiOlsiLypcbiAqIGRlY2FmZmVpbmF0ZSBzdWdnZXN0aW9uczpcbiAqIERTMTAxOiBSZW1vdmUgdW5uZWNlc3NhcnkgdXNlIG9mIEFycmF5LmZyb21cbiAqIERTMTAyOiBSZW1vdmUgdW5uZWNlc3NhcnkgY29kZSBjcmVhdGVkIGJlY2F1c2Ugb2YgaW1wbGljaXQgcmV0dXJuc1xuICogRFMxMDM6IFJld3JpdGUgY29kZSB0byBubyBsb25nZXIgdXNlIF9fZ3VhcmRfX1xuICogRFMyMDE6IFNpbXBsaWZ5IGNvbXBsZXggZGVzdHJ1Y3R1cmUgYXNzaWdubWVudHNcbiAqIERTMjA3OiBDb25zaWRlciBzaG9ydGVyIHZhcmlhdGlvbnMgb2YgbnVsbCBjaGVja3NcbiAqIEZ1bGwgZG9jczogaHR0cHM6Ly9naXRodWIuY29tL2RlY2FmZmVpbmF0ZS9kZWNhZmZlaW5hdGUvYmxvYi9tYXN0ZXIvZG9jcy9zdWdnZXN0aW9ucy5tZFxuICovXG5pbXBvcnQgeyBFbWl0dGVyLCBDb21wb3NpdGVEaXNwb3NhYmxlIH0gZnJvbSAnYXRvbSdcbmltcG9ydCB7IGRlYnVnLCB3YXJuLCBta0Vycm9yLCBFT1QgfSBmcm9tICcuLi91dGlsJ1xuaW1wb3J0IHsgRU9MIH0gZnJvbSAnb3MnXG5pbXBvcnQgKiBhcyBDUCBmcm9tICdjaGlsZF9wcm9jZXNzJ1xuaW1wb3J0IFF1ZXVlID0gcmVxdWlyZSgncHJvbWlzZS1xdWV1ZScpXG5cbmV4cG9ydCBpbnRlcmZhY2UgR0hDTW9kQ2FwcyB7XG4gIHZlcnNpb246IG51bWJlcltdLFxuICBmaWxlTWFwOiBib29sZWFuLFxuICBxdW90ZUFyZ3M6IGJvb2xlYW4sXG4gIG9wdHBhcnNlOiBib29sZWFuLFxuICB0eXBlQ29uc3RyYWludHM6IGJvb2xlYW4sXG4gIGJyb3dzZVBhcmVudHM6IGJvb2xlYW4sXG4gIGludGVyYWN0aXZlQ2FzZVNwbGl0OiBib29sZWFuLFxuICBpbXBvcnRlZEZyb206IGJvb2xlYW5cbn1cblxuZXhwb3J0IGNsYXNzIEludGVyYWN0aXZlUHJvY2VzcyB7XG4gIHByaXZhdGUgZGlzcG9zYWJsZXM6IENvbXBvc2l0ZURpc3Bvc2FibGVcbiAgcHJpdmF0ZSBlbWl0dGVyOiBFbWl0dGVyXG4gIHByaXZhdGUgcHJvYzogQ1AuQ2hpbGRQcm9jZXNzXG4gIHByaXZhdGUgY3dkOiBzdHJpbmdcbiAgcHJpdmF0ZSB0aW1lcjogTm9kZUpTLlRpbWVyXG4gIHByaXZhdGUgcmVxdWVzdFF1ZXVlOiBRdWV1ZVxuXG4gIGNvbnN0cnVjdG9yIChwYXRoOiBzdHJpbmcsIGNtZDogc3RyaW5nW10sIG9wdGlvbnM6IHtjd2Q6IHN0cmluZ30sIHByaXZhdGUgY2FwczogR0hDTW9kQ2Fwcykge1xuICAgIHRoaXMuY2FwcyA9IGNhcHNcbiAgICB0aGlzLmRpc3Bvc2FibGVzID0gbmV3IENvbXBvc2l0ZURpc3Bvc2FibGUoKVxuICAgIHRoaXMuZW1pdHRlciA9IG5ldyBFbWl0dGVyKClcbiAgICB0aGlzLmRpc3Bvc2FibGVzLmFkZCh0aGlzLmVtaXR0ZXIpXG4gICAgdGhpcy5jd2QgPSBvcHRpb25zLmN3ZFxuICAgIHRoaXMucmVxdWVzdFF1ZXVlID0gbmV3IFF1ZXVlKDEsIDEwMClcblxuICAgIGRlYnVnKGBTcGF3bmluZyBuZXcgZ2hjLW1vZGkgaW5zdGFuY2UgZm9yICR7b3B0aW9ucy5jd2R9IHdpdGggb3B0aW9ucyA9IGAsIG9wdGlvbnMpXG4gICAgdGhpcy5wcm9jID0gQ1Auc3Bhd24ocGF0aCwgY21kLCBvcHRpb25zKVxuICAgIHRoaXMucHJvYy5zdGRvdXQuc2V0RW5jb2RpbmcoJ3V0Zi04JylcbiAgICB0aGlzLnByb2Muc3RkZXJyLnNldEVuY29kaW5nKCd1dGYtOCcpXG4gICAgdGhpcy5yZXNldFRpbWVyKClcbiAgICB0aGlzLnByb2Mub25jZSgnZXhpdCcsIChjb2RlKSA9PiB7XG4gICAgICB0aGlzLnRpbWVyICYmIGNsZWFyVGltZW91dCh0aGlzLnRpbWVyKVxuICAgICAgZGVidWcoYGdoYy1tb2RpIGZvciAke29wdGlvbnMuY3dkfSBlbmRlZCB3aXRoICR7Y29kZX1gKVxuICAgICAgdGhpcy5lbWl0dGVyLmVtaXQoJ2RpZC1leGl0JywgY29kZSlcbiAgICAgIHRoaXMuZGlzcG9zYWJsZXMuZGlzcG9zZSgpXG4gICAgfSlcbiAgfVxuXG4gIHB1YmxpYyBvbmNlRXhpdCAoYWN0aW9uOiAoY29kZTogbnVtYmVyKSA9PiB2b2lkKSB7XG4gICAgcmV0dXJuIHRoaXMuZW1pdHRlci5vbmNlKCdkaWQtZXhpdCcsIGFjdGlvbilcbiAgfVxuXG4gIHB1YmxpYyBhc3luYyBraWxsICgpOiBQcm9taXNlPG51bWJlcj4ge1xuICAgIHRoaXMucHJvYy5zdGRpbi5lbmQoKVxuICAgIHRoaXMucHJvYy5raWxsKClcbiAgICByZXR1cm4gbmV3IFByb21pc2U8bnVtYmVyPigocmVzb2x2ZSkgPT4ge1xuICAgICAgdGhpcy5wcm9jLm9uY2UoJ2V4aXQnLCAoY29kZSkgPT4gcmVzb2x2ZShjb2RlKSlcbiAgICB9KVxuICB9XG5cbiAgcHVibGljIGFzeW5jIGludGVyYWN0IChcbiAgICBjb21tYW5kOiBzdHJpbmcsIGFyZ3M6IHN0cmluZ1tdLCBkYXRhPzogc3RyaW5nXG4gICk6IFByb21pc2U8e3N0ZG91dDogc3RyaW5nW10sIHN0ZGVycjogc3RyaW5nW119PiB7XG4gICAgcmV0dXJuIHRoaXMucmVxdWVzdFF1ZXVlLmFkZChhc3luYyAoKSA9PiB7XG4gICAgICB0aGlzLnByb2Muc3Rkb3V0LnBhdXNlKClcbiAgICAgIHRoaXMucHJvYy5zdGRlcnIucGF1c2UoKVxuXG4gICAgICBkZWJ1ZyhgU3RhcnRlZCBpbnRlcmFjdGl2ZSBhY3Rpb24gYmxvY2sgaW4gJHt0aGlzLmN3ZH1gKVxuICAgICAgZGVidWcoYFJ1bm5pbmcgaW50ZXJhY3RpdmUgY29tbWFuZCAke2NvbW1hbmR9ICR7YXJnc30gJHtkYXRhID8gJ3dpdGgnIDogJ3dpdGhvdXQnfSBhZGRpdGlvbmFsIGRhdGFgKVxuICAgICAgbGV0IGVuZGVkID0gZmFsc2VcbiAgICAgIHRyeSB7XG4gICAgICAgIGNvbnN0IGlzRW5kZWQgPSAoKSA9PiBlbmRlZFxuICAgICAgICBjb25zdCBzdGRlcnI6IHN0cmluZ1tdID0gW11cbiAgICAgICAgY29uc3Qgc3Rkb3V0OiBzdHJpbmdbXSA9IFtdXG4gICAgICAgIHNldEltbWVkaWF0ZShhc3luYyAoKSA9PiB7XG4gICAgICAgICAgZm9yIGF3YWl0IChjb25zdCBsaW5lIG9mIHRoaXMucmVhZGdlbih0aGlzLnByb2Muc3RkZXJyLCBpc0VuZGVkKSkge1xuICAgICAgICAgICAgc3RkZXJyLnB1c2gobGluZSlcbiAgICAgICAgICB9XG4gICAgICAgIH0pXG4gICAgICAgIGNvbnN0IHJlYWRPdXRwdXQgPSBhc3luYyAoKSA9PiB7XG4gICAgICAgICAgZm9yIGF3YWl0IChjb25zdCBsaW5lIG9mIHRoaXMucmVhZGdlbih0aGlzLnByb2Muc3Rkb3V0LCBpc0VuZGVkKSkge1xuICAgICAgICAgICAgZGVidWcoYEdvdCByZXNwb25zZSBmcm9tIGdoYy1tb2RpOiR7RU9MfSR7ZGF0YX1gKVxuICAgICAgICAgICAgaWYgKGxpbmUgPT09ICdPSycpIHtcbiAgICAgICAgICAgICAgZW5kZWQgPSB0cnVlXG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICBzdGRvdXQucHVzaChsaW5lKVxuICAgICAgICAgICAgfVxuICAgICAgICAgIH1cbiAgICAgICAgICByZXR1cm4ge3N0ZG91dCwgc3RkZXJyfVxuICAgICAgICB9XG4gICAgICAgIGNvbnN0IGV4aXRFdmVudCA9IGFzeW5jICgpID0+IG5ldyBQcm9taXNlPG5ldmVyPigocmVzb2x2ZSwgcmVqZWN0KSA9PiB7XG4gICAgICAgICAgdGhpcy5wcm9jLm9uY2UoJ2V4aXQnLCAoY29kZSkgPT4ge1xuICAgICAgICAgICAgd2FybihzdGRvdXQpXG4gICAgICAgICAgICByZWplY3QobWtFcnJvcignZ2hjLW1vZGkgY3Jhc2hlZCcsIGAke3N0ZG91dH1cXG5cXG4ke3N0ZGVycn1gKSlcbiAgICAgICAgICB9KVxuICAgICAgICB9KVxuICAgICAgICBjb25zdCB0aW1lb3V0RXZlbnQgPSBhc3luYyAoKSA9PiBuZXcgUHJvbWlzZTxuZXZlcj4oKHJlc29sdmUsIHJlamVjdCkgPT4ge1xuICAgICAgICAgIGNvbnN0IHRtbDogbnVtYmVyID0gYXRvbS5jb25maWcuZ2V0KCdoYXNrZWxsLWdoYy1tb2QuaW50ZXJhY3RpdmVBY3Rpb25UaW1lb3V0JylcbiAgICAgICAgICBpZiAodG1sKSB7XG4gICAgICAgICAgICBzZXRUaW1lb3V0KCgpID0+IHtcbiAgICAgICAgICAgICAgcmVqZWN0KG1rRXJyb3IoJ0ludGVyYWN0aXZlQWN0aW9uVGltZW91dCcsIGAke3N0ZG91dH1cXG5cXG4ke3N0ZGVycn1gKSlcbiAgICAgICAgICAgIH0sICAgICAgICAgdG1sICogMTAwMClcbiAgICAgICAgICB9XG4gICAgICAgIH0pXG5cbiAgICAgICAgY29uc3QgYXJnczIgPVxuICAgICAgICAgIHRoaXMuY2Fwcy5xdW90ZUFyZ3MgP1xuICAgICAgICAgICAgWydhc2NpaS1lc2NhcGUnLCBjb21tYW5kXS5jb25jYXQoYXJncy5tYXAoKHgpID0+IGBcXHgwMiR7eH1cXHgwM2ApKVxuICAgICAgICAgIDpcbiAgICAgICAgICAgIFtjb21tYW5kLCAuLi5hcmdzXVxuICAgICAgICBkZWJ1ZyhgUnVubmluZyBnaGMtbW9kaSBjb21tYW5kICR7Y29tbWFuZH1gLCAuLi5hcmdzKVxuICAgICAgICB0aGlzLnByb2Muc3RkaW4ud3JpdGUoYCR7YXJnczIuam9pbignICcpLnJlcGxhY2UoLyg/Olxccj9cXG58XFxyKS9nLCAnICcpfSR7RU9MfWApXG4gICAgICAgIGlmIChkYXRhKSB7XG4gICAgICAgICAgZGVidWcoJ1dyaXRpbmcgZGF0YSB0byBzdGRpbi4uLicpXG4gICAgICAgICAgdGhpcy5wcm9jLnN0ZGluLndyaXRlKGAke2RhdGF9JHtFT1R9YClcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gYXdhaXQgUHJvbWlzZS5yYWNlKFtyZWFkT3V0cHV0KCksIGV4aXRFdmVudCgpLCB0aW1lb3V0RXZlbnQoKV0pXG4gICAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgICBpZiAoZXJyb3IubmFtZSA9PT0gJ0ludGVyYWN0aXZlQWN0aW9uVGltZW91dCcpIHtcbiAgICAgICAgICBhd2FpdCB0aGlzLnByb2Mua2lsbCgpXG4gICAgICAgIH1cbiAgICAgICAgdGhyb3cgZXJyb3JcbiAgICAgIH0gZmluYWxseSB7XG4gICAgICAgIGRlYnVnKGBFbmRlZCBpbnRlcmFjdGl2ZSBhY3Rpb24gYmxvY2sgaW4gJHt0aGlzLmN3ZH1gKVxuICAgICAgICBlbmRlZCA9IHRydWVcbiAgICAgICAgdGhpcy5wcm9jLnN0ZG91dC5yZXN1bWUoKVxuICAgICAgICB0aGlzLnByb2Muc3RkZXJyLnJlc3VtZSgpXG4gICAgICB9XG4gICAgfSlcbiAgfVxuXG4gIHByaXZhdGUgcmVzZXRUaW1lciAoKSB7XG4gICAgaWYgKHRoaXMudGltZXIpIHtcbiAgICAgIGNsZWFyVGltZW91dCh0aGlzLnRpbWVyKVxuICAgIH1cbiAgICBjb25zdCB0bWwgPSBhdG9tLmNvbmZpZy5nZXQoJ2hhc2tlbGwtZ2hjLW1vZC5pbnRlcmFjdGl2ZUluYWN0aXZpdHlUaW1lb3V0JylcbiAgICBpZiAodG1sKSB7XG4gICAgICB0aGlzLnRpbWVyID0gc2V0VGltZW91dCgoKSA9PiB7IHRoaXMua2lsbCgpIH0sIHRtbCAqIDYwICogMTAwMClcbiAgICB9XG4gIH1cblxuICBwcml2YXRlIGFzeW5jIHdhaXRSZWFkYWJsZSAoc3RyZWFtOiBOb2RlSlMuUmVhZGFibGVTdHJlYW0pIHtcbiAgICByZXR1cm4gbmV3IFByb21pc2UoKHJlc29sdmUpID0+IHN0cmVhbS5vbmNlKCdyZWFkYWJsZScsICgpID0+IHtcbiAgICAgIHJlc29sdmUoKVxuICAgIH0pKVxuICB9XG5cbiAgcHJpdmF0ZSBhc3luYyAqcmVhZGdlbiAob3V0OiBOb2RlSlMuUmVhZGFibGVTdHJlYW0sIGlzRW5kZWQ6ICgpID0+IGJvb2xlYW4pIHtcbiAgICBsZXQgYnVmZmVyID0gJydcbiAgICB3aGlsZSAoISBpc0VuZGVkKCkpIHtcbiAgICAgIGNvbnN0IHJlYWQgPSBvdXQucmVhZCgpIGFzIChzdHJpbmcgfCBudWxsKVxuICAgICAgLy8gdHNsaW50OmRpc2FibGUtbmV4dC1saW5lOiBuby1udWxsLWtleXdvcmRcbiAgICAgIGlmIChyZWFkICE9PSBudWxsKSB7XG4gICAgICAgIGJ1ZmZlciArPSByZWFkXG4gICAgICAgIGlmIChidWZmZXIubWF0Y2goL1xcbi8pKSB7XG4gICAgICAgICAgY29uc3QgYXJyID0gYnVmZmVyLnNwbGl0KCdcXG4nKVxuICAgICAgICAgIGJ1ZmZlciA9IGFyci5wb3AoKSB8fCAnJ1xuICAgICAgICAgIHlpZWxkKiBhcnJcbiAgICAgICAgfVxuICAgICAgfSBlbHNlIHtcbiAgICAgICAgYXdhaXQgdGhpcy53YWl0UmVhZGFibGUob3V0KVxuICAgICAgfVxuICAgIH1cbiAgICBpZiAoYnVmZmVyKSB7IG91dC51bnNoaWZ0KGJ1ZmZlcikgfVxuICB9XG59XG4iXX0=