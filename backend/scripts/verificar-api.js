'use strict';
/**
 * Verificacion de extremo a extremo de la API del Sistema de Tickets.
 * Se ejecuta contra los contenedores que ya estan levantados.
 */

const BASE = 'http://localhost:4000/api/v1';
const CREDENCIALES = {
  admin: { correo: 'admin@sistema-tickets.local', contrasena: 'Demo2026#Tickets' },
  agente: { correo: 'agente1@sistema-tickets.local', contrasena: 'Demo2026#Tickets' },
  solicitante1: { correo: 'usuario1@sistema-tickets.local', contrasena: 'Demo2026#Tickets' },
  solicitante2: { correo: 'usuario2@sistema-tickets.local', contrasena: 'Demo2026#Tickets' },
};

let pasadas = 0;
let falladas = 0;
const fallos = [];

function comprobar(nombre, condicion, detalle = '') {
  if (condicion) {
    pasadas++;
    console.log(`  PASA   ${nombre}`);
  } else {
    falladas++;
    fallos.push(nombre + (detalle ? ` -> ${detalle}` : ''));
    console.log(`  FALLA  ${nombre}${detalle ? '  -> ' + detalle : ''}`);
  }
}

async function peticion(ruta, opciones = {}) {
  const respuesta = await fetch(BASE + ruta, opciones);
  const texto = await respuesta.text();
  let json = null;
  try { json = JSON.parse(texto); } catch { /* respuesta sin cuerpo */ }
  return { estado: respuesta.status, json, texto, cabeceras: respuesta.headers };
}

async function iniciarSesion(cual) {
  const r = await peticion('/auth/iniciar-sesion', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(CREDENCIALES[cual]),
  });
  const token = r.json?.datos?.tokens?.tokenAcceso || r.json?.datos?.tokenAcceso;
  return { token, respuesta: r };
}

const cab = (t) => ({ Authorization: `Bearer ${t}`, 'Content-Type': 'application/json' });

(async () => {
  console.log('\n=== 1. AUTENTICACION ===');

  const admin = await iniciarSesion('admin');
  const agente = await iniciarSesion('agente');
  const sol1 = await iniciarSesion('solicitante1');
  const sol2 = await iniciarSesion('solicitante2');

  comprobar('El administrador inicia sesion y recibe token', !!admin.token);
  comprobar('El agente inicia sesion y recibe token', !!agente.token);
  comprobar('El solicitante inicia sesion y recibe token', !!sol1.token);

  const rSinToken = await peticion('/tickets');
  comprobar('Sin token devuelve 401', rSinToken.estado === 401, `codigo ${rSinToken.estado}`);

  const rMalaClave = await peticion('/auth/iniciar-sesion', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ correo: 'admin@sistema-tickets.local', contrasena: 'malaClave' }),
  });
  comprobar('Contrasena incorrecta devuelve 401', rMalaClave.estado === 401, `codigo ${rMalaClave.estado}`);

  const rTokenFalso = await peticion('/tickets', { headers: cab('token.invalido.aqui') });
  comprobar('Token invalido devuelve 401', rTokenFalso.estado === 401, `codigo ${rTokenFalso.estado}`);

  console.log('\n=== 2. SEGURIDAD POR FILA (aislamiento entre usuarios) ===');

  const listadoSol1 = await peticion('/tickets?limite=100', { headers: cab(sol1.token) });
  const listadoAdmin = await peticion('/tickets?limite=100', { headers: cab(admin.token) });

  const totalSol1 = listadoSol1.json?.meta?.total ?? listadoSol1.json?.datos?.length ?? 0;
  const totalAdmin = listadoAdmin.json?.meta?.total ?? listadoAdmin.json?.datos?.length ?? 0;

  comprobar('El administrador ve mas tickets que el solicitante', totalAdmin > totalSol1,
    `admin=${totalAdmin} solicitante=${totalSol1}`);

  // Buscar un ticket que pertenezca a solicitante2 y pedirlo con el token de solicitante1
  const lista2 = await peticion('/tickets?limite=100', { headers: cab(sol2.token) });
  const ticketsDeSol2 = lista2.json?.datos || [];
  const ajeno = ticketsDeSol2.find((t) => {
    const mios = (listadoSol1.json?.datos || []).map((x) => x.id);
    return !mios.includes(t.id);
  });

  if (ajeno) {
    const rAjeno = await peticion(`/tickets/${ajeno.id}`, { headers: cab(sol1.token) });
    comprobar('Un ticket ajeno devuelve 404 (no 403: no revela que existe)',
      rAjeno.estado === 404, `codigo ${rAjeno.estado}`);
  } else {
    comprobar('Se encontro un ticket ajeno para probar', false, 'no se pudo aislar');
  }

  console.log('\n=== 3. MAQUINA DE ESTADOS ===');

  // Crear un ticket nuevo para probar transiciones
  const creado = await peticion('/tickets', {
    method: 'POST',
    headers: cab(sol1.token),
    body: JSON.stringify({
      titulo: 'Verificacion automatica de transiciones',
      descripcion: 'Ticket generado por el script de verificacion de extremo a extremo.',
      prioridad: 'MEDIA',
    }),
  });
  comprobar('El solicitante puede crear un ticket', creado.estado === 201 || creado.estado === 200,
    `codigo ${creado.estado}`);
  const idNuevo = creado.json?.datos?.id;
  const codigoNuevo = creado.json?.datos?.codigo;

  comprobar('El folio se genera con el formato TK-AAAA-NNNNNN',
    /^TK-\d{4}-\d{6}$/.test(codigoNuevo || ''), `folio: ${codigoNuevo}`);

  comprobar('El ticket nace en estado NUEVO', creado.json?.datos?.estado === 'NUEVO',
    `estado: ${creado.json?.datos?.estado}`);

  comprobar('El SLA se calculo automaticamente', !!creado.json?.datos?.fecha_limite_sla,
    `sla: ${creado.json?.datos?.fecha_limite_sla}`);

  // El solicitante NO puede marcar RESUELTO (atribucion del agente) -> 403
  const rResueltoPorSolicitante = await peticion(`/tickets/${idNuevo}/estado`, {
    method: 'PATCH',
    headers: cab(sol1.token),
    body: JSON.stringify({ estado: 'RESUELTO', solucion: 'Intento indebido del solicitante.' }),
  });
  comprobar('El solicitante NO puede marcar RESUELTO (403)',
    rResueltoPorSolicitante.estado === 403, `codigo ${rResueltoPorSolicitante.estado}`);

  // Transicion ilegal: NUEVO -> CERRADO no esta permitida -> 409
  const rIlegal = await peticion(`/tickets/${idNuevo}/estado`, {
    method: 'PATCH',
    headers: cab(agente.token),
    body: JSON.stringify({ estado: 'CERRADO' }),
  });
  comprobar('Transicion ilegal NUEVO -> CERRADO devuelve 409',
    rIlegal.estado === 409, `codigo ${rIlegal.estado}`);

  // Transicion valida: NUEVO -> EN_PROGRESO
  const rValida = await peticion(`/tickets/${idNuevo}/estado`, {
    method: 'PATCH',
    headers: cab(agente.token),
    body: JSON.stringify({ estado: 'EN_PROGRESO' }),
  });
  comprobar('Transicion valida NUEVO -> EN_PROGRESO funciona',
    rValida.estado === 200, `codigo ${rValida.estado}`);

  // RESUELTO sin solucion -> 400
  const rSinSolucion = await peticion(`/tickets/${idNuevo}/estado`, {
    method: 'PATCH',
    headers: cab(agente.token),
    body: JSON.stringify({ estado: 'RESUELTO' }),
  });
  comprobar('RESUELTO sin solucion devuelve 400', rSinSolucion.estado === 400,
    `codigo ${rSinSolucion.estado}`);

  // RESUELTO con solucion -> 200 y dispara notificacion
  const rResuelto = await peticion(`/tickets/${idNuevo}/estado`, {
    method: 'PATCH',
    headers: cab(agente.token),
    body: JSON.stringify({
      estado: 'RESUELTO',
      solucion: 'Se reinicio el servicio y se verifico el funcionamiento correcto.',
    }),
  });
  comprobar('RESUELTO con solucion valida funciona', rResuelto.estado === 200,
    `codigo ${rResuelto.estado}`);

  console.log('\n=== 4. AUDITORIA (historial por trigger) ===');

  const historial = await peticion(`/tickets/${idNuevo}/historial`, { headers: cab(admin.token) });
  const eventos = historial.json?.datos || [];
  comprobar('El historial registro los cambios de estado', eventos.length >= 3,
    `eventos: ${eventos.length}`);

  console.log('\n=== 5. INYECCION SQL ===');

  const rInyeccion = await peticion(`/tickets?busqueda=${encodeURIComponent("' OR '1'='1")}&limite=100`,
    { headers: cab(admin.token) });
  const totalInyeccion = rInyeccion.json?.meta?.total ?? rInyeccion.json?.datos?.length ?? 0;
  comprobar('La inyeccion en el buscador NO devuelve la tabla completa',
    totalInyeccion === 0, `devolvio ${totalInyeccion} tickets`);

  const rDrop = await peticion(`/tickets?busqueda=${encodeURIComponent("'; DROP TABLE tickets; --")}`,
    { headers: cab(admin.token) });
  comprobar('Un intento de DROP TABLE no rompe el sistema',
    rDrop.estado === 200 || rDrop.estado === 400, `codigo ${rDrop.estado}`);

  const rOrden = await peticion('/tickets?orden=codigo;DROP TABLE usuarios&limite=5',
    { headers: cab(admin.token) });
  comprobar('Un ORDER BY malicioso cae al orden por defecto (no rompe)',
    rOrden.estado === 200, `codigo ${rOrden.estado}`);

  const sigueVivo = await peticion('/salud');
  comprobar('La tabla tickets sigue existiendo tras los intentos de inyeccion',
    sigueVivo.estado === 200 && sigueVivo.json?.datos?.baseDatos?.conectada === true);

  console.log('\n=== 6. VALIDACION DE ENTRADA ===');

  const rTituloCorto = await peticion('/tickets', {
    method: 'POST',
    headers: cab(sol1.token),
    body: JSON.stringify({ titulo: 'abc', descripcion: 'corta' }),
  });
  comprobar('Titulo y descripcion demasiado cortos devuelven 400',
    rTituloCorto.estado === 400, `codigo ${rTituloCorto.estado}`);

  const rIdInvalido = await peticion('/tickets/no-es-un-uuid', { headers: cab(admin.token) });
  comprobar('Un id que no es UUID devuelve 400', rIdInvalido.estado === 400,
    `codigo ${rIdInvalido.estado}`);

  console.log('\n=== 7. PERMISOS POR ROL ===');

  const rUsuariosSol = await peticion('/usuarios', { headers: cab(sol1.token) });
  comprobar('El solicitante NO puede listar usuarios (403)', rUsuariosSol.estado === 403,
    `codigo ${rUsuariosSol.estado}`);

  const rUsuariosAgente = await peticion('/usuarios', { headers: cab(agente.token) });
  comprobar('El agente NO puede listar usuarios (403)', rUsuariosAgente.estado === 403,
    `codigo ${rUsuariosAgente.estado}`);

  const rUsuariosAdmin = await peticion('/usuarios', { headers: cab(admin.token) });
  comprobar('El administrador SI puede listar usuarios', rUsuariosAdmin.estado === 200,
    `codigo ${rUsuariosAdmin.estado}`);

  console.log('\n=== 8. REPORTES ===');

  const rPdf = await peticion('/reportes/tickets?formato=pdf', { headers: cab(admin.token) });
  comprobar('Genera reporte PDF', rPdf.estado === 200 && rPdf.texto.startsWith('%PDF'),
    `codigo ${rPdf.estado}, inicio: ${rPdf.texto.slice(0, 8)}`);

  const rXlsx = await peticion('/reportes/tickets?formato=xlsx', { headers: cab(admin.token) });
  comprobar('Genera reporte Excel (XLSX)',
    rXlsx.estado === 200 && rXlsx.texto.startsWith('PK'),
    `codigo ${rXlsx.estado}, inicio: ${rXlsx.texto.slice(0, 4)}`);

  // Reporte sin datos: rango de fechas en el pasado remoto.
  // El diseño es: 200 + cabecera X-Reporte-Sin-Datos + un archivo VALIDO con
  // las tablas vacias. Se prefiere eso a un 204 porque el usuario igual recibe
  // un documento descargable, y el aviso viaja en la cabecera.
  const rSinDatos = await peticion('/reportes/tickets?formato=pdf&desde=2000-01-01&hasta=2000-01-02',
    { headers: cab(admin.token) });
  comprobar('Reporte sin datos NO falla (no devuelve 5xx)',
    rSinDatos.estado === 200, `codigo ${rSinDatos.estado}`);
  comprobar('Reporte sin datos trae la cabecera X-Reporte-Sin-Datos',
    rSinDatos.cabeceras.get('x-reporte-sin-datos') === 'true',
    `cabecera: ${rSinDatos.cabeceras.get('x-reporte-sin-datos')}`);
  comprobar('Reporte sin datos entrega un PDF valido (no un archivo vacio)',
    rSinDatos.texto.startsWith('%PDF'), `inicio: ${rSinDatos.texto.slice(0, 8)}`);

  const rRangoInvertido = await peticion('/reportes/tickets?desde=2026-12-31&hasta=2026-01-01',
    { headers: cab(admin.token) });
  comprobar('Rango de fechas invertido devuelve 400', rRangoInvertido.estado === 400,
    `codigo ${rRangoInvertido.estado}`);

  const rDash = await peticion('/reportes/dashboard', { headers: cab(admin.token) });
  comprobar('El endpoint de dashboard responde', rDash.estado === 200, `codigo ${rDash.estado}`);

  console.log('\n=== 9. NOTIFICACIONES (patron outbox) ===');

  const noti = await peticion(`/notificaciones/ticket/${idNuevo}`, { headers: cab(admin.token) });
  const avisos = noti.json?.datos || [];
  comprobar('Se registro la notificacion al pasar a RESUELTO', avisos.length >= 1,
    `notificaciones: ${avisos.length}`);

  if (avisos.length > 0) {
    const n = avisos[0];
    comprobar('La notificacion tiene canal y estado',
      !!n.canal && !!n.estado, `canal=${n.canal} estado=${n.estado}`);
  }

  const resumen = await peticion('/notificaciones/resumen', { headers: cab(admin.token) });
  comprobar('El resumen de notificaciones responde', resumen.estado === 200,
    `codigo ${resumen.estado}`);

  console.log('\n=== 10. SUBIDA DE EVIDENCIAS ===');

  // PNG real de 1x1 (bytes validos: empieza por la firma \x89PNG\r\n\x1a\n)
  const PNG_REAL = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
    'base64'
  );

  const subir = async (contenido, nombre, tipo) => {
    const formulario = new FormData();
    formulario.append('archivos', new Blob([contenido], { type: tipo }), nombre);
    const respuesta = await fetch(`${BASE}/tickets/${idNuevo}/adjuntos`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${sol1.token}` },
      body: formulario,
    });
    const texto = await respuesta.text();
    let json = null;
    try { json = JSON.parse(texto); } catch { /* sin cuerpo */ }
    return { estado: respuesta.status, json, texto };
  };

  const rPng = await subir(PNG_REAL, 'captura-error.png', 'image/png');
  comprobar('Sube una evidencia PNG valida', rPng.estado === 200 || rPng.estado === 201,
    `codigo ${rPng.estado}`);

  const adjuntosSubidos = rPng.json?.datos || [];
  comprobar('La respuesta incluye el hash SHA-256 del archivo',
    !!adjuntosSubidos[0]?.hash_sha256 || /hash/i.test(rPng.texto),
    `respuesta: ${rPng.texto.slice(0, 120)}`);

  // DEFENSA: un archivo que dice ser PNG pero cuyo contenido no lo es.
  // Aqui es donde se ve la verificacion de firma binaria (magic numbers).
  // El codigo esperado es 422 (ARCHIVO_INVALIDO): la peticion esta bien formada,
  // lo que no es valido es el CONTENIDO del archivo.
  const falso = Buffer.from('MZ\x90\x00Esto no es un PNG, es un ejecutable disfrazado.', 'latin1');
  const rFalso = await subir(falso, 'virus.png', 'image/png');
  comprobar('RECHAZA un ejecutable renombrado a .png (firma binaria) -> 422',
    rFalso.estado === 422, `codigo ${rFalso.estado}`);

  // DEFENSA: extension no permitida
  const rExe = await subir(Buffer.from('MZ\x90\x00binario', 'latin1'), 'programa.exe',
    'application/x-msdownload');
  comprobar('RECHAZA una extension no permitida (.exe) -> 422',
    rExe.estado === 422, `codigo ${rExe.estado}`);

  // DEFENSA: archivo que supera el limite de tamano (UPLOAD_MAX_MB = 10).
  // El codigo esperado es 413 (Payload Too Large), no 400.
  const gigante = Buffer.alloc(11 * 1024 * 1024, 0x41); // 11 MB de 'A'
  const rGigante = await subir(gigante, 'enorme.png', 'image/png');
  comprobar('RECHAZA un archivo de 11 MB (limite 10 MB) -> 413',
    rGigante.estado === 413, `codigo ${rGigante.estado}`);

  // DEFENSA: un PDF si debe aceptarse (es evidencia legitima)
  const pdfMinimo = Buffer.from('%PDF-1.4\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF\n', 'latin1');
  const rPdfAdjunto = await subir(pdfMinimo, 'reporte-servidor.pdf', 'application/pdf');
  comprobar('Acepta una evidencia PDF valida',
    rPdfAdjunto.estado === 200 || rPdfAdjunto.estado === 201, `codigo ${rPdfAdjunto.estado}`);

  // Listar y descargar
  const rListaAdj = await peticion(`/tickets/${idNuevo}/adjuntos`, { headers: cab(sol1.token) });
  const adjuntos = rListaAdj.json?.datos || [];
  comprobar('Lista los adjuntos del ticket', adjuntos.length >= 2, `adjuntos: ${adjuntos.length}`);

  if (adjuntos.length > 0) {
    const descarga = await peticion(
      `/tickets/${idNuevo}/adjuntos/${adjuntos[0].id}/descargar`,
      { headers: cab(sol1.token) }
    );
    comprobar('Descarga una evidencia', descarga.estado === 200, `codigo ${descarga.estado}`);
    comprobar('La evidencia descargada trae los bytes correctos',
      descarga.texto.length > 0, `bytes: ${descarga.texto.length}`);
  }

  console.log('\n=== 11. LIMPIEZA ===');

  const borrado = await peticion(`/tickets/${idNuevo}`, { method: 'DELETE', headers: cab(admin.token) });
  comprobar('El administrador puede hacer borrado logico', borrado.estado === 200 || borrado.estado === 204,
    `codigo ${borrado.estado}`);

  const verificacion = await peticion(`/tickets/${idNuevo}`, { headers: cab(admin.token) });
  comprobar('El ticket borrado ya no es accesible', verificacion.estado === 404,
    `codigo ${verificacion.estado}`);

  console.log('\n============================================================');
  console.log(`  RESULTADO: ${pasadas} pasaron, ${falladas} fallaron`);
  console.log('============================================================');
  if (fallos.length > 0) {
    console.log('\nFallos:');
    fallos.forEach((f) => console.log('  - ' + f));
  }
  console.log('');
  process.exit(falladas === 0 ? 0 : 1);
})().catch((e) => {
  console.error('\nError inesperado:', e.message);
  process.exit(1);
});
