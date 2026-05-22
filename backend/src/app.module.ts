import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
import { ApiKeyGuard } from './common/api-key.guard';

import { PrismaModule } from './prisma/prisma.module';
import { RedisModule } from './redis/redis.module';
import { HealthModule } from './modules/health/health.module';
import { OpenWaModule } from './modules/openwa/openwa.module';
import { OllamaModule } from './modules/ollama/ollama.module';
import { ChatModule } from './modules/chat/chat.module';
import { CommandModule } from './modules/command/command.module';
import { WebhookModule } from './modules/webhook/webhook.module';
import { SettingsModule } from './modules/settings/settings.module';
import { LogsModule } from './modules/logs/logs.module';
import { SystemModule } from './modules/system/system.module';
import { RealtimeModule } from './modules/realtime/realtime.module';
import { DiagnosticsModule } from './modules/diagnostics/diagnostics.module';
import { IngestModule } from './modules/ingest/ingest.module';
import { ReminderModule } from './modules/reminder/reminder.module';
import { DevToolsModule } from './modules/devtools/devtools.module';
import { TelegramModule } from './modules/telegram/telegram.module';
import { NotesModule } from './modules/notes/notes.module';
import { IntentModule } from './modules/intent/intent.module';
import { AiModule } from './modules/ai/ai.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ScheduleModule.forRoot(),
    EventEmitterModule.forRoot(),
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 300 }]),
    PrismaModule,
    RedisModule,
    RealtimeModule,
    LogsModule,
    SettingsModule,
    SystemModule,
    OpenWaModule,
    OllamaModule,
    AiModule,
    CommandModule,
    ChatModule,
    IngestModule,
    WebhookModule,
    HealthModule,
    DiagnosticsModule,
    ReminderModule,
    NotesModule,
    IntentModule,
    DevToolsModule,
    TelegramModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: ApiKeyGuard },
  ],
})
export class AppModule {}
