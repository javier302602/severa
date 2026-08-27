import { ExportarDatasetValidadoUseCase } from '../ports/in/ExportarDatasetValidadoUseCase';
import { VulnerabilidadRepository } from '../ports/out/VulnerabilidadRepository';
import { construirExcelAgrupadoPorSeveridad } from '../../infrastructure/adapters/out/dataset/ExportadorExcelAgrupado';

export class ExportarDatasetValidado implements ExportarDatasetValidadoUseCase {
  constructor(private readonly vulnerabilidadRepository: VulnerabilidadRepository) {}

  async ejecutar(analistaId: string): Promise<Buffer> {
    const items = await this.vulnerabilidadRepository.listar(analistaId);
    return construirExcelAgrupadoPorSeveridad(items);
  }
}
