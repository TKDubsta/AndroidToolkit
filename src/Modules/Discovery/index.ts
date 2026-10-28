// Network discovery of ADB-capable devices.
//
// Two sources feed one table keyed by host:port:
//   - adb's own mDNS listener (`adb mdns services`), polled on a timer, and
//   - a bonjour-service browser on the three ADB service types, which also
//     sees devices adb's listener misses when its mDNS is disabled.
//
// Service types:
//   _adb-tls-connect._tcp  Android 11+ wireless debugging; needs a prior pairing
//   _adb-tls-pairing._tcp  the pairing endpoint shown while the pairing dialog is open
//   _adb._tcp              legacy `adb tcpip` devices advertising themselves
//
// With AutoConnectDiscovered on, every connect/legacy service that is not
// already a known device gets one `adb connect` attempt per cool-down period.
import type { DiscoveredService } from '../../shared/types';
import { Manager as Adb } from '../Adb';
import { Commands } from '../Adb/commands';
import { ClassifyMdnsType, ParseMdnsServices } from '../Adb/parse';
import { Manager as Broadcast } from '../Broadcast';
import { Manager as DeviceManager } from '../DeviceManager';
import { CreateLogger } from '../Logger';
import { Manager as SettingsManager } from '../SettingsManager';

const Logger = CreateLogger('Discovery');

const ADB_POLL_MS = 5000;
const STALE_AFTER_MS = 60000;
const AUTO_CONNECT_COOLDOWN_MS = 60000;

const MDNS_TYPES = ['adb-tls-connect', 'adb-tls-pairing', 'adb'];

interface BonjourLike {
  find(
    opts: { type: string; protocol: 'tcp' | 'udp' },
    onup?: (service: BonjourServiceLike) => void
  ): BonjourBrowserLike;
  destroy(cb?: () => void): void;
}
interface BonjourBrowserLike {
  on(event: 'up' | 'down', listener: (service: BonjourServiceLike) => void): unknown;
  stop(): void;
}
interface BonjourServiceLike {
  name: string;
  type: string;
  protocol?: string;
  host: string;
  port: number;
  addresses?: string[];
  referer?: { address?: string };
}

/** Prefer an IPv4 address; fall back to the referer, then the hostname. */
export function PickServiceHost(
  service: Pick<BonjourServiceLike, 'host' | 'addresses' | 'referer'>
): string {
  const Addresses = service.addresses ?? [];
  const V4 = Addresses.find((a) => /^\d{1,3}(?:\.\d{1,3}){3}$/.test(a));
  if (V4) return V4;
  if (service.referer?.address) return service.referer.address;
  if (Addresses[0]) return Addresses[0];
  return service.host;
}

let Services = new Map<string, DiscoveredService>();
let LastAnnounced = '';
let Timer: ReturnType<typeof setTimeout> | null = null;
let Running = false;
let Bonjour: BonjourLike | null = null;
let Browsers: BonjourBrowserLike[] = [];
const ConnectAttempts = new Map<string, number>();

function keyOf(service: Pick<DiscoveredService, 'Address' | 'Type'>): string {
  return `${service.Type}|${service.Address}`;
}

function announceIfChanged(): void {
  const Snapshot = JSON.stringify(Manager.GetAll());
  if (Snapshot === LastAnnounced) return;
  LastAnnounced = Snapshot;
  Broadcast.emit('DiscoveryUpdated', Manager.GetAll());
}

function upsert(incoming: DiscoveredService): void {
  const Key = keyOf(incoming);
  const Existing = Services.get(Key);
  Services.set(Key, {
    ...incoming,
    FirstSeen: Existing?.FirstSeen ?? incoming.FirstSeen,
    // adb's listener outranks bonjour: it is the one that will actually connect.
    Source: Existing?.Source === 'adb' ? 'adb' : incoming.Source,
  });
}

function expireStale(now: number): void {
  for (const [Key, Service] of Services) {
    if (now - Service.LastSeen > STALE_AFTER_MS) Services.delete(Key);
  }
}

async function autoConnect(now: number): Promise<void> {
  if (!SettingsManager.Get().AutoConnectDiscovered) return;
  const Known = new Set(DeviceManager.GetAll().map((d) => d.Serial));
  for (const Service of Services.values()) {
    if (Service.Type === 'pairing') continue;
    if (Known.has(Service.Address)) continue;
    const Last = ConnectAttempts.get(Service.Address) ?? 0;
    if (now - Last < AUTO_CONNECT_COOLDOWN_MS) continue;
    ConnectAttempts.set(Service.Address, now);
    Logger.log(`Auto-connecting to discovered device ${Service.Name} at ${Service.Address}`);
    const Result = await Adb.Run(Commands.Connect(Service.Address), { TimeoutMs: 10000 });
    Logger.debug(`adb connect ${Service.Address}: ${(Result.Stdout || Result.Stderr).trim()}`);
    void DeviceManager.Poll();
  }
}

async function pollAdbMdns(): Promise<void> {
  const Result = await Adb.Run(Commands.MdnsServices(), { TimeoutMs: 8000 });
  if (Result.Code !== 0) return;
  const Now = Date.now();
  for (const Service of ParseMdnsServices(Result.Stdout, Now)) upsert(Service);
}

function startBonjour(): void {
  if (Bonjour) return;
  try {
    const Lib = require('bonjour-service') as { Bonjour: new () => BonjourLike };
    Bonjour = new Lib.Bonjour();
    for (const Type of MDNS_TYPES) {
      const Browser = Bonjour.find({ type: Type, protocol: 'tcp' });
      Browser.on('up', (service) => {
        const Kind = ClassifyMdnsType(`_${service.type}._${service.protocol || 'tcp'}`);
        if (!Kind) return;
        const Host = PickServiceHost(service);
        const Now = Date.now();
        upsert({
          Name: service.name,
          Type: Kind,
          Host,
          Port: service.port,
          Address: `${Host}:${service.port}`,
          Source: 'mdns',
          FirstSeen: Now,
          LastSeen: Now,
        });
        announceIfChanged();
        void autoConnect(Now);
      });
      Browser.on('down', (service) => {
        const Kind = ClassifyMdnsType(`_${service.type}._${service.protocol || 'tcp'}`);
        if (!Kind) return;
        Services.delete(
          keyOf({ Type: Kind, Address: `${PickServiceHost(service)}:${service.port}` })
        );
        announceIfChanged();
      });
      Browsers.push(Browser);
    }
    Logger.log('mDNS browser started');
  } catch (Err) {
    Logger.warn('mDNS browser unavailable:', Err);
    Bonjour = null;
  }
}

function stopBonjour(): void {
  for (const Browser of Browsers) {
    try {
      Browser.stop();
    } catch {}
  }
  Browsers = [];
  if (Bonjour) {
    try {
      Bonjour.destroy();
    } catch {}
    Bonjour = null;
  }
}

async function tick(): Promise<void> {
  try {
    const Settings = SettingsManager.Get();
    if (Settings.MdnsDiscoveryEnabled) startBonjour();
    else stopBonjour();
    await pollAdbMdns();
    const Now = Date.now();
    expireStale(Now);
    announceIfChanged();
    await autoConnect(Now);
  } catch (Err) {
    Logger.warn('Discovery tick failed:', Err);
  } finally {
    if (Running) Timer = setTimeout(() => void tick(), ADB_POLL_MS);
  }
}

export const Manager = {
  GetAll(): DiscoveredService[] {
    return [...Services.values()].sort((a, b) => a.Address.localeCompare(b.Address));
  },

  Start(): void {
    if (Running) return;
    Running = true;
    void tick();
  },

  Stop(): void {
    Running = false;
    if (Timer) clearTimeout(Timer);
    Timer = null;
    stopBonjour();
  },

  /** Tests: feed services without a network. */
  UpsertForTests(service: DiscoveredService): void {
    upsert(service);
    announceIfChanged();
  },

  ResetForTests(): void {
    Manager.Stop();
    Services = new Map();
    LastAnnounced = '';
    ConnectAttempts.clear();
  },
};
