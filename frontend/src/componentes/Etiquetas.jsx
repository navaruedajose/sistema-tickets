import { infoEstado, infoPrioridad, infoRol, estaVencido, textoSla } from '../utilidades/formato';

/**
 * Insignias de dominio.
 *
 * Todas leen su color y su texto desde `utilidades/formato.js`, de modo que
 * agregar un estado nuevo no obliga a tocar ningun componente.
 */

/** Insignia de estado del ticket. */
export function InsigniaEstado({ estado, punto = false }) {
  const info = infoEstado(estado);

  return (
    <span className={`insignia ${info.clase}`}>
      {punto ? <span className={`h-1.5 w-1.5 rounded-full ${info.punto}`} aria-hidden="true" /> : null}
      {info.etiqueta}
    </span>
  );
}

/** Insignia de prioridad. */
export function InsigniaPrioridad({ prioridad }) {
  const info = infoPrioridad(prioridad);
  return <span className={`insignia ${info.clase}`}>{info.etiqueta}</span>;
}

/** Insignia de rol de usuario. */
export function InsigniaRol({ rol }) {
  const info = infoRol(rol);
  return <span className={`insignia ${info.clase}`}>{info.etiqueta}</span>;
}

/**
 * Indicador de SLA. Cambia de color segun el tiempo restante, que es
 * precisamente la informacion que un jefe de soporte necesita ver de un
 * vistazo en la lista de tickets.
 */
export function InsigniaSla({ ticket }) {
  const vencido = estaVencido(ticket);
  const resuelto = Boolean(ticket?.fecha_resolucion);
  const texto = textoSla(ticket);

  let clase = 'bg-slate-100 text-slate-600 ring-1 ring-slate-200';
  if (resuelto) {
    clase = 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200';
  } else if (vencido) {
    clase = 'bg-rose-100 text-rose-800 ring-1 ring-rose-200';
  } else if (texto.startsWith('Quedan') && !texto.includes('d')) {
    clase = 'bg-amber-100 text-amber-800 ring-1 ring-amber-200';
  }

  return (
    <span className={`insignia ${clase}`} title={ticket?.fecha_limite_sla ? `Limite: ${ticket.fecha_limite_sla}` : ''}>
      {texto}
    </span>
  );
}

/** Indicador booleano generico (activo / inactivo). */
export function InsigniaActivo({ activo }) {
  return (
    <span
      className={`insignia ${
        activo
          ? 'bg-emerald-100 text-emerald-800 ring-1 ring-emerald-200'
          : 'bg-slate-200 text-slate-600 ring-1 ring-slate-300'
      }`}
    >
      {activo ? 'Activo' : 'Inactivo'}
    </span>
  );
}

export default { InsigniaEstado, InsigniaPrioridad, InsigniaRol, InsigniaSla, InsigniaActivo };
