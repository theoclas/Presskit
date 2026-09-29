import { Module } from '@nestjs/common';
import { MediaModule } from '../media/media.module';
import { AdminProfilesController } from './admin-profiles.controller';
import { AdminProfilesService } from './admin-profiles.service';
import {
  ProfileEventsController,
  ProfileGalleryController,
  ProfileMediaController,
  ProfileMembersController,
} from './profile-content.controller';
import { OwnerProfileController, ProfileEditorController } from './profile-editor.controller';
import { ProfileEditorService } from './profile-editor.service';
import { ProfileEventsService } from './profile-events.service';
import { ProfileGalleryService } from './profile-gallery.service';
import { ProfileLegalService } from './profile-legal.service';
import { ProfileMediaService } from './profile-media.service';
import { ProfileMembersService } from './profile-members.service';
import { ProfileStatusService } from './profile-status.service';
import { ProfileStore } from './profile-store.service';
import { ProfileUploadInterceptor } from './profile-upload.interceptor';
import { LegalRetentionJob } from './legal-retention.job';

// Editor de perfiles [me|adm] (dueño en /api/me/profile, admin en /api/admin/profiles/:profileId),
// subidas de media y ciclo de vida de perfiles del admin (/api/admin/profiles).
@Module({
  imports: [MediaModule],
  controllers: [
    ProfileEditorController,
    OwnerProfileController,
    ProfileMembersController,
    ProfileEventsController,
    ProfileGalleryController,
    ProfileMediaController,
    AdminProfilesController,
  ],
  providers: [
    ProfileStore,
    ProfileEditorService,
    ProfileMembersService,
    ProfileEventsService,
    ProfileGalleryService,
    ProfileMediaService,
    ProfileLegalService,
    ProfileStatusService,
    AdminProfilesService,
    ProfileUploadInterceptor,
    LegalRetentionJob,
  ],
  exports: [ProfileStore, ProfileEditorService, ProfileStatusService],
})
export class ProfilesModule {}
