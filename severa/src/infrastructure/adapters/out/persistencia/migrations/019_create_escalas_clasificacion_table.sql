-- RF-28 / RF-69 (M-04, M-09), "Modo B": los cortes de los niveles de riesgo
-- del catálogo, configurables por analista. Sin fila, el analista usa la
-- escala CVSS (4.0 / 7.0 / 9.0), que se resuelve en código.
--
-- Columnas numéricas y no JSON: la base valida el orden y el rango, y las
-- consultas usan los cortes directamente para filtrar por rango de
-- cvss_score (con el índice (analista_id, cvss_score) de la migración 007).
--
-- La columna `severidad` de `vulnerabilidades` NO se reescribe: la categoría
-- con estos cortes se calcula al consultar.
--
-- ON DELETE CASCADE: eliminar la cuenta (RF-98) se lleva su escala.
CREATE TABLE IF NOT EXISTS escalas_clasificacion (
  analista_id TEXT PRIMARY KEY REFERENCES analistas(id) ON DELETE CASCADE,
  -- Dónde empieza cada nivel; Bajo empieza siempre en 0.0. Un decimal, como
  -- el CVSS.
  corte_moderado NUMERIC(3, 1) NOT NULL,
  corte_alto NUMERIC(3, 1) NOT NULL,
  corte_critico NUMERIC(3, 1) NOT NULL,
  actualizado_en TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT chk_escalas_clasificacion_cortes CHECK (
    corte_moderado > 0 AND corte_moderado < corte_alto AND corte_alto < corte_critico AND corte_critico <= 10
  )
);
