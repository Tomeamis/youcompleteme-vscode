import { Memento, ExtensionContext, OutputChannel, window, Disposable, workspace } from "vscode";
import { EditCompletionTracker } from "./editCompletionTracker";
import { DiagnosticAggregator } from "./diagnosticAggregator";
import * as fs from 'fs';
import JsonMemory = require('json-memory')
import * as path from 'path'
import * as makeDir from 'make-dir'

'use strict'

export class PersistentDict
{
	private storage: Promise<JsonMemory>

	constructor(backingFile: string)
	{
		this.storage = new Promise<JsonMemory>((resolve, reject) => {
			let mem = new JsonMemory(backingFile, (err, obj) => {
				if(err)
				{
					reject(err)
				}
				else
				{
					resolve(mem)
				}
			})
		}).catch<JsonMemory>(err => {
			if(typeof err === "string" && err.startsWith("ENOENT"))
			{
				return new JsonMemory(backingFile, false)
			}
			else throw `Opening PersistentDict backing file '${backingFile} failed.`
		})
	}

	async GetVal(key: string): Promise<any>
	{
		return (await this.storage)[key]
	}

	async SetVal(key: string, val: any, ensurePathExists?: boolean): Promise<void>
	{
		if(typeof ensurePathExists === "undefined")
		{
			ensurePathExists = false
		}
		let backing = await this.storage
		if(ensurePathExists)
		{
			let folderPath = path.dirname(backing._file)
			await makeDir(folderPath)
		}
		backing[key] = val
		return new Promise<void>((resolve, reject) => {
			backing.write(err => {
				if(err)
				{
					reject(err)
				}
				else
				{
					resolve()
				}
			})
		})
	}

}

class LocalSettings
{
	private store: PersistentDict
	private names = {
		extraConfWhitelist: "extraConfWhitelist",
		extraConfBlacklist: "extraConfBlacklist"
	}

	constructor()
	{
		this.store = new PersistentDict(path.resolve(ExtensionGlobals.workingDir, ".vscode", "ycmSettings.json"))
	}

	public get extraConfWhitelist(): Promise<string[]>
	{
		return this.store.GetVal(this.names.extraConfWhitelist);
	}

	public SetExtraConfWhitelist(val: string[])
	{
		this.store.SetVal(this.names.extraConfWhitelist, val)
	}

	public get extraConfBlacklist(): Promise<string[]>
	{
		return this.store.GetVal(this.names.extraConfBlacklist);
	}

	public SetExtraConfBlacklist(val: string[])
	{
		this.store.SetVal(this.names.extraConfBlacklist, val)
	}

}

class FileWatcher implements Disposable
{
	private watcher: fs.FSWatcher

	constructor(filename: string, callback: () => any)
	{
		this.watcher = fs.watch(filename, {persistent: false}, (event, file) => {
			callback()
		})
	}

	dispose()
	{
		this.watcher.close()
	}

}

class FileWatcherStore implements Disposable
{
	private store: {[filename: string]: FileWatcher}

	constructor()
	{
		this.store = {}
	}

	WatchFile(filename: string, callback: () => any): Disposable
	{
		if(typeof this.store[filename] !== "undefined")
		{
			throw "Watching one file with multiple callbacks is not supported yet"
		}
		this.store[filename] = new FileWatcher(filename, callback)
		return {
			dispose: () => {
				this.store[filename].dispose()
				this.store[filename] = undefined
			}
		} 
	}

	dispose()
	{
		for(let file of Object.getOwnPropertyNames(this.store))
		{
			this.store[file].dispose()
		}
	}
}

export class ExtensionGlobals
{
	static editTracker: EditCompletionTracker
	static extensionOpts: Memento
	static localSettings: LocalSettings
	static workingDir: string
	static output: OutputChannel
	static diags: DiagnosticAggregator
	static watchers: FileWatcherStore

	static Init(context: ExtensionContext)
	{
		//this should go first
		//TODO: handle nonexistence
		ExtensionGlobals.workingDir = workspace.workspaceFolders[0].uri.fsPath
		this.editTracker = new EditCompletionTracker()
		this.extensionOpts = context.globalState
		this.output = window.createOutputChannel("YouCompleteMe")
		this.diags = new DiagnosticAggregator(context)
		this.watchers = new FileWatcherStore()
		this.localSettings = new LocalSettings()
	}

	

}

export enum LogLevel
{
	NONE,
	FATAL,
	ERROR,
	WARNING,
	INFO,
	DEBUG,
	TRACE,
	ALL
}

export function LogLevelFromString(str: string): LogLevel
{
	switch(str)
	{
		case "none":
			return LogLevel.NONE
		case "fatal":
			return LogLevel.FATAL
		case "error":
			return LogLevel.ERROR
		case "warning":
			return LogLevel.WARNING
		case "info":
			return LogLevel.INFO
		case "debug":
			return LogLevel.DEBUG
		case "trace":
			return LogLevel.TRACE
		case "all":
			return LogLevel.ALL
	}
}

export class Log
{

	static level : LogLevel

	static SetLevel(level : LogLevel)
	{
		Log.level = level;
	}

	static Trace(...args): void
	{
		Log.WriteLog(LogLevel.TRACE, ...args)
	}

	static Debug(...args) : void
	{
		Log.WriteLog(LogLevel.DEBUG, ...args)
	}

	static Info(...args) : void
	{
		Log.WriteLog(LogLevel.INFO, ...args)
	}

	static Warning(...args) : void
	{
		Log.WriteLog(LogLevel.WARNING, ...args)
	}

	static Error(...args) : void
	{
		Log.WriteLog(LogLevel.ERROR, ...args)
	}

	static Fatal(...args) : void
	{
		Log.WriteLog(LogLevel.FATAL, ...args)
	}

	static WriteLog(level: LogLevel, ...args)
	{
		if(Log.level >= level)
		{
			switch(level)
			{
			case LogLevel.TRACE:
				args.unshift("TRACE: ")
				break
			case LogLevel.DEBUG:
				args.unshift("DEBUG: ")
				break
			case LogLevel.INFO:
				args.unshift("INFO: ")
				break
			case LogLevel.WARNING:
				args.unshift("WARNING: ")
				break
			case LogLevel.ERROR:
				args.unshift("ERROR: ")
				break
			case LogLevel.FATAL:
				args.unshift("FATAL: ")
				break
			}
			args.unshift(new Date())
			args.forEach(x => {
				let toPrint: string
				if(typeof x === "string")
				{
					toPrint = x
				}
				else
				{
					toPrint = JSON.stringify(x)
				}
				ExtensionGlobals.output.append(toPrint);
			})
			ExtensionGlobals.output.appendLine("")
		}
	}
	
}
