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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaW50ZXJhY3RpdmUtcHJvY2Vzcy5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uLy4uL3NyYy9naGMtbW9kL2ludGVyYWN0aXZlLXByb2Nlc3MudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7QUFBQSwrQkFBNkQ7QUFDN0Qsa0NBQW1EO0FBQ25ELDJCQUF3QjtBQUN4QixvQ0FBbUM7QUFDbkMsdUNBQXVDO0FBRXRDLE1BQWMsQ0FBQyxhQUFhLEdBQUcsTUFBTSxDQUFDLGFBQWEsSUFBSSxNQUFNLENBQUMsR0FBRyxDQUFDLHNCQUFzQixDQUFDLENBQUE7QUFjMUY7SUFVRSxZQUFZLElBQVksRUFBRSxHQUFhLEVBQUUsT0FBd0IsRUFBVSxJQUFnQjtRQUFoQixTQUFJLEdBQUosSUFBSSxDQUFZO1FBQ3pGLElBQUksQ0FBQyxJQUFJLEdBQUcsSUFBSSxDQUFBO1FBQ2hCLElBQUksQ0FBQyxXQUFXLEdBQUcsSUFBSSwwQkFBbUIsRUFBRSxDQUFBO1FBQzVDLElBQUksQ0FBQyxPQUFPLEdBQUcsSUFBSSxjQUFPLEVBQUUsQ0FBQTtRQUM1QixJQUFJLENBQUMsV0FBVyxDQUFDLEdBQUcsQ0FBQyxJQUFJLENBQUMsT0FBTyxDQUFDLENBQUE7UUFDbEMsSUFBSSxDQUFDLEdBQUcsR0FBRyxPQUFPLENBQUMsR0FBRyxDQUFBO1FBQ3RCLElBQUksQ0FBQyxZQUFZLEdBQUcsSUFBSSxLQUFLLENBQUMsQ0FBQyxFQUFFLEdBQUcsQ0FBQyxDQUFBO1FBRXJDLFlBQUssQ0FBQyxzQ0FBc0MsT0FBTyxDQUFDLEdBQUcsa0JBQWtCLEVBQUUsT0FBTyxDQUFDLENBQUE7UUFDbkYsSUFBSSxDQUFDLElBQUksR0FBRyxFQUFFLENBQUMsS0FBSyxDQUFDLElBQUksRUFBRSxHQUFHLEVBQUUsT0FBTyxDQUFDLENBQUE7UUFDeEMsSUFBSSxDQUFDLElBQUksQ0FBQyxNQUFNLENBQUMsV0FBVyxDQUFDLE9BQU8sQ0FB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LEVBQUUsQ0FBQztnQkFDbEIsTUFBTSxJQUFJLEdBQUcsR0FBRyxDQUFDLElBQUksRUFBcUIsQ0FBQTtnQkFFMUMsRUFBRSxDQUFDLENBQUMsSUFBSSxLQUFLLElBQUksQ0FBQyxDQUFDLENBQUM7b0JBQ2xCLE1BQU0sSUFBSSxJQUFJLENBQUE7b0JBQ2QsRUFBRSxDQUFDLENBQUMsTUFBTSxDQUFDLFFBQVEsQ0FBQyxRQUFHLENBQUMsQ0FBQyxDQUFDLENBQUM7d0JBQ3pCLE1BQU0sR0FBRyxHQUFHLE1BQU0sQ0FBQyxLQUFLLENBQUMsUUFBRyxDQUFDLENBQUE7d0JBQzdCLE1BQU0sR0FBRyxHQUFHLENBQUMsR0FBRyxFQUFFLElBQUksRUFBRSxDQUFBO3dCQUN4QixjQUFBLE9BQU8saUJBQUEsY0FBQSxHQUFHLENBQUEsQ0FBQSxDQUFBLENBQUE7b0JBQ1osQ0FBQztnQkFDSCxDQUFDO2dCQUFDLElBQUksQ0FBQyxDQUFDO29CQUNOLGNBQU0sSUFBSSxDQUFDLFlBQVksQ0FBQyxHQUFHLENBQUMsQ0FBQSxDQUFBO2dCQUM5QixDQUFDO1lBQ0gsQ0FBQztZQUNELEVBQUUsQ0FBQyxDQUFDLE1BQU0sQ0FBQyxDQUFDLENBQUM7Z0JBQUMsR0FBRyxDQUFDLE9BQU8sQ0FBQyxNQUFNLENBQUMsQ0FBQTtZQUFDLENBQUM7UUFDckMsQ0FBQztLQUFBO0NBQ0Y7QUExSkQsZ0RBMEpDIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IHsgVEVtaXR0ZXIsIEVtaXR0ZXIsIENvbXBvc2l0ZURpc3Bvc2FibGUgfSBmcm9tICdhdG9tJ1xuaW1wb3J0IHsgZGVidWcsIHdhcm4sIG1rRXJyb3IsIEVPVCB9IGZyb20gJy4uL3V0aWwnXG5pbXBvcnQgeyBFT0wgfSBmcm9tICdvcydcbmltcG9ydCAqIGFzIENQIGZyb20gJ2NoaWxkX3Byb2Nlc3MnXG5pbXBvcnQgUXVldWUgPSByZXF1aXJlKCdwcm9taXNlLXF1ZXVlJylcblxuKFN5bWJvbCBhcyBhbnkpLmFzeW5jSXRlcmF0b3IgPSBTeW1ib2wuYXN5bmNJdGVyYXRvciB8fCBTeW1ib2wuZm9yKCdTeW1ib2wuYXN5bmNJdGVyYXRvcicpXG5cbmV4cG9ydCBpbnRlcmZhY2UgR0hDTW9kQ2FwcyB7XG4gIHZlcnNpb246IG51bWJlcltdLFxuICBmaWxlTWFwOiBib29sZWFuLFxuICBxdW90ZUFyZ3M6IGJvb2xlYW4sXG4gIG9wdHBhcnNlOiBib29sZWFuLFxuICB0eXBlQ29uc3RyYWludHM6IGJvb2xlYW4sXG4gIGJyb3dzZVBhcmVudHM6IGJvb2xlYW4sXG4gIGludGVyYWN0aXZlQ2FzZVNwbGl0OiBib29sZWFuLFxuICBpbXBvcnRlZEZyb206IGJvb2xlYW4sXG4gIGJyb3dzZU1haW46IGJvb2xlYW5cbn1cblxuZXhwb3J0IGNsYXNzIEludGVyYWN0aXZlUHJvY2VzcyB7XG4gIHByaXZhdGUgZGlzcG9zYWJsZXM6IENvbXBvc2l0ZURpc3Bvc2FibGVcbiAgcHJpdmF0ZSBlbWl0dGVyOiBURW1pdHRlcjx7XG4gICAgJ2RpZC1leGl0JzogbnVtYmVyXG4gIH0+XG4gIHByaXZhdGUgcHJvYzogQ1AuQ2hpbGRQcm9jZXNzXG4gIHByaXZhdGUgY3dkOiBzdHJpbmdcbiAgcHJpdmF0ZSB0aW1lcjogTm9kZUpTLlRpbWVyIHwgdW5kZWZpbmVkXG4gIHByaXZhdGUgcmVxdWVzdFF1ZXVlOiBRdWV1ZVxuXG4gIGNvbnN0cnVjdG9yKHBhdGg6IHN0cmluZywgY21kOiBzdHJpbmdbXSwgb3B0aW9uczogeyBjd2Q6IHN0cmluZyB9LCBwcml2YXRlIGNhcHM6IEdIQ01vZENhcHMpIHtcbiAgICB0aGlzLmNhcHMgPSBjYXBzXG4gICAgdGhpcy5kaXNwb3NhYmxlcyA9IG5ldyBDb21wb3NpdGVEaXNwb3NhYmxlKClcbiAgICB0aGlzLmVtaXR0ZXIgPSBuZXcgRW1pdHRlcigpXG4gICAgdGhpcy5kaXNwb3NhYmxlcy5hZGQodGhpcy5lbWl0dGVyKVxuICAgIHRoaXMuY3dkID0gb3B0aW9ucy5jd2RcbiAgICB0aGlzLnJlcXVlc3RRdWV1ZSA9IG5ldyBRdWV1ZSgxLCAxMDApXG5cbiAgICBkZWJ1ZyhgU3Bhd25pbmcgbmV3IGdoYy1tb2RpIGluc3RhbmNlIGZvciAke29wdGlvbnMuY3dkfSB3aXRoIG9wdGlvbnMgPSBgLCBvcHRpb25zKVxuICAgIHRoaXMucHJvYyA9IENQLnNwYXduKHBhdGgsIGNtZCwgb3B0aW9ucylcbiAgICB0aGlzLnByb2Muc3Rkb3V0LnNldEVuY29kaW5nKCd1dGYtOCcpXG4gICAgdGhpcy5wcm9jLnN0ZGVyci5zZXRFbmNvZGluZygndXRmLTgnKVxuICAgIHRoaXMucHJvYy5zZXRNYXhMaXN0ZW5lcnMoMTAwKVxuICAgIHRoaXMucHJvYy5zdGRvdXQuc2V0TWF4TGlzdGVuZXJzKDEwMClcbiAgICB0aGlzLnByb2Muc3RkZXJyLnNldE1heExpc3RlbmVycygxMDApXG4gICAgdGhpcy5yZXNldFRpbWVyKClcbiAgICB0aGlzLnByb2Mub25jZSgnZXhpdCcsIChjb2RlKSA9PiB7XG4gICAgICB0aGlzLnRpbWVyICYmIGNsZWFyVGltZW91dCh0aGlzLnRpbWVyKVxuICAgICAgZGVidWcoYGdoYy1tb2RpIGZvciAke29wdGlvbnMuY3dkfSBlbmRlZCB3aXRoICR7Y29kZX1gKVxuICAgICAgdGhpcy5lbWl0dGVyLmVtaXQoJ2RpZC1leGl0JywgY29kZSlcbiAgICAgIHRoaXMuZGlzcG9zYWJsZXMuZGlzcG9zZSgpXG4gICAgfSlcbiAgfVxuXG4gIHB1YmxpYyBvbmNlRXhpdChhY3Rpb246IChjb2RlOiBudW1iZXIpID0+IHZvaWQpIHtcbiAgICByZXR1cm4gdGhpcy5lbWl0dGVyLm9uY2UoJ2RpZC1leGl0JywgYWN0aW9uKVxuICB9XG5cbiAgcHVibGljIGFzeW5jIGtpbGwoKTogUHJvbWlzZTxudW1iZXI+IHtcbiAgICB0aGlzLnByb2Muc3RkaW4uZW5kKClcbiAgICB0aGlzLnByb2Mua2lsbCgpXG4gICAgcmV0dXJuIG5ldyBQcm9taXNlPG51bWJlcj4oKHJlc29sdmUpID0+IHtcbiAgICAgIHRoaXMucHJvYy5vbmNlKCdleGl0JywgKGNvZGUpID0+IHJlc29sdmUoY29kZSkpXG4gICAgfSlcbiAgfVxuXG4gIHB1YmxpYyBhc3luYyBpbnRlcmFjdChcbiAgICBjb21tYW5kOiBzdHJpbmcsIGFyZ3M6IHN0cmluZ1tdLCBkYXRhPzogc3RyaW5nLFxuICApOiBQcm9taXNlPHsgc3Rkb3V0OiBzdHJpbmdbXSwgc3RkZXJyOiBzdHJpbmdbXSB9PiB7XG4gICAgcmV0dXJuIHRoaXMucmVxdWVzdFF1ZXVlLmFkZChhc3luYyAoKSA9PiB7XG4gICAgICB0aGlzLnByb2Muc3Rkb3V0LnBhdXNlKClcbiAgICAgIHRoaXMucHJvYy5zdGRlcnIucGF1c2UoKVxuXG4gICAgICBkZWJ1ZyhgU3RhcnRlZCBpbnRlcmFjdGl2ZSBhY3Rpb24gYmxvY2sgaW4gJHt0aGlzLmN3ZH1gKVxuICAgICAgZGVidWcoYFJ1bm5pbmcgaW50ZXJhY3RpdmUgY29tbWFuZCAke2NvbW1hbmR9ICR7YXJnc30gJHtkYXRhID8gJ3dpdGgnIDogJ3dpdGhvdXQnfSBhZGRpdGlvbmFsIGRhdGFgKVxuICAgICAgbGV0IGVuZGVkID0gZmFsc2VcbiAgICAgIHRyeSB7XG4gICAgICAgIGNvbnN0IGlzRW5kZWQgPSAoKSA9PiBlbmRlZFxuICAgICAgICBjb25zdCBzdGRlcnI6IHN0cmluZ1tdID0gW11cbiAgICAgICAgY29uc3Qgc3Rkb3V0OiBzdHJpbmdbXSA9IFtdXG4gICAgICAgIHNldEltbWVkaWF0ZShhc3luYyAoKSA9PiB7XG4gICAgICAgICAgZm9yIGF3YWl0IChjb25zdCBsaW5lIG9mIHRoaXMucmVhZGdlbih0aGlzLnByb2Muc3RkZXJyLCBpc0VuZGVkKSkge1xuICAgICAgICAgICAgc3RkZXJyLnB1c2gobGluZSlcbiAgICAgICAgICB9XG4gICAgICAgIH0pXG4gICAgICAgIGNvbnN0IHJlYWRPdXRwdXQgPSBhc3luYyAoKSA9PiB7XG4gICAgICAgICAgZm9yIGF3YWl0IChjb25zdCBsaW5lIG9mIHRoaXMucmVhZGdlbih0aGlzLnByb2Muc3Rkb3V0LCBpc0VuZGVkKSkge1xuICAgICAgICAgICAgZGVidWcoYEdvdCByZXNwb25zZSBmcm9tIGdoYy1tb2RpOiAke2xpbmV9YClcbiAgICAgICAgICAgIGlmIChsaW5lID09PSAnT0snKSB7XG4gICAgICAgICAgICAgIGVuZGVkID0gdHJ1ZVxuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgc3Rkb3V0LnB1c2gobGluZSlcbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9XG4gICAgICAgICAgcmV0dXJuIHsgc3Rkb3V0LCBzdGRlcnIgfVxuICAgICAgICB9XG4gICAgICAgIGNvbnN0IGV4aXRFdmVudCA9IGFzeW5jICgpID0+IG5ldyBQcm9taXNlPG5ldmVyPigocmVzb2x2ZSwgcmVqZWN0KSA9PiB7XG4gICAgICAgICAgdGhpcy5wcm9jLm9uY2UoJ2V4aXQnLCAoY29kZSkgPT4ge1xuICAgICAgICAgICAgd2FybihzdGRvdXQpXG4gICAgICAgICAgICByZWplY3QobWtFcnJvcignR0hDTW9kSW50ZXJhY3RpdmVDcmFzaCcsIGAke3N0ZG91dH1cXG5cXG4ke3N0ZGVycn1gKSlcbiAgICAgICAgICB9KVxuICAgICAgICB9KVxuICAgICAgICBjb25zdCB0aW1lb3V0RXZlbnQgPSBhc3luYyAoKSA9PiBuZXcgUHJvbWlzZTxuZXZlcj4oKHJlc29sdmUsIHJlamVjdCkgPT4ge1xuICAgICAgICAgIGNvbnN0IHRtbDogbnVtYmVyID0gYXRvbS5jb25maWcuZ2V0KCdoYXNrZWxsLWdoYy1tb2QuaW50ZXJhY3RpdmVBY3Rpb25UaW1lb3V0JylcbiAgICAgICAgICBpZiAodG1sKSB7XG4gICAgICAgICAgICBzZXRUaW1lb3V0KFxuICAgICAgICAgICAgICAoKSA9PiB7XG4gICAgICAgICAgICAgICAgcmVqZWN0KG1rRXJyb3IoJ0ludGVyYWN0aXZlQWN0aW9uVGltZW91dCcsIGAke3N0ZG91dH1cXG5cXG4ke3N0ZGVycn1gKSlcbiAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgICAgdG1sICogMTAwMCxcbiAgICAgICAgICAgIClcbiAgICAgICAgICB9XG4gICAgICAgIH0pXG5cbiAgICAgICAgY29uc3QgYXJnczIgPVxuICAgICAgICAgIHRoaXMuY2Fwcy5xdW90ZUFyZ3MgP1xuICAgICAgICAgICAgWydhc2NpaS1lc2NhcGUnLCBjb21tYW5kXS5jb25jYXQoYXJncy5tYXAoKHgpID0+IGBcXHgwMiR7eH1cXHgwM2ApKVxuICAgICAgICAgICAgOlxuICAgICAgICAgICAgW2NvbW1hbmQsIC4uLmFyZ3NdXG4gICAgICAgIGRlYnVnKGBSdW5uaW5nIGdoYy1tb2RpIGNvbW1hbmQgJHtjb21tYW5kfWAsIC4uLmFyZ3MpXG4gICAgICAgIHRoaXMucHJvYy5zdGRpbi53cml0ZShgJHthcmdzMi5qb2luKCcgJykucmVwbGFjZSgvKD86XFxyP1xcbnxcXHIpL2csICcgJyl9JHtFT0x9YClcbiAgICAgICAgaWYgKGRhdGEpIHtcbiAgICAgICAgICBkZWJ1ZygnV3JpdGluZyBkYXRhIHRvIHN0ZGluLi4uJylcbiAgICAgICAgICB0aGlzLnByb2Muc3RkaW4ud3JpdGUoYCR7ZGF0YX0ke0VPVH1gKVxuICAgICAgICB9XG4gICAgICAgIHJldHVybiBhd2FpdCBQcm9taXNlLnJhY2UoW3JlYWRPdXRwdXQoKSwgZXhpdEV2ZW50KCksIHRpbWVvdXRFdmVudCgpXSlcbiAgICAgIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgICAgIGlmIChlcnJvci5uYW1lID09PSAnSW50ZXJhY3RpdmVBY3Rpb25UaW1lb3V0Jykge1xuICAgICAgICAgIHRoaXMucHJvYy5raWxsKClcbiAgICAgICAgfVxuICAgICAgICB0aHJvdyBlcnJvclxuICAgICAgfSBmaW5hbGx5IHtcbiAgICAgICAgZGVidWcoYEVuZGVkIGludGVyYWN0aXZlIGFjdGlvbiBibG9jayBpbiAke3RoaXMuY3dkfWApXG4gICAgICAgIGVuZGVkID0gdHJ1ZVxuICAgICAgICB0aGlzLnByb2Muc3Rkb3V0LnJlc3VtZSgpXG4gICAgICAgIHRoaXMucHJvYy5zdGRlcnIucmVzdW1lKClcbiAgICAgIH1cbiAgICB9KVxuICB9XG5cbiAgcHJpdmF0ZSByZXNldFRpbWVyKCkge1xuICAgIGlmICh0aGlzLnRpbWVyKSB7XG4gICAgICBjbGVhclRpbWVvdXQodGhpcy50aW1lcilcbiAgICB9XG4gICAgY29uc3QgdG1sID0gYXRvbS5jb25maWcuZ2V0KCdoYXNrZWxsLWdoYy1tb2QuaW50ZXJhY3RpdmVJbmFjdGl2aXR5VGltZW91dCcpXG4gICAgaWYgKHRtbCkge1xuICAgICAgdGhpcy50aW1lciA9IHNldFRpbWVvdXQoKCkgPT4geyB0aGlzLmtpbGwoKSB9LCB0bWwgKiA2MCAqIDEwMDApXG4gICAgfVxuICB9XG5cbiAgcHJpdmF0ZSBhc3luYyB3YWl0UmVhZGFibGUoc3RyZWFtOiBOb2RlSlMuUmVhZGFibGVTdHJlYW0pIHtcbiAgICByZXR1cm4gbmV3IFByb21pc2UoKHJlc29sdmUpID0+IHN0cmVhbS5vbmNlKCdyZWFkYWJsZScsICgpID0+IHtcbiAgICAgIHJlc29sdmUoKVxuICAgIH0pKVxuICB9XG5cbiAgcHJpdmF0ZSBhc3luYyAqcmVhZGdlbihvdXQ6IE5vZGVKUy5SZWFkYWJsZVN0cmVhbSwgaXNFbmRlZDogKCkgPT4gYm9vbGVhbikge1xuICAgIGxldCBidWZmZXIgPSAnJ1xuICAgIHdoaWxlICghaXNFbmRlZCgpKSB7XG4gICAgICBjb25zdCByZWFkID0gb3V0LnJlYWQoKSBhcyAoc3RyaW5nIHwgbnVsbClcbiAgICAgIC8vIHRzbGludDpkaXNhYmxlLW5leHQtbGluZTogbm8tbnVsbC1rZXl3b3JkXG4gICAgICBpZiAocmVhZCAhPT0gbnVsbCkge1xuICAgICAgICBidWZmZXIgKz0gcmVhZFxuICAgICAgICBpZiAoYnVmZmVyLmluY2x1ZGVzKEVPTCkpIHtcbiAgICAgICAgICBjb25zdCBhcnIgPSBidWZmZXIuc3BsaXQoRU9MKVxuICAgICAgICAgIGJ1ZmZlciA9IGFyci5wb3AoKSB8fCAnJ1xuICAgICAgICAgIHlpZWxkKiBhcnJcbiAgICAgICAgfVxuICAgICAgfSBlbHNlIHtcbiAgICAgICAgYXdhaXQgdGhpcy53YWl0UmVhZGFibGUob3V0KVxuICAgICAgfVxuICAgIH1cbiAgICBpZiAoYnVmZmVyKSB7IG91dC51bnNoaWZ0KGJ1ZmZlcikgfVxuICB9XG59XG4iXX0=