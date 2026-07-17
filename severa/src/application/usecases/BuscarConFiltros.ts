import { Vulnerabilidad } from '../../domain/entities/Vulnerabilidad';
import { FiltroVulnerabilidad } from '../../domain/value-objects/FiltroVulnerabilidad';
import { BuscarConFiltrosUseCase } from '../ports/in/BuscarConFiltrosUseCase';
import { VulnerabilidadRepository } from '../ports/out/VulnerabilidadRepository';

export class BuscarConFiltros implements BuscarConFiltrosUseCase {
  constructor(private readonly vulnerabilidadRepository: VulnerabilidadRepository) {}

  async ejecutar(filtro: FiltroVulnerabilidad): Promise<Vulnerabilidad[]> {
    return this.vulnerabilidadRepository.buscarConFiltros(filtro);
  }
}
