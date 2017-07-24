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
        this.disposables.add(this.buffer.onDidDestroy(this.destroy.bind(this)));
    }
    destroy() {
        this.disposables.dispose();
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYnVmZmVyLWluZm8uanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi9zcmMvY29tcGxldGlvbi1iYWNrZW5kL2J1ZmZlci1pbmZvLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7Ozs7Ozs7Ozs7QUFBQSwrQkFBMEM7QUFDMUMsMkRBQWtGO0FBSWxGO0lBS0UsWUFBNkIsTUFBNEI7UUFBNUIsV0FBTSxHQUFOLE1BQU0sQ0FBc0I7UUFIakQsWUFBTyxHQUFXLEVBQUUsQ0FBQTtRQUNwQixlQUFVLEdBQW1CLEVBQUUsSUFBSSxFQUFFLE1BQU0sRUFBRSxPQUFPLEVBQUUsRUFBRSxFQUFFLENBQUE7UUFHaEUsSUFBSSxDQUFDLFdBQVcsR0FBRyxJQUFJLDBCQUFtQixFQUFFLENBQUE7UUFDNUMsSUFBSSxDQUFDLFdBQVcsQ0FBQyxHQUFHLENBQUMsSUFBSSxDQUFDLE1BQU0sQ0FBQyxZQUFZLENBQUMsSUFBSSxDQUFDLE9BQU8sQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxDQUFBO0lBQ3pFLENBQUM7SUFFTSxPQUFPO1FBQ1osSUFBSSxDQUFDLFdBQVcsQ0FBQyxPQUFPLEVBQUUsQ0FBQTtJQUM1QixDQUFDO0lBRVksVUFBVTs7WUFDckIsTUFBTSxNQUFNLEdBQUcsTUFBTSxJQUFJLENBQUMsS0FBSyxFQUFFLENBQUE7WUFDakMsTUFBTSxPQUFPLEdBQUcsTUFBTSxHQUFHLE1BQU0sQ0FBQyxPQUFPLEdBQUcsRUFBRSxDQUFBO1lBRTVDLEVBQUUsQ0FBQyxDQUFDLENBQUMsT0FBTyxDQUFDLElBQUksQ0FBQyxDQUFDLEVBQUMsSUFBSSxFQUFDLEtBQUssSUFBSSxLQUFLLFNBQVMsQ0FBQyxDQUFDLENBQUMsQ0FBQztnQkFDbEQsT0FBTyxDQUFDLElBQUksQ0FBQztvQkFDWCxTQUFTLEVBQUUsS0FBSztvQkFDaEIsTUFBTSxFQUFFLEtBQUs7b0JBQ2IsSUFBSSxFQUFFLFNBQVM7b0JBQ2YsVUFBVSxFQUFFLElBQUk7b0JBQ2hCLEtBQUssRUFBRSxJQUFJO2lCQUNaLENBQUMsQ0FBQTtZQUNKLENBQUM7WUFFRCxNQUFNLENBQUMsT0FBTyxDQUFBO1FBQ2hCLENBQUM7S0FBQTtJQUVZLGFBQWE7O1lBQ3hCLE1BQU0sTUFBTSxHQUFHLE1BQU0sSUFBSSxDQUFDLEtBQUssRUFBRSxDQUFBO1lBQ2pDLE1BQU0sQ0FBQyxNQUFNLENBQUMsSUFBSSxDQUFBO1FBQ3BCLENBQUM7S0FBQTtJQUVhLEtBQUs7O1lBQ2pCLE1BQU0sT0FBTyxHQUFHLElBQUksQ0FBQyxNQUFNLENBQUMsT0FBTyxFQUFFLENBQUE7WUFDckMsRUFBRSxDQUFDLENBQUMsSUFBSSxDQUFDLE9BQU8sS0FBSyxPQUFPLENBQUMsQ0FBQyxDQUFDO2dCQUM3QixNQUFNLENBQUMsSUFBSSxDQUFDLFVBQVUsQ0FBQTtZQUN4QixDQUFDO1lBQUMsSUFBSSxDQUFDLENBQUM7Z0JBQ04sSUFBSSxDQUFDLE9BQU8sR0FBRyxPQUFPLENBQUE7Z0JBQ3RCLElBQUksQ0FBQyxVQUFVLEdBQUcsTUFBTSx5Q0FBb0IsQ0FBQyxJQUFJLENBQUMsTUFBTSxDQUFDLE9BQU8sRUFBRSxDQUFDLENBQUE7Z0JBQ25FLE1BQU0sQ0FBQyxJQUFJLENBQUMsVUFBVSxDQUFBO1lBQ3hCLENBQUM7UUFDSCxDQUFDO0tBQUE7Q0FDRjtBQTlDRCxnQ0E4Q0MiLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgeyBDb21wb3NpdGVEaXNwb3NhYmxlIH0gZnJvbSAnYXRvbSdcbmltcG9ydCB7IHBhcnNlSHNNb2R1bGVJbXBvcnRzLCBJTW9kdWxlSW1wb3J0cywgSUltcG9ydCB9IGZyb20gJ2F0b20taGFza2VsbC11dGlscydcblxuZXhwb3J0IHtJSW1wb3J0fVxuXG5leHBvcnQgY2xhc3MgQnVmZmVySW5mbyB7XG4gIHByaXZhdGUgZGlzcG9zYWJsZXM6IENvbXBvc2l0ZURpc3Bvc2FibGVcbiAgcHJpdmF0ZSBvbGRUZXh0OiBzdHJpbmcgPSAnJ1xuICBwcml2YXRlIG9sZEltcG9ydHM6IElNb2R1bGVJbXBvcnRzID0geyBuYW1lOiAnTWFpbicsIGltcG9ydHM6IFtdIH1cblxuICBjb25zdHJ1Y3RvciAocHVibGljIHJlYWRvbmx5IGJ1ZmZlcjogQXRvbVR5cGVzLlRleHRCdWZmZXIpIHtcbiAgICB0aGlzLmRpc3Bvc2FibGVzID0gbmV3IENvbXBvc2l0ZURpc3Bvc2FibGUoKVxuICAgIHRoaXMuZGlzcG9zYWJsZXMuYWRkKHRoaXMuYnVmZmVyLm9uRGlkRGVzdHJveSh0aGlzLmRlc3Ryb3kuYmluZCh0aGlzKSkpXG4gIH1cblxuICBwdWJsaWMgZGVzdHJveSAoKSB7XG4gICAgdGhpcy5kaXNwb3NhYmxlcy5kaXNwb3NlKClcbiAgfVxuXG4gIHB1YmxpYyBhc3luYyBnZXRJbXBvcnRzICgpOiBQcm9taXNlPElJbXBvcnRbXT4ge1xuICAgIGNvbnN0IHBhcnNlZCA9IGF3YWl0IHRoaXMucGFyc2UoKVxuICAgIGNvbnN0IGltcG9ydHMgPSBwYXJzZWQgPyBwYXJzZWQuaW1wb3J0cyA6IFtdXG4gICAgLy8gdHNsaW50OmRpc2FibGU6IG5vLW51bGwta2V5d29yZFxuICAgIGlmICghaW1wb3J0cy5zb21lKCh7bmFtZX0pID0+IG5hbWUgPT09ICdQcmVsdWRlJykpIHtcbiAgICAgIGltcG9ydHMucHVzaCh7XG4gICAgICAgIHF1YWxpZmllZDogZmFsc2UsXG4gICAgICAgIGhpZGluZzogZmFsc2UsXG4gICAgICAgIG5hbWU6ICdQcmVsdWRlJyxcbiAgICAgICAgaW1wb3J0TGlzdDogbnVsbCxcbiAgICAgICAgYWxpYXM6IG51bGxcbiAgICAgIH0pXG4gICAgfVxuICAgIC8vIHRzbGludDplbmFibGU6IG5vLW51bGwta2V5d29yZFxuICAgIHJldHVybiBpbXBvcnRzXG4gIH1cblxuICBwdWJsaWMgYXN5bmMgZ2V0TW9kdWxlTmFtZSAoKTogUHJvbWlzZTxzdHJpbmc+IHtcbiAgICBjb25zdCBwYXJzZWQgPSBhd2FpdCB0aGlzLnBhcnNlKClcbiAgICByZXR1cm4gcGFyc2VkLm5hbWVcbiAgfVxuXG4gIHByaXZhdGUgYXN5bmMgcGFyc2UgKCk6IFByb21pc2U8SU1vZHVsZUltcG9ydHM+IHtcbiAgICBjb25zdCBuZXdUZXh0ID0gdGhpcy5idWZmZXIuZ2V0VGV4dCgpXG4gICAgaWYgKHRoaXMub2xkVGV4dCA9PT0gbmV3VGV4dCkge1xuICAgICAgcmV0dXJuIHRoaXMub2xkSW1wb3J0c1xuICAgIH0gZWxzZSB7XG4gICAgICB0aGlzLm9sZFRleHQgPSBuZXdUZXh0XG4gICAgICB0aGlzLm9sZEltcG9ydHMgPSBhd2FpdCBwYXJzZUhzTW9kdWxlSW1wb3J0cyh0aGlzLmJ1ZmZlci5nZXRUZXh0KCkpXG4gICAgICByZXR1cm4gdGhpcy5vbGRJbXBvcnRzXG4gICAgfVxuICB9XG59XG4iXX0=