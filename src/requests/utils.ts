'use strict'

import {workspace, Position, TextDocument, Memento, Range, window, Location, Uri} from 'vscode'
import {YcmServer} from '../server'
import { YcmLoadExtraConfRequest } from './load_extra_conf';
import { Log } from '../utils';
import * as path from 'path'
import { YcmSettings } from '../ycmConfig';

export class VscodeLoc 
{
	pos: Position
	filename: string

	public ToVscodeLocation()
	{
		return new Location(Uri.file(this.filename), this.pos);
	}
}

export interface YcmFileDataMap
{
	[filename: string]: {
		contents: string
		filetypes: [string]
	}
}

export namespace YcmFileDataMapKeeper
{

	let stData: YcmFileDataMap = {}

	function AddDoc(doc: TextDocument)
	{
		stData[doc.fileName] = {contents: doc.getText(), filetypes: [doc.languageId]}
	}

	export async function GetDataMap(requiredFilePath: YcmFilepath): Promise<YcmFileDataMap>
	{
		let filetypes = workspace.getConfiguration('YouCompleteMe').get('filetypes') as string[]
		let reqFilePresent = false
		workspace.textDocuments.forEach(doc => {
			if(filetypes.find(filetype => filetype === doc.languageId))
			{
				if(doc.fileName === requiredFilePath.normalizedPath)
				{
					reqFilePresent = true
				}
				else if(!doc.isDirty)
				{
					//only send dirty documents (unless they are the required document)
					return
				}
				AddDoc(doc)
			}
		})
		if(!reqFilePresent)
		{
			let nDoc = await workspace.openTextDocument(requiredFilePath.normalizedPath)
			AddDoc(nDoc)
		}
		let nmap: YcmFileDataMap = {}
		for(let key in stData)
		{
			if(key === requiredFilePath.normalizedPath)
			{
				nmap[requiredFilePath.receivedPath] = stData[key]
			}
			else
			{
				nmap[key] = stData[key]
			}
		}
		return nmap
	}

}

export class UtilGlobalState
{
	public static optionStorage: Memento
}

export class YcmRange
{
	start: YcmLocation
	end: YcmLocation

	constructor(range: YcmRange)
	constructor(start: YcmLocation, end: YcmLocation)
	constructor(first: YcmRange|YcmLocation, end?:YcmLocation)
	{
		if(first instanceof YcmRange)
		{
			this.start = new YcmLocation(first.start)
			this.end = new YcmLocation(first.end)
		}
		else
		{
			this.start = first
			this.end = end
		}
	}

	public static FromVscodeRange(doc: TextDocument, range: Range)
	{
		return new YcmRange(
			YcmLocation.FromVscodePosition(doc, range.start),
			YcmLocation.FromVscodePosition(doc, range.end)
		)
	}

	public static FromSimpleObject(obj: any)
	{
		return new YcmRange(
			YcmLocation.FromSimpleObject(obj.start),
			YcmLocation.FromSimpleObject(obj.end)
		)
	}

	public Equals(other: YcmRange): boolean
	{
		return this.start.Equals(other.start) &&
			this.end.Equals(other.end)
	}

	public async ToVscodeRange(): Promise<Range>
	{
		let [start, end] = await Promise.all([this.start.GetVscodeLoc(), this.end.GetVscodeLoc()])
		return new Range(start.pos, end.pos)
	}

	public GetFilepath(): YcmFilepath
	{
		return this.start.filepath
	}

}

/**
 * Class for paths from Ycmd. Can get either normalized path for normal use,
 * or path as received for further communication with Ycmd
 */
export class YcmFilepath
{
	receivedPath: string
	normalizedPath: string

	constructor(filepath: string)
	{
		this.receivedPath = filepath
		this.normalizedPath = Uri.file(filepath).fsPath
	}

}

export class YcmLocation
{
	line_num: number
	column_num: number
	filepath: YcmFilepath

	public constructor(loc: YcmLocation)
	public constructor(row: number, col: number, path: string)
	public constructor(firstParam: YcmLocation|number, col?: number, path?: string)
	{
		if(firstParam instanceof YcmLocation)
		{
			this.line_num = firstParam.line_num
			this.column_num = firstParam.column_num
			this.filepath = firstParam.filepath
		}
		else
		{
			this.line_num = firstParam
			this.column_num = col
			this.filepath = new YcmFilepath(path)
		}
	}

	public static FromVscodePosition(doc: TextDocument, pos: Position): YcmLocation
	{
		let lineText = doc.lineAt(pos).text
		Log.Debug("Resolving vscode position ", pos, "in ", doc.fileName, " to YcmLocation")
		let col = StringOffsetToYcmOffset(lineText, pos.character)
		return new YcmLocation(pos.line+1, col, doc.fileName)
	}

	public static FromSimpleObject(obj: any): YcmLocation
	{
		return new YcmLocation(obj.line_num, obj.column_num, obj.filepath)
	}

	public Equals(other: YcmLocation): boolean
	{
		return this.line_num === other.line_num &&
			this.column_num === other.column_num &&
			this.filepath.normalizedPath === other.filepath.normalizedPath
	}

	public async GetVscodeLoc(): Promise<VscodeLoc>
	{
		let result = new VscodeLoc
		let lineNum = this.line_num-1
		result.filename = this.filepath.normalizedPath
		Log.Debug("Resolving YcmLocation ", this, "to Vscode location")
		//sometimes ycmd returns this on diags in included files. Didn't figure out
		//how to reproduce, but leaving this in anyways
		if(this.column_num === 0 && this.filepath.receivedPath === "" && this.line_num === 0)
		{
			result.pos = new Position(0, 0)
		}
		else if(this.column_num <= 2)
		{
			result.pos = new Position(lineNum, this.column_num-1)
		}
		else
		{
			let doc = workspace.textDocuments.find((val: TextDocument) => {
				return val.fileName == this.filepath.normalizedPath
			})
			if(!doc)
			{
				let pDoc = new Promise<TextDocument>((res, rej) => {
					workspace.openTextDocument(this.filepath.normalizedPath).then(
						val => {
							res(val)
						},
						reason => {
							rej(reason)
						}
					)
				})
				doc = await pDoc
			}
			let lineText = doc.lineAt(lineNum).text
			let charIndex = YcmOffsetToStringOffset(lineText, this.column_num)
			result.pos = new Position(lineNum, charIndex);
		}
		return result
	}
}

function YcmOffsetToStringOffset(text: string, offset: number): number
{
	let bytes = Buffer.from(text, 'utf-8')
	//go to 0-based
	offset -= 1
	if(offset > bytes.length)
	{
		Log.Error("Ycm offset greater than byte length: ", offset, ">", bytes.length)
		Log.Debug("Line: ", text)
		throw "Ycm offset greater than byte length"
	}
	//if offset points to end of buffer, return end of string
	else if(offset == bytes.length)
	{
		return text.length
	}
	let curOffset = 0
	for(let pos = 0; pos < offset; pos += 1)
	{
		if(((bytes[pos]>>6)&0b11) != 0b10)
		{
			curOffset += 1
		}
	}
	return curOffset
}

function StringOffsetToYcmOffset(text: string, offset: number): number
{
	if(text.length < offset)
	{
		Log.Error("String offset greater than string length: ", offset, ">", text.length);
		Log.Debug("Line: ", text);
		throw "String offset greater than input length"
	}
	let bytes = Buffer.from(text, 'utf-8')
	//if offset points to end of string, return end of buffer
	if(text.length == offset)
	{
		//+1 for 1-based indexing
		return bytes.length+1
	}
	let pos = 0
	//last +1 takes care of 1-based indexing
	for(let curOffset = 0; curOffset <= offset; pos += 1)
	{
		if(((bytes[pos]>>6)&0b11) != 0b10)
		{
			curOffset += 1
		}
	}
	return pos
}

interface YcmExceptionResponse
{
	exception: any
	message: string
	traceback: string
}

function isYcmExceptionResponse(arg: any): arg is YcmExceptionResponse
{
	return 'exception' in arg &&
	'message' in arg &&
	'traceback' in arg
}

/**
 * Tries to handle an error received from the server.
 * If the request should be retried, returns true
 * If the error should be logged/displayed, rethrows it
 * 
 * @param err The error as an object
 * @returns True if the request should be retried, false otherwise
 */
export async function HandleRequestError(err): Promise<boolean>
{
	//check if the type matches
	if(!isYcmExceptionResponse(err))
	{
		//type does not match, just return
		throw err;
		//TODO: implement file not found
	}
	let type = err.exception['TYPE']
	if(type == "UnknownExtraConf")
	{
		let filename = err.exception['extra_conf_file']
		//ask what to do
		let choice = await window.showErrorMessage(err.message, "Load", "Load and remember", "Blacklist");
		if(typeof choice == "undefined")
		{
			return false
		}
		if(choice == "Load and remember")
		{
			YcmSettings.RememberLocalYcmFile(filename, false)
		}
		else if(choice == "Blacklist")
		{
			YcmSettings.RememberLocalYcmFile(filename, true)
		}
		//load the file
		if(choice.startsWith("Load"))
		{
			let extraConfReq = new YcmLoadExtraConfRequest(filename)
			let extraConfLoaded = await extraConfReq.Send(await YcmServer.GetInstance())
			if(extraConfLoaded.err)
			{
				return HandleRequestError(extraConfLoaded.err)
			}
			else
			{
				return true
			}
		}
	}
	else if(type == "RuntimeError")
	{
		if(err.message == "Can't jump to definition or declaration.")
		{
			Log.Info("GoTo lookup failed");
			return false
		}
		else
		{
			Log.Error("HandleRequestError: Unknown runtime error: ", err)
			throw err
		}
	}
	else
	{
		Log.Error("HandleRequestError: Unknown error: ", err)
		throw err
	}
}
