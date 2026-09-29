import { LIMITS, canTransition, type AdminUserDto, type EditorProfileDto, type Paginated, type ProfileStatus } from '@fersua/shared';
import { useQuery } from '@tanstack/react-query';
import { Alert, Form, Input, Modal, Select, Typography } from 'antd';
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useStepUp } from '../../auth/useStepUp';
import { useFeedback } from '../../editor-kit/feedback';
import { countConfig } from '../../editor-kit/forms';
import { http, stepUpHeaders } from '../../lib/http';
import { errorMessage, withStepUp } from '../errors';
import { adminProfileBase, useRefreshProfile } from './api';
import { publishMissingLabels } from './visibility';

/** Lo mínimo de un perfil para actuar sobre él (sirve la fila de la lista o el perfil del editor). */
export interface ProfileRef {
  id: string;
  slug: string;
  displayName: string;
  status: ProfileStatus;
  hasLegalInfo: boolean;
  owner: { id: string; username: string } | null;
  featured: boolean;
  featuredRank: number;
}

export type ProfileAction = 'approve' | 'reject' | 'suspend' | 'reinstate' | 'owner' | 'delete';

/** La misma tabla con la que decide el api (shared/profile-status.ts): el resto respondería 409. */
export function allowedActions(status: ProfileStatus): Record<'approve' | 'reject' | 'suspend' | 'reinstate', boolean> {
  return {
    approve: canTransition('approve', status),
    reject: canTransition('reject', status),
    suspend: canTransition('suspend', status),
    reinstate: canTransition('reinstate', status),
  };
}

export function reasonProblem(reason: string): string | null {
  const n = [...reason.trim()].length;
  if (n < LIMITS.profile.statusReasonMin) return `Escribe al menos ${LIMITS.profile.statusReasonMin} caracteres.`;
  if (n > LIMITS.profile.statusReasonMax) return `Máximo ${LIMITS.profile.statusReasonMax} caracteres.`;
  return null;
}

interface Options {
  /** Al ir a «Datos legales» desde el aviso de aprobar. */
  onOpenLegal?: (p: ProfileRef) => void;
  /** Tras borrar (p. ej. volver a la lista si se estaba en el editor). */
  onDeleted?: (p: ProfileRef) => void;
}

type Open = { kind: 'reject' | 'suspend' | 'owner' | 'delete'; profile: ProfileRef } | null;

/**
 * Acciones del admin sobre un perfil con sus confirmaciones. Devuelve `run` y los modales, que
 * el componente pinta una vez. Asignar dueño y borrar piden step-up (contraseña + código).
 */
export function useProfileActions(opts: Options = {}): { run: (a: ProfileAction, p: ProfileRef) => void; modals: ReactNode } {
  const { message, modal } = useFeedback();
  const refresh = useRefreshProfile();
  const [open, setOpen] = useState<Open>(null);
  const { onOpenLegal } = opts;

  const post = useCallback(
    async (p: ProfileRef, path: string, body: object | undefined, okText: string) => {
      try {
        await http.post(`${adminProfileBase(p.id)}/${path}`, body ?? {});
        await refresh(p.id);
        message.success(okText);
        return true;
      } catch (e) {
        message.error(errorMessage(e));
        return false;
      }
    },
    [message, refresh],
  );

  /** Aprobar y reactivar publican la página: sin el registro del art. 53 el api responde 409. */
  const needLegal = useCallback(
    (p: ProfileRef, verb: 'aprobar' | 'reactivar') =>
      modal.confirm({
        title: 'Faltan los datos legales',
        content: `Para ${verb} un perfil hay que cargar antes el registro privado del responsable (art. 53 Ley 1480): nombre, documento, dirección y teléfono.`,
        okText: onOpenLegal ? 'Cargar datos legales' : 'Entendido',
        cancelText: 'Cancelar',
        onOk: () => onOpenLegal?.(p),
      }),
    [modal, onOpenLegal],
  );

  const confirmApprove = useCallback(
    async (p: ProfileRef) => {
      // Datos frescos (la fila de la lista puede estar vieja): registro legal y lo que falta para publicar.
      let fresh: EditorProfileDto;
      try {
        fresh = (await http.get<EditorProfileDto>(adminProfileBase(p.id))).data;
      } catch (e) {
        message.error(errorMessage(e));
        return;
      }
      if (!fresh.hasLegalInfo) {
        needLegal(p, 'aprobar');
        return;
      }
      const missing = publishMissingLabels(fresh.publishMissing.filter((k) => k !== 'legalInfo'));
      modal.confirm({
        title: `¿Aprobar «${p.displayName}»?`,
        content: (
          <>
            <Typography.Paragraph>La página quedará pública en /{p.slug} y sus fotos pasan a ser públicas.</Typography.Paragraph>
            {missing.length ? (
              <Alert
                type="warning"
                showIcon
                title="A la página todavía le falta:"
                description={
                  <ul style={{ margin: 0, paddingInlineStart: 18 }}>
                    {missing.map((m) => (
                      <li key={m}>{m}</li>
                    ))}
                  </ul>
                }
              />
            ) : null}
          </>
        ),
        okText: missing.length ? 'Aprobar igual' : 'Aprobar',
        cancelText: 'Cancelar',
        onOk: () => post(p, 'approve', undefined, 'Perfil aprobado'),
      });
    },
    [message, modal, needLegal, post],
  );

  const run = useCallback(
    (action: ProfileAction, p: ProfileRef) => {
      switch (action) {
        case 'approve':
          void confirmApprove(p);
          return;
        case 'reinstate':
          if (!p.hasLegalInfo) {
            needLegal(p, 'reactivar');
            return;
          }
          modal.confirm({
            title: `¿Reactivar «${p.displayName}»?`,
            content: `La página vuelve a estar pública en /${p.slug}.`,
            okText: 'Reactivar',
            cancelText: 'Cancelar',
            onOk: () => post(p, 'reinstate', undefined, 'Perfil reactivado'),
          });
          return;
        default:
          setOpen({ kind: action, profile: p });
      }
    },
    [confirmApprove, modal, needLegal, post],
  );

  const close = () => setOpen(null);

  const modals = (
    <>
      {open && (open.kind === 'reject' || open.kind === 'suspend') ? (
        <ReasonModal
          kind={open.kind}
          profile={open.profile}
          onClose={close}
          onSubmit={(reason) =>
            post(
              open.profile,
              open.kind,
              { reason },
              open.kind === 'reject' ? 'Perfil rechazado' : 'Perfil suspendido',
            )
          }
        />
      ) : null}
      {open?.kind === 'owner' ? <OwnerModal profile={open.profile} onClose={close} /> : null}
      {open?.kind === 'delete' ? (
        <DeleteModal
          profile={open.profile}
          onClose={close}
          onDeleted={(p) => {
            close();
            opts.onDeleted?.(p);
          }}
        />
      ) : null}
    </>
  );

  return { run, modals };
}

function ReasonModal({
  kind,
  profile,
  onClose,
  onSubmit,
}: {
  kind: 'reject' | 'suspend';
  profile: ProfileRef;
  onClose: () => void;
  onSubmit: (reason: string) => Promise<boolean>;
}) {
  const [reason, setReason] = useState('');
  const [touched, setTouched] = useState(false);
  const [sending, setSending] = useState(false);
  const problem = reasonProblem(reason);
  const isReject = kind === 'reject';

  const submit = async () => {
    setTouched(true);
    if (problem || sending) return;
    setSending(true);
    const ok = await onSubmit(reason.trim());
    setSending(false);
    if (ok) onClose();
  };

  return (
    <Modal
      open
      title={isReject ? `Rechazar «${profile.displayName}»` : `Suspender «${profile.displayName}»`}
      okText={isReject ? 'Rechazar' : 'Suspender'}
      okButtonProps={{ danger: true }}
      cancelText="Cancelar"
      confirmLoading={sending}
      onOk={() => void submit()}
      onCancel={onClose}
      mask={{ closable: false }}
      destroyOnHidden
    >
      <Typography.Paragraph type="secondary">
        {isReject
          ? 'El motivo queda guardado en el perfil; el DJ lo verá cuando tenga su panel y podrá corregir y volver a enviar.'
          : 'La página deja de ser pública y las fotos pasan a privadas. El motivo queda guardado; el DJ lo verá cuando tenga su panel.'}
      </Typography.Paragraph>
      <Form layout="vertical">
        <Form.Item
          label="Motivo"
          required
          validateStatus={touched && problem ? 'error' : undefined}
          help={touched && problem ? problem : undefined}
        >
          <Input.TextArea
            autoFocus
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            onBlur={() => setTouched(true)}
            autoSize={{ minRows: 3, maxRows: 8 }}
            count={countConfig(LIMITS.profile.statusReasonMax)}
          />
        </Form.Item>
      </Form>
    </Modal>
  );
}

function useDebounced<T>(value: T, ms: number): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

function OwnerModal({ profile, onClose }: { profile: ProfileRef; onClose: () => void }) {
  const stepUp = useStepUp();
  const refresh = useRefreshProfile();
  const { message } = useFeedback();
  const [search, setSearch] = useState('');
  const q = useDebounced(search.trim(), 300);
  const [userId, setUserId] = useState<string | null | undefined>(undefined);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const users = useQuery({
    queryKey: ['admin', 'users', 'owner-candidates', q],
    queryFn: async ({ signal }) =>
      (await http.get<{ items: AdminUserDto[] }>('/admin/users', { params: q ? { q, page: 1 } : { page: 1 }, signal })).data
        .items,
    staleTime: 15_000,
  });

  // Solo cuentas de DJ activas y sin perfil (el api rechaza cualquier otra).
  const options = useMemo(() => {
    const list = (users.data ?? [])
      .filter((u) => u.role === 'USER' && !u.profile && u.status === 'ACTIVE')
      .map((u) => ({ value: u.id, label: u.email ? `${u.username} · ${u.email}` : u.username }));
    return profile.owner ? [{ value: '__none__', label: 'Sin dueño (quitar el actual)' }, ...list] : list;
  }, [users.data, profile.owner]);

  const submit = async () => {
    if (userId === undefined || sending) return;
    setSending(true);
    setError(null);
    try {
      const done = await withStepUp(stepUp, (token) =>
        http.patch(`${adminProfileBase(profile.id)}/owner`, { userId }, { headers: stepUpHeaders(token) }),
      );
      if (!done) {
        setSending(false);
        return;
      }
      await refresh(profile.id);
      message.success(userId ? 'Dueño asignado' : 'El perfil quedó sin dueño');
      onClose();
    } catch (e) {
      setError(errorMessage(e));
      setSending(false);
    }
  };

  return (
    <Modal
      open
      title={`Dueño de «${profile.displayName}»`}
      okText="Guardar"
      cancelText="Cancelar"
      okButtonProps={{ disabled: userId === undefined }}
      confirmLoading={sending}
      onOk={() => void submit()}
      onCancel={onClose}
      mask={{ closable: false }}
      destroyOnHidden
    >
      <Typography.Paragraph>
        Dueño actual: <strong>{profile.owner ? profile.owner.username : 'sin dueño'}</strong>
      </Typography.Paragraph>
      <Typography.Paragraph type="secondary">
        Solo aparecen cuentas de DJ activas que todavía no tienen perfil. El dueño podrá editar la página desde su
        panel. Por seguridad se pide tu contraseña y tu código.
      </Typography.Paragraph>
      <Select<string>
        showSearch={{ filterOption: false, onSearch: setSearch }}
        style={{ width: '100%' }}
        placeholder="Busca por usuario o correo"
        aria-label="Cuenta del nuevo dueño"
        loading={users.isFetching}
        options={options}
        value={userId === undefined ? undefined : (userId ?? '__none__')}
        onChange={(v) => setUserId(v === '__none__' ? null : v)}
        notFoundContent={users.isFetching ? 'Buscando…' : 'No hay cuentas disponibles'}
      />
      {error ? <Alert type="error" showIcon title={error} style={{ marginTop: 12 }} /> : null}
    </Modal>
  );
}

function DeleteModal({
  profile,
  onClose,
  onDeleted,
}: {
  profile: ProfileRef;
  onClose: () => void;
  onDeleted: (p: ProfileRef) => void;
}) {
  const stepUp = useStepUp();
  const refresh = useRefreshProfile();
  const { message } = useFeedback();
  const [confirm, setConfirm] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const matches = confirm.trim() === profile.slug;
  // Las solicitudes se borran con el perfil (cascada): el admin lo ve antes de confirmar.
  const bookings = useQuery({
    queryKey: ['admin', 'bookings', 'count', profile.id],
    queryFn: async ({ signal }) =>
      (await http.get<Paginated<unknown>>('/admin/bookings', { params: { profileId: profile.id, page: 1, pageSize: 1 }, signal })).data
        .total,
    staleTime: 0,
  });
  const bookingsText =
    bookings.data === undefined
      ? 'sus solicitudes'
      : bookings.data === 0
        ? 'sus solicitudes (no tiene)'
        : `sus ${bookings.data} solicitud${bookings.data === 1 ? '' : 'es'} de booking`;

  const submit = async () => {
    if (!matches || sending) return;
    setSending(true);
    setError(null);
    try {
      const done = await withStepUp(stepUp, (token) =>
        http.delete(adminProfileBase(profile.id), { data: { confirm: profile.slug }, headers: stepUpHeaders(token) }),
      );
      if (!done) {
        setSending(false);
        return;
      }
      await refresh(profile.id, { removed: true });
      message.success(`«${profile.displayName}» fue borrado`);
      onDeleted(profile);
    } catch (e) {
      setError(errorMessage(e));
      setSending(false);
    }
  };

  return (
    <Modal
      open
      title={`Borrar «${profile.displayName}»`}
      okText="Borrar definitivamente"
      okButtonProps={{ danger: true, disabled: !matches }}
      cancelText="Cancelar"
      confirmLoading={sending}
      onOk={() => void submit()}
      onCancel={onClose}
      mask={{ closable: false }}
      destroyOnHidden
    >
      <Alert
        type="error"
        showIcon
        title="Esto no se puede deshacer"
        description={`Se borran el perfil y todo su contenido: textos, fechas, integrantes, fotos y ${bookingsText}. La dirección queda libre.${
          profile.hasLegalInfo
            ? ' Los datos legales (art. 53) no se borran: se guardan 12 meses aparte, por ley, y después se eliminan solos.'
            : ''
        }`}
        style={{ marginBottom: 12 }}
      />
      <Form layout="vertical" onFinish={() => void submit()}>
        <Form.Item label={<span>Para confirmar, escribe la dirección del perfil: <strong>{profile.slug}</strong></span>}>
          <Input
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            autoComplete="off"
            autoCapitalize="off"
            spellCheck={false}
            aria-label="Dirección del perfil para confirmar"
          />
        </Form.Item>
      </Form>
      {error ? <Alert type="error" showIcon title={error} /> : null}
    </Modal>
  );
}

