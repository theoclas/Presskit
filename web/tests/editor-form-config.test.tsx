import type { FormFieldConfig } from '@fersua/shared';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { cleanFormConfig, FormConfigEditor, formConfigIssues } from '../src/editor-kit/FormConfigEditor';

beforeAll(() => {
  // AntD (Grid/Row) usa matchMedia, que jsdom no trae.
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

const CONTACT_MSG = /Activa «Email» o «Teléfono \/ WhatsApp» y márcalo como obligatorio/;

describe('FormConfigEditor', () => {
  it('mantiene el nombre bloqueado: no se puede quitar ni volver opcional', () => {
    const value: FormFieldConfig[] = [
      { key: 'fullName', required: true },
      { key: 'email1', required: true },
    ];
    render(<FormConfigEditor value={value} onChange={vi.fn()} />);

    const remove = screen.getByRole('button', { name: 'Quitar Nombre completo' });
    expect((remove as HTMLButtonElement).disabled).toBe(true);

    const required = screen.getByRole('switch', { name: 'Nombre completo obligatorio' });
    expect(required.getAttribute('aria-checked')).toBe('true');
    expect((required as HTMLButtonElement).disabled).toBe(true);

    expect(screen.getByText('Siempre activo')).toBeTruthy();
    expect(screen.queryByText(CONTACT_MSG)).toBeNull();
  });

  it('marca CONTACT_REQUIRED cuando ni el email ni el teléfono son obligatorios', () => {
    const onChange = vi.fn();
    const value: FormFieldConfig[] = [
      { key: 'fullName', required: true },
      { key: 'email1', required: false },
    ];
    const { rerender } = render(<FormConfigEditor value={value} onChange={onChange} />);
    expect(screen.getByText(CONTACT_MSG)).toBeTruthy();

    // Al volver obligatorio el email, la regla se cumple.
    fireEvent.click(screen.getByRole('switch', { name: 'Email obligatorio' }));
    const next = onChange.mock.calls[0]![0] as FormFieldConfig[];
    expect(next.find((f) => f.key === 'email1')?.required).toBe(true);
    rerender(<FormConfigEditor value={next} onChange={onChange} />);
    expect(screen.queryByText(CONTACT_MSG)).toBeNull();
  });

  it('avisa si falta el nombre y deshabilita en el catálogo los campos ya usados', () => {
    const value: FormFieldConfig[] = [{ key: 'email1', required: true }];
    render(<FormConfigEditor value={value} onChange={vi.fn()} />);
    expect(screen.getByText(/El nombre siempre debe estar en el formulario/)).toBeTruthy();
    const used = screen.getByRole('button', { name: 'Email (ya está en el formulario)' });
    expect((used as HTMLButtonElement).disabled).toBe(true);
    const free = screen.getByRole('button', { name: 'Agregar Nombre completo' });
    expect((free as HTMLButtonElement).disabled).toBe(false);
  });

  it('rechaza etiquetas que piden datos de pago o documentos', () => {
    const value: FormFieldConfig[] = [
      { key: 'fullName', required: true },
      { key: 'email1', required: true, label: 'Número de tarjeta' },
    ];
    render(<FormConfigEditor value={value} onChange={vi.fn()} />);
    expect(screen.getByText(/no puede pedir datos de pago, claves ni documentos/)).toBeTruthy();
  });

  it('agregar un campo del catálogo lo suma al final, opcional', () => {
    const onChange = vi.fn();
    render(
      <FormConfigEditor
        value={[
          { key: 'fullName', required: true },
          { key: 'email1', required: true },
        ]}
        onChange={onChange}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Agregar Teléfono / WhatsApp' }));
    const next = onChange.mock.calls[0]![0] as FormFieldConfig[];
    expect(next.map((f) => f.key)).toEqual(['fullName', 'email1', 'phone1']);
    expect(next[2]!.required).toBe(false);
  });

  it('cleanFormConfig fuerza el nombre obligatorio y limpia etiquetas vacías', () => {
    const out = cleanFormConfig([
      { key: 'fullName', required: false, label: '  ' },
      { key: 'phone1', required: true, label: ' WhatsApp ', placeholder: '' },
    ]);
    expect(out).toEqual([
      { key: 'fullName', required: true, label: null, placeholder: null },
      { key: 'phone1', required: true, label: 'WhatsApp', placeholder: null },
    ]);
    expect(formConfigIssues(out)).toEqual([]);
  });
});
