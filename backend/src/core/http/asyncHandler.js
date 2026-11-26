'use strict';

/**
 * Envuelve un manejador async para que cualquier rechazo de promesa llegue
 * al middleware de errores de Express.
 *
 * Sin esto, cada controlador necesitaria su propio try/catch, lo que
 * violaria DRY y seria una fuente constante de "unhandled rejection".
 *
 * @param {Function} manejador
 * @returns {import('express').RequestHandler}
 */
function asyncHandler(manejador) {
  return function envoltorio(peticion, respuesta, siguiente) {
    Promise.resolve(manejador(peticion, respuesta, siguiente)).catch(siguiente);
  };
}

module.exports = asyncHandler;
