import { VulnerabilidadRepository } from '../ports/out/VulnerabilidadRepository';
import { DatasetInvalidoError } from '../../domain/errors/DatasetInvalidoError';
import { FilaImportable, FilaRechazada } from '../../infrastructure/adapters/out/dataset/LectorExcelDataset';
import { ImportarDatasetUseCase, ResumenImportacion } from '../ports/in/ImportarDatasetUseCase';

export class ImportarDataset implements ImportarDatasetUseCase {
  constructor(private readonly vulnerabilidadRepository: VulnerabilidadRepository) {}

  async ejecutar(resultado: { importables: FilaImportable[]; rechazadas: FilaRechazada[]; errores?: string[] } | undefined): Promise<ResumenImportacion> {
    if (!resultado) {
      throw new DatasetInvalidoError('No se recibió un resultado de lectura del dataset');
    }

    const importables = resultado.importables ?? [];
    const rechazadas = resultado.rechazadas ?? [];

    for (const item of importables) {
      await this.vulnerabilidadRepository.guardar(item.vulnerabilidad);
    }

    return {
      importados: importables.length,
      rechazados: rechazadas.length,
      errores: [...(resultado.errores ?? []), ...rechazadas.map((r) => r.error)]
    };
  }
}
