import { getAppInfo, isTauri, type AppInfo } from '@/lib/ipc';

/**
 * Route loader of /settings: the About section shows the build the Rust core
 * reports. Kept apart from the page so the router can load the page lazily.
 */
export async function loadAbout(): Promise<{ info: AppInfo | null }> {
  return { info: isTauri() ? await getAppInfo() : null };
}
