import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { LockoutService } from './lockout/lockout.service';
import { MfaService } from './mfa/mfa.service';
import { EmailTokenService } from './tokens/email-token.service';
import { SessionService } from './tokens/session.service';

/** Limpieza de auth: refresh tokens y tokens de correo que ya no sirven y estado en memoria vencido. */
@Injectable()
export class AuthMaintenanceJob {
  private readonly log = new Logger('AuthMaintenance');

  constructor(
    private readonly sessions: SessionService,
    private readonly lockout: LockoutService,
    private readonly mfa: MfaService,
    private readonly emailTokens: EmailTokenService,
  ) {}

  @Cron('0 40 4 * * *', { timeZone: 'America/Bogota' })
  async purgeRefreshTokens(): Promise<void> {
    try {
      await this.sessions.purgeExpired();
    } catch (err) {
      this.log.error(`purga de refresh tokens falló: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  /** Enlaces de verificación y de restablecer vencidos (M12: no guardar lo que no sirve). */
  @Cron('0 45 4 * * *', { timeZone: 'America/Bogota' })
  async purgeEmailTokens(): Promise<void> {
    try {
      await this.emailTokens.purgeExpired();
    } catch (err) {
      this.log.error(`purga de tokens de correo falló: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  @Cron(CronExpression.EVERY_30_MINUTES)
  sweepMemory(): void {
    this.lockout.sweepMemory();
    this.mfa.sweepMemory();
    this.sessions.sweepMemory();
  }
}
