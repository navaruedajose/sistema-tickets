'use strict';

/**
 * Repositorio de tokens de refresco.
 *
 * Responsabilidad unica: hablar con la tabla `tokens_refresco`.
 * No conoce reglas de negocio ni HTTP.
 */

const crypto = require('crypto');

/** Hash SHA-256 del token: en la BD nunca se guarda el token en claro. */
function hashearToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

class AuthRepository {
  /**
   * @param {{ consultar: Function, conTransaccion: Function }} db
   */
  constructor(db) {
    this.db = db;
  }

  /** Guarda un token de refresco ya hasheado. */
  async guardarTokenRefresco({ usuarioId, token, expiraEn }) {
    const { rows } = await this.db.consultar(
      `INSERT INTO tokens_refresco (usuario_id, token_hash, expira_en)
       VALUES ($1, $2, $3)
       RETURNING id, expira_en`,
      [usuarioId, hashearToken(token), expiraEn]
    );
    return rows[0];
  }

  /** Busca un token vigente (no revocado y no expirado). */
  async buscarTokenVigente(token) {
    const { rows } = await this.db.consultar(
      `SELECT id, usuario_id, expira_en
         FROM tokens_refresco
        WHERE token_hash = $1
          AND revocado = FALSE
          AND expira_en > NOW()
        LIMIT 1`,
      [hashearToken(token)]
    );
    return rows[0] || null;
  }

  /** Revoca un token concreto (logout de una sesion). */
  async revocarToken(token) {
    await this.db.consultar(
      `UPDATE tokens_refresco SET revocado = TRUE WHERE token_hash = $1`,
      [hashearToken(token)]
    );
  }

  /** Revoca todas las sesiones de un usuario (cambio de contrasena, incidente). */
  async revocarTodosDelUsuario(usuarioId) {
    const { rowCount } = await this.db.consultar(
      `UPDATE tokens_refresco SET revocado = TRUE
        WHERE usuario_id = $1 AND revocado = FALSE`,
      [usuarioId]
    );
    return rowCount;
  }

  /** Limpieza de tokens expirados; se puede invocar desde un cron. */
  async eliminarExpirados() {
    const { rowCount } = await this.db.consultar(
      `DELETE FROM tokens_refresco WHERE expira_en < NOW() OR revocado = TRUE`
    );
    return rowCount;
  }
}

module.exports = AuthRepository;
