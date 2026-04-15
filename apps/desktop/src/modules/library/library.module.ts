import { Module } from '@nestjs/common';
import { MangaDexModule } from '../mangadex/mangadex.module';
import { LibraryService } from './library.service';
import { LibraryGateway } from './library.gateway';

@Module({
  imports: [MangaDexModule],
  providers: [LibraryService, LibraryGateway],
  exports: [LibraryService],
})
export class LibraryModule {}
