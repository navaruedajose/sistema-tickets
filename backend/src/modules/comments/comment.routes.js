'use strict';

/**
 * Rutas de comentarios, montadas como subrecurso de /tickets/:ticketId.
 *
 * Se declara con `mergeParams: true` para que los parametros del router
 * padre (ticketId) esten disponibles aqui.
 */

const { Router } = require('express');
const { z } = require('zod');
const validar = require('../../middlewares/validate.middleware');

const esquemaCrearComentario = z.object({
  contenido: z
    .string({ required_error: 'El contenido del comentario es obligatorio.' })
    .trim()
    .min(1, 'El comentario no puede estar vacio.')
    .max(3000, 'El comentario no puede exceder 3000 caracteres.'),
  esInterno: z.boolean().optional(),
});

const esquemaParametros = z.object({
  ticketId: z.string().uuid('El identificador del ticket debe ser un UUID valido.'),
});

const esquemaParametrosComentario = esquemaParametros.extend({
  comentarioId: z.string().uuid('El identificador del comentario debe ser un UUID valido.'),
});

/**
 * @param {object} dependencias
 * @param {import('./comment.controller')} dependencias.controlador
 * @param {{ autenticar: Function }} dependencias.autenticacion
 */
function crearRutasComentarios({ controlador, autenticacion }) {
  const router = Router({ mergeParams: true });

  router.use(autenticacion.autenticar);

  router.get('/', validar({ params: esquemaParametros }), controlador.listar);

  router.post(
    '/',
    validar({ params: esquemaParametros, body: esquemaCrearComentario }),
    controlador.crear
  );

  router.delete(
    '/:comentarioId',
    validar({ params: esquemaParametrosComentario }),
    controlador.eliminar
  );

  return router;
}

module.exports = crearRutasComentarios;
