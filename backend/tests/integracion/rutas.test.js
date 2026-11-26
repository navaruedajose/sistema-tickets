'use strict';

/**
 * Pruebas de integracion de la capa HTTP.
 *
 * Se usa supertest contra la aplicacion Express SIN levantar un puerto real.
 * Estas pruebas verifican que el cableado (contenedor -> routers -> app)
 * funciona: que las rutas existen, que los middlewares se ejecutan en el
 * orden correcto y que el formato de respuesta es el contrato publicado.
 *
 * No requieren PostgreSQL porque ninguna de estas rutas consulta la base de
 * datos (el endpoint de salud si lo hace, por eso no se prueba aqui).
 */

const request = require('supertest');
const { construirContenedor } = require('../../src/core/container');
const crearAplicacion = require('../../src/app');

let app;

beforeAll(() => {
  // El contenedor se construye con la configuracion real, pero como ninguna
  // prueba toca la base de datos, no se abre ninguna conexion.
  app = crearAplicacion(construirContenedor());
});

describe('Indice de la API', () => {
  test('GET /api/v1 devuelve el catalogo de modulos y endpoints', async () => {
    const respuesta = await request(app).get('/api/v1').expect(200);

    expect(respuesta.body.exito).toBe(true);
    expect(respuesta.body.datos.version).toBe('v1');
    expect(respuesta.body.datos.modulos).toHaveProperty('autenticacion');
    expect(respuesta.body.datos.modulos).toHaveProperty('tickets');
    expect(respuesta.body.datos.modulos).toHaveProperty('reportes');
  });

  test('GET / responde con la informacion basica del servicio', async () => {
    const respuesta = await request(app).get('/').expect(200);
    expect(respuesta.body.datos.salud).toBe('/api/v1/salud');
  });

  test('GET /api/v1/vivo confirma que el proceso responde (sin tocar la BD)', async () => {
    const respuesta = await request(app).get('/api/v1/vivo').expect(200);
    expect(respuesta.body.vivo).toBe(true);
  });
});

describe('Contrato de rutas protegidas', () => {
  test('GET /api/v1/tickets sin token responde 401 con el formato de error estandar', async () => {
    const respuesta = await request(app).get('/api/v1/tickets').expect(401);

    expect(respuesta.body).toMatchObject({
      exito: false,
      codigo: 'NO_AUTENTICADO',
    });
    expect(typeof respuesta.body.mensaje).toBe('string');
  });

  test('un token malformado tambien responde 401 y no 500', async () => {
    const respuesta = await request(app)
      .get('/api/v1/tickets')
      .set('Authorization', 'Bearer esto.no.es.un.jwt')
      .expect(401);

    expect(respuesta.body.codigo).toBe('NO_AUTENTICADO');
  });

  test('el esquema de autenticacion exige el prefijo Bearer', async () => {
    const respuesta = await request(app)
      .get('/api/v1/tickets')
      .set('Authorization', 'token-sin-prefijo')
      .expect(401);

    expect(respuesta.body.mensaje).toMatch(/Bearer/i);
  });

  test('GET /api/v1/reportes/tickets sin token responde 401', async () => {
    await request(app).get('/api/v1/reportes/tickets?formato=pdf').expect(401);
  });

  test('POST /api/v1/auth/iniciar-sesion con cuerpo invalido responde 400 con detalles', async () => {
    const respuesta = await request(app)
      .post('/api/v1/auth/iniciar-sesion')
      .send({ correo: 'no-es-un-correo', contrasena: '' })
      .expect(400);

    expect(respuesta.body.exito).toBe(false);
    expect(respuesta.body.codigo).toBe('SOLICITUD_INVALIDA');
    expect(Array.isArray(respuesta.body.detalles)).toBe(true);
    expect(respuesta.body.detalles.length).toBeGreaterThan(0);
  });
});

describe('Manejo de rutas inexistentes', () => {
  test('una ruta desconocida responde 404 con formato uniforme', async () => {
    const respuesta = await request(app).get('/api/v1/ruta-que-no-existe').expect(404);

    expect(respuesta.body).toMatchObject({
      exito: false,
      codigo: 'RUTA_NO_ENCONTRADA',
    });
  });
});

describe('Cabeceras de seguridad', () => {
  test('se elimina la cabecera X-Powered-By', async () => {
    const respuesta = await request(app).get('/api/v1/vivo');
    expect(respuesta.headers['x-powered-by']).toBeUndefined();
  });

  test('se aplican cabeceras de helmet', async () => {
    const respuesta = await request(app).get('/api/v1/vivo');
    expect(respuesta.headers['x-content-type-options']).toBe('nosniff');
    expect(respuesta.headers['x-frame-options']).toBeDefined();
  });
});
