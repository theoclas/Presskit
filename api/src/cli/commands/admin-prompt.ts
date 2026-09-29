import { createInterface, type Interface } from 'node:readline';
import { Writable } from 'node:stream';

// Entrada por terminal para los comandos admin:*. Las contraseñas se escriben con el eco
// apagado y NUNCA se aceptan como argumento (quedarían en /proc/*/cmdline y en el historial).

export class Prompter {
  private rl: Interface | null = null;
  private muted = false;
  private readonly out = new Writable({
    write: (chunk: Buffer | string, _enc: BufferEncoding, cb: (err?: Error | null) => void) => {
      if (!this.muted) process.stdout.write(chunk);
      cb();
    },
  });

  static isInteractive(): boolean {
    return !!process.stdin.isTTY && !!process.stdout.isTTY;
  }

  async ask(question: string): Promise<string> {
    const answer = await new Promise<string>((resolve) => this.iface().question(question, resolve));
    return answer.trim();
  }

  /** Lee sin mostrar lo que se escribe (ni asteriscos: tampoco se revela la longitud). */
  async askHidden(question: string): Promise<string> {
    process.stdout.write(question);
    this.muted = true;
    try {
      return await new Promise<string>((resolve) => this.iface().question('', resolve));
    } finally {
      this.muted = false;
      process.stdout.write('\n');
    }
  }

  close(): void {
    this.rl?.close();
    this.rl = null;
  }

  private iface(): Interface {
    if (!this.rl) {
      this.rl = createInterface({ input: process.stdin, output: this.out, terminal: true });
      this.rl.on('SIGINT', () => {
        process.stdout.write('\nCancelado.\n');
        process.exit(130);
      });
    }
    return this.rl;
  }
}

/** --password-stdin: la primera línea de la entrada estándar (sin el salto final). */
export async function readPasswordFromStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of process.stdin) {
    const buf = typeof chunk === 'string' ? Buffer.from(chunk) : (chunk as Buffer);
    size += buf.length;
    if (size > 8 * 1024) throw new Error('La entrada estándar es demasiado larga.');
    chunks.push(buf);
  }
  const first = Buffer.concat(chunks).toString('utf8').split(/\r?\n/)[0] ?? '';
  if (!first) throw new Error('No llegó ninguna contraseña por la entrada estándar.');
  return first;
}

export const NEEDS_TTY =
  'Este comando necesita una terminal interactiva: docker compose run --rm -it api node dist/cli/main.js <comando>';
