import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

import { serviciosTickets, serviciosReportes } from '../api/servicios';
import { useAutenticacion } from '../context/AuthContext';
import { useAvisos } from '../context/AvisosContext';
import { EncabezadoPagina, Cargando, MensajeError, EstadoVacio } from '../componentes/Estados';
import { InsigniaEstado, InsigniaPrioridad, InsigniaSla } from '../componentes/Etiquetas';
import {
  TarjetaIndicador,
  GraficaDona,
  GraficaTendencia,
  GraficaBarras,
  BarraProgreso,
} from '../componentes/Graficas';
import {
  infoEstado,
  formatearNumero,
  tiempoRelativo,
  formatearFecha,
  haceDiasISO,
  hoyISO,
} from '../utilidades/formato';

/**
 * Panel principal (dashboard).
 *
 * Dos vistas segun el rol, en la misma ruta:
 *  - Gestores (agente / administrador): indicadores globales, distribucion,
 *    tendencia, desempeno del equipo y tickets que requieren atencion.
 *  - Solicitantes: resumen de SUS tickets y acceso rapido a crear uno nuevo.
 *
 * Se usa un unico endpoint de estadisticas para ambos perfiles; el backend
 * aplica el filtro de alcance, de modo que un solicitante solo ve sus propios
 * numeros sin que la interfaz tenga que pedirlo de forma distinta.
 */

// Colores de la dona: coinciden con la paleta de las insignias de estado.
const COLORES_ESTADO = {
  NUEVO: '#0ea5e9',
  ABIERTO: '#3b82f6',
  EN_PROGRESO: '#f59e0b',
  EN_ESPERA: '#8b5cf6',
  RESUELTO: '#10b981',
  CERRADO: '#64748b',
  CANCELADO: '#f43f5e',
};

export default function Panel() {
  const { usuario, esGestor } = useAutenticacion();
  const { mostrarError } = useAvisos();

  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState(null);
  const [estadisticas, setEstadisticas] = useState(null);
  const [datosAnaliticos, setDatosAnaliticos] = useState(null);
  const [ticketsRecientes, setTicketsRecientes] = useState([]);
  const [periodo, setPeriodo] = useState({ desde: haceDiasISO(30), hasta: hoyISO() });

  const cargar = useCallback(async () => {
    setCargando(true);
    setError(null);

    try {
      // Las peticiones son independientes: se lanzan en paralelo para reducir
      // el tiempo total de carga del panel.
      const peticiones = [
        serviciosTickets.estadisticas(),
        serviciosTickets.listar({ limite: 6, ordenarPor: 'creado_en', direccion: 'DESC' }),
      ];

      // Solo los gestores pueden consultar los datos analiticos globales.
      if (esGestor) {
        peticiones.push(serviciosReportes.panel({ desde: periodo.desde, hasta: periodo.hasta }));
      }

      const [respuestaEstadisticas, respuestaRecientes, respuestaAnaliticos] =
        await Promise.all(peticiones);

      setEstadisticas(respuestaEstadisticas?.datos || null);
      setTicketsRecientes(respuestaRecientes?.datos || []);
      setDatosAnaliticos(respuestaAnaliticos?.datos || null);
    } catch (errorCapturado) {
      setError(errorCapturado);
      mostrarError(errorCapturado, 'No fue posible cargar el panel');
    } finally {
      setCargando(false);
    }
  }, [esGestor, periodo.desde, periodo.hasta, mostrarError]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  if (cargando && !estadisticas) {
    return <Cargando mensaje="Preparando su panel de indicadores..." />;
  }

  if (error && !estadisticas) {
    return <MensajeError mensaje={error.message} alReintentar={cargar} />;
  }

  const indicadores = datosAnaliticos?.indicadores || {};
  const totalTickets = estadisticas?.total || 0;

  // Datos para la dona de distribucion por estado.
  const datosDona = Object.entries(estadisticas?.porEstado || {})
    .filter(([, valor]) => valor > 0)
    .map(([estado, valor]) => ({
      etiqueta: infoEstado(estado).etiqueta,
      valor,
      color: COLORES_ESTADO[estado] || '#94a3b8',
    }));

  return (
    <div>
      <EncabezadoPagina
        titulo={`Hola, ${usuario?.nombre_completo?.split(' ')[0] || ''}`}
        descripcion={
          esGestor
            ? 'Resumen operativo del area de soporte tecnico.'
            : 'Estado actual de sus solicitudes de soporte.'
        }
        acciones={
          <>
            {esGestor ? (
              <label className="flex items-center gap-2 text-xs text-slate-500">
                Periodo
                <select
                  className="campo w-auto py-1.5 text-xs"
                  value={`${periodo.desde}|${periodo.hasta}`}
                  onChange={(evento) => {
                    const [desde, hasta] = evento.target.value.split('|');
                    setPeriodo({ desde, hasta });
                  }}
                >
                  <option value={`${haceDiasISO(7)}|${hoyISO()}`}>Ultimos 7 dias</option>
                  <option value={`${haceDiasISO(30)}|${hoyISO()}`}>Ultimos 30 dias</option>
                  <option value={`${haceDiasISO(90)}|${hoyISO()}`}>Ultimos 90 dias</option>
                  <option value={`${haceDiasISO(365)}|${hoyISO()}`}>Ultimo ano</option>
                </select>
              </label>
            ) : null}
            <Link to="/tickets/nuevo" className="boton-primario">
              + Nuevo ticket
            </Link>
          </>
        }
      />

      {/* ---------- Indicadores principales ---------- */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <TarjetaIndicador
          etiqueta="Total de tickets"
          valor={totalTickets}
          detalle="Registros vigentes en el sistema"
          color="marca"
          icono="☰"
        />
        <TarjetaIndicador
          etiqueta="Pendientes"
          valor={estadisticas?.pendientes ?? 0}
          detalle="Requieren atencion del equipo"
          color="alerta"
          icono="◔"
        />
        <TarjetaIndicador
          etiqueta="Resueltos"
          valor={estadisticas?.resueltos ?? 0}
          detalle="Atendidos o cerrados"
          color="exito"
          icono="✓"
        />
        <TarjetaIndicador
          etiqueta="SLA vencido"
          valor={estadisticas?.vencidos ?? 0}
          detalle={estadisticas?.vencidos > 0 ? 'Requieren escalamiento' : 'Todo en tiempo'}
          color={estadisticas?.vencidos > 0 ? 'peligro' : 'exito'}
          icono="⏱"
        />
      </div>

      {/* ---------- Analisis (solo gestores) ---------- */}
      {esGestor ? (
        <>
          <div className="mt-6 grid gap-6 lg:grid-cols-5">
            {/* Distribucion por estado */}
            <section className="tarjeta lg:col-span-2">
              <div className="tarjeta-encabezado">
                <h2 className="tarjeta-titulo">Distribucion por estado</h2>
              </div>
              <div className="tarjeta-cuerpo">
                {datosDona.length > 0 ? (
                  <GraficaDona datos={datosDona} />
                ) : (
                  <EstadoVacio
                    titulo="Sin tickets registrados"
                    mensaje="Cuando se registren tickets, aqui vera su distribucion por estado."
                    icono="📊"
                  />
                )}
              </div>
            </section>

            {/* Tendencia */}
            <section className="tarjeta lg:col-span-3">
              <div className="tarjeta-encabezado">
                <h2 className="tarjeta-titulo">Tendencia de los ultimos 30 dias</h2>
                <span className="text-xs text-slate-400">
                  Creados frente a resueltos por dia
                </span>
              </div>
              <div className="tarjeta-cuerpo">
                <GraficaTendencia serie={datosAnaliticos?.serieTemporal || []} />
              </div>
            </section>
          </div>

          <div className="mt-6 grid gap-6 lg:grid-cols-5">
            {/* Desempeno por agente */}
            <section className="tarjeta lg:col-span-3">
              <div className="tarjeta-encabezado">
                <h2 className="tarjeta-titulo">Desempeno por agente</h2>
                <Link to="/reportes" className="text-xs font-medium text-marca-700 hover:underline">
                  Ver reporte completo
                </Link>
              </div>

              <div className="overflow-x-auto">
                {(datosAnaliticos?.porAgente || []).length > 0 ? (
                  <table className="tabla">
                    <thead>
                      <tr>
                        <th>Agente</th>
                        <th className="text-center">Asignados</th>
                        <th className="text-center">Resueltos</th>
                        <th className="text-center">Pendientes</th>
                        <th>Hrs. prom.</th>
                        <th>Cumplimiento SLA</th>
                      </tr>
                    </thead>
                    <tbody>
                      {datosAnaliticos.porAgente.map((agente) => (
                        <tr key={agente.agente_id}>
                          <td>
                            <p className="font-medium text-slate-800">{agente.agente}</p>
                            <p className="text-xs text-slate-400">{agente.correo_agente}</p>
                          </td>
                          <td className="text-center">{formatearNumero(agente.total_asignados)}</td>
                          <td className="text-center font-semibold text-emerald-700">
                            {formatearNumero(agente.total_resueltos)}
                          </td>
                          <td className="text-center">
                            {agente.total_pendientes > 0 ? (
                              <span className="font-semibold text-amber-700">
                                {formatearNumero(agente.total_pendientes)}
                              </span>
                            ) : (
                              <span className="text-slate-400">0</span>
                            )}
                          </td>
                          <td>{agente.promedio_horas_resolucion ?? '-'}</td>
                          <td className="w-40">
                            {agente.porcentaje_cumplimiento_sla !== null ? (
                              <BarraProgreso
                                valor={Number(agente.porcentaje_cumplimiento_sla)}
                                color={
                                  Number(agente.porcentaje_cumplimiento_sla) >= 80
                                    ? '#059669'
                                    : '#d97706'
                                }
                              />
                            ) : (
                              <span className="text-xs text-slate-400">Sin datos</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <EstadoVacio
                    titulo="Sin agentes con actividad"
                    mensaje="Asigne tickets a los agentes para comenzar a medir su desempeno."
                    icono="👥"
                  />
                )}
              </div>
            </section>

            {/* Carga por categoria */}
            <section className="tarjeta lg:col-span-2">
              <div className="tarjeta-encabezado">
                <h2 className="tarjeta-titulo">Volumen por categoria</h2>
              </div>
              <div className="tarjeta-cuerpo">
                <GraficaBarras
                  alto={200}
                  datos={agruparPorCategoria(datosAnaliticos?.porCategoria || [])}
                />
              </div>
            </section>
          </div>
        </>
      ) : null}

      {/* ---------- Tickets recientes ---------- */}
      <section className="tarjeta mt-6">
        <div className="tarjeta-encabezado">
          <h2 className="tarjeta-titulo">
            {esGestor ? 'Tickets recientes' : 'Mis tickets recientes'}
          </h2>
          <Link to="/tickets" className="text-xs font-medium text-marca-700 hover:underline">
            Ver todos
          </Link>
        </div>

        {ticketsRecientes.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="tabla">
              <thead>
                <tr>
                  <th>Folio</th>
                  <th>Titulo</th>
                  <th>Estado</th>
                  <th>Prioridad</th>
                  <th>SLA</th>
                  <th>Responsable</th>
                  <th>Creado</th>
                </tr>
              </thead>
              <tbody>
                {ticketsRecientes.map((ticket) => (
                  <tr key={ticket.id}>
                    <td>
                      <Link
                        to={`/tickets/${ticket.id}`}
                        className="font-mono text-xs font-semibold text-marca-700 hover:underline"
                      >
                        {ticket.codigo}
                      </Link>
                    </td>
                    <td className="max-w-xs">
                      <Link to={`/tickets/${ticket.id}`} className="line-clamp-1 hover:underline">
                        {ticket.titulo}
                      </Link>
                      <p className="text-xs text-slate-400">
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
                      {ticket.agente_nombre || <span className="text-slate-400">Sin asignar</span>}
                    </td>
                    <td className="whitespace-nowrap text-xs text-slate-500">
                      {tiempoRelativo(ticket.creado_en)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EstadoVacio
            titulo="Todavia no hay tickets"
            mensaje="Registre su primera solicitud de soporte para verla aqui."
            icono="🎫"
            accion={
              <Link to="/tickets/nuevo" className="boton-primario">
                Crear el primer ticket
              </Link>
            }
          />
        )}
      </section>

      {/* Pie con informacion de contexto */}
      <p className="mt-6 text-center text-xs text-slate-400">
        {indicadores.porcentaje_cumplimiento_sla !== undefined &&
        indicadores.porcentaje_cumplimiento_sla !== null
          ? `Cumplimiento de SLA del periodo: ${indicadores.porcentaje_cumplimiento_sla}% · `
          : ''}
        Datos actualizados al {formatearFecha(new Date().toISOString())}
      </p>
    </div>
  );
}

/** Suma los totales de cada categoria para la grafica de barras. */
function agruparPorCategoria(filas) {
  const acumulado = new Map();

  filas.forEach((fila) => {
    acumulado.set(fila.categoria, (acumulado.get(fila.categoria) || 0) + fila.total);
  });

  return Array.from(acumulado.entries())
    .map(([etiqueta, valor]) => ({ etiqueta, valor, color: '#1d4ed8' }))
    .sort((a, b) => b.valor - a.valor)
    .slice(0, 7);
}
