import { Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerModule } from '@nestjs/throttler';
import { LoggerModule } from 'nestjs-pino';
import { AuditModule } from './audit/audit.service';
import { CommonModule } from './common/common.module';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { AppThrottlerGuard } from './common/guards/app-throttler.guard';
import { OriginGuard } from './common/guards/origin.guard';
import { CacheControlInterceptor } from './common/interceptors/cache-control.interceptor';
import { AppConfigModule } from './config/config.module';
import { HealthModule } from './health/health.controller';
import { PrismaModule } from './prisma/prisma.service';

@Module({
  imports: [
    AppConfigModule,
    LoggerModule.forRoot({
      pinoHttp: {
        level: process.env.LOG_LEVEL ?? 'info',
        genReqId: (req) => (req.headers['x-request-id'] as string) || crypto.randomUUID(),
        // Nunca registrar credenciales, cookies ni tokens.
        redact: {
          paths: [
            'req.headers.authorization',
            'req.headers.cookie',
            'res.headers["set-cookie"]',
            '*.password',
            '*.currentPassword',
            '*.newPassword',
            '*.token',
            '*.temporaryPassword',
          ],
          censor: '[oculto]',
        },
        customProps: () => ({ app: 'fersua-booking' }),
        autoLogging: { ignore: (req) => req.url?.startsWith('/api/health') ?? false },
        transport: process.env.NODE_ENV === 'production' ? undefined : { target: 'pino/file', options: { destination: 1 } },
      },
    }),
    ThrottlerModule.forRoot({ throttlers: [{ name: 'default', ttl: 60_000, limit: 120 }] }),
    ScheduleModule.forRoot(),
    PrismaModule,
    AuditModule,
    CommonModule,
    HealthModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: AppThrottlerGuard },
    { provide: APP_GUARD, useClass: OriginGuard },
    { provide: APP_INTERCEPTOR, useClass: CacheControlInterceptor },
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
  ],
})
export class AppModule {}
