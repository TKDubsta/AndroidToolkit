// SANDBOXED preload script for the main window. Its `require` can only resolve
// Electron built-ins, NOT local files, so the channel allowlists are inlined
// here; the registry (src/Modules/IPCRegistry/channels.ts) remains the single
// source of truth and drift is a COMPILE error: the type-only imports below are
// erased from the emitted JS, `satisfies` rejects an entry not in the registry,
// and the `_Missing*Channels` aliases reject a registry channel missing here.
const { contextBridge, ipcRenderer } = require('electron');
import type { InvokeChannel, SubscribeChannel } from './Modules/IPCRegistry/channels';
import type {
  AndroidToolkitAPI,
  AdbDevice,
  AdbStatus,
  DiscoveredService,
  Job,
} from './shared/types';

type AssertAllChannelsListed<T extends never> = T;

const INVOKE_CHANNEL_LIST = [
  'Config:Get',
  'Loaded',
  'Shutdown',
  'OpenLogsFolder',
  'OpenExternalUrl',
  'Settings:Get',
  'Settings:Set',
  'Adb:GetStatus',
  'Adb:RestartServer',
  'Devices:GetAll',
  'Devices:Refresh',
  'Devices:Connect',
  'Devices:Disconnect',
  'Devices:Pair',
  'Devices:EnableWireless',
  'Devices:Reboot',
  'Discovery:GetServices',
  'DeviceAdmin:List',
  'DeviceAdmin:Remove',
  'FactoryReset:Run',
  'Apk:Choose',
  'Apk:Install',
  'Jobs:GetAll',
  'Jobs:ClearFinished',
] as const satisfies readonly InvokeChannel[];

const SUBSCRIBE_CHANNEL_LIST = [
  'DevicesUpdated',
  'DiscoveryUpdated',
  'JobsUpdated',
  'AdbStatusUpdated',
  'MainWindowFullscreenChanged',
  'AppMenuAction',
] as const satisfies readonly SubscribeChannel[];

type _MissingInvokeChannels = AssertAllChannelsListed<
  Exclude<InvokeChannel, (typeof INVOKE_CHANNEL_LIST)[number]>
>;
type _MissingSubscribeChannels = AssertAllChannelsListed<
  Exclude<SubscribeChannel, (typeof SUBSCRIBE_CHANNEL_LIST)[number]>
>;

const INVOKE_CHANNELS = new Set<string>(INVOKE_CHANNEL_LIST);
const SUBSCRIBE_CHANNELS = new Set<string>(SUBSCRIBE_CHANNEL_LIST);

function invoke(channel: InvokeChannel, ...args: unknown[]): Promise<unknown> {
  if (!INVOKE_CHANNELS.has(channel)) {
    return Promise.reject(new Error(`IPC channel not allowed: ${channel}`));
  }
  return ipcRenderer.invoke(channel, ...args);
}

function subscribe<T>(channel: SubscribeChannel, callback: (payload: T) => void): () => void {
  if (!SUBSCRIBE_CHANNELS.has(channel)) throw new Error(`IPC channel not allowed: ${channel}`);
  const Listener = (_event: unknown, payload: T) => callback(payload);
  ipcRenderer.on(channel, Listener);
  return () => ipcRenderer.removeListener(channel, Listener);
}

const API: AndroidToolkitAPI = {
  GetConfig: () => invoke('Config:Get') as never,
  Loaded: () => invoke('Loaded') as never,
  Shutdown: () => invoke('Shutdown') as never,
  OpenLogsFolder: () => invoke('OpenLogsFolder') as never,
  OpenExternalUrl: (url) => invoke('OpenExternalUrl', url) as never,

  GetSettings: () => invoke('Settings:Get') as never,
  SetSettings: (patch) => invoke('Settings:Set', patch) as never,

  GetAdbStatus: () => invoke('Adb:GetStatus') as never,
  RestartAdbServer: () => invoke('Adb:RestartServer') as never,

  GetDevices: () => invoke('Devices:GetAll') as never,
  RefreshDevices: () => invoke('Devices:Refresh') as never,
  ConnectDevice: (address) => invoke('Devices:Connect', address) as never,
  DisconnectDevice: (serial) => invoke('Devices:Disconnect', serial) as never,
  PairDevice: (address, code) => invoke('Devices:Pair', address, code) as never,
  EnableWireless: (serial) => invoke('Devices:EnableWireless', serial) as never,
  RebootDevices: (serials, mode) => invoke('Devices:Reboot', serials, mode) as never,

  GetDiscoveredServices: () => invoke('Discovery:GetServices') as never,

  ListDeviceAdmins: (serial) => invoke('DeviceAdmin:List', serial) as never,
  RemoveDeviceAdmins: (serials, component) =>
    invoke('DeviceAdmin:Remove', serials, component) as never,
  FactoryReset: (serials, strategy) => invoke('FactoryReset:Run', serials, strategy) as never,
  ChooseApk: () => invoke('Apk:Choose') as never,
  InstallApk: (serials, apkPath, options) =>
    invoke('Apk:Install', serials, apkPath, options) as never,

  GetJobs: () => invoke('Jobs:GetAll') as never,
  ClearFinishedJobs: () => invoke('Jobs:ClearFinished') as never,

  OnDevicesUpdated: (cb) => subscribe<AdbDevice[]>('DevicesUpdated', cb),
  OnDiscoveryUpdated: (cb) => subscribe<DiscoveredService[]>('DiscoveryUpdated', cb),
  OnJobsUpdated: (cb) => subscribe<Job[]>('JobsUpdated', cb),
  OnAdbStatusUpdated: (cb) => subscribe<AdbStatus>('AdbStatusUpdated', cb),
  OnMainWindowFullscreenChanged: (cb) => subscribe<boolean>('MainWindowFullscreenChanged', cb),
  OnAppMenuAction: (cb) => subscribe<string>('AppMenuAction', cb),
};

contextBridge.exposeInMainWorld('API', API);
contextBridge.exposeInMainWorld('PLATFORM', process.platform);

export {};
