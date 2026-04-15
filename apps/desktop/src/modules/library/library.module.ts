import { Module } from '@nestjs/common';
import { LibraryService } from './library.service';
import { LibraryGateway } from './library.gateway';

@Module({
  providers: [LibraryService, LibraryGateway],
  exports: [LibraryService],
})
export class LibraryModule {}
