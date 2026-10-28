// Core / lifecycle handlers: config, settings, logs, external links, the adb
// server and the initial-state push after the renderer loads.
const { app, shell } = require('electron');
import { RPC } from '../rpc';
import { PushToRenderers } from '../renderer-bus';
import { Config } from '../../Modules/Config';
import { Manager as AppDataManager } from '../../Modules/AppData';
import { Manager as SettingsManager } from '../../Modules/SettingsManager';
import { Manager as Adb } from '../../Modules/Adb';
import { Manager as DeviceManager } from '../../Modules/DeviceManager';
import { Manager as Discovery } from '../../Modules/Discovery';
import { Manager as Jobs } from '../../Modules/Jobs';
import { Fail, Ok } from '../../Modules/Utils';
import { CreateLogger } from '../../Modules/Logger';

const Logger = CreateLogger('IPC');

export function RegisterSystemHandlers(): void {
  RPC.handle('Config:Get', async () => Config);

  // The renderer asks for its initial state once every subscription is wired.
  RPC.handle('Loaded', async () => {
    PushToRenderers('AdbStatusUpdated', Adb.GetStatus());
    PushToRenderers('DevicesUpdated', DeviceManager.GetAll());
    PushToRenderers('DiscoveryUpdated', Discovery.GetAll());
    PushToRenderers('JobsUpdated', Jobs.GetAll());
  });

  RPC.handle('Shutdown', async () => {
    app.quit();
  });

  RPC.handle('OpenLogsFolder', async () => {
    AppDataManager.OpenFolder(AppDataManager.GetLogsDirectory());
  });

  RPC.handle('OpenExternalUrl', async (_event, url: unknown) => {
    if (typeof url !== 'string' || !/^https?:\/\//i.test(url)) return;
    try {
      await shell.openExternal(url);
    } catch (Err) {
      Logger.warn('Failed to open URL:', Err);
    }
  });

  RPC.handle('Settings:Get', async () => SettingsManager.Get());

  RPC.handle('Settings:Set', async (_event, patch: unknown) => {
    if (!patch || typeof patch !== 'object') return Fail('Invalid settings payload');
    const Previous = SettingsManager.Get();
    const Next = SettingsManager.Update(patch);
    if (Previous.AdbPath !== Next.AdbPath) {
      Adb.Invalidate();
      void Adb.Probe().then(() => DeviceManager.Poll());
    }
    return Ok(Next);
  });

  RPC.handle('Adb:GetStatus', async () => Adb.GetStatus());

  RPC.handle('Adb:RestartServer', async () => {
    const Handle = Jobs.Create('adb-server', null, 'Restart ADB server');
    Handle.Start();
    const Result = await Adb.RestartServer();
    const Text = (Result.Stdout || Result.Stderr).trim();
    if (Text) Handle.Append(Text + '\n');
    if (Result.Code !== 0) {
      Handle.Fail(Text || 'adb start-server failed');
      return Fail(Text || 'adb start-server failed');
    }
    Handle.Succeed('Server restarted');
    await Adb.Probe();
    void DeviceManager.Poll();
    return Ok(null);
  });
}
