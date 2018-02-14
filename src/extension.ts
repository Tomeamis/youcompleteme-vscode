'use strict';
// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import {Log, LogLevel, ExtensionGlobals, LogLevelFromString} from './utils'
import * as path from 'path'

import {YcmServer} from './server'
import {YcmHealthyRequest} from './requests/healthy'
import {YcmCompletionsRequest, YcmCompletionProvider} from './requests/completions'
import { YcmLocation } from './requests/utils';
import {YcmEventNotification} from './requests/event'
import { Location, Position, workspace, window, languages } from 'vscode';
import * as timers from 'timers'
import { YcmDefinitionProvider } from './requests/completerCommand';

// this method is called when your extension is activated
// your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {


	ExtensionGlobals.Init(context)
	{
		let levelStr = workspace.getConfiguration("YouCompleteMe").get("logLevel") as string
		Log.SetLevel(LogLevelFromString(levelStr));
	}

	// Use the console to output diagnostic information (console.log) and errors (console.error)
	// This line of code will only be executed once when your extension is activated
	Log.Info('Congratulations, your extension "youcompleteme-vscode" is now active!');
	
	//TODO: handle nonexistence
	ExtensionGlobals.workingDir = vscode.workspace.workspaceFolders[0].uri.fsPath

	// The command has been defined in the package.json file
	// Now provide the implementation of the command with  registerCommand
	// The commandId parameter must match the command field in package.json
	let disposable = vscode.commands.registerCommand('extension.sayHello', () => {
		// The code you place here will be executed every time your command is executed

		// Display a message box to the user
		vscode.window.showInformationMessage('Hello World!');
		
	})

	context.subscriptions.push(disposable);

	let filetypes = workspace.getConfiguration("YouCompleteMe").get("filetypes") as string[]
	let editTracker = ExtensionGlobals.editTracker

	disposable = vscode.workspace.onDidChangeTextDocument(x => editTracker.HandleDocChange(x))

	context.subscriptions.push(disposable)
	
	//on activation, load documents that are already open
	workspace.textDocuments.forEach(x => editTracker.SendDocReparseNotification(x))

	disposable = vscode.workspace.onDidOpenTextDocument(x => editTracker.SendDocReparseNotification(x))
	context.subscriptions.push(disposable)
	
	let triggers = workspace.getConfiguration("YouCompleteMe").get("triggerStrings") as string[]
	disposable = vscode.languages.registerCompletionItemProvider(
		filetypes,
		new YcmCompletionProvider(triggers),
		//VScode uses first char, we want last
		...triggers.map(seq => seq.slice(-1))
	);
	context.subscriptions.push(disposable)

	disposable = languages.registerDefinitionProvider(filetypes, new YcmDefinitionProvider)
	context.subscriptions.push(disposable)

}

// this method is called when your extension is deactivated
export function deactivate() {
}