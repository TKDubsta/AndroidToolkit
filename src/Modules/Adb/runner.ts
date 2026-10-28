// Spawns the adb executable with an argument ARRAY (never a shell string), so
// serials, paths and package names are passed verbatim. Every call has a
// timeout: adb can hang indefinitely on an unresponsive device, and a hung
// poll would otherwise stall the device list for good.
import { spawn } from 'child_process';

export interface AdbRunResult {
  Code: number | null;
  Stdout: string;
  Stderr: string;
  TimedOut: boolean;
  /** The full command for logs and job output. */
  Command: string;
}

export interface AdbRunOptions {
  TimeoutMs?: number;
  /** Receives output as it arrives (install progress, long shells). */
  OnOutput?: (chunk: string) => void;
}

/** The contract the managers depend on, so tests can substitute a fake. */
export type AdbRunner = (args: string[], options?: AdbRunOptions) => Promise<AdbRunResult>;

export const DEFAULT_TIMEOUT_MS = 15000;

/** Quote an argument the way a human would type it, for log lines only. */
export function FormatCommand(executable: string, args: string[]): string {
  const quote = (s: string) => (/[\s"]/.test(s) ? `"${s.replace(/"/g, '\\"')}"` : s);
  return [executable, ...args].map(quote).join(' ');
}

export function CreateAdbRunner(resolveExecutable: () => string | null): AdbRunner {
  return (args, options = {}) =>
    new Promise<AdbRunResult>((resolve) => {
      const Executable = resolveExecutable();
      const Command = FormatCommand(Executable || 'adb', args);
      if (!Executable) {
        resolve({
          Code: null,
          Stdout: '',
          Stderr: 'adb executable not found',
          TimedOut: false,
          Command,
        });
        return;
      }

      const TimeoutMs = options.TimeoutMs ?? DEFAULT_TIMEOUT_MS;
      let Stdout = '';
      let Stderr = '';
      let TimedOut = false;
      let Settled = false;

      let child: ReturnType<typeof spawn>;
      try {
        child = spawn(Executable, args, { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
      } catch (Err) {
        resolve({
          Code: null,
          Stdout: '',
          Stderr: Err instanceof Error ? Err.message : String(Err),
          TimedOut: false,
          Command,
        });
        return;
      }

      const Timer = setTimeout(() => {
        TimedOut = true;
        try {
          child.kill('SIGKILL');
        } catch {}
      }, TimeoutMs);

      const finish = (Code: number | null, Error?: string) => {
        if (Settled) return;
        Settled = true;
        clearTimeout(Timer);
        if (Error) Stderr += (Stderr ? '\n' : '') + Error;
        resolve({ Code, Stdout, Stderr, TimedOut, Command });
      };

      child.stdout?.setEncoding('utf8');
      child.stderr?.setEncoding('utf8');
      child.stdout?.on('data', (chunk: string) => {
        Stdout += chunk;
        options.OnOutput?.(chunk);
      });
      child.stderr?.on('data', (chunk: string) => {
        Stderr += chunk;
        options.OnOutput?.(chunk);
      });
      child.on('error', (Err) => finish(null, Err.message));
      child.on('close', (Code) => finish(Code));
    });
}
