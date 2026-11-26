# =====================================================================
# SISTEMA DE TICKETS - Imagen del frontend
# Etapa 1: compila los assets con Node.
# Etapa 2: los sirve con nginx (imagen final de ~25 MB, sin Node).
# =====================================================================

# ---------------------------------------------------------------------
# ETAPA 1: compilacion
# ---------------------------------------------------------------------
FROM node:22-alpine AS compilacion

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .

# La URL de la API se inyecta en tiempo de build: Vite la incrusta en el
# bundle. Si queda vacia, la app usa rutas relativas y nginx hace el reenvio.
ARG VITE_API_URL=""
ENV VITE_API_URL=$VITE_API_URL

RUN npm run build

# ---------------------------------------------------------------------
# ETAPA 2: servidor web
# ---------------------------------------------------------------------
FROM nginx:1.27-alpine AS production

# Configuracion propia: SPA + proxy inverso hacia el backend.
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Cabeceras de seguridad reutilizables. Se copian a la carpeta de fragmentos
# de nginx porque nginx.conf las incluye con `include` en cada `location` que
# declara sus propios `add_header` (ver el comentario en security-headers.conf).
RUN mkdir -p /etc/nginx/snippets
COPY security-headers.conf /etc/nginx/snippets/security-headers.conf

COPY --from=compilacion /app/dist /usr/share/nginx/html

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD wget -q --spider http://127.0.0.1/ || exit 1

CMD ["nginx", "-g", "daemon off;"]
