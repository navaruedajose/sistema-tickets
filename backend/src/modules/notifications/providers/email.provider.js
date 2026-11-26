'use strict';

/**
 * Proveedor de correo electronico.
 *
 * Patron Strategy: esta clase y `SmsProvider` implementan la misma interfaz
 * (`enviar({ destinatario, asunto, mensaje })`). El servicio de notificaciones
 * solo conoce esa interfaz, no si por detras hay SMTP, SendGrid o SES.
 *
 * Si no hay credenciales SMTP configuradas, el proveedor entra en "modo
 * consola": registra el mensaje en el log y lo marca como enviado. Esto es
 * intencional y muy util para la demostracion universitaria, donde no hay un
 * servidor de correo real disponible.
 */

const nodemailer = require('nodemailer');
const config = require('../../../config/env');
const logger = require('../../../utils/logger');

class EmailProvider {
  constructor() {
    this.nombre = 'EMAIL';
    this.transportador = null;
    this.modoConsola = true;

    if (config.notificaciones.smtp.host && config.notificaciones.smtp.usuario) {
      this.transportador = nodemailer.createTransport({
        host: config.notificaciones.smtp.host,
        port: config.notificaciones.smtp.puerto,
        secure: config.notificaciones.smtp.puerto === 465,
        auth: {
          user: config.notificaciones.smtp.usuario,
          pass: config.notificaciones.smtp.contrasena,
        },
        // Evita que una caida del servidor SMTP bloquee un worker.
        connectionTimeout: 10_000,
        greetingTimeout: 5_000,
      });
      this.modoConsola = false;
    }

    logger.info('Proveedor de correo inicializado', {
      modo: this.modoConsola ? 'consola (sin SMTP configurado)' : 'smtp',
    });
  }

  /** ¿Este proveedor puede entregar a este destinatario? */
  soporta(destinatario) {
    return typeof destinatario === 'string' && destinatario.includes('@');
  }

  /**
   * @param {{destinatario:string, asunto:string, mensaje:string}} mensaje
   */
  async enviar({ destinatario, asunto, mensaje }) {
    if (this.modoConsola) {
      logger.info('[CORREO SIMULADO] Envio de notificacion', {
        destinatario,
        asunto,
        vistaPrevia: mensaje.slice(0, 160),
      });
      return { entregado: true, modo: 'consola', referencia: `simulado-${Date.now()}` };
    }

    const informacion = await this.transportador.sendMail({
      from: config.notificaciones.remitente,
      to: destinatario,
      subject: asunto,
      text: mensaje,
      html: this.#construirHtml(asunto, mensaje),
    });

    return { entregado: true, modo: 'smtp', referencia: informacion.messageId };
  }

  /** Plantilla HTML sencilla y compatible con clientes de correo. */
  #construirHtml(asunto, mensaje) {
    const cuerpo = String(mensaje)
      .split('\n')
      .map((linea) => `<p style="margin:0 0 10px 0;">${escaparHtml(linea)}</p>`)
      .join('');

    return `<!DOCTYPE html>
<html lang="es">
  <body style="margin:0;padding:24px;background:#f4f6f8;font-family:Arial,Helvetica,sans-serif;color:#1f2937;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;margin:0 auto;background:#ffffff;border-radius:8px;overflow:hidden;border:1px solid #e5e7eb;">
      <tr>
        <td style="background:#1d4ed8;padding:20px 24px;color:#ffffff;">
          <h1 style="margin:0;font-size:18px;">Sistema de Tickets</h1>
          <p style="margin:4px 0 0 0;font-size:13px;opacity:.9;">${escaparHtml(asunto)}</p>
        </td>
      </tr>
      <tr>
        <td style="padding:24px;font-size:14px;line-height:1.6;">
          ${cuerpo}
        </td>
      </tr>
      <tr>
        <td style="padding:16px 24px;background:#f9fafb;color:#6b7280;font-size:12px;border-top:1px solid #e5e7eb;">
          Este es un mensaje automatico. Por favor no responda a este correo.
        </td>
      </tr>
    </table>
  </body>
</html>`;
  }
}

/** Escapa HTML: evita inyeccion de marcado con datos escritos por el usuario. */
function escaparHtml(texto) {
  return String(texto)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

module.exports = EmailProvider;
module.exports.escaparHtml = escaparHtml;
