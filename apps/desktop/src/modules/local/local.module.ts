import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database';
import { LocalScannerService } from './scanner';
import { LocalLibraryService } from './local-library.service';
import { LocalGateway } from './local.gateway';

@Module({
  imports: [DatabaseModule],
  providers: [LocalScannerService, LocalLibraryService, LocalGateway],
  exports: [LocalScannerService, LocalLibraryService],
})
export class LocalModule {}
