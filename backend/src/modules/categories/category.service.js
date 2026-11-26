'use strict';

/**
 * Servicio de categorias: reglas del catalogo.
 */

const AppError = require('../../core/errors/AppError');

class CategoryService {
  /**
   * @param {import('./category.repository')} repositorioCategorias
   */
  constructor(repositorioCategorias) {
    this.repositorio = repositorioCategorias;
  }

  async listar(soloActivas = false) {
    return this.repositorio.listar({ soloActivas });
  }

  async obtener(id) {
    const categoria = await this.repositorio.buscarPorId(id);
    if (!categoria) throw AppError.noEncontrado('La categoria');
    return categoria;
  }

  async crear(datos) {
    if (await this.repositorio.buscarPorNombre(datos.nombre)) {
      throw AppError.conflicto('Ya existe una categoria con ese nombre.');
    }
    return this.repositorio.crear(datos);
  }

  async actualizar(id, datos) {
    await this.obtener(id);

    if (datos.nombre) {
      const existente = await this.repositorio.buscarPorNombre(datos.nombre);
      if (existente && existente.id !== id) {
        throw AppError.conflicto('Ya existe otra categoria con ese nombre.');
      }
    }
    return this.repositorio.actualizar(id, datos);
  }

  /**
   * Elimina una categoria solo si no tiene tickets asociados.
   * Regla de integridad: preferimos rechazar la operacion antes que dejar
   * tickets huerfanos o perder su clasificacion historica.
   */
  async eliminar(id) {
    await this.obtener(id);

    const ticketsAsociados = await this.repositorio.contarTicketsAsociados(id);
    if (ticketsAsociados > 0) {
      throw AppError.conflicto(
        `No es posible eliminar la categoria: tiene ${ticketsAsociados} ticket(s) asociado(s). Desactivela en su lugar.`
      );
    }
    return this.repositorio.eliminar(id);
  }
}

module.exports = CategoryService;
