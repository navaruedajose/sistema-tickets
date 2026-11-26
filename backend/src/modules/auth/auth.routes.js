'use strict';

/**
 * Rutas de autenticacion.
 *
 * Inversion de dependencias: la fabrica recibe el controlador ya construido
 * y el middleware de autenticacion ya configurado. Este archivo NO importa
 * la base de datos ni sabe como se instancia nada.
 */

const { Router } = require('express');
const validar = require('../../middlewares/validate.middleware');
const { limitadorAutenticacion } = require('../../middlewares/rateLimit.middleware');
const {
  esquemaRegistro,
  esquemaInicioSesion,
  esquemaRefresco,
} = require('./auth.schema');

/**
 * @param {object} dependencias
 * @param {import('./auth.controller')} dependencias.controlador
 * @param {{ autenticar: Function, autorizar: Function }} dependencias.autenticacion
 * @param {string[]} dependencias.rolesAdmin
 */
function crearRutasAutenticacion({ controlador, autenticacion, rolesAdmin }) {
  const router = Router();

  /**
   * @openapi
   * /auth/registro:
   *   post:
   *     summary: Registra una cuenta nueva
   *     tags: [Autenticacion]
   */
  router.post(
    '/registro',
    limitadorAutenticacion,
    validar({ body: esquemaRegistro }),
    controlador.registrar
  );

  router.post(
    '/iniciar-sesion',
    limitadorAutenticacion,
    validar({ body: esquemaInicioSesion }),
    controlador.iniciarSesion
  );

  router.post('/refrescar', validar({ body: esquemaRefresco }), controlador.refrescar);

  router.post('/cerrar-sesion', validar({ body: esquemaRefresco }), controlador.cerrarSesion);

  // --- Rutas protegidas ---
  router.get('/perfil', autenticacion.autenticar, controlador.perfil);

  router.post(
    '/cerrar-todas-las-sesiones',
    autenticacion.autenticar,
    controlador.cerrarTodasLasSesiones
  );

  /**
   * Alta de usuarios internos (agentes / administradores).
   * Requiere ser administrador: el registro publico siempre crea SOLICITANTES.
   */
  router.post(
    '/usuarios',
    autenticacion.autenticar,
    autenticacion.autorizar(...rolesAdmin),
    validar({ body: esquemaRegistro }),
    controlador.registrar
  );

  return router;
}

module.exports = crearRutasAutenticacion;
