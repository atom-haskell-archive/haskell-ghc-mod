declare interface IEventDesc {
  currentTarget: HTMLElement & { getModel (): AtomTypes.TextEditor }
  abortKeyBinding? (): void
  detail: Object
}
