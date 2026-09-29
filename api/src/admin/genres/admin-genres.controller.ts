import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Request } from 'express';
import type { GenreAdminDto } from '@fersua/shared';
import type { AuthUser } from '../../auth/auth-user';
import { CurrentUser, Roles } from '../../auth/decorators';
import { RequestContext } from '../../common/request-context';
import { toActor } from '../admin-actor';
import { ADMIN_MUTATION_THROTTLE, IntIdPipe } from '../admin-common';
import { AdminOnlyGuard } from '../admin-only.guard';
import { CreateGenreBody, UpdateGenreBody } from './admin-genres.dto';
import { AdminGenresService } from './admin-genres.service';

@Controller('admin/genres')
@Roles('ADMIN')
@UseGuards(AdminOnlyGuard)
export class AdminGenresController {
  constructor(
    private readonly genres: AdminGenresService,
    private readonly requestContext: RequestContext,
  ) {}

  /** Todos, activos e inactivos, con cuántos perfiles usan cada uno. */
  @Get()
  list(): Promise<GenreAdminDto[]> {
    return this.genres.list();
  }

  @Post()
  @Throttle(ADMIN_MUTATION_THROTTLE)
  create(@Body() body: CreateGenreBody, @CurrentUser() user: AuthUser, @Req() req: Request): Promise<GenreAdminDto> {
    return this.genres.create(toActor(user, this.requestContext.ipHash(req)), body);
  }

  @Patch(':id')
  @Throttle(ADMIN_MUTATION_THROTTLE)
  update(
    @Param('id', IntIdPipe) id: number,
    @Body() body: UpdateGenreBody,
    @CurrentUser() user: AuthUser,
    @Req() req: Request,
  ): Promise<GenreAdminDto> {
    return this.genres.update(toActor(user, this.requestContext.ipHash(req)), id, body);
  }

  @Delete(':id')
  @HttpCode(204)
  @Throttle(ADMIN_MUTATION_THROTTLE)
  remove(@Param('id', IntIdPipe) id: number, @CurrentUser() user: AuthUser, @Req() req: Request): Promise<void> {
    return this.genres.remove(toActor(user, this.requestContext.ipHash(req)), id);
  }
}
