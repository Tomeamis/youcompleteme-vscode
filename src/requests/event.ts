'use strict'

import {YcmLocation, YcmRange, HandleRequestError} from './utils'
import {YcmServer} from '../server'
import {Diagnostic, DiagnosticSeverity, TextDocument, DiagnosticRelatedInformation, Location, Uri} from 'vscode'
import { YcmSimpleRequest } from './simpleRequest';
import { YcmExtendedDiagnosticRequest, YcmExtendedDiagnosticResponse, YcmExtendedDiagnostic } from './extendedDiagnostic';
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
		let res = await super.Send(server, '/event_notification')
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
	private extendedDiags: YcmExtendedDiagnostic[]
	private pExtendedDiags: Promise<YcmExtendedDiagnosticResponse>

	constructor(diagnostic: any)
	{
		this.ranges = diagnostic.ranges.map(x => YcmRange.FromSimpleObject(x))
		this.location = YcmLocation.FromSimpleObject(diagnostic.location)
		this.location_extent = YcmRange.FromSimpleObject(diagnostic.location_extent)
		this.text = diagnostic.text
		this.kind = diagnostic.kind
		this.pExtendedDiags = this.RequestExtendedDiag()
		this.extendedDiags = null
	}

	private async RequestExtendedDiag(): Promise<YcmExtendedDiagnosticResponse>
	{
		let detailReq = new YcmExtendedDiagnosticRequest(this)
		return detailReq.Send(await YcmServer.GetInstance())
	}

	public async ResolveExtendedDiags(): Promise<void>
	{
		if(this.pExtendedDiags !== null)
		{
			try
			{
				this.extendedDiags = (await this.pExtendedDiags).extendedDiags;
			}
			catch(e)
			{
				Log.Debug("Resolving extended diags failed: ", e);
				this.extendedDiags = []
			}
			this.pExtendedDiags = null
		}
	}

	public SetExtendedDiags(diags: YcmExtendedDiagnostic[])
	{
		this.pExtendedDiags = null
		this.extendedDiags = diags
	}

	public GetExtendedDiags(): YcmExtendedDiagnostic[]
	{
		if(this.extendedDiags === null)
		{
			throw "Attempted to get extended diags before resolving them"
		}
		return this.extendedDiags
	}

	public async ToVscodeDiagnostic(): Promise<Diagnostic>
	{
		let kind = this.kind === "WARNING" ? DiagnosticSeverity.Warning : DiagnosticSeverity.Error
		let result: Diagnostic
		result = new Diagnostic(
			await this.location_extent.ToVscodeRange(), 
			this.text,
			kind
		)
		try
		{
			//the diag must be complete when assigned to the collection.
			//assigning the related info afterwards doesn't work
			//OTOH, the diags are awaited in parallel, so ¯\_(ツ)_/¯
			
			let pDiags = this.extendedDiags.map(async (extendedDiag) => {
				return new DiagnosticRelatedInformation(
					new Location(
						Uri.file(extendedDiag.location.filepath.normalizedPath),
						(await extendedDiag.location.GetVscodeLoc()).pos
					),
					extendedDiag.text
				)
			})
			result.relatedInformation = await Promise.all(pDiags)
		}
		catch(e)
		{
			//Exception. This is just extended info, so probably not important. 
			//Log as unimportant and otherwise ignore
			Log.Debug("Creating extended diags failed: ", e);
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
		else this.diagnostics = []
	}
}
