// Per-user application data directory (logs and settings).
//
// Resolved from the environment rather than Electron's `app.getPath` so the
// module loads outside an Electron main process (the test suite points HOME /
// APPDATA at a sandbox and loads it directly).
import path from 'path';
import fs from 'fs';
import os from 'os';
import { spawn } from 'child_process';

const HomeDirectory = process.env.HOME || os.homedir();
const BasePath =
  process.platform === 'win32'
    ? process.env.APPDATA || path.join(HomeDirectory, 'AppData', 'Roaming')
    : process.platform === 'darwin'
      ? path.join(HomeDirectory, 'Library', 'Application Support')
      : process.env.XDG_DATA_HOME || path.join(HomeDirectory, '.local', 'share');
const appDataPath = path.join(BasePath, 'AndroidToolkit');

export const Manager = {
  Initialized: false,

  Initialize(): void {
    if (Manager.Initialized) return;
    for (const folder of [appDataPath, path.join(appDataPath, 'Logs')]) {
      if (!fs.existsSync(folder)) fs.mkdirSync(folder, { recursive: true });
    }
    Manager.Initialized = true;
  },

  GetAppDataDirectory(): string {
    return appDataPath;
  },

  GetLogsDirectory(): string {
    return path.join(appDataPath, 'Logs');
  },

  GetSettingsFilePath(): string {
    return path.join(appDataPath, 'settings.json');
  },

  OpenFolder(FolderPath: string): boolean {
    if (!fs.existsSync(FolderPath)) return false;
    try {
      let command = 'xdg-open';
      let args = [FolderPath];
      if (process.platform === 'darwin') {
        command = 'open';
      } else if (process.platform === 'win32') {
        command = 'explorer';
        args = [FolderPath];
      }
      const child = spawn(command, args, { detached: true, stdio: 'ignore' });
      child.on('error', () => {});
      child.unref();
      return true;
    } catch {
      return false;
    }
  },
};
