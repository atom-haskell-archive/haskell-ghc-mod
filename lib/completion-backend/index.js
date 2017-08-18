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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaW5kZXguanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi9zcmMvY29tcGxldGlvbi1iYWNrZW5kL2luZGV4LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7QUFBQSxpQ0FBZ0M7QUFDaEMsK0JBRWE7QUFDYiwrQ0FBd0M7QUFDeEMsK0NBQXdDO0FBRXhDLGdDQUErQjtBQUMvQixrQ0FBdUM7QUFHdkM7SUFRRSxZQUFxQixPQUF1QixFQUFTLEdBQThCO1FBQTlELFlBQU8sR0FBUCxPQUFPLENBQWdCO1FBQVMsUUFBRyxHQUFILEdBQUcsQ0FBMkI7UUFDakYsSUFBSSxDQUFDLFNBQVMsR0FBRyxJQUFJLE9BQU8sRUFBRSxDQUFBO1FBQzlCLElBQUksQ0FBQyxNQUFNLEdBQUcsSUFBSSxPQUFPLEVBQUUsQ0FBQTtRQUMzQixJQUFJLENBQUMsVUFBVSxHQUFHLElBQUksT0FBTyxFQUFFLENBQUE7UUFDL0IsSUFBSSxDQUFDLGVBQWUsR0FBRyxJQUFJLE9BQU8sRUFBRSxDQUFBO1FBQ3BDLElBQUksQ0FBQyxlQUFlLEdBQUcsSUFBSSxPQUFPLEVBQUUsQ0FBQTtRQUdwQyxJQUFJLENBQUMsSUFBSSxHQUFHLElBQUksQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxDQUFBO1FBQ2hDLElBQUksQ0FBQyxZQUFZLEdBQUcsSUFBSSxDQUFDLFlBQVksQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLENBQUE7UUFDaEQsSUFBSSxDQUFDLHdCQUF3QixHQUFHLElBQUksQ0FBQyx3QkFBd0IsQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLENBQUE7UUFDeEUsSUFBSSxDQUFDLDBCQUEwQixHQUFHLElBQUksQ0FBQywwQkFBMEIsQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLENBQUE7UUFDNUUsSUFBSSxDQUFDLHVCQUF1QixHQUFHLElBQUksQ0FBQyx1QkFBdUIsQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLENBQUE7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TyxDQUFDLEtBQUssQ0FBQztvQkFDN0IsSUFBSSxFQUFFLFNBQVM7aUJBQ2hCLENBQUMsQ0FBQTtZQUNKLENBQUM7UUFDSCxDQUFDO1FBQ0QsTUFBTSxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQztZQUNsQixNQUFNLENBQUMsR0FBRyxDQUFDLENBQUMsS0FBSyxHQUFHLENBQUMsQ0FBQyxLQUFLLENBQUE7WUFDM0IsRUFBRSxDQUFDLENBQUMsQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDLENBQUM7Z0JBQ1osTUFBTSxDQUFDLENBQUMsQ0FBQyxNQUFNLEdBQUcsQ0FBQyxDQUFDLE1BQU0sQ0FBQTtZQUM1QixDQUFDO1lBQ0QsTUFBTSxDQUFDLENBQUMsQ0FBQTtRQUNWLENBQUMsQ0FBQyxDQUFDLEdBQUcsQ0FBQyxDQUFDLEVBQUMsSUFBSSxFQUFDLEtBQUssSUFBSSxDQUFDLENBQUE7SUFDNUIsQ0FBQztDQUNGO0FBclVDO0lBREMsc0JBQWU7O3FDQUVOLGlCQUFVLFVBQTRCLFlBQUs7O2dFQU1wRDtBQWFEO0lBREMsc0JBQWU7O3FDQUVOLGlCQUFVLFVBQTRCLFlBQUs7OzhEQU1wRDtBQXlKRDtJQURDLHNCQUFlOztxQ0FFTixpQkFBVSxVQUE0QixZQUFLOzs4REFxQnBEO0FBbFVILDhDQTZiQyIsInNvdXJjZXNDb250ZW50IjpbImltcG9ydCAqIGFzIEZaIGZyb20gJ2Z1enphbGRyaW4nXG5pbXBvcnQge1xuICBUZXh0QnVmZmVyLCBQb2ludCwgRGlzcG9zYWJsZSwgUmFuZ2UsIERpcmVjdG9yeVxufSBmcm9tICdhdG9tJ1xuaW1wb3J0IHtCdWZmZXJJbmZvfSBmcm9tICcuL2J1ZmZlci1pbmZvJ1xuaW1wb3J0IHtNb2R1bGVJbmZvfSBmcm9tICcuL21vZHVsZS1pbmZvJ1xuaW1wb3J0IHtHaGNNb2RpUHJvY2Vzc30gZnJvbSAnLi4vZ2hjLW1vZCdcbmltcG9ydCAqIGFzIFV0aWwgZnJvbSAnLi4vdXRpbCdcbmltcG9ydCB7aGFuZGxlRXhjZXB0aW9ufSBmcm9tICcuLi91dGlsJ1xuaW1wb3J0IENCID0gVVBJLkNvbXBsZXRpb25CYWNrZW5kXG5cbmV4cG9ydCBjbGFzcyBDb21wbGV0aW9uQmFja2VuZCBpbXBsZW1lbnRzIENCLklDb21wbGV0aW9uQmFja2VuZCB7XG4gIHByaXZhdGUgYnVmZmVyTWFwOiBXZWFrTWFwPFRleHRCdWZmZXIsIEJ1ZmZlckluZm8+XG4gIHByaXZhdGUgZGlyTWFwOiBXZWFrTWFwPERpcmVjdG9yeSwgTWFwPHN0cmluZywgTW9kdWxlSW5mbz4+XG4gIHByaXZhdGUgbW9kTGlzdE1hcDogV2Vha01hcDxEaXJlY3RvcnksIHN0cmluZ1tdPlxuICBwcml2YXRlIGxhbmd1YWdlUHJhZ21hczogV2Vha01hcDxEaXJlY3RvcnksIHN0cmluZ1tdPlxuICBwcml2YXRlIGNvbXBpbGVyT3B0aW9uczogV2Vha01hcDxEaXJlY3RvcnksIHN0cmluZ1tdPlxuICBwcml2YXRlIGlzQWN0aXZlOiBib29sZWFuXG5cbiAgY29uc3RydWN0b3IgKHByaXZhdGUgcHJvY2VzczogR2hjTW9kaVByb2Nlc3MsIHB1YmxpYyB1cGk6IFByb21pc2U8VVBJLklVUElJbnN0YW5jZT4pIHtcbiAgICB0aGlzLmJ1ZmZlck1hcCA9IG5ldyBXZWFrTWFwKClcbiAgICB0aGlzLmRpck1hcCA9IG5ldyBXZWFrTWFwKClcbiAgICB0aGlzLm1vZExpc3RNYXAgPSBuZXcgV2Vha01hcCgpXG4gICAgdGhpcy5sYW5ndWFnZVByYWdtYXMgPSBuZXcgV2Vha01hcCgpXG4gICAgdGhpcy5jb21waWxlck9wdGlvbnMgPSBuZXcgV2Vha01hcCgpXG5cbiAgICAvLyBjb21wYXRpYmlsaXR5IHdpdGggb2xkIGNsaWVudHNcbiAgICB0aGlzLm5hbWUgPSB0aGlzLm5hbWUuYmluZCh0aGlzKVxuICAgIHRoaXMub25EaWREZXN0cm95ID0gdGhpcy5vbkRpZERlc3Ryb3kuYmluZCh0aGlzKVxuICAgIHRoaXMucmVnaXN0ZXJDb21wbGV0aW9uQnVmZmVyID0gdGhpcy5yZWdpc3RlckNvbXBsZXRpb25CdWZmZXIuYmluZCh0aGlzKVxuICAgIHRoaXMudW5yZWdpc3RlckNvbXBsZXRpb25CdWZmZXIgPSB0aGlzLnVucmVnaXN0ZXJDb21wbGV0aW9uQnVmZmVyLmJpbmQodGhpcylcbiAgICB0aGlzLmdldENvbXBsZXRpb25zRm9yU3ltYm9sID0gdGhpcy5nZXRDb21wbGV0aW9uc0ZvclN5bWJvbC5iaW5kKHRoaXMpXG4gICAgdGhpcy5nZXRDb21wbGV0aW9uc0ZvclR5cGUgPSB0aGlzLmdldENvbXBsZXRpb25zRm9yVHlwZS5iaW5kKHRoaXMpXG4gICAgdGhpcy5nZXRDb21wbGV0aW9uc0ZvckNsYXNzID0gdGhpcy5nZXRDb21wbGV0aW9uc0ZvckNsYXNzLmJpbmQodGhpcylcbiAgICB0aGlzLmdldENvbXBsZXRpb25zRm9yTW9kdWxlID0gdGhpcy5nZXRDb21wbGV0aW9uc0Zvck1vZHVsZS5iaW5kKHRoaXMpXG4gICAgdGhpcy5nZXRDb21wbGV0aW9uc0ZvclN5bWJvbEluTW9kdWxlID0gdGhpcy5nZXRDb21wbGV0aW9uc0ZvclN5bWJvbEluTW9kdWxlLmJpbmQodGhpcylcbiAgICB0aGlzLmdldENvbXBsZXRpb25zRm9yTGFuZ3VhZ2VQcmFnbWFzID0gdGhpcy5nZXRDb21wbGV0aW9uc0Zvckxhbmd1YWdlUHJhZ21hcy5iaW5kKHRoaXMpXG4gICAgdGhpcy5nZXRDb21wbGV0aW9uc0ZvckNvbXBpbGVyT3B0aW9ucyA9IHRoaXMuZ2V0Q29tcGxldGlvbnNGb3JDb21waWxlck9wdGlvbnMuYmluZCh0aGlzKVxuICAgIHRoaXMuZ2V0Q29tcGxldGlvbnNGb3JIb2xlID0gdGhpcy5nZXRDb21wbGV0aW9uc0ZvckhvbGUuYmluZCh0aGlzKVxuXG4gICAgdGhpcy5wcm9jZXNzID0gcHJvY2Vzc1xuICAgIHRoaXMuaXNBY3RpdmUgPSB0cnVlXG4gICAgdGhpcy5wcm9jZXNzLm9uRGlkRGVzdHJveSgoKSA9PiB7IHRoaXMuaXNBY3RpdmUgPSBmYWxzZSB9KVxuICB9XG5cbiAgLyogUHVibGljIGludGVyZmFjZSBiZWxvdyAqL1xuXG4gIC8qXG4gIG5hbWUoKVxuICBHZXQgYmFja2VuZCBuYW1lXG5cbiAgUmV0dXJucyBTdHJpbmcsIHVuaXF1ZSBzdHJpbmcgZGVzY3JpYmluZyBhIGdpdmVuIGJhY2tlbmRcbiAgKi9cbiAgcHVibGljIG5hbWUgKCkgeyByZXR1cm4gJ2hhc2tlbGwtZ2hjLW1vZCcgfVxuXG4gIC8qXG4gIG9uRGlkRGVzdHJveShjYWxsYmFjaylcbiAgRGVzdHJ1Y3Rpb24gZXZlbnQgc3Vic2NyaXB0aW9uLiBVc3VhbGx5IHNob3VsZCBiZSBjYWxsZWQgb25seSBvblxuICBwYWNrYWdlIGRlYWN0aXZhdGlvbi5cbiAgY2FsbGJhY2s6ICgpIC0+XG4gICovXG4gIHB1YmxpYyBvbkRpZERlc3Ryb3kgKGNhbGxiYWNrOiAoKSA9PiB2b2lkKSB7XG4gICAgaWYgKCF0aGlzLmlzQWN0aXZlKSB7IHRocm93IG5ldyBFcnJvcignQmFja2VuZCBpbmFjdGl2ZScpIH1cbiAgICByZXR1cm4gdGhpcy5wcm9jZXNzLm9uRGlkRGVzdHJveShjYWxsYmFjaylcbiAgfVxuXG4gIC8qXG4gIHJlZ2lzdGVyQ29tcGxldGlvbkJ1ZmZlcihidWZmZXIpXG4gIEV2ZXJ5IGJ1ZmZlciB0aGF0IHdvdWxkIGJlIHVzZWQgd2l0aCBhdXRvY29tcGxldGlvbiBmdW5jdGlvbnMgaGFzIHRvXG4gIGJlIHJlZ2lzdGVyZWQgd2l0aCB0aGlzIGZ1bmN0aW9uLlxuXG4gIGJ1ZmZlcjogVGV4dEJ1ZmZlciwgYnVmZmVyIHRvIGJlIHVzZWQgaW4gYXV0b2NvbXBsZXRpb25cblxuICBSZXR1cm5zOiBEaXNwb3NhYmxlLCB3aGljaCB3aWxsIHJlbW92ZSBidWZmZXIgZnJvbSBhdXRvY29tcGxldGlvblxuICAqL1xuICBwdWJsaWMgcmVnaXN0ZXJDb21wbGV0aW9uQnVmZmVyIChidWZmZXI6IFRleHRCdWZmZXIpIHtcbiAgICBpZiAoIXRoaXMuaXNBY3RpdmUpIHsgdGhyb3cgbmV3IEVycm9yKCdCYWNrZW5kIGluYWN0aXZlJykgfVxuXG4gICAgaWYgKHRoaXMuYnVmZmVyTWFwLmhhcyhidWZmZXIpKSB7XG4gICAgICByZXR1cm4gbmV3IERpc3Bvc2FibGUoKCkgPT4geyAvKiB2b2lkICovIH0pXG4gICAgfVxuXG4gICAgY29uc3QgeyBidWZmZXJJbmZvIH0gPSB0aGlzLmdldEJ1ZmZlckluZm8oeyBidWZmZXIgfSlcblxuICAgIHNldEltbWVkaWF0ZShhc3luYyAoKSA9PiB7XG4gICAgICBjb25zdCB7IHJvb3REaXIsIG1vZHVsZU1hcCB9ID0gYXdhaXQgdGhpcy5nZXRNb2R1bGVNYXAoeyBidWZmZXJJbmZvIH0pXG5cbiAgICAgIHRoaXMuZ2V0TW9kdWxlSW5mbyh7IGJ1ZmZlckluZm8sIHJvb3REaXIsIG1vZHVsZU1hcCB9KVxuXG4gICAgICBjb25zdCBpbXBvcnRzID0gYXdhaXQgYnVmZmVySW5mby5nZXRJbXBvcnRzKClcbiAgICAgIGZvciAoY29uc3QgaW1wcnQgb2YgaW1wb3J0cykge1xuICAgICAgICB0aGlzLmdldE1vZHVsZUluZm8oeyBtb2R1bGVOYW1lOiBpbXBydC5uYW1lLCBidWZmZXJJbmZvLCByb290RGlyLCBtb2R1bGVNYXAgfSlcbiAgICAgIH1cbiAgICB9KVxuXG4gICAgcmV0dXJuIG5ldyBEaXNwb3NhYmxlKCgpID0+XG4gICAgICB0aGlzLnVucmVnaXN0ZXJDb21wbGV0aW9uQnVmZmVyKGJ1ZmZlcikpXG4gIH1cblxuICAvKlxuICB1bnJlZ2lzdGVyQ29tcGxldGlvbkJ1ZmZlcihidWZmZXIpXG4gIGJ1ZmZlcjogVGV4dEJ1ZmZlciwgYnVmZmVyIHRvIGJlIHJlbW92ZWQgZnJvbSBhdXRvY29tcGxldGlvblxuICAqL1xuICBwdWJsaWMgdW5yZWdpc3RlckNvbXBsZXRpb25CdWZmZXIgKGJ1ZmZlcjogVGV4dEJ1ZmZlcikge1xuICAgIGNvbnN0IHggPSB0aGlzLmJ1ZmZlck1hcC5nZXQoYnVmZmVyKVxuICAgIGlmICh4KSB7XG4gICAgICB4LmRlc3Ryb3koKVxuICAgIH1cbiAgfVxuXG4gIC8qXG4gIGdldENvbXBsZXRpb25zRm9yU3ltYm9sKGJ1ZmZlcixwcmVmaXgscG9zaXRpb24pXG4gIGJ1ZmZlcjogVGV4dEJ1ZmZlciwgY3VycmVudCBidWZmZXJcbiAgcHJlZml4OiBTdHJpbmcsIGNvbXBsZXRpb24gcHJlZml4XG4gIHBvc2l0aW9uOiBQb2ludCwgY3VycmVudCBjdXJzb3IgcG9zaXRpb25cblxuICBSZXR1cm5zOiBQcm9taXNlKFtzeW1ib2xdKVxuICBzeW1ib2w6IE9iamVjdCwgYSBjb21wbGV0aW9uIHN5bWJvbFxuICAgIG5hbWU6IFN0cmluZywgc3ltYm9sIG5hbWVcbiAgICBxbmFtZTogU3RyaW5nLCBxdWFsaWZpZWQgbmFtZSwgaWYgbW9kdWxlIGlzIHF1YWxpZmllZC5cbiAgICAgICAgICAgT3RoZXJ3aXNlLCBzYW1lIGFzIG5hbWVcbiAgICB0eXBlU2lnbmF0dXJlOiBTdHJpbmcsIHR5cGUgc2lnbmF0dXJlXG4gICAgc3ltYm9sVHlwZTogU3RyaW5nLCBvbmUgb2YgWyd0eXBlJywgJ2NsYXNzJywgJ2Z1bmN0aW9uJ11cbiAgICBtb2R1bGU6IE9iamVjdCwgc3ltYm9sIG1vZHVsZSBpbmZvcm1hdGlvblxuICAgICAgcXVhbGlmaWVkOiBCb29sZWFuLCB0cnVlIGlmIG1vZHVsZSBpcyBpbXBvcnRlZCBhcyBxdWFsaWZpZWRcbiAgICAgIG5hbWU6IFN0cmluZywgbW9kdWxlIG5hbWVcbiAgICAgIGFsaWFzOiBTdHJpbmcsIG1vZHVsZSBhbGlhc1xuICAgICAgaGlkaW5nOiBCb29sZWFuLCB0cnVlIGlmIG1vZHVsZSBpcyBpbXBvcnRlZCB3aXRoIGhpZGluZyBjbGF1c2VcbiAgICAgIGltcG9ydExpc3Q6IFtTdHJpbmddLCBhcnJheSBvZiBleHBsaWNpdCBpbXBvcnRzL2hpZGRlbiBpbXBvcnRzXG4gICovXG4gIEBoYW5kbGVFeGNlcHRpb25cbiAgcHVibGljIGFzeW5jIGdldENvbXBsZXRpb25zRm9yU3ltYm9sIChcbiAgICBidWZmZXI6IFRleHRCdWZmZXIsIHByZWZpeDogc3RyaW5nLCBwb3NpdGlvbjogUG9pbnRcbiAgKTogUHJvbWlzZTxDQi5JU3ltYm9sW10+IHtcbiAgICBpZiAoIXRoaXMuaXNBY3RpdmUpIHsgdGhyb3cgbmV3IEVycm9yKCdCYWNrZW5kIGluYWN0aXZlJykgfVxuXG4gICAgY29uc3Qgc3ltYm9scyA9IGF3YWl0IHRoaXMuZ2V0U3ltYm9sc0ZvckJ1ZmZlcihidWZmZXIpXG4gICAgcmV0dXJuIHRoaXMuZmlsdGVyKHN5bWJvbHMsIHByZWZpeCwgWydxbmFtZScsICdxcGFyZW50J10pXG4gIH1cblxuICAvKlxuICBnZXRDb21wbGV0aW9uc0ZvclR5cGUoYnVmZmVyLHByZWZpeCxwb3NpdGlvbilcbiAgYnVmZmVyOiBUZXh0QnVmZmVyLCBjdXJyZW50IGJ1ZmZlclxuICBwcmVmaXg6IFN0cmluZywgY29tcGxldGlvbiBwcmVmaXhcbiAgcG9zaXRpb246IFBvaW50LCBjdXJyZW50IGN1cnNvciBwb3NpdGlvblxuXG4gIFJldHVybnM6IFByb21pc2UoW3N5bWJvbF0pXG4gIHN5bWJvbDogU2FtZSBhcyBnZXRDb21wbGV0aW9uc0ZvclN5bWJvbCwgZXhjZXB0XG4gICAgICAgICAgc3ltYm9sVHlwZSBpcyBvbmUgb2YgWyd0eXBlJywgJ2NsYXNzJ11cbiAgKi9cbiAgQGhhbmRsZUV4Y2VwdGlvblxuICBwdWJsaWMgYXN5bmMgZ2V0Q29tcGxldGlvbnNGb3JUeXBlIChcbiAgICBidWZmZXI6IFRleHRCdWZmZXIsIHByZWZpeDogc3RyaW5nLCBwb3NpdGlvbjogUG9pbnRcbiAgKTogUHJvbWlzZTxDQi5JU3ltYm9sW10+IHtcbiAgICBpZiAoIXRoaXMuaXNBY3RpdmUpIHsgdGhyb3cgbmV3IEVycm9yKCdCYWNrZW5kIGluYWN0aXZlJykgfVxuXG4gICAgY29uc3Qgc3ltYm9scyA9IGF3YWl0IHRoaXMuZ2V0U3ltYm9sc0ZvckJ1ZmZlcihidWZmZXIsIFsndHlwZScsICdjbGFzcyddKVxuICAgIHJldHVybiBGWi5maWx0ZXIoc3ltYm9scywgcHJlZml4LCB7a2V5OiAncW5hbWUnfSlcbiAgfVxuXG4gIC8qXG4gIGdldENvbXBsZXRpb25zRm9yQ2xhc3MoYnVmZmVyLHByZWZpeCxwb3NpdGlvbilcbiAgYnVmZmVyOiBUZXh0QnVmZmVyLCBjdXJyZW50IGJ1ZmZlclxuICBwcmVmaXg6IFN0cmluZywgY29tcGxldGlvbiBwcmVmaXhcbiAgcG9zaXRpb246IFBvaW50LCBjdXJyZW50IGN1cnNvciBwb3NpdGlvblxuXG4gIFJldHVybnM6IFByb21pc2UoW3N5bWJvbF0pXG4gIHN5bWJvbDogU2FtZSBhcyBnZXRDb21wbGV0aW9uc0ZvclN5bWJvbCwgZXhjZXB0XG4gICAgICAgICAgc3ltYm9sVHlwZSBpcyBvbmUgb2YgWydjbGFzcyddXG4gICovXG4gIHB1YmxpYyBhc3luYyBnZXRDb21wbGV0aW9uc0ZvckNsYXNzIChcbiAgICBidWZmZXI6IFRleHRCdWZmZXIsIHByZWZpeDogc3RyaW5nLCBwb3NpdGlvbjogUG9pbnRcbiAgKTogUHJvbWlzZTxDQi5JU3ltYm9sW10+IHtcbiAgICBpZiAoIXRoaXMuaXNBY3RpdmUpIHsgdGhyb3cgbmV3IEVycm9yKCdCYWNrZW5kIGluYWN0aXZlJykgfVxuXG4gICAgY29uc3Qgc3ltYm9scyA9IGF3YWl0IHRoaXMuZ2V0U3ltYm9sc0ZvckJ1ZmZlcihidWZmZXIsIFsnY2xhc3MnXSlcbiAgICByZXR1cm4gRlouZmlsdGVyKHN5bWJvbHMsIHByZWZpeCwge2tleTogJ3FuYW1lJ30pXG4gIH1cblxuICAvKlxuICBnZXRDb21wbGV0aW9uc0Zvck1vZHVsZShidWZmZXIscHJlZml4LHBvc2l0aW9uKVxuICBidWZmZXI6IFRleHRCdWZmZXIsIGN1cnJlbnQgYnVmZmVyXG4gIHByZWZpeDogU3RyaW5nLCBjb21wbGV0aW9uIHByZWZpeFxuICBwb3NpdGlvbjogUG9pbnQsIGN1cnJlbnQgY3Vyc29yIHBvc2l0aW9uXG5cbiAgUmV0dXJuczogUHJvbWlzZShbbW9kdWxlXSlcbiAgbW9kdWxlOiBTdHJpbmcsIG1vZHVsZSBuYW1lXG4gICovXG4gIHB1YmxpYyBhc3luYyBnZXRDb21wbGV0aW9uc0Zvck1vZHVsZSAoXG4gICAgYnVmZmVyOiBUZXh0QnVmZmVyLCBwcmVmaXg6IHN0cmluZywgcG9zaXRpb246IFBvaW50XG4gICk6IFByb21pc2U8c3RyaW5nW10+IHtcbiAgICBpZiAoIXRoaXMuaXNBY3RpdmUpIHsgdGhyb3cgbmV3IEVycm9yKCdCYWNrZW5kIGluYWN0aXZlJykgfVxuICAgIGNvbnN0IHJvb3REaXIgPSBhd2FpdCB0aGlzLnByb2Nlc3MuZ2V0Um9vdERpcihidWZmZXIpXG4gICAgbGV0IG1vZHVsZXMgPSB0aGlzLm1vZExpc3RNYXAuZ2V0KHJvb3REaXIpXG4gICAgaWYgKCEgbW9kdWxlcykge1xuICAgICAgbW9kdWxlcyA9IGF3YWl0IHRoaXMucHJvY2Vzcy5ydW5MaXN0KGJ1ZmZlcilcbiAgICAgIHRoaXMubW9kTGlzdE1hcC5zZXQocm9vdERpciwgbW9kdWxlcylcbiAgICAgIC8vIHJlZnJlc2ggZXZlcnkgbWludXRlXG4gICAgICBzZXRUaW1lb3V0KCgoKSA9PiB0aGlzLm1vZExpc3RNYXAuZGVsZXRlKHJvb3REaXIpKSwgNjAgKiAxMDAwKVxuICAgIH1cbiAgICByZXR1cm4gRlouZmlsdGVyKG1vZHVsZXMsIHByZWZpeClcbiAgfVxuXG4gIC8qXG4gIGdldENvbXBsZXRpb25zRm9yU3ltYm9sSW5Nb2R1bGUoYnVmZmVyLHByZWZpeCxwb3NpdGlvbix7bW9kdWxlfSlcbiAgVXNlZCBpbiBpbXBvcnQgaGlkaW5nL2xpc3QgY29tcGxldGlvbnNcblxuICBidWZmZXI6IFRleHRCdWZmZXIsIGN1cnJlbnQgYnVmZmVyXG4gIHByZWZpeDogU3RyaW5nLCBjb21wbGV0aW9uIHByZWZpeFxuICBwb3NpdGlvbjogUG9pbnQsIGN1cnJlbnQgY3Vyc29yIHBvc2l0aW9uXG4gIG1vZHVsZTogU3RyaW5nLCBtb2R1bGUgbmFtZSAob3B0aW9uYWwpLiBJZiB1bmRlZmluZWQsIGZ1bmN0aW9uXG4gICAgICAgICAgd2lsbCBhdHRlbXB0IHRvIGluZmVyIG1vZHVsZSBuYW1lIGZyb20gcG9zaXRpb24gYW5kIGJ1ZmZlci5cblxuICBSZXR1cm5zOiBQcm9taXNlKFtzeW1ib2xdKVxuICBzeW1ib2w6IE9iamVjdCwgc3ltYm9sIGluIGdpdmVuIG1vZHVsZVxuICAgIG5hbWU6IFN0cmluZywgc3ltYm9sIG5hbWVcbiAgICB0eXBlU2lnbmF0dXJlOiBTdHJpbmcsIHR5cGUgc2lnbmF0dXJlXG4gICAgc3ltYm9sVHlwZTogU3RyaW5nLCBvbmUgb2YgWyd0eXBlJywgJ2NsYXNzJywgJ2Z1bmN0aW9uJ11cbiAgKi9cbiAgcHVibGljIGFzeW5jIGdldENvbXBsZXRpb25zRm9yU3ltYm9sSW5Nb2R1bGUgKFxuICAgIGJ1ZmZlcjogVGV4dEJ1ZmZlciwgcHJlZml4OiBzdHJpbmcsIHBvc2l0aW9uOiBQb2ludCxcbiAgICBvcHRzPzoge21vZHVsZTogc3RyaW5nfVxuICApOiBQcm9taXNlPENCLklTeW1ib2xbXT4ge1xuICAgIGlmICghdGhpcy5pc0FjdGl2ZSkgeyB0aHJvdyBuZXcgRXJyb3IoJ0JhY2tlbmQgaW5hY3RpdmUnKSB9XG4gICAgbGV0IG1vZHVsZU5hbWUgPSBvcHRzID8gb3B0cy5tb2R1bGUgOiB1bmRlZmluZWRcbiAgICBpZiAoIW1vZHVsZU5hbWUpIHtcbiAgICAgIGNvbnN0IGxpbmVSYW5nZSA9IG5ldyBSYW5nZShbMCwgcG9zaXRpb24ucm93XSwgcG9zaXRpb24pXG4gICAgICBidWZmZXIuYmFja3dhcmRzU2NhbkluUmFuZ2UoL15pbXBvcnRcXHMrKFtcXHcuXSspLyxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBsaW5lUmFuZ2UsICh7bWF0Y2h9KSA9PiBtb2R1bGVOYW1lID0gbWF0Y2hbMV0pXG4gICAgfVxuXG4gICAgY29uc3Qge2J1ZmZlckluZm99ID0gdGhpcy5nZXRCdWZmZXJJbmZvKHtidWZmZXJ9KVxuICAgIGNvbnN0IG1pcyA9IGF3YWl0IHRoaXMuZ2V0TW9kdWxlSW5mbyh7YnVmZmVySW5mbywgbW9kdWxlTmFtZX0pXG5cbiAgICAvLyB0c2xpbnQ6ZGlzYWJsZTogbm8tbnVsbC1rZXl3b3JkXG4gICAgY29uc3Qgc3ltYm9scyA9IG1pcy5tb2R1bGVJbmZvLnNlbGVjdChcbiAgICAgIHtcbiAgICAgICAgcXVhbGlmaWVkOiBmYWxzZSxcbiAgICAgICAgaGlkaW5nOiBmYWxzZSxcbiAgICAgICAgbmFtZTogbW9kdWxlTmFtZSB8fCBtaXMubW9kdWxlTmFtZSxcbiAgICAgICAgaW1wb3J0TGlzdDogbnVsbCxcbiAgICAgICAgYWxpYXM6IG51bGxcbiAgICAgIH0sXG4gICAgICB1bmRlZmluZWQsXG4gICAgICB0cnVlXG4gICAgKVxuICAgIC8vIHRzbGludDplbmFibGU6IG5vLW51bGwta2V5d29yZFxuICAgIHJldHVybiBGWi5maWx0ZXIoc3ltYm9scywgcHJlZml4LCB7a2V5OiAnbmFtZSd9KVxuICB9XG5cbiAgLypcbiAgZ2V0Q29tcGxldGlvbnNGb3JMYW5ndWFnZVByYWdtYXMoYnVmZmVyLHByZWZpeCxwb3NpdGlvbilcbiAgYnVmZmVyOiBUZXh0QnVmZmVyLCBjdXJyZW50IGJ1ZmZlclxuICBwcmVmaXg6IFN0cmluZywgY29tcGxldGlvbiBwcmVmaXhcbiAgcG9zaXRpb246IFBvaW50LCBjdXJyZW50IGN1cnNvciBwb3NpdGlvblxuXG4gIFJldHVybnM6IFByb21pc2UoW3ByYWdtYV0pXG4gIHByYWdtYTogU3RyaW5nLCBsYW5ndWFnZSBvcHRpb25cbiAgKi9cbiAgcHVibGljIGFzeW5jIGdldENvbXBsZXRpb25zRm9yTGFuZ3VhZ2VQcmFnbWFzIChcbiAgICBidWZmZXI6IFRleHRCdWZmZXIsIHByZWZpeDogc3RyaW5nLCBwb3NpdGlvbjogUG9pbnRcbiAgKTogUHJvbWlzZTxzdHJpbmdbXT4ge1xuICAgIGlmICghdGhpcy5pc0FjdGl2ZSkgeyB0aHJvdyBuZXcgRXJyb3IoJ0JhY2tlbmQgaW5hY3RpdmUnKSB9XG5cbiAgICBjb25zdCBkaXIgPSBhd2FpdCB0aGlzLnByb2Nlc3MuZ2V0Um9vdERpcihidWZmZXIpXG5cbiAgICBsZXQgcHMgPSB0aGlzLmxhbmd1YWdlUHJhZ21hcy5nZXQoZGlyKVxuICAgIGlmICghIHBzKSB7XG4gICAgICBwcyA9IGF3YWl0IHRoaXMucHJvY2Vzcy5ydW5MYW5nKGRpcilcbiAgICAgIHBzICYmIHRoaXMubGFuZ3VhZ2VQcmFnbWFzLnNldChkaXIsIHBzKVxuICAgIH1cbiAgICByZXR1cm4gRlouZmlsdGVyKHBzLCBwcmVmaXgpXG4gIH1cblxuICAvKlxuICBnZXRDb21wbGV0aW9uc0ZvckNvbXBpbGVyT3B0aW9ucyhidWZmZXIscHJlZml4LHBvc2l0aW9uKVxuICBidWZmZXI6IFRleHRCdWZmZXIsIGN1cnJlbnQgYnVmZmVyXG4gIHByZWZpeDogU3RyaW5nLCBjb21wbGV0aW9uIHByZWZpeFxuICBwb3NpdGlvbjogUG9pbnQsIGN1cnJlbnQgY3Vyc29yIHBvc2l0aW9uXG5cbiAgUmV0dXJuczogUHJvbWlzZShbZ2hjb3B0XSlcbiAgZ2hjb3B0OiBTdHJpbmcsIGNvbXBpbGVyIG9wdGlvbiAoc3RhcnRzIHdpdGggJy1mJylcbiAgKi9cbiAgcHVibGljIGFzeW5jIGdldENvbXBsZXRpb25zRm9yQ29tcGlsZXJPcHRpb25zIChcbiAgICBidWZmZXI6IFRleHRCdWZmZXIsIHByZWZpeDogc3RyaW5nLCBwb3NpdGlvbjogUG9pbnRcbiAgKTogUHJvbWlzZTxzdHJpbmdbXT4ge1xuICAgIGlmICghdGhpcy5pc0FjdGl2ZSkgeyB0aHJvdyBuZXcgRXJyb3IoJ0JhY2tlbmQgaW5hY3RpdmUnKSB9XG5cbiAgICBjb25zdCBkaXIgPSBhd2FpdCB0aGlzLnByb2Nlc3MuZ2V0Um9vdERpcihidWZmZXIpXG5cbiAgICBsZXQgY28gPSB0aGlzLmNvbXBpbGVyT3B0aW9ucy5nZXQoZGlyKVxuICAgIGlmICghIGNvKSB7XG4gICAgICBjbyA9IGF3YWl0IHRoaXMucHJvY2Vzcy5ydW5GbGFnKGRpcilcbiAgICAgIHRoaXMuY29tcGlsZXJPcHRpb25zLnNldChkaXIsIGNvKVxuICAgIH1cbiAgICByZXR1cm4gRlouZmlsdGVyKGNvLCBwcmVmaXgpXG4gIH1cblxuICAvKlxuICBnZXRDb21wbGV0aW9uc0ZvckhvbGUoYnVmZmVyLHByZWZpeCxwb3NpdGlvbilcbiAgR2V0IGNvbXBsZXRpb25zIGJhc2VkIG9uIGV4cHJlc3Npb24gdHlwZS5cbiAgSXQgaXMgYXNzdW1lZCB0aGF0IGBwcmVmaXhgIHN0YXJ0cyB3aXRoICdfJ1xuXG4gIGJ1ZmZlcjogVGV4dEJ1ZmZlciwgY3VycmVudCBidWZmZXJcbiAgcHJlZml4OiBTdHJpbmcsIGNvbXBsZXRpb24gcHJlZml4XG4gIHBvc2l0aW9uOiBQb2ludCwgY3VycmVudCBjdXJzb3IgcG9zaXRpb25cblxuICBSZXR1cm5zOiBQcm9taXNlKFtzeW1ib2xdKVxuICBzeW1ib2w6IFNhbWUgYXMgZ2V0Q29tcGxldGlvbnNGb3JTeW1ib2xcbiAgKi9cbiAgQGhhbmRsZUV4Y2VwdGlvblxuICBwdWJsaWMgYXN5bmMgZ2V0Q29tcGxldGlvbnNGb3JIb2xlIChcbiAgICBidWZmZXI6IFRleHRCdWZmZXIsIHByZWZpeDogc3RyaW5nLCBwb3NpdGlvbjogUG9pbnRcbiAgKTogUHJvbWlzZTxDQi5JU3ltYm9sW10+IHtcbiAgICBpZiAoIXRoaXMuaXNBY3RpdmUpIHsgdGhyb3cgbmV3IEVycm9yKCdCYWNrZW5kIGluYWN0aXZlJykgfVxuICAgIGNvbnN0IHJhbmdlID0gbmV3IFJhbmdlKHBvc2l0aW9uLCBwb3NpdGlvbilcbiAgICBpZiAocHJlZml4LnN0YXJ0c1dpdGgoJ18nKSkgeyBwcmVmaXggPSBwcmVmaXguc2xpY2UoMSkgfVxuICAgIGNvbnN0IHt0eXBlfSA9IGF3YWl0IHRoaXMucHJvY2Vzcy5nZXRUeXBlSW5CdWZmZXIoYnVmZmVyLCByYW5nZSlcbiAgICBjb25zdCBzeW1ib2xzID0gYXdhaXQgdGhpcy5nZXRTeW1ib2xzRm9yQnVmZmVyKGJ1ZmZlcilcbiAgICBjb25zdCB0cyA9IHN5bWJvbHMuZmlsdGVyKChzKSA9PiB7XG4gICAgICBpZiAoISBzLnR5cGVTaWduYXR1cmUpIHsgcmV0dXJuIGZhbHNlIH1cbiAgICAgIGNvbnN0IHRsID0gcy50eXBlU2lnbmF0dXJlLnNwbGl0KCcgLT4gJykuc2xpY2UoLTEpWzBdXG4gICAgICBpZiAodGwubWF0Y2goL15bYS16XSQvKSkgeyByZXR1cm4gZmFsc2UgfVxuICAgICAgY29uc3QgdHMyID0gdGwucmVwbGFjZSgvWy4/KiteJFtcXF1cXFxcKCl7fXwtXS9nLCAnXFxcXCQmJylcbiAgICAgIGNvbnN0IHJ4ID0gUmVnRXhwKHRzMi5yZXBsYWNlKC9cXGJbYS16XVxcYi9nLCAnLisnKSwgJycpXG4gICAgICByZXR1cm4gcngudGVzdCh0eXBlKVxuICAgIH0pXG4gICAgaWYgKHByZWZpeC5sZW5ndGggPT09IDApIHtcbiAgICAgIC8vIHRzbGludDpkaXNhYmxlLW5leHQtbGluZTogbm8tbm9uLW51bGwtYXNzZXJ0aW9uXG4gICAgICByZXR1cm4gdHMuc29ydCgoYSwgYikgPT4gRlouc2NvcmUoYi50eXBlU2lnbmF0dXJlISwgdHlwZSkgLSBGWi5zY29yZShhLnR5cGVTaWduYXR1cmUhLCB0eXBlKSlcbiAgICB9IGVsc2Uge1xuICAgICAgcmV0dXJuIEZaLmZpbHRlcih0cywgcHJlZml4LCB7a2V5OiAncW5hbWUnfSlcbiAgICB9XG4gIH1cblxuICBwcml2YXRlIGFzeW5jIGdldFN5bWJvbHNGb3JCdWZmZXIgKFxuICAgIGJ1ZmZlcjogVGV4dEJ1ZmZlciwgc3ltYm9sVHlwZXM/OiBDQi5TeW1ib2xUeXBlW11cbiAgKTogUHJvbWlzZTxDQi5JU3ltYm9sW10+IHtcbiAgICBjb25zdCB7YnVmZmVySW5mb30gPSB0aGlzLmdldEJ1ZmZlckluZm8oe2J1ZmZlcn0pXG4gICAgY29uc3Qge3Jvb3REaXIsIG1vZHVsZU1hcH0gPSBhd2FpdCB0aGlzLmdldE1vZHVsZU1hcCh7YnVmZmVySW5mb30pXG4gICAgaWYgKGJ1ZmZlckluZm8gJiYgbW9kdWxlTWFwKSB7XG4gICAgICBjb25zdCBpbXBvcnRzID0gYXdhaXQgYnVmZmVySW5mby5nZXRJbXBvcnRzKClcbiAgICAgIGNvbnN0IHByb21pc2VzID0gYXdhaXQgUHJvbWlzZS5hbGwoXG4gICAgICAgIGltcG9ydHMubWFwKGFzeW5jIChpbXApID0+IHtcbiAgICAgICAgICBjb25zdCByZXMgPSBhd2FpdCB0aGlzLmdldE1vZHVsZUluZm8oe1xuICAgICAgICAgICAgYnVmZmVySW5mbyxcbiAgICAgICAgICAgIG1vZHVsZU5hbWU6IGltcC5uYW1lLFxuICAgICAgICAgICAgcm9vdERpcixcbiAgICAgICAgICAgIG1vZHVsZU1hcFxuICAgICAgICAgIH0pXG4gICAgICAgICAgaWYgKCFyZXMpIHsgcmV0dXJuIFtdIH1cbiAgICAgICAgICByZXR1cm4gcmVzLm1vZHVsZUluZm8uc2VsZWN0KGltcCwgc3ltYm9sVHlwZXMpXG4gICAgICAgIH0pXG4gICAgICApXG4gICAgICByZXR1cm4gKFtdIGFzIHR5cGVvZiBwcm9taXNlc1swXSkuY29uY2F0KC4uLnByb21pc2VzKVxuICAgIH0gZWxzZSB7XG4gICAgICByZXR1cm4gW11cbiAgICB9XG4gIH1cblxuICBwcml2YXRlIGdldEJ1ZmZlckluZm8gKHtidWZmZXJ9OiB7YnVmZmVyOiBUZXh0QnVmZmVyfSk6IHtidWZmZXJJbmZvOiBCdWZmZXJJbmZvfSB7XG4gICAgbGV0IGJpID0gdGhpcy5idWZmZXJNYXAuZ2V0KGJ1ZmZlcilcbiAgICBpZiAoISBiaSkge1xuICAgICAgYmkgPSBuZXcgQnVmZmVySW5mbyhidWZmZXIpXG4gICAgICB0aGlzLmJ1ZmZlck1hcC5zZXQoYnVmZmVyLCBiaSlcbiAgICB9XG4gICAgcmV0dXJuIHtidWZmZXJJbmZvOiBiaX1cbiAgfVxuXG4gIHByaXZhdGUgYXN5bmMgZ2V0TW9kdWxlTWFwIChcbiAgICB7YnVmZmVySW5mbywgcm9vdERpcn06IHtidWZmZXJJbmZvOiBCdWZmZXJJbmZvLCByb290RGlyPzogRGlyZWN0b3J5fVxuICApOiBQcm9taXNlPHtyb290RGlyOiBEaXJlY3RvcnksIG1vZHVsZU1hcDogTWFwPHN0cmluZywgTW9kdWxlSW5mbz59PiB7XG4gICAgaWYgKCEgcm9vdERpcikge1xuICAgICAgcm9vdERpciA9IGF3YWl0IHRoaXMucHJvY2Vzcy5nZXRSb290RGlyKGJ1ZmZlckluZm8uYnVmZmVyKVxuICAgIH1cbiAgICBsZXQgbW0gPSB0aGlzLmRpck1hcC5nZXQocm9vdERpcilcbiAgICBpZiAoIW1tKSB7XG4gICAgICBtbSA9IG5ldyBNYXAoKVxuICAgICAgdGhpcy5kaXJNYXAuc2V0KHJvb3REaXIsIG1tKVxuICAgIH1cblxuICAgIHJldHVybiB7XG4gICAgICByb290RGlyLFxuICAgICAgbW9kdWxlTWFwOiBtbVxuICAgIH1cbiAgfVxuXG4gIHByaXZhdGUgYXN5bmMgZ2V0TW9kdWxlSW5mbyAoXG4gICAgYXJnOiB7XG4gICAgICBidWZmZXJJbmZvOiBCdWZmZXJJbmZvLCBtb2R1bGVOYW1lPzogc3RyaW5nLFxuICAgICAgcm9vdERpcj86IERpcmVjdG9yeSwgbW9kdWxlTWFwPzogTWFwPHN0cmluZywgTW9kdWxlSW5mbz5cbiAgICB9XG4gICkge1xuICAgIGNvbnN0IHtidWZmZXJJbmZvfSA9IGFyZ1xuICAgIGxldCBkYXRcbiAgICBpZiAoYXJnLnJvb3REaXIgJiYgYXJnLm1vZHVsZU1hcCkge1xuICAgICAgZGF0ID0ge3Jvb3REaXI6IGFyZy5yb290RGlyLCBtb2R1bGVNYXA6IGFyZy5tb2R1bGVNYXB9XG4gICAgfSBlbHNlIHtcbiAgICAgIGRhdCA9IGF3YWl0IHRoaXMuZ2V0TW9kdWxlTWFwKHtidWZmZXJJbmZvfSlcbiAgICB9XG4gICAgY29uc3Qge21vZHVsZU1hcCwgcm9vdERpcn0gPSBkYXRcbiAgICBsZXQgbW9kdWxlTmFtZSA9IGFyZy5tb2R1bGVOYW1lXG4gICAgaWYgKCFtb2R1bGVOYW1lKSB7XG4gICAgICBtb2R1bGVOYW1lID0gYXdhaXQgYnVmZmVySW5mby5nZXRNb2R1bGVOYW1lKClcbiAgICB9XG4gICAgaWYgKCFtb2R1bGVOYW1lKSB7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoYE5hbWVsZXNzIG1vZHVsZSBpbiAke2J1ZmZlckluZm8uYnVmZmVyLmdldFVyaSgpfWApXG4gICAgfVxuXG4gICAgbGV0IG1vZHVsZUluZm8gPSBtb2R1bGVNYXAuZ2V0KG1vZHVsZU5hbWUpXG4gICAgaWYgKCFtb2R1bGVJbmZvKSB7XG4gICAgICBtb2R1bGVJbmZvID0gbmV3IE1vZHVsZUluZm8obW9kdWxlTmFtZSwgdGhpcy5wcm9jZXNzLCByb290RGlyKVxuICAgICAgbW9kdWxlTWFwLnNldChtb2R1bGVOYW1lLCBtb2R1bGVJbmZvKVxuXG4gICAgICBjb25zdCBtbiA9IG1vZHVsZU5hbWVcbiAgICAgIG1vZHVsZUluZm8ub25EaWREZXN0cm95KCgpID0+IHtcbiAgICAgICAgbW9kdWxlTWFwLmRlbGV0ZShtbilcbiAgICAgICAgVXRpbC5kZWJ1ZyhgJHttb2R1bGVOYW1lfSByZW1vdmVkIGZyb20gbWFwYClcbiAgICAgIH0pXG4gICAgICBhd2FpdCBtb2R1bGVJbmZvLmluaXRpYWxVcGRhdGVQcm9taXNlXG4gICAgfVxuICAgIG1vZHVsZUluZm8uc2V0QnVmZmVyKGJ1ZmZlckluZm8pXG4gICAgcmV0dXJuIHtidWZmZXJJbmZvLCByb290RGlyLCBtb2R1bGVNYXAsIG1vZHVsZUluZm8sIG1vZHVsZU5hbWV9XG4gIH1cblxuICBwcml2YXRlIGZpbHRlcjxULCBLIGV4dGVuZHMga2V5b2YgVD4gKGNhbmRpZGF0ZXM6IFRbXSwgcHJlZml4OiBzdHJpbmcsIGtleXM6IEtbXSk6IFRbXSB7XG4gICAgaWYgKCFwcmVmaXgpIHtcbiAgICAgIHJldHVybiBjYW5kaWRhdGVzXG4gICAgfVxuICAgIGNvbnN0IGxpc3QgPSBbXVxuICAgIGZvciAoY29uc3QgY2FuZGlkYXRlIG9mIGNhbmRpZGF0ZXMpIHtcbiAgICAgIGNvbnN0IHNjb3JlcyA9IGtleXMubWFwKChrZXkpID0+IHtcbiAgICAgICAgY29uc3QgY2sgPSBjYW5kaWRhdGVba2V5XVxuICAgICAgICBpZiAoY2spIHtcbiAgICAgICAgICByZXR1cm4gRlouc2NvcmUoY2sudG9TdHJpbmcoKSwgcHJlZml4KVxuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIHJldHVybiAwXG4gICAgICAgIH1cbiAgICAgIH0pXG4gICAgICBjb25zdCBzY29yZSA9IE1hdGgubWF4KC4uLnNjb3JlcylcbiAgICAgIGlmIChzY29yZSA+IDApIHtcbiAgICAgICAgbGlzdC5wdXNoKHtcbiAgICAgICAgICBzY29yZSxcbiAgICAgICAgICBzY29yZU46IHNjb3Jlcy5pbmRleE9mKHNjb3JlKSxcbiAgICAgICAgICBkYXRhOiBjYW5kaWRhdGVcbiAgICAgICAgfSlcbiAgICAgIH1cbiAgICB9XG4gICAgcmV0dXJuIGxpc3Quc29ydCgoYSwgYikgPT4ge1xuICAgICAgICBjb25zdCBzID0gYi5zY29yZSAtIGEuc2NvcmVcbiAgICAgICAgaWYgKHMgPT09IDApIHtcbiAgICAgICAgICByZXR1cm4gYS5zY29yZU4gLSBiLnNjb3JlTlxuICAgICAgICB9XG4gICAgICAgIHJldHVybiBzXG4gICAgICB9KS5tYXAoKHtkYXRhfSkgPT4gZGF0YSlcbiAgfVxufVxuIl19