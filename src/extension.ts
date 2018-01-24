'use strict';
// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import {Log, LogLevel} from './utils'
import * as path from 'path'

import {YcmServer} from './server'
import {YcmHealthyRequest} from './requests/healthy'
import {YcmCompletionsRequest} from './requests/completions'
import { YcmLocation } from './requests/utils';
import {YcmEventNotification} from './requests/event'
import { Location, Position } from 'vscode';

// this method is called when your extension is activated
// your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {
	Log.SetLevel(LogLevel.DEBUG);

	// Use the console to output diagnostic information (console.log) and errors (console.error)
	// This line of code will only be executed once when your extension is activated
	console.log('Congratulations, your extension "youcompleteme-vscode" is now active!');

	// The command has been defined in the package.json file
	// Now provide the implementation of the command with  registerCommand
	// The commandId parameter must match the command field in package.json
	let disposable = vscode.commands.registerCommand('extension.sayHello', () => {
		// The code you place here will be executed every time your command is executed

		// Display a message box to the user
		vscode.window.showInformationMessage('Hello World!');

		let p = YcmServer.GetInstance(vscode.workspace.workspaceFolders[0].uri.fsPath);
		p.then(async server => {
			let req = new YcmCompletionsRequest(new YcmLocation(13, 4, "c:\\Dev\\cpptest\\test.cpp"))
			let resP = req.Send(server)
			try
			{
				let res = await resP
				Log.Debug("Got completions response: ", res);
			}
			catch(err)
			{
				Log.Error("Completion error: ", err)
			}
		});
		p.catch(err => Log.Error("Server start failed: ", err));

		
		
	})

	//TODO: send change notifications

	context.subscriptions.push(disposable);

	disposable = vscode.workspace.onDidChangeTextDocument(async change => {
		let pServer = YcmServer.GetInstance(vscode.workspace.workspaceFolders[0].uri.fsPath)
		let changedDoc = change.document
		//as good as any
		let vscodePos = new Position(0, 0)
		let location = YcmLocation.FromVscodePosition(changedDoc, vscodePos)
		//TODO: add a timer so this is not emitted every keypress
		{
			let notification = new YcmEventNotification(location, "FileReadyToParse")
			try
			{
				let server = await pServer
				let pResponse = notification.Send(server)
				Log.Debug("FileReadyToParse response: ", await pResponse)
			}
			catch(err)
			{
				Log.Error(err)
			}
		}
	})

	context.subscriptions.push(disposable)

}

// this method is called when your extension is deactivated
export function deactivate() {
}