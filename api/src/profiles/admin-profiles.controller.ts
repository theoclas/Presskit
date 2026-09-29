import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import type { AdminProfileListItemDto, EditorProfileDto, Paginated } from '@fersua/shared';
import { RequireStepUp, Roles } from '../auth/decorators';
import {
  AdminProfilesQuery,
  CreateProfileBody,
  DeleteProfileBody,
  FeatureBody,
  OwnerBody,
  ReasonBody,
} from './dto/admin-profiles.dto';
import { AdminProfilesService } from './admin-profiles.service';
import { AdminActor, AdminOnlyGuard, ParseIdPipe, type EditorActor } from './editor-actor';
import { ProfileStatusService } from './profile-status.service';

/**
 * Ciclo de vida de los perfiles (solo ADMIN). La edición del contenido de un perfil concreto
 * está en los controladores [me|adm] montados en /api/admin/profiles/:profileId/...
 * Todo queda en la auditoría como admin.profile.*.
 */
@Controller('admin/profiles')
@Roles('ADMIN')
@UseGuards(AdminOnlyGuard)
export class AdminProfilesController {
  constructor(
    private readonly profiles: AdminProfilesService,
    private readonly status: ProfileStatusService,
  ) {}

  @Get()
  list(@Query() query: AdminProfilesQuery): Promise<Paginated<AdminProfileListItemDto>> {
    return this.profiles.list(query);
  }

  @Post()
  create(@AdminActor() actor: EditorActor, @Body() body: CreateProfileBody): Promise<EditorProfileDto> {
    return this.profiles.create(actor, body);
  }

  @Post(':id/approve')
  @HttpCode(200)
  async approve(@AdminActor() actor: EditorActor, @Param('id', ParseIdPipe) id: string): Promise<EditorProfileDto> {
    return this.status.approve(await this.profiles.requireProfile(id), actor);
  }

  @Post(':id/reject')
  @HttpCode(200)
  async reject(@AdminActor() actor: EditorActor, @Param('id', ParseIdPipe) id: string, @Body() body: ReasonBody): Promise<EditorProfileDto> {
    return this.status.reject(await this.profiles.requireProfile(id), actor, body.reason);
  }

  @Post(':id/suspend')
  @HttpCode(200)
  async suspend(@AdminActor() actor: EditorActor, @Param('id', ParseIdPipe) id: string, @Body() body: ReasonBody): Promise<EditorProfileDto> {
    return this.status.suspend(await this.profiles.requireProfile(id), actor, body.reason);
  }

  @Post(':id/reinstate')
  @HttpCode(200)
  async reinstate(@AdminActor() actor: EditorActor, @Param('id', ParseIdPipe) id: string): Promise<EditorProfileDto> {
    return this.status.reinstate(await this.profiles.requireProfile(id), actor);
  }

  @Patch(':id/feature')
  async feature(@AdminActor() actor: EditorActor, @Param('id', ParseIdPipe) id: string, @Body() body: FeatureBody): Promise<EditorProfileDto> {
    return this.profiles.setFeatured(await this.profiles.requireProfile(id), actor, body);
  }

  @Patch(':id/owner')
  @RequireStepUp()
  async owner(@AdminActor() actor: EditorActor, @Param('id', ParseIdPipe) id: string, @Body() body: OwnerBody): Promise<EditorProfileDto> {
    return this.profiles.setOwner(await this.profiles.requireProfile(id), actor, body.userId);
  }

  @Delete(':id')
  @RequireStepUp()
  @HttpCode(204)
  async remove(@AdminActor() actor: EditorActor, @Param('id', ParseIdPipe) id: string, @Body() body: DeleteProfileBody): Promise<void> {
    await this.profiles.remove(await this.profiles.requireProfile(id), actor, body.confirm);
  }
}
