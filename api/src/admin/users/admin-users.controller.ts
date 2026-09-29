import { Body, Controller, Delete, Get, Header, HttpCode, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Request } from 'express';
import type { AdminUserDto, Paginated, TemporaryPasswordDto } from '@fersua/shared';
import type { AuthUser } from '../../auth/auth-user';
import { CurrentUser, RequireStepUp, Roles } from '../../auth/decorators';
import { RequestContext } from '../../common/request-context';
import { toActor } from '../admin-actor';
import { ADMIN_MUTATION_THROTTLE, CuidPipe } from '../admin-common';
import { AdminOnlyGuard } from '../admin-only.guard';
import { ConfirmUsernameBody, CreateUserBody, ListUsersQuery, UpdateUserEmailBody } from './admin-users.dto';
import { AdminUsersService } from './admin-users.service';

/** Cuentas de DJ. Ninguna ruta cambia roles y ninguna actúa sobre el propio admin. */
@Controller('admin/users')
@Roles('ADMIN')
@UseGuards(AdminOnlyGuard)
export class AdminUsersController {
  constructor(
    private readonly users: AdminUsersService,
    private readonly requestContext: RequestContext,
  ) {}

  @Get()
  list(@Query() q: ListUsersQuery): Promise<Paginated<AdminUserDto>> {
    return this.users.list(q);
  }

  /** La contraseña temporal sale solo en esta respuesta: no-store explícito. */
  @Post()
  @Throttle(ADMIN_MUTATION_THROTTLE)
  @Header('Cache-Control', 'no-store')
  create(@Body() body: CreateUserBody, @CurrentUser() user: AuthUser, @Req() req: Request): Promise<TemporaryPasswordDto> {
    return this.users.create(toActor(user, this.requestContext.ipHash(req)), body);
  }

  @Post(':id/reset-password')
  @RequireStepUp()
  @HttpCode(200)
  @Throttle(ADMIN_MUTATION_THROTTLE)
  @Header('Cache-Control', 'no-store')
  resetPassword(
    @Param('id', CuidPipe) id: string,
    @CurrentUser() user: AuthUser,
    @Req() req: Request,
  ): Promise<TemporaryPasswordDto> {
    return this.users.resetPassword(toActor(user, this.requestContext.ipHash(req)), id);
  }

  /** Correo de la cuenta (con step-up: de él depende recuperar la contraseña). */
  @Patch(':id')
  @RequireStepUp()
  @Throttle(ADMIN_MUTATION_THROTTLE)
  updateEmail(
    @Param('id', CuidPipe) id: string,
    @Body() body: UpdateUserEmailBody,
    @CurrentUser() user: AuthUser,
    @Req() req: Request,
  ): Promise<AdminUserDto> {
    return this.users.updateEmail(toActor(user, this.requestContext.ipHash(req)), id, body);
  }

  @Post(':id/suspend')
  @HttpCode(200)
  @Throttle(ADMIN_MUTATION_THROTTLE)
  suspend(@Param('id', CuidPipe) id: string, @CurrentUser() user: AuthUser, @Req() req: Request): Promise<AdminUserDto> {
    return this.users.suspend(toActor(user, this.requestContext.ipHash(req)), id);
  }

  @Post(':id/reactivate')
  @HttpCode(200)
  @Throttle(ADMIN_MUTATION_THROTTLE)
  reactivate(@Param('id', CuidPipe) id: string, @CurrentUser() user: AuthUser, @Req() req: Request): Promise<AdminUserDto> {
    return this.users.reactivate(toActor(user, this.requestContext.ipHash(req)), id);
  }

  @Post(':id/unlock')
  @HttpCode(200)
  @Throttle(ADMIN_MUTATION_THROTTLE)
  unlock(@Param('id', CuidPipe) id: string, @CurrentUser() user: AuthUser, @Req() req: Request): Promise<AdminUserDto> {
    return this.users.unlock(toActor(user, this.requestContext.ipHash(req)), id);
  }

  @Post(':id/revoke-sessions')
  @HttpCode(204)
  @Throttle(ADMIN_MUTATION_THROTTLE)
  revokeSessions(@Param('id', CuidPipe) id: string, @CurrentUser() user: AuthUser, @Req() req: Request): Promise<void> {
    return this.users.revokeAllSessions(toActor(user, this.requestContext.ipHash(req)), id);
  }

  @Delete(':id')
  @RequireStepUp()
  @HttpCode(204)
  @Throttle(ADMIN_MUTATION_THROTTLE)
  remove(
    @Param('id', CuidPipe) id: string,
    @Body() body: ConfirmUsernameBody,
    @CurrentUser() user: AuthUser,
    @Req() req: Request,
  ): Promise<void> {
    return this.users.remove(toActor(user, this.requestContext.ipHash(req)), id, body);
  }
}
