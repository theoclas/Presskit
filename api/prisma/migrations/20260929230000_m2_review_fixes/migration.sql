-- Revisión de M2:
-- - User.mfaFailedCount / mfaLockedUntil: fallos de 2FA seguidos entre mfaTokens y pausa progresiva.
-- - DjLegalInfo sobrevive al borrado del perfil (profileId NULL + closedAt) para conservar 12 meses
--   el registro del art. 53 (Ley 1480).

-- DropForeignKey
ALTER TABLE `DjLegalInfo` DROP FOREIGN KEY `DjLegalInfo_profileId_fkey`;

-- AlterTable
ALTER TABLE `DjLegalInfo` ADD COLUMN `closedAt` DATETIME(3) NULL,
    ADD COLUMN `closedDisplayName` VARCHAR(60) NULL,
    ADD COLUMN `closedProfileSlug` VARCHAR(40) NULL,
    MODIFY `profileId` VARCHAR(191) NULL;

-- AlterTable
ALTER TABLE `User` ADD COLUMN `mfaFailedCount` INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN `mfaLockedUntil` DATETIME(3) NULL;

-- CreateIndex
CREATE INDEX `DjLegalInfo_closedAt_idx` ON `DjLegalInfo`(`closedAt`);

-- AddForeignKey
ALTER TABLE `DjLegalInfo` ADD CONSTRAINT `DjLegalInfo_profileId_fkey` FOREIGN KEY (`profileId`) REFERENCES `DjProfile`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

