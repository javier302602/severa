import { Pool } from 'pg';
import { Notificacion, TipoNotificacion } from '../../../../domain/entities/Notificacion';
import { NotificacionRepository } from '../../../../application/ports/out/NotificacionRepository';

export class PostgresNotificacionRepository implements NotificacionRepository {
  constructor(private readonly pool: Pool) {}

  async guardar(notificacion: Notificacion): Promise<void> {
    await this.pool.query(
      `INSERT INTO notificaciones (id, tipo, destinatario, leida, fecha, mensaje)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        notificacion.id,
        notificacion.tipo,
        notificacion.destinatario,
        notificacion.leida,
        notificacion.fecha,
        notificacion.mensaje
      ]
    );
  }

  async listarPorAnalista(analistaId: string): Promise<Notificacion[]> {
    const result = await this.pool.query(
      'SELECT * FROM notificaciones WHERE destinatario = $1 ORDER BY fecha DESC',
      [analistaId]
    );
    return result.rows.map((row) => this.mapRow(row));
  }

  async marcarComoLeida(id: string, analistaId: string): Promise<boolean> {
    const result = await this.pool.query(
      'UPDATE notificaciones SET leida = TRUE WHERE id = $1 AND destinatario = $2',
      [id, analistaId]
    );
    return (result.rowCount ?? 0) > 0;
  }

  async marcarTodasComoLeidas(analistaId: string): Promise<number> {
    const result = await this.pool.query(
      'UPDATE notificaciones SET leida = TRUE WHERE destinatario = $1 AND leida = FALSE',
      [analistaId]
    );
    return result.rowCount ?? 0;
  }

  async eliminarVarias(ids: string[], analistaId: string): Promise<number> {
    if (ids.length === 0) {
      return 0;
    }
    const result = await this.pool.query(
      'DELETE FROM notificaciones WHERE id = ANY($1) AND destinatario = $2',
      [ids, analistaId]
    );
    return result.rowCount ?? 0;
  }

  private mapRow(row: {
    id: string;
    tipo: TipoNotificacion;
    destinatario: string;
    leida: boolean;
    fecha: Date;
    mensaje: string;
  }): Notificacion {
    return new Notificacion(row.id, row.tipo, row.destinatario, row.leida, new Date(row.fecha), row.mensaje);
  }
}
