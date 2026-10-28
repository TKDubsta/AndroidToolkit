// The device registry: polls `adb devices -l`, enriches newly seen devices with
// getprop / battery, and announces `DevicesUpdated` whenever the list changes.
//
// adb is authoritative: a serial missing from a poll is dropped. The merge is
// a pure function (MergeDevices) so the bookkeeping is unit-tested without a
// process.
import type { AdbDevice } from '../../shared/types';
import { Manager as Adb } from '../Adb';
import { Commands } from '../Adb/commands';
import {
  ParseBatteryLevel,
  ParseDevicesList,
  ParseGetProp,
  type ParsedDeviceLine,
} from '../Adb/parse';
import { Manager as Broadcast } from '../Broadcast';
import { CreateLogger } from '../Logger';
import { Manager as SettingsManager } from '../SettingsManager';

const Logger = CreateLogger('Devices');

export interface Enrichment {
  Manufacturer: string | null;
  AndroidVersion: string | null;
  SdkVersion: number | null;
  HardwareSerial: string | null;
  Model: string | null;
  BatteryLevel: number | null;
}

/** Merge a fresh `adb devices -l` parse into the previous registry. */
export function MergeDevices(
  previous: ReadonlyMap<string, AdbDevice>,
  parsed: ParsedDeviceLine[],
  now: number
): Map<string, AdbDevice> {
  const Next = new Map<string, AdbDevice>();
  for (const Line of parsed) {
    const Old = previous.get(Line.Serial);
    Next.set(Line.Serial, {
      Serial: Line.Serial,
      State: Line.State,
      Transport: Line.Transport,
      Address: Line.Address,
      Product: Line.Product ?? Old?.Product ?? null,
      Model: Old?.Enriched && Old.Model ? Old.Model : (Line.Model ?? Old?.Model ?? null),
      Device: Line.Device ?? Old?.Device ?? null,
      TransportId: Line.TransportId,
      Manufacturer: Old?.Manufacturer ?? null,
      AndroidVersion: Old?.AndroidVersion ?? null,
      SdkVersion: Old?.SdkVersion ?? null,
      HardwareSerial: Old?.HardwareSerial ?? null,
      BatteryLevel: Old?.BatteryLevel ?? null,
      // A device that drops to offline/unauthorized and comes back is re-read.
      Enriched: Line.State === 'device' ? Boolean(Old?.Enriched) : false,
      FirstSeen: Old?.FirstSeen ?? now,
      LastSeen: now,
    });
  }
  return Next;
}

/** Pull the fields the tiles show out of a getprop dump and a battery dump. */
export function EnrichmentFromProps(props: Record<string, string>, battery: string): Enrichment {
  const Sdk = Number(props['ro.build.version.sdk']);
  const Model = props['ro.product.model'] || props['ro.product.vendor.model'] || null;
  return {
    Manufacturer: props['ro.product.manufacturer'] || props['ro.product.brand'] || null,
    AndroidVersion: props['ro.build.version.release'] || null,
    SdkVersion: Number.isFinite(Sdk) && Sdk > 0 ? Sdk : null,
    HardwareSerial: props['ro.serialno'] || props['ro.boot.serialno'] || null,
    Model,
    BatteryLevel: ParseBatteryLevel(battery),
  };
}

function sortDevices(devices: Iterable<AdbDevice>): AdbDevice[] {
  const Order: Record<string, number> = { usb: 0, network: 1, emulator: 2 };
  return [...devices].sort(
    (a, b) =>
      (Order[a.Transport] ?? 9) - (Order[b.Transport] ?? 9) ||
      (a.Model || a.Serial).localeCompare(b.Model || b.Serial) ||
      a.Serial.localeCompare(b.Serial)
  );
}

let Registry = new Map<string, AdbDevice>();
let LastAnnounced = '';
let Timer: ReturnType<typeof setTimeout> | null = null;
let Polling = false;
let Stopped = true;
const Enriching = new Set<string>();

function announceIfChanged(): void {
  // LastSeen moves every poll; it is not a change worth a renderer push.
  const Snapshot = JSON.stringify(
    sortDevices(Registry.values()).map(({ LastSeen: _LastSeen, ...Rest }) => Rest)
  );
  if (Snapshot === LastAnnounced) return;
  LastAnnounced = Snapshot;
  Broadcast.emit('DevicesUpdated', Manager.GetAll());
}

async function enrich(serial: string): Promise<void> {
  if (Enriching.has(serial)) return;
  Enriching.add(serial);
  try {
    const [Props, Battery] = await Promise.all([
      Adb.Run(Commands.GetProp(serial), { TimeoutMs: 10000 }),
      Adb.Run(Commands.Battery(serial), { TimeoutMs: 10000 }),
    ]);
    const Device = Registry.get(serial);
    if (!Device) return;
    if (Props.Code !== 0) {
      Logger.debug(`getprop failed for ${serial}: ${Props.Stderr.trim() || Props.Code}`);
      return;
    }
    const Data = EnrichmentFromProps(
      ParseGetProp(Props.Stdout),
      Battery.Code === 0 ? Battery.Stdout : ''
    );
    Registry.set(serial, {
      ...Device,
      Manufacturer: Data.Manufacturer,
      AndroidVersion: Data.AndroidVersion,
      SdkVersion: Data.SdkVersion,
      HardwareSerial: Data.HardwareSerial,
      Model: Data.Model ?? Device.Model,
      BatteryLevel: Data.BatteryLevel,
      Enriched: true,
    });
    announceIfChanged();
  } catch (Err) {
    Logger.warn(`Failed to enrich ${serial}:`, Err);
  } finally {
    Enriching.delete(serial);
  }
}

function schedule(): void {
  if (Stopped) return;
  if (Timer) clearTimeout(Timer);
  Timer = setTimeout(() => {
    Timer = null;
    void Manager.Poll();
  }, SettingsManager.Get().PollIntervalMs);
}

export const Manager = {
  GetAll(): AdbDevice[] {
    return sortDevices(Registry.values());
  },

  Get(serial: string): AdbDevice | null {
    return Registry.get(serial) ?? null;
  },

  Start(): void {
    if (!Stopped) return;
    Stopped = false;
    void Manager.Poll();
  },

  Stop(): void {
    Stopped = true;
    if (Timer) clearTimeout(Timer);
    Timer = null;
  },

  /** One `adb devices -l` pass. Safe to call while the loop runs (refresh button). */
  async Poll(): Promise<AdbDevice[]> {
    if (Polling) return Manager.GetAll();
    Polling = true;
    try {
      // Without adb there is nothing to poll; re-probe instead so platform-tools
      // installed (or a path set) after launch is picked up without a restart.
      if (!Adb.GetStatus().Available) {
        await Adb.Probe();
        if (!Adb.GetStatus().Available) return Manager.GetAll();
      }
      const Result = await Adb.Run(Commands.Devices(), { TimeoutMs: 10000 });
      if (Result.Code === 0) {
        const Now = Date.now();
        Registry = MergeDevices(Registry, ParseDevicesList(Result.Stdout), Now);
        announceIfChanged();
        if (SettingsManager.Get().EnrichDevices) {
          for (const Device of Registry.values()) {
            if (Device.State === 'device' && !Device.Enriched) void enrich(Device.Serial);
          }
        }
      } else if (!Result.TimedOut) {
        Logger.debug(`adb devices failed: ${(Result.Stderr || Result.Stdout).trim()}`);
      }
    } catch (Err) {
      Logger.warn('Device poll failed:', Err);
    } finally {
      Polling = false;
      schedule();
    }
    return Manager.GetAll();
  },

  /** Drop a device immediately (after `adb disconnect`) rather than waiting for the next poll. */
  Forget(serial: string): void {
    if (Registry.delete(serial)) announceIfChanged();
  },

  /** Tests: reset the registry between cases. */
  ResetForTests(): void {
    Manager.Stop();
    Registry = new Map();
    LastAnnounced = '';
    Enriching.clear();
  },
};
