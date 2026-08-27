import { FiltroVulnerabilidad } from '../../domain/value-objects/FiltroVulnerabilidad';
import { ExportarBusquedaFiltradaUseCase } from '../ports/in/ExportarBusquedaFiltradaUseCase';
import { VulnerabilidadRepository } from '../ports/out/VulnerabilidadRepository';
import { construirExcelAgrupadoPorSeveridad } from '../../infrastructure/adapters/out/dataset/ExportadorExcelAgrupado';

// RF-90: mismo formato .xlsx agrupado por severidad que ExportarDatasetValidado,
// pero aplicado al subconjunto que arroja el filtro en vez de al dataset completo.
export class ExportarBusquedaFiltrada implements ExportarBusquedaFiltradaUseCase {
  constructor(private readonly vulnerabilidadRepository: VulnerabilidadRepository) {}

  async ejecutar(filtro: FiltroVulnerabilidad, analistaId: string): Promise<Buffer> {
    // Sin paginación (undefined): esta exportación necesita TODAS las filas
    // que matchean el filtro, no una página (ver comentario de Paginacion en
    // VulnerabilidadRepository.ts).
    const items = await this.vulnerabilidadRepository.buscarConFiltros(filtro, analistaId);
    return construirExcelAgrupadoPorSeveridad(items);
  }
}
