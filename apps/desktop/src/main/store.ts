import Store from 'electron-store';

/**
 * Single shared electron-store instance for the main process.
 * All modules should import from here instead of creating their own Store().
 */
export const store = new Store();
