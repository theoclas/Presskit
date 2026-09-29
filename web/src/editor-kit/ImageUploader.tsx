import type { MediaAssetDto, MediaKind } from '@fersua/shared';
import { Alert, Button, Progress, Space, Typography } from 'antd';
import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { describeError } from './api';
import { ImageCheckFailure, prepareImage, validateImageFile } from './imagePipeline';
import { useEditorScope } from './scope';
import { uploadMedia, type UploadOptions } from './uploadQueue';

type Phase = 'checking' | 'optimizing' | 'queued' | 'uploading' | 'processing' | 'attaching' | 'done' | 'error' | 'canceled';

interface Item {
  id: number;
  name: string;
  phase: Phase;
  percent: number;
  error?: string;
  warning?: string;
}

/** Ancho mínimo recomendado por uso: por debajo se ve borrosa en pantallas grandes. */
const RECOMMENDED_MIN_PX: Record<MediaKind, number> = { HERO: 1200, GALLERY: 800, FLYER: 800, MEMBER: 500, CARD: 500 };

const PHASE_LABEL: Record<Phase, string> = {
  checking: 'Revisando…',
  optimizing: 'Optimizando…',
  queued: 'En cola…',
  uploading: 'Subiendo',
  processing: 'Procesando…',
  attaching: 'Guardando…',
  done: 'Lista',
  error: 'No se subió',
  canceled: 'Cancelada',
};

export type UploadFn = (file: File, kind: MediaKind, opts: UploadOptions) => Promise<MediaAssetDto>;

export interface ImageUploaderProps {
  kind: MediaKind;
  /** Con cada foto ya subida: quien llama la asocia (PATCH heroImageId, POST /gallery…). */
  onUploaded: (asset: MediaAssetDto) => Promise<unknown> | unknown;
  multiple?: boolean;
  /** Cupos libres (galería). Con 0 el botón queda deshabilitado. */
  maxFiles?: number;
  buttonLabel?: string;
  hint?: ReactNode;
  disabled?: boolean;
  /** Reemplaza la subida real (pruebas). Por defecto POST `${base}/media`. */
  upload?: UploadFn;
}

let nextId = 1;

/**
 * Selector de fotos con revisión previa (tipo, HEIC, 40 MB), reducción en el navegador,
 * progreso, cancelar y cola de 2. La foto se sube apenas se elige; asociarla es cosa del padre.
 */
export function ImageUploader({
  kind,
  onUploaded,
  multiple = false,
  maxFiles,
  buttonLabel,
  hint,
  disabled = false,
  upload,
}: ImageUploaderProps) {
  const scope = useEditorScope();
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const controllers = useRef(new Map<number, AbortController>());
  const mounted = useRef(true);
  const [items, setItems] = useState<Item[]>([]);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    mounted.current = true;
    const map = controllers.current;
    return () => {
      mounted.current = false;
      // Al salir de la pantalla se cancelan las subidas pendientes.
      for (const c of map.values()) c.abort();
      map.clear();
    };
  }, []);

  const patch = useCallback((id: number, change: Partial<Item>) => {
    if (!mounted.current) return;
    setItems((prev) => prev.map((it) => (it.id === id ? { ...it, ...change } : it)));
  }, []);

  const doUpload: UploadFn = useCallback(
    (file, k, opts) => (upload ? upload(file, k, opts) : uploadMedia(scope.base, file, k, opts)),
    [upload, scope.base],
  );

  const processOne = useCallback(
    async (file: File, id: number) => {
      const ctrl = new AbortController();
      controllers.current.set(id, ctrl);
      try {
        await validateImageFile(file);
        if (ctrl.signal.aborted) return;
        patch(id, { phase: 'optimizing' });
        const prepared = await prepareImage(file);
        if (ctrl.signal.aborted) return;
        const long = prepared.width && prepared.height ? Math.max(prepared.width, prepared.height) : null;
        const warning =
          long && long < RECOMMENDED_MIN_PX[kind]
            ? `La foto es pequeña (${long} px): puede verse borrosa. Lo ideal es desde ${RECOMMENDED_MIN_PX[kind]} px.`
            : undefined;
        patch(id, { phase: 'queued', warning });
        const asset = await doUpload(prepared.file, kind, {
          signal: ctrl.signal,
          onStart: () => patch(id, { phase: 'uploading', percent: 0 }),
          onProgress: (percent) => patch(id, percent >= 100 ? { phase: 'processing', percent } : { percent }),
        });
        if (ctrl.signal.aborted) return;
        patch(id, { phase: 'attaching', percent: 100 });
        await onUploaded(asset);
        patch(id, { phase: 'done' });
        // Las listas se limpian solas; los errores quedan hasta que los cierren.
        setTimeout(() => {
          if (mounted.current) setItems((prev) => prev.filter((it) => it.id !== id || it.phase !== 'done' || !!it.warning));
        }, 2500);
      } catch (err) {
        if (ctrl.signal.aborted || (err instanceof Error && err.name === 'AbortError')) {
          patch(id, { phase: 'canceled' });
          return;
        }
        const message = err instanceof ImageCheckFailure ? err.message : describeError(err).message;
        patch(id, { phase: describeError(err).canceled ? 'canceled' : 'error', error: message });
      } finally {
        controllers.current.delete(id);
      }
    },
    [doUpload, kind, onUploaded, patch],
  );

  const onFiles = (list: FileList | null) => {
    setNotice(null);
    if (!list || !list.length) return;
    let files = Array.from(list);
    if (!multiple) files = files.slice(0, 1);
    if (typeof maxFiles === 'number' && files.length > maxFiles) {
      setNotice(
        maxFiles > 0
          ? `Solo quedan ${maxFiles} ${maxFiles === 1 ? 'cupo' : 'cupos'}: se subirán las primeras ${maxFiles}.`
          : 'No quedan cupos para más fotos.',
      );
      files = files.slice(0, Math.max(0, maxFiles));
    }
    const created = files.map((f) => ({ id: nextId++, name: f.name, phase: 'checking' as Phase, percent: 0 }));
    setItems((prev) => [...prev.filter((it) => it.phase !== 'done'), ...created]);
    files.forEach((f, i) => void processOne(f, created[i]!.id));
  };

  const cancel = (id: number) => {
    controllers.current.get(id)?.abort();
    patch(id, { phase: 'canceled' });
  };

  const dismiss = (id: number) => setItems((prev) => prev.filter((it) => it.id !== id));

  const noSlots = typeof maxFiles === 'number' && maxFiles <= 0;
  const label = buttonLabel ?? (multiple ? 'Subir fotos' : 'Subir foto');

  return (
    <div className="ek-uploader">
      <input
        ref={inputRef}
        id={inputId}
        type="file"
        accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp"
        multiple={multiple}
        hidden
        // Dentro de un <Form> de AntD, su reset pone input[type=file] en display:block.
        style={{ display: 'none' }}
        tabIndex={-1}
        data-testid={`uploader-input-${kind}`}
        onChange={(e) => {
          onFiles(e.target.files);
          // Permite volver a elegir el mismo archivo después de un error.
          e.target.value = '';
        }}
      />
      <Space orientation="vertical" size={8} style={{ width: '100%' }}>
        <Space wrap>
          <Button onClick={() => inputRef.current?.click()} disabled={disabled || noSlots}>
            {label}
          </Button>
          {hint ? (
            <Typography.Text type="secondary" style={{ fontSize: 13 }}>
              {hint}
            </Typography.Text>
          ) : null}
        </Space>
        {notice ? <Alert type="warning" showIcon title={notice} /> : null}
        {items.map((it) => {
          const busy = !['done', 'error', 'canceled'].includes(it.phase);
          return (
            <div key={it.id} role="status" aria-live="polite" style={{ fontSize: 13 }}>
              <Space wrap size={8} style={{ width: '100%', justifyContent: 'space-between' }}>
                <Typography.Text ellipsis style={{ maxWidth: 220 }}>
                  {it.name}
                </Typography.Text>
                <Typography.Text type={it.phase === 'error' ? 'danger' : 'secondary'}>
                  {PHASE_LABEL[it.phase]}
                  {it.phase === 'uploading' ? ` ${it.percent} %` : ''}
                </Typography.Text>
                {busy ? (
                  <Button size="small" onClick={() => cancel(it.id)}>
                    Cancelar
                  </Button>
                ) : it.phase !== 'done' || it.warning ? (
                  <Button size="small" type="text" onClick={() => dismiss(it.id)} aria-label="Cerrar aviso">
                    Cerrar
                  </Button>
                ) : null}
              </Space>
              {it.phase === 'uploading' || it.phase === 'processing' ? (
                <Progress percent={it.percent} size="small" status="active" showInfo={false} />
              ) : null}
              {it.error ? <Alert type="error" showIcon title={it.error} style={{ marginTop: 4 }} /> : null}
              {it.warning && it.phase !== 'error' ? (
                <Alert type="warning" showIcon title={it.warning} style={{ marginTop: 4 }} />
              ) : null}
            </div>
          );
        })}
      </Space>
    </div>
  );
}
