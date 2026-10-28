// Renderer entry point. Modules are imported (declarations only), then
// initialised explicitly so every push subscription exists before Init() asks
// the main process for the initial state.
import { InitDevices } from './devices';
import { InitDeviceInfo } from './device-info';
import { InitActions } from './actions';
import { InitConnect } from './connect';
import { InitJobs } from './jobs';
import { InitSettings } from './settings';
import { Init, WireGlobalUI } from './init';

InitDevices();
InitDeviceInfo();
InitActions();
InitConnect();
InitJobs();
InitSettings();
WireGlobalUI();
void Init();
