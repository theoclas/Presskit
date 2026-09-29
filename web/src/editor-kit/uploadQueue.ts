import type { MediaAssetDto, MediaKind } from '@fersua/shared';
import { http } from './api';

// El api procesa las fotos con sharp en una sola vCPU: más de 2 subidas a la vez solo
// alargan la espera de todas y terminan en 503 UPLOAD_BUSY.
export const UPLOAD_CONCURRENCY = 2;
/** Una subida de 10 MB por datos móviles puede tardar; el timeout general (20 s) no alcanza. */
const UPLOAD_TIMEOUT_MS = 180_000;

function abortError(): Error {
  const e = new Error('Se canceló la subida.');
  e.name = 'AbortError';
  return e;
}

/** Cola con concurrencia fija. Una tarea cancelada mientras espera sale sin ocupar cupo. */
export function createQueue(concurrency: number) {
  let active = 0;
  const waiting: { start: () => void; signal?: AbortSignal; onAbort: () => void }[] = [];

  const next = () => {
    while (active < concurrency && waiting.length) {
      const item = waiting.shift()!;
      item.signal?.removeEventListener('abort', item.onAbort);
      if (item.signal?.aborted) continue;
      item.start();
    }
  };

  return function run<T>(task: () => Promise<T>, signal?: AbortSignal): Promise<T> {
    if (signal?.aborted) return Promise.reject(abortError());
    return new Promise<T>((resolve, reject) => {
      const start = () => {
        active++;
        task()
          .then(resolve, reject)
          .finally(() => {
            active--;
            next();
          });
      };
      const entry = {
        start,
        signal,
        onAbort: () => {
          const i = waiting.indexOf(entry);
          if (i >= 0) waiting.splice(i, 1);
          reject(abortError());
        },
      };
      signal?.addEventListener('abort', entry.onAbort, { once: true });
      waiting.push(entry);
      next();
    });
  };
}

const queue = createQueue(UPLOAD_CONCURRENCY);

export interface UploadOptions {
  signal?: AbortSignal;
  /** 0-100 mientras se envían los bytes. */
  onProgress?: (percent: number) => void;
  /** Se llama cuando la subida sale de la cola y empieza a enviar. */
  onStart?: () => void;
}

/** POST `${base}/media` (multipart: file, kind) → MediaAssetDto. Quien llama lo asocia después. */
export function uploadMedia(base: string, file: File, kind: MediaKind, opts: UploadOptions = {}): Promise<MediaAssetDto> {
  return queue(async () => {
    opts.onStart?.();
    const form = new FormData();
    form.append('kind', kind);
    form.append('file', file, file.name);
    const res = await http.post<MediaAssetDto>(`${base}/media`, form, {
      signal: opts.signal,
      timeout: UPLOAD_TIMEOUT_MS,
      onUploadProgress: (e) => {
        if (!opts.onProgress) return;
        const total = e.total ?? file.size;
        opts.onProgress(total > 0 ? Math.min(100, Math.round((e.loaded / total) * 100)) : 0);
      },
    });
    return res.data;
  }, opts.signal);
}
