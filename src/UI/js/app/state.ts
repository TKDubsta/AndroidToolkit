// Renderer shared state: the server-pushed caches plus transient UI state.
import type {
  AdbDevice,
  AdbStatus,
  AppConfig,
  AppSettings,
  DiscoveredService,
  Job,
} from '../../../shared/types';

export let Config: AppConfig | null = null;
export let Settings: AppSettings | null = null;
export let AdbState: AdbStatus | null = null;
export let Devices: AdbDevice[] = [];
export let Services: DiscoveredService[] = [];
export let Jobs: Job[] = [];

/** Serials of the selected tiles. */
export const Selection = new Set<string>();

export function setConfig(next: AppConfig | null): void {
  Config = next;
}
export function setSettings(next: AppSettings | null): void {
  Settings = next;
}
export function setAdbState(next: AdbStatus | null): void {
  AdbState = next;
}
export function setDevices(next: AdbDevice[]): void {
  Devices = Array.isArray(next) ? next : [];
  // Drop selections for devices that have gone.
  const Known = new Set(Devices.map((d) => d.Serial));
  for (const Serial of [...Selection]) if (!Known.has(Serial)) Selection.delete(Serial);
}
export function setServices(next: DiscoveredService[]): void {
  Services = Array.isArray(next) ? next : [];
}
export function setJobs(next: Job[]): void {
  Jobs = Array.isArray(next) ? next : [];
}

export function GetDevice(serial: string): AdbDevice | null {
  return Devices.find((d) => d.Serial === serial) ?? null;
}

/** The selected devices, in display order. */
export function SelectedDevices(): AdbDevice[] {
  return Devices.filter((d) => Selection.has(d.Serial));
}
