'use strict';

/**
 * Rutas de adjuntos (subrecurso de /tickets/:ticketId).
 */

const { Router } = require('express');
const { z } = require('zod');
const validar = require('../../middlewares/validate.middleware');
const { cargarEvidencias } = require('../../middlewares/upload.middleware');
const { limitadorOperacionesCostosas } = require('../../middlewares/rateLimit.middleware');

const esquemaParametros = z.object({
  ticketId: z.string().uuid('El identificador del ticket debe ser un UUID valido.'),
});

const esquemaParametrosAdjunto = esquemaParametros.extend({
  adjuntoId: z.string().uuid('El identificador del adjunto debe ser un UUID valido.'),
});

/**
 * @param {object} dependencias
 * @param {import('./attachment.controller')} dependencias.controlador
 * @param {{ autenticar: Function }} dependencias.autenticacion
 */
function crearRutasAdjuntos({ controlador, autenticacion }) {
  const router = Router({ mergeParams: true });

  router.use(autenticacion.autenticar);

  router.get('/', validar({ params: esquemaParametros }), controlador.listar);

  /**
   * Orden critico de los middlewares:
   *   1. limite de tasa   -> corta abuso antes de tocar el disco
   *   2. validacion       -> verifica que ticketId sea un UUID antes de subir
   *   3. multer           -> escribe el archivo (ya con lista blanca y tamano maximo)
   *   4. controlador      -> verifica permisos, cuota y firma binaria
   */
  router.post(
    '/',
    limitadorOperacionesCostosas,
    validar({ params: esquemaParametros }),
    cargarEvidencias('archivos'),
    controlador.subir
  );

  router.get(
    '/:adjuntoId/descargar',
    validar({ params: esquemaParametrosAdjunto }),
    controlador.descargar
  );

  router.delete(
    '/:adjuntoId',
    validar({ params: esquemaParametrosAdjunto }),
    controlador.eliminar
  );

  return router;
}

module.exports = crearRutasAdjuntos;
