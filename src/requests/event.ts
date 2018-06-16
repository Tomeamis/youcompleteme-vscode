'use strict'

import {YcmLocation, YcmRange, HandleRequestError} from './utils'
import {YcmServer} from '../server'
import {Diagnostic, DiagnosticSeverity, TextDocument, DiagnosticRelatedInformation, Location} from 'vscode'
import { YcmSimpleRequest } from './simpleRequest';
import { YcmExtendedDiagnosticRequest } from './extendedDiagnostic';
import { Log } from '../utils';

type YcmEvent = 
	'FileReadyToParse' |
	'BufferUnload' |
	'CurrentIdentifierFinished'

export class YcmEventNotification extends YcmSimpleRequest
{
	constructor(loc: YcmLocation, public event_name: YcmEvent)
	{
		super(loc)
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
	extendedDiagnostic

	constructor(diagnostic: any)
	{
		this.ranges = diagnostic.ranges.map(x => YcmRange.FromSimpleObject(x))
		this.location = YcmLocation.FromSimpleObject(diagnostic.location)
		this.location_extent = YcmRange.FromSimpleObject(diagnostic.location_extent)
		this.text = diagnostic.text
		this.kind = diagnostic.kind
	}

	public async ToVscodeDiagnostic(contextDoc: TextDocument): Promise<Diagnostic>
	{
		let kind = this.kind === "WARNING" ? DiagnosticSeverity.Warning : DiagnosticSeverity.Error
		let result: Diagnostic
		let detailReq = new YcmExtendedDiagnosticRequest(this);
		let pExtendedDiag = detailReq.Send(await YcmServer.GetInstance());
		if(this.location.filepath == contextDoc.fileName)
		{
			result = new Diagnostic(
				await this.location_extent.ToVscodeRange(), 
				this.text,
				kind
			)
		}
		//TODO: check if the location is in the workspace, an place it in that document if it is
		else
		{
			let realLoc = await this.location.GetVscodeLoc()
			result = new Diagnostic(
				contextDoc.lineAt(0).range,
				//even most programmers expect 1-based indexing in file coordinates
				//still translate to VScode pos in order to get characters instead of byte offsets
				`${this.text} at ${this.location.filepath}:${realLoc.pos.line+1}:${realLoc.pos.character+1}`,
				kind
			)
		}
		try
		{
			//the diag must be complete when assigned to the collection.
			//assigning the related info afterwards doesn't work
			//OTOH, the diags are awaited in parallel, so ¯\_(ツ)_/¯
			let extendedDiag = await pExtendedDiag
			let pDiags = extendedDiag.extendedDiags.map(async (extendedDiag) => {
				return new DiagnosticRelatedInformation(
					new Location(
						contextDoc.uri,
						(await this.location.GetVscodeLoc()).pos
					),
					extendedDiag
				)
			})
			result.relatedInformation = await Promise.all(pDiags)
		}
		catch(e)
		{
			//Exception. This is just extended info, so probably not important. 
			//Log as unimportant and otherwise ignore
			Log.Debug("Getting extended diags failed: ", e);
		}
		return result
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
