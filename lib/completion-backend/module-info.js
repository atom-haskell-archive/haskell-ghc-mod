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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibW9kdWxlLWluZm8uanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi9zcmMvY29tcGxldGlvbi1iYWNrZW5kL21vZHVsZS1pbmZvLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7Ozs7Ozs7Ozs7QUFVQSwrQkFBbUQ7QUFDbkQsZ0NBQStCO0FBSy9CO0lBU0UsWUFBcUIsSUFBWSxFQUFVLE9BQXVCLEVBQVUsT0FBNEI7UUFBbkYsU0FBSSxHQUFKLElBQUksQ0FBUTtRQUFVLFlBQU8sR0FBUCxPQUFPLENBQWdCO1FBQVUsWUFBTyxHQUFQLE9BQU8sQ0FBcUI7UUFIaEcsdUJBQWtCLEdBQUcsRUFBRSxHQUFHLEVBQUUsR0FBRyxJQUFJLENBQUE7UUFJekMsSUFBSSxDQUFDLEtBQUssQ0FBQyxHQUFHLElBQUksQ0FBQyxJQUFJLFVBQVUsQ0FBQyxDQUFBO1FBQ2xDLElBQUksQ0FBQyxPQUFPLEdBQUcsRUFBRSxDQUFBO1FBQ2pCLElBQUksQ0FBQyxXQUFXLEdBQUcsSUFBSSwwQkFBbUIsRUFBRSxDQUFBO1FBQzVDLElBQUksQ0FBQyxTQUFTLEdBQUcsSUFBSSxPQUFPLEVBQUUsQ0FBQTtRQUM5QixJQUFJLENBQUMsT0FBTyxHQUFHLElBQUksY0FBTyxFQUFFLENBQUE7UUFDNUIsSUFBSSxDQUFDLFdBQVcsQ0FBQyxHQUFHLENBQUMsSUFBSSxDQUFDLE9BQU8sQ0FBQyxDQUFBO1FBQ2xDLElBQUksQ0FBQyxvQkFBb0IsR0FBRyxJQUFJLENBQUMsTUFBTSxDQUFDLE9BQU8sQ0FBQyxDQUFBO1FBQ2hELElBQUksQ0FBQyxPQUFPLEdBQUcsVUFBVSxDQUFDLElBQUksQ0FBQyxPQUFPLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxFQUFFLElBQUksQ0FBQyxrQkFBa0IsQ0FBQyxDQUFBO1FBQzNFLElBQUksQ0FBQyxXQUFXLENBQUMsR0FBRyxDQUFDLElBQUksQ0FBQyxPQUFPLENBQUMsWUFBWSxDQUFDLElBQUksQ0FBQyxPQUFPLENBQUMsSUFBSSxD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QUFDLFNBQVMsQ0FBQyxDQUFDLENBQUM7Z0JBQzNCLEdBQUcsQ0FBQyxJQUFJLG1CQUNILFFBQVEsSUFDWCxPQUFPLEVBQUUsTUFBTSxDQUFDLE1BQU0sRUFDdEIsS0FBSyxFQUFFLE1BQU0sQ0FBQyxJQUFJLElBQ2xCLENBQUE7WUFDSixDQUFDO1FBQ0gsQ0FBQztRQUNELE1BQU0sQ0FBQyxHQUFHLENBQUE7SUFDWixDQUFDO0lBRWEsTUFBTSxDQUFFLE9BQTRCOztZQUNoRCxJQUFJLENBQUMsS0FBSyxDQUFDLEdBQUcsSUFBSSxDQUFDLElBQUksV0FBVyxDQUFDLENBQUE7WUFDbkMsSUFBSSxDQUFDLE9BQU8sR0FBRyxNQUFNLElBQUksQ0FBQyxPQUFPLENBQUMsU0FBUyxDQUFDLE9BQU8sRUFBRSxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFBO1lBQ2pFLElBQUksQ0FBQyxLQUFLLENBQUMsR0FBRyxJQUFJLENBQUMsSUFBSSxVQUFVLENBQUMsQ0FBQTtRQUNwQyxDQUFDO0tBQUE7Q0FDRjtBQWpHRCxnQ0FpR0MiLCJzb3VyY2VzQ29udGVudCI6WyIvKlxuICogZGVjYWZmZWluYXRlIHN1Z2dlc3Rpb25zOlxuICogRFMxMDE6IFJlbW92ZSB1bm5lY2Vzc2FyeSB1c2Ugb2YgQXJyYXkuZnJvbVxuICogRFMxMDI6IFJlbW92ZSB1bm5lY2Vzc2FyeSBjb2RlIGNyZWF0ZWQgYmVjYXVzZSBvZiBpbXBsaWNpdCByZXR1cm5zXG4gKiBEUzEwMzogUmV3cml0ZSBjb2RlIHRvIG5vIGxvbmdlciB1c2UgX19ndWFyZF9fXG4gKiBEUzEwNDogQXZvaWQgaW5saW5lIGFzc2lnbm1lbnRzXG4gKiBEUzIwNjogQ29uc2lkZXIgcmV3b3JraW5nIGNsYXNzZXMgdG8gYXZvaWQgaW5pdENsYXNzXG4gKiBEUzIwNzogQ29uc2lkZXIgc2hvcnRlciB2YXJpYXRpb25zIG9mIG51bGwgY2hlY2tzXG4gKiBGdWxsIGRvY3M6IGh0dHBzOi8vZ2l0aHViLmNvbS9kZWNhZmZlaW5hdGUvZGVjYWZmZWluYXRlL2Jsb2IvbWFzdGVyL2RvY3Mvc3VnZ2VzdGlvbnMubWRcbiAqL1xuaW1wb3J0IHsgQ29tcG9zaXRlRGlzcG9zYWJsZSwgRW1pdHRlciB9IGZyb20gJ2F0b20nXG5pbXBvcnQgKiBhcyBVdGlsIGZyb20gJy4uL3V0aWwnXG5pbXBvcnQge0doY01vZGlQcm9jZXNzfSBmcm9tICcuLi9naGMtbW9kJ1xuaW1wb3J0IHtCdWZmZXJJbmZvLCBJSW1wb3J0fSBmcm9tICcuL2J1ZmZlci1pbmZvJ1xuaW1wb3J0IHtTeW1ib2xEZXNjLCBTeW1ib2xUeXBlfSBmcm9tICcuLi9naGMtbW9kJ1xuXG5leHBvcnQgY2xhc3MgTW9kdWxlSW5mbyB7XG4gIHB1YmxpYyByZWFkb25seSBpbml0aWFsVXBkYXRlUHJvbWlzZTogUHJvbWlzZTx2b2lkPlxuICBwcml2YXRlIHN5bWJvbHM6IFN5bWJvbERlc2NbXSAvLyBtb2R1bGUgc3ltYm9sc1xuICBwcml2YXRlIGRpc3Bvc2FibGVzOiBDb21wb3NpdGVEaXNwb3NhYmxlXG4gIHByaXZhdGUgZW1pdHRlcjogRW1pdHRlclxuICBwcml2YXRlIHRpbWVvdXQ6IE5vZGVKUy5UaW1lclxuICBwcml2YXRlIGludmFsaWRhdGVJbnRlcnZhbCA9IDMwICogNjAgKiAxMDAwIC8vIGlmIG1vZHVsZSB1bnVzZWQgZm9yIDMwIG1pbnV0ZXMsIHJlbW92ZSBpdFxuICBwcml2YXRlIGJ1ZmZlclNldDogV2Vha1NldDxBdG9tVHlwZXMuVGV4dEJ1ZmZlcj5cblxuICBjb25zdHJ1Y3RvciAocHJpdmF0ZSBuYW1lOiBzdHJpbmcsIHByaXZhdGUgcHJvY2VzczogR2hjTW9kaVByb2Nlc3MsIHByaXZhdGUgcm9vdERpcjogQXRvbVR5cGVzLkRpcmVjdG9yeSkge1xuICAgIFV0aWwuZGVidWcoYCR7dGhpcy5uYW1lfSBjcmVhdGVkYClcbiAgICB0aGlzLnN5bWJvbHMgPSBbXVxuICAgIHRoaXMuZGlzcG9zYWJsZXMgPSBuZXcgQ29tcG9zaXRlRGlzcG9zYWJsZSgpXG4gICAgdGhpcy5idWZmZXJTZXQgPSBuZXcgV2Vha1NldCgpXG4gICAgdGhpcy5lbWl0dGVyID0gbmV3IEVtaXR0ZXIoKVxuICAgIHRoaXMuZGlzcG9zYWJsZXMuYWRkKHRoaXMuZW1pdHRlcilcbiAgICB0aGlzLmluaXRpYWxVcGRhdGVQcm9taXNlID0gdGhpcy51cGRhdGUocm9vdERpcilcbiAgICB0aGlzLnRpbWVvdXQgPSBzZXRUaW1lb3V0KHRoaXMuZGVzdHJveS5iaW5kKHRoaXMpLCB0aGlzLmludmFsaWRhdGVJbnRlcnZhbClcbiAgICB0aGlzLmRpc3Bvc2FibGVzLmFkZCh0aGlzLnByb2Nlc3Mub25EaWREZXN0cm95KHRoaXMuZGVzdHJveS5iaW5kKHRoaXMpKSlcbiAgfVxuXG4gIHB1YmxpYyBkZXN0cm95ICgpIHtcbiAgICBVdGlsLmRlYnVnKGAke3RoaXMubmFtZX0gZGVzdHJveWVkYClcbiAgICBjbGVhclRpbWVvdXQodGhpcy50aW1lb3V0KVxuICAgIHRoaXMuZW1pdHRlci5lbWl0KCdkaWQtZGVzdHJveScpXG4gICAgdGhpcy5kaXNwb3NhYmxlcy5kaXNwb3NlKClcbiAgfVxuXG4gIHB1YmxpYyBvbkRpZERlc3Ryb3kgKGNhbGxiYWNrOiAoKSA9PiB2b2lkKSB7XG4gICAgcmV0dXJuIHRoaXMuZW1pdHRlci5vbignZGlkLWRlc3Ryb3knLCBjYWxsYmFjaylcbiAgfVxuXG4gIHB1YmxpYyBhc3luYyBzZXRCdWZmZXIgKGJ1ZmZlckluZm86IEJ1ZmZlckluZm8pIHtcbiAgICBjb25zdCBuYW1lID0gYXdhaXQgYnVmZmVySW5mby5nZXRNb2R1bGVOYW1lKClcbiAgICBpZiAobmFtZSAhPT0gdGhpcy5uYW1lKSB7IHJldHVybiB9XG4gICAgaWYgKHRoaXMuYnVmZmVyU2V0LmhhcyhidWZmZXJJbmZvLmJ1ZmZlcikpIHsgcmV0dXJuIH1cbiAgICB0aGlzLmJ1ZmZlclNldC5hZGQoYnVmZmVySW5mby5idWZmZXIpXG4gICAgVXRpbC5kZWJ1ZyhgJHt0aGlzLm5hbWV9IGJ1ZmZlciBpcyBzZXRgKVxuICAgIGNvbnN0IGRpc3Bvc2FibGVzID0gbmV3IENvbXBvc2l0ZURpc3Bvc2FibGUoKVxuICAgIGRpc3Bvc2FibGVzLmFkZChidWZmZXJJbmZvLmJ1ZmZlci5vbkRpZFNhdmUoKCkgPT4ge1xuICAgICAgVXRpbC5kZWJ1ZyhgJHt0aGlzLm5hbWV9IGRpZC1zYXZlIHRyaWdnZXJlZGApXG4gICAgICB0aGlzLnVwZGF0ZSh0aGlzLnJvb3REaXIpXG4gICAgfSkpXG4gICAgZGlzcG9zYWJsZXMuYWRkKGJ1ZmZlckluZm8uYnVmZmVyLm9uRGlkRGVzdHJveSgoKSA9PiB7XG4gICAgICBkaXNwb3NhYmxlcy5kaXNwb3NlKClcbiAgICAgIHRoaXMuYnVmZmVyU2V0LmRlbGV0ZShidWZmZXJJbmZvLmJ1ZmZlcilcbiAgICAgIHRoaXMuZGlzcG9zYWJsZXMucmVtb3ZlKGRpc3Bvc2FibGVzKVxuICAgIH0pKVxuICAgIHRoaXMuZGlzcG9zYWJsZXMuYWRkKGRpc3Bvc2FibGVzKVxuICB9XG5cbiAgcHVibGljIHNlbGVjdCAoaW1wb3J0RGVzYzogSUltcG9ydCwgc3ltYm9sVHlwZXM/OiBTeW1ib2xUeXBlW10sIHNraXBRdWFsaWZpZWQ6IGJvb2xlYW4gPSBmYWxzZSkge1xuICAgIGNsZWFyVGltZW91dCh0aGlzLnRpbWVvdXQpXG4gICAgdGhpcy50aW1lb3V0ID0gc2V0VGltZW91dCh0aGlzLmRlc3Ryb3kuYmluZCh0aGlzKSwgdGhpcy5pbnZhbGlkYXRlSW50ZXJ2YWwpXG4gICAgbGV0IHN5bWJvbHMgPSB0aGlzLnN5bWJvbHNcbiAgICBpZiAoaW1wb3J0RGVzYy5pbXBvcnRMaXN0KSB7XG4gICAgICBjb25zdCBpbCA9IGltcG9ydERlc2MuaW1wb3J0TGlzdFxuICAgICAgc3ltYm9scyA9IHN5bWJvbHMuZmlsdGVyKChzKSA9PiB7XG4gICAgICAgIGNvbnN0IGluSW1wb3J0TGlzdCA9IGlsLmluY2x1ZGVzKHMubmFtZSlcbiAgICAgICAgY29uc3QgcGFyZW50SW5JbXBvcnRMaXN0ID0gaWwuc29tZSgoaSkgPT4gKHR5cGVvZiBpICE9PSAnc3RyaW5nJykgJiYgKHMucGFyZW50ID09PSBpLnBhcmVudCkpXG4gICAgICAgIGNvbnN0IHNob3VsZFNob3cgPSBpbkltcG9ydExpc3QgfHwgcGFyZW50SW5JbXBvcnRMaXN0XG4gICAgICAgIHJldHVybiBpbXBvcnREZXNjLmhpZGluZyAhPT0gc2hvdWxkU2hvdyAvLyBYT1JcbiAgICAgIH0pXG4gICAgfVxuICAgIGNvbnN0IHJlcyA9IFtdXG4gICAgZm9yIChjb25zdCBzeW1ib2wgb2Ygc3ltYm9scykge1xuICAgICAgaWYgKHN5bWJvbFR5cGVzICYmICFzeW1ib2xUeXBlcy5pbmNsdWRlcyhzeW1ib2wuc3ltYm9sVHlwZSkpIHsgY29udGludWUgfVxuICAgICAgY29uc3Qgc3BlY2lmaWMgPSB7XG4gICAgICAgIG5hbWU6IHN5bWJvbC5uYW1lLFxuICAgICAgICB0eXBlU2lnbmF0dXJlOiBzeW1ib2wudHlwZVNpZ25hdHVyZSxcbiAgICAgICAgc3ltYm9sVHlwZTogc3ltYm9sLnN5bWJvbFR5cGUsXG4gICAgICAgIG1vZHVsZTogaW1wb3J0RGVzY1xuICAgICAgfVxuICAgICAgY29uc3QgcW4gPSAobjogc3RyaW5nKSA9PiBgJHtpbXBvcnREZXNjLmFsaWFzIHx8IGltcG9ydERlc2MubmFtZX0uJHtufWBcbiAgICAgIGlmICghc2tpcFF1YWxpZmllZCkge1xuICAgICAgICByZXMucHVzaCh7XG4gICAgICAgICAgLi4uc3BlY2lmaWMsXG4gICAgICAgICAgcXBhcmVudDogc3ltYm9sLnBhcmVudCA/IHFuKHN5bWJvbC5wYXJlbnQpIDogdW5kZWZpbmVkLFxuICAgICAgICAgIHFuYW1lOiBxbihzeW1ib2wubmFtZSlcbiAgICAgICAgfSlcbiAgICAgIH1cbiAgICAgIGlmICghIGltcG9ydERlc2MucXVhbGlmaWVkKSB7XG4gICAgICAgIHJlcy5wdXNoKHtcbiAgICAgICAgICAuLi5zcGVjaWZpYyxcbiAgICAgICAgICBxcGFyZW50OiBzeW1ib2wucGFyZW50LFxuICAgICAgICAgIHFuYW1lOiBzeW1ib2wubmFtZVxuICAgICAgICB9KVxuICAgICAgfVxuICAgIH1cbiAgICByZXR1cm4gcmVzXG4gIH1cblxuICBwcml2YXRlIGFzeW5jIHVwZGF0ZSAocm9vdERpcjogQXRvbVR5cGVzLkRpcmVjdG9yeSkge1xuICAgIFV0aWwuZGVidWcoYCR7dGhpcy5uYW1lfSB1cGRhdGluZ2ApXG4gICAgdGhpcy5zeW1ib2xzID0gYXdhaXQgdGhpcy5wcm9jZXNzLnJ1bkJyb3dzZShyb290RGlyLCBbdGhpcy5uYW1lXSlcbiAgICBVdGlsLmRlYnVnKGAke3RoaXMubmFtZX0gdXBkYXRlZGApXG4gIH1cbn1cbiJdfQ==