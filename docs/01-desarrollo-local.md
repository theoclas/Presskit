# 01 · Desarrollo local

Todo corre en tu PC con Node 22 y Docker Desktop. MySQL y el correo de prueba van en Docker;
el api y la web corren con Node para tener recarga en caliente.

| Pieza | Dirección |
|---|---|
| Web (Vite) | http://localhost:5180 |
| API (NestJS) | http://127.0.0.1:4100/api/health |
| MySQL | 127.0.0.1:3309 (root / devroot, base `fersua_booking`) |
| Mailpit (correos) | http://127.0.0.1:8025 (SMTP 1025) |

Vite reenvía `/api` y `/media` al api, así que en el navegador todo sale del 5180, como en producción.

## Primera vez [PC]

```bash
npm install
docker compose up -d                  # MySQL 8.4 + mailpit, solo en 127.0.0.1
cp api/.env.example api/.env          # valores de desarrollo, nada secreto
npm run build:shared                  # @fersua/shared a dist (api y web lo importan)
npm exec -w api -- prisma migrate dev # aplica las migraciones a la base local
```

Datos de ejemplo (géneros y Mac Fly & Mike Bran, con sus fotos de `api/seed-assets/`):

```bash
npm run build -w api
npm run cli -w api -- seed:genres
npm run cli -w api -- seed:macfly
```

## Día a día [PC]

```bash
docker compose up -d
npm run dev:api     # http://127.0.0.1:4100
npm run dev:web     # http://localhost:5180
```

En Claude Code, `.claude/launch.json` tiene las dos configuraciones (`api` y `web`).

- Si cambias `packages/shared`, vuelve a correr `npm run build:shared`.
- Si cambias `api/prisma/schema.prisma`: `npm exec -w api -- prisma migrate dev --name <cambio>` y
  commitea la carpeta nueva de `api/prisma/migrations/`. La CI falla si el schema cambia sin migración.
- Las subidas quedan en `api/.uploads/` (ignorada por git). En desarrollo el api sirve `/media`.

## Pruebas [PC]

```bash
npm test                 # shared (vitest), api (jest), web (vitest)
npm run typecheck
npm run ci:compose       # lint del compose de producción y de las rutas del edge
```

## Probar las imágenes de producción en el PC (opcional) [PC]

Sirve para revisar el Dockerfile o la config del edge antes de desplegar.

```bash
docker build --target api  -t fersua-booking-api:local .
docker build --target edge -t fersua-booking-edge:local .
docker run --rm fersua-booking-edge:local nginx -t
```

Stack completo de producción en el PC (edge en http://127.0.0.1:8090):

```bash
# .env de prueba FUERA del repo: un .env en la raíz haría que `docker compose` (el de desarrollo)
# use el archivo de producción, porque lleva COMPOSE_FILE.
cp .env.prod.example ../fersua-prueba.env      # y rellena claves con: openssl rand -hex 32 / -hex 48
#   PUBLIC_URL=https://booking.fersuastudio.test   (en producción el api exige https)
#   SMTP_HOST=host.docker.internal  SMTP_PORT=1025  SMTP_SECURE=false  SMTP_PASS='x'   (mailpit)
P="docker compose -p fersua-booking -f docker-compose.prod.yml --env-file ../fersua-prueba.env"
APP_VERSION=local $P build api && APP_VERSION=local $P build edge
APP_VERSION=local $P up -d
APP_VERSION=local $P run --rm --no-deps api node dist/cli/main.js seed:genres
APP_VERSION=local $P run --rm --no-deps api node dist/cli/main.js seed:macfly
curl -sI -H 'X-Forwarded-Proto: https' http://127.0.0.1:8090/MacflyMikebran   # 301 /macfly-mike-bran
```

- Crea los volúmenes `fersua_booking_db` y `fersua_booking_media`. MySQL fija las claves al crear el
  volumen: si luego cambias las de `fersua-prueba.env`, el api y migrate ya no entran (hay que
  borrar ese volumen de prueba a mano).
- `$P down` apaga todo sin borrar los volúmenes.
- Para no tocar esos nombres, agrega un `-f override.yml` fuera del repo que renombre los volúmenes
  (`volumes: { db_data: { name: fersua_booking_smoke_db }, media: { name: fersua_booking_smoke_media } }`)
  y usa otro `-p`. Así `$P down -v` solo borra los de la prueba.
- En Windows, MySQL ignora `deploy/mysql/my.cnf` ("World-writable config file is ignored") porque el
  montaje desde NTFS sale con permisos 777, y la db usa ~470 MB en vez de ~240 MB. En el VPS (Linux)
  el archivo queda 644/664 y sí se aplica.

## Problemas comunes

- **`EADDRINUSE 4100/5180`**: otra instancia sigue corriendo. Ciérrala o busca el proceso.
- **`P1001 Can't reach database`**: `docker compose up -d` y espera a que `db` esté healthy (`docker compose ps`).
- **Scripts `.sh` con `\r`**: el repo fuerza LF (`.gitattributes`). Si editas en Windows, deja el editor en LF.
