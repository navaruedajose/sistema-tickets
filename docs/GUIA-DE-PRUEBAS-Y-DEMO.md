# Guía de pruebas y demo en vivo

> **Para qué sirve este documento:** es tu guion para el día de la presentación.
> Contiene (1) cómo preparar todo en 5 minutos, (2) un recorrido clic por clic
> por la aplicación, (3) las cuatro pruebas técnicas que puedes ejecutar delante
> del profesor, (4) demos "difíciles" que casi nadie prepara, y (5) las diez
> preguntas que con más probabilidad te van a hacer, con la respuesta y la
> evidencia exacta que debes mostrar.
>
> Todo lo que aparece aquí fue **ejecutado y verificado** contra el sistema en
> marcha. Los números (48 comprobaciones, 47 pruebas, 53 peticiones, 8 tablas…)
> son reales, no estimaciones.

---

## Índice

1. [Resumen: las cinco formas de probar](#1-resumen-las-cinco-formas-de-probar)
2. [Antes de la presentación (checklist de 5 minutos)](#2-antes-de-la-presentación-checklist-de-5-minutos)
3. [Guion de demo en vivo (12–15 minutos)](#3-guion-de-demo-en-vivo-1215-minutos)
4. [Prueba 1 — Jest: pruebas unitarias y de integración](#4-prueba-1--jest-pruebas-unitarias-y-de-integración)
5. [Prueba 2 — verificar-api.js: 48 comprobaciones de extremo a extremo](#5-prueba-2--verificar-apijs-48-comprobaciones-de-extremo-a-extremo)
6. [Prueba 3 — Postman: 53 peticiones en 9 carpetas](#6-prueba-3--postman-53-peticiones-en-9-carpetas)
7. [Prueba 4 — k6: prueba de carga](#7-prueba-4--k6-prueba-de-carga)
8. [Demos "de profesor": SQL, curl y sabotaje](#8-demos-de-profesor-sql-curl-y-sabotaje)
9. [Las diez preguntas más probables](#9-las-diez-preguntas-más-probables)
10. [Plan B: qué hacer si algo falla en vivo](#10-plan-b-qué-hacer-si-algo-falla-en-vivo)
11. [Checklist final imprimible](#11-checklist-final-imprimible)

---

## 1. Resumen: las cinco formas de probar

| # | Prueba | Qué demuestra | Duración | Comando |
|---|--------|---------------|----------|---------|
| 1 | **Jest** | Lógica de negocio y rutas aisladas | 20 s | `npx jest` |
| 2 | **verificar-api.js** | 48 comprobaciones reales contra los contenedores | 30 s | `node scripts/verificar-api.js` |
| 3 | **Postman** | Los endpoints documentados, con ejemplos | 5 min | Importar colección |
| 4 | **k6** | Comportamiento bajo carga (50–200 usuarios) | 2 min | `k6\EJECUTAR-CARGA.bat tasa` |
| 5 | **Demo manual** | La aplicación de verdad, en el navegador | 10 min | `http://localhost:5173` |

**La estrategia recomendada:** empieza por la demo manual (es lo que impresiona),
y cuando el profesor pida "cómo sé que funciona por dentro", lanzas la prueba 2
(48 comprobaciones) y la 1 (Jest). Postman y k6 son para si te preguntan por
esos artefactos concretos.

---

## 2. Antes de la presentación (checklist de 5 minutos)

### Paso 1 — Abre CMD **dentro** de la carpeta del proyecto

Este es el error que te dio "la ruta no existe": **la carpeta tiene un espacio**
(`WorkBuddy AI`), así que `cd` sin comillas corta la ruta en `WorkBuddy`.

**La forma más fácil y a prueba de errores:**

1. Abre el **Explorador de Windows** y entra a la carpeta `sistema-tickets`.
2. Haz clic en la **barra de direcciones** (arriba, donde dice la ruta).
3. Borra lo que hay, escribe `cmd` y pulsa **Enter**.

Se abre CMD **ya situado en la carpeta correcta**. No hay que escribir ninguna ruta.

> Si prefieres escribir la ruta a mano, recuerda las comillas:
> ```bat
> cd /d "C:\Users\5700X\WorkBuddy AI\2026-09-22-15-57-36\sistema-tickets"
> ```
> Sin las comillas, CMD intenta entrar a `C:\Users\5700X\WorkBuddy` y falla.

### Paso 2 — Arranca el sistema

**Opción fácil:** doble clic en **`INICIAR.bat`** (en la carpeta del proyecto).

El archivo hace todo solo: comprueba que Docker esté encendido, comprueba que
exista el archivo `.env`, levanta los tres contenedores, y espera a que la base
de datos esté lista para cargar los datos de ejemplo (reintenta hasta 6 veces,
porque PostgreSQL tarda unos segundos en aceptar conexiones).

**Opción manual:**

```bat
docker compose up -d --build
docker compose exec -T backend npm run db:seed
```

### Paso 3 — Comprueba que los tres contenedores están sanos

```bat
docker compose ps
```

Debes ver **`(healthy)`** en los tres:

```
NAME               STATUS
tickets_backend    Up (healthy)    0.0.0.0:4000->4000/tcp
tickets_frontend   Up (healthy)    0.0.0.0:5173->80/tcp
tickets_postgres   Up (healthy)    0.0.0.0:5432->5432/tcp
```

Si alguno dice `starting`, espera 20 segundos y vuelve a ejecutarlo.

### Paso 4 — Abre las tres pestañas que vas a necesitar

| Pestaña | Dirección | Para qué |
|---------|-----------|----------|
| 1 | `http://localhost:5173` | La aplicación (lo que ve el usuario) |
| 2 | `http://localhost:4000/api/v1/salud` | La API responde |
| 3 | `http://localhost:8080` | Adminer (ver la base de datos) |

**Adminer** (pestaña 3): servidor `postgres`, usuario `tickets_user`,
contraseña `tickets_pass_local_2026`, base de datos `tickets_db`.

### Paso 5 — Ten a mano las credenciales

**Contraseña para TODAS las cuentas:** `Demo2026#Tickets`

| Rol | Correo | Úsalo para demostrar |
|-----|--------|----------------------|
| Administrador | `admin@sistema-tickets.local` | Ver todo, reportes, gestión de usuarios |
| Agente | `agente1@sistema-tickets.local` | Atender y resolver tickets |
| Solicitante | `usuario1@sistema-tickets.local` | Crear tickets, subir evidencias |

> **Truco para la demo:** abre **dos navegadores distintos** (o una ventana de
> incógnito). Entra como `usuario1` en uno y como `admin` en el otro. Así puedes
> demostrar en vivo que el solicitante **solo ve sus propios tickets** mientras
> el administrador ve todos. Es el momento más convincente de toda la
> presentación.

---

## 3. Guion de demo en vivo (12–15 minutos)

Sigue este orden. Cada bloque tiene lo que **haces** y lo que **dices**.

### Bloque 1 — Presentación y login (2 min)

**Haces:** abres `http://localhost:5173`. Entras con `usuario1@sistema-tickets.local`.

**Dices:**
> "El sistema tiene tres roles: solicitante, agente y administrador. Cada rol ve
> un menú distinto. Empiezo como solicitante, que es el usuario normal de la
> empresa. El login usa JWT con rotación de tokens: el token de refresco se
> guarda **hasheado** en la base de datos, nunca en texto plano."

**Evidencia de que el rol importa:** fíjate en que el menú **no** muestra
"Usuarios" ni "Categorías". No es que estén ocultos por CSS: el backend devuelve
**403** si intentas llamarlos.

---

### Bloque 2 — Crear un ticket con evidencia (3 min)

**Haces:**
1. Clic en **Nuevo ticket**.
2. Rellena:
   - Título: `La impresora del piso 5 no responde`
   - Descripción: algo con más de 20 caracteres (el backend lo valida)
   - Categoría: **Hardware**
   - Prioridad: **ALTA**
3. En el campo de adjuntos, sube **una captura de pantalla** (cualquier PNG o JPG).
4. Guarda.

**Dices:**
> "El archivo se sube en el mismo formulario. El backend **no confía en la
> extensión**: lee los primeros bytes del archivo y comprueba la firma binaria.
> Un `.exe` renombrado a `.png` se rechaza con un 422. Además calcula el
> **SHA-256** de cada evidencia y el nombre en disco lo genera el servidor, así
> que no se puede hacer *path traversal*."

**Lo que acaba de pasar (por dentro), si te lo preguntan:**
- Se generó el folio automáticamente por un **trigger** de PostgreSQL: `TK-2026-000014`
- Se calculó la **fecha límite de SLA** con otro trigger (categoría Hardware)
- Se registró una fila en el **historial** con otro trigger (auditoría)
- El archivo se guardó con nombre generado por el servidor y se verificó su hash

---

### Bloque 3 — El ciclo de vida del ticket (3 min)

**Haces:** abre el ticket recién creado. Intenta cambiar el estado a **RESUELTO**.

**Dices:**
> "Aquí está el punto clave: **como solicitante no puedo marcar mi propio ticket
> como resuelto**. El backend responde 403. Solo un agente o administrador puede
> hacerlo. Y si intento un salto ilegal — por ejemplo de NUEVO directo a CERRADO
> — la máquina de estados lo bloquea con un 409."

**Ahora cambia de pestaña y entra como `agente1@sistema-tickets.local`:**

1. Abre el mismo ticket.
2. Cámbialo a **EN_PROGRESO** → funciona.
3. Intenta ponerlo **RESUELTO** sin escribir la solución → **400**, te exige la solución.
4. Escribe la solución y marca **RESUELTO** → funciona.

**Dices:**
> "La máquina de estados tiene transiciones explícitas y además una regla de
> negocio: un ticket no puede marcarse como resuelto sin documentar **cómo** se
> resolvió. Eso es el `TRANSICIONES_PERMITIDAS` del servicio, no del controlador."

**Y añade (esto es oro):**
> "Al pasar a RESUELTO se disparó una **notificación** al solicitante. No se
> envía directamente: se guarda primero en una tabla `notificaciones` y luego se
> procesa. Es el **patrón Outbox** — si el proveedor de correo está caído, la
> notificación no se pierde, queda pendiente y se reintenta."

---

### Bloque 4 — Los reportes (3 min)

**Haces:** como `admin`, entra a **Reportes**.

1. Genera el reporte **PDF** → se descarga.
2. Genera el reporte **Excel (XLSX)** → se descarga.
3. Abre el dashboard con las gráficas.

**Dices:**
> "Los reportes salen en PDF y Excel. Internamente hay un **patrón Strategy**:
> el controlador pide un reporte y el sistema elige el generador. Para añadir un
> tercer formato — CSV, por ejemplo — se crea una clase nueva y se registra; no
> se toca ninguna otra parte del código. Eso es el **principio Open/Closed**."

**Muestra el Excel** y señala: hoja de tickets, hoja de desempeño por agente,
totales.

**Truco de robustez (te va a hacer ganar puntos):** en el rango de fechas,
pon una fecha **desde** mayor que la **hasta**. El sistema responde **400** con
un mensaje claro, no revienta.

---

### Bloque 5 — Aislamiento de datos entre usuarios (2 min)

**Haces:** vuelve a la pestaña del `usuario1`. Copia de la barra de direcciones
el ID de **su** ticket. Ahora ve a la pestaña del `usuario2` y pega esa URL.

**Dices:**
> "El `usuario2` intenta abrir el ticket del `usuario1` cambiando el ID en la
> URL. El sistema devuelve **404, no 403**. Es una decisión deliberada: si
> devolviéramos 403, estaríamos confirmando que ese ticket existe y filtraríamos
> información. Un 404 no revela nada."

> **Por qué 404 y no 403:** es una técnica de seguridad conocida. Muchos
> sistemas fallan aquí y dejan que un usuario descubra los IDs de otros.

---

### Bloque 6 — Cierre (1 min)

**Dices:**
> "Todo esto corre en tres contenedores Docker: PostgreSQL, la API en Node.js y
> el frontend en React servido por nginx, que además hace de proxy inverso.
> La documentación incluye los tres diagramas: casos de uso, arquitectura y
> modelo entidad-relación. Y hay 48 comprobaciones automáticas de extremo a
> extremo que puedo ejecutar ahora mismo si quiere verlas."

---

## 4. Prueba 1 — Jest: pruebas unitarias y de integración

**Qué demuestra:** que la lógica de negocio y las rutas están cubiertas por
pruebas automatizadas, sin necesitar la base de datos real (se usa un doble).

**Resultado real:** **47 pruebas, 3 suites, todas pasan.**

### Cómo ejecutarla

```bat
cd backend
npx jest
```

Salida esperada (lo importante está al final):

```
PASS tests/unidad/ticket.service.test.js
PASS tests/unidad/error.middleware.test.js
PASS tests/integracion/rutas.test.js

Test Suites: 3 passed, 3 total
Tests:       47 passed, 47 total
```

### Qué contarle al profesor

| Archivo | Qué prueba |
|---------|-----------|
| `tests/unidad/ticket.service.test.js` | La **máquina de estados** y las reglas de negocio, con un repositorio simulado |
| `tests/unidad/error.middleware.test.js` | La **traducción central de errores**: 409 por duplicado, 400 por UUID malformado, **503 cuando la base de datos no responde** |
| `tests/integracion/rutas.test.js` | Las **rutas HTTP** de extremo a extremo con `supertest`: 401 sin token, 400 con datos inválidos, 404 en ruta inexistente |

**Punto clave para mencionar:**
> "Las pruebas unitarias **no tocan la base de datos**. El servicio recibe sus
> dependencias por constructor, así que en la prueba le inyecto un repositorio
> falso. Eso es la **inversión de dependencias** en la práctica: por eso puedo
> probar la lógica de negocio en 2 segundos."

**El caso que más vale la pena presumir:** `error.middleware.test.js` prueba el
escenario "la base de datos está caída" **sin apagar la base de datos**. Como
`normalizarError` es una función pura, basta con fabricar el objeto de error que
produce el driver:

```js
const error = new Error('fallo simulado');
error.code = 'ECONNREFUSED';
// normalizarError(error) -> AppError con estadoHttp 503
```

> "Probar el fallo de la base de datos en una prueba de integración sería
> frágil: habría que detener un contenedor a mitad de la suite. Como separé la
> traducción de errores en una función pura, la pruebo con 23 casos en
> milisegundos y de forma determinista. Eso es **diseño para testabilidad**."

### Si te pregunta por qué no se ejecuta dentro de Docker

> "La imagen de producción usa `npm ci --omit=dev`, así que **no incluye Jest**
> — y es correcto que no lo incluya: las herramientas de desarrollo no deben
> viajar a producción. Es una decisión de seguridad y de tamaño de imagen."

Esto convierte una posible debilidad aparente en una decisión de diseño
defendible. (Si intentas `docker compose exec backend npm test`, verás
`sh: jest: not found` — es esperado, no es un error.)

**Pero si el profesor quiere verlo correr dentro de Docker**, el `Dockerfile`
tiene una **tercera etapa** llamada `pruebas`, que solo se construye cuando se
pide explícitamente:

```bat
REM Opcion A: el servicio `pruebas` del compose (la mas corta)
docker compose --profile pruebas run --rm pruebas

REM Opcion B: construir y ejecutar la etapa a mano
docker build --target pruebas -t tickets-backend-pruebas ./backend
docker run --rm tickets-backend-pruebas

REM Opcion C: doble clic en PROBAR.bat
```

Salida esperada: `Tests: 47 passed, 47 total`.

> "El `Dockerfile` tiene tres etapas: `dependencias`, `production` y `pruebas`.
> La etapa de pruebas instala Jest y copia la carpeta `tests/`; la de producción
> no. Como son etapas separadas, Docker **solo construye la que le pides**, así
> que el flujo normal (`docker compose up --build`) ignora la etapa de pruebas
> por completo y la imagen de producción sigue pesando lo mínimo."

Esto es **build multi-etapa** aplicado con criterio: la misma receta produce
tanto el artefacto de producción como el entorno de pruebas, sin comprometer
ninguno de los dos.

---

## 5. Prueba 2 — verificar-api.js: 48 comprobaciones de extremo a extremo

**Qué demuestra:** que **todo** funciona contra los contenedores reales, con
PostgreSQL de verdad. Es la prueba más contundente que tienes.

**Resultado real: 48 pasaron, 0 fallaron.**

### Cómo ejecutarla

```bat
cd backend
node scripts/verificar-api.js
```

Salida esperada (fragmento):

```
=== 10. SUBIDA DE EVIDENCIAS ===
  PASA   Sube una evidencia PNG valida
  PASA   La respuesta incluye el hash SHA-256 del archivo
  PASA   RECHAZA un ejecutable renombrado a .png (firma binaria) -> 422
  PASA   RECHAZA una extension no permitida (.exe) -> 422
  PASA   RECHAZA un archivo de 11 MB (limite 10 MB) -> 413
  PASA   Acepta una evidencia PDF valida
  PASA   Lista los adjuntos del ticket
  PASA   Descarga una evidencia
  PASA   La evidencia descargada trae los bytes correctos

============================================================
  RESULTADO: 48 pasaron, 0 fallaron
============================================================
```

### Las 11 secciones que cubre

| Sección | Qué verifica |
|---------|--------------|
| 1. Autenticación | Login correcto, contraseña incorrecta, token inválido |
| 2. Seguridad por filas | Un usuario **no** puede ver el ticket de otro (404) |
| 3. Máquina de estados | 403 por rol, 409 por transición ilegal, 400 sin solución |
| 4. Auditoría | El trigger registró cada cambio en el historial |
| 5. Inyección SQL | Comillas, `DROP TABLE`, `ORDER BY` malicioso → el sistema aguanta |
| 6. Validación de entrada | Título corto → 400, ID no-UUID → 400 |
| 7. Permisos por rol | Solicitante y agente → 403 al listar usuarios |
| 8. Reportes | PDF, Excel, rango invertido, y el caso de **cero datos** |
| 9. Notificaciones | Se registró la notificación al pasar a RESUELTO |
| 10. Subida de archivos | Firma binaria, extensión, tamaño, hash, descarga |
| 11. Limpieza | Borrado lógico y que el ticket deja de ser accesible |

### Los tres casos que más impresionan

**a) Inyección SQL.** El script manda un buscador con `'; DROP TABLE tickets; --`
y luego comprueba que la tabla **sigue existiendo**. Si el profesor pregunta por
seguridad, esta es tu respuesta:

> "Todas las consultas usan **parámetros vinculados** (`$1`, `$2`), nunca
> concatenación de texto. El `ORDER BY` es la única parte que no se puede
> parametrizar, así que ahí uso una **lista blanca**: si el valor no está en la
> lista, cae al orden por defecto. Y en los `LIKE` escapo los comodines `%` y `_`
> para que un usuario no pueda alterar la búsqueda."

**b) El ejecutable disfrazado.** El script crea un archivo que empieza con los
bytes `MZ` (firma de un ejecutable de Windows) pero lo nombra `virus.png` y
declara el tipo `image/png`. El sistema lo **rechaza con 422**:

> "No basta con mirar la extensión ni el `Content-Type` que envía el navegador:
> ambos los controla el atacante. Leemos los **primeros bytes** del archivo y
> verificamos la firma real. Es la misma técnica que usan los antivirus."

**c) El reporte con cero datos.** Pides un reporte de un rango donde no hay
tickets. Muchos sistemas devuelven un error o un archivo corrupto. Este devuelve
**200** con la cabecera `X-Reporte-Sin-Datos: true` y un **PDF válido** que dice
"sin datos en el período":

> "El usuario igual recibe un documento que puede abrir y guardar. No es un
> error: es un resultado válido. Y la cabecera le permite al frontend mostrar un
> aviso sin tener que abrir el archivo."

---

## 6. Prueba 3 — Postman: 53 peticiones en 9 carpetas

**Qué demuestra:** que la API está documentada y es explorable por terceros.

**Ubicación:** carpeta `postman/`

| Archivo | Contenido |
|---------|-----------|
| `Sistema-Tickets.postman_collection.json` | La colección: **9 carpetas, 53 peticiones** |
| `Sistema-Tickets-Local.postman_environment.json` | Entorno local (`localhost:4000`) |
| `Sistema-Tickets-Nube.postman_environment.json` | Entorno desplegado en la nube |

### Cómo importarla

1. Abre Postman.
2. **Import** (arriba a la izquierda).
3. Arrastra los **dos** archivos: la colección y el entorno `Local`.
4. Arriba a la derecha, selecciona el entorno **"Sistema-Tickets Local"**.
5. En la carpeta **1. Autenticación**, ejecuta **"Iniciar sesión (admin)"**.
6. Listo: el resto de peticiones ya funcionan.

### Por qué funciona sin configurar nada

La petición de login tiene un **script de prueba** que guarda el token
automáticamente:

```js
pm.environment.set('token', pm.response.json().datos.tokenAcceso);
```

Y el resto de peticiones usan `{{token}}`. **Todas las 53 peticiones tienen
scripts de aserción**, así que Postman te dice en verde/rojo si cada una pasó.

### Las 9 carpetas

| # | Carpeta | Qué contiene |
|---|---------|--------------|
| 1 | `00 - Salud del sistema` | Estado de la API y de la base de datos |
| 2 | `01 - Autenticación` | Login, refresco, cierre de sesión, registro |
| 3 | `02 - Categorías` | CRUD de categorías y sus SLA |
| 4 | `03 - Tickets (CRUD)` | Crear, listar, filtrar, cambiar estado, asignar |
| 5 | `04 - Comentarios` | Conversación dentro de un ticket |
| 6 | `05 - Evidencias (carga de archivos)` | Subida, listado, descarga y borrado |
| 7 | `06 - Reportes` | PDF, Excel, dashboard |
| 8 | `07 - Notificaciones` | Bandeja y reintento de envíos |
| 9 | `08 - Pruebas de seguridad` | **Inyección SQL, acceso cruzado entre usuarios, rol incorrecto** |

**Fíjate en la carpeta 9.** Es la que más impresiona: no son peticiones para
"ver si funciona", son **intentos de ataque** que el sistema debe rechazar.

**Qué decir:**
> "La colección cubre los 44 endpoints con casos de éxito y casos de error:
> peticiones sin token, con rol incorrecto, con datos inválidos. Y hay una
> carpeta entera dedicada a pruebas de seguridad: inyección SQL, intentos de
> leer el ticket de otro usuario, y saltarse los permisos por rol. No es solo
> 'probar que funciona': es una suite de regresión y de seguridad."

---

## 7. Prueba 4 — k6: prueba de carga

**Qué demuestra:** que analizaste el comportamiento bajo estrés, no solo la
funcionalidad.

**Ubicación:** carpeta `k6/` — `load-test.js` (5 escenarios) y `smoke-test.js`.

### Los 5 escenarios

| Escenario | Perfil | Uso |
|-----------|--------|-----|
| `carga` | Sube a 50 usuarios, 3 min de meseta | El escenario por defecto |
| `tasa` | Tasa constante de peticiones por segundo | Medir capacidad sostenida |
| `estres` | Sube hasta **200 usuarios** | Encontrar el punto de quiebre |
| `picos` | De 5 a 150 usuarios en 10 segundos | Simular un pico repentino |
| `mixto` | 40 usuarios con operaciones variadas | Tráfico realista |

### Cómo ejecutarla

**Opción A — la más sencilla en Windows (recomendada):**

```bat
k6\EJECUTAR-CARGA.bat tasa
```

Ese archivo desactiva los tres limitadores de tasa, ejecuta la prueba y **los
vuelve a activar al terminar**. Es necesario: la prueba de carga y el limitador
son incompatibles (ver más abajo).

**Opción B — con Docker a mano:**

```bat
docker run --rm -i ^
  -e URL_BASE=http://host.docker.internal:4000/api/v1 ^
  -e ESCENARIO=tasa ^
  grafana/k6 run - < k6/load-test.js
```

> **Ojo con `URL_BASE`:** dentro del contenedor de k6, `localhost` es el propio
> contenedor, no tu equipo. Sin `host.docker.internal` la prueba falla con
> "connection refused" y parece que el sistema está caído cuando no lo está.

**Opción C — si tienes k6 instalado:**

```bat
k6 run -e ESCENARIO=carga k6/load-test.js
```

**Versión rápida para la demo** (~30 s, no tumba nada):

```bat
docker run --rm -i -e URL_BASE=http://host.docker.internal:4000/api/v1 ^
  grafana/k6 run - < k6/smoke-test.js
```

### Los umbrales (thresholds) que definiste

Hay **dos perfiles**, porque exigir lo mismo en un portátil que en un servidor
dedicado no es honesto:

| Umbral | Perfil `local` (por defecto) | Perfil `produccion` |
|---|---|---|
| `http_req_duration p(95)` | < 2500 ms | < 800 ms |
| `http_req_duration p(99)` | < 15000 ms | < 2000 ms |
| `creacion_ticket_duracion p(95)` | < 2000 ms | < 1000 ms |
| `creacion_ticket_exito` | > 90 % | > 90 % |
| `errores_5xx_total` | **= 0** | **= 0** |
| `listado_tickets_duracion p(95)` | < 500 ms | < 500 ms |

Se elige con `-e PERFIL=local` (por defecto) o `-e PERFIL=produccion`. El perfil
`local` **está calibrado con las mediciones**, no elegido a ojo: se midió un p95
de 1.479 ms y el umbral se puso en 2.500 ms (margen 1,7×).

**Qué decir:**
> "Definí umbrales, así que la prueba no es «mirar números»: si no se cumplen,
> k6 **falla con código de salida distinto de cero**, y eso permite usarla en un
> pipeline de integración continua. Uso dos perfiles porque en mi portátil
> comparten CPU PostgreSQL, Node, nginx y el propio k6: exigir 800 ms ahí sería
> deshonesto, la prueba fallaría siempre y dejaría de ser un criterio. El perfil
> `produccion` mantiene los objetivos exigentes. Y el perfil local no lo elegí a
> ojo: lo calibré con la medición real, con 1,7× de margen para detectar
> regresiones sin fallar por ruido."

### El dato que debes memorizar

Con `ESCENARIO=tasa` (20 peticiones por segundo durante 3 minutos) medí:

| Métrica | Valor |
|---|---|
| Tickets creados | **3.452** |
| Tasa de aceptación | **100 %** |
| Errores 5xx | **0** |
| Latencia p95 | 1.479 ms (con `DB_POOL_MAX=50`) |
| Listado con filtros p95 | **9 ms** (escenario `mixto`) |

Y el hallazgo que más impresiona: **subir el pool de conexiones de 10 a 50 bajó
el percentil 95 de 5.217 ms a 1.517 ms — 3,4× mejor — sin tocar una sola línea
de código.** El diagnóstico completo está en
[`RENDIMIENTO.md`](RENDIMIENTO.md).

> **Nota honesta:** en tu máquina local, los usuarios virtuales compiten por los
> mismos recursos que el resto del sistema. Si el profesor quiere verlo en vivo,
> usa `smoke-test.js` o el escenario `carga` — son rápidos y no tumban nada.
> El escenario `estres` (200 usuarios) es para correrlo con tiempo.

### El limitador y la prueba de carga son incompatibles

El backend tiene **tres** limitadores, y el que arruina la medición no es el
global: `RATE_LIMIT_COSTOSAS_MAX` (20 por minuto) se aplica **directamente a
`POST /tickets`**, que es justo lo que la prueba quiere medir.

En la primera ejecución real, de **3.597 peticiones 3.429 recibieron un 429**
(el 95%) y solo se crearon 60 tickets. Ese resultado es *correcto* —el sistema se
defiende— pero no dice nada sobre la capacidad real.

> **Para DEMOSTRAR que el limitador funciona**, haz lo contrario: déjalo activo y
> ejecuta el escenario `estres`. Verás cómo responde 429 en lugar de caerse. Eso
> es la defensa funcionando, no un fallo.

Si alguien te pregunta por qué el sistema devolvió 429 en vez de crear el
ticket, esa es la respuesta: **prefiere rechazar peticiones de forma ordenada
antes que agotar el pool de conexiones y caerse.**

---

## 8. Demos "de profesor": SQL, curl y sabotaje

Estas tres demos son las que **nadie prepara**. Te van a diferenciar.

### Demo A — Ver la base de datos desde dentro

```bat
docker compose exec postgres psql -U tickets_user -d tickets_db
```

Ya dentro, ejecuta:

```sql
-- 1. Los tickets con su folio generado por trigger y su SLA calculado
SELECT codigo, titulo, estado, prioridad, fecha_limite_sla
FROM tickets WHERE eliminado_en IS NULL ORDER BY creado_en DESC LIMIT 5;

-- 2. El historial de auditoría (lo escribió un trigger, no el código)
SELECT h.estado_anterior, h.estado_nuevo, h.creado_en, u.nombre_completo
FROM historial_tickets h JOIN usuarios u ON u.id = h.usuario_id
ORDER BY h.creado_en DESC LIMIT 10;

-- 3. El desempeño por agente (una vista analítica)
SELECT * FROM vista_desempeno_agentes;

-- 4. Las notificaciones pendientes (patrón Outbox)
SELECT canal, estado, asunto, creado_en FROM notificaciones
ORDER BY creado_en DESC LIMIT 10;

-- 5. Comprobar que TODOS los tickets tienen SLA calculado
SELECT count(*) AS tickets_sin_sla FROM tickets WHERE fecha_limite_sla IS NULL;
```

**Lo importante de la consulta 5:** debe devolver **0**. Es la prueba de que el
arreglo del trigger de SLA funcionó.

**Qué decir:**
> "Fíjense que el folio `TK-2026-000014` no lo genera la aplicación: lo genera un
> **trigger** de PostgreSQL con una secuencia. Si mañana otro servicio inserta un
> ticket directamente en la base, también recibe folio. La lógica de integridad
> vive donde corresponde: en la base de datos."

Para salir: `\q`

### Demo B — Llamar a la API con curl (sin Postman)

Muestra que la API es una API REST de verdad, consumible desde cualquier cliente.

```bat
curl -X POST http://localhost:4000/api/v1/auth/iniciar-sesion ^
  -H "Content-Type: application/json" ^
  -d "{\"correo\":\"admin@sistema-tickets.local\",\"contrasena\":\"Demo2026#Tickets\"}"
```

> En CMD, el carácter de continuación de línea es `^`. Si te da problemas, pon
> todo en una sola línea.

Copia el token de la respuesta y úsalo:

```bat
curl http://localhost:4000/api/v1/tickets ^
  -H "Authorization: Bearer AQUI_VA_EL_TOKEN"
```

**Y ahora el caso que impresiona** — pide un ticket que no existe:

```bat
curl -i http://localhost:4000/api/v1/tickets/00000000-0000-0000-0000-000000000000 ^
  -H "Authorization: Bearer AQUI_VA_EL_TOKEN"
```

Devolverá **404** con un JSON estructurado, no un HTML de error.

**Qué decir:**
> "Todos los errores tienen el mismo formato: un código, un mensaje y, si aplica,
> el detalle de los campos que fallaron. Eso hace que el frontend pueda mostrar
> errores útiles sin adivinar."

### Demo B2 — Las cabeceras de seguridad (30 segundos, muy visual)

Demuestra que la seguridad no está solo en el código, sino también en cómo se
sirve la aplicación.

```bat
curl -s -D - -o nul http://localhost:5173/
```

Salen las 5 cabeceras. La que impresiona es la **CSP**:

```
Content-Security-Policy: default-src 'self'; script-src 'self'; style-src 'self'
'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:;
connect-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self';
frame-ancestors 'self'
```

**Qué decir:**
> "Aunque un atacante consiguiera inyectar HTML en la página, el navegador se
> negaría a **ejecutar** scripts que no vengan del propio origen, porque
> `script-src` es `'self'` y no incluye `'unsafe-inline'`. Es la defensa de
> fondo contra XSS: actúa incluso cuando la validación de entrada falla."

**Y la pregunta que casi nadie sabe responder** — comprueba que la API **no**
lleva cabeceras duplicadas:

```bat
curl -s -D - -o nul http://localhost:5173/api/v1/salud
```

Verás **una sola** `Content-Security-Policy`, la del backend (helmet).

**Qué decir:**
> "El backend ya envía sus cabeceras con helmet, así que nginx no las repite en
> `/api/`. Si las repitiera, cada respuesta llevaría dos `Content-Security-Policy`
> y dos `Referrer-Policy` con valores distintos, y el navegador aplica la
> **intersección** de todas las políticas: sería ambiguo y muy difícil de
> depurar. Por eso las cabeceras de nginx van en cada `location` que sirve
> documentos, y no en el bloque `server`."

### Demo C — El sabotaje controlado (la más arriesgada y la más memorable)

**Antes de la presentación, ensaya esto.** Consiste en romper algo a propósito
y demostrar que el sistema falla **con elegancia**.

**Sabotaje 1 — Apagar la base de datos:**

```bat
docker compose stop postgres
```

Ahora recarga la aplicación en el navegador, o pide un ticket con curl.

**Qué pasa exactamente** (esto lo verifiqué yo mismo, no es teoría): la API
responde con **HTTP 503** y este JSON limpio:

```json
{
  "exito": false,
  "mensaje": "No fue posible comunicarse con la base de datos. Intente de nuevo en unos segundos.",
  "codigo": "SERVICIO_NO_DISPONIBLE"
}
```

No se cuelga, no ves una pantalla en blanco, y **no aparece ninguna traza de
código** (eso sería un regalo para un atacante).

```bat
docker compose start postgres
```

Espera ~10 segundos y recarga: todo vuelve. **Sin reiniciar la API.**

**Qué decir — y esta es la parte que te va a diferenciar:**

> "Fíjese que devuelve **503, no 500**. Es una distinción deliberada. Un 500
> significa 'hay un bug en mi código'. Un 503 significa 'mi código está bien,
> pero una dependencia no responde, y esto es temporal'.
>
> Importa por tres razones. Primero: un balanceador de carga **puede reintentar
> automáticamente un 503**, pero no un 500 — un 500 lo trata como un defecto de
> la aplicación. Segundo: el monitoreo no se llena de falsos errores cada vez
> que reinicio la base de datos por mantenimiento. Tercero: el frontend puede
> ofrecer un botón de 'reintentar' en lugar de un error definitivo.
>
> Y observe que el mensaje al usuario no dice nada de PostgreSQL ni de
> conexiones. El detalle técnico queda en el registro del servidor; al cliente
> le llega algo que puede entender."

> **Nota para ti:** el grupo de conexiones (`pg Pool`) se reconecta solo, así
> que no hace falta reiniciar la API. Pero si quieres estar seguro antes de la
> presentación, ensaya este sabotaje una vez en casa.

**Sabotaje 2 — Quitar el archivo `.env`:**

Si el profesor pregunta "¿y si falta la configuración?", puedes mostrarlo sin
miedo: el sistema **se niega a arrancar** en lugar de arrancar mal.

```bat
docker compose config
```

> "En `docker-compose.yml` la variable `JWT_SECRETO` está declarada con `:?`,
> que significa 'obligatoria'. Si no existe, Docker se detiene con un mensaje
> claro. Prefiero que no arranque a que arranque con una clave secreta por
> defecto — eso sería una vulnerabilidad grave."

**Este es el mejor argumento de todo el proyecto.** Muchos sistemas arrancan con
`secret = 'changeme'` y eso es exactamente lo que los atacantes buscan.

---

## 9. Las diez preguntas más probables

### 1. "¿Dónde está la separación de responsabilidades?"

> "Cada módulo tiene cuatro capas: **rutas → controlador → servicio →
> repositorio**. La ruta solo declara la URL y los middlewares. El controlador
> traduce HTTP a llamadas de servicio y nada más: no tiene SQL ni reglas de
> negocio. El servicio tiene la lógica. El repositorio es el único que escribe
> SQL. Si mañana cambio de PostgreSQL a otro motor, solo toco los repositorios."

**Muéstralo:** abre `backend/src/modules/tickets/` y enseña los cuatro archivos.

### 2. "¿Qué pasa si dos usuarios quieren el mismo folio?"

> "El folio no se genera en el código, se genera con una **secuencia** de
> PostgreSQL dentro de un trigger. Las secuencias son atómicas: aunque dos
> transacciones inserten al mismo tiempo, reciben números distintos. Además hay
> una restricción `UNIQUE` en la columna `codigo` como red de seguridad."

### 3. "¿Cómo evitas la inyección SQL?"

> "Parámetros vinculados en todas las consultas. La única excepción es el
> `ORDER BY`, porque SQL no permite parametrizar nombres de columna: ahí uso una
> **lista blanca** de columnas permitidas. Y en los `LIKE` escapo `%` y `_`."

**Evidencia:** sección 5 de `verificar-api.js`, que lo prueba.

### 4. "¿Y si suben un virus?"

> "Tres capas: (1) extensión permitida, (2) **firma binaria** — leo los primeros
> bytes y comparo con las firmas reales de PNG/JPEG/PDF, (3) límite de 10 MB.
> Y el archivo se guarda con un nombre generado por el servidor, nunca con el
> nombre que envía el usuario, así que no hay *path traversal*."

### 5. "¿Los archivos se guardan en la base de datos?"

> "No, y es a propósito. Los archivos van al sistema de archivos (un volumen
> Docker) y en la base solo se guarda la **ruta relativa** y el hash. Guardar
> binarios en la base la infla y hace las copias de seguridad lentísimas."

### 6. "¿Cómo funciona la autenticación?"

> "JWT con dos tokens. El de acceso dura poco y va en cada petición. El de
> refresco dura más y se guarda **hasheado** en la base de datos: si alguien
> roba la base, no puede usar los tokens. Además hay **rotación**: al usarlo se
> emite uno nuevo e invalida el anterior, así que un token robado se detecta."

### 7. "¿Por qué 404 y no 403 cuando accedo al ticket de otro?"

> "Porque un 403 confirma que el recurso existe. Con 404 el atacante no puede
> distinguir 'no existe' de 'no tienes permiso', así que no puede enumerar IDs
> válidos. Es la práctica recomendada."

### 8. "¿Esto escala?"

> "La arquitectura está preparada: la API no guarda estado en memoria, así que
> puedo levantar varias instancias detrás de un balanceador. Los archivos van a
> un volumen que en la nube sería S3. La base de datos sería el primer cuello de
> botella, y ahí la salida es un réplica de lectura para los reportes. De hecho
> **ya medí el comportamiento** con k6 hasta 200 usuarios."

### 9. "¿Qué falta? ¿Qué harías con más tiempo?"

**Contesta con honestidad — esto suma, no resta:**

> "Tres cosas. (1) **Caché con Redis** para las consultas de reportes, que son
> las más pesadas. (2) **WebSockets** para que el estado del ticket se
> actualice solo, sin recargar. (3) **Cola de trabajos** (BullMQ) para los
> reportes grandes: hoy se generan en la petición, y con un rango de un año
> tardarían. El patrón Outbox que ya uso para las notificaciones es el mismo
> punto de partida para eso."

**Por qué esto funciona:** demuestra que sabes dónde están los límites de tu
propio diseño. Un alumno que dice "está perfecto" genera desconfianza; uno que
sabe qué le falta genera respeto.

### 10. "Muéstrame un error que hayas tenido y cómo lo resolviste"

**Esta es la pregunta más importante y la que más gente desperdicia.**

> "Tuve tres bugs reales que encontré ejecutando pruebas automáticas contra el
> sistema en marcha. El primero: al cambiar el estado de un ticket, PostgreSQL
> lanzaba `inconsistent types deduced for parameter $2`. La causa: usaba el
> mismo parámetro para comparar contra un ENUM y para asignarlo, y el motor no
> podía deducir el tipo. Se arregla con un *cast* explícito: `$2::estado_ticket`.
>
> El segundo: el dashboard daba error 500 por `column reference 'creado_en' is
> ambiguous`. Yo calificaba las columnas en unas consultas pero no en las que
> tenían JOIN, y dos tablas tienen una columna con el mismo nombre. Lo arreglé
> pasando el alias de la tabla a la función que construye el filtro de fechas.
>
> El tercero: los tickets sin categoría se quedaban **sin fecha límite de SLA**.
> El trigger solo calculaba el SLA si había categoría, y el valor por defecto de
> 48 horas era código inalcanzable. Lo arreglé para que siempre calcule, con 48
> horas por defecto, e hice una migración para rellenar los registros antiguos.
>
> Lo relevante es que **ninguno de los tres se habría detectado a mano**: los
> dos primeros solo aparecían en rutas concretas y el tercero era silencioso.
> Los encontré porque escribí 48 comprobaciones automáticas contra los
> contenedores reales."

**Por qué esta respuesta gana:** demuestra que sabes depurar, que entiendes el
motor de base de datos y que usas pruebas como herramienta de descubrimiento,
no como trámite.

---

## 10. Plan B: qué hacer si algo falla en vivo

### La regla de oro

**Nunca depures en vivo.** Si algo falla delante del profesor:

1. Di qué **esperabas** que pasara.
2. Di qué crees que está pasando (una hipótesis, no una excusa).
3. Di cómo lo comprobarías.
4. **Sigue con la siguiente parte de la demo.**

Un fallo bien explicado vale más que una demo que nunca falla pero que no
entiendes.

### Fallos concretos y su arreglo

| Síntoma | Causa probable | Arreglo rápido |
|---------|----------------|----------------|
| `localhost:5173` no abre | El frontend no está listo | `docker compose ps` → espera a `(healthy)` |
| La app abre pero no carga datos | La API está caída | `docker compose restart backend`, espera 15 s |
| `Error de conexión` en el login | PostgreSQL no está listo | `docker compose restart postgres`, espera 20 s |
| No hay tickets en la lista | Faltan los datos de ejemplo | `docker compose exec -T backend npm run db:seed` |
| El login dice "credenciales inválidas" | Contraseña mal escrita | Es `Demo2026#Tickets` — cuidado con el `#` y las mayúsculas |
| El puerto 5173 está ocupado | Otro programa lo usa | Cambia `FRONTEND_PORT=5174` en `.env` y reinicia |
| Docker no arranca | Docker Desktop está apagado | Ábrelo y espera a que diga "Running" |

### El comando de emergencia

Si todo se ve raro y tienes 2 minutos, esto lo reinicia todo **sin borrar datos**:

```bat
docker compose restart
```

Y si de verdad necesitas empezar de cero (esto **sí borra** los datos):

```bat
docker compose down -v
docker compose up -d --build
docker compose exec -T backend npm run db:seed
```

### Capturas de respaldo

**Antes de la presentación, haz capturas de pantalla** de:
- El dashboard con las gráficas
- Un reporte PDF generado
- El resultado de `verificar-api.js` con el "48 pasaron, 0 fallaron"
- El resultado de `npx jest` con "47 passed"

Si el proyector o el wifi fallan, tienes la evidencia en imágenes.

---

## 11. Checklist final imprimible

### 30 minutos antes

- [ ] Docker Desktop está abierto y dice **Running**
- [ ] `INICIAR.bat` ejecutado, los **3 contenedores en `(healthy)`**
- [ ] `http://localhost:5173` abre y se ve la pantalla de login
- [ ] Las tres cuentas entran: `admin@`, `agente1@`, `usuario1@`
- [ ] Hay tickets en la lista (no está vacía)
- [ ] Ya generaste un reporte PDF y uno Excel, y se descargaron
- [ ] Las capturas de respaldo están guardadas
- [ ] La ventana de incógnito está abierta (para el demo de dos usuarios)

### 5 minutos antes

- [ ] CMD abierto **en la carpeta del proyecto** (truco de la barra de direcciones)
- [ ] `npx jest` → confirmado que dice **47 passed**
- [ ] `node scripts/verificar-api.js` → confirmado que dice **48 pasaron, 0 fallaron**
- [ ] Postman abierto con la colección importada y el entorno seleccionado
- [ ] Este documento abierto, en la sección 3 (el guion)

### Números para memorizar

| Dato | Valor |
|------|-------|
| Tablas en la base de datos | **8** |
| Tipos ENUM | **5** |
| Vistas analíticas | **2** |
| Triggers | **5** |
| Extensiones de PostgreSQL | **3** (`pgcrypto`, `unaccent`, `plpgsql`) |
| Comprobaciones automáticas de la API | **48** (todas pasan) |
| Pruebas con Jest | **47** (todas pasan) |
| Peticiones en Postman | **53** en 9 carpetas |
| Endpoints REST | **44** (41 de negocio + raíz, índice y vida) |
| Módulos de dominio | **8** |
| Contenedores | **3** |
| Usuarios de ejemplo | **6** (1 admin, 2 agentes, 3 solicitantes) |
| Tickets de ejemplo | **12** (+ los que crees tú) |
| Usuarios virtuales máximos en k6 | **200** |
| Límite de subida | **10 MB** |
| Umbral de rendimiento | p(95) < **2500 ms** (perfil `local`) · < **800 ms** (perfil `produccion`) |
| Tickets creados en la prueba de carga | **3.452** en 3 min, con **0** errores 5xx |

### Las tres frases que debes decir sí o sí

1. **Sobre la arquitectura:**
   > "El controlador no tiene SQL ni reglas de negocio: solo traduce HTTP a
   > llamadas de servicio. Por eso puedo probar la lógica de negocio en 2
   > segundos sin base de datos."

2. **Sobre la seguridad:**
   > "No confío en la extensión ni en el `Content-Type`: leo la firma binaria
   > del archivo. Y devuelvo 404 en vez de 403 para no revelar qué recursos
   > existen."

3. **Sobre los bugs:**
   > "Encontré tres bugs reales escribiendo pruebas automáticas contra el
   > sistema en marcha. Ninguno se habría detectado a mano."

---

## Apéndice — Referencia rápida de comandos

```bat
:: --- Arranque y parada ---
INICIAR.bat                                    :: arrancar todo (doble clic)
DETENER.bat                                    :: menú de parada
docker compose up -d --build                   :: arrancar manualmente
docker compose ps                              :: ver estado
docker compose logs -f backend                 :: ver registros en vivo
docker compose restart                         :: reiniciar sin borrar datos
docker compose down                            :: parar (conserva datos)
docker compose down -v                         :: parar y BORRAR datos

:: --- Pruebas ---
cd backend && npx jest                         :: 47 pruebas (requiere Node local)
docker compose --profile pruebas run --rm pruebas :: las 47 sin Node local
PROBAR.bat                                     :: lo mismo, con doble clic
cd backend && node scripts/verificar-api.js    :: 48 comprobaciones de extremo a extremo
k6 run k6/smoke-test.js                        :: prueba de humo (rápida)
k6\EJECUTAR-CARGA.bat tasa                     :: carga + desactiva/reactiva limitadores
k6 run -e ESCENARIO=mixto k6/load-test.js      :: carga realista (más lecturas)

:: k6 sin instalarlo (ojo: URL_BASE con host.docker.internal, no localhost)
docker run --rm -i -e URL_BASE=http://host.docker.internal:4000/api/v1 ^
  grafana/k6 run - < k6/smoke-test.js

:: --- Base de datos ---
docker compose exec postgres psql -U tickets_user -d tickets_db
docker compose exec -T backend npm run db:seed     :: cargar datos de ejemplo
docker compose exec -T backend npm run db:admin    :: crear otro administrador

:: --- Comprobaciones rápidas ---
curl http://localhost:4000/api/v1/salud            :: la API responde
curl -s -D - -o /dev/null http://localhost:5173/   :: ver las cabeceras de seguridad
```

---

*Documento generado como parte de la documentación del Sistema de Tickets.
Todos los resultados citados fueron verificados contra el sistema en ejecución.*
