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

Quick setup is as follows:

```
$ cabal update
$ cabal install ghc-mod hlint
```

After this process finishes, you'll have `ghc-mod`, `ghc-modi` and `hlint` available in `$HOME/.cabal/bin/` directory.

Please note, that there are some problems with `ghc-mod` and `cabal>=1.22`.
Consult [ghc-mod wiki page][inconsistent-cabal] for more information.

I've had some success with `ghc-mod-4.1.6`, `ghc-7.8` and `cabal-1.22.3.0`.

User interface is provided by [ide-haskell](https://atom.io/packages/ide-haskell)

[inconsistent-cabal]: https://github.com/kazu-yamamoto/ghc-mod/wiki/InconsistentCabalVersions

## Installation

```
$ apm install language-haskell haskell-ghc-mod ide-haskell autocomplete-haskell
```

## Configuration

Only configuration options you will likely need to set are `ghcModPath` and
`ghcModiPath`. Both need to be set to full path to `ghc-mod` and `ghc-modi`
programs respectively, if those are not in your PATH.

There can be some problems with ghc-modi upstream, most notably, it does not
work on paths with whitespace. If you experience problems, try disabling
`ghc-modi` by setting `enableGhcModi` to `false` (or uncheck tick in settings).
This will be slower, but may work better on some configurations.

## Service-hub API

Since 0.6.0, haskell-ghc-mod provides two services, namely `haskell-ide-backend`
and `haskell-completion-backend`.

You can find description of these services in relevant source files:

* [ide-backend.coffee][1]
* [completion-backend.coffee][2]

[1]:https://github.com/atom-haskell/haskell-ghc-mod/lib/ide-backend.coffee
[2]:https://github.com/atom-haskell/haskell-ghc-mod/lib/completion-backend.coffee
