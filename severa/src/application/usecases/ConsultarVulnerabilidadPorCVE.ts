import { Vulnerabilidad } from '../../domain/entities/Vulnerabilidad';
import { ConsultarVulnerabilidadPorCVEUseCase } from '../ports/in/ConsultarVulnerabilidadPorCVEUseCase';
import { VulnerabilidadRepository } from '../ports/out/VulnerabilidadRepository';

export class ConsultarVulnerabilidadPorCVE implements ConsultarVulnerabilidadPorCVEUseCase {
  constructor(private readonly vulnerabilidadRepository: VulnerabilidadRepository) {}

  async ejecutar(cve: string, analistaId: string): Promise<Vulnerabilidad | null> {
    return this.vulnerabilidadRepository.buscarPorCve(cve, analistaId);
  }
}
