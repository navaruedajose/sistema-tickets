'use strict';

/**
 * Servicio de comentarios.
 *
 * Depende del servicio de tickets (no del repositorio de tickets) porque
 * necesita sus reglas de visibilidad. Reutilizar esa logica en lugar de
 * reimplementarla es DRY aplicado a las reglas de negocio.
 */

const AppError = require('../../core/errors/AppError');
const { ROLES, ESTADOS_TICKET } = require('../../config/constants');

class CommentService {
  /**
   * @param {object} dependencias
   * @param {import('./comment.repository')} dependencias.repositorioComentarios
   * @param {import('../tickets/ticket.service')} dependencias.servicioTickets
   * @param {import('../notifications/notification.service')} [dependencias.servicioNotificaciones]
   */
  constructor({ repositorioComentarios, servicioTickets, servicioNotificaciones = null }) {
    this.repositorio = repositorioComentarios;
    this.servicioTickets = servicioTickets;
    this.servicioNotificaciones = servicioNotificaciones;
  }

  /** Agrega un comentario al ticket. */
  async agregarComentario(ticketId, { contenido, esInterno }, usuario) {
    const ticket = await this.servicioTickets.obtenerTicket(ticketId, usuario);

    if ([ESTADOS_TICKET.CERRADO, ESTADOS_TICKET.CANCELADO].includes(ticket.estado)) {
      throw AppError.conflicto(
        `No es posible comentar un ticket en estado ${ticket.estado}. Reabralo primero.`
      );
    }

    // Solo agentes y administradores pueden crear notas internas.
    const esGestor = [ROLES.AGENTE, ROLES.ADMINISTRADOR].includes(usuario.rol);
    const marcarComoInterno = esGestor && esInterno === true;

    const comentario = await this.repositorio.crear({
      ticketId,
      autorId: usuario.id,
      contenido,
      esInterno: marcarComoInterno,
    });

    // Se notifica al solicitante solo si el comentario es publico y no lo
    // escribio el mismo (nadie quiere un correo por su propio comentario).
    if (!marcarComoInterno && ticket.solicitante_id !== usuario.id) {
      Promise.resolve()
        .then(() => this.servicioNotificaciones?.notificarNuevoComentario(ticket, comentario))
        .catch(() => undefined);
    }

    return comentario;
  }

  /** Lista los comentarios visibles para el usuario. */
  async listarComentarios(ticketId, usuario) {
    await this.servicioTickets.obtenerTicket(ticketId, usuario);

    const esGestor = [ROLES.AGENTE, ROLES.ADMINISTRADOR].includes(usuario.rol);
    return this.repositorio.listarPorTicket(ticketId, { incluirInternos: esGestor });
  }

  /** Elimina un comentario: solo su autor o un administrador. */
  async eliminarComentario(ticketId, comentarioId, usuario) {
    await this.servicioTickets.obtenerTicket(ticketId, usuario);

    const comentario = await this.repositorio.buscarPorId(comentarioId);
    if (!comentario || comentario.ticket_id !== ticketId) {
      throw AppError.noEncontrado('El comentario');
    }

    const esAutor = comentario.autor_id === usuario.id;
    if (!esAutor && usuario.rol !== ROLES.ADMINISTRADOR) {
      throw AppError.prohibido('Solo el autor del comentario o un administrador puede eliminarlo.');
    }

    return this.repositorio.eliminar(comentarioId);
  }
}

module.exports = CommentService;
