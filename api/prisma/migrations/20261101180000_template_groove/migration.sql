-- Plantilla Neon Groove: TemplateKey y PaletteKey suman GROOVE (naranja/violeta).

-- AlterTable
ALTER TABLE `DjProfile` MODIFY `palette` ENUM('SUNSET', 'MIAMI', 'NEON', 'ACID', 'INFERNO', 'OCEAN', 'GOLD', 'MONO', 'SIGNAL', 'GROOVE') NOT NULL DEFAULT 'SUNSET',
    MODIFY `template` ENUM('CLASSIC', 'SIGNAL', 'GROOVE') NOT NULL DEFAULT 'CLASSIC';
