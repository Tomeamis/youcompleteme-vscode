'use strict'

import {CompletionItem, CompletionItemKind, 
	CompletionItemProvider,
	CompletionList,
	CompletionContext,
	Position,
	TextDocument,
	CompletionTriggerKind,
	Range,
	CancellationToken,
	window} from 'vscode'
import {YcmLocation, YcmFileDataMapKeeper, YcmRange, isYcmExceptionResponse} from './utils'
import {YcmServer} from '../server'
import {Log, ExtensionGlobals} from '../utils'
import { YcmSimpleRequest, YcmSimpleRequestArgs } from './simpleRequest';

export class YcmCFamCompletionProvider implements CompletionItemProvider
{

	constructor(private triggerStrings: string[])
	{
	}

	private TriggerCharShouldComplete(lineToCursor: string, triggerChar: string): boolean
	{
		const includeRegexStart = "^\\s*#\\s*include\\s*%ToMatch%$"
		if(!this.triggerStrings.find(trigger => lineToCursor.endsWith(trigger)))
		{
			return false
		}
		else if(triggerChar === "<" || triggerChar === "\"")
		{
			let regexStr = includeRegexStart.replace(/%ToMatch%/, triggerChar)
			if(!new RegExp(regexStr).test(lineToCursor))
			{
				return false
			}
		}
		else if(triggerChar === "/")
		{
			let regexStr = includeRegexStart.replace(/%ToMatch%/, "[<\"](?:.*)/")
			if(!new RegExp(regexStr).test(lineToCursor))
			{
				return false
			}
		}
		return true
	}

	async provideCompletionItems(
		document: TextDocument, 
		position: Position,
		token: CancellationToken,
		context: CompletionContext
	): Promise<CompletionList>
	{
		//TODO: use token
		Log.Debug("provideCompletionItems: start")
		//if trigger char, figure out if we should really be triggered
		//TODO: trigger on " and <, only complete if part of include directive
		if(context.triggerKind == CompletionTriggerKind.TriggerCharacter)
		{
			let lineToCursor = document.getText(new Range(position.with({character: 0}), position))
			//if cursor is not preceded by one of the trigger sequences, just return null
			if(!this.TriggerCharShouldComplete(lineToCursor, context.triggerCharacter))
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
		else if(context.triggerKind === CompletionTriggerKind.TriggerForIncompleteCompletions)
		{
			options.forceSemantic = tracker.IsCompletingSemantic()
		}
		tracker.CompletionRequestDone()
		
		let req = new YcmCompletionsRequest(YcmLocation.FromVscodePosition(document, position), options);
		
		let result = await this.CompletionResponseToCompletionList(await req.Send(await pServer))

		//filter out items that would be filtered by vscode anyways
		result.items = result.items.filter(item => {
			//empty ranges are unfiltered
			if(item.range && item.range.isEmpty)
			{
				return true
			}
			let prefix = document.getText(item.range)
			let regexParts = prefix.split("")
			{
				let start = regexParts[0]
				regexParts[0] = `(^${start}|[a-z]${start.toUpperCase()}|_${start})`
				for(let i = 1; i < regexParts.length; ++i)
				{
					regexParts[i] = `(${regexParts[i].toLowerCase()}|${regexParts[i].toUpperCase()})`
				}
			}
			let regex = new RegExp(regexParts.join(".*"))
			return regex.test(item.filterText || item.label)
		})

		if(result.items.length === 0)
		{
			result = await this.CompletionResponseToCompletionList(await req.RetryOnNoCompletions(await pServer))
			//only start using semantic if it succeeds
			if(result.items.length !== 0)
			{
				tracker.NonSemanticCompletionFailed();
			}
		}
		
		return result;
	}

	private async CompletionResponseToCompletionList(response: YcmCompletionsResponse): Promise<CompletionList>
	{
		let itemPromises = response.candidates.map(x => x.ToVscodeCompletionItem())
		//TODO: figure out if the list is really incomplete
		return new CompletionList(await Promise.all(itemPromises), true);
	}
}

type CompleterErrType = "Still parsing" |
	"not utf-8"

class CompleterError
{
	constructor(public type: CompleterErrType)
	{}
}

export class YcmCompletionsResponse
{
	candidates: YcmCandidate[]

	constructor(response: any, cursorPos: YcmLocation)
	{
		//in case we got nothin'
		if(!response)
		{
			this.candidates = []
			return
		}
		let replaceRangeStart = new YcmLocation(cursorPos)
		replaceRangeStart.column_num = response.completion_start_column
		let replaceRange = new YcmRange(replaceRangeStart, cursorPos);
		this.candidates = response.completions.map(
			candidate => new YcmCandidate(candidate, replaceRange)
		)
		//TODO: errors
		if(this.candidates.length === 0)
		{
			let errs = response.errors
			if(errs instanceof Array && errs.length > 0)
			{
				throw errs
			}
		}
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

	async ToVscodeCompletionItem(): Promise<CompletionItem>
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
		result.range = await this.completionRange.ToVscodeRange()
		return result
	}

}

export interface YcmCompletionsRequestArgs extends YcmSimpleRequestArgs
{
	forceSemantic?: boolean
}

export class YcmCompletionsRequest extends YcmSimpleRequest
{

	force_semantic: boolean
	//todo, figure out common points, how to inherit

	public constructor(
		loc: YcmLocation,
		additionalArgs : YcmCompletionsRequestArgs = {}
	)
	{
		super(loc, additionalArgs)
		if(additionalArgs.forceSemantic)
		{
			this.force_semantic = true
		}
	}

	public RetryOnNoCompletions(server: YcmServer): Promise<YcmCompletionsResponse>
	{
		if(!this.force_semantic && ExtensionGlobals.extConfig.fallbackToSemantic.value)
		{
			this.force_semantic = true
			return this.Send(server)
		}
		return Promise.resolve(new YcmCompletionsResponse(undefined, this.GetLocation()))
	}

	public async Send(server: YcmServer): Promise<YcmCompletionsResponse>
	{
		let p = super.Send(server, '/completions')
		let res = await p
		try
		{
			let parsedRes = new YcmCompletionsResponse(res, super.GetLocation())
			return parsedRes
		}
		catch(err)
		{
			if(err instanceof Array)
			{
				if(err.some(item => 
					isYcmExceptionResponse(item) && item.exception.TYPE === "RuntimeError" &&
						item.message === "Still parsing file, no completions yet."
				))
				{
					Log.Info("File already being parsed, retry after delay...")
					//TODO: configurable delay
					await new Promise(res => setTimeout(res, ExtensionGlobals.extConfig.reparseWaitDelay.value))
					return this.Send(server)
				}
				else if(err.some(item => isYcmExceptionResponse(item) && item.exception.TYPE === "UnicodeDecodeError"))
				{
					Log.Error("An include file contains non-UTF-8 completion data");
					window.showErrorMessage(
						"Current translation unit contains completion data that is not valid UTF-8. Completions cannot be supplied",
						{modal: false}
					);
					return new YcmCompletionsResponse(undefined, super.GetLocation())
				}
			}
			Log.Error("Completions err: ", err)
		}
	}

}
