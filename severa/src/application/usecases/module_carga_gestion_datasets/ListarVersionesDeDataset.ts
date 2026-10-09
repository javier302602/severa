import { ListarVersionesDeDatasetUseCase, ResumenDeVersion } from '../../ports/in/module_carga_gestion_datasets/DatasetsGenericosUseCases';
import { DatasetGenericoRepository } from '../../ports/out/persistencia/repositorios/DatasetGenericoRepository';
import { DatasetGenericoNoEncontradoError } from '../../../domain/errors/DatasetGenericoNoEncontradoError';

// RF-136 (M-12): todas las versiones de la familia a la que pertenece el
// dataset, de la 0 (el original) en adelante, cada una con las operaciones
// de limpieza que la produjeron.
export class ListarVersionesDeDataset implements ListarVersionesDeDatasetUseCase {
  constructor(private readonly datasetGenericoRepository: DatasetGenericoRepository) {}

  async ejecutar(analistaId: string, datasetId: string): Promise<ResumenDeVersion[]> {
    const dataset = await this.datasetGenericoRepository.buscarPorId(datasetId, analistaId);
    if (!dataset) {
      throw new DatasetGenericoNoEncontradoError();
    }

    const [versiones, bitacora] = await Promise.all([
      this.datasetGenericoRepository.listarVersiones(dataset.idDelOriginal, analistaId),
      this.datasetGenericoRepository.listarBitacora(dataset.idDelOriginal, analistaId)
    ]);

    return versiones.map((version) => ({
      datasetId: version.id,
      version: version.version,
      versionBase: version.linaje.versionBase,
      esOriginal: version.esOriginal,
      fecha: version.fechaCarga,
      totalFilas: version.totalFilas,
      totalColumnas: version.columnas.length,
      operaciones: version.esOriginal
        ? []
        : bitacora
            .filter((entrada) => entrada.versionResultado === version.version)
            .map((entrada) => ({
              operacion: entrada.operacion,
              variable: entrada.variable,
              metodo: entrada.metodo,
              registrosAfectados: entrada.registrosAfectados
            }))
    }));
  }
}
