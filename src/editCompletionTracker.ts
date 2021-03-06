import { Location, TextDocumentChangeEvent, workspace, Position, TextDocument, Diagnostic } from "vscode";
import { Log, ExtensionGlobals } from "./utils";
import { YcmServer } from "./server";
import { YcmLocation } from "./requests/utils";
import { YcmEventNotification } from "./requests/event";

'use strict'

export class EditCompletionTracker
{
	private lastTypedCharPos: Location
	private lastEditTimers: {[file: string]: NodeJS.Timer}
	private expectCompletionTimeout: NodeJS.Timer
	private completingSemantic: boolean

	constructor()
	{
		this.lastTypedCharPos = null
		this.lastEditTimers = {}
		this.completingSemantic = false
	}

	HandleDocChange(change: TextDocumentChangeEvent)
	{
		const ignoredFiletypes = ["Log"]
		let doc = change.document
		if(ignoredFiletypes.find(x => x == doc.languageId))
		{
			//just return, ignore completely
			//necessary, NO LOGGING MUST OCCUR when langId is "Log", otherwise it just
			//fires another Log change right away, which again triggers logging, and so on...
			return
		}
		//if it's not a supported filetype, do nothing
		if(!this.CheckFiletype(doc.languageId))
		{
			//just reset last typed char pos
			Log.Trace("Edit not matching langId, resetting lastTypedPos")
			this.lastTypedCharPos = null
			return
		}
		//always track changes, even when still typing
		this.SetLastTypedCharPos(change)
		//if there is a timer on the doc, reset it
		if(this.lastEditTimers[doc.fileName])
		{
			clearTimeout(this.lastEditTimers[doc.fileName])
			this.lastEditTimers[doc.fileName] = undefined
		}
		let timeout = ExtensionGlobals.extConfig.reparseTimeout.value
		this.lastEditTimers[doc.fileName] = setTimeout(() => this.SendDocReparseNotification(doc), timeout)
	}

	private CheckFiletype(langId: string): boolean
	{
		let filetypes = ExtensionGlobals.extConfig.filetypes.value
		return !!filetypes.find((type) => type == langId)
	}

	private SetLastTypedCharPos(change: TextDocumentChangeEvent)
	{
		if(!change.contentChanges.length)
		{
			Log.Warning("HandleDocChange: Document change with no content changes")
			return
		}
		this.ClearEditState()
		if(change.contentChanges.length > 1)
		{
			return
		}
		let docChange = change.contentChanges[0]
		let cursorPos: Position
		if(docChange.rangeLength > 0)
		{
			if(docChange.text.length > 0 || docChange.rangeLength != 1)
			{
				this.completingSemantic = false
				Log.Debug("adding text or replacing range of len > 1")
				return
			}
			else
			{
				cursorPos = docChange.range.start
			}
		}
		else if(docChange.text.length > 1)
		{
			this.completingSemantic = false
			Log.Debug("added text of len > 1")
			return
		}
		else
		{
			cursorPos = docChange.range.start.translate({characterDelta: docChange.text.length})
		}
		this.lastTypedCharPos = new Location(change.document.uri, cursorPos);
		Log.Debug("Last typed char: ", cursorPos)
		let delay = workspace.getConfiguration("editor", change.document.uri).get("quickSuggestionsDelay") as number
		//set timeout on this. If it doesn't come in the next delay+some ms, it probably won't come at all
		this.expectCompletionTimeout = setTimeout(() => {
			Log.Debug("Starting last timeout");
			//first set timeout for delay+some, then set delay for another some to deal with scheduling weirdness
			this.expectCompletionTimeout = setTimeout(() => {
				Log.Debug("Removing edit pos")
				this.completingSemantic = false
				this.ClearEditState()
			}, 25)
		}, delay+25)
	}

	private ClearEditState()
	{
		if(this.expectCompletionTimeout)
		{
			clearTimeout(this.expectCompletionTimeout)
			this.expectCompletionTimeout = null
		}
		this.lastTypedCharPos = null
	}

	CompletionRequestDone()
	{
		Log.Debug("Completion request done")
		this.ClearEditState()
	}

	ShouldCompleteSemantic(doc: TextDocument, pos: Position)
	{
		Log.Debug("Completing semantic: ", this.completingSemantic)
		this.completingSemantic = this.completingSemantic || !this.IsCompletionInvokedByEdit(doc, pos)
		return this.completingSemantic
	}

	IsCompletingSemantic(): boolean
	{
		Log.Debug("IsCompletingSemantic: ", this.completingSemantic)
		return this.completingSemantic
	}

	/**
	 * Informs the tracket that non-semantic completion failed and therefore should switch to semantic
	 */
	NonSemanticCompletionFailed(): void
	{
		this.completingSemantic = true;
	}

	private IsCompletionInvokedByEdit(doc: TextDocument, pos: Position): boolean
	{
		if(this.lastTypedCharPos)
		{
			let lastPos = this.lastTypedCharPos.range.start
			if(this.lastTypedCharPos.uri.fsPath == doc.fileName &&
				this.PositionsEqual(lastPos, pos))
			{
				Log.Debug("Completion on edit: position matched to edit")
				return true
			}
			else
			{
				Log.Debug("Completion invoked: position not matched to edit")
				return false
			}
		}
		Log.Debug("Completion invoked: No edit recorded")
		return false
	}

	private PositionsEqual(pos1: Position, pos2: Position): boolean
	{
		return pos1.line == pos2.line &&
			pos1.character == pos2.character
	}

	async SendDocReparseNotification(document: TextDocument)
	{
		if(!this.CheckFiletype(document.languageId))
		{
			return
		}
		let pServer = YcmServer.GetInstance()
		//as good as any
		let vscodePos = new Position(0, 0)
		let location = YcmLocation.FromVscodePosition(document, vscodePos)
		{
			let notification = new YcmEventNotification(location, "FileReadyToParse")
			try
			{
				let server = await pServer
				let pResponse = notification.Send(server)
				let response = await pResponse
				Log.Debug("FileReadyToParse response: ")
				Log.Trace(response)
				ExtensionGlobals.diags.AddDiagnostics(document.uri.fsPath, response.diagnostics)
			}
			catch(err)
			{
				try
				{
					err = JSON.parse(err)
				}
				catch(err)
				{}
				Log.Error(err)
			}
		}
	}

}
