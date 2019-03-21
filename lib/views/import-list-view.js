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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaW1wb3J0LWxpc3Qtdmlldy5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uLy4uL3NyYy92aWV3cy9pbXBvcnQtbGlzdC12aWV3LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7O0FBQUEsbURBQW1EO0FBRzVDLEtBQUssVUFBVSxjQUFjLENBQ2xDLE9BQWlCO0lBRWpCLElBQUksS0FBZ0QsQ0FBQTtJQUNwRCxJQUFJLEdBQXVCLENBQUE7SUFDM0IsSUFBSTtRQUNGLEdBQUcsR0FBRyxNQUFNLElBQUksT0FBTyxDQUFxQixDQUFDLE9BQU8sRUFBRSxFQUFFO1lBQ3RELE1BQU0sTUFBTSxHQUFHLElBQUksY0FBYyxDQUFDO2dCQUNoQyxLQUFLLEVBQUUsT0FBTztnQkFFZCxjQUFjLEVBQUUsQ0FBQyxhQUFhLENBQUM7Z0JBQy9CLGNBQWMsRUFBRSxDQUFDLElBQVksRUFBRSxFQUFFO29CQUMvQixNQUFNLEVBQUUsR0FBRyxRQUFRLENBQUMsYUFBYSxDQUFDLElBQUksQ0FBQyxDQUFBO29CQUN2QyxFQUFFLENBQUMsU0FBUyxHQUFHLEdBQUcsSUFBSSxFQUFFLENBQUE7b0JBQ3hCLE9BQU8sRUFBRSxDQUFBO2dCQUNYLENBQUM7Z0JBQ0Qsa0JBQWtCLEVBQUUsR0FBRyxFQUFFO29CQUN2QixPQUFPLEVBQUUsQ0FBQTtnQkFDWCxDQUFDO2dCQUNELG1CQUFtQixFQUFFLENBQUMsSUFBWSxFQUFFLEVBQUU7b0JBQ3BDLE9BQU8sQ0FBQyxJQUFJLENBQUMsQ0FBQTtnQkFDZixDQUFDO2FBQ0YsQ0FBQyxDQUFBO1lBQ0YsTUFBTSxDQUFDLE9BQU8sQ0FBQyxTQUFTLENBQUMsR0FBRyxDQUFDLGFBQWEsQ0FBQyxDQUFBO1lBQzNDLEtBQUssR0FBRyxJQUFJLENBQUMsU0FBUyxDQUFDLGFBQWEsQ0FBQztnQkFDbkMsSUFBSSxFQUFFLE1BQU07Z0JBQ1osT0FBTyxFQUFFLElBQUk7YUFDZCxDQUFDLENBQUE7WUFDRixNQUFNLENBQUMsS0FBSyxFQUFFLENBQUE7UUFDaEIsQ0FBQyxDQUFDLENBQUE7S0FDSDtZQUFTO1FBQ1IsS0FBSyxJQUFJLEtBQUssQ0FBQyxPQUFPLEVBQUUsQ0FBQTtLQUN6QjtJQUNELE9BQU8sR0FBRyxDQUFBO0FBQ1osQ0FBQztBQWxDRCx3Q0FrQ0MiLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgU2VsZWN0TGlzdFZpZXcgPSByZXF1aXJlKCdhdG9tLXNlbGVjdC1saXN0JylcbmltcG9ydCB7IFBhbmVsIH0gZnJvbSAnYXRvbSdcblxuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIGltcG9ydExpc3RWaWV3KFxuICBpbXBvcnRzOiBzdHJpbmdbXSxcbik6IFByb21pc2U8c3RyaW5nIHwgdW5kZWZpbmVkPiB7XG4gIGxldCBwYW5lbDogUGFuZWw8U2VsZWN0TGlzdFZpZXc8c3RyaW5nPj4gfCB1bmRlZmluZWRcbiAgbGV0IHJlczogc3RyaW5nIHwgdW5kZWZpbmVkXG4gIHRyeSB7XG4gICAgcmVzID0gYXdhaXQgbmV3IFByb21pc2U8c3RyaW5nIHwgdW5kZWZpbmVkPigocmVzb2x2ZSkgPT4ge1xuICAgICAgY29uc3Qgc2VsZWN0ID0gbmV3IFNlbGVjdExpc3RWaWV3KHtcbiAgICAgICAgaXRlbXM6IGltcG9ydHMsXG4gICAgICAgIC8vIGluZm9NZXNzYWdlOiBoZWFkaW5nLFxuICAgICAgICBpdGVtc0NsYXNzTGlzdDogWydpZGUtaGFza2VsbCddLFxuICAgICAgICBlbGVtZW50Rm9ySXRlbTogKGl0ZW06IHN0cmluZykgPT4ge1xuICAgICAgICAgIGNvbnN0IGxpID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnbGknKVxuICAgICAgICAgIGxpLmlubmVyVGV4dCA9IGAke2l0ZW19YFxuICAgICAgICAgIHJldHVybiBsaVxuICAgICAgICB9LFxuICAgICAgICBkaWRDYW5jZWxTZWxlY3Rpb246ICgpID0+IHtcbiAgICAgICAgICByZXNvbHZlKClcbiAgICAgICAgfSxcbiAgICAgICAgZGlkQ29uZmlybVNlbGVjdGlvbjogKGl0ZW06IHN0cmluZykgPT4ge1xuICAgICAgICAgIHJlc29sdmUoaXRlbSlcbiAgICAgICAgfSxcbiAgICAgIH0pXG4gICAgICBzZWxlY3QuZWxlbWVudC5jbGFzc0xpc3QuYWRkKCdpZGUtaGFza2VsbCcpXG4gICAgICBwYW5lbCA9IGF0b20ud29ya3NwYWNlLmFkZE1vZGFsUGFuZWwoe1xuICAgICAgICBpdGVtOiBzZWxlY3QsXG4gICAgICAgIHZpc2libGU6IHRydWUsXG4gICAgICB9KVxuICAgICAgc2VsZWN0LmZvY3VzKClcbiAgICB9KVxuICB9IGZpbmFsbHkge1xuICAgIHBhbmVsICYmIHBhbmVsLmRlc3Ryb3koKVxuICB9XG4gIHJldHVybiByZXNcbn1cbiJdfQ==