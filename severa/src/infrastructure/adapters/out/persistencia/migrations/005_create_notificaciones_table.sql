-- RF-99 a RF-104: centro de notificaciones por analista. ON DELETE CASCADE
-- (mismo criterio que filtros_favoritos desde Sprint 12/RF-98): si un
-- analista elimina su cuenta, sus notificaciones no deben sobrevivirla.
CREATE TABLE IF NOT EXISTS notificaciones (
  id TEXT PRIMARY KEY,
  tipo TEXT NOT NULL,
  destinatario TEXT NOT NULL REFERENCES analistas(id) ON DELETE CASCADE,
  leida BOOLEAN NOT NULL DEFAULT FALSE,
  fecha TIMESTAMPTZ NOT NULL DEFAULT now(),
  mensaje TEXT NOT NULL DEFAULT ''
);
