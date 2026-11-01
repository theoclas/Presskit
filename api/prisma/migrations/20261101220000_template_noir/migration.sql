-- Plantilla Editorial Noir: TemplateKey y PaletteKey suman NOIR (marfil, borgoña, dorado).

-- AlterTable
ALTER TABLE `DjProfile` MODIFY `palette` ENUM('SUNSET', 'MIAMI', 'NEON', 'ACID', 'INFERNO', 'OCEAN', 'GOLD', 'MONO', 'SIGNAL', 'GROOVE', 'NOIR') NOT NULL DEFAULT 'SUNSET',
    MODIFY `template` ENUM('CLASSIC', 'SIGNAL', 'GROOVE', 'NOIR') NOT NULL DEFAULT 'CLASSIC';
