import { DatasetExportado, ExportarDatasetGenericoUseCase } from '../../ports/in/module_carga_gestion_datasets/ExportarDatasetGenericoUseCase';
import { DatasetGenericoRepository } from '../../ports/out/persistencia/repositorios/DatasetGenericoRepository';
import { DatasetGenericoNoEncontradoError } from '../../../domain/errors/DatasetGenericoNoEncontradoError';
import { construirExcelDeDatasetGenerico } from '../../../infrastructure/adapters/out/dataset/parsers/ExportadorDatasetGenerico';

export class ExportarDatasetGenerico implements ExportarDatasetGenericoUseCase {
  constructor(private readonly datasetGenericoRepository: DatasetGenericoRepository) {}

  async ejecutar(datasetId: string, analistaId: string): Promise<DatasetExportado> {
    const dataset = await this.datasetGenericoRepository.buscarPorId(datasetId, analistaId);
    if (!dataset) {
      throw new DatasetGenericoNoEncontradoError();
    }

    const registros = await this.datasetGenericoRepository.listarRegistros(datasetId, analistaId);
    const filas = registros.map((registro) => registro.valores);

    return {
      contenido: construirExcelDeDatasetGenerico(dataset.columnas, filas),
      datasetOriginalId: dataset.idDelOriginal,
      nombreArchivo: dataset.nombreArchivo,
      version: dataset.version,
      totalFilas: filas.length
    };
  }
}
