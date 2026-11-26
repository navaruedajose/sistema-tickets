'use strict';

/**
 * Punto de entrada del proceso.
 *
 * Responsabilidades:
 *  1. Construir el contenedor de dependencias y la aplicacion Express.
 *  2. Verificar la conectividad con PostgreSQL antes de aceptar trafico
 *     (fallar rapido es mejor que arrancar y devolver 500 en cada peticion).
 *  3. Apagar el proceso de forma ordenada ante SIGTERM/SIGINT, para no cortar
 *     peticiones en curso ni dejar conexiones abiertas (importante en Docker
 *     y en plataformas como Render o Railway).
 */

const config = require('./config/env');
const logger = require('./utils/logger');
const db = require('./config/database');
const { construirContenedor } = require('./core/container');
const crearRouterPrincipal = require('./routes/index');
const crearAplicacion = require('./app');

async function iniciar() {
  logger.info('Iniciando API del Sistema de Tickets', {
    entorno: config.entorno,
    puerto: config.servidor.puerto,
    node: process.version,
  });

  // --- 1. Verificar la base de datos (con reintentos) ---
  const maximoIntentos = 10;
  let conexionEstablecida = false;

  for (let intento = 1; intento <= maximoIntentos; intento += 1) {
    try {
      const info = await db.verificarConexion();
      logger.info('Conexion a PostgreSQL establecida', {
        baseDeDatos: info.bd,
        host: config.baseDatos.host,
        puerto: config.baseDatos.puerto,
      });
      conexionEstablecida = true;
      break;
    } catch (error) {
      logger.advertencia(`Intento ${intento}/${maximoIntentos} de conexion a PostgreSQL fallido`, {
        error: error.message,
      });
      if (intento === maximoIntentos) {
        logger.error('No fue posible conectar con PostgreSQL. Abortando el arranque.');
        throw error;
      }
      // Espera progresiva: 1s, 2s, 3s... Da tiempo a que el contenedor de
      // la base de datos termine de inicializarse.
      await new Promise((resolver) => setTimeout(resolver, intento * 1000));
    }
  }

  if (!conexionEstablecida) {
    process.exit(1);
  }

  // --- 2. Construir el grafo de dependencias ---
  const contenedor = construirContenedor();
  contenedor.rutas.principal = crearRouterPrincipal(contenedor);

  const app = crearAplicacion(contenedor);

  // --- 3. Limpieza de reportes temporales de ejecuciones anteriores ---
  contenedor.servicios.reportes
    .limpiarReportesAntiguos(24)
    .catch((error) => logger.advertencia('No se pudo limpiar los reportes antiguos', { error: error.message }));

  // --- 4. Levantar el servidor ---
  const servidor = app.listen(config.servidor.puerto, config.servidor.host, () => {
    logger.info('Servidor escuchando', {
      url: `http://localhost:${config.servidor.puerto}`,
      salud: `http://localhost:${config.servidor.puerto}/api/v1/salud`,
      indice: `http://localhost:${config.servidor.puerto}/api/v1`,
    });
  });

  // Timeouts defensivos: una conexion lenta no debe quedarse colgada
  // consumiendo un worker indefinidamente.
  servidor.keepAliveTimeout = 65_000;
  servidor.headersTimeout = 66_000;

  // --- 5. Apagado ordenado ---
  let apagando = false;

  async function apagar(senal) {
    if (apagando) return;
    apagando = true;

    logger.info(`Senal ${senal} recibida. Iniciando apagado ordenado...`);

    // Se deja de aceptar conexiones nuevas y se espera a terminar las actuales.
    servidor.close(async () => {
      try {
        await db.cerrar();
        logger.info('Recursos liberados. Proceso finalizado correctamente.');
        process.exit(0);
      } catch (error) {
        logger.error('Error durante el apagado', { error: error.message });
        process.exit(1);
      }
    });

    // Red de seguridad: si algo se atasca, forzamos la salida.
    setTimeout(() => {
      logger.error('El apagado excedio el tiempo limite. Forzando salida.');
      process.exit(1);
    }, 15_000).unref();
  }

  process.on('SIGTERM', () => apagar('SIGTERM'));
  process.on('SIGINT', () => apagar('SIGINT'));

  // --- 6. Ultima red de seguridad del proceso ---
  process.on('unhandledRejection', (motivo) => {
    logger.error('Promesa rechazada sin manejar', {
      motivo: motivo instanceof Error ? motivo.message : String(motivo),
      pila: motivo instanceof Error ? motivo.stack : undefined,
    });
  });

  process.on('uncaughtException', (error) => {
    logger.error('Excepcion no capturada. El proceso se reiniciara.', {
      mensaje: error.message,
      pila: error.stack,
    });
    // Ante una excepcion no capturada el estado del proceso ya no es confiable.
    apagar('uncaughtException');
  });

  return { app, servidor, contenedor };
}

// Solo se ejecuta si este archivo es el punto de entrada; al importarlo desde
// una prueba no se levanta ningun puerto.
if (require.main === module) {
  iniciar().catch((error) => {
    logger.error('Fallo critico durante el arranque', {
      mensaje: error.message,
      pila: error.stack,
    });
    process.exit(1);
  });
}

module.exports = { iniciar };
