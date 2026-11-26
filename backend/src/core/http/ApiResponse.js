'use strict';

/**
 * Contrato unico de respuesta de la API.
 *
 * Todos los endpoints devuelven la MISMA forma, de modo que el frontend
 * escribe un solo interceptor y no adivina la estructura por endpoint.
 *
 *   { exito: true,  datos: <...>, mensaje?: string, meta?: object }
 *   { exito: false, mensaje: string, codigo: string, detalles?: array }
 */
class ApiResponse {
  /** Respuesta exitosa generica. */
  static ok(respuesta, datos, mensaje = null, meta = null) {
    const cuerpo = { exito: true, datos };
    if (mensaje) cuerpo.mensaje = mensaje;
    if (meta) cuerpo.meta = meta;
    return respuesta.status(200).json(cuerpo);
  }

  /** 201 para creaciones. */
  static creado(respuesta, datos, mensaje = 'Recurso creado correctamente.') {
    return respuesta.status(201).json({ exito: true, datos, mensaje });
  }

  /** 204 para eliminaciones. */
  static sinContenido(respuesta) {
    return respuesta.status(204).send();
  }

  /**
   * Respuesta paginada estandar.
   * @param {object} respuesta
   * @param {Array} elementos
   * @param {{pagina:number, limite:number, total:number}} paginacion
   */
  static paginado(respuesta, elementos, paginacion) {
    const { pagina, limite, total } = paginacion;
    return respuesta.status(200).json({
      exito: true,
      datos: elementos,
      meta: {
        paginacion: {
          pagina,
          limite,
          total,
          totalPaginas: limite > 0 ? Math.ceil(total / limite) : 0,
          tieneSiguiente: pagina * limite < total,
          tieneAnterior: pagina > 1,
        },
      },
    });
  }

  /** Forma estandar de error (usada por el middleware de errores). */
  static error(respuesta, estadoHttp, mensaje, codigo = 'ERROR', detalles = null) {
    const cuerpo = { exito: false, mensaje, codigo };
    if (detalles) cuerpo.detalles = detalles;
    return respuesta.status(estadoHttp).json(cuerpo);
  }
}

module.exports = ApiResponse;
