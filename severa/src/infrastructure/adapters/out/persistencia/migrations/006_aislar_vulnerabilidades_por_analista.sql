-- Multi-tenancy a nivel de dueño (confirmado con el usuario): cada analista
-- tiene su propio catálogo de vulnerabilidades, aislado del resto. Decisión
-- confirmada: los datos existentes se BORRAN (no se migran ni se asignan a
-- nadie) — no hay forma honesta de adivinar de quién eran los 15000+
-- registros ya cargados, así que cada analista arranca de cero.
TRUNCATE TABLE vulnerabilidades;

-- NOTA: el pedido original decía "analista_id INTEGER", pero analistas.id es
-- TEXT (ver 001_create_analistas_table.sql) — igual que ya usan
-- filtros_favoritos.analista_id y notificaciones.destinatario (migraciones
-- 004/005, confirmado consistente). INTEGER REFERENCES analistas(id)
-- fallaría acá por incompatibilidad de tipos de la FK; se usa TEXT para que
-- la referencia sea válida y consistente con el resto del esquema.
--
-- ON DELETE CASCADE (mismo criterio que filtros_favoritos/notificaciones):
-- sin esto, EliminarCuenta (derecho de cancelación, Ley 29733) fallaría con
-- una violación de FK en cuanto el analista tuviera una sola vulnerabilidad
-- cargada — la cuenta no podría borrarse mientras queden filas que la
-- referencien.
ALTER TABLE vulnerabilidades
  ADD COLUMN analista_id TEXT NOT NULL REFERENCES analistas(id) ON DELETE CASCADE;

-- Antes "cve" era único en toda la tabla (un solo catálogo global): dos
-- analistas jamás podían tener el mismo CVE cargado a la vez, y
-- guardar()'s "ON CONFLICT (cve) DO UPDATE" sobreescribía silenciosamente el
-- registro de cualquier analista con los datos del que importara después —
-- el peor tipo de fuga entre tenants, porque ni siquiera tira error. Con
-- catálogos aislados, dos analistas distintos deben poder tener el mismo CVE
-- real cada uno en el suyo (ambos importan, por ejemplo, CVE-2021-44228) sin
-- pisarse entre sí. Se reemplaza la unicidad global por una unicidad
-- compuesta (analista_id, cve) — nuevo target del ON CONFLICT en
-- PostgresVulnerabilidadRepository.guardar().
ALTER TABLE vulnerabilidades DROP CONSTRAINT vulnerabilidades_cve_key;
ALTER TABLE vulnerabilidades ADD CONSTRAINT vulnerabilidades_analista_cve_key UNIQUE (analista_id, cve);

-- Toda consulta de este módulo (catálogo, estadísticas, gráficos,
-- comparación, priorización, búsqueda, informes) filtra por analista_id
-- primero — es la columna más consultada de la tabla a partir de ahora.
CREATE INDEX idx_vulnerabilidades_analista_id ON vulnerabilidades (analista_id);
