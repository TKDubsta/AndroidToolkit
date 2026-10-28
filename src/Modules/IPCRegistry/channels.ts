// IPC channel registry: single source of truth for renderer-facing IPC.
//
// Every channel the renderer may `invoke()` (request/response) or subscribe to
// (main -> renderer push) is declared here ONCE. The sandboxed preload
// (src/bridge_main.ts) cannot import this at runtime, so it inlines the same
// lists and `satisfies` these types; test/ipc-channel-registry.test.js asserts
// that the RPC.handle registrations in src/main/registrars match INVOKE_CHANNELS.

const INVOKE_CHANNELS = [
  // Core / lifecycle
  'Config:Get',
  'Loaded',
  'Shutdown',
  'OpenLogsFolder',
  'OpenExternalUrl',
  'Settings:Get',
  'Settings:Set',

  // ADB server
  'Adb:GetStatus',
  'Adb:RestartServer',

  // Devices
  'Devices:GetAll',
  'Devices:Refresh',
  'Devices:Connect',
  'Devices:Disconnect',
  'Devices:Pair',
  'Devices:EnableWireless',
  'Devices:Reboot',

  // Discovery
  'Discovery:GetServices',

  // Actions
  'DeviceAdmin:List',
  'DeviceAdmin:Remove',
  'FactoryReset:Run',
  'Apk:Choose',
  'Apk:Install',

  // Jobs
  'Jobs:GetAll',
  'Jobs:ClearFinished',
] as const;

const SUBSCRIBE_CHANNELS = [
  'DevicesUpdated',
  'DiscoveryUpdated',
  'JobsUpdated',
  'AdbStatusUpdated',
  'MainWindowFullscreenChanged',
  'AppMenuAction',
] as const;

type InvokeChannel = (typeof INVOKE_CHANNELS)[number];
type SubscribeChannel = (typeof SUBSCRIBE_CHANNELS)[number];

export { INVOKE_CHANNELS, SUBSCRIBE_CHANNELS };
export type { InvokeChannel, SubscribeChannel };
