import { Module } from '@nestjs/common';
import { PublicModule } from '../public/public.module';
import { BookingDigestJob, BookingRetentionJob } from './booking-jobs';
import { BookingNotifyService } from './booking-notify.service';
import { BookingTokenService } from './booking-token.service';
import { BookingController } from './booking.controller';
import { BookingService } from './booking.service';

// Formulario público de booking: token anti-spam, envío, aviso al DJ (M3), resumen diario de
// avisos, conservación de las solicitudes y purga de nonces.
@Module({
  imports: [PublicModule],
  controllers: [BookingController],
  providers: [BookingTokenService, BookingService, BookingNotifyService, BookingDigestJob, BookingRetentionJob],
  exports: [BookingTokenService],
})
export class BookingModule {}
