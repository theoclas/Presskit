# 04 · Respaldos y restauración

Los respaldos tienen datos personales (solicitudes de booking, datos legales de los DJs). Se guardan
en `BACKUP_DIR` (por defecto `~/backups/fersua-booking`) con permisos `700`/`600` y **nunca**
incluyen el `.env`.

## Qué se respalda

| Qué | Cómo | Cuándo | Se guarda |
|---|---|---|---|
| Base de datos | `mysqldump` dentro del contenedor db, gzip, verificado (`gzip -t` + termina en `Dump completed`) | cada noche 03:15 (Bogotá) | 14 días (`BACKUP_RETENTION_DAYS`) |
| Semanal | copia del dump del domingo en `weekly/` | domingos | 8 semanas |
| Antes de cada deploy | dump `pre-deploy-<sha>` | cada `deploy.sh` | los 10 últimos |
| Medios subidos | instantánea con `rsync --link-dest`: cada noche solo ocupa lo nuevo | cada noche | 7 (`BACKUP_MEDIA_KEEP`) |

Estructura:

```
~/backups/fersua-booking/
├─ db/        db_nightly_20261001T081500Z.sql.gz, db_pre-deploy-<sha>_....sql.gz, ...
├─ weekly/
├─ media/     20261001T081500Z/  (copia completa navegable; archivos sin cambios = enlaces duros)
├─ counts.log conteos de filas de cada dump (para comprobar una restauración)
└─ backup.log salida del cron
```

## Programarlo [VPS deploy]

```bash
bash scripts/backup.sh manual     # el primero a mano (crea la carpeta)
crontab -e                        # pega deploy/cron/crontab.example
```

El VPS está en UTC: `15 8 * * *` = 03:15 en Bogotá (`timedatectl` para confirmar).
Con `BACKUP_HEALTHCHECK_URL` (healthchecks.io, gratis) te llega un correo si una noche no hay respaldo.

Revisar: `tail -n 20 ~/backups/fersua-booking/backup.log` o `bash scripts/status.sh`.

## Restaurar [VPS deploy]

```bash
bash scripts/restore.sh ~/backups/fersua-booking/db/db_nightly_<fecha>.sql.gz \
                        ~/backups/fersua-booking/media/<fecha>
```

1. Pide escribir `RESTAURAR`. Hace un respaldo `pre-restore` de lo actual.
2. Detiene edge y api, reemplaza la base de datos y (si la pasas) la carpeta de medios.
3. Levanta todo: `migrate` aplica las migraciones más nuevas que el dump.
4. Muestra los conteos de filas actuales y los del respaldo: deben coincidir.

## Copia fuera del VPS (muy recomendada antes del cambio de dominio)

Si el disco del VPS se daña, los respaldos locales se pierden con él.

- **Recomendado:** `restic` (cifrado e incremental) justo después del respaldo nocturno, hacia
  Backblaze B2 (centavos al mes) o Google Drive con `rclone`. La clave de restic va al gestor de contraseñas.
- **Mínimo:** una copia semanal desde el PC, cifrada con `age`:

  ```bash
  # [PC]
  scp -r deploy@177.7.40.130:backups/fersua-booking/weekly ./respaldo-fersua
  ```

## Ensayo mensual [PC]

Restaura el dump más reciente en el MySQL local (127.0.0.1:3309) en una base aparte y compara los
conteos con `counts.log`. Un respaldo que nunca se probó no es un respaldo.
