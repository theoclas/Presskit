import { Body, Controller, Get, Patch, Post, Put, UseGuards, HttpCode } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { EditorProfileDto, LegalInfoDto, PublicDjProfileDto } from '@fersua/shared';
import { Roles } from '../auth/decorators';
import { ProfileScopeGuard, ScopedProfile, type ScopedProfileId } from '../common/scope/profile-scope.guard';
import {
  BookingFormBody,
  GenresBody,
  LegalInfoBody,
  RiderBody,
  SlugBody,
  SocialsBody,
  UpdateProfileBody,
} from './dto/editor.dto';
import { Actor, type EditorActor } from './editor-actor';
import { ProfileEditorService } from './profile-editor.service';
import { ProfileLegalService } from './profile-legal.service';
import { ProfileStatusService } from './profile-status.service';

/**
 * Montajes [me|adm]: el mismo controlador sirve al dueño (/api/me/profile/...) y al admin
 * (/api/admin/profiles/:profileId/...). ProfileScopeGuard decide el perfil por el PREFIJO de
 * la ruta; los servicios solo reciben ese ScopedProfileId, nunca un id del cuerpo.
 */
export const EDITOR_MOUNTS = ['me/profile', 'admin/profiles/:profileId'];

@Controller(EDITOR_MOUNTS)
@UseGuards(ProfileScopeGuard)
export class ProfileEditorController {
  constructor(
    private readonly editor: ProfileEditorService,
    private readonly legal: ProfileLegalService,
  ) {}

  @Get()
  get(@ScopedProfile() profileId: ScopedProfileId): Promise<EditorProfileDto> {
    return this.editor.get(profileId);
  }

  @Patch()
  update(@ScopedProfile() profileId: ScopedProfileId, @Actor() actor: EditorActor, @Body() body: UpdateProfileBody): Promise<EditorProfileDto> {
    return this.editor.update(profileId, actor, body);
  }

  @Get('preview')
  preview(@ScopedProfile() profileId: ScopedProfileId): Promise<PublicDjProfileDto> {
    return this.editor.preview(profileId);
  }

  @Put('slug')
  slug(@ScopedProfile() profileId: ScopedProfileId, @Actor() actor: EditorActor, @Body() body: SlugBody): Promise<EditorProfileDto> {
    return this.editor.setSlug(profileId, actor, body.slug);
  }

  @Put('genres')
  genres(@ScopedProfile() profileId: ScopedProfileId, @Actor() actor: EditorActor, @Body() body: GenresBody): Promise<EditorProfileDto> {
    return this.editor.setGenres(profileId, actor, body.genreIds);
  }

  @Put('socials')
  socials(@ScopedProfile() profileId: ScopedProfileId, @Actor() actor: EditorActor, @Body() body: SocialsBody): Promise<EditorProfileDto> {
    return this.editor.setSocials(profileId, actor, body.links);
  }

  @Put('rider')
  rider(@ScopedProfile() profileId: ScopedProfileId, @Actor() actor: EditorActor, @Body() body: RiderBody): Promise<EditorProfileDto> {
    return this.editor.setRider(profileId, actor, body.items);
  }

  @Put('booking-form')
  bookingForm(
    @ScopedProfile() profileId: ScopedProfileId,
    @Actor() actor: EditorActor,
    @Body() body: BookingFormBody,
  ): Promise<EditorProfileDto> {
    return this.editor.setBookingForm(profileId, actor, body);
  }

  @Get('legal-info')
  legalInfo(@ScopedProfile() profileId: ScopedProfileId, @Actor() actor: EditorActor): Promise<LegalInfoDto> {
    return this.legal.get(profileId, actor);
  }

  @Put('legal-info')
  putLegalInfo(@ScopedProfile() profileId: ScopedProfileId, @Actor() actor: EditorActor, @Body() body: LegalInfoBody): Promise<LegalInfoDto> {
    return this.legal.put(profileId, actor, body);
  }
}

/**
 * Solo el dueño: enviar a revisión y retirarla no tienen sentido desde el admin (él aprueba
 * directo). 10 cada 10 min: cada envío le escribe al admin.
 */
@Controller('me/profile')
@Roles('USER')
@UseGuards(ProfileScopeGuard)
export class OwnerProfileController {
  constructor(private readonly status: ProfileStatusService) {}

  @Post('submit')
  @HttpCode(200)
  @Throttle({ default: { limit: 10, ttl: 600_000 } })
  submit(@ScopedProfile() profileId: ScopedProfileId, @Actor() actor: EditorActor): Promise<EditorProfileDto> {
    return this.status.submit(profileId, actor);
  }

  @Post('withdraw')
  @HttpCode(200)
  @Throttle({ default: { limit: 10, ttl: 600_000 } })
  withdraw(@ScopedProfile() profileId: ScopedProfileId, @Actor() actor: EditorActor): Promise<EditorProfileDto> {
    return this.status.withdraw(profileId, actor);
  }
}
