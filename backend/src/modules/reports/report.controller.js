'use strict';

/**
 * Controlador de reportes.
 *
 * Dos modos de entrega:
 *  - `descargar`: transmite el archivo binario (PDF/XLSX) al navegador.
 *  - `json`: devuelve los datos crudos para que el frontend dibuje graficas.
 */

const fs = require('fs');
const asyncHandler = require('../../core/http/asyncHandler');
const ApiResponse = require('../../core/http/ApiResponse');
const logger = require('../../utils/logger');

class ReportController {
  /**
   * @param {import('./report.service')} servicioReportes
   */
  constructor(servicioReportes) {
    this.servicio = servicioReportes;
  }

  /**
   * GET /reportes/tickets?formato=pdf&desde=...&hasta=...&tipo=gestion
   * Responde con el archivo listo para descargar.
   */
  descargar = asyncHandler(async (peticion, respuesta) => {
    const { formato, desde, hasta, tipo } = peticion.query;

    const resultado = await this.servicio.generarReporteGestion({ formato, desde, hasta, tipo });

    respuesta.setHeader('Content-Type', resultado.mimeType);
    // El nombre se envia entre comillas y codificado: soporta acentos y
    // evita que un nombre con caracteres especiales rompa el encabezado.
    respuesta.setHeader(
      'Content-Disposition',
      `attachment; filename="${resultado.nombre}"; filename*=UTF-8''${encodeURIComponent(resultado.nombre)}`
    );
    respuesta.setHeader('X-Content-Type-Options', 'nosniff');
    // Expone los metadatos al frontend sin tener que abrir el archivo.
    respuesta.setHeader('X-Reporte-Sin-Datos', String(resultado.sinDatos));
    if (resultado.aviso) {
      respuesta.setHeader('X-Reporte-Aviso', encodeURIComponent(resultado.aviso));
    }

    // Se transmite por streaming y luego se elimina el archivo temporal.
    const flujo = fs.createReadStream(resultado.ruta);

    flujo.on('end', () => {
      fs.unlink(resultado.ruta, (error) => {
        if (error) logger.advertencia('No se pudo eliminar el reporte temporal', { ruta: resultado.ruta });
      });
    });
    flujo.on('error', (error) => {
      logger.error('Error al transmitir el reporte', { mensaje: error.message });
      if (!respuesta.headersSent) {
        respuesta.status(500).end();
      }
    });

    flujo.pipe(respuesta);
  });

  /** GET /reportes/dashboard -> datos JSON para las graficas del panel. */
  dashboard = asyncHandler(async (peticion, respuesta) => {
    const { desde, hasta, dias } = peticion.query;
    const datos = await this.servicio.obtenerDatosDashboard({ desde, hasta, dias });
    return ApiResponse.ok(respuesta, datos);
  });

  /** POST /reportes/limpiar -> mantiene el disco bajo control. */
  limpiar = asyncHandler(async (peticion, respuesta) => {
    const horas = parseInt(peticion.query.horas, 10);
    const resultado = await this.servicio.limpiarReportesAntiguos(
      Number.isFinite(horas) && horas > 0 ? horas : 24
    );
    return ApiResponse.ok(respuesta, resultado, `Se eliminaron ${resultado.eliminados} reporte(s) antiguo(s).`);
  });
}

module.exports = ReportController;
