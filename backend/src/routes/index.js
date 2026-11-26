'use strict';

/**
 * Registro central de rutas de la API (version 1).
 *
 * Aqui se declara el mapa completo de la API. Es el documento vivo que
 * permite responder en segundos la pregunta "¿que endpoints expone el
 * sistema?" durante la sustentacion.
 */

const { Router } = require('express');
const db = require('../config/database');
const ApiResponse = require('../core/http/ApiResponse');
const asyncHandler = require('../core/http/asyncHandler');
const config = require('../config/env');

/**
 * @param {ReturnType<import('../core/container').construirContenedor>} contenedor
 * @returns {import('express').Router}
 */
function crearRouterPrincipal(contenedor) {
  const router = Router();

  // ===================================================================
  // Salud del servicio
  // Sin autenticacion: lo consultan Docker, el balanceador y el monitoreo.
  // ===================================================================
  router.get(
    '/salud',
    asyncHandler(async (peticion, respuesta) => {
      const inicio = Date.now();
      const bd = await db.verificarConexion();

      return ApiResponse.ok(respuesta, {
        servicio: 'sistema-tickets-api',
        version: '1.0.0',
        entorno: config.entorno,
        estado: 'operativo',
        baseDatos: {
          conectada: true,
          nombre: bd.bd,
          latenciaMs: Date.now() - inicio,
        },
        marcaDeTiempo: new Date().toISOString(),
        tiempoActivoSegundos: Math.floor(process.uptime()),
      });
    })
  );

  /** Sonda de disponibilidad ligera (sin tocar la base de datos). */
  router.get('/vivo', (peticion, respuesta) => respuesta.status(200).json({ vivo: true }));

  // ===================================================================
  // Modulos funcionales
  // ===================================================================
  router.use('/auth', contenedor.rutas.autenticacion);
  router.use('/usuarios', contenedor.rutas.usuarios);
  router.use('/categorias', contenedor.rutas.categorias);
  router.use('/tickets', contenedor.rutas.tickets);
  router.use('/reportes', contenedor.rutas.reportes);
  router.use('/notificaciones', contenedor.rutas.notificaciones);

  // ===================================================================
  // Indice de la API (utilidad de descubrimiento para el frontend)
  // ===================================================================
  router.get('/', (peticion, respuesta) =>
    ApiResponse.ok(respuesta, {
      nombre: 'API del Sistema de Tickets',
      version: 'v1',
      documentacion: 'Consulte el archivo README.md y la coleccion de Postman incluida en el repositorio.',
      modulos: {
        autenticacion: {
          base: 'POST /api/v1/auth',
          endpoints: [
            'POST /registro - Registra una cuenta (publico: siempre SOLICITANTE)',
            'POST /iniciar-sesion - Obtiene el par de tokens',
            'POST /refrescar - Renueva el token de acceso',
            'POST /cerrar-sesion - Revoca el token de refresco',
            'GET  /perfil - Perfil del usuario autenticado',
            'POST /usuarios - Alta de agente o administrador (solo ADMINISTRADOR)',
          ],
        },
        tickets: {
          base: '/api/v1/tickets',
          endpoints: [
            'GET    / - Listado paginado con filtros',
            'POST   / - Crea un ticket',
            'GET    /estadisticas - KPIs del dashboard',
            'GET    /:id - Detalle del ticket',
            'PATCH  /:id - Actualiza datos descriptivos',
            'PATCH  /:id/estado - Cambia el estado (maquina de estados)',
            'PATCH  /:id/agente - Asigna el responsable',
            'GET    /:id/historial - Bitacora de cambios',
            'DELETE /:id - Eliminacion logica',
            'GET    /:id/comentarios - Conversacion del ticket',
            'POST   /:id/comentarios - Agrega comentario o nota interna',
            'POST   /:id/adjuntos - Sube evidencias (multipart, campo "archivos")',
            'GET    /:id/adjuntos/:adjuntoId/descargar - Descarga una evidencia',
          ],
        },
        reportes: {
          base: '/api/v1/reportes',
          endpoints: [
            'GET  /tickets?formato=pdf|xlsx&desde=&hasta=&tipo= - Descarga el reporte',
            'GET  /dashboard - Datos JSON para las graficas',
            'POST /limpiar - Elimina reportes temporales antiguos',
          ],
        },
        notificaciones: {
          base: '/api/v1/notificaciones',
          endpoints: [
            'GET  /ticket/:ticketId - Historial de envios de un ticket',
            'GET  /resumen - Metricas de entrega',
            'POST /reintentar - Reintenta la cola fallida (solo ADMINISTRADOR)',
          ],
        },
      },
    })
  );

  return router;
}

module.exports = crearRouterPrincipal;
