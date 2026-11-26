'use strict';

/**
 * Manejo centralizado de errores.
 *
 * Todos los errores de la aplicacion terminan aqui. Esto es lo que permite
 * que los controladores sean limpios (sin try/catch repetidos) y que la
 * forma de la respuesta de error sea consistente en toda la API.
 */

const config = require('../config/env');
const AppError = require('../core/errors/AppError');
const ApiResponse = require('../core/http/ApiResponse');
const logger = require('../utils/logger');

/** 404 para cualquier ruta no registrada. */
function noEncontrado(peticion, respuesta, siguiente) {
  siguiente(new AppError(`La ruta ${peticion.method} ${peticion.originalUrl} no existe en esta API.`, 404, {
    codigo: 'RUTA_NO_ENCONTRADA',
  }));
}

/**
 * Traduce errores conocidos (Zod, PostgreSQL, JWT, multer) a AppError.
 * @param {any} error
 * @returns {AppError}
 */
function normalizarError(error) {
  if (error instanceof AppError) return error;

  // --- Errores de validacion de Zod ---
  if (error.name === 'ZodError' && Array.isArray(error.issues)) {
    return AppError.solicitudInvalida(
      'Los datos enviados no cumplen con el formato esperado.',
      error.issues.map((problema) => ({
        campo: problema.path.join('.'),
        mensaje: problema.message,
      }))
    );
  }

  // --- Fallos de red hacia PostgreSQL ---
  //
  // Cuando el contenedor de la base de datos se detiene, el error que llega
  // no es una consulta fallida: es la imposibilidad de CONECTAR. Los codigos
  // de Node son de red, no de SQL. Se traducen a 503 (no a 500) porque el
  // fallo es de infraestructura y es temporal.
  const CODIGOS_DE_RED = ['ECONNREFUSED', 'ENOTFOUND', 'ETIMEDOUT', 'EHOSTUNREACH', 'ECONNRESET', 'EPIPE'];

  if (CODIGOS_DE_RED.includes(error.code)) {
    return AppError.servicioNoDisponible(
      'No fue posible comunicarse con la base de datos. Intente de nuevo en unos segundos.'
    );
  }

  // --- Indisponibilidad reportada por el propio PostgreSQL ---
  //
  // A diferencia de 23505 o 22P02 (que son culpa de los datos enviados),
  // estos codigos de la clase 08 y 57P significan "el servidor no esta
  // atendiendo": se reinicio, se cayo o alcanzo su limite de conexiones.
  const CODIGOS_PG_INDISPONIBLE = {
    '08000': 'connection_exception',
    '08001': 'sqlclient_unable_to_establish_sqlconnection',
    '08003': 'connection_does_not_exist',
    '08004': 'sqlserver_rejected_establishment_of_sqlconnection',
    '08006': 'connection_failure',
    '08007': 'transaction_resolution_unknown',
    '53300': 'too_many_connections',
    '57P01': 'admin_shutdown',
    '57P02': 'crash_shutdown',
    '57P03': 'cannot_connect_now',
  };

  if (CODIGOS_PG_INDISPONIBLE[error.code]) {
    return AppError.servicioNoDisponible(
      'La base de datos no esta disponible temporalmente. Intente de nuevo en unos segundos.'
    );
  }

  // --- Errores de PostgreSQL ---
  if (error.code && typeof error.code === 'string') {
    switch (error.code) {
      case '23505': // unique_violation
        return AppError.conflicto('Ya existe un registro con esos datos unicos.');
      case '23503': // foreign_key_violation
        return AppError.solicitudInvalida('La referencia indicada no existe (clave foranea invalida).');
      case '23514': // check_violation
        return AppError.solicitudInvalida('Los datos no cumplen una restriccion de la base de datos.');
      case '22P02': // invalid_text_representation (ej. UUID malformado)
        return AppError.solicitudInvalida('El identificador enviado no tiene un formato valido.');
      case '57014': // query_canceled
        return AppError.demasiadasPeticiones('La consulta tardo demasiado y fue cancelada.');
      default:
        break;
    }
  }

  // --- Errores de JWT ---
  if (error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError') {
    return AppError.noAutenticado('El token de acceso no es valido o ha expirado.');
  }

  // --- Errores de sintaxis en el cuerpo JSON ---
  if (error.type === 'entity.parse.failed') {
    return AppError.solicitudInvalida('El cuerpo de la peticion no es un JSON valido.');
  }

  // --- Payload demasiado grande ---
  if (error.type === 'entity.too.large') {
    return AppError.solicitudInvalida('El cuerpo de la peticion es demasiado grande.');
  }

  return null;
}

/**
 * Manejador final de errores de Express.
 * @param {any} error
 * @param {import('express').Request} peticion
 * @param {import('express').Response} respuesta
 * @param {import('express').NextFunction} siguiente
 */
// eslint-disable-next-line no-unused-vars
function manejadorDeErrores(error, peticion, respuesta, siguiente) {
  const errorNormalizado = normalizarError(error);

  if (errorNormalizado && errorNormalizado.esOperacional) {
    // Error esperado (culpa del cliente): se registra como advertencia.
    logger.advertencia('Error operacional', {
      ruta: peticion.originalUrl,
      metodo: peticion.method,
      estado: errorNormalizado.estadoHttp,
      codigo: errorNormalizado.codigo,
      mensaje: errorNormalizado.message,
    });

    return ApiResponse.error(
      respuesta,
      errorNormalizado.estadoHttp,
      errorNormalizado.message,
      errorNormalizado.codigo,
      errorNormalizado.detalles
    );
  }

  // Error no controlado: es un bug. Se registra completo en el servidor pero
  // al cliente solo se le da un mensaje generico (no filtrar stack traces).
  logger.error('Error no controlado', {
    ruta: peticion.originalUrl,
    metodo: peticion.method,
    mensaje: error.message,
    pila: config.esProduccion ? undefined : error.stack,
  });

  return ApiResponse.error(
    respuesta,
    500,
    'Ocurrio un error interno en el servidor. El equipo tecnico ha sido notificado.',
    'ERROR_INTERNO',
    config.esProduccion ? null : [{ campo: 'servidor', mensaje: error.message }]
  );
}

// `normalizarError` se exporta ademas para poder probarlo de forma aislada:
// es una funcion pura (error -> AppError) y concentra toda la traduccion de
// errores de terceros, asi que merece pruebas propias.
module.exports = { noEncontrado, manejadorDeErrores, normalizarError };
