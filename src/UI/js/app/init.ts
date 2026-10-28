// Renderer bootstrap: menu wiring, keyboard shortcuts, macOS menu actions, and
// the final Loaded() handshake. Loaded() must stay last: the main process
// pushes initial state only once, so every subscription has to exist first.
import { Config, Selection, setConfig, setSettings, AdbState } from './state';
import { IsMac } from './utils';
import { openModal } from './lib/modal';
import { Notify } from './lib/toasts';
import { ClearSelection, RenderDevices, SelectAll } from './devices';
import { OpenInstallModal, OpenRemoveAdminModal, RunFactoryReset } from './actions';
import { OpenConnectModal, OpenPairModal } from './connect';
import { OpenSettingsModal, RenderAdbStatus } from './settings';
import { ToggleActivityPanel } from './jobs';

const GITHUB_URL = 'https://github.com/TKDubsta/AndroidToolkit';

async function refresh(): Promise<void> {
  await window.API.RefreshDevices();
}

async function restartAdb(): Promise<void> {
  Notify('Restarting the ADB server', 'info', 3000);
  const [Err] = await window.API.RestartAdbServer();
  if (Err) Notify(Err, 'error', 8000);
  else Notify('ADB server restarted', 'success');
}

function openAbout(): void {
  const Version = document.getElementById('ABOUT_VERSION');
  const Adb = document.getElementById('ABOUT_ADB');
  if (Version && Config) Version.textContent = `v${Config.Application.Version}`;
  if (Adb)
    Adb.textContent = AdbState?.Available
      ? `adb ${AdbState.Version ?? ''} · ${AdbState.Path ?? ''}`
      : 'adb not found';
  openModal('ABOUT_MODAL');
}

function handleMenuAction(action: string): void {
  switch (action) {
    case 'REFRESH_DEVICES':
      return void refresh();
    case 'OPEN_CONNECT':
      return OpenConnectModal();
    case 'OPEN_PAIR':
      return OpenPairModal();
    case 'OPEN_INSTALL':
      return OpenInstallModal();
    case 'OPEN_REMOVE_ADMIN':
      return OpenRemoveAdminModal();
    case 'OPEN_FACTORY_RESET':
      return void RunFactoryReset();
    case 'RESTART_ADB':
      return void restartAdb();
    case 'OPEN_LOGS':
      return void window.API.OpenLogsFolder();
    case 'OPEN_SETTINGS':
      return OpenSettingsModal();
    case 'OPEN_ABOUT':
      return openAbout();
  }
}

function isTypingTarget(target: EventTarget | null): boolean {
  const El = target as HTMLElement | null;
  if (!El) return false;
  const Tag = El.tagName;
  return Tag === 'INPUT' || Tag === 'TEXTAREA' || Tag === 'SELECT' || El.isContentEditable;
}

function wireKeyboard(): void {
  document.addEventListener('keydown', (e) => {
    const Mod = IsMac() ? e.metaKey : e.ctrlKey;
    if (e.key === 'Escape' && !isTypingTarget(e.target)) {
      if (Selection.size) ClearSelection();
      return;
    }
    if (!Mod || e.altKey) return;
    if (isTypingTarget(e.target) && e.key.toLowerCase() !== 'r') return;
    switch (e.key.toLowerCase()) {
      case 'a':
        if (isTypingTarget(e.target)) return;
        e.preventDefault();
        return SelectAll();
      case 'r':
        e.preventDefault();
        return void refresh();
      case 'k':
        e.preventDefault();
        return OpenConnectModal();
      case 'i':
        e.preventDefault();
        return OpenInstallModal();
      case ',':
        e.preventDefault();
        return OpenSettingsModal();
      case 'j':
        e.preventDefault();
        return ToggleActivityPanel();
    }
  });
}

export function WireGlobalUI(): void {
  document.body.classList.add(`platform-${window.PLATFORM || 'unknown'}`);

  document.getElementById('SELECT_ALL_BTN')?.addEventListener('click', () => SelectAll());
  document.getElementById('CLEAR_SELECTION_BTN')?.addEventListener('click', () => ClearSelection());
  document.getElementById('REFRESH_BTN')?.addEventListener('click', () => void refresh());

  document.getElementById('MENU_CONNECT')?.addEventListener('click', () => OpenConnectModal());
  document.getElementById('MENU_PAIR')?.addEventListener('click', () => OpenPairModal());
  document.getElementById('MENU_RESTART_ADB')?.addEventListener('click', () => void restartAdb());
  document
    .getElementById('MENU_OPEN_LOGS')
    ?.addEventListener('click', () => void window.API.OpenLogsFolder());
  document.getElementById('MENU_SETTINGS')?.addEventListener('click', () => OpenSettingsModal());
  document.getElementById('MENU_ABOUT')?.addEventListener('click', () => openAbout());
  document.getElementById('MENU_QUIT')?.addEventListener('click', () => void window.API.Shutdown());
  document
    .getElementById('ABOUT_GITHUB')
    ?.addEventListener('click', () => void window.API.OpenExternalUrl(GITHUB_URL));

  wireKeyboard();

  window.API.OnAppMenuAction(handleMenuAction);
  window.API.OnMainWindowFullscreenChanged((fullscreen) => {
    document.body.classList.toggle('macos-native-fullscreen', IsMac() && fullscreen);
  });
}

export async function Init(): Promise<void> {
  setConfig(await window.API.GetConfig());
  setSettings(await window.API.GetSettings());
  RenderAdbStatus();
  RenderDevices();
  await window.API.Loaded();
}
