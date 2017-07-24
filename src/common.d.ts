declare interface IEventDesc {
  currentTarget: HTMLElement & { getModel (): AtomTypes.TextEditor }
  abortKeyBinding? (): void
  detail: Object
}

interface MyEmitter<EmitterArgMap> extends AtomTypes.Emitter {
    on<K extends keyof EmitterArgMap> (eventName: K, handler: (arg: EmitterArgMap[K]) => void): AtomTypes.Disposable
    emit<K extends keyof EmitterArgMap> (eventName: K, value: EmitterArgMap[K]): void
}
