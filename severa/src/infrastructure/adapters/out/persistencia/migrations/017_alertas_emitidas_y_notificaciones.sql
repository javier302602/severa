-- M-13: las alertas de plazo (RF-76 "plazo excedido", RF-100 "plazo próximo
-- a vencer") se emitían cada vez que se evaluaba la condición, sin recordar
-- que ya se habían emitido:
--   * RF-76 se evalúa al generar el ranking de priorización, o sea en cada
--     visita a esa pantalla: con 10.000 vulnerabilidades vencidas, cada
--     visita agregaba 10.000 notificaciones;
--   * RF-100 se evalúa una vez por día, y una vulnerabilidad pasa dos días
--     dentro de la ventana de 48 horas: se avisaba dos veces.
-- Esta tabla es la memoria de "esta alerta, para esta vulnerabilidad, ya se
-- emitió". Es independiente de la tabla notificaciones a propósito: si el
-- analista borra la notificación, la alerta no se vuelve a generar.
--
-- vulnerabilidad_id con ON DELETE CASCADE: si el analista restablece su
-- dataset y vuelve a importar, las vulnerabilidades son registros nuevos (con
-- su fecha de carga y su plazo nuevos) y les corresponden sus alertas.
CREATE TABLE IF NOT EXISTS alertas_emitidas (
  analista_id TEXT NOT NULL REFERENCES analistas(id) ON DELETE CASCADE,
  tipo TEXT NOT NULL,
  vulnerabilidad_id INTEGER NOT NULL REFERENCES vulnerabilidades(id) ON DELETE CASCADE,
  emitida_en TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (analista_id, tipo, vulnerabilidad_id)
);

-- El borrado en cascada desde vulnerabilidades busca por vulnerabilidad_id,
-- que no es la primera columna de la clave primaria.
CREATE INDEX IF NOT EXISTS idx_alertas_emitidas_vulnerabilidad ON alertas_emitidas (vulnerabilidad_id);

-- RF-103: el contador de no leídas del encabezado se consulta en cada
-- sondeo; con este índice parcial no recorre las leídas.
CREATE INDEX IF NOT EXISTS idx_notificaciones_no_leidas ON notificaciones (destinatario) WHERE leida = FALSE;
