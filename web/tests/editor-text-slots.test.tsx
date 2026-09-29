import { getTextSlot, PAGE_TEXT_SLOTS, type EditorProfileDto, type TextSlot } from '@fersua/shared';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { Form } from 'antd';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { charCount } from '../src/editor-kit/forms';
import {
  buildProfilePatch,
  buildTextsPatch,
  profileFormValues,
  type ProfileFormValues,
} from '../src/editor-kit/sections/ProfileSection';
import { TextSlotField, textSlotProblem } from '../src/editor-kit/TextSlotField';

beforeAll(() => {
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

const slot = (key: string) => getTextSlot(key) as TextSlot;

function profile(overrides: Partial<EditorProfileDto> = {}): EditorProfileDto {
  return {
    id: 'p1',
    slug: 'macfly-mike-bran',
    status: 'APPROVED',
    statusReason: null,
    displayName: 'Mac Fly & Mike Bran',
    tagline: null,
    seoDescription: null,
    city: 'Medellín',
    whatsappNumber: '573505209860',
    publicEmail: null,
    publicPhone: null,
    palette: 'SUNSET',
    texts: { heroTitle: 'Club show' },
    bookingForm: [],
    show: { gallery: true, rider: true, events: true, openDateRow: true, form: true },
    formOpenWhatsapp: true,
    notifyByEmail: false,
    heroImage: null,
    cardImage: null,
    genres: [],
    socials: [],
    members: [],
    gallery: [],
    riderItems: [],
    featured: false,
    featuredRank: 0,
    owner: null,
    hasLegalInfo: false,
    publishMissing: [],
    usage: { assets: 0, bytes: 0, maxAssets: 100, maxBytes: 100 },
    submittedAt: null,
    approvedAt: null,
    updatedAt: '2026-09-29T12:00:00.000Z',
    ...overrides,
  };
}

describe('límites de los textos', () => {
  it('cuenta caracteres visibles (un emoji es 1), igual que el api', () => {
    expect(charCount('🎧🎧')).toBe(2);
    expect(textSlotProblem(slot('navTag'), '🎧'.repeat(20))).toBeNull();
    expect(textSlotProblem(slot('navTag'), 'x'.repeat(21))).toBe('Máximo 20 caracteres.');
  });

  it('ignora espacios al borde para el tope (el api recorta)', () => {
    expect(textSlotProblem(slot('navTag'), `  ${'x'.repeat(20)}  `)).toBeNull();
  });

  it('solo acepta las variables permitidas de cada texto', () => {
    const msg = slot('eventWhatsappMessage');
    expect(textSlotProblem(msg, 'Hola, voy a {evento} el {fecha}')).toBeNull();
    expect(textSlotProblem(msg, 'Hola {nombre}')).toBe('Solo puedes usar {evento} y {fecha} entre llaves.');
    expect(textSlotProblem(slot('heroTitle'), 'Show {evento}')).toBe('Este texto no admite variables entre llaves.');
  });

  it('todos los textos del catálogo tienen un tope positivo', () => {
    for (const s of PAGE_TEXT_SLOTS) expect(s.max).toBeGreaterThan(0);
  });
});

describe('parche de textos', () => {
  it('los textos sin guardar se muestran con su valor por defecto', () => {
    const values = profileFormValues(profile());
    expect(values.texts.heroTitle).toBe('Club show');
    expect(values.texts.navTag).toBe('Booking');
    expect(values.texts.heroSubtitle).toBe('');
  });

  it('envía solo lo que cambió, y volver al valor por defecto se envía como vacío', () => {
    const initial = profileFormValues(profile());
    const texts = { ...initial.texts, heroTitle: 'Electronic club show', navTag: 'Reservas', eventsTitle: 'Fechas' };
    expect(buildTextsPatch(initial.texts, texts)).toEqual({ heroTitle: '', navTag: 'Reservas' });
  });

  it('el parche del perfil nunca lleva campos sin cambios y normaliza el WhatsApp', () => {
    const initial = profileFormValues(profile());
    const values: ProfileFormValues = {
      ...initial,
      whatsappNumber: '+57 350 520 9860',
      tagline: '  ',
      city: 'Bogotá',
      show: { ...initial.show, rider: false },
    };
    expect(buildProfilePatch(initial, values)).toEqual({ city: 'Bogotá', show: { rider: false } });
    expect(buildProfilePatch(initial, { ...values, whatsappNumber: '57 300 111 2222' }).whatsappNumber).toBe('573001112222');
  });
});

function SlotHarness({ slotKey, initial }: { slotKey: string; initial: string }) {
  const [form] = Form.useForm();
  return (
    <Form form={form} initialValues={{ texts: { [slotKey]: initial } }}>
      <TextSlotField slot={slot(slotKey)} form={form} />
    </Form>
  );
}

describe('TextSlotField', () => {
  it('muestra el contador n/máx', () => {
    render(<SlotHarness slotKey="navTag" initial="Hola" />);
    expect(screen.getByText('4 / 20')).toBeTruthy();
  });

  it('«Restaurar valor por defecto» vuelve al texto original', async () => {
    render(<SlotHarness slotKey="navTag" initial="Reservas" />);
    const input = screen.getByDisplayValue('Reservas') as HTMLInputElement;
    fireEvent.click(screen.getByRole('button', { name: 'Restaurar valor por defecto de «Etiqueta junto al nombre»' }));
    await waitFor(() => expect(input.value).toBe('Booking'));
    expect(screen.queryByRole('button', { name: /Restaurar valor por defecto/ })).toBeNull();
  });

  it('marca el error cuando se pasa del tope', async () => {
    render(<SlotHarness slotKey="navTag" initial="" />);
    const input = screen.getByPlaceholderText('Booking');
    fireEvent.change(input, { target: { value: 'x'.repeat(25) } });
    expect(await screen.findByText('Máximo 20 caracteres.')).toBeTruthy();
  });
});
