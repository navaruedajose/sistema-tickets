import { useState } from 'react';

import { serviciosUsuarios, serviciosAutenticacion } from '../api/servicios';
import { useAutenticacion } from '../context/AuthContext';
import { useAvisos } from '../context/AvisosContext';
import { EncabezadoPagina } from '../componentes/Estados';
import { InsigniaRol } from '../componentes/Etiquetas';
import { ModalConfirmacion } from '../componentes/Modal';
import { formatearFechaHora, iniciales } from '../utilidades/formato';

/**
 * Perfil del usuario autenticado.
 *
 * Tres bloques:
 *   1. Datos de contacto (editables por el propio usuario).
 *   2. Cambio de contrasena, que revoca todas las sesiones activas.
 *   3. Cierre remoto de sesiones (util si se sospecha que alguien mas tiene
 *      acceso a la cuenta).
 *
 * El cambio de contrasena cierra todas las sesiones por diseno del backend:
 * si alguien habia robado un token, deja de servir de inmediato. Conviene
 * explicarlo en la interfaz para que no sorprenda al usuario.
 */
export default function Perfil() {
  const { usuario, actualizarUsuario, cerrarSesion } = useAutenticacion();
  const { exito, advertencia, mostrarError } = useAvisos();

  const [formulario, setFormulario] = useState({
    nombreCompleto: usuario?.nombre_completo || '',
    telefono: usuario?.telefono || '',
    departamento: usuario?.departamento || '',
  });

  const [guardandoDatos, setGuardandoDatos] = useState(false);

  const [contrasenas, setContrasenas] = useState({
    contrasenaActual: '',
    contrasenaNueva: '',
    confirmarNueva: '',
  });
  const [guardandoContrasena, setGuardandoContrasena] = useState(false);
  const [erroresContrasena, setErroresContrasena] = useState({});

  const [modalSesiones, setModalSesiones] = useState(false);
  const [procesando, setProcesando] = useState(false);

  /** Guarda los datos de contacto. */
  async function guardarDatos(evento) {
    evento.preventDefault();

    if (formulario.nombreCompleto.trim().length < 3) {
      mostrarError(
        { message: 'El nombre completo debe tener al menos 3 caracteres.' },
        'Revise los datos ingresados'
      );
      return;
    }

    setGuardandoDatos(true);
    try {
      const respuesta = await serviciosUsuarios.actualizar(usuario.id, {
        nombreCompleto: formulario.nombreCompleto.trim(),
        telefono: formulario.telefono.trim(),
        departamento: formulario.departamento.trim(),
      });

      // Se sincroniza el contexto y el almacenamiento local para que el nombre
      // actualizado aparezca de inmediato en la barra lateral.
      if (respuesta?.datos) {
        actualizarUsuario({
          nombre_completo: respuesta.datos.nombre_completo,
          telefono: respuesta.datos.telefono,
          departamento: respuesta.datos.departamento,
        });
      }

      exito('Datos actualizados', 'Su informacion de contacto se guardo correctamente.');
    } catch (errorCapturado) {
      mostrarError(errorCapturado, 'No fue posible actualizar sus datos');
    } finally {
      setGuardandoDatos(false);
    }
  }

  /** Valida y aplica el cambio de contrasena. */
  async function cambiarContrasena(evento) {
    evento.preventDefault();

    const errores = {};
    if (!contrasenas.contrasenaActual) {
      errores.contrasenaActual = 'Ingrese su contrasena actual.';
    }
    if (contrasenas.contrasenaNueva.length < 8) {
      errores.contrasenaNueva = 'La nueva contrasena debe tener al menos 8 caracteres.';
    } else if (
      !/[A-Z]/.test(contrasenas.contrasenaNueva) ||
      !/[a-z]/.test(contrasenas.contrasenaNueva) ||
      !/[0-9]/.test(contrasenas.contrasenaNueva)
    ) {
      errores.contrasenaNueva =
        'Debe incluir al menos una mayuscula, una minuscula y un numero.';
    } else if (contrasenas.contrasenaNueva === contrasenas.contrasenaActual) {
      errores.contrasenaNueva = 'La nueva contrasena debe ser distinta a la actual.';
    }
    if (contrasenas.contrasenaNueva !== contrasenas.confirmarNueva) {
      errores.confirmarNueva = 'Las contrasenas no coinciden.';
    }

    setErroresContrasena(errores);
    if (Object.keys(errores).length > 0) return;

    setGuardandoContrasena(true);
    try {
      await serviciosUsuarios.cambiarContrasena({
        contrasenaActual: contrasenas.contrasenaActual,
        contrasenaNueva: contrasenas.contrasenaNueva,
      });

      setContrasenas({ contrasenaActual: '', contrasenaNueva: '', confirmarNueva: '' });
      advertencia(
        'Contrasena actualizada',
        'Por seguridad se cerraron todas sus sesiones. Vuelva a iniciar sesion con su nueva contrasena.'
      );

      // La sesion actual quedo revocada en el servidor: se cierra en local.
      setTimeout(() => cerrarSesion(), 2500);
    } catch (errorCapturado) {
      const porCampo = errorCapturado?.erroresPorCampo || {};
      if (Object.keys(porCampo).length > 0) {
        setErroresContrasena(porCampo);
      } else {
        mostrarError(errorCapturado, 'No fue posible cambiar la contrasena');
      }
    } finally {
      setGuardandoContrasena(false);
    }
  }

  /** Cierra todas las sesiones activas. */
  async function cerrarTodasLasSesiones() {
    setProcesando(true);
    try {
      const respuesta = await serviciosAutenticacion.cerrarTodasLasSesiones();
      setModalSesiones(false);
      advertencia(
        'Sesiones cerradas',
        `Se revocaron ${respuesta?.datos?.sesionesCerradas ?? 0} sesion(es). Debera iniciar sesion de nuevo en todos sus dispositivos.`
      );
      setTimeout(() => cerrarSesion(), 2500);
    } catch (errorCapturado) {
      mostrarError(errorCapturado, 'No fue posible cerrar las sesiones');
    } finally {
      setProcesando(false);
    }
  }

  return (
    <div className="mx-auto max-w-3xl">
      <EncabezadoPagina
        titulo="Mi perfil"
        descripcion="Administre su informacion de contacto y la seguridad de su cuenta."
      />

      {/* ---------------- Tarjeta de identidad ---------------- */}
      <section className="tarjeta mb-6">
        <div className="tarjeta-cuerpo flex flex-col items-center gap-4 sm:flex-row sm:items-center">
          <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-marca-600 text-xl font-bold text-white">
            {iniciales(usuario?.nombre_completo)}
          </span>

          <div className="min-w-0 flex-1 text-center sm:text-left">
            <h2 className="text-lg font-bold text-slate-900">{usuario?.nombre_completo}</h2>
            <p className="text-sm text-slate-500">{usuario?.correo}</p>
            <div className="mt-2 flex flex-wrap items-center justify-center gap-2 sm:justify-start">
              <InsigniaRol rol={usuario?.rol} />
              {usuario?.departamento ? (
                <span className="text-xs text-slate-500">{usuario.departamento}</span>
              ) : null}
            </div>
          </div>

          <div className="text-center text-xs text-slate-400 sm:text-right">
            <p>Cuenta creada</p>
            <p className="font-medium text-slate-600">{formatearFechaHora(usuario?.creado_en)}</p>
          </div>
        </div>
      </section>

      {/* ---------------- Datos de contacto ---------------- */}
      <section className="tarjeta mb-6">
        <div className="tarjeta-encabezado">
          <h2 className="tarjeta-titulo">Datos de contacto</h2>
        </div>

        <form onSubmit={guardarDatos}>
          <div className="tarjeta-cuerpo space-y-4">
            <div>
              <label htmlFor="perfilNombre" className="etiqueta-campo">
                Nombre completo
              </label>
              <input
                id="perfilNombre"
                className="campo"
                value={formulario.nombreCompleto}
                onChange={(evento) =>
                  setFormulario((actual) => ({ ...actual, nombreCompleto: evento.target.value }))
                }
              />
            </div>

            <div>
              <label htmlFor="perfilCorreo" className="etiqueta-campo">
                Correo electronico
              </label>
              <input
                id="perfilCorreo"
                className="campo"
                value={usuario?.correo || ''}
                disabled
                readOnly
              />
              <p className="texto-ayuda">
                El correo identifica su cuenta y no puede modificarse. Contacte al administrador si
                necesita cambiarlo.
              </p>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="perfilTelefono" className="etiqueta-campo">
                  Telefono
                </label>
                <input
                  id="perfilTelefono"
                  className="campo"
                  placeholder="+52 55 1111 2222"
                  value={formulario.telefono}
                  onChange={(evento) =>
                    setFormulario((actual) => ({ ...actual, telefono: evento.target.value }))
                  }
                />
                <p className="texto-ayuda">
                  Si lo registra, recibira avisos por SMS cuando sus tickets se resuelvan.
                </p>
              </div>

              <div>
                <label htmlFor="perfilDepartamento" className="etiqueta-campo">
                  Departamento
                </label>
                <input
                  id="perfilDepartamento"
                  className="campo"
                  value={formulario.departamento}
                  onChange={(evento) =>
                    setFormulario((actual) => ({ ...actual, departamento: evento.target.value }))
                  }
                />
              </div>
            </div>
          </div>

          <div className="flex justify-end border-t border-slate-200 bg-slate-50 px-5 py-3">
            <button type="submit" className="boton-primario" disabled={guardandoDatos}>
              {guardandoDatos ? 'Guardando...' : 'Guardar cambios'}
            </button>
          </div>
        </form>
      </section>

      {/* ---------------- Cambio de contrasena ---------------- */}
      <section className="tarjeta mb-6">
        <div className="tarjeta-encabezado">
          <h2 className="tarjeta-titulo">Seguridad de la cuenta</h2>
        </div>

        <form onSubmit={cambiarContrasena}>
          <div className="tarjeta-cuerpo space-y-4">
            <div className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-3">
              <p className="text-xs text-blue-800">
                Al cambiar su contrasena se cerraran <strong>todas las sesiones activas</strong>,
                incluida la de este dispositivo. Es una medida de seguridad: si alguien mas tenia
                acceso a su cuenta, dejara de tenerlo de inmediato.
              </p>
            </div>

            <div>
              <label htmlFor="contrasenaActual" className="etiqueta-campo">
                Contrasena actual
              </label>
              <input
                id="contrasenaActual"
                type="password"
                autoComplete="current-password"
                className="campo"
                value={contrasenas.contrasenaActual}
                onChange={(evento) =>
                  setContrasenas((actual) => ({ ...actual, contrasenaActual: evento.target.value }))
                }
              />
              {erroresContrasena.contrasenaActual ? (
                <p className="texto-error">{erroresContrasena.contrasenaActual}</p>
              ) : null}
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="contrasenaNueva" className="etiqueta-campo">
                  Nueva contrasena
                </label>
                <input
                  id="contrasenaNueva"
                  type="password"
                  autoComplete="new-password"
                  className="campo"
                  value={contrasenas.contrasenaNueva}
                  onChange={(evento) =>
                    setContrasenas((actual) => ({ ...actual, contrasenaNueva: evento.target.value }))
                  }
                />
                {erroresContrasena.contrasenaNueva ? (
                  <p className="texto-error">{erroresContrasena.contrasenaNueva}</p>
                ) : (
                  <p className="texto-ayuda">
                    Minimo 8 caracteres, con mayuscula, minuscula y numero.
                  </p>
                )}
              </div>

              <div>
                <label htmlFor="confirmarNueva" className="etiqueta-campo">
                  Confirmar nueva contrasena
                </label>
                <input
                  id="confirmarNueva"
                  type="password"
                  autoComplete="new-password"
                  className="campo"
                  value={contrasenas.confirmarNueva}
                  onChange={(evento) =>
                    setContrasenas((actual) => ({ ...actual, confirmarNueva: evento.target.value }))
                  }
                />
                {erroresContrasena.confirmarNueva ? (
                  <p className="texto-error">{erroresContrasena.confirmarNueva}</p>
                ) : null}
              </div>
            </div>
          </div>

          <div className="flex justify-end border-t border-slate-200 bg-slate-50 px-5 py-3">
            <button type="submit" className="boton-primario" disabled={guardandoContrasena}>
              {guardandoContrasena ? 'Actualizando...' : 'Cambiar contrasena'}
            </button>
          </div>
        </form>
      </section>

      {/* ---------------- Sesiones ---------------- */}
      <section className="tarjeta">
        <div className="tarjeta-encabezado">
          <h2 className="tarjeta-titulo">Sesiones activas</h2>
        </div>

        <div className="tarjeta-cuerpo flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm text-slate-700">
              Cierre la sesion en todos los dispositivos donde haya iniciado sesion.
            </p>
            <p className="mt-1 text-xs text-slate-500">
              Util si utilizo un equipo compartido o si sospecha que alguien mas tiene acceso a su
              cuenta.
            </p>
          </div>

          <button
            type="button"
            className="boton-secundario shrink-0"
            onClick={() => setModalSesiones(true)}
          >
            Cerrar todas las sesiones
          </button>
        </div>
      </section>

      <ModalConfirmacion
        abierto={modalSesiones}
        alCerrar={() => setModalSesiones(false)}
        alConfirmar={cerrarTodasLasSesiones}
        titulo="Cerrar todas las sesiones"
        mensaje="Se revocaran todos los tokens de acceso emitidos para su cuenta, incluido el de este dispositivo. Debera iniciar sesion nuevamente. ¿Desea continuar?"
        textoConfirmar="Si, cerrar todas"
        peligroso={false}
        procesando={procesando}
      />
    </div>
  );
}
