'use strict';

/**
 * Registro de eventos (logger) minimalista.
 *
 * Se implementa a mano en lugar de traer una dependencia como winston/pino
 * porque el requisito es KISS: una linea JSON por evento es suficiente para
 * que `docker compose logs` y cualquier colector de logs la entiendan.
 */

const niveles = { error: 50, advertencia: 40, info: 30, depuracion: 20 };
const nivelActual = niveles[process.env.LOG_NIVEL] || (process.env.NODE_ENV === 'production' ? niveles.info : niveles.depuracion);

function escribir(nivel, mensaje, contexto = {}) {
  if (niveles[nivel] < nivelActual) return;

  const evento = {
    marca: new Date().toISOString(),
    nivel,
    mensaje,
    ...contexto,
  };

  const linea = JSON.stringify(evento);
  if (nivel === 'error') {
    process.stderr.write(`${linea}\n`);
  } else {
    process.stdout.write(`${linea}\n`);
  }
}

const logger = {
  error: (mensaje, contexto) => escribir('error', mensaje, contexto),
  advertencia: (mensaje, contexto) => escribir('advertencia', mensaje, contexto),
  info: (mensaje, contexto) => escribir('info', mensaje, contexto),
  depuracion: (mensaje, contexto) => escribir('depuracion', mensaje, contexto),

  /** Logger de peticiones HTTP legible en consola. */
  peticion: (peticion, respuesta, duracionMs) => {
    escribir('info', 'peticion_http', {
      metodo: peticion.method,
      ruta: peticion.originalUrl,
      estado: respuesta.statusCode,
      duracionMs,
      ip: peticion.ip,
    });
  },
};

module.exports = logger;
