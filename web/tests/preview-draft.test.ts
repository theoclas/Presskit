import { describe, expect, it } from 'vitest';
import { macflyProfile } from '../src/dev-fixtures/macfly';
import { applyDraft, filledTexts, GROUP_TARGETS, scrollToGroup, type PreviewDraft } from '../src/lib/previewDraft';

const draft = (overrides: Partial<PreviewDraft> = {}): PreviewDraft => ({
  displayName: 'Mike Bran & Macfly',
  city: 'Medellín',
  template: 'SIGNAL',
  palette: 'SIGNAL',
  monoPhotos: false,
  texts: { heroTitle: 'Club show en vivo' },
  ...overrides,
});

describe('vista previa en vivo: borrador sobre lo guardado', () => {
  it('solo pasan los textos con contenido (un vacío vuelve al valor por defecto)', () => {
    expect(filledTexts({ heroTitle: '  Hola ', heroLabel: '', navTag: '   ', footerText: undefined })).toEqual({ heroTitle: 'Hola' });
  });

  it('aplica nombre, ciudad, plantilla, paleta, fotos y textos; lo demás queda como estaba', () => {
    const out = applyDraft(macflyProfile, draft());
    expect(out.template).toBe('SIGNAL');
    expect(out.palette).toBe('SIGNAL');
    expect(out.monoPhotos).toBe(false);
    expect(out.texts.heroTitle).toBe('Club show en vivo');
    // Un texto que el borrador no trae toma su valor por defecto, como al guardar.
    expect(out.texts.navEvents).toBe('Fechas');
    expect(out.gallery).toBe(macflyProfile.gallery);
    expect(out.events).toBe(macflyProfile.events);
  });

  it('un nombre vacío no deja la página sin nombre; una ciudad vacía queda en null', () => {
    const out = applyDraft(macflyProfile, draft({ displayName: '  ', city: ' ' }));
    expect(out.displayName).toBe(macflyProfile.displayName);
    expect(out.city).toBeNull();
    expect(out.texts.footerText).toBe(`${macflyProfile.displayName} — Booking`);
  });

  it('sin borrador devuelve la página guardada tal cual', () => {
    expect(applyDraft(macflyProfile, null)).toBe(macflyProfile);
  });

  it('cada grupo de textos sabe a qué sección bajar; el menú, arriba del todo', () => {
    document.body.innerHTML = '<header id="intro"></header><section id="fechas"></section>';
    const fechas = document.getElementById('fechas')!;
    let scrolled = false;
    fechas.scrollIntoView = () => {
      scrolled = true;
    };
    scrollToGroup(document, 'events');
    expect(scrolled).toBe(true);
    expect(GROUP_TARGETS.nav).toEqual([]);
    document.body.innerHTML = '';
  });
});
