import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  isValidEmail,
  isWellFormedText,
  normalizeEmail,
  normalizeUsername,
  validateUsername,
  type AdminUserDto,
  type Paginated,
  type TemporaryPasswordDto,
} from '@fersua/shared';
import { AuditService } from '../../audit/audit.service';
import { LockoutService } from '../../auth/lockout/lockout.service';
import { PasswordHasher } from '../../auth/password/password-hasher.service';
import { SessionService } from '../../auth/tokens/session.service';
import { Errors } from '../../common/errors';
import { MailService } from '../../mail/mail.service';
import { PrismaService } from '../../prisma/prisma.service';
import { ProfileStatusService } from '../../profiles/profile-status.service';
import { actorFields, type AdminActor } from '../admin-actor';
import { isoOrNull, pageArgs, searchTerm } from '../admin-common';
import type { ConfirmUsernameBody, CreateUserBody, ListUsersQuery, UpdateUserEmailBody } from './admin-users.dto';
import { generateTemporaryPassword, temporaryPasswordExpiry } from './temp-password';
import { TARGET_ERROR_MESSAGES, confirmMatches, targetError } from './user-rules';

const userSelect = {
  id: true,
  username: true,
  email: true,
  emailVerifiedAt: true,
  role: true,
  status: true,
  mustChangePassword: true,
  tempPasswordExpiresAt: true,
  lockedUntil: true,
  lastLoginAt: true,
  createdAt: true,
  profile: { select: { id: true, slug: true, status: true } },
} satisfies Prisma.UserSelect;

type UserRow = Prisma.UserGetPayload<{ select: typeof userSelect }>;

export function toAdminUserDto(u: UserRow): AdminUserDto {
  return {
    id: u.id,
    username: u.username,
    email: u.email,
    emailVerified: u.emailVerifiedAt !== null,
    role: u.role,
    status: u.status,
    mustChangePassword: u.mustChangePassword,
    // Solo tiene sentido mientras la clave temporal está pendiente.
    tempPasswordExpiresAt: u.mustChangePassword ? isoOrNull(u.tempPasswordExpiresAt) : null,
    lockedUntil: isoOrNull(u.lockedUntil),
    lastLoginAt: isoOrNull(u.lastLoginAt),
    createdAt: u.createdAt.toISOString(),
    profile: u.profile ? { id: u.profile.id, slug: u.profile.slug, status: u.profile.status } : null,
  };
}

const emailTaken = () => Errors.conflict('EMAIL_TAKEN', 'Ese correo ya está registrado en otra cuenta.');

/** Correo opcional que escribe el admin: vacío o null = sin correo; si viene, normalizado y válido. */
function cleanEmail(raw: string | null | undefined): string | null {
  if (typeof raw !== 'string' || raw.trim() === '') return null;
  const email = normalizeEmail(raw);
  if (!isWellFormedText(email) || !isValidEmail(email)) throw Errors.validation({ email: 'INVALID' }, 'El correo no es válido.');
  return email;
}

const USERNAME_MESSAGES = {
  FORMAT: 'El usuario debe tener de 3 a 24 caracteres: letras, números, punto o guion bajo.',
  RESERVED: 'Ese nombre de usuario está reservado.',
} as const;

@Injectable()
export class AdminUsersService {
  private readonly log = new Logger('AdminUsers');

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly mail: MailService,
    // De AuthModule: el hasher pasa por su semáforo de argon2 (tope de memoria), las sesiones
    // se revocan igual que en logout-all y el desbloqueo limpia también los bloqueos por IP
    // que viven en memoria.
    private readonly hasher: PasswordHasher,
    private readonly sessions: SessionService,
    private readonly lockout: LockoutService,
    // De ProfilesModule: borrar la cuenta dueña de un perfil aprobado lo suspende (mismo camino
    // que la suspensión del admin: archivos a private/ y auditoría).
    private readonly profileStatus: ProfileStatusService,
  ) {}

  async list(q: ListUsersQuery): Promise<Paginated<AdminUserDto>> {
    const { page, pageSize, skip, take } = pageArgs(q);
    const term = searchTerm(q.q);
    const where: Prisma.UserWhereInput = {
      ...(q.status ? { status: q.status } : {}),
      ...(term ? { OR: [{ username: { contains: term } }, { email: { contains: term } }] } : {}),
    };
    const [total, rows] = await this.prisma.$transaction([
      this.prisma.user.count({ where }),
      this.prisma.user.findMany({ where, select: userSelect, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], skip, take }),
    ]);
    return { items: rows.map(toAdminUserDto), page, pageSize, total };
  }

  /** Alta manual de un DJ (rol USER) con contraseña temporal. La respuesta es la única vez que se ve. */
  async create(actor: AdminActor, body: CreateUserBody): Promise<TemporaryPasswordDto> {
    const username = normalizeUsername(body.username);
    const usernameError = validateUsername(username);
    if (usernameError) throw Errors.validation({ username: usernameError }, USERNAME_MESSAGES[usernameError]);

    const email = cleanEmail(body.email);

    const taken = await this.prisma.user.findFirst({
      where: { OR: [{ username }, ...(email ? [{ email }] : [])] },
      select: { username: true },
    });
    if (taken) {
      if (taken.username === username) throw Errors.conflict('USERNAME_TAKEN', 'Ese nombre de usuario ya existe.');
      throw Errors.conflict('EMAIL_TAKEN', 'Ese correo ya está registrado en otra cuenta.');
    }

    const temporaryPassword = generateTemporaryPassword({ username });
    const passwordHash = await this.hasher.hash(temporaryPassword);
    const expiresAt = temporaryPasswordExpiry();

    const created = await this.prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          username,
          email,
          passwordHash,
          role: 'USER',
          mustChangePassword: true,
          tempPasswordExpiresAt: expiresAt,
        },
        select: { id: true, username: true },
      });
      await this.audit.record(
        {
          ...actorFields(actor),
          action: 'admin.user.create',
          targetType: 'User',
          targetId: user.id,
          metadata: { username: user.username, hasEmail: email !== null },
        },
        tx,
      );
      return user;
    });

    // Aviso (sin la contraseña) al correo que puso el admin, si puso uno.
    this.mail.send(email, 'temp-password-issued', { expiresAt });
    return { userId: created.id, username: created.username, temporaryPassword, expiresAt: expiresAt.toISOString() };
  }

  /**
   * Nueva contraseña temporal (72 h). Cierra todas las sesiones, obliga a cambiarla en el
   * primer ingreso y quita el bloqueo por intentos: es el camino de rescate de un DJ.
   */
  async resetPassword(actor: AdminActor, id: string): Promise<TemporaryPasswordDto> {
    const target = await this.loadTarget(actor, id);
    const temporaryPassword = generateTemporaryPassword({ username: target.username });
    const passwordHash = await this.hasher.hash(temporaryPassword);
    const now = new Date();
    const expiresAt = temporaryPasswordExpiry(now);

    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: target.id, role: 'USER' },
        data: {
          passwordHash,
          passwordChangedAt: now,
          mustChangePassword: true,
          tempPasswordExpiresAt: expiresAt,
          tokenVersion: { increment: 1 },
          failedLoginCount: 0,
          lockedUntil: null,
        },
      });
      const revoked = await this.sessions.revokeAllForUser(target.id, 'ADMIN_ACTION', tx);
      await this.audit.record(
        {
          ...actorFields(actor),
          action: 'admin.user.reset_password',
          targetType: 'User',
          targetId: target.id,
          profileId: target.profile?.id ?? null,
          metadata: { sessionsRevoked: revoked },
        },
        tx,
      );
    });

    this.lockout.clearPairs(target.id);
    // Aviso de seguridad al dueño de la cuenta: si no lo pidió, se entera. Nunca lleva la contraseña.
    this.mail.send(target.email, 'temp-password-issued', { expiresAt });
    return { userId: target.id, username: target.username, temporaryPassword, expiresAt: expiresAt.toISOString() };
  }

  /** Suspender: no puede ingresar y sus sesiones mueren ya (tokenVersion++). Su página deja de verse. */
  async suspend(actor: AdminActor, id: string): Promise<AdminUserDto> {
    const target = await this.loadTarget(actor, id);
    return this.prisma.$transaction(async (tx) => {
      const user = await tx.user.update({
        where: { id: target.id, role: 'USER' },
        data: { status: 'SUSPENDED', tokenVersion: { increment: 1 } },
        select: userSelect,
      });
      const revoked = await this.sessions.revokeAllForUser(target.id, 'ADMIN_ACTION', tx);
      await this.audit.record(
        {
          ...actorFields(actor),
          action: 'admin.user.suspend',
          targetType: 'User',
          targetId: target.id,
          profileId: target.profile?.id ?? null,
          metadata: { previousStatus: target.status, sessionsRevoked: revoked },
        },
        tx,
      );
      return toAdminUserDto(user);
    });
  }

  async reactivate(actor: AdminActor, id: string): Promise<AdminUserDto> {
    const target = await this.loadTarget(actor, id);
    return this.prisma.$transaction(async (tx) => {
      const user = await tx.user.update({
        where: { id: target.id, role: 'USER' },
        data: { status: 'ACTIVE' },
        select: userSelect,
      });
      await this.audit.record(
        {
          ...actorFields(actor),
          action: 'admin.user.reactivate',
          targetType: 'User',
          targetId: target.id,
          profileId: target.profile?.id ?? null,
          metadata: { previousStatus: target.status },
        },
        tx,
      );
      return toAdminUserDto(user);
    });
  }

  /**
   * Cambia (o quita) el correo de una cuenta: en v1 lo hace el admin (plan, fase 2), p. ej. para
   * corregir un error de tipeo. Con step-up: de este correo depende recuperar la contraseña
   * (M3). Queda sin verificar y el correo anterior recibe un aviso (sin el nuevo).
   */
  async updateEmail(actor: AdminActor, id: string, body: UpdateUserEmailBody): Promise<AdminUserDto> {
    const target = await this.loadTarget(actor, id);
    const email = cleanEmail(body.email);
    if (email === target.email) {
      return toAdminUserDto(await this.prisma.user.findUniqueOrThrow({ where: { id: target.id }, select: userSelect }));
    }
    if (email) {
      const taken = await this.prisma.user.findFirst({ where: { email, id: { not: target.id } }, select: { id: true } });
      if (taken) throw emailTaken();
    }
    const now = new Date();
    let updated: UserRow;
    try {
      updated = await this.prisma.$transaction(async (tx) => {
        const user = await tx.user.update({
          where: { id: target.id, role: 'USER' },
          data: { email, emailVerifiedAt: null },
          select: userSelect,
        });
        await this.audit.record(
          {
            ...actorFields(actor),
            action: 'admin.user.email',
            targetType: 'User',
            targetId: target.id,
            profileId: target.profile?.id ?? null,
            // Nunca los correos: solo si antes había y si ahora hay.
            metadata: { hadEmail: target.email !== null, hasEmail: email !== null },
          },
          tx,
        );
        return user;
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') throw emailTaken();
      throw err;
    }
    // Si alguien cambió el correo sin que el DJ lo pidiera, el buzón anterior se entera.
    if (target.email) this.mail.send(target.email, 'email-changed', { at: now });
    return toAdminUserDto(updated);
  }

  /** Quita el bloqueo por intentos fallidos. No toca la contraseña ni las sesiones. */
  async unlock(actor: AdminActor, id: string): Promise<AdminUserDto> {
    const target = await this.loadTarget(actor, id);
    return this.prisma.$transaction(async (tx) => {
      await this.lockout.unlock(target.id, tx);
      await this.audit.record(
        { ...actorFields(actor), action: 'admin.user.unlock', targetType: 'User', targetId: target.id },
        tx,
      );
      return toAdminUserDto(await tx.user.findUniqueOrThrow({ where: { id: target.id }, select: userSelect }));
    });
  }

  /** Cierra todas las sesiones (access y refresh) sin cambiar la contraseña. */
  async revokeAllSessions(actor: AdminActor, id: string): Promise<void> {
    const target = await this.loadTarget(actor, id);
    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({ where: { id: target.id, role: 'USER' }, data: { tokenVersion: { increment: 1 } } });
      const revoked = await this.sessions.revokeAllForUser(target.id, 'ADMIN_ACTION', tx);
      await this.audit.record(
        {
          ...actorFields(actor),
          action: 'admin.user.revoke_sessions',
          targetType: 'User',
          targetId: target.id,
          metadata: { sessionsRevoked: revoked },
        },
        tx,
      );
    });
  }

  /**
   * Borra la cuenta. Su perfil DJ NO se borra: queda sin dueño y lo sigue administrando el
   * admin (se puede asignar a otro usuario). Si estaba aprobado, se suspende en la misma
   * transacción: un perfil aprobado sin dueño es público, y la página de alguien que se fue (o
   * que estaba oculta porque su cuenta estaba suspendida) no debe quedar publicada sola. Tokens
   * de sesión y de correo se van en cascada.
   */
  async remove(actor: AdminActor, id: string, body: ConfirmUsernameBody): Promise<void> {
    const target = await this.loadTarget(actor, id);
    if (!confirmMatches(body.confirm, target.username)) {
      throw Errors.badRequest('CONFIRM_MISMATCH', 'Escribe el nombre de usuario exacto para confirmar.');
    }
    const profileSuspended = target.profile?.status === 'APPROVED';
    const work = async (tx: Prisma.TransactionClient): Promise<void> => {
      // Explícito aunque la FK tenga SetNull: el perfil sobrevive pase lo que pase con la FK.
      await tx.djProfile.updateMany({ where: { userId: target.id }, data: { userId: null } });
      await tx.user.delete({ where: { id: target.id, role: 'USER' } });
      await this.audit.record(
        {
          ...actorFields(actor),
          action: 'admin.user.delete',
          targetType: 'User',
          targetId: target.id,
          profileId: target.profile?.id ?? null,
          // El usuario deja de existir: su nombre queda aquí para poder rastrear la acción.
          metadata: { username: target.username, profileUnowned: target.profile !== null, profileSuspended },
        },
        tx,
      );
    };
    if (target.profile) {
      const editorActor = { id: actor.id, username: actor.username, asAdmin: true, ip: null, ipHash: actor.ipHash };
      await this.profileStatus.suspendForOwnerRemoval(target.profile.id, editorActor, work);
    } else {
      await this.prisma.$transaction(work);
    }
    this.log.log(`admin.user.delete target=${target.id}`);
  }

  /** Usuario sobre el que se actúa: 403 si es el propio admin u otro ADMIN, 404 si no existe. */
  private async loadTarget(actor: AdminActor, id: string) {
    // Antes de leer la BD: sobre sí mismo nunca, exista o no la fila.
    if (id === actor.id) throw Errors.forbidden('CANNOT_TARGET_SELF', TARGET_ERROR_MESSAGES.CANNOT_TARGET_SELF);
    const target = await this.prisma.user.findUnique({
      where: { id },
      select: { id: true, username: true, email: true, role: true, status: true, profile: { select: { id: true, status: true } } },
    });
    if (!target) throw Errors.notFound('Usuario no encontrado.');
    const err = targetError(actor.id, target);
    if (err) throw Errors.forbidden(err, TARGET_ERROR_MESSAGES[err]);
    return target;
  }
}
