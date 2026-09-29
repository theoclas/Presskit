import { LIMITS, type StepUpDto } from '@fersua/shared';
import { Alert, Form, Input, Modal, Typography } from 'antd';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { apiError, getSessionUser, http, onSessionEvent } from '../lib/http';

// Confirmación reciente (contraseña + código TOTP) para las acciones destructivas del admin.
// El token vale 5 minutos; se guarda solo en memoria y se reutiliza hasta 30 s antes de vencer,
// así borrar varias cosas seguidas no pide el código cada vez.
//
// Uso:
//   const stepUp = useStepUp();
//   const t = await stepUp(); if (!t) return;
//   await http.delete(url, { headers: stepUpHeaders(t), data });

const REUSE_MARGIN_MS = 30_000;

let cached: { token: string; expiresAt: number; userId: string | null } | null = null;

// Al cerrar sesión o cambiar de usuario el token deja de servir.
onSessionEvent((e) => {
  if (e.type === 'cleared') {
    cached = null;
  } else {
    const id = e.type === 'session' ? e.session.user.id : e.user.id;
    if (cached && cached.userId !== id) cached = null;
  }
});

/** Olvida el token (p. ej. si el api lo rechazó con STEP_UP_REQUIRED y hay que pedirlo de nuevo). */
export function invalidateStepUp(): void {
  cached = null;
}

function cachedToken(): string | null {
  if (!cached) return null;
  if (cached.expiresAt - Date.now() <= REUSE_MARGIN_MS) {
    cached = null;
    return null;
  }
  return cached.token;
}

type StepUpFn = () => Promise<string | null>;

const StepUpContext = createContext<StepUpFn | null>(null);

/** Monta el diálogo de confirmación. Va una sola vez en la raíz del admin. */
export function StepUpProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const pending = useRef<{ promise: Promise<string | null>; resolve: (t: string | null) => void } | null>(null);

  const request = useCallback<StepUpFn>(() => {
    const t = cachedToken();
    if (t) return Promise.resolve(t);
    // Dos acciones a la vez comparten el mismo diálogo.
    if (pending.current) return pending.current.promise;
    let resolve: (t: string | null) => void = () => {};
    const promise = new Promise<string | null>((r) => {
      resolve = r;
    });
    pending.current = { promise, resolve };
    setOpen(true);
    return promise;
  }, []);

  const finish = useCallback((token: string | null) => {
    const p = pending.current;
    pending.current = null;
    setOpen(false);
    p?.resolve(token);
  }, []);

  // Si el admin sale de la sección con el diálogo abierto, la acción queda cancelada.
  useEffect(
    () => () => {
      pending.current?.resolve(null);
      pending.current = null;
    },
    [],
  );

  return (
    <StepUpContext.Provider value={request}>
      {children}
      {open ? <StepUpDialog onDone={finish} /> : null}
    </StepUpContext.Provider>
  );
}

export function useStepUp(): StepUpFn {
  const fn = useContext(StepUpContext);
  if (!fn) throw new Error('useStepUp() necesita <StepUpProvider> (va en la raíz del admin).');
  return fn;
}

interface Values {
  password: string;
  code: string;
}

function stepUpErrorMessage(e: unknown): string {
  const err = apiError(e);
  if (err.code === 'RATE_LIMITED' || err.statusCode === 429) {
    return 'Demasiados intentos. Espera unos minutos antes de volver a intentarlo.';
  }
  if (err.code === 'NETWORK') return err.message;
  // 409: otra confirmación del mismo admin en curso (doble clic). No es una contraseña mala.
  if (err.code === 'AUTH_IN_PROGRESS') return 'Estamos revisando otra confirmación. Espera un momento y vuelve a intentarlo.';
  // El api responde 403 STEP_UP_INVALID (o 400 si el código no tiene 6 dígitos).
  if (err.code === 'STEP_UP_INVALID' || err.code === 'INVALID_CREDENTIALS' || err.statusCode === 403 || err.statusCode === 400) {
    return 'La contraseña o el código no son correctos.';
  }
  // Un 401 solo llega si el refresh también falló (lib/http ya manda al login).
  if (err.statusCode === 401) return 'Tu sesión expiró. Ingresa de nuevo.';
  return err.message;
}

function StepUpDialog({ onDone }: { onDone: (token: string | null) => void }) {
  const [form] = Form.useForm<Values>();
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = useCallback(
    async (values: Values) => {
      if (sending) return;
      setSending(true);
      setError(null);
      try {
        const { data } = await http.post<StepUpDto>('/auth/step-up', {
          password: values.password,
          code: values.code.replace(/\s+/g, ''),
        });
        const expiresIn = typeof data.expiresIn === 'number' && data.expiresIn > 0 ? data.expiresIn : 300;
        cached = { token: data.stepUpToken, expiresAt: Date.now() + expiresIn * 1000, userId: getSessionUser()?.id ?? null };
        form.resetFields();
        onDone(data.stepUpToken);
      } catch (e) {
        // La contraseña no se queda en el formulario tras un intento fallido.
        form.setFieldsValue({ password: '', code: '' });
        setError(stepUpErrorMessage(e));
        setSending(false);
      }
    },
    [form, onDone, sending],
  );

  const codeRules = useMemo(
    () => [
      { required: true, message: 'Escribe el código de 6 dígitos.' },
      { pattern: /^\d{6}$/, message: 'El código tiene 6 dígitos.' },
    ],
    [],
  );

  return (
    <Modal
      open
      title="Confirma que eres tú"
      okText="Confirmar"
      cancelText="Cancelar"
      confirmLoading={sending}
      onOk={() => form.submit()}
      onCancel={() => {
        form.resetFields();
        onDone(null);
      }}
      mask={{ closable: false }}
      destroyOnHidden
    >
      <Typography.Paragraph type="secondary">
        Es una acción delicada. Por seguridad, escribe tu contraseña y el código de tu app de autenticación.
      </Typography.Paragraph>
      <Form<Values> form={form} layout="vertical" onFinish={submit} requiredMark={false}>
        <Form.Item
          label="Contraseña"
          name="password"
          rules={[{ required: true, message: 'Escribe tu contraseña.' }]}
        >
          <Input.Password
            autoComplete="current-password"
            autoFocus
            maxLength={LIMITS.user.passwordMax}
            onPressEnter={() => form.submit()}
          />
        </Form.Item>
        <Form.Item label="Código de 6 dígitos" name="code" rules={codeRules}>
          <Input
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            pattern="[0-9]*"
            onPressEnter={() => form.submit()}
          />
        </Form.Item>
        {error ? <Alert type="error" showIcon title={error} /> : null}
      </Form>
    </Modal>
  );
}
