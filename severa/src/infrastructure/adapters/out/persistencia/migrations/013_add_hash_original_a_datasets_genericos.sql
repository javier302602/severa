-- RF-135 (M-12): hash SHA-256 del archivo original, calculado al momento de
-- la carga (AnalizarDatasetGenerico.ejecutar(), antes de parsearlo). TEXT
-- nullable: los datasets ya importados antes de esta migración no tienen
-- forma honesta de obtener un hash retroactivo (el archivo original ya no
-- existe en disco, se borra tras parsearse — ver AnalisisDatasetAnalizarController.ts).
-- No se guarda el archivo en sí, solo su hash — mismo criterio de "sin
-- storage de blobs nuevo" que el resto del proyecto.
ALTER TABLE datasets_genericos
  ADD COLUMN IF NOT EXISTS hash_original_sha256 TEXT;
