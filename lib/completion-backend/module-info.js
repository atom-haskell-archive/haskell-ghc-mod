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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibW9kdWxlLWluZm8uanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi9zcmMvY29tcGxldGlvbi1iYWNrZW5kL21vZHVsZS1pbmZvLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7Ozs7Ozs7Ozs7QUFVQSwrQkFBbUQ7QUFDbkQsZ0NBQStCO0FBTy9CO0lBV0UsWUFBcUIsSUFBWSxFQUFVLE9BQXVCLEVBQVUsT0FBNEI7UUFBbkYsU0FBSSxHQUFKLElBQUksQ0FBUTtRQUFVLFlBQU8sR0FBUCxPQUFPLENBQWdCO1FBQVUsWUFBTyxHQUFQLE9BQU8sQ0FBcUI7UUFIaEcsdUJBQWtCLEdBQUcsRUFBRSxHQUFHLEVBQUUsR0FBRyxJQUFJLENBQUE7UUFJekMsSUFBSSxDQUFDLEtBQUssQ0FBQyxHQUFHLElBQUksQ0FBQyxJQUFJLFVBQVUsQ0FBQyxDQUFBO1FBQ2xDLElBQUksQ0FBQyxPQUFPLEdBQUcsRUFBRSxDQUFBO1FBQ2pCLElBQUksQ0FBQyxXQUFXLEdBQUcsSUFBSSwwQkFBbUIsRUFBRSxDQUFBO1FBQzVDLElBQUksQ0FBQyxTQUFTLEdBQUcsSUFBSSxPQUFPLEVBQUUsQ0FBQTtRQUM5QixJQUFJLENBQUMsT0FBTyxHQUFHLElBQUksY0FBTyxFQUFFLENBQUE7UUFDNUIsSUFBSSxDQUFDLFdBQVcsQ0FBQyxHQUFHLENBQUMsSUFBSSxDQUFDLE9BQU8sQ0FBQyxDQUFBO1FBQ2xDLElBQUksQ0FBQyxvQkFBb0IsR0FBRyxJQUFJLENBQUMsTUFBTSxDQUFDLE9BQU8sQ0FBQyxDQUFBO1FBQ2hELElBQUksQ0FBQyxPQUFPLEdBQUcsVUFBVSxDQUFDLElBQUksQ0FBQyxPQUFPLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxFQUFFLElBQUksQ0FBQyxrQkFBa0IsQ0FBQyxDQUFBO1FBQzNFLElBQUksQ0FBQyxXQUFXLENBQUMsR0FBRyxDQUFDLElBQUksQ0FBQyxPQUFPLENBQUMsWUFBWSxDQUFDLElBQUksQ0FBQyxPQUFPLENBQUMsSUFBSSxD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QUFFLFVBQVUsQ0FBQyxTQUFTLENBQUMsQ0FBQyxDQUFDO2dCQUMzQixHQUFHLENBQUMsSUFBSSxtQkFDSCxRQUFRLElBQ1gsT0FBTyxFQUFFLE1BQU0sQ0FBQyxNQUFNLEVBQ3RCLEtBQUssRUFBRSxNQUFNLENBQUMsSUFBSSxJQUNsQixDQUFBO1lBQ0osQ0FBQztRQUNILENBQUM7UUFDRCxNQUFNLENBQUMsR0FBRyxDQUFBO0lBQ1osQ0FBQztJQUVhLE1BQU0sQ0FBRSxPQUE0Qjs7WUFDaEQsSUFBSSxDQUFDLEtBQUssQ0FBQyxHQUFHLElBQUksQ0FBQyxJQUFJLFdBQVcsQ0FBQyxDQUFBO1lBQ25DLElBQUksQ0FBQyxPQUFPLEdBQUcsTUFBTSxJQUFJLENBQUMsT0FBTyxDQUFDLFNBQVMsQ0FBQyxPQUFPLEVBQUUsQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQTtZQUNqRSxJQUFJLENBQUMsS0FBSyxDQUFDLEdBQUcsSUFBSSxDQUFDLElBQUksVUFBVSxDQUFDLENBQUE7UUFDcEMsQ0FBQztLQUFBO0NBQ0Y7QUFuR0QsZ0NBbUdDIiwic291cmNlc0NvbnRlbnQiOlsiLypcbiAqIGRlY2FmZmVpbmF0ZSBzdWdnZXN0aW9uczpcbiAqIERTMTAxOiBSZW1vdmUgdW5uZWNlc3NhcnkgdXNlIG9mIEFycmF5LmZyb21cbiAqIERTMTAyOiBSZW1vdmUgdW5uZWNlc3NhcnkgY29kZSBjcmVhdGVkIGJlY2F1c2Ugb2YgaW1wbGljaXQgcmV0dXJuc1xuICogRFMxMDM6IFJld3JpdGUgY29kZSB0byBubyBsb25nZXIgdXNlIF9fZ3VhcmRfX1xuICogRFMxMDQ6IEF2b2lkIGlubGluZSBhc3NpZ25tZW50c1xuICogRFMyMDY6IENvbnNpZGVyIHJld29ya2luZyBjbGFzc2VzIHRvIGF2b2lkIGluaXRDbGFzc1xuICogRFMyMDc6IENvbnNpZGVyIHNob3J0ZXIgdmFyaWF0aW9ucyBvZiBudWxsIGNoZWNrc1xuICogRnVsbCBkb2NzOiBodHRwczovL2dpdGh1Yi5jb20vZGVjYWZmZWluYXRlL2RlY2FmZmVpbmF0ZS9ibG9iL21hc3Rlci9kb2NzL3N1Z2dlc3Rpb25zLm1kXG4gKi9cbmltcG9ydCB7IENvbXBvc2l0ZURpc3Bvc2FibGUsIEVtaXR0ZXIgfSBmcm9tICdhdG9tJ1xuaW1wb3J0ICogYXMgVXRpbCBmcm9tICcuLi91dGlsJ1xuaW1wb3J0IHtHaGNNb2RpUHJvY2Vzc30gZnJvbSAnLi4vZ2hjLW1vZCdcbmltcG9ydCB7QnVmZmVySW5mbywgSUltcG9ydH0gZnJvbSAnLi9idWZmZXItaW5mbydcbmltcG9ydCB7U3ltYm9sRGVzY30gZnJvbSAnLi4vZ2hjLW1vZCdcblxuaW1wb3J0IFN5bWJvbFR5cGUgPSBVUEkuQ29tcGxldGlvbkJhY2tlbmQuU3ltYm9sVHlwZVxuXG5leHBvcnQgY2xhc3MgTW9kdWxlSW5mbyB7XG4gIHB1YmxpYyByZWFkb25seSBpbml0aWFsVXBkYXRlUHJvbWlzZTogUHJvbWlzZTx2b2lkPlxuICBwcml2YXRlIHN5bWJvbHM6IFN5bWJvbERlc2NbXSAvLyBtb2R1bGUgc3ltYm9sc1xuICBwcml2YXRlIGRpc3Bvc2FibGVzOiBDb21wb3NpdGVEaXNwb3NhYmxlXG4gIHByaXZhdGUgZW1pdHRlcjogTXlFbWl0dGVyPHtcbiAgICAnZGlkLWRlc3Ryb3knOiB1bmRlZmluZWRcbiAgfT5cbiAgcHJpdmF0ZSB0aW1lb3V0OiBOb2RlSlMuVGltZXJcbiAgcHJpdmF0ZSBpbnZhbGlkYXRlSW50ZXJ2YWwgPSAzMCAqIDYwICogMTAwMCAvLyBpZiBtb2R1bGUgdW51c2VkIGZvciAzMCBtaW51dGVzLCByZW1vdmUgaXRcbiAgcHJpdmF0ZSBidWZmZXJTZXQ6IFdlYWtTZXQ8QXRvbVR5cGVzLlRleHRCdWZmZXI+XG5cbiAgY29uc3RydWN0b3IgKHByaXZhdGUgbmFtZTogc3RyaW5nLCBwcml2YXRlIHByb2Nlc3M6IEdoY01vZGlQcm9jZXNzLCBwcml2YXRlIHJvb3REaXI6IEF0b21UeXBlcy5EaXJlY3RvcnkpIHtcbiAgICBVdGlsLmRlYnVnKGAke3RoaXMubmFtZX0gY3JlYXRlZGApXG4gICAgdGhpcy5zeW1ib2xzID0gW11cbiAgICB0aGlzLmRpc3Bvc2FibGVzID0gbmV3IENvbXBvc2l0ZURpc3Bvc2FibGUoKVxuICAgIHRoaXMuYnVmZmVyU2V0ID0gbmV3IFdlYWtTZXQoKVxuICAgIHRoaXMuZW1pdHRlciA9IG5ldyBFbWl0dGVyKClcbiAgICB0aGlzLmRpc3Bvc2FibGVzLmFkZCh0aGlzLmVtaXR0ZXIpXG4gICAgdGhpcy5pbml0aWFsVXBkYXRlUHJvbWlzZSA9IHRoaXMudXBkYXRlKHJvb3REaXIpXG4gICAgdGhpcy50aW1lb3V0ID0gc2V0VGltZW91dCh0aGlzLmRlc3Ryb3kuYmluZCh0aGlzKSwgdGhpcy5pbnZhbGlkYXRlSW50ZXJ2YWwpXG4gICAgdGhpcy5kaXNwb3NhYmxlcy5hZGQodGhpcy5wcm9jZXNzLm9uRGlkRGVzdHJveSh0aGlzLmRlc3Ryb3kuYmluZCh0aGlzKSkpXG4gIH1cblxuICBwdWJsaWMgZGVzdHJveSAoKSB7XG4gICAgVXRpbC5kZWJ1ZyhgJHt0aGlzLm5hbWV9IGRlc3Ryb3llZGApXG4gICAgY2xlYXJUaW1lb3V0KHRoaXMudGltZW91dClcbiAgICB0aGlzLmVtaXR0ZXIuZW1pdCgnZGlkLWRlc3Ryb3knLCB1bmRlZmluZWQpXG4gICAgdGhpcy5kaXNwb3NhYmxlcy5kaXNwb3NlKClcbiAgfVxuXG4gIHB1YmxpYyBvbkRpZERlc3Ryb3kgKGNhbGxiYWNrOiAoKSA9PiB2b2lkKSB7XG4gICAgcmV0dXJuIHRoaXMuZW1pdHRlci5vbignZGlkLWRlc3Ryb3knLCBjYWxsYmFjaylcbiAgfVxuXG4gIHB1YmxpYyBhc3luYyBzZXRCdWZmZXIgKGJ1ZmZlckluZm86IEJ1ZmZlckluZm8pIHtcbiAgICBjb25zdCBuYW1lID0gYXdhaXQgYnVmZmVySW5mby5nZXRNb2R1bGVOYW1lKClcbiAgICBpZiAobmFtZSAhPT0gdGhpcy5uYW1lKSB7IHJldHVybiB9XG4gICAgaWYgKHRoaXMuYnVmZmVyU2V0LmhhcyhidWZmZXJJbmZvLmJ1ZmZlcikpIHsgcmV0dXJuIH1cbiAgICB0aGlzLmJ1ZmZlclNldC5hZGQoYnVmZmVySW5mby5idWZmZXIpXG4gICAgVXRpbC5kZWJ1ZyhgJHt0aGlzLm5hbWV9IGJ1ZmZlciBpcyBzZXRgKVxuICAgIGNvbnN0IGRpc3Bvc2FibGVzID0gbmV3IENvbXBvc2l0ZURpc3Bvc2FibGUoKVxuICAgIGRpc3Bvc2FibGVzLmFkZChidWZmZXJJbmZvLmJ1ZmZlci5vbkRpZFNhdmUoKCkgPT4ge1xuICAgICAgVXRpbC5kZWJ1ZyhgJHt0aGlzLm5hbWV9IGRpZC1zYXZlIHRyaWdnZXJlZGApXG4gICAgICB0aGlzLnVwZGF0ZSh0aGlzLnJvb3REaXIpXG4gICAgfSkpXG4gICAgZGlzcG9zYWJsZXMuYWRkKGJ1ZmZlckluZm8uYnVmZmVyLm9uRGlkRGVzdHJveSgoKSA9PiB7XG4gICAgICBkaXNwb3NhYmxlcy5kaXNwb3NlKClcbiAgICAgIHRoaXMuYnVmZmVyU2V0LmRlbGV0ZShidWZmZXJJbmZvLmJ1ZmZlcilcbiAgICAgIHRoaXMuZGlzcG9zYWJsZXMucmVtb3ZlKGRpc3Bvc2FibGVzKVxuICAgIH0pKVxuICAgIHRoaXMuZGlzcG9zYWJsZXMuYWRkKGRpc3Bvc2FibGVzKVxuICB9XG5cbiAgcHVibGljIHNlbGVjdCAoaW1wb3J0RGVzYzogSUltcG9ydCwgc3ltYm9sVHlwZXM/OiBTeW1ib2xUeXBlW10sIHNraXBRdWFsaWZpZWQ6IGJvb2xlYW4gPSBmYWxzZSkge1xuICAgIGNsZWFyVGltZW91dCh0aGlzLnRpbWVvdXQpXG4gICAgdGhpcy50aW1lb3V0ID0gc2V0VGltZW91dCh0aGlzLmRlc3Ryb3kuYmluZCh0aGlzKSwgdGhpcy5pbnZhbGlkYXRlSW50ZXJ2YWwpXG4gICAgbGV0IHN5bWJvbHMgPSB0aGlzLnN5bWJvbHNcbiAgICBpZiAoaW1wb3J0RGVzYy5pbXBvcnRMaXN0KSB7XG4gICAgICBjb25zdCBpbCA9IGltcG9ydERlc2MuaW1wb3J0TGlzdFxuICAgICAgc3ltYm9scyA9IHN5bWJvbHMuZmlsdGVyKChzKSA9PiB7XG4gICAgICAgIGNvbnN0IGluSW1wb3J0TGlzdCA9IGlsLmluY2x1ZGVzKHMubmFtZSlcbiAgICAgICAgY29uc3QgcGFyZW50SW5JbXBvcnRMaXN0ID0gaWwuc29tZSgoaSkgPT4gKHR5cGVvZiBpICE9PSAnc3RyaW5nJykgJiYgKHMucGFyZW50ID09PSBpLnBhcmVudCkpXG4gICAgICAgIGNvbnN0IHNob3VsZFNob3cgPSBpbkltcG9ydExpc3QgfHwgcGFyZW50SW5JbXBvcnRMaXN0XG4gICAgICAgIHJldHVybiBpbXBvcnREZXNjLmhpZGluZyAhPT0gc2hvdWxkU2hvdyAvLyBYT1JcbiAgICAgIH0pXG4gICAgfVxuICAgIGNvbnN0IHJlcyA9IFtdXG4gICAgZm9yIChjb25zdCBzeW1ib2wgb2Ygc3ltYm9scykge1xuICAgICAgaWYgKHN5bWJvbFR5cGVzICYmICFzeW1ib2xUeXBlcy5pbmNsdWRlcyhzeW1ib2wuc3ltYm9sVHlwZSkpIHsgY29udGludWUgfVxuICAgICAgY29uc3Qgc3BlY2lmaWMgPSB7XG4gICAgICAgIG5hbWU6IHN5bWJvbC5uYW1lLFxuICAgICAgICB0eXBlU2lnbmF0dXJlOiBzeW1ib2wudHlwZVNpZ25hdHVyZSxcbiAgICAgICAgc3ltYm9sVHlwZTogc3ltYm9sLnN5bWJvbFR5cGUsXG4gICAgICAgIG1vZHVsZTogaW1wb3J0RGVzY1xuICAgICAgfVxuICAgICAgY29uc3QgcW4gPSAobjogc3RyaW5nKSA9PiBgJHtpbXBvcnREZXNjLmFsaWFzIHx8IGltcG9ydERlc2MubmFtZX0uJHtufWBcbiAgICAgIGlmICghc2tpcFF1YWxpZmllZCkge1xuICAgICAgICByZXMucHVzaCh7XG4gICAgICAgICAgLi4uc3BlY2lmaWMsXG4gICAgICAgICAgcXBhcmVudDogc3ltYm9sLnBhcmVudCA/IHFuKHN5bWJvbC5wYXJlbnQpIDogdW5kZWZpbmVkLFxuICAgICAgICAgIHFuYW1lOiBxbihzeW1ib2wubmFtZSlcbiAgICAgICAgfSlcbiAgICAgIH1cbiAgICAgIGlmICghIGltcG9ydERlc2MucXVhbGlmaWVkKSB7XG4gICAgICAgIHJlcy5wdXNoKHtcbiAgICAgICAgICAuLi5zcGVjaWZpYyxcbiAgICAgICAgICBxcGFyZW50OiBzeW1ib2wucGFyZW50LFxuICAgICAgICAgIHFuYW1lOiBzeW1ib2wubmFtZVxuICAgICAgICB9KVxuICAgICAgfVxuICAgIH1cbiAgICByZXR1cm4gcmVzXG4gIH1cblxuICBwcml2YXRlIGFzeW5jIHVwZGF0ZSAocm9vdERpcjogQXRvbVR5cGVzLkRpcmVjdG9yeSkge1xuICAgIFV0aWwuZGVidWcoYCR7dGhpcy5uYW1lfSB1cGRhdGluZ2ApXG4gICAgdGhpcy5zeW1ib2xzID0gYXdhaXQgdGhpcy5wcm9jZXNzLnJ1bkJyb3dzZShyb290RGlyLCBbdGhpcy5uYW1lXSlcbiAgICBVdGlsLmRlYnVnKGAke3RoaXMubmFtZX0gdXBkYXRlZGApXG4gIH1cbn1cbiJdfQ==