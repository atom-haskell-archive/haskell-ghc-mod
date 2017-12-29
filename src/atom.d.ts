export {}
declare module "atom" {
  interface CommandRegistryTargetMap {
    'atom-text-editor[data-grammar~="haskell"]': TextEditorElement
  }
}
