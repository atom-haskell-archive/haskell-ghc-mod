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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibW9kdWxlLWluZm8uanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi9zcmMvY29tcGxldGlvbi1iYWNrZW5kL21vZHVsZS1pbmZvLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7Ozs7Ozs7Ozs7QUFBQSwrQkFBNkQ7QUFDN0QsZ0NBQStCO0FBTy9CO0lBV0UsWUFBcUIsSUFBWSxFQUFVLE9BQXVCLEVBQVUsT0FBNEI7UUFBbkYsU0FBSSxHQUFKLElBQUksQ0FBUTtRQUFVLFlBQU8sR0FBUCxPQUFPLENBQWdCO1FBQVUsWUFBTyxHQUFQLE9BQU8sQ0FBcUI7UUFIaEcsdUJBQWtCLEdBQUcsRUFBRSxHQUFHLEVBQUUsR0FBRyxJQUFJLENBQUE7UUFJekMsSUFBSSxDQUFDLEtBQUssQ0FBQyxHQUFHLElBQUksQ0FBQyxJQUFJLFVBQVUsQ0FBQyxDQUFBO1FBQ2xDLElBQUksQ0FBQyxPQUFPLEdBQUcsRUFBRSxDQUFBO1FBQ2pCLElBQUksQ0FBQyxXQUFXLEdBQUcsSUFBSSwwQkFBbUIsRUFBRSxDQUFBO1FBQzVDLElBQUksQ0FBQyxTQUFTLEdBQUcsSUFBSSxPQUFPLEVBQUUsQ0FBQTtRQUM5QixJQUFJLENBQUMsT0FBTyxHQUFHLElBQUksY0FBTyxFQUFFLENBQUE7UUFDNUIsSUFBSSxDQUFDLFdBQVcsQ0FBQyxHQUFHLENBQUMsSUFBSSxDQUFDLE9BQU8sQ0FBQyxDQUFBO1FBQ2xDLElBQUksQ0FBQyxvQkFBb0IsR0FBRyxJQUFJLENBQUMsTUFBTSxDQUFDLE9BQU8sQ0FBQyxDQUFBO1FBQ2hELElBQUksQ0FBQyxPQUFPLEdBQUcsVUFBVSxDQUFDLElBQUksQ0FBQyxPQUFPLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxFQUFFLElBQUksQ0FBQyxrQkFBa0IsQ0FBQyxDQUFBO1FBQzNFLElBQUksQ0FBQyxXQUFXLENBQUMsR0FBRyxDQUFDLElBQUksQ0FBQyxPQUFPLENBQUMsWUFBWSxDQUFDLElBQUksQ0FBQyxPQUFPLENBQUMsSUFBSSxD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QUFFLFVBQVUsQ0FBQyxTQUFTLENBQUMsQ0FBQyxDQUFDO2dCQUMzQixHQUFHLENBQUMsSUFBSSxtQkFDSCxRQUFRLElBQ1gsT0FBTyxFQUFFLE1BQU0sQ0FBQyxNQUFNLEVBQ3RCLEtBQUssRUFBRSxNQUFNLENBQUMsSUFBSSxJQUNsQixDQUFBO1lBQ0osQ0FBQztRQUNILENBQUM7UUFDRCxNQUFNLENBQUMsR0FBRyxDQUFBO0lBQ1osQ0FBQztJQUVhLE1BQU0sQ0FBRSxPQUE0Qjs7WUFDaEQsSUFBSSxDQUFDLEtBQUssQ0FBQyxHQUFHLElBQUksQ0FBQyxJQUFJLFdBQVcsQ0FBQyxDQUFBO1lBQ25DLElBQUksQ0FBQyxPQUFPLEdBQUcsTUFBTSxJQUFJLENBQUMsT0FBTyxDQUFDLFNBQVMsQ0FBQyxPQUFPLEVBQUUsQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQTtZQUNqRSxJQUFJLENBQUMsS0FBSyxDQUFDLEdBQUcsSUFBSSxDQUFDLElBQUksVUFBVSxDQUFDLENBQUE7UUFDcEMsQ0FBQztLQUFBO0NBQ0Y7QUFuR0QsZ0NBbUdDIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IHsgQ29tcG9zaXRlRGlzcG9zYWJsZSwgVEVtaXR0ZXIsIEVtaXR0ZXIgfSBmcm9tICdhdG9tJ1xuaW1wb3J0ICogYXMgVXRpbCBmcm9tICcuLi91dGlsJ1xuaW1wb3J0IHtHaGNNb2RpUHJvY2Vzc30gZnJvbSAnLi4vZ2hjLW1vZCdcbmltcG9ydCB7QnVmZmVySW5mbywgSUltcG9ydH0gZnJvbSAnLi9idWZmZXItaW5mbydcbmltcG9ydCB7U3ltYm9sRGVzY30gZnJvbSAnLi4vZ2hjLW1vZCdcblxuaW1wb3J0IFN5bWJvbFR5cGUgPSBVUEkuQ29tcGxldGlvbkJhY2tlbmQuU3ltYm9sVHlwZVxuXG5leHBvcnQgY2xhc3MgTW9kdWxlSW5mbyB7XG4gIHB1YmxpYyByZWFkb25seSBpbml0aWFsVXBkYXRlUHJvbWlzZTogUHJvbWlzZTx2b2lkPlxuICBwcml2YXRlIHN5bWJvbHM6IFN5bWJvbERlc2NbXSAvLyBtb2R1bGUgc3ltYm9sc1xuICBwcml2YXRlIGRpc3Bvc2FibGVzOiBDb21wb3NpdGVEaXNwb3NhYmxlXG4gIHByaXZhdGUgZW1pdHRlcjogVEVtaXR0ZXI8e1xuICAgICdkaWQtZGVzdHJveSc6IHVuZGVmaW5lZFxuICB9PlxuICBwcml2YXRlIHRpbWVvdXQ6IE5vZGVKUy5UaW1lclxuICBwcml2YXRlIGludmFsaWRhdGVJbnRlcnZhbCA9IDMwICogNjAgKiAxMDAwIC8vIGlmIG1vZHVsZSB1bnVzZWQgZm9yIDMwIG1pbnV0ZXMsIHJlbW92ZSBpdFxuICBwcml2YXRlIGJ1ZmZlclNldDogV2Vha1NldDxBdG9tVHlwZXMuVGV4dEJ1ZmZlcj5cblxuICBjb25zdHJ1Y3RvciAocHJpdmF0ZSBuYW1lOiBzdHJpbmcsIHByaXZhdGUgcHJvY2VzczogR2hjTW9kaVByb2Nlc3MsIHByaXZhdGUgcm9vdERpcjogQXRvbVR5cGVzLkRpcmVjdG9yeSkge1xuICAgIFV0aWwuZGVidWcoYCR7dGhpcy5uYW1lfSBjcmVhdGVkYClcbiAgICB0aGlzLnN5bWJvbHMgPSBbXVxuICAgIHRoaXMuZGlzcG9zYWJsZXMgPSBuZXcgQ29tcG9zaXRlRGlzcG9zYWJsZSgpXG4gICAgdGhpcy5idWZmZXJTZXQgPSBuZXcgV2Vha1NldCgpXG4gICAgdGhpcy5lbWl0dGVyID0gbmV3IEVtaXR0ZXIoKVxuICAgIHRoaXMuZGlzcG9zYWJsZXMuYWRkKHRoaXMuZW1pdHRlcilcbiAgICB0aGlzLmluaXRpYWxVcGRhdGVQcm9taXNlID0gdGhpcy51cGRhdGUocm9vdERpcilcbiAgICB0aGlzLnRpbWVvdXQgPSBzZXRUaW1lb3V0KHRoaXMuZGVzdHJveS5iaW5kKHRoaXMpLCB0aGlzLmludmFsaWRhdGVJbnRlcnZhbClcbiAgICB0aGlzLmRpc3Bvc2FibGVzLmFkZCh0aGlzLnByb2Nlc3Mub25EaWREZXN0cm95KHRoaXMuZGVzdHJveS5iaW5kKHRoaXMpKSlcbiAgfVxuXG4gIHB1YmxpYyBkZXN0cm95ICgpIHtcbiAgICBVdGlsLmRlYnVnKGAke3RoaXMubmFtZX0gZGVzdHJveWVkYClcbiAgICBjbGVhclRpbWVvdXQodGhpcy50aW1lb3V0KVxuICAgIHRoaXMuZW1pdHRlci5lbWl0KCdkaWQtZGVzdHJveScsIHVuZGVmaW5lZClcbiAgICB0aGlzLmRpc3Bvc2FibGVzLmRpc3Bvc2UoKVxuICB9XG5cbiAgcHVibGljIG9uRGlkRGVzdHJveSAoY2FsbGJhY2s6ICgpID0+IHZvaWQpIHtcbiAgICByZXR1cm4gdGhpcy5lbWl0dGVyLm9uKCdkaWQtZGVzdHJveScsIGNhbGxiYWNrKVxuICB9XG5cbiAgcHVibGljIGFzeW5jIHNldEJ1ZmZlciAoYnVmZmVySW5mbzogQnVmZmVySW5mbykge1xuICAgIGNvbnN0IG5hbWUgPSBhd2FpdCBidWZmZXJJbmZvLmdldE1vZHVsZU5hbWUoKVxuICAgIGlmIChuYW1lICE9PSB0aGlzLm5hbWUpIHsgcmV0dXJuIH1cbiAgICBpZiAodGhpcy5idWZmZXJTZXQuaGFzKGJ1ZmZlckluZm8uYnVmZmVyKSkgeyByZXR1cm4gfVxuICAgIHRoaXMuYnVmZmVyU2V0LmFkZChidWZmZXJJbmZvLmJ1ZmZlcilcbiAgICBVdGlsLmRlYnVnKGAke3RoaXMubmFtZX0gYnVmZmVyIGlzIHNldGApXG4gICAgY29uc3QgZGlzcG9zYWJsZXMgPSBuZXcgQ29tcG9zaXRlRGlzcG9zYWJsZSgpXG4gICAgZGlzcG9zYWJsZXMuYWRkKGJ1ZmZlckluZm8uYnVmZmVyLm9uRGlkU2F2ZSgoKSA9PiB7XG4gICAgICBVdGlsLmRlYnVnKGAke3RoaXMubmFtZX0gZGlkLXNhdmUgdHJpZ2dlcmVkYClcbiAgICAgIHRoaXMudXBkYXRlKHRoaXMucm9vdERpcilcbiAgICB9KSlcbiAgICBkaXNwb3NhYmxlcy5hZGQoYnVmZmVySW5mby5idWZmZXIub25EaWREZXN0cm95KCgpID0+IHtcbiAgICAgIGRpc3Bvc2FibGVzLmRpc3Bvc2UoKVxuICAgICAgdGhpcy5idWZmZXJTZXQuZGVsZXRlKGJ1ZmZlckluZm8uYnVmZmVyKVxuICAgICAgdGhpcy5kaXNwb3NhYmxlcy5yZW1vdmUoZGlzcG9zYWJsZXMpXG4gICAgfSkpXG4gICAgdGhpcy5kaXNwb3NhYmxlcy5hZGQoZGlzcG9zYWJsZXMpXG4gIH1cblxuICBwdWJsaWMgc2VsZWN0IChpbXBvcnREZXNjOiBJSW1wb3J0LCBzeW1ib2xUeXBlcz86IFN5bWJvbFR5cGVbXSwgc2tpcFF1YWxpZmllZDogYm9vbGVhbiA9IGZhbHNlKSB7XG4gICAgY2xlYXJUaW1lb3V0KHRoaXMudGltZW91dClcbiAgICB0aGlzLnRpbWVvdXQgPSBzZXRUaW1lb3V0KHRoaXMuZGVzdHJveS5iaW5kKHRoaXMpLCB0aGlzLmludmFsaWRhdGVJbnRlcnZhbClcbiAgICBsZXQgc3ltYm9scyA9IHRoaXMuc3ltYm9sc1xuICAgIGlmIChpbXBvcnREZXNjLmltcG9ydExpc3QpIHtcbiAgICAgIGNvbnN0IGlsID0gaW1wb3J0RGVzYy5pbXBvcnRMaXN0XG4gICAgICBzeW1ib2xzID0gc3ltYm9scy5maWx0ZXIoKHMpID0+IHtcbiAgICAgICAgY29uc3QgaW5JbXBvcnRMaXN0ID0gaWwuaW5jbHVkZXMocy5uYW1lKVxuICAgICAgICBjb25zdCBwYXJlbnRJbkltcG9ydExpc3QgPSBpbC5zb21lKChpKSA9PiAodHlwZW9mIGkgIT09ICdzdHJpbmcnKSAmJiAocy5wYXJlbnQgPT09IGkucGFyZW50KSlcbiAgICAgICAgY29uc3Qgc2hvdWxkU2hvdyA9IGluSW1wb3J0TGlzdCB8fCBwYXJlbnRJbkltcG9ydExpc3RcbiAgICAgICAgcmV0dXJuIGltcG9ydERlc2MuaGlkaW5nICE9PSBzaG91bGRTaG93IC8vIFhPUlxuICAgICAgfSlcbiAgICB9XG4gICAgY29uc3QgcmVzID0gW11cbiAgICBmb3IgKGNvbnN0IHN5bWJvbCBvZiBzeW1ib2xzKSB7XG4gICAgICBpZiAoc3ltYm9sVHlwZXMgJiYgIXN5bWJvbFR5cGVzLmluY2x1ZGVzKHN5bWJvbC5zeW1ib2xUeXBlKSkgeyBjb250aW51ZSB9XG4gICAgICBjb25zdCBzcGVjaWZpYyA9IHtcbiAgICAgICAgbmFtZTogc3ltYm9sLm5hbWUsXG4gICAgICAgIHR5cGVTaWduYXR1cmU6IHN5bWJvbC50eXBlU2lnbmF0dXJlLFxuICAgICAgICBzeW1ib2xUeXBlOiBzeW1ib2wuc3ltYm9sVHlwZSxcbiAgICAgICAgbW9kdWxlOiBpbXBvcnREZXNjXG4gICAgICB9XG4gICAgICBjb25zdCBxbiA9IChuOiBzdHJpbmcpID0+IGAke2ltcG9ydERlc2MuYWxpYXMgfHwgaW1wb3J0RGVzYy5uYW1lfS4ke259YFxuICAgICAgaWYgKCFza2lwUXVhbGlmaWVkKSB7XG4gICAgICAgIHJlcy5wdXNoKHtcbiAgICAgICAgICAuLi5zcGVjaWZpYyxcbiAgICAgICAgICBxcGFyZW50OiBzeW1ib2wucGFyZW50ID8gcW4oc3ltYm9sLnBhcmVudCkgOiB1bmRlZmluZWQsXG4gICAgICAgICAgcW5hbWU6IHFuKHN5bWJvbC5uYW1lKVxuICAgICAgICB9KVxuICAgICAgfVxuICAgICAgaWYgKCEgaW1wb3J0RGVzYy5xdWFsaWZpZWQpIHtcbiAgICAgICAgcmVzLnB1c2goe1xuICAgICAgICAgIC4uLnNwZWNpZmljLFxuICAgICAgICAgIHFwYXJlbnQ6IHN5bWJvbC5wYXJlbnQsXG4gICAgICAgICAgcW5hbWU6IHN5bWJvbC5uYW1lXG4gICAgICAgIH0pXG4gICAgICB9XG4gICAgfVxuICAgIHJldHVybiByZXNcbiAgfVxuXG4gIHByaXZhdGUgYXN5bmMgdXBkYXRlIChyb290RGlyOiBBdG9tVHlwZXMuRGlyZWN0b3J5KSB7XG4gICAgVXRpbC5kZWJ1ZyhgJHt0aGlzLm5hbWV9IHVwZGF0aW5nYClcbiAgICB0aGlzLnN5bWJvbHMgPSBhd2FpdCB0aGlzLnByb2Nlc3MucnVuQnJvd3NlKHJvb3REaXIsIFt0aGlzLm5hbWVdKVxuICAgIFV0aWwuZGVidWcoYCR7dGhpcy5uYW1lfSB1cGRhdGVkYClcbiAgfVxufVxuIl19