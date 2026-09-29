import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import cookieParser from 'cookie-parser';
import type { NextFunction, Request, Response } from 'express';
import helmet from 'helmet';
import * as path from 'node:path';
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

  // --- Solo desarrollo: /media servido por el propio api --------------------------------
  // En producción /media lo sirve el edge nginx desde el subdirectorio "public" del volumen
  // (solo lectura) y esta rama no existe. Va antes del prefijo /api y fuera de él.
  if (!config.isProd) {
    const mediaRoot = path.resolve(config.uploadDir, 'public');
    // Solo la estructura exacta <profileId>/<key>/<w>.webp|og.jpg: nada de "..", %2e, dotfiles
    // ni otras extensiones (el .env o un .json nunca pueden salir por aquí).
    const MEDIA_PATH_RE = /^\/[A-Za-z0-9_-]{1,40}\/[A-Za-z0-9_-]{1,32}\/(?:\d{1,5}\.webp|og\.jpg)$/;
    app.use('/media', (req: Request, res: Response, next: NextFunction) => {
      if (req.method !== 'GET' && req.method !== 'HEAD') return next();
      if (!MEDIA_PATH_RE.test(req.path)) return void res.status(404).type('text/plain').send('No encontrado.');
      next();
    });
    app.useStaticAssets(mediaRoot, {
      prefix: '/media',
      dotfiles: 'deny',
      index: false,
      redirect: false,
      maxAge: '1y',
      immutable: true,
      setHeaders: (res) => res.setHeader('X-Content-Type-Options', 'nosniff'),
    });
  }
  // ---------------------------------------------------------------------------------------

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
  // En desarrollo solo en loopback: con 0.0.0.0 cualquiera en la misma red Wi-Fi usaría el api
  // (y sus secretos de ejemplo, que son públicos). En Docker (producción) escucha en todas.
  const host = process.env.HOST || (config.isProd ? '0.0.0.0' : '127.0.0.1');
  await app.listen(Number(process.env.PORT ?? 3000), host);
}

void bootstrap();
