import { Vulnerabilidad } from '../../domain/entities/Vulnerabilidad';
import { GenerarDistribucionFrecuenciasUseCase } from '../ports/in/GenerarDistribucionFrecuenciasUseCase';
import { VulnerabilidadRepository } from '../ports/out/VulnerabilidadRepository';
import { generarTablaAgrupada, generarTablaSinAgrupar } from '../../domain/services/DistribucionFrecuencias';

export class GenerarDistribucionFrecuencias implements GenerarDistribucionFrecuenciasUseCase {
  constructor(private readonly vulnerabilidadRepository: VulnerabilidadRepository) {}

  async ejecutar(tipo: 'agrupada' | 'sinAgrupar', vulnerabilidades?: Vulnerabilidad[]): Promise<unknown> {
    const lista = vulnerabilidades ?? await this.vulnerabilidadRepository.listar();
    const scores = lista.map((item) => item.cvssScore.valor);

    if (tipo === 'agrupada') {
      return generarTablaAgrupada(scores);
    }

    return generarTablaSinAgrupar(scores);
  }
}
