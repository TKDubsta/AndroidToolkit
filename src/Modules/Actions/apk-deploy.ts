// Install one APK on many devices, a few at a time, each as its own job.
import fs from 'fs';
import path from 'path';
import type { InstallOptions } from '../../shared/types';
import type { Result } from '../../types/result';
import { Manager as Adb } from '../Adb';
import { Commands } from '../Adb/commands';
import { ParseInstallOutput } from '../Adb/parse';
import { Manager as Jobs } from '../Jobs';
import { Manager as SettingsManager } from '../SettingsManager';
import { Fail, MapWithConcurrency, Ok } from '../Utils';

// A large APK over a slow wireless link can take minutes; be generous.
const INSTALL_TIMEOUT_MS = 10 * 60 * 1000;

export async function InstallApk(
  serials: string[],
  apkPath: string,
  options: InstallOptions
): Promise<Result<string[]>> {
  if (!serials.length) return Fail('No devices selected');
  if (!apkPath || !fs.existsSync(apkPath)) return Fail('APK file not found');
  if (!/\.apk$/i.test(apkPath)) return Fail('Only .apk files can be installed');

  const Name = path.basename(apkPath);
  const Concurrency = SettingsManager.Get().InstallConcurrency;
  const JobIds: string[] = [];
  const Handles = serials.map((Serial) => {
    const Handle = Jobs.Create('install', Serial, `Install ${Name}`);
    JobIds.push(Handle.ID);
    return { Serial, Handle };
  });

  // Not awaited: the renderer follows progress through JobsUpdated.
  void MapWithConcurrency(Handles, Concurrency, async ({ Serial, Handle }) => {
    Handle.Start();
    const Result = await Adb.Run(Commands.Install(Serial, apkPath, options), {
      TimeoutMs: INSTALL_TIMEOUT_MS,
      OnOutput: (chunk) => Handle.Append(chunk),
    });
    if (Result.TimedOut) {
      Handle.Fail('Install timed out');
      return;
    }
    const Outcome = ParseInstallOutput(Result.Stdout, Result.Stderr);
    if (Outcome.Success) Handle.Succeed();
    else Handle.Fail(Outcome.Message);
  });

  return Ok(JobIds);
}
