// Device list, connection and discovery handlers.
import { RPC } from '../rpc';
import { Manager as DeviceManager } from '../../Modules/DeviceManager';
import { Manager as Discovery } from '../../Modules/Discovery';
import {
  ConnectDevice,
  DisconnectDevice,
  EnableWireless,
  PairDevice,
  RebootDevices,
} from '../../Modules/Actions/connectivity';
import { Fail } from '../../Modules/Utils';
import type { RebootMode } from '../../shared/types';

const REBOOT_MODES: RebootMode[] = ['system', 'recovery', 'bootloader', 'sideload'];

/** A non-empty list of non-empty strings, de-duplicated; null otherwise. */
export function ValidateSerials(input: unknown): string[] | null {
  if (!Array.isArray(input)) return null;
  const Serials = [
    ...new Set(input.filter((s): s is string => typeof s === 'string' && s.trim() !== '')),
  ];
  return Serials.length ? Serials : null;
}

export function RegisterDeviceHandlers(): void {
  RPC.handle('Devices:GetAll', async () => DeviceManager.GetAll());
  RPC.handle('Devices:Refresh', async () => DeviceManager.Poll());

  RPC.handle('Devices:Connect', async (_event, address: unknown) =>
    typeof address === 'string' ? ConnectDevice(address) : Fail('Invalid address')
  );
  RPC.handle('Devices:Disconnect', async (_event, serial: unknown) =>
    typeof serial === 'string' ? DisconnectDevice(serial) : Fail('Invalid device')
  );
  RPC.handle('Devices:Pair', async (_event, address: unknown, code: unknown) =>
    typeof address === 'string' && typeof code === 'string'
      ? PairDevice(address, code)
      : Fail('Invalid pairing request')
  );
  RPC.handle('Devices:EnableWireless', async (_event, serial: unknown) =>
    typeof serial === 'string' ? EnableWireless(serial) : Fail('Invalid device')
  );
  RPC.handle('Devices:Reboot', async (_event, serials: unknown, mode: unknown) => {
    const Serials = ValidateSerials(serials);
    if (!Serials) return Fail('No devices selected');
    const Mode = REBOOT_MODES.includes(mode as RebootMode) ? (mode as RebootMode) : 'system';
    return RebootDevices(Serials, Mode);
  });

  RPC.handle('Discovery:GetServices', async () => Discovery.GetAll());
}
