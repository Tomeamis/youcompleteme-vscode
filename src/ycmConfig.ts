'use strict'

import * as fs from 'fs'
import * as path from 'path'
import { Log, ExtensionGlobals } from './utils';

export class YcmSettings
{

	static async LoadDefault()
	{
		let ycmdPath = ExtensionGlobals.extConfig.ycmdPath.value
		try
		{
			return this.LoadJSONFile(path.resolve(ycmdPath, "ycmd/default_settings.json"))
		}
		catch(err)
		{
			//TODO: handle
		}
	}

	static async LoadLocal(): Promise<any>
	{
		let pJson = this.LoadJSONFile(await YcmSettings.PathToLocal())
		return new Promise<any>(resolve => {
			pJson.then(result => {
				resolve(result)
			})
			//if it fails, just return empty object
			pJson.catch(e => {
				resolve({})
				Log.Info("Failed to load local settings from folder ", ExtensionGlobals.workingDir)
				Log.Info("Reason: ", e)
			});
		});
	}

	private static async PathToLocal(ensureFolderExistence?: boolean): Promise<string> {
		if(typeof ensureFolderExistence === "undefined")
		{
			ensureFolderExistence = false
		}
		let folderPath = path.resolve(ExtensionGlobals.workingDir, ".vscode")
		if(ensureFolderExistence)
		{
			let p = new Promise((resolve, reject) => {
				fs.access(folderPath, fs.constants.W_OK, (err) => {
					if(err)
					{
						if(err.code === "ENOENT")
						{
							fs.mkdir(folderPath, (err) => {
								if(!err)
								{
									//mkdir OK
									resolve()
								}
								else
								{
									//mkdir not OK
									reject(err)
								}
							})
						}
						else
						{
							//error, but not nonexistent
							reject(err)
						}
					}
					else
					{
						//accessible, OK
						resolve()
					}
				})
			})
			try
			{
				await p;
			}
			catch(ex)
			{
				Log.Error("Local vscode settings folder not accessible: ", ex)
			}
		}
		return path.resolve(ExtensionGlobals.workingDir, ".vscode", "ycmd_settings.json");
	}

	static async StoreLocal(newSettings)
	{
		let data = Buffer.from(JSON.stringify(newSettings), 'utf-8')
		fs.writeFile(await this.PathToLocal(true), data, (err) => {
			if(err)
			{
				//just log it, not much we can do about it
				Log.Error("Error writing local settings: ", err)
			}
		})
	}

	private static async LoadJSONFile(path: string)
	{
		let pData = new Promise<string>((resolve, reject) => {
			fs.readFile(path, "utf-8", (err, data) => {
				if(err)
				{
					reject(err)
				}
				else
				{
					resolve(data)
				}
			})
		})
		
		return JSON.parse(await pData);
	}
}
