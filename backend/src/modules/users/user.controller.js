'use strict';

/**
 * Controlador de usuarios. Capa delgada sobre el servicio.
 */

const asyncHandler = require('../../core/http/asyncHandler');
const ApiResponse = require('../../core/http/ApiResponse');

class UserController {
  /**
   * @param {import('./user.service')} servicioUsuarios
   * @param {import('../auth/auth.repository')} repositorioTokens
   */
  constructor(servicioUsuarios, repositorioTokens) {
    this.servicio = servicioUsuarios;
    this.repositorioTokens = repositorioTokens;
  }

  listar = asyncHandler(async (peticion, respuesta) => {
    const { elementos, paginacion } = await this.servicio.listarUsuarios(peticion.query);
    return ApiResponse.paginado(respuesta, elementos, paginacion);
  });

  obtener = asyncHandler(async (peticion, respuesta) => {
    const usuario = await this.servicio.obtenerUsuario(peticion.params.id);
    return ApiResponse.ok(respuesta, usuario);
  });

  actualizar = asyncHandler(async (peticion, respuesta) => {
    const usuario = await this.servicio.actualizarUsuario(
      peticion.params.id,
      peticion.body,
      peticion.usuario
    );
    return ApiResponse.ok(respuesta, usuario, 'Usuario actualizado correctamente.');
  });

  desactivar = asyncHandler(async (peticion, respuesta) => {
    const usuario = await this.servicio.desactivarUsuario(peticion.params.id, peticion.usuario);
    return ApiResponse.ok(respuesta, usuario, 'Usuario desactivado correctamente.');
  });

  cambiarContrasena = asyncHandler(async (peticion, respuesta) => {
    await this.servicio.cambiarContrasena(
      peticion.usuario.id,
      peticion.body,
      this.repositorioTokens
    );
    return ApiResponse.ok(
      respuesta,
      null,
      'Contrasena actualizada. Por seguridad se cerraron todas sus sesiones activas.'
    );
  });

  listarAgentes = asyncHandler(async (peticion, respuesta) => {
    const agentes = await this.servicio.listarAgentesDisponibles();
    return ApiResponse.ok(respuesta, agentes);
  });
}

module.exports = UserController;
