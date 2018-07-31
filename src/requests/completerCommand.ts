'use strict'


import {YcmServer} from '../server'
import { YcmLocation, VscodeLoc, YcmRange } from './utils';
import { Log } from '../utils';
import { DefinitionProvider, TextDocument, Position, CancellationToken, Location, languages, workspace, HoverProvider, ProviderResult, Hover, TextEdit, CodeAction, CodeActionKind, WorkspaceEdit, Uri, CodeActionProvider, Range, CodeActionContext } from 'vscode';
import { YcmSimpleRequest } from './simpleRequest';


export class CompleterCommandResponse
{

	static Create(obj: any): CompleterCommandResponse
	{
		if(obj.filepath)
		{
			return new YcmGoToResponse(obj)
		}
		else if(obj.message)
		{
			//TODO: other message responses?
			return new YcmGetTypeResponse(obj)
		}
		else if(obj.fixits)
		{
			return new YcmFixItResponse(obj);
		}
		//TODO: other messages
		Log.Error("Unimplemented completer command response: ", obj)
	}
}

export class CompleterCommandRequest extends YcmSimpleRequest
{

	protected command_arguments: string[]

	constructor(loc: YcmLocation, args: string[])
	{
		super(loc)
		this.command_arguments = args
	}

	public async Send(server: YcmServer): Promise<CompleterCommandResponse>
	{
		let p = super.Send(server, '/run_completer_command')
		let res = await p
		return CompleterCommandResponse.Create(res)
	}

}

export class YcmGoToResponse extends CompleterCommandResponse
{

	public loc: YcmLocation

	constructor(obj: any)
	{
		super()
		if(obj instanceof Array)
		{
			//TODO:
			Log.Info("Implement GoTo arrays!!!")
		}
		if(typeof obj.line_num !== "number" || typeof obj.column_num !== "number" ||
			typeof obj.filepath !== "string"
		)
		{
			Log.Error("GoToResponse constructor got ", obj)
			throw "unexpected object in GoTo response"
		}
		this.loc = new YcmLocation(obj['line_num'], obj['column_num'], obj['filepath'])
	}
}

export class YcmGoToRequest extends CompleterCommandRequest
{
	constructor(loc: YcmLocation)
	{
		super(loc, ["GoTo"])
	}

	public async Send(server: YcmServer): Promise<YcmGoToResponse>
	{
		let res = await super.Send(server)
		if(res === null)
		{
			return null
		}
		else if(!(res instanceof YcmGoToResponse))
		{
			Log.Error("GoToRequest returned unexpected response type: ", res)
			throw "GoTo request got unexpected type of response"
		}
		return res
	}

}

export class YcmDefinitionProvider implements DefinitionProvider
{

	async provideDefinition(document: TextDocument, position: Position): Promise<Location | Location[]> 
	{
		try
		{
			let pServer = YcmServer.GetInstance()
			let req = new YcmGoToRequest(YcmLocation.FromVscodePosition(document, position))
			let pResponse = req.Send(await pServer)
			let response = await pResponse
			if(response === null)
			{
				Log.Info("Definition not found");
				return null
			}
			return (await response.loc.GetVscodeLoc()).ToVscodeLocation()
		}
		catch(err)
		{
			Log.Error("Error providing definition: ", err)
		}
	}

}

export class YcmGetTypeResponse extends CompleterCommandResponse
{

	public type: string

	constructor(obj: any)
	{
		super()
		if(typeof obj.message !== "string")
		{
			Log.Error("GetTypeResponse constructor got ", obj)
			throw "unexpected object in GetType response"
		}
		this.type = obj.message
	}
}

export class YcmGetTypeRequest extends CompleterCommandRequest
{

	constructor(loc: YcmLocation)
	{
		super(loc, ["GetType"])
	}

	public async Send(server: YcmServer): Promise<YcmGetTypeResponse>
	{
		let res = await super.Send(server)
		if(res === null)
		{
			return null
		}
		else if(!(res instanceof YcmGetTypeResponse))
		{
			Log.Error("GetTypeRequest returned unexpected response type: ", res)
			throw "GetType request got unexpected type of response"
		}
		return res
	}
}

export class YcmGetTypeProvider implements HoverProvider
{
	
	async provideHover(document: TextDocument, position: Position, token: CancellationToken): Promise<Hover> {
		try
		{
			let pServer = YcmServer.GetInstance()
			let req = new YcmGetTypeRequest(YcmLocation.FromVscodePosition(document, position))
			let pResponse = req.Send(await pServer)
			let response = await pResponse
			if(response === null)
			{
				Log.Info("Definition not found");
				return null
			}
			return new Hover({language: document.languageId, value: response.type})
		}
		catch(err)
		{
			Log.Error("Error providing definition: ", err)
			return null
		}
	}

}

export class YcmFixIt
{
	public text: string
	public location: YcmLocation
	public chunks: YcmFixItChunk[]

	constructor(obj)
	{
		this.text = obj.text
		this.location = obj.location
		let chunks = obj.chunks as Array<any>
		this.chunks = chunks.map(item => new YcmFixItChunk(item))
	}

	async ToVscodeCodeAction(): Promise<CodeAction>
	{
		let action = new CodeAction(this.text, CodeActionKind.QuickFix)
		action.edit = new WorkspaceEdit();
		for(let chunk of this.chunks)
		{
			action.edit.replace(Uri.file(
				chunk.range.GetFilepath().normalizedPath), 
				await chunk.range.ToVscodeRange(),
				chunk.replacement_text
			)
		}
		return action
	}

}

export class YcmFixItChunk
{
	public replacement_text: string
	public range: YcmRange

	constructor(obj)
	{
		this.replacement_text = obj.replacement_text
		this.range = YcmRange.FromSimpleObject(obj.range)
	}

	async ToVscodeTextEdit(): Promise<TextEdit>
	{
		return new TextEdit(await this.range.ToVscodeRange(), this.replacement_text)
	}

}

export class YcmFixItResponse extends CompleterCommandResponse
{

	public fixits: YcmFixIt[]

	constructor(obj: any)
	{
		super()
		if(!(obj.fixits instanceof Array))
		{
			Log.Error("YcmFixItResponse constructor got ", obj)
			throw "unexpected object in FixIt response"
		}
		let fixits = obj.fixits as any[]
		this.fixits = fixits.map(item => new YcmFixIt(item))
	}
}

export class YcmFixItRequest extends CompleterCommandRequest
{

	constructor(loc: YcmLocation)
	{
		super(loc, ["FixIt"])
	}

	public async Send(server: YcmServer): Promise<YcmFixItResponse>
	{
		let res = await super.Send(server)
		if(res === null)
		{
			return null
		}
		else if(!(res instanceof YcmFixItResponse))
		{
			Log.Error("FixItRequest returned unexpected response type: ", res)
			throw "FixIt request got unexpected type of response"
		}
		return res
	}
}

export class YcmCodeActionProvider implements CodeActionProvider
{

	async provideCodeActions(document: TextDocument, range: Range, context: CodeActionContext, token: CancellationToken): Promise<CodeAction[]> {
		try
		{
			let req = new YcmFixItRequest(YcmLocation.FromVscodePosition(document, range.start))
			let res = await req.Send(await YcmServer.GetInstance())
			if(res === null)
			{
				return null
			}
			return Promise.all(res.fixits.map(fixit => fixit.ToVscodeCodeAction()))
		}
		catch(err)
		{
			Log.Error("Error providing definition: ", err)
			return null
		}
	}
	

}
