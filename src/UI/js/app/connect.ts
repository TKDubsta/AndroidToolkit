// Connect-to-address and pairing modals, with the discovered service list.
import { Devices, Services } from './state';
import { Safe } from './utils';
import { ServiceTypeLabel, UnconnectedServices } from './lib/device-view';
import { closeModal, openModal } from './lib/modal';
import { Notify } from './lib/toasts';

function renderDiscoveredList(): void {
  const Host = document.getElementById('DISCOVERED_LIST');
  if (!Host) return;
  const Pairing = Services.filter((s) => s.Type === 'pairing');
  const Open = UnconnectedServices(Services, Devices);
  if (!Open.length && !Pairing.length) {
    Host.innerHTML =
      '<div class="form-text">Nothing discovered yet. Devices with Wireless debugging on, or on TCP/IP mode, show up here.</div>';
    return;
  }
  Host.innerHTML = [
    ...Open.map(
      (s) => `
      <div class="service-row">
        <div class="min-w-0">
          <div class="service-name">${Safe(s.Name)}</div>
          <div class="service-meta">${Safe(s.Address)} · ${Safe(ServiceTypeLabel(s.Type))}</div>
        </div>
        <button type="button" class="btn btn-sm btn-success" data-connect="${Safe(s.Address)}">Connect</button>
      </div>`
    ),
    ...Pairing.map(
      (s) => `
      <div class="service-row">
        <div class="min-w-0">
          <div class="service-name">${Safe(s.Name)}</div>
          <div class="service-meta">${Safe(s.Address)} · pairing dialog open on device</div>
        </div>
        <button type="button" class="btn btn-sm btn-info" data-pair="${Safe(s.Address)}">Pair…</button>
      </div>`
    ),
  ].join('');
}

export function OpenConnectModal(): void {
  renderDiscoveredList();
  openModal('CONNECT_MODAL');
  setTimeout(
    () => (document.getElementById('CONNECT_ADDRESS') as HTMLInputElement | null)?.focus(),
    200
  );
}

export function OpenPairModal(address = ''): void {
  const AddressEl = document.getElementById('PAIR_ADDRESS') as HTMLInputElement | null;
  const CodeEl = document.getElementById('PAIR_CODE') as HTMLInputElement | null;
  if (AddressEl && address) AddressEl.value = address;
  if (CodeEl) CodeEl.value = '';
  openModal('PAIR_MODAL');
  setTimeout(() => (address ? CodeEl : AddressEl)?.focus(), 200);
}

async function submitConnect(): Promise<void> {
  const Input = document.getElementById('CONNECT_ADDRESS') as HTMLInputElement | null;
  const Address = (Input?.value || '').trim();
  if (!Address) {
    Input?.classList.add('is-invalid');
    return;
  }
  Input?.classList.remove('is-invalid');
  const [Err, Message] = await window.API.ConnectDevice(Address);
  if (Err) {
    Notify(Err, 'error', 8000);
    return;
  }
  Notify(Message, 'success');
  closeModal('CONNECT_MODAL');
}

async function submitPair(): Promise<void> {
  const AddressEl = document.getElementById('PAIR_ADDRESS') as HTMLInputElement | null;
  const CodeEl = document.getElementById('PAIR_CODE') as HTMLInputElement | null;
  const [Err, Message] = await window.API.PairDevice(AddressEl?.value || '', CodeEl?.value || '');
  if (Err) {
    Notify(Err, 'error', 8000);
    return;
  }
  Notify(Message, 'success');
  closeModal('PAIR_MODAL');
  // After pairing, the connect endpoint is a different port; the discovery
  // list in the connect modal shows it.
  OpenConnectModal();
}

export function InitConnect(): void {
  document.getElementById('CONNECT_SUBMIT')?.addEventListener('click', () => void submitConnect());
  document.getElementById('CONNECT_ADDRESS')?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') void submitConnect();
  });
  document.getElementById('PAIR_SUBMIT')?.addEventListener('click', () => void submitPair());
  document.getElementById('PAIR_CODE')?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') void submitPair();
  });

  document.getElementById('DISCOVERED_LIST')?.addEventListener('click', async (e) => {
    const Target = (e.target as HTMLElement).closest<HTMLElement>('[data-connect],[data-pair]');
    if (!Target) return;
    if (Target.dataset.pair) {
      closeModal('CONNECT_MODAL');
      OpenPairModal(Target.dataset.pair);
      return;
    }
    if (Target.dataset.connect) {
      const [Err, Message] = await window.API.ConnectDevice(Target.dataset.connect);
      if (Err) Notify(Err, 'error', 8000);
      else {
        Notify(Message, 'success');
        closeModal('CONNECT_MODAL');
      }
    }
  });

  window.API.OnDiscoveryUpdated(() => {
    if ($('#CONNECT_MODAL').hasClass('show')) renderDiscoveredList();
  });
  window.API.OnDevicesUpdated(() => {
    if ($('#CONNECT_MODAL').hasClass('show')) renderDiscoveredList();
  });
}
