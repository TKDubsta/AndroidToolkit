// The device grid: tiles grouped by transport, plus discovered-but-unconnected
// network devices as pending tiles. Click toggles selection; double-click (or
// the info button) opens the device modal.
import { Devices, GetDevice, Jobs, Selection, Services, setDevices, setServices } from './state';
import { Safe } from './utils';
import {
  BatteryIcon,
  BusySerials,
  DeviceMeta,
  DeviceSubtitle,
  DeviceTitle,
  GroupDevices,
  ServiceTypeLabel,
  StateHint,
  StateLabel,
  StatusClassFor,
  TransportIcon,
  UnconnectedServices,
} from './lib/device-view';
import { Notify } from './lib/toasts';
import { OpenDeviceInfo } from './device-info';
import { UpdateSelectionStatus } from './selection';

function tileHtml(serial: string): string {
  const Device = GetDevice(serial);
  if (!Device) return '';
  const Busy = BusySerials(Jobs).has(serial);
  const Classes = [
    'device-tile',
    StatusClassFor(Device.State),
    Selection.has(serial) ? 'SELECTED' : '',
    Busy ? 'is-busy' : '',
  ]
    .filter(Boolean)
    .join(' ');
  const Battery =
    Device.BatteryLevel === null
      ? ''
      : `<span class="tile-battery ${Device.BatteryLevel < 20 ? 'is-low' : ''}"><i class="bi ${BatteryIcon(Device.BatteryLevel)}"></i>${Device.BatteryLevel}%</span>`;
  return `
    <div class="${Classes}" data-serial="${Safe(serial)}" role="button" tabindex="0" title="${Safe(StateHint(Device.State))}">
      <i class="bi ${TransportIcon(Device.Transport)} tile-transport" aria-hidden="true"></i>
      <div class="tile-name">${Safe(DeviceTitle(Device))}</div>
      <div class="tile-sub device-serial">${Safe(DeviceSubtitle(Device))}</div>
      <div class="tile-meta">${Safe(DeviceMeta(Device))}</div>
      <div class="tile-status">
        <span class="tile-state">${Safe(StateLabel(Device.State))}</span>
        ${Battery}
      </div>
      <div class="tile-actions">
        <button type="button" class="tile-action-btn" data-action="info" title="Device info"><i class="bi bi-info-lg"></i></button>
      </div>
    </div>`;
}

function discoveredTileHtml(address: string): string {
  const Service = Services.find((s) => s.Address === address);
  if (!Service) return '';
  return `
    <div class="device-tile PENDING discovered" data-address="${Safe(address)}" role="button" tabindex="0" title="Discovered, not connected">
      <i class="bi bi-wifi tile-transport" aria-hidden="true"></i>
      <div class="tile-name">${Safe(Service.Name)}</div>
      <div class="tile-sub device-address">${Safe(Service.Address)}</div>
      <div class="tile-meta">${Safe(ServiceTypeLabel(Service.Type))} · via ${Service.Source === 'adb' ? 'adb' : 'mDNS'}</div>
      <div class="tile-status"><span class="tile-state">Discovered</span></div>
      <div class="tile-actions">
        <button type="button" class="tile-action-btn" data-action="connect" title="Connect"><i class="bi bi-plug"></i></button>
      </div>
    </div>`;
}

export function RenderDevices(): void {
  const Root = document.getElementById('APPLICATION_CONTENT');
  if (!Root) return;
  const Groups = GroupDevices(Devices);
  const Pending = UnconnectedServices(Services, Devices);
  const Parts: string[] = [];

  if (!Groups.length && !Pending.length) {
    Parts.push(`
      <div class="device-group">
        <div class="device-group-tiles">
          <div class="device-placeholder">
            No devices attached
            <div class="placeholder-hint">Plug a device in over USB, or connect to one over the network from the menu.</div>
          </div>
        </div>
      </div>`);
  }

  for (const Group of Groups) {
    Parts.push(`
      <div class="device-group" data-group="${Group.Key}">
        <div class="device-group-title"><i class="bi ${TransportIcon(Group.Key)}"></i> ${Safe(Group.Label)} <span class="group-count">${Group.Devices.length}</span></div>
        <div class="device-group-tiles">${Group.Devices.map((d) => tileHtml(d.Serial)).join('')}</div>
      </div>`);
  }

  if (Pending.length) {
    Parts.push(`
      <div class="device-group" data-group="discovered">
        <div class="device-group-title"><i class="bi bi-broadcast"></i> Discovered <span class="group-count">${Pending.length}</span></div>
        <div class="device-group-tiles">${Pending.map((s) => discoveredTileHtml(s.Address)).join('')}</div>
      </div>`);
  }

  Root.innerHTML = Parts.join('');
  UpdateSelectionStatus();
}

export function InitDevices(): void {
  const Root = document.getElementById('APPLICATION_CONTENT');
  if (!Root) return;

  Root.addEventListener('click', (e) => {
    const Target = e.target as HTMLElement;
    const ActionBtn = Target.closest<HTMLElement>('[data-action]');
    const Tile = Target.closest<HTMLElement>('.device-tile');
    if (!Tile) return;

    if (ActionBtn) {
      e.stopPropagation();
      const Action = ActionBtn.dataset.action;
      if (Action === 'info' && Tile.dataset.serial) OpenDeviceInfo(Tile.dataset.serial);
      if (Action === 'connect' && Tile.dataset.address)
        void connectDiscovered(Tile.dataset.address);
      return;
    }

    if (Tile.dataset.address) {
      void connectDiscovered(Tile.dataset.address);
      return;
    }
    const Serial = Tile.dataset.serial;
    if (!Serial) return;
    if (Selection.has(Serial)) Selection.delete(Serial);
    else Selection.add(Serial);
    Tile.classList.toggle('SELECTED', Selection.has(Serial));
    UpdateSelectionStatus();
  });

  Root.addEventListener('dblclick', (e) => {
    const Tile = (e.target as HTMLElement).closest<HTMLElement>('.device-tile');
    if (Tile?.dataset.serial) OpenDeviceInfo(Tile.dataset.serial);
  });

  Root.addEventListener('keydown', (e) => {
    const Tile = (e.target as HTMLElement).closest<HTMLElement>('.device-tile');
    if (!Tile) return;
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      Tile.click();
    }
  });

  window.API.OnDevicesUpdated((devices) => {
    setDevices(devices);
    RenderDevices();
  });
  window.API.OnDiscoveryUpdated((services) => {
    setServices(services);
    RenderDevices();
  });
}

async function connectDiscovered(address: string): Promise<void> {
  Notify(`Connecting to ${address}`, 'info', 2500);
  const [Err, Message] = await window.API.ConnectDevice(address);
  if (Err) Notify(Err, 'error');
  else Notify(Message, 'success');
}

export function SelectAll(): void {
  for (const Device of Devices) if (Device.State === 'device') Selection.add(Device.Serial);
  RenderDevices();
}

export function ClearSelection(): void {
  Selection.clear();
  RenderDevices();
}
