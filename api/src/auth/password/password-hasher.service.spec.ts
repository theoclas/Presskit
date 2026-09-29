import * as argon2 from 'argon2';
import { AppError } from '../../common/errors';
import { PasswordHasher } from './password-hasher.service';
import { checkNewPassword, passwordTooLong, samePassword, weakPasswordError } from './password-policy';
import { Semaphore, SemaphoreFullError } from './semaphore';

describe('PasswordHasher', () => {
  const hasher = new PasswordHasher();

  beforeAll(() => hasher.onModuleInit());

  it('argon2id con m=19456, t=2, p=1 y verificación correcta', async () => {
    const hash = await hasher.hash('una-clave-larga-y-rara-77');
    expect(hash).toMatch(/^\$argon2id\$v=19\$m=19456,t=2,p=1\$/);
    await expect(hasher.verify(hash, 'una-clave-larga-y-rara-77')).resolves.toBe(true);
    await expect(hasher.verify(hash, 'una-clave-larga-y-rara-78')).resolves.toBe(false);
  });

  it('normaliza con NFKC: la ligadura "ﬁ" equivale a "fi"', async () => {
    const hash = await hasher.hash('ﬁesta-de-techno-2026');
    await expect(hasher.verify(hash, 'fiesta-de-techno-2026')).resolves.toBe(true);
  });

  it('hash vacío, inutilizable o roto → false (con costo de hash ficticio)', async () => {
    await expect(hasher.verify(null, 'x')).resolves.toBe(false);
    await expect(hasher.verify('x', 'x')).resolves.toBe(false);
    await expect(hasher.verify('$argon2id$roto', 'x')).resolves.toBe(false);
    await expect(hasher.dummyVerify('lo-que-sea')).resolves.toBe(false);
  });

  it('needsRehash detecta parámetros viejos y algoritmos distintos', async () => {
    const own = await hasher.hash('otra-clave-de-prueba-9');
    expect(hasher.needsRehash(own)).toBe(false);
    const old = await argon2.hash('otra-clave-de-prueba-9', { type: argon2.argon2id, memoryCost: 19_456, timeCost: 3, parallelism: 1 });
    expect(hasher.needsRehash(old)).toBe(true);
    const argon2i = await argon2.hash('otra-clave-de-prueba-9', { type: argon2.argon2i, memoryCost: 19_456, timeCost: 2, parallelism: 1 });
    expect(hasher.needsRehash(argon2i)).toBe(true);
    expect(hasher.needsRehash('$2b$12$abcdefghijklmnopqrstuv')).toBe(true);
  });

  it('con la cola llena responde 503 AUTH_BUSY en vez de encolar sin límite', async () => {
    class TinyHasher extends PasswordHasher {
      constructor() {
        super();
        this.semaphore = new Semaphore(1, 0);
      }
    }
    const tiny = new TinyHasher();
    const first = tiny.hash('primera-clave-larga-1');
    const second = tiny.hash('segunda-clave-larga-2');
    await expect(second).rejects.toBeInstanceOf(AppError);
    await expect(second).rejects.toMatchObject({ status: 503, code: 'AUTH_BUSY' });
    await expect(first).resolves.toMatch(/^\$argon2id\$/);
  });
});

describe('Semaphore', () => {
  it('limita la concurrencia y la cola', async () => {
    const sem = new Semaphore(2, 1);
    let active = 0;
    let peak = 0;
    const release: Array<() => void> = [];
    const task = () =>
      sem.run(async () => {
        active++;
        peak = Math.max(peak, active);
        await new Promise<void>((r) => release.push(r));
        active--;
      });
    const a = task();
    const b = task();
    const c = task(); // en cola
    await expect(task()).rejects.toBeInstanceOf(SemaphoreFullError);
    expect(sem.running).toBe(2);
    expect(sem.pending).toBe(1);
    release.shift()!();
    await a;
    // c heredó el cupo de a
    await new Promise((r) => setImmediate(r));
    expect(peak).toBe(2);
    release.splice(0).forEach((r) => r());
    await new Promise((r) => setImmediate(r));
    release.splice(0).forEach((r) => r());
    await Promise.all([b, c]);
    expect(sem.running).toBe(0);
  });
});

describe('política de contraseñas', () => {
  it('el admin necesita 12 caracteres; un DJ, 10', () => {
    expect(checkNewPassword('tornamesa-9', { username: 'djx', role: 'USER' })).toBeNull();
    expect(checkNewPassword('tornamesa-9', { username: 'djx', role: 'ADMIN' })).toBe('TOO_SHORT');
    expect(checkNewPassword('tornamesa-99', { username: 'djx', role: 'ADMIN' })).toBeNull();
  });

  it('rechaza contraseñas con el usuario, comunes o simples', () => {
    expect(checkNewPassword('soy-mikebran-2026', { username: 'mikebran', role: 'USER' })).toBe('CONTAINS_USERNAME');
    expect(checkNewPassword('password123', { username: 'djx', role: 'USER' })).toBe('TOO_COMMON');
    expect(checkNewPassword('aaaaaaaaaaaa', { username: 'djx', role: 'USER' })).toBe('TOO_SIMPLE');
  });

  it('error 400 PASSWORD_WEAK con el código en details.newPassword', () => {
    const err = weakPasswordError('TOO_SHORT', 'ADMIN');
    expect(err.getStatus()).toBe(400);
    expect(err.getResponse()).toMatchObject({ code: 'PASSWORD_WEAK', details: { newPassword: 'TOO_SHORT' } });
    expect(err.message).toContain('12');
  });

  it('compara y mide después de NFKC', () => {
    expect(samePassword('ﬁesta-2026', 'fiesta-2026')).toBe(true);
    expect(passwordTooLong('a'.repeat(128))).toBe(false);
    expect(passwordTooLong('a'.repeat(129))).toBe(true);
  });
});
