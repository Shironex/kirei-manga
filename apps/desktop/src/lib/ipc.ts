import { invoke } from '@tauri-apps/api/core';

/** Mirrors `kirei_core::AppInfo` (serialized in camelCase). */
export interface AppInfo {
  name: string;
  version: string;
  os: string;
}

/** True when the renderer runs inside the Tauri webview, false in a plain browser. */
export function isTauri(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}

export function getAppInfo(): Promise<AppInfo> {
  return invoke<AppInfo>('app_info');
}

export function describeAppInfo(info: AppInfo): string {
  return `${info.name} ${info.version} on ${info.os}`;
}
