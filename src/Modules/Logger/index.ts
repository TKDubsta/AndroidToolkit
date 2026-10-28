// Console + file logger with coloured tags; writes a daily log file under the
// app-data Logs directory. A trimmed-down version of ShowTrak Server's logger.
import fs from 'fs';
import path from 'path';
import { Manager as AppDataManager } from '../AppData';

const pc = require('picocolors');

const LEVELS: Record<string, number> = { debug: 10, info: 20, warn: 30, error: 40 };

// A packaged Electron app has no NODE_ENV; `process.defaultApp` is only set
// when launched from a checkout (`electron .`), so its absence marks a shipped
// build. LOG_LEVEL overrides both so a misbehaving install can be relaunched
// with LOG_LEVEL=debug without a rebuild.
const DefaultLevel =
  process.env.NODE_ENV === 'production' || !process.defaultApp ? 'info' : 'debug';
const Settings = {
  level: (process.env.LOG_LEVEL || DefaultLevel).toLowerCase(),
  toConsole: (process.env.LOG_TO_CONSOLE || 'true').toLowerCase() !== 'false',
  toFile: (process.env.LOG_TO_FILE || 'true').toLowerCase() !== 'false',
};

function isLevelEnabled(level: string): boolean {
  const Wanted = LEVELS[level] ?? LEVELS.info ?? 20;
  const Current = LEVELS[Settings.level] ?? LEVELS[DefaultLevel] ?? 20;
  return Wanted >= Current;
}

function Pad(Text: string, Width = 8): string {
  return Text.length >= Width ? Text : Text + ' '.repeat(Width - Text.length);
}

function TwoDigits(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

function DateStamp(d = new Date()): string {
  return `${d.getFullYear()}-${TwoDigits(d.getMonth() + 1)}-${TwoDigits(d.getDate())}`;
}

function TimeStamp(d = new Date()): string {
  return `${DateStamp(d)} ${TwoDigits(d.getHours())}:${TwoDigits(d.getMinutes())}:${TwoDigits(d.getSeconds())}`;
}

function SerializeArg(Arg: unknown): string {
  if (typeof Arg === 'string') return Arg;
  if (Arg instanceof Error) return Arg.stack || Arg.message;
  try {
    return JSON.stringify(Arg);
  } catch {
    return String(Arg);
  }
}

const Colours: Record<string, (s: string) => string> = {
  DEBUG: pc.gray,
  INFO: pc.cyan,
  WARN: pc.magenta,
  ERROR: pc.red,
  SUCCESS: pc.green,
};

let LogDirectory: string | null = null;
let WriteQueue: Promise<void> = Promise.resolve();

function logFilePath(): string | null {
  if (!Settings.toFile) return null;
  try {
    if (!LogDirectory) {
      LogDirectory = AppDataManager.GetLogsDirectory();
      fs.mkdirSync(LogDirectory, { recursive: true });
    }
    return path.join(LogDirectory, `AndroidToolkit-${DateStamp()}.log`);
  } catch {
    return null;
  }
}

function appendToFile(Line: string): void {
  const File = logFilePath();
  if (!File) return;
  WriteQueue = WriteQueue.then(() => fs.promises.appendFile(File, Line + '\n', 'utf8')).catch(
    () => {}
  );
}

function emit(Scope: string, Type: string, Level: string, Args: unknown[]): void {
  if (!isLevelEnabled(Level)) return;
  const Message = Args.map(SerializeArg).join(' ');
  const Plain = `[${TimeStamp()}] [AndroidToolkit] [${Pad(Scope)}] [${Pad(Type)}] ${Message}`;
  if (Settings.toConsole) {
    const Colour = Colours[Type] || pc.cyan;
    const Tag = `[${pc.cyan('AndroidToolkit')}] [${pc.cyan(Pad(Scope))}] [${Colour(Pad(Type))}]`;
    const Out = Level === 'error' ? console.error : Level === 'warn' ? console.warn : console.log;
    Out(`${pc.gray(TimeStamp())} ${Tag} ${Message}`);
  }
  appendToFile(Plain);
}

export interface Logger {
  log(...args: unknown[]): void;
  info(...args: unknown[]): void;
  debug(...args: unknown[]): void;
  warn(...args: unknown[]): void;
  error(...args: unknown[]): void;
  success(...args: unknown[]): void;
}

export function CreateLogger(Scope: string): Logger {
  return {
    log: (...args) => emit(Scope, 'INFO', 'info', args),
    info: (...args) => emit(Scope, 'INFO', 'info', args),
    debug: (...args) => emit(Scope, 'DEBUG', 'debug', args),
    warn: (...args) => emit(Scope, 'WARN', 'warn', args),
    error: (...args) => emit(Scope, 'ERROR', 'error', args),
    success: (...args) => emit(Scope, 'SUCCESS', 'info', args),
  };
}

export function SetLogLevel(Level: string): void {
  if (LEVELS[Level] !== undefined) Settings.level = Level;
}

/** Wait for queued file writes to land (used at shutdown and by tests). */
export function FlushLogs(): Promise<void> {
  return WriteQueue;
}
