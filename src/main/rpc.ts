// RPC wrapper around Electron's ipcMain. Every registration is mirrored into
// the handler registry so tests (and any future non-Electron surface) can
// dispatch to the same function.
const { ipcMain } = require('electron/main');
import { RegisterHandler } from './handler-registry';
import type { InvokeChannel } from '../Modules/IPCRegistry/channels';
import type { IpcHandler } from './handler-registry';

const RPC = {
  handle(channel: InvokeChannel, fn: IpcHandler) {
    RegisterHandler(channel, fn);
    return ipcMain.handle(channel, (event: unknown, ...args: unknown[]) => fn(event, ...args));
  },
};

export { RPC };
