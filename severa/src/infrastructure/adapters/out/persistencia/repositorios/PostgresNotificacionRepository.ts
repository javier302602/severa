import { Pool } from 'pg';
import { Notificacion, TipoNotificacion } from '../../../../../domain/entities/Notificacion';
import {
  ConteoDeNotificaciones,
  NotificacionRepository,
  PaginaDeNotificaciones
} from '../../../../../application/ports/out/persistencia/repositorios/NotificacionRepository';

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

  async listarPorAnalista(analistaId: string, pagina?: PaginaDeNotificaciones): Promise<Notificacion[]> {
    // "id" desempata las que comparten fecha: sin un orden total, dos
    // páginas consecutivas podrían repetir o saltear una notificación.
    const orden = 'ORDER BY fecha DESC, id DESC';
    const result = pagina
      ? await this.pool.query(`SELECT * FROM notificaciones WHERE destinatario = $1 ${orden} LIMIT $2 OFFSET $3`, [
          analistaId,
          pagina.limite,
          pagina.desplazamiento
        ])
      : await this.pool.query(`SELECT * FROM notificaciones WHERE destinatario = $1 ${orden}`, [analistaId]);
    return result.rows.map((row) => this.mapRow(row));
  }

  async contarPorAnalista(analistaId: string): Promise<ConteoDeNotificaciones> {
    const result = await this.pool.query(
      `SELECT count(*)::int AS total, (count(*) FILTER (WHERE leida = FALSE))::int AS no_leidas
         FROM notificaciones WHERE destinatario = $1`,
      [analistaId]
    );
    return { total: Number(result.rows[0].total), noLeidas: Number(result.rows[0].no_leidas) };
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

  async eliminarLeidas(analistaId: string): Promise<number> {
    const result = await this.pool.query('DELETE FROM notificaciones WHERE destinatario = $1 AND leida = TRUE', [analistaId]);
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
