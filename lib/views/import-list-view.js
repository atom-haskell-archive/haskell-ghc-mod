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
const SelectListView = require("atom-select-list");
function importListView(imports) {
    return __awaiter(this, void 0, void 0, function* () {
        let panel;
        let res;
        try {
            res = yield new Promise((resolve, reject) => {
                const select = new SelectListView({
                    items: imports,
                    itemsClassList: ['ide-haskell'],
                    elementForItem: (item) => {
                        const li = document.createElement('li');
                        li.innerText = `${item}`;
                        return li;
                    },
                    didCancelSelection: () => {
                        resolve();
                    },
                    didConfirmSelection: (item) => {
                        resolve(item);
                    },
                });
                select.element.classList.add('ide-haskell');
                panel = atom.workspace.addModalPanel({
                    item: select,
                    visible: true,
                });
                select.focus();
            });
        }
        finally {
            panel && panel.destroy();
        }
        return res;
    });
}
exports.importListView = importListView;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaW1wb3J0LWxpc3Qtdmlldy5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uLy4uL3NyYy92aWV3cy9pbXBvcnQtbGlzdC12aWV3LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7Ozs7Ozs7Ozs7QUFBQSxtREFBbUQ7QUFHbkQsd0JBQ0UsT0FBaUI7O1FBRWpCLElBQUksS0FBZ0QsQ0FBQTtRQUNwRCxJQUFJLEdBQXVCLENBQUE7UUFDM0IsSUFBSSxDQUFDO1lBQ0gsR0FBRyxHQUFHLE1BQU0sSUFBSSxPQUFPLENBQXFCLENBQUMsT0FBTyxFQUFFLE1BQU0sRUFBRSxFQUFFO2dCQUM5RCxNQUFNLE1BQU0sR0FBRyxJQUFJLGNBQWMsQ0FBQztvQkFDaEMsS0FBSyxFQUFFLE9BQU87b0JBRWQsY0FBYyxFQUFFLENBQUMsYUFBYSxDQUFDO29CQUMvQixjQUFjLEVBQUUsQ0FBQyxJQUFZLEVBQUUsRUFBRTt3QkFDL0IsTUFBTSxFQUFFLEdBQUcsUUFBUSxDQUFDLGFBQWEsQ0FBQyxJQUFJLENBQUMsQ0FBQTt3QkFDdkMsRUFBRSxDQUFDLFNBQVMsR0FBRyxHQUFHLElBQUksRUFBRSxDQUFBO3dCQUN4QixNQUFNLENBQUMsRUFBRSxDQUFBO29CQUNYLENBQUM7b0JBQ0Qsa0JBQWtCLEVBQUUsR0FBRyxFQUFFO3dCQUN2QixPQUFPLEVBQUUsQ0FBQTtvQkFDWCxDQUFDO29CQUNELG1CQUFtQixFQUFFLENBQUMsSUFBWSxFQUFFLEVBQUU7d0JBQ3BDLE9BQU8sQ0FBQyxJQUFJLENBQUMsQ0FBQTtvQkFDZixDQUFDO2lCQUNGLENBQUMsQ0FBQTtnQkFDRixNQUFNLENBQUMsT0FBTyxDQUFDLFNBQVMsQ0FBQyxHQUFHLENBQUMsYUFBYSxDQUFDLENBQUE7Z0JBQzNDLEtBQUssR0FBRyxJQUFJLENBQUMsU0FBUyxDQUFDLGFBQWEsQ0FBQztvQkFDbkMsSUFBSSxFQUFFLE1BQU07b0JBQ1osT0FBTyxFQUFFLElBQUk7aUJBQ2QsQ0FBQyxDQUFBO2dCQUNGLE1BQU0sQ0FBQyxLQUFLLEVBQUUsQ0FBQTtZQUNoQixDQUFDLENBQUMsQ0FBQTtRQUNKLENBQUM7Z0JBQVMsQ0FBQztZQUNULEtBQUssSUFBSSxLQUFLLENBQUMsT0FBTyxFQUFFLENBQUE7UUFDMUIsQ0FBQztRQUNELE1BQU0sQ0FBQyxHQUFHLENBQUE7SUFDWixDQUFDO0NBQUE7QUFsQ0Qsd0NBa0NDIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IFNlbGVjdExpc3RWaWV3ID0gcmVxdWlyZSgnYXRvbS1zZWxlY3QtbGlzdCcpXG5pbXBvcnQgeyBQYW5lbCB9IGZyb20gJ2F0b20nXG5cbmV4cG9ydCBhc3luYyBmdW5jdGlvbiBpbXBvcnRMaXN0VmlldyhcbiAgaW1wb3J0czogc3RyaW5nW10sXG4pOiBQcm9taXNlPHN0cmluZyB8IHVuZGVmaW5lZD4ge1xuICBsZXQgcGFuZWw6IFBhbmVsPFNlbGVjdExpc3RWaWV3PHN0cmluZz4+IHwgdW5kZWZpbmVkXG4gIGxldCByZXM6IHN0cmluZyB8IHVuZGVmaW5lZFxuICB0cnkge1xuICAgIHJlcyA9IGF3YWl0IG5ldyBQcm9taXNlPHN0cmluZyB8IHVuZGVmaW5lZD4oKHJlc29sdmUsIHJlamVjdCkgPT4ge1xuICAgICAgY29uc3Qgc2VsZWN0ID0gbmV3IFNlbGVjdExpc3RWaWV3KHtcbiAgICAgICAgaXRlbXM6IGltcG9ydHMsXG4gICAgICAgIC8vIGluZm9NZXNzYWdlOiBoZWFkaW5nLFxuICAgICAgICBpdGVtc0NsYXNzTGlzdDogWydpZGUtaGFza2VsbCddLFxuICAgICAgICBlbGVtZW50Rm9ySXRlbTogKGl0ZW06IHN0cmluZykgPT4ge1xuICAgICAgICAgIGNvbnN0IGxpID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnbGknKVxuICAgICAgICAgIGxpLmlubmVyVGV4dCA9IGAke2l0ZW19YFxuICAgICAgICAgIHJldHVybiBsaVxuICAgICAgICB9LFxuICAgICAgICBkaWRDYW5jZWxTZWxlY3Rpb246ICgpID0+IHtcbiAgICAgICAgICByZXNvbHZlKClcbiAgICAgICAgfSxcbiAgICAgICAgZGlkQ29uZmlybVNlbGVjdGlvbjogKGl0ZW06IHN0cmluZykgPT4ge1xuICAgICAgICAgIHJlc29sdmUoaXRlbSlcbiAgICAgICAgfSxcbiAgICAgIH0pXG4gICAgICBzZWxlY3QuZWxlbWVudC5jbGFzc0xpc3QuYWRkKCdpZGUtaGFza2VsbCcpXG4gICAgICBwYW5lbCA9IGF0b20ud29ya3NwYWNlLmFkZE1vZGFsUGFuZWwoe1xuICAgICAgICBpdGVtOiBzZWxlY3QsXG4gICAgICAgIHZpc2libGU6IHRydWUsXG4gICAgICB9KVxuICAgICAgc2VsZWN0LmZvY3VzKClcbiAgICB9KVxuICB9IGZpbmFsbHkge1xuICAgIHBhbmVsICYmIHBhbmVsLmRlc3Ryb3koKVxuICB9XG4gIHJldHVybiByZXNcbn1cbiJdfQ==