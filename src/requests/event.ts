'use strict'

import {YcmLocation, YcmFileDataMap, YcmRange, HandleRequestError} from './utils'
import {YcmServer} from '../server'
import {Diagnostic, DiagnosticSeverity, TextDocument, Range, Position} from 'vscode'

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
		try
		{
			let pResRaw = server.SendData('/event_notification', this)
			let res = await pResRaw
			return new YcmDiagnosticsResponse(res)
		}
		catch(err)
		{
			if(await HandleRequestError(err))
			{
				return this.Send(server)
			}
			else
			{
				//TODO: return empty response
			}
		}
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
		this.ranges = diagnostic.ranges.map(x => YcmRange.FromSimpleObject(x))
		this.location = YcmLocation.FromSimpleObject(diagnostic.location)
		this.location_extent = YcmRange.FromSimpleObject(diagnostic.location_extent)
		this.text = diagnostic.text
		this.kind = diagnostic.kind
	}

	public async ToVscodeDiagnostic(contextDoc: TextDocument)
	{
		let diagnosticRange: Range
		let kind = this.kind === "WARNING" ? DiagnosticSeverity.Warning : DiagnosticSeverity.Error
		if(this.location.filepath == contextDoc.fileName)
		{
			return new Diagnostic(
				await this.location_extent.ToVscodeRange(), 
				this.text,
				kind
			)
		}
		else
		{
			let realLoc = await this.location.GetVscodePosition()
			return new Diagnostic(
				contextDoc.lineAt(0).range,
				//even most programmers expect 1-based indexing in file coordinates
				//still translate to VScode pos in order to get characters instead of byte offsets
				`${this.text} at ${this.location.filepath}:${realLoc.pos.line+1}:${realLoc.pos.character+1}`,
				kind
			)
		}
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