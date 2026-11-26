'use strict';

/**
 * Controlador de adjuntos.
 */

const asyncHandler = require('../../core/http/asyncHandler');
const ApiResponse = require('../../core/http/ApiResponse');
const AppError = require('../../core/errors/AppError');
const { Readable } = require('node:stream');

class AttachmentController {
  /**
   * @param {import('./attachment.service')} servicioAdjuntos
   */
  constructor(servicioAdjuntos) {
    this.servicio = servicioAdjuntos;
  }

  /** POST /tickets/:ticketId/adjuntos (multipart/form-data, campo "archivos") */
  subir = asyncHandler(async (peticion, respuesta) => {
    const adjuntos = await this.servicio.guardarEvidencias(
      peticion.params.ticketId,
      peticion.files,
      peticion.usuario
    );
    return ApiResponse.creado(
      respuesta,
      adjuntos,
      `${adjuntos.length} archivo(s) adjuntado(s) correctamente.`
    );
  });

  listar = asyncHandler(async (peticion, respuesta) => {
    const adjuntos = await this.servicio.listarAdjuntos(peticion.params.ticketId, peticion.usuario);
    return ApiResponse.ok(respuesta, adjuntos);
  });

  /** Descarga binaria: se transmite el archivo tal cual, sin envoltorio JSON. */
  descargar = asyncHandler(async (peticion, respuesta) => {
    const { tipo, url, rutaAbsoluta, adjunto } = await this.servicio.obtenerRutaDescarga(
      peticion.params.adjuntoId,
      peticion.usuario
    );

    // Evidencia en Cloudinary: se transmite a traves del backend para que la
    // descarga siga siendo del mismo origen. Redirigir a Cloudinary ahorraria
    // ancho de banda, pero obligaria al navegador a leer cabeceras de otro
    // dominio (CORS) y el nombre del archivo se perderia en algunos casos.
    if (tipo === 'url') {
      const remota = await fetch(url);

      if (!remota.ok) {
        throw AppError.noEncontrado('El archivo fisico del adjunto');
      }

      respuesta.setHeader('Content-Type', adjunto.mime_type);
      respuesta.setHeader(
        'Content-Disposition',
        `attachment; filename="${encodeURIComponent(adjunto.nombre_original)}"`
      );
      respuesta.setHeader('X-Content-Type-Options', 'nosniff');

      const tamano = remota.headers.get('content-length');
      if (tamano) respuesta.setHeader('Content-Length', tamano);

      // Si la conexion con Cloudinary se corta a mitad, se destruye la
      // respuesta para que el cliente no reciba un archivo truncado como
      // si estuviera completo.
      Readable.fromWeb(remota.body)
        .on('error', () => respuesta.destroy())
        .pipe(respuesta);

      return undefined;
    }

    respuesta.setHeader('Content-Type', adjunto.mime_type);
    respuesta.setHeader(
      'Content-Disposition',
      `attachment; filename="${encodeURIComponent(adjunto.nombre_original)}"`
    );
    // Evita que el navegador intente "adivinar" el tipo y ejecute el archivo.
    respuesta.setHeader('X-Content-Type-Options', 'nosniff');

    return respuesta.sendFile(rutaAbsoluta);
  });

  eliminar = asyncHandler(async (peticion, respuesta) => {
    await this.servicio.eliminarAdjunto(peticion.params.adjuntoId, peticion.usuario);
    return ApiResponse.sinContenido(respuesta);
  });
}

module.exports = AttachmentController;
