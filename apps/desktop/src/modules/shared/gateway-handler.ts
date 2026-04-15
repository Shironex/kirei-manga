import type { Logger } from '@kireimanga/shared';
import { extractErrorMessage } from '@kireimanga/shared';

/**
 * Shared utility for gateway request handlers that follow the common pattern:
 *   1. Log the action
 *   2. Execute the handler logic
 *   3. Return a default result with error on failure
 *
 * Eliminates boilerplate per handler across gateways.
 *
 * TDefault is the type of the fallback result (returned on error with an error message).
 * TResult is the type the handler returns on success (may differ from TDefault).
 */
export async function handleGatewayRequest<TDefault, TResult = TDefault>(options: {
  logger: Logger;
  action: string;
  /** Default result returned (with error appended) on caught exception */
  defaultResult: TDefault;
  handler: () => Promise<TResult>;
}): Promise<TResult | (TDefault & { error: string })> {
  const { logger, action, defaultResult, handler } = options;
  logger.info(`${action}`);
  try {
    return await handler();
  } catch (error) {
    const message = extractErrorMessage(error, 'Unknown error');
    logger.error(`Error ${action}:`, error);
    return { ...defaultResult, error: message };
  }
}
