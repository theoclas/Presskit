// Parser mínimo de argumentos para la CLI. Estricto a propósito: un flag mal escrito
// (p. ej. "--forse") debe fallar, no ignorarse en silencio en un comando que borra datos.

export type FlagSpec = Record<string, 'string' | 'boolean'>;

export interface ParsedArgs {
  flags: Record<string, string | boolean>;
  positionals: string[];
}

export class CliUsageError extends Error {}

export function parseArgs(argv: string[], spec: FlagSpec): ParsedArgs {
  const flags: Record<string, string | boolean> = Object.create(null);
  const positionals: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    if (!arg.startsWith('--')) {
      positionals.push(arg);
      continue;
    }
    const eq = arg.indexOf('=');
    const name = eq === -1 ? arg.slice(2) : arg.slice(2, eq);
    const type = Object.prototype.hasOwnProperty.call(spec, name) ? spec[name] : undefined;
    if (!type) throw new CliUsageError(`Opción desconocida: --${name}`);
    if (type === 'boolean') {
      if (eq !== -1) throw new CliUsageError(`--${name} no lleva valor`);
      flags[name] = true;
      continue;
    }
    const value = eq !== -1 ? arg.slice(eq + 1) : argv[++i];
    if (value === undefined || value === '' || (eq === -1 && value.startsWith('--'))) {
      throw new CliUsageError(`--${name} necesita un valor`);
    }
    flags[name] = value;
  }
  return { flags, positionals };
}
