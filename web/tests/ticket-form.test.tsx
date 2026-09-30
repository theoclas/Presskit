import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TicketForm } from '../src/public/legal/TicketForm';

// Formulario de PQRS y reportes (M4): pide el token HMAC al entrar en pantalla o al enfocarse,
// lo manda con el envío y, si el servidor lo rechaza, pide otro y avisa que se vuelva a enviar.

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

type Submit = { status: number; body: unknown };

let fetchMock: ReturnType<typeof vi.fn>;
let tokens: number;
let submits: Submit[];
let sent: Record<string, unknown>[];

function fill() {
  fireEvent.change(screen.getByLabelText(/^Nombre/), { target: { value: 'Ana Pérez' } });
  fireEvent.change(screen.getByLabelText(/^Correo/), { target: { value: 'Ana@Example.com' } });
  fireEvent.change(screen.getByLabelText(/^Asunto/), { target: { value: 'Mis datos' } });
  // En /reportar el mensaje se llama «¿Qué contenido quieres reportar y por qué?».
  fireEvent.change(screen.getByLabelText(/^Mensaje|Qué contenido/), { target: { value: 'Quiero saber qué datos tienen.' } });
  fireEvent.click(screen.getByRole('checkbox'));
}

const submitButton = () => screen.getByText('Enviar').closest('button') as HTMLButtonElement;

describe('TicketForm', () => {
  beforeEach(() => {
    tokens = 0;
    submits = [];
    sent = [];
    fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === '/api/public/tickets/token') {
        tokens += 1;
        return jsonResponse(200, { token: `tok.${tokens}` });
      }
      if (url === '/api/public/tickets' && init?.method === 'POST') {
        sent.push(JSON.parse(String(init.body)) as Record<string, unknown>);
        const next = submits.shift() ?? { status: 201, body: { id: 'PQ-7', dueDate: '2026-10-20' } };
        return jsonResponse(next.status, next.body);
      }
      return jsonResponse(404, { statusCode: 404, code: 'NOT_FOUND', message: 'No encontrado.' });
    });
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it('no pide el token hasta que el formulario entra en uso y lo manda con el envío', async () => {
    render(<TicketForm mode="pqrs" />);
    expect(tokens).toBe(0);

    fireEvent.focus(screen.getByLabelText(/^Nombre/));
    await waitFor(() => expect(tokens).toBe(1));

    fill();
    fireEvent.click(submitButton());
    expect(await screen.findByText('PQ-7')).toBeTruthy();
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({ type: 'PQRS_CONSULTA', email: 'ana@example.com', consent: true, token: 'tok.1' });
    // Un solo token: el que ya estaba se reutiliza.
    expect(tokens).toBe(1);
  });

  it('FORM_TOO_FAST: pide esperar y volver a presionar, sin gastar otro token', async () => {
    submits.push({ status: 400, body: { statusCode: 400, code: 'FORM_TOO_FAST', message: 'Espera un momento.' } });
    render(<TicketForm mode="pqrs" />);
    fill();
    fireEvent.click(submitButton());
    expect(await screen.findByText('Espera un segundo y vuelve a presionar «Enviar».')).toBeTruthy();
    expect(tokens).toBe(1);

    fireEvent.click(submitButton());
    expect(await screen.findByText('PQ-7')).toBeTruthy();
    expect(sent.map((b) => b.token)).toEqual(['tok.1', 'tok.1']);
  });

  it.each(['FORM_EXPIRED', 'FORM_TOKEN_USED'])('%s: renueva el token y pide volver a presionar', async (code) => {
    submits.push({ status: 400, body: { statusCode: 400, code, message: 'x' } });
    render(<TicketForm mode="report" initialSlug="macfly-mike-bran" />);
    fill();
    fireEvent.click(submitButton());

    const alert = await screen.findByText('El formulario se renovó. Vuelve a presionar «Enviar».');
    // Aviso informativo (no de error) y los datos siguen en el formulario.
    expect(alert.className).toContain('form-alert--info');
    expect((screen.getByLabelText(/^Nombre/) as HTMLInputElement).value).toBe('Ana Pérez');
    await waitFor(() => expect(tokens).toBe(2));

    fireEvent.click(submitButton());
    expect(await screen.findByText('PQ-7')).toBeTruthy();
    expect(sent.map((b) => b.token)).toEqual(['tok.1', 'tok.2']);
    expect(sent[1]).toMatchObject({ type: 'REPORTE_PERFIL', profileSlug: 'macfly-mike-bran' });
  });
});
