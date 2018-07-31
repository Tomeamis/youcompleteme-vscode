'use strict';
// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import {Log, ExtensionGlobals} from './utils'
import {YcmCFamCompletionProvider} from './requests/completions'
import { languages } from 'vscode';
import { YcmDefinitionProvider } from './requests/completerCommand';
import { YcmServer } from './server';
import { ConfigItem } from './extensionConfig';

class MultiOptionProviderRegistrator implements vscode.Disposable
{
	private disposable: vscode.Disposable

	public constructor(
		private haveRelevantConfigsChanged: () => boolean,
		private updateProvider: () => vscode.Disposable
	)
	{
		this.disposable = updateProvider()
		ExtensionGlobals.extConfig.onDidChange(() => this.TryUpdateProvider())
	}

	TryUpdateProvider()
	{
		//if it's not undef and config hasn't changed, just keep the old one
		if(!this.haveRelevantConfigsChanged())
		{
			return
		}
		//dispose the old provider
		this.disposable.dispose()
		//add new provider
		this.updateProvider()
	}

	public dispose()
	{
		this.disposable.dispose()
	}
}

class SingleOptionProviderRegistrator<T> implements vscode.Disposable
{
	private disposable: vscode.Disposable

	constructor(cfg: ConfigItem<T>, private updateProvider: (nval: T) => vscode.Disposable)
	{
		this.disposable = updateProvider(cfg.value)
		cfg.onDidChangeValue(nval => this.disposable = this.updateProvider(nval))
	}

	public dispose()
	{
		this.disposable.dispose()
	}
}

function RegisterCFamProvider(lang: string, context: vscode.ExtensionContext)
{
	let disposable = new MultiOptionProviderRegistrator(
		() => {
			let config = ExtensionGlobals.extConfig
			return config.filetypes.wasChanged || config.triggerStrings.wasChanged
		}, () => {
			let config = ExtensionGlobals.extConfig
			let filetypes = config.filetypes.value
			if(!filetypes.find(type => type === lang))
			{
				//cpp is not being completed
				return
			}
			let triggers = config.triggerStrings.value
			return vscode.languages.registerCompletionItemProvider(
				lang,
				new YcmCFamCompletionProvider(triggers.cpp),
				...triggers[lang].map(seq => seq.slice(-1))
			)
		}
	)
	context.subscriptions.push(disposable)
}

// this method is called when your extension is activated
// your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {


	ExtensionGlobals.Init(context)

	// Use the console to output diagnostic information (console.log) and errors (console.error)
	// This line of code will only be executed once when your extension is activated
	Log.Info('Congratulations, your extension "youcompleteme-vscode" is now active!');

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

	RegisterCFamProvider("cpp", context)
	RegisterCFamProvider("c", context)

	disposable = new SingleOptionProviderRegistrator(
		filetypes, nval => languages.registerDefinitionProvider(nval, new YcmDefinitionProvider())
	)
	context.subscriptions.push(disposable)

	context.subscriptions.push(vscode.commands.registerCommand("YcmShutdownServer", () => YcmServer.Shutdown()))

	//shutdown server on unload
	context.subscriptions.push({dispose: () => YcmServer.Shutdown()})

}

// this method is called when your extension is deactivated
export function deactivate() {
}
