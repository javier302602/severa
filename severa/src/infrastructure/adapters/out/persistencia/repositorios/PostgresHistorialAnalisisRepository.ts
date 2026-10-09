import { Pool } from 'pg';
import { AnalisisRealizado } from '../../../../../domain/entities/AnalisisRealizado';
import { HistorialAnalisisRepository } from '../../../../../application/ports/out/persistencia/repositorios/HistorialAnalisisRepository';
import { Paginacion } from '../../../../../application/ports/out/persistencia/repositorios/VulnerabilidadRepository';

export class PostgresHistorialAnalisisRepository implements HistorialAnalisisRepository {
  constructor(private readonly pool: Pool) {}

  async registrar(analisis: AnalisisRealizado): Promise<void> {
    await this.pool.query(
      `INSERT INTO analisis_realizados (id, analista_id, tipo_evento, payload, fecha_hora)
       VALUES ($1, $2, $3, $4, $5)`,
      [analisis.id, analisis.analistaId, analisis.tipoEvento, JSON.stringify(analisis.payload), analisis.fechaHora]
    );
  }

  async registrarSiEsNuevo(analisis: AnalisisRealizado): Promise<boolean> {
    const result = await this.pool.query(
      `INSERT INTO analisis_realizados (id, analista_id, tipo_evento, payload, fecha_hora)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (id) DO NOTHING`,
      [analisis.id, analisis.analistaId, analisis.tipoEvento, JSON.stringify(analisis.payload), analisis.fechaHora]
    );
    return (result.rowCount ?? 0) > 0;
  }

  // El id desempata dos eventos con la misma fecha: sin eso, el orden entre
  // ellos no está definido y una fila podría repetirse o saltearse entre dos
  // páginas.
  async listarPorAnalista(analistaId: string, paginacion?: Paginacion): Promise<AnalisisRealizado[]> {
    const condiciones = 'WHERE analista_id = $1 ORDER BY fecha_hora DESC, id DESC';
    const query = paginacion
      ? `SELECT * FROM analisis_realizados ${condiciones} LIMIT $2 OFFSET $3`
      : `SELECT * FROM analisis_realizados ${condiciones}`;
    const params = paginacion ? [analistaId, paginacion.limite, paginacion.offset] : [analistaId];

    const result = await this.pool.query(query, params);
    return result.rows.map((row) => this.mapRow(row));
  }

  async contarPorAnalista(analistaId: string): Promise<number> {
    const result = await this.pool.query('SELECT COUNT(*)::int AS total FROM analisis_realizados WHERE analista_id = $1', [analistaId]);
    return result.rows[0].total;
  }

  private mapRow(row: {
    id: string;
    analista_id: string;
    tipo_evento: string;
    payload: Record<string, unknown>;
    fecha_hora: Date;
  }): AnalisisRealizado {
    return new AnalisisRealizado(row.id, row.analista_id, row.tipo_evento, row.payload, new Date(row.fecha_hora));
  }
}
