'use strict';

/**
 * Repositorio de adjuntos (evidencias).
 */

class AttachmentRepository {
  /**
   * @param {{ consultar: Function, conTransaccion: Function }} db
   */
  constructor(db) {
    this.db = db;
  }

  /**
   * Registra un adjunto.
   * Se usa transaccion cuando llegan varios archivos: o se registran todos
   * o no se registra ninguno, evitando filas huerfanas en disco.
   */
  async crear({ ticketId, comentarioId, nombreOriginal, nombreAlmacenado, rutaRelativa, mimeType, tamanoBytes, hashSha256, subidoPor }, cliente = null) {
    const ejecutor = cliente || this.db;
    const { rows } = await ejecutarConsulta(ejecutor,
      `INSERT INTO adjuntos
         (ticket_id, comentario_id, nombre_original, nombre_almacenado, ruta_relativa,
          mime_type, tamano_bytes, hash_sha256, subido_por)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING id, nombre_original, nombre_almacenado, ruta_relativa,
                 mime_type, tamano_bytes, hash_sha256, creado_en`,
      [
        ticketId,
        comentarioId || null,
        nombreOriginal,
        nombreAlmacenado,
        rutaRelativa,
        mimeType,
        tamanoBytes,
        hashSha256,
        subidoPor,
      ]
    );
    return rows[0];
  }

  /** Adjuntos de un ticket, con el nombre de quien los subio. */
  async listarPorTicket(ticketId) {
    const { rows } = await this.db.consultar(
      `SELECT a.id,
              a.nombre_original,
              a.nombre_almacenado,
              a.ruta_relativa,
              a.mime_type,
              a.tamano_bytes,
              a.hash_sha256,
              a.creado_en,
              u.nombre_completo AS subido_por_nombre
         FROM adjuntos a
         INNER JOIN usuarios u ON u.id = a.subido_por
        WHERE a.ticket_id = $1
        ORDER BY a.creado_en ASC`,
      [ticketId]
    );
    return rows;
  }

  async buscarPorId(id) {
    const { rows } = await this.db.consultar(
      `SELECT a.*, t.solicitante_id, t.agente_id
         FROM adjuntos a
         INNER JOIN tickets t ON t.id = a.ticket_id
        WHERE a.id = $1
        LIMIT 1`,
      [id]
    );
    return rows[0] || null;
  }

  async eliminar(id) {
    const { rowCount } = await this.db.consultar(`DELETE FROM adjuntos WHERE id = $1`, [id]);
    return rowCount > 0;
  }

  /** Espacio total ocupado por los adjuntos de un ticket. */
  async calcularTamanoTotal(ticketId) {
    const { rows } = await this.db.consultar(
      `SELECT COALESCE(SUM(tamano_bytes), 0)::BIGINT AS total FROM adjuntos WHERE ticket_id = $1`,
      [ticketId]
    );
    return Number(rows[0].total);
  }

  /** Detecta si el mismo archivo ya fue subido al ticket (deduplicacion). */
  async existeHashEnTicket(ticketId, hashSha256) {
    const { rows } = await this.db.consultar(
      `SELECT id FROM adjuntos WHERE ticket_id = $1 AND hash_sha256 = $2 LIMIT 1`,
      [ticketId, hashSha256]
    );
    return rows[0] || null;
  }
}

/**
 * Permite usar indistintamente el pool o un cliente de transaccion, que
 * exponen el mismo metodo `query`.
 */
function ejecutarConsulta(ejecutor, texto, parametros) {
  if (typeof ejecutor.consultar === 'function') {
    return ejecutor.consultar(texto, parametros);
  }
  return ejecutor.query(texto, parametros);
}

module.exports = AttachmentRepository;
