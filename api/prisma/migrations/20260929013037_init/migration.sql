-- CreateTable
CREATE TABLE `User` (
    `id` VARCHAR(191) NOT NULL,
    `username` VARCHAR(24) NOT NULL,
    `email` VARCHAR(254) NULL,
    `emailVerifiedAt` DATETIME(3) NULL,
    `passwordHash` VARCHAR(255) NOT NULL,
    `passwordChangedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `mustChangePassword` BOOLEAN NOT NULL DEFAULT false,
    `tempPasswordExpiresAt` DATETIME(3) NULL,
    `role` ENUM('USER', 'ADMIN') NOT NULL DEFAULT 'USER',
    `adminSlot` BOOLEAN NULL,
    `status` ENUM('ACTIVE', 'SUSPENDED') NOT NULL DEFAULT 'ACTIVE',
    `tokenVersion` INTEGER NOT NULL DEFAULT 0,
    `failedLoginCount` INTEGER NOT NULL DEFAULT 0,
    `lockedUntil` DATETIME(3) NULL,
    `lastLoginAt` DATETIME(3) NULL,
    `lastLoginIpHash` CHAR(64) NULL,
    `mfaSecretEnc` VARCHAR(255) NULL,
    `mfaEnabledAt` DATETIME(3) NULL,
    `mfaRecoveryCodes` JSON NULL,
    `termsVersion` VARCHAR(20) NULL,
    `termsAcceptedAt` DATETIME(3) NULL,
    `privacyVersion` VARCHAR(20) NULL,
    `privacyAcceptedAt` DATETIME(3) NULL,
    `ageConfirmedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `User_username_key`(`username`),
    UNIQUE INDEX `User_email_key`(`email`),
    UNIQUE INDEX `User_adminSlot_key`(`adminSlot`),
    INDEX `User_role_idx`(`role`),
    INDEX `User_status_createdAt_idx`(`status`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `RefreshToken` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `familyId` VARCHAR(30) NOT NULL,
    `tokenHash` CHAR(64) NOT NULL,
    `expiresAt` DATETIME(3) NOT NULL,
    `familyExpiresAt` DATETIME(3) NOT NULL,
    `replacedAt` DATETIME(3) NULL,
    `replacedById` VARCHAR(30) NULL,
    `revokedAt` DATETIME(3) NULL,
    `revokeReason` ENUM('LOGOUT', 'ROTATED', 'REUSE_DETECTED', 'PASSWORD_CHANGED', 'ADMIN_ACTION', 'EXPIRED') NULL,
    `userAgent` VARCHAR(120) NULL,
    `ipHash` CHAR(64) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `lastUsedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `RefreshToken_tokenHash_key`(`tokenHash`),
    INDEX `RefreshToken_userId_revokedAt_idx`(`userId`, `revokedAt`),
    INDEX `RefreshToken_familyId_idx`(`familyId`),
    INDEX `RefreshToken_expiresAt_idx`(`expiresAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `EmailToken` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `type` ENUM('PASSWORD_RESET', 'EMAIL_VERIFY') NOT NULL,
    `tokenHash` CHAR(64) NOT NULL,
    `expiresAt` DATETIME(3) NOT NULL,
    `usedAt` DATETIME(3) NULL,
    `requestIpHash` CHAR(64) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `EmailToken_tokenHash_key`(`tokenHash`),
    INDEX `EmailToken_userId_type_createdAt_idx`(`userId`, `type`, `createdAt`),
    INDEX `EmailToken_expiresAt_idx`(`expiresAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `DjProfile` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NULL,
    `slug` VARCHAR(40) NOT NULL,
    `slugChangedAt` DATETIME(3) NULL,
    `displayName` VARCHAR(60) NOT NULL,
    `tagline` VARCHAR(120) NULL,
    `seoDescription` VARCHAR(160) NULL,
    `city` VARCHAR(60) NULL,
    `countryCode` CHAR(2) NOT NULL DEFAULT 'CO',
    `whatsappNumber` VARCHAR(15) NULL,
    `publicEmail` VARCHAR(254) NULL,
    `publicPhone` VARCHAR(20) NULL,
    `palette` ENUM('SUNSET', 'MIAMI', 'NEON', 'ACID', 'INFERNO', 'OCEAN', 'GOLD', 'MONO') NOT NULL DEFAULT 'SUNSET',
    `texts` JSON NOT NULL,
    `bookingForm` JSON NOT NULL,
    `showGallery` BOOLEAN NOT NULL DEFAULT true,
    `showRider` BOOLEAN NOT NULL DEFAULT true,
    `showEvents` BOOLEAN NOT NULL DEFAULT true,
    `showOpenDateRow` BOOLEAN NOT NULL DEFAULT true,
    `formEnabled` BOOLEAN NOT NULL DEFAULT true,
    `formOpenWhatsapp` BOOLEAN NOT NULL DEFAULT true,
    `notifyByEmail` BOOLEAN NOT NULL DEFAULT true,
    `heroImageId` VARCHAR(191) NULL,
    `cardImageId` VARCHAR(191) NULL,
    `status` ENUM('DRAFT', 'PENDING_REVIEW', 'APPROVED', 'REJECTED', 'SUSPENDED') NOT NULL DEFAULT 'DRAFT',
    `statusReason` VARCHAR(500) NULL,
    `submittedAt` DATETIME(3) NULL,
    `reviewedAt` DATETIME(3) NULL,
    `approvedAt` DATETIME(3) NULL,
    `approvedById` VARCHAR(191) NULL,
    `featured` BOOLEAN NOT NULL DEFAULT false,
    `featuredRank` INTEGER NOT NULL DEFAULT 100,
    `lastActivityAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `DjProfile_userId_key`(`userId`),
    UNIQUE INDEX `DjProfile_slug_key`(`slug`),
    UNIQUE INDEX `DjProfile_heroImageId_key`(`heroImageId`),
    UNIQUE INDEX `DjProfile_cardImageId_key`(`cardImageId`),
    INDEX `DjProfile_status_featured_featuredRank_idx`(`status`, `featured`, `featuredRank`),
    INDEX `DjProfile_status_lastActivityAt_idx`(`status`, `lastActivityAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `SlugRedirect` (
    `fromSlug` VARCHAR(60) NOT NULL,
    `profileId` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `SlugRedirect_profileId_idx`(`profileId`),
    PRIMARY KEY (`fromSlug`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Genre` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `slug` VARCHAR(40) NOT NULL,
    `name` VARCHAR(40) NOT NULL,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `sortOrder` INTEGER NOT NULL DEFAULT 0,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `Genre_slug_key`(`slug`),
    UNIQUE INDEX `Genre_name_key`(`name`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ProfileGenre` (
    `profileId` VARCHAR(191) NOT NULL,
    `genreId` INTEGER NOT NULL,
    `sortOrder` INTEGER NOT NULL DEFAULT 0,

    INDEX `ProfileGenre_genreId_idx`(`genreId`),
    PRIMARY KEY (`profileId`, `genreId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Member` (
    `id` VARCHAR(191) NOT NULL,
    `profileId` VARCHAR(191) NOT NULL,
    `name` VARCHAR(60) NOT NULL,
    `role` VARCHAR(80) NULL,
    `description` VARCHAR(400) NULL,
    `photoId` VARCHAR(191) NULL,
    `sortOrder` INTEGER NOT NULL DEFAULT 0,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `Member_photoId_key`(`photoId`),
    INDEX `Member_profileId_sortOrder_idx`(`profileId`, `sortOrder`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `SocialLink` (
    `id` VARCHAR(191) NOT NULL,
    `profileId` VARCHAR(191) NOT NULL,
    `memberId` VARCHAR(191) NULL,
    `platform` ENUM('INSTAGRAM', 'SOUNDCLOUD', 'SPOTIFY', 'TIKTOK', 'YOUTUBE', 'FACEBOOK', 'BEATPORT', 'MIXCLOUD', 'RESIDENT_ADVISOR', 'X', 'WHATSAPP', 'APPLE_MUSIC', 'BANDCAMP', 'TWITCH', 'THREADS', 'LINKTREE', 'WEBSITE') NOT NULL,
    `url` VARCHAR(500) NOT NULL,
    `label` VARCHAR(30) NULL,
    `sortOrder` INTEGER NOT NULL DEFAULT 0,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `SocialLink_profileId_memberId_sortOrder_idx`(`profileId`, `memberId`, `sortOrder`),
    INDEX `SocialLink_memberId_idx`(`memberId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `GalleryItem` (
    `id` VARCHAR(191) NOT NULL,
    `profileId` VARCHAR(191) NOT NULL,
    `mediaId` VARCHAR(191) NOT NULL,
    `alt` VARCHAR(125) NULL,
    `sortOrder` INTEGER NOT NULL DEFAULT 0,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `GalleryItem_mediaId_key`(`mediaId`),
    INDEX `GalleryItem_profileId_sortOrder_idx`(`profileId`, `sortOrder`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `RiderItem` (
    `id` VARCHAR(191) NOT NULL,
    `profileId` VARCHAR(191) NOT NULL,
    `name` VARCHAR(60) NOT NULL,
    `note` VARCHAR(80) NULL,
    `sortOrder` INTEGER NOT NULL DEFAULT 0,

    INDEX `RiderItem_profileId_sortOrder_idx`(`profileId`, `sortOrder`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Event` (
    `id` VARCHAR(191) NOT NULL,
    `profileId` VARCHAR(191) NOT NULL,
    `date` DATE NOT NULL,
    `startTime` VARCHAR(5) NULL,
    `title` VARCHAR(80) NULL,
    `venue` VARCHAR(90) NOT NULL,
    `city` VARCHAR(60) NULL,
    `flyerId` VARCHAR(191) NULL,
    `ctaType` ENUM('WHATSAPP', 'URL', 'NONE') NOT NULL DEFAULT 'WHATSAPP',
    `ctaUrl` VARCHAR(500) NULL,
    `ctaLabel` VARCHAR(20) NULL,
    `isHidden` BOOLEAN NOT NULL DEFAULT false,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `Event_flyerId_key`(`flyerId`),
    INDEX `Event_profileId_date_idx`(`profileId`, `date`),
    INDEX `Event_date_isHidden_idx`(`date`, `isHidden`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `BookingRequest` (
    `id` VARCHAR(191) NOT NULL,
    `profileId` VARCHAR(191) NOT NULL,
    `payload` JSON NOT NULL,
    `contactName` VARCHAR(80) NOT NULL,
    `contactEmail` VARCHAR(254) NULL,
    `contactPhone` VARCHAR(20) NULL,
    `eventDate` DATE NULL,
    `status` ENUM('NEW', 'READ', 'ARCHIVED', 'SPAM') NOT NULL DEFAULT 'NEW',
    `readAt` DATETIME(3) NULL,
    `archivedAt` DATETIME(3) NULL,
    `consentAt` DATETIME(3) NOT NULL,
    `consentVersion` VARCHAR(20) NOT NULL,
    `ipHash` CHAR(64) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `BookingRequest_profileId_status_createdAt_idx`(`profileId`, `status`, `createdAt`),
    INDEX `BookingRequest_createdAt_idx`(`createdAt`),
    INDEX `BookingRequest_ipHash_createdAt_idx`(`ipHash`, `createdAt`),
    INDEX `BookingRequest_contactEmail_idx`(`contactEmail`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `UsedFormNonce` (
    `nonce` CHAR(32) NOT NULL,
    `expiresAt` DATETIME(3) NOT NULL,

    INDEX `UsedFormNonce_expiresAt_idx`(`expiresAt`),
    PRIMARY KEY (`nonce`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `MediaAsset` (
    `id` VARCHAR(191) NOT NULL,
    `profileId` VARCHAR(191) NULL,
    `uploadedById` VARCHAR(191) NULL,
    `kind` ENUM('HERO', 'CARD', 'MEMBER', 'GALLERY', 'FLYER') NOT NULL,
    `storageKey` VARCHAR(80) NOT NULL,
    `variants` JSON NOT NULL,
    `hasOg` BOOLEAN NOT NULL DEFAULT false,
    `width` INTEGER NOT NULL,
    `height` INTEGER NOT NULL,
    `bytesTotal` INTEGER NOT NULL,
    `originalBytes` INTEGER NOT NULL,
    `originalMime` VARCHAR(20) NOT NULL,
    `sha256` CHAR(64) NOT NULL,
    `isPublic` BOOLEAN NOT NULL DEFAULT false,
    `attachedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `MediaAsset_storageKey_key`(`storageKey`),
    INDEX `MediaAsset_profileId_kind_idx`(`profileId`, `kind`),
    INDEX `MediaAsset_attachedAt_createdAt_idx`(`attachedAt`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `DjLegalInfo` (
    `id` VARCHAR(191) NOT NULL,
    `profileId` VARCHAR(191) NOT NULL,
    `legalName` VARCHAR(120) NOT NULL,
    `docType` ENUM('CC', 'CE', 'NIT', 'PASAPORTE', 'PPT') NOT NULL,
    `docNumber` VARCHAR(20) NOT NULL,
    `address` VARCHAR(200) NOT NULL,
    `phones` JSON NOT NULL,
    `updatedById` VARCHAR(30) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `DjLegalInfo_profileId_key`(`profileId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Ticket` (
    `id` VARCHAR(191) NOT NULL,
    `type` ENUM('PQRS_CONSULTA', 'PQRS_RECLAMO', 'REPORTE_PERFIL', 'SOLICITUD_DATOS_DJ') NOT NULL,
    `status` ENUM('OPEN', 'IN_PROGRESS', 'RESOLVED', 'REJECTED') NOT NULL DEFAULT 'OPEN',
    `profileId` VARCHAR(191) NULL,
    `profileSlug` VARCHAR(60) NULL,
    `name` VARCHAR(80) NOT NULL,
    `email` VARCHAR(254) NOT NULL,
    `phone` VARCHAR(20) NULL,
    `subject` VARCHAR(120) NOT NULL,
    `message` TEXT NOT NULL,
    `consentAt` DATETIME(3) NOT NULL,
    `consentVersion` VARCHAR(20) NOT NULL,
    `ipHash` CHAR(64) NOT NULL,
    `dueAt` DATE NOT NULL,
    `resolution` TEXT NULL,
    `resolvedAt` DATETIME(3) NULL,
    `handledById` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `Ticket_status_dueAt_idx`(`status`, `dueAt`),
    INDEX `Ticket_type_createdAt_idx`(`type`, `createdAt`),
    INDEX `Ticket_email_idx`(`email`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `AuditLog` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `actorId` VARCHAR(191) NULL,
    `actorUsername` VARCHAR(24) NULL,
    `action` VARCHAR(48) NOT NULL,
    `targetType` VARCHAR(24) NULL,
    `targetId` VARCHAR(30) NULL,
    `profileId` VARCHAR(30) NULL,
    `metadata` JSON NULL,
    `ipHash` CHAR(64) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `AuditLog_createdAt_idx`(`createdAt`),
    INDEX `AuditLog_actorId_createdAt_idx`(`actorId`, `createdAt`),
    INDEX `AuditLog_targetType_targetId_idx`(`targetType`, `targetId`),
    INDEX `AuditLog_profileId_createdAt_idx`(`profileId`, `createdAt`),
    INDEX `AuditLog_action_createdAt_idx`(`action`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `RefreshToken` ADD CONSTRAINT `RefreshToken_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `EmailToken` ADD CONSTRAINT `EmailToken_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `DjProfile` ADD CONSTRAINT `DjProfile_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `DjProfile` ADD CONSTRAINT `DjProfile_heroImageId_fkey` FOREIGN KEY (`heroImageId`) REFERENCES `MediaAsset`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `DjProfile` ADD CONSTRAINT `DjProfile_cardImageId_fkey` FOREIGN KEY (`cardImageId`) REFERENCES `MediaAsset`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `DjProfile` ADD CONSTRAINT `DjProfile_approvedById_fkey` FOREIGN KEY (`approvedById`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `SlugRedirect` ADD CONSTRAINT `SlugRedirect_profileId_fkey` FOREIGN KEY (`profileId`) REFERENCES `DjProfile`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ProfileGenre` ADD CONSTRAINT `ProfileGenre_profileId_fkey` FOREIGN KEY (`profileId`) REFERENCES `DjProfile`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ProfileGenre` ADD CONSTRAINT `ProfileGenre_genreId_fkey` FOREIGN KEY (`genreId`) REFERENCES `Genre`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Member` ADD CONSTRAINT `Member_profileId_fkey` FOREIGN KEY (`profileId`) REFERENCES `DjProfile`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Member` ADD CONSTRAINT `Member_photoId_fkey` FOREIGN KEY (`photoId`) REFERENCES `MediaAsset`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `SocialLink` ADD CONSTRAINT `SocialLink_profileId_fkey` FOREIGN KEY (`profileId`) REFERENCES `DjProfile`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `SocialLink` ADD CONSTRAINT `SocialLink_memberId_fkey` FOREIGN KEY (`memberId`) REFERENCES `Member`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `GalleryItem` ADD CONSTRAINT `GalleryItem_profileId_fkey` FOREIGN KEY (`profileId`) REFERENCES `DjProfile`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `GalleryItem` ADD CONSTRAINT `GalleryItem_mediaId_fkey` FOREIGN KEY (`mediaId`) REFERENCES `MediaAsset`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `RiderItem` ADD CONSTRAINT `RiderItem_profileId_fkey` FOREIGN KEY (`profileId`) REFERENCES `DjProfile`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Event` ADD CONSTRAINT `Event_profileId_fkey` FOREIGN KEY (`profileId`) REFERENCES `DjProfile`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Event` ADD CONSTRAINT `Event_flyerId_fkey` FOREIGN KEY (`flyerId`) REFERENCES `MediaAsset`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `BookingRequest` ADD CONSTRAINT `BookingRequest_profileId_fkey` FOREIGN KEY (`profileId`) REFERENCES `DjProfile`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `MediaAsset` ADD CONSTRAINT `MediaAsset_profileId_fkey` FOREIGN KEY (`profileId`) REFERENCES `DjProfile`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `MediaAsset` ADD CONSTRAINT `MediaAsset_uploadedById_fkey` FOREIGN KEY (`uploadedById`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `DjLegalInfo` ADD CONSTRAINT `DjLegalInfo_profileId_fkey` FOREIGN KEY (`profileId`) REFERENCES `DjProfile`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Ticket` ADD CONSTRAINT `Ticket_profileId_fkey` FOREIGN KEY (`profileId`) REFERENCES `DjProfile`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Ticket` ADD CONSTRAINT `Ticket_handledById_fkey` FOREIGN KEY (`handledById`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `AuditLog` ADD CONSTRAINT `AuditLog_actorId_fkey` FOREIGN KEY (`actorId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
