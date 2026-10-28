// Device info modal: details, per-device actions, and the device admin list.
import { GetDevice } from './state';
import { Safe } from './utils';
import { DeviceSubtitle, DeviceTitle, StateLabel, TransportLabel } from './lib/device-view';
import { closeModal, openModal } from './lib/modal';
import { ConfirmationDialog, Notify } from './lib/toasts';
import { RunFactoryReset } from './actions';
import type { DeviceAdmin } from '../../../shared/types';

let OpenSerial: string | null = null;

function row(label: string, value: unknown): string {
  if (value === null || value === undefined || value === '') return '';
  return `<dt>${Safe(label)}</dt><dd>${Safe(value)}</dd>`;
}

export function AdminRowHtml(admin: DeviceAdmin, serial: string): string {
  return `
    <div class="admin-row">
      <div class="min-w-0">
        <div class="admin-component">${Safe(admin.Component)}</div>
        <div class="admin-role ${admin.Role}">${Safe(admin.Role.replace('-', ' '))}${admin.UserId !== null ? ` · user ${admin.UserId}` : ''}</div>
      </div>
      <button type="button" class="btn btn-sm btn-warning" data-remove-admin="${Safe(admin.Component)}" data-serial="${Safe(serial)}">Remove</button>
    </div>`;
}

async function renderAdmins(serial: string): Promise<void> {
  const Host = document.getElementById('DEVICE_INFO_ADMINS');
  if (!Host) return;
  Host.innerHTML = '<div class="form-text">Loading…</div>';
  const [Err, Admins] = await window.API.ListDeviceAdmins(serial);
  if (OpenSerial !== serial) return;
  if (Err || !Admins) {
    Host.innerHTML = `<div class="form-text">${Safe(Err || 'Could not read device admins')}</div>`;
    return;
  }
  if (!Admins.length) {
    Host.innerHTML = '<div class="form-text">No device admins are active.</div>';
    return;
  }
  Host.innerHTML = Admins.map((a) => AdminRowHtml(a, serial)).join('');
}

export function RenderDeviceInfo(): void {
  if (!OpenSerial) return;
  const Device = GetDevice(OpenSerial);
  const Title = document.getElementById('DEVICE_INFO_TITLE');
  const Grid = document.getElementById('DEVICE_INFO_GRID');
  const Actions = document.getElementById('DEVICE_INFO_ACTIONS');
  if (!Title || !Grid || !Actions) return;
  if (!Device) {
    Title.textContent = 'Device gone';
    Grid.innerHTML = '';
    Actions.innerHTML = '';
    return;
  }
  Title.textContent = DeviceTitle(Device);
  Grid.innerHTML = [
    row('State', StateLabel(Device.State)),
    row('Transport', TransportLabel(Device.Transport)),
    row('Serial', DeviceSubtitle(Device)),
    row('Hardware serial', Device.Transport === 'network' ? null : Device.HardwareSerial),
    row('Manufacturer', Device.Manufacturer),
    row('Model', Device.Model),
    row('Product', Device.Product),
    row('Device', Device.Device),
    row(
      'Android',
      Device.AndroidVersion ? `${Device.AndroidVersion} (API ${Device.SdkVersion ?? '?'})` : null
    ),
    row('Battery', Device.BatteryLevel === null ? null : `${Device.BatteryLevel}%`),
    row('Transport ID', Device.TransportId),
  ].join('');

  const Online = Device.State === 'device';
  Actions.innerHTML = `
    ${Device.Transport === 'usb' && Online ? '<button type="button" class="btn btn-info" data-info-action="wireless"><i class="bi bi-wifi"></i> Enable Wireless ADB</button>' : ''}
    ${Device.Transport === 'network' ? '<button type="button" class="btn btn-light" data-info-action="disconnect"><i class="bi bi-plug"></i> Disconnect</button>' : ''}
    ${Online ? '<button type="button" class="btn btn-light" data-info-action="reboot"><i class="bi bi-arrow-repeat"></i> Reboot</button>' : ''}
    ${Online ? '<button type="button" class="btn btn-light" data-info-action="reboot-recovery"><i class="bi bi-wrench"></i> Reboot to Recovery</button>' : ''}
    ${Online ? '<button type="button" class="btn btn-danger" data-info-action="factory-reset"><i class="bi bi-eraser"></i> Factory Reset</button>' : ''}
  `;
}

export function OpenDeviceInfo(serial: string): void {
  OpenSerial = serial;
  RenderDeviceInfo();
  openModal('DEVICE_INFO_MODAL');
  if (GetDevice(serial)?.State === 'device') void renderAdmins(serial);
  else {
    const Host = document.getElementById('DEVICE_INFO_ADMINS');
    if (Host)
      Host.innerHTML =
        '<div class="form-text">Device admins are only readable while the device is online.</div>';
  }
}

export function InitDeviceInfo(): void {
  $('#DEVICE_INFO_MODAL').on('hidden.bs.modal', () => {
    OpenSerial = null;
  });

  document.getElementById('DEVICE_INFO_ACTIONS')?.addEventListener('click', async (e) => {
    const Button = (e.target as HTMLElement).closest<HTMLElement>('[data-info-action]');
    if (!Button || !OpenSerial) return;
    const Serial = OpenSerial;
    const Device = GetDevice(Serial);
    const Name = Device ? DeviceTitle(Device) : Serial;
    switch (Button.dataset.infoAction) {
      case 'wireless': {
        Notify(`Switching ${Name} to wireless ADB`, 'info', 3000);
        const [Err, Address] = await window.API.EnableWireless(Serial);
        if (Err) Notify(Err, 'error', 8000);
        else Notify(`Connected to ${Address} over Wi-Fi`, 'success');
        break;
      }
      case 'disconnect': {
        const [Err] = await window.API.DisconnectDevice(Serial);
        if (Err) Notify(Err, 'error');
        else {
          Notify(`Disconnected ${Name}`, 'success');
          closeModal('DEVICE_INFO_MODAL');
        }
        break;
      }
      case 'reboot':
      case 'reboot-recovery': {
        const Mode = Button.dataset.infoAction === 'reboot' ? 'system' : 'recovery';
        const Ok = await ConfirmationDialog(
          `Reboot ${Name}${Mode === 'recovery' ? ' to recovery' : ''}?`,
          {
            ConfirmLabel: 'Reboot',
          }
        );
        if (!Ok) return;
        const [Err] = await window.API.RebootDevices([Serial], Mode);
        if (Err) Notify(Err, 'error');
        else Notify(`Reboot requested for ${Name}`, 'success');
        break;
      }
      case 'factory-reset':
        closeModal('DEVICE_INFO_MODAL');
        void RunFactoryReset([Serial]);
        break;
    }
  });

  document.getElementById('DEVICE_INFO_ADMINS')?.addEventListener('click', async (e) => {
    const Button = (e.target as HTMLElement).closest<HTMLElement>('[data-remove-admin]');
    if (!Button) return;
    const Component = Button.dataset.removeAdmin;
    const Serial = Button.dataset.serial;
    if (!Component || !Serial) return;
    const Ok = await ConfirmationDialog(`Remove device admin ${Component}?`, {
      ConfirmLabel: 'Remove Admin',
    });
    if (!Ok) return;
    const [Err] = await window.API.RemoveDeviceAdmins([Serial], Component);
    if (Err) Notify(Err, 'error');
    else Notify('Removal started; see Activity for the result', 'info');
    setTimeout(() => {
      if (OpenSerial === Serial) void renderAdmins(Serial);
    }, 2500);
  });

  window.API.OnDevicesUpdated(() => RenderDeviceInfo());
}
