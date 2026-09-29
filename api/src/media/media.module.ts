import { Module } from '@nestjs/common';
import { ImagePipelineService } from './image-pipeline.service';
import { MediaCleanupJob } from './media-cleanup.job';
import { MediaUrlService } from './media-url.service';
import { MediaService } from './media.service';
import { StorageService } from './storage.service';

// Pipeline de imágenes (sharp → WebP sin metadatos), almacenamiento en disco y URLs públicas.
// Sin endpoint de subida todavía: el controlador llega en M2/M3 y solo llama a MediaService.ingest.
@Module({
  providers: [ImagePipelineService, StorageService, MediaService, MediaUrlService, MediaCleanupJob],
  exports: [MediaService, MediaUrlService, StorageService],
})
export class MediaModule {}
