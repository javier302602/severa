import { FiltroVulnerabilidad } from '../../domain/value-objects/FiltroVulnerabilidad';
import { ExportarBusquedaFiltradaUseCase } from '../ports/in/ExportarBusquedaFiltradaUseCase';
import { VulnerabilidadRepository } from '../ports/out/VulnerabilidadRepository';

// RF-90: mismo formato de línea CSV que ExportarDatasetValidado (Sprint 03),
// pero aplicado al subconjunto que arroja el filtro en vez de al dataset completo.
export class ExportarBusquedaFiltrada implements ExportarBusquedaFiltradaUseCase {
  constructor(private readonly vulnerabilidadRepository: VulnerabilidadRepository) {}

  async ejecutar(filtro: FiltroVulnerabilidad): Promise<string> {
    const items = await this.vulnerabilidadRepository.buscarConFiltros(filtro);
    return items.map((item) => `${item.cve.valor},${item.cvssScore.valor},${item.descripcion}`).join('\n');
  }
}
