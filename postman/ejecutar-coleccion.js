#!/usr/bin/env node
'use strict';

/**
 * Ejecutor de la colección de Postman, carpeta por carpeta.
 *
 * ---------------------------------------------------------------------
 * POR QUE NO BASTA CON `newman run coleccion.json`
 * ---------------------------------------------------------------------
 * Los scripts de prueba guardan los identificadores que producen (idTicket,
 * idComentario, idAdjunto, tokens) en variables de COLECCION. Si se ejecuta
 * cada carpeta en un proceso distinto, esas variables se pierden y las
 * carpetas siguientes fallan con "idTicket no definido".
 *
 * Este script conserva el objeto de la coleccion entre ejecuciones y se lo
 * pasa a la siguiente, de modo que el encadenamiento sobrevive aunque cada
 * carpeta se ejecute por separado. Eso permite cumplir literalmente lo que
 * se pide: correr una por una y que todas salgan bien.
 *
 * ---------------------------------------------------------------------
 * USO
 * ---------------------------------------------------------------------
 *   node ejecutar-coleccion.js                 # entorno local
 *   node ejecutar-coleccion.js --nube          # entorno Render/Railway
 *   node ejecutar-coleccion.js --folder "03 - Tickets (CRUD)"
 *   node ejecutar-coleccion.js --continuar     # no se detiene en el fallo
 */

const fs = require('fs');
const path = require('path');
const newman = require('newman');

const RUTA_COLECCION = path.join(__dirname, 'Sistema-Tickets.postman_collection.json');
const ENTORNOS = {
  local: path.join(__dirname, 'Sistema-Tickets-Local.postman_environment.json'),
  nube: path.join(__dirname, 'Sistema-Tickets-Nube.postman_environment.json'),
};

// ---------------------------------------------------------------------
// Argumentos
// ---------------------------------------------------------------------
const argumentos = process.argv.slice(2);
const opciones = { entorno: 'local', carpeta: null, detenerEnFallo: true };

for (let i = 0; i < argumentos.length; i += 1) {
  const actual = argumentos[i];
  if (actual === '--nube') opciones.entorno = 'nube';
  else if (actual === '--local') opciones.entorno = 'local';
  else if (actual === '--continuar') opciones.detenerEnFallo = false;
  else if (actual === '--folder') opciones.carpeta = argumentos[(i += 1)];
  else if (actual === '--ayuda' || actual === '-h') {
    console.log(
      [
        'Uso: node ejecutar-coleccion.js [opciones]',
        '',
        '  --nube            usa el entorno de la nube (Render/Railway)',
        '  --local           usa el entorno local (por defecto)',
        '  --folder "..."    ejecuta solo una carpeta',
        '  --continuar       no se detiene en el primer fallo',
      ].join('\n')
    );
    process.exit(0);
  }
}

// ---------------------------------------------------------------------
// Utilidades
// ---------------------------------------------------------------------
function leerJson(ruta) {
  return JSON.parse(fs.readFileSync(ruta, 'utf8'));
}

/**
 * Las dos peticiones de carga de archivos se guardan en la coleccion sin
 * archivo (`src: []`), porque en Postman se elige a mano. Ejecutadas desde
 * consola eso las hace fallar siempre.
 *
 * Aqui se inyectan dos archivos de prueba antes de ejecutar:
 *   - un PNG valido de 1x1, para la subida que debe funcionar;
 *   - un .exe de pocos bytes, para la subida que debe ser rechazada.
 *
 * La coleccion del repositorio no se modifica: el cambio vive solo en
 * memoria durante esta ejecucion, asi que en Postman se sigue eligiendo el
 * archivo manualmente.
 */
const ARCHIVOS_DE_PRUEBA = {
  'Subir evidencia (multipart/form-data)': path.join(__dirname, 'fixtures', 'evidencia.png'),
  'Subir archivo de tipo no permitido (debe fallar)': path.join(
    __dirname,
    'fixtures',
    'archivo-no-permitido.exe'
  ),
};

function inyectarArchivosDePrueba(coleccion) {
  const recorrer = (elementos) => {
    elementos.forEach((elemento) => {
      if (Array.isArray(elemento.item)) {
        recorrer(elemento.item);
        return;
      }

      const archivo = ARCHIVOS_DE_PRUEBA[elemento.name];
      if (!archivo || !fs.existsSync(archivo)) return;

      const campos = elemento.request?.body?.formdata;
      if (!Array.isArray(campos)) return;

      campos.forEach((campo) => {
        if (campo.type === 'file') campo.src = archivo;
      });
    });
  };

  recorrer(coleccion.item);
}

function ejecutarCarpeta({ coleccion, entorno, carpeta }) {
  return new Promise((resolve) => {
    newman.run(
      {
        collection: coleccion,
        environment: entorno,
        folder: carpeta,
        // Se detiene en el primer fallo de la carpeta: si una peticion no
        // produce el id que la siguiente necesita, seguir solo genera ruido.
        bail: true,
        reporters: ['cli'],
        color: true,
      },
      (error, resumen) => resolve({ error, resumen })
    );
  });
}

function linea(caracter = '=') {
  return caracter.repeat(66);
}

// ---------------------------------------------------------------------
// Ejecucion
// ---------------------------------------------------------------------
async function principal() {
  const coleccionInicial = leerJson(RUTA_COLECCION);
  inyectarArchivosDePrueba(coleccionInicial);
  let entornoActual = leerJson(ENTORNOS[opciones.entorno]);

  const carpetas = coleccionInicial.item
    .filter((elemento) => Array.isArray(elemento.item))
    .map((elemento) => elemento.name);

  const aEjecutar = opciones.carpeta
    ? carpetas.filter((nombre) => nombre === opciones.carpeta)
    : carpetas;

  if (aEjecutar.length === 0) {
    console.error(`No existe la carpeta "${opciones.carpeta}".`);
    console.error('Carpetas disponibles:');
    carpetas.forEach((nombre) => console.error(`  - ${nombre}`));
    process.exit(2);
  }

  console.log(linea());
  console.log('  COLECCION POSTMAN — SISTEMA DE TICKETS');
  console.log(linea());
  console.log(`  Entorno:  ${opciones.entorno}`);
  console.log(`  URL base: ${(entornoActual.values || []).find((v) => v.key === 'urlBase')?.value}`);
  console.log(`  Carpetas: ${aEjecutar.length}`);
  console.log(linea());
  console.log('');

  let coleccionActual = coleccionInicial;
  const resultados = [];
  let detenido = false;

  for (const [indice, carpeta] of aEjecutar.entries()) {
    console.log('');
    console.log(linea('-'));
    console.log(`  [${indice + 1}/${aEjecutar.length}] ${carpeta}`);
    console.log(linea('-'));
    console.log('');

    const { error, resumen } = await ejecutarCarpeta({
      coleccion: coleccionActual,
      entorno: entornoActual,
      carpeta,
    });

    if (error) {
      resultados.push({ carpeta, estado: 'ERROR', peticiones: 0, fallos: 1 });
      console.error(`  Error al ejecutar la carpeta: ${error.message}`);
      detenido = true;
      break;
    }

    // Se conserva el estado (variables de coleccion y de entorno) para la
    // siguiente carpeta. Sin esto, el encadenamiento se rompe.
    coleccionActual = resumen.collection || coleccionActual;
    entornoActual = resumen.environment || entornoActual;

    const fallos = resumen.run.failures || [];
    const peticiones = resumen.run.stats.requests.total || 0;
    const aserciones = resumen.run.stats.assertions || { total: 0, failed: 0 };

    resultados.push({
      carpeta,
      estado: fallos.length === 0 ? 'OK' : 'FALLO',
      peticiones,
      fallos: fallos.length,
      aserciones,
    });

    if (fallos.length > 0) {
      console.log('');
      console.log(`  ${fallos.length} fallo(s) en esta carpeta:`);
      fallos.slice(0, 5).forEach((fallo) => {
        const nombre = fallo.source?.name || '(sin nombre)';
        const mensaje = fallo.error?.test || fallo.error?.message || 'sin detalle';
        console.log(`    - ${nombre}: ${mensaje}`);
      });
      if (fallos.length > 5) console.log(`    ... y ${fallos.length - 5} mas`);

      if (opciones.detenerEnFallo) {
        detenido = true;
        break;
      }
    }
  }

  // -------------------------------------------------------------------
  // Resumen final
  // -------------------------------------------------------------------
  console.log('');
  console.log(linea());
  console.log('  RESUMEN');
  console.log(linea());

  const ancho = Math.max(...resultados.map((r) => r.carpeta.length), 20);
  resultados.forEach((r) => {
    const marca = r.estado === 'OK' ? 'OK   ' : r.estado === 'FALLO' ? 'FALLO' : 'ERROR';
    const detalle =
      r.estado === 'OK'
        ? `${r.peticiones} peticiones, ${r.aserciones.total} aserciones`
        : `${r.fallos} fallo(s)`;
    console.log(`  ${marca}  ${r.carpeta.padEnd(ancho)}  ${detalle}`);
  });

  const totalPeticiones = resultados.reduce((suma, r) => suma + r.peticiones, 0);
  const totalFallos = resultados.reduce((suma, r) => suma + r.fallos, 0);
  const carpetasOk = resultados.filter((r) => r.estado === 'OK').length;

  console.log(linea('-'));
  console.log(`  Carpetas correctas: ${carpetasOk} de ${resultados.length}`);
  console.log(`  Peticiones ejecutadas: ${totalPeticiones}`);
  console.log(`  Fallos: ${totalFallos}`);
  if (detenido && resultados.length < aEjecutar.length) {
    console.log('  (ejecucion detenida en el primer fallo)');
  }
  console.log(linea());

  if (totalFallos === 0 && carpetasOk === aEjecutar.length) {
    console.log('');
    console.log('  TODAS LAS CARPETAS PASARON');
    console.log('');
    process.exit(0);
  }

  console.log('');
  console.log('  HAY FALLOS: revise el detalle de arriba.');
  console.log('');
  process.exit(1);
}

principal().catch((error) => {
  console.error('Error inesperado:', error);
  process.exit(3);
});
