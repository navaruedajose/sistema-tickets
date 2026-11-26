'use strict';

/**
 * Middleware de validacion basado en esquemas Zod.
 *
 * Ventaja de diseno: los controladores reciben datos YA validados y
 * normalizados, por lo que nunca contienen `if (!campo) ...`. La validacion
 * vive junto al esquema y el controlador solo orquesta.
 *
 * @param {object} esquemas
 * @param {import('zod').ZodTypeAny} [esquemas.body]
 * @param {import('zod').ZodTypeAny} [esquemas.query]
 * @param {import('zod').ZodTypeAny} [esquemas.params]
 */
function validar(esquemas) {
  return function middlewareValidacion(peticion, respuesta, siguiente) {
    const errores = [];

    for (const ubicacion of ['params', 'query', 'body']) {
      const esquema = esquemas[ubicacion];
      if (!esquema) continue;

      const resultado = esquema.safeParse(peticion[ubicacion]);

      if (!resultado.success) {
        for (const problema of resultado.error.issues) {
          errores.push({
            campo: [ubicacion, ...problema.path].join('.'),
            mensaje: problema.message,
          });
        }
      } else {
        // Se sobreescribe con el valor tipado y saneado que devuelve Zod.
        // Nota: en Express 4 `req.query` es un getter, por eso se asigna a
        // una propiedad propia para poder reemplazarlo.
        Object.defineProperty(peticion, ubicacion, {
          value: resultado.data,
          writable: true,
          configurable: true,
          enumerable: true,
        });
      }
    }

    if (errores.length > 0) {
      const error = require('../core/errors/AppError').solicitudInvalida(
        'Los datos enviados no cumplen con el formato esperado.',
        errores
      );
      return siguiente(error);
    }

    return siguiente();
  };
}

module.exports = validar;
