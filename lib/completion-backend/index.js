"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
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
const util_1 = require("../util");
class CompletionBackend {
    constructor(process, upi) {
        this.process = process;
        this.upi = upi;
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
            const symbols = yield mis.moduleInfo.select({
                qualified: false,
                hiding: false,
                name: moduleName || mis.moduleName,
                importList: null,
                alias: null,
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
                        moduleMap,
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
                moduleMap: mm,
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
            }
            yield moduleInfo.setBuffer(bufferInfo);
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
                    data: candidate,
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
__decorate([
    util_1.handleException,
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [atom_1.TextBuffer, String, atom_1.Point]),
    __metadata("design:returntype", Promise)
], CompletionBackend.prototype, "getCompletionsForSymbol", null);
__decorate([
    util_1.handleException,
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [atom_1.TextBuffer, String, atom_1.Point]),
    __metadata("design:returntype", Promise)
], CompletionBackend.prototype, "getCompletionsForType", null);
__decorate([
    util_1.handleException,
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [atom_1.TextBuffer, String, atom_1.Point]),
    __metadata("design:returntype", Promise)
], CompletionBackend.prototype, "getCompletionsForHole", null);
exports.CompletionBackend = CompletionBackend;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaW5kZXguanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi9zcmMvY29tcGxldGlvbi1iYWNrZW5kL2luZGV4LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7QUFBQSxpQ0FBZ0M7QUFDaEMsK0JBRWE7QUFDYiwrQ0FBMEM7QUFDMUMsK0NBQTBDO0FBRTFDLGdDQUErQjtBQUMvQixrQ0FBeUM7QUFJekM7SUFRRSxZQUFvQixPQUF1QixFQUFTLEdBQThCO1FBQTlELFlBQU8sR0FBUCxPQUFPLENBQWdCO1FBQVMsUUFBRyxHQUFILEdBQUcsQ0FBMkI7UUFDaEYsSUFBSSxDQUFDLFNBQVMsR0FBRyxJQUFJLE9BQU8sRUFBRSxDQUFBO1FBQzlCLElBQUksQ0FBQyxNQUFNLEdBQUcsSUFBSSxPQUFPLEVBQUUsQ0FBQTtRQUMzQixJQUFJLENBQUMsVUFBVSxHQUFHLElBQUksT0FBTyxFQUFFLENBQUE7UUFDL0IsSUFBSSxDQUFDLGVBQWUsR0FBRyxJQUFJLE9BQU8sRUFBRSxDQUFBO1FBQ3BDLElBQUksQ0FBQyxlQUFlLEdBQUcsSUFBSSxPQUFPLEVBQUUsQ0FBQTtRQUdwQyxJQUFJLENBQUMsSUFBSSxHQUFHLElBQUksQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxDQUFBO1FBQ2hDLElBQUksQ0FBQyxZQUFZLEdBQUcsSUFBSSxDQUFDLFlBQVksQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLENBQUE7UUFDaEQsSUFBSSxDQUFDLHdCQUF3QixHQUFHLElBQUksQ0FBQyx3QkFBd0IsQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLENBQUE7UUFDeEUsSUFBSSxDQUFDLDBCQUEwQixHQUFHLElBQUksQ0FBQywwQkFBMEIsQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLENBQUE7UUFDNUUsSUFBSSxDQUFDLHVCQUF1QixHQUFHLElBQUksQ0FBQyx1QkFBdUIsQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLENBQUE7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LENBQUMsQ0FBQyxLQUFLLEdBQUcsQ0FBQyxDQUFDLENBQUMsQ0FBQztnQkFDZCxJQUFJLENBQUMsSUFBSSxDQUFDO29CQUNSLEtBQUs7b0JBQ0wsTUFBTSxFQUFFLE1BQU0sQ0FBQyxPQUFPLENBQUMsS0FBSyxDQUFDO29CQUM3QixJQUFJLEVBQUUsU0FBUztpQkFDaEIsQ0FBQyxDQUFBO1lBQ0osQ0FBQztRQUNILENBQUM7UUFDRCxNQUFNLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLEVBQUUsRUFBRTtZQUN4QixNQUFNLENBQUMsR0FBRyxDQUFDLENBQUMsS0FBSyxHQUFHLENBQUMsQ0FBQyxLQUFLLENBQUE7WUFDM0IsRUFBRSxDQUFDLENBQUMsQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDLENBQUM7Z0JBQ1osTUFBTSxDQUFDLENBQUMsQ0FBQyxNQUFNLEdBQUcsQ0FBQyxDQUFDLE1BQU0sQ0FBQTtZQUM1QixDQUFDO1lBQ0QsTUFBTSxDQUFDLENBQUMsQ0FBQTtRQUNWLENBQUMsQ0FBQyxDQUFDLEdBQUcsQ0FBQyxDQUFDLEVBQUUsSUFBSSxFQUFFLEVBQUUsRUFBRSxDQUFDLElBQUksQ0FBQyxDQUFBO0lBQzVCLENBQUM7Q0FDRjtBQXRVQztJQURDLHNCQUFlOztxQ0FFTixpQkFBVSxVQUE0QixZQUFLOztnRUFNcEQ7QUFhRDtJQURDLHNCQUFlOztxQ0FFTixpQkFBVSxVQUE0QixZQUFLOzs4REFNcEQ7QUEySkQ7SUFEQyxzQkFBZTs7cUNBRU4saUJBQVUsVUFBNEIsWUFBSzs7OERBcUJwRDtBQXRVSCw4Q0FnY0MiLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgKiBhcyBGWiBmcm9tICdmdXp6YWxkcmluJ1xuaW1wb3J0IHtcbiAgVGV4dEJ1ZmZlciwgUG9pbnQsIERpc3Bvc2FibGUsIFJhbmdlLCBEaXJlY3Rvcnlcbn0gZnJvbSAnYXRvbSdcbmltcG9ydCB7IEJ1ZmZlckluZm8gfSBmcm9tICcuL2J1ZmZlci1pbmZvJ1xuaW1wb3J0IHsgTW9kdWxlSW5mbyB9IGZyb20gJy4vbW9kdWxlLWluZm8nXG5pbXBvcnQgeyBHaGNNb2RpUHJvY2VzcyB9IGZyb20gJy4uL2doYy1tb2QnXG5pbXBvcnQgKiBhcyBVdGlsIGZyb20gJy4uL3V0aWwnXG5pbXBvcnQgeyBoYW5kbGVFeGNlcHRpb24gfSBmcm9tICcuLi91dGlsJ1xuaW1wb3J0IENCID0gVVBJLkNvbXBsZXRpb25CYWNrZW5kXG5cbi8vIHRzbGludDpkaXNhYmxlLW5leHQtbGluZTpuby11bnNhZmUtYW55XG5leHBvcnQgY2xhc3MgQ29tcGxldGlvbkJhY2tlbmQgaW1wbGVtZW50cyBDQi5JQ29tcGxldGlvbkJhY2tlbmQge1xuICBwcml2YXRlIGJ1ZmZlck1hcDogV2Vha01hcDxUZXh0QnVmZmVyLCBCdWZmZXJJbmZvPlxuICBwcml2YXRlIGRpck1hcDogV2Vha01hcDxEaXJlY3RvcnksIE1hcDxzdHJpbmcsIE1vZHVsZUluZm8+PlxuICBwcml2YXRlIG1vZExpc3RNYXA6IFdlYWtNYXA8RGlyZWN0b3J5LCBzdHJpbmdbXT5cbiAgcHJpdmF0ZSBsYW5ndWFnZVByYWdtYXM6IFdlYWtNYXA8RGlyZWN0b3J5LCBzdHJpbmdbXT5cbiAgcHJpdmF0ZSBjb21waWxlck9wdGlvbnM6IFdlYWtNYXA8RGlyZWN0b3J5LCBzdHJpbmdbXT5cbiAgcHJpdmF0ZSBpc0FjdGl2ZTogYm9vbGVhblxuXG4gIGNvbnN0cnVjdG9yKHByaXZhdGUgcHJvY2VzczogR2hjTW9kaVByb2Nlc3MsIHB1YmxpYyB1cGk6IFByb21pc2U8VVBJLklVUElJbnN0YW5jZT4pIHtcbiAgICB0aGlzLmJ1ZmZlck1hcCA9IG5ldyBXZWFrTWFwKClcbiAgICB0aGlzLmRpck1hcCA9IG5ldyBXZWFrTWFwKClcbiAgICB0aGlzLm1vZExpc3RNYXAgPSBuZXcgV2Vha01hcCgpXG4gICAgdGhpcy5sYW5ndWFnZVByYWdtYXMgPSBuZXcgV2Vha01hcCgpXG4gICAgdGhpcy5jb21waWxlck9wdGlvbnMgPSBuZXcgV2Vha01hcCgpXG5cbiAgICAvLyBjb21wYXRpYmlsaXR5IHdpdGggb2xkIGNsaWVudHNcbiAgICB0aGlzLm5hbWUgPSB0aGlzLm5hbWUuYmluZCh0aGlzKVxuICAgIHRoaXMub25EaWREZXN0cm95ID0gdGhpcy5vbkRpZERlc3Ryb3kuYmluZCh0aGlzKVxuICAgIHRoaXMucmVnaXN0ZXJDb21wbGV0aW9uQnVmZmVyID0gdGhpcy5yZWdpc3RlckNvbXBsZXRpb25CdWZmZXIuYmluZCh0aGlzKVxuICAgIHRoaXMudW5yZWdpc3RlckNvbXBsZXRpb25CdWZmZXIgPSB0aGlzLnVucmVnaXN0ZXJDb21wbGV0aW9uQnVmZmVyLmJpbmQodGhpcylcbiAgICB0aGlzLmdldENvbXBsZXRpb25zRm9yU3ltYm9sID0gdGhpcy5nZXRDb21wbGV0aW9uc0ZvclN5bWJvbC5iaW5kKHRoaXMpXG4gICAgdGhpcy5nZXRDb21wbGV0aW9uc0ZvclR5cGUgPSB0aGlzLmdldENvbXBsZXRpb25zRm9yVHlwZS5iaW5kKHRoaXMpXG4gICAgdGhpcy5nZXRDb21wbGV0aW9uc0ZvckNsYXNzID0gdGhpcy5nZXRDb21wbGV0aW9uc0ZvckNsYXNzLmJpbmQodGhpcylcbiAgICB0aGlzLmdldENvbXBsZXRpb25zRm9yTW9kdWxlID0gdGhpcy5nZXRDb21wbGV0aW9uc0Zvck1vZHVsZS5iaW5kKHRoaXMpXG4gICAgdGhpcy5nZXRDb21wbGV0aW9uc0ZvclN5bWJvbEluTW9kdWxlID0gdGhpcy5nZXRDb21wbGV0aW9uc0ZvclN5bWJvbEluTW9kdWxlLmJpbmQodGhpcylcbiAgICB0aGlzLmdldENvbXBsZXRpb25zRm9yTGFuZ3VhZ2VQcmFnbWFzID0gdGhpcy5nZXRDb21wbGV0aW9uc0Zvckxhbmd1YWdlUHJhZ21hcy5iaW5kKHRoaXMpXG4gICAgdGhpcy5nZXRDb21wbGV0aW9uc0ZvckNvbXBpbGVyT3B0aW9ucyA9IHRoaXMuZ2V0Q29tcGxldGlvbnNGb3JDb21waWxlck9wdGlvbnMuYmluZCh0aGlzKVxuICAgIHRoaXMuZ2V0Q29tcGxldGlvbnNGb3JIb2xlID0gdGhpcy5nZXRDb21wbGV0aW9uc0ZvckhvbGUuYmluZCh0aGlzKVxuXG4gICAgdGhpcy5wcm9jZXNzID0gcHJvY2Vzc1xuICAgIHRoaXMuaXNBY3RpdmUgPSB0cnVlXG4gICAgdGhpcy5wcm9jZXNzLm9uRGlkRGVzdHJveSgoKSA9PiB7IHRoaXMuaXNBY3RpdmUgPSBmYWxzZSB9KVxuICB9XG5cbiAgLyogUHVibGljIGludGVyZmFjZSBiZWxvdyAqL1xuXG4gIC8qXG4gIG5hbWUoKVxuICBHZXQgYmFja2VuZCBuYW1lXG5cbiAgUmV0dXJucyBTdHJpbmcsIHVuaXF1ZSBzdHJpbmcgZGVzY3JpYmluZyBhIGdpdmVuIGJhY2tlbmRcbiAgKi9cbiAgcHVibGljIG5hbWUoKSB7IHJldHVybiAnaGFza2VsbC1naGMtbW9kJyB9XG5cbiAgLypcbiAgb25EaWREZXN0cm95KGNhbGxiYWNrKVxuICBEZXN0cnVjdGlvbiBldmVudCBzdWJzY3JpcHRpb24uIFVzdWFsbHkgc2hvdWxkIGJlIGNhbGxlZCBvbmx5IG9uXG4gIHBhY2thZ2UgZGVhY3RpdmF0aW9uLlxuICBjYWxsYmFjazogKCkgLT5cbiAgKi9cbiAgcHVibGljIG9uRGlkRGVzdHJveShjYWxsYmFjazogKCkgPT4gdm9pZCkge1xuICAgIGlmICghdGhpcy5pc0FjdGl2ZSkgeyB0aHJvdyBuZXcgRXJyb3IoJ0JhY2tlbmQgaW5hY3RpdmUnKSB9XG4gICAgcmV0dXJuIHRoaXMucHJvY2Vzcy5vbkRpZERlc3Ryb3koY2FsbGJhY2spXG4gIH1cblxuICAvKlxuICByZWdpc3RlckNvbXBsZXRpb25CdWZmZXIoYnVmZmVyKVxuICBFdmVyeSBidWZmZXIgdGhhdCB3b3VsZCBiZSB1c2VkIHdpdGggYXV0b2NvbXBsZXRpb24gZnVuY3Rpb25zIGhhcyB0b1xuICBiZSByZWdpc3RlcmVkIHdpdGggdGhpcyBmdW5jdGlvbi5cblxuICBidWZmZXI6IFRleHRCdWZmZXIsIGJ1ZmZlciB0byBiZSB1c2VkIGluIGF1dG9jb21wbGV0aW9uXG5cbiAgUmV0dXJuczogRGlzcG9zYWJsZSwgd2hpY2ggd2lsbCByZW1vdmUgYnVmZmVyIGZyb20gYXV0b2NvbXBsZXRpb25cbiAgKi9cbiAgcHVibGljIHJlZ2lzdGVyQ29tcGxldGlvbkJ1ZmZlcihidWZmZXI6IFRleHRCdWZmZXIpIHtcbiAgICBpZiAoIXRoaXMuaXNBY3RpdmUpIHsgdGhyb3cgbmV3IEVycm9yKCdCYWNrZW5kIGluYWN0aXZlJykgfVxuXG4gICAgaWYgKHRoaXMuYnVmZmVyTWFwLmhhcyhidWZmZXIpKSB7XG4gICAgICByZXR1cm4gbmV3IERpc3Bvc2FibGUoKCkgPT4geyAvKiB2b2lkICovIH0pXG4gICAgfVxuXG4gICAgY29uc3QgeyBidWZmZXJJbmZvIH0gPSB0aGlzLmdldEJ1ZmZlckluZm8oeyBidWZmZXIgfSlcblxuICAgIHNldEltbWVkaWF0ZShhc3luYyAoKSA9PiB7XG4gICAgICBjb25zdCB7IHJvb3REaXIsIG1vZHVsZU1hcCB9ID0gYXdhaXQgdGhpcy5nZXRNb2R1bGVNYXAoeyBidWZmZXJJbmZvIH0pXG5cbiAgICAgIC8vIHRzbGludDpkaXNhYmxlLW5leHQtbGluZTpuby1mbG9hdGluZy1wcm9taXNlc1xuICAgICAgdGhpcy5nZXRNb2R1bGVJbmZvKHsgYnVmZmVySW5mbywgcm9vdERpciwgbW9kdWxlTWFwIH0pXG5cbiAgICAgIGNvbnN0IGltcG9ydHMgPSBhd2FpdCBidWZmZXJJbmZvLmdldEltcG9ydHMoKVxuICAgICAgZm9yIChjb25zdCBpbXBydCBvZiBpbXBvcnRzKSB7XG4gICAgICAgIC8vIHRzbGludDpkaXNhYmxlLW5leHQtbGluZTpuby1mbG9hdGluZy1wcm9taXNlc1xuICAgICAgICB0aGlzLmdldE1vZHVsZUluZm8oeyBtb2R1bGVOYW1lOiBpbXBydC5uYW1lLCBidWZmZXJJbmZvLCByb290RGlyLCBtb2R1bGVNYXAgfSlcbiAgICAgIH1cbiAgICB9KVxuXG4gICAgcmV0dXJuIG5ldyBEaXNwb3NhYmxlKCgpID0+XG4gICAgICB0aGlzLnVucmVnaXN0ZXJDb21wbGV0aW9uQnVmZmVyKGJ1ZmZlcikpXG4gIH1cblxuICAvKlxuICB1bnJlZ2lzdGVyQ29tcGxldGlvbkJ1ZmZlcihidWZmZXIpXG4gIGJ1ZmZlcjogVGV4dEJ1ZmZlciwgYnVmZmVyIHRvIGJlIHJlbW92ZWQgZnJvbSBhdXRvY29tcGxldGlvblxuICAqL1xuICBwdWJsaWMgdW5yZWdpc3RlckNvbXBsZXRpb25CdWZmZXIoYnVmZmVyOiBUZXh0QnVmZmVyKSB7XG4gICAgY29uc3QgeCA9IHRoaXMuYnVmZmVyTWFwLmdldChidWZmZXIpXG4gICAgaWYgKHgpIHtcbiAgICAgIHguZGVzdHJveSgpXG4gICAgfVxuICB9XG5cbiAgLypcbiAgZ2V0Q29tcGxldGlvbnNGb3JTeW1ib2woYnVmZmVyLHByZWZpeCxwb3NpdGlvbilcbiAgYnVmZmVyOiBUZXh0QnVmZmVyLCBjdXJyZW50IGJ1ZmZlclxuICBwcmVmaXg6IFN0cmluZywgY29tcGxldGlvbiBwcmVmaXhcbiAgcG9zaXRpb246IFBvaW50LCBjdXJyZW50IGN1cnNvciBwb3NpdGlvblxuXG4gIFJldHVybnM6IFByb21pc2UoW3N5bWJvbF0pXG4gIHN5bWJvbDogT2JqZWN0LCBhIGNvbXBsZXRpb24gc3ltYm9sXG4gICAgbmFtZTogU3RyaW5nLCBzeW1ib2wgbmFtZVxuICAgIHFuYW1lOiBTdHJpbmcsIHF1YWxpZmllZCBuYW1lLCBpZiBtb2R1bGUgaXMgcXVhbGlmaWVkLlxuICAgICAgICAgICBPdGhlcndpc2UsIHNhbWUgYXMgbmFtZVxuICAgIHR5cGVTaWduYXR1cmU6IFN0cmluZywgdHlwZSBzaWduYXR1cmVcbiAgICBzeW1ib2xUeXBlOiBTdHJpbmcsIG9uZSBvZiBbJ3R5cGUnLCAnY2xhc3MnLCAnZnVuY3Rpb24nXVxuICAgIG1vZHVsZTogT2JqZWN0LCBzeW1ib2wgbW9kdWxlIGluZm9ybWF0aW9uXG4gICAgICBxdWFsaWZpZWQ6IEJvb2xlYW4sIHRydWUgaWYgbW9kdWxlIGlzIGltcG9ydGVkIGFzIHF1YWxpZmllZFxuICAgICAgbmFtZTogU3RyaW5nLCBtb2R1bGUgbmFtZVxuICAgICAgYWxpYXM6IFN0cmluZywgbW9kdWxlIGFsaWFzXG4gICAgICBoaWRpbmc6IEJvb2xlYW4sIHRydWUgaWYgbW9kdWxlIGlzIGltcG9ydGVkIHdpdGggaGlkaW5nIGNsYXVzZVxuICAgICAgaW1wb3J0TGlzdDogW1N0cmluZ10sIGFycmF5IG9mIGV4cGxpY2l0IGltcG9ydHMvaGlkZGVuIGltcG9ydHNcbiAgKi9cbiAgQGhhbmRsZUV4Y2VwdGlvblxuICBwdWJsaWMgYXN5bmMgZ2V0Q29tcGxldGlvbnNGb3JTeW1ib2woXG4gICAgYnVmZmVyOiBUZXh0QnVmZmVyLCBwcmVmaXg6IHN0cmluZywgcG9zaXRpb246IFBvaW50LFxuICApOiBQcm9taXNlPENCLklTeW1ib2xbXT4ge1xuICAgIGlmICghdGhpcy5pc0FjdGl2ZSkgeyB0aHJvdyBuZXcgRXJyb3IoJ0JhY2tlbmQgaW5hY3RpdmUnKSB9XG5cbiAgICBjb25zdCBzeW1ib2xzID0gYXdhaXQgdGhpcy5nZXRTeW1ib2xzRm9yQnVmZmVyKGJ1ZmZlcilcbiAgICByZXR1cm4gdGhpcy5maWx0ZXIoc3ltYm9scywgcHJlZml4LCBbJ3FuYW1lJywgJ3FwYXJlbnQnXSlcbiAgfVxuXG4gIC8qXG4gIGdldENvbXBsZXRpb25zRm9yVHlwZShidWZmZXIscHJlZml4LHBvc2l0aW9uKVxuICBidWZmZXI6IFRleHRCdWZmZXIsIGN1cnJlbnQgYnVmZmVyXG4gIHByZWZpeDogU3RyaW5nLCBjb21wbGV0aW9uIHByZWZpeFxuICBwb3NpdGlvbjogUG9pbnQsIGN1cnJlbnQgY3Vyc29yIHBvc2l0aW9uXG5cbiAgUmV0dXJuczogUHJvbWlzZShbc3ltYm9sXSlcbiAgc3ltYm9sOiBTYW1lIGFzIGdldENvbXBsZXRpb25zRm9yU3ltYm9sLCBleGNlcHRcbiAgICAgICAgICBzeW1ib2xUeXBlIGlzIG9uZSBvZiBbJ3R5cGUnLCAnY2xhc3MnXVxuICAqL1xuICBAaGFuZGxlRXhjZXB0aW9uXG4gIHB1YmxpYyBhc3luYyBnZXRDb21wbGV0aW9uc0ZvclR5cGUoXG4gICAgYnVmZmVyOiBUZXh0QnVmZmVyLCBwcmVmaXg6IHN0cmluZywgcG9zaXRpb246IFBvaW50LFxuICApOiBQcm9taXNlPENCLklTeW1ib2xbXT4ge1xuICAgIGlmICghdGhpcy5pc0FjdGl2ZSkgeyB0aHJvdyBuZXcgRXJyb3IoJ0JhY2tlbmQgaW5hY3RpdmUnKSB9XG5cbiAgICBjb25zdCBzeW1ib2xzID0gYXdhaXQgdGhpcy5nZXRTeW1ib2xzRm9yQnVmZmVyKGJ1ZmZlciwgWyd0eXBlJywgJ2NsYXNzJ10pXG4gICAgcmV0dXJuIEZaLmZpbHRlcihzeW1ib2xzLCBwcmVmaXgsIHsga2V5OiAncW5hbWUnIH0pXG4gIH1cblxuICAvKlxuICBnZXRDb21wbGV0aW9uc0ZvckNsYXNzKGJ1ZmZlcixwcmVmaXgscG9zaXRpb24pXG4gIGJ1ZmZlcjogVGV4dEJ1ZmZlciwgY3VycmVudCBidWZmZXJcbiAgcHJlZml4OiBTdHJpbmcsIGNvbXBsZXRpb24gcHJlZml4XG4gIHBvc2l0aW9uOiBQb2ludCwgY3VycmVudCBjdXJzb3IgcG9zaXRpb25cblxuICBSZXR1cm5zOiBQcm9taXNlKFtzeW1ib2xdKVxuICBzeW1ib2w6IFNhbWUgYXMgZ2V0Q29tcGxldGlvbnNGb3JTeW1ib2wsIGV4Y2VwdFxuICAgICAgICAgIHN5bWJvbFR5cGUgaXMgb25lIG9mIFsnY2xhc3MnXVxuICAqL1xuICBwdWJsaWMgYXN5bmMgZ2V0Q29tcGxldGlvbnNGb3JDbGFzcyhcbiAgICBidWZmZXI6IFRleHRCdWZmZXIsIHByZWZpeDogc3RyaW5nLCBwb3NpdGlvbjogUG9pbnQsXG4gICk6IFByb21pc2U8Q0IuSVN5bWJvbFtdPiB7XG4gICAgaWYgKCF0aGlzLmlzQWN0aXZlKSB7IHRocm93IG5ldyBFcnJvcignQmFja2VuZCBpbmFjdGl2ZScpIH1cblxuICAgIGNvbnN0IHN5bWJvbHMgPSBhd2FpdCB0aGlzLmdldFN5bWJvbHNGb3JCdWZmZXIoYnVmZmVyLCBbJ2NsYXNzJ10pXG4gICAgcmV0dXJuIEZaLmZpbHRlcihzeW1ib2xzLCBwcmVmaXgsIHsga2V5OiAncW5hbWUnIH0pXG4gIH1cblxuICAvKlxuICBnZXRDb21wbGV0aW9uc0Zvck1vZHVsZShidWZmZXIscHJlZml4LHBvc2l0aW9uKVxuICBidWZmZXI6IFRleHRCdWZmZXIsIGN1cnJlbnQgYnVmZmVyXG4gIHByZWZpeDogU3RyaW5nLCBjb21wbGV0aW9uIHByZWZpeFxuICBwb3NpdGlvbjogUG9pbnQsIGN1cnJlbnQgY3Vyc29yIHBvc2l0aW9uXG5cbiAgUmV0dXJuczogUHJvbWlzZShbbW9kdWxlXSlcbiAgbW9kdWxlOiBTdHJpbmcsIG1vZHVsZSBuYW1lXG4gICovXG4gIHB1YmxpYyBhc3luYyBnZXRDb21wbGV0aW9uc0Zvck1vZHVsZShcbiAgICBidWZmZXI6IFRleHRCdWZmZXIsIHByZWZpeDogc3RyaW5nLCBwb3NpdGlvbjogUG9pbnQsXG4gICk6IFByb21pc2U8c3RyaW5nW10+IHtcbiAgICBpZiAoIXRoaXMuaXNBY3RpdmUpIHsgdGhyb3cgbmV3IEVycm9yKCdCYWNrZW5kIGluYWN0aXZlJykgfVxuICAgIGNvbnN0IHJvb3REaXIgPSBhd2FpdCB0aGlzLnByb2Nlc3MuZ2V0Um9vdERpcihidWZmZXIpXG4gICAgbGV0IG1vZHVsZXMgPSB0aGlzLm1vZExpc3RNYXAuZ2V0KHJvb3REaXIpXG4gICAgaWYgKCFtb2R1bGVzKSB7XG4gICAgICBtb2R1bGVzID0gYXdhaXQgdGhpcy5wcm9jZXNzLnJ1bkxpc3QoYnVmZmVyKVxuICAgICAgdGhpcy5tb2RMaXN0TWFwLnNldChyb290RGlyLCBtb2R1bGVzKVxuICAgICAgLy8gcmVmcmVzaCBldmVyeSBtaW51dGVcbiAgICAgIHNldFRpbWVvdXQoKCgpID0+IHRoaXMubW9kTGlzdE1hcC5kZWxldGUocm9vdERpcikpLCA2MCAqIDEwMDApXG4gICAgfVxuICAgIHJldHVybiBGWi5maWx0ZXIobW9kdWxlcywgcHJlZml4KVxuICB9XG5cbiAgLypcbiAgZ2V0Q29tcGxldGlvbnNGb3JTeW1ib2xJbk1vZHVsZShidWZmZXIscHJlZml4LHBvc2l0aW9uLHttb2R1bGV9KVxuICBVc2VkIGluIGltcG9ydCBoaWRpbmcvbGlzdCBjb21wbGV0aW9uc1xuXG4gIGJ1ZmZlcjogVGV4dEJ1ZmZlciwgY3VycmVudCBidWZmZXJcbiAgcHJlZml4OiBTdHJpbmcsIGNvbXBsZXRpb24gcHJlZml4XG4gIHBvc2l0aW9uOiBQb2ludCwgY3VycmVudCBjdXJzb3IgcG9zaXRpb25cbiAgbW9kdWxlOiBTdHJpbmcsIG1vZHVsZSBuYW1lIChvcHRpb25hbCkuIElmIHVuZGVmaW5lZCwgZnVuY3Rpb25cbiAgICAgICAgICB3aWxsIGF0dGVtcHQgdG8gaW5mZXIgbW9kdWxlIG5hbWUgZnJvbSBwb3NpdGlvbiBhbmQgYnVmZmVyLlxuXG4gIFJldHVybnM6IFByb21pc2UoW3N5bWJvbF0pXG4gIHN5bWJvbDogT2JqZWN0LCBzeW1ib2wgaW4gZ2l2ZW4gbW9kdWxlXG4gICAgbmFtZTogU3RyaW5nLCBzeW1ib2wgbmFtZVxuICAgIHR5cGVTaWduYXR1cmU6IFN0cmluZywgdHlwZSBzaWduYXR1cmVcbiAgICBzeW1ib2xUeXBlOiBTdHJpbmcsIG9uZSBvZiBbJ3R5cGUnLCAnY2xhc3MnLCAnZnVuY3Rpb24nXVxuICAqL1xuICBwdWJsaWMgYXN5bmMgZ2V0Q29tcGxldGlvbnNGb3JTeW1ib2xJbk1vZHVsZShcbiAgICBidWZmZXI6IFRleHRCdWZmZXIsIHByZWZpeDogc3RyaW5nLCBwb3NpdGlvbjogUG9pbnQsXG4gICAgb3B0cz86IHsgbW9kdWxlOiBzdHJpbmcgfSxcbiAgKTogUHJvbWlzZTxDQi5JU3ltYm9sW10+IHtcbiAgICBpZiAoIXRoaXMuaXNBY3RpdmUpIHsgdGhyb3cgbmV3IEVycm9yKCdCYWNrZW5kIGluYWN0aXZlJykgfVxuICAgIGxldCBtb2R1bGVOYW1lID0gb3B0cyA/IG9wdHMubW9kdWxlIDogdW5kZWZpbmVkXG4gICAgaWYgKCFtb2R1bGVOYW1lKSB7XG4gICAgICBjb25zdCBsaW5lUmFuZ2UgPSBuZXcgUmFuZ2UoWzAsIHBvc2l0aW9uLnJvd10sIHBvc2l0aW9uKVxuICAgICAgYnVmZmVyLmJhY2t3YXJkc1NjYW5JblJhbmdlKFxuICAgICAgICAvXmltcG9ydFxccysoW1xcdy5dKykvLFxuICAgICAgICBsaW5lUmFuZ2UsICh7IG1hdGNoIH0pID0+IG1vZHVsZU5hbWUgPSBtYXRjaFsxXSxcbiAgICAgIClcbiAgICB9XG5cbiAgICBjb25zdCB7IGJ1ZmZlckluZm8gfSA9IHRoaXMuZ2V0QnVmZmVySW5mbyh7IGJ1ZmZlciB9KVxuICAgIGNvbnN0IG1pcyA9IGF3YWl0IHRoaXMuZ2V0TW9kdWxlSW5mbyh7IGJ1ZmZlckluZm8sIG1vZHVsZU5hbWUgfSlcblxuICAgIC8vIHRzbGludDpkaXNhYmxlOiBuby1udWxsLWtleXdvcmRcbiAgICBjb25zdCBzeW1ib2xzID0gYXdhaXQgbWlzLm1vZHVsZUluZm8uc2VsZWN0KFxuICAgICAge1xuICAgICAgICBxdWFsaWZpZWQ6IGZhbHNlLFxuICAgICAgICBoaWRpbmc6IGZhbHNlLFxuICAgICAgICBuYW1lOiBtb2R1bGVOYW1lIHx8IG1pcy5tb2R1bGVOYW1lLFxuICAgICAgICBpbXBvcnRMaXN0OiBudWxsLFxuICAgICAgICBhbGlhczogbnVsbCxcbiAgICAgIH0sXG4gICAgICB1bmRlZmluZWQsXG4gICAgICB0cnVlLFxuICAgIClcbiAgICAvLyB0c2xpbnQ6ZW5hYmxlOiBuby1udWxsLWtleXdvcmRcbiAgICByZXR1cm4gRlouZmlsdGVyKHN5bWJvbHMsIHByZWZpeCwgeyBrZXk6ICduYW1lJyB9KVxuICB9XG5cbiAgLypcbiAgZ2V0Q29tcGxldGlvbnNGb3JMYW5ndWFnZVByYWdtYXMoYnVmZmVyLHByZWZpeCxwb3NpdGlvbilcbiAgYnVmZmVyOiBUZXh0QnVmZmVyLCBjdXJyZW50IGJ1ZmZlclxuICBwcmVmaXg6IFN0cmluZywgY29tcGxldGlvbiBwcmVmaXhcbiAgcG9zaXRpb246IFBvaW50LCBjdXJyZW50IGN1cnNvciBwb3NpdGlvblxuXG4gIFJldHVybnM6IFByb21pc2UoW3ByYWdtYV0pXG4gIHByYWdtYTogU3RyaW5nLCBsYW5ndWFnZSBvcHRpb25cbiAgKi9cbiAgcHVibGljIGFzeW5jIGdldENvbXBsZXRpb25zRm9yTGFuZ3VhZ2VQcmFnbWFzKFxuICAgIGJ1ZmZlcjogVGV4dEJ1ZmZlciwgcHJlZml4OiBzdHJpbmcsIHBvc2l0aW9uOiBQb2ludCxcbiAgKTogUHJvbWlzZTxzdHJpbmdbXT4ge1xuICAgIGlmICghdGhpcy5pc0FjdGl2ZSkgeyB0aHJvdyBuZXcgRXJyb3IoJ0JhY2tlbmQgaW5hY3RpdmUnKSB9XG5cbiAgICBjb25zdCBkaXIgPSBhd2FpdCB0aGlzLnByb2Nlc3MuZ2V0Um9vdERpcihidWZmZXIpXG5cbiAgICBsZXQgcHMgPSB0aGlzLmxhbmd1YWdlUHJhZ21hcy5nZXQoZGlyKVxuICAgIGlmICghcHMpIHtcbiAgICAgIHBzID0gYXdhaXQgdGhpcy5wcm9jZXNzLnJ1bkxhbmcoZGlyKVxuICAgICAgcHMgJiYgdGhpcy5sYW5ndWFnZVByYWdtYXMuc2V0KGRpciwgcHMpXG4gICAgfVxuICAgIHJldHVybiBGWi5maWx0ZXIocHMsIHByZWZpeClcbiAgfVxuXG4gIC8qXG4gIGdldENvbXBsZXRpb25zRm9yQ29tcGlsZXJPcHRpb25zKGJ1ZmZlcixwcmVmaXgscG9zaXRpb24pXG4gIGJ1ZmZlcjogVGV4dEJ1ZmZlciwgY3VycmVudCBidWZmZXJcbiAgcHJlZml4OiBTdHJpbmcsIGNvbXBsZXRpb24gcHJlZml4XG4gIHBvc2l0aW9uOiBQb2ludCwgY3VycmVudCBjdXJzb3IgcG9zaXRpb25cblxuICBSZXR1cm5zOiBQcm9taXNlKFtnaGNvcHRdKVxuICBnaGNvcHQ6IFN0cmluZywgY29tcGlsZXIgb3B0aW9uIChzdGFydHMgd2l0aCAnLWYnKVxuICAqL1xuICBwdWJsaWMgYXN5bmMgZ2V0Q29tcGxldGlvbnNGb3JDb21waWxlck9wdGlvbnMoXG4gICAgYnVmZmVyOiBUZXh0QnVmZmVyLCBwcmVmaXg6IHN0cmluZywgcG9zaXRpb246IFBvaW50LFxuICApOiBQcm9taXNlPHN0cmluZ1tdPiB7XG4gICAgaWYgKCF0aGlzLmlzQWN0aXZlKSB7IHRocm93IG5ldyBFcnJvcignQmFja2VuZCBpbmFjdGl2ZScpIH1cblxuICAgIGNvbnN0IGRpciA9IGF3YWl0IHRoaXMucHJvY2Vzcy5nZXRSb290RGlyKGJ1ZmZlcilcblxuICAgIGxldCBjbyA9IHRoaXMuY29tcGlsZXJPcHRpb25zLmdldChkaXIpXG4gICAgaWYgKCFjbykge1xuICAgICAgY28gPSBhd2FpdCB0aGlzLnByb2Nlc3MucnVuRmxhZyhkaXIpXG4gICAgICB0aGlzLmNvbXBpbGVyT3B0aW9ucy5zZXQoZGlyLCBjbylcbiAgICB9XG4gICAgcmV0dXJuIEZaLmZpbHRlcihjbywgcHJlZml4KVxuICB9XG5cbiAgLypcbiAgZ2V0Q29tcGxldGlvbnNGb3JIb2xlKGJ1ZmZlcixwcmVmaXgscG9zaXRpb24pXG4gIEdldCBjb21wbGV0aW9ucyBiYXNlZCBvbiBleHByZXNzaW9uIHR5cGUuXG4gIEl0IGlzIGFzc3VtZWQgdGhhdCBgcHJlZml4YCBzdGFydHMgd2l0aCAnXydcblxuICBidWZmZXI6IFRleHRCdWZmZXIsIGN1cnJlbnQgYnVmZmVyXG4gIHByZWZpeDogU3RyaW5nLCBjb21wbGV0aW9uIHByZWZpeFxuICBwb3NpdGlvbjogUG9pbnQsIGN1cnJlbnQgY3Vyc29yIHBvc2l0aW9uXG5cbiAgUmV0dXJuczogUHJvbWlzZShbc3ltYm9sXSlcbiAgc3ltYm9sOiBTYW1lIGFzIGdldENvbXBsZXRpb25zRm9yU3ltYm9sXG4gICovXG4gIEBoYW5kbGVFeGNlcHRpb25cbiAgcHVibGljIGFzeW5jIGdldENvbXBsZXRpb25zRm9ySG9sZShcbiAgICBidWZmZXI6IFRleHRCdWZmZXIsIHByZWZpeDogc3RyaW5nLCBwb3NpdGlvbjogUG9pbnQsXG4gICk6IFByb21pc2U8Q0IuSVN5bWJvbFtdPiB7XG4gICAgaWYgKCF0aGlzLmlzQWN0aXZlKSB7IHRocm93IG5ldyBFcnJvcignQmFja2VuZCBpbmFjdGl2ZScpIH1cbiAgICBjb25zdCByYW5nZSA9IG5ldyBSYW5nZShwb3NpdGlvbiwgcG9zaXRpb24pXG4gICAgaWYgKHByZWZpeC5zdGFydHNXaXRoKCdfJykpIHsgcHJlZml4ID0gcHJlZml4LnNsaWNlKDEpIH1cbiAgICBjb25zdCB7IHR5cGUgfSA9IGF3YWl0IHRoaXMucHJvY2Vzcy5nZXRUeXBlSW5CdWZmZXIoYnVmZmVyLCByYW5nZSlcbiAgICBjb25zdCBzeW1ib2xzID0gYXdhaXQgdGhpcy5nZXRTeW1ib2xzRm9yQnVmZmVyKGJ1ZmZlcilcbiAgICBjb25zdCB0cyA9IHN5bWJvbHMuZmlsdGVyKChzKSA9PiB7XG4gICAgICBpZiAoIXMudHlwZVNpZ25hdHVyZSkgeyByZXR1cm4gZmFsc2UgfVxuICAgICAgY29uc3QgdGwgPSBzLnR5cGVTaWduYXR1cmUuc3BsaXQoJyAtPiAnKS5zbGljZSgtMSlbMF1cbiAgICAgIGlmICh0bC5tYXRjaCgvXlthLXpdJC8pKSB7IHJldHVybiBmYWxzZSB9XG4gICAgICBjb25zdCB0czIgPSB0bC5yZXBsYWNlKC9bLj8qK14kW1xcXVxcXFwoKXt9fC1dL2csICdcXFxcJCYnKVxuICAgICAgY29uc3QgcnggPSBSZWdFeHAodHMyLnJlcGxhY2UoL1xcYlthLXpdXFxiL2csICcuKycpLCAnJylcbiAgICAgIHJldHVybiByeC50ZXN0KHR5cGUpXG4gICAgfSlcbiAgICBpZiAocHJlZml4Lmxlbmd0aCA9PT0gMCkge1xuICAgICAgLy8gdHNsaW50OmRpc2FibGUtbmV4dC1saW5lOiBuby1ub24tbnVsbC1hc3NlcnRpb25cbiAgICAgIHJldHVybiB0cy5zb3J0KChhLCBiKSA9PiBGWi5zY29yZShiLnR5cGVTaWduYXR1cmUhLCB0eXBlKSAtIEZaLnNjb3JlKGEudHlwZVNpZ25hdHVyZSEsIHR5cGUpKVxuICAgIH0gZWxzZSB7XG4gICAgICByZXR1cm4gRlouZmlsdGVyKHRzLCBwcmVmaXgsIHsga2V5OiAncW5hbWUnIH0pXG4gICAgfVxuICB9XG5cbiAgcHJpdmF0ZSBhc3luYyBnZXRTeW1ib2xzRm9yQnVmZmVyKFxuICAgIGJ1ZmZlcjogVGV4dEJ1ZmZlciwgc3ltYm9sVHlwZXM/OiBDQi5TeW1ib2xUeXBlW10sXG4gICk6IFByb21pc2U8Q0IuSVN5bWJvbFtdPiB7XG4gICAgY29uc3QgeyBidWZmZXJJbmZvIH0gPSB0aGlzLmdldEJ1ZmZlckluZm8oeyBidWZmZXIgfSlcbiAgICBjb25zdCB7IHJvb3REaXIsIG1vZHVsZU1hcCB9ID0gYXdhaXQgdGhpcy5nZXRNb2R1bGVNYXAoeyBidWZmZXJJbmZvIH0pXG4gICAgaWYgKGJ1ZmZlckluZm8gJiYgbW9kdWxlTWFwKSB7XG4gICAgICBjb25zdCBpbXBvcnRzID0gYXdhaXQgYnVmZmVySW5mby5nZXRJbXBvcnRzKClcbiAgICAgIGNvbnN0IHByb21pc2VzID0gYXdhaXQgUHJvbWlzZS5hbGwoXG4gICAgICAgIGltcG9ydHMubWFwKGFzeW5jIChpbXApID0+IHtcbiAgICAgICAgICBjb25zdCByZXMgPSBhd2FpdCB0aGlzLmdldE1vZHVsZUluZm8oe1xuICAgICAgICAgICAgYnVmZmVySW5mbyxcbiAgICAgICAgICAgIG1vZHVsZU5hbWU6IGltcC5uYW1lLFxuICAgICAgICAgICAgcm9vdERpcixcbiAgICAgICAgICAgIG1vZHVsZU1hcCxcbiAgICAgICAgICB9KVxuICAgICAgICAgIGlmICghcmVzKSB7IHJldHVybiBbXSB9XG4gICAgICAgICAgcmV0dXJuIHJlcy5tb2R1bGVJbmZvLnNlbGVjdChpbXAsIHN5bWJvbFR5cGVzKVxuICAgICAgICB9KSxcbiAgICAgIClcbiAgICAgIHJldHVybiAoW10gYXMgdHlwZW9mIHByb21pc2VzWzBdKS5jb25jYXQoLi4ucHJvbWlzZXMpXG4gICAgfSBlbHNlIHtcbiAgICAgIHJldHVybiBbXVxuICAgIH1cbiAgfVxuXG4gIHByaXZhdGUgZ2V0QnVmZmVySW5mbyh7IGJ1ZmZlciB9OiB7IGJ1ZmZlcjogVGV4dEJ1ZmZlciB9KTogeyBidWZmZXJJbmZvOiBCdWZmZXJJbmZvIH0ge1xuICAgIGxldCBiaSA9IHRoaXMuYnVmZmVyTWFwLmdldChidWZmZXIpXG4gICAgaWYgKCFiaSkge1xuICAgICAgYmkgPSBuZXcgQnVmZmVySW5mbyhidWZmZXIpXG4gICAgICB0aGlzLmJ1ZmZlck1hcC5zZXQoYnVmZmVyLCBiaSlcbiAgICB9XG4gICAgcmV0dXJuIHsgYnVmZmVySW5mbzogYmkgfVxuICB9XG5cbiAgcHJpdmF0ZSBhc3luYyBnZXRNb2R1bGVNYXAoXG4gICAgeyBidWZmZXJJbmZvLCByb290RGlyIH06IHsgYnVmZmVySW5mbzogQnVmZmVySW5mbywgcm9vdERpcj86IERpcmVjdG9yeSB9LFxuICApOiBQcm9taXNlPHsgcm9vdERpcjogRGlyZWN0b3J5LCBtb2R1bGVNYXA6IE1hcDxzdHJpbmcsIE1vZHVsZUluZm8+IH0+IHtcbiAgICBpZiAoIXJvb3REaXIpIHtcbiAgICAgIHJvb3REaXIgPSBhd2FpdCB0aGlzLnByb2Nlc3MuZ2V0Um9vdERpcihidWZmZXJJbmZvLmJ1ZmZlcilcbiAgICB9XG4gICAgbGV0IG1tID0gdGhpcy5kaXJNYXAuZ2V0KHJvb3REaXIpXG4gICAgaWYgKCFtbSkge1xuICAgICAgbW0gPSBuZXcgTWFwKClcbiAgICAgIHRoaXMuZGlyTWFwLnNldChyb290RGlyLCBtbSlcbiAgICB9XG5cbiAgICByZXR1cm4ge1xuICAgICAgcm9vdERpcixcbiAgICAgIG1vZHVsZU1hcDogbW0sXG4gICAgfVxuICB9XG5cbiAgcHJpdmF0ZSBhc3luYyBnZXRNb2R1bGVJbmZvKFxuICAgIGFyZzoge1xuICAgICAgYnVmZmVySW5mbzogQnVmZmVySW5mbywgbW9kdWxlTmFtZT86IHN0cmluZyxcbiAgICAgIHJvb3REaXI/OiBEaXJlY3RvcnksIG1vZHVsZU1hcD86IE1hcDxzdHJpbmcsIE1vZHVsZUluZm8+XG4gICAgfSxcbiAgKSB7XG4gICAgY29uc3QgeyBidWZmZXJJbmZvIH0gPSBhcmdcbiAgICBsZXQgZGF0XG4gICAgaWYgKGFyZy5yb290RGlyICYmIGFyZy5tb2R1bGVNYXApIHtcbiAgICAgIGRhdCA9IHsgcm9vdERpcjogYXJnLnJvb3REaXIsIG1vZHVsZU1hcDogYXJnLm1vZHVsZU1hcCB9XG4gICAgfSBlbHNlIHtcbiAgICAgIGRhdCA9IGF3YWl0IHRoaXMuZ2V0TW9kdWxlTWFwKHsgYnVmZmVySW5mbyB9KVxuICAgIH1cbiAgICBjb25zdCB7IG1vZHVsZU1hcCwgcm9vdERpciB9ID0gZGF0XG4gICAgbGV0IG1vZHVsZU5hbWUgPSBhcmcubW9kdWxlTmFtZVxuICAgIGlmICghbW9kdWxlTmFtZSkge1xuICAgICAgbW9kdWxlTmFtZSA9IGF3YWl0IGJ1ZmZlckluZm8uZ2V0TW9kdWxlTmFtZSgpXG4gICAgfVxuICAgIGlmICghbW9kdWxlTmFtZSkge1xuICAgICAgdGhyb3cgbmV3IEVycm9yKGBOYW1lbGVzcyBtb2R1bGUgaW4gJHtidWZmZXJJbmZvLmJ1ZmZlci5nZXRVcmkoKX1gKVxuICAgIH1cblxuICAgIGxldCBtb2R1bGVJbmZvID0gbW9kdWxlTWFwLmdldChtb2R1bGVOYW1lKVxuICAgIGlmICghbW9kdWxlSW5mbykge1xuICAgICAgbW9kdWxlSW5mbyA9IG5ldyBNb2R1bGVJbmZvKG1vZHVsZU5hbWUsIHRoaXMucHJvY2Vzcywgcm9vdERpcilcbiAgICAgIG1vZHVsZU1hcC5zZXQobW9kdWxlTmFtZSwgbW9kdWxlSW5mbylcblxuICAgICAgY29uc3QgbW4gPSBtb2R1bGVOYW1lXG4gICAgICBtb2R1bGVJbmZvLm9uRGlkRGVzdHJveSgoKSA9PiB7XG4gICAgICAgIG1vZHVsZU1hcC5kZWxldGUobW4pXG4gICAgICAgIFV0aWwuZGVidWcoYCR7bW9kdWxlTmFtZX0gcmVtb3ZlZCBmcm9tIG1hcGApXG4gICAgICB9KVxuICAgIH1cbiAgICBhd2FpdCBtb2R1bGVJbmZvLnNldEJ1ZmZlcihidWZmZXJJbmZvKVxuICAgIHJldHVybiB7IGJ1ZmZlckluZm8sIHJvb3REaXIsIG1vZHVsZU1hcCwgbW9kdWxlSW5mbywgbW9kdWxlTmFtZSB9XG4gIH1cblxuICBwcml2YXRlIGZpbHRlcjxULCBLIGV4dGVuZHMga2V5b2YgVD4oY2FuZGlkYXRlczogVFtdLCBwcmVmaXg6IHN0cmluZywga2V5czogS1tdKTogVFtdIHtcbiAgICBpZiAoIXByZWZpeCkge1xuICAgICAgcmV0dXJuIGNhbmRpZGF0ZXNcbiAgICB9XG4gICAgY29uc3QgbGlzdCA9IFtdXG4gICAgZm9yIChjb25zdCBjYW5kaWRhdGUgb2YgY2FuZGlkYXRlcykge1xuICAgICAgY29uc3Qgc2NvcmVzID0ga2V5cy5tYXAoKGtleSkgPT4ge1xuICAgICAgICBjb25zdCBjayA9IGNhbmRpZGF0ZVtrZXldXG4gICAgICAgIGlmIChjaykge1xuICAgICAgICAgIHJldHVybiBGWi5zY29yZShjay50b1N0cmluZygpLCBwcmVmaXgpXG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgcmV0dXJuIDBcbiAgICAgICAgfVxuICAgICAgfSlcbiAgICAgIGNvbnN0IHNjb3JlID0gTWF0aC5tYXgoLi4uc2NvcmVzKVxuICAgICAgaWYgKHNjb3JlID4gMCkge1xuICAgICAgICBsaXN0LnB1c2goe1xuICAgICAgICAgIHNjb3JlLFxuICAgICAgICAgIHNjb3JlTjogc2NvcmVzLmluZGV4T2Yoc2NvcmUpLFxuICAgICAgICAgIGRhdGE6IGNhbmRpZGF0ZSxcbiAgICAgICAgfSlcbiAgICAgIH1cbiAgICB9XG4gICAgcmV0dXJuIGxpc3Quc29ydCgoYSwgYikgPT4ge1xuICAgICAgY29uc3QgcyA9IGIuc2NvcmUgLSBhLnNjb3JlXG4gICAgICBpZiAocyA9PT0gMCkge1xuICAgICAgICByZXR1cm4gYS5zY29yZU4gLSBiLnNjb3JlTlxuICAgICAgfVxuICAgICAgcmV0dXJuIHNcbiAgICB9KS5tYXAoKHsgZGF0YSB9KSA9PiBkYXRhKVxuICB9XG59XG4iXX0=