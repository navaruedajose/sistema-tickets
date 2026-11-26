# Despliegue en Render — paso a paso

Guía para publicar el Sistema de Tickets en Render usando el archivo
`render.yaml` que ya está en la raíz del repositorio. Al terminar quedan tres
cosas funcionando en internet:

| Recurso | Qué es | Ejemplo de URL |
|---|---|---|
| `sistema-tickets-api` | Backend Node + Express (Docker) | `https://sistema-tickets-api.onrender.com` |
| `sistema-tickets-web` | Frontend React (sitio estático) | `https://sistema-tickets-web.onrender.com` |
| `sistema-tickets-db` | PostgreSQL gestionado | interna |

---

## Antes de empezar

Necesitas tres cosas:

1. **El proyecto en GitHub.** La carpeta actual no es un repositorio git, así
   que primero hay que crearlo y subirlo (paso 0).
2. **Una cuenta de Cloudinary** (gratis). Sin ella, las fotos se guardarían en
   el disco del contenedor y **se borrarían en cada redespliegue**, porque en
   los planes gratuitos el sistema de archivos es efímero.
3. **Una cuenta de Render** conectada a GitHub.

---

## Paso 0 — Subir el proyecto a GitHub

```bash
cd sistema-tickets

git init
git add .
git commit -m "Sistema de Tickets: backend, frontend, base de datos y pruebas"

# Crear el repositorio y subirlo (requiere GitHub CLI)
gh repo create sistema-tickets --public --source=. --push
```

Comprueba que `.env` **no** se subió:

```bash
git ls-files | grep -c "^\.env$"    # debe responder 0
```

> Si responde 1, el archivo con contraseñas quedó en el repositorio. Bórralo
> del índice con `git rm --cached .env`, haz commit y **cambia las
> contraseñas**, porque ya estuvieron expuestas.

---

## Paso 1 — Crear la cuenta de Cloudinary

1. Entra a <https://cloudinary.com> y crea una cuenta gratuita.
2. En el panel, sección **Dashboard**, copia estos tres datos:

   | Dato de Cloudinary | Variable de entorno |
   |---|---|
   | Cloud name | `CLOUDINARY_CLOUD_NAME` |
   | API Key | `CLOUDINARY_API_KEY` |
   | API Secret | `CLOUDINARY_API_SECRET` |

3. No hace falta crear carpetas: la aplicación crea
   `sistema-tickets/tickets/<id-del-ticket>/` automáticamente.

> El plan gratuito de Cloudinary incluye 25 créditos mensuales, más que
> suficiente para un proyecto escolar.

---

## Paso 2 — Desplegar con el Blueprint

1. En Render, clic en **New +** → **Blueprint**.
2. Selecciona el repositorio `sistema-tickets`.
3. Render lee `render.yaml` y muestra los tres recursos que va a crear.
4. Pulsa **Apply**.
5. Cuando pregunte por las variables marcadas con `sync: false`, pega las
   credenciales de Cloudinary del paso 1.

El backend tarda varios minutos la primera vez (instala dependencias y
compila la imagen). El frontend tarda menos.

### Nombres de los servicios

Si Render asigna nombres distintos a `sistema-tickets-api` y
`sistema-tickets-web` (porque ya existían), hay que ajustar dos valores en
`render.yaml` y volver a desplegar:

| Variable | Dónde | Debe ser |
|---|---|---|
| `CORS_ORIGENES` | backend | La URL del frontend |
| `VITE_API_URL` | frontend | La URL del backend + `/api/v1` |

---

## Paso 3 — Inicializar la base de datos

Render crea la base vacía. **El esquema no se aplica solo**: los scripts de
`database/init/` únicamente se ejecutan automáticamente en Docker local.

### 3.1 Obtener la cadena de conexión

En Render → base de datos `sistema-tickets-db` → **Connect** → copia la
**External Database URL**. Se ve así:

```
postgresql://tickets_user:XXXXXXXX@dpg-xxxxx-a.oregon-postgres.render.com/tickets_db
```

### 3.2 Aplicar el esquema

**Opción A — con psql instalado:**

```bash
psql "postgresql://.../tickets_db?sslmode=require" -f database/init/01-schema.sql
```

**Opción B — sin psql, usando Docker:**

```bash
docker run --rm -v "$PWD/database/init:/sql" postgres:16-alpine \
  psql "postgresql://.../tickets_db?sslmode=require" -f /sql/01-schema.sql
```

### 3.3 Cargar los datos de demostración

El semillero necesita bcrypt, así que se ejecuta con Node desde tu máquina
apuntando a la base de la nube:

```bash
cd backend

DB_HOST=dpg-xxxxx-a.oregon-postgres.render.com \
DB_PORT=5432 \
DB_NAME=tickets_db \
DB_USER=tickets_user \
DB_PASSWORD=XXXXXXXX \
DB_SSL=true \
NODE_ENV=development \
npm run db:seed
```

Al terminar debe imprimir el resumen de usuarios y tickets creados.

> **Por qué `DB_SSL=true`:** Render exige TLS en las conexiones externas.
> En Docker local esa variable se queda en `false`.

---

## Paso 4 — Verificar que todo funciona

```bash
# 1. El backend responde y ve la base de datos
curl https://sistema-tickets-api.onrender.com/api/v1/salud

# 2. El frontend carga
#    abrir https://sistema-tickets-web.onrender.com en el navegador

# 3. Login con una cuenta demo
curl -X POST https://sistema-tickets-api.onrender.com/api/v1/auth/iniciar-sesion \
  -H "Content-Type: application/json" \
  -d '{"correo":"admin@sistema-tickets.local","contrasena":"Demo2026#Tickets"}'
```

Si el login devuelve un token, el despliegue está completo.

### Comprobar Cloudinary

1. Entra a la aplicación desplegada como `usuario1@…`.
2. Abre un ticket y sube una imagen.
3. En el panel de Cloudinary → **Media Library** debe aparecer en
   `sistema-tickets/tickets/<id>/`.
4. En la base de datos, `SELECT ruta_relativa FROM adjuntos;` debe devolver
   una URL `https://res.cloudinary.com/...` en lugar de una ruta local.

---

## Paso 5 — Correr Postman contra la nube

1. Abre Postman e importa `postman/Sistema-Tickets.postman_collection.json`.
2. Importa el entorno `postman/Sistema-Tickets-Nube.postman_environment.json`.
3. Edita `urlBase` con la URL real:
   `https://sistema-tickets-api.onrender.com/api/v1`
4. Ejecuta la colección **carpeta por carpeta**, en orden (00 → 08).

Para correrla desde consola, con newman:

```bash
npm install -g newman

newman run postman/Sistema-Tickets.postman_collection.json \
  -e postman/Sistema-Tickets-Nube.postman_environment.json \
  --folder "00 - Salud del sistema" \
  --bail
```

Repite cambiando `--folder` por cada una de las nueve carpetas. `--bail`
detiene la ejecución en el primer fallo, que es justo lo que pide el
profesor: *«que se corra una por una y que todas salgan bien»*.

---

## Problemas frecuentes

| Síntoma | Causa | Solución |
|---|---|---|
| El frontend carga en blanco | `VITE_API_URL` mal o CSP bloqueando la API | Revisar la variable y volver a desplegar el frontend (se incrusta en el build) |
| `502 Bad Gateway` al llamar la API | El backend no arrancó | Ver los logs del servicio en Render |
| `ECONNREFUSED` a la base | Falta `DB_SSL=true` | Añadir la variable y redesplegar |
| `relation "tickets" does not exist` | No se aplicó el esquema | Repetir el paso 3.2 |
| `CORS policy: No 'Access-Control-Allow-Origin'` | `CORS_ORIGENES` no incluye el dominio del frontend | Corregir la variable y redesplegar el backend |
| La primera petición tarda ~50 s | El plan gratuito duerme el servicio tras 15 min sin uso | Es normal; abrir la URL antes de la demo para despertarlo |
| Las fotos desaparecen tras un redespliegue | Se estaba guardando en disco | Verificar que `STORAGE_DRIVER=cloudinary` y las credenciales |

---

## Limitaciones del plan gratuito (dilo en la defensa)

- **El servicio web se duerme** tras 15 minutos sin tráfico. La primera
  petición tarda entre 30 y 60 segundos en despertarlo.
- **La base de datos gratuita tiene fecha de caducidad.** Render la elimina
  pasado el periodo de gracia; hay que exportar un respaldo antes
  (`pg_dump`) o pasar a un plan pago si el proyecto debe durar.
- **No hay disco persistente.** Por eso Cloudinary no es un adorno: es lo que
  hace que las evidencias sobrevivan.
- **El ancho de banda es limitado**, pero suficiente para la demostración.

Ninguna de estas limitaciones afecta a la funcionalidad: son restricciones
del proveedor, no del código.

---

## Alternativa: Railway

Railway funciona parecido, pero no lee `render.yaml`. Los pasos serían:

1. **New Project** → **Deploy from GitHub repo**.
2. Añadir un plugin **PostgreSQL**.
3. Crear un servicio desde el repositorio con `rootDir = backend`.
4. Copiar las variables de `DB_*` desde el plugin y añadir `DB_SSL=true`,
   `JWT_SECRETO`, `CORS_ORIGENES` y las de Cloudinary.
5. Crear un segundo servicio con `rootDir = frontend`, comando de build
   `npm ci && npm run build` y publicar `dist`.
6. Inicializar la base igual que en el paso 3.

Si el profesor no exige un proveedor concreto, **Render es la ruta más
corta** porque el `render.yaml` ya está escrito y versionado.
