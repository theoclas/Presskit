import { Module } from '@nestjs/common';
import { MediaModule } from '../media/media.module';
import { PublicProfileResolver } from './public-profile.resolver';
import { PublicController } from './public.controller';
import { PublicService } from './public.service';
import { SeoController } from './seo/seo.controller';
import { ShellTemplateService } from './seo/shell-template.service';
import { ShellService } from './seo/shell.service';

// Lectura pública (index, perfil, géneros), shell SEO, sitemap y robots.
// Exporta PublicProfileResolver: booking y tickets usan la misma regla de visibilidad.
@Module({
  imports: [MediaModule],
  controllers: [PublicController, SeoController],
  providers: [PublicProfileResolver, PublicService, ShellTemplateService, ShellService],
  exports: [PublicProfileResolver, PublicService],
})
export class PublicModule {}
