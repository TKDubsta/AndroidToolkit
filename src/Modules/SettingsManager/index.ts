// JSON-backed application settings under the app-data directory.
//
// Unknown keys in the file are dropped and missing keys are filled from the
// defaults, so a settings file written by any version loads under any other.
import fs from 'fs';
import type { AppSettings, FactoryResetStrategy, InstallOptions } from '../../shared/types';
import { Manager as AppDataManager } from '../AppData';
import { Manager as Broadcast } from '../Broadcast';
import { CreateLogger } from '../Logger';

const Logger = CreateLogger('Settings');

export const DEFAULT_SETTINGS: AppSettings = Object.freeze({
  AdbPath: '',
  PollIntervalMs: 2000,
  EnrichDevices: true,
  MdnsDiscoveryEnabled: true,
  AutoConnectDiscovered: true,
  WirelessPort: 5555,
  InstallConcurrency: 3,
  InstallDefaults: Object.freeze({
    Reinstall: true,
    GrantPermissions: true,
    AllowDowngrade: false,
    AllowTestPackages: false,
  }),
  FactoryResetStrategy: 'auto',
}) as AppSettings;

const FACTORY_RESET_STRATEGIES: FactoryResetStrategy[] = ['auto', 'broadcast', 'recovery'];

function asBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

function asInteger(value: unknown, fallback: number, min: number, max: number): number {
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.round(n)));
}

function asString(value: unknown, fallback: string): string {
  return typeof value === 'string' ? value.trim() : fallback;
}

function normalizeInstallOptions(value: unknown, base: InstallOptions): InstallOptions {
  const v = (value && typeof value === 'object' ? value : {}) as Partial<InstallOptions>;
  return {
    Reinstall: asBoolean(v.Reinstall, base.Reinstall),
    GrantPermissions: asBoolean(v.GrantPermissions, base.GrantPermissions),
    AllowDowngrade: asBoolean(v.AllowDowngrade, base.AllowDowngrade),
    AllowTestPackages: asBoolean(v.AllowTestPackages, base.AllowTestPackages),
  };
}

/** Coerce an arbitrary object into a complete, valid AppSettings. */
export function NormalizeSettings(
  input: unknown,
  base: AppSettings = DEFAULT_SETTINGS
): AppSettings {
  const v = (input && typeof input === 'object' ? input : {}) as Partial<AppSettings>;
  const strategy = v.FactoryResetStrategy;
  return {
    AdbPath: asString(v.AdbPath, base.AdbPath),
    PollIntervalMs: asInteger(v.PollIntervalMs, base.PollIntervalMs, 500, 60000),
    EnrichDevices: asBoolean(v.EnrichDevices, base.EnrichDevices),
    MdnsDiscoveryEnabled: asBoolean(v.MdnsDiscoveryEnabled, base.MdnsDiscoveryEnabled),
    AutoConnectDiscovered: asBoolean(v.AutoConnectDiscovered, base.AutoConnectDiscovered),
    WirelessPort: asInteger(v.WirelessPort, base.WirelessPort, 1, 65535),
    InstallConcurrency: asInteger(v.InstallConcurrency, base.InstallConcurrency, 1, 16),
    InstallDefaults: normalizeInstallOptions(v.InstallDefaults, base.InstallDefaults),
    FactoryResetStrategy:
      typeof strategy === 'string' &&
      FACTORY_RESET_STRATEGIES.includes(strategy as FactoryResetStrategy)
        ? (strategy as FactoryResetStrategy)
        : base.FactoryResetStrategy,
  };
}

let Current: AppSettings | null = null;

function load(): AppSettings {
  if (Current) return Current;
  let parsed: unknown = null;
  try {
    const file = AppDataManager.GetSettingsFilePath();
    if (fs.existsSync(file)) parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (Err) {
    Logger.warn('Settings file unreadable; using defaults.', Err);
  }
  Current = NormalizeSettings(parsed);
  return Current;
}

function persist(settings: AppSettings): void {
  try {
    AppDataManager.Initialize();
    fs.writeFileSync(
      AppDataManager.GetSettingsFilePath(),
      JSON.stringify(settings, null, 2),
      'utf8'
    );
  } catch (Err) {
    Logger.error('Failed to write settings:', Err);
  }
}

export const Manager = {
  Get(): AppSettings {
    return load();
  },

  /** Merge a partial update, persist, and announce `SettingsChanged`. */
  Update(patch: unknown): AppSettings {
    const next = NormalizeSettings(patch, load());
    Current = next;
    persist(next);
    Broadcast.emit('SettingsChanged', next);
    return next;
  },

  /** Drop the in-memory copy so the next Get() re-reads the file (tests). */
  Reset(): void {
    Current = null;
  },
};
