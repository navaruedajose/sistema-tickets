'use strict';

/**
 * Servicio de reportes.
 *
 * Orquesta tres cosas: obtener los datos (repositorio), elegir el generador
 * segun el formato solicitado (patron Strategy) y devolver el archivo listo
 * para descargar.
 *
 * Defensa importante: el nombre del archivo se construye en el servidor a
 * partir de valores controlados. Nunca se usa texto enviado por el cliente
 * como parte de una ruta del sistema de archivos.
 */

const fs = require('fs');
const path = require('path');
const AppError = require('../../core/errors/AppError');
const logger = require('../../utils/logger');
const { PdfReportGenerator, ExcelReportGenerator } = require('./report.generators');
const config = require('../../config/env');

const FORMATOS_SOPORTADOS = ['pdf', 'xlsx'];

class ReportService {
  /**
   * @param {object} dependencias
   * @param {import('./report.repository')} dependencias.repositorioReportes
   * @param {object} [dependencias.generadores] Mapa formato -> generador.
   *   Inyectable para poder sustituirlo en pruebas.
   */
  constructor({ repositorioReportes, generadores = null }) {
    this.repositorio = repositorioReportes;
    this.generadores = generadores || {
      pdf: new PdfReportGenerator(),
      xlsx: new ExcelReportGenerator(),
    };
  }

  /** Valida el formato solicitado. */
  #resolverGenerador(formato) {
    const clave = String(formato || 'pdf').toLowerCase();
    if (!FORMATOS_SOPORTADOS.includes(clave)) {
      throw AppError.solicitudInvalida(
        `Formato de reporte no soportado: "${formato}". Formatos disponibles: ${FORMATOS_SOPORTADOS.join(', ')}.`
      );
    }
    return { clave, generador: this.generadores[clave] };
  }

  /** Texto legible del periodo para incluirlo en el encabezado del reporte. */
  #textoPeriodo(desde, hasta) {
    if (!desde && !hasta) return 'Historico completo (sin filtro de fechas)';
    const formato = (fecha) => new Date(`${fecha}T00:00:00`).toLocaleDateString('es-MX');
    if (desde && hasta) return `Del ${formato(desde)} al ${formato(hasta)}`;
    if (desde) return `Desde el ${formato(desde)}`;
    return `Hasta el ${formato(hasta)}`;
  }

  /**
   * Genera el reporte completo de gestion.
   * @param {object} opciones
   * @param {'pdf'|'xlsx'} opciones.formato
   * @param {string} [opciones.desde] Fecha ISO AAAA-MM-DD
   * @param {string} [opciones.hasta]
   * @param {string} [opciones.tipo] 'gestion' | 'agentes' | 'detalle'
   */
  async generarReporteGestion({ formato = 'pdf', desde = null, hasta = null, tipo = 'gestion' } = {}) {
    const { clave, generador } = this.#resolverGenerador(formato);

    if (desde && hasta && new Date(desde) > new Date(hasta)) {
      throw AppError.solicitudInvalida('La fecha "desde" no puede ser posterior a la fecha "hasta".');
    }

    const rango = { desde, hasta };

    // Las consultas son independientes: se ejecutan en paralelo para reducir
    // la latencia total del endpoint.
    const [indicadores, porEstado, porCategoria, porAgente, detalle] = await Promise.all([
      this.repositorio.indicadoresGlobales(rango),
      this.repositorio.resumenPorEstado(rango),
      this.repositorio.resumenPorPrioridadYCategoria(rango),
      this.repositorio.desempenoPorAgente(),
      this.repositorio.detalleTickets({ ...rango, limite: 5000 }),
    ]);

    const titulos = {
      gestion: 'Reporte de gestion de tickets',
      agentes: 'Reporte de desempeno por agente',
      detalle: 'Reporte detallado de tickets',
    };

    // Nombre de archivo generado por el servidor: solo caracteres seguros.
    const marcaTiempo = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
    const nombreArchivo = `reporte-${tipo}-${marcaTiempo}`;

    const reporte = {
      titulo: titulos[tipo] || titulos.gestion,
      descripcion: `Reporte generado por el Sistema de Tickets`,
      periodoTexto: this.#textoPeriodo(desde, hasta),
      nombreArchivo,
      indicadores,
      porEstado,
      porCategoria,
      porAgente,
      detalle,
      tipo,
    };

    logger.info('Generando reporte', { formato: clave, tipo, desde, hasta });

    const archivo = await generador.generar(reporte);

    // Si el reporte tiene cero tickets no es un error: se entrega el archivo
    // con el mensaje "sin informacion". El aviso se adjunta como metadato
    // para que el frontend pueda mostrarlo sin abrir el documento.
    const sinDatos = Number(indicadores?.total_tickets ?? 0) === 0;

    return {
      ...archivo,
      sinDatos,
      aviso: sinDatos
        ? 'No existen tickets en el periodo seleccionado. El reporte se genero con las tablas vacias.'
        : null,
      resumen: {
        totalTickets: Number(indicadores?.total_tickets ?? 0),
        resueltos: Number(indicadores?.resueltos ?? 0),
        pendientes: Number(indicadores?.pendientes ?? 0),
        vencidos: Number(indicadores?.vencidos ?? 0),
      },
    };
  }

  /** Datos del dashboard en formato JSON (sin generar archivo). */
  async obtenerDatosDashboard({ desde = null, hasta = null, dias = 30 } = {}) {
    const [indicadores, porEstado, porCategoria, porAgente, serie, topSolicitantes] =
      await Promise.all([
        this.repositorio.indicadoresGlobales({ desde, hasta }),
        this.repositorio.resumenPorEstado({ desde, hasta }),
        this.repositorio.resumenPorPrioridadYCategoria({ desde, hasta }),
        this.repositorio.desempenoPorAgente(),
        this.repositorio.serieTemporal({ desde, hasta, dias }),
        this.repositorio.topSolicitantes({ desde, hasta, limite: 10 }),
      ]);

    return {
      indicadores,
      porEstado,
      porCategoria,
      porAgente,
      serieTemporal: serie,
      topSolicitantes,
      generadoEn: new Date().toISOString(),
    };
  }

  /**
   * Elimina reportes generados hace mas de N horas.
   * Se ejecuta al arrancar el servidor para que el disco no crezca sin control
   * (un cliente toxico podria pedir cientos de reportes seguidos).
   */
  async limpiarReportesAntiguos(horasDeVida = 24) {
    const directorio = config.archivos.directorioReportes;
    if (!fs.existsSync(directorio)) return { eliminados: 0 };

    const limite = Date.now() - horasDeVida * 60 * 60 * 1000;
    const archivos = await fs.promises.readdir(directorio);

    let eliminados = 0;
    for (const archivo of archivos) {
      const ruta = path.join(directorio, archivo);
      try {
        const estadistica = await fs.promises.stat(ruta);
        if (estadistica.isFile() && estadistica.mtimeMs < limite) {
          await fs.promises.unlink(ruta);
          eliminados += 1;
        }
      } catch {
        // Un archivo que ya no existe no es un problema.
      }
    }

    if (eliminados > 0) logger.info('Reportes antiguos eliminados', { eliminados });
    return { eliminados };
  }
}

module.exports = ReportService;
module.exports.FORMATOS_SOPORTADOS = FORMATOS_SOPORTADOS;
