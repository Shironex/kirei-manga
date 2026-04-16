import { Module } from '@nestjs/common';
import { ThrottlerModule } from '@nestjs/throttler';
import { DatabaseModule } from './database';
import { MangaDexModule } from './mangadex';
import { LibraryModule } from './library';
import { SettingsModule } from './settings';

@Module({
  imports: [
    ThrottlerModule.forRoot([
      {
        name: 'short',
        ttl: 1000,
        limit: 100,
      },
      {
        name: 'medium',
        ttl: 10000,
        limit: 500,
      },
    ]),
    DatabaseModule,
    MangaDexModule,
    SettingsModule,
    LibraryModule,
  ],
  controllers: [],
  providers: [],
  exports: [],
})
export class AppModule {}
