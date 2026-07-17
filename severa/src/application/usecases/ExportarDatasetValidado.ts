import { ExportarDatasetValidadoUseCase } from '../ports/in/ExportarDatasetValidadoUseCase';
import { VulnerabilidadRepository } from '../ports/out/VulnerabilidadRepository';

export class ExportarDatasetValidado implements ExportarDatasetValidadoUseCase {
  constructor(private readonly vulnerabilidadRepository: VulnerabilidadRepository) {}

  async ejecutar(): Promise<string> {
    const items = await this.vulnerabilidadRepository.listar();
    return items.map((item) => `${item.cve.valor},${item.cvssScore.valor},${item.descripcion}`).join('\n');
  }
}
