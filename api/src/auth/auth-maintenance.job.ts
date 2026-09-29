import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { LockoutService } from './lockout/lockout.service';
import { MfaService } from './mfa/mfa.service';
import { SessionService } from './tokens/session.service';

/** Limpieza de auth: refresh tokens que ya no sirven y estado en memoria vencido. */
@Injectable()
export class AuthMaintenanceJob {
  private readonly log = new Logger('AuthMaintenance');

  constructor(
    private readonly sessions: SessionService,
    private readonly lockout: LockoutService,
    private readonly mfa: MfaService,
  ) {}

  @Cron('0 40 4 * * *', { timeZone: 'America/Bogota' })
  async purgeRefreshTokens(): Promise<void> {
    try {
      await this.sessions.purgeExpired();
    } catch (err) {
      this.log.error(`purga de refresh tokens falló: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  @Cron(CronExpression.EVERY_30_MINUTES)
  sweepMemory(): void {
    this.lockout.sweepMemory();
    this.mfa.sweepMemory();
    this.sessions.sweepMemory();
  }
}
