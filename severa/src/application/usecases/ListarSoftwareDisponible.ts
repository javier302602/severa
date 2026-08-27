import { ListarSoftwareDisponibleUseCase } from '../ports/in/ListarSoftwareDisponibleUseCase';
import { VulnerabilidadRepository } from '../ports/out/VulnerabilidadRepository';

export class ListarSoftwareDisponible implements ListarSoftwareDisponibleUseCase {
  constructor(private readonly vulnerabilidadRepository: VulnerabilidadRepository) {}

  async ejecutar(analistaId: string): Promise<string[]> {
    return this.vulnerabilidadRepository.listarSoftwareDisponible(analistaId);
  }
}
