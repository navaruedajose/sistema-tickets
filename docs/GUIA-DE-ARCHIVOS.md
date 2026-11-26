# Guía de archivos y uso del proyecto

> Explicación de **qué es cada archivo**, **para qué sirve** y **cómo se usa**,
> más una lista honesta de lo que queda pendiente.
>
> Sistema de Tickets — Helpdesk Empresarial · 133 archivos

---

## Índice

1. [Cómo arrancar el proyecto en 5 minutos](#1-cómo-arrancar-el-proyecto-en-5-minutos)
2. [Lo que falta (pendientes honestos)](#2-lo-que-falta-pendientes-honestos)
3. [Mapa general: qué hace cada carpeta](#3-mapa-general-qué-hace-cada-carpeta)
4. [Inventario detallado archivo por archivo](#4-inventario-detallado-archivo-por-archivo)
5. [El recorrido de una petición](#5-el-recorrido-de-una-petición-de-principio-a-fin)
6. [Las 8 preguntas que te van a hacer](#6-las-8-preguntas-que-te-van-a-hacer)

---

## 1. Cómo arrancar el proyecto en 5 minutos

### Requisito único

**Docker Desktop** instalado y **en ejecución**. Nada más — no necesitas Node ni
PostgreSQL en tu máquina, porque todo corre en contenedores.

> ⚠️ **El paso que más se olvida:** abre Docker Desktop y espera a que el ícono
> deje de animarse. Si no está corriendo, `docker compose` falla con
> `failed to connect to the docker API`.

### Forma más fácil: doble clic (recomendada)

En la carpeta del proyecto hay dos archivos que puedes ejecutar con **doble clic**:

| Archivo | Qué hace |
|---|---|
| **`INICIAR.bat`** | Comprueba Docker, levanta todo y carga los datos de demostración. |
| **`DETENER.bat`** | Menú para apagar los contenedores, borrar los datos o ver el estado. |

**No tienes que escribir ninguna ruta.** El script detecta solo su propia carpeta
(con `%~dp0`), así que se salta por completo el problema del espacio en el nombre
de la carpeta — que es lo que hace fallar al comando `cd` (ver abajo).

### ⚠️ Si `cd` te dice «la ruta no existe», lee esto

**No es que la ruta no exista. Es que tu ruta tiene un ESPACIO en el medio.**

Tu carpeta es `C:\Users\5700X\`**`WorkBuddy AI`**`\2026-09-22-15-57-36\sistema-tickets`.
Ese espacio entre «WorkBuddy» y «AI» rompe el comando, porque CMD interpreta
que la ruta termina en `WorkBuddy` y que `AI\2026-...` son argumentos sueltos.
Como `C:\Users\5700X\WorkBuddy` no existe, te dice que la ruta no existe.

**La solución son las comillas.** En CMD, siempre entre comillas y con `/d`:

```cmd
cd /d "C:\Users\5700X\WorkBuddy AI\2026-09-22-15-57-36\sistema-tickets"
```

| Dónde | Comando correcto |
|---|---|
| **CMD** | `cd /d "C:\Users\5700X\WorkBuddy AI\2026-09-22-15-57-36\sistema-tickets"` |
| **PowerShell** | `cd "C:\Users\5700X\WorkBuddy AI\2026-09-22-15-57-36\sistema-tickets"` |
| **Git Bash** | `cd "/c/Users/5700X/WorkBuddy AI/2026-09-22-15-57-36/sistema-tickets"` |

> **El truco que evita escribir la ruta para siempre:** abre la carpeta del
> proyecto en el Explorador de Windows, haz clic en la **barra de direcciones**,
> escribe `cmd` y pulsa Enter. Se abre una consola **ya situada dentro de la
> carpeta**, sin necesidad de `cd`. (En PowerShell, el truco equivalente es
> escribir `powershell` en la barra de direcciones.)

**Otras dos diferencias importantes entre CMD y las guías:**

| En los ejemplos verás | En CMD se escribe | Por qué |
|---|---|---|
| `cp .env.example .env` | `copy .env.example .env` | `cp` es un comando de Linux; en CMD se usa `copy`. |
| `node -e "..."` | igual | Este sí funciona tal cual en CMD. |

> **Ya no necesitas crear el `.env`.** El archivo **`.env` ya está creado** en la
> carpeta del proyecto, con un `JWT_SECRETO` aleatorio y seguro generado para ti.
> Puedes saltarte los pasos 2 y 3 de abajo.

### Los 3 comandos

```cmd
REM 1. Entrar a la carpeta (ojo con las comillas: la ruta tiene un espacio)
cd /d "C:\Users\5700X\WorkBuddy AI\2026-09-22-15-57-36\sistema-tickets"

REM 2. Construir y levantar todo (la primera vez tarda 3-6 minutos)
docker compose up -d --build

REM 3. Cargar los datos de demostración
docker compose exec backend npm run db:seed
```

Si el paso 3 falla porque la base de datos todavía está arrancando, espera 20
segundos y repítelo. El comando es seguro de repetir: no duplica los datos.

### Ahora abre el navegador

| Qué | Dirección |
|---|---|
| **La aplicación** | <http://localhost:5173> |
| La API | <http://localhost:4000/api/v1> |
| Estado del sistema | <http://localhost:4000/api/v1/salud> |

**Inicia sesión con:**

| Correo | Contraseña | Rol |
|---|---|---|
| `admin@sistema-tickets.local` | `Demo2026#Tickets` | Administrador |
| `agente1@sistema-tickets.local` | `Demo2026#Tickets` | Agente |
| `usuario1@sistema-tickets.local` | `Demo2026#Tickets` | Solicitante |

### Comandos del día a día

Todos se ejecutan **desde la carpeta del proyecto** (si no, ver el aviso de
arriba sobre el `cd`):

```cmd
docker compose ps                      REM ¿está todo levantado?
docker compose logs -f backend         REM ver qué pasa en vivo (Ctrl+C para salir)
docker compose down                    REM apagar (CONSERVA los datos)
docker compose down -v                 REM apagar y BORRAR los datos
docker compose exec backend npm run db:seed   REM recargar los datos demo
docker compose --profile pruebas run --rm pruebas   REM correr las 47 pruebas
```

> **Aviso sobre las pruebas.** `docker compose exec backend npm test` **no** funciona
> y es intencional: la imagen de producción no instala Jest (las herramientas de
> desarrollo no viajan a producción). La suite vive en la etapa `pruebas` del
> `Dockerfile`, y se ejecuta con el perfil del compose o con `PROBAR.bat`.

Para abrir una consola SQL dentro de PostgreSQL:

```cmd
docker compose exec postgres psql -U tickets_user -d tickets_db
```

Y para inspeccionar la base de datos con ratón, levanta Adminer y abre
<http://localhost:8080> (servidor: `postgres`, usuario: `tickets_user`,
contraseña: la que pusiste en `POSTGRES_PASSWORD`):

```cmd
docker compose --profile herramientas up -d adminer
```

> **Si modificas `database/init/01-schema.sql`,** el cambio **no** se aplica solo:
> esos scripts únicamente corren cuando el volumen de PostgreSQL está vacío. Hay
> que hacer `docker compose down -v` y volver a levantar.

---

## 2. Lo que falta (pendientes honestos)

Esto es lo que **no** está terminado o no se pudo verificar. Conviene saberlo
antes de la sustentación.

### 2.1 Lo que no se pudo probar en esta máquina

| Pendiente | Por qué | Qué hacer |
|---|---|---|
| **El arranque completo con PostgreSQL real** | El demonio de Docker Desktop no estaba en ejecución durante el desarrollo, y no hay PostgreSQL local. Se verificó todo lo verificable sin base de datos: sintaxis de los 54 archivos del backend, 47 pruebas con Jest, build del frontend y validación del `docker-compose`. | **Ya está resuelto de tu parte:** se comprobó que Docker Desktop **está instalado y en ejecución** en tu equipo, y que el archivo `.env` ya existe con un secreto válido. Solo falta ejecutar `INICIAR.bat` (doble clic). |
| **Los scripts k6 contra el sistema real** | Requieren el backend levantado y `k6` instalado. Solo se validó la sintaxis. | Instala k6 y ejecuta `k6 run k6/smoke-test.js` con el sistema arriba. |

### 2.2 Lo que funciona, pero en modo reducido

| Pendiente | Estado actual | Cómo activarlo de verdad |
|---|---|---|
| **Envío real de correos** | Sin credenciales SMTP, el sistema entra en **modo consola**: la notificación se guarda completa en la tabla `notificaciones` y se escribe en el log, pero no sale un correo. | Rellena `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS` en el `.env`. Sirve cualquier proveedor (Gmail con contraseña de aplicación, Mailtrap, SendGrid). |
| **Envío real de SMS** | Igual: sin credenciales de Twilio, el SMS queda registrado en la cola con su texto completo. | Rellena `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN` y `TWILIO_FROM`. |
| **Persistencia de evidencias en la nube** | En local funciona perfecto (volumen de Docker). En planes gratuitos de Render/Railway el disco es efímero y las evidencias se pierden al redesplegar. | Añade un disco persistente, o migra a S3. Está explicado en `docs/DESPLIEGUE-NUBE.md`. |

> **El modo consola no es un defecto, es una decisión.** Permite demostrar el
> requisito de notificaciones sin depender de un servidor de correo. Menciónalo
> así en la sustentación.

### 2.3 Lo que no está implementado (fuera del alcance)

Nada de esto lo pedía el enunciado, pero es bueno saberlo por si preguntan:

| No implementado | Nota |
|---|---|
| **Recuperación de contraseña por correo** | Existe `crear-admin.js` como vía de rescate, pero no un flujo de «olvidé mi contraseña». |
| **Limpieza automática de refresh tokens expirados** | La tabla `tokens_refresco` acumula filas caducadas. Se limpian con SQL manual. |
| **Base de conocimiento / artículos de ayuda** | Fuera del alcance. |
| **Internacionalización** | La interfaz está solo en español. |
| **Integración continua (CI/CD)** | No hay `.github/workflows`. El despliegue es manual. |
| **WebSockets para actualizaciones en vivo** | Los datos se refrescan al navegar, no en tiempo real. |

---

## 3. Mapa general: qué hace cada carpeta

```
sistema-tickets/
│
├── docker-compose.yml        ← Orquesta los 4 contenedores. Empieza por aquí.
├── .env.example              ← Plantilla de configuración. Copiar a .env
├── README.md                 ← Documentación principal (con los 3 diagramas)
│
├── database/init/            ← El esquema SQL. Se ejecuta solo la primera vez.
├── backend/                  ← La API (Node.js + Express). El corazón del sistema.
├── frontend/                 ← La interfaz web (React + Tailwind).
├── postman/                  ← Colección para probar la API sin navegador.
├── k6/                       ← Pruebas de carga y de humo.
└── docs/                     ← Guías de despliegue y de sustentación.
```

### El backend en una frase

Es una API REST organizada en **8 módulos de negocio**, y cada módulo tiene
**4 capas** con responsabilidades separadas:

```
peticion.routes.js      →  declara la URL y qué middleware la protege
peticion.controller.js  →  traduce HTTP a llamadas de servicio
peticion.service.js     →  aquí viven las REGLAS DE NEGOCIO
peticion.repository.js  →  aquí vive el SQL (y solo aquí)
```

**La regla de oro:** el SQL nunca sale del repositorio, y las reglas de negocio
nunca salen del servicio. Por eso las 47 pruebas corren sin base de datos.

### El frontend en una frase

React con **11 pantallas**, un **cliente HTTP** que renueva el token solo, y
**8 componentes reutilizables**. Las gráficas son SVG escritos a mano (cero
dependencias de librerías de gráficas).

---

## 4. Inventario detallado archivo por archivo

### 4.1 Raíz del proyecto

| Archivo | Qué es | Cómo se usa |
|---|---|---|
| **`INICIAR.bat`** (92 líneas) | Arranque con un doble clic. Comprueba que Docker responde, verifica que exista el `.env`, levanta los contenedores y carga los datos de demostración. **Detecta su propia carpeta con `%~dp0`**, así que no hay que escribir ninguna ruta. | Doble clic. |
| **`DETENER.bat`** (65 líneas) | Menú para apagar los contenedores, hacer un reinicio limpio (borrando los datos) o consultar el estado. | Doble clic. |
| **`.env`** | Tu configuración local: contraseña de PostgreSQL, `JWT_SECRETO`, puertos y credenciales opcionales de correo/SMS. **No se versiona** (está en `.gitignore`). | Lo lee Docker Compose automáticamente. |
| **`docker-compose.yml`** | Define los 4 servicios: `postgres`, `backend`, `frontend` y `adminer` (opcional). Declara volúmenes, red y dependencias. | `docker compose up -d --build`. Para Adminer: `docker compose --profile herramientas up -d`. |
| **`.env.example`** | Plantilla de variables de entorno (contraseñas, secreto JWT, puertos, SMTP). | `cp .env.example .env` y editar. **Nunca** se sube el `.env` a Git. |
| **`.gitignore`** | Evita versionar `.env`, `node_modules`, `dist` y el contenido de uploads/reports. | Automático. No se ejecuta. |
| **`README.md`** | Documentación principal: descripción, los **3 diagramas Mermaid** exigidos, guía de Docker, despliegue, referencia de la API y decisiones de arquitectura. | Leer. Es lo primero que verá el evaluador. |

### 4.2 `database/init/` — el esquema SQL

| Archivo | Qué es | Cómo se usa |
|---|---|---|
| **`01-schema.sql`** (389 líneas) | El esquema completo: **8 tablas**, **5 tipos ENUM**, **5 triggers**, **2 vistas**, índices y restricciones. Los triggers generan el folio `TK-2026-000001`, calculan el SLA, y escriben la bitácora de auditoría. | **Automático.** PostgreSQL ejecuta este archivo solo, la primera vez que se crea el volumen. Para reaplicarlo: `docker compose down -v` y volver a levantar. |
| **`02-seed.sql`** (34 líneas) | Las **7 categorías** base con sus horas de SLA comprometidas: Red e Internet 8 h, Base de Datos 12 h, Correo Electrónico 12 h, Accesos y Cuentas 16 h, Hardware 24 h, Software 48 h y Solicitud de Servicio 120 h. | Automático, igual que el anterior. |

> **Ojo con una confusión frecuente:** este archivo **no crea usuarios**. Las
> contraseñas deben ir hasheadas con bcrypt, y eso no se puede hacer en SQL puro.
> Por eso los usuarios se crean con el comando aparte
> `docker compose exec backend npm run db:seed`, que ejecuta
> `backend/scripts/seed.js`.

> **Por qué los triggers y no JavaScript:** el folio se genera con una secuencia
> de PostgreSQL, así que **no hay condición de carrera** aunque 100 usuarios
> creen tickets en el mismo milisegundo. Si se generara en Node, habría que
> bloquear. Y la bitácora se escribe por trigger, así que queda registrada
> **aunque alguien modifique el ticket directamente con SQL**.

### 4.3 `backend/` — la API

#### Archivos de arranque y configuración

| Archivo | Qué es | Cómo se usa |
|---|---|---|
| **`Dockerfile`** | Build de dos etapas: instala dependencias y luego copia solo lo necesario. Usuario no root (`api`, uid 1001), `tini` como init y healthcheck. | Lo usa Docker. No se ejecuta a mano. |
| **`package.json`** | Dependencias y 5 comandos: `start`, `dev`, `test`, `db:seed`, `db:admin`. | `npm start` (producción), `npm run dev` (con recarga automática), `npm test`. |
| **`.env.example`** | Plantilla de variables del backend. | Copiar a `backend/.env` si corres sin Docker. |
| **`.dockerignore`** | Excluye `node_modules`, `tests`, `.env` de la imagen. | Automático. |
| **`src/server.js`** (149 líneas) | Arranca el servidor: construye el contenedor, crea la app, **verifica la conexión a la base de datos con reintentos**, y registra el apagado ordenado (SIGTERM). | `node src/server.js`. Docker lo lanza por ti. |
| **`src/app.js`** (161 líneas) | Construye la aplicación Express y **ordena los 9 middlewares**. Se separa de `server.js` para que las pruebas puedan usar la app sin abrir un puerto. | Lo usan `server.js` y las pruebas de integración. |
| **`src/config/env.js`** (126 líneas) | **Única fuente de verdad** de la configuración. Lee el `.env`, valida y **hace fallar el arranque** si falta `JWT_SECRETO` en producción o si contiene la palabra «desarrollo». | Automático al arrancar. |
| **`src/config/constants.js`** (88 líneas) | Los valores del dominio: roles, estados, prioridades y el mapa **`TRANSICIONES_PERMITIDAS`** (la máquina de estados). | Lo importan servicios y controladores. Es la referencia única: no se repite en ningún otro sitio. |
| **`src/config/database.js`** (89 líneas) | El pool de conexiones de PostgreSQL. Expone `consultar()`, `conTransaccion()`, `verificarConexion()`. Registra en el log las consultas que tardan más de 500 ms. | Lo usan todos los repositorios. |

#### `src/core/` — el núcleo transversal

| Archivo | Qué es | Cómo se usa |
|---|---|---|
| **`container.js`** (266 líneas) | **El archivo más importante de la arquitectura.** Es el *Composition Root*: el único lugar donde se instancian objetos concretos y se conectan entre sí. Devuelve `{ config, roles, db, repositorios, servicios, controladores, autenticacion, rutas }`. | `construirContenedor()`. `server.js` lo llama al arrancar; las pruebas lo llaman con dobles falsos. |
| **`errors/AppError.js`** (65 líneas) | La jerarquía de errores de dominio: `AppError.noEncontrado()`, `.noAutorizado()`, `.conflicto()`, `.validacion()`. Cada uno lleva su código HTTP. | Los servicios lo lanzan; el middleware de errores lo convierte en respuesta HTTP. |
| **`http/ApiResponse.js`** (63 líneas) | Da **forma uniforme** a todas las respuestas: `{ exito, datos, mensaje? }` o `{ exito: false, mensaje, codigo }`. | `ApiResponse.ok(res, datos)` en los controladores. |
| **`http/asyncHandler.js`** (19 líneas) | Envuelve funciones `async` para que los errores lleguen al middleware de errores. Sin él, un `await` que falla colgaría la petición. | Se usa en todas las rutas: `asyncHandler(async (req, res) => {...})`. |

#### `src/middlewares/` — las capas por las que pasa toda petición

| Archivo | Qué es | Cómo se usa |
|---|---|---|
| **`auth.middleware.js`** (90 líneas) | **No instancia nada**: recibe el repositorio de usuarios ya construido y devuelve `{ autenticar, autorizar }`. `autenticar` verifica el JWT y **consulta la base de datos en cada petición**, para detectar usuarios desactivados o con el rol cambiado (así un token robado deja de servir). `autorizar(...roles)` restringe por rol. | `const { autenticar, autorizar } = autenticacion;` → `router.use(autenticar)` y `autorizar('ADMINISTRADOR')` en rutas concretas. |
| **`error.middleware.js`** (126 líneas) | `noEncontrado` (404) y `manejadorDeErrores`. Traduce cualquier error a una respuesta uniforme **sin filtrar detalles internos** en producción. | Se registra al final en `app.js`, obligatoriamente. |
| **`rateLimit.middleware.js`** (68 líneas) | Limita peticiones: 300 por 15 min global, **10 intentos de login** por ventana. | `limitadorGlobal` en `app.js`; el de login en `auth.routes.js`. |
| **`validate.middleware.js`** (57 líneas) | Valida el cuerpo con **Zod** y devuelve `400` con los errores **por campo**, para que el frontend pueda resaltar el campo que falla. | `validar(esquema)` en las rutas. |
| **`upload.middleware.js`** (106 líneas) | Configura `multer`: límite de tamaño, tipos permitidos y nombre de archivo generado por el servidor. Expone `asegurarDirectorio()`. | En las rutas de adjuntos. |

#### `src/modules/` — los 8 módulos de negocio

Cada módulo tiene la misma estructura de 4 capas. Ejemplo con `tickets`:

| Archivo | Qué es | Cómo se usa |
|---|---|---|
| **`ticket.routes.js`** (101) | Declara **9 rutas** y monta **2 sub-routers** (comentarios y adjuntos: 3 + 4 rutas), lo que da los **16 endpoints** del módulo. Detalle importante: las rutas literales (`/estadisticas`) van **antes** de las paramétricas (`/:id`), o Express interpretaría «estadisticas» como un UUID. | Se monta en `routes/index.js`. |
| **`ticket.controller.js`** (66) | Traduce la petición HTTP a una llamada del servicio. Sin lógica de negocio ni `try/catch`. | Lo llaman las rutas. |
| **`ticket.service.js`** (328) | **El cerebro.** Aquí viven: `puedeVerTicket()`, `puedeEditarTicket()`, `calcularAlcance()` (seguridad por fila) y `cambiarEstado()` (valida la máquina de estados). | Lo llama el controlador; recibe el repositorio por constructor. |
| **`ticket.repository.js`** (291) | **Todo el SQL del módulo.** El `SELECT_BASE` centraliza la proyección con sus `JOIN`. El `listar()` acepta un parámetro `alcance` para el filtrado por fila. | Lo llama el servicio. Es el único que habla con PostgreSQL. |
| **`ticket.schema.js`** (101) | Los esquemas de validación Zod (título de 5+ caracteres, descripción de 10+, etc.). | Los usa el middleware `validar`. |

**Los 8 módulos:**

| Módulo | Qué hace |
|---|---|
| **`auth/`** | Registro, inicio de sesión, **rotación de refresh tokens**, perfil. Guarda solo el *hash* del refresh token. |
| **`users/`** | Gestión de usuarios (solo administrador). Incluye la lista de agentes con su carga de trabajo, para ordenar el modal de asignación. |
| **`categories/`** | CRUD de categorías y sus horas de SLA. |
| **`tickets/`** | El núcleo: crear, listar con filtros, ver, cambiar estado, asignar agente, historial, borrado lógico. |
| **`comments/`** | La conversación del ticket. El campo `es_interno` marca las notas privadas que el solicitante **no** ve. |
| **`attachments/`** | Subida y descarga de evidencias. **Verifica los *magic numbers*** (los primeros bytes del archivo), aplica cuota de 50 MB por ticket y calcula el SHA-256. |
| **`reports/`** | Generación de reportes. `report.generators.js` (426 líneas) contiene las dos clases: `PdfReportGenerator` (pdfkit) y `ExcelReportGenerator` (exceljs) — patrón Strategy. |
| **`notifications/`** | Notificaciones por correo y SMS con **patrón outbox**. `providers/email.provider.js` (nodemailer) y `providers/sms.provider.js` (Twilio vía `fetch`). |

#### Otros archivos del backend

| Archivo | Qué es | Cómo se usa |
|---|---|---|
| **`src/routes/index.js`** (124) | El mapa completo de la API v1. Incluye un endpoint `/` que **lista todos los endpoints**, útil para la sustentación. | `crearRouterPrincipal(contenedor)` desde `app.js`. |
| **`src/utils/logger.js`** (50) | Registro estructurado en JSON, con niveles. | `logger.info(...)`, `logger.error(...)`. |
| **`src/utils/pagination.js`** (78) | Paginación y **validación por lista blanca del `ORDER BY`**. Esto es clave: el nombre de una columna no se puede parametrizar, así que se valida contra una lista permitida. | Lo usan los repositorios. |
| **`scripts/seed.js`** (165) | Crea los 6 usuarios de demostración y 12 tickets con comentarios. | `docker compose exec backend npm run db:seed`. |
| **`scripts/crear-admin.js`** (64) | **Script de rescate**: crea o restablece una cuenta de administrador. Si el sistema se queda sin admins, esta es la salida. | `node scripts/crear-admin.js "Nombre" correo@dominio.com "Contrasena1"`. Sin argumentos usa valores por defecto. |
| **`tests/unidad/ticket.service.test.js`** (277) | **13 pruebas** de las reglas de negocio, con dobles inyectados. No tocan base de datos. | `npm test`. |
| **`tests/integracion/rutas.test.js`** (117) | **11 pruebas** de extremo a extremo con `supertest`: rutas, códigos de estado y forma de las respuestas. | `npm test`. |

### 4.4 `frontend/` — la interfaz

| Archivo | Qué es | Cómo se usa |
|---|---|---|
| **`Dockerfile`** (47) | Build de dos etapas: compila con Node y sirve con nginx. La imagen final (~25 MB) no contiene Node. Incluye una tercera etapa `pruebas` que solo se construye bajo petición. | Lo usa Docker. |
| **`nginx.conf`** (121) | Sirve la SPA y hace de **proxy inverso**: reenvía `/api/` a `http://backend:4000`. También añade cabeceras de seguridad y compresión. | Automático dentro del contenedor. |
| **`security-headers.conf`** (65) | Las 5 cabeceras de seguridad (incluida la **CSP**) que nginx envía en cada documento. Se incluye en cada `location` porque en nginx los `add_header` **no se heredan** si el bloque hijo declara alguno. | Automático dentro del contenedor. |
| **`public/_headers`** (39) | Las **mismas cabeceras para el hosting estático** (Netlify, Cloudflare Pages, Render). En la nube no hay nginx, así que este archivo es el único que las aplica. Ojo: su `connect-src` debe incluir el dominio público de la API, porque ahí frontend y backend son **orígenes distintos**. | Lo lee la plataforma; Vite lo copia a `dist/` en el build. |
| **`vite.config.js`** (46) | Configuración de Vite, incluido el **proxy de desarrollo** `/api` → `localhost:4000`, que evita los problemas de CORS en desarrollo. | `npm run dev`. |
| **`tailwind.config.js`** (44) | Paleta de colores, tipografías y rutas donde Tailwind busca clases. | Automático en el build. |
| **`index.html`** (19) | El HTML raíz donde React se monta. | Automático. |
| **`src/main.jsx`** (29) | Punto de entrada: monta React y envuelve la app en los dos proveedores de contexto. | Automático. |
| **`src/App.jsx`** (85) | **El mapa de rutas.** Declara qué páginas son públicas, cuáles requieren sesión y cuáles requieren rol. | Se lee de un vistazo para auditar la política de acceso. |
| **`src/index.css`** (174) | Estilos base y las directivas de Tailwind. | Automático. |

#### `src/api/` — comunicación con el backend

| Archivo | Qué es | Cómo se usa |
|---|---|---|
| **`cliente.js`** (276) | El cliente HTTP. Guarda la sesión, **renueva el token automáticamente al recibir un 401 y reintenta una vez**, y expone `subirArchivos()` y `descargarArchivo()`. La clase `ErrorApi` trae los errores por campo para pintarlos en el formulario. | Lo usan todos los servicios. |
| **`servicios.js`** (172) | El **catálogo de llamadas a la API**, agrupado en 9 objetos: `serviciosAutenticacion`, `serviciosTickets`, `serviciosComentarios`, `serviciosAdjuntos`, `serviciosUsuarios`, `serviciosCategorias`, `serviciosReportes`, `serviciosNotificaciones`, `serviciosSistema`. | En las páginas: `await serviciosTickets.listar({ estado: 'NUEVO' })`. |

#### `src/context/` — estado global

| Archivo | Qué es | Cómo se usa |
|---|---|---|
| **`AuthContext.jsx`** (209) | La sesión. Expone `usuario`, `iniciarSesion()`, `cerrarSesion()` y los atajos `esAdministrador`, `esAgente`, `esGestor`, `esSolicitante`. | `const { usuario } = useAutenticacion();` en cualquier componente. |
| **`AvisosContext.jsx`** (178) | Las notificaciones tipo *toast*. Expone `exito()`, `error()`, `advertencia()`, `informacion()` y `mostrarError()`. | `const { exito } = useAvisos(); exito('Ticket creado');` |

#### `src/componentes/` — piezas reutilizables

| Archivo | Qué es |
|---|---|
| **`Disposicion.jsx`** (189) | El armazón de la app: barra lateral y encabezado. **La barra lateral se genera desde un arreglo declarativo `SECCIONES`**, así que añadir una pantalla es añadir una línea. |
| **`RutaProtegida.jsx`** (67) | El guardián de rutas. Redirige al login si no hay sesión, y muestra `PantallaSinPermiso` si el rol no alcanza. |
| **`Etiquetas.jsx`** (75) | Las insignias de color: `InsigniaEstado`, `InsigniaPrioridad`, `InsigniaRol`, `InsigniaSla`, `InsigniaActivo`. |
| **`Estados.jsx`** (97) | Los estados de la interfaz: `Cargando`, `EsqueletoTabla`, `EstadoVacio`, `MensajeError`, `EncabezadoPagina`. |
| **`Modal.jsx`** (163) | Ventana modal con **trampa de foco** y cierre con Escape (accesibilidad). Incluye `ModalConfirmacion`. |
| **`Paginacion.jsx`** (107) | Paginación con elipsis (`1 2 … 7 8`). |
| **`CargadorArchivos.jsx`** (207) | Zona de arrastrar y soltar para las evidencias, con validación previa en el cliente. |
| **`Graficas.jsx`** (342) | **Cinco gráficas en SVG escritas a mano**: `TarjetaIndicador`, `GraficaBarras`, `GraficaDona`, `GraficaTendencia` y `BarraProgreso`. Cero dependencias externas. |

#### `src/paginas/` — las 11 pantallas

| Archivo | Ruta | Qué hace |
|---|---|---|
| **`IniciarSesion.jsx`** (254) | `/iniciar-sesion` | Login. Trae **credenciales de demostración con un clic** para rellenar — muy útil en la sustentación. |
| **`Registro.jsx`** (308) | `/registro` | Alta de cuenta con **lista de requisitos de contraseña que se valida en vivo**. |
| **`Panel.jsx`** (409) | `/` | El tablero. **Cambia según el rol**: el solicitante ve sus tickets; el agente y el admin ven KPIs y gráficas. |
| **`ListaTickets.jsx`** (463) | `/tickets` | Listado con **filtros guardados en la URL** (`useSearchParams`), así que puedes compartir el enlace de una búsqueda. Búsqueda con retardo para no saturar la API. |
| **`NuevoTicket.jsx`** (317) | `/tickets/nuevo` | Crear ticket. **Primero crea el ticket y después sube los archivos**: si falla la subida, el ticket no se pierde. |
| **`DetalleTicket.jsx`** (1096) | `/tickets/:id` | **La pantalla más grande.** Transiciones de estado, modal de asignación **ordenado por carga de trabajo**, notas internas, evidencias, línea de tiempo de auditoría e historial de notificaciones. |
| **`Reportes.jsx`** (522) | `/reportes` | Generación y descarga de reportes PDF/Excel, más las gráficas del tablero. |
| **`Usuarios.jsx`** (657) | `/usuarios` | Gestión de usuarios: crear, activar/desactivar, cambiar rol. Solo administrador. |
| **`Categorias.jsx`** (374) | `/categorias` | CRUD de categorías y sus horas de SLA. Solo administrador. |
| **`Perfil.jsx`** (398) | `/perfil` | Datos propios y cambio de contraseña. |
| **`NoEncontrado.jsx`** (39) | `/404` | Página 404. |

#### `src/utilidades/`

| Archivo | Qué es |
|---|---|
| **`formato.js`** (283) | Los **mapas visuales** (color y etiqueta de cada estado, prioridad y rol) más utilidades: `estaVencido()`, `textoSla()`, `tiempoRelativo()`, `formatearTamano()`. Al estar centralizado, **no hay dos pantallas que pinten el mismo estado con colores distintos**. |

### 4.5 `postman/` — probar la API sin navegador

| Archivo | Qué es | Cómo se usa |
|---|---|---|
| **`Sistema-Tickets.postman_collection.json`** (2199 líneas) | **9 carpetas con 53 peticiones**, todas con script de prueba. **Captura los tokens y los identificadores automáticamente**: haces login y el resto de peticiones ya funcionan solas. | Importar en Postman → elegir un entorno → ejecutar. |
| **`Sistema-Tickets-Local.postman_environment.json`** | Entorno para `http://localhost:4000`. | Seleccionarlo en el desplegable de entornos. |
| **`Sistema-Tickets-Nube.postman_environment.json`** | Entorno para el despliegue en la nube (hay que editar la URL). | Igual. |
| **`README.md`** (100) | Explica las **11 pruebas de seguridad** incluidas y qué se espera de cada una. | Leer antes de usarla. |

### 4.6 `k6/` — pruebas de carga

| Archivo | Qué es | Cómo se usa |
|---|---|---|
| **`load-test.js`** (760) | El script de carga exigido. Tiene **5 escenarios** (`carga`, `tasa`, `estres`, `picos`, `mixto`) y métricas de negocio propias: duración y tasa de éxito de la creación de tickets, errores 5xx y respuestas 429. Declara **umbrales** que hacen fallar la prueba si la latencia p95 sube demasiado. | `k6 run load-test.js`. Para un escenario concreto, se pasa por variable de entorno. |
| **`smoke-test.js`** (369) | **10 pasos** de validación funcional: salud, login, catálogos, crear ticket, comentar, transición válida, **transición ilegal rechazada con 409**, acceso sin token rechazado con 401, y reportes. | `k6 run smoke-test.js`. **Úsalo primero**: si falla, no tiene sentido correr la carga. |
| **`README.md`** (197) | Explica los escenarios y, muy importante, **por qué las respuestas `429` no deben contarse como fallo**. | Leer antes de interpretar resultados. |

### 4.7 `docs/`

| Archivo | Qué es |
|---|---|
| **`DESPLIEGUE-NUBE.md`** (526) | Guía de despliegue para **Render, Railway y AWS**. Cubre los tres componentes, explica las **dos topologías** de conexión frontend/backend, trae tabla de problemas frecuentes y estimación de costos. |
| **`ESTRATEGIA-COMERCIAL-Y-DEFENSA.md`** (353) | Tu material de sustentación: **pitch de 2 minutos cronometrado**, los **3 escenarios límite** (archivos maliciosos, inyección SQL, reportes con cero tickets) con su defensa, tabla para **convertir fallos en vivo en «funcionalidad planificada»**, y una chuleta imprimible. |
| **`PREGUNTAS-PARA-EL-PROFESOR.md`** (230) | **68 preguntas** para cerrar el alcance con el profesor antes de entregar, agrupadas en 9 bloques (alcance, arquitectura, base de datos, seguridad, pruebas, rendimiento, despliegue, documentación, sustentación). Cada una dice **por qué conviene hacerla** y **qué tienes ya** para responder si te la devuelven. Incluye una lista de **preguntas que NO conviene hacer** y una plantilla de correo lista para enviar. |
| **`GUIA-DE-ARCHIVOS.md`** | Este documento. |

---

## 5. El recorrido de una petición de principio a fin

Para que veas cómo encajan las piezas. Ejemplo: **el agente cambia un ticket a
RESUELTO y el solicitante recibe un correo.**

```
1. NAVEGADOR
   DetalleTicket.jsx  →  el agente pulsa "Marcar como resuelto"
   Llama a serviciosTickets.cambiarEstado(id, 'RESUELTO')

2. CLIENTE HTTP
   api/cliente.js  →  añade la cabecera Authorization: Bearer <token>
   Envía  PATCH /api/v1/tickets/<id>/estado

3. NGINX (contenedor frontend)
   nginx.conf  →  ve que la ruta empieza por /api/
   Reenvía a  http://backend:4000/api/v1/tickets/<id>/estado

4. EXPRESS (contenedor backend)
   app.js  →  pasa por los middlewares en orden:
              helmet → CORS → compresión → log → parseo → límite de tasa

5. MIDDLEWARE DE AUTENTICACIÓN  (se aplica a TODAS las rutas de tickets)
   ticket.routes.js    →  router.use(autenticacion.autenticar)
   auth.middleware.js  →  verifica el JWT, BUSCA EL USUARIO EN LA BASE DE DATOS
                          y lo deja en `peticion.usuario`
                          (si la cuenta fue desactivada, rechaza aunque el
                           token siga siendo válido)

6. RUTAS Y VALIDACIÓN
   routes/index.js     →  monta el router de tickets
   ticket.routes.js    →  encuentra  PATCH /:id/estado
                          aplica: validar({ params: esquemaIdParam,
                                            body: esquemaCambiarEstado })
                          Zod comprueba forma y tipo ANTES de tocar la lógica

7. CONTROLADOR
   ticket.controller.js  →  extrae id y estadoNuevo
   Llama a  ticketService.cambiarEstado(...)

8. SERVICIO  ← AQUÍ ESTÁN LAS REGLAS DE NEGOCIO
   ticket.service.js
     · obtenerTicket()  →  aplica seguridad por fila: si el ticket no es
                           visible para este usuario, lanza 404
     · ¿es agente o administrador?
       Si NO lo es y quiere poner RESUELTO / EN_PROGRESO / EN_ESPERA
         →  AppError.prohibido()  →  HTTP 403
       (un solicitante SÍ puede cerrar o reabrir su propio ticket)
     · transicionEsValida(ticket.estado, 'RESUELTO')  →  ¿es legal?
       Si NO es legal  →  AppError.conflicto()  →  HTTP 409
     · Si el estado es RESUELTO, exige una solución de 10+ caracteres
     · Llama al repositorio para guardar
     · Dispara la notificación SIN bloquear la respuesta

   OJO: la comprobación de rol está AQUÍ, no en la ruta. Es una regla de
   negocio, y por eso vale también si alguien llama a la API con curl.

9. REPOSITORIO  ← AQUÍ ESTÁ EL SQL
   ticket.repository.js  →  UPDATE tickets SET estado = $1, ...
                            (consulta parametrizada: nunca se concatena texto)

10. POSTGRESQL
    · El trigger trg_tickets_actualizado pone actualizado_en = NOW()
    · El trigger trg_tickets_historial escribe la bitácora de auditoría
    · La restricción ck_tickets_resuelto_tiene_fecha exige la fecha de resolución

11. NOTIFICACIÓN (patrón outbox)
    notification.service.js
      · PRIMERO guarda la notificación en la tabla con estado PENDIENTE
      · DESPUÉS intenta enviarla por correo
      · Si el correo falla, queda en la cola como FALLIDO y se puede reintentar
      · Sin credenciales SMTP → modo consola (queda registrada, no se envía)

12. RESPUESTA
    ApiResponse.ok()  →  { exito: true, datos: {...} }
    Sube por la misma cadena y llega al navegador
```

**Las tres cosas que debes recordar de este recorrido:**

1. **El controlador no sabe qué es un ticket.** Solo traduce HTTP. Las reglas
   están en el servicio, y por eso se pueden probar sin base de datos.
2. **La validación de la transición ocurre en el servicio, no en el frontend.**
   El frontend solo oculta los botones que no aplican; el backend es el que
   hace cumplir la regla. Si alguien llama a la API directamente con `curl`,
   también se le rechaza.
3. **La notificación se guarda antes de enviarse.** Si el proveedor de correo
   se cae, la notificación no se pierde.

---

## 6. Las 8 preguntas que te van a hacer

**1. «¿Por qué el folio del ticket no se genera en JavaScript?»**
Porque dos usuarios podrían crear un ticket en el mismo milisegundo y ambos
calcularían el mismo número. Se usa una **secuencia de PostgreSQL** dentro de un
trigger, que es atómica por definición.

**2. «¿Cómo evitas la inyección SQL?»**
Todas las consultas son **parametrizadas** (`$1`, `$2`), así que el valor nunca
forma parte del texto de la consulta. El único caso donde eso no es posible es
el `ORDER BY`, y ahí se usa una **lista blanca** de columnas permitidas.

**3. «¿Qué pasa si un solicitante intenta ver un ticket ajeno?»**
Recibe **404, no 403**. El servicio aplica seguridad por fila y, si el ticket no
es suyo, lo trata como si no existiera. Así el sistema **no confirma** que el
recurso existe.

**4. «¿Cómo sé que nadie modificó un ticket sin dejar rastro?»**
La bitácora se escribe con un **trigger de PostgreSQL**, no desde la aplicación.
Eso significa que **aunque alguien modifique la fila directamente con SQL**, el
cambio queda registrado en `historial_tickets`.

**5. «¿Qué pasa si el servidor de correo está caído?»**
Nada se pierde. Se usa el **patrón outbox**: la notificación se guarda en la
tabla con estado `PENDIENTE` **antes** de intentar el envío. Si falla, queda
como `FALLIDO` y el administrador puede reintentarla desde la interfaz.

**6. «¿Cómo se comunican frontend y backend sin problemas de CORS en local?»**
El navegador solo habla con nginx (puerto 5173), y **nginx reenvía `/api/`** al
contenedor del backend. Al ser el mismo origen, no hay CORS. En desarrollo, Vite
hace el mismo reenvío. En la nube sí hay que configurar `CORS_ORIGENES`.

**7. «¿Cómo prueban sin base de datos?»**
Los servicios reciben sus dependencias **por constructor** (inversión de
dependencias). Las 13 pruebas unitarias inyectan un repositorio falso que
cumple el mismo contrato, así que prueban las reglas de negocio en milisegundos
y sin infraestructura.

**8. «¿Por qué no usaron un framework de inyección de dependencias?»**
Porque el contenedor manual son ~266 líneas legibles, frente a una dependencia
más que aprender y depurar. Es el principio **KISS** aplicado: la solución más
simple que cumple el objetivo.

---

*Guía de archivos del Sistema de Tickets · Proyecto de fin de curso.*
