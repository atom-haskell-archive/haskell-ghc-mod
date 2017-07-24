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
                    return Util.debug(`${moduleName} removed from map`);
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaW5kZXguanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi9zcmMvY29tcGxldGlvbi1iYWNrZW5kL2luZGV4LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7Ozs7Ozs7Ozs7QUFXQSxpQ0FBZ0M7QUFDaEMsK0JBQXdDO0FBQ3hDLCtDQUF3QztBQUN4QywrQ0FBd0M7QUFFeEMsZ0NBQStCO0FBRy9CO0lBUUUsWUFBcUIsT0FBdUI7UUFBdkIsWUFBTyxHQUFQLE9BQU8sQ0FBZ0I7UUFDMUMsSUFBSSxDQUFDLFNBQVMsR0FBRyxJQUFJLE9BQU8sRUFBRSxDQUFBO1FBQzlCLElBQUksQ0FBQyxNQUFNLEdBQUcsSUFBSSxPQUFPLEVBQUUsQ0FBQTtRQUMzQixJQUFJLENBQUMsVUFBVSxHQUFHLElBQUksT0FBTyxFQUFFLENBQUE7UUFDL0IsSUFBSSxDQUFDLGVBQWUsR0FBRyxJQUFJLE9BQU8sRUFBRSxDQUFBO1FBQ3BDLElBQUksQ0FBQyxlQUFlLEdBQUcsSUFBSSxPQUFPLEVBQUUsQ0FBQTtRQUdwQyxJQUFJLENBQUMsSUFBSSxHQUFHLElBQUksQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxDQUFBO1FBQ2hDLElBQUksQ0FBQyxZQUFZLEdBQUcsSUFBSSxDQUFDLFlBQVksQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLENBQUE7UUFDaEQsSUFBSSxDQUFDLHdCQUF3QixHQUFHLElBQUksQ0FBQyx3QkFBd0IsQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLENBQUE7UUFDeEUsSUFBSSxDQUFDLDBCQUEwQixHQUFHLElBQUksQ0FBQywwQkFBMEIsQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLENBQUE7UUFDNUUsSUFBSSxDQUFDLHVCQUF1QixHQUFHLElBQUksQ0FBQyx1QkFBdUIsQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLENBQUE7UUFDdEUsSUFBSSxDQUFDLHFCQUFxQixHQUFHLElBQUksQ0FBQyxxQkFBcUIsQ0FBQyxJQUFJLENB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aUJBQ2hCLENBQUMsQ0FBQTtZQUNKLENBQUM7UUFDSCxDQUFDO1FBQ0QsTUFBTSxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQztZQUNsQixNQUFNLENBQUMsR0FBRyxDQUFDLENBQUMsS0FBSyxHQUFHLENBQUMsQ0FBQyxLQUFLLENBQUE7WUFDM0IsRUFBRSxDQUFDLENBQUMsQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDLENBQUM7Z0JBQ1osTUFBTSxDQUFDLENBQUMsQ0FBQyxNQUFNLEdBQUcsQ0FBQyxDQUFDLE1BQU0sQ0FBQTtZQUM1QixDQUFDO1lBQ0QsTUFBTSxDQUFDLENBQUMsQ0FBQTtRQUNWLENBQUMsQ0FBQyxDQUFDLEdBQUcsQ0FBQyxDQUFDLEVBQUMsSUFBSSxFQUFDLEtBQUssSUFBSSxDQUFDLENBQUE7SUFDNUIsQ0FBQztDQUNGO0FBMWJELDhDQTBiQyIsInNvdXJjZXNDb250ZW50IjpbIi8qXG4gKiBkZWNhZmZlaW5hdGUgc3VnZ2VzdGlvbnM6XG4gKiBEUzEwMTogUmVtb3ZlIHVubmVjZXNzYXJ5IHVzZSBvZiBBcnJheS5mcm9tXG4gKiBEUzEwMjogUmVtb3ZlIHVubmVjZXNzYXJ5IGNvZGUgY3JlYXRlZCBiZWNhdXNlIG9mIGltcGxpY2l0IHJldHVybnNcbiAqIERTMTAzOiBSZXdyaXRlIGNvZGUgdG8gbm8gbG9uZ2VyIHVzZSBfX2d1YXJkX19cbiAqIERTMTA0OiBBdm9pZCBpbmxpbmUgYXNzaWdubWVudHNcbiAqIERTMjA1OiBDb25zaWRlciByZXdvcmtpbmcgY29kZSB0byBhdm9pZCB1c2Ugb2YgSUlGRXNcbiAqIERTMjA2OiBDb25zaWRlciByZXdvcmtpbmcgY2xhc3NlcyB0byBhdm9pZCBpbml0Q2xhc3NcbiAqIERTMjA3OiBDb25zaWRlciBzaG9ydGVyIHZhcmlhdGlvbnMgb2YgbnVsbCBjaGVja3NcbiAqIEZ1bGwgZG9jczogaHR0cHM6Ly9naXRodWIuY29tL2RlY2FmZmVpbmF0ZS9kZWNhZmZlaW5hdGUvYmxvYi9tYXN0ZXIvZG9jcy9zdWdnZXN0aW9ucy5tZFxuICovXG5pbXBvcnQgKiBhcyBGWiBmcm9tICdmdXp6YWxkcmluJ1xuaW1wb3J0IHsgRGlzcG9zYWJsZSwgUmFuZ2UgfSBmcm9tICdhdG9tJ1xuaW1wb3J0IHtCdWZmZXJJbmZvfSBmcm9tICcuL2J1ZmZlci1pbmZvJ1xuaW1wb3J0IHtNb2R1bGVJbmZvfSBmcm9tICcuL21vZHVsZS1pbmZvJ1xuaW1wb3J0IHtHaGNNb2RpUHJvY2Vzc30gZnJvbSAnLi4vZ2hjLW1vZCdcbmltcG9ydCAqIGFzIFV0aWwgZnJvbSAnLi4vdXRpbCdcbmltcG9ydCBDQiA9IFVQSS5Db21wbGV0aW9uQmFja2VuZFxuXG5leHBvcnQgY2xhc3MgQ29tcGxldGlvbkJhY2tlbmQgaW1wbGVtZW50cyBDQi5JQ29tcGxldGlvbkJhY2tlbmQge1xuICBwcml2YXRlIGJ1ZmZlck1hcDogV2Vha01hcDxBdG9tVHlwZXMuVGV4dEJ1ZmZlciwgQnVmZmVySW5mbz5cbiAgcHJpdmF0ZSBkaXJNYXA6IFdlYWtNYXA8QXRvbVR5cGVzLkRpcmVjdG9yeSwgTWFwPHN0cmluZywgTW9kdWxlSW5mbz4+XG4gIHByaXZhdGUgbW9kTGlzdE1hcDogV2Vha01hcDxBdG9tVHlwZXMuRGlyZWN0b3J5LCBzdHJpbmdbXT5cbiAgcHJpdmF0ZSBsYW5ndWFnZVByYWdtYXM6IFdlYWtNYXA8QXRvbVR5cGVzLkRpcmVjdG9yeSwgc3RyaW5nW10+XG4gIHByaXZhdGUgY29tcGlsZXJPcHRpb25zOiBXZWFrTWFwPEF0b21UeXBlcy5EaXJlY3RvcnksIHN0cmluZ1tdPlxuICBwcml2YXRlIGlzQWN0aXZlOiBib29sZWFuXG5cbiAgY29uc3RydWN0b3IgKHByaXZhdGUgcHJvY2VzczogR2hjTW9kaVByb2Nlc3MpIHtcbiAgICB0aGlzLmJ1ZmZlck1hcCA9IG5ldyBXZWFrTWFwKClcbiAgICB0aGlzLmRpck1hcCA9IG5ldyBXZWFrTWFwKClcbiAgICB0aGlzLm1vZExpc3RNYXAgPSBuZXcgV2Vha01hcCgpXG4gICAgdGhpcy5sYW5ndWFnZVByYWdtYXMgPSBuZXcgV2Vha01hcCgpXG4gICAgdGhpcy5jb21waWxlck9wdGlvbnMgPSBuZXcgV2Vha01hcCgpXG5cbiAgICAvLyBjb21wYXRpYmlsaXR5IHdpdGggb2xkIGNsaWVudHNcbiAgICB0aGlzLm5hbWUgPSB0aGlzLm5hbWUuYmluZCh0aGlzKVxuICAgIHRoaXMub25EaWREZXN0cm95ID0gdGhpcy5vbkRpZERlc3Ryb3kuYmluZCh0aGlzKVxuICAgIHRoaXMucmVnaXN0ZXJDb21wbGV0aW9uQnVmZmVyID0gdGhpcy5yZWdpc3RlckNvbXBsZXRpb25CdWZmZXIuYmluZCh0aGlzKVxuICAgIHRoaXMudW5yZWdpc3RlckNvbXBsZXRpb25CdWZmZXIgPSB0aGlzLnVucmVnaXN0ZXJDb21wbGV0aW9uQnVmZmVyLmJpbmQodGhpcylcbiAgICB0aGlzLmdldENvbXBsZXRpb25zRm9yU3ltYm9sID0gdGhpcy5nZXRDb21wbGV0aW9uc0ZvclN5bWJvbC5iaW5kKHRoaXMpXG4gICAgdGhpcy5nZXRDb21wbGV0aW9uc0ZvclR5cGUgPSB0aGlzLmdldENvbXBsZXRpb25zRm9yVHlwZS5iaW5kKHRoaXMpXG4gICAgdGhpcy5nZXRDb21wbGV0aW9uc0ZvckNsYXNzID0gdGhpcy5nZXRDb21wbGV0aW9uc0ZvckNsYXNzLmJpbmQodGhpcylcbiAgICB0aGlzLmdldENvbXBsZXRpb25zRm9yTW9kdWxlID0gdGhpcy5nZXRDb21wbGV0aW9uc0Zvck1vZHVsZS5iaW5kKHRoaXMpXG4gICAgdGhpcy5nZXRDb21wbGV0aW9uc0ZvclN5bWJvbEluTW9kdWxlID0gdGhpcy5nZXRDb21wbGV0aW9uc0ZvclN5bWJvbEluTW9kdWxlLmJpbmQodGhpcylcbiAgICB0aGlzLmdldENvbXBsZXRpb25zRm9yTGFuZ3VhZ2VQcmFnbWFzID0gdGhpcy5nZXRDb21wbGV0aW9uc0Zvckxhbmd1YWdlUHJhZ21hcy5iaW5kKHRoaXMpXG4gICAgdGhpcy5nZXRDb21wbGV0aW9uc0ZvckNvbXBpbGVyT3B0aW9ucyA9IHRoaXMuZ2V0Q29tcGxldGlvbnNGb3JDb21waWxlck9wdGlvbnMuYmluZCh0aGlzKVxuICAgIHRoaXMuZ2V0Q29tcGxldGlvbnNGb3JIb2xlID0gdGhpcy5nZXRDb21wbGV0aW9uc0ZvckhvbGUuYmluZCh0aGlzKVxuXG4gICAgdGhpcy5wcm9jZXNzID0gcHJvY2Vzc1xuICAgIHRoaXMuaXNBY3RpdmUgPSB0cnVlXG4gICAgdGhpcy5wcm9jZXNzLm9uRGlkRGVzdHJveSgoKSA9PiB7IHRoaXMuaXNBY3RpdmUgPSBmYWxzZSB9KVxuICB9XG5cbiAgLyogUHVibGljIGludGVyZmFjZSBiZWxvdyAqL1xuXG4gIC8qXG4gIG5hbWUoKVxuICBHZXQgYmFja2VuZCBuYW1lXG5cbiAgUmV0dXJucyBTdHJpbmcsIHVuaXF1ZSBzdHJpbmcgZGVzY3JpYmluZyBhIGdpdmVuIGJhY2tlbmRcbiAgKi9cbiAgcHVibGljIG5hbWUgKCkgeyByZXR1cm4gJ2hhc2tlbGwtZ2hjLW1vZCcgfVxuXG4gIC8qXG4gIG9uRGlkRGVzdHJveShjYWxsYmFjaylcbiAgRGVzdHJ1Y3Rpb24gZXZlbnQgc3Vic2NyaXB0aW9uLiBVc3VhbGx5IHNob3VsZCBiZSBjYWxsZWQgb25seSBvblxuICBwYWNrYWdlIGRlYWN0aXZhdGlvbi5cbiAgY2FsbGJhY2s6ICgpIC0+XG4gICovXG4gIHB1YmxpYyBvbkRpZERlc3Ryb3kgKGNhbGxiYWNrOiAoKSA9PiB2b2lkKSB7XG4gICAgaWYgKCF0aGlzLmlzQWN0aXZlKSB7IHRocm93IG5ldyBFcnJvcignQmFja2VuZCBpbmFjdGl2ZScpIH1cbiAgICByZXR1cm4gdGhpcy5wcm9jZXNzLm9uRGlkRGVzdHJveShjYWxsYmFjaylcbiAgfVxuXG4gIC8qXG4gIHJlZ2lzdGVyQ29tcGxldGlvbkJ1ZmZlcihidWZmZXIpXG4gIEV2ZXJ5IGJ1ZmZlciB0aGF0IHdvdWxkIGJlIHVzZWQgd2l0aCBhdXRvY29tcGxldGlvbiBmdW5jdGlvbnMgaGFzIHRvXG4gIGJlIHJlZ2lzdGVyZWQgd2l0aCB0aGlzIGZ1bmN0aW9uLlxuXG4gIGJ1ZmZlcjogVGV4dEJ1ZmZlciwgYnVmZmVyIHRvIGJlIHVzZWQgaW4gYXV0b2NvbXBsZXRpb25cblxuICBSZXR1cm5zOiBEaXNwb3NhYmxlLCB3aGljaCB3aWxsIHJlbW92ZSBidWZmZXIgZnJvbSBhdXRvY29tcGxldGlvblxuICAqL1xuICBwdWJsaWMgcmVnaXN0ZXJDb21wbGV0aW9uQnVmZmVyIChidWZmZXI6IEF0b21UeXBlcy5UZXh0QnVmZmVyKSB7XG4gICAgaWYgKCF0aGlzLmlzQWN0aXZlKSB7IHRocm93IG5ldyBFcnJvcignQmFja2VuZCBpbmFjdGl2ZScpIH1cblxuICAgIGlmICh0aGlzLmJ1ZmZlck1hcC5oYXMoYnVmZmVyKSkge1xuICAgICAgcmV0dXJuIG5ldyBEaXNwb3NhYmxlKCgpID0+IHsgLyogdm9pZCAqLyB9KVxuICAgIH1cblxuICAgIGNvbnN0IHsgYnVmZmVySW5mbyB9ID0gdGhpcy5nZXRCdWZmZXJJbmZvKHsgYnVmZmVyIH0pXG5cbiAgICBzZXRJbW1lZGlhdGUoYXN5bmMgKCkgPT4ge1xuICAgICAgY29uc3QgeyByb290RGlyLCBtb2R1bGVNYXAgfSA9IGF3YWl0IHRoaXMuZ2V0TW9kdWxlTWFwKHsgYnVmZmVySW5mbyB9KVxuXG4gICAgICB0aGlzLmdldE1vZHVsZUluZm8oeyBidWZmZXJJbmZvLCByb290RGlyLCBtb2R1bGVNYXAgfSlcblxuICAgICAgY29uc3QgaW1wb3J0cyA9IGF3YWl0IGJ1ZmZlckluZm8uZ2V0SW1wb3J0cygpXG4gICAgICBmb3IgKGNvbnN0IGltcHJ0IG9mIGltcG9ydHMpIHtcbiAgICAgICAgdGhpcy5nZXRNb2R1bGVJbmZvKHsgbW9kdWxlTmFtZTogaW1wcnQubmFtZSwgYnVmZmVySW5mbywgcm9vdERpciwgbW9kdWxlTWFwIH0pXG4gICAgICB9XG4gICAgfSlcblxuICAgIHJldHVybiBuZXcgRGlzcG9zYWJsZSgoKSA9PlxuICAgICAgdGhpcy51bnJlZ2lzdGVyQ29tcGxldGlvbkJ1ZmZlcihidWZmZXIpKVxuICB9XG5cbiAgLypcbiAgdW5yZWdpc3RlckNvbXBsZXRpb25CdWZmZXIoYnVmZmVyKVxuICBidWZmZXI6IFRleHRCdWZmZXIsIGJ1ZmZlciB0byBiZSByZW1vdmVkIGZyb20gYXV0b2NvbXBsZXRpb25cbiAgKi9cbiAgcHVibGljIHVucmVnaXN0ZXJDb21wbGV0aW9uQnVmZmVyIChidWZmZXI6IEF0b21UeXBlcy5UZXh0QnVmZmVyKSB7XG4gICAgY29uc3QgeCA9IHRoaXMuYnVmZmVyTWFwLmdldChidWZmZXIpXG4gICAgaWYgKHgpIHtcbiAgICAgIHguZGVzdHJveSgpXG4gICAgfVxuICB9XG5cbiAgLypcbiAgZ2V0Q29tcGxldGlvbnNGb3JTeW1ib2woYnVmZmVyLHByZWZpeCxwb3NpdGlvbilcbiAgYnVmZmVyOiBUZXh0QnVmZmVyLCBjdXJyZW50IGJ1ZmZlclxuICBwcmVmaXg6IFN0cmluZywgY29tcGxldGlvbiBwcmVmaXhcbiAgcG9zaXRpb246IFBvaW50LCBjdXJyZW50IGN1cnNvciBwb3NpdGlvblxuXG4gIFJldHVybnM6IFByb21pc2UoW3N5bWJvbF0pXG4gIHN5bWJvbDogT2JqZWN0LCBhIGNvbXBsZXRpb24gc3ltYm9sXG4gICAgbmFtZTogU3RyaW5nLCBzeW1ib2wgbmFtZVxuICAgIHFuYW1lOiBTdHJpbmcsIHF1YWxpZmllZCBuYW1lLCBpZiBtb2R1bGUgaXMgcXVhbGlmaWVkLlxuICAgICAgICAgICBPdGhlcndpc2UsIHNhbWUgYXMgbmFtZVxuICAgIHR5cGVTaWduYXR1cmU6IFN0cmluZywgdHlwZSBzaWduYXR1cmVcbiAgICBzeW1ib2xUeXBlOiBTdHJpbmcsIG9uZSBvZiBbJ3R5cGUnLCAnY2xhc3MnLCAnZnVuY3Rpb24nXVxuICAgIG1vZHVsZTogT2JqZWN0LCBzeW1ib2wgbW9kdWxlIGluZm9ybWF0aW9uXG4gICAgICBxdWFsaWZpZWQ6IEJvb2xlYW4sIHRydWUgaWYgbW9kdWxlIGlzIGltcG9ydGVkIGFzIHF1YWxpZmllZFxuICAgICAgbmFtZTogU3RyaW5nLCBtb2R1bGUgbmFtZVxuICAgICAgYWxpYXM6IFN0cmluZywgbW9kdWxlIGFsaWFzXG4gICAgICBoaWRpbmc6IEJvb2xlYW4sIHRydWUgaWYgbW9kdWxlIGlzIGltcG9ydGVkIHdpdGggaGlkaW5nIGNsYXVzZVxuICAgICAgaW1wb3J0TGlzdDogW1N0cmluZ10sIGFycmF5IG9mIGV4cGxpY2l0IGltcG9ydHMvaGlkZGVuIGltcG9ydHNcbiAgKi9cbiAgcHVibGljIGFzeW5jIGdldENvbXBsZXRpb25zRm9yU3ltYm9sIChcbiAgICBidWZmZXI6IEF0b21UeXBlcy5UZXh0QnVmZmVyLCBwcmVmaXg6IHN0cmluZywgcG9zaXRpb246IEF0b21UeXBlcy5Qb2ludFxuICApOiBQcm9taXNlPENCLklTeW1ib2xbXT4ge1xuICAgIGlmICghdGhpcy5pc0FjdGl2ZSkgeyB0aHJvdyBuZXcgRXJyb3IoJ0JhY2tlbmQgaW5hY3RpdmUnKSB9XG5cbiAgICBjb25zdCBzeW1ib2xzID0gYXdhaXQgdGhpcy5nZXRTeW1ib2xzRm9yQnVmZmVyKGJ1ZmZlcilcbiAgICByZXR1cm4gdGhpcy5maWx0ZXIoc3ltYm9scywgcHJlZml4LCBbJ3FuYW1lJywgJ3FwYXJlbnQnXSlcbiAgfVxuXG4gIC8qXG4gIGdldENvbXBsZXRpb25zRm9yVHlwZShidWZmZXIscHJlZml4LHBvc2l0aW9uKVxuICBidWZmZXI6IFRleHRCdWZmZXIsIGN1cnJlbnQgYnVmZmVyXG4gIHByZWZpeDogU3RyaW5nLCBjb21wbGV0aW9uIHByZWZpeFxuICBwb3NpdGlvbjogUG9pbnQsIGN1cnJlbnQgY3Vyc29yIHBvc2l0aW9uXG5cbiAgUmV0dXJuczogUHJvbWlzZShbc3ltYm9sXSlcbiAgc3ltYm9sOiBTYW1lIGFzIGdldENvbXBsZXRpb25zRm9yU3ltYm9sLCBleGNlcHRcbiAgICAgICAgICBzeW1ib2xUeXBlIGlzIG9uZSBvZiBbJ3R5cGUnLCAnY2xhc3MnXVxuICAqL1xuICBwdWJsaWMgYXN5bmMgZ2V0Q29tcGxldGlvbnNGb3JUeXBlIChcbiAgICBidWZmZXI6IEF0b21UeXBlcy5UZXh0QnVmZmVyLCBwcmVmaXg6IHN0cmluZywgcG9zaXRpb246IEF0b21UeXBlcy5Qb2ludFxuICApOiBQcm9taXNlPENCLklTeW1ib2xbXT4ge1xuICAgIGlmICghdGhpcy5pc0FjdGl2ZSkgeyB0aHJvdyBuZXcgRXJyb3IoJ0JhY2tlbmQgaW5hY3RpdmUnKSB9XG5cbiAgICBjb25zdCBzeW1ib2xzID0gYXdhaXQgdGhpcy5nZXRTeW1ib2xzRm9yQnVmZmVyKGJ1ZmZlciwgWyd0eXBlJywgJ2NsYXNzJ10pXG4gICAgcmV0dXJuIEZaLmZpbHRlcihzeW1ib2xzLCBwcmVmaXgsIHtrZXk6ICdxbmFtZSd9KVxuICB9XG5cbiAgLypcbiAgZ2V0Q29tcGxldGlvbnNGb3JDbGFzcyhidWZmZXIscHJlZml4LHBvc2l0aW9uKVxuICBidWZmZXI6IFRleHRCdWZmZXIsIGN1cnJlbnQgYnVmZmVyXG4gIHByZWZpeDogU3RyaW5nLCBjb21wbGV0aW9uIHByZWZpeFxuICBwb3NpdGlvbjogUG9pbnQsIGN1cnJlbnQgY3Vyc29yIHBvc2l0aW9uXG5cbiAgUmV0dXJuczogUHJvbWlzZShbc3ltYm9sXSlcbiAgc3ltYm9sOiBTYW1lIGFzIGdldENvbXBsZXRpb25zRm9yU3ltYm9sLCBleGNlcHRcbiAgICAgICAgICBzeW1ib2xUeXBlIGlzIG9uZSBvZiBbJ2NsYXNzJ11cbiAgKi9cbiAgcHVibGljIGFzeW5jIGdldENvbXBsZXRpb25zRm9yQ2xhc3MgKFxuICAgIGJ1ZmZlcjogQXRvbVR5cGVzLlRleHRCdWZmZXIsIHByZWZpeDogc3RyaW5nLCBwb3NpdGlvbjogQXRvbVR5cGVzLlBvaW50XG4gICk6IFByb21pc2U8Q0IuSVN5bWJvbFtdPiB7XG4gICAgaWYgKCF0aGlzLmlzQWN0aXZlKSB7IHRocm93IG5ldyBFcnJvcignQmFja2VuZCBpbmFjdGl2ZScpIH1cblxuICAgIGNvbnN0IHN5bWJvbHMgPSBhd2FpdCB0aGlzLmdldFN5bWJvbHNGb3JCdWZmZXIoYnVmZmVyLCBbJ2NsYXNzJ10pXG4gICAgcmV0dXJuIEZaLmZpbHRlcihzeW1ib2xzLCBwcmVmaXgsIHtrZXk6ICdxbmFtZSd9KVxuICB9XG5cbiAgLypcbiAgZ2V0Q29tcGxldGlvbnNGb3JNb2R1bGUoYnVmZmVyLHByZWZpeCxwb3NpdGlvbilcbiAgYnVmZmVyOiBUZXh0QnVmZmVyLCBjdXJyZW50IGJ1ZmZlclxuICBwcmVmaXg6IFN0cmluZywgY29tcGxldGlvbiBwcmVmaXhcbiAgcG9zaXRpb246IFBvaW50LCBjdXJyZW50IGN1cnNvciBwb3NpdGlvblxuXG4gIFJldHVybnM6IFByb21pc2UoW21vZHVsZV0pXG4gIG1vZHVsZTogU3RyaW5nLCBtb2R1bGUgbmFtZVxuICAqL1xuICBwdWJsaWMgYXN5bmMgZ2V0Q29tcGxldGlvbnNGb3JNb2R1bGUgKFxuICAgIGJ1ZmZlcjogQXRvbVR5cGVzLlRleHRCdWZmZXIsIHByZWZpeDogc3RyaW5nLCBwb3NpdGlvbjogQXRvbVR5cGVzLlBvaW50XG4gICk6IFByb21pc2U8c3RyaW5nW10+IHtcbiAgICBpZiAoIXRoaXMuaXNBY3RpdmUpIHsgdGhyb3cgbmV3IEVycm9yKCdCYWNrZW5kIGluYWN0aXZlJykgfVxuICAgIGNvbnN0IHJvb3REaXIgPSBhd2FpdCB0aGlzLnByb2Nlc3MuZ2V0Um9vdERpcihidWZmZXIpXG4gICAgbGV0IG1vZHVsZXMgPSB0aGlzLm1vZExpc3RNYXAuZ2V0KHJvb3REaXIpXG4gICAgaWYgKCEgbW9kdWxlcykge1xuICAgICAgbW9kdWxlcyA9IGF3YWl0IHRoaXMucHJvY2Vzcy5ydW5MaXN0KGJ1ZmZlcilcbiAgICAgIHRoaXMubW9kTGlzdE1hcC5zZXQocm9vdERpciwgbW9kdWxlcylcbiAgICAgIC8vIHJlZnJlc2ggZXZlcnkgbWludXRlXG4gICAgICBzZXRUaW1lb3V0KCgoKSA9PiB0aGlzLm1vZExpc3RNYXAuZGVsZXRlKHJvb3REaXIpKSwgNjAgKiAxMDAwKVxuICAgIH1cbiAgICByZXR1cm4gRlouZmlsdGVyKG1vZHVsZXMsIHByZWZpeClcbiAgfVxuXG4gIC8qXG4gIGdldENvbXBsZXRpb25zRm9yU3ltYm9sSW5Nb2R1bGUoYnVmZmVyLHByZWZpeCxwb3NpdGlvbix7bW9kdWxlfSlcbiAgVXNlZCBpbiBpbXBvcnQgaGlkaW5nL2xpc3QgY29tcGxldGlvbnNcblxuICBidWZmZXI6IFRleHRCdWZmZXIsIGN1cnJlbnQgYnVmZmVyXG4gIHByZWZpeDogU3RyaW5nLCBjb21wbGV0aW9uIHByZWZpeFxuICBwb3NpdGlvbjogUG9pbnQsIGN1cnJlbnQgY3Vyc29yIHBvc2l0aW9uXG4gIG1vZHVsZTogU3RyaW5nLCBtb2R1bGUgbmFtZSAob3B0aW9uYWwpLiBJZiB1bmRlZmluZWQsIGZ1bmN0aW9uXG4gICAgICAgICAgd2lsbCBhdHRlbXB0IHRvIGluZmVyIG1vZHVsZSBuYW1lIGZyb20gcG9zaXRpb24gYW5kIGJ1ZmZlci5cblxuICBSZXR1cm5zOiBQcm9taXNlKFtzeW1ib2xdKVxuICBzeW1ib2w6IE9iamVjdCwgc3ltYm9sIGluIGdpdmVuIG1vZHVsZVxuICAgIG5hbWU6IFN0cmluZywgc3ltYm9sIG5hbWVcbiAgICB0eXBlU2lnbmF0dXJlOiBTdHJpbmcsIHR5cGUgc2lnbmF0dXJlXG4gICAgc3ltYm9sVHlwZTogU3RyaW5nLCBvbmUgb2YgWyd0eXBlJywgJ2NsYXNzJywgJ2Z1bmN0aW9uJ11cbiAgKi9cbiAgcHVibGljIGFzeW5jIGdldENvbXBsZXRpb25zRm9yU3ltYm9sSW5Nb2R1bGUgKFxuICAgIGJ1ZmZlcjogQXRvbVR5cGVzLlRleHRCdWZmZXIsIHByZWZpeDogc3RyaW5nLCBwb3NpdGlvbjogQXRvbVR5cGVzLlBvaW50LFxuICAgIG9wdHM/OiB7bW9kdWxlOiBzdHJpbmd9XG4gICk6IFByb21pc2U8Q0IuSVN5bWJvbFtdPiB7XG4gICAgaWYgKCF0aGlzLmlzQWN0aXZlKSB7IHRocm93IG5ldyBFcnJvcignQmFja2VuZCBpbmFjdGl2ZScpIH1cbiAgICBsZXQgbW9kdWxlTmFtZSA9IG9wdHMgPyBvcHRzLm1vZHVsZSA6IHVuZGVmaW5lZFxuICAgIGlmICghbW9kdWxlTmFtZSkge1xuICAgICAgY29uc3QgbGluZVJhbmdlID0gbmV3IFJhbmdlKFswLCBwb3NpdGlvbi5yb3ddLCBwb3NpdGlvbilcbiAgICAgIGJ1ZmZlci5iYWNrd2FyZHNTY2FuSW5SYW5nZSgvXmltcG9ydFxccysoW1xcdy5dKykvLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGxpbmVSYW5nZSwgKHttYXRjaH0pID0+IG1vZHVsZU5hbWUgPSBtYXRjaFsxXSlcbiAgICB9XG5cbiAgICBjb25zdCB7YnVmZmVySW5mb30gPSB0aGlzLmdldEJ1ZmZlckluZm8oe2J1ZmZlcn0pXG4gICAgY29uc3QgbWlzID0gYXdhaXQgdGhpcy5nZXRNb2R1bGVJbmZvKHtidWZmZXJJbmZvLCBtb2R1bGVOYW1lfSlcblxuICAgIC8vIHRzbGludDpkaXNhYmxlOiBuby1udWxsLWtleXdvcmRcbiAgICBjb25zdCBzeW1ib2xzID0gbWlzLm1vZHVsZUluZm8uc2VsZWN0KFxuICAgICAge1xuICAgICAgICBxdWFsaWZpZWQ6IGZhbHNlLFxuICAgICAgICBoaWRpbmc6IGZhbHNlLFxuICAgICAgICBuYW1lOiBtb2R1bGVOYW1lIHx8IG1pcy5tb2R1bGVOYW1lLFxuICAgICAgICBpbXBvcnRMaXN0OiBudWxsLFxuICAgICAgICBhbGlhczogbnVsbFxuICAgICAgfSxcbiAgICAgIHVuZGVmaW5lZCxcbiAgICAgIHRydWVcbiAgICApXG4gICAgLy8gdHNsaW50OmVuYWJsZTogbm8tbnVsbC1rZXl3b3JkXG4gICAgcmV0dXJuIEZaLmZpbHRlcihzeW1ib2xzLCBwcmVmaXgsIHtrZXk6ICduYW1lJ30pXG4gIH1cblxuICAvKlxuICBnZXRDb21wbGV0aW9uc0Zvckxhbmd1YWdlUHJhZ21hcyhidWZmZXIscHJlZml4LHBvc2l0aW9uKVxuICBidWZmZXI6IFRleHRCdWZmZXIsIGN1cnJlbnQgYnVmZmVyXG4gIHByZWZpeDogU3RyaW5nLCBjb21wbGV0aW9uIHByZWZpeFxuICBwb3NpdGlvbjogUG9pbnQsIGN1cnJlbnQgY3Vyc29yIHBvc2l0aW9uXG5cbiAgUmV0dXJuczogUHJvbWlzZShbcHJhZ21hXSlcbiAgcHJhZ21hOiBTdHJpbmcsIGxhbmd1YWdlIG9wdGlvblxuICAqL1xuICBwdWJsaWMgYXN5bmMgZ2V0Q29tcGxldGlvbnNGb3JMYW5ndWFnZVByYWdtYXMgKFxuICAgIGJ1ZmZlcjogQXRvbVR5cGVzLlRleHRCdWZmZXIsIHByZWZpeDogc3RyaW5nLCBwb3NpdGlvbjogQXRvbVR5cGVzLlBvaW50XG4gICk6IFByb21pc2U8c3RyaW5nW10+IHtcbiAgICBpZiAoIXRoaXMuaXNBY3RpdmUpIHsgdGhyb3cgbmV3IEVycm9yKCdCYWNrZW5kIGluYWN0aXZlJykgfVxuXG4gICAgY29uc3QgZGlyID0gYXdhaXQgdGhpcy5wcm9jZXNzLmdldFJvb3REaXIoYnVmZmVyKVxuXG4gICAgbGV0IHBzID0gdGhpcy5sYW5ndWFnZVByYWdtYXMuZ2V0KGRpcilcbiAgICBpZiAoISBwcykge1xuICAgICAgcHMgPSBhd2FpdCB0aGlzLnByb2Nlc3MucnVuTGFuZyhkaXIpXG4gICAgICBwcyAmJiB0aGlzLmxhbmd1YWdlUHJhZ21hcy5zZXQoZGlyLCBwcylcbiAgICB9XG4gICAgcmV0dXJuIEZaLmZpbHRlcihwcywgcHJlZml4KVxuICB9XG5cbiAgLypcbiAgZ2V0Q29tcGxldGlvbnNGb3JDb21waWxlck9wdGlvbnMoYnVmZmVyLHByZWZpeCxwb3NpdGlvbilcbiAgYnVmZmVyOiBUZXh0QnVmZmVyLCBjdXJyZW50IGJ1ZmZlclxuICBwcmVmaXg6IFN0cmluZywgY29tcGxldGlvbiBwcmVmaXhcbiAgcG9zaXRpb246IFBvaW50LCBjdXJyZW50IGN1cnNvciBwb3NpdGlvblxuXG4gIFJldHVybnM6IFByb21pc2UoW2doY29wdF0pXG4gIGdoY29wdDogU3RyaW5nLCBjb21waWxlciBvcHRpb24gKHN0YXJ0cyB3aXRoICctZicpXG4gICovXG4gIHB1YmxpYyBhc3luYyBnZXRDb21wbGV0aW9uc0ZvckNvbXBpbGVyT3B0aW9ucyAoXG4gICAgYnVmZmVyOiBBdG9tVHlwZXMuVGV4dEJ1ZmZlciwgcHJlZml4OiBzdHJpbmcsIHBvc2l0aW9uOiBBdG9tVHlwZXMuUG9pbnRcbiAgKTogUHJvbWlzZTxzdHJpbmdbXT4ge1xuICAgIGlmICghdGhpcy5pc0FjdGl2ZSkgeyB0aHJvdyBuZXcgRXJyb3IoJ0JhY2tlbmQgaW5hY3RpdmUnKSB9XG5cbiAgICBjb25zdCBkaXIgPSBhd2FpdCB0aGlzLnByb2Nlc3MuZ2V0Um9vdERpcihidWZmZXIpXG5cbiAgICBsZXQgY28gPSB0aGlzLmNvbXBpbGVyT3B0aW9ucy5nZXQoZGlyKVxuICAgIGlmICghIGNvKSB7XG4gICAgICBjbyA9IGF3YWl0IHRoaXMucHJvY2Vzcy5ydW5GbGFnKGRpcilcbiAgICAgIHRoaXMuY29tcGlsZXJPcHRpb25zLnNldChkaXIsIGNvKVxuICAgIH1cbiAgICByZXR1cm4gRlouZmlsdGVyKGNvLCBwcmVmaXgpXG4gIH1cblxuICAvKlxuICBnZXRDb21wbGV0aW9uc0ZvckhvbGUoYnVmZmVyLHByZWZpeCxwb3NpdGlvbilcbiAgR2V0IGNvbXBsZXRpb25zIGJhc2VkIG9uIGV4cHJlc3Npb24gdHlwZS5cbiAgSXQgaXMgYXNzdW1lZCB0aGF0IGBwcmVmaXhgIHN0YXJ0cyB3aXRoICdfJ1xuXG4gIGJ1ZmZlcjogVGV4dEJ1ZmZlciwgY3VycmVudCBidWZmZXJcbiAgcHJlZml4OiBTdHJpbmcsIGNvbXBsZXRpb24gcHJlZml4XG4gIHBvc2l0aW9uOiBQb2ludCwgY3VycmVudCBjdXJzb3IgcG9zaXRpb25cblxuICBSZXR1cm5zOiBQcm9taXNlKFtzeW1ib2xdKVxuICBzeW1ib2w6IFNhbWUgYXMgZ2V0Q29tcGxldGlvbnNGb3JTeW1ib2xcbiAgKi9cbiAgcHVibGljIGFzeW5jIGdldENvbXBsZXRpb25zRm9ySG9sZSAoXG4gICAgYnVmZmVyOiBBdG9tVHlwZXMuVGV4dEJ1ZmZlciwgcHJlZml4OiBzdHJpbmcsIHBvc2l0aW9uOiBBdG9tVHlwZXMuUG9pbnRcbiAgKTogUHJvbWlzZTxDQi5JU3ltYm9sW10+IHtcbiAgICBpZiAoIXRoaXMuaXNBY3RpdmUpIHsgdGhyb3cgbmV3IEVycm9yKCdCYWNrZW5kIGluYWN0aXZlJykgfVxuICAgIGNvbnN0IHJhbmdlID0gbmV3IFJhbmdlKHBvc2l0aW9uLCBwb3NpdGlvbilcbiAgICBpZiAocHJlZml4LnN0YXJ0c1dpdGgoJ18nKSkgeyBwcmVmaXggPSBwcmVmaXguc2xpY2UoMSkgfVxuICAgIGNvbnN0IHt0eXBlfSA9IGF3YWl0IHRoaXMucHJvY2Vzcy5nZXRUeXBlSW5CdWZmZXIoYnVmZmVyLCByYW5nZSlcbiAgICBjb25zdCBzeW1ib2xzID0gYXdhaXQgdGhpcy5nZXRTeW1ib2xzRm9yQnVmZmVyKGJ1ZmZlcilcbiAgICBjb25zdCB0cyA9IHN5bWJvbHMuZmlsdGVyKChzKSA9PiB7XG4gICAgICBpZiAoISBzLnR5cGVTaWduYXR1cmUpIHsgcmV0dXJuIGZhbHNlIH1cbiAgICAgIGNvbnN0IHRsID0gcy50eXBlU2lnbmF0dXJlLnNwbGl0KCcgLT4gJykuc2xpY2UoLTEpWzBdXG4gICAgICBpZiAodGwubWF0Y2goL15bYS16XSQvKSkgeyByZXR1cm4gZmFsc2UgfVxuICAgICAgY29uc3QgdHMyID0gdGwucmVwbGFjZSgvWy4/KiteJFtcXF1cXFxcKCl7fXwtXS9nLCAnXFxcXCQmJylcbiAgICAgIGNvbnN0IHJ4ID0gUmVnRXhwKHRzMi5yZXBsYWNlKC9cXGJbYS16XVxcYi9nLCAnLisnKSwgJycpXG4gICAgICByZXR1cm4gcngudGVzdCh0eXBlKVxuICAgIH0pXG4gICAgaWYgKHByZWZpeC5sZW5ndGggPT09IDApIHtcbiAgICAgIC8vIHRzbGludDpkaXNhYmxlLW5leHQtbGluZTogbm8tbm9uLW51bGwtYXNzZXJ0aW9uXG4gICAgICByZXR1cm4gdHMuc29ydCgoYSwgYikgPT4gRlouc2NvcmUoYi50eXBlU2lnbmF0dXJlISwgdHlwZSkgLSBGWi5zY29yZShhLnR5cGVTaWduYXR1cmUhLCB0eXBlKSlcbiAgICB9IGVsc2Uge1xuICAgICAgcmV0dXJuIEZaLmZpbHRlcih0cywgcHJlZml4LCB7a2V5OiAncW5hbWUnfSlcbiAgICB9XG4gIH1cblxuICBwcml2YXRlIGFzeW5jIGdldFN5bWJvbHNGb3JCdWZmZXIgKFxuICAgIGJ1ZmZlcjogQXRvbVR5cGVzLlRleHRCdWZmZXIsIHN5bWJvbFR5cGVzPzogQ0IuU3ltYm9sVHlwZVtdXG4gICk6IFByb21pc2U8Q0IuSVN5bWJvbFtdPiB7XG4gICAgY29uc3Qge2J1ZmZlckluZm99ID0gdGhpcy5nZXRCdWZmZXJJbmZvKHtidWZmZXJ9KVxuICAgIGNvbnN0IHtyb290RGlyLCBtb2R1bGVNYXB9ID0gYXdhaXQgdGhpcy5nZXRNb2R1bGVNYXAoe2J1ZmZlckluZm99KVxuICAgIGlmIChidWZmZXJJbmZvICYmIG1vZHVsZU1hcCkge1xuICAgICAgY29uc3QgaW1wb3J0cyA9IGF3YWl0IGJ1ZmZlckluZm8uZ2V0SW1wb3J0cygpXG4gICAgICBjb25zdCBwcm9taXNlcyA9IGF3YWl0IFByb21pc2UuYWxsKFxuICAgICAgICBpbXBvcnRzLm1hcChhc3luYyAoaW1wKSA9PiB7XG4gICAgICAgICAgY29uc3QgcmVzID0gYXdhaXQgdGhpcy5nZXRNb2R1bGVJbmZvKHtcbiAgICAgICAgICAgIGJ1ZmZlckluZm8sXG4gICAgICAgICAgICBtb2R1bGVOYW1lOiBpbXAubmFtZSxcbiAgICAgICAgICAgIHJvb3REaXIsXG4gICAgICAgICAgICBtb2R1bGVNYXBcbiAgICAgICAgICB9KVxuICAgICAgICAgIGlmICghcmVzKSB7IHJldHVybiBbXSB9XG4gICAgICAgICAgcmV0dXJuIHJlcy5tb2R1bGVJbmZvLnNlbGVjdChpbXAsIHN5bWJvbFR5cGVzKVxuICAgICAgICB9KVxuICAgICAgKVxuICAgICAgcmV0dXJuIChbXSBhcyB0eXBlb2YgcHJvbWlzZXNbMF0pLmNvbmNhdCguLi5wcm9taXNlcylcbiAgICB9IGVsc2Uge1xuICAgICAgcmV0dXJuIFtdXG4gICAgfVxuICB9XG5cbiAgcHJpdmF0ZSBnZXRCdWZmZXJJbmZvICh7YnVmZmVyfToge2J1ZmZlcjogQXRvbVR5cGVzLlRleHRCdWZmZXJ9KToge2J1ZmZlckluZm86IEJ1ZmZlckluZm99IHtcbiAgICBsZXQgYmkgPSB0aGlzLmJ1ZmZlck1hcC5nZXQoYnVmZmVyKVxuICAgIGlmICghIGJpKSB7XG4gICAgICBiaSA9IG5ldyBCdWZmZXJJbmZvKGJ1ZmZlcilcbiAgICAgIHRoaXMuYnVmZmVyTWFwLnNldChidWZmZXIsIGJpKVxuICAgIH1cbiAgICByZXR1cm4ge2J1ZmZlckluZm86IGJpfVxuICB9XG5cbiAgcHJpdmF0ZSBhc3luYyBnZXRNb2R1bGVNYXAgKFxuICAgIHtidWZmZXJJbmZvLCByb290RGlyfToge2J1ZmZlckluZm86IEJ1ZmZlckluZm8sIHJvb3REaXI/OiBBdG9tVHlwZXMuRGlyZWN0b3J5fVxuICApOiBQcm9taXNlPHtyb290RGlyOiBBdG9tVHlwZXMuRGlyZWN0b3J5LCBtb2R1bGVNYXA6IE1hcDxzdHJpbmcsIE1vZHVsZUluZm8+fT4ge1xuICAgIGlmICghIHJvb3REaXIpIHtcbiAgICAgIHJvb3REaXIgPSBhd2FpdCB0aGlzLnByb2Nlc3MuZ2V0Um9vdERpcihidWZmZXJJbmZvLmJ1ZmZlcilcbiAgICB9XG4gICAgbGV0IG1tID0gdGhpcy5kaXJNYXAuZ2V0KHJvb3REaXIpXG4gICAgaWYgKCFtbSkge1xuICAgICAgbW0gPSBuZXcgTWFwKClcbiAgICAgIHRoaXMuZGlyTWFwLnNldChyb290RGlyLCBtbSlcbiAgICB9XG5cbiAgICByZXR1cm4ge1xuICAgICAgcm9vdERpcixcbiAgICAgIG1vZHVsZU1hcDogbW1cbiAgICB9XG4gIH1cblxuICBwcml2YXRlIGFzeW5jIGdldE1vZHVsZUluZm8gKFxuICAgIGFyZzoge1xuICAgICAgYnVmZmVySW5mbzogQnVmZmVySW5mbywgbW9kdWxlTmFtZT86IHN0cmluZyxcbiAgICAgIHJvb3REaXI/OiBBdG9tVHlwZXMuRGlyZWN0b3J5LCBtb2R1bGVNYXA/OiBNYXA8c3RyaW5nLCBNb2R1bGVJbmZvPlxuICAgIH1cbiAgKSB7XG4gICAgY29uc3Qge2J1ZmZlckluZm99ID0gYXJnXG4gICAgbGV0IGRhdFxuICAgIGlmIChhcmcucm9vdERpciAmJiBhcmcubW9kdWxlTWFwKSB7XG4gICAgICBkYXQgPSB7cm9vdERpcjogYXJnLnJvb3REaXIsIG1vZHVsZU1hcDogYXJnLm1vZHVsZU1hcH1cbiAgICB9IGVsc2Uge1xuICAgICAgZGF0ID0gYXdhaXQgdGhpcy5nZXRNb2R1bGVNYXAoe2J1ZmZlckluZm99KVxuICAgIH1cbiAgICBjb25zdCB7bW9kdWxlTWFwLCByb290RGlyfSA9IGRhdFxuICAgIGxldCBtb2R1bGVOYW1lID0gYXJnLm1vZHVsZU5hbWVcbiAgICBpZiAoIW1vZHVsZU5hbWUpIHtcbiAgICAgIG1vZHVsZU5hbWUgPSBhd2FpdCBidWZmZXJJbmZvLmdldE1vZHVsZU5hbWUoKVxuICAgIH1cbiAgICBpZiAoIW1vZHVsZU5hbWUpIHtcbiAgICAgIHRocm93IG5ldyBFcnJvcihgTmFtZWxlc3MgbW9kdWxlIGluICR7YnVmZmVySW5mby5idWZmZXIuZ2V0VXJpKCl9YClcbiAgICB9XG5cbiAgICBsZXQgbW9kdWxlSW5mbyA9IG1vZHVsZU1hcC5nZXQobW9kdWxlTmFtZSlcbiAgICBpZiAoIW1vZHVsZUluZm8pIHtcbiAgICAgIG1vZHVsZUluZm8gPSBuZXcgTW9kdWxlSW5mbyhtb2R1bGVOYW1lLCB0aGlzLnByb2Nlc3MsIHJvb3REaXIpXG4gICAgICBtb2R1bGVNYXAuc2V0KG1vZHVsZU5hbWUsIG1vZHVsZUluZm8pXG5cbiAgICAgIGNvbnN0IG1uID0gbW9kdWxlTmFtZVxuICAgICAgbW9kdWxlSW5mby5vbkRpZERlc3Ryb3koKCkgPT4ge1xuICAgICAgICBtb2R1bGVNYXAuZGVsZXRlKG1uKVxuICAgICAgICByZXR1cm4gVXRpbC5kZWJ1ZyhgJHttb2R1bGVOYW1lfSByZW1vdmVkIGZyb20gbWFwYClcbiAgICAgIH0pXG4gICAgICBhd2FpdCBtb2R1bGVJbmZvLmluaXRpYWxVcGRhdGVQcm9taXNlXG4gICAgfVxuICAgIG1vZHVsZUluZm8uc2V0QnVmZmVyKGJ1ZmZlckluZm8pXG4gICAgcmV0dXJuIHtidWZmZXJJbmZvLCByb290RGlyLCBtb2R1bGVNYXAsIG1vZHVsZUluZm8sIG1vZHVsZU5hbWV9XG4gIH1cblxuICBwcml2YXRlIGZpbHRlcjxULCBLIGV4dGVuZHMga2V5b2YgVD4gKGNhbmRpZGF0ZXM6IFRbXSwgcHJlZml4OiBzdHJpbmcsIGtleXM6IEtbXSk6IFRbXSB7XG4gICAgaWYgKCFwcmVmaXgpIHtcbiAgICAgIHJldHVybiBjYW5kaWRhdGVzXG4gICAgfVxuICAgIGNvbnN0IGxpc3QgPSBbXVxuICAgIGZvciAoY29uc3QgY2FuZGlkYXRlIG9mIGNhbmRpZGF0ZXMpIHtcbiAgICAgIGNvbnN0IHNjb3JlcyA9IGtleXMubWFwKChrZXkpID0+IHtcbiAgICAgICAgY29uc3QgY2sgPSBjYW5kaWRhdGVba2V5XVxuICAgICAgICBpZiAoY2spIHtcbiAgICAgICAgICByZXR1cm4gRlouc2NvcmUoY2sudG9TdHJpbmcoKSwgcHJlZml4KVxuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIHJldHVybiAwXG4gICAgICAgIH1cbiAgICAgIH0pXG4gICAgICBjb25zdCBzY29yZSA9IE1hdGgubWF4KC4uLnNjb3JlcylcbiAgICAgIGlmIChzY29yZSA+IDApIHtcbiAgICAgICAgbGlzdC5wdXNoKHtcbiAgICAgICAgICBzY29yZSxcbiAgICAgICAgICBzY29yZU46IHNjb3Jlcy5pbmRleE9mKHNjb3JlKSxcbiAgICAgICAgICBkYXRhOiBjYW5kaWRhdGVcbiAgICAgICAgfSlcbiAgICAgIH1cbiAgICB9XG4gICAgcmV0dXJuIGxpc3Quc29ydCgoYSwgYikgPT4ge1xuICAgICAgICBjb25zdCBzID0gYi5zY29yZSAtIGEuc2NvcmVcbiAgICAgICAgaWYgKHMgPT09IDApIHtcbiAgICAgICAgICByZXR1cm4gYS5zY29yZU4gLSBiLnNjb3JlTlxuICAgICAgICB9XG4gICAgICAgIHJldHVybiBzXG4gICAgICB9KS5tYXAoKHtkYXRhfSkgPT4gZGF0YSlcbiAgfVxufVxuIl19