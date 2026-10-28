// Bulk action handlers: APK install, device admin removal, factory reset, jobs.
const { dialog } = require('electron');
import fs from 'fs';
import path from 'path';
import { RPC } from '../rpc';
import { getMainWindow, hasMainWindow } from '../app-window';
import { InstallApk } from '../../Modules/Actions/apk-deploy';
import { ListDeviceAdmins, RemoveDeviceAdmins } from '../../Modules/Actions/device-admin';
import { FactoryReset } from '../../Modules/Actions/factory-reset';
import { Manager as Jobs } from '../../Modules/Jobs';
import { Manager as SettingsManager } from '../../Modules/SettingsManager';
import { Fail } from '../../Modules/Utils';
import type { ApkFile, FactoryResetStrategy, InstallOptions } from '../../shared/types';
import { ValidateSerials } from './devices';

const STRATEGIES: FactoryResetStrategy[] = ['auto', 'broadcast', 'recovery'];

export function NormalizeInstallOptions(input: unknown, defaults: InstallOptions): InstallOptions {
  const v = (input && typeof input === 'object' ? input : {}) as Partial<InstallOptions>;
  const pick = (value: unknown, fallback: boolean) =>
    typeof value === 'boolean' ? value : fallback;
  return {
    Reinstall: pick(v.Reinstall, defaults.Reinstall),
    GrantPermissions: pick(v.GrantPermissions, defaults.GrantPermissions),
    AllowDowngrade: pick(v.AllowDowngrade, defaults.AllowDowngrade),
    AllowTestPackages: pick(v.AllowTestPackages, defaults.AllowTestPackages),
  };
}

export function RegisterActionHandlers(): void {
  RPC.handle('DeviceAdmin:List', async (_event, serial: unknown) =>
    typeof serial === 'string' ? ListDeviceAdmins(serial) : Fail('Invalid device')
  );

  RPC.handle('DeviceAdmin:Remove', async (_event, serials: unknown, component: unknown) => {
    const Serials = ValidateSerials(serials);
    if (!Serials) return Fail('No devices selected');
    const Component = typeof component === 'string' && component.trim() ? component.trim() : null;
    return RemoveDeviceAdmins(Serials, Component);
  });

  RPC.handle('FactoryReset:Run', async (_event, serials: unknown, strategy: unknown) => {
    const Serials = ValidateSerials(serials);
    if (!Serials) return Fail('No devices selected');
    const Strategy = STRATEGIES.includes(strategy as FactoryResetStrategy)
      ? (strategy as FactoryResetStrategy)
      : SettingsManager.Get().FactoryResetStrategy;
    return FactoryReset(Serials, Strategy);
  });

  RPC.handle('Apk:Choose', async (): Promise<ApkFile | null> => {
    const Options = {
      title: 'Choose an APK',
      properties: ['openFile'],
      filters: [{ name: 'Android packages', extensions: ['apk'] }],
    };
    const Window = getMainWindow();
    const Result =
      hasMainWindow() && Window
        ? await dialog.showOpenDialog(Window, Options)
        : await dialog.showOpenDialog(Options);
    const Chosen = Result.canceled ? null : Result.filePaths[0];
    if (!Chosen) return null;
    try {
      const Stat = fs.statSync(Chosen);
      return { Path: Chosen, Name: path.basename(Chosen), SizeBytes: Stat.size };
    } catch {
      return null;
    }
  });

  RPC.handle(
    'Apk:Install',
    async (_event, serials: unknown, apkPath: unknown, options: unknown) => {
      const Serials = ValidateSerials(serials);
      if (!Serials) return Fail('No devices selected');
      if (typeof apkPath !== 'string' || !apkPath) return Fail('No APK chosen');
      return InstallApk(
        Serials,
        apkPath,
        NormalizeInstallOptions(options, SettingsManager.Get().InstallDefaults)
      );
    }
  );

  RPC.handle('Jobs:GetAll', async () => Jobs.GetAll());
  RPC.handle('Jobs:ClearFinished', async () => {
    Jobs.ClearFinished();
  });
}
