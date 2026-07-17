import { Vulnerabilidad } from '../../domain/entities/Vulnerabilidad';
import { CompararPorSoftwareUseCase } from '../ports/in/CompararPorSoftwareUseCase';
import { VulnerabilidadRepository } from '../ports/out/VulnerabilidadRepository';
import { compararGrupos } from '../../domain/services/ComparadorDeCategorias';

export class CompararPorSoftware implements CompararPorSoftwareUseCase {
  constructor(private readonly vulnerabilidadRepository: VulnerabilidadRepository) {}

  async ejecutar(categoriaA: string, categoriaB: string, vulnerabilidades?: Vulnerabilidad[]): Promise<unknown> {
    if (vulnerabilidades) {
      const softwareA = vulnerabilidades.filter((item) => item.software === categoriaA).map((item) => item.cvssScore.valor);
      const softwareB = vulnerabilidades.filter((item) => item.software === categoriaB).map((item) => item.cvssScore.valor);
      return compararGrupos(softwareA, softwareB);
    }

    const softwareA = await this.vulnerabilidadRepository.listarPorSoftware(categoriaA);
    const softwareB = await this.vulnerabilidadRepository.listarPorSoftware(categoriaB);

    return compararGrupos(softwareA.map((item) => item.cvssScore.valor), softwareB.map((item) => item.cvssScore.valor));
  }
}
