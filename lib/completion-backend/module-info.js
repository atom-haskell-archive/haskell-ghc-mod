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
        this.initialUpdatePromise = this.update(rootDir);
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibW9kdWxlLWluZm8uanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi9zcmMvY29tcGxldGlvbi1iYWNrZW5kL21vZHVsZS1pbmZvLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7Ozs7Ozs7Ozs7QUFBQSwrQkFBNkQ7QUFDN0QsZ0NBQStCO0FBTy9CO0lBV0UsWUFBb0IsSUFBWSxFQUFVLE9BQXVCLEVBQVUsT0FBNEI7UUFBbkYsU0FBSSxHQUFKLElBQUksQ0FBUTtRQUFVLFlBQU8sR0FBUCxPQUFPLENBQWdCO1FBQVUsWUFBTyxHQUFQLE9BQU8sQ0FBcUI7UUFIL0YsdUJBQWtCLEdBQUcsRUFBRSxHQUFHLEVBQUUsR0FBRyxJQUFJLENBQUE7UUFlcEMsWUFBTyxHQUFHLEdBQUcsRUFBRTtZQUNwQixJQUFJLENBQUMsS0FBSyxDQUFDLEdBQUcsSUFBSSxDQUFDLElBQUksWUFBWSxDQUFDLENBQUE7WUFDcEMsWUFBWSxDQUFDLElBQUksQ0FBQyxPQUFPLENBQUMsQ0FBQTtZQUMxQixJQUFJLENBQUMsT0FBTyxDQUFDLElBQUksQ0FBQyxhQUFhLEVBQUUsU0FBUyxDQUFDLENBQUE7WUFDM0MsSUFBSSxDQUFDLFdBQVcsQ0FBQyxPQUFPLEVBQUUsQ0FBQTtRQUM1QixDQUFDLENBQUE7UUFoQkMsSUFBSSxDQUFDLEtBQUssQ0FBQyxHQUFHLElBQUksQ0FBQyxJQUFJLFVBQVUsQ0FBQyxDQUFBO1FBQ2xDLElBQUksQ0FBQyxPQUFPLEdBQUcsRUFBRSxDQUFBO1FBQ2pCLElBQUksQ0FBQyxXQUFXLEdBQUcsSUFBSSwwQkFBbUIsRUFBRSxDQUFBO1FBQzVDLElBQUksQ0FBQyxTQUFTLEdBQUcsSUFBSSxPQUFPLEVBQUUsQ0FBQTtRQUM5QixJQUFJLENBQUMsT0FBTyxHQUFHLElBQUksY0FBTyxFQUFFLENBQUE7UUFDNUIsSUFBSSxDQUFDLFdBQVcsQ0FBQyxHQUFHLENBQUMsSUFBSSxDQUFDLE9BQU8sQ0FBQyxDQUFBO1FBQ2xDLElBQUksQ0FBQyxv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LEVBQUUsQ0FBQyxDQUFDLENBQUMsVUFBVSxDQUFDLFNBQVMsQ0FBQyxDQUFDLENBQUM7Z0JBQzFCLEdBQUcsQ0FBQyxJQUFJLG1CQUNILFFBQVEsSUFDWCxPQUFPLEVBQUUsTUFBTSxDQUFDLE1BQU0sRUFDdEIsS0FBSyxFQUFFLE1BQU0sQ0FBQyxJQUFJLElBQ2xCLENBQUE7WUFDSixDQUFDO1FBQ0gsQ0FBQztRQUNELE1BQU0sQ0FBQyxHQUFHLENBQUE7SUFDWixDQUFDO0lBRWEsTUFBTSxDQUFDLE9BQTRCOztZQUMvQyxJQUFJLENBQUMsS0FBSyxDQUFDLEdBQUcsSUFBSSxDQUFDLElBQUksV0FBVyxDQUFDLENBQUE7WUFDbkMsSUFBSSxDQUFDLE9BQU8sR0FBRyxNQUFNLElBQUksQ0FBQyxPQUFPLENBQUMsU0FBUyxDQUFDLE9BQU8sRUFBRSxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFBO1lBQ2pFLElBQUksQ0FBQyxLQUFLLENBQUMsR0FBRyxJQUFJLENBQUMsSUFBSSxVQUFVLENBQUMsQ0FBQTtRQUNwQyxDQUFDO0tBQUE7Q0FDRjtBQW5HRCxnQ0FtR0MiLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgeyBDb21wb3NpdGVEaXNwb3NhYmxlLCBURW1pdHRlciwgRW1pdHRlciB9IGZyb20gJ2F0b20nXG5pbXBvcnQgKiBhcyBVdGlsIGZyb20gJy4uL3V0aWwnXG5pbXBvcnQgeyBHaGNNb2RpUHJvY2VzcyB9IGZyb20gJy4uL2doYy1tb2QnXG5pbXBvcnQgeyBCdWZmZXJJbmZvLCBJSW1wb3J0IH0gZnJvbSAnLi9idWZmZXItaW5mbydcbmltcG9ydCB7IFN5bWJvbERlc2MgfSBmcm9tICcuLi9naGMtbW9kJ1xuXG5pbXBvcnQgU3ltYm9sVHlwZSA9IFVQSS5Db21wbGV0aW9uQmFja2VuZC5TeW1ib2xUeXBlXG5cbmV4cG9ydCBjbGFzcyBNb2R1bGVJbmZvIHtcbiAgcHVibGljIHJlYWRvbmx5IGluaXRpYWxVcGRhdGVQcm9taXNlOiBQcm9taXNlPHZvaWQ+XG4gIHByaXZhdGUgc3ltYm9sczogU3ltYm9sRGVzY1tdIC8vIG1vZHVsZSBzeW1ib2xzXG4gIHByaXZhdGUgZGlzcG9zYWJsZXM6IENvbXBvc2l0ZURpc3Bvc2FibGVcbiAgcHJpdmF0ZSBlbWl0dGVyOiBURW1pdHRlcjx7XG4gICAgJ2RpZC1kZXN0cm95JzogdW5kZWZpbmVkXG4gIH0+XG4gIHByaXZhdGUgdGltZW91dDogTm9kZUpTLlRpbWVyXG4gIHByaXZhdGUgaW52YWxpZGF0ZUludGVydmFsID0gMzAgKiA2MCAqIDEwMDAgLy8gaWYgbW9kdWxlIHVudXNlZCBmb3IgMzAgbWludXRlcywgcmVtb3ZlIGl0XG4gIHByaXZhdGUgYnVmZmVyU2V0OiBXZWFrU2V0PEF0b21UeXBlcy5UZXh0QnVmZmVyPlxuXG4gIGNvbnN0cnVjdG9yKHByaXZhdGUgbmFtZTogc3RyaW5nLCBwcml2YXRlIHByb2Nlc3M6IEdoY01vZGlQcm9jZXNzLCBwcml2YXRlIHJvb3REaXI6IEF0b21UeXBlcy5EaXJlY3RvcnkpIHtcbiAgICBVdGlsLmRlYnVnKGAke3RoaXMubmFtZX0gY3JlYXRlZGApXG4gICAgdGhpcy5zeW1ib2xzID0gW11cbiAgICB0aGlzLmRpc3Bvc2FibGVzID0gbmV3IENvbXBvc2l0ZURpc3Bvc2FibGUoKVxuICAgIHRoaXMuYnVmZmVyU2V0ID0gbmV3IFdlYWtTZXQoKVxuICAgIHRoaXMuZW1pdHRlciA9IG5ldyBFbWl0dGVyKClcbiAgICB0aGlzLmRpc3Bvc2FibGVzLmFkZCh0aGlzLmVtaXR0ZXIpXG4gICAgdGhpcy5pbml0aWFsVXBkYXRlUHJvbWlzZSA9IHRoaXMudXBkYXRlKHJvb3REaXIpXG4gICAgdGhpcy50aW1lb3V0ID0gc2V0VGltZW91dCh0aGlzLmRlc3Ryb3ksIHRoaXMuaW52YWxpZGF0ZUludGVydmFsKVxuICAgIHRoaXMuZGlzcG9zYWJsZXMuYWRkKHRoaXMucHJvY2Vzcy5vbkRpZERlc3Ryb3kodGhpcy5kZXN0cm95KSlcbiAgfVxuXG4gIHB1YmxpYyBkZXN0cm95ID0gKCkgPT4ge1xuICAgIFV0aWwuZGVidWcoYCR7dGhpcy5uYW1lfSBkZXN0cm95ZWRgKVxuICAgIGNsZWFyVGltZW91dCh0aGlzLnRpbWVvdXQpXG4gICAgdGhpcy5lbWl0dGVyLmVtaXQoJ2RpZC1kZXN0cm95JywgdW5kZWZpbmVkKVxuICAgIHRoaXMuZGlzcG9zYWJsZXMuZGlzcG9zZSgpXG4gIH1cblxuICBwdWJsaWMgb25EaWREZXN0cm95KGNhbGxiYWNrOiAoKSA9PiB2b2lkKSB7XG4gICAgcmV0dXJuIHRoaXMuZW1pdHRlci5vbignZGlkLWRlc3Ryb3knLCBjYWxsYmFjaylcbiAgfVxuXG4gIHB1YmxpYyBhc3luYyBzZXRCdWZmZXIoYnVmZmVySW5mbzogQnVmZmVySW5mbykge1xuICAgIGNvbnN0IG5hbWUgPSBhd2FpdCBidWZmZXJJbmZvLmdldE1vZHVsZU5hbWUoKVxuICAgIGlmIChuYW1lICE9PSB0aGlzLm5hbWUpIHsgcmV0dXJuIH1cbiAgICBpZiAodGhpcy5idWZmZXJTZXQuaGFzKGJ1ZmZlckluZm8uYnVmZmVyKSkgeyByZXR1cm4gfVxuICAgIHRoaXMuYnVmZmVyU2V0LmFkZChidWZmZXJJbmZvLmJ1ZmZlcilcbiAgICBVdGlsLmRlYnVnKGAke3RoaXMubmFtZX0gYnVmZmVyIGlzIHNldGApXG4gICAgY29uc3QgZGlzcG9zYWJsZXMgPSBuZXcgQ29tcG9zaXRlRGlzcG9zYWJsZSgpXG4gICAgZGlzcG9zYWJsZXMuYWRkKGJ1ZmZlckluZm8uYnVmZmVyLm9uRGlkU2F2ZSgoKSA9PiB7XG4gICAgICBVdGlsLmRlYnVnKGAke3RoaXMubmFtZX0gZGlkLXNhdmUgdHJpZ2dlcmVkYClcbiAgICAgIHRoaXMudXBkYXRlKHRoaXMucm9vdERpcilcbiAgICB9KSlcbiAgICBkaXNwb3NhYmxlcy5hZGQoYnVmZmVySW5mby5idWZmZXIub25EaWREZXN0cm95KCgpID0+IHtcbiAgICAgIGRpc3Bvc2FibGVzLmRpc3Bvc2UoKVxuICAgICAgdGhpcy5idWZmZXJTZXQuZGVsZXRlKGJ1ZmZlckluZm8uYnVmZmVyKVxuICAgICAgdGhpcy5kaXNwb3NhYmxlcy5yZW1vdmUoZGlzcG9zYWJsZXMpXG4gICAgfSkpXG4gICAgdGhpcy5kaXNwb3NhYmxlcy5hZGQoZGlzcG9zYWJsZXMpXG4gIH1cblxuICBwdWJsaWMgc2VsZWN0KGltcG9ydERlc2M6IElJbXBvcnQsIHN5bWJvbFR5cGVzPzogU3ltYm9sVHlwZVtdLCBza2lwUXVhbGlmaWVkOiBib29sZWFuID0gZmFsc2UpIHtcbiAgICBjbGVhclRpbWVvdXQodGhpcy50aW1lb3V0KVxuICAgIHRoaXMudGltZW91dCA9IHNldFRpbWVvdXQodGhpcy5kZXN0cm95LCB0aGlzLmludmFsaWRhdGVJbnRlcnZhbClcbiAgICBsZXQgc3ltYm9scyA9IHRoaXMuc3ltYm9sc1xuICAgIGlmIChpbXBvcnREZXNjLmltcG9ydExpc3QpIHtcbiAgICAgIGNvbnN0IGlsID0gaW1wb3J0RGVzYy5pbXBvcnRMaXN0XG4gICAgICBzeW1ib2xzID0gc3ltYm9scy5maWx0ZXIoKHMpID0+IHtcbiAgICAgICAgY29uc3QgaW5JbXBvcnRMaXN0ID0gaWwuaW5jbHVkZXMocy5uYW1lKVxuICAgICAgICBjb25zdCBwYXJlbnRJbkltcG9ydExpc3QgPSBpbC5zb21lKChpKSA9PiAodHlwZW9mIGkgIT09ICdzdHJpbmcnKSAmJiAocy5wYXJlbnQgPT09IGkucGFyZW50KSlcbiAgICAgICAgY29uc3Qgc2hvdWxkU2hvdyA9IGluSW1wb3J0TGlzdCB8fCBwYXJlbnRJbkltcG9ydExpc3RcbiAgICAgICAgcmV0dXJuIGltcG9ydERlc2MuaGlkaW5nICE9PSBzaG91bGRTaG93IC8vIFhPUlxuICAgICAgfSlcbiAgICB9XG4gICAgY29uc3QgcmVzID0gW11cbiAgICBmb3IgKGNvbnN0IHN5bWJvbCBvZiBzeW1ib2xzKSB7XG4gICAgICBpZiAoc3ltYm9sVHlwZXMgJiYgIXN5bWJvbFR5cGVzLmluY2x1ZGVzKHN5bWJvbC5zeW1ib2xUeXBlKSkgeyBjb250aW51ZSB9XG4gICAgICBjb25zdCBzcGVjaWZpYyA9IHtcbiAgICAgICAgbmFtZTogc3ltYm9sLm5hbWUsXG4gICAgICAgIHR5cGVTaWduYXR1cmU6IHN5bWJvbC50eXBlU2lnbmF0dXJlLFxuICAgICAgICBzeW1ib2xUeXBlOiBzeW1ib2wuc3ltYm9sVHlwZSxcbiAgICAgICAgbW9kdWxlOiBpbXBvcnREZXNjLFxuICAgICAgfVxuICAgICAgY29uc3QgcW4gPSAobjogc3RyaW5nKSA9PiBgJHtpbXBvcnREZXNjLmFsaWFzIHx8IGltcG9ydERlc2MubmFtZX0uJHtufWBcbiAgICAgIGlmICghc2tpcFF1YWxpZmllZCkge1xuICAgICAgICByZXMucHVzaCh7XG4gICAgICAgICAgLi4uc3BlY2lmaWMsXG4gICAgICAgICAgcXBhcmVudDogc3ltYm9sLnBhcmVudCA/IHFuKHN5bWJvbC5wYXJlbnQpIDogdW5kZWZpbmVkLFxuICAgICAgICAgIHFuYW1lOiBxbihzeW1ib2wubmFtZSksXG4gICAgICAgIH0pXG4gICAgICB9XG4gICAgICBpZiAoIWltcG9ydERlc2MucXVhbGlmaWVkKSB7XG4gICAgICAgIHJlcy5wdXNoKHtcbiAgICAgICAgICAuLi5zcGVjaWZpYyxcbiAgICAgICAgICBxcGFyZW50OiBzeW1ib2wucGFyZW50LFxuICAgICAgICAgIHFuYW1lOiBzeW1ib2wubmFtZSxcbiAgICAgICAgfSlcbiAgICAgIH1cbiAgICB9XG4gICAgcmV0dXJuIHJlc1xuICB9XG5cbiAgcHJpdmF0ZSBhc3luYyB1cGRhdGUocm9vdERpcjogQXRvbVR5cGVzLkRpcmVjdG9yeSkge1xuICAgIFV0aWwuZGVidWcoYCR7dGhpcy5uYW1lfSB1cGRhdGluZ2ApXG4gICAgdGhpcy5zeW1ib2xzID0gYXdhaXQgdGhpcy5wcm9jZXNzLnJ1bkJyb3dzZShyb290RGlyLCBbdGhpcy5uYW1lXSlcbiAgICBVdGlsLmRlYnVnKGAke3RoaXMubmFtZX0gdXBkYXRlZGApXG4gIH1cbn1cbiJdfQ==