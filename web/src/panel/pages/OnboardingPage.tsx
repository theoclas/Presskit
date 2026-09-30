import { CheckCircleFilled, CloseCircleFilled, LoadingOutlined } from '@ant-design/icons';
import { LIMITS, type EditorProfileDto, type OnboardingInput } from '@fersua/shared';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert, Button, Card, Form, Input, Space, Typography } from 'antd';
import { useState, type FormEvent, type ReactNode } from 'react';
import { useNavigate } from 'react-router';
import { useIsMobile } from '../../admin/useIsMobile';
import { useAuth } from '../../auth/AuthProvider';
import { useFeedback } from '../../editor-kit/feedback';
import { SLUG_ERROR_MESSAGES } from '../../editor-kit/labels';
import { editorKeys } from '../../editor-kit/scope';
import { apiError, http } from '../../lib/http';
import { fetchSlugAvailability, OWNER_BASE, panelKeys } from '../api';
import { PanelPageHeader } from '../components';
import { panelErrorMessage } from '../errors';
import {
  SLUG_TAKEN_MESSAGE,
  availabilityProblem,
  cleanSlugInput,
  displayNameProblem,
  effectiveSlug,
  slugAlternatives,
  slugProblem,
  useDebouncedValue,
} from '../onboarding';

const DEBOUNCE_MS = 400;

type Check = { state: 'idle' | 'checking' | 'ok' | 'bad' | 'unknown'; message?: string };

/** Primer paso de un DJ sin perfil: nombre artístico y dirección con disponibilidad en vivo. */
export function OnboardingPage() {
  const { refreshMe } = useAuth();
  const { message } = useFeedback();
  const client = useQueryClient();
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [typed, setTyped] = useState('');
  const [touched, setTouched] = useState(false);
  const [showErrors, setShowErrors] = useState(false);
  const [serverSlugError, setServerSlugError] = useState<{ slug: string; message: string } | null>(null);
  const [serverNameError, setServerNameError] = useState<string | null>(null);
  const [alert, setAlert] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const slug = effectiveSlug(name, typed, touched);
  const nameError = displayNameProblem(name);
  const localSlugError = slug ? slugProblem(slug) : null;
  const debounced = useDebouncedValue(slug, DEBOUNCE_MS);

  const availability = useQuery({
    queryKey: panelKeys.slug(debounced),
    queryFn: ({ signal }) => fetchSlugAvailability(debounced, signal),
    enabled: !!debounced && slugProblem(debounced) === null,
    staleTime: 30_000,
    retry: false,
  });

  let check: Check = { state: 'idle' };
  if (!slug) check = showErrors ? { state: 'bad', message: slugProblem('') ?? undefined } : { state: 'idle' };
  else if (localSlugError) check = { state: 'bad', message: localSlugError };
  else if (serverSlugError && serverSlugError.slug === slug) check = { state: 'bad', message: serverSlugError.message };
  else if (debounced !== slug || availability.isFetching) check = { state: 'checking' };
  else if (availability.isError) {
    const e = apiError(availability.error);
    check = {
      state: 'unknown',
      message:
        e.statusCode === 429
          ? 'Revisaste muchas direcciones seguidas. Espera un momento; igual la confirmaremos al crear tu perfil.'
          : 'No pudimos revisar si está libre. La confirmaremos al crear tu perfil.',
    };
  } else if (availability.data) {
    const problem = availabilityProblem(availability.data);
    check = problem ? { state: 'bad', message: problem } : { state: 'ok' };
  }

  const host = typeof window !== 'undefined' ? window.location.host : '';
  // En el teléfono el dominio completo deja muy poco espacio para escribir: basta con '/', la
  // línea de estado de abajo ya muestra la dirección completa.
  const isMobile = useIsMobile();
  const canCreate = !nameError && !!slug && check.state !== 'bad' && check.state !== 'checking' && !creating;
  const taken = check.state === 'bad' && check.message === SLUG_TAKEN_MESSAGE;

  const onSlugChange = (raw: string) => {
    setTouched(true);
    setTyped(cleanSlugInput(raw));
    setServerSlugError(null);
  };

  const create = async (e?: FormEvent) => {
    e?.preventDefault();
    setShowErrors(true);
    setAlert(null);
    if (!canCreate) return;
    const body: OnboardingInput = { displayName: name.trim(), slug };
    setCreating(true);
    try {
      const { data } = await http.post<EditorProfileDto>(OWNER_BASE, body);
      client.setQueryData(editorKeys.profile(OWNER_BASE), data);
      // MeDto.profile cambia: la sesión se refresca en segundo plano.
      void refreshMe().catch(() => undefined);
      message.success('¡Listo! Tu perfil está creado. Ahora completa tu página.');
      navigate('/panel/perfil', { replace: true });
    } catch (err) {
      const ae = apiError(err);
      if (ae.code === 'SLUG_TAKEN') {
        setServerSlugError({ slug, message: SLUG_TAKEN_MESSAGE });
        void client.invalidateQueries({ queryKey: panelKeys.slug(slug) });
      } else if (ae.code === 'SLUG_RESERVED') {
        setServerSlugError({ slug, message: SLUG_ERROR_MESSAGES.RESERVED });
      } else if (ae.code === 'PROFILE_EXISTS') {
        // Otra pestaña ya lo creó: se carga el que existe.
        await Promise.all([
          client.invalidateQueries({ queryKey: editorKeys.profile(OWNER_BASE) }),
          refreshMe().catch(() => undefined),
        ]);
        navigate('/panel', { replace: true });
      } else if (ae.code === 'VALIDATION_FAILED' && ae.details) {
        const slugCode = ae.details.slug;
        if (slugCode) {
          setServerSlugError({
            slug,
            message:
              slugCode === 'RESERVED'
                ? SLUG_ERROR_MESSAGES.RESERVED
                : slugCode === 'TAKEN'
                  ? SLUG_TAKEN_MESSAGE
                  : SLUG_ERROR_MESSAGES.FORMAT,
          });
        }
        if (ae.details.displayName) setServerNameError('Revisa el nombre artístico (de 2 a 60 caracteres, sin enlaces).');
        if (!slugCode && !ae.details.displayName) setAlert(panelErrorMessage(err));
      } else {
        setAlert(panelErrorMessage(err));
      }
    } finally {
      setCreating(false);
    }
  };

  const nameMessage = serverNameError ?? (name || showErrors ? nameError : null);

  return (
    <>
      <PanelPageHeader title="Crea tu página de DJ" />
      <Card className="panel-onboarding">
        <Typography.Paragraph type="secondary">
          Empieza con tu nombre artístico y la dirección de tu página. Después completas fotos, fechas y el resto; nada se
          publica hasta que el equipo lo revise.
        </Typography.Paragraph>
        <form noValidate onSubmit={(e) => void create(e)}>
          <Form layout="vertical" component={false}>
            <Form.Item
              label="Nombre artístico"
              htmlFor="onb-name"
              validateStatus={nameMessage ? 'error' : undefined}
              help={nameMessage ?? undefined}
            >
              <Input
                id="onb-name"
                value={name}
                onChange={(e) => {
                  setName(e.target.value);
                  setServerNameError(null);
                }}
                maxLength={LIMITS.profile.displayNameMax}
                showCount
                autoComplete="off"
                placeholder="Ej.: Mac Fly & Mike Bran"
              />
            </Form.Item>
            <Form.Item
              label="Dirección de tu página"
              htmlFor="onb-slug"
              validateStatus={check.state === 'bad' && (touched || showErrors || !!name) ? 'error' : undefined}
              help={<SlugHelp check={check} slug={slug} host={host} />}
              extra="Solo minúsculas, números y guiones. Podrás cambiarla después (con límites)."
            >
              <Input
                id="onb-slug"
                value={touched ? typed : slug}
                onChange={(e) => onSlugChange(e.target.value)}
                prefix={<span className="panel-slug-prefix">{host && !isMobile ? `${host}/` : '/'}</span>}
                maxLength={LIMITS.profile.slugMax + 10}
                autoComplete="off"
                autoCapitalize="none"
                spellCheck={false}
                aria-describedby="onb-slug-status"
                placeholder="tu-nombre"
              />
            </Form.Item>
            {taken ? (
              <Space wrap style={{ marginBottom: 16 }}>
                <Typography.Text type="secondary">Prueba con:</Typography.Text>
                {slugAlternatives(slug).map((alt) => (
                  <Button key={alt} size="small" onClick={() => onSlugChange(alt)}>
                    {alt}
                  </Button>
                ))}
              </Space>
            ) : null}
            {alert ? <Alert type="error" showIcon title={alert} style={{ marginBottom: 16 }} /> : null}
            <Button
              type="primary"
              htmlType="submit"
              loading={creating}
              disabled={check.state === 'checking' || check.state === 'bad'}
            >
              Crear mi perfil
            </Button>
          </Form>
        </form>
      </Card>
    </>
  );
}

function SlugHelp({ check, slug, host }: { check: Check; slug: string; host: string }) {
  let content: ReactNode = null;
  if (check.state === 'checking') {
    content = (
      <>
        <LoadingOutlined aria-hidden="true" /> Revisando si está libre…
      </>
    );
  } else if (check.state === 'ok') {
    content = (
      <span className="panel-ok">
        <CheckCircleFilled aria-hidden="true" /> Disponible: {host ? `${host}/` : '/'}
        {slug}
      </span>
    );
  } else if (check.state === 'bad') {
    content = (
      <>
        <CloseCircleFilled aria-hidden="true" /> {check.message}
      </>
    );
  } else if (check.state === 'unknown') {
    content = check.message;
  }
  return (
    <span id="onb-slug-status" role="status" aria-live="polite">
      {content}
    </span>
  );
}
