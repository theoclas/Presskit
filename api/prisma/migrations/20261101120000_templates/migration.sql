-- Plantillas visuales:
-- - DjProfile.template: CLASSIC (la de siempre, valor por defecto de todos los perfiles) o SIGNAL.
-- - PaletteKey suma SIGNAL (lima/negro, la de la plantilla Signal).

-- AlterTable
ALTER TABLE `DjProfile` ADD COLUMN `template` ENUM('CLASSIC', 'SIGNAL') NOT NULL DEFAULT 'CLASSIC',
    MODIFY `palette` ENUM('SUNSET', 'MIAMI', 'NEON', 'ACID', 'INFERNO', 'OCEAN', 'GOLD', 'MONO', 'SIGNAL') NOT NULL DEFAULT 'SUNSET';
