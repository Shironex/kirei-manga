import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database';
import { LocalScannerService } from './scanner';
import { LocalGateway } from './local.gateway';

@Module({
  imports: [DatabaseModule],
  providers: [LocalScannerService, LocalGateway],
  exports: [LocalScannerService],
})
export class LocalModule {}
