import { ConsultarBitacoraDeDatasetUseCase } from '../../ports/in/module_limpieza_calidad_datos/LimpiezaDeDatasetUseCases';
import { DatasetGenericoRepository } from '../../ports/out/persistencia/repositorios/DatasetGenericoRepository';
import { EntradaDeBitacoraDeDataset } from '../../../domain/entities/EntradaDeBitacoraDeDataset';
import { DatasetGenericoNoEncontradoError } from '../../../domain/errors/DatasetGenericoNoEncontradoError';

// RF-123 (M-15, Ronda 2): "el analista puede consultar la bitácora completa
// de cualquier dataset procesado". Se puede pedir con el id del original o
// con el de cualquier versión: la respuesta es siempre la historia de toda la
// familia, en orden cronológico.
export class ConsultarBitacoraDeDataset implements ConsultarBitacoraDeDatasetUseCase {
  constructor(private readonly datasetGenericoRepository: DatasetGenericoRepository) {}

  async ejecutar(analistaId: string, datasetId: string): Promise<EntradaDeBitacoraDeDataset[]> {
    const dataset = await this.datasetGenericoRepository.buscarPorId(datasetId, analistaId);
    if (!dataset) {
      throw new DatasetGenericoNoEncontradoError();
    }
    return this.datasetGenericoRepository.listarBitacora(dataset.idDelOriginal, analistaId);
  }
}
