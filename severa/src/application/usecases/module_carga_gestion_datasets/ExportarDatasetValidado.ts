import { ExportarDatasetValidadoUseCase } from '../../ports/in/module_carga_gestion_datasets/ExportarDatasetValidadoUseCase';
import { VulnerabilidadRepository } from '../../ports/out/persistencia/repositorios/VulnerabilidadRepository';
import { construirExcelAgrupadoPorSeveridad } from '../../../infrastructure/adapters/out/dataset/parsers/ExportadorExcelAgrupado';

export class ExportarDatasetValidado implements ExportarDatasetValidadoUseCase {
  constructor(private readonly vulnerabilidadRepository: VulnerabilidadRepository) {}

  async ejecutar(analistaId: string): Promise<Buffer> {
    const items = await this.vulnerabilidadRepository.listar(analistaId);
    return construirExcelAgrupadoPorSeveridad(items);
  }
}
