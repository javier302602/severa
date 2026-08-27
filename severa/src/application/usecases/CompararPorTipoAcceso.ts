import { Vulnerabilidad } from '../../domain/entities/Vulnerabilidad';
import { CompararPorTipoAccesoUseCase } from '../ports/in/CompararPorTipoAccesoUseCase';
import { VulnerabilidadRepository } from '../ports/out/VulnerabilidadRepository';
import { compararGrupos } from '../../domain/services/ComparadorDeCategorias';

export class CompararPorTipoAcceso implements CompararPorTipoAccesoUseCase {
  constructor(private readonly vulnerabilidadRepository: VulnerabilidadRepository) {}

  async ejecutar(analistaId: string, vulnerabilidades?: Vulnerabilidad[]): Promise<unknown> {
    if (vulnerabilidades) {
      const remoto = vulnerabilidades.filter((item) => item.tipoAcceso?.valor === 'Remoto').map((item) => item.cvssScore.valor);
      const local = vulnerabilidades.filter((item) => item.tipoAcceso?.valor === 'Local').map((item) => item.cvssScore.valor);
      return compararGrupos(remoto, local);
    }

    const remoto = await this.vulnerabilidadRepository.listarPorTipoAcceso('Remoto', analistaId);
    const local = await this.vulnerabilidadRepository.listarPorTipoAcceso('Local', analistaId);

    return compararGrupos(remoto.map((item) => item.cvssScore.valor), local.map((item) => item.cvssScore.valor));
  }
}
