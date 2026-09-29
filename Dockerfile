# syntax=docker/dockerfile:1.7
#
# Un solo Dockerfile con dos imágenes finales:
#   --target api   -> NestJS (node:22-alpine, usuario node)
#   --target edge  -> nginx sin root con la SPA compilada
# Ambas salen del mismo web-build, así el index.html que usa el api como plantilla del
# shell SEO siempre coincide con los JS/CSS con hash que sirve el edge.
#
# En el VPS se compila por etapas (scripts/deploy.sh): web-build, api-build, api y edge,
# una detrás de otra, para no tener vite y nest a la vez en 1 vCPU / 2 GB.

ARG NODE_IMAGE=node:22-alpine

# ---------------------------------------------------------------------------
# deps: npm ci de todo el workspace con el único lockfile
# ---------------------------------------------------------------------------
FROM ${NODE_IMAGE} AS deps
# Con esta etiqueta deploy.sh limpia solo imágenes de este proyecto (el VPS tiene otras apps).
LABEL fersua.project="fersua-booking"
WORKDIR /repo
# openssl antes de npm ci: Prisma detecta la versión al instalar sus motores.
RUN apk add --no-cache openssl
COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/
COPY api/package.json api/
COPY web/package.json web/
# Nunca --ignore-scripts: Prisma baja su motor en un script de instalación.
RUN --mount=type=cache,target=/root/.npm npm ci --no-audit --no-fund

# ---------------------------------------------------------------------------
# shared: @fersua/shared compilado (dist CJS + ESM)
# ---------------------------------------------------------------------------
FROM deps AS shared
COPY packages/shared packages/shared
RUN find packages/shared -maxdepth 2 -name '*.tsbuildinfo' -delete \
  && npm run build -w @fersua/shared

# ---------------------------------------------------------------------------
# web-build: SPA con Vite
# ---------------------------------------------------------------------------
FROM shared AS web-build
ENV NODE_OPTIONS=--max-old-space-size=768
COPY web web
RUN find web -maxdepth 2 -name '*.tsbuildinfo' -delete \
  && npm run build -w web \
  && test -f web/dist/index.html

# ---------------------------------------------------------------------------
# api-build: cliente Prisma + nest build
# ---------------------------------------------------------------------------
FROM shared AS api-build
ENV NODE_OPTIONS=--max-old-space-size=768
COPY api api
# Un *.tsbuildinfo copiado del PC hace creer a tsc que dist/ ya está al día y no emite nada.
# seed-assets puede no existir todavía; la carpeta vacía deja que el COPY final no falle.
RUN find api -maxdepth 2 -name '*.tsbuildinfo' -delete \
  && mkdir -p api/seed-assets \
  && npm exec -w api -- prisma generate \
  && npm run build -w api \
  && test -f api/dist/main.js

# ---------------------------------------------------------------------------
# api-deps: solo dependencias de producción del api (y shared)
# ---------------------------------------------------------------------------
FROM ${NODE_IMAGE} AS api-deps
LABEL fersua.project="fersua-booking"
WORKDIR /repo
RUN apk add --no-cache openssl
COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/
COPY api/package.json api/
COPY web/package.json web/
RUN --mount=type=cache,target=/root/.npm npm ci --omit=dev -w api -w @fersua/shared --no-audit --no-fund
COPY api/prisma api/prisma
# Lo que npm no pudo subir a la raíz (p. ej. sharp) queda en api/node_modules: se copia
# también. mkdir -p para que el COPY no falle si un día queda vacío.
RUN mkdir -p api/node_modules && npm exec -w api -- prisma generate

# ---------------------------------------------------------------------------
# api: imagen final del backend
# ---------------------------------------------------------------------------
FROM ${NODE_IMAGE} AS api
ENV NODE_ENV=production \
    PORT=3000 \
    UPLOAD_DIR=/data/media \
    SHELL_TEMPLATE=/app/web/index.html \
    CHECKPOINT_DISABLE=1 \
    PRISMA_HIDE_UPDATE_MESSAGE=1 \
    PATH=/app/api/node_modules/.bin:/app/node_modules/.bin:$PATH
# El volumen nuevo copia dueño y contenido de esta carpeta: así node puede escribir y
# public/ existe antes de que el edge la monte con subpath.
RUN apk add --no-cache openssl \
  && mkdir -p /data/media/public /data/media/private \
  && chown -R node:node /data/media
WORKDIR /app
COPY --from=api-deps  /repo/package.json               ./package.json
COPY --from=api-deps  /repo/node_modules               ./node_modules
COPY --from=api-deps  /repo/api/node_modules           ./api/node_modules
COPY --from=shared    /repo/packages/shared/package.json ./packages/shared/package.json
COPY --from=shared    /repo/packages/shared/dist       ./packages/shared/dist
COPY --from=api-build /repo/api/package.json           ./api/package.json
COPY --from=api-build /repo/api/dist                   ./api/dist
COPY --from=api-build /repo/api/prisma                 ./api/prisma
COPY --from=api-build /repo/api/seed-assets            ./api/seed-assets
COPY --from=web-build /repo/web/dist/index.html        ./web/index.html
WORKDIR /app/api
# Falla el build si falta el binario musl de sharp, shared no resuelve o no está el CLI de Prisma.
RUN node -e "require('sharp')" \
  && node -e "require('@fersua/shared')" \
  && prisma --version >/dev/null
# La versión va al final para no invalidar la caché de las capas de arriba.
ARG APP_VERSION=dev
ENV APP_VERSION=${APP_VERSION}
LABEL fersua.project="fersua-booking" \
      org.opencontainers.image.title="fersua-booking-api" \
      org.opencontainers.image.revision="${APP_VERSION}"
USER node
EXPOSE 3000
CMD ["node", "dist/main.js"]

# ---------------------------------------------------------------------------
# edge: nginx sin root (uid 101, puerto 8080) con la SPA y la config del repo
# ---------------------------------------------------------------------------
FROM nginxinc/nginx-unprivileged:stable-alpine AS edge
COPY deploy/edge/nginx.conf   /etc/nginx/nginx.conf
# Reemplaza el default.conf de la imagen: si no, ese server sería el default y atraparía el tráfico.
COPY deploy/edge/default.conf /etc/nginx/conf.d/default.conf
COPY deploy/edge/snippets/    /etc/nginx/snippets/
COPY --from=web-build /repo/web/dist /usr/share/nginx/html
ARG APP_VERSION=dev
LABEL fersua.project="fersua-booking" \
      org.opencontainers.image.title="fersua-booking-edge" \
      org.opencontainers.image.revision="${APP_VERSION}"
EXPOSE 8080
