-- =====================================================================
-- SISTEMA DE TICKETS - DATOS SEMILLA (catalogos)
-- Se ejecuta automaticamente la primera vez que se levanta el contenedor
-- de PostgreSQL (docker-entrypoint-initdb.d).
--
-- NOTA: los usuarios NO se crean aqui porque su contrasena debe ir
-- hasheada con bcrypt. Para eso existe el script:
--     docker compose exec backend npm run db:seed
-- =====================================================================

-- ---------------------------------------------------------------------
-- Categorias de soporte con sus tiempos de SLA
-- ---------------------------------------------------------------------
INSERT INTO categorias (nombre, descripcion, sla_horas) VALUES
    ('Hardware',        'Fallas fisicas: equipos, perifericos, impresoras.',      24),
    ('Software',        'Errores de aplicaciones instaladas o licenciamiento.',    48),
    ('Red e Internet',  'Conectividad, VPN, wifi y acceso a servicios remotos.',   8),
    ('Accesos y Cuentas','Altas, bajas y permisos de usuarios del sistema.',       16),
    ('Base de Datos',   'Incidencias sobre datos, respaldos y rendimiento SQL.',   12),
    ('Correo Electronico','Problemas con buzon, envio, recepcion y spam.',         12),
    ('Solicitud de Servicio','Requerimientos no incidentales (equipo nuevo, etc).',120)
ON CONFLICT (nombre) DO NOTHING;

-- ---------------------------------------------------------------------
-- Verificacion rapida del semillero
-- ---------------------------------------------------------------------
DO $$
DECLARE
    v_total INTEGER;
BEGIN
    SELECT COUNT(*) INTO v_total FROM categorias;
    RAISE NOTICE '[seed] Categorias cargadas: %', v_total;
END
$$;
