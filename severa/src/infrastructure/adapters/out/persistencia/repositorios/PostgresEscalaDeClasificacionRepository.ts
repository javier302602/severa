import { Pool } from 'pg';
import { EscalaDeClasificacionRepository } from '../../../../../application/ports/out/persistencia/repositorios/EscalaDeClasificacionRepository';
import { EscalaDeClasificacion } from '../../../../../domain/shared/value-objects/EscalaDeClasificacion';

// RF-28 / RF-69, migración 019. NUMERIC llega de pg como texto: se convierte
// a número acá.
export class PostgresEscalaDeClasificacionRepository implements EscalaDeClasificacionRepository {
  constructor(private readonly pool: Pool) {}

  async obtener(analistaId: string): Promise<EscalaDeClasificacion | null> {
    const resultado = await this.pool.query<{ corte_moderado: string; corte_alto: string; corte_critico: string }>(
      'SELECT corte_moderado, corte_alto, corte_critico FROM escalas_clasificacion WHERE analista_id = $1',
      [analistaId]
    );
    const fila = resultado.rows[0];
    if (!fila) return null;
    return EscalaDeClasificacion.personalizada({
      moderado: Number(fila.corte_moderado),
      alto: Number(fila.corte_alto),
      critico: Number(fila.corte_critico)
    });
  }

  async guardar(analistaId: string, escala: EscalaDeClasificacion): Promise<void> {
    const { moderado, alto, critico } = escala.cortes;
    await this.pool.query(
      `INSERT INTO escalas_clasificacion (analista_id, corte_moderado, corte_alto, corte_critico, actualizado_en)
       VALUES ($1, $2, $3, $4, now())
       ON CONFLICT (analista_id) DO UPDATE
         SET corte_moderado = EXCLUDED.corte_moderado,
             corte_alto = EXCLUDED.corte_alto,
             corte_critico = EXCLUDED.corte_critico,
             actualizado_en = now()`,
      [analistaId, moderado, alto, critico]
    );
  }

  async eliminar(analistaId: string): Promise<void> {
    await this.pool.query('DELETE FROM escalas_clasificacion WHERE analista_id = $1', [analistaId]);
  }
}
