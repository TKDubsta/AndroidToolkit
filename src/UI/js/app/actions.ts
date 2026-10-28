// Bulk actions from the bottom bar: install APK, remove device admin, factory
// reset, reboot.
import { Devices, GetDevice, Settings } from './state';
import { FormatBytes, Safe } from './utils';
import { DeviceTitle } from './lib/device-view';
import { closeModal, openModal } from './lib/modal';
import { ConfirmationDialog, CriticalConfirmationDialog, Notify } from './lib/toasts';
import { ActionableSerials } from './selection';
import { AdminRowHtml } from './device-info';
import type { ApkFile, DeviceAdmin, InstallOptions } from '../../../shared/types';

function names(serials: string[]): string[] {
  return serials.map((s) => {
    const Device = GetDevice(s);
    return Device ? `${DeviceTitle(Device)} (${s})` : s;
  });
}

function targetChips(serials: string[]): string {
  return names(serials)
    .map((n) => `<span class="target-chip">${Safe(n)}</span>`)
    .join('');
}

// --- Install APK --------------------------------------------------------------

let ChosenApk: ApkFile | null = null;
let InstallTargets: string[] = [];

function readInstallOptions(): InstallOptions {
  const checked = (id: string) =>
    (document.getElementById(id) as HTMLInputElement | null)?.checked ?? false;
  return {
    Reinstall: checked('INSTALL_OPT_REINSTALL'),
    GrantPermissions: checked('INSTALL_OPT_GRANT'),
    AllowDowngrade: checked('INSTALL_OPT_DOWNGRADE'),
    AllowTestPackages: checked('INSTALL_OPT_TEST'),
  };
}

function writeInstallOptions(options: InstallOptions): void {
  const set = (id: string, value: boolean) => {
    const El = document.getElementById(id) as HTMLInputElement | null;
    if (El) El.checked = value;
  };
  set('INSTALL_OPT_REINSTALL', options.Reinstall);
  set('INSTALL_OPT_GRANT', options.GrantPermissions);
  set('INSTALL_OPT_DOWNGRADE', options.AllowDowngrade);
  set('INSTALL_OPT_TEST', options.AllowTestPackages);
}

function renderInstallModal(): void {
  const NameEl = document.getElementById('INSTALL_FILE_NAME');
  const SizeEl = document.getElementById('INSTALL_FILE_SIZE');
  const Targets = document.getElementById('INSTALL_TARGETS');
  const Submit = document.getElementById('INSTALL_SUBMIT') as HTMLButtonElement | null;
  if (NameEl) NameEl.textContent = ChosenApk ? ChosenApk.Name : 'No file chosen';
  if (SizeEl)
    SizeEl.textContent = ChosenApk ? `${FormatBytes(ChosenApk.SizeBytes)} · ${ChosenApk.Path}` : '';
  if (Targets)
    Targets.innerHTML =
      targetChips(InstallTargets) || '<span class="form-text">No online devices selected.</span>';
  if (Submit) {
    Submit.disabled = !ChosenApk || InstallTargets.length === 0;
    Submit.textContent =
      InstallTargets.length > 1 ? `Install on ${InstallTargets.length} devices` : 'Install';
  }
}

export function OpenInstallModal(serials = ActionableSerials()): void {
  InstallTargets = serials;
  if (Settings) writeInstallOptions(Settings.InstallDefaults);
  renderInstallModal();
  openModal('INSTALL_MODAL');
}

async function chooseApk(): Promise<void> {
  const File = await window.API.ChooseApk();
  if (File) ChosenApk = File;
  renderInstallModal();
}

async function submitInstall(): Promise<void> {
  if (!ChosenApk || !InstallTargets.length) return;
  const [Err] = await window.API.InstallApk(InstallTargets, ChosenApk.Path, readInstallOptions());
  if (Err) {
    Notify(Err, 'error');
    return;
  }
  closeModal('INSTALL_MODAL');
  Notify(
    `Installing ${ChosenApk.Name} on ${InstallTargets.length} device${InstallTargets.length === 1 ? '' : 's'}`,
    'success'
  );
}

// --- Remove device admin ------------------------------------------------------

let AdminTargets: string[] = [];

async function renderRemoveAdminModal(): Promise<void> {
  const List = document.getElementById('REMOVE_ADMIN_LIST');
  const Hint = document.getElementById('REMOVE_ADMIN_HINT');
  const Targets = document.getElementById('REMOVE_ADMIN_TARGETS');
  if (Targets) Targets.innerHTML = targetChips(AdminTargets);
  if (!List || !Hint) return;

  if (AdminTargets.length === 1) {
    const Serial = AdminTargets[0] as string;
    Hint.textContent =
      'Admins currently active on the device. Removal uses dpm remove-active-admin, which only succeeds for debuggable or test-only admin apps.';
    List.innerHTML = '<div class="form-text">Loading…</div>';
    const [Err, Admins] = await window.API.ListDeviceAdmins(Serial);
    if (Err || !Admins) {
      List.innerHTML = `<div class="form-text">${Safe(Err || 'Could not read device admins')}</div>`;
      return;
    }
    List.innerHTML = Admins.length
      ? Admins.map((a: DeviceAdmin) => AdminRowHtml(a, Serial)).join('')
      : '<div class="form-text">No device admins are active.</div>';
    return;
  }

  Hint.textContent = `Every active admin, device owner and profile owner will be removed from each of the ${AdminTargets.length} selected devices. Open a single device to pick one admin.`;
  List.innerHTML = '';
}

export function OpenRemoveAdminModal(serials = ActionableSerials()): void {
  AdminTargets = serials;
  void renderRemoveAdminModal();
  openModal('REMOVE_ADMIN_MODAL');
}

async function removeAllAdmins(): Promise<void> {
  if (!AdminTargets.length) return;
  const Ok = await ConfirmationDialog(
    `Remove every device admin from ${AdminTargets.length} device${AdminTargets.length === 1 ? '' : 's'}?`,
    { ConfirmLabel: 'Remove All Admins' }
  );
  if (!Ok) return;
  const [Err] = await window.API.RemoveDeviceAdmins(AdminTargets, null);
  if (Err) Notify(Err, 'error');
  else {
    closeModal('REMOVE_ADMIN_MODAL');
    Notify('Admin removal started; see Activity for results', 'success');
  }
}

// --- Factory reset -------------------------------------------------------------

export async function RunFactoryReset(serials = ActionableSerials()): Promise<void> {
  if (!serials.length) return;
  const Ok = await CriticalConfirmationDialog({
    title: 'Factory Reset',
    message: `This erases all data on ${serials.length} device${serials.length === 1 ? '' : 's'}. The devices will wipe and reboot; this cannot be undone.`,
    items: names(serials),
    confirmLabel: serials.length === 1 ? 'Erase Device' : `Erase ${serials.length} Devices`,
  });
  if (!Ok) return;
  const Strategy = Settings?.FactoryResetStrategy ?? 'auto';
  const [Err] = await window.API.FactoryReset(serials, Strategy);
  if (Err) Notify(Err, 'error');
  else Notify('Factory reset started; see Activity for results', 'warning', 8000);
}

// --- Reboot --------------------------------------------------------------------

async function rebootSelected(): Promise<void> {
  const Serials = ActionableSerials();
  if (!Serials.length) return;
  const Ok = await ConfirmationDialog(
    `Reboot ${Serials.length} device${Serials.length === 1 ? '' : 's'}?`,
    {
      ConfirmLabel: 'Reboot',
    }
  );
  if (!Ok) return;
  const [Err] = await window.API.RebootDevices(Serials, 'system');
  if (Err) Notify(Err, 'error');
  else Notify('Reboot requested', 'success');
}

export function InitActions(): void {
  document.getElementById('INSTALL_APK_BTN')?.addEventListener('click', () => OpenInstallModal());
  document.getElementById('INSTALL_CHOOSE_BTN')?.addEventListener('click', () => void chooseApk());
  document.getElementById('INSTALL_SUBMIT')?.addEventListener('click', () => void submitInstall());

  document
    .getElementById('REMOVE_ADMIN_BTN')
    ?.addEventListener('click', () => OpenRemoveAdminModal());
  document
    .getElementById('REMOVE_ADMIN_ALL_BTN')
    ?.addEventListener('click', () => void removeAllAdmins());
  document.getElementById('REMOVE_ADMIN_LIST')?.addEventListener('click', async (e) => {
    const Button = (e.target as HTMLElement).closest<HTMLElement>('[data-remove-admin]');
    if (!Button?.dataset.removeAdmin || !Button.dataset.serial) return;
    const Ok = await ConfirmationDialog(`Remove device admin ${Button.dataset.removeAdmin}?`, {
      ConfirmLabel: 'Remove Admin',
    });
    if (!Ok) return;
    const [Err] = await window.API.RemoveDeviceAdmins(
      [Button.dataset.serial],
      Button.dataset.removeAdmin
    );
    if (Err) Notify(Err, 'error');
    else Notify('Removal started; see Activity for the result', 'info');
    setTimeout(() => void renderRemoveAdminModal(), 2500);
  });

  document
    .getElementById('FACTORY_RESET_BTN')
    ?.addEventListener('click', () => void RunFactoryReset());
  document.getElementById('REBOOT_BTN')?.addEventListener('click', () => void rebootSelected());

  // A device vanishing mid-dialog drops it from the target lists.
  window.API.OnDevicesUpdated(() => {
    const Known = new Set(Devices.map((d) => d.Serial));
    InstallTargets = InstallTargets.filter((s) => Known.has(s));
    AdminTargets = AdminTargets.filter((s) => Known.has(s));
    if ($('#INSTALL_MODAL').hasClass('show')) renderInstallModal();
  });
}
