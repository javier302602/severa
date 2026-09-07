import { Pool } from 'pg';
import { DatasetGenerico } from '../../../../../domain/entities/DatasetGenerico';
import { RegistroDatasetGenerico } from '../../../../../domain/entities/RegistroDatasetGenerico';
import { DatasetGenericoRepository } from '../../../../../application/ports/out/persistencia/repositorios/DatasetGenericoRepository';

export class PostgresDatasetGenericoRepository implements DatasetGenericoRepository {
  constructor(private readonly pool: Pool) {}

  async guardar(dataset: DatasetGenerico): Promise<void> {
    await this.pool.query(
      `INSERT INTO datasets_genericos (id, analista_id, nombre_archivo, columnas, fuente, preset, filas_duplicadas, fecha_carga)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        dataset.id,
        dataset.analistaId,
        dataset.nombreArchivo,
        JSON.stringify(dataset.columnas),
        dataset.fuente,
        dataset.preset,
        dataset.filasDuplicadas,
        dataset.fechaCarga
      ]
    );
  }

  async guardarRegistros(registros: RegistroDatasetGenerico[]): Promise<void> {
    if (registros.length === 0) {
      return;
    }

    const COLUMNAS_POR_FILA = 5;
    const valores: unknown[] = [];
    const placeholders: string[] = [];

    registros.forEach((registro, indice) => {
      const base = indice * COLUMNAS_POR_FILA;
      placeholders.push(`($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5})`);
      valores.push(registro.id, registro.datasetId, registro.analistaId, JSON.stringify(registro.valores), registro.fechaCarga);
    });

    await this.pool.query(
      `INSERT INTO registros_datasets_genericos (id, dataset_id, analista_id, valores, fecha_carga)
       VALUES ${placeholders.join(', ')}`,
      valores
    );
  }

  async buscarPorId(id: string, analistaId: string): Promise<DatasetGenerico | null> {
    const result = await this.pool.query(
      'SELECT * FROM datasets_genericos WHERE id = $1 AND analista_id = $2',
      [id, analistaId]
    );
    return result.rows[0] ? this.mapRow(result.rows[0]) : null;
  }

  async listarRegistros(datasetId: string, analistaId: string): Promise<RegistroDatasetGenerico[]> {
    const result = await this.pool.query(
      'SELECT * FROM registros_datasets_genericos WHERE dataset_id = $1 AND analista_id = $2 ORDER BY id',
      [datasetId, analistaId]
    );
    return result.rows.map(
      (row) => new RegistroDatasetGenerico(String(row.id), String(row.dataset_id), String(row.analista_id), row.valores, new Date(row.fecha_carga))
    );
  }

  private mapRow(row: Record<string, unknown>): DatasetGenerico {
    return new DatasetGenerico(
      String(row.id),
      String(row.analista_id),
      String(row.nombre_archivo),
      row.columnas as string[],
      String(row.fuente),
      row.preset === null || row.preset === undefined ? null : String(row.preset),
      Number(row.filas_duplicadas),
      new Date(row.fecha_carga as string)
    );
  }
}
