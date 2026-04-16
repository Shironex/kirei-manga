import { Module } from '@nestjs/common';
import { MangaDexModule } from '../mangadex/mangadex.module';
import { SettingsModule } from '../settings';
import { LibraryService } from './library.service';
import { BookmarkService } from './bookmark.service';
import { LibraryGateway } from './library.gateway';
import { LibraryCacheService } from './library-cache.service';
import { UpdatePollerService } from './update-poller.service';

@Module({
  imports: [MangaDexModule, SettingsModule],
  providers: [
    LibraryService,
    BookmarkService,
    LibraryGateway,
    LibraryCacheService,
    UpdatePollerService,
  ],
  exports: [LibraryService, BookmarkService, LibraryCacheService],
})
export class LibraryModule {}
