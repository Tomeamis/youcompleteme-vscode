# Change Log
All notable changes to the "youcompleteme-vscode" extension will be documented in this file.

Check [Keep a Changelog](http://keepachangelog.com/) for recommendations on how to structure this file.

## [Unreleased]

## [v0.4.6]

- Fix a bug with completion filtering. Previously, for example `PIN` would be filtered when `Pi` was typed

## [v0.4.5]

- Create .vscode directory if it doesn't exist and extra_conf black/whitelist should be saved

## [v0.4.4]

- Make the fallback to semantic completion more efficient

## [v0.4.3]

- Various fixes to the new features from 0.4.1 and 0.4.2

## [v0.4.2]

- Make the time to wait for the file to finish parsing configurable (`YouCompleteMe.reparseWaitDelay`)
- Add a config option to try semantic completion if the identifier engine fails (`YouCompleteMe.fallbackToSemantic`)

## [v0.4.1]

- Better error handling

## [v0.4.0]

- Support for C
- Type hovers
- FixIts

## [v0.3.2]

- Fix clearing of diagnostics when they are reported from multiple files

## [v0.3.1]

- If a diagnostic fails to resolve, just ignore it
- Fix loading of extra_conf files

## [v0.3.0]

- Fix errors handling extended diagnostics
- Add command to shut the server down
- Watch ycm_extra_conf files for changes and ask to restart on change
- Fix some more errors in communication with the server

## [v0.2.7]

- Fix errors in communication with the server.

## [v0.2.2]

- Improve diagnostics so that every diagnostic is displayed in 
	the file it is reported in, fix some problems in communication with the server.

## [v0.2.0]

- Add extended diagnostic information

## [v0.1.4]

- Add go to definition, fix bugs

## [v0.1.0]
- Initial release
