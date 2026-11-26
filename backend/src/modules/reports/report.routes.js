'use strict';

/**
 * Rutas del modulo de reportes.
 * Todo el modulo esta restringido a agentes y administradores: un
 * solicitante no debe poder descargar el consolidado de la operacion.
 */

const { Router } = require('express');
const { z } = require('zod');
const validar = require('../../middlewares/validate.middleware');
const { limitadorOperacionesCostosas } = require('../../middlewares/rateLimit.middleware');

const fechaISO = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'La fecha debe tener el formato AAAA-MM-DD.');

const esquemaConsultaReporte = z.object({
  formato: z.enum(['pdf', 'xlsx', 'PDF', 'XLSX']).optional(),
  tipo: z.enum(['gestion', 'agentes', 'detalle']).optional(),
  desde: fechaISO.optional(),
  hasta: fechaISO.optional(),
});

const esquemaConsultaDashboard = z.object({
  desde: fechaISO.optional(),
  hasta: fechaISO.optional(),
  dias: z.coerce.number().int().min(1).max(365).optional(),
});

/**
 * @param {object} dependencias
 * @param {import('./report.controller')} dependencias.controlador
 * @param {{ autenticar: Function, autorizar: Function }} dependencias.autenticacion
 * @param {string[]} dependencias.rolesGestores
 */
function crearRutasReportes({ controlador, autenticacion, rolesGestores }) {
  const router = Router();

  router.use(autenticacion.autenticar);
  router.use(autenticacion.autorizar(...rolesGestores));

  router.get(
    '/tickets',
    limitadorOperacionesCostosas,
    validar({ query: esquemaConsultaReporte }),
    controlador.descargar
  );

  router.get('/dashboard', validar({ query: esquemaConsultaDashboard }), controlador.dashboard);

  router.post('/limpiar', controlador.limpiar);

  return router;
}

module.exports = crearRutasReportes;
