# youcompleteme-vscode README

This is the README for extension "youcompleteme-vscode". TODO. So much TODO

For now, much can be found out at https://github.com/Valloric/YouCompleteMe

This extension is very much a work in (slow) progress

## Features

- Code completion
- Go to definition
- Linting with extended information support
- Hover provider (types)
- FixIts

## Planned features

- More completer commands
- Provide some VSCode commands that fire off Ycmd commands

## Requirements

You must have Python and Ycmd somewhere. I may publish actual instructions 
on how to build it sometime in the future.
For now see https://github.com/Valloric/ycmd/blob/master/README.md for some instructions.
Also useful is ./build.py --help

## Extension Settings

This extension contributes the following settings:

* `YouCompleteMe.ycmdPath`: Path to ycmd (The path should contain ycmd/default_settings.json)
* `YouCompleteMe.pythonPath`: Full path of the python executable
* `YouCompleteMe.filetypes`: filetypes for completion
* `YouCompleteMe.triggerStrings.cpp`: Strings that trigger completion in C++ files
* `YouCompleteMe.triggerStrings.c`: Strings that trigger completion in C files
* `YouCompleteMe.reparseTimeout`: After this many milliseconds with no edits, the extension will 
	reparse the current file and add diagnostics
* `YouCompleteMe.logLevel`: The verbosity of logging
* `YouCompleteMe.reparseWaitDelay`: The amount of time in milliseconds to wait to retry a request
	that was denied because the file was still parsing
* `YouCompleteMe.fallbackToSemantic`: When set to true, if a non-semantic completions request
	returns nothing, YCM will try to get semantic completions

## Commands

* `YCM: Shutdown server`: Shutdown YCM server. It will be started again with reloaded settings
	when a request is sent to it.

## Known Issues

See Github issues

## Other

This is the first thing I am publishing, so please, excuse the mess.
