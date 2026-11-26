'use strict';

/**
 * Rutas del modulo de notificaciones.
 * Utilidad administrativa: historial por ticket y reintento de la cola.
 */

const { Router } = require('express');
const { z } = require('zod');
const validar = require('../../middlewares/validate.middleware');

const esquemaParametros = z.object({
  ticketId: z.string().uuid('El identificador del ticket debe ser un UUID valido.'),
});

/**
 * @param {object} dependencias
 * @param {import('./notification.service')} dependencias.servicioNotificaciones
 * @param {import('./notification.repository')} dependencias.repositorioNotificaciones
 * @param {{ autenticar: Function, autorizar: Function }} dependencias.autenticacion
 * @param {string[]} dependencias.rolesGestores
 * @param {string[]} dependencias.rolesAdmin
 */
function crearRutasNotificaciones({
  servicioNotificaciones,
  repositorioNotificaciones,
  autenticacion,
  rolesGestores,
  rolesAdmin,
}) {
  const router = Router();

  router.use(autenticacion.autenticar);
  router.use(autenticacion.autorizar(...rolesGestores));

  /** Historial de notificaciones de un ticket (soporte y auditoria). */
  router.get('/ticket/:ticketId', validar({ params: esquemaParametros }), async (peticion, respuesta, siguiente) => {
    try {
      const notificaciones = await repositorioNotificaciones.listarPorTicket(peticion.params.ticketId);
      respuesta.status(200).json({ exito: true, datos: notificaciones });
    } catch (error) {
      siguiente(error);
    }
  });

  /** Metricas de entrega: cuantas se enviaron, cuantas fallaron. */
  router.get('/resumen', async (peticion, respuesta, siguiente) => {
    try {
      const resumen = await repositorioNotificaciones.resumenPorEstado(
        peticion.query.desde || null,
        peticion.query.hasta || null
      );
      respuesta.status(200).json({ exito: true, datos: resumen });
    } catch (error) {
      siguiente(error);
    }
  });

  /**
   * Reintento manual de la cola de notificaciones fallidas.
   * Es el boton que salva la demo si el servidor de correo estaba caido.
   */
  router.post(
    '/reintentar',
    autenticacion.autorizar(...rolesAdmin),
    async (peticion, respuesta, siguiente) => {
      try {
        const resultado = await servicioNotificaciones.reintentarPendientes(3);
        respuesta.status(200).json({
          exito: true,
          datos: resultado,
          mensaje: `Reintento finalizado: ${resultado.enviadas} enviada(s), ${resultado.fallidas} fallida(s).`,
        });
      } catch (error) {
        siguiente(error);
      }
    }
  );

  return router;
}

module.exports = crearRutasNotificaciones;
