# 04 · Respaldos y restauración

Los respaldos tienen datos personales (solicitudes de booking, datos legales de los DJs). Se guardan
en `BACKUP_DIR` (por defecto `~/backups/fersua-booking`) con permisos `700`/`600` y **nunca**
incluyen el `.env`. Una copia cifrada sale del VPS cada noche (restic): si el disco del VPS se
daña, los respaldos no se pierden con él.

## Qué se respalda

| Qué | Cómo | Cuándo | Se guarda |
|---|---|---|---|
| Base de datos | `mysqldump` dentro del contenedor db, gzip, verificado (`gzip -t` + termina en `Dump completed`) | cada noche 03:15 (Bogotá) | 14 días (`BACKUP_RETENTION_DAYS`) |
| Semanal | copia del dump del domingo en `weekly/` | domingos | 8 semanas |
| Manual (u otra etiqueta) | `bash scripts/backup.sh manual` | a mano | 20 días |
| Antes de cada deploy | dump `pre-deploy-<sha>` | cada `deploy.sh` | los 10 últimos, máximo 8 semanas |
| Medios subidos | instantánea con `rsync --link-dest`: cada noche solo ocupa lo nuevo | cada noche | 7 (`BACKUP_MEDIA_KEEP`) |
| **Copia externa** | `BACKUP_DIR` sin los semanales ni los `pre-*`, cifrado e incremental con restic, a Google Drive (o B2) | cada noche 03:45 | 14 diarias y 6 semanales (unas 5 semanas) |

**El plazo de 8 semanas es una promesa legal.** La política de privacidad (§8) dice que un dato
borrado sale de todos los respaldos en 8 semanas. Por eso ningún dump local pasa de 8 semanas, los
manuales duran 20 días y la copia externa solo lleva los nocturnos (14 días) y los manuales, con
instantáneas de 5 semanas como mucho: 20 días + 5 semanas < 8 semanas. Si subes
`BACKUP_RETENTION_DAYS` (máximo 21; `check-env.sh` avisa) o la retención de la copia externa, cambia
antes la §8 de la política.

Estructura:

```
~/backups/fersua-booking/
├─ db/            db_nightly_20261001T081500Z.sql.gz, db_pre-deploy-<sha>_....sql.gz, ...
├─ weekly/
├─ media/         20261001T081500Z/  (copia completa navegable; archivos sin cambios = enlaces duros)
├─ counts.log     conteos de filas de cada dump (para comprobar una restauración)
├─ backup.log     salida del cron del respaldo
├─ offsite.log    salida del cron de la copia externa
├─ offsite-state  última copia externa correcta, último check (lo leen el watchdog y status.sh)
└─ drill.log      resultado de cada ensayo de restauración
```

## Programarlo [VPS deploy]

```bash
bash scripts/backup.sh manual     # el primero a mano (crea la carpeta)
crontab -e                        # pega deploy/cron/crontab.example
```

El crontab trae tres trabajos: el respaldo nocturno (`15 8 * * *`), la copia externa
(`45 8 * * *`) y el vigilante cada 10 minutos (`docs/08-monitoreo.md`). El VPS está en UTC:
`15 8 * * *` = 03:15 en Bogotá (`timedatectl` para confirmar).
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

Antes de restaurar, pausa los avisos del vigilante (`bash scripts/watchdog.sh --pause 60`): la
restauración detiene el api y el edge a propósito.

## Copia fuera del VPS (restic)

`scripts/offsite-backup.sh` sube `BACKUP_DIR` completo a un repositorio restic:

- **Cifrado** con `OFFSITE_RESTIC_PASSWORD` antes de salir del VPS: Google o Backblaze solo ven
  bloques cifrados.
- **Incremental y deduplicado:** cada noche sube solo lo nuevo (los dumps del día y las fotos nuevas).
- **Retención:** 14 diarias y 6 semanales (`restic forget --prune --max-unused 0`: lo olvidado se
  borra del destino esa misma noche). Solo viajan los dumps nocturnos y manuales, los medios y
  `counts.log`; los semanales y los `pre-*` se quedan en el VPS (ver el plazo de 8 semanas arriba).
- **Check semanal:** `restic check --read-data-subset=10%` lee de verdad una parte de los datos
  guardados, para enterarte si algo se dañó en el destino.
- **Sin instalar nada en el VPS:** restic corre en su imagen oficial (`restic/restic:0.19.1`). Para
  Google Drive se arma una sola vez una imagen local con restic + rclone
  (`fersua-booking-restic:0.19.1-rclone1.75.1`).
- **Drive sin papelera:** lo que borra la retención se borra de verdad (`RCLONE_DRIVE_USE_TRASH=false`),
  sin pasar 30 días por la papelera de Drive ocupando cupo.
- **Sin configurar no hace nada:** si `OFFSITE_RESTIC_REPOSITORY` está vacío, dice "no configurada"
  y termina con 0 (el cron no molesta).
- Los secretos van por el entorno del proceso docker, nunca en la línea de comandos ni en el log.

> ⚠ **La clave `OFFSITE_RESTIC_PASSWORD` es la única forma de leer las copias.** Si se pierde, las
> copias externas no sirven para nada, ni siquiera para ti. Guárdala en tu gestor de contraseñas
> **antes** de la primera copia, junto con una copia del `.env`.

### Opción A: Google Drive con rclone (la elegida)

**1. [PC] Crea el remoto de rclone.**

Instala rclone en Windows (`winget install Rclone.Rclone`, o el zip de https://rclone.org/downloads/)
y abre una terminal nueva:

```powershell
rclone config
```

Responde así:

| Pregunta | Respuesta |
|---|---|
| `n/s/q>` | `n` (remoto nuevo) |
| `name>` | `gdrive` |
| `Storage>` | `drive` (Google Drive) |
| `client_id>` y `client_secret>` | Enter (vacíos) |
| `scope>` | `drive.file`: rclone solo ve lo que él mismo crea, no el resto de tu Drive |
| `service_account_file>` | Enter |
| `Edit advanced config?` | `n` |
| `Use web browser to automatically authenticate?` | `y`: se abre el navegador, entras con tu cuenta de Google y das permiso |
| `Configure this as a Shared Drive?` | `n` |
| `Keep this "gdrive" remote?` | `y`, y luego `q` |

**No** le pongas contraseña a la configuración de rclone (`s) Set configuration password`): el
cron del VPS no la puede escribir.

Prueba el remoto y crea la carpeta:

```powershell
rclone mkdir gdrive:fersua-booking-respaldos
rclone lsd gdrive:
rclone config file        # dice dónde quedó el archivo, normalmente %APPDATA%\rclone\rclone.conf
```

Si usas un `client_id` propio de Google Cloud (opcional, para no compartir el cupo del de rclone),
publica la app ("En producción"): en modo de prueba Google vence el permiso cada 7 días.

**2. [PC] Copia la configuración al VPS.** El archivo tiene un token de acceso a tu Drive: trátalo
como una contraseña (fuera del repo, `chmod 600`).

```powershell
ssh -i ~/.ssh/fersua_vps_ed25519 deploy@177.7.40.130 "mkdir -p ~/.config/rclone && chmod 700 ~/.config/rclone"
scp -i ~/.ssh/fersua_vps_ed25519 "$env:APPDATA\rclone\rclone.conf" deploy@177.7.40.130:.config/rclone/rclone.conf
ssh -i ~/.ssh/fersua_vps_ed25519 deploy@177.7.40.130 "chmod 600 ~/.config/rclone/rclone.conf"
```

**3. [VPS deploy] Agrega al `.env`** (sigue en "Activarla en el VPS"):

```bash
OFFSITE_RESTIC_REPOSITORY=rclone:gdrive:fersua-booking-respaldos
OFFSITE_RCLONE_CONFIG=/home/deploy/.config/rclone/rclone.conf
```

Si algún día quitas el permiso en tu cuenta de Google (Seguridad → Apps de terceros), o se vence,
repite los pasos 1 y 2: el repositorio y la clave de restic siguen siendo los mismos.

### Opción B: Backblaze B2 (alternativa)

Unos USD 0,006 por GB al mes (los primeros 10 GB gratis).

1. **[Navegador]** Crea la cuenta en https://www.backblaze.com (B2 Cloud Storage).
2. **Buckets → Create a Bucket:** nombre único (p. ej. `fersua-booking-respaldos-<algo al azar>`),
   **Private**, sin Object Lock. El cifrado de B2 es opcional: restic ya cifra.
3. En el bucket, **Lifecycle Settings → "Keep only the last version of the file"**. Sin esto B2
   guarda las versiones borradas: la retención de restic no libera espacio y lo borrado seguiría
   ahí más allá de las 8 semanas que promete la política de privacidad.
4. **Application Keys → Add a New Application Key:**
   - nombre `fersua-booking-vps`;
   - **Allow access to Bucket(s): solo ese bucket**;
   - Type of Access: **Read and Write**;
   - sin prefijo ni vencimiento.

   Copia `keyID` y `applicationKey` al gestor de contraseñas: B2 los muestra una sola vez.
5. **[VPS deploy]** Agrega al `.env`:

   ```bash
   OFFSITE_RESTIC_REPOSITORY=b2:<bucket>:vps
   OFFSITE_B2_ACCOUNT_ID=<keyID>
   OFFSITE_B2_ACCOUNT_KEY=<applicationKey>
   ```

Si `b2:` da errores de red raros, restic recomienda la API compatible con S3 de B2 (para un
repositorio nuevo). El endpoint sale en los detalles del bucket:

```bash
OFFSITE_RESTIC_REPOSITORY=s3:https://s3.<región>.backblazeb2.com/<bucket>/vps
OFFSITE_AWS_ACCESS_KEY_ID=<keyID>
OFFSITE_AWS_SECRET_ACCESS_KEY=<applicationKey>
```

### Activarla en el VPS [VPS deploy]

```bash
cd ~/apps/fersuastudio-booking
openssl rand -hex 32        # la clave de restic: guárdala YA en el gestor de contraseñas
nano .env                   # pega las líneas de tu opción + las de abajo
```

```bash
OFFSITE_RESTIC_PASSWORD=<la clave de 64 caracteres>
# Opcional: un check propio en healthchecks.io (docs/08-monitoreo.md)
OFFSITE_HEALTHCHECK_URL=https://hc-ping.com/<uuid>
```

Las variables están comentadas en `.env.prod.example`, con su explicación. Después:

```bash
bash scripts/check-env.sh                    # avisa si falta algo de la copia externa
bash scripts/offsite-backup.sh manual        # la primera: crea el repositorio y sube todo
bash scripts/offsite-backup.sh snapshots     # debe aparecer una instantánea
bash scripts/restore-drill.sh --from-offsite # prueba que la copia se puede leer y restaurar
crontab -e                                   # la línea de offsite-backup.sh de deploy/cron/crontab.example
```

La primera copia sube todo (unos minutos); las siguientes, solo lo nuevo.

### Qué protege y qué no

La copia externa protege de **perder el disco o el VPS** (falla de Hostinger, borrado por error,
un disco dañado). **No** es una copia "solo de agregar": el VPS tiene la clave de restic y el acceso
a Drive (o la llave de B2), porque cada noche sube y borra lo viejo. Quien tome control del usuario
`deploy` puede leer **y borrar** también la copia externa.

Para cubrir ese caso (opcional, a mano desde el PC):

- **Una copia fría en tu PC** de vez en cuando (p. ej. una vez al mes), con restic y rclone
  instalados en Windows y el mismo remoto:

  ```powershell
  $env:RESTIC_REPOSITORY = "rclone:gdrive:fersua-booking-respaldos"
  restic snapshots
  restic restore latest --target D:/respaldos-fersua/<fecha>   # un disco externo cifrado (BitLocker)
  ```

  Tiene datos personales: guárdala cifrada y bórrala cuando pasen las 8 semanas de la política.
- **B2:** una llave sin permiso de borrar (`deleteFiles`) para el VPS y la limpieza
  (`restic forget --prune`) corrida desde el PC con otra llave. Complica la operación: solo si el
  riesgo lo justifica.

### Operarla

```bash
bash scripts/offsite-backup.sh snapshots     # instantáneas guardadas
bash scripts/offsite-backup.sh check         # revisión a mano (lee el 10 % de los datos)
tail -n 30 ~/backups/fersua-booking/offsite.log
bash scripts/status.sh                       # sección "Copia externa (restic)"
```

- **healthchecks.io:** con `OFFSITE_HEALTHCHECK_URL`, cada noche avisa inicio, éxito o fallo. Sin
  ella, un fallo va al check del nocturno (`BACKUP_HEALTHCHECK_URL/fail`), pero nunca un éxito
  (taparía un nocturno fallido).
- **El vigilante** avisa por correo si la última copia correcta tiene más de 30 h.
- **Nunca cambies `OFFSITE_RESTIC_PASSWORD`** en el `.env` de un repositorio que ya existe: deja
  de abrirlo (el script dice "no abre el repositorio"). Para rotarla hay que agregar una clave
  nueva con `restic key add` y quitar la vieja; hazlo con calma y con las dos en el gestor.

### Restaurar desde la copia externa

**Los respaldos locales se perdieron o están dañados (mismo VPS):**

```bash
bash scripts/offsite-backup.sh snapshots                        # elige una, o usa latest
bash scripts/offsite-backup.sh restore latest ~/restauracion    # o el ID de la instantánea
ls ~/restauracion/data/fersua-booking/db ~/restauracion/data/fersua-booking/media
bash scripts/watchdog.sh --pause 60
bash scripts/restore.sh ~/restauracion/data/fersua-booking/db/db_nightly_<fecha>.sql.gz \
                        ~/restauracion/data/fersua-booking/media/<fecha>
rm -rf ~/restauracion                                           # tiene datos personales
```

Con `--db-only` baja solo los dumps y `counts.log` (más rápido).

**El VPS se perdió (servidor nuevo):**

1. Sigue `docs/02-primer-despliegue.md` hasta tener el repo clonado. En vez de `init-env.sh`,
   **restaura el `.env` desde el gestor de contraseñas**: lleva `MFA_ENC_KEY` (sin ella hay que
   reconfigurar el 2FA del admin con `admin:reset-mfa`) y las variables `OFFSITE_*`.
2. Para Google Drive, copia otra vez `rclone.conf` desde el PC (paso 2 de la opción A).
3. `bash scripts/deploy.sh --first` para levantar el stack vacío.
4. `bash scripts/offsite-backup.sh restore latest ~/restauracion` y `bash scripts/restore.sh …`
   como arriba.
5. Vuelve a programar el crontab y revisa `bash scripts/status.sh`.

**Leer las copias desde el PC, sin VPS** (plan de emergencia). Con restic y rclone instalados en
Windows (`winget install restic.restic Rclone.Rclone`) y el mismo remoto `gdrive` del paso 1:

```powershell
$env:RESTIC_REPOSITORY = "rclone:gdrive:fersua-booking-respaldos"
restic snapshots                                  # pide la clave de restic
restic restore latest --target .\restauracion
```

Para B2: `$env:RESTIC_REPOSITORY = "b2:<bucket>:vps"`, `$env:B2_ACCOUNT_ID` y `$env:B2_ACCOUNT_KEY`.

### Si el check falla

1. Repite `bash scripts/offsite-backup.sh check`: un corte de red también lo hace fallar.
2. Si vuelve a fallar con errores de datos, el destino guardó algo dañado. No uses
   `restic repair` a ciegas: crea un repositorio nuevo (otra carpeta, p. ej.
   `rclone:gdrive:fersua-booking-respaldos-2`), haz una copia completa y conserva el viejo hasta
   tener unas semanas de instantáneas en el nuevo.

## Ensayo mensual [VPS deploy]

Un respaldo que nunca se probó no es un respaldo. Una vez al mes (pon un recordatorio):

```bash
bash scripts/restore-drill.sh                  # el dump local más reciente
bash scripts/restore-drill.sh --from-offsite   # el de la última copia externa (prueba también la clave)
```

Cada ensayo:

1. levanta un MySQL 8.4 **desechable** (contenedor, volumen y red interna propios, sin puertos ni
   internet; unos 300 MB de RAM por un par de minutos);
2. carga el dump, cuenta las filas de `User`, `DjProfile`, `Event`, `BookingRequest`, `MediaAsset` y
   `Ticket` y las compara con lo que anotó `backup.sh` en `counts.log`;
3. muestra la última migración del dump e imprime `RESULTADO: OK` o `RESULTADO: FALLÓ`;
4. borra todo lo que creó, salga bien o mal (también con Ctrl+C), y anota el resultado en
   `drill.log` (lo muestra `bash scripts/status.sh`).

No toca la base de producción. También sirve en el PC con una copia de los respaldos:
`bash scripts/restore-drill.sh --dir <carpeta con db/ y counts.log>`. Si prefieres que corra solo,
`deploy/cron/crontab.example` trae una línea comentada para el día 1 de cada mes.

### Si el ensayo falla

- **"El dump está corrupto" o "incompleto":** ese respaldo no sirve. Revisa `backup.log` de esa
  noche y ensaya con el anterior (`bash scripts/restore-drill.sh <dump>`).
- **Una diferencia pequeña en `BookingRequest`** (o `Ticket`): pudo llegar una solicitud entre el
  dump y el conteo. Ensaya con otro dump; si se repite, investiga.
- **Diferencias grandes o tablas en 0:** el dump no tiene todo. No borres nada y revisa
  `backup.sh` antes de la próxima noche.
- **"No hay conteos … en counts.log":** el conteo falló esa noche (`?` en `counts.log`). Ensaya
  con otro dump y revisa `backup.log`.
- **Falla `--from-offsite` y el local no:** revisa `offsite.log` y la clave de restic.
