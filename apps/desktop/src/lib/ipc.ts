import { invoke, type InvokeArgs } from '@tauri-apps/api/core';

/**
 * Typed IPC contract between the React renderer and the Rust core.
 *
 * Every `#[tauri::command]` gets one entry in `CommandMap`: the argument object
 * Tauri expects (camelCase keys, Tauri renames them to the Rust snake_case
 * parameters) and the serialized result type, mirrored from the Rust struct
 * (which serializes with `#[serde(rename_all = "camelCase")]`). Components never
 * call `invoke()` directly. They call a named wrapper built on `call()`, so a
 * renamed command or a changed payload is a type error in one place.
 *
 * Adding a command:
 * 1. Write it in `src-tauri/src/commands.rs` (async, returns `T` or
 *    `Result<T, String>`) and register it in `generate_handler!` in `lib.rs`.
 * 2. Mirror its result type here and add `name: { args; result }` to `CommandMap`.
 * 3. Export a wrapper (`export const getAppInfo = () => call('app_info')`).
 *
 * Failures reject with an `IpcError` that names the command, including the
 * case where the renderer runs in a plain browser with no Rust core behind it.
 */

/** Mirrors `kirei_core::AppInfo`. */
export interface AppInfo {
  name: string;
  version: string;
  os: string;
}

export interface CommandMap {
  app_info: { args: undefined; result: AppInfo };
}

export type CommandName = keyof CommandMap;
type ArgsOf<K extends CommandName> = CommandMap[K]['args'] extends undefined
  ? []
  : [args: CommandMap[K]['args']];

export class IpcError extends Error {
  constructor(
    readonly command: string,
    message: string
  ) {
    super(message);
    this.name = 'IpcError';
  }
}

/** True when the renderer runs inside the Tauri webview, false in a plain browser. */
export function isTauri(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}

export async function call<K extends CommandName>(
  command: K,
  ...args: ArgsOf<K>
): Promise<CommandMap[K]['result']> {
  if (!isTauri()) {
    throw new IpcError(command, 'Running outside Tauri: no backend to call.');
  }
  try {
    return await invoke<CommandMap[K]['result']>(command, args[0] as InvokeArgs | undefined);
  } catch (error) {
    throw new IpcError(command, error instanceof Error ? error.message : String(error));
  }
}

export const getAppInfo = () => call('app_info');

export function describeAppInfo(info: AppInfo): string {
  return `${info.name} ${info.version} on ${info.os}`;
}
