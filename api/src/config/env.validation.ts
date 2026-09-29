import * as Joi from 'joi';

const isProd = process.env.NODE_ENV === 'production';
const secret = (min: number) => Joi.string().min(isProd ? min : 16).required();

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
  COOKIE_SECURE: Joi.boolean().default(true),

  SMTP_HOST: Joi.string().required(),
  SMTP_PORT: Joi.number().port().default(465),
  SMTP_SECURE: Joi.boolean().default(true),
  SMTP_USER: isProd ? Joi.string().required() : Joi.string().allow('').default(''),
  SMTP_PASS: isProd ? Joi.string().required() : Joi.string().allow('').default(''),
  MAIL_FROM: Joi.string().required(),
  ADMIN_NOTIFY_EMAIL: Joi.string().email().allow('').default(''),

  UPLOAD_DIR: Joi.string().default('/data/media'),
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
  });
