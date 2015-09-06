## 0.9.0
* Allow for hole completion refinement

## 0.8.14
* Revert tab tweaks

## 0.8.13
* Check point validity in pointWithTabs functions

## 0.8.12
* Fix pointWithTabs

## 0.8.11
* Tweak ranges for tabs
* Removed redirect-map ghc-mod version notification

## 0.8.10
* Fix deactivation error

## 0.8.9
* Fix #41 (undefined path in `new Directory` error on Windows)

## 0.8.8
* Fix ghc-mod args in error reporting

## 0.8.7
* Hotfix #37 (res can be undefined)

## 0.8.6
* Attempt at fixing #31 (Atom returns `atom://config` as project directory)

## 0.8.5
* Attempt at fixing #36 (rely on garbage collector more in `getBufferInfo`)

## 0.8.4
* atom.project.getDirectories() can return file in some cases (#32)

## 0.8.3
* Cleaner destruction of ModuleInfo/BufferInfo. Can help with heisenbugs.

## 0.8.2
* More verbose debugging output

## 0.8.1
* Update redirect commands to correspond with upstream updates

## 0.8.0
* Optional support of AtomLinter for displaying messages (doesn't need ide-haskell installed)
* Cache backends
* Drop support for older provider versions
* Provider versions bumped to 1.0.0

## 0.7.12
* Honor additional PATH in runLang and runFlag

## 0.7.11
* Add fallback child_process.execFile for ghc-mod commands

## 0.7.10
* Initial support for literate Haskell

## 0.7.9
* Fix some problems with standalone files (#29)

## 0.7.8
* Wasn't possible to disable startup warning on ide-haskell not installed.

## 0.7.7
* Separate completion queues for different tasks. Should result in better responsiveness on start.

## 0.7.6
* Cleanup
* More debugging output

## 0.7.5
* Rough fix for #24

## 0.7.4
* Try to fix path capitalization issues on Windows

## 0.7.3
* Relativize path on check in case ghc-mod returns full path for some reason

## 0.7.2
* Avoid two consecutive separators in PATH

## 0.7.1
* `additionalPathDirectories` configuration option

## 0.7.0
* Fixed typo in completion-backend.coffee (@crazymykl)
* Initial support for input file redirection (WIP on ghc-mod master)
* Display non-fatal ghc-mod errors in outputView (was: print to console)
* Don't pass buffer text as tempfile if it's saved
* Always get abs. URI for check results
* General cleanup, which hopefully helps with #20, #21
* Removed frontend

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
