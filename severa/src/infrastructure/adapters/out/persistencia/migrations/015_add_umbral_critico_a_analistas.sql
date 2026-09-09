-- RF-99 (M-13, retoma): umbral de "crítico" configurable por analista, en vez
-- del CVSS >= 9.0 fijo de NivelDeRiesgo.ts. Ambas nullable, sin backfill:
-- ningún analista existente lo tiene configurado, y el default implícito
-- (cvssScore, 9.0) se resuelve en código cuando la fila viene NULL — mismo
-- criterio que resolverVariableComponente (M-11), no un DEFAULT de SQL.
ALTER TABLE analistas
  ADD COLUMN IF NOT EXISTS variable_umbral_critico TEXT,
  ADD COLUMN IF NOT EXISTS valor_umbral_critico DOUBLE PRECISION;
