## 0.6.6
* Fix bug in getCompletionsForSymbolInModule

## 0.6.5
* Fix typo (`rootDi` instead of `rootDir`)
* After 60 minutes of inactivity, kill Ghc-Modi

## 0.6.4
* Return at least something from getRootDir (attempt at fixing #17, #18)

## 0.6.3
* haskell-ide-backend 0.1.2 - adds getModulesExportingSymbolAt function
* Add `'` to word search regular expressions
* Properly dispose of emitters
* Completion-backend internal revamp

## 0.6.2
* Only search for symbol in current line
* Strip newlines from ghc-modi commands
* Fat arrow requied in ghc-modi proc.onExit (#14)

## 0.6.1
  * haskell-ide-backend 0.1.1

    Returns {type/info}=undefined if no type/info found

## 0.6.0
  * Backend services docs and fixes
  * Near-final version of API
  * Frontend removal notice

## 0.5.1
  * Deprecation fix

## 0.5.0
  * Ide-haskell compatibility (disable editor control etc)
  * Queue commands
  * Use BufferedProcess
  * Haskell-ghc-mod service deprecated, new services implemented

## 0.4.3
  * code cleanup
  * add filename and path to doCheck callback
  * Filter current file in doCheck
  * Add tempfile path as getInfo callback parameter
  * Replace tempfile path with actual path in getInfo
  * Fix newlines in ghc-mod check
  * README update

## 0.4.2
  * BUGFIX: Fat arrow in main module
  * Force ghc-mod for file check
  * Remove checkOnEdit option
  * Don't check file on open

## 0.4.1
  * Fix getRootPath deprecation

## 0.4.0
  * Migrate to new json-based service provider
  * Bump atom version

## 0.3.8
  * Check on open only if ghc-modi enabled

## 0.3.7
  * Fix windows path error

## 0.3.6
  * Fix gutter warning tooltips

## 0.3.5
  * Add option to disable ghc-modi (turns out there are a couple unresolved bugs in it)

## 0.3.4
  * Bugfixes

## 0.3.3
  * Preliminary support for cabal sandboxes

## 0.3.2
  * Better error reporting in case of ghc-modi failure

## 0.3.1
  * Fixed some deprecations

## 0.3.0
  * Service-hub API
  * Fix more obscure deprecations
  * Don't set globals
  * Persistent gutter tootlips

## 0.2.1
  * Use theme colors for decorations
  * Use different colors for warnings and errors

## 0.2.0
  * Use temp-files to feed buffer to ghc-mod directly
  * Add option to check file while editing (disabled by default)

## 0.1.5
  * Add options for check on save and ghc-mod path

## 0.1.4
  * BUGFIX: Sometimes, inserting type destroyed main cursor. Avoid that.

## 0.1.3
  * Experimental feature: insert type into editor
  * Highlight expression, type of which is showing

## 0.1.2
  * Use observeTextEditors instead of eachEditor

## 0.1.1
  * Stop ghc-modi if no Haskell files are open

## 0.1.0 - First Release
  * Basic functionality
