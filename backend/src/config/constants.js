'use strict';

/**
 * Valores de dominio compartidos.
 *
 * Se centralizan aqui para que las reglas de negocio (que estados son
 * finales, que transiciones son validas) no se dupliquen entre servicios,
 * controladores y consultas SQL. Principio DRY.
 */

const ROLES = Object.freeze({
  SOLICITANTE: 'SOLICITANTE',
  AGENTE: 'AGENTE',
  ADMINISTRADOR: 'ADMINISTRADOR',
});

const ESTADOS_TICKET = Object.freeze({
  NUEVO: 'NUEVO',
  ABIERTO: 'ABIERTO',
  EN_PROGRESO: 'EN_PROGRESO',
  EN_ESPERA: 'EN_ESPERA',
  RESUELTO: 'RESUELTO',
  CERRADO: 'CERRADO',
  CANCELADO: 'CANCELADO',
});

const PRIORIDADES = Object.freeze({
  BAJA: 'BAJA',
  MEDIA: 'MEDIA',
  ALTA: 'ALTA',
  CRITICA: 'CRITICA',
});

const CANALES = Object.freeze({
  EMAIL: 'EMAIL',
  SMS: 'SMS',
});

const ESTADOS_NOTIFICACION = Object.freeze({
  PENDIENTE: 'PENDIENTE',
  ENVIADO: 'ENVIADO',
  FALLIDO: 'FALLIDO',
});

/** Estados que ya no admiten cambios de flujo normal. */
const ESTADOS_FINALES = Object.freeze([
  ESTADOS_TICKET.CERRADO,
  ESTADOS_TICKET.CANCELADO,
]);

/**
 * Maquina de estados del ticket.
 * Define explicitamente que transiciones son legales; cualquier intento
 * fuera de este mapa devuelve HTTP 409. Esto es lo que impide que un
 * "cliente toxico" deje el sistema en un estado inconsistente.
 */
const TRANSICIONES_PERMITIDAS = Object.freeze({
  [ESTADOS_TICKET.NUEVO]: [ESTADOS_TICKET.ABIERTO, ESTADOS_TICKET.EN_PROGRESO, ESTADOS_TICKET.CANCELADO],
  [ESTADOS_TICKET.ABIERTO]: [ESTADOS_TICKET.EN_PROGRESO, ESTADOS_TICKET.EN_ESPERA, ESTADOS_TICKET.RESUELTO, ESTADOS_TICKET.CANCELADO],
  [ESTADOS_TICKET.EN_PROGRESO]: [ESTADOS_TICKET.EN_ESPERA, ESTADOS_TICKET.RESUELTO, ESTADOS_TICKET.ABIERTO, ESTADOS_TICKET.CANCELADO],
  [ESTADOS_TICKET.EN_ESPERA]: [ESTADOS_TICKET.EN_PROGRESO, ESTADOS_TICKET.RESUELTO, ESTADOS_TICKET.CANCELADO],
  [ESTADOS_TICKET.RESUELTO]: [ESTADOS_TICKET.CERRADO, ESTADOS_TICKET.EN_PROGRESO],
  [ESTADOS_TICKET.CERRADO]: [],
  [ESTADOS_TICKET.CANCELADO]: [],
});

/**
 * ¿Es legal pasar del estado A al estado B?
 * @param {string} estadoActual
 * @param {string} estadoNuevo
 * @returns {boolean}
 */
function transicionEsValida(estadoActual, estadoNuevo) {
  if (estadoActual === estadoNuevo) return true;
  const permitidos = TRANSICIONES_PERMITIDAS[estadoActual] || [];
  return permitidos.includes(estadoNuevo);
}

module.exports = {
  ROLES,
  ESTADOS_TICKET,
  PRIORIDADES,
  CANALES,
  ESTADOS_NOTIFICACION,
  ESTADOS_FINALES,
  TRANSICIONES_PERMITIDAS,
  transicionEsValida,
};
