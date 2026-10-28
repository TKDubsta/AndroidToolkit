// Types shared by the main process and the renderer. This file is included by
// both tsconfig.json (main) and tsconfig.renderer.json (renderer), so it must
// stay free of runtime imports: types only.

/** The state column of `adb devices -l`. */
export type DeviceState =
  | 'device'
  | 'offline'
  | 'unauthorized'
  | 'authorizing'
  | 'connecting'
  | 'recovery'
  | 'rescue'
  | 'sideload'
  | 'bootloader'
  | 'no permissions'
  | 'unknown';

/** How a device reaches the local adb server. */
export type Transport = 'usb' | 'network' | 'emulator';

export interface AdbDevice {
  /** The serial adb addresses the device by (`-s`). For network devices this is host:port. */
  Serial: string;
  State: DeviceState;
  Transport: Transport;
  /** host:port for network devices, null otherwise. */
  Address: string | null;
  /** Columns from `adb devices -l`. */
  Product: string | null;
  Model: string | null;
  Device: string | null;
  TransportId: string | null;
  /** Enrichment from `getprop` / `dumpsys battery`; null until fetched. */
  Manufacturer: string | null;
  AndroidVersion: string | null;
  SdkVersion: number | null;
  HardwareSerial: string | null;
  BatteryLevel: number | null;
  Enriched: boolean;
  FirstSeen: number;
  LastSeen: number;
}

export type DiscoveredServiceType = 'connect' | 'pairing' | 'legacy';

export interface DiscoveredService {
  /** mDNS instance name, e.g. adb-R58M12345AB-AbCdEf. */
  Name: string;
  Type: DiscoveredServiceType;
  Host: string;
  Port: number;
  /** host:port, the string handed to `adb connect` / `adb pair`. */
  Address: string;
  Source: 'mdns' | 'adb';
  FirstSeen: number;
  LastSeen: number;
}

export type JobKind =
  | 'install'
  | 'factory-reset'
  | 'remove-admin'
  | 'reboot'
  | 'wireless'
  | 'connect'
  | 'pair'
  | 'disconnect'
  | 'adb-server';

export type JobStatus = 'queued' | 'running' | 'success' | 'failed';

export interface Job {
  ID: string;
  Kind: JobKind;
  /** The device the job acts on, or null for server-wide work. */
  Serial: string | null;
  Label: string;
  Status: JobStatus;
  /** Captured stdout/stderr and progress lines, newest last. */
  Output: string;
  Error: string | null;
  CreatedAt: number;
  StartedAt: number | null;
  FinishedAt: number | null;
}

export interface AdbStatus {
  Available: boolean;
  Path: string | null;
  Version: string | null;
  Source: 'settings' | 'environment' | 'known-location' | 'path' | null;
  Error: string | null;
}

export type FactoryResetStrategy = 'auto' | 'broadcast' | 'recovery';

export type RebootMode = 'system' | 'recovery' | 'bootloader' | 'sideload';

export interface InstallOptions {
  Reinstall: boolean;
  GrantPermissions: boolean;
  AllowDowngrade: boolean;
  AllowTestPackages: boolean;
}

export interface AppSettings {
  /** Explicit adb executable; empty means auto-detect. */
  AdbPath: string;
  PollIntervalMs: number;
  EnrichDevices: boolean;
  MdnsDiscoveryEnabled: boolean;
  AutoConnectDiscovered: boolean;
  WirelessPort: number;
  InstallConcurrency: number;
  InstallDefaults: InstallOptions;
  FactoryResetStrategy: FactoryResetStrategy;
}

export type DeviceAdminRole = 'device-owner' | 'profile-owner' | 'active-admin';

export interface DeviceAdmin {
  /** package/class as adb prints it. */
  Component: string;
  Package: string;
  Role: DeviceAdminRole;
  UserId: number | null;
}

export interface ApkFile {
  Path: string;
  Name: string;
  SizeBytes: number;
}

export interface AppConfig {
  Application: {
    Name: string;
    Version: string;
    Platform: string;
  };
}

/** The `[Err, Data]` tuple returned by every manager method (see src/types/result.ts). */
export type ResultTuple<T> = [null, T] | [string, null];

/** The bridge the preload script exposes on `window.API`. */
export interface AndroidToolkitAPI {
  GetConfig(): Promise<AppConfig>;
  Loaded(): Promise<void>;
  Shutdown(): Promise<void>;
  OpenLogsFolder(): Promise<void>;
  OpenExternalUrl(url: string): Promise<void>;

  GetSettings(): Promise<AppSettings>;
  SetSettings(patch: Partial<AppSettings>): Promise<ResultTuple<AppSettings>>;

  GetAdbStatus(): Promise<AdbStatus>;
  RestartAdbServer(): Promise<ResultTuple<null>>;

  GetDevices(): Promise<AdbDevice[]>;
  RefreshDevices(): Promise<AdbDevice[]>;
  ConnectDevice(address: string): Promise<ResultTuple<string>>;
  DisconnectDevice(serial: string): Promise<ResultTuple<string>>;
  PairDevice(address: string, code: string): Promise<ResultTuple<string>>;
  EnableWireless(serial: string): Promise<ResultTuple<string>>;
  RebootDevices(serials: string[], mode: RebootMode): Promise<ResultTuple<string[]>>;

  GetDiscoveredServices(): Promise<DiscoveredService[]>;

  ListDeviceAdmins(serial: string): Promise<ResultTuple<DeviceAdmin[]>>;
  RemoveDeviceAdmins(serials: string[], component: string | null): Promise<ResultTuple<string[]>>;
  FactoryReset(serials: string[], strategy: FactoryResetStrategy): Promise<ResultTuple<string[]>>;
  ChooseApk(): Promise<ApkFile | null>;
  InstallApk(
    serials: string[],
    apkPath: string,
    options: InstallOptions
  ): Promise<ResultTuple<string[]>>;

  GetJobs(): Promise<Job[]>;
  ClearFinishedJobs(): Promise<void>;

  OnDevicesUpdated(callback: (devices: AdbDevice[]) => void): () => void;
  OnDiscoveryUpdated(callback: (services: DiscoveredService[]) => void): () => void;
  OnJobsUpdated(callback: (jobs: Job[]) => void): () => void;
  OnAdbStatusUpdated(callback: (status: AdbStatus) => void): () => void;
  OnMainWindowFullscreenChanged(callback: (fullscreen: boolean) => void): () => void;
  OnAppMenuAction(callback: (action: string) => void): () => void;
}
