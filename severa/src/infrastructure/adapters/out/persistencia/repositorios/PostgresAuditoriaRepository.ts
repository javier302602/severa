import { Pool } from 'pg';
import { randomUUID } from 'crypto';
import { RegistroAuditoria } from '../../../../../domain/entities/RegistroAuditoria';
import { AuditoriaRepository, FiltroDeAuditoria } from '../../../../../application/ports/out/persistencia/repositorios/AuditoriaRepository';

export class PostgresAuditoriaRepository implements AuditoriaRepository {
  constructor(private readonly pool: Pool) {}

  async registrar(input: { usuario: string; accion: string; detalle: string; ip?: string | null; datasetId?: string | null }): Promise<void> {
    await this.pool.query(
      'INSERT INTO registros_auditoria (id, usuario, accion, detalle, ip, dataset_id) VALUES ($1, $2, $3, $4, $5, $6)',
      [randomUUID(), input.usuario, input.accion, input.detalle, input.ip ?? null, input.datasetId ?? null]
    );
  }

  async listar(filtro: FiltroDeAuditoria = {}): Promise<RegistroAuditoria[]> {
    // RF-138: los registros guardan el id del original. Si llega el id de una
    // versión procesada se lo traduce al de su original (mientras el dataset
    // exista); si no, se compara tal cual — la auditoría sobrevive al dataset,
    // así que no se exige que siga existiendo.
    const result =
      filtro.datasetId === undefined
        ? await this.pool.query('SELECT * FROM registros_auditoria ORDER BY fecha_hora DESC')
        : await this.pool.query(
            `SELECT * FROM registros_auditoria
              WHERE dataset_id = $1
                 OR dataset_id = (SELECT dataset_original_id FROM datasets_genericos WHERE id = $1)
              ORDER BY fecha_hora DESC`,
            [filtro.datasetId]
          );
    return result.rows.map(
      (row) =>
        new RegistroAuditoria(row.id, row.usuario, row.accion, row.detalle, new Date(row.fecha_hora), row.ip, row.dataset_id ?? null)
    );
  }
}
