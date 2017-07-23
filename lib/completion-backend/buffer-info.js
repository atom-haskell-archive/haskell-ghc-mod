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
const atom_haskell_utils_1 = require("atom-haskell-utils");
class BufferInfo {
    constructor(buffer) {
        this.buffer = buffer;
        this.oldText = '';
        this.oldImports = { name: 'Main', imports: [] };
        this.disposables = new atom_1.CompositeDisposable();
        this.emitter = new atom_1.Emitter();
        this.disposables.add(this.emitter);
        this.disposables.add(this.buffer.onDidDestroy(this.destroy.bind(this)));
    }
    destroy() {
        this.disposables.dispose();
        this.emitter.emit('did-destroy');
    }
    onDidDestroy(callback) {
        return this.emitter.on('did-destroy', callback);
    }
    onDidSave(callback) {
        return this.buffer.onDidSave(callback);
    }
    getImports() {
        return __awaiter(this, void 0, void 0, function* () {
            const parsed = yield this.parse();
            const imports = parsed ? parsed.imports : [];
            if (!imports.some(({ name }) => name === 'Prelude')) {
                imports.push({
                    qualified: false,
                    hiding: false,
                    name: 'Prelude',
                    importList: null,
                    alias: null
                });
            }
            return imports;
        });
    }
    getModuleName() {
        return __awaiter(this, void 0, void 0, function* () {
            const parsed = yield this.parse();
            return parsed.name;
        });
    }
    parse() {
        return __awaiter(this, void 0, void 0, function* () {
            const newText = this.buffer.getText();
            if (this.oldText === newText) {
                return this.oldImports;
            }
            else {
                this.oldText = newText;
                this.oldImports = yield atom_haskell_utils_1.parseHsModuleImports(this.buffer.getText());
                return this.oldImports;
            }
        });
    }
}
exports.BufferInfo = BufferInfo;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYnVmZmVyLWluZm8uanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi9zcmMvY29tcGxldGlvbi1iYWNrZW5kL2J1ZmZlci1pbmZvLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7Ozs7Ozs7Ozs7QUFPQSwrQkFBK0Q7QUFDL0QsMkRBQWtGO0FBSWxGO0lBTUUsWUFBb0IsTUFBNEI7UUFBNUIsV0FBTSxHQUFOLE1BQU0sQ0FBc0I7UUFIeEMsWUFBTyxHQUFXLEVBQUUsQ0FBQTtRQUNwQixlQUFVLEdBQW1CLEVBQUUsSUFBSSxFQUFFLE1BQU0sRUFBRSxPQUFPLEVBQUUsRUFBRSxFQUFFLENBQUE7UUFHaEUsSUFBSSxDQUFDLFdBQVcsR0FBRyxJQUFJLDBCQUFtQixFQUFFLENBQUE7UUFDNUMsSUFBSSxDQUFDLE9BQU8sR0FBRyxJQUFJLGNBQU8sRUFBRSxDQUFBO1FBQzVCLElBQUksQ0FBQyxXQUFXLENBQUMsR0FBRyxDQUFDLElBQUksQ0FBQyxPQUFPLENBQUMsQ0FBQTtRQUVsQyxJQUFJLENBQUMsV0FBVyxDQUFDLEdBQUcsQ0FBQyxJQUFJLENBQUMsTUFBTSxDQUFDLFlBQVksQ0FBQyxJQUFJLENBQUMsT0FBTyxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLENBQUE7SUFDekUsQ0FBQztJQUVNLE9BQU87UUFDWixJQUFJLENBQUMsV0FBVyxDQUFDLE9BQU8sRUFBRSxDQUFBO1FBQzFCLElBQUksQ0FBQyxPQUFPLENBQUMsSUFBSSxDQUFDLGFBQWEsQ0FBQyxDQUFBO0lBQ2xDLENBQUM7SUFFTSxZQUFZLENBQUUsUUFBb0I7UUFDdkMsTUFBTSxDQUFDLElBQUksQ0FBQyxPQUFPLENBQUMsRUFBRSxDQUFDLGFBQWEsRUFBRSxRQUFRLENBQUMsQ0FBQTtJQUNqRCxDQUFDO0lBRU0sU0FBUyxDQUFFLFFBQW9CO1FBQ3BDLE1BQU0sQ0FBQyxJQUFJLENBQUMsTUFBTSxDQUFDLFNBQVMsQ0FBQyxRQUFRLENBQUMsQ0FBQTtJQUN4QyxDQUFDO0lBRVksVUFBVTs7WUFDckIsTUFBTSxNQUFNLEdBQUcsTUFBTSxJQUFJLENBQUMsS0FBSyxFQUFFLENBQUE7WUFDakMsTUFBTSxPQUFPLEdBQUcsTUFBTSxHQUFHLE1BQU0sQ0FBQyxPQUFPLEdBQUcsRUFBRSxDQUFBO1lBRTVDLEVBQUUsQ0FBQyxDQUFDLENBQUMsT0FBTyxDQUFDLElBQUksQ0FBQyxDQUFDLEVBQUMsSUFBSSxFQUFDLEtBQUssSUFBSSxLQUFLLFNBQVMsQ0FBQyxDQUFDLENBQUMsQ0FBQztnQkFDbEQsT0FBTyxDQUFDLElBQUksQ0FBQztvQkFDWCxTQUFTLEVBQUUsS0FBSztvQkFDaEIsTUFBTSxFQUFFLEtBQUs7b0JBQ2IsSUFBSSxFQUFFLFNBQVM7b0JBQ2YsVUFBVSxFQUFFLElBQUk7b0JBQ2hCLEtBQUssRUFBRSxJQUFJO2lCQUNaLENBQUMsQ0FBQTtZQUNKLENBQUM7WUFFRCxNQUFNLENBQUMsT0FBTyxDQUFBO1FBQ2hCLENBQUM7S0FBQTtJQUVZLGFBQWE7O1lBQ3hCLE1BQU0sTUFBTSxHQUFHLE1BQU0sSUFBSSxDQUFDLEtBQUssRUFBRSxDQUFBO1lBQ2pDLE1BQU0sQ0FBQyxNQUFNLENBQUMsSUFBSSxDQUFBO1FBQ3BCLENBQUM7S0FBQTtJQUVhLEtBQUs7O1lBQ2pCLE1BQU0sT0FBTyxHQUFHLElBQUksQ0FBQyxNQUFNLENBQUMsT0FBTyxFQUFFLENBQUE7WUFDckMsRUFBRSxDQUFDLENBQUMsSUFBSSxDQUFDLE9BQU8sS0FBSyxPQUFPLENBQUMsQ0FBQyxDQUFDO2dCQUM3QixNQUFNLENBQUMsSUFBSSxDQUFDLFVBQVUsQ0FBQTtZQUN4QixDQUFDO1lBQUMsSUFBSSxDQUFDLENBQUM7Z0JBQ04sSUFBSSxDQUFDLE9BQU8sR0FBRyxPQUFPLENBQUE7Z0JBQ3RCLElBQUksQ0FBQyxVQUFVLEdBQUcsTUFBTSx5Q0FBb0IsQ0FBQyxJQUFJLENBQUMsTUFBTSxDQUFDLE9BQU8sRUFBRSxDQUFDLENBQUE7Z0JBQ25FLE1BQU0sQ0FBQyxJQUFJLENBQUMsVUFBVSxDQUFBO1lBQ3hCLENBQUM7UUFDSCxDQUFDO0tBQUE7Q0FDRjtBQTNERCxnQ0EyREMiLCJzb3VyY2VzQ29udGVudCI6WyIvKlxuICogZGVjYWZmZWluYXRlIHN1Z2dlc3Rpb25zOlxuICogRFMxMDI6IFJlbW92ZSB1bm5lY2Vzc2FyeSBjb2RlIGNyZWF0ZWQgYmVjYXVzZSBvZiBpbXBsaWNpdCByZXR1cm5zXG4gKiBEUzIwNjogQ29uc2lkZXIgcmV3b3JraW5nIGNsYXNzZXMgdG8gYXZvaWQgaW5pdENsYXNzXG4gKiBEUzIwNzogQ29uc2lkZXIgc2hvcnRlciB2YXJpYXRpb25zIG9mIG51bGwgY2hlY2tzXG4gKiBGdWxsIGRvY3M6IGh0dHBzOi8vZ2l0aHViLmNvbS9kZWNhZmZlaW5hdGUvZGVjYWZmZWluYXRlL2Jsb2IvbWFzdGVyL2RvY3Mvc3VnZ2VzdGlvbnMubWRcbiAqL1xuaW1wb3J0IHsgQ29tcG9zaXRlRGlzcG9zYWJsZSwgRW1pdHRlciwgRGlzcG9zYWJsZSB9IGZyb20gJ2F0b20nXG5pbXBvcnQgeyBwYXJzZUhzTW9kdWxlSW1wb3J0cywgSU1vZHVsZUltcG9ydHMsIElJbXBvcnQgfSBmcm9tICdhdG9tLWhhc2tlbGwtdXRpbHMnXG5cbmV4cG9ydCB7SUltcG9ydH1cblxuZXhwb3J0IGNsYXNzIEJ1ZmZlckluZm8ge1xuICBwcml2YXRlIGVtaXR0ZXI6IEVtaXR0ZXJcbiAgcHJpdmF0ZSBkaXNwb3NhYmxlczogQ29tcG9zaXRlRGlzcG9zYWJsZVxuICBwcml2YXRlIG9sZFRleHQ6IHN0cmluZyA9ICcnXG4gIHByaXZhdGUgb2xkSW1wb3J0czogSU1vZHVsZUltcG9ydHMgPSB7IG5hbWU6ICdNYWluJywgaW1wb3J0czogW10gfVxuXG4gIGNvbnN0cnVjdG9yIChwdWJsaWMgYnVmZmVyOiBBdG9tVHlwZXMuVGV4dEJ1ZmZlcikge1xuICAgIHRoaXMuZGlzcG9zYWJsZXMgPSBuZXcgQ29tcG9zaXRlRGlzcG9zYWJsZSgpXG4gICAgdGhpcy5lbWl0dGVyID0gbmV3IEVtaXR0ZXIoKVxuICAgIHRoaXMuZGlzcG9zYWJsZXMuYWRkKHRoaXMuZW1pdHRlcilcblxuICAgIHRoaXMuZGlzcG9zYWJsZXMuYWRkKHRoaXMuYnVmZmVyLm9uRGlkRGVzdHJveSh0aGlzLmRlc3Ryb3kuYmluZCh0aGlzKSkpXG4gIH1cblxuICBwdWJsaWMgZGVzdHJveSAoKSB7XG4gICAgdGhpcy5kaXNwb3NhYmxlcy5kaXNwb3NlKClcbiAgICB0aGlzLmVtaXR0ZXIuZW1pdCgnZGlkLWRlc3Ryb3knKVxuICB9XG5cbiAgcHVibGljIG9uRGlkRGVzdHJveSAoY2FsbGJhY2s6ICgpID0+IHZvaWQpOiBEaXNwb3NhYmxlIHtcbiAgICByZXR1cm4gdGhpcy5lbWl0dGVyLm9uKCdkaWQtZGVzdHJveScsIGNhbGxiYWNrKVxuICB9XG5cbiAgcHVibGljIG9uRGlkU2F2ZSAoY2FsbGJhY2s6ICgpID0+IHZvaWQpOiBEaXNwb3NhYmxlIHtcbiAgICByZXR1cm4gdGhpcy5idWZmZXIub25EaWRTYXZlKGNhbGxiYWNrKVxuICB9XG5cbiAgcHVibGljIGFzeW5jIGdldEltcG9ydHMgKCk6IFByb21pc2U8SUltcG9ydFtdPiB7XG4gICAgY29uc3QgcGFyc2VkID0gYXdhaXQgdGhpcy5wYXJzZSgpXG4gICAgY29uc3QgaW1wb3J0cyA9IHBhcnNlZCA/IHBhcnNlZC5pbXBvcnRzIDogW11cbiAgICAvLyB0c2xpbnQ6ZGlzYWJsZTogbm8tbnVsbC1rZXl3b3JkXG4gICAgaWYgKCFpbXBvcnRzLnNvbWUoKHtuYW1lfSkgPT4gbmFtZSA9PT0gJ1ByZWx1ZGUnKSkge1xuICAgICAgaW1wb3J0cy5wdXNoKHtcbiAgICAgICAgcXVhbGlmaWVkOiBmYWxzZSxcbiAgICAgICAgaGlkaW5nOiBmYWxzZSxcbiAgICAgICAgbmFtZTogJ1ByZWx1ZGUnLFxuICAgICAgICBpbXBvcnRMaXN0OiBudWxsLFxuICAgICAgICBhbGlhczogbnVsbFxuICAgICAgfSlcbiAgICB9XG4gICAgLy8gdHNsaW50OmVuYWJsZTogbm8tbnVsbC1rZXl3b3JkXG4gICAgcmV0dXJuIGltcG9ydHNcbiAgfVxuXG4gIHB1YmxpYyBhc3luYyBnZXRNb2R1bGVOYW1lICgpOiBQcm9taXNlPHN0cmluZz4ge1xuICAgIGNvbnN0IHBhcnNlZCA9IGF3YWl0IHRoaXMucGFyc2UoKVxuICAgIHJldHVybiBwYXJzZWQubmFtZVxuICB9XG5cbiAgcHJpdmF0ZSBhc3luYyBwYXJzZSAoKTogUHJvbWlzZTxJTW9kdWxlSW1wb3J0cz4ge1xuICAgIGNvbnN0IG5ld1RleHQgPSB0aGlzLmJ1ZmZlci5nZXRUZXh0KClcbiAgICBpZiAodGhpcy5vbGRUZXh0ID09PSBuZXdUZXh0KSB7XG4gICAgICByZXR1cm4gdGhpcy5vbGRJbXBvcnRzXG4gICAgfSBlbHNlIHtcbiAgICAgIHRoaXMub2xkVGV4dCA9IG5ld1RleHRcbiAgICAgIHRoaXMub2xkSW1wb3J0cyA9IGF3YWl0IHBhcnNlSHNNb2R1bGVJbXBvcnRzKHRoaXMuYnVmZmVyLmdldFRleHQoKSlcbiAgICAgIHJldHVybiB0aGlzLm9sZEltcG9ydHNcbiAgICB9XG4gIH1cbn1cbiJdfQ==