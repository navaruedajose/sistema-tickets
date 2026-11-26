'use strict';

/**
 * Servicio de adjuntos: almacenamiento de evidencias.
 *
 * Puntos de defensa implementados aqui (y no en el controlador):
 *  1. Cuota por ticket: un ticket no puede acumular mas de 50 MB.
 *  2. Verificacion de tipo de archivo por firma binaria (magic numbers), no
 *     solo por el encabezado Content-Type que envia el cliente. Asi un
 *     archivo .exe renombrado a .png es rechazado.
 *  3. Hash SHA-256: garantiza integridad y permite deduplicar.
 *  4. Limpieza en disco si la operacion falla despues de escribir el archivo.
 */

const fs = require('fs/promises');
const fsSync = require('fs');
const path = require('path');
const crypto = require('crypto');
const AppError = require('../../core/errors/AppError');
const { ROLES } = require('../../config/constants');
const config = require('../../config/env');
const cloudinary = require('../../config/cloudinary');
const logger = require('../../utils/logger');

const CUOTA_POR_TICKET_BYTES = 50 * 1024 * 1024; // 50 MB

/**
 * Firmas binarias (magic numbers) de los formatos que aceptamos.
 * Se comparan contra los primeros bytes del archivo real.
 */
const FIRMAS = [
  { tipo: 'image/png', bytes: [0x89, 0x50, 0x4e, 0x47] },
  { tipo: 'image/jpeg', bytes: [0xff, 0xd8, 0xff] },
  { tipo: 'image/gif', bytes: [0x47, 0x49, 0x46, 0x38] },
  { tipo: 'application/pdf', bytes: [0x25, 0x50, 0x44, 0x46] }, // %PDF
  { tipo: 'application/zip', bytes: [0x50, 0x4b, 0x03, 0x04] }, // PK.. (zip, docx, xlsx)
  { tipo: 'application/zip', bytes: [0x50, 0x4b, 0x05, 0x06] }, // zip vacio
];

class AttachmentService {
  /**
   * @param {object} dependencias
   * @param {import('./attachment.repository')} dependencias.repositorioAdjuntos
   * @param {import('../tickets/ticket.service')} dependencias.servicioTickets
   */
  constructor({ repositorioAdjuntos, servicioTickets }) {
    this.repositorio = repositorioAdjuntos;
    this.servicioTickets = servicioTickets;
  }

  /**
   * Guarda las evidencias cargadas para un ticket.
   * @param {string} ticketId
   * @param {Array<Express.Multer.File>} archivos
   * @param {object} usuario
   */
  async guardarEvidencias(ticketId, archivos, usuario) {
    if (!archivos || archivos.length === 0) {
      throw AppError.solicitudInvalida('Debe adjuntar al menos un archivo en el campo "archivos".');
    }

    // 1. Control de acceso: reutiliza la regla del servicio de tickets.
    const ticket = await this.servicioTickets.obtenerTicket(ticketId, usuario);

    // Un solicitante no puede subir evidencia a un ticket que no es suyo.
    if (
      usuario.rol === ROLES.SOLICITANTE &&
      ticket.solicitante_id !== usuario.id
    ) {
      await this.#limpiarArchivos(archivos);
      throw AppError.noEncontrado('El ticket');
    }

    // 2. Cuota acumulada.
    const tamanoActual = await this.repositorio.calcularTamanoTotal(ticketId);
    const tamanoEntrante = archivos.reduce((suma, archivo) => suma + archivo.size, 0);

    if (tamanoActual + tamanoEntrante > CUOTA_POR_TICKET_BYTES) {
      await this.#limpiarArchivos(archivos);
      throw AppError.conflicto(
        `Se excedio la cuota de almacenamiento del ticket (maximo ${CUOTA_POR_TICKET_BYTES / (1024 * 1024)} MB).`
      );
    }

    // 3. Verificacion de contenido real de cada archivo.
    for (const archivo of archivos) {
      const esValido = await this.#verificarFirmaBinaria(archivo.path, archivo.mimetype);
      if (!esValido) {
        await this.#limpiarArchivos(archivos);
        throw AppError.archivoInvalido(
          `El archivo "${archivo.originalname}" no corresponde al tipo declarado. Verifique que no este danado o renombrado.`
        );
      }
    }

    // 4. Registro en base de datos. Si algo falla, se limpia lo ya subido.
    const publicIdsSubidos = [];
    try {
      const registrados = [];
      for (const archivo of archivos) {
        const hashSha256 = await this.#calcularHash(archivo.path);

        // Deduplicacion: el mismo archivo dos veces en el mismo ticket no aporta.
        const duplicado = await this.repositorio.existeHashEnTicket(ticketId, hashSha256);
        if (duplicado) {
          await fs.unlink(archivo.path).catch(() => undefined);
          continue;
        }

        const persistido = await this.#persistirArchivo(archivo, ticketId);
        if (cloudinary.estaHabilitado) {
          publicIdsSubidos.push(persistido.nombreAlmacenado);
        }

        registrados.push(
          await this.repositorio.crear({
            ticketId,
            comentarioId: null,
            nombreOriginal: archivo.originalname,
            ...persistido,
            mimeType: archivo.mimetype,
            tamanoBytes: archivo.size,
            hashSha256,
            subidoPor: usuario.id,
          })
        );
      }

      if (registrados.length === 0) {
        throw AppError.conflicto('Los archivos enviados ya estaban adjuntos a este ticket.');
      }

      return registrados;
    } catch (error) {
      await this.#limpiarArchivos(archivos);
      // Si la subida a Cloudinary funciono pero el registro en base fallo,
      // se revierte tambien alla: no queremos archivos huerfanos pagando
      // almacenamiento que nadie puede ver desde la aplicacion.
      await Promise.all(publicIdsSubidos.map((id) => cloudinary.eliminarArchivo(id)));
      throw error;
    }
  }

  /** Lista los adjuntos de un ticket. */
  async listarAdjuntos(ticketId, usuario) {
    await this.servicioTickets.obtenerTicket(ticketId, usuario);
    return this.repositorio.listarPorTicket(ticketId);
  }

  /**
   * Resuelve como entregar un adjunto.
   *
   * Devuelve dos formas posibles:
   *   - `{ tipo: 'url' }`   cuando vive en Cloudinary: el controlador redirige.
   *   - `{ tipo: 'archivo' }` cuando vive en disco: el controlador lo envia.
   *
   * En el segundo caso la ruta se reconstruye desde el nombre almacenado
   * (generado por el servidor) y se verifica que siga dentro del directorio
   * de evidencias: es la proteccion definitiva contra path traversal.
   */
  async obtenerRutaDescarga(adjuntoId, usuario) {
    const adjunto = await this.repositorio.buscarPorId(adjuntoId);
    if (!adjunto) throw AppError.noEncontrado('El adjunto');

    await this.servicioTickets.obtenerTicket(adjunto.ticket_id, usuario);

    // Evidencia alojada en Cloudinary: no hay archivo local que enviar.
    if (cloudinary.esUrlDeCloudinary(adjunto.ruta_relativa)) {
      return { tipo: 'url', url: adjunto.ruta_relativa, adjunto };
    }

    const directorioEvidencias = path.join(config.archivos.directorio, 'evidencias');
    const rutaAbsoluta = path.resolve(directorioEvidencias, path.basename(adjunto.nombre_almacenado));

    if (!rutaAbsoluta.startsWith(path.resolve(directorioEvidencias))) {
      throw AppError.prohibido('Ruta de archivo no permitida.');
    }
    if (!fsSync.existsSync(rutaAbsoluta)) {
      throw AppError.noEncontrado('El archivo fisico del adjunto');
    }

    return { tipo: 'archivo', rutaAbsoluta, adjunto };
  }

  /** Elimina un adjunto (registro + archivo en disco). */
  async eliminarAdjunto(adjuntoId, usuario) {
    const adjunto = await this.repositorio.buscarPorId(adjuntoId);
    if (!adjunto) throw AppError.noEncontrado('El adjunto');

    await this.servicioTickets.obtenerTicket(adjunto.ticket_id, usuario);

    const esPropietario = adjunto.subido_por === usuario.id;
    if (!esPropietario && usuario.rol !== ROLES.ADMINISTRADOR) {
      throw AppError.prohibido('Solo quien subio el archivo o un administrador puede eliminarlo.');
    }

    await this.repositorio.eliminar(adjuntoId);

    // Si vive en Cloudinary, se borra alli; si no, del disco local.
    if (cloudinary.esUrlDeCloudinary(adjunto.ruta_relativa)) {
      const eliminado = await cloudinary.eliminarArchivo(adjunto.nombre_almacenado);
      if (!eliminado) {
        // El registro ya no existe: un archivo huerfano en Cloudinary no es
        // critico, pero conviene dejarlo rastreado en el log.
        logger.advertencia('No se pudo eliminar la evidencia en Cloudinary', {
          publicId: adjunto.nombre_almacenado,
        });
      }
      return true;
    }

    const directorioEvidencias = path.join(config.archivos.directorio, 'evidencias');
    const rutaAbsoluta = path.resolve(directorioEvidencias, path.basename(adjunto.nombre_almacenado));
    await fs.unlink(rutaAbsoluta).catch((error) => {
      // El registro ya se elimino; un archivo huerfano en disco no es critico.
      logger.advertencia('No se pudo eliminar el archivo fisico del adjunto', {
        ruta: rutaAbsoluta,
        mensaje: error.message,
      });
    });

    return true;
  }

  // -------------------------------------------------------------------
  // Metodos privados
  // -------------------------------------------------------------------

  /**
   * Decide donde queda el archivo y devuelve los dos campos que van a la
   * base de datos.
   *
   * Con Cloudinary habilitado, `ruta_relativa` guarda la URL publica y
   * `nombre_almacenado` el public_id (que es lo que hace falta para
   * borrarlo despues). Sin Cloudinary, se conserva el comportamiento
   * original: nombre en disco y ruta relativa al directorio de evidencias.
   *
   * @param {Express.Multer.File} archivo
   * @param {string} ticketId
   * @returns {Promise<{nombreAlmacenado: string, rutaRelativa: string}>}
   */
  async #persistirArchivo(archivo, ticketId) {
    if (!cloudinary.estaHabilitado) {
      return {
        nombreAlmacenado: archivo.filename,
        rutaRelativa: path.relative(config.archivos.directorio, archivo.path).replace(/\\/g, '/'),
      };
    }

    const subido = await cloudinary.subirArchivo(archivo.path, {
      carpeta: `${cloudinary.carpeta}/tickets/${ticketId}`,
    });

    // Ya esta en Cloudinary: el temporal no debe quedarse en disco.
    await fs.unlink(archivo.path).catch(() => undefined);

    return { nombreAlmacenado: subido.publicId, rutaRelativa: subido.url };
  }

  /** SHA-256 calculado por streaming: no carga el archivo completo en RAM. */
  async #calcularHash(rutaArchivo) {
    const hash = crypto.createHash('sha256');
    const flujo = fsSync.createReadStream(rutaArchivo);
    for await (const fragmento of flujo) {
      hash.update(fragmento);
    }
    return hash.digest('hex');
  }

  /**
   * Comprueba los primeros bytes del archivo contra las firmas conocidas.
   * Es la diferencia entre "confiar en el cliente" y "verificar".
   */
  async #verificarFirmaBinaria(rutaArchivo, mimeDeclarado) {
    // Los tipos de texto no tienen firma binaria; se validan por contenido.
    if (mimeDeclarado === 'text/plain' || mimeDeclarado === 'text/csv') {
      const contenido = await fs.readFile(rutaArchivo, 'utf8').catch(() => '');
      // Un .txt que contiene bytes nulos o un shebang ejecutable se rechaza.
      return !contenido.includes('\u0000') && !contenido.startsWith('#!');
    }

    const descriptor = await fs.open(rutaArchivo, 'r');
    try {
      const buffer = Buffer.alloc(8);
      await descriptor.read(buffer, 0, 8, 0);

      return FIRMAS.some((firma) =>
        firma.bytes.every((byte, indice) => buffer[indice] === byte)
      );
    } finally {
      await descriptor.close();
    }
  }

  /** Elimina archivos temporales cuando la operacion no prospera. */
  async #limpiarArchivos(archivos) {
    await Promise.all(
      (archivos || []).map((archivo) => fs.unlink(archivo.path).catch(() => undefined))
    );
  }
}

module.exports = AttachmentService;
module.exports.CUOTA_POR_TICKET_BYTES = CUOTA_POR_TICKET_BYTES;
