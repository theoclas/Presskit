import { Module } from '@nestjs/common';
import { MediaModule } from '../media/media.module';
import { AdminProfilesController } from './admin-profiles.controller';
import { AdminProfilesService } from './admin-profiles.service';
import { OwnerBookingsController } from './owner-bookings.controller';
import { OwnerBookingsService } from './owner-bookings.service';
import { OwnerOnboardingController } from './owner-onboarding.controller';
import { OwnerOnboardingService } from './owner-onboarding.service';
import { OwnerPurgeJob } from './owner-purge.job';
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
import { ProfileNotifier } from './profile-notifier.service';
import { ProfileStatusService } from './profile-status.service';
import { ProfileStore } from './profile-store.service';
import { ProfileUploadInterceptor } from './profile-upload.interceptor';
import { LegalRetentionJob } from './legal-retention.job';

// Editor de perfiles [me|adm] (dueño en /api/me/profile, admin en /api/admin/profiles/:profileId),
// subidas de media y ciclo de vida de perfiles del admin (/api/admin/profiles).
// M3, lado del dueño: onboarding (/api/me/profile, /api/me/genres), bandeja de solicitudes
// (/api/me/profile/bookings), avisos por correo del ciclo de vida y purgas programadas.
@Module({
  imports: [MediaModule],
  controllers: [
    // Antes que el editor: sus rutas no llevan ProfileScopeGuard (sirven sin perfil).
    OwnerOnboardingController,
    ProfileEditorController,
    OwnerProfileController,
    OwnerBookingsController,
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
    ProfileNotifier,
    ProfileStatusService,
    AdminProfilesService,
    ProfileUploadInterceptor,
    LegalRetentionJob,
    OwnerOnboardingService,
    OwnerBookingsService,
    OwnerPurgeJob,
  ],
  exports: [ProfileStore, ProfileEditorService, ProfileStatusService],
})
export class ProfilesModule {}
