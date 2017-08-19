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
const atom_1 = require("atom");
const Util = require("../util");
class ModuleInfo {
    constructor(name, process, rootDir) {
        this.name = name;
        this.process = process;
        this.rootDir = rootDir;
        this.invalidateInterval = 30 * 60 * 1000;
        Util.debug(`${this.name} created`);
        this.symbols = [];
        this.disposables = new atom_1.CompositeDisposable();
        this.bufferSet = new WeakSet();
        this.emitter = new atom_1.Emitter();
        this.disposables.add(this.emitter);
        this.initialUpdatePromise = this.update(rootDir);
        this.timeout = setTimeout(this.destroy.bind(this), this.invalidateInterval);
        this.disposables.add(this.process.onDidDestroy(this.destroy.bind(this)));
    }
    destroy() {
        Util.debug(`${this.name} destroyed`);
        clearTimeout(this.timeout);
        this.emitter.emit('did-destroy', undefined);
        this.disposables.dispose();
    }
    onDidDestroy(callback) {
        return this.emitter.on('did-destroy', callback);
    }
    setBuffer(bufferInfo) {
        return __awaiter(this, void 0, void 0, function* () {
            const name = yield bufferInfo.getModuleName();
            if (name !== this.name) {
                return;
            }
            if (this.bufferSet.has(bufferInfo.buffer)) {
                return;
            }
            this.bufferSet.add(bufferInfo.buffer);
            Util.debug(`${this.name} buffer is set`);
            const disposables = new atom_1.CompositeDisposable();
            disposables.add(bufferInfo.buffer.onDidSave(() => {
                Util.debug(`${this.name} did-save triggered`);
                this.update(this.rootDir);
            }));
            disposables.add(bufferInfo.buffer.onDidDestroy(() => {
                disposables.dispose();
                this.bufferSet.delete(bufferInfo.buffer);
                this.disposables.remove(disposables);
            }));
            this.disposables.add(disposables);
        });
    }
    select(importDesc, symbolTypes, skipQualified = false) {
        clearTimeout(this.timeout);
        this.timeout = setTimeout(this.destroy.bind(this), this.invalidateInterval);
        let symbols = this.symbols;
        if (importDesc.importList) {
            const il = importDesc.importList;
            symbols = symbols.filter((s) => {
                const inImportList = il.includes(s.name);
                const parentInImportList = il.some((i) => (typeof i !== 'string') && (s.parent === i.parent));
                const shouldShow = inImportList || parentInImportList;
                return importDesc.hiding !== shouldShow;
            });
        }
        const res = [];
        for (const symbol of symbols) {
            if (symbolTypes && !symbolTypes.includes(symbol.symbolType)) {
                continue;
            }
            const specific = {
                name: symbol.name,
                typeSignature: symbol.typeSignature,
                symbolType: symbol.symbolType,
                module: importDesc,
            };
            const qn = (n) => `${importDesc.alias || importDesc.name}.${n}`;
            if (!skipQualified) {
                res.push(Object.assign({}, specific, { qparent: symbol.parent ? qn(symbol.parent) : undefined, qname: qn(symbol.name) }));
            }
            if (!importDesc.qualified) {
                res.push(Object.assign({}, specific, { qparent: symbol.parent, qname: symbol.name }));
            }
        }
        return res;
    }
    update(rootDir) {
        return __awaiter(this, void 0, void 0, function* () {
            Util.debug(`${this.name} updating`);
            this.symbols = yield this.process.runBrowse(rootDir, [this.name]);
            Util.debug(`${this.name} updated`);
        });
    }
}
exports.ModuleInfo = ModuleInfo;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibW9kdWxlLWluZm8uanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi9zcmMvY29tcGxldGlvbi1iYWNrZW5kL21vZHVsZS1pbmZvLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7Ozs7Ozs7Ozs7QUFBQSwrQkFBNkQ7QUFDN0QsZ0NBQStCO0FBTy9CO0lBV0UsWUFBb0IsSUFBWSxFQUFVLE9BQXVCLEVBQVUsT0FBNEI7UUFBbkYsU0FBSSxHQUFKLElBQUksQ0FBUTtRQUFVLFlBQU8sR0FBUCxPQUFPLENBQWdCO1FBQVUsWUFBTyxHQUFQLE9BQU8sQ0FBcUI7UUFIL0YsdUJBQWtCLEdBQUcsRUFBRSxHQUFHLEVBQUUsR0FBRyxJQUFJLENBQUE7UUFJekMsSUFBSSxDQUFDLEtBQUssQ0FBQyxHQUFHLElBQUksQ0FBQyxJQUFJLFVBQVUsQ0FBQyxDQUFBO1FBQ2xDLElBQUksQ0FBQyxPQUFPLEdBQUcsRUFBRSxDQUFBO1FBQ2pCLElBQUksQ0FBQyxXQUFXLEdBQUcsSUFBSSwwQkFBbUIsRUFBRSxDQUFBO1FBQzVDLElBQUksQ0FBQyxTQUFTLEdBQUcsSUFBSSxPQUFPLEVBQUUsQ0FBQTtRQUM5QixJQUFJLENBQUMsT0FBTyxHQUFHLElBQUksY0FBTyxFQUFFLENBQUE7UUFDNUIsSUFBSSxDQUFDLFdBQVcsQ0FBQyxHQUFHLENBQUMsSUFBSSxDQUFDLE9BQU8sQ0FBQyxDQUFBO1FBQ2xDLElBQUksQ0FBQyxvQkFBb0IsR0FBRyxJQUFJLENBQUMsTUFBTSxDQUFDLE9BQU8sQ0FBQyxDQUFBO1FBQ2hELElBQUksQ0FBQyxPQUFPLEdBQUcsVUFBVSxDQUFDLElBQUksQ0FBQyxPQUFPLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxFQUFFLElBQUksQ0FBQyxrQkFBa0IsQ0FBQyxDQUFBO1FBQzNFLElBQUksQ0FBQyxXQUFXLENBQUMsR0FBRyxDQUFDLElBQUksQ0FBQyxPQUFPLENBQUMsWUFBWSxDQUFDLElBQUksQ0FBQyxPQUFPLENBQUMsSUFBSSxD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QUFDLFVBQVUsQ0FBQyxTQUFTLENBQUMsQ0FBQyxDQUFDO2dCQUMxQixHQUFHLENBQUMsSUFBSSxtQkFDSCxRQUFRLElBQ1gsT0FBTyxFQUFFLE1BQU0sQ0FBQyxNQUFNLEVBQ3RCLEtBQUssRUFBRSxNQUFNLENBQUMsSUFBSSxJQUNsQixDQUFBO1lBQ0osQ0FBQztRQUNILENBQUM7UUFDRCxNQUFNLENBQUMsR0FBRyxDQUFBO0lBQ1osQ0FBQztJQUVhLE1BQU0sQ0FBQyxPQUE0Qjs7WUFDL0MsSUFBSSxDQUFDLEtBQUssQ0FBQyxHQUFHLElBQUksQ0FBQyxJQUFJLFdBQVcsQ0FBQyxDQUFBO1lBQ25DLElBQUksQ0FBQyxPQUFPLEdBQUcsTUFBTSxJQUFJLENBQUMsT0FBTyxDQUFDLFNBQVMsQ0FBQyxPQUFPLEVBQUUsQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQTtZQUNqRSxJQUFJLENBQUMsS0FBSyxDQUFDLEdBQUcsSUFBSSxDQUFDLElBQUksVUFBVSxDQUFDLENBQUE7UUFDcEMsQ0FBQztLQUFBO0NBQ0Y7QUFuR0QsZ0NBbUdDIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IHsgQ29tcG9zaXRlRGlzcG9zYWJsZSwgVEVtaXR0ZXIsIEVtaXR0ZXIgfSBmcm9tICdhdG9tJ1xuaW1wb3J0ICogYXMgVXRpbCBmcm9tICcuLi91dGlsJ1xuaW1wb3J0IHsgR2hjTW9kaVByb2Nlc3MgfSBmcm9tICcuLi9naGMtbW9kJ1xuaW1wb3J0IHsgQnVmZmVySW5mbywgSUltcG9ydCB9IGZyb20gJy4vYnVmZmVyLWluZm8nXG5pbXBvcnQgeyBTeW1ib2xEZXNjIH0gZnJvbSAnLi4vZ2hjLW1vZCdcblxuaW1wb3J0IFN5bWJvbFR5cGUgPSBVUEkuQ29tcGxldGlvbkJhY2tlbmQuU3ltYm9sVHlwZVxuXG5leHBvcnQgY2xhc3MgTW9kdWxlSW5mbyB7XG4gIHB1YmxpYyByZWFkb25seSBpbml0aWFsVXBkYXRlUHJvbWlzZTogUHJvbWlzZTx2b2lkPlxuICBwcml2YXRlIHN5bWJvbHM6IFN5bWJvbERlc2NbXSAvLyBtb2R1bGUgc3ltYm9sc1xuICBwcml2YXRlIGRpc3Bvc2FibGVzOiBDb21wb3NpdGVEaXNwb3NhYmxlXG4gIHByaXZhdGUgZW1pdHRlcjogVEVtaXR0ZXI8e1xuICAgICdkaWQtZGVzdHJveSc6IHVuZGVmaW5lZFxuICB9PlxuICBwcml2YXRlIHRpbWVvdXQ6IE5vZGVKUy5UaW1lclxuICBwcml2YXRlIGludmFsaWRhdGVJbnRlcnZhbCA9IDMwICogNjAgKiAxMDAwIC8vIGlmIG1vZHVsZSB1bnVzZWQgZm9yIDMwIG1pbnV0ZXMsIHJlbW92ZSBpdFxuICBwcml2YXRlIGJ1ZmZlclNldDogV2Vha1NldDxBdG9tVHlwZXMuVGV4dEJ1ZmZlcj5cblxuICBjb25zdHJ1Y3Rvcihwcml2YXRlIG5hbWU6IHN0cmluZywgcHJpdmF0ZSBwcm9jZXNzOiBHaGNNb2RpUHJvY2VzcywgcHJpdmF0ZSByb290RGlyOiBBdG9tVHlwZXMuRGlyZWN0b3J5KSB7XG4gICAgVXRpbC5kZWJ1ZyhgJHt0aGlzLm5hbWV9IGNyZWF0ZWRgKVxuICAgIHRoaXMuc3ltYm9scyA9IFtdXG4gICAgdGhpcy5kaXNwb3NhYmxlcyA9IG5ldyBDb21wb3NpdGVEaXNwb3NhYmxlKClcbiAgICB0aGlzLmJ1ZmZlclNldCA9IG5ldyBXZWFrU2V0KClcbiAgICB0aGlzLmVtaXR0ZXIgPSBuZXcgRW1pdHRlcigpXG4gICAgdGhpcy5kaXNwb3NhYmxlcy5hZGQodGhpcy5lbWl0dGVyKVxuICAgIHRoaXMuaW5pdGlhbFVwZGF0ZVByb21pc2UgPSB0aGlzLnVwZGF0ZShyb290RGlyKVxuICAgIHRoaXMudGltZW91dCA9IHNldFRpbWVvdXQodGhpcy5kZXN0cm95LmJpbmQodGhpcyksIHRoaXMuaW52YWxpZGF0ZUludGVydmFsKVxuICAgIHRoaXMuZGlzcG9zYWJsZXMuYWRkKHRoaXMucHJvY2Vzcy5vbkRpZERlc3Ryb3kodGhpcy5kZXN0cm95LmJpbmQodGhpcykpKVxuICB9XG5cbiAgcHVibGljIGRlc3Ryb3koKSB7XG4gICAgVXRpbC5kZWJ1ZyhgJHt0aGlzLm5hbWV9IGRlc3Ryb3llZGApXG4gICAgY2xlYXJUaW1lb3V0KHRoaXMudGltZW91dClcbiAgICB0aGlzLmVtaXR0ZXIuZW1pdCgnZGlkLWRlc3Ryb3knLCB1bmRlZmluZWQpXG4gICAgdGhpcy5kaXNwb3NhYmxlcy5kaXNwb3NlKClcbiAgfVxuXG4gIHB1YmxpYyBvbkRpZERlc3Ryb3koY2FsbGJhY2s6ICgpID0+IHZvaWQpIHtcbiAgICByZXR1cm4gdGhpcy5lbWl0dGVyLm9uKCdkaWQtZGVzdHJveScsIGNhbGxiYWNrKVxuICB9XG5cbiAgcHVibGljIGFzeW5jIHNldEJ1ZmZlcihidWZmZXJJbmZvOiBCdWZmZXJJbmZvKSB7XG4gICAgY29uc3QgbmFtZSA9IGF3YWl0IGJ1ZmZlckluZm8uZ2V0TW9kdWxlTmFtZSgpXG4gICAgaWYgKG5hbWUgIT09IHRoaXMubmFtZSkgeyByZXR1cm4gfVxuICAgIGlmICh0aGlzLmJ1ZmZlclNldC5oYXMoYnVmZmVySW5mby5idWZmZXIpKSB7IHJldHVybiB9XG4gICAgdGhpcy5idWZmZXJTZXQuYWRkKGJ1ZmZlckluZm8uYnVmZmVyKVxuICAgIFV0aWwuZGVidWcoYCR7dGhpcy5uYW1lfSBidWZmZXIgaXMgc2V0YClcbiAgICBjb25zdCBkaXNwb3NhYmxlcyA9IG5ldyBDb21wb3NpdGVEaXNwb3NhYmxlKClcbiAgICBkaXNwb3NhYmxlcy5hZGQoYnVmZmVySW5mby5idWZmZXIub25EaWRTYXZlKCgpID0+IHtcbiAgICAgIFV0aWwuZGVidWcoYCR7dGhpcy5uYW1lfSBkaWQtc2F2ZSB0cmlnZ2VyZWRgKVxuICAgICAgdGhpcy51cGRhdGUodGhpcy5yb290RGlyKVxuICAgIH0pKVxuICAgIGRpc3Bvc2FibGVzLmFkZChidWZmZXJJbmZvLmJ1ZmZlci5vbkRpZERlc3Ryb3koKCkgPT4ge1xuICAgICAgZGlzcG9zYWJsZXMuZGlzcG9zZSgpXG4gICAgICB0aGlzLmJ1ZmZlclNldC5kZWxldGUoYnVmZmVySW5mby5idWZmZXIpXG4gICAgICB0aGlzLmRpc3Bvc2FibGVzLnJlbW92ZShkaXNwb3NhYmxlcylcbiAgICB9KSlcbiAgICB0aGlzLmRpc3Bvc2FibGVzLmFkZChkaXNwb3NhYmxlcylcbiAgfVxuXG4gIHB1YmxpYyBzZWxlY3QoaW1wb3J0RGVzYzogSUltcG9ydCwgc3ltYm9sVHlwZXM/OiBTeW1ib2xUeXBlW10sIHNraXBRdWFsaWZpZWQ6IGJvb2xlYW4gPSBmYWxzZSkge1xuICAgIGNsZWFyVGltZW91dCh0aGlzLnRpbWVvdXQpXG4gICAgdGhpcy50aW1lb3V0ID0gc2V0VGltZW91dCh0aGlzLmRlc3Ryb3kuYmluZCh0aGlzKSwgdGhpcy5pbnZhbGlkYXRlSW50ZXJ2YWwpXG4gICAgbGV0IHN5bWJvbHMgPSB0aGlzLnN5bWJvbHNcbiAgICBpZiAoaW1wb3J0RGVzYy5pbXBvcnRMaXN0KSB7XG4gICAgICBjb25zdCBpbCA9IGltcG9ydERlc2MuaW1wb3J0TGlzdFxuICAgICAgc3ltYm9scyA9IHN5bWJvbHMuZmlsdGVyKChzKSA9PiB7XG4gICAgICAgIGNvbnN0IGluSW1wb3J0TGlzdCA9IGlsLmluY2x1ZGVzKHMubmFtZSlcbiAgICAgICAgY29uc3QgcGFyZW50SW5JbXBvcnRMaXN0ID0gaWwuc29tZSgoaSkgPT4gKHR5cGVvZiBpICE9PSAnc3RyaW5nJykgJiYgKHMucGFyZW50ID09PSBpLnBhcmVudCkpXG4gICAgICAgIGNvbnN0IHNob3VsZFNob3cgPSBpbkltcG9ydExpc3QgfHwgcGFyZW50SW5JbXBvcnRMaXN0XG4gICAgICAgIHJldHVybiBpbXBvcnREZXNjLmhpZGluZyAhPT0gc2hvdWxkU2hvdyAvLyBYT1JcbiAgICAgIH0pXG4gICAgfVxuICAgIGNvbnN0IHJlcyA9IFtdXG4gICAgZm9yIChjb25zdCBzeW1ib2wgb2Ygc3ltYm9scykge1xuICAgICAgaWYgKHN5bWJvbFR5cGVzICYmICFzeW1ib2xUeXBlcy5pbmNsdWRlcyhzeW1ib2wuc3ltYm9sVHlwZSkpIHsgY29udGludWUgfVxuICAgICAgY29uc3Qgc3BlY2lmaWMgPSB7XG4gICAgICAgIG5hbWU6IHN5bWJvbC5uYW1lLFxuICAgICAgICB0eXBlU2lnbmF0dXJlOiBzeW1ib2wudHlwZVNpZ25hdHVyZSxcbiAgICAgICAgc3ltYm9sVHlwZTogc3ltYm9sLnN5bWJvbFR5cGUsXG4gICAgICAgIG1vZHVsZTogaW1wb3J0RGVzYyxcbiAgICAgIH1cbiAgICAgIGNvbnN0IHFuID0gKG46IHN0cmluZykgPT4gYCR7aW1wb3J0RGVzYy5hbGlhcyB8fCBpbXBvcnREZXNjLm5hbWV9LiR7bn1gXG4gICAgICBpZiAoIXNraXBRdWFsaWZpZWQpIHtcbiAgICAgICAgcmVzLnB1c2goe1xuICAgICAgICAgIC4uLnNwZWNpZmljLFxuICAgICAgICAgIHFwYXJlbnQ6IHN5bWJvbC5wYXJlbnQgPyBxbihzeW1ib2wucGFyZW50KSA6IHVuZGVmaW5lZCxcbiAgICAgICAgICBxbmFtZTogcW4oc3ltYm9sLm5hbWUpLFxuICAgICAgICB9KVxuICAgICAgfVxuICAgICAgaWYgKCFpbXBvcnREZXNjLnF1YWxpZmllZCkge1xuICAgICAgICByZXMucHVzaCh7XG4gICAgICAgICAgLi4uc3BlY2lmaWMsXG4gICAgICAgICAgcXBhcmVudDogc3ltYm9sLnBhcmVudCxcbiAgICAgICAgICBxbmFtZTogc3ltYm9sLm5hbWUsXG4gICAgICAgIH0pXG4gICAgICB9XG4gICAgfVxuICAgIHJldHVybiByZXNcbiAgfVxuXG4gIHByaXZhdGUgYXN5bmMgdXBkYXRlKHJvb3REaXI6IEF0b21UeXBlcy5EaXJlY3RvcnkpIHtcbiAgICBVdGlsLmRlYnVnKGAke3RoaXMubmFtZX0gdXBkYXRpbmdgKVxuICAgIHRoaXMuc3ltYm9scyA9IGF3YWl0IHRoaXMucHJvY2Vzcy5ydW5Ccm93c2Uocm9vdERpciwgW3RoaXMubmFtZV0pXG4gICAgVXRpbC5kZWJ1ZyhgJHt0aGlzLm5hbWV9IHVwZGF0ZWRgKVxuICB9XG59XG4iXX0=