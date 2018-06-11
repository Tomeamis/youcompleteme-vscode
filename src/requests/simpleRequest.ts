'use strict'

import { YcmLocation, YcmFileDataMap, HandleRequestError } from "./utils";
import { YcmServer, YcmdPath } from "../server";
import { YcmCompletionsResponse } from "./completions";
import { Log } from "../utils";

export interface YcmSimpleRequestArgs
{
	completerTarget?: string, 
	workingDir?: string,
}

export class YcmSimpleRequest
{

	line_num: number
	column_num: number
	filepath: string
	file_data: YcmFileDataMap
	completer_target: string
	working_dir: string

	//todo, figure out common points, how to inherit

	public constructor(
		loc: YcmLocation,
		{
			completerTarget,
			workingDir
		} : YcmSimpleRequestArgs = {}
	)
	{
		this.line_num = loc.line_num
		this.column_num = loc.column_num
		this.filepath = loc.filepath
		this.file_data = new YcmFileDataMap()
		if(completerTarget)
		{
			this.completer_target = completerTarget
		}
		if(workingDir)
		{
			this.working_dir = workingDir
		}
	}

	public GetLocation(): YcmLocation
	{
		return new YcmLocation(this.line_num, this.column_num, this.filepath);
	}

	protected async Send(server: YcmServer, path: YcmdPath): Promise<any>
	{
		let p = server.SendData(path, this)
		try
		{
			let res = await p
			Log.Debug(`${path} response: `)
			Log.Trace(res)
			return res
		}
		catch(err)
		{
			if(await HandleRequestError(err))
			{
				return this.Send(server, path)
			}
			else
			{
				//TODO: return empty
			}
		}
	}

}
