import { Module } from '@nestjs/common';
import { PublicModule } from '../public/public.module';
import { BookingTokenService } from './booking-token.service';
import { BookingController } from './booking.controller';
import { BookingService } from './booking.service';

// Formulario público de booking: token anti-spam, envío y purga de nonces.
@Module({
  imports: [PublicModule],
  controllers: [BookingController],
  providers: [BookingTokenService, BookingService],
  exports: [BookingTokenService],
})
export class BookingModule {}
