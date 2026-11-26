'use strict';

/**
 * Esquemas de validacion del modulo de autenticacion.
 * Se declaran aqui (no en el controlador) para respetar SRP: el
 * controlador orquesta, el esquema valida.
 */

const { z } = require('zod');

const esquemaRegistro = z.object({
  nombreCompleto: z
    .string({ required_error: 'El nombre completo es obligatorio.' })
    .trim()
    .min(3, 'El nombre completo debe tener al menos 3 caracteres.')
    .max(150, 'El nombre completo no puede exceder 150 caracteres.'),

  correo: z
    .string({ required_error: 'El correo electronico es obligatorio.' })
    .trim()
    .toLowerCase()
    .email('Debe proporcionar un correo electronico valido.')
    .max(180, 'El correo no puede exceder 180 caracteres.'),

  contrasena: z
    .string({ required_error: 'La contrasena es obligatoria.' })
    .min(8, 'La contrasena debe tener al menos 8 caracteres.')
    .max(72, 'La contrasena no puede exceder 72 caracteres (limite de bcrypt).')
    .regex(/[A-Z]/, 'La contrasena debe incluir al menos una letra mayuscula.')
    .regex(/[a-z]/, 'La contrasena debe incluir al menos una letra minuscula.')
    .regex(/[0-9]/, 'La contrasena debe incluir al menos un numero.'),

  telefono: z
    .string()
    .trim()
    .regex(/^[+]?[0-9\s()-]{7,25}$/, 'El telefono no tiene un formato valido.')
    .optional()
    .or(z.literal('')),

  departamento: z.string().trim().max(100).optional().or(z.literal('')),

  // El rol solo lo puede fijar un administrador; ver auth.service.js
  rol: z.enum(['SOLICITANTE', 'AGENTE', 'ADMINISTRADOR']).optional(),
});

const esquemaInicioSesion = z.object({
  correo: z
    .string({ required_error: 'El correo electronico es obligatorio.' })
    .trim()
    .toLowerCase()
    .email('Debe proporcionar un correo electronico valido.'),
  contrasena: z
    .string({ required_error: 'La contrasena es obligatoria.' })
    .min(1, 'La contrasena es obligatoria.'),
});

const esquemaRefresco = z.object({
  tokenRefresco: z
    .string({ required_error: 'El token de refresco es obligatorio.' })
    .min(10, 'El token de refresco no es valido.'),
});

const esquemaCambioContrasena = z.object({
  contrasenaActual: z.string({ required_error: 'La contrasena actual es obligatoria.' }).min(1),
  contrasenaNueva: z
    .string({ required_error: 'La nueva contrasena es obligatoria.' })
    .min(8, 'La nueva contrasena debe tener al menos 8 caracteres.')
    .max(72, 'La nueva contrasena no puede exceder 72 caracteres.')
    .regex(/[A-Z]/, 'La nueva contrasena debe incluir al menos una letra mayuscula.')
    .regex(/[a-z]/, 'La nueva contrasena debe incluir al menos una letra minuscula.')
    .regex(/[0-9]/, 'La nueva contrasena debe incluir al menos un numero.'),
});

module.exports = {
  esquemaRegistro,
  esquemaInicioSesion,
  esquemaRefresco,
  esquemaCambioContrasena,
};
