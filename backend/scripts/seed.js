'use strict';

/**
 * Semillero de datos de demostracion.
 *
 * Ejecucion:
 *   docker compose exec backend npm run db:seed
 *   (o)  npm run db:seed
 *
 * Crea usuarios con contrasenas hasheadas con bcrypt (imposible de hacer en
 * SQL puro) y un conjunto de tickets realistas para que la demostracion y
 * los reportes tengan contenido desde el primer minuto.
 *
 * Es idempotente: si los datos ya existen, no los duplica.
 */

const bcrypt = require('bcryptjs');
const db = require('../src/config/database');
const logger = require('../src/utils/logger');

const CONTRASENA_DEMO = 'Demo2026#Tickets';

const USUARIOS_DEMO = [
  { nombre: 'Ana Torres Rivera', correo: 'admin@sistema-tickets.local', rol: 'ADMINISTRADOR', departamento: 'Direccion de TI', telefono: '+525511112222' },
  { nombre: 'Carlos Mendez Lopez', correo: 'agente1@sistema-tickets.local', rol: 'AGENTE', departamento: 'Soporte Tecnico', telefono: '+525533334444' },
  { nombre: 'Lucia Fernandez Soto', correo: 'agente2@sistema-tickets.local', rol: 'AGENTE', departamento: 'Infraestructura', telefono: '+525555556666' },
  { nombre: 'Miguel Angel Rojas', correo: 'usuario1@sistema-tickets.local', rol: 'SOLICITANTE', departamento: 'Recursos Humanos', telefono: '+525577778888' },
  { nombre: 'Sofia Ramirez Diaz', correo: 'usuario2@sistema-tickets.local', rol: 'SOLICITANTE', departamento: 'Contabilidad', telefono: '+525599990000' },
  { nombre: 'Jorge Villalobos Cruz', correo: 'usuario3@sistema-tickets.local', rol: 'SOLICITANTE', departamento: 'Ventas', telefono: null },
];

/** Tickets de ejemplo: [titulo, descripcion, categoria, prioridad, estado, solicitante, agente, solucion] */
const TICKETS_DEMO = [
  ['La impresora del piso 3 no imprime', 'Desde esta manana la impresora HP LaserJet del piso 3 aparece sin conexion y los trabajos quedan en cola.', 'Hardware', 'ALTA', 'RESUELTO', 4, 2, 'Se reemplazo el cable de red danado y se reinstalaron los controladores de impresion.'],
  ['No puedo acceder al sistema de nominas', 'Al intentar entrar al portal de nominas aparece el mensaje "usuario no autorizado" desde el cambio de contrasena.', 'Accesos y Cuentas', 'CRITICA', 'EN_PROGRESO', 4, 2, null],
  ['Excel se cierra inesperadamente', 'Al abrir archivos con macros, Excel se cierra sin aviso. Ocurre con varios archivos distintos.', 'Software', 'MEDIA', 'ABIERTO', 5, 3, null],
  ['El wifi de la sala de juntas es muy lento', 'Durante las videollamadas la conexion se corta constantemente. Afecta las reuniones con clientes.', 'Red e Internet', 'ALTA', 'EN_PROGRESO', 5, 3, null],
  ['Solicito laptop adicional para nuevo ingreso', 'Ingresa un analista el proximo lunes y requiere equipo con 16 GB de RAM y Office instalado.', 'Solicitud de Servicio', 'BAJA', 'NUEVO', 6, null, null],
  ['La VPN se desconecta cada 10 minutos', 'Trabajando desde casa la VPN se cae de forma intermitente y pierdo el avance de mis tareas.', 'Red e Internet', 'CRITICA', 'RESUELTO', 6, 3, 'Se ajusto el tiempo de renegociacion de llaves en el concentrador VPN y se actualizo el cliente.'],
  ['Error al generar la factura mensual', 'El sistema arroja "error 500" al generar la factura del periodo. Urge antes del cierre contable.', 'Base de Datos', 'CRITICA', 'CERRADO', 5, 2, 'Se detecto un indice faltante en la tabla de movimientos; se creo el indice y se optimizo la consulta.'],
  ['Buzon de correo lleno', 'No puedo recibir correos porque mi buzon alcanzo el limite de almacenamiento.', 'Correo Electronico', 'MEDIA', 'RESUELTO', 6, 2, 'Se amplio la cuota a 50 GB y se archivo el correo anterior a 2024.'],
  ['Pantalla con lineas verticales', 'El monitor presenta lineas verticales intermitentes que dificultan el trabajo.', 'Hardware', 'MEDIA', 'EN_ESPERA', 4, 3, null],
  ['Instalacion de software de diseno', 'Requiero autorizacion e instalacion de un paquete de diseno grafico para material promocional.', 'Solicitud de Servicio', 'BAJA', 'ABIERTO', 5, 3, null],
  ['El sistema de tickets no envia correos', 'Los usuarios reportan que no llegan las notificaciones de cambios de estado.', 'Software', 'ALTA', 'NUEVO', 6, null, null],
  ['Recuperar archivos de carpeta compartida', 'Se eliminaron por error archivos de la carpeta de proyectos; necesito recuperar la version anterior.', 'Base de Datos', 'ALTA', 'RESUELTO', 4, 2, 'Se restauro el respaldo incremental del dia anterior.'],
];

async function sembrar() {
  logger.info('Iniciando semillero de datos de demostracion');

  // --- 1. Usuarios ---
  const hash = await bcrypt.hash(CONTRASENA_DEMO, 12);
  const idsUsuarios = {};

  for (const usuario of USUARIOS_DEMO) {
    const { rows } = await db.consultar(
      `INSERT INTO usuarios (nombre_completo, correo, contrasena_hash, rol, departamento, telefono)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (correo) DO UPDATE
         SET nombre_completo = EXCLUDED.nombre_completo,
             rol             = EXCLUDED.rol,
             departamento    = EXCLUDED.departamento
       RETURNING id, correo`,
      [usuario.nombre, usuario.correo, hash, usuario.rol, usuario.departamento, usuario.telefono]
    );
    idsUsuarios[usuario.correo] = rows[0].id;
    logger.info('Usuario asegurado', { correo: rows[0].correo, rol: usuario.rol });
  }

  const idSolicitantes = USUARIOS_DEMO.filter((u) => u.rol === 'SOLICITANTE').map((u) => idsUsuarios[u.correo]);
  const idAgentes = USUARIOS_DEMO.filter((u) => u.rol === 'AGENTE').map((u) => idsUsuarios[u.correo]);

  // --- 2. Categorias ---
  const { rows: categorias } = await db.consultar(`SELECT id, nombre FROM categorias`);
  const idCategoriaPorNombre = Object.fromEntries(categorias.map((c) => [c.nombre, c.id]));

  // --- 3. Tickets ---
  let ticketsCreados = 0;

  for (const definicion of TICKETS_DEMO) {
    const [titulo, descripcion, categoria, prioridad, estado, indiceSolicitante, indiceAgente, solucion] = definicion;

    // Evita duplicados si el semillero se ejecuta mas de una vez.
    const { rows: existente } = await db.consultar(
      `SELECT id FROM tickets WHERE titulo = $1 LIMIT 1`,
      [titulo]
    );
    if (existente.length > 0) continue;

    const solicitanteId = idSolicitantes[indiceSolicitante - 4] || idSolicitantes[0];
    const agenteId = indiceAgente ? idAgentes[indiceAgente - 2] : null;

    const { rows } = await db.consultar(
      `INSERT INTO tickets
         (titulo, descripcion, categoria_id, prioridad, estado,
          solicitante_id, agente_id, solucion, fecha_resolucion, fecha_cierre, creado_en)
       VALUES ($1, $2, $3, $4, $5::estado_ticket, $6, $7, $8,
               CASE WHEN $5::estado_ticket IN ('RESUELTO','CERRADO') THEN NOW() - INTERVAL '2 hours' ELSE NULL END,
               CASE WHEN $5::estado_ticket = 'CERRADO' THEN NOW() - INTERVAL '1 hour' ELSE NULL END,
               NOW() - (INTERVAL '1 day' * (RANDOM() * 25)::INTEGER))
       RETURNING id, codigo`,
      [
        titulo,
        descripcion,
        idCategoriaPorNombre[categoria] || null,
        prioridad,
        estado,
        solicitanteId,
        agenteId,
        solucion,
      ]
    );

    // Comentarios de ejemplo para dar contexto al ticket.
    await db.consultar(
      `INSERT INTO comentarios (ticket_id, autor_id, contenido, es_interno)
       VALUES ($1, $2, $3, FALSE)`,
      [rows[0].id, solicitanteId, 'Adjunto captura del error para mayor detalle.']
    );

    if (agenteId) {
      await db.consultar(
        `INSERT INTO comentarios (ticket_id, autor_id, contenido, es_interno)
         VALUES ($1, $2, $3, FALSE)`,
        [rows[0].id, agenteId, 'Recibido. Estoy revisando el caso y le informare el avance a la brevedad.']
      );
      await db.consultar(
        `INSERT INTO comentarios (ticket_id, autor_id, contenido, es_interno)
         VALUES ($1, $2, $3, TRUE)`,
        [rows[0].id, agenteId, 'Nota interna: revisar inventario antes de confirmar el diagnostico.']
      );
    }

    ticketsCreados += 1;
  }

  logger.info('Semillero finalizado', {
    usuarios: USUARIOS_DEMO.length,
    categorias: categorias.length,
    ticketsNuevos: ticketsCreados,
  });

  console.log('\n============================================================');
  console.log(' DATOS DE DEMOSTRACION CARGADOS CORRECTAMENTE');
  console.log('============================================================');
  console.log(` Contrasena para TODAS las cuentas: ${CONTRASENA_DEMO}\n`);
  console.log(' Administrador: admin@sistema-tickets.local');
  console.log(' Agente 1:      agente1@sistema-tickets.local');
  console.log(' Agente 2:      agente2@sistema-tickets.local');
  console.log(' Solicitante 1: usuario1@sistema-tickets.local');
  console.log(' Solicitante 2: usuario2@sistema-tickets.local');
  console.log(' Solicitante 3: usuario3@sistema-tickets.local');
  console.log('============================================================\n');
}

sembrar()
  .then(async () => {
    await db.cerrar();
    process.exit(0);
  })
  .catch(async (error) => {
    logger.error('Error en el semillero', { mensaje: error.message, pila: error.stack });
    await db.cerrar().catch(() => undefined);
    process.exit(1);
  });
