import { Vulnerabilidad } from '../../domain/entities/Vulnerabilidad';
import { FiltrarPorSeveridadUseCase } from '../ports/in/FiltrarPorSeveridadUseCase';
import { VulnerabilidadRepository } from '../ports/out/VulnerabilidadRepository';

export class FiltrarPorSeveridad implements FiltrarPorSeveridadUseCase {
  constructor(private readonly vulnerabilidadRepository: VulnerabilidadRepository) {}

  async ejecutar(severidad: string, analistaId: string): Promise<Vulnerabilidad[]> {
    return this.vulnerabilidadRepository.filtrarPorSeveridad(severidad, analistaId);
  }
}
