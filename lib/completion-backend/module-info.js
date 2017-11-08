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
        this.destroy = () => {
            Util.debug(`${this.name} destroyed`);
            clearTimeout(this.timeout);
            this.emitter.emit('did-destroy', undefined);
            this.disposables.dispose();
        };
        Util.debug(`${this.name} created`);
        this.symbols = [];
        this.disposables = new atom_1.CompositeDisposable();
        this.bufferSet = new WeakSet();
        this.emitter = new atom_1.Emitter();
        this.disposables.add(this.emitter);
        this.updatePromise = this.update(rootDir);
        this.timeout = setTimeout(this.destroy, this.invalidateInterval);
        this.disposables.add(this.process.onDidDestroy(this.destroy));
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
                this.updatePromise = this.update(this.rootDir);
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
        return __awaiter(this, void 0, void 0, function* () {
            yield this.updatePromise;
            clearTimeout(this.timeout);
            this.timeout = setTimeout(this.destroy, this.invalidateInterval);
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
        });
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibW9kdWxlLWluZm8uanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi9zcmMvY29tcGxldGlvbi1iYWNrZW5kL21vZHVsZS1pbmZvLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7Ozs7Ozs7Ozs7QUFBQSwrQkFBNkQ7QUFDN0QsZ0NBQStCO0FBTy9CO0lBV0UsWUFDbUIsSUFBWSxFQUNaLE9BQXVCLEVBQ3ZCLE9BQTRCO1FBRjVCLFNBQUksR0FBSixJQUFJLENBQVE7UUFDWixZQUFPLEdBQVAsT0FBTyxDQUFnQjtRQUN2QixZQUFPLEdBQVAsT0FBTyxDQUFxQjtRQVQ5Qix1QkFBa0IsR0FBRyxFQUFFLEdBQUcsRUFBRSxHQUFHLElBQUksQ0FBQTtRQXNCN0MsWUFBTyxHQUFHLEdBQUcsRUFBRTtZQUNwQixJQUFJLENBQUMsS0FBSyxDQUFDLEdBQUcsSUFBSSxDQUFDLElBQUksWUFBWSxDQUFDLENBQUE7WUFDcEMsWUFBWSxDQUFDLElBQUksQ0FBQyxPQUFPLENBQUMsQ0FBQTtZQUMxQixJQUFJLENBQUMsT0FBTyxDQUFDLElBQUksQ0FBQyxhQUFhLEVBQUUsU0FBUyxDQUFDLENBQUE7WUFDM0MsSUFBSSxDQUFDLFdBQVcsQ0FBQyxPQUFPLEVBQUUsQ0FBQTtRQUM1QixDQUFDLENBQUE7UUFoQkMsSUFBSSxDQUFDLEtBQUssQ0FBQyxHQUFHLElBQUksQ0FBQyxJQUFJLFVBQVUsQ0FBQyxDQUFBO1FBQ2xDLElBQUksQ0FBQyxPQUFPLEdBQUcsRUFBRSxDQUFBO1FBQ2pCLElBQUksQ0FBQyxXQUFXLEdBQUcsSUFBSSwwQkFBbUIsRUFBRSxDQUFBO1FBQzVDLElBQUksQ0FBQyxTQUFTLEdBQUcsSUFBSSxPQUFPLEVBQUUsQ0FBQTtRQUM5QixJQUFJLENBQUMsT0FBTyxHQUFHLElBQUksY0FBTyxFQUFFLENBQUE7UUFDNUIsSUFBSSxDQUFDLFdBQVcsQ0FBQyxHQUFHLENBQUMsSUFBSSxDQUFDLE9BQU8sQ0FBQyxDQUFBO1FBQ2xDLElBQUksQ0FB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SyxFQUFFLEVBQUUsQ0FBQyxNQUFNLENBQUMsSUFBSSxDQUFDLElBQ3RCLENBQUE7Z0JBQ0osQ0FBQztnQkFDRCxFQUFFLENBQUMsQ0FBQyxDQUFDLFVBQVUsQ0FBQyxTQUFTLENBQUMsQ0FBQyxDQUFDO29CQUMxQixHQUFHLENBQUMsSUFBSSxtQkFDSCxRQUFRLElBQ1gsT0FBTyxFQUFFLE1BQU0sQ0FBQyxNQUFNLEVBQ3RCLEtBQUssRUFBRSxNQUFNLENBQUMsSUFBSSxJQUNsQixDQUFBO2dCQUNKLENBQUM7WUFDSCxDQUFDO1lBQ0QsTUFBTSxDQUFDLEdBQUcsQ0FBQTtRQUNaLENBQUM7S0FBQTtJQUVhLE1BQU0sQ0FBQyxPQUE0Qjs7WUFDL0MsSUFBSSxDQUFDLEtBQUssQ0FBQyxHQUFHLElBQUksQ0FBQyxJQUFJLFdBQVcsQ0FBQyxDQUFBO1lBQ25DLElBQUksQ0FBQyxPQUFPLEdBQUcsTUFBTSxJQUFJLENBQUMsT0FBTyxDQUFDLFNBQVMsQ0FBQyxPQUFPLEVBQUUsQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQTtZQUNqRSxJQUFJLENBQUMsS0FBSyxDQUFDLEdBQUcsSUFBSSxDQUFDLElBQUksVUFBVSxDQUFDLENBQUE7UUFDcEMsQ0FBQztLQUFBO0NBQ0Y7QUF4R0QsZ0NBd0dDIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IHsgQ29tcG9zaXRlRGlzcG9zYWJsZSwgVEVtaXR0ZXIsIEVtaXR0ZXIgfSBmcm9tICdhdG9tJ1xuaW1wb3J0ICogYXMgVXRpbCBmcm9tICcuLi91dGlsJ1xuaW1wb3J0IHsgR2hjTW9kaVByb2Nlc3MgfSBmcm9tICcuLi9naGMtbW9kJ1xuaW1wb3J0IHsgQnVmZmVySW5mbywgSUltcG9ydCB9IGZyb20gJy4vYnVmZmVyLWluZm8nXG5pbXBvcnQgeyBTeW1ib2xEZXNjIH0gZnJvbSAnLi4vZ2hjLW1vZCdcblxuaW1wb3J0IFN5bWJvbFR5cGUgPSBVUEkuQ29tcGxldGlvbkJhY2tlbmQuU3ltYm9sVHlwZVxuXG5leHBvcnQgY2xhc3MgTW9kdWxlSW5mbyB7XG4gIHByaXZhdGUgcmVhZG9ubHkgZGlzcG9zYWJsZXM6IENvbXBvc2l0ZURpc3Bvc2FibGVcbiAgcHJpdmF0ZSByZWFkb25seSBlbWl0dGVyOiBURW1pdHRlcjx7XG4gICAgJ2RpZC1kZXN0cm95JzogdW5kZWZpbmVkXG4gIH0+XG4gIHByaXZhdGUgcmVhZG9ubHkgaW52YWxpZGF0ZUludGVydmFsID0gMzAgKiA2MCAqIDEwMDAgLy8gaWYgbW9kdWxlIHVudXNlZCBmb3IgMzAgbWludXRlcywgcmVtb3ZlIGl0XG4gIHByaXZhdGUgcmVhZG9ubHkgYnVmZmVyU2V0OiBXZWFrU2V0PEF0b21UeXBlcy5UZXh0QnVmZmVyPlxuICBwcml2YXRlIHRpbWVvdXQ6IE5vZGVKUy5UaW1lclxuICBwcml2YXRlIHVwZGF0ZVByb21pc2U6IFByb21pc2U8dm9pZD5cbiAgcHJpdmF0ZSBzeW1ib2xzOiBTeW1ib2xEZXNjW10gLy8gbW9kdWxlIHN5bWJvbHNcblxuICBjb25zdHJ1Y3RvcihcbiAgICBwcml2YXRlIHJlYWRvbmx5IG5hbWU6IHN0cmluZyxcbiAgICBwcml2YXRlIHJlYWRvbmx5IHByb2Nlc3M6IEdoY01vZGlQcm9jZXNzLFxuICAgIHByaXZhdGUgcmVhZG9ubHkgcm9vdERpcjogQXRvbVR5cGVzLkRpcmVjdG9yeSxcbiAgKSB7XG4gICAgVXRpbC5kZWJ1ZyhgJHt0aGlzLm5hbWV9IGNyZWF0ZWRgKVxuICAgIHRoaXMuc3ltYm9scyA9IFtdXG4gICAgdGhpcy5kaXNwb3NhYmxlcyA9IG5ldyBDb21wb3NpdGVEaXNwb3NhYmxlKClcbiAgICB0aGlzLmJ1ZmZlclNldCA9IG5ldyBXZWFrU2V0KClcbiAgICB0aGlzLmVtaXR0ZXIgPSBuZXcgRW1pdHRlcigpXG4gICAgdGhpcy5kaXNwb3NhYmxlcy5hZGQodGhpcy5lbWl0dGVyKVxuICAgIHRoaXMudXBkYXRlUHJvbWlzZSA9IHRoaXMudXBkYXRlKHJvb3REaXIpXG4gICAgdGhpcy50aW1lb3V0ID0gc2V0VGltZW91dCh0aGlzLmRlc3Ryb3ksIHRoaXMuaW52YWxpZGF0ZUludGVydmFsKVxuICAgIHRoaXMuZGlzcG9zYWJsZXMuYWRkKHRoaXMucHJvY2Vzcy5vbkRpZERlc3Ryb3kodGhpcy5kZXN0cm95KSlcbiAgfVxuXG4gIHB1YmxpYyBkZXN0cm95ID0gKCkgPT4ge1xuICAgIFV0aWwuZGVidWcoYCR7dGhpcy5uYW1lfSBkZXN0cm95ZWRgKVxuICAgIGNsZWFyVGltZW91dCh0aGlzLnRpbWVvdXQpXG4gICAgdGhpcy5lbWl0dGVyLmVtaXQoJ2RpZC1kZXN0cm95JywgdW5kZWZpbmVkKVxuICAgIHRoaXMuZGlzcG9zYWJsZXMuZGlzcG9zZSgpXG4gIH1cblxuICBwdWJsaWMgb25EaWREZXN0cm95KGNhbGxiYWNrOiAoKSA9PiB2b2lkKSB7XG4gICAgcmV0dXJuIHRoaXMuZW1pdHRlci5vbignZGlkLWRlc3Ryb3knLCBjYWxsYmFjaylcbiAgfVxuXG4gIHB1YmxpYyBhc3luYyBzZXRCdWZmZXIoYnVmZmVySW5mbzogQnVmZmVySW5mbykge1xuICAgIGNvbnN0IG5hbWUgPSBhd2FpdCBidWZmZXJJbmZvLmdldE1vZHVsZU5hbWUoKVxuICAgIGlmIChuYW1lICE9PSB0aGlzLm5hbWUpIHsgcmV0dXJuIH1cbiAgICBpZiAodGhpcy5idWZmZXJTZXQuaGFzKGJ1ZmZlckluZm8uYnVmZmVyKSkgeyByZXR1cm4gfVxuICAgIHRoaXMuYnVmZmVyU2V0LmFkZChidWZmZXJJbmZvLmJ1ZmZlcilcbiAgICBVdGlsLmRlYnVnKGAke3RoaXMubmFtZX0gYnVmZmVyIGlzIHNldGApXG4gICAgY29uc3QgZGlzcG9zYWJsZXMgPSBuZXcgQ29tcG9zaXRlRGlzcG9zYWJsZSgpXG4gICAgZGlzcG9zYWJsZXMuYWRkKGJ1ZmZlckluZm8uYnVmZmVyLm9uRGlkU2F2ZSgoKSA9PiB7XG4gICAgICBVdGlsLmRlYnVnKGAke3RoaXMubmFtZX0gZGlkLXNhdmUgdHJpZ2dlcmVkYClcbiAgICAgIHRoaXMudXBkYXRlUHJvbWlzZSA9IHRoaXMudXBkYXRlKHRoaXMucm9vdERpcilcbiAgICB9KSlcbiAgICBkaXNwb3NhYmxlcy5hZGQoYnVmZmVySW5mby5idWZmZXIub25EaWREZXN0cm95KCgpID0+IHtcbiAgICAgIGRpc3Bvc2FibGVzLmRpc3Bvc2UoKVxuICAgICAgdGhpcy5idWZmZXJTZXQuZGVsZXRlKGJ1ZmZlckluZm8uYnVmZmVyKVxuICAgICAgdGhpcy5kaXNwb3NhYmxlcy5yZW1vdmUoZGlzcG9zYWJsZXMpXG4gICAgfSkpXG4gICAgdGhpcy5kaXNwb3NhYmxlcy5hZGQoZGlzcG9zYWJsZXMpXG4gIH1cblxuICBwdWJsaWMgYXN5bmMgc2VsZWN0KGltcG9ydERlc2M6IElJbXBvcnQsIHN5bWJvbFR5cGVzPzogU3ltYm9sVHlwZVtdLCBza2lwUXVhbGlmaWVkOiBib29sZWFuID0gZmFsc2UpIHtcbiAgICBhd2FpdCB0aGlzLnVwZGF0ZVByb21pc2VcbiAgICBjbGVhclRpbWVvdXQodGhpcy50aW1lb3V0KVxuICAgIHRoaXMudGltZW91dCA9IHNldFRpbWVvdXQodGhpcy5kZXN0cm95LCB0aGlzLmludmFsaWRhdGVJbnRlcnZhbClcbiAgICBsZXQgc3ltYm9scyA9IHRoaXMuc3ltYm9sc1xuICAgIGlmIChpbXBvcnREZXNjLmltcG9ydExpc3QpIHtcbiAgICAgIGNvbnN0IGlsID0gaW1wb3J0RGVzYy5pbXBvcnRMaXN0XG4gICAgICBzeW1ib2xzID0gc3ltYm9scy5maWx0ZXIoKHMpID0+IHtcbiAgICAgICAgY29uc3QgaW5JbXBvcnRMaXN0ID0gaWwuaW5jbHVkZXMocy5uYW1lKVxuICAgICAgICBjb25zdCBwYXJlbnRJbkltcG9ydExpc3QgPSBpbC5zb21lKChpKSA9PiAodHlwZW9mIGkgIT09ICdzdHJpbmcnKSAmJiAocy5wYXJlbnQgPT09IGkucGFyZW50KSlcbiAgICAgICAgY29uc3Qgc2hvdWxkU2hvdyA9IGluSW1wb3J0TGlzdCB8fCBwYXJlbnRJbkltcG9ydExpc3RcbiAgICAgICAgcmV0dXJuIGltcG9ydERlc2MuaGlkaW5nICE9PSBzaG91bGRTaG93IC8vIFhPUlxuICAgICAgfSlcbiAgICB9XG4gICAgY29uc3QgcmVzID0gW11cbiAgICBmb3IgKGNvbnN0IHN5bWJvbCBvZiBzeW1ib2xzKSB7XG4gICAgICBpZiAoc3ltYm9sVHlwZXMgJiYgIXN5bWJvbFR5cGVzLmluY2x1ZGVzKHN5bWJvbC5zeW1ib2xUeXBlKSkgeyBjb250aW51ZSB9XG4gICAgICBjb25zdCBzcGVjaWZpYyA9IHtcbiAgICAgICAgbmFtZTogc3ltYm9sLm5hbWUsXG4gICAgICAgIHR5cGVTaWduYXR1cmU6IHN5bWJvbC50eXBlU2lnbmF0dXJlLFxuICAgICAgICBzeW1ib2xUeXBlOiBzeW1ib2wuc3ltYm9sVHlwZSxcbiAgICAgICAgbW9kdWxlOiBpbXBvcnREZXNjLFxuICAgICAgfVxuICAgICAgY29uc3QgcW4gPSAobjogc3RyaW5nKSA9PiBgJHtpbXBvcnREZXNjLmFsaWFzIHx8IGltcG9ydERlc2MubmFtZX0uJHtufWBcbiAgICAgIGlmICghc2tpcFF1YWxpZmllZCkge1xuICAgICAgICByZXMucHVzaCh7XG4gICAgICAgICAgLi4uc3BlY2lmaWMsXG4gICAgICAgICAgcXBhcmVudDogc3ltYm9sLnBhcmVudCA/IHFuKHN5bWJvbC5wYXJlbnQpIDogdW5kZWZpbmVkLFxuICAgICAgICAgIHFuYW1lOiBxbihzeW1ib2wubmFtZSksXG4gICAgICAgIH0pXG4gICAgICB9XG4gICAgICBpZiAoIWltcG9ydERlc2MucXVhbGlmaWVkKSB7XG4gICAgICAgIHJlcy5wdXNoKHtcbiAgICAgICAgICAuLi5zcGVjaWZpYyxcbiAgICAgICAgICBxcGFyZW50OiBzeW1ib2wucGFyZW50LFxuICAgICAgICAgIHFuYW1lOiBzeW1ib2wubmFtZSxcbiAgICAgICAgfSlcbiAgICAgIH1cbiAgICB9XG4gICAgcmV0dXJuIHJlc1xuICB9XG5cbiAgcHJpdmF0ZSBhc3luYyB1cGRhdGUocm9vdERpcjogQXRvbVR5cGVzLkRpcmVjdG9yeSkge1xuICAgIFV0aWwuZGVidWcoYCR7dGhpcy5uYW1lfSB1cGRhdGluZ2ApXG4gICAgdGhpcy5zeW1ib2xzID0gYXdhaXQgdGhpcy5wcm9jZXNzLnJ1bkJyb3dzZShyb290RGlyLCBbdGhpcy5uYW1lXSlcbiAgICBVdGlsLmRlYnVnKGAke3RoaXMubmFtZX0gdXBkYXRlZGApXG4gIH1cbn1cbiJdfQ==