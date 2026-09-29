# Protección de datos personales para Fersua Studio (Colombia): requisitos verificados y cómo aplicarlos

**Fuentes y límites de la consulta.** Busqué las fuentes primarias el 2026-09-28. secretariasenado.gov.co no respondió (ECONNREFUSED). funcionpublica.gov.co, sic.gov.co y suin-juriscol.gov.co fallaron por error de certificado TLS. Por eso usé otras compilaciones oficiales:
- Ley 1581 de 2012 (en adelante "L1581"), en el Régimen Legal de Bogotá: https://www.alcaldiabogota.gov.co/sisjur/normas/Norma1.jsp?i=49981
- Decreto 1377 de 2013 (en adelante "D1377"): https://www.alcaldiabogota.gov.co/sisjur/normas/Norma1.jsp?i=53646
- Tabla que relaciona cada artículo del D1377 con su número en el Decreto Único Reglamentario 1074 de 2015 (en adelante "DUR"), en el normograma de MinTIC: https://normograma.mintic.gov.co/mintic/compilacion/docs/decreto_1377_2013.htm
- Decreto 090 de 2018: https://www.alcaldiabogota.gov.co/sisjur/normas/Norma1.jsp?i=74862
- Circulares de la Superintendencia de Industria y Comercio (SIC), en el gestor normativo de la CRA: https://normas.cra.gov.co/gestor/docs/

**Norma vigente.** La L1581 sigue vigente. El Gobierno radicó en agosto de 2025 un proyecto para reformarla (en la Cámara, PL 274/2025C acumulado con el 214/2025C). No pude confirmar que se haya aprobado o sancionado: NO VERIFICADO (https://sedeelectronica.sic.gov.co/noticias/abc-del-proyecto-de-ley-de-proteccion-de-datos-personales-en-colombia).

**Código del proyecto.** Este repositorio (`C:\Fernando\Desarrollo\Personal\FersuaStore\Dashboard`) es el dashboard de la tienda y no tiene código de la plataforma de DJs. Busqué "booking", "privacidad" y "habeas" y no hubo resultados.

---

## 1. Contenido mínimo obligatorio

### Política de Tratamiento de la Información
Base: D1377 art. 13 = DUR art. 2.2.2.25.3.1. Debe estar por escrito (medio físico o electrónico), en lenguaje claro, y darse a conocer a los titulares.

1. Nombre o razón social, domicilio, dirección, correo electrónico y teléfono del Responsable. Hoy son marcadores pendientes y deben completarse antes de publicar.
2. Qué tratamiento se hará con los datos y para qué finalidad, cuando esto no se haya informado ya en el aviso de privacidad.
3. Los derechos del titular.
4. La persona o área encargada de atender peticiones, consultas y reclamos.
5. El procedimiento para ejercer los derechos de acceso, actualización, rectificación, supresión y revocatoria.
6. La fecha de entrada en vigencia de la política y el período de vigencia de la base de datos.
- Parágrafo del mismo artículo: los cambios sustanciales se deben comunicar antes de aplicarse.
- D1377 art. 5 (DUR 2.2.2.25.2.2): si el cambio afecta la finalidad, hay que pedir una nueva autorización.

### Aviso de Privacidad
Base: D1377 arts. 14-15 = DUR 2.2.2.25.3.2 y 2.2.2.25.3.3. Se entrega a más tardar al recolectar los datos.

1. Nombre o razón social y datos de contacto del Responsable.
2. El tratamiento y sus finalidades.
3. Los derechos del titular.
4. Cómo consultar la política y cómo se avisarán sus cambios sustanciales.
- Parágrafo: si se piden datos sensibles, el aviso debe decir expresamente que responder es facultativo. El aviso no reemplaza la política.

### Obligaciones relacionadas
- **Guardar el modelo de aviso:** hay que conservar el texto del aviso mientras se traten datos con base en él (D1377 art. 16 = DUR 2.2.2.25.3.4; se admite el soporte electrónico según la Ley 527 de 1999). En la práctica: guardar una versión y un hash de cada texto publicado.
- **Deber de informar al pedir la autorización** (L1581 art. 12):
  - el tratamiento y su finalidad;
  - que es facultativo responder sobre datos sensibles o de menores;
  - los derechos del titular;
  - la identificación, dirección física o electrónica y teléfono del Responsable.

**Cómo aplicarlo en el producto:**
- Una página `/privacidad` con la Política completa.
- Un aviso corto junto al formulario de registro de DJ y junto al formulario de booking.
- Un enlace en el pie de página.
- Un manual interno de políticas y procedimientos (L1581 art. 17 literal k).

## 2. Autorización válida

**Qué exige la norma:**
- Debe ser previa, expresa e informada (L1581 art. 3 literal a y art. 4 literal c).
- Debe obtenerse por un medio que se pueda consultar después (L1581 art. 9).
- Se pide a más tardar al recolectar los datos, informando todas las finalidades específicas (D1377 art. 5 = DUR 2.2.2.25.2.2).
- Puede darse por escrito, de forma oral o mediante conductas inequívocas. El silencio nunca es conducta inequívoca (D1377 art. 7 = DUR 2.2.2.25.2.4).
- **Prueba:** hay que conservar la prueba de la autorización (L1581 art. 17 literal b; D1377 art. 8 = DUR 2.2.2.25.2.5).
- **Casilla premarcada:**
  - Según la Guía SIC de comercio electrónico (2019) y la Resolución SIC 76538 de 2019, una casilla marcada por defecto no es consentimiento activo; se necesita una "acción clara y positiva". Esto lo verifiqué solo en una fuente secundaria, porque el PDF de la SIC no cargó (https://avanteabogados.com/2020/03/13/proteccion-de-los-datos-personales-en-el-comercio-electronico-analisis-sobre-las-ultimas-decisiones-y-directrices-de-la-superintendencia-de-industria-y-comercio/). La conclusión es consistente con D1377 art. 7.
  - La SIC también rechaza mecanismos donde aceptar y no aceptar tengan el mismo efecto (Resolución SIC 82786 de 2020: https://sedeelectronica.sic.gov.co/publicaciones/boletin-juridico/boletin/no-es-una-buena-practica-utilizar-mecanismos-para-que-tenga-el-mismo-efecto-que-la-persona-acepte-o-no-acepte).
- **Datos sensibles** (D1377 art. 6 = DUR 2.2.2.25.2.3; L1581 art. 6 literal a):
  - la autorización debe ser explícita;
  - hay que informar que el titular no está obligado a autorizar;
  - hay que decir cuáles datos son sensibles y para qué se usan;
  - ninguna actividad puede condicionarse a que el titular entregue datos sensibles.
- **Menores de edad** (L1581 art. 7; D1377 art. 12 = DUR 2.2.2.25.2.9): el tratamiento está prohibido salvo datos de naturaleza pública, con respeto del interés superior del menor y autorización de su representante. Como los DJs deben tener 18 años o más, conviene prohibir menores en fotos y en las solicitudes.

**Casillas propuestas.** Van sin marcar, son independientes y cada una lleva un enlace a la política:
- **A. Registro del DJ (obligatoria):** "Declaro ser mayor de 18 años. He leído la [Política de Tratamiento de Datos] y autorizo de forma previa, expresa e informada a [NOMBRE], [NIT/CC], [dirección], [correo], [teléfono], para recolectar, almacenar, usar, publicar en mi página pública de Fersua Studio y suprimir mis datos (usuario, correo, nombre artístico, textos, fechas de eventos, redes sociales, número de WhatsApp). Las finalidades son: crear y administrar mi cuenta, recuperar mi acceso, publicar mi página de booking en internet, recibir solicitudes de contratación, enviarme correos del servicio y moderar la plataforma (aprobación o suspensión). Puedo conocer, actualizar, rectificar y suprimir mis datos, y revocar esta autorización, en [correo de habeas data]."
- **B. Fotografías (opcional, dato sensible):** "OPCIONAL: autorizo publicar mis fotografías (dato sensible, por ser imagen o dato biométrico según la SIC) en mi página pública. Sé que no estoy obligado(a) a autorizar el tratamiento de datos sensibles y que no subir fotos no me impide usar la plataforma." El registro no puede exigir fotos.
- **C. Terceros en fotos y flyers:** "Declaro que tengo la autorización previa, expresa e informada de cada miembro del dúo y de cada persona identificable que aparece en las fotos y flyers que publico, y que todos son mayores de 18 años." Esto va acompañado de un canal para pedir que se retire una foto.
- **D. Formulario de booking (obligatoria):** "Declaro ser mayor de 18 años y autorizo a [NOMBRE] (Fersua Studio) a guardar los datos de esta solicitud en la plataforma durante un máximo de 12 meses y a entregarlos a [ARTISTA] para que me contacte y gestione la contratación. Al pulsar 'Enviar por WhatsApp' se abrirá WhatsApp (Meta) con un resumen que yo envío desde mi propia cuenta. [Política]. Mis derechos los ejerzo en [correo]."

**Registro de pruebas en la base de datos.** Para cada consentimiento guardar:
- a quién corresponde (titular);
- tipo (A, B, C o D);
- versión de la política y del aviso, con su hash y el texto exacto que se mostró;
- fecha y hora en UTC;
- IP en HMAC y user-agent;
- enlace al registro de la solicitud o de la cuenta.

## 3. Derechos del titular y plazos

**Derechos** (L1581 art. 8):
- a) conocer, actualizar y rectificar sus datos;
- b) pedir prueba de la autorización;
- c) ser informado del uso que se da a sus datos;
- d) presentar quejas ante la SIC;
- e) revocar la autorización o pedir la supresión (D1377 art. 9 = DUR 2.2.2.25.2.6: no procede si hay un deber legal o contractual de conservar);
- f) acceder gratis a sus datos. Debe haber al menos una consulta gratuita al mes (D1377 art. 21 = DUR 2.2.2.25.4.2).

**Plazos:**
- **Consultas** (L1581 art. 14): máximo 10 días hábiles desde que se reciben. Si no es posible, se informa el motivo y se responde en máximo 5 días hábiles adicionales.
- **Reclamos** (L1581 art. 15):
  - si el reclamo está incompleto, se pide completarlo dentro de los 5 días siguientes; si el titular no responde en 2 meses, se entiende que desistió;
  - si quien lo recibe no es competente, lo traslada en 2 días hábiles;
  - la leyenda "reclamo en trámite" se registra en máximo 2 días hábiles;
  - se resuelve en máximo 15 días hábiles, prorrogables hasta 8 días hábiles más.

**Canal:**
- Hay que ofrecer mecanismos "sencillos y ágiles permanentemente disponibles" (D1377 art. 21) y designar una persona o área responsable (D1377 art. 23 = DUR 2.2.2.25.4.4).
- Las consultas se reciben por un medio del que quede prueba (L1581 art. 14).
- El titular solo puede quejarse ante la SIC después de agotar la consulta o el reclamo con el Responsable (L1581 art. 16). Por eso el canal propio es lo primero que la SIC revisará.

**Cómo aplicarlo en el producto:**
- Un correo dedicado, por ejemplo habeasdata@fersuastudio.com.
- Opcionalmente, un formulario con número de radicado.
- En la cuenta del DJ: botones para editar y borrar datos, y para despublicar la página.
- En la base de datos: fecha de recepción, vencimiento calculado en días hábiles y un indicador de "reclamo en trámite".

## 4. Roles: Responsable y Encargado

**Definiciones** (L1581 art. 3):
- **Responsable (literal e):** quien, por sí mismo "o en asocio con otros", decide sobre la base de datos o el tratamiento.
- **Encargado (literal d):** quien trata los datos por cuenta del Responsable.

**Datos de las cuentas de DJ, páginas públicas y moderación:** Fersua es el Responsable.

**Solicitudes de booking.** No encontré norma ni concepto SIC específico para este caso; lo que sigue es mi análisis. Recomiendo tratar a Fersua y a cada DJ como Responsables, cada uno en su parte:
- **Fersua es Responsable de la base de datos de la plataforma.** Define los campos, el almacenamiento, la retención de 12 meses, que el administrador vea todo, el anti-spam con IP en HMAC y el envío de correos. Considerarla simple Encargada de cada DJ no encaja con lo que decide la plataforma. Además obligaría a:
  - firmar un contrato de transmisión con cada DJ (D1377 art. 25 = DUR 2.2.2.25.5.2);
  - que cada DJ tenga su propia política, lo cual no es realista.
- **El DJ es Responsable del uso que da a la solicitud una vez la recibe:** contactar al cliente, negociar y conversar por WhatsApp. La entrega de Fersua al DJ es una transferencia nacional, amparada por la casilla D, que nombra al artista.
- **Términos para DJs.** Deben obligarlos a:
  - usar los datos solo para responder esa solicitud;
  - no incluirlos en listas de marketing;
  - guardar confidencialidad (L1581 art. 4 literal h);
  - suprimirlos cuando ya no los necesiten;
  - reenviar a Fersua cualquier solicitud de derechos que reciban.
- **Canal único:** Fersua actúa como canal único de derechos.
- **Otra opción, no preferida:** que Fersua sea Encargada del DJ, con los Términos del servicio como contrato de transmisión. En ese caso cada DJ asume todos los deberes del art. 17.

**Proveedores de Fersua como Encargados:** Hostinger (VPS y SMTP).

**WhatsApp (Meta).** La plataforma solo prepara el enlace; el mensaje lo envía el propio titular desde su cuenta. Aun así, conviene informarlo en el aviso por transparencia.

**Publicación en internet (riesgo).** L1581 art. 4 literal f dice que los datos personales, salvo la información pública, "no podrán estar disponibles en Internet", a menos que el acceso sea técnicamente controlable. No encontré un concepto SIC que diga que la autorización del titular basta para publicar: NO VERIFICADO. Para reducir el riesgo:
- publicar solo lo que el DJ decide publicar y con autorización expresa para internet (casilla A);
- que el DJ pueda despublicar cuando quiera;
- las solicitudes de booking nunca son públicas.

## 5. Datos fuera de Colombia

**Reglas:**
- L1581 art. 26 prohíbe transferir datos a países sin un nivel adecuado de protección, con estas excepciones:
  - a) autorización expresa e inequívoca del titular;
  - e) ejecución de un contrato o medidas precontractuales, con autorización del titular;
  - las demás (b, c, d, f) no aplican aquí.
  - Para otros casos existe la declaración de conformidad de la SIC.
- **Transmisión a un Encargado** (D1377 arts. 24-25 = DUR 2.2.2.25.5.1-2): no hay que informar al titular ni pedir su consentimiento si existe un contrato de transmisión. Ese contrato debe incluir el alcance del tratamiento, que se trate según los principios, la seguridad y la confidencialidad. No verifiqué si el acuerdo de tratamiento de datos (DPA) o los términos de Hostinger cumplen el art. 25: NO VERIFICADO.
- **Países adecuados** (Circular Única de la SIC, Título V, Capítulo 3, numeral 3.2, según las Circulares 08 de 2017 y 02 de 2018):
  - Alemania, Australia, Austria, Bélgica, Bulgaria, Chipre, Costa Rica, Croacia, Dinamarca, Eslovaquia, Eslovenia, Estonia, España, Estados Unidos, Finlandia, Francia, Grecia, Hungría, Irlanda, Islandia, Italia, Japón, Letonia, Lituania, Luxemburgo, Malta, México, Noruega, Países Bajos, Perú, Polonia, Portugal, Reino Unido, República Checa, Corea, Rumania, Serbia y Suecia;
  - más los países que la Comisión Europea haya declarado adecuados;
  - la Circular 08 de 2017 aplica esta lista también a las transmisiones.
  - Fuentes: https://normas.cra.gov.co/gestor/docs/circular_superindustria_0008_2017.htm y https://normas.cra.gov.co/gestor/docs/circular_superindustria_0002_2018.htm
  - Hay un proyecto de resolución de 2026 que modificaría el numeral 3.2: NO VERIFICADO.

**Qué VPS elegir.** Hostinger ofrece VPS en EE. UU. (Phoenix, Boston), Francia, Alemania, Lituania, Reino Unido, Brasil, India, Indonesia y Malasia (fuente secundaria: https://www.hostinger.com/support/1583267-where-are-hostinger-servers-located/).
- Elegir EE. UU. o un país europeo de la lista.
- Brasil estaría cubierto por la decisión de adecuación de la UE del 27 de enero de 2026, según fuentes secundarias (https://www.mayerbrown.com/en/insights/publications/2026/02/a-new-era-for-personal-data-transfers-brazil-and-european-union-establish-mutual-adequacy-decision). Falta confirmarlo en la fuente oficial de la Comisión Europea.
- Evitar India, Indonesia y Malasia.
- La ubicación del SMTP de Hostinger está NO VERIFICADA.

**Qué debe decir la política:**
- que los datos se alojan o transmiten a proveedores Encargados;
- quiénes son: Hostinger (hosting y correo); WhatsApp/Meta (EE. UU./Irlanda), usado por decisión del titular;
- en qué países;
- que esos países tienen nivel adecuado según la SIC, o, si no, en qué excepción del art. 26 se apoya (autorización expresa).

## 6. Registro Nacional de Bases de Datos (RNBD)

- **Quién debe inscribirse** (Decreto 090 de 2018, que reemplaza el DUR art. 2.2.2.26.1.2):
  - a) sociedades y entidades sin ánimo de lucro con activos totales superiores a 100.000 UVT;
  - b) personas jurídicas de naturaleza pública.
- **Plazo:** las bases creadas después de los plazos originales se inscriben dentro de los 2 meses siguientes a su creación (DUR art. 2.2.2.26.3.1).
- **Valor de referencia:** la UVT de 2026 es $52.374 (Resolución DIAN 000238 de 2025). El umbral equivale a unos COP 5.237 millones en activos.
- **Conclusión:**
  - una persona natural no está obligada;
  - una SAS pequeña por debajo del umbral tampoco.
- **Quienes no están obligados** siguen sujetos a todos los demás deberes de la L1581 (Circular Externa SIC 003 de 2018: https://normas.cra.gov.co/gestor/docs/circular_superindustria_0003_2018.htm).
- **Si algún día se supera el umbral:** hay que reportar los cambios sustanciales en los primeros 10 días hábiles del mes y actualizar cada año entre el 2 de enero y el 31 de marzo (misma circular).

## 7. Seguridad e incidentes

**Deberes:**
- Principio de seguridad: aplicar medidas técnicas, humanas y administrativas (L1581 art. 4 literal g).
- Conservar la información en condiciones de seguridad (art. 17 literal d).
- Informar a la SIC cuando se violen los códigos de seguridad (art. 17 literal n para Responsables; art. 18 literal k para Encargados).
- Responsabilidad demostrada, con medidas proporcionales al tamaño y al riesgo (D1377 arts. 26-27 = DUR 2.2.2.25.6.1-2).

**Plazo para reportar un incidente:**
- 15 días hábiles desde que se detecta y se pone en conocimiento del área responsable.
- Se reporta en el módulo "Reporte de Incidentes de Seguridad" del sitio de la SIC. Esto aplica también a quien no está obligado a inscribirse en el RNBD (Concepto SIC 21-17773 del 20 de abril de 2021: https://sedeelectronica.sic.gov.co/publicaciones/boletin-juridico/concepto/cumplimiento-de-la-obligacion-del-reporte-de-incidentes-de-seguridad).
- La L1581 no obliga expresamente a notificar a los titulares afectados: NO VERIFICADO. Se recomienda hacerlo.

**Medidas mínimas para el producto:**
- TLS en todo el sitio.
- Contraseñas con argon2 o bcrypt.
- Cookie httpOnly, Secure y SameSite.
- Límite de intentos (rate-limit) en el login y en el formulario.
- Control de acceso por rol: el DJ solo ve su bandeja; el administrador tiene 2FA.
- Registro de accesos del administrador.
- Backups cifrados que respeten la retención.
- Secretos fuera del repositorio y rotación de la clave HMAC.
- Un procedimiento escrito de respuesta a incidentes que incluya el reporte a la SIC en 15 días hábiles.

**IP en HMAC.** Sigue siendo dato personal, porque es información "que pueda asociarse" a una persona determinable (L1581 art. 3 literal c). Debe mencionarse en la política y tener su propio plazo de retención.

## 8. Retención y supresión

- Los datos solo se conservan lo razonable y necesario para la finalidad. Cumplida la finalidad, se suprimen, salvo un deber legal o contractual. Los procedimientos deben documentarse (D1377 art. 11 = DUR 2.2.2.25.2.8).
- La política debe indicar el período de vigencia de la base de datos (D1377 art. 13 numeral 6).

**Propuesta:**

| Dato | Retención |
|---|---|
| Solicitudes de booking | 12 meses desde que se reciben; luego borrado o anonimización automática |
| Cuenta del DJ | Mientras la cuenta esté activa; borrado al pedirlo, en máximo 15 días hábiles |
| Registros técnicos con IP en HMAC | 90 días (sugerido) |
| Pruebas de autorización y modelos de aviso | Mientras dure el tratamiento y un tiempo después |
| Backups | Rotación que no supere esos plazos |

Sobre las pruebas de autorización: sugiero 3 años adicionales, por la caducidad de la facultad sancionatoria del art. 52 del CPACA. No lo verifiqué en esta sesión: NO VERIFICADO.

## 9. Fotografías de personas

- Los datos biométricos son datos sensibles (L1581 art. 5; D1377 art. 3).
- **Posición de la SIC** (Guía sobre fotos como datos personales, 14 de diciembre de 2020: https://sedeelectronica.sic.gov.co/noticias/sic-expide-guia-para-el-correcto-tratamiento-de-las-fotografias-como-datos-personales):
  - no toda foto es dato personal; solo lo es si permite identificar a una persona natural;
  - las fotos de personas identificables contienen datos biométricos y por eso son sensibles;
  - se aplica D1377 art. 6 junto con L1581 arts. 9 y 12.
- La SIC no limita esto a fotos procesadas para identificar a alguien. Adoptar un criterio "solo biométrico si se usa para identificación" (como en Europa) sería más arriesgado frente a la SIC.
- **Consecuencia para el producto:**
  - la casilla B es separada y opcional;
  - las fotos no se exigen para registrarse;
  - la casilla C cubre a los miembros y a los terceros en fotos y flyers;
  - hay un canal para retirar fotos;
  - no se usa reconocimiento facial.

## 10. Sanciones (L1581 art. 23)

Aplican a Responsables y Encargados privados:
- a) multas personales e institucionales de hasta 2.000 SMMLV, sucesivas mientras siga el incumplimiento;
- b) suspensión de las actividades de tratamiento hasta por 6 meses;
- c) cierre temporal si no se corrige;
- d) cierre inmediato y definitivo de la operación que trate datos sensibles.

**Criterios para graduar la multa** (art. 24): daño causado, beneficio económico obtenido, reincidencia, obstrucción a la investigación, desacato de órdenes de la SIC y reconocimiento de la infracción antes de la sanción.

**Otros puntos:**
- La conversión actual de SMMLV a UVT o UVB está NO VERIFICADA.
- En lo penal, el art. 269F del Código Penal prevé prisión de 48 a 96 meses por violación de datos personales. Solo lo vi en fuente secundaria: NO VERIFICADO.

**Prioridades, en orden de riesgo:**
1. Autorizaciones válidas con prueba, y la casilla separada para fotos, que son sensibles y pueden llevar al cierre definitivo.
2. Política y aviso con la identidad real del Responsable.
3. Canal de derechos con control de plazos.
4. Ubicación del VPS en un país adecuado.
5. Seguridad y procedimiento de incidentes.
6. Retención automática.
7. Términos para DJs sobre el uso de las solicitudes.

---

### Critical Files for Implementation
El código de la plataforma de DJs no está en este repositorio. Estos archivos sirven como referencia de los patrones existentes:
- C:\Fernando\Desarrollo\Personal\FersuaStore\Dashboard\back\prisma\schema.prisma (patrón para modelar las tablas de consentimientos, solicitudes de derechos y retención)
- C:\Fernando\Desarrollo\Personal\FersuaStore\Dashboard\back\src\server.ts (patrón de rutas y cookies para los endpoints de consentimiento, derechos y borrado)
- C:\Fernando\Desarrollo\Personal\FersuaStore\Dashboard\front\src\pages\LoginPage.tsx (patrón de formulario de autenticación donde irían las casillas A a D)
- C:\Fernando\Desarrollo\Personal\FersuaStore\Dashboard\docs\07-seguridad-infra.md (referencia para documentar medidas de seguridad y el procedimiento de incidentes)