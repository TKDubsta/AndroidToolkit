// Settings modal and the ADB status chip / missing banner.
import { AdbState, Settings, setAdbState, setSettings } from './state';
import { openModal, closeModal } from './lib/modal';
import { Notify } from './lib/toasts';
import type { AppSettings } from '../../../shared/types';

function input(id: string): HTMLInputElement | null {
  return document.getElementById(id) as HTMLInputElement | null;
}

function fillForm(settings: AppSettings): void {
  const set = (id: string, value: string | number) => {
    const El = input(id);
    if (El) El.value = String(value);
  };
  const check = (id: string, value: boolean) => {
    const El = input(id);
    if (El) El.checked = value;
  };
  set('SETTING_ADB_PATH', settings.AdbPath);
  set('SETTING_POLL', settings.PollIntervalMs);
  check('SETTING_ENRICH', settings.EnrichDevices);
  check('SETTING_MDNS', settings.MdnsDiscoveryEnabled);
  check('SETTING_AUTOCONNECT', settings.AutoConnectDiscovered);
  set('SETTING_WIRELESS_PORT', settings.WirelessPort);
  set('SETTING_CONCURRENCY', settings.InstallConcurrency);
  set('SETTING_RESET_STRATEGY', settings.FactoryResetStrategy);
}

function readForm(): Partial<AppSettings> {
  return {
    AdbPath: input('SETTING_ADB_PATH')?.value ?? '',
    PollIntervalMs: Number(input('SETTING_POLL')?.value),
    EnrichDevices: input('SETTING_ENRICH')?.checked ?? true,
    MdnsDiscoveryEnabled: input('SETTING_MDNS')?.checked ?? true,
    AutoConnectDiscovered: input('SETTING_AUTOCONNECT')?.checked ?? true,
    WirelessPort: Number(input('SETTING_WIRELESS_PORT')?.value),
    InstallConcurrency: Number(input('SETTING_CONCURRENCY')?.value),
    FactoryResetStrategy:
      (input('SETTING_RESET_STRATEGY')?.value as AppSettings['FactoryResetStrategy']) ?? 'auto',
  };
}

export function OpenSettingsModal(): void {
  if (Settings) fillForm(Settings);
  const Hint = document.getElementById('SETTING_ADB_HINT');
  if (Hint && AdbState?.Path)
    Hint.textContent = `Currently using ${AdbState.Path} (${AdbState.Source}).`;
  openModal('SETTINGS_MODAL');
}

async function saveSettings(): Promise<void> {
  const [Err, Next] = await window.API.SetSettings(readForm());
  if (Err || !Next) {
    Notify(Err || 'Settings were not saved', 'error');
    return;
  }
  setSettings(Next);
  closeModal('SETTINGS_MODAL');
  Notify('Settings saved', 'success');
}

export function RenderAdbStatus(): void {
  const Chip = document.getElementById('ADB_STATUS_CHIP');
  const Text = document.getElementById('ADB_STATUS_TEXT');
  const Banner = document.getElementById('ADB_MISSING_BANNER');
  const Detail = document.getElementById('ADB_MISSING_DETAIL');
  if (!Chip || !Text || !Banner) return;
  const State = AdbState;
  Chip.classList.toggle('is-ok', Boolean(State?.Available));
  Chip.classList.toggle('is-error', Boolean(State && !State.Available));
  if (!State) {
    Text.textContent = 'Locating adb…';
    Banner.classList.add('d-none');
    return;
  }
  if (State.Available) {
    Text.textContent = `adb ${State.Version ?? ''}`.trim();
    Chip.title = State.Path ?? '';
    Banner.classList.add('d-none');
  } else {
    Text.textContent = 'adb not found';
    Chip.title = State.Error ?? '';
    Banner.classList.remove('d-none');
    if (Detail) Detail.textContent = State.Error ?? 'adb is unavailable.';
  }
}

export function InitSettings(): void {
  document.getElementById('SETTINGS_SAVE')?.addEventListener('click', () => void saveSettings());
  document.getElementById('ADB_STATUS_CHIP')?.addEventListener('click', () => OpenSettingsModal());
  document
    .getElementById('ADB_MISSING_SETTINGS_BTN')
    ?.addEventListener('click', () => OpenSettingsModal());

  window.API.OnAdbStatusUpdated((status) => {
    setAdbState(status);
    RenderAdbStatus();
  });
}
