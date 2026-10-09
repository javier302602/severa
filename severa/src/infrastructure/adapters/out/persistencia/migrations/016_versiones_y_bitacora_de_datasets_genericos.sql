-- M-14 Ronda 2 (RF-110, RF-111) + M-15 Ronda 2 (RF-120 a RF-123) + lo que
-- M-12 dejó diferido hasta que existiera un "dataset procesado" (RF-136,
-- RF-137, RF-138).
--
-- MODELO: una versión procesada es OTRA fila de datasets_genericos, con sus
-- propios registros, que apunta al dataset original del que desciende.
--   * original:  dataset_original_id IS NULL, version = 0
--   * procesada: dataset_original_id = id del original, version = 1, 2, 3...
-- La numeración es por familia (todas las versiones de un mismo original) y
-- version_base dice de qué versión partió cada una: se puede limpiar la
-- versión 1 y obtener la 2, o volver al original y obtener la 3.
-- Se eligió copiar las filas en vez de guardar solo "la receta" de la
-- limpieza porque RF-136 pide poder recuperar cualquier versión anterior y
-- RF-137 pide que el resultado sea un artefacto independiente: una versión
-- que se recalcula a partir del original deja de existir si cambia el código
-- que la recalcula.

ALTER TABLE datasets_genericos
  ADD COLUMN IF NOT EXISTS dataset_original_id TEXT REFERENCES datasets_genericos(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS version INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS version_base INTEGER,
  -- Cantidad de filas, para listar versiones sin contar registros cada vez.
  ADD COLUMN IF NOT EXISTS total_filas INTEGER,
  -- RF-111: tipo de variable fijado a mano por el analista, por columna
  -- ({"Código postal": "categorica_nominal"}). Vacío = todo automático.
  ADD COLUMN IF NOT EXISTS tipos_corregidos JSONB NOT NULL DEFAULT '{}'::jsonb,
  -- RF-110: decisión del analista sobre la variable objetivo. El sistema solo
  -- sugiere; acá queda lo que el analista confirmó o rechazó.
  ADD COLUMN IF NOT EXISTS variable_objetivo TEXT,
  ADD COLUMN IF NOT EXISTS estado_variable_objetivo TEXT NOT NULL DEFAULT 'pendiente';

-- Los datasets cargados antes de esta migración quedan como originales
-- (version 0 por el DEFAULT) con su cantidad real de filas.
UPDATE datasets_genericos d
   SET total_filas = (SELECT count(*) FROM registros_datasets_genericos r WHERE r.dataset_id = d.id)
 WHERE d.total_filas IS NULL;

-- Las restricciones no tienen "IF NOT EXISTS": se quitan y se vuelven a crear
-- para que la migración se pueda correr más de una vez.
ALTER TABLE datasets_genericos
  DROP CONSTRAINT IF EXISTS chk_datasets_genericos_version,
  DROP CONSTRAINT IF EXISTS chk_datasets_genericos_estado_objetivo;

ALTER TABLE datasets_genericos
  ADD CONSTRAINT chk_datasets_genericos_version CHECK (
    (dataset_original_id IS NULL AND version = 0 AND version_base IS NULL)
    OR (dataset_original_id IS NOT NULL AND version >= 1 AND version_base IS NOT NULL AND version_base >= 0 AND version_base < version)
  ),
  ADD CONSTRAINT chk_datasets_genericos_estado_objetivo CHECK (
    (estado_variable_objetivo = 'confirmada' AND variable_objetivo IS NOT NULL)
    OR (estado_variable_objetivo IN ('pendiente', 'rechazada') AND variable_objetivo IS NULL)
  );

-- RF-136: dos limpiezas simultáneas del mismo dataset no pueden terminar con
-- el mismo número de versión.
CREATE UNIQUE INDEX IF NOT EXISTS uq_datasets_genericos_version
  ON datasets_genericos (dataset_original_id, version)
  WHERE dataset_original_id IS NOT NULL;

-- Orden de las filas tal como venían en el archivo. Hasta ahora
-- listarRegistros ordenaba por id (un UUID aleatorio), así que un dataset
-- exportado o reabierto salía con las filas mezcladas. NULL en los registros
-- anteriores a esta migración: su orden original ya no se puede reconstruir.
ALTER TABLE registros_datasets_genericos ADD COLUMN IF NOT EXISTS posicion INTEGER;
CREATE INDEX IF NOT EXISTS idx_registros_datasets_genericos_orden
  ON registros_datasets_genericos (dataset_id, analista_id, posicion);

-- RF-123: bitácora de trazabilidad. Una fila por operación (no por limpieza):
-- fecha, usuario, operación, variable, registros afectados y método, que es
-- exactamente lo que pide el criterio de aceptación. dataset_original_id
-- agrupa toda la historia de una familia de versiones; version_resultado es
-- NULL cuando la operación no genera una versión nueva (RF-111, corrección de
-- tipo: cambia cómo se interpreta una columna, no los datos).
CREATE TABLE IF NOT EXISTS bitacora_datasets (
  id TEXT PRIMARY KEY,
  dataset_original_id TEXT NOT NULL REFERENCES datasets_genericos(id) ON DELETE CASCADE,
  analista_id TEXT NOT NULL REFERENCES analistas(id) ON DELETE CASCADE,
  fecha TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- Orden dentro de una misma limpieza: todas sus operaciones comparten fecha.
  secuencia INTEGER NOT NULL DEFAULT 0,
  operacion TEXT NOT NULL,
  variable TEXT,
  registros_afectados INTEGER NOT NULL DEFAULT 0,
  metodo TEXT NOT NULL,
  version_origen INTEGER NOT NULL,
  version_resultado INTEGER,
  detalle JSONB NOT NULL DEFAULT '{}'::jsonb
);
CREATE INDEX IF NOT EXISTS idx_bitacora_datasets_familia
  ON bitacora_datasets (dataset_original_id, analista_id, fecha, secuencia);

-- RF-138: la auditoría central (M-12) puede referir a un dataset concreto,
-- para que el administrador consulte todo lo que se hizo sobre él. Sin FK, por
-- el mismo motivo que `usuario`: el registro de auditoría sobrevive al dataset.
ALTER TABLE registros_auditoria ADD COLUMN IF NOT EXISTS dataset_id TEXT;
CREATE INDEX IF NOT EXISTS idx_registros_auditoria_dataset
  ON registros_auditoria (dataset_id, fecha_hora DESC)
  WHERE dataset_id IS NOT NULL;

-- RF-137: "impedir, a nivel de diseño, que cualquier operación escriba sobre
-- el dataset original". El código de la aplicación no tiene ningún método que
-- modifique un registro (ver DatasetGenericoRepository); estos disparadores
-- hacen que tampoco pueda hacerlo código futuro, un script o una consulta a
-- mano: la base rechaza el UPDATE. El DELETE sigue permitido porque lo
-- necesita la eliminación de la cuenta (RF-98, ON DELETE CASCADE).
CREATE OR REPLACE FUNCTION impedir_modificar_registro_de_dataset() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'Los registros de un dataset no se modifican: toda transformación genera una versión nueva (RF-137)'
    USING ERRCODE = 'integrity_constraint_violation';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_registros_datasets_genericos_inmutables ON registros_datasets_genericos;
CREATE TRIGGER trg_registros_datasets_genericos_inmutables
  BEFORE UPDATE ON registros_datasets_genericos
  FOR EACH ROW EXECUTE FUNCTION impedir_modificar_registro_de_dataset();

-- En la cabecera sí hay cosas que el analista configura después de la carga
-- (criterio de clasificación, tipos corregidos, variable objetivo); lo que no
-- puede cambiar es lo que define QUÉ dataset es.
CREATE OR REPLACE FUNCTION impedir_modificar_identidad_de_dataset() RETURNS trigger AS $$
BEGIN
  IF NEW.id IS DISTINCT FROM OLD.id
     OR NEW.analista_id IS DISTINCT FROM OLD.analista_id
     OR NEW.nombre_archivo IS DISTINCT FROM OLD.nombre_archivo
     OR NEW.columnas IS DISTINCT FROM OLD.columnas
     OR NEW.fuente IS DISTINCT FROM OLD.fuente
     OR NEW.fecha_carga IS DISTINCT FROM OLD.fecha_carga
     OR NEW.hash_original_sha256 IS DISTINCT FROM OLD.hash_original_sha256
     OR NEW.dataset_original_id IS DISTINCT FROM OLD.dataset_original_id
     OR NEW.version IS DISTINCT FROM OLD.version
     OR NEW.version_base IS DISTINCT FROM OLD.version_base
     OR (OLD.total_filas IS NOT NULL AND NEW.total_filas IS DISTINCT FROM OLD.total_filas)
  THEN
    RAISE EXCEPTION 'El contenido de un dataset ya cargado no se modifica: toda transformación genera una versión nueva (RF-137)'
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_datasets_genericos_identidad_inmutable ON datasets_genericos;
CREATE TRIGGER trg_datasets_genericos_identidad_inmutable
  BEFORE UPDATE ON datasets_genericos
  FOR EACH ROW EXECUTE FUNCTION impedir_modificar_identidad_de_dataset();

-- La bitácora tampoco se reescribe.
CREATE OR REPLACE FUNCTION impedir_modificar_bitacora_de_dataset() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'La bitácora de un dataset no se modifica (RF-123)'
    USING ERRCODE = 'integrity_constraint_violation';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_bitacora_datasets_inmutable ON bitacora_datasets;
CREATE TRIGGER trg_bitacora_datasets_inmutable
  BEFORE UPDATE ON bitacora_datasets
  FOR EACH ROW EXECUTE FUNCTION impedir_modificar_bitacora_de_dataset();
