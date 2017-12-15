# haskell-ghc-mod atom package ![](https://david-dm.org/atom-haskell/haskell-ghc-mod.svg)

This package is primarily intended as backend for [ide-haskell](https://atom.io/packages/ide-haskell).

Haskell ghc-mod opens pipe to ghc-modi and queries types, info and checks
for errors.

## Installation and configuration

Please refer to the official documentation site <https://atom-haskell.github.io>

## Service-hub API

Since 1.0.0, haskell-ghc-mod provides `haskell-completion-backend` service.

**NOTE**: Prior to 1.0.0, ide-backend service was provided. It has been scrapped in favor of ide-haskell's UPI.

You can find description in [src/completion-backend/index.ts][2]

[2]:https://github.com/atom-haskell/haskell-ghc-mod/blob/master/src/completion-backend/index.ts

# License

Copyright © 2015 Atom-Haskell

Contributors (by number of commits):

<!-- BEGIN CONTRIBUTORS LIST -->
* Nikolay Yakimov
* Daniel Gröber
* Petr Gladkikh
* Mike MacDonald
* Maiddog
* Maciej Aleksandrowicz
* Jason Jackson
* Dennis J. McWherter Jr
* Aaron Wolf

<!-- END CONTRIBUTORS LIST -->

See the [LICENSE.md][LICENSE] for details.

[LICENSE]: https://github.com/atom-haskell/haskell-ghc-mod/blob/master/LICENSE.md
