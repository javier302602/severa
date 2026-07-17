import { Pool } from 'pg';
import { Vulnerabilidad } from '../../../../domain/entities/Vulnerabilidad';
import { VulnerabilidadRepository } from '../../../../application/ports/out/VulnerabilidadRepository';
import { IdentificadorCVE } from '../../../../domain/value-objects/IdentificadorCVE';
import { CvssScore } from '../../../../domain/value-objects/CvssScore';
import { TipoAccesoValue } from '../../../../domain/value-objects/TipoAcceso';
import { EstadoRemediacion, EstadoRemediacionValue } from '../../../../domain/value-objects/EstadoRemediacion';
import { FiltroVulnerabilidad } from '../../../../domain/value-objects/FiltroVulnerabilidad';
import { clasificar } from '../../../../domain/services/ClasificadorDeRiesgo';
import { NivelDeRiesgo } from '../../../../domain/value-objects/NivelDeRiesgo';

export class PostgresVulnerabilidadRepository implements VulnerabilidadRepository {
  constructor(private readonly pool: Pool) {}

  // Bug real de Sprint 16: este INSERT insertaba 'N/A' y null hardcodeados
  // para tipo_vulnerabilidad/dias_para_parche en vez de leerlos de la
  // entidad — el dato SÍ llegaba completo hasta acá (LectorExcelDataset →
  // ImportarDataset → Vulnerabilidad los propagan bien), se perdía
  // exclusivamente en este INSERT. Ningún test lo detectó porque todos
  // mockean VulnerabilidadRepository (ver PostgresVulnerabilidadRepository.integration.test.ts,
  // el único que ejecuta este SQL de verdad).
  async guardar(vulnerabilidad: Vulnerabilidad): Promise<void> {
    await this.pool.query(
      `INSERT INTO vulnerabilidades (cve, software, cvss_score, severidad, tipo_vulnerabilidad, acceso_remoto, dias_para_parche, estado_remediacion, fecha_remediacion)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       ON CONFLICT (cve) DO UPDATE SET
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
        vulnerabilidad.fechaRemediacion ?? null
      ]
    );
  }

  async actualizarEstado(cve: string, estado: EstadoRemediacion, fechaRemediacion?: Date): Promise<void> {
    await this.pool.query(
      'UPDATE vulnerabilidades SET estado_remediacion = $1, fecha_remediacion = $2 WHERE cve = $3',
      [estado, fechaRemediacion ?? null, cve]
    );
  }

  async contar(): Promise<number> {
    const result = await this.pool.query('SELECT COUNT(*)::int AS total FROM vulnerabilidades');
    return result.rows[0].total;
  }

  async listar(): Promise<Vulnerabilidad[]> {
    const result = await this.pool.query('SELECT * FROM vulnerabilidades ORDER BY id');
    return result.rows.map((row) => this.mapRow(row));
  }

  async buscarPorCve(cve: string): Promise<Vulnerabilidad | null> {
    const result = await this.pool.query('SELECT * FROM vulnerabilidades WHERE cve = $1', [cve]);
    return result.rows[0] ? this.mapRow(result.rows[0]) : null;
  }

  async filtrarPorRangoCvss(cvssMin: number, cvssMax: number): Promise<Vulnerabilidad[]> {
    const result = await this.pool.query(
      'SELECT * FROM vulnerabilidades WHERE cvss_score BETWEEN $1 AND $2 ORDER BY cvss_score DESC',
      [cvssMin, cvssMax]
    );
    return result.rows.map((row) => this.mapRow(row));
  }

  async filtrarPorSeveridad(severidad: string): Promise<Vulnerabilidad[]> {
    const result = await this.pool.query(
      'SELECT * FROM vulnerabilidades WHERE severidad ILIKE $1 ORDER BY cvss_score DESC',
      [severidad]
    );
    return result.rows.map((row) => this.mapRow(row));
  }

  async listarPorTipoAcceso(tipoAcceso: 'Remoto' | 'Local'): Promise<Vulnerabilidad[]> {
    const result = await this.pool.query('SELECT * FROM vulnerabilidades WHERE acceso_remoto = $1 ORDER BY cvss_score DESC', [tipoAcceso === 'Remoto']);
    return result.rows.map((row) => this.mapRow(row));
  }

  async listarPorTipoVulnerabilidad(tipoVulnerabilidad: string): Promise<Vulnerabilidad[]> {
    const result = await this.pool.query('SELECT * FROM vulnerabilidades WHERE tipo_vulnerabilidad ILIKE $1 ORDER BY cvss_score DESC', [tipoVulnerabilidad]);
    return result.rows.map((row) => this.mapRow(row));
  }

  async listarPorSoftware(software: string): Promise<Vulnerabilidad[]> {
    const result = await this.pool.query('SELECT * FROM vulnerabilidades WHERE software ILIKE $1 ORDER BY cvss_score DESC', [software]);
    return result.rows.map((row) => this.mapRow(row));
  }

  // RF-88: arma el WHERE dinámicamente según qué criterios vengan presentes en
  // el filtro, pero SIEMPRE con parámetros preparados ($1, $2, ...) — nunca se
  // concatena un valor dentro del texto SQL, solo nombres de columna fijos que
  // no dependen de input del usuario.
  async buscarConFiltros(filtro: FiltroVulnerabilidad): Promise<Vulnerabilidad[]> {
    const condiciones: string[] = [];
    const valores: unknown[] = [];

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

    const clausulaWhere = condiciones.length > 0 ? `WHERE ${condiciones.join(' AND ')}` : '';
    const result = await this.pool.query(
      `SELECT * FROM vulnerabilidades ${clausulaWhere} ORDER BY cvss_score DESC`,
      valores
    );
    return result.rows.map((row) => this.mapRow(row));
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
      row.fecha_remediacion ? new Date(row.fecha_remediacion as string) : undefined
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
