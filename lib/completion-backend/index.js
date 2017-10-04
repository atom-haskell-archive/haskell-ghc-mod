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
            const symbols = mis.moduleInfo.select({
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaW5kZXguanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi9zcmMvY29tcGxldGlvbi1iYWNrZW5kL2luZGV4LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7QUFBQSxpQ0FBZ0M7QUFDaEMsK0JBRWE7QUFDYiwrQ0FBMEM7QUFDMUMsK0NBQTBDO0FBRTFDLGdDQUErQjtBQUMvQixrQ0FBeUM7QUFHekM7SUFRRSxZQUFvQixPQUF1QixFQUFTLEdBQThCO1FBQTlELFlBQU8sR0FBUCxPQUFPLENBQWdCO1FBQVMsUUFBRyxHQUFILEdBQUcsQ0FBMkI7UUFDaEYsSUFBSSxDQUFDLFNBQVMsR0FBRyxJQUFJLE9BQU8sRUFBRSxDQUFBO1FBQzlCLElBQUksQ0FBQyxNQUFNLEdBQUcsSUFBSSxPQUFPLEVBQUUsQ0FBQTtRQUMzQixJQUFJLENBQUMsVUFBVSxHQUFHLElBQUksT0FBTyxFQUFFLENBQUE7UUFDL0IsSUFBSSxDQUFDLGVBQWUsR0FBRyxJQUFJLE9BQU8sRUFBRSxDQUFBO1FBQ3BDLElBQUksQ0FBQyxlQUFlLEdBQUcsSUFBSSxPQUFPLEVBQUUsQ0FBQTtRQUdwQyxJQUFJLENBQUMsSUFBSSxHQUFHLElBQUksQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxDQUFBO1FBQ2hDLElBQUksQ0FBQyxZQUFZLEdBQUcsSUFBSSxDQUFDLFlBQVksQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLENBQUE7UUFDaEQsSUFBSSxDQUFDLHdCQUF3QixHQUFHLElBQUksQ0FBQyx3QkFBd0IsQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLENBQUE7UUFDeEUsSUFBSSxDQUFDLDBCQUEwQixHQUFHLElBQUksQ0FBQywwQkFBMEIsQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLENBQUE7UUFDNUUsSUFBSSxDQUFDLHVCQUF1QixHQUFHLElBQUksQ0FBQyx1QkFBdUIsQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLENBQUE7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QUFNLENBQUMsQ0FBQTtZQUNqQyxFQUFFLENBQUMsQ0FBQyxLQUFLLEdBQUcsQ0FBQyxDQUFDLENBQUMsQ0FBQztnQkFDZCxJQUFJLENBQUMsSUFBSSxDQUFDO29CQUNSLEtBQUs7b0JBQ0wsTUFBTSxFQUFFLE1BQU0sQ0FBQyxPQUFPLENBQUMsS0FBSyxDQUFDO29CQUM3QixJQUFJLEVBQUUsU0FBUztpQkFDaEIsQ0FBQyxDQUFBO1lBQ0osQ0FBQztRQUNILENBQUM7UUFDRCxNQUFNLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLEVBQUUsRUFBRTtZQUN4QixNQUFNLENBQUMsR0FBRyxDQUFDLENBQUMsS0FBSyxHQUFHLENBQUMsQ0FBQyxLQUFLLENBQUE7WUFDM0IsRUFBRSxDQUFDLENBQUMsQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDLENBQUM7Z0JBQ1osTUFBTSxDQUFDLENBQUMsQ0FBQyxNQUFNLEdBQUcsQ0FBQyxDQUFDLE1BQU0sQ0FBQTtZQUM1QixDQUFDO1lBQ0QsTUFBTSxDQUFDLENBQUMsQ0FBQTtRQUNWLENBQUMsQ0FBQyxDQUFDLEdBQUcsQ0FBQyxDQUFDLEVBQUUsSUFBSSxFQUFFLEVBQUUsRUFBRSxDQUFDLElBQUksQ0FBQyxDQUFBO0lBQzVCLENBQUM7Q0FDRjtBQXZVQztJQURDLHNCQUFlOztxQ0FFTixpQkFBVSxVQUE0QixZQUFLOztnRUFNcEQ7QUFhRDtJQURDLHNCQUFlOztxQ0FFTixpQkFBVSxVQUE0QixZQUFLOzs4REFNcEQ7QUEySkQ7SUFEQyxzQkFBZTs7cUNBRU4saUJBQVUsVUFBNEIsWUFBSzs7OERBcUJwRDtBQXBVSCw4Q0ErYkMiLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgKiBhcyBGWiBmcm9tICdmdXp6YWxkcmluJ1xuaW1wb3J0IHtcbiAgVGV4dEJ1ZmZlciwgUG9pbnQsIERpc3Bvc2FibGUsIFJhbmdlLCBEaXJlY3Rvcnlcbn0gZnJvbSAnYXRvbSdcbmltcG9ydCB7IEJ1ZmZlckluZm8gfSBmcm9tICcuL2J1ZmZlci1pbmZvJ1xuaW1wb3J0IHsgTW9kdWxlSW5mbyB9IGZyb20gJy4vbW9kdWxlLWluZm8nXG5pbXBvcnQgeyBHaGNNb2RpUHJvY2VzcyB9IGZyb20gJy4uL2doYy1tb2QnXG5pbXBvcnQgKiBhcyBVdGlsIGZyb20gJy4uL3V0aWwnXG5pbXBvcnQgeyBoYW5kbGVFeGNlcHRpb24gfSBmcm9tICcuLi91dGlsJ1xuaW1wb3J0IENCID0gVVBJLkNvbXBsZXRpb25CYWNrZW5kXG5cbmV4cG9ydCBjbGFzcyBDb21wbGV0aW9uQmFja2VuZCBpbXBsZW1lbnRzIENCLklDb21wbGV0aW9uQmFja2VuZCB7XG4gIHByaXZhdGUgYnVmZmVyTWFwOiBXZWFrTWFwPFRleHRCdWZmZXIsIEJ1ZmZlckluZm8+XG4gIHByaXZhdGUgZGlyTWFwOiBXZWFrTWFwPERpcmVjdG9yeSwgTWFwPHN0cmluZywgTW9kdWxlSW5mbz4+XG4gIHByaXZhdGUgbW9kTGlzdE1hcDogV2Vha01hcDxEaXJlY3RvcnksIHN0cmluZ1tdPlxuICBwcml2YXRlIGxhbmd1YWdlUHJhZ21hczogV2Vha01hcDxEaXJlY3RvcnksIHN0cmluZ1tdPlxuICBwcml2YXRlIGNvbXBpbGVyT3B0aW9uczogV2Vha01hcDxEaXJlY3RvcnksIHN0cmluZ1tdPlxuICBwcml2YXRlIGlzQWN0aXZlOiBib29sZWFuXG5cbiAgY29uc3RydWN0b3IocHJpdmF0ZSBwcm9jZXNzOiBHaGNNb2RpUHJvY2VzcywgcHVibGljIHVwaTogUHJvbWlzZTxVUEkuSVVQSUluc3RhbmNlPikge1xuICAgIHRoaXMuYnVmZmVyTWFwID0gbmV3IFdlYWtNYXAoKVxuICAgIHRoaXMuZGlyTWFwID0gbmV3IFdlYWtNYXAoKVxuICAgIHRoaXMubW9kTGlzdE1hcCA9IG5ldyBXZWFrTWFwKClcbiAgICB0aGlzLmxhbmd1YWdlUHJhZ21hcyA9IG5ldyBXZWFrTWFwKClcbiAgICB0aGlzLmNvbXBpbGVyT3B0aW9ucyA9IG5ldyBXZWFrTWFwKClcblxuICAgIC8vIGNvbXBhdGliaWxpdHkgd2l0aCBvbGQgY2xpZW50c1xuICAgIHRoaXMubmFtZSA9IHRoaXMubmFtZS5iaW5kKHRoaXMpXG4gICAgdGhpcy5vbkRpZERlc3Ryb3kgPSB0aGlzLm9uRGlkRGVzdHJveS5iaW5kKHRoaXMpXG4gICAgdGhpcy5yZWdpc3RlckNvbXBsZXRpb25CdWZmZXIgPSB0aGlzLnJlZ2lzdGVyQ29tcGxldGlvbkJ1ZmZlci5iaW5kKHRoaXMpXG4gICAgdGhpcy51bnJlZ2lzdGVyQ29tcGxldGlvbkJ1ZmZlciA9IHRoaXMudW5yZWdpc3RlckNvbXBsZXRpb25CdWZmZXIuYmluZCh0aGlzKVxuICAgIHRoaXMuZ2V0Q29tcGxldGlvbnNGb3JTeW1ib2wgPSB0aGlzLmdldENvbXBsZXRpb25zRm9yU3ltYm9sLmJpbmQodGhpcylcbiAgICB0aGlzLmdldENvbXBsZXRpb25zRm9yVHlwZSA9IHRoaXMuZ2V0Q29tcGxldGlvbnNGb3JUeXBlLmJpbmQodGhpcylcbiAgICB0aGlzLmdldENvbXBsZXRpb25zRm9yQ2xhc3MgPSB0aGlzLmdldENvbXBsZXRpb25zRm9yQ2xhc3MuYmluZCh0aGlzKVxuICAgIHRoaXMuZ2V0Q29tcGxldGlvbnNGb3JNb2R1bGUgPSB0aGlzLmdldENvbXBsZXRpb25zRm9yTW9kdWxlLmJpbmQodGhpcylcbiAgICB0aGlzLmdldENvbXBsZXRpb25zRm9yU3ltYm9sSW5Nb2R1bGUgPSB0aGlzLmdldENvbXBsZXRpb25zRm9yU3ltYm9sSW5Nb2R1bGUuYmluZCh0aGlzKVxuICAgIHRoaXMuZ2V0Q29tcGxldGlvbnNGb3JMYW5ndWFnZVByYWdtYXMgPSB0aGlzLmdldENvbXBsZXRpb25zRm9yTGFuZ3VhZ2VQcmFnbWFzLmJpbmQodGhpcylcbiAgICB0aGlzLmdldENvbXBsZXRpb25zRm9yQ29tcGlsZXJPcHRpb25zID0gdGhpcy5nZXRDb21wbGV0aW9uc0ZvckNvbXBpbGVyT3B0aW9ucy5iaW5kKHRoaXMpXG4gICAgdGhpcy5nZXRDb21wbGV0aW9uc0ZvckhvbGUgPSB0aGlzLmdldENvbXBsZXRpb25zRm9ySG9sZS5iaW5kKHRoaXMpXG5cbiAgICB0aGlzLnByb2Nlc3MgPSBwcm9jZXNzXG4gICAgdGhpcy5pc0FjdGl2ZSA9IHRydWVcbiAgICB0aGlzLnByb2Nlc3Mub25EaWREZXN0cm95KCgpID0+IHsgdGhpcy5pc0FjdGl2ZSA9IGZhbHNlIH0pXG4gIH1cblxuICAvKiBQdWJsaWMgaW50ZXJmYWNlIGJlbG93ICovXG5cbiAgLypcbiAgbmFtZSgpXG4gIEdldCBiYWNrZW5kIG5hbWVcblxuICBSZXR1cm5zIFN0cmluZywgdW5pcXVlIHN0cmluZyBkZXNjcmliaW5nIGEgZ2l2ZW4gYmFja2VuZFxuICAqL1xuICBwdWJsaWMgbmFtZSgpIHsgcmV0dXJuICdoYXNrZWxsLWdoYy1tb2QnIH1cblxuICAvKlxuICBvbkRpZERlc3Ryb3koY2FsbGJhY2spXG4gIERlc3RydWN0aW9uIGV2ZW50IHN1YnNjcmlwdGlvbi4gVXN1YWxseSBzaG91bGQgYmUgY2FsbGVkIG9ubHkgb25cbiAgcGFja2FnZSBkZWFjdGl2YXRpb24uXG4gIGNhbGxiYWNrOiAoKSAtPlxuICAqL1xuICBwdWJsaWMgb25EaWREZXN0cm95KGNhbGxiYWNrOiAoKSA9PiB2b2lkKSB7XG4gICAgaWYgKCF0aGlzLmlzQWN0aXZlKSB7IHRocm93IG5ldyBFcnJvcignQmFja2VuZCBpbmFjdGl2ZScpIH1cbiAgICByZXR1cm4gdGhpcy5wcm9jZXNzLm9uRGlkRGVzdHJveShjYWxsYmFjaylcbiAgfVxuXG4gIC8qXG4gIHJlZ2lzdGVyQ29tcGxldGlvbkJ1ZmZlcihidWZmZXIpXG4gIEV2ZXJ5IGJ1ZmZlciB0aGF0IHdvdWxkIGJlIHVzZWQgd2l0aCBhdXRvY29tcGxldGlvbiBmdW5jdGlvbnMgaGFzIHRvXG4gIGJlIHJlZ2lzdGVyZWQgd2l0aCB0aGlzIGZ1bmN0aW9uLlxuXG4gIGJ1ZmZlcjogVGV4dEJ1ZmZlciwgYnVmZmVyIHRvIGJlIHVzZWQgaW4gYXV0b2NvbXBsZXRpb25cblxuICBSZXR1cm5zOiBEaXNwb3NhYmxlLCB3aGljaCB3aWxsIHJlbW92ZSBidWZmZXIgZnJvbSBhdXRvY29tcGxldGlvblxuICAqL1xuICBwdWJsaWMgcmVnaXN0ZXJDb21wbGV0aW9uQnVmZmVyKGJ1ZmZlcjogVGV4dEJ1ZmZlcikge1xuICAgIGlmICghdGhpcy5pc0FjdGl2ZSkgeyB0aHJvdyBuZXcgRXJyb3IoJ0JhY2tlbmQgaW5hY3RpdmUnKSB9XG5cbiAgICBpZiAodGhpcy5idWZmZXJNYXAuaGFzKGJ1ZmZlcikpIHtcbiAgICAgIHJldHVybiBuZXcgRGlzcG9zYWJsZSgoKSA9PiB7IC8qIHZvaWQgKi8gfSlcbiAgICB9XG5cbiAgICBjb25zdCB7IGJ1ZmZlckluZm8gfSA9IHRoaXMuZ2V0QnVmZmVySW5mbyh7IGJ1ZmZlciB9KVxuXG4gICAgc2V0SW1tZWRpYXRlKGFzeW5jICgpID0+IHtcbiAgICAgIGNvbnN0IHsgcm9vdERpciwgbW9kdWxlTWFwIH0gPSBhd2FpdCB0aGlzLmdldE1vZHVsZU1hcCh7IGJ1ZmZlckluZm8gfSlcblxuICAgICAgdGhpcy5nZXRNb2R1bGVJbmZvKHsgYnVmZmVySW5mbywgcm9vdERpciwgbW9kdWxlTWFwIH0pXG5cbiAgICAgIGNvbnN0IGltcG9ydHMgPSBhd2FpdCBidWZmZXJJbmZvLmdldEltcG9ydHMoKVxuICAgICAgZm9yIChjb25zdCBpbXBydCBvZiBpbXBvcnRzKSB7XG4gICAgICAgIHRoaXMuZ2V0TW9kdWxlSW5mbyh7IG1vZHVsZU5hbWU6IGltcHJ0Lm5hbWUsIGJ1ZmZlckluZm8sIHJvb3REaXIsIG1vZHVsZU1hcCB9KVxuICAgICAgfVxuICAgIH0pXG5cbiAgICByZXR1cm4gbmV3IERpc3Bvc2FibGUoKCkgPT5cbiAgICAgIHRoaXMudW5yZWdpc3RlckNvbXBsZXRpb25CdWZmZXIoYnVmZmVyKSlcbiAgfVxuXG4gIC8qXG4gIHVucmVnaXN0ZXJDb21wbGV0aW9uQnVmZmVyKGJ1ZmZlcilcbiAgYnVmZmVyOiBUZXh0QnVmZmVyLCBidWZmZXIgdG8gYmUgcmVtb3ZlZCBmcm9tIGF1dG9jb21wbGV0aW9uXG4gICovXG4gIHB1YmxpYyB1bnJlZ2lzdGVyQ29tcGxldGlvbkJ1ZmZlcihidWZmZXI6IFRleHRCdWZmZXIpIHtcbiAgICBjb25zdCB4ID0gdGhpcy5idWZmZXJNYXAuZ2V0KGJ1ZmZlcilcbiAgICBpZiAoeCkge1xuICAgICAgeC5kZXN0cm95KClcbiAgICB9XG4gIH1cblxuICAvKlxuICBnZXRDb21wbGV0aW9uc0ZvclN5bWJvbChidWZmZXIscHJlZml4LHBvc2l0aW9uKVxuICBidWZmZXI6IFRleHRCdWZmZXIsIGN1cnJlbnQgYnVmZmVyXG4gIHByZWZpeDogU3RyaW5nLCBjb21wbGV0aW9uIHByZWZpeFxuICBwb3NpdGlvbjogUG9pbnQsIGN1cnJlbnQgY3Vyc29yIHBvc2l0aW9uXG5cbiAgUmV0dXJuczogUHJvbWlzZShbc3ltYm9sXSlcbiAgc3ltYm9sOiBPYmplY3QsIGEgY29tcGxldGlvbiBzeW1ib2xcbiAgICBuYW1lOiBTdHJpbmcsIHN5bWJvbCBuYW1lXG4gICAgcW5hbWU6IFN0cmluZywgcXVhbGlmaWVkIG5hbWUsIGlmIG1vZHVsZSBpcyBxdWFsaWZpZWQuXG4gICAgICAgICAgIE90aGVyd2lzZSwgc2FtZSBhcyBuYW1lXG4gICAgdHlwZVNpZ25hdHVyZTogU3RyaW5nLCB0eXBlIHNpZ25hdHVyZVxuICAgIHN5bWJvbFR5cGU6IFN0cmluZywgb25lIG9mIFsndHlwZScsICdjbGFzcycsICdmdW5jdGlvbiddXG4gICAgbW9kdWxlOiBPYmplY3QsIHN5bWJvbCBtb2R1bGUgaW5mb3JtYXRpb25cbiAgICAgIHF1YWxpZmllZDogQm9vbGVhbiwgdHJ1ZSBpZiBtb2R1bGUgaXMgaW1wb3J0ZWQgYXMgcXVhbGlmaWVkXG4gICAgICBuYW1lOiBTdHJpbmcsIG1vZHVsZSBuYW1lXG4gICAgICBhbGlhczogU3RyaW5nLCBtb2R1bGUgYWxpYXNcbiAgICAgIGhpZGluZzogQm9vbGVhbiwgdHJ1ZSBpZiBtb2R1bGUgaXMgaW1wb3J0ZWQgd2l0aCBoaWRpbmcgY2xhdXNlXG4gICAgICBpbXBvcnRMaXN0OiBbU3RyaW5nXSwgYXJyYXkgb2YgZXhwbGljaXQgaW1wb3J0cy9oaWRkZW4gaW1wb3J0c1xuICAqL1xuICBAaGFuZGxlRXhjZXB0aW9uXG4gIHB1YmxpYyBhc3luYyBnZXRDb21wbGV0aW9uc0ZvclN5bWJvbChcbiAgICBidWZmZXI6IFRleHRCdWZmZXIsIHByZWZpeDogc3RyaW5nLCBwb3NpdGlvbjogUG9pbnQsXG4gICk6IFByb21pc2U8Q0IuSVN5bWJvbFtdPiB7XG4gICAgaWYgKCF0aGlzLmlzQWN0aXZlKSB7IHRocm93IG5ldyBFcnJvcignQmFja2VuZCBpbmFjdGl2ZScpIH1cblxuICAgIGNvbnN0IHN5bWJvbHMgPSBhd2FpdCB0aGlzLmdldFN5bWJvbHNGb3JCdWZmZXIoYnVmZmVyKVxuICAgIHJldHVybiB0aGlzLmZpbHRlcihzeW1ib2xzLCBwcmVmaXgsIFsncW5hbWUnLCAncXBhcmVudCddKVxuICB9XG5cbiAgLypcbiAgZ2V0Q29tcGxldGlvbnNGb3JUeXBlKGJ1ZmZlcixwcmVmaXgscG9zaXRpb24pXG4gIGJ1ZmZlcjogVGV4dEJ1ZmZlciwgY3VycmVudCBidWZmZXJcbiAgcHJlZml4OiBTdHJpbmcsIGNvbXBsZXRpb24gcHJlZml4XG4gIHBvc2l0aW9uOiBQb2ludCwgY3VycmVudCBjdXJzb3IgcG9zaXRpb25cblxuICBSZXR1cm5zOiBQcm9taXNlKFtzeW1ib2xdKVxuICBzeW1ib2w6IFNhbWUgYXMgZ2V0Q29tcGxldGlvbnNGb3JTeW1ib2wsIGV4Y2VwdFxuICAgICAgICAgIHN5bWJvbFR5cGUgaXMgb25lIG9mIFsndHlwZScsICdjbGFzcyddXG4gICovXG4gIEBoYW5kbGVFeGNlcHRpb25cbiAgcHVibGljIGFzeW5jIGdldENvbXBsZXRpb25zRm9yVHlwZShcbiAgICBidWZmZXI6IFRleHRCdWZmZXIsIHByZWZpeDogc3RyaW5nLCBwb3NpdGlvbjogUG9pbnQsXG4gICk6IFByb21pc2U8Q0IuSVN5bWJvbFtdPiB7XG4gICAgaWYgKCF0aGlzLmlzQWN0aXZlKSB7IHRocm93IG5ldyBFcnJvcignQmFja2VuZCBpbmFjdGl2ZScpIH1cblxuICAgIGNvbnN0IHN5bWJvbHMgPSBhd2FpdCB0aGlzLmdldFN5bWJvbHNGb3JCdWZmZXIoYnVmZmVyLCBbJ3R5cGUnLCAnY2xhc3MnXSlcbiAgICByZXR1cm4gRlouZmlsdGVyKHN5bWJvbHMsIHByZWZpeCwgeyBrZXk6ICdxbmFtZScgfSlcbiAgfVxuXG4gIC8qXG4gIGdldENvbXBsZXRpb25zRm9yQ2xhc3MoYnVmZmVyLHByZWZpeCxwb3NpdGlvbilcbiAgYnVmZmVyOiBUZXh0QnVmZmVyLCBjdXJyZW50IGJ1ZmZlclxuICBwcmVmaXg6IFN0cmluZywgY29tcGxldGlvbiBwcmVmaXhcbiAgcG9zaXRpb246IFBvaW50LCBjdXJyZW50IGN1cnNvciBwb3NpdGlvblxuXG4gIFJldHVybnM6IFByb21pc2UoW3N5bWJvbF0pXG4gIHN5bWJvbDogU2FtZSBhcyBnZXRDb21wbGV0aW9uc0ZvclN5bWJvbCwgZXhjZXB0XG4gICAgICAgICAgc3ltYm9sVHlwZSBpcyBvbmUgb2YgWydjbGFzcyddXG4gICovXG4gIHB1YmxpYyBhc3luYyBnZXRDb21wbGV0aW9uc0ZvckNsYXNzKFxuICAgIGJ1ZmZlcjogVGV4dEJ1ZmZlciwgcHJlZml4OiBzdHJpbmcsIHBvc2l0aW9uOiBQb2ludCxcbiAgKTogUHJvbWlzZTxDQi5JU3ltYm9sW10+IHtcbiAgICBpZiAoIXRoaXMuaXNBY3RpdmUpIHsgdGhyb3cgbmV3IEVycm9yKCdCYWNrZW5kIGluYWN0aXZlJykgfVxuXG4gICAgY29uc3Qgc3ltYm9scyA9IGF3YWl0IHRoaXMuZ2V0U3ltYm9sc0ZvckJ1ZmZlcihidWZmZXIsIFsnY2xhc3MnXSlcbiAgICByZXR1cm4gRlouZmlsdGVyKHN5bWJvbHMsIHByZWZpeCwgeyBrZXk6ICdxbmFtZScgfSlcbiAgfVxuXG4gIC8qXG4gIGdldENvbXBsZXRpb25zRm9yTW9kdWxlKGJ1ZmZlcixwcmVmaXgscG9zaXRpb24pXG4gIGJ1ZmZlcjogVGV4dEJ1ZmZlciwgY3VycmVudCBidWZmZXJcbiAgcHJlZml4OiBTdHJpbmcsIGNvbXBsZXRpb24gcHJlZml4XG4gIHBvc2l0aW9uOiBQb2ludCwgY3VycmVudCBjdXJzb3IgcG9zaXRpb25cblxuICBSZXR1cm5zOiBQcm9taXNlKFttb2R1bGVdKVxuICBtb2R1bGU6IFN0cmluZywgbW9kdWxlIG5hbWVcbiAgKi9cbiAgcHVibGljIGFzeW5jIGdldENvbXBsZXRpb25zRm9yTW9kdWxlKFxuICAgIGJ1ZmZlcjogVGV4dEJ1ZmZlciwgcHJlZml4OiBzdHJpbmcsIHBvc2l0aW9uOiBQb2ludCxcbiAgKTogUHJvbWlzZTxzdHJpbmdbXT4ge1xuICAgIGlmICghdGhpcy5pc0FjdGl2ZSkgeyB0aHJvdyBuZXcgRXJyb3IoJ0JhY2tlbmQgaW5hY3RpdmUnKSB9XG4gICAgY29uc3Qgcm9vdERpciA9IGF3YWl0IHRoaXMucHJvY2Vzcy5nZXRSb290RGlyKGJ1ZmZlcilcbiAgICBsZXQgbW9kdWxlcyA9IHRoaXMubW9kTGlzdE1hcC5nZXQocm9vdERpcilcbiAgICBpZiAoIW1vZHVsZXMpIHtcbiAgICAgIG1vZHVsZXMgPSBhd2FpdCB0aGlzLnByb2Nlc3MucnVuTGlzdChidWZmZXIpXG4gICAgICB0aGlzLm1vZExpc3RNYXAuc2V0KHJvb3REaXIsIG1vZHVsZXMpXG4gICAgICAvLyByZWZyZXNoIGV2ZXJ5IG1pbnV0ZVxuICAgICAgc2V0VGltZW91dCgoKCkgPT4gdGhpcy5tb2RMaXN0TWFwLmRlbGV0ZShyb290RGlyKSksIDYwICogMTAwMClcbiAgICB9XG4gICAgcmV0dXJuIEZaLmZpbHRlcihtb2R1bGVzLCBwcmVmaXgpXG4gIH1cblxuICAvKlxuICBnZXRDb21wbGV0aW9uc0ZvclN5bWJvbEluTW9kdWxlKGJ1ZmZlcixwcmVmaXgscG9zaXRpb24se21vZHVsZX0pXG4gIFVzZWQgaW4gaW1wb3J0IGhpZGluZy9saXN0IGNvbXBsZXRpb25zXG5cbiAgYnVmZmVyOiBUZXh0QnVmZmVyLCBjdXJyZW50IGJ1ZmZlclxuICBwcmVmaXg6IFN0cmluZywgY29tcGxldGlvbiBwcmVmaXhcbiAgcG9zaXRpb246IFBvaW50LCBjdXJyZW50IGN1cnNvciBwb3NpdGlvblxuICBtb2R1bGU6IFN0cmluZywgbW9kdWxlIG5hbWUgKG9wdGlvbmFsKS4gSWYgdW5kZWZpbmVkLCBmdW5jdGlvblxuICAgICAgICAgIHdpbGwgYXR0ZW1wdCB0byBpbmZlciBtb2R1bGUgbmFtZSBmcm9tIHBvc2l0aW9uIGFuZCBidWZmZXIuXG5cbiAgUmV0dXJuczogUHJvbWlzZShbc3ltYm9sXSlcbiAgc3ltYm9sOiBPYmplY3QsIHN5bWJvbCBpbiBnaXZlbiBtb2R1bGVcbiAgICBuYW1lOiBTdHJpbmcsIHN5bWJvbCBuYW1lXG4gICAgdHlwZVNpZ25hdHVyZTogU3RyaW5nLCB0eXBlIHNpZ25hdHVyZVxuICAgIHN5bWJvbFR5cGU6IFN0cmluZywgb25lIG9mIFsndHlwZScsICdjbGFzcycsICdmdW5jdGlvbiddXG4gICovXG4gIHB1YmxpYyBhc3luYyBnZXRDb21wbGV0aW9uc0ZvclN5bWJvbEluTW9kdWxlKFxuICAgIGJ1ZmZlcjogVGV4dEJ1ZmZlciwgcHJlZml4OiBzdHJpbmcsIHBvc2l0aW9uOiBQb2ludCxcbiAgICBvcHRzPzogeyBtb2R1bGU6IHN0cmluZyB9LFxuICApOiBQcm9taXNlPENCLklTeW1ib2xbXT4ge1xuICAgIGlmICghdGhpcy5pc0FjdGl2ZSkgeyB0aHJvdyBuZXcgRXJyb3IoJ0JhY2tlbmQgaW5hY3RpdmUnKSB9XG4gICAgbGV0IG1vZHVsZU5hbWUgPSBvcHRzID8gb3B0cy5tb2R1bGUgOiB1bmRlZmluZWRcbiAgICBpZiAoIW1vZHVsZU5hbWUpIHtcbiAgICAgIGNvbnN0IGxpbmVSYW5nZSA9IG5ldyBSYW5nZShbMCwgcG9zaXRpb24ucm93XSwgcG9zaXRpb24pXG4gICAgICBidWZmZXIuYmFja3dhcmRzU2NhbkluUmFuZ2UoXG4gICAgICAgIC9eaW1wb3J0XFxzKyhbXFx3Ll0rKS8sXG4gICAgICAgIGxpbmVSYW5nZSwgKHsgbWF0Y2ggfSkgPT4gbW9kdWxlTmFtZSA9IG1hdGNoWzFdLFxuICAgICAgKVxuICAgIH1cblxuICAgIGNvbnN0IHsgYnVmZmVySW5mbyB9ID0gdGhpcy5nZXRCdWZmZXJJbmZvKHsgYnVmZmVyIH0pXG4gICAgY29uc3QgbWlzID0gYXdhaXQgdGhpcy5nZXRNb2R1bGVJbmZvKHsgYnVmZmVySW5mbywgbW9kdWxlTmFtZSB9KVxuXG4gICAgLy8gdHNsaW50OmRpc2FibGU6IG5vLW51bGwta2V5d29yZFxuICAgIGNvbnN0IHN5bWJvbHMgPSBtaXMubW9kdWxlSW5mby5zZWxlY3QoXG4gICAgICB7XG4gICAgICAgIHF1YWxpZmllZDogZmFsc2UsXG4gICAgICAgIGhpZGluZzogZmFsc2UsXG4gICAgICAgIG5hbWU6IG1vZHVsZU5hbWUgfHwgbWlzLm1vZHVsZU5hbWUsXG4gICAgICAgIGltcG9ydExpc3Q6IG51bGwsXG4gICAgICAgIGFsaWFzOiBudWxsLFxuICAgICAgfSxcbiAgICAgIHVuZGVmaW5lZCxcbiAgICAgIHRydWUsXG4gICAgKVxuICAgIC8vIHRzbGludDplbmFibGU6IG5vLW51bGwta2V5d29yZFxuICAgIHJldHVybiBGWi5maWx0ZXIoc3ltYm9scywgcHJlZml4LCB7IGtleTogJ25hbWUnIH0pXG4gIH1cblxuICAvKlxuICBnZXRDb21wbGV0aW9uc0Zvckxhbmd1YWdlUHJhZ21hcyhidWZmZXIscHJlZml4LHBvc2l0aW9uKVxuICBidWZmZXI6IFRleHRCdWZmZXIsIGN1cnJlbnQgYnVmZmVyXG4gIHByZWZpeDogU3RyaW5nLCBjb21wbGV0aW9uIHByZWZpeFxuICBwb3NpdGlvbjogUG9pbnQsIGN1cnJlbnQgY3Vyc29yIHBvc2l0aW9uXG5cbiAgUmV0dXJuczogUHJvbWlzZShbcHJhZ21hXSlcbiAgcHJhZ21hOiBTdHJpbmcsIGxhbmd1YWdlIG9wdGlvblxuICAqL1xuICBwdWJsaWMgYXN5bmMgZ2V0Q29tcGxldGlvbnNGb3JMYW5ndWFnZVByYWdtYXMoXG4gICAgYnVmZmVyOiBUZXh0QnVmZmVyLCBwcmVmaXg6IHN0cmluZywgcG9zaXRpb246IFBvaW50LFxuICApOiBQcm9taXNlPHN0cmluZ1tdPiB7XG4gICAgaWYgKCF0aGlzLmlzQWN0aXZlKSB7IHRocm93IG5ldyBFcnJvcignQmFja2VuZCBpbmFjdGl2ZScpIH1cblxuICAgIGNvbnN0IGRpciA9IGF3YWl0IHRoaXMucHJvY2Vzcy5nZXRSb290RGlyKGJ1ZmZlcilcblxuICAgIGxldCBwcyA9IHRoaXMubGFuZ3VhZ2VQcmFnbWFzLmdldChkaXIpXG4gICAgaWYgKCFwcykge1xuICAgICAgcHMgPSBhd2FpdCB0aGlzLnByb2Nlc3MucnVuTGFuZyhkaXIpXG4gICAgICBwcyAmJiB0aGlzLmxhbmd1YWdlUHJhZ21hcy5zZXQoZGlyLCBwcylcbiAgICB9XG4gICAgcmV0dXJuIEZaLmZpbHRlcihwcywgcHJlZml4KVxuICB9XG5cbiAgLypcbiAgZ2V0Q29tcGxldGlvbnNGb3JDb21waWxlck9wdGlvbnMoYnVmZmVyLHByZWZpeCxwb3NpdGlvbilcbiAgYnVmZmVyOiBUZXh0QnVmZmVyLCBjdXJyZW50IGJ1ZmZlclxuICBwcmVmaXg6IFN0cmluZywgY29tcGxldGlvbiBwcmVmaXhcbiAgcG9zaXRpb246IFBvaW50LCBjdXJyZW50IGN1cnNvciBwb3NpdGlvblxuXG4gIFJldHVybnM6IFByb21pc2UoW2doY29wdF0pXG4gIGdoY29wdDogU3RyaW5nLCBjb21waWxlciBvcHRpb24gKHN0YXJ0cyB3aXRoICctZicpXG4gICovXG4gIHB1YmxpYyBhc3luYyBnZXRDb21wbGV0aW9uc0ZvckNvbXBpbGVyT3B0aW9ucyhcbiAgICBidWZmZXI6IFRleHRCdWZmZXIsIHByZWZpeDogc3RyaW5nLCBwb3NpdGlvbjogUG9pbnQsXG4gICk6IFByb21pc2U8c3RyaW5nW10+IHtcbiAgICBpZiAoIXRoaXMuaXNBY3RpdmUpIHsgdGhyb3cgbmV3IEVycm9yKCdCYWNrZW5kIGluYWN0aXZlJykgfVxuXG4gICAgY29uc3QgZGlyID0gYXdhaXQgdGhpcy5wcm9jZXNzLmdldFJvb3REaXIoYnVmZmVyKVxuXG4gICAgbGV0IGNvID0gdGhpcy5jb21waWxlck9wdGlvbnMuZ2V0KGRpcilcbiAgICBpZiAoIWNvKSB7XG4gICAgICBjbyA9IGF3YWl0IHRoaXMucHJvY2Vzcy5ydW5GbGFnKGRpcilcbiAgICAgIHRoaXMuY29tcGlsZXJPcHRpb25zLnNldChkaXIsIGNvKVxuICAgIH1cbiAgICByZXR1cm4gRlouZmlsdGVyKGNvLCBwcmVmaXgpXG4gIH1cblxuICAvKlxuICBnZXRDb21wbGV0aW9uc0ZvckhvbGUoYnVmZmVyLHByZWZpeCxwb3NpdGlvbilcbiAgR2V0IGNvbXBsZXRpb25zIGJhc2VkIG9uIGV4cHJlc3Npb24gdHlwZS5cbiAgSXQgaXMgYXNzdW1lZCB0aGF0IGBwcmVmaXhgIHN0YXJ0cyB3aXRoICdfJ1xuXG4gIGJ1ZmZlcjogVGV4dEJ1ZmZlciwgY3VycmVudCBidWZmZXJcbiAgcHJlZml4OiBTdHJpbmcsIGNvbXBsZXRpb24gcHJlZml4XG4gIHBvc2l0aW9uOiBQb2ludCwgY3VycmVudCBjdXJzb3IgcG9zaXRpb25cblxuICBSZXR1cm5zOiBQcm9taXNlKFtzeW1ib2xdKVxuICBzeW1ib2w6IFNhbWUgYXMgZ2V0Q29tcGxldGlvbnNGb3JTeW1ib2xcbiAgKi9cbiAgQGhhbmRsZUV4Y2VwdGlvblxuICBwdWJsaWMgYXN5bmMgZ2V0Q29tcGxldGlvbnNGb3JIb2xlKFxuICAgIGJ1ZmZlcjogVGV4dEJ1ZmZlciwgcHJlZml4OiBzdHJpbmcsIHBvc2l0aW9uOiBQb2ludCxcbiAgKTogUHJvbWlzZTxDQi5JU3ltYm9sW10+IHtcbiAgICBpZiAoIXRoaXMuaXNBY3RpdmUpIHsgdGhyb3cgbmV3IEVycm9yKCdCYWNrZW5kIGluYWN0aXZlJykgfVxuICAgIGNvbnN0IHJhbmdlID0gbmV3IFJhbmdlKHBvc2l0aW9uLCBwb3NpdGlvbilcbiAgICBpZiAocHJlZml4LnN0YXJ0c1dpdGgoJ18nKSkgeyBwcmVmaXggPSBwcmVmaXguc2xpY2UoMSkgfVxuICAgIGNvbnN0IHsgdHlwZSB9ID0gYXdhaXQgdGhpcy5wcm9jZXNzLmdldFR5cGVJbkJ1ZmZlcihidWZmZXIsIHJhbmdlKVxuICAgIGNvbnN0IHN5bWJvbHMgPSBhd2FpdCB0aGlzLmdldFN5bWJvbHNGb3JCdWZmZXIoYnVmZmVyKVxuICAgIGNvbnN0IHRzID0gc3ltYm9scy5maWx0ZXIoKHMpID0+IHtcbiAgICAgIGlmICghcy50eXBlU2lnbmF0dXJlKSB7IHJldHVybiBmYWxzZSB9XG4gICAgICBjb25zdCB0bCA9IHMudHlwZVNpZ25hdHVyZS5zcGxpdCgnIC0+ICcpLnNsaWNlKC0xKVswXVxuICAgICAgaWYgKHRsLm1hdGNoKC9eW2Etel0kLykpIHsgcmV0dXJuIGZhbHNlIH1cbiAgICAgIGNvbnN0IHRzMiA9IHRsLnJlcGxhY2UoL1suPyorXiRbXFxdXFxcXCgpe318LV0vZywgJ1xcXFwkJicpXG4gICAgICBjb25zdCByeCA9IFJlZ0V4cCh0czIucmVwbGFjZSgvXFxiW2Etel1cXGIvZywgJy4rJyksICcnKVxuICAgICAgcmV0dXJuIHJ4LnRlc3QodHlwZSlcbiAgICB9KVxuICAgIGlmIChwcmVmaXgubGVuZ3RoID09PSAwKSB7XG4gICAgICAvLyB0c2xpbnQ6ZGlzYWJsZS1uZXh0LWxpbmU6IG5vLW5vbi1udWxsLWFzc2VydGlvblxuICAgICAgcmV0dXJuIHRzLnNvcnQoKGEsIGIpID0+IEZaLnNjb3JlKGIudHlwZVNpZ25hdHVyZSEsIHR5cGUpIC0gRlouc2NvcmUoYS50eXBlU2lnbmF0dXJlISwgdHlwZSkpXG4gICAgfSBlbHNlIHtcbiAgICAgIHJldHVybiBGWi5maWx0ZXIodHMsIHByZWZpeCwgeyBrZXk6ICdxbmFtZScgfSlcbiAgICB9XG4gIH1cblxuICBwcml2YXRlIGFzeW5jIGdldFN5bWJvbHNGb3JCdWZmZXIoXG4gICAgYnVmZmVyOiBUZXh0QnVmZmVyLCBzeW1ib2xUeXBlcz86IENCLlN5bWJvbFR5cGVbXSxcbiAgKTogUHJvbWlzZTxDQi5JU3ltYm9sW10+IHtcbiAgICBjb25zdCB7IGJ1ZmZlckluZm8gfSA9IHRoaXMuZ2V0QnVmZmVySW5mbyh7IGJ1ZmZlciB9KVxuICAgIGNvbnN0IHsgcm9vdERpciwgbW9kdWxlTWFwIH0gPSBhd2FpdCB0aGlzLmdldE1vZHVsZU1hcCh7IGJ1ZmZlckluZm8gfSlcbiAgICBpZiAoYnVmZmVySW5mbyAmJiBtb2R1bGVNYXApIHtcbiAgICAgIGNvbnN0IGltcG9ydHMgPSBhd2FpdCBidWZmZXJJbmZvLmdldEltcG9ydHMoKVxuICAgICAgY29uc3QgcHJvbWlzZXMgPSBhd2FpdCBQcm9taXNlLmFsbChcbiAgICAgICAgaW1wb3J0cy5tYXAoYXN5bmMgKGltcCkgPT4ge1xuICAgICAgICAgIGNvbnN0IHJlcyA9IGF3YWl0IHRoaXMuZ2V0TW9kdWxlSW5mbyh7XG4gICAgICAgICAgICBidWZmZXJJbmZvLFxuICAgICAgICAgICAgbW9kdWxlTmFtZTogaW1wLm5hbWUsXG4gICAgICAgICAgICByb290RGlyLFxuICAgICAgICAgICAgbW9kdWxlTWFwLFxuICAgICAgICAgIH0pXG4gICAgICAgICAgaWYgKCFyZXMpIHsgcmV0dXJuIFtdIH1cbiAgICAgICAgICByZXR1cm4gcmVzLm1vZHVsZUluZm8uc2VsZWN0KGltcCwgc3ltYm9sVHlwZXMpXG4gICAgICAgIH0pLFxuICAgICAgKVxuICAgICAgcmV0dXJuIChbXSBhcyB0eXBlb2YgcHJvbWlzZXNbMF0pLmNvbmNhdCguLi5wcm9taXNlcylcbiAgICB9IGVsc2Uge1xuICAgICAgcmV0dXJuIFtdXG4gICAgfVxuICB9XG5cbiAgcHJpdmF0ZSBnZXRCdWZmZXJJbmZvKHsgYnVmZmVyIH06IHsgYnVmZmVyOiBUZXh0QnVmZmVyIH0pOiB7IGJ1ZmZlckluZm86IEJ1ZmZlckluZm8gfSB7XG4gICAgbGV0IGJpID0gdGhpcy5idWZmZXJNYXAuZ2V0KGJ1ZmZlcilcbiAgICBpZiAoIWJpKSB7XG4gICAgICBiaSA9IG5ldyBCdWZmZXJJbmZvKGJ1ZmZlcilcbiAgICAgIHRoaXMuYnVmZmVyTWFwLnNldChidWZmZXIsIGJpKVxuICAgIH1cbiAgICByZXR1cm4geyBidWZmZXJJbmZvOiBiaSB9XG4gIH1cblxuICBwcml2YXRlIGFzeW5jIGdldE1vZHVsZU1hcChcbiAgICB7IGJ1ZmZlckluZm8sIHJvb3REaXIgfTogeyBidWZmZXJJbmZvOiBCdWZmZXJJbmZvLCByb290RGlyPzogRGlyZWN0b3J5IH0sXG4gICk6IFByb21pc2U8eyByb290RGlyOiBEaXJlY3RvcnksIG1vZHVsZU1hcDogTWFwPHN0cmluZywgTW9kdWxlSW5mbz4gfT4ge1xuICAgIGlmICghcm9vdERpcikge1xuICAgICAgcm9vdERpciA9IGF3YWl0IHRoaXMucHJvY2Vzcy5nZXRSb290RGlyKGJ1ZmZlckluZm8uYnVmZmVyKVxuICAgIH1cbiAgICBsZXQgbW0gPSB0aGlzLmRpck1hcC5nZXQocm9vdERpcilcbiAgICBpZiAoIW1tKSB7XG4gICAgICBtbSA9IG5ldyBNYXAoKVxuICAgICAgdGhpcy5kaXJNYXAuc2V0KHJvb3REaXIsIG1tKVxuICAgIH1cblxuICAgIHJldHVybiB7XG4gICAgICByb290RGlyLFxuICAgICAgbW9kdWxlTWFwOiBtbSxcbiAgICB9XG4gIH1cblxuICBwcml2YXRlIGFzeW5jIGdldE1vZHVsZUluZm8oXG4gICAgYXJnOiB7XG4gICAgICBidWZmZXJJbmZvOiBCdWZmZXJJbmZvLCBtb2R1bGVOYW1lPzogc3RyaW5nLFxuICAgICAgcm9vdERpcj86IERpcmVjdG9yeSwgbW9kdWxlTWFwPzogTWFwPHN0cmluZywgTW9kdWxlSW5mbz5cbiAgICB9LFxuICApIHtcbiAgICBjb25zdCB7IGJ1ZmZlckluZm8gfSA9IGFyZ1xuICAgIGxldCBkYXRcbiAgICBpZiAoYXJnLnJvb3REaXIgJiYgYXJnLm1vZHVsZU1hcCkge1xuICAgICAgZGF0ID0geyByb290RGlyOiBhcmcucm9vdERpciwgbW9kdWxlTWFwOiBhcmcubW9kdWxlTWFwIH1cbiAgICB9IGVsc2Uge1xuICAgICAgZGF0ID0gYXdhaXQgdGhpcy5nZXRNb2R1bGVNYXAoeyBidWZmZXJJbmZvIH0pXG4gICAgfVxuICAgIGNvbnN0IHsgbW9kdWxlTWFwLCByb290RGlyIH0gPSBkYXRcbiAgICBsZXQgbW9kdWxlTmFtZSA9IGFyZy5tb2R1bGVOYW1lXG4gICAgaWYgKCFtb2R1bGVOYW1lKSB7XG4gICAgICBtb2R1bGVOYW1lID0gYXdhaXQgYnVmZmVySW5mby5nZXRNb2R1bGVOYW1lKClcbiAgICB9XG4gICAgaWYgKCFtb2R1bGVOYW1lKSB7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoYE5hbWVsZXNzIG1vZHVsZSBpbiAke2J1ZmZlckluZm8uYnVmZmVyLmdldFVyaSgpfWApXG4gICAgfVxuXG4gICAgbGV0IG1vZHVsZUluZm8gPSBtb2R1bGVNYXAuZ2V0KG1vZHVsZU5hbWUpXG4gICAgaWYgKCFtb2R1bGVJbmZvKSB7XG4gICAgICBtb2R1bGVJbmZvID0gbmV3IE1vZHVsZUluZm8obW9kdWxlTmFtZSwgdGhpcy5wcm9jZXNzLCByb290RGlyKVxuICAgICAgbW9kdWxlTWFwLnNldChtb2R1bGVOYW1lLCBtb2R1bGVJbmZvKVxuXG4gICAgICBjb25zdCBtbiA9IG1vZHVsZU5hbWVcbiAgICAgIG1vZHVsZUluZm8ub25EaWREZXN0cm95KCgpID0+IHtcbiAgICAgICAgbW9kdWxlTWFwLmRlbGV0ZShtbilcbiAgICAgICAgVXRpbC5kZWJ1ZyhgJHttb2R1bGVOYW1lfSByZW1vdmVkIGZyb20gbWFwYClcbiAgICAgIH0pXG4gICAgICBhd2FpdCBtb2R1bGVJbmZvLmluaXRpYWxVcGRhdGVQcm9taXNlXG4gICAgfVxuICAgIG1vZHVsZUluZm8uc2V0QnVmZmVyKGJ1ZmZlckluZm8pXG4gICAgcmV0dXJuIHsgYnVmZmVySW5mbywgcm9vdERpciwgbW9kdWxlTWFwLCBtb2R1bGVJbmZvLCBtb2R1bGVOYW1lIH1cbiAgfVxuXG4gIHByaXZhdGUgZmlsdGVyPFQsIEsgZXh0ZW5kcyBrZXlvZiBUPihjYW5kaWRhdGVzOiBUW10sIHByZWZpeDogc3RyaW5nLCBrZXlzOiBLW10pOiBUW10ge1xuICAgIGlmICghcHJlZml4KSB7XG4gICAgICByZXR1cm4gY2FuZGlkYXRlc1xuICAgIH1cbiAgICBjb25zdCBsaXN0ID0gW11cbiAgICBmb3IgKGNvbnN0IGNhbmRpZGF0ZSBvZiBjYW5kaWRhdGVzKSB7XG4gICAgICBjb25zdCBzY29yZXMgPSBrZXlzLm1hcCgoa2V5KSA9PiB7XG4gICAgICAgIGNvbnN0IGNrID0gY2FuZGlkYXRlW2tleV1cbiAgICAgICAgaWYgKGNrKSB7XG4gICAgICAgICAgcmV0dXJuIEZaLnNjb3JlKGNrLnRvU3RyaW5nKCksIHByZWZpeClcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICByZXR1cm4gMFxuICAgICAgICB9XG4gICAgICB9KVxuICAgICAgY29uc3Qgc2NvcmUgPSBNYXRoLm1heCguLi5zY29yZXMpXG4gICAgICBpZiAoc2NvcmUgPiAwKSB7XG4gICAgICAgIGxpc3QucHVzaCh7XG4gICAgICAgICAgc2NvcmUsXG4gICAgICAgICAgc2NvcmVOOiBzY29yZXMuaW5kZXhPZihzY29yZSksXG4gICAgICAgICAgZGF0YTogY2FuZGlkYXRlLFxuICAgICAgICB9KVxuICAgICAgfVxuICAgIH1cbiAgICByZXR1cm4gbGlzdC5zb3J0KChhLCBiKSA9PiB7XG4gICAgICBjb25zdCBzID0gYi5zY29yZSAtIGEuc2NvcmVcbiAgICAgIGlmIChzID09PSAwKSB7XG4gICAgICAgIHJldHVybiBhLnNjb3JlTiAtIGIuc2NvcmVOXG4gICAgICB9XG4gICAgICByZXR1cm4gc1xuICAgIH0pLm1hcCgoeyBkYXRhIH0pID0+IGRhdGEpXG4gIH1cbn1cbiJdfQ==