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
        if (this.isActive) {
            return this.process.onDidDestroy(callback);
        }
    }
    registerCompletionBuffer(buffer) {
        if (this.bufferMap.has(buffer)) {
            return new atom_1.Disposable(() => { });
        }
        const { bufferInfo } = this.getBufferInfo({ buffer });
        setImmediate(() => __awaiter(this, void 0, void 0, function* () {
            const { rootDir, moduleMap } = yield this.getModuleMap({ bufferInfo });
            this.getModuleInfo({ bufferInfo, rootDir, moduleMap });
            return bufferInfo.getImports()
                .then((imports) => imports.forEach(({ name }) => __awaiter(this, void 0, void 0, function* () { return this.getModuleInfo({ moduleName: name, bufferInfo, rootDir, moduleMap }); })));
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
                if (bufferInfo) {
                    moduleInfo.setBuffer(bufferInfo, rootDir);
                }
                else {
                    for (const editor of atom.workspace.getTextEditors()) {
                        const bis = this.getBufferInfo({ buffer: editor.getBuffer() });
                        moduleInfo.setBuffer(bis.bufferInfo, rootDir);
                    }
                }
                const mn = moduleName;
                moduleInfo.onDidDestroy(() => {
                    moduleMap.delete(mn);
                    return Util.debug(`${moduleName} removed from map`);
                });
                yield moduleInfo.initialUpdatePromise;
            }
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY29tcGxldGlvbi1iYWNrZW5kLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vLi4vc3JjL2NvbXBsZXRpb24tYmFja2VuZC9jb21wbGV0aW9uLWJhY2tlbmQudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7Ozs7Ozs7OztBQVdBLGlDQUFnQztBQUNoQywrQkFBd0M7QUFDeEMsK0NBQXdDO0FBQ3hDLCtDQUF3QztBQUV4QyxnQ0FBK0I7QUFFL0I7SUFRRSxZQUFxQixPQUF1QjtRQUF2QixZQUFPLEdBQVAsT0FBTyxDQUFnQjtRQUMxQyxJQUFJLENBQUMsU0FBUyxHQUFHLElBQUksT0FBTyxFQUFFLENBQUE7UUFDOUIsSUFBSSxDQUFDLE1BQU0sR0FBRyxJQUFJLE9BQU8sRUFBRSxDQUFBO1FBQzNCLElBQUksQ0FBQyxVQUFVLEdBQUcsSUFBSSxPQUFPLEVBQUUsQ0FBQTtRQUMvQixJQUFJLENBQUMsZUFBZSxHQUFHLElBQUksT0FBTyxFQUFFLENBQUE7UUFDcEMsSUFBSSxDQUFDLGVBQWUsR0FBRyxJQUFJLE9BQU8sRUFBRSxDQUFBO1FBR3BDLElBQUksQ0FBQyxJQUFJLEdBQUcsSUFBSSxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLENBQUE7UUFDaEMsSUFBSSxDQUFDLFlBQVksR0FBRyxJQUFJLENBQUMsWUFBWSxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsQ0FBQTtRQUNoRCxJQUFJLENBQUMsd0JBQXdCLEdBQUcsSUFBSSxDQUFDLHdCQUF3QixDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsQ0FBQTtRQUN4RSxJQUFJLENBQUMsMEJBQTBCLEdBQUcsSUFBSSxDQUFDLDBCQUEwQixDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsQ0FBQTtRQUM1RSxJQUFJLENBQUMsdUJBQXVCLEdBQUcsSUFBSSxDQUFDLHVCQUF1QixDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsQ0FBQTtRQUN0RSxJQUFJLENBQUMscUJBQXFCLEdBQUcsSUFB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O1lBQ0YsTUFBTSxLQUFLLEdBQUcsSUFBSSxDQUFDLEdBQUcsQ0FBQyxHQUFHLE1BQU0sQ0FBQyxDQUFBO1lBQ2pDLEVBQUUsQ0FBQyxDQUFDLEtBQUssR0FBRyxDQUFDLENBQUMsQ0FBQyxDQUFDO2dCQUNkLElBQUksQ0FBQyxJQUFJLENBQUM7b0JBQ1IsS0FBSztvQkFDTCxNQUFNLEVBQUUsTUFBTSxDQUFDLE9BQU8sQ0FBQyxLQUFLLENBQUM7b0JBQzdCLElBQUksRUFBRSxTQUFTO2lCQUNoQixDQUFDLENBQUE7WUFDSixDQUFDO1FBQ0gsQ0FBQztRQUNELE1BQU0sQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUM7WUFDbEIsTUFBTSxDQUFDLEdBQUcsQ0FBQyxDQUFDLEtBQUssR0FBRyxDQUFDLENBQUMsS0FBSyxDQUFBO1lBQzNCLEVBQUUsQ0FBQyxDQUFDLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQyxDQUFDO2dCQUNaLE1BQU0sQ0FBQyxDQUFDLENBQUMsTUFBTSxHQUFHLENBQUMsQ0FBQyxNQUFNLENBQUE7WUFDNUIsQ0FBQztZQUNELE1BQU0sQ0FBQyxDQUFDLENBQUE7UUFDVixDQUFDLENBQUMsQ0FBQyxHQUFHLENBQUMsQ0FBQyxFQUFDLElBQUksRUFBQyxLQUFLLElBQUksQ0FBQyxDQUFBO0lBQzVCLENBQUM7Q0FDRjtBQWxiRCw4Q0FrYkMiLCJzb3VyY2VzQ29udGVudCI6WyIvKlxuICogZGVjYWZmZWluYXRlIHN1Z2dlc3Rpb25zOlxuICogRFMxMDE6IFJlbW92ZSB1bm5lY2Vzc2FyeSB1c2Ugb2YgQXJyYXkuZnJvbVxuICogRFMxMDI6IFJlbW92ZSB1bm5lY2Vzc2FyeSBjb2RlIGNyZWF0ZWQgYmVjYXVzZSBvZiBpbXBsaWNpdCByZXR1cm5zXG4gKiBEUzEwMzogUmV3cml0ZSBjb2RlIHRvIG5vIGxvbmdlciB1c2UgX19ndWFyZF9fXG4gKiBEUzEwNDogQXZvaWQgaW5saW5lIGFzc2lnbm1lbnRzXG4gKiBEUzIwNTogQ29uc2lkZXIgcmV3b3JraW5nIGNvZGUgdG8gYXZvaWQgdXNlIG9mIElJRkVzXG4gKiBEUzIwNjogQ29uc2lkZXIgcmV3b3JraW5nIGNsYXNzZXMgdG8gYXZvaWQgaW5pdENsYXNzXG4gKiBEUzIwNzogQ29uc2lkZXIgc2hvcnRlciB2YXJpYXRpb25zIG9mIG51bGwgY2hlY2tzXG4gKiBGdWxsIGRvY3M6IGh0dHBzOi8vZ2l0aHViLmNvbS9kZWNhZmZlaW5hdGUvZGVjYWZmZWluYXRlL2Jsb2IvbWFzdGVyL2RvY3Mvc3VnZ2VzdGlvbnMubWRcbiAqL1xuaW1wb3J0ICogYXMgRlogZnJvbSAnZnV6emFsZHJpbidcbmltcG9ydCB7IERpc3Bvc2FibGUsIFJhbmdlIH0gZnJvbSAnYXRvbSdcbmltcG9ydCB7QnVmZmVySW5mb30gZnJvbSAnLi9idWZmZXItaW5mbydcbmltcG9ydCB7TW9kdWxlSW5mb30gZnJvbSAnLi9tb2R1bGUtaW5mbydcbmltcG9ydCB7R2hjTW9kaVByb2Nlc3MsIFN5bWJvbFR5cGV9IGZyb20gJy4uL2doYy1tb2QvZ2hjLW1vZGktcHJvY2VzcydcbmltcG9ydCAqIGFzIFV0aWwgZnJvbSAnLi4vdXRpbCdcblxuZXhwb3J0IGNsYXNzIENvbXBsZXRpb25CYWNrZW5kIHtcbiAgcHJpdmF0ZSBidWZmZXJNYXA6IFdlYWtNYXA8QXRvbVR5cGVzLlRleHRCdWZmZXIsIEJ1ZmZlckluZm8+XG4gIHByaXZhdGUgZGlyTWFwOiBXZWFrTWFwPEF0b21UeXBlcy5EaXJlY3RvcnksIE1hcDxzdHJpbmcsIE1vZHVsZUluZm8+PlxuICBwcml2YXRlIG1vZExpc3RNYXA6IFdlYWtNYXA8QXRvbVR5cGVzLkRpcmVjdG9yeSwgc3RyaW5nW10+XG4gIHByaXZhdGUgbGFuZ3VhZ2VQcmFnbWFzOiBXZWFrTWFwPEF0b21UeXBlcy5EaXJlY3RvcnksIHN0cmluZ1tdPlxuICBwcml2YXRlIGNvbXBpbGVyT3B0aW9uczogV2Vha01hcDxBdG9tVHlwZXMuRGlyZWN0b3J5LCBzdHJpbmdbXT5cbiAgcHJpdmF0ZSBpc0FjdGl2ZTogYm9vbGVhblxuXG4gIGNvbnN0cnVjdG9yIChwcml2YXRlIHByb2Nlc3M6IEdoY01vZGlQcm9jZXNzKSB7XG4gICAgdGhpcy5idWZmZXJNYXAgPSBuZXcgV2Vha01hcCgpIC8vIGJ1ZmZlciA9PiBCdWZmZXJJbmZvXG4gICAgdGhpcy5kaXJNYXAgPSBuZXcgV2Vha01hcCgpIC8vIGRpciA9PiBNYXAgTW9kdWxlTmFtZSBNb2R1bGVJbmZvXG4gICAgdGhpcy5tb2RMaXN0TWFwID0gbmV3IFdlYWtNYXAoKSAvLyBkaXIgPT4gW01vZHVsZU5hbWVdXG4gICAgdGhpcy5sYW5ndWFnZVByYWdtYXMgPSBuZXcgV2Vha01hcCgpIC8vIGRpciA9PiBwcmFnbWFzXG4gICAgdGhpcy5jb21waWxlck9wdGlvbnMgPSBuZXcgV2Vha01hcCgpIC8vIGRpciA9PiBvcHRpb25zXG5cbiAgICAvLyBjb21wYXRpYmlsaXR5IHdpdGggb2xkIGNsaWVudHNcbiAgICB0aGlzLm5hbWUgPSB0aGlzLm5hbWUuYmluZCh0aGlzKVxuICAgIHRoaXMub25EaWREZXN0cm95ID0gdGhpcy5vbkRpZERlc3Ryb3kuYmluZCh0aGlzKVxuICAgIHRoaXMucmVnaXN0ZXJDb21wbGV0aW9uQnVmZmVyID0gdGhpcy5yZWdpc3RlckNvbXBsZXRpb25CdWZmZXIuYmluZCh0aGlzKVxuICAgIHRoaXMudW5yZWdpc3RlckNvbXBsZXRpb25CdWZmZXIgPSB0aGlzLnVucmVnaXN0ZXJDb21wbGV0aW9uQnVmZmVyLmJpbmQodGhpcylcbiAgICB0aGlzLmdldENvbXBsZXRpb25zRm9yU3ltYm9sID0gdGhpcy5nZXRDb21wbGV0aW9uc0ZvclN5bWJvbC5iaW5kKHRoaXMpXG4gICAgdGhpcy5nZXRDb21wbGV0aW9uc0ZvclR5cGUgPSB0aGlzLmdldENvbXBsZXRpb25zRm9yVHlwZS5iaW5kKHRoaXMpXG4gICAgdGhpcy5nZXRDb21wbGV0aW9uc0ZvckNsYXNzID0gdGhpcy5nZXRDb21wbGV0aW9uc0ZvckNsYXNzLmJpbmQodGhpcylcbiAgICB0aGlzLmdldENvbXBsZXRpb25zRm9yTW9kdWxlID0gdGhpcy5nZXRDb21wbGV0aW9uc0Zvck1vZHVsZS5iaW5kKHRoaXMpXG4gICAgdGhpcy5nZXRDb21wbGV0aW9uc0ZvclN5bWJvbEluTW9kdWxlID0gdGhpcy5nZXRDb21wbGV0aW9uc0ZvclN5bWJvbEluTW9kdWxlLmJpbmQodGhpcylcbiAgICB0aGlzLmdldENvbXBsZXRpb25zRm9yTGFuZ3VhZ2VQcmFnbWFzID0gdGhpcy5nZXRDb21wbGV0aW9uc0Zvckxhbmd1YWdlUHJhZ21hcy5iaW5kKHRoaXMpXG4gICAgdGhpcy5nZXRDb21wbGV0aW9uc0ZvckNvbXBpbGVyT3B0aW9ucyA9IHRoaXMuZ2V0Q29tcGxldGlvbnNGb3JDb21waWxlck9wdGlvbnMuYmluZCh0aGlzKVxuICAgIHRoaXMuZ2V0Q29tcGxldGlvbnNGb3JIb2xlID0gdGhpcy5nZXRDb21wbGV0aW9uc0ZvckhvbGUuYmluZCh0aGlzKVxuXG4gICAgdGhpcy5wcm9jZXNzID0gcHJvY2Vzc1xuICAgIHRoaXMuaXNBY3RpdmUgPSB0cnVlXG4gICAgdGhpcy5wcm9jZXNzLm9uRGlkRGVzdHJveSgoKSA9PiB7IHRoaXMuaXNBY3RpdmUgPSBmYWxzZSB9KVxuICB9XG5cbiAgLyogUHVibGljIGludGVyZmFjZSBiZWxvdyAqL1xuXG4gIC8qXG4gIG5hbWUoKVxuICBHZXQgYmFja2VuZCBuYW1lXG5cbiAgUmV0dXJucyBTdHJpbmcsIHVuaXF1ZSBzdHJpbmcgZGVzY3JpYmluZyBhIGdpdmVuIGJhY2tlbmRcbiAgKi9cbiAgcHVibGljIG5hbWUgKCkgeyByZXR1cm4gJ2hhc2tlbGwtZ2hjLW1vZCcgfVxuXG4gIC8qXG4gIG9uRGlkRGVzdHJveShjYWxsYmFjaylcbiAgRGVzdHJ1Y3Rpb24gZXZlbnQgc3Vic2NyaXB0aW9uLiBVc3VhbGx5IHNob3VsZCBiZSBjYWxsZWQgb25seSBvblxuICBwYWNrYWdlIGRlYWN0aXZhdGlvbi5cbiAgY2FsbGJhY2s6ICgpIC0+XG4gICovXG4gIHB1YmxpYyBvbkRpZERlc3Ryb3kgKGNhbGxiYWNrOiAoKSA9PiB2b2lkKSB7XG4gICAgaWYgKHRoaXMuaXNBY3RpdmUpIHsgcmV0dXJuIHRoaXMucHJvY2Vzcy5vbkRpZERlc3Ryb3koY2FsbGJhY2spIH1cbiAgfVxuXG4gIC8qXG4gIHJlZ2lzdGVyQ29tcGxldGlvbkJ1ZmZlcihidWZmZXIpXG4gIEV2ZXJ5IGJ1ZmZlciB0aGF0IHdvdWxkIGJlIHVzZWQgd2l0aCBhdXRvY29tcGxldGlvbiBmdW5jdGlvbnMgaGFzIHRvXG4gIGJlIHJlZ2lzdGVyZWQgd2l0aCB0aGlzIGZ1bmN0aW9uLlxuXG4gIGJ1ZmZlcjogVGV4dEJ1ZmZlciwgYnVmZmVyIHRvIGJlIHVzZWQgaW4gYXV0b2NvbXBsZXRpb25cblxuICBSZXR1cm5zOiBEaXNwb3NhYmxlLCB3aGljaCB3aWxsIHJlbW92ZSBidWZmZXIgZnJvbSBhdXRvY29tcGxldGlvblxuICAqL1xuICBwdWJsaWMgcmVnaXN0ZXJDb21wbGV0aW9uQnVmZmVyIChidWZmZXI6IEF0b21UeXBlcy5UZXh0QnVmZmVyKSB7XG4gICAgaWYgKHRoaXMuYnVmZmVyTWFwLmhhcyhidWZmZXIpKSB7XG4gICAgICByZXR1cm4gbmV3IERpc3Bvc2FibGUoKCkgPT4geyAvKiB2b2lkICovIH0pXG4gICAgfVxuXG4gICAgY29uc3QgeyBidWZmZXJJbmZvIH0gPSB0aGlzLmdldEJ1ZmZlckluZm8oeyBidWZmZXIgfSlcbiAgICBzZXRJbW1lZGlhdGUoYXN5bmMgKCkgPT4ge1xuICAgICAgY29uc3QgeyByb290RGlyLCBtb2R1bGVNYXAgfSA9IGF3YWl0IHRoaXMuZ2V0TW9kdWxlTWFwKHsgYnVmZmVySW5mbyB9KVxuXG4gICAgICB0aGlzLmdldE1vZHVsZUluZm8oeyBidWZmZXJJbmZvLCByb290RGlyLCBtb2R1bGVNYXAgfSlcblxuICAgICAgcmV0dXJuIGJ1ZmZlckluZm8uZ2V0SW1wb3J0cygpXG4gICAgICAgIC50aGVuKChpbXBvcnRzKSA9PlxuICAgICAgICAgIGltcG9ydHMuZm9yRWFjaChhc3luYyAoeyBuYW1lIH0pID0+XG4gICAgICAgICAgICB0aGlzLmdldE1vZHVsZUluZm8oeyBtb2R1bGVOYW1lOiBuYW1lLCBidWZmZXJJbmZvLCByb290RGlyLCBtb2R1bGVNYXAgfSkpKVxuICAgIH0pXG5cbiAgICByZXR1cm4gbmV3IERpc3Bvc2FibGUoKCkgPT5cbiAgICAgIHRoaXMudW5yZWdpc3RlckNvbXBsZXRpb25CdWZmZXIoYnVmZmVyKSlcbiAgfVxuXG4gIC8qXG4gIHVucmVnaXN0ZXJDb21wbGV0aW9uQnVmZmVyKGJ1ZmZlcilcbiAgYnVmZmVyOiBUZXh0QnVmZmVyLCBidWZmZXIgdG8gYmUgcmVtb3ZlZCBmcm9tIGF1dG9jb21wbGV0aW9uXG4gICovXG4gIHB1YmxpYyB1bnJlZ2lzdGVyQ29tcGxldGlvbkJ1ZmZlciAoYnVmZmVyOiBBdG9tVHlwZXMuVGV4dEJ1ZmZlcikge1xuICAgIGNvbnN0IHggPSB0aGlzLmJ1ZmZlck1hcC5nZXQoYnVmZmVyKVxuICAgIGlmICh4KSB7XG4gICAgICB4LmRlc3Ryb3koKVxuICAgIH1cbiAgfVxuXG4gIC8qXG4gIGdldENvbXBsZXRpb25zRm9yU3ltYm9sKGJ1ZmZlcixwcmVmaXgscG9zaXRpb24pXG4gIGJ1ZmZlcjogVGV4dEJ1ZmZlciwgY3VycmVudCBidWZmZXJcbiAgcHJlZml4OiBTdHJpbmcsIGNvbXBsZXRpb24gcHJlZml4XG4gIHBvc2l0aW9uOiBQb2ludCwgY3VycmVudCBjdXJzb3IgcG9zaXRpb25cblxuICBSZXR1cm5zOiBQcm9taXNlKFtzeW1ib2xdKVxuICBzeW1ib2w6IE9iamVjdCwgYSBjb21wbGV0aW9uIHN5bWJvbFxuICAgIG5hbWU6IFN0cmluZywgc3ltYm9sIG5hbWVcbiAgICBxbmFtZTogU3RyaW5nLCBxdWFsaWZpZWQgbmFtZSwgaWYgbW9kdWxlIGlzIHF1YWxpZmllZC5cbiAgICAgICAgICAgT3RoZXJ3aXNlLCBzYW1lIGFzIG5hbWVcbiAgICB0eXBlU2lnbmF0dXJlOiBTdHJpbmcsIHR5cGUgc2lnbmF0dXJlXG4gICAgc3ltYm9sVHlwZTogU3RyaW5nLCBvbmUgb2YgWyd0eXBlJywgJ2NsYXNzJywgJ2Z1bmN0aW9uJ11cbiAgICBtb2R1bGU6IE9iamVjdCwgc3ltYm9sIG1vZHVsZSBpbmZvcm1hdGlvblxuICAgICAgcXVhbGlmaWVkOiBCb29sZWFuLCB0cnVlIGlmIG1vZHVsZSBpcyBpbXBvcnRlZCBhcyBxdWFsaWZpZWRcbiAgICAgIG5hbWU6IFN0cmluZywgbW9kdWxlIG5hbWVcbiAgICAgIGFsaWFzOiBTdHJpbmcsIG1vZHVsZSBhbGlhc1xuICAgICAgaGlkaW5nOiBCb29sZWFuLCB0cnVlIGlmIG1vZHVsZSBpcyBpbXBvcnRlZCB3aXRoIGhpZGluZyBjbGF1c2VcbiAgICAgIGltcG9ydExpc3Q6IFtTdHJpbmddLCBhcnJheSBvZiBleHBsaWNpdCBpbXBvcnRzL2hpZGRlbiBpbXBvcnRzXG4gICovXG4gIHB1YmxpYyBhc3luYyBnZXRDb21wbGV0aW9uc0ZvclN5bWJvbCAoYnVmZmVyOiBBdG9tVHlwZXMuVGV4dEJ1ZmZlciwgcHJlZml4OiBzdHJpbmcsIHBvc2l0aW9uOiBBdG9tVHlwZXMuUG9pbnQpIHtcbiAgICBpZiAoIXRoaXMuaXNBY3RpdmUpIHsgdGhyb3cgbmV3IEVycm9yKCdCYWNrZW5kIGluYWN0aXZlJykgfVxuXG4gICAgY29uc3Qgc3ltYm9scyA9IGF3YWl0IHRoaXMuZ2V0U3ltYm9sc0ZvckJ1ZmZlcihidWZmZXIpXG4gICAgcmV0dXJuIHRoaXMuZmlsdGVyKHN5bWJvbHMsIHByZWZpeCwgWydxbmFtZScsICdxcGFyZW50J10pXG4gIH1cblxuICAvKlxuICBnZXRDb21wbGV0aW9uc0ZvclR5cGUoYnVmZmVyLHByZWZpeCxwb3NpdGlvbilcbiAgYnVmZmVyOiBUZXh0QnVmZmVyLCBjdXJyZW50IGJ1ZmZlclxuICBwcmVmaXg6IFN0cmluZywgY29tcGxldGlvbiBwcmVmaXhcbiAgcG9zaXRpb246IFBvaW50LCBjdXJyZW50IGN1cnNvciBwb3NpdGlvblxuXG4gIFJldHVybnM6IFByb21pc2UoW3N5bWJvbF0pXG4gIHN5bWJvbDogU2FtZSBhcyBnZXRDb21wbGV0aW9uc0ZvclN5bWJvbCwgZXhjZXB0XG4gICAgICAgICAgc3ltYm9sVHlwZSBpcyBvbmUgb2YgWyd0eXBlJywgJ2NsYXNzJ11cbiAgKi9cbiAgcHVibGljIGFzeW5jIGdldENvbXBsZXRpb25zRm9yVHlwZSAoYnVmZmVyOiBBdG9tVHlwZXMuVGV4dEJ1ZmZlciwgcHJlZml4OiBzdHJpbmcsIHBvc2l0aW9uOiBBdG9tVHlwZXMuUG9pbnQpIHtcbiAgICBpZiAoIXRoaXMuaXNBY3RpdmUpIHsgdGhyb3cgbmV3IEVycm9yKCdCYWNrZW5kIGluYWN0aXZlJykgfVxuXG4gICAgY29uc3Qgc3ltYm9scyA9IGF3YWl0IHRoaXMuZ2V0U3ltYm9sc0ZvckJ1ZmZlcihidWZmZXIsIFsndHlwZScsICdjbGFzcyddKVxuICAgIHJldHVybiBGWi5maWx0ZXIoc3ltYm9scywgcHJlZml4LCB7a2V5OiAncW5hbWUnfSlcbiAgfVxuXG4gIC8qXG4gIGdldENvbXBsZXRpb25zRm9yQ2xhc3MoYnVmZmVyLHByZWZpeCxwb3NpdGlvbilcbiAgYnVmZmVyOiBUZXh0QnVmZmVyLCBjdXJyZW50IGJ1ZmZlclxuICBwcmVmaXg6IFN0cmluZywgY29tcGxldGlvbiBwcmVmaXhcbiAgcG9zaXRpb246IFBvaW50LCBjdXJyZW50IGN1cnNvciBwb3NpdGlvblxuXG4gIFJldHVybnM6IFByb21pc2UoW3N5bWJvbF0pXG4gIHN5bWJvbDogU2FtZSBhcyBnZXRDb21wbGV0aW9uc0ZvclN5bWJvbCwgZXhjZXB0XG4gICAgICAgICAgc3ltYm9sVHlwZSBpcyBvbmUgb2YgWydjbGFzcyddXG4gICovXG4gIHB1YmxpYyBhc3luYyBnZXRDb21wbGV0aW9uc0ZvckNsYXNzIChidWZmZXI6IEF0b21UeXBlcy5UZXh0QnVmZmVyLCBwcmVmaXg6IHN0cmluZywgcG9zaXRpb246IEF0b21UeXBlcy5Qb2ludCkge1xuICAgIGlmICghdGhpcy5pc0FjdGl2ZSkgeyB0aHJvdyBuZXcgRXJyb3IoJ0JhY2tlbmQgaW5hY3RpdmUnKSB9XG5cbiAgICBjb25zdCBzeW1ib2xzID0gYXdhaXQgdGhpcy5nZXRTeW1ib2xzRm9yQnVmZmVyKGJ1ZmZlciwgWydjbGFzcyddKVxuICAgIHJldHVybiBGWi5maWx0ZXIoc3ltYm9scywgcHJlZml4LCB7a2V5OiAncW5hbWUnfSlcbiAgfVxuXG4gIC8qXG4gIGdldENvbXBsZXRpb25zRm9yTW9kdWxlKGJ1ZmZlcixwcmVmaXgscG9zaXRpb24pXG4gIGJ1ZmZlcjogVGV4dEJ1ZmZlciwgY3VycmVudCBidWZmZXJcbiAgcHJlZml4OiBTdHJpbmcsIGNvbXBsZXRpb24gcHJlZml4XG4gIHBvc2l0aW9uOiBQb2ludCwgY3VycmVudCBjdXJzb3IgcG9zaXRpb25cblxuICBSZXR1cm5zOiBQcm9taXNlKFttb2R1bGVdKVxuICBtb2R1bGU6IFN0cmluZywgbW9kdWxlIG5hbWVcbiAgKi9cbiAgcHVibGljIGFzeW5jIGdldENvbXBsZXRpb25zRm9yTW9kdWxlIChidWZmZXI6IEF0b21UeXBlcy5UZXh0QnVmZmVyLCBwcmVmaXg6IHN0cmluZywgcG9zaXRpb246IEF0b21UeXBlcy5Qb2ludCkge1xuICAgIGlmICghdGhpcy5pc0FjdGl2ZSkgeyB0aHJvdyBuZXcgRXJyb3IoJ0JhY2tlbmQgaW5hY3RpdmUnKSB9XG4gICAgY29uc3Qgcm9vdERpciA9IGF3YWl0IHRoaXMucHJvY2Vzcy5nZXRSb290RGlyKGJ1ZmZlcilcbiAgICBsZXQgbW9kdWxlcyA9IHRoaXMubW9kTGlzdE1hcC5nZXQocm9vdERpcilcbiAgICBpZiAoISBtb2R1bGVzKSB7XG4gICAgICBtb2R1bGVzID0gYXdhaXQgdGhpcy5wcm9jZXNzLnJ1bkxpc3QoYnVmZmVyKVxuICAgICAgdGhpcy5tb2RMaXN0TWFwLnNldChyb290RGlyLCBtb2R1bGVzKVxuICAgICAgLy8gcmVmcmVzaCBldmVyeSBtaW51dGVcbiAgICAgIHNldFRpbWVvdXQoKCgpID0+IHRoaXMubW9kTGlzdE1hcC5kZWxldGUocm9vdERpcikpLCA2MCAqIDEwMDApXG4gICAgfVxuICAgIHJldHVybiBGWi5maWx0ZXIobW9kdWxlcywgcHJlZml4KVxuICB9XG5cbiAgLypcbiAgZ2V0Q29tcGxldGlvbnNGb3JTeW1ib2xJbk1vZHVsZShidWZmZXIscHJlZml4LHBvc2l0aW9uLHttb2R1bGV9KVxuICBVc2VkIGluIGltcG9ydCBoaWRpbmcvbGlzdCBjb21wbGV0aW9uc1xuXG4gIGJ1ZmZlcjogVGV4dEJ1ZmZlciwgY3VycmVudCBidWZmZXJcbiAgcHJlZml4OiBTdHJpbmcsIGNvbXBsZXRpb24gcHJlZml4XG4gIHBvc2l0aW9uOiBQb2ludCwgY3VycmVudCBjdXJzb3IgcG9zaXRpb25cbiAgbW9kdWxlOiBTdHJpbmcsIG1vZHVsZSBuYW1lIChvcHRpb25hbCkuIElmIHVuZGVmaW5lZCwgZnVuY3Rpb25cbiAgICAgICAgICB3aWxsIGF0dGVtcHQgdG8gaW5mZXIgbW9kdWxlIG5hbWUgZnJvbSBwb3NpdGlvbiBhbmQgYnVmZmVyLlxuXG4gIFJldHVybnM6IFByb21pc2UoW3N5bWJvbF0pXG4gIHN5bWJvbDogT2JqZWN0LCBzeW1ib2wgaW4gZ2l2ZW4gbW9kdWxlXG4gICAgbmFtZTogU3RyaW5nLCBzeW1ib2wgbmFtZVxuICAgIHR5cGVTaWduYXR1cmU6IFN0cmluZywgdHlwZSBzaWduYXR1cmVcbiAgICBzeW1ib2xUeXBlOiBTdHJpbmcsIG9uZSBvZiBbJ3R5cGUnLCAnY2xhc3MnLCAnZnVuY3Rpb24nXVxuICAqL1xuICBwdWJsaWMgYXN5bmMgZ2V0Q29tcGxldGlvbnNGb3JTeW1ib2xJbk1vZHVsZSAoXG4gICAgYnVmZmVyOiBBdG9tVHlwZXMuVGV4dEJ1ZmZlciwgcHJlZml4OiBzdHJpbmcsIHBvc2l0aW9uOiBBdG9tVHlwZXMuUG9pbnQsXG4gICAgb3B0cz86IHttb2R1bGU6IHN0cmluZ31cbiAgKSB7XG4gICAgaWYgKCF0aGlzLmlzQWN0aXZlKSB7IHRocm93IG5ldyBFcnJvcignQmFja2VuZCBpbmFjdGl2ZScpIH1cbiAgICBsZXQgbW9kdWxlTmFtZSA9IG9wdHMgPyBvcHRzLm1vZHVsZSA6IHVuZGVmaW5lZFxuICAgIGlmICghbW9kdWxlTmFtZSkge1xuICAgICAgY29uc3QgbGluZVJhbmdlID0gbmV3IFJhbmdlKFswLCBwb3NpdGlvbi5yb3ddLCBwb3NpdGlvbilcbiAgICAgIGJ1ZmZlci5iYWNrd2FyZHNTY2FuSW5SYW5nZSgvXmltcG9ydFxccysoW1xcdy5dKykvLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGxpbmVSYW5nZSwgKHttYXRjaH0pID0+IG1vZHVsZU5hbWUgPSBtYXRjaFsxXSlcbiAgICB9XG5cbiAgICBjb25zdCB7YnVmZmVySW5mb30gPSB0aGlzLmdldEJ1ZmZlckluZm8oe2J1ZmZlcn0pXG4gICAgY29uc3QgbWlzID0gYXdhaXQgdGhpcy5nZXRNb2R1bGVJbmZvKHtidWZmZXJJbmZvLCBtb2R1bGVOYW1lfSlcblxuICAgIC8vIHRzbGludDpkaXNhYmxlOiBuby1udWxsLWtleXdvcmRcbiAgICBjb25zdCBzeW1ib2xzID0gbWlzLm1vZHVsZUluZm8uc2VsZWN0KFxuICAgICAge1xuICAgICAgICBxdWFsaWZpZWQ6IGZhbHNlLFxuICAgICAgICBoaWRpbmc6IGZhbHNlLFxuICAgICAgICBuYW1lOiBtb2R1bGVOYW1lIHx8IG1pcy5tb2R1bGVOYW1lLFxuICAgICAgICBpbXBvcnRMaXN0OiBudWxsLFxuICAgICAgICBhbGlhczogbnVsbFxuICAgICAgfSxcbiAgICAgIHVuZGVmaW5lZCxcbiAgICAgIHRydWVcbiAgICApXG4gICAgLy8gdHNsaW50OmVuYWJsZTogbm8tbnVsbC1rZXl3b3JkXG4gICAgcmV0dXJuIEZaLmZpbHRlcihzeW1ib2xzLCBwcmVmaXgsIHtrZXk6ICduYW1lJ30pXG4gIH1cblxuICAvKlxuICBnZXRDb21wbGV0aW9uc0Zvckxhbmd1YWdlUHJhZ21hcyhidWZmZXIscHJlZml4LHBvc2l0aW9uKVxuICBidWZmZXI6IFRleHRCdWZmZXIsIGN1cnJlbnQgYnVmZmVyXG4gIHByZWZpeDogU3RyaW5nLCBjb21wbGV0aW9uIHByZWZpeFxuICBwb3NpdGlvbjogUG9pbnQsIGN1cnJlbnQgY3Vyc29yIHBvc2l0aW9uXG5cbiAgUmV0dXJuczogUHJvbWlzZShbcHJhZ21hXSlcbiAgcHJhZ21hOiBTdHJpbmcsIGxhbmd1YWdlIG9wdGlvblxuICAqL1xuICBwdWJsaWMgYXN5bmMgZ2V0Q29tcGxldGlvbnNGb3JMYW5ndWFnZVByYWdtYXMgKFxuICAgIGJ1ZmZlcjogQXRvbVR5cGVzLlRleHRCdWZmZXIsIHByZWZpeDogc3RyaW5nLCBwb3NpdGlvbjogQXRvbVR5cGVzLlBvaW50XG4gICkge1xuICAgIGlmICghdGhpcy5pc0FjdGl2ZSkgeyB0aHJvdyBuZXcgRXJyb3IoJ0JhY2tlbmQgaW5hY3RpdmUnKSB9XG5cbiAgICBjb25zdCBkaXIgPSBhd2FpdCB0aGlzLnByb2Nlc3MuZ2V0Um9vdERpcihidWZmZXIpXG5cbiAgICBsZXQgcHMgPSB0aGlzLmxhbmd1YWdlUHJhZ21hcy5nZXQoZGlyKVxuICAgIGlmICghIHBzKSB7XG4gICAgICBwcyA9IGF3YWl0IHRoaXMucHJvY2Vzcy5ydW5MYW5nKGRpcilcbiAgICAgIHBzICYmIHRoaXMubGFuZ3VhZ2VQcmFnbWFzLnNldChkaXIsIHBzKVxuICAgIH1cbiAgICByZXR1cm4gRlouZmlsdGVyKHBzLCBwcmVmaXgpXG4gIH1cblxuICAvKlxuICBnZXRDb21wbGV0aW9uc0ZvckNvbXBpbGVyT3B0aW9ucyhidWZmZXIscHJlZml4LHBvc2l0aW9uKVxuICBidWZmZXI6IFRleHRCdWZmZXIsIGN1cnJlbnQgYnVmZmVyXG4gIHByZWZpeDogU3RyaW5nLCBjb21wbGV0aW9uIHByZWZpeFxuICBwb3NpdGlvbjogUG9pbnQsIGN1cnJlbnQgY3Vyc29yIHBvc2l0aW9uXG5cbiAgUmV0dXJuczogUHJvbWlzZShbZ2hjb3B0XSlcbiAgZ2hjb3B0OiBTdHJpbmcsIGNvbXBpbGVyIG9wdGlvbiAoc3RhcnRzIHdpdGggJy1mJylcbiAgKi9cbiAgcHVibGljIGFzeW5jIGdldENvbXBsZXRpb25zRm9yQ29tcGlsZXJPcHRpb25zIChcbiAgICBidWZmZXI6IEF0b21UeXBlcy5UZXh0QnVmZmVyLCBwcmVmaXg6IHN0cmluZywgcG9zaXRpb246IEF0b21UeXBlcy5Qb2ludFxuICApIHtcbiAgICBpZiAoIXRoaXMuaXNBY3RpdmUpIHsgdGhyb3cgbmV3IEVycm9yKCdCYWNrZW5kIGluYWN0aXZlJykgfVxuXG4gICAgY29uc3QgZGlyID0gYXdhaXQgdGhpcy5wcm9jZXNzLmdldFJvb3REaXIoYnVmZmVyKVxuXG4gICAgbGV0IGNvID0gdGhpcy5jb21waWxlck9wdGlvbnMuZ2V0KGRpcilcbiAgICBpZiAoISBjbykge1xuICAgICAgY28gPSBhd2FpdCB0aGlzLnByb2Nlc3MucnVuRmxhZyhkaXIpXG4gICAgICB0aGlzLmNvbXBpbGVyT3B0aW9ucy5zZXQoZGlyLCBjbylcbiAgICB9XG4gICAgcmV0dXJuIEZaLmZpbHRlcihjbywgcHJlZml4KVxuICB9XG5cbiAgLypcbiAgZ2V0Q29tcGxldGlvbnNGb3JIb2xlKGJ1ZmZlcixwcmVmaXgscG9zaXRpb24pXG4gIEdldCBjb21wbGV0aW9ucyBiYXNlZCBvbiBleHByZXNzaW9uIHR5cGUuXG4gIEl0IGlzIGFzc3VtZWQgdGhhdCBgcHJlZml4YCBzdGFydHMgd2l0aCAnXydcblxuICBidWZmZXI6IFRleHRCdWZmZXIsIGN1cnJlbnQgYnVmZmVyXG4gIHByZWZpeDogU3RyaW5nLCBjb21wbGV0aW9uIHByZWZpeFxuICBwb3NpdGlvbjogUG9pbnQsIGN1cnJlbnQgY3Vyc29yIHBvc2l0aW9uXG5cbiAgUmV0dXJuczogUHJvbWlzZShbc3ltYm9sXSlcbiAgc3ltYm9sOiBTYW1lIGFzIGdldENvbXBsZXRpb25zRm9yU3ltYm9sXG4gICovXG4gIHB1YmxpYyBhc3luYyBnZXRDb21wbGV0aW9uc0ZvckhvbGUgKGJ1ZmZlcjogQXRvbVR5cGVzLlRleHRCdWZmZXIsIHByZWZpeDogc3RyaW5nLCBwb3NpdGlvbjogQXRvbVR5cGVzLlBvaW50KSB7XG4gICAgaWYgKCF0aGlzLmlzQWN0aXZlKSB7IHRocm93IG5ldyBFcnJvcignQmFja2VuZCBpbmFjdGl2ZScpIH1cbiAgICBjb25zdCByYW5nZSA9IG5ldyBSYW5nZShwb3NpdGlvbiwgcG9zaXRpb24pXG4gICAgaWYgKHByZWZpeC5zdGFydHNXaXRoKCdfJykpIHsgcHJlZml4ID0gcHJlZml4LnNsaWNlKDEpIH1cbiAgICBjb25zdCB7dHlwZX0gPSBhd2FpdCB0aGlzLnByb2Nlc3MuZ2V0VHlwZUluQnVmZmVyKGJ1ZmZlciwgcmFuZ2UpXG4gICAgY29uc3Qgc3ltYm9scyA9IGF3YWl0IHRoaXMuZ2V0U3ltYm9sc0ZvckJ1ZmZlcihidWZmZXIpXG4gICAgY29uc3QgdHMgPSBzeW1ib2xzLmZpbHRlcigocykgPT4ge1xuICAgICAgaWYgKCEgcy50eXBlU2lnbmF0dXJlKSB7IHJldHVybiBmYWxzZSB9XG4gICAgICBjb25zdCB0bCA9IHMudHlwZVNpZ25hdHVyZS5zcGxpdCgnIC0+ICcpLnNsaWNlKC0xKVswXVxuICAgICAgaWYgKHRsLm1hdGNoKC9eW2Etel0kLykpIHsgcmV0dXJuIGZhbHNlIH1cbiAgICAgIGNvbnN0IHRzMiA9IHRsLnJlcGxhY2UoL1suPyorXiRbXFxdXFxcXCgpe318LV0vZywgJ1xcXFwkJicpXG4gICAgICBjb25zdCByeCA9IFJlZ0V4cCh0czIucmVwbGFjZSgvXFxiW2Etel1cXGIvZywgJy4rJyksICcnKVxuICAgICAgcmV0dXJuIHJ4LnRlc3QodHlwZSlcbiAgICB9KVxuICAgIGlmIChwcmVmaXgubGVuZ3RoID09PSAwKSB7XG4gICAgICAvLyB0c2xpbnQ6ZGlzYWJsZS1uZXh0LWxpbmU6IG5vLW5vbi1udWxsLWFzc2VydGlvblxuICAgICAgcmV0dXJuIHRzLnNvcnQoKGEsIGIpID0+IEZaLnNjb3JlKGIudHlwZVNpZ25hdHVyZSEsIHR5cGUpIC0gRlouc2NvcmUoYS50eXBlU2lnbmF0dXJlISwgdHlwZSkpXG4gICAgfSBlbHNlIHtcbiAgICAgIHJldHVybiBGWi5maWx0ZXIodHMsIHByZWZpeCwge2tleTogJ3FuYW1lJ30pXG4gICAgfVxuICB9XG5cbiAgcHJpdmF0ZSBhc3luYyBnZXRTeW1ib2xzRm9yQnVmZmVyIChidWZmZXI6IEF0b21UeXBlcy5UZXh0QnVmZmVyLCBzeW1ib2xUeXBlcz86IFN5bWJvbFR5cGVbXSkge1xuICAgIGNvbnN0IHtidWZmZXJJbmZvfSA9IHRoaXMuZ2V0QnVmZmVySW5mbyh7YnVmZmVyfSlcbiAgICBjb25zdCB7cm9vdERpciwgbW9kdWxlTWFwfSA9IGF3YWl0IHRoaXMuZ2V0TW9kdWxlTWFwKHtidWZmZXJJbmZvfSlcbiAgICBpZiAoYnVmZmVySW5mbyAmJiBtb2R1bGVNYXApIHtcbiAgICAgIGNvbnN0IGltcG9ydHMgPSBhd2FpdCBidWZmZXJJbmZvLmdldEltcG9ydHMoKVxuICAgICAgY29uc3QgcHJvbWlzZXMgPSBhd2FpdCBQcm9taXNlLmFsbChcbiAgICAgICAgaW1wb3J0cy5tYXAoYXN5bmMgKGltcCkgPT4ge1xuICAgICAgICAgIGNvbnN0IHJlcyA9IGF3YWl0IHRoaXMuZ2V0TW9kdWxlSW5mbyh7XG4gICAgICAgICAgICBidWZmZXJJbmZvLFxuICAgICAgICAgICAgbW9kdWxlTmFtZTogaW1wLm5hbWUsXG4gICAgICAgICAgICByb290RGlyLFxuICAgICAgICAgICAgbW9kdWxlTWFwXG4gICAgICAgICAgfSlcbiAgICAgICAgICBpZiAoIXJlcykgeyByZXR1cm4gW10gfVxuICAgICAgICAgIHJldHVybiByZXMubW9kdWxlSW5mby5zZWxlY3QoaW1wLCBzeW1ib2xUeXBlcylcbiAgICAgICAgfSlcbiAgICAgIClcbiAgICAgIHJldHVybiAoW10gYXMgdHlwZW9mIHByb21pc2VzWzBdKS5jb25jYXQoLi4ucHJvbWlzZXMpXG4gICAgfSBlbHNlIHtcbiAgICAgIHJldHVybiBbXVxuICAgIH1cbiAgfVxuXG4gIHByaXZhdGUgZ2V0QnVmZmVySW5mbyAoe2J1ZmZlcn06IHtidWZmZXI6IEF0b21UeXBlcy5UZXh0QnVmZmVyfSk6IHtidWZmZXJJbmZvOiBCdWZmZXJJbmZvfSB7XG4gICAgbGV0IGJpID0gdGhpcy5idWZmZXJNYXAuZ2V0KGJ1ZmZlcilcbiAgICBpZiAoISBiaSkge1xuICAgICAgYmkgPSBuZXcgQnVmZmVySW5mbyhidWZmZXIpXG4gICAgICB0aGlzLmJ1ZmZlck1hcC5zZXQoYnVmZmVyLCBiaSlcbiAgICB9XG4gICAgcmV0dXJuIHtidWZmZXJJbmZvOiBiaX1cbiAgfVxuXG4gIHByaXZhdGUgYXN5bmMgZ2V0TW9kdWxlTWFwIChcbiAgICB7YnVmZmVySW5mbywgcm9vdERpcn06IHtidWZmZXJJbmZvOiBCdWZmZXJJbmZvLCByb290RGlyPzogQXRvbVR5cGVzLkRpcmVjdG9yeX1cbiAgKTogUHJvbWlzZTx7cm9vdERpcjogQXRvbVR5cGVzLkRpcmVjdG9yeSwgbW9kdWxlTWFwOiBNYXA8c3RyaW5nLCBNb2R1bGVJbmZvPn0+IHtcbiAgICBpZiAoISByb290RGlyKSB7XG4gICAgICByb290RGlyID0gYXdhaXQgdGhpcy5wcm9jZXNzLmdldFJvb3REaXIoYnVmZmVySW5mby5idWZmZXIpXG4gICAgfVxuICAgIGxldCBtbSA9IHRoaXMuZGlyTWFwLmdldChyb290RGlyKVxuICAgIGlmICghbW0pIHtcbiAgICAgIG1tID0gbmV3IE1hcCgpXG4gICAgICB0aGlzLmRpck1hcC5zZXQocm9vdERpciwgbW0pXG4gICAgfVxuXG4gICAgcmV0dXJuIHtcbiAgICAgIHJvb3REaXIsXG4gICAgICBtb2R1bGVNYXA6IG1tXG4gICAgfVxuICB9XG5cbiAgcHJpdmF0ZSBhc3luYyBnZXRNb2R1bGVJbmZvIChcbiAgICBhcmc6IHtcbiAgICAgIGJ1ZmZlckluZm86IEJ1ZmZlckluZm8sIG1vZHVsZU5hbWU/OiBzdHJpbmcsXG4gICAgICByb290RGlyPzogQXRvbVR5cGVzLkRpcmVjdG9yeSwgbW9kdWxlTWFwPzogTWFwPHN0cmluZywgTW9kdWxlSW5mbz5cbiAgICB9XG4gICkge1xuICAgIGNvbnN0IHtidWZmZXJJbmZvfSA9IGFyZ1xuICAgIGxldCBkYXRcbiAgICBpZiAoYXJnLnJvb3REaXIgJiYgYXJnLm1vZHVsZU1hcCkge1xuICAgICAgZGF0ID0ge3Jvb3REaXI6IGFyZy5yb290RGlyLCBtb2R1bGVNYXA6IGFyZy5tb2R1bGVNYXB9XG4gICAgfSBlbHNlIHtcbiAgICAgIGRhdCA9IGF3YWl0IHRoaXMuZ2V0TW9kdWxlTWFwKHtidWZmZXJJbmZvfSlcbiAgICB9XG4gICAgY29uc3Qge21vZHVsZU1hcCwgcm9vdERpcn0gPSBkYXRcbiAgICBsZXQgbW9kdWxlTmFtZSA9IGFyZy5tb2R1bGVOYW1lXG4gICAgaWYgKCFtb2R1bGVOYW1lKSB7XG4gICAgICBtb2R1bGVOYW1lID0gYXdhaXQgYnVmZmVySW5mby5nZXRNb2R1bGVOYW1lKClcbiAgICB9XG4gICAgaWYgKCFtb2R1bGVOYW1lKSB7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoYE5hbWVsZXNzIG1vZHVsZSBpbiAke2J1ZmZlckluZm8uYnVmZmVyLmdldFVyaSgpfWApXG4gICAgfVxuXG4gICAgbGV0IG1vZHVsZUluZm8gPSBtb2R1bGVNYXAuZ2V0KG1vZHVsZU5hbWUpXG4gICAgaWYgKCFtb2R1bGVJbmZvKSB7XG4gICAgICBtb2R1bGVJbmZvID0gbmV3IE1vZHVsZUluZm8obW9kdWxlTmFtZSwgdGhpcy5wcm9jZXNzLCByb290RGlyKVxuICAgICAgbW9kdWxlTWFwLnNldChtb2R1bGVOYW1lLCBtb2R1bGVJbmZvKVxuXG4gICAgICBpZiAoYnVmZmVySW5mbykge1xuICAgICAgICBtb2R1bGVJbmZvLnNldEJ1ZmZlcihidWZmZXJJbmZvLCByb290RGlyKVxuICAgICAgfSBlbHNlIHtcbiAgICAgICAgZm9yIChjb25zdCBlZGl0b3Igb2YgYXRvbS53b3Jrc3BhY2UuZ2V0VGV4dEVkaXRvcnMoKSkge1xuICAgICAgICAgIGNvbnN0IGJpcyA9IHRoaXMuZ2V0QnVmZmVySW5mbyh7YnVmZmVyOiBlZGl0b3IuZ2V0QnVmZmVyKCl9KVxuICAgICAgICAgIG1vZHVsZUluZm8uc2V0QnVmZmVyKGJpcy5idWZmZXJJbmZvLCByb290RGlyKVxuICAgICAgICB9XG4gICAgICB9XG5cbiAgICAgIGNvbnN0IG1uID0gbW9kdWxlTmFtZVxuICAgICAgbW9kdWxlSW5mby5vbkRpZERlc3Ryb3koKCkgPT4ge1xuICAgICAgICBtb2R1bGVNYXAuZGVsZXRlKG1uKVxuICAgICAgICByZXR1cm4gVXRpbC5kZWJ1ZyhgJHttb2R1bGVOYW1lfSByZW1vdmVkIGZyb20gbWFwYClcbiAgICAgIH0pXG4gICAgICBhd2FpdCBtb2R1bGVJbmZvLmluaXRpYWxVcGRhdGVQcm9taXNlXG4gICAgfVxuICAgIHJldHVybiB7YnVmZmVySW5mbywgcm9vdERpciwgbW9kdWxlTWFwLCBtb2R1bGVJbmZvLCBtb2R1bGVOYW1lfVxuICB9XG5cbiAgcHJpdmF0ZSBmaWx0ZXI8VCwgSyBleHRlbmRzIGtleW9mIFQ+IChjYW5kaWRhdGVzOiBUW10sIHByZWZpeDogc3RyaW5nLCBrZXlzOiBLW10pOiBUW10ge1xuICAgIGlmICghcHJlZml4KSB7XG4gICAgICByZXR1cm4gY2FuZGlkYXRlc1xuICAgIH1cbiAgICBjb25zdCBsaXN0ID0gW11cbiAgICBmb3IgKGNvbnN0IGNhbmRpZGF0ZSBvZiBjYW5kaWRhdGVzKSB7XG4gICAgICBjb25zdCBzY29yZXMgPSBrZXlzLm1hcCgoa2V5KSA9PiB7XG4gICAgICAgIGNvbnN0IGNrID0gY2FuZGlkYXRlW2tleV1cbiAgICAgICAgaWYgKGNrKSB7XG4gICAgICAgICAgcmV0dXJuIEZaLnNjb3JlKGNrLnRvU3RyaW5nKCksIHByZWZpeClcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICByZXR1cm4gMFxuICAgICAgICB9XG4gICAgICB9KVxuICAgICAgY29uc3Qgc2NvcmUgPSBNYXRoLm1heCguLi5zY29yZXMpXG4gICAgICBpZiAoc2NvcmUgPiAwKSB7XG4gICAgICAgIGxpc3QucHVzaCh7XG4gICAgICAgICAgc2NvcmUsXG4gICAgICAgICAgc2NvcmVOOiBzY29yZXMuaW5kZXhPZihzY29yZSksXG4gICAgICAgICAgZGF0YTogY2FuZGlkYXRlXG4gICAgICAgIH0pXG4gICAgICB9XG4gICAgfVxuICAgIHJldHVybiBsaXN0LnNvcnQoKGEsIGIpID0+IHtcbiAgICAgICAgY29uc3QgcyA9IGIuc2NvcmUgLSBhLnNjb3JlXG4gICAgICAgIGlmIChzID09PSAwKSB7XG4gICAgICAgICAgcmV0dXJuIGEuc2NvcmVOIC0gYi5zY29yZU5cbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gc1xuICAgICAgfSkubWFwKCh7ZGF0YX0pID0+IGRhdGEpXG4gIH1cbn1cbiJdfQ==