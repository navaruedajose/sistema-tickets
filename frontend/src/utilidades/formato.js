/**
 * Formato y traduccion de valores del dominio.
 *
 * Todo lo que el usuario ve en pantalla pasa por aqui. Si manana se agrega un
 * nuevo estado al sistema, se anade en este archivo y la interfaz entera
 * (insignias, filtros, tablas) lo refleja automaticamente. DRY.
 */

// =====================================================================
// Estados del ticket
// =====================================================================
export const ESTADOS_TICKET = {
  NUEVO: {
    etiqueta: 'Nuevo',
    clase: 'bg-sky-100 text-sky-800 ring-1 ring-sky-200',
    punto: 'bg-sky-500',
    descripcion: 'Registrado, pendiente de asignacion.',
  },
  ABIERTO: {
    etiqueta: 'Abierto',
    clase: 'bg-blue-100 text-blue-800 ring-1 ring-blue-200',
    punto: 'bg-blue-500',
    descripcion: 'Asignado a un agente.',
  },
  EN_PROGRESO: {
    etiqueta: 'En progreso',
    clase: 'bg-amber-100 text-amber-800 ring-1 ring-amber-200',
    punto: 'bg-amber-500',
    descripcion: 'El agente esta trabajando en el caso.',
  },
  EN_ESPERA: {
    etiqueta: 'En espera',
    clase: 'bg-violet-100 text-violet-800 ring-1 ring-violet-200',
    punto: 'bg-violet-500',
    descripcion: 'Se espera respuesta del solicitante o de un tercero.',
  },
  RESUELTO: {
    etiqueta: 'Resuelto',
    clase: 'bg-emerald-100 text-emerald-800 ring-1 ring-emerald-200',
    punto: 'bg-emerald-500',
    descripcion: 'Solucion aplicada, pendiente de cierre.',
  },
  CERRADO: {
    etiqueta: 'Cerrado',
    clase: 'bg-slate-200 text-slate-700 ring-1 ring-slate-300',
    punto: 'bg-slate-500',
    descripcion: 'Caso concluido y verificado.',
  },
  CANCELADO: {
    etiqueta: 'Cancelado',
    clase: 'bg-rose-100 text-rose-800 ring-1 ring-rose-200',
    punto: 'bg-rose-500',
    descripcion: 'Descartado sin atencion.',
  },
};

/**
 * Transiciones permitidas en la interfaz.
 * DEBE reflejar el mapa del backend (config/constants.js). La interfaz solo
 * ofrece los botones validos, y el backend valida de nuevo por si acaso:
 * defensa en profundidad.
 */
export const TRANSICIONES_UI = {
  NUEVO: ['ABIERTO', 'EN_PROGRESO', 'CANCELADO'],
  ABIERTO: ['EN_PROGRESO', 'EN_ESPERA', 'RESUELTO', 'CANCELADO'],
  EN_PROGRESO: ['EN_ESPERA', 'RESUELTO', 'ABIERTO', 'CANCELADO'],
  EN_ESPERA: ['EN_PROGRESO', 'RESUELTO', 'CANCELADO'],
  RESUELTO: ['CERRADO', 'EN_PROGRESO'],
  CERRADO: [],
  CANCELADO: [],
};

export const ESTADOS_FINALES = ['CERRADO', 'CANCELADO'];

// =====================================================================
// Prioridades
// =====================================================================
export const PRIORIDADES = {
  BAJA: { etiqueta: 'Baja', clase: 'bg-slate-100 text-slate-700 ring-1 ring-slate-200', orden: 1 },
  MEDIA: { etiqueta: 'Media', clase: 'bg-blue-100 text-blue-800 ring-1 ring-blue-200', orden: 2 },
  ALTA: { etiqueta: 'Alta', clase: 'bg-amber-100 text-amber-800 ring-1 ring-amber-200', orden: 3 },
  CRITICA: { etiqueta: 'Critica', clase: 'bg-rose-100 text-rose-800 ring-1 ring-rose-200', orden: 4 },
};

// =====================================================================
// Roles
// =====================================================================
export const ROLES = {
  SOLICITANTE: { etiqueta: 'Solicitante', clase: 'bg-slate-100 text-slate-700 ring-1 ring-slate-200' },
  AGENTE: { etiqueta: 'Agente', clase: 'bg-blue-100 text-blue-800 ring-1 ring-blue-200' },
  ADMINISTRADOR: { etiqueta: 'Administrador', clase: 'bg-violet-100 text-violet-800 ring-1 ring-violet-200' },
};

// =====================================================================
// Ayudantes genericos
// =====================================================================
/** Devuelve la definicion visual de un estado, con respaldo seguro. */
export function infoEstado(estado) {
  return (
    ESTADOS_TICKET[estado] || {
      etiqueta: estado || 'Desconocido',
      clase: 'bg-slate-100 text-slate-700 ring-1 ring-slate-200',
      punto: 'bg-slate-400',
      descripcion: '',
    }
  );
}

/** Devuelve la definicion visual de una prioridad, con respaldo seguro. */
export function infoPrioridad(prioridad) {
  return (
    PRIORIDADES[prioridad] || {
      etiqueta: prioridad || 'Sin definir',
      clase: 'bg-slate-100 text-slate-700 ring-1 ring-slate-200',
      orden: 0,
    }
  );
}

/** Devuelve la definicion visual de un rol, con respaldo seguro. */
export function infoRol(rol) {
  return ROLES[rol] || { etiqueta: rol || 'Desconocido', clase: 'bg-slate-100 text-slate-700' };
}

/** Estados a los que puede pasar un ticket desde su estado actual. */
export function transicionesDisponibles(estadoActual) {
  return TRANSICIONES_UI[estadoActual] || [];
}

// =====================================================================
// Fechas y numeros
// =====================================================================
/** Fecha y hora legibles en espanol (Mexico). */
export function formatearFechaHora(valor) {
  if (!valor) return '-';
  const fecha = new Date(valor);
  if (Number.isNaN(fecha.getTime())) return '-';

  return fecha.toLocaleString('es-MX', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/** Solo la fecha, sin hora. */
export function formatearFecha(valor) {
  if (!valor) return '-';
  const fecha = new Date(valor);
  if (Number.isNaN(fecha.getTime())) return '-';

  return fecha.toLocaleDateString('es-MX', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

/**
 * Tiempo relativo ("hace 3 horas"). Es mucho mas util que una fecha absoluta
 * cuando se revisa una lista de tickets recientes.
 */
export function tiempoRelativo(valor) {
  if (!valor) return '-';
  const fecha = new Date(valor);
  if (Number.isNaN(fecha.getTime())) return '-';

  const segundos = Math.floor((Date.now() - fecha.getTime()) / 1000);
  if (segundos < 0) return 'en el futuro';
  if (segundos < 60) return 'hace unos segundos';

  const unidades = [
    { limite: 60, divisor: 60, singular: 'minuto', plural: 'minutos' },
    { limite: 3600, divisor: 3600, singular: 'hora', plural: 'horas' },
    { limite: 86400, divisor: 86400, singular: 'dia', plural: 'dias' },
    { limite: 2592000, divisor: 604800, singular: 'semana', plural: 'semanas' },
    { limite: Infinity, divisor: 2592000, singular: 'mes', plural: 'meses' },
  ];

  const unidad = unidades.find((candidata) => segundos < candidata.limite);
  const cantidad = Math.floor(segundos / unidad.divisor);

  return `hace ${cantidad} ${cantidad === 1 ? unidad.singular : unidad.plural}`;
}

/** Convierte bytes a una unidad legible. */
export function formatearTamano(bytes) {
  if (bytes === 0 || bytes === null || bytes === undefined) return '0 B';
  const unidades = ['B', 'KB', 'MB', 'GB'];
  const indice = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), unidades.length - 1);
  const valor = bytes / 1024 ** indice;
  return `${valor.toFixed(indice === 0 ? 0 : 1)} ${unidades[indice]}`;
}

/** Numero con separador de miles. */
export function formatearNumero(valor) {
  if (valor === null || valor === undefined) return '0';
  return Number(valor).toLocaleString('es-MX');
}

/**
 * Indica si un ticket supero su fecha limite de SLA sin resolverse.
 * @param {{fecha_limite_sla:string|null, fecha_resolucion:string|null}} ticket
 */
export function estaVencido(ticket) {
  if (!ticket?.fecha_limite_sla || ticket.fecha_resolucion) return false;
  return new Date(ticket.fecha_limite_sla) < new Date();
}

/**
 * Horas restantes (o transcurridas) respecto al SLA.
 * Negativo = vencido.
 */
export function horasRestantesSla(ticket) {
  if (!ticket?.fecha_limite_sla) return null;
  const diferencia = new Date(ticket.fecha_limite_sla) - new Date();
  return Math.round(diferencia / 3_600_000);
}

/** Texto corto del estado del SLA para mostrar en la tabla. */
export function textoSla(ticket) {
  const horas = horasRestantesSla(ticket);
  if (horas === null) return 'Sin SLA';
  if (ticket.fecha_resolucion) return 'Cumplido';

  if (horas < 0) {
    const transcurridas = Math.abs(horas);
    return transcurridas < 24
      ? `Vencido por ${transcurridas} h`
      : `Vencido por ${Math.round(transcurridas / 24)} d`;
  }
  return horas < 24 ? `Quedan ${horas} h` : `Quedan ${Math.round(horas / 24)} d`;
}

/** Iniciales para el avatar del usuario. */
export function iniciales(nombreCompleto) {
  if (!nombreCompleto) return '?';
  return nombreCompleto
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((palabra) => palabra.charAt(0).toUpperCase())
    .join('');
}

/** Fecha de hoy en formato AAAA-MM-DD (para los campos date de los filtros). */
export function hoyISO() {
  const ahora = new Date();
  const desfase = ahora.getTimezoneOffset() * 60_000;
  return new Date(ahora.getTime() - desfase).toISOString().slice(0, 10);
}

/** Resta dias a hoy y devuelve AAAA-MM-DD. */
export function haceDiasISO(dias) {
  const fecha = new Date();
  fecha.setDate(fecha.getDate() - dias);
  const desfase = fecha.getTimezoneOffset() * 60_000;
  return new Date(fecha.getTime() - desfase).toISOString().slice(0, 10);
}

export default {
  ESTADOS_TICKET,
  PRIORIDADES,
  ROLES,
  TRANSICIONES_UI,
  infoEstado,
  infoPrioridad,
  infoRol,
  transicionesDisponibles,
  formatearFechaHora,
  formatearFecha,
  tiempoRelativo,
  formatearTamano,
  formatearNumero,
  estaVencido,
  horasRestantesSla,
  textoSla,
  iniciales,
  hoyISO,
  haceDiasISO,
};
