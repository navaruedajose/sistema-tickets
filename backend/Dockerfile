# =====================================================================
# SISTEMA DE TICKETS - Imagen del backend
# Build multi-etapa para que la imagen final NO contenga dependencias
# de desarrollo ni el cache de npm (imagen mas pequena y segura).
#
# ORDEN IMPORTANTE: la etapa `production` va AL FINAL a proposito.
# Cuando nadie indica `--target`, Docker construye la ULTIMA etapa del
# archivo. Render (y la mayoria de los proveedores) construyen asi, sin
# argumentos. Si `pruebas` quedara al final, el contenedor desplegado
# ejecutaria Jest y terminaria: el proveedor lo reporta como
# "Application exited early".
#
#   docker compose up --build          -> production (ultima etapa)
#   docker build --target pruebas .    -> suite de Jest
# =====================================================================

# ---------------------------------------------------------------------
# ETAPA 1: dependencias de produccion
# ---------------------------------------------------------------------
FROM node:22-alpine AS dependencias

WORKDIR /app

# Copiamos solo los manifiestos primero: si no cambian, Docker reutiliza
# la capa de instalacion y el build es mucho mas rapido.
COPY package*.json ./

# `npm ci` respeta exactamente el package-lock.json (builds reproducibles)
RUN npm ci --omit=dev && npm cache clean --force

# ---------------------------------------------------------------------
# ETAPA 2: pruebas (NO forma parte de la imagen de produccion)
#
# Sirve para ejecutar la suite SIN tener Node instalado en la maquina, y
# sin contaminar la imagen de produccion (que sigue sin Jest: las
# herramientas de desarrollo no viajan a produccion).
#
# Como es una etapa independiente, Docker solo la construye si se pide:
#
#     docker build --target pruebas -t tickets-backend-pruebas ./backend
#     docker run --rm tickets-backend-pruebas
#
# Esta etapa va ANTES de `production` para que la ultima sea la que se
# despliega cuando no se especifica `--target`.
# ---------------------------------------------------------------------
FROM node:22-alpine AS pruebas

WORKDIR /app

# Aqui SI se instalan las dependencias de desarrollo (jest, supertest).
COPY package*.json ./
RUN npm ci && npm cache clean --force

# Se copia todo, incluidos tests/ y jest.config si existiera.
COPY . .

ENV NODE_ENV=test

CMD ["npx", "jest", "--runInBand", "--detectOpenHandles"]

# ---------------------------------------------------------------------
# ETAPA 3: produccion (ULTIMA = la que se despliega por defecto)
# ---------------------------------------------------------------------
FROM node:22-alpine AS production

# tini = manejador de procesos init. Garantiza que SIGTERM llegue a Node
# y que los procesos zombie se recolecten correctamente.
RUN apk add --no-cache tini curl

ENV NODE_ENV=production \
    PORT=4000 \
    UPLOAD_DIR=/app/uploads \
    TZ=America/Mexico_City

WORKDIR /app

# Usuario sin privilegios: si alguien compromete el proceso, no es root.
RUN addgroup -g 1001 -S nodejs && \
    adduser  -u 1001 -S api -G nodejs

COPY --from=dependencias --chown=api:nodejs /app/node_modules ./node_modules
COPY --chown=api:nodejs package*.json ./
COPY --chown=api:nodejs src ./src
COPY --chown=api:nodejs scripts ./scripts

# Directorios persistentes (se montan como volumen en docker-compose)
RUN mkdir -p /app/uploads /app/reports && chown -R api:nodejs /app/uploads /app/reports

USER api

EXPOSE 4000

# Healthcheck contra el endpoint de salud del propio servicio.
# Se usa ${PORT:-4000} porque en la nube el proveedor inyecta su propio
# puerto (Render usa 10000): con el 4000 fijo el contenedor se marcaria
# como enfermo aunque estuviera escuchando bien.
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
    CMD curl -fsS "http://127.0.0.1:${PORT:-4000}/api/v1/vivo" || exit 1

ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "src/server.js"]
