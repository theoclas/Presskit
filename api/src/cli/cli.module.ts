import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.service';
import { CommonModule } from '../common/common.module';
import { AppConfigModule } from '../config/config.module';
import { MediaModule } from '../media/media.module';
import { PrismaModule } from '../prisma/prisma.service';

// Contexto de la CLI: solo configuración, BD, auditoría y media. Sin HTTP, sin throttler,
// sin ScheduleModule (los @Cron de MediaModule no se activan aquí).
@Module({
  imports: [AppConfigModule, PrismaModule, AuditModule, CommonModule, MediaModule],
})
export class CliModule {}
