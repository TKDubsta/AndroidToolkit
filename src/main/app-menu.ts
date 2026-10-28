// Application menu (macOS only). On macOS the native menu bar dispatches
// renderer actions through `sendAppMenuAction`; every other platform runs
// menu-less (window-zoom.ts binds the zoom keys there).
const { Menu } = require('electron/main');

interface AppMenuDeps {
  sendAppMenuAction(actionID: string): void;
}

function buildMacAppMenuTemplate({ sendAppMenuAction }: AppMenuDeps) {
  const devicesSubmenu = [
    {
      label: 'Refresh Devices',
      accelerator: 'CmdOrCtrl+R',
      click: () => sendAppMenuAction('REFRESH_DEVICES'),
    },
    {
      label: 'Connect to Address…',
      accelerator: 'CmdOrCtrl+K',
      click: () => sendAppMenuAction('OPEN_CONNECT'),
    },
    {
      label: 'Pair Device…',
      click: () => sendAppMenuAction('OPEN_PAIR'),
    },
    { type: 'separator' },
    {
      label: 'Install APK…',
      accelerator: 'CmdOrCtrl+I',
      click: () => sendAppMenuAction('OPEN_INSTALL'),
    },
    {
      label: 'Remove Device Admin…',
      click: () => sendAppMenuAction('OPEN_REMOVE_ADMIN'),
    },
    {
      label: 'Factory Reset…',
      click: () => sendAppMenuAction('OPEN_FACTORY_RESET'),
    },
    { type: 'separator' },
    {
      label: 'Restart ADB Server',
      click: () => sendAppMenuAction('RESTART_ADB'),
    },
    {
      label: 'Open Logs Folder',
      click: () => sendAppMenuAction('OPEN_LOGS'),
    },
    { type: 'separator' },
    {
      label: 'Settings',
      accelerator: 'CmdOrCtrl+,',
      click: () => sendAppMenuAction('OPEN_SETTINGS'),
    },
    { label: 'About', click: () => sendAppMenuAction('OPEN_ABOUT') },
  ];

  return [
    { role: 'appMenu' },
    { label: 'Devices', submenu: devicesSubmenu },
    { role: 'editMenu' },
    { role: 'viewMenu' },
    { role: 'windowMenu' },
  ];
}

function configureApplicationMenu(deps: AppMenuDeps): void {
  if (process.platform !== 'darwin') {
    Menu.setApplicationMenu(null);
    return;
  }
  Menu.setApplicationMenu(Menu.buildFromTemplate(buildMacAppMenuTemplate(deps)));
}

export { configureApplicationMenu };
