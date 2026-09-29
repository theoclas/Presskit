import { Module } from '@nestjs/common';
import { ImagePipelineService } from './image-pipeline.service';
import { MediaCleanupJob } from './media-cleanup.job';
import { MediaPreviewController } from './media-preview.controller';
import { MediaUrlService } from './media-url.service';
import { MediaService } from './media.service';
import { StorageService } from './storage.service';
import { UploadGate } from './upload.interceptor';

// Pipeline de imágenes (sharp → WebP sin metadatos), almacenamiento en disco, URLs públicas y
// la vista previa firmada de imágenes privadas. Las subidas las recibe ProfilesModule
// (POST .../media) con ProfileUploadInterceptor, que pide cupo a UploadGate antes de leer el
// cuerpo, y solo llaman a MediaService.ingest.
@Module({
  controllers: [MediaPreviewController],
  providers: [ImagePipelineService, StorageService, MediaService, MediaUrlService, MediaCleanupJob, UploadGate],
  exports: [MediaService, MediaUrlService, StorageService, UploadGate],
})
export class MediaModule {}
