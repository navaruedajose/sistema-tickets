import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';

import {
  serviciosTickets,
  serviciosComentarios,
  serviciosAdjuntos,
  serviciosCategorias,
  serviciosUsuarios,
  serviciosNotificaciones,
} from '../api/servicios';
import { useAutenticacion } from '../context/AuthContext';
import { useAvisos } from '../context/AvisosContext';
import { Cargando, MensajeError, EstadoVacio } from '../componentes/Estados';
import { InsigniaEstado, InsigniaPrioridad, InsigniaSla } from '../componentes/Etiquetas';
import Modal, { ModalConfirmacion } from '../componentes/Modal';
import CargadorArchivos from '../componentes/CargadorArchivos';
import {
  ESTADOS_TICKET,
  PRIORIDADES,
  infoEstado,
  transicionesDisponibles,
  formatearFechaHora,
  tiempoRelativo,
  formatearTamano,
  iniciales,
  estaVencido,
  ESTADOS_FINALES,
} from '../utilidades/formato';

/**
 * Detalle del ticket: el centro de trabajo del sistema.
 *
 * Reune en una sola pantalla todo lo que un agente necesita para cerrar un
 * caso sin cambiar de contexto:
 *   - Datos completos y estado del SLA.
 *   - Acciones de flujo (cambiar estado, asignar responsable).
 *   - Conversacion con notas internas.
 *   - Evidencias adjuntas, con carga y descarga.
 *   - Bitacora de auditoria de cambios.
 *
 * Las acciones se muestran segun el rol Y segun el estado del ticket: la
 * interfaz solo ofrece lo que el backend va a aceptar, de modo que el usuario
 * no descubre las reglas de negocio a base de errores 409.
 */

export default function DetalleTicket() {
  const { id } = useParams();
  const navegar = useNavigate();
  const { usuario, esGestor, esAdministrador } = useAutenticacion();
  const { exito, advertencia, mostrarError } = useAvisos();

  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState(null);

  const [ticket, setTicket] = useState(null);
  const [comentarios, setComentarios] = useState([]);
  const [adjuntos, setAdjuntos] = useState([]);
  const [historial, setHistorial] = useState([]);
  const [agentes, setAgentes] = useState([]);
  const [categorias, setCategorias] = useState([]);
  const [notificaciones, setNotificaciones] = useState([]);

  const [nuevoComentario, setNuevoComentario] = useState('');
  const [esNotaInterna, setEsNotaInterna] = useState(false);
  const [enviandoComentario, setEnviandoComentario] = useState(false);

  const [archivosPendientes, setArchivosPendientes] = useState([]);
  const [subiendoArchivos, setSubiendoArchivos] = useState(false);

  const [modalEstado, setModalEstado] = useState(null);
  const [modalAsignar, setModalAsignar] = useState(false);
  const [modalEditar, setModalEditar] = useState(false);
  const [modalEliminar, setModalEliminar] = useState(false);
  const [procesando, setProcesando] = useState(false);

  // ---------------- Carga de datos ----------------
  const cargar = useCallback(async () => {
    setCargando(true);
    setError(null);

    try {
      const [respuestaTicket, respuestaComentarios, respuestaAdjuntos, respuestaHistorial] =
        await Promise.all([
          serviciosTickets.obtener(id),
          serviciosComentarios.listar(id),
          serviciosAdjuntos.listar(id),
          serviciosTickets.historial(id),
        ]);

      setTicket(respuestaTicket?.datos || null);
      setComentarios(respuestaComentarios?.datos || []);
      setAdjuntos(respuestaAdjuntos?.datos || []);
      setHistorial(respuestaHistorial?.datos || []);
    } catch (errorCapturado) {
      setError(errorCapturado);
    } finally {
      setCargando(false);
    }
  }, [id]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  // Datos auxiliares para los formularios de gestion (solo gestores).
  useEffect(() => {
    if (!esGestor) return;

    Promise.all([serviciosUsuarios.agentes(), serviciosCategorias.listar(true)])
      .then(([respuestaAgentes, respuestaCategorias]) => {
        setAgentes(respuestaAgentes?.datos || []);
        setCategorias(respuestaCategorias?.datos || []);
      })
      .catch(() => undefined);
  }, [esGestor]);

  /** Historial de notificaciones (utilidad de soporte para el agente). */
  useEffect(() => {
    if (!esGestor) return;

    serviciosNotificaciones
      .porTicket(id)
      .then((respuesta) => setNotificaciones(respuesta?.datos || []))
      .catch(() => setNotificaciones([]));
  }, [esGestor, id]);

  // ---------------- Acciones ----------------
  async function enviarComentario(evento) {
    evento.preventDefault();
    if (!nuevoComentario.trim()) return;

    setEnviandoComentario(true);
    try {
      await serviciosComentarios.crear(id, {
        contenido: nuevoComentario.trim(),
        esInterno: esNotaInterna,
      });

      setNuevoComentario('');
      setEsNotaInterna(false);
      exito(
        esNotaInterna ? 'Nota interna registrada' : 'Comentario publicado',
        esNotaInterna
          ? 'Solo el equipo de soporte puede ver esta nota.'
          : 'El solicitante recibira una notificacion por correo.'
      );

      const respuesta = await serviciosComentarios.listar(id);
      setComentarios(respuesta?.datos || []);
    } catch (errorCapturado) {
      mostrarError(errorCapturado, 'No fue posible publicar el comentario');
    } finally {
      setEnviandoComentario(false);
    }
  }

  async function subirEvidencias() {
    if (archivosPendientes.length === 0) return;

    setSubiendoArchivos(true);
    try {
      await serviciosAdjuntos.subir(id, archivosPendientes);
      setArchivosPendientes([]);
      exito('Evidencias adjuntadas', 'Los archivos quedaron registrados en el ticket.');

      const respuesta = await serviciosAdjuntos.listar(id);
      setAdjuntos(respuesta?.datos || []);
    } catch (errorCapturado) {
      mostrarError(errorCapturado, 'No fue posible subir las evidencias');
    } finally {
      setSubiendoArchivos(false);
    }
  }

  async function descargarAdjunto(adjunto) {
    try {
      await serviciosAdjuntos.descargar(id, adjunto);
    } catch (errorCapturado) {
      mostrarError(errorCapturado, 'No fue posible descargar el archivo');
    }
  }

  async function eliminarAdjunto(adjunto) {
    if (!window.confirm(`¿Eliminar el archivo "${adjunto.nombre_original}"?`)) return;

    try {
      await serviciosAdjuntos.eliminar(id, adjunto.id);
      setAdjuntos((actuales) => actuales.filter((elemento) => elemento.id !== adjunto.id));
      advertencia('Archivo eliminado', 'La evidencia se retiro del ticket.');
    } catch (errorCapturado) {
      mostrarError(errorCapturado, 'No fue posible eliminar el archivo');
    }
  }

  async function confirmarCambioEstado() {
    if (!modalEstado) return;

    setProcesando(true);
    try {
      const respuesta = await serviciosTickets.cambiarEstado(id, {
        estado: modalEstado.estado,
        solucion: modalEstado.solucion || undefined,
      });

      setTicket(respuesta?.datos || ticket);
      setModalEstado(null);
      exito(
        `Estado actualizado a ${infoEstado(modalEstado.estado).etiqueta}`,
        modalEstado.estado === 'RESUELTO'
          ? 'Se notifico al solicitante por correo electronico.'
          : null
      );

      // El historial cambio: se recarga para reflejar la transicion.
      const respuestaHistorial = await serviciosTickets.historial(id);
      setHistorial(respuestaHistorial?.datos || []);
    } catch (errorCapturado) {
      mostrarError(errorCapturado, 'No fue posible cambiar el estado');
    } finally {
      setProcesando(false);
    }
  }

  async function confirmarAsignacion(agenteId) {
    setProcesando(true);
    try {
      const respuesta = await serviciosTickets.asignarAgente(id, { agenteId: agenteId || null });
      setTicket(respuesta?.datos || ticket);
      setModalAsignar(false);
      exito(
        agenteId ? 'Responsable asignado' : 'Asignacion retirada',
        agenteId ? 'Se notifico al agente por correo electronico.' : null
      );
    } catch (errorCapturado) {
      mostrarError(errorCapturado, 'No fue posible actualizar la asignacion');
    } finally {
      setProcesando(false);
    }
  }

  async function confirmarEdicion(datos) {
    setProcesando(true);
    try {
      const respuesta = await serviciosTickets.actualizar(id, datos);
      setTicket(respuesta?.datos || ticket);
      setModalEditar(false);
      exito('Ticket actualizado', 'Los cambios se guardaron correctamente.');
    } catch (errorCapturado) {
      mostrarError(errorCapturado, 'No fue posible actualizar el ticket');
    } finally {
      setProcesando(false);
    }
  }

  async function confirmarEliminacion() {
    setProcesando(true);
    try {
      await serviciosTickets.eliminar(id);
      setModalEliminar(false);
      advertencia('Ticket eliminado', 'El registro se archivo y ya no aparece en los listados.');
      navegar('/tickets', { replace: true });
    } catch (errorCapturado) {
      mostrarError(errorCapturado, 'No fue posible eliminar el ticket');
    } finally {
      setProcesando(false);
    }
  }

  // ---------------- Estados de la pantalla ----------------
  if (cargando) return <Cargando mensaje="Cargando el ticket..." />;
  if (error) return <MensajeError mensaje={error.message} alReintentar={cargar} />;
  if (!ticket) return <MensajeError mensaje="El ticket no existe o no tiene permisos para verlo." />;

  // ---------------- Calculo de permisos ----------------
  const esSolicitanteDueno = ticket.solicitante_id === usuario?.id;
  const esAgenteAsignado = ticket.agente_id === usuario?.id;
  const ticketFinalizado = ESTADOS_FINALES.includes(ticket.estado);

  const puedeComentar = !ticketFinalizado && (esGestor || esSolicitanteDueno);
  const puedeSubirEvidencias = !ticketFinalizado && (esGestor || esSolicitanteDueno);
  const puedeGestionar = esGestor;
  const puedeEliminar = esAdministrador || esSolicitanteDueno;

  const transiciones = transicionesDisponibles(ticket.estado).filter((estado) => {
    // Un solicitante no puede mover el ticket a estados reservados al agente.
    if (!esGestor && ['EN_PROGRESO', 'EN_ESPERA', 'RESUELTO'].includes(estado)) return false;
    return true;
  });

  return (
    <div>
      {/* ---------------- Encabezado ---------------- */}
      <div className="mb-6">
        <Link
          to="/tickets"
          className="mb-3 inline-flex items-center gap-1 text-xs font-medium text-slate-500 hover:text-slate-700"
        >
          ← Volver a la lista de tickets
        </Link>

        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded bg-slate-800 px-2 py-0.5 font-mono text-xs font-semibold text-white">
                {ticket.codigo}
              </span>
              <InsigniaEstado estado={ticket.estado} punto />
              <InsigniaPrioridad prioridad={ticket.prioridad} />
              <InsigniaSla ticket={ticket} />
            </div>

            <h1 className="mt-2 text-2xl font-bold leading-tight text-slate-900">{ticket.titulo}</h1>

            <p className="mt-1 text-xs text-slate-500">
              Creado por <strong>{ticket.solicitante_nombre}</strong>{' '}
              {tiempoRelativo(ticket.creado_en)} · Categoria:{' '}
              <strong>{ticket.categoria_nombre || 'Sin categoria'}</strong>
            </p>
          </div>

          {/* Acciones */}
          <div className="flex flex-wrap items-center gap-2">
            {puedeGestionar && !ticketFinalizado ? (
              <button type="button" className="boton-secundario" onClick={() => setModalAsignar(true)}>
                {ticket.agente_nombre ? 'Reasignar' : 'Asignar responsable'}
              </button>
            ) : null}

            {puedeGestionar && !ticketFinalizado ? (
              <button type="button" className="boton-secundario" onClick={() => setModalEditar(true)}>
                Editar datos
              </button>
            ) : null}

            {puedeEliminar && !ticketFinalizado ? (
              <button type="button" className="boton-fantasma" onClick={() => setModalEliminar(true)}>
                Eliminar
              </button>
            ) : null}
          </div>
        </div>

        {/* Barra de acciones de flujo */}
        {transiciones.length > 0 ? (
          <div className="mt-4 flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3">
            <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Cambiar estado a:
            </span>
            {transiciones.map((estado) => (
              <button
                key={estado}
                type="button"
                onClick={() => setModalEstado({ estado, solucion: '' })}
                className={
                  estado === 'RESUELTO'
                    ? 'boton bg-emerald-600 text-white hover:bg-emerald-700'
                    : estado === 'CANCELADO'
                      ? 'boton border border-rose-300 bg-white text-rose-700 hover:bg-rose-50'
                      : 'boton-secundario'
                }
              >
                {infoEstado(estado).etiqueta}
              </button>
            ))}
          </div>
        ) : (
          <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
            <p className="text-xs text-slate-500">
              Este ticket se encuentra en un estado final ({infoEstado(ticket.estado).etiqueta}) y ya
              no admite cambios. El historial se conserva para fines de auditoria.
            </p>
          </div>
        )}
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* ================= Columna principal ================= */}
        <div className="space-y-6 lg:col-span-2">
          {/* Descripcion */}
          <section className="tarjeta">
            <div className="tarjeta-encabezado">
              <h2 className="tarjeta-titulo">Descripcion del problema</h2>
            </div>
            <div className="tarjeta-cuerpo">
              <p className="whitespace-pre-line text-sm leading-relaxed text-slate-700">
                {ticket.descripcion}
              </p>
            </div>
          </section>

          {/* Solucion aplicada */}
          {ticket.solucion ? (
            <section className="tarjeta border-emerald-200">
              <div className="tarjeta-encabezado border-emerald-200 bg-emerald-50">
                <h2 className="tarjeta-titulo text-emerald-900">Solucion aplicada</h2>
                <span className="text-xs text-emerald-700">
                  {ticket.fecha_resolucion
                    ? `Resuelto el ${formatearFechaHora(ticket.fecha_resolucion)}`
                    : ''}
                </span>
              </div>
              <div className="tarjeta-cuerpo">
                <p className="whitespace-pre-line text-sm leading-relaxed text-slate-700">
                  {ticket.solucion}
                </p>
              </div>
            </section>
          ) : null}

          {/* ---------------- Evidencias ---------------- */}
          <section className="tarjeta">
            <div className="tarjeta-encabezado">
              <h2 className="tarjeta-titulo">
                Evidencias{' '}
                <span className="ml-1 text-xs font-normal text-slate-400">
                  ({adjuntos.length})
                </span>
              </h2>
            </div>

            <div className="tarjeta-cuerpo space-y-4">
              {adjuntos.length > 0 ? (
                <ul className="space-y-2">
                  {adjuntos.map((adjunto) => (
                    <li
                      key={adjunto.id}
                      className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 px-3 py-2.5"
                    >
                      <div className="flex min-w-0 items-center gap-3">
                        <span aria-hidden="true" className="text-xl">
                          {iconoPorMime(adjunto.mime_type)}
                        </span>
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium text-slate-700">
                            {adjunto.nombre_original}
                          </p>
                          <p className="text-xs text-slate-400">
                            {formatearTamano(adjunto.tamano_bytes)} · subido por{' '}
                            {adjunto.subido_por_nombre} · {tiempoRelativo(adjunto.creado_en)}
                          </p>
                        </div>
                      </div>

                      <div className="flex shrink-0 items-center gap-1">
                        <button
                          type="button"
                          className="boton-secundario boton-pequeno"
                          onClick={() => descargarAdjunto(adjunto)}
                        >
                          Descargar
                        </button>
                        {!ticketFinalizado &&
                        (adjunto.subido_por === usuario?.id || esAdministrador) ? (
                          <button
                            type="button"
                            className="rounded p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600"
                            onClick={() => eliminarAdjunto(adjunto)}
                            aria-label={`Eliminar ${adjunto.nombre_original}`}
                          >
                            ×
                          </button>
                        ) : null}
                      </div>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-slate-400">
                  Este ticket no tiene evidencias adjuntas.
                </p>
              )}

              {puedeSubirEvidencias ? (
                <div className="border-t border-slate-200 pt-4">
                  <CargadorArchivos
                    archivos={archivosPendientes}
                    alCambiar={setArchivosPendientes}
                    deshabilitado={subiendoArchivos}
                  />

                  {archivosPendientes.length > 0 ? (
                    <div className="mt-3 flex justify-end">
                      <button
                        type="button"
                        className="boton-primario"
                        onClick={subirEvidencias}
                        disabled={subiendoArchivos}
                      >
                        {subiendoArchivos
                          ? 'Subiendo...'
                          : `Subir ${archivosPendientes.length} archivo(s)`}
                      </button>
                    </div>
                  ) : null}
                </div>
              ) : null}
            </div>
          </section>

          {/* ---------------- Comentarios ---------------- */}
          <section className="tarjeta">
            <div className="tarjeta-encabezado">
              <h2 className="tarjeta-titulo">
                Conversacion{' '}
                <span className="ml-1 text-xs font-normal text-slate-400">
                  ({comentarios.length})
                </span>
              </h2>
            </div>

            <div className="tarjeta-cuerpo space-y-4">
              {comentarios.length > 0 ? (
                <ul className="space-y-4">
                  {comentarios.map((comentario) => (
                    <li
                      key={comentario.id}
                      className={`rounded-lg border px-4 py-3 ${
                        comentario.es_interno
                          ? 'border-amber-200 bg-amber-50'
                          : 'border-slate-200 bg-white'
                      }`}
                    >
                      <div className="flex items-start gap-3">
                        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-200 text-xs font-bold text-slate-600">
                          {iniciales(comentario.autor_nombre)}
                        </span>

                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="text-sm font-semibold text-slate-800">
                              {comentario.autor_nombre}
                            </p>
                            <span className="text-xs text-slate-400">
                              {formatearFechaHora(comentario.creado_en)}
                            </span>
                            {comentario.es_interno ? (
                              <span className="rounded bg-amber-200 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-amber-900">
                                Nota interna
                              </span>
                            ) : null}
                          </div>

                          <p className="mt-1.5 whitespace-pre-line text-sm leading-relaxed text-slate-700">
                            {comentario.contenido}
                          </p>
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              ) : (
                <EstadoVacio
                  titulo="Sin comentarios"
                  mensaje="Inicie la conversacion agregando informacion adicional sobre el caso."
                  icono="💬"
                />
              )}

              {/* Formulario de comentario */}
              {puedeComentar ? (
                <form onSubmit={enviarComentario} className="border-t border-slate-200 pt-4">
                  <label htmlFor="comentario" className="etiqueta-campo">
                    {esNotaInterna ? 'Nota interna (solo el equipo de soporte la vera)' : 'Nuevo comentario'}
                  </label>
                  <textarea
                    id="comentario"
                    rows={3}
                    className="campo resize-y"
                    placeholder={
                      esNotaInterna
                        ? 'Ejemplo: se solicito al proveedor la reposicion del equipo...'
                        : 'Escriba su mensaje...'
                    }
                    maxLength={3000}
                    value={nuevoComentario}
                    onChange={(evento) => setNuevoComentario(evento.target.value)}
                  />

                  <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
                    {esGestor ? (
                      <label className="flex items-center gap-2 text-xs text-slate-600">
                        <input
                          type="checkbox"
                          className="h-4 w-4 rounded border-slate-300 text-amber-600 focus:ring-amber-500"
                          checked={esNotaInterna}
                          onChange={(evento) => setEsNotaInterna(evento.target.checked)}
                        />
                        Marcar como nota interna (no se notifica al solicitante)
                      </label>
                    ) : (
                      <span />
                    )}

                    <button
                      type="submit"
                      className="boton-primario"
                      disabled={enviandoComentario || !nuevoComentario.trim()}
                    >
                      {enviandoComentario ? 'Publicando...' : 'Publicar'}
                    </button>
                  </div>
                </form>
              ) : (
                <p className="border-t border-slate-200 pt-4 text-xs text-slate-400">
                  El ticket esta en un estado final: no admite nuevos comentarios.
                </p>
              )}
            </div>
          </section>
        </div>

        {/* ================= Columna lateral ================= */}
        <div className="space-y-6">
          {/* Ficha del ticket */}
          <section className="tarjeta">
            <div className="tarjeta-encabezado">
              <h2 className="tarjeta-titulo">Ficha del ticket</h2>
            </div>
            <dl className="divide-y divide-slate-100">
              <FilaDato etiqueta="Estado">
                <InsigniaEstado estado={ticket.estado} punto />
              </FilaDato>
              <FilaDato etiqueta="Prioridad">
                <InsigniaPrioridad prioridad={ticket.prioridad} />
              </FilaDato>
              <FilaDato etiqueta="Categoria">{ticket.categoria_nombre || 'Sin categoria'}</FilaDato>
              <FilaDato etiqueta="Solicitante">
                <span className="text-sm">{ticket.solicitante_nombre}</span>
                <span className="block text-xs text-slate-400">{ticket.solicitante_correo}</span>
              </FilaDato>
              <FilaDato etiqueta="Responsable">
                {ticket.agente_nombre ? (
                  <>
                    <span className="text-sm">{ticket.agente_nombre}</span>
                    <span className="block text-xs text-slate-400">{ticket.agente_correo}</span>
                  </>
                ) : (
                  <span className="text-xs text-amber-700">Sin asignar</span>
                )}
              </FilaDato>
              <FilaDato etiqueta="Creado">{formatearFechaHora(ticket.creado_en)}</FilaDato>
              <FilaDato etiqueta="Limite SLA">
                <span className={estaVencido(ticket) ? 'font-semibold text-rose-700' : ''}>
                  {formatearFechaHora(ticket.fecha_limite_sla)}
                </span>
              </FilaDato>
              {ticket.fecha_resolucion ? (
                <FilaDato etiqueta="Resuelto">{formatearFechaHora(ticket.fecha_resolucion)}</FilaDato>
              ) : null}
              {ticket.fecha_cierre ? (
                <FilaDato etiqueta="Cerrado">{formatearFechaHora(ticket.fecha_cierre)}</FilaDato>
              ) : null}
              <FilaDato etiqueta="Ultima actualizacion">
                {tiempoRelativo(ticket.actualizado_en)}
              </FilaDato>
            </dl>
          </section>

          {/* Bitacora de auditoria */}
          <section className="tarjeta">
            <div className="tarjeta-encabezado">
              <h2 className="tarjeta-titulo">Bitacora de cambios</h2>
            </div>

            {historial.length > 0 ? (
              <ol className="relative space-y-4 px-5 py-4">
                {historial.map((entrada, indice) => (
                  <li key={entrada.id} className="relative pl-6">
                    {/* Linea vertical que conecta los eventos */}
                    {indice < historial.length - 1 ? (
                      <span
                        aria-hidden="true"
                        className="absolute left-[5px] top-4 h-full w-px bg-slate-200"
                      />
                    ) : null}
                    <span
                      aria-hidden="true"
                      className={`absolute left-0 top-1.5 h-2.5 w-2.5 rounded-full ${
                        indice === historial.length - 1 ? 'bg-marca-600' : 'bg-slate-300'
                      }`}
                    />

                    <p className="text-xs font-medium text-slate-700">
                      {entrada.estado_anterior ? (
                        <>
                          {infoEstado(entrada.estado_anterior).etiqueta} →{' '}
                          <strong>{infoEstado(entrada.estado_nuevo).etiqueta}</strong>
                        </>
                      ) : (
                        <>Ticket creado en estado {infoEstado(entrada.estado_nuevo).etiqueta}</>
                      )}
                    </p>
                    <p className="mt-0.5 text-[11px] text-slate-400">
                      {formatearFechaHora(entrada.creado_en)}
                      {entrada.usuario_nombre ? ` · ${entrada.usuario_nombre}` : ''}
                    </p>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="px-5 py-4 text-sm text-slate-400">Sin cambios registrados.</p>
            )}
          </section>

          {/* Notificaciones (solo gestores) */}
          {esGestor && notificaciones.length > 0 ? (
            <section className="tarjeta">
              <div className="tarjeta-encabezado">
                <h2 className="tarjeta-titulo">Notificaciones enviadas</h2>
              </div>
              <ul className="divide-y divide-slate-100">
                {notificaciones.slice(0, 8).map((notificacion) => (
                  <li key={notificacion.id} className="px-5 py-2.5">
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate text-xs font-medium text-slate-700">
                        {notificacion.destinatario}
                      </span>
                      <span
                        className={`insignia text-[10px] ${
                          notificacion.estado === 'ENVIADO'
                            ? 'bg-emerald-100 text-emerald-800'
                            : notificacion.estado === 'FALLIDO'
                              ? 'bg-rose-100 text-rose-800'
                              : 'bg-amber-100 text-amber-800'
                        }`}
                      >
                        {notificacion.estado}
                      </span>
                    </div>
                    <p className="mt-0.5 text-[11px] text-slate-400">
                      {notificacion.canal} · {tiempoRelativo(notificacion.creado_en)}
                    </p>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </div>
      </div>

      {/* ================= Modales ================= */}
      <ModalEstado
        modalEstado={modalEstado}
        alCerrar={() => setModalEstado(null)}
        alConfirmar={confirmarCambioEstado}
        procesando={procesando}
        esGestor={esGestor}
      />

      <ModalAsignar
        abierto={modalAsignar}
        alCerrar={() => setModalAsignar(false)}
        agentes={agentes}
        agenteActual={ticket.agente_id}
        alConfirmar={confirmarAsignacion}
        procesando={procesando}
      />

      <ModalEditar
        abierto={modalEditar}
        alCerrar={() => setModalEditar(false)}
        ticket={ticket}
        categorias={categorias}
        alConfirmar={confirmarEdicion}
        procesando={procesando}
      />

      <ModalConfirmacion
        abierto={modalEliminar}
        alCerrar={() => setModalEliminar(false)}
        alConfirmar={confirmarEliminacion}
        titulo="Eliminar ticket"
        mensaje={`¿Confirma que desea eliminar el ticket ${ticket.codigo}? El registro se archivara y dejara de aparecer en los listados, pero el historial se conserva para auditoria.`}
        textoConfirmar="Si, eliminar"
        procesando={procesando}
      />
    </div>
  );
}

// =====================================================================
// Subcomponentes
// =====================================================================

/** Fila de la ficha lateral. */
function FilaDato({ etiqueta, children }) {
  return (
    <div className="flex items-start justify-between gap-4 px-5 py-2.5">
      <dt className="shrink-0 text-xs font-medium text-slate-500">{etiqueta}</dt>
      <dd className="min-w-0 text-right">{children}</dd>
    </div>
  );
}

/** Modal de cambio de estado. Exige solucion cuando el destino es RESUELTO. */
function ModalEstado({ modalEstado, alCerrar, alConfirmar, procesando, esGestor }) {
  const [solucion, setSolucion] = useState('');

  useEffect(() => {
    setSolucion('');
  }, [modalEstado]);

  if (!modalEstado) return null;

  const requiereSolucion = modalEstado.estado === 'RESUELTO';
  const solucionValida = !requiereSolucion || solucion.trim().length >= 10;

  return (
    <Modal
      abierto
      alCerrar={alCerrar}
      titulo={`Cambiar estado a ${infoEstado(modalEstado.estado).etiqueta}`}
      descripcion={infoEstado(modalEstado.estado).descripcion}
      pieDePagina={
        <>
          <button type="button" className="boton-secundario" onClick={alCerrar} disabled={procesando}>
            Cancelar
          </button>
          <button
            type="button"
            className={modalEstado.estado === 'RESUELTO' ? 'boton bg-emerald-600 text-white hover:bg-emerald-700' : 'boton-primario'}
            onClick={() => alConfirmar({ ...modalEstado, solucion })}
            disabled={procesando || !solucionValida}
          >
            {procesando ? 'Aplicando...' : 'Confirmar cambio'}
          </button>
        </>
      }
    >
      {requiereSolucion ? (
        <div>
          <label htmlFor="solucion" className="etiqueta-campo">
            Solucion aplicada <span className="text-rose-600">*</span>
          </label>
          <textarea
            id="solucion"
            rows={5}
            className="campo resize-y"
            placeholder="Describa que se hizo para resolver el problema. Esta informacion se envia al solicitante y queda en el historial del ticket."
            maxLength={5000}
            value={solucion}
            onChange={(evento) => setSolucion(evento.target.value)}
          />
          <p className="texto-ayuda">
            Minimo 10 caracteres. El solicitante recibira una notificacion con este texto.
          </p>
        </div>
      ) : (
        <div className="space-y-3 text-sm text-slate-600">
          <p>
            El ticket pasara de <strong>{infoEstado(modalEstado.estado).etiqueta}</strong>. Esta
            accion queda registrada en la bitacora de auditoria.
          </p>
          {modalEstado.estado === 'CANCELADO' ? (
            <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
              Un ticket cancelado no admite cambios posteriores. Utilicelo solo cuando la solicitud
              ya no sea procedente.
            </p>
          ) : null}
          {!esGestor && modalEstado.estado === 'CERRADO' ? (
            <p className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-800">
              Al cerrar el ticket confirma que el problema quedo resuelto satisfactoriamente.
            </p>
          ) : null}
        </div>
      )}
    </Modal>
  );
}

/** Modal de asignacion de responsable, ordenado por carga de trabajo. */
function ModalAsignar({ abierto, alCerrar, agentes, agenteActual, alConfirmar, procesando }) {
  const [seleccionado, setSeleccionado] = useState(agenteActual || '');

  useEffect(() => {
    setSeleccionado(agenteActual || '');
  }, [agenteActual, abierto]);

  return (
    <Modal
      abierto={abierto}
      alCerrar={alCerrar}
      titulo="Asignar responsable"
      descripcion="Los agentes aparecen ordenados por carga de trabajo actual."
      pieDePagina={
        <>
          <button type="button" className="boton-secundario" onClick={alCerrar} disabled={procesando}>
            Cancelar
          </button>
          <button
            type="button"
            className="boton-primario"
            onClick={() => alConfirmar(seleccionado || null)}
            disabled={procesando}
          >
            {procesando ? 'Guardando...' : 'Guardar asignacion'}
          </button>
        </>
      }
    >
      <div className="space-y-2">
        <label className="flex cursor-pointer items-center gap-3 rounded-lg border border-slate-200 px-3 py-2.5 hover:bg-slate-50">
          <input
            type="radio"
            name="agente"
            className="h-4 w-4 text-marca-700 focus:ring-marca-500"
            checked={seleccionado === ''}
            onChange={() => setSeleccionado('')}
          />
          <span className="text-sm text-slate-600">Sin asignar (volver a la cola general)</span>
        </label>

        {agentes.map((agente) => (
          <label
            key={agente.id}
            className="flex cursor-pointer items-center justify-between gap-3 rounded-lg border border-slate-200 px-3 py-2.5 hover:bg-slate-50"
          >
            <span className="flex items-center gap-3">
              <input
                type="radio"
                name="agente"
                className="h-4 w-4 text-marca-700 focus:ring-marca-500"
                checked={seleccionado === agente.id}
                onChange={() => setSeleccionado(agente.id)}
              />
              <span>
                <span className="block text-sm font-medium text-slate-700">
                  {agente.nombre_completo}
                </span>
                <span className="block text-xs text-slate-400">{agente.correo}</span>
              </span>
            </span>

            <span
              className={`insignia text-[10px] ${
                agente.tickets_activos >= 5
                  ? 'bg-rose-100 text-rose-800'
                  : agente.tickets_activos >= 3
                    ? 'bg-amber-100 text-amber-800'
                    : 'bg-emerald-100 text-emerald-800'
              }`}
            >
              {agente.tickets_activos} activo(s)
            </span>
          </label>
        ))}

        {agentes.length === 0 ? (
          <p className="py-4 text-center text-sm text-slate-400">
            No hay agentes activos disponibles para asignar.
          </p>
        ) : null}
      </div>
    </Modal>
  );
}

/** Modal de edicion de los datos descriptivos del ticket. */
function ModalEditar({ abierto, alCerrar, ticket, categorias, alConfirmar, procesando }) {
  const [formulario, setFormulario] = useState({
    titulo: ticket?.titulo || '',
    descripcion: ticket?.descripcion || '',
    categoriaId: ticket?.categoria_id || '',
    prioridad: ticket?.prioridad || 'MEDIA',
  });

  useEffect(() => {
    if (abierto) {
      setFormulario({
        titulo: ticket?.titulo || '',
        descripcion: ticket?.descripcion || '',
        categoriaId: ticket?.categoria_id || '',
        prioridad: ticket?.prioridad || 'MEDIA',
      });
    }
  }, [abierto, ticket]);

  const valido = formulario.titulo.trim().length >= 5 && formulario.descripcion.trim().length >= 10;

  return (
    <Modal
      abierto={abierto}
      alCerrar={alCerrar}
      titulo="Editar datos del ticket"
      descripcion="Solo se modifican los campos descriptivos. El estado se cambia desde las acciones de flujo."
      ancho="max-w-2xl"
      pieDePagina={
        <>
          <button type="button" className="boton-secundario" onClick={alCerrar} disabled={procesando}>
            Cancelar
          </button>
          <button
            type="button"
            className="boton-primario"
            onClick={() =>
              alConfirmar({
                titulo: formulario.titulo.trim(),
                descripcion: formulario.descripcion.trim(),
                categoriaId: formulario.categoriaId || null,
                prioridad: formulario.prioridad,
              })
            }
            disabled={procesando || !valido}
          >
            {procesando ? 'Guardando...' : 'Guardar cambios'}
          </button>
        </>
      }
    >
      <div className="space-y-4">
        <div>
          <label htmlFor="editarTitulo" className="etiqueta-campo">
            Titulo
          </label>
          <input
            id="editarTitulo"
            className="campo"
            maxLength={200}
            value={formulario.titulo}
            onChange={(evento) => setFormulario((actual) => ({ ...actual, titulo: evento.target.value }))}
          />
        </div>

        <div>
          <label htmlFor="editarDescripcion" className="etiqueta-campo">
            Descripcion
          </label>
          <textarea
            id="editarDescripcion"
            rows={5}
            className="campo resize-y"
            maxLength={5000}
            value={formulario.descripcion}
            onChange={(evento) =>
              setFormulario((actual) => ({ ...actual, descripcion: evento.target.value }))
            }
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="editarCategoria" className="etiqueta-campo">
              Categoria
            </label>
            <select
              id="editarCategoria"
              className="campo"
              value={formulario.categoriaId || ''}
              onChange={(evento) =>
                setFormulario((actual) => ({ ...actual, categoriaId: evento.target.value }))
              }
            >
              <option value="">Sin categoria</option>
              {categorias.map((categoria) => (
                <option key={categoria.id} value={categoria.id}>
                  {categoria.nombre}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="editarPrioridad" className="etiqueta-campo">
              Prioridad
            </label>
            <select
              id="editarPrioridad"
              className="campo"
              value={formulario.prioridad}
              onChange={(evento) =>
                setFormulario((actual) => ({ ...actual, prioridad: evento.target.value }))
              }
            >
              {Object.entries(PRIORIDADES).map(([clave, info]) => (
                <option key={clave} value={clave}>
                  {info.etiqueta}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>
    </Modal>
  );
}

/** Icono segun el tipo MIME del adjunto. */
function iconoPorMime(mime) {
  if (mime?.startsWith('image/')) return '🖼️';
  if (mime === 'application/pdf') return '📕';
  if (mime?.includes('spreadsheet') || mime === 'text/csv') return '📊';
  if (mime?.includes('wordprocessing')) return '📄';
  if (mime === 'application/zip') return '🗜️';
  return '📎';
}
