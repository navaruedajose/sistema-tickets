'use strict';

/**
 * Middleware de carga de archivos (multer).
 *
 * Defensa en profundidad contra el "cliente toxico":
 *  1. Limite de tamano duro (por defecto 10 MB) -> evita agotar el disco.
 *  2. Lista blanca de MIME types -> no acepta .exe, .sh, .php, etc.
 *  3. Nombre de archivo generado por el servidor -> imposibilita path
 *     traversal (../../etc/passwd) y sobreescritura de archivos.
 *  4. Se descarta la extension original del nombre y se deriva del MIME.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const multer = require('multer');
const config = require('../config/env');
const AppError = require('../core/errors/AppError');

/** Extension canonica por MIME type (nunca confiamos en la del cliente). */
const EXTENSION_POR_MIME = Object.freeze({
  'image/png': '.png',
  'image/jpeg': '.jpg',
  'image/gif': '.gif',
  'image/webp': '.webp',
  'application/pdf': '.pdf',
  'text/plain': '.txt',
  'text/csv': '.csv',
  'application/zip': '.zip',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '.docx',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': '.xlsx',
});

/** Garantiza que el directorio de evidencias exista al arrancar. */
function asegurarDirectorio(directorio) {
  if (!fs.existsSync(directorio)) {
    fs.mkdirSync(directorio, { recursive: true });
  }
}

const almacenamientoEnDisco = multer.diskStorage({
  destination(req, archivo, callback) {
    const destino = path.join(config.archivos.directorio, 'evidencias');
    asegurarDirectorio(destino);
    callback(null, destino);
  },

  filename(req, archivo, callback) {
    // Nombre 100% controlado por el servidor: timestamp + aleatorio + ext.
    const aleatorio = crypto.randomBytes(16).toString('hex');
    const extension = EXTENSION_POR_MIME[archivo.mimetype] || '';
    callback(null, `${Date.now()}-${aleatorio}${extension}`);
  },
});

function filtroDeArchivos(req, archivo, callback) {
  if (!config.archivos.tiposPermitidos.includes(archivo.mimetype)) {
    return callback(
      AppError.archivoInvalido(
        `Tipo de archivo no permitido (${archivo.mimetype}). Formatos aceptados: PNG, JPG, GIF, WEBP, PDF, TXT, CSV, ZIP, DOCX y XLSX.`
      )
    );
  }
  return callback(null, true);
}

const subidaDeEvidencias = multer({
  storage: almacenamientoEnDisco,
  limits: {
    fileSize: config.archivos.tamanoMaximoBytes,
    files: 5, // maximo 5 evidencias por peticion
    fields: 20,
    parts: 30,
  },
  fileFilter: filtroDeArchivos,
});

/**
 * Envuelve multer para traducir sus errores a nuestro AppError, de modo que
 * el cliente siempre reciba el mismo formato de respuesta.
 */
function cargarEvidencias(campo = 'archivos') {
  const manejador = subidaDeEvidencias.array(campo, 5);

  return function middlewareCarga(peticion, respuesta, siguiente) {
    manejador(peticion, respuesta, (error) => {
      if (!error) return siguiente();

      if (error instanceof multer.MulterError) {
        const mensajes = {
          LIMIT_FILE_SIZE: `El archivo excede el limite permitido de ${config.archivos.tamanoMaximoBytes / (1024 * 1024)} MB.`,
          LIMIT_FILE_COUNT: 'Se permite un maximo de 5 archivos por envio.',
          LIMIT_UNEXPECTED_FILE: `El campo "${campo}" no es el esperado para la carga de archivos.`,
        };

        // 413 para el tamano (la peticion es valida, solo es demasiado grande);
        // 400 para el resto de restricciones de forma de la peticion.
        const errorTraducido =
          error.code === 'LIMIT_FILE_SIZE'
            ? AppError.archivoDemasiadoGrande(mensajes.LIMIT_FILE_SIZE)
            : AppError.solicitudInvalida(mensajes[error.code] || `Error al cargar el archivo: ${error.code}.`);

        return siguiente(errorTraducido);
      }

      return siguiente(error);
    });
  };
}

module.exports = { cargarEvidencias, EXTENSION_POR_MIME, asegurarDirectorio };
