-- RF-89: los criterios se guardan como JSONB (no columnas separadas), siguiendo
-- el modelo de la clase FiltroBusqueda del SDS (criterios: JSON) y porque la
-- mayoría de los campos son opcionales/dispersos por búsqueda.
-- ON DELETE CASCADE (agregado en Sprint 12/RF-98): sin esto, un analista con
-- filtros favoritos guardados no podría eliminar su cuenta — el DELETE
-- fallaría por violación de la FK. Al eliminar la cuenta (derecho de
-- cancelación, Ley 29733) también se eliminan sus filtros favoritos.
CREATE TABLE IF NOT EXISTS filtros_favoritos (
  id TEXT PRIMARY KEY,
  analista_id TEXT NOT NULL REFERENCES analistas(id) ON DELETE CASCADE,
  nombre TEXT NOT NULL,
  criterios JSONB NOT NULL,
  fecha_creacion TIMESTAMPTZ NOT NULL DEFAULT now()
);
