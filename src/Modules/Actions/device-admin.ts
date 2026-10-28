// Device administrator listing and removal.
//
// Removal uses `dpm remove-active-admin`, which also clears a device or profile
// owner. Android only honours it for admins whose app is debuggable or marks
// itself android:testOnly, so a production device owner will refuse with a
// SecurityException; the job reports adb's own text so the refusal is visible
// rather than guessed at.
import type { DeviceAdmin } from '../../shared/types';
import type { Result } from '../../types/result';
import { Manager as Adb } from '../Adb';
import { Commands } from '../Adb/commands';
import { ParseDeviceAdmins, ParseRemoveAdminOutput } from '../Adb/parse';
import { Manager as Jobs } from '../Jobs';
import { Fail, MapWithConcurrency, Ok } from '../Utils';

export async function ListDeviceAdmins(serial: string): Promise<Result<DeviceAdmin[]>> {
  if (!serial) return Fail('No device given');
  const Result = await Adb.Run(Commands.DumpDevicePolicy(serial), { TimeoutMs: 15000 });
  if (Result.Code !== 0) {
    return Fail((Result.Stderr || Result.Stdout).trim() || 'dumpsys device_policy failed');
  }
  return Ok(ParseDeviceAdmins(Result.Stdout));
}

async function removeOne(
  serial: string,
  admin: DeviceAdmin,
  append: (t: string) => void
): Promise<boolean> {
  append(`> dpm remove-active-admin ${admin.Component}\n`);
  const Result = await Adb.Run(Commands.RemoveActiveAdmin(serial, admin.Component, admin.UserId), {
    TimeoutMs: 20000,
  });
  const Outcome = ParseRemoveAdminOutput(Result.Stdout, Result.Stderr);
  append(Outcome.Message + '\n');
  return Outcome.Success;
}

/**
 * Remove `component` (or every admin when null) from each device. One job per
 * device; the job fails if any removal fails.
 */
export async function RemoveDeviceAdmins(
  serials: string[],
  component: string | null
): Promise<Result<string[]>> {
  if (!serials.length) return Fail('No devices selected');
  const JobIds: string[] = [];
  const Handles = serials.map((Serial) => {
    const Handle = Jobs.Create(
      'remove-admin',
      Serial,
      component ? `Remove admin ${component}` : 'Remove all device admins'
    );
    JobIds.push(Handle.ID);
    return { Serial, Handle };
  });

  void MapWithConcurrency(Handles, 4, async ({ Serial, Handle }) => {
    Handle.Start();
    const [Err, Admins] = await ListDeviceAdmins(Serial);
    if (Err || !Admins) {
      Handle.Fail(Err || 'Could not read device admins');
      return;
    }
    const Targets = component ? Admins.filter((a) => a.Component === component) : Admins;
    if (!Targets.length) {
      Handle.Succeed(component ? `${component} is not an active admin` : 'No device admins found');
      return;
    }
    // Owners first: an active-admin entry for the same package goes with them.
    const Rank = { 'device-owner': 0, 'profile-owner': 1, 'active-admin': 2 } as const;
    Targets.sort((a, b) => Rank[a.Role] - Rank[b.Role]);
    let Failed = 0;
    for (const Admin of Targets) {
      if (!(await removeOne(Serial, Admin, Handle.Append))) Failed += 1;
    }
    if (Failed) Handle.Fail(`${Failed} of ${Targets.length} admin(s) could not be removed`);
    else Handle.Succeed(`Removed ${Targets.length} admin(s)`);
  });

  return Ok(JobIds);
}
