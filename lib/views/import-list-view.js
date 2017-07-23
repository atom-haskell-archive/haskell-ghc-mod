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
                    }
                });
                select.element.classList.add('ide-haskell');
                panel = atom.workspace.addModalPanel({
                    item: select,
                    visible: true
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaW1wb3J0LWxpc3Qtdmlldy5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uLy4uL3NyYy92aWV3cy9pbXBvcnQtbGlzdC12aWV3LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7Ozs7Ozs7Ozs7QUFBQSxtREFBbUQ7QUFHbkQsd0JBQ0UsT0FBaUI7O1FBRWpCLElBQUksS0FBd0IsQ0FBQTtRQUM1QixJQUFJLEdBQXVCLENBQUE7UUFDM0IsSUFBSSxDQUFDO1lBQ0gsR0FBRyxHQUFHLE1BQU0sSUFBSSxPQUFPLENBQW1CLENBQUMsT0FBTyxFQUFFLE1BQU07Z0JBQ3hELE1BQU0sTUFBTSxHQUFHLElBQUksY0FBYyxDQUFDO29CQUNoQyxLQUFLLEVBQUUsT0FBTztvQkFFZCxjQUFjLEVBQUUsQ0FBQyxhQUFhLENBQUM7b0JBQy9CLGNBQWMsRUFBRSxDQUFDLElBQVk7d0JBQzNCLE1BQU0sRUFBRSxHQUFHLFFBQVEsQ0FBQyxhQUFhLENBQUMsSUFBSSxDQUFDLENBQUE7d0JBQ3ZDLEVBQUUsQ0FBQyxTQUFTLEdBQUcsR0FBRyxJQUFJLEVBQUUsQ0FBQTt3QkFDeEIsTUFBTSxDQUFDLEVBQUUsQ0FBQTtvQkFDWCxDQUFDO29CQUNELGtCQUFrQixFQUFFO3dCQUNsQixPQUFPLEVBQUUsQ0FBQTtvQkFDWCxDQUFDO29CQUNELG1CQUFtQixFQUFFLENBQUMsSUFBWTt3QkFDaEMsT0FBTyxDQUFDLElBQUksQ0FBQyxDQUFBO29CQUNmLENBQUM7aUJBQ0YsQ0FBQyxDQUFBO2dCQUNGLE1BQU0sQ0FBQyxPQUFPLENBQUMsU0FBUyxDQUFDLEdBQUcsQ0FBQyxhQUFhLENBQUMsQ0FBQTtnQkFDM0MsS0FBSyxHQUFHLElBQUksQ0FBQyxTQUFTLENBQUMsYUFBYSxDQUFDO29CQUNuQyxJQUFJLEVBQUUsTUFBTTtvQkFDWixPQUFPLEVBQUUsSUFBSTtpQkFDZCxDQUFDLENBQUE7Z0JBQ0YsTUFBTSxDQUFDLEtBQUssRUFBRSxDQUFBO1lBQ2hCLENBQUMsQ0FBQyxDQUFBO1FBQ0osQ0FBQztnQkFBUyxDQUFDO1lBQ1QsS0FBSyxJQUFJLEtBQUssQ0FBQyxPQUFPLEVBQUUsQ0FBQTtRQUMxQixDQUFDO1FBQ0QsTUFBTSxDQUFDLEdBQUcsQ0FBQTtJQUNaLENBQUM7Q0FBQTtBQWxDRCx3Q0FrQ0MiLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgU2VsZWN0TGlzdFZpZXcgPSByZXF1aXJlKCdhdG9tLXNlbGVjdC1saXN0JylcbmltcG9ydCB7UGFuZWx9IGZyb20gJ2F0b20nXG5cbmV4cG9ydCBhc3luYyBmdW5jdGlvbiBpbXBvcnRMaXN0VmlldyAoXG4gIGltcG9ydHM6IHN0cmluZ1tdXG4pOiBQcm9taXNlPHN0cmluZ3x1bmRlZmluZWQ+IHtcbiAgbGV0IHBhbmVsOiBQYW5lbCB8IHVuZGVmaW5lZFxuICBsZXQgcmVzOiBzdHJpbmcgfCB1bmRlZmluZWRcbiAgdHJ5IHtcbiAgICByZXMgPSBhd2FpdCBuZXcgUHJvbWlzZTxzdHJpbmd8dW5kZWZpbmVkPigocmVzb2x2ZSwgcmVqZWN0KSA9PiB7XG4gICAgICBjb25zdCBzZWxlY3QgPSBuZXcgU2VsZWN0TGlzdFZpZXcoe1xuICAgICAgICBpdGVtczogaW1wb3J0cyxcbiAgICAgICAgLy8gaW5mb01lc3NhZ2U6IGhlYWRpbmcsXG4gICAgICAgIGl0ZW1zQ2xhc3NMaXN0OiBbJ2lkZS1oYXNrZWxsJ10sXG4gICAgICAgIGVsZW1lbnRGb3JJdGVtOiAoaXRlbTogc3RyaW5nKSA9PiB7XG4gICAgICAgICAgY29uc3QgbGkgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdsaScpXG4gICAgICAgICAgbGkuaW5uZXJUZXh0ID0gYCR7aXRlbX1gXG4gICAgICAgICAgcmV0dXJuIGxpXG4gICAgICAgIH0sXG4gICAgICAgIGRpZENhbmNlbFNlbGVjdGlvbjogKCkgPT4ge1xuICAgICAgICAgIHJlc29sdmUoKVxuICAgICAgICB9LFxuICAgICAgICBkaWRDb25maXJtU2VsZWN0aW9uOiAoaXRlbTogc3RyaW5nKSA9PiB7XG4gICAgICAgICAgcmVzb2x2ZShpdGVtKVxuICAgICAgICB9XG4gICAgICB9KVxuICAgICAgc2VsZWN0LmVsZW1lbnQuY2xhc3NMaXN0LmFkZCgnaWRlLWhhc2tlbGwnKVxuICAgICAgcGFuZWwgPSBhdG9tLndvcmtzcGFjZS5hZGRNb2RhbFBhbmVsKHtcbiAgICAgICAgaXRlbTogc2VsZWN0LFxuICAgICAgICB2aXNpYmxlOiB0cnVlXG4gICAgICB9KVxuICAgICAgc2VsZWN0LmZvY3VzKClcbiAgICB9KVxuICB9IGZpbmFsbHkge1xuICAgIHBhbmVsICYmIHBhbmVsLmRlc3Ryb3koKVxuICB9XG4gIHJldHVybiByZXNcbn1cbiJdfQ==