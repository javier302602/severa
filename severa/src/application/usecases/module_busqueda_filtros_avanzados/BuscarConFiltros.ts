import { Vulnerabilidad } from '../../../domain/entities/Vulnerabilidad';
import { FiltroVulnerabilidad } from '../../../domain/shared/value-objects/FiltroVulnerabilidad';
import { BuscarConFiltrosUseCase } from '../../ports/in/module_busqueda_filtros_avanzados/BuscarConFiltrosUseCase';
import { VulnerabilidadRepository, Paginacion } from '../../ports/out/persistencia/repositorios/VulnerabilidadRepository';

export class BuscarConFiltros implements BuscarConFiltrosUseCase {
  constructor(private readonly vulnerabilidadRepository: VulnerabilidadRepository) {}

  async ejecutar(filtro: FiltroVulnerabilidad, analistaId: string, paginacion?: Paginacion): Promise<Vulnerabilidad[]> {
    return this.vulnerabilidadRepository.buscarConFiltros(filtro, analistaId, paginacion);
  }
}
