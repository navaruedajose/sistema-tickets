/**
 * Catalogo de servicios de la API.
 *
 * Cada funcion corresponde a un endpoint del backend. Las paginas nunca
 * escriben rutas a mano: llaman a `servicios.tickets.listar(...)`. Eso hace
 * que un cambio de version de la API se resuelva en este archivo y en ningun
 * otro. Es DRY aplicado a la comunicacion con el servidor.
 */

import cliente from './cliente';

// =====================================================================
// Autenticacion
// =====================================================================
export const serviciosAutenticacion = {
  iniciarSesion: (credenciales) => cliente.crear('/auth/iniciar-sesion', credenciales),

  registrar: (datos) => cliente.crear('/auth/registro', datos),

  /** Alta de agente o administrador. Requiere ser administrador. */
  registrarUsuarioInterno: (datos) => cliente.crear('/auth/usuarios', datos),

  refrescar: (tokenRefresco) => cliente.crear('/auth/refrescar', { tokenRefresco }),

  cerrarSesion: (tokenRefresco) => cliente.crear('/auth/cerrar-sesion', { tokenRefresco }),

  cerrarTodasLasSesiones: () => cliente.crear('/auth/cerrar-todas-las-sesiones'),

  perfil: () => cliente.obtener('/auth/perfil'),
};

// =====================================================================
// Tickets
// =====================================================================
export const serviciosTickets = {
  listar: (filtros) => cliente.obtener('/tickets', filtros),

  obtener: (id) => cliente.obtener(`/tickets/${id}`),

  crear: (datos) => cliente.crear('/tickets', datos),

  actualizar: (id, cambios) => cliente.actualizar(`/tickets/${id}`, cambios),

  cambiarEstado: (id, datos) => cliente.actualizar(`/tickets/${id}/estado`, datos),

  asignarAgente: (id, datos) => cliente.actualizar(`/tickets/${id}/agente`, datos),

  historial: (id) => cliente.obtener(`/tickets/${id}/historial`),

  estadisticas: () => cliente.obtener('/tickets/estadisticas'),

  eliminar: (id) => cliente.eliminar(`/tickets/${id}`),
};

// =====================================================================
// Comentarios
// =====================================================================
export const serviciosComentarios = {
  listar: (ticketId) => cliente.obtener(`/tickets/${ticketId}/comentarios`),

  crear: (ticketId, datos) => cliente.crear(`/tickets/${ticketId}/comentarios`, datos),

  eliminar: (ticketId, comentarioId) =>
    cliente.eliminar(`/tickets/${ticketId}/comentarios/${comentarioId}`),
};

// =====================================================================
// Adjuntos (evidencias)
// =====================================================================
export const serviciosAdjuntos = {
  listar: (ticketId) => cliente.obtener(`/tickets/${ticketId}/adjuntos`),

  /** @param {File[]} archivos */
  subir: (ticketId, archivos) =>
    cliente.subirArchivos(`/tickets/${ticketId}/adjuntos`, archivos, 'archivos'),

  eliminar: (ticketId, adjuntoId) =>
    cliente.eliminar(`/tickets/${ticketId}/adjuntos/${adjuntoId}`),

  /**
   * Descarga una evidencia.
   * Se usa fetch con el token en la cabecera en lugar de un <a href> porque
   * el endpoint esta protegido: un enlace directo no enviaria el JWT.
   */
  async descargar(ticketId, adjunto) {
    const respuesta = await cliente.descargarArchivo(
      `/tickets/${ticketId}/adjuntos/${adjunto.id}/descargar`,
      {},
      adjunto.nombre_original
    );
    return respuesta;
  },
};

// =====================================================================
// Usuarios
// =====================================================================
export const serviciosUsuarios = {
  listar: (filtros) => cliente.obtener('/usuarios', filtros),

  obtener: (id) => cliente.obtener(`/usuarios/${id}`),

  actualizar: (id, cambios) => cliente.actualizar(`/usuarios/${id}`, cambios),

  desactivar: (id) => cliente.eliminar(`/usuarios/${id}`),

  cambiarContrasena: (datos) => cliente.actualizar('/usuarios/contrasena', datos),

  /** Agentes ordenados por carga de trabajo (para asignacion inteligente). */
  agentes: () => cliente.obtener('/usuarios/agentes'),
};

// =====================================================================
// Categorias
// =====================================================================
export const serviciosCategorias = {
  listar: (soloActivas = false) => cliente.obtener('/categorias', { soloActivas }),

  crear: (datos) => cliente.crear('/categorias', datos),

  actualizar: (id, cambios) => cliente.actualizar(`/categorias/${id}`, cambios),

  eliminar: (id) => cliente.eliminar(`/categorias/${id}`),
};

// =====================================================================
// Reportes
// =====================================================================
export const serviciosReportes = {
  /** Datos JSON del panel de indicadores. */
  panel: (filtros) => cliente.obtener('/reportes/dashboard', filtros),

  /** Descarga el reporte en PDF o Excel. */
  descargar: (opciones) =>
    cliente.descargarArchivo(
      '/reportes/tickets',
      opciones,
      `reporte-tickets.${opciones?.formato === 'xlsx' ? 'xlsx' : 'pdf'}`
    ),

  limpiar: (horas) => cliente.crear(`/reportes/limpiar?horas=${horas ?? 24}`),
};

// =====================================================================
// Notificaciones
// =====================================================================
export const serviciosNotificaciones = {
  porTicket: (ticketId) => cliente.obtener(`/notificaciones/ticket/${ticketId}`),

  resumen: (filtros) => cliente.obtener('/notificaciones/resumen', filtros),

  reintentar: () => cliente.crear('/notificaciones/reintentar'),
};

// =====================================================================
// Salud del sistema
// =====================================================================
export const serviciosSistema = {
  salud: () => cliente.obtener('/salud'),
};

export default {
  autenticacion: serviciosAutenticacion,
  tickets: serviciosTickets,
  comentarios: serviciosComentarios,
  adjuntos: serviciosAdjuntos,
  usuarios: serviciosUsuarios,
  categorias: serviciosCategorias,
  reportes: serviciosReportes,
  notificaciones: serviciosNotificaciones,
  sistema: serviciosSistema,
};
