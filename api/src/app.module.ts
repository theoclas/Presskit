import { Module, RequestMethod } from '@nestjs/common';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerModule } from '@nestjs/throttler';
import { LoggerModule } from 'nestjs-pino';
import { AuditModule } from './audit/audit.service';
import { CommonModule } from './common/common.module';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { AppThrottlerGuard } from './common/guards/app-throttler.guard';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { MustChangePasswordGuard } from './common/guards/must-change-password.guard';
import { OriginGuard } from './common/guards/origin.guard';
import { RolesGuard } from './common/guards/roles.guard';
import { StepUpGuard } from './common/guards/step-up.guard';
import { CacheControlInterceptor } from './common/interceptors/cache-control.interceptor';
import { AppConfigModule } from './config/config.module';
import { HealthModule } from './health/health.controller';
import { PrismaModule } from './prisma/prisma.service';
import { MediaModule } from './media/media.module';
import { PublicModule } from './public/public.module';
import { BookingModule } from './booking/booking.module';
import { TicketsModule } from './tickets/tickets.module';
import { AuthModule } from './auth/auth.module';
import { MailModule } from './mail/mail.module';
import { ProfilesModule } from './profiles/profiles.module';
import { AdminModule } from './admin/admin.module';

/** Ruta sin la query string, para el log. */
export function pathOnly(url: string | undefined): string {
  return (url ?? '').split('?')[0] ?? '';
}

@Module({
  imports: [
    AppConfigModule,
    LoggerModule.forRoot({
      // Sintaxis de path-to-regexp 8 (Express 5): el '*' por defecto dispara LegacyRouteConverter.
      forRoutes: [{ path: '{*splat}', method: RequestMethod.ALL }],
      pinoHttp: {
        level: process.env.LOG_LEVEL ?? 'info',
        genReqId: (req) => (req.headers['x-request-id'] as string) || crypto.randomUUID(),
        // Sin cabeceras ni IP en el log del api (Ley 1581): la IP ya queda en el log del edge,
        // que tiene su propia retención. Aquí basta con el id para cruzar ambos. La URL va sin
        // query: las búsquedas del admin llevan correos y teléfonos (?q=) y la vista previa
        // firmada lleva una capacidad de lectura (?exp=&sig=).
        serializers: {
          req: (req: { id?: unknown; method?: string; url?: string }) => ({ id: req.id, method: req.method, url: pathOnly(req.url) }),
          res: (res: { statusCode?: number }) => ({ statusCode: res.statusCode }),
        },
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
    MediaModule,
    PublicModule,
    BookingModule,
    TicketsModule,
    MailModule,
    AuthModule,
    ProfilesModule,
    AdminModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: AppThrottlerGuard },
    { provide: APP_GUARD, useClass: OriginGuard },
    // Sesión y autorización, en este orden (docs/api-m2.md). StepUpGuard solo actúa en
    // rutas con @RequireStepUp.
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: MustChangePasswordGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
    { provide: APP_GUARD, useClass: StepUpGuard },
    { provide: APP_INTERCEPTOR, useClass: CacheControlInterceptor },
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
  ],
})
export class AppModule {}
