# 07 · Correo: SPF, DKIM y DMARC

El api envía los correos (restablecer contraseña, verificación, avisos) por el SMTP autenticado de
Hostinger como `no-reply@fersuastudio.com`. No hay servidor de correo en el VPS, así que SPF no
necesita la IP del VPS.

## Configuración [hPanel]

1. **Buzón**: Correos → crear `no-reply@fersuastudio.com`. Su clave va en `SMTP_PASS` (entre comillas simples).
2. **SPF**: un solo TXT en `@`:

   ```
   v=spf1 include:_spf.mail.hostinger.com ~all
   ```

   Si algún día se agrega otro remitente, se combina en ese mismo registro (nunca dos TXT de SPF).
3. **DKIM**: los registros que muestra hPanel → Correos (normalmente CNAME `hostingermail-a/b/c._domainkey`)
   deben salir verificados.
4. **DMARC**: TXT en `_dmarc`:

   ```
   v=DMARC1; p=none; rua=mailto:<tu-correo>; fo=1
   ```

   Tras 2-4 semanas de reportes sin fallos, pasa a `p=quarantine`.

El `From` es el mismo buzón autenticado, así que DKIM queda alineado.

## .env del VPS

```dotenv
SMTP_HOST=smtp.hostinger.com
SMTP_PORT=465
SMTP_SECURE=true
SMTP_USER=no-reply@fersuastudio.com
SMTP_PASS='...'
MAIL_FROM='Fersua Studio <no-reply@fersuastudio.com>'
```

Después de cambiarlo: `docker compose up -d api`.

## Comprobar

```bash
# [VPS] el VPS puede salir al 465
nc -vz smtp.hostinger.com 465
# [PC] registros publicados
nslookup -type=TXT fersuastudio.com 8.8.8.8
nslookup -type=TXT _dmarc.fersuastudio.com 8.8.8.8
```

- Envía un correo real (p. ej. "olvidé mi contraseña") a Gmail → "Mostrar original": SPF, DKIM y DMARC en **PASS**.
- mail-tester.com: apunta a 9/10 o más.
- Revisa el límite diario de envío de tu plan de Hostinger: si se agota, los correos de restablecer contraseña también fallan.
- En el cambio de dominio **no se tocan** MX, SPF, DKIM ni DMARC.
