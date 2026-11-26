'use strict';

/**
 * Repositorio de comentarios.
 */

const SELECT_COMENTARIO = `
  SELECT c.id,
         c.ticket_id,
         c.contenido,
         c.es_interno,
         c.creado_en,
         c.autor_id,
         u.nombre_completo AS autor_nombre,
         u.rol             AS autor_rol
    FROM comentarios c
    INNER JOIN usuarios u ON u.id = c.autor_id
`;

class CommentRepository {
  /**
   * @param {{ consultar: Function }} db
   */
  constructor(db) {
    this.db = db;
  }

  async crear({ ticketId, autorId, contenido, esInterno }) {
    const { rows } = await this.db.consultar(
      `INSERT INTO comentarios (ticket_id, autor_id, contenido, es_interno)
       VALUES ($1, $2, $3, $4)
       RETURNING id`,
      [ticketId, autorId, contenido, esInterno === true]
    );
    return this.buscarPorId(rows[0].id);
  }

  async buscarPorId(id) {
    const { rows } = await this.db.consultar(`${SELECT_COMENTARIO} WHERE c.id = $1 LIMIT 1`, [id]);
    return rows[0] || null;
  }

  /**
   * Lista los comentarios de un ticket.
   * `incluirInternos = false` filtra las notas privadas de los agentes:
   * el filtro se aplica en SQL, no en JavaScript, para que los datos
   * sensibles nunca salgan de la base de datos hacia la capa de aplicacion.
   */
  async listarPorTicket(ticketId, { incluirInternos = true } = {}) {
    const { rows } = await this.db.consultar(
      `${SELECT_COMENTARIO}
        WHERE c.ticket_id = $1
          ${incluirInternos ? '' : 'AND c.es_interno = FALSE'}
        ORDER BY c.creado_en ASC`,
      [ticketId]
    );
    return rows;
  }

  async eliminar(id) {
    const { rowCount } = await this.db.consultar(`DELETE FROM comentarios WHERE id = $1`, [id]);
    return rowCount > 0;
  }
}

module.exports = CommentRepository;
