'use strict';

/**
 * Rutas del modulo de tickets.
 *
 * Orden importante: las rutas literales (/estadisticas) se declaran ANTES
 * de las parametricas (/:id); de lo contrario Express interpretaria
 * "estadisticas" como un UUID y devolveria un error de validacion.
 */

const { Router } = require('express');
const validar = require('../../middlewares/validate.middleware');
const { limitadorOperacionesCostosas } = require('../../middlewares/rateLimit.middleware');
const {
  esquemaCrearTicket,
  esquemaActualizarTicket,
  esquemaCambiarEstado,
  esquemaAsignarAgente,
  esquemaListarTickets,
  esquemaIdParam,
} = require('./ticket.schema');

/**
 * @param {object} dependencias
 * @param {import('./ticket.controller')} dependencias.controlador
 * @param {{ autenticar: Function, autorizar: Function }} dependencias.autenticacion
 * @param {string[]} dependencias.rolesGestores
 * @param {string[]} dependencias.rolesAdmin
 * @param {Function} dependencias.rutasComentarios
 * @param {Function} dependencias.rutasAdjuntos
 */
function crearRutasTickets({
  controlador,
  autenticacion,
  rolesGestores,
  rolesAdmin,
  rutasComentarios,
  rutasAdjuntos,
}) {
  const router = Router();

  router.use(autenticacion.autenticar);

  // --- Rutas literales (deben ir primero) ---
  router.get('/estadisticas', controlador.estadisticas);

  // --- Coleccion ---
  router.get('/', validar({ query: esquemaListarTickets }), controlador.listar);

  // Limite de operaciones costosas: protege este endpoint cuando llegan
  // rafagas masivas de creaciones, respondiendo 429 de forma controlada en
  // lugar de agotar el pool de conexiones.
  //
  // IMPORTANTE para la prueba de carga: este limite (20 por minuto) es el
  // que hace que k6 reciba un 429 en casi todas las creaciones. Es el
  // comportamiento correcto del sistema, pero impide MEDIR la capacidad de
  // creacion. Para medirla hay que desactivarlo con RATE_LIMIT_COSTOSAS_MAX=0
  // (lo hace `k6/EJECUTAR-CARGA.bat`).
  router.post(
    '/',
    limitadorOperacionesCostosas,
    validar({ body: esquemaCrearTicket }),
    controlador.crear
  );

  // --- Rutas anidadas: comentarios y adjuntos de un ticket ---
  router.use('/:ticketId/comentarios', rutasComentarios);
  router.use('/:ticketId/adjuntos', rutasAdjuntos);

  // --- Subrecursos y acciones sobre un ticket concreto ---
  router.get('/:id', validar({ params: esquemaIdParam }), controlador.obtener);

  router.patch(
    '/:id',
    validar({ params: esquemaIdParam, body: esquemaActualizarTicket }),
    controlador.actualizar
  );

  router.patch(
    '/:id/estado',
    validar({ params: esquemaIdParam, body: esquemaCambiarEstado }),
    controlador.cambiarEstado
  );

  router.patch(
    '/:id/agente',
    autenticacion.autorizar(...rolesGestores),
    validar({ params: esquemaIdParam, body: esquemaAsignarAgente }),
    controlador.asignarAgente
  );

  router.get(
    '/:id/historial',
    validar({ params: esquemaIdParam }),
    controlador.historial
  );

  router.delete(
    '/:id',
    validar({ params: esquemaIdParam }),
    controlador.eliminar
  );

  return router;
}

module.exports = crearRutasTickets;
