import { createContext, useCallback, useContext, useMemo, useState } from 'react';

/**
 * Sistema de avisos (notificaciones visuales).
 *
 * Se implementa a mano en lugar de instalar una libreria porque el requisito
 * es KISS y solo necesitamos cuatro variantes con autocierre. Menos
 * dependencias es menos superficie que mantener.
 */

const ContextoAvisos = createContext(null);

const VARIANTES = {
  exito: {
    contenedor: 'border-emerald-200 bg-emerald-50',
    icono: 'text-emerald-600',
    titulo: 'text-emerald-900',
    texto: 'text-emerald-800',
    simbolo: '✓',
  },
  error: {
    contenedor: 'border-rose-200 bg-rose-50',
    icono: 'text-rose-600',
    titulo: 'text-rose-900',
    texto: 'text-rose-800',
    simbolo: '!',
  },
  advertencia: {
    contenedor: 'border-amber-200 bg-amber-50',
    icono: 'text-amber-600',
    titulo: 'text-amber-900',
    texto: 'text-amber-800',
    simbolo: '!',
  },
  informacion: {
    contenedor: 'border-blue-200 bg-blue-50',
    icono: 'text-blue-600',
    titulo: 'text-blue-900',
    texto: 'text-blue-800',
    simbolo: 'i',
  },
};

let contadorAvisos = 0;

export function ProveedorAvisos({ children }) {
  const [avisos, setAvisos] = useState([]);

  const cerrar = useCallback((id) => {
    setAvisos((actuales) => actuales.filter((aviso) => aviso.id !== id));
  }, []);

  /**
   * Emite un aviso.
   * @param {object} opciones
   * @param {'exito'|'error'|'advertencia'|'informacion'} opciones.tipo
   * @param {string} opciones.titulo
   * @param {string} [opciones.mensaje]
   * @param {number} [opciones.duracion] Milisegundos antes de autocerrarse.
   */
  const avisar = useCallback(
    ({ tipo = 'informacion', titulo, mensaje = '', duracion = 5000 }) => {
      contadorAvisos += 1;
      const id = contadorAvisos;

      setAvisos((actuales) => [...actuales, { id, tipo, titulo, mensaje }]);

      // Los errores permanecen mas tiempo: el usuario necesita leerlos.
      const tiempo = tipo === 'error' ? Math.max(duracion, 8000) : duracion;
      if (tiempo > 0) {
        setTimeout(() => cerrar(id), tiempo);
      }

      return id;
    },
    [cerrar]
  );

  // Azucar sintactico para los casos mas frecuentes.
  const exito = useCallback((titulo, mensaje) => avisar({ tipo: 'exito', titulo, mensaje }), [avisar]);
  const error = useCallback((titulo, mensaje) => avisar({ tipo: 'error', titulo, mensaje }), [avisar]);
  const advertencia = useCallback(
    (titulo, mensaje) => avisar({ tipo: 'advertencia', titulo, mensaje }),
    [avisar]
  );
  const informacion = useCallback(
    (titulo, mensaje) => avisar({ tipo: 'informacion', titulo, mensaje }),
    [avisar]
  );

  /** Traduce un ErrorApi a un aviso, mostrando los errores de validacion. */
  const mostrarError = useCallback(
    (errorCapturado, tituloPorDefecto = 'No fue posible completar la operacion') => {
      const detalles = errorCapturado?.detalles;

      const mensaje =
        Array.isArray(detalles) && detalles.length > 0
          ? detalles.map((detalle) => `${detalle.campo}: ${detalle.mensaje}`).join('\n')
          : errorCapturado?.message || 'Ocurrio un error inesperado.';

      return error(tituloPorDefecto, mensaje);
    },
    [error]
  );

  const valor = useMemo(
    () => ({ avisos, avisar, exito, error, advertencia, informacion, mostrarError, cerrar }),
    [avisos, avisar, exito, error, advertencia, informacion, mostrarError, cerrar]
  );

  return (
    <ContextoAvisos.Provider value={valor}>
      {children}
      <ContenedorAvisos avisos={avisos} alCerrar={cerrar} />
    </ContextoAvisos.Provider>
  );
}

/** Pila de avisos en la esquina superior derecha. */
function ContenedorAvisos({ avisos, alCerrar }) {
  if (avisos.length === 0) return null;

  return (
    <div
      // aria-live hace que los lectores de pantalla anuncien los avisos.
      aria-live="polite"
      className="pointer-events-none fixed right-4 top-4 z-50 flex w-full max-w-sm flex-col gap-3"
    >
      {avisos.map((aviso) => {
        const estilo = VARIANTES[aviso.tipo] || VARIANTES.informacion;

        return (
          <div
            key={aviso.id}
            role="alert"
            className={`pointer-events-auto flex animate-deslizar-derecha items-start gap-3 rounded-xl border px-4 py-3 shadow-lg ${estilo.contenedor}`}
          >
            <span
              aria-hidden="true"
              className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-white text-xs font-bold ${estilo.icono}`}
            >
              {estilo.simbolo}
            </span>

            <div className="min-w-0 flex-1">
              <p className={`text-sm font-semibold ${estilo.titulo}`}>{aviso.titulo}</p>
              {aviso.mensaje ? (
                <p className={`mt-1 whitespace-pre-line text-xs leading-relaxed ${estilo.texto}`}>
                  {aviso.mensaje}
                </p>
              ) : null}
            </div>

            <button
              type="button"
              onClick={() => alCerrar(aviso.id)}
              aria-label="Cerrar aviso"
              className={`shrink-0 rounded p-1 text-lg leading-none ${estilo.icono} hover:bg-white/60`}
            >
              ×
            </button>
          </div>
        );
      })}
    </div>
  );
}

/** Hook de acceso a los avisos. */
export function useAvisos() {
  const contexto = useContext(ContextoAvisos);
  if (!contexto) {
    throw new Error('useAvisos debe usarse dentro de <ProveedorAvisos>.');
  }
  return contexto;
}

export default ContextoAvisos;
