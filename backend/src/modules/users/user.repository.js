'use strict';

/**
 * Repositorio de usuarios.
 *
 * Toda la SQL de usuarios vive aqui. El servicio no escribe SQL; pide
 * "dame el usuario con este correo" y el repositorio decide como hacerlo.
 * Esa frontera es lo que permite cambiar de motor o agregar cache sin tocar
 * las reglas de negocio (principio de Inversion de Dependencias).
 */

const COLUMNAS_PUBLICAS = `
  id, nombre_completo, correo, telefono, rol, departamento,
  activo, ultimo_acceso, creado_en, actualizado_en
`;

class UserRepository {
  /**
   * @param {{ consultar: Function, conTransaccion: Function }} db
   */
  constructor(db) {
    this.db = db;
  }

  /** Inserta un usuario nuevo y devuelve su representacion publica. */
  async crear({ nombreCompleto, correo, contrasenaHash, telefono, departamento, rol }) {
    const { rows } = await this.db.consultar(
      `INSERT INTO usuarios
         (nombre_completo, correo, contrasena_hash, telefono, departamento, rol)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING ${COLUMNAS_PUBLICAS}`,
      [
        nombreCompleto,
        correo,
        contrasenaHash,
        telefono || null,
        departamento || null,
        rol || 'SOLICITANTE',
      ]
    );
    return rows[0];
  }

  /** Busca por id (sin exponer el hash de contrasena). */
  async buscarPorId(id) {
    const { rows } = await this.db.consultar(
      `SELECT ${COLUMNAS_PUBLICAS} FROM usuarios WHERE id = $1 LIMIT 1`,
      [id]
    );
    return rows[0] || null;
  }

  /** Busca por correo incluyendo el hash (solo para autenticacion). */
  async buscarPorCorreoConCredenciales(correo) {
    const { rows } = await this.db.consultar(
      `SELECT ${COLUMNAS_PUBLICAS}, contrasena_hash
         FROM usuarios WHERE correo = $1 LIMIT 1`,
      [correo]
    );
    return rows[0] || null;
  }

  /** ¿El correo ya esta registrado? Se usa antes de crear para dar un 409 claro. */
  async existeCorreo(correo) {
    const { rows } = await this.db.consultar(
      `SELECT 1 FROM usuarios WHERE correo = $1 LIMIT 1`,
      [correo]
    );
    return rows.length > 0;
  }

  /**
   * Listado paginado con filtros opcionales.
   * La columna de ordenamiento YA fue validada contra lista blanca en la
   * capa de utilidades, por eso es seguro interpolarla.
   */
  async listar({ desplazamiento, limite, rol, activo, busqueda, ordenarPor, direccion }) {
    const condiciones = [];
    const parametros = [];

    if (rol) {
      parametros.push(rol);
      condiciones.push(`rol = $${parametros.length}`);
    }
    if (typeof activo === 'boolean') {
      parametros.push(activo);
      condiciones.push(`activo = $${parametros.length}`);
    }
    if (busqueda) {
      parametros.push(`%${busqueda}%`);
      condiciones.push(
        `(nombre_completo ILIKE $${parametros.length} OR correo ILIKE $${parametros.length})`
      );
    }

    const clausulaWhere = condiciones.length ? `WHERE ${condiciones.join(' AND ')}` : '';

    const consultaTotal = await this.db.consultar(
      `SELECT COUNT(*)::INTEGER AS total FROM usuarios ${clausulaWhere}`,
      parametros
    );

    const consultaDatos = await this.db.consultar(
      `SELECT ${COLUMNAS_PUBLICAS}
         FROM usuarios
         ${clausulaWhere}
        ORDER BY ${ordenarPor} ${direccion}
        LIMIT $${parametros.length + 1} OFFSET $${parametros.length + 2}`,
      [...parametros, limite, desplazamiento]
    );

    return { elementos: consultaDatos.rows, total: consultaTotal.rows[0].total };
  }

  /** Actualiza campos permitidos. `undefined` = no tocar ese campo. */
  async actualizar(id, cambios) {
    const asignaciones = [];
    const parametros = [id];

    const mapa = {
      nombreCompleto: 'nombre_completo',
      telefono: 'telefono',
      departamento: 'departamento',
      rol: 'rol',
      activo: 'activo',
    };

    for (const [clave, columna] of Object.entries(mapa)) {
      if (cambios[clave] !== undefined) {
        parametros.push(cambios[clave]);
        asignaciones.push(`${columna} = $${parametros.length}`);
      }
    }

    if (asignaciones.length === 0) return this.buscarPorId(id);

    const { rows } = await this.db.consultar(
      `UPDATE usuarios SET ${asignaciones.join(', ')}
        WHERE id = $1
        RETURNING ${COLUMNAS_PUBLICAS}`,
      parametros
    );
    return rows[0] || null;
  }

  /** Cambia la contrasena (recibe el hash ya calculado por el servicio). */
  async actualizarContrasena(id, contrasenaHash) {
    await this.db.consultar(
      `UPDATE usuarios SET contrasena_hash = $2 WHERE id = $1`,
      [id, contrasenaHash]
    );
  }

  /** Marca la fecha del ultimo acceso exitoso. */
  async registrarUltimoAcceso(id) {
    await this.db.consultar(`UPDATE usuarios SET ultimo_acceso = NOW() WHERE id = $1`, [id]);
  }

  /**
   * Agentes disponibles para asignacion, ordenados por carga de trabajo.
   * Es la consulta que permite repartir tickets de forma equilibrada.
   */
  async listarAgentesConCarga() {
    const { rows } = await this.db.consultar(
      `SELECT u.id,
              u.nombre_completo,
              u.correo,
              COUNT(t.id) FILTER (
                WHERE t.estado IN ('NUEVO','ABIERTO','EN_PROGRESO','EN_ESPERA')
              )::INTEGER AS tickets_activos
         FROM usuarios u
         LEFT JOIN tickets t ON t.agente_id = u.id AND t.eliminado_en IS NULL
        WHERE u.rol IN ('AGENTE','ADMINISTRADOR') AND u.activo = TRUE
        GROUP BY u.id, u.nombre_completo, u.correo
        ORDER BY tickets_activos ASC, u.nombre_completo ASC`
    );
    return rows;
  }

  /** Elimina fisicamente. Solo para pruebas/administracion. */
  async eliminar(id) {
    const { rowCount } = await this.db.consultar(`DELETE FROM usuarios WHERE id = $1`, [id]);
    return rowCount > 0;
  }
}

module.exports = UserRepository;
