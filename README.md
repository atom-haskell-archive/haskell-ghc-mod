# haskell-ghc-mod atom package

This package is primarily intended as backend for [ide-haskell](https://atom.io/packages/ide-haskell).

Haskell ghc-mod opens pipe to ghc-modi and queries types, info and checks
for errors. It uses temporary files to feed them into ghc-mod (since it does
not read from stdin)

If ghc-mod/ghc-modi is not in your PATH, set full path to those in config.

## Dependencies

NOTE: when using with stack, see https://github.com/atom-haskell/haskell-ghc-mod/wiki/Using-with-stack

You need to have `ghc-mod`, `ghc-modi` (part of ghc-mod) and `hlint` executables
installed on your system. `ghc-mod` needs to be able to find `hlint` (eiter add `hlint` directory to PATH, or install both in the same cabal sandbox).

Supported `ghc-mod` versions are 5.5.x. and up. 5.4 is deprecated, but should work in most cases. Earlier versions most likely won't work.

Quick setup is as follows:

```
$ cabal update
$ cabal install ghc-mod
```

After this process finishes, you'll have `ghc-mod`, `ghc-modi` and `hlint` available in `$HOME/.cabal/bin/` directory.

Please note, that for ghc>=7.10 and/or cabal>=1.22, you need ghc-mod>=5.3.0.0. ghc-mod versions before 5.3.0.0 won't work.

User interface is provided by [ide-haskell](https://atom.io/packages/ide-haskell)

## Atom Linter package support

haskell-ghc-mod can use [linter](https://atom.io/packages/linter) package instead of ide-haskell to show check and lint results. You still need ide-haskell for type/info tooltips though.

To use linter, enable 'Use Linter' option in haskell-ghc-mod settings. Bear in mind, that it will disable ide-haskell markers for check/lint results. As of now, no additional checks are preformed, so if linter package is not installed or disabled, you won't see check/lint results at all.

## Installation

```
$ apm install language-haskell haskell-ghc-mod ide-haskell autocomplete-haskell
```

## Configuration

NOTE: when using with stack, see https://github.com/atom-haskell/haskell-ghc-mod/wiki/Using-with-stack

Only configuration option you will likely need to set is `ghcModPath`. It needs to be set to full path to `ghc-mod` executable, if it is not in your PATH. For example, if you have `ghc-mod` in `/home/user/.cabal/bin/`, you need to write `/home/user/.cabal/bin/ghc-mod` in `ghcModPath`. Note that shell expansions are *not* suported, i.e. you can't use `~` or `$HOME`.

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

## Keybindings

Haskell-ghc-mod comes with little pre-specified keybindings, so you will need to specify your own, if you want those.

You can edit Atom keybindings by opening 'Edit → Open Your Keymap'. Here is a template for all commands, provided by haskell-ghc-mod:

```cson
'atom-text-editor[data-grammar~="haskell"]':
  '': 'haskell-ghc-mod:check-file'
  '': 'haskell-ghc-mod:lint-file'
  'ctrl-alt-t': 'haskell-ghc-mod:show-type' #this is an example binding
  'ctrl-alt-i': 'haskell-ghc-mod:show-info' #this is an example binding
  'ctrl-alt-T': 'haskell-ghc-mod:insert-type' #this is an example binding
  '': 'haskell-ghc-mod:case-split'
  '': 'haskell-ghc-mod:sig-fill'
  '': 'haskell-ghc-mod:show-info-fallback-to-type'
  '': 'haskell-ghc-mod:show-type-fallback-to-info'
  '': 'haskell-ghc-mod:show-type-and-info'
  '': 'haskell-ghc-mod:insert-import'
  '': 'haskell-ghc-mod:go-to-declaration'

'atom-workspace':
  '': 'haskell-ghc-mod:shutdown-backend'
```

## Service-hub API

Since 1.0.0, haskell-ghc-mod provides `haskell-completion-backend` service.

**NOTE**: Prior to 1.0.0, ide-backend service was provided. It has been scrapped in favor of ide-haskell's UPI.

You can find description in [completion-backend.coffee][2]

[2]:https://github.com/atom-haskell/haskell-ghc-mod/blob/master/lib/completion-backend/completion-backend.coffee

# Advanced configuration

In some cases, it could be useful to disable ghc-mod completely for a given project (e.g. GHCJS), or suppress error pop-ups (e.g. in case of known ghc-mod bugs where some features don't work, or don't always work).

You can create `.haskell-ghc-mod.json` file in project root (i.e. directory containing a `*.cabal` file, or -- in case of plain projects -- Atom's project root directory).

You can also create a global config file in `${ATOM_CONFIG_DIR}/haskell-ghc-mod.json`. `${ATOM_CONFIG_DIR}` is usually `${HOME}/.atom`, but you can check it's path by running `atom.getConfigDirPath()` in Atom's developer console (View → Developer → Toggle Developer Tools → Console).

Config file is a JSON file with the following fields:

- `"disable"` -- `true`/`false`. Will disable all ghc-mod functions entirely. If omitted, defaults to `false`.
- `"suppressErrors"` -- `true`/`false`. Will suppress error pop-ups. Those still will be displayed in Atom's console (View → Developer → Toggle Developer Tools), so if someting seems wierd, one could check there.
- `"ghcOptions"` -- Array of Strings. Options to pass to GHC. Can be useful to explicitly suppress warnings, e.g. `-fno-warn-unused-do-bind` or anything else.
- `"ghcModOptions"` -- Array of Strings. Arbitrary options to pass to ghc-mod. Bear in mind that you shouldn't *really* change most ghc-mod options, since the package makes some assumptions on that part. Also only global ghc-mod options will work (i.e. no command-specific ones)

Example:

```json
{
  "disable": false,
  "suppressErrors": true,
  "ghcOptions": ["-fno-warn-unused-do-bind", "-fno-warn-name-shadowing"],
  "ghcModOptions": ["--with-ghc", "/path/to/custom/ghc"]
}
```

# License

This software is licensed under MIT license. See LICENSE.md for details.

Contributors:

* Nikolay Yakimov
* Daniel Gröber
* Petr Gladkikh
* Mike MacDonald
* Maiddog
* Jason Jackson
* Dennis J. McWherter Jr
* Aaron Wolf
