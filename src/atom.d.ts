export {}
declare module "atom" {
  interface CommandEvent {
    currentTarget: EventTarget & { getModel(): TextEditor }
  }
  interface Grammar {
    scopeName: string
  }
  interface TextEditor {
    bufferRangeForScopeAtPosition(scope: string, point: PointLike): Range
    setTextInBufferRange(range: RangeCompatible, text: string, options?:
        { normalizeLineEndings?: boolean, undo?: "skip" }): Range
  }
  interface AtomEnvironment {
    getConfigDirPath(): string
  }
}
