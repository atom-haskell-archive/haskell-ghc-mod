export {}
declare module 'atom' {
  interface ConfigValues {
    'haskell-ghc-mod': Object
    'haskell-ghc-mod.ghcModPath': string
    'haskell-ghc-mod.enableGhcModi': boolean
    'haskell-ghc-mod.lowMemorySystem': boolean
    'haskell-ghc-mod.debug': boolean
    'haskell-ghc-mod.builderManagement': boolean
    'haskell-ghc-mod.additionalPathDirectories': Array<string>
    'haskell-ghc-mod.cabalSandbox': boolean
    'haskell-ghc-mod.stackSandbox': boolean
    'haskell-ghc-mod.initTimeout': number
    'haskell-ghc-mod.interactiveInactivityTimeout': number
    'haskell-ghc-mod.interactiveActionTimeout': number
    'haskell-ghc-mod.onSaveCheck': boolean
    'haskell-ghc-mod.onSaveLint': boolean
    'haskell-ghc-mod.onChangeCheck': boolean
    'haskell-ghc-mod.onChangeLint': boolean
    'haskell-ghc-mod.alwaysInteractiveCheck': boolean
    'haskell-ghc-mod.onMouseHoverShow':
      | ''
      | 'type'
      | 'info'
      | 'infoType'
      | 'typeInfo'
      | 'typeAndInfo'
    'haskell-ghc-mod.onSelectionShow':
      | ''
      | 'type'
      | 'info'
      | 'infoType'
      | 'typeInfo'
      | 'typeAndInfo'
    'haskell-ghc-mod.maxBrowseProcesses': number
    'haskell-ghc-mod.highlightTooltips': boolean
    'haskell-ghc-mod.suppressRedundantTypeInTypeAndInfoTooltips': boolean
    'haskell-ghc-mod.highlightMessages': boolean
    'haskell-ghc-mod.hlintOptions': string[]
    'haskell-ghc-mod.experimental': boolean
    'haskell-ghc-mod.suppressGhcPackagePathWarning': boolean
    'haskell-ghc-mod.ghcModMessages': 'console' | 'upi' | 'popup'
    'haskell-ghc-mod.maxMemMegs': number
  }
}
