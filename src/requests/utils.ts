'use strict'

import {workspace, Position, TextDocument, Memento, Range} from 'vscode'
import {YcmServer} from '../server'

type VscodeLoc = {pos: Position, doc: TextDocument}

export class YcmFileDataMap
{

	constructor()
	{
		let filetypes = workspace.getConfiguration('YouCompleteMe').get('filetypes') as string[]
		workspace.textDocuments.forEach(doc => {
			if(filetypes.find(filetype => filetype === doc.languageId))
			{
				this[doc.fileName] = {contents: doc.getText(), filetypes: [doc.languageId]}
			}
		})
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

	public ToVscodeRange(): Range
	{
		return new Range(this.start.GetVscodePosition().pos, this.end.GetVscodePosition().pos)
	}

	public GetFile(): string
	{
		return this.start.filepath
	}

}

export class YcmLocation
{
	line_num: number
	column_num: number
	filepath: string

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
			this.filepath = path
		}
	}

	public static FromVscodePosition(doc: TextDocument, pos: Position): YcmLocation
	{
		let lineText = doc.lineAt(pos).text
		let col = StringOffsetToYcmOffset(lineText, pos.character)
		return new YcmLocation(pos.line+1, col, doc.fileName)
	}

	public static FromSimpleObject(obj: any): YcmLocation
	{
		return new YcmLocation(obj.line_num, obj.column_num, obj.filepath)
	}

	public GetVscodePosition(): VscodeLoc
	{
		let result: VscodeLoc
		let lineNum = this.line_num-1
		result.doc = workspace.textDocuments.find((val: TextDocument) => {
			return val.fileName == this.filepath
		})
		let lineText = result.doc.lineAt(lineNum).text
		let charIndex = YcmOffsetToStringOffset(lineText, this.column_num)
		result.pos = new Position(lineNum, charIndex);
		return result
	}
}

function YcmOffsetToStringOffset(text: string, offset: number): number
{
	let bytes = Buffer.from(text, 'utf-8')
	//go to 0-based
	offset -= 1
	if(offset >= text.length)
	{
		throw "Offset greater than input length"
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
	if(text.length <= offset)
	{
		throw "Offset greater than input length"
	}
	let bytes = Buffer.from(text, 'utf-8')
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