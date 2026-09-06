import { Vulnerabilidad } from '../../../domain/entities/Vulnerabilidad';
import { GenerarDistribucionFrecuenciasUseCase } from '../../ports/in/module_distribucion_frecuencias/GenerarDistribucionFrecuenciasUseCase';
import { VulnerabilidadRepository } from '../../ports/out/persistencia/repositorios/VulnerabilidadRepository';
import { generarTablaAgrupada, generarTablaSinAgrupar } from '../../../domain/services/descriptive-statistics/DistribucionFrecuencias';

export class GenerarDistribucionFrecuencias implements GenerarDistribucionFrecuenciasUseCase {
  constructor(private readonly vulnerabilidadRepository: VulnerabilidadRepository) {}

  async ejecutar(tipo: 'agrupada' | 'sinAgrupar', analistaId: string, vulnerabilidades?: Vulnerabilidad[]): Promise<unknown> {
    const lista = vulnerabilidades ?? await this.vulnerabilidadRepository.listar(analistaId);
    const scores = lista.map((item) => item.cvssScore.valor);

    if (tipo === 'agrupada') {
      return generarTablaAgrupada(scores);
    }

    return generarTablaSinAgrupar(scores);
  }
}
