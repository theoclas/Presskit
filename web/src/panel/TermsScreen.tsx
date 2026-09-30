import { LEGAL_DOCS, type AcceptTermsInput } from '@fersua/shared';
import { Alert, Button, Card, Checkbox, Space, Typography } from 'antd';
import { useState } from 'react';
import { useNavigate } from 'react-router';
import { useAuth } from '../auth/AuthProvider';
import { SITE_NAME, usePageTitle } from '../lib/usePageTitle';
import { panelErrorMessage } from './errors';

/**
 * Pantalla bloqueante cuando cambió la versión de los Términos para Artistas o de la Política
 * de datos (MeDto.termsOutdated o un 403 TERMS_ACCEPTANCE_REQUIRED). Casillas separadas y sin
 * marcar; no hay forma de saltarla (docs/diseno/11 §2.4).
 */
export function TermsScreen({ onAccepted }: { onAccepted?: () => void }) {
  usePageTitle(`Documentos actualizados · ${SITE_NAME}`);
  const { user, acceptTerms, logout } = useAuth();
  const navigate = useNavigate();
  const [terms, setTerms] = useState(false);
  const [privacy, setPrivacy] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const accept = async () => {
    if (!terms || !privacy || sending) return;
    setSending(true);
    setError(null);
    try {
      const body: AcceptTermsInput = { acceptTerms: true, acceptPrivacy: true };
      // POST /auth/accept-terms: responde el MeDto fresco y AuthProvider lo aplica (termsOutdated: false).
      await acceptTerms(body);
      onAccepted?.();
    } catch (e) {
      setError(panelErrorMessage(e));
    } finally {
      setSending(false);
    }
  };

  const onLogout = async () => {
    await logout();
    navigate('/login', { replace: true });
  };

  const artist = LEGAL_DOCS.artistTerms;
  const priv = LEGAL_DOCS.privacy;
  // Cuentas creadas por el admin (M2) nunca aceptaron nada: no es una "actualización".
  const firstTime = !user?.termsVersion;

  return (
    <main className="panel-center" id="main">
      <Card
        className="panel-center-card"
        title={firstTime ? 'Antes de empezar, acepta nuestros documentos' : 'Actualizamos nuestros documentos legales'}
      >
        <Space orientation="vertical" size={16} style={{ width: '100%' }}>
          <Typography.Paragraph style={{ margin: 0 }}>
            {user?.username ? `Hola, ${user.username}. ` : ''}
            {firstTime
              ? 'Para usar tu panel, lee y acepta los Términos para Artistas y la Política de datos.'
              : 'Para seguir usando tu panel, lee y acepta las versiones vigentes. Tu página pública sigue en línea mientras tanto.'}
          </Typography.Paragraph>
          <Checkbox checked={terms} onChange={(e) => setTerms(e.target.checked)}>
            He leído y acepto los{' '}
            <a href={artist.path} target="_blank" rel="noopener noreferrer">
              {artist.title}
            </a>{' '}
            (versión {artist.version}).
          </Checkbox>
          <Checkbox checked={privacy} onChange={(e) => setPrivacy(e.target.checked)}>
            Autorizo el tratamiento de mis datos personales según la{' '}
            <a href={priv.path} target="_blank" rel="noopener noreferrer">
              {priv.title}
            </a>{' '}
            (versión {priv.version}).
          </Checkbox>
          {error ? <Alert type="error" showIcon title={error} /> : null}
          <Space wrap>
            <Button type="primary" onClick={() => void accept()} disabled={!terms || !privacy} loading={sending}>
              Aceptar y continuar
            </Button>
            <Button onClick={() => void onLogout()}>Cerrar sesión</Button>
          </Space>
          <Typography.Paragraph type="secondary" style={{ margin: 0, fontSize: 13 }}>
            ¿No estás de acuerdo? Puedes pedir que borremos tu cuenta y tus datos desde{' '}
            <a href={LEGAL_DOCS.pqrs.path} target="_blank" rel="noopener noreferrer">
              PQRS
            </a>
            .
          </Typography.Paragraph>
        </Space>
      </Card>
    </main>
  );
}
