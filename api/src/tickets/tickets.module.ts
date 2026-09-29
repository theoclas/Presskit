import { Module } from '@nestjs/common';
import { PublicModule } from '../public/public.module';
import { TicketsController } from './tickets.controller';
import { TicketsService } from './tickets.service';

// Tickets públicos (PQRS / habeas data, reportes de perfil, solicitudes art. 53).
// La bandeja del admin y los avisos por correo llegan en M2.
@Module({
  imports: [PublicModule],
  controllers: [TicketsController],
  providers: [TicketsService],
})
export class TicketsModule {}
