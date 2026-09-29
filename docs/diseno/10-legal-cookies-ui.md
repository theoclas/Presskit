## Informe: aviso de cookies, UI legal y referencias visuales para Fersua Studio

**Fuentes y límites.** Los textos de ley se tomaron de Función Pública. Secretaría del Senado rechazó la conexión (ECONNREFUSED). sic.gov.co da error de certificado; lo leí con `curl -k`, sin crear archivos.
- **Ley 1581/2012:** https://www.funcionpublica.gov.co/eva/gestornormativo/norma.php?i=49981
- **Decreto 1377/2013:** https://www.funcionpublica.gov.co/eva/gestornormativo/norma.php?i=53646
- **Ley 1480/2011:** https://www.funcionpublica.gov.co/eva/gestornormativo/norma.php?i=44306

---

### 1. Conclusión legal: aviso de cookies con solo cookies esenciales

**Qué está verificado en fuente primaria**
- **Ley 1581 art. 3:**
  - lit. a: "Autorización: Consentimiento previo, expreso e informado".
  - lit. c: dato personal es "cualquier información vinculada o que pueda asociarse a una o varias personas naturales".
  - lit. g: "Tratamiento" incluye recolección y almacenamiento.
- **Ley 1581 art. 9:** exige autorización previa e informada, "obtenida por cualquier medio que pueda ser objeto de consulta posterior".
- **Ley 1581 art. 10:** lista cerrada de casos sin autorización (entidad pública u orden judicial, datos públicos, urgencia médica, fines históricos, estadísticos o científicos, Registro Civil). **No existe excepción para "cookies estrictamente necesarias".**
- **Concepto SIC 16-172268 (9-ago-2016):** las cookies "eventualmente podrían conformar una base de datos" cuando recolectan datos personales. En ese caso el responsable debe cumplir los principios del art. 4 de la Ley 1581. https://www.sic.gov.co/recursos_user/boletin-juridico-sep2016/articulo/datos/tratamiento-datos-personales-a-traves-de-cookies.html
- **Decreto 1377 art. 7:** la autorización puede darse "mediante conductas inequívocas". "En ningún caso el silencio podrá asimilarse a una conducta inequívoca".
- **Resolución SIC 76538 de 2019 (Asegúrate Fácil), boletín SIC:**
  - "El silencio, las casillas 'pre marcadas' por defecto, la inacción no constituyen consentimiento".
  - Hacer clic en el botón de envío no bastó como consentimiento.
  - Una casilla para aceptar "políticas de privacidad" "no necesariamente significa" que se autorizó el tratamiento.
  - https://www.sic.gov.co/boletin/juridico/habeas-data/el-silencio-las-casillas-%E2%80%9Cpremarcadas%E2%80%9D-por-defecto-y-la-inacci%C3%B3n-no-constituyen-el-consentimiento-conforme-con-la-ley-1581-de-2012
- **Ley 1581 art. 23 lit. a:** multas de hasta 2.000 SMMLV.

**Qué no pude verificar**
- **Resolución SIC 32126 de 2022** ("ninguna categoría de cookie está exenta de consentimiento"): **NO VERIFICADO**. Solo la citan fuentes secundarias (https://www.ochgroup.co/en/cookies-y-datos-personales-en-colombia/) y no la encontré en fuente oficial.
- **Guía SIC de comercio electrónico (2019):** el PDF existe (HTTP 200, 9 MB), pero no pude extraer el texto sin crear archivos. Su contenido sobre cookies: **NO VERIFICADO**.
- **Resoluciones 74828/2019 (Rappi) y 53593/2020 (Google):** solo en fuentes secundarias, **NO VERIFICADO**.
- **Guía de Responsabilidad Demostrada:** **NO VERIFICADO**.

**Aplicación a Fersua Studio**
- **Visitantes públicos (Home y páginas de DJ):** si no se les pone ninguna cookie, no hay nada que consentir.
- **Cookie de sesión de DJs y admin:** es un identificador ligado a una cuenta, así que es dato personal (art. 3 lit. c). No hay excepción en el art. 10, por lo que debe quedar cubierta por la autorización que el DJ da al registrarse. Esa autorización debe informar la finalidad (art. 12 lit. a).
- **Cookie "hint" sin datos:** no es dato personal.

**Conclusión**
- Ninguna norma colombiana verificada exige un banner de cookies. Las cookies no están reguladas expresamente; se aplica la Ley 1581 solo cuando recogen datos personales.
- Con solo cookies esenciales, **no recomiendo un banner de "Aceptar"**. No se puede rechazar sin romper el inicio de sesión, y un "Aceptar" de adorno no sería un consentimiento válido (Res. 76538).
- **Aviso recomendado:**
  - (a) Una sección "Cookies y tecnologías similares" en la Política, con una tabla: nombre, tipo (propia, técnica), finalidad, duración, si contiene datos.
  - (b) Mención expresa de la cookie de sesión en la casilla de autorización del registro de DJ.
  - (c) Una línea informativa, sin bloquear nada, en el login: "Solo usamos una cookie técnica para mantener tu sesión. [Política de cookies]".
  - (d) Si algún día se agrega analítica o el píxel de Meta: banner con aceptación previa y casillas sin marcar, antes de cargar esos scripts (arts. 9 y 3 lit. a; Res. 76538).
- **Referencia de la propia SIC:** su sitio usa un modal "ACEPTAR" que cubre también las cookies esenciales (https://sedeelectronica.sic.gov.co/politica-de-tratamiento-de-datos-personales). Es una práctica suya, no una obligación.

**Problemas en el código actual (en `C:\Fernando\Desarrollo\Personal\Fersuastudio\public_html\frontend`)**
- **`src/pages/Login.tsx` (líneas 41-52) y `src/components/ProtectedRoute.tsx`:** el token y el usuario se guardan en **localStorage**. Esto contradice "solo cookie httpOnly". Hay que migrar a la cookie o declararlo como "tecnología similar".
- **`src/index.css` (línea 1):** importa `fonts.googleapis.com`, lo que envía la IP de cada visitante a Google. Conviene alojar las fuentes en el propio servidor o declararlo en la Política.
- **`src/pages/ArtistBooking.tsx` (líneas 434-436):** "Al enviar aceptas ser contactado…" es consentimiento por clic. Según la Res. 76538 no es válido; hay que reemplazarlo por una casilla.
- **Footers sin enlaces legales:** `Home.tsx` línea 204 y `ArtistBooking.tsx` línea 440.

---

### 2. Especificación de ubicación en la interfaz

**A. Footer común (componente `LegalFooter`) en `/`, `/:slug` y `/login`**
- **Fila 1: identificación del responsable**, al estilo de Rappi:
  "[NOMBRE/RAZÓN SOCIAL] · NIT/CC [___] · [Dirección], Medellín, Colombia · [email] · Tel. [___] · © 2026 Fersua Studio"
  - Base: Ley 1480 art. 50 lit. a (nombre, NIT, dirección de notificación judicial, teléfono, correo); Ley 1581 art. 12 lit. d; Decreto 1377 art. 15 num. 1.
- **Fila 2: enlaces, con estos textos exactos:**
  - "Términos y Condiciones" → `/legal/terminos`
  - "Política de Tratamiento de Datos Personales" → `/legal/privacidad`
  - "Aviso de Privacidad" → `/legal/privacidad#aviso`
  - "Política de Cookies" → `/legal/privacidad#cookies`
  - "PQRS y Habeas Data" → `/legal/pqrs`
  - "SIC – Superintendencia de Industria y Comercio" → https://www.sic.gov.co/ (nueva pestaña, `rel="noopener"`)
  - Base del enlace a la SIC: Ley 1480 art. 50 parágrafo, "enlace visible, fácilmente identificable" a la autoridad de protección al consumidor.
- **Solo en páginas de DJ, fila extra:** "Página de [DJ] alojada en Fersua Studio. La contratación, tarifas y pagos se acuerdan directamente con el artista; Fersua Studio no es parte de ese contrato." · **"Reportar este perfil"**.

**B. Páginas legales `/legal/*`** (con base en el patrón `policy-doc` de Allset)
- **Pestañas arriba:** Términos | Privacidad y Cookies | PQRS.
- **Encabezado:**
  - H1.
  - Etiqueta: "Versión 1.0 · Vigente desde: [dd/mm/aaaa] · Última actualización: [dd/mm/aaaa]". La fecha de entrada en vigencia es obligatoria (Decreto 1377 art. 13 num. 6).
- **Recuadro destacado (`policy-doc__lead`):** responsable (nombre, NIT/CC, dirección, email, teléfono) y canales de PQRS.
- **Tabla de contenido:** fija a la izquierda en escritorio; en móvil, un `<details>` plegable. Enlaza a cada sección con `id`.
- **Secciones como `article.policy-block`**, siguiendo el mínimo del Decreto 1377 art. 13:
  1. Responsable
  2. Datos que tratamos, por tipo de titular: DJs, integrantes, solicitantes de booking, visitantes
  3. Finalidades
  4. Encargados y transmisiones: Hostinger (VPS y SMTP, país por confirmar) y WhatsApp/Meta cuando el usuario lo abre
     - Transmitir a un encargado en el exterior no requiere informar ni pedir consentimiento si hay contrato de transmisión (Decreto 1377 art. 24 num. 2 y art. 25).
     - La transferencia a otro responsable sí tiene las restricciones de la Ley 1581 art. 26.
  5. Derechos (Ley 1581 art. 8)
  6. Área de atención
  7. Procedimiento: consultas en 10 días hábiles, prorrogables 5 (art. 14); reclamos en 15 días hábiles, prorrogables 8 (art. 15); queja ante la SIC solo después de agotar este trámite (art. 16)
  8. Seguridad (incluye IP guardada con HMAC)
  9. Conservación: 12 meses
  10. Menores: servicio solo para mayores de 18 (art. 7)
  11. Cookies (con tabla)
  12. Cambios: aviso previo y nueva autorización si cambia la finalidad (Decreto 1377 art. 5)
  13. Vigencia
- **Pie de cada documento:**
  - Enlace "Versiones anteriores" (hay que conservar el modelo del aviso: Decreto 1377 art. 16).
  - Botón "Descargar/Imprimir" en los Términos (Ley 1480 art. 50 lit. d: consulta, impresión y descarga).

**C. Formulario de booking (`ArtistBooking.tsx`)**
- **Aviso de privacidad breve**, justo encima del botón (mínimo del Decreto 1377 art. 15):
  "**Aviso de privacidad:** [RESPONSABLE] (Fersua Studio), NIT/CC [___], [email], es responsable de tus datos. Los usamos solo para gestionar esta solicitud: la guardamos hasta 12 meses, la compartimos con [Nombre DJ] y, si continúas, se abre WhatsApp (servicio de Meta) con el resumen. Puedes conocer, actualizar, rectificar o suprimir tus datos y revocar la autorización en [PQRS y Habeas Data]. [Política completa]."
- **Casilla obligatoria, sin marcar:**
  "☐ Autorizo el tratamiento de los datos de esta solicitud para enviarla a [Nombre DJ], guardarla en su bandeja y ser contactado sobre este evento, según la [Política de Tratamiento de Datos Personales]. *"
- **Línea de texto, no casilla:** "Al usar este formulario aceptas los [Términos de uso]."
- **Se eliminan:** el texto actual de consentimiento por clic y la frase "Redirigiendo a WhatsApp o…".
- **Aviso antes de abrir WhatsApp:** "Se abrirá WhatsApp, servicio de Meta Platforms sujeto a sus propias políticas".
- **Qué guardar como prueba (art. 12 parágrafo y art. 17 lit. b):** versión de la política, fecha y hora, IP con HMAC y el texto exacto aceptado.

**D. Registro de DJ: casillas separadas, todas sin marcar**
- ☐ "Declaro que soy mayor de 18 años." (obligatoria)
- ☐ "He leído y acepto los [Términos y Condiciones] (versión 1.0)." (obligatoria)
- ☐ "Autorizo a [RESPONSABLE] a tratar mis datos personales para crear y administrar mi cuenta, publicar mi página de booking, recibir solicitudes y usar una cookie técnica de sesión, según la [Política de Tratamiento de Datos Personales]. Declaro que cuento con autorización de los integrantes cuyos nombres e imágenes publique." (obligatoria)
- ☐ "Quiero recibir novedades de Fersua Studio por email." (opcional)
- **Por qué van separadas:** la SIC considera que aceptar Términos no equivale a autorizar el tratamiento de datos (Res. 76538; ver sección 1).
- **Campos privados obligatorios:** nombre o razón social, documento, dirección de notificaciones y teléfono. Fersua encaja como "portal de contacto" (Ley 1480 art. 53; art. 5 num. 8, "Producto: todo bien o servicio"), que debe exigir estos datos a quienes ofrecen.

**E. "Reportar este perfil"**
- Enlace en el footer del DJ y en un menú "⋯" junto al encabezado.
- Abre un modal con:
  - Motivo: suplantación; contenido inapropiado; mis datos o mi imagen publicados sin autorización; fraude; otro.
  - Descripción, email y casilla de autorización.
- Crea un ticket en la bandeja del admin, que puede suspender la página.

**F. PQRS y Habeas Data (`/legal/pqrs`)**
- **Formulario:**
  - Tipo: Consulta, Reclamo (corregir, actualizar, suprimir), Revocatoria, Petición, Queja, Sugerencia.
  - Nombre, tipo y número de documento, email, teléfono.
  - Relación: DJ usuario, solicitante de booking o tercero.
  - Descripción, adjuntos y casilla de autorización.
- **Al enviar:** se genera un **número de radicado con fecha y hora**, se envía acuse por email y se habilita el seguimiento (Ley 1480 art. 50 lit. g, modificado por la Ley 2439 de 2024, según el texto compilado por Función Pública).
- Mostrar los plazos de 10 y 15 días hábiles.
- **Alternativa por correo:** `mailto:datos@[dominio]?subject=Habeas%20Data%20-%20[tipo]`.

---

### 3. Ejemplos revisados

| Sitio | Qué muestra | URL |
|---|---|---|
| **Mercado Libre CO** | **Footer:** "Términos y condiciones", "Cómo cuidamos tu privacidad", "Accesibilidad", "Ayuda / PQR", "www.sic.gov.co", "Copyright © 1999-2026. MercadoLibre Colombia LTDA." **Banner de cookies:** "Aceptar cookies" / "Configurar cookies", con enlace al "Centro de Privacidad" | https://www.mercadolibre.com.co/ |
| **Rappi CO** | **Footer:** "Términos y Condiciones", "Políticas de Privacidad" y "Tratamiento de Datos" como documentos **separados**, además de "Derecho de retracto", "PQRs", "SIC". **Línea de identificación:** "Rappi S.A.S. --- NIT 900.843.898-9 --- Calle 63 # 16A-02 Bogotá D.C. --- notificacionesrappi@rappi.com". **Banner de cookies** con "Más información" | https://www.rappi.com.co/ |
| **Falabella CO** | **Footer:** "Información legal", "Formulario de reclamos", "Cómo cuidamos tus datos", "Peticiones, quejas y reclamos", "https://www.sic.gov.co/", "Términos y condiciones", "Política de cookies", "Política de privacidad" | https://www.falabella.com.co/falabella-co |
| **Tu Boleta** | **Footer:** "Política de privacidad", "Terminos de uso", enlace "SIC" al canal virtual de la SIC, "Ticket Fast S.A.S" NIT 900.569.193-0. **Política:** 17 secciones numeradas; el responsable en la sección IV; cookies en la II; "Vigencia" al final con fecha (21-feb-2022) | https://www.tuboleta.com/ · https://www.tuboleta.com/es/faq/politica-de-privacidad |
| **Fincaraíz** | **Una sola página `/informacion` con anclas:** `#aviso-legal`, `#terminos-y-condiciones`, `#politicas-de-privacidad`. **Casilla del formulario:** "Acepto aviso legal y la protección de datos de www.fincaraiz.com.co", que mezcla dos aceptaciones y es un antipatrón | https://www.fincaraiz.com.co/informacion |
| **SIC (el propio regulador)** | Política con sección de cookies en 4 categorías y modal "ACEPTAR" | https://sedeelectronica.sic.gov.co/transparencia/normativa/politicas-lineamientos-y-manuales/documentacion-de-cookies |
| **eticket.co** | No resolvió el DNS: **NO VERIFICADO** | — |

**Referencia Allset (`C:\Fernando\Desarrollo\hostinger\public_html\Allset.html`, líneas 309-365; estilos en `css\styles.css`, líneas 1187-1263)**
- **Estructura:**
  - `section#politicas.policies-section`: fondo con degradado y bordes arriba y abajo.
  - `.section-head`: título pequeño "Transparencia", H2 "Políticas" y una línea de introducción.
  - `.policy-doc`: columna centrada de máximo 720px.
  - `p.policy-doc__lead`: recuadro con borde izquierdo turquesa; muestra los canales oficiales (email, WhatsApp, horario).
  - 5 `article.policy-block` con `id` (`politicas-cambios`, `-error-entrega`, `-retracto`, `-privacidad`, `-envio-detalle`): H3 turquesa, `p` y `ul`, separados por un borde inferior.
  - `p.policy-doc__updated`: borde superior punteado, texto pequeño y tenue, "Última actualización: abril de 2026".
  - El footer tiene un enlace de ancla "Políticas" y "Email".
- **Qué le falta para este caso:**
  - Identificación del responsable (NIT/CC, dirección).
  - Número de versión y fecha "vigente desde".
  - Tabla de contenido.
  - Enlace a la SIC y PQRS con radicado.
  - El bloque de privacidad es muy corto frente al mínimo del Decreto 1377 art. 13.

### Archivos clave para implementar
- C:\Fernando\Desarrollo\Personal\Fersuastudio\public_html\frontend\src\pages\ArtistBooking.tsx
- C:\Fernando\Desarrollo\Personal\Fersuastudio\public_html\frontend\src\pages\Home.tsx
- C:\Fernando\Desarrollo\Personal\Fersuastudio\public_html\frontend\src\App.tsx
- C:\Fernando\Desarrollo\Personal\Fersuastudio\public_html\frontend\src\pages\Login.tsx
- C:\Fernando\Desarrollo\hostinger\public_html\css\styles.css (patrón visual `policy-doc`, líneas 1187-1263)