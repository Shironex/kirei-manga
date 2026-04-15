import { registerKireiCoverProtocol } from './kirei-cover';
import { registerKireiPageProtocol } from './kirei-page';

export { toCoverUrl } from './kirei-cover';
export { toPageUrl } from './kirei-page';

/**
 * Register all KireiManga custom protocols. Must be called after app.ready.
 * The associated schemes must also be registered via
 * `protocol.registerSchemesAsPrivileged` before app.ready — see main/index.ts.
 */
export function registerProtocols(): void {
  registerKireiCoverProtocol();
  registerKireiPageProtocol();
}
