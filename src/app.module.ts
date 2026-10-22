import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { LoggerModule } from 'nestjs-pino';
import { validateEnv, type Env } from './config/env.js';
import { AuditModule } from './core/audit/audit.module.js';
import { AuthModule } from './core/auth/auth.module.js';
import { OriginGuard } from './core/auth/guards/origin.guard.js';
import { SessionGuard } from './core/auth/guards/session.guard.js';
import { CryptoModule } from './core/crypto/crypto.module.js';
import { DatabaseModule } from './core/database/database.module.js';
import { HealthController } from './core/health/health.controller.js';
import { IamModule } from './core/iam/iam.module.js';
import { PermissionsGuard } from './core/iam/permissions.guard.js';
import { HiringModule } from './modules/hiring/hiring.public.js';
import { OrgModule } from './modules/org/org.public.js';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, cache: true, validate: validateEnv }),
    LoggerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) => ({
        pinoHttp: {
          level: config.get('LOG_LEVEL', { infer: true }),
          transport: config.get('NODE_ENV', { infer: true }) === 'development' ? { target: 'pino-pretty' } : undefined,
          // Never log credentials or session tokens.
          redact: ['req.headers.cookie', 'req.headers.authorization', 'res.headers["set-cookie"]'],
          autoLogging: { ignore: (req) => req.url?.startsWith('/api/health') ?? false },
        },
      }),
    }),
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 300 }]),

    // Core — shared infrastructure. Never imports from src/modules.
    DatabaseModule,
    CryptoModule,
    AuditModule,
    AuthModule,
    IamModule,

    // Business modules — import each through its *.public.ts file.
    OrgModule,
    HiringModule,
  ],
  controllers: [HealthController],
  providers: [
    // Global guards run in this order: rate limit → CSRF origin check → session → access rule (deny by default).
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useExisting: OriginGuard },
    { provide: APP_GUARD, useExisting: SessionGuard },
    { provide: APP_GUARD, useExisting: PermissionsGuard },
  ],
})
export class AppModule {}
