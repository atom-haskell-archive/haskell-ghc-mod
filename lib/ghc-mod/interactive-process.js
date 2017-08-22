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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaW50ZXJhY3RpdmUtcHJvY2Vzcy5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uLy4uL3NyYy9naGMtbW9kL2ludGVyYWN0aXZlLXByb2Nlc3MudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7QUFBQSwrQkFBNkQ7QUFDN0Qsa0NBQW1EO0FBQ25ELDJCQUF3QjtBQUN4QixvQ0FBbUM7QUFDbkMsdUNBQXVDO0FBRXRDLE1BQWMsQ0FBQyxhQUFhLEdBQUcsTUFBTSxDQUFDLGFBQWEsSUFBSSxNQUFNLENBQUMsR0FBRyxDQUFDLHNCQUFzQixDQUFDLENBQUE7QUFjMUY7SUFVRSxZQUFZLElBQVksRUFBRSxHQUFhLEVBQUUsT0FBd0IsRUFBVSxJQUFnQjtRQUFoQixTQUFJLEdBQUosSUFBSSxDQUFZO1FBQ3pGLElBQUksQ0FBQyxJQUFJLEdBQUcsSUFBSSxDQUFBO1FBQ2hCLElBQUksQ0FBQyxXQUFXLEdBQUcsSUFBSSwwQkFBbUIsRUFBRSxDQUFBO1FBQzVDLElBQUksQ0FBQyxPQUFPLEdBQUcsSUFBSSxjQUFPLEVBQUUsQ0FBQTtRQUM1QixJQUFJLENBQUMsV0FBVyxDQUFDLEdBQUcsQ0FBQyxJQUFJLENBQUMsT0FBTyxDQUFDLENBQUE7UUFDbEMsSUFBSSxDQUFDLEdBQUcsR0FBRyxPQUFPLENBQUMsR0FBRyxDQUFBO1FBQ3RCLElBQUksQ0FBQyxZQUFZLEdBQUcsSUFBSSxLQUFLLENBQUMsQ0FBQyxFQUFFLEdBQUcsQ0FBQyxDQUFBO1FBRXJDLFlBQUssQ0FBQyxzQ0FBc0MsT0FBTyxDQUFDLEdBQUcsa0JBQWtCLEVBQUUsT0FBTyxDQUFDLENBQUE7UUFDbkYsSUFBSSxDQUFDLElBQUksR0FBRyxFQUFFLENBQUMsS0FBSyxDQUFDLElBQUksRUFBRSxHQUFHLEVBQUUsT0FBTyxDQUFDLENBQUE7UUFDeEMsSUFBSSxDQUFDLElBQUksQ0FBQyxNQUFNLENBQUMsV0FBVyxDQUFDLE9BQU8sQ0FB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QTtZQUNmLE9BQU8sQ0FBQyxPQUFPLEVBQUUsRUFBRSxDQUFDO2dCQUNsQixNQUFNLElBQUksR0FBRyxHQUFHLENBQUMsSUFBSSxFQUFxQixDQUFBO2dCQUUxQyxFQUFFLENBQUMsQ0FBQyxJQUFJLEtBQUssSUFBSSxDQUFDLENBQUMsQ0FBQztvQkFDbEIsTUFBTSxJQUFJLElBQUksQ0FBQTtvQkFDZCxFQUFFLENBQUMsQ0FBQyxNQUFNLENBQUMsUUFBUSxDQUFDLFFBQUcsQ0FBQyxDQUFDLENBQUMsQ0FBQzt3QkFDekIsTUFBTSxHQUFHLEdBQUcsTUFBTSxDQUFDLEtBQUssQ0FBQyxRQUFHLENBQUMsQ0FBQTt3QkFDN0IsTUFBTSxHQUFHLEdBQUcsQ0FBQyxHQUFHLEVBQUUsSUFBSSxFQUFFLENBQUE7d0JBQ3hCLGNBQUEsT0FBTyxpQkFBQSxjQUFBLEdBQUcsQ0FBQSxDQUFBLENBQUEsQ0FBQTtvQkFDWixDQUFDO2dCQUNILENBQUM7Z0JBQUMsSUFBSSxDQUFDLENBQUM7b0JBQ04sY0FBTSxJQUFJLENBQUMsWUFBWSxDQUFDLEdBQUcsQ0FBQyxDQUFBLENBQUE7Z0JBQzlCLENBQUM7WUFDSCxDQUFDO1lBQ0QsRUFBRSxDQUFDLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQztnQkFBQyxHQUFHLENBQUMsT0FBTyxDQUFDLE1BQU0sQ0FBQyxDQUFBO1lBQUMsQ0FBQztRQUNyQyxDQUFDO0tBQUE7Q0FDRjtBQTFKRCxnREEwSkMiLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgeyBURW1pdHRlciwgRW1pdHRlciwgQ29tcG9zaXRlRGlzcG9zYWJsZSB9IGZyb20gJ2F0b20nXG5pbXBvcnQgeyBkZWJ1Zywgd2FybiwgbWtFcnJvciwgRU9UIH0gZnJvbSAnLi4vdXRpbCdcbmltcG9ydCB7IEVPTCB9IGZyb20gJ29zJ1xuaW1wb3J0ICogYXMgQ1AgZnJvbSAnY2hpbGRfcHJvY2VzcydcbmltcG9ydCBRdWV1ZSA9IHJlcXVpcmUoJ3Byb21pc2UtcXVldWUnKVxuXG4oU3ltYm9sIGFzIGFueSkuYXN5bmNJdGVyYXRvciA9IFN5bWJvbC5hc3luY0l0ZXJhdG9yIHx8IFN5bWJvbC5mb3IoJ1N5bWJvbC5hc3luY0l0ZXJhdG9yJylcblxuZXhwb3J0IGludGVyZmFjZSBHSENNb2RDYXBzIHtcbiAgdmVyc2lvbjogbnVtYmVyW10sXG4gIGZpbGVNYXA6IGJvb2xlYW4sXG4gIHF1b3RlQXJnczogYm9vbGVhbixcbiAgb3B0cGFyc2U6IGJvb2xlYW4sXG4gIHR5cGVDb25zdHJhaW50czogYm9vbGVhbixcbiAgYnJvd3NlUGFyZW50czogYm9vbGVhbixcbiAgaW50ZXJhY3RpdmVDYXNlU3BsaXQ6IGJvb2xlYW4sXG4gIGltcG9ydGVkRnJvbTogYm9vbGVhbixcbiAgYnJvd3NlTWFpbjogYm9vbGVhblxufVxuXG5leHBvcnQgY2xhc3MgSW50ZXJhY3RpdmVQcm9jZXNzIHtcbiAgcHJpdmF0ZSBkaXNwb3NhYmxlczogQ29tcG9zaXRlRGlzcG9zYWJsZVxuICBwcml2YXRlIGVtaXR0ZXI6IFRFbWl0dGVyPHtcbiAgICAnZGlkLWV4aXQnOiBudW1iZXJcbiAgfT5cbiAgcHJpdmF0ZSBwcm9jOiBDUC5DaGlsZFByb2Nlc3NcbiAgcHJpdmF0ZSBjd2Q6IHN0cmluZ1xuICBwcml2YXRlIHRpbWVyOiBOb2RlSlMuVGltZXIgfCB1bmRlZmluZWRcbiAgcHJpdmF0ZSByZXF1ZXN0UXVldWU6IFF1ZXVlXG5cbiAgY29uc3RydWN0b3IocGF0aDogc3RyaW5nLCBjbWQ6IHN0cmluZ1tdLCBvcHRpb25zOiB7IGN3ZDogc3RyaW5nIH0sIHByaXZhdGUgY2FwczogR0hDTW9kQ2Fwcykge1xuICAgIHRoaXMuY2FwcyA9IGNhcHNcbiAgICB0aGlzLmRpc3Bvc2FibGVzID0gbmV3IENvbXBvc2l0ZURpc3Bvc2FibGUoKVxuICAgIHRoaXMuZW1pdHRlciA9IG5ldyBFbWl0dGVyKClcbiAgICB0aGlzLmRpc3Bvc2FibGVzLmFkZCh0aGlzLmVtaXR0ZXIpXG4gICAgdGhpcy5jd2QgPSBvcHRpb25zLmN3ZFxuICAgIHRoaXMucmVxdWVzdFF1ZXVlID0gbmV3IFF1ZXVlKDEsIDEwMClcblxuICAgIGRlYnVnKGBTcGF3bmluZyBuZXcgZ2hjLW1vZGkgaW5zdGFuY2UgZm9yICR7b3B0aW9ucy5jd2R9IHdpdGggb3B0aW9ucyA9IGAsIG9wdGlvbnMpXG4gICAgdGhpcy5wcm9jID0gQ1Auc3Bhd24ocGF0aCwgY21kLCBvcHRpb25zKVxuICAgIHRoaXMucHJvYy5zdGRvdXQuc2V0RW5jb2RpbmcoJ3V0Zi04JylcbiAgICB0aGlzLnByb2Muc3RkZXJyLnNldEVuY29kaW5nKCd1dGYtOCcpXG4gICAgdGhpcy5wcm9jLnNldE1heExpc3RlbmVycygxMDApXG4gICAgdGhpcy5wcm9jLnN0ZG91dC5zZXRNYXhMaXN0ZW5lcnMoMTAwKVxuICAgIHRoaXMucHJvYy5zdGRlcnIuc2V0TWF4TGlzdGVuZXJzKDEwMClcbiAgICB0aGlzLnJlc2V0VGltZXIoKVxuICAgIHRoaXMucHJvYy5vbmNlKCdleGl0JywgKGNvZGUpID0+IHtcbiAgICAgIHRoaXMudGltZXIgJiYgY2xlYXJUaW1lb3V0KHRoaXMudGltZXIpXG4gICAgICBkZWJ1ZyhgZ2hjLW1vZGkgZm9yICR7b3B0aW9ucy5jd2R9IGVuZGVkIHdpdGggJHtjb2RlfWApXG4gICAgICB0aGlzLmVtaXR0ZXIuZW1pdCgnZGlkLWV4aXQnLCBjb2RlKVxuICAgICAgdGhpcy5kaXNwb3NhYmxlcy5kaXNwb3NlKClcbiAgICB9KVxuICB9XG5cbiAgcHVibGljIG9uY2VFeGl0KGFjdGlvbjogKGNvZGU6IG51bWJlcikgPT4gdm9pZCkge1xuICAgIHJldHVybiB0aGlzLmVtaXR0ZXIub25jZSgnZGlkLWV4aXQnLCBhY3Rpb24pXG4gIH1cblxuICBwdWJsaWMgYXN5bmMga2lsbCgpOiBQcm9taXNlPG51bWJlcj4ge1xuICAgIHRoaXMucHJvYy5zdGRpbi5lbmQoKVxuICAgIHRoaXMucHJvYy5raWxsKClcbiAgICByZXR1cm4gbmV3IFByb21pc2U8bnVtYmVyPigocmVzb2x2ZSkgPT4ge1xuICAgICAgdGhpcy5wcm9jLm9uY2UoJ2V4aXQnLCAoY29kZSkgPT4gcmVzb2x2ZShjb2RlKSlcbiAgICB9KVxuICB9XG5cbiAgcHVibGljIGFzeW5jIGludGVyYWN0KFxuICAgIGNvbW1hbmQ6IHN0cmluZywgYXJnczogc3RyaW5nW10sIGRhdGE/OiBzdHJpbmcsXG4gICk6IFByb21pc2U8eyBzdGRvdXQ6IHN0cmluZ1tdLCBzdGRlcnI6IHN0cmluZ1tdIH0+IHtcbiAgICByZXR1cm4gdGhpcy5yZXF1ZXN0UXVldWUuYWRkKGFzeW5jICgpID0+IHtcbiAgICAgIHRoaXMucHJvYy5zdGRvdXQucGF1c2UoKVxuICAgICAgdGhpcy5wcm9jLnN0ZGVyci5wYXVzZSgpXG5cbiAgICAgIGRlYnVnKGBTdGFydGVkIGludGVyYWN0aXZlIGFjdGlvbiBibG9jayBpbiAke3RoaXMuY3dkfWApXG4gICAgICBkZWJ1ZyhgUnVubmluZyBpbnRlcmFjdGl2ZSBjb21tYW5kICR7Y29tbWFuZH0gJHthcmdzfSAke2RhdGEgPyAnd2l0aCcgOiAnd2l0aG91dCd9IGFkZGl0aW9uYWwgZGF0YWApXG4gICAgICBsZXQgZW5kZWQgPSBmYWxzZVxuICAgICAgdHJ5IHtcbiAgICAgICAgY29uc3QgaXNFbmRlZCA9ICgpID0+IGVuZGVkXG4gICAgICAgIGNvbnN0IHN0ZGVycjogc3RyaW5nW10gPSBbXVxuICAgICAgICBjb25zdCBzdGRvdXQ6IHN0cmluZ1tdID0gW11cbiAgICAgICAgc2V0SW1tZWRpYXRlKGFzeW5jICgpID0+IHtcbiAgICAgICAgICBmb3IgYXdhaXQgKGNvbnN0IGxpbmUgb2YgdGhpcy5yZWFkZ2VuKHRoaXMucHJvYy5zdGRlcnIsIGlzRW5kZWQpKSB7XG4gICAgICAgICAgICBzdGRlcnIucHVzaChsaW5lKVxuICAgICAgICAgIH1cbiAgICAgICAgfSlcbiAgICAgICAgY29uc3QgcmVhZE91dHB1dCA9IGFzeW5jICgpID0+IHtcbiAgICAgICAgICBmb3IgYXdhaXQgKGNvbnN0IGxpbmUgb2YgdGhpcy5yZWFkZ2VuKHRoaXMucHJvYy5zdGRvdXQsIGlzRW5kZWQpKSB7XG4gICAgICAgICAgICBkZWJ1ZyhgR290IHJlc3BvbnNlIGZyb20gZ2hjLW1vZGk6ICR7bGluZX1gKVxuICAgICAgICAgICAgaWYgKGxpbmUgPT09ICdPSycpIHtcbiAgICAgICAgICAgICAgZW5kZWQgPSB0cnVlXG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICBzdGRvdXQucHVzaChsaW5lKVxuICAgICAgICAgICAgfVxuICAgICAgICAgIH1cbiAgICAgICAgICByZXR1cm4geyBzdGRvdXQsIHN0ZGVyciB9XG4gICAgICAgIH1cbiAgICAgICAgY29uc3QgZXhpdEV2ZW50ID0gYXN5bmMgKCkgPT4gbmV3IFByb21pc2U8bmV2ZXI+KChyZXNvbHZlLCByZWplY3QpID0+IHtcbiAgICAgICAgICB0aGlzLnByb2Mub25jZSgnZXhpdCcsIChjb2RlKSA9PiB7XG4gICAgICAgICAgICB3YXJuKHN0ZG91dC5qb2luKCdcXG4nKSlcbiAgICAgICAgICAgIHJlamVjdChta0Vycm9yKCdHSENNb2RJbnRlcmFjdGl2ZUNyYXNoJywgYCR7c3Rkb3V0fVxcblxcbiR7c3RkZXJyfWApKVxuICAgICAgICAgIH0pXG4gICAgICAgIH0pXG4gICAgICAgIGNvbnN0IHRpbWVvdXRFdmVudCA9IGFzeW5jICgpID0+IG5ldyBQcm9taXNlPG5ldmVyPigocmVzb2x2ZSwgcmVqZWN0KSA9PiB7XG4gICAgICAgICAgY29uc3QgdG1sOiBudW1iZXIgPSBhdG9tLmNvbmZpZy5nZXQoJ2hhc2tlbGwtZ2hjLW1vZC5pbnRlcmFjdGl2ZUFjdGlvblRpbWVvdXQnKVxuICAgICAgICAgIGlmICh0bWwpIHtcbiAgICAgICAgICAgIHNldFRpbWVvdXQoXG4gICAgICAgICAgICAgICgpID0+IHtcbiAgICAgICAgICAgICAgICByZWplY3QobWtFcnJvcignSW50ZXJhY3RpdmVBY3Rpb25UaW1lb3V0JywgYCR7c3Rkb3V0fVxcblxcbiR7c3RkZXJyfWApKVxuICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgICB0bWwgKiAxMDAwLFxuICAgICAgICAgICAgKVxuICAgICAgICAgIH1cbiAgICAgICAgfSlcblxuICAgICAgICBjb25zdCBhcmdzMiA9XG4gICAgICAgICAgdGhpcy5jYXBzLnF1b3RlQXJncyA/XG4gICAgICAgICAgICBbJ2FzY2lpLWVzY2FwZScsIGNvbW1hbmRdLmNvbmNhdChhcmdzLm1hcCgoeCkgPT4gYFxceDAyJHt4fVxceDAzYCkpXG4gICAgICAgICAgICA6XG4gICAgICAgICAgICBbY29tbWFuZCwgLi4uYXJnc11cbiAgICAgICAgZGVidWcoYFJ1bm5pbmcgZ2hjLW1vZGkgY29tbWFuZCAke2NvbW1hbmR9YCwgLi4uYXJncylcbiAgICAgICAgdGhpcy5wcm9jLnN0ZGluLndyaXRlKGAke2FyZ3MyLmpvaW4oJyAnKS5yZXBsYWNlKC8oPzpcXHI/XFxufFxccikvZywgJyAnKX0ke0VPTH1gKVxuICAgICAgICBpZiAoZGF0YSkge1xuICAgICAgICAgIGRlYnVnKCdXcml0aW5nIGRhdGEgdG8gc3RkaW4uLi4nKVxuICAgICAgICAgIHRoaXMucHJvYy5zdGRpbi53cml0ZShgJHtkYXRhfSR7RU9UfWApXG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIGF3YWl0IFByb21pc2UucmFjZShbcmVhZE91dHB1dCgpLCBleGl0RXZlbnQoKSwgdGltZW91dEV2ZW50KCldKVxuICAgICAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICAgICAgaWYgKGVycm9yLm5hbWUgPT09ICdJbnRlcmFjdGl2ZUFjdGlvblRpbWVvdXQnKSB7XG4gICAgICAgICAgdGhpcy5wcm9jLmtpbGwoKVxuICAgICAgICB9XG4gICAgICAgIHRocm93IGVycm9yXG4gICAgICB9IGZpbmFsbHkge1xuICAgICAgICBkZWJ1ZyhgRW5kZWQgaW50ZXJhY3RpdmUgYWN0aW9uIGJsb2NrIGluICR7dGhpcy5jd2R9YClcbiAgICAgICAgZW5kZWQgPSB0cnVlXG4gICAgICAgIHRoaXMucHJvYy5zdGRvdXQucmVzdW1lKClcbiAgICAgICAgdGhpcy5wcm9jLnN0ZGVyci5yZXN1bWUoKVxuICAgICAgfVxuICAgIH0pXG4gIH1cblxuICBwcml2YXRlIHJlc2V0VGltZXIoKSB7XG4gICAgaWYgKHRoaXMudGltZXIpIHtcbiAgICAgIGNsZWFyVGltZW91dCh0aGlzLnRpbWVyKVxuICAgIH1cbiAgICBjb25zdCB0bWwgPSBhdG9tLmNvbmZpZy5nZXQoJ2hhc2tlbGwtZ2hjLW1vZC5pbnRlcmFjdGl2ZUluYWN0aXZpdHlUaW1lb3V0JylcbiAgICBpZiAodG1sKSB7XG4gICAgICB0aGlzLnRpbWVyID0gc2V0VGltZW91dCgoKSA9PiB7IHRoaXMua2lsbCgpIH0sIHRtbCAqIDYwICogMTAwMClcbiAgICB9XG4gIH1cblxuICBwcml2YXRlIGFzeW5jIHdhaXRSZWFkYWJsZShzdHJlYW06IE5vZGVKUy5SZWFkYWJsZVN0cmVhbSkge1xuICAgIHJldHVybiBuZXcgUHJvbWlzZSgocmVzb2x2ZSkgPT4gc3RyZWFtLm9uY2UoJ3JlYWRhYmxlJywgKCkgPT4ge1xuICAgICAgcmVzb2x2ZSgpXG4gICAgfSkpXG4gIH1cblxuICBwcml2YXRlIGFzeW5jICpyZWFkZ2VuKG91dDogTm9kZUpTLlJlYWRhYmxlU3RyZWFtLCBpc0VuZGVkOiAoKSA9PiBib29sZWFuKSB7XG4gICAgbGV0IGJ1ZmZlciA9ICcnXG4gICAgd2hpbGUgKCFpc0VuZGVkKCkpIHtcbiAgICAgIGNvbnN0IHJlYWQgPSBvdXQucmVhZCgpIGFzIChzdHJpbmcgfCBudWxsKVxuICAgICAgLy8gdHNsaW50OmRpc2FibGUtbmV4dC1saW5lOiBuby1udWxsLWtleXdvcmRcbiAgICAgIGlmIChyZWFkICE9PSBudWxsKSB7XG4gICAgICAgIGJ1ZmZlciArPSByZWFkXG4gICAgICAgIGlmIChidWZmZXIuaW5jbHVkZXMoRU9MKSkge1xuICAgICAgICAgIGNvbnN0IGFyciA9IGJ1ZmZlci5zcGxpdChFT0wpXG4gICAgICAgICAgYnVmZmVyID0gYXJyLnBvcCgpIHx8ICcnXG4gICAgICAgICAgeWllbGQqIGFyclxuICAgICAgICB9XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBhd2FpdCB0aGlzLndhaXRSZWFkYWJsZShvdXQpXG4gICAgICB9XG4gICAgfVxuICAgIGlmIChidWZmZXIpIHsgb3V0LnVuc2hpZnQoYnVmZmVyKSB9XG4gIH1cbn1cbiJdfQ==