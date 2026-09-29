import { Controller, Get, Header, Query, Res } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Response } from 'express';
import { AppConfig } from '../../config/app-config.service';
import { Public, PublicCache } from '../../common/decorators';
import { PublicService } from '../public.service';
import { ShellService } from './shell.service';
import { buildRobots, buildSitemap } from './sitemap';

// Mismo techo que la zona "pages" del edge (20 r/s): un 429 del api en el shell llegaría al
// navegador como JSON en vez de la página del DJ. Las inundaciones las frena el edge.
@Controller('public')
@Public()
@Throttle({ default: { limit: 1200, ttl: 60_000 } })
export class SeoController {
  constructor(
    private readonly shell: ShellService,
    private readonly publicService: PublicService,
    private readonly config: AppConfig,
  ) {}

  /** Página de la SPA con el head SEO. `path` se valida en decideShellPath y nunca se devuelve. */
  @Get('shell')
  async page(@Query('path') path: unknown, @Res() res: Response): Promise<void> {
    const result = await this.shell.render(path);
    // no-cache (no no-store): el edge puede revalidar, pero nunca servir una versión vieja sin preguntar.
    res.setHeader('Cache-Control', 'no-cache');
    if (result.status === 301 || !result.indexable) res.setHeader('X-Robots-Tag', 'noindex');
    if (result.status === 301) {
      res.status(301).setHeader('Location', result.location);
      res.end();
      return;
    }
    res.status(result.status).setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(result.html);
  }

  @Get('sitemap.xml')
  @PublicCache(300)
  @Header('Content-Type', 'application/xml; charset=utf-8')
  async sitemap(): Promise<string> {
    return buildSitemap(this.config.publicUrl, await this.publicService.visibleSlugs());
  }

  @Get('robots.txt')
  @PublicCache(300)
  @Header('Content-Type', 'text/plain; charset=utf-8')
  robots(): string {
    return buildRobots(this.config.publicUrl, this.config.seoIndexable);
  }
}
