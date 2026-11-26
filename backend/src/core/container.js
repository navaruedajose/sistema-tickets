'use strict';

/**
 * CONTENEDOR DE COMPOSICION (Composition Root)
 * ============================================
 *
 * Este es el UNICO archivo del proyecto que conoce todas las piezas y sabe
 * como se conectan entre si. Es la materializacion practica del principio de
 * Inversion de Dependencias:
 *
 *   - Los repositorios dependen de una abstraccion de acceso a datos.
 *   - Los servicios dependen de interfaces de repositorio, no de SQL.
 *   - Los controladores dependen de interfaces de servicio.
 *   - Nadie instancia a nadie mas: todo se cablea aqui.
 *
 * Beneficio concreto para la sustentacion: para escribir una prueba unitaria
 * del servicio de tickets basta con llamar a `construirContenedor({ db: dobleDePrueba })`
 * y pasar un objeto falso. No hay que levantar PostgreSQL ni tocar el codigo
 * de produccion.
 *
 * El contenedor se construye una sola vez al arrancar el proceso y se
 * reutiliza en todas las peticiones (los servicios no guardan estado por
 * peticion, por lo que son seguros de compartir).
 */

const dbReal = require('../config/database');
const config = require('../config/env');
const logger = require('../utils/logger');
const { ROLES } = require('../config/constants');

// --- Repositorios ---
const UserRepository = require('../modules/users/user.repository');
const AuthRepository = require('../modules/auth/auth.repository');
const CategoryRepository = require('../modules/categories/category.repository');
const TicketRepository = require('../modules/tickets/ticket.repository');
const CommentRepository = require('../modules/comments/comment.repository');
const AttachmentRepository = require('../modules/attachments/attachment.repository');
const ReportRepository = require('../modules/reports/report.repository');
const NotificationRepository = require('../modules/notifications/notification.repository');

// --- Proveedores externos (patron Strategy) ---
const EmailProvider = require('../modules/notifications/providers/email.provider');
const SmsProvider = require('../modules/notifications/providers/sms.provider');

// --- Servicios ---
const NotificationService = require('../modules/notifications/notification.service');
const UserService = require('../modules/users/user.service');
const AuthService = require('../modules/auth/auth.service');
const CategoryService = require('../modules/categories/category.service');
const TicketService = require('../modules/tickets/ticket.service');
const CommentService = require('../modules/comments/comment.service');
const AttachmentService = require('../modules/attachments/attachment.service');
const ReportService = require('../modules/reports/report.service');

// --- Controladores ---
const AuthController = require('../modules/auth/auth.controller');
const UserController = require('../modules/users/user.controller');
const CategoryController = require('../modules/categories/category.controller');
const TicketController = require('../modules/tickets/ticket.controller');
const CommentController = require('../modules/comments/comment.controller');
const AttachmentController = require('../modules/attachments/attachment.controller');
const ReportController = require('../modules/reports/report.controller');

// --- Middlewares ---
const { crearMiddlewareAutenticacion } = require('../middlewares/auth.middleware');

// --- Rutas ---
const crearRutasAutenticacion = require('../modules/auth/auth.routes');
const crearRutasUsuarios = require('../modules/users/user.routes');
const crearRutasCategorias = require('../modules/categories/category.routes');
const crearRutasTickets = require('../modules/tickets/ticket.routes');
const crearRutasComentarios = require('../modules/comments/comment.routes');
const crearRutasAdjuntos = require('../modules/attachments/attachment.routes');
const crearRutasReportes = require('../modules/reports/report.routes');
const crearRutasNotificaciones = require('../modules/notifications/notification.routes');

/**
 * Construye el grafo de dependencias completo.
 *
 * @param {object} [opciones]
 * @param {object} [opciones.db] Sustituto del acceso a datos (pruebas).
 * @param {Array}  [opciones.proveedoresNotificacion] Sustituto de los
 *   proveedores de correo/SMS (pruebas).
 * @returns {object} Contenedor con todos los servicios y routers listos.
 */
function construirContenedor({ db = dbReal, proveedoresNotificacion = null } = {}) {
  const inicio = Date.now();

  // -----------------------------------------------------------------
  // 1. Roles por perfil (se calculan una sola vez)
  // -----------------------------------------------------------------
  const roles = {
    todos: Object.values(ROLES),
    solicitantes: [ROLES.SOLICITANTE],
    gestores: [ROLES.AGENTE, ROLES.ADMINISTRADOR],
    administradores: [ROLES.ADMINISTRADOR],
  };

  // -----------------------------------------------------------------
  // 2. Repositorios (capa de persistencia)
  // -----------------------------------------------------------------
  const repositorios = {
    usuarios: new UserRepository(db),
    tokens: new AuthRepository(db),
    categorias: new CategoryRepository(db),
    tickets: new TicketRepository(db),
    comentarios: new CommentRepository(db),
    adjuntos: new AttachmentRepository(db),
    reportes: new ReportRepository(db),
    notificaciones: new NotificationRepository(db),
  };

  // -----------------------------------------------------------------
  // 3. Proveedores externos
  //    En pruebas se inyectan dobles que no salen a la red.
  // -----------------------------------------------------------------
  const proveedores = proveedoresNotificacion || [new EmailProvider(), new SmsProvider()];

  // -----------------------------------------------------------------
  // 4. Servicios (capa de reglas de negocio)
  //    Se respeta el orden de dependencias: primero los que no dependen
  //    de otros servicios.
  // -----------------------------------------------------------------
  const servicioNotificaciones = new NotificationService({
    repositorioNotificaciones: repositorios.notificaciones,
    proveedores,
  });

  const servicioUsuarios = new UserService(repositorios.usuarios);

  const servicioAutenticacion = new AuthService(
    repositorios.usuarios,
    repositorios.tokens,
    servicioNotificaciones
  );

  const servicioCategorias = new CategoryService(repositorios.categorias);

  const servicioTickets = new TicketService({
    repositorioTickets: repositorios.tickets,
    repositorioUsuarios: repositorios.usuarios,
    repositorioCategorias: repositorios.categorias,
    servicioNotificaciones,
  });

  const servicioComentarios = new CommentService({
    repositorioComentarios: repositorios.comentarios,
    servicioTickets,
    servicioNotificaciones,
  });

  const servicioAdjuntos = new AttachmentService({
    repositorioAdjuntos: repositorios.adjuntos,
    servicioTickets,
  });

  const servicioReportes = new ReportService({
    repositorioReportes: repositorios.reportes,
  });

  const servicios = {
    notificaciones: servicioNotificaciones,
    usuarios: servicioUsuarios,
    autenticacion: servicioAutenticacion,
    categorias: servicioCategorias,
    tickets: servicioTickets,
    comentarios: servicioComentarios,
    adjuntos: servicioAdjuntos,
    reportes: servicioReportes,
  };

  // -----------------------------------------------------------------
  // 5. Controladores (capa HTTP)
  // -----------------------------------------------------------------
  const controladores = {
    autenticacion: new AuthController(servicioAutenticacion),
    usuarios: new UserController(servicioUsuarios, repositorios.tokens),
    categorias: new CategoryController(servicioCategorias),
    tickets: new TicketController(servicioTickets),
    comentarios: new CommentController(servicioComentarios),
    adjuntos: new AttachmentController(servicioAdjuntos),
    reportes: new ReportController(servicioReportes),
  };

  // -----------------------------------------------------------------
  // 6. Middleware de autenticacion
  //    Recibe el repositorio, no la base de datos.
  // -----------------------------------------------------------------
  const autenticacion = crearMiddlewareAutenticacion(repositorios.usuarios);

  // -----------------------------------------------------------------
  // 7. Routers
  //    Los routers anidados (comentarios, adjuntos) se construyen primero
  //    porque el router de tickets los monta como subrutas.
  // -----------------------------------------------------------------
  const rutasComentarios = crearRutasComentarios({
    controlador: controladores.comentarios,
    autenticacion,
  });

  const rutasAdjuntos = crearRutasAdjuntos({
    controlador: controladores.adjuntos,
    autenticacion,
  });

  const rutas = {
    autenticacion: crearRutasAutenticacion({
      controlador: controladores.autenticacion,
      autenticacion,
      rolesAdmin: roles.administradores,
    }),

    usuarios: crearRutasUsuarios({
      controlador: controladores.usuarios,
      autenticacion,
      rolesAdmin: roles.administradores,
    }),

    categorias: crearRutasCategorias({
      controlador: controladores.categorias,
      autenticacion,
      rolesAdmin: roles.administradores,
    }),

    tickets: crearRutasTickets({
      controlador: controladores.tickets,
      autenticacion,
      rolesGestores: roles.gestores,
      rolesAdmin: roles.administradores,
      rutasComentarios,
      rutasAdjuntos,
    }),

    reportes: crearRutasReportes({
      controlador: controladores.reportes,
      autenticacion,
      rolesGestores: roles.gestores,
    }),

    notificaciones: crearRutasNotificaciones({
      servicioNotificaciones,
      repositorioNotificaciones: repositorios.notificaciones,
      autenticacion,
      rolesGestores: roles.gestores,
      rolesAdmin: roles.administradores,
    }),
  };

  logger.info('Contenedor de dependencias construido', {
    milisegundos: Date.now() - inicio,
    proveedoresNotificacion: proveedores.map((proveedor) => proveedor.nombre).join(','),
  });

  return {
    config,
    roles,
    db,
    repositorios,
    servicios,
    controladores,
    autenticacion,
    rutas,
  };
}

module.exports = { construirContenedor };
