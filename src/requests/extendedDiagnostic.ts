'use strict'

import { YcmSimpleRequest } from "./simpleRequest";
import { YcmServer } from "../server";
import { YcmDiagnosticData } from "./event";
import { Log } from "../utils";
import { YcmLocation } from "./utils";

export class YcmExtendedDiagnostic
{
	text: string
	location: YcmLocation

	constructor(loc: YcmLocation, text: string)
	constructor(ycmDiag: string)
	constructor(firstArg: string|YcmLocation, text?: string)
	{
		if(typeof firstArg === "string")
		{
			let parsed = /(.+):(\d+):(\d+):(.+)/.exec(firstArg)
			this.text = parsed[4]
			let file = parsed[1]
			let row = parseInt(parsed[2], 10)
			let col = parseInt(parsed[3], 10)
			this.location = new YcmLocation(row, col, file)
		}
		else
		{
			this.location = firstArg
			this.text = text
		}
	} 
}

export class YcmExtendedDiagnosticResponse
{
	extendedDiags: YcmExtendedDiagnostic[]
	constructor(res: string)
	{
		let strings = res.split('\n')
		//first one is just the error message
		this.extendedDiags = strings.slice(1).map(msg => {
			return new YcmExtendedDiagnostic(msg)
		})
	}
}

export class YcmExtendedDiagnosticRequest extends YcmSimpleRequest
{
	public constructor(
		diagnostic: YcmDiagnosticData
	)
	{
		super(diagnostic.location)
	}

	//TODO: parse (locations and so on)
	public async Send(server: YcmServer): Promise<YcmExtendedDiagnosticResponse>
	{
		Log.Debug("Sending request for detailed diagnostics:")
		Log.Trace(this)
		let p = super.Send(server, "/detailed_diagnostic")
		return new YcmExtendedDiagnosticResponse((await p).message)
	}
}
