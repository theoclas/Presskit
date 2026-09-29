import { Injectable, Logger } from '@nestjs/common';
import { LIMITS } from '@fersua/shared';
import { randomBytes } from 'node:crypto';
import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import { AppConfig } from '../config/app-config.service';
import { MediaErrors } from './media.errors';

// Estructura en disco (UPLOAD_DIR):
//   public/<profileId>/<key>/<w>.webp + og.jpg   ← lo sirve el edge nginx en /media (solo lectura)
//   private/<profileId>/<key>/...                ← perfiles no aprobados (M3), nunca se sirve directo
//   .tmp/                                        ← escrituras a medio hacer; se renombran al terminar
// storageKey = "<profileId>/<key>". Ningún nombre viene del usuario.

/** Un segmento de ruta válido: ids cuid, claves base64url y nombres de variante. */
const SEGMENT_RE = /^[A-Za-z0-9_-]{1,64}$/;
const FILE_RE = /^(?:\d{1,5}\.webp|og\.jpg)$/;
export const STORAGE_KEY_RE = /^[A-Za-z0-9_-]{1,40}\/[A-Za-z0-9_-]{1,32}$/;

export interface StoredFile {
  file: string;
  data: Buffer;
}

/**
 * Une segmentos a una raíz y garantiza que el resultado quede DENTRO de ella. Es la última
 * barrera contra path traversal ("..", rutas absolutas, separadores de Windows).
 */
export function safeJoin(root: string, ...segments: string[]): string {
  const base = path.resolve(root);
  for (const s of segments) {
    if (typeof s !== 'string' || !s || s.includes('\0') || s.includes('/') || s.includes('\\') || s === '.' || s === '..') {
      throw new Error('Segmento de ruta inválido');
    }
  }
  const full = path.resolve(base, ...segments);
  if (full !== base && !full.startsWith(base + path.sep)) throw new Error('Ruta fuera del directorio de medios');
  return full;
}

function assertSegment(s: string, what: string): void {
  if (!SEGMENT_RE.test(s)) throw new Error(`${what} inválido`);
}

function splitKey(storageKey: string): [string, string] {
  if (!STORAGE_KEY_RE.test(storageKey)) throw new Error('storageKey inválido');
  const [profileId, key] = storageKey.split('/') as [string, string];
  return [profileId, key];
}

@Injectable()
export class StorageService {
  private readonly logger = new Logger(StorageService.name);
  readonly root: string;
  /** Configurable solo para pruebas. */
  minFreeBytes: number = LIMITS.upload.minFreeDiskBytes;

  constructor(config: AppConfig) {
    this.root = path.resolve(config.uploadDir);
  }

  get publicRoot(): string {
    return path.join(this.root, 'public');
  }

  get privateRoot(): string {
    return path.join(this.root, 'private');
  }

  get tmpRoot(): string {
    return path.join(this.root, '.tmp');
  }

  rootFor(isPublic: boolean): string {
    return isPublic ? this.publicRoot : this.privateRoot;
  }

  /** Carpeta de un asset: <root>/<public|private>/<profileId>/<key>. */
  assetDir(storageKey: string, isPublic: boolean): string {
    const [profileId, key] = splitKey(storageKey);
    return safeJoin(this.rootFor(isPublic), profileId, key);
  }

  filePath(storageKey: string, isPublic: boolean, file: string): string {
    if (!FILE_RE.test(file)) throw new Error('Nombre de variante inválido');
    const [profileId, key] = splitKey(storageKey);
    return safeJoin(this.rootFor(isPublic), profileId, key, file);
  }

  /** Rechaza escrituras si quedan menos de 5 GB libres: un disco lleno tumba MySQL también. */
  async ensureFreeSpace(): Promise<void> {
    await fs.mkdir(this.root, { recursive: true });
    const st = await fs.statfs(this.root);
    const free = Number(st.bavail) * Number(st.bsize);
    if (free < this.minFreeBytes) {
      this.logger.error(`Espacio libre insuficiente en el volumen de medios (${Math.round(free / 1024 / 1024)} MB)`);
      throw MediaErrors.storageFull();
    }
  }

  /**
   * Escritura atómica: todos los archivos van a una carpeta en .tmp y al final se renombra la
   * carpeta completa a su lugar. Nunca queda un asset a medias visible en /media.
   */
  async writeAsset(storageKey: string, isPublic: boolean, files: StoredFile[]): Promise<void> {
    if (!files.length) throw new Error('Asset sin archivos');
    for (const f of files) if (!FILE_RE.test(f.file)) throw new Error('Nombre de variante inválido');
    const [profileId] = splitKey(storageKey);
    const target = this.assetDir(storageKey, isPublic);

    await this.ensureFreeSpace();
    await fs.mkdir(this.tmpRoot, { recursive: true });
    const staging = safeJoin(this.tmpRoot, `w-${randomBytes(9).toString('base64url')}`);
    await fs.mkdir(staging, { mode: 0o755 });
    try {
      for (const f of files) {
        await fs.writeFile(safeJoin(staging, f.file), f.data, { mode: 0o644, flag: 'wx' });
      }
      await fs.mkdir(safeJoin(this.rootFor(isPublic), profileId), { recursive: true, mode: 0o755 });
      await renameWithRetry(staging, target);
    } catch (err) {
      await fs.rm(staging, { recursive: true, force: true }).catch(() => undefined);
      throw err;
    }
  }

  async deleteAsset(storageKey: string, isPublic: boolean): Promise<void> {
    await fs.rm(this.assetDir(storageKey, isPublic), { recursive: true, force: true });
  }

  /** Mueve un asset entre private/ y public/ (al aprobar o suspender un perfil, M3). */
  async moveAsset(storageKey: string, fromPublic: boolean, toPublic: boolean): Promise<void> {
    if (fromPublic === toPublic) return;
    const [profileId] = splitKey(storageKey);
    const from = this.assetDir(storageKey, fromPublic);
    const to = this.assetDir(storageKey, toPublic);
    await fs.mkdir(safeJoin(this.rootFor(toPublic), profileId), { recursive: true, mode: 0o755 });
    await renameWithRetry(from, to);
  }

  /** Borra todas las carpetas de un perfil (public y private). */
  async deleteProfileFolders(profileId: string): Promise<void> {
    assertSegment(profileId, 'profileId');
    for (const root of [this.publicRoot, this.privateRoot]) {
      await fs.rm(safeJoin(root, profileId), { recursive: true, force: true });
    }
  }

  /** Limpia restos en .tmp más viejos que maxAgeMs (una escritura que murió a mitad). */
  async sweepTmp(maxAgeMs: number): Promise<number> {
    let removed = 0;
    let entries: string[];
    try {
      entries = await fs.readdir(this.tmpRoot);
    } catch {
      return 0;
    }
    const cutoff = Date.now() - maxAgeMs;
    for (const name of entries) {
      const full = path.join(this.tmpRoot, name);
      try {
        const st = await fs.lstat(full);
        if (st.mtimeMs < cutoff) {
          await fs.rm(full, { recursive: true, force: true });
          removed++;
        }
      } catch {
        // Otro proceso pudo borrarlo entre readdir y lstat.
      }
    }
    return removed;
  }
}

/**
 * En Windows (desarrollo) un antivirus o el indexador pueden tener abierta la carpeta recién
 * escrita y rename falla con EPERM/EBUSY por unos milisegundos. En Linux no reintenta nunca.
 */
async function renameWithRetry(from: string, to: string): Promise<void> {
  for (let attempt = 0; ; attempt++) {
    try {
      await fs.rename(from, to);
      return;
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code;
      if (attempt >= 5 || (code !== 'EPERM' && code !== 'EBUSY' && code !== 'EACCES')) throw err;
      await new Promise((r) => setTimeout(r, 50 * (attempt + 1)));
    }
  }
}
