import type { CliCommand } from '../command';
import { adminCreateCommand } from './admin-create.command';
import { adminResetMfaCommand } from './admin-reset-mfa.command';
import { adminResetPasswordCommand } from './admin-reset-password.command';
import { adminUnlockCommand } from './admin-unlock.command';
import { opsAlertCommand } from './ops-alert.command';
import { seedGenresCommand } from './seed-genres.command';
import { seedMacflyCommand } from './seed-macfly.command';

// Registro de comandos. Para agregar uno: crear el archivo en commands/ y sumarlo aquí.
export const COMMANDS: readonly CliCommand[] = [
  seedGenresCommand,
  seedMacflyCommand,
  adminCreateCommand,
  adminResetPasswordCommand,
  adminUnlockCommand,
  adminResetMfaCommand,
  opsAlertCommand,
];
