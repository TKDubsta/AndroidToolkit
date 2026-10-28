// Network-side operations: connect/disconnect/pair an address, switch a USB
// device to wireless, and reboot.
import type { RebootMode } from '../../shared/types';
import type { Result } from '../../types/result';
import { Manager as Adb } from '../Adb';
import { Commands } from '../Adb/commands';
import {
  ParseConnectOutput,
  ParseDeviceIPv4,
  ParsePairOutput,
  ParseTcpipOutput,
} from '../Adb/parse';
import { Manager as DeviceManager } from '../DeviceManager';
import { Manager as Jobs } from '../Jobs';
import { Manager as SettingsManager } from '../SettingsManager';
import { Fail, MapWithConcurrency, Ok, Wait } from '../Utils';

const ADDRESS_PATTERN = /^[A-Za-z0-9.\-[\]:]+:\d{1,5}$/;

/** Accepts host, host:port, or an IPv6 literal in brackets; defaults the port. */
export function NormalizeAddress(input: string, defaultPort: number): string | null {
  const Trimmed = (input || '').trim();
  if (!Trimmed) return null;
  const WithPort =
    /:\d{1,5}$/.test(Trimmed) && !/^[0-9a-f:]+$/i.test(Trimmed)
      ? Trimmed
      : `${Trimmed}:${defaultPort}`;
  return ADDRESS_PATTERN.test(WithPort) ? WithPort : null;
}

export async function ConnectDevice(address: string): Promise<Result<string>> {
  const Address = NormalizeAddress(address, SettingsManager.Get().WirelessPort);
  if (!Address) return Fail('Enter an address as host or host:port');
  const Handle = Jobs.Create('connect', Address, `Connect ${Address}`);
  Handle.Start();
  const Result = await Adb.Run(Commands.Connect(Address), { TimeoutMs: 15000 });
  const Outcome = ParseConnectOutput(Result.Stdout, Result.Stderr);
  void DeviceManager.Poll();
  if (!Outcome.Success) {
    Handle.Fail(Outcome.Message);
    return Fail(Outcome.Message);
  }
  Handle.Succeed(Outcome.Message);
  return Ok(Outcome.Message);
}

export async function DisconnectDevice(serial: string): Promise<Result<string>> {
  if (!serial) return Fail('No device given');
  const Handle = Jobs.Create('disconnect', serial, `Disconnect ${serial}`);
  Handle.Start();
  const Result = await Adb.Run(Commands.Disconnect(serial), { TimeoutMs: 10000 });
  const Message = (Result.Stdout || Result.Stderr).trim();
  if (Result.Code !== 0) {
    Handle.Fail(Message || 'adb disconnect failed');
    return Fail(Message || 'adb disconnect failed');
  }
  DeviceManager.Forget(serial);
  Handle.Succeed(Message);
  return Ok(Message);
}

export async function PairDevice(address: string, code: string): Promise<Result<string>> {
  const Address = NormalizeAddress(address, 0);
  const Code = (code || '').trim();
  if (!Address) return Fail('Enter the pairing address as host:port');
  if (!/^\d{6}$/.test(Code)) return Fail('The pairing code is six digits');
  const Handle = Jobs.Create('pair', Address, `Pair ${Address}`);
  Handle.Start();
  const Result = await Adb.Run(Commands.Pair(Address, Code), { TimeoutMs: 30000 });
  const Outcome = ParsePairOutput(Result.Stdout, Result.Stderr);
  if (!Outcome.Success) {
    Handle.Fail(Outcome.Message);
    return Fail(Outcome.Message);
  }
  Handle.Succeed(Outcome.Message);
  return Ok(Outcome.Message);
}

/**
 * Switch a USB-attached device to TCP/IP adbd and connect to it over Wi-Fi.
 * The IP is read before `tcpip` restarts adbd, while the shell still answers.
 */
export async function EnableWireless(serial: string): Promise<Result<string>> {
  const Device = DeviceManager.Get(serial);
  if (!Device) return Fail('Unknown device');
  if (Device.Transport !== 'usb') return Fail('Enable wireless from the USB connection');
  const Port = SettingsManager.Get().WirelessPort;
  const Handle = Jobs.Create('wireless', serial, `Enable wireless ADB on port ${Port}`);
  Handle.Start();

  let Ip: string | null = null;
  for (const Args of [Commands.WlanAddress(serial), Commands.RouteTable(serial)]) {
    const Probe = await Adb.Run(Args, { TimeoutMs: 10000 });
    Ip = ParseDeviceIPv4(Probe.Stdout);
    if (Ip) break;
  }
  if (!Ip) {
    Handle.Fail('Could not read the device Wi-Fi address (is Wi-Fi connected?)');
    return Fail('Could not read the device Wi-Fi address');
  }
  Handle.Append(`Device address ${Ip}\n`);

  const Tcp = await Adb.Run(Commands.Tcpip(serial, Port), { TimeoutMs: 15000 });
  const TcpOutcome = ParseTcpipOutput(Tcp.Stdout, Tcp.Stderr);
  Handle.Append(TcpOutcome.Message + '\n');
  if (!TcpOutcome.Success) {
    Handle.Fail('adb tcpip failed');
    return Fail(TcpOutcome.Message);
  }

  // adbd takes a moment to come back up in TCP mode.
  await Wait(2000);
  const Address = `${Ip}:${Port}`;
  const Connect = await Adb.Run(Commands.Connect(Address), { TimeoutMs: 15000 });
  const Outcome = ParseConnectOutput(Connect.Stdout, Connect.Stderr);
  Handle.Append(Outcome.Message + '\n');
  void DeviceManager.Poll();
  if (!Outcome.Success) {
    Handle.Fail(`tcpip succeeded but connect failed: ${Outcome.Message}`);
    return Fail(Outcome.Message);
  }
  Handle.Succeed(`Connected over Wi-Fi as ${Address}`);
  return Ok(Address);
}

export async function RebootDevices(
  serials: string[],
  mode: RebootMode
): Promise<Result<string[]>> {
  if (!serials.length) return Fail('No devices selected');
  const JobIds: string[] = [];
  const Handles = serials.map((Serial) => {
    const Handle = Jobs.Create(
      'reboot',
      Serial,
      mode === 'system' ? 'Reboot' : `Reboot to ${mode}`
    );
    JobIds.push(Handle.ID);
    return { Serial, Handle };
  });
  void MapWithConcurrency(Handles, 6, async ({ Serial, Handle }) => {
    Handle.Start();
    const Result = await Adb.Run(Commands.Reboot(Serial, mode), { TimeoutMs: 15000 });
    const Text = (Result.Stdout || Result.Stderr).trim();
    if (Result.Code === 0) Handle.Succeed(Text || 'Reboot requested');
    else Handle.Fail(Text || 'adb reboot failed');
  });
  return Ok(JobIds);
}
