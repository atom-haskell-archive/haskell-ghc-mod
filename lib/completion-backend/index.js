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
const FZ = require("fuzzaldrin");
const atom_1 = require("atom");
const buffer_info_1 = require("./buffer-info");
const module_info_1 = require("./module-info");
const Util = require("../util");
class CompletionBackend {
    constructor(process) {
        this.process = process;
        this.bufferMap = new WeakMap();
        this.dirMap = new WeakMap();
        this.modListMap = new WeakMap();
        this.languagePragmas = new WeakMap();
        this.compilerOptions = new WeakMap();
        this.name = this.name.bind(this);
        this.onDidDestroy = this.onDidDestroy.bind(this);
        this.registerCompletionBuffer = this.registerCompletionBuffer.bind(this);
        this.unregisterCompletionBuffer = this.unregisterCompletionBuffer.bind(this);
        this.getCompletionsForSymbol = this.getCompletionsForSymbol.bind(this);
        this.getCompletionsForType = this.getCompletionsForType.bind(this);
        this.getCompletionsForClass = this.getCompletionsForClass.bind(this);
        this.getCompletionsForModule = this.getCompletionsForModule.bind(this);
        this.getCompletionsForSymbolInModule = this.getCompletionsForSymbolInModule.bind(this);
        this.getCompletionsForLanguagePragmas = this.getCompletionsForLanguagePragmas.bind(this);
        this.getCompletionsForCompilerOptions = this.getCompletionsForCompilerOptions.bind(this);
        this.getCompletionsForHole = this.getCompletionsForHole.bind(this);
        this.process = process;
        this.isActive = true;
        this.process.onDidDestroy(() => { this.isActive = false; });
    }
    name() { return 'haskell-ghc-mod'; }
    onDidDestroy(callback) {
        if (!this.isActive) {
            throw new Error('Backend inactive');
        }
        return this.process.onDidDestroy(callback);
    }
    registerCompletionBuffer(buffer) {
        if (!this.isActive) {
            throw new Error('Backend inactive');
        }
        if (this.bufferMap.has(buffer)) {
            return new atom_1.Disposable(() => { });
        }
        const { bufferInfo } = this.getBufferInfo({ buffer });
        setImmediate(() => __awaiter(this, void 0, void 0, function* () {
            const { rootDir, moduleMap } = yield this.getModuleMap({ bufferInfo });
            this.getModuleInfo({ bufferInfo, rootDir, moduleMap });
            const imports = yield bufferInfo.getImports();
            for (const imprt of imports) {
                this.getModuleInfo({ moduleName: imprt.name, bufferInfo, rootDir, moduleMap });
            }
        }));
        return new atom_1.Disposable(() => this.unregisterCompletionBuffer(buffer));
    }
    unregisterCompletionBuffer(buffer) {
        const x = this.bufferMap.get(buffer);
        if (x) {
            x.destroy();
        }
    }
    getCompletionsForSymbol(buffer, prefix, position) {
        return __awaiter(this, void 0, void 0, function* () {
            if (!this.isActive) {
                throw new Error('Backend inactive');
            }
            const symbols = yield this.getSymbolsForBuffer(buffer);
            return this.filter(symbols, prefix, ['qname', 'qparent']);
        });
    }
    getCompletionsForType(buffer, prefix, position) {
        return __awaiter(this, void 0, void 0, function* () {
            if (!this.isActive) {
                throw new Error('Backend inactive');
            }
            const symbols = yield this.getSymbolsForBuffer(buffer, ['type', 'class']);
            return FZ.filter(symbols, prefix, { key: 'qname' });
        });
    }
    getCompletionsForClass(buffer, prefix, position) {
        return __awaiter(this, void 0, void 0, function* () {
            if (!this.isActive) {
                throw new Error('Backend inactive');
            }
            const symbols = yield this.getSymbolsForBuffer(buffer, ['class']);
            return FZ.filter(symbols, prefix, { key: 'qname' });
        });
    }
    getCompletionsForModule(buffer, prefix, position) {
        return __awaiter(this, void 0, void 0, function* () {
            if (!this.isActive) {
                throw new Error('Backend inactive');
            }
            const rootDir = yield this.process.getRootDir(buffer);
            let modules = this.modListMap.get(rootDir);
            if (!modules) {
                modules = yield this.process.runList(buffer);
                this.modListMap.set(rootDir, modules);
                setTimeout((() => this.modListMap.delete(rootDir)), 60 * 1000);
            }
            return FZ.filter(modules, prefix);
        });
    }
    getCompletionsForSymbolInModule(buffer, prefix, position, opts) {
        return __awaiter(this, void 0, void 0, function* () {
            if (!this.isActive) {
                throw new Error('Backend inactive');
            }
            let moduleName = opts ? opts.module : undefined;
            if (!moduleName) {
                const lineRange = new atom_1.Range([0, position.row], position);
                buffer.backwardsScanInRange(/^import\s+([\w.]+)/, lineRange, ({ match }) => moduleName = match[1]);
            }
            const { bufferInfo } = this.getBufferInfo({ buffer });
            const mis = yield this.getModuleInfo({ bufferInfo, moduleName });
            const symbols = mis.moduleInfo.select({
                qualified: false,
                hiding: false,
                name: moduleName || mis.moduleName,
                importList: null,
                alias: null
            }, undefined, true);
            return FZ.filter(symbols, prefix, { key: 'name' });
        });
    }
    getCompletionsForLanguagePragmas(buffer, prefix, position) {
        return __awaiter(this, void 0, void 0, function* () {
            if (!this.isActive) {
                throw new Error('Backend inactive');
            }
            const dir = yield this.process.getRootDir(buffer);
            let ps = this.languagePragmas.get(dir);
            if (!ps) {
                ps = yield this.process.runLang(dir);
                ps && this.languagePragmas.set(dir, ps);
            }
            return FZ.filter(ps, prefix);
        });
    }
    getCompletionsForCompilerOptions(buffer, prefix, position) {
        return __awaiter(this, void 0, void 0, function* () {
            if (!this.isActive) {
                throw new Error('Backend inactive');
            }
            const dir = yield this.process.getRootDir(buffer);
            let co = this.compilerOptions.get(dir);
            if (!co) {
                co = yield this.process.runFlag(dir);
                this.compilerOptions.set(dir, co);
            }
            return FZ.filter(co, prefix);
        });
    }
    getCompletionsForHole(buffer, prefix, position) {
        return __awaiter(this, void 0, void 0, function* () {
            if (!this.isActive) {
                throw new Error('Backend inactive');
            }
            const range = new atom_1.Range(position, position);
            if (prefix.startsWith('_')) {
                prefix = prefix.slice(1);
            }
            const { type } = yield this.process.getTypeInBuffer(buffer, range);
            const symbols = yield this.getSymbolsForBuffer(buffer);
            const ts = symbols.filter((s) => {
                if (!s.typeSignature) {
                    return false;
                }
                const tl = s.typeSignature.split(' -> ').slice(-1)[0];
                if (tl.match(/^[a-z]$/)) {
                    return false;
                }
                const ts2 = tl.replace(/[.?*+^$[\]\\(){}|-]/g, '\\$&');
                const rx = RegExp(ts2.replace(/\b[a-z]\b/g, '.+'), '');
                return rx.test(type);
            });
            if (prefix.length === 0) {
                return ts.sort((a, b) => FZ.score(b.typeSignature, type) - FZ.score(a.typeSignature, type));
            }
            else {
                return FZ.filter(ts, prefix, { key: 'qname' });
            }
        });
    }
    getSymbolsForBuffer(buffer, symbolTypes) {
        return __awaiter(this, void 0, void 0, function* () {
            const { bufferInfo } = this.getBufferInfo({ buffer });
            const { rootDir, moduleMap } = yield this.getModuleMap({ bufferInfo });
            if (bufferInfo && moduleMap) {
                const imports = yield bufferInfo.getImports();
                const promises = yield Promise.all(imports.map((imp) => __awaiter(this, void 0, void 0, function* () {
                    const res = yield this.getModuleInfo({
                        bufferInfo,
                        moduleName: imp.name,
                        rootDir,
                        moduleMap
                    });
                    if (!res) {
                        return [];
                    }
                    return res.moduleInfo.select(imp, symbolTypes);
                })));
                return [].concat(...promises);
            }
            else {
                return [];
            }
        });
    }
    getBufferInfo({ buffer }) {
        let bi = this.bufferMap.get(buffer);
        if (!bi) {
            bi = new buffer_info_1.BufferInfo(buffer);
            this.bufferMap.set(buffer, bi);
        }
        return { bufferInfo: bi };
    }
    getModuleMap({ bufferInfo, rootDir }) {
        return __awaiter(this, void 0, void 0, function* () {
            if (!rootDir) {
                rootDir = yield this.process.getRootDir(bufferInfo.buffer);
            }
            let mm = this.dirMap.get(rootDir);
            if (!mm) {
                mm = new Map();
                this.dirMap.set(rootDir, mm);
            }
            return {
                rootDir,
                moduleMap: mm
            };
        });
    }
    getModuleInfo(arg) {
        return __awaiter(this, void 0, void 0, function* () {
            const { bufferInfo } = arg;
            let dat;
            if (arg.rootDir && arg.moduleMap) {
                dat = { rootDir: arg.rootDir, moduleMap: arg.moduleMap };
            }
            else {
                dat = yield this.getModuleMap({ bufferInfo });
            }
            const { moduleMap, rootDir } = dat;
            let moduleName = arg.moduleName;
            if (!moduleName) {
                moduleName = yield bufferInfo.getModuleName();
            }
            if (!moduleName) {
                throw new Error(`Nameless module in ${bufferInfo.buffer.getUri()}`);
            }
            let moduleInfo = moduleMap.get(moduleName);
            if (!moduleInfo) {
                moduleInfo = new module_info_1.ModuleInfo(moduleName, this.process, rootDir);
                moduleMap.set(moduleName, moduleInfo);
                const mn = moduleName;
                moduleInfo.onDidDestroy(() => {
                    moduleMap.delete(mn);
                    Util.debug(`${moduleName} removed from map`);
                });
                yield moduleInfo.initialUpdatePromise;
            }
            moduleInfo.setBuffer(bufferInfo);
            return { bufferInfo, rootDir, moduleMap, moduleInfo, moduleName };
        });
    }
    filter(candidates, prefix, keys) {
        if (!prefix) {
            return candidates;
        }
        const list = [];
        for (const candidate of candidates) {
            const scores = keys.map((key) => {
                const ck = candidate[key];
                if (ck) {
                    return FZ.score(ck.toString(), prefix);
                }
                else {
                    return 0;
                }
            });
            const score = Math.max(...scores);
            if (score > 0) {
                list.push({
                    score,
                    scoreN: scores.indexOf(score),
                    data: candidate
                });
            }
        }
        return list.sort((a, b) => {
            const s = b.score - a.score;
            if (s === 0) {
                return a.scoreN - b.scoreN;
            }
            return s;
        }).map(({ data }) => data);
    }
}
exports.CompletionBackend = CompletionBackend;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaW5kZXguanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi9zcmMvY29tcGxldGlvbi1iYWNrZW5kL2luZGV4LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7Ozs7Ozs7Ozs7QUFBQSxpQ0FBZ0M7QUFDaEMsK0JBQXdDO0FBQ3hDLCtDQUF3QztBQUN4QywrQ0FBd0M7QUFFeEMsZ0NBQStCO0FBRy9CO0lBUUUsWUFBcUIsT0FBdUI7UUFBdkIsWUFBTyxHQUFQLE9BQU8sQ0FBZ0I7UUFDMUMsSUFBSSxDQUFDLFNBQVMsR0FBRyxJQUFJLE9BQU8sRUFBRSxDQUFBO1FBQzlCLElBQUksQ0FBQyxNQUFNLEdBQUcsSUFBSSxPQUFPLEVBQUUsQ0FBQTtRQUMzQixJQUFJLENBQUMsVUFBVSxHQUFHLElBQUksT0FBTyxFQUFFLENBQUE7UUFDL0IsSUFBSSxDQUFDLGVBQWUsR0FBRyxJQUFJLE9BQU8sRUFBRSxDQUFBO1FBQ3BDLElBQUksQ0FBQyxlQUFlLEdBQUcsSUFBSSxPQUFPLEVBQUUsQ0FBQTtRQUdwQyxJQUFJLENBQUMsSUFBSSxHQUFHLElBQUksQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxDQUFBO1FBQ2hDLElBQUksQ0FBQyxZQUFZLEdBQUcsSUFBSSxDQUFDLFlBQVksQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLENBQUE7UUFDaEQsSUFBSSxDQUFDLHdCQUF3QixHQUFHLElBQUksQ0FBQyx3QkFBd0IsQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLENBQUE7UUFDeEUsSUFBSSxDQUFDLDBCQUEwQixHQUFHLElBQUksQ0FBQywwQkFBMEIsQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLENBQUE7UUFDNUUsSUFBSSxDQUFDLHVCQUF1QixHQUFHLElBQUksQ0FBQyx1QkFBdUIsQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLENBQUE7UUFDdEUsSUFBSSxDQUFDLHFCQUFxQixHQUFHLElBQUksQ0FBQyxxQkFBcUIsQ0FBQyxJQUFJLENB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QyxDQUFBO1lBQ0osQ0FBQztRQUNILENBQUM7UUFDRCxNQUFNLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDO1lBQ2xCLE1BQU0sQ0FBQyxHQUFHLENBQUMsQ0FBQyxLQUFLLEdBQUcsQ0FBQyxDQUFDLEtBQUssQ0FBQTtZQUMzQixFQUFFLENBQUMsQ0FBQyxDQUFDLEtBQUssQ0FBQyxDQUFDLENBQUMsQ0FBQztnQkFDWixNQUFNLENBQUMsQ0FBQyxDQUFDLE1BQU0sR0FBRyxDQUFDLENBQUMsTUFBTSxDQUFBO1lBQzVCLENBQUM7WUFDRCxNQUFNLENBQUMsQ0FBQyxDQUFBO1FBQ1YsQ0FBQyxDQUFDLENBQUMsR0FBRyxDQUFDLENBQUMsRUFBQyxJQUFJLEVBQUMsS0FBSyxJQUFJLENBQUMsQ0FBQTtJQUM1QixDQUFDO0NBQ0Y7QUExYkQsOENBMGJDIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0ICogYXMgRlogZnJvbSAnZnV6emFsZHJpbidcbmltcG9ydCB7IERpc3Bvc2FibGUsIFJhbmdlIH0gZnJvbSAnYXRvbSdcbmltcG9ydCB7QnVmZmVySW5mb30gZnJvbSAnLi9idWZmZXItaW5mbydcbmltcG9ydCB7TW9kdWxlSW5mb30gZnJvbSAnLi9tb2R1bGUtaW5mbydcbmltcG9ydCB7R2hjTW9kaVByb2Nlc3N9IGZyb20gJy4uL2doYy1tb2QnXG5pbXBvcnQgKiBhcyBVdGlsIGZyb20gJy4uL3V0aWwnXG5pbXBvcnQgQ0IgPSBVUEkuQ29tcGxldGlvbkJhY2tlbmRcblxuZXhwb3J0IGNsYXNzIENvbXBsZXRpb25CYWNrZW5kIGltcGxlbWVudHMgQ0IuSUNvbXBsZXRpb25CYWNrZW5kIHtcbiAgcHJpdmF0ZSBidWZmZXJNYXA6IFdlYWtNYXA8QXRvbVR5cGVzLlRleHRCdWZmZXIsIEJ1ZmZlckluZm8+XG4gIHByaXZhdGUgZGlyTWFwOiBXZWFrTWFwPEF0b21UeXBlcy5EaXJlY3RvcnksIE1hcDxzdHJpbmcsIE1vZHVsZUluZm8+PlxuICBwcml2YXRlIG1vZExpc3RNYXA6IFdlYWtNYXA8QXRvbVR5cGVzLkRpcmVjdG9yeSwgc3RyaW5nW10+XG4gIHByaXZhdGUgbGFuZ3VhZ2VQcmFnbWFzOiBXZWFrTWFwPEF0b21UeXBlcy5EaXJlY3RvcnksIHN0cmluZ1tdPlxuICBwcml2YXRlIGNvbXBpbGVyT3B0aW9uczogV2Vha01hcDxBdG9tVHlwZXMuRGlyZWN0b3J5LCBzdHJpbmdbXT5cbiAgcHJpdmF0ZSBpc0FjdGl2ZTogYm9vbGVhblxuXG4gIGNvbnN0cnVjdG9yIChwcml2YXRlIHByb2Nlc3M6IEdoY01vZGlQcm9jZXNzKSB7XG4gICAgdGhpcy5idWZmZXJNYXAgPSBuZXcgV2Vha01hcCgpXG4gICAgdGhpcy5kaXJNYXAgPSBuZXcgV2Vha01hcCgpXG4gICAgdGhpcy5tb2RMaXN0TWFwID0gbmV3IFdlYWtNYXAoKVxuICAgIHRoaXMubGFuZ3VhZ2VQcmFnbWFzID0gbmV3IFdlYWtNYXAoKVxuICAgIHRoaXMuY29tcGlsZXJPcHRpb25zID0gbmV3IFdlYWtNYXAoKVxuXG4gICAgLy8gY29tcGF0aWJpbGl0eSB3aXRoIG9sZCBjbGllbnRzXG4gICAgdGhpcy5uYW1lID0gdGhpcy5uYW1lLmJpbmQodGhpcylcbiAgICB0aGlzLm9uRGlkRGVzdHJveSA9IHRoaXMub25EaWREZXN0cm95LmJpbmQodGhpcylcbiAgICB0aGlzLnJlZ2lzdGVyQ29tcGxldGlvbkJ1ZmZlciA9IHRoaXMucmVnaXN0ZXJDb21wbGV0aW9uQnVmZmVyLmJpbmQodGhpcylcbiAgICB0aGlzLnVucmVnaXN0ZXJDb21wbGV0aW9uQnVmZmVyID0gdGhpcy51bnJlZ2lzdGVyQ29tcGxldGlvbkJ1ZmZlci5iaW5kKHRoaXMpXG4gICAgdGhpcy5nZXRDb21wbGV0aW9uc0ZvclN5bWJvbCA9IHRoaXMuZ2V0Q29tcGxldGlvbnNGb3JTeW1ib2wuYmluZCh0aGlzKVxuICAgIHRoaXMuZ2V0Q29tcGxldGlvbnNGb3JUeXBlID0gdGhpcy5nZXRDb21wbGV0aW9uc0ZvclR5cGUuYmluZCh0aGlzKVxuICAgIHRoaXMuZ2V0Q29tcGxldGlvbnNGb3JDbGFzcyA9IHRoaXMuZ2V0Q29tcGxldGlvbnNGb3JDbGFzcy5iaW5kKHRoaXMpXG4gICAgdGhpcy5nZXRDb21wbGV0aW9uc0Zvck1vZHVsZSA9IHRoaXMuZ2V0Q29tcGxldGlvbnNGb3JNb2R1bGUuYmluZCh0aGlzKVxuICAgIHRoaXMuZ2V0Q29tcGxldGlvbnNGb3JTeW1ib2xJbk1vZHVsZSA9IHRoaXMuZ2V0Q29tcGxldGlvbnNGb3JTeW1ib2xJbk1vZHVsZS5iaW5kKHRoaXMpXG4gICAgdGhpcy5nZXRDb21wbGV0aW9uc0Zvckxhbmd1YWdlUHJhZ21hcyA9IHRoaXMuZ2V0Q29tcGxldGlvbnNGb3JMYW5ndWFnZVByYWdtYXMuYmluZCh0aGlzKVxuICAgIHRoaXMuZ2V0Q29tcGxldGlvbnNGb3JDb21waWxlck9wdGlvbnMgPSB0aGlzLmdldENvbXBsZXRpb25zRm9yQ29tcGlsZXJPcHRpb25zLmJpbmQodGhpcylcbiAgICB0aGlzLmdldENvbXBsZXRpb25zRm9ySG9sZSA9IHRoaXMuZ2V0Q29tcGxldGlvbnNGb3JIb2xlLmJpbmQodGhpcylcblxuICAgIHRoaXMucHJvY2VzcyA9IHByb2Nlc3NcbiAgICB0aGlzLmlzQWN0aXZlID0gdHJ1ZVxuICAgIHRoaXMucHJvY2Vzcy5vbkRpZERlc3Ryb3koKCkgPT4geyB0aGlzLmlzQWN0aXZlID0gZmFsc2UgfSlcbiAgfVxuXG4gIC8qIFB1YmxpYyBpbnRlcmZhY2UgYmVsb3cgKi9cblxuICAvKlxuICBuYW1lKClcbiAgR2V0IGJhY2tlbmQgbmFtZVxuXG4gIFJldHVybnMgU3RyaW5nLCB1bmlxdWUgc3RyaW5nIGRlc2NyaWJpbmcgYSBnaXZlbiBiYWNrZW5kXG4gICovXG4gIHB1YmxpYyBuYW1lICgpIHsgcmV0dXJuICdoYXNrZWxsLWdoYy1tb2QnIH1cblxuICAvKlxuICBvbkRpZERlc3Ryb3koY2FsbGJhY2spXG4gIERlc3RydWN0aW9uIGV2ZW50IHN1YnNjcmlwdGlvbi4gVXN1YWxseSBzaG91bGQgYmUgY2FsbGVkIG9ubHkgb25cbiAgcGFja2FnZSBkZWFjdGl2YXRpb24uXG4gIGNhbGxiYWNrOiAoKSAtPlxuICAqL1xuICBwdWJsaWMgb25EaWREZXN0cm95IChjYWxsYmFjazogKCkgPT4gdm9pZCkge1xuICAgIGlmICghdGhpcy5pc0FjdGl2ZSkgeyB0aHJvdyBuZXcgRXJyb3IoJ0JhY2tlbmQgaW5hY3RpdmUnKSB9XG4gICAgcmV0dXJuIHRoaXMucHJvY2Vzcy5vbkRpZERlc3Ryb3koY2FsbGJhY2spXG4gIH1cblxuICAvKlxuICByZWdpc3RlckNvbXBsZXRpb25CdWZmZXIoYnVmZmVyKVxuICBFdmVyeSBidWZmZXIgdGhhdCB3b3VsZCBiZSB1c2VkIHdpdGggYXV0b2NvbXBsZXRpb24gZnVuY3Rpb25zIGhhcyB0b1xuICBiZSByZWdpc3RlcmVkIHdpdGggdGhpcyBmdW5jdGlvbi5cblxuICBidWZmZXI6IFRleHRCdWZmZXIsIGJ1ZmZlciB0byBiZSB1c2VkIGluIGF1dG9jb21wbGV0aW9uXG5cbiAgUmV0dXJuczogRGlzcG9zYWJsZSwgd2hpY2ggd2lsbCByZW1vdmUgYnVmZmVyIGZyb20gYXV0b2NvbXBsZXRpb25cbiAgKi9cbiAgcHVibGljIHJlZ2lzdGVyQ29tcGxldGlvbkJ1ZmZlciAoYnVmZmVyOiBBdG9tVHlwZXMuVGV4dEJ1ZmZlcikge1xuICAgIGlmICghdGhpcy5pc0FjdGl2ZSkgeyB0aHJvdyBuZXcgRXJyb3IoJ0JhY2tlbmQgaW5hY3RpdmUnKSB9XG5cbiAgICBpZiAodGhpcy5idWZmZXJNYXAuaGFzKGJ1ZmZlcikpIHtcbiAgICAgIHJldHVybiBuZXcgRGlzcG9zYWJsZSgoKSA9PiB7IC8qIHZvaWQgKi8gfSlcbiAgICB9XG5cbiAgICBjb25zdCB7IGJ1ZmZlckluZm8gfSA9IHRoaXMuZ2V0QnVmZmVySW5mbyh7IGJ1ZmZlciB9KVxuXG4gICAgc2V0SW1tZWRpYXRlKGFzeW5jICgpID0+IHtcbiAgICAgIGNvbnN0IHsgcm9vdERpciwgbW9kdWxlTWFwIH0gPSBhd2FpdCB0aGlzLmdldE1vZHVsZU1hcCh7IGJ1ZmZlckluZm8gfSlcblxuICAgICAgdGhpcy5nZXRNb2R1bGVJbmZvKHsgYnVmZmVySW5mbywgcm9vdERpciwgbW9kdWxlTWFwIH0pXG5cbiAgICAgIGNvbnN0IGltcG9ydHMgPSBhd2FpdCBidWZmZXJJbmZvLmdldEltcG9ydHMoKVxuICAgICAgZm9yIChjb25zdCBpbXBydCBvZiBpbXBvcnRzKSB7XG4gICAgICAgIHRoaXMuZ2V0TW9kdWxlSW5mbyh7IG1vZHVsZU5hbWU6IGltcHJ0Lm5hbWUsIGJ1ZmZlckluZm8sIHJvb3REaXIsIG1vZHVsZU1hcCB9KVxuICAgICAgfVxuICAgIH0pXG5cbiAgICByZXR1cm4gbmV3IERpc3Bvc2FibGUoKCkgPT5cbiAgICAgIHRoaXMudW5yZWdpc3RlckNvbXBsZXRpb25CdWZmZXIoYnVmZmVyKSlcbiAgfVxuXG4gIC8qXG4gIHVucmVnaXN0ZXJDb21wbGV0aW9uQnVmZmVyKGJ1ZmZlcilcbiAgYnVmZmVyOiBUZXh0QnVmZmVyLCBidWZmZXIgdG8gYmUgcmVtb3ZlZCBmcm9tIGF1dG9jb21wbGV0aW9uXG4gICovXG4gIHB1YmxpYyB1bnJlZ2lzdGVyQ29tcGxldGlvbkJ1ZmZlciAoYnVmZmVyOiBBdG9tVHlwZXMuVGV4dEJ1ZmZlcikge1xuICAgIGNvbnN0IHggPSB0aGlzLmJ1ZmZlck1hcC5nZXQoYnVmZmVyKVxuICAgIGlmICh4KSB7XG4gICAgICB4LmRlc3Ryb3koKVxuICAgIH1cbiAgfVxuXG4gIC8qXG4gIGdldENvbXBsZXRpb25zRm9yU3ltYm9sKGJ1ZmZlcixwcmVmaXgscG9zaXRpb24pXG4gIGJ1ZmZlcjogVGV4dEJ1ZmZlciwgY3VycmVudCBidWZmZXJcbiAgcHJlZml4OiBTdHJpbmcsIGNvbXBsZXRpb24gcHJlZml4XG4gIHBvc2l0aW9uOiBQb2ludCwgY3VycmVudCBjdXJzb3IgcG9zaXRpb25cblxuICBSZXR1cm5zOiBQcm9taXNlKFtzeW1ib2xdKVxuICBzeW1ib2w6IE9iamVjdCwgYSBjb21wbGV0aW9uIHN5bWJvbFxuICAgIG5hbWU6IFN0cmluZywgc3ltYm9sIG5hbWVcbiAgICBxbmFtZTogU3RyaW5nLCBxdWFsaWZpZWQgbmFtZSwgaWYgbW9kdWxlIGlzIHF1YWxpZmllZC5cbiAgICAgICAgICAgT3RoZXJ3aXNlLCBzYW1lIGFzIG5hbWVcbiAgICB0eXBlU2lnbmF0dXJlOiBTdHJpbmcsIHR5cGUgc2lnbmF0dXJlXG4gICAgc3ltYm9sVHlwZTogU3RyaW5nLCBvbmUgb2YgWyd0eXBlJywgJ2NsYXNzJywgJ2Z1bmN0aW9uJ11cbiAgICBtb2R1bGU6IE9iamVjdCwgc3ltYm9sIG1vZHVsZSBpbmZvcm1hdGlvblxuICAgICAgcXVhbGlmaWVkOiBCb29sZWFuLCB0cnVlIGlmIG1vZHVsZSBpcyBpbXBvcnRlZCBhcyBxdWFsaWZpZWRcbiAgICAgIG5hbWU6IFN0cmluZywgbW9kdWxlIG5hbWVcbiAgICAgIGFsaWFzOiBTdHJpbmcsIG1vZHVsZSBhbGlhc1xuICAgICAgaGlkaW5nOiBCb29sZWFuLCB0cnVlIGlmIG1vZHVsZSBpcyBpbXBvcnRlZCB3aXRoIGhpZGluZyBjbGF1c2VcbiAgICAgIGltcG9ydExpc3Q6IFtTdHJpbmddLCBhcnJheSBvZiBleHBsaWNpdCBpbXBvcnRzL2hpZGRlbiBpbXBvcnRzXG4gICovXG4gIHB1YmxpYyBhc3luYyBnZXRDb21wbGV0aW9uc0ZvclN5bWJvbCAoXG4gICAgYnVmZmVyOiBBdG9tVHlwZXMuVGV4dEJ1ZmZlciwgcHJlZml4OiBzdHJpbmcsIHBvc2l0aW9uOiBBdG9tVHlwZXMuUG9pbnRcbiAgKTogUHJvbWlzZTxDQi5JU3ltYm9sW10+IHtcbiAgICBpZiAoIXRoaXMuaXNBY3RpdmUpIHsgdGhyb3cgbmV3IEVycm9yKCdCYWNrZW5kIGluYWN0aXZlJykgfVxuXG4gICAgY29uc3Qgc3ltYm9scyA9IGF3YWl0IHRoaXMuZ2V0U3ltYm9sc0ZvckJ1ZmZlcihidWZmZXIpXG4gICAgcmV0dXJuIHRoaXMuZmlsdGVyKHN5bWJvbHMsIHByZWZpeCwgWydxbmFtZScsICdxcGFyZW50J10pXG4gIH1cblxuICAvKlxuICBnZXRDb21wbGV0aW9uc0ZvclR5cGUoYnVmZmVyLHByZWZpeCxwb3NpdGlvbilcbiAgYnVmZmVyOiBUZXh0QnVmZmVyLCBjdXJyZW50IGJ1ZmZlclxuICBwcmVmaXg6IFN0cmluZywgY29tcGxldGlvbiBwcmVmaXhcbiAgcG9zaXRpb246IFBvaW50LCBjdXJyZW50IGN1cnNvciBwb3NpdGlvblxuXG4gIFJldHVybnM6IFByb21pc2UoW3N5bWJvbF0pXG4gIHN5bWJvbDogU2FtZSBhcyBnZXRDb21wbGV0aW9uc0ZvclN5bWJvbCwgZXhjZXB0XG4gICAgICAgICAgc3ltYm9sVHlwZSBpcyBvbmUgb2YgWyd0eXBlJywgJ2NsYXNzJ11cbiAgKi9cbiAgcHVibGljIGFzeW5jIGdldENvbXBsZXRpb25zRm9yVHlwZSAoXG4gICAgYnVmZmVyOiBBdG9tVHlwZXMuVGV4dEJ1ZmZlciwgcHJlZml4OiBzdHJpbmcsIHBvc2l0aW9uOiBBdG9tVHlwZXMuUG9pbnRcbiAgKTogUHJvbWlzZTxDQi5JU3ltYm9sW10+IHtcbiAgICBpZiAoIXRoaXMuaXNBY3RpdmUpIHsgdGhyb3cgbmV3IEVycm9yKCdCYWNrZW5kIGluYWN0aXZlJykgfVxuXG4gICAgY29uc3Qgc3ltYm9scyA9IGF3YWl0IHRoaXMuZ2V0U3ltYm9sc0ZvckJ1ZmZlcihidWZmZXIsIFsndHlwZScsICdjbGFzcyddKVxuICAgIHJldHVybiBGWi5maWx0ZXIoc3ltYm9scywgcHJlZml4LCB7a2V5OiAncW5hbWUnfSlcbiAgfVxuXG4gIC8qXG4gIGdldENvbXBsZXRpb25zRm9yQ2xhc3MoYnVmZmVyLHByZWZpeCxwb3NpdGlvbilcbiAgYnVmZmVyOiBUZXh0QnVmZmVyLCBjdXJyZW50IGJ1ZmZlclxuICBwcmVmaXg6IFN0cmluZywgY29tcGxldGlvbiBwcmVmaXhcbiAgcG9zaXRpb246IFBvaW50LCBjdXJyZW50IGN1cnNvciBwb3NpdGlvblxuXG4gIFJldHVybnM6IFByb21pc2UoW3N5bWJvbF0pXG4gIHN5bWJvbDogU2FtZSBhcyBnZXRDb21wbGV0aW9uc0ZvclN5bWJvbCwgZXhjZXB0XG4gICAgICAgICAgc3ltYm9sVHlwZSBpcyBvbmUgb2YgWydjbGFzcyddXG4gICovXG4gIHB1YmxpYyBhc3luYyBnZXRDb21wbGV0aW9uc0ZvckNsYXNzIChcbiAgICBidWZmZXI6IEF0b21UeXBlcy5UZXh0QnVmZmVyLCBwcmVmaXg6IHN0cmluZywgcG9zaXRpb246IEF0b21UeXBlcy5Qb2ludFxuICApOiBQcm9taXNlPENCLklTeW1ib2xbXT4ge1xuICAgIGlmICghdGhpcy5pc0FjdGl2ZSkgeyB0aHJvdyBuZXcgRXJyb3IoJ0JhY2tlbmQgaW5hY3RpdmUnKSB9XG5cbiAgICBjb25zdCBzeW1ib2xzID0gYXdhaXQgdGhpcy5nZXRTeW1ib2xzRm9yQnVmZmVyKGJ1ZmZlciwgWydjbGFzcyddKVxuICAgIHJldHVybiBGWi5maWx0ZXIoc3ltYm9scywgcHJlZml4LCB7a2V5OiAncW5hbWUnfSlcbiAgfVxuXG4gIC8qXG4gIGdldENvbXBsZXRpb25zRm9yTW9kdWxlKGJ1ZmZlcixwcmVmaXgscG9zaXRpb24pXG4gIGJ1ZmZlcjogVGV4dEJ1ZmZlciwgY3VycmVudCBidWZmZXJcbiAgcHJlZml4OiBTdHJpbmcsIGNvbXBsZXRpb24gcHJlZml4XG4gIHBvc2l0aW9uOiBQb2ludCwgY3VycmVudCBjdXJzb3IgcG9zaXRpb25cblxuICBSZXR1cm5zOiBQcm9taXNlKFttb2R1bGVdKVxuICBtb2R1bGU6IFN0cmluZywgbW9kdWxlIG5hbWVcbiAgKi9cbiAgcHVibGljIGFzeW5jIGdldENvbXBsZXRpb25zRm9yTW9kdWxlIChcbiAgICBidWZmZXI6IEF0b21UeXBlcy5UZXh0QnVmZmVyLCBwcmVmaXg6IHN0cmluZywgcG9zaXRpb246IEF0b21UeXBlcy5Qb2ludFxuICApOiBQcm9taXNlPHN0cmluZ1tdPiB7XG4gICAgaWYgKCF0aGlzLmlzQWN0aXZlKSB7IHRocm93IG5ldyBFcnJvcignQmFja2VuZCBpbmFjdGl2ZScpIH1cbiAgICBjb25zdCByb290RGlyID0gYXdhaXQgdGhpcy5wcm9jZXNzLmdldFJvb3REaXIoYnVmZmVyKVxuICAgIGxldCBtb2R1bGVzID0gdGhpcy5tb2RMaXN0TWFwLmdldChyb290RGlyKVxuICAgIGlmICghIG1vZHVsZXMpIHtcbiAgICAgIG1vZHVsZXMgPSBhd2FpdCB0aGlzLnByb2Nlc3MucnVuTGlzdChidWZmZXIpXG4gICAgICB0aGlzLm1vZExpc3RNYXAuc2V0KHJvb3REaXIsIG1vZHVsZXMpXG4gICAgICAvLyByZWZyZXNoIGV2ZXJ5IG1pbnV0ZVxuICAgICAgc2V0VGltZW91dCgoKCkgPT4gdGhpcy5tb2RMaXN0TWFwLmRlbGV0ZShyb290RGlyKSksIDYwICogMTAwMClcbiAgICB9XG4gICAgcmV0dXJuIEZaLmZpbHRlcihtb2R1bGVzLCBwcmVmaXgpXG4gIH1cblxuICAvKlxuICBnZXRDb21wbGV0aW9uc0ZvclN5bWJvbEluTW9kdWxlKGJ1ZmZlcixwcmVmaXgscG9zaXRpb24se21vZHVsZX0pXG4gIFVzZWQgaW4gaW1wb3J0IGhpZGluZy9saXN0IGNvbXBsZXRpb25zXG5cbiAgYnVmZmVyOiBUZXh0QnVmZmVyLCBjdXJyZW50IGJ1ZmZlclxuICBwcmVmaXg6IFN0cmluZywgY29tcGxldGlvbiBwcmVmaXhcbiAgcG9zaXRpb246IFBvaW50LCBjdXJyZW50IGN1cnNvciBwb3NpdGlvblxuICBtb2R1bGU6IFN0cmluZywgbW9kdWxlIG5hbWUgKG9wdGlvbmFsKS4gSWYgdW5kZWZpbmVkLCBmdW5jdGlvblxuICAgICAgICAgIHdpbGwgYXR0ZW1wdCB0byBpbmZlciBtb2R1bGUgbmFtZSBmcm9tIHBvc2l0aW9uIGFuZCBidWZmZXIuXG5cbiAgUmV0dXJuczogUHJvbWlzZShbc3ltYm9sXSlcbiAgc3ltYm9sOiBPYmplY3QsIHN5bWJvbCBpbiBnaXZlbiBtb2R1bGVcbiAgICBuYW1lOiBTdHJpbmcsIHN5bWJvbCBuYW1lXG4gICAgdHlwZVNpZ25hdHVyZTogU3RyaW5nLCB0eXBlIHNpZ25hdHVyZVxuICAgIHN5bWJvbFR5cGU6IFN0cmluZywgb25lIG9mIFsndHlwZScsICdjbGFzcycsICdmdW5jdGlvbiddXG4gICovXG4gIHB1YmxpYyBhc3luYyBnZXRDb21wbGV0aW9uc0ZvclN5bWJvbEluTW9kdWxlIChcbiAgICBidWZmZXI6IEF0b21UeXBlcy5UZXh0QnVmZmVyLCBwcmVmaXg6IHN0cmluZywgcG9zaXRpb246IEF0b21UeXBlcy5Qb2ludCxcbiAgICBvcHRzPzoge21vZHVsZTogc3RyaW5nfVxuICApOiBQcm9taXNlPENCLklTeW1ib2xbXT4ge1xuICAgIGlmICghdGhpcy5pc0FjdGl2ZSkgeyB0aHJvdyBuZXcgRXJyb3IoJ0JhY2tlbmQgaW5hY3RpdmUnKSB9XG4gICAgbGV0IG1vZHVsZU5hbWUgPSBvcHRzID8gb3B0cy5tb2R1bGUgOiB1bmRlZmluZWRcbiAgICBpZiAoIW1vZHVsZU5hbWUpIHtcbiAgICAgIGNvbnN0IGxpbmVSYW5nZSA9IG5ldyBSYW5nZShbMCwgcG9zaXRpb24ucm93XSwgcG9zaXRpb24pXG4gICAgICBidWZmZXIuYmFja3dhcmRzU2NhbkluUmFuZ2UoL15pbXBvcnRcXHMrKFtcXHcuXSspLyxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBsaW5lUmFuZ2UsICh7bWF0Y2h9KSA9PiBtb2R1bGVOYW1lID0gbWF0Y2hbMV0pXG4gICAgfVxuXG4gICAgY29uc3Qge2J1ZmZlckluZm99ID0gdGhpcy5nZXRCdWZmZXJJbmZvKHtidWZmZXJ9KVxuICAgIGNvbnN0IG1pcyA9IGF3YWl0IHRoaXMuZ2V0TW9kdWxlSW5mbyh7YnVmZmVySW5mbywgbW9kdWxlTmFtZX0pXG5cbiAgICAvLyB0c2xpbnQ6ZGlzYWJsZTogbm8tbnVsbC1rZXl3b3JkXG4gICAgY29uc3Qgc3ltYm9scyA9IG1pcy5tb2R1bGVJbmZvLnNlbGVjdChcbiAgICAgIHtcbiAgICAgICAgcXVhbGlmaWVkOiBmYWxzZSxcbiAgICAgICAgaGlkaW5nOiBmYWxzZSxcbiAgICAgICAgbmFtZTogbW9kdWxlTmFtZSB8fCBtaXMubW9kdWxlTmFtZSxcbiAgICAgICAgaW1wb3J0TGlzdDogbnVsbCxcbiAgICAgICAgYWxpYXM6IG51bGxcbiAgICAgIH0sXG4gICAgICB1bmRlZmluZWQsXG4gICAgICB0cnVlXG4gICAgKVxuICAgIC8vIHRzbGludDplbmFibGU6IG5vLW51bGwta2V5d29yZFxuICAgIHJldHVybiBGWi5maWx0ZXIoc3ltYm9scywgcHJlZml4LCB7a2V5OiAnbmFtZSd9KVxuICB9XG5cbiAgLypcbiAgZ2V0Q29tcGxldGlvbnNGb3JMYW5ndWFnZVByYWdtYXMoYnVmZmVyLHByZWZpeCxwb3NpdGlvbilcbiAgYnVmZmVyOiBUZXh0QnVmZmVyLCBjdXJyZW50IGJ1ZmZlclxuICBwcmVmaXg6IFN0cmluZywgY29tcGxldGlvbiBwcmVmaXhcbiAgcG9zaXRpb246IFBvaW50LCBjdXJyZW50IGN1cnNvciBwb3NpdGlvblxuXG4gIFJldHVybnM6IFByb21pc2UoW3ByYWdtYV0pXG4gIHByYWdtYTogU3RyaW5nLCBsYW5ndWFnZSBvcHRpb25cbiAgKi9cbiAgcHVibGljIGFzeW5jIGdldENvbXBsZXRpb25zRm9yTGFuZ3VhZ2VQcmFnbWFzIChcbiAgICBidWZmZXI6IEF0b21UeXBlcy5UZXh0QnVmZmVyLCBwcmVmaXg6IHN0cmluZywgcG9zaXRpb246IEF0b21UeXBlcy5Qb2ludFxuICApOiBQcm9taXNlPHN0cmluZ1tdPiB7XG4gICAgaWYgKCF0aGlzLmlzQWN0aXZlKSB7IHRocm93IG5ldyBFcnJvcignQmFja2VuZCBpbmFjdGl2ZScpIH1cblxuICAgIGNvbnN0IGRpciA9IGF3YWl0IHRoaXMucHJvY2Vzcy5nZXRSb290RGlyKGJ1ZmZlcilcblxuICAgIGxldCBwcyA9IHRoaXMubGFuZ3VhZ2VQcmFnbWFzLmdldChkaXIpXG4gICAgaWYgKCEgcHMpIHtcbiAgICAgIHBzID0gYXdhaXQgdGhpcy5wcm9jZXNzLnJ1bkxhbmcoZGlyKVxuICAgICAgcHMgJiYgdGhpcy5sYW5ndWFnZVByYWdtYXMuc2V0KGRpciwgcHMpXG4gICAgfVxuICAgIHJldHVybiBGWi5maWx0ZXIocHMsIHByZWZpeClcbiAgfVxuXG4gIC8qXG4gIGdldENvbXBsZXRpb25zRm9yQ29tcGlsZXJPcHRpb25zKGJ1ZmZlcixwcmVmaXgscG9zaXRpb24pXG4gIGJ1ZmZlcjogVGV4dEJ1ZmZlciwgY3VycmVudCBidWZmZXJcbiAgcHJlZml4OiBTdHJpbmcsIGNvbXBsZXRpb24gcHJlZml4XG4gIHBvc2l0aW9uOiBQb2ludCwgY3VycmVudCBjdXJzb3IgcG9zaXRpb25cblxuICBSZXR1cm5zOiBQcm9taXNlKFtnaGNvcHRdKVxuICBnaGNvcHQ6IFN0cmluZywgY29tcGlsZXIgb3B0aW9uIChzdGFydHMgd2l0aCAnLWYnKVxuICAqL1xuICBwdWJsaWMgYXN5bmMgZ2V0Q29tcGxldGlvbnNGb3JDb21waWxlck9wdGlvbnMgKFxuICAgIGJ1ZmZlcjogQXRvbVR5cGVzLlRleHRCdWZmZXIsIHByZWZpeDogc3RyaW5nLCBwb3NpdGlvbjogQXRvbVR5cGVzLlBvaW50XG4gICk6IFByb21pc2U8c3RyaW5nW10+IHtcbiAgICBpZiAoIXRoaXMuaXNBY3RpdmUpIHsgdGhyb3cgbmV3IEVycm9yKCdCYWNrZW5kIGluYWN0aXZlJykgfVxuXG4gICAgY29uc3QgZGlyID0gYXdhaXQgdGhpcy5wcm9jZXNzLmdldFJvb3REaXIoYnVmZmVyKVxuXG4gICAgbGV0IGNvID0gdGhpcy5jb21waWxlck9wdGlvbnMuZ2V0KGRpcilcbiAgICBpZiAoISBjbykge1xuICAgICAgY28gPSBhd2FpdCB0aGlzLnByb2Nlc3MucnVuRmxhZyhkaXIpXG4gICAgICB0aGlzLmNvbXBpbGVyT3B0aW9ucy5zZXQoZGlyLCBjbylcbiAgICB9XG4gICAgcmV0dXJuIEZaLmZpbHRlcihjbywgcHJlZml4KVxuICB9XG5cbiAgLypcbiAgZ2V0Q29tcGxldGlvbnNGb3JIb2xlKGJ1ZmZlcixwcmVmaXgscG9zaXRpb24pXG4gIEdldCBjb21wbGV0aW9ucyBiYXNlZCBvbiBleHByZXNzaW9uIHR5cGUuXG4gIEl0IGlzIGFzc3VtZWQgdGhhdCBgcHJlZml4YCBzdGFydHMgd2l0aCAnXydcblxuICBidWZmZXI6IFRleHRCdWZmZXIsIGN1cnJlbnQgYnVmZmVyXG4gIHByZWZpeDogU3RyaW5nLCBjb21wbGV0aW9uIHByZWZpeFxuICBwb3NpdGlvbjogUG9pbnQsIGN1cnJlbnQgY3Vyc29yIHBvc2l0aW9uXG5cbiAgUmV0dXJuczogUHJvbWlzZShbc3ltYm9sXSlcbiAgc3ltYm9sOiBTYW1lIGFzIGdldENvbXBsZXRpb25zRm9yU3ltYm9sXG4gICovXG4gIHB1YmxpYyBhc3luYyBnZXRDb21wbGV0aW9uc0ZvckhvbGUgKFxuICAgIGJ1ZmZlcjogQXRvbVR5cGVzLlRleHRCdWZmZXIsIHByZWZpeDogc3RyaW5nLCBwb3NpdGlvbjogQXRvbVR5cGVzLlBvaW50XG4gICk6IFByb21pc2U8Q0IuSVN5bWJvbFtdPiB7XG4gICAgaWYgKCF0aGlzLmlzQWN0aXZlKSB7IHRocm93IG5ldyBFcnJvcignQmFja2VuZCBpbmFjdGl2ZScpIH1cbiAgICBjb25zdCByYW5nZSA9IG5ldyBSYW5nZShwb3NpdGlvbiwgcG9zaXRpb24pXG4gICAgaWYgKHByZWZpeC5zdGFydHNXaXRoKCdfJykpIHsgcHJlZml4ID0gcHJlZml4LnNsaWNlKDEpIH1cbiAgICBjb25zdCB7dHlwZX0gPSBhd2FpdCB0aGlzLnByb2Nlc3MuZ2V0VHlwZUluQnVmZmVyKGJ1ZmZlciwgcmFuZ2UpXG4gICAgY29uc3Qgc3ltYm9scyA9IGF3YWl0IHRoaXMuZ2V0U3ltYm9sc0ZvckJ1ZmZlcihidWZmZXIpXG4gICAgY29uc3QgdHMgPSBzeW1ib2xzLmZpbHRlcigocykgPT4ge1xuICAgICAgaWYgKCEgcy50eXBlU2lnbmF0dXJlKSB7IHJldHVybiBmYWxzZSB9XG4gICAgICBjb25zdCB0bCA9IHMudHlwZVNpZ25hdHVyZS5zcGxpdCgnIC0+ICcpLnNsaWNlKC0xKVswXVxuICAgICAgaWYgKHRsLm1hdGNoKC9eW2Etel0kLykpIHsgcmV0dXJuIGZhbHNlIH1cbiAgICAgIGNvbnN0IHRzMiA9IHRsLnJlcGxhY2UoL1suPyorXiRbXFxdXFxcXCgpe318LV0vZywgJ1xcXFwkJicpXG4gICAgICBjb25zdCByeCA9IFJlZ0V4cCh0czIucmVwbGFjZSgvXFxiW2Etel1cXGIvZywgJy4rJyksICcnKVxuICAgICAgcmV0dXJuIHJ4LnRlc3QodHlwZSlcbiAgICB9KVxuICAgIGlmIChwcmVmaXgubGVuZ3RoID09PSAwKSB7XG4gICAgICAvLyB0c2xpbnQ6ZGlzYWJsZS1uZXh0LWxpbmU6IG5vLW5vbi1udWxsLWFzc2VydGlvblxuICAgICAgcmV0dXJuIHRzLnNvcnQoKGEsIGIpID0+IEZaLnNjb3JlKGIudHlwZVNpZ25hdHVyZSEsIHR5cGUpIC0gRlouc2NvcmUoYS50eXBlU2lnbmF0dXJlISwgdHlwZSkpXG4gICAgfSBlbHNlIHtcbiAgICAgIHJldHVybiBGWi5maWx0ZXIodHMsIHByZWZpeCwge2tleTogJ3FuYW1lJ30pXG4gICAgfVxuICB9XG5cbiAgcHJpdmF0ZSBhc3luYyBnZXRTeW1ib2xzRm9yQnVmZmVyIChcbiAgICBidWZmZXI6IEF0b21UeXBlcy5UZXh0QnVmZmVyLCBzeW1ib2xUeXBlcz86IENCLlN5bWJvbFR5cGVbXVxuICApOiBQcm9taXNlPENCLklTeW1ib2xbXT4ge1xuICAgIGNvbnN0IHtidWZmZXJJbmZvfSA9IHRoaXMuZ2V0QnVmZmVySW5mbyh7YnVmZmVyfSlcbiAgICBjb25zdCB7cm9vdERpciwgbW9kdWxlTWFwfSA9IGF3YWl0IHRoaXMuZ2V0TW9kdWxlTWFwKHtidWZmZXJJbmZvfSlcbiAgICBpZiAoYnVmZmVySW5mbyAmJiBtb2R1bGVNYXApIHtcbiAgICAgIGNvbnN0IGltcG9ydHMgPSBhd2FpdCBidWZmZXJJbmZvLmdldEltcG9ydHMoKVxuICAgICAgY29uc3QgcHJvbWlzZXMgPSBhd2FpdCBQcm9taXNlLmFsbChcbiAgICAgICAgaW1wb3J0cy5tYXAoYXN5bmMgKGltcCkgPT4ge1xuICAgICAgICAgIGNvbnN0IHJlcyA9IGF3YWl0IHRoaXMuZ2V0TW9kdWxlSW5mbyh7XG4gICAgICAgICAgICBidWZmZXJJbmZvLFxuICAgICAgICAgICAgbW9kdWxlTmFtZTogaW1wLm5hbWUsXG4gICAgICAgICAgICByb290RGlyLFxuICAgICAgICAgICAgbW9kdWxlTWFwXG4gICAgICAgICAgfSlcbiAgICAgICAgICBpZiAoIXJlcykgeyByZXR1cm4gW10gfVxuICAgICAgICAgIHJldHVybiByZXMubW9kdWxlSW5mby5zZWxlY3QoaW1wLCBzeW1ib2xUeXBlcylcbiAgICAgICAgfSlcbiAgICAgIClcbiAgICAgIHJldHVybiAoW10gYXMgdHlwZW9mIHByb21pc2VzWzBdKS5jb25jYXQoLi4ucHJvbWlzZXMpXG4gICAgfSBlbHNlIHtcbiAgICAgIHJldHVybiBbXVxuICAgIH1cbiAgfVxuXG4gIHByaXZhdGUgZ2V0QnVmZmVySW5mbyAoe2J1ZmZlcn06IHtidWZmZXI6IEF0b21UeXBlcy5UZXh0QnVmZmVyfSk6IHtidWZmZXJJbmZvOiBCdWZmZXJJbmZvfSB7XG4gICAgbGV0IGJpID0gdGhpcy5idWZmZXJNYXAuZ2V0KGJ1ZmZlcilcbiAgICBpZiAoISBiaSkge1xuICAgICAgYmkgPSBuZXcgQnVmZmVySW5mbyhidWZmZXIpXG4gICAgICB0aGlzLmJ1ZmZlck1hcC5zZXQoYnVmZmVyLCBiaSlcbiAgICB9XG4gICAgcmV0dXJuIHtidWZmZXJJbmZvOiBiaX1cbiAgfVxuXG4gIHByaXZhdGUgYXN5bmMgZ2V0TW9kdWxlTWFwIChcbiAgICB7YnVmZmVySW5mbywgcm9vdERpcn06IHtidWZmZXJJbmZvOiBCdWZmZXJJbmZvLCByb290RGlyPzogQXRvbVR5cGVzLkRpcmVjdG9yeX1cbiAgKTogUHJvbWlzZTx7cm9vdERpcjogQXRvbVR5cGVzLkRpcmVjdG9yeSwgbW9kdWxlTWFwOiBNYXA8c3RyaW5nLCBNb2R1bGVJbmZvPn0+IHtcbiAgICBpZiAoISByb290RGlyKSB7XG4gICAgICByb290RGlyID0gYXdhaXQgdGhpcy5wcm9jZXNzLmdldFJvb3REaXIoYnVmZmVySW5mby5idWZmZXIpXG4gICAgfVxuICAgIGxldCBtbSA9IHRoaXMuZGlyTWFwLmdldChyb290RGlyKVxuICAgIGlmICghbW0pIHtcbiAgICAgIG1tID0gbmV3IE1hcCgpXG4gICAgICB0aGlzLmRpck1hcC5zZXQocm9vdERpciwgbW0pXG4gICAgfVxuXG4gICAgcmV0dXJuIHtcbiAgICAgIHJvb3REaXIsXG4gICAgICBtb2R1bGVNYXA6IG1tXG4gICAgfVxuICB9XG5cbiAgcHJpdmF0ZSBhc3luYyBnZXRNb2R1bGVJbmZvIChcbiAgICBhcmc6IHtcbiAgICAgIGJ1ZmZlckluZm86IEJ1ZmZlckluZm8sIG1vZHVsZU5hbWU/OiBzdHJpbmcsXG4gICAgICByb290RGlyPzogQXRvbVR5cGVzLkRpcmVjdG9yeSwgbW9kdWxlTWFwPzogTWFwPHN0cmluZywgTW9kdWxlSW5mbz5cbiAgICB9XG4gICkge1xuICAgIGNvbnN0IHtidWZmZXJJbmZvfSA9IGFyZ1xuICAgIGxldCBkYXRcbiAgICBpZiAoYXJnLnJvb3REaXIgJiYgYXJnLm1vZHVsZU1hcCkge1xuICAgICAgZGF0ID0ge3Jvb3REaXI6IGFyZy5yb290RGlyLCBtb2R1bGVNYXA6IGFyZy5tb2R1bGVNYXB9XG4gICAgfSBlbHNlIHtcbiAgICAgIGRhdCA9IGF3YWl0IHRoaXMuZ2V0TW9kdWxlTWFwKHtidWZmZXJJbmZvfSlcbiAgICB9XG4gICAgY29uc3Qge21vZHVsZU1hcCwgcm9vdERpcn0gPSBkYXRcbiAgICBsZXQgbW9kdWxlTmFtZSA9IGFyZy5tb2R1bGVOYW1lXG4gICAgaWYgKCFtb2R1bGVOYW1lKSB7XG4gICAgICBtb2R1bGVOYW1lID0gYXdhaXQgYnVmZmVySW5mby5nZXRNb2R1bGVOYW1lKClcbiAgICB9XG4gICAgaWYgKCFtb2R1bGVOYW1lKSB7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoYE5hbWVsZXNzIG1vZHVsZSBpbiAke2J1ZmZlckluZm8uYnVmZmVyLmdldFVyaSgpfWApXG4gICAgfVxuXG4gICAgbGV0IG1vZHVsZUluZm8gPSBtb2R1bGVNYXAuZ2V0KG1vZHVsZU5hbWUpXG4gICAgaWYgKCFtb2R1bGVJbmZvKSB7XG4gICAgICBtb2R1bGVJbmZvID0gbmV3IE1vZHVsZUluZm8obW9kdWxlTmFtZSwgdGhpcy5wcm9jZXNzLCByb290RGlyKVxuICAgICAgbW9kdWxlTWFwLnNldChtb2R1bGVOYW1lLCBtb2R1bGVJbmZvKVxuXG4gICAgICBjb25zdCBtbiA9IG1vZHVsZU5hbWVcbiAgICAgIG1vZHVsZUluZm8ub25EaWREZXN0cm95KCgpID0+IHtcbiAgICAgICAgbW9kdWxlTWFwLmRlbGV0ZShtbilcbiAgICAgICAgVXRpbC5kZWJ1ZyhgJHttb2R1bGVOYW1lfSByZW1vdmVkIGZyb20gbWFwYClcbiAgICAgIH0pXG4gICAgICBhd2FpdCBtb2R1bGVJbmZvLmluaXRpYWxVcGRhdGVQcm9taXNlXG4gICAgfVxuICAgIG1vZHVsZUluZm8uc2V0QnVmZmVyKGJ1ZmZlckluZm8pXG4gICAgcmV0dXJuIHtidWZmZXJJbmZvLCByb290RGlyLCBtb2R1bGVNYXAsIG1vZHVsZUluZm8sIG1vZHVsZU5hbWV9XG4gIH1cblxuICBwcml2YXRlIGZpbHRlcjxULCBLIGV4dGVuZHMga2V5b2YgVD4gKGNhbmRpZGF0ZXM6IFRbXSwgcHJlZml4OiBzdHJpbmcsIGtleXM6IEtbXSk6IFRbXSB7XG4gICAgaWYgKCFwcmVmaXgpIHtcbiAgICAgIHJldHVybiBjYW5kaWRhdGVzXG4gICAgfVxuICAgIGNvbnN0IGxpc3QgPSBbXVxuICAgIGZvciAoY29uc3QgY2FuZGlkYXRlIG9mIGNhbmRpZGF0ZXMpIHtcbiAgICAgIGNvbnN0IHNjb3JlcyA9IGtleXMubWFwKChrZXkpID0+IHtcbiAgICAgICAgY29uc3QgY2sgPSBjYW5kaWRhdGVba2V5XVxuICAgICAgICBpZiAoY2spIHtcbiAgICAgICAgICByZXR1cm4gRlouc2NvcmUoY2sudG9TdHJpbmcoKSwgcHJlZml4KVxuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIHJldHVybiAwXG4gICAgICAgIH1cbiAgICAgIH0pXG4gICAgICBjb25zdCBzY29yZSA9IE1hdGgubWF4KC4uLnNjb3JlcylcbiAgICAgIGlmIChzY29yZSA+IDApIHtcbiAgICAgICAgbGlzdC5wdXNoKHtcbiAgICAgICAgICBzY29yZSxcbiAgICAgICAgICBzY29yZU46IHNjb3Jlcy5pbmRleE9mKHNjb3JlKSxcbiAgICAgICAgICBkYXRhOiBjYW5kaWRhdGVcbiAgICAgICAgfSlcbiAgICAgIH1cbiAgICB9XG4gICAgcmV0dXJuIGxpc3Quc29ydCgoYSwgYikgPT4ge1xuICAgICAgICBjb25zdCBzID0gYi5zY29yZSAtIGEuc2NvcmVcbiAgICAgICAgaWYgKHMgPT09IDApIHtcbiAgICAgICAgICByZXR1cm4gYS5zY29yZU4gLSBiLnNjb3JlTlxuICAgICAgICB9XG4gICAgICAgIHJldHVybiBzXG4gICAgICB9KS5tYXAoKHtkYXRhfSkgPT4gZGF0YSlcbiAgfVxufVxuIl19