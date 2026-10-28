// Argument-vector builders for every adb invocation the app makes. Pure so the
// exact flags are pinned by test/adb-commands.test.js; the runner receives
// these arrays verbatim (no shell), so nothing needs quoting here.
import type { InstallOptions, RebootMode } from '../../shared/types';

export const FACTORY_RESET_RECEIVER = 'android/com.android.server.MasterClearReceiver';

function forDevice(serial: string, rest: string[]): string[] {
  return ['-s', serial, ...rest];
}

export const Commands = {
  Version: (): string[] => ['version'],
  StartServer: (): string[] => ['start-server'],
  KillServer: (): string[] => ['kill-server'],
  Devices: (): string[] => ['devices', '-l'],
  MdnsServices: (): string[] => ['mdns', 'services'],
  Connect: (address: string): string[] => ['connect', address],
  Disconnect: (address: string): string[] => ['disconnect', address],
  Pair: (address: string, code: string): string[] => ['pair', address, code],

  GetProp: (serial: string): string[] => forDevice(serial, ['shell', 'getprop']),
  Battery: (serial: string): string[] => forDevice(serial, ['shell', 'dumpsys', 'battery']),
  WlanAddress: (serial: string): string[] =>
    forDevice(serial, ['shell', 'ip', '-f', 'inet', 'addr', 'show', 'wlan0']),
  RouteTable: (serial: string): string[] => forDevice(serial, ['shell', 'ip', 'route']),
  Tcpip: (serial: string, port: number): string[] => forDevice(serial, ['tcpip', String(port)]),

  Reboot: (serial: string, mode: RebootMode): string[] =>
    forDevice(serial, mode === 'system' ? ['reboot'] : ['reboot', mode]),

  Install: (serial: string, apkPath: string, options: InstallOptions): string[] => {
    const Flags: string[] = [];
    if (options.Reinstall) Flags.push('-r');
    if (options.GrantPermissions) Flags.push('-g');
    if (options.AllowDowngrade) Flags.push('-d');
    if (options.AllowTestPackages) Flags.push('-t');
    return forDevice(serial, ['install', ...Flags, apkPath]);
  },

  DumpDevicePolicy: (serial: string): string[] =>
    forDevice(serial, ['shell', 'dumpsys', 'device_policy']),
  RemoveActiveAdmin: (serial: string, component: string, userId: number | null): string[] =>
    forDevice(serial, [
      'shell',
      'dpm',
      'remove-active-admin',
      ...(userId === null ? [] : ['--user', String(userId)]),
      component,
    ]),

  Root: (serial: string): string[] => forDevice(serial, ['root']),
  /** API 26+: the FACTORY_RESET broadcast to the system's MasterClearReceiver. */
  FactoryResetBroadcast: (serial: string): string[] =>
    forDevice(serial, [
      'shell',
      'am',
      'broadcast',
      '-a',
      'android.intent.action.FACTORY_RESET',
      '-n',
      FACTORY_RESET_RECEIVER,
    ]),
  /** Older releases: the MASTER_CLEAR broadcast. */
  MasterClearBroadcast: (serial: string): string[] =>
    forDevice(serial, [
      'shell',
      'am',
      'broadcast',
      '-a',
      'android.intent.action.MASTER_CLEAR',
      '-n',
      FACTORY_RESET_RECEIVER,
    ]),
  WaitForRecovery: (serial: string): string[] => forDevice(serial, ['wait-for-recovery']),
  RecoveryWipeData: (serial: string): string[] =>
    forDevice(serial, ['shell', 'recovery', '--wipe_data']),
};
