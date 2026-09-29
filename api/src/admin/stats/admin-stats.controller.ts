import { Controller, Get, UseGuards } from '@nestjs/common';
import type { AdminStatsDto } from '@fersua/shared';
import { Roles } from '../../auth/decorators';
import { AdminOnlyGuard } from '../admin-only.guard';
import { AdminStatsService } from './admin-stats.service';

@Controller('admin/stats')
@Roles('ADMIN')
@UseGuards(AdminOnlyGuard)
export class AdminStatsController {
  constructor(private readonly statsService: AdminStatsService) {}

  @Get()
  stats(): Promise<AdminStatsDto> {
    return this.statsService.stats();
  }
}
