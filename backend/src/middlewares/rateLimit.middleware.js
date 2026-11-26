'use strict';

/**
 * Limitadores de tasa (rate limiting).
 *
 * Objetivo doble:
 *  - Proteger el endpoint de creacion de tickets bajo carga (requisito k6).
 *  - Bloquear ataques de fuerza bruta contra el login.
 */

const rateLimit = require('express-rate-limit');
const config = require('../config/env');
const ApiResponse = require('../core/http/ApiResponse');

/**
 * Middleware que no hace nada. Se usa cuando el limite se desactiva con
 * `RATE_LIMIT_MAX=0`.
 *
 * POR QUE EXISTE ESTA ESCOTILLA:
 * una prueba de carga y un limitador de tasa persiguen objetivos opuestos.
 * Con el limitador activo, k6 a 20 peticiones por segundo agota la cuota en
 * menos de un minuto y el resto de la prueba mide el LIMITADOR, no el
 * sistema. Para medir la capacidad real hay que desactivarlo; para demostrar
 * que el limitador funciona, se deja activo.
 *
 * Es explicito (0 = sin limite) en lugar de un valor enorme, para que quede
 * claro en el archivo .env que se desactivo a proposito.
 */
const sinLimite = (peticion, respuesta, siguiente) => siguiente();

/** Limite general para toda la API. */
const limitadorGlobal =
  config.limites.peticionesPorVentana > 0
    ? rateLimit({
        windowMs: config.limites.ventanaMs,
        max: config.limites.peticionesPorVentana,
        standardHeaders: true,
        legacyHeaders: false,
        // No contamos las peticiones de salud ni los preflight de CORS.
        skip: (peticion) =>
          peticion.method === 'OPTIONS' || peticion.path.endsWith('/salud'),
        handler: (peticion, respuesta) =>
          ApiResponse.error(
            respuesta,
            429,
            'Ha superado el numero maximo de solicitudes. Espere unos minutos e intente de nuevo.',
            'DEMASIADAS_PETICIONES'
          ),
      })
    : sinLimite;

/**
 * Limite estricto para autenticacion.
 * Solo cuenta los intentos fallidos: un usuario que acierta su contrasena
 * no consume su cuota.
 */
const limitadorAutenticacion =
  config.limites.intentosLoginPorVentana > 0
    ? rateLimit({
        windowMs: 15 * 60 * 1000,
        max: config.limites.intentosLoginPorVentana,
        skipSuccessfulRequests: true,
        standardHeaders: true,
        legacyHeaders: false,
        handler: (peticion, respuesta) =>
          ApiResponse.error(
            respuesta,
            429,
            'Demasiados intentos de inicio de sesion fallidos. Su cuenta se bloqueo temporalmente por 15 minutos.',
            'DEMASIADOS_INTENTOS'
          ),
      })
    : sinLimite;

/**
 * Limite para operaciones costosas: generar reportes, subir evidencias y
 * CREAR TICKETS.
 *
 * OJO: este es el limitador que de verdad frena la prueba de carga. Los otros
 * dos son generales; este se aplica DIRECTAMENTE al endpoint `POST /tickets`,
 * asi que con 20 peticiones por minuto, un k6 a 20 peticiones por segundo
 * recibe un 95% de 429. Si la prueba de carga muestra casi todo 429, el
 * culpable es este limite, no el global.
 *
 * Se puede desactivar con RATE_LIMIT_COSTOSAS_MAX=0.
 */
const limitadorOperacionesCostosas =
  config.limites.operacionesCostosasPorMinuto > 0
    ? rateLimit({
        windowMs: 60 * 1000,
        max: config.limites.operacionesCostosasPorMinuto,
        standardHeaders: true,
        legacyHeaders: false,
        handler: (peticion, respuesta) =>
          ApiResponse.error(
            respuesta,
            429,
            'Esta operacion es costosa. Espere un momento antes de volver a intentarlo.',
            'DEMASIADAS_PETICIONES'
          ),
      })
    : sinLimite;

module.exports = { limitadorGlobal, limitadorAutenticacion, limitadorOperacionesCostosas };
