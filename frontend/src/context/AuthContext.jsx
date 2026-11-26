import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

import cliente, { almacenSesion, configurarManejadores } from '../api/cliente';
import { serviciosAutenticacion } from '../api/servicios';

/**
 * Contexto de autenticacion.
 *
 * Responsabilidades:
 *  - Mantener en memoria el usuario y el token de acceso.
 *  - Persistir la sesion para que un F5 no cierre la sesion.
 *  - Renovar el token de acceso de forma transparente cuando expira.
 *  - Exponer ayudantes de permisos (`esAdministrador`, `esGestor`) para que
 *    los componentes no comparen cadenas de rol a mano.
 *
 * Nota de diseno: el cliente HTTP necesita saber como refrescar el token,
 * pero no puede importar este contexto (seria una dependencia circular).
 * Se resuelve con inversion de control: el contexto registra sus callbacks
 * en el cliente al montarse.
 */

const ContextoAutenticacion = createContext(null);

export function ProveedorAutenticacion({ children }) {
  const [usuario, setUsuario] = useState(() => almacenSesion.leerUsuario());
  const [cargando, setCargando] = useState(true);

  /** Cierra la sesion localmente (sin llamar al servidor). */
  const limpiarSesion = useCallback(() => {
    almacenSesion.limpiar();
    setUsuario(null);
  }, []);

  /**
   * Renueva el token de acceso usando el token de refresco.
   * @returns {Promise<boolean>} true si la renovacion fue exitosa.
   */
  const refrescarSesion = useCallback(async () => {
    const tokenRefresco = almacenSesion.leerTokenRefresco();
    if (!tokenRefresco) return false;

    try {
      const respuesta = await serviciosAutenticacion.refrescar(tokenRefresco);
      const datos = respuesta?.datos;
      if (!datos?.tokenAcceso) return false;

      almacenSesion.guardar({
        tokenAcceso: datos.tokenAcceso,
        tokenRefresco: datos.tokenRefresco,
        usuario: datos.usuario,
      });
      setUsuario(datos.usuario);
      return true;
    } catch {
      // El token de refresco tambien expiro o fue revocado: sesion terminada.
      limpiarSesion();
      return false;
    }
  }, [limpiarSesion]);

  // Registro de callbacks en el cliente HTTP (inversion de control).
  useEffect(() => {
    configurarManejadores({
      refrescar: refrescarSesion,
      perderSesion: limpiarSesion,
    });
  }, [refrescarSesion, limpiarSesion]);

  /**
   * Al montar, se valida la sesion guardada contra el servidor.
   * Si el usuario fue desactivado o cambio de rol, el backend lo refleja.
   */
  useEffect(() => {
    let vigente = true;

    async function validarSesion() {
      if (!almacenSesion.leerToken()) {
        setCargando(false);
        return;
      }

      try {
        const respuesta = await serviciosAutenticacion.perfil();
        if (!vigente) return;

        if (respuesta?.datos) {
          setUsuario(respuesta.datos);
          almacenSesion.guardar({ usuario: respuesta.datos });
        }
      } catch {
        // El cliente HTTP ya intento renovar. Si llegamos aqui, la sesion murio.
        if (vigente) limpiarSesion();
      } finally {
        if (vigente) setCargando(false);
      }
    }

    validarSesion();
    return () => {
      vigente = false;
    };
    // Solo debe ejecutarse una vez, al montar el proveedor.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** Inicia sesion con correo y contrasena. */
  const iniciarSesion = useCallback(async (credenciales) => {
    const respuesta = await serviciosAutenticacion.iniciarSesion(credenciales);
    const datos = respuesta?.datos;

    almacenSesion.guardar({
      tokenAcceso: datos.tokenAcceso,
      tokenRefresco: datos.tokenRefresco,
      usuario: datos.usuario,
    });
    setUsuario(datos.usuario);

    return datos.usuario;
  }, []);

  /** Registra una cuenta nueva y deja la sesion iniciada. */
  const registrarse = useCallback(async (datosFormulario) => {
    const respuesta = await serviciosAutenticacion.registrar(datosFormulario);
    const datos = respuesta?.datos;

    almacenSesion.guardar({
      tokenAcceso: datos.tokenAcceso,
      tokenRefresco: datos.tokenRefresco,
      usuario: datos.usuario,
    });
    setUsuario(datos.usuario);

    return datos.usuario;
  }, []);

  /** Cierra la sesion en el servidor (revoca el token de refresco) y en local. */
  const cerrarSesion = useCallback(async () => {
    const tokenRefresco = almacenSesion.leerTokenRefresco();

    try {
      if (tokenRefresco) await serviciosAutenticacion.cerrarSesion(tokenRefresco);
    } catch {
      // Aunque falle la revocacion en el servidor, la sesion local se cierra.
    } finally {
      limpiarSesion();
    }
  }, [limpiarSesion]);

  /** Refresca los datos del usuario en memoria tras editarlos. */
  const actualizarUsuario = useCallback((datosNuevos) => {
    setUsuario((actual) => {
      const combinado = { ...actual, ...datosNuevos };
      almacenSesion.guardar({ usuario: combinado });
      return combinado;
    });
  }, []);

  // --- Ayudantes de permisos ---
  const esAdministrador = usuario?.rol === 'ADMINISTRADOR';
  const esAgente = usuario?.rol === 'AGENTE';
  const esGestor = esAdministrador || esAgente;
  const esSolicitante = usuario?.rol === 'SOLICITANTE';

  const valor = useMemo(
    () => ({
      usuario,
      autenticado: Boolean(usuario),
      cargando,
      iniciarSesion,
      registrarse,
      cerrarSesion,
      actualizarUsuario,
      refrescarSesion,
      esAdministrador,
      esAgente,
      esGestor,
      esSolicitante,
    }),
    [
      usuario,
      cargando,
      iniciarSesion,
      registrarse,
      cerrarSesion,
      actualizarUsuario,
      refrescarSesion,
      esAdministrador,
      esAgente,
      esGestor,
      esSolicitante,
    ]
  );

  return (
    <ContextoAutenticacion.Provider value={valor}>{children}</ContextoAutenticacion.Provider>
  );
}

/** Hook de acceso al contexto de autenticacion. */
export function useAutenticacion() {
  const contexto = useContext(ContextoAutenticacion);
  if (!contexto) {
    throw new Error('useAutenticacion debe usarse dentro de <ProveedorAutenticacion>.');
  }
  return contexto;
}

export { cliente };
export default ContextoAutenticacion;
