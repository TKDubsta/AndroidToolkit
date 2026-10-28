// Bottom-bar selection status and action-button enablement.
import { SelectedDevices, Selection } from './state';

export function UpdateSelectionStatus(): void {
  const Count = Selection.size;
  const Online = SelectedDevices().filter((d) => d.State === 'device').length;
  const Status = document.getElementById('SELECTION_STATUS');
  if (Status) {
    Status.textContent =
      Count === 0
        ? '0 devices selected'
        : `${Count} device${Count === 1 ? '' : 's'} selected${Online < Count ? ` (${Online} online)` : ''}`;
  }
  const Disabled = Online === 0;
  for (const Id of ['INSTALL_APK_BTN', 'REMOVE_ADMIN_BTN', 'FACTORY_RESET_BTN', 'REBOOT_BTN']) {
    const Button = document.getElementById(Id) as HTMLButtonElement | null;
    if (Button) Button.disabled = Disabled;
  }
}

/** Serials of selected devices that are actually online; actions target these. */
export function ActionableSerials(): string[] {
  return SelectedDevices()
    .filter((d) => d.State === 'device')
    .map((d) => d.Serial);
}
