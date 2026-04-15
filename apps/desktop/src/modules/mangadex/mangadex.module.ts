import { Module } from '@nestjs/common';
import { MangaDexService } from './mangadex.service';
import { MangaDexGateway } from './mangadex.gateway';
import { MangaDexClient } from './mangadex.client';

@Module({
  providers: [MangaDexClient, MangaDexService, MangaDexGateway],
  exports: [MangaDexService, MangaDexClient],
})
export class MangaDexModule {}
