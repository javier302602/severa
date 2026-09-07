-- RF-11 (M-02): infraestructura mínima y genérica del historial de análisis.
-- `tipo_evento` queda como TEXT libre (sin CHECK ni enum) y `payload` como
-- JSONB sin esquema fijo (mismo patrón que filtros_favoritos.criterios,
-- migración 004) porque todavía no sabemos con certeza todos los tipos de
-- eventos que M-05 a M-09 van a generar. ON DELETE CASCADE: mismo criterio
-- que filtros_favoritos/notificaciones/tokens_recuperacion — un historial de
-- análisis no tiene motivo para sobrevivir a la cuenta que lo generó (a
-- diferencia de registros_auditoria, ver migración 003).
CREATE TABLE IF NOT EXISTS analisis_realizados (
  id TEXT PRIMARY KEY,
  analista_id TEXT NOT NULL REFERENCES analistas(id) ON DELETE CASCADE,
  tipo_evento TEXT NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  fecha_hora TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Cubre el patrón de consulta real (listarPorAnalista: WHERE analista_id = $1
-- ORDER BY fecha_hora DESC), mismo criterio que los índices compuestos de la
-- migración 007.
CREATE INDEX idx_analisis_realizados_analista_fecha ON analisis_realizados (analista_id, fecha_hora DESC);
