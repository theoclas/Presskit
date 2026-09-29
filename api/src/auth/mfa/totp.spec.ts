import { randomBytes } from 'node:crypto';
import { authenticator } from 'otplib';
import { encryptSecret } from '../../common/crypto';
import type { AppConfig } from '../../config/app-config.service';
import { MfaService } from './mfa.service';
import {
  consumeRecoveryCode,
  currentTotp,
  generateRecoveryCodes,
  generateTotpSecret,
  hashRecoveryCodes,
  normalizeRecoveryCode,
  recoveryKey,
  totpKeyUri,
  totpStep,
} from './totp';

const KEY = randomBytes(32);

describe('TOTP', () => {
  it('secreto base32 de 160 bits y URI con emisor "Fersua Studio"', () => {
    const s = generateTotpSecret();
    expect(s).toMatch(/^[A-Z2-7]{32}$/);
    const uri = totpKeyUri('fersua', s);
    expect(uri).toMatch(/^otpauth:\/\/totp\/Fersua%20Studio:fersua\?/);
    expect(uri).toContain(`secret=${s}`);
    expect(uri).toContain('issuer=Fersua%20Studio');
  });

  it('acepta el código actual y rechaza otros o basura', () => {
    const s = generateTotpSecret();
    const code = currentTotp(s);
    expect(totpStep(s, code)).toBe(Math.floor(Date.now() / 30_000));
    const wrong = String((Number(code) + 500_000) % 1_000_000).padStart(6, '0');
    expect(totpStep(s, wrong)).toBeNull();
    expect(totpStep(s, '12345')).toBeNull();
    expect(totpStep(s, 'abcdef')).toBeNull();
  });

  it('ventana 1: acepta el código del paso anterior', () => {
    const s = generateTotpSecret();
    const prev = authenticator.clone({ epoch: Date.now() - 30_000 }).generate(s);
    expect(totpStep(s, prev)).not.toBeNull();
    const old = authenticator.clone({ epoch: Date.now() - 120_000 }).generate(s);
    expect(totpStep(s, old)).toBeNull();
  });
});

describe('códigos de recuperación', () => {
  const rk = recoveryKey(KEY);

  it('10 códigos XXXX-XXXX únicos sin caracteres ambiguos', () => {
    const codes = generateRecoveryCodes();
    expect(codes).toHaveLength(10);
    expect(new Set(codes).size).toBe(10);
    for (const c of codes) expect(c).toMatch(/^[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$/);
  });

  it('se guardan solo como HMAC y se consumen una vez', () => {
    const codes = generateRecoveryCodes();
    const stored = hashRecoveryCodes(rk, codes);
    expect(JSON.stringify(stored)).not.toContain(codes[0]!.replace('-', ''));
    const left = consumeRecoveryCode(rk, stored, codes[3]!.toLowerCase().replace('-', ' '));
    expect(left).toHaveLength(9);
    expect(consumeRecoveryCode(rk, left, codes[3]!)).toBeNull();
    expect(consumeRecoveryCode(rk, left, codes[4]!)).toHaveLength(8);
    expect(consumeRecoveryCode(rk, stored, 'AAAA-AAAA')).toBeNull();
    expect(consumeRecoveryCode(rk, 'no-es-lista', codes[0]!)).toBeNull();
    // Otra clave (otro servidor) no reconoce los hashes.
    expect(consumeRecoveryCode(recoveryKey(randomBytes(32)), stored, codes[0]!)).toBeNull();
  });

  it('normaliza mayúsculas, espacios y guion', () => {
    expect(normalizeRecoveryCode(' abcd-ef23 ')).toBe('ABCDEF23');
    expect(normalizeRecoveryCode('ABCD-EF2')).toBeNull();
    expect(normalizeRecoveryCode('OOOO-0000')).toBeNull();
  });
});

describe('MfaService', () => {
  const config = { mfaEncKey: KEY } as AppConfig;

  it('verifica el TOTP cifrado y no deja reusar el mismo código', () => {
    const mfa = new MfaService(config);
    const secret = generateTotpSecret();
    const enc = encryptSecret(KEY, secret);
    const code = currentTotp(secret);
    expect(mfa.verifyTotp('u1', enc, code)).toBe(true);
    expect(mfa.verifyTotp('u1', enc, code)).toBe(false);
    expect(mfa.verifyTotp('u1', null, code)).toBe(false);
    expect(mfa.verifyTotp('u2', 'v1.roto.roto.roto', code)).toBe(false);
    expect(mfa.verifyTotp('u3', encryptSecret(randomBytes(32), secret), code)).toBe(false);
  });

  it('quema el mfaToken tras 3 intentos fallidos', () => {
    const mfa = new MfaService(config);
    expect(mfa.failAttempt('j1')).toBe(false);
    expect(mfa.failAttempt('j1')).toBe(false);
    expect(mfa.isBurned('j1')).toBe(false);
    expect(mfa.failAttempt('j1')).toBe(true);
    expect(mfa.isBurned('j1')).toBe(true);
  });

  it('consume códigos de recuperación con la clave derivada de MFA_ENC_KEY', () => {
    const mfa = new MfaService(config);
    const codes = generateRecoveryCodes();
    const stored = hashRecoveryCodes(mfa.recoveryHashKey, codes);
    expect(mfa.consumeRecovery(stored, codes[0]!)).toHaveLength(9);
    expect(mfa.consumeRecovery(stored, 'ZZZZ-ZZZZ')).toBeNull();
  });
});
