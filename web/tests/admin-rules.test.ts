import { describe, expect, it } from 'vitest';
import { auditActionLabel, auditTargetLabel } from '../src/admin/auditLabels';
import { hiddenByOwner, isPubliclyVisible, publishMissingLabels } from '../src/admin/profiles/visibility';
import { suspendConsequence, tempPasswordExpired } from '../src/admin/userRules';

describe('visibilidad pública (misma regla que el api)', () => {
  it('aprobado y sin dueño o con dueño activo → se ve; con la cuenta suspendida → oculto', () => {
    expect(isPubliclyVisible({ status: 'APPROVED', owner: null })).toBe(true);
    expect(isPubliclyVisible({ status: 'APPROVED', owner: { status: 'ACTIVE' } })).toBe(true);
    expect(isPubliclyVisible({ status: 'APPROVED', owner: { status: 'SUSPENDED' } })).toBe(false);
    expect(isPubliclyVisible({ status: 'DRAFT', owner: null })).toBe(false);
    expect(hiddenByOwner({ status: 'APPROVED', owner: { status: 'SUSPENDED' } })).toBe(true);
    expect(hiddenByOwner({ status: 'SUSPENDED', owner: { status: 'SUSPENDED' } })).toBe(false);
  });

  it('lo que falta para publicar, en palabras', () => {
    expect(publishMissingLabels(['heroImage', 'contact', 'otra'])).toEqual([
      'Foto principal',
      'WhatsApp o un campo de contacto obligatorio en el formulario',
      'otra',
    ]);
  });
});

describe('cuentas de DJ', () => {
  it('suspender avisa que la página deja de verse solo si está aprobada', () => {
    expect(suspendConsequence({ profile: { id: 'p', slug: 'dj-uno', status: 'APPROVED' } })).toContain('deja de verse');
    expect(suspendConsequence({ profile: { id: 'p', slug: 'dj-uno', status: 'DRAFT' } })).not.toContain('página');
    expect(suspendConsequence({ profile: null })).toBe('No podrá ingresar y se cerrarán sus sesiones.');
  });

  it('clave temporal vencida', () => {
    const now = Date.parse('2026-10-01T12:00:00Z');
    expect(tempPasswordExpired({ mustChangePassword: true, tempPasswordExpiresAt: '2026-10-01T11:59:00Z' }, now)).toBe(true);
    expect(tempPasswordExpired({ mustChangePassword: true, tempPasswordExpiresAt: '2026-10-02T00:00:00Z' }, now)).toBe(false);
    expect(tempPasswordExpired({ mustChangePassword: false, tempPasswordExpiresAt: null }, now)).toBe(false);
  });
});

describe('auditoría en español', () => {
  it('acciones del admin, del DJ y desconocidas', () => {
    expect(auditActionLabel('admin.profile.approve')).toBe('Aprobó el perfil');
    expect(auditActionLabel('profile.update')).toBe('Editó el perfil (el DJ)');
    expect(auditActionLabel('security.mfa_failed')).toBe('Código de verificación incorrecto');
    expect(auditActionLabel('algo.nuevo')).toBe('algo.nuevo');
    // M3: acciones del dueño y del sistema.
    expect(auditActionLabel('profile.withdraw')).toBe('Retiró el perfil de la revisión (el DJ)');
    expect(auditActionLabel('profile.booking.status')).toBe('Cambió el estado de una solicitud (el DJ)');
    expect(auditActionLabel('system.user.unverified_purged')).toBe('Borró una cuenta que no confirmó su correo');
    expect(auditActionLabel('system.booking.retention_purged')).toBe('Borró solicitudes vencidas (12 meses) y spam viejo');
    expect(auditActionLabel('system.mail.cap_reached')).toMatch(/cupo diario de correos/);
    expect(auditActionLabel('auth.register')).toBe('Se registró');
    expect(auditTargetLabel('DjProfile')).toBe('Perfil');
    expect(auditTargetLabel('User')).toBe('Cuenta');
    expect(auditTargetLabel('Otro')).toBe('Otro');
  });
});
