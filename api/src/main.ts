import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module';
import { AppConfig } from './config/app-config.service';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { bufferLogs: true });
  app.useLogger(app.get(Logger));
  const config = app.get(AppConfig);

  // Solo se confía en los proxies propios (edge nginx). Así req.ip es la IP real del visitante.
  const trust = process.env.TRUST_PROXY ?? 'loopback';
  app.set('trust proxy', trust.includes(',') ? trust.split(',').map((s) => s.trim()) : trust);
  app.set('x-powered-by', false);
  app.set('query parser', 'simple');

  app.setGlobalPrefix('api');
  // El CSP del HTML lo pone el edge (un solo dueño). Aquí, cabeceras para respuestas JSON.
  app.use(helmet({ contentSecurityPolicy: false, frameguard: false, hsts: false }));
  app.use(cookieParser());
  app.useBodyParser('json', { limit: '100kb' });
  app.useBodyParser('urlencoded', { limit: '10kb', extended: false });

  app.enableCors({ origin: config.corsOrigins, credentials: true });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      forbidUnknownValues: true,
      transform: true,
      validationError: { target: false, value: false },
    }),
  );

  app.enableShutdownHooks();
  await app.listen(Number(process.env.PORT ?? 3000), '0.0.0.0');
}

void bootstrap();
