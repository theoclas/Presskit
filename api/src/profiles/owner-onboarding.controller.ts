import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { EditorProfileDto, OwnerGenreDto, SlugAvailabilityDto } from '@fersua/shared';
import type { AuthUser } from '../auth/auth-user';
import { CurrentUser, Roles } from '../auth/decorators';
import { OnboardingBody, SlugAvailabilityQuery } from './dto/owner.dto';
import { Actor, type EditorActor } from './editor-actor';
import { OwnerOnboardingService } from './owner-onboarding.service';

/**
 * Rutas del dueño que NO pasan por ProfileScopeGuard: sirven antes de tener perfil (M3).
 * - GET  /me/genres                          géneros activos (selector del editor del dueño)
 * - GET  /me/profile/slug-availability?slug= disponibilidad en vivo (30/min)
 * - POST /me/profile                         onboarding → 201 EditorProfileDto
 * El rol USER lo exige @Roles y, además, el RolesGuard global por el prefijo /api/me/**.
 * No chocan con el editor montado en me/profile: ese no tiene POST en la raíz ni rutas
 * con parámetro al nivel de slug-availability.
 */
@Controller('me')
@Roles('USER')
export class OwnerOnboardingController {
  constructor(private readonly onboarding: OwnerOnboardingService) {}

  @Get('genres')
  genres(): Promise<OwnerGenreDto[]> {
    return this.onboarding.genres();
  }

  @Get('profile/slug-availability')
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  slugAvailability(@CurrentUser() user: AuthUser, @Query() query: SlugAvailabilityQuery): Promise<SlugAvailabilityDto> {
    return this.onboarding.slugAvailability(query.slug, user.profileId);
  }

  // Holgado a propósito: detrás del NAT de un operador móvil muchas personas comparten IP.
  @Post('profile')
  @Throttle({ default: { limit: 20, ttl: 600_000 } })
  create(@CurrentUser() user: AuthUser, @Actor() actor: EditorActor, @Body() body: OnboardingBody): Promise<EditorProfileDto> {
    return this.onboarding.create(actor, body, user.profileId !== null);
  }
}
