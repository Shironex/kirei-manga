import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database';
import { MangaDexService } from './mangadex.service';
import { MangaDexGateway } from './mangadex.gateway';
import { MangaDexClient } from './mangadex.client';

@Module({
  imports: [DatabaseModule],
  providers: [MangaDexClient, MangaDexService, MangaDexGateway],
  exports: [MangaDexService, MangaDexClient],
})
export class MangaDexModule {}
