import type { CliCommand } from '../command';
import { seedGenresCommand } from './seed-genres.command';
import { seedMacflyCommand } from './seed-macfly.command';

// Registro de comandos. M2 agrega aquí admin:create, admin:reset-password, admin:unlock, etc.
export const COMMANDS: readonly CliCommand[] = [seedGenresCommand, seedMacflyCommand];
