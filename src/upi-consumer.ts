import {
  CommandEvent,
  CompositeDisposable,
  Range,
  TextBuffer,
  TextEditor,
  Point,
  TextEditorElement,
} from 'atom'
import { GhcModiProcess, IErrorCallbackArgs } from './ghc-mod'
import { importListView } from './views/import-list-view'
import * as Util from './util'
import * as UPI from 'atom-haskell-upi'
const { handleException } = Util

const messageTypes = {
  error: {},
  warning: {},
  lint: {},
}

const addMsgTypes = {
  'ghc-mod': {
    uriFilter: false,
    autoScroll: true,
  },
}

const contextScope = 'atom-text-editor[data-grammar~="haskell"]'

const mainMenu = {
  label: 'ghc-mod',
  menu: [
    { label: 'Check', command: 'haskell-ghc-mod:check-file' },
    { label: 'Lint', command: 'haskell-ghc-mod:lint-file' },
    { label: 'Stop Backend', command: 'haskell-ghc-mod:shutdown-backend' },
  ],
}

type TECommandEvent = CommandEvent<TextEditorElement>
type TLastMessages = {
  check: UPI.IResultItem[]
  lint: UPI.IResultItem[]
}

export class UPIConsumer {
  public upi: UPI.IUPIInstance
  private disposables: CompositeDisposable = new CompositeDisposable()
  private processMessages: UPI.IResultItem[] = []
  private lastMessages: TLastMessages = { check: [], lint: [] }
  private msgBackend = atom.config.get('haskell-ghc-mod.ghcModMessages')

  private contextCommands = {
    'haskell-ghc-mod:show-type': this.tooltipCommand(
      this.typeTooltip.bind(this),
    ),
    'haskell-ghc-mod:show-info': this.tooltipCommand(
      this.infoTooltip.bind(this),
    ),
    'haskell-ghc-mod:case-split': this.caseSplitCommand.bind(this),
    'haskell-ghc-mod:sig-fill': this.sigFillCommand.bind(this),
    'haskell-ghc-mod:go-to-declaration': this.goToDeclCommand.bind(this),
    'haskell-ghc-mod:show-info-fallback-to-type': this.tooltipCommand(
      this.infoTypeTooltip.bind(this),
    ),
    'haskell-ghc-mod:show-type-fallback-to-info': this.tooltipCommand(
      this.typeInfoTooltip.bind(this),
    ),
    'haskell-ghc-mod:show-type-and-info': this.tooltipCommand(
      this.typeAndInfoTooltip.bind(this),
    ),
    'haskell-ghc-mod:insert-type': this.insertTypeCommand.bind(this),
    'haskell-ghc-mod:insert-import': this.insertImportCommand.bind(this),
  }

  private globalCommands = {
    'haskell-ghc-mod:check-file': this.checkCommand.bind(this),
    'haskell-ghc-mod:lint-file': this.lintCommand.bind(this),
    ...this.contextCommands,
  }

  private contextMenu: {
    label: string
    submenu: Array<{
      label: string
      command: keyof UPIConsumer['contextCommands']
    }>
  } = {
    label: 'ghc-mod',
    submenu: [
      { label: 'Show Type', command: 'haskell-ghc-mod:show-type' },
      { label: 'Show Info', command: 'haskell-ghc-mod:show-info' },
      {
        label: 'Show Type And Info',
        command: 'haskell-ghc-mod:show-type-and-info',
      },
      { label: 'Case Split', command: 'haskell-ghc-mod:case-split' },
      { label: 'Sig Fill', command: 'haskell-ghc-mod:sig-fill' },
      { label: 'Insert Type', command: 'haskell-ghc-mod:insert-type' },
      { label: 'Insert Import', command: 'haskell-ghc-mod:insert-import' },
      {
        label: 'Go To Declaration',
        command: 'haskell-ghc-mod:go-to-declaration',
      },
    ],
  }

  constructor(register: UPI.IUPIRegistration, private process: GhcModiProcess) {
    this.disposables.add(
      this.process.onError(this.handleProcessError.bind(this)),
      this.process.onWarning(this.handleProcessWarning.bind(this)),
    )

    const msgTypes =
      this.msgBackend === 'upi'
        ? { ...messageTypes, ...addMsgTypes }
        : messageTypes

    this.upi = register({
      name: 'haskell-ghc-mod',
      menu: mainMenu,
      messageTypes: msgTypes,
      tooltip: this.shouldShowTooltip.bind(this),
      events: {
        onDidSaveBuffer: async (buffer) =>
          this.checkLint(
            buffer,
            'Save',
            atom.config.get('haskell-ghc-mod.alwaysInteractiveCheck'),
          ),
        onDidStopChanging: async (buffer) =>
          this.checkLint(buffer, 'Change', true),
      },
    })

    this.disposables.add(
      this.upi,
      this.process.onBackendActive(() =>
        this.upi.setStatus({ status: 'progress', detail: '' }),
      ),
      this.process.onBackendIdle(() =>
        this.upi.setStatus({ status: 'ready', detail: '' }),
      ),
      atom.commands.add(contextScope, this.globalCommands),
    )
    const cm = {}
    cm[contextScope] = [this.contextMenu]
    this.disposables.add(atom.contextMenu.add(cm))
  }

  public dispose() {
    this.disposables.dispose()
  }

  private async shouldShowTooltip(
    editor: TextEditor,
    crange: Range,
    type: UPI.TEventRangeType,
  ): Promise<UPI.ITooltipData | undefined> {
    const n =
      type === 'mouse'
        ? 'haskell-ghc-mod.onMouseHoverShow'
        : type === 'selection'
        ? 'haskell-ghc-mod.onSelectionShow'
        : undefined
    const t = n && atom.config.get(n)
    try {
      if (t) return await this[`${t}Tooltip`](editor, crange)
      else return undefined
    } catch (e) {
      Util.warn(e)
      return undefined
    }
  }

  @handleException
  private async checkCommand({ currentTarget }: TECommandEvent) {
    const editor = currentTarget.getModel()
    const res = await this.process.doCheckBuffer(
      editor.getBuffer(),
      atom.config.get('haskell-ghc-mod.alwaysInteractiveCheck'),
    )
    this.setMessages('check', res)
  }

  @handleException
  private async lintCommand({ currentTarget }: TECommandEvent) {
    const editor = currentTarget.getModel()
    const res = await this.process.doLintBuffer(editor.getBuffer())
    this.setMessages('lint', res)
  }

  private tooltipCommand(
    tooltipfun: (e: TextEditor, p: Range) => Promise<UPI.ITooltipData>,
  ) {
    return async ({ currentTarget, detail }: TECommandEvent) =>
      this.upi.showTooltip({
        editor: currentTarget.getModel(),
        detail,
        async tooltip(crange) {
          return tooltipfun(currentTarget.getModel(), crange)
        },
      })
  }

  @handleException
  private async insertTypeCommand({ currentTarget, detail }: TECommandEvent) {
    const editor = currentTarget.getModel()
    const er = this.upi.getEventRange(editor, detail)
    if (er === undefined) {
      return
    }
    const { crange, pos } = er
    const symInfo = Util.getSymbolAtPoint(editor, pos)
    if (!symInfo) {
      return
    }
    const { scope, range, symbol } = symInfo
    if (scope.startsWith('keyword.operator.')) {
      return
    } // can't correctly handle infix notation
    const { type } = await this.process.getTypeInBuffer(
      editor.getBuffer(),
      crange,
    )
    if (
      editor
        .getTextInBufferRange([
          range.end,
          editor.getBuffer().rangeForRow(range.end.row, false).end,
        ])
        .match(/=/)
    ) {
      let indent = editor.getTextInBufferRange([
        [range.start.row, 0],
        range.start,
      ])
      let birdTrack = ''
      if (
        editor
          .scopeDescriptorForBufferPosition(pos)
          .getScopesArray()
          .includes('meta.embedded.haskell')
      ) {
        birdTrack = indent.slice(0, 2)
        indent = indent.slice(2)
      }
      if (indent.match(/\S/)) {
        indent = indent.replace(/\S/g, ' ')
      }
      editor.setTextInBufferRange(
        [range.start, range.start],
        `${symbol} :: ${type}\n${birdTrack}${indent}`,
      )
    } else {
      editor.setTextInBufferRange(
        range,
        `(${editor.getTextInBufferRange(range)} :: ${type})`,
      )
    }
  }

  @handleException
  private async caseSplitCommand({ currentTarget, detail }: TECommandEvent) {
    const editor = currentTarget.getModel()
    const evr = this.upi.getEventRange(editor, detail)
    if (!evr) {
      return
    }
    const { crange } = evr
    const res = await this.process.doCaseSplit(editor.getBuffer(), crange)
    for (const { range, replacement } of res) {
      editor.setTextInBufferRange(range, replacement)
    }
  }

  @handleException
  private async sigFillCommand({ currentTarget, detail }: TECommandEvent) {
    const editor = currentTarget.getModel()
    const evr = this.upi.getEventRange(editor, detail)
    if (!evr) {
      return
    }
    const { crange } = evr
    const res = await this.process.doSigFill(editor.getBuffer(), crange)

    editor.transact(() => {
      const { type, range, body } = res
      const sig = editor.getTextInBufferRange(range)
      let indent = editor.indentLevelForLine(sig)
      const pos = range.end
      const text = `\n${body}`
      if (type === 'instance') {
        indent += 1
        if (!sig.endsWith(' where')) {
          editor.setTextInBufferRange([range.end, range.end], ' where')
        }
      }
      const newrange = editor.setTextInBufferRange([pos, pos], text)
      newrange
        .getRows()
        .slice(1)
        .map((row) => editor.setIndentationForBufferRow(row, indent))
    })
  }

  @handleException
  private async goToDeclCommand({ currentTarget, detail }: TECommandEvent) {
    const editor = currentTarget.getModel()
    const evr = this.upi.getEventRange(editor, detail)
    if (!evr) {
      return
    }
    const { crange } = evr
    const { info } = await this.process.getInfoInBuffer(editor, crange)
    const res = /.*-- Defined at (.+):(\d+):(\d+)/.exec(info)
    if (!res) {
      return
    }
    const [fn, line, col] = res.slice(1)
    const rootDir = await this.process.getRootDir(editor.getBuffer())
    if (!rootDir) {
      return
    }
    const uri = rootDir.getFile(fn).getPath() || fn
    await atom.workspace.open(uri, {
      initialLine: parseInt(line, 10) - 1,
      initialColumn: parseInt(col, 10) - 1,
    })
  }

  @handleException
  private async insertImportCommand({ currentTarget, detail }: TECommandEvent) {
    const editor = currentTarget.getModel()
    const buffer = editor.getBuffer()
    const evr = this.upi.getEventRange(editor, detail)
    if (!evr) {
      return
    }
    const { crange } = evr
    const lines = await this.process.findSymbolProvidersInBuffer(editor, crange)
    const mod = await importListView(lines)
    if (mod) {
      const pi = await new Promise<{ pos: Point; indent: string; end: string }>(
        (resolve) => {
          buffer.backwardsScan(/^(\s*)(import|module)/, ({ match, range }) => {
            let indent = ''
            switch (match[2]) {
              case 'import':
                indent = `\n${match[1]}`
                break
              case 'module':
                indent = `\n\n${match[1]}`
                break
            }
            resolve({
              pos: buffer.rangeForRow(range.start.row, false).end,
              indent,
              end: '',
            })
          })
          // nothing found
          resolve({
            pos: buffer.getFirstPosition(),
            indent: '',
            end: '\n',
          })
        },
      )
      editor.setTextInBufferRange(
        [pi.pos, pi.pos],
        `${pi.indent}import ${mod}${pi.end}`,
      )
    }
  }

  private async typeTooltip(e: TextEditor, p: Range) {
    const { range, type } = await this.process.getTypeInBuffer(e.getBuffer(), p)
    return {
      range,
      text: {
        text: type,
        highlighter: atom.config.get('haskell-ghc-mod.highlightTooltips')
          ? 'hint.type.haskell'
          : undefined,
      },
    }
  }

  private async infoTooltip(e: TextEditor, p: Range) {
    const { range, info } = await this.process.getInfoInBuffer(e, p)
    return {
      range,
      text: {
        text: info,
        highlighter: atom.config.get('haskell-ghc-mod.highlightTooltips')
          ? 'source.haskell'
          : undefined,
      },
    }
  }

  private async infoTypeTooltip(e: TextEditor, p: Range) {
    try {
      return await this.infoTooltip(e, p)
    } catch {
      return this.typeTooltip(e, p)
    }
  }

  private async typeInfoTooltip(e: TextEditor, p: Range) {
    try {
      return await this.typeTooltip(e, p)
    } catch {
      return this.infoTooltip(e, p)
    }
  }

  private async typeAndInfoTooltip(e: TextEditor, p: Range) {
    const typeP = this.typeTooltip(e, p).catch(() => undefined)
    const infoP = this.infoTooltip(e, p).catch(() => undefined)
    const [type, info] = await Promise.all([typeP, infoP])
    let range: Range
    let text: string
    if (type && info) {
      range = type.range.union(info.range)
      const sup = atom.config.get(
        'haskell-ghc-mod.suppressRedundantTypeInTypeAndInfoTooltips',
      )
      if (sup && info.text.text.includes(`:: ${type.text.text}`)) {
        text = info.text.text
      } else {
        text = `:: ${type.text.text}\n${info.text.text}`
      }
    } else if (type) {
      range = type.range
      text = `:: ${type.text.text}`
    } else if (info) {
      range = info.range
      text = info.text.text
    } else {
      throw new Error('Got neither type nor info')
    }
    const highlighter = atom.config.get('haskell-ghc-mod.highlightTooltips')
      ? 'source.haskell'
      : undefined
    return { range, text: { text, highlighter } }
  }

  private setHighlighter() {
    if (atom.config.get('haskell-ghc-mod.highlightMessages')) {
      return (m: UPI.IResultItem): UPI.IResultItem => {
        if (typeof m.message === 'string') {
          const message: UPI.IMessageText = {
            text: m.message,
            highlighter: 'hint.message.haskell',
          }
          return { ...m, message }
        } else {
          return m
        }
      }
    } else {
      return (m: UPI.IResultItem) => m
    }
  }

  private setMessages(type: keyof TLastMessages, messages: UPI.IResultItem[]) {
    this.lastMessages[type] = messages.map(this.setHighlighter())
    this.sendMessages()
  }

  private sendMessages() {
    this.upi.setMessages(
      this.processMessages.concat(
        this.lastMessages.check,
        this.lastMessages.lint,
      ),
    )
  }

  @handleException
  private async checkLint(
    buffer: TextBuffer,
    opt: 'Save' | 'Change',
    fast: boolean,
  ) {
    const check = atom.config.get(`haskell-ghc-mod.on${opt}Check` as
      | 'haskell-ghc-mod.onSaveCheck'
      | 'haskell-ghc-mod.onChangeCheck')
    const lint = atom.config.get(`haskell-ghc-mod.on${opt}Lint` as
      | 'haskell-ghc-mod.onSaveLint'
      | 'haskell-ghc-mod.onChangeLint')
    const promises = []
    if (check) {
      promises.push(
        this.process.doCheckBuffer(buffer, fast).then((res) => {
          this.setMessages('check', res)
        }),
      )
    }
    if (lint) {
      promises.push(
        this.process.doLintBuffer(buffer).then((res) => {
          this.setMessages('lint', res)
        }),
      )
    }
    await Promise.all(promises)
  }

  private consoleReport(arg: IErrorCallbackArgs) {
    // tslint:disbale-next-line: no-console
    console.error(Util.formatError(arg), Util.getErrorDetail(arg))
  }

  private handleProcessError(arg: IErrorCallbackArgs) {
    switch (this.msgBackend) {
      case 'upi':
        this.processMessages.push({
          message:
            Util.formatError(arg) +
            '\n\nSee console (View → Developer → Toggle Developer Tools → Console tab) for details.',
          severity: 'ghc-mod',
        })
        this.consoleReport(arg)
        this.sendMessages()
        break
      case 'console':
        this.consoleReport(arg)
        break
      case 'popup':
        this.consoleReport(arg)
        atom.notifications.addError(Util.formatError(arg), {
          detail: Util.getErrorDetail(arg),
          dismissable: true,
        })
        break
    }
  }

  private handleProcessWarning(warning: string) {
    switch (this.msgBackend) {
      case 'upi':
        this.processMessages.push({
          message: warning,
          severity: 'ghc-mod',
        })
        Util.warn(warning)
        this.sendMessages()
        break
      case 'console':
        Util.warn(warning)
        break
      case 'popup':
        Util.warn(warning)
        atom.notifications.addWarning(warning, {
          dismissable: false,
        })
        break
    }
  }
}
