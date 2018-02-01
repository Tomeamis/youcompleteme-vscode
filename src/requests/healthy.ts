'use strict'

import {YcmServer} from '../server'
import {Log} from '../utils'

/**
 * err contains the error if not healthy, otherwise null
 */
export class YcmHealthyResponse
{

	public err: any
	//TODO: check if this is an ycmd exception response
	constructor(e)
	{
		this.err = e
	}

}

export class YcmHealthyRequest
{
	
	public async Send(server: YcmServer): Promise<YcmHealthyResponse>
	{
		Log.Debug("Sending....")
		let p = server.SendData('/healthy', null);
		try
		{
			await p
			return new YcmHealthyResponse(null)
		}
		catch(err)
		{
			return new YcmHealthyResponse(err)
		}
	}

}