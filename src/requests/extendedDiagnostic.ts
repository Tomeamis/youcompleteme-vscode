'use strict'

import { YcmSimpleRequest, YcmSimpleRequestArgs } from "./simpleRequest";
import { YcmLocation } from "./utils";
import { YcmServer } from "../server";
import { YcmDiagnosticData } from "./event";
import { Log } from "../utils";

export class YcmExtendedDiagnosticResponse
{
	extendedDiags: string[]
	constructor(res: string)
	{
		let strings = res.split('\n')
		//first one is just the error message
		this.extendedDiags = strings.slice(1);
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
