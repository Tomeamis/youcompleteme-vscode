'use strict'

import {YcmLocation, YcmFileDataMap, YcmRange} from './utils'
import {YcmServer} from '../server'
import {Diagnostic, DiagnosticSeverity} from 'vscode'

type YcmEvent = 
	'FileReadyToParse' |
	'BufferUnload' |
	'CurrentIdentifierFinished'

export class YcmEventNotification extends YcmLocation
{
	file_data: YcmFileDataMap
	constructor(loc: YcmLocation, public event_name: YcmEvent)
	{
		super(loc)
		this.file_data = new YcmFileDataMap()
	}

	async Send(server: YcmServer): Promise<YcmDiagnosticsResponse>
	{
		let pResRaw = server.SendData('/event_notification', this)
		let res = JSON.parse(await pResRaw)
		return new YcmDiagnosticsResponse(res)
	}

}

export class YcmDiagnosticData
{
	ranges: YcmRange[]
	location: YcmLocation
	location_extent: YcmRange
	text: string
	kind: "WARNING" | "ERROR"

	constructor(diagnostic: any)
	{
		this.ranges = diagnostic.ranges
		this.location = diagnostic.location
		this.location_extent = diagnostic.location_extent
		this.text = diagnostic.text
		this.kind = diagnostic.kind
	}

	public ToVscodeDiagnostic()
	{
		return new Diagnostic(
			this.location_extent.ToVscodeRange(), 
			this.text,
			this.kind === "WARNING" ? DiagnosticSeverity.Warning : DiagnosticSeverity.Error
		)
	}

}

export class YcmDiagnosticsResponse
{
	diagnostics: YcmDiagnosticData[]
	constructor(diagnostics: any[])
	{
		if(diagnostics instanceof Array)
		{
			this.diagnostics = diagnostics.map(x => new YcmDiagnosticData(x))
		}
	}
}