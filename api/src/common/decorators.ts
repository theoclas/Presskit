import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';
/** Ruta sin login. Todo lo demás exige sesión (guard global desde M2). */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

export const PUBLIC_CACHE_KEY = 'publicCacheSeconds';
/** Cache-Control público para GET anónimos. Por defecto todo es no-store. */
export const PublicCache = (seconds: number) => SetMetadata(PUBLIC_CACHE_KEY, seconds);
