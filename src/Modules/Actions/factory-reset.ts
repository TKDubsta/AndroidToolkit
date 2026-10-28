// Factory reset over adb.
//
// Strategies, each a sequence of adb calls (pure builders, so the order is
// pinned by tests):
//   broadcast  `adb root` (succeeds on userdebug/eng builds, harmless elsewhere),
//              then the FACTORY_RESET broadcast to the system MasterClearReceiver,
//              falling back to the older MASTER_CLEAR action. A production
//              build denies the broadcast to shell; that denial is reported.
//   recovery   `adb reboot recovery`, wait for the recovery adbd, then
//              `recovery --wipe_data`. Stock recoveries often expose only
//              sideload, so this is best-effort and the job says so.
//   auto       broadcast, then recovery if the broadcast was denied.
import type { FactoryResetStrategy } from '../../shared/types';
import type { Result } from '../../types/result';
import { Manager as Adb } from '../Adb';
import { Commands } from '../Adb/commands';
import { ParseBroadcastOutput } from '../Adb/parse';
import { Manager as Jobs } from '../Jobs';
import { Fail, MapWithConcurrency, Ok } from '../Utils';

export type ResetStep = { Args: string[]; TimeoutMs: number; Note: string };

export function BroadcastSteps(serial: string): ResetStep[] {
  return [
    { Args: Commands.Root(serial), TimeoutMs: 10000, Note: 'Request root (userdebug builds only)' },
    {
      Args: Commands.FactoryResetBroadcast(serial),
      TimeoutMs: 15000,
      Note: 'FACTORY_RESET broadcast',
    },
    {
      Args: Commands.MasterClearBroadcast(serial),
      TimeoutMs: 15000,
      Note: 'MASTER_CLEAR broadcast (older releases)',
    },
  ];
}

export function RecoverySteps(serial: string): ResetStep[] {
  return [
    { Args: Commands.Reboot(serial, 'recovery'), TimeoutMs: 15000, Note: 'Reboot to recovery' },
    { Args: Commands.WaitForRecovery(serial), TimeoutMs: 90000, Note: 'Wait for recovery adbd' },
    { Args: Commands.RecoveryWipeData(serial), TimeoutMs: 30000, Note: 'Wipe data from recovery' },
  ];
}

type Append = (text: string) => void;

async function runBroadcast(serial: string, append: Append): Promise<'done' | 'denied' | 'failed'> {
  const [RootStep, FactoryStep, MasterStep] = BroadcastSteps(serial) as [
    ResetStep,
    ResetStep,
    ResetStep,
  ];
  append(`> ${RootStep.Note}\n`);
  const Root = await Adb.Run(RootStep.Args, { TimeoutMs: RootStep.TimeoutMs });
  append((Root.Stdout || Root.Stderr).trim() + '\n');

  let Denied = false;
  for (const Step of [FactoryStep, MasterStep]) {
    append(`> ${Step.Note}\n`);
    const Result = await Adb.Run(Step.Args, { TimeoutMs: Step.TimeoutMs });
    const Outcome = ParseBroadcastOutput(Result.Stdout, Result.Stderr);
    append((Outcome.Message || `exit ${Result.Code}`).trim() + '\n');
    if (Outcome.Delivered) return 'done';
    if (Outcome.Denied) Denied = true;
  }
  return Denied ? 'denied' : 'failed';
}

async function runRecovery(serial: string, append: Append): Promise<boolean> {
  for (const Step of RecoverySteps(serial)) {
    append(`> ${Step.Note}\n`);
    const Result = await Adb.Run(Step.Args, { TimeoutMs: Step.TimeoutMs });
    const Text = (Result.Stdout || Result.Stderr).trim();
    if (Text) append(Text + '\n');
    if (Result.TimedOut) {
      append('Timed out waiting for the device.\n');
      return false;
    }
    if (Result.Code !== 0) return false;
  }
  return true;
}

export async function FactoryReset(
  serials: string[],
  strategy: FactoryResetStrategy
): Promise<Result<string[]>> {
  if (!serials.length) return Fail('No devices selected');
  const JobIds: string[] = [];
  const Handles = serials.map((Serial) => {
    const Handle = Jobs.Create('factory-reset', Serial, `Factory reset (${strategy})`);
    JobIds.push(Handle.ID);
    return { Serial, Handle };
  });

  void MapWithConcurrency(Handles, 4, async ({ Serial, Handle }) => {
    Handle.Start();
    try {
      if (strategy === 'broadcast' || strategy === 'auto') {
        const Outcome = await runBroadcast(Serial, Handle.Append);
        if (Outcome === 'done') {
          Handle.Succeed('Factory reset broadcast delivered; the device will wipe and reboot.');
          return;
        }
        if (strategy === 'broadcast' || Outcome === 'failed') {
          Handle.Fail(
            Outcome === 'denied'
              ? 'The device denied the reset broadcast (production build without root).'
              : 'The reset broadcast was not delivered.'
          );
          return;
        }
        Handle.Append('Broadcast denied; falling back to recovery.\n');
      }
      if (await runRecovery(Serial, Handle.Append)) {
        Handle.Succeed('Wipe requested from recovery.');
      } else {
        Handle.Fail("Recovery wipe failed. Use the device's own recovery menu or fastboot -w.");
      }
    } catch (Err) {
      Handle.Fail(Err instanceof Error ? Err.message : String(Err));
    }
  });

  return Ok(JobIds);
}
