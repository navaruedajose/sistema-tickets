'use strict';

/**
 * Controlador de autenticacion.
 *
 * Capa delgada: traduce HTTP -> servicio -> HTTP. No contiene reglas de
 * negocio ni SQL. Si una regla cambia, se cambia en el servicio y este
 * archivo permanece intacto (SRP).
 */

const asyncHandler = require('../../core/http/asyncHandler');
const ApiResponse = require('../../core/http/ApiResponse');

class AuthController {
  /**
   * @param {import('./auth.service')} servicioAutenticacion
   */
  constructor(servicioAutenticacion) {
    this.servicio = servicioAutenticacion;
  }

  registrar = asyncHandler(async (peticion, respuesta) => {
    // Si quien registra es administrador, puede asignar rol; si es publico,
    // el servicio fuerza SOLICITANTE.
    const rolSolicitante = peticion.usuario ? peticion.usuario.rol : null;
    const resultado = await this.servicio.registrar(peticion.body, rolSolicitante);
    return ApiResponse.creado(respuesta, resultado, 'Cuenta creada correctamente.');
  });

  iniciarSesion = asyncHandler(async (peticion, respuesta) => {
    const resultado = await this.servicio.iniciarSesion(peticion.body);
    return ApiResponse.ok(respuesta, resultado, 'Sesion iniciada correctamente.');
  });

  refrescar = asyncHandler(async (peticion, respuesta) => {
    const resultado = await this.servicio.refrescarToken(peticion.body.tokenRefresco);
    return ApiResponse.ok(respuesta, resultado, 'Token renovado correctamente.');
  });

  cerrarSesion = asyncHandler(async (peticion, respuesta) => {
    await this.servicio.cerrarSesion(peticion.body.tokenRefresco);
    return ApiResponse.ok(respuesta, null, 'Sesion cerrada correctamente.');
  });

  cerrarTodasLasSesiones = asyncHandler(async (peticion, respuesta) => {
    const resultado = await this.servicio.cerrarTodasLasSesiones(peticion.usuario.id);
    return ApiResponse.ok(respuesta, resultado, 'Se cerraron todas las sesiones activas.');
  });

  perfil = asyncHandler(async (peticion, respuesta) => {
    const usuario = await this.servicio.obtenerPerfil(peticion.usuario.id);
    return ApiResponse.ok(respuesta, usuario);
  });
}

module.exports = AuthController;
