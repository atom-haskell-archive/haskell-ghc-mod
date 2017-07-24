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
        this.emitter.emit('did-destroy');
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
                module: importDesc
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibW9kdWxlLWluZm8uanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi9zcmMvY29tcGxldGlvbi1iYWNrZW5kL21vZHVsZS1pbmZvLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7Ozs7Ozs7Ozs7QUFVQSwrQkFBbUQ7QUFDbkQsZ0NBQStCO0FBTy9CO0lBU0UsWUFBcUIsSUFBWSxFQUFVLE9BQXVCLEVBQVUsT0FBNEI7UUFBbkYsU0FBSSxHQUFKLElBQUksQ0FBUTtRQUFVLFlBQU8sR0FBUCxPQUFPLENBQWdCO1FBQVUsWUFBTyxHQUFQLE9BQU8sQ0FBcUI7UUFIaEcsdUJBQWtCLEdBQUcsRUFBRSxHQUFHLEVBQUUsR0FBRyxJQUFJLENBQUE7UUFJekMsSUFBSSxDQUFDLEtBQUssQ0FBQyxHQUFHLElBQUksQ0FBQyxJQUFJLFVBQVUsQ0FBQyxDQUFBO1FBQ2xDLElBQUksQ0FBQyxPQUFPLEdBQUcsRUFBRSxDQUFBO1FBQ2pCLElBQUksQ0FBQyxXQUFXLEdBQUcsSUFBSSwwQkFBbUIsRUFBRSxDQUFBO1FBQzVDLElBQUksQ0FBQyxTQUFTLEdBQUcsSUFBSSxPQUFPLEVBQUUsQ0FBQTtRQUM5QixJQUFJLENBQUMsT0FBTyxHQUFHLElBQUksY0FBTyxFQUFFLENBQUE7UUFDNUIsSUFBSSxDQUFDLFdBQVcsQ0FBQyxHQUFHLENBQUMsSUFBSSxDQUFDLE9BQU8sQ0FBQyxDQUFBO1FBQ2xDLElBQUksQ0FBQyxvQkFBb0IsR0FBRyxJQUFJLENBQUMsTUFBTSxDQUFDLE9BQU8sQ0FBQyxDQUFBO1FBQ2hELElBQUksQ0FBQyxPQUFPLEdBQUcsVUFBVSxDQUFDLElBQUksQ0FBQyxPQUFPLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxFQUFFLElBQUksQ0FBQyxrQkFBa0IsQ0FBQyxDQUFBO1FBQzNFLElBQUksQ0FBQyxXQUFXLENBQUMsR0FBRyxDQUFDLElBQUksQ0FBQyxPQUFPLENBQUMsWUFBWSxDQUFDLElBQUksQ0FBQyxPQUFPLENBQUMsSUFBSSxD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QUFDLFNBQVMsQ0FBQyxDQUFDLENBQUM7Z0JBQzNCLEdBQUcsQ0FBQyxJQUFJLG1CQUNILFFBQVEsSUFDWCxPQUFPLEVBQUUsTUFBTSxDQUFDLE1BQU0sRUFDdEIsS0FBSyxFQUFFLE1BQU0sQ0FBQyxJQUFJLElBQ2xCLENBQUE7WUFDSixDQUFDO1FBQ0gsQ0FBQztRQUNELE1BQU0sQ0FBQyxHQUFHLENBQUE7SUFDWixDQUFDO0lBRWEsTUFBTSxDQUFFLE9BQTRCOztZQUNoRCxJQUFJLENBQUMsS0FBSyxDQUFDLEdBQUcsSUFBSSxDQUFDLElBQUksV0FBVyxDQUFDLENBQUE7WUFDbkMsSUFBSSxDQUFDLE9BQU8sR0FBRyxNQUFNLElBQUksQ0FBQyxPQUFPLENBQUMsU0FBUyxDQUFDLE9BQU8sRUFBRSxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFBO1lBQ2pFLElBQUksQ0FBQyxLQUFLLENBQUMsR0FBRyxJQUFJLENBQUMsSUFBSSxVQUFVLENBQUMsQ0FBQTtRQUNwQyxDQUFDO0tBQUE7Q0FDRjtBQWpHRCxnQ0FpR0MiLCJzb3VyY2VzQ29udGVudCI6WyIvKlxuICogZGVjYWZmZWluYXRlIHN1Z2dlc3Rpb25zOlxuICogRFMxMDE6IFJlbW92ZSB1bm5lY2Vzc2FyeSB1c2Ugb2YgQXJyYXkuZnJvbVxuICogRFMxMDI6IFJlbW92ZSB1bm5lY2Vzc2FyeSBjb2RlIGNyZWF0ZWQgYmVjYXVzZSBvZiBpbXBsaWNpdCByZXR1cm5zXG4gKiBEUzEwMzogUmV3cml0ZSBjb2RlIHRvIG5vIGxvbmdlciB1c2UgX19ndWFyZF9fXG4gKiBEUzEwNDogQXZvaWQgaW5saW5lIGFzc2lnbm1lbnRzXG4gKiBEUzIwNjogQ29uc2lkZXIgcmV3b3JraW5nIGNsYXNzZXMgdG8gYXZvaWQgaW5pdENsYXNzXG4gKiBEUzIwNzogQ29uc2lkZXIgc2hvcnRlciB2YXJpYXRpb25zIG9mIG51bGwgY2hlY2tzXG4gKiBGdWxsIGRvY3M6IGh0dHBzOi8vZ2l0aHViLmNvbS9kZWNhZmZlaW5hdGUvZGVjYWZmZWluYXRlL2Jsb2IvbWFzdGVyL2RvY3Mvc3VnZ2VzdGlvbnMubWRcbiAqL1xuaW1wb3J0IHsgQ29tcG9zaXRlRGlzcG9zYWJsZSwgRW1pdHRlciB9IGZyb20gJ2F0b20nXG5pbXBvcnQgKiBhcyBVdGlsIGZyb20gJy4uL3V0aWwnXG5pbXBvcnQge0doY01vZGlQcm9jZXNzfSBmcm9tICcuLi9naGMtbW9kJ1xuaW1wb3J0IHtCdWZmZXJJbmZvLCBJSW1wb3J0fSBmcm9tICcuL2J1ZmZlci1pbmZvJ1xuaW1wb3J0IHtTeW1ib2xEZXNjfSBmcm9tICcuLi9naGMtbW9kJ1xuXG5pbXBvcnQgU3ltYm9sVHlwZSA9IFVQSS5Db21wbGV0aW9uQmFja2VuZC5TeW1ib2xUeXBlXG5cbmV4cG9ydCBjbGFzcyBNb2R1bGVJbmZvIHtcbiAgcHVibGljIHJlYWRvbmx5IGluaXRpYWxVcGRhdGVQcm9taXNlOiBQcm9taXNlPHZvaWQ+XG4gIHByaXZhdGUgc3ltYm9sczogU3ltYm9sRGVzY1tdIC8vIG1vZHVsZSBzeW1ib2xzXG4gIHByaXZhdGUgZGlzcG9zYWJsZXM6IENvbXBvc2l0ZURpc3Bvc2FibGVcbiAgcHJpdmF0ZSBlbWl0dGVyOiBFbWl0dGVyXG4gIHByaXZhdGUgdGltZW91dDogTm9kZUpTLlRpbWVyXG4gIHByaXZhdGUgaW52YWxpZGF0ZUludGVydmFsID0gMzAgKiA2MCAqIDEwMDAgLy8gaWYgbW9kdWxlIHVudXNlZCBmb3IgMzAgbWludXRlcywgcmVtb3ZlIGl0XG4gIHByaXZhdGUgYnVmZmVyU2V0OiBXZWFrU2V0PEF0b21UeXBlcy5UZXh0QnVmZmVyPlxuXG4gIGNvbnN0cnVjdG9yIChwcml2YXRlIG5hbWU6IHN0cmluZywgcHJpdmF0ZSBwcm9jZXNzOiBHaGNNb2RpUHJvY2VzcywgcHJpdmF0ZSByb290RGlyOiBBdG9tVHlwZXMuRGlyZWN0b3J5KSB7XG4gICAgVXRpbC5kZWJ1ZyhgJHt0aGlzLm5hbWV9IGNyZWF0ZWRgKVxuICAgIHRoaXMuc3ltYm9scyA9IFtdXG4gICAgdGhpcy5kaXNwb3NhYmxlcyA9IG5ldyBDb21wb3NpdGVEaXNwb3NhYmxlKClcbiAgICB0aGlzLmJ1ZmZlclNldCA9IG5ldyBXZWFrU2V0KClcbiAgICB0aGlzLmVtaXR0ZXIgPSBuZXcgRW1pdHRlcigpXG4gICAgdGhpcy5kaXNwb3NhYmxlcy5hZGQodGhpcy5lbWl0dGVyKVxuICAgIHRoaXMuaW5pdGlhbFVwZGF0ZVByb21pc2UgPSB0aGlzLnVwZGF0ZShyb290RGlyKVxuICAgIHRoaXMudGltZW91dCA9IHNldFRpbWVvdXQodGhpcy5kZXN0cm95LmJpbmQodGhpcyksIHRoaXMuaW52YWxpZGF0ZUludGVydmFsKVxuICAgIHRoaXMuZGlzcG9zYWJsZXMuYWRkKHRoaXMucHJvY2Vzcy5vbkRpZERlc3Ryb3kodGhpcy5kZXN0cm95LmJpbmQodGhpcykpKVxuICB9XG5cbiAgcHVibGljIGRlc3Ryb3kgKCkge1xuICAgIFV0aWwuZGVidWcoYCR7dGhpcy5uYW1lfSBkZXN0cm95ZWRgKVxuICAgIGNsZWFyVGltZW91dCh0aGlzLnRpbWVvdXQpXG4gICAgdGhpcy5lbWl0dGVyLmVtaXQoJ2RpZC1kZXN0cm95JylcbiAgICB0aGlzLmRpc3Bvc2FibGVzLmRpc3Bvc2UoKVxuICB9XG5cbiAgcHVibGljIG9uRGlkRGVzdHJveSAoY2FsbGJhY2s6ICgpID0+IHZvaWQpIHtcbiAgICByZXR1cm4gdGhpcy5lbWl0dGVyLm9uKCdkaWQtZGVzdHJveScsIGNhbGxiYWNrKVxuICB9XG5cbiAgcHVibGljIGFzeW5jIHNldEJ1ZmZlciAoYnVmZmVySW5mbzogQnVmZmVySW5mbykge1xuICAgIGNvbnN0IG5hbWUgPSBhd2FpdCBidWZmZXJJbmZvLmdldE1vZHVsZU5hbWUoKVxuICAgIGlmIChuYW1lICE9PSB0aGlzLm5hbWUpIHsgcmV0dXJuIH1cbiAgICBpZiAodGhpcy5idWZmZXJTZXQuaGFzKGJ1ZmZlckluZm8uYnVmZmVyKSkgeyByZXR1cm4gfVxuICAgIHRoaXMuYnVmZmVyU2V0LmFkZChidWZmZXJJbmZvLmJ1ZmZlcilcbiAgICBVdGlsLmRlYnVnKGAke3RoaXMubmFtZX0gYnVmZmVyIGlzIHNldGApXG4gICAgY29uc3QgZGlzcG9zYWJsZXMgPSBuZXcgQ29tcG9zaXRlRGlzcG9zYWJsZSgpXG4gICAgZGlzcG9zYWJsZXMuYWRkKGJ1ZmZlckluZm8uYnVmZmVyLm9uRGlkU2F2ZSgoKSA9PiB7XG4gICAgICBVdGlsLmRlYnVnKGAke3RoaXMubmFtZX0gZGlkLXNhdmUgdHJpZ2dlcmVkYClcbiAgICAgIHRoaXMudXBkYXRlKHRoaXMucm9vdERpcilcbiAgICB9KSlcbiAgICBkaXNwb3NhYmxlcy5hZGQoYnVmZmVySW5mby5idWZmZXIub25EaWREZXN0cm95KCgpID0+IHtcbiAgICAgIGRpc3Bvc2FibGVzLmRpc3Bvc2UoKVxuICAgICAgdGhpcy5idWZmZXJTZXQuZGVsZXRlKGJ1ZmZlckluZm8uYnVmZmVyKVxuICAgICAgdGhpcy5kaXNwb3NhYmxlcy5yZW1vdmUoZGlzcG9zYWJsZXMpXG4gICAgfSkpXG4gICAgdGhpcy5kaXNwb3NhYmxlcy5hZGQoZGlzcG9zYWJsZXMpXG4gIH1cblxuICBwdWJsaWMgc2VsZWN0IChpbXBvcnREZXNjOiBJSW1wb3J0LCBzeW1ib2xUeXBlcz86IFN5bWJvbFR5cGVbXSwgc2tpcFF1YWxpZmllZDogYm9vbGVhbiA9IGZhbHNlKSB7XG4gICAgY2xlYXJUaW1lb3V0KHRoaXMudGltZW91dClcbiAgICB0aGlzLnRpbWVvdXQgPSBzZXRUaW1lb3V0KHRoaXMuZGVzdHJveS5iaW5kKHRoaXMpLCB0aGlzLmludmFsaWRhdGVJbnRlcnZhbClcbiAgICBsZXQgc3ltYm9scyA9IHRoaXMuc3ltYm9sc1xuICAgIGlmIChpbXBvcnREZXNjLmltcG9ydExpc3QpIHtcbiAgICAgIGNvbnN0IGlsID0gaW1wb3J0RGVzYy5pbXBvcnRMaXN0XG4gICAgICBzeW1ib2xzID0gc3ltYm9scy5maWx0ZXIoKHMpID0+IHtcbiAgICAgICAgY29uc3QgaW5JbXBvcnRMaXN0ID0gaWwuaW5jbHVkZXMocy5uYW1lKVxuICAgICAgICBjb25zdCBwYXJlbnRJbkltcG9ydExpc3QgPSBpbC5zb21lKChpKSA9PiAodHlwZW9mIGkgIT09ICdzdHJpbmcnKSAmJiAocy5wYXJlbnQgPT09IGkucGFyZW50KSlcbiAgICAgICAgY29uc3Qgc2hvdWxkU2hvdyA9IGluSW1wb3J0TGlzdCB8fCBwYXJlbnRJbkltcG9ydExpc3RcbiAgICAgICAgcmV0dXJuIGltcG9ydERlc2MuaGlkaW5nICE9PSBzaG91bGRTaG93IC8vIFhPUlxuICAgICAgfSlcbiAgICB9XG4gICAgY29uc3QgcmVzID0gW11cbiAgICBmb3IgKGNvbnN0IHN5bWJvbCBvZiBzeW1ib2xzKSB7XG4gICAgICBpZiAoc3ltYm9sVHlwZXMgJiYgIXN5bWJvbFR5cGVzLmluY2x1ZGVzKHN5bWJvbC5zeW1ib2xUeXBlKSkgeyBjb250aW51ZSB9XG4gICAgICBjb25zdCBzcGVjaWZpYyA9IHtcbiAgICAgICAgbmFtZTogc3ltYm9sLm5hbWUsXG4gICAgICAgIHR5cGVTaWduYXR1cmU6IHN5bWJvbC50eXBlU2lnbmF0dXJlLFxuICAgICAgICBzeW1ib2xUeXBlOiBzeW1ib2wuc3ltYm9sVHlwZSxcbiAgICAgICAgbW9kdWxlOiBpbXBvcnREZXNjXG4gICAgICB9XG4gICAgICBjb25zdCBxbiA9IChuOiBzdHJpbmcpID0+IGAke2ltcG9ydERlc2MuYWxpYXMgfHwgaW1wb3J0RGVzYy5uYW1lfS4ke259YFxuICAgICAgaWYgKCFza2lwUXVhbGlmaWVkKSB7XG4gICAgICAgIHJlcy5wdXNoKHtcbiAgICAgICAgICAuLi5zcGVjaWZpYyxcbiAgICAgICAgICBxcGFyZW50OiBzeW1ib2wucGFyZW50ID8gcW4oc3ltYm9sLnBhcmVudCkgOiB1bmRlZmluZWQsXG4gICAgICAgICAgcW5hbWU6IHFuKHN5bWJvbC5uYW1lKVxuICAgICAgICB9KVxuICAgICAgfVxuICAgICAgaWYgKCEgaW1wb3J0RGVzYy5xdWFsaWZpZWQpIHtcbiAgICAgICAgcmVzLnB1c2goe1xuICAgICAgICAgIC4uLnNwZWNpZmljLFxuICAgICAgICAgIHFwYXJlbnQ6IHN5bWJvbC5wYXJlbnQsXG4gICAgICAgICAgcW5hbWU6IHN5bWJvbC5uYW1lXG4gICAgICAgIH0pXG4gICAgICB9XG4gICAgfVxuICAgIHJldHVybiByZXNcbiAgfVxuXG4gIHByaXZhdGUgYXN5bmMgdXBkYXRlIChyb290RGlyOiBBdG9tVHlwZXMuRGlyZWN0b3J5KSB7XG4gICAgVXRpbC5kZWJ1ZyhgJHt0aGlzLm5hbWV9IHVwZGF0aW5nYClcbiAgICB0aGlzLnN5bWJvbHMgPSBhd2FpdCB0aGlzLnByb2Nlc3MucnVuQnJvd3NlKHJvb3REaXIsIFt0aGlzLm5hbWVdKVxuICAgIFV0aWwuZGVidWcoYCR7dGhpcy5uYW1lfSB1cGRhdGVkYClcbiAgfVxufVxuIl19