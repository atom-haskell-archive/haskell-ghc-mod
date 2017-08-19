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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaW5kZXguanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi9zcmMvY29tcGxldGlvbi1iYWNrZW5kL2luZGV4LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7QUFBQSxpQ0FBZ0M7QUFDaEMsK0JBRWE7QUFDYiwrQ0FBMEM7QUFDMUMsK0NBQTBDO0FBRTFDLGdDQUErQjtBQUMvQixrQ0FBeUM7QUFHekM7SUFRRSxZQUFvQixPQUF1QixFQUFTLEdBQThCO1FBQTlELFlBQU8sR0FBUCxPQUFPLENBQWdCO1FBQVMsUUFBRyxHQUFILEdBQUcsQ0FBMkI7UUFDaEYsSUFBSSxDQUFDLFNBQVMsR0FBRyxJQUFJLE9BQU8sRUFBRSxDQUFBO1FBQzlCLElBQUksQ0FBQyxNQUFNLEdBQUcsSUFBSSxPQUFPLEVBQUUsQ0FBQTtRQUMzQixJQUFJLENBQUMsVUFBVSxHQUFHLElBQUksT0FBTyxFQUFFLENBQUE7UUFDL0IsSUFBSSxDQUFDLGVBQWUsR0FBRyxJQUFJLE9BQU8sRUFBRSxDQUFBO1FBQ3BDLElBQUksQ0FBQyxlQUFlLEdBQUcsSUFBSSxPQUFPLEVBQUUsQ0FBQTtRQUdwQyxJQUFJLENBQUMsSUFBSSxHQUFHLElBQUksQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxDQUFBO1FBQ2hDLElBQUksQ0FBQyxZQUFZLEdBQUcsSUFBSSxDQUFDLFlBQVksQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLENBQUE7UUFDaEQsSUFBSSxDQUFDLHdCQUF3QixHQUFHLElBQUksQ0FBQyx3QkFBd0IsQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLENBQUE7UUFDeEUsSUFBSSxDQUFDLDBCQUEwQixHQUFHLElBQUksQ0FBQywwQkFBMEIsQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLENBQUE7UUFDNUUsSUFBSSxDQUFDLHVCQUF1QixHQUFHLElBQUksQ0FBQyx1QkFBdUIsQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLENBQUE7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QU8sQ0FBQyxLQUFLLENBQUM7b0JBQzdCLElBQUksRUFBRSxTQUFTO2lCQUNoQixDQUFDLENBQUE7WUFDSixDQUFDO1FBQ0gsQ0FBQztRQUNELE1BQU0sQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUM7WUFDcEIsTUFBTSxDQUFDLEdBQUcsQ0FBQyxDQUFDLEtBQUssR0FBRyxDQUFDLENBQUMsS0FBSyxDQUFBO1lBQzNCLEVBQUUsQ0FBQyxDQUFDLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQyxDQUFDO2dCQUNaLE1BQU0sQ0FBQyxDQUFDLENBQUMsTUFBTSxHQUFHLENBQUMsQ0FBQyxNQUFNLENBQUE7WUFDNUIsQ0FBQztZQUNELE1BQU0sQ0FBQyxDQUFDLENBQUE7UUFDVixDQUFDLENBQUMsQ0FBQyxHQUFHLENBQUMsQ0FBQyxFQUFFLElBQUksRUFBRSxLQUFLLElBQUksQ0FBQyxDQUFBO0lBQzVCLENBQUM7Q0FDRjtBQXZVQztJQURDLHNCQUFlOztxQ0FFTixpQkFBVSxVQUE0QixZQUFLOztnRUFNcEQ7QUFhRDtJQURDLHNCQUFlOztxQ0FFTixpQkFBVSxVQUE0QixZQUFLOzs4REFNcEQ7QUEySkQ7SUFEQyxzQkFBZTs7cUNBRU4saUJBQVUsVUFBNEIsWUFBSzs7OERBcUJwRDtBQXBVSCw4Q0ErYkMiLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgKiBhcyBGWiBmcm9tICdmdXp6YWxkcmluJ1xuaW1wb3J0IHtcbiAgVGV4dEJ1ZmZlciwgUG9pbnQsIERpc3Bvc2FibGUsIFJhbmdlLCBEaXJlY3Rvcnlcbn0gZnJvbSAnYXRvbSdcbmltcG9ydCB7IEJ1ZmZlckluZm8gfSBmcm9tICcuL2J1ZmZlci1pbmZvJ1xuaW1wb3J0IHsgTW9kdWxlSW5mbyB9IGZyb20gJy4vbW9kdWxlLWluZm8nXG5pbXBvcnQgeyBHaGNNb2RpUHJvY2VzcyB9IGZyb20gJy4uL2doYy1tb2QnXG5pbXBvcnQgKiBhcyBVdGlsIGZyb20gJy4uL3V0aWwnXG5pbXBvcnQgeyBoYW5kbGVFeGNlcHRpb24gfSBmcm9tICcuLi91dGlsJ1xuaW1wb3J0IENCID0gVVBJLkNvbXBsZXRpb25CYWNrZW5kXG5cbmV4cG9ydCBjbGFzcyBDb21wbGV0aW9uQmFja2VuZCBpbXBsZW1lbnRzIENCLklDb21wbGV0aW9uQmFja2VuZCB7XG4gIHByaXZhdGUgYnVmZmVyTWFwOiBXZWFrTWFwPFRleHRCdWZmZXIsIEJ1ZmZlckluZm8+XG4gIHByaXZhdGUgZGlyTWFwOiBXZWFrTWFwPERpcmVjdG9yeSwgTWFwPHN0cmluZywgTW9kdWxlSW5mbz4+XG4gIHByaXZhdGUgbW9kTGlzdE1hcDogV2Vha01hcDxEaXJlY3RvcnksIHN0cmluZ1tdPlxuICBwcml2YXRlIGxhbmd1YWdlUHJhZ21hczogV2Vha01hcDxEaXJlY3RvcnksIHN0cmluZ1tdPlxuICBwcml2YXRlIGNvbXBpbGVyT3B0aW9uczogV2Vha01hcDxEaXJlY3RvcnksIHN0cmluZ1tdPlxuICBwcml2YXRlIGlzQWN0aXZlOiBib29sZWFuXG5cbiAgY29uc3RydWN0b3IocHJpdmF0ZSBwcm9jZXNzOiBHaGNNb2RpUHJvY2VzcywgcHVibGljIHVwaTogUHJvbWlzZTxVUEkuSVVQSUluc3RhbmNlPikge1xuICAgIHRoaXMuYnVmZmVyTWFwID0gbmV3IFdlYWtNYXAoKVxuICAgIHRoaXMuZGlyTWFwID0gbmV3IFdlYWtNYXAoKVxuICAgIHRoaXMubW9kTGlzdE1hcCA9IG5ldyBXZWFrTWFwKClcbiAgICB0aGlzLmxhbmd1YWdlUHJhZ21hcyA9IG5ldyBXZWFrTWFwKClcbiAgICB0aGlzLmNvbXBpbGVyT3B0aW9ucyA9IG5ldyBXZWFrTWFwKClcblxuICAgIC8vIGNvbXBhdGliaWxpdHkgd2l0aCBvbGQgY2xpZW50c1xuICAgIHRoaXMubmFtZSA9IHRoaXMubmFtZS5iaW5kKHRoaXMpXG4gICAgdGhpcy5vbkRpZERlc3Ryb3kgPSB0aGlzLm9uRGlkRGVzdHJveS5iaW5kKHRoaXMpXG4gICAgdGhpcy5yZWdpc3RlckNvbXBsZXRpb25CdWZmZXIgPSB0aGlzLnJlZ2lzdGVyQ29tcGxldGlvbkJ1ZmZlci5iaW5kKHRoaXMpXG4gICAgdGhpcy51bnJlZ2lzdGVyQ29tcGxldGlvbkJ1ZmZlciA9IHRoaXMudW5yZWdpc3RlckNvbXBsZXRpb25CdWZmZXIuYmluZCh0aGlzKVxuICAgIHRoaXMuZ2V0Q29tcGxldGlvbnNGb3JTeW1ib2wgPSB0aGlzLmdldENvbXBsZXRpb25zRm9yU3ltYm9sLmJpbmQodGhpcylcbiAgICB0aGlzLmdldENvbXBsZXRpb25zRm9yVHlwZSA9IHRoaXMuZ2V0Q29tcGxldGlvbnNGb3JUeXBlLmJpbmQodGhpcylcbiAgICB0aGlzLmdldENvbXBsZXRpb25zRm9yQ2xhc3MgPSB0aGlzLmdldENvbXBsZXRpb25zRm9yQ2xhc3MuYmluZCh0aGlzKVxuICAgIHRoaXMuZ2V0Q29tcGxldGlvbnNGb3JNb2R1bGUgPSB0aGlzLmdldENvbXBsZXRpb25zRm9yTW9kdWxlLmJpbmQodGhpcylcbiAgICB0aGlzLmdldENvbXBsZXRpb25zRm9yU3ltYm9sSW5Nb2R1bGUgPSB0aGlzLmdldENvbXBsZXRpb25zRm9yU3ltYm9sSW5Nb2R1bGUuYmluZCh0aGlzKVxuICAgIHRoaXMuZ2V0Q29tcGxldGlvbnNGb3JMYW5ndWFnZVByYWdtYXMgPSB0aGlzLmdldENvbXBsZXRpb25zRm9yTGFuZ3VhZ2VQcmFnbWFzLmJpbmQodGhpcylcbiAgICB0aGlzLmdldENvbXBsZXRpb25zRm9yQ29tcGlsZXJPcHRpb25zID0gdGhpcy5nZXRDb21wbGV0aW9uc0ZvckNvbXBpbGVyT3B0aW9ucy5iaW5kKHRoaXMpXG4gICAgdGhpcy5nZXRDb21wbGV0aW9uc0ZvckhvbGUgPSB0aGlzLmdldENvbXBsZXRpb25zRm9ySG9sZS5iaW5kKHRoaXMpXG5cbiAgICB0aGlzLnByb2Nlc3MgPSBwcm9jZXNzXG4gICAgdGhpcy5pc0FjdGl2ZSA9IHRydWVcbiAgICB0aGlzLnByb2Nlc3Mub25EaWREZXN0cm95KCgpID0+IHsgdGhpcy5pc0FjdGl2ZSA9IGZhbHNlIH0pXG4gIH1cblxuICAvKiBQdWJsaWMgaW50ZXJmYWNlIGJlbG93ICovXG5cbiAgLypcbiAgbmFtZSgpXG4gIEdldCBiYWNrZW5kIG5hbWVcblxuICBSZXR1cm5zIFN0cmluZywgdW5pcXVlIHN0cmluZyBkZXNjcmliaW5nIGEgZ2l2ZW4gYmFja2VuZFxuICAqL1xuICBwdWJsaWMgbmFtZSgpIHsgcmV0dXJuICdoYXNrZWxsLWdoYy1tb2QnIH1cblxuICAvKlxuICBvbkRpZERlc3Ryb3koY2FsbGJhY2spXG4gIERlc3RydWN0aW9uIGV2ZW50IHN1YnNjcmlwdGlvbi4gVXN1YWxseSBzaG91bGQgYmUgY2FsbGVkIG9ubHkgb25cbiAgcGFja2FnZSBkZWFjdGl2YXRpb24uXG4gIGNhbGxiYWNrOiAoKSAtPlxuICAqL1xuICBwdWJsaWMgb25EaWREZXN0cm95KGNhbGxiYWNrOiAoKSA9PiB2b2lkKSB7XG4gICAgaWYgKCF0aGlzLmlzQWN0aXZlKSB7IHRocm93IG5ldyBFcnJvcignQmFja2VuZCBpbmFjdGl2ZScpIH1cbiAgICByZXR1cm4gdGhpcy5wcm9jZXNzLm9uRGlkRGVzdHJveShjYWxsYmFjaylcbiAgfVxuXG4gIC8qXG4gIHJlZ2lzdGVyQ29tcGxldGlvbkJ1ZmZlcihidWZmZXIpXG4gIEV2ZXJ5IGJ1ZmZlciB0aGF0IHdvdWxkIGJlIHVzZWQgd2l0aCBhdXRvY29tcGxldGlvbiBmdW5jdGlvbnMgaGFzIHRvXG4gIGJlIHJlZ2lzdGVyZWQgd2l0aCB0aGlzIGZ1bmN0aW9uLlxuXG4gIGJ1ZmZlcjogVGV4dEJ1ZmZlciwgYnVmZmVyIHRvIGJlIHVzZWQgaW4gYXV0b2NvbXBsZXRpb25cblxuICBSZXR1cm5zOiBEaXNwb3NhYmxlLCB3aGljaCB3aWxsIHJlbW92ZSBidWZmZXIgZnJvbSBhdXRvY29tcGxldGlvblxuICAqL1xuICBwdWJsaWMgcmVnaXN0ZXJDb21wbGV0aW9uQnVmZmVyKGJ1ZmZlcjogVGV4dEJ1ZmZlcikge1xuICAgIGlmICghdGhpcy5pc0FjdGl2ZSkgeyB0aHJvdyBuZXcgRXJyb3IoJ0JhY2tlbmQgaW5hY3RpdmUnKSB9XG5cbiAgICBpZiAodGhpcy5idWZmZXJNYXAuaGFzKGJ1ZmZlcikpIHtcbiAgICAgIHJldHVybiBuZXcgRGlzcG9zYWJsZSgoKSA9PiB7IC8qIHZvaWQgKi8gfSlcbiAgICB9XG5cbiAgICBjb25zdCB7IGJ1ZmZlckluZm8gfSA9IHRoaXMuZ2V0QnVmZmVySW5mbyh7IGJ1ZmZlciB9KVxuXG4gICAgc2V0SW1tZWRpYXRlKGFzeW5jICgpID0+IHtcbiAgICAgIGNvbnN0IHsgcm9vdERpciwgbW9kdWxlTWFwIH0gPSBhd2FpdCB0aGlzLmdldE1vZHVsZU1hcCh7IGJ1ZmZlckluZm8gfSlcblxuICAgICAgdGhpcy5nZXRNb2R1bGVJbmZvKHsgYnVmZmVySW5mbywgcm9vdERpciwgbW9kdWxlTWFwIH0pXG5cbiAgICAgIGNvbnN0IGltcG9ydHMgPSBhd2FpdCBidWZmZXJJbmZvLmdldEltcG9ydHMoKVxuICAgICAgZm9yIChjb25zdCBpbXBydCBvZiBpbXBvcnRzKSB7XG4gICAgICAgIHRoaXMuZ2V0TW9kdWxlSW5mbyh7IG1vZHVsZU5hbWU6IGltcHJ0Lm5hbWUsIGJ1ZmZlckluZm8sIHJvb3REaXIsIG1vZHVsZU1hcCB9KVxuICAgICAgfVxuICAgIH0pXG5cbiAgICByZXR1cm4gbmV3IERpc3Bvc2FibGUoKCkgPT5cbiAgICAgIHRoaXMudW5yZWdpc3RlckNvbXBsZXRpb25CdWZmZXIoYnVmZmVyKSlcbiAgfVxuXG4gIC8qXG4gIHVucmVnaXN0ZXJDb21wbGV0aW9uQnVmZmVyKGJ1ZmZlcilcbiAgYnVmZmVyOiBUZXh0QnVmZmVyLCBidWZmZXIgdG8gYmUgcmVtb3ZlZCBmcm9tIGF1dG9jb21wbGV0aW9uXG4gICovXG4gIHB1YmxpYyB1bnJlZ2lzdGVyQ29tcGxldGlvbkJ1ZmZlcihidWZmZXI6IFRleHRCdWZmZXIpIHtcbiAgICBjb25zdCB4ID0gdGhpcy5idWZmZXJNYXAuZ2V0KGJ1ZmZlcilcbiAgICBpZiAoeCkge1xuICAgICAgeC5kZXN0cm95KClcbiAgICB9XG4gIH1cblxuICAvKlxuICBnZXRDb21wbGV0aW9uc0ZvclN5bWJvbChidWZmZXIscHJlZml4LHBvc2l0aW9uKVxuICBidWZmZXI6IFRleHRCdWZmZXIsIGN1cnJlbnQgYnVmZmVyXG4gIHByZWZpeDogU3RyaW5nLCBjb21wbGV0aW9uIHByZWZpeFxuICBwb3NpdGlvbjogUG9pbnQsIGN1cnJlbnQgY3Vyc29yIHBvc2l0aW9uXG5cbiAgUmV0dXJuczogUHJvbWlzZShbc3ltYm9sXSlcbiAgc3ltYm9sOiBPYmplY3QsIGEgY29tcGxldGlvbiBzeW1ib2xcbiAgICBuYW1lOiBTdHJpbmcsIHN5bWJvbCBuYW1lXG4gICAgcW5hbWU6IFN0cmluZywgcXVhbGlmaWVkIG5hbWUsIGlmIG1vZHVsZSBpcyBxdWFsaWZpZWQuXG4gICAgICAgICAgIE90aGVyd2lzZSwgc2FtZSBhcyBuYW1lXG4gICAgdHlwZVNpZ25hdHVyZTogU3RyaW5nLCB0eXBlIHNpZ25hdHVyZVxuICAgIHN5bWJvbFR5cGU6IFN0cmluZywgb25lIG9mIFsndHlwZScsICdjbGFzcycsICdmdW5jdGlvbiddXG4gICAgbW9kdWxlOiBPYmplY3QsIHN5bWJvbCBtb2R1bGUgaW5mb3JtYXRpb25cbiAgICAgIHF1YWxpZmllZDogQm9vbGVhbiwgdHJ1ZSBpZiBtb2R1bGUgaXMgaW1wb3J0ZWQgYXMgcXVhbGlmaWVkXG4gICAgICBuYW1lOiBTdHJpbmcsIG1vZHVsZSBuYW1lXG4gICAgICBhbGlhczogU3RyaW5nLCBtb2R1bGUgYWxpYXNcbiAgICAgIGhpZGluZzogQm9vbGVhbiwgdHJ1ZSBpZiBtb2R1bGUgaXMgaW1wb3J0ZWQgd2l0aCBoaWRpbmcgY2xhdXNlXG4gICAgICBpbXBvcnRMaXN0OiBbU3RyaW5nXSwgYXJyYXkgb2YgZXhwbGljaXQgaW1wb3J0cy9oaWRkZW4gaW1wb3J0c1xuICAqL1xuICBAaGFuZGxlRXhjZXB0aW9uXG4gIHB1YmxpYyBhc3luYyBnZXRDb21wbGV0aW9uc0ZvclN5bWJvbChcbiAgICBidWZmZXI6IFRleHRCdWZmZXIsIHByZWZpeDogc3RyaW5nLCBwb3NpdGlvbjogUG9pbnQsXG4gICk6IFByb21pc2U8Q0IuSVN5bWJvbFtdPiB7XG4gICAgaWYgKCF0aGlzLmlzQWN0aXZlKSB7IHRocm93IG5ldyBFcnJvcignQmFja2VuZCBpbmFjdGl2ZScpIH1cblxuICAgIGNvbnN0IHN5bWJvbHMgPSBhd2FpdCB0aGlzLmdldFN5bWJvbHNGb3JCdWZmZXIoYnVmZmVyKVxuICAgIHJldHVybiB0aGlzLmZpbHRlcihzeW1ib2xzLCBwcmVmaXgsIFsncW5hbWUnLCAncXBhcmVudCddKVxuICB9XG5cbiAgLypcbiAgZ2V0Q29tcGxldGlvbnNGb3JUeXBlKGJ1ZmZlcixwcmVmaXgscG9zaXRpb24pXG4gIGJ1ZmZlcjogVGV4dEJ1ZmZlciwgY3VycmVudCBidWZmZXJcbiAgcHJlZml4OiBTdHJpbmcsIGNvbXBsZXRpb24gcHJlZml4XG4gIHBvc2l0aW9uOiBQb2ludCwgY3VycmVudCBjdXJzb3IgcG9zaXRpb25cblxuICBSZXR1cm5zOiBQcm9taXNlKFtzeW1ib2xdKVxuICBzeW1ib2w6IFNhbWUgYXMgZ2V0Q29tcGxldGlvbnNGb3JTeW1ib2wsIGV4Y2VwdFxuICAgICAgICAgIHN5bWJvbFR5cGUgaXMgb25lIG9mIFsndHlwZScsICdjbGFzcyddXG4gICovXG4gIEBoYW5kbGVFeGNlcHRpb25cbiAgcHVibGljIGFzeW5jIGdldENvbXBsZXRpb25zRm9yVHlwZShcbiAgICBidWZmZXI6IFRleHRCdWZmZXIsIHByZWZpeDogc3RyaW5nLCBwb3NpdGlvbjogUG9pbnQsXG4gICk6IFByb21pc2U8Q0IuSVN5bWJvbFtdPiB7XG4gICAgaWYgKCF0aGlzLmlzQWN0aXZlKSB7IHRocm93IG5ldyBFcnJvcignQmFja2VuZCBpbmFjdGl2ZScpIH1cblxuICAgIGNvbnN0IHN5bWJvbHMgPSBhd2FpdCB0aGlzLmdldFN5bWJvbHNGb3JCdWZmZXIoYnVmZmVyLCBbJ3R5cGUnLCAnY2xhc3MnXSlcbiAgICByZXR1cm4gRlouZmlsdGVyKHN5bWJvbHMsIHByZWZpeCwgeyBrZXk6ICdxbmFtZScgfSlcbiAgfVxuXG4gIC8qXG4gIGdldENvbXBsZXRpb25zRm9yQ2xhc3MoYnVmZmVyLHByZWZpeCxwb3NpdGlvbilcbiAgYnVmZmVyOiBUZXh0QnVmZmVyLCBjdXJyZW50IGJ1ZmZlclxuICBwcmVmaXg6IFN0cmluZywgY29tcGxldGlvbiBwcmVmaXhcbiAgcG9zaXRpb246IFBvaW50LCBjdXJyZW50IGN1cnNvciBwb3NpdGlvblxuXG4gIFJldHVybnM6IFByb21pc2UoW3N5bWJvbF0pXG4gIHN5bWJvbDogU2FtZSBhcyBnZXRDb21wbGV0aW9uc0ZvclN5bWJvbCwgZXhjZXB0XG4gICAgICAgICAgc3ltYm9sVHlwZSBpcyBvbmUgb2YgWydjbGFzcyddXG4gICovXG4gIHB1YmxpYyBhc3luYyBnZXRDb21wbGV0aW9uc0ZvckNsYXNzKFxuICAgIGJ1ZmZlcjogVGV4dEJ1ZmZlciwgcHJlZml4OiBzdHJpbmcsIHBvc2l0aW9uOiBQb2ludCxcbiAgKTogUHJvbWlzZTxDQi5JU3ltYm9sW10+IHtcbiAgICBpZiAoIXRoaXMuaXNBY3RpdmUpIHsgdGhyb3cgbmV3IEVycm9yKCdCYWNrZW5kIGluYWN0aXZlJykgfVxuXG4gICAgY29uc3Qgc3ltYm9scyA9IGF3YWl0IHRoaXMuZ2V0U3ltYm9sc0ZvckJ1ZmZlcihidWZmZXIsIFsnY2xhc3MnXSlcbiAgICByZXR1cm4gRlouZmlsdGVyKHN5bWJvbHMsIHByZWZpeCwgeyBrZXk6ICdxbmFtZScgfSlcbiAgfVxuXG4gIC8qXG4gIGdldENvbXBsZXRpb25zRm9yTW9kdWxlKGJ1ZmZlcixwcmVmaXgscG9zaXRpb24pXG4gIGJ1ZmZlcjogVGV4dEJ1ZmZlciwgY3VycmVudCBidWZmZXJcbiAgcHJlZml4OiBTdHJpbmcsIGNvbXBsZXRpb24gcHJlZml4XG4gIHBvc2l0aW9uOiBQb2ludCwgY3VycmVudCBjdXJzb3IgcG9zaXRpb25cblxuICBSZXR1cm5zOiBQcm9taXNlKFttb2R1bGVdKVxuICBtb2R1bGU6IFN0cmluZywgbW9kdWxlIG5hbWVcbiAgKi9cbiAgcHVibGljIGFzeW5jIGdldENvbXBsZXRpb25zRm9yTW9kdWxlKFxuICAgIGJ1ZmZlcjogVGV4dEJ1ZmZlciwgcHJlZml4OiBzdHJpbmcsIHBvc2l0aW9uOiBQb2ludCxcbiAgKTogUHJvbWlzZTxzdHJpbmdbXT4ge1xuICAgIGlmICghdGhpcy5pc0FjdGl2ZSkgeyB0aHJvdyBuZXcgRXJyb3IoJ0JhY2tlbmQgaW5hY3RpdmUnKSB9XG4gICAgY29uc3Qgcm9vdERpciA9IGF3YWl0IHRoaXMucHJvY2Vzcy5nZXRSb290RGlyKGJ1ZmZlcilcbiAgICBsZXQgbW9kdWxlcyA9IHRoaXMubW9kTGlzdE1hcC5nZXQocm9vdERpcilcbiAgICBpZiAoIW1vZHVsZXMpIHtcbiAgICAgIG1vZHVsZXMgPSBhd2FpdCB0aGlzLnByb2Nlc3MucnVuTGlzdChidWZmZXIpXG4gICAgICB0aGlzLm1vZExpc3RNYXAuc2V0KHJvb3REaXIsIG1vZHVsZXMpXG4gICAgICAvLyByZWZyZXNoIGV2ZXJ5IG1pbnV0ZVxuICAgICAgc2V0VGltZW91dCgoKCkgPT4gdGhpcy5tb2RMaXN0TWFwLmRlbGV0ZShyb290RGlyKSksIDYwICogMTAwMClcbiAgICB9XG4gICAgcmV0dXJuIEZaLmZpbHRlcihtb2R1bGVzLCBwcmVmaXgpXG4gIH1cblxuICAvKlxuICBnZXRDb21wbGV0aW9uc0ZvclN5bWJvbEluTW9kdWxlKGJ1ZmZlcixwcmVmaXgscG9zaXRpb24se21vZHVsZX0pXG4gIFVzZWQgaW4gaW1wb3J0IGhpZGluZy9saXN0IGNvbXBsZXRpb25zXG5cbiAgYnVmZmVyOiBUZXh0QnVmZmVyLCBjdXJyZW50IGJ1ZmZlclxuICBwcmVmaXg6IFN0cmluZywgY29tcGxldGlvbiBwcmVmaXhcbiAgcG9zaXRpb246IFBvaW50LCBjdXJyZW50IGN1cnNvciBwb3NpdGlvblxuICBtb2R1bGU6IFN0cmluZywgbW9kdWxlIG5hbWUgKG9wdGlvbmFsKS4gSWYgdW5kZWZpbmVkLCBmdW5jdGlvblxuICAgICAgICAgIHdpbGwgYXR0ZW1wdCB0byBpbmZlciBtb2R1bGUgbmFtZSBmcm9tIHBvc2l0aW9uIGFuZCBidWZmZXIuXG5cbiAgUmV0dXJuczogUHJvbWlzZShbc3ltYm9sXSlcbiAgc3ltYm9sOiBPYmplY3QsIHN5bWJvbCBpbiBnaXZlbiBtb2R1bGVcbiAgICBuYW1lOiBTdHJpbmcsIHN5bWJvbCBuYW1lXG4gICAgdHlwZVNpZ25hdHVyZTogU3RyaW5nLCB0eXBlIHNpZ25hdHVyZVxuICAgIHN5bWJvbFR5cGU6IFN0cmluZywgb25lIG9mIFsndHlwZScsICdjbGFzcycsICdmdW5jdGlvbiddXG4gICovXG4gIHB1YmxpYyBhc3luYyBnZXRDb21wbGV0aW9uc0ZvclN5bWJvbEluTW9kdWxlKFxuICAgIGJ1ZmZlcjogVGV4dEJ1ZmZlciwgcHJlZml4OiBzdHJpbmcsIHBvc2l0aW9uOiBQb2ludCxcbiAgICBvcHRzPzogeyBtb2R1bGU6IHN0cmluZyB9LFxuICApOiBQcm9taXNlPENCLklTeW1ib2xbXT4ge1xuICAgIGlmICghdGhpcy5pc0FjdGl2ZSkgeyB0aHJvdyBuZXcgRXJyb3IoJ0JhY2tlbmQgaW5hY3RpdmUnKSB9XG4gICAgbGV0IG1vZHVsZU5hbWUgPSBvcHRzID8gb3B0cy5tb2R1bGUgOiB1bmRlZmluZWRcbiAgICBpZiAoIW1vZHVsZU5hbWUpIHtcbiAgICAgIGNvbnN0IGxpbmVSYW5nZSA9IG5ldyBSYW5nZShbMCwgcG9zaXRpb24ucm93XSwgcG9zaXRpb24pXG4gICAgICBidWZmZXIuYmFja3dhcmRzU2NhbkluUmFuZ2UoXG4gICAgICAgIC9eaW1wb3J0XFxzKyhbXFx3Ll0rKS8sXG4gICAgICAgIGxpbmVSYW5nZSwgKHsgbWF0Y2ggfSkgPT4gbW9kdWxlTmFtZSA9IG1hdGNoWzFdLFxuICAgICAgKVxuICAgIH1cblxuICAgIGNvbnN0IHsgYnVmZmVySW5mbyB9ID0gdGhpcy5nZXRCdWZmZXJJbmZvKHsgYnVmZmVyIH0pXG4gICAgY29uc3QgbWlzID0gYXdhaXQgdGhpcy5nZXRNb2R1bGVJbmZvKHsgYnVmZmVySW5mbywgbW9kdWxlTmFtZSB9KVxuXG4gICAgLy8gdHNsaW50OmRpc2FibGU6IG5vLW51bGwta2V5d29yZFxuICAgIGNvbnN0IHN5bWJvbHMgPSBtaXMubW9kdWxlSW5mby5zZWxlY3QoXG4gICAgICB7XG4gICAgICAgIHF1YWxpZmllZDogZmFsc2UsXG4gICAgICAgIGhpZGluZzogZmFsc2UsXG4gICAgICAgIG5hbWU6IG1vZHVsZU5hbWUgfHwgbWlzLm1vZHVsZU5hbWUsXG4gICAgICAgIGltcG9ydExpc3Q6IG51bGwsXG4gICAgICAgIGFsaWFzOiBudWxsLFxuICAgICAgfSxcbiAgICAgIHVuZGVmaW5lZCxcbiAgICAgIHRydWUsXG4gICAgKVxuICAgIC8vIHRzbGludDplbmFibGU6IG5vLW51bGwta2V5d29yZFxuICAgIHJldHVybiBGWi5maWx0ZXIoc3ltYm9scywgcHJlZml4LCB7IGtleTogJ25hbWUnIH0pXG4gIH1cblxuICAvKlxuICBnZXRDb21wbGV0aW9uc0Zvckxhbmd1YWdlUHJhZ21hcyhidWZmZXIscHJlZml4LHBvc2l0aW9uKVxuICBidWZmZXI6IFRleHRCdWZmZXIsIGN1cnJlbnQgYnVmZmVyXG4gIHByZWZpeDogU3RyaW5nLCBjb21wbGV0aW9uIHByZWZpeFxuICBwb3NpdGlvbjogUG9pbnQsIGN1cnJlbnQgY3Vyc29yIHBvc2l0aW9uXG5cbiAgUmV0dXJuczogUHJvbWlzZShbcHJhZ21hXSlcbiAgcHJhZ21hOiBTdHJpbmcsIGxhbmd1YWdlIG9wdGlvblxuICAqL1xuICBwdWJsaWMgYXN5bmMgZ2V0Q29tcGxldGlvbnNGb3JMYW5ndWFnZVByYWdtYXMoXG4gICAgYnVmZmVyOiBUZXh0QnVmZmVyLCBwcmVmaXg6IHN0cmluZywgcG9zaXRpb246IFBvaW50LFxuICApOiBQcm9taXNlPHN0cmluZ1tdPiB7XG4gICAgaWYgKCF0aGlzLmlzQWN0aXZlKSB7IHRocm93IG5ldyBFcnJvcignQmFja2VuZCBpbmFjdGl2ZScpIH1cblxuICAgIGNvbnN0IGRpciA9IGF3YWl0IHRoaXMucHJvY2Vzcy5nZXRSb290RGlyKGJ1ZmZlcilcblxuICAgIGxldCBwcyA9IHRoaXMubGFuZ3VhZ2VQcmFnbWFzLmdldChkaXIpXG4gICAgaWYgKCFwcykge1xuICAgICAgcHMgPSBhd2FpdCB0aGlzLnByb2Nlc3MucnVuTGFuZyhkaXIpXG4gICAgICBwcyAmJiB0aGlzLmxhbmd1YWdlUHJhZ21hcy5zZXQoZGlyLCBwcylcbiAgICB9XG4gICAgcmV0dXJuIEZaLmZpbHRlcihwcywgcHJlZml4KVxuICB9XG5cbiAgLypcbiAgZ2V0Q29tcGxldGlvbnNGb3JDb21waWxlck9wdGlvbnMoYnVmZmVyLHByZWZpeCxwb3NpdGlvbilcbiAgYnVmZmVyOiBUZXh0QnVmZmVyLCBjdXJyZW50IGJ1ZmZlclxuICBwcmVmaXg6IFN0cmluZywgY29tcGxldGlvbiBwcmVmaXhcbiAgcG9zaXRpb246IFBvaW50LCBjdXJyZW50IGN1cnNvciBwb3NpdGlvblxuXG4gIFJldHVybnM6IFByb21pc2UoW2doY29wdF0pXG4gIGdoY29wdDogU3RyaW5nLCBjb21waWxlciBvcHRpb24gKHN0YXJ0cyB3aXRoICctZicpXG4gICovXG4gIHB1YmxpYyBhc3luYyBnZXRDb21wbGV0aW9uc0ZvckNvbXBpbGVyT3B0aW9ucyhcbiAgICBidWZmZXI6IFRleHRCdWZmZXIsIHByZWZpeDogc3RyaW5nLCBwb3NpdGlvbjogUG9pbnQsXG4gICk6IFByb21pc2U8c3RyaW5nW10+IHtcbiAgICBpZiAoIXRoaXMuaXNBY3RpdmUpIHsgdGhyb3cgbmV3IEVycm9yKCdCYWNrZW5kIGluYWN0aXZlJykgfVxuXG4gICAgY29uc3QgZGlyID0gYXdhaXQgdGhpcy5wcm9jZXNzLmdldFJvb3REaXIoYnVmZmVyKVxuXG4gICAgbGV0IGNvID0gdGhpcy5jb21waWxlck9wdGlvbnMuZ2V0KGRpcilcbiAgICBpZiAoIWNvKSB7XG4gICAgICBjbyA9IGF3YWl0IHRoaXMucHJvY2Vzcy5ydW5GbGFnKGRpcilcbiAgICAgIHRoaXMuY29tcGlsZXJPcHRpb25zLnNldChkaXIsIGNvKVxuICAgIH1cbiAgICByZXR1cm4gRlouZmlsdGVyKGNvLCBwcmVmaXgpXG4gIH1cblxuICAvKlxuICBnZXRDb21wbGV0aW9uc0ZvckhvbGUoYnVmZmVyLHByZWZpeCxwb3NpdGlvbilcbiAgR2V0IGNvbXBsZXRpb25zIGJhc2VkIG9uIGV4cHJlc3Npb24gdHlwZS5cbiAgSXQgaXMgYXNzdW1lZCB0aGF0IGBwcmVmaXhgIHN0YXJ0cyB3aXRoICdfJ1xuXG4gIGJ1ZmZlcjogVGV4dEJ1ZmZlciwgY3VycmVudCBidWZmZXJcbiAgcHJlZml4OiBTdHJpbmcsIGNvbXBsZXRpb24gcHJlZml4XG4gIHBvc2l0aW9uOiBQb2ludCwgY3VycmVudCBjdXJzb3IgcG9zaXRpb25cblxuICBSZXR1cm5zOiBQcm9taXNlKFtzeW1ib2xdKVxuICBzeW1ib2w6IFNhbWUgYXMgZ2V0Q29tcGxldGlvbnNGb3JTeW1ib2xcbiAgKi9cbiAgQGhhbmRsZUV4Y2VwdGlvblxuICBwdWJsaWMgYXN5bmMgZ2V0Q29tcGxldGlvbnNGb3JIb2xlKFxuICAgIGJ1ZmZlcjogVGV4dEJ1ZmZlciwgcHJlZml4OiBzdHJpbmcsIHBvc2l0aW9uOiBQb2ludCxcbiAgKTogUHJvbWlzZTxDQi5JU3ltYm9sW10+IHtcbiAgICBpZiAoIXRoaXMuaXNBY3RpdmUpIHsgdGhyb3cgbmV3IEVycm9yKCdCYWNrZW5kIGluYWN0aXZlJykgfVxuICAgIGNvbnN0IHJhbmdlID0gbmV3IFJhbmdlKHBvc2l0aW9uLCBwb3NpdGlvbilcbiAgICBpZiAocHJlZml4LnN0YXJ0c1dpdGgoJ18nKSkgeyBwcmVmaXggPSBwcmVmaXguc2xpY2UoMSkgfVxuICAgIGNvbnN0IHsgdHlwZSB9ID0gYXdhaXQgdGhpcy5wcm9jZXNzLmdldFR5cGVJbkJ1ZmZlcihidWZmZXIsIHJhbmdlKVxuICAgIGNvbnN0IHN5bWJvbHMgPSBhd2FpdCB0aGlzLmdldFN5bWJvbHNGb3JCdWZmZXIoYnVmZmVyKVxuICAgIGNvbnN0IHRzID0gc3ltYm9scy5maWx0ZXIoKHMpID0+IHtcbiAgICAgIGlmICghcy50eXBlU2lnbmF0dXJlKSB7IHJldHVybiBmYWxzZSB9XG4gICAgICBjb25zdCB0bCA9IHMudHlwZVNpZ25hdHVyZS5zcGxpdCgnIC0+ICcpLnNsaWNlKC0xKVswXVxuICAgICAgaWYgKHRsLm1hdGNoKC9eW2Etel0kLykpIHsgcmV0dXJuIGZhbHNlIH1cbiAgICAgIGNvbnN0IHRzMiA9IHRsLnJlcGxhY2UoL1suPyorXiRbXFxdXFxcXCgpe318LV0vZywgJ1xcXFwkJicpXG4gICAgICBjb25zdCByeCA9IFJlZ0V4cCh0czIucmVwbGFjZSgvXFxiW2Etel1cXGIvZywgJy4rJyksICcnKVxuICAgICAgcmV0dXJuIHJ4LnRlc3QodHlwZSlcbiAgICB9KVxuICAgIGlmIChwcmVmaXgubGVuZ3RoID09PSAwKSB7XG4gICAgICAvLyB0c2xpbnQ6ZGlzYWJsZS1uZXh0LWxpbmU6IG5vLW5vbi1udWxsLWFzc2VydGlvblxuICAgICAgcmV0dXJuIHRzLnNvcnQoKGEsIGIpID0+IEZaLnNjb3JlKGIudHlwZVNpZ25hdHVyZSEsIHR5cGUpIC0gRlouc2NvcmUoYS50eXBlU2lnbmF0dXJlISwgdHlwZSkpXG4gICAgfSBlbHNlIHtcbiAgICAgIHJldHVybiBGWi5maWx0ZXIodHMsIHByZWZpeCwgeyBrZXk6ICdxbmFtZScgfSlcbiAgICB9XG4gIH1cblxuICBwcml2YXRlIGFzeW5jIGdldFN5bWJvbHNGb3JCdWZmZXIoXG4gICAgYnVmZmVyOiBUZXh0QnVmZmVyLCBzeW1ib2xUeXBlcz86IENCLlN5bWJvbFR5cGVbXSxcbiAgKTogUHJvbWlzZTxDQi5JU3ltYm9sW10+IHtcbiAgICBjb25zdCB7IGJ1ZmZlckluZm8gfSA9IHRoaXMuZ2V0QnVmZmVySW5mbyh7IGJ1ZmZlciB9KVxuICAgIGNvbnN0IHsgcm9vdERpciwgbW9kdWxlTWFwIH0gPSBhd2FpdCB0aGlzLmdldE1vZHVsZU1hcCh7IGJ1ZmZlckluZm8gfSlcbiAgICBpZiAoYnVmZmVySW5mbyAmJiBtb2R1bGVNYXApIHtcbiAgICAgIGNvbnN0IGltcG9ydHMgPSBhd2FpdCBidWZmZXJJbmZvLmdldEltcG9ydHMoKVxuICAgICAgY29uc3QgcHJvbWlzZXMgPSBhd2FpdCBQcm9taXNlLmFsbChcbiAgICAgICAgaW1wb3J0cy5tYXAoYXN5bmMgKGltcCkgPT4ge1xuICAgICAgICAgIGNvbnN0IHJlcyA9IGF3YWl0IHRoaXMuZ2V0TW9kdWxlSW5mbyh7XG4gICAgICAgICAgICBidWZmZXJJbmZvLFxuICAgICAgICAgICAgbW9kdWxlTmFtZTogaW1wLm5hbWUsXG4gICAgICAgICAgICByb290RGlyLFxuICAgICAgICAgICAgbW9kdWxlTWFwLFxuICAgICAgICAgIH0pXG4gICAgICAgICAgaWYgKCFyZXMpIHsgcmV0dXJuIFtdIH1cbiAgICAgICAgICByZXR1cm4gcmVzLm1vZHVsZUluZm8uc2VsZWN0KGltcCwgc3ltYm9sVHlwZXMpXG4gICAgICAgIH0pLFxuICAgICAgKVxuICAgICAgcmV0dXJuIChbXSBhcyB0eXBlb2YgcHJvbWlzZXNbMF0pLmNvbmNhdCguLi5wcm9taXNlcylcbiAgICB9IGVsc2Uge1xuICAgICAgcmV0dXJuIFtdXG4gICAgfVxuICB9XG5cbiAgcHJpdmF0ZSBnZXRCdWZmZXJJbmZvKHsgYnVmZmVyIH06IHsgYnVmZmVyOiBUZXh0QnVmZmVyIH0pOiB7IGJ1ZmZlckluZm86IEJ1ZmZlckluZm8gfSB7XG4gICAgbGV0IGJpID0gdGhpcy5idWZmZXJNYXAuZ2V0KGJ1ZmZlcilcbiAgICBpZiAoIWJpKSB7XG4gICAgICBiaSA9IG5ldyBCdWZmZXJJbmZvKGJ1ZmZlcilcbiAgICAgIHRoaXMuYnVmZmVyTWFwLnNldChidWZmZXIsIGJpKVxuICAgIH1cbiAgICByZXR1cm4geyBidWZmZXJJbmZvOiBiaSB9XG4gIH1cblxuICBwcml2YXRlIGFzeW5jIGdldE1vZHVsZU1hcChcbiAgICB7IGJ1ZmZlckluZm8sIHJvb3REaXIgfTogeyBidWZmZXJJbmZvOiBCdWZmZXJJbmZvLCByb290RGlyPzogRGlyZWN0b3J5IH0sXG4gICk6IFByb21pc2U8eyByb290RGlyOiBEaXJlY3RvcnksIG1vZHVsZU1hcDogTWFwPHN0cmluZywgTW9kdWxlSW5mbz4gfT4ge1xuICAgIGlmICghcm9vdERpcikge1xuICAgICAgcm9vdERpciA9IGF3YWl0IHRoaXMucHJvY2Vzcy5nZXRSb290RGlyKGJ1ZmZlckluZm8uYnVmZmVyKVxuICAgIH1cbiAgICBsZXQgbW0gPSB0aGlzLmRpck1hcC5nZXQocm9vdERpcilcbiAgICBpZiAoIW1tKSB7XG4gICAgICBtbSA9IG5ldyBNYXAoKVxuICAgICAgdGhpcy5kaXJNYXAuc2V0KHJvb3REaXIsIG1tKVxuICAgIH1cblxuICAgIHJldHVybiB7XG4gICAgICByb290RGlyLFxuICAgICAgbW9kdWxlTWFwOiBtbSxcbiAgICB9XG4gIH1cblxuICBwcml2YXRlIGFzeW5jIGdldE1vZHVsZUluZm8oXG4gICAgYXJnOiB7XG4gICAgICBidWZmZXJJbmZvOiBCdWZmZXJJbmZvLCBtb2R1bGVOYW1lPzogc3RyaW5nLFxuICAgICAgcm9vdERpcj86IERpcmVjdG9yeSwgbW9kdWxlTWFwPzogTWFwPHN0cmluZywgTW9kdWxlSW5mbz5cbiAgICB9LFxuICApIHtcbiAgICBjb25zdCB7IGJ1ZmZlckluZm8gfSA9IGFyZ1xuICAgIGxldCBkYXRcbiAgICBpZiAoYXJnLnJvb3REaXIgJiYgYXJnLm1vZHVsZU1hcCkge1xuICAgICAgZGF0ID0geyByb290RGlyOiBhcmcucm9vdERpciwgbW9kdWxlTWFwOiBhcmcubW9kdWxlTWFwIH1cbiAgICB9IGVsc2Uge1xuICAgICAgZGF0ID0gYXdhaXQgdGhpcy5nZXRNb2R1bGVNYXAoeyBidWZmZXJJbmZvIH0pXG4gICAgfVxuICAgIGNvbnN0IHsgbW9kdWxlTWFwLCByb290RGlyIH0gPSBkYXRcbiAgICBsZXQgbW9kdWxlTmFtZSA9IGFyZy5tb2R1bGVOYW1lXG4gICAgaWYgKCFtb2R1bGVOYW1lKSB7XG4gICAgICBtb2R1bGVOYW1lID0gYXdhaXQgYnVmZmVySW5mby5nZXRNb2R1bGVOYW1lKClcbiAgICB9XG4gICAgaWYgKCFtb2R1bGVOYW1lKSB7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoYE5hbWVsZXNzIG1vZHVsZSBpbiAke2J1ZmZlckluZm8uYnVmZmVyLmdldFVyaSgpfWApXG4gICAgfVxuXG4gICAgbGV0IG1vZHVsZUluZm8gPSBtb2R1bGVNYXAuZ2V0KG1vZHVsZU5hbWUpXG4gICAgaWYgKCFtb2R1bGVJbmZvKSB7XG4gICAgICBtb2R1bGVJbmZvID0gbmV3IE1vZHVsZUluZm8obW9kdWxlTmFtZSwgdGhpcy5wcm9jZXNzLCByb290RGlyKVxuICAgICAgbW9kdWxlTWFwLnNldChtb2R1bGVOYW1lLCBtb2R1bGVJbmZvKVxuXG4gICAgICBjb25zdCBtbiA9IG1vZHVsZU5hbWVcbiAgICAgIG1vZHVsZUluZm8ub25EaWREZXN0cm95KCgpID0+IHtcbiAgICAgICAgbW9kdWxlTWFwLmRlbGV0ZShtbilcbiAgICAgICAgVXRpbC5kZWJ1ZyhgJHttb2R1bGVOYW1lfSByZW1vdmVkIGZyb20gbWFwYClcbiAgICAgIH0pXG4gICAgICBhd2FpdCBtb2R1bGVJbmZvLmluaXRpYWxVcGRhdGVQcm9taXNlXG4gICAgfVxuICAgIG1vZHVsZUluZm8uc2V0QnVmZmVyKGJ1ZmZlckluZm8pXG4gICAgcmV0dXJuIHsgYnVmZmVySW5mbywgcm9vdERpciwgbW9kdWxlTWFwLCBtb2R1bGVJbmZvLCBtb2R1bGVOYW1lIH1cbiAgfVxuXG4gIHByaXZhdGUgZmlsdGVyPFQsIEsgZXh0ZW5kcyBrZXlvZiBUPihjYW5kaWRhdGVzOiBUW10sIHByZWZpeDogc3RyaW5nLCBrZXlzOiBLW10pOiBUW10ge1xuICAgIGlmICghcHJlZml4KSB7XG4gICAgICByZXR1cm4gY2FuZGlkYXRlc1xuICAgIH1cbiAgICBjb25zdCBsaXN0ID0gW11cbiAgICBmb3IgKGNvbnN0IGNhbmRpZGF0ZSBvZiBjYW5kaWRhdGVzKSB7XG4gICAgICBjb25zdCBzY29yZXMgPSBrZXlzLm1hcCgoa2V5KSA9PiB7XG4gICAgICAgIGNvbnN0IGNrID0gY2FuZGlkYXRlW2tleV1cbiAgICAgICAgaWYgKGNrKSB7XG4gICAgICAgICAgcmV0dXJuIEZaLnNjb3JlKGNrLnRvU3RyaW5nKCksIHByZWZpeClcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICByZXR1cm4gMFxuICAgICAgICB9XG4gICAgICB9KVxuICAgICAgY29uc3Qgc2NvcmUgPSBNYXRoLm1heCguLi5zY29yZXMpXG4gICAgICBpZiAoc2NvcmUgPiAwKSB7XG4gICAgICAgIGxpc3QucHVzaCh7XG4gICAgICAgICAgc2NvcmUsXG4gICAgICAgICAgc2NvcmVOOiBzY29yZXMuaW5kZXhPZihzY29yZSksXG4gICAgICAgICAgZGF0YTogY2FuZGlkYXRlLFxuICAgICAgICB9KVxuICAgICAgfVxuICAgIH1cbiAgICByZXR1cm4gbGlzdC5zb3J0KChhLCBiKSA9PiB7XG4gICAgICBjb25zdCBzID0gYi5zY29yZSAtIGEuc2NvcmVcbiAgICAgIGlmIChzID09PSAwKSB7XG4gICAgICAgIHJldHVybiBhLnNjb3JlTiAtIGIuc2NvcmVOXG4gICAgICB9XG4gICAgICByZXR1cm4gc1xuICAgIH0pLm1hcCgoeyBkYXRhIH0pID0+IGRhdGEpXG4gIH1cbn1cbiJdfQ==