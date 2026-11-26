'use strict';

/**
 * Crea (o restablece) una cuenta de administrador.
 *
 * Uso:
 *   node scripts/crear-admin.js "Nombre Completo" correo@dominio.com "Contrasena1"
 *   (sin argumentos usa los valores por defecto de desarrollo)
 *
 * Es el script de recuperacion: si el sistema queda sin administradores
 * accesibles, esta es la via para restablecer el acceso.
 */

const bcrypt = require('bcryptjs');
const db = require('../src/config/database');
const logger = require('../src/utils/logger');

const [, , nombreArgumento, correoArgumento, contrasenaArgumento] = process.argv;

const nombre = nombreArgumento || 'Administrador del Sistema';
const correo = (correoArgumento || 'admin@sistema-tickets.local').toLowerCase().trim();
const contrasena = contrasenaArgumento || 'Admin2026#Seguro';

async function crearAdministrador() {
  if (contrasena.length < 8) {
    throw new Error('La contrasena debe tener al menos 8 caracteres.');
  }

  const hash = await bcrypt.hash(contrasena, 12);

  const { rows } = await db.consultar(
    `INSERT INTO usuarios (nombre_completo, correo, contrasena_hash, rol, activo)
     VALUES ($1, $2, $3, 'ADMINISTRADOR', TRUE)
     ON CONFLICT (correo) DO UPDATE
       SET contrasena_hash = EXCLUDED.contrasena_hash,
           rol             = 'ADMINISTRADOR',
           activo          = TRUE
     RETURNING id, correo, rol, creado_en`,
    [nombre, correo, hash]
  );

  console.log('\n============================================================');
  console.log(' CUENTA DE ADMINISTRADOR LISTA');
  console.log('============================================================');
  console.log(` Correo:     ${rows[0].correo}`);
  console.log(` Contrasena: ${contrasena}`);
  console.log(` Rol:        ${rows[0].rol}`);
  console.log('============================================================');
  console.log(' Cambie esta contrasena despues del primer inicio de sesion.\n');

  logger.info('Cuenta de administrador asegurada', { correo: rows[0].correo });
  return rows[0];
}

crearAdministrador()
  .then(async () => {
    await db.cerrar();
    process.exit(0);
  })
  .catch(async (error) => {
    logger.error('No se pudo crear el administrador', { mensaje: error.message });
    await db.cerrar().catch(() => undefined);
    process.exit(1);
  });
