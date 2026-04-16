import {
  WebSocketGateway,
  SubscribeMessage,
  MessageBody,
  WebSocketServer,
} from '@nestjs/websockets';
import { UseGuards } from '@nestjs/common';
import { Server } from 'socket.io';
import {
  createLogger,
  SettingsEvents,
  type SettingsSetPayload,
  type SettingsUpdatedEvent,
} from '@kireimanga/shared';
import { CORS_CONFIG } from '../shared/cors.config';
import { WsThrottlerGuard } from '../shared/ws-throttler.guard';
import { handleGatewayRequest } from '../shared/gateway-handler';
import { SettingsService } from './settings.service';

const logger = createLogger('SettingsGateway');

@WebSocketGateway({ cors: CORS_CONFIG })
@UseGuards(WsThrottlerGuard)
export class SettingsGateway {
  @WebSocketServer()
  server!: Server;

  constructor(private readonly settingsService: SettingsService) {
    logger.info('SettingsGateway initialized');
  }

  @SubscribeMessage(SettingsEvents.GET)
  handleGet() {
    return handleGatewayRequest({
      logger,
      action: 'settings:get',
      defaultResult: { settings: this.settingsService.get() },
      handler: async () => {
        return { settings: this.settingsService.get() };
      },
    });
  }

  @SubscribeMessage(SettingsEvents.SET)
  handleSet(@MessageBody() payload: SettingsSetPayload) {
    return handleGatewayRequest({
      logger,
      action: 'settings:set',
      defaultResult: { settings: this.settingsService.get() },
      handler: async () => {
        const settings = this.settingsService.set(payload.settings);
        this.server.emit(SettingsEvents.UPDATED, {
          settings,
        } satisfies SettingsUpdatedEvent);
        return { settings };
      },
    });
  }

  @SubscribeMessage(SettingsEvents.RESET)
  handleReset() {
    return handleGatewayRequest({
      logger,
      action: 'settings:reset',
      defaultResult: { settings: this.settingsService.get() },
      handler: async () => {
        const settings = this.settingsService.reset();
        this.server.emit(SettingsEvents.UPDATED, {
          settings,
        } satisfies SettingsUpdatedEvent);
        return { settings };
      },
    });
  }
}
