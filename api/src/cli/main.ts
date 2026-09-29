import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { CliUsageError, parseArgs } from './args';
import { CliModule } from './cli.module';
import { COMMANDS } from './commands';

// CLI de operación. Uso:
//   node dist/cli/main.js <comando> [opciones]
//   npm run cli -w api -- <comando> [opciones]          (desarrollo)
//   docker compose run --rm api node dist/cli/main.js <comando>   (VPS)

function printHelp(): void {
  console.log('Uso: node dist/cli/main.js <comando> [opciones]\n\nComandos:');
  for (const c of COMMANDS) console.log(`  ${c.usage.padEnd(44)} ${c.summary}`);
}

async function main(): Promise<number> {
  const [name, ...rest] = process.argv.slice(2);
  if (!name || name === 'help' || name === '--help' || name === '-h') {
    printHelp();
    return name ? 0 : 2;
  }
  const command = COMMANDS.find((c) => c.name === name);
  if (!command) {
    console.error(`Comando desconocido: ${name}\n`);
    printHelp();
    return 2;
  }

  let args;
  try {
    args = parseArgs(rest, command.flags);
  } catch (err) {
    if (err instanceof CliUsageError) {
      console.error(`${err.message}\nUso: ${command.usage}`);
      return 2;
    }
    throw err;
  }

  // Solo errores y avisos de Nest: la salida normal la imprime cada comando.
  const app = await NestFactory.createApplicationContext(CliModule, { logger: ['error', 'warn'] });
  try {
    await command.run(app, args);
    return 0;
  } finally {
    await app.close();
  }
}

main()
  .then((code) => {
    process.exitCode = code;
  })
  .catch((err: unknown) => {
    console.error(`\nError: ${err instanceof Error ? err.message : String(err)}`);
    if (process.env.CLI_DEBUG === '1' && err instanceof Error) console.error(err.stack);
    process.exitCode = 1;
  });
