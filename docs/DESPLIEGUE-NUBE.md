# Guía de despliegue en la nube

Guía accionable para publicar el Sistema de Tickets dockerizado. Se cubren
tres proveedores con distintos niveles de esfuerzo. Elige **una** ruta.

Cada ruta publica **tres componentes**: la base de datos PostgreSQL, el backend
(Node.js + Express) y el frontend (React). El orden importa: primero la base de
datos, después el backend y por último el frontend, que necesita la URL del
backend para compilarse.

| Componente | En local | En la nube |
|---|---|---|
| Base de datos | Contenedor `postgres` | PostgreSQL gestionado (Render / Railway / RDS) |
| Backend | Contenedor `backend` (puerto 4000) | Web Service desde Dockerfile |
| Frontend | Contenedor `frontend` (nginx, puerto 5173) | Sitio estático (o imagen nginx, ver 0.4) |

---

## 0. Antes de empezar (aplica a todos los proveedores)

### 0.1 Preparar el repositorio

```bash
cd sistema-tickets
git init
git add .
git commit -m "Version inicial del Sistema de Tickets"
gh repo create sistema-tickets --private --source=. --push
```

Verifica que `.env` **no** se haya subido (debe estar en `.gitignore`).

### 0.2 Generar secretos de producción

Nunca reutilices el secreto de desarrollo. Genera uno nuevo:

```bash
# Opción A (Linux / macOS / Git Bash)
openssl rand -hex 48

# Opción B (cualquier sistema, con Node instalado)
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

Guarda el resultado: lo usarás como `JWT_SECRETO`.

### 0.3 Checklist de variables de entorno en producción

| Variable | Valor recomendado en la nube |
|---|---|
| `NODE_ENV` | `production` |
| `JWT_SECRETO` | Salida de `openssl rand -hex 48` |
| `JWT_EXPIRA_EN` | `15m` |
| `CORS_ORIGENES` | El dominio real del frontend, p. ej. `https://tickets.miuniversidad.edu` |
| `POSTGRES_PASSWORD` | Contraseña larga y aleatoria |
| `UPLOAD_MAX_MB` | `10` |
| `TZ` | `America/Mexico_City` |
| `SMTP_*` | Credenciales del proveedor de correo (o dejar vacío) |
| `VITE_API_URL` | **Solo para el frontend.** La URL pública del backend terminada en `/api/v1`, p. ej. `https://tickets-api.onrender.com/api/v1` |

> **Modo demostración:** si dejas las variables `SMTP_*` y `TWILIO_*` vacías, el
> sistema funciona igual. Las notificaciones se registran en el log y en la
> tabla `notificaciones` con el texto completo. Esto es ideal para la
> sustentación, donde no hay un servidor de correo real disponible.

### 0.4 Cómo se conectan frontend y backend en la nube

Este punto es el que más confunde, así que conviene tenerlo claro antes de empezar.

En **local**, el navegador solo habla con nginx (puerto 5173) y nginx reenvía
`/api/` al servicio `backend` dentro de la red de Docker. Por eso el frontend usa
la ruta **relativa** `/api/v1` y nunca hay problemas de CORS.

En la **nube** cada servicio vive en un dominio distinto, así que hay dos
topologías posibles:

| Topología | Cómo funciona | Cuándo conviene |
|---|---|---|
| **A. Sitio estático + API separada** (recomendada) | El frontend se compila con `VITE_API_URL=https://tu-api.onrender.com/api/v1` y se sirve como archivos estáticos. El navegador llama al backend directamente. | Es la más simple, la más barata y la que funciona en los planes gratuitos. |
| **B. Imagen nginx del frontend** | Se despliega el `frontend/Dockerfile` tal cual. | **Requiere un cambio**: ver la advertencia de abajo. |

> ⚠️ **Advertencia importante sobre la topología B.** El `nginx.conf` del
> frontend reenvía a `http://backend:4000`. Ese nombre `backend` **solo existe
> dentro de la red de Docker Compose**. Si despliegas la imagen del frontend
> como un servicio aislado en Render o Railway, el proxy no resolverá el nombre
> y todas las llamadas a `/api/` devolverán `502 Bad Gateway`.
>
> Si quieres usar la topología B, edita `frontend/nginx.conf` y sustituye
> `proxy_pass http://backend:4000;` por la URL pública real del backend:
>
> ```nginx
> proxy_pass https://tu-api.onrender.com;
> ```
>
> Recuerda además que, al ser otro origen, deberás añadir el dominio del
> frontend a `CORS_ORIGENES` en el backend. En ese caso puedes dejar
> `VITE_API_URL` **vacía**: el frontend seguirá usando rutas relativas y nginx
> hará el reenvío.

**El resto de esta guía usa la topología A**, que es la recomendada.

### 0.5 — Cabeceras de seguridad en la nube (no te las dejes)

En local las cabeceras de seguridad las pone **nginx** (`frontend/security-headers.conf`).
En la topología A **nginx no participa**: el frontend se sirve como archivos
estáticos desde el CDN del proveedor. Si no haces nada, el despliegue en la nube
**perderá las 5 cabeceras** (incluida la `Content-Security-Policy`).

Por eso el repositorio incluye **`frontend/public/_headers`**, el estándar que
entienden Netlify, Cloudflare Pages y Render para sitios estáticos. Vite copia
`public/` a la raíz de `dist/`, así que el archivo viaja solo con el build: no
hay que configurar nada en el panel.

> ⚠️ **Hay que editar una línea antes de desplegar.** En la nube el frontend y la
> API están en **orígenes distintos**, así que `connect-src 'self'` **bloquearía
> todas las llamadas a la API** y la aplicación se quedaría en blanco. En
> `frontend/public/_headers`, sustituye el dominio de ejemplo por el tuyo real:
>
> ```
> connect-src 'self' https://tu-api.onrender.com
> img-src 'self' data: blob: https://tu-api.onrender.com
> ```
>
> En el despliegue con Docker **no hay que tocar nada**: allí el frontend y la
> API comparten origen a través del proxy inverso, y por eso la versión de nginx
> usa solo `'self'`.

Si tu proveedor no soporta `_headers`, casi todos ofrecen un apartado de
**cabeceras personalizadas** en el panel del sitio estático: copia allí los
mismos valores.

Comprobar que llegaron, ya en producción:

```bash
curl -s -D - -o /dev/null https://tu-frontend.onrender.com/ | grep -i "content-security"
```

---

## 1. Render (recomendado: el más simple)

Render soporta `docker-compose` parcialmente, así que se despliegan tres
servicios por separado: la base de datos gestionada, el backend y el frontend
como sitio estático.

### Paso 1 — Base de datos PostgreSQL

1. Entra a <https://dashboard.render.com> → **New +** → **Postgres**.
2. Nombre: `tickets-db`. Plan: **Free**.
3. Región: la más cercana a tu audiencia.
4. Al crearla, copia los datos de conexión de la sección **Connections**:
   *Hostname*, *Port*, *Database*, *Username*, *Password*.

### Paso 2 — Cargar el esquema

Render bloquea conexiones desde fuera de su red en el plan gratuito. La vía
más simple es ejecutar el esquema desde tu máquina contra la URL **External
Database URL**:

```bash
export DATABASE_URL="postgresql://usuario:password@host-externo:5432/tickets_db"

# Carga el esquema y los catálogos
psql "$DATABASE_URL" -f database/init/01-schema.sql
psql "$DATABASE_URL" -f database/init/02-seed.sql
```

> Si no tienes `psql` instalado localmente, puedes ejecutarlo desde el
> contenedor: `docker run --rm -i postgres:16-alpine psql "$DATABASE_URL" -f - < database/init/01-schema.sql`

### Paso 3 — Desplegar el backend

1. **New +** → **Web Service** → conecta tu repositorio de GitHub.
2. Configuración:
   * **Root Directory:** `backend`
   * **Runtime:** `Docker`
   * **Dockerfile Path:** `./Dockerfile`
   * **Instance Type:** Free
   * **Health Check Path:** `/api/v1/salud`
3. En **Environment Variables**, añade las variables de la tabla del punto 0.3.
   Para las de base de datos, usa los valores de **Connections** del paso 1.
   Recuerda que `DB_HOST` es el **hostname interno**.
4. **Create Web Service**. El primer build tarda entre 3 y 6 minutos.
5. Cuando el estado sea *Live*, verifica:
   ```bash
   curl https://tu-servicio.onrender.com/api/v1/salud
   ```
   Debe responder con `"estado": "operativo"`.

### Paso 4 — Cargar los datos de demostración

Desde el panel del servicio → **Shell**, ejecuta:

```bash
npm run db:seed
```

### Paso 5 — Desplegar el frontend (sitio estático)

1. **New +** → **Static Site** → conecta el mismo repositorio.
2. Configuración:
   * **Root Directory:** `frontend`
   * **Build Command:** `npm ci && npm run build`
   * **Publish Directory:** `dist`
3. En **Environment Variables**, añade **una sola**:

   | Clave | Valor |
   |---|---|
   | `VITE_API_URL` | `https://tu-servicio.onrender.com/api/v1` |

   > Esta variable se **incrusta en el bundle durante el build**, no se lee en
   > tiempo de ejecución. Si cambias la URL del backend después, hay que volver
   > a desplegar el frontend para que el cambio surta efecto.

4. **Create Static Site**. El build tarda alrededor de un minuto.
5. Copia el dominio que te asigna Render (por ejemplo
   `https://tickets-web.onrender.com`).

### Paso 6 — Autorizar el origen del frontend en el backend

Este paso es **obligatorio** en la topología A: el navegador llama al backend
desde otro dominio, así que hay que autorizarlo.

1. Vuelve al **Web Service** del backend → **Environment**.
2. Edita `CORS_ORIGENES` y añade el dominio del paso 5:
   ```
   CORS_ORIGENES=https://tickets-web.onrender.com
   ```
   Para varios orígenes, sepáralos con comas y **sin barra final**.
3. Guarda: Render redespliega el backend automáticamente.

### Verificación de la topología completa

```bash
# El frontend se sirve correctamente
curl -I https://tickets-web.onrender.com

# El backend sigue operativo
curl https://tu-servicio.onrender.com/api/v1/salud
```

Después abre el frontend en el navegador e **inicia sesión** con
`admin@sistema-tickets.local` / `Demo2026#Tickets`. Si el inicio de sesión
funciona, la topología completa está bien conectada. Si ves un error de CORS en
la consola del navegador, revisa el paso 6.

### Advertencia sobre el disco persistente

En el plan gratuito de Render el sistema de archivos es **efímero**: las
evidencias subidas se pierden al redesplegar. Para la sustentación es
suficiente. Para producción real, añade un **Persistent Disk**:

1. Servicio → **Disks** → **Add Disk**.
2. Mount Path: `/app/uploads`. Tamaño: 1 GB.

Y declara `UPLOAD_DIR=/app/uploads` (ya viene por defecto en el Dockerfile).

---

## 2. Railway (más rápido, con mejor integración)

### Opción A — Despliegue con `docker-compose` (los tres servicios juntos)

Railway detecta el `docker-compose.yml` de la raíz si se despliega desde el
repositorio completo. Es la vía más directa:

```bash
npm install -g @railway/cli
railway login
cd sistema-tickets
railway init
railway up
```

Railway lee el `docker-compose.yml` y crea automáticamente los servicios
`postgres`, `backend` y `frontend`, todos en la misma red privada del proyecto.
Esto es una ventaja: **al mantener los nombres de servicio del compose, el
`nginx.conf` del frontend resuelve `http://backend:4000` sin cambios**, así que
funciona la topología B y no hace falta configurar CORS. Después:

1. En el panel, abre el servicio **backend** → **Variables** y añade
   `JWT_SECRETO` y las credenciales `SMTP_*`. Puedes omitir `CORS_ORIGENES`,
   porque el navegador solo hablará con el frontend.
2. En el servicio **postgres** → **Variables**, copia las credenciales y
   asegúrate de que coincidan con `POSTGRES_USER` / `POSTGRES_PASSWORD` /
   `POSTGRES_DB` del backend.
3. Añade un **Volume** al servicio backend con mount path `/app/uploads`.
4. Genera los dominios públicos:
   * Servicio **backend** → **Settings** → **Networking** → **Generate Domain**.
   * Servicio **frontend** → **Settings** → **Networking** → **Generate Domain**.
5. Abre el dominio del **frontend** en el navegador. Ese es el enlace que
   compartirás: el frontend y la API comparten origen a través del proxy.

> Si Railway no crea el servicio `frontend` automáticamente (su soporte de
> `docker-compose` es parcial), usa la **Opción C** de más abajo.

### Opción B — Despliegue de los servicios por separado

```bash
railway add --database postgres
railway add --service backend
railway variables --service backend --set NODE_ENV=production
railway variables --service backend --set JWT_SECRETO=tu_secreto_generado
railway up --service backend
```

Railway inyecta `DATABASE_URL` automáticamente. Si prefieres usarla en lugar
de las variables `DB_*` individuales, ajusta `backend/src/config/env.js` para
leer `DATABASE_URL` como alternativa (ver sección 4).

### Opción C — Frontend como sitio estático

Si prefieres separar el frontend del backend, es la misma vía que en Render:

1. `railway add --service frontend`
2. En **Settings** → **Build**:
   * **Root Directory:** `frontend`
   * **Build Command:** `npm ci && npm run build`
   * **Start Command:** *(dejar vacío; Railway detecta el sitio estático)*
3. **Variables** → `VITE_API_URL=https://tu-backend.up.railway.app/api/v1`
4. **Settings** → **Networking** → **Generate Domain**.
5. **No olvides** volver al servicio `backend` y añadir ese dominio a
   `CORS_ORIGENES`, o el navegador bloqueará las llamadas.

### Cargar el esquema en Railway

```bash
railway connect postgres
# Dentro de la sesión psql:
\i /ruta/al/repositorio/database/init/01-schema.sql
\i /ruta/al/repositorio/database/init/02-seed.sql
```

O bien, desde el servicio backend: `railway run npm run db:seed`.

---

## 3. AWS (arquitectura profesional, mayor costo y complejidad)

Esta ruta es la más cercana a un entorno corporativo real. Es la opción que
conviene mencionar en la sustentación como "plan de escalamiento".

### 3.1 Base de datos — Amazon RDS para PostgreSQL

1. Consola AWS → **RDS** → **Create database** → **PostgreSQL 16**.
2. Plantilla: **Free tier**.
3. **DB instance identifier:** `tickets-db`.
4. **Master username:** `tickets_user`. **Master password:** la que generaste.
5. **Public access:** `No` (la base solo debe ser accesible desde la VPC).
6. **VPC security group:** crea uno nuevo llamado `tickets-db-sg` y añade una
   regla de entrada en el puerto `5432` cuyo origen sea el security group del
   servicio de aplicación (no `0.0.0.0/0`).
7. Anota el **Endpoint** resultante: será tu `DB_HOST`.

### 3.2 Backend — AWS App Runner (la vía más simple)

App Runner construye la imagen desde tu repositorio y gestiona el balanceo,
los certificados TLS y el escalado automático.

1. Consola AWS → **App Runner** → **Create service**.
2. **Source:** *Source code repository* → conecta GitHub → repositorio
   `sistema-tickets`, rama `main`.
3. **Deployment settings:** *Automatic*.
4. **Build settings:** *Configure all settings here* → **Dockerfile**,
   *Source directory*: `backend`.
5. **Port:** `4000`.
6. **Health check:** Protocolo `HTTP`, Path `/api/v1/salud`.
7. **Environment variables:** añade todas las de la tabla 0.3, apuntando
   `DB_HOST` al endpoint de RDS.
8. **Security group:** asigna el mismo `tickets-db-sg` para que App Runner
   pueda alcanzar RDS.
9. **Create & deploy**. Obtendrás una URL del tipo
   `https://xxxxxx.us-east-1.awsapprunner.com`.

### 3.3 Almacenamiento de evidencias — Amazon S3

El sistema de archivos de App Runner es efímero. Para producción real, las
evidencias deben ir a S3. La arquitectura ya lo permite sin refactor mayor:

`attachment.service.js` concentra toda la escritura/lectura de archivos. Para
migrar a S3 basta con crear un `S3StorageProvider` que implemente la misma
interfaz (`guardar`, `obtenerRutaDescarga`, `eliminar`) e inyectarlo en el
contenedor en lugar del almacenamiento en disco. **Ninguna otra clase cambia.**
Ese es el beneficio tangible de haber aislado la persistencia de archivos.

### 3.4 Alternativa: ECS Fargate

Si el curso exige experiencia con contenedores orquestados:

1. **ECR:** `aws ecr create-repository --repository-name sistema-tickets-backend`
2. **Build y push:**
   ```bash
   aws ecr get-login-password --region us-east-1 | \
     docker login --username AWS --password-stdin <cuenta>.dkr.ecr.us-east-1.amazonaws.com

   docker build -t sistema-tickets-backend ./backend
   docker tag sistema-tickets-backend:latest <cuenta>.dkr.ecr.us-east-1.amazonaws.com/sistema-tickets-backend:latest
   docker push <cuenta>.dkr.ecr.us-east-1.amazonaws.com/sistema-tickets-backend:latest
   ```
3. **ECS:** crea un clúster Fargate, una *Task Definition* con la imagen
   anterior (puerto 4000, variables de entorno, rol de ejecución), y un
   *Service* con un **Application Load Balancer** delante.
4. **ALB:** *Target Group* en el puerto 4000 con *health check* en
   `/api/v1/salud`. Adjunta un certificado en **ACM** para servir por HTTPS.
5. **Secrets:** en lugar de variables de entorno planas, usa
   **AWS Secrets Manager** y referencia los secretos desde la Task Definition
   con el campo `secrets`. El `JWT_SECRETO` nunca queda visible en la consola.

### 3.5 Frontend — Amazon S3 + CloudFront

En AWS no tiene sentido desplegar la imagen nginx del frontend: sale más barato
y más rápido servir los archivos estáticos desde S3 con CloudFront delante.

```bash
# 1. Compilar apuntando a la URL pública del backend
cd frontend
VITE_API_URL=https://api.tu-dominio.com/api/v1 npm ci && npm run build
```

```bash
# 2. Crear el bucket y subir el contenido de dist/
aws s3 mb s3://sistema-tickets-frontend --region us-east-1
aws s3 sync dist/ s3://sistema-tickets-frontend --delete
```

```bash
# 3. Distribución de CloudFront con soporte para SPA
aws cloudfront create-distribution \
  --origin-domain-name sistema-tickets-frontend.s3.amazonaws.com \
  --default-root-object index.html
```

Pasos finales en la consola:

1. En la distribución, crea un **Custom Error Response**:
   * **HTTP Error Code:** `403` y `404`
   * **Response Page Path:** `/index.html`
   * **Response Code:** `200`

   > Sin esto, recargar la página en una ruta como `/tickets` devolverá un
   > error en lugar de la aplicación. Es el equivalente en CloudFront de la
   > regla `try_files $uri /index.html` que usa nginx en local.

2. **No** pongas el bucket como sitio web público: deja el acceso solo a través
   de CloudFront mediante un **Origin Access Control (OAC)**.

3. Copia el dominio de CloudFront (por ejemplo `https://d111111abcdef8.cloudfront.net`)
   y **añádelo a `CORS_ORIGENES`** en el backend. Sin este paso el navegador
   bloqueará todas las llamadas a la API.

4. Verifica el cierre del ciclo:
   ```bash
   curl -I https://d111111abcdef8.cloudfront.net
   curl https://api.tu-dominio.com/api/v1/salud
   ```

> **Recordatorio del paso 2 de esta sección:** `VITE_API_URL` se incrusta en el
> bundle durante `npm run build`. Si cambias la URL del backend, hay que
> recompilar y volver a subir a S3; no basta con cambiar una variable en
> CloudFront.

---

## 4. Ajuste opcional: soportar `DATABASE_URL`

Render y Railway inyectan una única variable `DATABASE_URL`. El proyecto usa
variables `DB_*` individuales, lo cual es más explícito y funciona en los tres
proveedores. Si prefieres soportar ambas formas, añade este bloque al final de
`backend/src/config/env.js`, justo antes de `module.exports`:

```js
// Soporte opcional para la variable unica DATABASE_URL que inyectan
// algunas plataformas PaaS (Render, Railway, Heroku).
if (process.env.DATABASE_URL) {
  const url = new URL(process.env.DATABASE_URL);
  config.baseDatos.host = url.hostname;
  config.baseDatos.puerto = Number(url.port) || 5432;
  config.baseDatos.nombre = url.pathname.replace(/^\//, '');
  config.baseDatos.usuario = decodeURIComponent(url.username);
  config.baseDatos.contrasena = decodeURIComponent(url.password);

  // Algunos proveedores exigen TLS en la conexion.
  config.baseDatos.ssl = { rejectUnauthorized: false };
}
```

Y en `backend/src/config/database.js`, añade `ssl: config.baseDatos.ssl` al
objeto de configuración del `Pool`.

---

## 5. Verificación posterior al despliegue

Ejecuta esta secuencia para confirmar que todo quedó bien:

```bash
# 1. El servicio responde y la base de datos esta conectada
curl -s https://TU-DOMINIO/api/v1/salud | jq

# 2. El catalogo de endpoints esta disponible
curl -s https://TU-DOMINIO/api/v1 | jq '.datos.modulos | keys'

# 3. El inicio de sesion funciona (con datos del semillero)
curl -s -X POST https://TU-DOMINIO/api/v1/auth/iniciar-sesion \
  -H "Content-Type: application/json" \
  -d '{"correo":"admin@sistema-tickets.local","contrasena":"Demo2026#Tickets"}' | jq '.datos.usuario.rol'
# Debe imprimir: "ADMINISTRADOR"

# 4. Una ruta protegida rechaza peticiones sin token
curl -s -o /dev/null -w "%{http_code}\n" https://TU-DOMINIO/api/v1/tickets
# Debe imprimir: 401

# 5. El frontend se sirve (sustituye por su dominio)
curl -s -o /dev/null -w "%{http_code}\n" https://TU-FRONTEND
# Debe imprimir: 200

# 6. El origen del frontend esta autorizado en el backend
#    (envia una peticion con el encabezado Origin y busca la cabecera de respuesta)
curl -s -I -X OPTIONS https://TU-DOMINIO/api/v1/auth/iniciar-sesion \
  -H "Origin: https://TU-FRONTEND" \
  -H "Access-Control-Request-Method: POST" | grep -i "access-control-allow-origin"
# Debe aparecer el dominio del frontend. Si no aparece, revisa CORS_ORIGENES.
```

**Prueba definitiva:** abre el frontend en el navegador e **inicia sesión** con
`admin@sistema-tickets.local` / `Demo2026#Tickets`. Si entra al panel, la
topología completa (frontend → backend → base de datos) está bien conectada.

---

## 6. Problemas frecuentes

| Síntoma | Causa probable | Solución |
|---|---|---|
| `Falta la variable de entorno obligatoria: JWT_SECRETO` | Variable no definida en el panel del proveedor | Añádela en *Environment Variables* y redespliega |
| El servicio arranca y reinicia en bucle | No alcanza PostgreSQL | Revisa que `DB_HOST` sea el hostname **interno**, no la URL externa |
| `no pg_hba.conf entry for host` | El security group no permite el puerto 5432 | Añade la regla de entrada en RDS |
| Las evidencias desaparecen tras cada despliegue | Sistema de archivos efímero | Añade un volumen persistente o migra a S3 |
| `CORS: Origen bloqueado` en la consola del navegador | `CORS_ORIGENES` no incluye el dominio del frontend | Añade el dominio exacto, con `https://` y sin barra final |
| `Se excedio el numero maximo de solicitudes` (429) | El limitador de tasa está activo | Es el comportamiento esperado; ajusta `limites.peticionesPorVentana` en `env.js` si es necesario |
| El health check de Render falla | La app tarda más de lo permitido en arrancar | El arranque ya reintenta la conexión 10 veces; verifica las credenciales de la BD |
| El frontend carga pero **todas** las llamadas a la API dan `502 Bad Gateway` | Desplegaste la imagen nginx del frontend en un servicio aislado: el proxy no resuelve el nombre `backend` | Usa un sitio estático (topología A), o edita `proxy_pass` en `nginx.conf` con la URL pública del backend (ver punto 0.4) |
| El frontend llama a `http://localhost:4000` en producción | `VITE_API_URL` no se definió **antes** del build, o el bundle es antiguo | Define la variable y **vuelve a desplegar**; se incrusta en tiempo de compilación, no de ejecución |
| Recargar la página en una ruta interna (`/tickets`) da 404 | El proveedor no redirige las rutas de la SPA a `index.html` | En Render es automático; en S3/CloudFront añade un *Custom Error Response* a `/index.html` con código 200 |
| El inicio de sesión funciona en Postman pero no en el navegador | CORS: el navegador aplica la política de origen, Postman no | Es el mismo caso del primer `CORS` de esta tabla |

---

## 7. Costos estimados (referencia)

| Proveedor | Componente | Costo aproximado |
|---|---|---|
| Render | Web Service + Postgres + Static Site (Free) | $0 (con suspensión por inactividad) |
| Railway | Uso medido (los tres servicios) | ~$5 USD/mes de crédito inicial |
| AWS | S3 + CloudFront para el frontend | ~$1–3 USD/mes a este volumen |
| AWS | RDS `db.t4g.micro` + App Runner 1 vCPU | ~$25–40 USD/mes |
| AWS | + ALB y ECS Fargate | ~$45–70 USD/mes |

Para la entrega universitaria, **Render es la ruta recomendada**: es gratuita,
el health check funciona y el despliegue se completa en menos de 10 minutos.
El sitio estático del frontend no consume cómputo, así que no cuenta para el
límite de servicios con suspensión por inactividad.
