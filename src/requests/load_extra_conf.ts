'use strict'

import {YcmServer} from '../server'

export class YcmLoadExtraConfResponse
{
	//TODO: check if this is an ycmd exception response
	constructor(public err: any)
	{}
}

export class YcmLoadExtraConfRequest
{
	constructor(public filepath: string)
	{}

	public async Send(server: YcmServer): Promise<YcmLoadExtraConfResponse>
	{
		let p = server.SendData('/load_extra_conf_file', this)
		try
		{
			let resData = await p
			if(resData !== true)
			{
				throw "Unexpected server response to YcmLoadExtraConfRequest"
			}
			return new YcmLoadExtraConfResponse(null)
		}
		catch(err)
		{
			//TODO: call handler
			return new YcmLoadExtraConfResponse(err)
		}
	}

}