'use strict'

import { LogLevel, LogLevelFromString } from "./utils";
import { workspace } from "vscode";

interface TriggerStrings
{
	cpp: string[]
}

export class ExtensionConfig
{
	
	public ycmdPath: string
	public pythonPath: string
	public filetypes: string[]
	public triggerStrings: TriggerStrings
	public reparseTimeout: number
	public logLevel: LogLevel

	constructor()
	{
		this.triggerStrings = {cpp: []}
		this.UpdateConfig()
	}

	public UpdateConfig()
	{
		let config = workspace.getConfiguration("YouCompleteMe")
		this.ycmdPath = config.get<string>("ycmdPath")
		this.pythonPath = config.get<string>("pythonPath")
		this.filetypes = config.get<string[]>("filetypes")
		this.triggerStrings.cpp = config.get<string[]>("triggerStringsCpp")
		this.reparseTimeout = config.get<number>("reparseTimeout")
		this.logLevel = LogLevelFromString(config.get<string>("logLevel"))
	}

}
