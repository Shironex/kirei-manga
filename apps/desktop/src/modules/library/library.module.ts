import { Module } from '@nestjs/common';
import { MangaDexModule } from '../mangadex/mangadex.module';
import { LibraryService } from './library.service';
import { BookmarkService } from './bookmark.service';
import { LibraryGateway } from './library.gateway';
import { UpdatePollerService } from './update-poller.service';

@Module({
  imports: [MangaDexModule],
  providers: [LibraryService, BookmarkService, LibraryGateway, UpdatePollerService],
  exports: [LibraryService, BookmarkService],
})
export class LibraryModule {}
