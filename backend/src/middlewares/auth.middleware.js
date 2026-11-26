'use strict';

/**
 * Middleware de autenticacion y autorizacion por roles.
 *
 * Inversion de dependencias: el middleware NO instancia el servicio de
 * usuarios. Recibe el `servicioUsuarios` ya construido por el contenedor de
 * composicion, de modo que aqui no hay acoplamiento a una implementacion
 * concreta ni a la base de datos.
 */

const jwt = require('jsonwebtoken');
const config = require('../config/env');
const AppError = require('../core/errors/AppError');
const { ROLES } = require('../config/constants');

/**
 * @param {{ buscarPorId: Function }} repositorioUsuarios
 */
function crearMiddlewareAutenticacion(repositorioUsuarios) {
  /**
   * Verifica el JWT del encabezado Authorization y adjunta el usuario a la
   * peticion. Se consulta la BD en cada peticion para detectar usuarios
   * desactivados o con rol cambiado (un token robado deja de servir).
   */
  async function autenticar(peticion, respuesta, siguiente) {
    try {
      const encabezado = peticion.headers.authorization || '';

      if (!encabezado.startsWith('Bearer ')) {
        throw AppError.noAutenticado('Falta el encabezado Authorization con el esquema Bearer.');
      }

      const token = encabezado.slice(7).trim();
      if (!token) throw AppError.noAutenticado('El token de acceso esta vacio.');

      let contenido;
      try {
        contenido = jwt.verify(token, config.jwt.secreto, {
          issuer: config.jwt.emisor,
        });
      } catch (errorJwt) {
        if (errorJwt.name === 'TokenExpiredError') {
          throw AppError.noAutenticado('El token de acceso ha expirado.');
        }
        throw AppError.noAutenticado('El token de acceso no es valido.');
      }

      const usuario = await repositorioUsuarios.buscarPorId(contenido.sub);

      if (!usuario) throw AppError.noAutenticado('El usuario del token ya no existe.');
      if (!usuario.activo) throw AppError.prohibido('La cuenta se encuentra desactivada.');

      peticion.usuario = {
        id: usuario.id,
        correo: usuario.correo,
        rol: usuario.rol,
        nombreCompleto: usuario.nombre_completo,
      };

      return siguiente();
    } catch (error) {
      return siguiente(error);
    }
  }

  /**
   * Restringe el acceso a los roles indicados.
   * @param {...string} rolesPermitidos
   */
  function autorizar(...rolesPermitidos) {
    return function middlewareAutorizacion(peticion, respuesta, siguiente) {
      if (!peticion.usuario) {
        return siguiente(AppError.noAutenticado());
      }
      if (!rolesPermitidos.includes(peticion.usuario.rol)) {
        return siguiente(
          AppError.prohibido(
            `Esta accion requiere uno de los siguientes roles: ${rolesPermitidos.join(', ')}.`
          )
        );
      }
      return siguiente();
    };
  }

  return { autenticar, autorizar };
}

module.exports = { crearMiddlewareAutenticacion, ROLES };
