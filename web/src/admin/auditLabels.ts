// Textos de la auditoría para una persona, no para un programador. El código crudo sigue
// visible en un tooltip (sirve para filtrar). Las acciones sin traducción muestran el código.

const ACTIONS: Record<string, string> = {
  // Ingreso y seguridad
  'auth.login': 'Ingresó',
  'auth.mfa_challenge': 'Contraseña correcta; pidió el código',
  'auth.mfa_recovery_used': 'Usó un código de recuperación',
  'auth.logout_all': 'Cerró todas sus sesiones',
  'auth.password_changed': 'Cambió su contraseña',
  'auth.step_up': 'Confirmó su identidad',
  'auth.step_up_failed': 'Falló la confirmación de identidad',
  'security.account_locked': 'Cuenta bloqueada por intentos fallidos',
  'security.mfa_failed': 'Código de verificación incorrecto',
  'security.refresh_reuse': 'Sesión robada o reusada: se cerró',
  // Registro y autoservicio de la cuenta (M3)
  'auth.register': 'Se registró',
  'auth.email_verified': 'Confirmó su correo',
  'auth.password_reset_requested': 'Pidió restablecer la contraseña',
  'auth.password_reset': 'Restableció su contraseña con el enlace del correo',
  'auth.terms_accepted': 'Aceptó los términos y la política de datos',
  // Cuentas (admin)
  'admin.user.create': 'Creó una cuenta',
  'admin.user.email': 'Cambió el correo de una cuenta',
  'admin.user.reset_password': 'Restableció la contraseña',
  'admin.user.suspend': 'Suspendió una cuenta',
  'admin.user.reactivate': 'Reactivó una cuenta',
  'admin.user.unlock': 'Desbloqueó el ingreso',
  'admin.user.revoke_sessions': 'Cerró las sesiones de una cuenta',
  'admin.user.delete': 'Eliminó una cuenta',
  // Solicitudes, PQRS y géneros
  'admin.booking.view': 'Vio una solicitud',
  'admin.booking.status': 'Cambió el estado de una solicitud',
  'admin.booking.delete': 'Borró una solicitud',
  'admin.ticket.update': 'Atendió una PQRS o reporte',
  'admin.genre.create': 'Creó un género',
  'admin.genre.update': 'Editó un género',
  'admin.genre.delete': 'Borró un género',
  // Consola del servidor y sistema
  'cli.admin.create': 'Creó el administrador (consola)',
  'cli.admin.reset_password': 'Restableció la contraseña del admin (consola)',
  'cli.admin.reset_mfa': 'Renovó el 2FA del admin (consola)',
  'cli.admin.unlock': 'Desbloqueó una cuenta (consola)',
  'seed.genres': 'Cargó los géneros iniciales',
  'seed.macfly': 'Cargó el perfil de Mac Fly & Mike Bran',
  'system.legal_info_purged': 'Purgó registros legales vencidos',
  'system.profile.draft_warned': 'Avisó que el borrador se borrará por inactividad',
  'system.profile.draft_purged': 'Borró un borrador inactivo',
  'system.profile.rejected_purged': 'Borró un perfil rechazado inactivo',
  'system.user.unverified_purged': 'Borró una cuenta que no confirmó su correo',
};

/** Cambios de un perfil: 'profile.<x>' (el dueño) o 'admin.profile.<x>' (el admin). */
const PROFILE_ACTIONS: Record<string, string> = {
  create: 'Creó el perfil',
  update: 'Editó el perfil',
  slug: 'Cambió la dirección',
  genres: 'Cambió los géneros',
  socials: 'Cambió las redes',
  rider: 'Cambió el rider',
  booking_form: 'Cambió el formulario',
  legal_info: 'Actualizó los datos legales',
  legal_info_view: 'Vio los datos legales',
  'media.upload': 'Subió una foto',
  'media.delete': 'Borró una foto',
  'member.create': 'Agregó un integrante',
  'member.update': 'Editó un integrante',
  'member.delete': 'Quitó un integrante',
  'member.order': 'Reordenó los integrantes',
  'member.socials': 'Cambió las redes de un integrante',
  'event.create': 'Agregó una fecha',
  'event.update': 'Editó una fecha',
  'event.delete': 'Borró una fecha',
  'gallery.add': 'Agregó una foto a la galería',
  'gallery.update': 'Editó una foto de la galería',
  'gallery.delete': 'Quitó una foto de la galería',
  'gallery.order': 'Reordenó la galería',
  submit: 'Envió a revisión',
  withdraw: 'Retiró el perfil de la revisión',
  'booking.status': 'Cambió el estado de una solicitud',
  'booking.delete': 'Borró una solicitud',
  approve: 'Aprobó el perfil',
  reject: 'Rechazó el perfil',
  suspend: 'Suspendió el perfil',
  reinstate: 'Reactivó el perfil',
  feature: 'Cambió el destacado',
  owner: 'Cambió el dueño',
  delete: 'Borró el perfil',
};

export function auditActionLabel(action: string): string {
  const known = ACTIONS[action];
  if (known) return known;
  const m = /^(admin\.)?profile\.(.+)$/.exec(action);
  if (m) {
    const label = PROFILE_ACTIONS[m[2]!];
    if (label) return m[1] ? label : `${label} (el DJ)`;
  }
  return action;
}

const TARGETS: Record<string, string> = {
  User: 'Cuenta',
  DjProfile: 'Perfil',
  DjLegalInfo: 'Datos legales',
  BookingRequest: 'Solicitud',
  Ticket: 'PQRS o reporte',
  Genre: 'Género',
  MediaAsset: 'Foto',
  Member: 'Integrante',
  Event: 'Fecha',
  GalleryItem: 'Foto de la galería',
};

export function auditTargetLabel(targetType: string): string {
  return TARGETS[targetType] ?? targetType;
}
