'use strict'

import { YcmDiagnosticData } from './requests/event'
import { YcmLocation, YcmRange } from './requests/utils'
import { YcmExtendedDiagnostic } from './requests/extendedDiagnostic';
import { DiagnosticCollection, languages, Uri, ExtensionContext } from 'vscode';
import { Log } from './utils';

interface DiagEquivalenceInfo
{
	location: YcmLocation
	text: string
}

class ExtendedDiagInfo
{
	location: YcmLocation
	text: string
	originDocs: Set<string>

	constructor(location: YcmLocation, text: string, originPath: string)
	{
		this.location = location
		this.text = text
		this.originDocs = new Set([originPath])
	}

	ToString(): string
	{
		return `${this.location.line_num}:${this.location.column_num}:${this.text}`
	}

	/**
	 * Removes all subdiagnostics from the given document
	 * 
	 * @param doc The document which was analyzed and no diags were found for the file of this diag
	 * @returns true if the diag shoudl still exist afterwards, false otherwise
	 */
	ProcessDocClearance(doc: string): boolean
	{
		if(this.originDocs.has(doc))
		{
			Log.Info("Clearing extendedDiag ", this.ToString(), " from document ", this.location.filepath)
			return false
		}
		return true
	}

	ProcessDocUpdateExt(doc: string, nDiags: YcmExtendedDiagnostic[]): boolean
	{
		if(nDiags.find(diag => this.IsEquivalent(diag)))
		{
			//this diagnostic was found in the doc, so add it as an origin
			this.originDocs.add(doc)
		}
		else
		{
			//this diagnostic was not found, if it had been found before, it has been resolved
			let willStay = this.ProcessDocClearance(doc)
			let logMethod = willStay ? Log.Debug: Log.Info
			logMethod(`Extended diag ${this.ToString()} will stay after processing document ${doc}: ${willStay}`)
			return willStay
		}
	}

	IsEquivalent(diag: DiagEquivalenceInfo): boolean
	{
		return diag.location.Equals(this.location) && diag.text === this.text
	}
}

//doesn't make much sense, I know, but that's just how it is
class DiagInfo extends ExtendedDiagInfo
{

	details: ExtendedDiagInfo[]
	diag: YcmDiagnosticData

	constructor(diag: YcmDiagnosticData, public originPath: string)
	{
		super(diag.location, diag.text, originPath)
		this.diag = diag
		this.details = diag.GetExtendedDiags().map(diag => {
			return new ExtendedDiagInfo(diag.location, diag.text, originPath)
		})
	}

	public ProcessDocClearance(doc: string): boolean
	{
		this.details = this.details.filter(detail => detail.ProcessDocClearance(doc))
		if(this.details.length > 0)
		{
			return true
		}
		else
		{
			Log.Info("Clearing diag ", this.ToString(), " from document ", this.location.filepath)
			return false
		}
	}

	/**
	 * Processes new set of diagnostics from a document, updates accordingly
	 * @param doc The doc from which the diagnostics were produced
	 * @param nDiags The produced diagnostics
	 * @returns false if the diag should be removed
	 */
	ProcessDocUpdate(doc: string, nDiags: YcmDiagnosticData[]): boolean
	{
		let matchingDiag = nDiags.find(diag => this.IsEquivalent(diag))
		if(typeof matchingDiag === "undefined")
		{
			if(this.originDocs.has(doc))
			{
				//this diag has been affected before, but no longer is
				Log.Debug("Diag ", this.ToString(), "is no longer affected by doc ", this.location.filepath)
				return this.ProcessDocClearance(doc)
			}
			else
			{
				//hasn't had anything to do with it before, still doesn't
				return true
			}
		}
		else
		{
			//there is a matching diag, handle detailed diags
			//if this document is one of the sources of this diag
			Log.Debug("Merging detailed diags of document ", doc, "into diag ", this.ToString())
			if(this.originDocs.has(doc))
			{
				//remove old diags no longer present
				this.details = this.details.filter(detail => detail.ProcessDocUpdateExt(doc, matchingDiag.GetExtendedDiags()))
			}
			//add new diags
			this.details = this.details.concat(
				matchingDiag.GetExtendedDiags().filter(
					diag => this.details.some(detail => detail.IsEquivalent(diag))
				).map(diag => {
					let nInfo = new ExtendedDiagInfo(diag.location, diag.text, doc)
					Log.Info("Adding extended info ", nInfo.ToString(), " to diag ", this.ToString())
					return nInfo
				})
			);
			return true
		}
	}
}

export class DiagnosticAggregator
{
	/**
	 * context document -> documents that have diagnostics from this document
	 */
	affectedDocs: {[context: string]: string[]}
	
	/**
	 * document -> diagnostics in it
	 */
	diagnostics: {[file: string]: DiagInfo[]}
	vscodeDiagCollection: DiagnosticCollection

	constructor(context: ExtensionContext)
	{
		this.affectedDocs = {}
		this.diagnostics = {}
		this.vscodeDiagCollection = languages.createDiagnosticCollection("YouCompleteMe")
		context.subscriptions.push(this.vscodeDiagCollection)
	}
	
	GetArray<T>(dict: {[index: string]: T[]}, index: string): T[]
	{
		if(typeof dict[index] === "undefined")
		{
			dict[index] = []
		}
		return dict[index]
	}

	private async SetDiagsForDoc(doc: string)
	{
		let arr = this.diagnostics[doc]
		let pDiags = arr.map(diagInfo => {
			let diag = diagInfo.diag
			diag.SetExtendedDiags(diagInfo.details.map(
				detail => new YcmExtendedDiagnostic(detail.location, detail.text)
			))
			return diag.ToVscodeDiagnostic()
		})
		this.vscodeDiagCollection.set(Uri.file(doc), await Promise.all(pDiags))
	}

	async AddDiagnostics(contextDoc: string, diags: YcmDiagnosticData[]): Promise<void>
	{
		await Promise.all(diags.map(diag => diag.ResolveExtendedDiags()))
		let prevAffectedDocs = new Set(this.GetArray(this.affectedDocs, contextDoc))
		let newAffectedDocs = new Set<string>()
		for(let diag of diags)
		{
			newAffectedDocs.add(diag.location.filepath)
		}
		this.affectedDocs[contextDoc] = [...newAffectedDocs]
		//clear affectedDocs
		{
			let newClearDocs = new Set([...prevAffectedDocs].filter(val => !newAffectedDocs.has(val)))
			for(let doc of newClearDocs)
			{
				let docDiags = this.GetArray(this.diagnostics, doc)
				//clears 
				this.diagnostics[doc] = docDiags.filter(diag => diag.ProcessDocClearance(doc))
				this.SetDiagsForDoc(doc)
			}
		}
		for(let affectedDoc of newAffectedDocs)
		{
			//process the diagnostics in all the docs
			let prevDiags = this.GetArray(this.diagnostics, affectedDoc)
			prevDiags = prevDiags.filter(diag => diag.ProcessDocUpdate(contextDoc, diags))
			prevDiags = prevDiags.concat(
				diags.filter(
					diag => diag.location.filepath === affectedDoc && !prevDiags.some(
						diag2 => diag2.IsEquivalent(diag)
					)
				).map(
					diag => {
						let nInfo = new DiagInfo(diag, contextDoc)
						Log.Info("Adding new diag ", nInfo.ToString(), " to document ", nInfo.location.filepath)
						return nInfo
					}
				)
			)
			this.diagnostics[affectedDoc] = prevDiags
			this.SetDiagsForDoc(affectedDoc)
		}
	}

}
