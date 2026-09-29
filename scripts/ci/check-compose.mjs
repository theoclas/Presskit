#!/usr/bin/env node
// Lint de despliegue (CI y local): npm run ci:compose
//
// 1. docker-compose.prod.yml: solo el edge publica puertos y solo en 127.0.0.1; ningún
//    servicio usa network_mode host ni privileged; api y edge con read_only y cap_drop.
// 2. Ninguna variable ADMIN_* (salvo ADMIN_NOTIFY_EMAIL) en compose ni en .env.prod.example.
// 3. Las piezas acopladas de la IP real coinciden: subred del edge en compose, TRUST_PROXY
//    del api y set_real_ip_from del edge.
// 4. deploy/edge/default.conf: se emula la selección de location de nginx y se comprueba que
//    las rutas de API_ROUTES (@fersua/shared) caen en el location con el límite correcto.
// 5. Scripts .sh con LF, y el init de MySQL con bit de ejecución en git.
//
// Sin dependencias: el compose se lee con un parser mínimo por indentación (el archivo lo
// mantenemos nosotros y usa YAML simple).

import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (rel) => readFileSync(resolve(root, rel), 'utf8').replace(/\r\n/g, '\n');

const errors = [];
const fail = (msg) => errors.push(msg);
let checks = 0;
const check = (cond, msg) => {
  checks += 1;
  if (!cond) fail(msg);
};

// ---------------------------------------------------------------------------- compose
const composeText = read('docker-compose.prod.yml');
const lines = composeText.split('\n');
const stripComment = (l) => l.replace(/(^|\s)#.*$/, '');
const indentOf = (l) => l.match(/^ */)[0].length;
const unquote = (s) => s.trim().replace(/^["']|["']$/g, '');

/** services -> { name: { key: [lineas del bloque] } } a partir de la indentación. */
function parseServices() {
  const services = {};
  let inServices = false;
  let current = null;
  let currentKey = null;
  for (const raw of lines) {
    const line = stripComment(raw);
    if (!line.trim()) continue;
    const ind = indentOf(line);
    if (ind === 0) {
      inServices = /^services:\s*$/.test(line);
      current = null;
      continue;
    }
    if (!inServices) continue;
    if (ind === 2) {
      const m = line.match(/^ {2}([A-Za-z0-9_.-]+):\s*$/);
      current = m ? m[1] : null;
      if (current) services[current] = {};
      currentKey = null;
      continue;
    }
    if (!current) continue;
    if (ind === 4) {
      const m = line.match(/^ {4}([A-Za-z0-9_.-]+):\s*(.*)$/);
      if (m) {
        currentKey = m[1];
        services[current][currentKey] = m[2] ? [m[2]] : [];
      }
      continue;
    }
    if (currentKey) services[current][currentKey].push(line.trim());
  }
  return services;
}

const services = parseServices();
const names = Object.keys(services);
check(names.includes('edge') && names.includes('api') && names.includes('db'), `servicios inesperados: ${names.join(', ')}`);

/** Lista de valores de un bloque: inline [a, b] o ítems "- a". */
function listValues(block = []) {
  const out = [];
  for (const item of block) {
    const inline = item.match(/^\[(.*)\]$/);
    if (inline) {
      out.push(...inline[1].split(',').map(unquote).filter(Boolean));
    } else if (item.startsWith('-')) {
      out.push(unquote(item.slice(1)));
    } else {
      out.push(unquote(item));
    }
  }
  return out;
}

for (const name of names) {
  const svc = services[name];
  const ports = listValues(svc.ports);
  if (name === 'edge') {
    check(ports.length === 1, `edge debe publicar exactamente un puerto (tiene ${ports.length})`);
    for (const p of ports) {
      check(/^127\.0\.0\.1:/.test(p), `edge publica "${p}": debe ser 127.0.0.1:<puerto>:8080`);
    }
  } else {
    check(ports.length === 0 && !('ports' in svc), `el servicio ${name} publica puertos; solo el edge puede`);
  }
  check(!('network_mode' in svc), `${name} usa network_mode (prohibido: se saltaría las redes)`);
  check(!(svc.privileged ?? []).some((v) => /true/.test(v)), `${name} es privileged`);
}

for (const name of ['api', 'edge']) {
  const svc = services[name] ?? {};
  check((svc.read_only ?? []).join(' ').includes('true'), `${name} debe tener read_only: true`);
  check(listValues(svc.cap_drop).includes('ALL'), `${name} debe tener cap_drop: [ALL]`);
  check(listValues(svc.security_opt).some((v) => v.startsWith('no-new-privileges')), `${name} debe tener no-new-privileges`);
}
check(!(services.migrate?.read_only ?? []).join(' ').includes('true'), 'migrate NO debe ser read_only (Prisma escribe temporales)');

// Sección networks de primer nivel (hay un servicio que también se llama edge).
const networksText = composeText.slice(composeText.search(/^networks:\s*$/m));
check(/^networks:/.test(networksText), 'falta la sección networks de primer nivel');

// La red backend no sale a internet.
check(/\n {2}backend:\n(?: {4}#.*\n)* {4}internal: true/.test(networksText), 'la red backend debe ser internal: true');

// ---------------------------------------------------------------------------- ADMIN_*
const adminIn = (text) =>
  [...new Set(text.split('\n').map(stripComment).join('\n').match(/\bADMIN_[A-Z0-9_]*/g) ?? [])].filter(
    (k) => k !== 'ADMIN_NOTIFY_EMAIL',
  );
check(adminIn(composeText).length === 0, `docker-compose.prod.yml tiene variables ADMIN_*: ${adminIn(composeText).join(', ')}`);
const envExample = read('.env.prod.example');
check(adminIn(envExample).length === 0, `.env.prod.example tiene variables ADMIN_*: ${adminIn(envExample).join(', ')}`);

// ---------------------------------------------------------------------------- IP real
const edgeNet = networksText.match(/\n {2}edge:\n(?: {4,}.*\n)*? {8,}- subnet:\s*([0-9./]+)\s*\n\s*gateway:\s*([0-9.]+)/);
check(edgeNet, 'no encontré la subred fija de la red edge');
const nginxConf = read('deploy/edge/nginx.conf');
const defaultConf = read('deploy/edge/default.conf');
if (edgeNet) {
  const [, subnet, gateway] = edgeNet;
  const trust = composeText.match(/TRUST_PROXY:\s*"?([^"\n]+)"?/);
  check(trust && trust[1].trim() === subnet, `TRUST_PROXY del api (${trust?.[1]}) debe ser la subred del edge (${subnet})`);
  check(
    new RegExp(`set_real_ip_from\\s+${gateway.replace(/\./g, '\\.')};`).test(nginxConf),
    `nginx.conf debe confiar solo en el gateway del edge: set_real_ip_from ${gateway};`,
  );
}
const realIpFrom = [...nginxConf.matchAll(/set_real_ip_from\s+([^;]+);/g)].map((m) => m[1]);
check(realIpFrom.length === 1, `set_real_ip_from debe aparecer una sola vez (hay: ${realIpFrom.join(', ')})`);
check(/real_ip_header\s+X-Real-IP;/.test(nginxConf), 'real_ip_header debe ser X-Real-IP');
check(/absolute_redirect\s+off;/.test(defaultConf), 'default.conf debe tener absolute_redirect off');

// ---------------------------------------------------------------------------- edge locations
/** Extrae los location del server con su cuerpo (respeta llaves dentro de comillas). */
function parseLocations(text) {
  const locs = [];
  const re = /location\s+(?:(=|~\*|~|\^~)\s+)?("(?:[^"\\]|\\.)*"|[^\s{]+)\s*\{/g;
  let m;
  while ((m = re.exec(text))) {
    let depth = 1;
    let i = re.lastIndex;
    let quote = null;
    for (; i < text.length && depth > 0; i++) {
      const ch = text[i];
      if (quote) {
        if (ch === '\\') i++;
        else if (ch === quote) quote = null;
      } else if (ch === '"' || ch === "'") quote = ch;
      else if (ch === '{') depth++;
      else if (ch === '}') depth--;
    }
    locs.push({ mod: m[1] ?? '', pattern: m[2].replace(/^"|"$/g, ''), body: text.slice(re.lastIndex, i - 1) });
    re.lastIndex = i;
  }
  return locs;
}

const locations = parseLocations(defaultConf.replace(/^\s*#.*$/gm, ''));

/** Selección de location como nginx: exacto, prefijo más largo (^~ corta), regex en orden. */
function selectLocation(uri) {
  const exact = locations.find((l) => l.mod === '=' && l.pattern === uri);
  if (exact) return exact;
  const prefixes = locations
    .filter((l) => (l.mod === '' || l.mod === '^~') && !l.pattern.startsWith('@') && uri.startsWith(l.pattern))
    .sort((a, b) => b.pattern.length - a.pattern.length);
  const best = prefixes[0];
  if (best?.mod === '^~') return best;
  for (const l of locations) {
    if (l.mod === '~' || l.mod === '~*') {
      if (new RegExp(l.pattern, l.mod === '~*' ? 'i' : '').test(uri)) return l;
    }
  }
  return best ?? null;
}

async function loadApiRoutes() {
  const dist = resolve(root, 'packages/shared/dist/index.js');
  if (!existsSync(dist)) {
    fail('packages/shared/dist no existe: corre antes `npm run build:shared`');
    return null;
  }
  const mod = await import(pathToFileURL(dist).href);
  return mod.API_ROUTES;
}

const R = await loadApiRoutes();
if (R) {
  const expectations = [
    // [uri, texto que debe estar en el location elegido, descripción]
    [R.bookingRequests('abc'), 'zone=forms', 'booking-requests con límite forms'],
    [R.bookingRequests('macfly-mike-bran'), 'zone=forms', 'booking-requests (slug con guiones)'],
    [R.bookingRequests('abc'), 'proxy-api-public.conf', 'booking-requests sin cookies'],
    [R.authLogin, 'zone=auth', 'login con límite auth'],
    [R.authMfa, 'zone=auth', 'mfa (código TOTP) con límite auth'],
    [R.authStepUp, 'zone=auth', 'step-up (contraseña + TOTP) con límite auth'],
    [R.authChangePassword, 'zone=auth', 'change-password con límite auth'],
    [`${R.authMfa.toUpperCase()}/`, 'zone=auth', 'mfa en mayúsculas y con barra'],
    [R.authRegister, 'zone=auth', 'registro con límite auth'],
    [R.authForgot, 'zone=auth', 'forgot-password con límite auth'],
    [R.authReset, 'zone=auth', 'reset-password con límite auth'],
    [R.tickets, 'zone=tickets', 'tickets con límite tickets'],
    // Express no distingue mayúsculas ni la barra final: esas variantes tampoco se escapan.
    [`${R.authLogin}/`, 'zone=auth', 'login con barra final'],
    [R.authLogin.replace('login', 'LOGIN'), 'zone=auth', 'login en mayúsculas'],
    [R.bookingRequests('ABC'), 'zone=forms', 'booking-requests con slug en mayúsculas'],
    [`${R.bookingRequests('abc')}/`, 'zone=forms', 'booking-requests con barra final'],
    [`${R.tickets}/`, 'zone=tickets', 'tickets con barra final'],
    [R.bookingToken('abc'), 'proxy-api-public.conf', 'booking-token sin cookies'],
    [R.publicDjs, 'proxy-api-public.conf', 'public/djs sin cookies'],
    [R.publicDj('abc'), 'proxy-api-public.conf', 'public/djs/:slug sin cookies'],
    [R.publicGenres, 'proxy-api-public.conf', 'public/genres sin cookies'],
    [R.health, 'proxy-api.conf', '/api/health al api'],
    ['/api/health/ready', 'return 404', '/api/health/ready no se expone'],
    ['/api/HEALTH/ready/', 'return 404', '/api/health/ready en mayúsculas y con barra'],
    ['/api/me/profile/media', 'client_max_body_size 11m', 'subida de imágenes del DJ con 11m'],
    ['/api/admin/profiles/ckabc123/media', 'client_max_body_size 11m', 'subida de imágenes del admin con 11m'],
    ['/api/auth/refresh', 'client_max_body_size 128k', 'el resto del api con cuerpo pequeño'],
    ['/', '/api/public/shell', '/ al shell del api'],
    ['/macfly-mike-bran', '@shell', '/<slug> al shell'],
    ['/MacflyMikebran.html', '@shell', '/<Slug>.html al shell (301 del api)'],
    ['/Eventos/MacflyMikeBran/14 Nov.html', 'return 301 /macfly-mike-bran#fechas', 'fechas del sitio viejo'],
    ['/default.php', 'return 301 /', '/default.php'],
    ['/media/abc123/k9x/480.webp', 'root /srv', 'medios webp desde /srv'],
    ['/media/abc123/k9x/og.jpg', 'root /srv', 'imagen OG'],
    ['/media/abc123/k9x/shell.php', 'return 404', 'medios que no son imagen -> 404'],
    ['/.env', 'return 404', 'archivos ocultos -> 404'],
    ['/panel/perfil', 'try_files $uri /index.html', 'rutas de la SPA'],
    ['/sitemap.xml', '/api/public/sitemap.xml', 'sitemap al api'],
    ['/robots.txt', '/api/public/robots.txt', 'robots al api'],
  ];
  for (const [uri, needle, desc] of expectations) {
    const loc = selectLocation(uri);
    check(loc && loc.body.includes(needle), `${desc}: "${uri}" cae en location ${loc ? `${loc.mod} ${loc.pattern}` : '(ninguno)'} sin "${needle}"`);
  }
  // Las rutas de sesión leen o fijan la cookie de refresh: nunca deben caer en un location
  // que la borra (proxy-api-public.conf). Sin cookie, logout no revocaría nada y mfa o
  // change-password no podrían abrir la sesión.
  for (const uri of [R.authRefresh, R.authLogout, R.authLogin, R.authMfa, R.authChangePassword, R.authStepUp]) {
    const loc = selectLocation(uri);
    check(
      loc && loc.body.includes('proxy-api.conf') && !loc.body.includes('proxy-api-public.conf'),
      `${uri} no debe borrar la cookie (cae en ${loc ? `${loc.mod} ${loc.pattern}` : '(ninguno)'})`,
    );
  }
}

// Todo location que sirve contenido incluye las cabeceras de seguridad (add_header no se hereda).
for (const loc of locations) {
  const servesContent = /proxy-api|try_files|return 4\d\d '/.test(loc.body) && !/root \/srv/.test(loc.body);
  const isPlainReturn = /^\s*(access_log off;\s*)?return \d+/.test(loc.body.trim()) || loc.pattern === '/healthz';
  if (servesContent && !isPlainReturn) {
    check(loc.body.includes('security-headers.conf'), `location ${loc.mod} ${loc.pattern} no incluye security-headers.conf`);
  }
}

// ---------------------------------------------------------------------------- scripts .sh
// Con CRLF, bash y el entrypoint de MySQL fallan con errores raros ($'\r': command not found).
const shellScripts = [
  'deploy/mysql/init/01-app-user.sh',
  ...readdirSync(resolve(root, 'scripts'))
    .filter((f) => f.endsWith('.sh'))
    .map((f) => `scripts/${f}`),
];
for (const rel of shellScripts) {
  check(!readFileSync(resolve(root, rel), 'utf8').includes('\r'), `${rel} tiene fin de línea CRLF (debe ser LF)`);
}

// Sin bit de ejecución el entrypoint de MySQL carga el script con `source` en vez de
// ejecutarlo (docs/02 §B). Solo se revisa si git ya lo conoce.
let stagedInit = '';
try {
  stagedInit = execFileSync('git', ['ls-files', '-s', '--', 'deploy/mysql/init/01-app-user.sh'], {
    cwd: root,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
  }).trim();
} catch {
  // Sin git (p. ej. un tarball): no hay índice que revisar.
}
if (stagedInit) {
  check(
    stagedInit.startsWith('100755'),
    'deploy/mysql/init/01-app-user.sh sin bit de ejecución en git: git update-index --chmod=+x deploy/mysql/init/01-app-user.sh',
  );
}

// ---------------------------------------------------------------------------- resultado
if (errors.length) {
  console.error(`check-compose: ${errors.length} problema(s):`);
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}
console.log(`check-compose: OK (${checks} comprobaciones)`);
