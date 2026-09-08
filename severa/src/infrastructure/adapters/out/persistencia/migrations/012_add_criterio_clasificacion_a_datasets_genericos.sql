-- RF-139 (M-09, pieza habilitadora) + pendiente de M-03 (columna clave).
-- Mismo patrón JSONB que ya usan `columnas` en esta misma tabla y
-- filtros_favoritos.criterios/analisis_realizados.payload: el criterio de
-- clasificación es forma libre (numérica con umbrales, u ordinal con orden
-- de categorías — ver CriterioDeClasificacionValue), no un esquema fijo que
-- justifique columnas separadas. columna_clave es solo texto (el nombre de
-- una columna existente en `columnas`), no necesita JSONB.
-- Ambas nullable: ningún dataset existente tiene esto configurado, y no hay
-- un default razonable que inventar — el analista las configura explícitamente
-- vía PATCH /analisis-datos/:datasetId/criterio-clasificacion.
ALTER TABLE datasets_genericos
  ADD COLUMN IF NOT EXISTS criterio_clasificacion JSONB,
  ADD COLUMN IF NOT EXISTS columna_clave TEXT;
