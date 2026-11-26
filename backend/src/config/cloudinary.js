'use strict';

/**
 * Almacenamiento de evidencias en Cloudinary.
 *
 * ---------------------------------------------------------------------
 * POR QUE EXISTE ESTE ARCHIVO
 * ---------------------------------------------------------------------
 * En local, las evidencias se guardan en el disco del contenedor. Eso
 * funciona, pero en la nube el sistema de archivos de los planes gratuitos
 * es EFIMERO: cada redespliegue borra las fotos subidas. Cloudinary las
 * conserva fuera del servidor y devuelve una URL estable.
 *
 * ---------------------------------------------------------------------
 * DISENO: EL PROVEEDOR ES OPCIONAL
 * ---------------------------------------------------------------------
 * Si las tres variables (CLOUDINARY_CLOUD_NAME, _API_KEY, _API_SECRET) no
 * estan definidas, `estaHabilitado` es false y el sistema sigue guardando
 * en disco exactamente como antes. Eso permite:
 *   - desarrollar y hacer la demo sin cuenta de Cloudinary,
 *   - ejecutar las pruebas sin red,
 *   - cambiar de proveedor sin tocar el servicio de adjuntos.
 *
 * El servicio de adjuntos no sabe si el archivo acabo en Cloudinary o en
 * disco: pregunta por `estaHabilitado` y actua en consecuencia.
 */

const { v2: cloudinary } = require('cloudinary');
const config = require('./env');
const logger = require('../utils/logger');

const { cloudName, apiKey, apiSecret, carpeta } = config.almacenamiento.cloudinary;

const modo = config.almacenamiento.proveedor;
const credencialesCompletas = Boolean(cloudName && apiKey && apiSecret);

// 'local' desactiva Cloudinary aunque haya credenciales; 'cloudinary'
// exige credenciales; 'auto' usa Cloudinary solo si estan completas.
const estaHabilitado = credencialesCompletas && modo !== 'local';

// Si se pidio explicitamente Cloudinary pero faltan credenciales, se avisa
// y se cae a disco. Abortar el arranque dejaria el servicio caido por una
// variable mal copiada, que es peor que guardar en un disco efimero: la
// aplicacion sigue funcionando y el problema queda visible en el log.
if (modo === 'cloudinary' && !credencialesCompletas) {
  // eslint-disable-next-line no-console
  console.warn(
    '[cloudinary] STORAGE_DRIVER=cloudinary pero faltan CLOUDINARY_CLOUD_NAME, ' +
      'CLOUDINARY_API_KEY o CLOUDINARY_API_SECRET. Se usara el disco local.'
  );
}

if (estaHabilitado) {
  cloudinary.config({
    cloud_name: cloudName,
    api_key: apiKey,
    api_secret: apiSecret,
    secure: true,
  });
}

/**
 * Sube un archivo desde el disco local a Cloudinary.
 *
 * Se usa `upload_stream` en lugar de `upload` porque el archivo ya esta en
 * disco (multer lo escribio para poder verificar la firma binaria) y no
 * queremos volver a leerlo entero en memoria de golpe.
 *
 * @param {string} rutaArchivo ruta absoluta del archivo temporal
 * @param {object} opciones
 * @param {string} opciones.carpeta carpeta destino dentro de Cloudinary
 * @param {string} [opciones.nombrePublico] public_id sin extension
 * @param {string} [opciones.mimeType] para decidir el resource_type
 * @returns {Promise<{publicId: string, url: string, resourceType: string}>}
 */
function subirArchivo(rutaArchivo, { carpeta: carpetaDestino, nombrePublico, mimeType } = {}) {
  if (!estaHabilitado) {
    throw new Error('Cloudinary no esta configurado: faltan las credenciales.');
  }

  return new Promise((resolve, reject) => {
    const opciones = {
      folder: carpetaDestino || carpeta,
      resource_type: 'auto',
      overwrite: false,
      // El nombre original se guarda en la base; aqui solo hace falta que
      // el public_id sea unico y no revelador.
      use_filename: false,
      unique_filename: true,
      ...(nombrePublico ? { public_id: nombrePublico } : {}),
    };

    const flujo = cloudinary.uploader.upload_stream(opciones, (error, resultado) => {
      if (error) {
        logger.error('Fallo la subida a Cloudinary', {
          mensaje: error.message,
          httpCode: error.http_code,
        });
        return reject(error);
      }

      return resolve({
        publicId: resultado.public_id,
        url: resultado.secure_url,
        resourceType: resultado.resource_type,
      });
    });

    // Se transmite el archivo en lugar de cargarlo completo en memoria.
    const fs = require('fs');
    fs.createReadStream(rutaArchivo).pipe(flujo);
  });
}

/**
 * Elimina un archivo de Cloudinary.
 *
 * No se conoce el resource_type con el que se subio (auto decide entre
 * image, video y raw), asi que se intenta en orden hasta acertar. Es mas
 * barato que guardar una columna extra solo para eso.
 *
 * @param {string} publicId
 * @returns {Promise<boolean>} true si se elimino algo
 */
async function eliminarArchivo(publicId) {
  if (!estaHabilitado || !publicId) return false;

  for (const resourceType of ['image', 'raw', 'video']) {
    try {
      const resultado = await cloudinary.uploader.destroy(publicId, {
        resource_type: resourceType,
        invalidate: true,
      });
      if (resultado.result === 'ok') return true;
    } catch (error) {
      // Se prueba el siguiente tipo; un fallo aqui no debe romper el borrado
      // del registro en la base de datos.
      logger.advertencia('Intento de borrado en Cloudinary fallido', {
        publicId,
        resourceType,
        mensaje: error.message,
      });
    }
  }

  return false;
}

/**
 * Indica si un valor guardado en `ruta_relativa` es una URL de Cloudinary.
 *
 * Es la unica senal que necesita el servicio de adjuntos para saber donde
 * vive el archivo: no hace falta una columna extra ni consultar el
 * proveedor para averiguarlo.
 *
 * @param {string} valor
 * @returns {boolean}
 */
function esUrlDeCloudinary(valor) {
  return typeof valor === 'string' && /^https?:\/\//i.test(valor);
}

module.exports = {
  estaHabilitado,
  subirArchivo,
  eliminarArchivo,
  esUrlDeCloudinary,
  carpeta,
  cliente: cloudinary,
};
