import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';

import { serviciosTickets, serviciosCategorias, serviciosAdjuntos } from '../api/servicios';
import { useAutenticacion } from '../context/AuthContext';
import { useAvisos } from '../context/AvisosContext';
import { EncabezadoPagina } from '../componentes/Estados';
import CargadorArchivos from '../componentes/CargadorArchivos';
import { PRIORIDADES } from '../utilidades/formato';

/**
 * Formulario de creacion de ticket.
 *
 * Detalle de diseno importante: el ticket se crea PRIMERO y las evidencias se
 * suben DESPUES, porque el endpoint de adjuntos es un subrecurso
 * (`/tickets/:id/adjuntos`) y necesita el identificador del ticket.
 *
 * Si la creacion del ticket tiene exito pero la carga de archivos falla, NO se
 * pierde el ticket: se informa al usuario y se le ofrece continuar. Preferimos
 * un ticket sin evidencia a un ticket perdido. Eso es lo que significa
 * "tolerancia a fallos parciales" aplicada al caso real.
 */

const CATEGORIA_VACIA = { id: '', nombre: 'Seleccione una categoria...', sla_horas: null };

export default function NuevoTicket() {
  const { usuario } = useAutenticacion();
  const { exito, advertencia, mostrarError } = useAvisos();
  const navegar = useNavigate();

  const [formulario, setFormulario] = useState({
    titulo: '',
    descripcion: '',
    categoriaId: '',
    prioridad: 'MEDIA',
  });

  const [archivos, setArchivos] = useState([]);
  const [categorias, setCategorias] = useState([]);
  const [cargandoCategorias, setCargandoCategorias] = useState(true);
  const [enviando, setEnviando] = useState(false);
  const [erroresCampo, setErroresCampo] = useState({});

  // Se cargan solo las categorias activas: no tiene sentido ofrecer una
  // categoria desactivada que el backend rechazaria.
  useEffect(() => {
    let vigente = true;

    serviciosCategorias
      .listar(true)
      .then((respuesta) => {
        if (vigente) setCategorias(respuesta?.datos || []);
      })
      .catch(() => {
        if (vigente) setCategorias([]);
      })
      .finally(() => {
        if (vigente) setCargandoCategorias(false);
      });

    return () => {
      vigente = false;
    };
  }, []);

  const categoriaSeleccionada = categorias.find((categoria) => categoria.id === formulario.categoriaId);

  function actualizarCampo(campo, valor) {
    setFormulario((actual) => ({ ...actual, [campo]: valor }));
    if (erroresCampo[campo]) {
      setErroresCampo((actual) => ({ ...actual, [campo]: undefined }));
    }
  }

  function validar() {
    const nuevos = {};

    if (formulario.titulo.trim().length < 5) {
      nuevos.titulo = 'El titulo debe tener al menos 5 caracteres.';
    }
    if (formulario.descripcion.trim().length < 10) {
      nuevos.descripcion = 'Describa el problema con al menos 10 caracteres.';
    }

    setErroresCampo(nuevos);
    return Object.keys(nuevos).length === 0;
  }

  async function manejarEnvio(evento) {
    evento.preventDefault();
    if (!validar()) return;

    setEnviando(true);

    let ticketCreado = null;

    try {
      // --- Paso 1: crear el ticket ---
      const carga = {
        titulo: formulario.titulo.trim(),
        descripcion: formulario.descripcion.trim(),
        prioridad: formulario.prioridad,
      };
      if (formulario.categoriaId) carga.categoriaId = formulario.categoriaId;

      const respuesta = await serviciosTickets.crear(carga);
      ticketCreado = respuesta?.datos;

      exito(
        `Ticket ${ticketCreado.codigo} creado`,
        'Se envio una confirmacion a su correo electronico.'
      );

      // --- Paso 2: subir evidencias (opcional, tolerante a fallos) ---
      if (archivos.length > 0) {
        try {
          await serviciosAdjuntos.subir(ticketCreado.id, archivos);
          exito(
            `${archivos.length} archivo(s) adjuntado(s)`,
            'Las evidencias quedaron registradas en el ticket.'
          );
        } catch (errorArchivos) {
          // El ticket ya existe: se informa del fallo parcial y se continua.
          advertencia(
            'El ticket se creo, pero no se pudieron subir las evidencias',
            `${errorArchivos.message} Puede intentarlo de nuevo desde el detalle del ticket.`
          );
        }
      }

      navegar(`/tickets/${ticketCreado.id}`, { replace: true });
    } catch (error) {
      const porCampo = error?.erroresPorCampo || {};
      if (Object.keys(porCampo).length > 0) {
        const normalizados = {};
        Object.entries(porCampo).forEach(([clave, mensaje]) => {
          normalizados[clave.replace(/^body\./, '')] = mensaje;
        });
        setErroresCampo(normalizados);
      } else {
        mostrarError(error, 'No fue posible crear el ticket');
      }
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="mx-auto max-w-3xl">
      <EncabezadoPagina
        titulo="Nuevo ticket"
        descripcion="Describa su incidencia con el mayor detalle posible para agilizar su atencion."
        acciones={
          <Link to="/tickets" className="boton-secundario">
            Cancelar
          </Link>
        }
      />

      <form onSubmit={manejarEnvio} className="space-y-6" noValidate>
        {/* ---------------- Datos del ticket ---------------- */}
        <section className="tarjeta">
          <div className="tarjeta-encabezado">
            <h2 className="tarjeta-titulo">Informacion del problema</h2>
          </div>

          <div className="tarjeta-cuerpo space-y-5">
            {/* Titulo */}
            <div>
              <label htmlFor="titulo" className="etiqueta-campo">
                Titulo <span className="text-rose-600">*</span>
              </label>
              <input
                id="titulo"
                className="campo"
                placeholder="Ejemplo: La impresora del piso 3 no imprime"
                maxLength={200}
                value={formulario.titulo}
                onChange={(evento) => actualizarCampo('titulo', evento.target.value)}
                aria-invalid={Boolean(erroresCampo.titulo)}
              />
              <div className="flex items-center justify-between">
                {erroresCampo.titulo ? (
                  <p className="texto-error">{erroresCampo.titulo}</p>
                ) : (
                  <p className="texto-ayuda">Un titulo claro permite ubicar el caso rapidamente.</p>
                )}
                <span className="texto-ayuda">{formulario.titulo.length}/200</span>
              </div>
            </div>

            {/* Descripcion */}
            <div>
              <label htmlFor="descripcion" className="etiqueta-campo">
                Descripcion detallada <span className="text-rose-600">*</span>
              </label>
              <textarea
                id="descripcion"
                rows={6}
                className="campo resize-y"
                placeholder="Describa que ocurrio, cuando comenzo, que estaba haciendo y a cuantas personas afecta. Si aparece un mensaje de error, transcribalo tal cual."
                maxLength={5000}
                value={formulario.descripcion}
                onChange={(evento) => actualizarCampo('descripcion', evento.target.value)}
                aria-invalid={Boolean(erroresCampo.descripcion)}
              />
              <div className="flex items-center justify-between">
                {erroresCampo.descripcion ? (
                  <p className="texto-error">{erroresCampo.descripcion}</p>
                ) : (
                  <p className="texto-ayuda">
                    Incluya el mensaje de error exacto si lo hay: ahorra una ronda de preguntas.
                  </p>
                )}
                <span className="texto-ayuda">{formulario.descripcion.length}/5000</span>
              </div>
            </div>

            {/* Categoria y prioridad */}
            <div className="grid gap-5 sm:grid-cols-2">
              <div>
                <label htmlFor="categoria" className="etiqueta-campo">
                  Categoria
                </label>
                <select
                  id="categoria"
                  className="campo"
                  value={formulario.categoriaId}
                  onChange={(evento) => actualizarCampo('categoriaId', evento.target.value)}
                  disabled={cargandoCategorias}
                >
                  <option value="">{CATEGORIA_VACIA.nombre}</option>
                  {categorias.map((categoria) => (
                    <option key={categoria.id} value={categoria.id}>
                      {categoria.nombre}
                    </option>
                  ))}
                </select>

                {categoriaSeleccionada ? (
                  <p className="texto-ayuda">
                    Tiempo de respuesta comprometido (SLA):{' '}
                    <strong>{categoriaSeleccionada.sla_horas} horas</strong>
                  </p>
                ) : (
                  <p className="texto-ayuda">
                    La categoria define el tiempo de atencion comprometido.
                  </p>
                )}
              </div>

              <div>
                <label htmlFor="prioridad" className="etiqueta-campo">
                  Prioridad
                </label>
                <select
                  id="prioridad"
                  className="campo"
                  value={formulario.prioridad}
                  onChange={(evento) => actualizarCampo('prioridad', evento.target.value)}
                >
                  {Object.entries(PRIORIDADES).map(([clave, info]) => (
                    <option key={clave} value={clave}>
                      {info.etiqueta}
                    </option>
                  ))}
                </select>
                <p className="texto-ayuda">
                  Reservada para casos que impiden trabajar por completo.
                </p>
              </div>
            </div>

            {/* Datos del solicitante (solo lectura) */}
            <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Solicitante
              </p>
              <p className="mt-1 text-sm font-medium text-slate-800">{usuario?.nombre_completo}</p>
              <p className="text-xs text-slate-500">{usuario?.correo}</p>
            </div>
          </div>
        </section>

        {/* ---------------- Evidencias ---------------- */}
        <section className="tarjeta">
          <div className="tarjeta-encabezado">
            <div>
              <h2 className="tarjeta-titulo">Evidencias (opcional)</h2>
              <p className="mt-0.5 text-xs text-slate-500">
                Capturas de pantalla, archivos PDF o registros que ayuden a diagnosticar el problema.
              </p>
            </div>
          </div>

          <div className="tarjeta-cuerpo">
            <CargadorArchivos archivos={archivos} alCambiar={setArchivos} deshabilitado={enviando} />
          </div>
        </section>

        {/* ---------------- Acciones ---------------- */}
        <div className="flex flex-wrap items-center justify-end gap-3">
          <Link to="/tickets" className="boton-secundario">
            Cancelar
          </Link>
          <button type="submit" className="boton-primario" disabled={enviando}>
            {enviando
              ? archivos.length > 0
                ? 'Creando ticket y subiendo evidencias...'
                : 'Creando ticket...'
              : 'Crear ticket'}
          </button>
        </div>
      </form>
    </div>
  );
}
