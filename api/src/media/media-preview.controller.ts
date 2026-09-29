import { Controller, Get, Param, Query, Res, StreamableFile } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Response } from 'express';
import { promises as fs } from 'node:fs';
import { Public } from '../common/decorators';
import { Errors } from '../common/errors';
import { PrismaService } from '../prisma/prisma.service';
import { MediaUrlService, assetFiles } from './media-url.service';
import { StorageService } from './storage.service';

/**
 * Imágenes de perfiles sin aprobar (y cualquier otra) por URL firmada de 1 h. Es @Public porque
 * un <img> no manda el access token: la firma HMAC es la autorización y solo el api la emite
 * (en las respuestas del editor y de la vista previa). Todo fallo es el mismo 404.
 */
@Controller('media')
@Public()
// Una página del editor pide decenas de imágenes a la vez (galería, integrantes, flyers).
@Throttle({ default: { limit: 1200, ttl: 60_000 } })
export class MediaPreviewController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly urls: MediaUrlService,
    private readonly storage: StorageService,
  ) {}

  @Get('preview/:assetId/:file')
  async preview(
    @Param('assetId') assetId: string,
    @Param('file') file: string,
    @Query('exp') exp: unknown,
    @Query('sig') sig: unknown,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    // Primero la firma (sin BD ni disco): lo que no esté firmado por nosotros no cuesta nada.
    if (!this.urls.verifyPreview(assetId, file, exp, sig)) throw notFound();

    const asset = await this.prisma.mediaAsset.findUnique({
      where: { id: assetId },
      select: { storageKey: true, variants: true, hasOg: true, isPublic: true },
    });
    // Solo los archivos que la fila declara: nada de adivinar otros nombres en la carpeta.
    if (!asset || !assetFiles(asset).includes(file)) throw notFound();

    let data: Buffer;
    try {
      const full = await this.storage.locateFile(asset.storageKey, file, asset.isPublic);
      if (!full) throw notFound();
      data = await fs.readFile(full);
    } catch {
      throw notFound();
    }

    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Security-Policy', "default-src 'none'; sandbox");
    res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
    return new StreamableFile(data, {
      type: file.endsWith('.jpg') ? 'image/jpeg' : 'image/webp',
      length: data.length,
    });
  }
}

function notFound() {
  return Errors.notFound('Imagen no encontrada.');
}
