'use strict'

import { LogLevel, LogLevelFromString } from "./utils";
import { workspace, Disposable, Event, EventEmitter } from "vscode";

interface TriggerStrings
{
	cpp: string[]
}

interface ConfigItem<T>
{
	onDidChangeValue: Event<T>
	readonly value: T
}

class ConfigItemInternal<T> implements Disposable, ConfigItem<T>
{
	private _value: T
	private eventEmitter: EventEmitter<T>
	public onDidChangeValue: Event<T>

	constructor()
	{
		this.eventEmitter = new EventEmitter<T>()
		this.onDidChangeValue = this.eventEmitter.event
	}

	public set value(nval: T)
	{
		if((typeof nval === "string" || typeof nval === "number") && nval === this._value)
		{
			//don't call events when value does not change
			return
		}
		this._value = nval
		this.eventEmitter.fire(nval)
	}

	public get value(): T
	{
		return this._value
	}

	dispose(): void
	{
		this.eventEmitter.dispose()
	}

}

export class ExtensionConfig implements Disposable
{
	
	private _ycmdPath: ConfigItemInternal<string>
	private _pythonPath: ConfigItemInternal<string>
	private _filetypes: ConfigItemInternal<string[]>
	private _triggerStrings: ConfigItemInternal<TriggerStrings>
	private _reparseTimeout: ConfigItemInternal<number>
	private _logLevel: ConfigItemInternal<LogLevel>

	public get ycmdPath(): ConfigItem<string>
	{
		return this._ycmdPath
	}
	public get pythonPath(): ConfigItem<string>
	{
		return this._pythonPath
	}
	public get filetypes(): ConfigItem<string[]>
	{
		return this._filetypes
	}
	public get triggerStrings(): ConfigItem<TriggerStrings>
	{
		return this._triggerStrings
	}
	public get reparseTimeout(): ConfigItem<number>
	{
		return this._reparseTimeout
	}
	public get logLevel(): ConfigItem<LogLevel>
	{
		return this._logLevel
	}

	constructor()
	{
		this._ycmdPath = new ConfigItemInternal<string>()
		this._pythonPath = new ConfigItemInternal<string>()
		this._filetypes = new ConfigItemInternal<string[]>()
		this._triggerStrings = new ConfigItemInternal<TriggerStrings>()
		this._reparseTimeout = new ConfigItemInternal<number>()
		this._logLevel = new ConfigItemInternal<LogLevel>()
		this.UpdateConfig()
	}

	dispose() {
		throw new Error("Method not implemented.");
	}

	public UpdateConfig()
	{
		let config = workspace.getConfiguration("YouCompleteMe")
		this._ycmdPath.value = config.get<string>("ycmdPath")
		this._pythonPath.value = config.get<string>("pythonPath")
		this._filetypes.value = config.get<string[]>("filetypes")
		this._reparseTimeout.value = config.get<number>("reparseTimeout")
		this._logLevel.value = LogLevelFromString(config.get<string>("logLevel"))
		this._triggerStrings.value = {cpp: config.get<string[]>("triggerStringsCpp")}
	}

}
