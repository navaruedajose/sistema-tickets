'use strict';

/**
 * Repositorio de notificaciones.
 * Actua como cola persistente: cada intento de envio queda registrado, con
 * su estado y numero de reintentos. Si el proveedor externo falla, el
 * mensaje no se pierde.
 */

class NotificationRepository {
  /**
   * @param {{ consultar: Function }} db
   */
  constructor(db) {
    this.db = db;
  }

  async encolar({ ticketId, usuarioId, canal, destinatario, asunto, mensaje }) {
    const { rows } = await this.db.consultar(
      `INSERT INTO notificaciones
         (ticket_id, usuario_id, canal, destinatario, asunto, mensaje)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, canal, destinatario, estado, creado_en`,
      [ticketId || null, usuarioId || null, canal, destinatario, asunto, mensaje]
    );
    return rows[0];
  }

  async marcarComoEnviada(id) {
    await this.db.consultar(
      `UPDATE notificaciones
          SET estado = 'ENVIADO', enviado_en = NOW(), error_detalle = NULL
        WHERE id = $1`,
      [id]
    );
  }

  async marcarComoFallida(id, detalleError) {
    await this.db.consultar(
      `UPDATE notificaciones
          SET estado = 'FALLIDO',
              intentos = intentos + 1,
              error_detalle = $2
        WHERE id = $1`,
      [id, String(detalleError).slice(0, 1000)]
    );
  }

  /** Notificaciones pendientes o fallidas con pocos intentos (para reintento). */
  async listarPendientesDeReintento(maximoIntentos = 3, limite = 50) {
    const { rows } = await this.db.consultar(
      `SELECT id, ticket_id, usuario_id, canal, destinatario, asunto, mensaje, intentos
         FROM notificaciones
        WHERE estado IN ('PENDIENTE', 'FALLIDO')
          AND intentos < $1
        ORDER BY creado_en ASC
        LIMIT $2`,
      [maximoIntentos, limite]
    );
    return rows;
  }

  /** Historial de notificaciones de un ticket (util para soporte). */
  async listarPorTicket(ticketId) {
    const { rows } = await this.db.consultar(
      `SELECT id, canal, destinatario, asunto, estado, intentos, enviado_en, creado_en
         FROM notificaciones
        WHERE ticket_id = $1
        ORDER BY creado_en DESC`,
      [ticketId]
    );
    return rows;
  }

  /** Metricas para el reporte de notificaciones. */
  async resumenPorEstado(desde = null, hasta = null) {
    const parametros = [];
    const condiciones = [];

    if (desde) {
      parametros.push(desde);
      condiciones.push(`creado_en >= $${parametros.length}::date`);
    }
    if (hasta) {
      parametros.push(hasta);
      condiciones.push(`creado_en < ($${parametros.length}::date + INTERVAL '1 day')`);
    }

    const clausula = condiciones.length ? `WHERE ${condiciones.join(' AND ')}` : '';

    const { rows } = await this.db.consultar(
      `SELECT canal, estado, COUNT(*)::INTEGER AS total
         FROM notificaciones
         ${clausula}
        GROUP BY canal, estado
        ORDER BY canal, estado`,
      parametros
    );
    return rows;
  }
}

module.exports = NotificationRepository;
