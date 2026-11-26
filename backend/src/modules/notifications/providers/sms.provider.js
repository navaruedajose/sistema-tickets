'use strict';

/**
 * Proveedor de SMS (Twilio).
 *
 * Misma interfaz que EmailProvider (patron Strategy), de modo que el
 * servicio de notificaciones puede iterar sobre una lista de proveedores sin
 * saber cual es cual.
 *
 * Se usa `fetch` nativo de Node 22 en lugar del SDK de Twilio: menos
 * dependencias, menos superficie de ataque y suficiente para un envio simple.
 */

const config = require('../../../config/env');
const logger = require('../../../utils/logger');

class SmsProvider {
  constructor() {
    this.nombre = 'SMS';
    this.habilitado = Boolean(
      config.notificaciones.twilio.sid &&
        config.notificaciones.twilio.token &&
        config.notificaciones.twilio.origen
    );

    logger.info('Proveedor de SMS inicializado', {
      modo: this.habilitado ? 'twilio' : 'consola (sin credenciales configuradas)',
    });
  }

  /** Solo acepta numeros con formato telefonico razonable. */
  soporta(destinatario) {
    return typeof destinatario === 'string' && /^\+?[0-9]{8,15}$/.test(destinatario.replace(/[\s()-]/g, ''));
  }

  async enviar({ destinatario, asunto, mensaje }) {
    // Los SMS tienen limite de 160 caracteres por segmento: se recorta el
    // cuerpo para no fragmentar el mensaje ni multiplicar el costo.
    const cuerpo = `[Sistema de Tickets] ${mensaje}`.slice(0, 300);
    const numeroLimpio = destinatario.replace(/[\s()-]/g, '');

    if (!this.habilitado) {
      logger.info('[SMS SIMULADO] Envio de notificacion', {
        destinatario: numeroLimpio,
        asunto,
        vistaPrevia: cuerpo.slice(0, 160),
      });
      return { entregado: true, modo: 'consola', referencia: `simulado-${Date.now()}` };
    }

    const credenciales = Buffer.from(
      `${config.notificaciones.twilio.sid}:${config.notificaciones.twilio.token}`
    ).toString('base64');

    const parametros = new URLSearchParams({
      To: numeroLimpio,
      From: config.notificaciones.twilio.origen,
      Body: cuerpo,
    });

    const respuesta = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${config.notificaciones.twilio.sid}/Messages.json`,
      {
        method: 'POST',
        headers: {
          Authorization: `Basic ${credenciales}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: parametros.toString(),
        // Sin timeout, una API externa lenta colgaria el proceso.
        signal: AbortSignal.timeout(10_000),
      }
    );

    const datos = await respuesta.json().catch(() => ({}));

    if (!respuesta.ok) {
      throw new Error(`Twilio respondio ${respuesta.status}: ${datos.message || 'error desconocido'}`);
    }

    return { entregado: true, modo: 'twilio', referencia: datos.sid };
  }
}

module.exports = SmsProvider;
