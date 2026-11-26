/**
 * =====================================================================
 * SISTEMA DE TICKETS - PRUEBA DE CARGA (k6)
 * =====================================================================
 *
 * Objetivo: someter el endpoint de creacion de tickets
 * (`POST /api/v1/tickets`) a carga concurrente y verificar que el sistema
 * se mantiene estable y dentro de los umbrales de rendimiento.
 *
 * ---------------------------------------------------------------------
 * INSTALACION DE K6
 * ---------------------------------------------------------------------
 *   Windows:  winget install k6 --source winget
 *             choco install k6
 *   macOS:    brew install k6
 *   Linux:    sudo apt install k6
 *   Docker:   docker run --rm -i grafana/k6 run - < load-test.js
 *
 * ---------------------------------------------------------------------
 * EJECUCION
 * ---------------------------------------------------------------------
 *   # 1. Levantar el sistema y cargar datos de demostracion
 *   docker compose up -d --build
 *   docker compose exec backend npm run db:seed
 *
 *   # 2. Prueba de humo primero (30 segundos, 1 usuario)
 *   k6 run k6/smoke-test.js
 *
 *   # 3. Prueba de carga completa
 *   k6 run k6/load-test.js
 *
 *   # 4. Contra un entorno desplegado en la nube
 *   k6 run -e URL_BASE=https://mi-servicio.onrender.com/api/v1 k6/load-test.js
 *
 *   # 5. Con salida a un archivo para analizarla despues
 *   k6 run --out json=k6/resultados/carga.json k6/load-test.js
 *
 *   # 6. Escenario especifico (ver ESCENARIOS mas abajo)
 *   k6 run -e ESCENARIO=estres k6/load-test.js
 *
 * =====================================================================
 */

import http from 'k6/http';
import { check, group, sleep, fail } from 'k6';
import { Trend, Rate, Counter, Gauge } from 'k6/metrics';

// =====================================================================
// SIN DEPENDENCIAS EXTERNAS
//
// Antes se importaban `randomIntBetween` y `randomItem` desde
// https://jslib.k6.io/... Eso obligaba a tener Internet para que la prueba
// arrancara: si la red falla en plena sustentacion, k6 ni siquiera carga el
// script. Son dos funciones de tres lineas, asi que se implementan aqui.
// =====================================================================

/** Numero entero aleatorio en [minimo, maximo], ambos incluidos. */
function randomIntBetween(minimo, maximo) {
  return Math.floor(Math.random() * (maximo - minimo + 1)) + minimo;
}

/** Elemento aleatorio de un arreglo. */
function randomItem(arreglo) {
  return arreglo[Math.floor(Math.random() * arreglo.length)];
}

// =====================================================================
// QUE CUENTA COMO "PETICION FALLIDA"
//
// Esta prueba lleva el sistema A PROPOSITO hasta el limite de tasa, asi que
// los 429 son una respuesta ESPERADA: son el limitador defendiendo la API.
// k6, por defecto, cuenta como fallo cualquier respuesta fuera del rango
// 2xx; sin esta linea, `http_req_failed` mediria el limitador en lugar de
// medir el sistema, y el umbral se incumpliria siempre.
//
// Un 5xx NO se incluye: eso si seria un fallo real y debe contar.
// =====================================================================
http.setResponseCallback(http.expectedStatuses({ min: 200, max: 299 }, 429));

// =====================================================================
// CONFIGURACION
// =====================================================================

/** URL base de la API. Se puede sobrescribir con -e URL_BASE=... */
const URL_BASE = (__ENV.URL_BASE || 'http://localhost:4000/api/v1').replace(/\/$/, '');

/** Credenciales del semillero. */
const CREDENCIALES = {
  admin: {
    correo: __ENV.CORREO_ADMIN || 'admin@sistema-tickets.local',
    contrasena: __ENV.CONTRASENA || 'Demo2026#Tickets',
  },
  agente: {
    correo: __ENV.CORREO_AGENTE || 'agente1@sistema-tickets.local',
    contrasena: __ENV.CONTRASENA || 'Demo2026#Tickets',
  },
  solicitante: {
    correo: __ENV.CORREO_SOLICITANTE || 'usuario1@sistema-tickets.local',
    contrasena: __ENV.CONTRASENA || 'Demo2026#Tickets',
  },
};

// =====================================================================
// METRICAS PERSONALIZADAS
// Ademas de las metricas automaticas de k6 (http_req_duration, etc.),
// se definen metricas de negocio que permiten responder preguntas
// concretas durante la sustentacion.
// =====================================================================

/** Tiempo de respuesta exclusivo de la creacion de tickets. */
const duracionCreacionTicket = new Trend('creacion_ticket_duracion', true);

/** Tiempo de respuesta exclusivo del listado con filtros. */
const duracionListado = new Trend('listado_tickets_duracion', true);

/** Porcentaje de tickets efectivamente creados (excluye respuestas rechazadas). */
const tasaExitoCreacion = new Rate('creacion_ticket_exito');

/** Contador de tickets creados con exito. */
const ticketsCreados = new Counter('tickets_creados_total');

/** Respuestas 429 (limite de tasa). No son un fallo: son la defensa funcionando. */
const respuestasLimitadas = new Counter('respuestas_429_total');

/** Respuestas 400 (validacion rechazada). */
const respuestasValidadas = new Counter('respuestas_400_total');

/** Errores reales del servidor (5xx). Deben ser CERO. */
const erroresServidor = new Counter('errores_5xx_total');

/** Numero de tickets vigentes en el sistema al inicio de la prueba. */
const ticketsIniciales = new Gauge('tickets_iniciales');

// =====================================================================
// ESCENARIOS
// Cada escenario simula un patron de trafico distinto. Se pueden
// ejecutar por separado con -e ESCENARIO=nombre.
// =====================================================================

const ESCENARIOS = {
  /**
   * CARGA PROGRESIVA (por defecto)
   * Sube de 0 a 50 usuarios en 1 minuto, se mantiene 3 minutos y baja.
   * Es el patron que simula un dia laboral normal.
   */
  carga: {
    escenario_carga: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '30s', target: 10 }, // calentamiento
        { duration: '1m', target: 50 }, // subida
        { duration: '3m', target: 50 }, // meseta
        { duration: '30s', target: 0 }, // bajada
      ],
      gracefulRampDown: '20s',
      exec: 'flujoCreacionTickets',
      tags: { escenario: 'carga' },
    },
  },

  /**
   * CARGA SOSTENIDA POR TASA
   * Mantiene exactamente 20 peticiones por segundo, sin importar cuanto
   * tarde cada una. Es el mejor escenario para medir la capacidad real
   * del servidor: si se cae, la tasa objetivo no se alcanza y k6 lo
   * reporta como peticiones no ejecutadas.
   */
  tasa: {
    escenario_tasa: {
      executor: 'constant-arrival-rate',
      rate: 20,
      timeUnit: '1s',
      duration: '3m',
      preAllocatedVUs: 30,
      maxVUs: 100,
      exec: 'flujoCreacionTickets',
      tags: { escenario: 'tasa' },
    },
  },

  /**
   * PRUEBA DE ESTRES
   * Lleva el sistema hasta 200 usuarios concurrentes para encontrar el
   * punto de quiebre. Aqui es donde el limitador de tasa debe empezar a
   * responder 429 en lugar de dejar caer el servicio.
   */
  estres: {
    escenario_estres: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '30s', target: 50 },
        { duration: '1m', target: 100 },
        { duration: '1m', target: 200 },
        { duration: '2m', target: 200 },
        { duration: '30s', target: 0 },
      ],
      gracefulRampDown: '30s',
      exec: 'flujoCreacionTickets',
      tags: { escenario: 'estres' },
    },
  },

  /**
   * PRUEBA DE PICOS (SPIKE)
   * Salta de 5 a 150 usuarios en 10 segundos, como cuando se cae un
   * servicio y todos los usuarios reportan a la vez. Verifica que el
   * sistema no se caiga y se recupere.
   */
  picos: {
    escenario_picos: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '20s', target: 5 }, // linea base
        { duration: '10s', target: 150 }, // pico subito
        { duration: '1m', target: 150 }, // se mantiene el pico
        { duration: '10s', target: 5 }, // bajada rapida
        { duration: '1m', target: 5 }, // recuperacion
        { duration: '10s', target: 0 },
      ],
      gracefulRampDown: '20s',
      exec: 'flujoCreacionTickets',
      tags: { escenario: 'picos' },
    },
  },

  /**
   * FLUJO COMPLETO
   * Un usuario real no solo crea tickets: tambien consulta, filtra y
   * revisa el detalle. Este escenario mezcla lectura y escritura en la
   * proporcion habitual de un helpdesk (mas lecturas que escrituras).
   */
  mixto: {
    escenario_mixto: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '30s', target: 20 },
        { duration: '2m', target: 40 },
        { duration: '30s', target: 0 },
      ],
      exec: 'flujoUsuarioReal',
      tags: { escenario: 'mixto' },
    },
  },
};

// Se elige el escenario indicado por variable de entorno; por defecto, carga.
const nombreEscenario = __ENV.ESCENARIO || 'carga';
const escenariosSeleccionados = ESCENARIOS[nombreEscenario] || ESCENARIOS.carga;

// =====================================================================
// UMBRALES (thresholds) POR PERFIL
//
// Son criterios de aceptacion automaticos. Si no se cumplen, k6 termina con
// codigo de salida distinto de cero, lo que permite usarlo en una tuberia de
// integracion continua.
//
// POR QUE HAY DOS PERFILES:
// los umbrales no pueden ser los mismos en una maquina de desarrollo que en
// produccion. En local, PostgreSQL, Node, nginx y el propio k6 comparten la
// CPU de un solo equipo, asi que exigir un p95 de 800 ms seria deshonesto:
// la prueba fallaria siempre y dejaria de ser util como criterio.
//
// Los valores del perfil `local` estan CALIBRADOS CON MEDICIONES REALES, no
// elegidos a ojo. Con ESCENARIO=tasa (20 peticiones/s durante 3 minutos) y
// DB_POOL_MAX=50 se midio:
//     p(95) = 1.517 ms   ->  umbral 2.500 ms  (1,6x de margen)
//     p(95) de creacion = 1.320 ms -> umbral 2.000 ms
// El margen de ~1,6x permite detectar regresiones sin fallar por ruido.
//
// El perfil `produccion` mantiene los objetivos exigentes, que son los
// correctos cuando la base de datos y la API tienen recursos dedicados.
//
// Ver docs/RENDIMIENTO.md para el informe completo con las dos mediciones.
//
// Se declaran como constante propia porque `options.thresholds` es lo que
// aplica k6, pero el resumen necesita recorrerlos para mostrar cada uno con
// su veredicto.
//
// IMPORTANTE — el veredicto se LEE de k6, no se recalcula:
// k6 ya evalua cada umbral y deja el resultado en
// `data.metrics[nombre].thresholds[expresion].ok`. Volver a interpretar la
// expresion a mano duplicaba la logica y permitia que el resumen dijera algo
// distinto de lo que decia el codigo de salida del proceso.
// =====================================================================

const PERFIL = __ENV.PERFIL || 'local';

/**
 * Umbrales comunes a todos los escenarios, segun el perfil de exigencia.
 *
 * OJO: aqui NO va `listado_tickets_duracion`. Ese umbral solo tiene sentido
 * en el escenario `mixto`, el unico que ejecuta `flujoUsuarioReal`.
 * Ver `UMBRALES_POR_ESCENARIO` justo mas abajo.
 */
const UMBRALES_POR_PERFIL = {
  /**
   * Perfil local: calibrado con las mediciones en una sola maquina.
   * Es el que se usa por defecto y el que debe pasar en la sustentacion.
   */
  local: {
    // Percentil 95 por debajo de 2,5 s (medido: 1,5 s con pool de 50).
    // El p99 se deja holgado a proposito: existe una cola conocida y
    // diagnosticada (pool de conexiones + amplificacion de escrituras por
    // los disparadores). El umbral aqui funciona como "el sistema no se
    // cuelga", no como objetivo de calidad. Ver docs/RENDIMIENTO.md.
    http_req_duration: ['p(95)<2500', 'p(99)<15000'],

    // Los 429 NO cuentan como fallo (ver `http.setResponseCallback`), asi que
    // este umbral mide fallos de verdad y puede ser estricto.
    http_req_failed: ['rate<0.01'],

    creacion_ticket_duracion: ['p(95)<2000', 'p(99)<6000'],

    // Al menos el 90% de los intentos de creacion deben ser aceptados.
    creacion_ticket_exito: ['rate>0.90'],

    // CERO errores de servidor. No es negociable: un 5xx significa que hay
    // un fallo no controlado en el codigo.
    errores_5xx_total: ['count==0'],
  },

  /**
   * Perfil produccion: los objetivos exigentes, alcanzables cuando la base
   * de datos tiene recursos dedicados. Se activa con -e PERFIL=produccion.
   */
  produccion: {
    http_req_duration: ['p(95)<800', 'p(99)<2000'],
    http_req_failed: ['rate<0.01'],
    creacion_ticket_duracion: ['p(95)<1000', 'p(99)<2500'],
    creacion_ticket_exito: ['rate>0.90'],
    errores_5xx_total: ['count==0'],
  },
};

/**
 * Umbrales que SOLO se aplican al escenario que produce esa metrica.
 *
 * POR QUE HAY QUE SEPARARLOS (comprobado con k6, no supuesto):
 * k6 publica en el resumen CUALQUIER metrica que aparezca en
 * `options.thresholds`, aunque no haya recibido ni una sola muestra, y en
 * ese caso le asigna el valor 0 a todas sus estadisticas.
 *
 * Eso tiene dos consecuencias graves:
 *
 *   1. Un umbral como `listado_tickets_duracion: ['p(95)<500']` se cumplia
 *      de forma VACIA (0 < 500) en los escenarios que solo crean tickets,
 *      dando por verificado un listado que nunca se habia ejercitado.
 *
 *   2. Al reves, un umbral como `creacion_ticket_exito: ['rate>0.90']` vale
 *      0 cuando no hay muestras, y por tanto FALLA: la prueba se caeria por
 *      un motivo que no es real.
 *
 * Aplicando cada umbral solo al escenario que lo produce, el resumen refleja
 * lo que de verdad se midio.
 */
const UMBRALES_POR_ESCENARIO = {
  // `mixto` es el unico escenario que ejecuta `flujoUsuarioReal`, y por
  // tanto el unico que mide el listado con filtros.
  mixto: {
    listado_tickets_duracion: ['p(95)<500'],
  },
};

const UMBRALES_LOAD = Object.assign(
  {},
  UMBRALES_POR_PERFIL[PERFIL] || UMBRALES_POR_PERFIL.local,
  UMBRALES_POR_ESCENARIO[nombreEscenario] || {}
);

// =====================================================================
// OPCIONES DE LA PRUEBA
// =====================================================================

export const options = {
  scenarios: escenariosSeleccionados,

  thresholds: UMBRALES_LOAD,

  // Resumen compacto en consola y detallado al final.
  summaryTrendStats: ['avg', 'min', 'med', 'p(90)', 'p(95)', 'p(99)', 'max'],

  // ---------------------------------------------------------------------
  // OJO — dos opciones que estaban aqui y hacian FALLAR toda la prueba:
  //
  //   httpDebug: false
  //     En k6 esta opcion NO es un booleano, es una CADENA ('true', 'false'
  //     o 'full'). Pasarle un booleano hacia que k6 abortara al cargar el
  //     script con:
  //       json: cannot unmarshal bool into Go value of type null.String
  //     La prueba no llegaba a ejecutarse ni una sola vez.
  //
  //   abortOnFail: false
  //     No es una opcion de `options`. `abortOnFail` es una PROPIEDAD DE
  //     CADA UMBRAL (por ejemplo:
  //       http_req_duration: [{ threshold: 'p(95)<800', abortOnFail: true }]
  //     ) y por defecto ya es false, que es justo lo que se quiere: no
  //     abortar y entregar el informe completo.
  //
  // Se eliminan ambas. No hace falta depurar HTTP en una prueba de carga
  // normal, y el comportamiento por defecto de los umbrales es el deseado.
  // ---------------------------------------------------------------------

  // Datos de la prueba que aparecen en el resumen.
  tags: {
    proyecto: 'sistema-tickets',
    entorno: __ENV.ENTORNO || 'local',
  },
};

// =====================================================================
// DATOS DE PRUEBA
// =====================================================================

/** Titulos realistas: evita que todos los tickets se vean identicos. */
const TITULOS = [
  'La impresora del piso 3 no responde',
  'No puedo acceder al sistema de nominas',
  'La VPN se desconecta constantemente',
  'El correo electronico no sincroniza',
  'Error 500 al generar el reporte mensual',
  'La laptop se apaga sola despues de 10 minutos',
  'No tengo acceso a la carpeta compartida de proyectos',
  'El sistema de facturacion esta muy lento',
  'Perdi la conexion a la base de datos de produccion',
  'La pantalla muestra lineas verticales',
  'Solicito instalacion de software de diseno',
  'El telefono IP no tiene tono',
  'No puedo imprimir etiquetas de envio',
  'La aplicacion movil no carga los datos',
  'Necesito restablecer mi contrasena de red',
];

const DESCRIPCIONES = [
  'El problema comenzo esta manana y afecta a todo el departamento. Adjunto captura del mensaje de error que aparece en pantalla.',
  'Se intento reiniciar el equipo y el problema persiste. Ya se verifico que el cable de red esta conectado correctamente.',
  'La incidencia es intermitente: ocurre aproximadamente cada 15 minutos y obliga a reiniciar la aplicacion para continuar trabajando.',
  'El sistema muestra un mensaje de error al intentar guardar los cambios. Los datos se pierden y hay que capturarlos de nuevo.',
  'Afecta a tres personas del area. Se requiere atencion prioritaria porque impide completar el cierre del periodo.',
];

const PRIORIDADES = ['BAJA', 'MEDIA', 'ALTA', 'CRITICA'];

// =====================================================================
// FUNCIONES AUXILIARES
// =====================================================================

/**
 * Realiza el inicio de sesion y devuelve el token de acceso.
 * @param {{correo:string, contrasena:string}} credenciales
 * @returns {string} Token de acceso
 */
function iniciarSesion(credenciales) {
  const respuesta = http.post(
    `${URL_BASE}/auth/iniciar-sesion`,
    JSON.stringify(credenciales),
    {
      headers: { 'Content-Type': 'application/json' },
      tags: { nombre: 'iniciar_sesion' },
    }
  );

  const correcto = check(respuesta, {
    'inicio de sesion exitoso (200)': (r) => r.status === 200,
  });

  if (!correcto) {
    // Sin token no se puede continuar: se aborta la iteracion con un
    // mensaje claro en lugar de generar cientos de 401 confusos.
    fail(
      `No fue posible iniciar sesion con ${credenciales.correo}. ` +
        `Estado: ${respuesta.status}. ` +
        `Verifique que el backend este levantado y que haya ejecutado "npm run db:seed".`
    );
  }

  const cuerpo = respuesta.json();
  return cuerpo.datos.tokenAcceso;
}

/** Encabezados con autenticacion. */
function encabezadosAutenticados(token) {
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
  };
}

/** Genera el cuerpo de un ticket con datos variados. */
function generarTicket(categoriaId) {
  const cuerpo = {
    titulo: `${randomItem(TITULOS)} [#${randomIntBetween(1000, 9999)}]`,
    descripcion: randomItem(DESCRIPCIONES),
    prioridad: randomItem(PRIORIDADES),
  };

  if (categoriaId) cuerpo.categoriaId = categoriaId;

  return cuerpo;
}

// =====================================================================
// SETUP: se ejecuta UNA VEZ antes de la prueba
// Aqui se prepara todo lo que es costoso y no debe repetirse por usuario:
// autenticacion, catalogos y conteo inicial.
// =====================================================================

export function setup() {
  console.log('');
  console.log('=================================================================');
  console.log(' SISTEMA DE TICKETS - PRUEBA DE CARGA');
  console.log('=================================================================');
  console.log(` Entorno:   ${__ENV.ENTORNO || 'local'}`);
  console.log(` URL base:  ${URL_BASE}`);
  console.log(` Escenario: ${nombreEscenario}`);
  console.log('=================================================================');
  console.log('');

  // --- 1. Verificar que el servicio este disponible ---
  const salud = http.get(`${URL_BASE}/salud`, { tags: { nombre: 'salud' } });

  if (salud.status !== 200) {
    fail(
      `El servicio no responde en ${URL_BASE}/salud (estado ${salud.status}).\n` +
        'Ejecute primero: docker compose up -d --build'
    );
  }

  const datosSalud = salud.json();
  console.log(`[setup] Servicio operativo. Base de datos: ${datosSalud.datos.baseDatos.nombre}`);
  console.log(`[setup] Latencia de la base de datos: ${datosSalud.datos.baseDatos.latenciaMs} ms`);

  // --- 2. Autenticacion ---
  const tokenAdmin = iniciarSesion(CREDENCIALES.admin);
  console.log('[setup] Sesion de administrador iniciada');

  // --- 3. Catalogos y conteo inicial ---
  const categorias = http.get(`${URL_BASE}/categorias?soloActivas=true`, {
    headers: encabezadosAutenticados(tokenAdmin),
    tags: { nombre: 'categorias' },
  });

  let idsCategorias = [];
  if (categorias.status === 200) {
    idsCategorias = categorias.json().datos.map((categoria) => categoria.id);
    console.log(`[setup] Categorias disponibles: ${idsCategorias.length}`);
  } else {
    console.warn('[setup] No se pudieron obtener las categorias. Los tickets se crearan sin categoria.');
  }

  const estadisticas = http.get(`${URL_BASE}/tickets/estadisticas`, {
    headers: encabezadosAutenticados(tokenAdmin),
    tags: { nombre: 'estadisticas_iniciales' },
  });

  let totalInicial = 0;
  if (estadisticas.status === 200) {
    totalInicial = estadisticas.json().datos.total;
    ticketsIniciales.add(totalInicial);
    console.log(`[setup] Tickets existentes antes de la prueba: ${totalInicial}`);
  }

  console.log('');
  console.log('[setup] Preparacion completada. Iniciando carga...');
  console.log('');

  // Los datos de setup se comparten con todas las VUs.
  return {
    tokenAdmin,
    idsCategorias,
    totalInicial,
  };
}

// =====================================================================
// TOKEN POR USUARIO VIRTUAL
//
// OJO — esto era un error de fondo y merece explicacion.
//
// El codigo guardaba el token en `datos.tokenVu`, es decir, dentro del
// objeto que devuelve `setup()`. Pero en k6 el objeto de `setup()` se
// entrega COMO COPIA en cada iteracion: mutarlo no persiste. Resultado:
// la condicion `if (!datos.tokenVu)` era siempre verdadera y CADA
// ITERACION iniciaba sesion de nuevo.
//
// Justo lo contrario de lo que dice el comentario del flujo. En vez de
// medir la creacion de tickets, la prueba medía el costo del hash bcrypt
// (12 rondas, deliberadamente lento) y ademas disparaba el limitador de
// inicio de sesion.
//
// La forma correcta: una variable de MODULO. Cada VU de k6 tiene su propio
// runtime de JavaScript, asi que una variable de modulo se inicializa una
// vez por VU y PERSISTE entre sus iteraciones. Es exactamente el
// comportamiento que se busca: un inicio de sesion por usuario virtual.
// =====================================================================
let tokenDelVu = null;

// =====================================================================
// ESCENARIO PRINCIPAL: creacion de tickets
// Es la operacion que la consigna pide estresar explicitamente.
// =====================================================================

export function flujoCreacionTickets(datos) {
  // Un solo inicio de sesion por VU, reutilizado en todas sus iteraciones.
  if (!tokenDelVu) {
    tokenDelVu = iniciarSesion(CREDENCIALES.agente);
  }

  const categoriaId =
    datos.idsCategorias && datos.idsCategorias.length > 0
      ? randomItem(datos.idsCategorias)
      : null;

  group('Crear ticket', function () {
    const inicio = Date.now();

    const respuesta = http.post(
      `${URL_BASE}/tickets`,
      JSON.stringify(generarTicket(categoriaId)),
      {
        headers: encabezadosAutenticados(tokenDelVu),
        tags: { nombre: 'crear_ticket' },
        // El 429 (limitador de tasa) y el 400 (validacion) son RESPUESTAS
        // ESPERADAS en esta prueba: el propio `check` de abajo las acepta.
        // Sin este `responseCallback`, k6 las contaria como peticiones
        // fallidas en `http_req_failed` y el umbral se incumpliria aunque
        // el sistema se este defendiendo correctamente.
        // Un 5xx SI sigue contando como fallo, que es lo que se quiere.
        responseCallback: http.expectedStatuses(201, 400, 429),
      }
    );

    duracionCreacionTicket.add(Date.now() - inicio);

    // --- Clasificacion de la respuesta ---
    if (respuesta.status === 201) {
      ticketsCreados.add(1);
      tasaExitoCreacion.add(true);
    } else if (respuesta.status === 429) {
      // El limitador de tasa actua. NO es un fallo: es la defensa
      // funcionando y evitando que el servidor se sature.
      respuestasLimitadas.add(1);
      tasaExitoCreacion.add(false);
    } else if (respuesta.status === 400) {
      // Validacion rechazando datos. Si ocurre mucho, el generador de
      // datos de prueba esta produciendo entradas invalidas.
      respuestasValidadas.add(1);
      tasaExitoCreacion.add(false);
    } else if (respuesta.status >= 500) {
      // Error no controlado: esto SI es un fallo grave.
      erroresServidor.add(1);
      tasaExitoCreacion.add(false);
      console.error(`[VU ${__VU}] Error del servidor: ${respuesta.status} - ${respuesta.body}`);
    } else {
      tasaExitoCreacion.add(false);
    }

    // --- Verificaciones ---
    check(respuesta, {
      'respuesta aceptada (201, 400 o 429)': (r) =>
        r.status === 201 || r.status === 400 || r.status === 429,

      'sin errores del servidor (no 5xx)': (r) => r.status < 500,

      'respuesta en menos de 3 segundos': (r) => r.timings.duration < 3000,

      'el ticket creado incluye folio': (r) => {
        if (r.status !== 201) return true; // No aplica a respuestas rechazadas
        try {
          return /^TK-\d{4}-\d{6}$/.test(r.json().datos.codigo);
        } catch {
          return false;
        }
      },

      'el ticket creado tiene estado NUEVO': (r) => {
        if (r.status !== 201) return true;
        try {
          return r.json().datos.estado === 'NUEVO';
        } catch {
          return false;
        }
      },

      'el error 400 explica que campo fallo': (r) => {
        if (r.status !== 400) return true;
        try {
          return Array.isArray(r.json().detalles) && r.json().detalles.length > 0;
        } catch {
          return false;
        }
      },
    });
  });

  // Pausa entre peticiones: simula el tiempo que un usuario real tarda en
  // escribir el siguiente ticket. Sin esta pausa, cada VU genera el maximo
  // de peticiones posible y se satura el limitador de tasa de inmediato.
  sleep(randomIntBetween(1, 3));
}

// =====================================================================
// ESCENARIO MIXTO: simula a un usuario real navegando el sistema
// Mas lecturas que escrituras, que es la proporcion de un helpdesk real.
// =====================================================================

export function flujoUsuarioReal(datos) {
  // Reutiliza el mismo inicio de sesion por VU que el flujo de creacion
  // (ver la explicacion de `tokenDelVu` mas arriba). Si este escenario se
  // ejecuta solo, la variable aun estara vacia y se inicia sesion una vez.
  if (!tokenDelVu) {
    tokenDelVu = iniciarSesion(CREDENCIALES.agente);
  }

  const encabezados = encabezadosAutenticados(tokenDelVu);

  // --- 1. Consultar el panel (lo primero que hace todo usuario) ---
  group('Consultar panel', function () {
    const respuesta = http.get(`${URL_BASE}/tickets/estadisticas`, {
      headers: encabezados,
      tags: { nombre: 'estadisticas' },
    });

    check(respuesta, {
      'el panel carga (200)': (r) => r.status === 200,
      'el panel carga en menos de 1 s': (r) => r.timings.duration < 1000,
    });
  });

  sleep(randomIntBetween(1, 2));

  // --- 2. Listar tickets con filtros (la accion mas frecuente) ---
  group('Listar y filtrar tickets', function () {
    const inicio = Date.now();

    const filtros = [
      'pagina=1&limite=20',
      'pagina=1&limite=20&estado=NUEVO',
      'pagina=1&limite=20&estado=EN_PROGRESO',
      'pagina=1&limite=20&prioridad=ALTA',
      'pagina=1&limite=20&soloVencidos=true',
      'pagina=1&limite=50&ordenarPor=creado_en&direccion=DESC',
    ];

    const respuesta = http.get(`${URL_BASE}/tickets?${randomItem(filtros)}`, {
      headers: encabezados,
      tags: { nombre: 'listar_tickets' },
    });

    duracionListado.add(Date.now() - inicio);

    check(respuesta, {
      'el listado responde (200)': (r) => r.status === 200,
      'el listado incluye metadatos de paginacion': (r) => {
        if (r.status !== 200) return false;
        try {
          return Boolean(r.json().meta.paginacion.total);
        } catch {
          return false;
        }
      },
      'el listado responde en menos de 1.5 s': (r) => r.timings.duration < 1500,
    });
  });

  sleep(randomIntBetween(1, 2));

  // --- 3. Abrir el detalle de un ticket existente ---
  group('Ver detalle de un ticket', function () {
    const listado = http.get(`${URL_BASE}/tickets?limite=5`, {
      headers: encabezados,
      tags: { nombre: 'listar_para_detalle' },
    });

    if (listado.status === 200) {
      const tickets = listado.json().datos;

      if (tickets.length > 0) {
        const ticket = randomItem(tickets);

        const detalle = http.get(`${URL_BASE}/tickets/${ticket.id}`, {
          headers: encabezados,
          tags: { nombre: 'detalle_ticket' },
        });

        check(detalle, {
          'el detalle responde (200)': (r) => r.status === 200,
        });

        // Historial de auditoria del ticket
        const historial = http.get(`${URL_BASE}/tickets/${ticket.id}/historial`, {
          headers: encabezados,
          tags: { nombre: 'historial_ticket' },
        });

        check(historial, {
          'el historial responde (200)': (r) => r.status === 200,
        });
      }
    }
  });

  sleep(randomIntBetween(2, 4));

  // --- 4. Crear un ticket nuevo (con menor frecuencia) ---
  if (randomIntBetween(1, 10) <= 3) {
    flujoCreacionTickets(datos);
  }

  sleep(randomIntBetween(1, 3));
}

// =====================================================================
// TEARDOWN: se ejecuta UNA VEZ al terminar
// Verifica la integridad del sistema despues de la prueba.
// =====================================================================

export function teardown(datos) {
  console.log('');
  console.log('[teardown] Verificando la integridad del sistema tras la prueba...');

  // Se vuelve a iniciar sesion: el token del setup pudo haber expirado
  // (los access token duran 15 minutos por diseno).
  let tokenAdmin;
  try {
    tokenAdmin = iniciarSesion(CREDENCIALES.admin);
  } catch {
    console.error('[teardown] No fue posible reautenticarse para verificar el estado final.');
    return;
  }

  const estadisticas = http.get(`${URL_BASE}/tickets/estadisticas`, {
    headers: encabezadosAutenticados(tokenAdmin),
    tags: { nombre: 'estadisticas_finales' },
  });

  if (estadisticas.status !== 200) {
    console.error('[teardown] No se pudo consultar el estado final del sistema.');
    return;
  }

  const totalFinal = estadisticas.json().datos.total;
  const creados = totalFinal - datos.totalInicial;

  console.log('');
  console.log('=================================================================');
  console.log(' RESUMEN DE INTEGRIDAD');
  console.log('=================================================================');
  console.log(` Tickets antes de la prueba:  ${datos.totalInicial}`);
  console.log(` Tickets despues de la prueba: ${totalFinal}`);
  console.log(` Tickets creados durante la prueba: ${creados}`);
  console.log('-----------------------------------------------------------------');

  // Comprobacion de integridad: el sistema debe seguir respondiendo
  // correctamente despues de la carga, y el panel debe funcionar.
  const panel = http.get(`${URL_BASE}/reportes/dashboard?dias=7`, {
    headers: encabezadosAutenticados(tokenAdmin),
    tags: { nombre: 'panel_final' },
  });

  if (panel.status === 200) {
    console.log(' El panel de reportes sigue operativo tras la carga.');
  } else {
    console.error(` El panel de reportes fallo tras la carga (estado ${panel.status}).`);
  }

  const saludFinal = http.get(`${URL_BASE}/salud`, { tags: { nombre: 'salud_final' } });

  if (saludFinal.status === 200) {
    const latencia = saludFinal.json().datos.baseDatos.latenciaMs;
    console.log(` La base de datos sigue conectada (latencia: ${latencia} ms).`);
  } else {
    console.error(' La verificacion de salud fallo tras la carga.');
  }

  console.log('=================================================================');
  console.log(' NOTA: si aparecen respuestas 429, NO son un fallo. Son el');
  console.log(' limitador de tasa protegiendo el servidor, que es exactamente');
  console.log(' el comportamiento esperado bajo carga alta.');
  console.log(' Lo que NUNCA debe aparecer es un error 5xx.');
  console.log('=================================================================');
  console.log('');
}

// =====================================================================
// MANEJO DEL RESUMEN
// Se personaliza la salida final para destacar lo que importa en la
// sustentacion: latencia, errores de servidor y respuestas controladas.
// =====================================================================

// =====================================================================
// RESUMEN FINAL
//
// ATENCION: si se define `handleSummary`, k6 deja de imprimir su tabla por
// defecto. La version anterior devolvia `stdout: ''`, lo que hacia
// DESAPARECER todos los resultados de la prueba de la pantalla, y escribia
// un "resumen-final.json" que solo contenia metadatos (escenario, URL y
// fecha) sin ni una sola metrica.
//
// Ahora se imprime un resumen completo y el JSON lleva los numeros reales,
// para poder adjuntarlos como evidencia en la memoria del proyecto.
// =====================================================================

/** Da formato a un numero con separador de miles. */
function formatearNumero(valor, decimales) {
  if (valor === undefined || valor === null || Number.isNaN(valor)) return 'n/d';
  const fijo = valor.toFixed(decimales === undefined ? 0 : decimales);
  const partes = fijo.split('.');
  partes[0] = partes[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return partes.join('.');
}

/** Lee el valor de una metrica; devuelve undefined si no existe. */
function metrica(datos, nombre, estadistico) {
  const encontrada = datos.metrics[nombre];
  if (!encontrada) return undefined;
  return encontrada.values[estadistico];
}

/**
 * Lee un contador; si la metrica no existe, devuelve 0.
 *
 * Hace falta porque k6 solo publica en el resumen las metricas que recibieron
 * al menos una muestra o que aparecen en `options.thresholds`. Los contadores
 * de 429 y 400 no estan en ningun umbral, asi que cuando la prueba termina sin
 * que se disparen ni una vez no aparecen en `data.metrics`. Ausencia significa
 * "el suceso no ocurrio" (cero), no "dato desconocido": antes se imprimia
 * "n/d" en la evidencia, que es confuso.
 */
function contador(datos, nombre) {
  const valor = metrica(datos, nombre, 'count');
  return valor === undefined ? 0 : valor;
}

/** Extrae el estadistico de una expresion de umbral: 'p(95)<2500' -> 'p(95)'. */
function estadisticoDe(condicion) {
  const coincidencia = condicion.match(/^(.+?)(?:<=|>=|==|<|>)/);
  return coincidencia ? coincidencia[1] : condicion;
}

/**
 * Detecta si una metrica no recibio ninguna muestra.
 *
 * Es necesario porque k6 publica las metricas referenciadas por un umbral
 * aunque esten vacias, con TODAS sus estadisticas a 0. Sin esta comprobacion,
 * un trend sin datos se reportaria como "p(95) = 0 ms", que es un dato falso:
 * ninguna peticion HTTP tarda 0 ms.
 *
 *   - trend:   un maximo de 0 ms solo puede significar que no hubo muestras.
 *   - rate:    sin aciertos ni fallos registrados, no hubo muestras.
 *   - counter: un contador a 0 es un cero legitimo (el suceso no ocurrio).
 */
function sinMuestras(metricaEncontrada) {
  if (!metricaEncontrada) return true;

  const valores = metricaEncontrada.values;
  if (metricaEncontrada.type === 'trend') return valores.max === 0;
  if (metricaEncontrada.type === 'rate') {
    return (valores.passes || 0) + (valores.fails || 0) === 0;
  }
  return false;
}

/**
 * Recorre los umbrales declarados y recoge el veredicto que YA emitio k6.
 *
 * No se recalcula la comparacion: k6 deja el resultado en
 * `data.metrics[nombre].thresholds[expresion].ok`, y ese es exactamente el
 * veredicto que decide el codigo de salida del proceso. Recalcularlo a mano
 * solo servia para poder contradecir a k6 en la sustentacion.
 */
function evaluarUmbrales(datos) {
  const resultados = [];

  for (const [nombre, condiciones] of Object.entries(UMBRALES_LOAD)) {
    const metricaEncontrada = datos.metrics[nombre];
    const veredictos = (metricaEncontrada && metricaEncontrada.thresholds) || {};
    const vacia = sinMuestras(metricaEncontrada);

    for (const condicion of condiciones) {
      const veredicto = veredictos[condicion];
      const estadistico = estadisticoDe(condicion);
      const valor = metricaEncontrada ? metricaEncontrada.values[estadistico] : undefined;

      resultados.push({
        umbral: `${nombre} ${condicion}`,
        estadistico,
        valor: valor === undefined ? null : Number(valor.toFixed(4)),
        // Veredicto de k6. Si k6 no lo emitio, algo va mal: se marca como
        // incumplido para que no pase desapercibido.
        cumple: veredicto ? veredicto.ok === true : false,
        // Un umbral sin datos no es un aprobado: es un umbral no evaluado.
        sinDatos: vacia,
      });
    }
  }

  return resultados;
}

export function handleSummary(datos) {
  const lineas = [];
  const titulo = (texto) => {
    lineas.push('');
    lineas.push(texto);
    lineas.push('-'.repeat(70));
  };

  lineas.push('');
  lineas.push('='.repeat(70));
  lineas.push(' PRUEBA DE CARGA FINALIZADA - SISTEMA DE TICKETS');
  lineas.push('='.repeat(70));
  lineas.push(` Escenario ejecutado: ${nombreEscenario}`);
  lineas.push(` Perfil de umbrales:  ${PERFIL}${PERFIL === 'local' ? '  (calibrado para una sola maquina)' : '  (objetivos exigentes de produccion)'}`);
  lineas.push(` URL evaluada:        ${URL_BASE}`);

  // --- Rendimiento global ---
  titulo('RENDIMIENTO DE LAS PETICIONES');
  lineas.push(`  Peticiones totales:  ${formatearNumero(metrica(datos, 'http_reqs', 'count'))}`);
  lineas.push(`  Promedio:            ${formatearNumero(metrica(datos, 'http_req_duration', 'avg'), 2)} ms`);
  lineas.push(`  Mediana (p50):       ${formatearNumero(metrica(datos, 'http_req_duration', 'med'), 2)} ms`);
  lineas.push(`  Percentil 95:        ${formatearNumero(metrica(datos, 'http_req_duration', 'p(95)'), 2)} ms`);
  lineas.push(`  Percentil 99:        ${formatearNumero(metrica(datos, 'http_req_duration', 'p(99)'), 2)} ms`);
  lineas.push(`  Maximo:              ${formatearNumero(metrica(datos, 'http_req_duration', 'max'), 2)} ms`);

  // --- La operacion critica ---
  titulo('CREACION DE TICKETS (operacion critica)');
  lineas.push(
    `  Duracion promedio:   ${formatearNumero(metrica(datos, 'creacion_ticket_duracion', 'avg'), 2)} ms`
  );
  lineas.push(
    `  Percentil 95:        ${formatearNumero(metrica(datos, 'creacion_ticket_duracion', 'p(95)'), 2)} ms`
  );
  const exito = metrica(datos, 'creacion_ticket_exito', 'rate');
  lineas.push(
    `  Tasa de aceptacion:  ${exito === undefined ? 'n/d' : (exito * 100).toFixed(1) + ' %'}`
  );
  lineas.push(`  Tickets creados:     ${formatearNumero(metrica(datos, 'tickets_creados_total', 'count'))}`);

  // --- Defensas del sistema ---
  //
  // Se usa `contador()` y no `metrica()` porque los contadores de 429 y 400
  // no aparecen en ningun umbral: si no se disparan ni una vez, k6 no los
  // publica y antes se imprimia "n/d" en lugar de 0.
  titulo('DEFENSAS DEL SISTEMA');
  const respuestas429 = contador(datos, 'respuestas_429_total');
  const respuestas400 = contador(datos, 'respuestas_400_total');
  const errores5xx = contador(datos, 'errores_5xx_total');
  lineas.push(`  Respuestas 429 (limitador de tasa): ${formatearNumero(respuestas429)}`);
  lineas.push(`  Respuestas 400 (validacion):        ${formatearNumero(respuestas400)}`);
  lineas.push(`  Errores 5xx (debe ser 0):           ${formatearNumero(errores5xx)}`);

  // --- Verificaciones ---
  titulo('VERIFICACIONES');
  const pasaron = metrica(datos, 'checks', 'passes') || 0;
  const fallaron = metrica(datos, 'checks', 'fails') || 0;
  lineas.push(`  Pasaron:   ${formatearNumero(pasaron)}`);
  lineas.push(`  Fallaron:  ${formatearNumero(fallaron)}`);

  // --- Umbrales ---
  titulo('UMBRALES (criterios de aceptacion)');
  const umbrales = evaluarUmbrales(datos);
  for (const umbral of umbrales) {
    // `SIN DATOS` no es un aprobado: es un umbral que no se pudo evaluar
    // porque el escenario no genera esa metrica. Se distingue de `CUMPLE`
    // para no presentar como verificado algo que nunca se midio.
    const etiqueta = umbral.sinDatos ? 'SIN DATOS' : umbral.cumple ? 'CUMPLE' : 'FALLA';
    const valor = umbral.valor === null ? 'n/d' : formatearNumero(umbral.valor, 2);
    lineas.push(`  [${etiqueta}] ${umbral.umbral}   (medido: ${valor})`);
  }

  const incumplidos = umbrales.filter((u) => !u.cumple).length;
  const sinDatos = umbrales.filter((u) => u.sinDatos).length;

  lineas.push('');
  lineas.push('='.repeat(70));
  if (incumplidos === 0) {
    lineas.push(' RESULTADO: TODOS LOS UMBRALES SE CUMPLIERON');
    lineas.push(' El sistema soporta el escenario solicitado con margen.');
  } else {
    lineas.push(` RESULTADO: ${incumplidos} UMBRAL(ES) NO SE CUMPLIERON`);
    lineas.push(' Revise las lineas marcadas como FALLA.');
  }
  if (sinDatos > 0) {
    lineas.push('');
    lineas.push(` AVISO: ${sinDatos} umbral(es) SIN DATOS. El escenario '${nombreEscenario}'`);
    lineas.push(' no genera esa metrica, asi que el umbral no se evaluo.');
    lineas.push(' No cuente esos umbrales como verificados.');
  }
  lineas.push('');
  if (respuestas429 > 0) {
    lineas.push(` Se registraron ${formatearNumero(respuestas429)} respuestas 429: es el limitador`);
    lineas.push(' de tasa defendiendo la API, no un fallo.');
  } else {
    lineas.push(' No hubo respuestas 429 en esta ejecucion.');
  }
  lineas.push(' Lo que NUNCA debe aparecer es un error 5xx.');
  lineas.push('='.repeat(70));
  lineas.push('');

  // --- Evidencia en JSON, con numeros reales ---
  //
  // El archivo solo se escribe si se indica la ruta con -e RESUMEN_JSON=...
  //
  // Por que no se escribe siempre: la forma recomendada de ejecutar k6 es
  // pasando el script por la entrada estandar dentro del contenedor
  //   docker run --rm -i grafana/k6 run - < k6/load-test.js
  // En ese caso el contenedor NO tiene el directorio `k6/`, asi que intentar
  // escribir en `k6/resumen-final.json` hacia fallar el resumen con
  //   could not open 'k6/resumen-final.json': no such file or directory
  // Si se quiere el archivo, hay que montar el directorio y pedirlo:
  //   docker run --rm -i -v "%cd%:/app" -w /app \
  //     -e RESUMEN_JSON=k6/resumen-final.json \
  //     grafana/k6 run - < k6/load-test.js
  const resumen = {
    escenario: nombreEscenario,
    perfil: PERFIL,
    urlBase: URL_BASE,
    fecha: new Date().toISOString(),
    rendimiento: {
      peticionesTotales: metrica(datos, 'http_reqs', 'count') || 0,
      duracionPromedioMs: Number((metrica(datos, 'http_req_duration', 'avg') || 0).toFixed(2)),
      duracionP95Ms: Number((metrica(datos, 'http_req_duration', 'p(95)') || 0).toFixed(2)),
      duracionP99Ms: Number((metrica(datos, 'http_req_duration', 'p(99)') || 0).toFixed(2)),
      duracionMaximaMs: Number((metrica(datos, 'http_req_duration', 'max') || 0).toFixed(2)),
    },
    creacionDeTickets: {
      duracionPromedioMs: Number((metrica(datos, 'creacion_ticket_duracion', 'avg') || 0).toFixed(2)),
      duracionP95Ms: Number((metrica(datos, 'creacion_ticket_duracion', 'p(95)') || 0).toFixed(2)),
      tasaDeAceptacion: Number(((metrica(datos, 'creacion_ticket_exito', 'rate') || 0) * 100).toFixed(2)),
      ticketsCreados: contador(datos, 'tickets_creados_total'),
    },
    // Solo tiene datos en el escenario `mixto`. En los demas el objeto queda
    // a null, en lugar de a 0, para que nadie lo lea como "listado en 0 ms".
    listadoDeTickets: sinMuestras(datos.metrics['listado_tickets_duracion'])
      ? null
      : {
          duracionPromedioMs: Number(
            (metrica(datos, 'listado_tickets_duracion', 'avg') || 0).toFixed(2)
          ),
          duracionP95Ms: Number(
            (metrica(datos, 'listado_tickets_duracion', 'p(95)') || 0).toFixed(2)
          ),
        },
    defensas: {
      respuestas429: respuestas429,
      respuestas400: respuestas400,
      errores5xx: errores5xx,
    },
    verificaciones: {
      pasaron: pasaron,
      fallaron: fallaron,
    },
    umbrales: umbrales,
    umbralesIncumplidos: incumplidos,
    umbralesSinDatos: sinDatos,
  };

  const salida = { stdout: lineas.join('\n') };

  const rutaJson = __ENV.RESUMEN_JSON;
  if (rutaJson) {
    salida[rutaJson] = JSON.stringify(resumen, null, 2);
  }

  return salida;
}
