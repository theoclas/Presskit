-- Plantilla Hyperwave (mosaico): TemplateKey y PaletteKey suman HYPERWAVE (azul eléctrico, cian, plateado).

-- AlterTable
ALTER TABLE `DjProfile` MODIFY `palette` ENUM('SUNSET', 'MIAMI', 'NEON', 'ACID', 'INFERNO', 'OCEAN', 'GOLD', 'MONO', 'SIGNAL', 'GROOVE', 'NOIR', 'HYPERWAVE') NOT NULL DEFAULT 'SUNSET',
    MODIFY `template` ENUM('CLASSIC', 'SIGNAL', 'GROOVE', 'NOIR', 'HYPERWAVE') NOT NULL DEFAULT 'CLASSIC';
