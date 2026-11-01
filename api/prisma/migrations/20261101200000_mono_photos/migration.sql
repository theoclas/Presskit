-- Opción de la plantilla Signal: fotos en blanco y negro (por defecto, como hasta ahora) o a color.

-- AlterTable
ALTER TABLE `DjProfile` ADD COLUMN `monoPhotos` BOOLEAN NOT NULL DEFAULT true;
