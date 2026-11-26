'use strict';

/**
 * Generadores de reportes (patron Strategy).
 *
 * Se definen dos implementaciones intercambiables de la misma interfaz
 * (`generar(datos) -> Promise<{ruta, nombre, mimeType}>`):
 *   - PdfReportGenerator   (usando pdfkit)
 *   - ExcelReportGenerator (usando exceljs)
 *
 * El servicio de reportes elige la implementacion segun el formato pedido y
 * no conoce los detalles de ninguna de las dos. Agregar un tercer formato
 * (por ejemplo CSV) implica escribir una clase nueva, sin tocar el servicio.
 * Ese es exactamente el principio Abierto/Cerrado.
 */

const fs = require('fs');
const path = require('path');
const PDFDocument = require('pdfkit');
const ExcelJS = require('exceljs');

const config = require('../../config/env');

/** Asegura que exista el directorio de salida de reportes. */
function asegurarDirectorioReportes() {
  if (!fs.existsSync(config.archivos.directorioReportes)) {
    fs.mkdirSync(config.archivos.directorioReportes, { recursive: true });
  }
  return config.archivos.directorioReportes;
}

/** Paleta corporativa compartida por ambos formatos. */
const COLORES = Object.freeze({
  primario: '#1D4ED8',
  primarioClaro: '#DBEAFE',
  texto: '#1F2937',
  textoSecundario: '#6B7280',
  borde: '#E5E7EB',
  exito: '#15803D',
  alerta: '#B45309',
  peligro: '#B91C1C',
});

// =====================================================================
// Generador PDF
// =====================================================================
class PdfReportGenerator {
  constructor() {
    this.formato = 'pdf';
    this.mimeType = 'application/pdf';
  }

  /**
   * @param {object} reporte Datos ya calculados por el servicio.
   * @returns {Promise<{ruta:string, nombre:string, mimeType:string}>}
   */
  async generar(reporte) {
    const directorio = asegurarDirectorioReportes();
    const nombreArchivo = `${reporte.nombreArchivo}.pdf`;
    const rutaCompleta = path.join(directorio, nombreArchivo);

    await new Promise((resolver, rechazar) => {
      const documento = new PDFDocument({
        size: 'A4',
        margin: 45,
        // Metadatos: aparecen en las propiedades del archivo.
        info: {
          Title: reporte.titulo,
          Author: 'Sistema de Tickets',
          Subject: reporte.descripcion || 'Reporte de gestion de tickets',
          CreationDate: new Date(),
        },
        bufferPages: true,
      });

      const flujo = fs.createWriteStream(rutaCompleta);
      documento.pipe(flujo);

      flujo.on('finish', resolver);
      flujo.on('error', rechazar);
      documento.on('error', rechazar);

      try {
        this.#construirDocumento(documento, reporte);
      } catch (error) {
        rechazar(error);
        return;
      }

      documento.end();
    });

    return { ruta: rutaCompleta, nombre: nombreArchivo, mimeType: this.mimeType, formato: this.formato };
  }

  /** Compone todo el contenido del PDF. */
  #construirDocumento(doc, reporte) {
    this.#encabezado(doc, reporte);
    this.#bloqueIndicadores(doc, reporte.indicadores);
    this.#tabla(doc, 'Distribucion de tickets por estado', ['Estado', 'Cantidad'], reporte.porEstado?.map((fila) => [fila.estado, String(fila.total)]) || []);
    this.#tabla(
      doc,
      'Distribucion por categoria y prioridad',
      ['Categoria', 'Prioridad', 'Cantidad'],
      reporte.porCategoria?.map((fila) => [fila.categoria, fila.prioridad, String(fila.total)]) || []
    );
    this.#tabla(
      doc,
      'Desempeno por agente',
      ['Agente', 'Asignados', 'Resueltos', 'Pendientes', 'Hrs. prom.', 'Cumpl. SLA'],
      reporte.porAgente?.map((fila) => [
        fila.agente,
        String(fila.total_asignados),
        String(fila.total_resueltos),
        String(fila.total_pendientes),
        fila.promedio_horas_resolucion != null ? String(fila.promedio_horas_resolucion) : '-',
        fila.porcentaje_cumplimiento_sla != null ? `${fila.porcentaje_cumplimiento_sla}%` : '-',
      ]) || []
    );
    this.#pieDePagina(doc);
  }

  #encabezado(doc, reporte) {
    doc.rect(0, 0, doc.page.width, 88).fill(COLORES.primario);
    doc
      .fillColor('#FFFFFF')
      .fontSize(20)
      .font('Helvetica-Bold')
      .text('Sistema de Tickets', 45, 26);
    doc
      .fontSize(11)
      .font('Helvetica')
      .fillColor('#DBEAFE')
      .text(reporte.titulo, 45, 52);

    doc.fillColor(COLORES.textoSecundario).fontSize(9).font('Helvetica');
    doc.text(`Generado: ${new Date().toLocaleString('es-MX')}`, 45, 100, { align: 'right' });
    doc.text(`Periodo: ${reporte.periodoTexto}`, 45, 114, { align: 'right' });
    doc.moveDown(2);
  }

  #bloqueIndicadores(doc, indicadores) {
    if (!indicadores) return;

    const tarjetas = [
      { etiqueta: 'Total de tickets', valor: indicadores.total_tickets ?? 0, color: COLORES.primario },
      { etiqueta: 'Resueltos / cerrados', valor: indicadores.resueltos ?? 0, color: COLORES.exito },
      { etiqueta: 'Pendientes', valor: indicadores.pendientes ?? 0, color: COLORES.alerta },
      { etiqueta: 'Con SLA vencido', valor: indicadores.vencidos ?? 0, color: COLORES.peligro },
    ];

    const ancho = (doc.page.width - 90 - 30) / 4;
    const y = doc.y + 8;

    tarjetas.forEach((tarjeta, indice) => {
      const x = 45 + indice * (ancho + 10);
      doc.roundedRect(x, y, ancho, 62, 6).fill('#F9FAFB').stroke(COLORES.borde);
      doc.fillColor(tarjeta.color).fontSize(20).font('Helvetica-Bold').text(String(tarjeta.valor), x + 12, y + 12);
      doc.fillColor(COLORES.textoSecundario).fontSize(8).font('Helvetica').text(tarjeta.etiqueta.toUpperCase(), x + 12, y + 40, { width: ancho - 20 });
    });

    doc.y = y + 78;
    doc.fillColor(COLORES.texto).fontSize(10).font('Helvetica');
    doc.text(
      `Tiempo promedio de resolucion: ${indicadores.promedio_horas_resolucion ?? 'N/D'} horas   |   Cumplimiento de SLA: ${indicadores.porcentaje_cumplimiento_sla ?? 'N/D'}%`,
      45,
      doc.y
    );
    doc.moveDown(1.4);
  }

  /** Dibuja una tabla simple con cabecera y filas alternadas. */
  #tabla(doc, titulo, encabezados, filas) {
    doc.fillColor(COLORES.texto).fontSize(12).font('Helvetica-Bold').text(titulo, 45, doc.y);
    doc.moveDown(0.5);

    const xInicial = 45;
    const anchoDisponible = doc.page.width - 90;
    const anchoColumna = anchoDisponible / encabezados.length;
    let y = doc.y;

    // Si no hay datos, se indica explicitamente en lugar de dejar un hueco.
    if (!filas || filas.length === 0) {
      doc
        .fillColor(COLORES.textoSecundario)
        .fontSize(9)
        .font('Helvetica-Oblique')
        .text('Sin informacion para el periodo seleccionado.', xInicial, y);
      doc.moveDown(1.5);
      return;
    }

    // Cabecera
    doc.rect(xInicial, y, anchoDisponible, 20).fill(COLORES.primarioClaro);
    doc.fillColor(COLORES.texto).fontSize(9).font('Helvetica-Bold');
    encabezados.forEach((encabezado, indice) => {
      doc.text(encabezado, xInicial + indice * anchoColumna + 5, y + 6, {
        width: anchoColumna - 10,
        ellipsis: true,
      });
    });
    y += 20;

    // Filas
    filas.forEach((fila, indiceFila) => {
      // Salto de pagina controlado, repitiendo la cabecera.
      if (y > doc.page.height - 90) {
        doc.addPage();
        y = 60;
        doc.rect(xInicial, y, anchoDisponible, 20).fill(COLORES.primarioClaro);
        doc.fillColor(COLORES.texto).fontSize(9).font('Helvetica-Bold');
        encabezados.forEach((encabezado, indice) => {
          doc.text(encabezado, xInicial + indice * anchoColumna + 5, y + 6, {
            width: anchoColumna - 10,
            ellipsis: true,
          });
        });
        y += 20;
      }

      if (indiceFila % 2 === 1) {
        doc.rect(xInicial, y, anchoDisponible, 18).fill('#F9FAFB');
      }

      doc.fillColor(COLORES.texto).fontSize(8.5).font('Helvetica');
      fila.forEach((celda, indice) => {
        doc.text(String(celda ?? '-'), xInicial + indice * anchoColumna + 5, y + 5, {
          width: anchoColumna - 10,
          ellipsis: true,
        });
      });

      doc
        .moveTo(xInicial, y + 18)
        .lineTo(xInicial + anchoDisponible, y + 18)
        .strokeColor(COLORES.borde)
        .lineWidth(0.5)
        .stroke();

      y += 18;
    });

    doc.y = y + 16;
  }

  /** Numeracion de paginas al final, cuando ya se conocen todas. */
  #pieDePagina(doc) {
    const rango = doc.bufferedPageRange();
    for (let indice = 0; indice < rango.count; indice += 1) {
      doc.switchToPage(rango.start + indice);
      doc
        .fillColor(COLORES.textoSecundario)
        .fontSize(8)
        .font('Helvetica')
        .text(
          `Sistema de Tickets - Documento generado automaticamente   |   Pagina ${indice + 1} de ${rango.count}`,
          45,
          doc.page.height - 40,
          { align: 'center', width: doc.page.width - 90 }
        );
    }
  }
}

// =====================================================================
// Generador Excel
// =====================================================================
class ExcelReportGenerator {
  constructor() {
    this.formato = 'xlsx';
    this.mimeType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
  }

  async generar(reporte) {
    const directorio = asegurarDirectorioReportes();
    const nombreArchivo = `${reporte.nombreArchivo}.xlsx`;
    const rutaCompleta = path.join(directorio, nombreArchivo);

    const libro = new ExcelJS.Workbook();
    libro.creator = 'Sistema de Tickets';
    libro.created = new Date();
    libro.title = reporte.titulo;

    this.#hojaIndicadores(libro, reporte);
    this.#hojaResumen(libro, reporte);
    this.#hojaAgentes(libro, reporte);
    this.#hojaDetalle(libro, reporte);

    await libro.xlsx.writeFile(rutaCompleta);

    return { ruta: rutaCompleta, nombre: nombreArchivo, mimeType: this.mimeType, formato: this.formato };
  }

  #hojaIndicadores(libro, reporte) {
    const hoja = libro.addWorksheet('Indicadores', { properties: { tabColor: { argb: 'FF1D4ED8' } } });
    hoja.columns = [
      { header: 'Indicador', key: 'indicador', width: 38 },
      { header: 'Valor', key: 'valor', width: 22 },
    ];

    const indicadores = reporte.indicadores || {};
    const filas = [
      ['Titulo del reporte', reporte.titulo],
      ['Periodo', reporte.periodoTexto],
      ['Generado el', new Date().toLocaleString('es-MX')],
      ['', ''],
      ['Total de tickets', indicadores.total_tickets ?? 0],
      ['Tickets resueltos / cerrados', indicadores.resueltos ?? 0],
      ['Tickets pendientes', indicadores.pendientes ?? 0],
      ['Tickets cancelados', indicadores.cancelados ?? 0],
      ['Tickets con SLA vencido', indicadores.vencidos ?? 0],
      ['Promedio de horas de resolucion', indicadores.promedio_horas_resolucion ?? 'N/D'],
      ['Cumplimiento de SLA (%)', indicadores.porcentaje_cumplimiento_sla ?? 'N/D'],
    ];

    filas.forEach((fila) => hoja.addRow({ indicador: fila[0], valor: fila[1] }));

    this.#estilizarCabecera(hoja);
    hoja.getColumn('indicador').font = { bold: true, color: { argb: 'FF1F2937' } };
  }

  #hojaResumen(libro, reporte) {
    const hoja = libro.addWorksheet('Resumen');
    hoja.columns = [
      { header: 'Estado', key: 'estado', width: 18 },
      { header: 'Cantidad', key: 'total', width: 14 },
      { header: 'Categoria', key: 'categoria', width: 26 },
      { header: 'Prioridad', key: 'prioridad', width: 14 },
      { header: 'Total por categoria', key: 'totalCategoria', width: 20 },
    ];

    (reporte.porEstado || []).forEach((fila) => {
      hoja.addRow({ estado: fila.estado, total: fila.total });
    });

    hoja.addRow({});
    hoja.addRow({ estado: '--- Por categoria y prioridad ---' });

    (reporte.porCategoria || []).forEach((fila) => {
      hoja.addRow({
        categoria: fila.categoria,
        prioridad: fila.prioridad,
        totalCategoria: fila.total,
      });
    });

    this.#estilizarCabecera(hoja);
  }

  #hojaAgentes(libro, reporte) {
    const hoja = libro.addWorksheet('Desempeno por agente');
    hoja.columns = [
      { header: 'Agente', key: 'agente', width: 30 },
      { header: 'Correo', key: 'correo_agente', width: 30 },
      { header: 'Asignados', key: 'total_asignados', width: 12 },
      { header: 'Resueltos', key: 'total_resueltos', width: 12 },
      { header: 'Cerrados', key: 'total_cerrados', width: 12 },
      { header: 'Pendientes', key: 'total_pendientes', width: 12 },
      { header: 'Hrs. promedio', key: 'promedio_horas_resolucion', width: 16 },
      { header: 'Cumplimiento SLA (%)', key: 'porcentaje_cumplimiento_sla', width: 22 },
    ];

    (reporte.porAgente || []).forEach((fila) => hoja.addRow(fila));

    this.#estilizarCabecera(hoja);

    // Formato condicional: resalta en rojo el incumplimiento de SLA.
    hoja.eachRow((fila, numeroFila) => {
      if (numeroFila === 1) return;
      const celda = fila.getCell('porcentaje_cumplimiento_sla');
      if (typeof celda.value === 'number' && celda.value < 80) {
        celda.font = { color: { argb: 'FFB91C1C' }, bold: true };
      }
    });
  }

  #hojaDetalle(libro, reporte) {
    const hoja = libro.addWorksheet('Detalle de tickets');
    hoja.columns = [
      { header: 'Folio', key: 'codigo', width: 18 },
      { header: 'Titulo', key: 'titulo', width: 42 },
      { header: 'Estado', key: 'estado', width: 14 },
      { header: 'Prioridad', key: 'prioridad', width: 12 },
      { header: 'Categoria', key: 'categoria', width: 20 },
      { header: 'Solicitante', key: 'solicitante', width: 26 },
      { header: 'Agente', key: 'agente', width: 26 },
      { header: 'Creado', key: 'creado_en', width: 20 },
      { header: 'Fecha limite SLA', key: 'fecha_limite_sla', width: 20 },
      { header: 'Resuelto', key: 'fecha_resolucion', width: 20 },
      { header: 'Horas de resolucion', key: 'horas_resolucion', width: 20 },
      { header: 'Cumplimiento SLA', key: 'cumplimiento_sla', width: 20 },
    ];

    (reporte.detalle || []).forEach((fila) => {
      hoja.addRow({
        ...fila,
        creado_en: fila.creado_en ? new Date(fila.creado_en).toLocaleString('es-MX') : '-',
        fecha_limite_sla: fila.fecha_limite_sla ? new Date(fila.fecha_limite_sla).toLocaleString('es-MX') : '-',
        fecha_resolucion: fila.fecha_resolucion ? new Date(fila.fecha_resolucion).toLocaleString('es-MX') : 'Pendiente',
      });
    });

    this.#estilizarCabecera(hoja);

    // Autofiltro: el usuario puede segmentar sin tocar la hoja de calculo.
    if (hoja.rowCount > 1) {
      hoja.autoFilter = { from: 'A1', to: 'L1' };
    }
  }

  /** Aplica negrita y color de fondo a la fila de encabezados. */
  #estilizarCabecera(hoja) {
    const encabezado = hoja.getRow(1);
    encabezado.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    encabezado.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF1D4ED8' },
    };
    encabezado.alignment = { vertical: 'middle', horizontal: 'center' };
    encabezado.height = 22;
    hoja.views = [{ state: 'frozen', ySplit: 1 }];
  }
}

module.exports = { PdfReportGenerator, ExcelReportGenerator };
