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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibW9kdWxlLWluZm8uanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi9zcmMvY29tcGxldGlvbi1iYWNrZW5kL21vZHVsZS1pbmZvLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7Ozs7Ozs7Ozs7QUFBQSwrQkFBNkQ7QUFDN0QsZ0NBQStCO0FBTy9CO0lBV0UsWUFBb0IsSUFBWSxFQUFVLE9BQXVCLEVBQVUsT0FBNEI7UUFBbkYsU0FBSSxHQUFKLElBQUksQ0FBUTtRQUFVLFlBQU8sR0FBUCxPQUFPLENBQWdCO1FBQVUsWUFBTyxHQUFQLE9BQU8sQ0FBcUI7UUFIL0YsdUJBQWtCLEdBQUcsRUFBRSxHQUFHLEVBQUUsR0FBRyxJQUFJLENBQUE7UUFJekMsSUFBSSxDQUFDLEtBQUssQ0FBQyxHQUFHLElBQUksQ0FBQyxJQUFJLFVBQVUsQ0FBQyxDQUFBO1FBQ2xDLElBQUksQ0FBQyxPQUFPLEdBQUcsRUFBRSxDQUFBO1FBQ2pCLElBQUksQ0FBQyxXQUFXLEdBQUcsSUFBSSwwQkFBbUIsRUFBRSxDQUFBO1FBQzVDLElBQUksQ0FBQyxTQUFTLEdBQUcsSUFBSSxPQUFPLEVBQUUsQ0FBQTtRQUM5QixJQUFJLENBQUMsT0FBTyxHQUFHLElBQUksY0FBTyxFQUFFLENBQUE7UUFDNUIsSUFBSSxDQUFDLFdBQVcsQ0FBQyxHQUFHLENBQUMsSUFBSSxDQUFDLE9BQU8sQ0FBQyxDQUFBO1FBQ2xDLElBQUksQ0FBQyxvQkFBb0IsR0FBRyxJQUFJLENBQUMsTUFBTSxDQUFDLE9BQU8sQ0FBQyxDQUFBO1FBQ2hELElBQUksQ0FBQyxPQUFPLEdBQUcsVUFBVSxDQUFDLElBQUksQ0FBQyxPQUFPLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxFQUFFLElBQUksQ0FBQyxrQkFBa0IsQ0FBQyxDQUFBO1FBQzNFLElBQUksQ0FBQyxXQUFXLENBQUMsR0FBRyxDQUFDLElBQUksQ0FBQyxPQUFPLENBQUMsWUFBWSxDQUFDLElBQUksQ0FBQyxPQUFPLENBQUMsSUFBSSxD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QUUsQ0FBQyxNQUFNLENBQUMsSUFBSSxDQUFDLElBQ3RCLENBQUE7WUFDSixDQUFDO1lBQ0QsRUFBRSxDQUFDLENBQUMsQ0FBQyxVQUFVLENBQUMsU0FBUyxDQUFDLENBQUMsQ0FBQztnQkFDMUIsR0FBRyxDQUFDLElBQUksbUJBQ0gsUUFBUSxJQUNYLE9BQU8sRUFBRSxNQUFNLENBQUMsTUFBTSxFQUN0QixLQUFLLEVBQUUsTUFBTSxDQUFDLElBQUksSUFDbEIsQ0FBQTtZQUNKLENBQUM7UUFDSCxDQUFDO1FBQ0QsTUFBTSxDQUFDLEdBQUcsQ0FBQTtJQUNaLENBQUM7SUFFYSxNQUFNLENBQUMsT0FBNEI7O1lBQy9DLElBQUksQ0FBQyxLQUFLLENBQUMsR0FBRyxJQUFJLENBQUMsSUFBSSxXQUFXLENBQUMsQ0FBQTtZQUNuQyxJQUFJLENBQUMsT0FBTyxHQUFHLE1BQU0sSUFBSSxDQUFDLE9BQU8sQ0FBQyxTQUFTLENBQUMsT0FBTyxFQUFFLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUE7WUFDakUsSUFBSSxDQUFDLEtBQUssQ0FBQyxHQUFHLElBQUksQ0FBQyxJQUFJLFVBQVUsQ0FBQyxDQUFBO1FBQ3BDLENBQUM7S0FBQTtDQUNGO0FBbkdELGdDQW1HQyIsInNvdXJjZXNDb250ZW50IjpbImltcG9ydCB7IENvbXBvc2l0ZURpc3Bvc2FibGUsIFRFbWl0dGVyLCBFbWl0dGVyIH0gZnJvbSAnYXRvbSdcbmltcG9ydCAqIGFzIFV0aWwgZnJvbSAnLi4vdXRpbCdcbmltcG9ydCB7IEdoY01vZGlQcm9jZXNzIH0gZnJvbSAnLi4vZ2hjLW1vZCdcbmltcG9ydCB7IEJ1ZmZlckluZm8sIElJbXBvcnQgfSBmcm9tICcuL2J1ZmZlci1pbmZvJ1xuaW1wb3J0IHsgU3ltYm9sRGVzYyB9IGZyb20gJy4uL2doYy1tb2QnXG5cbmltcG9ydCBTeW1ib2xUeXBlID0gVVBJLkNvbXBsZXRpb25CYWNrZW5kLlN5bWJvbFR5cGVcblxuZXhwb3J0IGNsYXNzIE1vZHVsZUluZm8ge1xuICBwdWJsaWMgcmVhZG9ubHkgaW5pdGlhbFVwZGF0ZVByb21pc2U6IFByb21pc2U8dm9pZD5cbiAgcHJpdmF0ZSBzeW1ib2xzOiBTeW1ib2xEZXNjW10gLy8gbW9kdWxlIHN5bWJvbHNcbiAgcHJpdmF0ZSBkaXNwb3NhYmxlczogQ29tcG9zaXRlRGlzcG9zYWJsZVxuICBwcml2YXRlIGVtaXR0ZXI6IFRFbWl0dGVyPHtcbiAgICAnZGlkLWRlc3Ryb3knOiB1bmRlZmluZWRcbiAgfT5cbiAgcHJpdmF0ZSB0aW1lb3V0OiBOb2RlSlMuVGltZXJcbiAgcHJpdmF0ZSBpbnZhbGlkYXRlSW50ZXJ2YWwgPSAzMCAqIDYwICogMTAwMCAvLyBpZiBtb2R1bGUgdW51c2VkIGZvciAzMCBtaW51dGVzLCByZW1vdmUgaXRcbiAgcHJpdmF0ZSBidWZmZXJTZXQ6IFdlYWtTZXQ8QXRvbVR5cGVzLlRleHRCdWZmZXI+XG5cbiAgY29uc3RydWN0b3IocHJpdmF0ZSBuYW1lOiBzdHJpbmcsIHByaXZhdGUgcHJvY2VzczogR2hjTW9kaVByb2Nlc3MsIHByaXZhdGUgcm9vdERpcjogQXRvbVR5cGVzLkRpcmVjdG9yeSkge1xuICAgIFV0aWwuZGVidWcoYCR7dGhpcy5uYW1lfSBjcmVhdGVkYClcbiAgICB0aGlzLnN5bWJvbHMgPSBbXVxuICAgIHRoaXMuZGlzcG9zYWJsZXMgPSBuZXcgQ29tcG9zaXRlRGlzcG9zYWJsZSgpXG4gICAgdGhpcy5idWZmZXJTZXQgPSBuZXcgV2Vha1NldCgpXG4gICAgdGhpcy5lbWl0dGVyID0gbmV3IEVtaXR0ZXIoKVxuICAgIHRoaXMuZGlzcG9zYWJsZXMuYWRkKHRoaXMuZW1pdHRlcilcbiAgICB0aGlzLmluaXRpYWxVcGRhdGVQcm9taXNlID0gdGhpcy51cGRhdGUocm9vdERpcilcbiAgICB0aGlzLnRpbWVvdXQgPSBzZXRUaW1lb3V0KHRoaXMuZGVzdHJveS5iaW5kKHRoaXMpLCB0aGlzLmludmFsaWRhdGVJbnRlcnZhbClcbiAgICB0aGlzLmRpc3Bvc2FibGVzLmFkZCh0aGlzLnByb2Nlc3Mub25EaWREZXN0cm95KHRoaXMuZGVzdHJveS5iaW5kKHRoaXMpKSlcbiAgfVxuXG4gIHB1YmxpYyBkZXN0cm95KCkge1xuICAgIFV0aWwuZGVidWcoYCR7dGhpcy5uYW1lfSBkZXN0cm95ZWRgKVxuICAgIGNsZWFyVGltZW91dCh0aGlzLnRpbWVvdXQpXG4gICAgdGhpcy5lbWl0dGVyLmVtaXQoJ2RpZC1kZXN0cm95JywgdW5kZWZpbmVkKVxuICAgIHRoaXMuZGlzcG9zYWJsZXMuZGlzcG9zZSgpXG4gIH1cblxuICBwdWJsaWMgb25EaWREZXN0cm95KGNhbGxiYWNrOiAoKSA9PiB2b2lkKSB7XG4gICAgcmV0dXJuIHRoaXMuZW1pdHRlci5vbignZGlkLWRlc3Ryb3knLCBjYWxsYmFjaylcbiAgfVxuXG4gIHB1YmxpYyBhc3luYyBzZXRCdWZmZXIoYnVmZmVySW5mbzogQnVmZmVySW5mbykge1xuICAgIGNvbnN0IG5hbWUgPSBhd2FpdCBidWZmZXJJbmZvLmdldE1vZHVsZU5hbWUoKVxuICAgIGlmIChuYW1lICE9PSB0aGlzLm5hbWUpIHsgcmV0dXJuIH1cbiAgICBpZiAodGhpcy5idWZmZXJTZXQuaGFzKGJ1ZmZlckluZm8uYnVmZmVyKSkgeyByZXR1cm4gfVxuICAgIHRoaXMuYnVmZmVyU2V0LmFkZChidWZmZXJJbmZvLmJ1ZmZlcilcbiAgICBVdGlsLmRlYnVnKGAke3RoaXMubmFtZX0gYnVmZmVyIGlzIHNldGApXG4gICAgY29uc3QgZGlzcG9zYWJsZXMgPSBuZXcgQ29tcG9zaXRlRGlzcG9zYWJsZSgpXG4gICAgZGlzcG9zYWJsZXMuYWRkKGJ1ZmZlckluZm8uYnVmZmVyLm9uRGlkU2F2ZSgoKSA9PiB7XG4gICAgICBVdGlsLmRlYnVnKGAke3RoaXMubmFtZX0gZGlkLXNhdmUgdHJpZ2dlcmVkYClcbiAgICAgIHRoaXMudXBkYXRlKHRoaXMucm9vdERpcilcbiAgICB9KSlcbiAgICBkaXNwb3NhYmxlcy5hZGQoYnVmZmVySW5mby5idWZmZXIub25EaWREZXN0cm95KCgpID0+IHtcbiAgICAgIGRpc3Bvc2FibGVzLmRpc3Bvc2UoKVxuICAgICAgdGhpcy5idWZmZXJTZXQuZGVsZXRlKGJ1ZmZlckluZm8uYnVmZmVyKVxuICAgICAgdGhpcy5kaXNwb3NhYmxlcy5yZW1vdmUoZGlzcG9zYWJsZXMpXG4gICAgfSkpXG4gICAgdGhpcy5kaXNwb3NhYmxlcy5hZGQoZGlzcG9zYWJsZXMpXG4gIH1cblxuICBwdWJsaWMgc2VsZWN0KGltcG9ydERlc2M6IElJbXBvcnQsIHN5bWJvbFR5cGVzPzogU3ltYm9sVHlwZVtdLCBza2lwUXVhbGlmaWVkOiBib29sZWFuID0gZmFsc2UpIHtcbiAgICBjbGVhclRpbWVvdXQodGhpcy50aW1lb3V0KVxuICAgIHRoaXMudGltZW91dCA9IHNldFRpbWVvdXQodGhpcy5kZXN0cm95LmJpbmQodGhpcyksIHRoaXMuaW52YWxpZGF0ZUludGVydmFsKVxuICAgIGxldCBzeW1ib2xzID0gdGhpcy5zeW1ib2xzXG4gICAgaWYgKGltcG9ydERlc2MuaW1wb3J0TGlzdCkge1xuICAgICAgY29uc3QgaWwgPSBpbXBvcnREZXNjLmltcG9ydExpc3RcbiAgICAgIHN5bWJvbHMgPSBzeW1ib2xzLmZpbHRlcigocykgPT4ge1xuICAgICAgICBjb25zdCBpbkltcG9ydExpc3QgPSBpbC5pbmNsdWRlcyhzLm5hbWUpXG4gICAgICAgIGNvbnN0IHBhcmVudEluSW1wb3J0TGlzdCA9IGlsLnNvbWUoKGkpID0+ICh0eXBlb2YgaSAhPT0gJ3N0cmluZycpICYmIChzLnBhcmVudCA9PT0gaS5wYXJlbnQpKVxuICAgICAgICBjb25zdCBzaG91bGRTaG93ID0gaW5JbXBvcnRMaXN0IHx8IHBhcmVudEluSW1wb3J0TGlzdFxuICAgICAgICByZXR1cm4gaW1wb3J0RGVzYy5oaWRpbmcgIT09IHNob3VsZFNob3cgLy8gWE9SXG4gICAgICB9KVxuICAgIH1cbiAgICBjb25zdCByZXMgPSBbXVxuICAgIGZvciAoY29uc3Qgc3ltYm9sIG9mIHN5bWJvbHMpIHtcbiAgICAgIGlmIChzeW1ib2xUeXBlcyAmJiAhc3ltYm9sVHlwZXMuaW5jbHVkZXMoc3ltYm9sLnN5bWJvbFR5cGUpKSB7IGNvbnRpbnVlIH1cbiAgICAgIGNvbnN0IHNwZWNpZmljID0ge1xuICAgICAgICBuYW1lOiBzeW1ib2wubmFtZSxcbiAgICAgICAgdHlwZVNpZ25hdHVyZTogc3ltYm9sLnR5cGVTaWduYXR1cmUsXG4gICAgICAgIHN5bWJvbFR5cGU6IHN5bWJvbC5zeW1ib2xUeXBlLFxuICAgICAgICBtb2R1bGU6IGltcG9ydERlc2MsXG4gICAgICB9XG4gICAgICBjb25zdCBxbiA9IChuOiBzdHJpbmcpID0+IGAke2ltcG9ydERlc2MuYWxpYXMgfHwgaW1wb3J0RGVzYy5uYW1lfS4ke259YFxuICAgICAgaWYgKCFza2lwUXVhbGlmaWVkKSB7XG4gICAgICAgIHJlcy5wdXNoKHtcbiAgICAgICAgICAuLi5zcGVjaWZpYyxcbiAgICAgICAgICBxcGFyZW50OiBzeW1ib2wucGFyZW50ID8gcW4oc3ltYm9sLnBhcmVudCkgOiB1bmRlZmluZWQsXG4gICAgICAgICAgcW5hbWU6IHFuKHN5bWJvbC5uYW1lKSxcbiAgICAgICAgfSlcbiAgICAgIH1cbiAgICAgIGlmICghaW1wb3J0RGVzYy5xdWFsaWZpZWQpIHtcbiAgICAgICAgcmVzLnB1c2goe1xuICAgICAgICAgIC4uLnNwZWNpZmljLFxuICAgICAgICAgIHFwYXJlbnQ6IHN5bWJvbC5wYXJlbnQsXG4gICAgICAgICAgcW5hbWU6IHN5bWJvbC5uYW1lLFxuICAgICAgICB9KVxuICAgICAgfVxuICAgIH1cbiAgICByZXR1cm4gcmVzXG4gIH1cblxuICBwcml2YXRlIGFzeW5jIHVwZGF0ZShyb290RGlyOiBBdG9tVHlwZXMuRGlyZWN0b3J5KSB7XG4gICAgVXRpbC5kZWJ1ZyhgJHt0aGlzLm5hbWV9IHVwZGF0aW5nYClcbiAgICB0aGlzLnN5bWJvbHMgPSBhd2FpdCB0aGlzLnByb2Nlc3MucnVuQnJvd3NlKHJvb3REaXIsIFt0aGlzLm5hbWVdKVxuICAgIFV0aWwuZGVidWcoYCR7dGhpcy5uYW1lfSB1cGRhdGVkYClcbiAgfVxufVxuIl19