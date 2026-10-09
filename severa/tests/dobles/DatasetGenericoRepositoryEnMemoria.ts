import { randomUUID } from 'crypto';
import {
  DatasetGenericoRepository,
  NuevaVersionProcesada,
  OperacionParaBitacora
} from '../../src/application/ports/out/persistencia/repositorios/DatasetGenericoRepository';
import { DatasetGenerico, DecisionVariableObjetivo } from '../../src/domain/entities/DatasetGenerico';
import { RegistroDatasetGenerico } from '../../src/domain/entities/RegistroDatasetGenerico';
import { EntradaDeBitacoraDeDataset } from '../../src/domain/entities/EntradaDeBitacoraDeDataset';
import { CriterioDeClasificacionValue } from '../../src/domain/shared/value-objects/CriterioDeClasificacion';
import { CorreccionesDeTipo } from '../../src/domain/services/variable-detection/DetectorDeTipoDeColumna';
import { DatasetGenericoNoEncontradoError } from '../../src/domain/errors/DatasetGenericoNoEncontradoError';

// Doble de prueba del repositorio de datasets genéricos: guarda en memoria y
// respeta las mismas reglas observables que PostgresDatasetGenericoRepository
// (todo acotado por analista, numeración de versiones por familia, bitácora
// en orden). Lo usan los tests de los casos de uso de M-14/M-15 Ronda 2, que
// necesitan encadenar varias operaciones sobre el mismo dataset; que el
// repositorio real cumpla esas reglas contra una base de verdad se prueba en
// tests/integration/PostgresDatasetGenericoRepository.integration.test.ts.
export class DatasetGenericoRepositoryEnMemoria implements DatasetGenericoRepository {
  readonly datasets = new Map<string, DatasetGenerico>();
  readonly registros: RegistroDatasetGenerico[] = [];
  readonly bitacora: EntradaDeBitacoraDeDataset[] = [];

  async guardar(dataset: DatasetGenerico): Promise<void> {
    this.datasets.set(dataset.id, dataset);
  }

  async guardarRegistros(registros: RegistroDatasetGenerico[]): Promise<void> {
    this.registros.push(...registros);
  }

  async buscarPorId(id: string, analistaId: string): Promise<DatasetGenerico | null> {
    const dataset = this.datasets.get(id);
    return dataset && dataset.analistaId === analistaId ? dataset : null;
  }

  async listarRegistros(datasetId: string, analistaId: string): Promise<RegistroDatasetGenerico[]> {
    return this.registros
      .filter((registro) => registro.datasetId === datasetId && registro.analistaId === analistaId)
      .sort((a, b) => (a.posicion ?? Infinity) - (b.posicion ?? Infinity));
  }

  async actualizarCriterioClasificacion(
    id: string,
    analistaId: string,
    criterioClasificacion: CriterioDeClasificacionValue,
    columnaClave: string | null
  ): Promise<void> {
    this.reemplazar(id, analistaId, (dataset) => dataset.conConfiguracion({ criterioClasificacion, columnaClave }));
  }

  async actualizarTiposCorregidos(id: string, analistaId: string, tiposCorregidos: CorreccionesDeTipo): Promise<void> {
    this.reemplazar(id, analistaId, (dataset) => dataset.conConfiguracion({ tiposCorregidos: { ...tiposCorregidos } }));
  }

  async actualizarVariableObjetivo(id: string, analistaId: string, decision: DecisionVariableObjetivo): Promise<void> {
    this.reemplazar(id, analistaId, (dataset) => dataset.conConfiguracion({ variableObjetivo: decision }));
  }

  async listarTodos(analistaId: string): Promise<DatasetGenerico[]> {
    return [...this.datasets.values()]
      .filter((dataset) => dataset.analistaId === analistaId)
      .sort((a, b) => b.fechaCarga.getTime() - a.fechaCarga.getTime());
  }

  async listarVersiones(datasetOriginalId: string, analistaId: string): Promise<DatasetGenerico[]> {
    return [...this.datasets.values()]
      .filter((dataset) => dataset.analistaId === analistaId && dataset.idDelOriginal === datasetOriginalId)
      .sort((a, b) => a.version - b.version);
  }

  async crearVersionProcesada(nueva: NuevaVersionProcesada): Promise<DatasetGenerico> {
    const { base } = nueva;
    const familia = await this.listarVersiones(base.idDelOriginal, base.analistaId);
    if (!familia.some((dataset) => dataset.esOriginal)) {
      throw new DatasetGenericoNoEncontradoError();
    }
    const version = Math.max(...familia.map((dataset) => dataset.version)) + 1;

    const dataset = base.derivarVersionProcesada({
      id: randomUUID(),
      version,
      columnas: nueva.columnas,
      totalFilas: nueva.filas.length,
      filasDuplicadas: nueva.filasDuplicadas,
      tiposCorregidos: nueva.tiposCorregidos,
      fecha: nueva.fecha
    });
    this.datasets.set(dataset.id, dataset);
    this.registros.push(
      ...nueva.filas.map((valores, posicion) => new RegistroDatasetGenerico(randomUUID(), dataset.id, dataset.analistaId, valores, nueva.fecha, posicion))
    );
    this.anotar(base.idDelOriginal, base.analistaId, nueva.operaciones, nueva.fecha, base.version, version);

    return dataset;
  }

  async registrarEnBitacora(dataset: DatasetGenerico, operaciones: OperacionParaBitacora[], fecha: Date): Promise<void> {
    this.anotar(dataset.idDelOriginal, dataset.analistaId, operaciones, fecha, dataset.version, null);
  }

  async listarBitacora(datasetOriginalId: string, analistaId: string): Promise<EntradaDeBitacoraDeDataset[]> {
    return this.bitacora.filter((entrada) => entrada.datasetOriginalId === datasetOriginalId && entrada.analistaId === analistaId);
  }

  private reemplazar(id: string, analistaId: string, cambio: (dataset: DatasetGenerico) => DatasetGenerico): void {
    const dataset = this.datasets.get(id);
    // Igual que un UPDATE ... WHERE id = $1 AND analista_id = $2: si no es
    // de este analista, no cambia nada.
    if (dataset && dataset.analistaId === analistaId) {
      this.datasets.set(id, cambio(dataset));
    }
  }

  private anotar(
    datasetOriginalId: string,
    analistaId: string,
    operaciones: OperacionParaBitacora[],
    fecha: Date,
    versionOrigen: number,
    versionResultado: number | null
  ): void {
    operaciones.forEach((operacion, secuencia) => {
      this.bitacora.push(
        new EntradaDeBitacoraDeDataset(
          randomUUID(),
          datasetOriginalId,
          analistaId,
          fecha,
          secuencia,
          operacion.operacion,
          operacion.variable,
          operacion.registrosAfectados,
          operacion.metodo,
          versionOrigen,
          versionResultado,
          operacion.detalle ?? {}
        )
      );
    });
  }
}

// Carga un dataset original y le abre una sesión, como lo deja
// AnalizarDatasetGenerico después de subir un archivo.
export async function cargarDatasetDePrueba(
  repositorio: DatasetGenericoRepositoryEnMemoria,
  store: { crear(analistaId: string, datos: { columnas: string[]; filas: Array<Record<string, unknown>>; datasetId?: string }): string },
  opciones: { analistaId?: string; nombreArchivo?: string; columnas: Record<string, unknown[]>; fechaCarga?: Date }
): Promise<{ datasetId: string; sesionId: string; columnas: string[]; filas: Array<Record<string, unknown>> }> {
  const analistaId = opciones.analistaId ?? 'analista-A';
  const columnas = Object.keys(opciones.columnas);
  const largo = opciones.columnas[columnas[0]].length;
  const filas = Array.from({ length: largo }, (_, i) => Object.fromEntries(columnas.map((columna) => [columna, opciones.columnas[columna][i]])));

  const datasetId = randomUUID();
  await repositorio.guardar(
    new DatasetGenerico(
      datasetId,
      analistaId,
      opciones.nombreArchivo ?? 'encuesta.csv',
      columnas,
      'archivo',
      null,
      0,
      opciones.fechaCarga ?? new Date('2026-03-01T10:00:00Z'),
      null,
      null,
      'hash-del-archivo',
      undefined,
      undefined,
      undefined,
      filas.length
    )
  );
  await repositorio.guardarRegistros(filas.map((valores, posicion) => new RegistroDatasetGenerico(randomUUID(), datasetId, analistaId, valores, new Date(), posicion)));
  const sesionId = store.crear(analistaId, { columnas, filas, datasetId });

  return { datasetId, sesionId, columnas, filas };
}
