'use strict';

/**
 * Pruebas unitarias de la traduccion central de errores.
 *
 * `normalizarError` es una funcion pura: recibe cualquier error de terceros
 * (pg, zod, jsonwebtoken, multer, express) y devuelve un AppError con el
 * codigo HTTP correcto, o `null` si no lo reconoce.
 *
 * Probarla aqui tiene una ventaja concreta: el caso "la base de datos esta
 * caida" es el mas dificil de reproducir en una prueba de integracion (habria
 * que detener el contenedor de PostgreSQL). Con una funcion pura basta con
 * fabricar el objeto de error que produce el driver.
 *
 * Ejecutar:  npm test
 */

const { normalizarError } = require('../../src/middlewares/error.middleware');
const AppError = require('../../src/core/errors/AppError');

/** Fabrica un error con la forma que produce el driver `pg` o Node. */
function errorConCodigo(codigo, mensaje = 'fallo simulado') {
  const error = new Error(mensaje);
  error.code = codigo;
  return error;
}

describe('normalizarError: indisponibilidad de infraestructura', () => {
  // Estos son los codigos que aparecen cuando el contenedor de PostgreSQL se
  // detiene. El caso real que los origino fue `getaddrinfo ENOTFOUND postgres`
  // al hacer `docker compose stop postgres`.
  const codigosDeRed = ['ECONNREFUSED', 'ENOTFOUND', 'ETIMEDOUT', 'EHOSTUNREACH', 'ECONNRESET', 'EPIPE'];

  test.each(codigosDeRed)('el codigo de red %s se traduce a 503, no a 500', (codigo) => {
    const resultado = normalizarError(errorConCodigo(codigo));

    expect(resultado).toBeInstanceOf(AppError);
    expect(resultado.estadoHttp).toBe(503);
    expect(resultado.codigo).toBe('SERVICIO_NO_DISPONIBLE');
  });

  // Codigos que reporta el propio PostgreSQL cuando deja de atender.
  const codigosPg = ['08000', '08001', '08003', '08004', '08006', '08007', '53300', '57P01', '57P02', '57P03'];

  test.each(codigosPg)('el codigo de PostgreSQL %s se traduce a 503', (codigo) => {
    const resultado = normalizarError(errorConCodigo(codigo));

    expect(resultado.estadoHttp).toBe(503);
    expect(resultado.codigo).toBe('SERVICIO_NO_DISPONIBLE');
  });

  test('el error real de "contenedor detenido" se reconoce', () => {
    // Texto literal que produjo el driver al hacer `docker compose stop postgres`.
    const resultado = normalizarError(
      errorConCodigo('57P01', 'terminating connection due to administrator command')
    );

    expect(resultado.estadoHttp).toBe(503);
  });

  test('un 503 es un error OPERACIONAL: su mensaje si llega al cliente', () => {
    // A diferencia de un 500 (bug interno), aqui el usuario recibe un mensaje
    // util en lugar de un texto generico.
    const resultado = normalizarError(errorConCodigo('ECONNREFUSED'));

    expect(resultado.esOperacional).toBe(true);
    expect(resultado.message).toMatch(/base de datos/i);
  });
});

describe('normalizarError: errores que NO deben ser 503', () => {
  test('una violacion de unicidad sigue siendo 409 (culpa de los datos)', () => {
    const resultado = normalizarError(errorConCodigo('23505'));

    expect(resultado.estadoHttp).toBe(409);
    expect(resultado.codigo).toBe('CONFLICTO');
  });

  test('un UUID malformado sigue siendo 400', () => {
    const resultado = normalizarError(errorConCodigo('22P02'));

    expect(resultado.estadoHttp).toBe(400);
    expect(resultado.codigo).toBe('SOLICITUD_INVALIDA');
  });

  test('un error de validacion de Zod se traduce a 400 con el detalle por campo', () => {
    const errorZod = new Error('datos invalidos');
    errorZod.name = 'ZodError';
    errorZod.issues = [{ path: ['titulo'], message: 'El titulo es obligatorio' }];

    const resultado = normalizarError(errorZod);

    expect(resultado.estadoHttp).toBe(400);
    expect(resultado.detalles).toEqual([{ campo: 'titulo', mensaje: 'El titulo es obligatorio' }]);
  });

  test('un error desconocido devuelve null (lo maneja la rama de 500)', () => {
    expect(normalizarError(new Error('algo raro'))).toBeNull();
  });

  test('un AppError ya construido se devuelve tal cual, sin re-envolverse', () => {
    const original = AppError.noEncontrado('El ticket');

    expect(normalizarError(original)).toBe(original);
  });
});
