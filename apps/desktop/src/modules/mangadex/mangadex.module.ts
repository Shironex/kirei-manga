import { Module } from '@nestjs/common';
import { MangaDexService } from './mangadex.service';
import { MangaDexGateway } from './mangadex.gateway';

@Module({
  providers: [MangaDexService, MangaDexGateway],
  exports: [MangaDexService],
})
export class MangaDexModule {}
