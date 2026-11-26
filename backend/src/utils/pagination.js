'use strict';

/**
 * Utilidades de paginacion, ordenamiento y busqueda.
 *
 * Centralizar esto evita que cada repositorio invente su propio LIMIT/OFFSET
 * (DRY) y es la barrera que impide inyeccion SQL en las clausulas ORDER BY,
 * que NO pueden parametrizarse con placeholders de PostgreSQL.
 */

const AppError = require('../core/errors/AppError');

const LIMITE_POR_DEFECTO = 20;
const LIMITE_MAXIMO = 100;

/**
 * Normaliza los parametros de paginacion recibidos por query string.
 * @param {{pagina?: any, limite?: any}} consulta
 * @returns {{pagina:number, limite:number, desplazamiento:number}}
 */
function normalizarPaginacion(consulta = {}) {
  let pagina = parseInt(consulta.pagina, 10);
  let limite = parseInt(consulta.limite, 10);

  if (!Number.isFinite(pagina) || pagina < 1) pagina = 1;
  if (!Number.isFinite(limite) || limite < 1) limite = LIMITE_POR_DEFECTO;
  if (limite > LIMITE_MAXIMO) limite = LIMITE_MAXIMO;

  return { pagina, limite, desplazamiento: (pagina - 1) * limite };
}

/**
 * Valida que la columna de ordenamiento exista en la lista blanca.
 * Sin esto, `ORDER BY ${usuario}` seria un agujero de inyeccion SQL.
 *
 * @param {string} columnaSolicitada
 * @param {string[]} columnasPermitidas
 * @param {string} columnaPorDefecto
 * @returns {string}
 */
function validarOrdenamiento(columnaSolicitada, columnasPermitidas, columnaPorDefecto) {
  if (!columnaSolicitada) return columnaPorDefecto;
  if (!columnasPermitidas.includes(columnaSolicitada)) {
    throw AppError.solicitudInvalida(
      `Columna de ordenamiento no permitida. Valores validos: ${columnasPermitidas.join(', ')}.`
    );
  }
  return columnaSolicitada;
}

/**
 * Valida la direccion de ordenamiento.
 * @param {string} direccion
 * @returns {'ASC'|'DESC'}
 */
function validarDireccion(direccion) {
  const valor = (direccion || '').toUpperCase();
  return valor === 'ASC' ? 'ASC' : 'DESC';
}

/**
 * Escapa los comodines de LIKE/ILIKE para que un usuario que escribe "%"
 * no convierta su busqueda en un escaneo completo de la tabla.
 * @param {string} texto
 * @returns {string}
 */
function escaparComodines(texto) {
  return String(texto).replace(/[\\%_]/g, (caracter) => `\\${caracter}`);
}

module.exports = {
  LIMITE_POR_DEFECTO,
  LIMITE_MAXIMO,
  normalizarPaginacion,
  validarOrdenamiento,
  validarDireccion,
  escaparComodines,
};
