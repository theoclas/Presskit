import { Body, Controller, Post, Req } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Request } from 'express';
import type { TicketSubmitResultDto } from '@fersua/shared';
import { Public } from '../common/decorators';
import { TicketSubmitBody } from './ticket-submit.dto';
import { TicketsService } from './tickets.service';

@Controller('public')
@Public()
export class TicketsController {
  constructor(private readonly tickets: TicketsService) {}

  /** PQRS, reportes de perfil y solicitudes de datos de un DJ. 5 por hora por IP. */
  @Post('tickets')
  @Throttle({ default: { limit: 5, ttl: 3_600_000 } })
  submit(@Body() body: TicketSubmitBody, @Req() req: Request): Promise<TicketSubmitResultDto> {
    return this.tickets.submit(body, req);
  }
}
