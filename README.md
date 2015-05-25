# haskell-ghc-mod atom package

This package is primarily intended as backend for [ide-haskell](https://atom.io/packages/ide-haskell). Frontend will be completely
removed in v0.7.0

Haskell Ghc-Mod opens pipe to ghc-modi and queries types, info and checks
for errors. It uses temporary files to feed them into ghc-mod (since it does
not read from stdin)

If ghc-mod/ghc-modi is not in your PATH, set full path to those in config.

## Dependencies

You need to have `ghc-mod`, `ghc-modi` (part of Ghc-Mod) and `hlint` executables
installed on your system. `ghc-mod` needs to be able to find `hlint` (eiter add `hlint` directory to PATH, or install both in the same cabal sandbox).

User interface is provided by [ide-haskell](https://atom.io/packages/ide-haskell)

## Service-hub API

Since 0.6.0, haskell-ghc-mod provides two services, namely `haskell-ide-backend`
and `haskell-completion-backend`.

You can find description of these services in relevant source files:

* [ide-backend.coffee][1]
* [completion-backend.coffee][2]

[1]:https://github.com/atom-haskell/haskell-ghc-mod/lib/ide-backend.coffee
[2]:https://github.com/atom-haskell/haskell-ghc-mod/lib/completion-backend.coffee
