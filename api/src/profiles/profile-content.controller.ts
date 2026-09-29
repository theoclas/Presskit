import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Put,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { EditorEventDto, EditorGalleryItemDto, EditorMemberDto, MediaAssetDto } from '@fersua/shared';
import { ProfileScopeGuard, ScopedProfile, type ScopedProfileId } from '../common/scope/profile-scope.guard';
import {
  EventCreateBody,
  EventUpdateBody,
  EventsQuery,
  GalleryAddBody,
  GalleryAltBody,
  MemberCreateBody,
  MemberUpdateBody,
  OrderBody,
  UploadMediaBody,
} from './dto/content.dto';
import { MemberSocialsBody } from './dto/editor.dto';
import { Actor, ParseIdPipe, type EditorActor } from './editor-actor';
import { EDITOR_MOUNTS } from './profile-editor.controller';
import { ProfileEventsService } from './profile-events.service';
import { ProfileGalleryService } from './profile-gallery.service';
import { ProfileMediaService } from './profile-media.service';
import { ProfileMembersService } from './profile-members.service';
import { ProfileUploadInterceptor } from './profile-upload.interceptor';

// Contenido del perfil [me|adm]. Toda fila hija se busca con { id, profileId }: el id de la URL
// de otro perfil da el mismo 404 que uno inexistente.

@Controller(EDITOR_MOUNTS)
@UseGuards(ProfileScopeGuard)
export class ProfileMembersController {
  constructor(private readonly members: ProfileMembersService) {}

  @Get('members')
  list(@ScopedProfile() profileId: ScopedProfileId): Promise<EditorMemberDto[]> {
    return this.members.list(profileId);
  }

  @Post('members')
  create(@ScopedProfile() profileId: ScopedProfileId, @Actor() actor: EditorActor, @Body() body: MemberCreateBody): Promise<EditorMemberDto> {
    return this.members.create(profileId, actor, body);
  }

  @Put('members/order')
  order(@ScopedProfile() profileId: ScopedProfileId, @Actor() actor: EditorActor, @Body() body: OrderBody): Promise<EditorMemberDto[]> {
    return this.members.reorder(profileId, actor, body.ids);
  }

  @Patch('members/:id')
  update(
    @ScopedProfile() profileId: ScopedProfileId,
    @Actor() actor: EditorActor,
    @Param('id', ParseIdPipe) id: string,
    @Body() body: MemberUpdateBody,
  ): Promise<EditorMemberDto> {
    return this.members.update(profileId, actor, id, body);
  }

  @Delete('members/:id')
  @HttpCode(204)
  remove(@ScopedProfile() profileId: ScopedProfileId, @Actor() actor: EditorActor, @Param('id', ParseIdPipe) id: string): Promise<void> {
    return this.members.remove(profileId, actor, id);
  }

  @Put('members/:id/socials')
  socials(
    @ScopedProfile() profileId: ScopedProfileId,
    @Actor() actor: EditorActor,
    @Param('id', ParseIdPipe) id: string,
    @Body() body: MemberSocialsBody,
  ): Promise<EditorMemberDto> {
    return this.members.setSocials(profileId, actor, id, body.links);
  }
}

@Controller(EDITOR_MOUNTS)
@UseGuards(ProfileScopeGuard)
export class ProfileEventsController {
  constructor(private readonly events: ProfileEventsService) {}

  @Get('events')
  list(@ScopedProfile() profileId: ScopedProfileId, @Query() query: EventsQuery): Promise<EditorEventDto[]> {
    return this.events.list(profileId, query.scope ?? 'upcoming');
  }

  @Post('events')
  create(@ScopedProfile() profileId: ScopedProfileId, @Actor() actor: EditorActor, @Body() body: EventCreateBody): Promise<EditorEventDto> {
    return this.events.create(profileId, actor, body);
  }

  @Patch('events/:id')
  update(
    @ScopedProfile() profileId: ScopedProfileId,
    @Actor() actor: EditorActor,
    @Param('id', ParseIdPipe) id: string,
    @Body() body: EventUpdateBody,
  ): Promise<EditorEventDto> {
    return this.events.update(profileId, actor, id, body);
  }

  @Delete('events/:id')
  @HttpCode(204)
  remove(@ScopedProfile() profileId: ScopedProfileId, @Actor() actor: EditorActor, @Param('id', ParseIdPipe) id: string): Promise<void> {
    return this.events.remove(profileId, actor, id);
  }
}

@Controller(EDITOR_MOUNTS)
@UseGuards(ProfileScopeGuard)
export class ProfileGalleryController {
  constructor(private readonly gallery: ProfileGalleryService) {}

  @Get('gallery')
  list(@ScopedProfile() profileId: ScopedProfileId): Promise<EditorGalleryItemDto[]> {
    return this.gallery.list(profileId);
  }

  @Post('gallery')
  add(@ScopedProfile() profileId: ScopedProfileId, @Actor() actor: EditorActor, @Body() body: GalleryAddBody): Promise<EditorGalleryItemDto> {
    return this.gallery.add(profileId, actor, body);
  }

  @Put('gallery/order')
  order(@ScopedProfile() profileId: ScopedProfileId, @Actor() actor: EditorActor, @Body() body: OrderBody): Promise<EditorGalleryItemDto[]> {
    return this.gallery.reorder(profileId, actor, body.ids);
  }

  @Patch('gallery/:id')
  setAlt(
    @ScopedProfile() profileId: ScopedProfileId,
    @Actor() actor: EditorActor,
    @Param('id', ParseIdPipe) id: string,
    @Body() body: GalleryAltBody,
  ): Promise<EditorGalleryItemDto> {
    return this.gallery.setAlt(profileId, actor, id, body.alt);
  }

  @Delete('gallery/:id')
  @HttpCode(204)
  remove(@ScopedProfile() profileId: ScopedProfileId, @Actor() actor: EditorActor, @Param('id', ParseIdPipe) id: string): Promise<void> {
    return this.gallery.remove(profileId, actor, id);
  }
}

@Controller(EDITOR_MOUNTS)
@UseGuards(ProfileScopeGuard)
export class ProfileMediaController {
  constructor(private readonly media: ProfileMediaService) {}

  /**
   * multipart: `file` (JPG/PNG/WebP, máx. 10 MB) + `kind`. 30 subidas cada 10 min por IP. El
   * cupo (UploadGate) y la cuota se comprueban antes de leer el cuerpo (ProfileUploadInterceptor).
   */
  @Post('media')
  @Throttle({ default: { limit: 30, ttl: 600_000 } })
  @UseInterceptors(ProfileUploadInterceptor)
  upload(
    @ScopedProfile() profileId: ScopedProfileId,
    @Actor() actor: EditorActor,
    @Body() body: UploadMediaBody,
    @UploadedFile() file: Express.Multer.File | undefined,
  ): Promise<MediaAssetDto> {
    return this.media.upload(profileId, actor, body.kind, file);
  }

  @Delete('media/:id')
  @HttpCode(204)
  remove(@ScopedProfile() profileId: ScopedProfileId, @Actor() actor: EditorActor, @Param('id', ParseIdPipe) id: string): Promise<void> {
    return this.media.remove(profileId, actor, id);
  }
}
