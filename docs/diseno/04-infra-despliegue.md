# Infra, deploy and rollout plan for the Fersua DJs platform (fersuastudio.com)

## 0. Key decisions and what changes from HabitFer

**One git repo (monorepo)**, created in `C:\Fernando\Desarrollo\hostinger\fersua-djs`. On the VPS it is cloned to `/home/deploy/apps/fersua-djs`. This answers the owner's question: one repo, not two.

What I found in HabitFer (`C:\Fernando\Desarrollo\Personal\FersuaStore\HabitFer`) and the fix for each:

| HabitFer weakness (found in its repo) | Fix in fersua-djs |
|---|---|
| `api/docker-entrypoint.sh` runs `prisma db push` | A one-shot `migrate` service runs `prisma migrate deploy` with a migrator DB user. `api` starts only after it finishes (`service_completed_successfully`). |
| The api runs with the full-privilege DB user | Two DB users: the migrator can change the schema, the runtime user can only read and write rows (SELECT/INSERT/UPDATE/DELETE). |
| Caddy is published on `0.0.0.0:8080`. Docker bypasses ufw, so it is open to the internet. | The edge is published only on `127.0.0.1:8090`. Host nginx with certbot is the only public entry. |
| Two inner proxies (caddy, then the web nginx) | A single `edge` container (nginx) serves the SPA and `/uploads`, and proxies `/api`. |
| `VITE_API_URL` is baked into the build, so the domain is tied to the image | The web calls a relative `/api`. The same image works on beta and on the apex. `PUBLIC_URL` is read at runtime, so the DNS cutover only needs an api restart. |
| No healthchecks; `depends_on` without conditions | Healthchecks on db, api and edge, with `condition: service_healthy`. |
| No memory or CPU limits, no log rotation | Memory, CPU and process limits plus json-file log rotation on every service. |
| Containers run as root; `npm install prisma --no-save` at runtime | api runs as `node` (uid 1000), edge as `nginx-unprivileged` (uid 101). Root filesystem is read-only, all capabilities dropped, `no-new-privileges`. Prisma is a normal dependency. |
| No `trust proxy`, so rate limits see the proxy's IP | A defined real-IP chain from host nginx to edge to api (section 3.3). |
| Two env files with a duplicated DB password | One root `.env`. Compose builds `DATABASE_URL` from its parts. |
| `npm audit` uses `continue-on-error` | CI fails on high-severity issues in production dependencies, and adds gitleaks, Trivy and a migration drift check. |
| No image tags, so no rollback | Images are tagged with the git SHA plus `:current`. `scripts/rollback.sh` switches back. |

Lessons carried over from `Dashboard\docs\07-seguridad-infra.md` and its `docker-compose.yml`:
- Named volumes for data, with explicit names.
- No published MySQL port in production. The local MySQL is bound to `127.0.0.1` only.
- No default `root/root` credentials anywhere; missing variables stop compose with an error.
- MySQL applies passwords only when the volume is first created. Rotating one later needs `ALTER USER`; this is documented.
- Migrations run on every deploy, because forgetting them caused production 500s in the Dashboard.
- Backups are verified: the dump must end with `Dump completed`, and row counts are compared after a restore.

## 1. Repo tree and npm workspaces

```
fersua-djs/
├─ package.json                # private; "workspaces": ["packages/*","api","web"]; scripts: dev, build, lint, test, db:up
├─ package-lock.json           # ONE lockfile for everything
├─ Dockerfile                  # multi-target: deps → shared → web-build / api-build → api (runtime) / edge (runtime)
├─ .dockerignore               # node_modules, **/dist, .git, .env*, backups/, api/.uploads, *.sql*
├─ docker-compose.yml          # LOCAL dev: MySQL 127.0.0.1:3309 + mailpit
├─ docker-compose.prod.yml     # VPS: db, migrate, api, edge
├─ .env.example                # local dev compose vars
├─ .env.prod.example           # every prod variable, no real values
├─ .gitignore                  # .env, .env.*, !.env*.example, backups/, api/.uploads/, *.sql, *.sql.gz
├─ .gitattributes              # * text=auto eol=lf ; *.sh eol=lf ; *.jpg/*.png/*.webp binary  (Windows CRLF breaks sh scripts)
├─ .nvmrc                      # 22
├─ README.md
├─ packages/shared/            # @fersua-djs/shared — zero runtime deps, built with tsup to CJS + ESM
│  └─ src/ limits.ts, booking-fields.ts (catalogue), palettes.ts, social-platforms.ts, slug.ts (regex + reserved words), index.ts
├─ api/                        # NestJS 11
│  ├─ package.json             # "prisma" in dependencies (needed at runtime by migrate), "@fersua-djs/shared": "*"
│  ├─ prisma/schema.prisma, prisma/migrations/
│  ├─ src/ main.ts, app.module.ts, config/env.validation.ts (joi), health/, auth/, users/, dj-accounts/,
│  │       media/, bookings/, mail/, admin/, public/ (shell + sitemap + robots), cli/
│  │   cli/ seed-admin.ts, seed-macfly.ts, reset-password.ts, send-test-mail.ts   (compiled to dist/cli/*.js)
│  ├─ seed-assets/macfly-mike-bran/   # profile.json + pre-downscaled JPGs (~3-5 MB, committed)
│  └─ test/ (unit + e2e)
├─ web/                        # React + Vite + AntD; Inter self-hosted via @fontsource (no Google Fonts)
│  ├─ vite.config.ts           # dev proxy /api,/uploads → :4100; vite-plugin-compression → .gz for gzip_static
│  └─ public/ favicon, manifest
├─ deploy/
│  ├─ edge/nginx.conf, edge/default.conf, edge/snippets/{proxy-api,security-headers,uploads-headers}.conf
│  ├─ mysql/my.cnf, mysql/init/01-app-user.sh
│  ├─ host-nginx/fersua-djs.conf (beta), host-nginx/fersua-djs.apex.conf (cutover), host-nginx/snippets/fersua-djs-proxy.conf
│  └─ cron/crontab.example
├─ scripts/
│  ├─ prepare-seed-assets.mjs  # runs on the owner PC: reads ../public_html, writes api/seed-assets
│  ├─ init-env.sh              # VPS: .env from example + random secrets, chmod 600
│  ├─ check-env.sh             # lists keys in .env.prod.example missing from .env
│  ├─ deploy.sh, rollback.sh, backup.sh, restore.sh, cli.sh, status.sh
├─ docs/ 00-arquitectura.md, 01-desarrollo-local.md, 02-primer-despliegue.md, 03-actualizar-rollback.md,
│        04-backups-restauracion.md, 05-dns-cutover.md, 06-seguridad.md, 07-correo-spf-dkim-dmarc.md
└─ .github/ workflows/ci.yml, dependabot.yml
```

**npm workspaces: yes.** Several things must be identical in the api validation and the web UI: limits, the booking-form field catalogue, palette ids, social platforms, and the slug regex plus reserved words. One lockfile and one `npm ci` in CI.

Implementation notes:
- npm has no `workspace:*` protocol, so the dependency is written as `"@fersua-djs/shared": "*"`.
- Keep `shared` as pure constants and types, built by tsup to both `index.cjs` and `index.mjs` with an `exports` map. This avoids CJS/ESM problems between Nest and Vite.

**Local dev ports:** MySQL `127.0.0.1:3309` (3307 is the Dashboard's, 3308 is HabitFer's local), mailpit `127.0.0.1:8025` (web UI) and `:1025` (SMTP), api `:4100`, Vite `:5180`. The dev `DATABASE_URL` uses MySQL root, only on local 127.0.0.1, because `prisma migrate dev` needs to create a shadow database.

## 2. Docker

### 2.1 Edge: nginx, not Caddy

Reasons:
- TLS already ends at host nginx with certbot, so Caddy's main advantage (automatic HTTPS) goes unused.
- nginx gives, in the stock image: the realip module, `limit_req`, `gzip_static`, `sendfile` for the uploads volume, and case-insensitive regex redirects. Caddy needs a plugin for rate limiting.
- About 5–10 MB of RAM against about 30–40 MB for Caddy.
- Same syntax the owner already maintains on the host.
- It replaces HabitFer's two inner containers (caddy and web) with one.
- Image: `nginxinc/nginx-unprivileged:stable-alpine`. It runs as a non-root user, listens on 8080, and supports `server … resolve`, which needs nginx 1.27.3 or later.

### 2.2 Root `Dockerfile` (multi-target)

The api image and the edge image come from the same `web-build` stage. So the `index.html` the API uses as its page template always matches the hashed JS/CSS files that the edge serves.

```dockerfile
# syntax=docker/dockerfile:1.7
ARG NODE_IMAGE=node:22-alpine
FROM ${NODE_IMAGE} AS deps
WORKDIR /repo
RUN apk add --no-cache openssl
COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/
COPY api/package.json api/
COPY web/package.json web/
RUN --mount=type=cache,target=/root/.npm npm ci --no-audit --no-fund

FROM deps AS shared
COPY packages/shared packages/shared
RUN npm run build -w @fersua-djs/shared

FROM shared AS web-build
ENV NODE_OPTIONS=--max-old-space-size=768
COPY web web
RUN npm run build -w web

FROM shared AS api-build
COPY api api
RUN npm exec -w api -- prisma generate && npm run build -w api

FROM ${NODE_IMAGE} AS api-deps
WORKDIR /repo
RUN apk add --no-cache openssl
COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/
COPY api/package.json api/
COPY web/package.json web/
RUN --mount=type=cache,target=/root/.npm npm ci --omit=dev -w api --no-audit --no-fund
COPY api/prisma api/prisma
RUN npm exec -w api -- prisma generate

FROM ${NODE_IMAGE} AS api
ARG GIT_SHA=dev
ENV NODE_ENV=production APP_VERSION=${GIT_SHA} CHECKPOINT_DISABLE=1 PRISMA_HIDE_UPDATE_MESSAGE=1
RUN apk add --no-cache openssl && mkdir -p /app/uploads && chown node:node /app/uploads
WORKDIR /app
COPY --from=api-deps  /repo/node_modules ./node_modules
COPY --from=api-deps  /repo/package.json ./package.json
COPY --from=shared    /repo/packages/shared/package.json ./packages/shared/package.json
COPY --from=shared    /repo/packages/shared/dist ./packages/shared/dist
COPY --from=api-build /repo/api/package.json ./api/package.json
COPY --from=api-build /repo/api/dist ./api/dist
COPY api/prisma ./api/prisma
COPY api/seed-assets ./api/seed-assets
COPY --from=web-build /repo/web/dist/index.html ./api/shell/index.html
RUN node -e "require('sharp')"
USER node
WORKDIR /app/api
EXPOSE 3000
CMD ["node","dist/main.js"]

FROM nginxinc/nginx-unprivileged:stable-alpine AS edge
COPY deploy/edge/nginx.conf   /etc/nginx/nginx.conf
COPY deploy/edge/default.conf /etc/nginx/conf.d/default.conf
COPY deploy/edge/snippets/    /etc/nginx/snippets/
COPY --from=web-build /repo/web/dist /usr/share/nginx/html
EXPOSE 8080
```

What some of these lines do and why they matter:
- `mkdir -p /app/uploads && chown node:node /app/uploads`: a new named volume copies the owner of this folder, so the `node` user can write uploads.
- `COPY … /app/uploads … ./api/shell/index.html`: this is the template the API fills in with each DJ's page metadata.
- `RUN node -e "require('sharp')"`: the build fails if sharp's Alpine (musl) binary is missing.
- `COPY … /etc/nginx/conf.d/default.conf`: overwrites the stock `default.conf`. Otherwise the stock server block becomes the default server and catches requests for our domain.

Build gotchas:
- **Prisma binaries.** With Prisma 6.19 (as in HabitFer), set `binaryTargets = ["native","linux-musl-openssl-3.0.x"]`. With Prisma 7 (driver adapters), no engine binary is needed.
- **Install scripts.** Never use `--ignore-scripts` in the Dockerfile. Prisma's schema engine is downloaded by an install script.
- **Windows lockfile.** The lockfile is generated on Windows, so the sharp/Prisma packages for Alpine Linux may be missing from it. The `require('sharp')` smoke test and the CI Docker job catch this. If it happens, run `npm install --os=linux --libc=musl --cpu=x64 sharp` once and commit the lockfile.
- **Build memory.** vite and nest build in parallel stages, which is heavy on 1 vCPU with about 2 GB free. `NODE_OPTIONS` caps each heap, and swap is required (runbook step C1). If builds hurt the other apps, build in GitHub Actions and push to GHCR instead (phase 2, section 9).

### 2.3 `docker-compose.yml` (local dev)

```yaml
name: fersua-djs-dev
services:
  db:
    image: mysql:8.4
    restart: unless-stopped
    environment:
      MYSQL_ROOT_PASSWORD: ${DEV_DB_ROOT_PASSWORD:?set it in .env}
      MYSQL_DATABASE: fersua_djs
    ports: ["127.0.0.1:3309:3306"]
    volumes:
      - dev_db_data:/var/lib/mysql
      - ./deploy/mysql/my.cnf:/etc/mysql/conf.d/zz-fersua.cnf:ro
    healthcheck: { test: ["CMD","mysqladmin","ping","-h","127.0.0.1","--silent"], interval: 5s, retries: 30 }
  mailpit:
    image: axllent/mailpit:<pinned-tag>
    ports: ["127.0.0.1:8025:8025", "127.0.0.1:1025:1025"]
volumes:
  dev_db_data:
```

### 2.4 `docker-compose.prod.yml`

```yaml
name: fersua-djs

x-logging: &logging
  driver: json-file
  options: { max-size: "10m", max-file: "5" }

services:
  db:
    image: mysql:8.4
    restart: unless-stopped
    environment:
      MYSQL_ROOT_PASSWORD: ${DB_ROOT_PASSWORD:?}
      MYSQL_DATABASE: ${DB_NAME:?}
      MYSQL_USER: ${DB_MIGRATOR_USER:?}
      MYSQL_PASSWORD: ${DB_MIGRATOR_PASSWORD:?}
      DB_APP_USER: ${DB_APP_USER:?}
      DB_APP_PASSWORD: ${DB_APP_PASSWORD:?}
    volumes:
      - db_data:/var/lib/mysql
      - ./deploy/mysql/my.cnf:/etc/mysql/conf.d/zz-fersua.cnf:ro
      - ./deploy/mysql/init:/docker-entrypoint-initdb.d:ro
    networks: [backend]
    healthcheck:
      test: ["CMD","mysqladmin","ping","-h","127.0.0.1","--silent"]
      interval: 10s
      timeout: 5s
      retries: 12
      start_period: 90s
    stop_grace_period: 60s
    security_opt: ["no-new-privileges:true"]
    mem_limit: 512m
    mem_reservation: 256m
    cpus: 0.75
    pids_limit: 256
    logging: *logging

  migrate:
    image: fersua-djs-api:${APP_VERSION:-current}
    pull_policy: never
    command: ["/app/node_modules/.bin/prisma","migrate","deploy","--schema","/app/api/prisma/schema.prisma"]
    environment:
      DATABASE_URL: mysql://${DB_MIGRATOR_USER}:${DB_MIGRATOR_PASSWORD}@db:3306/${DB_NAME}
    depends_on: { db: { condition: service_healthy } }
    networks: [backend]
    restart: "no"
    read_only: true
    tmpfs: ["/tmp:size=16m"]
    cap_drop: [ALL]
    security_opt: ["no-new-privileges:true"]
    mem_limit: 256m
    cpus: 0.5
    logging: *logging

  api:
    image: fersua-djs-api:${APP_VERSION:-current}
    build: { context: ., target: api, args: { GIT_SHA: "${APP_VERSION:-dev}" } }
    restart: unless-stopped
    init: true
    depends_on:
      db: { condition: service_healthy }
      migrate: { condition: service_completed_successfully }
    environment:
      NODE_ENV: production
      PORT: "3000"
      NODE_OPTIONS: --max-old-space-size=256
      DATABASE_URL: mysql://${DB_APP_USER}:${DB_APP_PASSWORD}@db:3306/${DB_NAME}?connection_limit=${DB_CONNECTION_LIMIT:-5}&pool_timeout=10
      PUBLIC_URL: ${PUBLIC_URL:?}
      CORS_ORIGINS: ${CORS_ORIGINS:?}
      APP_TIMEZONE: ${APP_TIMEZONE:-America/Bogota}
      TRUST_PROXY: ${TRUST_PROXY:-loopback,uniquelocal}
      JWT_ACCESS_SECRET: ${JWT_ACCESS_SECRET:?}
      JWT_REFRESH_SECRET: ${JWT_REFRESH_SECRET:?}
      JWT_ACCESS_TTL: ${JWT_ACCESS_TTL:-15m}
      JWT_REFRESH_TTL: ${JWT_REFRESH_TTL:-7d}
      BCRYPT_ROUNDS: ${BCRYPT_ROUNDS:-12}
      COOKIE_SECURE: ${COOKIE_SECURE:-true}
      COOKIE_NAME_PREFIX: ${COOKIE_NAME_PREFIX:-__Host-}
      COOKIE_SAMESITE: ${COOKIE_SAMESITE:-strict}
      PASSWORD_RESET_TTL_MIN: ${PASSWORD_RESET_TTL_MIN:-30}
      LOGIN_MAX_ATTEMPTS: ${LOGIN_MAX_ATTEMPTS:-5}
      LOGIN_LOCK_MINUTES: ${LOGIN_LOCK_MINUTES:-15}
      SMTP_HOST: ${SMTP_HOST:?}
      SMTP_PORT: ${SMTP_PORT:-465}
      SMTP_SECURE: ${SMTP_SECURE:-true}
      SMTP_USER: ${SMTP_USER:?}
      SMTP_PASS: ${SMTP_PASS:?}
      MAIL_FROM: ${MAIL_FROM:?}
      MAIL_REPLY_TO: ${MAIL_REPLY_TO:-}
      ADMIN_NOTIFY_EMAIL: ${ADMIN_NOTIFY_EMAIL:-}
      UPLOAD_DIR: /app/uploads
      UPLOAD_MAX_FILE_MB: ${UPLOAD_MAX_FILE_MB:-10}
      UPLOAD_MAX_INPUT_PIXELS: ${UPLOAD_MAX_INPUT_PIXELS:-40000000}
      MEDIA_MAX_TOTAL_MB_PER_DJ: ${MEDIA_MAX_TOTAL_MB_PER_DJ:-200}
      SHARP_CONCURRENCY: "1"
      TURNSTILE_SITE_KEY: ${TURNSTILE_SITE_KEY:-}
      TURNSTILE_SECRET_KEY: ${TURNSTILE_SECRET_KEY:-}
      SHELL_TEMPLATE: /app/api/shell/index.html
      LOG_LEVEL: ${LOG_LEVEL:-info}
    volumes: ["uploads:/app/uploads"]
    networks: [backend, edge]
    healthcheck:
      test: ["CMD","wget","-q","-O","/dev/null","http://127.0.0.1:3000/api/health"]
      interval: 15s
      timeout: 5s
      retries: 5
      start_period: 40s
    read_only: true
    tmpfs: ["/tmp:size=64m"]
    cap_drop: [ALL]
    security_opt: ["no-new-privileges:true"]
    mem_limit: 512m
    mem_reservation: 192m
    cpus: 0.75
    pids_limit: 256
    logging: *logging

  edge:
    image: fersua-djs-edge:${APP_VERSION:-current}
    build: { context: ., target: edge }
    restart: unless-stopped
    depends_on: { api: { condition: service_healthy } }
    ports: ["127.0.0.1:${EDGE_PORT:-8090}:8080"]
    volumes: ["uploads:/srv/uploads:ro"]
    networks: [edge]
    environment: { NGINX_ENTRYPOINT_QUIET_LOGS: "1" }
    healthcheck:
      test: ["CMD","wget","-q","-O","/dev/null","http://127.0.0.1:8080/healthz"]
      interval: 15s
      timeout: 3s
      retries: 3
    read_only: true
    tmpfs: ["/tmp:size=16m"]
    cap_drop: [ALL]
    security_opt: ["no-new-privileges:true"]
    mem_limit: 64m
    cpus: 0.5
    pids_limit: 64
    logging: *logging

networks:
  backend: { internal: true }
  edge: {}

volumes:
  db_data: { name: fersua_djs_db_data }
  uploads: { name: fersua_djs_uploads }
```

Notes on this file:
- **Networks.** `backend` is internal: the db has no internet access. The api is on both networks, so it can reach smtp.hostinger.com:465.
- **Environment.** Variables are passed one by one on purpose, not with `env_file`, so the api never receives the root or migrator DB passwords.
- **`ADMIN_*` is not mapped here.** Those values are passed only for the one-time seed command (section 5).
- **`migrate` with a read-only filesystem.** If Prisma complains about writing, remove `read_only` from `migrate` only.

**Memory and CPU budget** (1 vCPU, about 2.1 GB free):

| service | mem_limit | expected RSS | cpus cap |
|---|---|---|---|
| db | 512m | 250–320 MB (performance_schema off, 128M buffer pool) | 0.75 |
| api | 512m (heap 256m; sharp concurrency 1, `sharp.cache({memory:32})`, max input 40 MP) | 150–250 MB | 0.75 |
| edge | 64m | 5–15 MB | 0.5 |
| migrate | 256m, runs a few seconds per deploy | — | 0.5 |

Hard ceiling is about 1.1 GB; normal use is about 450–600 MB. The CPU caps stop any one container from starving HabitFer or the Dashboard.

### 2.5 `deploy/mysql/my.cnf`

```ini
[mysqld]
performance_schema=OFF
innodb_buffer_pool_size=128M
innodb_redo_log_capacity=104857600
max_connections=40
skip-name-resolve
skip-log-bin
character-set-server=utf8mb4
collation-server=utf8mb4_0900_ai_ci
table_open_cache=256
tmp_table_size=16M
max_heap_table_size=16M
default-time-zone='+00:00'
```

`skip-log-bin` means no point-in-time recovery. That is acceptable here: there are nightly dumps plus a dump before every deploy, and every booking also goes to WhatsApp.

### 2.6 `deploy/mysql/init/01-app-user.sh`

This runs only when the volume is first created. Changing a password later needs `ALTER USER`, as in Dashboard §4.

```sh
#!/bin/sh
set -eu
mysql -uroot -p"$MYSQL_ROOT_PASSWORD" <<SQL
CREATE USER IF NOT EXISTS '${DB_APP_USER}'@'%' IDENTIFIED BY '${DB_APP_PASSWORD}';
GRANT SELECT, INSERT, UPDATE, DELETE ON \`${MYSQL_DATABASE}\`.* TO '${DB_APP_USER}'@'%';
FLUSH PRIVILEGES;
SQL
```

The image's `MYSQL_USER` (the migrator) gets ALL privileges on that one database.

### 2.7 Edge config (`deploy/edge/`)

**`nginx.conf`** (http level):

```nginx
worker_processes 1;
pid /tmp/nginx.pid;
error_log /dev/stderr warn;
events { worker_connections 1024; }
http {
  include /etc/nginx/mime.types; default_type application/octet-stream;
  server_tokens off; sendfile on; tcp_nopush on; keepalive_timeout 30s;
  client_body_temp_path /tmp/client_temp; proxy_temp_path /tmp/proxy_temp;
  fastcgi_temp_path /tmp/fcgi; uwsgi_temp_path /tmp/uwsgi; scgi_temp_path /tmp/scgi;
  proxy_max_temp_file_size 0;

  set_real_ip_from 172.16.0.0/12; set_real_ip_from 192.168.0.0/16; set_real_ip_from 10.0.0.0/8;
  real_ip_header X-Real-IP;

  log_format main '$remote_addr "$request" $status $body_bytes_sent $request_time "$http_user_agent" rid=$request_id';
  access_log /dev/stdout main;

  gzip on; gzip_static on; gzip_vary on; gzip_comp_level 5; gzip_min_length 1024;
  gzip_types text/css application/javascript application/json image/svg+xml text/plain application/xml;

  limit_req_zone $binary_remote_addr zone=auth:10m  rate=10r/m;
  limit_req_zone $binary_remote_addr zone=forms:10m rate=6r/m;
  limit_req_zone $binary_remote_addr zone=api:10m   rate=10r/s;
  limit_req_zone $binary_remote_addr zone=pages:10m rate=5r/s;
  limit_req_status 429;

  resolver 127.0.0.11 valid=10s ipv6=off;
  upstream api_upstream { zone api_upstream 64k; server api:3000 resolve; keepalive 8; }
  include /etc/nginx/conf.d/*.conf;
}
```

- The `set_real_ip_from` ranges are the Docker bridge ranges. The only way in is the loopback-published port.
- `resolve` on the upstream stops nginx from keeping a stale api IP after the api container is recreated.

**`default.conf`** (server):

```nginx
server {
  listen 8080 default_server;
  server_name _;
  root /usr/share/nginx/html;
  client_max_body_size 1m;

  location = /healthz { access_log off; default_type text/plain; return 200 "ok\n"; }
  location ~ /\. { deny all; }

  # Legacy static site
  location ~* ^/eventos/macflymikebran(/.*)?$ { return 301 /macflymikebran#fechas; }
  location ~* ^/macflymikebran\.html$         { return 301 /macflymikebran; }
  location ~* ^/default\.php$                 { return 301 /; }
  # location ~* ^/(allset|pedido|diannmakinne|molly)(\.html)?$ { return 302 https://old.fersuastudio.com$request_uri; }

  location /api/ {
    client_max_body_size 11m; proxy_request_buffering off;
    limit_req zone=api burst=40 nodelay;
    include /etc/nginx/snippets/proxy-api.conf;
  }
  location ~ ^/api/auth/(login|register|forgot-password|reset-password)$ {
    limit_req zone=auth burst=5 nodelay; include /etc/nginx/snippets/proxy-api.conf;
  }
  location ~ ^/api/public/[a-z0-9-]+/booking-requests$ {
    limit_req zone=forms burst=3 nodelay; include /etc/nginx/snippets/proxy-api.conf;
  }
  location = /sitemap.xml { rewrite ^ /api/public/sitemap.xml break; include /etc/nginx/snippets/proxy-api.conf; }
  location = /robots.txt  { rewrite ^ /api/public/robots.txt  break; include /etc/nginx/snippets/proxy-api.conf; }

  location ~* ^/uploads/.+\.(webp|jpg)$ { root /srv; include /etc/nginx/snippets/uploads-headers.conf; }
  location /uploads/ { return 404; }

  location /assets/ {
    include /etc/nginx/snippets/security-headers.conf;
    add_header Cache-Control "public, max-age=31536000, immutable" always;
    try_files $uri =404;
  }

  # Page shells rendered by the API
  location = / {
    limit_req zone=pages burst=30 nodelay;
    rewrite ^ /api/public/shell?path=/ break;
    include /etc/nginx/snippets/proxy-api.conf; include /etc/nginx/snippets/security-headers.conf;
    error_page 502 503 504 = @spa;
  }
  location ~ "^/[A-Za-z0-9][A-Za-z0-9-]{0,59}/?$" {
    limit_req zone=pages burst=30 nodelay;
    rewrite ^ /api/public/shell?path=$uri break;
    include /etc/nginx/snippets/proxy-api.conf; include /etc/nginx/snippets/security-headers.conf;
    error_page 502 503 504 = @spa;
  }
  location / {
    include /etc/nginx/snippets/security-headers.conf;
    add_header Cache-Control "no-cache" always;
    try_files $uri /index.html;
  }
  location @spa {
    include /etc/nginx/snippets/security-headers.conf;
    add_header Cache-Control "no-cache" always;
    try_files /index.html =503;
  }
}
```

- **`/eventos/...` redirect.** Goes to the alias, and the API then 301s to the current slug, so this survives slug changes. The `#fechas` fragment is carried through the redirects.
- **The commented `allset|pedido|…` rule.** Enable it only if the owner chooses the legacy-subdomain option (question 5 in section 11).
- **`proxy_request_buffering off`** on `/api/`: host nginx has already buffered the body to disk, so the edge's tmpfs stays small.
- **Uploads.** Only `.webp` and `.jpg` files are served; everything else under `/uploads/` is a 404.
- **`/assets/`** are hashed Vite build files, so they are cached for a year.
- **`@spa` fallback.** Used only if the api is down.
- **`location /`** covers multi-segment SPA routes (`/panel/...`, `/admin/...`) and files at the root such as `/favicon.ico`.

Snippets:
- **`proxy-api.conf`:**

  ```nginx
  proxy_pass http://api_upstream;
  proxy_http_version 1.1;
  proxy_set_header Connection "";
  proxy_set_header Host $host;
  proxy_set_header X-Real-IP $remote_addr;
  proxy_set_header X-Forwarded-For $remote_addr;
  proxy_set_header X-Forwarded-Proto $http_x_forwarded_proto;
  proxy_set_header X-Request-Id $request_id;
  proxy_connect_timeout 5s;
  proxy_read_timeout 60s;
  ```

- **`security-headers.conf`:** `X-Content-Type-Options nosniff`, `X-Frame-Options DENY`, `Referrer-Policy strict-origin-when-cross-origin`, `Permissions-Policy camera=(), microphone=(), geolocation=(), payment=()`, `Cross-Origin-Opener-Policy same-origin`, and `Content-Security-Policy "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'; object-src 'none'"`. AntD's CSS-in-JS needs `'unsafe-inline'` for styles. If Turnstile is enabled, add `https://challenges.cloudflare.com` to `script-src` and `frame-src`.
- **`uploads-headers.conf`:** 1-year immutable `Cache-Control`, `nosniff`, `Content-Security-Policy "default-src 'none'; img-src 'self'; sandbox"`, `Cross-Origin-Resource-Policy same-site`.

Gotchas the implementer must respect:
- **`add_header` inheritance.** In nginx, a location that has its own `add_header` inherits none from the server level. That is why every location includes the snippet explicitly.
- **Duplicate CSP.** Disable helmet's CSP in the API (`helmet({ contentSecurityPolicy: false })`; responses are JSON or the page template, which gets its headers from the edge). Otherwise a response carries two CSP headers.
- **No `proxy_intercept_errors`.** Leave it off so the API's 404 page reaches the browser. `error_page` still catches the edge's own 502s.

### 2.8 Page template endpoint (the API side of the edge contract)

`GET /api/public/shell?path=/<segment>` returns:
- **200** with `SHELL_TEMPLATE` filled in (`<title>`, description, canonical URL, absolute `og:image` built from `PUBLIC_URL`, JSON-LD) when the DJ is approved.
- **301** to the lowercase slug when the case differs, or when the segment is an alias or an old slug. This comes from a `SlugAlias` table, seeded with `macflymikebran`.
- **200** with a generic template and `noindex` for reserved app routes (`/login`, `/registro`, `/panel`…).
- **404** with the template and `noindex` for unknown, pending or suspended DJs.

This gives real WhatsApp and Instagram link previews for each DJ, fixes the legacy relative `og:image` bug, and makes `/MacflyMikebran` in any casing answer a real 301 that still works if the DJ later changes the slug.

## 3. Host nginx (owner, with sudo)

### 3.1 Files

**`deploy/host-nginx/snippets/fersua-djs-proxy.conf`** goes to `/etc/nginx/snippets/`:

```nginx
proxy_pass http://127.0.0.1:8090;
proxy_http_version 1.1;
proxy_set_header Connection "";
proxy_set_header Host              $host;
proxy_set_header X-Real-IP         $remote_addr;
proxy_set_header X-Forwarded-For   $remote_addr;
proxy_set_header X-Forwarded-Proto $scheme;
proxy_set_header X-Forwarded-Host  $host;
proxy_connect_timeout 5s; proxy_send_timeout 60s; proxy_read_timeout 60s;
```

`X-Forwarded-For` is overwritten with `$remote_addr`, not appended to, so a client-supplied value is ignored.

**`deploy/host-nginx/fersua-djs.conf`** (beta) goes to `/etc/nginx/sites-available/fersua-djs.conf`:

```nginx
server {
    listen 80;
    listen [::]:80;
    server_name beta.fersuastudio.com;
    server_tokens off;
    client_max_body_size 12m;
    client_body_timeout 30s;
    access_log /var/log/nginx/fersua-djs.access.log;
    error_log  /var/log/nginx/fersua-djs.error.log warn;
    add_header X-Robots-Tag "noindex, nofollow" always;
    location / { include snippets/fersua-djs-proxy.conf; }
}
```

- Keep the `[::]` line only if the other vhosts already listen on IPv6.
- `client_max_body_size 12m` is above the API's 10 MB upload limit, so the API can return a clean 413.
- `X-Robots-Tag` keeps beta out of search engines.

**gzip:** compression is done at the edge (pre-compressed files plus `gzip on`). Host nginx passes the already-compressed responses through; nothing to add on the host.

### 3.2 Commands

```bash
sudo cp /home/deploy/apps/fersua-djs/deploy/host-nginx/snippets/fersua-djs-proxy.conf /etc/nginx/snippets/
sudo cp /home/deploy/apps/fersua-djs/deploy/host-nginx/fersua-djs.conf /etc/nginx/sites-available/fersua-djs.conf
sudo ln -s /etc/nginx/sites-available/fersua-djs.conf /etc/nginx/sites-enabled/fersua-djs.conf
sudo nginx -t && sudo systemctl reload nginx
curl -sI -H 'Host: beta.fersuastudio.com' http://127.0.0.1/ | head -3
sudo certbot --nginx -d beta.fersuastudio.com --redirect --hsts
sudo nginx -t && sudo systemctl reload nginx
sudo certbot certificates && sudo certbot renew --dry-run
```

- The `curl` line only works once the DNS record and the stack are up.
- Certbot turns the server block into a 443 one and adds a separate 80 → 443 redirect block.
- On Ubuntu 24.04 (nginx 1.24) you can edit `listen 443 ssl;` to `listen 443 ssl http2;`. HSTS stays without `includeSubDomains` or `preload`.

**Apex (at cutover).** Append this block from `deploy/host-nginx/fersua-djs.apex.conf` to the same file:

```nginx
server {
    listen 80; listen [::]:80;
    server_name fersuastudio.com www.fersuastudio.com;
    server_tokens off; client_max_body_size 12m; client_body_timeout 30s;
    access_log /var/log/nginx/fersua-djs.access.log; error_log /var/log/nginx/fersua-djs.error.log warn;
    if ($host = www.fersuastudio.com) { return 301 https://fersuastudio.com$request_uri; }
    location / { include snippets/fersua-djs-proxy.conf; }
}
```

Then run `sudo certbot --nginx -d fersuastudio.com -d www.fersuastudio.com --redirect --hsts`. After that, change the beta 443 block's `location /` to `return 301 https://fersuastudio.com$request_uri;`.

### 3.3 Real client IP chain

1. Client 1.2.3.4 connects to host nginx. Host nginx sets `X-Real-IP` and `X-Forwarded-For` to 1.2.3.4 and `X-Forwarded-Proto: https`.
2. The edge sees the connection from the Docker gateway (172.x). The realip module trusts 172.16.0.0/12 and sets `$remote_addr` to 1.2.3.4. `limit_req` and the access log use it.
3. The edge forwards `X-Forwarded-For: 1.2.3.4` and `X-Real-IP` to the api.
4. The api sets `app.set('trust proxy', 'loopback, uniquelocal')`. Then `req.ip` is 1.2.3.4 and `req.protocol` is https. `@nestjs/throttler` uses `req.ip`.

**Test:** log in with a wrong password 6 times from a phone on mobile data. It must get 429 while a PC on another network keeps working.

### 3.4 Where legacy redirects live

| Legacy URL | Handled by | Result |
|---|---|---|
| `/Eventos/MacflyMikeBran/*` (including `IMG/*`) | edge | 301 to `/macflymikebran#fechas` |
| `/MacflyMikebran.html` | edge | 301 to `/macflymikebran` |
| `/default.php` | edge | 301 to `/` |
| `/MacflyMikebran` (any casing) | API template endpoint, via the `SlugAlias` table | 301 to `/macfly-mike-bran` (proposed slug) |
| `/DiannMakinne`, `/Molly`, `/Allset`, `/pedido` | owner decides | 404, or a 302 to a legacy subdomain (section 8) |

## 4. Environment files

**`.env.prod.example`** is committed. The real `.env` is `chmod 600`, never committed, and a copy lives in the owner's password manager.

```dotenv
# Copy to .env (chmod 600). Never commit. Values containing $ MUST be single-quoted.
COMPOSE_FILE=docker-compose.prod.yml
COMPOSE_PROJECT_NAME=fersua-djs
EDGE_PORT=8090
# --- URLs (change at cutover; api restart only) ---
PUBLIC_URL=https://beta.fersuastudio.com
CORS_ORIGINS=https://beta.fersuastudio.com
APP_TIMEZONE=America/Bogota
# --- MySQL (openssl rand -hex 32; hex = URL-safe inside DATABASE_URL) ---
DB_NAME=fersua_djs
DB_ROOT_PASSWORD=
DB_MIGRATOR_USER=fersua_migrator
DB_MIGRATOR_PASSWORD=
DB_APP_USER=fersua_app
DB_APP_PASSWORD=
DB_CONNECTION_LIMIT=5
# --- Auth (openssl rand -hex 48; access != refresh) ---
JWT_ACCESS_SECRET=
JWT_REFRESH_SECRET=
JWT_ACCESS_TTL=15m
JWT_REFRESH_TTL=7d
BCRYPT_ROUNDS=12
COOKIE_SECURE=true
COOKIE_NAME_PREFIX=__Host-
COOKIE_SAMESITE=strict
PASSWORD_RESET_TTL_MIN=30
LOGIN_MAX_ATTEMPTS=5
LOGIN_LOCK_MINUTES=15
TRUST_PROXY=loopback,uniquelocal
# --- One-time admin bootstrap: leave EMPTY; passed at runtime via `docker compose run -e` (see runbook) ---
ADMIN_USERNAME=
ADMIN_EMAIL=
ADMIN_PASSWORD=
# --- SMTP (Hostinger Email) ---
SMTP_HOST=smtp.hostinger.com
SMTP_PORT=465
SMTP_SECURE=true
SMTP_USER=no-reply@fersuastudio.com
SMTP_PASS=''
MAIL_FROM='Fersua Studio <no-reply@fersuastudio.com>'
MAIL_REPLY_TO=
ADMIN_NOTIFY_EMAIL=
# --- Uploads ---
UPLOAD_MAX_FILE_MB=10
UPLOAD_MAX_INPUT_PIXELS=40000000
MEDIA_MAX_TOTAL_MB_PER_DJ=200
# --- Anti-spam (optional) ---
TURNSTILE_SITE_KEY=
TURNSTILE_SECRET_KEY=
# --- Ops ---
LOG_LEVEL=info
BACKUP_DIR=/home/deploy/backups/fersua-djs
BACKUP_RETENTION_DAYS=14
BACKUP_HEALTHCHECK_URL=
```

- `COMPOSE_FILE` in `.env` means a plain `docker compose ps/logs/up` on the VPS always uses the production file.
- `ADMIN_NOTIFY_EMAIL` receives the "new DJ waiting for approval" emails.
- `TURNSTILE_*` is optional anti-spam for registration and the booking form. The frontend gets the site key from the API.

**Secret generation:** `openssl rand -hex 32` for DB passwords and `openssl rand -hex 48` for JWT secrets. Use hex because base64 characters (`+ / =`) break `DATABASE_URL`, and `$` gets interpolated by compose.

**`scripts/init-env.sh`:**

```bash
set -euo pipefail
[ -e .env ] && { echo ".env already exists"; exit 1; }
umask 077; cp .env.prod.example .env
for k in DB_ROOT_PASSWORD DB_MIGRATOR_PASSWORD DB_APP_PASSWORD; do sed -i "s|^$k=.*|$k=$(openssl rand -hex 32)|" .env; done
for k in JWT_ACCESS_SECRET JWT_REFRESH_SECRET; do sed -i "s|^$k=.*|$k=$(openssl rand -hex 48)|" .env; done
chmod 600 .env; echo "Now edit .env: SMTP_PASS, ADMIN_NOTIFY_EMAIL (PUBLIC_URL already beta)"
```

**API startup validation (joi):** the api refuses to start in production when:
- a secret is shorter than 64 characters,
- the two JWT secrets are equal,
- `PUBLIC_URL` is not `https://`,
- `COOKIE_SECURE` is not `true`,
- any SMTP variable is empty.

**Local dev:** root `.env.example` has `DEV_DB_ROOT_PASSWORD`. `api/.env.example` has `DATABASE_URL=mysql://root:<dev>@127.0.0.1:3309/fersua_djs`, `PUBLIC_URL=http://localhost:5180`, `SMTP_HOST=127.0.0.1`, `SMTP_PORT=1025`, `SMTP_SECURE=false`, `UPLOAD_DIR=./.uploads`, `COOKIE_SECURE=false`, `COOKIE_NAME_PREFIX=`. In development only, Nest serves `/uploads` itself (ServeStaticModule).

## 5. First deploy runbook

Labels: **[PC]** owner's computer, **[hPanel]** Hostinger panel, **[SUDO]** owner on the VPS, **[DEPLOY]** `deploy` user on the VPS.

**A. [PC]**
1. Create a private GitHub repo, e.g. `theoclas/fersua-djs`, and push.
2. Prepare the seed images: `node scripts/prepare-seed-assets.mjs --src ../public_html`.
   - It reads `img/header.JPEG`, `img/Mikebran.jpg`, `img/Macfly.jpg`, `img/photo-1..8.jpg` and `Eventos/MacflyMikeBran/IMG/*`.
   - It auto-rotates, resizes to at most 2400 px on the long edge, saves JPEG at quality 82 without metadata, and writes a manifest to `api/seed-assets/macfly-mike-bran/`.
   - `photo-10/11/12`, which the old HTML references, do not exist and are skipped.
   - Commit the result (about 3–5 MB).
3. Optional smoke test of the production stack locally: `docker compose -f docker-compose.prod.yml --env-file .env.prod.local up -d --build`, then open http://localhost:8090.

**B. [hPanel]**
4. Add a DNS record: type A, name `beta`, points to `177.7.40.130`, TTL 300. No AAAA unless the VPS IPv6 check in C2 passes. Verify with `nslookup beta.fersuastudio.com 8.8.8.8`.
5. Emails: create the mailbox `no-reply@fersuastudio.com` with a strong password (it goes in `SMTP_PASS`). Confirm the email DNS status (SPF and DKIM) shows OK.

**C. [SUDO] preflight**
1. Swap. Run `free -h`. If swap is 0:

   ```bash
   sudo fallocate -l 2G /swapfile && sudo chmod 600 /swapfile && sudo mkswap /swapfile && sudo swapon /swapfile
   echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
   echo 'vm.swappiness=10' | sudo tee /etc/sysctl.d/99-swappiness.conf && sudo sysctl --system
   ```

2. Run `ip -6 addr show scope global` and note whether the VPS has IPv6. Run `ss -ltnp | grep ':8090 '`; it must print nothing.

**D. [DEPLOY]**
1. Deploy key:

   ```bash
   ssh-keygen -t ed25519 -N "" -C "deploy@vps fersua-djs" -f ~/.ssh/id_ed25519_fersua_djs
   cat ~/.ssh/id_ed25519_fersua_djs.pub
   printf 'Host github-fersua-djs\n  HostName github.com\n  User git\n  IdentityFile ~/.ssh/id_ed25519_fersua_djs\n  IdentitiesOnly yes\n' >> ~/.ssh/config
   ```

   The owner adds the printed public key in GitHub under Settings → Deploy keys, read-only.
2. Clone: `cd ~/apps && git clone git@github-fersua-djs:theoclas/fersua-djs.git && cd fersua-djs`
3. Env: `bash scripts/init-env.sh && nano .env && bash scripts/check-env.sh`
4. Validate: `docker compose config --quiet` must print nothing.
5. Build and start: `bash scripts/deploy.sh --first` (backup skipped, build, tag, up, wait for health).
6. Verify:

   ```bash
   docker compose ps
   docker compose logs migrate
   curl -s http://127.0.0.1:8090/api/health
   ```

   `ps` should show db, api and edge healthy and migrate exited with 0. The migrate log should say "All migrations have been successfully applied".
7. Seed the admin. The values are not stored in `.env` or in shell history.

   ```bash
   read -r -p "Admin username: " AU; read -r -p "Admin email: " AE; read -r -s -p "Admin password: " AP; echo
   docker compose run --rm --no-deps -e ADMIN_USERNAME="$AU" -e ADMIN_EMAIL="$AE" -e ADMIN_PASSWORD="$AP" api node dist/cli/seed-admin.js
   unset AU AE AP
   ```

   The script checks the password policy and refuses to run if an admin already exists; rotation goes through `dist/cli/reset-password.js`.
8. Seed Mac Fly & Mike Bran: `docker compose run --rm --no-deps api node dist/cli/seed-macfly.js --username macflymikebran --slug macfly-mike-bran`.
   - Idempotent, via an upsert on the slug.
   - Images go through the normal media pipeline: WebP variants, EXIF stripped, magic bytes checked.
   - It creates the alias `macflymikebran`, marks the account APPROVED and featured, and archives past events.
   - It prints a random temporary password once; the account must change it on first login. The owner shares it later.
9. Test the redirects through the edge:

   ```bash
   curl -sI http://127.0.0.1:8090/MacflyMikebran | grep -i location
   curl -sI "http://127.0.0.1:8090/Eventos/MacflyMikeBran/14%20Nov.html" | grep -i location
   ```

10. Mail test: `bash scripts/cli.sh send-test-mail <owner mailbox>`. Check the inbox and spam folder, and check the headers (SPF, DKIM and DMARC should pass).
11. Backups: `bash scripts/backup.sh manual`, then install the crontab (section 7).

**E. [SUDO]** Host nginx and certbot, as in section 3.2.

**F. Beta checklist**
- https works and http redirects to https.
- `/api/health` returns 200.
- Registration creates a pending DJ that is not listed. The admin approves it, and it then appears on the index.
- Login works with the username, and cookies are `Secure` and `HttpOnly`.
- Password reset by email works end to end, and so does the admin temporary-password flow.
- A booking request is saved and WhatsApp opens.
- Uploading a 25 MB image returns 413. A `.php` renamed to `.jpg` is rejected.
- The WhatsApp link preview of `/macfly-mike-bran` shows the image.
- The pages carry `X-Robots-Tag: noindex`.

**G. Monitoring:** set up UptimeRobot and healthchecks.io (section 10).

## 6. Update, redeploy and rollback

**Normal update [DEPLOY]:** `cd ~/apps/fersua-djs && bash scripts/deploy.sh`.

What `deploy.sh` does, in order:
1. Preflight checks:
   - The git tree is clean; the server copy is never edited by hand.
   - At least 3 GB of free disk (`df`).
   - `check-env.sh` passes. It aborts and lists any new keys in `.env.prod.example` that are missing from `.env`.
2. `git fetch && git pull --ff-only`, then `NEW=$(git rev-parse --short=12 HEAD)`, and `PREV` read from `.deploy/current`.
3. Runs `bash scripts/backup.sh pre-deploy-$NEW` (database only).
4. Builds: `APP_VERSION=$NEW docker compose build api edge`. Shared stages are cached, and `migrate` reuses the api image.
5. Retags: `docker tag fersua-djs-{api,edge}:$NEW fersua-djs-{api,edge}:current`.
6. Starts: `docker compose up -d --remove-orphans`. Compose sees the new image behind `:current` and recreates migrate, api and edge; migrations run automatically.
7. Waits up to 120 s for api and edge to be healthy, then runs `curl -fsS http://127.0.0.1:8090/api/health` and checks the reported `version` equals `$NEW`.
8. If the health check fails, rolls back automatically (see below) unless `--no-auto-rollback` is passed, and exits 1.
9. Records the release: writes `$NEW` to `.deploy/current` and appends `date PREV->NEW` to `.deploy/history`.
10. Clean-up: removes `fersua-djs-*` image tags older than the last 3, and runs `docker builder prune -f --filter until=168h`.

**Rollback:** `bash scripts/rollback.sh [sha]`. The default is the previous release in `.deploy/history`.
- It retags `:current` to the old SHA, then runs `docker compose up -d --no-deps api edge`.
- `--no-deps` skips `migrate`, so the old image never touches a newer schema.

Migration policy that makes image rollback safe:
- Changes are expand/contract. Only additive, nullable or defaulted columns go out together with the code that uses them. Drops and renames go in a later release.
- If a migration damaged data, run `bash scripts/restore.sh ~/backups/fersua-djs/db_pre-deploy-<sha>_*.sql.gz`, then roll back.
- MySQL schema changes are not transactional. If a migration fails halfway, fix it by hand and then run `docker compose run --rm migrate /app/node_modules/.bin/prisma migrate resolve --rolled-back <name> --schema /app/api/prisma/schema.prisma`.

**Manual equivalent**, if the script is unavailable:

```bash
git pull --ff-only
APP_VERSION=$(git rev-parse --short=12 HEAD) docker compose build api edge
# docker tag … :current (for api and edge)
docker compose up -d
```

**Changing only env values** (for example `PUBLIC_URL`): `docker compose up -d api`. No rebuild needed.

## 7. Backups

**`scripts/backup.sh <label>`** runs as `deploy`, with `set -euo pipefail`:
- **Backup folder:** `BACKUP_DIR` with `chmod 700`. The dumps contain personal data covered by habeas data (Ley 1581).
- **Database dump:**

  ```bash
  docker compose exec -T db sh -c 'umask 077; printf "[client]\nuser=root\npassword=%s\n" "$MYSQL_ROOT_PASSWORD" >/tmp/bk.cnf; mysqldump --defaults-extra-file=/tmp/bk.cnf --single-transaction --quick --routines --triggers --hex-blob --no-tablespaces --default-character-set=utf8mb4 --databases "$MYSQL_DATABASE"; rc=$?; rm -f /tmp/bk.cnf; exit $rc' | gzip -9 > "$f.tmp" && mv "$f.tmp" "$f"
  ```

  The file is `db_<label>_<stamp>.sql.gz`.
- **Dump verification:** `gzip -t "$f"` and `zcat "$f" | tail -n1 | grep -q 'Dump completed'`, following the Dashboard lesson.
- **Uploads** (nightly and manual only): `docker run --rm -v fersua_djs_uploads:/data:ro alpine:3 tar -C /data -czf - . > "$BACKUP_DIR/uploads_<stamp>.tar.gz"`.
- **Rotation:**
  - Nightly database dumps are kept for `BACKUP_RETENTION_DAYS` (14).
  - Sunday dumps are also copied to `weekly/` and kept 8 weeks.
  - Uploads tarballs are kept 7 days.
  - Only the newest 10 `pre-deploy-*` dumps are kept.
  - If uploads grow past about 1 GB, switch them to restic, which only stores what changed.
- **Alerts:** at the end it pings `curl -fsS -m 10 --retry 3 "$BACKUP_HEALTHCHECK_URL"`, and healthchecks.io emails the owner when a nightly backup is missed.

**Crontab (`crontab -e` as `deploy`):**

```
SHELL=/bin/bash
PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
15 8 * * * cd /home/deploy/apps/fersua-djs && bash scripts/backup.sh nightly >> /home/deploy/backups/fersua-djs/backup.log 2>&1
```

08:15 UTC is 03:15 in Bogotá. Check the server time zone with `timedatectl`.

**Off-server copy (strongly recommended):**
- Use restic, which is encrypted and incremental, run right after the nightly backup.
- Target: rclone to the owner's Google Drive, or Backblaze B2 (about USD 0.006 per GB per month).
- The restic password and a copy of `.env` go into the owner's password manager.
- Minimum fallback: a weekly `scp` pull from the owner's PC.

**Restore (`scripts/restore.sh <db.sql.gz> [uploads.tar.gz]`):**
1. `bash scripts/backup.sh pre-restore`, as a safety copy.
2. `docker compose stop edge api` to stop all writes.
3. Database: `docker compose exec -T db sh -c 'mysql -uroot -p"$MYSQL_ROOT_PASSWORD" -e "DROP DATABASE IF EXISTS \`$MYSQL_DATABASE\`"'`, then `gunzip -c <dump> | docker compose exec -T db sh -c 'mysql -uroot -p"$MYSQL_ROOT_PASSWORD"'`. The dump was taken with `--databases`, so it recreates the database. Database-level grants survive the drop.
4. Uploads: `docker run --rm -v fersua_djs_uploads:/data -v "$BACKUP_DIR":/b:ro alpine:3 sh -c 'find /data -mindepth 1 -delete && tar -xzf /b/<uploads.tar.gz> -C /data && chown -R 1000:1000 /data'`.
5. `docker compose up -d`. `migrate` applies any migrations newer than the dump.
6. Compare `COUNT(*)` on `User`, `DjAccount`, `Event`, `BookingRequest` and `MediaAsset` with the numbers the backup script logged. They must match exactly.

Rehearse a restore every month on the owner's PC against the local 3309 database.

## 8. DNS cutover to the apex, and email authentication

**T−48 h [hPanel]**
- Run `dig NS fersuastudio.com +short` to confirm the zone is at Hostinger.
- Screenshot or export the whole zone.
- Lower the TTL to 300 on the apex A, the apex AAAA (`2a02:4780:…`) and `www`.
- If Hostinger CDN is enabled for this site, disable it.
- CAA needs no change: the `dashboard.` Let's Encrypt certificate proves Let's Encrypt is already allowed.

**T−24 h**
- Back up `public_html` from File Manager (compress, then download) and keep it on Hostinger untouched as the rollback target.
- Allset is excluded and will stop being served from fersuastudio.com; the owner must decide where it lives. Same for DiannMakinne and Molly. Recommended: a subdomain `old.fersuastudio.com` (or `allset.`) created in hPanel on the shared hosting (A record to `195.179.239.107`), with those pages copied into its folder. Then enable the commented edge rule so the old URLs 302 there.
- **[SUDO]** Add the apex HTTP-only server block (section 3.2) now. It is harmless while DNS still points to Hostinger.
- Beta sign-off by the owner.

**T0**
1. **[hPanel]**
   - Change the apex A record to `177.7.40.130`.
   - AAAA: if the VPS has global IPv6, nginx listens on `[::]:80/443` and ufw allows IPv6, point AAAA to the VPS IPv6. Otherwise delete the AAAA record. It must never keep pointing to Hostinger: IPv6 visitors (common on Colombian mobile carriers) would keep seeing the old site.
   - `www`: CNAME to `fersuastudio.com`. If it is currently an A record to Hostinger, replace it.
   - Do not touch MX (`mx1`/`mx2.hostinger.com`), the SPF TXT, the DKIM CNAMEs, DMARC, `autodiscover`/`autoconfig`, `dashboard`, `corporaciondestellos` or `beta`.
2. Wait until the authoritative name server answers with the new IP: `dig +short fersuastudio.com @<ns1 from the NS query>` should return `177.7.40.130`, usually within 1–2 minutes.
3. **[SUDO]** Get the certificate and reload:

   ```bash
   sudo certbot --nginx -d fersuastudio.com -d www.fersuastudio.com --redirect --hsts
   sudo nginx -t && sudo systemctl reload nginx
   ```

   Let's Encrypt checks against the authoritative DNS, so there is no need to wait for caches.
4. **[DEPLOY]** In `.env` set `PUBLIC_URL=https://fersuastudio.com` and `CORS_ORIGINS=https://fersuastudio.com`, then `docker compose up -d api`. Cookies are host-only, so beta sessions end and users log in again.
5. **[SUDO]** Change the beta 443 block to `return 301 https://fersuastudio.com$request_uri;` and reload nginx.

**Verification checklist**
- `curl -sI http://fersuastudio.com` gives 301 to https.
- `https://www.fersuastudio.com` gives 301 to the apex.
- `https://fersuastudio.com/` returns 200 with HSTS and without `X-Robots-Tag`.
- `/MacflyMikebran` gives 301 to `/macfly-mike-bran`, and `/Eventos/MacflyMikeBran/14%20Nov.html` gives 301 as well.
- `/api/health` shows the expected version.
- Login and cookies work.
- A password-reset email arrives with an apex link, and its headers show SPF, DKIM and DMARC passing.
- A booking is saved and WhatsApp opens.
- The WhatsApp link preview is correct.
- `dig MX fersuastudio.com` is unchanged, and sending and receiving mail with the owner's mailbox still works.
- Test from mobile data, which uses a different DNS resolver.
- If AAAA was kept: `curl -6 -sI https://fersuastudio.com`.
- SSL Labs grade A, and securityheaders.com.
- Google Search Console: add the property and submit `https://fersuastudio.com/sitemap.xml`.

**DNS rollback:** point A back to `195.179.239.107` and restore the AAAA record. The old `public_html` is still intact, and with TTL 300 the switch takes about 5 minutes.

**T+48 h:** raise the TTLs back to 3600–14400. Do not delete `public_html` for 2–4 weeks. Do not cancel the Hostinger hosting plan until you confirm the mailbox does not depend on it.

**Email authentication (`docs/07`)**
- All mail is relayed through authenticated Hostinger SMTP (`smtp.hostinger.com:465`, SSL) as `no-reply@fersuastudio.com`. There is no MTA on the VPS, so SPF does not need the VPS IP.
- **SPF:** a single TXT on the apex, `v=spf1 include:_spf.mail.hostinger.com ~all`. Merge it if another sender is ever added.
- **DKIM:** the records hPanel → Emails lists (usually `hostingermail-a/b/c._domainkey` CNAMEs) must show as verified.
- **DMARC:** add TXT `_dmarc` = `v=DMARC1; p=none; rua=mailto:<owner mailbox>; fo=1`. After 2–4 weeks of passing reports, move to `p=quarantine`.
- The From address equals the authenticated mailbox, so DKIM is aligned.
- Send HTML plus a plain-text part, and use no link shorteners.
- Test with mail-tester.com (aim for 9 or more) and with Gmail's "Show original".
- Check the Hostinger daily sending limit for the plan.
- Test connectivity from the VPS with `nc -vz smtp.hostinger.com 465`.

## 9. CI (`.github/workflows/ci.yml`)

Triggers: push to main and every pull request. `permissions: contents: read`, and `concurrency` cancels older runs.

- **`build-test`** (ubuntu, with a `mysql:8.4` service container healthchecked by `mysqladmin ping`):
  1. `setup-node` using `.nvmrc`, with npm cache, then `npm ci`.
  2. Build shared: `npm run build -w @fersua-djs/shared`.
  3. `npm run lint --workspaces --if-present` and `npm run typecheck --workspaces --if-present`.
  4. `npm exec -w api -- prisma validate`.
  5. Migration drift check: `npm exec -w api -- prisma migrate diff --from-migrations prisma/migrations --to-schema-datamodel prisma/schema.prisma --shadow-database-url $SHADOW_URL --exit-code`. Exit code 2 means the schema changed without a migration, and the job fails.
  6. `prisma migrate deploy`, then `npm test -w api -- --ci`.
  7. `npm run test:e2e -w api`: auth, username login, single admin, one DJ per user, slug and reserved words, booking validation against the DJ's config, upload magic bytes, throttling.
  8. `npm test -w web --if-present`, then `npm run build -w api` and `npm run build -w web`.
- **`security`:**
  - `npm ci`, then `npm audit --omit=dev --audit-level=high`, which fails the job.
  - Full `npm audit --audit-level=critical` as information only.
  - `gitleaks/gitleaks-action@v2` with `fetch-depth: 0`. This matters because secrets must never be committed.
- **`docker`** (runs after `build-test`):
  - `docker/setup-buildx-action` and `docker/build-push-action` for `target: api` and `target: edge`, with `push: false`, `load: true` and `cache-from/to: type=gha`.
  - `aquasecurity/trivy-action` on both images, severities HIGH and CRITICAL, `ignore-unfixed`. Start with `exit-code 0`, tighten to 1 later.
- **`dependabot.yml`:** weekly updates for npm (root, grouped nestjs / react+antd / prisma), docker (`/`) and github-actions.
- **Phase 2 (optional):** a CD job pushes `ghcr.io/theoclas/fersua-djs-{api,edge}:<sha>`. The VPS then pulls instead of building, which removes the build-memory spike on the 1 vCPU box. That needs a `read:packages` token on the VPS and swapping `build:` for `pull` in `deploy.sh`.

## 10. Monitoring

- **Health endpoints:**
  - `GET /api/health` is the liveness check, returning `{status:"ok",version}` with no throttle.
  - `GET /api/health/ready` runs `SELECT 1`, checks that the uploads folder is writable, and returns ok or fail with no details.
  - The edge answers `/healthz`.
  - Docker healthchecks plus `restart: unless-stopped` handle process crashes.
- **Uptime:** UptimeRobot (free, 5-minute checks) on `https://beta.fersuastudio.com/api/health`, and later the apex. Add a keyword check on `/macfly-mike-bran`. Alerts by email or Telegram. Use an external service: Uptime Kuma on the same VPS cannot report the VPS itself being down.
- **Backups:** healthchecks.io ping as described in section 7.
- **Logs:**
  - api: structured JSON (nestjs-pino) with a request id that matches the edge's `$request_id`. It redacts `authorization`, `cookie`, `password*` and `token*`.
  - Commands: `docker compose logs -f --since 1h api edge`, and host logs at `/var/log/nginx/fersua-djs.*.log` (rotated by Ubuntu's logrotate).
  - Container logs are capped by json-file rotation at 10 MB × 5 per service.
- **`scripts/status.sh`** prints:
  - container health (`docker compose ps`) and restart counts (`docker inspect -f '{{.RestartCount}}'`);
  - `docker stats --no-stream`, `df -h /`, `docker system df`;
  - the age of the last backup;
  - the certificate expiry date (`openssl s_client … | openssl x509 -noout -enddate`);
  - the deployed version.
- **Optional:** Sentry free tier for api and web (the CSP needs the ingest domain added), and a fail2ban jail on the nginx error log for repeated 429s.
- **Side note, out of scope:** HabitFer's Caddy (8080) and Wandy (3085/8085) are published on all interfaces. Rebinding them to `127.0.0.1` would close that exposure.

## 11. Open questions for the owner

1. Does the VPS have IPv6 (`ip -6 addr show scope global`)? This decides whether AAAA gets the VPS IPv6 or is deleted.
2. Is the proposed slug `macfly-mike-bran` and the seed username `macflymikebran` OK?
3. Where should off-server backups go: Google Drive via rclone, or Backblaze B2?
4. Is the email service independent of the shared hosting plan? (Do not cancel the plan otherwise.)
5. What happens to Allset, DiannMakinne and Molly: a Hostinger subdomain such as `old.`/`allset.` with redirects from the edge, or a plain 404?
6. Build on the VPS (simple, needs swap) or in GitHub Actions pushed to GHCR (lighter on the VPS)?
7. Alert channel for UptimeRobot and healthchecks.io: email or Telegram?
8. Enable Cloudflare Turnstile on registration and the booking form?

### Critical Files for Implementation
- C:\Fernando\Desarrollo\hostinger\fersua-djs\docker-compose.prod.yml
- C:\Fernando\Desarrollo\hostinger\fersua-djs\Dockerfile
- C:\Fernando\Desarrollo\hostinger\fersua-djs\deploy\edge\default.conf (plus deploy\edge\nginx.conf and its snippets)
- C:\Fernando\Desarrollo\hostinger\fersua-djs\scripts\deploy.sh (plus scripts\backup.sh and scripts\restore.sh)
- C:\Fernando\Desarrollo\hostinger\fersua-djs\.env.prod.example

References read: `C:\Fernando\Desarrollo\Personal\FersuaStore\HabitFer\docker-compose.prod.yml`, `HabitFer\api\Dockerfile`, `HabitFer\api\docker-entrypoint.sh`, `HabitFer\api\src\main.ts`, `HabitFer\docs\deploy-vps.md`, `C:\Fernando\Desarrollo\Personal\FersuaStore\Dashboard\docs\07-seguridad-infra.md`, `Dashboard\docker-compose.yml`, `Dashboard\scripts\restore-mysql.sh`, `C:\Fernando\Desarrollo\hostinger\public_html\MacflyMikebran.html`, `public_html\.htaccess`, `public_html\index.html`, `public_html\Eventos\MacflyMikeBran\*`.