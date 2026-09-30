import { IsBoolean, IsOptional, IsString, Length, MaxLength } from 'class-validator';
import type { AcceptTermsInput, ForgotPasswordInput, RegisterInput, ResetPasswordInput, VerifyEmailInput } from '@fersua/shared';
import { PASSWORD_MAX_RAW } from './auth.dto';

// Solo forma y tamaño. Las reglas (formato del usuario y del correo, política de contraseñas,
// casillas en true) las aplica AccountService para devolver códigos útiles en `details`.

/** Tokens de correo: 65 caracteres; el margen evita cortar uno bien formado. */
const EMAIL_TOKEN_MAX_RAW = 200;

export class RegisterBody implements RegisterInput {
  @IsString()
  @Length(1, 64)
  username!: string;

  @IsString()
  @Length(1, 320)
  email!: string;

  @IsString()
  @Length(1, PASSWORD_MAX_RAW)
  password!: string;

  // Tipadas como `true` por el contrato; el servidor exige `=== true` (AccountService).
  @IsBoolean()
  acceptTerms!: true;

  @IsBoolean()
  acceptPrivacy!: true;

  @IsBoolean()
  confirmAge!: true;

  /** Honeypot: una persona nunca lo ve ni lo llena. */
  @IsOptional()
  @IsString()
  @MaxLength(500)
  hp_x7?: string;
}

export class VerifyEmailBody implements VerifyEmailInput {
  @IsString()
  @Length(1, EMAIL_TOKEN_MAX_RAW)
  token!: string;
}

export class ForgotPasswordBody implements ForgotPasswordInput {
  /** Usuario o correo. */
  @IsString()
  @Length(1, 320)
  identifier!: string;
}

export class ResetPasswordBody implements ResetPasswordInput {
  @IsString()
  @Length(1, EMAIL_TOKEN_MAX_RAW)
  token!: string;

  @IsString()
  @Length(1, PASSWORD_MAX_RAW)
  newPassword!: string;
}

export class AcceptTermsBody implements AcceptTermsInput {
  @IsBoolean()
  acceptTerms!: true;

  @IsBoolean()
  acceptPrivacy!: true;

  /** Solo la exige (en true) una cuenta que nunca declaró ser mayor de edad. */
  @IsOptional()
  @IsBoolean()
  confirmAge?: true;
}
