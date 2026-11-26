-- =====================================================================
-- SISTEMA DE TICKETS - ESQUEMA DE BASE DE DATOS
-- Motor: PostgreSQL 16
-- Autor: Equipo de Desarrollo
-- Descripcion: Definicion completa del modelo relacional del helpdesk.
--              Incluye tipos enumerados, tablas, indices, triggers de
--              auditoria y vistas materializadas para reporteria.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 0. Extensiones requeridas
-- ---------------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS "pgcrypto";   -- gen_random_uuid() y digest()
CREATE EXTENSION IF NOT EXISTS "unaccent";   -- busquedas de texto sin acentos

-- ---------------------------------------------------------------------
-- 1. Tipos enumerados (dominios controlados)
--    Se usan ENUM nativos porque el conjunto de valores es cerrado y
--    estable, lo que aporta validacion a nivel de motor (KISS).
-- ---------------------------------------------------------------------
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'rol_usuario') THEN
        CREATE TYPE rol_usuario AS ENUM ('SOLICITANTE', 'AGENTE', 'ADMINISTRADOR');
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'estado_ticket') THEN
        CREATE TYPE estado_ticket AS ENUM (
            'NUEVO', 'ABIERTO', 'EN_PROGRESO', 'EN_ESPERA',
            'RESUELTO', 'CERRADO', 'CANCELADO'
        );
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'prioridad_ticket') THEN
        CREATE TYPE prioridad_ticket AS ENUM ('BAJA', 'MEDIA', 'ALTA', 'CRITICA');
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'canal_notificacion') THEN
        CREATE TYPE canal_notificacion AS ENUM ('EMAIL', 'SMS');
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'estado_notificacion') THEN
        CREATE TYPE estado_notificacion AS ENUM ('PENDIENTE', 'ENVIADO', 'FALLIDO');
    END IF;
END
$$;

-- ---------------------------------------------------------------------
-- 2. Funcion generica de auditoria: actualiza la columna actualizado_en
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_set_actualizado_en()
RETURNS TRIGGER AS $$
BEGIN
    NEW.actualizado_en := NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ---------------------------------------------------------------------
-- 3. TABLA: usuarios
--    Almacena a los tres perfiles del sistema: solicitantes, agentes y
--    administradores. La contrasena NUNCA se guarda en texto plano.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS usuarios (
    id                  UUID            PRIMARY KEY DEFAULT gen_random_uuid(),
    nombre_completo     VARCHAR(150)    NOT NULL,
    correo              VARCHAR(180)    NOT NULL,
    contrasena_hash     VARCHAR(255)    NOT NULL,
    telefono            VARCHAR(25),
    rol                 rol_usuario     NOT NULL DEFAULT 'SOLICITANTE',
    departamento        VARCHAR(100),
    activo              BOOLEAN         NOT NULL DEFAULT TRUE,
    ultimo_acceso       TIMESTAMPTZ,
    creado_en           TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    actualizado_en      TIMESTAMPTZ     NOT NULL DEFAULT NOW(),

    CONSTRAINT uq_usuarios_correo UNIQUE (correo),
    CONSTRAINT ck_usuarios_correo_formato CHECK (correo ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
    CONSTRAINT ck_usuarios_nombre_no_vacio CHECK (length(btrim(nombre_completo)) > 0)
);

COMMENT ON TABLE  usuarios IS 'Usuarios del helpdesk: solicitantes, agentes y administradores.';
COMMENT ON COLUMN usuarios.contrasena_hash IS 'Hash bcrypt (12 rondas). Nunca almacenar texto plano.';

CREATE INDEX IF NOT EXISTS idx_usuarios_rol    ON usuarios (rol);
CREATE INDEX IF NOT EXISTS idx_usuarios_activo ON usuarios (activo) WHERE activo = TRUE;

-- ---------------------------------------------------------------------
-- 4. TABLA: categorias
--    Clasificacion de tickets. Cada categoria define su propio SLA
--    (Acuerdo de Nivel de Servicio) en horas.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS categorias (
    id              UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    nombre          VARCHAR(80)  NOT NULL,
    descripcion     VARCHAR(255),
    sla_horas       INTEGER      NOT NULL DEFAULT 48,
    activo          BOOLEAN      NOT NULL DEFAULT TRUE,
    creado_en       TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    actualizado_en  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),

    CONSTRAINT uq_categorias_nombre UNIQUE (nombre),
    CONSTRAINT ck_categorias_sla_positivo CHECK (sla_horas > 0 AND sla_horas <= 720)
);

COMMENT ON COLUMN categorias.sla_horas IS 'Horas maximas comprometidas para resolver un ticket de esta categoria.';

CREATE TRIGGER trg_categorias_actualizado
    BEFORE UPDATE ON categorias
    FOR EACH ROW EXECUTE FUNCTION fn_set_actualizado_en();

-- ---------------------------------------------------------------------
-- 5. TABLA: tickets
--    Entidad central del sistema. Usa borrado logico (eliminado_en)
--    para no perder trazabilidad historica.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS tickets (
    id                  UUID              PRIMARY KEY DEFAULT gen_random_uuid(),
    codigo              VARCHAR(20)       NOT NULL,
    titulo              VARCHAR(200)      NOT NULL,
    descripcion         TEXT              NOT NULL,
    estado              estado_ticket     NOT NULL DEFAULT 'NUEVO',
    prioridad           prioridad_ticket  NOT NULL DEFAULT 'MEDIA',
    categoria_id        UUID              REFERENCES categorias (id) ON DELETE SET NULL,
    solicitante_id      UUID              NOT NULL REFERENCES usuarios (id) ON DELETE RESTRICT,
    agente_id           UUID              REFERENCES usuarios (id) ON DELETE SET NULL,
    solucion            TEXT,
    fecha_limite_sla    TIMESTAMPTZ,
    fecha_resolucion    TIMESTAMPTZ,
    fecha_cierre        TIMESTAMPTZ,
    eliminado_en        TIMESTAMPTZ,
    creado_en           TIMESTAMPTZ       NOT NULL DEFAULT NOW(),
    actualizado_en      TIMESTAMPTZ       NOT NULL DEFAULT NOW(),

    CONSTRAINT uq_tickets_codigo UNIQUE (codigo),
    CONSTRAINT ck_tickets_titulo_no_vacio CHECK (length(btrim(titulo)) >= 5),
    CONSTRAINT ck_tickets_descripcion_no_vacia CHECK (length(btrim(descripcion)) >= 10),
    CONSTRAINT ck_tickets_resuelto_tiene_fecha CHECK (
        estado NOT IN ('RESUELTO', 'CERRADO') OR fecha_resolucion IS NOT NULL
    ),
    CONSTRAINT ck_tickets_cerrado_tiene_fecha CHECK (
        estado <> 'CERRADO' OR fecha_cierre IS NOT NULL
    )
);

COMMENT ON TABLE  tickets IS 'Tickets de soporte. Nucleo funcional del sistema.';
COMMENT ON COLUMN tickets.codigo IS 'Folio legible generado por trigger. Formato: TK-AAAA-000000.';
COMMENT ON COLUMN tickets.eliminado_en IS 'Borrado logico: NULL = vigente, con valor = eliminado.';

CREATE INDEX IF NOT EXISTS idx_tickets_estado        ON tickets (estado);
CREATE INDEX IF NOT EXISTS idx_tickets_prioridad     ON tickets (prioridad);
CREATE INDEX IF NOT EXISTS idx_tickets_solicitante   ON tickets (solicitante_id);
CREATE INDEX IF NOT EXISTS idx_tickets_agente        ON tickets (agente_id);
CREATE INDEX IF NOT EXISTS idx_tickets_creado_en     ON tickets (creado_en DESC);
CREATE INDEX IF NOT EXISTS idx_tickets_vigentes      ON tickets (estado, creado_en DESC) WHERE eliminado_en IS NULL;
CREATE INDEX IF NOT EXISTS idx_tickets_busqueda      ON tickets USING GIN (
    to_tsvector('spanish', titulo || ' ' || descripcion)
);

CREATE TRIGGER trg_tickets_actualizado
    BEFORE UPDATE ON tickets
    FOR EACH ROW EXECUTE FUNCTION fn_set_actualizado_en();

-- ---------------------------------------------------------------------
-- 6. Generacion automatica del folio del ticket (TK-AAAA-000000)
-- ---------------------------------------------------------------------
CREATE SEQUENCE IF NOT EXISTS seq_ticket_codigo START 1;

CREATE OR REPLACE FUNCTION fn_generar_codigo_ticket()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.codigo IS NULL OR NEW.codigo = '' THEN
        NEW.codigo := 'TK-' || TO_CHAR(NOW(), 'YYYY') || '-' ||
                      LPAD(NEXTVAL('seq_ticket_codigo')::TEXT, 6, '0');
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_tickets_codigo
    BEFORE INSERT ON tickets
    FOR EACH ROW EXECUTE FUNCTION fn_generar_codigo_ticket();

-- ---------------------------------------------------------------------
-- 7. Calculo automatico del SLA segun la categoria del ticket
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_calcular_sla_ticket()
RETURNS TRIGGER AS $$
DECLARE
    v_sla_horas INTEGER;
BEGIN
    -- Se calcula el SLA SIEMPRE que venga vacio, tenga o no categoria.
    -- Si el ticket no tiene categoria se aplica el valor por defecto (48 h):
    -- asi ningun ticket queda sin fecha limite y fuera del control de SLA
    -- (de lo contrario nunca apareceria como vencido en los indicadores).
    IF NEW.fecha_limite_sla IS NULL THEN
        IF NEW.categoria_id IS NOT NULL THEN
            SELECT sla_horas INTO v_sla_horas FROM categorias WHERE id = NEW.categoria_id;
        END IF;

        NEW.fecha_limite_sla := NEW.creado_en + (COALESCE(v_sla_horas, 48) || ' hours')::INTERVAL;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_tickets_sla
    BEFORE INSERT ON tickets
    FOR EACH ROW EXECUTE FUNCTION fn_calcular_sla_ticket();

-- ---------------------------------------------------------------------
-- 8. TABLA: comentarios
--    Conversacion del ticket. es_interno permite notas privadas entre
--    agentes que el solicitante no debe ver.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS comentarios (
    id              UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    ticket_id       UUID         NOT NULL REFERENCES tickets (id) ON DELETE CASCADE,
    autor_id        UUID         NOT NULL REFERENCES usuarios (id) ON DELETE RESTRICT,
    contenido       TEXT         NOT NULL,
    es_interno      BOOLEAN      NOT NULL DEFAULT FALSE,
    creado_en       TIMESTAMPTZ  NOT NULL DEFAULT NOW(),

    CONSTRAINT ck_comentarios_contenido_no_vacio CHECK (length(btrim(contenido)) > 0)
);

CREATE INDEX IF NOT EXISTS idx_comentarios_ticket ON comentarios (ticket_id, creado_en);

-- ---------------------------------------------------------------------
-- 9. TABLA: adjuntos
--    Evidencia cargada por los usuarios (capturas, PDF, logs).
--    Se guarda el hash SHA-256 para deduplicacion e integridad.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS adjuntos (
    id                  UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    ticket_id           UUID         NOT NULL REFERENCES tickets (id) ON DELETE CASCADE,
    comentario_id       UUID         REFERENCES comentarios (id) ON DELETE CASCADE,
    nombre_original     VARCHAR(255) NOT NULL,
    nombre_almacenado   VARCHAR(255) NOT NULL,
    ruta_relativa       VARCHAR(500) NOT NULL,
    mime_type           VARCHAR(120) NOT NULL,
    tamano_bytes        BIGINT       NOT NULL,
    hash_sha256         VARCHAR(64)  NOT NULL,
    subido_por          UUID         NOT NULL REFERENCES usuarios (id) ON DELETE RESTRICT,
    creado_en           TIMESTAMPTZ  NOT NULL DEFAULT NOW(),

    CONSTRAINT uq_adjuntos_nombre_almacenado UNIQUE (nombre_almacenado),
    CONSTRAINT ck_adjuntos_tamano_positivo CHECK (tamano_bytes > 0)
);

CREATE INDEX IF NOT EXISTS idx_adjuntos_ticket ON adjuntos (ticket_id);
CREATE INDEX IF NOT EXISTS idx_adjuntos_hash   ON adjuntos (hash_sha256);

-- ---------------------------------------------------------------------
-- 10. TABLA: historial_tickets
--     Bitacora inmutable de cambios de estado. Se alimenta por trigger
--     para garantizar que ningun cambio quede sin registrar, incluso si
--     alguien escribe directo en la base de datos.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS historial_tickets (
    id                  BIGSERIAL    PRIMARY KEY,
    ticket_id           UUID         NOT NULL REFERENCES tickets (id) ON DELETE CASCADE,
    usuario_id          UUID         REFERENCES usuarios (id) ON DELETE SET NULL,
    estado_anterior     estado_ticket,
    estado_nuevo        estado_ticket NOT NULL,
    agente_anterior     UUID         REFERENCES usuarios (id) ON DELETE SET NULL,
    agente_nuevo        UUID         REFERENCES usuarios (id) ON DELETE SET NULL,
    observacion         TEXT,
    creado_en           TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_historial_ticket ON historial_tickets (ticket_id, creado_en DESC);

CREATE OR REPLACE FUNCTION fn_registrar_historial_ticket()
RETURNS TRIGGER AS $$
BEGIN
    IF (TG_OP = 'INSERT') THEN
        INSERT INTO historial_tickets (ticket_id, estado_nuevo, agente_nuevo, observacion)
        VALUES (NEW.id, NEW.estado, NEW.agente_id, 'Ticket creado');
        RETURN NEW;
    END IF;

    IF (TG_OP = 'UPDATE') THEN
        IF (NEW.estado IS DISTINCT FROM OLD.estado)
           OR (NEW.agente_id IS DISTINCT FROM OLD.agente_id) THEN
            INSERT INTO historial_tickets (
                ticket_id, estado_anterior, estado_nuevo,
                agente_anterior, agente_nuevo,
                observacion
            ) VALUES (
                NEW.id, OLD.estado, NEW.estado,
                OLD.agente_id, NEW.agente_id,
                'Cambio registrado automaticamente'
            );
        END IF;
        RETURN NEW;
    END IF;

    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_tickets_historial ON tickets;
CREATE TRIGGER trg_tickets_historial
    AFTER INSERT OR UPDATE ON tickets
    FOR EACH ROW EXECUTE FUNCTION fn_registrar_historial_ticket();

-- ---------------------------------------------------------------------
-- 11. TABLA: notificaciones
--     Cola de salida para correo/SMS. El campo estado + intentos
--     habilita reintentos sin bloquear la peticion HTTP del usuario.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS notificaciones (
    id              UUID                  PRIMARY KEY DEFAULT gen_random_uuid(),
    ticket_id       UUID                  REFERENCES tickets (id) ON DELETE CASCADE,
    usuario_id      UUID                  REFERENCES usuarios (id) ON DELETE SET NULL,
    canal           canal_notificacion    NOT NULL,
    destinatario    VARCHAR(180)          NOT NULL,
    asunto          VARCHAR(200)          NOT NULL,
    mensaje         TEXT                  NOT NULL,
    estado          estado_notificacion   NOT NULL DEFAULT 'PENDIENTE',
    intentos        SMALLINT              NOT NULL DEFAULT 0,
    error_detalle   TEXT,
    enviado_en      TIMESTAMPTZ,
    creado_en       TIMESTAMPTZ           NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_notificaciones_pendientes
    ON notificaciones (estado, creado_en)
    WHERE estado = 'PENDIENTE';

-- ---------------------------------------------------------------------
-- 12. TABLA: tokens_refresco
--     Solo se guarda el HASH del refresh token. Si la base se filtra,
--     los tokens no son utilizables.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS tokens_refresco (
    id              UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    usuario_id      UUID         NOT NULL REFERENCES usuarios (id) ON DELETE CASCADE,
    token_hash      VARCHAR(64)  NOT NULL,
    expira_en       TIMESTAMPTZ  NOT NULL,
    revocado        BOOLEAN      NOT NULL DEFAULT FALSE,
    creado_en       TIMESTAMPTZ  NOT NULL DEFAULT NOW(),

    CONSTRAINT uq_tokens_refresco_hash UNIQUE (token_hash)
);

CREATE INDEX IF NOT EXISTS idx_tokens_refresco_usuario ON tokens_refresco (usuario_id);

-- ---------------------------------------------------------------------
-- 13. VISTA: resumen por agente (alimenta el modulo de reportes)
-- ---------------------------------------------------------------------
CREATE OR REPLACE VIEW vista_desempeno_agentes AS
SELECT
    u.id                                        AS agente_id,
    u.nombre_completo                           AS agente,
    u.correo                                    AS correo_agente,
    COUNT(t.id)                                 AS total_asignados,
    COUNT(t.id) FILTER (WHERE t.estado = 'RESUELTO')  AS total_resueltos,
    COUNT(t.id) FILTER (WHERE t.estado = 'CERRADO')   AS total_cerrados,
    COUNT(t.id) FILTER (WHERE t.estado IN ('NUEVO', 'ABIERTO', 'EN_PROGRESO', 'EN_ESPERA')) AS total_pendientes,
    ROUND(AVG(EXTRACT(EPOCH FROM (t.fecha_resolucion - t.creado_en)) / 3600.0)::NUMERIC, 2)
                                                AS promedio_horas_resolucion,
    ROUND(
        100.0 * COUNT(t.id) FILTER (WHERE t.fecha_resolucion IS NOT NULL
                                      AND t.fecha_resolucion <= t.fecha_limite_sla)
        / NULLIF(COUNT(t.id) FILTER (WHERE t.fecha_resolucion IS NOT NULL), 0)
    , 2)                                        AS porcentaje_cumplimiento_sla
FROM usuarios u
LEFT JOIN tickets t
       ON t.agente_id = u.id
      AND t.eliminado_en IS NULL
WHERE u.rol IN ('AGENTE', 'ADMINISTRADOR')
GROUP BY u.id, u.nombre_completo, u.correo;

COMMENT ON VIEW vista_desempeno_agentes IS 'KPIs por agente: carga, resoluciones, tiempo medio y cumplimiento de SLA.';

-- ---------------------------------------------------------------------
-- 14. VISTA: resumen global de tickets (dashboard y reportes)
-- ---------------------------------------------------------------------
CREATE OR REPLACE VIEW vista_resumen_tickets AS
SELECT
    t.estado,
    t.prioridad,
    COALESCE(c.nombre, 'Sin categoria')         AS categoria,
    COUNT(*)                                    AS total,
    ROUND(AVG(EXTRACT(EPOCH FROM (COALESCE(t.fecha_resolucion, NOW()) - t.creado_en)) / 3600.0)::NUMERIC, 2)
                                                AS promedio_horas
FROM tickets t
LEFT JOIN categorias c ON c.id = t.categoria_id
WHERE t.eliminado_en IS NULL
GROUP BY t.estado, t.prioridad, COALESCE(c.nombre, 'Sin categoria');

-- =====================================================================
-- FIN DEL ESQUEMA
-- =====================================================================
