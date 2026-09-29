# Fersua Studio — Booking de DJs

Plataforma donde cada DJ (o dúo) arma su página de booking con la plantilla de Mac Fly & Mike Bran,
recibe solicitudes y las gestiona. Un único administrador aprueba y administra todas las cuentas.

- **api/** — NestJS 11 + Prisma 6 + MySQL 8.4
- **web/** — React 19 + Vite (página pública con CSS propio; panel y admin con Ant Design)
- **packages/shared/** — límites, catálogos y validadores que usan api y web (`@fersua/shared`)
- **deploy/**, **scripts/** — Docker, nginx, respaldos y despliegue en el VPS
- **docs/** — plan, contrato y guías (`docs/00-plan.md` manda sobre cualquier otro documento)

## Arranque local

```bash
npm install
docker compose up -d            # MySQL 127.0.0.1:3309 + mailpit 127.0.0.1:8025
cp api/.env.example api/.env
npm run build:shared
npm exec -w api -- prisma migrate dev
npm run dev:api                 # http://localhost:4100/api/health
npm run dev:web                 # http://localhost:5180
```

Más detalle en `docs/01-desarrollo-local.md`.
