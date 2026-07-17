CREATE TABLE IF NOT EXISTS analistas (
  id TEXT PRIMARY KEY,
  nombre TEXT NOT NULL,
  correo TEXT NOT NULL UNIQUE,
  contrasena_hash TEXT NOT NULL,
  rol TEXT NOT NULL,
  bloqueado BOOLEAN NOT NULL DEFAULT FALSE,
  intentos_fallidos INTEGER NOT NULL DEFAULT 0,
  bloqueado_hasta TIMESTAMPTZ
);
