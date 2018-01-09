export {}
declare module 'atom' {
  interface CommandRegistryTargetMap {
    'atom-text-editor[data-grammar~="haskell"]': TextEditorElement
  }
  interface Config {
    get<T extends keyof ConfigValues>(
      keyPath: T,
      options?: {
        sources?: string[]
        excludeSources?: string[]
        scope?: string[] | ScopeDescriptor
      },
    ): ConfigValues[T]
  }
}
