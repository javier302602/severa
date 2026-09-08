-- RF-103: notificaciones (migración 005) quedó sin ningún índice más allá de
-- la PK, a diferencia de analisis_realizados/vulnerabilidades/datasets_genericos
-- (migraciones 007/011), que sí tienen índices compuestos basados en el
-- patrón de consulta real. listarPorAnalista (ObtenerNotificaciones.ts) hace
-- WHERE destinatario = $1 ORDER BY fecha DESC en cada carga del centro de
-- notificaciones -- mismo patrón exacto que ya cubrieron esas otras
-- migraciones para sus propias tablas.
CREATE INDEX IF NOT EXISTS idx_notificaciones_destinatario_fecha ON notificaciones (destinatario, fecha DESC);
