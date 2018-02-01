'use strict'

import * as fs from 'fs'
import * as path from 'path'
import { Log, ExtensionGlobals } from './utils';
import { workspace } from 'vscode';

export class YcmSettings
{

	static async LoadDefault()
	{
		let ycmdPath = workspace.getConfiguration("YouCompleteMe").get("ycmdPath") as string
		return this.LoadJSONFile(path.resolve(ycmdPath, "ycmd/default_settings.json"))
	}

	static LoadLocal(): Promise<any>
	{
		let pJson = this.LoadJSONFile(YcmSettings.PathToLocal())
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

	private static PathToLocal(): string {
		return path.resolve(ExtensionGlobals.workingDir, ".vscode", "ycmd_settings.json");
	}

	static async RememberLocalYcmFile(filename: string, blacklist = false)
	{
		let localSettings = await this.LoadLocal()
		if(blacklist)
		{
			filename = "!"+filename
		}
		if(!localSettings.extra_conf_globlist)
		{
			localSettings.extra_conf_globlist = [filename]
		}
		else
		{
			localSettings.extra_conf_globlist.push(filename)
		}
		this.StoreLocal(localSettings)
	}

	static StoreLocal(newSettings)
	{
		let data = Buffer.from(JSON.stringify(newSettings), 'utf-8')
		fs.writeFile(this.PathToLocal(), data, (err) => {
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