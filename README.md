# haskell-ghc-mod atom package

This package is primarily intended as backend for [ide-haskell](https://atom.io/packages/ide-haskell).

Haskell Ghc-Mod opens pipe to ghc-modi and queries types, info and checks
for errors. It uses temporary files to feed them into ghc-mod (since it does
not read from stdin)

If ghc-mod/ghc-modi is not in your PATH, set full path to those in config.

## Dependencies

You need to have `ghc-mod`, `ghc-modi` (part of Ghc-Mod) and `hlint` executables
installed on your system. `ghc-mod` needs to be able to find `hlint` (eiter add `hlint` directory to PATH, or install both in the same cabal sandbox).

Supported `ghc-mod` versions are from 4.1.0 to 5.2.1.2, and 5.4.x. 5.3.x might work, but is not officially supported.

Quick setup is as follows:

```
$ cabal update
$ cabal install ghc-mod hlint
```

After this process finishes, you'll have `ghc-mod`, `ghc-modi` and `hlint` available in `$HOME/.cabal/bin/` directory.

Please note, that there are some problems with `ghc-mod` and `cabal>=1.22`.
Consult [ghc-mod wiki page][inconsistent-cabal] for more information.

User interface is provided by [ide-haskell](https://atom.io/packages/ide-haskell)

[inconsistent-cabal]: https://github.com/kazu-yamamoto/ghc-mod/wiki/InconsistentCabalVersions

## Installation

```
$ apm install language-haskell haskell-ghc-mod ide-haskell autocomplete-haskell
```

## Configuration

Only configuration options you will likely need to set are `ghcModPath` and,
for ghc-mod<5.4.0.0, `ghcModiPath`. Both need to be set to full path to `ghc-mod` and `ghc-modi` programs respectively, if those are not in your PATH.

Note, that ghc-mod>=5.4.0.0 doesn't use `ghcModiPath` setting (instead running
ghc-mod in interactive mode directly).

There can be some problems with ghc-modi upstream, most notably, it does not
work on paths with whitespace. If you experience problems, try disabling
`ghc-modi` by setting `enableGhcModi` to `false` (or uncheck tick in settings).
This will be slower, but may work better on some configurations.

If you are on OSX, or have ghc installed with non-standard prefix, you may also
consider adding path to directory containing ghc/ghci executable to
`additionalPathDirectories` configuration option. It is a comma-separated list
of directories that will be added to your search path when invoking ghc-mod.
For example, if you have ghc installed to `/usr/local`, then you would add
`/usr/local/bin` to `additionalPathDirectories`.

On OSX, if you start Atom from Finder or with desktop icon, it doesn't inherit
environment variables specified in your user shell (in `.profile`, `.bashrc`,
etc). You can copy `PATH` settings from your shell to
`additionalPathDirectories`, if you'd like to run Atom in this way.

## Service-hub API

Since 0.6.0, haskell-ghc-mod provides two services, namely `haskell-ide-backend`
and `haskell-completion-backend`.

You can find description of these services in relevant source files:

* [ide-backend.coffee][1]
* [completion-backend.coffee][2]

[1]:https://github.com/atom-haskell/haskell-ghc-mod/blob/master/lib/ide-backend.coffee
[2]:https://github.com/atom-haskell/haskell-ghc-mod/blob/master/lib/completion-backend.coffee
