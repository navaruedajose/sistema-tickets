'use strict';

/**
 * Capa de acceso a PostgreSQL.
 *
 * Se expone un Pool unico (patron Singleton) en lugar de crear conexiones
 * por peticion: crear una conexion TCP + handshake por cada request es
 * costoso y tumba el sistema bajo carga concurrente.
 *
 * Tambien expone `conTransaccion`, que resuelve el caso tipico de
 * "insertar ticket + insertar adjuntos + encolar notificacion" de forma
 * atomica: si un paso falla, todo se revierte.
 */

const { Pool } = require('pg');
const config = require('./env');
const logger = require('../utils/logger');

const pool = new Pool({
  host: config.baseDatos.host,
  port: config.baseDatos.puerto,
  database: config.baseDatos.nombre,
  user: config.baseDatos.usuario,
  password: config.baseDatos.contrasena,
  max: config.baseDatos.maximoConexiones,
  idleTimeoutMillis: config.baseDatos.tiempoEsperaOciosoMs,
  connectionTimeoutMillis: config.baseDatos.tiempoEsperaConexionMs,
  // TLS solo cuando el proveedor lo exige (DB_SSL=true). El certificado de
  // los proveedores gestionados no siempre esta en el almacen de Node, por
  // eso se acepta sin validar la cadena: la conexion sigue cifrada.
  ...(config.baseDatos.ssl ? { ssl: { rejectUnauthorized: false } } : {}),
});

pool.on('error', (error) => {
  // Un error en una conexion ociosa no debe tumbar el proceso.
  logger.error('Error inesperado en el pool de PostgreSQL', { error: error.message });
});

/**
 * Ejecuta una consulta parametrizada.
 * @param {string} texto SQL con placeholders ($1, $2, ...)
 * @param {Array} [parametros]
 * @returns {Promise<import('pg').QueryResult>}
 */
async function consultar(texto, parametros = []) {
  const inicio = Date.now();
  const resultado = await pool.query(texto, parametros);
  const duracion = Date.now() - inicio;

  // Las consultas lentas son la primera senal de un indice faltante.
  if (duracion > 500) {
    logger.advertencia('Consulta lenta detectada', { duracion, texto: texto.slice(0, 120) });
  }
  return resultado;
}

/**
 * Ejecuta un conjunto de operaciones dentro de una transaccion.
 * @param {(cliente: import('pg').PoolClient) => Promise<any>} operacion
 */
async function conTransaccion(operacion) {
  const cliente = await pool.connect();
  try {
    await cliente.query('BEGIN');
    const resultado = await operacion(cliente);
    await cliente.query('COMMIT');
    return resultado;
  } catch (error) {
    await cliente.query('ROLLBACK');
    throw error;
  } finally {
    cliente.release();
  }
}

/** Verifica la conectividad; se usa en el arranque y en /salud. */
async function verificarConexion() {
  const { rows } = await pool.query('SELECT NOW() AS ahora, current_database() AS bd');
  return rows[0];
}

/** Cierra el pool de forma ordenada durante el apagado del proceso. */
async function cerrar() {
  await pool.end();
}

module.exports = {
  pool,
  consultar,
  conTransaccion,
  verificarConexion,
  cerrar,
};
