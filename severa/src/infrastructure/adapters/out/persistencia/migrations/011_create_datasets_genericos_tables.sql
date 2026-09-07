-- Generalización de M-03 (RF-17/18/21/23): pipeline persistido para
-- datasets tabulares sin esquema fijo, separado por completo de
-- `vulnerabilidades` (que queda intacta — sigue siendo el preset de
-- ciberseguridad, Anexo D del SDS). `columnas` guarda los nombres tal como
-- vinieron en el archivo (JSONB, mismo patrón que filtros_favoritos.criterios
-- y analisis_realizados.payload); cada registro real vive aparte en
-- registros_datasets_genericos, un patrón cabecera+detalle (no un blob único
-- por dataset) para poder escalar a datasets grandes igual que
-- vulnerabilidades. `preset` queda reservado (siempre NULL por ahora) para
-- cuando se aborde la unificación de endpoints con el preset de
-- ciberseguridad. ON DELETE CASCADE en ambas tablas: ni un dataset genérico
-- ni sus registros tienen motivo para sobrevivir a la cuenta que los subió
-- (a diferencia de registros_auditoria).
CREATE TABLE IF NOT EXISTS datasets_genericos (
  id TEXT PRIMARY KEY,
  analista_id TEXT NOT NULL REFERENCES analistas(id) ON DELETE CASCADE,
  nombre_archivo TEXT NOT NULL,
  columnas JSONB NOT NULL,
  fuente TEXT NOT NULL,
  preset TEXT,
  filas_duplicadas INTEGER NOT NULL DEFAULT 0,
  fecha_carga TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_datasets_genericos_analista ON datasets_genericos (analista_id, fecha_carga DESC);

CREATE TABLE IF NOT EXISTS registros_datasets_genericos (
  id TEXT PRIMARY KEY,
  dataset_id TEXT NOT NULL REFERENCES datasets_genericos(id) ON DELETE CASCADE,
  analista_id TEXT NOT NULL REFERENCES analistas(id) ON DELETE CASCADE,
  valores JSONB NOT NULL,
  fecha_carga TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- Cubre el patrón real de listarRegistros: WHERE dataset_id = $1 AND
-- analista_id = $2. analista_id vive también en esta tabla (no solo vía
-- JOIN a datasets_genericos) por el mismo motivo que Vulnerabilidad.analistaId:
-- permite validar ownership en la capa de aplicación sin depender de que el
-- repositorio ya haya hecho bien el JOIN.
CREATE INDEX idx_registros_datasets_genericos_dataset ON registros_datasets_genericos (dataset_id, analista_id);
