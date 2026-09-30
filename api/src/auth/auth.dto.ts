import { IsString, Length, Matches, MaxLength, MinLength } from 'class-validator';
import type { ChangePasswordInput, LoginInput, MfaVerifyInput, StepUpInput } from '@fersua/shared';

// Límites de forma, no de política: la política (longitud mínima, lista de comunes) la aplica
// el servicio con validatePassword para dar códigos de error útiles. 512 deja margen para que
// NFKC expanda caracteres; después se corta en 128 normalizados.
export const PASSWORD_MAX_RAW = 512;

export class LoginBody implements LoginInput {
  @IsString()
  @Length(1, 64)
  username!: string;

  @IsString()
  @Length(1, PASSWORD_MAX_RAW)
  password!: string;
}

export class MfaVerifyBody implements MfaVerifyInput {
  @IsString()
  @Length(1, 2048)
  mfaToken!: string;

  /** 6 dígitos o XXXX-XXXX (con o sin guion, espacios tolerados). */
  @IsString()
  @Matches(/^[0-9A-Za-z\s-]{6,12}$/)
  code!: string;
}

export class ChangePasswordBody implements ChangePasswordInput {
  @IsString()
  @Length(1, PASSWORD_MAX_RAW)
  currentPassword!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(PASSWORD_MAX_RAW)
  newPassword!: string;
}

export class StepUpBody implements StepUpInput {
  @IsString()
  @Length(1, PASSWORD_MAX_RAW)
  password!: string;

  @IsString()
  @Matches(/^\d{6}$/)
  code!: string;
}
