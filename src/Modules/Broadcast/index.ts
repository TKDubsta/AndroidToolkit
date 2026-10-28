// Process-wide event bus between managers and the main entry (which forwards
// the renderer-facing channels to the window).
import { EventEmitter } from 'events';

class BroadcastEmitter extends EventEmitter {}

export const Manager = new BroadcastEmitter();
Manager.setMaxListeners(50);
