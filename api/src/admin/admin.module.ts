import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { ProfilesModule } from '../profiles/profiles.module';
import { AdminAuditController } from './audit/admin-audit.controller';
import { AdminAuditService } from './audit/admin-audit.service';
import { AdminBookingsController } from './bookings/admin-bookings.controller';
import { AdminBookingsService } from './bookings/admin-bookings.service';
import { AdminGenresController } from './genres/admin-genres.controller';
import { AdminGenresService } from './genres/admin-genres.service';
import { AdminOnlyGuard } from './admin-only.guard';
import { AdminLegalController } from './legal/admin-legal.controller';
import { AdminLegalService } from './legal/admin-legal.service';
import { AdminStatsController } from './stats/admin-stats.controller';
import { AdminStatsService } from './stats/admin-stats.service';
import { AdminTicketsController } from './tickets/admin-tickets.controller';
import { AdminTicketsService } from './tickets/admin-tickets.service';
import { AdminUsersController } from './users/admin-users.controller';
import { AdminUsersService } from './users/admin-users.service';

// Operaciones del admin fuera de la edición de perfiles (esa vive en ProfilesModule, montada
// también bajo /api/admin/profiles/:profileId). Todo exige rol ADMIN leído de la BD.
@Module({
  // AuthModule: PasswordHasher (argon2 con su semáforo). ProfilesModule: ProfileStatusService
  // (borrar la cuenta dueña de un perfil aprobado lo suspende). MailModule es global.
  imports: [AuthModule, ProfilesModule],
  controllers: [
    AdminStatsController,
    AdminUsersController,
    AdminBookingsController,
    AdminTicketsController,
    AdminAuditController,
    AdminGenresController,
    AdminLegalController,
  ],
  providers: [
    AdminOnlyGuard,
    AdminStatsService,
    AdminUsersService,
    AdminBookingsService,
    AdminTicketsService,
    AdminAuditService,
    AdminGenresService,
    AdminLegalService,
  ],
  exports: [],
})
export class AdminModule {}
