import { formatearNumero } from '../utilidades/formato';

/**
 * Graficas ligeras en SVG puro.
 *
 * Se escriben a mano (sin libreria externa) por tres razones:
 *   1. KISS: no anaden 400 KB de dependencias al bundle.
 *   2. Control total del estilo, coherente con el resto de la interfaz.
 *   3. En la sustentacion se puede explicar exactamente como funcionan.
 */

/** Tarjeta de indicador (KPI). */
export function TarjetaIndicador({ etiqueta, valor, detalle = null, color = 'marca', icono = null }) {
  const paletas = {
    marca: 'border-marca-200 bg-marca-50 text-marca-800',
    exito: 'border-emerald-200 bg-emerald-50 text-emerald-800',
    alerta: 'border-amber-200 bg-amber-50 text-amber-800',
    peligro: 'border-rose-200 bg-rose-50 text-rose-800',
    neutro: 'border-slate-200 bg-slate-50 text-slate-700',
  };

  return (
    <div className={`rounded-xl border px-5 py-4 ${paletas[color] || paletas.marca}`}>
      <div className="flex items-start justify-between gap-3">
        <p className="text-xs font-semibold uppercase tracking-wide opacity-80">{etiqueta}</p>
        {icono ? (
          <span aria-hidden="true" className="text-lg opacity-70">
            {icono}
          </span>
        ) : null}
      </div>
      <p className="mt-2 text-3xl font-bold leading-none">{formatearNumero(valor)}</p>
      {detalle ? <p className="mt-2 text-xs opacity-75">{detalle}</p> : null}
    </div>
  );
}

/**
 * Grafica de barras verticales.
 * @param {{datos: Array<{etiqueta:string, valor:number, color?:string}>}} props
 */
export function GraficaBarras({ datos = [], alto = 200, alHacerClic = null }) {
  if (datos.length === 0) {
    return (
      <p className="py-10 text-center text-sm text-slate-400">
        Sin informacion para graficar en el periodo seleccionado.
      </p>
    );
  }

  const maximo = Math.max(...datos.map((dato) => dato.valor), 1);
  const anchoBarra = 100 / datos.length;

  return (
    <div className="w-full">
      <svg
        viewBox={`0 0 100 ${alto}`}
        preserveAspectRatio="none"
        className="w-full"
        style={{ height: `${alto}px` }}
        role="img"
        aria-label="Grafica de barras"
      >
        {/* Lineas guia horizontales */}
        {[0, 0.25, 0.5, 0.75, 1].map((fraccion) => (
          <line
            key={fraccion}
            x1="0"
            x2="100"
            y1={alto * fraccion}
            y2={alto * fraccion}
            stroke="#e2e8f0"
            strokeWidth="0.5"
            vectorEffect="non-scaling-stroke"
          />
        ))}

        {datos.map((dato, indice) => {
          const alturaBarra = (dato.valor / maximo) * (alto - 24);
          const x = indice * anchoBarra + anchoBarra * 0.15;
          const ancho = anchoBarra * 0.7;

          return (
            <g
              key={dato.etiqueta}
              onClick={alHacerClic ? () => alHacerClic(dato) : undefined}
              style={alHacerClic ? { cursor: 'pointer' } : undefined}
            >
              <rect
                x={x}
                y={alto - 16 - alturaBarra}
                width={ancho}
                height={Math.max(alturaBarra, 1)}
                rx="1.5"
                fill={dato.color || '#1d4ed8'}
                className="transition-opacity hover:opacity-80"
              />
              <title>{`${dato.etiqueta}: ${formatearNumero(dato.valor)}`}</title>
            </g>
          );
        })}
      </svg>

      {/* Etiquetas del eje X, fuera del SVG para que el texto no se deforme */}
      <div className="mt-1 flex">
        {datos.map((dato) => (
          <div
            key={dato.etiqueta}
            className="min-w-0 flex-1 truncate px-0.5 text-center text-[10px] text-slate-500"
            style={{ width: `${anchoBarra}%` }}
            title={dato.etiqueta}
          >
            {dato.etiqueta}
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * Grafica de dona (distribucion porcentual).
 * @param {{datos: Array<{etiqueta:string, valor:number, color:string}>, titulo?:string}} props
 */
export function GraficaDona({ datos = [], tamano = 180, grosor = 26 }) {
  const total = datos.reduce((suma, dato) => suma + dato.valor, 0);

  if (total === 0) {
    return (
      <p className="py-10 text-center text-sm text-slate-400">
        Sin datos para mostrar la distribucion.
      </p>
    );
  }

  const radio = (tamano - grosor) / 2;
  const circunferencia = 2 * Math.PI * radio;
  const centro = tamano / 2;

  let desplazamientoAcumulado = 0;

  return (
    <div className="flex flex-col items-center gap-5 sm:flex-row sm:justify-center">
      <svg
        width={tamano}
        height={tamano}
        viewBox={`0 0 ${tamano} ${tamano}`}
        role="img"
        aria-label="Grafica de distribucion"
      >
        {/* Anillo de fondo */}
        <circle
          cx={centro}
          cy={centro}
          r={radio}
          fill="none"
          stroke="#f1f5f9"
          strokeWidth={grosor}
        />

        {datos.map((dato) => {
          const proporcion = dato.valor / total;
          const longitud = proporcion * circunferencia;

          const elemento = (
            <circle
              key={dato.etiqueta}
              cx={centro}
              cy={centro}
              r={radio}
              fill="none"
              stroke={dato.color}
              strokeWidth={grosor}
              strokeDasharray={`${longitud} ${circunferencia - longitud}`}
              // -90 grados: el primer segmento arranca arriba, no a la derecha.
              strokeDashoffset={-desplazamientoAcumulado}
              transform={`rotate(-90 ${centro} ${centro})`}
            >
              <title>{`${dato.etiqueta}: ${formatearNumero(dato.valor)} (${(proporcion * 100).toFixed(1)}%)`}</title>
            </circle>
          );

          desplazamientoAcumulado += longitud;
          return elemento;
        })}

        {/* Total al centro */}
        <text
          x={centro}
          y={centro - 2}
          textAnchor="middle"
          className="fill-slate-800"
          style={{ fontSize: '22px', fontWeight: 700 }}
        >
          {formatearNumero(total)}
        </text>
        <text
          x={centro}
          y={centro + 16}
          textAnchor="middle"
          className="fill-slate-400"
          style={{ fontSize: '10px' }}
        >
          TOTAL
        </text>
      </svg>

      {/* Leyenda */}
      <ul className="space-y-2">
        {datos.map((dato) => (
          <li key={dato.etiqueta} className="flex items-center gap-2 text-sm">
            <span
              aria-hidden="true"
              className="h-3 w-3 shrink-0 rounded-sm"
              style={{ backgroundColor: dato.color }}
            />
            <span className="text-slate-600">{dato.etiqueta}</span>
            <span className="ml-auto pl-4 font-semibold text-slate-800">
              {formatearNumero(dato.valor)}
            </span>
            <span className="w-12 text-right text-xs text-slate-400">
              {((dato.valor / total) * 100).toFixed(1)}%
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * Grafica de linea doble: creados vs. resueltos por dia.
 * Muestra la tendencia, que es el indicador que revela si el equipo va al dia.
 */
export function GraficaTendencia({ serie = [], alto = 220 }) {
  if (serie.length === 0) {
    return (
      <p className="py-10 text-center text-sm text-slate-400">Sin datos de tendencia.</p>
    );
  }

  const ancho = 100;
  const maximo = Math.max(...serie.flatMap((punto) => [punto.creados, punto.resueltos]), 1);

  /** Convierte una serie en el atributo `points` de un <polyline>. */
  function puntos(valor) {
    return serie
      .map((punto, indice) => {
        const x = serie.length === 1 ? ancho / 2 : (indice / (serie.length - 1)) * ancho;
        const y = alto - 20 - (punto[valor] / maximo) * (alto - 32);
        return `${x},${y}`;
      })
      .join(' ');
  }

  return (
    <div>
      <svg
        viewBox={`0 0 ${ancho} ${alto}`}
        preserveAspectRatio="none"
        className="w-full"
        style={{ height: `${alto}px` }}
        role="img"
        aria-label="Tendencia de tickets creados y resueltos"
      >
        {[0, 0.25, 0.5, 0.75, 1].map((fraccion) => (
          <line
            key={fraccion}
            x1="0"
            x2={ancho}
            y1={alto * fraccion}
            y2={alto * fraccion}
            stroke="#e2e8f0"
            strokeWidth="0.5"
            vectorEffect="non-scaling-stroke"
          />
        ))}

        {/* Resueltos */}
        <polyline
          points={puntos('resueltos')}
          fill="none"
          stroke="#059669"
          strokeWidth="2"
          vectorEffect="non-scaling-stroke"
        />

        {/* Creados */}
        <polyline
          points={puntos('creados')}
          fill="none"
          stroke="#1d4ed8"
          strokeWidth="2"
          vectorEffect="non-scaling-stroke"
        />
      </svg>

      <div className="mt-3 flex items-center justify-center gap-6 text-xs">
        <span className="flex items-center gap-2 text-slate-600">
          <span aria-hidden="true" className="h-0.5 w-5 bg-marca-700" />
          Creados
        </span>
        <span className="flex items-center gap-2 text-slate-600">
          <span aria-hidden="true" className="h-0.5 w-5 bg-emerald-600" />
          Resueltos
        </span>
      </div>

      {/* Fechas: se muestran solo la primera, la del medio y la ultima para
          que no se amontone el texto. */}
      <div className="mt-2 flex justify-between text-[10px] text-slate-400">
        <span>{serie[0]?.fecha?.slice(5) || ''}</span>
        <span>{serie[Math.floor(serie.length / 2)]?.fecha?.slice(5) || ''}</span>
        <span>{serie[serie.length - 1]?.fecha?.slice(5) || ''}</span>
      </div>
    </div>
  );
}

/** Barra de progreso simple, usada para el cumplimiento de SLA. */
export function BarraProgreso({ valor = 0, maximo = 100, color = '#1d4ed8', etiqueta = null }) {
  const porcentaje = Math.min(Math.max((valor / maximo) * 100, 0), 100);

  return (
    <div>
      {etiqueta ? (
        <div className="mb-1 flex items-center justify-between text-xs text-slate-500">
          <span>{etiqueta}</span>
          <span className="font-semibold text-slate-700">{porcentaje.toFixed(1)}%</span>
        </div>
      ) : null}
      <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
        <div
          className="h-full rounded-full transition-all"
          style={{ width: `${porcentaje}%`, backgroundColor: color }}
        />
      </div>
    </div>
  );
}

export default { TarjetaIndicador, GraficaBarras, GraficaDona, GraficaTendencia, BarraProgreso };
