'use strict';
// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import {Log, ExtensionGlobals} from './utils'

import {YcmCppCompletionProvider} from './requests/completions'
import { languages } from 'vscode';
import { YcmDefinitionProvider } from './requests/completerCommand';

// this method is called when your extension is activated
// your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {


	ExtensionGlobals.Init(context)

	// Use the console to output diagnostic information (console.log) and errors (console.error)
	// This line of code will only be executed once when your extension is activated
	Log.Info('Congratulations, your extension "youcompleteme-vscode" is now active!');

	//TODO: handle nonexistence
	ExtensionGlobals.workingDir = vscode.workspace.workspaceFolders[0].uri.fsPath

	// The command has been defined in the package.json file
	// Now provide the implementation of the command with  registerCommand
	// The commandId parameter must match the command field in package.json

	let disposable: vscode.Disposable

	/*
	let disposable = vscode.commands.registerCommand('extension.sayHello', () => {
		// The code you place here will be executed every time your command is executed

		// Display a message box to the user
		vscode.window.showInformationMessage('Hello World!');
		
	})

	context.subscriptions.push(disposable);*/

	let filetypes = ExtensionGlobals.extConfig.filetypes
	let editTracker = ExtensionGlobals.editTracker

	disposable = vscode.workspace.onDidChangeTextDocument(x => editTracker.HandleDocChange(x))

	context.subscriptions.push(disposable)
	
	//on activation, load documents that are already open
	vscode.window.visibleTextEditors.forEach(x => editTracker.SendDocReparseNotification(x.document))

	disposable = vscode.window.onDidChangeActiveTextEditor(x => {if(x) editTracker.SendDocReparseNotification(x.document)})
	context.subscriptions.push(disposable)
	
	let triggers = ExtensionGlobals.extConfig.triggerStrings.cpp
	disposable = vscode.languages.registerCompletionItemProvider(
		filetypes,
		new YcmCppCompletionProvider(triggers),
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
