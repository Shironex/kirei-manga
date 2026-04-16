import { Module } from '@nestjs/common';
import { SettingsService } from './settings.service';
import { SettingsGateway } from './settings.gateway';

@Module({
  providers: [SettingsService, SettingsGateway],
  exports: [SettingsService],
})
export class SettingsModule {}
