import {
  VerificarIntegridadDatasetUseCase,
  ResultadoVerificacionIntegridad
} from '../../ports/in/module_carga_gestion_datasets/VerificarIntegridadDatasetUseCase';
import { DatasetGenericoRepository } from '../../ports/out/persistencia/repositorios/DatasetGenericoRepository';
import { DatasetGenericoNoEncontradoError } from '../../../domain/errors/DatasetGenericoNoEncontradoError';
import { calcularHashSha256Archivo } from '../../utils/CalcularHashSha256Archivo';

// RF-135: reutiliza el mismo cálculo por streaming que AnalizarDatasetGenerico.ts
// (calcularHashSha256Archivo) — mismo motivo (evitar leer el archivo completo
// en memoria de una sola vez), aplicado acá al archivo re-subido para comparar.
export class VerificarIntegridadDataset implements VerificarIntegridadDatasetUseCase {
  constructor(private readonly datasetGenericoRepository: DatasetGenericoRepository) {}

  async ejecutar(datasetId: string, analistaId: string, rutaArchivoAVerificar: string): Promise<ResultadoVerificacionIntegridad> {
    const dataset = await this.datasetGenericoRepository.buscarPorId(datasetId, analistaId);
    if (!dataset) {
      throw new DatasetGenericoNoEncontradoError();
    }

    const hashActual = await calcularHashSha256Archivo(rutaArchivoAVerificar);

    return {
      coincide: dataset.hashOriginalSha256 !== null && dataset.hashOriginalSha256 === hashActual,
      hashActual,
      hashOriginal: dataset.hashOriginalSha256
    };
  }
}
