// The adb client used by every manager: owns the resolved executable, the
// runner, and the server-level status the UI shows (found / version / error).
import type { AdbStatus } from '../../shared/types';
import { Manager as Broadcast } from '../Broadcast';
import { CreateLogger } from '../Logger';
import { Manager as SettingsManager } from '../SettingsManager';
import { ResolveAdbPath, type AdbCandidate } from './binary';
import { Commands } from './commands';
import { ParseAdbVersion } from './parse';
import { CreateAdbRunner, type AdbRunner, type AdbRunOptions, type AdbRunResult } from './runner';

const Logger = CreateLogger('Adb');

let Resolved: AdbCandidate | null = null;
let ResolvedForSettingsPath: string | null = null;
let Status: AdbStatus = {
  Available: false,
  Path: null,
  Version: null,
  Source: null,
  Error: 'adb has not been located yet',
};

function resolveExecutable(): string | null {
  const SettingsPath = SettingsManager.Get().AdbPath;
  if (!Resolved || ResolvedForSettingsPath !== SettingsPath) {
    Resolved = ResolveAdbPath(SettingsPath);
    ResolvedForSettingsPath = SettingsPath;
  }
  return Resolved ? Resolved.Path : null;
}

let Runner: AdbRunner = CreateAdbRunner(resolveExecutable);

function setStatus(next: AdbStatus): void {
  const Changed = JSON.stringify(next) !== JSON.stringify(Status);
  Status = next;
  if (Changed) Broadcast.emit('AdbStatusUpdated', Status);
}

export const Manager = {
  /** Run adb with the given argument vector. */
  Run(args: string[], options?: AdbRunOptions): Promise<AdbRunResult> {
    return Runner(args, options);
  },

  GetStatus(): AdbStatus {
    return Status;
  },

  /** Forget the cached executable so the next call re-resolves (settings change). */
  Invalidate(): void {
    Resolved = null;
    ResolvedForSettingsPath = null;
  },

  /** Locate adb and read its version; announces AdbStatusUpdated on change. */
  async Probe(): Promise<AdbStatus> {
    Manager.Invalidate();
    // The runner reports a missing executable as a failed run, so the probe
    // is a single call whether adb is real or (in tests) scripted.
    const Result = await Runner(Commands.Version(), { TimeoutMs: 8000 });
    const Executable = Resolved?.Path ?? null;
    if (Result.Code !== 0) {
      setStatus({
        Available: false,
        Path: Executable,
        Version: null,
        Source: Resolved?.Source ?? null,
        Error: Executable
          ? (Result.Stderr || Result.Stdout || 'adb did not start').trim()
          : 'adb not found. Install Android platform-tools or set the adb path in Settings.',
      });
      return Status;
    }
    setStatus({
      Available: true,
      Path: Executable,
      Version: ParseAdbVersion(Result.Stdout),
      Source: Resolved?.Source ?? null,
      Error: null,
    });
    Logger.log(
      `Using adb ${Status.Version ?? '?'} at ${Executable ?? '(scripted)'} (${Resolved?.Source ?? 'runner'})`
    );
    return Status;
  },

  async RestartServer(): Promise<AdbRunResult> {
    await Runner(Commands.KillServer(), { TimeoutMs: 10000 });
    return Runner(Commands.StartServer(), { TimeoutMs: 20000 });
  },

  /** Tests swap in a scripted runner. Returns the previous one. */
  SetRunner(next: AdbRunner): AdbRunner {
    const Previous = Runner;
    Runner = next;
    return Previous;
  },
};

export type { AdbRunner, AdbRunOptions, AdbRunResult };
