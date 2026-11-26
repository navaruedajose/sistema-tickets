'use strict';

/**
 * Esquemas de validacion del modulo de usuarios.
 */

const { z } = require('zod');

const uuid = z.string().uuid('El identificador debe ser un UUID valido.');

const esquemaIdParam = z.object({ id: uuid });

const esquemaListarUsuarios = z.object({
  pagina: z.coerce.number().int().positive().optional(),
  limite: z.coerce.number().int().positive().max(100).optional(),
  rol: z.enum(['SOLICITANTE', 'AGENTE', 'ADMINISTRADOR']).optional(),
  activo: z
    .enum(['true', 'false'])
    .transform((valor) => valor === 'true')
    .optional(),
  busqueda: z.string().trim().max(120).optional(),
  ordenarPor: z.enum(['nombre_completo', 'correo', 'rol', 'creado_en', 'ultimo_acceso']).optional(),
  direccion: z.enum(['ASC', 'DESC', 'asc', 'desc']).optional(),
});

const esquemaActualizarUsuario = z
  .object({
    nombreCompleto: z.string().trim().min(3).max(150).optional(),
    telefono: z.string().trim().max(25).optional(),
    departamento: z.string().trim().max(100).optional(),
    rol: z.enum(['SOLICITANTE', 'AGENTE', 'ADMINISTRADOR']).optional(),
    activo: z.boolean().optional(),
  })
  .refine((datos) => Object.keys(datos).length > 0, {
    message: 'Debe indicar al menos un campo a actualizar.',
  });

module.exports = {
  esquemaIdParam,
  esquemaListarUsuarios,
  esquemaActualizarUsuario,
};
