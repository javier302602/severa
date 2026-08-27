import { Vulnerabilidad } from '../../domain/entities/Vulnerabilidad';
import { CompararPorSoftwareUseCase } from '../ports/in/CompararPorSoftwareUseCase';
import { VulnerabilidadRepository } from '../ports/out/VulnerabilidadRepository';
import { compararGrupos } from '../../domain/services/ComparadorDeCategorias';

// Coincidencia parcial, no exacta (2026-07-19, bug real reportado: "Apache
// Log4j" vs "log4j" no comparaban) — mismo criterio que la consulta real
// (listarPorSoftware, ILIKE '%...%') para que el camino en memoria (usado
// con vulnerabilidades ya cargadas, ej. AnalisisDataset) se comporte igual.
function coincideSoftware(item: Vulnerabilidad, categoria: string): boolean {
  return item.software.toLowerCase().includes(categoria.toLowerCase());
}

export class CompararPorSoftware implements CompararPorSoftwareUseCase {
  constructor(private readonly vulnerabilidadRepository: VulnerabilidadRepository) {}

  async ejecutar(categoriaA: string, categoriaB: string, analistaId: string, vulnerabilidades?: Vulnerabilidad[]): Promise<unknown> {
    if (vulnerabilidades) {
      const softwareA = vulnerabilidades.filter((item) => coincideSoftware(item, categoriaA)).map((item) => item.cvssScore.valor);
      const softwareB = vulnerabilidades.filter((item) => coincideSoftware(item, categoriaB)).map((item) => item.cvssScore.valor);
      return compararGrupos(softwareA, softwareB);
    }

    const softwareA = await this.vulnerabilidadRepository.listarPorSoftware(categoriaA, analistaId);
    const softwareB = await this.vulnerabilidadRepository.listarPorSoftware(categoriaB, analistaId);

    return compararGrupos(softwareA.map((item) => item.cvssScore.valor), softwareB.map((item) => item.cvssScore.valor));
  }
}
