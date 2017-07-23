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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYnVmZmVyLWluZm8uanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi9zcmMvY29tcGxldGlvbi1iYWNrZW5kL2J1ZmZlci1pbmZvLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7Ozs7Ozs7Ozs7QUFPQSwrQkFBMEM7QUFDMUMsMkRBQWtGO0FBSWxGO0lBS0UsWUFBNkIsTUFBNEI7UUFBNUIsV0FBTSxHQUFOLE1BQU0sQ0FBc0I7UUFIakQsWUFBTyxHQUFXLEVBQUUsQ0FBQTtRQUNwQixlQUFVLEdBQW1CLEVBQUUsSUFBSSxFQUFFLE1BQU0sRUFBRSxPQUFPLEVBQUUsRUFBRSxFQUFFLENBQUE7UUFHaEUsSUFBSSxDQUFDLFdBQVcsR0FBRyxJQUFJLDBCQUFtQixFQUFFLENBQUE7UUFDNUMsSUFBSSxDQUFDLFdBQVcsQ0FBQyxHQUFHLENBQUMsSUFBSSxDQUFDLE1BQU0sQ0FBQyxZQUFZLENBQUMsSUFBSSxDQUFDLE9BQU8sQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxDQUFBO0lBQ3pFLENBQUM7SUFFTSxPQUFPO1FBQ1osSUFBSSxDQUFDLFdBQVcsQ0FBQyxPQUFPLEVBQUUsQ0FBQTtJQUM1QixDQUFDO0lBRVksVUFBVTs7WUFDckIsTUFBTSxNQUFNLEdBQUcsTUFBTSxJQUFJLENBQUMsS0FBSyxFQUFFLENBQUE7WUFDakMsTUFBTSxPQUFPLEdBQUcsTUFBTSxHQUFHLE1BQU0sQ0FBQyxPQUFPLEdBQUcsRUFBRSxDQUFBO1lBRTVDLEVBQUUsQ0FBQyxDQUFDLENBQUMsT0FBTyxDQUFDLElBQUksQ0FBQyxDQUFDLEVBQUMsSUFBSSxFQUFDLEtBQUssSUFBSSxLQUFLLFNBQVMsQ0FBQyxDQUFDLENBQUMsQ0FBQztnQkFDbEQsT0FBTyxDQUFDLElBQUksQ0FBQztvQkFDWCxTQUFTLEVBQUUsS0FBSztvQkFDaEIsTUFBTSxFQUFFLEtBQUs7b0JBQ2IsSUFBSSxFQUFFLFNBQVM7b0JBQ2YsVUFBVSxFQUFFLElBQUk7b0JBQ2hCLEtBQUssRUFBRSxJQUFJO2lCQUNaLENBQUMsQ0FBQTtZQUNKLENBQUM7WUFFRCxNQUFNLENBQUMsT0FBTyxDQUFBO1FBQ2hCLENBQUM7S0FBQTtJQUVZLGFBQWE7O1lBQ3hCLE1BQU0sTUFBTSxHQUFHLE1BQU0sSUFBSSxDQUFDLEtBQUssRUFBRSxDQUFBO1lBQ2pDLE1BQU0sQ0FBQyxNQUFNLENBQUMsSUFBSSxDQUFBO1FBQ3BCLENBQUM7S0FBQTtJQUVhLEtBQUs7O1lBQ2pCLE1BQU0sT0FBTyxHQUFHLElBQUksQ0FBQyxNQUFNLENBQUMsT0FBTyxFQUFFLENBQUE7WUFDckMsRUFBRSxDQUFDLENBQUMsSUFBSSxDQUFDLE9BQU8sS0FBSyxPQUFPLENBQUMsQ0FBQyxDQUFDO2dCQUM3QixNQUFNLENBQUMsSUFBSSxDQUFDLFVBQVUsQ0FBQTtZQUN4QixDQUFDO1lBQUMsSUFBSSxDQUFDLENBQUM7Z0JBQ04sSUFBSSxDQUFDLE9BQU8sR0FBRyxPQUFPLENBQUE7Z0JBQ3RCLElBQUksQ0FBQyxVQUFVLEdBQUcsTUFBTSx5Q0FBb0IsQ0FBQyxJQUFJLENBQUMsTUFBTSxDQUFDLE9BQU8sRUFBRSxDQUFDLENBQUE7Z0JBQ25FLE1BQU0sQ0FBQyxJQUFJLENBQUMsVUFBVSxDQUFBO1lBQ3hCLENBQUM7UUFDSCxDQUFDO0tBQUE7Q0FDRjtBQTlDRCxnQ0E4Q0MiLCJzb3VyY2VzQ29udGVudCI6WyIvKlxuICogZGVjYWZmZWluYXRlIHN1Z2dlc3Rpb25zOlxuICogRFMxMDI6IFJlbW92ZSB1bm5lY2Vzc2FyeSBjb2RlIGNyZWF0ZWQgYmVjYXVzZSBvZiBpbXBsaWNpdCByZXR1cm5zXG4gKiBEUzIwNjogQ29uc2lkZXIgcmV3b3JraW5nIGNsYXNzZXMgdG8gYXZvaWQgaW5pdENsYXNzXG4gKiBEUzIwNzogQ29uc2lkZXIgc2hvcnRlciB2YXJpYXRpb25zIG9mIG51bGwgY2hlY2tzXG4gKiBGdWxsIGRvY3M6IGh0dHBzOi8vZ2l0aHViLmNvbS9kZWNhZmZlaW5hdGUvZGVjYWZmZWluYXRlL2Jsb2IvbWFzdGVyL2RvY3Mvc3VnZ2VzdGlvbnMubWRcbiAqL1xuaW1wb3J0IHsgQ29tcG9zaXRlRGlzcG9zYWJsZSB9IGZyb20gJ2F0b20nXG5pbXBvcnQgeyBwYXJzZUhzTW9kdWxlSW1wb3J0cywgSU1vZHVsZUltcG9ydHMsIElJbXBvcnQgfSBmcm9tICdhdG9tLWhhc2tlbGwtdXRpbHMnXG5cbmV4cG9ydCB7SUltcG9ydH1cblxuZXhwb3J0IGNsYXNzIEJ1ZmZlckluZm8ge1xuICBwcml2YXRlIGRpc3Bvc2FibGVzOiBDb21wb3NpdGVEaXNwb3NhYmxlXG4gIHByaXZhdGUgb2xkVGV4dDogc3RyaW5nID0gJydcbiAgcHJpdmF0ZSBvbGRJbXBvcnRzOiBJTW9kdWxlSW1wb3J0cyA9IHsgbmFtZTogJ01haW4nLCBpbXBvcnRzOiBbXSB9XG5cbiAgY29uc3RydWN0b3IgKHB1YmxpYyByZWFkb25seSBidWZmZXI6IEF0b21UeXBlcy5UZXh0QnVmZmVyKSB7XG4gICAgdGhpcy5kaXNwb3NhYmxlcyA9IG5ldyBDb21wb3NpdGVEaXNwb3NhYmxlKClcbiAgICB0aGlzLmRpc3Bvc2FibGVzLmFkZCh0aGlzLmJ1ZmZlci5vbkRpZERlc3Ryb3kodGhpcy5kZXN0cm95LmJpbmQodGhpcykpKVxuICB9XG5cbiAgcHVibGljIGRlc3Ryb3kgKCkge1xuICAgIHRoaXMuZGlzcG9zYWJsZXMuZGlzcG9zZSgpXG4gIH1cblxuICBwdWJsaWMgYXN5bmMgZ2V0SW1wb3J0cyAoKTogUHJvbWlzZTxJSW1wb3J0W10+IHtcbiAgICBjb25zdCBwYXJzZWQgPSBhd2FpdCB0aGlzLnBhcnNlKClcbiAgICBjb25zdCBpbXBvcnRzID0gcGFyc2VkID8gcGFyc2VkLmltcG9ydHMgOiBbXVxuICAgIC8vIHRzbGludDpkaXNhYmxlOiBuby1udWxsLWtleXdvcmRcbiAgICBpZiAoIWltcG9ydHMuc29tZSgoe25hbWV9KSA9PiBuYW1lID09PSAnUHJlbHVkZScpKSB7XG4gICAgICBpbXBvcnRzLnB1c2goe1xuICAgICAgICBxdWFsaWZpZWQ6IGZhbHNlLFxuICAgICAgICBoaWRpbmc6IGZhbHNlLFxuICAgICAgICBuYW1lOiAnUHJlbHVkZScsXG4gICAgICAgIGltcG9ydExpc3Q6IG51bGwsXG4gICAgICAgIGFsaWFzOiBudWxsXG4gICAgICB9KVxuICAgIH1cbiAgICAvLyB0c2xpbnQ6ZW5hYmxlOiBuby1udWxsLWtleXdvcmRcbiAgICByZXR1cm4gaW1wb3J0c1xuICB9XG5cbiAgcHVibGljIGFzeW5jIGdldE1vZHVsZU5hbWUgKCk6IFByb21pc2U8c3RyaW5nPiB7XG4gICAgY29uc3QgcGFyc2VkID0gYXdhaXQgdGhpcy5wYXJzZSgpXG4gICAgcmV0dXJuIHBhcnNlZC5uYW1lXG4gIH1cblxuICBwcml2YXRlIGFzeW5jIHBhcnNlICgpOiBQcm9taXNlPElNb2R1bGVJbXBvcnRzPiB7XG4gICAgY29uc3QgbmV3VGV4dCA9IHRoaXMuYnVmZmVyLmdldFRleHQoKVxuICAgIGlmICh0aGlzLm9sZFRleHQgPT09IG5ld1RleHQpIHtcbiAgICAgIHJldHVybiB0aGlzLm9sZEltcG9ydHNcbiAgICB9IGVsc2Uge1xuICAgICAgdGhpcy5vbGRUZXh0ID0gbmV3VGV4dFxuICAgICAgdGhpcy5vbGRJbXBvcnRzID0gYXdhaXQgcGFyc2VIc01vZHVsZUltcG9ydHModGhpcy5idWZmZXIuZ2V0VGV4dCgpKVxuICAgICAgcmV0dXJuIHRoaXMub2xkSW1wb3J0c1xuICAgIH1cbiAgfVxufVxuIl19