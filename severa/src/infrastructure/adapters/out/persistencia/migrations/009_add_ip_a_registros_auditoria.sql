-- RF-08 + RNF-33: agrega la IP de origen a la bitácora de auditoría. Columna
-- nullable, sin backfill — los registros históricos (si los hay) nunca
-- capturaron IP y no hay forma de reconstruirla retroactivamente; quedan con
-- ip = NULL, que es la representación correcta de "dato no disponible", no
-- un valor por defecto inventado.
ALTER TABLE registros_auditoria ADD COLUMN IF NOT EXISTS ip TEXT;
