import { IsIn, IsOptional, IsString, MaxLength, ValidateIf } from 'class-validator';
import { USER_STATUSES, type CreateUserInput, type UpdateUserEmailInput, type UserStatus } from '@fersua/shared';
import { PageQuery, SEARCH_MAX } from '../admin-common';

export class ListUsersQuery extends PageQuery {
  /** Busca en username y correo. */
  @IsOptional()
  @IsString()
  @MaxLength(SEARCH_MAX)
  q?: string;

  @IsOptional()
  @IsIn(USER_STATUSES)
  status?: UserStatus;
}

/**
 * Alta manual de un DJ. Sin campo de rol: esta ruta solo crea USER. Los topes son un corte
 * grueso; validateUsername / isValidEmail (shared) deciden después de normalizar.
 */
export class CreateUserBody implements CreateUserInput {
  @IsString()
  @MaxLength(64)
  username!: string;

  @IsOptional()
  @IsString()
  @MaxLength(320)
  email?: string | null;
}

/** Cambiar el correo: la clave es obligatoria (null o '' = quitarlo); un cuerpo vacío no borra nada. */
export class UpdateUserEmailBody implements UpdateUserEmailInput {
  @ValidateIf((o: UpdateUserEmailBody) => o.email !== null)
  @IsString()
  @MaxLength(320)
  email!: string | null;
}

/** Borrar una cuenta exige escribir su usuario. */
export class ConfirmUsernameBody {
  @IsString()
  @MaxLength(64)
  confirm!: string;
}
