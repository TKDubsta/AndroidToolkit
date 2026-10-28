// Main-window ownership for the Electron main process. main.ts is the sole
// writer (it creates and tears down the BrowserWindow); everything else reads
// through the accessors and guards with hasMainWindow() before touching
// webContents.
import type { BrowserWindow } from 'electron';

let MainWindow: BrowserWindow | null = null;

function getMainWindow(): BrowserWindow | null {
  return MainWindow;
}

function setMainWindow(window: BrowserWindow | null): void {
  MainWindow = window;
}

/** True when a usable (non-destroyed) window exists. */
function hasMainWindow(): boolean {
  return !!MainWindow && !MainWindow.isDestroyed();
}

export { getMainWindow, setMainWindow, hasMainWindow };
