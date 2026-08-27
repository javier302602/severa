import { Vulnerabilidad } from '../../domain/entities/Vulnerabilidad';
import { CompararPorTipoDeVulnerabilidadUseCase } from '../ports/in/CompararPorTipoDeVulnerabilidadUseCase';
import { VulnerabilidadRepository } from '../ports/out/VulnerabilidadRepository';
import { compararGrupos } from '../../domain/services/ComparadorDeCategorias';

export class CompararPorTipoDeVulnerabilidad implements CompararPorTipoDeVulnerabilidadUseCase {
  constructor(private readonly vulnerabilidadRepository: VulnerabilidadRepository) {}

  async ejecutar(categoriaA: string, categoriaB: string, analistaId: string, vulnerabilidades?: Vulnerabilidad[]): Promise<unknown> {
    if (vulnerabilidades) {
      const tipoA = vulnerabilidades.filter((item) => item.tipoVulnerabilidad === categoriaA).map((item) => item.cvssScore.valor);
      const tipoB = vulnerabilidades.filter((item) => item.tipoVulnerabilidad === categoriaB).map((item) => item.cvssScore.valor);
      return compararGrupos(tipoA, tipoB);
    }

    const tipoA = await this.vulnerabilidadRepository.listarPorTipoVulnerabilidad(categoriaA, analistaId);
    const tipoB = await this.vulnerabilidadRepository.listarPorTipoVulnerabilidad(categoriaB, analistaId);

    return compararGrupos(tipoA.map((item) => item.cvssScore.valor), tipoB.map((item) => item.cvssScore.valor));
  }
}
