import { BrowserWindow } from 'electron';
import {
  registerWindowHandlers,
  cleanupWindowHandlers,
  registerAppHandlers,
  cleanupAppHandlers,
  registerUpdaterHandlers,
  cleanupUpdaterHandlers,
} from './';

export function registerIpcHandlers(mainWindow: BrowserWindow): void {
  registerWindowHandlers(mainWindow);
  registerAppHandlers();
  registerUpdaterHandlers();
}

export function cleanupIpcHandlers(): void {
  cleanupWindowHandlers();
  cleanupAppHandlers();
  cleanupUpdaterHandlers();
}
