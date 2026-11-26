import { formatearNumero } from '../utilidades/formato';

/**
 * Control de paginacion.
 *
 * Muestra el rango visible ("Mostrando 1 a 20 de 137") porque es la pregunta
 * que todo usuario se hace al ver una tabla paginada.
 */
export default function Paginacion({ meta, alCambiarPagina, alCambiarLimite = null }) {
  if (!meta) return null;

  const { pagina, limite, total, totalPaginas, tieneSiguiente, tieneAnterior } = meta;

  const desde = total === 0 ? 0 : (pagina - 1) * limite + 1;
  const hasta = Math.min(pagina * limite, total);

  /**
   * Genera la lista de numeros de pagina con elipsis.
   * Siempre muestra la primera, la ultima y las cercanas a la actual.
   */
  const numeros = [];
  const ventana = 1;

  for (let numero = 1; numero <= totalPaginas; numero += 1) {
    const esExtremo = numero === 1 || numero === totalPaginas;
    const esCercano = Math.abs(numero - pagina) <= ventana;

    if (esExtremo || esCercano) {
      numeros.push(numero);
    } else if (numeros[numeros.length - 1] !== '...') {
      numeros.push('...');
    }
  }

  return (
    <div className="flex flex-col gap-3 border-t border-slate-200 px-5 py-3 sm:flex-row sm:items-center sm:justify-between">
      <p className="text-xs text-slate-500">
        {total === 0
          ? 'Sin resultados'
          : `Mostrando ${formatearNumero(desde)} a ${formatearNumero(hasta)} de ${formatearNumero(total)} registro(s)`}
      </p>

      <div className="flex flex-wrap items-center gap-2">
        {alCambiarLimite ? (
          <label className="flex items-center gap-2 text-xs text-slate-500">
            Por pagina
            <select
              className="campo w-auto py-1 text-xs"
              value={limite}
              onChange={(evento) => alCambiarLimite(Number(evento.target.value))}
            >
              {[10, 20, 50, 100].map((opcion) => (
                <option key={opcion} value={opcion}>
                  {opcion}
                </option>
              ))}
            </select>
          </label>
        ) : null}

        <nav className="flex items-center gap-1" aria-label="Paginacion">
          <button
            type="button"
            className="boton-secundario boton-pequeno"
            onClick={() => alCambiarPagina(pagina - 1)}
            disabled={!tieneAnterior}
            aria-label="Pagina anterior"
          >
            Anterior
          </button>

          {numeros.map((numero, indice) =>
            numero === '...' ? (
              <span key={`separador-${indice}`} className="px-1 text-xs text-slate-400">
                …
              </span>
            ) : (
              <button
                key={numero}
                type="button"
                onClick={() => alCambiarPagina(numero)}
                aria-current={numero === pagina ? 'page' : undefined}
                className={
                  numero === pagina
                    ? 'boton-pequeno rounded-lg bg-marca-700 px-3 py-1.5 text-xs font-semibold text-white'
                    : 'boton-secundario boton-pequeno'
                }
              >
                {numero}
              </button>
            )
          )}

          <button
            type="button"
            className="boton-secundario boton-pequeno"
            onClick={() => alCambiarPagina(pagina + 1)}
            disabled={!tieneSiguiente}
            aria-label="Pagina siguiente"
          >
            Siguiente
          </button>
        </nav>
      </div>
    </div>
  );
}
