interface Logger {
  warn(message: string, ...args: unknown[]): void;
}

/**
 * Run a cleanup function with error handling. Catches and logs any errors
 * so that one failing cleanup step does not prevent the remaining steps.
 */
export async function safeCleanup(
  name: string,
  fn: () => void | Promise<void>,
  logger: Logger
): Promise<void> {
  try {
    await fn();
  } catch (error) {
    logger.warn(`${name} cleanup failed during shutdown`, error);
  }
}
