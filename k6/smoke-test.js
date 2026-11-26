/**
 * =====================================================================
 * SISTEMA DE TICKETS - PRUEBA DE HUMO (k6)
 * =====================================================================
 *
 * Verificacion rapida (menos de 30 segundos) de que el sistema esta
 * operativo y que el flujo principal funciona de principio a fin.
 *
 * Se ejecuta ANTES de la prueba de carga: si la prueba de humo falla,
 * no tiene sentido someter el sistema a 200 usuarios concurrentes.
 *
 * ---------------------------------------------------------------------
 * EJECUCION
 * ---------------------------------------------------------------------
 *   k6 run k6/smoke-test.js
 *   k6 run -e URL_BASE=https://mi-servicio.onrender.com/api/v1 k6/smoke-test.js
 *
 * =====================================================================
 */

import http from 'k6/http';
import { check, group, sleep, fail } from 'k6';
import { Trend, Rate, Counter } from 'k6/metrics';

const URL_BASE = (__ENV.URL_BASE || 'http://localhost:4000/api/v1').replace(/\/$/, '');

const CONTRASENA = __ENV.CONTRASENA || 'Demo2026#Tickets';

const duracionTotal = new Trend('flujo_completo_duracion', true);
const pasosExitosos = new Rate('flujo_pasos_exitosos');
const erroresServidor = new Counter('errores_5xx_total');

/**
 * Umbrales (criterios de aceptacion) de la prueba de humo.
 *
 * Se declaran como constante propia porque `options.thresholds` es lo que
 * aplica k6, pero el resumen necesita recorrerlos para mostrar cada uno con
 * su veredicto. El veredicto que se muestra es el de k6, no uno recalculado
 * aparte (ver `evaluarUmbrales`).
 */
const UMBRALES = {
  // En la prueba de humo los umbrales son estrictos: si algo va lento
  // con un solo usuario, con 200 sera un desastre.
  http_req_duration: ['p(95)<1000'],
  http_req_failed: ['rate<0.01'],
  errores_5xx_total: ['count==0'],
  flujo_pasos_exitosos: ['rate==1'],
};

export const options = {
  // Un solo usuario virtual, tres iteraciones. Suficiente para validar.
  vus: 1,
  iterations: 3,

  thresholds: UMBRALES,

  tags: {
    proyecto: 'sistema-tickets',
    prueba: 'humo',
  },
};

/** Inicia sesion y devuelve el token, o aborta con un mensaje util. */
function iniciarSesion(correo) {
  const respuesta = http.post(
    `${URL_BASE}/auth/iniciar-sesion`,
    JSON.stringify({ correo, contrasena: CONTRASENA }),
    { headers: { 'Content-Type': 'application/json' } }
  );

  if (respuesta.status !== 200) {
    fail(
      `No fue posible iniciar sesion como ${correo} (estado ${respuesta.status}).\n` +
        'Compruebe que el backend este levantado y que haya ejecutado "npm run db:seed".'
    );
  }

  return respuesta.json().datos.tokenAcceso;
}

export default function () {
  const inicioFlujo = Date.now();

  // =================================================================
  // PASO 1: El servicio esta disponible
  // =================================================================
  group('1. Salud del servicio', function () {
    const respuesta = http.get(`${URL_BASE}/salud`, { tags: { paso: 'salud' } });

    const correcto = check(respuesta, {
      'el servicio responde (200)': (r) => r.status === 200,
      'la base de datos esta conectada': (r) => {
        try {
          return r.json().datos.baseDatos.conectada === true;
        } catch {
          return false;
        }
      },
      'responde en menos de 1 segundo': (r) => r.timings.duration < 1000,
    });

    pasosExitosos.add(correcto);

    if (respuesta.status >= 500) erroresServidor.add(1);
  });

  // =================================================================
  // PASO 2: Autenticacion
  // =================================================================
  let token;
  group('2. Iniciar sesion', function () {
    const respuesta = http.post(
      `${URL_BASE}/auth/iniciar-sesion`,
      JSON.stringify({ correo: 'agente1@sistema-tickets.local', contrasena: CONTRASENA }),
      { headers: { 'Content-Type': 'application/json' }, tags: { paso: 'login' } }
    );

    const correcto = check(respuesta, {
      'inicio de sesion exitoso (200)': (r) => r.status === 200,
      'devuelve un token de acceso': (r) => {
        try {
          return typeof r.json().datos.tokenAcceso === 'string';
        } catch {
          return false;
        }
      },
      'no expone el hash de la contrasena': (r) => !r.body.includes('contrasena_hash'),
    });

    pasosExitosos.add(correcto);

    if (respuesta.status >= 500) erroresServidor.add(1);

    if (respuesta.status === 200) {
      token = respuesta.json().datos.tokenAcceso;
    }
  });

  if (!token) {
    fail('No se obtuvo el token de acceso. Se aborta el flujo.');
  }

  const encabezados = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
  };

  sleep(1);

  // =================================================================
  // PASO 3: Catalogos
  // =================================================================
  let idCategoria = null;
  group('3. Consultar catalogos', function () {
    const categorias = http.get(`${URL_BASE}/categorias?soloActivas=true`, {
      headers: encabezados,
      tags: { paso: 'categorias' },
    });

    const correcto = check(categorias, {
      'el catalogo de categorias carga (200)': (r) => r.status === 200,
      'el catalogo tiene datos': (r) => {
        try {
          return r.json().datos.length > 0;
        } catch {
          return false;
        }
      },
    });

    pasosExitosos.add(correcto);

    if (categorias.status === 200) {
      const datos = categorias.json().datos;
      if (datos.length > 0) idCategoria = datos[0].id;
    }
  });

  // =================================================================
  // PASO 4: Crear un ticket
  // =================================================================
  let idTicket = null;
  group('4. Crear ticket', function () {
    const cuerpo = {
      titulo: `Prueba de humo k6 - ${Date.now()}`,
      descripcion:
        'Ticket generado automaticamente por la prueba de humo de k6 para verificar que el flujo principal del sistema funciona de principio a fin.',
      prioridad: 'MEDIA',
    };
    if (idCategoria) cuerpo.categoriaId = idCategoria;

    const respuesta = http.post(`${URL_BASE}/tickets`, JSON.stringify(cuerpo), {
      headers: encabezados,
      tags: { paso: 'crear_ticket' },
    });

    const correcto = check(respuesta, {
      'el ticket se crea (201)': (r) => r.status === 201,
      'el folio tiene el formato correcto': (r) => {
        try {
          return /^TK-\d{4}-\d{6}$/.test(r.json().datos.codigo);
        } catch {
          return false;
        }
      },
      'el estado inicial es NUEVO': (r) => {
        try {
          return r.json().datos.estado === 'NUEVO';
        } catch {
          return false;
        }
      },
      'se calculo la fecha limite del SLA': (r) => {
        try {
          return r.json().datos.fecha_limite_sla !== null;
        } catch {
          return false;
        }
      },
    });

    pasosExitosos.add(correcto);

    if (respuesta.status >= 500) erroresServidor.add(1);

    if (respuesta.status === 201) {
      idTicket = respuesta.json().datos.id;
    } else if (respuesta.status === 429) {
      // Diagnostico explicito. Sin esto, el mensaje que se ve es
      // "No se pudo crear el ticket", que no dice nada util.
      fail(
        'LIMITE DE TASA ALCANZADO (429) al crear el ticket.\n' +
          'El limitador global permite ' +
          'RATE_LIMIT_MAX peticiones por RATE_LIMIT_WINDOW_MS.\n' +
          'Es muy probable que haya ejecutado varias veces esta prueba o la\n' +
          'verificacion automatica en los ultimos 15 minutos.\n' +
          '\n' +
          'Solucion: reinicie el backend (los contadores viven en memoria) o\n' +
          'suba el limite en el archivo .env:\n' +
          '    docker compose restart backend\n' +
          '    RATE_LIMIT_MAX=5000   (y luego: docker compose up -d backend)\n'
      );
    }
  });

  if (!idTicket) {
    fail('No se pudo crear el ticket. Se aborta el flujo.');
  }

  sleep(1);

  // =================================================================
  // PASO 5: Consultar el ticket creado
  // =================================================================
  group('5. Consultar el ticket', function () {
    const respuesta = http.get(`${URL_BASE}/tickets/${idTicket}`, {
      headers: encabezados,
      tags: { paso: 'detalle_ticket' },
    });

    const correcto = check(respuesta, {
      'el detalle del ticket carga (200)': (r) => r.status === 200,
      'incluye los contadores de adjuntos': (r) => {
        try {
          return r.json().datos.total_adjuntos === 0;
        } catch {
          return false;
        }
      },
    });

    pasosExitosos.add(correcto);
  });

  // =================================================================
  // PASO 6: Agregar un comentario
  // =================================================================
  group('6. Agregar comentario', function () {
    const respuesta = http.post(
      `${URL_BASE}/tickets/${idTicket}/comentarios`,
      JSON.stringify({
        contenido: 'Comentario de la prueba de humo de k6.',
      }),
      { headers: encabezados, tags: { paso: 'comentario' } }
    );

    const correcto = check(respuesta, {
      'el comentario se publica (201)': (r) => r.status === 201,
    });

    pasosExitosos.add(correcto);
  });

  // =================================================================
  // PASO 7: Flujo de estados (transicion valida)
  // =================================================================
  group('7. Cambiar estado del ticket', function () {
    const respuesta = http.patch(
      `${URL_BASE}/tickets/${idTicket}/estado`,
      JSON.stringify({ estado: 'EN_PROGRESO' }),
      { headers: encabezados, tags: { paso: 'cambiar_estado' } }
    );

    const correcto = check(respuesta, {
      'el estado cambia a EN_PROGRESO (200)': (r) => r.status === 200,
      'el estado se refleja en la respuesta': (r) => {
        try {
          return r.json().datos.estado === 'EN_PROGRESO';
        } catch {
          return false;
        }
      },
    });

    pasosExitosos.add(correcto);
  });

  // =================================================================
  // PASO 8: La maquina de estados rechaza una transicion ilegal
  // =================================================================
  group('8. Verificar la maquina de estados', function () {
    const respuesta = http.patch(
      `${URL_BASE}/tickets/${idTicket}/estado`,
      JSON.stringify({ estado: 'NUEVO' }), // EN_PROGRESO -> NUEVO no es valido
      {
        headers: encabezados,
        tags: { paso: 'transicion_ilegal' },
        // El 409 es la RESPUESTA CORRECTA que estamos comprobando. Sin esto,
        // k6 lo contaria como peticion fallida en `http_req_failed` y el
        // umbral `rate<0.01` fallaria aunque el sistema funcione bien.
        responseCallback: http.expectedStatuses(409),
      }
    );

    const correcto = check(respuesta, {
      'DEFENSA: la transicion ilegal se rechaza (409)': (r) => r.status === 409,
    });

    pasosExitosos.add(correcto);
  });

  // =================================================================
  // PASO 9: Seguridad: no se puede acceder sin token
  // =================================================================
  group('9. Verificar la proteccion de rutas', function () {
    const respuesta = http.get(`${URL_BASE}/tickets`, {
      tags: { paso: 'sin_token' },
      // El 401 es la RESPUESTA CORRECTA (la ruta esta protegida). Si en su
      // lugar devolviera 200, SI seria un fallo: la ruta quedaria expuesta.
      responseCallback: http.expectedStatuses(401),
    });

    const correcto = check(respuesta, {
      'DEFENSA: sin token se responde 401': (r) => r.status === 401,
    });

    pasosExitosos.add(correcto);
  });

  // =================================================================
  // PASO 10: Generacion de reportes
  // =================================================================
  group('10. Generar reporte', function () {
    const respuesta = http.get(`${URL_BASE}/reportes/tickets?formato=pdf&tipo=gestion`, {
      headers: encabezados,
      tags: { paso: 'reporte_pdf' },
    });

    const correcto = check(respuesta, {
      'el reporte se genera (200)': (r) => r.status === 200,
      'el tipo de contenido es PDF': (r) =>
        String(r.headers['Content-Type']).includes('application/pdf'),
      'el archivo tiene contenido real': (r) => r.body.length > 1024,
    });

    pasosExitosos.add(correcto);

    if (respuesta.status >= 500) erroresServidor.add(1);
  });

  duracionTotal.add(Date.now() - inicioFlujo);

  sleep(1);
}

// =====================================================================
// RESUMEN FINAL
//
// IMPORTANTE: si se define `handleSummary`, k6 deja de imprimir su tabla
// por defecto y muestra UNICAMENTE lo que devuelva esta funcion. Devolver
// `{}` (como se hacia antes) hacia DESAPARECER todos los resultados: la
// prueba terminaba sin ensenar ni una metrica.
//
// La tabla se construye aqui a mano, sin importar la libreria estandar
// `k6-summary` de jslib.k6.io. Es a proposito: en una sustentacion no
// conviene depender de Internet para que la demo funcione.
// =====================================================================

/** Da formato a un numero con separador de miles. */
function formatearNumero(valor, decimales) {
  if (valor === undefined || valor === null || Number.isNaN(valor)) return 'n/d';
  const fijo = valor.toFixed(decimales === undefined ? 0 : decimales);
  const partes = fijo.split('.');
  partes[0] = partes[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return partes.join('.');
}

/** Extrae el valor de una metrica segun el estadistico pedido. */
function valorDe(metricas, nombre, estadistico) {
  const metrica = metricas[nombre];
  if (!metrica) return undefined;
  return metrica.values[estadistico];
}

/** Extrae el estadistico de una expresion de umbral: 'p(95)<1000' -> 'p(95)'. */
function estadisticoDe(condicion) {
  const coincidencia = condicion.match(/^(.+?)(?:<=|>=|==|<|>)/);
  return coincidencia ? coincidencia[1] : condicion;
}

/**
 * Comprueba cada umbral declarado en `options` y devuelve si se cumplio.
 * k6 ya lo hace internamente, pero mostrarlo en la tabla es lo que permite
 * defender la prueba ante el profesor de un vistazo.
 */
function evaluarUmbrales(datos) {
  const metricas = datos.metrics;
  const resultados = [];

  for (const [nombreMetrica, condiciones] of Object.entries(UMBRALES)) {
    const metrica = metricas[nombreMetrica];
    const veredictos = (metrica && metrica.thresholds) || {};

    for (const condicion of condiciones) {
      const veredicto = veredictos[condicion];
      const estadistico = estadisticoDe(condicion);
      const valor = metrica ? metrica.values[estadistico] : undefined;

      resultados.push({
        texto: `${nombreMetrica} ${condicion}`,
        real: valor,
        // Veredicto de k6. Si k6 no lo emitio, algo va mal: se marca como
        // incumplido para que no pase desapercibido.
        cumple: veredicto ? veredicto.ok === true : false,
      });
    }
  }

  return resultados;
}

export function handleSummary(datos) {
  const metricas = datos.metrics;
  const lineas = [];

  const titulo = (texto) => {
    lineas.push('');
    lineas.push(texto);
    lineas.push('-'.repeat(66));
  };

  lineas.push('');
  lineas.push('='.repeat(66));
  lineas.push(' PRUEBA DE HUMO - SISTEMA DE TICKETS');
  lineas.push('='.repeat(66));
  lineas.push(` URL evaluada: ${URL_BASE}`);

  // --- Verificaciones (checks) ---
  titulo('VERIFICACIONES');
  const checksOk = valorDe(metricas, 'checks', 'passes') || 0;
  const checksTotal = checksOk + (valorDe(metricas, 'checks', 'fails') || 0);
  lineas.push(`  Pasaron:   ${formatearNumero(checksOk)} de ${formatearNumero(checksTotal)}`);
  lineas.push(`  Fallaron:  ${formatearNumero(valorDe(metricas, 'checks', 'fails') || 0)}`);

  // --- Rendimiento ---
  titulo('RENDIMIENTO DE LAS PETICIONES');
  lineas.push(`  Peticiones totales:  ${formatearNumero(valorDe(metricas, 'http_reqs', 'count'))}`);
  lineas.push(`  Promedio:            ${formatearNumero(valorDe(metricas, 'http_req_duration', 'avg'), 2)} ms`);
  lineas.push(`  Mediana (p50):       ${formatearNumero(valorDe(metricas, 'http_req_duration', 'med'), 2)} ms`);
  lineas.push(`  Percentil 95:        ${formatearNumero(valorDe(metricas, 'http_req_duration', 'p(95)'), 2)} ms`);
  lineas.push(`  Maximo:              ${formatearNumero(valorDe(metricas, 'http_req_duration', 'max'), 2)} ms`);

  // --- Metricas propias ---
  titulo('METRICAS PROPIAS');
  const tasaFallos = valorDe(metricas, 'http_req_failed', 'rate');
  lineas.push(
    `  Tasa de peticiones fallidas: ${tasaFallos === undefined ? 'n/d' : (tasaFallos * 100).toFixed(2) + ' %'}`
  );
  lineas.push(`  Errores 5xx (debe ser 0):    ${formatearNumero(valorDe(metricas, 'errores_5xx_total', 'count'))}`);
  const pasos = valorDe(metricas, 'flujo_pasos_exitosos', 'rate');
  lineas.push(`  Pasos del flujo exitosos:    ${pasos === undefined ? 'n/d' : (pasos * 100).toFixed(1) + ' %'}`);
  lineas.push(
    `  Duracion del flujo completo: ${formatearNumero(valorDe(metricas, 'flujo_completo_duracion', 'avg'), 0)} ms (promedio)`
  );

  // --- Umbrales ---
  titulo('UMBRALES (criterios de aceptacion)');
  const umbrales = evaluarUmbrales(datos);
  for (const umbral of umbrales) {
    const marca = umbral.cumple ? 'CUMPLE ' : 'FALLA  ';
    const real = umbral.real === undefined ? 'n/d' : formatearNumero(umbral.real, 2);
    lineas.push(`  [${marca}] ${umbral.texto}   (medido: ${real})`);
  }

  const fallidos = umbrales.filter((u) => !u.cumple).length;

  lineas.push('');
  lineas.push('='.repeat(66));
  if (fallidos === 0) {
    lineas.push(' RESULTADO: TODOS LOS UMBRALES SE CUMPLIERON');
    lineas.push(' El sistema esta listo para la prueba de carga completa:');
    lineas.push('   k6 run k6/load-test.js');
  } else {
    lineas.push(` RESULTADO: ${fallidos} UMBRAL(ES) NO SE CUMPLIERON`);
    lineas.push(' Revise las lineas marcadas como FALLA antes de continuar.');
  }
  lineas.push('');
  lineas.push(' Escenarios disponibles (-e ESCENARIO=...):');
  lineas.push('   carga   (por defecto)  hasta 50 usuarios concurrentes');
  lineas.push('   tasa                   20 peticiones por segundo');
  lineas.push('   estres                 hasta 200 usuarios concurrentes');
  lineas.push('   picos                  salto subito a 150 usuarios');
  lineas.push('   mixto                  navegacion realista del sistema');
  lineas.push('='.repeat(66));
  lineas.push('');

  return { stdout: lineas.join('\n') };
}
