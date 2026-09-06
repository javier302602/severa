CREATE TABLE IF NOT EXISTS vulnerabilidades (
  id SERIAL PRIMARY KEY,
  cve VARCHAR(20) NOT NULL UNIQUE,
  software VARCHAR(255) NOT NULL,
  cvss_score NUMERIC(3,1) NOT NULL CHECK (cvss_score >= 0.0 AND cvss_score <= 10.0),
  severidad VARCHAR(20) NOT NULL,
  tipo_vulnerabilidad VARCHAR(100) NOT NULL,
  acceso_remoto BOOLEAN NOT NULL,
  dias_para_parche INTEGER,
  estado_remediacion VARCHAR(20) NOT NULL DEFAULT 'Pendiente',
  fecha_carga TIMESTAMP NOT NULL DEFAULT now(),
  fecha_remediacion TIMESTAMP
);
