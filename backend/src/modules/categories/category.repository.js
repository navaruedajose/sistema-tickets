'use strict';

/**
 * Repositorio de categorias.
 * Catalogo pequeno y de baja frecuencia de cambio: candidato natural a
 * cache en memoria en una iteracion futura (ver README, seccion de roadmap).
 */

class CategoryRepository {
  /**
   * @param {{ consultar: Function }} db
   */
  constructor(db) {
    this.db = db;
  }

  async listar({ soloActivas = false } = {}) {
    const { rows } = await this.db.consultar(
      `SELECT id, nombre, descripcion, sla_horas, activo, creado_en, actualizado_en
         FROM categorias
        ${soloActivas ? 'WHERE activo = TRUE' : ''}
        ORDER BY nombre ASC`
    );
    return rows;
  }

  async buscarPorId(id) {
    const { rows } = await this.db.consultar(
      `SELECT id, nombre, descripcion, sla_horas, activo, creado_en, actualizado_en
         FROM categorias WHERE id = $1 LIMIT 1`,
      [id]
    );
    return rows[0] || null;
  }

  async buscarPorNombre(nombre) {
    const { rows } = await this.db.consultar(
      `SELECT id, nombre, descripcion, sla_horas, activo
         FROM categorias WHERE LOWER(nombre) = LOWER($1) LIMIT 1`,
      [nombre]
    );
    return rows[0] || null;
  }

  async crear({ nombre, descripcion, slaHoras }) {
    const { rows } = await this.db.consultar(
      `INSERT INTO categorias (nombre, descripcion, sla_horas)
       VALUES ($1, $2, $3)
       RETURNING id, nombre, descripcion, sla_horas, activo, creado_en`,
      [nombre, descripcion || null, slaHoras ?? 48]
    );
    return rows[0];
  }

  async actualizar(id, { nombre, descripcion, slaHoras, activo }) {
    const { rows } = await this.db.consultar(
      `UPDATE categorias
          SET nombre      = COALESCE($2, nombre),
              descripcion = COALESCE($3, descripcion),
              sla_horas   = COALESCE($4, sla_horas),
              activo      = COALESCE($5, activo)
        WHERE id = $1
        RETURNING id, nombre, descripcion, sla_horas, activo, actualizado_en`,
      [id, nombre ?? null, descripcion ?? null, slaHoras ?? null, activo ?? null]
    );
    return rows[0] || null;
  }

  async eliminar(id) {
    const { rowCount } = await this.db.consultar(`DELETE FROM categorias WHERE id = $1`, [id]);
    return rowCount > 0;
  }

  /** Cuantos tickets usan esta categoria (para impedir borrados peligrosos). */
  async contarTicketsAsociados(id) {
    const { rows } = await this.db.consultar(
      `SELECT COUNT(*)::INTEGER AS total FROM tickets WHERE categoria_id = $1`,
      [id]
    );
    return rows[0].total;
  }
}

module.exports = CategoryRepository;
