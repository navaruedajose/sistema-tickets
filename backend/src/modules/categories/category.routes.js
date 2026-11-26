'use strict';

/**
 * Rutas del catalogo de categorias.
 * Lectura para cualquier usuario autenticado; escritura solo administradores.
 */

const { Router } = require('express');
const { z } = require('zod');
const validar = require('../../middlewares/validate.middleware');

const esquemaId = z.object({ id: z.string().uuid('El identificador debe ser un UUID valido.') });

const esquemaCrear = z.object({
  nombre: z.string().trim().min(3, 'El nombre debe tener al menos 3 caracteres.').max(80),
  descripcion: z.string().trim().max(255).optional(),
  slaHoras: z.coerce
    .number()
    .int()
    .positive('El SLA debe ser mayor a cero.')
    .max(720, 'El SLA no puede exceder 720 horas.')
    .optional(),
});

const esquemaActualizar = esquemaCrear.partial().refine((datos) => Object.keys(datos).length > 0, {
  message: 'Debe indicar al menos un campo a actualizar.',
});

/**
 * @param {object} dependencias
 * @param {import('./category.controller')} dependencias.controlador
 * @param {{ autenticar: Function, autorizar: Function }} dependencias.autenticacion
 * @param {string[]} dependencias.rolesAdmin
 */
function crearRutasCategorias({ controlador, autenticacion, rolesAdmin }) {
  const router = Router();

  router.use(autenticacion.autenticar);

  router.get('/', controlador.listar);
  router.get('/:id', validar({ params: esquemaId }), controlador.obtener);

  router.post(
    '/',
    autenticacion.autorizar(...rolesAdmin),
    validar({ body: esquemaCrear }),
    controlador.crear
  );

  router.patch(
    '/:id',
    autenticacion.autorizar(...rolesAdmin),
    validar({ params: esquemaId, body: esquemaActualizar }),
    controlador.actualizar
  );

  router.delete(
    '/:id',
    autenticacion.autorizar(...rolesAdmin),
    validar({ params: esquemaId }),
    controlador.eliminar
  );

  return router;
}

module.exports = crearRutasCategorias;
