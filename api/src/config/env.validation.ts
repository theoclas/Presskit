import * as Joi from 'joi';

const isProd = process.env.NODE_ENV === 'production';
const secret = (min: number) => Joi.string().min(isProd ? min : 16).required();

const SECRET_KEYS = ['JWT_ACCESS_SECRET', 'BOOKING_FORM_SECRET', 'IP_HASH_SECRET', 'MFA_ENC_KEY'] as const;
/** Menos caracteres distintos que esto no es un secreto aleatorio (un hex aleatorio de 64 trae ~16). */
const MIN_DISTINCT_CHARS = 8;

/**
 * Por qué un secreto no sirve en producción, o null. El largo solo no basta: los valores de
 * api/.env.example (públicos en el repo) y una clave de ceros pasan cualquier mínimo, y con
 * ellos se pueden falsificar tokens de 2FA, cookies de dispositivo y firmas de vista previa.
 */
export function weakSecretReason(value: string): string | null {
  if (/change-me|^dev-|example|placeholder/i.test(value)) return 'es un valor de ejemplo';
  if (new Set(value).size < MIN_DISTINCT_CHARS) return 'no parece aleatorio';
  return null;
}

/** Problemas de los secretos de producción (vacío = todo bien). Exportada para las pruebas. */
export function productionSecretProblems(env: Record<string, unknown>): string[] {
  const problems: string[] = [];
  for (const key of SECRET_KEYS) {
    const value = env[key];
    if (typeof value !== 'string') continue;
    const reason = weakSecretReason(value);
    if (reason) problems.push(`${key} ${reason}`);
  }
  // Secretos repetidos: filtrar uno regalaría los demás (cada uno firma algo distinto).
  const seen = new Map<string, string>();
  for (const key of SECRET_KEYS) {
    const value = env[key];
    if (typeof value !== 'string') continue;
    const twin = seen.get(value);
    if (twin) problems.push(`${key} es igual a ${twin}`);
    else seen.set(value, key);
  }
  return problems;
}

/**
 * Variables de entorno. En producción el api se niega a arrancar si falta algo o si un
 * secreto es débil. Las credenciales del admin NUNCA van aquí: se crean con la CLI.
 */
export const envValidationSchema = Joi.object({
  NODE_ENV: Joi.string().valid('development', 'production', 'test').default('development'),
  PORT: Joi.number().port().default(3000),
  DATABASE_URL: Joi.string().required(),
  PUBLIC_URL: isProd
    ? Joi.string().uri({ scheme: ['https'] }).required()
    : Joi.string().uri({ scheme: ['http', 'https'] }).required(),
  CORS_ORIGINS: Joi.string().allow('').default(''),
  TRUST_PROXY: Joi.string().default('loopback'),
  APP_TIMEZONE: Joi.string().default('America/Bogota'),

  JWT_ACCESS_SECRET: secret(64),
  BOOKING_FORM_SECRET: secret(32),
  IP_HASH_SECRET: secret(32),
  /** 32 bytes en hex: cifra el secreto TOTP del admin. */
  MFA_ENC_KEY: Joi.string().hex().length(64).required(),
  /** false solo en desarrollo: la cookie pasa a llamarse "rt" (el prefijo __Host- exige Secure). */
  COOKIE_SECURE: isProd ? Joi.boolean().valid(true).default(true) : Joi.boolean().default(true),

  SMTP_HOST: Joi.string().required(),
  SMTP_PORT: Joi.number().port().default(465),
  SMTP_SECURE: Joi.boolean().default(true),
  SMTP_USER: isProd ? Joi.string().required() : Joi.string().allow('').default(''),
  SMTP_PASS: isProd ? Joi.string().required() : Joi.string().allow('').default(''),
  MAIL_FROM: Joi.string().required(),
  ADMIN_NOTIFY_EMAIL: Joi.string().email().allow('').default(''),

  UPLOAD_DIR: Joi.string().default('/data/media'),
  /** index.html compilado de la web (plantilla del shell SEO). */
  SHELL_TEMPLATE: Joi.string().default('../web/dist/index.html'),
  SEO_INDEXABLE: Joi.boolean().default(false),
  REGISTRATION_OPEN: Joi.boolean().default(false),
  LOG_LEVEL: Joi.string().valid('fatal', 'error', 'warn', 'info', 'debug', 'trace').default('info'),
  APP_VERSION: Joi.string().default('dev'),
})
  // Ninguna variable ADMIN_* (salvo el correo de avisos) debe existir: evita que la
  // contraseña del admin quede en un .env.
  .custom((value, helpers) => {
    const leaked = Object.keys(process.env).filter((k) => k.startsWith('ADMIN_') && k !== 'ADMIN_NOTIFY_EMAIL');
    if (isProd && leaked.length) return helpers.error('any.invalid', { message: `No definas ${leaked.join(', ')}` });
    return value;
  })
  .custom((value: Record<string, unknown>, helpers) => {
    if (!isProd) return value;
    const problems = productionSecretProblems(value);
    if (problems.length) {
      return helpers.message({
        custom: `Secretos inválidos para producción: ${problems.join('; ')}. Genera valores nuevos con scripts/init-env.sh.`,
      });
    }
    return value;
  });
