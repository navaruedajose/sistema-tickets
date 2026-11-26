'use strict';

/**
 * Pruebas unitarias del servicio de tickets.
 *
 * Estas pruebas NO tocan PostgreSQL ni Express. Se construye el servicio
 * inyectando dobles de prueba (objetos planos que implementan la misma
 * interfaz que los repositorios reales). Eso es exactamente el beneficio
 * practico del principio de Inversion de Dependencias: la logica de negocio
 * se prueba en milisegundos y de forma determinista.
 *
 * Ejecutar:  npm test
 */

const TicketService = require('../../src/modules/tickets/ticket.service');
const AppError = require('../../src/core/errors/AppError');

// ---------------------------------------------------------------------
// Dobles de prueba
// ---------------------------------------------------------------------
function crearDobles({ ticket = null } = {}) {
  const estadoActual = { valor: ticket ? ticket.estado : 'NUEVO' };

  const repositorioTickets = {
    buscarPorId: jest.fn(async () => (ticket ? { ...ticket, estado: estadoActual.valor } : null)),
    buscarBasicoPorId: jest.fn(async () => (ticket ? { ...ticket, estado: estadoActual.valor } : null)),
    cambiarEstado: jest.fn(async (id, { estado, solucion }) => {
      estadoActual.valor = estado;
      return { ...ticket, id, estado, solucion };
    }),
    asignarAgente: jest.fn(async (id, agenteId) => ({ ...ticket, id, agente_id: agenteId })),
    listar: jest.fn(async () => ({ elementos: [], total: 0 })),
    eliminarLogicamente: jest.fn(async () => true),
    contarPorEstado: jest.fn(async () => []),
    contarVencidos: jest.fn(async () => 0),
  };

  const repositorioUsuarios = {
    buscarPorId: jest.fn(async (id) => ({
      id,
      nombre_completo: 'Agente de Prueba',
      correo: 'agente@prueba.local',
      rol: 'AGENTE',
      activo: true,
    })),
  };

  const repositorioCategorias = {
    buscarPorId: jest.fn(async (id) => ({ id, nombre: 'Hardware', activo: true, sla_horas: 24 })),
  };

  const servicioNotificaciones = {
    notificarTicketCreado: jest.fn(async () => ({ enviada: true })),
    notificarTicketResuelto: jest.fn(async () => ({ enviada: true })),
    notificarTicketAsignado: jest.fn(async () => ({ enviada: true })),
  };

  return {
    repositorioTickets,
    repositorioUsuarios,
    repositorioCategorias,
    servicioNotificaciones,
    estadoActual,
  };
}

const ticketBase = {
  id: '11111111-1111-1111-1111-111111111111',
  codigo: 'TK-2026-000001',
  titulo: 'La impresora no funciona',
  descripcion: 'La impresora del piso 3 no responde desde esta manana.',
  estado: 'ABIERTO',
  prioridad: 'ALTA',
  solicitante_id: '22222222-2222-2222-2222-222222222222',
  agente_id: null,
  solicitante_correo: 'solicitante@prueba.local',
  solicitante_nombre: 'Solicitante de Prueba',
};

const usuarioSolicitante = {
  id: '22222222-2222-2222-2222-222222222222',
  rol: 'SOLICITANTE',
};

const usuarioAgente = {
  id: '33333333-3333-3333-3333-333333333333',
  rol: 'AGENTE',
};

const usuarioAdmin = {
  id: '44444444-4444-4444-4444-444444444444',
  rol: 'ADMINISTRADOR',
};

// ---------------------------------------------------------------------
// 1. Control de acceso a nivel de fila
// ---------------------------------------------------------------------
describe('TicketService - control de acceso', () => {
  test('un solicitante NO puede ver el ticket de otra persona (responde 404, no 403)', async () => {
    const dobles = crearDobles({ ticket: ticketBase });
    const servicio = new TicketService(dobles);

    const otroSolicitante = { id: '99999999-9999-9999-9999-999999999999', rol: 'SOLICITANTE' };

    await expect(servicio.obtenerTicket(ticketBase.id, otroSolicitante)).rejects.toThrow(AppError);
    await expect(servicio.obtenerTicket(ticketBase.id, otroSolicitante)).rejects.toMatchObject({
      estadoHttp: 404,
    });
  });

  test('el solicitante dueno SI puede ver su ticket', async () => {
    const dobles = crearDobles({ ticket: ticketBase });
    const servicio = new TicketService(dobles);

    const resultado = await servicio.obtenerTicket(ticketBase.id, usuarioSolicitante);
    expect(resultado.codigo).toBe('TK-2026-000001');
  });

  test('un agente puede ver cualquier ticket', async () => {
    const dobles = crearDobles({ ticket: ticketBase });
    const servicio = new TicketService(dobles);

    await expect(servicio.obtenerTicket(ticketBase.id, usuarioAgente)).resolves.toBeDefined();
  });
});

// ---------------------------------------------------------------------
// 2. Maquina de estados
// ---------------------------------------------------------------------
describe('TicketService - maquina de estados', () => {
  test('permite la transicion legal ABIERTO -> EN_PROGRESO', async () => {
    const dobles = crearDobles({ ticket: ticketBase });
    const servicio = new TicketService(dobles);

    const resultado = await servicio.cambiarEstado(
      ticketBase.id,
      { estado: 'EN_PROGRESO' },
      usuarioAgente
    );
    expect(resultado.estado).toBe('EN_PROGRESO');
  });

  test('rechaza la transicion ilegal ABIERTO -> CERRADO con HTTP 409', async () => {
    const dobles = crearDobles({ ticket: ticketBase });
    const servicio = new TicketService(dobles);

    await expect(
      servicio.cambiarEstado(ticketBase.id, { estado: 'CERRADO' }, usuarioAgente)
    ).rejects.toMatchObject({ estadoHttp: 409, codigo: 'CONFLICTO' });
  });

  test('rechaza resolver un ticket sin registrar la solucion', async () => {
    const dobles = crearDobles({ ticket: ticketBase });
    const servicio = new TicketService(dobles);

    await expect(
      servicio.cambiarEstado(ticketBase.id, { estado: 'RESUELTO' }, usuarioAgente)
    ).rejects.toMatchObject({ estadoHttp: 400 });
  });

  test('un solicitante NO puede marcar su ticket como RESUELTO', async () => {
    const dobles = crearDobles({ ticket: ticketBase });
    const servicio = new TicketService(dobles);

    await expect(
      servicio.cambiarEstado(
        ticketBase.id,
        { estado: 'RESUELTO', solucion: 'Lo reinicie y funciono sin problemas.' },
        usuarioSolicitante
      )
    ).rejects.toMatchObject({ estadoHttp: 403 });
  });

  test('un ticket CERRADO no admite mas cambios de estado', async () => {
    const dobles = crearDobles({ ticket: { ...ticketBase, estado: 'CERRADO' } });
    const servicio = new TicketService(dobles);

    await expect(
      servicio.cambiarEstado(ticketBase.id, { estado: 'ABIERTO' }, usuarioAgente)
    ).rejects.toMatchObject({ estadoHttp: 409 });
  });
});

// ---------------------------------------------------------------------
// 3. Efectos secundarios: notificaciones
// ---------------------------------------------------------------------
describe('TicketService - notificaciones', () => {
  test('al resolver un ticket se dispara la notificacion al solicitante', async () => {
    const dobles = crearDobles({ ticket: ticketBase });
    const servicio = new TicketService(dobles);

    await servicio.cambiarEstado(
      ticketBase.id,
      { estado: 'RESUELTO', solucion: 'Se reinstalaron los controladores de impresion.' },
      usuarioAgente
    );

    // La notificacion se despacha de forma asincrona: se le da un turno al
    // bucle de eventos para que la promesa se resuelva.
    await new Promise((resolver) => setImmediate(resolver));

    expect(dobles.servicioNotificaciones.notificarTicketResuelto).toHaveBeenCalledTimes(1);
  });

  test('un fallo del servicio de notificaciones NO rompe la operacion de negocio', async () => {
    const dobles = crearDobles({ ticket: ticketBase });
    dobles.servicioNotificaciones.notificarTicketResuelto = jest.fn(async () => {
      throw new Error('El servidor SMTP no responde');
    });

    const servicio = new TicketService(dobles);

    await expect(
      servicio.cambiarEstado(
        ticketBase.id,
        { estado: 'RESUELTO', solucion: 'Se aplico la actualizacion correspondiente.' },
        usuarioAgente
      )
    ).resolves.toMatchObject({ estado: 'RESUELTO' });
  });
});

// ---------------------------------------------------------------------
// 4. Asignacion de agentes
// ---------------------------------------------------------------------
describe('TicketService - asignacion de agentes', () => {
  test('un agente solo puede asignarse tickets a si mismo', async () => {
    const dobles = crearDobles({ ticket: ticketBase });
    const servicio = new TicketService(dobles);

    await expect(
      servicio.asignarAgente(
        ticketBase.id,
        { agenteId: '55555555-5555-5555-5555-555555555555' },
        usuarioAgente
      )
    ).rejects.toMatchObject({ estadoHttp: 403 });
  });

  test('un administrador puede asignar el ticket a cualquier agente', async () => {
    const dobles = crearDobles({ ticket: ticketBase });
    const servicio = new TicketService(dobles);

    const otroAgenteId = '55555555-5555-5555-5555-555555555555';
    const resultado = await servicio.asignarAgente(
      ticketBase.id,
      { agenteId: otroAgenteId },
      usuarioAdmin
    );

    expect(resultado.agente_id).toBe(otroAgenteId);
  });
});

// ---------------------------------------------------------------------
// 5. Estadisticas
// ---------------------------------------------------------------------
describe('TicketService - estadisticas', () => {
  test('calcula pendientes, resueltos y vencidos', async () => {
    const dobles = crearDobles({ ticket: ticketBase });
    dobles.repositorioTickets.contarPorEstado = jest.fn(async () => [
      { estado: 'NUEVO', total: 3 },
      { estado: 'EN_PROGRESO', total: 2 },
      { estado: 'RESUELTO', total: 10 },
      { estado: 'CERRADO', total: 5 },
    ]);
    dobles.repositorioTickets.contarVencidos = jest.fn(async () => 4);

    const servicio = new TicketService(dobles);
    const estadisticas = await servicio.obtenerEstadisticas(usuarioAdmin);

    expect(estadisticas.total).toBe(20);
    expect(estadisticas.pendientes).toBe(5);
    expect(estadisticas.resueltos).toBe(15);
    expect(estadisticas.vencidos).toBe(4);
  });
});
