# haskell-ghc-mod atom package

Haskell Ghc-Mod opens pipe to ghc-modi and queries types, info and checks
for errors. It uses temporary files to feed them into ghc-mod (since it does
not read from stdin)

Error check is enabled by default on saving file (can be disabled in config). It
is also possible to check file on the fly, while you are editing it. But syntax
errors popping up all the time can be distracting, so this is disabled by
default.

You can also get type of composite expression by selecting it prior to executing
'show type', like this:

![Get type of composite expression][3]

Current features:

* Show type (ghc-mod type)
* Show symbol info (ghc-mod info)
* Check for errors (ghc-mod check)
* Insert type (symbol :: Type)

Default shortcuts:

* ctrl+alt+t: show type of selection/symbol under cursor
* ctrl+alt+i: show info on selection/symbol under cursor
* ctrl+alt+c: check for errors (done automatically on save)
* ctrl+alt+shift+t: insert type into buffer at line above current (experimental)

Haskell-ghc-mod depends on [language-haskell][1] to detect
Haskell sources.

If ghc-modi is not in your PATH, set full path to it in config.

![Screencast][2]

[1]: https://atom.io/packages/language-haskell
[2]: https://raw.githubusercontent.com/lierdakil/haskell-ghc-mod/master/screencast.gif
[3]: https://raw.githubusercontent.com/lierdakil/haskell-ghc-mod/master/composite.jpg
