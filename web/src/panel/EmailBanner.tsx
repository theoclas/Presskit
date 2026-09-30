import type { MeDto } from '@fersua/shared';
import { Alert, Button, Space } from 'antd';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '../auth/AuthProvider';
import { useFeedback } from '../editor-kit/feedback';
import { apiError, http, setSessionUser } from '../lib/http';
import { panelErrorMessage } from './errors';

/** Después de reenviar, el botón espera esto antes de dejar pedir otro (el api permite 3 por hora). */
const RESEND_COOLDOWN_MS = 60_000;
/** Al volver a la pestaña se revisa si ya confirmó (como mucho una vez cada 20 s). */
const FOCUS_CHECK_MS = 20_000;

/** Pide /auth/me y actualiza la sesión; devuelve el usuario fresco (o null si falló). */
async function reloadMe(): Promise<MeDto | null> {
  try {
    const { data } = await http.get<MeDto>('/auth/me');
    setSessionUser(data);
    return data;
  } catch {
    return null;
  }
}

/**
 * Aviso fijo mientras el correo no esté confirmado: sin eso no se suben fotos ni se envía el
 * perfil a revisión. «Reenviar correo» pide un enlace nuevo (anula los anteriores).
 */
export function EmailBanner() {
  const { user } = useAuth();
  const { message } = useFeedback();
  const [sending, setSending] = useState(false);
  const [checking, setChecking] = useState(false);
  const [cooldownUntil, setCooldownUntil] = useState(0);
  const [, setTick] = useState(0);
  const lastFocusCheck = useRef(0);
  const unverified = !!user && !user.emailVerified;

  // Volvió de abrir el enlace en otra pestaña: se revisa sin que tenga que hacer nada.
  useEffect(() => {
    if (!unverified) return;
    const onFocus = () => {
      const now = Date.now();
      if (now - lastFocusCheck.current < FOCUS_CHECK_MS) return;
      lastFocusCheck.current = now;
      void reloadMe();
    };
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [unverified]);

  // Vuelve a pintar el botón cuando termina la espera.
  useEffect(() => {
    if (!cooldownUntil) return;
    const ms = cooldownUntil - Date.now();
    if (ms <= 0) return;
    const t = setTimeout(() => setTick((n) => n + 1), ms + 50);
    return () => clearTimeout(t);
  }, [cooldownUntil]);

  const resend = useCallback(async () => {
    setSending(true);
    try {
      await http.post('/auth/resend-verification');
      setCooldownUntil(Date.now() + RESEND_COOLDOWN_MS);
      message.success('Te enviamos un enlace nuevo. Revisa tu correo (y la carpeta de spam). Los enlaces anteriores ya no sirven.');
    } catch (e) {
      const err = apiError(e);
      if (err.code === 'ALREADY_VERIFIED' || err.statusCode === 409) {
        await reloadMe();
        message.success('Tu correo ya está confirmado.');
      } else if (err.statusCode === 429 || err.code === 'RATE_LIMITED') {
        setCooldownUntil(Date.now() + RESEND_COOLDOWN_MS);
        message.warning('Ya pediste varios correos. Espera un rato antes de pedir otro y revisa la carpeta de spam.');
      } else {
        message.error(panelErrorMessage(e));
      }
    } finally {
      setSending(false);
    }
  }, [message]);

  const check = useCallback(async () => {
    setChecking(true);
    const fresh = await reloadMe();
    setChecking(false);
    if (!fresh) message.error('No pudimos revisar tu cuenta. Intenta de nuevo.');
    else if (fresh.emailVerified) message.success('¡Listo! Tu correo está confirmado.');
    else message.info('Todavía no vemos tu correo confirmado. Abre el enlace del correo y vuelve a intentarlo.');
  }, [message]);

  if (!user || user.emailVerified) return null;

  if (!user.email) {
    return (
      <Alert
        className="panel-email-banner"
        type="warning"
        showIcon
        title="Tu cuenta no tiene correo"
        description="Pídele al equipo de Fersua Studio que agregue uno. Sin un correo confirmado no puedes subir fotos ni enviar tu perfil a revisión."
      />
    );
  }

  const waiting = cooldownUntil > Date.now();
  return (
    <Alert
      className="panel-email-banner"
      type="warning"
      showIcon
      title="Confirma tu correo"
      description={
        <>
          Te enviamos un enlace a <strong>{user.email}</strong>. Mientras no lo confirmes no puedes subir fotos ni enviar tu
          perfil a revisión.
        </>
      }
      action={
        <Space orientation="vertical" size={6}>
          <Button size="small" type="primary" onClick={() => void resend()} loading={sending} disabled={waiting}>
            {waiting ? 'Correo enviado' : 'Reenviar correo'}
          </Button>
          <Button size="small" onClick={() => void check()} loading={checking}>
            Ya lo confirmé
          </Button>
        </Space>
      }
    />
  );
}
