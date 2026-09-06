import { ListarSoftwareDisponibleUseCase } from '../../ports/in/module_comparacion_categorias/ListarSoftwareDisponibleUseCase';
import { VulnerabilidadRepository } from '../../ports/out/persistencia/repositorios/VulnerabilidadRepository';

export class ListarSoftwareDisponible implements ListarSoftwareDisponibleUseCase {
  constructor(private readonly vulnerabilidadRepository: VulnerabilidadRepository) {}

  async ejecutar(analistaId: string): Promise<string[]> {
    return this.vulnerabilidadRepository.listarSoftwareDisponible(analistaId);
  }
}
