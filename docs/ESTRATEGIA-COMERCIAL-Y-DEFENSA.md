# Estrategia Comercial y Defensa ante Cliente Hostil

> **Documento de sustentación.** Guion de presentación, blindaje técnico frente a un
> evaluador que intenta romper el sistema, y técnicas para reconducir una falla en vivo.
>
> Sistema de Tickets — Helpdesk Empresarial · Proyecto de fin de curso

---

## Índice

1. [Pitch de elevador (2 minutos)](#1-pitch-de-elevador-2-minutos)
2. [Los tres escenarios límite](#2-los-tres-escenarios-límite)
   - [2.1 Subida masiva de archivos maliciosos](#21-escenario-a--subida-masiva-de-archivos-maliciosos)
   - [2.2 Inyección SQL](#22-escenario-b--inyección-sql)
   - [2.3 Reportes sin datos](#23-escenario-c--reportes-con-cero-tickets)
3. [Reconducir una falla en vivo](#3-reconducir-una-falla-en-vivo-hacia-una-funcionalidad-planificada)
4. [Frases de cierre y de rescate](#4-frases-de-cierre-y-de-rescate)
5. [Chuleta de una página](#5-chuleta-de-una-página-para-llevar-impresa)

---

## 1. Pitch de elevador (2 minutos)

> Este guion está cronometrado para **120 segundos** a ritmo conversacional. Las
> acotaciones entre corchetes indican el tiempo acumulado.

**[0:00 — El problema]**

- «Cada organización pierde solicitudes de soporte todos los días: llegan por correo, por
  chat, de viva voz, y **se diluyen**. No hay forma de saber quién atendió qué, ni cuánto
  tardó, ni si se cumplió lo prometido.»

**[0:20 — La propuesta de valor]**

- «El **Sistema de Tickets** convierte cada solicitud en un caso con **folio único**,
  **responsable asignado** y **plazo comprometido**. Lo que antes era un correo perdido,
  ahora es un registro con trazabilidad completa.»
- «Tres promesas concretas: **nada se pierde**, **todo queda auditado** y **el desempeño
  se mide**.»

**[0:40 — Cómo funciona, en tres roles]**

- «El **solicitante** crea el ticket y adjunta la evidencia: una captura, un PDF, un log.»
- «El **agente** lo toma, lo mueve por estados —abierto, en progreso, en espera, resuelto—
  y deja notas internas que el cliente no ve.»
- «El **administrador** ve el panorama completo: carga por agente, cumplimiento de SLA y
  reportes en PDF y Excel listos para presentar.»

**[1:00 — El diferenciador técnico]**

- «Lo que hace sólido al sistema no es la pantalla, es lo que hay debajo.»
- «**Arquitectura en capas** con inversión de dependencias: rutas, controladores, servicios
  y repositorios separados. Eso significa que cambiar de base de datos o de proveedor de
  correo **no toca una sola regla de negocio**.»
- «**Máquina de estados explícita**: no se puede saltar de *nuevo* a *cerrado*. El sistema
  rechaza la transición con un error claro en lugar de dejar los datos inconsistentes.»
- «**Auditoría por disparador de base de datos**: el historial se escribe aunque alguien
  modifique el ticket directamente con SQL. No depende de que la aplicación se acuerde.»

**[1:30 — La prueba]**

- «Está **dockerizado**: se levanta completo con un comando.»
- «Trae **47 pruebas automatizadas**, una **colección de Postman** con 53 peticiones
  y **pruebas de carga con k6** que miden latencia y tasa de error bajo concurrencia.»
- «Y viene con **notificación automática** al solicitante cuando su caso pasa a *resuelto*,
  por correo o por SMS.»

**[1:50 — El cierre]**

- «En resumen: no es un formulario que guarda registros; es un sistema que **hace cumplir
  un proceso**, **mide su desempeño** y **resiste** que alguien intente romperlo.»
- «Está listo para desplegarse en la nube hoy mismo. Con gusto le muestro el flujo completo
  en vivo — ¿por dónde prefiere empezar?»

> **Regla de oro del pitch:** terminar siempre con una **pregunta que devuelva el control**.
> «¿Por dónde prefiere empezar?» convierte al evaluador en guía y reduce la probabilidad de
> que tome el mando hacia el terreno donde usted no preparó respuesta.

---

## 2. Los tres escenarios límite

Un evaluador exigente —el "cliente hostil"— no ataca la funcionalidad, ataca los **bordes**.
Los tres ataques más probables son: reventar el almacenamiento con archivos, romper las
consultas con inyección SQL, y provocar una división por cero en la reportería. Cada uno
tiene una defensa arquitectónica concreta, no un parche.

### 2.1 Escenario A — Subida masiva de archivos maliciosos

**El ataque.** El evaluador sube un ejecutable renombrado a `.png`, o intenta llenar el
disco con miles de archivos de 100 MB, o manda una docena de cargas simultáneas para
saturar el servidor.

**Por qué el diseño lo detiene.**

- **Doble validación de tipo.** No basta con mirar la extensión ni la cabecera
  `Content-Type`, que el cliente puede falsificar. El servicio lee los **primeros bytes del
  archivo** y los compara contra una tabla de firmas binarias (*magic numbers*) de formatos
  permitidos. Un `.exe` renombrado a `.png` no empieza con la firma PNG y es rechazado
  antes de tocar el disco.
- **Límite de tamaño en dos niveles.** `multer` corta el flujo en cuanto se supera
  `UPLOAD_MAX_MB`, de modo que un archivo gigantesco **nunca termina de escribirse**. El
  corte ocurre durante la transmisión, no después.
- **Cuota por ticket.** Aunque cada archivo pase el filtro individual, el servicio suma el
  total ya adjunto al ticket y rechaza la carga cuando se supera el tope acumulado. Esto
  convierte "mil archivos pequeños" en un ataque inútil.
- **Nombres de archivo generados por el servidor.** El archivo se guarda con un identificador
  propio, no con el nombre que envió el cliente. Así se neutraliza de raíz el *path
  traversal* (`../../etc/passwd`) y la colisión de nombres.
- **Límite de peticiones por IP.** El *rate limiting* sobre los endpoints de subida convierte
  un ataque de saturación en una ráfaga de respuestas `429`.
- **Huella SHA-256.** Cada archivo se hashea al vuelo; si alguien sube el mismo archivo
  cien veces, el sistema lo detecta por su hash.

**Cómo explicarlo en la sustentación (30 segundos):**

> «La validación de archivos está en el **servicio**, no en la ruta. Eso importa: significa
> que da igual si la carga viene del formulario web, de Postman o de un script — pasa
> siempre por las mismas reglas. Y verificamos los **bytes reales** del archivo, no la
> extensión, porque la extensión es un dato que el atacante controla.»

**Los tres códigos que verás, y por qué son distintos:**

| Situación | Código | Significado |
|---|---|---|
| Ejecutable renombrado a `.png` (firma binaria no coincide) | **`422`** | La petición está bien formada; el **contenido** no es válido. |
| Extensión no permitida (`.exe`) | **`422`** | Igual: el archivo no es de un tipo aceptado. |
| Archivo mayor a `UPLOAD_MAX_MB` | **`413`** | Payload Too Large. El archivo es legítimo, solo es **demasiado grande**. |
| Demasiadas subidas seguidas | **`429`** | El limitador de tasa actuó. |

> Se eligió `413` y `422` en lugar de un `400` genérico a propósito: así el
> cliente puede reaccionar de forma distinta. Ante un `413` tiene sentido
> comprimir la imagen y reintentar; ante un `422`, no.

**Demostración en vivo sugerida (la más impactante de las tres):**

1. Crea un archivo de texto, renómbralo a `virus.png` y súbelo desde la interfaz.
   Muestra el mensaje de rechazo.
2. Repite la subida **con `curl` o Postman**, para demostrar que la regla no está
   en el formulario sino en el servidor:

   ```bash
   curl -X POST http://localhost:4000/api/v1/tickets/<id>/adjuntos \
     -H "Authorization: Bearer <token>" \
     -F "archivos=@virus.png;type=image/png"
   # Debe responder 422 ARCHIVO_INVALIDO
   ```

**Frase de remate:** *«No confiamos en nada que venga del cliente, ni siquiera en el nombre
del archivo.»*

---

### 2.2 Escenario B — Inyección SQL

**El ataque.** El evaluador escribe `' OR '1'='1` en el buscador, o `'; DROP TABLE tickets; --`
en el título del ticket, o intenta inyectar a través del parámetro de ordenamiento
(`?orden=codigo; DELETE FROM usuarios`).

**Por qué el diseño lo detiene.**

- **Consultas siempre parametrizadas.** Todas las consultas usan marcadores `$1, $2, …` con
  el controlador `pg`. El valor viaja **fuera** del texto de la consulta, así que el motor lo
  trata como dato y jamás como código. No existe una sola concatenación de cadenas en la
  construcción de SQL.
- **El caso difícil: `ORDER BY` no admite parámetros.** Es la vulnerabilidad que casi todo
  el mundo deja abierta, porque el nombre de una columna no puede ir como valor. La solución
  es una **lista blanca**: el servicio traduce el parámetro recibido contra un mapa de
  columnas permitidas y, si no coincide, cae a un orden por defecto. La entrada del usuario
  **nunca** llega al texto de la consulta.
- **Comodines de `LIKE` escapados.** En el buscador, los caracteres `%` y `_` que escribe el
  usuario se escapan antes de construir el patrón. Si no, alguien buscando `%` obtendría la
  tabla entera y podría usarlo para forzar lecturas masivas.
- **Validación de forma antes de tocar la base.** Zod valida tipo, longitud y formato de cada
  campo en el middleware. Un `id` que no es UUID se rechaza con `400` antes de llegar al
  repositorio.
- **Privilegios acotados.** El usuario de la aplicación no es superusuario de PostgreSQL:
  aunque algo se colara, no podría alterar el esquema.
- **Sin mensajes de error crudos.** El middleware de errores devuelve mensajes de dominio,
  no el texto del motor. Un atacante no aprende la estructura de las tablas a partir de los
  errores.

**Cómo explicarlo en la sustentación (30 segundos):**

> «La defensa contra inyección no es "escapar comillas", es **no construir SQL con texto**.
> Todas las consultas son parametrizadas. Y para el único caso donde eso no es posible —el
> ordenamiento— usamos una lista blanca de columnas. La entrada del usuario nunca se
> convierte en parte de la consulta.»

**Demostración en vivo sugerida:** escribir `' OR '1'='1` en el buscador y mostrar que
devuelve **cero resultados**, no la tabla completa. Luego intentar `?orden=codigo;DROP TABLE
tickets` y mostrar que responde con el orden por defecto.

**Frase de remate:** *«El usuario no escribe SQL; escribe datos. El sistema se encarga de
que sigan siendo datos.»*

---

### 2.3 Escenario C — Reportes con cero tickets

**El ataque.** El evaluador genera un reporte para un rango de fechas donde no hay ningún
ticket, o con un rango invertido (desde > hasta), o con un rango absurdo de veinte años.
Espera ver una excepción, una división por cero, un PDF en blanco o una descarga corrupta.

**Por qué el diseño lo detiene.**

- **Ausencia de datos ≠ error.** Un reporte sin filas es una respuesta **legítima**. El
  endpoint devuelve `200` con la cabecera `X-Reporte-Sin-Datos: true` **y un archivo válido**
  (con sus encabezados de columna y la línea «sin registros»). El frontend lee esa cabecera
  y muestra un aviso claro —«No existen tickets en el periodo seleccionado»— pero **igual
  entrega el archivo**. Es mejor que devolver un `204` sin cuerpo: el usuario obtiene un
  documento utilizable *y* la explicación.
- **Cálculos protegidos contra división por cero.** Los indicadores derivados —tiempo medio
  de resolución, porcentaje de cumplimiento de SLA— usan `NULLIF` en el denominador. Si no
  hay tickets resueltos, el resultado es `NULL` y se presenta como «sin datos», no como un
  error de división.
- **Validación del rango en el esquema.** `desde` y `hasta` se validan como fechas y se
  comprueba que `desde <= hasta`; un rango invertido devuelve `400` con un mensaje
  explicativo, no una consulta que devuelve silenciosamente nada.
- **La consulta vacía sigue siendo válida.** Al ser una agregación con `LEFT JOIN`, el
  resultado de cero filas es una lista vacía, no un `NULL` que rompa el generador.
- **El generador de PDF/Excel tolera cero filas.** Escribe el encabezado, los títulos y la
  línea de «sin registros»; el documento es válido y descargable. No hay una ruta de código
  que asuma que hay al menos una fila.
- **Todo esto vive en el servicio, no en el controlador.** Por eso la lógica es comprobable
  en pruebas unitarias sin abrir un navegador: se le pasa un repositorio que devuelve una
  lista vacía y se verifica que no lanza excepción.

**Cómo explicarlo en la sustentación (30 segundos):**

> «Un reporte sin datos no es una falla: es un resultado. El sistema lo marca con una
> cabecera propia y el frontend avisa, pero **igual entrega el archivo**, porque un reporte
> con las tablas vacías sigue siendo un documento válido. Los promedios están protegidos con
> `NULLIF`, así que nunca hay división por cero. Y como esta lógica está en el servicio, está
> cubierta por pruebas unitarias.»

**Demostración en vivo sugerida:** pedir un reporte con fechas del año 2000. Mostrar que
responde `200` (no un error), que trae la cabecera `X-Reporte-Sin-Datos: true`, que **el PDF
se descarga igual** y que aparece el aviso en pantalla.

**Frase de remate:** *«El caso borde está contemplado como un caso normal; por eso no es
un borde.»*

---

### Cuadro resumen de las tres defensas

| Ataque | Capa que lo detiene | Mecanismo concreto | Respuesta esperada |
|---|---|---|---|
| Archivos maliciosos o masivos | Servicio + middleware de subida | Firma binaria, límite en streaming, cuota por ticket, nombres generados, rate limit | `422` (contenido inválido) / `413` (demasiado grande) / `429` (saturado) |
| Inyección SQL | Repositorio | Consultas parametrizadas, lista blanca para `ORDER BY`, escape de comodines `LIKE`, validación Zod | `400` o resultado vacío |
| Reporte sin datos | Servicio + generadores | `200` con cabecera `X-Reporte-Sin-Datos` y archivo válido, `NULLIF` en promedios, validación del rango, generador tolerante a cero filas | `200` o `400` |

---

## 3. Reconducir una falla en vivo hacia una "funcionalidad planificada"

Una demo en vivo siempre puede fallar. La diferencia entre una falla que **hunde** la
presentación y una que **suma puntos** no es evitar el error, es **cómo se narra**. La
técnica consiste en reconocer el hecho con calma, explicar la causa con precisión técnica
y reencuadrarlo como una decisión consciente de alcance.

### Las cuatro reglas

1. **No improvisar disculpas largas.** Cada segundo de silencio incómodo resta credibilidad.
   Una frase corta y se sigue.
2. **No culpar al entorno sin explicar.** «Es que la red va lenta» suena a excusa. «El
   contenedor de la base de datos aún está levantando; el healthcheck tarda unos segundos»
   suena a que usted sabe cómo funciona su sistema.
3. **Nunca decir «no sé por qué pasó».** Diga **qué** pasó, **dónde** está el límite y
   **qué haría falta** para resolverlo. Eso demuestra dominio, no ignorancia.
4. **Cerrar siempre con la alternativa.** Ofrezca de inmediato un camino que sí funciona:
   otra ruta, otro dato, el respaldo grabado. Nunca deje al evaluador sin algo que ver.

### Plantilla de frase (memorizar)

> **Reconocer → Explicar → Reencuadrar → Ofrecer alternativa**

- **Reconocer:** «Aquí el sistema no responde como esperaba.»
- **Explicar:** «Lo que ocurre es que el servicio de correo no está configurado en este
  entorno de demostración; no hay credenciales SMTP cargadas.»
- **Reencuadrar:** «Eso es **intencional**: el módulo de notificaciones tiene un modo de
  consola precisamente para que la aplicación sea demostrable sin depender de un servidor
  de correo externo. En producción se activa simplemente cargando las credenciales.»
- **Ofrecer alternativa:** «Se lo muestro: aquí está el registro de la notificación en la
  cola, con su estado *pendiente*. Cuando el proveedor está disponible, el administrador la
  reprocesa con un clic.»

### Tabla de reconversión: falla → funcionalidad planificada

| Falla en vivo | Cómo reencuadrarla |
|---|---|
| El correo de notificación no llega | «Modo de consola para entornos sin SMTP; la notificación queda en cola y se reintenta. El patrón *outbox* garantiza que no se pierda.» |
| El reporte PDF tarda en generarse | «El reporte se construye en *streaming* para no cargar todo en memoria. En un periodo grande eso toma unos segundos; es el precio de soportar volúmenes altos sin agotar la memoria del servidor.» |
| La carga de un archivo grande se rechaza | «Es el límite de 10 MB, configurable por variable de entorno. Se rechaza durante la transmisión, no después, para no gastar disco en algo que no se va a aceptar.» |
| El token expira a mitad de la demo | «El token de acceso dura 15 minutos a propósito. Fíjese que el sistema renueva la sesión solo, sin pedir credenciales otra vez — eso es la rotación de *refresh tokens*.» |
| Un cambio de estado devuelve error | «Correcto: eso es la máquina de estados. No se puede pasar de *cerrado* a *en progreso* directamente porque rompería la trazabilidad. El sistema lo impide, y ese es justamente el comportamiento deseado.» |
| La base de datos no responde | «El contenedor está levantando; el backend espera el *healthcheck* antes de arrancar. Prefiero que espere a que arranque con una base a medio iniciar.» |
| Un dato se ve raro en pantalla | «Ahí el dato viene de la vista analítica de la base de datos, no de la tabla. Es un cálculo agregado; se lo muestro en la consulta SQL para que vea de dónde sale.» |
| La demo se cae por completo | «Le muestro la misma funcionalidad en la colección de Postman, que es el mismo backend sin la interfaz. Y si prefiere, revisamos juntos las pruebas automatizadas que cubren este flujo.» |

### El cierre del rescate

Termine cualquier incidente con una frase que devuelva el foco a lo importante:

> «Ese comportamiento es una **decisión de diseño**, no un defecto: preferimos que el
> sistema se detenga y avise antes que continuar y corromper datos. ¿Quiere que le muestre
> la prueba automatizada que lo verifica?»

> **Por qué funciona.** Convierte una pregunta sobre un defecto en una pregunta sobre la
> calidad del proceso de desarrollo. Y usted tiene las pruebas para responderla.

---

## 4. Frases de cierre y de rescate

**Para defender decisiones de arquitectura:**

- «Esa capa existe para que el día que cambiemos de proveedor de correo, no haya que tocar
  una sola línea de lógica de negocio.»
- «El controlador no sabe qué es un ticket; solo traduce HTTP. Las reglas viven en el
  servicio. Por eso las pruebas unitarias corren sin base de datos.»
- «Los estados no se validan en el frontend, se validan en el servicio. El frontend solo
  oculta los botones que no aplican: la regla la hace cumplir el backend.»
- «Ese valor está en la base de datos porque es un dominio cerrado. Validarlo ahí hace
  imposible insertarlo mal incluso desde `psql`.»

**Para defender la seguridad:**

- «No confiamos en el cliente: ni en la extensión del archivo, ni en el tipo MIME, ni en el
  nombre, ni en que no vaya a mentir en los datos.»
- «Un recurso ajeno devuelve `404`, no `403`. No queremos que el sistema confirme que un
  ticket existe a quien no le corresponde.»
- «Los *refresh tokens* se guardan hasheados. Si la base se filtra, los tokens no sirven.»

**Para defender el alcance:**

- «Esa funcionalidad está fuera del alcance de esta entrega; el punto de extensión ya está
  preparado, y por eso añadirla no requiere refactorizar.»
- «Preferimos entregar bien el núcleo del proceso que entregar a medias cinco módulos. La
  arquitectura está pensada para que lo que falta se añada sin reescribir lo que ya está.»

**Para recuperar el control de la conversación:**

- «¿Le muestro el flujo completo, o prefiere empezar por un caso borde en particular?»
- «¿Quiere verlo desde la interfaz o prefiere que lo ataquemos directamente con Postman?»

---

## 5. Chuleta de una página (para llevar impresa)

```
┌─────────────────────────────────────────────────────────────────────────┐
│  PITCH — 120 s                                                          │
│  1. Problema: las solicitudes se pierden por correo y chat.             │
│  2. Promesa: nada se pierde · todo se audita · el desempeño se mide.    │
│  3. Roles: solicitante crea · agente resuelve · admin mide.             │
│  4. Diferenciador: capas + inyección de dependencias + máquina de       │
│     estados + auditoría por trigger en la base de datos.                │
│  5. Prueba: Docker en un comando · 47 pruebas · Postman · k6.           │
│  6. Cierre: ¿por dónde prefiere empezar?                                │
├─────────────────────────────────────────────────────────────────────────┤
│  TRES BORDES                                                            │
│  A. Archivos  → firma binaria + corte en streaming + cuota + rate limit │
│  B. Inyección → consultas parametrizadas + lista blanca en ORDER BY     │
│  C. Cero datos → 200 + cabecera propia + NULLIF en promedios           │
├─────────────────────────────────────────────────────────────────────────┤
│  RESCATE EN VIVO — 4 pasos                                              │
│  Reconocer → Explicar → Reencuadrar → Ofrecer alternativa               │
│  Nunca: «no sé por qué pasó». Siempre: qué pasó, dónde el límite,       │
│  qué haría falta para resolverlo.                                       │
├─────────────────────────────────────────────────────────────────────────┤
│  REMATES                                                                │
│  · «El usuario no escribe SQL; escribe datos.»                          │
│  · «No confiamos en nada que venga del cliente.»                        │
│  · «El caso borde está contemplado como caso normal.»                   │
│  · «Esa capa existe para no tocar el negocio cuando cambie el resto.»   │
└─────────────────────────────────────────────────────────────────────────┘
```

---

*Documento de sustentación — Sistema de Tickets · Proyecto de fin de curso.*
