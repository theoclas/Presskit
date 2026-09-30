import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { AccountController } from './account.controller';
import { AccountService } from './account.service';
import { AuthMaintenanceJob } from './auth-maintenance.job';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { LockoutService } from './lockout/lockout.service';
import { MfaService } from './mfa/mfa.service';
import { PasswordHasher } from './password/password-hasher.service';
import { EmailTokenService } from './tokens/email-token.service';
import { SessionService } from './tokens/session.service';
import { TokenService } from './tokens/token.service';
import { XRequestedWithGuard } from './xhr.guard';

/**
 * Login, sesiones, 2FA del admin, step-up y (M3) el autoservicio de la cuenta: registro,
 * verificación del correo, olvido/restablecimiento y re-aceptación de términos. Exporta lo que
 * necesitan los guards globales (TokenService) y el admin: SessionService.revokeAllForUser,
 * LockoutService.unlock, PasswordHasher y EmailTokenService.invalidate. MailModule es global.
 */
@Module({
  // Sin secreto global a propósito: TokenService pasa uno derivado por propósito en cada firma.
  imports: [JwtModule.register({})],
  controllers: [AuthController, AccountController],
  providers: [
    AuthService,
    AccountService,
    PasswordHasher,
    TokenService,
    SessionService,
    LockoutService,
    MfaService,
    EmailTokenService,
    XRequestedWithGuard,
    AuthMaintenanceJob,
  ],
  exports: [TokenService, SessionService, LockoutService, PasswordHasher, MfaService, EmailTokenService],
})
export class AuthModule {}
