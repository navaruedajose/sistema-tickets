'use strict';

/**
 * Repositorio de tickets.
 *
 * Responsabilidad unica: persistencia. Toda la SQL del dominio "ticket"
 * esta aqui. El servicio nunca escribe una consulta.
 *
 * Seguridad: TODAS las consultas usan placeholders ($1, $2...). Las unicas
 * interpolaciones de cadena son la columna de ordenamiento y la direccion,
 * y ambas llegan ya validadas contra una lista blanca.
 */

/** Columnas que se devuelven al cliente: nunca exponemos mas de lo necesario. */
const SELECT_BASE = `
  SELECT t.id,
         t.codigo,
         t.titulo,
         t.descripcion,
         t.estado,
         t.prioridad,
         t.categoria_id,
         t.solicitante_id,
         t.agente_id,
         t.solucion,
         t.fecha_limite_sla,
         t.fecha_resolucion,
         t.fecha_cierre,
         t.creado_en,
         t.actualizado_en,
         c.nombre AS categoria_nombre,
         s.nombre_completo AS solicitante_nombre,
         s.correo          AS solicitante_correo,
         s.telefono        AS solicitante_telefono,
         a.nombre_completo AS agente_nombre,
         a.correo          AS agente_correo,
         (t.fecha_limite_sla IS NOT NULL
          AND t.fecha_resolucion IS NULL
          AND t.fecha_limite_sla < NOW()) AS vencido,
         (SELECT COUNT(*)::INTEGER FROM adjuntos ad WHERE ad.ticket_id = t.id) AS total_adjuntos,
         (SELECT COUNT(*)::INTEGER FROM comentarios co WHERE co.ticket_id = t.id) AS total_comentarios
    FROM tickets t
    LEFT JOIN categorias c ON c.id = t.categoria_id
    INNER JOIN usuarios s ON s.id = t.solicitante_id
    LEFT JOIN usuarios a ON a.id = t.agente_id
`;

class TicketRepository {
  /**
   * @param {{ consultar: Function, conTransaccion: Function }} db
   */
  constructor(db) {
    this.db = db;
  }

  /**
   * Crea el ticket. El folio (codigo), el SLA y el registro de historial se
   * generan por trigger en la base de datos, no en JavaScript. Esto garantiza
   * que el folio sea unico incluso con cientos de peticiones concurrentes.
   */
  async crear({ titulo, descripcion, categoriaId, prioridad, solicitanteId, agenteId }) {
    const { rows } = await this.db.consultar(
      `INSERT INTO tickets
         (titulo, descripcion, categoria_id, prioridad, solicitante_id, agente_id, estado)
       VALUES ($1, $2, $3, $4, $5, $6, CASE WHEN $6::uuid IS NULL THEN 'NUEVO'::estado_ticket ELSE 'ABIERTO'::estado_ticket END)
       RETURNING id`,
      [titulo, descripcion, categoriaId || null, prioridad || 'MEDIA', solicitanteId, agenteId || null]
    );
    return this.buscarPorId(rows[0].id);
  }

  /** Obtiene un ticket vigente (no eliminado) con sus joins resueltos. */
  async buscarPorId(id) {
    const { rows } = await this.db.consultar(
      `${SELECT_BASE} WHERE t.id = $1 AND t.eliminado_en IS NULL LIMIT 1`,
      [id]
    );
    return rows[0] || null;
  }

  /** Version minima para comprobaciones de autorizacion (evita joins costosos). */
  async buscarBasicoPorId(id) {
    const { rows } = await this.db.consultar(
      `SELECT id, codigo, estado, prioridad, solicitante_id, agente_id, creado_en
         FROM tickets WHERE id = $1 AND eliminado_en IS NULL LIMIT 1`,
      [id]
    );
    return rows[0] || null;
  }

  /**
   * Listado paginado con filtros.
   * `alcance` permite aplicar control de acceso a nivel de consulta:
   *   - null            -> sin restriccion (agente/administrador)
   *   - { usuarioId }   -> solo los tickets donde el usuario es solicitante o agente
   */
  async listar({ desplazamiento, limite, filtros, alcance, ordenarPor, direccion }) {
    const condiciones = ['t.eliminado_en IS NULL'];
    const parametros = [];

    if (alcance && alcance.usuarioId) {
      parametros.push(alcance.usuarioId);
      condiciones.push(`(t.solicitante_id = $${parametros.length} OR t.agente_id = $${parametros.length})`);
    }

    const mapaFiltros = {
      estado: 't.estado',
      prioridad: 't.prioridad',
      categoriaId: 't.categoria_id',
      agenteId: 't.agente_id',
      solicitanteId: 't.solicitante_id',
    };

    for (const [clave, columna] of Object.entries(mapaFiltros)) {
      if (filtros[clave] !== undefined && filtros[clave] !== null) {
        parametros.push(filtros[clave]);
        condiciones.push(`${columna} = $${parametros.length}`);
      }
    }

    if (filtros.busqueda) {
      parametros.push(`%${filtros.busqueda}%`);
      const indice = parametros.length;
      // Se busca en titulo, descripcion y folio. Los comodines ya vienen
      // escapados desde el servicio.
      condiciones.push(
        `(t.titulo ILIKE $${indice} OR t.descripcion ILIKE $${indice} OR t.codigo ILIKE $${indice})`
      );
    }

    if (filtros.desde) {
      parametros.push(filtros.desde);
      condiciones.push(`t.creado_en >= $${parametros.length}::date`);
    }
    if (filtros.hasta) {
      parametros.push(filtros.hasta);
      condiciones.push(`t.creado_en < ($${parametros.length}::date + INTERVAL '1 day')`);
    }
    if (filtros.soloVencidos === true) {
      condiciones.push(
        `(t.fecha_limite_sla IS NOT NULL AND t.fecha_resolucion IS NULL AND t.fecha_limite_sla < NOW())`
      );
    }

    const clausulaWhere = `WHERE ${condiciones.join(' AND ')}`;

    const [total, datos] = await Promise.all([
      this.db.consultar(`SELECT COUNT(*)::INTEGER AS total FROM tickets t ${clausulaWhere}`, parametros),
      this.db.consultar(
        `${SELECT_BASE}
         ${clausulaWhere}
         ORDER BY t.${ordenarPor} ${direccion}
         LIMIT $${parametros.length + 1} OFFSET $${parametros.length + 2}`,
        [...parametros, limite, desplazamiento]
      ),
    ]);

    return { elementos: datos.rows, total: total.rows[0].total };
  }

  /** Actualiza campos descriptivos del ticket. */
  async actualizar(id, { titulo, descripcion, categoriaId, prioridad }) {
    const { rows } = await this.db.consultar(
      `UPDATE tickets
          SET titulo       = COALESCE($2, titulo),
              descripcion  = COALESCE($3, descripcion),
              categoria_id = COALESCE($4, categoria_id),
              prioridad    = COALESCE($5, prioridad)
        WHERE id = $1 AND eliminado_en IS NULL
        RETURNING id`,
      [id, titulo ?? null, descripcion ?? null, categoriaId ?? null, prioridad ?? null]
    );
    return rows[0] ? this.buscarPorId(rows[0].id) : null;
  }

  /**
   * Cambia el estado.
   * Las fechas de resolucion/cierre se fijan de forma atomica con CASE,
   * evitando una lectura-escritura separada que seria vulnerable a
   * condiciones de carrera.
   */
  async cambiarEstado(id, { estado, solucion }) {
    // El cast explicito a estado_ticket es OBLIGATORIO en cada aparicion de $2.
    // PostgreSQL no puede deducir el tipo del parametro cuando se usa a la vez
    // para asignar una columna ENUM y para comparar contra literales de texto:
    // sin el cast falla con "inconsistent types deduced for parameter $2".
    const { rows } = await this.db.consultar(
      `UPDATE tickets
          SET estado           = $2::estado_ticket,
              solucion         = COALESCE($3, solucion),
              fecha_resolucion = CASE
                                   WHEN $2::estado_ticket = 'RESUELTO' AND fecha_resolucion IS NULL THEN NOW()
                                   WHEN $2::estado_ticket IN ('ABIERTO','EN_PROGRESO') THEN NULL
                                   ELSE fecha_resolucion
                                 END,
              fecha_cierre     = CASE
                                   WHEN $2::estado_ticket = 'CERRADO' AND fecha_cierre IS NULL THEN NOW()
                                   ELSE fecha_cierre
                                 END
        WHERE id = $1 AND eliminado_en IS NULL
        RETURNING id`,
      [id, estado, solucion ?? null]
    );
    return rows[0] ? this.buscarPorId(rows[0].id) : null;
  }

  /** Asigna o libera el agente responsable. */
  async asignarAgente(id, agenteId) {
    const { rows } = await this.db.consultar(
      `UPDATE tickets
          SET agente_id = $2,
              estado    = CASE
                            WHEN $2::uuid IS NOT NULL AND estado = 'NUEVO' THEN 'ABIERTO'::estado_ticket
                            ELSE estado
                          END
        WHERE id = $1 AND eliminado_en IS NULL
        RETURNING id`,
      [id, agenteId]
    );
    return rows[0] ? this.buscarPorId(rows[0].id) : null;
  }

  /** Borrado logico: la trazabilidad historica se conserva. */
  async eliminarLogicamente(id) {
    const { rowCount } = await this.db.consultar(
      `UPDATE tickets SET eliminado_en = NOW() WHERE id = $1 AND eliminado_en IS NULL`,
      [id]
    );
    return rowCount > 0;
  }

  /** Bitacora de cambios de estado del ticket. */
  async obtenerHistorial(ticketId) {
    const { rows } = await this.db.consultar(
      `SELECT h.id,
              h.estado_anterior,
              h.estado_nuevo,
              h.observacion,
              h.creado_en,
              u.nombre_completo AS usuario_nombre
         FROM historial_tickets h
         LEFT JOIN usuarios u ON u.id = COALESCE(h.agente_nuevo, h.usuario_id)
        WHERE h.ticket_id = $1
        ORDER BY h.creado_en ASC`,
      [ticketId]
    );
    return rows;
  }

  /** Conteo agrupado por estado (alimenta el dashboard). */
  async contarPorEstado(alcance = null) {
    const parametros = [];
    let condicionAlcance = '';

    if (alcance && alcance.usuarioId) {
      parametros.push(alcance.usuarioId);
      condicionAlcance = `AND (solicitante_id = $1 OR agente_id = $1)`;
    }

    const { rows } = await this.db.consultar(
      `SELECT estado, COUNT(*)::INTEGER AS total
         FROM tickets
        WHERE eliminado_en IS NULL ${condicionAlcance}
        GROUP BY estado
        ORDER BY estado`,
      parametros
    );
    return rows;
  }

  /** Tickets con SLA vencido (indicador critico de gestion). */
  async contarVencidos(alcance = null) {
    const parametros = [];
    let condicionAlcance = '';

    if (alcance && alcance.usuarioId) {
      parametros.push(alcance.usuarioId);
      condicionAlcance = `AND (solicitante_id = $1 OR agente_id = $1)`;
    }

    const { rows } = await this.db.consultar(
      `SELECT COUNT(*)::INTEGER AS total
         FROM tickets
        WHERE eliminado_en IS NULL
          AND fecha_limite_sla IS NOT NULL
          AND fecha_resolucion IS NULL
          AND fecha_limite_sla < NOW()
          ${condicionAlcance}`,
      parametros
    );
    return rows[0].total;
  }
}

module.exports = TicketRepository;
