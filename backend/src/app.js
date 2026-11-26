'use strict';

/**
 * Construccion de la aplicacion Express.
 *
 * Se separa deliberadamente de `server.js`: la app es una funcion pura que
 * devuelve un objeto Express sin abrir puertos. Eso permite que las pruebas
 * de integracion la usen con supertest sin levantar un servidor real.
 *
 * Orden de middlewares (importa, y mucho):
 *   1. Seguridad de cabeceras
 *   2. CORS
 *   3. Compresion
 *   4. Log de peticiones
 *   5. Parseo de cuerpo
 *   6. Limite de tasa
 *   7. Rutas
 *   8. 404
 *   9. Manejador de errores (SIEMPRE al final)
 */

const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const compression = require('compression');
const morgan = require('morgan');

const config = require('./config/env');
const logger = require('./utils/logger');
const ApiResponse = require('./core/http/ApiResponse');
const { noEncontrado, manejadorDeErrores } = require('./middlewares/error.middleware');
const { limitadorGlobal } = require('./middlewares/rateLimit.middleware');
const { asegurarDirectorio } = require('./middlewares/upload.middleware');
const crearRouterPrincipal = require('./routes/index');

/**
 * @param {ReturnType<import('./core/container').construirContenedor>} contenedor
 * @returns {import('express').Express}
 */
function crearAplicacion(contenedor) {
  const app = express();

  // Confiar en el proxy inverso (Render, Railway, nginx) para que
  // `req.ip` sea la IP real del cliente y el rate limiting funcione bien.
  app.set('trust proxy', 1);
  app.disable('x-powered-by'); // No revelar el framework.

  // -------------------------------------------------------------------
  // 1. Cabeceras de seguridad
  // -------------------------------------------------------------------
  app.use(
    helmet({
      // La API no sirve HTML, asi que la CSP estricta no molesta a nadie.
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'none'"],
          frameAncestors: ["'none'"],
        },
      },
      crossOriginResourcePolicy: { policy: 'same-site' },
      referrerPolicy: { policy: 'no-referrer' },
    })
  );

  // -------------------------------------------------------------------
  // 2. CORS
  //    Solo se permiten los origenes declarados en la configuracion.
  // -------------------------------------------------------------------
  app.use(
    cors({
      origin(origen, callback) {
        // Peticiones sin origen (curl, Postman, k6) siempre se permiten.
        if (!origen) return callback(null, true);

        if (config.cors.origenes.includes(origen) || config.cors.origenes.includes('*')) {
          return callback(null, true);
        }

        logger.advertencia('Origen bloqueado por CORS', { origen });
        return callback(null, false);
      },
      credentials: true,
      methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization'],
      exposedHeaders: ['Content-Disposition', 'X-Reporte-Sin-Datos', 'X-Reporte-Aviso'],
      maxAge: 86_400,
    })
  );

  // -------------------------------------------------------------------
  // 3. Compresion de respuestas
  // -------------------------------------------------------------------
  app.use(compression());

  // -------------------------------------------------------------------
  // 4. Log de peticiones
  // -------------------------------------------------------------------
  if (!config.esPrueba) {
    morgan.token('idUsuario', (peticion) => (peticion.usuario ? peticion.usuario.id : 'anonimo'));
    app.use(
      morgan(
        config.esProduccion
          ? ':remote-addr :method :url :status :res[content-length] - :response-time ms'
          : ':method :url :status - :response-time ms',
        {
          stream: { write: (linea) => logger.depuracion('acceso_http', { linea: linea.trim() }) },
          // En desarrollo, silenciamos las peticiones de salud para no ensuciar.
          skip: (peticion) => peticion.path.endsWith('/salud') || peticion.path.endsWith('/vivo'),
        }
      )
    );
  }

  // -------------------------------------------------------------------
  // 5. Parseo del cuerpo
  //    El limite de 1 MB evita que un cliente envie un JSON gigantesco
  //    y consuma memoria del servidor.
  // -------------------------------------------------------------------
  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: true, limit: '1mb' }));

  // -------------------------------------------------------------------
  // 6. Limite de tasa global
  // -------------------------------------------------------------------
  app.use('/api', limitadorGlobal);

  // -------------------------------------------------------------------
  // 7. Preparacion del entorno de archivos
  // -------------------------------------------------------------------
  asegurarDirectorio(config.archivos.directorio);
  asegurarDirectorio(config.archivos.directorioReportes);

  // -------------------------------------------------------------------
  // 8. Rutas de la API
  //    El router principal se resuelve aqui si el llamador no lo construyo,
  //    de modo que la app es autosuficiente (comodo para pruebas con supertest).
  // -------------------------------------------------------------------
  const rutasPrincipales = contenedor.rutas.principal || crearRouterPrincipal(contenedor);
  app.use('/api/v1', rutasPrincipales);

  // Raiz informativa: si alguien abre la URL del backend en el navegador,
  // recibe una respuesta clara en lugar de un 404 desconcertante.
  app.get('/', (peticion, respuesta) =>
    ApiResponse.ok(respuesta, {
      servicio: 'API del Sistema de Tickets',
      version: '1.0.0',
      salud: '/api/v1/salud',
      indice: '/api/v1',
    })
  );

  // -------------------------------------------------------------------
  // 9. Manejo de rutas no encontradas y de errores (siempre al final)
  // -------------------------------------------------------------------
  app.use(noEncontrado);
  app.use(manejadorDeErrores);

  return app;
}

module.exports = crearAplicacion;
