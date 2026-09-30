import { Module } from '@nestjs/common';
import { PublicModule } from '../public/public.module';
import { BookingDigestJob, BookingRetentionJob } from './booking-jobs';
import { BookingNotifyService } from './booking-notify.service';
import { BookingController } from './booking.controller';
import { BookingService } from './booking.service';
import { FormTokenService } from './form-token.service';

// Formulario público de booking: token anti-spam, envío, aviso al DJ (M3), resumen diario de
// avisos, conservación de las solicitudes y purga de nonces. El token de formulario también lo
// usa el formulario de tickets (TicketsModule), con su propio propósito.
@Module({
  imports: [PublicModule],
  controllers: [BookingController],
  providers: [FormTokenService, BookingService, BookingNotifyService, BookingDigestJob, BookingRetentionJob],
  exports: [FormTokenService],
})
export class BookingModule {}
