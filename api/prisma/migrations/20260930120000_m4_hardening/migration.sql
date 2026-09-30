-- M4 (endurecimiento):
-- - Ticket.isSpam: honeypot o por encima de los topes diarios. Se guarda, pero no avisa al admin
--   ni cuenta en la bandeja, los contadores ni la insignia. Índice para la bandeja sin spam.
-- - BookingRequest.ownerDeletedAt: borrado suave desde el panel del DJ; el admin la conserva
--   hasta la purga de 12 meses. Índice para la bandeja, el conteo y las no leídas del dueño.

-- AlterTable
ALTER TABLE `BookingRequest` ADD COLUMN `ownerDeletedAt` DATETIME(3) NULL;

-- AlterTable
ALTER TABLE `Ticket` ADD COLUMN `isSpam` BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE INDEX `BookingRequest_profileId_ownerDeletedAt_status_idx` ON `BookingRequest`(`profileId`, `ownerDeletedAt`, `status`);

-- CreateIndex
CREATE INDEX `Ticket_isSpam_status_dueAt_idx` ON `Ticket`(`isSpam`, `status`, `dueAt`);
