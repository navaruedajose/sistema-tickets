import { Navigate, useLocation } from 'react-router-dom';

import { useAutenticacion } from '../context/AuthContext';
import { Cargando } from './Estados';

/**
 * Guarda de ruta.
 *
 * Cumple tres funciones:
 *   1. Exige sesion activa (si no, redirige al inicio de sesion recordando
 *      a donde se queria ir).
 *   2. Exige uno de los roles indicados (si no, muestra 403 en lugar de una
 *      pantalla rota).
 *   3. Mientras se valida la sesion guardada, muestra un indicador en lugar
 *      de parpadear a la pantalla de acceso.
 *
 * IMPORTANTE (defensa en la sustentacion): esto es solo comodidad de
 * interfaz. La autorizacion REAL vive en el backend, en el middleware y en
 * el servicio. Aunque alguien manipule el estado de React desde las
 * herramientas del navegador, la API seguira rechazando la operacion con 403.
 */
export default function RutaProtegida({ children, roles = null }) {
  const { autenticado, cargando, usuario } = useAutenticacion();
  const ubicacion = useLocation();

  // 1. Todavia se esta validando la sesion guardada.
  if (cargando) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-100">
        <Cargando mensaje="Verificando su sesion..." />
      </div>
    );
  }

  // 2. No hay sesion: se guarda el destino para volver despues del login.
  if (!autenticado) {
    return <Navigate to="/iniciar-sesion" state={{ desde: ubicacion.pathname }} replace />;
  }

  // 3. Hay sesion pero el rol no alcanza.
  if (roles && !roles.includes(usuario?.rol)) {
    return <PantallaSinPermiso />;
  }

  return children;
}

/** Pantalla 403 amable: explica que falta y ofrece una salida. */
function PantallaSinPermiso() {
  const { usuario } = useAutenticacion();

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 px-6 text-center">
      <span aria-hidden="true" className="text-5xl">
        🔒
      </span>
      <h1 className="text-xl font-bold text-slate-800">Acceso restringido</h1>
      <p className="max-w-md text-sm text-slate-500">
        Su cuenta tiene el rol <strong>{usuario?.rol}</strong> y esta seccion requiere permisos
        adicionales. Si considera que se trata de un error, contacte al administrador del sistema.
      </p>
      <a href="/" className="boton-primario mt-2">
        Volver al panel principal
      </a>
    </div>
  );
}
