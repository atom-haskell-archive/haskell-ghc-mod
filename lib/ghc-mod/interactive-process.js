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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaW50ZXJhY3RpdmUtcHJvY2Vzcy5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uLy4uL3NyYy9naGMtbW9kL2ludGVyYWN0aXZlLXByb2Nlc3MudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7QUFBQSwrQkFBbUQ7QUFDbkQsa0NBQW1EO0FBQ25ELDJCQUF3QjtBQUN4QixvQ0FBbUM7QUFDbkMsdUNBQXVDO0FBY3ZDO0lBVUUsWUFBYSxJQUFZLEVBQUUsR0FBYSxFQUFFLE9BQXNCLEVBQVUsSUFBZ0I7UUFBaEIsU0FBSSxHQUFKLElBQUksQ0FBWTtRQUN4RixJQUFJLENBQUMsSUFBSSxHQUFHLElBQUksQ0FBQTtRQUNoQixJQUFJLENBQUMsV0FBVyxHQUFHLElBQUksMEJBQW1CLEVBQUUsQ0FBQTtRQUM1QyxJQUFJLENBQUMsT0FBTyxHQUFHLElBQUksY0FBTyxFQUFFLENBQUE7UUFDNUIsSUFBSSxDQUFDLFdBQVcsQ0FBQyxHQUFHLENBQUMsSUFBSSxDQUFDLE9BQU8sQ0FBQyxDQUFBO1FBQ2xDLElBQUksQ0FBQyxHQUFHLEdBQUcsT0FBTyxDQUFDLEdBQUcsQ0FBQTtRQUN0QixJQUFJLENBQUMsWUFBWSxHQUFHLElBQUksS0FBSyxDQUFDLENBQUMsRUFBRSxHQUFHLENBQUMsQ0FBQTtRQUVyQyxZQUFLLENBQUMsc0NBQXNDLE9BQU8sQ0FBQyxHQUFHLGtCQUFrQixFQUFFLE9BQU8sQ0FBQyxDQUFBO1FBQ25GLElBQUksQ0FBQyxJQUFJLEdBQUcsRUFBRSxDQUFDLEtBQUssQ0FBQyxJQUFJLEVBQUUsR0FBRyxFQUFFLE9BQU8sQ0FBQyxDQUFBO1FBQ3hDLElBQUksQ0FBQyxJQUFJLENBQUMsTUFBTSxDQUFDLFdBQVcsQ0FBQyxPQUFPLENBQUMsQ0FBQTtRQUNyQyxJQUFJLENBQUMsSUFBSSxDQUFDLE1BQU0sQ0FBQyxXQUFXLENBQUMsT0FBTyxDQUFDLENBQUE7UUFDckMsSUFBSSxDQUFD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QUFDLElBQUksS0FBSyxJQUFJLENBQUMsQ0FBQyxDQUFDO29CQUNsQixNQUFNLElBQUksSUFBSSxDQUFBO29CQUNkLEVBQUUsQ0FBQyxDQUFDLE1BQU0sQ0FBQyxRQUFRLENBQUMsUUFBRyxDQUFDLENBQUMsQ0FBQyxDQUFDO3dCQUN6QixNQUFNLEdBQUcsR0FBRyxNQUFNLENBQUMsS0FBSyxDQUFDLFFBQUcsQ0FBQyxDQUFBO3dCQUM3QixNQUFNLEdBQUcsR0FBRyxDQUFDLEdBQUcsRUFBRSxJQUFJLEVBQUUsQ0FBQTt3QkFDeEIsY0FBQSxPQUFPLGlCQUFBLGNBQUEsR0FBRyxDQUFBLENBQUEsQ0FBQSxDQUFBO29CQUNaLENBQUM7Z0JBQ0gsQ0FBQztnQkFBQyxJQUFJLENBQUMsQ0FBQztvQkFDTixjQUFNLElBQUksQ0FBQyxZQUFZLENBQUMsR0FBRyxDQUFDLENBQUEsQ0FBQTtnQkFDOUIsQ0FBQztZQUNILENBQUM7WUFDRCxFQUFFLENBQUMsQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDO2dCQUFDLEdBQUcsQ0FBQyxPQUFPLENBQUMsTUFBTSxDQUFDLENBQUE7WUFBQyxDQUFDO1FBQ3JDLENBQUM7S0FBQTtDQUNGO0FBdkpELGdEQXVKQyIsInNvdXJjZXNDb250ZW50IjpbImltcG9ydCB7IEVtaXR0ZXIsIENvbXBvc2l0ZURpc3Bvc2FibGUgfSBmcm9tICdhdG9tJ1xuaW1wb3J0IHsgZGVidWcsIHdhcm4sIG1rRXJyb3IsIEVPVCB9IGZyb20gJy4uL3V0aWwnXG5pbXBvcnQgeyBFT0wgfSBmcm9tICdvcydcbmltcG9ydCAqIGFzIENQIGZyb20gJ2NoaWxkX3Byb2Nlc3MnXG5pbXBvcnQgUXVldWUgPSByZXF1aXJlKCdwcm9taXNlLXF1ZXVlJylcblxuZXhwb3J0IGludGVyZmFjZSBHSENNb2RDYXBzIHtcbiAgdmVyc2lvbjogbnVtYmVyW10sXG4gIGZpbGVNYXA6IGJvb2xlYW4sXG4gIHF1b3RlQXJnczogYm9vbGVhbixcbiAgb3B0cGFyc2U6IGJvb2xlYW4sXG4gIHR5cGVDb25zdHJhaW50czogYm9vbGVhbixcbiAgYnJvd3NlUGFyZW50czogYm9vbGVhbixcbiAgaW50ZXJhY3RpdmVDYXNlU3BsaXQ6IGJvb2xlYW4sXG4gIGltcG9ydGVkRnJvbTogYm9vbGVhbixcbiAgYnJvd3NlTWFpbjogYm9vbGVhblxufVxuXG5leHBvcnQgY2xhc3MgSW50ZXJhY3RpdmVQcm9jZXNzIHtcbiAgcHJpdmF0ZSBkaXNwb3NhYmxlczogQ29tcG9zaXRlRGlzcG9zYWJsZVxuICBwcml2YXRlIGVtaXR0ZXI6IE15RW1pdHRlcjx7XG4gICAgJ2RpZC1leGl0JzogbnVtYmVyXG4gIH0+XG4gIHByaXZhdGUgcHJvYzogQ1AuQ2hpbGRQcm9jZXNzXG4gIHByaXZhdGUgY3dkOiBzdHJpbmdcbiAgcHJpdmF0ZSB0aW1lcjogTm9kZUpTLlRpbWVyXG4gIHByaXZhdGUgcmVxdWVzdFF1ZXVlOiBRdWV1ZVxuXG4gIGNvbnN0cnVjdG9yIChwYXRoOiBzdHJpbmcsIGNtZDogc3RyaW5nW10sIG9wdGlvbnM6IHtjd2Q6IHN0cmluZ30sIHByaXZhdGUgY2FwczogR0hDTW9kQ2Fwcykge1xuICAgIHRoaXMuY2FwcyA9IGNhcHNcbiAgICB0aGlzLmRpc3Bvc2FibGVzID0gbmV3IENvbXBvc2l0ZURpc3Bvc2FibGUoKVxuICAgIHRoaXMuZW1pdHRlciA9IG5ldyBFbWl0dGVyKClcbiAgICB0aGlzLmRpc3Bvc2FibGVzLmFkZCh0aGlzLmVtaXR0ZXIpXG4gICAgdGhpcy5jd2QgPSBvcHRpb25zLmN3ZFxuICAgIHRoaXMucmVxdWVzdFF1ZXVlID0gbmV3IFF1ZXVlKDEsIDEwMClcblxuICAgIGRlYnVnKGBTcGF3bmluZyBuZXcgZ2hjLW1vZGkgaW5zdGFuY2UgZm9yICR7b3B0aW9ucy5jd2R9IHdpdGggb3B0aW9ucyA9IGAsIG9wdGlvbnMpXG4gICAgdGhpcy5wcm9jID0gQ1Auc3Bhd24ocGF0aCwgY21kLCBvcHRpb25zKVxuICAgIHRoaXMucHJvYy5zdGRvdXQuc2V0RW5jb2RpbmcoJ3V0Zi04JylcbiAgICB0aGlzLnByb2Muc3RkZXJyLnNldEVuY29kaW5nKCd1dGYtOCcpXG4gICAgdGhpcy5wcm9jLnNldE1heExpc3RlbmVycygxMDApXG4gICAgdGhpcy5wcm9jLnN0ZG91dC5zZXRNYXhMaXN0ZW5lcnMoMTAwKVxuICAgIHRoaXMucHJvYy5zdGRlcnIuc2V0TWF4TGlzdGVuZXJzKDEwMClcbiAgICB0aGlzLnJlc2V0VGltZXIoKVxuICAgIHRoaXMucHJvYy5vbmNlKCdleGl0JywgKGNvZGUpID0+IHtcbiAgICAgIHRoaXMudGltZXIgJiYgY2xlYXJUaW1lb3V0KHRoaXMudGltZXIpXG4gICAgICBkZWJ1ZyhgZ2hjLW1vZGkgZm9yICR7b3B0aW9ucy5jd2R9IGVuZGVkIHdpdGggJHtjb2RlfWApXG4gICAgICB0aGlzLmVtaXR0ZXIuZW1pdCgnZGlkLWV4aXQnLCBjb2RlKVxuICAgICAgdGhpcy5kaXNwb3NhYmxlcy5kaXNwb3NlKClcbiAgICB9KVxuICB9XG5cbiAgcHVibGljIG9uY2VFeGl0IChhY3Rpb246IChjb2RlOiBudW1iZXIpID0+IHZvaWQpIHtcbiAgICByZXR1cm4gdGhpcy5lbWl0dGVyLm9uY2UoJ2RpZC1leGl0JywgYWN0aW9uKVxuICB9XG5cbiAgcHVibGljIGFzeW5jIGtpbGwgKCk6IFByb21pc2U8bnVtYmVyPiB7XG4gICAgdGhpcy5wcm9jLnN0ZGluLmVuZCgpXG4gICAgdGhpcy5wcm9jLmtpbGwoKVxuICAgIHJldHVybiBuZXcgUHJvbWlzZTxudW1iZXI+KChyZXNvbHZlKSA9PiB7XG4gICAgICB0aGlzLnByb2Mub25jZSgnZXhpdCcsIChjb2RlKSA9PiByZXNvbHZlKGNvZGUpKVxuICAgIH0pXG4gIH1cblxuICBwdWJsaWMgYXN5bmMgaW50ZXJhY3QgKFxuICAgIGNvbW1hbmQ6IHN0cmluZywgYXJnczogc3RyaW5nW10sIGRhdGE/OiBzdHJpbmdcbiAgKTogUHJvbWlzZTx7c3Rkb3V0OiBzdHJpbmdbXSwgc3RkZXJyOiBzdHJpbmdbXX0+IHtcbiAgICByZXR1cm4gdGhpcy5yZXF1ZXN0UXVldWUuYWRkKGFzeW5jICgpID0+IHtcbiAgICAgIHRoaXMucHJvYy5zdGRvdXQucGF1c2UoKVxuICAgICAgdGhpcy5wcm9jLnN0ZGVyci5wYXVzZSgpXG5cbiAgICAgIGRlYnVnKGBTdGFydGVkIGludGVyYWN0aXZlIGFjdGlvbiBibG9jayBpbiAke3RoaXMuY3dkfWApXG4gICAgICBkZWJ1ZyhgUnVubmluZyBpbnRlcmFjdGl2ZSBjb21tYW5kICR7Y29tbWFuZH0gJHthcmdzfSAke2RhdGEgPyAnd2l0aCcgOiAnd2l0aG91dCd9IGFkZGl0aW9uYWwgZGF0YWApXG4gICAgICBsZXQgZW5kZWQgPSBmYWxzZVxuICAgICAgdHJ5IHtcbiAgICAgICAgY29uc3QgaXNFbmRlZCA9ICgpID0+IGVuZGVkXG4gICAgICAgIGNvbnN0IHN0ZGVycjogc3RyaW5nW10gPSBbXVxuICAgICAgICBjb25zdCBzdGRvdXQ6IHN0cmluZ1tdID0gW11cbiAgICAgICAgc2V0SW1tZWRpYXRlKGFzeW5jICgpID0+IHtcbiAgICAgICAgICBmb3IgYXdhaXQgKGNvbnN0IGxpbmUgb2YgdGhpcy5yZWFkZ2VuKHRoaXMucHJvYy5zdGRlcnIsIGlzRW5kZWQpKSB7XG4gICAgICAgICAgICBzdGRlcnIucHVzaChsaW5lKVxuICAgICAgICAgIH1cbiAgICAgICAgfSlcbiAgICAgICAgY29uc3QgcmVhZE91dHB1dCA9IGFzeW5jICgpID0+IHtcbiAgICAgICAgICBmb3IgYXdhaXQgKGNvbnN0IGxpbmUgb2YgdGhpcy5yZWFkZ2VuKHRoaXMucHJvYy5zdGRvdXQsIGlzRW5kZWQpKSB7XG4gICAgICAgICAgICBkZWJ1ZyhgR290IHJlc3BvbnNlIGZyb20gZ2hjLW1vZGk6ICR7bGluZX1gKVxuICAgICAgICAgICAgaWYgKGxpbmUgPT09ICdPSycpIHtcbiAgICAgICAgICAgICAgZW5kZWQgPSB0cnVlXG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICBzdGRvdXQucHVzaChsaW5lKVxuICAgICAgICAgICAgfVxuICAgICAgICAgIH1cbiAgICAgICAgICByZXR1cm4ge3N0ZG91dCwgc3RkZXJyfVxuICAgICAgICB9XG4gICAgICAgIGNvbnN0IGV4aXRFdmVudCA9IGFzeW5jICgpID0+IG5ldyBQcm9taXNlPG5ldmVyPigocmVzb2x2ZSwgcmVqZWN0KSA9PiB7XG4gICAgICAgICAgdGhpcy5wcm9jLm9uY2UoJ2V4aXQnLCAoY29kZSkgPT4ge1xuICAgICAgICAgICAgd2FybihzdGRvdXQpXG4gICAgICAgICAgICByZWplY3QobWtFcnJvcignR0hDTW9kSW50ZXJhY3RpdmVDcmFzaCcsIGAke3N0ZG91dH1cXG5cXG4ke3N0ZGVycn1gKSlcbiAgICAgICAgICB9KVxuICAgICAgICB9KVxuICAgICAgICBjb25zdCB0aW1lb3V0RXZlbnQgPSBhc3luYyAoKSA9PiBuZXcgUHJvbWlzZTxuZXZlcj4oKHJlc29sdmUsIHJlamVjdCkgPT4ge1xuICAgICAgICAgIGNvbnN0IHRtbDogbnVtYmVyID0gYXRvbS5jb25maWcuZ2V0KCdoYXNrZWxsLWdoYy1tb2QuaW50ZXJhY3RpdmVBY3Rpb25UaW1lb3V0JylcbiAgICAgICAgICBpZiAodG1sKSB7XG4gICAgICAgICAgICBzZXRUaW1lb3V0KCgpID0+IHtcbiAgICAgICAgICAgICAgcmVqZWN0KG1rRXJyb3IoJ0ludGVyYWN0aXZlQWN0aW9uVGltZW91dCcsIGAke3N0ZG91dH1cXG5cXG4ke3N0ZGVycn1gKSlcbiAgICAgICAgICAgIH0sICAgICAgICAgdG1sICogMTAwMClcbiAgICAgICAgICB9XG4gICAgICAgIH0pXG5cbiAgICAgICAgY29uc3QgYXJnczIgPVxuICAgICAgICAgIHRoaXMuY2Fwcy5xdW90ZUFyZ3MgP1xuICAgICAgICAgICAgWydhc2NpaS1lc2NhcGUnLCBjb21tYW5kXS5jb25jYXQoYXJncy5tYXAoKHgpID0+IGBcXHgwMiR7eH1cXHgwM2ApKVxuICAgICAgICAgIDpcbiAgICAgICAgICAgIFtjb21tYW5kLCAuLi5hcmdzXVxuICAgICAgICBkZWJ1ZyhgUnVubmluZyBnaGMtbW9kaSBjb21tYW5kICR7Y29tbWFuZH1gLCAuLi5hcmdzKVxuICAgICAgICB0aGlzLnByb2Muc3RkaW4ud3JpdGUoYCR7YXJnczIuam9pbignICcpLnJlcGxhY2UoLyg/Olxccj9cXG58XFxyKS9nLCAnICcpfSR7RU9MfWApXG4gICAgICAgIGlmIChkYXRhKSB7XG4gICAgICAgICAgZGVidWcoJ1dyaXRpbmcgZGF0YSB0byBzdGRpbi4uLicpXG4gICAgICAgICAgdGhpcy5wcm9jLnN0ZGluLndyaXRlKGAke2RhdGF9JHtFT1R9YClcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gYXdhaXQgUHJvbWlzZS5yYWNlKFtyZWFkT3V0cHV0KCksIGV4aXRFdmVudCgpLCB0aW1lb3V0RXZlbnQoKV0pXG4gICAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgICBpZiAoZXJyb3IubmFtZSA9PT0gJ0ludGVyYWN0aXZlQWN0aW9uVGltZW91dCcpIHtcbiAgICAgICAgICBhd2FpdCB0aGlzLnByb2Mua2lsbCgpXG4gICAgICAgIH1cbiAgICAgICAgdGhyb3cgZXJyb3JcbiAgICAgIH0gZmluYWxseSB7XG4gICAgICAgIGRlYnVnKGBFbmRlZCBpbnRlcmFjdGl2ZSBhY3Rpb24gYmxvY2sgaW4gJHt0aGlzLmN3ZH1gKVxuICAgICAgICBlbmRlZCA9IHRydWVcbiAgICAgICAgdGhpcy5wcm9jLnN0ZG91dC5yZXN1bWUoKVxuICAgICAgICB0aGlzLnByb2Muc3RkZXJyLnJlc3VtZSgpXG4gICAgICB9XG4gICAgfSlcbiAgfVxuXG4gIHByaXZhdGUgcmVzZXRUaW1lciAoKSB7XG4gICAgaWYgKHRoaXMudGltZXIpIHtcbiAgICAgIGNsZWFyVGltZW91dCh0aGlzLnRpbWVyKVxuICAgIH1cbiAgICBjb25zdCB0bWwgPSBhdG9tLmNvbmZpZy5nZXQoJ2hhc2tlbGwtZ2hjLW1vZC5pbnRlcmFjdGl2ZUluYWN0aXZpdHlUaW1lb3V0JylcbiAgICBpZiAodG1sKSB7XG4gICAgICB0aGlzLnRpbWVyID0gc2V0VGltZW91dCgoKSA9PiB7IHRoaXMua2lsbCgpIH0sIHRtbCAqIDYwICogMTAwMClcbiAgICB9XG4gIH1cblxuICBwcml2YXRlIGFzeW5jIHdhaXRSZWFkYWJsZSAoc3RyZWFtOiBOb2RlSlMuUmVhZGFibGVTdHJlYW0pIHtcbiAgICByZXR1cm4gbmV3IFByb21pc2UoKHJlc29sdmUpID0+IHN0cmVhbS5vbmNlKCdyZWFkYWJsZScsICgpID0+IHtcbiAgICAgIHJlc29sdmUoKVxuICAgIH0pKVxuICB9XG5cbiAgcHJpdmF0ZSBhc3luYyAqcmVhZGdlbiAob3V0OiBOb2RlSlMuUmVhZGFibGVTdHJlYW0sIGlzRW5kZWQ6ICgpID0+IGJvb2xlYW4pIHtcbiAgICBsZXQgYnVmZmVyID0gJydcbiAgICB3aGlsZSAoISBpc0VuZGVkKCkpIHtcbiAgICAgIGNvbnN0IHJlYWQgPSBvdXQucmVhZCgpIGFzIChzdHJpbmcgfCBudWxsKVxuICAgICAgLy8gdHNsaW50OmRpc2FibGUtbmV4dC1saW5lOiBuby1udWxsLWtleXdvcmRcbiAgICAgIGlmIChyZWFkICE9PSBudWxsKSB7XG4gICAgICAgIGJ1ZmZlciArPSByZWFkXG4gICAgICAgIGlmIChidWZmZXIuaW5jbHVkZXMoRU9MKSkge1xuICAgICAgICAgIGNvbnN0IGFyciA9IGJ1ZmZlci5zcGxpdChFT0wpXG4gICAgICAgICAgYnVmZmVyID0gYXJyLnBvcCgpIHx8ICcnXG4gICAgICAgICAgeWllbGQqIGFyclxuICAgICAgICB9XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBhd2FpdCB0aGlzLndhaXRSZWFkYWJsZShvdXQpXG4gICAgICB9XG4gICAgfVxuICAgIGlmIChidWZmZXIpIHsgb3V0LnVuc2hpZnQoYnVmZmVyKSB9XG4gIH1cbn1cbiJdfQ==