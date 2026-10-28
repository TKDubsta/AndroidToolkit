// Pure presentation helpers for device tiles and the activity panel. No DOM,
// so test/renderer-device-view.test.js pins the labels and grouping.
import type { AdbDevice, DiscoveredService, Job } from '../../../../shared/types';

export type TileStatusClass = 'ONLINE' | 'OFFLINE' | 'DEGRADED' | 'IDLE' | 'PENDING';

/** Tile colour for an adb state. */
export function StatusClassFor(state: AdbDevice['State']): TileStatusClass {
  switch (state) {
    case 'device':
      return 'ONLINE';
    case 'offline':
      return 'OFFLINE';
    case 'unauthorized':
    case 'no permissions':
    case 'recovery':
    case 'rescue':
    case 'sideload':
    case 'bootloader':
      return 'DEGRADED';
    case 'authorizing':
    case 'connecting':
      return 'IDLE';
    default:
      return 'OFFLINE';
  }
}

export function StateLabel(state: AdbDevice['State']): string {
  switch (state) {
    case 'device':
      return 'Online';
    case 'offline':
      return 'Offline';
    case 'unauthorized':
      return 'Unauthorized';
    case 'no permissions':
      return 'No permissions';
    case 'authorizing':
      return 'Authorizing';
    case 'connecting':
      return 'Connecting';
    case 'recovery':
      return 'In recovery';
    case 'rescue':
      return 'In rescue';
    case 'sideload':
      return 'Sideload';
    case 'bootloader':
      return 'Bootloader';
    default:
      return 'Unknown';
  }
}

/** Tooltip for a tile: what to do about a non-online state. */
export function StateHint(state: AdbDevice['State']): string {
  switch (state) {
    case 'unauthorized':
      return 'Unauthorized: accept the USB debugging prompt on the device';
    case 'no permissions':
      return 'No permissions: adb cannot open the device (udev rules / driver)';
    case 'offline':
      return 'Offline: adb lost the device; replug or reconnect';
    default:
      return StateLabel(state);
  }
}

/** Main line of a tile: manufacturer + model when known, else the serial. */
export function DeviceTitle(
  device: Pick<AdbDevice, 'Manufacturer' | 'Model' | 'Serial' | 'Product'>
): string {
  const Model = (device.Model || '').trim();
  const Maker = (device.Manufacturer || '').trim();
  if (Model && Maker && !Model.toLowerCase().startsWith(Maker.toLowerCase())) {
    return `${capitalize(Maker)} ${Model}`;
  }
  if (Model) return Model;
  if (device.Product) return device.Product;
  return device.Serial;
}

/** Second line: the serial, or the address for a network device. */
export function DeviceSubtitle(
  device: Pick<AdbDevice, 'Serial' | 'Address' | 'Transport' | 'HardwareSerial'>
): string {
  if (device.Transport === 'network') {
    const Hw = device.HardwareSerial ? ` · ${device.HardwareSerial}` : '';
    return `${device.Address || device.Serial}${Hw}`;
  }
  return device.Serial;
}

/** Third line: Android version / SDK, when enrichment has landed. */
export function DeviceMeta(
  device: Pick<AdbDevice, 'AndroidVersion' | 'SdkVersion' | 'Enriched' | 'State'>
): string {
  if (device.State !== 'device') return '';
  if (!device.Enriched) return 'Reading details…';
  const Parts: string[] = [];
  if (device.AndroidVersion) Parts.push(`Android ${device.AndroidVersion}`);
  if (device.SdkVersion) Parts.push(`API ${device.SdkVersion}`);
  return Parts.join(' · ');
}

export function TransportIcon(transport: AdbDevice['Transport']): string {
  if (transport === 'network') return 'bi-wifi';
  if (transport === 'emulator') return 'bi-cpu';
  return 'bi-usb-symbol';
}

export function TransportLabel(transport: AdbDevice['Transport']): string {
  if (transport === 'network') return 'Network';
  if (transport === 'emulator') return 'Emulators';
  return 'USB';
}

export function BatteryIcon(level: number | null): string {
  if (level === null) return '';
  if (level >= 90) return 'bi-battery-full';
  if (level >= 40) return 'bi-battery-half';
  return 'bi-battery';
}

export interface DeviceGroup {
  Key: AdbDevice['Transport'];
  Label: string;
  Devices: AdbDevice[];
}

/** Devices grouped by transport in USB, Network, Emulator order; empty groups omitted. */
export function GroupDevices(devices: AdbDevice[]): DeviceGroup[] {
  const Order: AdbDevice['Transport'][] = ['usb', 'network', 'emulator'];
  return Order.map((Key) => ({
    Key,
    Label: TransportLabel(Key),
    Devices: devices.filter((d) => d.Transport === Key),
  })).filter((g) => g.Devices.length > 0);
}

/** Discovered services that are not already attached as a device, pairing endpoints excluded. */
export function UnconnectedServices(
  services: DiscoveredService[],
  devices: AdbDevice[]
): DiscoveredService[] {
  const Known = new Set(devices.map((d) => d.Serial));
  const Hosts = new Set(
    devices.filter((d) => d.Address).map((d) => (d.Address as string).split(':')[0])
  );
  return services.filter(
    (s) => s.Type !== 'pairing' && !Known.has(s.Address) && !Hosts.has(s.Host)
  );
}

export function ServiceTypeLabel(type: DiscoveredService['Type']): string {
  if (type === 'connect') return 'Wireless debugging';
  if (type === 'pairing') return 'Pairing';
  return 'TCP/IP';
}

export interface JobSummary {
  Running: number;
  Queued: number;
  Failed: number;
  Succeeded: number;
  Total: number;
}

export function SummarizeJobs(jobs: Job[]): JobSummary {
  const Summary: JobSummary = {
    Running: 0,
    Queued: 0,
    Failed: 0,
    Succeeded: 0,
    Total: jobs.length,
  };
  for (const Job of jobs) {
    if (Job.Status === 'running') Summary.Running += 1;
    else if (Job.Status === 'queued') Summary.Queued += 1;
    else if (Job.Status === 'failed') Summary.Failed += 1;
    else Summary.Succeeded += 1;
  }
  return Summary;
}

/** Serials with a queued or running job, for the busy stripe on tiles. */
export function BusySerials(jobs: Job[]): Set<string> {
  const Busy = new Set<string>();
  for (const Job of jobs) {
    if (Job.Serial && (Job.Status === 'running' || Job.Status === 'queued')) Busy.add(Job.Serial);
  }
  return Busy;
}

export function JobIcon(job: Pick<Job, 'Kind' | 'Status'>): string {
  if (job.Status === 'running') return 'bi-arrow-repeat spin';
  if (job.Status === 'queued') return 'bi-hourglass';
  if (job.Status === 'failed') return 'bi-x-circle';
  switch (job.Kind) {
    case 'install':
      return 'bi-box-arrow-in-down';
    case 'factory-reset':
      return 'bi-eraser';
    case 'remove-admin':
      return 'bi-shield-x';
    case 'reboot':
      return 'bi-arrow-repeat';
    case 'wireless':
      return 'bi-wifi';
    default:
      return 'bi-check-circle';
  }
}

function capitalize(s: string): string {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}
