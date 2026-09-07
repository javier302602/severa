-- RF-03 + RNF-31: token de un solo uso para restablecer contraseña. Se
-- guarda el hash SHA-256 del token, nunca el valor plano (mismo criterio que
-- contrasena_hash en analistas) — si la base de datos se filtra, no expone
-- tokens reutilizables. ON DELETE CASCADE porque, a diferencia de
-- registros_auditoria, un token no tiene ningún motivo para sobrevivir a la
-- cuenta que lo emitió.
CREATE TABLE IF NOT EXISTS tokens_recuperacion (
  id TEXT PRIMARY KEY,
  analista_id TEXT NOT NULL REFERENCES analistas(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  expira_en TIMESTAMPTZ NOT NULL,
  usado BOOLEAN NOT NULL DEFAULT FALSE
);
