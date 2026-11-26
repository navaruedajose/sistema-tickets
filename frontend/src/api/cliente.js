/**
 * Cliente HTTP de la aplicacion.
 *
 * Un unico punto de salida para todas las peticiones a la API. Concentra
 * aqui la logica transversal que de otro modo se repetiria en cada pagina:
 *
 *   1. Inyeccion del token de acceso.
 *   2. Renovacion automatica del token cuando expira (401), con reintento
 *      transparente de la peticion original.
 *   3. Traduccion de errores a un objeto uniforme que las paginas entienden.
 *   4. Serializacion de parametros de consulta.
 *   5. Manejo de cargas multipart y descargas binarias.
 *
 * Ventaja para la sustentacion: las paginas nunca escriben `fetch(...)`;
 * solo llaman a `servicios.tickets.listar(filtros)`. Si cambia la forma de
 * autenticarse, se toca un solo archivo.
 */

/** URL base. Si no se define VITE_API_URL se usan rutas relativas (proxy). */
const URL_BASE = (import.meta.env.VITE_API_URL || '/api/v1').replace(/\/$/, '');

const CLAVES_ALMACEN = {
  acceso: 'tickets.tokenAcceso',
  refresco: 'tickets.tokenRefresco',
  usuario: 'tickets.usuario',
};

// ---------------------------------------------------------------------
// Almacenamiento de sesion
// ---------------------------------------------------------------------
export const almacenSesion = {
  guardar({ tokenAcceso, tokenRefresco, usuario }) {
    if (tokenAcceso) localStorage.setItem(CLAVES_ALMACEN.acceso, tokenAcceso);
    if (tokenRefresco) localStorage.setItem(CLAVES_ALMACEN.refresco, tokenRefresco);
    if (usuario) localStorage.setItem(CLAVES_ALMACEN.usuario, JSON.stringify(usuario));
  },

  leerToken() {
    return localStorage.getItem(CLAVES_ALMACEN.acceso);
  },

  leerTokenRefresco() {
    return localStorage.getItem(CLAVES_ALMACEN.refresco);
  },

  leerUsuario() {
    const crudo = localStorage.getItem(CLAVES_ALMACEN.usuario);
    if (!crudo) return null;
    try {
      return JSON.parse(crudo);
    } catch {
      // Si el contenido quedo corrupto, se descarta en lugar de romper la app.
      localStorage.removeItem(CLAVES_ALMACEN.usuario);
      return null;
    }
  },

  limpiar() {
    Object.values(CLAVES_ALMACEN).forEach((clave) => localStorage.removeItem(clave));
  },
};

// ---------------------------------------------------------------------
// Error de API
// ---------------------------------------------------------------------
export class ErrorApi extends Error {
  constructor(mensaje, { estadoHttp = 0, codigo = 'ERROR_DESCONOCIDO', detalles = null } = {}) {
    super(mensaje);
    this.name = 'ErrorApi';
    this.estadoHttp = estadoHttp;
    this.codigo = codigo;
    this.detalles = detalles;
  }

  /** ¿El fallo fue por falta de conexion con el servidor? */
  get esFalloDeRed() {
    return this.estadoHttp === 0;
  }

  /** Devuelve los errores de validacion como un mapa campo -> mensaje. */
  get erroresPorCampo() {
    if (!Array.isArray(this.detalles)) return {};
    return Object.fromEntries(
      this.detalles.map((detalle) => [detalle.campo, detalle.mensaje])
    );
  }
}

// ---------------------------------------------------------------------
// Enlaces con la capa de autenticacion (evitan importaciones circulares)
// ---------------------------------------------------------------------
let alRefrescar = null;
let alPerderSesion = null;

/**
 * El contexto de autenticacion registra aqui sus callbacks al montarse.
 * Asi este modulo no necesita importar React ni el contexto.
 */
export function configurarManejadores({ refrescar, perderSesion } = {}) {
  if (refrescar) alRefrescar = refrescar;
  if (perderSesion) alPerderSesion = perderSesion;
}

// ---------------------------------------------------------------------
// Utilidades internas
// ---------------------------------------------------------------------
/** Convierte un objeto en cadena de consulta, omitiendo valores vacios. */
function construirConsulta(parametros = {}) {
  const partes = Object.entries(parametros)
    .filter(([, valor]) => valor !== undefined && valor !== null && valor !== '')
    .map(([clave, valor]) => [clave, String(valor)]);

  if (partes.length === 0) return '';
  return `?${new URLSearchParams(partes).toString()}`;
}

/** Ejecuta la peticion y normaliza la respuesta o el error. */
async function ejecutar(ruta, opciones, { reintentable = true } = {}) {
  const url = `${URL_BASE}${ruta}`;

  const encabezados = { ...(opciones.headers || {}) };
  const token = almacenSesion.leerToken();
  if (token) encabezados.Authorization = `Bearer ${token}`;

  // Con FormData NO se define Content-Type: el navegador debe generarlo para
  // incluir el boundary del multipart. Definirlo a mano rompe la carga.
  const esFormData = opciones.body instanceof FormData;
  if (!esFormData && opciones.body !== undefined) {
    encabezados['Content-Type'] = 'application/json';
  }

  let respuesta;
  try {
    respuesta = await fetch(url, {
      ...opciones,
      headers: encabezados,
      body:
        opciones.body === undefined || esFormData
          ? opciones.body
          : JSON.stringify(opciones.body),
    });
  } catch {
    throw new ErrorApi(
      'No fue posible conectar con el servidor. Verifique su conexion a internet e intente de nuevo.',
      { estadoHttp: 0, codigo: 'SIN_CONEXION' }
    );
  }

  // --- Token expirado: se intenta renovar una sola vez ---
  if (respuesta.status === 401 && reintentable && alRefrescar) {
    const renovado = await alRefrescar();

    if (renovado) {
      return ejecutar(ruta, opciones, { reintentable: false });
    }

    // No fue posible renovar: la sesion termino de verdad.
    if (alPerderSesion) alPerderSesion();
    throw new ErrorApi('Su sesion ha expirado. Inicie sesion nuevamente.', {
      estadoHttp: 401,
      codigo: 'SESION_EXPIRADA',
    });
  }

  // --- Respuestas sin contenido (204) ---
  if (respuesta.status === 204) return null;

  // --- Respuestas binarias (descarga de reportes) ---
  if (opciones.tipoRespuesta === 'blob') {
    if (!respuesta.ok) {
      throw new ErrorApi('No fue posible generar el archivo solicitado.', {
        estadoHttp: respuesta.status,
        codigo: 'DESCARGA_FALLIDA',
      });
    }
    return respuesta;
  }

  // --- Respuestas JSON ---
  let cuerpo = null;
  const tipoContenido = respuesta.headers.get('content-type') || '';
  if (tipoContenido.includes('application/json')) {
    cuerpo = await respuesta.json().catch(() => null);
  }

  if (!respuesta.ok) {
    throw new ErrorApi(
      cuerpo?.mensaje || `La operacion fallo con el codigo ${respuesta.status}.`,
      {
        estadoHttp: respuesta.status,
        codigo: cuerpo?.codigo || 'ERROR_DESCONOCIDO',
        detalles: cuerpo?.detalles || null,
      }
    );
  }

  return cuerpo;
}

// ---------------------------------------------------------------------
// API publica del cliente
// ---------------------------------------------------------------------
export const cliente = {
  /** Peticion GET. `parametros` se serializa como query string. */
  obtener(ruta, parametros) {
    return ejecutar(`${ruta}${construirConsulta(parametros)}`, { method: 'GET' });
  },

  /** Peticion POST con cuerpo JSON. */
  crear(ruta, cuerpo) {
    return ejecutar(ruta, { method: 'POST', body: cuerpo });
  },

  /** Peticion PATCH con cuerpo JSON. */
  actualizar(ruta, cuerpo) {
    return ejecutar(ruta, { method: 'PATCH', body: cuerpo });
  },

  /** Peticion DELETE. */
  eliminar(ruta) {
    return ejecutar(ruta, { method: 'DELETE' });
  },

  /**
   * Carga de archivos (multipart/form-data).
   * @param {string} ruta
   * @param {File[]} archivos
   * @param {string} nombreCampo Nombre del campo que espera multer en el backend.
   */
  subirArchivos(ruta, archivos, nombreCampo = 'archivos') {
    const datos = new FormData();
    archivos.forEach((archivo) => datos.append(nombreCampo, archivo));
    return ejecutar(ruta, { method: 'POST', body: datos });
  },

  /**
   * Descarga un archivo y dispara el guardado en el navegador.
   * @returns {Promise<{nombreArchivo:string, sinDatos:boolean, aviso:string|null}>}
   */
  async descargarArchivo(ruta, parametros, nombrePorDefecto = 'reporte') {
    const respuesta = await ejecutar(`${ruta}${construirConsulta(parametros)}`, {
      method: 'GET',
      tipoRespuesta: 'blob',
    });

    // El nombre real viene en Content-Disposition; si no, se usa el de respaldo.
    const disposicion = respuesta.headers.get('content-disposition') || '';
    const coincidencia = /filename="([^"]+)"/.exec(disposicion);
    const nombreArchivo = coincidencia ? coincidencia[1] : nombrePorDefecto;

    const objetoUrl = URL.createObjectURL(await respuesta.blob());
    const enlace = document.createElement('a');
    enlace.href = objetoUrl;
    enlace.download = nombreArchivo;
    document.body.appendChild(enlace);
    enlace.click();
    document.body.removeChild(enlace);
    // Liberar el objeto URL evita fugas de memoria si se descargan muchos reportes.
    URL.revokeObjectURL(objetoUrl);

    return {
      nombreArchivo,
      sinDatos: respuesta.headers.get('x-reporte-sin-datos') === 'true',
      aviso: respuesta.headers.get('x-reporte-aviso')
        ? decodeURIComponent(respuesta.headers.get('x-reporte-aviso'))
        : null,
    };
  },

  /** URL absoluta de un recurso (util para enlaces de descarga directa). */
  urlAbsoluta(ruta) {
    return `${URL_BASE}${ruta}`;
  },
};

export default cliente;
