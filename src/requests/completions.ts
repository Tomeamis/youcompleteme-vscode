'use strict'

import {workspace, CompletionItem, CompletionItemKind, 
	CompletionItemProvider,
	CompletionList,
	CancellationToken,
	ProviderResult,
	CompletionContext,
	Position,
	TextDocument,
	CompletionTriggerKind,
	Range} from 'vscode'
import {YcmLocation, YcmFileDataMap, YcmRange, HandleRequestError} from './utils'
import {YcmServer} from '../server'
import {YcmLoadExtraConfRequest} from './load_extra_conf'
import {Log, ExtensionGlobals} from '../utils'

export class YcmCompletionProvider implements CompletionItemProvider
{

	constructor(private triggerStrings: string[])
	{
	}

	async provideCompletionItems(
		document: TextDocument, 
		position: Position, 
		token: CancellationToken, 
		context: CompletionContext
	): Promise<CompletionList>
	{
		Log.Debug("provideCompletionItems: start")
		//if trigger char, figure out if we should really be triggered
		if(context.triggerKind == CompletionTriggerKind.TriggerCharacter)
		{
			let lineToCursor = document.getText(new Range(position.with({character: 0}), position))
			//if cursor is not preceded by one of the trigger sequences, just return null
			if(!this.triggerStrings.find(trigger => lineToCursor.endsWith(trigger)))
			{
				return null
			}
		}
		//otherwise just continue
		let options: any = {}
		let pServer = YcmServer.GetInstance()
		let tracker = ExtensionGlobals.editTracker
		//check if we were invoked explicitly or just by the user typing
		if(context.triggerKind === CompletionTriggerKind.Invoke)
		{
			if(tracker.ShouldCompleteSemantic(document, position))
			{
				options.forceSemantic = true
			}
		}
		tracker.CompletionRequestDone()
		
		let req = new YcmCompletionsRequest(YcmLocation.FromVscodePosition(document, position), options);

		let compResult = await req.Send(await pServer)
		//TODO: figure out if the list is really incomplete
		let result = new CompletionList(compResult.candidates.map(x => x.ToVscodeCompletionItem()), true);
		
		return result;
	}
}

export class YcmCompletionsResponse
{
	candidates: YcmCandidate[]

	constructor(response: any, cursorPos: YcmLocation)
	{
		let replaceRangeStart = new YcmLocation(cursorPos)
		replaceRangeStart.column_num = response.completion_start_column
		let replaceRange = new YcmRange(replaceRangeStart, cursorPos);
		this.candidates = response.completions.map(
			candidate => new YcmCandidate(candidate, replaceRange)
		)
		//TODO: errors
	}
}

export type YcmCandidateKind = "STRUCT" |
	"CLASS" |
	"ENUM" |
	"TYPE" |
	"MEMBER" |
	"FUNCTION" |
	"VARIABLE" |
	"MACRO" |
	"PARAMETER" |
	"NAMESPACE" |
	"UNKNOWN"

export class YcmCandidate
{
	insertion_text: string
	menu_text: string
	extra_menu_info: string
	detailed_info: string
	kind: YcmCandidateKind
	extra_data: any

	constructor(obj: any, public completionRange: YcmRange)
	{
		this.insertion_text = obj.insertion_text
		this.menu_text = obj.menu_text
		this.extra_menu_info = obj.extra_menu_info
		this.detailed_info = obj.detailed_info
		this.kind = obj.kind
		this.extra_data = obj.extra_data
	}

	ToVscodeCompletionItem(): CompletionItem
	{
		let vscodeKind: CompletionItemKind
		switch(this.kind)
		{
		case "STRUCT":
			vscodeKind = CompletionItemKind.Struct;
			break;
		case "CLASS":
			vscodeKind = CompletionItemKind.Class;
			break;
		case "ENUM":
			vscodeKind = CompletionItemKind.Enum;
			break;
		case "TYPE":
			vscodeKind = CompletionItemKind.Class;
			break;
		case "MEMBER":
			vscodeKind = CompletionItemKind.Field;
			break;
		case "FUNCTION":
			vscodeKind = CompletionItemKind.Function;
			break;
		case "VARIABLE":
			vscodeKind = CompletionItemKind.Variable;
			break;
		case "MACRO":
			vscodeKind = CompletionItemKind.Constant;
			break;
		case "PARAMETER":
			vscodeKind = CompletionItemKind.Variable;
			break;
		case "NAMESPACE":
			vscodeKind = CompletionItemKind.Module;
			break;
		}
		let label = this.insertion_text
		let result = new CompletionItem(label, vscodeKind)
		result.insertText = this.insertion_text
		if(this.detailed_info)
		{
			result.detail = this.detailed_info
		}
		else
		{
			result.detail = this.extra_menu_info
		}
		result.range = this.completionRange.ToVscodeRange()
		return result
	}

}

export class YcmCompletionsRequest extends YcmLocation
{

	file_data: YcmFileDataMap
	completer_target: string
	working_dir: string
	force_semantic: boolean

	//todo, figure out common points, how to inherit

	public constructor(
		loc: YcmLocation,
		{
			completerTarget = undefined,
			workingDir = undefined,
			forceSemantic = undefined
		} : {
			completerTarget?: string, 
			workingDir?: string, 
			forceSemantic?: true
		} = {}
	)
	{
		super(loc)
		this.file_data = new YcmFileDataMap()
		if(completerTarget)
		{
			this.completer_target = completerTarget
		}
		if(workingDir)
		{
			this.working_dir = workingDir
		}
		if(forceSemantic)
		{
			this.force_semantic = true
		}
	}

	public async Send(server: YcmServer): Promise<YcmCompletionsResponse>
	{
		let p = server.SendData('/completions', this)
		try
		{
			let res = await p
			Log.Debug("Completions response: ")
			Log.Trace(res)
			return new YcmCompletionsResponse(res, this)
		}
		catch(err)
		{
			if(await HandleRequestError(err))
			{
				return this.Send(server)
			}
			else
			{
				//TODO: return empty
			}
		}
	}

}