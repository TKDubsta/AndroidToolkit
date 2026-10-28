// Electron main process entrypoint and composition root:
// - single-instance guard
// - preloader + main window, menu, security guards
// - wires the IPC registrars and forwards manager broadcasts to the window
// - starts the adb probe, the device poller and network discovery
import type { BrowserWindow as ElectronBrowserWindow } from 'electron';
const { app, BrowserWindow } = require('electron/main');
if (require('electron-squirrel-startup')) app.quit();

import { Manager as AppDataManager } from './Modules/AppData';
AppDataManager.Initialize();
import { CreateLogger, FlushLogs } from './Modules/Logger';
const Logger = CreateLogger('Main');

const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  Logger.error('Another instance of AndroidToolkit is already running. Exiting this instance.');
  app.quit();
  process.exit(0);
}

const path = require('path');

import { RegisterRendererSink, PushToRenderers } from './main/renderer-bus';
import { getMainWindow, setMainWindow, hasMainWindow } from './main/app-window';
import { StartDevReload } from './main/dev-reload';
import { configureApplicationMenu } from './main/app-menu';
import { applyWindowSecurityGuards } from './main/window-guards';
import { applyWindowZoomShortcuts } from './main/window-zoom';
import { RegisterAllHandlers } from './main/registrars';
import { Manager as Broadcast } from './Modules/Broadcast';
import { Manager as Adb } from './Modules/Adb';
import { Manager as DeviceManager } from './Modules/DeviceManager';
import { Manager as Discovery } from './Modules/Discovery';
import { Manager as SettingsManager } from './Modules/SettingsManager';
import { Wait } from './Modules/Utils';

const PRELOADER_MIN_DISPLAY_MS = 900;

// Last line of defence: a fault deep inside adb spawning or the mDNS socket
// must not take the whole app down. Logged loudly, never exited.
process.on('uncaughtException', (Err) => Logger.error('Uncaught exception (app kept alive):', Err));
process.on('unhandledRejection', (Reason) =>
  Logger.error('Unhandled rejection (app kept alive):', Reason)
);

// The desktop window is the only renderer sink.
RegisterRendererSink((channel: string, ...args: unknown[]) => {
  const Window = getMainWindow();
  if (Window && hasMainWindow()) Window.webContents.send(channel, ...args);
});

// Manager broadcasts that the renderer subscribes to, forwarded one-to-one.
for (const Channel of ['DevicesUpdated', 'DiscoveryUpdated', 'JobsUpdated', 'AdbStatusUpdated']) {
  Broadcast.on(Channel, (payload: unknown) => PushToRenderers(Channel, payload));
}

// A settings change restarts whatever reads them at boot.
Broadcast.on('SettingsChanged', () => {
  Discovery.Stop();
  Discovery.Start();
});

const BASE_WEB_PREFERENCES = Object.freeze({
  contextIsolation: true,
  sandbox: true,
  nodeIntegration: false,
  webSecurity: true,
});
const WINDOW_DRAGBAR_HEIGHT_PX = 32;
const MAC_TRAFFIC_LIGHT_DIAMETER_PX = 12;
const MAC_TRAFFIC_LIGHT_LEFT_PADDING_PX = 12;
const MAC_TRAFFIC_LIGHT_TOP_PADDING_PX = Math.max(
  0,
  Math.round((WINDOW_DRAGBAR_HEIGHT_PX - MAC_TRAFFIC_LIGHT_DIAMETER_PX) / 2)
);

const WINDOW_CHROME_OPTIONS =
  process.platform === 'darwin'
    ? {
        frame: true,
        titleBarStyle: 'hidden',
        trafficLightPosition: {
          x: MAC_TRAFFIC_LIGHT_LEFT_PADDING_PX,
          y: MAC_TRAFFIC_LIGHT_TOP_PADDING_PX,
        },
      }
    : {
        frame: true,
        titleBarStyle: 'hidden',
      };

function getWindowIconPath() {
  const iconName = process.platform === 'win32' ? 'icon.ico' : 'icon.png';
  return path.join(__dirname, 'images', iconName);
}

function sendMainWindowFullscreenChanged(isFullscreen: boolean) {
  if (hasMainWindow()) PushToRenderers('MainWindowFullscreenChanged', Boolean(isFullscreen));
}

function sendAppMenuAction(actionID: string) {
  if (hasMainWindow()) PushToRenderers('AppMenuAction', String(actionID || ''));
}

let PreloaderWindow: ElectronBrowserWindow | null = null;

app.whenReady().then(async () => {
  if (require('electron-squirrel-startup')) return app.quit();

  configureApplicationMenu({ sendAppMenuAction });

  // Lightweight splash that keeps the app responsive while the first probe runs.
  const Splash: ElectronBrowserWindow = new BrowserWindow({
    show: false,
    backgroundColor: '#161618',
    width: 400,
    height: 500,
    resizable: false,
    webPreferences: {
      ...BASE_WEB_PREFERENCES,
      preload: path.join(__dirname, 'bridge_preloader.js'),
      devTools: !app.isPackaged,
    },
    icon: getWindowIconPath(),
    ...WINDOW_CHROME_OPTIONS,
  });
  PreloaderWindow = Splash;
  Splash.once('ready-to-show', () => Splash.show());
  Splash.loadFile(path.join(__dirname, 'UI', 'preloader.html'));
  applyWindowSecurityGuards(Splash);

  const MainWindow: ElectronBrowserWindow = new BrowserWindow({
    show: false,
    backgroundColor: '#161618',
    width: 1360,
    height: 860,
    minWidth: 960,
    minHeight: 600,
    webPreferences: {
      ...BASE_WEB_PREFERENCES,
      preload: path.join(__dirname, 'bridge_main.js'),
      devTools: !app.isPackaged,
    },
    icon: getWindowIconPath(),
    ...WINDOW_CHROME_OPTIONS,
  });
  setMainWindow(MainWindow);
  StartDevReload();

  RegisterAllHandlers();

  MainWindow.loadFile(path.join(__dirname, 'UI', 'index.html')).then(async () => {
    Logger.log('MainWindow finished loading UI');
    sendMainWindowFullscreenChanged(MainWindow.isFullScreen());

    // Locate adb, then start the poller and discovery. Neither blocks the window.
    const Started = Date.now();
    await Adb.Probe();
    DeviceManager.Start();
    Discovery.Start();
    Logger.log(`Poll interval ${SettingsManager.Get().PollIntervalMs}ms`);

    await Wait(Math.max(0, PRELOADER_MIN_DISPLAY_MS - (Date.now() - Started)));
    if (PreloaderWindow && !PreloaderWindow.isDestroyed()) PreloaderWindow.close();
    PreloaderWindow = null;
    MainWindow.show();
  });
  applyWindowSecurityGuards(MainWindow);
  applyWindowZoomShortcuts(MainWindow);
  MainWindow.on('closed', () => setMainWindow(null));
  MainWindow.on('enter-full-screen', () => sendMainWindowFullscreenChanged(true));
  MainWindow.on('leave-full-screen', () => sendMainWindowFullscreenChanged(false));

  app.on('activate', () => {
    const Window = getMainWindow();
    if (Window && hasMainWindow()) Window.show();
  });
});

app.on('window-all-closed', () => {
  app.quit();
});

app.on('will-quit', () => {
  DeviceManager.Stop();
  Discovery.Stop();
  Logger.log('App is closing.');
  void FlushLogs();
});
