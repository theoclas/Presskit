import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/** Acceso tipado a la configuración ya validada por joi. */
@Injectable()
export class AppConfig {
  constructor(private readonly config: ConfigService) {}

  private str(key: string): string {
    return this.config.getOrThrow<string>(key);
  }

  get isProd(): boolean {
    return this.str('NODE_ENV') === 'production';
  }
  /** Origen público sin barra final, ej. https://fersuastudio.com. Único origen para armar enlaces. */
  get publicUrl(): string {
    return this.str('PUBLIC_URL').replace(/\/+$/, '');
  }
  get corsOrigins(): string[] {
    const extra = (this.config.get<string>('CORS_ORIGINS') ?? '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    return Array.from(new Set([this.publicUrl, ...extra]));
  }
  get jwtAccessSecret(): string {
    return this.str('JWT_ACCESS_SECRET');
  }
  get bookingFormSecret(): string {
    return this.str('BOOKING_FORM_SECRET');
  }
  get ipHashSecret(): string {
    return this.str('IP_HASH_SECRET');
  }
  get mfaEncKey(): Buffer {
    return Buffer.from(this.str('MFA_ENC_KEY'), 'hex');
  }
  get cookieSecure(): boolean {
    return this.config.get<boolean>('COOKIE_SECURE') ?? true;
  }
  get uploadDir(): string {
    return this.str('UPLOAD_DIR');
  }
  get seoIndexable(): boolean {
    return this.config.get<boolean>('SEO_INDEXABLE') ?? false;
  }
  get registrationOpen(): boolean {
    return this.config.get<boolean>('REGISTRATION_OPEN') ?? false;
  }
  get adminNotifyEmail(): string | null {
    return this.config.get<string>('ADMIN_NOTIFY_EMAIL') || null;
  }
  get appVersion(): string {
    return this.config.get<string>('APP_VERSION') ?? 'dev';
  }
  get smtp() {
    return {
      host: this.str('SMTP_HOST'),
      port: this.config.get<number>('SMTP_PORT') ?? 465,
      secure: this.config.get<boolean>('SMTP_SECURE') ?? true,
      user: this.config.get<string>('SMTP_USER') ?? '',
      pass: this.config.get<string>('SMTP_PASS') ?? '',
      from: this.str('MAIL_FROM'),
    };
  }
}
