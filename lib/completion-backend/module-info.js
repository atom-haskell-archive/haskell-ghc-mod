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
        this.invalidateInterval = 30 * 60 * 1000;
        Util.debug(`${this.name} created`);
        this.symbols = [];
        this.disposables = new atom_1.CompositeDisposable();
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
    setBuffer(bufferInfo, rootDir) {
        return __awaiter(this, void 0, void 0, function* () {
            const bufferRootDir = (yield this.process.getRootDir(bufferInfo.buffer)) || (yield Util.getRootDir(bufferInfo.buffer));
            if (rootDir.getPath() !== bufferRootDir.getPath()) {
                return;
            }
            const name = yield bufferInfo.getModuleName();
            if (name !== this.name) {
                Util.debug(`${this.name} moduleName mismatch: ${name} != ${this.name}`);
                return;
            }
            Util.debug(`${this.name} buffer is set`);
            this.disposables.add(bufferInfo.onDidSave(() => {
                Util.debug(`${this.name} did-save triggered`);
                this.update(rootDir);
            }));
            this.disposables.add(bufferInfo.onDidDestroy(this.unsetBuffer.bind(this)));
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
                symbolType: (symbol.symbolType === 'function') && (Util.isUpperCase(symbol.name[0]))
                    ? 'tag'
                    : symbol.symbolType,
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
    unsetBuffer() {
        this.disposables.dispose();
        this.disposables = new atom_1.CompositeDisposable();
    }
}
exports.ModuleInfo = ModuleInfo;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibW9kdWxlLWluZm8uanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi9zcmMvY29tcGxldGlvbi1iYWNrZW5kL21vZHVsZS1pbmZvLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7Ozs7Ozs7Ozs7QUFVQSwrQkFBbUQ7QUFDbkQsZ0NBQStCO0FBSy9CO0lBUUUsWUFBcUIsSUFBWSxFQUFVLE9BQXVCLEVBQUUsT0FBNEI7UUFBM0UsU0FBSSxHQUFKLElBQUksQ0FBUTtRQUFVLFlBQU8sR0FBUCxPQUFPLENBQWdCO1FBRjFELHVCQUFrQixHQUFHLEVBQUUsR0FBRyxFQUFFLEdBQUcsSUFBSSxDQUFBO1FBR3pDLElBQUksQ0FBQyxLQUFLLENBQUMsR0FBRyxJQUFJLENBQUMsSUFBSSxVQUFVLENBQUMsQ0FBQTtRQUNsQyxJQUFJLENBQUMsT0FBTyxHQUFHLEVBQUUsQ0FBQTtRQUNqQixJQUFJLENBQUMsV0FBVyxHQUFHLElBQUksMEJBQW1CLEVBQUUsQ0FBQTtRQUM1QyxJQUFJLENBQUMsT0FBTyxHQUFHLElBQUksY0FBTyxFQUFFLENBQUE7UUFDNUIsSUFBSSxDQUFDLFdBQVcsQ0FBQyxHQUFHLENBQUMsSUFBSSxDQUFDLE9BQU8sQ0FBQyxDQUFBO1FBQ2xDLElBQUksQ0FBQyxvQkFBb0IsR0FBRyxJQUFJLENBQUMsTUFBTSxDQUFDLE9BQU8sQ0FBQyxDQUFBO1FBQ2hELElBQUksQ0FBQyxPQUFPLEdBQUcsVUFBVSxDQUFDLElBQUksQ0FBQyxPQUFPLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxFQUFFLElBQUksQ0FBQyxrQkFBa0IsQ0FBQyxDQUFBO1FBQzNFLElBQUksQ0FBQyxXQUFXLENBQUMsR0FBRyxDQUFDLElBQUksQ0FBQyxPQUFPLENBQUMsWUFBWSxDQUFDLElBQUksQ0FBQyxPQUFPLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsQ0FBQTtJQUMxRSxDQUFDO0lBRU0sT0FBTztRQUNaLElBQUksQ0FBQyxLQUFLLENB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Q0FBRSxVQUFVLENBQUMsU0FBUyxDQUFDLENBQUMsQ0FBQztnQkFDM0IsR0FBRyxDQUFDLElBQUksbUJBQ0gsUUFBUSxJQUNYLE9BQU8sRUFBRSxNQUFNLENBQUMsTUFBTSxFQUN0QixLQUFLLEVBQUUsTUFBTSxDQUFDLElBQUksSUFDbEIsQ0FBQTtZQUNKLENBQUM7UUFDSCxDQUFDO1FBQ0QsTUFBTSxDQUFDLEdBQUcsQ0FBQTtJQUNaLENBQUM7SUFFYSxNQUFNLENBQUUsT0FBNEI7O1lBQ2hELElBQUksQ0FBQyxLQUFLLENBQUMsR0FBRyxJQUFJLENBQUMsSUFBSSxXQUFXLENBQUMsQ0FBQTtZQUNuQyxJQUFJLENBQUMsT0FBTyxHQUFHLE1BQU0sSUFBSSxDQUFDLE9BQU8sQ0FBQyxTQUFTLENBQUMsT0FBTyxFQUFFLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUE7WUFDakUsSUFBSSxDQUFDLEtBQUssQ0FBQyxHQUFHLElBQUksQ0FBQyxJQUFJLFVBQVUsQ0FBQyxDQUFBO1FBQ3BDLENBQUM7S0FBQTtJQUVPLFdBQVc7UUFDakIsSUFBSSxDQUFDLFdBQVcsQ0FBQyxPQUFPLEVBQUUsQ0FBQTtRQUMxQixJQUFJLENBQUMsV0FBVyxHQUFHLElBQUksMEJBQW1CLEVBQUUsQ0FBQTtJQUM5QyxDQUFDO0NBQ0Y7QUFwR0QsZ0NBb0dDIiwic291cmNlc0NvbnRlbnQiOlsiLypcbiAqIGRlY2FmZmVpbmF0ZSBzdWdnZXN0aW9uczpcbiAqIERTMTAxOiBSZW1vdmUgdW5uZWNlc3NhcnkgdXNlIG9mIEFycmF5LmZyb21cbiAqIERTMTAyOiBSZW1vdmUgdW5uZWNlc3NhcnkgY29kZSBjcmVhdGVkIGJlY2F1c2Ugb2YgaW1wbGljaXQgcmV0dXJuc1xuICogRFMxMDM6IFJld3JpdGUgY29kZSB0byBubyBsb25nZXIgdXNlIF9fZ3VhcmRfX1xuICogRFMxMDQ6IEF2b2lkIGlubGluZSBhc3NpZ25tZW50c1xuICogRFMyMDY6IENvbnNpZGVyIHJld29ya2luZyBjbGFzc2VzIHRvIGF2b2lkIGluaXRDbGFzc1xuICogRFMyMDc6IENvbnNpZGVyIHNob3J0ZXIgdmFyaWF0aW9ucyBvZiBudWxsIGNoZWNrc1xuICogRnVsbCBkb2NzOiBodHRwczovL2dpdGh1Yi5jb20vZGVjYWZmZWluYXRlL2RlY2FmZmVpbmF0ZS9ibG9iL21hc3Rlci9kb2NzL3N1Z2dlc3Rpb25zLm1kXG4gKi9cbmltcG9ydCB7IENvbXBvc2l0ZURpc3Bvc2FibGUsIEVtaXR0ZXIgfSBmcm9tICdhdG9tJ1xuaW1wb3J0ICogYXMgVXRpbCBmcm9tICcuLi91dGlsJ1xuaW1wb3J0IHtHaGNNb2RpUHJvY2Vzc30gZnJvbSAnLi4vZ2hjLW1vZC9naGMtbW9kaS1wcm9jZXNzJ1xuaW1wb3J0IHtCdWZmZXJJbmZvLCBJSW1wb3J0fSBmcm9tICcuL2J1ZmZlci1pbmZvJ1xuaW1wb3J0IHtTeW1ib2xEZXNjLCBTeW1ib2xUeXBlfSBmcm9tICcuLi9naGMtbW9kL2doYy1tb2RpLXByb2Nlc3MnXG5cbmV4cG9ydCBjbGFzcyBNb2R1bGVJbmZvIHtcbiAgcHVibGljIHJlYWRvbmx5IGluaXRpYWxVcGRhdGVQcm9taXNlOiBQcm9taXNlPHZvaWQ+XG4gIHByaXZhdGUgc3ltYm9sczogU3ltYm9sRGVzY1tdIC8vIG1vZHVsZSBzeW1ib2xzXG4gIHByaXZhdGUgZGlzcG9zYWJsZXM6IENvbXBvc2l0ZURpc3Bvc2FibGVcbiAgcHJpdmF0ZSBlbWl0dGVyOiBFbWl0dGVyXG4gIHByaXZhdGUgdGltZW91dDogTm9kZUpTLlRpbWVyXG4gIHByaXZhdGUgaW52YWxpZGF0ZUludGVydmFsID0gMzAgKiA2MCAqIDEwMDAgLy8gaWYgbW9kdWxlIHVudXNlZCBmb3IgMzAgbWludXRlcywgcmVtb3ZlIGl0XG5cbiAgY29uc3RydWN0b3IgKHByaXZhdGUgbmFtZTogc3RyaW5nLCBwcml2YXRlIHByb2Nlc3M6IEdoY01vZGlQcm9jZXNzLCByb290RGlyOiBBdG9tVHlwZXMuRGlyZWN0b3J5KSB7XG4gICAgVXRpbC5kZWJ1ZyhgJHt0aGlzLm5hbWV9IGNyZWF0ZWRgKVxuICAgIHRoaXMuc3ltYm9scyA9IFtdXG4gICAgdGhpcy5kaXNwb3NhYmxlcyA9IG5ldyBDb21wb3NpdGVEaXNwb3NhYmxlKClcbiAgICB0aGlzLmVtaXR0ZXIgPSBuZXcgRW1pdHRlcigpXG4gICAgdGhpcy5kaXNwb3NhYmxlcy5hZGQodGhpcy5lbWl0dGVyKVxuICAgIHRoaXMuaW5pdGlhbFVwZGF0ZVByb21pc2UgPSB0aGlzLnVwZGF0ZShyb290RGlyKVxuICAgIHRoaXMudGltZW91dCA9IHNldFRpbWVvdXQodGhpcy5kZXN0cm95LmJpbmQodGhpcyksIHRoaXMuaW52YWxpZGF0ZUludGVydmFsKVxuICAgIHRoaXMuZGlzcG9zYWJsZXMuYWRkKHRoaXMucHJvY2Vzcy5vbkRpZERlc3Ryb3kodGhpcy5kZXN0cm95LmJpbmQodGhpcykpKVxuICB9XG5cbiAgcHVibGljIGRlc3Ryb3kgKCkge1xuICAgIFV0aWwuZGVidWcoYCR7dGhpcy5uYW1lfSBkZXN0cm95ZWRgKVxuICAgIGNsZWFyVGltZW91dCh0aGlzLnRpbWVvdXQpXG4gICAgdGhpcy5lbWl0dGVyLmVtaXQoJ2RpZC1kZXN0cm95JylcbiAgICB0aGlzLmRpc3Bvc2FibGVzLmRpc3Bvc2UoKVxuICB9XG5cbiAgcHVibGljIG9uRGlkRGVzdHJveSAoY2FsbGJhY2s6ICgpID0+IHZvaWQpIHtcbiAgICByZXR1cm4gdGhpcy5lbWl0dGVyLm9uKCdkaWQtZGVzdHJveScsIGNhbGxiYWNrKVxuICB9XG5cbiAgcHVibGljIGFzeW5jIHNldEJ1ZmZlciAoYnVmZmVySW5mbzogQnVmZmVySW5mbywgcm9vdERpcjogQXRvbVR5cGVzLkRpcmVjdG9yeSkge1xuICAgIGNvbnN0IGJ1ZmZlclJvb3REaXIgPSBhd2FpdCB0aGlzLnByb2Nlc3MuZ2V0Um9vdERpcihidWZmZXJJbmZvLmJ1ZmZlcikgfHwgYXdhaXQgVXRpbC5nZXRSb290RGlyKGJ1ZmZlckluZm8uYnVmZmVyKVxuICAgIGlmIChyb290RGlyLmdldFBhdGgoKSAhPT0gYnVmZmVyUm9vdERpci5nZXRQYXRoKCkpIHsgcmV0dXJuIH1cbiAgICBjb25zdCBuYW1lID0gYXdhaXQgYnVmZmVySW5mby5nZXRNb2R1bGVOYW1lKClcbiAgICBpZiAobmFtZSAhPT0gdGhpcy5uYW1lKSB7XG4gICAgICBVdGlsLmRlYnVnKGAke3RoaXMubmFtZX0gbW9kdWxlTmFtZSBtaXNtYXRjaDogJHtuYW1lfSAhPSAke3RoaXMubmFtZX1gKVxuICAgICAgcmV0dXJuXG4gICAgfVxuICAgIFV0aWwuZGVidWcoYCR7dGhpcy5uYW1lfSBidWZmZXIgaXMgc2V0YClcbiAgICB0aGlzLmRpc3Bvc2FibGVzLmFkZChidWZmZXJJbmZvLm9uRGlkU2F2ZSgoKSA9PiB7XG4gICAgICBVdGlsLmRlYnVnKGAke3RoaXMubmFtZX0gZGlkLXNhdmUgdHJpZ2dlcmVkYClcbiAgICAgIHRoaXMudXBkYXRlKHJvb3REaXIpXG4gICAgfSkpXG4gICAgdGhpcy5kaXNwb3NhYmxlcy5hZGQoYnVmZmVySW5mby5vbkRpZERlc3Ryb3kodGhpcy51bnNldEJ1ZmZlci5iaW5kKHRoaXMpKSlcbiAgfVxuXG4gIHB1YmxpYyBzZWxlY3QgKGltcG9ydERlc2M6IElJbXBvcnQsIHN5bWJvbFR5cGVzPzogU3ltYm9sVHlwZVtdLCBza2lwUXVhbGlmaWVkOiBib29sZWFuID0gZmFsc2UpIHtcbiAgICBjbGVhclRpbWVvdXQodGhpcy50aW1lb3V0KVxuICAgIHRoaXMudGltZW91dCA9IHNldFRpbWVvdXQodGhpcy5kZXN0cm95LmJpbmQodGhpcyksIHRoaXMuaW52YWxpZGF0ZUludGVydmFsKVxuICAgIGxldCBzeW1ib2xzID0gdGhpcy5zeW1ib2xzXG4gICAgaWYgKGltcG9ydERlc2MuaW1wb3J0TGlzdCkge1xuICAgICAgY29uc3QgaWwgPSBpbXBvcnREZXNjLmltcG9ydExpc3RcbiAgICAgIHN5bWJvbHMgPSBzeW1ib2xzLmZpbHRlcigocykgPT4ge1xuICAgICAgICBjb25zdCBpbkltcG9ydExpc3QgPSBpbC5pbmNsdWRlcyhzLm5hbWUpXG4gICAgICAgIGNvbnN0IHBhcmVudEluSW1wb3J0TGlzdCA9IGlsLnNvbWUoKGkpID0+ICh0eXBlb2YgaSAhPT0gJ3N0cmluZycpICYmIChzLnBhcmVudCA9PT0gaS5wYXJlbnQpKVxuICAgICAgICBjb25zdCBzaG91bGRTaG93ID0gaW5JbXBvcnRMaXN0IHx8IHBhcmVudEluSW1wb3J0TGlzdFxuICAgICAgICByZXR1cm4gaW1wb3J0RGVzYy5oaWRpbmcgIT09IHNob3VsZFNob3cgLy8gWE9SXG4gICAgICB9KVxuICAgIH1cbiAgICBjb25zdCByZXMgPSBbXVxuICAgIGZvciAoY29uc3Qgc3ltYm9sIG9mIHN5bWJvbHMpIHtcbiAgICAgIGlmIChzeW1ib2xUeXBlcyAmJiAhc3ltYm9sVHlwZXMuaW5jbHVkZXMoc3ltYm9sLnN5bWJvbFR5cGUpKSB7IGNvbnRpbnVlIH1cbiAgICAgIGNvbnN0IHNwZWNpZmljID0ge1xuICAgICAgICBuYW1lOiBzeW1ib2wubmFtZSxcbiAgICAgICAgdHlwZVNpZ25hdHVyZTogc3ltYm9sLnR5cGVTaWduYXR1cmUsXG4gICAgICAgIHN5bWJvbFR5cGU6XG4gICAgICAgICAgKHN5bWJvbC5zeW1ib2xUeXBlID09PSAnZnVuY3Rpb24nKSAmJiAoVXRpbC5pc1VwcGVyQ2FzZShzeW1ib2wubmFtZVswXSkpXG4gICAgICAgICAgPyAndGFnJ1xuICAgICAgICAgIDogc3ltYm9sLnN5bWJvbFR5cGUsXG4gICAgICAgIG1vZHVsZTogaW1wb3J0RGVzY1xuICAgICAgfVxuICAgICAgY29uc3QgcW4gPSAobjogc3RyaW5nKSA9PiBgJHtpbXBvcnREZXNjLmFsaWFzIHx8IGltcG9ydERlc2MubmFtZX0uJHtufWBcbiAgICAgIGlmICghc2tpcFF1YWxpZmllZCkge1xuICAgICAgICByZXMucHVzaCh7XG4gICAgICAgICAgLi4uc3BlY2lmaWMsXG4gICAgICAgICAgcXBhcmVudDogc3ltYm9sLnBhcmVudCA/IHFuKHN5bWJvbC5wYXJlbnQpIDogdW5kZWZpbmVkLFxuICAgICAgICAgIHFuYW1lOiBxbihzeW1ib2wubmFtZSlcbiAgICAgICAgfSlcbiAgICAgIH1cbiAgICAgIGlmICghIGltcG9ydERlc2MucXVhbGlmaWVkKSB7XG4gICAgICAgIHJlcy5wdXNoKHtcbiAgICAgICAgICAuLi5zcGVjaWZpYyxcbiAgICAgICAgICBxcGFyZW50OiBzeW1ib2wucGFyZW50LFxuICAgICAgICAgIHFuYW1lOiBzeW1ib2wubmFtZVxuICAgICAgICB9KVxuICAgICAgfVxuICAgIH1cbiAgICByZXR1cm4gcmVzXG4gIH1cblxuICBwcml2YXRlIGFzeW5jIHVwZGF0ZSAocm9vdERpcjogQXRvbVR5cGVzLkRpcmVjdG9yeSkge1xuICAgIFV0aWwuZGVidWcoYCR7dGhpcy5uYW1lfSB1cGRhdGluZ2ApXG4gICAgdGhpcy5zeW1ib2xzID0gYXdhaXQgdGhpcy5wcm9jZXNzLnJ1bkJyb3dzZShyb290RGlyLCBbdGhpcy5uYW1lXSlcbiAgICBVdGlsLmRlYnVnKGAke3RoaXMubmFtZX0gdXBkYXRlZGApXG4gIH1cblxuICBwcml2YXRlIHVuc2V0QnVmZmVyICgpIHtcbiAgICB0aGlzLmRpc3Bvc2FibGVzLmRpc3Bvc2UoKVxuICAgIHRoaXMuZGlzcG9zYWJsZXMgPSBuZXcgQ29tcG9zaXRlRGlzcG9zYWJsZSgpXG4gIH1cbn1cbiJdfQ==