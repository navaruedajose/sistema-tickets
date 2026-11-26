'use strict';

/**
 * Servicio de autenticacion.
 *
 * Responsabilidad unica: emitir, refrescar y revocar credenciales.
 * No sabe nada de usuarios mas alla de lo que le ofrece el servicio de
 * usuarios (que recibe inyectado).
 */

const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const config = require('../../config/env');
const AppError = require('../../core/errors/AppError');
const UserService = require('../users/user.service');

class AuthService {
  /**
   * @param {import('../users/user.repository')} repositorioUsuarios
   * @param {import('./auth.repository')} repositorioTokens
   * @param {import('../notifications/notification.service')} [servicioNotificaciones]
   */
  constructor(repositorioUsuarios, repositorioTokens, servicioNotificaciones = null) {
    this.repositorioUsuarios = repositorioUsuarios;
    this.repositorioTokens = repositorioTokens;
    this.servicioNotificaciones = servicioNotificaciones;
  }

  /** Firma un access token de corta vida. */
  generarTokenAcceso(usuario) {
    return jwt.sign(
      { sub: usuario.id, correo: usuario.correo, rol: usuario.rol },
      config.jwt.secreto,
      { expiresIn: config.jwt.expiraEn, issuer: config.jwt.emisor }
    );
  }

  /** Genera un refresh token opaco (aleatorio) y lo persiste hasheado. */
  async generarTokenRefresco(usuario) {
    const token = crypto.randomBytes(48).toString('hex');
    const expiraEn = new Date(Date.now() + AuthService.#msDeExpiracion(config.jwt.refreshExpiraEn));

    await this.repositorioTokens.guardarTokenRefresco({
      usuarioId: usuario.id,
      token,
      expiraEn,
    });

    return token;
  }

  /** Convierte "7d" / "15m" / "3600" en milisegundos. */
  static #msDeExpiracion(valor) {
    const coincidencia = /^(\d+)\s*([smhd])?$/.exec(String(valor).trim());
    if (!coincidencia) return 7 * 24 * 60 * 60 * 1000;

    const cantidad = parseInt(coincidencia[1], 10);
    const unidad = coincidencia[2] || 's';
    const factores = { s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000 };
    return cantidad * factores[unidad];
  }

  /**
   * Inicia sesion.
   * Importante: se responde el MISMO mensaje cuando el correo no existe y
   * cuando la contrasena es incorrecta. Asi no se filtra que correos estan
   * registrados (enumeracion de usuarios).
   */
  async iniciarSesion({ correo, contrasena }) {
    const usuario = await this.repositorioUsuarios.buscarPorCorreoConCredenciales(correo);

    const credencialesInvalidas = AppError.noAutenticado('El correo o la contrasena son incorrectos.');

    if (!usuario) {
      // Consumimos tiempo de CPU de forma deliberada para que el atacante no
      // pueda distinguir "usuario inexistente" de "contrasena incorrecta"
      // midiendo el tiempo de respuesta.
      await UserService.verificarContrasena(contrasena, '$2a$12$invalidoinvalidoinvalidoinvalidoinvalidoinvalidoinvalidoinvalido');
      throw credencialesInvalidas;
    }

    if (!usuario.activo) {
      throw AppError.prohibido('Su cuenta esta desactivada. Contacte al administrador.');
    }

    const contrasenaValida = await UserService.verificarContrasena(contrasena, usuario.contrasena_hash);
    if (!contrasenaValida) throw credencialesInvalidas;

    await this.repositorioUsuarios.registrarUltimoAcceso(usuario.id);

    const tokenAcceso = this.generarTokenAcceso(usuario);
    const tokenRefresco = await this.generarTokenRefresco(usuario);

    delete usuario.contrasena_hash;

    return {
      usuario,
      tokenAcceso,
      tokenRefresco,
      tipoToken: 'Bearer',
      expiraEn: config.jwt.expiraEn,
    };
  }

  /** Registra una cuenta nueva y la deja autenticada. */
  async registrar(datos, rolSolicitante = null) {
    const servicioUsuarios = new UserService(this.repositorioUsuarios);
    const usuario = await servicioUsuarios.crearUsuario(datos, rolSolicitante);

    // Notificacion de bienvenida en segundo plano: no bloquea la respuesta.
    if (this.servicioNotificaciones) {
      this.servicioNotificaciones
        .notificarBienvenida(usuario)
        .catch(() => undefined);
    }

    const tokenAcceso = this.generarTokenAcceso(usuario);
    const tokenRefresco = await this.generarTokenRefresco(usuario);

    return { usuario, tokenAcceso, tokenRefresco, tipoToken: 'Bearer', expiraEn: config.jwt.expiraEn };
  }

  /**
   * Renueva el par de tokens.
   * Rotacion obligatoria: el refresh token usado se revoca y se emite uno
   * nuevo. Si un atacante reutiliza uno viejo, ya no funciona.
   */
  async refrescarToken(tokenRefresco) {
    const registro = await this.repositorioTokens.buscarTokenVigente(tokenRefresco);
    if (!registro) {
      throw AppError.noAutenticado('El token de refresco no es valido, ya fue usado o ha expirado.');
    }

    const usuario = await this.repositorioUsuarios.buscarPorId(registro.usuario_id);
    if (!usuario || !usuario.activo) {
      throw AppError.noAutenticado('La cuenta asociada al token ya no esta disponible.');
    }

    await this.repositorioTokens.revocarToken(tokenRefresco);

    const nuevoAcceso = this.generarTokenAcceso(usuario);
    const nuevoRefresco = await this.generarTokenRefresco(usuario);

    return {
      usuario,
      tokenAcceso: nuevoAcceso,
      tokenRefresco: nuevoRefresco,
      tipoToken: 'Bearer',
      expiraEn: config.jwt.expiraEn,
    };
  }

  /** Cierra la sesion actual revocando el refresh token. */
  async cerrarSesion(tokenRefresco) {
    if (tokenRefresco) {
      await this.repositorioTokens.revocarToken(tokenRefresco);
    }
    return true;
  }

  /** Cierra todas las sesiones del usuario (boton "cerrar sesion en todos los dispositivos"). */
  async cerrarTodasLasSesiones(usuarioId) {
    const revocados = await this.repositorioTokens.revocarTodosDelUsuario(usuarioId);
    return { sesionesCerradas: revocados };
  }

  /** Perfil del usuario autenticado. */
  async obtenerPerfil(usuarioId) {
    const usuario = await this.repositorioUsuarios.buscarPorId(usuarioId);
    if (!usuario) throw AppError.noEncontrado('El usuario');
    return usuario;
  }
}

module.exports = AuthService;
