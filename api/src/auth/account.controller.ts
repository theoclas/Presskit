import { Body, Controller, Get, HttpCode, Post, Req, Res, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import type { MeDto, RegistrationStatusDto, SessionDto } from '@fersua/shared';
import { Public, PublicCache } from '../common/decorators';
import { AcceptTermsBody, ForgotPasswordBody, RegisterBody, ResetPasswordBody, VerifyEmailBody } from './account.dto';
import { AccountService } from './account.service';
import type { AuthUser } from './auth-user';
import { AllowPendingPasswordChange, CurrentUser, Roles } from './decorators';
import { XRequestedWithGuard } from './xhr.guard';

const HOUR = 60 * 60_000;
const FIFTEEN_MIN = 15 * 60_000;

/**
 * Autoservicio de la cuenta (M3). Contrato en docs/api-m3.md, "Auth". Todas las mutaciones
 * exigen `X-Requested-With: fersua` (como refresh, mfa y step-up en M2). Los límites de
 * @Throttle son por IP; los límites por usuario los lleva AccountService.
 */
@Controller('auth')
export class AccountController {
  constructor(private readonly account: AccountService) {}

  @Public()
  @Get('registration')
  @PublicCache(60)
  registration(): RegistrationStatusDto {
    return this.account.registration();
  }

  @Public()
  @Post('register')
  @HttpCode(201)
  @UseGuards(XRequestedWithGuard)
  @Throttle({ default: { limit: 5, ttl: HOUR } })
  register(@Body() body: RegisterBody, @Req() req: Request, @Res({ passthrough: true }) res: Response): Promise<SessionDto> {
    return this.account.register(body, req, res);
  }

  @Public()
  @Post('verify-email')
  @HttpCode(204)
  @UseGuards(XRequestedWithGuard)
  @Throttle({ default: { limit: 10, ttl: HOUR } })
  async verifyEmail(@Body() body: VerifyEmailBody, @Req() req: Request): Promise<void> {
    await this.account.verifyEmail(body, req);
  }

  /** 3 por hora por usuario (AccountService); aquí, el tope por IP. */
  @Roles('USER')
  @AllowPendingPasswordChange()
  @Post('resend-verification')
  @HttpCode(202)
  @UseGuards(XRequestedWithGuard)
  @Throttle({ default: { limit: 10, ttl: HOUR } })
  async resendVerification(@CurrentUser() user: AuthUser, @Req() req: Request): Promise<void> {
    await this.account.resendVerification(user, req);
  }

  /** 202 siempre y sin cuerpo, exista o no la cuenta. 3/h y 10/día por usuario en AccountService. */
  @Public()
  @Post('forgot-password')
  @HttpCode(202)
  @UseGuards(XRequestedWithGuard)
  @Throttle({ default: { limit: 5, ttl: HOUR } })
  forgotPassword(@Body() body: ForgotPasswordBody, @Req() req: Request): void {
    this.account.forgotPassword(body, req);
  }

  @Public()
  @Post('reset-password')
  @HttpCode(204)
  @UseGuards(XRequestedWithGuard)
  @Throttle({ default: { limit: 10, ttl: HOUR } })
  async resetPassword(@Body() body: ResetPasswordBody, @Req() req: Request, @Res({ passthrough: true }) res: Response): Promise<void> {
    await this.account.resetPassword(body, req, res);
  }

  @Roles('USER')
  @AllowPendingPasswordChange()
  @Post('accept-terms')
  @HttpCode(200)
  @UseGuards(XRequestedWithGuard)
  @Throttle({ default: { limit: 10, ttl: FIFTEEN_MIN } })
  acceptTerms(@CurrentUser() user: AuthUser, @Body() body: AcceptTermsBody, @Req() req: Request): Promise<MeDto> {
    return this.account.acceptTerms(user, body, req);
  }
}
