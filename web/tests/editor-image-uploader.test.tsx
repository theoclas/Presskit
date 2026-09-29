import type { MediaAssetDto } from '@fersua/shared';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { ImageUploader, type UploadFn } from '../src/editor-kit/ImageUploader';
import { fitWithin, precheckImage, RAW_MAX_BYTES, sniffImageType } from '../src/editor-kit/imagePipeline';
import { EditorScopeProvider } from '../src/editor-kit/scope';
import { createQueue } from '../src/editor-kit/uploadQueue';

beforeAll(() => {
  // Typography con ellipsis mide con ResizeObserver, que jsdom no trae.
  if (typeof globalThis.ResizeObserver === 'undefined') {
    globalThis.ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    } as unknown as typeof ResizeObserver;
  }
  if (!window.matchMedia) {
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: (query: string) => ({
        matches: false,
        media: query,
        onchange: null,
        addListener: () => undefined,
        removeListener: () => undefined,
        addEventListener: () => undefined,
        removeEventListener: () => undefined,
        dispatchEvent: () => false,
      }),
    });
  }
});

// AntD deja timers cortos (errores del Form, botones): se dejan correr antes de desmontar el entorno.
afterEach(async () => {
  cleanup();
  await new Promise((r) => setTimeout(r, 30));
});

const JPEG_HEAD = [0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46, 0x49, 0x46, 0, 1];
const HEIC_HEAD = [0, 0, 0, 0x18, ...Array.from('ftypheic', (c) => c.charCodeAt(0))];

function file(name: string, type: string, head: number[], size?: number): File {
  const f = new File([new Uint8Array([...head, ...new Array(64).fill(0)])], name, { type });
  if (size !== undefined) Object.defineProperty(f, 'size', { value: size });
  return f;
}

const asset: MediaAssetDto = {
  id: 'ckasset0000000000000001',
  width: 1200,
  height: 800,
  variants: [{ w: 480, h: 320, url: '/media/p/a/480.webp' }],
  kind: 'GALLERY',
  isPublic: false,
  bytesTotal: 1000,
  createdAt: '2026-09-29T12:00:00.000Z',
};

function renderUploader(upload: UploadFn, onUploaded = vi.fn(), props: { multiple?: boolean; maxFiles?: number } = {}) {
  render(
    <EditorScopeProvider base="/admin/profiles/abc" actor="admin">
      <ImageUploader kind="GALLERY" upload={upload} onUploaded={onUploaded} {...props} />
    </EditorScopeProvider>,
  );
  return screen.getByTestId('uploader-input-GALLERY') as HTMLInputElement;
}

describe('precheckImage / sniffImageType', () => {
  it('detecta HEIC por tipo o por extensión', () => {
    expect(precheckImage({ name: 'IMG_0001.HEIC', type: 'image/heic', size: 1000 })).toBe('HEIC');
    expect(precheckImage({ name: 'foto.heif', type: '', size: 1000 })).toBe('HEIC');
  });

  it('rechaza otros formatos y los archivos de más de 40 MB', () => {
    expect(precheckImage({ name: 'a.gif', type: 'image/gif', size: 1000 })).toBe('TYPE');
    expect(precheckImage({ name: 'a.svg', type: 'image/svg+xml', size: 1000 })).toBe('TYPE');
    expect(precheckImage({ name: 'a.jpg', type: 'image/jpeg', size: RAW_MAX_BYTES + 1 })).toBe('TOO_LARGE_RAW');
    expect(precheckImage({ name: 'a.jpg', type: 'image/jpeg', size: RAW_MAX_BYTES })).toBeNull();
  });

  it('lee el tipo real en los primeros bytes', () => {
    expect(sniffImageType(new Uint8Array(JPEG_HEAD))).toBe('jpeg');
    expect(sniffImageType(new Uint8Array(HEIC_HEAD))).toBe('heic');
    expect(sniffImageType(new Uint8Array([0x3c, 0x73, 0x76, 0x67]))).toBeNull();
  });

  it('reduce sin agrandar nunca', () => {
    expect(fitWithin(5120, 2880, 2560)).toEqual({ width: 2560, height: 1440 });
    expect(fitWithin(800, 600, 2560)).toEqual({ width: 800, height: 600 });
  });
});

describe('ImageUploader', () => {
  it('rechaza una foto HEIC con el mensaje de exportar a JPG, sin subirla', async () => {
    const upload = vi.fn<UploadFn>();
    const input = renderUploader(upload);
    fireEvent.change(input, { target: { files: [file('IMG_0001.HEIC', 'image/heic', HEIC_HEAD)] } });
    expect(await screen.findByText(/Exporta la foto como JPG/)).toBeTruthy();
    expect(upload).not.toHaveBeenCalled();
  });

  it('descubre un HEIC renombrado a .jpg por sus bytes', async () => {
    const upload = vi.fn<UploadFn>();
    const input = renderUploader(upload);
    fireEvent.change(input, { target: { files: [file('foto.jpg', 'image/jpeg', HEIC_HEAD)] } });
    expect(await screen.findByText(/Exporta la foto como JPG/)).toBeTruthy();
    expect(upload).not.toHaveBeenCalled();
  });

  it('rechaza un archivo de más de 40 MB antes de leerlo', async () => {
    const upload = vi.fn<UploadFn>();
    const input = renderUploader(upload);
    fireEvent.change(input, { target: { files: [file('grande.jpg', 'image/jpeg', JPEG_HEAD, RAW_MAX_BYTES + 1)] } });
    expect(await screen.findByText(/pesa más de 40 MB/)).toBeTruthy();
    expect(upload).not.toHaveBeenCalled();
  });

  it('sube una foto válida y se la pasa al padre para asociarla', async () => {
    const upload = vi.fn<UploadFn>(async () => asset);
    const onUploaded = vi.fn();
    const input = renderUploader(upload, onUploaded);
    fireEvent.change(input, { target: { files: [file('ok.jpg', 'image/jpeg', JPEG_HEAD)] } });
    await waitFor(() => expect(onUploaded).toHaveBeenCalledWith(asset));
    expect(upload).toHaveBeenCalledTimes(1);
    expect(upload.mock.calls[0]![1]).toBe('GALLERY');
  });

  it('con varias fotos respeta los cupos libres', async () => {
    const upload = vi.fn<UploadFn>(async () => asset);
    const input = renderUploader(upload, vi.fn(), { multiple: true, maxFiles: 1 });
    fireEvent.change(input, {
      target: { files: [file('a.jpg', 'image/jpeg', JPEG_HEAD), file('b.jpg', 'image/jpeg', JPEG_HEAD)] },
    });
    expect(await screen.findByText(/Solo quedan 1 cupo: se subirán las primeras 1/)).toBeTruthy();
    await waitFor(() => expect(upload).toHaveBeenCalledTimes(1));
  });

  it('muestra el error del api (cuota llena) en la foto', async () => {
    const upload = vi.fn<UploadFn>(async () => {
      throw Object.assign(new Error('409'), {
        isAxiosError: true,
        response: { status: 409, data: { statusCode: 409, code: 'QUOTA_EXCEEDED', message: 'x' } },
      });
    });
    const input = renderUploader(upload);
    fireEvent.change(input, { target: { files: [file('ok.jpg', 'image/jpeg', JPEG_HEAD)] } });
    expect(await screen.findByText(/Llegaste al límite de fotos/)).toBeTruthy();
  });
});

describe('createQueue', () => {
  it('no corre más de N tareas a la vez', async () => {
    const run = createQueue(2);
    let active = 0;
    let peak = 0;
    const task = () =>
      run(async () => {
        active++;
        peak = Math.max(peak, active);
        await new Promise((r) => setTimeout(r, 5));
        active--;
      });
    await Promise.all([task(), task(), task(), task(), task()]);
    expect(peak).toBe(2);
  });

  it('una tarea cancelada en la cola no se ejecuta', async () => {
    const run = createQueue(1);
    let release: () => void = () => undefined;
    const first = run(() => new Promise<void>((r) => (release = r)));
    const ctrl = new AbortController();
    const spy = vi.fn(async () => undefined);
    const second = run(spy, ctrl.signal);
    ctrl.abort();
    await expect(second).rejects.toThrow(/cancel/i);
    release();
    await first;
    expect(spy).not.toHaveBeenCalled();
  });
});
