import type { PublicDjProfileDto, TextGroup } from '@fersua/shared';
import { useQuery } from '@tanstack/react-query';
import { Alert, Segmented, Spin, Typography } from 'antd';
import { useEffect, useRef, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { applyPaletteTo } from '../lib/palette';
import { applyDraft, scrollToGroup, type PreviewDraft } from '../lib/previewDraft';
import { DjPublicView } from '../public/dj/DjPublicView';
import { TemplateEnvContext } from '../public/dj/templateEnv';
import { describeError, http } from './api';
import { editorKeys, useEditorScope } from './scope';

type Device = 'desktop' | 'mobile';

const DEVICE_WIDTH: Record<Device, number> = { desktop: 1280, mobile: 390 };

/** Documento vacío del iframe: la página se dibuja desde el editor (sin cargar ninguna URL). */
const SRC_DOC =
  '<!doctype html><html lang="es-CO" data-surface="public"><head><meta charset="utf-8">' +
  '<meta name="viewport" content="width=device-width, initial-scale=1"></head><body></body></html>';

interface Props {
  draft: PreviewDraft;
  /** El grupo de textos que se está editando: la vista previa baja hasta su sección. */
  focusGroup: TextGroup | null;
  /** Alto del recuadro en px. */
  height?: number;
  defaultDevice?: Device;
}

/**
 * Vista previa en vivo: la página real del DJ, con lo que el editor tiene sin guardar, dibujada en
 * un iframe propio (srcdoc). El iframe da su propio ancho a las media queries (escritorio o
 * teléfono) y aísla el CSS; no carga ninguna URL, así no depende de que el sitio permita
 * enmarcarse. Las fotos, fechas y demás salen de la vista previa guardada (/preview del editor).
 */
export function LivePreview({ draft, focusGroup, height = 560, defaultDevice = 'desktop' }: Props) {
  const { base } = useEditorScope();
  const query = useQuery({
    queryKey: [...editorKeys.all(base), 'preview'],
    queryFn: async ({ signal }) => (await http.get<PublicDjProfileDto>(`${base}/preview`, { signal })).data,
    staleTime: 30_000,
  });

  const frameRef = useRef<HTMLIFrameElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const rootRef = useRef<Root | null>(null);
  const observerRef = useRef<MutationObserver | null>(null);
  const [doc, setDoc] = useState<Document | null>(null);
  const [device, setDevice] = useState<Device>(defaultDevice);
  const [boxWidth, setBoxWidth] = useState(0);

  // Prepara el documento del iframe: copia las hojas de estilo del editor (y las que lleguen
  // después, p. ej. el CSS de una plantilla que se carga al elegirla) y monta una raíz de React.
  const onLoad = () => {
    const frameDoc = frameRef.current?.contentDocument;
    if (!frameDoc || rootRef.current) return;
    const copy = (node: Node) => {
      if (node instanceof HTMLStyleElement || (node instanceof HTMLLinkElement && node.rel === 'stylesheet')) {
        frameDoc.head.appendChild(node.cloneNode(true));
      }
    };
    document.head.querySelectorAll('style, link[rel="stylesheet"]').forEach(copy);
    const observer = new MutationObserver((records) => records.forEach((r) => r.addedNodes.forEach(copy)));
    observer.observe(document.head, { childList: true });
    frameDoc.body.style.margin = '0';
    const mount = frameDoc.createElement('div');
    frameDoc.body.appendChild(mount);
    rootRef.current = createRoot(mount);
    observerRef.current = observer;
    setDoc(frameDoc);
  };

  useEffect(() => {
    return () => {
      const root = rootRef.current;
      rootRef.current = null;
      observerRef.current?.disconnect();
      // Desmontar después del render en curso (React no deja desmontar una raíz durante otro).
      if (root) setTimeout(() => root.unmount(), 0);
    };
  }, []);

  // Dibuja la página con el borrador cada vez que cambia algo.
  const dj = query.data ? applyDraft(query.data, draft) : null;
  useEffect(() => {
    if (!doc || !rootRef.current || !dj) return;
    applyPaletteTo(doc.documentElement, dj.palette);
    const win = doc.defaultView;
    if (!win) return;
    rootRef.current.render(
      <TemplateEnvContext.Provider value={{ win, doc }}>
        <DjPublicView dj={dj} mode="preview" />
      </TemplateEnvContext.Provider>,
    );
  });

  // Baja hasta la sección del texto que se está editando.
  useEffect(() => {
    if (!doc || !focusGroup) return;
    const t = setTimeout(() => scrollToGroup(doc, focusGroup), 60);
    return () => clearTimeout(t);
  }, [doc, focusGroup, device]);

  // El ancho disponible define la escala del iframe.
  useEffect(() => {
    const box = boxRef.current;
    if (!box || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(([entry]) => setBoxWidth(entry?.contentRect.width ?? 0));
    ro.observe(box);
    return () => ro.disconnect();
  }, []);

  const vw = DEVICE_WIDTH[device];
  const scale = boxWidth ? Math.min(1, boxWidth / vw) : 0.3;
  return (
    <div className="live-preview">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 8 }}>
        <Typography.Text strong>Vista previa en vivo</Typography.Text>
        <Segmented<Device>
          size="small"
          value={device}
          onChange={setDevice}
          options={[
            { label: 'Escritorio', value: 'desktop' },
            { label: 'Celular', value: 'mobile' },
          ]}
        />
      </div>
      <div
        ref={boxRef}
        style={{
          position: 'relative',
          height,
          overflow: 'hidden',
          borderRadius: 10,
          border: '1px solid rgba(148,163,184,.35)',
          background: '#020617',
        }}
      >
        {query.isPending ? (
          <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center' }}>
            <Spin />
          </div>
        ) : null}
        {query.isError ? <Alert type="error" showIcon title={describeError(query.error).message} style={{ margin: 12 }} /> : null}
        <div style={{ width: vw * scale, height, margin: '0 auto', overflow: 'hidden' }}>
          <iframe
            ref={frameRef}
            title="Vista previa en vivo de la página"
            srcDoc={SRC_DOC}
            onLoad={onLoad}
            tabIndex={-1}
            style={{
              display: 'block',
              width: vw,
              height: height / scale,
              border: 0,
              transform: `scale(${scale})`,
              transformOrigin: '0 0',
            }}
          />
        </div>
      </div>
      <Typography.Paragraph type="secondary" style={{ margin: '6px 0 0', fontSize: 12 }}>
        Muestra tus cambios antes de guardar. Se ubica sola en la sección del texto que estás editando.
      </Typography.Paragraph>
    </div>
  );
}
