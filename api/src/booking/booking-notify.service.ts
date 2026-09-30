import { Injectable, Logger } from '@nestjs/common';
import { MailService } from '../mail/mail.service';
import { PrismaService } from '../prisma/prisma.service';
import { ownerRecipientOf } from '../profiles/profile-notifier.service';

/**
 * Aviso al DJ de una solicitud nueva (docs/api-m3.md, 'booking-new-owner'). Solo si el perfil
 * tiene dueño USER activo con el correo verificado y `notifyByEmail`. El correo no lleva ningún
 * dato del solicitante (plan M3: sin texto libre del público). El tope de 5 avisos por día y
 * destinatario lo aplica MailService; lo que llegue después va en el resumen del día siguiente
 * (BookingDigestJob).
 * Nunca lanza: la solicitud ya quedó guardada y el visitante no debe ver un error por el correo.
 */
@Injectable()
export class BookingNotifyService {
  private readonly log = new Logger('BookingNotify');

  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: MailService,
  ) {}

  async newBooking(bookingId: string, profileId: string): Promise<void> {
    try {
      const profile = await this.prisma.djProfile.findUnique({
        where: { id: profileId },
        select: { notifyByEmail: true, user: { select: { email: true, emailVerifiedAt: true, role: true, status: true } } },
      });
      const to = ownerRecipientOf(profile?.user);
      if (!profile?.notifyByEmail || !to) return;
      this.mail.send(to.email, 'booking-new-owner', {});
    } catch (err) {
      // Sin datos personales en el log: solo el id de la solicitud.
      this.log.warn(`booking.notify-failed id=${bookingId} ${err instanceof Error ? err.message.slice(0, 120) : 'error'}`);
    }
  }
}
