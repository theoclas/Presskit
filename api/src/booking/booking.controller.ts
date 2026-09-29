import { Body, Controller, Get, Param, Post, Req } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Request } from 'express';
import type { BookingSubmitResultDto, BookingTokenDto } from '@fersua/shared';
import { Public } from '../common/decorators';
import { BookingSubmitBody } from './booking-submit.dto';
import { BookingService } from './booking.service';

@Controller('public/djs')
@Public()
export class BookingController {
  constructor(private readonly booking: BookingService) {}

  /** Sin @PublicCache: cada token es único (no-store por defecto). */
  @Get(':slug/booking-token')
  @Throttle({ default: { limit: 30, ttl: 600_000 } })
  token(@Param('slug') slug: string): Promise<BookingTokenDto> {
    return this.booking.issueToken(slug);
  }

  /** Límite de ráfaga por IP. Los topes diarios no dan 429: guardan como SPAM (ver booking-rules). */
  @Post(':slug/booking-requests')
  @Throttle({ default: { limit: 10, ttl: 600_000 } })
  submit(
    @Param('slug') slug: string,
    @Body() body: BookingSubmitBody,
    @Req() req: Request,
  ): Promise<BookingSubmitResultDto> {
    return this.booking.submit(slug, body, req);
  }
}
