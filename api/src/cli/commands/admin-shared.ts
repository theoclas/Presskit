import { chmodSync, writeFileSync } from 'node:fs';
import * as path from 'node:path';
import * as QRCode from 'qrcode';
import { encryptSecret } from '../../common/crypto';
import { AppConfig } from '../../config/app-config.service';
import { PrismaService } from '../../prisma/prisma.service';
import { checkNewPassword, passwordErrorMessage } from '../../auth/password/password-policy';
import {
  generateRecoveryCodes,
  generateTotpSecret,
  hashRecoveryCodes,
  recoveryKey,
  totpKeyUri,
  totpStep,
} from '../../auth/mfa/totp';
import { Prompter, readPasswordFromStdin } from './admin-prompt';

// Piezas comunes de admin:create, admin:reset-password y admin:reset-mfa.

export const ADMIN_SELECT = { id: true, username: true, email: true, role: true } as const;

/** El único admin (role ADMIN). Falla con un mensaje claro si no existe. */
export async function findAdmin(prisma: PrismaService) {
  const admin = await prisma.user.findFirst({ where: { role: 'ADMIN' }, select: ADMIN_SELECT, orderBy: { createdAt: 'asc' } });
  if (!admin) throw new Error('No hay un administrador. Créalo con admin:create.');
  return admin;
}

/**
 * Contraseña nueva del admin: por la entrada estándar (--password-stdin, sin confirmación)
 * o por TTY con eco apagado, dos veces. Aplica la política (mínimo 12 para el admin).
 */
export async function obtainAdminPassword(opts: { username: string; fromStdin: boolean; prompter: Prompter }): Promise<string> {
  if (opts.fromStdin) {
    const pw = await readPasswordFromStdin();
    const err = checkNewPassword(pw, { username: opts.username, role: 'ADMIN' });
    if (err) throw new Error(`Contraseña rechazada: ${passwordErrorMessage(err, 'ADMIN')}`);
    return pw;
  }
  for (let attempt = 1; attempt <= 3; attempt++) {
    const pw = await opts.prompter.askHidden('Contraseña (mínimo 12 caracteres, no se muestra): ');
    const err = checkNewPassword(pw, { username: opts.username, role: 'ADMIN' });
    if (err) {
      console.log(`  ${passwordErrorMessage(err, 'ADMIN')}`);
      continue;
    }
    const again = await opts.prompter.askHidden('Repítela: ');
    if (again !== pw) {
      console.log('  No coinciden. Intenta de nuevo.');
      continue;
    }
    return pw;
  }
  throw new Error('Demasiados intentos. No se cambió nada.');
}

export interface TotpSetup {
  secretEnc: string;
  recoveryCodes: string[];
  recoveryHashes: string[];
}

/**
 * Genera el secreto TOTP, muestra la URI otpauth:// y el QR, y pide un código para confirmar
 * que la app quedó bien configurada (3 intentos). Con --totp-secret-out (solo automatización)
 * escribe el secreto en ese archivo (permisos 600) y no pide confirmación.
 */
export async function setupTotp(opts: {
  username: string;
  config: AppConfig;
  prompter: Prompter | null;
  secretOut: string | null;
}): Promise<TotpSetup> {
  const secret = generateTotpSecret();
  const uri = totpKeyUri(opts.username, secret);

  console.log('\nVerificación en dos pasos (TOTP). Escanea este QR con tu app de autenticación');
  console.log('(Google Authenticator, Microsoft Authenticator, 1Password, Aegis…):\n');
  console.log(await QRCode.toString(uri, { type: 'terminal', small: true }));
  console.log('Si no puedes escanearlo, agrega la cuenta a mano con esta URI:');
  console.log(`  ${uri}\n`);

  if (opts.secretOut) {
    const file = path.resolve(opts.secretOut);
    writeFileSync(file, `${secret}\n`, { mode: 0o600 });
    chmodSync(file, 0o600);
    console.log(`Secreto escrito en ${file} (permisos 600). Bórralo apenas termines la prueba.\n`);
  } else {
    if (!opts.prompter) throw new Error('Sin terminal no se puede confirmar el código TOTP.');
    let confirmed = false;
    for (let attempt = 1; attempt <= 3 && !confirmed; attempt++) {
      const code = (await opts.prompter.ask('Código de 6 dígitos que muestra la app: ')).replace(/\s+/g, '');
      confirmed = totpStep(secret, code) !== null;
      if (!confirmed) console.log('  Ese código no coincide. Revisa la hora del teléfono e intenta de nuevo.');
    }
    if (!confirmed) throw new Error('No se pudo confirmar el TOTP. No se cambió nada.');
  }

  const recoveryCodes = generateRecoveryCodes();
  return {
    secretEnc: encryptSecret(opts.config.mfaEncKey, secret),
    recoveryCodes,
    recoveryHashes: hashRecoveryCodes(recoveryKey(opts.config.mfaEncKey), recoveryCodes),
  };
}

export function printRecoveryCodes(codes: string[]): void {
  console.log('\nCódigos de recuperación (cada uno sirve UNA vez si pierdes el teléfono).');
  console.log('Guárdalos ahora en tu gestor de contraseñas: no se vuelven a mostrar.\n');
  for (let i = 0; i < codes.length; i += 2) {
    console.log(`  ${codes[i] ?? ''}    ${codes[i + 1] ?? ''}`);
  }
  console.log('');
}
