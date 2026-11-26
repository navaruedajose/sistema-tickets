import { useRef, useState } from 'react';

import { formatearTamano } from '../utilidades/formato';

/**
 * Cargador de archivos (evidencias).
 *
 * Validaciones en el cliente:
 *  - Lista blanca de tipos, igual que el backend.
 *  - Limite de tamano por archivo y maximo de 5 archivos.
 *  - Arrastrar y soltar, ademas del selector tradicional.
 *
 * IMPORTANTE: estas validaciones son solo experiencia de usuario. El backend
 * vuelve a validar TODO (tipo real por firma binaria, tamano, cuota por
 * ticket). Un cliente toxico puede saltarse el navegador por completo; la
 * unica validacion que cuenta es la del servidor. Esta distincion conviene
 * decirla en voz alta durante la sustentacion.
 */

const TIPOS_PERMITIDOS = [
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/webp',
  'application/pdf',
  'text/plain',
  'text/csv',
  'application/zip',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
];

const TAMANO_MAXIMO_BYTES = 10 * 1024 * 1024; // 10 MB
const MAXIMO_ARCHIVOS = 5;

export default function CargadorArchivos({
  archivos = [],
  alCambiar,
  deshabilitado = false,
  maximoArchivos = MAXIMO_ARCHIVOS,
}) {
  const referenciaEntrada = useRef(null);
  const [arrastrando, setArrastrando] = useState(false);
  const [errores, setErrores] = useState([]);

  /** Valida y agrega archivos a la seleccion actual. */
  function agregarArchivos(listaNueva) {
    const nuevosErrores = [];
    const aceptados = [];

    for (const archivo of Array.from(listaNueva)) {
      if (!TIPOS_PERMITIDOS.includes(archivo.type)) {
        nuevosErrores.push(`"${archivo.name}": tipo de archivo no permitido.`);
        continue;
      }
      if (archivo.size > TAMANO_MAXIMO_BYTES) {
        nuevosErrores.push(
          `"${archivo.name}": excede el limite de ${formatearTamano(TAMANO_MAXIMO_BYTES)}.`
        );
        continue;
      }
      if (archivo.size === 0) {
        nuevosErrores.push(`"${archivo.name}": el archivo esta vacio.`);
        continue;
      }
      // Evita subir dos veces el mismo archivo por nombre y tamano.
      if (archivos.some((existente) => existente.name === archivo.name && existente.size === archivo.size)) {
        nuevosErrores.push(`"${archivo.name}": ya esta en la lista.`);
        continue;
      }
      aceptados.push(archivo);
    }

    const combinados = [...archivos, ...aceptados].slice(0, maximoArchivos);

    if (archivos.length + aceptados.length > maximoArchivos) {
      nuevosErrores.push(`Solo se permiten ${maximoArchivos} archivos por envio.`);
    }

    setErrores(nuevosErrores);
    alCambiar(combinados);
  }

  function manejarSeleccion(evento) {
    agregarArchivos(evento.target.files);
    // Se limpia el input para poder volver a elegir el mismo archivo.
    evento.target.value = '';
  }

  function manejarSoltar(evento) {
    evento.preventDefault();
    setArrastrando(false);
    if (deshabilitado) return;
    agregarArchivos(evento.dataTransfer.files);
  }

  function quitarArchivo(indice) {
    alCambiar(archivos.filter((_, posicion) => posicion !== indice));
    setErrores([]);
  }

  return (
    <div>
      {/* Zona de arrastre */}
      <div
        onDragOver={(evento) => {
          evento.preventDefault();
          if (!deshabilitado) setArrastrando(true);
        }}
        onDragLeave={() => setArrastrando(false)}
        onDrop={manejarSoltar}
        onClick={() => !deshabilitado && referenciaEntrada.current?.click()}
        onKeyDown={(evento) => {
          if (evento.key === 'Enter' || evento.key === ' ') {
            evento.preventDefault();
            referenciaEntrada.current?.click();
          }
        }}
        role="button"
        tabIndex={deshabilitado ? -1 : 0}
        aria-label="Seleccionar archivos de evidencia"
        aria-disabled={deshabilitado}
        className={`flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed px-6 py-8 text-center transition-colors ${
          deshabilitado
            ? 'cursor-not-allowed border-slate-200 bg-slate-50 opacity-60'
            : arrastrando
              ? 'border-marca-500 bg-marca-50'
              : 'border-slate-300 bg-slate-50 hover:border-marca-400 hover:bg-marca-50/50'
        }`}
      >
        <span aria-hidden="true" className="text-3xl">
          📎
        </span>
        <p className="text-sm font-medium text-slate-700">
          Arrastre los archivos aqui o haga clic para seleccionarlos
        </p>
        <p className="text-xs text-slate-500">
          PNG, JPG, GIF, WEBP, PDF, TXT, CSV, ZIP, DOCX o XLSX — maximo{' '}
          {formatearTamano(TAMANO_MAXIMO_BYTES)} por archivo, hasta {maximoArchivos} archivos
        </p>

        <input
          ref={referenciaEntrada}
          type="file"
          multiple
          className="hidden"
          onChange={manejarSeleccion}
          disabled={deshabilitado}
          accept={TIPOS_PERMITIDOS.join(',')}
        />
      </div>

      {/* Errores de validacion del cliente */}
      {errores.length > 0 ? (
        <ul className="mt-3 space-y-1">
          {errores.map((mensaje, indice) => (
            <li key={indice} className="texto-error">
              {mensaje}
            </li>
          ))}
        </ul>
      ) : null}

      {/* Lista de archivos seleccionados */}
      {archivos.length > 0 ? (
        <ul className="mt-4 space-y-2">
          {archivos.map((archivo, indice) => (
            <li
              key={`${archivo.name}-${indice}`}
              className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white px-3 py-2"
            >
              <div className="flex min-w-0 items-center gap-3">
                <span aria-hidden="true" className="text-lg">
                  {iconoPorTipo(archivo.type)}
                </span>
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-slate-700">{archivo.name}</p>
                  <p className="text-xs text-slate-500">{formatearTamano(archivo.size)}</p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => quitarArchivo(indice)}
                disabled={deshabilitado}
                className="shrink-0 rounded p-1 text-slate-400 transition-colors hover:bg-rose-50 hover:text-rose-600"
                aria-label={`Quitar ${archivo.name}`}
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

/** Icono segun el tipo MIME del archivo. */
function iconoPorTipo(tipo) {
  if (tipo.startsWith('image/')) return '🖼️';
  if (tipo === 'application/pdf') return '📕';
  if (tipo.includes('spreadsheet') || tipo === 'text/csv') return '📊';
  if (tipo.includes('wordprocessing')) return '📄';
  if (tipo === 'application/zip') return '🗜️';
  return '📎';
}
