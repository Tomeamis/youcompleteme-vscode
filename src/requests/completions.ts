'use strict'

import {workspace} from 'vscode'
import {YcmLocation, YcmFileDataMap} from './utils'
import {YcmServer} from '../server'
import {YcmLoadExtraConfRequest} from './load_extra_conf'
import {Log} from '../utils'

export class YcmCompletionsResponse
{
	constructor(public response)
	{
		//TODO: implement
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
		let res = JSON.parse(await p)
		let errors = res.errors as Array<any>
		let ex = errors.find(x => x['exception']['TYPE'] === "UnknownExtraConf")
		if(ex)
		{
			let extraConfReq = new YcmLoadExtraConfRequest(ex.exception.extra_conf_file)
			let extraConfLoaded = await extraConfReq.Send(server)
			if(extraConfLoaded.err)
			{
				throw extraConfLoaded.err
			}
			p = server.SendData('/completions', this)
			return new YcmCompletionsResponse(JSON.parse(await p))
		}
		else
		{
			return new YcmCompletionsResponse(res)
		}
	}

}