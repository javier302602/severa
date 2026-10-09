import { AbrirDatasetGenericoUseCase, DatasetAbierto } from '../../ports/in/module_carga_gestion_datasets/DatasetsGenericosUseCases';
import { DatasetGenericoRepository } from '../../ports/out/persistencia/repositorios/DatasetGenericoRepository';
import { SesionAnalisisStore } from '../../ports/out/dataset/SesionAnalisisStore';
import { DatasetGenericoNoEncontradoError } from '../../../domain/errors/DatasetGenericoNoEncontradoError';
import { analizarDataset } from '../../../domain/services/data-cleaning/CalidadDeDatosGenerico';
import { calcularEstadisticasDescriptivas } from '../../../domain/services/descriptive-statistics/EstadisticasDescriptivasGenerico';

// RF-136 (M-12): recuperar una versión. Lee de la base el dataset indicado
// —el original o cualquier versión procesada— y lo deja en una sesión de
// análisis nueva, con los tipos de variable que el analista había corregido.
// Es solo lectura sobre lo guardado: ni el dataset ni sus registros cambian.
export class AbrirDatasetGenerico implements AbrirDatasetGenericoUseCase {
  constructor(
    private readonly datasetGenericoRepository: DatasetGenericoRepository,
    private readonly sesionAnalisisStore: SesionAnalisisStore
  ) {}

  async ejecutar(analistaId: string, datasetId: string): Promise<DatasetAbierto> {
    const dataset = await this.datasetGenericoRepository.buscarPorId(datasetId, analistaId);
    if (!dataset) {
      throw new DatasetGenericoNoEncontradoError();
    }

    const registros = await this.datasetGenericoRepository.listarRegistros(dataset.id, analistaId);
    const filas = registros.map((registro) => registro.valores);

    // Solo las correcciones cuyas columnas existen en ESTA versión.
    const tiposCorregidos = Object.fromEntries(
      Object.entries(dataset.tiposCorregidos).filter(([columna]) => dataset.columnas.includes(columna))
    );

    const sesionId = this.sesionAnalisisStore.crear(analistaId, {
      columnas: dataset.columnas,
      filas,
      datasetId: dataset.id,
      tiposCorregidos
    });

    return {
      sesionId,
      datasetId: dataset.id,
      datasetOriginalId: dataset.idDelOriginal,
      nombreArchivo: dataset.nombreArchivo,
      version: dataset.version,
      versionBase: dataset.linaje.versionBase,
      diagnostico: analizarDataset(dataset.columnas, filas, tiposCorregidos),
      perfilVariables: calcularEstadisticasDescriptivas(dataset.columnas, filas, tiposCorregidos),
      tiposCorregidos,
      variableObjetivo: dataset.variableObjetivo
    };
  }
}
