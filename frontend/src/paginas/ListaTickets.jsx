import { useCallback, useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';

import { serviciosTickets } from '../api/servicios';
import { useAutenticacion } from '../context/AuthContext';
import { useAvisos } from '../context/AvisosContext';
import { EncabezadoPagina, EsqueletoTabla, EstadoVacio, MensajeError } from '../componentes/Estados';
import { InsigniaEstado, InsigniaPrioridad, InsigniaSla } from '../componentes/Etiquetas';
import Paginacion from '../componentes/Paginacion';
import {
  ESTADOS_TICKET,
  PRIORIDADES,
  formatearNumero,
  tiempoRelativo,
} from '../utilidades/formato';

/**
 * Listado de tickets con filtros y paginacion.
 *
 * Los filtros viven en la URL (useSearchParams), no en el estado del
 * componente. Ventajas:
 *   - El usuario puede compartir el enlace de una busqueda concreta.
 *   - El boton "atras" del navegador funciona como se espera.
 *   - Al recargar la pagina se conserva el filtro aplicado.
 */

const FILTROS_INICIALES = {
  pagina: 1,
  limite: 20,
  estado: '',
  prioridad: '',
  busqueda: '',
  soloVencidos: '',
  ordenarPor: 'creado_en',
  direccion: 'DESC',
};

export default function ListaTickets() {
  const { esGestor } = useAutenticacion();
  const { mostrarError } = useAvisos();
  const [parametrosUrl, setParametrosUrl] = useSearchParams();

  // Estado derivado de la URL.
  const filtros = {
    pagina: Number(parametrosUrl.get('pagina')) || FILTROS_INICIALES.pagina,
    limite: Number(parametrosUrl.get('limite')) || FILTROS_INICIALES.limite,
    estado: parametrosUrl.get('estado') || '',
    prioridad: parametrosUrl.get('prioridad') || '',
    busqueda: parametrosUrl.get('busqueda') || '',
    soloVencidos: parametrosUrl.get('soloVencidos') || '',
    ordenarPor: parametrosUrl.get('ordenarPor') || FILTROS_INICIALES.ordenarPor,
    direccion: parametrosUrl.get('direccion') || FILTROS_INICIALES.direccion,
  };

  // El campo de busqueda necesita estado local para no disparar una peticion
  // por cada tecla: se aplica con retardo (debounce).
  const [textoBusqueda, setTextoBusqueda] = useState(filtros.busqueda);
  const [tickets, setTickets] = useState([]);
  const [meta, setMeta] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState(null);

  /** Actualiza uno o varios parametros de la URL y reinicia la paginacion. */
  const actualizarFiltros = useCallback(
    (cambios) => {
      const siguientes = new URLSearchParams(parametrosUrl);

      Object.entries(cambios).forEach(([clave, valor]) => {
        if (valor === '' || valor === null || valor === undefined) {
          siguientes.delete(clave);
        } else {
          siguientes.set(clave, String(valor));
        }
      });

      // Cualquier cambio de filtro devuelve a la primera pagina.
      if (!('pagina' in cambios)) siguientes.set('pagina', '1');

      setParametrosUrl(siguientes, { replace: true });
    },
    [parametrosUrl, setParametrosUrl]
  );

  /** Carga la pagina actual de tickets. */
  const cargar = useCallback(async () => {
    setCargando(true);
    setError(null);

    try {
      const respuesta = await serviciosTickets.listar({
        pagina: filtros.pagina,
        limite: filtros.limite,
        estado: filtros.estado || undefined,
        prioridad: filtros.prioridad || undefined,
        busqueda: filtros.busqueda || undefined,
        soloVencidos: filtros.soloVencidos || undefined,
        ordenarPor: filtros.ordenarPor,
        direccion: filtros.direccion,
      });

      setTickets(respuesta?.datos || []);
      setMeta(respuesta?.meta?.paginacion || null);
    } catch (errorCapturado) {
      setError(errorCapturado);
      mostrarError(errorCapturado, 'No fue posible cargar los tickets');
    } finally {
      setCargando(false);
    }
  }, [
    filtros.pagina,
    filtros.limite,
    filtros.estado,
    filtros.prioridad,
    filtros.busqueda,
    filtros.soloVencidos,
    filtros.ordenarPor,
    filtros.direccion,
    mostrarError,
  ]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  // Debounce de la busqueda: espera 400 ms desde la ultima tecla.
  useEffect(() => {
    if (textoBusqueda === filtros.busqueda) return undefined;

    const temporizador = setTimeout(() => {
      actualizarFiltros({ busqueda: textoBusqueda });
    }, 400);

    return () => clearTimeout(temporizador);
  }, [textoBusqueda, filtros.busqueda, actualizarFiltros]);

  const hayFiltrosActivos =
    filtros.estado || filtros.prioridad || filtros.busqueda || filtros.soloVencidos;

  /** Alterna el orden de una columna. */
  function alternarOrden(columna) {
    const esMismaColumna = filtros.ordenarPor === columna;
    actualizarFiltros({
      ordenarPor: columna,
      direccion: esMismaColumna && filtros.direccion === 'DESC' ? 'ASC' : 'DESC',
    });
  }

  /** Indicador visual del orden activo. */
  function flechaOrden(columna) {
    if (filtros.ordenarPor !== columna) return null;
    return <span aria-hidden="true">{filtros.direccion === 'DESC' ? ' ↓' : ' ↑'}</span>;
  }

  return (
    <div>
      <EncabezadoPagina
        titulo="Tickets"
        descripcion={
          esGestor
            ? 'Bandeja completa de solicitudes de soporte.'
            : 'Historial de las solicitudes que ha registrado.'
        }
        acciones={
          <Link to="/tickets/nuevo" className="boton-primario">
            + Nuevo ticket
          </Link>
        }
      />

      {/* ---------------- Barra de filtros ---------------- */}
      <div className="tarjeta mb-6">
        <div className="tarjeta-cuerpo">
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
            {/* Busqueda */}
            <div className="lg:col-span-2">
              <label htmlFor="busqueda" className="etiqueta-campo">
                Buscar
              </label>
              <div className="relative">
                <input
                  id="busqueda"
                  className="campo pl-9"
                  placeholder="Folio, titulo o descripcion..."
                  value={textoBusqueda}
                  onChange={(evento) => setTextoBusqueda(evento.target.value)}
                />
                <span
                  aria-hidden="true"
                  className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-slate-400"
                >
                  ⌕
                </span>
                {textoBusqueda ? (
                  <button
                    type="button"
                    onClick={() => setTextoBusqueda('')}
                    className="absolute right-2 top-1/2 -translate-y-1/2 rounded px-1.5 text-slate-400 hover:bg-slate-100"
                    aria-label="Limpiar busqueda"
                  >
                    ×
                  </button>
                ) : null}
              </div>
            </div>

            {/* Estado */}
            <div>
              <label htmlFor="filtroEstado" className="etiqueta-campo">
                Estado
              </label>
              <select
                id="filtroEstado"
                className="campo"
                value={filtros.estado}
                onChange={(evento) => actualizarFiltros({ estado: evento.target.value })}
              >
                <option value="">Todos</option>
                {Object.entries(ESTADOS_TICKET).map(([clave, info]) => (
                  <option key={clave} value={clave}>
                    {info.etiqueta}
                  </option>
                ))}
              </select>
            </div>

            {/* Prioridad */}
            <div>
              <label htmlFor="filtroPrioridad" className="etiqueta-campo">
                Prioridad
              </label>
              <select
                id="filtroPrioridad"
                className="campo"
                value={filtros.prioridad}
                onChange={(evento) => actualizarFiltros({ prioridad: evento.target.value })}
              >
                <option value="">Todas</option>
                {Object.entries(PRIORIDADES).map(([clave, info]) => (
                  <option key={clave} value={clave}>
                    {info.etiqueta}
                  </option>
                ))}
              </select>
            </div>

            {/* Ordenamiento */}
            <div>
              <label htmlFor="filtroOrden" className="etiqueta-campo">
                Ordenar por
              </label>
              <select
                id="filtroOrden"
                className="campo"
                value={`${filtros.ordenarPor}|${filtros.direccion}`}
                onChange={(evento) => {
                  const [ordenarPor, direccion] = evento.target.value.split('|');
                  actualizarFiltros({ ordenarPor, direccion });
                }}
              >
                <option value="creado_en|DESC">Mas recientes</option>
                <option value="creado_en|ASC">Mas antiguos</option>
                <option value="actualizado_en|DESC">Actualizados recientemente</option>
                <option value="prioridad|DESC">Mayor prioridad</option>
                <option value="fecha_limite_sla|ASC">SLA mas proximo</option>
              </select>
            </div>
          </div>

          {/* Filtros secundarios */}
          <div className="mt-4 flex flex-wrap items-center gap-4">
            <label className="flex items-center gap-2 text-sm text-slate-600">
              <input
                type="checkbox"
                className="h-4 w-4 rounded border-slate-300 text-marca-700 focus:ring-marca-500"
                checked={filtros.soloVencidos === 'true'}
                onChange={(evento) =>
                  actualizarFiltros({ soloVencidos: evento.target.checked ? 'true' : '' })
                }
              />
              Solo tickets con SLA vencido
            </label>

            {hayFiltrosActivos ? (
              <button
                type="button"
                className="boton-fantasma boton-pequeno"
                onClick={() => {
                  setTextoBusqueda('');
                  setParametrosUrl(new URLSearchParams(), { replace: true });
                }}
              >
                Limpiar filtros
              </button>
            ) : null}
          </div>
        </div>
      </div>

      {/* ---------------- Tabla ---------------- */}
      <div className="tarjeta overflow-hidden">
        {cargando ? (
          <EsqueletoTabla filas={6} columnas={6} />
        ) : error ? (
          <MensajeError mensaje={error.message} alReintentar={cargar} />
        ) : tickets.length === 0 ? (
          <EstadoVacio
            titulo={hayFiltrosActivos ? 'Ningun ticket coincide con los filtros' : 'Aun no hay tickets'}
            mensaje={
              hayFiltrosActivos
                ? 'Pruebe con otros criterios de busqueda o limpie los filtros aplicados.'
                : 'Registre la primera solicitud de soporte para comenzar.'
            }
            icono={hayFiltrosActivos ? '🔍' : '🎫'}
            accion={
              hayFiltrosActivos ? (
                <button
                  type="button"
                  className="boton-secundario"
                  onClick={() => {
                    setTextoBusqueda('');
                    setParametrosUrl(new URLSearchParams(), { replace: true });
                  }}
                >
                  Limpiar filtros
                </button>
              ) : (
                <Link to="/tickets/nuevo" className="boton-primario">
                  Crear el primer ticket
                </Link>
              )
            }
          />
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="tabla">
                <thead>
                  <tr>
                    <th>
                      <button
                        type="button"
                        onClick={() => alternarOrden('creado_en')}
                        className="font-semibold uppercase hover:text-slate-700"
                      >
                        Folio / Titulo
                        {flechaOrden('creado_en')}
                      </button>
                    </th>
                    <th>
                      <button
                        type="button"
                        onClick={() => alternarOrden('estado')}
                        className="font-semibold uppercase hover:text-slate-700"
                      >
                        Estado
                        {flechaOrden('estado')}
                      </button>
                    </th>
                    <th>
                      <button
                        type="button"
                        onClick={() => alternarOrden('prioridad')}
                        className="font-semibold uppercase hover:text-slate-700"
                      >
                        Prioridad
                        {flechaOrden('prioridad')}
                      </button>
                    </th>
                    <th>
                      <button
                        type="button"
                        onClick={() => alternarOrden('fecha_limite_sla')}
                        className="font-semibold uppercase hover:text-slate-700"
                      >
                        SLA
                        {flechaOrden('fecha_limite_sla')}
                      </button>
                    </th>
                    <th>Solicitante</th>
                    <th>Responsable</th>
                    <th className="text-center">Adjuntos</th>
                    <th className="text-right">Creado</th>
                  </tr>
                </thead>
                <tbody>
                  {tickets.map((ticket) => (
                    <tr key={ticket.id}>
                      <td className="max-w-sm">
                        <Link
                          to={`/tickets/${ticket.id}`}
                          className="font-mono text-xs font-semibold text-marca-700 hover:underline"
                        >
                          {ticket.codigo}
                        </Link>
                        <Link
                          to={`/tickets/${ticket.id}`}
                          className="mt-0.5 block truncate font-medium text-slate-800 hover:underline"
                          title={ticket.titulo}
                        >
                          {ticket.titulo}
                        </Link>
                        <p className="truncate text-xs text-slate-400">
                          {ticket.categoria_nombre || 'Sin categoria'}
                        </p>
                      </td>
                      <td>
                        <InsigniaEstado estado={ticket.estado} punto />
                      </td>
                      <td>
                        <InsigniaPrioridad prioridad={ticket.prioridad} />
                      </td>
                      <td>
                        <InsigniaSla ticket={ticket} />
                      </td>
                      <td className="text-xs">
                        <p className="text-slate-700">{ticket.solicitante_nombre}</p>
                        <p className="text-slate-400">{ticket.solicitante_correo}</p>
                      </td>
                      <td className="text-xs">
                        {ticket.agente_nombre ? (
                          <span className="text-slate-700">{ticket.agente_nombre}</span>
                        ) : (
                          <span className="rounded bg-amber-50 px-2 py-0.5 text-amber-700">
                            Sin asignar
                          </span>
                        )}
                      </td>
                      <td className="text-center text-xs text-slate-500">
                        {ticket.total_adjuntos > 0 ? (
                          <span title={`${ticket.total_adjuntos} archivo(s)`}>
                            📎 {ticket.total_adjuntos}
                          </span>
                        ) : (
                          <span className="text-slate-300">—</span>
                        )}
                      </td>
                      <td className="whitespace-nowrap text-right text-xs text-slate-500">
                        {tiempoRelativo(ticket.creado_en)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <Paginacion
              meta={meta}
              alCambiarPagina={(pagina) => actualizarFiltros({ pagina })}
              alCambiarLimite={(limite) => actualizarFiltros({ limite })}
            />
          </>
        )}
      </div>

      {meta && meta.total > 0 ? (
        <p className="mt-3 text-xs text-slate-400">
          {formatearNumero(meta.total)} ticket(s) en total
          {filtros.soloVencidos === 'true' ? ' · filtrado por SLA vencido' : ''}
        </p>
      ) : null}
    </div>
  );
}
