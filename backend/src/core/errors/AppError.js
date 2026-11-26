'use strict';

/**
 * Error de aplicacion.
 *
 * Diferencia entre errores OPERACIONALES (culpa del usuario: 400, 404, 409)
 * y errores de PROGRAMACION (bug nuestro: 500). Solo los operacionales
 * exponen su mensaje al cliente; los otros se registran y se responde algo
 * generico para no filtrar detalles internos.
 */
class AppError extends Error {
  /**
   * @param {string} mensaje  Texto apto para el usuario final (en espanol).
   * @param {number} estadoHttp Codigo HTTP a devolver.
   * @param {object} [opciones]
   * @param {string} [opciones.codigo] Identificador estable para el frontend.
   * @param {Array}  [opciones.detalles] Lista de errores de validacion.
   * @param {boolean}[opciones.esOperacional] false = bug interno.
   */
  constructor(mensaje, estadoHttp = 500, opciones = {}) {
    super(mensaje);
    this.name = 'AppError';
    this.estadoHttp = estadoHttp;
    this.codigo = opciones.codigo || 'ERROR_INTERNO';
    this.detalles = opciones.detalles || null;
    this.esOperacional = opciones.esOperacional !== false;
    Error.captureStackTrace(this, this.constructor);
  }

  // --- Constructores semanticos: el codigo se lee como prosa ---

  static solicitudInvalida(mensaje = 'La solicitud contiene datos invalidos.', detalles = null) {
    return new AppError(mensaje, 400, { codigo: 'SOLICITUD_INVALIDA', detalles });
  }

  static noAutenticado(mensaje = 'Credenciales ausentes o invalidas.') {
    return new AppError(mensaje, 401, { codigo: 'NO_AUTENTICADO' });
  }

  static prohibido(mensaje = 'No tiene permisos para realizar esta accion.') {
    return new AppError(mensaje, 403, { codigo: 'PROHIBIDO' });
  }

  static noEncontrado(recurso = 'El recurso solicitado') {
    return new AppError(`${recurso} no fue encontrado.`, 404, { codigo: 'NO_ENCONTRADO' });
  }

  static conflicto(mensaje = 'La operacion entra en conflicto con el estado actual.') {
    return new AppError(mensaje, 409, { codigo: 'CONFLICTO' });
  }

  static archivoInvalido(mensaje = 'El archivo adjunto no es valido.') {
    return new AppError(mensaje, 422, { codigo: 'ARCHIVO_INVALIDO' });
  }

  /**
   * 413 Payload Too Large.
   * Se distingue de `solicitudInvalida` (400) porque aqui la peticion es
   * correcta: lo unico que falla es el tamano del archivo. Devolver el codigo
   * preciso permite que el cliente reaccione de forma distinta (por ejemplo,
   * comprimir la imagen en lugar de mostrar un error generico).
   */
  static archivoDemasiadoGrande(mensaje = 'El archivo excede el tamano maximo permitido.') {
    return new AppError(mensaje, 413, { codigo: 'ARCHIVO_DEMASIADO_GRANDE' });
  }

  static demasiadasPeticiones(mensaje = 'Demasiadas solicitudes. Intente mas tarde.') {
    return new AppError(mensaje, 429, { codigo: 'DEMASIADAS_PETICIONES' });
  }

  /**
   * 503 Service Unavailable.
   *
   * Se usa cuando una dependencia externa (PostgreSQL, un proveedor de
   * notificaciones) esta caida o inaccesible. NO es un bug del codigo: la
   * peticion era correcta y volvera a funcionar cuando la dependencia se
   * recupere.
   *
   * Distinguirlo del 500 importa por tres razones:
   *   1. Un balanceador o proxy PUEDE reintentar un 503; un 500 lo trata
   *      como un defecto de la aplicacion.
   *   2. El monitoreo no se llena de falsos "bugs" cada vez que la base de
   *      datos se reinicia por mantenimiento.
   *   3. El cliente entiende que el fallo es temporal y puede ofrecer
   *      "reintentar" en lugar de un error definitivo.
   */
  static servicioNoDisponible(
    mensaje = 'El servicio no esta disponible temporalmente. Intente de nuevo en unos segundos.'
  ) {
    return new AppError(mensaje, 503, { codigo: 'SERVICIO_NO_DISPONIBLE' });
  }

  static interno(mensaje = 'Ocurrio un error interno. El equipo tecnico fue notificado.') {
    return new AppError(mensaje, 500, { codigo: 'ERROR_INTERNO', esOperacional: false });
  }
}

module.exports = AppError;
