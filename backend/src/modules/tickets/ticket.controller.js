'use strict';

/**
 * Controlador de tickets. Capa delgada HTTP.
 * Observese que no hay un solo `try/catch`: los errores viajan al middleware
 * central gracias a asyncHandler.
 */

const asyncHandler = require('../../core/http/asyncHandler');
const ApiResponse = require('../../core/http/ApiResponse');

class TicketController {
  /**
   * @param {import('./ticket.service')} servicioTickets
   */
  constructor(servicioTickets) {
    this.servicio = servicioTickets;
  }

  crear = asyncHandler(async (peticion, respuesta) => {
    const ticket = await this.servicio.crearTicket(peticion.body, peticion.usuario);
    return ApiResponse.creado(respuesta, ticket, `Ticket ${ticket.codigo} creado correctamente.`);
  });

  listar = asyncHandler(async (peticion, respuesta) => {
    const { elementos, paginacion } = await this.servicio.listarTickets(peticion.query, peticion.usuario);
    return ApiResponse.paginado(respuesta, elementos, paginacion);
  });

  obtener = asyncHandler(async (peticion, respuesta) => {
    const ticket = await this.servicio.obtenerTicket(peticion.params.id, peticion.usuario);
    return ApiResponse.ok(respuesta, ticket);
  });

  actualizar = asyncHandler(async (peticion, respuesta) => {
    const ticket = await this.servicio.actualizarTicket(peticion.params.id, peticion.body, peticion.usuario);
    return ApiResponse.ok(respuesta, ticket, 'Ticket actualizado correctamente.');
  });

  cambiarEstado = asyncHandler(async (peticion, respuesta) => {
    const ticket = await this.servicio.cambiarEstado(peticion.params.id, peticion.body, peticion.usuario);
    return ApiResponse.ok(respuesta, ticket, `El ticket ahora esta en estado ${ticket.estado}.`);
  });

  asignarAgente = asyncHandler(async (peticion, respuesta) => {
    const ticket = await this.servicio.asignarAgente(peticion.params.id, peticion.body, peticion.usuario);
    return ApiResponse.ok(respuesta, ticket, 'Asignacion actualizada correctamente.');
  });

  eliminar = asyncHandler(async (peticion, respuesta) => {
    await this.servicio.eliminarTicket(peticion.params.id, peticion.usuario);
    return ApiResponse.sinContenido(respuesta);
  });

  historial = asyncHandler(async (peticion, respuesta) => {
    const historial = await this.servicio.obtenerHistorial(peticion.params.id, peticion.usuario);
    return ApiResponse.ok(respuesta, historial);
  });

  estadisticas = asyncHandler(async (peticion, respuesta) => {
    const estadisticas = await this.servicio.obtenerEstadisticas(peticion.usuario);
    return ApiResponse.ok(respuesta, estadisticas);
  });
}

module.exports = TicketController;
