# Informe legal: comercio electrónico, protección al consumidor y plataformas (Fersua Studio)

**Fuentes y cómo se consultaron.** Probé secretariasenado.gov.co, funcionpublica.gov.co, suin-juriscol.gov.co y www.sic.gov.co. Las cuatro fallaron por errores de conexión o de certificado TLS. En su lugar usé fuentes oficiales equivalentes:
- Régimen Legal de Bogotá (alcaldiabogota.gov.co).
- Normograma MinTIC y Normograma SENA.
- Sede Electrónica de la SIC (sedeelectronica.sic.gov.co). De ahí descargué los PDF de la Circular Única y de los conceptos SIC y extraje el texto con Node (solo lectura).

El texto de la ley que va entre comillas es literal. Donde no lo es, lo indico como paráfrasis.

URLs base:
- **Ley 1480 de 2011:** https://www.alcaldiabogota.gov.co/sisjur/normas/Norma1.jsp?i=44306 y https://normograma.mintic.gov.co/mintic/compilacion/docs/ley_1480_2011.htm
- **Ley 2439 de 2024** (Diario Oficial 52.975, 19-dic-2024): https://www.alcaldiabogota.gov.co/sisjur/normas/Norma1.jsp?i=171718
- **Ley 527 de 1999:** https://www.alcaldiabogota.gov.co/sisjur/normas/Norma1.jsp?i=4276

---

## 0. Calificación previa (define todo lo demás)

- **Quién es consumidor.** El art. 5 num. 3 de la Ley 1480 dice que es consumidor quien adquiere un producto como destinatario final, *"cuando no esté ligada intrínsecamente a su actividad económica"*.
  - Los clientes privados (bodas, fiestas) **sí** son consumidores.
  - Promotores y discotecas que contratan un DJ para su negocio **probablemente no** lo son (paráfrasis del mismo numeral).
  - La plataforma debe diseñarse suponiendo que sí hay consumidores.
- **Los servicios cuentan como "producto".** Art. 5 num. 8: *"Producto: Todo bien o servicio."*
- **El DJ es proveedor.** Art. 5 num. 11: proveedor es *"Quien de manera habitual, directa o indirectamente, ofrezca, suministre, distribuya o comercialice productos con o sin ánimo de lucro."*
- **Los DJs también son consumidores de la plataforma.** El Concepto SIC 21-171791 de 2021 dice: *"Los usuarios de plataformas de comercio electrónico (sea como comprador o vendedor) son consumidores de un servicio"*. Por eso los Términos con los DJs también quedan sujetos a las reglas de cláusulas abusivas. https://sedeelectronica.sic.gov.co/publicaciones/boletin-juridico/boletin/todo-usuario-de-una-plataforma-de-comercio-electronico-esta-protegido-por-los-derechos-del-consumidor

---

## 1. Art. 53 Ley 1480: portales de contacto — **SÍ aplica**

**Texto literal (vigente, sin modificaciones):**
> "ARTÍCULO 53. PORTALES DE CONTACTO. Quien ponga a disposición una plataforma electrónica en la que personas naturales o jurídicas puedan ofrecer productos para su comercialización y a su vez los consumidores puedan contactarlos por ese mismo mecanismo, deberá exigir a todos los oferentes información que permita su identificación, para lo cual deberán contar con un registro en el que conste, como mínimo, el nombre o razón social, documento de identificación, dirección física de notificaciones y teléfonos. Esta información podrá ser consultada por quien haya comprado un producto con el fin de presentar una queja o reclamo y deberá ser suministrada a la autoridad competente cuando esta lo solicite."

**Nueva definición legal (art. 6 Ley 2439 de 2024, que agrega el num. 18 al art. 5):**
> "18. Portal de Contacto: Toda plataforma electrónica dispuesta por personas naturales o jurídicas que pone en contacto a proveedores o productores con consumidores a través de la cual se podrá concretar la relación de consumo directamente entre el consumidor y el productor o el proveedor."

Fersua Studio encaja: los DJs publican su oferta y el público los contacta por el formulario y por WhatsApp.

**Condiciones para mantenerse como portal de contacto y no responder por el servicio del DJ.** Fuentes: Concepto SIC 22-51097 del 23-feb-2022 y Concepto SIC 20-257928 (fecha según la Sede: 28-dic-2020). Ambos citan la Sentencia SIC 16593 del 26-dic-2019. Según esos conceptos, el portal debe:
1. Demostrar que actúa como mero intermediario.
2. Permitir que el consumidor contacte al oferente a través de su sistema.
3. Dar la alternativa de cerrar el negocio por fuera de la plataforma.
4. Acreditar que no tiene un rol fundamental en la operación ni en sus condiciones.
5. Informar *"de manera clara, veraz, suficiente, oportuna y verificable, que actúa como un mero intermediario, así como los efectos de esta situación"* (Concepto 22-51097).

Si cumple, el portal *"no podrá entrar a responder ante los consumidores por lo eventuales inconvenientes que se presenten con los bienes o servicios comercializados"* (Concepto 22-51097).
- PDF 22-51097: https://sedeelectronica.sic.gov.co/sites/default/files/boletin-juridico/conceptos/2251097%20Consumidor.pdf
- PDF 20-257928: https://sedeelectronica.sic.gov.co/sites/default/files/boletin-juridico/conceptos/20257928.pdf

**Señales de alerta: con estas conductas la SIC trata al portal como plataforma de comercio electrónico y le aplica el art. 50 completo.** Fuente: Concepto 22-51097, que cita las Res. SIC 40212/2019, 50536/2015, 55912/2016, 65205/2020 y 65397/2020.
- Cobrar un porcentaje de lo transado. Evitarlo: cobrar a los DJs, si acaso, una tarifa fija y nunca comisión por reserva.
- Participar en el pago.
- Emitir publicidad propia y de los aliados.
- Modificar precios, o hacer promociones y ofertas.
- Decidir garantías.
- Ser *"la única cara visible"* frente al consumidor.
- *"Atiende de forma directa las PQRS"* de la relación de consumo.
- Encargarse de la reversión de pagos.
- No dar información suficiente para contactar al proveedor.

Aprobar o suspender páginas es moderación de contenido y no aparece en esa lista. Aun así, el admin no debe decidir reclamos entre el DJ y su cliente.

**Registro de oferentes (obligatorio antes de publicar):**
- **Campos mínimos de ley:** nombre o razón social, tipo y número de documento (CC, CE, PPT, pasaporte o NIT), dirección física de notificaciones con ciudad, y uno o más teléfonos. Recomendado además: correo.
- **Dúos:** el registro debe identificar a un **titular responsable**, persona natural o empresa. Los datos de cada integrante son opcionales. Criterio propio: la ley habla de "oferentes".
- **Bloqueo en el producto:** una página no se puede aprobar ni publicar sin el registro completo, porque la ley dice "deberá exigir a todos los oferentes". Añadir una declaración de veracidad y el deber del DJ de mantener los datos actualizados.
- **Quién puede consultarlo:**
  - *Quien haya comprado* (contratado) al DJ, **solo para presentar una queja o reclamo**. Como el contrato se cierra por fuera de la plataforma, se verifica con el número de solicitud de reserva o el mismo correo, más una declaración. Cada entrega de datos queda registrada.
  - La *autoridad competente* cuando lo pida.
  - El registro **no** es público.
- **Cruce con protección de datos:** la autorización de datos del DJ debe prever esta entrega (tema Ley 1581, fuera del alcance de este informe).
- **Plazo de conservación del registro: NO VERIFICADO.**

---

## 2. Art. 50: deberes de información en comercio electrónico

**Literal a), texto literal:**
> "Informar en todo momento de forma cierta, fidedigna, suficiente, clara, accesible y actualizada su identidad especificando su nombre o razón social, Número de Identificación Tributaria (NIT), dirección de notificación judicial, teléfono, correo electrónico y demás datos de contacto."

La Ley 2439 de 2024 (art. 4) modificó los literales b), g) y h). El a) y el parágrafo siguen iguales.

**A quién aplica:**
- **Al operador, sí, respecto de su propio servicio de plataforma** (sobre todo frente a los DJs, que son consumidores de ella según el Concepto 21-171791). El art. 50 cubre a "proveedores y expendedores ubicados en el territorio nacional que ofrezcan productos utilizando medios electrónicos", y proveedor incluye actuar "sin ánimo de lucro". También funciona como seguro por si la SIC recalifica a la plataforma.
- **Debe verse en todas las páginas (footer y página "Aviso legal"):** nombre o razón social, NIT (la persona natural necesita RUT/NIT), dirección de notificación judicial en Medellín, teléfono y correo.
- **Otros literales del art. 50 que aplican al operador:**
  - d): Términos publicados "en todo momento", fáciles de consultar, imprimir y descargar; aceptación "expresa, inequívoca y verificable".
  - e): prueba en soporte duradero.
  - f): seguridad (paráfrasis: "El proveedor responde por fallas en seguridad").
  - g): canales de PQR.
  - parágrafo: enlace a la SIC.
- **A cada DJ:** en sentido estricto, como proveedor que ofrece por medios electrónicos, el art. 50 a) podría aplicarle. La doctrina SIC sobre portales solo exige al portal pedir los datos y permitir el contacto. **NO VERIFICADO** si la SIC exige que el vendedor dentro de un portal de contacto publique su NIT y dirección.
  - Recomendación (criterio propio): en cada página de DJ mostrar "Responsable del servicio: [nombre o razón social]". Así el DJ es visible como la cara del servicio.
  - Documento y dirección, bajo solicitud (art. 53). NIT visible solo si el DJ lo elige.
  - Si el DJ publica tarifas: en pesos colombianos (COP), con el precio total impuestos incluidos (art. 50 c, paráfrasis).

---

## 3. Enlace visible a la SIC

- **Base legal: art. 50, parágrafo (literal):**
  > "El proveedor deberá establecer en el medio de comercio electrónico utilizado, un enlace visible, fácilmente identificable, que le permita al consumidor ingresar a la página de la autoridad de protección al consumidor de Colombia."
- **Circular Única SIC, Título II** (versión Circular 001 del 9-ene-2026, Diario Oficial 53.362): revisé el índice y el texto completo del PDF. **No tiene un capítulo de comercio electrónico ni de portales de contacto, ni instrucción de logo o formato para ese enlace.** La única mención encontrada es sectorial: el numeral 2.9.1.2 (receptores de TV) exige un vínculo *"en el home o página de inicio del sitio web, contiguo al vínculo de la Superintendencia de Industria y Comercio"*. Eso muestra que la SIC da por hecho ese vínculo en la página de inicio, pero no aplica a Fersua de forma directa.
  - Página: https://sedeelectronica.sic.gov.co/transparencia/normativa/titulo-ii-actualizado-el-9-de-enero-de-2026
- **SIC Facilita:** es voluntario. Los proveedores "voluntariamente gestionan acuerdos" (fuente: resultados de búsqueda sobre sedeelectronica.sic.gov.co; no abrí la página). **No encontré ninguna obligación de mostrarlo.**
- **Implementación:** en el footer de todas las páginas, incluida la de inicio, un enlace con el texto "Superintendencia de Industria y Comercio – www.sic.gov.co" hacia https://www.sic.gov.co. Opcional: enlace a las PQRSD de la SIC, https://sedeelectronica.sic.gov.co/atencion-y-servicios-a-la-ciudadania/peticiones-quejas-reclamos-y-denuncias. No usar el logo oficial sin necesidad; el texto basta.
- **Riesgo:** el art. 54 permite a la SIC bloquear el sitio como medida cautelar hasta 30 días, prorrogables 30 más, *"cuando existan indicios graves"*.

---

## 4. Aceptación de los Términos por checkbox y prueba

**Validez:**
- Ley 527, art. 14: *"En la formación del contrato, salvo acuerdo expreso entre las partes, la oferta y su aceptación podrán ser expresadas por medio de un mensaje de datos."*
- Ley 527, art. 15: *"No se negarán efectos jurídicos, validez o fuerza obligatoria a una manifestación de voluntad u otra declaración"* por constar en un mensaje de datos.
- Art. 7 (firma): basta un método que identifique al iniciador e indique su aprobación.
- Decreto 2364/2012, art. 1 num. 3 (compilado en el Decreto 1074/2015, art. 2.2.2.47.1): la firma electrónica incluye *"códigos, contraseñas, datos biométricos, o claves criptográficas privadas"*. Su art. 7 permite pactar el mecanismo. Por tanto, usuario, contraseña y checkbox son válidos. https://normograma.mintic.gov.co/mintic/compilacion/docs/decreto_2364_2012.htm
- Ley 1480, art. 37 (paráfrasis): el adherente debe haber sido informado de forma suficiente, anticipada y expresa, con redacción clara y en castellano. Si no, las condiciones son *"ineficaces"*.
- Ley 1480, art. 43 num. 9: es ineficaz la cláusula que *"presuma cualquier manifestación de voluntad del consumidor"*. Por eso **no sirve "al navegar aceptas"**.

**Diseño de la prueba** (Ley 527 art. 11 sobre confiabilidad, art. 12 sobre conservación accesible, en el formato original y con origen, destino, fecha y hora; Ley 1480 art. 50 e):
- Checkbox **sin marcar por defecto**, con enlace a la versión exacta. Checkboxes separados para: Términos, autorización de datos y "soy mayor de 18 años".
- Tabla de solo inserción `legal_acceptances` con: sujeto (DJ o solicitud de reserva), tipo de documento, `document_version`, `document_sha256`, texto exacto de la etiqueta del checkbox, `accepted_at` en UTC tomado del servidor, `ip_hmac`, user-agent y método ("checkbox").
- Archivo público inmutable de cada versión en una ruta del tipo `/legal/terminos/v/AAAA-MM-DD`.
- Correo de confirmación al DJ con la versión y el enlace.
- **HMAC de la IP:** sirve como prueba solo si se conserva la clave. Si se rota, hay que guardar las claves anteriores, o se pierde la posibilidad de verificar.
- **Cambios de Términos:** el art. 38 dice *"no se podrán incluir cláusulas que permitan al productor y/o proveedor modificar unilateralmente el contrato"*. Cada cambio sustancial exige aviso y nueva aceptación.
- **Plazo de conservación de la prueba:** mientras dure la relación más la prescripción. **NO VERIFICADO** el plazo exacto (por revisar: art. 28 Ley 962/2005 y art. 60 del Código de Comercio).

---

## 5. Retracto, devoluciones y cláusulas abusivas

**Retracto (art. 47).** Aplica a ventas "a distancia" de bienes y servicios que "no hayan comenzado a ejecutarse antes de cinco (5) días". El plazo es de *"cinco (5) días hábiles contados a partir de ... la celebración del contrato en caso de la prestación de servicios"*. En comercio electrónico, el reembolso debe hacerse en máximo 15 días calendario (texto de la Ley 2439/2024).

Fersua no vende ni cobra, así que **no le aplica**. Pero **un contrato entre un DJ y un cliente particular cerrado por WhatsApp puede ser una "venta a distancia"**: el art. 5 num. 16 y el art. 2.2.2.37.6 del Decreto 1074/2015 las definen *"a través de correo, teléfono, catálogo, comercio electrónico o ... cualquier otra técnica de comunicación a distancia"*. En ese caso el retracto recae **sobre el DJ**. Los Términos para DJs deben advertírselo.
- Decreto 1074, cap. 37: https://normograma.sena.edu.co/compilacion/docs/decreto_1074_2015_pr031.htm

**Redacción correcta (no niega derechos, los redirige):**
> "Fersua Studio es un portal de contacto (art. 53 Ley 1480 de 2011). No vende ni presta los servicios de DJ, no fija precios y no recibe pagos; por eso no gestiona retractos, devoluciones ni reversiones de pago. El contrato se celebra directamente entre tú y el DJ, quien responde por el servicio. Los derechos que te da la Ley 1480 de 2011 —incluido, cuando proceda, el retracto del art. 47— se ejercen frente al DJ. Si lo contrataste y quieres presentar una queja o reclamo, puedes pedirnos sus datos de identificación y notificación."

**Cláusulas ineficaces de pleno derecho (art. 43, literal).** Son ineficaces las que:
1. *"Limiten la responsabilidad del productor o proveedor de las obligaciones que por ley les corresponden"*.
2. *"Impliquen renuncia de los derechos del consumidor"*.
3. *"Inviertan la carga de la prueba en perjuicio del consumidor"*.
4. *"Trasladen al consumidor o un tercero que no sea parte del contrato la responsabilidad del productor o proveedor"*.
7. Den al proveedor la facultad de decidir unilateralmente si se cumplió (paráfrasis).
9. Presuman la voluntad del consumidor (paráfrasis).
11. Exijan más requisitos para terminar que para contratar (paráfrasis).
14. Renovación automática que impida terminar (paráfrasis; relevante si hay suscripción para DJs).

El num. 12 (arbitraje) fue *"derogado por el artículo 118 de la Ley 1563 de 2012"*. Por el art. 42 la cláusula es ineficaz y, por el art. 44, el resto del contrato subsiste.

- **Válido:** describir que la plataforma no es parte del contrato entre DJ y cliente ni garantiza la ejecución del DJ, porque de hecho no es el proveedor de ese servicio.
- **Ineficaz o arriesgado:**
  - "En ningún caso Fersua será responsable…" en términos absolutos. Agregar siempre: "sin perjuicio de las obligaciones legales de Fersua Studio como portal de contacto (registro de oferentes, seguridad de la información, veracidad sobre su rol, atención de PQR sobre su servicio)".
  - Renuncias a reclamar.
  - "El usuario deberá probar…".
  - Suspender cuentas de DJ "a entera discreción y sin aviso". En su lugar: causales objetivas, aviso previo y oportunidad de responder, salvo contenido ilícito urgente.

---

## 6. Publicidad engañosa (textos de DJs y de la plataforma)

- **Definición (art. 5 num. 13, literal):** *"Aquella cuyo mensaje no corresponda a la realidad o sea insuficiente, de manera que induzca o pueda inducir a error, engaño o confusión."*
- **Art. 29 (literal):** *"Las condiciones objetivas y específicas anunciadas en la publicidad obligan al anunciante"*.
- **Art. 30 (literal):** *"El anunciante será responsable de los perjuicios que cause la publicidad engañosa. El medio de comunicación será responsable solidariamente solo si se comprueba dolo o culpa grave."*
- **Art. 32:** el anunciante solo se exonera por fuerza mayor, caso fortuito o suplantación.
- **Circular Única, Título II, num. 2.1.1.1 c):** para juzgar si hay engaño se mira *"La naturaleza, características y derechos del anunciante, tales como su identidad y su patrimonio, sus cualificaciones ... o los premios que haya recibido o sus distinciones"*. Esto es justo lo que un DJ declara: residencias, premios, rankings, "headliner de…". El num. 2.1.1.2 A c) dice que las restricciones deben tener la misma notoriedad que la oferta.
- **Doctrina SIC 20-257928:** los usuarios que comercializan en la plataforma responden por su propia publicidad. La plataforma responde solo si actúa como anunciante.

Implementación:
- Cláusula para DJs: veracidad y soporte de sus afirmaciones, derechos sobre fotos y flyers, obligación de retirar contenido falso.
- Botón "Reportar contenido".
- Si hay insignia de "verificado", explicar qué se verificó.
- No usar afirmaciones propias no comprobables ("los mejores DJs de Colombia").
- Sección de "destacados" con criterio publicado, para evitar el indicador de "emite publicidad de sus aliados".

---

## 7. Canal de PQR

- **Art. 50 g) (texto de la Ley 2439/2024, literal):** canales *"de fácil acceso y de atención que garanticen la orientación y asistencia a los consumidores y la trazabilidad de las reclamaciones ... mediante la generación de un número de registro o radicado, junto con la fecha y hora de radicación ... incluyendo un mecanismo para su posterior seguimiento."* Obligatorio si hay comercio electrónico y recomendado de todos modos, porque los DJs son consumidores de la plataforma.
- **Plazos:**
  - Art. 58 num. 5 (paráfrasis de la fuente): el proveedor responde en *"quince (15) días hábiles"*.
  - Ley 1755/2015, arts. 14 y 32: 15 días para peticiones ante privados. https://www.alcaldiabogota.gov.co/sisjur/normas/Norma1.jsp?i=62152
- **Separar tipos de PQR:**
  - (a) Sobre el servicio de la plataforma: Fersua responde.
  - (b) "Solicitud de datos del DJ para queja o reclamo" (art. 53): Fersua entrega los datos del registro.
  - (c) Queja contra un DJ: Fersua **la remite al DJ** y entrega sus datos. **No decide** el reclamo, para no caer en el indicador de "atiende de forma directa las PQRS".
  - (d) Habeas data (Ley 1581, fuera del alcance).
- Cada PQR genera radicado, fecha y hora, correo automático y una página de seguimiento por radicado más correo.

---

## Checklist de cambios visibles

1. **Footer global:** identidad completa del operador (art. 50 a), enlaces a Términos, Privacidad, PQR y "Aviso de intermediación", y el enlace a la SIC.
2. **Página del DJ y formulario de reserva:** aviso de portal de contacto (condición v de la SIC) más "Responsable del servicio: …".
3. **Formulario de reserva:** checkbox "Entiendo que Fersua Studio es un portal de contacto y que el contrato se celebra directamente con el DJ", más la autorización de datos por separado.
4. **Registro del DJ:** checkboxes separados (Términos con versión, autorización de datos, mayor de 18). Registro art. 53 obligatorio antes de que el admin pueda aprobar.
5. **Módulo PQR** con radicado, fecha, hora y seguimiento; incluye el tipo "solicitud de datos del oferente".
6. **Tabla `legal_acceptances`** de solo inserción y archivo de versiones de los documentos.
7. **Términos para DJs:** retracto a cargo del DJ, veracidad publicitaria, precios en COP con impuestos, suspensión con causales objetivas y sin comisiones por reserva.

**NO VERIFICADO:**
- Si la SIC exige que cada DJ publique NIT y dirección en su página.
- Plazos de conservación del registro y de las aceptaciones.
- Monto actual de las multas del art. 61 (la fuente dio una cifra que no pude contrastar).
- Que no existan reformas posteriores a la Ley 2439/2024 y la Ley 2444/2025 (esta última es de turismo, no aplica).
- Fecha exacta del Concepto 20-257928.

---

### Archivos críticos para la implementación
En este repositorio (`C:\Fernando\Desarrollo\Personal\FersuaStore\Dashboard`, que es el dashboard de dropshipping) no está el código de la plataforma de DJs. La búsqueda de "booking" y "DJ" no encontró ese módulo. Los archivos de abajo son de referencia o están por crear:
- C:\Fernando\Desarrollo\Personal\FersuaStore\Dashboard\back\prisma\schema.prisma (referencia de patrón: modelos `DjLegalRegistry`, `LegalAcceptance`, `LegalDocumentVersion`, `Pqr` en el esquema del nuevo proyecto)
- C:\Fernando\Desarrollo\Personal\FersuaStore\Dashboard\docs\07-seguridad-infra.md (referencia para el HMAC de IP y la custodia de claves)
- (por crear) frontend: componente global de footer legal, página "Aviso de intermediación", página de Términos versionados
- (por crear) backend: endpoints de PQR con radicado y de solicitud de datos del oferente (art. 53)