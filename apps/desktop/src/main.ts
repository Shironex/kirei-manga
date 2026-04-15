/**
 * Standalone Nest bootstrap entry point — used for testing / CI so the
 * NestJS backend can be type-checked and run without Electron.
 *
 * The real production entry is src/main/index.ts (Electron main process).
 */
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './modules/app.module';
import { CustomIoAdapter, NestLoggerAdapter, corsOriginCallback } from './modules/shared';
import { LOCALHOST, createLogger } from '@kireimanga/shared';

const logger = createLogger('Bootstrap');

export async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    logger: new NestLoggerAdapter(),
    bufferLogs: true,
  });
  app.flushLogs();
  app.useWebSocketAdapter(new CustomIoAdapter(app));
  app.enableCors({ origin: corsOriginCallback, credentials: true });

  await app.listen(0, LOCALHOST);
  const addr = app.getHttpServer().address();
  if (!addr || typeof addr === 'string') {
    throw new Error(`Failed to get server port: ${JSON.stringify(addr)}`);
  }
  logger.info(`NestJS listening on port ${addr.port}`);
  return app;
}
