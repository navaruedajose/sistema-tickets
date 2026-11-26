'use strict';

/**
 * Configuracion centralizada del sistema.
 *
 * Principio aplicado: UNICA FUENTE DE VERDAD.
 * Ningun modulo lee `process.env` directamente; todos importan este objeto.
 * Asi, cambiar una variable de entorno o su valor por defecto se hace en un
 * solo lugar y no hay "numeros magicos" dispersos por el codigo.
 */

const path = require('path');

require('dotenv').config();

const entorno = process.env.NODE_ENV || 'development';
const esProduccion = entorno === 'production';

/** Lee una variable obligatoria; falla rapido si falta en produccion. */
function obligatoria(nombre, valorPorDefecto) {
  const valor = process.env[nombre];

  if (valor === undefined || valor === '') {
    if (esProduccion && valorPorDefecto === undefined) {
      throw new Error(`[config] Falta la variable de entorno obligatoria: ${nombre}`);
    }
    return valorPorDefecto;
  }
  return valor;
}

/** Convierte a entero con respaldo seguro. */
function entero(nombre, valorPorDefecto) {
  const valor = parseInt(process.env[nombre] ?? '', 10);
  return Number.isFinite(valor) ? valor : valorPorDefecto;
}

/** Convierte una lista separada por comas en arreglo limpio. */
function lista(nombre, valorPorDefecto) {
  const valor = process.env[nombre];
  if (!valor) return valorPorDefecto;
  return valor
    .split(',')
    .map((elemento) => elemento.trim())
    .filter(Boolean);
}

const config = {
  entorno,
  esProduccion,
  esPrueba: entorno === 'test',

  servidor: {
    puerto: entero('PORT', 4000),
    host: '0.0.0.0',
  },

  baseDatos: {
    host: obligatoria('DB_HOST', 'localhost'),
    puerto: entero('DB_PORT', 5432),
    nombre: obligatoria('DB_NAME', 'tickets_db'),
    usuario: obligatoria('DB_USER', 'tickets_user'),
    contrasena: obligatoria('DB_PASSWORD', 'tickets_pass'),
    maximoConexiones: entero('DB_POOL_MAX', 10),
    tiempoEsperaOciosoMs: 30_000,
    tiempoEsperaConexionMs: 10_000,
    /**
     * PostgreSQL gestionado (Render, Railway, RDS) exige TLS. En Docker
     * local el contenedor no lo ofrece, asi que el valor por defecto es
     * false y solo se activa en la nube con DB_SSL=true.
     */
    ssl: obligatoria('DB_SSL', 'false') === 'true',
  },

  jwt: {
    secreto: obligatoria('JWT_SECRETO', esProduccion ? undefined : 'secreto-de-desarrollo'),
    expiraEn: obligatoria('JWT_EXPIRA_EN', '15m'),
    refreshExpiraEn: obligatoria('JWT_REFRESH_EXPIRA_EN', '7d'),
    emisor: 'sistema-tickets',
  },

  cors: {
    origenes: lista('CORS_ORIGENES', ['http://localhost:5173']),
  },

  archivos: {
    directorio: path.resolve(process.cwd(), obligatoria('UPLOAD_DIR', './uploads')),
    directorioReportes: path.resolve(process.cwd(), 'reports'),
    tamanoMaximoBytes: entero('UPLOAD_MAX_MB', 10) * 1024 * 1024,
    // Lista blanca estricta: nunca confiar en la extension que envia el cliente.
    tiposPermitidos: [
      'image/png',
      'image/jpeg',
      'image/gif',
      'image/webp',
      'application/pdf',
      'text/plain',
      'text/csv',
      'application/zip',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    ],
  },

  /**
   * Almacenamiento de evidencias.
   *
   * `proveedor` acepta tres valores:
   *   - 'auto'       (por defecto) usa Cloudinary si hay credenciales y,
   *                  si no, guarda en disco. Es el modo recomendado: el
   *                  proyecto funciona igual con y sin cuenta.
   *   - 'cloudinary' obliga a usar Cloudinary; falla si faltan credenciales.
   *   - 'local'      obliga a usar disco aunque haya credenciales. Util para
   *                  comparar comportamientos o para pruebas sin red.
   */
  almacenamiento: {
    proveedor: obligatoria('STORAGE_DRIVER', 'auto').toLowerCase(),
    cloudinary: {
      cloudName: obligatoria('CLOUDINARY_CLOUD_NAME', ''),
      apiKey: obligatoria('CLOUDINARY_API_KEY', ''),
      apiSecret: obligatoria('CLOUDINARY_API_SECRET', ''),
      carpeta: obligatoria('CLOUDINARY_FOLDER', 'sistema-tickets'),
    },
  },

  notificaciones: {
    remitente: obligatoria('SMTP_FROM', 'no-responder@sistema-tickets.local'),
    smtp: {
      host: obligatoria('SMTP_HOST', ''),
      puerto: entero('SMTP_PORT', 587),
      usuario: obligatoria('SMTP_USER', ''),
      contrasena: obligatoria('SMTP_PASS', ''),
    },
    twilio: {
      sid: obligatoria('TWILIO_ACCOUNT_SID', ''),
      token: obligatoria('TWILIO_AUTH_TOKEN', ''),
      origen: obligatoria('TWILIO_FROM', ''),
    },
  },

  /**
   * Limites de tasa.
   *
   * Son configurables por entorno a proposito. En produccion conviene un
   * limite ajustado al trafico real; en desarrollo, un limite demasiado bajo
   * estorba: basta con ejecutar dos veces la verificacion automatica o las
   * pruebas de k6 para agotar la cuota y empezar a recibir 429.
   *
   * IMPORTANTE para la sustentacion: el limitador guarda los contadores en
   * memoria, asi que **reiniciar el backend los pone a cero**:
   *     docker compose restart backend
   */
  limites: {
    peticionesPorVentana: entero('RATE_LIMIT_MAX', 300),
    ventanaMs: entero('RATE_LIMIT_WINDOW_MS', 15 * 60 * 1000),
    intentosLoginPorVentana: entero('LOGIN_RATE_LIMIT_MAX', 10),

    /**
     * Limite de operaciones costosas (crear ticket, subir evidencia,
     * generar reportes). Ventana corta y cuota baja: 20 por minuto.
     *
     * Este es el limite que de verdad frena una prueba de carga sobre la
     * creacion de tickets, porque se aplica DIRECTAMENTE a ese endpoint.
     * Si la prueba de carga devuelve un 95% de 429, es por aqui.
     * Ponerlo en 0 lo desactiva.
     */
    operacionesCostosasPorMinuto: entero('RATE_LIMIT_COSTOSAS_MAX', 20),
  },
};

// Guarda de seguridad: en produccion jamas aceptamos el secreto de desarrollo.
if (esProduccion && config.jwt.secreto.includes('desarrollo')) {
  throw new Error('[config] El JWT_SECRETO de produccion no puede ser el valor de desarrollo.');
}

module.exports = config;
