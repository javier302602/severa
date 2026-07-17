-- RF-94/RF-95: `usuario` guarda el id del analista SIN foreign key. El
-- historial de auditoría debe sobrevivir a la eliminación de la cuenta
-- (RF-98, "Ley 29733"/derecho al olvido) — una FK con ON DELETE CASCADE
-- borraría el rastro de auditoría junto con la cuenta, y con RESTRICT
-- impediría eliminar la cuenta mientras tenga historial. Ninguna de las dos
-- es aceptable para un log de auditoría, así que queda como referencia
-- textual, no como constraint de integridad referencial.
CREATE TABLE IF NOT EXISTS registros_auditoria (
  id TEXT PRIMARY KEY,
  usuario TEXT NOT NULL,
  accion TEXT NOT NULL,
  detalle TEXT NOT NULL,
  fecha_hora TIMESTAMPTZ NOT NULL DEFAULT now()
);
