'use strict';

/**
 * Controlador de categorias.
 */

const asyncHandler = require('../../core/http/asyncHandler');
const ApiResponse = require('../../core/http/ApiResponse');

class CategoryController {
  /**
   * @param {import('./category.service')} servicioCategorias
   */
  constructor(servicioCategorias) {
    this.servicio = servicioCategorias;
  }

  listar = asyncHandler(async (peticion, respuesta) => {
    const soloActivas = peticion.query.soloActivas === 'true';
    const categorias = await this.servicio.listar(soloActivas);
    return ApiResponse.ok(respuesta, categorias);
  });

  obtener = asyncHandler(async (peticion, respuesta) => {
    const categoria = await this.servicio.obtener(peticion.params.id);
    return ApiResponse.ok(respuesta, categoria);
  });

  crear = asyncHandler(async (peticion, respuesta) => {
    const categoria = await this.servicio.crear(peticion.body);
    return ApiResponse.creado(respuesta, categoria, 'Categoria creada correctamente.');
  });

  actualizar = asyncHandler(async (peticion, respuesta) => {
    const categoria = await this.servicio.actualizar(peticion.params.id, peticion.body);
    return ApiResponse.ok(respuesta, categoria, 'Categoria actualizada correctamente.');
  });

  eliminar = asyncHandler(async (peticion, respuesta) => {
    await this.servicio.eliminar(peticion.params.id);
    return ApiResponse.sinContenido(respuesta);
  });
}

module.exports = CategoryController;
