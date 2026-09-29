import type { INestApplicationContext } from '@nestjs/common';
import type { FlagSpec, ParsedArgs } from './args';

/**
 * Un comando de la CLI. Para agregar uno (M2: "admin:create", "admin:reset-password",
 * "admin:unlock", "admin:disable-mfa"): crear el archivo en commands/ y sumarlo a COMMANDS
 * en commands/index.ts. Nada más.
 */
export interface CliCommand {
  /** "grupo:accion", ej. "seed:macfly". */
  name: string;
  summary: string;
  /** Línea de uso que se imprime en la ayuda, sin el prefijo del ejecutable. */
  usage: string;
  flags: FlagSpec;
  run(app: INestApplicationContext, args: ParsedArgs): Promise<void>;
}
