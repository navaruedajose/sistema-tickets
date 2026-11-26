import { useCallback, useEffect, useState } from 'react';

import { serviciosReportes, serviciosNotificaciones } from '../api/servicios';
import { useAvisos } from '../context/AvisosContext';
import { EncabezadoPagina, Cargando, MensajeError } from '../componentes/Estados';
import {
  TarjetaIndicador,
  GraficaBarras,
  GraficaDona,
  GraficaTendencia,
  BarraProgreso,
} from '../componentes/Graficas';
import { infoEstado, formatearNumero, haceDiasISO, hoyISO } from '../utilidades/formato';

/**
 * Modulo de reportes.
 *
 * Dos capacidades diferenciadas:
 *   1. Vista previa en pantalla de los mismos datos que lleva el archivo.
 *      Es importante: el usuario comprueba que el reporte es correcto ANTES
 *      de descargarlo, y el profesor ve en vivo de donde sale cada cifra.
 *   2. Descarga en PDF o Excel, generada en el servidor.
 *
 * Los botones de descarga quedan deshabilitados mientras hay una descarga en
 * curso: si un cliente toxico hace doble clic repetidamente, la interfaz no
 * multiplica la carga sobre el servidor.
 */

const COLORES_ESTADO = {
  NUEVO: '#0ea5e9',
  ABIERTO: '#3b82f6',
  EN_PROGRESO: '#f59e0b',
  EN_ESPERA: '#8b5cf6',
  RESUELTO: '#10b981',
  CERRADO: '#64748b',
  CANCELADO: '#f43f5e',
};

export default function Reportes() {
  const { exito, advertencia, informacion, mostrarError } = useAvisos();

  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState(null);
  const [datos, setDatos] = useState(null);
  const [descargando, setDescargando] = useState(null);
  const [reintentando, setReintentando] = useState(false);

  const [filtros, setFiltros] = useState({
    desde: haceDiasISO(30),
    hasta: hoyISO(),
    tipo: 'gestion',
    dias: 30,
  });

  const cargar = useCallback(async () => {
    setCargando(true);
    setError(null);

    try {
      const respuesta = await serviciosReportes.panel({
        desde: filtros.desde,
        hasta: filtros.hasta,
        dias: filtros.dias,
      });
      setDatos(respuesta?.datos || null);
    } catch (errorCapturado) {
      setError(errorCapturado);
      mostrarError(errorCapturado, 'No fue posible cargar los datos del reporte');
    } finally {
      setCargando(false);
    }
  }, [filtros.desde, filtros.hasta, filtros.dias, mostrarError]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  /** Descarga el reporte en el formato indicado. */
  async function descargar(formato) {
    setDescargando(formato);

    try {
      const resultado = await serviciosReportes.descargar({
        formato,
        tipo: filtros.tipo,
        desde: filtros.desde,
        hasta: filtros.hasta,
      });

      // El backend informa si el reporte se genero sin datos. No es un error,
      // pero conviene avisarlo para que no parezca que "el sistema fallo".
      if (resultado.sinDatos) {
        advertencia(
          'Reporte generado sin datos',
          resultado.aviso ||
            'No existen tickets en el periodo seleccionado. El archivo se descargo con las tablas vacias.'
        );
      } else {
        exito(
          'Reporte descargado',
          `El archivo ${resultado.nombreArchivo} se guardo en su carpeta de descargas.`
        );
      }
    } catch (errorCapturado) {
      mostrarError(errorCapturado, 'No fue posible generar el reporte');
    } finally {
      setDescargando(null);
    }
  }

  /** Reintenta las notificaciones que quedaron en cola. */
  async function reintentarNotificaciones() {
    setReintentando(true);
    try {
      const respuesta = await serviciosNotificaciones.reintentar();
      informacion('Reintento de notificaciones', respuesta?.mensaje || 'Proceso finalizado.');
    } catch (errorCapturado) {
      mostrarError(errorCapturado, 'No fue posible reintentar las notificaciones');
    } finally {
      setReintentando(false);
    }
  }

  if (cargando && !datos) return <Cargando mensaje="Calculando indicadores..." />;
  if (error && !datos) return <MensajeError mensaje={error.message} alReintentar={cargar} />;

  const indicadores = datos?.indicadores || {};

  const datosDona = (datos?.porEstado || [])
    .filter((fila) => fila.total > 0)
    .map((fila) => ({
      etiqueta: infoEstado(fila.estado).etiqueta,
      valor: fila.total,
      color: COLORES_ESTADO[fila.estado] || '#94a3b8',
    }));

  // Agrupa las filas de categoria/prioridad para la grafica de barras.
  const acumuladoCategorias = new Map();
  (datos?.porCategoria || []).forEach((fila) => {
    acumuladoCategorias.set(
      fila.categoria,
      (acumuladoCategorias.get(fila.categoria) || 0) + fila.total
    );
  });
  const datosBarras = Array.from(acumuladoCategorias.entries())
    .map(([etiqueta, valor]) => ({ etiqueta, valor, color: '#1d4ed8' }))
    .sort((a, b) => b.valor - a.valor);

  const sinDatos = Number(indicadores.total_tickets || 0) === 0;

  return (
    <div>
      <EncabezadoPagina
        titulo="Reportes y analisis"
        descripcion="Indicadores de gestion, cumplimiento de SLA y desempeno del equipo de soporte."
        acciones={
          <>
            <button
              type="button"
              className="boton-secundario"
              onClick={() => descargar('xlsx')}
              disabled={descargando !== null}
            >
              {descargando === 'xlsx' ? 'Generando...' : '⬇ Descargar Excel'}
            </button>
            <button
              type="button"
              className="boton-primario"
              onClick={() => descargar('pdf')}
              disabled={descargando !== null}
            >
              {descargando === 'pdf' ? 'Generando...' : '⬇ Descargar PDF'}
            </button>
          </>
        }
      />

      {/* ---------------- Filtros del reporte ---------------- */}
      <section className="tarjeta mb-6">
        <div className="tarjeta-cuerpo">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <label htmlFor="desde" className="etiqueta-campo">
                Fecha inicial
              </label>
              <input
                id="desde"
                type="date"
                className="campo"
                max={filtros.hasta}
                value={filtros.desde}
                onChange={(evento) =>
                  setFiltros((actual) => ({ ...actual, desde: evento.target.value }))
                }
              />
            </div>

            <div>
              <label htmlFor="hasta" className="etiqueta-campo">
                Fecha final
              </label>
              <input
                id="hasta"
                type="date"
                className="campo"
                min={filtros.desde}
                max={hoyISO()}
                value={filtros.hasta}
                onChange={(evento) =>
                  setFiltros((actual) => ({ ...actual, hasta: evento.target.value }))
                }
              />
            </div>

            <div>
              <label htmlFor="tipo" className="etiqueta-campo">
                Tipo de reporte
              </label>
              <select
                id="tipo"
                className="campo"
                value={filtros.tipo}
                onChange={(evento) => setFiltros((actual) => ({ ...actual, tipo: evento.target.value }))}
              >
                <option value="gestion">Reporte de gestion general</option>
                <option value="agentes">Desempeno por agente</option>
                <option value="detalle">Detalle de tickets</option>
              </select>
            </div>

            <div>
              <label htmlFor="dias" className="etiqueta-campo">
                Ventana de tendencia
              </label>
              <select
                id="dias"
                className="campo"
                value={filtros.dias}
                onChange={(evento) =>
                  setFiltros((actual) => ({ ...actual, dias: Number(evento.target.value) }))
                }
              >
                <option value={7}>Ultimos 7 dias</option>
                <option value={30}>Ultimos 30 dias</option>
                <option value={60}>Ultimos 60 dias</option>
                <option value={90}>Ultimos 90 dias</option>
              </select>
            </div>
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-3">
            <button type="button" className="boton-secundario boton-pequeno" onClick={cargar}>
              Actualizar vista previa
            </button>

            <button
              type="button"
              className="boton-fantasma boton-pequeno"
              onClick={reintentarNotificaciones}
              disabled={reintentando}
            >
              {reintentando ? 'Reintentando...' : 'Reintentar notificaciones en cola'}
            </button>

            <span className="text-xs text-slate-400">
              Los archivos se generan en el servidor y se eliminan automaticamente despues de 24 horas.
            </span>
          </div>
        </div>
      </section>

      {/* Aviso de periodo sin datos: se muestra de forma explicita en lugar de
          dejar la pantalla con ceros y sin explicacion. */}
      {sinDatos ? (
        <div className="mb-6 rounded-xl border border-amber-200 bg-amber-50 px-5 py-4">
          <p className="text-sm font-semibold text-amber-900">
            No hay tickets registrados en el periodo seleccionado
          </p>
          <p className="mt-1 text-xs text-amber-800">
            Los indicadores aparecen en cero y las graficas no tienen informacion. Puede ampliar el
            rango de fechas o descargar el reporte: el archivo se genera igual, con las tablas
            vacias, para dejar constancia del periodo consultado.
          </p>
        </div>
      ) : null}

      {/* ---------------- Indicadores ---------------- */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <TarjetaIndicador
          etiqueta="Total de tickets"
          valor={indicadores.total_tickets}
          detalle="En el periodo seleccionado"
          color="marca"
          icono="☰"
        />
        <TarjetaIndicador
          etiqueta="Resueltos / cerrados"
          valor={indicadores.resueltos}
          detalle="Atendidos satisfactoriamente"
          color="exito"
          icono="✓"
        />
        <TarjetaIndicador
          etiqueta="Pendientes"
          valor={indicadores.pendientes}
          detalle="En proceso o sin atender"
          color="alerta"
          icono="◔"
        />
        <TarjetaIndicador
          etiqueta="SLA vencido"
          valor={indicadores.vencidos}
          detalle="Fuera del tiempo comprometido"
          color={indicadores.vencidos > 0 ? 'peligro' : 'exito'}
          icono="⏱"
        />
      </div>

      {/* ---------------- Indicadores de eficiencia ---------------- */}
      <section className="tarjeta mt-6">
        <div className="tarjeta-encabezado">
          <h2 className="tarjeta-titulo">Eficiencia operativa</h2>
        </div>
        <div className="tarjeta-cuerpo grid gap-6 sm:grid-cols-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Tiempo promedio de resolucion
            </p>
            <p className="mt-1 text-2xl font-bold text-slate-800">
              {indicadores.promedio_horas_resolucion ?? 'N/D'}
              <span className="ml-1 text-sm font-normal text-slate-400">horas</span>
            </p>
          </div>

          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Cumplimiento de SLA
            </p>
            <p className="mt-1 mb-2 text-2xl font-bold text-slate-800">
              {indicadores.porcentaje_cumplimiento_sla ?? 'N/D'}
              <span className="ml-1 text-sm font-normal text-slate-400">%</span>
            </p>
            <BarraProgreso
              valor={Number(indicadores.porcentaje_cumplimiento_sla || 0)}
              color={
                Number(indicadores.porcentaje_cumplimiento_sla || 0) >= 80 ? '#059669' : '#d97706'
              }
            />
          </div>

          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Tasa de resolucion
            </p>
            <p className="mt-1 text-2xl font-bold text-slate-800">
              {indicadores.total_tickets > 0
                ? (
                    (Number(indicadores.resueltos || 0) / Number(indicadores.total_tickets)) *
                    100
                  ).toFixed(1)
                : '0.0'}
              <span className="ml-1 text-sm font-normal text-slate-400">%</span>
            </p>
            <p className="mt-1 text-xs text-slate-400">
              {formatearNumero(indicadores.resueltos)} de{' '}
              {formatearNumero(indicadores.total_tickets)} tickets
            </p>
          </div>
        </div>
      </section>

      {/* ---------------- Graficas ---------------- */}
      <div className="mt-6 grid gap-6 lg:grid-cols-5">
        <section className="tarjeta lg:col-span-2">
          <div className="tarjeta-encabezado">
            <h2 className="tarjeta-titulo">Distribucion por estado</h2>
          </div>
          <div className="tarjeta-cuerpo">
            {datosDona.length > 0 ? (
              <GraficaDona datos={datosDona} />
            ) : (
              <p className="py-10 text-center text-sm text-slate-400">Sin informacion en el periodo.</p>
            )}
          </div>
        </section>

        <section className="tarjeta lg:col-span-3">
          <div className="tarjeta-encabezado">
            <h2 className="tarjeta-titulo">Volumen por categoria</h2>
          </div>
          <div className="tarjeta-cuerpo">
            <GraficaBarras datos={datosBarras} alto={220} />
          </div>
        </section>
      </div>

      <section className="tarjeta mt-6">
        <div className="tarjeta-encabezado">
          <h2 className="tarjeta-titulo">
            Tendencia de creados frente a resueltos ({filtros.dias} dias)
          </h2>
        </div>
        <div className="tarjeta-cuerpo">
          <GraficaTendencia serie={datos?.serieTemporal || []} alto={240} />
        </div>
      </section>

      {/* ---------------- Tabla de desempeno ---------------- */}
      <section className="tarjeta mt-6 overflow-hidden">
        <div className="tarjeta-encabezado">
          <h2 className="tarjeta-titulo">Desempeno detallado por agente</h2>
        </div>

        <div className="overflow-x-auto">
          {(datos?.porAgente || []).length > 0 ? (
            <table className="tabla">
              <thead>
                <tr>
                  <th>Agente</th>
                  <th className="text-center">Asignados</th>
                  <th className="text-center">Resueltos</th>
                  <th className="text-center">Cerrados</th>
                  <th className="text-center">Pendientes</th>
                  <th className="text-right">Hrs. promedio</th>
                  <th className="w-48">Cumplimiento de SLA</th>
                </tr>
              </thead>
              <tbody>
                {datos.porAgente.map((agente) => (
                  <tr key={agente.agente_id}>
                    <td>
                      <p className="font-medium text-slate-800">{agente.agente}</p>
                      <p className="text-xs text-slate-400">{agente.correo_agente}</p>
                    </td>
                    <td className="text-center">{formatearNumero(agente.total_asignados)}</td>
                    <td className="text-center font-semibold text-emerald-700">
                      {formatearNumero(agente.total_resueltos)}
                    </td>
                    <td className="text-center">{formatearNumero(agente.total_cerrados)}</td>
                    <td className="text-center">
                      {agente.total_pendientes > 0 ? (
                        <span className="font-semibold text-amber-700">
                          {formatearNumero(agente.total_pendientes)}
                        </span>
                      ) : (
                        <span className="text-slate-400">0</span>
                      )}
                    </td>
                    <td className="text-right">
                      {agente.promedio_horas_resolucion ?? '-'}
                    </td>
                    <td>
                      {agente.porcentaje_cumplimiento_sla !== null ? (
                        <BarraProgreso
                          valor={Number(agente.porcentaje_cumplimiento_sla)}
                          etiqueta={`${agente.porcentaje_cumplimiento_sla}%`}
                          color={
                            Number(agente.porcentaje_cumplimiento_sla) >= 80 ? '#059669' : '#d97706'
                          }
                        />
                      ) : (
                        <span className="text-xs text-slate-400">Sin tickets resueltos</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="px-5 py-10 text-center text-sm text-slate-400">
              No hay agentes registrados para calcular el desempeno.
            </p>
          )}
        </div>
      </section>

      {/* ---------------- Top solicitantes ---------------- */}
      {(datos?.topSolicitantes || []).length > 0 ? (
        <section className="tarjeta mt-6 overflow-hidden">
          <div className="tarjeta-encabezado">
            <h2 className="tarjeta-titulo">Solicitantes mas activos</h2>
            <span className="text-xs text-slate-400">
              Util para priorizar capacitacion o detectar incidencias recurrentes
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="tabla">
              <thead>
                <tr>
                  <th>Solicitante</th>
                  <th>Correo</th>
                  <th>Departamento</th>
                  <th className="text-right">Tickets registrados</th>
                </tr>
              </thead>
              <tbody>
                {datos.topSolicitantes.map((solicitante) => (
                  <tr key={solicitante.correo}>
                    <td className="font-medium text-slate-800">{solicitante.solicitante}</td>
                    <td className="text-xs text-slate-500">{solicitante.correo}</td>
                    <td className="text-xs text-slate-500">
                      {solicitante.departamento || '—'}
                    </td>
                    <td className="text-right font-semibold">
                      {formatearNumero(solicitante.total_tickets)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      <p className="mt-6 text-center text-xs text-slate-400">
        Datos calculados al {new Date().toLocaleString('es-MX')} · Periodo consultado: {filtros.desde}{' '}
        a {filtros.hasta}
      </p>
    </div>
  );
}
