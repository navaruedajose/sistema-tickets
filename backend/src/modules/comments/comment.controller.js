'use strict';

/**
 * Controlador de comentarios.
 */

const asyncHandler = require('../../core/http/asyncHandler');
const ApiResponse = require('../../core/http/ApiResponse');

class CommentController {
  /**
   * @param {import('./comment.service')} servicioComentarios
   */
  constructor(servicioComentarios) {
    this.servicio = servicioComentarios;
  }

  crear = asyncHandler(async (peticion, respuesta) => {
    const comentario = await this.servicio.agregarComentario(
      peticion.params.ticketId,
      peticion.body,
      peticion.usuario
    );
    return ApiResponse.creado(respuesta, comentario, 'Comentario agregado correctamente.');
  });

  listar = asyncHandler(async (peticion, respuesta) => {
    const comentarios = await this.servicio.listarComentarios(
      peticion.params.ticketId,
      peticion.usuario
    );
    return ApiResponse.ok(respuesta, comentarios);
  });

  eliminar = asyncHandler(async (peticion, respuesta) => {
    await this.servicio.eliminarComentario(
      peticion.params.ticketId,
      peticion.params.comentarioId,
      peticion.usuario
    );
    return ApiResponse.sinContenido(respuesta);
  });
}

module.exports = CommentController;
