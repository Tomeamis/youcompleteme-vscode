'use strict';

export enum LogLevel
{
	NONE,
	FATAL,
	ERROR,
	WARNING,
	INFO,
	DEBUG,
	ALL
}

export class Log
{

	static level : LogLevel

	static SetLevel(level : LogLevel)
	{
		Log.level = level;
	}

	static Debug(...args) : void
	{
		if(Log.level >= LogLevel.DEBUG)
		{
			args.unshift("DEBUG: ");
			console.log.apply(console, args);
		}
	}

	static Info(...args) : void
	{
		if(Log.level >= LogLevel.INFO)
		{
			args.unshift("INFO: ");
			console.log.apply(console, args);
		}
	}

	static Warning(...args) : void
	{
		if(Log.level >= LogLevel.WARNING)
		{
			args.unshift("WARNING: ");
			console.log.apply(console, args);
		}
	}

	static Error(...args) : void
	{
		if(Log.level >= LogLevel.ERROR)
		{
			args.unshift("ERROR: ");
			console.log.apply(console, args);
		}
	}

	static Fatal(...args) : void
	{
		if(Log.level >= LogLevel.FATAL)
		{
			args.unshift("FATAL: ");
			console.log.apply(console, args);
		}
	}
	
}