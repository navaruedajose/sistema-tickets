'use strict';

/**
 * Servicio de tickets: nucleo de las reglas de negocio.
 *
 * Aqui vive todo lo que un "cliente toxico" intentaria romper:
 *  - quien puede ver que tickets (control de acceso a nivel de fila),
 *  - que transiciones de estado son legales (maquina de estados),
 *  - que pasa cuando se resuelve un ticket (notificacion + auditoria).
 *
 * Los colaboradores llegan por constructor (Inversion de Dependencias), por
 * lo que este servicio es testeable sin base de datos.
 */

const AppError = require('../../core/errors/AppError');
const {
  ROLES,
  ESTADOS_TICKET,
  transicionEsValida,
} = require('../../config/constants');
const {
  normalizarPaginacion,
  validarOrdenamiento,
  validarDireccion,
  escaparComodines,
} = require('../../utils/pagination');

const COLUMNAS_ORDENABLES = [
  'creado_en',
  'actualizado_en',
  'prioridad',
  'estado',
  'fecha_limite_sla',
];

class TicketService {
  /**
   * @param {object} dependencias
   * @param {import('./ticket.repository')} dependencias.repositorioTickets
   * @param {import('../users/user.repository')} dependencias.repositorioUsuarios
   * @param {import('../categories/category.repository')} dependencias.repositorioCategorias
   * @param {import('../notifications/notification.service')} [dependencias.servicioNotificaciones]
   */
  constructor({
    repositorioTickets,
    repositorioUsuarios,
    repositorioCategorias,
    servicioNotificaciones = null,
  }) {
    this.repositorio = repositorioTickets;
    this.repositorioUsuarios = repositorioUsuarios;
    this.repositorioCategorias = repositorioCategorias;
    this.servicioNotificaciones = servicioNotificaciones;
  }

  /**
   * Calcula el alcance de visibilidad del usuario.
   * Devuelve null cuando el usuario puede ver todo (agente/administrador).
   * Este es el punto UNICO donde se decide el control de acceso a datos.
   */
  static calcularAlcance(usuario) {
    if (usuario.rol === ROLES.ADMINISTRADOR || usuario.rol === ROLES.AGENTE) return null;
    return { usuarioId: usuario.id };
  }

  /** Crea un ticket. */
  async crearTicket(datos, usuarioSolicitante) {
    const esGestor = [ROLES.AGENTE, ROLES.ADMINISTRADOR].includes(usuarioSolicitante.rol);

    // Un solicitante solo puede crear tickets para si mismo. Si intenta
    // enviar otro solicitanteId, se ignora silenciosamente: no se confia en
    // datos de identidad enviados por el cliente.
    const solicitanteId = esGestor && datos.solicitanteId ? datos.solicitanteId : usuarioSolicitante.id;

    if (solicitanteId !== usuarioSolicitante.id) {
      const solicitante = await this.repositorioUsuarios.buscarPorId(solicitanteId);
      if (!solicitante) throw AppError.solicitudInvalida('El solicitante indicado no existe.');
    }

    if (datos.categoriaId) {
      const categoria = await this.repositorioCategorias.buscarPorId(datos.categoriaId);
      if (!categoria) throw AppError.solicitudInvalida('La categoria indicada no existe.');
      if (!categoria.activo) throw AppError.solicitudInvalida('La categoria indicada esta desactivada.');
    }

    if (datos.agenteId) {
      if (!esGestor) {
        throw AppError.prohibido('Solo un agente o administrador puede asignar un responsable.');
      }
      const agente = await this.repositorioUsuarios.buscarPorId(datos.agenteId);
      if (!agente) throw AppError.solicitudInvalida('El agente indicado no existe.');
      if (![ROLES.AGENTE, ROLES.ADMINISTRADOR].includes(agente.rol)) {
        throw AppError.solicitudInvalida('El usuario indicado no tiene rol de agente.');
      }
    }

    const ticket = await this.repositorio.crear({
      ...datos,
      solicitanteId,
      agenteId: esGestor ? datos.agenteId : null,
    });

    // La notificacion se dispara SIN await: si el servidor SMTP esta caido,
    // la creacion del ticket igual responde 201. El fallo queda registrado
    // en la tabla `notificaciones` para reintento posterior.
    this.#notificarSinBloquear(() => this.servicioNotificaciones?.notificarTicketCreado(ticket));

    return ticket;
  }

  /** Obtiene un ticket aplicando control de acceso a nivel de fila. */
  async obtenerTicket(id, usuario) {
    const ticket = await this.repositorio.buscarPorId(id);
    if (!ticket) throw AppError.noEncontrado('El ticket');

    if (!this.puedeVerTicket(ticket, usuario)) {
      // Se responde 404 (no 403) para no revelar la existencia de tickets ajenos.
      throw AppError.noEncontrado('El ticket');
    }
    return ticket;
  }

  /** Regla de visibilidad de un ticket concreto. */
  puedeVerTicket(ticket, usuario) {
    if (usuario.rol === ROLES.ADMINISTRADOR || usuario.rol === ROLES.AGENTE) return true;
    return ticket.solicitante_id === usuario.id || ticket.agente_id === usuario.id;
  }

  /** Regla de edicion: el solicitante dueno, el agente asignado o un admin. */
  puedeEditarTicket(ticket, usuario) {
    if (usuario.rol === ROLES.ADMINISTRADOR) return true;
    if (usuario.rol === ROLES.AGENTE) return true;
    return ticket.solicitante_id === usuario.id;
  }

  /** Listado paginado con filtros y alcance. */
  async listarTickets(consulta, usuario) {
    const { pagina, limite, desplazamiento } = normalizarPaginacion(consulta);
    const alcance = TicketService.calcularAlcance(usuario);

    const ordenarPor = validarOrdenamiento(consulta.ordenarPor, COLUMNAS_ORDENABLES, 'creado_en');
    const direccion = validarDireccion(consulta.direccion);

    const filtros = {
      estado: consulta.estado,
      prioridad: consulta.prioridad,
      categoriaId: consulta.categoriaId,
      agenteId: consulta.agenteId,
      solicitanteId: consulta.solicitanteId,
      desde: consulta.desde,
      hasta: consulta.hasta,
      soloVencidos: consulta.soloVencidos,
      busqueda: consulta.busqueda ? escaparComodines(consulta.busqueda) : null,
    };

    // Un solicitante no puede espiar los tickets de otro cambiando el filtro.
    if (alcance) delete filtros.solicitanteId;

    const { elementos, total } = await this.repositorio.listar({
      desplazamiento,
      limite,
      filtros,
      alcance,
      ordenarPor,
      direccion,
    });

    return { elementos, paginacion: { pagina, limite, total } };
  }

  /** Actualiza campos descriptivos. */
  async actualizarTicket(id, cambios, usuario) {
    const ticket = await this.obtenerTicket(id, usuario);

    if (!this.puedeEditarTicket(ticket, usuario)) {
      throw AppError.prohibido('No tiene permisos para modificar este ticket.');
    }

    // Regla de negocio: un ticket ya cerrado o cancelado es inmutable.
    // Esto es exactamente lo que impide que un cliente altere evidencia
    // historica despues del cierre.
    if ([ESTADOS_TICKET.CERRADO, ESTADOS_TICKET.CANCELADO].includes(ticket.estado)) {
      throw AppError.conflicto(
        `El ticket esta en estado ${ticket.estado} y ya no admite modificaciones.`
      );
    }

    if (cambios.categoriaId) {
      const categoria = await this.repositorioCategorias.buscarPorId(cambios.categoriaId);
      if (!categoria || !categoria.activo) {
        throw AppError.solicitudInvalida('La categoria indicada no existe o esta desactivada.');
      }
    }

    return this.repositorio.actualizar(id, cambios);
  }

  /**
   * Cambia el estado validando la maquina de transiciones.
   * Es el corazon de la defensa contra acciones maliciosas: no importa
   * cuantas veces se llame al endpoint, el grafo de estados no permite
   * dejar el ticket en una situacion incoherente.
   */
  async cambiarEstado(id, { estado, solucion, observacion }, usuario) {
    const ticket = await this.obtenerTicket(id, usuario);

    // Un solicitante solo puede cerrar o reabrir su propio ticket;
    // no puede marcar "RESUELTO" (eso es atribucion del agente).
    const esGestor = [ROLES.ADMINISTRADOR, ROLES.AGENTE].includes(usuario.rol);
    const estadosReservadosAgente = [ESTADOS_TICKET.RESUELTO, ESTADOS_TICKET.EN_PROGRESO, ESTADOS_TICKET.EN_ESPERA];

    if (!esGestor && estadosReservadosAgente.includes(estado)) {
      throw AppError.prohibido(
        'Solo un agente o administrador puede mover el ticket a ese estado.'
      );
    }

    if (!transicionEsValida(ticket.estado, estado)) {
      throw AppError.conflicto(
        `Transicion no permitida: no es posible pasar de ${ticket.estado} a ${estado}.`
      );
    }

    if (estado === ESTADOS_TICKET.RESUELTO && (!solucion || solucion.trim().length < 10)) {
      throw AppError.solicitudInvalida(
        'Para marcar un ticket como RESUELTO debe registrar una solucion de al menos 10 caracteres.'
      );
    }

    const actualizado = await this.repositorio.cambiarEstado(id, { estado, solucion });

    // Notificacion al solicitante cuando el ticket se resuelve (requisito 4).
    if (estado === ESTADOS_TICKET.RESUELTO) {
      this.#notificarSinBloquear(() =>
        this.servicioNotificaciones?.notificarTicketResuelto(actualizado, observacion)
      );
    }

    return actualizado;
  }

  /** Asigna el agente responsable. */
  async asignarAgente(id, { agenteId }, usuario) {
    const ticket = await this.obtenerTicket(id, usuario);

    if (usuario.rol === ROLES.AGENTE && agenteId && agenteId !== usuario.id) {
      throw AppError.prohibido('Un agente solo puede asignarse tickets a si mismo.');
    }

    if (agenteId) {
      const agente = await this.repositorioUsuarios.buscarPorId(agenteId);
      if (!agente) throw AppError.solicitudInvalida('El agente indicado no existe.');
      if (!agente.activo) throw AppError.solicitudInvalida('El agente indicado esta desactivado.');
      if (![ROLES.AGENTE, ROLES.ADMINISTRADOR].includes(agente.rol)) {
        throw AppError.solicitudInvalida('El usuario indicado no tiene rol de agente.');
      }
    }

    const actualizado = await this.repositorio.asignarAgente(id, agenteId);

    if (agenteId && agenteId !== ticket.agente_id) {
      this.#notificarSinBloquear(() =>
        this.servicioNotificaciones?.notificarTicketAsignado(actualizado)
      );
    }

    return actualizado;
  }

  /** Elimina logicamente. Solo administradores y el dueno del ticket. */
  async eliminarTicket(id, usuario) {
    const ticket = await this.obtenerTicket(id, usuario);

    if (usuario.rol !== ROLES.ADMINISTRADOR && ticket.solicitante_id !== usuario.id) {
      throw AppError.prohibido('Solo el solicitante original o un administrador puede eliminar el ticket.');
    }
    if (usuario.rol === ROLES.SOLICITANTE && ticket.estado === ESTADOS_TICKET.EN_PROGRESO) {
      throw AppError.conflicto('No puede eliminar un ticket que esta siendo atendido.');
    }

    return this.repositorio.eliminarLogicamente(id);
  }

  /** Historial de estados. */
  async obtenerHistorial(id, usuario) {
    await this.obtenerTicket(id, usuario);
    return this.repositorio.obtenerHistorial(id);
  }

  /** Metricas para el dashboard. */
  async obtenerEstadisticas(usuario) {
    const alcance = TicketService.calcularAlcance(usuario);

    const [porEstado, vencidos] = await Promise.all([
      this.repositorio.contarPorEstado(alcance),
      this.repositorio.contarVencidos(alcance),
    ]);

    const total = porEstado.reduce((acumulado, fila) => acumulado + fila.total, 0);
    const mapa = Object.fromEntries(porEstado.map((fila) => [fila.estado, fila.total]));

    return {
      total,
      porEstado: mapa,
      pendientes:
        (mapa.NUEVO || 0) + (mapa.ABIERTO || 0) + (mapa.EN_PROGRESO || 0) + (mapa.EN_ESPERA || 0),
      resueltos: (mapa.RESUELTO || 0) + (mapa.CERRADO || 0),
      vencidos,
      generadoEn: new Date().toISOString(),
    };
  }

  /**
   * Ejecuta una tarea asincrona sin bloquear la respuesta HTTP y sin que un
   * fallo se propague como unhandled rejection.
   */
  #notificarSinBloquear(tarea) {
    Promise.resolve()
      .then(tarea)
      .catch((error) => {
        require('../../utils/logger').advertencia('Fallo al despachar notificacion', {
          mensaje: error.message,
        });
      });
  }
}

module.exports = TicketService;
