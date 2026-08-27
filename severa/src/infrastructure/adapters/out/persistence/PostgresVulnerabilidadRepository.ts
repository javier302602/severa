import { Pool } from 'pg';
import { Vulnerabilidad } from '../../../../domain/entities/Vulnerabilidad';
import { VulnerabilidadRepository, Paginacion } from '../../../../application/ports/out/VulnerabilidadRepository';
import { IdentificadorCVE } from '../../../../domain/value-objects/IdentificadorCVE';
import { CvssScore } from '../../../../domain/value-objects/CvssScore';
import { TipoAccesoValue } from '../../../../domain/value-objects/TipoAcceso';
import { EstadoRemediacion, EstadoRemediacionValue } from '../../../../domain/value-objects/EstadoRemediacion';
import { FiltroVulnerabilidad } from '../../../../domain/value-objects/FiltroVulnerabilidad';
import { clasificar } from '../../../../domain/services/ClasificadorDeRiesgo';
import { NivelDeRiesgo } from '../../../../domain/value-objects/NivelDeRiesgo';

// Multi-tenancy a nivel de dueño (migración 006): TODA consulta/modificación
// de esta tabla lleva WHERE/columna analista_id — no hay ningún método acá
// que devuelva o toque una fila de otro analista. analistaId llega siempre
// como parámetro explícito (nunca se lee de la fila ni se infiere), fiel al
// contrato del puerto (VulnerabilidadRepository.ts).
export class PostgresVulnerabilidadRepository implements VulnerabilidadRepository {
  constructor(private readonly pool: Pool) {}

  // Bug real de Sprint 16: este INSERT insertaba 'N/A' y null hardcodeados
  // para tipo_vulnerabilidad/dias_para_parche en vez de leerlos de la
  // entidad — el dato SÍ llegaba completo hasta acá (LectorExcelDataset →
  // ImportarDataset → Vulnerabilidad los propagan bien), se perdía
  // exclusivamente en este INSERT. Ningún test lo detectó porque todos
  // mockean VulnerabilidadRepository (ver PostgresVulnerabilidadRepository.integration.test.ts,
  // el único que ejecuta este SQL de verdad).
  //
  // ON CONFLICT (analista_id, cve) — antes era solo (cve): con un catálogo
  // global, dos analistas jamás competían por el mismo CVE; ahora el mismo
  // CVE puede existir una vez por analista (migración 006, unicidad
  // compuesta), así que el conflicto también debe ser compuesto — de lo
  // contrario, dos analistas distintos importando el mismo CVE real
  // chocarían contra una restricción que ya no existe en esos términos.
  async guardar(vulnerabilidad: Vulnerabilidad): Promise<void> {
    await this.pool.query(
      `INSERT INTO vulnerabilidades (cve, software, cvss_score, severidad, tipo_vulnerabilidad, acceso_remoto, dias_para_parche, estado_remediacion, fecha_remediacion, analista_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       ON CONFLICT (analista_id, cve) DO UPDATE SET
         software = EXCLUDED.software,
         cvss_score = EXCLUDED.cvss_score,
         severidad = EXCLUDED.severidad,
         tipo_vulnerabilidad = EXCLUDED.tipo_vulnerabilidad,
         acceso_remoto = EXCLUDED.acceso_remoto,
         dias_para_parche = EXCLUDED.dias_para_parche,
         estado_remediacion = EXCLUDED.estado_remediacion,
         fecha_remediacion = EXCLUDED.fecha_remediacion`,
      [
        vulnerabilidad.cve.valor,
        vulnerabilidad.descripcion,
        vulnerabilidad.cvssScore.valor,
        this.calcularSeveridad(vulnerabilidad.cvssScore),
        vulnerabilidad.tipoVulnerabilidad,
        vulnerabilidad.tipoAcceso?.valor === 'Remoto',
        vulnerabilidad.diasParaParche ?? null,
        vulnerabilidad.estadoRemediacion.valor,
        vulnerabilidad.fechaRemediacion ?? null,
        vulnerabilidad.analistaId
      ]
    );
  }

  // Inserción real por lotes (2026-07-17, datasets grandes vía "importar
  // desde link" — ver LectorExcelDataset.leerArchivoCsvEnStreaming /
  // ImportarDataset.ts): UN INSERT multi-VALUES por lote entero, no un
  // round-trip por fila. Con 400.000+ filas, llamar guardar() una por una
  // significaría 400.000 idas y vueltas a la base — acá son ~400-800 (según
  // el tamaño de lote), la diferencia real de rendimiento a este volumen.
  async guardarLote(vulnerabilidades: Vulnerabilidad[]): Promise<void> {
    if (vulnerabilidades.length === 0) {
      return;
    }

    // Un solo INSERT ... ON CONFLICT no puede afectar la MISMA fila dos
    // veces dentro del mismo statement (Postgres tira "ON CONFLICT DO
    // UPDATE command cannot affect row a second time") — un dataset real
    // puede traer el mismo CVE repetido más de una vez en el mismo lote
    // (fuentes como NVD/EPSS listan duplicados con cierta frecuencia). Se
    // deduplica DENTRO del lote por (analista_id, cve), quedándose con la
    // última aparición — mismo resultado neto que llamar guardar() una vez
    // por fila en orden.
    const porClave = new Map<string, Vulnerabilidad>();
    for (const vulnerabilidad of vulnerabilidades) {
      porClave.set(`${vulnerabilidad.analistaId}::${vulnerabilidad.cve.valor}`, vulnerabilidad);
    }
    const unicas = [...porClave.values()];

    const COLUMNAS_POR_FILA = 10;
    const valores: unknown[] = [];
    const placeholders: string[] = [];

    unicas.forEach((vulnerabilidad, indice) => {
      const base = indice * COLUMNAS_POR_FILA;
      placeholders.push(
        `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5}, $${base + 6}, $${base + 7}, $${base + 8}, $${base + 9}, $${base + 10})`
      );
      valores.push(
        vulnerabilidad.cve.valor,
        vulnerabilidad.descripcion,
        vulnerabilidad.cvssScore.valor,
        this.calcularSeveridad(vulnerabilidad.cvssScore),
        vulnerabilidad.tipoVulnerabilidad,
        vulnerabilidad.tipoAcceso?.valor === 'Remoto',
        vulnerabilidad.diasParaParche ?? null,
        vulnerabilidad.estadoRemediacion.valor,
        vulnerabilidad.fechaRemediacion ?? null,
        vulnerabilidad.analistaId
      );
    });

    await this.pool.query(
      `INSERT INTO vulnerabilidades (cve, software, cvss_score, severidad, tipo_vulnerabilidad, acceso_remoto, dias_para_parche, estado_remediacion, fecha_remediacion, analista_id)
       VALUES ${placeholders.join(', ')}
       ON CONFLICT (analista_id, cve) DO UPDATE SET
         software = EXCLUDED.software,
         cvss_score = EXCLUDED.cvss_score,
         severidad = EXCLUDED.severidad,
         tipo_vulnerabilidad = EXCLUDED.tipo_vulnerabilidad,
         acceso_remoto = EXCLUDED.acceso_remoto,
         dias_para_parche = EXCLUDED.dias_para_parche,
         estado_remediacion = EXCLUDED.estado_remediacion,
         fecha_remediacion = EXCLUDED.fecha_remediacion`,
      valores
    );
  }

  // WHERE cve = $1 AND analista_id = $3: sin el segundo filtro, un analista
  // podría marcar como remediado un CVE de otro analista con solo adivinar
  // el identificador (IDOR real) — el UPDATE simplemente no afectaría
  // ninguna fila si el CVE no le pertenece, en vez de tocar la ajena.
  async actualizarEstado(cve: string, estado: EstadoRemediacion, analistaId: string, fechaRemediacion?: Date): Promise<void> {
    await this.pool.query(
      'UPDATE vulnerabilidades SET estado_remediacion = $1, fecha_remediacion = $2 WHERE cve = $3 AND analista_id = $4',
      [estado, fechaRemediacion ?? null, cve, analistaId]
    );
  }

  async contar(analistaId: string): Promise<number> {
    const result = await this.pool.query('SELECT COUNT(*)::int AS total FROM vulnerabilidades WHERE analista_id = $1', [analistaId]);
    return result.rows[0].total;
  }

  async listar(analistaId: string): Promise<Vulnerabilidad[]> {
    const result = await this.pool.query('SELECT * FROM vulnerabilidades WHERE analista_id = $1 ORDER BY id', [analistaId]);
    return result.rows.map((row) => this.mapRow(row));
  }

  async buscarPorCve(cve: string, analistaId: string): Promise<Vulnerabilidad | null> {
    const result = await this.pool.query('SELECT * FROM vulnerabilidades WHERE cve = $1 AND analista_id = $2', [cve, analistaId]);
    return result.rows[0] ? this.mapRow(result.rows[0]) : null;
  }

  async filtrarPorRangoCvss(cvssMin: number, cvssMax: number, analistaId: string): Promise<Vulnerabilidad[]> {
    const result = await this.pool.query(
      'SELECT * FROM vulnerabilidades WHERE cvss_score BETWEEN $1 AND $2 AND analista_id = $3 ORDER BY cvss_score DESC',
      [cvssMin, cvssMax, analistaId]
    );
    return result.rows.map((row) => this.mapRow(row));
  }

  async filtrarPorSeveridad(severidad: string, analistaId: string): Promise<Vulnerabilidad[]> {
    const result = await this.pool.query(
      'SELECT * FROM vulnerabilidades WHERE severidad ILIKE $1 AND analista_id = $2 ORDER BY cvss_score DESC',
      [severidad, analistaId]
    );
    return result.rows.map((row) => this.mapRow(row));
  }

  async listarPorTipoAcceso(tipoAcceso: 'Remoto' | 'Local', analistaId: string): Promise<Vulnerabilidad[]> {
    const result = await this.pool.query(
      'SELECT * FROM vulnerabilidades WHERE acceso_remoto = $1 AND analista_id = $2 ORDER BY cvss_score DESC',
      [tipoAcceso === 'Remoto', analistaId]
    );
    return result.rows.map((row) => this.mapRow(row));
  }

  async listarPorTipoVulnerabilidad(tipoVulnerabilidad: string, analistaId: string): Promise<Vulnerabilidad[]> {
    const result = await this.pool.query(
      'SELECT * FROM vulnerabilidades WHERE tipo_vulnerabilidad ILIKE $1 AND analista_id = $2 ORDER BY cvss_score DESC',
      [tipoVulnerabilidad, analistaId]
    );
    return result.rows.map((row) => this.mapRow(row));
  }

  // Coincidencia parcial (2026-07-19, bug real reportado: "Apache Log4j" vs
  // "log4j" no comparaban porque antes era ILIKE exacto sin comodines —
  // cualquier variación de mayúsculas/nombre completo vs. parcial hacía que
  // CompararPorSoftware tratara una categoría con datos reales como vacía.
  // Solo afecta esta consulta (usada exclusivamente por CompararPorSoftware,
  // no por buscarConFiltros — ese filtro de "software" en Búsqueda avanzada
  // es intencionalmente de coincidencia exacta, ver su rótulo en la UI).
  async listarPorSoftware(software: string, analistaId: string): Promise<Vulnerabilidad[]> {
    const result = await this.pool.query(
      'SELECT * FROM vulnerabilidades WHERE software ILIKE $1 AND analista_id = $2 ORDER BY cvss_score DESC',
      [`%${software}%`, analistaId]
    );
    return result.rows.map((row) => this.mapRow(row));
  }

  // Dropdown de "Comparación por software" (2026-07-20): valores reales del
  // catálogo del analista, no una lista adivinada. LIMIT 100 por prolijidad
  // del selector (un dataset con miles de nombres de software distintos no
  // cabe útilmente en un <select>) — no es un límite de seguridad como el de
  // buscarConFiltros, así que no usa el mismo tipo Paginacion.
  async listarSoftwareDisponible(analistaId: string): Promise<string[]> {
    const result = await this.pool.query(
      'SELECT DISTINCT software FROM vulnerabilidades WHERE analista_id = $1 ORDER BY software LIMIT 100',
      [analistaId]
    );
    return result.rows.map((row) => row.software);
  }

  // RF-88: arma el WHERE dinámicamente según qué criterios vengan presentes en
  // el filtro, pero SIEMPRE con parámetros preparados ($1, $2, ...) — nunca se
  // concatena un valor dentro del texto SQL, solo nombres de columna fijos que
  // no dependen de input del usuario. analista_id se agrega SIEMPRE como
  // condición fija (no es un criterio más del FiltroVulnerabilidad que
  // controla el cliente — llega aparte, del token) para que ningún filtro
  // pueda, ni por accidente, devolver resultados de otro analista.
  async buscarConFiltros(filtro: FiltroVulnerabilidad, analistaId: string, paginacion?: Paginacion): Promise<Vulnerabilidad[]> {
    const condiciones: string[] = [];
    const valores: unknown[] = [];

    valores.push(analistaId);
    condiciones.push(`analista_id = $${valores.length}`);

    if (filtro.cve) {
      valores.push(filtro.cve.valor);
      condiciones.push(`cve = $${valores.length}`);
    }
    if (filtro.cvssMin !== undefined) {
      valores.push(filtro.cvssMin);
      condiciones.push(`cvss_score >= $${valores.length}`);
    }
    if (filtro.cvssMax !== undefined) {
      valores.push(filtro.cvssMax);
      condiciones.push(`cvss_score <= $${valores.length}`);
    }
    if (filtro.severidad) {
      valores.push(filtro.severidad);
      condiciones.push(`severidad ILIKE $${valores.length}`);
    }
    // LIMITACIÓN CONOCIDA (RF-85): se filtra contra fecha_carga (cuándo SEVERA
    // importó el registro), no contra la fecha real de publicación del CVE en
    // NVD — esa fecha no existe en esta tabla (ver el mismo comentario en
    // CriteriosFiltroVulnerabilidad y en estaPlazoExcedido() de
    // MotorDePriorizacion.ts).
    if (filtro.fechaDesde) {
      valores.push(filtro.fechaDesde);
      condiciones.push(`fecha_carga >= $${valores.length}`);
    }
    if (filtro.fechaHasta) {
      valores.push(filtro.fechaHasta);
      condiciones.push(`fecha_carga <= $${valores.length}`);
    }
    if (filtro.componente) {
      valores.push(filtro.componente);
      condiciones.push(`software ILIKE $${valores.length}`);
    }
    if (filtro.estadoRemediacion) {
      valores.push(filtro.estadoRemediacion);
      condiciones.push(`estado_remediacion = $${valores.length}`);
    }

    // cve como desempate (2026-07-19): con miles de filas empatadas en el
    // mismo cvss_score (visto en datos reales: 4154 filas en 7.5 dentro de un
    // solo analista), "ORDER BY cvss_score DESC" a secas no es determinista
    // — Postgres puede devolver los empates en distinto orden entre dos
    // ejecuciones, así que páginas consecutivas (LIMIT/OFFSET) pueden
    // solaparse o saltearse filas. cve es único por analista (constraint
    // UNIQUE(analista_id, cve)), así que agregarlo como desempate fija el
    // orden sin cambiar el criterio principal (mayor CVSS primero).
    let sql = `SELECT * FROM vulnerabilidades WHERE ${condiciones.join(' AND ')} ORDER BY cvss_score DESC, cve ASC`;
    if (paginacion) {
      valores.push(paginacion.limite);
      sql += ` LIMIT $${valores.length}`;
      valores.push(paginacion.offset);
      sql += ` OFFSET $${valores.length}`;
    }

    const result = await this.pool.query(sql, valores);
    return result.rows.map((row) => this.mapRow(row));
  }

  // "Restablecer mis datos": borra SOLO las vulnerabilidades del analista que
  // la invoca. DELETE en vez de TRUNCATE — TRUNCATE no admite un WHERE (borra
  // la tabla entera) y acá el borrado tiene que ser parcial por diseño.
  async eliminarTodas(analistaId: string): Promise<number> {
    const result = await this.pool.query('DELETE FROM vulnerabilidades WHERE analista_id = $1', [analistaId]);
    return result.rowCount ?? 0;
  }

  private mapRow(row: Record<string, unknown>): Vulnerabilidad {
    return new Vulnerabilidad(
      String(row.id),
      new IdentificadorCVE(String(row.cve)),
      new CvssScore(Number(row.cvss_score)),
      String(row.software),
      new TipoAccesoValue(row.acceso_remoto ? 'Sí' : 'No'),
      row.dias_para_parche === null || row.dias_para_parche === undefined ? undefined : Number(row.dias_para_parche),
      String(row.software),
      String(row.tipo_vulnerabilidad ?? 'N/A'),
      new EstadoRemediacionValue((row.estado_remediacion as EstadoRemediacion) ?? 'Pendiente'),
      row.fecha_carga ? new Date(row.fecha_carga as string) : undefined,
      row.fecha_remediacion ? new Date(row.fecha_remediacion as string) : undefined,
      row.analista_id ? String(row.analista_id) : undefined
    );
  }

  // Reutiliza ClasificadorDeRiesgo (RF-69) como fuente única de los umbrales;
  // solo traduce el NivelDeRiesgo a las etiquetas en femenino ya usadas en la
  // columna 'severidad'.
  private calcularSeveridad(cvssScore: CvssScore): string {
    const etiquetas: Record<NivelDeRiesgo, string> = {
      Bajo: 'Baja',
      Moderado: 'Media',
      Alto: 'Alta',
      Crítico: 'Crítica'
    };
    return etiquetas[clasificar(cvssScore).valor];
  }
}
