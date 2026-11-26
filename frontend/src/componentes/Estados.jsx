/**
 * Estados de interfaz reutilizables: carga, vacio y error.
 *
 * Se centralizan aqui para que todas las paginas se vean y se comporten
 * igual (DRY) y para no olvidar nunca el caso "no hay datos", que es
 * justamente el escenario que un cliente toxico aprovecha para senalar que
 * "el sistema se ve roto".
 */

/** Indicador de carga. */
export function Cargando({ mensaje = 'Cargando informacion...', tamano = 'normal' }) {
  const dimensiones = tamano === 'pequeno' ? 'h-4 w-4 border-2' : 'h-8 w-8 border-[3px]';

  return (
    <div className="flex flex-col items-center justify-center gap-3 py-12" role="status">
      <span
        aria-hidden="true"
        className={`${dimensiones} animate-spin rounded-full border-slate-200 border-t-marca-700`}
      />
      <p className="text-sm text-slate-500">{mensaje}</p>
      <span className="sr-only">{mensaje}</span>
    </div>
  );
}

/** Esqueleto de tabla: se muestra mientras llegan los datos. */
export function EsqueletoTabla({ filas = 5, columnas = 5 }) {
  return (
    <div className="animate-pulse space-y-3 p-5" aria-hidden="true">
      {Array.from({ length: filas }).map((_, indiceFila) => (
        <div key={indiceFila} className="flex gap-4">
          {Array.from({ length: columnas }).map((__, indiceColumna) => (
            <div
              key={indiceColumna}
              className="h-4 flex-1 rounded bg-slate-200"
              style={{ opacity: 1 - indiceFila * 0.12 }}
            />
          ))}
        </div>
      ))}
    </div>
  );
}

/**
 * Estado vacio.
 * Incluye siempre una accion sugerida: un estado vacio sin salida es una
 * mala experiencia y, en la demo, una pregunta incomoda del profesor.
 */
export function EstadoVacio({ titulo, mensaje, accion = null, icono = '📭' }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 px-6 py-14 text-center">
      <span aria-hidden="true" className="text-4xl">
        {icono}
      </span>
      <h3 className="text-base font-semibold text-slate-700">{titulo}</h3>
      {mensaje ? <p className="max-w-md text-sm text-slate-500">{mensaje}</p> : null}
      {accion ? <div className="mt-2">{accion}</div> : null}
    </div>
  );
}

/** Mensaje de error en linea, con boton de reintento opcional. */
export function MensajeError({ titulo = 'No fue posible cargar la informacion', mensaje, alReintentar = null }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 px-6 py-12 text-center">
      <span aria-hidden="true" className="text-4xl">
        ⚠️
      </span>
      <h3 className="text-base font-semibold text-rose-700">{titulo}</h3>
      {mensaje ? <p className="max-w-lg text-sm text-slate-600">{mensaje}</p> : null}
      {alReintentar ? (
        <button type="button" className="boton-secundario mt-2" onClick={alReintentar}>
          Reintentar
        </button>
      ) : null}
    </div>
  );
}

/**
 * Contenedor de seccion con encabezado.
 * Se usa en todas las paginas para mantener una jerarquia visual coherente.
 */
export function EncabezadoPagina({ titulo, descripcion, acciones = null }) {
  return (
    <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">{titulo}</h1>
        {descripcion ? <p className="mt-1 text-sm text-slate-500">{descripcion}</p> : null}
      </div>
      {acciones ? <div className="flex flex-wrap items-center gap-2">{acciones}</div> : null}
    </div>
  );
}

export default { Cargando, EsqueletoTabla, EstadoVacio, MensajeError, EncabezadoPagina };
