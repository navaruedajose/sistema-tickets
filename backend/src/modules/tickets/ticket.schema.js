'use strict';

/**
 * Esquemas de validacion del modulo de tickets.
 *
 * Nota sobre seguridad: los campos de texto se limitan en longitud aqui
 * (primera linea de defensa). La segunda linea es la parametrizacion de
 * consultas en el repositorio, que hace imposible una inyeccion SQL aunque
 * el texto contenga comillas o sentencias completas.
 */

const { z } = require('zod');

const uuid = z.string().uuid('El identificador debe ser un UUID valido.');

const ESTADOS = ['NUEVO', 'ABIERTO', 'EN_PROGRESO', 'EN_ESPERA', 'RESUELTO', 'CERRADO', 'CANCELADO'];
const PRIORIDADES = ['BAJA', 'MEDIA', 'ALTA', 'CRITICA'];

const esquemaCrearTicket = z.object({
  titulo: z
    .string({ required_error: 'El titulo es obligatorio.' })
    .trim()
    .min(5, 'El titulo debe tener al menos 5 caracteres.')
    .max(200, 'El titulo no puede exceder 200 caracteres.'),

  descripcion: z
    .string({ required_error: 'La descripcion es obligatoria.' })
    .trim()
    .min(10, 'La descripcion debe tener al menos 10 caracteres.')
    .max(5000, 'La descripcion no puede exceder 5000 caracteres.'),

  categoriaId: uuid.optional().nullable(),

  prioridad: z.enum(PRIORIDADES, {
    errorMap: () => ({ message: `La prioridad debe ser una de: ${PRIORIDADES.join(', ')}.` }),
  }).optional(),

  // Solo un administrador puede crear un ticket a nombre de otra persona.
  solicitanteId: uuid.optional(),

  // Solo agentes/administradores pueden autoasignarse un ticket al crearlo.
  agenteId: uuid.optional().nullable(),
});

const esquemaActualizarTicket = z
  .object({
    titulo: z.string().trim().min(5).max(200).optional(),
    descripcion: z.string().trim().min(10).max(5000).optional(),
    categoriaId: uuid.nullable().optional(),
    prioridad: z.enum(PRIORIDADES).optional(),
  })
  .refine((datos) => Object.keys(datos).length > 0, {
    message: 'Debe indicar al menos un campo a actualizar.',
  });

const esquemaCambiarEstado = z.object({
  estado: z.enum(ESTADOS, {
    errorMap: () => ({ message: `El estado debe ser uno de: ${ESTADOS.join(', ')}.` }),
  }),
  solucion: z
    .string()
    .trim()
    .max(5000, 'La solucion no puede exceder 5000 caracteres.')
    .optional(),
  observacion: z.string().trim().max(500).optional(),
});

const esquemaAsignarAgente = z.object({
  agenteId: uuid.nullable(),
  observacion: z.string().trim().max(500).optional(),
});

const esquemaListarTickets = z.object({
  pagina: z.coerce.number().int().positive().optional(),
  limite: z.coerce.number().int().positive().max(100).optional(),
  estado: z.enum(ESTADOS).optional(),
  prioridad: z.enum(PRIORIDADES).optional(),
  categoriaId: uuid.optional(),
  agenteId: uuid.optional(),
  solicitanteId: uuid.optional(),
  busqueda: z.string().trim().max(200).optional(),
  // Filtros de fecha en formato ISO (YYYY-MM-DD).
  desde: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'La fecha "desde" debe tener el formato AAAA-MM-DD.').optional(),
  hasta: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'La fecha "hasta" debe tener el formato AAAA-MM-DD.').optional(),
  soloVencidos: z.enum(['true', 'false']).transform((valor) => valor === 'true').optional(),
  ordenarPor: z.enum(['creado_en', 'actualizado_en', 'prioridad', 'estado', 'fecha_limite_sla']).optional(),
  direccion: z.enum(['ASC', 'DESC', 'asc', 'desc']).optional(),
});

const esquemaIdParam = z.object({ id: uuid });

module.exports = {
  ESTADOS,
  PRIORIDADES,
  esquemaCrearTicket,
  esquemaActualizarTicket,
  esquemaCambiarEstado,
  esquemaAsignarAgente,
  esquemaListarTickets,
  esquemaIdParam,
};
