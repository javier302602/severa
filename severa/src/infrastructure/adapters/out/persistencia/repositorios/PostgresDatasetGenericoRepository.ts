import { Pool, PoolClient } from 'pg';
import { randomUUID } from 'crypto';
import { DatasetGenerico, DecisionVariableObjetivo } from '../../../../../domain/entities/DatasetGenerico';
import { RegistroDatasetGenerico } from '../../../../../domain/entities/RegistroDatasetGenerico';
import { EntradaDeBitacoraDeDataset, OperacionDeBitacora } from '../../../../../domain/entities/EntradaDeBitacoraDeDataset';
import {
  DatasetGenericoRepository,
  NuevaVersionProcesada,
  OperacionParaBitacora
} from '../../../../../application/ports/out/persistencia/repositorios/DatasetGenericoRepository';
import { CriterioDeClasificacionValue } from '../../../../../domain/shared/value-objects/CriterioDeClasificacion';
import { CorreccionesDeTipo } from '../../../../../domain/services/variable-detection/DetectorDeTipoDeColumna';
import { DatasetGenericoNoEncontradoError } from '../../../../../domain/errors/DatasetGenericoNoEncontradoError';

type Ejecutor = Pick<Pool | PoolClient, 'query'>;

// Mismo tamaño de lote que AnalizarDatasetGenerico.ts: 6 parámetros por fila,
// muy por debajo del tope de 65.535 parámetros de una consulta de Postgres.
const TAMANO_DE_LOTE = 1000;

const COLUMNAS_DE_DATASET = `id, analista_id, nombre_archivo, columnas, fuente, preset, filas_duplicadas, fecha_carga,
  criterio_clasificacion, columna_clave, hash_original_sha256, dataset_original_id, version, version_base,
  tipos_corregidos, variable_objetivo, estado_variable_objetivo, total_filas`;

// Los valores de cada fila se guardan como JSON, y JSON no tiene tipo fecha:
// un Date (una celda de fecha de un .xlsx) se guarda como el texto que
// produce toISOString(). Al leer se devuelve como Date, para que el dataset
// recuperado sea el mismo que se guardó — si no, una columna de fechas de
// Excel volvía como texto y, reabierta, dejaba de detectarse igual que el día
// en que se cargó. El patrón es exactamente el formato de toISOString().
const FECHA_SERIALIZADA = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

function restaurarFechas(valores: Record<string, unknown>): Record<string, unknown> {
  let restaurado: Record<string, unknown> | null = null;
  for (const clave of Object.keys(valores)) {
    const valor = valores[clave];
    if (typeof valor === 'string' && FECHA_SERIALIZADA.test(valor)) {
      const fecha = new Date(valor);
      if (!Number.isNaN(fecha.getTime())) {
        restaurado = restaurado ?? { ...valores };
        restaurado[clave] = fecha;
      }
    }
  }
  return restaurado ?? valores;
}

export class PostgresDatasetGenericoRepository implements DatasetGenericoRepository {
  constructor(private readonly pool: Pool) {}

  async guardar(dataset: DatasetGenerico): Promise<void> {
    await this.insertarDataset(this.pool, dataset);
  }

  private async insertarDataset(ejecutor: Ejecutor, dataset: DatasetGenerico): Promise<void> {
    await ejecutor.query(
      `INSERT INTO datasets_genericos (${COLUMNAS_DE_DATASET})
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)`,
      [
        dataset.id,
        dataset.analistaId,
        dataset.nombreArchivo,
        JSON.stringify(dataset.columnas),
        dataset.fuente,
        dataset.preset,
        dataset.filasDuplicadas,
        dataset.fechaCarga,
        dataset.criterioClasificacion ? JSON.stringify(dataset.criterioClasificacion.toJSON()) : null,
        dataset.columnaClave,
        dataset.hashOriginalSha256,
        dataset.linaje.datasetOriginalId,
        dataset.linaje.version,
        dataset.linaje.versionBase,
        JSON.stringify(dataset.tiposCorregidos),
        dataset.variableObjetivo.columna,
        dataset.variableObjetivo.estado,
        dataset.totalFilas
      ]
    );
  }

  async actualizarCriterioClasificacion(
    id: string,
    analistaId: string,
    criterioClasificacion: CriterioDeClasificacionValue,
    columnaClave: string | null
  ): Promise<void> {
    await this.pool.query(
      `UPDATE datasets_genericos SET criterio_clasificacion = $1, columna_clave = $2 WHERE id = $3 AND analista_id = $4`,
      [JSON.stringify(criterioClasificacion.toJSON()), columnaClave, id, analistaId]
    );
  }

  async actualizarTiposCorregidos(id: string, analistaId: string, tiposCorregidos: CorreccionesDeTipo): Promise<void> {
    await this.pool.query('UPDATE datasets_genericos SET tipos_corregidos = $1 WHERE id = $2 AND analista_id = $3', [
      JSON.stringify(tiposCorregidos),
      id,
      analistaId
    ]);
  }

  async actualizarVariableObjetivo(id: string, analistaId: string, decision: DecisionVariableObjetivo): Promise<void> {
    await this.pool.query(
      'UPDATE datasets_genericos SET variable_objetivo = $1, estado_variable_objetivo = $2 WHERE id = $3 AND analista_id = $4',
      [decision.columna, decision.estado, id, analistaId]
    );
  }

  async guardarRegistros(registros: RegistroDatasetGenerico[]): Promise<void> {
    await this.insertarRegistros(this.pool, registros);
  }

  private async insertarRegistros(ejecutor: Ejecutor, registros: RegistroDatasetGenerico[]): Promise<void> {
    if (registros.length === 0) {
      return;
    }

    const COLUMNAS_POR_FILA = 6;
    const valores: unknown[] = [];
    const placeholders: string[] = [];

    registros.forEach((registro, indice) => {
      const base = indice * COLUMNAS_POR_FILA;
      placeholders.push(`($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5}, $${base + 6})`);
      valores.push(
        registro.id,
        registro.datasetId,
        registro.analistaId,
        JSON.stringify(registro.valores),
        registro.fechaCarga,
        registro.posicion
      );
    });

    await ejecutor.query(
      `INSERT INTO registros_datasets_genericos (id, dataset_id, analista_id, valores, fecha_carga, posicion)
       VALUES ${placeholders.join(', ')}`,
      valores
    );
  }

  async buscarPorId(id: string, analistaId: string): Promise<DatasetGenerico | null> {
    const result = await this.pool.query(`SELECT ${COLUMNAS_DE_DATASET} FROM datasets_genericos WHERE id = $1 AND analista_id = $2`, [
      id,
      analistaId
    ]);
    return result.rows[0] ? this.mapRow(result.rows[0]) : null;
  }

  async listarRegistros(datasetId: string, analistaId: string): Promise<RegistroDatasetGenerico[]> {
    // Por posición (el orden del archivo). Los registros anteriores a la
    // migración 016 no la tienen: van al final, por id, que era el único
    // orden que tenían.
    const result = await this.pool.query(
      `SELECT id, dataset_id, analista_id, valores, fecha_carga, posicion
         FROM registros_datasets_genericos
        WHERE dataset_id = $1 AND analista_id = $2
        ORDER BY posicion ASC NULLS LAST, id ASC`,
      [datasetId, analistaId]
    );
    return result.rows.map(
      (row) =>
        new RegistroDatasetGenerico(
          String(row.id),
          String(row.dataset_id),
          String(row.analista_id),
          restaurarFechas(row.valores),
          new Date(row.fecha_carga),
          row.posicion === null || row.posicion === undefined ? null : Number(row.posicion)
        )
    );
  }

  async listarTodos(analistaId: string): Promise<DatasetGenerico[]> {
    const result = await this.pool.query(
      `SELECT ${COLUMNAS_DE_DATASET} FROM datasets_genericos
        WHERE analista_id = $1
        ORDER BY fecha_carga DESC, id ASC`,
      [analistaId]
    );
    return result.rows.map((row) => this.mapRow(row));
  }

  async listarVersiones(datasetOriginalId: string, analistaId: string): Promise<DatasetGenerico[]> {
    const result = await this.pool.query(
      `SELECT ${COLUMNAS_DE_DATASET} FROM datasets_genericos
        WHERE analista_id = $2 AND (id = $1 OR dataset_original_id = $1)
        ORDER BY version ASC`,
      [datasetOriginalId, analistaId]
    );
    return result.rows.map((row) => this.mapRow(row));
  }

  async crearVersionProcesada(nueva: NuevaVersionProcesada): Promise<DatasetGenerico> {
    const { base } = nueva;
    const originalId = base.idDelOriginal;
    const client = await this.pool.connect();

    try {
      await client.query('BEGIN');

      // Bloquea la cabecera del original mientras dura la transacción: dos
      // limpiezas simultáneas de la misma familia se ordenan una detrás de la
      // otra y reciben números de versión distintos. De paso confirma que el
      // original sigue existiendo y es de este analista.
      const original = await client.query('SELECT id FROM datasets_genericos WHERE id = $1 AND analista_id = $2 FOR UPDATE', [
        originalId,
        base.analistaId
      ]);
      if (original.rowCount === 0) {
        throw new DatasetGenericoNoEncontradoError();
      }

      const ultima = await client.query(
        'SELECT COALESCE(MAX(version), 0) AS ultima FROM datasets_genericos WHERE dataset_original_id = $1 AND analista_id = $2',
        [originalId, base.analistaId]
      );
      const version = Number(ultima.rows[0].ultima) + 1;

      // Qué hereda la versión nueva de su base lo decide la entidad.
      const dataset = base.derivarVersionProcesada({
        id: randomUUID(),
        version,
        columnas: nueva.columnas,
        totalFilas: nueva.filas.length,
        filasDuplicadas: nueva.filasDuplicadas,
        tiposCorregidos: nueva.tiposCorregidos,
        fecha: nueva.fecha
      });
      await this.insertarDataset(client, dataset);

      for (let inicio = 0; inicio < nueva.filas.length; inicio += TAMANO_DE_LOTE) {
        const lote = nueva.filas
          .slice(inicio, inicio + TAMANO_DE_LOTE)
          .map(
            (valores, indice) =>
              new RegistroDatasetGenerico(randomUUID(), dataset.id, dataset.analistaId, valores, nueva.fecha, inicio + indice)
          );
        await this.insertarRegistros(client, lote);
      }

      await this.insertarBitacora(client, originalId, base.analistaId, nueva.operaciones, nueva.fecha, base.version, version);

      await client.query('COMMIT');
      return dataset;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async registrarEnBitacora(dataset: DatasetGenerico, operaciones: OperacionParaBitacora[], fecha: Date): Promise<void> {
    await this.insertarBitacora(this.pool, dataset.idDelOriginal, dataset.analistaId, operaciones, fecha, dataset.version, null);
  }

  private async insertarBitacora(
    ejecutor: Ejecutor,
    datasetOriginalId: string,
    analistaId: string,
    operaciones: OperacionParaBitacora[],
    fecha: Date,
    versionOrigen: number,
    versionResultado: number | null
  ): Promise<void> {
    if (operaciones.length === 0) {
      return;
    }

    const COLUMNAS_POR_FILA = 12;
    const valores: unknown[] = [];
    const placeholders: string[] = [];

    operaciones.forEach((operacion, indice) => {
      const base = indice * COLUMNAS_POR_FILA;
      placeholders.push(`(${Array.from({ length: COLUMNAS_POR_FILA }, (_, i) => `$${base + i + 1}`).join(', ')})`);
      valores.push(
        randomUUID(),
        datasetOriginalId,
        analistaId,
        fecha,
        indice,
        operacion.operacion,
        operacion.variable,
        operacion.registrosAfectados,
        operacion.metodo,
        versionOrigen,
        versionResultado,
        JSON.stringify(operacion.detalle ?? {})
      );
    });

    await ejecutor.query(
      `INSERT INTO bitacora_datasets
         (id, dataset_original_id, analista_id, fecha, secuencia, operacion, variable, registros_afectados, metodo, version_origen, version_resultado, detalle)
       VALUES ${placeholders.join(', ')}`,
      valores
    );
  }

  async listarBitacora(datasetOriginalId: string, analistaId: string): Promise<EntradaDeBitacoraDeDataset[]> {
    const result = await this.pool.query(
      `SELECT b.*, a.nombre AS nombre_analista
         FROM bitacora_datasets b
         LEFT JOIN analistas a ON a.id = b.analista_id
        WHERE b.dataset_original_id = $1 AND b.analista_id = $2
        ORDER BY b.fecha ASC, b.secuencia ASC, b.id ASC`,
      [datasetOriginalId, analistaId]
    );
    return result.rows.map(
      (row) =>
        new EntradaDeBitacoraDeDataset(
          String(row.id),
          String(row.dataset_original_id),
          String(row.analista_id),
          new Date(row.fecha),
          Number(row.secuencia),
          row.operacion as OperacionDeBitacora,
          row.variable === null ? null : String(row.variable),
          Number(row.registros_afectados),
          String(row.metodo),
          Number(row.version_origen),
          row.version_resultado === null ? null : Number(row.version_resultado),
          (row.detalle ?? {}) as Record<string, unknown>,
          row.nombre_analista === null || row.nombre_analista === undefined ? null : String(row.nombre_analista)
        )
    );
  }

  private mapRow(row: Record<string, unknown>): DatasetGenerico {
    const opcional = (valor: unknown): string | null => (valor === null || valor === undefined ? null : String(valor));
    const numeroOpcional = (valor: unknown): number | null => (valor === null || valor === undefined ? null : Number(valor));

    const columnaObjetivo = opcional(row.variable_objetivo);
    const variableObjetivo: DecisionVariableObjetivo =
      row.estado_variable_objetivo === 'confirmada' && columnaObjetivo !== null
        ? { estado: 'confirmada', columna: columnaObjetivo }
        : { estado: row.estado_variable_objetivo === 'rechazada' ? 'rechazada' : 'pendiente', columna: null };

    return new DatasetGenerico(
      String(row.id),
      String(row.analista_id),
      String(row.nombre_archivo),
      row.columnas as string[],
      String(row.fuente),
      opcional(row.preset),
      Number(row.filas_duplicadas),
      new Date(row.fecha_carga as string),
      row.criterio_clasificacion
        ? CriterioDeClasificacionValue.desdeJSON(row.criterio_clasificacion as ReturnType<CriterioDeClasificacionValue['toJSON']>)
        : null,
      opcional(row.columna_clave),
      opcional(row.hash_original_sha256),
      {
        datasetOriginalId: opcional(row.dataset_original_id),
        version: Number(row.version ?? 0),
        versionBase: numeroOpcional(row.version_base)
      },
      (row.tipos_corregidos ?? {}) as CorreccionesDeTipo,
      variableObjetivo,
      numeroOpcional(row.total_filas)
    );
  }
}
