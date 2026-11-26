import { Link } from 'react-router-dom';

/**
 * Pantalla 404.
 *
 * Ofrece siempre una salida: un 404 sin navegacion es un callejon sin salida
 * y, durante la demostracion, una pausa innecesaria.
 */
export default function NoEncontrado() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-5 bg-slate-100 px-6 text-center">
      <span aria-hidden="true" className="text-6xl">
        🧭
      </span>

      <div>
        <p className="font-mono text-sm font-semibold text-marca-700">ERROR 404</p>
        <h1 className="mt-2 text-2xl font-bold text-slate-900">Pagina no encontrada</h1>
        <p className="mt-2 max-w-md text-sm text-slate-500">
          La direccion a la que intento acceder no existe o fue movida. Verifique el enlace o
          regrese al panel principal para continuar trabajando.
        </p>
      </div>

      <div className="flex flex-wrap items-center justify-center gap-3">
        <Link to="/" className="boton-primario">
          Volver al panel principal
        </Link>
        <Link to="/tickets" className="boton-secundario">
          Ver mis tickets
        </Link>
      </div>

      <p className="mt-4 text-xs text-slate-400">
        Si el problema persiste, contacte al area de soporte tecnico.
      </p>
    </div>
  );
}
