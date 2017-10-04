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
                    alias: null,
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYnVmZmVyLWluZm8uanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi9zcmMvY29tcGxldGlvbi1iYWNrZW5kL2J1ZmZlci1pbmZvLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7Ozs7Ozs7Ozs7QUFBQSwrQkFBMEM7QUFDMUMsMkRBQWtGO0FBSWxGO0lBS0UsWUFBNEIsTUFBNEI7UUFBNUIsV0FBTSxHQUFOLE1BQU0sQ0FBc0I7UUFIaEQsWUFBTyxHQUFXLEVBQUUsQ0FBQTtRQUNwQixlQUFVLEdBQW1CLEVBQUUsSUFBSSxFQUFFLE1BQU0sRUFBRSxPQUFPLEVBQUUsRUFBRSxFQUFFLENBQUE7UUFHaEUsSUFBSSxDQUFDLFdBQVcsR0FBRyxJQUFJLDBCQUFtQixFQUFFLENBQUE7UUFDNUMsSUFBSSxDQUFDLFdBQVcsQ0FBQyxHQUFHLENBQUMsSUFBSSxDQUFDLE1BQU0sQ0FBQyxZQUFZLENBQUMsSUFBSSxDQUFDLE9BQU8sQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxDQUFBO0lBQ3pFLENBQUM7SUFFTSxPQUFPO1FBQ1osSUFBSSxDQUFDLFdBQVcsQ0FBQyxPQUFPLEVBQUUsQ0FBQTtJQUM1QixDQUFDO0lBRVksVUFBVTs7WUFDckIsTUFBTSxNQUFNLEdBQUcsTUFBTSxJQUFJLENBQUMsS0FBSyxFQUFFLENBQUE7WUFDakMsTUFBTSxPQUFPLEdBQUcsTUFBTSxDQUFDLENBQUMsQ0FBQyxNQUFNLENBQUMsT0FBTyxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUE7WUFFNUMsRUFBRSxDQUFDLENBQUMsQ0FBQyxPQUFPLENBQUMsSUFBSSxDQUFDLENBQUMsRUFBRSxJQUFJLEVBQUUsRUFBRSxFQUFFLENBQUMsSUFBSSxLQUFLLFNBQVMsQ0FBQyxDQUFDLENBQUMsQ0FBQztnQkFDcEQsT0FBTyxDQUFDLElBQUksQ0FBQztvQkFDWCxTQUFTLEVBQUUsS0FBSztvQkFDaEIsTUFBTSxFQUFFLEtBQUs7b0JBQ2IsSUFBSSxFQUFFLFNBQVM7b0JBQ2YsVUFBVSxFQUFFLElBQUk7b0JBQ2hCLEtBQUssRUFBRSxJQUFJO2lCQUNaLENBQUMsQ0FBQTtZQUNKLENBQUM7WUFFRCxNQUFNLENBQUMsT0FBTyxDQUFBO1FBQ2hCLENBQUM7S0FBQTtJQUVZLGFBQWE7O1lBQ3hCLE1BQU0sTUFBTSxHQUFHLE1BQU0sSUFBSSxDQUFDLEtBQUssRUFBRSxDQUFBO1lBQ2pDLE1BQU0sQ0FBQyxNQUFNLENBQUMsSUFBSSxDQUFBO1FBQ3BCLENBQUM7S0FBQTtJQUVhLEtBQUs7O1lBQ2pCLE1BQU0sT0FBTyxHQUFHLElBQUksQ0FBQyxNQUFNLENBQUMsT0FBTyxFQUFFLENBQUE7WUFDckMsRUFBRSxDQUFDLENBQUMsSUFBSSxDQUFDLE9BQU8sS0FBSyxPQUFPLENBQUMsQ0FBQyxDQUFDO2dCQUM3QixNQUFNLENBQUMsSUFBSSxDQUFDLFVBQVUsQ0FBQTtZQUN4QixDQUFDO1lBQUMsSUFBSSxDQUFDLENBQUM7Z0JBQ04sSUFBSSxDQUFDLE9BQU8sR0FBRyxPQUFPLENBQUE7Z0JBQ3RCLElBQUksQ0FBQyxVQUFVLEdBQUcsTUFBTSx5Q0FBb0IsQ0FBQyxJQUFJLENBQUMsTUFBTSxDQUFDLE9BQU8sRUFBRSxDQUFDLENBQUE7Z0JBQ25FLE1BQU0sQ0FBQyxJQUFJLENBQUMsVUFBVSxDQUFBO1lBQ3hCLENBQUM7UUFDSCxDQUFDO0tBQUE7Q0FDRjtBQTlDRCxnQ0E4Q0MiLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgeyBDb21wb3NpdGVEaXNwb3NhYmxlIH0gZnJvbSAnYXRvbSdcbmltcG9ydCB7IHBhcnNlSHNNb2R1bGVJbXBvcnRzLCBJTW9kdWxlSW1wb3J0cywgSUltcG9ydCB9IGZyb20gJ2F0b20taGFza2VsbC11dGlscydcblxuZXhwb3J0IHsgSUltcG9ydCB9XG5cbmV4cG9ydCBjbGFzcyBCdWZmZXJJbmZvIHtcbiAgcHJpdmF0ZSBkaXNwb3NhYmxlczogQ29tcG9zaXRlRGlzcG9zYWJsZVxuICBwcml2YXRlIG9sZFRleHQ6IHN0cmluZyA9ICcnXG4gIHByaXZhdGUgb2xkSW1wb3J0czogSU1vZHVsZUltcG9ydHMgPSB7IG5hbWU6ICdNYWluJywgaW1wb3J0czogW10gfVxuXG4gIGNvbnN0cnVjdG9yKHB1YmxpYyByZWFkb25seSBidWZmZXI6IEF0b21UeXBlcy5UZXh0QnVmZmVyKSB7XG4gICAgdGhpcy5kaXNwb3NhYmxlcyA9IG5ldyBDb21wb3NpdGVEaXNwb3NhYmxlKClcbiAgICB0aGlzLmRpc3Bvc2FibGVzLmFkZCh0aGlzLmJ1ZmZlci5vbkRpZERlc3Ryb3kodGhpcy5kZXN0cm95LmJpbmQodGhpcykpKVxuICB9XG5cbiAgcHVibGljIGRlc3Ryb3koKSB7XG4gICAgdGhpcy5kaXNwb3NhYmxlcy5kaXNwb3NlKClcbiAgfVxuXG4gIHB1YmxpYyBhc3luYyBnZXRJbXBvcnRzKCk6IFByb21pc2U8SUltcG9ydFtdPiB7XG4gICAgY29uc3QgcGFyc2VkID0gYXdhaXQgdGhpcy5wYXJzZSgpXG4gICAgY29uc3QgaW1wb3J0cyA9IHBhcnNlZCA/IHBhcnNlZC5pbXBvcnRzIDogW11cbiAgICAvLyB0c2xpbnQ6ZGlzYWJsZTogbm8tbnVsbC1rZXl3b3JkXG4gICAgaWYgKCFpbXBvcnRzLnNvbWUoKHsgbmFtZSB9KSA9PiBuYW1lID09PSAnUHJlbHVkZScpKSB7XG4gICAgICBpbXBvcnRzLnB1c2goe1xuICAgICAgICBxdWFsaWZpZWQ6IGZhbHNlLFxuICAgICAgICBoaWRpbmc6IGZhbHNlLFxuICAgICAgICBuYW1lOiAnUHJlbHVkZScsXG4gICAgICAgIGltcG9ydExpc3Q6IG51bGwsXG4gICAgICAgIGFsaWFzOiBudWxsLFxuICAgICAgfSlcbiAgICB9XG4gICAgLy8gdHNsaW50OmVuYWJsZTogbm8tbnVsbC1rZXl3b3JkXG4gICAgcmV0dXJuIGltcG9ydHNcbiAgfVxuXG4gIHB1YmxpYyBhc3luYyBnZXRNb2R1bGVOYW1lKCk6IFByb21pc2U8c3RyaW5nPiB7XG4gICAgY29uc3QgcGFyc2VkID0gYXdhaXQgdGhpcy5wYXJzZSgpXG4gICAgcmV0dXJuIHBhcnNlZC5uYW1lXG4gIH1cblxuICBwcml2YXRlIGFzeW5jIHBhcnNlKCk6IFByb21pc2U8SU1vZHVsZUltcG9ydHM+IHtcbiAgICBjb25zdCBuZXdUZXh0ID0gdGhpcy5idWZmZXIuZ2V0VGV4dCgpXG4gICAgaWYgKHRoaXMub2xkVGV4dCA9PT0gbmV3VGV4dCkge1xuICAgICAgcmV0dXJuIHRoaXMub2xkSW1wb3J0c1xuICAgIH0gZWxzZSB7XG4gICAgICB0aGlzLm9sZFRleHQgPSBuZXdUZXh0XG4gICAgICB0aGlzLm9sZEltcG9ydHMgPSBhd2FpdCBwYXJzZUhzTW9kdWxlSW1wb3J0cyh0aGlzLmJ1ZmZlci5nZXRUZXh0KCkpXG4gICAgICByZXR1cm4gdGhpcy5vbGRJbXBvcnRzXG4gICAgfVxuICB9XG59XG4iXX0=