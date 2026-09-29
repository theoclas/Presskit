# Diseño de integración legal: Fersua Studio (booking de DJs)

**Base.** Parto de los 4 informes recibidos (habeas, consumer, terms, cookies_ux), del plan maestro (`C:\Users\ASUS\.claude\plans\ahora-s-te-cuento-resilient-snowglobe.md`) y de los diseños en el scratchpad (`d-data.md`, `d-backend.md`, `d-frontend.md`, `c-1.md`).

**Estado del código.** El monorepo `C:\Fernando\Desarrollo\hostinger\fersuastudio-booking` todavía no existe; solo existe `hostinger\public_html`. Por eso las rutas de archivo de abajo son archivos por crear.

**Convenciones:**
- [REQ] = legalmente requerido. [REC] = recomendado. [OPC] = opcional.
- [DUEÑO] = falta un dato del dueño. [ABOGADO] = requiere revisión de un abogado. No somos abogados.
- [NV] = NO VERIFICADO. [S] = confirmado solo en un extracto del buscador o en fuente secundaria.

**Abreviaturas y URL de las normas.** Donde no se indica otra cosa, la fuente es la citada por los informes.
- L1581 (Ley 1581/2012): https://www.alcaldiabogota.gov.co/sisjur/normas/Norma1.jsp?i=49981
- D1377 (Decreto 1377/2013): https://www.alcaldiabogota.gov.co/sisjur/normas/Norma1.jsp?i=53646. Su equivalencia con el DUR 1074/2015: https://normograma.mintic.gov.co/mintic/compilacion/docs/decreto_1377_2013.htm
- L1480 (Ley 1480/2011): https://www.alcaldiabogota.gov.co/sisjur/normas/Norma1.jsp?i=44306
- L2439 (Ley 2439/2024): https://www.alcaldiabogota.gov.co/sisjur/normas/Norma1.jsp?i=171718
- L527 (Ley 527/1999): https://www.alcaldiabogota.gov.co/sisjur/normas/Norma1.jsp?i=4276
- CPACA (Ley 1437/2011): https://www.alcaldiabogota.gov.co/sisjur/normas/Norma1.jsp?i=41249
- L51/83 (Ley 51/1983): https://www.alcaldiabogota.gov.co/sisjur/normas/Norma1.jsp?i=4954
- L4/1913: https://www.funcionpublica.gov.co/eva/gestornormativo/norma.php?i=8426
- L1755 (Ley 1755/2015): https://www.alcaldiabogota.gov.co/sisjur/normas/Norma1.jsp?i=62152
- L23/82 (Ley 23/1982): https://www.alcaldiabogota.gov.co/sisjur/normas/Norma1.jsp?i=3431
- CGP: https://www.alcaldiabogota.gov.co/sisjur/normas/Norma1.jsp?i=48425
- Concepto SIC 22-51097: https://sedeelectronica.sic.gov.co/sites/default/files/boletin-juridico/conceptos/2251097%20Consumidor.pdf
- Concepto SIC 21-171791: https://sedeelectronica.sic.gov.co/publicaciones/boletin-juridico/boletin/todo-usuario-de-una-plataforma-de-comercio-electronico-esta-protegido-por-los-derechos-del-consumidor
- Res. SIC 76538/2019: https://www.sic.gov.co/boletin/juridico/habeas-data/el-silencio-las-casillas-%E2%80%9Cpremarcadas%E2%80%9D-por-defecto-y-la-inacci%C3%B3n-no-constituyen-el-consentimiento-conforme-con-la-ley-1581-de-2012
- Guía SIC sobre fotografías: https://sedeelectronica.sic.gov.co/noticias/sic-expide-guia-para-el-correcto-tratamiento-de-las-fotografias-como-datos-personales
- Concepto SIC 21-17773 (incidentes): https://sedeelectronica.sic.gov.co/publicaciones/boletin-juridico/concepto/cumplimiento-de-la-obligacion-del-reporte-de-incidentes-de-seguridad
- Circulares SIC 08/2017 y 02/2018: https://normas.cra.gov.co/gestor/docs/circular_superindustria_0008_2017.htm y https://normas.cra.gov.co/gestor/docs/circular_superindustria_0002_2018.htm
- SU-420/19: https://www.corteconstitucional.gov.co/relatoria/2019/SU420-19.htm
- T-634/13: https://www.corteconstitucional.gov.co/relatoria/2013/T-634-13.htm

**Verificado por mí en esta sesión:**
- CPACA art. 52: la facultad sancionatoria caduca a los 3 años.
- L51/83 art. 1: festivos y su traslado al lunes.
- L2439 art. 4: modifica los literales b), g) y h) del art. 50 L1480. El g) exige radicado con fecha y hora. El d) no cambia.
- L4/1913 art. 62: en los plazos de días "se entienden suprimidos los feriados". [S]: solo por el extracto del buscador, porque el sitio falló por el certificado TLS.

---

## 0. Decisiones de diseño y conflictos que hay que corregir en el plan

1. **Retención de solicitudes: 12 meses.** Hoy `d-data.md` tiene `LIMITS.retention.bookingMonths: 24` y `d-backend.md` tiene `BOOKING_RETENTION_MONTHS=24`. Ambos pasan a **12**, que es lo que dice el plan maestro.
2. **Roles de tratamiento.** `c-1.md` M13 dice que el DJ es responsable de su bandeja y Fersua encargada. Se reemplaza por esto:
   - **Fersua es Responsable** de la base de datos de la plataforma.
   - **Cada DJ es Responsable independiente** del uso que hace de la solicitud una vez la recibe.
   - Base: definiciones de L1581 art. 3 lit. d y e; es la opción preferida del informe habeas. [ABOGADO]
3. **Prueba de consentimiento.** `User.termsVersion/termsAcceptedAt` y `BookingRequest.consentAt` se reemplazan por una tabla única de solo inserción, `ConsentRecord`. Si se borra la solicitud a los 12 meses, la prueba sobrevive (L1581 art. 17 lit. b; D1377 art. 8).
4. **Minimización.** Se quita `BookingRequest.userAgent` (c-1 M12). El user-agent, truncado a 120 caracteres, vive solo en `ConsentRecord` como evidencia.
5. **Rutas.** Las rutas canónicas quedan bajo `/legal/*`. `/privacidad`, `/terminos`, `/pqrs` y `/reportar` redirigen allí. Se agregan `pqrs` y `reportar` a `RESERVED_SLUGS` (`legal`, `privacidad`, `terminos` y `cookies` ya están).
6. **Identidad del operador en variables de entorno.** Va en `OPERATOR_*`, no en git, porque el repo podría ser público y la CC y la dirección son datos personales.
   - La API renderiza los documentos con esa identidad.
   - Si la identidad sigue con marcadores, la API no arranca con `REGISTRATION_OPEN=true` ni con `SEO_INDEXABLE=true`, y el POST de booking responde 503 `LEGAL_NOT_READY`.
   - Mientras tanto, el formulario se oculta y solo queda el botón de WhatsApp directo, que no guarda datos en la BD.
7. **Semilla de Mac Fly (M1).** Hoy se publica sin dueño y sin consentimiento de Macfly ni de Mike Bran. Antes de publicar hay que tener:
   - su **autorización escrita fuera de la plataforma**, guardada como `ConsentRecord` con `method=OFFLINE_DOCUMENT`;
   - su **registro de oferente del art. 53** completo;
   - base: L1581 art. 9 y L1480 art. 53. [DUEÑO]
8. **Foto HERO obligatoria vs. dato sensible.** `PUBLISH_CHECKLIST` exige heroImage, pero ninguna actividad puede condicionarse a entregar datos sensibles (D1377 art. 6; Guía SIC de fotos). Por eso la HERO **puede ser un logo o arte sin personas**; la interfaz lo dice. [ABOGADO]
9. **Tabla de cookies.** Debe incluir también `__Host-kd`, la cookie de dispositivo conocido que propone c-1 H6, si se implementa.

---

## 1. Documentos legales que hay que publicar

Todos se versionan. Encabezado común:
- "Versión X.Y · Vigente desde dd/mm/aaaa · Última actualización".
- Recuadro con la identidad del responsable y los canales.
- Tabla de contenido.
- Enlace "Versiones anteriores" (`/legal/<clave>/versiones` y `/legal/<clave>/v/<versión>`). Base: conservar el modelo del aviso, D1377 art. 16.
- Botón "Descargar / Imprimir". Base: L1480 art. 50 lit. d.

| Ruta | Título | Propósito | Clasif. |
|---|---|---|---|
| `/legal/privacidad` (#cookies, #transferencias) | Política de Tratamiento de Datos Personales | D1377 art. 13 | [REQ] [DUEÑO] [ABOGADO] |
| `/legal/aviso-privacidad` | Aviso de Privacidad | D1377 arts. 14-15; se muestra resumido junto a cada formulario | [REQ] |
| `/legal/terminos` | Términos de uso (visitantes y solicitantes) | L527 arts. 14-15; L1480 art. 37 | [REQ] mientras el formulario pida aceptarlos; [ABOGADO] |
| `/legal/terminos-artistas` | Términos y Condiciones para Artistas | contrato de adhesión con los DJs | [REQ] desde M3; [ABOGADO] |
| `/legal/aviso-legal` | Aviso legal e identificación del operador | L1480 art. 50 lit. a y parágrafo; condición (v) del Concepto SIC 22-51097 | [REQ] (ver 6); [DUEÑO] |
| `/legal/pqrs` (+ `/legal/pqrs/seguimiento`) | PQRS y Habeas Data | L1581 arts. 14-15; D1377 arts. 21 y 23; L1480 art. 50 lit. g (L2439 art. 4) | [REQ] el canal; el formulario con radicado es [REC] como mínimo |
| `/legal/reportar` | Reportar contenido | procedimiento contractual (SU-420/19) | [REC] |
| `/legal/cookies` | alias de `/legal/privacidad#cookies` | — | [REC] |

**Documentos internos** (no se publican; van en `docs/legal/`):
- Manual interno de políticas y procedimientos (L1581 art. 17 lit. k). [REQ]
- Procedimiento de incidentes (L1581 art. 17 lit. n; Concepto SIC 21-17773). [REQ]
- Tabla de retención (D1377 art. 11). [REQ]
- Revisión del DPA de Hostinger frente a D1377 art. 25. [REC] [NV]

**Marcadores que llena el dueño.** Todos son variables de entorno:
- `OPERATOR_LEGAL_NAME`, `OPERATOR_ID_TYPE` (CC/NIT), `OPERATOR_ID_NUMBER`, `OPERATOR_MATRICULA` (opcional).
- `OPERATOR_ADDRESS` (dirección de notificación judicial, Medellín), `OPERATOR_PHONE`, `OPERATOR_EMAIL`.
- `HABEAS_DATA_EMAIL` (recomendado: `legal@fersuastudio.com`).
- `HOSTING_COUNTRY`: país del VPS 177.7.40.130 (srv1676707). Se confirma en hPanel. [NV]
- `SMTP_COUNTRY` [NV].
- `LEGAL_EFFECTIVE_DATE`.

### 1.1 Política de Tratamiento (`/legal/privacidad`): secciones obligatorias
1. **Responsable:** nombre o razón social, domicilio, dirección, correo y teléfono (D1377 art. 13 num. 1; L1581 art. 12 lit. d).
2. **Datos por tipo de titular:**
   - DJ: cuenta, página, registro del art. 53, fotos.
   - Integrantes y terceros que aparecen en fotos.
   - Solicitantes de booking.
   - Personas que envían PQRS o reportes.
   - Visitantes: ninguna cookie.
   - Aclarar que la **IP guardada con HMAC sigue siendo dato personal** (L1581 art. 3 lit. c).
3. **Tratamiento y finalidades,** una por flujo (D1377 art. 13 num. 2). Incluye:
   - la publicación en internet decidida por el DJ, con despublicación a voluntad (L1581 art. 4 lit. f) [NV sobre si basta la autorización];
   - la entrega del registro del oferente a quien lo contrató y quiere quejarse, y a la autoridad (L1480 art. 53).
4. **Datos sensibles:** la imagen o foto (Guía SIC); es facultativo entregarlos; no se usa reconocimiento facial (D1377 art. 6; L1581 art. 6).
5. **Menores:** servicio solo para mayores de 18 años; se prohíben fotos de menores (L1581 art. 7; D1377 art. 12).
6. **Derechos del titular** (L1581 art. 8, lit. a-f), con consulta gratuita al menos una vez al mes (D1377 art. 21).
7. **Área responsable** de atender peticiones, consultas y reclamos (D1377 art. 13 num. 4 y art. 23).
8. **Procedimiento:**
   - consultas: 10 días hábiles, prorrogables 5 (L1581 art. 14);
   - reclamos: 15 días hábiles, prorrogables 8; subsanación en 5 días; desistimiento a los 2 meses; leyenda "reclamo en trámite" en 2 días hábiles (art. 15);
   - la queja ante la SIC exige agotar antes este trámite (art. 16).
9. **Roles:**
   - Fersua es Responsable.
   - El DJ es Responsable independiente del uso que da a la solicitud.
   - Encargados: Hostinger (VPS y SMTP).
   - WhatsApp/Meta lo usa el titular por decisión propia.
10. **Transferencias y transmisiones internacionales:** país del VPS y del SMTP, y si está en la lista de países adecuados de la SIC (Circulares 08/2017 y 02/2018). Si no lo está, la base es la autorización expresa (L1581 art. 26 lit. a). [DUEÑO] [NV]
11. **Seguridad:** TLS, argon2id, HMAC de IP, acceso por roles, 2FA del admin (L1581 art. 4 lit. g).
12. **Conservación,** según la tabla de la sección 5.4: solicitudes 12 meses, respaldos 14 días / 8 semanas, logs 14 días (D1377 art. 11 y art. 13 num. 6).
13. **Cookies:** tabla con nombre, tipo, finalidad, duración y si contiene datos personales.
    - `__Host-rt`: sesión; 7/30 días para DJ y 1/7 para el admin; sí contiene dato personal.
    - `__Host-kd`: si existe; 90 días; sí.
    - La cookie *hint* (nombre por definir): no contiene dato personal.
    - Visitantes públicos: ninguna.
    - Si algún día se agrega analítica, se pedirá consentimiento previo (L1581 art. 9; Res. SIC 76538).
14. **Cambios:** aviso previo de los cambios sustanciales; nueva autorización si cambia la finalidad (D1377 art. 13 parágrafo y art. 5).
15. **Fecha de entrada en vigencia y período de vigencia de la base de datos** (D1377 art. 13 num. 6).

### 1.2 Aviso de Privacidad (`/legal/aviso-privacidad`)
- Responsable y datos de contacto.
- Tratamiento y finalidades.
- Derechos del titular.
- Cómo consultar la política y cómo se avisan sus cambios.
- Que responder sobre datos sensibles es facultativo.
- Base: D1377 art. 15 y parágrafo; se conserva según art. 16.

### 1.3 Términos de uso (`/legal/terminos`)
Secciones:
1. Objeto y aceptación por casilla sin premarcar. No vale "al navegar aceptas" (L1480 art. 43 num. 9).
2. Qué es Fersua: portal de contacto (L1480 art. 53 y art. 5 num. 18, agregado por L2439 art. 6).
3. Mayoría de edad; facultad para actuar por una empresa.
4. El formulario: destinatarios, 12 meses de conservación, datos de terceros; la autorización de datos va aparte (L1581 art. 9).
5. Paso a WhatsApp (Meta).
6. Usos prohibidos.
7. Propiedad intelectual de los DJs y de terceros.
8. **Quejas contra un DJ:** cómo pedir sus datos (art. 53). Incluye la redacción de "retracto frente al DJ" del informe consumer (L1480 art. 47).
9. Enlace a Reportar.
10. Responsabilidad: sin excluir dolo ni culpa grave (CC arts. 1522 y 63) y sin renunciar a derechos (L1480 art. 43 num. 1-2).
11. Enlaces a terceros.
12. Modificaciones con aviso; ley colombiana; "jueces competentes conforme a la ley", sin pactar domicilio (CGP art. 28 num. 3).

### 1.4 Términos para Artistas (`/legal/terminos-artistas`)
Usar el índice de 27 cláusulas del informe terms. Puntos que no pueden faltar:
- Portal de contacto: sin comisión por reserva, sin pagos y sin fijar precios (Concepto SIC 22-51097, señales de alerta).
- Mayor de 18 años (CC art. 1744: la declaración no impide la nulidad; se cierra la cuenta si se detecta un menor).
- Registro privado del art. 53, obligatorio y veraz, con deber de actualizarlo.
- **Licencia no exclusiva**, con modalidades enumeradas y duración "mientras esté publicado + 30 días de purga" (L23/82 art. 183; Decisión 351 art. 31). No es una cesión.
- Derechos morales intactos (L23/82 art. 30).
- Garantías sobre fotos, flyers e imagen de terceros (L23/82 art. 87; T-634/13).
- Contenido prohibido.
- Moderación con causales tasadas, aviso y 5 días hábiles para responder, salvo casos urgentes (L1480 art. 43 num. 7; C.Co. art. 830 [S]).
- **Anexo de uso de datos de solicitudes:** solo para responder, sin marketing, confidencialidad, borrado cuando ya no se necesiten y reenvío de solicitudes de derechos a Fersua (L1581 art. 4 lit. h y art. 9).
- Retracto a cargo del DJ en ventas a distancia (L1480 art. 47).
- Precios en COP con impuestos incluidos (art. 50 lit. c).
- Cambios con aviso de 15 días y nueva aceptación; quien no acepte cierra la cuenta sin costo (L1480 art. 38).
- Dolo y culpa grave excluidos de la limitación de responsabilidad.
- Indemnidad [ABOGADO]: su validez depende de si el DJ es consumidor. Los informes chocan: consumer (Concepto SIC 21-171791) dice que sí; terms (L1480 art. 5 num. 3) dice que probablemente no.

### 1.5 Aviso legal (`/legal/aviso-legal`)
- Identificación completa (L1480 art. 50 lit. a: nombre, NIT, dirección de notificación judicial, teléfono, correo).
- **Aviso de intermediación** con sus efectos (Concepto SIC 22-51097, condición v).
- Explicación del registro de oferentes y de cómo pedir los datos de un DJ (art. 53).
- Alojamiento y país; SMTP.
- Contenido de terceros y canal de reporte.
- Enlace a la SIC (art. 50 parágrafo).
- Versiones y enlaces a los demás documentos.
- Declaración interna, sin publicar: no se exige inscripción en el RNBD por debajo de 100.000 UVT (Decreto 090/2018; Circular SIC 003/2018). [DUEÑO: confirmar activos]

### 1.6 PQRS y Habeas Data (`/legal/pqrs`)
- Formulario (sección 2.6).
- Plazos visibles.
- Correo alternativo.
- Seguimiento por radicado.
- Explicación de cada tipo:
  - (a) sobre el servicio de la plataforma;
  - (b) solicitud de datos del oferente (art. 53);
  - (c) queja contra un DJ: **se remite al DJ; Fersua no la decide**, para no perder la calidad de portal (Concepto SIC 22-51097);
  - (d) habeas data.

### 1.7 Reportar contenido (`/legal/reportar`)
- Quién puede reportar.
- Información requerida.
- Plazos: acuse inmediato, revisión en 2 días hábiles, retiro urgente en menos de 24 h, 5 días hábiles para que el DJ responda, decisión en 15 días hábiles y una reconsideración.
- Contenido sexual con menores: retiro inmediato y denuncia (Ley 679/2001 arts. 7-8 [S]).
- Fersua no decide el derecho de fondo; eso corresponde al juez, la DNDA o la SIC (SU-420/19).

---

## 2. Ubicación en la interfaz y textos exactos

### 2.1 `LegalFooter`
Archivo: `web/src/public/legal/LegalFooter.tsx`. CSS propio, sin AntD, fuera del alcance `.djp` para que la paleta del DJ no pueda ocultarlo. No es editable por el DJ ni forma parte de `PAGE_TEXT_SLOTS`.
- **Dónde va:** `/`, `/:slug`, `/login`, `/registro`, `/recuperar`, `/restablecer`, `/legal/*` y 404. En `/panel/*` y `/admin/*` va una versión compacta de una línea.
- **Datos:** `GET /api/public/legal`, con caché de 1 h.
- **Fila 1 (identificación):** `{OPERATOR_LEGAL_NAME} · {CC|NIT} {número} · {dirección}, Medellín, Colombia · {correo} · Tel. {teléfono}`
- **Fila 2 (enlaces):** `Aviso legal · Términos de uso · Términos para artistas · Política de datos personales · Aviso de privacidad · Cookies · PQRS y habeas data · Reportar contenido · Superintendencia de Industria y Comercio – www.sic.gov.co`
  - El último enlace va a https://www.sic.gov.co, en nueva pestaña con `rel="noopener"` (L1480 art. 50 parágrafo).
- **Fila 3:** `Fersua Studio es un portal de contacto (art. 53, Ley 1480 de 2011): no vende ni presta los servicios de los artistas, no fija precios y no recibe pagos. © {año} Fersua Studio.`
- **Solo en páginas de DJ**, bloque fijo encima de las filas. Reemplaza el `DjFooter` de d-frontend §217:
  `Página de {displayName} · Plataforma operada por Fersua Studio. La contratación, las tarifas y los pagos se acuerdan directamente con el artista, que responde por su servicio; Fersua Studio no es parte de ese contrato.` · **`Reportar este perfil`**
  - [OPC] Si el DJ lo elige, se agrega `Responsable del servicio: {publicLegalName}` [NV sobre si es obligatorio].
- **En el encabezado de la página del DJ:** menú "⋯" con la opción "Reportar este perfil".

### 2.2 Registro (`/registro`, M3)
Casillas **separadas, sin marcar**, con la versión visible. El botón se habilita solo si están marcadas las 4 obligatorias. El servidor exige `true` en cada una (Res. SIC 76538; D1377 art. 7; L1480 art. 43 num. 9).

1. `☐ Declaro que soy mayor de 18 años. *`
2. `☐ He leído y acepto los [Términos y Condiciones para Artistas] (versión {v}, vigente desde {fecha}). *`
3. `☐ Autorizo a {OPERADOR} ({CC|NIT} {número}), responsable de Fersua Studio, a tratar mis datos personales (usuario, correo, nombre artístico, textos, integrantes, fechas, redes, número de WhatsApp, los datos de identificación del registro de oferentes y una cookie técnica de sesión) para: crear y administrar mi cuenta y recuperar el acceso; publicar en internet mi página de booking con la información que yo decida publicar; recibir solicitudes de contratación; enviarme correos del servicio; moderar la plataforma; y entregar mis datos de identificación a quien me haya contratado y quiera presentar una queja o reclamo, o a una autoridad, como exige el art. 53 de la Ley 1480 de 2011. Mis datos se alojan en servidores de Hostinger ubicados en {HOSTING_COUNTRY}. Puedo conocer, actualizar, rectificar y suprimir mis datos y revocar esta autorización en {HABEAS_DATA_EMAIL} o en fersuastudio.com/legal/pqrs. [Política de Tratamiento de Datos Personales] (versión {v}). *`
   - La frase del país es [REQ] solo si el país no es "adecuado" (L1581 art. 26 lit. a). Se recomienda dejarla siempre.
4. `☐ Declaro que soy titular, o tengo autorización escrita, de los textos, fotos, flyers y logos que publique, y que cuento con la autorización previa, expresa e informada de cada integrante y de cada persona identificable que aparezca en ellos, todos mayores de 18 años, para publicarlos en mi página de booking. *`
5. [OPC] `☐ Quiero recibir novedades de Fersua Studio por correo.` Omitirla si no se hará marketing.

- **Línea informativa bajo el formulario, en `/login` y `/registro`:** `Solo usamos una cookie técnica para mantener tu sesión. [Cookies]` (informe cookies: no hace falta banner).
- **Autorización de fotos (dato sensible)** [REQ si hay fotos de personas]. Se pide en el panel, en el primer intento de subir HERO, CARD, MEMBER o GALLERY, con un modal:
  `Autorizo a {OPERADOR} a publicar en mi página de booking las fotografías en las que aparezco. Sé que mi imagen es un dato sensible, que no estoy obligado(a) a autorizar su tratamiento y que puedo usar la plataforma sin subir fotos (por ejemplo, con mi logo). Puedo retirar esta autorización en Cuenta › Legal.`
  - Botones: `Autorizo` / `No autorizo: solo subiré logos o imágenes sin personas`.
  - Base: D1377 art. 6; Guía SIC.
- **Uso promocional por Fersua** [OPC]: interruptor en Cuenta › Legal, apagado por defecto y revocable (T-634/13).

### 2.3 Formulario de booking (`BookingForm`, M1)
**Aviso breve** [REQ], justo encima del botón:
`Aviso de privacidad: {OPERADOR} ({CC|NIT} {número}, {HABEAS_DATA_EMAIL}), responsable de Fersua Studio, tratará los datos de esta solicitud solo para entregarla a {displayName} y gestionar tu contacto sobre este evento. La guardamos hasta 12 meses y la ven {displayName} y el administrador de la plataforma. Si continúas, se abrirá WhatsApp (servicio de Meta) con un resumen que tú envías desde tu cuenta. Puedes conocer, actualizar, rectificar y suprimir tus datos y revocar la autorización en [PQRS y habeas data]. No incluyas datos sensibles ni de menores de edad. [Política completa]`
- Base: D1377 art. 15; L1581 art. 12.

**Casillas, sin marcar y no configurables por el DJ:**
1. [REQ] `☐ Autorizo el tratamiento de mis datos personales para enviar esta solicitud a {displayName}, guardarla hasta 12 meses y ser contactado(a) sobre este evento, según la [Política de Tratamiento de Datos Personales]. *`
2. [REC] `☐ Soy mayor de 18 años, acepto los [Términos de uso] y entiendo que Fersua Studio es un portal de contacto: el contrato, el precio y el pago se acuerdan directamente con {displayName}. *`
   - Si se prefiere menos fricción, esta casilla puede bajarse a un aviso visible. El mínimo es informar el rol de intermediario (Concepto SIC 22-51097, condición v).

**Bajo el botón "Enviar solicitud":** `Se abrirá WhatsApp, servicio de Meta Platforms, sujeto a sus propias políticas.`

**Se elimina** cualquier "Al enviar aceptas…", que es consentimiento por clic y no vale (Res. SIC 76538). También se reemplaza el texto de consentimiento de d-frontend §464.

### 2.4 Panel del DJ
- **Modal de nueva aceptación, bloqueante.** Aparece si `GET /api/auth/me` trae `legal.pending` no vacío (documento con `requiresReacceptance`).
  - Título: `Actualizamos nuestros documentos legales`.
  - Texto: `Desde el {fecha} rigen nuevas versiones de: • Términos y Condiciones para Artistas (v{x}): {resumen} • Política de Tratamiento de Datos (v{y}): {resumen}.`
  - Casillas separadas, sin marcar:
    - `He leído y acepto los Términos y Condiciones para Artistas (versión {x}).`
    - `Autorizo el tratamiento de mis datos según la Política de Tratamiento de Datos Personales (versión {y}).` Solo aparece si cambió la finalidad (D1377 art. 5); si no, basta un banner informativo.
  - Botones: `Aceptar y continuar` · `No acepto: quiero cerrar mi cuenta` (abre una PQRS de supresión) · `Cerrar sesión`. No hay "X" que lo salte.
  - La página pública sigue en línea. Pasados 30 días sin aceptar, el admin puede suspenderla por la causal prevista en los Términos.
- **Banner previo,** 15 días antes de la fecha de vigencia, más un correo.
- **Cuenta › Legal:**
  - Mis aceptaciones: documento, versión, fecha y enlace a la versión exacta.
  - Interruptores revocables de fotos y promoción.
  - Formulario del **registro de oferente (art. 53)**, obligatorio antes de "Enviar a revisión", con la casilla `☐ Declaro que estos datos son veraces y me obligo a mantenerlos actualizados.`
  - Botón `Solicitar eliminación de mi cuenta`, que crea una PQRS `HD_RECLAMO` de supresión.
- **Bandeja de solicitudes:**
  - Etiqueta `Reclamo en trámite` en las solicitudes con `claimPqrsId` (L1581 art. 15).
  - Recordatorio fijo: `Usa estos datos solo para responder esta solicitud. No los agregues a listas de difusión.`

### 2.5 "Reportar este perfil"
Modal desde la página del DJ, o página `/legal/reportar?perfil={slug}`. No requiere login.

**Campos:**
- Motivo, de una lista: suplantación; contenido sexual; menores de edad; mi imagen o mis datos publicados sin autorización; derechos de autor; marca; odio, violencia o amenazas; fraude; evento ilegal; publicidad engañosa; otro.
- Elemento: perfil, foto o flyer. Se precompleta si el reporte se abre desde una foto.
- Descripción.
- Calidad en la que actúa: cualquier persona, titular del derecho, persona retratada, apoderado o autoridad.
- Nombre y correo. Son obligatorios en los reclamos basados en derechos.
- Casillas:
  - `☐ Declaro que la información es veraz y actúo de buena fe. *`
  - `☐ Autorizo el tratamiento de mis datos para gestionar este reporte, según la [Política]. *`
  - `☐ Pueden compartir mi identidad con el artista si es indispensable.` Opcional; por defecto no se comparte.
- Al enviar, se muestra el radicado (`RP-…`) y los plazos.

### 2.6 Formulario PQRS (`/legal/pqrs`)
**Campos:**
- Tipo: Consulta de datos · Reclamo (actualizar, rectificar o suprimir) · Revocatoria de autorización · Petición · Queja sobre la plataforma · Queja contra un artista · Solicitud de datos de un artista para queja o reclamo · Sugerencia.
- Nombre; tipo y número de documento (opcional, sirve para verificar la identidad); correo; teléfono (opcional).
- Relación: artista usuario, solicitante de booking, tercero o autoridad.
- Perfil (slug) y número de solicitud, para los tipos del art. 53.
- Descripción (máx. 5.000 caracteres). **Sin adjuntos en v1**; los soportes se envían por correo citando el radicado.
- Casilla: `☐ Autorizo el tratamiento de mis datos para tramitar esta solicitud, según la [Política]. *`

**Respuesta en pantalla y por correo:**
`Radicado {PQ-AAMMDD-XXXXXX} · Recibido {dd/mm/aaaa hh:mm} (hora de Colombia) · Plazo de respuesta: {fecha}. Consulta el estado en fersuastudio.com/legal/pqrs/seguimiento.`
- Base: L1480 art. 50 lit. g (L2439 art. 4); L1581 art. 14.
- Alternativa visible por correo: `{HABEAS_DATA_EMAIL}`. El canal por correo también vale como medio del que queda prueba.

---

## 3. Cambios en el modelo de datos (Prisma, sobre `d-data.md`)

```prisma
enum ConsentPurpose { AGE_18 TERMS_ARTIST DATA_ARTIST CONTENT_RIGHTS PHOTOS_SENSITIVE PROMO_IMAGE MARKETING_EMAIL
                      BOOKING_DATA BOOKING_TERMS PQRS_DATA REPORT_DATA }
enum ConsentMethod  { CHECKBOX OFFLINE_DOCUMENT }
enum SubjectType    { USER PROFILE BOOKING PQRS REPORT }
enum PqrsType       { HD_CONSULTA HD_RECLAMO HD_REVOCATORIA PETICION QUEJA_PLATAFORMA QUEJA_CONTRA_DJ DATOS_OFERENTE SUGERENCIA }
enum PqrsStatus     { RECIBIDA INCOMPLETA EN_TRAMITE PRORROGADA TRASLADADA RESUELTA DESISTIDA }
enum ReportStatus   { NUEVO EN_REVISION OCULTO_PREVENTIVO ESPERANDO_DJ RESUELTO_MANTENIDO RESUELTO_RETIRADO RECHAZADO }
enum CaseType       { PQRS REPORT }
enum IdDocType      { CC CE PPT PASAPORTE NIT }

model LegalDocumentVersion {            // conserva el modelo del aviso (D1377 art. 16); la API lo sincroniza al arrancar
  id String @id @default(cuid())
  docKey String @db.VarChar(32)         // privacidad | aviso-privacidad | terminos | terminos-artistas | aviso-legal
  version String @db.VarChar(20)
  effectiveAt DateTime
  templateSha256 String @db.Char(64)
  renderedSha256 String @db.Char(64)    // texto con la identidad OPERATOR_* ya insertada
  body String @db.MediumText            // Markdown renderizado
  requiresReacceptance Boolean @default(false)
  changeSummary String? @db.VarChar(500)
  publishedAt DateTime @default(now())
  @@unique([docKey, version])
}

model ConsentRecord {                   // SOLO INSERCIÓN; la revocatoria es una fila con granted=false
  id String @id @default(cuid())
  subjectType SubjectType
  subjectId String @db.VarChar(30)      // sin FK: sobrevive al borrado del titular (como AuditLog)
  subjectRef String? @db.Char(64)       // HMAC(correo) para ubicar al titular después del borrado
  purpose ConsentPurpose
  granted Boolean @default(true)
  method ConsentMethod @default(CHECKBOX)
  docKey String? @db.VarChar(32)
  docVersion String? @db.VarChar(20)
  docSha256 String? @db.Char(64)
  labelVersion String @db.VarChar(20)
  labelText String @db.VarChar(1500)    // texto EXACTO mostrado; lo arma el servidor desde shared, no lo envía el cliente
  ipHash String? @db.Char(64)
  ipKeyVersion Int? @db.TinyInt         // rotación de IP_HASH_SECRET: conservar las claves anteriores
  userAgent String? @db.VarChar(120)
  evidenceRef String? @db.VarChar(200)  // OFFLINE_DOCUMENT: referencia al soporte guardado en private/
  createdById String? @db.VarChar(30)   // admin que registró un consentimiento fuera de la plataforma
  createdAt DateTime @default(now())    // UTC del servidor
  subjectEndedAt DateTime?              // se llena al borrar al titular; es la ÚNICA columna con GRANT UPDATE
  @@index([subjectType, subjectId, purpose, createdAt])
  @@index([subjectRef])
  @@index([subjectEndedAt])
}

model DjLegalRegistry {                 // L1480 art. 53. PRIVADO: nunca entra en DTOs públicos; solo el dueño y el admin
  profileId String @id
  profile DjProfile @relation(fields: [profileId], references: [id], onDelete: Restrict) // se borra con el job de retención
  holderType String @db.VarChar(8)      // NATURAL | JURIDICA (titular responsable del dúo)
  legalName String @db.VarChar(120)
  docType IdDocType
  docNumberEnc String @db.VarChar(200)  // AES-GCM con REGISTRY_ENC_KEY [REC]
  notifAddress String @db.VarChar(160)
  notifCity String @db.VarChar(60)
  phone1 String @db.VarChar(20)
  phone2 String? @db.VarChar(20)
  email String? @db.VarChar(254)
  birthDate DateTime? @db.Date          // [REC] para comprobar 18+ antes de aprobar
  truthDeclaredAt DateTime
  verifiedAt DateTime?
  verifiedById String? @db.VarChar(30)
  closedAt DateTime?                    // cierre del perfil; purga a los 12 meses [NV/ABOGADO]
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
}

model Pqrs {
  id String @id @default(cuid())
  radicado String @unique @db.VarChar(20)   // PQ-AAMMDD-XXXXXX (Crockford base32, aleatorio, no enumerable)
  trackingTokenHash String @db.Char(64)
  type PqrsType
  status PqrsStatus @default(RECIBIDA)
  requesterName String @db.VarChar(120)
  requesterDocType IdDocType?
  requesterDocNumber String? @db.VarChar(20)
  requesterEmail String @db.VarChar(254)
  requesterPhone String? @db.VarChar(20)
  relation String @db.VarChar(16)           // DJ_USER | SOLICITANTE | TERCERO | AUTORIDAD
  userId String? @db.VarChar(30)
  profileId String? @db.VarChar(30)
  bookingRef String? @db.VarChar(30)
  description String @db.Text
  receivedAt DateTime @default(now())
  dueAt DateTime                            // días hábiles CO, calculados en shared
  extendedDueAt DateTime?
  extensionReason String? @db.VarChar(500)
  infoRequestedAt DateTime?                 // reclamo incompleto: desiste a los 2 meses
  legendDueAt DateTime?                     // HD_RECLAMO: recibido + 2 días hábiles
  legendAppliedAt DateTime?
  forwardedAt DateTime?                     // QUEJA_CONTRA_DJ / traslado
  respondedAt DateTime?
  closedAt DateTime?
  ipHash String? @db.Char(64)
  @@index([status, dueAt])
  @@index([requesterEmail])
  @@index([closedAt])
}

model ContentReport {
  id String @id @default(cuid())
  radicado String @unique @db.VarChar(20)   // RP-AAMMDD-XXXXXX
  profileId String @db.VarChar(30)
  targetType String @db.VarChar(16)         // PROFILE | GALLERY_ITEM | EVENT_FLYER | MEMBER | TEXT
  targetId String? @db.VarChar(30)
  reason String @db.VarChar(32)             // validado contra REPORT_REASONS de shared
  urgent Boolean                            // derivado del motivo
  reporterRole String @db.VarChar(20)
  reporterName String? @db.VarChar(120)
  reporterEmail String? @db.VarChar(254)
  shareIdentity Boolean @default(false)
  description String @db.VarChar(3000)
  status ReportStatus @default(NUEVO)
  firstReviewDueAt DateTime                 // +2 días hábiles (urgente: +24 h)
  djNotifiedAt DateTime?
  djResponseDueAt DateTime?                 // +5 días hábiles
  decisionDueAt DateTime                    // +15 días hábiles
  decidedAt DateTime?
  decisionReason String? @db.VarChar(1000)
  decidedById String? @db.VarChar(30)
  ipHash String? @db.Char(64)
  createdAt DateTime @default(now())
  @@index([status, firstReviewDueAt])
  @@index([profileId])
}

model CaseEvent {                           // trazabilidad de PQRS y reportes (L1480 art. 50 lit. g); solo inserción
  id String @id @default(cuid())
  caseType CaseType
  caseId String @db.VarChar(30)
  kind String @db.VarChar(32)               // CREATED, ACK_SENT, INFO_REQUESTED, EXTENDED, LEGEND_APPLIED, FORWARDED_TO_DJ,
                                            // REGISTRY_DISCLOSED, CONTENT_HIDDEN, DJ_NOTIFIED, RESPONDED, DECIDED, CLOSED, NOTE
  publicNote String? @db.VarChar(1000)      // visible en el seguimiento
  internalNote String? @db.VarChar(2000)
  actorId String? @db.VarChar(30)
  createdAt DateTime @default(now())
  @@index([caseType, caseId, createdAt])
}
```

**Cambios en modelos existentes:**
- **`BookingRequest`:**
  - `+ claimPqrsId String? @db.VarChar(30)`: leyenda "reclamo en trámite" y retención legal; el job de purga no toca esas filas.
  - `- userAgent`.
  - `consentAt` y `consentVersion` quedan solo para mostrarlos en la bandeja; la prueba real está en `ConsentRecord`.
- **`User`:** `+ claimPqrsId String?`; `- termsVersion`, `- termsAcceptedAt`.
- **`GalleryItem`, `Event`, `Member`:** `+ moderationHiddenAt DateTime?`. `PublicProfileResolver` los filtra.
- **`DjProfile`:**
  - `+ statusCause String? @db.VarChar(32)`, validada contra `SUSPENSION_CAUSES`.
  - [OPC] `+ publicLegalName String? @db.VarChar(120)`.
  - La media de fotos se oculta si el último `PHOTOS_SENSITIVE` del dueño tiene `granted=false`.
- **Permisos en la BD** (en el `grants.sql` de c-1 L6): el usuario de la app solo tiene `SELECT, INSERT` sobre `ConsentRecord` y `CaseEvent`, más `UPDATE (subjectEndedAt)` sobre `ConsentRecord`. La purga corre con el CLI de operaciones.

**`packages/shared/src/legal/` (nuevo):**
- `documents.ts`: `LEGAL_DOCS` (clave, título, versión, fecha de vigencia, `templateSha256`, `requiresReacceptance`, resumen de cambios). Un test en vitest compara el sha256 de `legal/*.md` con este archivo, así que un cambio de texto sin subir la versión rompe la CI.
- `consent-texts.ts`: `CONSENT_TEXTS[purpose] = { version, template }` y `renderConsentLabel()`.
- `business-days.ts`: `colombianHolidays(year)` según L51/83 art. 1 (fijos, trasladables al lunes y los que dependen de la Pascua), más `addBusinessDaysCO()` y `businessDaysLeft()`, en zona America/Bogota.
  - Criterio: lunes a viernes sin festivos (L4/1913 art. 62 [S]).
  - [NV]: si el sábado cuenta como día hábil para particulares, y el día desde el que empieza el conteo (se usa el siguiente día hábil). Por eso las alertas se disparan con 2 días de margen.
- `deadlines.ts`: `PQRS_DEADLINES` y `REPORT_DEADLINES`.
- `retention.ts`: `RETENTION` (ver 5.4).
- `pqrs-types.ts`, `report-reasons.ts` (con `urgent`), `suspension-causes.ts`.
- `limits.ts`: `retention.bookingMonths = 12`.
- `slug.ts`: se agregan `pqrs` y `reportar`.

Las plantillas Markdown viven en la raíz del repo, en `legal/*.md`. El Dockerfile de la API las copia a la imagen.

---

## 4. Endpoints de la API

Nuevo módulo `api/src/legal/` con: `legal-docs.service` (sincronización al arrancar), `consent.service`, `pqrs/`, `reports/`, `registry/` y `data-subjects/`.
- **Al arrancar:** para cada entrada de `LEGAL_DOCS`, renderiza con `OPERATOR_*` e inserta la versión si no existe. Si ya existe con otro `renderedSha256`, el arranque **falla** con el mensaje "subir versión".
- **Validación de entorno (joi):** con marcadores en la identidad, `REGISTRATION_OPEN` y `SEO_INDEXABLE` deben ser `false`.

| Método y ruta | Guard y límite | Contrato |
|---|---|---|
| GET `/api/public/legal` | PUB, caché 1 h | `{ operator:{…}, docs:[{key,title,version,effectiveAt,sha256,url}], consentTexts:{purpose:{version,template}}, ready:boolean }`. `privacyPolicyVersion` se mantiene en `/public/meta` |
| GET `/api/public/legal/:key` · `/:key/versions` · `/:key/v/:version` | PUB, caché 1 h | Markdown renderizado. La web lo muestra con react-markdown sin HTML crudo; nunca con `dangerouslySetInnerHTML` |
| POST `/api/public/djs/:slug/booking-requests` (existente) | + `consents:{bookingData:true, bookingTerms:true}`, `consentTextVersion` | Guarda la solicitud y 2 `ConsentRecord` en la misma transacción. 409 `LEGAL_VERSION_STALE` si la versión no coincide; 503 `LEGAL_NOT_READY` si la identidad está incompleta |
| POST `/api/public/pqrs` | PUB, 5/h por IP, token de formulario (reusa `FormTokenService` con claim `purpose:'pqrs'`), honeypot; límite también en el edge | `{type,…,consent:true}` → 201 `{radicado, receivedAt, dueAt}`. Correo de acuse **sin repetir el texto libre** |
| GET `/api/public/pqrs/:radicado?t=` | PUB, 10/h por IP | `{type,status,receivedAt,dueAt,events:[{kind,publicNote,createdAt}]}` |
| POST `/api/public/reports` | PUB, 5/h por IP, token y honeypot | → 201 `{radicado}`. Si es urgente, correo inmediato al admin |
| POST `/api/auth/register` (existente) | + `consents:{age18,termsArtist,dataArtist,contentRights,marketing?}`, `legalVersions` | Sin las 4 casillas en `true`, 400. Crea 4 o 5 `ConsentRecord` y envía un correo al DJ con versiones y enlaces (L1480 art. 50 lit. e) |
| GET `/api/auth/me` (existente) | AUTH* | + `legal:{pending:[{key,version,title,changeSummary,requiresConsent}], photos:boolean}` |
| POST `/api/me/legal/accept` | AUTH*, 10/h | `{items:[{key,version}]}` → `ConsentRecord` |
| POST `/api/me/legal/consents` | AUTH | `{purpose: PHOTOS_SENSITIVE\|PROMO_IMAGE\|MARKETING_EMAIL, granted}`; revocar crea una fila nueva y oculta las fotos |
| GET/PUT `[me\|adm]/legal-registry` (montado dos veces: `/api/me/legal-registry` y `/api/admin/profiles/:profileId/legal-registry`) | OWN / ADM (el GET del admin queda auditado: `admin.registry.view`) | PUT exige `truthDeclaration:true`. `profile/submit` y `admin approve` responden 409 `REGISTRY_INCOMPLETE` o `LEGAL_PENDING` si falta algo |
| GET `/api/admin/pqrs?status&type&due=overdue\|soon` | ADM | Filas con `businessDaysLeft` y `semaphore` (verde con más de 3; amarillo de 1 a 3; rojo vencido) |
| GET `/api/admin/pqrs/:id` | ADM (auditado) | Detalle y eventos |
| POST `/api/admin/pqrs/:id/{request-info\|extend\|apply-legend\|forward-to-dj\|respond\|close}` | ADM | Cada acción crea un `CaseEvent` y envía el correo que corresponda. `apply-legend {bookingIds[],userId?}` llena `claimPqrsId`. `extend` exige motivo y solo procede antes del vencimiento |
| POST `/api/admin/registry/:profileId/disclose` | ADM + contraseña y TOTP recientes | `{pqrsId}` → datos del registro, `CaseEvent REGISTRY_DISCLOSED` y auditoría (art. 53) |
| GET `/api/admin/reports`, POST `/:id/{hide\|notify-dj\|decide}` | ADM | `hide` llena `moderationHiddenAt` o suspende el perfil; `decide {decision, reason}` |
| GET `/api/admin/data-subjects?email=&phone=` | ADM (auditado) | Solicitudes, usuarios, PQRS y consentimientos del titular (por `contactEmail`, `contactPhone` y `subjectRef`) |
| POST `/api/admin/data-subjects/erase` | ADM + contraseña y TOTP recientes | `{bookingIds[], userId?, pqrsId}` → borrado, `subjectEndedAt` en sus consentimientos y `CaseEvent` |
| GET `/api/admin/legal/acceptance-stats` | ADM | Por versión: cuántos DJs aceptaron o están pendientes |

**Tests e2e nuevos** (se suman a la matriz de guards y a las pruebas de IDOR):
- El registro de oferente nunca aparece en `/api/public/*`.
- Un DJ no puede leer el registro ni las PQRS de otro.
- `consent:false` o falso → 400.
- Un documento cambiado sin subir la versión hace fallar el arranque.

---

## 5. Procesos

### 5.1 PQRS y habeas data
Un solo responsable: Fernando, como "Atención de datos personales, {HABEAS_DATA_EMAIL}" (D1377 art. 23). Las PQRS que llegan por correo se registran a mano en el admin para generar el radicado.

| Tipo | Plazo | Pasos |
|---|---|---|
| HD_CONSULTA | 10 días hábiles, +5 informando el motivo (L1581 art. 14) | Verificar que el correo coincida con el titular → buscar sus datos (`data-subjects`) → responder con los datos y las finalidades |
| HD_RECLAMO / REVOCATORIA (actualizar, rectificar, suprimir) | 15 días hábiles, +8 (L1581 art. 15) | 1) Si está incompleto, pedir que se complete dentro de los 5 días y dar por desistido a los 2 meses. 2) **Leyenda en 2 días hábiles** (`apply-legend`), que además frena la purga. 3) Ejecutar. 4) Si hay solicitudes afectadas, pedir al DJ que borre las copias que exportó (Términos para Artistas, anexo). 5) Responder y quitar la leyenda |
| Supresión de la cuenta de un DJ | como reclamo; v1 la ejecuta el admin (plan, fase 2) | Borrar usuario, perfil, media y solicitudes en cascada. Llenar `subjectEndedAt`. El registro del art. 53 se conserva 12 meses [NV/ABOGADO]. No procede si hay un deber legal de conservar (D1377 art. 9) |
| Supresión de un solicitante (no usuario) | como reclamo | Buscar por correo o teléfono → borrar sus solicitudes → avisar al DJ |
| PETICIÓN / QUEJA_PLATAFORMA | 15 días hábiles (L1755 art. 32 [S]; L1480 art. 58 num. 5, paráfrasis) | Responder por el servicio de la plataforma |
| DATOS_OFERENTE (art. 53) | La ley no fija plazo; se aplican 15 días hábiles (criterio propio) | Verificar que quien pide contrató al DJ (número de solicitud o mismo correo, más una declaración) → `disclose` → responder |
| QUEJA_CONTRA_DJ | reenvío en 2 días hábiles (criterio propio) | Reenviar al DJ y entregar sus datos si se piden. **Fersua no decide.** Cerrar como TRASLADADA (Concepto SIC 22-51097) |
| Traslado por falta de competencia | 2 días hábiles (L1581 art. 15) | Avisar al solicitante |

**Alerta diaria** a las 08:00 hora de Bogotá, por correo al admin: PQRS que vencen en 2 días hábiles o menos, PQRS vencidas, leyendas pendientes y reportes sin primera revisión. Los correos legales tienen prioridad sobre el presupuesto diario de la cola de correo.

### 5.2 Reportes y retiro de contenido
1. Acuse inmediato con el radicado.
2. **Casos urgentes** (sexual con menores, imágenes íntimas, suplantación evidente, doxxing, amenazas, persona retratada que revoca su consentimiento): se oculta en menos de 24 h con `hide`.
   - Si hay menores: conservar la evidencia en `quarantine/` con acceso restringido y **denunciar** (Ley 679/2001 art. 8 [S]).
   - Revocación de la persona retratada: base T-634/13 y L23/82 art. 87.
3. **Casos no manifiestos** (derechos de autor, marca): `notify-dj`; el DJ tiene 5 días hábiles para responder con pruebas.
4. Decisión motivada en 15 días hábiles o menos: mantener, ocultar o retirar. Se admite una reconsideración dentro de 5 días hábiles.
5. **Reincidencia:** 3 retiros justificados en 12 meses llevan a la suspensión por causal tasada.
6. **Suspensión:** aviso previo y 5 días hábiles para responder, salvo causal urgente. Siempre con `statusCause`, motivo y correo al DJ. Todo queda en AuditLog.

### 5.3 Incidentes de seguridad
1. Detectar y contener: revocar sesiones (`tokenVersion++`) y rotar secretos.
2. Evaluar el alcance.
3. **Reportar a la SIC en 15 días hábiles o menos** desde la detección, en el módulo "Reporte de Incidentes" (L1581 art. 17 lit. n; Concepto SIC 21-17773). También aplica a quien no está inscrito en el RNBD.
4. Avisar a los titulares afectados [REC]. La L1581 no lo exige expresamente [NV].
5. Revisión posterior en `docs/legal/incidentes.md` y en AuditLog (`security.incident`).
6. **Claves HMAC:** conservar las claves anteriores (`ipKeyVersion`). Si se pierden, la IP ya no sirve como prueba.

### 5.4 Retención
Jobs diarios a las 03:00, hora de Bogotá, en `api/src/jobs/maintenance.jobs.ts`. Todos respetan `claimPqrsId`.

| Dato | Plazo | Base |
|---|---|---|
| BookingRequest | 12 meses, luego borrado definitivo; SPAM a los 30 días | finalidad cumplida (D1377 art. 11) |
| ConsentRecord | mientras dure el tratamiento + **3 años** desde `subjectEndedAt` (en solicitudes: su creación + 12 meses + 3 años) | CPACA art. 52 (caducidad de 3 años) + responsabilidad demostrada (D1377 arts. 26-27). [ABOGADO] |
| Pqrs, ContentReport, CaseEvent | 3 años desde el cierre | CPACA art. 52 [ABOGADO] |
| DjLegalRegistry | 12 meses desde `closedAt` | [NV/ABOGADO]: el art. 53 no fija plazo |
| AuditLog | 24 meses | plan / c-1 |
| Borradores y cuentas no verificadas | 30 / 14 días | plan (c-1 H3) |
| Logs de nginx | 14 días | c-1 M12 |
| Respaldos | 14 días los diarios / 8 semanas los semanales; se declara que un borrado llega a los respaldos en 8 semanas o menos | D1377 art. 11 |
| Datos de prueba de beta | se purgan antes del cambio de DNS, incluidos sus ConsentRecord | plan M4 |

### 5.5 Cambio de versión de un documento
1. Editar `legal/<doc>.md` y subir la versión y el hash en `LEGAL_DOCS`, con fecha de vigencia al menos 15 días después.
2. Correo a los DJs y banner en el panel.
3. En la fecha de vigencia se activa el modal bloqueante.
4. **Solicitantes (no son usuarios):** la nueva versión solo aplica a solicitudes nuevas. Si cambia la finalidad, las solicitudes anteriores no se usan para la nueva finalidad (D1377 art. 5).

---

## 6. Clasificación

| Ítem | Clasif. | Base | Dueño / abogado |
|---|---|---|---|
| Política con identidad real, derechos, procedimiento y vigencia | REQ | D1377 art. 13 | DUEÑO + ABOGADO |
| Aviso de privacidad en cada formulario | REQ | D1377 arts. 14-15; L1581 art. 12 | DUEÑO |
| Casilla de datos del booking, sin marcar, con prueba | REQ | L1581 arts. 9 y 17 lit. b; Res. SIC 76538 | — |
| Casillas separadas en el registro (T&C / datos / 18+ / derechos sobre contenido) | REQ para datos y T&C; REC para la separación 18+ y derechos | L1581 art. 9; L527 art. 14; L1480 art. 37 | ABOGADO (textos) |
| Autorización aparte y opcional para fotos | REQ si hay fotos de personas | D1377 art. 6; Guía SIC | ABOGADO (fotos de integrantes con solo la declaración del DJ) |
| Autorización de transferencia al exterior | REQ si el país del VPS o del SMTP no es "adecuado" | L1581 art. 26 | DUEÑO (país) |
| Canal de habeas data con plazos | REQ | L1581 arts. 14-15; D1377 arts. 21 y 23 | DUEÑO (correo) |
| Formulario PQRS con radicado, fecha, hora y seguimiento | REQ si aplica el art. 50; si no, REC | L1480 art. 50 lit. g (L2439 art. 4) | — |
| Leyenda "reclamo en trámite" | REQ | L1581 art. 15 | — |
| Identidad del operador en el footer y en el aviso legal | REQ si aplica el art. 50 a Fersua; en todo caso REC | L1480 art. 50 lit. a | DUEÑO |
| Enlace a la SIC | REQ si aplica el art. 50; en todo caso REC | L1480 art. 50 parágrafo | — |
| Registro privado de oferentes y bloqueo de la aprobación | **REQ** | L1480 art. 53 | ABOGADO (retención) |
| Aviso de intermediación | REQ para mantener la calidad de portal | Concepto SIC 22-51097 | ABOGADO |
| Términos de uso y T&C para artistas sin cláusulas abusivas | REQ si se exigen | L1480 arts. 42-43; CGP art. 28.3; CC arts. 1522 y 63 | ABOGADO |
| Nueva aceptación ante cambios sustanciales | REQ | L1480 art. 38; D1377 art. 5 | — |
| ConsentRecord de solo inserción + LegalDocumentVersion | REQ (prueba y conservación del modelo) | L1581 art. 17 lit. b; D1377 arts. 8 y 16; L527 art. 12 | — |
| Retención de 12 meses automática | REQ (plazo declarado) | D1377 art. 11 | — |
| Reporte de incidentes a la SIC en 15 días hábiles | REQ | L1581 art. 17 lit. n; Concepto SIC 21-17773 | — |
| Manual interno | REQ | L1581 art. 17 lit. k | ABOGADO |
| Reportar / takedown | REC (y REQ para contenido sexual con menores) | SU-420/19; Ley 679 [S] | — |
| Banner de cookies | NO requerido con solo cookies técnicas | L1581 arts. 3 y 10 | — |
| Cifrado del documento en el registro, fecha de nacimiento, casilla de portal en el booking | REC | — | — |
| "Responsable del servicio" en la página del DJ, uso promocional, casilla de marketing | OPC | — | ABOGADO [NV] |
| RNBD | No aplica por debajo de 100.000 UVT | Decreto 090/2018 | DUEÑO (activos) |

---

## 7. Hitos

**M1: sitio público en booking.fersuastudio.com.** El formulario ya recibe datos reales, así que:
- Identidad `OPERATOR_*` real, o el formulario queda apagado por la regla `LEGAL_NOT_READY`. [DUEÑO]
- Publicar `/legal/privacidad` (con #cookies), `/legal/aviso-privacidad`, `/legal/terminos` y `/legal/aviso-legal`, en versión "1.0-beta" con fecha.
- `LegalFooter` completo en `/` y `/:slug`, con el bloque del DJ.
- Casillas y aviso del booking. `ConsentRecord` y `LegalDocumentVersion`.
- `RETENTION.bookingMonths=12`.
- Canal de habeas data por correo (buzón creado en hPanel). [DUEÑO]
- "Reportar este perfil" como `mailto:` como mínimo.
- **Mac Fly:** autorización escrita de los dos integrantes (`OFFLINE_DOCUMENT`) y registro del art. 53, cargados con `seed:macfly --legal-file` desde un archivo que no está en git. [DUEÑO]
- País del VPS confirmado. [DUEÑO]

**M2: admin.**
- Formularios públicos de PQRS y reportes con radicado y seguimiento.
- Bandejas del admin con semáforo, alerta diaria y `CaseEvent`.
- `data-subjects` (buscar y borrar), `disclose` del registro, `apply-legend`.
- `moderationHiddenAt` y suspensión con causales.
- Jobs de retención.
- Auditoría de las vistas del admin sobre solicitudes y registros.
- Manual interno y procedimiento de incidentes en `docs/legal/`.

**M3: registro de DJs.**
- `/legal/terminos-artistas`.
- Las 4 casillas obligatorias del registro, más la de marketing si aplica.
- Correo de confirmación con versiones.
- Autorización de fotos en la primera subida.
- `DjLegalRegistry` en el panel y bloqueo de "enviar a revisión" y de la aprobación.
- Modal de nueva aceptación y `legal.pending` en `/me`.
- Cuenta › Legal (aceptaciones, revocaciones, solicitar supresión).
- Etiqueta "reclamo en trámite" en la bandeja.
- Tests e2e de consentimientos e IDOR del registro.
- Tabla de cookies actualizada con `__Host-rt` y `__Host-kd`.

**M4: antes del cambio de DNS.**
- **Revisión de un abogado** de todos los textos.
- Versiones 1.0 definitivas, publicadas con 15 días de aviso a los DJs de beta y nueva aceptación.
- Sección de transferencias cerrada: país del VPS y del SMTP y DPA de Hostinger. [NV]
- Purgar los datos de prueba de beta y sus consentimientos.
- Check de CI "sin marcadores `[PENDIENTE`" como requisito para `SEO_INDEXABLE=true`.
- Revisar que el enlace a la SIC y el footer aparezcan en todas las rutas.
- Dejar documentado que no aplica el RNBD.

**Pendientes y NO VERIFICADO:**
- País del VPS y del SMTP.
- Si el sábado cuenta como día hábil, y cómo se computa el primer día.
- Retención del registro del art. 53.
- Si basta la declaración del DJ para las fotos de sus integrantes.
- Si el art. 50 aplica a Fersua y a cada DJ.
- Validez de la indemnidad.
- Estado del proyecto de reforma de la L1581 (PL 274/2025C).
- Posibles cambios de 2026 al numeral 3.2 de la Circular Única de la SIC.

### Critical Files for Implementation
Todos por crear, salvo los diseños, que deben corregirse según la sección 0:
- `C:\Fernando\Desarrollo\hostinger\fersuastudio-booking\api\prisma\schema.prisma`
- `C:\Fernando\Desarrollo\hostinger\fersuastudio-booking\packages\shared\src\legal\` (`documents.ts`, `consent-texts.ts`, `business-days.ts`, `deadlines.ts`, `retention.ts`)
- `C:\Fernando\Desarrollo\hostinger\fersuastudio-booking\api\src\legal\` (`legal-docs.service.ts`, `consent.service.ts`, `pqrs/`, `reports/`, `registry/`, `data-subjects/`) y `api\src\jobs\maintenance.jobs.ts`
- `C:\Fernando\Desarrollo\hostinger\fersuastudio-booking\web\src\public\legal\` (`LegalFooter.tsx`, `LegalPage.tsx`, `PqrsForm.tsx`, `ReportDialog.tsx`) y `web\src\public\BookingForm.tsx`
- Diseños que hay que corregir:
  - `C:\Users\ASUS\AppData\Local\Temp\claude\C--Fernando-Desarrollo-Personal-FersuaStore-Dashboard\7001a633-9002-4a49-913a-6a3a2560edb9\scratchpad\d-data.md`: retención de 24 a 12, `ConsentRecord`, slugs.
  - `d-backend.md`: `BOOKING_RETENTION_MONTHS`, DTOs de registro y booking.
  - `d-frontend.md`: §217, §284, §464.
  - `C:\Users\ASUS\.claude\plans\ahora-s-te-cuento-resilient-snowglobe.md`: alcance legal de M1 a M4.

**Fuentes verificadas en esta sesión:**
- [CPACA art. 52](https://www.alcaldiabogota.gov.co/sisjur/normas/Norma1.jsp?i=41249)
- [Ley 51/1983 art. 1](https://www.alcaldiabogota.gov.co/sisjur/normas/Norma1.jsp?i=4954)
- [Ley 2439/2024 art. 4](https://www.alcaldiabogota.gov.co/sisjur/normas/Norma1.jsp?i=171718)
- [Ley 4/1913 art. 62 (Función Pública)](https://www.funcionpublica.gov.co/eva/gestornormativo/norma.php?i=8426) [S]