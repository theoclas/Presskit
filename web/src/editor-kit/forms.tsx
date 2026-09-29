import { Form, type FormInstance, type FormRule as Rule } from 'antd';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useUnsavedChanges } from './unsaved';

/** Largo en caracteres visibles (un emoji cuenta 1), igual que el api. */
export function charCount(value: unknown): number {
  return typeof value === 'string' ? [...value].length : 0;
}

/** Contador n/max de AntD con el mismo conteo del api. */
export function countConfig(max: number) {
  return { show: true, max, strategy: (txt: string) => [...txt].length };
}

export function maxChars(max: number): Rule {
  return {
    validator: (_r, value: unknown) =>
      charCount(typeof value === 'string' ? value.trim() : value) > max
        ? Promise.reject(new Error(`Máximo ${max} caracteres.`))
        : Promise.resolve(),
  };
}

export function requiredText(message = 'Este campo es obligatorio.'): Rule {
  return { required: true, whitespace: true, message };
}

/** '' → null para los campos opcionales del api. */
export function nullIfEmpty(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const t = value.trim();
  return t ? t : null;
}

/**
 * Formulario AntD sincronizado con datos del servidor:
 * - Mientras no haya cambios, toma cada versión nueva de `initial` (p. ej. tras otro guardado).
 * - Con cambios sin guardar no pisa lo que el usuario escribió y bloquea la navegación.
 * El <Form> debe recibir `initialValues={initial}` y `onValuesChange={onValuesChange}`.
 */
export function useSyncedForm<T extends object>(initial: T | null | undefined) {
  const [form] = Form.useForm<T>();
  const [dirty, setDirty] = useState(false);
  const dirtyRef = useRef(false);
  const forceReset = useRef(false);

  useEffect(() => {
    if (!initial) return;
    if (dirtyRef.current && !forceReset.current) return;
    forceReset.current = false;
    form.resetFields();
    dirtyRef.current = false;
    setDirty(false);
  }, [initial, form]);

  useUnsavedChanges(dirty);

  const onValuesChange = useCallback(() => {
    const touched = form.isFieldsTouched();
    dirtyRef.current = touched;
    setDirty(touched);
  }, [form]);

  /** Tras guardar: el próximo `initial` que llegue reemplaza lo del formulario. */
  const markSaved = useCallback(() => {
    forceReset.current = true;
    dirtyRef.current = false;
    setDirty(false);
  }, []);

  /** Descarta los cambios y vuelve a lo guardado. */
  const discard = useCallback(() => {
    form.resetFields();
    dirtyRef.current = false;
    setDirty(false);
  }, [form]);

  return { form: form as FormInstance<T>, dirty, onValuesChange, markSaved, discard };
}

/** Aplica los errores de campo del api (details: { campo: código }) al formulario. */
export function applyFieldErrors(
  form: FormInstance,
  details: Record<string, string> | undefined,
  messages: Record<string, string> = {},
  mapName: (key: string) => (string | number)[] = (k) => k.split('.'),
): boolean {
  if (!details) return false;
  const fields = Object.entries(details).map(([key, code]) => ({
    name: mapName(key),
    errors: [messages[code] ?? 'Revisa este campo.'],
  }));
  if (!fields.length) return false;
  try {
    form.setFields(fields as Parameters<FormInstance['setFields']>[0]);
  } catch {
    return false;
  }
  return true;
}
