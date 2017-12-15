"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const SelectListView = require("atom-select-list");
async function importListView(imports) {
    let panel;
    let res;
    try {
        res = await new Promise((resolve) => {
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
}
exports.importListView = importListView;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaW1wb3J0LWxpc3Qtdmlldy5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uLy4uL3NyYy92aWV3cy9pbXBvcnQtbGlzdC12aWV3LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7O0FBQUEsbURBQW1EO0FBRzVDLEtBQUsseUJBQ1YsT0FBaUI7SUFFakIsSUFBSSxLQUFnRCxDQUFBO0lBQ3BELElBQUksR0FBdUIsQ0FBQTtJQUMzQixJQUFJLENBQUM7UUFDSCxHQUFHLEdBQUcsTUFBTSxJQUFJLE9BQU8sQ0FBcUIsQ0FBQyxPQUFPLEVBQUUsRUFBRTtZQUN0RCxNQUFNLE1BQU0sR0FBRyxJQUFJLGNBQWMsQ0FBQztnQkFDaEMsS0FBSyxFQUFFLE9BQU87Z0JBRWQsY0FBYyxFQUFFLENBQUMsYUFBYSxDQUFDO2dCQUMvQixjQUFjLEVBQUUsQ0FBQyxJQUFZLEVBQUUsRUFBRTtvQkFDL0IsTUFBTSxFQUFFLEdBQUcsUUFBUSxDQUFDLGFBQWEsQ0FBQyxJQUFJLENBQUMsQ0FBQTtvQkFDdkMsRUFBRSxDQUFDLFNBQVMsR0FBRyxHQUFHLElBQUksRUFBRSxDQUFBO29CQUN4QixNQUFNLENBQUMsRUFBRSxDQUFBO2dCQUNYLENBQUM7Z0JBQ0Qsa0JBQWtCLEVBQUUsR0FBRyxFQUFFO29CQUN2QixPQUFPLEVBQUUsQ0FBQTtnQkFDWCxDQUFDO2dCQUNELG1CQUFtQixFQUFFLENBQUMsSUFBWSxFQUFFLEVBQUU7b0JBQ3BDLE9BQU8sQ0FBQyxJQUFJLENBQUMsQ0FBQTtnQkFDZixDQUFDO2FBQ0YsQ0FBQyxDQUFBO1lBQ0YsTUFBTSxDQUFDLE9BQU8sQ0FBQyxTQUFTLENBQUMsR0FBRyxDQUFDLGFBQWEsQ0FBQyxDQUFBO1lBQzNDLEtBQUssR0FBRyxJQUFJLENBQUMsU0FBUyxDQUFDLGFBQWEsQ0FBQztnQkFDbkMsSUFBSSxFQUFFLE1BQU07Z0JBQ1osT0FBTyxFQUFFLElBQUk7YUFDZCxDQUFDLENBQUE7WUFDRixNQUFNLENBQUMsS0FBSyxFQUFFLENBQUE7UUFDaEIsQ0FBQyxDQUFDLENBQUE7SUFDSixDQUFDO1lBQVMsQ0FBQztRQUNULEtBQUssSUFBSSxLQUFLLENBQUMsT0FBTyxFQUFFLENBQUE7SUFDMUIsQ0FBQztJQUNELE1BQU0sQ0FBQyxHQUFHLENBQUE7QUFDWixDQUFDO0FBbENELHdDQWtDQyIsInNvdXJjZXNDb250ZW50IjpbImltcG9ydCBTZWxlY3RMaXN0VmlldyA9IHJlcXVpcmUoJ2F0b20tc2VsZWN0LWxpc3QnKVxuaW1wb3J0IHsgUGFuZWwgfSBmcm9tICdhdG9tJ1xuXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gaW1wb3J0TGlzdFZpZXcoXG4gIGltcG9ydHM6IHN0cmluZ1tdLFxuKTogUHJvbWlzZTxzdHJpbmcgfCB1bmRlZmluZWQ+IHtcbiAgbGV0IHBhbmVsOiBQYW5lbDxTZWxlY3RMaXN0VmlldzxzdHJpbmc+PiB8IHVuZGVmaW5lZFxuICBsZXQgcmVzOiBzdHJpbmcgfCB1bmRlZmluZWRcbiAgdHJ5IHtcbiAgICByZXMgPSBhd2FpdCBuZXcgUHJvbWlzZTxzdHJpbmcgfCB1bmRlZmluZWQ+KChyZXNvbHZlKSA9PiB7XG4gICAgICBjb25zdCBzZWxlY3QgPSBuZXcgU2VsZWN0TGlzdFZpZXcoe1xuICAgICAgICBpdGVtczogaW1wb3J0cyxcbiAgICAgICAgLy8gaW5mb01lc3NhZ2U6IGhlYWRpbmcsXG4gICAgICAgIGl0ZW1zQ2xhc3NMaXN0OiBbJ2lkZS1oYXNrZWxsJ10sXG4gICAgICAgIGVsZW1lbnRGb3JJdGVtOiAoaXRlbTogc3RyaW5nKSA9PiB7XG4gICAgICAgICAgY29uc3QgbGkgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdsaScpXG4gICAgICAgICAgbGkuaW5uZXJUZXh0ID0gYCR7aXRlbX1gXG4gICAgICAgICAgcmV0dXJuIGxpXG4gICAgICAgIH0sXG4gICAgICAgIGRpZENhbmNlbFNlbGVjdGlvbjogKCkgPT4ge1xuICAgICAgICAgIHJlc29sdmUoKVxuICAgICAgICB9LFxuICAgICAgICBkaWRDb25maXJtU2VsZWN0aW9uOiAoaXRlbTogc3RyaW5nKSA9PiB7XG4gICAgICAgICAgcmVzb2x2ZShpdGVtKVxuICAgICAgICB9LFxuICAgICAgfSlcbiAgICAgIHNlbGVjdC5lbGVtZW50LmNsYXNzTGlzdC5hZGQoJ2lkZS1oYXNrZWxsJylcbiAgICAgIHBhbmVsID0gYXRvbS53b3Jrc3BhY2UuYWRkTW9kYWxQYW5lbCh7XG4gICAgICAgIGl0ZW06IHNlbGVjdCxcbiAgICAgICAgdmlzaWJsZTogdHJ1ZSxcbiAgICAgIH0pXG4gICAgICBzZWxlY3QuZm9jdXMoKVxuICAgIH0pXG4gIH0gZmluYWxseSB7XG4gICAgcGFuZWwgJiYgcGFuZWwuZGVzdHJveSgpXG4gIH1cbiAgcmV0dXJuIHJlc1xufVxuIl19