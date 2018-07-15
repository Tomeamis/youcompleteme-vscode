'use strict'

import { YcmLocation, YcmFileDataMap, YcmFileDataMapKeeper, ErrorHandler } from "./utils";
import { YcmServer, YcmdPath } from "../server";
import { Log } from "../utils";
import * as path from 'path'

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
	//the type is hacking around the fact that we can't await it in the constructor
	file_data: Promise<YcmFileDataMap>|YcmFileDataMap
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
		this.filepath = loc.filepath.receivedPath
		this.file_data = YcmFileDataMapKeeper.GetDataMap(loc.filepath)
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

	protected HandleException(err): any
	{
	}

	protected Send(server: YcmServer, path: YcmdPath): Promise<any>
	{
		//for recursion
		let implFunc = async () => {
		//promise must be resolved before sending.
			if(this.file_data instanceof Promise)
			{
				this.file_data = await this.file_data
			}
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
				{
					//try to let subclass handle the error
					let handled = this.HandleException(err)
					if(typeof handled != "undefined")
					{
						return handled
					}
				}
				if(await ErrorHandler.HandleRequestError(err))
				{
					return implFunc()
				}
				else
				{
					//TODO: return empty
				}
			}
		}
		return implFunc()
	}

}
