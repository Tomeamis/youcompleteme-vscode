'use strict'

import * as ChildProcess from 'child_process'
import * as Net from 'net'
import {workspace} from 'vscode'
import * as Path from 'path';
import {randomBytes, createHmac} from 'crypto'
import * as Fs from 'fs'
import {tmpdir as GetTempDirPath} from 'os'
import {Log, ExtensionGlobals} from './utils'
import * as Http from 'http'
import * as QueryString from 'querystring'
import { YcmSettings } from './ycmConfig';

export type YcmdPath = 
	'/completions' |
	'/run_completer_command' |
	'/healthy' |
	'/detailed_diagnostic' |
	'/event_notification' |
	'/load_extra_conf_file' |
	'/run_completer_command'

/**
 * Makes the ycmd setting file to pass to Ycmd, returns it's path
 * @param ycmdPath path to ycmd directory (with __main__.py and default_settings.json files)
 * @param workingDir The workspace dir
 */
async function MakeYcmdSettingsFile(secret: string): Promise<string>
{
	let pFile = GetTempFile("YcmdSettings_");
	let pData = MakeYcmdSettings(secret)
	let [[file, path], data] = await Promise.all([pFile, pData]);
	try
	{
		return await new Promise<string>((resolve, reject) => {
			Fs.write(file, JSON.stringify(data), (err) => {
				if(err)
				{
					Log.Debug("Error writing ycmd settings file")
					reject(err)
				}
				else
				{
					Log.Debug("Writing ycmd settings file succeeded")
					resolve(path)
				}
			})
		})
	}
	finally
	{
		Log.Debug("Closing ycmd settings file");
		Fs.close(file, err => err && Log.Error("Failed to close ycmd settings file: ", err))
	}
}

function GetTempFile(prefix: string, remainingAttempts = 10): Promise<[number, string]> {
	return new Promise((resolve, reject) => {
		if(remainingAttempts <= 0)
		{
			reject("Failed to create a temporary file");
		}
		//generate random filename
		let filename = Path.resolve(GetTempDirPath(), `${prefix}${randomBytes(8).toString('hex')}`);
		//attempt to open
		Fs.open(filename, "wx", 0o600, (err, fd)=> {
			if(!fd)
			{
				if(err && err.code === "EEXIST")
				{
					return GetTempFile(prefix, remainingAttempts-1)
				}
				else
				{
					reject(err)
				}
			}
			else
			{
				resolve([fd, filename]);
			}
		})
	})
}

async function MakeYcmdSettings(secret: string)
{
	let pDefaults = YcmSettings.LoadDefault()
	let pLocal = YcmSettings.LoadLocal()
	let [defaults, local] = await Promise.all([pDefaults, pLocal])
	//override the defaults
	Object.keys(local).forEach(key => defaults[key] = local[key]);
	defaults["hmac_secret"] = secret
	return defaults
}



export class YcmServer
{
	static alive: boolean
	private secret: Buffer
	private port: number
	static instance: Promise<YcmServer>
	//hmac alg + and the resulting hash length
	static readonly hmacHashAlg = 'sha256'
	static readonly hmacLen = 32
	static readonly hmacHeader = 'x-ycm-hmac'

	private constructor(secret: Buffer, port: number)
	{
		this.secret = secret;
		this.port = port;
	}

	private static async SetupServer(workingDir : string): Promise<YcmServer> {
		YcmServer.alive = true
		try
		{
			let ycmdPath = ExtensionGlobals.extConfig.ycmdPath.value;
			let options = {
				cwd: workingDir,
				env: process.env,
				shell: true,
				windowsVerbatimArguments: true,
				windowsHide: true
			}
			//get unused port
			let server = Net.createServer();
			let pPort = new Promise<number>(resolve => {
				server.listen(
					{host: "localhost", port: 0, exclusive: true},
					() => {
						resolve(server.address().port)
						server.close()
					}
				)
			})
			let secret = randomBytes(16)
			let pOptFile = MakeYcmdSettingsFile(secret.toString('base64'))
			let [port, optFile] = await Promise.all([pPort, pOptFile])
			let args = [
				Path.resolve(ycmdPath, "ycmd"),
				`"--port=${port}"`,
				`"--options_file=${optFile}"`,
				//stay alive for 15 minutes
				`--idle_suicide_seconds=900`
			]
			//TODO: implement a keepalive pinger
			
			let pythonPath = ExtensionGlobals.extConfig.pythonPath.value
			let cp = ChildProcess.spawn(`"${pythonPath}"`, args, options)
			if(cp.pid)
			{
				Log.Info("Ycmd started successfully. PID: ", cp.pid)
			}
			else
			{
				Log.Error("Failed to start Ycmd.")
				throw "Failed to start Ycmd process"
			}
			cp.stderr.on("data", (chunk: Buffer) => {
				Log.Info("Ycmd stderr: ", chunk.toString('utf-8'));
			})
			cp.stdout.on("data", (chunk: Buffer) => {
				Log.Info("Ycmd stdout: ", chunk.toString('utf-8'));
			})
			cp.on("exit", (code, signal) => {
				YcmServer.alive = false
				if(signal)
				{
					Log.Error("Ycmd ended with signal ", signal)
				}
				else if(code)
				{
					let msg: string
					switch(code)
					{
						case 0: Log.Info("Ycmd normal exit"); break;
						case 3: msg = "unexpected error while loading the library"; break;
						case 4: msg = "the ycm_core library is missing"; break;
						case 5: msg = "the ycm_core library is compiled for Python 3 but loaded in Python 2"; break;
						case 6: msg = "the ycm_core library is compiled for Python 2 but loaded in Python 3"; break;
						case 7: msg = "the version of the ycm_core library is outdated."; break;
						default: msg = "unknown error"; break;
					}
					Log.Error("Ycmd exit: ", msg);
				}
			})
			return new YcmServer(secret, port);
		}
		catch(err)
		{
			//error happened, server is not alive
			YcmServer.alive = false
			//not handled, just rethrow
			throw err
		}
	}

	public static async GetInstance()
	{
		if(!YcmServer.alive)
		{
			YcmServer.instance = YcmServer.SetupServer(ExtensionGlobals.workingDir)
		}
		//TODO: timeout?
		return YcmServer.instance;
	}

	public SendData(path: YcmdPath, data: any): Promise<any>
	{
		let method: string
		let body: string
		let reqPath: string
		switch(path)
		{
		case '/completions':
		case '/run_completer_command':
		case '/detailed_diagnostic' :
		case '/event_notification' :
		case '/load_extra_conf_file' :
		case '/run_completer_command':
			method = "POST"
			body = JSON.stringify(data)
			reqPath = path
			break;
		case '/healthy':
			method = "GET"
			body = '';
			reqPath = `${path}?${QueryString.stringify(data)}`
			break;
		}
		let hmac = this.ComputeReqHmac(method, path, body)
		let options = {
			hostname: "localhost",
			port: this.port,
			path: reqPath,
			method: method,
			headers: {
				'content-type': 'application/json'
			}
		}
		options.headers[YcmServer.hmacHeader] = hmac.toString('base64')
		let req: Http.ClientRequest
		let result = new Promise<any>((resolve, reject) => {
			req = Http.request(options, res => {
				let buf = new Buffer(0)
				res.on('data', (data: Buffer) => buf = Buffer.concat([buf, data]));
				res.on('end', () => {
					try
					{
						if(!this.VerifyResponseHmac(buf, res.headers[YcmServer.hmacHeader] as string))
						{
							reject("Hmac verification failed");
						}
						else
						{
							let resBody = buf.toString('utf-8')
							if(res.statusCode == 200)
							{
								resolve(JSON.parse(resBody))
							}
							else
							{
								reject(JSON.parse(resBody))
							}
						}
					}
					catch(e)
					{
						reject(e)
					}
				})
				res.on('error', err => reject(err))
			})
		})
		Log.Debug(`Sending data to ${path}: `)
		Log.Trace(data)
		req.write(body, 'utf-8')
		req.end()
		return result
	}

	private VerifyResponseHmac(body: Buffer, hmacToVerify: Buffer|string): boolean
	{
		if(typeof hmacToVerify === 'string')
		{
			hmacToVerify = new Buffer(hmacToVerify, 'base64')
		}
		let computedHmac = this.ComputeHmac(body)
		if(hmacToVerify.length != YcmServer.hmacLen)
		{
			return false
		}
		let equal = true;
		//constant time, because why not
		for(let i = 0; i < YcmServer.hmacLen; ++i)
		{
			equal = equal && hmacToVerify[i] == computedHmac[i]
		}
		return equal
	}
	
	private ComputeReqHmac(method: string, path: string, body: string): Buffer
	{
		let method_hmac = this.ComputeHmac(new Buffer(method, 'utf-8'))
		let path_hmac = this.ComputeHmac(new Buffer(path, 'utf-8'))
		let body_hmac = this.ComputeHmac(new Buffer(body, 'utf-8'))
		let catted = Buffer.concat([method_hmac, path_hmac, body_hmac])
		return this.ComputeHmac(catted)
	}

	private ComputeHmac(data: Buffer): Buffer
	{
		let hmac = createHmac(YcmServer.hmacHashAlg, this.secret)
		hmac.update(data)
		return hmac.digest()
	}
	
}
