// Registers every IPC invoke handler, grouped by domain.
import { RegisterSystemHandlers } from './system';
import { RegisterDeviceHandlers } from './devices';
import { RegisterActionHandlers } from './actions';

export function RegisterAllHandlers(): void {
  RegisterSystemHandlers();
  RegisterDeviceHandlers();
  RegisterActionHandlers();
}
