import { Module } from '@nestjs/common';
import { MangaDexModule } from '../mangadex/mangadex.module';
import { LibraryService } from './library.service';
import { LibraryGateway } from './library.gateway';
import { UpdatePollerService } from './update-poller.service';

@Module({
  imports: [MangaDexModule],
  providers: [LibraryService, LibraryGateway, UpdatePollerService],
  exports: [LibraryService],
})
export class LibraryModule {}
