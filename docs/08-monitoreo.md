# 08 · Monitoreo y alertas

Tres capas, cada una cubre lo que las otras no ven:

| Capa | Qué ve | Cómo avisa | Dónde se configura |
|---|---|---|---|
| **UptimeRobot** (afuera) | el sitio no responde o la página de Mac Fly no carga, aunque el VPS entero esté apagado | correo (o Telegram) | uptimerobot.com |
| **healthchecks.io** (afuera) | el respaldo nocturno, la copia externa o el vigilante **no corrieron** o fallaron | correo | healthchecks.io + `.env` |
| **Vigilante** (`scripts/watchdog.sh`, en el VPS) | disco, respaldo atrasado, contenedores caídos o reiniciados, certificado por vencer, copia externa atrasada | correo al admin (`ops:alert`) | crontab + `.env` |

Además, Docker reinicia solo un contenedor que se cae (`restart: unless-stopped`) y
`bash scripts/status.sh` muestra todo de un vistazo.

## 1. UptimeRobot [PC]

Gratis, revisa cada 5 minutos desde afuera. Un monitor en el mismo VPS no puede avisar que el VPS
se cayó.

1. Crea la cuenta en https://uptimerobot.com y confirma tu correo (es el contacto de alertas).
2. **Add New Monitor → HTTP(s):**
   - Friendly Name: `Fersua booking · api`
   - URL: `https://booking.fersuastudio.com/api/health`
   - Interval: 5 minutes

   Responde `{"status":"ok","version":"…"}`. Ve que el api está vivo, pero no toca la base de datos.
3. **Add New Monitor → Keyword:**
   - Friendly Name: `Fersua booking · página de Mac Fly`
   - URL: `https://booking.fersuastudio.com/macfly-mike-bran`
   - Keyword: `Mike Bran`, tipo **"Alert when keyword does not exist"**
   - Interval: 5 minutes

   El título de esa página lo arma el api con datos de la base: si la base o el api fallan, la
   palabra no aparece y te avisa. Compruébalo antes con
   `curl -s https://booking.fersuastudio.com/macfly-mike-bran | grep -o '<title>[^<]*'`.
   **Ojo:** el edge guarda las páginas 10 s y, si el api no responde, sirve la última copia
   (`STALE`) mientras alguien la siga pidiendo al menos una vez por minuto. Con visitas, la palabra
   sigue apareciendo aunque la base o el api estén caídos, y `/api/health` no toca la base. Por eso
   este monitor ve sobre todo "el sitio no responde"; una base caída la detectan el vigilante
   (`container-down`) y, si el correo tampoco sale, el `/fail` de `MONITOR_HEALTHCHECK_URL`
   (**obligatorio**, sección 2).
4. Opcional: **Alert Contacts → Telegram**, para enterarte en el teléfono.

## 2. healthchecks.io [PC + VPS deploy]

Gratis (hasta 20 checks). Te avisa cuando un trabajo del cron **no** llega a tiempo o avisa que
falló. Crea tres checks (**Add Check**, pestaña **Cron**, zona horaria `UTC`):

| Check | Cron (UTC) | Grace | Variable del `.env` |
|---|---|---|---|
| `fersua-booking respaldo nocturno` | `15 8 * * *` | 1 hora | `BACKUP_HEALTHCHECK_URL` |
| `fersua-booking copia externa` | `45 8 * * *` | 2 horas | `OFFSITE_HEALTHCHECK_URL` |
| `fersua-booking vigilante` | `*/10 * * * *` | 30 minutos | `MONITOR_HEALTHCHECK_URL` |

Copia la URL de ping de cada uno (`https://hc-ping.com/<uuid>`) en el `.env` del VPS:

```bash
cd ~/apps/fersuastudio-booking
nano .env
bash scripts/check-env.sh
```

- **Respaldo nocturno:** `backup.sh nightly` avisa al terminar bien y `/fail` si falla.
- **Copia externa:** `offsite-backup.sh nightly` avisa al empezar (healthchecks mide la duración),
  al terminar y `/fail` si falla.
- **Vigilante:** `watchdog.sh` late en cada corrida. Si deja de latir, el VPS o el cron están
  caídos. Manda `/fail` cuando un aviso no pudo salir por correo: así te enteras aunque el correo
  del api esté roto.

Para probar cada check, corre el trabajo una vez a mano (`bash scripts/backup.sh nightly`,
`bash scripts/offsite-backup.sh nightly`, `bash scripts/watchdog.sh`) y mira que healthchecks
marque el ping.

## 3. Vigilante del VPS [VPS deploy]

`scripts/watchdog.sh` corre cada 10 minutos (`deploy/cron/crontab.example`) y revisa:

| Tipo (`--kind`) | Avisa cuando | Umbral (`.env`, opcional) |
|---|---|---|
| `disk-low` | quedan menos de 5 GB libres en `/` | `MONITOR_DISK_MIN_GB=5` |
| `backup-stale` | el último `db_nightly_*` tiene más de 26 h (o no hay) | `MONITOR_BACKUP_MAX_AGE_H=26` |
| `container-down` | db, api o edge no están `healthy` en **dos corridas seguidas** (10 min) | — |
| `container-restart` | Docker volvió a levantar un contenedor tras una caída | — |
| `tls-expiring` | el certificado de `PUBLIC_URL` vence en menos de 14 días (o no se puede leer dos veces seguidas) | `MONITOR_TLS_MIN_DAYS=14` |
| `offsite-stale` | la última copia externa correcta tiene más de 30 h (solo si está configurada) | `MONITOR_OFFSITE_MAX_AGE_H=30` |

Cómo avisa:

- Por cada problema llama a la CLI del api dentro del contenedor:
  `docker compose exec -T api node dist/cli/main.js ops:alert --kind <tipo> --detail "<texto corto>"`.
  Si el api no corre, usa un contenedor de un solo uso con la misma imagen (necesita la db arriba).
- El correo va a `ADMIN_NOTIFY_EMAIL` o, si está vacío, al correo del admin. Queda en la auditoría
  como `system.ops_alert`.
- **Como mucho un aviso por tipo cada 24 h**, aunque el problema vaya y vuelva (un disco que ronda el
  umbral no manda un correo cada 20 min), y otro cuando lleva **dos corridas seguidas** resuelto
  ("Resuelto: …"). Un reinicio es un hecho puntual: no tiene aviso de resuelto.
- Si un aviso no sale (SMTP caído), lo reintenta como mucho una vez por hora y, mientras tanto,
  manda `/fail` al latido de healthchecks.io.
- Además, un tope de 20 avisos **entregados** en 24 h contando la auditoría: un vigilante que falle en
  bucle no agota el cupo del correo de Hostinger, y los intentos fallidos no cuentan (después de una
  caída del SMTP, los avisos de verdad salen).
- Recorta los logs de los trabajos del cron (`backup.log`, `offsite.log`, `drill-cron.log` y el suyo)
  cuando pasan de 1 MB.
- Si todo está bien no escribe nada. El log está en `~/.fersua-booking-watchdog/watchdog.log`, junto
  con el estado (`<tipo>.open`: avisado y sin resolver; `<tipo>.alerted`: cuándo salió el último
  aviso; `<tipo>.failed`: un envío que no salió).
- Durante un despliegue (`deploy.sh` tiene el candado) no revisa los contenedores.

### Activarlo

Necesita el api de M4 desplegado (trae `ops:alert`).

```bash
cd ~/apps/fersuastudio-booking
# 1. ¿Llegan los avisos? Te debe llegar "Alerta del servidor: Prueba de alertas".
docker compose exec -T api node dist/cli/main.js ops:alert --kind test --detail "Prueba desde el VPS"
# 2. Qué revisaría ahora, sin enviar nada ni guardar estado:
bash scripts/watchdog.sh --dry-run
# 3. Programarlo: la línea de watchdog.sh de deploy/cron/crontab.example
crontab -e
```

Si el correo de prueba no llega, revisa la carpeta de spam y `docs/07-correo-spf-dkim-dmarc.md`.

### Mantenimiento

```bash
bash scripts/watchdog.sh --pause 60     # silencia los avisos 60 min (antes de restore.sh o de tocar el VPS)
bash scripts/watchdog.sh --resume       # quita la pausa
bash scripts/status.sh                  # sección "Vigilante": avisos activos y últimas líneas del log
```

Lo que el vigilante **no** puede avisar por correo: si la base de datos está caída, la CLI no arranca
y el correo no sale. Para eso está el `/fail` de `MONITOR_HEALTHCHECK_URL`, y por eso ese check es
**obligatorio**: el monitor de palabra clave de UptimeRobot no lo nota mientras haya visitas que
mantengan viva la copia de la microcaché.

## 4. Qué hacer con cada aviso

Todo como `deploy` en `~/apps/fersuastudio-booking`, salvo lo marcado `sudo`.

### Poco disco (`disk-low`)

Si el disco se llena, MySQL deja de escribir y el sitio falla.

```bash
df -h /
docker system df
du -sh ~/backups/fersua-booking/* | sort -h
```

- Imágenes sueltas de este proyecto y caché de compilación vieja (las otras apps del VPS no se
  tocan): `docker image prune -f --filter label=fersua.project=fersua-booking` y
  `docker builder prune -f --filter until=168h`.
- `docker images 'fersua-booking-*'`: `deploy.sh` ya guarda solo las 3 últimas versiones de cada
  imagen (para volver atrás). Si hace falta, borra la más vieja con `docker rmi`, nunca la actual
  ni la anterior.
- Respaldos locales: baja `BACKUP_MEDIA_KEEP` o `BACKUP_RETENTION_DAYS` en el `.env` (la copia
  externa guarda más tiempo).
- `sudo journalctl --vacuum-size=200M` si los logs del sistema crecieron.
- **Nunca** `docker volume prune` ni `docker system prune --volumes`: borran la base de datos y las
  fotos.

### Respaldo atrasado (`backup-stale`)

```bash
tail -n 50 ~/backups/fersua-booking/backup.log
crontab -l | grep backup.sh
bash scripts/backup.sh manual
```

Causas típicas: la db no estaba `healthy`, disco lleno o el crontab se borró. Si `backup.sh manual`
funciona, espera la próxima noche y mira que healthchecks reciba el ping.

### Contenedor no sano (`container-down`)

```bash
docker compose ps
docker compose logs --since 30m api      # o db / edge
bash scripts/status.sh
```

- Si pasó después de un despliegue: `bash scripts/rollback.sh`.
- Si es la db: revisa disco y memoria (`free -h`); `docker compose up -d` la vuelve a levantar.
- Si nada lo explica, `docker compose up -d` y vuelve a mirar en 5 minutos.

### Reinicios (`container-restart`)

```bash
docker inspect -f '{{.Name}} OOMKilled={{.State.OOMKilled}} reinicios={{.RestartCount}}' $(docker compose ps -q)
docker compose logs --since 2h api
free -h
docker stats --no-stream
```

`OOMKilled=true` es falta de memoria: revisa qué más consume (Dashboard, HabitFer y Wandy corren en
el mismo VPS). Uno aislado no es grave; si se repite, investiga los logs.

### Certificado por vencer (`tls-expiring`)

certbot lo renueva solo unos 30 días antes. Si avisa, la renovación está fallando:

```bash
systemctl list-timers | grep certbot
sudo certbot renew --dry-run
sudo certbot renew && sudo systemctl reload nginx
```

Si dice que no se pudo leer el certificado, mira también si el sitio responde (UptimeRobot).

### Copia externa atrasada (`offsite-stale`)

```bash
tail -n 50 ~/backups/fersua-booking/offsite.log
bash scripts/offsite-backup.sh manual
```

- "no abre el repositorio": cambió `OFFSITE_RESTIC_PASSWORD`. Pon la original del gestor de contraseñas.
- Errores de token o de permiso de Google: el acceso de rclone venció o lo quitaste. Repite los
  pasos 1 y 2 de la opción A de `docs/04-backups.md`.
- B2: la llave de aplicación se borró o no tiene acceso al bucket.
- "Ya hay una copia externa en curso": otra sigue corriendo (la primera puede tardar). Espera.

### El sitio no responde (UptimeRobot)

```bash
ssh -i ~/.ssh/fersua_vps_ed25519 deploy@177.7.40.130
cd ~/apps/fersuastudio-booking && bash scripts/status.sh
docker compose ps && docker compose logs --since 15m edge api
sudo systemctl status nginx
```

Si no entra por SSH, reinicia el VPS desde el panel de Hostinger (hPanel → VPS). Al volver, Docker
levanta todo solo.

### El vigilante dejó de latir (healthchecks.io)

El VPS está apagado, el cron no corre o un aviso no pudo salir por correo:

```bash
crontab -l | grep watchdog
tail -n 30 ~/.fersua-booking-watchdog/watchdog.log
docker compose exec -T api node dist/cli/main.js ops:alert --kind test --detail "Prueba"
```
