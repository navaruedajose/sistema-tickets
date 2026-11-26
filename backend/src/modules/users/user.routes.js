'use strict';

/**
 * Rutas del modulo de usuarios.
 * Todas requieren autenticacion; las administrativas exigen rol.
 */

const { Router } = require('express');
const validar = require('../../middlewares/validate.middleware');
const {
  esquemaIdParam,
  esquemaListarUsuarios,
  esquemaActualizarUsuario,
} = require('./user.schema');
const { esquemaCambioContrasena } = require('../auth/auth.schema');

/**
 * @param {object} dependencias
 * @param {import('./user.controller')} dependencias.controlador
 * @param {{ autenticar: Function, autorizar: Function }} dependencias.autenticacion
 * @param {string[]} dependencias.rolesAdmin
 */
function crearRutasUsuarios({ controlador, autenticacion, rolesAdmin }) {
  const router = Router();

  // A partir de aqui, todo exige token valido.
  router.use(autenticacion.autenticar);

  // Cambio de contrasena del usuario autenticado (va antes de /:id para que
  // "contrasena" no sea interpretado como un UUID).
  router.patch(
    '/contrasena',
    validar({ body: esquemaCambioContrasena }),
    controlador.cambiarContrasena
  );

  router.get(
    '/agentes',
    autenticacion.autorizar(...rolesAdmin),
    controlador.listarAgentes
  );

  router.get(
    '/',
    autenticacion.autorizar(...rolesAdmin),
    validar({ query: esquemaListarUsuarios }),
    controlador.listar
  );

  router.get('/:id', validar({ params: esquemaIdParam }), controlador.obtener);

  router.patch(
    '/:id',
    validar({ params: esquemaIdParam, body: esquemaActualizarUsuario }),
    controlador.actualizar
  );

  router.delete(
    '/:id',
    autenticacion.autorizar(...rolesAdmin),
    validar({ params: esquemaIdParam }),
    controlador.desactivar
  );

  return router;
}

module.exports = crearRutasUsuarios;
