'use strict'

import { LogLevel, LogLevelFromString } from "./utils";
import { workspace, Disposable, Event, EventEmitter, CompletionTriggerKind } from "vscode";

interface TriggerStrings
{
	cpp: string[]
}

function IsTriggerStrings(obj): obj is TriggerStrings
{
	if(obj && typeof obj === "object" && (obj.cpp instanceof Array))
	{
		let cpp = obj.cpp as Array<any>
		return cpp.every(val => typeof val === "string")
	}
}

export interface ConfigItem<T>
{
	onDidChangeValue: Event<T>
	readonly value: T
	readonly wasChanged: boolean
}

class ConfigItemInternal<T> implements Disposable, ConfigItem<T>
{
	private _value: T
	private eventEmitter: EventEmitter<T>
	public onDidChangeValue: Event<T>
	private _wasChanged: boolean

	constructor()
	{
		this._wasChanged = false
		this.eventEmitter = new EventEmitter<T>()
		this.onDidChangeValue = this.eventEmitter.event
	}

	private static AreEquivalent(val, nval): boolean
	{
		if(typeof val === "undefined")
		{
			//undefined-> will change
			return false
		}
		//support basic types as it's easy
		if(typeof nval === "string" || typeof nval === "number")
		{
			return val === nval
		}
		//likewise support arrays
		else if(nval instanceof Array)
		{
			let valArr = val as Array<any>
			if(nval.length != valArr.length)
			{
				return false
			}
			return (<Array<any>> val).every((val, i) => this.AreEquivalent(nval[i], val))
		}
		//support TriggerStrings, 'cause we use that
		else if(IsTriggerStrings(nval))
		{
			return this.AreEquivalent((<TriggerStrings> val).cpp, nval.cpp)
		}
		else return false
	}

	public set value(nval: T)
	{
		//do nothing if values are equivalent
		if(ConfigItemInternal.AreEquivalent(this._value, nval))
		{
			this._wasChanged = false
			return
		}
		this._value = nval
		this._wasChanged = true
		this.eventEmitter.fire(nval)
	}

	public get value(): T
	{
		return this._value
	}

	public get wasChanged(): boolean
	{
		return this._wasChanged
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

	private emitter: EventEmitter<void>
	public onDidChange: Event<void>

	private static readonly sectionName = "YouCompleteMe"

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
		this.emitter = new EventEmitter()
		this.onDidChange = this.emitter.event
		this._ycmdPath = new ConfigItemInternal<string>()
		this._pythonPath = new ConfigItemInternal<string>()
		this._filetypes = new ConfigItemInternal<string[]>()
		this._triggerStrings = new ConfigItemInternal<TriggerStrings>()
		this._reparseTimeout = new ConfigItemInternal<number>()
		this._logLevel = new ConfigItemInternal<LogLevel>()
		this.UpdateConfig()
		workspace.onDidChangeConfiguration(event => {
			if(event.affectsConfiguration(ExtensionConfig.sectionName))
			{
				this.UpdateConfig()
			}
		})
	}

	dispose() {
		this._ycmdPath.dispose()
		this._pythonPath.dispose()
		this._filetypes.dispose()
		this._triggerStrings.dispose()
		this._reparseTimeout.dispose()
		this._logLevel.dispose()
	}

	public UpdateConfig()
	{
		let changed = false
		let cb = () => {changed = true}
		let disposables = [
			this._ycmdPath.onDidChangeValue(cb),
			this._pythonPath.onDidChangeValue(cb),
			this._filetypes.onDidChangeValue(cb),
			this._reparseTimeout.onDidChangeValue(cb),
			this._logLevel.onDidChangeValue(cb),
			this._triggerStrings.onDidChangeValue(cb)
		]
		try
		{
			let config = workspace.getConfiguration(ExtensionConfig.sectionName)
			this._ycmdPath.value = config.get<string>("ycmdPath")
			this._pythonPath.value = config.get<string>("pythonPath")
			this._filetypes.value = config.get<string[]>("filetypes")
			this._reparseTimeout.value = config.get<number>("reparseTimeout")
			this._logLevel.value = LogLevelFromString(config.get<string>("logLevel"))
			this._triggerStrings.value = {cpp: config.get<string[]>("triggerStringsCpp")}
		}
		finally
		{
			Disposable.from(...disposables).dispose()
		}
		if(changed)
		{
			this.emitter.fire()
		}
	}

}
