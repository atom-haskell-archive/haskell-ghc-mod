import SelectListView = require('atom-select-list')
import { Panel } from 'atom'

export async function importListView(
  imports: string[],
): Promise<string | undefined> {
  let panel: Panel<SelectListView<string>> | undefined
  let res: string | undefined
  try {
    res = await new Promise<string | undefined>((resolve) => {
      const select = new SelectListView({
        items: imports,
        // infoMessage: heading,
        itemsClassList: ['ide-haskell'],
        elementForItem: (item: string) => {
          const li = document.createElement('li')
          li.innerText = `${item}`
          return li
        },
        didCancelSelection: () => {
          resolve()
        },
        didConfirmSelection: (item: string) => {
          resolve(item)
        },
      })
      select.element.classList.add('ide-haskell')
      panel = atom.workspace.addModalPanel({
        item: select,
        visible: true,
      })
      select.focus()
    })
  } finally {
    panel && panel.destroy()
  }
  return res
}
