-- RF-12 (M-02): plantillas de análisis del camino genérico. Una plantilla es
-- la configuración de análisis de un dataset (tipos corregidos, variable
-- objetivo confirmada, criterio de clasificación y columna clave) guardada
-- con un nombre para reaplicarla sobre otro dataset compatible.
--
-- La configuración va en JSONB, como los criterios de filtros_favoritos
-- (RF-89): es un documento que se lee y se escribe entero, nunca se consulta
-- por partes.
--
-- ON DELETE CASCADE: al eliminar la cuenta (RF-98, derecho de cancelación)
-- se eliminan también sus plantillas.
CREATE TABLE IF NOT EXISTS plantillas_analisis (
  id TEXT PRIMARY KEY,
  analista_id TEXT NOT NULL REFERENCES analistas(id) ON DELETE CASCADE,
  -- Se guarda ya sin espacios al borde; de 1 a 80 caracteres.
  nombre TEXT NOT NULL,
  configuracion JSONB NOT NULL,
  fecha_creacion TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT chk_plantillas_analisis_nombre CHECK (nombre = btrim(nombre) AND char_length(nombre) BETWEEN 1 AND 80)
);

-- Un analista no puede tener dos plantillas con el mismo nombre, sin
-- distinguir mayúsculas ("Encuestas" y "encuestas" son la misma). La
-- aplicación no sobrescribe: el INSERT que choca con este índice se rechaza.
CREATE UNIQUE INDEX IF NOT EXISTS uq_plantillas_analisis_nombre
  ON plantillas_analisis (analista_id, lower(nombre));
