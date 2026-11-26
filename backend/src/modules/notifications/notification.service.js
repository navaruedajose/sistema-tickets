'use strict';

/**
 * Servicio de notificaciones.
 *
 * Diseno clave: los proveedores (correo, SMS) se inyectan como una lista.
 * El servicio NO sabe que existe nodemailer ni Twilio; solo recorre la lista
 * y le pregunta a cada proveedor si sabe entregar el mensaje.
 *
 * Todo intento se persiste en la tabla `notificaciones` ANTES de intentar el
 * envio. Asi, si el proveedor externo esta caido, el mensaje queda en cola
 * con estado FALLIDO y puede reintentarse: la informacion no se pierde.
 */

const { CANALES } = require('../../config/constants');
const logger = require('../../utils/logger');

class NotificationService {
  /**
   * @param {object} dependencias
   * @param {import('./notification.repository')} dependencias.repositorioNotificaciones
   * @param {Array<{nombre:string, soporta:Function, enviar:Function}>} dependencias.proveedores
   */
  constructor({ repositorioNotificaciones, proveedores = [] }) {
    this.repositorio = repositorioNotificaciones;
    this.proveedores = proveedores;
  }

  /** Obtiene el proveedor capaz de entregar al destinatario por ese canal. */
  #proveedorPara(canal, destinatario) {
    const proveedor = this.proveedores.find(
      (candidato) => candidato.nombre === canal && candidato.soporta(destinatario)
    );

    if (!proveedor) {
      throw new Error(`No hay un proveedor configurado para el canal ${canal}.`);
    }
    return proveedor;
  }

  /**
   * Encola y envia una notificacion.
   * Nunca lanza excepcion hacia el llamador: una notificacion fallida no debe
   * tumbar la operacion de negocio que la origino (crear un ticket, por ej.).
   */
  async enviar({ canal, destinatario, asunto, mensaje, ticketId = null, usuarioId = null }) {
    if (!destinatario) {
      logger.advertencia('Notificacion omitida: el destinatario no tiene dato de contacto', {
        canal,
        ticketId,
      });
      return { encolada: false, motivo: 'SIN_DESTINATARIO' };
    }

    // 1. Persistir SIEMPRE primero (patron outbox).
    const registro = await this.repositorio.encolar({
      ticketId,
      usuarioId,
      canal,
      destinatario,
      asunto,
      mensaje,
    });

    // 2. Intentar el envio.
    try {
      const proveedor = this.#proveedorPara(canal, destinatario);
      const resultado = await proveedor.enviar({ destinatario, asunto, mensaje });

      await this.repositorio.marcarComoEnviada(registro.id);

      logger.info('Notificacion enviada', {
        canal,
        destinatario,
        referencia: resultado.referencia,
        modo: resultado.modo,
      });

      return { encolada: true, enviada: true, id: registro.id, referencia: resultado.referencia };
    } catch (error) {
      await this.repositorio.marcarComoFallida(registro.id, error.message);

      logger.advertencia('No se pudo enviar la notificacion; queda en cola para reintento', {
        canal,
        destinatario,
        error: error.message,
      });

      return { encolada: true, enviada: false, id: registro.id, error: error.message };
    }
  }

  // -------------------------------------------------------------------
  // Casos de uso concretos del dominio
  // -------------------------------------------------------------------

  /** Bienvenida al registrarse. */
  async notificarBienvenida(usuario) {
    return this.enviar({
      canal: CANALES.EMAIL,
      destinatario: usuario.correo,
      usuarioId: usuario.id,
      asunto: 'Bienvenido al Sistema de Tickets',
      mensaje: [
        `Hola ${usuario.nombre_completo},`,
        '',
        'Su cuenta ha sido creada correctamente.',
        'Ya puede iniciar sesion y registrar sus solicitudes de soporte.',
        '',
        'Si usted no solicito este registro, ignore este mensaje.',
      ].join('\n'),
    });
  }

  /** Confirmacion al crear un ticket: incluye folio y fecha limite de SLA. */
  async notificarTicketCreado(ticket) {
    const fechaLimite = ticket.fecha_limite_sla
      ? new Date(ticket.fecha_limite_sla).toLocaleString('es-MX')
      : 'por definir';

    return this.enviar({
      canal: CANALES.EMAIL,
      destinatario: ticket.solicitante_correo,
      ticketId: ticket.id,
      usuarioId: ticket.solicitante_id,
      asunto: `[${ticket.codigo}] Ticket registrado: ${ticket.titulo}`,
      mensaje: [
        `Hola ${ticket.solicitante_nombre},`,
        '',
        'Su solicitud fue registrada con los siguientes datos:',
        `  Folio:        ${ticket.codigo}`,
        `  Titulo:       ${ticket.titulo}`,
        `  Categoria:    ${ticket.categoria_nombre || 'Sin categoria'}`,
        `  Prioridad:    ${ticket.prioridad}`,
        `  Estado:       ${ticket.estado}`,
        `  Fecha limite: ${fechaLimite}`,
        '',
        'Puede consultar el avance de su ticket en cualquier momento desde la plataforma.',
      ].join('\n'),
    });
  }

  /**
   * Aviso de resolucion. Requisito 4 del proyecto: notificacion automatica
   * cuando el ticket cambia a estado RESUELTO.
   * Se envia por correo y, si el usuario registro telefono, tambien por SMS.
   */
  async notificarTicketResuelto(ticket, observacion = null) {
    const mensaje = [
      `Hola ${ticket.solicitante_nombre},`,
      '',
      `Su ticket ${ticket.codigo} ha sido marcado como RESUELTO.`,
      '',
      `Titulo: ${ticket.titulo}`,
      ticket.solucion ? `Solucion aplicada:\n${ticket.solucion}` : '',
      observacion ? `Observaciones: ${observacion}` : '',
      '',
      'Si el problema persiste, puede reabrir el ticket desde la plataforma dentro de los proximos 7 dias.',
      '',
      'Le invitamos a calificar la atencion recibida.',
    ]
      .filter(Boolean)
      .join('\n');

    const envios = [
      this.enviar({
        canal: CANALES.EMAIL,
        destinatario: ticket.solicitante_correo,
        ticketId: ticket.id,
        usuarioId: ticket.solicitante_id,
        asunto: `[${ticket.codigo}] Su ticket ha sido resuelto`,
        mensaje,
      }),
    ];

    // El SMS es opcional: si el usuario no tiene telefono, se omite sin error.
    if (ticket.solicitante_telefono) {
      envios.push(
        this.enviar({
          canal: CANALES.SMS,
          destinatario: ticket.solicitante_telefono,
          ticketId: ticket.id,
          usuarioId: ticket.solicitante_id,
          asunto: 'Ticket resuelto',
          mensaje: `Su ticket ${ticket.codigo} fue resuelto. Ingrese a la plataforma para mas detalles.`,
        })
      );
    }

    return Promise.all(envios);
  }

  /** Aviso al agente cuando se le asigna un ticket. */
  async notificarTicketAsignado(ticket) {
    if (!ticket.agente_correo) return { encolada: false, motivo: 'SIN_AGENTE' };

    return this.enviar({
      canal: CANALES.EMAIL,
      destinatario: ticket.agente_correo,
      ticketId: ticket.id,
      usuarioId: ticket.agente_id,
      asunto: `[${ticket.codigo}] Ticket asignado a su bandeja`,
      mensaje: [
        `Hola ${ticket.agente_nombre},`,
        '',
        'Se le ha asignado el siguiente ticket:',
        `  Folio:      ${ticket.codigo}`,
        `  Titulo:     ${ticket.titulo}`,
        `  Prioridad:  ${ticket.prioridad}`,
        `  Solicitante:${ticket.solicitante_nombre}`,
        '',
        'Ingrese a la plataforma para atenderlo.',
      ].join('\n'),
    });
  }

  /** Aviso de nuevo comentario publico en el ticket. */
  async notificarNuevoComentario(ticket, comentario) {
    return this.enviar({
      canal: CANALES.EMAIL,
      destinatario: ticket.solicitante_correo,
      ticketId: ticket.id,
      usuarioId: ticket.solicitante_id,
      asunto: `[${ticket.codigo}] Nuevo comentario en su ticket`,
      mensaje: [
        `Hola ${ticket.solicitante_nombre},`,
        '',
        `Se agrego un nuevo comentario a su ticket ${ticket.codigo}:`,
        '',
        comentario.contenido,
        '',
        `Autor: ${comentario.autor_nombre}`,
      ].join('\n'),
    });
  }

  /**
   * Reintenta las notificaciones que quedaron pendientes o fallidas.
   * Se puede invocar desde un cron o desde un endpoint administrativo.
   */
  async reintentarPendientes(maximoIntentos = 3) {
    const pendientes = await this.repositorio.listarPendientesDeReintento(maximoIntentos);
    const resultados = { intentadas: pendientes.length, enviadas: 0, fallidas: 0 };

    for (const pendiente of pendientes) {
      try {
        const proveedor = this.#proveedorPara(pendiente.canal, pendiente.destinatario);
        await proveedor.enviar({
          destinatario: pendiente.destinatario,
          asunto: pendiente.asunto,
          mensaje: pendiente.mensaje,
        });
        await this.repositorio.marcarComoEnviada(pendiente.id);
        resultados.enviadas += 1;
      } catch (error) {
        await this.repositorio.marcarComoFallida(pendiente.id, error.message);
        resultados.fallidas += 1;
      }
    }

    logger.info('Reintento de notificaciones finalizado', resultados);
    return resultados;
  }
}

module.exports = NotificationService;
