# Estado del proyecto y cómo continuar

> Documento de continuación. Léelo primero al retomar (persona o Claude).
> Última actualización: 2026-09-28 (noche).

## Qué es
Plataforma de booking de DJs de **Fersua Studio**: cada DJ (o dúo) arma su página con la plantilla de
Mac Fly & Mike Bran, recibe solicitudes y las gestiona. Un único admin (Fernando) aprueba y administra.
El plan aprobado, con todas las decisiones, está en `docs/00-plan.md`: **manda sobre todo lo demás**.
Los diseños detallados están en `docs/diseno/01…11`.

- **Repo:** https://github.com/theoclas/Presskit (rama `main`).
- **Carpeta local:** `C:\Fernando\Desarrollo\hostinger\fersuastudio-booking`.
- **Sitio viejo, solo lectura, fuente de la semilla:** `C:\Fernando\Desarrollo\hostinger\public_html`.
- **VPS:** `ssh -i ~/.ssh/fersua_vps_ed25519 deploy@177.7.40.130`. Ubuntu 24.04, 1 vCPU, 3,8 GB.
  - Ya corren Dashboard, HabitFer y Wandy: no tocarlos.
  - nginx del host tiene certbot.
  - `deploy` no tiene sudo.

## Decisiones clave (resumen)
- **Stack:** NestJS 11 + Prisma 6.19 + MySQL 8.4 en el api; React 19 + Vite 7 en la web; npm workspaces con `packages/shared` (`@fersua/shared`).
- **Cuentas:**
  - Login con usuario + contraseña (JWT de 15 min en memoria, refresh en la cookie `__Host-rt`).
  - Registro abierto, pero el admin aprueba cada perfil.
  - 1 usuario = 1 cuenta DJ.
  - Un solo admin: usuario `Fersua`, 12+ caracteres, 2FA TOTP. Se crea con una CLI interactiva en el VPS; nunca va en `.env`.
- **Formulario:** catálogo fijo de campos. Cada solicitud se guarda y luego abre WhatsApp.
- **Diseño:** plantilla fija + 8 paletas.
- **Imágenes:** WebP con sharp en un volumen Docker.
- **URL:** `fersuastudio.com/<slug>`. Primero se lanza en `booking.fersuastudio.com` y después se cambia el DNS del dominio principal.
- **Semilla:** solo Mac Fly & Mike Bran, sin dueño, slug `macfly-mike-bran`. Allset queda fuera.
- **Build:** en el VPS, con 2 GB de swap.
- **Cambios de un DJ aprobado:** salen al instante (auditados).
- **Legal breve (Colombia):** `/privacidad`, `/terminos`, `/terminos-artistas`, `/pqrs`, `/reportar` y pie legal. El registro privado del art. 53 (portal de contacto) es obligatorio antes de aprobar un perfil. Marcadores `[NOMBRE] [NIT/CC] [DIRECCIÓN] [CORREO]` por completar.

## Hitos
| Hito | Estado |
|---|---|
| **M0** Fundaciones | ✅ Hecho y subido (commit `7a3c321`) |
| **M1** Sitio público + semilla Mac Fly + legal + infraestructura | 🟡 En construcción (ver abajo) |
| **M2** Auth + admin (2FA, editar perfiles, tickets, auditoría) | ⏳ Pendiente |
| **M3** Registro y autoservicio de DJs (correo, panel, media privada) | ⏳ Pendiente |
| **M4** Endurecimiento + cambio de DNS del dominio principal | ⏳ Pendiente |

### M0 (hecho)
- `packages/shared`: límites, catálogos y validadores, con 29 pruebas.
- `api`: esquema Prisma (18 tablas) + migración `init`, configuración validada, filtro de errores, guard de origen, throttler por IP real, auditoría y health.
- `docker-compose.yml` de desarrollo.

### M1 (en curso al pausar)
Se lanzó un workflow de agentes: construir en paralelo → integrar → revisar → corregir.
Estado de la etapa de construcción al pausar:

| Área | Estado |
|---|---|
| API de medios, CLI y semilla | ✅ Terminado |
| API pública, SEO, formulario y tickets | ✅ Terminado |
| Textos legales | ✅ Terminado |
| Web pública | 🟡 Corriendo |
| Infraestructura, CI y guías | 🟡 Corriendo |

Luego vienen la integración de punta a punta (incluye el stack Docker de producción local en 127.0.0.1:8090), las revisiones de seguridad y fidelidad visual, y las correcciones.

**Nada de M1 está commiteado todavía:** los archivos están en disco en la carpeta local (`git status`).

## Cómo retomar
1. Abre la carpeta y revisa `git status` para ver qué dejó escrito M1.
2. Si la **misma sesión** de Claude sigue abierta, el workflow pudo haber terminado solo. Hay que leer su resultado.
   - Si se cortó, se reanuda con `resumeFromRunId: wf_6cc5bf46-486`: los agentes ya terminados no se repiten.
3. Si es una **sesión nueva**, pídele a Claude:
   *"Lee docs/ESTADO.md y docs/00-plan.md del proyecto fersuastudio-booking y continúa con M1: integra lo que quedó en disco, compila, prueba y corrige."*
4. Para desarrollo local:
   ```bash
   docker compose up -d            # MySQL 127.0.0.1:3309 (root/devroot) + mailpit 8025
   npm install && npm run build:shared
   npm run build -w api && npm run cli -w api -- seed:genres && npm run cli -w api -- seed:macfly
   npm run dev:api                 # http://localhost:4100/api/health
   npm run dev:web                 # http://localhost:5180
   ```
5. Al cerrar M1: verificar en el navegador, commitear y subir, y seguir `docs/02-primer-despliegue.md` para publicar en `booking.fersuastudio.com`.

## Pendientes de Fernando (no frenan el desarrollo)
- Datos del responsable para la política de privacidad: nombre o razón social, NIT o cédula, dirección y correo. Van en `web/src/public/legal/operator.ts` y `docs/legal/`.
- Fechas actuales de Mac Fly & Mike Bran: todas las del sitio viejo ya pasaron.
- **hPanel:** registro A `booking` → 177.7.40.130 y crear el buzón `no-reply@fersuastudio.com`.
- **VPS con sudo:** 2 GB de swap, vhost de nginx y certbot. Los comandos están en `docs/02-primer-despliegue.md`.
- **GitHub:** agregar la deploy key de solo lectura del VPS al repo Presskit.
