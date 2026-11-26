import { useEffect, useRef } from 'react';

/**
 * Ventana modal accesible.
 *
 * Detalles de accesibilidad que se implementan aqui y no en cada pagina:
 *  - `role="dialog"` y `aria-modal` para lectores de pantalla.
 *  - Cierre con la tecla Escape.
 *  - Bloqueo del desplazamiento del fondo.
 *  - Trampa de foco: el tabulador no escapa de la ventana.
 *  - Devolucion del foco al elemento que la abrio.
 */
export default function Modal({
  abierto,
  alCerrar,
  titulo,
  descripcion = null,
  children,
  pieDePagina = null,
  ancho = 'max-w-lg',
}) {
  const referenciaContenedor = useRef(null);
  const referenciaFocoPrevio = useRef(null);

  // --- Escape, bloqueo de scroll y trampa de foco ---
  useEffect(() => {
    if (!abierto) return undefined;

    referenciaFocoPrevio.current = document.activeElement;

    function alPresionarTecla(evento) {
      if (evento.key === 'Escape') {
        alCerrar();
        return;
      }

      // Trampa de foco: se mantiene la navegacion dentro del dialogo.
      if (evento.key !== 'Tab' || !referenciaContenedor.current) return;

      const enfocables = referenciaContenedor.current.querySelectorAll(
        'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'
      );

      if (enfocables.length === 0) return;

      const primero = enfocables[0];
      const ultimo = enfocables[enfocables.length - 1];

      if (evento.shiftKey && document.activeElement === primero) {
        evento.preventDefault();
        ultimo.focus();
      } else if (!evento.shiftKey && document.activeElement === ultimo) {
        evento.preventDefault();
        primero.focus();
      }
    }

    document.addEventListener('keydown', alPresionarTecla);
    const overflowPrevio = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    // Foco inicial en el primer campo o boton del dialogo.
    const temporizador = setTimeout(() => {
      const primerEnfocable = referenciaContenedor.current?.querySelector(
        'input:not([type="hidden"]), textarea, select, button'
      );
      primerEnfocable?.focus();
    }, 50);

    return () => {
      document.removeEventListener('keydown', alPresionarTecla);
      document.body.style.overflow = overflowPrevio;
      clearTimeout(temporizador);
      // Devolver el foco a quien abrio la ventana.
      referenciaFocoPrevio.current?.focus?.();
    };
  }, [abierto, alCerrar]);

  if (!abierto) return null;

  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center p-0 sm:items-center sm:p-4">
      {/* Fondo oscurecido. Al hacer clic fuera, se cierra. */}
      <div
        className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm"
        onClick={alCerrar}
        aria-hidden="true"
      />

      <div
        ref={referenciaContenedor}
        role="dialog"
        aria-modal="true"
        aria-labelledby="titulo-modal"
        className={`relative z-10 w-full ${ancho} animate-entrada-suave rounded-t-2xl bg-white shadow-2xl sm:rounded-2xl`}
      >
        <div className="flex items-start justify-between gap-4 border-b border-slate-200 px-5 py-4">
          <div>
            <h2 id="titulo-modal" className="text-base font-semibold text-slate-900">
              {titulo}
            </h2>
            {descripcion ? <p className="mt-1 text-sm text-slate-500">{descripcion}</p> : null}
          </div>

          <button
            type="button"
            onClick={alCerrar}
            aria-label="Cerrar ventana"
            className="rounded-lg p-1.5 text-xl leading-none text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
          >
            ×
          </button>
        </div>

        <div className="max-h-[70vh] overflow-y-auto px-5 py-4">{children}</div>

        {pieDePagina ? (
          <div className="flex flex-wrap items-center justify-end gap-2 border-t border-slate-200 bg-slate-50 px-5 py-3 sm:rounded-b-2xl">
            {pieDePagina}
          </div>
        ) : null}
      </div>
    </div>
  );
}

/** Modal de confirmacion para acciones destructivas. */
export function ModalConfirmacion({
  abierto,
  alCerrar,
  alConfirmar,
  titulo = 'Confirmar accion',
  mensaje,
  textoConfirmar = 'Confirmar',
  peligroso = true,
  procesando = false,
}) {
  return (
    <Modal
      abierto={abierto}
      alCerrar={alCerrar}
      titulo={titulo}
      ancho="max-w-md"
      pieDePagina={
        <>
          <button type="button" className="boton-secundario" onClick={alCerrar} disabled={procesando}>
            Cancelar
          </button>
          <button
            type="button"
            className={peligroso ? 'boton-peligro' : 'boton-primario'}
            onClick={alConfirmar}
            disabled={procesando}
          >
            {procesando ? 'Procesando...' : textoConfirmar}
          </button>
        </>
      }
    >
      <p className="text-sm leading-relaxed text-slate-600">{mensaje}</p>
    </Modal>
  );
}
