'use strict';

/**
 * Limpieza de los datos generados por las pruebas de carga.
 *
 * Ejecucion:
 *   docker compose exec backend npm run db:limpiar-pruebas
 *   (o)  npm run db:limpiar-pruebas
 *
 * POR QUE HACE FALTA ESTE SCRIPT
 * La prueba de carga de k6 (y tambien la de humo) crean tickets DE VERDAD
 * en la base de datos. Una sola ejecucion del escenario `tasa` puede dejar
 * cientos de tickets titulados "La impresora del piso 3 no responde [#4821]".
 * Eso ensucia la demostracion: los reportes y el panel quedan llenos de
 * ruido y ya no se ve el conjunto de datos realista del semillero.
 *
 * Este script borra UNICAMENTE esos tickets, identificados por el patron de
 * titulo que generan los scripts de k6, y deja intactos los del semillero
 * y los que haya creado una persona a mano.
 *
 * Las claves foraneas de comentarios, adjuntos, historial y notificaciones
 * tienen ON DELETE CASCADE, asi que basta con borrar el ticket.
 *
 * NOTA: los ARCHIVOS de las evidencias quedan en el volumen de subidas.
 * Borrar filas de la base no borra ficheros del disco; para dejarlo todo
 * impoluto, la opcion radical es recrear los volumenes:
 *     docker compose down -v   &&   INICIAR.bat
 */

const db = require('../src/config/database');
const logger = require('../src/utils/logger');

/**
 * Patrones de titulo que identifican datos de prueba.
 * Se mantienen en un solo lugar para que anadir un script de k6 nuevo
 * solo requiera anadir su patron aqui.
 */
const PATRONES = [
  // load-test.js: "<titulo> [#1234]"
  { descripcion: 'Prueba de carga (load-test.js)', patron: '%[#%]' },
  // smoke-test.js: "Prueba de humo k6 - 1760000000000"
  { descripcion: 'Prueba de humo (smoke-test.js)', patron: 'Prueba de humo k6 - %' },
  // verificar-api.js: deja un ticket de transiciones (ya borrado logicamente)
  {
    descripcion: 'Verificacion de API (verificar-api.js)',
    patron: 'Verificacion automatica de transiciones',
  },
];

/** Cuenta cuantos tickets coinciden con cada patron. */
async function contar(patron) {
  const { rows } = await db.consultar(
    `SELECT COUNT(*)::INTEGER AS total
       FROM tickets
      WHERE titulo LIKE $1`,
    [patron]
  );
  return rows[0].total;
}

/** Borra los tickets que coinciden con un patron. Devuelve cuantos borro. */
async function borrar(patron) {
  const { rowCount } = await db.consultar(
    `DELETE FROM tickets
      WHERE titulo LIKE $1`,
    [patron]
  );
  return rowCount;
}

async function limpiar() {
  console.log('\n============================================================');
  console.log(' LIMPIEZA DE DATOS DE PRUEBA');
  console.log('============================================================\n');

  // --- 1. Informe previo: que se va a borrar ---
  let total = 0;
  const pendientes = [];

  for (const { descripcion, patron } of PATRONES) {
    const cantidad = await contar(patron);
    pendientes.push({ descripcion, patron, cantidad });
    total += cantidad;
  }

  for (const { descripcion, cantidad } of pendientes) {
    console.log(` ${descripcion}: ${cantidad} ticket(s)`);
  }

  if (total === 0) {
    console.log('\n No hay nada que limpiar. La base de datos ya esta limpia.');
    console.log('============================================================\n');
    return;
  }

  console.log(`\n Total a borrar: ${total} ticket(s)`);
  console.log(' (los comentarios, adjuntos, historial y notificaciones asociados');
  console.log('  se borran en cascada por las claves foraneas)\n');

  // --- 2. Borrado ---
  let borrados = 0;
  for (const { descripcion, patron } of pendientes) {
    const cantidad = await borrar(patron);
    borrados += cantidad;
    logger.info('Tickets de prueba eliminados', { descripcion, cantidad });
  }

  // --- 3. Informe final ---
  const { rows } = await db.consultar(
    `SELECT COUNT(*)::INTEGER AS total
       FROM tickets
      WHERE eliminado_en IS NULL`
  );

  console.log('\n============================================================');
  console.log(` Eliminados:            ${borrados}`);
  console.log(` Tickets que quedan:    ${rows[0].total}`);
  console.log('============================================================');
  console.log('\n NOTA: los archivos de las evidencias siguen en el volumen');
  console.log(' de subidas. Para dejar tambien el disco impoluto:');
  console.log('     docker compose down -v   &&   INICIAR.bat\n');
}

limpiar()
  .then(async () => {
    await db.cerrar();
    process.exit(0);
  })
  .catch(async (error) => {
    logger.error('Error al limpiar los datos de prueba', {
      mensaje: error.message,
      pila: error.stack,
    });
    await db.cerrar().catch(() => undefined);
    process.exit(1);
  });
