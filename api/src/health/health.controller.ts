import { Controller, Get, Module } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { constants } from 'node:fs';
import { access } from 'node:fs/promises';
import { AppConfig } from '../config/app-config.service';
import { Public } from '../common/decorators';
import { PrismaService } from '../prisma/prisma.service';

@Controller('health')
@Public()
@SkipThrottle()
export class HealthController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: AppConfig,
  ) {}

  /** Vivo: lo usa el healthcheck de Docker y el monitor externo. */
  @Get()
  live() {
    return { status: 'ok', version: this.config.appVersion };
  }

  /** Listo: base de datos y carpeta de medios accesibles. Sin detalles hacia afuera. */
  @Get('ready')
  async ready() {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      await access(this.config.uploadDir, constants.W_OK);
      return { status: 'ok' };
    } catch {
      return { status: 'fail' };
    }
  }
}

@Module({ controllers: [HealthController] })
export class HealthModule {}
