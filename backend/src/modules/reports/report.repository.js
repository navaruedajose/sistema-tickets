'use strict';

/**
 * Repositorio de reportes.
 *
 * Responsabilidad unica: agregaciones y consultas analiticas.
 * Se separa del repositorio de tickets porque responde a otra pregunta de
 * negocio ("como vamos" en lugar de "que tickets hay"). Principio de
 * Segregacion de Interfaces: quien solo necesita CRUD no carga con SQL
 * analitico, y viceversa.
 *
 * Nota: las consultas reutilizan las vistas `vista_resumen_tickets` y
 * `vista_desempeno_agentes` definidas en el esquema, evitando duplicar la
 * logica de agregacion entre SQL y JavaScript (DRY).
 */

class ReportRepository {
  /**
   * @param {{ consultar: Function }} db
   */
  constructor(db) {
    this.db = db;
  }

  /**
   * Construye el filtro de rango de fechas reutilizable.
   *
   * `alias` es obligatorio cuando la consulta lleva JOIN: tanto `categorias`
   * como `usuarios` tienen su propia columna `creado_en`, asi que sin
   * cualificar la referencia PostgreSQL falla con
   * "column reference creado_en is ambiguous".
   *
   * @param {string|null} desde
   * @param {string|null} hasta
   * @param {Array} parametros  Se muta: recibe los valores en orden.
   * @param {string} alias      Prefijo de tabla, p. ej. 't'. Vacio si no hay JOIN.
   */
  #rangoFechas(desde, hasta, parametros, alias = '') {
    const prefijo = alias ? `${alias}.` : '';
    const condiciones = [];
    if (desde) {
      parametros.push(desde);
      condiciones.push(`${prefijo}creado_en >= $${parametros.length}::date`);
    }
    if (hasta) {
      parametros.push(hasta);
      condiciones.push(`${prefijo}creado_en < ($${parametros.length}::date + INTERVAL '1 day')`);
    }
    return condiciones;
  }

  /** Resumen general: totales por estado. */
  async resumenPorEstado({ desde = null, hasta = null } = {}) {
    const parametros = [];
    const condiciones = this.#rangoFechas(desde, hasta, parametros);
    condiciones.push('eliminado_en IS NULL');

    const { rows } = await this.db.consultar(
      `SELECT estado, COUNT(*)::INTEGER AS total
         FROM tickets
        WHERE ${condiciones.join(' AND ')}
        GROUP BY estado
        ORDER BY total DESC`,
      parametros
    );
    return rows;
  }

  /** Distribucion por prioridad y categoria. */
  async resumenPorPrioridadYCategoria({ desde = null, hasta = null } = {}) {
    const parametros = [];
    const condiciones = this.#rangoFechas(desde, hasta, parametros, 't');
    condiciones.push('t.eliminado_en IS NULL');

    const { rows } = await this.db.consultar(
      `SELECT COALESCE(c.nombre, 'Sin categoria') AS categoria,
              t.prioridad,
              COUNT(*)::INTEGER AS total
         FROM tickets t
         LEFT JOIN categorias c ON c.id = t.categoria_id
        WHERE ${condiciones.join(' AND ')}
        GROUP BY COALESCE(c.nombre, 'Sin categoria'), t.prioridad
        ORDER BY categoria ASC, t.prioridad ASC`,
      parametros
    );
    return rows;
  }

  /**
   * Desempeno por agente: carga, resoluciones, tiempo medio y cumplimiento
   * de SLA. Consume la vista `vista_desempeno_agentes`.
   */
  async desempenoPorAgente() {
    const { rows } = await this.db.consultar(
      `SELECT agente_id,
              agente,
              correo_agente,
              total_asignados,
              total_resueltos,
              total_cerrados,
              total_pendientes,
              promedio_horas_resolucion,
              porcentaje_cumplimiento_sla
         FROM vista_desempeno_agentes
        ORDER BY total_resueltos DESC, agente ASC`
    );
    return rows;
  }

  /** Indicadores globales del periodo (KPIs de la portada del reporte). */
  async indicadoresGlobales({ desde = null, hasta = null } = {}) {
    const parametros = [];
    const condiciones = this.#rangoFechas(desde, hasta, parametros);
    condiciones.push('eliminado_en IS NULL');

    const { rows } = await this.db.consultar(
      `SELECT
          COUNT(*)::INTEGER AS total_tickets,
          COUNT(*) FILTER (WHERE estado IN ('RESUELTO','CERRADO'))::INTEGER AS resueltos,
          COUNT(*) FILTER (WHERE estado IN ('NUEVO','ABIERTO','EN_PROGRESO','EN_ESPERA'))::INTEGER AS pendientes,
          COUNT(*) FILTER (WHERE estado = 'CANCELADO')::INTEGER AS cancelados,
          COUNT(*) FILTER (
            WHERE fecha_limite_sla IS NOT NULL
              AND fecha_resolucion IS NULL
              AND fecha_limite_sla < NOW()
          )::INTEGER AS vencidos,
          ROUND(AVG(EXTRACT(EPOCH FROM (fecha_resolucion - creado_en)) / 3600.0)::NUMERIC, 2)
              AS promedio_horas_resolucion,
          ROUND(
            100.0 * COUNT(*) FILTER (
              WHERE fecha_resolucion IS NOT NULL AND fecha_resolucion <= fecha_limite_sla
            ) / NULLIF(COUNT(*) FILTER (WHERE fecha_resolucion IS NOT NULL), 0)
          , 2) AS porcentaje_cumplimiento_sla
         FROM tickets
        WHERE ${condiciones.join(' AND ')}`,
      parametros
    );

    return rows[0];
  }

  /**
   * Serie temporal de creacion vs. resolucion por dia.
   * Alimenta la grafica de tendencia del reporte.
   */
  async serieTemporal({ desde = null, hasta = null, dias = 30 } = {}) {
    // El eje X va desde `desde` (o los ultimos N dias si no se indica) hasta
    // `hasta` (o hoy). El rango se resuelve en SQL con COALESCE, de modo que el
    // mismo statement sirve para ambos casos.
    //
    // OJO: antes esta consulta construia las condiciones de fecha y despues no
    // las usaba, asi que el rango se ignoraba en silencio. Ahora el rango forma
    // parte del CTE que genera el eje de dias.
    //
    // `dias` viaja siempre como parametro entero: nunca se interpola.
    const { rows } = await this.db.consultar(
      `WITH rango AS (
         SELECT COALESCE($1::date, (NOW() - ($3::INTEGER || ' days')::INTERVAL)::date) AS desde,
                COALESCE($2::date, NOW()::date) AS hasta
       ),
       dias AS (
         SELECT generate_series(r.desde, r.hasta, INTERVAL '1 day')::date AS dia
           FROM rango r
       )
       SELECT d.dia::TEXT AS fecha,
              COALESCE(creados.total, 0)::INTEGER    AS creados,
              COALESCE(resueltos.total, 0)::INTEGER  AS resueltos
         FROM dias d
         LEFT JOIN LATERAL (
           SELECT COUNT(*) AS total FROM tickets t
            WHERE t.creado_en::date = d.dia AND t.eliminado_en IS NULL
         ) creados ON TRUE
         LEFT JOIN LATERAL (
           SELECT COUNT(*) AS total FROM tickets t
            WHERE t.fecha_resolucion::date = d.dia AND t.eliminado_en IS NULL
         ) resueltos ON TRUE
        ORDER BY d.dia ASC`,
      [desde, hasta, dias]
    );
    return rows;
  }

  /** Top de solicitantes mas activos (util para priorizar capacitacion). */
  async topSolicitantes({ desde = null, hasta = null, limite = 10 } = {}) {
    const parametros = [];
    const condiciones = this.#rangoFechas(desde, hasta, parametros, 't');
    condiciones.push('t.eliminado_en IS NULL');

    parametros.push(limite);

    const { rows } = await this.db.consultar(
      `SELECT u.nombre_completo AS solicitante,
              u.correo,
              u.departamento,
              COUNT(t.id)::INTEGER AS total_tickets
         FROM tickets t
         INNER JOIN usuarios u ON u.id = t.solicitante_id
        WHERE ${condiciones.join(' AND ')}
        GROUP BY u.id, u.nombre_completo, u.correo, u.departamento
        ORDER BY total_tickets DESC
        LIMIT $${parametros.length}`,
      parametros
    );
    return rows;
  }

  /** Listado detallado de tickets para exportar a Excel. */
  async detalleTickets({ desde = null, hasta = null, estado = null, limite = 5000 } = {}) {
    const parametros = [];
    const condiciones = this.#rangoFechas(desde, hasta, parametros, 't');
    condiciones.push('t.eliminado_en IS NULL');

    if (estado) {
      parametros.push(estado);
      condiciones.push(`t.estado = $${parametros.length}`);
    }

    parametros.push(limite);

    const { rows } = await this.db.consultar(
      `SELECT t.codigo,
              t.titulo,
              t.estado,
              t.prioridad,
              COALESCE(c.nombre, 'Sin categoria') AS categoria,
              s.nombre_completo AS solicitante,
              COALESCE(a.nombre_completo, 'Sin asignar') AS agente,
              t.creado_en,
              t.fecha_limite_sla,
              t.fecha_resolucion,
              ROUND(EXTRACT(EPOCH FROM (t.fecha_resolucion - t.creado_en)) / 3600.0, 2)
                AS horas_resolucion,
              CASE
                WHEN t.fecha_resolucion IS NULL THEN 'Pendiente'
                WHEN t.fecha_resolucion <= t.fecha_limite_sla THEN 'En tiempo'
                ELSE 'Fuera de tiempo'
              END AS cumplimiento_sla
         FROM tickets t
         LEFT JOIN categorias c ON c.id = t.categoria_id
         INNER JOIN usuarios s ON s.id = t.solicitante_id
         LEFT JOIN usuarios a ON a.id = t.agente_id
        WHERE ${condiciones.join(' AND ')}
        ORDER BY t.creado_en DESC
        LIMIT $${parametros.length}`,
      parametros
    );
    return rows;
  }
}

module.exports = ReportRepository;
