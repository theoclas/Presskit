import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { macflyProfile } from '../src/dev-fixtures/macfly';
import { BookingForm } from '../src/public/dj/BookingForm';

const dj = macflyProfile;

function renderForm() {
  return render(
    <BookingForm
      slug={dj.slug}
      displayName={dj.displayName}
      fields={dj.bookingForm.fields}
      texts={dj.texts}
      consentText={dj.bookingForm.consentText}
      privacyUrl={dj.bookingForm.privacyUrl}
      portalNotice={dj.bookingForm.portalNotice}
      whatsappUrl={dj.whatsapp.bookingUrl}
    />,
  );
}

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

describe('BookingForm', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith('/booking-token')) return jsonResponse(200, { token: 'tok.abc' });
      if (url.endsWith('/booking-requests') && init?.method === 'POST') {
        return jsonResponse(201, { id: 'b1', whatsappUrl: 'https://wa.me/573505209860?text=Hola' });
      }
      return jsonResponse(404, { statusCode: 404, code: 'NOT_FOUND', message: 'No encontrado.' });
    });
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it('pinta los campos del formulario configurado con el tipo de input correcto', () => {
    renderForm();
    const name = screen.getByLabelText(/Nombre y empresa \/ productora/) as HTMLInputElement;
    expect(name.type).toBe('text');
    expect(name.required).toBe(true);
    expect(name.autocomplete).toBe('name');

    const email = screen.getByLabelText(/^Email/) as HTMLInputElement;
    expect(email.type).toBe('email');
    expect(email.required).toBe(true);

    expect((screen.getByLabelText(/Fecha del evento/) as HTMLInputElement).type).toBe('date');
    expect(screen.getByLabelText(/Detalles del evento/).tagName).toBe('TEXTAREA');
    expect((screen.getByLabelText(/Ciudad \/ Lugar evento/) as HTMLInputElement).required).toBe(false);

    // Honeypot fuera de la vista y del orden de tabulación.
    const hp = document.querySelector('input[name="hp_x7"]') as HTMLInputElement;
    expect(hp).toBeTruthy();
    expect(hp.tabIndex).toBe(-1);
    expect(hp.closest('[aria-hidden="true"]')).toBeTruthy();

    // Consentimiento sin marcar y con enlace a la política en otra pestaña.
    const consent = screen.getByRole('checkbox') as HTMLInputElement;
    expect(consent.checked).toBe(false);
    const policy = screen.getByRole('link', { name: 'Política de Tratamiento de Datos Personales' });
    expect(policy.getAttribute('href')).toBe('/privacidad');
    expect(policy.getAttribute('target')).toBe('_blank');

    expect(screen.getByText(dj.bookingForm.portalNotice)).toBeTruthy();

    // Aviso de privacidad breve: responsable, plazo, WhatsApp y canal de derechos.
    const notice = document.querySelector('.privacy-notice') as HTMLElement;
    expect(notice).toBeTruthy();
    expect(notice.textContent).toContain(`solo para entregarla a ${dj.displayName}`);
    expect(notice.textContent).toContain('hasta 12 meses');
    expect(notice.textContent).toContain('WhatsApp (servicio de Meta)');
    expect(screen.getByRole('link', { name: 'PQRS y habeas data' }).getAttribute('href')).toBe('/pqrs');
  });

  it('no envía sin la casilla de autorización', async () => {
    renderForm();
    fireEvent.change(screen.getByLabelText(/Nombre y empresa/), { target: { value: 'Ana Pérez' } });
    fireEvent.change(screen.getByLabelText(/^Email/), { target: { value: 'ana@example.com' } });
    fireEvent.click(screen.getByRole('button', { name: dj.texts.bookingSubmit }));

    expect(await screen.findByText(/Debes autorizar el tratamiento/)).toBeTruthy();
    expect(fetchMock.mock.calls.some(([, init]) => (init as RequestInit | undefined)?.method === 'POST')).toBe(false);
  });

  it('marca los obligatorios vacíos con la validación compartida', async () => {
    renderForm();
    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.click(screen.getByRole('button', { name: dj.texts.bookingSubmit }));
    expect((await screen.findAllByText('Este campo es obligatorio.')).length).toBe(2);
    expect(screen.getByLabelText(/^Email/).getAttribute('aria-invalid')).toBe('true');
    // El foco va al primer campo inválido (eso puede pedir el token), pero nada se envía.
    expect(document.activeElement?.id).toBe('bf-fullName');
    expect(fetchMock.mock.calls.some(([, init]) => (init as RequestInit | undefined)?.method === 'POST')).toBe(false);
  });

  it('con autorización envía, muestra el éxito e intenta abrir WhatsApp', async () => {
    const open = vi.spyOn(window, 'open').mockReturnValue({ opener: {} } as Window);
    renderForm();
    fireEvent.change(screen.getByLabelText(/Nombre y empresa/), { target: { value: 'Ana Pérez' } });
    fireEvent.change(screen.getByLabelText(/^Email/), { target: { value: 'ana@example.com' } });
    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.click(screen.getByRole('button', { name: dj.texts.bookingSubmit }));

    const link = await screen.findByRole('link', { name: 'Abrir WhatsApp' });
    expect(link.getAttribute('href')).toBe('https://wa.me/573505209860?text=Hola');
    expect(open).toHaveBeenCalledWith('https://wa.me/573505209860?text=Hola', '_blank');

    const post = fetchMock.mock.calls.find(([, init]) => (init as RequestInit | undefined)?.method === 'POST');
    expect(post).toBeTruthy();
    const body = JSON.parse(String((post![1] as RequestInit).body));
    expect(body).toEqual({
      fields: { fullName: 'Ana Pérez', email1: 'ana@example.com' },
      consent: true,
      token: 'tok.abc',
    });
  });

  it('si el token expiró pide uno nuevo y avisa que se vuelva a enviar', async () => {
    fetchMock.mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith('/booking-token')) return jsonResponse(200, { token: 'tok.new' });
      if (init?.method === 'POST') {
        return jsonResponse(400, { statusCode: 400, code: 'FORM_EXPIRED', message: 'Expiró.' });
      }
      return jsonResponse(404, {});
    });
    renderForm();
    fireEvent.change(screen.getByLabelText(/Nombre y empresa/), { target: { value: 'Ana' } });
    fireEvent.change(screen.getByLabelText(/^Email/), { target: { value: 'ana@example.com' } });
    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.click(screen.getByRole('button', { name: dj.texts.bookingSubmit }));

    expect(await screen.findByText(/El formulario se renovó/)).toBeTruthy();
    await waitFor(() =>
      expect(fetchMock.mock.calls.filter(([u]) => String(u).endsWith('/booking-token')).length).toBe(2),
    );
  });
});
