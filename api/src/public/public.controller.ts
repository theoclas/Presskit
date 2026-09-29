import { Controller, Get, Param, Res } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Response } from 'express';
import type { GenreCountDto, PublicDjCardDto } from '@fersua/shared';
import { Public, PublicCache } from '../common/decorators';
import { Errors } from '../common/errors';
import { slugLocation } from './seo/path-decision';
import { PublicService } from './public.service';

// Lecturas públicas: el límite general (120/min) era más estricto que la zona "api" del edge
// y, con CGNAT (muchos móviles con la misma IP), lo pagaban visitantes legítimos.
@Controller('public')
@Public()
@Throttle({ default: { limit: 1200, ttl: 60_000 } })
export class PublicController {
  constructor(private readonly publicService: PublicService) {}

  @Get('djs')
  @PublicCache(30)
  list(): Promise<PublicDjCardDto[]> {
    return this.publicService.listCards();
  }

  /** Slug viejo → 301 relativo al slug actual; la SPA corrige la URL si data.slug cambió. */
  @Get('djs/:slug')
  @PublicCache(30)
  async detail(@Param('slug') slug: string, @Res() res: Response): Promise<void> {
    const found = await this.publicService.findProfile(slug);
    if (found.kind === 'none') throw Errors.notFound('Este perfil no existe o no está publicado.');
    if (found.kind === 'redirect') {
      res.status(301).setHeader('Location', `/api/public/djs${slugLocation(found.slug)}`);
      res.end();
      return;
    }
    res.json(this.publicService.toProfileDto(found.profile));
  }

  @Get('genres')
  @PublicCache(30)
  genres(): Promise<GenreCountDto[]> {
    return this.publicService.listGenres();
  }
}
