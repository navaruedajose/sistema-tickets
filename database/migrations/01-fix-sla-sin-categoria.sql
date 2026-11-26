-- =====================================================================
-- MIGRACION: el SLA se calcula tambien para tickets sin categoria
--
-- Problema: el trigger original solo calculaba `fecha_limite_sla` cuando el
-- ticket tenia categoria. Un ticket sin categoria quedaba con la fecha en
-- NULL, y por tanto nunca aparecia como vencido en los indicadores de SLA.
-- Ademas, el COALESCE(..., 48) era codigo inalcanzable.
--
-- Solucion: calcular siempre el SLA. Sin categoria se aplica el valor por
-- defecto de 48 horas.
--
-- Como aplicarla (sin borrar datos):
--   docker compose exec -T postgres psql -U tickets_user -d tickets_db \
--     -f - < database/migrations/01-fix-sla-sin-categoria.sql
--
-- En una instalacion nueva no hace falta: 01-schema.sql ya la incluye.
-- =====================================================================

-- 1. Corregir la funcion. El trigger ya apunta a ella por nombre, asi que
--    queda activa de inmediato, sin recrear el trigger.
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

-- 2. Rellenar los tickets que quedaron sin fecha limite por el bug anterior.
--    Se respeta el SLA de su categoria cuando la tienen; si no, 48 horas.
UPDATE tickets t
   SET fecha_limite_sla = t.creado_en
                        + (COALESCE(
                             (SELECT c.sla_horas FROM categorias c WHERE c.id = t.categoria_id),
                             48
                           ) || ' hours')::INTERVAL
 WHERE t.fecha_limite_sla IS NULL;

-- 3. Informar del resultado.
DO $$
DECLARE
    v_pendientes INTEGER;
BEGIN
    SELECT COUNT(*) INTO v_pendientes FROM tickets WHERE fecha_limite_sla IS NULL;
    RAISE NOTICE '[migracion] Tickets sin SLA tras el arreglo: %', v_pendientes;
END
$$;
