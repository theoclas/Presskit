import { Body, Controller, Get, HttpCode, Post, Req, Res, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import type { LoginResultDto, MeDto, SessionDto, StepUpDto } from '@fersua/shared';
import { Public } from '../common/decorators';
import type { AuthUser } from './auth-user';
import { ChangePasswordBody, LoginBody, MfaVerifyBody, StepUpBody } from './auth.dto';
import { AuthService } from './auth.service';
import { AllowPendingPasswordChange, CurrentUser, Roles } from './decorators';
import { XRequestedWithGuard } from './xhr.guard';

const FIFTEEN_MIN = 15 * 60_000;

/** Contrato en docs/api-m2.md. forgot/reset/register/verify-email llegan en M3. */
@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @Post('login')
  @HttpCode(200)
  @Throttle({ default: { limit: 10, ttl: FIFTEEN_MIN } })
  login(@Body() body: LoginBody, @Req() req: Request, @Res({ passthrough: true }) res: Response): Promise<LoginResultDto> {
    return this.auth.login(body, req, res);
  }

  @Public()
  @Post('mfa')
  @HttpCode(200)
  @UseGuards(XRequestedWithGuard)
  @Throttle({ default: { limit: 10, ttl: FIFTEEN_MIN } })
  mfa(@Body() body: MfaVerifyBody, @Req() req: Request, @Res({ passthrough: true }) res: Response): Promise<SessionDto> {
    return this.auth.verifyMfa(body, req, res);
  }

  /** Con la cookie de refresh. Varias pestañas renovando cada ~14 min caben de sobra en 60/15 min. */
  @Public()
  @Post('refresh')
  @HttpCode(200)
  @UseGuards(XRequestedWithGuard)
  @Throttle({ default: { limit: 60, ttl: FIFTEEN_MIN } })
  refresh(@Req() req: Request, @Res({ passthrough: true }) res: Response): Promise<SessionDto> {
    return this.auth.refresh(req, res);
  }

  @Public()
  @Post('logout')
  @HttpCode(204)
  @UseGuards(XRequestedWithGuard)
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response): Promise<void> {
    await this.auth.logout(req, res);
  }

  @AllowPendingPasswordChange()
  @Post('logout-all')
  @HttpCode(204)
  async logoutAll(@CurrentUser() user: AuthUser, @Req() req: Request, @Res({ passthrough: true }) res: Response): Promise<void> {
    await this.auth.logoutAll(user, req, res);
  }

  @AllowPendingPasswordChange()
  @Get('me')
  me(@CurrentUser() user: AuthUser): Promise<MeDto> {
    return this.auth.me(user);
  }

  @AllowPendingPasswordChange()
  @Post('change-password')
  @HttpCode(200)
  @Throttle({ default: { limit: 5, ttl: FIFTEEN_MIN } })
  changePassword(
    @CurrentUser() user: AuthUser,
    @Body() body: ChangePasswordBody,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<SessionDto> {
    return this.auth.changePassword(user, body, req, res);
  }

  @Roles('ADMIN')
  @Post('step-up')
  @HttpCode(200)
  @UseGuards(XRequestedWithGuard)
  @Throttle({ default: { limit: 5, ttl: FIFTEEN_MIN } })
  stepUp(@CurrentUser() user: AuthUser, @Body() body: StepUpBody, @Req() req: Request): Promise<StepUpDto> {
    return this.auth.stepUp(user, body, req);
  }
}
