'use strict';

/**
 * Servicio de usuarios: reglas de negocio.
 *
 * Nota de diseno (Inversion de Dependencias): este modulo recibe sus
 * colaboradores por constructor. No hace `require` de la base de datos ni
 * del repositorio concreto, de modo que en las pruebas unitarias se le
 * puede inyectar un doble de prueba sin tocar una sola linea de produccion.
 */

const bcrypt = require('bcryptjs');
const AppError = require('../../core/errors/AppError');
const { ROLES } = require('../../config/constants');
const {
  normalizarPaginacion,
  validarOrdenamiento,
  validarDireccion,
  escaparComodines,
} = require('../../utils/pagination');

const RONDAS_BCRYPT = 12;
const COLUMNAS_ORDENABLES = ['nombre_completo', 'correo', 'rol', 'creado_en', 'ultimo_acceso'];

class UserService {
  /**
   * @param {import('./user.repository')} repositorioUsuarios
   */
  constructor(repositorioUsuarios) {
    this.repositorio = repositorioUsuarios;
  }

  /** Hash de contrasena centralizado: un solo lugar, una sola politica. */
  static async hashearContrasena(contrasena) {
    return bcrypt.hash(contrasena, RONDAS_BCRYPT);
  }

  static async verificarContrasena(contrasena, hash) {
    return bcrypt.compare(contrasena, hash);
  }

  /**
   * Crea un usuario.
   * @param {object} datos
   * @param {string} [rolSolicitante] Rol de quien ejecuta la accion; si no es
   *   administrador, se fuerza el rol SOLICITANTE (evita escalada de privilegios).
   */
  async crearUsuario(datos, rolSolicitante = null) {
    const correo = datos.correo.toLowerCase().trim();

    if (await this.repositorio.existeCorreo(correo)) {
      throw AppError.conflicto('Ya existe una cuenta registrada con ese correo electronico.');
    }

    const rolPermitido =
      rolSolicitante === ROLES.ADMINISTRADOR && datos.rol ? datos.rol : ROLES.SOLICITANTE;

    const contrasenaHash = await UserService.hashearContrasena(datos.contrasena);

    return this.repositorio.crear({
      nombreCompleto: datos.nombreCompleto.trim(),
      correo,
      contrasenaHash,
      telefono: datos.telefono,
      departamento: datos.departamento,
      rol: rolPermitido,
    });
  }

  /** Obtiene un usuario o lanza 404. */
  async obtenerUsuario(id) {
    const usuario = await this.repositorio.buscarPorId(id);
    if (!usuario) throw AppError.noEncontrado('El usuario');
    return usuario;
  }

  /** Listado paginado con saneamiento de parametros. */
  async listarUsuarios(consulta) {
    const { pagina, limite, desplazamiento } = normalizarPaginacion(consulta);

    const ordenarPor = validarOrdenamiento(
      consulta.ordenarPor,
      COLUMNAS_ORDENABLES,
      'creado_en'
    );
    const direccion = validarDireccion(consulta.direccion);

    const { elementos, total } = await this.repositorio.listar({
      desplazamiento,
      limite,
      rol: consulta.rol,
      activo: consulta.activo,
      busqueda: consulta.busqueda ? escaparComodines(consulta.busqueda) : null,
      ordenarPor,
      direccion,
    });

    return { elementos, paginacion: { pagina, limite, total } };
  }

  /**
   * Actualiza un usuario.
   * Regla: un usuario solo puede modificarse a si mismo; solo un
   * administrador puede cambiar el rol o desactivar a otros.
   */
  async actualizarUsuario(id, cambios, usuarioSolicitante) {
    const usuario = await this.obtenerUsuario(id);
    const esAdmin = usuarioSolicitante.rol === ROLES.ADMINISTRADOR;
    const esUnoMismo = usuarioSolicitante.id === id;

    if (!esAdmin && !esUnoMismo) {
      throw AppError.prohibido('Solo puede modificar su propio perfil.');
    }
    if (!esAdmin && (cambios.rol !== undefined || cambios.activo !== undefined)) {
      throw AppError.prohibido('Solo un administrador puede cambiar el rol o el estado de una cuenta.');
    }
    if (esAdmin && esUnoMismo && cambios.activo === false) {
      throw AppError.conflicto('No puede desactivar su propia cuenta de administrador.');
    }

    // Guarda contra el "ultimo administrador": el sistema nunca debe quedar
    // sin nadie capaz de gestionarlo.
    if (esAdmin && usuario.rol === ROLES.ADMINISTRADOR && cambios.rol && cambios.rol !== ROLES.ADMINISTRADOR) {
      const totalAdmins = await this.contarAdministradoresActivos();
      if (totalAdmins <= 1) {
        throw AppError.conflicto('No es posible degradar al ultimo administrador activo del sistema.');
      }
    }

    return this.repositorio.actualizar(id, cambios);
  }

  /** Cuenta administradores activos (guarda del sistema). */
  async contarAdministradoresActivos() {
    const { total } = await this.repositorio.listar({
      desplazamiento: 0,
      limite: 1,
      rol: ROLES.ADMINISTRADOR,
      activo: true,
      ordenarPor: 'creado_en',
      direccion: 'ASC',
    });
    return total;
  }

  /** Cambia la contrasena verificando la actual y revocando sesiones. */
  async cambiarContrasena(id, { contrasenaActual, contrasenaNueva }, repositorioTokens) {
    const usuario = await this.repositorio.buscarPorCorreoConCredenciales(
      (await this.obtenerUsuario(id)).correo
    );

    const coincide = await UserService.verificarContrasena(contrasenaActual, usuario.contrasena_hash);
    if (!coincide) {
      throw AppError.noAutenticado('La contrasena actual no es correcta.');
    }

    const nuevoHash = await UserService.hashearContrasena(contrasenaNueva);
    await this.repositorio.actualizarContrasena(id, nuevoHash);

    // Al cambiar la contrasena se cierran todas las sesiones activas:
    // si alguien habia robado el token, deja de servir inmediatamente.
    if (repositorioTokens) {
      await repositorioTokens.revocarTodosDelUsuario(id);
    }

    return true;
  }

  /** Agentes ordenados por carga (para el panel de asignacion). */
  async listarAgentesDisponibles() {
    return this.repositorio.listarAgentesConCarga();
  }

  /** Desactiva (borrado logico). */
  async desactivarUsuario(id, usuarioSolicitante) {
    return this.actualizarUsuario(id, { activo: false }, usuarioSolicitante);
  }
}

module.exports = UserService;
