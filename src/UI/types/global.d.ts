// Ambient global augmentation for the desktop renderer: the preload bridge.
import type { AndroidToolkitAPI } from '../../shared/types';

declare global {
  interface Window {
    API: AndroidToolkitAPI;
    PLATFORM: string;
  }
}

export {};
