import { useCallback, useEffect, useState } from 'react';

import { serviciosCategorias } from '../api/servicios';
import { useAvisos } from '../context/AvisosContext';
import { EncabezadoPagina, Cargando, EstadoVacio, MensajeError } from '../componentes/Estados';
import { InsigniaActivo } from '../componentes/Etiquetas';
import Modal, { ModalConfirmacion } from '../componentes/Modal';

/**
 * Catalogo de categorias (solo administradores).
 *
 * Cada categoria define su propio SLA en horas, que es el dato que alimenta
 * el calculo automatico del plazo de atencion en la base de datos. Por eso
 * esta pantalla importa: cambiar un SLA aqui cambia el comportamiento de
 * todos los tickets nuevos de esa categoria.
 */
export default function Categorias() {
  const { exito, advertencia, mostrarError } = useAvisos();

  const [categorias, setCategorias] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState(null);

  const [modalFormulario, setModalFormulario] = useState(null); // null | { categoria? }
  const [modalEliminar, setModalEliminar] = useState(null);
  const [procesando, setProcesando] = useState(false);

  const cargar = useCallback(async () => {
    setCargando(true);
    setError(null);

    try {
      const respuesta = await serviciosCategorias.listar(false);
      setCategorias(respuesta?.datos || []);
    } catch (errorCapturado) {
      setError(errorCapturado);
      mostrarError(errorCapturado, 'No fue posible cargar las categorias');
    } finally {
      setCargando(false);
    }
  }, [mostrarError]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  /** Crea o actualiza segun venga o no el identificador. */
  async function guardar(datos, id = null) {
    setProcesando(true);
    try {
      if (id) {
        await serviciosCategorias.actualizar(id, datos);
        exito('Categoria actualizada', 'Los cambios se aplicaran a los tickets nuevos.');
      } else {
        await serviciosCategorias.crear(datos);
        exito('Categoria creada', 'Ya esta disponible al registrar tickets.');
      }
      setModalFormulario(null);
      await cargar();
    } catch (errorCapturado) {
      mostrarError(errorCapturado, 'No fue posible guardar la categoria');
    } finally {
      setProcesando(false);
    }
  }

  /**
   * Elimina una categoria.
   * El backend rechaza la operacion si tiene tickets asociados y explica
   * cuantos son; se muestra ese mensaje tal cual porque es informativo.
   */
  async function eliminar() {
    if (!modalEliminar) return;

    setProcesando(true);
    try {
      await serviciosCategorias.eliminar(modalEliminar.id);
      setModalEliminar(null);
      advertencia('Categoria eliminada', 'El registro se retiro del catalogo.');
      await cargar();
    } catch (errorCapturado) {
      setModalEliminar(null);
      mostrarError(errorCapturado, 'No fue posible eliminar la categoria');
    } finally {
      setProcesando(false);
    }
  }

  /** Activa o desactiva sin borrar: conserva el historial de tickets. */
  async function alternarActivo(categoria) {
    try {
      await serviciosCategorias.actualizar(categoria.id, { activo: !categoria.activo });
      exito(
        categoria.activo ? 'Categoria desactivada' : 'Categoria activada',
        categoria.activo
          ? 'Ya no se ofrecera al registrar tickets nuevos, pero los existentes la conservan.'
          : 'Vuelve a estar disponible para tickets nuevos.'
      );
      await cargar();
    } catch (errorCapturado) {
      mostrarError(errorCapturado, 'No fue posible cambiar el estado de la categoria');
    }
  }

  if (cargando) return <Cargando mensaje="Cargando el catalogo de categorias..." />;
  if (error) return <MensajeError mensaje={error.message} alReintentar={cargar} />;

  return (
    <div>
      <EncabezadoPagina
        titulo="Categorias"
        descripcion="Clasificacion de tickets y tiempos de atencion comprometidos (SLA)."
        acciones={
          <button
            type="button"
            className="boton-primario"
            onClick={() => setModalFormulario({})}
          >
            + Nueva categoria
          </button>
        }
      />

      <div className="tarjeta overflow-hidden">
        {categorias.length === 0 ? (
          <EstadoVacio
            titulo="El catalogo esta vacio"
            mensaje="Cree al menos una categoria para poder clasificar los tickets y calcular sus plazos de atencion."
            icono="◇"
            accion={
              <button
                type="button"
                className="boton-primario"
                onClick={() => setModalFormulario({})}
              >
                Crear la primera categoria
              </button>
            }
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="tabla">
              <thead>
                <tr>
                  <th>Categoria</th>
                  <th>Descripcion</th>
                  <th className="text-center">SLA comprometido</th>
                  <th className="text-center">Estado</th>
                  <th className="text-right">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {categorias.map((categoria) => (
                  <tr key={categoria.id}>
                    <td className="font-medium text-slate-800">{categoria.nombre}</td>
                    <td className="max-w-md text-xs text-slate-500">
                      {categoria.descripcion || '—'}
                    </td>
                    <td className="text-center">
                      <span
                        className={`insignia ${
                          categoria.sla_horas <= 12
                            ? 'bg-rose-100 text-rose-800'
                            : categoria.sla_horas <= 48
                              ? 'bg-amber-100 text-amber-800'
                              : 'bg-slate-100 text-slate-700'
                        }`}
                      >
                        {categoria.sla_horas} horas
                      </span>
                    </td>
                    <td className="text-center">
                      <InsigniaActivo activo={categoria.activo} />
                    </td>
                    <td className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          type="button"
                          className="boton-secundario boton-pequeno"
                          onClick={() => setModalFormulario({ categoria })}
                        >
                          Editar
                        </button>
                        <button
                          type="button"
                          className="boton-fantasma boton-pequeno"
                          onClick={() => alternarActivo(categoria)}
                        >
                          {categoria.activo ? 'Desactivar' : 'Activar'}
                        </button>
                        <button
                          type="button"
                          className="boton-fantasma boton-pequeno text-rose-600 hover:bg-rose-50"
                          onClick={() => setModalEliminar(categoria)}
                        >
                          Eliminar
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <p className="mt-3 text-xs text-slate-400">
        El SLA se aplica automaticamente al crear un ticket: la base de datos calcula la fecha
        limite sumando estas horas a la fecha de registro.
      </p>

      {/* ---------------- Modales ---------------- */}
      <ModalFormularioCategoria
        estado={modalFormulario}
        alCerrar={() => setModalFormulario(null)}
        alConfirmar={guardar}
        procesando={procesando}
      />

      <ModalConfirmacion
        abierto={Boolean(modalEliminar)}
        alCerrar={() => setModalEliminar(null)}
        alConfirmar={eliminar}
        titulo="Eliminar categoria"
        mensaje={
          modalEliminar
            ? `¿Confirma que desea eliminar la categoria "${modalEliminar.nombre}"? Si tiene tickets asociados, el sistema rechazara la operacion y le indicara cuantos son. En ese caso, desactivela en lugar de eliminarla.`
            : ''
        }
        textoConfirmar="Si, eliminar"
        procesando={procesando}
      />
    </div>
  );
}

/** Modal compartido para crear y editar categorias. */
function ModalFormularioCategoria({ estado, alCerrar, alConfirmar, procesando }) {
  const categoria = estado?.categoria;
  const esEdicion = Boolean(categoria);

  const [formulario, setFormulario] = useState({
    nombre: '',
    descripcion: '',
    slaHoras: 48,
    activo: true,
  });

  useEffect(() => {
    if (estado) {
      setFormulario({
        nombre: categoria?.nombre || '',
        descripcion: categoria?.descripcion || '',
        slaHoras: categoria?.sla_horas ?? 48,
        activo: categoria?.activo ?? true,
      });
    }
  }, [estado, categoria]);

  if (!estado) return null;

  const valido = formulario.nombre.trim().length >= 3 && Number(formulario.slaHoras) > 0;

  return (
    <Modal
      abierto
      alCerrar={alCerrar}
      titulo={esEdicion ? 'Editar categoria' : 'Nueva categoria'}
      descripcion={
        esEdicion
          ? 'Los cambios en el SLA aplican a los tickets que se registren a partir de ahora.'
          : 'Defina un nombre claro y el tiempo maximo de atencion comprometido.'
      }
      pieDePagina={
        <>
          <button type="button" className="boton-secundario" onClick={alCerrar} disabled={procesando}>
            Cancelar
          </button>
          <button
            type="button"
            className="boton-primario"
            disabled={procesando || !valido}
            onClick={() => {
              const datos = {
                nombre: formulario.nombre.trim(),
                slaHoras: Number(formulario.slaHoras),
              };
              if (formulario.descripcion.trim()) datos.descripcion = formulario.descripcion.trim();
              if (esEdicion) datos.activo = formulario.activo;
              alConfirmar(datos, categoria?.id || null);
            }}
          >
            {procesando ? 'Guardando...' : esEdicion ? 'Guardar cambios' : 'Crear categoria'}
          </button>
        </>
      }
    >
      <div className="space-y-4">
        <div>
          <label htmlFor="nombreCategoria" className="etiqueta-campo">
            Nombre <span className="text-rose-600">*</span>
          </label>
          <input
            id="nombreCategoria"
            className="campo"
            maxLength={80}
            placeholder="Ejemplo: Red e Internet"
            value={formulario.nombre}
            onChange={(evento) =>
              setFormulario((actual) => ({ ...actual, nombre: evento.target.value }))
            }
          />
        </div>

        <div>
          <label htmlFor="descripcionCategoria" className="etiqueta-campo">
            Descripcion
          </label>
          <textarea
            id="descripcionCategoria"
            rows={3}
            className="campo resize-y"
            maxLength={255}
            placeholder="Ejemplo: Conectividad, VPN, wifi y acceso a servicios remotos."
            value={formulario.descripcion}
            onChange={(evento) =>
              setFormulario((actual) => ({ ...actual, descripcion: evento.target.value }))
            }
          />
          <p className="texto-ayuda">
            Ayuda al solicitante a elegir la categoria correcta y reduce reclasificaciones.
          </p>
        </div>

        <div>
          <label htmlFor="slaHoras" className="etiqueta-campo">
            SLA en horas <span className="text-rose-600">*</span>
          </label>
          <input
            id="slaHoras"
            type="number"
            min={1}
            max={720}
            className="campo"
            value={formulario.slaHoras}
            onChange={(evento) =>
              setFormulario((actual) => ({ ...actual, slaHoras: evento.target.value }))
            }
          />
          <p className="texto-ayuda">
            Tiempo maximo comprometido para resolver un ticket de esta categoria (1 a 720 horas).
          </p>
        </div>

        {esEdicion ? (
          <label className="flex items-center gap-3 rounded-lg border border-slate-200 px-3 py-2.5">
            <input
              type="checkbox"
              className="h-4 w-4 rounded border-slate-300 text-marca-700 focus:ring-marca-500"
              checked={formulario.activo}
              onChange={(evento) =>
                setFormulario((actual) => ({ ...actual, activo: evento.target.checked }))
              }
            />
            <span className="text-sm text-slate-700">
              Categoria activa (disponible al registrar tickets)
            </span>
          </label>
        ) : null}
      </div>
    </Modal>
  );
}
