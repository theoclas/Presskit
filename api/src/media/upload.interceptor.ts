import { Injectable } from '@nestjs/common';
import { LIMITS } from '@fersua/shared';
import type { Request, Response } from 'express';
import multer from 'multer';
import { Errors } from '../common/errors';
import { MediaErrors } from './media.errors';

/**
 * multipart/form-data con UN archivo en memoria (campo "file") y a lo sumo 3 campos de texto.
 * Nunca toca el disco: el buffer va directo al pipeline de sharp. Lo llama el interceptor de
 * subidas de ProfilesModule DESPUÉS de los guards y de UploadGate, así que nadie sin sesión (ni
 * una ráfaga de una sola cuenta) llega a hacer que el servidor lea 10 MB por petición.
 */
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: LIMITS.upload.maxBytes,
    files: 1,
    fields: 3,
    parts: 4,
    fieldNameSize: 32,
    fieldSize: 256,
    headerPairs: 50,
  },
}).single('file');

/** Traduce los errores de multer/busboy a respuestas estables (nunca el mensaje en inglés). */
export function mapUploadError(err: unknown): Error {
  const code = err && typeof err === 'object' ? (err as { code?: unknown }).code : undefined;
  if (code === 'LIMIT_FILE_SIZE') return MediaErrors.tooLarge();
  if (typeof code === 'string' && code.startsWith('LIMIT_')) {
    return Errors.badRequest('UPLOAD_INVALID', 'Envía una sola imagen en el campo "file" y el tipo en "kind".');
  }
  return Errors.badRequest('UPLOAD_INVALID', 'No pudimos leer el archivo enviado. Intenta de nuevo.');
}

/** Lee el cuerpo multipart a memoria (req.file / req.body). */
export function readImageUpload(req: Request, res: Response): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    upload(req, res, (err: unknown) => (err ? reject(mapUploadError(err)) : resolve()));
  });
}

/**
 * Descarta lo que falte del cuerpo sin guardarlo (modo flowing sin oyentes: los trozos se
 * tiran) y resuelve al terminar. Para rechazar una subida antes de leerla sin cortar la
 * conexión a mitad del envío. Tope de espera por si el cliente se queda enviando lento (el
 * edge ya corta a los 30 s con client_body_timeout).
 */
export function discardRequestBody(req: Request, timeoutMs = 30_000): Promise<void> {
  return new Promise<void>((resolve) => {
    if (req.complete || req.readableEnded || req.destroyed) return resolve();
    const timer = setTimeout(done, timeoutMs);
    timer.unref();
    function done(): void {
      clearTimeout(timer);
      req.off('end', done);
      req.off('close', done);
      req.off('error', done);
      resolve();
    }
    req.on('end', done);
    req.on('close', done);
    req.on('error', done);
    req.resume();
  });
}

/** Margen del multipart sobre el archivo: separadores, cabeceras de cada parte y el campo kind. */
export const MULTIPART_OVERHEAD_BYTES = 64 * 1024;

/**
 * true si el Content-Length declarado ya supera lo que puede medir una subida válida: se
 * rechaza sin leer un byte. Sin la cabecera (chunked) decide multer al leer, con su tope.
 */
export function declaredLengthTooLarge(req: Pick<Request, 'headers'>): boolean {
  const raw = req.headers['content-length'];
  if (typeof raw !== 'string' || !/^\d{1,15}$/.test(raw)) return false;
  return Number(raw) > LIMITS.upload.maxBytes + MULTIPART_OVERHEAD_BYTES;
}

/**
 * Cupos de subida en proceso. La memoria la gasta multer al leer el cuerpo (hasta 10 MB por
 * petición) ANTES de la cola de sharp, así que el límite tiene que ir antes de leer:
 * - 3 subidas a la vez en todo el api (con el decode de sharp caben en el contenedor de 512 MB);
 * - 2 por usuario (la web sube de a 2), para que una sola cuenta no ocupe todos los cupos.
 * Si no hay cupo se responde 503 UPLOAD_BUSY de inmediato, sin leer el cuerpo.
 */
export const UPLOAD_SLOTS = { global: 3, perUser: 2 } as const;

@Injectable()
export class UploadGate {
  private readonly slots = UPLOAD_SLOTS;
  private active = 0;
  private readonly perUser = new Map<string, number>();

  get inFlight(): number {
    return this.active;
  }

  /** Ocupa un cupo global y uno del usuario. Devuelve la función que los libera (idempotente), o null si no hay cupo. */
  tryEnter(userId: string): (() => void) | null {
    const mine = this.perUser.get(userId) ?? 0;
    if (this.active >= this.slots.global || mine >= this.slots.perUser) return null;
    this.active++;
    this.perUser.set(userId, mine + 1);
    let released = false;
    return () => {
      if (released) return;
      released = true;
      this.active--;
      const left = (this.perUser.get(userId) ?? 1) - 1;
      if (left > 0) this.perUser.set(userId, left);
      else this.perUser.delete(userId);
    };
  }
}
