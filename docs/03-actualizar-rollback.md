# 03 · Actualizar y volver atrás

## Actualizar [PC] → [VPS deploy]

1. **[PC]** commit y push a `main` (la CI debe quedar en verde).
2. **[VPS deploy]**:

   ```bash
   cd ~/apps/fersuastudio-booking && bash scripts/deploy.sh
   ```

Qué hace `deploy.sh`, en orden:

1. Chequeos: árbol git limpio (la copia del VPS nunca se edita a mano), 3 GB libres, `check-env.sh`
   y `docker compose config`.
2. `git pull --ff-only` y toma la versión `NEW` = SHA corto del commit.
3. Respaldo de la base de datos `pre-deploy-<sha>` (no en `--first`).
4. Build por etapas, una pesada a la vez: web → api (nest) → imagen api → imagen edge.
   Las imágenes quedan como `fersua-booking-{api,edge}:<sha>` y se re-etiquetan `:current`.
5. `docker compose up -d --remove-orphans`: `migrate` aplica migraciones y luego arrancan api y edge.
6. Espera hasta 3 min a que api y edge estén healthy y comprueba que `/api/health` diga `NEW`.
7. Si algo falla: muestra logs y vuelve solo a la versión anterior (`--no-auto-rollback` para no hacerlo).
8. Registra en `.deploy/current` (lo que corre), `.deploy/releases` (cada versión que quedó sana,
   en orden) y `.deploy/history` (todo, también los fallos); borra imágenes viejas (quedan las 3
   últimas) y caché de build de más de 7 días.

Opciones: `--first` (primer despliegue), `--no-pull` (despliega el commit actual), `--no-auto-rollback`.

**Solo cambió `.env`** (por ejemplo `PUBLIC_URL` o `SEO_INDEXABLE`): no hace falta compilar.

```bash
bash scripts/check-env.sh && docker compose up -d api
```

**Cambió el nginx del edge** (`deploy/edge/*`): va dentro de la imagen, así que es un `deploy.sh` normal.

## Volver atrás

```bash
bash scripts/rollback.sh            # a la versión que corría antes de la actual
bash scripts/rollback.sh <sha>      # a una concreta: docker image ls fersua-booking-api
```

Si un deploy con `--no-auto-rollback` falló, `rollback.sh` sin argumentos vuelve a la última versión sana.

- Re-etiqueta `:current` y recrea solo api y edge con `--no-deps`: **no corre migrate**, así la imagen
  vieja nunca toca un esquema más nuevo.
- El repo del VPS se queda en el commit nuevo. Sube un `git revert` a `main` antes del próximo deploy,
  o `deploy.sh` volverá a compilar la versión mala.

## Migraciones sin sustos

Las migraciones son **expand/contract**, para que el rollback de imágenes sea seguro:

- Con el código nuevo solo salen columnas o tablas nuevas, opcionales o con valor por defecto.
- Borrar o renombrar va en un despliegue posterior, cuando ya ninguna versión en uso las lee.

Si una migración dañó datos: `bash scripts/restore.sh ~/backups/fersua-booking/db/db_pre-deploy-<sha>_*.sql.gz`
y luego `bash scripts/rollback.sh`.

Si una migración falló a medias (MySQL no revierte cambios de esquema), corrige a mano y márcala:

```bash
docker compose run --rm migrate prisma migrate resolve --rolled-back <nombre_migración> --schema prisma/schema.prisma
docker compose up -d
```

## Sin el script (emergencia)

```bash
git pull --ff-only
V=$(git rev-parse --short=12 HEAD)
docker build --target web-build . && docker build --target api-build .
APP_VERSION=$V docker compose build api && APP_VERSION=$V docker compose build edge
docker tag fersua-booking-api:$V fersua-booking-api:current
docker tag fersua-booking-edge:$V fersua-booking-edge:current
docker compose up -d
```

## Comandos útiles [VPS deploy]

```bash
bash scripts/status.sh                        # salud, memoria, disco, respaldos, certificado, versión
docker compose logs -f --since 1h api edge    # logs (el request id del edge coincide con el del api)
docker compose ps -a
cat .deploy/history
```
