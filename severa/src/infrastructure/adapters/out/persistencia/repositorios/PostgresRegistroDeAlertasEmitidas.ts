import { Pool } from 'pg';
import { RegistroDeAlertasEmitidas } from '../../../../../application/ports/out/notificaciones/RegistroDeAlertasEmitidas';
import { TipoDeAlertaDePlazo } from '../../../../../domain/services/notificaciones/AlertasDePlazo';

// Cuántos ids se mandan por consulta. Un catálogo puede tener cientos de
// miles de vulnerabilidades vencidas; un único arreglo de ese tamaño como
// parámetro es legal pero innecesariamente pesado.
const TAMANO_DE_LOTE = 5000;

// vulnerabilidades.id es SERIAL: solo se aceptan ids que sean un entero
// positivo que entre en un INTEGER de Postgres.
function aIdsNumericos(ids: string[]): number[] {
  return ids.filter((id) => /^\d{1,9}$/.test(id)).map(Number);
}

export class PostgresRegistroDeAlertasEmitidas implements RegistroDeAlertasEmitidas {
  constructor(private readonly pool: Pool) {}

  async registrarNuevas(analistaId: string, tipo: TipoDeAlertaDePlazo, vulnerabilidadIds: string[]): Promise<string[]> {
    const ids = aIdsNumericos(vulnerabilidadIds);
    const nuevas: string[] = [];

    for (let inicio = 0; inicio < ids.length; inicio += TAMANO_DE_LOTE) {
      // Se inserta a partir de la propia tabla de vulnerabilidades, no del
      // arreglo recibido: así un id que no existe (o que es de otro analista)
      // simplemente no entra, en vez de romper la consulta por la clave
      // foránea. ON CONFLICT DO NOTHING + RETURNING devuelve solo las filas
      // que esta consulta insertó.
      const resultado = await this.pool.query(
        `INSERT INTO alertas_emitidas (analista_id, tipo, vulnerabilidad_id)
         SELECT v.analista_id, $2, v.id
           FROM vulnerabilidades v
          WHERE v.analista_id = $1 AND v.id = ANY($3::int[])
         ON CONFLICT DO NOTHING
         RETURNING vulnerabilidad_id`,
        [analistaId, tipo, ids.slice(inicio, inicio + TAMANO_DE_LOTE)]
      );
      resultado.rows.forEach((fila) => nuevas.push(String(fila.vulnerabilidad_id)));
    }

    return nuevas;
  }

  async olvidar(analistaId: string, tipo: TipoDeAlertaDePlazo, vulnerabilidadIds: string[]): Promise<void> {
    const ids = aIdsNumericos(vulnerabilidadIds);
    for (let inicio = 0; inicio < ids.length; inicio += TAMANO_DE_LOTE) {
      await this.pool.query('DELETE FROM alertas_emitidas WHERE analista_id = $1 AND tipo = $2 AND vulnerabilidad_id = ANY($3::int[])', [
        analistaId,
        tipo,
        ids.slice(inicio, inicio + TAMANO_DE_LOTE)
      ]);
    }
  }
}
