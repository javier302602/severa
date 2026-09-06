import { Vulnerabilidad } from '../../../domain/entities/Vulnerabilidad';
import { FiltrarPorSeveridadUseCase } from '../../ports/in/module_priorizacion_clasificacion/FiltrarPorCategoriaClasificacionUseCase';
import { VulnerabilidadRepository } from '../../ports/out/persistencia/repositorios/VulnerabilidadRepository';

export class FiltrarPorSeveridad implements FiltrarPorSeveridadUseCase {
  constructor(private readonly vulnerabilidadRepository: VulnerabilidadRepository) {}

  async ejecutar(severidad: string, analistaId: string): Promise<Vulnerabilidad[]> {
    return this.vulnerabilidadRepository.filtrarPorSeveridad(severidad, analistaId);
  }
}
