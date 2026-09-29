import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { AuthMaintenanceJob } from './auth-maintenance.job';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { LockoutService } from './lockout/lockout.service';
import { MfaService } from './mfa/mfa.service';
import { PasswordHasher } from './password/password-hasher.service';
import { SessionService } from './tokens/session.service';
import { TokenService } from './tokens/token.service';
import { XRequestedWithGuard } from './xhr.guard';

/**
 * Login, sesiones, 2FA del admin y step-up. Exporta lo que necesitan los guards globales
 * (TokenService) y el admin: SessionService.revokeAllForUser, LockoutService.unlock y
 * PasswordHasher. MailModule es global.
 */
@Module({
  // Sin secreto global a propósito: TokenService pasa uno derivado por propósito en cada firma.
  imports: [JwtModule.register({})],
  controllers: [AuthController],
  providers: [
    AuthService,
    PasswordHasher,
    TokenService,
    SessionService,
    LockoutService,
    MfaService,
    XRequestedWithGuard,
    AuthMaintenanceJob,
  ],
  exports: [TokenService, SessionService, LockoutService, PasswordHasher, MfaService],
})
export class AuthModule {}
