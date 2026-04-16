import { registerKireiCoverProtocol, setMangaDexClient as setCoverMangaDexClient } from './kirei-cover';
import type { MangaDexCoverFetcher } from './kirei-cover';
import {
  registerKireiPageProtocol,
  setMangaDexClient as setPageMangaDexClient,
  setLocalPageFetcher,
} from './kirei-page';
import type { MangaDexPageFetcher, LocalPageFetcher } from './kirei-page';

export { toCoverUrl, toMangaDexCoverUrl } from './kirei-cover';
export { toMangaDexPageUrl, toLocalPageUrl } from './kirei-page';

/**
 * Register all KireiManga custom protocols. Must be called after app.ready.
 * The associated schemes must also be registered via
 * `protocol.registerSchemesAsPrivileged` before app.ready — see main/index.ts.
 */
export function registerProtocols(): void {
  registerKireiCoverProtocol();
  registerKireiPageProtocol();
}

/**
 * Wire the shared MangaDexClient into both protocol handlers. The same
 * concrete instance satisfies both the cover and page fetcher surfaces.
 */
export function setMangaDexClient(client: MangaDexCoverFetcher & MangaDexPageFetcher): void {
  setCoverMangaDexClient(client);
  setPageMangaDexClient(client);
}

/**
 * Wire the Nest `LocalLibraryService` into the `kirei-page://local/`
 * branch. Local covers are served directly from disk so they don't need a
 * companion injector here.
 */
export function setLocalLibraryClient(client: LocalPageFetcher): void {
  setLocalPageFetcher(client);
}
