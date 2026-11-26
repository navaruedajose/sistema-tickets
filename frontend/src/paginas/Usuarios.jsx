import { useCallback, useEffect, useState } from 'react';

import { serviciosUsuarios, serviciosAutenticacion } from '../api/servicios';
import { useAutenticacion } from '../context/AuthContext';
import { useAvisos } from '../context/AvisosContext';
import { EncabezadoPagina, EsqueletoTabla, EstadoVacio, MensajeError } from '../componentes/Estados';
import { InsigniaRol, InsigniaActivo } from '../componentes/Etiquetas';
import Modal, { ModalConfirmacion } from '../componentes/Modal';
import Paginacion from '../componentes/Paginacion';
import {
  ROLES,
  formatearFechaHora,
  tiempoRelativo,
  iniciales,
  formatearNumero,
} from '../utilidades/formato';

/**
 * Administracion de usuarios (solo administradores).
 *
 * Ademas del listado, permite crear cuentas internas con rol AGENTE o
 * ADMINISTRADOR. Ese alta pasa por el endpoint protegido
 * `POST /auth/usuarios`, que exige rol de administrador: el registro publico
 * jamas puede crear un agente ni un administrador.
 */
export default function Usuarios() {
  const { usuario: usuarioActual } = useAutenticacion();
  const { exito, advertencia, mostrarError } = useAvisos();

  const [filtros, setFiltros] = useState({
    pagina: 1,
    limite: 20,
    rol: '',
    activo: '',
    busqueda: '',
  });

  const [textoBusqueda, setTextoBusqueda] = useState('');
  const [usuarios, setUsuarios] = useState([]);
  const [meta, setMeta] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState(null);

  const [modalCrear, setModalCrear] = useState(false);
  const [modalEditar, setModalEditar] = useState(null);
  const [modalDesactivar, setModalDesactivar] = useState(null);
  const [procesando, setProcesando] = useState(false);

  const cargar = useCallback(async () => {
    setCargando(true);
    setError(null);

    try {
      const respuesta = await serviciosUsuarios.listar({
        pagina: filtros.pagina,
        limite: filtros.limite,
        rol: filtros.rol || undefined,
        activo: filtros.activo || undefined,
        busqueda: filtros.busqueda || undefined,
      });

      setUsuarios(respuesta?.datos || []);
      setMeta(respuesta?.meta?.paginacion || null);
    } catch (errorCapturado) {
      setError(errorCapturado);
      mostrarError(errorCapturado, 'No fue posible cargar los usuarios');
    } finally {
      setCargando(false);
    }
  }, [filtros.pagina, filtros.limite, filtros.rol, filtros.activo, filtros.busqueda, mostrarError]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  // Debounce de la busqueda.
  useEffect(() => {
    if (textoBusqueda === filtros.busqueda) return undefined;

    const temporizador = setTimeout(() => {
      setFiltros((actual) => ({ ...actual, busqueda: textoBusqueda, pagina: 1 }));
    }, 400);

    return () => clearTimeout(temporizador);
  }, [textoBusqueda, filtros.busqueda]);

  async function crearUsuario(datos) {
    setProcesando(true);
    try {
      await serviciosAutenticacion.registrarUsuarioInterno(datos);
      setModalCrear(false);
      exito('Usuario creado', `Se creo la cuenta de ${datos.nombreCompleto} con rol ${datos.rol}.`);
      await cargar();
    } catch (errorCapturado) {
      mostrarError(errorCapturado, 'No fue posible crear el usuario');
    } finally {
      setProcesando(false);
    }
  }

  async function actualizarUsuario(id, cambios) {
    setProcesando(true);
    try {
      await serviciosUsuarios.actualizar(id, cambios);
      setModalEditar(null);
      exito('Usuario actualizado', 'Los cambios se guardaron correctamente.');
      await cargar();
    } catch (errorCapturado) {
      mostrarError(errorCapturado, 'No fue posible actualizar el usuario');
    } finally {
      setProcesando(false);
    }
  }

  async function desactivarUsuario() {
    if (!modalDesactivar) return;

    setProcesando(true);
    try {
      await serviciosUsuarios.desactivar(modalDesactivar.id);
      setModalDesactivar(null);
      advertencia(
        'Usuario desactivado',
        `${modalDesactivar.nombre_completo} ya no podra iniciar sesion. Sus tickets se conservan.`
      );
      await cargar();
    } catch (errorCapturado) {
      mostrarError(errorCapturado, 'No fue posible desactivar el usuario');
    } finally {
      setProcesando(false);
    }
  }

  return (
    <div>
      <EncabezadoPagina
        titulo="Usuarios"
        descripcion="Gestion de cuentas, roles y permisos del sistema."
        acciones={
          <button type="button" className="boton-primario" onClick={() => setModalCrear(true)}>
            + Nuevo usuario interno
          </button>
        }
      />

      {/* ---------------- Filtros ---------------- */}
      <div className="tarjeta mb-6">
        <div className="tarjeta-cuerpo">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="lg:col-span-2">
              <label htmlFor="busquedaUsuarios" className="etiqueta-campo">
                Buscar
              </label>
              <input
                id="busquedaUsuarios"
                className="campo"
                placeholder="Nombre o correo electronico..."
                value={textoBusqueda}
                onChange={(evento) => setTextoBusqueda(evento.target.value)}
              />
            </div>

            <div>
              <label htmlFor="filtroRol" className="etiqueta-campo">
                Rol
              </label>
              <select
                id="filtroRol"
                className="campo"
                value={filtros.rol}
                onChange={(evento) =>
                  setFiltros((actual) => ({ ...actual, rol: evento.target.value, pagina: 1 }))
                }
              >
                <option value="">Todos los roles</option>
                {Object.entries(ROLES).map(([clave, info]) => (
                  <option key={clave} value={clave}>
                    {info.etiqueta}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="filtroActivo" className="etiqueta-campo">
                Estado
              </label>
              <select
                id="filtroActivo"
                className="campo"
                value={filtros.activo}
                onChange={(evento) =>
                  setFiltros((actual) => ({ ...actual, activo: evento.target.value, pagina: 1 }))
                }
              >
                <option value="">Todos</option>
                <option value="true">Solo activos</option>
                <option value="false">Solo inactivos</option>
              </select>
            </div>
          </div>
        </div>
      </div>

      {/* ---------------- Tabla ---------------- */}
      <div className="tarjeta overflow-hidden">
        {cargando ? (
          <EsqueletoTabla filas={6} columnas={5} />
        ) : error ? (
          <MensajeError mensaje={error.message} alReintentar={cargar} />
        ) : usuarios.length === 0 ? (
          <EstadoVacio
            titulo="No se encontraron usuarios"
            mensaje="Ajuste los filtros de busqueda o cree una cuenta nueva."
            icono="👤"
          />
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="tabla">
                <thead>
                  <tr>
                    <th>Usuario</th>
                    <th>Rol</th>
                    <th>Departamento</th>
                    <th>Estado</th>
                    <th>Ultimo acceso</th>
                    <th className="text-right">Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {usuarios.map((usuario) => {
                    const esUnoMismo = usuario.id === usuarioActual?.id;

                    return (
                      <tr key={usuario.id}>
                        <td>
                          <div className="flex items-center gap-3">
                            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-200 text-xs font-bold text-slate-600">
                              {iniciales(usuario.nombre_completo)}
                            </span>
                            <div className="min-w-0">
                              <p className="font-medium text-slate-800">
                                {usuario.nombre_completo}
                                {esUnoMismo ? (
                                  <span className="ml-2 rounded bg-marca-100 px-1.5 py-0.5 text-[10px] font-semibold text-marca-800">
                                    Usted
                                  </span>
                                ) : null}
                              </p>
                              <p className="truncate text-xs text-slate-400">{usuario.correo}</p>
                            </div>
                          </div>
                        </td>
                        <td>
                          <InsigniaRol rol={usuario.rol} />
                        </td>
                        <td className="text-xs text-slate-500">
                          {usuario.departamento || '—'}
                        </td>
                        <td>
                          <InsigniaActivo activo={usuario.activo} />
                        </td>
                        <td className="text-xs text-slate-500">
                          {usuario.ultimo_acceso ? (
                            <span title={formatearFechaHora(usuario.ultimo_acceso)}>
                              {tiempoRelativo(usuario.ultimo_acceso)}
                            </span>
                          ) : (
                            <span className="text-slate-300">Nunca</span>
                          )}
                        </td>
                        <td className="text-right">
                          <div className="flex items-center justify-end gap-1">
                            <button
                              type="button"
                              className="boton-secundario boton-pequeno"
                              onClick={() => setModalEditar(usuario)}
                            >
                              Editar
                            </button>
                            {usuario.activo && !esUnoMismo ? (
                              <button
                                type="button"
                                className="boton-fantasma boton-pequeno text-rose-600 hover:bg-rose-50"
                                onClick={() => setModalDesactivar(usuario)}
                              >
                                Desactivar
                              </button>
                            ) : null}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <Paginacion
              meta={meta}
              alCambiarPagina={(pagina) => setFiltros((actual) => ({ ...actual, pagina }))}
              alCambiarLimite={(limite) => setFiltros((actual) => ({ ...actual, limite, pagina: 1 }))}
            />
          </>
        )}
      </div>

      <p className="mt-3 text-xs text-slate-400">
        {meta ? `${formatearNumero(meta.total)} usuario(s) registrado(s). ` : ''}
        Las cuentas no se eliminan fisicamente: se desactivan para conservar la trazabilidad de sus
        tickets.
      </p>

      {/* ---------------- Modales ---------------- */}
      <ModalCrearUsuario
        abierto={modalCrear}
        alCerrar={() => setModalCrear(false)}
        alConfirmar={crearUsuario}
        procesando={procesando}
      />

      <ModalEditarUsuario
        usuario={modalEditar}
        alCerrar={() => setModalEditar(null)}
        alConfirmar={actualizarUsuario}
        procesando={procesando}
        esUnoMismo={modalEditar?.id === usuarioActual?.id}
      />

      <ModalConfirmacion
        abierto={Boolean(modalDesactivar)}
        alCerrar={() => setModalDesactivar(null)}
        alConfirmar={desactivarUsuario}
        titulo="Desactivar usuario"
        mensaje={
          modalDesactivar
            ? `¿Confirma que desea desactivar la cuenta de ${modalDesactivar.nombre_completo}? No podra iniciar sesion, pero sus tickets e historial se conservan intactos.`
            : ''
        }
        textoConfirmar="Si, desactivar"
        procesando={procesando}
      />
    </div>
  );
}

// =====================================================================
// Modal de creacion de usuario interno
// =====================================================================
function ModalCrearUsuario({ abierto, alCerrar, alConfirmar, procesando }) {
  const [formulario, setFormulario] = useState({
    nombreCompleto: '',
    correo: '',
    contrasena: '',
    rol: 'AGENTE',
    departamento: '',
    telefono: '',
  });

  // Se limpia el formulario cada vez que se abre.
  useEffect(() => {
    if (abierto) {
      setFormulario({
        nombreCompleto: '',
        correo: '',
        contrasena: '',
        rol: 'AGENTE',
        departamento: '',
        telefono: '',
      });
    }
  }, [abierto]);

  const valido =
    formulario.nombreCompleto.trim().length >= 3 &&
    /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(formulario.correo.trim()) &&
    formulario.contrasena.length >= 8;

  return (
    <Modal
      abierto={abierto}
      alCerrar={alCerrar}
      titulo="Crear usuario interno"
      descripcion="Se creara una cuenta con acceso al sistema. La contrasena debe tener al menos 8 caracteres, una mayuscula, una minuscula y un numero."
      ancho="max-w-2xl"
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
              const carga = {
                nombreCompleto: formulario.nombreCompleto.trim(),
                correo: formulario.correo.trim().toLowerCase(),
                contrasena: formulario.contrasena,
                rol: formulario.rol,
              };
              if (formulario.departamento.trim()) carga.departamento = formulario.departamento.trim();
              if (formulario.telefono.trim()) carga.telefono = formulario.telefono.trim();
              alConfirmar(carga);
            }}
          >
            {procesando ? 'Creando...' : 'Crear usuario'}
          </button>
        </>
      }
    >
      <div className="space-y-4">
        <div>
          <label htmlFor="nuevoNombre" className="etiqueta-campo">
            Nombre completo <span className="text-rose-600">*</span>
          </label>
          <input
            id="nuevoNombre"
            className="campo"
            value={formulario.nombreCompleto}
            onChange={(evento) =>
              setFormulario((actual) => ({ ...actual, nombreCompleto: evento.target.value }))
            }
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="nuevoCorreo" className="etiqueta-campo">
              Correo electronico <span className="text-rose-600">*</span>
            </label>
            <input
              id="nuevoCorreo"
              type="email"
              className="campo"
              value={formulario.correo}
              onChange={(evento) =>
                setFormulario((actual) => ({ ...actual, correo: evento.target.value }))
              }
            />
          </div>

          <div>
            <label htmlFor="nuevaContrasena" className="etiqueta-campo">
              Contrasena temporal <span className="text-rose-600">*</span>
            </label>
            <input
              id="nuevaContrasena"
              type="text"
              className="campo font-mono"
              placeholder="Ejemplo: Soporte2026#Uno"
              value={formulario.contrasena}
              onChange={(evento) =>
                setFormulario((actual) => ({ ...actual, contrasena: evento.target.value }))
              }
            />
            <p className="texto-ayuda">
              Se muestra en texto claro para que pueda comunicarla. El usuario deberia cambiarla al
              ingresar.
            </p>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="nuevoRol" className="etiqueta-campo">
              Rol <span className="text-rose-600">*</span>
            </label>
            <select
              id="nuevoRol"
              className="campo"
              value={formulario.rol}
              onChange={(evento) =>
                setFormulario((actual) => ({ ...actual, rol: evento.target.value }))
              }
            >
              <option value="AGENTE">Agente de soporte</option>
              <option value="ADMINISTRADOR">Administrador</option>
              <option value="SOLICITANTE">Solicitante</option>
            </select>
            <p className="texto-ayuda">
              Los agentes atienden tickets; los administradores ademas gestionan usuarios y
              categorias.
            </p>
          </div>

          <div>
            <label htmlFor="nuevoDepartamento" className="etiqueta-campo">
              Departamento
            </label>
            <input
              id="nuevoDepartamento"
              className="campo"
              value={formulario.departamento}
              onChange={(evento) =>
                setFormulario((actual) => ({ ...actual, departamento: evento.target.value }))
              }
            />
          </div>
        </div>
      </div>
    </Modal>
  );
}

// =====================================================================
// Modal de edicion de usuario
// =====================================================================
function ModalEditarUsuario({ usuario, alCerrar, alConfirmar, procesando, esUnoMismo }) {
  const [formulario, setFormulario] = useState({
    nombreCompleto: '',
    departamento: '',
    telefono: '',
    rol: 'SOLICITANTE',
    activo: true,
  });

  useEffect(() => {
    if (usuario) {
      setFormulario({
        nombreCompleto: usuario.nombre_completo || '',
        departamento: usuario.departamento || '',
        telefono: usuario.telefono || '',
        rol: usuario.rol,
        activo: usuario.activo,
      });
    }
  }, [usuario]);

  if (!usuario) return null;

  return (
    <Modal
      abierto={Boolean(usuario)}
      alCerrar={alCerrar}
      titulo={`Editar a ${usuario.nombre_completo}`}
      descripcion={usuario.correo}
      ancho="max-w-xl"
      pieDePagina={
        <>
          <button type="button" className="boton-secundario" onClick={alCerrar} disabled={procesando}>
            Cancelar
          </button>
          <button
            type="button"
            className="boton-primario"
            disabled={procesando}
            onClick={() =>
              alConfirmar(usuario.id, {
                nombreCompleto: formulario.nombreCompleto.trim(),
                departamento: formulario.departamento.trim(),
                telefono: formulario.telefono.trim(),
                rol: formulario.rol,
                activo: formulario.activo,
              })
            }
          >
            {procesando ? 'Guardando...' : 'Guardar cambios'}
          </button>
        </>
      }
    >
      <div className="space-y-4">
        {esUnoMismo ? (
          <p className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-800">
            Esta editando su propia cuenta. Por seguridad, no puede quitarse el rol de administrador
            ni desactivarse a si mismo.
          </p>
        ) : null}

        <div>
          <label htmlFor="editarNombre" className="etiqueta-campo">
            Nombre completo
          </label>
          <input
            id="editarNombre"
            className="campo"
            value={formulario.nombreCompleto}
            onChange={(evento) =>
              setFormulario((actual) => ({ ...actual, nombreCompleto: evento.target.value }))
            }
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="editarRol" className="etiqueta-campo">
              Rol
            </label>
            <select
              id="editarRol"
              className="campo"
              value={formulario.rol}
              disabled={esUnoMismo}
              onChange={(evento) =>
                setFormulario((actual) => ({ ...actual, rol: evento.target.value }))
              }
            >
              {Object.entries(ROLES).map(([clave, info]) => (
                <option key={clave} value={clave}>
                  {info.etiqueta}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="editarDepartamento" className="etiqueta-campo">
              Departamento
            </label>
            <input
              id="editarDepartamento"
              className="campo"
              value={formulario.departamento}
              onChange={(evento) =>
                setFormulario((actual) => ({ ...actual, departamento: evento.target.value }))
              }
            />
          </div>
        </div>

        <div>
          <label htmlFor="editarTelefono" className="etiqueta-campo">
            Telefono
          </label>
          <input
            id="editarTelefono"
            className="campo"
            value={formulario.telefono}
            onChange={(evento) =>
              setFormulario((actual) => ({ ...actual, telefono: evento.target.value }))
            }
          />
          <p className="texto-ayuda">
            Se usa para enviarle avisos por SMS cuando sus tickets cambien de estado.
          </p>
        </div>

        <label className="flex items-center gap-3 rounded-lg border border-slate-200 px-3 py-2.5">
          <input
            type="checkbox"
            className="h-4 w-4 rounded border-slate-300 text-marca-700 focus:ring-marca-500"
            checked={formulario.activo}
            disabled={esUnoMismo}
            onChange={(evento) =>
              setFormulario((actual) => ({ ...actual, activo: evento.target.checked }))
            }
          />
          <span className="text-sm text-slate-700">
            Cuenta activa (puede iniciar sesion)
          </span>
        </label>
      </div>
    </Modal>
  );
}
