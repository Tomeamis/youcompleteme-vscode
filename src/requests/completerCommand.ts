'use strict'


import {YcmServer} from '../server'
import { YcmLocation, HandleRequestError } from './utils';
import { Log } from '../utils';
import { DefinitionProvider, TextDocument, Position, CancellationToken, Location } from 'vscode';
import { YcmSimpleRequest } from './simpleRequest';


export class CompleterCommandResponse
{

	static Create(obj: any): CompleterCommandResponse
	{
		//TODO: other types
		return new YcmGoToResponse(obj)
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
		let p = super.Send(server, '/completions')
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
