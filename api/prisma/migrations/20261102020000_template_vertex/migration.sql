-- Plantilla Vertex Club (pantalla dividida): TemplateKey y PaletteKey suman VERTEX (carbón, naranja señalética).

-- AlterTable
ALTER TABLE `DjProfile` MODIFY `palette` ENUM('SUNSET', 'MIAMI', 'NEON', 'ACID', 'INFERNO', 'OCEAN', 'GOLD', 'MONO', 'SIGNAL', 'GROOVE', 'NOIR', 'HYPERWAVE', 'VERTEX') NOT NULL DEFAULT 'SUNSET',
    MODIFY `template` ENUM('CLASSIC', 'SIGNAL', 'GROOVE', 'NOIR', 'HYPERWAVE', 'VERTEX') NOT NULL DEFAULT 'CLASSIC';
