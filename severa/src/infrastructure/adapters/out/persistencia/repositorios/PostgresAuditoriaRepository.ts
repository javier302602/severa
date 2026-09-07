import { Pool } from 'pg';
import { randomUUID } from 'crypto';
import { RegistroAuditoria } from '../../../../../domain/entities/RegistroAuditoria';
import { AuditoriaRepository } from '../../../../../application/ports/out/persistencia/repositorios/AuditoriaRepository';

export class PostgresAuditoriaRepository implements AuditoriaRepository {
  constructor(private readonly pool: Pool) {}

  async registrar(input: { usuario: string; accion: string; detalle: string; ip?: string | null }): Promise<void> {
    await this.pool.query(
      'INSERT INTO registros_auditoria (id, usuario, accion, detalle, ip) VALUES ($1, $2, $3, $4, $5)',
      [randomUUID(), input.usuario, input.accion, input.detalle, input.ip ?? null]
    );
  }

  async listar(): Promise<RegistroAuditoria[]> {
    const result = await this.pool.query('SELECT * FROM registros_auditoria ORDER BY fecha_hora DESC');
    return result.rows.map(
      (row) => new RegistroAuditoria(row.id, row.usuario, row.accion, row.detalle, new Date(row.fecha_hora), row.ip)
    );
  }
}
