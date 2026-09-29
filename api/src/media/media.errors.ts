import { HttpStatus } from '@nestjs/common';
import { AppError } from '../common/errors';

// Errores del pipeline de imágenes con código estable para la web. Los mensajes nunca
// incluyen el nombre del archivo ni datos del usuario.
export const MediaErrors = {
  unsupported: () =>
    new AppError(
      HttpStatus.UNSUPPORTED_MEDIA_TYPE,
      'UNSUPPORTED_IMAGE',
      'Formato no permitido. Sube una foto JPG, PNG o WebP.',
    ),
  invalid: () =>
    new AppError(
      HttpStatus.UNSUPPORTED_MEDIA_TYPE,
      'INVALID_IMAGE',
      'No pudimos leer la imagen. Puede estar dañada; prueba con otra.',
    ),
  tooLarge: () =>
    new AppError(
      HttpStatus.PAYLOAD_TOO_LARGE,
      'IMAGE_TOO_LARGE',
      'La imagen es demasiado grande. Usa una de máximo 10 MB y 40 megapíxeles.',
    ),
  tooSmall: (minSide: number) =>
    new AppError(
      HttpStatus.BAD_REQUEST,
      'IMAGE_TOO_SMALL',
      `La imagen es muy pequeña: cada lado debe medir al menos ${minSide} px.`,
    ),
  busy: () =>
    new AppError(
      HttpStatus.SERVICE_UNAVAILABLE,
      'UPLOAD_BUSY',
      'Estamos procesando otras fotos. Intenta de nuevo en unos segundos.',
    ),
  timeout: () =>
    new AppError(
      HttpStatus.SERVICE_UNAVAILABLE,
      'IMAGE_TIMEOUT',
      'La imagen tardó demasiado en procesarse. Prueba con una más liviana.',
    ),
  storageFull: () =>
    new AppError(
      HttpStatus.SERVICE_UNAVAILABLE,
      'STORAGE_FULL',
      'Por ahora no podemos guardar más fotos. Intenta más tarde.',
    ),
};
