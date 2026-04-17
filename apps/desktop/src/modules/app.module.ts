import { Module } from '@nestjs/common';
import { ThrottlerModule } from '@nestjs/throttler';
import { DatabaseModule } from './database';
import { MangaDexModule } from './mangadex';
import { LibraryModule } from './library';
import { LocalModule } from './local';
import { SettingsModule } from './settings';
import { TranslationModule } from './translation';

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
    LocalModule,
    TranslationModule,
  ],
  controllers: [],
  providers: [],
  exports: [],
})
export class AppModule {}
