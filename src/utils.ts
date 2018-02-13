import { Location, Memento, TextDocumentChangeEvent, TextDocument, Position, workspace, Uri, DiagnosticCollection, ExtensionContext, languages, OutputChannel, window } from "vscode";
import { YcmServer } from "./server";
import { YcmLocation } from "./requests/utils";
import { YcmEventNotification } from "./requests/event";
import {setTimeout, clearTimeout} from 'timers'
import { EditCompletionTracker } from "./editCompletionTracker";

'use strict'

export class ExtensionGlobals
{
	static editTracker: EditCompletionTracker
	static extensionOpts: Memento
	static workingDir: string
	static diagnostics: DiagnosticCollection
	static output: OutputChannel

	static Init(context: ExtensionContext)
	{
		this.editTracker = new EditCompletionTracker()
		this.extensionOpts = context.globalState
		this.diagnostics = languages.createDiagnosticCollection("YouCompleteMe")
		this.output = window.createOutputChannel("YouCompleteMe");
		context.subscriptions.push(this.diagnostics, this.output)
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